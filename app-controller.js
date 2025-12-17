/* --- app-controller.js --- */

const APP_ICONS = {
    play: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"></path></svg>`,
    pause: `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`,
    mute: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`,
    volumeHigh: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
    volumeLow: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
    musicPlay: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"></path></svg>`,
    musicPause: `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`,
    trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
};

// --- GLOBAL STATE ---
window.liveWatchers = [];
window.processingFiles = new Set();
window.lastLiveCellIndex = -1; 
window.liveSelectedIndices = []; 
window.currentLiveZonePointer = 0; 
window.liveFileQueue = [];
window.isProcessingLiveQueue = false;
window.fileDebounceMap = new Map();
window.isLiveRunning = false; 

// Sidebar Timer State
let sidebarAutoHideTimer = null;

// --- HELPER: CHECK LIVE SELECTION MODIFIERS ---
window.checkLiveModifiers = function(e) {
    const s = (window.settings && window.settings.liveModifiers) ? window.settings.liveModifiers : 'shift_ctrl';
    const ctrl = e.ctrlKey || e.metaKey;
    const shift = e.shiftKey;
    const alt = e.altKey;

    if (s === 'shift_ctrl') return shift && ctrl;
    if (s === 'shift_alt') return shift && alt;
    if (s === 'ctrl_alt') return ctrl && alt;
    if (s === 'ctrl') return ctrl && !shift && !alt;
    if (s === 'shift') return shift && !ctrl && !alt;
    if (s === 'alt') return alt && !shift && !ctrl;
    return shift && ctrl; 
};

function getReadableModifiers() {
    const s = (window.settings && window.settings.liveModifiers) ? window.settings.liveModifiers : 'shift_ctrl';
    const map = {
        'shift_ctrl': 'Shift + Ctrl',
        'shift_alt': 'Shift + Alt',
        'ctrl_alt': 'Ctrl + Alt',
        'ctrl': 'Ctrl',
        'shift': 'Shift',
        'alt': 'Alt'
    };
    return map[s] || 'Shift + Ctrl';
}

function getEls() {
    return {
        landing: document.getElementById('landingPage'), app: document.getElementById('appInterface'),
        video: document.getElementById('videoPlayer'), img: document.getElementById('imageViewer'),
        grid: document.getElementById('gridContainer'), playlist: document.getElementById('playlistContainer'),
        empty: document.getElementById('emptyState'), resumeBox: document.getElementById('resumeBox'),
        resumeName: document.getElementById('resumeName'), gridSel: document.getElementById('gridCountSelect'),
        effectSel: document.getElementById('effectSelect'), durInput: document.getElementById('slideTimeInput'),
        durVal: document.getElementById('slideTimeVal'), shuffleBtn: document.getElementById('shuffleBtn'),
        musicSec: document.getElementById('musicSection'), bgAudio: document.getElementById('bgAudio'),
        musicName: document.getElementById('musicName'), oledToggle: document.getElementById('oledToggle'),
        wakeLockToggle: document.getElementById('wakeLockToggle'), dropOverlay: document.getElementById('dropOverlay'),
        keybindList: document.getElementById('keybindList'), shortcutsFooter: document.getElementById('shortcutsFooter'),
        shortcutsToggle: document.getElementById('shortcutsToggle'), queueInfoToggle: document.getElementById('queueInfoToggle'),
        editorQueueInfo: document.getElementById('editorQueueInfo'), autoFallbackToggle: document.getElementById('autoFallbackToggle'), 
        accentPicker: document.getElementById('accentPicker'), bgPicker: document.getElementById('bgPicker'),
        layoutName: document.getElementById('layoutName'), savedLayoutsSelect: document.getElementById('savedLayoutsSelect'),
        gridFpsInput: document.getElementById('gridFpsInput'), gridFpsVal: document.getElementById('gridFpsVal'),
        gapSizeInput: document.getElementById('gapSizeInput'), gapSizeVal: document.getElementById('gapSizeVal'),
        gridRoundInput: document.getElementById('gridRoundInput'), gridRoundVal: document.getElementById('gridRoundVal'),
        ratioTolInput: document.getElementById('ratioTolInput'), ratioTolVal: document.getElementById('ratioTolVal'),
        randomDurToggle: document.getElementById('randomDurToggle'),
        randomEffectToggle: document.getElementById('randomEffectToggle'),
        
        liveFolderToggle: document.getElementById('liveFolderToggle'),
        liveFolderBtn: document.getElementById('liveFolderBtn'),
        liveSortSelect: document.getElementById('liveSortSelect'),
        liveSortGroup: document.getElementById('liveSortGroup'),
        
        mainStage: document.getElementById('mainStage'),
        
        playPauseBtn: document.getElementById('playPauseBtn'), globalMuteBtn: document.getElementById('globalMuteBtn'), 
        fxSpeedInput: document.getElementById('fxSpeedInput'), fxSpeedVal: document.getElementById('fxSpeedVal'),
        applyGridBtn: document.getElementById('applyGridBtn'), globalVolSlider: document.getElementById('globalVolSlider'),
        globalVolDisplay: document.getElementById('globalVolDisplay'), speedSlider: document.getElementById('speedSlider'),
        speedDisplay: document.getElementById('speedDisplay'), filterTarget: document.getElementById('filterTarget'),
        brightInput: document.getElementById('brightInput'), contrastInput: document.getElementById('contrastInput'),
        satInput: document.getElementById('satInput'), hueInput: document.getElementById('hueInput'), invertInput: document.getElementById('invertInput'),

        // BORDER SETTINGS INPUTS
        borderHueInput: document.getElementById('borderHueInput'),
        borderAlphaInput: document.getElementById('borderAlphaInput'),
        borderLightInput: document.getElementById('borderLightInput'),
        borderAlphaVal: document.getElementById('borderAlphaVal'),
        borderLightVal: document.getElementById('borderLightVal'),
        whiteMixContainer: document.getElementById('whiteMixContainer')
    };
}

function showToast(msg, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div'); toast.className = `toast-msg ${type}`;
    let icon = '✅'; if (type === 'warning') icon = '⚠️'; if (type === 'info') icon = 'ℹ️';
    toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => { if (toast.parentElement) toast.remove(); }, 300); }, 3000);
}

function getMimeType(filename) {
    if(!filename) return '';
    const ext = filename.split('.').pop().toLowerCase();
    const videoExts = ['mp4', 'mkv', 'webm', 'avi', 'mov', 'ts', 'm2ts', 'wmv', 'flv', '3gp', 'ogv'];
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'svg', 'ico'];
    if (videoExts.includes(ext)) return 'video/' + ext;
    if (imageExts.includes(ext)) return 'image/' + ext;
    return '';
}

function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
const saveConfigDebounced = debounce(() => window.saveConfig(), 500);
const refreshGridDebounced = debounce(() => {
    if (window.settings.mode === 'slideshow' && typeof updateGridContents === 'function') {
        updateGridContents();
    }
}, 200);

