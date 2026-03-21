const { app, BrowserWindow, ipcMain, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isPackaged = app.isPackaged;
const appDir = isPackaged ? (process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath)) : __dirname;
const dataFile = path.join(appDir, 'notes_data.json');
const imagesDir = path.join(appDir, 'images');
const audioDir = path.join(appDir, 'audio');

protocol.registerSchemesAsPrivileged([
  { scheme: 'diary-img', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true } },
  { scheme: 'diary-audio', privileges: { secure: true, standard: true, supportFetchAPI: true, bypassCSP: true, stream: true } }
]);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.removeMenu();

  if (isPackaged) {
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }
}

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

ipcMain.handle('read-local-image', async (event, filename) => {
  try {
    const filePath = path.join(imagesDir, filename);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filename).substring(1);
      const data = fs.readFileSync(filePath);
      return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${data.toString('base64')}`;
    }
  } catch (e) {
    console.error('Failed to read image:', e);
  }
  return null;
});

ipcMain.handle('read-local-audio', async (event, filename) => {
  try {
    const filePath = path.join(audioDir, filename);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filename).substring(1);
      const data = fs.readFileSync(filePath);
      return `data:audio/${ext};base64,${data.toString('base64')}`;
    }
  } catch (e) {
    console.error('Failed to read audio:', e);
  }
  return null;
});

ipcMain.handle('write-local-data', async (event, notes) => {
  try {
    if (!fs.existsSync(imagesDir)) {
      fs.mkdirSync(imagesDir, { recursive: true });
    }
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const savedImageNames = new Set();
    const savedAudioNames = new Set();

    // Обработка base64 медиа (фото/аудио) и сохранение их как файлов
    for (const note of notes) {
      // Photo
      if (note.photo && note.photo.startsWith('data:image/')) {
        const matches = note.photo.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
        if (matches) {
          let ext = matches[1];
          if (ext === 'jpeg') ext = 'jpg';
          const buffer = Buffer.from(matches[2], 'base64');
          const hash = crypto.createHash('md5').update(buffer).digest('hex');
          const filename = `${note.id}_${hash}.${ext}`;
          const filePath = path.join(imagesDir, filename);
          
          if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, buffer);
          }
          note.photo = `diary-img://${filename}`;
        }
      }
      if (note.photo && note.photo.startsWith('diary-img://')) {
        const filename = decodeURIComponent(note.photo.replace('diary-img://', ''));
        savedImageNames.add(filename);
      }

      // Audio
      if (note.audio && note.audio.includes('base64,')) {
        const parts = note.audio.split('base64,');
        if (parts.length === 2) {
          const mimePart = parts[0];
          let ext = 'mp3';
          if (mimePart.includes('ogg')) ext = 'ogg';
          else if (mimePart.includes('wav')) ext = 'wav';
          else if (mimePart.includes('webm')) ext = 'webm';
          else if (mimePart.includes('mp4')) ext = 'mp4';
          else if (mimePart.includes('aac')) ext = 'aac';
          else ext = 'mp3';
          
          const buffer = Buffer.from(parts[1], 'base64');
          const hash = crypto.createHash('md5').update(buffer).digest('hex');
          const filename = `audio_${note.id}_${hash}.${ext}`;
          const filePath = path.join(audioDir, filename);
          
          if (!fs.existsSync(filePath)) {
            fs.writeFileSync(filePath, buffer);
          }
          note.audio = `diary-audio://${filename}`;
        }
      }
      if (note.audio && note.audio.startsWith('diary-audio://')) {
        const filename = decodeURIComponent(note.audio.replace('diary-audio://', ''));
        savedAudioNames.add(filename);
      }
      if (note.audio && note.audio.startsWith('diary-img://')) {
        const filename = decodeURIComponent(note.audio.replace('diary-img://', ''));
        savedImageNames.add(filename);
      }
    }

    // Сохранение JSON
    fs.writeFileSync(dataFile, JSON.stringify(notes, null, 2), 'utf8');

    // Очистка неиспользуемых фотографий
    if (fs.existsSync(imagesDir)) {
      const existingFiles = fs.readdirSync(imagesDir);
      for (const file of existingFiles) {
        if (!savedImageNames.has(file)) {
          try {
            fs.unlinkSync(path.join(imagesDir, file));
          } catch(e) {}
        }
      }
    }

    // Очистка неиспользуемого аудио
    if (fs.existsSync(audioDir)) {
      const existingAudioFiles = fs.readdirSync(audioDir);
      for (const file of existingAudioFiles) {
        if (!savedAudioNames.has(file)) {
          try {
            fs.unlinkSync(path.join(audioDir, file));
          } catch(e) {}
        }
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to write data:', error);
    return false;
  }
});

app.whenReady().then(() => {
  const { pathToFileURL } = require('url');
  
  protocol.handle('diary-img', (request) => {
    let filename = request.url.replace('diary-img://', '');
    if (filename.endsWith('/')) filename = filename.slice(0, -1);
    const filePath = path.join(imagesDir, decodeURIComponent(filename));
    return net.fetch(pathToFileURL(filePath).toString());
  });

  protocol.handle('diary-audio', (request) => {
    let filename = request.url.replace('diary-audio://', '');
    if (filename.endsWith('/')) filename = filename.slice(0, -1);
    const filePath = path.join(audioDir, decodeURIComponent(filename));
    return net.fetch(pathToFileURL(filePath).toString());
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});