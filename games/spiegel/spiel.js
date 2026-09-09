/* ═══════════════════════════════════════════════════════════════════
   SPIEGELKABINETT

   Ein Strahl läuft geradeaus, bis etwas im Weg steht. Alles andere folgt
   daraus: Spiegel lenken um, Teiler machen aus einem Strahl zwei, Filter
   nehmen Farbe weg, Empfänger wollen genau eine bestimmte.

   Der Kern ist eine einzige Funktion — `verfolge()` — die aus dem
   Spielfeld alle Strahlen berechnet. Sie zeichnet nichts und ändert
   nichts; sie gibt Abschnitte und getroffene Empfänger zurück. Deshalb
   kann derselbe Code das Bild malen und der Löser damit tausende
   Stellungen durchprobieren, ohne dass beide auseinanderlaufen.

   Farben sind Bitmasken: Gelb 1, Rosa 2, Türkis 4. Mischen ist ODER,
   Filtern ist UND. Alle drei zusammen ergeben Weiß.
   ═══════════════════════════════════════════════════════════════════ */
'use strict';
const $ = s => document.querySelector(s);

const GELB = 1, ROSA = 2, TUERKIS = 4, WEISS = 7;
const FARBWERT = {1:'#ffd75e', 2:'#ff5e8a', 4:'#4fd6c8', 3:'#ff9a6e',
                  5:'#a8e07a', 6:'#9b8cf0', 7:'#f2f6ff'};
const FARBNAME = {1:'Gelb', 2:'Rosa', 4:'Türkis', 3:'Orange', 5:'Grün', 6:'Violett', 7:'Weiß'};

/* Richtungen als Zahlen: 0 rechts, 1 runter, 2 links, 3 hoch */
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
/* Ein Spiegel '/' schickt rechts nach hoch, runter nach links usw. */
const SPIEGEL_A = [3, 2, 1, 0];      // '/'
const SPIEGEL_B = [1, 0, 3, 2];      // '\'

/* ── Die Aufgaben ─────────────────────────────────────────────────────
   Als Bild geschrieben, damit man sie beim Lesen sieht:
     #  Wand        /  \  drehbarer Spiegel (Startlage)
     a  b  fester Spiegel          T t  drehbarer Teiler
     1 2 4  Filter (Gelb, Rosa, Türkis)
     > < ^ v  Lampe in diese Richtung
     A B C D E  Empfänger: braucht Gelb, Rosa, Türkis, Orange, Weiß      */
