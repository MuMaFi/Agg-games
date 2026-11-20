/* ═══════════════════════════════════════════════════════════════════
   Illegal Autostehlen — Texturen.
   Alles wird beim Start auf Leinwände gemalt: Fassaden (mit eigener
   Nachtbeleuchtung je Fenster), Asphalt, Gehweg, Gras, Sand, Palmwedel.
   Keine Bilddatei muss geladen werden.
   ═══════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

export function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

let ANISO = 4;
export function setzeAniso(n){ ANISO = n; }

// Auf Tablets und Handys wird jede große Leinwand halb so groß angelegt (iPad-Safari hat ein hartes
// Limit für Canvas-Speicher). Gezeichnet wird weiter in den vollen Koordinaten, der Kontext skaliert.
let FAKTOR = 1;
export function setzeFaktor(f){ FAKTOR = f; }
export const faktor = () => FAKTOR;
function leinwand(w, h, roh = false){
  const c = document.createElement('canvas');
  const f = !roh && FAKTOR < 1 && Math.max(w, h) >= 1024 ? FAKTOR : 1;
  c.width = Math.round(w*f); c.height = Math.round(h*f);
  if(f !== 1) c.getContext('2d').scale(f, f);
  c.faktor = f;
  return c;
}
function alsTextur(c, { srgb = true, wiederholen = true } = {}){
  const t = new THREE.CanvasTexture(c);
  if(wiederholen){ t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if(srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// feines Korn auf Pixelebene: gibt Flächen aus der Nähe Struktur statt Matsch
function korn(c, staerke, seed){
  const g = c.getContext('2d'), w = c.width, h = c.height, d = g.getImageData(0, 0, w, h), p = d.data, z = mulberry32(seed);
  for(let i = 0; i < p.length; i += 4){
    const f = 1 + (z() - .5)*2*staerke;
    p[i] = Math.min(255, p[i]*f); p[i + 1] = Math.min(255, p[i + 1]*f); p[i + 2] = Math.min(255, p[i + 2]*f);
  }
  g.putImageData(d, 0, 0);
}
function rauschen(g, w, h, dichte, hell, dunkel, zufall){
  for(let i = 0; i < dichte; i++){
    const x = zufall()*w, y = zufall()*h;
    g.fillStyle = zufall() < .5 ? hell : dunkel;
    g.fillRect(x, y, 1 + zufall()*2, 1 + zufall()*2);
  }
}

/* ── Fassaden ───────────────────────────────────────────────────────
   Jede Art liefert: Farbe, Rauheit/Metall (G/B-Kanal) und Leuchten.
   tileW/tileH: wie viele Meter ein Bild der Textur abdeckt.          */
const LICHT = ['#ffcf8a', '#ffe0ad', '#ffd59c', '#dcecff', '#cfe3ff', '#fff3d6'];
const SELTEN = ['#ff7ad9', '#7af0ff', '#b48cff'];

