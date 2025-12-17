const GRID_ICONS = {
    play: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"></path></svg>`,
    pause: `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg>`,
    mute: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`,
    sound: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
    soundLow: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>`,
    loop: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>`,
    snowflake: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="12" x2="22" y2="12"></line><line x1="12" y1="2" x2="12" y2="22"></line><path d="M20 16l-4-4 4-4"></path><path d="M4 8l4 4-4 4"></path><path d="M16 4l-4 4-4-4"></path><path d="M8 20l4-4 4 4"></path></svg>`,
    navLeft: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5"/></svg>`,
    navRight: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M13 17l5-5-5-5M6 17l5-5-5-5"/></svg>`
};

// --- RANDOM GENERATORS ---
const EFFECT_LIST = [
    'fade', 'zoom-in', 'zoom-out', 'slide-up', 'slide-down', 
    'slide-left', 'slide-right', 'spin', 'flip-x', 'flip-y', 
    'blur', 'elastic', 'flash', 'swing', 'glitch'
];

function getRandomEffect() {
    const idx = Math.floor(Math.random() * EFFECT_LIST.length);
    return EFFECT_LIST[idx];
}

function getRandomDuration() {
    // Random between 5000ms (5s) and 30000ms (30s)
    return Math.floor(Math.random() * (30000 - 5000 + 1)) + 5000;
}

// --- LAZY LOADING OBSERVER ---
const lazyObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const cell = entry.target;
        if (entry.isIntersecting) {
            if (!cell.classList.contains('media-loaded') && cell.dataset.lazyIndex) {
                renderMediaContent(cell, parseInt(cell.dataset.lazyIndex));
            }
        } else {
            if (cell.classList.contains('media-loaded')) {
                unloadMediaContent(cell);
            }
        }
    });
}, {
    root: null, 
    rootMargin: '200px', 
    threshold: 0.01
});

function updateGridContents() {
    if (typeof isEditingLayout !== 'undefined' && isEditingLayout) return;

    const els = getEls();
    gridCellsRef = Array.from(els.grid.querySelectorAll('.grid-cell'));
    
    gridCellsRef.forEach((cell, i) => {
        if(cell.dataset.locked === 'true') return;
        mountMediaInCell(cell, currentTrack + i);
    });
    
    if (!settings.shuffle) {
        nextQueueIndex = (currentTrack + gridCellsRef.length) % playlist.length;
    }
}

// --- RATIO LOGIC (Configurable Tolerance) ---
function checkRatioMatch(width, height, reqRatio, customTarget) {
    if (reqRatio === 'all') return true;
    if (!height || height === 0) return false;
    
    const r = width / height;
    
    // Use user setting or default to 0.3
    const tol = (typeof settings.ratioTolerance !== 'undefined') ? settings.ratioTolerance : 0.3;

    // AUTO: Matches if file ratio is within tolerance of the Cell's physical ratio
    if (reqRatio === 'auto') {
        if (!customTarget) return true; // Fallback if cell has no size yet
        return Math.abs(r - customTarget) <= tol; 
    }
    
    // STANDARD PRESETS
    // 1:1 = 1.0
    if (reqRatio === '1:1') return Math.abs(r - 1.0) <= tol;

    // 4:3 = 1.33
    if (reqRatio === '4:3') return Math.abs(r - 1.33) <= tol;

    // 16:9 = 1.77
    if (reqRatio === '16:9') return Math.abs(r - 1.77) <= tol;

    // 9:16 = 0.56
    if (reqRatio === '9:16') return Math.abs(r - 0.56) <= tol;
    
    return true;
}

