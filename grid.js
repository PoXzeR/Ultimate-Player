const ICON_SVGS = {
    splitH: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h4"></path><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><line x1="12" y1="3" x2="12" y2="21"></line></svg>`,
    splitV: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4"></path><path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"></path><line x1="3" y1="12" x2="21" y2="12"></line></svg>`,
    img: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
    vid: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>`,
    trash: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`
};

// Detailed Tooltips
const EDITOR_TIPS = {
    splitH: "Split Horizontal: Divide side-by-side.",
    splitV: "Split Vertical: Divide top-to-bottom.",
    all: "Allow both Images and Videos in this cell.",
    img: "Restrict this cell to Images only.",
    vid: "Restrict this cell to Videos only.",
    normal: "Normal (Contain): Shows the full image/video without cutting.",
    crop: "Crop (Cover): Fills the entire cell. Edges may be cut.",
    resize: "Resize (Fill): Stretches content to fit exactly (may distort).",
    fill: "Fill (None): Displays content at original resolution (zoom effect).",
    rAll: "Any Aspect Ratio\n(Default behavior)",
    rAuto: "Auto Match 📐\nDetects current cell shape and plays matching content.\n(Requires 'Queue Info' ON)",
    r169: "Landscape Mode (16:9)\nAlso accepts: 3:2, 2:1, 21:9",
    r916: "Portrait Mode (9:16)\nAlso accepts: 1:2, 2:3, 9:21",
    r43: "Standard Mode (4:3)\nAlso accepts: 3:4",
    r11: "Square (1:1)",
    del: "Delete this Cell"
};

const ADVANCED_RATIO_LIST = [
    { v: '16:9', t: '16:9', desc: 'Landscape' },
    { v: '3:2',  t: '3:2',  desc: 'Landscape' },
    { v: '2:1',  t: '2:1',  desc: 'Landscape' },
    { v: '4:3',  t: '4:3',  desc: 'Standard' },
    { v: '21:9', t: '21:9', desc: 'Ultra-Wide Landscape' },
    { v: '1:1',  t: '1:1',  desc: 'Square' },
    { v: '9:16', t: '9:16', desc: 'Portrait' },
    { v: '1:2',  t: '1:2',  desc: 'Portrait' },
    { v: '2:3',  t: '2:3',  desc: 'Portrait' },
    { v: '3:4',  t: '3:4',  desc: 'Portrait' },
    { v: '9:21', t: '9:21', desc: 'Long Portrait' }
];

// --- LAYOUT ENGINE (Smooth Percentage-Based Resizing) ---
function createGutter(type) {
    const g = document.createElement('div');
    g.className = `gutter gutter-${type}`;

    const startDrag = (e) => {
        const isTouch = e.type === 'touchstart';
        if (!isTouch) e.preventDefault();
        
        g.classList.add('dragging');
        const prev = g.previousElementSibling;
        const next = g.nextElementSibling;
        const parent = g.parentElement;
        
        if (!prev || !next || !parent) return;

        const isH = type === 'h';
        const parentRect = parent.getBoundingClientRect();
        const totalSize = isH ? parentRect.width : parentRect.height;

        // Freeze siblings in their current % spots
        const siblings = Array.from(parent.children).filter(c => !c.classList.contains('gutter'));
        const siblingConfigs = siblings.map(child => {
            const rect = child.getBoundingClientRect();
            const size = isH ? rect.width : rect.height;
            const percent = (size / totalSize) * 100;
            child.style.flex = `0 0 ${percent}%`;
            return { node: child, startPercent: percent };
        });

        const prevConfig = siblingConfigs.find(c => c.node === prev);
        const nextConfig = siblingConfigs.find(c => c.node === next);

        const getCoord = (ev) => {
            if (ev.touches && ev.touches.length > 0) return isH ? ev.touches[0].clientX : ev.touches[0].clientY;
            return isH ? ev.clientX : ev.clientY;
        };

        const startPos = getCoord(e);

        // Visual Guides
        const guidePrev = document.createElement('div');
        guidePrev.className = isH ? 'resize-guide resize-guide-h' : 'resize-guide resize-guide-v';
        const labelPrev = document.createElement('span');
        labelPrev.className = 'resize-label';
        guidePrev.appendChild(labelPrev);
        prev.appendChild(guidePrev);

        const guideNext = document.createElement('div');
        guideNext.className = isH ? 'resize-guide resize-guide-h' : 'resize-guide resize-guide-v';
        const labelNext = document.createElement('span');
        labelNext.className = 'resize-label';
        guideNext.appendChild(labelNext);
        next.appendChild(guideNext);

        const updateLabels = (pPerc, nPerc) => {
            const pPx = Math.round((pPerc / 100) * totalSize);
            const nPx = Math.round((nPerc / 100) * totalSize);
            labelPrev.innerText = pPx + 'px';
            labelNext.innerText = nPx + 'px';
        };
        updateLabels(prevConfig.startPercent, nextConfig.startPercent);

        const onMove = (mv) => {
            if (mv.cancelable && isTouch) mv.preventDefault();
            const currentPos = getCoord(mv);
            const deltaPixels = currentPos - startPos;
            const deltaPercent = (deltaPixels / totalSize) * 100; 

            let newPrev = prevConfig.startPercent + deltaPercent;
            let newNext = nextConfig.startPercent - deltaPercent;

            // Safety limit (minimum 2%)
            if (newPrev < 2) { newPrev = 2; newNext = (prevConfig.startPercent + nextConfig.startPercent) - 2; }
            else if (newNext < 2) { newNext = 2; newPrev = (prevConfig.startPercent + nextConfig.startPercent) - 2; }

            prev.style.flex = `0 0 ${newPrev}%`;
            next.style.flex = `0 0 ${newNext}%`;
            updateLabels(newPrev, newNext);
        };

        const onUp = () => {
            g.classList.remove('dragging');
            guidePrev.remove(); guideNext.remove();
            document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp);
            document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend', onUp);
            
            if (!window.isEditingLayout) saveActiveCustomLayout();
            else {
                [prev, next].forEach(node => {
                    const cells = node.classList.contains('grid-cell') ? [node] : Array.from(node.querySelectorAll('.grid-cell'));
                    cells.forEach(c => {
                        if (c.dataset.aspectRatio && c.dataset.aspectRatio.includes('auto') && typeof mountMediaInCell === 'function') {
                            mountMediaInCell(c, parseInt(c.dataset.currentIndex) || window.currentTrack);
                        }
                    });
                });
            }
        };

        if (isTouch) { document.addEventListener('touchmove', onMove, { passive: false }); document.addEventListener('touchend', onUp); } 
        else { document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp); }
    };

    g.addEventListener('mousedown', startDrag);
    g.addEventListener('touchstart', startDrag, { passive: false });
    return g;
}

// --- FLOATING CELL LOGIC ---

window.addFloatingCell = function(data = null) {
    const grid = document.getElementById('gridContainer');
    const cell = document.createElement('div');
    cell.className = 'grid-cell grid-cell-floating';
    
    // Default size/pos if not provided
    const w = data ? data.w : 30; // percentage
    const h = data ? data.h : 30;
    const x = data ? data.x : 35;
    const y = data ? data.y : 35;

    cell.style.left = x + '%';
    cell.style.top = y + '%';
    cell.style.width = w + '%';
    cell.style.height = h + '%';

    // Restore attributes
    if (data) {
        if(data.contentType) cell.dataset.contentType = data.contentType;
        if(data.fitMode) cell.dataset.fitMode = data.fitMode;
        if(data.aspectRatio) cell.dataset.aspectRatio = data.aspectRatio;
        if(data.customRatios) cell.dataset.customRatios = data.customRatios;
    }

    // Drag Handle
    const dragHandle = document.createElement('div');
    dragHandle.className = 'floating-handle';
    dragHandle.title = "Drag to move";
    cell.appendChild(dragHandle);

    // Resize Handles
    const dirs = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
    dirs.forEach(dir => {
        const h = document.createElement('div');
        h.className = `resize-handle resize-${dir}`;
        cell.appendChild(h);
        initResize(h, cell, dir);
    });

    initDrag(dragHandle, cell);
    
    // Add Click listener for selection/editing
    cell.addEventListener('click', (e) => {
        if (window.settings.mode === 'slideshow' && !window.isEditingLayout) {
            if (typeof window.checkLiveModifiers === 'function' && window.checkLiveModifiers(e)) {
                e.preventDefault(); e.stopPropagation(); toggleLiveZone(cell, window.gridCellsRef.indexOf(cell));
            }
        }
    });

    grid.appendChild(cell);
    
    if (window.isEditingLayout) window.renderEditOverlays();
    // If adding during Slideshow mode, update tracking
    if (!window.isEditingLayout) {
        window.gridCellsRef = Array.from(document.querySelectorAll('.grid-cell'));
        if (typeof updateGridContents === 'function') updateGridContents();
    }
};

function initDrag(handle, cell) {
    let isDragging = false;
    let startX, startY;
    let startLeft, startTop;
    let gridRect;

    const onDown = (e) => {
        if (e.button !== 0) return; // Left click only
        e.preventDefault(); e.stopPropagation();
        
        isDragging = true;
        cell.classList.add('is-moving');
        handle.style.cursor = 'grabbing';
        
        startX = e.clientX;
        startY = e.clientY;
        
        gridRect = document.getElementById('gridContainer').getBoundingClientRect();
        const cellRect = cell.getBoundingClientRect();
        
        // Convert current px position to % relative to grid
        startLeft = ((cellRect.left - gridRect.left) / gridRect.width) * 100;
        startTop = ((cellRect.top - gridRect.top) / gridRect.height) * 100;

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const onMove = (e) => {
        if (!isDragging) return;
        
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        // Convert delta px to delta %
        const dxPerc = (dx / gridRect.width) * 100;
        const dyPerc = (dy / gridRect.height) * 100;
        
        let newLeft = startLeft + dxPerc;
        let newTop = startTop + dyPerc;
        
        const cellW = parseFloat(cell.style.width);
        const cellH = parseFloat(cell.style.height);

        // Boundary Check (0 to 100%)
        newLeft = Math.max(0, Math.min(newLeft, 100 - cellW));
        newTop = Math.max(0, Math.min(newTop, 100 - cellH));

        cell.style.left = newLeft + '%';
        cell.style.top = newTop + '%';
    };

    const onUp = () => {
        isDragging = false;
        cell.classList.remove('is-moving');
        handle.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if(!window.isEditingLayout) window.saveActiveCustomLayout(); // Save even in slideshow mode if moved
    };

    handle.addEventListener('mousedown', onDown);
}

function initResize(handle, cell, dir) {
    let isResizing = false;
    let startX, startY;
    let startRect, gridRect;

    const onDown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault(); e.stopPropagation();
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startRect = cell.getBoundingClientRect();
        gridRect = document.getElementById('gridContainer').getBoundingClientRect();
        
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    };

    const onMove = (e) => {
        if (!isResizing) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        // Calculate new pixel values first
        let newW = startRect.width;
        let newH = startRect.height;
        let newX = startRect.left - gridRect.left;
        let newY = startRect.top - gridRect.top;

        if (dir.includes('e')) newW = startRect.width + dx;
        if (dir.includes('s')) newH = startRect.height + dy;
        if (dir.includes('w')) {
            newW = startRect.width - dx;
            newX = (startRect.left - gridRect.left) + dx;
        }
        if (dir.includes('n')) {
            newH = startRect.height - dy;
            newY = (startRect.top - gridRect.top) + dy;
        }

        // Min Size constraints (px)
        const minSize = 50; 
        if (newW < minSize) {
            if (dir.includes('w')) newX = (startRect.left - gridRect.left) + (startRect.width - minSize);
            newW = minSize;
        }
        if (newH < minSize) {
            if (dir.includes('n')) newY = (startRect.top - gridRect.top) + (startRect.height - minSize);
            newH = minSize;
        }

        // Boundary Constraints (prevent moving outside grid)
        if (newX < 0) { newW += newX; newX = 0; } // Left bound
        if (newY < 0) { newH += newY; newY = 0; } // Top bound
        if (newX + newW > gridRect.width) newW = gridRect.width - newX; // Right bound
        if (newY + newH > gridRect.height) newH = gridRect.height - newY; // Bottom bound

        // Convert back to percentage for responsive scaling
        cell.style.width = (newW / gridRect.width) * 100 + '%';
        cell.style.height = (newH / gridRect.height) * 100 + '%';
        cell.style.left = (newX / gridRect.width) * 100 + '%';
        cell.style.top = (newY / gridRect.height) * 100 + '%';
    };

    const onUp = () => {
        isResizing = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if(!window.isEditingLayout) window.saveActiveCustomLayout();
    };

    handle.addEventListener('mousedown', onDown);
}

// --- RENDER & INIT ---
window.renderGridOptions = function() {
    const sel = document.getElementById('gridCountSelect'); if(!sel) return;
    const current = sel.value; sel.innerHTML = '';
    [ {v:'1',t:'1 (Single)'}, {v:'2',t:'2 (Split V)'}, {v:'2-row',t:'2 (Split H)'}, {v:'3',t:'3 (Grid)'}, {v:'4',t:'4 (2x2)'}, {v:'6',t:'6 (3x2)'} ]
    .forEach(o => { const op = document.createElement('option'); op.value = o.v; op.innerText = o.t; sel.appendChild(op); });

    if(window.savedLayouts && window.savedLayouts.length > 0) {
        const grp = document.createElement('optgroup'); grp.label = "Custom Layouts";
        window.savedLayouts.forEach((l, i) => { const op = document.createElement('option'); op.value = `saved_${i}`; op.innerText = l.name; grp.appendChild(op); });
        sel.appendChild(grp);
    }
    const editOpt = document.createElement('option'); editOpt.value = 'custom'; editOpt.innerText = '★ Editing Layout'; sel.appendChild(editOpt);
    sel.value = current;
};

window.initGrid = function() {
    // NEW: Reset persistent queue map if choosing a standard grid size
    const layoutVal = (window.settings && window.settings.gridSize) ? window.settings.gridSize : '1';
    if (layoutVal !== 'custom') window.gridQueueMap = {};

    const grid = document.getElementById('gridContainer'); if(!grid) return;
    grid.innerHTML = '';
    if (!Array.isArray(window.liveSelectedIndices)) window.liveSelectedIndices = [];

    // Separate restore logic for structure vs structure+floating
    let result = buildLayoutStructure(layoutVal);
    
    // buildLayoutStructure might return a simple DOM or an object {root: DOM, floating: []}
    if (result.root) {
        grid.appendChild(result.root);
        if (result.floating && Array.isArray(result.floating)) {
            result.floating.forEach(fData => window.addFloatingCell(fData));
        }
    } else {
        // Legacy simple DOM return
        grid.appendChild(result);
    }

    window.gridCellsRef = Array.from(grid.querySelectorAll('.grid-cell'));
    window.nextQueueIndex = window.currentTrack + window.gridCellsRef.length;

    window.gridCellsRef.forEach((cell, index) => {
        if (window.liveSelectedIndices && window.liveSelectedIndices.includes(index)) {
            cell.classList.add('live-zone');
            const order = window.liveSelectedIndices.indexOf(index) + 1;
            cell.setAttribute('data-live-order', order);
        }
        cell.addEventListener('click', (e) => {
            if (window.settings.mode === 'slideshow' && !window.isEditingLayout) {
                if (typeof window.checkLiveModifiers === 'function' && window.checkLiveModifiers(e)) {
                    e.preventDefault(); e.stopPropagation(); toggleLiveZone(cell, index);
                }
            }
        });
    });
};

function toggleLiveZone(cell, index) {
    if (!Array.isArray(window.liveSelectedIndices)) window.liveSelectedIndices = [];
    const position = window.liveSelectedIndices.indexOf(index);
    if (position !== -1) {
        window.liveSelectedIndices.splice(position, 1);
        cell.classList.remove('live-zone');
        cell.removeAttribute('data-live-order');
    } else {
        window.liveSelectedIndices.push(index);
        cell.classList.add('live-zone');
    }
    window.liveSelectedIndices.forEach((gridIndex, arrayIndex) => {
        const targetCell = window.gridCellsRef[gridIndex];
        if (targetCell) targetCell.setAttribute('data-live-order', arrayIndex + 1);
    });
    if (window.currentLiveZonePointer >= window.liveSelectedIndices.length) window.currentLiveZonePointer = 0;
}

function buildLayoutStructure(layoutVal) {
    if (layoutVal && layoutVal.startsWith('saved_')) {
        const idx = parseInt(layoutVal.split('_')[1]);
        if (window.savedLayouts && window.savedLayouts[idx]) return restoreLayoutFromJSON(window.savedLayouts[idx].structure);
        layoutVal = '1';
    }
    if (layoutVal === 'custom') {
        const savedJson = (window.getCustomLayout) ? window.getCustomLayout() : null;
        if (savedJson) return restoreLayoutFromJSON(savedJson);
        const root = document.createElement('div'); root.className = 'split-container split-h';
        root.appendChild(document.createElement('div')).className = 'grid-cell'; 
        return { root: root, floating: [] };
    }
    
    // Standard presets return just the root, assume no floating
    const count = parseInt(layoutVal) || 1;
    const root = document.createElement('div'); root.className = (layoutVal==='2-row'?'split-container split-v':'split-container split-h');
    const cells = Array(count).fill().map(() => { const d = document.createElement('div'); d.className='grid-cell'; return d; });
    
    if (layoutVal === '2-row') { cells[0].style.flex="1 1 0px"; cells[1].style.flex="1 1 0px"; root.appendChild(cells[0]); root.appendChild(createGutter('v')); root.appendChild(cells[1]); }
    else if (count === 1) root.appendChild(cells[0]);
    else if (count === 2) { root.appendChild(cells[0]); root.appendChild(createGutter('h')); root.appendChild(cells[1]); }
    else if (count === 3) { root.appendChild(cells[0]); root.appendChild(createGutter('h')); root.appendChild(cells[1]); root.appendChild(createGutter('h')); root.appendChild(cells[2]); }
    else if (count === 4) {
        const c1 = document.createElement('div'); c1.className='split-container split-v'; c1.appendChild(cells[0]); c1.appendChild(createGutter('v')); c1.appendChild(cells[1]);
        const c2 = document.createElement('div'); c2.className='split-container split-v'; c2.appendChild(cells[2]); c2.appendChild(createGutter('v')); c2.appendChild(cells[3]);
        root.appendChild(c1); root.appendChild(createGutter('h')); root.appendChild(c2);
    } else if (count >= 5) {
        const c1 = document.createElement('div'); c1.className='split-container split-v';
        const r1 = document.createElement('div'); r1.className='split-container split-h'; r1.appendChild(cells[0]); r1.appendChild(createGutter('h')); r1.appendChild(cells[1]); r1.appendChild(createGutter('h')); r1.appendChild(cells[2]);
        const r2 = document.createElement('div'); r2.className='split-container split-h'; for(let i=3; i<count; i++) { if(i>3) r2.appendChild(createGutter('h')); r2.appendChild(cells[i]); }
        c1.appendChild(r1); c1.appendChild(createGutter('v')); c1.appendChild(r2); 
        return { root: c1, floating: [] };
    }
    return { root: root, floating: [] };
}

window.toggleLayoutEditor = function(enable) {
    window.isEditingLayout = enable;
    const grid = document.getElementById('gridContainer');
    if (window.isEditingLayout) {
        document.body.classList.add('editor-active'); grid.classList.add('editing-mode');
        if(window.settings) window.settings.gridSize = "custom"; 
        window.initGrid(); window.renderEditOverlays(); window.updateLayoutSelect(); 
    } else {
        document.body.classList.remove('editor-active'); grid.classList.remove('editing-mode');
        window.toggleShift(false); window.toggleCtrl(false);
        document.querySelectorAll('.grid-cell.active-cell').forEach(c => c.classList.remove('active-cell'));
        document.querySelectorAll('.grid-cell.selected-shift').forEach(c => c.classList.remove('selected-shift'));
    }
};

/**
 * FIXED: toggleRatio with exclusive All/Auto deselect logic + Selection Targeting
 */
window.toggleRatio = function(btn, val) {
    pushToHistory();
    const targets = getTargetCells(btn);
    
    targets.forEach(cell => {
        let current = cell.dataset.aspectRatio || 'all';
        let selected = current.split(',').filter(x => x.length > 0);

        if (val === 'all') {
            selected = ['all'];
        } else if (val === 'auto') {
            selected = ['auto'];
        } else {
            // Picking a specific ratio: Remove All and Auto first
            selected = selected.filter(r => r !== 'all' && r !== 'auto');
            
            const idx = selected.indexOf(val);
            if (idx !== -1) {
                // Toggle OFF: If it's the last specific item, go back to 'all'
                if (selected.length > 1) {
                    selected.splice(idx, 1);
                } else {
                    selected = ['all'];
                }
            } else {
                // Add it
                selected.push(val);
            }
        }
        cell.dataset.aspectRatio = selected.join(',');
    });

    window.renderEditOverlays();
    window.saveActiveCustomLayout();
};

window.updateCustomRatios = function(input) {
    const targets = getTargetCells(input);
    targets.forEach(cell => {
        cell.dataset.customRatios = input.value;
    });
    window.saveActiveCustomLayout();
};

window.renderEditOverlays = function() {
    const cells = document.querySelectorAll('.grid-cell');
    const qInfo = (window.settings) ? window.settings.showQueueInfo : false;
    const isAdvanced = (window.settings && window.settings.advanceRatioMode);

    cells.forEach(cell => {
        // Skip setting onclick if already set (optimization)
        if (!cell.hasAttribute('data-edit-init')) {
            cell.setAttribute('data-edit-init', 'true');
            cell.onclick = (e) => {
                if (!window.isEditingLayout) return; 
                e.stopPropagation();
                if (window.isShiftDown) { 
                    cell.classList.toggle('selected-shift'); 
                    if (cell.classList.contains('selected-shift')) cell.classList.remove('active-cell'); 
                } else { 
                    document.querySelectorAll('.selected-shift').forEach(c => c.classList.remove('selected-shift')); 
                    document.querySelectorAll('.active-cell').forEach(c => c.classList.remove('active-cell')); 
                    cell.classList.add('active-cell'); 
                }
            };
        }

        let ov = cell.querySelector('.layout-overlay');
        if (!ov) { ov = document.createElement('div'); ov.className = 'layout-overlay'; cell.appendChild(ov); }

        const type = cell.dataset.contentType || 'all'; 
        const fit = cell.dataset.fitMode || 'contain'; 
        const currentRatios = (cell.dataset.aspectRatio || 'all').split(',');
        const isFloating = cell.classList.contains('grid-cell-floating');

        const qIndHtml = `
            <div class="q-indicator-box"
                 title="Show Queue File Info is ${qInfo ? 'ON' : 'OFF'}\n${qInfo ? 'Ratio filters are ACTIVE.' : 'Ratio filters are INACTIVE.'}" 
                 style="width:16px; height:16px; border:1px solid ${qInfo ? '#22c55e' : '#555'}; 
                        background-color: ${qInfo ? '#22c55e' : 'rgba(0,0,0,0.3)'}; 
                        border-radius: 3px; margin-right: 6px; flex-shrink: 0; cursor: help;
                        display: flex; align-items: center; justify-content: center;">
                 ${qInfo ? '<span style="color:white; font-size:10px; font-weight:bold;">✓</span>' : ''}
            </div>
        `;

        let ratioButtonsHtml = '';
        if (!isAdvanced) {
            const simple = [
                {v: 'auto', t: 'Auto', tip: EDITOR_TIPS.rAuto, style: 'color:#00e0ff; border-color:#007799;'},
                {v: '16:9', t: '16:9', tip: EDITOR_TIPS.r169},
                {v: '4:3',  t: '4:3',  tip: EDITOR_TIPS.r43},
                {v: '1:1',  t: '1:1',  tip: EDITOR_TIPS.r11},
                {v: '9:16', t: '9:16', tip: EDITOR_TIPS.r916}
            ];
            simple.forEach(r => {
                ratioButtonsHtml += `<button class="type-btn ${currentRatios.includes(r.v)?'active':''}" onclick="event.stopPropagation(); window.toggleRatio(this,'${r.v}')" title="${r.tip}" style="${r.style||''}">${r.t}</button>`;
            });
        } else {
            ratioButtonsHtml += `<button class="type-btn ${currentRatios.includes('auto')?'active':''}" onclick="event.stopPropagation(); window.toggleRatio(this,'auto')" style="color:#00e0ff; border-color:#007799;" title="${EDITOR_TIPS.rAuto}">Auto</button>`;
            ADVANCED_RATIO_LIST.forEach(r => {
                ratioButtonsHtml += `<button class="type-btn ${currentRatios.includes(r.v)?'active':''}" onclick="event.stopPropagation(); window.toggleRatio(this,'${r.v}')" title="${r.desc}">${r.t}</button>`;
            });
            const customVal = cell.dataset.customRatios || "";
            ratioButtonsHtml += `<input type="text" class="ratio-custom-input" placeholder="Custom (e.g. 74:21, 17:24)" value="${customVal}" onclick="event.stopPropagation()" oninput="window.updateCustomRatios(this)">`;
        }

        // Conditionally render Split buttons (Floating cells cannot be split)
        const splitBtns = isFloating ? '' : `
            <div class="layout-btn-row">
                <button class="layout-btn" onclick="event.stopPropagation(); app.splitCell(this,'h')" title="${EDITOR_TIPS.splitH}">${ICON_SVGS.splitH}</button>
                <button class="layout-btn" onclick="event.stopPropagation(); app.splitCell(this,'v')" title="${EDITOR_TIPS.splitV}">${ICON_SVGS.splitV}</button>
            </div>`;

        ov.innerHTML = `
            ${splitBtns}
            <div class="layout-btn-row">
                <button class="type-btn ${type==='all'?'active':''}" onclick="event.stopPropagation(); app.setCellType(this,'all')" title="${EDITOR_TIPS.all}">All</button>
                <button class="type-btn ${type==='image'?'active':''}" onclick="event.stopPropagation(); app.setCellType(this,'image')" title="${EDITOR_TIPS.img}">${ICON_SVGS.img}</button>
                <button class="type-btn ${type==='video'?'active':''}" onclick="event.stopPropagation(); app.setCellType(this,'video')" title="${EDITOR_TIPS.vid}">${ICON_SVGS.vid}</button>
            </div>
            <div class="layout-btn-row" style="align-items:center; flex-wrap:wrap;">
                ${qIndHtml}
                <button class="type-btn ${currentRatios.includes('all')?'active':''}" onclick="event.stopPropagation(); window.toggleRatio(this,'all')" title="${EDITOR_TIPS.rAll}">All</button>
                ${ratioButtonsHtml}
            </div>
            <div class="layout-btn-row" style="flex-wrap:wrap;">
                <button class="type-btn ${fit==='contain'?'active':''}" onclick="event.stopPropagation(); app.setFit(this,'contain')" title="${EDITOR_TIPS.normal}">Normal</button>
                <button class="type-btn ${fit==='cover'?'active':''}" onclick="event.stopPropagation(); app.setFit(this,'cover')" title="${EDITOR_TIPS.crop}">Crop</button>
                <button class="type-btn ${fit==='fill'?'active':''}" onclick="event.stopPropagation(); app.setFit(this,'fill')" title="${EDITOR_TIPS.resize}">Resize</button>
                <button class="type-btn ${fit==='none'?'active':''}" onclick="event.stopPropagation(); app.setFit(this,'none')" title="${EDITOR_TIPS.fill}">Fill</button>
            </div>
            <button class="layout-btn layout-btn-del" onclick="event.stopPropagation(); app.deleteCell(this)" title="${EDITOR_TIPS.del}" style="margin-top:6px; width:40%; display:flex; justify-content:center; gap:6px;">${ICON_SVGS.trash} Delete</button>
        `;
    });
};

function getTargetCells(btn) { const cell = btn.closest('.grid-cell'); if (window.isCtrlDown) return document.querySelectorAll('.grid-cell'); const sel = document.querySelectorAll('.grid-cell.selected-shift'); return (sel.length > 0 && cell.classList.contains('selected-shift')) ? sel : [cell]; }
window.setCellType = (btn, t) => { pushToHistory(); getTargetCells(btn).forEach(c => { c.dataset.contentType = t; window.renderEditOverlays(); }); };
window.setAspectRatio = (btn, r) => { pushToHistory(); getTargetCells(btn).forEach(c => { c.dataset.aspectRatio = r; window.renderEditOverlays(); }); };
window.setFit = (btn, f) => { pushToHistory(); getTargetCells(btn).forEach(c => { c.dataset.fitMode = f; const m = c.querySelector('video, img, canvas'); if(m) m.style.objectFit=f; window.renderEditOverlays(); }); };

window.splitCell = (btn, d) => { 
    pushToHistory(); 
    // NEW: Clear persistent queue map because the index structure changed
    window.gridQueueMap = {};
    const c = btn.closest('.grid-cell'); const p = c.parentElement; const cont = document.createElement('div'); cont.className=`split-container split-${d}`; cont.style.flex = c.style.flex; const n = document.createElement('div'); n.className='grid-cell'; n.style.flex="1 1 0px"; c.style.flex="1 1 0px"; p.replaceChild(cont, c); cont.appendChild(c); cont.appendChild(createGutter(d)); cont.appendChild(n); window.renderEditOverlays(); 
};

window.deleteCell = (btn) => {
    // 1. Count all grid cells (structural and floating)
    const allCells = document.querySelectorAll('.grid-cell');
    
    // 2. If only one is left, stop the deletion to prevent a blank grid
    if (allCells.length <= 1) {
        if (typeof showToast === 'function') {
            showToast("Cannot delete the last cell!", "warning");
        } else {
            alert("Cannot delete the last cell!");
        }
        return;
    }

    const c = btn.closest('.grid-cell');
    const p = c.parentElement;

    // Handle Floating Cells or cells directly in the root container
    if (p.id === 'gridContainer') {
        pushToHistory();
        // NEW: Clear persistent queue map because the index structure changed
        window.gridQueueMap = {};
        c.remove();
        // Update selection tracking
        window.gridCellsRef = Array.from(document.querySelectorAll('.grid-cell'));
        if (window.isEditingLayout) window.renderEditOverlays();
        return;
    }

    // Handle Structural Cells (inside split containers)
    pushToHistory();
    // NEW: Clear persistent queue map because the index structure changed
    window.gridQueueMap = {};
    const sib = c.previousElementSibling || c.nextElementSibling;
    if (sib && sib.classList.contains('gutter')) sib.remove();
    c.remove();

    // Clean up empty containers: If a container only has one cell left, 
    // remove the container and move the cell up to the parent level
    const rem = Array.from(p.children).filter(x => !x.classList.contains('gutter'));
    if (rem.length === 1) {
        const ch = rem[0];
        const gp = p.parentElement;
        ch.style.flex = p.style.flex;
        gp.replaceChild(ch, p);
    }

    // Refresh the UI and tracking
    window.gridCellsRef = Array.from(document.querySelectorAll('.grid-cell'));
    window.renderEditOverlays();
    window.saveActiveCustomLayout();
};
function pushToHistory() {
    const root = document.getElementById('gridContainer').firstElementChild; if (!root) return;
    window.layoutHistory.push(JSON.stringify(window.getCustomLayout ? window.getCustomLayout() : serializeLayout(root))); 
    if (window.layoutHistory.length > 30) window.layoutHistory.shift();
}

window.performUndo = function() {
    if (window.layoutHistory.length === 0) return;
    const grid = document.getElementById('gridContainer'); grid.innerHTML = '';
    const state = JSON.parse(window.layoutHistory.pop());
    
    // Support legacy (array/object) vs new {structure, floating} format
    if (state.structure) {
        const res = restoreLayoutFromJSON(state);
        grid.appendChild(res.root);
        if (res.floating) res.floating.forEach(f => window.addFloatingCell(f));
    } else {
        // Fallback for old history stack
        const res = restoreLayoutFromJSON(state);
        grid.appendChild(res.root || res);
    }
    window.renderEditOverlays(); window.saveActiveCustomLayout();
};

window.resetLayout = function() {
    if(confirm("Reset grid?")) {
        pushToHistory(); const grid = document.getElementById('gridContainer'); grid.innerHTML = '';
        const r = document.createElement('div'); r.className='split-container split-h'; r.appendChild(document.createElement('div')).className='grid-cell';
        grid.appendChild(r); window.renderEditOverlays();
    }
};

window.saveActiveCustomLayout = function() {
    const grid = document.getElementById('gridContainer');
    // Find the root split container (first child that isn't floating)
    const rootEl = Array.from(grid.children).find(c => c.classList.contains('split-container') || (c.classList.contains('grid-cell') && !c.classList.contains('grid-cell-floating')));
    
    if(!rootEl) return;

    // Serialize basic tree
    const structure = serializeLayout(rootEl);

    // Serialize floating cells
    const floatingEls = grid.querySelectorAll('.grid-cell-floating');
    const floating = Array.from(floatingEls).map(el => {
        return {
            x: parseFloat(el.style.left),
            y: parseFloat(el.style.top),
            w: parseFloat(el.style.width),
            h: parseFloat(el.style.height),
            contentType: el.dataset.contentType||'all',
            fitMode: el.dataset.fitMode||'contain',
            aspectRatio: el.dataset.aspectRatio||'all',
            customRatios: el.dataset.customRatios||''
        };
    });

    if(window.saveCustomLayout) window.saveCustomLayout({ structure, floating });
};

// Modified Serialize/Restore to handle the new format
function serializeLayout(el) { 
    if (el.classList.contains('grid-cell') && !el.classList.contains('grid-cell-floating')) {
        return { type: 'cell', flex: el.style.flex, contentType: el.dataset.contentType||'all', fitMode: el.dataset.fitMode||'contain', aspectRatio: el.dataset.aspectRatio||'all', customRatios: el.dataset.customRatios||'' }; 
    }
    // Container
    if (el.classList.contains('split-container')) {
        return { 
            type: 'container', 
            dir: el.classList.contains('split-h')?'h':'v', 
            flex: el.style.flex, 
            children: Array.from(el.children).filter(c => !c.classList.contains('gutter')).map(c => serializeLayout(c)) 
        }; 
    }
    // Fallback/Error
    return { type: 'cell', flex: "1 1 0px" };
}

function restoreLayoutFromJSON(data) {
    // Check if data is the new wrapper { structure: ..., floating: ... }
    if (data.structure) {
        const root = restoreLayoutFromJSON(data.structure);
        return { root: (root.root || root), floating: data.floating || [] };
    }

    // Standard recursive tree restoration
    if (!data) { const d = document.createElement('div'); d.className = 'grid-cell'; return d; } 
    if (data.type === 'cell') { 
        const d = document.createElement('div'); d.className = 'grid-cell'; d.style.flex = data.flex || "1 1 0px"; 
        if(data.contentType) d.dataset.contentType = data.contentType; 
        if(data.fitMode) d.dataset.fitMode = data.fitMode; 
        if(data.aspectRatio) d.dataset.aspectRatio = data.aspectRatio; 
        if(data.customRatios) d.dataset.customRatios = data.customRatios; 
        return d; 
    } 
    const d = document.createElement('div'); 
    d.className = `split-container split-${data.dir}`; d.style.flex = data.flex || "1 1 0px"; 
    if(data.children) data.children.forEach((c, i) => { if (i > 0) d.appendChild(createGutter(data.dir)); d.appendChild(restoreLayoutFromJSON(c)); }); 
    return d; 
}

// Save to Library needs update to support floaters
window.saveToLibrary = () => { 
    const n = document.getElementById('layoutName').value.trim(); if (!n) return alert("Enter name."); 
    const grid = document.getElementById('gridContainer');
    const rootEl = Array.from(grid.children).find(c => !c.classList.contains('grid-cell-floating'));
    
    const structure = serializeLayout(rootEl);
    const floating = Array.from(grid.querySelectorAll('.grid-cell-floating')).map(el => ({
        x: parseFloat(el.style.left), y: parseFloat(el.style.top), w: parseFloat(el.style.width), h: parseFloat(el.style.height),
        contentType: el.dataset.contentType, fitMode: el.dataset.fitMode, aspectRatio: el.dataset.aspectRatio, customRatios: el.dataset.customRatios
    }));

    const finalObj = { structure, floating };
    
    const i = window.savedLayouts.findIndex(l => l.name === n); 
    if (i !== -1) { if(!confirm(`Update "${n}"?`)) return; window.savedLayouts[i].structure = finalObj; } 
    else { window.savedLayouts.push({ name: n, structure: finalObj }); } 
    window.saveConfig(); window.updateLayoutSelect(); window.renderGridOptions(); 
};

// Load Library Item
window.loadLibraryItem = () => { 
    const i = document.getElementById('savedLayoutsSelect').value; if (i === "") return; pushToHistory(); 
    const grid = document.getElementById('gridContainer'); grid.innerHTML = ''; 
    if(window.savedLayouts[i]) { 
        const restored = restoreLayoutFromJSON(window.savedLayouts[i].structure);
        grid.appendChild(restored.root);
        if (restored.floating) restored.floating.forEach(f => window.addFloatingCell(f));
        
        window.renderEditOverlays(); window.saveActiveCustomLayout(); document.getElementById('layoutName').value = window.savedLayouts[i].name; 
    } 
};

window.deleteLibraryItem = () => { const i = document.getElementById('savedLayoutsSelect').value; if (i === "") return; if (!confirm("Delete layout?")) return; window.savedLayouts.splice(i, 1); window.saveConfig(); window.updateLayoutSelect(); window.renderGridOptions(); document.getElementById('layoutName').value = ''; };
window.updateLayoutSelect = () => { const s = document.getElementById('savedLayoutsSelect'); if(!s) return; s.innerHTML = '<option value="">-- Select Saved Layout --</option>'; if(window.savedLayouts) window.savedLayouts.forEach((l, i) => { const o = document.createElement('option'); o.value = i; o.innerText = l.name; s.appendChild(o); }); };
window.exportLayouts = () => { if (!window.savedLayouts || window.savedLayouts.length === 0) return alert("No layouts."); const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(window.savedLayouts)); a.download = "layouts.json"; a.click(); };
window.importLayouts = (input) => { const f = input.files[0]; if (!f) return; const r = new FileReader(); r.onload = function(e) { try { const imp = JSON.parse(e.target.result); window.savedLayouts = window.savedLayouts.concat(imp); window.saveConfig(); window.updateLayoutSelect(); window.renderGridOptions(); alert(`Imported ${imp.length} layouts.`); } catch(err) { alert("Import failed."); } }; r.readAsText(f); input.value = ''; };

function toggleShift(isActive) { 
    window.isShiftDown = isActive; 
    const el = document.getElementById('shiftCheck'); if(el) el.checked = isActive; 
    if (isActive) { window.isCtrlDown = false; const ctrl = document.getElementById('ctrlCheck'); if(ctrl) ctrl.checked = false; document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('selected-ctrl')); } 
}
function toggleCtrl(isActive) { 
    window.isCtrlDown = isActive; 
    const el = document.getElementById('ctrlCheck'); if(el) el.checked = isActive; 
    if (isActive) { window.isShiftDown = false; const shift = document.getElementById('shiftCheck'); if(shift) shift.checked = false; document.querySelectorAll('.grid-cell').forEach(c => {c.classList.add('selected-ctrl'); c.classList.remove('selected-shift');}); } 
    else document.querySelectorAll('.grid-cell').forEach(c => c.classList.remove('selected-ctrl')); 
}
window.toggleShift = toggleShift; window.toggleCtrl = toggleCtrl;

const gridSync = new BroadcastChannel('ultimate_player_sync');
gridSync.onmessage = (event) => { if (event.data && event.data.type === 'settings_updated') { if (window.isEditingLayout && window.renderEditOverlays) window.renderEditOverlays(); } };

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.key === 'Shift' && !window.isShiftDown) toggleShift(true);
    if ((e.key === 'Control' || e.metaKey) && !window.isCtrlDown) toggleCtrl(true);
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); window.performUndo(); }
});
document.addEventListener('keyup', (e) => { if (e.key === 'Shift') toggleShift(false); if (e.key === 'Control' || e.key === 'Meta') toggleCtrl(false); });
document.addEventListener('DOMContentLoaded', () => { if (typeof window.savedLayouts !== 'undefined') { window.updateLayoutSelect(); window.renderGridOptions(); } });