export function fassade(art, seed){
  const z = mulberry32(seed);
  const S = 512; // gezeichnet wird in 512er Koordinaten, die Farbe aber doppelt aufgelöst
  const cF = leinwand(S*2, S*2), cR = leinwand(S, S), cL = leinwand(S, S);
  const f = cF.getContext('2d'), r = cR.getContext('2d'), l = cL.getContext('2d');
  f.scale(2, 2);
  l.fillStyle = '#000'; l.fillRect(0, 0, S, S);
  let cols, rows, tileW, tileH;

  const fenster = (x, y, w, h, an) => {
    if(z() < an){
      l.globalAlpha = .55 + z()*.45;
      l.fillStyle = z() < .03 ? SELTEN[(z()*SELTEN.length)|0] : LICHT[(z()*LICHT.length)|0];
      l.fillRect(x, y, w, h);
      // Vorhang oder Jalousie: Teil des Fensters dunkler
      if(z() < .4){ l.globalAlpha = .5; l.fillStyle = '#000'; l.fillRect(x, y, w, h*(.2 + z()*.5)); }
      l.globalAlpha = 1;
    }
  };

  if(art === 'glas' || art === 'dunkel'){
    cols = 8; rows = 10; tileW = 24; tileH = 38;
    const dunkel = art === 'dunkel';
    f.fillStyle = dunkel ? '#1a2027' : '#3a4650'; f.fillRect(0, 0, S, S);
    r.fillStyle = 'rgb(0,150,40)'; r.fillRect(0, 0, S, S);
    const cw = S/cols, ch = S/rows;
    for(let j = 0; j < rows; j++) for(let i = 0; i < cols; i++){
      const x = i*cw + 2, y = j*ch + 4, w = cw - 4, h = ch - 9;
      const gr = f.createLinearGradient(0, y, 0, y + h);
      if(dunkel){ gr.addColorStop(0, '#3b5060'); gr.addColorStop(1, '#1d2a35'); }
      else { gr.addColorStop(0, '#b4d6e8'); gr.addColorStop(1, '#6390ad'); }
      f.fillStyle = gr; f.fillRect(x, y, w, h);
      r.fillStyle = 'rgb(0,22,235)'; r.fillRect(x, y, w, h);
      fenster(x + 1, y + 1, w - 2, h - 2, dunkel ? .3 : .36);
    }
  } else if(art === 'buero'){
    cols = 6; rows = 8; tileW = 21; tileH = 28;
    f.fillStyle = '#d9d1c4'; f.fillRect(0, 0, S, S);
    rauschen(f, S, S, 2500, '#e4ddd2', '#c9c0b2', z);
    r.fillStyle = 'rgb(0,215,0)'; r.fillRect(0, 0, S, S);
    const cw = S/cols, ch = S/rows;
    for(let j = 0; j < rows; j++){
      const y = j*ch + ch*.32, h = ch*.56;
      f.fillStyle = '#2f4553'; f.fillRect(0, y, S, h);
      r.fillStyle = 'rgb(0,40,170)'; r.fillRect(0, y, S, h);
      for(let i = 0; i < cols; i++){
        const x = i*cw;
        f.fillStyle = '#6f8796'; f.fillRect(x + 4, y + 3, cw - 8, h*.35);
        f.fillStyle = '#c9c0b2'; f.fillRect(x, y, 3, h);
        fenster(x + 4, y + 2, cw - 8, h - 4, .34);
      }
    }
  } else if(art === 'deko'){
    cols = 6; rows = 8; tileW = 18; tileH = 26;
    f.fillStyle = '#f4f1ea'; f.fillRect(0, 0, S, S);
    rauschen(f, S, S, 1800, '#faf8f3', '#e6e1d6', z);
    r.fillStyle = 'rgb(0,200,0)'; r.fillRect(0, 0, S, S);
    const cw = S/cols, ch = S/rows;
    for(let j = 0; j < rows; j++) for(let i = 0; i < cols; i++){
      const x = i*cw, y = j*ch;
      // Lisenen und Gesimse im Art-déco-Stil
      f.fillStyle = '#e7e1d4'; f.fillRect(x, y, 6, ch);
      f.fillStyle = '#d6cfbf'; f.fillRect(x, y + ch - 7, cw, 4);
      f.fillStyle = '#2b4554'; f.fillRect(x + 14, y + 14, cw - 28, ch - 30);
      r.fillStyle = 'rgb(0,30,120)'; r.fillRect(x + 14, y + 14, cw - 28, ch - 30);
      f.fillStyle = '#ffffff'; f.fillRect(x + 10, y + ch - 18, cw - 20, 5); // Balkon
      f.fillStyle = '#c8c2b5'; f.fillRect(x + 12, y + 10, cw - 24, 4);    // Augenbraue
      fenster(x + 15, y + 15, cw - 30, ch - 32, .42);
    }
  } else { // haus
    cols = 2; rows = 2; tileW = 8; tileH = 6.4;
    f.fillStyle = '#f2ebdf'; f.fillRect(0, 0, S, S);
    rauschen(f, S, S, 3500, '#f8f3ea', '#e3d9c9', z);
    r.fillStyle = 'rgb(0,230,0)'; r.fillRect(0, 0, S, S);
    const cw = S/cols, ch = S/rows;
    for(let j = 0; j < rows; j++) for(let i = 0; i < cols; i++){
      const x = i*cw, y = j*ch;
      const tuer = j === 1 && i === 0;
      if(tuer){
        f.fillStyle = '#6b4a35'; f.fillRect(x + cw*.36, y + ch*.28, cw*.28, ch*.72);
        f.fillStyle = '#e9e1d2'; f.fillRect(x + cw*.33, y + ch*.24, cw*.34, 8);
        fenster(x + cw*.4, y + ch*.32, cw*.2, ch*.16, .5);
      } else {
        f.fillStyle = '#ffffff'; f.fillRect(x + cw*.2 - 6, y + ch*.22 - 6, cw*.6 + 12, ch*.5 + 12);
        f.fillStyle = '#34495a'; f.fillRect(x + cw*.2, y + ch*.22, cw*.6, ch*.5);
        r.fillStyle = 'rgb(0,30,60)'; r.fillRect(x + cw*.2, y + ch*.22, cw*.6, ch*.5);
        f.fillStyle = '#ffffff'; f.fillRect(x + cw*.5 - 3, y + ch*.22, 6, ch*.5);
        // Fensterläden
        f.fillStyle = 'rgba(60,110,120,.85)';
        f.fillRect(x + cw*.2 - 30, y + ch*.22, 22, ch*.5); f.fillRect(x + cw*.8 + 8, y + ch*.22, 22, ch*.5);
        fenster(x + cw*.2, y + ch*.22, cw*.6, ch*.5, .5);
      }
    }
  }
  korn(cF, .05, seed + 100);
  return {
    map: alsTextur(cF), rm: alsTextur(cR, { srgb: false }), em: alsTextur(cL),
    tileW, tileH
  };
}