// 1. LOGIC PHASE
function mountMediaInCell(cell, preferredIndex, isForced = false) {
    if (typeof isEditingLayout !== 'undefined' && isEditingLayout) return; 
    if (playlist.length === 0) return;
    
    // Drop Handler
    cell.ondragover = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; };
    cell.ondrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        
        // Internal Drag
        if (draggedItem !== null) {
            mountMediaInCell(cell, draggedItem, true);
            draggedItem = null; 
            return;
        }
        
        // External Drag
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            const startIdx = playlist.length;
            processFiles(files); 
            setTimeout(() => mountMediaInCell(cell, startIdx, true), 100); 
        }
    };

    // --- SELECTION LOGIC ---
    let finalIndex = -1;

    // PATH A: FORCED MODE
    if (isForced) {
        if (preferredIndex >= 0 && preferredIndex < playlist.length) {
            finalIndex = preferredIndex;
            cell.dataset.forcedContent = "true";
        }
    } 
    // PATH B: AUTO/SHUFFLE MODE
    else {
        delete cell.dataset.forcedContent;

        const activeSet = getActiveIndices();
        if(cell.dataset.currentIndex) activeSet.delete(parseInt(cell.dataset.currentIndex));
        
        const reqType = cell.dataset.contentType || 'all';
        const reqRatio = cell.dataset.aspectRatio || 'all';
        
        let autoTarget = null;
        if (reqRatio === 'auto') {
            const rect = cell.getBoundingClientRect();
            if (rect.width && rect.height) {
                autoTarget = rect.width / rect.height;
            }
        }

        // 1. Build Candidate List
        let validCandidates = [];
        
        // If Queue Info is OFF, ignore ratio checks completely
        const skipRatioCheck = (!settings.showQueueInfo || reqRatio === 'all');

        for (let i = 0; i < playlist.length; i++) {
            const file = playlist[i];
            const type = getFileType(file);
            
            // Type Filter
            if (reqType !== 'all' && type !== reqType) continue;
            
            // Ratio Filter
            let ratioPass = true;
            if (!skipRatioCheck && file.metaDataStr) {
                const match = file.metaDataStr.match(/^(\d+)x(\d+)/);
                if (match) {
                    const w = parseInt(match[1]);
                    const h = parseInt(match[2]);
                    if (!checkRatioMatch(w, h, reqRatio, autoTarget)) ratioPass = false;
                }
            }
            if (ratioPass) validCandidates.push(i);
        }

        // 2. Fallback Logic (Auto Match Fallback)
        // If no perfect match found, and Fallback is ON, ignore filters and take anything valid
        if (validCandidates.length === 0 && settings.autoFallback) {
             for (let i = 0; i < playlist.length; i++) {
                // Respect Type (Image/Video) still, but ignore Ratio
                if (reqType === 'all' || getFileType(playlist[i]) === reqType) {
                    validCandidates.push(i);
                }
            }
        }

        // 3. Selection
        if (validCandidates.length > 0) {
            // Remove currently playing duplicates
            let uniqueCandidates = validCandidates.filter(idx => !activeSet.has(idx));
            if (uniqueCandidates.length === 0) uniqueCandidates = validCandidates;

            if (settings.shuffle) {
                const rand = Math.floor(Math.random() * uniqueCandidates.length);
                finalIndex = uniqueCandidates[rand];
            } else {
                let match = uniqueCandidates.find(idx => idx >= preferredIndex);
                if (match === undefined) match = uniqueCandidates[0]; 
                finalIndex = match;
            }
        }
    }

    // --- APPLY RESULT ---
    unloadMediaContent(cell); 
    lazyObserver.unobserve(cell); 
    delete cell.dataset.lazyIndex;
    delete cell.dataset.currentIndex;
    delete cell.dataset.locked;

    if (finalIndex === -1) {
        if(!cell.querySelector('.no-content-msg')) {
            const msg = document.createElement('div');
            msg.className = 'no-content-msg';
            msg.innerHTML = `No Content<br><span style="font-size:0.6rem; opacity:0.7">Check Filters</span>`;
            msg.style.color = '#666';
            msg.style.textAlign = 'center';
            msg.style.fontSize = '0.8rem';
            msg.style.padding = '10px';
            msg.style.position = 'absolute';
            cell.appendChild(msg);
        }
        return;
    }

    cell.dataset.lazyIndex = finalIndex;
    cell.dataset.currentIndex = finalIndex; 
    lazyObserver.observe(cell);
}

// 2. UNLOAD PHASE
function unloadMediaContent(cell) {
    if (cell.dataset.activeUrl) {
        URL.revokeObjectURL(cell.dataset.activeUrl);
        delete cell.dataset.activeUrl;
    }
    if(cell.dataset.timerId) {
        clearTimeout(parseInt(cell.dataset.timerId));
        delete cell.dataset.timerId;
    }
    
    const oldMedia = cell.querySelectorAll('video:not(.media-old), img:not(.media-old), canvas:not(.media-old)');
    oldMedia.forEach(el => {
        el.classList.remove('media-active');
        el.classList.add('media-old');
        setTimeout(() => el.remove(), 1500);
    });

    const uiElements = cell.querySelectorAll('.media-title-overlay, .cell-controls, .cell-nav-btn, .no-content-msg, .audio-lock-btn');
    uiElements.forEach(el => el.remove());
    
    cell.classList.remove('media-loaded');
}

