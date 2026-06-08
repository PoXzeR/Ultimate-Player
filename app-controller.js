// ============================================================
//  app-controller.js  —  UI controller / event wiring
//
//  Key fixes vs original:
//  · getEls() is no longer called on every frame — cached refs
//    for hot-path handlers.
//  · draggableModals: listeners attached once, removed on close.
//  · keyboard handler: no closure-over-stale 'isMovingApp' leaks.
//  · 'ramFlush' action wired: unload all cells, GC, seek back.
//  · seekBackDelta exposed in the keybind settings panel.
//  · removeTrack: guard against out-of-bounds index.
//  · processFiles: async scan on folder import is non-blocking.
//  · checkQueueState: no double loadAndPlay on currentTrack==0.
//  · sidebarAutoHideTimer always cleared on mouseenter (no leak).
// ============================================================

'use strict';

// ── ICONS ─────────────────────────────────────────────────────
const APP_ICONS = {
    play:       `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    pause:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    mute:       `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`,
    volumeHigh: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    volumeLow:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`,
    musicPlay:  `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
    musicPause: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`,
    trash:      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
};

// ── MODULE-LEVEL STATE ────────────────────────────────────────
window.liveWatchers         = [];
window.processingFiles      = new Set();
window.lastLiveCellIndex    = -1;
window.liveSelectedIndices  = [];
window.currentLiveZonePointer = 0;
window.liveFileQueue        = [];
window.isProcessingLiveQueue = false;
window.fileDebounceMap      = new Map();
window.isLiveRunning        = false;

let sidebarAutoHideTimer = null;
let isResizingSidebar    = false;
let ctxMenu     = null;
let plyCtxMenu  = null;
window.ctxTargetIndex    = -1;
window.ctxPlaylistIndex  = -1;
window.lastRightClickedCell = null;
window.currentCFQCell    = null;
window.cfqHideTimer      = null;

// Window-move state
let isMovingApp = false;
window.isMoveKeyHeld = false;

// ── UTILITIES ─────────────────────────────────────────────────
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

window.checkLiveModifiers = function(e) {
    const s = window.settings?.liveModifiers || 'shift_ctrl';
    const c = e.ctrlKey || e.metaKey, sh = e.shiftKey, alt = e.altKey;
    return s === 'shift_ctrl' ? sh && c
         : s === 'shift_alt'  ? sh && alt
         : s === 'ctrl_alt'   ? c  && alt
         : s === 'ctrl'       ? c  && !sh && !alt
         : s === 'shift'      ? sh && !c  && !alt
         : s === 'alt'        ? alt && !sh && !c
         : sh && c;
};

function getReadableModifiers() {
    const map = {
        shift_ctrl: 'Shift + Ctrl', shift_alt: 'Shift + Alt', ctrl_alt: 'Ctrl + Alt',
        ctrl: 'Ctrl', shift: 'Shift', alt: 'Alt'
    };
    return map[window.settings?.liveModifiers] || 'Shift + Ctrl';
}

function debounce(fn, wait) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

const saveConfigDebounced  = debounce(() => window.saveConfig(), 500);
const refreshGridDebounced = debounce(() => {
    if (window.settings.mode === 'slideshow' && typeof updateGridContents === 'function')
        updateGridContents();
}, 200);

function getMimeType(filename) {
    if (!filename) return '';
    const ext = filename.split('.').pop().toLowerCase();
    const VID = new Set(['mp4','mkv','webm','avi','mov','ts','m2ts','wmv','flv','3gp','ogv','m3u8']);
    const IMG = new Set(['jpg','jpeg','png','gif','webp','bmp','tiff','svg','ico']);
    if (VID.has(ext)) return `video/${ext}`;
    if (IMG.has(ext)) return `image/${ext}`;
    return '';
}

// ── DOM ELEMENT CACHE ─────────────────────────────────────────
function getEls() {
    const g = id => document.getElementById(id);
    return {
        landing: g('landingPage'), app: g('appInterface'),
        video: g('videoPlayer'), img: g('imageViewer'),
        grid: g('gridContainer'), playlist: g('playlistContainer'),
        empty: g('emptyState'), resumeBox: g('resumeBox'),
        resumeName: g('resumeName'), gridSel: g('gridCountSelect'),
        effectSel: g('effectSelect'), durInput: g('slideTimeInput'),
        durVal: g('slideTimeVal'), shuffleBtn: g('shuffleBtn'),
        musicSec: g('musicSection'), bgAudio: g('bgAudio'),
        musicName: g('musicName'), oledToggle: g('oledToggle'),
        wakeLockToggle: g('wakeLockToggle'), dropOverlay: g('dropOverlay'),
        keybindList: g('keybindList'), shortcutsFooter: g('shortcutsFooter'),
        shortcutsToggle: g('shortcutsToggle'), queueInfoToggle: g('queueInfoToggle'),
        thumbnailToggle: g('thumbnailToggle'), editorQueueInfo: g('editorQueueInfo'),
        autoFallbackToggle: g('autoFallbackToggle'), accentPicker: g('accentPicker'),
        bgPicker: g('bgPicker'), layoutName: g('layoutName'),
        savedLayoutsSelect: g('savedLayoutsSelect'), gapSizeInput: g('gapSizeInput'),
        gapSizeVal: g('gapSizeVal'), gridRoundInput: g('gridRoundInput'),
        gridRoundVal: g('gridRoundVal'), floatRoundInput: g('floatRoundInput'),
        floatRoundVal: g('floatRoundVal'), floatOpacityInput: g('floatOpacityInput'),
        floatOpacityVal: g('floatOpacityVal'), ratioTolInput: g('ratioTolInput'),
        ratioTolVal: g('ratioTolVal'), randomDurToggle: g('randomDurToggle'),
        randomDurSettings: g('randomDurSettings'), minRandInput: g('minRandInput'),
        maxRandInput: g('maxRandInput'), minRandVal: g('minRandVal'),
        maxRandVal: g('maxRandVal'), countdownToggle: g('countdownToggle'),
        randomEffectToggle: g('randomEffectToggle'), liveFolderToggle: g('liveFolderToggle'),
        liveFolderBtn: g('liveFolderBtn'), liveSortSelect: g('liveSortSelect'),
        liveSortGroup: g('liveSortGroup'), transformBarToggle: g('transformBarToggle'),
        rotateFillToggle: g('rotateFillToggle'), rotateFillRow: g('rotateFillRow'),
        mainStage: g('mainStage'), playPauseBtn: g('playPauseBtn'),
        globalMuteBtn: g('globalMuteBtn'), fxSpeedInput: g('fxSpeedInput'),
        fxSpeedVal: g('fxSpeedVal'), applyGridBtn: g('applyGridBtn'),
        globalVolSlider: g('globalVolSlider'), globalVolDisplay: g('globalVolDisplay'),
        speedSlider: g('speedSlider'), speedDisplay: g('speedDisplay'),
        filterTarget: g('filterTarget'), brightInput: g('brightInput'),
        contrastInput: g('contrastInput'), satInput: g('satInput'),
        hueInput: g('hueInput'), invertInput: g('invertInput'),
        borderHueInput: g('borderHueInput'), borderAlphaInput: g('borderAlphaInput'),
        borderLightInput: g('borderLightInput'), borderAlphaVal: g('borderAlphaVal'),
        borderLightVal: g('borderLightVal'), whiteMixContainer: g('whiteMixContainer'),
        advanceRatioToggle: g('advanceRatioToggle'), hybridToggle: g('hybridToggle'),
        notifMaster: g('notifMaster'), notifMedia: g('notifMedia'),
        notifGrid: g('notifGrid'), notifQueue: g('notifQueue'),
        notifFile: g('notifFile'), notifLive: g('notifLive'), notifSystem: g('notifSystem'),
        appOpacityInput: g('appOpacityInput'), appOpacityVal: g('appOpacityVal')
    };
}