const ZIELFARBE = {A:GELB, B:ROSA, C:TUERKIS, D:GELB|ROSA, E:WEISS};
const AUFGABEN = [
  /* 1 Drehungen nötig · 1 Lösung(en) von 2 Stellungen */
  {name:'Erster Strahl', bild:[
    '........',
    '.E......',
    '>\\......',
    '........',
    '........',
    '........']},

  /* 1 Drehungen nötig · 1 Lösung(en) von 4 Stellungen */
  {name:'Zwei Ecken', bild:[
    '>../....',
    '.....#..',
    '........',
    '..E/....',
    '........']},

  /* 2 Drehungen nötig · 1 Lösung(en) von 4 Stellungen */
  {name:'Farbe', bild:[
    '........',
    '....\\.1<',
    '........',
    '........',
    '..../A..',
    '.......#']},

  /* 2 Drehungen nötig · 1 Lösung(en) von 4 Stellungen */
  {name:'Zweimal', bild:[
    '...E.....',
    '.........',
    '.........',
    '>..\\\\.E..',
    '.........',
    '.#..^....']},

  /* 3 Drehungen nötig · 1 Lösung(en) von 8 Stellungen */
  {name:'Umweg', bild:[
    '.........',
    '.........',
    '.........',
    '>/#E.....',
    '.........',
    './.\\.....']},

  /* 2 Drehungen nötig · 1 Lösung(en) von 16 Stellungen */
  {name:'Zwei Farben', bild:[
    '.....v..A',
    'E\\.../1.\\',
    '.........',
    '...#.....',
    '>/.......',
    '..#......',
    '.........']},

  /* 2 Drehungen nötig · 1 Lösung(en) von 16 Stellungen */
  {name:'Enge', bild:[
    '.....#.Ev.',
    '......#...',
    '..........',
    '.......//.',
    '......./.<',
    '......E\\..',
    '......#...']},

  /* 3 Drehungen nötig · 1 Lösung(en) von 16 Stellungen */
  {name:'Der lange Weg', bild:[
    '..........',
    '..........',
    '.....#....',
    '..\\/..#...',
    '......E...',
    '...\\..\\...',
    '..^...#...']},

  /* 4 Drehungen nötig · 1 Lösung(en) von 64 Stellungen */
  {name:'Dreifach', bild:[
    '....v.....',
    '.....E....',
    '.#../\\....',
    '..........',
    '..........',
    '....\\.\\...',
    './/#..E...',
    '.^E.^.....']},

  /* 6 Drehungen nötig · 1 Lösung(en) von 64 Stellungen */
  {name:'Bunt', bild:[
    '...........',
    '>/#....\\..E',
    '...........',
    '..#C..#....',
    './4\\.\\.\\...',
    '...........',
    '...........',
    '.....^.....']},

  /* 3 Drehungen nötig · 1 Lösung(en) von 512 Stellungen */
  {name:'Gedränge', bild:[
    '.v.....v.v.',
    './.././../.',
    '.......\\..\\',
    '...E/E/.#..',
    '...........',
    '.........E\\',
    '.#.#...#...',
    '...........']},

  /* 5 Drehungen nötig · 1 Lösung(en) von 4096 Stellungen */
  {name:'Das Finale', bild:[
    'v...E..\\..<',
    '\\../..../C.',
    '.......4...',
    '...\\/../\\..',
    '.....#E/.\\.',
    '......//#..',
    '...........',
    '.........^.']}
];

/* ── Feld aufbauen ────────────────────────────────────────────────── */
function baueFeld(nr, eigenesBild){
  const bild = eigenesBild || AUFGABEN[nr].bild;
  const h = bild.length, b = Math.max(...bild.map(z => z.length));
  const zellen = [];
  for(let y=0;y<h;y++){
    const zeile = [];
    for(let x=0;x<b;x++){
      const c = bild[y][x] || '.';
      let z = {art:'leer'};
      if(c === '#') z = {art:'wand'};
      else if(c === '/') z = {art:'spiegel', lage:0, drehbar:true};
      else if(c === '\\') z = {art:'spiegel', lage:1, drehbar:true};
      else if(c === 'a') z = {art:'spiegel', lage:0, drehbar:false};
      else if(c === 'b') z = {art:'spiegel', lage:1, drehbar:false};
      else if(c === 'T') z = {art:'teiler', lage:0, drehbar:true};
      else if(c === 't') z = {art:'teiler', lage:1, drehbar:true};
      else if('124'.includes(c)) z = {art:'filter', farbe:+c};
      else if('><^v'.includes(c)) z = {art:'lampe', richtung:'><^v'.indexOf(c) === 0 ? 0 :
                                        c === 'v' ? 1 : c === '<' ? 2 : 3, farbe:WEISS};
      else if('ABCDE'.includes(c)) z = {art:'ziel', braucht:ZIELFARBE[c], hat:0};
      zeile.push(z);
    }
    zellen.push(zeile);
  }
  return {b, h, zellen};
}

/* ── Der Kern: alle Strahlen aus dem Feld berechnen ───────────────────
   Rein: bekommt das Feld, gibt Abschnitte und Treffer zurück. Ändert am
   Feld nichts außer den eingesammelten Farben der Empfänger.          */