// HELPER: Late Validation (Metadata Loaded)
function validateMediaRatio(cell, width, height, fileIndex) {
    if (typeof isEditingLayout !== 'undefined' && isEditingLayout) return true;
    if (cell.dataset.forcedContent === "true") return true;
    if (!settings.showQueueInfo) return true;
    
    const reqRatio = cell.dataset.aspectRatio || 'all';
    let autoTarget = null;
    
    if (reqRatio === 'auto') {
        const rect = cell.getBoundingClientRect();
        if (rect.width && rect.height) autoTarget = rect.width / rect.height;
    }
    
    // Update metadata for UI if missing
    if (playlist[fileIndex] && !playlist[fileIndex].metaDataStr) {
         const rText = (typeof getAspectRatio === 'function') ? getAspectRatio(width, height) : "";
         playlist[fileIndex].metaDataStr = `${width}x${height} [${rText}]`;
         const metaEl = document.getElementById(`meta-${fileIndex}`);
         if(metaEl) metaEl.innerText = playlist[fileIndex].metaDataStr;
    }

    if (!checkRatioMatch(width, height, reqRatio, autoTarget)) {
        // Fallback Check
        if(settings.autoFallback) {
            return true;
        }
        
        // Mismatch found -> Try next file
        let nextStart = settings.shuffle ? Math.floor(Math.random() * playlist.length) : (fileIndex + 1);
        mountMediaInCell(cell, nextStart, false);
        return false;
    }
    return true;
}

