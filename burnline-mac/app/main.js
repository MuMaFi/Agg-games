// Burnline für macOS — Electron-Hauptprozess
const { app, BrowserWindow, Menu, session, desktopCapturer, systemPreferences, shell, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

app.setName('Burnline');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 800, minWidth: 640, minHeight: 400,
    backgroundColor: '#070303',
    title: 'Burnline',
    titleBarStyle: 'hiddenInset',
    fullscreenable: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false, preload: path.join(__dirname, 'preload.js') }
  });
  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'index.html'));
  // Links in neuem Browserfenster öffnen statt in der App
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  return win;
}

app.whenReady().then(async () => {
  // Mikrofon & Bildschirm/Audio erlauben (macOS fragt beim ersten Mal selbst nach)
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['media', 'display-capture', 'fullscreen', 'wake-lock'].includes(perm)));
  session.defaultSession.setPermissionCheckHandler((wc, perm) => ['media', 'display-capture', 'fullscreen'].includes(perm));
  // System-Audio: getDisplayMedia() bekommt den Bildschirm + Loopback-Ton
  session.defaultSession.setDisplayMediaRequestHandler((req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] })
      .then(src => cb(src.length ? { video: src[0], audio: 'loopback' } : {}))
      .catch(() => cb({}));
  }, { useSystemPicker: true });
  // Video-Export: „Speichern unter“, startet im Filme-Ordner, zeigt die Datei danach im Finder
  ipcMain.handle('save-video', async (e, name, buffer) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const r = await dialog.showSaveDialog(win, { title: 'Save Video', defaultPath: path.join(app.getPath('videos'), name) });
    if (r.canceled || !r.filePath) return false;
    await fs.promises.writeFile(r.filePath, Buffer.from(buffer));
    shell.showItemInFolder(r.filePath);
    return true;
  });
  if (process.platform === 'darwin') { try { await systemPreferences.askForMediaAccess('microphone'); } catch (e) {} }

  const template = [
    { label: 'Burnline', submenu: [
      { role: 'about', label: 'About Burnline' }, { type: 'separator' },
      { role: 'hide', label: 'Hide Burnline' }, { role: 'hideOthers', label: 'Hide Others' }, { type: 'separator' },
      { role: 'quit', label: 'Quit Burnline' } ] },
    { label: 'File', submenu: [ { role: 'close', label: 'Close Window' } ] },
    { label: 'View', submenu: [
      { role: 'togglefullscreen', label: 'Toggle Full Screen' }, { role: 'reload', label: 'Reload' },
      { role: 'toggleDevTools', label: 'Developer Tools' } ] },
    { label: 'Window', submenu: [ { role: 'minimize', label: 'Minimize' }, { role: 'zoom', label: 'Zoom' } ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
