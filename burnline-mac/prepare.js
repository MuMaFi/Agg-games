// Kopiert ../burnline.html in die App und stellt die Schriften auf lokale Dateien um,
// damit Burnline auch ohne Internet richtig aussieht.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..', 'burnline.html');
let html = fs.readFileSync(src, 'utf8');
html = html.replace(/<link rel="preconnect"[^>]*>\n?/g, '')
           .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="fonts/fonts.css">');
html = '<!doctype html>\n<html lang="en">\n<head>\n' + html.replace('<style>', '<style>').replace(/<\/style>\n/, '</style>\n</head>\n<body>\n') + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(__dirname, 'app', 'index.html'), html);
console.log('app/index.html aktualisiert');