// 3. RENDER PHASE
function renderMediaContent(cell, finalIndex) {
    if (typeof isEditingLayout !== 'undefined' && isEditingLayout) return; 
    if (finalIndex >= playlist.length) return;
    
    cell.classList.add('media-loaded');
    
    const file = playlist[finalIndex];
    const titleEl = document.createElement('div');
    titleEl.className = 'media-title-overlay';
    titleEl.innerText = file.name;
    cell.appendChild(titleEl);

    const url = getFileUrl(file);
    if (!file.path) cell.dataset.activeUrl = url;

    const isVideo = getFileType(file) === 'video';
    
    // --- EFFECT LOGIC ---
    let effect = settings.effect || 'none';
    if (settings.randomEffect) {
        effect = getRandomEffect();
    }

    const fitMode = cell.dataset.fitMode || 'contain';
    let visEl, logicEl;
    
    // --- VIDEO SETUP ---
    if (isVideo) {
        logicEl = document.createElement('video');
        logicEl.src = url;
        logicEl.volume = settings.globalVolume; 
        
        const isAudioLocked = cell.dataset.audioLocked === 'true';
        logicEl.muted = isAudioLocked ? false : (typeof isGlobalMuted !== 'undefined' ? isGlobalMuted : true);

        const speedSlider = document.getElementById('speedSlider');
        if (speedSlider) logicEl.playbackRate = parseFloat(speedSlider.value);

        logicEl.autoplay = true; 
        logicEl.playsInline = true; 
        
        logicEl.onloadedmetadata = () => {
             if (!validateMediaRatio(cell, logicEl.videoWidth, logicEl.videoHeight, finalIndex)) return;
        };

        logicEl.onended = () => { if(!logicEl.loop) loadNextIntoCell(cell); };
        logicEl.onerror = () => loadNextIntoCell(cell); 
        
        const fpsLimit = parseInt(settings.gridMaxFps) || 60;
        const useCanvas = fpsLimit < 60;

        if (useCanvas) {
            visEl = document.createElement('canvas');
            logicEl.style.display = 'none'; 
            const ctx = visEl.getContext('2d', { alpha: false }); 
            let lastDraw = 0;
            const interval = 1000 / fpsLimit;
            const renderLoop = () => {
                if (!visEl.isConnected) return; 
                requestAnimationFrame(renderLoop);
                const now = Date.now();
                if (now - lastDraw > interval) {
                    lastDraw = now;
                    if (logicEl.readyState >= 2) {
                        if (visEl.width !== logicEl.videoWidth || visEl.height !== logicEl.videoHeight) {
                            visEl.width = logicEl.videoWidth || 300;
                            visEl.height = logicEl.videoHeight || 150;
                        }
                        ctx.drawImage(logicEl, 0, 0, visEl.width, visEl.height);
                    }
                }
            };
            logicEl.addEventListener('play', renderLoop);
            cell.appendChild(logicEl); 
        } else {
            visEl = logicEl;
        }

        if (typeof isPaused !== 'undefined' && isPaused) logicEl.pause(); 
        else logicEl.play().catch(e => console.warn("Autoplay blocked", e));

        // --- AUDIO LOCK BTN ---
        const audioBtn = document.createElement('div');
        audioBtn.className = `audio-lock-btn ${logicEl.muted ? '' : 'active'}`;
        audioBtn.innerHTML = logicEl.muted ? GRID_ICONS.mute : GRID_ICONS.sound;
        audioBtn.title = "Persistent Audio: Keep audio playing even if Global Mute is ON.";
        
        audioBtn.onclick = (e) => {
            e.stopPropagation();
            if (cell.dataset.audioLocked === 'true') {
                cell.dataset.audioLocked = 'false';
                audioBtn.classList.remove('active');
                audioBtn.innerHTML = GRID_ICONS.mute;
                logicEl.muted = (typeof isGlobalMuted !== 'undefined' ? isGlobalMuted : true);
            } else {
                cell.dataset.audioLocked = 'true';
                audioBtn.classList.add('active');
                audioBtn.innerHTML = GRID_ICONS.sound;
                logicEl.muted = false;
            }
            updateVolIcon();
        };
        cell.appendChild(audioBtn);

        // --- CELL CONTROLS ---
        const controlsDiv = document.createElement('div'); controlsDiv.className = 'cell-controls';

        const btnGroup = document.createElement('div');
        btnGroup.style.display = 'flex';
        btnGroup.style.flexDirection = 'column';
        btnGroup.style.alignItems = 'center';
        btnGroup.style.marginRight = '8px';

        const repeatBtn = document.createElement('button');
        repeatBtn.className = 'cell-btn';
        repeatBtn.innerHTML = GRID_ICONS.loop;
        repeatBtn.style.marginBottom = "4px"; 
        repeatBtn.onclick = (e) => {
            e.stopPropagation();
            logicEl.loop = !logicEl.loop;
            repeatBtn.style.color = logicEl.loop ? '#22c55e' : 'white';
        };

        const playBtn = document.createElement('button'); 
        playBtn.className = 'cell-btn'; 
        playBtn.innerHTML = GRID_ICONS.pause;
        playBtn.onclick = (e) => { 
            e.stopPropagation(); 
            if(logicEl.paused) { 
                logicEl.play(); 
                playBtn.innerHTML = GRID_ICONS.pause; 
            } else { 
                logicEl.pause(); 
                playBtn.innerHTML = GRID_ICONS.play; 
            } 
        };

        btnGroup.appendChild(repeatBtn);
        btnGroup.appendChild(playBtn);
        controlsDiv.appendChild(btnGroup);

        const timeRange = document.createElement('input');
        timeRange.type = 'range'; timeRange.className = 'cell-range';
        timeRange.min = 0; timeRange.max = 100; timeRange.value = 0;
        timeRange.onclick = (e) => e.stopPropagation();
        
        let isSeeking = false;
        timeRange.onmousedown = () => isSeeking = true;
        timeRange.onmouseup = () => isSeeking = false;
        timeRange.ontouchstart = () => isSeeking = true;
        timeRange.ontouchend = () => isSeeking = false;

        timeRange.oninput = (e) => {
            e.stopPropagation();
            if(logicEl.duration) logicEl.currentTime = (e.target.value / 100) * logicEl.duration;
        };
        logicEl.addEventListener('timeupdate', () => {
            if(!isSeeking && !isNaN(logicEl.duration)) timeRange.value = (logicEl.currentTime / logicEl.duration) * 100;
        });

        const volBtn = document.createElement('button'); volBtn.className = 'cell-btn'; 
        volBtn.innerHTML = logicEl.muted ? GRID_ICONS.mute : GRID_ICONS.sound;
        
        volBtn.onclick = (e) => { 
            e.stopPropagation(); 
            logicEl.muted = !logicEl.muted; 
            updateVolIcon(); 
        };

        const volRange = document.createElement('input'); volRange.type = 'range'; volRange.className = 'cell-vol-slider';
        volRange.min = 0; volRange.max = 1; volRange.step = 0.1;
        volRange.value = settings.globalVolume; 
        volRange.onclick = (e) => e.stopPropagation();
        volRange.oninput = (e) => {
            e.stopPropagation(); logicEl.volume = e.target.value;
            if(logicEl.muted && e.target.value > 0) logicEl.muted = false;
            updateVolIcon();
        };

        function updateVolIcon() {
            if(logicEl.muted || logicEl.volume === 0) volBtn.innerHTML = GRID_ICONS.mute;
            else if (logicEl.volume < 0.5) volBtn.innerHTML = GRID_ICONS.soundLow;
            else volBtn.innerHTML = GRID_ICONS.sound;
            
            if(logicEl.muted) {
                audioBtn.innerHTML = GRID_ICONS.mute;
                audioBtn.classList.remove('active');
            } else {
                audioBtn.innerHTML = GRID_ICONS.sound;
            }
        }

        controlsDiv.appendChild(timeRange);
        controlsDiv.appendChild(volBtn);
        controlsDiv.appendChild(volRange);
        controlsDiv.onclick = (e) => e.stopPropagation();
        cell.appendChild(controlsDiv);

    } 
    // --- IMAGE SETUP ---
    else {
        visEl = document.createElement('img');
        visEl.src = url;
        
        visEl.onload = () => {
             if (!validateMediaRatio(cell, visEl.naturalWidth, visEl.naturalHeight, finalIndex)) return;
        };

        if (typeof isPaused !== 'undefined' && !isPaused) {
            // --- DURATION LOGIC ---
            let duration = settings.duration;
            if (settings.randomDuration) {
                duration = getRandomDuration();
            }

            const t = setTimeout(() => loadNextIntoCell(cell), duration);
            if(cell.dataset.timerId) clearTimeout(parseInt(cell.dataset.timerId));
            cell.dataset.timerId = t;
            cellTimers.push(t);
        }

        const controlsDiv = document.createElement('div'); 
        controlsDiv.className = 'cell-controls';
        controlsDiv.style.justifyContent = 'center'; 

        const keepBtn = document.createElement('button');
        keepBtn.className = 'cell-btn';
        keepBtn.innerHTML = GRID_ICONS.snowflake; 
        keepBtn.style.borderRadius = "6px";
        keepBtn.style.padding = "6px 12px";
        keepBtn.style.width = "auto";
        keepBtn.style.transition = "background-color 0.2s";

        if(cell.dataset.locked === 'true') {
            keepBtn.style.backgroundColor = '#800080';
        }

        keepBtn.onclick = (e) => {
            e.stopPropagation();
            const isLocked = cell.dataset.locked === 'true';
            if (isLocked) {
                cell.dataset.locked = 'false';
                keepBtn.style.backgroundColor = 'transparent';
                if (!isPaused && !cell.dataset.timerId) {
                    // Recalculate if we unlock and auto-play
                    let d = settings.duration;
                    if(settings.randomDuration) d = getRandomDuration();
                    const t = setTimeout(() => loadNextIntoCell(cell), d);
                    cell.dataset.timerId = t;
                    cellTimers.push(t);
                }
            } else {
                cell.dataset.locked = 'true';
                keepBtn.style.backgroundColor = '#800080';
                if (cell.dataset.timerId) {
                    clearTimeout(parseInt(cell.dataset.timerId));
                    delete cell.dataset.timerId;
                }
            }
        };
        controlsDiv.appendChild(keepBtn);
        controlsDiv.onclick = (e) => e.stopPropagation();
        cell.appendChild(controlsDiv);
    }
    
    visEl.onclick = (e) => {
        if (window.innerWidth <= 768) {
            e.stopPropagation();
            cell.classList.toggle('mobile-touched');
        }
    };

    visEl.style.objectFit = fitMode;
    visEl.classList.add(`fx-${effect}`); // Use random effect if enabled
    
    cell.appendChild(visEl);
    void visEl.offsetWidth; 
    
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            visEl.classList.add('media-active');
        });
    });

    // --- NAVIGATION BUTTONS ---
    const btnLeft = document.createElement('div'); 
    btnLeft.className = 'cell-nav-btn cell-nav-left'; 
    btnLeft.innerHTML = GRID_ICONS.navLeft;
    btnLeft.onclick = (e) => { 
        e.stopPropagation(); 
        let prev = finalIndex - 1; 
        if(prev < 0) prev = playlist.length - 1; 
        mountMediaInCell(cell, prev, true); 
    };

    const btnRight = document.createElement('div'); 
    btnRight.className = 'cell-nav-btn cell-nav-right'; 
    btnRight.innerHTML = GRID_ICONS.navRight;
    btnRight.onclick = (e) => { 
        e.stopPropagation(); 
        let next = finalIndex + 1; 
        if(next >= playlist.length) next = 0; 
        mountMediaInCell(cell, next, true); 
    };

    cell.appendChild(btnLeft); 
    cell.appendChild(btnRight);
}