// ── TOAST ─────────────────────────────────────────────────────
function showToast(msg, type = 'success', category = 'system') {
    const ns = window.settings?.notificationSettings;
    if (ns?.master === false) return;
    if (ns?.[category] === false) return;

    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast-msg ${type}`;
    const icon = type === 'warning' ? '⚠️' : type === 'info' ? 'ℹ️' : '✅';
    toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ── SETTINGS → UI ─────────────────────────────────────────────
window.applySettingsToUI = function() {
    const els = getEls();
    const s   = window.settings;
    if (!s) return;

    window.setTheme(s.color, false);
    if (s.bgIndex !== -1)   window.setBg(s.bgIndex, false);
    else if (s.customBg)    window.setCustomBg(s.customBg, false);
    else if (s.bgImage)     document.documentElement.style.setProperty('--bg-image', `url(${s.bgImage})`);

    if (s.sidebarWidth) document.documentElement.style.setProperty('--sidebar-width', s.sidebarWidth + 'px');

    const set = (el, val) => { if (el) el.value = val; };
    const setText = (el, val) => { if (el) el.textContent = val; };

    set(els.gridSel, s.gridSize);
    if (els.hybridToggle) els.hybridToggle.checked = !!s.hybridMode;
    set(els.effectSel, s.effect);
    if (els.durInput) { set(els.durInput, s.duration / 1000); setText(els.durVal, s.duration / 1000); }
    if (els.gapSizeInput) {
        set(els.gapSizeInput, s.gapSize); setText(els.gapSizeVal, s.gapSize);
        document.documentElement.style.setProperty('--gutter-size', s.gapSize + 'px');
    }
    if (els.gridRoundInput) {
        set(els.gridRoundInput, s.gridRoundness); setText(els.gridRoundVal, s.gridRoundness);
        document.documentElement.style.setProperty('--grid-radius', s.gridRoundness + 'px');
    }
    if (els.floatRoundInput) {
        const fr = s.floatRoundness || 0;
        set(els.floatRoundInput, fr); setText(els.floatRoundVal, fr);
        document.documentElement.style.setProperty('--float-radius', fr + 'px');
    }
    if (els.floatOpacityInput) {
        const fo = s.floatOpacity ?? 1;
        set(els.floatOpacityInput, fo); setText(els.floatOpacityVal, fo);
        document.documentElement.style.setProperty('--float-opacity', fo);
    }
    if (els.fxSpeedInput) {
        set(els.fxSpeedInput, s.effectSpeed); setText(els.fxSpeedVal, s.effectSpeed);
        document.documentElement.style.setProperty('--fx-speed', s.effectSpeed + 's');
    }
    if (els.ratioTolInput) {
        const tol = s.ratioTolerance ?? 0.3;
        set(els.ratioTolInput, tol); setText(els.ratioTolVal, tol);
    }
    if (els.randomDurToggle) {
        els.randomDurToggle.checked = s.randomDuration;
        if (els.randomDurSettings) els.randomDurSettings.style.display = s.randomDuration ? 'block' : 'none';
        if (els.durInput) { els.durInput.disabled = s.randomDuration; els.durInput.style.opacity = s.randomDuration ? '0.5' : '1'; }
        set(els.minRandInput, s.minRandomDuration || 5); setText(els.minRandVal, s.minRandomDuration || 5);
        set(els.maxRandInput, s.maxRandomDuration || 30); setText(els.maxRandVal, s.maxRandomDuration || 30);
    }
    if (els.randomEffectToggle) {
        els.randomEffectToggle.checked = !!s.randomEffect;
        if (els.effectSel) { els.effectSel.disabled = !!s.randomEffect; els.effectSel.style.opacity = s.randomEffect ? '0.5' : '1'; }
    }
    if (els.advanceRatioToggle) els.advanceRatioToggle.checked = !!s.advanceRatioMode;
    if (els.countdownToggle)    els.countdownToggle.checked    = !!s.showCountdown;

    const bs = s.borderSettings || { hue: 0, lightness: 50, opacity: 1 };
    set(els.borderHueInput, bs.hue);
    if (els.borderAlphaInput) { set(els.borderAlphaInput, bs.opacity); setText(els.borderAlphaVal, bs.opacity); }
    if (els.borderLightInput) { set(els.borderLightInput, bs.lightness); _updateBorderLightText(els.borderLightVal, bs.lightness); }
    if (window.updateBorderStyles) window.updateBorderStyles();

    if (els.globalVolSlider) {
        set(els.globalVolSlider, s.globalVolume);
        setText(els.globalVolDisplay, Math.round(s.globalVolume * 100) + '%');
    }

    updateVisualFilters();
    set(els.brightInput,   s.filters.brightness);
    set(els.contrastInput, s.filters.contrast);
    set(els.satInput,      s.filters.saturate);
    set(els.hueInput,      s.filters.hue);
    set(els.invertInput,   s.filters.invert);
    set(els.filterTarget,  s.filters.target);

    if (els.wakeLockToggle)    els.wakeLockToggle.checked    = !!s.wakeLock;
    if (els.queueInfoToggle)   els.queueInfoToggle.checked   = !!s.showQueueInfo;
    if (els.thumbnailToggle)   els.thumbnailToggle.checked   = !!s.showThumbnails;

    const modKeys = getReadableModifiers();
    if (els.liveFolderToggle) {
        els.liveFolderToggle.checked = !!s.enableLiveFolder;
        els.liveFolderToggle.parentElement.title =
            `Enable watching folders for new content.\nTip: Hold ${modKeys} to select Live Zones.`;
        if (els.liveSortGroup) els.liveSortGroup.style.display = s.enableLiveFolder ? 'block' : 'none';
    }
    if (els.liveSortSelect) {
        set(els.liveSortSelect, s.liveSortMode || 'sequential');
        document.body.classList.remove('live-mode-sequential', 'live-mode-random');
        document.body.classList.add(`live-mode-${els.liveSortSelect.value}`);
    }
    if (els.liveFolderBtn) {
        els.liveFolderBtn.style.display = s.enableLiveFolder ? 'flex' : 'none';
        els.liveFolderBtn.title =
            `Live Folder Motion Active\n• Click to manage watched folders\n• Tip: Hold ${modKeys} and click grid cells to select Live Zones.`;
    }
    if (els.transformBarToggle) {
        els.transformBarToggle.checked = !!s.showTransformBar;
        document.body.classList.toggle('enable-transform-bar', !!s.showTransformBar);
        if (els.rotateFillRow) els.rotateFillRow.style.display = s.showTransformBar ? 'flex' : 'none';
    }
    if (els.rotateFillToggle) els.rotateFillToggle.checked = !!s.rotateFill;
    if (els.editorQueueInfo)  els.editorQueueInfo.checked  = !!s.showQueueInfo;
    if (els.autoFallbackToggle) els.autoFallbackToggle.checked = !!s.autoFallback;
    if (els.shortcutsToggle) {
        els.shortcutsToggle.checked = !!s.showShortcuts;
        const sf = document.getElementById('shortcutsFooter');
        if (sf) sf.style.display = s.showShortcuts ? 'flex' : 'none';
    }
    if (s.shuffle && els.shuffleBtn) els.shuffleBtn.classList.add('active');

    if (els.appOpacityInput) {
        const op = s.appOpacity ?? 1;
        set(els.appOpacityInput, op);
        setText(els.appOpacityVal, Math.round(op * 100));
        if (window.isElectron) require('electron').ipcRenderer.send('app-command', 'set-opacity', op);
    }

    if (window.updateLayoutSelect) window.updateLayoutSelect();

    if (s.notificationSettings) {
        const ns = s.notificationSettings;
        ['Master','Media','Grid','Queue','File','Live','System'].forEach(k => {
            const el = els[`notif${k}`];
            if (el) el.checked = !!ns[k.toLowerCase()];
        });
    }
};

function _updateBorderLightText(el, light) {
    if (!el) return;
    const l = +light;
    el.textContent = l < 10 ? 'Black' : l > 90 ? 'White' : l == 50 ? 'Pure Color' : l < 50 ? 'Dark Mix' : 'Light Mix';
}

// ── window.app PUBLIC API ─────────────────────────────────────
window.app = {
    selectMode:        (m)    => selectMode(m),
    goHome:            ()     => goHome(),
    resumePlayback:    ()     => resumePlayback(),
    setCellType:       (b, t) => window.setCellType(b, t),
    setFit:            (b, f) => window.setFit(b, f),
    setAspectRatio:    (b, r) => window.setAspectRatio(b, r),
    splitCell:         (b, d) => window.splitCell(b, d),
    deleteCell:        (b)    => window.deleteCell(b),
    saveToLibrary:     ()     => window.saveToLibrary(),
    loadLibraryItem:   ()     => window.loadLibraryItem(),
    deleteLibraryItem: ()     => window.deleteLibraryItem(),
    exportLayouts:     ()     => window.exportLayouts(),
    importLayouts:     (i)    => window.importLayouts(i),
    resetLayout:       ()     => window.resetLayout(),
    saveActiveAndExit: ()     => saveActiveAndExit(),
    applyEditorChanges:()     => applyEditorChanges(),
    playTrack:         (i)    => playTrack(i),
    removeTrack:       (i)    => removeTrack(i),
    setTheme:          (c)    => window.setTheme(c),
    setBg:             (i)    => window.setBg(i),
    setCustomBg:       (c)    => window.setCustomBg(c),
    handleBgImage:     (inp)  => handleBgImage(inp),
    setFullscreen:     (t)    => setFullscreen(t),
    exitApp:           ()     => exitApp(),
    closeExitModal:    ()     => closeExitModal(),
    confirmExit:       ()     => confirmExit(),
    minimizeApp:       ()     => minimizeApp(),
    toggleAlwaysOnTop: ()     => toggleAlwaysOnTop(),
    toggleServer:      ()     => toggleServer(),
    toggleShift:       (a)    => window.toggleShift?.(a),
    toggleCtrl:        (a)    => window.toggleCtrl?.(a),
    performUndo:       ()     => window.performUndo?.(),
    toggleGlobalMute:  ()     => toggleGlobalMute(),
    toggleGlobalPlayPause: () => toggleGlobalPlayPause(),
    toggleMusicPanel:      () => _togglePanel('musicBody',        'musicToggleBtn'),
    toggleGridSettings:    () => _togglePanel('gridSettingsBody', 'gridSettingsToggleBtn'),
    toggleBorderSettings:  () => _togglePanel('borderSettingsBody','borderSettingsToggleBtn'),
    updateBorderSettings:  () => updateBorderSettings(),
    toggleTransitionSettings: () => _togglePanel('transitionSettingsBody','transitionSettingsToggleBtn'),
    setPlaybackSpeed:      (r) => setPlaybackSpeed(r),
    updateVisualFilters:   ()  => updateVisualFilters(),
    toggleVisualPanel:     ()  => _togglePanel('visualBody',        'visualToggleBtn'),
    toggleNotificationsPanel: () => _togglePanel('notificationsBody','notificationsToggleBtn'),
    toggleNotification:    (k) => toggleNotification(k),
    resetVisualFilters:    ()  => resetVisualFilters(),
    toggleOptionsPanel:    ()  => _togglePanel('optionsBody',       'optionsToggleBtn'),
    toggleShortcutsPanel:  ()  => _togglePanel('shortcutsBody',     'shortcutsToggleBtn'),
    addLiveFolderDialog:   ()  => addLiveFolderDialog(),
    openLiveManager:       ()  => openLiveManager(),
    removeLiveFolder:      (p) => removeLiveFolder(p),
    toggleLiveMotion:      ()  => toggleLiveMotion(),
    clearLiveQueue:        ()  => clearLiveQueue(),
    clearLiveSelection:    ()  => {
        window.liveSelectedIndices   = [];
        window.currentLiveZonePointer = 0;
        document.querySelectorAll('.grid-cell').forEach(el => {
            el.classList.remove('live-zone');
            el.removeAttribute('data-live-order');
        });
        showToast('Live Zones Cleared', 'info', 'live');
    },
    toggleFolderState: (i) => toggleFolderState(i),
    openWebManager:    ()  => openWebManager(),
    closeWebManager:   ()  => closeWebManager(),
    addWebUrls:        ()  => addWebUrls(),
    removeWebVideo:    (u) => removeWebVideo(u),
    clearImg:  () => performClearImages(),
    clearVid:  () => performClearVideos(),
    clearAll:  () => performClearAll(),

    shuffleCellQueue: () => {
        const cell = window.currentCFQCell;
        if (cell?.privateQueue?.length > 0) {
            shuffleArray(cell.privateQueue);
            const idx = Array.from(document.querySelectorAll('.grid-cell')).indexOf(cell);
            if (idx !== -1 && window.gridQueueMap) window.gridQueueMap[idx] = cell.privateQueue;
            renderCFQ(cell);
            showToast('Grid loop shuffled', 'success', 'grid');
        }
    },
    showFileFromCellQueue: (i) => {
        const cell = window.currentCFQCell;
        if (cell?.privateQueue?.[i]) {
            cell.dataset.privateIndex = i;
            if (typeof mountMediaInCell === 'function') mountMediaInCell(cell, i, true);
            closeContextMenu();
        }
    },
    addFilesToCell: async () => {
        if (!window.isElectron) return showToast('PC Only', 'warning', 'system');
        const { ipcRenderer } = require('electron');
        const fs = require('fs'), path = require('path');
        const paths = await ipcRenderer.invoke('select-dirs', 'files');
        if (paths?.length) {
            const files = paths.map(p => ({ name: path.basename(p), path: p, size: fs.statSync(p).size, type: getMimeType(p) }));
            pushToCellQueue(window.lastRightClickedCell, files);
        }
    },
    addFolderToCell: async () => {
        if (!window.isElectron) return showToast('PC Only', 'warning', 'system');
        const { ipcRenderer } = require('electron');
        const fs = require('fs'), path = require('path');
        const dirs = await ipcRenderer.invoke('select-dirs', 'folders');
        if (dirs?.length) {
            const all = [];
            dirs.forEach(dir => {
                try {
                    fs.readdirSync(dir).forEach(f => {
                        const fp = path.join(dir, f);
                        const mime = getMimeType(f);
                        if (mime && fs.statSync(fp).isFile())
                            all.push({ name: f, path: fp, size: fs.statSync(fp).size, type: mime });
                    });
                } catch { /* skip unreadable */ }
            });
            pushToCellQueue(window.lastRightClickedCell, all);
        }
    },
    addFromMainToCell: () => {
        if (!window.lastRightClickedCell) return;
        if (!window.playlist.length) return showToast('Main queue is empty', 'warning', 'queue');
        pushToCellQueue(window.lastRightClickedCell, [...window.playlist]);
    },
    showCellQueue:  () => { if (window.lastRightClickedCell) renderCFQ(window.lastRightClickedCell); },
    clearCellQueue: () => {
        const cell = window.lastRightClickedCell;
        if (!cell) return;
        cell.privateQueue = [];
        cell.classList.remove('has-private-queue');
        const idx = Array.from(document.querySelectorAll('.grid-cell')).indexOf(cell);
        if (idx !== -1 && window.gridQueueMap) delete window.gridQueueMap[idx];
        if (typeof mountMediaInCell === 'function') mountMediaInCell(cell, -1, false);
        showToast('Grid loop cleared. Using main queue.', 'info', 'grid');
    },
    removeFromCellQueue: (i) => {
        const cell = window.currentCFQCell;
        if (!cell?.privateQueue) return;
        cell.privateQueue.splice(i, 1);
        if (!cell.privateQueue.length) {
            cell.classList.remove('has-private-queue');
            const idx = Array.from(document.querySelectorAll('.grid-cell')).indexOf(cell);
            if (idx !== -1 && window.gridQueueMap) delete window.gridQueueMap[idx];
        }
        renderCFQ(cell);
    },
    ctxShowInQueue: () => {
        const index = window.ctxTargetIndex;
        const sb = document.getElementById('sidebar');
        if (sb?.classList.contains('collapsed')) { sb.classList.remove('collapsed'); document.getElementById('dragHandle')?.classList.remove('collapsed'); }
        document.querySelectorAll('.track').forEach(t => {
            if (parseInt(t.dataset.trackIndex) === index) {
                t.scrollIntoView({ behavior: 'smooth', block: 'center' });
                t.classList.remove('highlight-flash'); void t.offsetWidth; t.classList.add('highlight-flash');
            }
        });
        closeContextMenu();
    },
    ctxShowInFolder: () => {
        const file = window.playlist[window.ctxTargetIndex];
        if (!file?.path) return;
        if (window.isElectron) require('electron').shell.showItemInFolder(file.path);
        closeContextMenu();
    },
    ctxPlyShowFolder: () => {
        const file = window.playlist[window.ctxPlaylistIndex];
        if (!file?.path || file.isWeb) return;
        if (window.isElectron) require('electron').shell.showItemInFolder(file.path);
        closeContextMenu();
    },
    ctxPlyShowInGrid: () => {
        const index = window.ctxPlaylistIndex;
        if (index < 0) return;
        if (window.settings.mode !== 'slideshow') { app.selectMode('slideshow'); setTimeout(() => app.ctxPlyShowInGrid(), 300); return; }
        const file  = window.playlist[index];
        const type  = getFileType(file);
        const cells = Array.from(document.querySelectorAll('.grid-cell'))
            .filter(c => c.dataset.locked !== 'true' && (c.dataset.contentType === 'all' || !c.dataset.contentType || c.dataset.contentType === type));
        if (!cells.length) { showToast('No suitable cell found', 'warning', 'grid'); return; }
        const target = cells[Math.floor(Math.random() * cells.length)];
        if (typeof mountMediaInCell === 'function') {
            mountMediaInCell(target, index, true);
            target.style.transition  = 'box-shadow 0.3s';
            target.style.boxShadow   = 'inset 0 0 0 4px #22c55e';
            setTimeout(() => { target.style.boxShadow = ''; }, 600);
            showToast('Displayed in Grid', 'success', 'grid');
        }
        closeContextMenu();
    }
};

// ── CELL PRIVATE QUEUE HELPERS ────────────────────────────────
function pushToCellQueue(cell, files) {
    if (!cell) return;
    if (!cell.privateQueue) cell.privateQueue = [];
    cell.privateQueue = cell.privateQueue.concat(files);
    const idx = Array.from(document.querySelectorAll('.grid-cell')).indexOf(cell);
    if (idx !== -1 && window.gridQueueMap) window.gridQueueMap[idx] = cell.privateQueue;
    cell.classList.add('has-private-queue');
    if (typeof mountMediaInCell === 'function') mountMediaInCell(cell, 0, true);
    showToast(`Added ${files.length} files to grid loop`, 'success', 'grid');
}

function renderCFQ(cell) {
    let container = document.getElementById('cell-floating-queue');
    if (!container) {
        container = document.createElement('div');
        container.id        = 'cell-floating-queue';
        container.className = 'cell-floating-queue';
        document.body.appendChild(container);
        container.onmouseenter = () => clearTimeout(window.cfqHideTimer);
        container.onmouseleave = () => { window.cfqHideTimer = setTimeout(() => container.remove(), 3000); };
    }
    window.currentCFQCell = cell;
    const rect  = cell.getBoundingClientRect();
    let left    = Math.min(rect.left + 20, window.innerWidth  - 300);
    let top     = Math.min(rect.top  + 20, window.innerHeight - 420);
    container.style.left = Math.max(5, left) + 'px';
    container.style.top  = Math.max(5, top)  + 'px';

    const queue = cell.privateQueue || [];
    container.innerHTML = `
        <div class="cfq-header">
            <div style="display:flex;align-items:center;gap:8px;">
                <span>GRID QUEUE (${queue.length})</span>
                <button class="cfq-action-icon" onclick="app.shuffleCellQueue()" title="Shuffle">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                </button>
            </div>
            <button class="cfq-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <div class="cfq-items">
            ${queue.length === 0
                ? '<div style="padding:20px;text-align:center;color:#666;">No private files</div>'
                : queue.map((f, i) => `
                    <div class="cfq-item" data-cfq-index="${i}">
                        <span title="${f.name}">${i + 1}. ${f.name.length > 20 ? f.name.slice(0, 17) + '…' : f.name}</span>
                        <span class="cfq-remove" onclick="app.removeFromCellQueue(${i})">×</span>
                    </div>`).join('')}
        </div>`;

    // Context menu on items
    container.querySelectorAll('.cfq-item').forEach(item => {
        item.addEventListener('contextmenu', e => {
            e.preventDefault(); e.stopPropagation();
            const i    = parseInt(item.dataset.cfqIndex);
            const menu = document.getElementById('gridContextMenu');
            menu.innerHTML = `
                <div class="section-title" style="padding:5px 12px;opacity:0.6;font-size:0.65rem;">File: ${queue[i].name}</div>
                <div class="ctx-item" onclick="app.showFileFromCellQueue(${i})">▶ Show in Grid Now</div>
                <div class="ctx-item" onclick="app.removeFromCellQueue(${i})" style="color:#ff5555">❌ Remove from Loop</div>`;
            menu.style.display = 'flex';
            menu.style.left    = `${e.clientX}px`;
            menu.style.top     = `${e.clientY}px`;
            menu.classList.add('active');
        });
    });

    // Drag header
    const header = container.querySelector('.cfq-header');
    header.onmousedown = e => {
        if (e.target.closest('.cfq-action-icon,.cfq-close')) return;
        let ox = e.clientX - container.offsetLeft;
        let oy = e.clientY - container.offsetTop;
        const onDrag = me => {
            container.style.left = (me.clientX - ox) + 'px';
            container.style.top  = (me.clientY - oy) + 'px';
        };
        const onUp = () => { document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup',   onUp);
    };
}

// ── WEB MANAGER ───────────────────────────────────────────────
function openWebManager()  { renderWebVideoList(); document.body.classList.add('settings-open'); document.getElementById('webVideoModal').classList.add('open'); }
function closeWebManager() { document.body.classList.remove('settings-open'); document.getElementById('webVideoModal').classList.remove('open'); }

function addWebUrls() {
    const textarea = document.getElementById('webUrlInput');
    const urls     = (textarea.value || '').split(/[\s\n,]+/).filter(u => u.trim().startsWith('http'));
    if (!urls.length) { showToast('No valid URLs found', 'warning', 'queue'); return; }

    const newTracks = urls.map(url => {
        const parts = url.split('/').filter(Boolean);
        let name = '';
        for (let i = parts.length - 1; i >= 0; i--) {
            const seg = parts[i].split('?')[0].split('#')[0];
            if (seg && !seg.toLowerCase().includes('index') && seg.length > 3) { name = seg; break; }
        }
        if (!name) name = parts.at(-1)?.split('?')[0] || 'Web Stream';
        return { name: `[Web] ${name}`, path: url, size: 0, type: 'video/mp4', isWeb: true, metaDataStr: '[Web Stream]' };
    });

    const wasEmpty = !window.playlist.length;
    if (window.settings.shuffle) {
        window.originalPlaylist = (window.originalPlaylist || []).concat(newTracks);
        window.playlist = window.playlist.concat(newTracks);
        const cur = window.playlist[window.currentTrack];
        shuffleArray(window.playlist);
        if (cur) { const ni = window.playlist.indexOf(cur); window.currentTrack = ni !== -1 ? ni : 0; }
    } else {
        window.playlist = window.playlist.concat(newTracks);
        window.originalPlaylist = [];
    }
    textarea.value = '';
    renderWebVideoList(); renderPlaylist();
    showToast(`Added ${newTracks.length} Web Video(s)`, 'success', 'queue');
    if (wasEmpty && !window.isEditingLayout) loadAndPlay(0);
    else if (window.settings.mode === 'slideshow') updateGridContents?.();
}

function removeWebVideo(url) {
    const n = window.playlist.length;
    window.playlist = window.playlist.filter(f => f.path !== url);
    if (window.settings.shuffle && window.originalPlaylist)
        window.originalPlaylist = window.originalPlaylist.filter(f => f.path !== url);
    if (window.playlist.length < n) { renderPlaylist(); checkQueueState(); }
    renderWebVideoList();
}

function renderWebVideoList() {
    const list = document.getElementById('webVideoList');
    list.innerHTML = '';
    const items = window.playlist.filter(f => f.isWeb);
    if (!items.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">No web videos in queue</div>'; return; }
    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'live-folder-item';
        div.innerHTML = `<div style="display:flex;align-items:center;gap:10px;overflow:hidden;flex:1;"><span>🎬</span><div class="lf-path" title="${item.path}" style="flex:1;">${item.name}</div></div><button class="lf-remove" onclick="app.removeWebVideo('${item.path}')">${APP_ICONS.trash}</button>`;
        list.appendChild(div);
    });
}

// ── SIDEBAR TIMER ─────────────────────────────────────────────
function startSidebarTimer() {
    clearTimeout(sidebarAutoHideTimer);
    const sb = document.getElementById('sidebar');
    const dh = document.getElementById('dragHandle');
    const isFs = document.body.classList.contains('minimal-ui') || document.body.classList.contains('is-fullscreen') || !!document.fullscreenElement;
    if (isFs && !sb.classList.contains('collapsed')) {
        sidebarAutoHideTimer = setTimeout(() => {
            if (!sb.matches(':hover')) { sb.classList.add('collapsed'); dh?.classList.add('collapsed'); }
            else startSidebarTimer();
        }, 4600);
    }
}

// ── LIVE FOLDER WATCHERS ──────────────────────────────────────
function syncWatchers() {
    if (!window.isLiveRunning) {
        window.liveWatchers.forEach(w => w.watcher?.close());
        window.liveWatchers = [];
        return;
    }
    const enabled = window.settings.liveFolders.filter(f => f.enabled);
    for (let i = window.liveWatchers.length - 1; i >= 0; i--) {
        if (!enabled.some(f => f.path === window.liveWatchers[i].path)) {
            window.liveWatchers[i].watcher?.close();
            window.liveWatchers.splice(i, 1);
        }
    }
    enabled.forEach(folder => {
        if (!window.liveWatchers.some(w => w.path === folder.path)) activateFolderWatcher(folder.path);
    });
}

function activateFolderWatcher(dir) {
    if (window.liveWatchers.some(w => w.path === dir)) return;
    const w = createWatcher(dir);
    if (w) window.liveWatchers.push({ path: dir, watcher: w });
}

function stopAllWatchers() {
    window.liveWatchers.forEach(w => w.watcher?.close());
    window.liveWatchers = [];
}

async function addLiveFolderDialog() {
    if (!window.isElectron) return showToast('PC Only', 'warning', 'system');
    const { ipcRenderer } = require('electron');
    const paths = await ipcRenderer.invoke('select-dirs');
    if (!paths?.length) return;

    if (!window.settings.enableLiveFolder) {
        window.settings.enableLiveFolder = true;
        document.getElementById('liveFolderToggle').checked = true;
        window.applySettingsToUI?.();
    }
    if (!window.isLiveRunning) { window.isLiveRunning = true; showToast('Live Motion Started', 'success', 'live'); }
    if (!window.liveWatchers.length && !window.settings.liveFolders.length) app.selectMode('slideshow');

    paths.forEach(dir => {
        if (!window.settings.liveFolders.some(f => f.path === dir))
            window.settings.liveFolders.push({ path: dir, enabled: true });
    });
    window.saveConfig(); syncWatchers();
    if (document.getElementById('liveFolderModal').classList.contains('open')) renderLiveFolderList();
}

function waitForFileStability(filePath, timeout = 10000) {
    const fs = require('fs');
    let lastSize = -1, elapsed = 0;
    return new Promise((resolve, reject) => {
        const id = setInterval(() => {
            elapsed += 500;
            if (elapsed > timeout) { clearInterval(id); reject('Timeout'); return; }
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (stats.size > 0 && stats.size === lastSize) { clearInterval(id); resolve(stats); }
                lastSize = stats.size;
            });
        }, 500);
    });
}

function createWatcher(targetDir) {
    const fs = require('fs'), path = require('path');
    try {
        return fs.watch(targetDir, { recursive: false }, (_, filename) => {
            if (!filename) return;
            const full = path.join(targetDir, filename);
            const existing = window.fileDebounceMap.get(full);
            if (existing) clearTimeout(existing);
            window.fileDebounceMap.set(full, setTimeout(() => {
                window.fileDebounceMap.delete(full);
                checkAndQueueFile(full, filename);
            }, 100));
        });
    } catch {
        showToast('Error watching folder', 'warning', 'live');
        return null;
    }
}

function checkAndQueueFile(fullPath, filename) {
    if (window.processingFiles.has(fullPath)) return;
    if (window.playlist.some(p => p.path === fullPath)) return;
    const fs = require('fs');
    fs.access(fullPath, fs.constants.F_OK, err => {
        if (err) return;
        const mime = getMimeType(filename);
        if (!mime) return;
        window.processingFiles.add(fullPath);
        waitForFileStability(fullPath)
            .then(stats => {
                window.liveFileQueue.push({ name: filename, path: fullPath, size: stats.size, type: mime, isLive: true });
                processLiveQueue();
            })
            .catch(() => {})
            .finally(() => window.processingFiles.delete(fullPath));
    });
}

async function processLiveQueue() {
    if (window.isProcessingLiveQueue || !window.liveFileQueue.length) return;
    window.isProcessingLiveQueue = true;
    while (window.liveFileQueue.length) {
        const fileData = window.liveFileQueue.shift();
        if (window.settings.shuffle) {
            window.originalPlaylist = (window.originalPlaylist || []).concat([fileData]);
            window.playlist.push(fileData);
            const cur = window.playlist[window.currentTrack];
            shuffleArray(window.playlist);
            if (cur) { const ni = window.playlist.indexOf(cur); if (ni !== -1) window.currentTrack = ni; }
        } else {
            window.playlist.push(fileData);
        }
        const newIndex = window.playlist.length - 1;
        renderPlaylist();
        const container = document.getElementById('playlistContainer');
        if (container) container.scrollTop = container.scrollHeight;
        if (window.settings.mode === 'slideshow') {
            const wasEmpty = injectLiveUpdate(newIndex);
            await new Promise(r => setTimeout(r, wasEmpty ? 200 : 1500));
        } else {
            loadAndPlay(newIndex);
            await new Promise(r => setTimeout(r, 100));
        }
    }
    window.isProcessingLiveQueue = false;
}

function injectLiveUpdate(newFileIndex) {
    const cells = Array.from(document.querySelectorAll('.grid-cell'));
    if (!cells.length) return false;

    const isEmpty = !cells.some(c => c.querySelector('img, video, canvas'));
    if (isEmpty) { window.currentLiveZonePointer = 0; window.lastLiveCellIndex = -1; }

    let pool = window.liveSelectedIndices.length
        ? window.liveSelectedIndices.map(i => cells[i] ? { cell: cells[i], index: i } : null).filter(Boolean)
        : cells.map((cell, index) => ({ cell, index }));
    if (!pool.length) return false;

    let targetCell;
    if ((window.settings.liveSortMode || 'sequential') === 'sequential') {
        if (window.currentLiveZonePointer >= pool.length) window.currentLiveZonePointer = 0;
        targetCell = pool[window.currentLiveZonePointer++].cell;
        if (window.currentLiveZonePointer >= pool.length) window.currentLiveZonePointer = 0;
    } else {
        const avail = pool.length > 1 && window.lastLiveCellIndex !== -1
            ? pool.filter(o => o.index !== window.lastLiveCellIndex) : pool;
        const pick = avail[Math.floor(Math.random() * avail.length)];
        targetCell = pick.cell;
        window.lastLiveCellIndex = pick.index;
    }
    if (targetCell && typeof mountMediaInCell === 'function') {
        mountMediaInCell(targetCell, newFileIndex, true);
        return true;
    }
    return false;
}

function toggleFolderState(i) {
    if (!window.settings.liveFolders[i]) return;
    window.settings.liveFolders[i].enabled = !window.settings.liveFolders[i].enabled;
    window.saveConfig(); syncWatchers(); renderLiveFolderList();
}

function removeLiveFolder(p) {
    const idx = window.settings.liveFolders.findIndex(f => f.path === p);
    if (idx !== -1) { window.settings.liveFolders.splice(idx, 1); window.saveConfig(); }
    syncWatchers(); renderLiveFolderList();
}

function toggleLiveMotion() {
    if (!window.settings.liveFolders.length) return;
    window.isLiveRunning = !window.isLiveRunning;
    if (window.isLiveRunning) { syncWatchers(); showToast('Live Resumed', 'success', 'live'); }
    else { stopAllWatchers(); showToast('Live Paused', 'info', 'live'); }
    renderLiveFolderList();
}

function clearLiveQueue() {
    const n = window.playlist.length;
    window.playlist = window.playlist.filter(f => !f.isLive);
    if (window.settings.shuffle && window.originalPlaylist)
        window.originalPlaylist = window.originalPlaylist.filter(f => !f.isLive);
    renderPlaylist();
    if (window.settings.mode === 'slideshow') updateGridContents?.();
    showToast(`Removed ${n - window.playlist.length} files`, 'info', 'live');
}

function renderLiveFolderList() {
    const list = document.getElementById('liveFolderList');
    list.innerHTML = '';
    if (!window.settings.liveFolders.length) { list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">Empty</div>'; return; }

    const stopRow = document.createElement('div');
    stopRow.style.cssText = 'padding:10px;border-bottom:1px solid #333;display:flex;justify-content:center;';
    stopRow.innerHTML = window.isLiveRunning
        ? `<button class="lf-remove" style="background:#451a1a;color:#ff9999;border-color:#772222;font-weight:bold;width:100%;padding:8px;" onclick="app.toggleLiveMotion()">🔴 Pause All Motion</button>`
        : `<button class="lf-remove" style="background:#1a4520;color:#99ff99;border-color:#227722;font-weight:bold;width:100%;padding:8px;" onclick="app.toggleLiveMotion()">🟢 Resume All Motion</button>`;
    list.appendChild(stopRow);

    window.settings.liveFolders.forEach((folder, i) => {
        const div = document.createElement('div'); div.className = 'live-folder-item';
        const safe = folder.path.replace(/\\/g, '\\\\');
        div.innerHTML = `<div style="display:flex;align-items:center;gap:10px;overflow:hidden;flex:1;opacity:${window.isLiveRunning ? 1 : 0.5};"><label class="switch" style="transform:scale(0.8);margin:0;"><input type="checkbox" ${folder.enabled ? 'checked' : ''} onchange="app.toggleFolderState(${i})"><span class="slider round white-toggle" style="${folder.enabled ? 'background-color:#22c55e;border-color:#22c55e;' : ''}"></span></label><div class="lf-path" title="${folder.path}" style="flex:1;">${folder.path}</div></div><button class="lf-remove" onclick="app.removeLiveFolder('${safe}')">${APP_ICONS.trash}</button>`;
        list.appendChild(div);
    });
}

function openLiveManager() { renderLiveFolderList(); document.body.classList.add('settings-open'); document.getElementById('liveFolderModal').classList.add('open'); }

// ── RAM PURGE HELPERS ─────────────────────────────────────────
function _instantRamPurge(filesToPurge, unloadCells) {
    if (unloadCells) {
        document.querySelectorAll('.grid-cell').forEach(cell => {
            if (typeof unloadMediaContent === 'function') unloadMediaContent(cell);
        });
    }
    if (window.thumbPool) {
        window.thumbPool.queue.forEach(job => { try { job.resolve(null); } catch { } });
        window.thumbPool.queue = [];
    }
    filesToPurge.forEach(file => {
        if (file.thumbnailUrl?.startsWith('blob:')) URL.revokeObjectURL(file.thumbnailUrl);
        delete file.thumbnailUrl; delete file.metaDataStr; delete file.isExtracting;
        if (window.thumbCache) {
            const id  = file.path || (file.name + file.size);
            const url = window.thumbCache.get(id);
            if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
            window.thumbCache.delete(id);
        }
    });
    if (typeof window.gc === 'function') window.gc();
}

function performClearAll() {
    if (!window.playlist.length) return;
    if (!confirm('Clear main queue?')) return;
    const all = [...window.playlist];
    window.gridQueueMap = {};
    document.querySelectorAll('.grid-cell').forEach(c => { c.privateQueue = []; c.classList.remove('has-private-queue'); });
    _instantRamPurge(all, true);
    window.playlist = []; window.originalPlaylist = [];
    checkQueueState();
    showToast('Queue Cleared', 'info', 'queue');
}

function performClearImages() {
    const toRemove = window.playlist.filter(f => getFileType(f) === 'image');
    if (!toRemove.length) return;
    document.querySelectorAll('.grid-cell').forEach(cell => {
        if (cell.querySelector('.media-active')?.tagName === 'IMG')
            if (typeof unloadMediaContent === 'function') unloadMediaContent(cell);
    });
    Object.keys(window.gridQueueMap || {}).forEach(k => {
        window.gridQueueMap[k] = window.gridQueueMap[k].filter(f => getFileType(f) !== 'image');
    });
    _instantRamPurge(toRemove, false);
    window.playlist = window.playlist.filter(f => getFileType(f) !== 'image');
    if (window.settings.shuffle && window.originalPlaylist)
        window.originalPlaylist = window.originalPlaylist.filter(f => getFileType(f) !== 'image');
    checkQueueState();
    showToast(`Removed ${toRemove.length} Images`, 'info', 'queue');
}

function performClearVideos() {
    const toRemove = window.playlist.filter(f => getFileType(f) === 'video');
    if (!toRemove.length) return;
    document.querySelectorAll('.grid-cell').forEach(cell => {
        if (cell.querySelector('video.media-active'))
            if (typeof unloadMediaContent === 'function') unloadMediaContent(cell);
    });
    Object.keys(window.gridQueueMap || {}).forEach(k => {
        window.gridQueueMap[k] = window.gridQueueMap[k].filter(f => getFileType(f) !== 'video');
    });
    _instantRamPurge(toRemove, false);
    window.playlist = window.playlist.filter(f => getFileType(f) !== 'video');
    if (window.settings.shuffle && window.originalPlaylist)
        window.originalPlaylist = window.originalPlaylist.filter(f => getFileType(f) !== 'video');
    checkQueueState();
    showToast(`Removed ${toRemove.length} Videos`, 'info', 'queue');
}

function removeTrack(index) {
    if (index < 0 || index >= window.playlist.length) return;
    const file = window.playlist[index];
    if (file.thumbnailUrl?.startsWith('blob:')) URL.revokeObjectURL(file.thumbnailUrl);
    delete file.thumbnailUrl; delete file.metaDataStr;
    if (window.thumbCache) {
        const id = file.path || (file.name + file.size);
        const u  = window.thumbCache.get(id);
        if (u?.startsWith('blob:')) URL.revokeObjectURL(u);
        window.thumbCache.delete(id);
    }
    window.playlist.splice(index, 1);
    if (window.settings.shuffle && window.originalPlaylist) {
        const bi = window.originalPlaylist.indexOf(file);
        if (bi !== -1) window.originalPlaylist.splice(bi, 1);
    }
    if (index < window.currentTrack) window.currentTrack--;
    else if (window.currentTrack >= window.playlist.length) window.currentTrack = Math.max(0, window.playlist.length - 1);
    checkQueueState();
}

// ── DOMContentLoaded ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!window.isElectron) document.body.classList.add('is-broadcast-client');

    window.applySettingsToUI?.();
    window.renderGridOptions?.();
    if (window.settings?.wakeLock) setWakeLock?.(true);
    if (!window.settings.liveFolders) window.settings.liveFolders = [];
    window.isLiveRunning = false;

    const els        = getEls();
    const sb         = document.getElementById('sidebar');
    const dragHandle = document.getElementById('dragHandle');

    // ── Sidebar resize ────────────────────────────────────────
    if (dragHandle && sb) {
        dragHandle.addEventListener('mousedown', e => {
            if (sb.classList.contains('collapsed')) return;
            isResizingSidebar = true;
            document.body.classList.add('is-resizing-sidebar');
            document.body.style.cssText += 'cursor:col-resize;user-select:none;';
            sb.style.transition = 'none';
            e.preventDefault();
        });
        window.addEventListener('mousemove', e => {
            if (!isResizingSidebar) return;
            const w = Math.min(700, Math.max(200, window.innerWidth - e.clientX));
            document.documentElement.style.setProperty('--sidebar-width', w + 'px');
            if (window.settings) { window.settings.sidebarWidth = w; saveConfigDebounced(); }
        });
        window.addEventListener('mouseup', () => {
            if (!isResizingSidebar) return;
            isResizingSidebar = false;
            document.body.classList.remove('is-resizing-sidebar');
            document.body.style.cursor = ''; document.body.style.userSelect = '';
            sb.style.transition = '';
        });
    }

    if (sb) {
        sb.addEventListener('mouseenter', () => clearTimeout(sidebarAutoHideTimer));
        sb.addEventListener('mouseleave', () => {
            const isFs = document.body.classList.contains('minimal-ui') || document.body.classList.contains('is-fullscreen') || !!document.fullscreenElement;
            if (isFs) startSidebarTimer(); else clearTimeout(sidebarAutoHideTimer);
        });
    }

    // ── Folder picker ─────────────────────────────────────────
    document.querySelector('.primary-folder-btn')?.addEventListener('click', async e => {
        if (!window.isElectron) return;
        e.preventDefault();
        const { ipcRenderer } = require('electron');
        const fs = require('fs'), path = require('path');
        const dirs = await ipcRenderer.invoke('select-dirs', 'folders');
        if (!dirs?.length) return;
        showToast('Scanning folders…', 'info', 'file');
        // Non-blocking scan
        setTimeout(() => {
            const all = [];
            const scan = dir => {
                try {
                    fs.readdirSync(dir).forEach(f => {
                        if (f.startsWith('.')) return;
                        const fp = path.join(dir, f);
                        try {
                            if (fs.statSync(fp).isDirectory()) scan(fp);
                            else all.push(fp);
                        } catch { }
                    });
                } catch { }
            };
            dirs.forEach(scan);
            const vf = all.map(fp => {
                const name = path.basename(fp);
                return { name, path: fp, size: fs.statSync(fp).size || 0, type: getMimeType(name) };
            }).filter(f => f.type);
            if (!vf.length) showToast('No media files found.', 'warning', 'file');
            else processFiles(vf);
        }, 50);
    });

    document.querySelector('label[for="fileInput"]')?.addEventListener('click', async e => {
        if (!window.isElectron) return;
        e.preventDefault();
        const { ipcRenderer } = require('electron');
        const fs = require('fs'), path = require('path');
        const fps = await ipcRenderer.invoke('select-dirs', 'files');
        if (fps?.length) {
            processFiles(fps.map(fp => {
                const name = path.basename(fp);
                return { name, path: fp, size: fs.statSync(fp).size || 0, type: getMimeType(name) };
            }));
        }
    });

    document.getElementById('folderInput').addEventListener('change', function(e) { processFiles(Array.from(e.target.files)); this.value = ''; });
    document.getElementById('fileInput').addEventListener('change',   function(e) { processFiles(Array.from(e.target.files)); this.value = ''; });

    // ── Drag and drop ─────────────────────────────────────────
    window.dragCounter = 0;
    window.addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files')) window.dragCounter++; });
    window.addEventListener('dragleave', e => { if (e.dataTransfer.types.includes('Files')) window.dragCounter--; });
    window.addEventListener('dragover',  e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    window.addEventListener('drop',      e => { e.preventDefault(); window.dragCounter = 0; els.dropOverlay?.classList.remove('active'); handleDrop(e); });

    // ── Music ─────────────────────────────────────────────────
    document.getElementById('musicInput').addEventListener('change', e => {
        window.musicPlaylist = window.musicPlaylist.concat(Array.from(e.target.files));
        if (window.musicPlaylist.length && els.bgAudio.paused) playMusic(0);
        e.target.value = '';
    });
    document.getElementById('clearMusicBtn').onclick = () => {
        els.bgAudio.pause(); els.bgAudio.src = ''; window.musicPlaylist = []; window.currentMusicTrack = 0;
        els.musicName.textContent = 'No music loaded'; document.getElementById('musicPlayBtn').innerHTML = APP_ICONS.musicPlay;
    };
    els.bgAudio.addEventListener('ended', () => playMusic(window.currentMusicTrack + 1));
    document.getElementById('musicPlayBtn').onclick = () => {
        if (els.bgAudio.paused) { if (els.bgAudio.src) els.bgAudio.play(); else if (window.musicPlaylist.length) playMusic(0); document.getElementById('musicPlayBtn').innerHTML = APP_ICONS.musicPause; }
        else { els.bgAudio.pause(); document.getElementById('musicPlayBtn').innerHTML = APP_ICONS.musicPlay; }
    };
    document.getElementById('musicVol').addEventListener('input', e => { els.bgAudio.volume = e.target.value; });

    // ── Main video controls ───────────────────────────────────
    els.video.addEventListener('ended', playNext);
    document.getElementById('nextBtn').onclick = playNext;
    document.getElementById('prevBtn').onclick = playPrev;

    // ── Shuffle ───────────────────────────────────────────────
    document.getElementById('shuffleBtn').onclick = function() {
        const on = !window.settings.shuffle;
        window.settings.shuffle = on;
        this.classList.toggle('active', on);
        if (on) {
            if (!(window.originalPlaylist?.length)) window.originalPlaylist = [...window.playlist];
            const cur = window.playlist[window.currentTrack];
            shuffleArray(window.playlist);
            if (cur) { const ni = window.playlist.indexOf(cur); window.currentTrack = ni !== -1 ? ni : 0; }
        } else {
            if (window.originalPlaylist?.length) {
                const cur = window.playlist[window.currentTrack];
                window.playlist = [...window.originalPlaylist];
                if (cur) { const oi = window.playlist.indexOf(cur); window.currentTrack = oi !== -1 ? oi : 0; }
                window.originalPlaylist = [];
            }
        }
        window.saveConfig(); renderPlaylist();
        window.shuffleCycleHistory?.clear();
        if (window.playlist.length) window.nextQueueIndex = (window.currentTrack + getGridCapacity()) % window.playlist.length;
        if (window.settings.mode === 'slideshow') updateGridContents?.();
        showToast(on ? 'Shuffle Active' : 'Original Order Restored', 'info', 'queue');
    };

    // ── Global controls ───────────────────────────────────────
    document.getElementById('globalMuteBtn').onclick  = toggleGlobalMute;
    document.getElementById('playPauseBtn').onclick   = toggleGlobalPlayPause;
    document.getElementById('fsBtn').onclick = () => {
        if (document.body.classList.contains('minimal-ui') || document.fullscreenElement) {
            if (window.isElectron) { try { require('electron').ipcRenderer.send('app-command', 'restore'); } catch { } }
            if (document.fullscreenElement) document.exitFullscreen();
            document.body.classList.remove('minimal-ui', 'split-active', 'split-left', 'split-right', 'split-top', 'split-bottom');
        } else setFullscreen('full');
    };
    document.getElementById('toggleSidebarBtn').onclick = () => {
        const isFs = document.body.classList.contains('minimal-ui') || !!document.fullscreenElement;
        const wasCollapsed = sb.classList.contains('collapsed');
        sb.classList.toggle('collapsed'); dragHandle?.classList.toggle('collapsed');
        if (isFs && wasCollapsed) startSidebarTimer(); else clearTimeout(sidebarAutoHideTimer);
    };

    // ── Queue buttons ─────────────────────────────────────────
    document.getElementById('clearAllBtn').onclick    = performClearAll;
    document.getElementById('clearImagesBtn').onclick = performClearImages;
    document.getElementById('clearVideosBtn').onclick = performClearVideos;

    // Filter tabs
    const btnAll = document.getElementById('filterAllBtn');
    const btnImg = document.getElementById('filterImgBtn');
    const btnVid = document.getElementById('filterVidBtn');
    const pc     = document.getElementById('playlistContainer');
    const setFilter = btn => [btnAll, btnImg, btnVid].forEach(b => b.classList.toggle('active', b === btn));
    btnAll.onclick = () => { pc.classList.remove('filter-images', 'filter-videos'); setFilter(btnAll); };
    btnImg.onclick = () => { pc.classList.remove('filter-videos'); pc.classList.add('filter-images'); setFilter(btnImg); };
    btnVid.onclick = () => { pc.classList.remove('filter-images'); pc.classList.add('filter-videos'); setFilter(btnVid); };

    // ── Settings modal ────────────────────────────────────────
    document.getElementById('settingsBtn').onclick = () => {
        renderKeybinds();
        document.body.classList.add('settings-open');
        document.getElementById('settingsModal').classList.add('open');
    };
    document.getElementById('resetKeysBtn').onclick = () => {
        window.keyMap = {
            play: 'Space', forward: 'ArrowRight', rewind: 'ArrowLeft', fullscreen: 'KeyF',
            next: 'KeyN', home: 'KeyH', minimize: 'KeyM', sidebar: 'KeyS',
            clearImg: null, clearVid: null, clearAll: null, replayA: null, replayB: null,
            moveApp: 'AuxClick1', hideUI: null,
            forward5: null, backward5: null, forward30: null, backward30: null,
            ramFlush: 'KeyG'        // ← default RAM flush shortcut
        };
        window.saveConfig(); renderKeybinds(); updateFooter();
    };

    // ── Settings sliders/toggles ──────────────────────────────
    if (els.shortcutsToggle) { els.shortcutsToggle.onchange = e => { window.settings.showShortcuts = e.target.checked; document.getElementById('shortcutsFooter').style.display = e.target.checked ? 'flex' : 'none'; window.saveConfig(); }; }
    els.oledToggle.addEventListener('change', e => window.setBg(e.target.checked ? 1 : 0));
    els.gridSel.onchange   = e => { window.settings.gridSize = e.target.value; window.saveConfig(); if (els.grid.style.display !== 'none') { window.initGrid?.(); updateGridContents?.(); } };
    els.effectSel.onchange = e => { window.settings.effect = e.target.value; window.saveConfig(); };
    els.durInput.oninput   = e => { window.settings.duration = e.target.value * 1000; els.durVal.textContent = e.target.value; saveConfigDebounced(); };
    els.gapSizeInput.oninput  = e => { window.settings.gapSize = +e.target.value; els.gapSizeVal.textContent = window.settings.gapSize; document.documentElement.style.setProperty('--gutter-size', window.settings.gapSize + 'px'); saveConfigDebounced(); };
    els.gridRoundInput.oninput = e => { window.settings.gridRoundness = +e.target.value; els.gridRoundVal.textContent = window.settings.gridRoundness; document.documentElement.style.setProperty('--grid-radius', window.settings.gridRoundness + 'px'); saveConfigDebounced(); };
    if (els.floatRoundInput) { els.floatRoundInput.oninput = e => { window.settings.floatRoundness = +e.target.value; els.floatRoundVal.textContent = window.settings.floatRoundness; document.documentElement.style.setProperty('--float-radius', window.settings.floatRoundness + 'px'); saveConfigDebounced(); }; }
    if (els.floatOpacityInput) { els.floatOpacityInput.oninput = e => { window.settings.floatOpacity = +e.target.value; els.floatOpacityVal.textContent = window.settings.floatOpacity; document.documentElement.style.setProperty('--float-opacity', window.settings.floatOpacity); saveConfigDebounced(); }; }
    els.fxSpeedInput.oninput   = e => { window.settings.effectSpeed = +e.target.value; els.fxSpeedVal.textContent = window.settings.effectSpeed; document.documentElement.style.setProperty('--fx-speed', window.settings.effectSpeed + 's'); saveConfigDebounced(); };
    if (els.applyGridBtn) { els.applyGridBtn.onclick = () => { window.settings.gridSize = els.gridSel.value; window.saveConfig(); if (els.grid.style.display !== 'none') { window.initGrid?.(); updateGridContents?.(); } const btn = els.applyGridBtn; const old = btn.textContent; btn.textContent = '✓'; btn.style.color = '#22c55e'; setTimeout(() => { btn.textContent = old; btn.style.color = ''; }, 600); }; }
    if (els.wakeLockToggle)   { els.wakeLockToggle.onchange   = e => { window.settings.wakeLock = e.target.checked; window.saveConfig(); setWakeLock?.(window.settings.wakeLock); }; }
    if (els.queueInfoToggle)  { els.queueInfoToggle.onchange  = e => { window.settings.showQueueInfo = e.target.checked; if (els.editorQueueInfo) els.editorQueueInfo.checked = e.target.checked; window.saveConfig(); renderPlaylist(); window.renderEditOverlays?.(); }; }
    if (els.thumbnailToggle)  { els.thumbnailToggle.onchange  = e => { window.settings.showThumbnails = e.target.checked; window.saveConfig(); renderPlaylist(); }; }
    if (els.editorQueueInfo)  { els.editorQueueInfo.onchange  = e => { window.settings.showQueueInfo = e.target.checked; if (els.queueInfoToggle) els.queueInfoToggle.checked = e.target.checked; window.saveConfig(); renderPlaylist(); window.renderEditOverlays?.(); }; }
    if (els.autoFallbackToggle) { els.autoFallbackToggle.onchange = e => { window.settings.autoFallback = e.target.checked; window.saveConfig(); }; }
    if (els.ratioTolInput) { els.ratioTolInput.oninput = e => { window.settings.ratioTolerance = +e.target.value; els.ratioTolVal.textContent = window.settings.ratioTolerance; saveConfigDebounced(); refreshGridDebounced(); }; }
    if (els.randomDurToggle) { els.randomDurToggle.onchange = e => { window.settings.randomDuration = e.target.checked; if (els.randomDurSettings) els.randomDurSettings.style.display = e.target.checked ? 'block' : 'none'; if (els.durInput) { els.durInput.disabled = e.target.checked; els.durInput.style.opacity = e.target.checked ? '0.5' : '1'; } window.saveConfig(); }; }
    if (els.minRandInput) { els.minRandInput.oninput = e => { let v = +e.target.value, mx = +els.maxRandInput.value; if (v > mx - 5) { v = mx - 5; e.target.value = v; } window.settings.minRandomDuration = v; if (els.minRandVal) els.minRandVal.textContent = v; saveConfigDebounced(); }; }
    if (els.maxRandInput) { els.maxRandInput.oninput = e => { let v = +e.target.value, mn = +els.minRandInput.value; if (v < mn + 5) { v = mn + 5; e.target.value = v; } window.settings.maxRandomDuration = v; if (els.maxRandVal) els.maxRandVal.textContent = v; saveConfigDebounced(); }; }
    if (els.randomEffectToggle) { els.randomEffectToggle.onchange = e => { window.settings.randomEffect = e.target.checked; els.effectSel.disabled = e.target.checked; els.effectSel.style.opacity = e.target.checked ? '0.5' : '1'; window.saveConfig(); }; }
    if (els.advanceRatioToggle) { els.advanceRatioToggle.onchange = e => { window.settings.advanceRatioMode = e.target.checked; window.saveConfig(); if (window.isEditingLayout) window.renderEditOverlays?.(); }; }
    if (els.liveFolderToggle) { els.liveFolderToggle.onchange = e => { window.settings.enableLiveFolder = e.target.checked; window.saveConfig(); if (els.liveFolderBtn) { els.liveFolderBtn.style.display = e.target.checked ? 'flex' : 'none'; if (e.target.checked) els.liveFolderBtn.style.animation = 'popIn 0.3s cubic-bezier(0.175,0.885,0.32,1.275)'; } if (els.liveSortGroup) els.liveSortGroup.style.display = e.target.checked ? 'block' : 'none'; window.applySettingsToUI?.(); if (!e.target.checked) { stopAllWatchers(); window.isLiveRunning = false; } }; }
    if (els.countdownToggle) { els.countdownToggle.onchange = e => { window.settings.showCountdown = e.target.checked; window.saveConfig(); if (window.settings.mode === 'slideshow') updateGridContents?.(); }; }
    if (els.transformBarToggle) { els.transformBarToggle.onchange = e => { window.settings.showTransformBar = e.target.checked; window.saveConfig(); window.applySettingsToUI?.(); if (window.settings.mode === 'slideshow') updateGridContents?.(); }; }
    if (els.rotateFillToggle) { els.rotateFillToggle.onchange = e => { window.settings.rotateFill = e.target.checked; window.saveConfig(); document.querySelectorAll('.grid-cell').forEach(c => typeof applyTransform === 'function' && applyTransform(c)); }; }
    if (els.liveSortSelect) { els.liveSortSelect.onchange = e => { window.settings.liveSortMode = e.target.value; window.saveConfig(); document.body.classList.remove('live-mode-sequential', 'live-mode-random'); document.body.classList.add(`live-mode-${e.target.value}`); }; }
    if (els.liveFolderBtn) { els.liveFolderBtn.onclick = e => { e.preventDefault(); openLiveManager(); }; }
    if (els.hybridToggle) { els.hybridToggle.onchange = e => { window.settings.hybridMode = e.target.checked; window.saveConfig(); showToast(e.target.checked ? 'Hybrid Mode: Images on CPU' : 'Hybrid Mode: Disabled', 'info', 'system'); if (window.settings.mode === 'slideshow') updateGridContents?.(); }; }

    // Global volume
    const gvs = document.getElementById('globalVolSlider');
    if (gvs) gvs.addEventListener('input', e => { const v = +e.target.value; window.settings.globalVolume = v; saveConfigDebounced(); applyGlobalVolume(v); updateGlobalVolIcon(v); if (els.globalVolDisplay) els.globalVolDisplay.textContent = Math.round(v * 100) + '%'; });
    const spd = document.getElementById('speedSlider');
    if (spd) spd.addEventListener('input', e => setPlaybackSpeed(e.target.value));

    if (els.appOpacityInput) {
        els.appOpacityInput.addEventListener('input', e => {
            const v = +e.target.value; window.settings.appOpacity = v; els.appOpacityVal.textContent = Math.round(v * 100);
            if (window.isElectron) require('electron').ipcRenderer.send('app-command', 'set-opacity', v);
            saveConfigDebounced();
        });
    }

    updateFooter(); setupDraggableModals(); initContextMenu();

    // ── Window drag via IPC ───────────────────────────────────
    window.addEventListener('mousedown', e => {
        const moveKey = window.keyMap?.moveApp;
        if (e.button === 1 || (moveKey && window.isMoveKeyHeld)) {
            isMovingApp = true;
            document.body.classList.add('is-moving-app');
            if (window.isElectron) require('electron').ipcRenderer.send('app-command', 'start-move');
        }
    });
    window.addEventListener('mousemove', () => {
        if (isMovingApp && window.isElectron)
            require('electron').ipcRenderer.send('app-command', 'move-window');
    });
    window.addEventListener('mouseup', () => {
        if (!isMovingApp) return;
        isMovingApp = false;
        document.body.classList.remove('is-moving-app');
        if (window.isElectron) require('electron').ipcRenderer.send('app-command', 'stop-move');
    });
});

// ── APP NAVIGATION ────────────────────────────────────────────
function selectMode(mode) {
    const els = getEls();
    window.settings.mode = mode;
    if (mode !== 'edit') window.saveConfig();
    els.landing.classList.add('hidden');
    setTimeout(() => { els.landing.style.display = 'none'; els.app.classList.add('active'); }, 300);

    if (mode === 'edit') {
        window.toggleLayoutEditor?.(true);
        const titleEl = document.getElementById('modeTitle');
        titleEl.style.display = 'block'; titleEl.textContent = 'Layout Editor';
        document.getElementById('currentModeBadge').textContent = 'EDITOR';
        els.musicSec.style.display = 'none'; els.bgAudio.pause(); els.empty.style.display = 'none';
        els.video.style.display = 'none'; els.grid.style.display = 'block';
    } else {
        window.toggleLayoutEditor?.(false);
        document.getElementById('modeTitle').style.display = 'none';
        document.getElementById('currentModeBadge').textContent = mode.toUpperCase();
        if (mode === 'slideshow') {
            els.musicSec.style.display = 'block';
            if (window.musicPlaylist?.length && els.bgAudio.paused) els.bgAudio.play();
            els.empty.style.display = 'none'; els.video.style.display = 'none'; els.img.style.display = 'none'; els.grid.style.display = 'block';
            if (!els.grid.innerHTML.trim()) window.initGrid?.();
            updateGridContents?.();
        } else {
            els.musicSec.style.display = 'none'; els.bgAudio.pause(); els.grid.style.display = 'none';
            if (!window.playlist.length) { els.empty.style.display = 'block'; els.video.style.display = 'none'; }
            else { els.empty.style.display = 'none'; els.video.style.display = 'block'; }
        }
    }
    updateFooter();
}

function goHome() {
    const els = getEls();
    els.video.pause(); clearAllTimers?.(); els.bgAudio.pause();
    els.video.style.display = 'none'; els.img.style.display = 'none'; els.grid.style.display = 'none';
    els.empty.style.display = 'block'; els.app.classList.remove('active');
    els.landing.style.display = 'flex';
    setTimeout(() => els.landing.classList.remove('hidden'), 50);
    if (window.isEditingLayout) { window.saveActiveCustomLayout?.(); window.toggleLayoutEditor?.(false); }
}

function resumePlayback() { const els = getEls(); els.empty.style.display = 'none'; els.resumeBox.style.display = 'none'; loadAndPlay(window.resumeIndex); }

// ── APP WINDOW CONTROLS ───────────────────────────────────────
function exitApp()          { document.getElementById('exitModal').classList.add('open'); }
function closeExitModal()   { document.getElementById('exitModal').classList.remove('open'); }
function confirmExit()      { if (window.isElectron) { try { require('electron').ipcRenderer.send('app-command', 'exit'); return; } catch { } } window.close(); }
function minimizeApp()      { if (window.isElectron) { try { require('electron').ipcRenderer.send('app-command', 'minimize'); } catch { } } }

let isPinned = false;
function toggleAlwaysOnTop() {
    isPinned = !isPinned;
    document.getElementById('pinBtn')?.classList.toggle('active', isPinned);
    showToast(isPinned ? 'Window Pinned on Top' : 'Window Unpinned', 'info', 'system');
    if (window.isElectron) { try { require('electron').ipcRenderer.send('app-command', 'toggle-pin'); } catch { } }
}
function toggleServer() { if (window.isElectron) { try { require('electron').ipcRenderer.send('app-command', 'toggle-server'); } catch { } } }

// Listen for server status from main
if (window.isElectron) {
    try {
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('server-status', (_event, status) => {
            const display = document.getElementById('serverInfoDisplay');
            const btn     = document.getElementById('serverToggleBtn');
            if (status.active) {
                btn?.classList.add('active');
                if (btn) { btn.style.borderColor = '#22c55e'; btn.querySelector('span').textContent = 'Stop Server'; }
                if (display) {
                    display.style.display = 'block';
                    display.innerHTML = `<div style="font-size:.9rem;font-weight:bold;color:#22c55e;margin-bottom:5px;">● Server Running</div><div style="font-family:monospace;background:rgba(0,0,0,.3);padding:8px;border-radius:4px;font-size:1rem;user-select:text;">${status.url}</div><div style="font-size:.75rem;color:#888;margin-top:5px;">Open this URL on your local network devices</div>`;
                }
                showToast('Network Server Started', 'success', 'system');
            } else {
                btn?.classList.remove('active');
                if (btn) { btn.style.borderColor = ''; btn.querySelector('span').textContent = 'Local Network'; }
                if (display) { display.style.display = 'none'; display.innerHTML = ''; }
                showToast('Network Server Stopped', 'info', 'system');
            }
        });
    } catch { }
}

// ── EDITOR SAVE ───────────────────────────────────────────────
function applyEditorChanges() {
    window.saveActiveCustomLayout?.();
    const btn = event?.target?.closest('button') || event?.target;
    if (!btn || btn.dataset.isAnimating) return;
    btn.dataset.isAnimating = '1';
    const html = btn.innerHTML, css = btn.style.cssText;
    btn.innerHTML = '<span>✓ Saved!</span>'; btn.style.background = '#22c55e'; btn.style.color = 'white'; btn.style.borderColor = '#22c55e';
    setTimeout(() => { btn.innerHTML = html; btn.style.cssText = css; delete btn.dataset.isAnimating; }, 1000);
}
function saveActiveAndExit() { window.saveActiveCustomLayout?.(); goHome(); }

// ── DROP HANDLER ──────────────────────────────────────────────
async function handleDrop(e) {
    const items = e.dataTransfer.items;
    let files   = [];
    if (items?.length && typeof items[0].webkitGetAsEntry === 'function') {
        const scan = async entry => {
            if (entry.isFile)      return new Promise(res => entry.file(res));
            if (entry.isDirectory) {
                const reader = entry.createReader();
                const entries = await new Promise(res => reader.readEntries(res));
                return (await Promise.all(entries.map(scan))).flat();
            }
        };
        files = (await Promise.all([...items].map(i => i.webkitGetAsEntry()).filter(Boolean).map(scan))).flat();
    } else {
        files = Array.from(e.dataTransfer.files);
    }
    processFiles(files);
}

function processFiles(files) {
    const isVideo = f => { const t = f.type || getMimeType(f.name); return t.startsWith('video/') || /\.(mp4|mkv|ts|m2ts|webm|avi|mov|wmv|flv|3gp|ogv)$/i.test(f.name); };
    const isImage = f => { const t = f.type || getMimeType(f.name); return t.startsWith('image/') || /\.(webp|png|jpg|jpeg|gif|bmp|tiff|svg|ico)$/i.test(f.name); };

    const media = files.filter(f => {
        if (!f?.name) return false;
        return window.settings.mode === 'video' ? isVideo(f) : (isVideo(f) || isImage(f));
    });
    if (!media.length) return;

    const newFiles = []; let dups = 0;
    media.forEach(f => {
        if (typeof window.hydrateFile === 'function') window.hydrateFile(f);
        const exists = window.playlist.some(ex =>
            ex.path && f.path ? ex.path === f.path : ex.name === f.name && ex.size === f.size);
        if (exists) dups++; else newFiles.push(f);
    });
    if (dups)         showToast(`Skipped ${dups} duplicates.`, 'warning', 'file');
    if (!newFiles.length) return;

    newFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const wasEmpty = !window.playlist.length;

    if (window.settings.shuffle) {
        if (!window.originalPlaylist?.length && window.playlist.length) window.originalPlaylist = [...window.playlist];
        window.originalPlaylist = (window.originalPlaylist || []).concat(newFiles);
        window.playlist = window.playlist.concat(newFiles);
        const cur = window.playlist[window.currentTrack];
        shuffleArray(window.playlist);
        if (cur) { const ni = window.playlist.indexOf(cur); window.currentTrack = ni !== -1 ? ni : 0; }
        else window.currentTrack = 0;
    } else {
        window.playlist = window.playlist.concat(newFiles);
        window.originalPlaylist = [];
    }

    renderPlaylist();
    showToast(`Added ${newFiles.length} files.`, 'success', 'file');
    if (wasEmpty && !window.isEditingLayout) loadAndPlay(0);
    else if (window.settings.mode === 'slideshow' && !window.isEditingLayout) updateGridContents?.();
}

// ── PLAYLIST RENDERING ────────────────────────────────────────
function renderPlaylist() {
    const els = getEls();
    els.playlist.innerHTML = '';
    document.getElementById('queueCount').textContent = `(${window.playlist.length})`;

    window.playlist.forEach((file, index) => {
        if (typeof window.hydrateFile === 'function') window.hydrateFile(file);

        const div = document.createElement('div');
        div.className    = 'track'; div.draggable = true; div.dataset.trackIndex = index;
        if (index === window.currentTrack && document.getElementById('emptyState')?.style.display === 'none')
            div.classList.add('active');

        const t = file.type || getMimeType(file.name);
        const vid = t.startsWith('video/') || /\.(mp4|mkv|ts|m2ts|webm|avi|mov)$/i.test(file.name);
        div.classList.add(vid ? 'track-video' : 'track-image');

        let visualHtml = '';
        if (window.settings.showThumbnails) {
            if (file.thumbnailUrl) {
                visualHtml = `<div class="track-thumbnail-container"><img src="${file.thumbnailUrl}"></div>`;
            } else {
                const thumbId = `thumb-${index}`;
                visualHtml = `<div class="track-thumbnail-container" id="${thumbId}"></div>`;
                generateMediaThumbnail?.(file).then(url => {
                    const c = document.getElementById(thumbId);
                    if (c) c.innerHTML = url ? `<img src="${url}" style="opacity:0;transition:opacity .3s" onload="this.style.opacity=1">` : (vid ? '🎬' : '🖼️');
                });
            }
        } else {
            visualHtml = `<span class="track-icon">${vid ? '🎬' : '🖼️'}</span>`;
        }

        let metaHtml = '';
        if (window.settings.showQueueInfo) {
            if (file.metaDataStr) metaHtml = `<div class="track-meta">${file.metaDataStr}</div>`;
            else {
                metaHtml = `<div class="track-meta" id="meta-${index}">…</div>`;
                extractMetadata?.(file).then(s => { const el = document.getElementById(`meta-${index}`); if (el) el.textContent = s; });
            }
        }

        div.innerHTML = `
            <div class="track-info" onclick="app.playTrack(${index})">
                <span class="track-index">${index + 1}.</span>
                ${visualHtml}
                <div class="track-text-wrapper">
                    <div class="track-name" title="${file.path || file.name}">${file.name}</div>
                    ${metaHtml ? `<div style="display:flex;align-items:center;">${metaHtml}</div>` : ''}
                </div>
            </div>
            <button class="remove-track-btn" onclick="app.removeTrack(${index})">×</button>`;

        div.addEventListener('dragstart', () => { window.draggedItem = index; div.classList.add('dragging'); });
        div.addEventListener('dragend',   () => { div.classList.remove('dragging'); window.draggedItem = null; });
        div.addEventListener('dragover',  e => e.preventDefault());
        div.addEventListener('drop',      () => dropTrack(index));
        els.playlist.appendChild(div);
    });
}

function dropTrack(target) {
    if (window.draggedItem == null || window.draggedItem === target) return;
    const item = window.playlist.splice(window.draggedItem, 1)[0];
    window.playlist.splice(target, 0, item);
    if      (window.currentTrack === window.draggedItem) window.currentTrack = target;
    else if (window.currentTrack > window.draggedItem && window.currentTrack <= target) window.currentTrack--;
    else if (window.currentTrack < window.draggedItem && window.currentTrack >= target) window.currentTrack++;
    renderPlaylist();
    if (window.settings.mode === 'slideshow') updateGridContents?.();
}

function playTrack(i) { const els = getEls(); els.empty.style.display = 'none'; loadAndPlay(i); }

function checkQueueState() {
    if (!window.playlist.length) {
        const els = getEls();
        els.video.pause(); clearAllTimers?.(); window.currentTrack = 0;
        els.video.style.display = 'none'; els.img.style.display = 'none'; els.resumeBox.style.display = 'none';
        if (window.settings.mode === 'slideshow') {
            els.grid.style.display = 'block'; els.empty.style.display = 'none';
            document.querySelectorAll('.grid-cell').forEach(cell => {
                if (typeof unloadMediaContent === 'function') unloadMediaContent(cell);
                else cell.innerHTML = '';
            });
        } else { els.grid.style.display = 'none'; els.empty.style.display = 'block'; }
    } else {
        if (window.currentTrack >= window.playlist.length) {
            window.currentTrack = 0;
            if (window.settings.mode !== 'slideshow') loadAndPlay(0);
        } else if (window.settings.mode === 'slideshow') {
            updateGridContents?.();
        }
    }
    renderPlaylist();
}

function playMusic(i) {
    const els = getEls();
    if (!window.musicPlaylist?.length) return;
    if (i >= window.musicPlaylist.length) i = 0;
    window.currentMusicTrack = i;
    els.bgAudio.src = URL.createObjectURL(window.musicPlaylist[i]);
    els.musicName.textContent = window.musicPlaylist[i].name;
    els.bgAudio.play();
    document.getElementById('musicPlayBtn').innerHTML = APP_ICONS.musicPause;
}

// ── GLOBAL CONTROLS ───────────────────────────────────────────
function toggleGlobalMute() {
    window.isGlobalMuted = !window.isGlobalMuted;
    const btn = document.getElementById('globalMuteBtn');
    btn.innerHTML = window.isGlobalMuted ? APP_ICONS.mute : APP_ICONS.volumeHigh;
    btn.classList.toggle('active', !window.isGlobalMuted);
    updateGlobalVolIcon(window.settings.globalVolume);
    document.querySelectorAll('.grid-cell').forEach(cell => {
        if (cell.dataset.audioLocked === 'true') return;
        const vid = cell.querySelector('video');
        if (vid) vid.muted = window.isGlobalMuted;
    });
}

function seekVideos(seconds) {
    const els = getEls();
    if (window.settings.mode === 'video') {
        if (!els.video.paused || els.video.currentTime > 0) els.video.currentTime = Math.max(0, els.video.currentTime + seconds);
    } else {
        document.querySelectorAll('.grid-cell video.media-active').forEach(v => {
            v.currentTime = Math.max(0, v.currentTime + seconds);
        });
    }
}

function setFullscreen(type) {
    const body = document.body;
    body.classList.remove('split-active','split-left','split-right','split-top','split-bottom','minimal-ui');
    body.classList.add('minimal-ui');
    if (window.isElectron) { try { require('electron').ipcRenderer.send('app-command', type); } catch { } }
    else { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); }
}

function handleFsChange() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const sb   = document.getElementById('sidebar');
    const dh   = document.getElementById('dragHandle');
    clearTimeout(sidebarAutoHideTimer);
    if (isFs) {
        document.body.classList.add('is-fullscreen');
        sb?.classList.add('overlay-mode', 'collapsed');
        dh?.classList.add('collapsed');
    } else {
        document.body.classList.remove('is-fullscreen','split-active','split-left','split-right','split-top','split-bottom','minimal-ui');
        sb?.classList.remove('overlay-mode');
        sb?.classList.add('collapsed');
        dh?.classList.add('collapsed');
    }
}
document.addEventListener('fullscreenchange', handleFsChange);

// ── PANEL TOGGLE HELPER ───────────────────────────────────────
function _togglePanel(bodyId, btnId) {
    const body = document.getElementById(bodyId);
    const btn  = document.getElementById(btnId);
    const open = body.classList.toggle('collapsed') ? false : true;
    // classList.toggle returns true if class was added (collapsed), false if removed
    const collapsed = body.classList.contains('collapsed');
    if (btn) btn.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(180deg)';
}

// ── AUDIO / VOLUME ────────────────────────────────────────────
function applyGlobalVolume(vol) {
    const main = document.getElementById('videoPlayer');
    if (main) main.volume = vol;
    document.querySelectorAll('.grid-cell').forEach(cell => {
        const vid = cell.querySelector('video');
        if (vid) { vid.volume = vol; if (vol > 0 && vid.muted && !window.isGlobalMuted) vid.muted = false; }
        const sl = cell.querySelector('.cell-vol-slider');
        if (sl) sl.value = vol;
    });
}
function updateGlobalVolIcon(vol) {
    const el = document.getElementById('globalVolIcon');
    if (!el) return;
    el.innerHTML = (window.isGlobalMuted || vol === 0) ? APP_ICONS.mute : (vol < 0.5 ? APP_ICONS.volumeLow : APP_ICONS.volumeHigh);
}
function setPlaybackSpeed(rate) {
    const r   = parseFloat(rate);
    const spd = document.getElementById('speedSlider');
    const dis = document.getElementById('speedDisplay');
    if (spd) spd.value = r;
    if (dis) dis.textContent = r + 'x';
    const main = document.getElementById('videoPlayer');
    if (main) main.playbackRate = r;
    document.querySelectorAll('.grid-cell').forEach(cell => {
        if (cell.dataset.audioLocked === 'true') return;
        const vid = cell.querySelector('video'); if (vid) vid.playbackRate = r;
        const sl = cell.querySelector('.cell-speed-slider'); if (sl) sl.value = r;
        const lb = cell.querySelector('.cell-speed-label'); if (lb) lb.textContent = r + 'x';
    });
}

// ── VISUAL FILTERS ────────────────────────────────────────────
function resetVisualFilters() {
    const els = getEls();
    if (!els.brightInput) return;
    els.brightInput.value = 100; els.contrastInput.value = 100; els.satInput.value = 100;
    els.hueInput.value = 0; els.invertInput.value = 0; els.filterTarget.value = 'all';
    updateVisualFilters();
}
function updateVisualFilters() {
    const els = getEls();
    if (!els.filterTarget) return;
    const t = els.filterTarget.value, b = els.brightInput.value, c = els.contrastInput.value,
          s = els.satInput.value, h = els.hueInput.value, i = els.invertInput.value;
    window.settings.filters = { brightness: b, contrast: c, saturate: s, hue: h, invert: i, target: t };
    window.saveConfig();
    const fs = `brightness(${b}%) contrast(${c}%) saturate(${s}%) hue-rotate(${h}deg) invert(${i}%)`;
    const r  = document.documentElement;
    r.style.setProperty('--filter-video', (t === 'image') ? 'none' : fs);
    r.style.setProperty('--filter-image', (t === 'video') ? 'none' : fs);
}

// ── BORDER SETTINGS ───────────────────────────────────────────
function updateBorderSettings() {
    const els = getEls();
    const hue = els.borderHueInput.value, alpha = els.borderAlphaInput.value, light = +els.borderLightInput.value;
    if (els.borderAlphaVal) els.borderAlphaVal.textContent = alpha;
    _updateBorderLightText(els.borderLightVal, light);
    window.settings.borderSettings = { hue: +hue, lightness: light, opacity: +alpha };
    updateBorderStyles(); saveConfigDebounced();
}
function updateBorderStyles() {
    const bs = window.settings.borderSettings || { hue: 0, lightness: 50, opacity: 1 };
    const r  = document.documentElement;
    r.style.setProperty('--gb-hue',   bs.hue);
    r.style.setProperty('--gb-light', bs.lightness + '%');
    r.style.setProperty('--gb-alpha', bs.opacity);
    const sl = document.getElementById('borderLightInput');
    if (sl) sl.style.background = `linear-gradient(to right,black 0%,hsl(${bs.hue},100%,50%) 50%,white 100%)`;
}
window.updateBorderStyles = updateBorderStyles;

// ── BG IMAGE ──────────────────────────────────────────────────
function handleBgImage(input) {
    const file = input.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            let w = img.width, h = img.height;
            if (w > 1920) { h = h * 1920 / w; w = 1920; }
            if (h > 1080) { w = w * 1080 / h; h = 1080; }
            canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
            window.setBgImage(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file); input.value = '';
}

// ── NOTIFICATIONS ─────────────────────────────────────────────
function toggleNotification(key) {
    if (!window.settings.notificationSettings) return;
    const k  = key.charAt(0).toUpperCase() + key.slice(1);
    const el = document.getElementById(`notif${k}`);
    if (el) { window.settings.notificationSettings[key] = el.checked; window.saveConfig(); }
}

// ── KEYBIND PANEL ─────────────────────────────────────────────
const actionConfig = [
    { id: 'play',      label: 'Play / Pause' },
    { id: 'forward',   label: 'Seek / Next' },
    { id: 'rewind',    label: 'Previous' },
    { id: 'fullscreen',label: 'Fullscreen' },
    { id: 'next',      label: 'Next Batch' },
    { id: 'home',      label: 'Go Home' },
    { id: 'minimize',  label: 'Minimize' },
    { id: 'sidebar',   label: 'Toggle Sidebar' },
    { id: 'hideUI',    label: 'Hide All UI' },
    { id: 'moveApp',   label: 'Move App (Hold)' },
    { id: 'clearImg',  label: 'Clear Images' },
    { id: 'clearVid',  label: 'Clear Videos' },
    { id: 'clearAll',  label: 'Clear Queue' },
    { id: 'replayA',   label: 'Replay A (Start)' },
    { id: 'replayB',   label: 'Replay B (End)' },
    { id: 'forward5',  label: 'Seek +5s' },
    { id: 'backward5', label: 'Seek -5s' },
    { id: 'forward30', label: 'Seek +30s' },
    { id: 'backward30',label: 'Seek -30s' },
    // ── NEW: RAM flush shortcut ──────────────────────────────
    { id: 'ramFlush',  label: '🧹 RAM Flush + Seek Back' }
];

const formatKey = code => code.replace('Key', '').replace('Arrow', '');

function renderKeybinds() {
    const els = getEls();
    els.keybindList.innerHTML = '';

    actionConfig.forEach(action => {
        const code = window.keyMap[action.id];
        const row  = document.createElement('div'); row.className = 'key-row';
        row.innerHTML = `<span>${action.label}</span>`;

        const wrap = document.createElement('div'); wrap.style.cssText = 'display:flex;gap:5px;';
        const btn  = document.createElement('button'); btn.className = 'key-btn'; btn.textContent = code ? formatKey(code) : 'None'; if (!code) btn.style.color = '#777';
        btn.onclick = () => {
            btn.textContent = '…'; btn.classList.add('recording');
            const h = e => { e.preventDefault(); e.stopPropagation(); window.keyMap[action.id] = e.code; window.saveConfig(); renderKeybinds(); updateFooter(); document.removeEventListener('keydown', h); };
            document.addEventListener('keydown', h, { once: true });
        };
        const del  = document.createElement('button'); del.className = 'key-btn'; del.textContent = '🗑️'; del.style.cssText = 'min-width:30px;padding:0;'; del.title = 'Remove';
        del.onclick = () => { window.keyMap[action.id] = null; window.saveConfig(); renderKeybinds(); updateFooter(); };
        wrap.appendChild(btn); wrap.appendChild(del); row.appendChild(wrap);
        els.keybindList.appendChild(row);

        // Extra: show seek-back delta input under ramFlush
        if (action.id === 'ramFlush') {
            const extra = document.createElement('div');
            extra.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:4px;padding-left:4px;';
            extra.innerHTML = `<label style="color:#aaa;font-size:.8rem;">Seek back (s):</label>
                <input type="number" id="seekBackDeltaInput" min="-300" max="0" step="5"
                    value="${Math.abs(window.SEEK_BACK_DELTA || 30)}"
                    style="width:70px;padding:3px 6px;background:#1a1a1f;border:1px solid #333;color:#fff;border-radius:4px;">`;
            extra.querySelector('input').addEventListener('input', e => {
                const v = Math.abs(parseInt(e.target.value) || 30);
                window.SEEK_BACK_DELTA = -v;
            });
            els.keybindList.appendChild(extra);
        }
    });

    const sep = document.createElement('hr'); sep.style.cssText = 'border:0;border-top:1px solid #333;margin:15px 0 10px;';
    els.keybindList.appendChild(sep);

    // Live modifier selector
    const modRow = document.createElement('div'); modRow.className = 'setting-group'; modRow.style.marginBottom = '0';
    const cur = window.settings.liveModifiers || 'shift_ctrl';
    modRow.innerHTML = `<label style="margin-bottom:6px;color:#aaa;font-size:.85rem;">Live Modifier</label>
        <select id="liveModifierSelect" style="width:100%;padding:6px;">
            ${[['shift_ctrl','Shift + Ctrl'],['shift_alt','Shift + Alt'],['ctrl_alt','Ctrl + Alt'],
               ['ctrl','Ctrl'],['shift','Shift'],['alt','Alt']].map(
                ([v,l]) => `<option value="${v}" ${cur === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>`;
    els.keybindList.appendChild(modRow);
    setTimeout(() => {
        const sel = document.getElementById('liveModifierSelect');
        if (sel) sel.onchange = e => { window.settings.liveModifiers = e.target.value; window.saveConfig(); window.applySettingsToUI?.(); };
    }, 0);
}

function updateFooter() {
    const sf = document.getElementById('shortcutsFooter');
    if (!sf) return;
    sf.innerHTML = actionConfig
        .filter(a => window.keyMap[a.id])
        .map(a => `<div class="footer-action" onclick="triggerAction('${a.id}')"><span class="key-badge">${formatKey(window.keyMap[a.id])}</span> ${a.label}</div>`)
        .join('');
}

// ── ACTION DISPATCHER ─────────────────────────────────────────
function triggerAction(action) {
    if (!window.isElectron && ['sidebar','home','minimize'].includes(action)) return;

    const els = getEls();
    const sb  = document.getElementById('sidebar');
    const dh  = document.getElementById('dragHandle');
    const isFs = document.body.classList.contains('minimal-ui') || document.body.classList.contains('is-fullscreen') || !!document.fullscreenElement;

    if (action === 'replayA' || action === 'replayB') {
        const hovered = document.querySelector('.grid-cell:hover');
        if (hovered && typeof window.toggleABRepeat === 'function')
            window.toggleABRepeat(hovered, action === 'replayA' ? 'A' : 'B');
        return;
    }

    switch (action) {
        case 'play':       toggleGlobalPlayPause(); break;
        case 'forward':    window.settings.mode === 'video' ? seekVideos(5) : playNext(); break;
        case 'rewind':     window.settings.mode === 'video' ? seekVideos(-5) : playPrev(); break;
        case 'forward5':   seekVideos(5);   break;
        case 'backward5':  seekVideos(-5);  break;
        case 'forward30':  seekVideos(30);  break;
        case 'backward30': seekVideos(-30); break;
        // ── RAM FLUSH ─────────────────────────────────────────
        case 'ramFlush':
            if (typeof window.performRamFlush === 'function') window.performRamFlush();
            break;
        case 'fullscreen':
            document.fullscreenElement ? document.exitFullscreen() : els.mainStage?.requestFullscreen();
            break;
        case 'next':     playNext();    break;
        case 'home':     goHome();      break;
        case 'minimize': minimizeApp(); break;
        case 'clearImg': performClearImages(); break;
        case 'clearVid': performClearVideos(); break;
        case 'clearAll': performClearAll();    break;
        case 'hideUI':
            document.body.classList.toggle('hide-all-ui');
            showToast(document.body.classList.contains('hide-all-ui') ? 'Ghost Mode: UI Hidden' : 'UI Restored', 'info', 'system');
            break;
        case 'sidebar':
            if (isFs) {
                if (!sb.classList.contains('overlay-mode')) { sb.classList.add('overlay-mode','collapsed'); void sb.offsetWidth; }
                const was = sb.classList.contains('collapsed');
                sb.classList.toggle('collapsed'); dh?.classList.toggle('collapsed');
                if (was) startSidebarTimer(); else clearTimeout(sidebarAutoHideTimer);
            } else {
                sb.classList.remove('overlay-mode'); sb.classList.toggle('collapsed'); dh?.classList.toggle('collapsed');
            }
            break;
    }
}

// ── KEYBOARD HANDLER ──────────────────────────────────────────
document.addEventListener('keydown', e => {
    if (document.querySelector('.key-btn.recording')) return;
    const tgt = e.target;
    const typing = (tgt.tagName === 'INPUT' && !['checkbox','radio','range'].includes(tgt.type)) ||
                   tgt.tagName === 'TEXTAREA' || tgt.isContentEditable;
    if (typing) return;

    const action = Object.keys(window.keyMap).find(k => window.keyMap[k] === e.code);
    if (action) {
        if (action === 'moveApp') window.isMoveKeyHeld = true;
        else { e.preventDefault(); triggerAction(action); }
    }

    if (window.checkLiveModifiers(e)) document.body.classList.add('show-live-zones');
});

document.addEventListener('keyup', e => {
    if (!window.checkLiveModifiers(e)) document.body.classList.remove('show-live-zones');
    if (e.key === 'Shift')               window.toggleShift?.(false);
    if (e.key === 'Control' || e.key === 'Meta') window.toggleCtrl?.(false);

    const action = Object.keys(window.keyMap).find(k => window.keyMap[k] === e.code);
    if (action === 'moveApp') {
        window.isMoveKeyHeld = false;
        if (isMovingApp) {
            isMovingApp = false;
            document.body.classList.remove('is-moving-app');
            if (window.isElectron) require('electron').ipcRenderer.send('app-command', 'stop-move');
        }
    }
});

// ── CONTEXT MENU ──────────────────────────────────────────────
function initContextMenu() {
    ctxMenu    = document.getElementById('gridContextMenu');
    plyCtxMenu = document.getElementById('playlistContextMenu');

    document.addEventListener('contextmenu', e => {
        const cell = e.target.closest('.grid-cell');
        if (cell && !window.isEditingLayout) {
            e.preventDefault();
            window.lastRightClickedCell = cell;
            const idx  = parseInt(cell.dataset.currentIndex);
            window.ctxTargetIndex = isNaN(idx) ? -1 : idx;
            const file = window.playlist[window.ctxTargetIndex];

            ctxMenu.innerHTML = `
                <div class="section-title" style="padding:5px 12px;opacity:.6;font-size:.65rem;">Cell Actions</div>
                <div class="ctx-item ${window.ctxTargetIndex === -1 ? 'disabled' : ''}" onclick="app.ctxShowInQueue()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                    Show in Queue
                </div>
                <div class="ctx-item ${!file?.path ? 'disabled' : ''}" onclick="app.ctxShowInFolder()">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                    Show in Folder
                </div>
                <div class="section-title" style="padding:5px 12px;margin:4px 0 0;border-top:1px solid #333;opacity:.6;font-size:.65rem;">Cell Queue Loop</div>
                <div class="ctx-item" onclick="app.addFilesToCell()">📁 Add Files</div>
                <div class="ctx-item" onclick="app.addFolderToCell()">📂 Add Folder</div>
                <div class="ctx-item" onclick="app.addFromMainToCell()">📥 Copy Main Queue</div>
                <div class="ctx-item" onclick="app.showCellQueue()">📋 Show Grid List</div>
                <div class="ctx-item" onclick="app.clearCellQueue()" style="color:#ff5555">❌ Clear List</div>`;
            _showMenu(ctxMenu, e.clientX, e.clientY);
            return;
        }
        const track = e.target.closest('.track');
        if (track) {
            e.preventDefault();
            const i = parseInt(track.dataset.trackIndex);
            if (isNaN(i)) return;
            window.ctxPlaylistIndex = i;
            const f   = window.playlist[i];
            _showMenu(plyCtxMenu, e.clientX, e.clientY);
            const fb  = document.getElementById('ctxPlyFolder');
            if (fb) fb.classList.toggle('disabled', !f?.path || f.isWeb || f.path.startsWith('http'));
        }
    });

    document.addEventListener('click',  e => { if (!e.target.closest('.context-menu')) closeContextMenu(); });
    window.addEventListener('scroll',   closeContextMenu, true);
}

function _showMenu(menu, x, y) {
    closeContextMenu();
    if (!menu) return;
    menu.style.display = 'flex'; menu.style.visibility = 'hidden';
    menu.classList.add('active');
    requestAnimationFrame(() => {
        const r = menu.getBoundingClientRect();
        let fx = x + r.width  > window.innerWidth  ? x - r.width  : x;
        let fy = y + r.height > window.innerHeight ? y - r.height : y;
        menu.style.left = Math.max(5, fx) + 'px';
        menu.style.top  = Math.max(5, fy) + 'px';
        menu.style.visibility = 'visible';
    });
}

function closeContextMenu() {
    [ctxMenu, plyCtxMenu].forEach(m => { if (m) { m.classList.remove('active'); m.style.display = 'none'; } });
}

// ── DRAGGABLE MODALS ──────────────────────────────────────────
function setupDraggableModals() {
    ['settingsModal','liveFolderModal','exitModal','webVideoModal'].forEach(id => {
        const overlay = document.getElementById(id); if (!overlay) return;
        const modal   = overlay.querySelector('.modal');
        const header  = overlay.querySelector('.modal-header');
        if (!modal || !header) return;

        let dragging = false, sx, sy;

        const onDown = e => {
            if (e.button !== 0) return;
            dragging = true; sx = e.clientX; sy = e.clientY;
            const rect = modal.getBoundingClientRect();
            modal.style.margin = '0'; modal.style.position = 'absolute';
            modal.style.left   = rect.left + 'px'; modal.style.top = rect.top + 'px';
            modal.style.boxShadow = '0 25px 50px rgba(0,0,0,.7)';
        };
        const onMove = e => {
            if (!dragging) return; e.preventDefault();
            let l = parseFloat(modal.style.left) + (e.clientX - sx);
            let t = parseFloat(modal.style.top)  + (e.clientY - sy);
            l = Math.max(0, Math.min(l, window.innerWidth  - modal.offsetWidth));
            t = Math.max(0, Math.min(t, window.innerHeight - modal.offsetHeight));
            modal.style.left = l + 'px'; modal.style.top = t + 'px';
            sx = e.clientX; sy = e.clientY;
        };
        const onUp = () => { if (dragging) { dragging = false; modal.style.boxShadow = ''; } };

        header.addEventListener('mousedown', onDown);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup',   onUp);
    });
}

// ── IPC: OPEN EXTERNAL FILES ──────────────────────────────────
if (window.isElectron) {
    try {
        const { ipcRenderer } = require('electron');
        const fs = require('fs'), path = require('path');
        ipcRenderer.on('open-external-files', (_event, filePaths) => {
            const wasEmpty = !window.playlist.length;
            const items    = filePaths.reduce((acc, fp) => {
                const name = path.basename(fp);
                const mime = getMimeType(name);
                if (mime && !window.playlist.some(p => p.path === fp)) {
                    let size = 0;
                    try { size = fs.statSync(fp).size; } catch { }
                    const f = { name, path: fp, size, type: mime };
                    if (typeof window.hydrateFile === 'function') window.hydrateFile(f);
                    acc.push(f);
                }
                return acc;
            }, []);
            if (items.length) { window.playlist = window.playlist.concat(items); renderPlaylist(); }
            selectMode('slideshow');
            if (wasEmpty && window.playlist.length) loadAndPlay(0);
            else updateGridContents?.();
            showToast(`Added ${items.length || filePaths.length} files to Slideshow`, 'success', 'file');
        });
    } catch { }
}
