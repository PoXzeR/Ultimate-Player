/* --- START OF FILE store.js --- */

// --- 1. ENVIRONMENT DETECTION ---
const isElectron = typeof process !== 'undefined' && typeof require !== 'undefined';
window.isElectron = isElectron;

let fs, path, electron;
let DATA_DIR;
let FILES = {};

// --- 2. SETUP STORAGE PATHS (PC ONLY) ---
if (isElectron) {
    try {
        fs = require('fs');
        path = require('path');
        electron = require('electron');

        // A. Portable Path (Next to Executable)
        const isPackaged = !process.defaultApp && !/node_modules/.test(process.execPath);
        const baseDir = isPackaged ? path.dirname(process.execPath) : __dirname;
        const portablePath = path.join(baseDir, 'data');

        // B. Safe Path (AppData - Persists after Updates)
        const appDataRoot = (electron.app || electron.remote?.app)?.getPath('userData') || 
                            (process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME));
        const safePath = path.join(appDataRoot, 'UltimatePlayer_Storage');

        // Logic: Use Portable if folder exists, otherwise default to Safe AppData
        if (fs.existsSync(portablePath)) {
            console.log("Portable Mode Detected.");
            DATA_DIR = portablePath;
        } else {
            console.log("Installed Mode: Using AppData.");
            DATA_DIR = safePath;
            if (!fs.existsSync(DATA_DIR)) {
                try { fs.mkdirSync(DATA_DIR, { recursive: true }); } 
                catch (e) { console.error("Critical: Cannot create AppData folder", e); }
            }
        }

        FILES = {
            settings: path.join(DATA_DIR, 'settings.json'),
            shortcuts: path.join(DATA_DIR, 'shortcuts.json'),
            layouts: path.join(DATA_DIR, 'layouts.json'),
            custom: path.join(DATA_DIR, 'custom_layout.json'),
            state: path.join(DATA_DIR, 'state.json')
        };
    } catch (e) {
        console.error("Electron Init Failed", e);
    }
} else {
    // --- BROWSER MODE (Mobile/Network) ---
    FILES = {
        settings: 'up_settings',
        shortcuts: 'up_shortcuts',
        layouts: 'up_layouts',
        custom: 'up_custom',
        state: 'up_state'
    };
}

// --- 3. I/O FUNCTIONS ---
function readJSON(fileKey, defaultVal) {
    if (isElectron) {
        try {
            if (fs.existsSync(fileKey)) return JSON.parse(fs.readFileSync(fileKey, 'utf-8')) || defaultVal;
        } catch (e) {}
    } else {
        try {
            const data = localStorage.getItem(fileKey);
            if (data) return JSON.parse(data);
        } catch (e) {}
    }
    return defaultVal;
}

// Internal Write
function writeInternal(fileKey, data) {
    if (isElectron) {
        try { fs.writeFileSync(fileKey, JSON.stringify(data, null, 2)); } catch(e) { console.error("Save failed", e); }
    } else {
        try { localStorage.setItem(fileKey, JSON.stringify(data)); } catch(e) {}
    }
}

// --- 4. GLOBAL STATE ---
window.playlist = []; 
window.musicPlaylist = [];
window.currentTrack = 0; 
window.currentMusicTrack = 0; 
window.resumeIndex = -1;
window.cellTimers = []; 
window.gridCellsRef = [];
window.layoutHistory = [];
window.liveWatchers = []; // Live Folder Watchers
window.isEditingLayout = false;
window.isPaused = false;
window.isGlobalMuted = true;
window.isCtrlDown = false;
window.isShiftDown = false;
window.isExternalUpdate = false;
window.liveSelectedIndices = []; // CHANGED: Array to support order (1st, 2nd, 3rd)
window.currentLiveZonePointer = 0;

const defaultKeys = { 
    play: 'Space', 
    forward: 'ArrowRight', 
    rewind: 'ArrowLeft', 
    fullscreen: null, 
    next: null, 
    home: null, 
    minimize: null, 
    sidebar: null,
    clearImg: null,
    clearVid: null,
    clearAll: null
};
const appSync = new BroadcastChannel('ultimate_player_sync');

// --- 5. LOAD DATA ---
window.keyMap = readJSON(FILES.shortcuts, { ...defaultKeys });
window.savedLayouts = readJSON(FILES.layouts, []);
window.settings = readJSON(FILES.settings, {
    mode: 'video', duration: 5000, shuffle: false, color: '#6366f1',
    bgIndex: 0, customBg: null, bgImage: null, oled: false, wakeLock: false, 
    gridSize: "1", effect: 'none', effectSpeed: 0.8, gridMaxFps: 60,
    gapSize: 10, gridRoundness: 0,
    ratioTolerance: 0.3, 
    randomDuration: false, 
    randomEffect: false,   
    enableLiveFolder: false, // Default Disabled
    liveSortMode: 'sequential',
    liveModifiers: 'shift_ctrl', 
    liveFolders: [], 
    showShortcuts: true,
    showQueueInfo: false, autoFallback: true, globalVolume: 1.0,
    
    // NEW: Border Customization Settings
    borderSettings: {
        hue: 0,
        lightness: 50,
        opacity: 1.0
    },

    filters: { brightness: 100, contrast: 100, saturate: 100, hue: 0, invert: 0, target: 'all' }
});