function loadNextIntoCell(cell) {
    if (typeof isPaused !== 'undefined' && isPaused) return;
    if (cell.dataset.locked === 'true') return;

    let idx;
    if (settings.shuffle) idx = Math.floor(Math.random() * playlist.length);
    else { 
        let current = parseInt(cell.dataset.currentIndex);
        if (isNaN(current)) current = 0; 
        idx = (current + 1) % playlist.length;
    }
    mountMediaInCell(cell, idx, false);
}

// --- PLAYBACK CONTROL ---
function clearAllTimers() { 
    cellTimers.forEach(t => clearTimeout(t)); 
    cellTimers = []; 
    document.querySelectorAll('.grid-cell').forEach(c => {
        if(c.dataset.timerId) clearTimeout(parseInt(c.dataset.timerId));
    });
}

function loadAndPlay(index) {
    if (playlist.length === 0 && (typeof isEditingLayout === 'undefined' || !isEditingLayout)) return; 
    if (index >= playlist.length) index = 0;
    currentTrack = index;
    clearAllTimers();
    if(typeof saveState === 'function') saveState();
    if(typeof renderPlaylist === 'function') renderPlaylist(); 

    const els = getEls();
    if (settings.mode === 'video') {
        els.grid.style.display = 'none';
        els.img.style.display = 'none'; els.video.style.display = 'block';
        if(playlist.length > 0) {
            const file = playlist[currentTrack];
            els.video.src = getFileUrl(file);
            if (document.getElementById('speedSlider')) els.video.playbackRate = parseFloat(document.getElementById('speedSlider').value);
            els.video.play().catch(e=>{});
            isPaused = false; 
            if(window.app && window.app.toggleGlobalPlayPause) {
                const btn = document.getElementById('playPauseBtn');
                if(btn && GRID_ICONS) btn.innerHTML = GRID_ICONS.pause; 
            }
        }
    } else {
        els.video.pause(); els.video.style.display = 'none';
        els.img.style.display = 'none';
        els.grid.style.display = 'block';
        if(els.grid.innerHTML === '') initGrid();
        if(playlist.length > 0) updateGridContents();
    }
}

