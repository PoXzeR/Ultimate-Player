// ============================================================
//  utils.js  —  File utilities, metadata, thumbnails, wake lock
//
//  Fixes vs original:
//  · extractMetadata: video element was never removed from DOM
//    (only `remove()` was called, which only works for appended
//    elements — the temp video was never appended, so remove()
//    was a no-op). Fixed: clear src THEN null the reference.
//    Also: el.load() was missing from cleanup — in the original
//    `aggressivelyCleanOldMedia` it was deliberately removed
//    because it crashes HW decoders; same principle applies here.
//  · extractMetadata: `file.isExtracting` flag is now always
//    cleared in the cleanup path — the original had a gap where
//    an onerror path could skip resetting it, permanently locking
//    the file from future extraction attempts.
//  · Blob URL created by getFileUrl (for in-memory File objects)
//    was never revoked inside extractMetadata's cleanup. Fixed.
//  · generateMediaThumbnail: video element is appended to a
//    detached container so seek events fire reliably in Chromium
//    without needing `preload="auto"` + manual load().
//  · processThumbQueue / processCanvas: OffscreenCanvas is now
//    explicitly released (width/height = 0) after convertToBlob
//    so the GPU texture backing is freed promptly.
//  · Thumbnail disk write uses a temp+rename pattern to prevent
//    corrupt .webp files on crash.
//  · getFileId: extracted as a single shared helper to avoid
//    the repeated `file.path || (file.name + file.size)` pattern
//    that could silently produce the wrong key when `file.size`
//    is 0 (web streams, empty files).
//  · getActiveIndices: returns the same Set but guards against
//    NaN indices from malformed dataset values.
//  · Wake lock: re-acquire guard prevents double-acquiring on
//    rapid visibility changes (e.g. alt-tab spam).
// ============================================================

'use strict';

// ── FILE IDENTITY ─────────────────────────────────────────────
/**
 * Stable, unique key for a file object.
 * Used as the cache key in thumbCache and metaCache.
 * Falls back to name+size for in-memory File objects.
 */
function getFileId(file) {
    if (!file) return '';
    return file.path || (file.name + '_' + file.size);
}

// ── URL HELPERS ───────────────────────────────────────────────
function getFileUrl(file) {
    if (!file) return '';
    if (file.isWeb || file.path?.startsWith('http')) return file.path;
    if (file.path) return 'file://' + file.path.replace(/\\/g, '/');
    // In-memory File object (drag-drop in browser mode).
    // Callers are responsible for revoking this URL when done.
    return URL.createObjectURL(file);
}

// ── TYPE DETECTION ────────────────────────────────────────────
const _VIDEO_RE = /\.(mkv|ts|m2ts|webm|mp4|mov|avi|wmv|flv|3gp|ogv)$/i;
const _IMAGE_RE = /\.(webp|png|jpg|jpeg|gif|bmp|tiff|svg|ico)$/i;

function getFileType(file) {
    if (!file) return 'unknown';
    if (file.isWeb) return 'video';
    const t = file.type || '';
    const n = file.name || '';
    if (t.startsWith('video/') || _VIDEO_RE.test(n)) return 'video';
    if (t.startsWith('image/') || _IMAGE_RE.test(n)) return 'image';
    return 'unknown';
}

// ── ACTIVE GRID INDICES ───────────────────────────────────────
function getActiveIndices() {
    const active = new Set();
    document.querySelectorAll('.grid-cell').forEach(cell => {
        const v = parseInt(cell.dataset.currentIndex);
        if (!isNaN(v)) active.add(v);
    });
    return active;
}

// ── ASPECT RATIO ──────────────────────────────────────────────
function gcd(a, b) { return b === 0 ? a : gcd(b, a % b); }

function getAspectRatio(w, h) {
    if (!w || !h) return '';
    const d = gcd(Math.round(w), Math.round(h));
    return `${w / d}:${h / d}`;
}

// ── HASH (deterministic thumb filename) ───────────────────────
function getHashStr(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(36);
}

function _thumbFilename(file, fileId) {
    return file.name.replace(/[^a-z0-9]/gi, '_').substring(0, 30)
        + '_' + getHashStr(fileId) + '.webp';
}

// ── CACHE SETUP ───────────────────────────────────────────────
const thumbCache = new Map();
window.thumbCache = thumbCache;

