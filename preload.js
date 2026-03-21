const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readLocalData: () => ipcRenderer.invoke('read-local-data'),
  writeLocalData: (notes) => ipcRenderer.invoke('write-local-data', notes)
});