function getGridCapacity() { return document.querySelectorAll('#gridContainer .grid-cell').length || 1; }

function playNext() {
    if (playlist.length === 0) return;
    if (settings.mode === 'video') {
        let next = settings.shuffle ? Math.floor(Math.random()*playlist.length) : currentTrack+1;
        loadAndPlay(next);
    } else {
        let step = getGridCapacity();
        currentTrack = (currentTrack + step) % playlist.length;
        updateGridContents(); 
    }
}

function playPrev() {
    if (playlist.length === 0) return;
    if (settings.mode === 'video') {
        let prev = currentTrack - 1; 
        if (prev < 0) prev = playlist.length - 1;
        loadAndPlay(prev);
    } else {
        let step = getGridCapacity();
        currentTrack = (currentTrack - step + playlist.length) % playlist.length;
        updateGridContents();
    }
}

function toggleGlobalPlayPause() {
    isPaused = !isPaused;
    const btn = document.getElementById('playPauseBtn');
    if(btn) btn.innerHTML = isPaused ? GRID_ICONS.play : GRID_ICONS.pause;
    
    const allVideos = document.querySelectorAll('video');
    allVideos.forEach(vid => {
        if (isPaused) {
            vid.pause();
        } else {
            if (vid.closest('.grid-cell') && !vid.classList.contains('media-old')) {
                vid.play().catch(e => {});
            } else if (vid.id === 'videoPlayer' && settings.mode === 'video') {
                vid.play().catch(e => {});
            }
        }
    });
    
    const cells = document.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        const img = cell.querySelector('img');
        if (img) {
            if (isPaused) {
                if(cell.dataset.timerId) clearTimeout(parseInt(cell.dataset.timerId));
            } else {
                if (!cell.dataset.locked) {
                    if(cell.dataset.timerId) clearTimeout(parseInt(cell.dataset.timerId));
                    
                    // --- RECALCULATE DURATION IF RANDOM ---
                    let duration = settings.duration;
                    if (settings.randomDuration) duration = getRandomDuration();

                    const t = setTimeout(() => loadNextIntoCell(cell), duration);
                    cell.dataset.timerId = t;
                    cellTimers.push(t);
                }
            }
        }
    });
}