// --- SETTINGS APPLICATOR ---
window.applySettingsToUI = function() {
    const els = getEls();
    const s = window.settings;
    if (!s) return;

    window.setTheme(s.color, false);
    if(s.bgIndex !== -1) window.setBg(s.bgIndex, false);
    else if(s.customBg) window.setCustomBg(s.customBg, false);
    else if(s.bgImage) document.documentElement.style.setProperty('--bg-image', `url(${s.bgImage})`);

    if(els.gridSel) els.gridSel.value = s.gridSize;
    if(els.effectSel) els.effectSel.value = s.effect;

    if(els.durInput) { els.durInput.value = s.duration / 1000; els.durVal.innerText = s.duration / 1000; }
    if(els.gridFpsInput) { els.gridFpsInput.value = s.gridMaxFps; els.gridFpsVal.innerText = s.gridMaxFps == 60 ? "60 (Native)" : s.gridMaxFps; }
    if(els.gapSizeInput) { els.gapSizeInput.value = s.gapSize; els.gapSizeVal.innerText = s.gapSize; document.documentElement.style.setProperty('--gutter-size', s.gapSize + 'px'); }
    if(els.gridRoundInput) { els.gridRoundInput.value = s.gridRoundness; els.gridRoundVal.innerText = s.gridRoundness; document.documentElement.style.setProperty('--grid-radius', s.gridRoundness + 'px'); }
    if(els.fxSpeedInput) { els.fxSpeedInput.value = s.effectSpeed; els.fxSpeedVal.innerText = s.effectSpeed; document.documentElement.style.setProperty('--fx-speed', s.effectSpeed + 's'); }
    
    if(els.ratioTolInput) {
        const safeTol = (typeof s.ratioTolerance !== 'undefined') ? s.ratioTolerance : 0.3;
        els.ratioTolInput.value = safeTol;
        els.ratioTolVal.innerText = safeTol;
    }

    if (els.randomDurToggle) {
        els.randomDurToggle.checked = s.randomDuration;
        if (els.durInput) els.durInput.disabled = s.randomDuration;
        if (els.durInput && s.randomDuration) els.durInput.style.opacity = '0.5';
        else if (els.durInput) els.durInput.style.opacity = '1';
    }

    if (els.randomEffectToggle) {
        els.randomEffectToggle.checked = s.randomEffect;
        if (els.effectSel) els.effectSel.disabled = s.randomEffect;
        if (els.effectSel && s.randomEffect) els.effectSel.style.opacity = '0.5';
        else if (els.effectSel) els.effectSel.style.opacity = '1';
    }

    // Apply Border Settings
    const bs = s.borderSettings || { hue: 0, lightness: 50, opacity: 1.0 };
    if (els.borderHueInput) els.borderHueInput.value = bs.hue;
    if (els.borderAlphaInput) {
        els.borderAlphaInput.value = bs.opacity;
        els.borderAlphaVal.innerText = bs.opacity;
    }
    if (els.borderLightInput) {
        els.borderLightInput.value = bs.lightness;
        const light = bs.lightness;
        if (light < 10) els.borderLightVal.innerText = "Black";
        else if (light > 90) els.borderLightVal.innerText = "White";
        else if (light == 50) els.borderLightVal.innerText = "Pure Color";
        else if (light < 50) els.borderLightVal.innerText = "Dark Mix";
        else els.borderLightVal.innerText = "Light Mix";
    }
    if(window.updateBorderStyles) window.updateBorderStyles();

    if(els.globalVolSlider) { els.globalVolSlider.value = s.globalVolume; if(els.globalVolDisplay) els.globalVolDisplay.innerText = Math.round(s.globalVolume * 100) + '%'; }
    updateVisualFilters();
    if(els.brightInput) els.brightInput.value = s.filters.brightness;
    if(els.contrastInput) els.contrastInput.value = s.filters.contrast;
    if(els.satInput) els.satInput.value = s.filters.saturate;
    if(els.hueInput) els.hueInput.value = s.filters.hue;
    if(els.invertInput) els.invertInput.value = s.filters.invert;
    if(els.filterTarget) els.filterTarget.value = s.filters.target;

    if(els.wakeLockToggle) els.wakeLockToggle.checked = s.wakeLock;
    if(els.queueInfoToggle) els.queueInfoToggle.checked = s.showQueueInfo;
    
    const modKeys = getReadableModifiers();
    if(els.liveFolderToggle) {
        els.liveFolderToggle.checked = s.enableLiveFolder;
        els.liveFolderToggle.parentElement.title = `Enable watching folders for new content.\nTip: Hold ${modKeys} in Slideshow Mode to select specific Live Zones.`;
        if (els.liveSortGroup) els.liveSortGroup.style.display = s.enableLiveFolder ? 'block' : 'none';
    }
    
    if (els.liveSortSelect) {
        els.liveSortSelect.value = s.liveSortMode || 'sequential';
        document.body.classList.remove('live-mode-sequential', 'live-mode-random');
        document.body.classList.add(`live-mode-${els.liveSortSelect.value}`);
    }
    
    if(els.liveFolderBtn) {
        els.liveFolderBtn.style.display = s.enableLiveFolder ? 'flex' : 'none';
        els.liveFolderBtn.title = `Live Folder Motion Active\n• Click to manage watched folders\n• Tip: Hold ${modKeys} and click grid cells to select specific Live Zones.`;
    }

    if(els.editorQueueInfo) els.editorQueueInfo.checked = s.showQueueInfo;
    if(els.autoFallbackToggle) els.autoFallbackToggle.checked = s.autoFallback;
    if(els.shortcutsToggle) { els.shortcutsToggle.checked = s.showShortcuts; els.shortcutsFooter.style.display = s.showShortcuts ? 'flex' : 'none'; window.saveConfig(); }
    
    if(s.shuffle && els.shuffleBtn) els.shuffleBtn.classList.add('active');
    if(window.updateLayoutSelect) window.updateLayoutSelect();
};

window.app = {
    selectMode: (mode) => selectMode(mode),
    goHome: () => goHome(),
    resumePlayback: () => resumePlayback(),
    setCellType: (b,t) => window.setCellType(b,t),
    setFit: (b,f) => window.setFit(b,f),
    setAspectRatio: (b,r) => window.setAspectRatio(b,r),
    splitCell: (b,d) => window.splitCell(b,d),
    deleteCell: (b) => window.deleteCell(b),
    saveToLibrary: () => window.saveToLibrary(),
    loadLibraryItem: () => window.loadLibraryItem(),
    deleteLibraryItem: () => window.deleteLibraryItem(),
    exportLayouts: () => window.exportLayouts(),
    importLayouts: (i) => window.importLayouts(i),
    resetLayout: () => window.resetLayout(),
    saveActiveAndExit: () => saveActiveAndExit(),
    applyEditorChanges: () => applyEditorChanges(),
    playTrack: (i) => playTrack(i),
    removeTrack: (i) => removeTrack(i),
    setTheme: (c) => window.setTheme(c),
    setBg: (i) => window.setBg(i),
    setCustomBg: (c) => window.setCustomBg(c),
    handleBgImage: (i) => handleBgImage(i),
    setFullscreen: (t) => setFullscreen(t),
    exitApp: () => exitApp(),
    closeExitModal: () => closeExitModal(),
    confirmExit: () => confirmExit(),
    minimizeApp: () => minimizeApp(),
    toggleAlwaysOnTop: () => toggleAlwaysOnTop(),
    toggleServer: () => toggleServer(),
    toggleShift: (a) => window.toggleShift(a),
    toggleCtrl: (a) => window.toggleCtrl(a),
    performUndo: () => window.performUndo(),
    toggleGlobalMute: () => toggleGlobalMute(),
    toggleGlobalPlayPause: () => toggleGlobalPlayPause(),
    toggleMusicPanel: () => toggleMusicPanel(),
    toggleGridSettings: () => toggleGridSettings(),
    toggleBorderSettings: () => toggleBorderSettings(),
    updateBorderSettings: () => updateBorderSettings(),
    toggleTransitionSettings: () => toggleTransitionSettings(),
    setPlaybackSpeed: (r) => setPlaybackSpeed(r),
    updateVisualFilters: () => updateVisualFilters(),
    toggleVisualPanel: () => toggleVisualPanel(),
    resetVisualFilters: () => resetVisualFilters(),
    toggleOptionsPanel: () => toggleOptionsPanel(),
    toggleShortcutsPanel: () => toggleShortcutsPanel(),
    
    // LIVE FOLDER ACTIONS
    addLiveFolderDialog: () => addLiveFolderDialog(),
    openLiveManager: () => openLiveManager(),
    removeLiveFolder: (p) => removeLiveFolder(p),
    toggleLiveMotion: () => toggleLiveMotion(),
    clearLiveQueue: () => clearLiveQueue(),
    clearLiveSelection: () => window.app.clearLiveSelection(),
    toggleFolderState: (index) => toggleFolderState(index),

    // NEW CLEAR ACTIONS EXPORTED
    clearImg: () => performClearImages(),
    clearVid: () => performClearVideos(),
    clearAll: () => performClearAll()
};

window.app.clearLiveSelection = () => {
    window.liveSelectedIndices = []; 
    window.currentLiveZonePointer = 0; 
    document.querySelectorAll('.grid-cell').forEach(el => {
        el.classList.remove('live-zone');
        el.removeAttribute('data-live-order'); 
    });
    showToast("Live Zones Cleared", "info");
};

// --- START SIDEBAR TIMER FUNCTION ---
function startSidebarTimer() {
    clearTimeout(sidebarAutoHideTimer);
    const sb = document.getElementById('sidebar');
    const isFullscreen = document.body.classList.contains('minimal-ui') || document.fullscreenElement;
    
    // Only run timer if in Fullscreen mode and Sidebar is OPEN (not collapsed)
    if (isFullscreen && !sb.classList.contains('collapsed')) {
        sidebarAutoHideTimer = setTimeout(() => {
            // Double check hover state before hiding
            if (!sb.matches(':hover')) {
                sb.classList.add('collapsed');
            }
        }, 6500); // 10 Seconds
    }
}

// --- CLEARING LOGIC FUNCTIONS (REFACTORED) ---
function performClearAll() {
    if(window.playlist.length === 0) return;
    if(confirm("Clear the entire queue?")) {
        window.playlist = [];
        checkQueueState();
        showToast("Queue Cleared", 'info');
    }
}

function performClearImages() {
    const startCount = window.playlist.length;
    window.playlist = window.playlist.filter(f => getFileType(f) === 'video');
    if(startCount - window.playlist.length > 0) {
        checkQueueState();
        showToast(`Removed ${startCount - window.playlist.length} Images`, 'info');
    } else {
        showToast("No images found to clear", 'warning');
    }
}