/* ── Boden ─────────────────────────────────────────────────────── */
export function asphaltStrasse(){
  // 16 m breit, 32 m lang; doppelt aufgelöst gemalt (Koordinaten bleiben 256 × 512)
  const c = leinwand(1024, 2048), g = c.getContext('2d'), z = mulberry32(7);
  g.scale(4, 4);
  g.fillStyle = '#34363b'; g.fillRect(0, 0, 256, 512);
  rauschen(g, 256, 512, 9000, '#3e4045', '#2a2c30', z);
  // Flicken und Fahrspuren
  g.globalAlpha = .18; g.fillStyle = '#1d1f22';
  for(let i = 0; i < 6; i++) g.fillRect(z()*220, z()*480, 20 + z()*40, 10 + z()*40);
  g.fillRect(40, 0, 18, 512); g.fillRect(198, 0, 18, 512);
  g.globalAlpha = 1;
  const m = 256/16; // Pixel pro Meter
  g.fillStyle = '#e8e6df';
  g.fillRect(m*.5, 0, m*.18, 512); g.fillRect(256 - m*.68, 0, m*.18, 512);
  for(let y = 0; y < 512; y += 64){ g.fillRect(m*4 - 2, y + 8, 4, 32); g.fillRect(m*12 - 2, y + 8, 4, 32); }
  g.fillStyle = '#f0c23a';
  g.fillRect(128 - 7, 0, 4, 512); g.fillRect(128 + 3, 0, 4, 512);
  g.setTransform(1, 0, 0, 1, 0, 0);
  rauschen(g, 1024, 2048, 60000, 'rgba(90,92,98,.5)', 'rgba(20,20,24,.5)', z); // Splitt
  korn(c, .09, 70);
  return alsTextur(c);
}
export function asphaltKreuzung(){
  const c = leinwand(1024, 1024), g = c.getContext('2d'), z = mulberry32(8);
  g.scale(4, 4);
  g.fillStyle = '#34363b'; g.fillRect(0, 0, 256, 256);
  rauschen(g, 256, 256, 5000, '#3e4045', '#2a2c30', z);
  g.fillStyle = '#e8e6df';
  const m = 16;
  for(let i = 0; i < 7; i++){
    const p = m*1.4 + i*m*2;
    g.fillRect(p, 4, m*1, m*2.2); g.fillRect(p, 256 - 4 - m*2.2, m*1, m*2.2);
    g.fillRect(4, p, m*2.2, m*1); g.fillRect(256 - 4 - m*2.2, p, m*2.2, m*1);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  rauschen(g, 1024, 1024, 30000, 'rgba(90,92,98,.5)', 'rgba(20,20,24,.5)', z);
  korn(c, .09, 80);
  return alsTextur(c);
}
export function gehweg(){
  // 2 × 2 m, 1024 px: 4 × 4 Betonplatten à 50 cm mit Fugen, jede leicht anders getönt
  const S = 1024, c = leinwand(S, S), g = c.getContext('2d'), z = mulberry32(9), P = S/4;
  g.fillStyle = '#76726b'; g.fillRect(0, 0, S, S);
  for(let j = 0; j < 4; j++) for(let i = 0; i < 4; i++){
    const t = 150 + z()*22;
    g.fillStyle = `rgb(${t},${t - 4},${t - 11})`; g.fillRect(i*P + 3, j*P + 3, P - 6, P - 6);
    g.globalAlpha = .1; g.fillStyle = '#4a4741';
    for(let k = 0; k < 3; k++) g.fillRect(i*P + z()*P*.7, j*P + z()*P*.7, 10 + z()*70, 6 + z()*50);
    g.globalAlpha = 1;
  }
  rauschen(g, S, S, 50000, 'rgba(210,205,196,.6)', 'rgba(70,66,60,.6)', z);
  korn(c, .07, 90);
  return alsTextur(c);
}
export function gras(){
  // 10 × 10 m, 1024 px: weiche große Farbflecken, mittlere Büschel, feine Halme; nahtlos kachelbar
  const S = 1024, c = leinwand(S, S), g = c.getContext('2d'), z = mulberry32(10);
  g.fillStyle = '#4a6436'; g.fillRect(0, 0, S, S);
  const rund = (x, y, r, farbe) => {
    for(const dx of [-S, 0, S]) for(const dy of [-S, 0, S]){
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, farbe); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r*2, r*2);
    }
  };
  for(let i = 0; i < 18; i++){ const hell = z() < .5; rund(z()*S, z()*S, 110 + z()*160, hell ? `rgba(120,150,70,${.18 + z()*.15})` : `rgba(30,50,25,${.18 + z()*.15})`); }
  for(let i = 0; i < 160; i++){ const t = z(); rund(z()*S, z()*S, 18 + z()*40, `hsla(${80 + t*35},${30 + z()*20}%,${22 + z()*16}%,.35)`); }
  // Halme: kurze, leicht geneigte Striche
  g.lineCap = 'round';
  for(let i = 0; i < 60000; i++){
    const x = z()*S, y = z()*S, l = 4 + z()*9, w = (z() - .5)*4;
    g.strokeStyle = `hsla(${72 + z()*46},${26 + z()*26}%,${12 + z()*40}%,${.45 + z()*.45})`;
    g.lineWidth = .8 + z()*1.1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y - l); g.stroke();
  }
  korn(c, .06, 100);
  return alsTextur(c);
}
export function sand(){
  const c = leinwand(1024, 1024), g = c.getContext('2d'), z = mulberry32(11);
  g.fillStyle = '#e3cfa2'; g.fillRect(0, 0, 1024, 1024);
  rauschen(g, 1024, 1024, 160000, '#efdcb2', '#cdb68a', z);
  g.globalAlpha = .08; g.fillStyle = '#a8916a';
  for(let i = 0; i < 40; i++){ g.beginPath(); g.ellipse(z()*1024, z()*1024, 40 + z()*120, 8 + z()*20, z()*3, 0, 7); g.fill(); }
  g.globalAlpha = 1;
  korn(c, .08, 110);
  return alsTextur(c);
}
export function dach(){
  const c = leinwand(512, 512), g = c.getContext('2d'), z = mulberry32(12);
  g.scale(2, 2);
  g.fillStyle = '#6a6e73'; g.fillRect(0, 0, 256, 256);
  rauschen(g, 256, 256, 8000, '#777b80', '#5b5f64', z);
  g.fillStyle = 'rgba(40,40,44,.25)';
  for(let i = 0; i < 256; i += 32) g.fillRect(0, i, 256, 2);
  korn(c, .07, 120);
  return alsTextur(c);
}
export function ziegel(){
  const c = leinwand(256, 256), g = c.getContext('2d'), z = mulberry32(13);
  g.scale(2, 2);
  g.fillStyle = '#b5583a'; g.fillRect(0, 0, 128, 128);
  for(let y = 0; y < 128; y += 16){
    for(let x = (y/16)%2 ? -8 : 0; x < 128; x += 16){
      g.fillStyle = `hsl(${12 + z()*8},${50 + z()*15}%,${36 + z()*12}%)`;
      g.fillRect(x + 1, y + 1, 14, 14);
    }
  }
  return alsTextur(c);
}
export function piste(){
  // Rollbahn: 40 m breit, 40 m lang je Bild
  const c = leinwand(512, 512), g = c.getContext('2d'), z = mulberry32(14);
  g.scale(2, 2);
  g.fillStyle = '#2d2f33'; g.fillRect(0, 0, 256, 256);
  rauschen(g, 256, 256, 6000, '#37393d', '#25272a', z);
  g.fillStyle = '#eeeeea';
  g.fillRect(124, 30, 8, 100);
  g.fillRect(8, 0, 4, 256); g.fillRect(244, 0, 4, 256);
  korn(c, .08, 140);
  return alsTextur(c);
}
export function parkplatz(){
  const c = leinwand(512, 512), g = c.getContext('2d'), z = mulberry32(15);
  g.scale(2, 2);
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, 256, 256);
  rauschen(g, 256, 256, 6000, '#44464a', '#303236', z);
  g.fillStyle = '#e6e4dc';
  for(let x = 0; x < 256; x += 32) g.fillRect(x, 0, 3, 90), g.fillRect(x, 166, 3, 90);
  korn(c, .08, 150);
  return alsTextur(c);
}
export function stamm(){
  const c = leinwand(64, 256), g = c.getContext('2d'), z = mulberry32(16);
  g.fillStyle = '#8a6d4c'; g.fillRect(0, 0, 64, 256);
  for(let y = 0; y < 256; y += 10){
    g.fillStyle = `rgba(60,42,26,${.35 + z()*.3})`; g.fillRect(0, y, 64, 3);
    g.fillStyle = `rgba(190,160,120,${.2 + z()*.2})`; g.fillRect(0, y + 4, 64, 2);
  }
  return alsTextur(c);
}
export function wedel(){
  // Palmwedel mit Alphakanal: Mittelrippe, schräge Fiederblätter
  const c = leinwand(128, 512), g = c.getContext('2d'), z = mulberry32(17);
  g.clearRect(0, 0, 128, 512);
  for(let y = 10; y < 500; y += 7){
    const t = y/512, len = 58*Math.sin(Math.PI*Math.min(1, t*1.1 + .05));
    const farbe = `hsl(${95 + z()*25},${45 + z()*15}%,${24 + z()*14}%)`;
    g.strokeStyle = farbe; g.lineWidth = 4 + z()*2; g.lineCap = 'round';
    g.beginPath(); g.moveTo(64, y); g.lineTo(64 - len, y + 22 + z()*8); g.stroke();
    g.beginPath(); g.moveTo(64, y); g.lineTo(64 + len, y + 22 + z()*8); g.stroke();
  }
  g.strokeStyle = '#6b6a3a'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 512); g.stroke();
  const t = alsTextur(c, { wiederholen: false });
  return t;
}
export function lichtfleck(){
  const c = leinwand(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,210,150,1)');
  gr.addColorStop(.4, 'rgba(255,170,100,.45)');
  gr.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return alsTextur(c, { wiederholen: false });
}
export function strahl(){
  // senkrechter Leuchtkegel für Zielmarken: unten hell, oben weg
  const c = leinwand(4, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(.7, 'rgba(255,255,255,.35)');
  gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return alsTextur(c, { wiederholen: false });
}
export function ring(){
  const c = leinwand(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(.6, 'rgba(255,255,255,.9)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return alsTextur(c, { wiederholen: false });
}
export function wasserNormalen(){
  // gekachelte Normalenkarte aus überlagerten Sinuswellen
  const S = 256, c = leinwand(S, S), g = c.getContext('2d');
  const img = g.createImageData(S, S), d = img.data, z = mulberry32(21);
  const wellen = [];
  for(let i = 0; i < 9; i++) wellen.push({ kx: Math.round((z() - .5)*10), ky: Math.round((z() - .5)*10) || 1, a: .4 + z(), p: z()*6.28 });
  for(let y = 0; y < S; y++) for(let x = 0; x < S; x++){
    let dx = 0, dy = 0;
    for(const w of wellen){
      const ph = (w.kx*x + w.ky*y)/S*Math.PI*2 + w.p;
      const c2 = Math.cos(ph)*w.a;
      dx += c2*w.kx; dy += c2*w.ky;
    }
    const n = new THREE.Vector3(-dx*.03, -dy*.03, 1).normalize();
    const o = (y*S + x)*4;
    d[o] = (n.x*.5 + .5)*255; d[o + 1] = (n.y*.5 + .5)*255; d[o + 2] = (n.z*.5 + .5)*255; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return alsTextur(c, { srgb: false });
}
export function schild(text, farbe, schrift){
  const c = leinwand(512, 160), g = c.getContext('2d');
  g.clearRect(0, 0, 512, 160);
  g.font = schrift; g.textAlign = 'center'; g.textBaseline = 'middle';
  // zu lange Schriftzüge verkleinern, damit nichts abgeschnitten wird
  const breite = g.measureText(text).width;
  if(breite > 470){ const px = parseFloat((schrift.match(/(\d+)px/) || [0, 72])[1]); g.font = schrift.replace(/\d+px/, Math.floor(px*470/breite) + 'px'); }
  g.shadowColor = farbe; g.shadowBlur = 22;
  g.fillStyle = farbe; g.fillText(text, 256, 84);
  g.shadowBlur = 6; g.fillStyle = '#ffffff'; g.globalAlpha = .75; g.fillText(text, 256, 84);
  return alsTextur(c, { wiederholen: false });
}
export function arenaBand(){
  const c = leinwand(1024, 128), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 128);
  g.lineWidth = 5;
  for(let i = 0; i < 16; i++){
    const x = i*64;
    g.strokeStyle = i%2 ? '#36e6ff' : '#ff4fb0';
    g.beginPath(); g.moveTo(x, 120); g.lineTo(x + 32, 8); g.lineTo(x + 64, 120); g.stroke();
  }
  return alsTextur(c);
}

export function arenaFassade(){
  // tagsüber: helle Paneele mit Fugen und dunklen Glasbändern
  const c = leinwand(1024, 128), g = c.getContext('2d'), z = mulberry32(31);
  g.fillStyle = '#e8e9ec'; g.fillRect(0, 0, 1024, 128);
  for(let i = 0; i < 16; i++){
    const x = i*64;
    g.fillStyle = i % 2 ? '#dadde2' : '#eef0f3';
    g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 32, 0); g.lineTo(x + 64, 128); g.closePath(); g.fill();
  }
  g.fillStyle = '#2b3a46'; g.fillRect(0, 96, 1024, 22);
  g.fillStyle = '#3d5363'; for(let x = 0; x < 1024; x += 16) g.fillRect(x + 1, 98, 13, 18);
  g.strokeStyle = 'rgba(80,90,100,.35)'; g.lineWidth = 2;
  for(let i = 0; i <= 16; i++){ const x = i*64; g.beginPath(); g.moveTo(x, 128); g.lineTo(x + 32, 0); g.lineTo(x + 64, 128); g.stroke(); }
  rauschen(g, 1024, 128, 2500, 'rgba(255,255,255,.4)', 'rgba(0,0,0,.05)', z);
  return alsTextur(c);
}

/* Reliefkarte aus einer Leinwand: Helligkeit gilt als Höhe (Sobel-Filter).
   Fugen und Risse sind dunkel, also tiefer, Farbe auf der Straße hell, also leicht erhaben. */
export function normalVon(quelle, staerke = 2){
  const w = quelle.width, h = quelle.height;
  // halb so große Leinwand: gleiche Kanten liegen auf halb so vielen Pixeln, also Relief entsprechend abschwächen
  staerke *= quelle.faktor || 1;
  const g = quelle.getContext('2d');
  const d = g.getImageData(0, 0, w, h).data;
  const hoehe = new Float32Array(w*h);
  for(let i = 0; i < w*h; i++) hoehe[i] = (d[i*4] + d[i*4 + 1] + d[i*4 + 2])/765;
  const c = leinwand(w, h, true), gc = c.getContext('2d'), img = gc.createImageData(w, h), o = img.data;
  const H = (x, y) => hoehe[((y + h) % h)*w + ((x + w) % w)];
  for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
    const dx = (H(x + 1, y - 1) + 2*H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2*H(x - 1, y) + H(x - 1, y + 1));
    const dy = (H(x - 1, y + 1) + 2*H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2*H(x, y - 1) + H(x + 1, y - 1));
    let nx = -dx*staerke, ny = dy*staerke, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y*w + x)*4;
    o[i] = (nx*.5 + .5)*255; o[i + 1] = (ny*.5 + .5)*255; o[i + 2] = (nz*.5 + .5)*255; o[i + 3] = 255;
  }
  gc.putImageData(img, 0, 0);
  return alsTextur(c, { srgb: false });
}
/* Rauheit aus Helligkeit: dunkle, glatt gefahrene Stellen glänzen mehr */
export function rauheitVon(quelle, basis = .8, spanne = .3){
  const w = quelle.width, h = quelle.height, d = quelle.getContext('2d').getImageData(0, 0, w, h).data;
  const c = leinwand(w, h, true), gc = c.getContext('2d'), img = gc.createImageData(w, h), o = img.data;
  for(let i = 0; i < w*h; i++){
    const l = (d[i*4] + d[i*4 + 1] + d[i*4 + 2])/765;
    const r = Math.max(0, Math.min(1, basis - spanne*.5 + l*spanne));
    o[i*4] = 0; o[i*4 + 1] = r*255; o[i*4 + 2] = 0; o[i*4 + 3] = 255;
  }
  gc.putImageData(img, 0, 0);
  return alsTextur(c, { srgb: false });
}
/* weicher Kontaktschatten: innen dunkel, nach außen auslaufend */
export function kontaktSchatten(){
  const c = leinwand(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(.55, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return alsTextur(c, { wiederholen: false });
}
/* Verlauf für den Schatten am Fuß von Hauswänden (u: 0 an der Wand, 1 außen) */
export function wandSchatten(){
  const c = leinwand(64, 4), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 64, 0);
  gr.addColorStop(0, 'rgba(0,0,0,.6)'); gr.addColorStop(.35, 'rgba(0,0,0,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 4);
  const t = alsTextur(c, { wiederholen: false }); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