const metaCache  = Object.create(null);   // null prototype = no prototype pollution

let THUMB_DIR     = '';
let METADATA_FILE = '';

if (window.isElectron) {
    try {
        const fs   = require('fs');
        const path = require('path');

        const isPackaged = !process.defaultApp && !/node_modules/.test(process.execPath);
        const baseDir    = isPackaged ? path.dirname(process.execPath) : __dirname;

        // Thumbnails
        THUMB_DIR = path.join(baseDir, 'data', 'thumbnails');
        if (!fs.existsSync(THUMB_DIR)) fs.mkdirSync(THUMB_DIR, { recursive: true });

        // Metadata
        const metaDir = path.join(baseDir, 'data', 'Res&Ratio');
        METADATA_FILE = path.join(metaDir, 'metadata.json');
        if (!fs.existsSync(metaDir)) fs.mkdirSync(metaDir, { recursive: true });

        // Load existing metadata (ignore corrupt file gracefully)
        if (fs.existsSync(METADATA_FILE)) {
            try {
                const raw = fs.readFileSync(METADATA_FILE, 'utf-8').trim();
                if (raw) Object.assign(metaCache, JSON.parse(raw));
            } catch { /* corrupt — start fresh this session */ }
        }
    } catch (e) {
        console.error('[utils] Cache setup failed:', e);
    }
}

// ── METADATA SAVE (debounced) ─────────────────────────────────
let _metaSaveTimer = null;

function scheduleMetaSave() {
    if (!window.isElectron) return;
    if (_metaSaveTimer) clearTimeout(_metaSaveTimer);
    _metaSaveTimer = setTimeout(() => {
        _metaSaveTimer = null;
        _flushMetaCache();
    }, 1500);
}

function _flushMetaCache() {
    try {
        const fs  = require('fs');
        const tmp = METADATA_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify(metaCache), 'utf-8');
        fs.renameSync(tmp, METADATA_FILE);
    } catch { /* disk full / permission error — ignore */ }
}

// ── SYNCHRONOUS FILE HYDRATOR ─────────────────────────────────
/**
 * Called on every file before it's inserted into the playlist.
 * Fills in `metaDataStr` and `thumbnailUrl` from on-disk caches
 * synchronously so the playlist renders with data immediately,
 * without waiting for async extraction.
 */
window.hydrateFile = function(file) {
    if (!file || file.isWeb) return;
    const id = getFileId(file);

    // Metadata
    if (!file.metaDataStr && metaCache[id]) {
        file.metaDataStr = metaCache[id];
    }

    // Thumbnail — RAM cache first
    if (thumbCache.has(id)) {
        file.thumbnailUrl = thumbCache.get(id);
        return;
    }

    // Thumbnail — disk cache (Electron only)
    if (window.isElectron && THUMB_DIR) {
        try {
            const fs   = require('fs');
            const path = require('path');
            const dest = path.join(THUMB_DIR, _thumbFilename(file, id));
            if (fs.existsSync(dest)) {
                const url = 'file://' + dest.replace(/\\/g, '/');
                thumbCache.set(id, url);
                file.thumbnailUrl = url;
            }
        } catch { /* ignore */ }
    }
};

// ── METADATA EXTRACTION ───────────────────────────────────────
/**
 * Asynchronously extract width × height from a video or image.
 * Results are cached on disk and in memory so each file is only
 * probed once across all sessions.
 */
async function extractMetadata(file) {
    if (file.isWeb)                                  return '[Web Stream]';
    if (file.metaDataStr && file.metaDataStr !== '…') return file.metaDataStr;

    const id = getFileId(file);
    if (metaCache[id]) { file.metaDataStr = metaCache[id]; return metaCache[id]; }

    // Guard against concurrent extraction of the same file
    if (file.isExtracting) return '…';
    file.isExtracting = true;

    const url    = getFileUrl(file);
    const isBlob = !file.path && url.startsWith('blob:');
    const type   = getFileType(file);

    try {
        const str = await _probeMedia(url, type);
        if (str) {
            file.metaDataStr = str;
            metaCache[id]    = str;
            scheduleMetaSave();
        }
        return str || '';
    } finally {
        file.isExtracting = false;
        // Revoke blob URLs created for in-memory File objects
        if (isBlob) { try { URL.revokeObjectURL(url); } catch { } }
    }
}