function verfolge(feld){
  for(const zeile of feld.zellen) for(const z of zeile) if(z.art === 'ziel') z.hat = 0;
  const abschnitte = [];
  const gesehen = new Set();
  const warte = [];
  for(let y=0;y<feld.h;y++) for(let x=0;x<feld.b;x++){
    const z = feld.zellen[y][x];
    if(z.art === 'lampe') warte.push({x, y, r:z.richtung, farbe:z.farbe});
  }
  let schritte = 0;
  while(warte.length && schritte < 4000){
    const s = warte.pop();
    let {x, y, r, farbe} = s;
    while(schritte++ < 4000){
      const schluessel = x + ',' + y + ',' + r + ',' + farbe;
      if(gesehen.has(schluessel)) break;
      gesehen.add(schluessel);
      const nx = x + DX[r], ny = y + DY[r];
      if(nx < 0 || ny < 0 || nx >= feld.b || ny >= feld.h) break;
      abschnitte.push({x0:x, y0:y, x1:nx, y1:ny, farbe});
      const z = feld.zellen[ny][nx];
      if(z.art === 'wand') break;
      if(z.art === 'ziel'){ z.hat |= farbe; break; }
      if(z.art === 'filter'){
        farbe &= z.farbe;
        if(!farbe) break;
        x = nx; y = ny; continue;
      }
      if(z.art === 'spiegel'){
        r = (z.lage === 0 ? SPIEGEL_A : SPIEGEL_B)[r];
        x = nx; y = ny; continue;
      }
      if(z.art === 'teiler'){
        const abgelenkt = (z.lage === 0 ? SPIEGEL_A : SPIEGEL_B)[r];
        warte.push({x:nx, y:ny, r:abgelenkt, farbe});
        x = nx; y = ny; continue;      // und geradeaus weiter
      }
      x = nx; y = ny;                  // leer oder Lampe: durch
    }
  }
  const ziele = [];
  for(let y=0;y<feld.h;y++) for(let x=0;x<feld.b;x++){
    const z = feld.zellen[y][x];
    if(z.art === 'ziel') ziele.push({x, y, braucht:z.braucht, hat:z.hat, gut:z.hat === z.braucht});
  }
  return {abschnitte, ziele, geloest: ziele.length > 0 && ziele.every(z => z.gut)};
}

/* ── Zustand ──────────────────────────────────────────────────────── */
let feld = null, stufe = 0, zuege = 0, licht = null;
const geloest = new Set(JSON.parse(localStorage.getItem('spiegel.geloest') || '[]'));

const brett = $('#brett'), g = brett.getContext('2d');
let ZELLE = 48, randX = 0, randY = 0;

function passeAn(){
  if(!feld) return;
  const kasten = $('#feld').getBoundingClientRect();
  const b = Math.max(80, kasten.width - 8), h = Math.max(80, kasten.height - 8);
  ZELLE = Math.max(22, Math.floor(Math.min(b/feld.b, h/feld.h)));
  const dpr = Math.min(devicePixelRatio || 1, 2);
  brett.width = Math.round(feld.b*ZELLE*dpr);
  brett.height = Math.round(feld.h*ZELLE*dpr);
  brett.style.width = (feld.b*ZELLE) + 'px';
  brett.style.height = (feld.h*ZELLE) + 'px';
  g.setTransform(dpr,0,0,dpr,0,0);
  zeichne();
}
addEventListener('resize', passeAn);

