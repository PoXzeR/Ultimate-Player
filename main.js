const { app, BrowserWindow, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const os = require('os');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 400,
        minHeight: 300,
        frame: false, // Removes the OS title bar (Borderless)
        backgroundColor: '#0f0f13', // Matches CSS to prevent white flash
        
        // Asset path handling
        icon: path.join(__dirname, 'assets', 'icon.png'),

        webPreferences: {
            nodeIntegration: true,    // Allows using Node.js in renderer
            contextIsolation: false,  // Required for this specific architecture
            webSecurity: false        // Allow loading local files via file://
        }
    });

    win.loadFile('index.html');
}

// --- LOCAL SERVER LOGIC ---
let server = null;
const SERVER_PORT = 3000;

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (!iface.internal && iface.family === 'IPv4') {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// --- APP LIFECYCLE EVENTS ---

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (server) server.close(); // Ensure server closes
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// --- IPC HANDLER: Folder Selection & Window Commands ---

// 1. Native Multi-Folder Selection Handler
ipcMain.handle('select-dirs', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'multiSelections']
    });
    return result.filePaths;
});

function resetWindowState(win) {
    if (win.isFullScreen()) {
        win.setFullScreen(false);
    }
    if (win.isMaximized()) {
        win.unmaximize();
    }
}

ipcMain.on('app-command', (event, command) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;

    // 1. Identify which Screen the window is currently on
    const currentDisplay = screen.getDisplayMatching(win.getBounds());
    
    // 2. Get available space on that screen
    const { x, y, width, height } = currentDisplay.workArea;

    switch (command) {
        case 'exit':
            app.quit();
            break;
        
        case 'minimize':
            win.minimize();
            break;

        case 'toggle-pin':
            const isTop = win.isAlwaysOnTop();
            win.setAlwaysOnTop(!isTop);
            break;
        
        case 'restore':
            resetWindowState(win);
            win.setSize(1280, 720);
            win.center();
            break;

        case 'full':
            if (win.isFullScreen()) {
                win.setFullScreen(false);
            } else {
                if (win.isMaximized()) win.unmaximize();
                win.setFullScreen(true);
            }
            break;

        // --- SPLIT VIEW SNAP COMMANDS ---
        case 'left':
            resetWindowState(win);
            win.setBounds({ x: x, y: y, width: Math.floor(width / 2), height: height });
            break;
        case 'right':
            resetWindowState(win);
            win.setBounds({ x: x + Math.floor(width / 2), y: y, width: Math.floor(width / 2), height: height });
            break;
        case 'top':
            resetWindowState(win);
            win.setBounds({ x: x, y: y, width: width, height: Math.floor(height / 2) });
            break;
        case 'bottom':
            resetWindowState(win);
            win.setBounds({ x: x, y: y + Math.floor(height / 2), width: width, height: Math.floor(height / 2) });
            break;

        // --- NETWORK SERVER ---
        case 'toggle-server':
            if (server) {
                server.close(() => {
                    server = null;
                    event.sender.send('server-status', { active: false });
                });
            } else {
                server = http.createServer((req, res) => {
                    let reqPath = req.url.split('?')[0]; 
                    if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

                    try {
                        reqPath = decodeURIComponent(reqPath);
                    } catch (e) {
                        res.writeHead(400); res.end('Bad Request'); return;
                    }

                    const safePath = reqPath.replace(/^(\.\.[\/\\])+/, '').replace(/^\/+/, '');
                    const filePath = path.join(__dirname, safePath);

                    const ext = path.extname(filePath).toLowerCase();
                    const mimeTypes = {
                        '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                        '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpg',
                        '.jpeg': 'image/jpg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
                        '.wav': 'audio/wav', '.mp4': 'video/mp4', '.woff': 'application/font-woff',
                        '.ttf': 'application/font-ttf', '.eot': 'application/vnd.ms-fontobject',
                        '.otf': 'application/font-otf', '.wasm': 'application/wasm'
                    };
                    const contentType = mimeTypes[ext] || 'application/octet-stream';

                    fs.readFile(filePath, (err, content) => {
                        if (err) {
                            if (err.code === 'ENOENT') {
                                if (path.extname(filePath) === '') {
                                    const tryIndex = path.join(filePath, 'index.html');
                                    fs.readFile(tryIndex, (err2, content2) => {
                                        if (err2) {
                                            res.writeHead(404); res.end('404 Not Found: ' + safePath);
                                        } else {
                                            res.writeHead(200, { 'Content-Type': 'text/html' });
                                            res.end(content2, 'utf-8');
                                        }
                                    });
                                } else {
                                    res.writeHead(404); res.end('404 Not Found');
                                }
                            } else {
                                res.writeHead(500); res.end('Server Error: ' + err.code);
                            }
                        } else {
                            res.writeHead(200, { 'Content-Type': contentType });
                            res.end(content, 'utf-8');
                        }
                    });
                });

                server.listen(SERVER_PORT, () => {
                    const ip = getLocalIP();
                    const url = `http://${ip}:${SERVER_PORT}`;
                    event.sender.send('server-status', { active: true, url: url });
                });
            }
            break;
    }
});