function performClearVideos() {
    const startCount = window.playlist.length;
    window.playlist = window.playlist.filter(f => getFileType(f) === 'image');
    if(startCount - window.playlist.length > 0) {
        checkQueueState();
        showToast(`Removed ${startCount - window.playlist.length} Videos`, 'info');
    } else {
        showToast("No videos found to clear", 'warning');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if(window.applySettingsToUI) window.applySettingsToUI();
    if(window.renderGridOptions) window.renderGridOptions();
    if(window.settings && window.settings.wakeLock) setWakeLock(true);
    
    if (!window.settings.liveFolders) window.settings.liveFolders = [];
    window.isLiveRunning = false; 

    // --- SIDEBAR HOVER LISTENERS FOR AUTO-HIDE ---
    const sb = document.getElementById('sidebar');
    if (sb) {
        sb.addEventListener('mouseenter', () => {
            clearTimeout(sidebarAutoHideTimer);
        });
        sb.addEventListener('mouseleave', () => {
            const isFullscreen = document.body.classList.contains('minimal-ui') || document.fullscreenElement;
            if (isFullscreen) {
                startSidebarTimer();
            }
        });
    }

    // --- LISTENERS ---
    const folderLabel = document.querySelector('.primary-folder-btn');
    if (folderLabel) {
        folderLabel.addEventListener('click', async (e) => {
            if (window.isElectron && typeof require !== 'undefined') {
                e.preventDefault();
                const { ipcRenderer } = require('electron');
                const fs = require('fs');
                const path = require('path');
                const folderPaths = await ipcRenderer.invoke('select-dirs');
                if (!folderPaths || folderPaths.length === 0) return;
                const getFilesRecursively = (dir, fileList = []) => {
                    try {
                        const files = fs.readdirSync(dir);
                        files.forEach(file => {
                            if (file.startsWith('.')) return;
                            const fullPath = path.join(dir, file);
                            let stat; try { stat = fs.statSync(fullPath); } catch(e) { return; }
                            if (stat.isDirectory()) getFilesRecursively(fullPath, fileList);
                            else fileList.push(fullPath);
                        });
                    } catch(err) { console.error(err); }
                    return fileList;
                };
                showToast("Scanning folders...", "info");
                setTimeout(() => {
                    let allPaths = [];
                    folderPaths.forEach(p => getFilesRecursively(p, allPaths));
                    const virtualFiles = allPaths.map(filePath => {
                        const name = path.basename(filePath);
                        return { name: name, path: filePath, size: fs.statSync(filePath).size, type: getMimeType(name) };
                    });
                    if(virtualFiles.length === 0) showToast("No media files found.", "warning");
                    else processFiles(virtualFiles);
                }, 50);
            }
        });
    }

    document.getElementById('folderInput').addEventListener('change', function(e) { processFiles(Array.from(e.target.files)); this.value = ''; });
    document.getElementById('fileInput').addEventListener('change', function(e) { processFiles(Array.from(e.target.files)); this.value = ''; });

    window.addEventListener('dragenter', (e) => { if(e.dataTransfer.types.includes('Files')) window.dragCounter++; });
    window.addEventListener('dragleave', (e) => { if(e.dataTransfer.types.includes('Files')) window.dragCounter--; });
    window.addEventListener('dragover', (e) => { if(e.dataTransfer.types.includes('Files')) e.preventDefault(); });
    window.addEventListener('drop', (e) => { e.preventDefault(); window.dragCounter=0; const els = getEls(); if(els.dropOverlay) els.dropOverlay.classList.remove('active'); handleDrop(e); });

    document.getElementById('musicInput').addEventListener('change', (e) => { const els = getEls(); window.musicPlaylist = window.musicPlaylist.concat(Array.from(e.target.files)); if(window.musicPlaylist.length > 0 && els.bgAudio.paused) playMusic(0); e.target.value = ''; });
    document.getElementById('clearMusicBtn').onclick = () => { const els = getEls(); els.bgAudio.pause(); els.bgAudio.src = ""; window.musicPlaylist = []; window.currentMusicTrack = 0; els.musicName.innerText = "No music loaded"; document.getElementById('musicPlayBtn').innerHTML = APP_ICONS.musicPlay; };
    document.getElementById('bgAudio').addEventListener('ended', () => playMusic(window.currentMusicTrack + 1));
    document.getElementById('musicPlayBtn').onclick = () => { const els = getEls(); if (els.bgAudio.paused) { if (els.bgAudio.src) els.bgAudio.play(); else if (window.musicPlaylist.length > 0) playMusic(0); document.getElementById('musicPlayBtn').innerHTML = APP_ICONS.musicPause; } else { els.bgAudio.pause(); document.getElementById('musicPlayBtn').innerHTML = APP_ICONS.musicPlay; } };
    document.getElementById('musicVol').addEventListener('input', (e) => document.getElementById('bgAudio').volume = e.target.value);

    document.getElementById('videoPlayer').addEventListener('ended', playNext);
    document.getElementById('nextBtn').onclick = playNext;
    document.getElementById('prevBtn').onclick = playPrev; 
    document.getElementById('shuffleBtn').onclick = function() { window.settings.shuffle = !window.settings.shuffle; this.classList.toggle('active'); window.saveConfig(); if (window.settings.mode === 'slideshow') updateGridContents(); };
    document.getElementById('globalMuteBtn').onclick = toggleGlobalMute;
    document.getElementById('playPauseBtn').onclick = toggleGlobalPlayPause;
    
    document.getElementById('fsBtn').onclick = () => { if (document.body.classList.contains('minimal-ui') || document.fullscreenElement) { if (typeof require !== 'undefined') { try { require('electron').ipcRenderer.send('app-command', 'restore'); } catch(e){} } if (document.fullscreenElement) document.exitFullscreen(); document.body.classList.remove('minimal-ui', 'split-active', 'split-left', 'split-right', 'split-top', 'split-bottom'); } else setFullscreen('full'); };
    document.getElementById('toggleSidebarBtn').onclick = () => { document.getElementById('sidebar').classList.toggle('collapsed'); document.getElementById('dragHandle').classList.toggle('collapsed'); };

    // UPDATED CLEAR BUTTON HANDLERS
    document.getElementById('clearAllBtn').onclick = performClearAll;
    document.getElementById('clearImagesBtn').onclick = performClearImages;
    document.getElementById('clearVideosBtn').onclick = performClearVideos;

    const container = document.getElementById('playlistContainer');
    const btnAll = document.getElementById('filterAllBtn'); const btnImg = document.getElementById('filterImgBtn'); const btnVid = document.getElementById('filterVidBtn');
    function setActiveFilterBtn(activeBtn) { [btnAll, btnImg, btnVid].forEach(b => b.classList.remove('active')); activeBtn.classList.add('active'); }
    btnAll.onclick = () => { container.classList.remove('filter-images', 'filter-videos'); setActiveFilterBtn(btnAll); };
    btnImg.onclick = () => { container.classList.remove('filter-videos'); container.classList.add('filter-images'); setActiveFilterBtn(btnImg); };
    btnVid.onclick = () => { container.classList.remove('filter-images'); container.classList.add('filter-videos'); setActiveFilterBtn(btnVid); };

    // SETTINGS OPEN HANDLER - VISIBILITY FIX
    document.getElementById('settingsBtn').onclick = () => { 
        renderKeybinds(); 
        document.body.classList.add('settings-open'); 
        document.getElementById('settingsModal').classList.add('open'); 
    };
    
    // BUG FIX: Added missing clear shortcut keys to reset object
    document.getElementById('resetKeysBtn').onclick = () => { 
        window.keyMap = { 
            play: 'Space', forward: 'ArrowRight', rewind: 'ArrowLeft', 
            fullscreen: 'KeyF', next: 'KeyN', home: 'KeyH', 
            minimize: 'KeyM', sidebar: 'KeyS',
            clearImg: null, clearVid: null, clearAll: null
        }; 
        window.saveConfig(); 
        renderKeybinds(); 
        updateFooter(); 
    };
    
    const elsRef = getEls();
    if(elsRef.shortcutsToggle) { elsRef.shortcutsToggle.onchange = (e) => { window.settings.showShortcuts = e.target.checked; elsRef.shortcutsFooter.style.display = e.target.checked ? 'flex' : 'none'; window.saveConfig(); }; }

    const els = getEls();
    els.oledToggle.addEventListener('change', (e) => window.setBg(e.target.checked ? 1 : 0));
    
    els.gridSel.onchange = (e) => { window.settings.gridSize = e.target.value; window.saveConfig(); if(els.grid.style.display !== 'none') { window.initGrid(); updateGridContents(); } };
    els.effectSel.onchange = (e) => { window.settings.effect = e.target.value; window.saveConfig(); };
    
    els.durInput.oninput = (e) => { window.settings.duration = e.target.value*1000; els.durVal.innerText=e.target.value; saveConfigDebounced(); };
    els.gridFpsInput.oninput = (e) => { window.settings.gridMaxFps = parseInt(e.target.value); els.gridFpsVal.innerText = window.settings.gridMaxFps === 60 ? "60 (Native)" : window.settings.gridMaxFps; saveConfigDebounced(); if(els.grid.style.display !== 'none') { updateGridContents(); }};
    els.gapSizeInput.oninput = (e) => { window.settings.gapSize = parseInt(e.target.value); els.gapSizeVal.innerText = window.settings.gapSize; document.documentElement.style.setProperty('--gutter-size', window.settings.gapSize + 'px'); saveConfigDebounced(); };
    els.gridRoundInput.oninput = (e) => { window.settings.gridRoundness = parseInt(e.target.value); els.gridRoundVal.innerText = window.settings.gridRoundness; document.documentElement.style.setProperty('--grid-radius', window.settings.gridRoundness + 'px'); saveConfigDebounced(); };
    els.fxSpeedInput.oninput = (e) => { window.settings.effectSpeed = parseFloat(e.target.value); els.fxSpeedVal.innerText = window.settings.effectSpeed; document.documentElement.style.setProperty('--fx-speed', window.settings.effectSpeed + 's'); saveConfigDebounced(); };
    
    if(els.applyGridBtn) { els.applyGridBtn.onclick = () => { window.settings.gridSize = els.gridSel.value; window.saveConfig(); if (els.grid.style.display !== 'none') { window.initGrid(); updateGridContents(); } const btn = els.applyGridBtn; const old = btn.innerText; btn.innerText = "✓"; btn.style.color="#22c55e"; setTimeout(() => { btn.innerText = old; btn.style.color=""; }, 600); }; }
    
    if(els.wakeLockToggle) { els.wakeLockToggle.onchange = (e) => { window.settings.wakeLock = e.target.checked; window.saveConfig(); setWakeLock(window.settings.wakeLock); }; }
    if(els.queueInfoToggle) { els.queueInfoToggle.onchange = (e) => { window.settings.showQueueInfo = e.target.checked; window.saveConfig(); renderPlaylist(); }; }

    if(els.editorQueueInfo) { els.editorQueueInfo.onchange = (e) => { window.settings.showQueueInfo = e.target.checked; window.saveConfig(); if(window.renderEditOverlays) window.renderEditOverlays(); }; }
    if(els.autoFallbackToggle) { els.autoFallbackToggle.onchange = (e) => { window.settings.autoFallback = e.target.checked; window.saveConfig(); }; }
    
    if(els.ratioTolInput) {
        els.ratioTolInput.oninput = (e) => {
            window.settings.ratioTolerance = parseFloat(e.target.value);
            els.ratioTolVal.innerText = window.settings.ratioTolerance;
            saveConfigDebounced();
            refreshGridDebounced(); // Trigger updated grid behavior
        };
    }

    if(els.randomDurToggle) {
        els.randomDurToggle.onchange = (e) => {
            window.settings.randomDuration = e.target.checked;
            els.durInput.disabled = e.target.checked;
            els.durInput.style.opacity = e.target.checked ? '0.5' : '1';
            window.saveConfig();
        };
    }

    if(els.randomEffectToggle) {
        els.randomEffectToggle.onchange = (e) => {
            window.settings.randomEffect = e.target.checked;
            els.effectSel.disabled = e.target.checked;
            els.effectSel.style.opacity = e.target.checked ? '0.5' : '1';
            window.saveConfig();
        };
    }

    if(els.liveFolderToggle) {
        els.liveFolderToggle.onchange = (e) => {
            window.settings.enableLiveFolder = e.target.checked;
            window.saveConfig();
            if(els.liveFolderBtn) {
                els.liveFolderBtn.style.display = e.target.checked ? 'flex' : 'none';
                if(e.target.checked) els.liveFolderBtn.style.animation = "popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)";
            }
            if(els.liveSortGroup) {
                els.liveSortGroup.style.display = e.target.checked ? 'block' : 'none';
            }
            window.applySettingsToUI();
            if (!e.target.checked) {
                stopAllWatchers();
                window.isLiveRunning = false;
            }
        };
    }
    
    if(els.liveSortSelect) {
        els.liveSortSelect.onchange = (e) => {
            window.settings.liveSortMode = e.target.value;
            window.saveConfig();
            document.body.classList.remove('live-mode-sequential', 'live-mode-random');
            document.body.classList.add(`live-mode-${e.target.value}`);
        };
    }

    if (els.liveFolderBtn) {
        els.liveFolderBtn.title = "Live Folder Motion Active\n• Click to manage watched folders\n• Tip: Hold Shift + Ctrl and click grid cells to select specific Live Zones.";
        els.liveFolderBtn.onclick = (e) => {
            e.preventDefault();
            openLiveManager();
        };
    }

    const globalVolSlider = document.getElementById('globalVolSlider');
    if (globalVolSlider) {
        globalVolSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value); window.settings.globalVolume = val; saveConfigDebounced();
            applyGlobalVolume(val); updateGlobalVolIcon(val); if(els.globalVolDisplay) els.globalVolDisplay.innerText = Math.round(val * 100) + '%';
        });
    }
    const speedSlider = document.getElementById('speedSlider');
    if (speedSlider) speedSlider.addEventListener('input', (e) => setPlaybackSpeed(e.target.value));

    updateFooter();
    
    // SETUP DRAGGABLE MODALS
    setupDraggableModals(); 
});

