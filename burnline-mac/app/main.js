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
  // Video-Export: Aufnahme läuft stückweise in eine Temp-Datei, am Ende „Speichern unter“.
  // Bricht man den Dialog ab, landet das Video trotzdem im Filme-Ordner — es geht nie verloren.
  let recFile = null, recStream = null;
  const uniquePath = (p) => { if (!fs.existsSync(p)) return p; const ext = path.extname(p), base = p.slice(0, -ext.length);
    for (let i = 2; ; i++) { const q = `${base} (${i})${ext}`; if (!fs.existsSync(q)) return q; } };
  const moveFile = async (from, to) => { try { await fs.promises.rename(from, to); }
    catch (err) { if (err.code !== 'EXDEV') throw err; await fs.promises.copyFile(from, to); await fs.promises.unlink(from); } };
  ipcMain.handle('rec-begin', async (e, ext) => {
    if (recStream) recStream.destroy();
    recFile = path.join(app.getPath('temp'), `burnline-rec-${Date.now()}.${ext === 'mp4' ? 'mp4' : 'webm'}`);
    recStream = fs.createWriteStream(recFile);
    return true;
  });
  ipcMain.handle('rec-chunk', (e, buffer) => new Promise((resolve, reject) => {
    if (!recStream) return resolve(false);
    recStream.write(Buffer.from(buffer), (err) => err ? reject(err) : resolve(true));
  }));
  ipcMain.handle('rec-end', async (e, name) => {
    if (!recStream) return { ok: false, error: 'no recording in progress' };
    await new Promise((r) => recStream.end(r)); recStream = null;
    const win = BrowserWindow.fromWebContents(e.sender);
    const def = path.join(app.getPath('videos'), name);
    let dest, canceled = false;
    try {
      const r = await dialog.showSaveDialog(win, { title: 'Save Video', defaultPath: def });
      canceled = r.canceled || !r.filePath;
      dest = canceled ? uniquePath(def) : r.filePath;
      await fs.promises.mkdir(path.dirname(dest), { recursive: true });
      await moveFile(recFile, dest);
    } catch (err) {
      return { ok: false, error: `${err.message} (the recording is still at ${recFile})` };
    }
    shell.showItemInFolder(dest);
    return { ok: true, path: dest, canceled };
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