// Ensure liveFolders exists
if (!window.settings.liveFolders) window.settings.liveFolders = [];
// Ensure borderSettings exists (for updates)
if (!window.settings.borderSettings) window.settings.borderSettings = { hue: 0, lightness: 50, opacity: 1.0 };

// --- 6. SAVE LOGIC (DEBOUNCE + FLUSH) ---
let saveTimer = null;

window.saveConfig = function(emitSync = true) {
    if (window.isExternalUpdate) return;
    
    // Clear pending timer
    if (saveTimer) clearTimeout(saveTimer);

    // Set new timer (500ms delay to prevent freeze while sliding)
    saveTimer = setTimeout(() => {
        performSave(emitSync);
        saveTimer = null;
    }, 500);
};

function performSave(emitSync) {
    writeInternal(FILES.settings, window.settings);
    writeInternal(FILES.layouts, window.savedLayouts);
    writeInternal(FILES.shortcuts, window.keyMap);
    if (emitSync) appSync.postMessage({ type: 'settings_updated' });
}

// FLUSH ON EXIT (Crucial for saving settings on close)
window.addEventListener('beforeunload', () => {
    if (saveTimer) {
        clearTimeout(saveTimer);
        performSave(false); // Force immediate save
    }
    if(window.playlist.length > 0) {
        writeInternal(FILES.state, { fileName: window.playlist[window.currentTrack].name });
    }
});

window.saveCustomLayout = (data) => writeInternal(FILES.custom, data);
window.getCustomLayout = () => readJSON(FILES.custom, null);
window.saveState = () => {}; 

// --- 7. HELPERS ---
appSync.onmessage = (event) => {
    if (event.data && event.data.type === 'settings_updated') {
        window.isExternalUpdate = true;
        window.settings = readJSON(FILES.settings, window.settings);
        
        // Safety checks
        if (!window.settings.liveFolders) window.settings.liveFolders = [];
        if (!window.settings.borderSettings) window.settings.borderSettings = { hue: 0, lightness: 50, opacity: 1.0 };
        
        window.savedLayouts = readJSON(FILES.layouts, []);
        window.keyMap = readJSON(FILES.shortcuts, { ...defaultKeys });
        
        if(window.renderGridOptions) window.renderGridOptions();
        if(window.applySettingsToUI) window.applySettingsToUI();
        if(window.updateFooter) window.updateFooter();
        window.isExternalUpdate = false;
    }
};

const bgThemes = [ { bg: '#0f0f13', sb: '#18181b', card: '#27272a' }, { bg: '#000000', sb: '#000000', card: '#111111' }, { bg: '#0b1120', sb: '#111827', card: '#1f2937' }, { bg: '#171717', sb: '#262626', card: '#404040' }, { bg: '#05100b', sb: '#0a1f16', card: '#122e22' }, { bg: '#160808', sb: '#290f0f', card: '#421616' }, { bg: '#0f0e16', sb: '#181624', card: '#252236' }, { bg: '#16110d', sb: '#241c15', card: '#362a20' } ];

window.setTheme = (c,s=true) => { window.settings.color=c; document.documentElement.style.setProperty('--accent',c); if(s) window.saveConfig(); };
window.setBg = (i,s=true) => { if(!bgThemes[i]) i=0; window.settings.bgIndex=i; window.settings.customBg=null; window.settings.bgImage=null; window.settings.oled=(i===1); document.documentElement.style.setProperty('--bg-image','none'); const t=bgThemes[i]; applyBg(t.bg,t.sb,t.card); const el=document.getElementById('oledToggle'); if(el) el.checked=(i===1); if(s) window.saveConfig(); };
window.setCustomBg = (hex,s=true) => { window.settings.bgIndex=-1; window.settings.customBg=hex; window.settings.bgImage=null; document.documentElement.style.setProperty('--bg-image','none'); const sb=adjustBrightness(hex,10); const card=adjustBrightness(hex,20); applyBg(hex,sb,card); const el=document.getElementById('oledToggle'); if(el) el.checked=false; if(s) window.saveConfig(); };
window.setBgImage = (url) => { window.settings.bgIndex=-1; window.settings.customBg=null; window.settings.bgImage=url; window.settings.oled=false; document.documentElement.style.setProperty('--bg-image',`url(${url})`); const el=document.getElementById('oledToggle'); if(el) el.checked=false; window.saveConfig(); };
function applyBg(bg,sb,card) { document.documentElement.style.setProperty('--bg-color',bg); document.documentElement.style.setProperty('--sidebar-bg',sb); document.documentElement.style.setProperty('--card-bg',card); }
function adjustBrightness(col,amt) { let usePound=false; if(col[0]=="#"){col=col.slice(1);usePound=true;} let num=parseInt(col,16); let r=(num>>16)+amt; if(r>255)r=255;else if(r<0)r=0; let b=((num>>8)&0x00FF)+amt; if(b>255)b=255;else if(b<0)b=0; let g=(num&0x0000FF)+amt; if(g>255)g=255;else if(g<0)g=0; return (usePound?"#":"")+(g|(b<<8)|(r<<16)).toString(16).padStart(6,0); }