// --- LIVE FOLDER LOGIC ---
function syncWatchers() {
    if (!window.isLiveRunning) {
        window.liveWatchers.forEach(item => { if(item.watcher) item.watcher.close(); });
        window.liveWatchers = [];
        return;
    }
    const enabledFolders = window.settings.liveFolders.filter(f => f.enabled);
    for (let i = window.liveWatchers.length - 1; i >= 0; i--) {
        const watcherObj = window.liveWatchers[i];
        const stillExists = enabledFolders.some(f => f.path === watcherObj.path);
        if (!stillExists) {
            if (watcherObj.watcher) watcherObj.watcher.close();
            window.liveWatchers.splice(i, 1);
        }
    }
    enabledFolders.forEach(folder => {
        const isWatching = window.liveWatchers.some(w => w.path === folder.path);
        if (!isWatching) {
            activateFolderWatcher(folder.path);
        }
    });
}

function openLiveManager() {
    renderLiveFolderList();
    document.body.classList.add('settings-open'); 
    document.getElementById('liveFolderModal').classList.add('open');
}

function activateFolderWatcher(targetDir) {
    if (window.liveWatchers.some(w => w.path === targetDir)) return;
    const watcher = createWatcher(targetDir);
    window.liveWatchers.push({ path: targetDir, watcher: watcher });
}

function stopAllWatchers() {
    window.liveWatchers.forEach(item => { if(item.watcher) item.watcher.close(); });
    window.liveWatchers = [];
}

async function addLiveFolderDialog() {
    if (!window.isElectron || typeof require === 'undefined') return showToast("PC Only", "warning");
    const { ipcRenderer } = require('electron');
    const folderPaths = await ipcRenderer.invoke('select-dirs');
    
    if (folderPaths && folderPaths.length > 0) {
        if (!window.settings.enableLiveFolder) {
            window.settings.enableLiveFolder = true;
            document.getElementById('liveFolderToggle').checked = true;
            window.applySettingsToUI();
        }
        if (!window.isLiveRunning) {
            window.isLiveRunning = true;
            showToast("Live Motion Started", "success");
        }
        if (window.liveWatchers.length === 0 && window.settings.liveFolders.length === 0) setupLiveUI();
        
        folderPaths.forEach(dir => {
            const exists = window.settings.liveFolders.some(f => f.path === dir);
            if (!exists) {
                window.settings.liveFolders.push({ path: dir, enabled: true });
            }
        });
        window.saveConfig(); 
        syncWatchers(); 
        if(document.getElementById('liveFolderModal').classList.contains('open')) {
            renderLiveFolderList();
        }
    }
}

function setupLiveUI() {
    app.selectMode('slideshow');
}

async function waitForFileStability(filePath, timeout = 10000) {
    const fs = require('fs');
    let lastSize = -1;
    const interval = 500; 
    let elapsed = 0;

    return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
            elapsed += interval;
            if (elapsed > timeout) { 
                clearInterval(timer); 
                reject('Timeout waiting for file stability'); 
            }
            fs.stat(filePath, (err, stats) => {
                if (err) return; 
                const currentSize = stats.size;
                if (currentSize > 0 && currentSize === lastSize) {
                    clearInterval(timer);
                    resolve(stats);
                }
                lastSize = currentSize;
            });
        }, interval);
    });
}

function createWatcher(targetDir) {
    const fs = require('fs');
    const path = require('path');
    try {
        const watcher = fs.watch(targetDir, { recursive: false }, (eventType, filename) => {
            if (!filename) return;
            const fullPath = path.join(targetDir, filename);
            if (window.fileDebounceMap.has(fullPath)) {
                clearTimeout(window.fileDebounceMap.get(fullPath));
            }
            const timerId = setTimeout(() => {
                window.fileDebounceMap.delete(fullPath);
                checkAndQueueFile(fullPath, filename);
            }, 100); 
            window.fileDebounceMap.set(fullPath, timerId);
        });
        return watcher;
    } catch (e) {
        console.error("Failed to watch path:", targetDir, e);
        showToast("Error watching folder: " + targetDir, "warning");
        return null;
    }
}

function checkAndQueueFile(fullPath, filename) {
    if (window.processingFiles.has(fullPath)) return;
    const exists = window.playlist.some(p => p.path === fullPath);
    if (exists) return; 

    const fs = require('fs');
    fs.access(fullPath, fs.constants.F_OK, (err) => {
        if (!err) {
            const mime = getMimeType(filename);
            if (mime) {
                window.processingFiles.add(fullPath);
                waitForFileStability(fullPath)
                    .then((stats) => {
                        window.liveFileQueue.push({
                            name: filename,
                            path: fullPath,
                            size: stats.size,
                            type: mime,
                            isLive: true
                        });
                        processLiveQueue();
                    })
                    .catch(err => console.warn("Stability check failed:", err))
                    .finally(() => {
                        window.processingFiles.delete(fullPath);
                    });
            }
        }
    });
}

async function processLiveQueue() {
    if (window.isProcessingLiveQueue) return;
    if (window.liveFileQueue.length === 0) return;

    window.isProcessingLiveQueue = true;

    while (window.liveFileQueue.length > 0) {
        const fileData = window.liveFileQueue.shift();
        window.playlist.push(fileData);
        const newIndex = window.playlist.length - 1;
        renderPlaylist();
        const container = document.getElementById('playlistContainer');
        if(container) container.scrollTop = container.scrollHeight;

        if (window.settings.mode === 'slideshow') {
            const wasEmpty = injectLiveUpdate(newIndex);
            const delay = wasEmpty ? 200 : 1500; 
            await new Promise(r => setTimeout(r, delay)); 
        } else {
            loadAndPlay(newIndex);
            await new Promise(r => setTimeout(r, 100));
        }
    }
    window.isProcessingLiveQueue = false;
}

