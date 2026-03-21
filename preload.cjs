const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readLocalData: () => ipcRenderer.invoke('read-local-data'),
  writeLocalData: (notes) => ipcRenderer.invoke('write-local-data', notes),
  readImage: (filename) => ipcRenderer.invoke('read-local-image', filename),
  readAudio: (filename) => ipcRenderer.invoke('read-local-audio', filename)
});