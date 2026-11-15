// Legt die aktuelle ../burnline.html als App-Inhalt ab: lokale Schriften und lokale
// MP4-Bibliothek (aus burnline-mac/app), damit alles offline läuft.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), mac = path.join(root, 'burnline-mac', 'app');
const out = path.join(__dirname, 'app', 'src', 'main', 'assets');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
let html = fs.readFileSync(path.join(root, 'burnline.html'), 'utf8');
html = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '')
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">')
  .replace('https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.js', 'vendor/mp4-muxer.js');
html = '<!doctype html>\n<html lang="en">\n<head>\n' + html.replace(/<\/style>\n/, '</style>\n</head>\n<body>\n') + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(out, 'index.html'), html);
for (const f of fs.readdirSync(path.join(mac, 'fonts'))) fs.copyFileSync(path.join(mac, 'fonts', f), path.join(out, 'fonts', f));
fs.copyFileSync(path.join(mac, 'vendor', 'mp4-muxer.js'), path.join(out, 'vendor', 'mp4-muxer.js'));
console.log('assets aktualisiert');