function injectLiveUpdate(newFileIndex) {
    let cells = Array.from(document.querySelectorAll('.grid-cell'));
    if (cells.length === 0) return false;

    const isGridEmpty = !cells.some(c => c.querySelector('img, video, canvas'));
    if (isGridEmpty) {
        window.currentLiveZonePointer = 0; 
        window.lastLiveCellIndex = -1;     
    }

    let targetCell = null;
    let targetIndex = -1;
    let candidatePool = [];
    
    if (window.liveSelectedIndices.length > 0) {
        candidatePool = window.liveSelectedIndices.map(idx => {
            return (cells[idx]) ? { cell: cells[idx], index: idx } : null;
        }).filter(item => item !== null);
    } else {
        candidatePool = cells.map((cell, index) => ({ cell, index }));
    }

    if (candidatePool.length === 0) return false;

    const sortMode = window.settings.liveSortMode || 'sequential';

    if (sortMode === 'sequential') {
        if (window.currentLiveZonePointer >= candidatePool.length) {
            window.currentLiveZonePointer = 0;
        }
        const selected = candidatePool[window.currentLiveZonePointer];
        targetCell = selected.cell;
        targetIndex = selected.index;
        window.currentLiveZonePointer++;
        if (window.currentLiveZonePointer >= candidatePool.length) {
            window.currentLiveZonePointer = 0;
        }
    } else {
        let available = candidatePool;
        if (candidatePool.length > 1 && window.lastLiveCellIndex !== -1) {
            available = candidatePool.filter(obj => obj.index !== window.lastLiveCellIndex);
        }
        if (available.length === 0) available = candidatePool;
        const rand = Math.floor(Math.random() * available.length);
        targetCell = available[rand].cell;
        targetIndex = available[rand].index;
    }

    if (targetCell) {
        const existingMedia = targetCell.querySelector('img, video, canvas');
        const wasEmpty = !existingMedia;
        window.lastLiveCellIndex = targetIndex;
        if (typeof mountMediaInCell === 'function') {
            mountMediaInCell(targetCell, newFileIndex, true);
        }
        return wasEmpty;
    }
    return false;
}

function toggleFolderState(index) {
    if (!window.settings.liveFolders[index]) return;
    const folder = window.settings.liveFolders[index];
    folder.enabled = !folder.enabled;
    window.saveConfig();
    syncWatchers();
    renderLiveFolderList();
}

function removeLiveFolder(pathToRemove) {
    const settingIdx = window.settings.liveFolders.findIndex(f => f.path === pathToRemove);
    if (settingIdx !== -1) {
        window.settings.liveFolders.splice(settingIdx, 1);
        window.saveConfig();
    }
    syncWatchers();
    renderLiveFolderList();
    if (window.settings.liveFolders.length === 0) {
        showToast("Watch List Empty", "info");
    }
}

function toggleLiveMotion() {
    if (window.settings.liveFolders.length === 0) return;
    window.isLiveRunning = !window.isLiveRunning;
    if (window.isLiveRunning) {
        syncWatchers();
        showToast("Live Motion Resumed", "success");
    } else {
        stopAllWatchers();
        showToast("Live Motion Paused", "info");
    }
    renderLiveFolderList();
}

function clearLiveQueue() {
    const initialCount = window.playlist.length;
    window.playlist = window.playlist.filter(file => !file.isLive);
    const removed = initialCount - window.playlist.length;
    renderPlaylist();
    if(window.settings.mode === 'slideshow') updateGridContents();
    showToast(`Removed ${removed} Live Files`, "info");
}

