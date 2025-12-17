function getFileUrl(file) {
    if (file.path) {
        // Electron: Use file:// protocol with safe replacement
        return 'file://' + file.path.replace(/\\/g, '/');
    } else {
        // Web: Use Blob URL
        return URL.createObjectURL(file);
    }
}

function getFileType(file) {
    if (!file) return 'unknown';
    // Check type property first, fall back to name extension
    const type = file.type || '';
    const name = file.name || '';
    
    if (type.startsWith('video/') || /\.(mkv|ts|m2ts|webm|mp4|mov|avi)$/i.test(name)) return 'video';
    if (type.startsWith('image/') || /\.(webp|png|jpg|jpeg|gif)$/i.test(name)) return 'image';
    return 'unknown';
}

function getActiveIndices() {
    const active = new Set();
    document.querySelectorAll('.grid-cell').forEach(cell => {
        if (cell.dataset.currentIndex !== undefined && cell.dataset.currentIndex !== "") {
            active.add(parseInt(cell.dataset.currentIndex));
        }
    });
    return active;
}

function gcd(a, b) {
    return b === 0 ? a : gcd(b, a % b);
}

function getAspectRatio(w, h) {
    if (!w || !h) return '';
    const divisor = gcd(w, h);
    return `${w / divisor}:${h / divisor}`;
}

async function extractMetadata(file) {
    if (file.metaDataStr) return file.metaDataStr;

    return new Promise((resolve) => {
        const url = getFileUrl(file);
        const type = getFileType(file);

        if (type === 'video') {
            const video = document.createElement('video');
            video.preload = 'metadata';
            
            video.onloadedmetadata = () => {
                const w = video.videoWidth;
                const h = video.videoHeight;
                
                // Only revoke if it was a blob URL
                if (!file.path) URL.revokeObjectURL(url);
                
                const ratio = getAspectRatio(w, h);
                const str = `${w}x${h} [${ratio}]`;
                
                file.metaDataStr = str; 
                resolve(str);
            };
            
            video.onerror = () => { if(!file.path) URL.revokeObjectURL(url); resolve(''); };
            video.src = url;
        } 
        else if (type === 'image') {
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth;
                const h = img.naturalHeight;
                const ratio = getAspectRatio(w, h);
                
                if (!file.path) URL.revokeObjectURL(url);
                
                const str = `${w}x${h} [${ratio}]`;
                file.metaDataStr = str; 
                resolve(str);
            };
            img.onerror = () => { if(!file.path) URL.revokeObjectURL(url); resolve(''); };
            img.src = url;
        } 
        else {
            resolve('');
        }
    });
}

// --- WAKE LOCK LOGIC ---
let wakeLockSentinel = null;

async function setWakeLock(isActive) {
    if (!('wakeLock' in navigator)) {
        console.warn("Wake Lock API not supported.");
        return;
    }
    try {
        if (isActive) {
            if (!wakeLockSentinel) {
                wakeLockSentinel = await navigator.wakeLock.request('screen');
                console.log("Wake Lock active ☕");
            }
        } else {
            if (wakeLockSentinel) {
                await wakeLockSentinel.release();
                wakeLockSentinel = null;
                console.log("Wake Lock released 😴");
            }
        }
    } catch (err) {
        console.error(`Wake Lock error: ${err.message}`);
    }
}

document.addEventListener('visibilitychange', async () => {
    if (wakeLockSentinel !== null && document.visibilityState === 'visible') {
        if (settings.wakeLock) {
            wakeLockSentinel = null; 
            setWakeLock(true);
        }
    }
});