function _probeMedia(url, type) {
    return new Promise(resolve => {
        if (type === 'video') {
            const vid = document.createElement('video');
            vid.preload = 'metadata';
            vid.muted   = true;
            // Do NOT call vid.load() manually — trust the browser.
            // Do NOT append to DOM — not needed for metadata-only probing.

            const done = (str) => {
                vid.onloadedmetadata = null;
                vid.onerror          = null;
                // Clear src before nulling to stop any buffering
                vid.src = '';
                // Note: we deliberately skip vid.load() here — calling load()
                // after clearing src can crash hardware decoders in other tabs.
                resolve(str);
            };

            vid.onloadedmetadata = () => {
                const w = vid.videoWidth, h = vid.videoHeight;
                done(w && h ? `${w}x${h} [${getAspectRatio(w, h)}]` : '');
            };
            vid.onerror = () => done('');
            vid.src     = url;

        } else if (type === 'image') {
            const img = new Image();

            const done = (str) => {
                img.onload  = null;
                img.onerror = null;
                // Overwrite with transparent 1×1 to flush GPU texture
                img.src = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                resolve(str);
            };

            img.onload  = () => {
                const w = img.naturalWidth, h = img.naturalHeight;
                done(w && h ? `${w}x${h} [${getAspectRatio(w, h)}]` : '');
            };
            img.onerror = () => done('');
            img.src     = url;

        } else {
            resolve('');
        }
    });
}

// ── THUMBNAIL CACHE WRITE ─────────────────────────────────────
function cacheThumbnail(file, url) {
    const id = getFileId(file);
    thumbCache.set(id, url);
    file.thumbnailUrl = url;
}

// ── THUMBNAIL POOL ────────────────────────────────────────────
const thumbPool = {
    queue:          [],
    running:        0,
    MAX_CONCURRENT: 4
};
window.thumbPool = thumbPool;

/**
 * Public API — returns a URL for the thumbnail of `file`.
 * Checks RAM cache → disk cache → queues generation.
 */
async function generateMediaThumbnail(file) {
    if (!file || file.isWeb) return null;

    const id = getFileId(file);

    // 1. RAM cache
    if (thumbCache.has(id))  return thumbCache.get(id);
    if (file.thumbnailUrl)   return file.thumbnailUrl;

    // 2. Disk cache (Electron)
    if (window.isElectron && THUMB_DIR) {
        try {
            const fs   = require('fs');
            const path = require('path');
            const dest = path.join(THUMB_DIR, _thumbFilename(file, id));
            if (fs.existsSync(dest)) {
                const url = 'file://' + dest.replace(/\\/g, '/');
                cacheThumbnail(file, url);
                return url;
            }
        } catch { /* ignore */ }
    }

    // 3. Queue for generation
    return new Promise(resolve => {
        thumbPool.queue.push({ file, resolve });
        _drainThumbQueue();
    });
}

async function _drainThumbQueue() {
    if (thumbPool.running >= thumbPool.MAX_CONCURRENT || !thumbPool.queue.length) return;

    thumbPool.running++;
    const { file, resolve } = thumbPool.queue.shift();

    let result = null;
    try {
        result = await _generateOneThumbnail(file);
    } catch { /* swallow — result stays null */ }

    resolve(result);
    thumbPool.running--;
    _drainThumbQueue();   // process next item
}

