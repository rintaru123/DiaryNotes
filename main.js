const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// We want to save data in the same directory as the executable (or script during dev)
const isPackaged = app.isPackaged;
const appDir = isPackaged ? path.dirname(process.execPath) : __dirname;
const dataFile = path.join(appDir, 'notes_data.json');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    autoHideMenuBar: true, // "В electron-варианте нужно выключить кнопки меню"
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Turn off menu
  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  // Load the built vite app or dev server
  if (isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    // If running in dev mode
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }
}

// IPC Handlers for local file read/write
ipcMain.handle('read-local-data', async () => {
  try {
    if (fs.existsSync(dataFile)) {
      const data = fs.readFileSync(dataFile, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Failed to read data:', error);
    return [];
  }
});

ipcMain.handle('write-local-data', async (event, notes) => {
  try {
    fs.writeFileSync(dataFile, JSON.stringify(notes, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Failed to write data:', error);
    return false;
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