/* ── Zeichnen ─────────────────────────────────────────────────────── */
function zeichne(){
  if(!feld) return;
  const B = feld.b*ZELLE, H = feld.h*ZELLE;
  g.clearRect(0,0,B,H);
  g.fillStyle = '#0d1119'; g.fillRect(0,0,B,H);
  // Raster
  g.strokeStyle = '#1a2231'; g.lineWidth = 1;
  for(let x=0;x<=feld.b;x++){ g.beginPath(); g.moveTo(x*ZELLE+.5,0); g.lineTo(x*ZELLE+.5,H); g.stroke(); }
  for(let y=0;y<=feld.h;y++){ g.beginPath(); g.moveTo(0,y*ZELLE+.5); g.lineTo(B,y*ZELLE+.5); g.stroke(); }

  // Strahlen: erst breit und blass (Schein), dann schmal und hell
  for(const durchgang of [0,1]){
    for(const a of licht.abschnitte){
      g.strokeStyle = FARBWERT[a.farbe] || '#fff';
      g.globalAlpha = durchgang ? 0.95 : 0.20;
      g.lineWidth = durchgang ? 2.4 : ZELLE*0.34;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo((a.x0+.5)*ZELLE, (a.y0+.5)*ZELLE);
      g.lineTo((a.x1+.5)*ZELLE, (a.y1+.5)*ZELLE);
      g.stroke();
    }
  }
  g.globalAlpha = 1;

  for(let y=0;y<feld.h;y++) for(let x=0;x<feld.b;x++){
    const z = feld.zellen[y][x], mx = (x+.5)*ZELLE, my = (y+.5)*ZELLE, r = ZELLE*0.5;
    if(z.art === 'wand'){
      g.fillStyle = '#2b3345';
      g.fillRect(x*ZELLE+2, y*ZELLE+2, ZELLE-4, ZELLE-4);
      g.fillStyle = '#39445c';
      g.fillRect(x*ZELLE+2, y*ZELLE+2, ZELLE-4, 3);
    }
    else if(z.art === 'spiegel' || z.art === 'teiler'){
      const teiler = z.art === 'teiler';
      if(z.drehbar){
        g.fillStyle = '#161d2b'; g.strokeStyle = '#2b3852'; g.lineWidth = 1.5;
        g.beginPath(); g.roundRect(x*ZELLE+3, y*ZELLE+3, ZELLE-6, ZELLE-6, 7); g.fill(); g.stroke();
      }
      const d = r*0.62;
      const [ax, ay, bx, by] = z.lage === 0
        ? [mx+d, my-d, mx-d, my+d]      // '/'
        : [mx-d, my-d, mx+d, my+d];     // '\'
      g.strokeStyle = teiler ? '#8fd7ff' : '#dbe4f0';
      g.lineWidth = teiler ? 3 : 4.5;
      g.lineCap = 'round';
      if(teiler) g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
      g.setLineDash([]);
      if(!z.drehbar){
        g.fillStyle = '#5d6b85';
        g.beginPath(); g.arc(mx, my, 2.4, 0, 6.283); g.fill();
      }
    }
    else if(z.art === 'filter'){
      g.fillStyle = FARBWERT[z.farbe] + '33';
      g.beginPath(); g.roundRect(x*ZELLE+4, y*ZELLE+4, ZELLE-8, ZELLE-8, 6); g.fill();
      g.strokeStyle = FARBWERT[z.farbe]; g.lineWidth = 2;
      g.beginPath(); g.roundRect(x*ZELLE+4, y*ZELLE+4, ZELLE-8, ZELLE-8, 6); g.stroke();
    }
    else if(z.art === 'lampe'){
      g.fillStyle = '#20283a';
      g.beginPath(); g.roundRect(x*ZELLE+4, y*ZELLE+4, ZELLE-8, ZELLE-8, 8); g.fill();
      g.fillStyle = FARBWERT[z.farbe];
      g.beginPath(); g.arc(mx, my, r*0.32, 0, 6.283); g.fill();
      // Pfeil in Strahlrichtung
      g.strokeStyle = FARBWERT[z.farbe]; g.lineWidth = 2.4; g.lineCap = 'round';
      const ex = mx + DX[z.richtung]*r*0.62, ey = my + DY[z.richtung]*r*0.62;
      g.beginPath(); g.moveTo(mx + DX[z.richtung]*r*0.36, my + DY[z.richtung]*r*0.36);
      g.lineTo(ex, ey); g.stroke();
    }
    else if(z.art === 'ziel'){
      const gut = z.hat === z.braucht;
      g.fillStyle = gut ? FARBWERT[z.braucht] + '44' : '#161d2b';
      g.beginPath(); g.arc(mx, my, r*0.72, 0, 6.283); g.fill();
      g.strokeStyle = gut ? FARBWERT[z.braucht] : '#3a4a68';
      g.lineWidth = gut ? 3.4 : 2;
      g.beginPath(); g.arc(mx, my, r*0.72, 0, 6.283); g.stroke();
      g.fillStyle = gut ? FARBWERT[z.braucht] : '#5d6b85';
      g.beginPath(); g.arc(mx, my, r*0.30, 0, 6.283); g.fill();
      if(!gut){
        g.strokeStyle = FARBWERT[z.braucht]; g.lineWidth = 2.6;
        g.beginPath(); g.arc(mx, my, r*0.48, -0.9, 0.9); g.stroke();
      }
    }
  }
}

