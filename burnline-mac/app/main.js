// Burnline für macOS — Electron-Hauptprozess
const { app, BrowserWindow, Menu, session, desktopCapturer, systemPreferences, shell } = require('electron');
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
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false }
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
  if (process.platform === 'darwin') { try { await systemPreferences.askForMediaAccess('microphone'); } catch (e) {} }

  const template = [
    { label: 'Burnline', submenu: [
      { role: 'about', label: 'Über Burnline' }, { type: 'separator' },
      { role: 'hide', label: 'Burnline ausblenden' }, { role: 'hideOthers', label: 'Andere ausblenden' }, { type: 'separator' },
      { role: 'quit', label: 'Burnline beenden' } ] },
    { label: 'Ablage', submenu: [ { role: 'close', label: 'Fenster schließen' } ] },
    { label: 'Darstellung', submenu: [
      { role: 'togglefullscreen', label: 'Vollbild' }, { role: 'reload', label: 'Neu laden' },
      { role: 'toggleDevTools', label: 'Entwicklerwerkzeuge' } ] },
    { label: 'Fenster', submenu: [ { role: 'minimize', label: 'Im Dock ablegen' }, { role: 'zoom', label: 'Zoomen' } ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());