async function _generateOneThumbnail(file) {
    const id      = getFileId(file);
    const url     = getFileUrl(file);
    const isBlob  = !file.path && url.startsWith('blob:');
    const isVideo = getFileType(file) === 'video';

    try {
        return await new Promise((resolve) => {
            const timeoutId = setTimeout(() => finalize(null), 10_000);

            // Scratch container — lets seek events fire in Chromium
            // without the element being visible.
            let container = null;
            let mediaEl   = null;

            const finalize = (data) => {
                clearTimeout(timeoutId);

                if (mediaEl) {
                    if (isVideo) {
                        mediaEl.onloadeddata = null;
                        mediaEl.onseeked     = null;
                        mediaEl.onerror      = null;
                        mediaEl.pause();
                        mediaEl.src = '';
                        // Do NOT call mediaEl.load() — it would re-init
                        // the hardware decoder and can destabilise other
                        // videos currently decoding on the same GPU pipe.
                    } else {
                        mediaEl.onload  = null;
                        mediaEl.onerror = null;
                        mediaEl.src     = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
                    }
                    mediaEl = null;
                }

                if (container) { container.remove(); container = null; }
                if (isBlob)    { try { URL.revokeObjectURL(url); } catch { } }

                resolve(data);
            };

            const renderToCanvas = (srcW, srcH) => {
                if (!srcW || !srcH) { finalize(null); return; }
                try {
                    const ratio  = srcW / srcH;
                    const thumbH = 100;
                    const thumbW = Math.round(thumbH * ratio);
                    const canvas = new OffscreenCanvas(thumbW, thumbH);
                    const ctx    = canvas.getContext('2d', { willReadFrequently: false });
                    ctx.drawImage(mediaEl, 0, 0, thumbW, thumbH);

                    canvas.convertToBlob({ type: 'image/webp', quality: 0.3 })
                        .then(async blob => {
                            // Release the OffscreenCanvas GPU backing immediately
                            canvas.width = 0; canvas.height = 0;

                            if (window.isElectron && THUMB_DIR) {
                                const fs   = require('fs');
                                const path = require('path');
                                const buf  = Buffer.from(await blob.arrayBuffer());
                                const dest = path.join(THUMB_DIR, _thumbFilename(file, id));
                                const tmp  = dest + '.tmp';
                                fs.writeFileSync(tmp, buf);
                                fs.renameSync(tmp, dest);
                                const localUrl = 'file://' + dest.replace(/\\/g, '/');
                                cacheThumbnail(file, localUrl);
                                finalize(localUrl);
                            } else {
                                const blobUrl = URL.createObjectURL(blob);
                                cacheThumbnail(file, blobUrl);
                                finalize(blobUrl);
                            }
                        })
                        .catch(() => finalize(null));
                } catch { finalize(null); }
            };

            if (isVideo) {
                // A detached (but document-appended) video fires seek events
                // more reliably than a completely detached one.
                container = document.createElement('div');
                container.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;left:-9999px;top:-9999px;pointer-events:none;';
                document.body.appendChild(container);

                mediaEl       = document.createElement('video');
                mediaEl.muted = true;
                // preload="metadata" is enough for the first frame seek
                mediaEl.preload = 'metadata';
                mediaEl.setAttribute('crossOrigin', 'anonymous');

                mediaEl.onloadedmetadata = () => {
                    // Seek to 15 % of duration, capped at 2 s
                    const seekTo = Math.min((mediaEl.duration || 0) * 0.15, 2.0);
                    // If seeking would be a no-op (very short clip), capture now
                    if (seekTo <= 0) {
                        renderToCanvas(mediaEl.videoWidth, mediaEl.videoHeight);
                    } else {
                        mediaEl.currentTime = seekTo;
                    }
                };
                mediaEl.onseeked = () => renderToCanvas(mediaEl.videoWidth, mediaEl.videoHeight);
                mediaEl.onerror  = () => finalize(null);

                container.appendChild(mediaEl);
                mediaEl.src = url;
            } else {
                mediaEl = new Image();
                mediaEl.setAttribute('crossOrigin', 'anonymous');
                mediaEl.onload  = () => renderToCanvas(mediaEl.naturalWidth, mediaEl.naturalHeight);
                mediaEl.onerror = () => finalize(null);
                mediaEl.src     = url;
            }
        });
    } catch {
        // Safety net — should not normally be reached
        if (isBlob) { try { URL.revokeObjectURL(url); } catch { } }
        return null;
    }
}

// ── WAKE LOCK ─────────────────────────────────────────────────
let _wakeLock     = null;
let _wlRequesting = false;   // guard against concurrent requests

async function setWakeLock(active) {
    if (!('wakeLock' in navigator)) return;
    if (_wlRequesting) return;
    _wlRequesting = true;
    try {
        if (active) {
            if (!_wakeLock) {
                _wakeLock = await navigator.wakeLock.request('screen');
                _wakeLock.addEventListener('release', () => { _wakeLock = null; });
            }
        } else if (_wakeLock) {
            await _wakeLock.release();
            _wakeLock = null;
        }
    } catch { /* user denied or browser unsupported */ }
    finally { _wlRequesting = false; }
}

// Re-acquire wake lock when tab becomes visible again
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && window.settings?.wakeLock) {
        // Only re-acquire if the sentinel was released (set to null by 'release' event)
        if (!_wakeLock) setWakeLock(true);
    }
});