/* ── Bedienung ────────────────────────────────────────────────────── */
function tippe(px, py){
  if(!feld) return;
  const r = brett.getBoundingClientRect();
  const x = Math.floor((px - r.left) / ZELLE), y = Math.floor((py - r.top) / ZELLE);
  if(x < 0 || y < 0 || x >= feld.b || y >= feld.h) return;
  const z = feld.zellen[y][x];
  if(!z.drehbar) return;
  z.lage = z.lage ? 0 : 1;
  zuege++;
  neuRechnen();
}
brett.addEventListener('pointerdown', e => { e.preventDefault(); tippe(e.clientX, e.clientY); });

function neuRechnen(){
  licht = verfolge(feld);
  zeichne();
  anzeige();
  if(licht.geloest && !geloest.has(stufe)){
    geloest.add(stufe);
    localStorage.setItem('spiegel.geloest', JSON.stringify([...geloest]));
  }
  if(licht.geloest){
    $('#fuss').innerHTML = geloest.size >= AUFGABEN.length
      ? '<b>Alle zwölf gelöst.</b>'
      : '<b>Gelöst.</b> Weiter mit der nächsten Aufgabe.';
    setTimeout(() => { if(licht.geloest) weiter(); }, 1100);
  } else {
    $('#fuss').textContent = 'Auf einen Spiegel tippen dreht ihn';
  }
}
function anzeige(){
  $('#stufeKarte b').textContent = (stufe+1) + ' / ' + AUFGABEN.length;
  const gut = licht.ziele.filter(z => z.gut).length;
  $('#zielKarte b').textContent = gut + ' / ' + licht.ziele.length;
  $('#zugKarte b').textContent = zuege;
}
function lade(nr){
  stufe = ((nr % AUFGABEN.length) + AUFGABEN.length) % AUFGABEN.length;
  feld = baueFeld(stufe);
  zuege = 0;
  licht = verfolge(feld);
  passeAn();
  anzeige();
  $('#fuss').textContent = AUFGABEN[stufe].name;
}
function weiter(){
  if(geloest.size >= AUFGABEN.length){
    $('#endeText').textContent = 'Alle zwölf Aufgaben gelöst.';
    $('#ende').classList.remove('weg');
    return;
  }
  let n = stufe;
  do { n = (n+1) % AUFGABEN.length; } while(geloest.has(n) && n !== stufe);
  lade(n);
}
function stufenListe(){
  const wo = $('#stufen'); wo.innerHTML = '';
  AUFGABEN.forEach((a, i) => {
    const b = document.createElement('button');
    b.className = 'stufe' + (geloest.has(i) ? ' fertig' : '') + (i === stufe ? ' jetzt' : '');
    b.textContent = i+1; b.title = a.name;
    b.addEventListener('click', () => { $('#liste').classList.add('weg'); lade(i); });
    wo.appendChild(b);
  });
}
$('#losKnopf').addEventListener('click', () => { $('#start').classList.add('weg'); lade(0); });
$('#nochmal').addEventListener('click', () => {
  geloest.clear(); localStorage.removeItem('spiegel.geloest');
  $('#ende').classList.add('weg'); lade(0);
});
$('#zurueckKnopf').addEventListener('click', () => lade(stufe));
$('#listeKnopf').addEventListener('click', () => { stufenListe(); $('#liste').classList.remove('weg'); });
$('#listeZu').addEventListener('click', () => $('#liste').classList.add('weg'));

window.__spiegel = {
  verfolge, baueFeld, AUFGABEN, ZIELFARBE,
  get feld(){return feld}, get licht(){return licht}, get stufe(){return stufe},
  lade, neuRechnen,
  /* Für den Löser: alle drehbaren Teile einer Stellung setzen. */
  drehbare(f){ const aus = [];
    for(let y=0;y<f.h;y++) for(let x=0;x<f.b;x++) if(f.zellen[y][x].drehbar) aus.push(f.zellen[y][x]);
    return aus; }
};
