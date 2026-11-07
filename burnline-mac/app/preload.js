// Brücke zwischen Seite und Mac-App: Aufnahme wird stückweise direkt auf die Platte geschrieben
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('burnlineApp', {
  recBegin: (ext) => ipcRenderer.invoke('rec-begin', ext),
  recChunk: (buffer) => ipcRenderer.invoke('rec-chunk', buffer),
  recEnd: (name) => ipcRenderer.invoke('rec-end', name)
});
