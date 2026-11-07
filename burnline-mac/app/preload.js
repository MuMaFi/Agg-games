// Brücke zwischen Seite und Mac-App: Video mit richtigem Namen speichern
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('burnlineApp', {
  saveVideo: (name, buffer) => ipcRenderer.invoke('save-video', name, buffer)
});
