// Brücke zwischen Seite und Mac-App: Video wird stückweise direkt auf die Platte geschrieben
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('burnlineApp', {
  recBegin: (ext) => ipcRenderer.invoke('rec-begin', ext),
  recChunk: (buffer, position) => ipcRenderer.invoke('rec-chunk', buffer, position),
  recEnd: (name) => ipcRenderer.invoke('rec-end', name),
  recAbort: () => ipcRenderer.invoke('rec-abort')
});
