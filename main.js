const { app, BrowserWindow } = require('electron');
const path = require('path');


function createWindow() {
    // Create the browser window
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    });

    // Load the apps index.html
    win.loadFile('index.html');
}

// Called after Electron finishes initialization
app.whenReady().then(() => {
    createWindow();
})