function renderLiveFolderList() {
    const list = document.getElementById('liveFolderList');
    list.innerHTML = '';
    
    if (window.settings.liveFolders.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">No folders in list</div>';
        return;
    }

    const stopAllRow = document.createElement('div');
    stopAllRow.style.padding = "10px";
    stopAllRow.style.borderBottom = "1px solid #333";
    stopAllRow.style.display = "flex";
    stopAllRow.style.justifyContent = "center";
    
    if (window.isLiveRunning) {
        stopAllRow.innerHTML = `
            <button class="lf-remove" style="background: #451a1a; color: #ff9999; border-color: #772222; font-weight: bold; width: 100%; padding: 8px; height:auto; max-height:none;" onclick="app.toggleLiveMotion()">
                🔴 Pause All Motion
            </button>
        `;
    } else {
        stopAllRow.innerHTML = `
            <button class="lf-remove" style="background: #1a4520; color: #99ff99; border-color: #227722; font-weight: bold; width: 100%; padding: 8px; height:auto; max-height:none;" onclick="app.toggleLiveMotion()">
                🟢 Resume All Motion
            </button>
        `;
    }
    list.appendChild(stopAllRow);

    window.settings.liveFolders.forEach((folder, index) => {
        const div = document.createElement('div');
        div.className = 'live-folder-item';
        const safePath = folder.path.replace(/\\/g, '\\\\');
        const rowOpacity = window.isLiveRunning ? '1' : '0.5';
        
        div.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; overflow:hidden; flex:1; opacity:${rowOpacity}; transition:opacity 0.2s;">
                <label class="switch" style="transform:scale(0.8); margin:0;">
                    <input type="checkbox" ${folder.enabled ? 'checked' : ''} onchange="app.toggleFolderState(${index})">
                    <span class="slider round white-toggle" style="${folder.enabled ? 'background-color:#22c55e; border-color:#22c55e;' : ''}"></span>
                </label>
                <div class="lf-path" title="${folder.path}" style="flex:1;">
                    ${folder.path}
                </div>
            </div>
            <button class="lf-remove" title="Remove from list" onclick="app.removeLiveFolder('${safePath}')" style="margin-left:10px;">
                ${APP_ICONS.trash}
            </button>
        `;
        list.appendChild(div);
    });
}

function selectMode(mode) {
    const els = getEls(); window.settings.mode = mode; if (mode !== 'edit') window.saveConfig(); 
    els.landing.classList.add('hidden'); setTimeout(() => { els.landing.style.display = 'none'; els.app.classList.add('active'); }, 300);
    if (mode === 'edit') {
        window.toggleLayoutEditor(true); const titleEl = document.getElementById('modeTitle'); titleEl.style.display = 'block'; titleEl.innerText = "Layout Editor"; document.getElementById('currentModeBadge').innerText = "EDITOR";
        els.musicSec.style.display = 'none'; els.bgAudio.pause(); els.empty.style.display = 'none'; els.video.style.display = 'none'; els.grid.style.display = 'block';
    } else {
        window.toggleLayoutEditor(false); document.getElementById('modeTitle').style.display = 'none'; document.getElementById('currentModeBadge').innerText = mode.toUpperCase();
        if (mode === 'slideshow') { 
            els.musicSec.style.display = 'block'; if (window.musicPlaylist.length > 0 && els.bgAudio.paused) els.bgAudio.play(); 
            els.empty.style.display = 'none'; els.video.style.display = 'none'; els.img.style.display = 'none'; els.grid.style.display = 'block';
            if (els.grid.innerHTML.trim() === '') window.initGrid(); updateGridContents();
        } else { 
            els.musicSec.style.display = 'none'; els.bgAudio.pause(); els.grid.style.display = 'none';
            if (window.playlist.length === 0) { els.empty.style.display = 'block'; els.video.style.display = 'none'; } else { els.empty.style.display = 'none'; els.video.style.display = 'block'; }
        }
    }
    updateFooter();
}

function goHome() { 
    const els = getEls();
    els.video.pause(); clearAllTimers(); els.bgAudio.pause();
    els.video.style.display = 'none'; els.img.style.display = 'none'; els.grid.style.display = 'none';
    els.empty.style.display = 'block'; els.app.classList.remove('active'); els.landing.style.display = 'flex';
    setTimeout(() => els.landing.classList.remove('hidden'), 50);
    if (window.isEditingLayout) { window.saveActiveCustomLayout(); window.toggleLayoutEditor(false); }
}

function resumePlayback() { const els = getEls(); els.empty.style.display = 'none'; els.resumeBox.style.display = 'none'; loadAndPlay(window.resumeIndex); }
function exitApp() { document.getElementById('exitModal').classList.add('open'); }
function closeExitModal() { document.getElementById('exitModal').classList.remove('open'); }
function confirmExit() { if (typeof require !== 'undefined') { try { require('electron').ipcRenderer.send('app-command', 'exit'); return; } catch(e) {} } window.close(); closeExitModal(); }
function minimizeApp() { if (typeof require !== 'undefined') { try { require('electron').ipcRenderer.send('app-command', 'minimize'); } catch(e){} } }

let isPinned = false;
function toggleAlwaysOnTop() {
    isPinned = !isPinned; const btn = document.getElementById('pinBtn');
    if (isPinned) { if(btn) btn.classList.add('active'); showToast("Window Pinned on Top", "info"); } 
    else { if(btn) btn.classList.remove('active'); showToast("Window Unpinned", "info"); }
    if (typeof require !== 'undefined') { try { require('electron').ipcRenderer.send('app-command', 'toggle-pin'); } catch(e) {} }
}

function toggleServer() { if (typeof require !== 'undefined') { try { require('electron').ipcRenderer.send('app-command', 'toggle-server'); } catch(e) {} } }
if (typeof require !== 'undefined') {
    try {
        const { ipcRenderer } = require('electron');
        ipcRenderer.on('server-status', (event, status) => {
            const display = document.getElementById('serverInfoDisplay'); const btn = document.getElementById('serverToggleBtn');
            if (status.active) {
                if(btn) { btn.classList.add('active'); btn.style.borderColor = '#22c55e'; btn.querySelector('span').innerText = "Stop Server"; }
                if(display) { display.style.display = 'block'; display.innerHTML = `<div style="font-size:0.9rem; font-weight:bold; color:#22c55e; margin-bottom:5px;">● Server Running</div><div style="font-family:monospace; background:rgba(0,0,0,0.3); padding:8px; border-radius:4px; font-size:1rem; user-select:text;">${status.url}</div><div style="font-size:0.75rem; color:#888; margin-top:5px;">Open this URL on your local network devices</div>`; }
                showToast("Network Server Started", "success");
            } else {
                if(btn) { btn.classList.remove('active'); btn.style.borderColor = ''; btn.querySelector('span').innerText = "Local Network"; }
                if(display) { display.style.display = 'none'; display.innerHTML = ''; }
                showToast("Network Server Stopped", "info");
            }
        });
    } catch(e) {}
}

function applyEditorChanges() {
    window.saveActiveCustomLayout(); 
    const btn = event.target.closest('button') || event.target;
    if(btn.dataset.isAnimating) return;
    btn.dataset.isAnimating = "true";
    const oldHtml = btn.innerHTML; const oldStyle = btn.style.cssText;
    btn.innerHTML = `<span>✓ Saved!</span>`; btn.style.background = "#22c55e"; btn.style.color = "white"; btn.style.borderColor = "#22c55e";
    setTimeout(() => { btn.innerHTML = oldHtml; btn.style.cssText = oldStyle; delete btn.dataset.isAnimating; }, 1000);
}

function saveActiveAndExit() { window.saveActiveCustomLayout(); goHome(); }

// --- FILE HELPERS ---
async function handleDrop(e) {
    const items = e.dataTransfer.items;
    let files = [];
    if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
        const scanFiles = async (entry) => {
            if (entry.isFile) return new Promise(resolve => entry.file(file => resolve(file)));
            else if (entry.isDirectory) {
                const dirReader = entry.createReader();
                const entries = await new Promise(resolve => dirReader.readEntries(resolve));
                return (await Promise.all(entries.map(e => scanFiles(e)))).flat();
            }
        };
        const promises = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i].webkitGetAsEntry();
            if (item) promises.push(scanFiles(item));
        }
        files = (await Promise.all(promises)).flat();
    } else { files = Array.from(e.dataTransfer.files); }
    processFiles(files);
}

function processFiles(files) {
    const mediaFiles = files.filter(file => {
        if (!file || !file.name) return false;
        const type = file.type || getMimeType(file.name);
        const isVideo = type.startsWith('video/') || /\.(mp4|mkv|ts|m2ts|webm|avi|mov|wmv|flv|3gp|ogv)$/i.test(file.name);
        const isImage = type.startsWith('image/') || /\.(webp|png|jpg|jpeg|gif|bmp|tiff|svg|ico)$/i.test(file.name);
        return window.settings.mode === 'video' ? isVideo : (isVideo || isImage);
    });
    if (mediaFiles.length === 0) return;
    const newFiles = [];
    let dupCount = 0;
    mediaFiles.forEach(newFile => {
        const exists = window.playlist.some(existing => {
            if (existing.path && newFile.path) return existing.path === newFile.path;
            return existing.name === newFile.name && existing.size === newFile.size;
        });
        if (exists) dupCount++; else newFiles.push(newFile);
    });
    if (dupCount > 0) showToast(`Skipped ${dupCount} duplicate file(s).`, 'warning');
    if (newFiles.length === 0) return;
    newFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, {numeric: true, sensitivity: 'base'}));
    const wasEmpty = window.playlist.length === 0;
    window.playlist = window.playlist.concat(newFiles);
    renderPlaylist();
    showToast(`Added ${newFiles.length} file(s) to queue.`, 'success');
    if (wasEmpty && !window.isEditingLayout) loadAndPlay(0);
    else if (window.settings.mode === 'slideshow' && !window.isEditingLayout) updateGridContents();
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('collapsed');
        document.getElementById('dragHandle').classList.add('collapsed');
    }
}

function renderPlaylist() {
    const els = getEls();
    els.playlist.innerHTML = '';
    document.getElementById('queueCount').innerText = `(${window.playlist.length})`;
    window.playlist.forEach((file, index) => {
        const div = document.createElement('div');
        div.className = 'track';
        div.draggable = true;
        if (index === window.currentTrack && els.empty.style.display === 'none') div.classList.add('active');
        const type = file.type || getMimeType(file.name);
        const isVideo = type.startsWith('video/') || /\.(mp4|mkv|ts|m2ts|webm|avi|mov)$/i.test(file.name);
        div.classList.add(isVideo ? 'track-video' : 'track-image');
        const icon = isVideo ? '🎬' : '🖼️';
        let metaHtml = '';
        if (window.settings.showQueueInfo) {
            if (file.metaDataStr) metaHtml = `<div class="track-meta">${file.metaDataStr}</div>`;
            else {
                metaHtml = `<div class="track-meta" id="meta-${index}">...</div>`;
                extractMetadata(file).then(str => { const span = document.getElementById(`meta-${index}`); if(span) span.innerText = str; });
            }
        }
        div.innerHTML = `
            <div class="track-info" onclick="app.playTrack(${index})">
                <span class="track-index">${index + 1}.</span>
                <span class="track-icon">${icon}</span>
                <div class="track-text-wrapper">
                    <div class="track-name" title="${file.path || file.name}">${file.name}</div>
                    ${metaHtml ? `<div style="display:flex; align-items:center;">${metaHtml}</div>` : ''}
                </div>
            </div>
            <button class="remove-track-btn" onclick="app.removeTrack(${index})">×</button>
        `;
        div.addEventListener('dragstart', () => { window.draggedItem = index; div.classList.add('dragging'); });
        div.addEventListener('dragend', () => { div.classList.remove('dragging'); window.draggedItem = null; });
        div.addEventListener('dragover', (e) => e.preventDefault());
        div.addEventListener('drop', () => dropTrack(index));
        els.playlist.appendChild(div);
    });
}

function dropTrack(targetIndex) {
    if (window.draggedItem === null || window.draggedItem === targetIndex) return;
    const item = window.playlist.splice(window.draggedItem, 1)[0];
    window.playlist.splice(targetIndex, 0, item);
    if (window.currentTrack === window.draggedItem) window.currentTrack = targetIndex;
    else if (window.currentTrack > window.draggedItem && window.currentTrack <= targetIndex) window.currentTrack--;
    else if (window.currentTrack < window.draggedItem && window.currentTrack >= targetIndex) window.currentTrack++;
    renderPlaylist();
    if(window.settings.mode === 'slideshow') updateGridContents();
}

function removeTrack(index) {
    window.playlist.splice(index, 1);
    if (index < window.currentTrack) window.currentTrack--;
    checkQueueState();
}

function playTrack(index) { 
    const els = getEls();
    els.empty.style.display = 'none'; 
    loadAndPlay(index);
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.add('collapsed');
        document.getElementById('dragHandle').classList.add('collapsed');
    }
}

function checkQueueState() {
    if (window.playlist.length === 0) {
        const els = getEls();
        els.video.pause(); clearAllTimers(); window.currentTrack = 0; 
        els.video.style.display = 'none'; els.img.style.display = 'none'; 
        els.resumeBox.style.display = 'none'; 
        if (window.settings.mode === 'slideshow') {
            els.grid.style.display = 'block'; els.empty.style.display = 'none';
            document.querySelectorAll('.grid-cell').forEach(cell => { if (typeof unloadMediaContent === 'function') unloadMediaContent(cell); else cell.innerHTML = ''; });
        } else { els.grid.style.display = 'none'; els.empty.style.display = 'block'; }
    } else {
        if (window.currentTrack >= window.playlist.length) { window.currentTrack = 0; loadAndPlay(0); }
        else if (window.settings.mode === 'slideshow') updateGridContents();
    }
    renderPlaylist();
}

function playMusic(index) {
    const els = getEls(); if(window.musicPlaylist.length === 0) return; if(index >= window.musicPlaylist.length) index = 0;
    window.currentMusicTrack = index; els.bgAudio.src = URL.createObjectURL(window.musicPlaylist[index]); els.musicName.innerText = window.musicPlaylist[index].name; els.bgAudio.play(); document.getElementById('musicPlayBtn').innerHTML = APP_ICONS.musicPause;
}

function toggleGlobalMute() {
    window.isGlobalMuted = !window.isGlobalMuted; const btn = document.getElementById('globalMuteBtn');
    btn.innerHTML = window.isGlobalMuted ? APP_ICONS.mute : APP_ICONS.volumeHigh; btn.classList.toggle('active', !window.isGlobalMuted);
    updateGlobalVolIcon(window.settings.globalVolume);
    document.querySelectorAll('.grid-cell').forEach(cell => {
        if (cell.dataset.audioLocked === 'true') return;
        const vid = cell.querySelector('video');
        if (vid) {
            vid.muted = window.isGlobalMuted;
            const controls = cell.querySelector('.cell-controls');
            if(controls) controls.querySelectorAll('button').forEach(b => { if (b.innerHTML.match(/🔊|🔉|🔇/)) b.innerText = vid.muted ? '🔇' : (vid.volume < 0.5 ? '🔉' : '🔊'); });
        }
    });
}

function toggleGlobalPlayPause() {
    window.isPaused = !window.isPaused; const btn = document.getElementById('playPauseBtn');
    btn.innerHTML = window.isPaused ? APP_ICONS.play : APP_ICONS.pause;
    document.querySelectorAll('video').forEach(vid => {
        if (window.isPaused) vid.pause();
        else { if ((vid.closest('.grid-cell') && !vid.classList.contains('media-old')) || (vid.id === 'videoPlayer' && window.settings.mode === 'video')) vid.play().catch(e => {}); }
    });
    document.querySelectorAll('.grid-cell').forEach(cell => {
        const img = cell.querySelector('img');
        if (img) {
            if (window.isPaused) { if(cell.dataset.timerId) clearTimeout(parseInt(cell.dataset.timerId)); }
            else if (!cell.dataset.locked) { 
                if(cell.dataset.timerId) clearTimeout(parseInt(cell.dataset.timerId)); 
                let duration = window.settings.duration;
                if (window.settings.randomDuration && typeof getRandomDuration === 'function') duration = getRandomDuration();
                const t = setTimeout(() => loadNextIntoCell(cell), duration); 
                cell.dataset.timerId = t; 
                window.cellTimers.push(t); 
            }
        }
    });
}

function setFullscreen(type) {
    const body = document.body;
    body.classList.remove('split-active', 'split-left', 'split-right', 'split-top', 'split-bottom', 'minimal-ui');
    if (type === 'full') {
        body.classList.add('minimal-ui'); 
        if (typeof require !== 'undefined') { try { require('electron').ipcRenderer.send('app-command', 'full'); } catch(e){} } 
        else { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(e => {}); }
    } else {
        body.classList.add('minimal-ui'); 
        if (typeof require !== 'undefined') { try { require('electron').ipcRenderer.send('app-command', type); } catch(e){} } 
        else { body.classList.add('split-active', `split-${type}`); if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(err => {}); }
    }
}

function handleFsChange() {
    const isFs = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    const sb = document.getElementById('sidebar');
    
    // Clear auto-hide timer immediately when changing state
    clearTimeout(sidebarAutoHideTimer);

    if (isFs) {
        document.body.classList.add('is-fullscreen');
        // Setup overlay mode start state
        if(sb) {
            sb.classList.add('overlay-mode');
            sb.classList.add('collapsed'); // FORCE HIDE on enter
        }
    } else { 
        document.body.classList.remove('is-fullscreen'); 
        document.body.classList.remove('split-active', 'split-left', 'split-right', 'split-top', 'split-bottom', 'minimal-ui'); 
        
        // Reset Sidebar
        if (sb) {
            sb.classList.remove('overlay-mode');
            sb.classList.add('collapsed'); // FORCE HIDE on exit to prevent sticking
            
            // Ensure drag handle matches sidebar state
            document.getElementById('dragHandle').classList.add('collapsed');
        }
    }
}
document.addEventListener('fullscreenchange', handleFsChange);
document.addEventListener('webkitfullscreenchange', handleFsChange);
document.addEventListener('mozfullscreenchange', handleFsChange);
document.addEventListener('MSFullscreenChange', handleFsChange);

const formatKey = (code) => code.replace('Key', '').replace('Arrow', '');
const actionConfig = [
    { id: 'play', label: 'Play / Pause' }, { id: 'forward', label: 'Seek / Next' }, { id: 'rewind', label: 'Previous' },
    { id: 'fullscreen', label: 'Fullscreen' }, { id: 'next', label: 'Next Batch' },
    { id: 'home', label: 'Go Home' }, { id: 'minimize', label: 'Minimize' }, { id: 'sidebar', label: 'Toggle Sidebar' },
    // NEW CLEAR SHORTCUTS
    { id: 'clearImg', label: 'Clear Images' },
    { id: 'clearVid', label: 'Clear Videos' },
    { id: 'clearAll', label: 'Clear Queue' }
];

function renderKeybinds() {
    const els = getEls(); els.keybindList.innerHTML = '';
    actionConfig.forEach(action => {
        const code = window.keyMap[action.id];
        const row = document.createElement('div'); row.className = 'key-row';
        row.innerHTML = `<span>${action.label}</span>`;
        const btnContainer = document.createElement('div'); btnContainer.style.display = 'flex'; btnContainer.style.gap = '5px';
        const btn = document.createElement('button'); btn.className = 'key-btn'; 
        btn.innerText = code ? formatKey(code) : 'None';
        if(!code) btn.style.color = '#777';
        btn.onclick = () => {
            btn.innerText = '...'; btn.classList.add('recording');
            const handler = (e) => {
                e.preventDefault(); e.stopPropagation(); 
                window.keyMap[action.id] = e.code; 
                window.saveConfig(); 
                renderKeybinds(); updateFooter(); 
                document.removeEventListener('keydown', handler);
            };
            document.addEventListener('keydown', handler, { once: true });
        };
        const delBtn = document.createElement('button');
        delBtn.className = 'key-btn'; delBtn.innerText = '🗑️'; delBtn.style.minWidth = '30px'; delBtn.style.padding = '0'; delBtn.title = 'Remove Shortcut';
        delBtn.onclick = () => { window.keyMap[action.id] = null; window.saveConfig(); renderKeybinds(); updateFooter(); };
        btnContainer.appendChild(btn); btnContainer.appendChild(delBtn); row.appendChild(btnContainer); els.keybindList.appendChild(row);
    });

    // --- ADDED LIVE MODIFIER SELECTION ---
    const separator = document.createElement('hr');
    separator.style.border = '0';
    separator.style.borderTop = '1px solid #333';
    separator.style.margin = '15px 0 10px 0';
    els.keybindList.appendChild(separator);

    const modRow = document.createElement('div');
    modRow.className = 'setting-group';
    modRow.style.marginBottom = '0';
    
    const currentMod = window.settings.liveModifiers || 'shift_ctrl';
    
    modRow.innerHTML = `
        <label style="margin-bottom:6px; color:#aaa; font-size:0.85rem;">Live Zone Selection Modifier</label>
        <select id="liveModifierSelect" style="width:100%; padding:6px; background:rgba(255,255,255,0.1); color:white; border:1px solid #444; border-radius:6px;">
            <option value="shift_ctrl" ${currentMod==='shift_ctrl'?'selected':''}>Shift + Ctrl</option>
            <option value="shift_alt" ${currentMod==='shift_alt'?'selected':''}>Shift + Alt</option>
            <option value="ctrl_alt" ${currentMod==='ctrl_alt'?'selected':''}>Ctrl + Alt</option>
            <option value="shift" ${currentMod==='shift'?'selected':''}>Shift Only</option>
            <option value="ctrl" ${currentMod==='ctrl'?'selected':''}>Ctrl Only</option>
            <option value="alt" ${currentMod==='alt'?'selected':''}>Alt Only</option>
        </select>
    `;
    
    els.keybindList.appendChild(modRow);
    
    // Add listener to new dropdown
    setTimeout(() => {
        const sel = document.getElementById('liveModifierSelect');
        if(sel) {
            sel.onchange = (e) => {
                window.settings.liveModifiers = e.target.value;
                window.saveConfig();
                window.applySettingsToUI(); // To update tooltips
            };
        }
    }, 0);
}

function updateFooter() {
    const els = getEls();
    let html = ''; 
    actionConfig.forEach(action => {
        const code = window.keyMap[action.id];
        if(code) html += `<div class="footer-action" onclick="triggerAction('${action.id}')"><span class="key-badge">${formatKey(code)}</span> ${action.label}</div>`;
    });
    els.shortcutsFooter.innerHTML = html;
}

function triggerAction(action) {
    if (document.getElementById('landingPage').style.display !== 'none' && action !== 'home' && action !== 'minimize') return;
    const els = getEls();
    switch(action) {
        case 'play': toggleGlobalPlayPause(); break;
        case 'forward': if (window.settings.mode === 'video') els.video.currentTime += 5; else playNext(); break;
        case 'rewind': if (window.settings.mode === 'video') els.video.currentTime -= 5; else playPrev(); break;
        case 'fullscreen': document.fullscreenElement ? document.exitFullscreen() : document.getElementById('mainStage').requestFullscreen(); break;
        case 'next': playNext(); break;
        case 'home': goHome(); break;
        case 'minimize': minimizeApp(); break;
        
        // BUG FIX: Call functions directly to ensure they work even if buttons are hidden/unfocused
        case 'clearImg': performClearImages(); break;
        case 'clearVid': performClearVideos(); break;
        case 'clearAll': performClearAll(); break;

        // UPDATED SIDEBAR LOGIC (Fullscreen Overlay + Timer)
        case 'sidebar': 
            const sb = document.getElementById('sidebar');
            const isFullscreen = document.body.classList.contains('minimal-ui') || document.fullscreenElement;

            if (isFullscreen) {
                if (!sb.classList.contains('overlay-mode')) {
                    sb.classList.add('overlay-mode');
                    sb.classList.add('collapsed'); // Ensure it starts collapsed if just switching
                    void sb.offsetWidth; // Trigger reflow
                }
                
                const wasClosed = sb.classList.contains('collapsed');
                // Toggle it
                sb.classList.toggle('collapsed');
                
                // If we just OPENED it (it was closed), start timer
                if (wasClosed) {
                    startSidebarTimer();
                } else {
                    clearTimeout(sidebarAutoHideTimer);
                }
            } else {
                sb.classList.remove('overlay-mode');
                sb.classList.toggle('collapsed'); 
                document.getElementById('dragHandle').classList.toggle('collapsed'); 
            }
            break;
    }
}

document.addEventListener('keydown', (e) => {
    if (document.querySelector('.key-btn.recording')) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    const action = Object.keys(window.keyMap).find(key => window.keyMap[key] === e.code);
    if (action) { e.preventDefault(); triggerAction(action); }

    // LIVE ZONE SELECTION VISIBILITY
    // Show border when Configured Modifiers are held
    if (window.checkLiveModifiers(e)) {
        if (!document.body.classList.contains('show-live-zones')) {
            document.body.classList.add('show-live-zones');
        }
    }
});

document.addEventListener('keyup', (e) => {
    // Hide border if modifiers are released
    if (!window.checkLiveModifiers(e)) {
        if (document.body.classList.contains('show-live-zones')) {
            document.body.classList.remove('show-live-zones');
        }
    }
    
    // Existing keyup logic (shift toggle etc)
    if (e.key === 'Shift') toggleShift(false); 
    if (e.key === 'Control' || e.key === 'Meta') toggleCtrl(false);
});

function toggleOptionsPanel() { const body = document.getElementById('optionsBody'); const btn = document.getElementById('optionsToggleBtn'); if (body.classList.contains('collapsed')) { body.classList.remove('collapsed'); btn.style.transform = 'rotate(180deg)'; } else { body.classList.add('collapsed'); btn.style.transform = 'rotate(0deg)'; } }
function toggleShortcutsPanel() { const body = document.getElementById('shortcutsBody'); const btn = document.getElementById('shortcutsToggleBtn'); if (body.classList.contains('collapsed')) { body.classList.remove('collapsed'); btn.style.transform = 'rotate(180deg)'; } else { body.classList.add('collapsed'); btn.style.transform = 'rotate(0deg)'; } }
function toggleMusicPanel() { const body = document.getElementById('musicBody'); const btn = document.getElementById('musicToggleBtn'); if (body.classList.contains('collapsed')) { body.classList.remove('collapsed'); btn.style.transform = 'rotate(180deg)'; } else { body.classList.add('collapsed'); btn.style.transform = 'rotate(0deg)'; } }
function toggleGridSettings() { const body = document.getElementById('gridSettingsBody'); const btn = document.getElementById('gridSettingsToggleBtn'); if (body.classList.contains('collapsed')) { body.classList.remove('collapsed'); btn.style.transform = 'rotate(180deg)'; } else { body.classList.add('collapsed'); btn.style.transform = 'rotate(0deg)'; } }
function toggleTransitionSettings() { const body = document.getElementById('transitionSettingsBody'); const btn = document.getElementById('transitionSettingsToggleBtn'); if (body.classList.contains('collapsed')) { body.classList.remove('collapsed'); btn.style.transform = 'rotate(180deg)'; } else { body.classList.add('collapsed'); btn.style.transform = 'rotate(0deg)'; } }
function toggleVisualPanel() { const body = document.getElementById('visualBody'); const btn = document.getElementById('visualToggleBtn'); if (body.classList.contains('collapsed')) { body.classList.remove('collapsed'); btn.style.transform = 'rotate(180deg)'; } else { body.classList.add('collapsed'); btn.style.transform = 'rotate(0deg)'; } }
function resetVisualFilters() { const els = getEls(); if(!els.brightInput) return; els.brightInput.value = 100; els.contrastInput.value = 100; els.satInput.value = 100; els.hueInput.value = 0; els.invertInput.value = 0; els.filterTarget.value = 'all'; updateVisualFilters(); }
function updateVisualFilters() {
    const els = getEls(); if (!els.filterTarget) return;
    const target = els.filterTarget.value;
    const b = els.brightInput.value; const c = els.contrastInput.value; const s = els.satInput.value; const h = els.hueInput.value; const i = els.invertInput.value;
    window.settings.filters = { brightness: b, contrast: c, saturate: s, hue: h, invert: i, target: target }; window.saveConfig();
    const filterString = `brightness(${b}%) contrast(${c}%) saturate(${s}%) hue-rotate(${h}deg) invert(${i}%)`;
    const root = document.documentElement;
    if (target === 'all') { root.style.setProperty('--filter-video', filterString); root.style.setProperty('--filter-image', filterString); } 
    else if (target === 'video') { root.style.setProperty('--filter-video', filterString); root.style.setProperty('--filter-image', 'none'); } 
    else if (target === 'image') { root.style.setProperty('--filter-video', 'none'); root.style.setProperty('--filter-image', filterString); }
}
function applyGlobalVolume(vol) {
    const mainVideo = document.getElementById('videoPlayer'); if (mainVideo) mainVideo.volume = vol;
    document.querySelectorAll('.grid-cell').forEach(cell => {
        const vid = cell.querySelector('video'); if (vid) { vid.volume = vol; if (vol > 0 && vid.muted && !window.isGlobalMuted) vid.muted = false; }
        const cellSlider = cell.querySelector('.cell-vol-slider'); if (cellSlider) cellSlider.value = vol;
        const controls = cell.querySelector('.cell-controls');
        if (controls) controls.querySelectorAll('button').forEach(b => { if(b.innerHTML.match(/🔊|🔉|🔇/)) b.innerHTML = vol === 0 ? '🔇' : (vol < 0.5 ? '🔉' : '🔊'); });
    });
}
function updateGlobalVolIcon(vol) {
    const globalVolIcon = document.getElementById('globalVolIcon');
    if (!globalVolIcon) return;
    if (window.isGlobalMuted || vol === 0) globalVolIcon.innerHTML = APP_ICONS.mute; else if (vol < 0.5) globalVolIcon.innerHTML = APP_ICONS.volumeLow; else globalVolIcon.innerHTML = APP_ICONS.volumeHigh;
}
function setPlaybackSpeed(rate) {
    const r = parseFloat(rate); 
    const speedSlider = document.getElementById('speedSlider');
    const speedDisplay = document.getElementById('speedDisplay');
    if (speedSlider) speedSlider.value = r; if (speedDisplay) speedDisplay.innerText = r + 'x';
    const mainVideo = document.getElementById('videoPlayer'); if (mainVideo) mainVideo.playbackRate = r;
    document.querySelectorAll('.grid-cell video').forEach(vid => { vid.playbackRate = r; });
}
function handleBgImage(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); const ctx = canvas.getContext('2d');
            const MAX_WIDTH = 1920; const MAX_HEIGHT = 1080;
            let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } 
            else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
            canvas.width = width; canvas.height = height; ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7); window.setBgImage(compressedDataUrl);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file); input.value = ''; 
}

/* --- BORDER SETTINGS LOGIC --- */

function toggleBorderSettings() {
    const body = document.getElementById('borderSettingsBody');
    const btn = document.getElementById('borderSettingsToggleBtn');
    if (body.classList.contains('collapsed')) {
        body.classList.remove('collapsed');
        btn.style.transform = 'rotate(180deg)';
    } else {
        body.classList.add('collapsed');
        btn.style.transform = 'rotate(0deg)';
    }
}

function updateBorderSettings() {
    const els = getEls();
    const hue = els.borderHueInput.value;
    const alpha = els.borderAlphaInput.value;
    const light = els.borderLightInput.value; // 0 to 100

    // Update Text Labels
    if (els.borderAlphaVal) els.borderAlphaVal.innerText = alpha;
    
    if (els.borderLightVal) {
        if (light < 10) els.borderLightVal.innerText = "Black";
        else if (light > 90) els.borderLightVal.innerText = "White";
        else if (light == 50) els.borderLightVal.innerText = "Pure Color";
        else if (light < 50) els.borderLightVal.innerText = "Dark Mix";
        else els.borderLightVal.innerText = "Light Mix";
    }

    // Save to Settings
    window.settings.borderSettings = {
        hue: parseInt(hue),
        lightness: parseInt(light),
        opacity: parseFloat(alpha)
    };
    
    // Visual Update
    updateBorderStyles();
    
    // Save Config
    if(typeof saveConfigDebounced === 'function') saveConfigDebounced();
}

function updateBorderStyles() {
    // Default: Hue 0 (Red), Lightness 50% (Color), Opacity 1.0
    const bs = window.settings.borderSettings || { hue: 0, lightness: 50, opacity: 1.0 };
    const root = document.documentElement;

    // 1. Update CSS Variables for the Borders
    root.style.setProperty('--gb-hue', bs.hue);
    root.style.setProperty('--gb-light', bs.lightness + '%');
    root.style.setProperty('--gb-alpha', bs.opacity);

    // 2. Update the Slider Background Gradient
    // This creates the visual: Black -> [Current Hue] -> White
    const slider = document.getElementById('borderLightInput');
    if(slider) {
        const pureColor = `hsl(${bs.hue}, 100%, 50%)`;
        slider.style.background = `linear-gradient(to right, black 0%, ${pureColor} 50%, white 100%)`;
    }
}

// --- DRAGGABLE MODAL LOGIC ---
function setupDraggableModals() {
    const modals = ['settingsModal', 'liveFolderModal', 'exitModal'];
    
    modals.forEach(id => {
        const overlay = document.getElementById(id);
        if (!overlay) return;
        
        const modal = overlay.querySelector('.modal');
        const header = overlay.querySelector('.modal-header');
        if (!modal || !header) return;

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        header.addEventListener('mousedown', (e) => {
            // Only left click
            if (e.button !== 0) return;
            
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;

            // Get current position relative to viewport
            const rect = modal.getBoundingClientRect();
            
            // Switch to absolute positioning to allow free movement
            // We set current calculated positions so it doesn't jump
            modal.style.margin = '0';
            modal.style.position = 'absolute';
            modal.style.left = rect.left + 'px';
            modal.style.top = rect.top + 'px';
            
            // Optional: visual cue
            modal.style.boxShadow = "0 25px 50px rgba(0,0,0,0.7)";
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault();

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // Calculate new position based on previous position + delta
            // We must parse the style.left/top because we just set them in mousedown
            const currentLeft = parseFloat(modal.style.left);
            const currentTop = parseFloat(modal.style.top);
            
            let newLeft = currentLeft + dx;
            let newTop = currentTop + dy;

            // --- BOUNDARY CHECKS (Keep inside App) ---
            const maxLeft = window.innerWidth - modal.offsetWidth;
            const maxTop = window.innerHeight - modal.offsetHeight;

            // Clamp X (Left/Right)
            if (newLeft < 0) newLeft = 0;
            if (newLeft > maxLeft) newLeft = maxLeft;

            // Clamp Y (Top/Bottom)
            if (newTop < 0) newTop = 0;
            if (newTop > maxTop) newTop = maxTop;

            // Apply new coordinates
            modal.style.left = newLeft + 'px';
            modal.style.top = newTop + 'px';

            // Reset start positions for next frame
            startX = e.clientX;
            startY = e.clientY;
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                modal.style.boxShadow = ""; // Restore default shadow
            }
        });
    });
}