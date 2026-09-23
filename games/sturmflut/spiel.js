/* ======================================================================
   STURMFLUT · Oberfläche

   Alles, was man sieht und anfasst. Die Regeln stehen in regeln.js, die
   Karten in karten.js, der Feldzug in feldzug.js — hier wird nur
   gezeichnet, abgespielt und zugehört.

   Zwei Zustände laufen nebeneinander:
     Z    der wahre Zustand, so wie die Regeln ihn hinterlassen haben
     ANZ  der angezeigte, der den Bewegungen hinterherläuft
   Eine Handlung wird sofort auf Z ausgeführt; ihre Ereignisse werden
   dann eins nach dem anderen auf ANZ abgespielt. Am Ende wird ANZ durch
   eine frische Kopie von Z ersetzt — damit sich nie ein Fehler in der
   Darstellung in das Spiel einschleichen kann.

   Aufbau
     1  Zustand und Brett
     2  Farben und Grundformen
     3  Zeichnen
     4  Wiedergabe
     5  Ton
     6  Eingabe
     7  Anzeige
     8  Ablauf
   ====================================================================== */
import * as R from './regeln.js';
import { missionBauen, aufstellFelder, umstellen, INSELN, STUFEN } from './karten.js';
import * as F from './feldzug.js';

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const glatt = t => t * t * (3 - 2 * t);
const N = R.N;

/* ======================= 1  Zustand und Brett ======================= */
let K = null;                // Feldzug
let Z = null;                // Einsatz, wahr
let ANZ = null;              // Einsatz, angezeigt
let ZUG_START = null;        // für „Zug neu“
let NEU_UEBRIG = 1;
const UI = {
  wahl: null,                // gewählte Maschine (id)
  zielen: false,             // Waffe scharf?
  hover: null,               // [x, y] unter dem Zeiger
  vorschau: null,            // { x, y, z, ev } — Ergebnis eines Angriffs, ausprobiert auf einer Kopie
  bestaetigen: null,         // am Finger: [x, y], das beim zweiten Tippen ausgelöst wird
  besetzt: false,            // während einer Wiedergabe keine Eingabe
  feindZug: false,           // sie sind gerade dran — die Kopfzeile zeigt dann ANZ
  feind: null,               // angetippter Feind (id)
  endeWarnung: false,
  aufstellWahl: null,
};
const IST_FINGER = matchMedia('(hover: none)').matches || 'ontouchstart' in window;

const cv = $('c'), ctx = cv.getContext('2d');
const G = { w: 0, h: 0, dpr: 1, tw: 64, th: 32, dicke: 14, ox: 0, oy: 0 };

/* Das Brett passt sich dem Platz an, der zwischen den Tafeln frei ist.
   Querformat: oben die Kopfzeile, unten stehen die Tafeln links und
   rechts, dazwischen darf die untere Spitze der Raute hinein.
   Hochkant: die Tafeln unten nehmen die ganze Breite. */
function groesse() {
  const r = $('buehne').getBoundingClientRect();
  G.w = r.width; G.h = r.height;
  G.dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(G.w * G.dpr); cv.height = Math.round(G.h * G.dpr);
  /* Der freie Platz fürs Brett: zwischen den Leisten links und rechts
     (flaches Querformat) oder zwischen Kopf und Fuß (alles andere). Die
     Tafeln unten liegen genau dort, wo die vorderen Kanten der Raute
     hinlaufen — also bekommen sie ihren Platz. */
  const seitlich = matchMedia('(max-height: 520px) and (min-aspect-ratio: 7/5)').matches;
  let x0 = 8, x1 = G.w - 8, y0, y1;
  if (seitlich) {
    x0 = $('oben').getBoundingClientRect().right + 6;
    x1 = $('unten').getBoundingClientRect().left - 6;
    y0 = 6; y1 = G.h - 6;
  } else {
    y0 = $('oben').getBoundingClientRect().bottom + 6;
    y1 = $('unten').getBoundingClientRect().top - 6;
  }
  const frei = Math.max(120, y1 - y0), breit = Math.max(160, x1 - x0);
  /* Die Raute ist 8 Kacheln breit und 4 hoch, dazu Platz für Häuser und
     Leuchttürme, die über die hintere Kante hinausragen. */
  const tw = Math.min(breit / 8.3, frei / (4 + 1.25));
  G.tw = tw; G.th = tw / 2; G.dicke = tw * 0.2;
  G.ox = (x0 + x1) / 2;
  G.oy = y0 + tw * 1.05 + Math.max(0, (frei - tw * (4 + 1.25)) / 2);
}
addEventListener('resize', () => { groesse(); });

const iso = (x, y) => [G.ox + (x - y) * G.tw / 2, G.oy + (x + y) * G.th / 2];
const mitte = (x, y) => iso(x + 0.5, y + 0.5);
function feldUnter(px, py) {
  const u = (px - G.ox) / (G.tw / 2), v = (py - G.oy) / (G.th / 2);
  const x = Math.floor((u + v) / 2), y = Math.floor((v - u) / 2);
  return R.imFeld(x, y) ? [x, y] : null;
}

/* ======================= 2  Farben und Grundformen ======================= */
function hex(h) {
  if (h[0] === 'r') return h.slice(h.indexOf('(') + 1, -1).split(',').slice(0, 3).map(Number);
  const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function ton(h, f) {
  const [r, g, b] = hex(h);
  const k = v => clamp(Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f), 0, 255);
  return `rgb(${k(r)},${k(g)},${k(b)})`;
}
function rgba(h, a) { const [r, g, b] = hex(h); return `rgba(${r},${g},${b},${a})`; }

const FARBE = {
  gras: '#9fae78', sand: '#cdbd8e', erde: '#5b4a35', erdeTief: '#3f3325',
  wasser: '#2f5f7a', wasserHell: '#5f95ad', schaum: '#d7e9ef',
  fels: '#8a8578', ziegel: '#b0553d', wand: '#e8dfcc', dach: '#6b3b33',
  gelb: '#f2b233', stahl: '#3b434d', schwarz: '#15191e',
  sie: '#2a2236', sieHell: '#4c3f66', leuchten: '#5ff2d1', auge: '#ffd35c',
  rot: '#ff5a3c', blau: '#8cc4ff', tuerkis: '#5ff2d1',
};

function viereck(p) {
  ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
  ctx.closePath();
}
/* Die Oberseite eines Feldes auf Höhe h (Bildpunkte nach oben). */
function raute(x, y, h = 0, schrumpf = 0) {
  const s = schrumpf;
  const a = iso(x + s, y + s), b = iso(x + 1 - s, y + s), c = iso(x + 1 - s, y + 1 - s), d = iso(x + s, y + 1 - s);
  return [[a[0], a[1] - h], [b[0], b[1] - h], [c[0], c[1] - h], [d[0], d[1] - h]];
}
/* Ein Quader auf dem Brett. cx, cy in Feldkoordinaten (Mitte), a, b die
   halben Kantenlängen in Feldern, z0 und hoch in Bildpunkten. Sichtbar
   sind Oberseite und die beiden Seiten nach vorn (x+ und y+). */
function kiste(cx, cy, a, b, z0, hoch, farbe, opt = {}) {
  const P = (x, y, z) => { const [sx, sy] = iso(x, y); return [sx, sy - z]; };
  const x0 = cx - a, x1 = cx + a, y0 = cy - b, y1 = cy + b, z1 = z0 + hoch;
  const oben = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
  const rechts = [P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), P(x1, y0, z1)];
  const links = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
  ctx.fillStyle = opt.rechts || ton(farbe, 0.62); viereck(rechts); ctx.fill();
  ctx.fillStyle = opt.links || ton(farbe, 0.8); viereck(links); ctx.fill();
  ctx.fillStyle = opt.oben || farbe; viereck(oben); ctx.fill();
  if (opt.linie) {
    ctx.strokeStyle = opt.linie; ctx.lineWidth = Math.max(1, G.tw * 0.012);
    viereck(oben); ctx.stroke(); viereck(links); ctx.stroke(); viereck(rechts); ctx.stroke();
  }
  return { oben, links, rechts };
}
/* Satteldach über einem Quader: First entlang x. */
function dach(cx, cy, a, b, z0, first, farbe) {
  const P = (x, y, z) => { const [sx, sy] = iso(x, y); return [sx, sy - z]; };
  const zf = z0 + first;
  const hinten = [P(cx - a, cy - b, z0), P(cx + a, cy - b, z0), P(cx + a, cy, zf), P(cx - a, cy, zf)];
  const vorn = [P(cx - a, cy + b, z0), P(cx + a, cy + b, z0), P(cx + a, cy, zf), P(cx - a, cy, zf)];
  const giebel = [P(cx + a, cy - b, z0), P(cx + a, cy + b, z0), P(cx + a, cy, zf)];
  ctx.fillStyle = ton(farbe, 1.15); viereck(hinten); ctx.fill();
  ctx.fillStyle = ton(FARBE.wand, 0.7); viereck(giebel); ctx.fill();
  ctx.fillStyle = ton(farbe, 0.85); viereck(vorn); ctx.fill();
  ctx.strokeStyle = ton(farbe, 0.55); ctx.lineWidth = Math.max(1, G.tw * 0.01);
  ctx.beginPath(); ctx.moveTo(...P(cx - a, cy, zf)); ctx.lineTo(...P(cx + a, cy, zf)); ctx.stroke();
}
/* Blickrichtung auf dem Bildschirm, als Einheitsvektor. */
function bildRichtung(r) {
  const [dx, dy] = R.RICHTUNG[r];
  const sx = (dx - dy) * G.tw / 2, sy = (dx + dy) * G.th / 2;
  const l = Math.hypot(sx, sy) || 1;
  return [sx / l, sy / l];
}
/* Kleiner Zufall aus einer Zahl — für Grashalme und Steine, die immer
   gleich aussehen sollen. */
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n ^= n >>> 4; n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; }

/* ======================= 3  Zeichnen ======================= */
const HOEHE_WASSER = () => -G.dicke * 0.55;
const SOCKEL = () => G.dicke * 1.9;
const REGEN = Array.from({ length: 90 }, (_, i) => ({ x: hash(i * 7 + 1), y: hash(i * 13 + 5), v: 0.6 + hash(i * 3) * 0.6 }));

function himmel(t) {
  const g = ctx.createLinearGradient(0, 0, 0, G.h);
  g.addColorStop(0, '#1d2a36'); g.addColorStop(0.55, '#121c25'); g.addColorStop(1, '#0a1016');
  ctx.fillStyle = g; ctx.fillRect(0, 0, G.w, G.h);
  /* Das Meer ringsum, weit unten: nur eine dunkle Ahnung, die atmet. */
  const [lx, ly] = iso(0, N), [rx, ry] = iso(N, 0), [bx, by] = iso(N, N);
  const m = ctx.createRadialGradient(G.ox, by - G.th * 2, G.tw, G.ox, by - G.th * 2, G.tw * 7);
  m.addColorStop(0, 'rgba(40,78,100,0.35)'); m.addColorStop(1, 'rgba(40,78,100,0)');
  ctx.fillStyle = m; ctx.fillRect(0, 0, G.w, G.h);
  /* Schatten unter dem Brett — weichgezeichnet ist er teuer, also wird
     er nur neu gerechnet, wenn sich die Brettgröße ändert. */
  const key = G.tw.toFixed(1) + ',' + G.ox + ',' + G.oy;
  if (SCHATTEN.key !== key) {
    const w = Math.ceil(G.tw * 10.5), h = Math.ceil(G.th * 10.5);
    SCHATTEN.c.width = w; SCHATTEN.c.height = h;
    const c = SCHATTEN.c.getContext('2d');
    c.filter = 'blur(18px)'; c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(w / 2, h / 2, G.tw * 4.6, G.th * 4.6, 0, 0, Math.PI * 2); c.fill();
    SCHATTEN.key = key; SCHATTEN.w = w; SCHATTEN.h = h;
  }
  ctx.drawImage(SCHATTEN.c, G.ox - SCHATTEN.w / 2, by + SOCKEL() * 0.6 - G.th * 3.8 - SCHATTEN.h / 2);
}
const SCHATTEN = { c: document.createElement('canvas'), key: '' };
function regen(t) {
  ctx.strokeStyle = 'rgba(170,200,220,0.16)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (const r of REGEN) {
    const x = ((r.x * G.w + t * 90 * r.v) % (G.w + 60)) - 30;
    const y = ((r.y * G.h + t * 520 * r.v) % (G.h + 60)) - 30;
    ctx.moveTo(x, y); ctx.lineTo(x - 7 * r.v, y + 22 * r.v);
  }
  ctx.stroke();
}

/* ---------- Boden ---------- */
function istWasser(z, x, y) { return R.imFeld(x, y) && R.feld(z, x, y).art === 'wasser'; }
function landFarbe(z, x, y, f) {
  /* Am Wasser sandiger, sonst Salzwiese — jedes Feld ein wenig anders. */
  let amWasser = 0;
  for (const [dx, dy] of R.RICHTUNG) if (istWasser(z, x + dx, y + dy)) amWasser++;
  const basis = amWasser ? FARBE.sand : FARBE.gras;
  return ton(basis, 0.93 + hash(f.v + 17) * 0.12);
}
function seite(pts, farbe) { ctx.fillStyle = farbe; viereck(pts); ctx.fill(); }
function feldZeichnen(z, x, y, t) {
  const f = R.feld(z, x, y);
  const wasser = f.art === 'wasser';
  const h = wasser ? HOEHE_WASSER() : 0;
  const unten = -SOCKEL();
  /* Seiten nach vorn: am Rand bis zum Sockel, sonst nur so weit, wie
     das Nachbarfeld tiefer liegt (Land neben Wasser). */
  const P = (px, py, pz) => { const [sx, sy] = iso(px, py); return [sx, sy - pz]; };
  const nachbarH = (nx, ny) => !R.imFeld(nx, ny) ? unten : istWasser(z, nx, ny) ? HOEHE_WASSER() : 0;
  const hr = nachbarH(x + 1, y), hl = nachbarH(x, y + 1);
  const erde = wasser ? '#233b49' : FARBE.erde;
  if (hr < h) {
    const g = [P(x + 1, y, h), P(x + 1, y + 1, h), P(x + 1, y + 1, hr), P(x + 1, y, hr)];
    seite(g, ton(erde, 0.62));
    if (!wasser && hr === unten) { ctx.fillStyle = 'rgba(0,0,0,0.18)'; viereck([g[0], g[1], P(x + 1, y + 1, h - G.dicke * 0.35), P(x + 1, y, h - G.dicke * 0.35)]); ctx.fill(); }
  }
  if (hl < h) {
    const g = [P(x, y + 1, h), P(x + 1, y + 1, h), P(x + 1, y + 1, hl), P(x, y + 1, hl)];
    seite(g, ton(erde, 0.82));
  }
  const top = raute(x, y, h);
  if (wasser) {
    const welle = Math.sin(t * 1.3 + x * 0.9 + y * 1.3) * 0.5 + 0.5;
    ctx.fillStyle = ton(FARBE.wasser, 0.92 + welle * 0.14); viereck(top); ctx.fill();
    /* Kleine Wellenkämme, die über das Feld wandern. */
    ctx.strokeStyle = 'rgba(215,233,239,0.28)'; ctx.lineWidth = Math.max(1, G.tw * 0.012);
    for (let k = 0; k < 2; k++) {
      const p = ((t * 0.25 + hash(f.v + k * 31)) % 1);
      const [ax, ay] = iso(x + 0.15, y + p), [bx, by] = iso(x + 0.55, y + p);
      ctx.beginPath(); ctx.moveTo(ax, ay - h); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - h - G.th * 0.08, bx, by - h); ctx.stroke();
    }
    return;
  }
  ctx.fillStyle = landFarbe(z, x, y, f); viereck(top); ctx.fill();
  ctx.strokeStyle = 'rgba(40,50,30,0.16)'; ctx.lineWidth = 1; viereck(top); ctx.stroke();
  /* Ein paar Halme oder Steinchen, immer an derselben Stelle. */
  const n = 3 + (f.v % 3);
  for (let k = 0; k < n; k++) {
    const u = 0.15 + hash(f.v * 3 + k) * 0.7, v = 0.15 + hash(f.v * 5 + k * 11) * 0.7;
    const [gx, gy] = iso(x + u, y + v);
    if (f.schutt) {
      ctx.fillStyle = ton('#77726a', 0.8 + hash(k + f.v) * 0.4);
      ctx.fillRect(gx - G.tw * 0.02, gy - G.tw * 0.012, G.tw * 0.04, G.tw * 0.024);
    } else {
      ctx.strokeStyle = 'rgba(70,90,45,0.55)'; ctx.lineWidth = Math.max(1, G.tw * 0.012);
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx - G.tw * 0.012, gy - G.tw * 0.04);
      ctx.moveTo(gx, gy); ctx.lineTo(gx + G.tw * 0.014, gy - G.tw * 0.035); ctx.stroke();
    }
  }
}

/* Eine Markierung auf der Oberseite eines Feldes. */
function markiere(z, x, y, fuellung, rand, schrumpf = 0.06, strich = 1.6) {
  const h = istWasser(z, x, y) ? HOEHE_WASSER() : 0;
  const p = raute(x, y, h, schrumpf);
  if (fuellung) { ctx.fillStyle = fuellung; viereck(p); ctx.fill(); }
  if (rand) { ctx.strokeStyle = rand; ctx.lineWidth = Math.max(1, G.tw * 0.02 * strich / 1.6); viereck(p); ctx.stroke(); }
}
/* Schräge Schraffur: das Zeichen für „hier schlägt es gleich ein“. */
function schraffur(z, x, y, farbe, t) {
  const h = istWasser(z, x, y) ? HOEHE_WASSER() : 0;
  const p = raute(x, y, h, 0.06);
  ctx.save(); viereck(p); ctx.clip();
  ctx.strokeStyle = farbe; ctx.lineWidth = Math.max(1.5, G.tw * 0.035);
  const [cx, cy] = mitte(x, y);
  const off = (t * G.tw * 0.25) % (G.tw * 0.18);
  ctx.beginPath();
  for (let k = -8; k <= 8; k++) {
    const d = k * G.tw * 0.18 + off;
    ctx.moveTo(cx + d - G.tw, cy - h - G.tw * 0.5); ctx.lineTo(cx + d + G.tw * 0.5, cy - h + G.tw);
  }
  ctx.stroke(); ctx.restore();
}

/* ---------- Bauten ---------- */
function felsZeichnen(x, y, f) {
  const cx = x + 0.5, cy = y + 0.5, s = G.tw;
  const [mx, my] = iso(cx, cy);
  const grau = ton(FARBE.fels, 0.9 + hash(f.v) * 0.2);
  /* Drei Brocken, zusammen ein Fels. Oben hell, seitlich dunkel. */
  const stuecke = [[-0.10, -0.06, 0.30, 0.28], [0.12, 0.02, 0.24, 0.22], [-0.02, 0.10, 0.22, 0.18]];
  for (const [dx, dy, br, ho] of stuecke) {
    const bx = mx + (dx - dy) * s / 2, by = my + (dx + dy) * s / 4;
    const w = br * s, hh = ho * s * (f.hp < 2 ? 0.8 : 1);
    ctx.fillStyle = ton(grau, 0.6);
    ctx.beginPath(); ctx.moveTo(bx - w / 2, by); ctx.lineTo(bx - w * 0.38, by - hh * 0.7); ctx.lineTo(bx - w * 0.05, by - hh);
    ctx.lineTo(bx + w * 0.42, by - hh * 0.62); ctx.lineTo(bx + w / 2, by); ctx.lineTo(bx, by + w * 0.18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = grau;
    ctx.beginPath(); ctx.moveTo(bx - w * 0.38, by - hh * 0.7); ctx.lineTo(bx - w * 0.05, by - hh);
    ctx.lineTo(bx + w * 0.42, by - hh * 0.62); ctx.lineTo(bx + w * 0.02, by - hh * 0.45); ctx.closePath(); ctx.fill();
    ctx.fillStyle = ton(grau, 0.78);
    ctx.beginPath(); ctx.moveTo(bx - w / 2, by); ctx.lineTo(bx - w * 0.38, by - hh * 0.7); ctx.lineTo(bx + w * 0.02, by - hh * 0.45);
    ctx.lineTo(bx, by + w * 0.18); ctx.closePath(); ctx.fill();
  }
  if (f.hp < 2) {
    ctx.strokeStyle = 'rgba(20,20,20,0.7)'; ctx.lineWidth = Math.max(1, s * 0.015);
    ctx.beginPath(); ctx.moveTo(mx - s * 0.05, my - s * 0.22); ctx.lineTo(mx + s * 0.01, my - s * 0.13);
    ctx.lineTo(mx - s * 0.03, my - s * 0.06); ctx.lineTo(mx + s * 0.04, my); ctx.stroke();
  }
}
function fenster(x, y, z0, cx, cy, a, b, stock, t) {
  /* Warmes Licht hinter den Scheiben — nachts im Sturm brennt überall eins. */
  const P = (px, py, pz) => { const [sx, sy] = iso(px, py); return [sx, sy - pz]; };
  const flacker = 0.85 + Math.sin(t * 3 + x * 7 + y * 3) * 0.08;
  ctx.fillStyle = `rgba(255,${Math.round(196 * flacker)},110,${0.9 * flacker})`;
  for (let s = 0; s < stock; s++) {
    const zz = z0 + G.tw * (0.08 + s * 0.17);
    for (const u of [-0.4, 0.4]) {
      const w1 = P(cx + a * (u - 0.14), cy + b, zz), w2 = P(cx + a * (u + 0.14), cy + b, zz);
      const w3 = P(cx + a * (u + 0.14), cy + b, zz + G.tw * 0.07), w4 = P(cx + a * (u - 0.14), cy + b, zz + G.tw * 0.07);
      viereck([w1, w2, w3, w4]); ctx.fill();
    }
    const w1 = P(cx + a, cy - b * 0.2, zz), w2 = P(cx + a, cy + b * 0.3, zz);
    const w3 = P(cx + a, cy + b * 0.3, zz + G.tw * 0.07), w4 = P(cx + a, cy - b * 0.2, zz + G.tw * 0.07);
    viereck([w1, w2, w3, w4]); ctx.fill();
  }
}
function hausZeichnen(x, y, f, t) {
  const cx = x + 0.5, cy = y + 0.5, s = G.tw;
  const stock = f.maxHp || f.hp;
  const hoch = s * (stock >= 2 ? 0.42 : 0.26);
  const a = 0.3, b = 0.27;
  kiste(cx, cy, a + 0.03, b + 0.03, 0, s * 0.03, '#7a7466');
  kiste(cx, cy, a, b, s * 0.03, hoch, FARBE.wand, { oben: FARBE.wand });
  fenster(x, y, s * 0.03, cx, cy, a, b, stock >= 2 ? 2 : 1, t);
  const beschaedigt = f.hp < stock;
  dach(cx, cy, a + 0.04, b + 0.05, s * 0.03 + hoch, s * 0.2, beschaedigt ? '#7a4a3c' : FARBE.ziegel);
  /* Schornstein mit einem Faden Rauch */
  kiste(cx - 0.12, cy - 0.06, 0.04, 0.04, s * 0.03 + hoch + s * 0.08, s * 0.1, '#6d5a4f');
  const [mx, my] = iso(cx, cy);
  if (beschaedigt) {
    /* Ein Loch in der Wand und ein Brandfleck — ein Treffer mehr, und es fällt. */
    ctx.fillStyle = 'rgba(30,24,20,0.8)';
    ctx.beginPath(); ctx.ellipse(mx - s * 0.08, my - hoch * 0.55, s * 0.05, s * 0.07, 0.3, 0, Math.PI * 2); ctx.fill();
  }
  /* Deichpunkte des Hauses — in der Farbe des Deichs oben links. */
  balken(mx, my - hoch - s * 0.34, f.hp, stock, '#8cc4ff');
}
function ruineZeichnen(x, y, f, t) {
  const cx = x + 0.5, cy = y + 0.5, s = G.tw;
  kiste(cx, cy, 0.3, 0.27, 0, s * 0.07, '#5d574d');
  kiste(cx - 0.12, cy + 0.02, 0.1, 0.18, s * 0.07, s * 0.12, '#6a6155');
  kiste(cx + 0.12, cy - 0.08, 0.12, 0.08, s * 0.07, s * 0.06, '#4c463e');
  /* Ein verkohlter Balken, schräg */
  const [ax, ay] = iso(cx - 0.2, cy - 0.15), [bx, by] = iso(cx + 0.18, cy + 0.12);
  ctx.strokeStyle = '#2a2420'; ctx.lineWidth = s * 0.03;
  ctx.beginPath(); ctx.moveTo(ax, ay - s * 0.2); ctx.lineTo(bx, by - s * 0.07); ctx.stroke();
}
function turmZeichnen(x, y, f, t, sperrwerk) {
  const cx = x + 0.5, cy = y + 0.5, s = G.tw;
  const [mx, my] = iso(cx, cy);
  if (sperrwerk) {
    /* Das Sperrwerk: ein breiter Betonriegel mit einem Tor, darüber
       ein blaues Warnlicht. */
    kiste(cx, cy, 0.42, 0.34, 0, s * 0.42, '#8c9399');
    const P = (px, py, pz) => { const [sx, sy] = iso(px, py); return [sx, sy - pz]; };
    ctx.fillStyle = '#2b3a45';
    viereck([P(cx - 0.22, cy + 0.34, 0), P(cx + 0.22, cy + 0.34, 0), P(cx + 0.22, cy + 0.34, s * 0.3), P(cx - 0.22, cy + 0.34, s * 0.3)]); ctx.fill();
    ctx.strokeStyle = '#c9d1d6'; ctx.lineWidth = s * 0.02;
    for (let k = 1; k < 4; k++) { const z = s * 0.3 * k / 4; ctx.beginPath(); ctx.moveTo(...P(cx - 0.22, cy + 0.34, z)); ctx.lineTo(...P(cx + 0.22, cy + 0.34, z)); ctx.stroke(); }
    kiste(cx, cy, 0.1, 0.1, s * 0.42, s * 0.14, '#5c6670');
    const an = (t % 1.2) < 0.6;
    const [lx, ly] = iso(cx, cy);
    ctx.fillStyle = an ? '#9fd8ff' : '#2d4b63';
    ctx.beginPath(); ctx.arc(lx, ly - s * 0.62, s * 0.05, 0, Math.PI * 2); ctx.fill();
    if (an) { const g = ctx.createRadialGradient(lx, ly - s * 0.62, 0, lx, ly - s * 0.62, s * 0.35); g.addColorStop(0, 'rgba(140,200,255,0.45)'); g.addColorStop(1, 'rgba(140,200,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly - s * 0.62, s * 0.35, 0, Math.PI * 2); ctx.fill(); }
    return;
  }
  /* Leuchtturm: rot-weiß geringelt, oben das Licht, das sich dreht. */
  const unten = s * 0.16, oben = s * 0.11, hoch = s * 0.95;
  kiste(cx, cy, 0.22, 0.22, 0, s * 0.06, '#8b8578');
  const bands = 5;
  for (let k = 0; k < bands; k++) {
    const z0 = s * 0.06 + hoch * k / bands, z1 = s * 0.06 + hoch * (k + 1) / bands;
    const w0 = lerp(unten, oben, k / bands), w1 = lerp(unten, oben, (k + 1) / bands);
    ctx.fillStyle = k % 2 ? '#f3efe6' : '#c7432f';
    ctx.beginPath(); ctx.moveTo(mx - w0, my - z0); ctx.lineTo(mx + w0, my - z0); ctx.lineTo(mx + w1, my - z1); ctx.lineTo(mx - w1, my - z1); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.moveTo(mx + w0 * 0.25, my - z0); ctx.lineTo(mx + w0, my - z0); ctx.lineTo(mx + w1, my - z1); ctx.lineTo(mx + w1 * 0.25, my - z1); ctx.closePath(); ctx.fill();
  }
  const zl = s * 0.06 + hoch;
  ctx.fillStyle = '#2e3338'; ctx.fillRect(mx - oben * 1.25, my - zl - s * 0.02, oben * 2.5, s * 0.03);
  ctx.fillStyle = '#ffe9a8'; ctx.fillRect(mx - oben * 0.8, my - zl - s * 0.14, oben * 1.6, s * 0.12);
  ctx.fillStyle = '#c7432f';
  ctx.beginPath(); ctx.moveTo(mx - oben, my - zl - s * 0.14); ctx.lineTo(mx, my - zl - s * 0.26); ctx.lineTo(mx + oben, my - zl - s * 0.14); ctx.closePath(); ctx.fill();
  /* Der Strahl: ein blasser Kegel, der langsam kreist. */
  const w = t * 0.9 + x;
  const len = s * 2.2, auf = 0.16;
  const lx = mx, ly = my - zl - s * 0.08;
  ctx.fillStyle = 'rgba(255,240,180,0.10)';
  ctx.beginPath(); ctx.moveTo(lx, ly);
  ctx.lineTo(lx + Math.cos(w - auf) * len, ly + Math.sin(w - auf) * len * 0.5);
  ctx.lineTo(lx + Math.cos(w + auf) * len, ly + Math.sin(w + auf) * len * 0.5);
  ctx.closePath(); ctx.fill();
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, s * 0.3);
  g.addColorStop(0, 'rgba(255,236,170,0.6)'); g.addColorStop(1, 'rgba(255,236,170,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(lx, ly, s * 0.3, 0, Math.PI * 2); ctx.fill();
}
/* Lebenspunkte als kleine Balken über etwas. */
function balken(sx, sy, hp, max, farbe, vorschauVerlust = 0, t = 0) {
  const s = G.tw, w = s * 0.07, h = s * 0.045, gap = s * 0.018;
  const breite = max * w + (max - 1) * gap;
  let x = sx - breite / 2;
  ctx.fillStyle = 'rgba(10,14,18,0.85)';
  ctx.fillRect(x - gap * 1.5, sy - h - gap * 1.5, breite + gap * 3, h + gap * 3);
  for (let i = 0; i < max; i++) {
    const an = i < hp;
    const verlust = an && i >= hp - vorschauVerlust;
    ctx.fillStyle = verlust ? ((t * 3) % 1 < 0.5 ? FARBE.rot : '#5a1d12') : an ? farbe : '#26313b';
    ctx.fillRect(x, sy - h, w, h);
    x += w + gap;
  }
}

/* ---------- Einheiten ---------- */
/* Maschinen sind aus Quadern gebaut, im Brett ausgerichtet. Teile, die
   nach vorn zeigen, liegen in Blickrichtung. */
function teil(cx, cy, r, vor, seitlich, laengs, quer, z0, hoch, farbe, opt) {
  const [fx, fy] = R.RICHTUNG[r];
  const px = cx + fx * vor - fy * seitlich, py = cy + fy * vor + fx * seitlich;
  const entlangX = fx !== 0;
  return { cx: px, cy: py, a: entlangX ? laengs : quer, b: entlangX ? quer : laengs, z0, hoch, farbe, opt };
}
function maschineZeichnen(u, px, py, t, stil = {}) {
  const s = G.tw, r = u.blick ?? 0;
  const cx = px + 0.5, cy = py + 0.5;
  const nass = stil.nass ? -G.dicke * 0.5 : 0;
  const bob = stil.ruhig ? 0 : Math.sin(t * 5 + u.id * 1.7) * s * 0.004;
  const fertig = u.gehandelt && !u.wrack;
  const gelb = u.wrack ? '#5b5f63' : fertig ? ton(FARBE.gelb, 0.72) : FARBE.gelb;
  const stahl = u.wrack ? '#3a3d40' : FARBE.stahl;
  const z = nass + bob;
  const teile = [];
  teile.push(teil(cx, cy, r, 0, 0, 0.3, 0.3, z, s * 0.09, FARBE.schwarz));
  if (u.typ === 'ramme') {
    teile.push(teil(cx, cy, r, -0.02, 0, 0.24, 0.25, z + s * 0.09, s * 0.19, gelb));
    teile.push(teil(cx, cy, r, -0.1, 0, 0.12, 0.14, z + s * 0.28, s * 0.12, gelb, { linie: 'rgba(0,0,0,0.2)' }));
    teile.push(teil(cx, cy, r, 0.3, 0, 0.1, 0.17, z + s * 0.1, s * 0.18, stahl));
    teile.push(teil(cx, cy, r, 0.4, 0, 0.03, 0.17, z + s * 0.1, s * 0.18, u.wrack ? '#444' : '#e8e1d0'));
  } else if (u.typ === 'kanone') {
    teile.push(teil(cx, cy, r, 0, 0, 0.25, 0.24, z + s * 0.09, s * 0.16, gelb));
    teile.push(teil(cx, cy, r, -0.03, 0, 0.14, 0.14, z + s * 0.25, s * 0.1, gelb, { linie: 'rgba(0,0,0,0.2)' }));
    teile.push(teil(cx, cy, r, 0.26, 0, 0.2, 0.035, z + s * 0.28, s * 0.05, stahl));
  } else {
    teile.push(teil(cx, cy, r, 0, 0, 0.24, 0.24, z + s * 0.09, s * 0.14, gelb));
    teile.push(teil(cx, cy, r, 0.12, 0.11, 0.05, 0.05, z + s * 0.23, s * 0.12, stahl));
    teile.push(teil(cx, cy, r, 0.12, -0.11, 0.05, 0.05, z + s * 0.23, s * 0.12, stahl));
    teile.push(teil(cx, cy, r, -0.04, 0, 0.11, 0.11, z + s * 0.23, s * 0.26, stahl));
  }
  teile.sort((p, q) => (p.cx + p.cy) - (q.cx + q.cy) || p.z0 - q.z0);
  for (const p of teile) kiste(p.cx, p.cy, p.a, p.b, p.z0, p.hoch, p.farbe, p.opt || {});
  /* Kleinigkeiten, die sie lesbar machen: Fenster, Mündung, Warnstreifen. */
  const [mx, my] = iso(cx, cy);
  if (u.typ === 'werfer') {
    const [tx, ty] = iso(cx - R.RICHTUNG[r][0] * 0.04, cy - R.RICHTUNG[r][1] * 0.04);
    ctx.fillStyle = '#0c0f12';
    ctx.beginPath(); ctx.ellipse(tx, ty - z - s * 0.49, s * 0.075, s * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  }
  if (!u.wrack) {
    const [kx, ky] = iso(cx - R.RICHTUNG[r][0] * 0.1, cy - R.RICHTUNG[r][1] * 0.1);
    const zf = u.typ === 'ramme' ? s * 0.34 : u.typ === 'kanone' ? s * 0.3 : s * 0.16;
    ctx.fillStyle = fertig ? '#3c5566' : '#9ed8ff';
    ctx.fillRect(kx - s * 0.035, ky - z - zf - s * 0.02, s * 0.07, s * 0.03);
  }
  if (stil.balken !== false && !u.wrack) balken(mx, my - z - s * 0.62, u.hp, u.max, '#7fdc8a', stil.verlust || 0, t);
}

function feindZeichnen(u, px, py, t, stil = {}) {
  const s = G.tw;
  const [gx, gy] = mitte(px, py);
  const [fx, fy] = bildRichtung(u.blick ?? 2);
  const atem = 1 + Math.sin(t * 2.4 + u.id) * 0.03;
  const fliegt = u.typ === 'flatterer';
  const hub = fliegt ? s * (0.32 + Math.sin(t * 5 + u.id) * 0.03) : 0;
  const nah = stil.aufsteigen ?? 1;
  const alpha = stil.alpha ?? 1;
  ctx.save(); ctx.globalAlpha = alpha;
  /* Schatten */
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath(); ctx.ellipse(gx, gy, s * (u.typ === 'brocken' ? 0.36 : 0.26), s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  const by = gy - hub - s * 0.12 * nah;
  const koerper = (w, h, dy = 0, farbe = FARBE.sie, hell = FARBE.sieHell) => {
    const g = ctx.createRadialGradient(gx - w * 0.3, by - h * 0.6 + dy, 0, gx, by + dy, w);
    g.addColorStop(0, hell); g.addColorStop(1, farbe);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(gx, by + dy, w * atem, h * atem, 0, 0, Math.PI * 2); ctx.fill();
  };
  const beine = (n, spann, hoch) => {
    ctx.strokeStyle = '#1a1522'; ctx.lineWidth = Math.max(1.5, s * 0.025); ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const w = (i / (n - 1) - 0.5) * Math.PI * 0.9;
      for (const seite of [-1, 1]) {
        const qx = -fy * seite, qy = fx * seite;
        const ex = gx + (qx * Math.cos(w) + fx * Math.sin(w)) * s * spann;
        const ey = gy + (qy * Math.cos(w) + fy * Math.sin(w)) * s * spann * 0.5;
        const kx = (gx + ex) / 2 + qx * s * 0.05, ky = Math.min(by, ey) - s * hoch;
        ctx.beginPath(); ctx.moveTo(gx + qx * s * 0.08, by); ctx.quadraticCurveTo(kx, ky, ex, ey); ctx.stroke();
      }
    }
  };
  const augen = (dx, dy, abst, gr) => {
    const qx = -fy, qy = fx;
    ctx.fillStyle = FARBE.auge;
    for (const k of [-1, 1]) {
      const ax = gx + fx * dx + qx * abst * k, ay = by + fy * dx * 0.5 + qy * abst * k * 0.5 + dy;
      ctx.beginPath(); ctx.arc(ax, ay, gr, 0, Math.PI * 2); ctx.fill();
    }
  };
  const leuchtpunkte = (n, r) => {
    for (let i = 0; i < n; i++) {
      const a = hash(u.id * 7 + i) * Math.PI * 2, d = hash(u.id * 13 + i) * r;
      const p = 0.6 + Math.sin(t * 3 + i * 2 + u.id) * 0.4;
      ctx.fillStyle = rgba(FARBE.leuchten, 0.5 + p * 0.5);
      ctx.beginPath(); ctx.arc(gx + Math.cos(a) * d, by - s * 0.03 + Math.sin(a) * d * 0.5, s * 0.014 * (1 + p * 0.5), 0, Math.PI * 2); ctx.fill();
    }
  };
  if (u.typ === 'scherer') {
    beine(3, 0.3, 0.1);
    koerper(s * 0.2, s * 0.12);
    /* zwei Scheren nach vorn */
    for (const k of [-1, 1]) {
      const qx = -fy * k, qy = fx * k;
      const sx = gx + fx * s * 0.2 + qx * s * 0.11, sy = by + fy * s * 0.1 + qy * s * 0.05;
      ctx.fillStyle = FARBE.sieHell;
      ctx.beginPath(); ctx.ellipse(sx, sy, s * 0.07, s * 0.045, Math.atan2(fy, fx), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1a1522'; ctx.lineWidth = Math.max(1, s * 0.015);
      ctx.beginPath(); ctx.moveTo(sx + fx * s * 0.02, sy + fy * s * 0.01); ctx.lineTo(sx + fx * s * 0.08, sy + fy * s * 0.04); ctx.stroke();
    }
    augen(s * 0.12, -s * 0.05, s * 0.05, s * 0.018);
    leuchtpunkte(4, s * 0.1);
  } else if (u.typ === 'speier') {
    beine(2, 0.24, 0.08);
    koerper(s * 0.17, s * 0.15, -s * 0.02);
    /* Der Sack auf dem Rücken, der leuchtet, wenn er voll ist */
    const p = 0.6 + Math.sin(t * 2 + u.id) * 0.4;
    ctx.fillStyle = rgba(FARBE.leuchten, 0.35 + p * 0.35);
    ctx.beginPath(); ctx.ellipse(gx - fx * s * 0.05, by - s * 0.12, s * 0.09, s * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = FARBE.sieHell; ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(gx + fx * s * 0.08, by + fy * s * 0.03); ctx.lineTo(gx + fx * s * 0.22, by + fy * s * 0.1 - s * 0.02); ctx.stroke();
    ctx.fillStyle = '#0c0a10';
    ctx.beginPath(); ctx.arc(gx + fx * s * 0.23, by + fy * s * 0.105 - s * 0.02, s * 0.025, 0, Math.PI * 2); ctx.fill();
    augen(s * 0.06, -s * 0.09, s * 0.045, s * 0.016);
  } else if (u.typ === 'flatterer') {
    const schlag = Math.sin(t * 16 + u.id) * 0.5 + 0.5;
    ctx.fillStyle = rgba('#6b5a8e', 0.85);
    for (const k of [-1, 1]) {
      const qx = -fy * k, qy = fx * k;
      ctx.beginPath(); ctx.moveTo(gx, by);
      ctx.quadraticCurveTo(gx + qx * s * 0.3, by + qy * s * 0.15 - s * (0.05 + schlag * 0.15), gx + qx * s * 0.34 - fx * s * 0.05, by + qy * s * 0.17 - s * schlag * 0.2);
      ctx.quadraticCurveTo(gx + qx * s * 0.2, by + qy * s * 0.1 + s * 0.03, gx, by + s * 0.02);
      ctx.fill();
    }
    koerper(s * 0.1, s * 0.08);
    ctx.strokeStyle = FARBE.sieHell; ctx.lineWidth = s * 0.02;
    ctx.beginPath(); ctx.moveTo(gx - fx * s * 0.08, by - fy * s * 0.04); ctx.lineTo(gx - fx * s * 0.18, by - fy * s * 0.09 + s * 0.05); ctx.stroke();
    augen(s * 0.06, -s * 0.03, s * 0.03, s * 0.014);
  } else if (u.typ === 'schlamm') {
    beine(3, 0.26, 0.08);
    koerper(s * 0.18, s * 0.11);
    ctx.fillStyle = '#6b4f2f';
    ctx.beginPath(); ctx.ellipse(gx - fx * s * 0.07, by - s * 0.12, s * 0.13, s * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a6a44';
    ctx.beginPath(); ctx.ellipse(gx - fx * s * 0.1, by - s * 0.16, s * 0.06, s * 0.035, 0, 0, Math.PI * 2); ctx.fill();
    augen(s * 0.12, -s * 0.04, s * 0.045, s * 0.016);
    leuchtpunkte(3, s * 0.08);
  } else if (u.typ === 'brocken') {
    beine(3, 0.4, 0.14);
    koerper(s * 0.3, s * 0.2, -s * 0.04);
    koerper(s * 0.18, s * 0.13, -s * 0.18, '#221c2c', '#5a4a78');
    ctx.strokeStyle = rgba(FARBE.leuchten, 0.7); ctx.lineWidth = Math.max(1, s * 0.012);
    for (let i = 0; i < 4; i++) {
      const a = hash(u.id + i * 5) * 6.28;
      ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * s * 0.08, by - s * 0.06 + Math.sin(a) * s * 0.04);
      ctx.lineTo(gx + Math.cos(a) * s * 0.22, by - s * 0.06 + Math.sin(a) * s * 0.1); ctx.stroke();
    }
    for (const k of [-1, 1]) {
      const qx = -fy * k, qy = fx * k;
      ctx.fillStyle = FARBE.sieHell;
      ctx.beginPath(); ctx.ellipse(gx + fx * s * 0.25 + qx * s * 0.2, by + fy * s * 0.12 + qy * s * 0.1, s * 0.11, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    }
    augen(s * 0.14, -s * 0.2, s * 0.06, s * 0.024);
  }
  ctx.restore();
  if (stil.balken !== false) balken(gx, by - s * (u.typ === 'brocken' ? 0.42 : 0.3), u.hp, u.max, '#ff8a6b', stil.verlust || 0, t);
}

/* ---------- Bewegung in der Darstellung ---------- */
const GLEIT = new Map();     // id → { von, nach, t0, dauer, hop }
const RUCK = new Map();      // id → { dx, dy, t0, dauer }  Vorschnellen und Wackeln
const FX = [];               // kurzlebige Zeichen: Geschosse, Zahlen, Spritzer
let BEBEN = { t0: 0, staerke: 0 };
const jetzt = () => performance.now() / 1000;

function anzeigeOrt(u, t) {
  const g = GLEIT.get(u.id);
  let x = u.x, y = u.y, h = 0;
  if (g) {
    const k = clamp((t - g.t0) / g.dauer, 0, 1), e = glatt(k);
    x = lerp(g.von[0], g.nach[0], e); y = lerp(g.von[1], g.nach[1], e);
    h = Math.sin(k * Math.PI) * (g.hop || 0);
  }
  const r = RUCK.get(u.id);
  if (r) {
    const k = clamp((t - r.t0) / r.dauer, 0, 1);
    const w = r.art === 'wackeln' ? Math.sin(k * Math.PI * 6) * (1 - k) : Math.sin(k * Math.PI);
    x += r.dx * w; y += r.dy * w;
  }
  return [x, y, h];
}

/* ---------- Zeichen auf dem Brett ---------- */
function text(t, x, y, farbe, groesse = 0.17, grund = 'rgba(10,14,18,0.88)') {
  ctx.font = `800 ${Math.round(G.tw * groesse)}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(t).width + G.tw * 0.1, h = G.tw * groesse * 1.35;
  if (grund) {
    ctx.fillStyle = grund;
    const r = h * 0.35;
    ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, r); ctx.fill();
  }
  ctx.fillStyle = farbe; ctx.fillText(t, x, y + 1);
}
function pfeil(ax, ay, bx, by, farbe, dicke, spitze) {
  const l = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / l, uy = (by - ay) / l;
  ctx.strokeStyle = farbe; ctx.fillStyle = farbe; ctx.lineWidth = dicke; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx - ux * spitze * 0.8, by - uy * spitze * 0.8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx, by);
  ctx.lineTo(bx - ux * spitze - uy * spitze * 0.6, by - uy * spitze + ux * spitze * 0.6);
  ctx.lineTo(bx - ux * spitze + uy * spitze * 0.6, by - uy * spitze - ux * spitze * 0.6);
  ctx.closePath(); ctx.fill();
}
function totenkopf(x, y, gr) {
  ctx.fillStyle = 'rgba(10,14,18,0.85)';
  ctx.beginPath(); ctx.arc(x, y, gr * 1.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f3ede0';
  ctx.beginPath(); ctx.arc(x, y - gr * 0.12, gr * 0.72, 0, Math.PI * 2); ctx.fill();
  ctx.fillRect(x - gr * 0.38, y + gr * 0.3, gr * 0.76, gr * 0.36);
  ctx.fillStyle = '#15191e';
  ctx.beginPath(); ctx.arc(x - gr * 0.28, y - gr * 0.12, gr * 0.18, 0, Math.PI * 2); ctx.arc(x + gr * 0.28, y - gr * 0.12, gr * 0.18, 0, Math.PI * 2); ctx.fill();
}
function tropfen(x, y, gr) {
  ctx.fillStyle = 'rgba(10,14,18,0.85)';
  ctx.beginPath(); ctx.arc(x, y, gr * 1.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7fc6ea';
  ctx.beginPath(); ctx.moveTo(x, y - gr * 0.85); ctx.quadraticCurveTo(x + gr * 0.7, y + gr * 0.1, x, y + gr * 0.62);
  ctx.quadraticCurveTo(x - gr * 0.7, y + gr * 0.1, x, y - gr * 0.85); ctx.fill();
}

/* Wo landen gerade ihre angesagten Angriffe? Für den Zustand, der
   gezeigt wird — in der Vorschau also für den ausprobierten. */
function ansagenVon(z) {
  const raus = [];
  for (const a of z.angriffe) {
    const u = R.einheit(z, a.id);
    if (!u) continue;
    const t = R.aufschlag(z, u, a.r, a.k);
    if (!t) continue;
    raus.push({ a, u, t, w: R.waffeVon(u) });
  }
  return raus;
}

function bodenMarken(z, t) {
  const tz = UI.vorschau ? UI.vorschau.z : z;
  /* Auftauchstellen: der Sand blubbert. */
  for (const m of z.auftauchen) {
    markiere(z, m.x, m.y, 'rgba(255,140,60,0.16)', 'rgba(255,150,70,0.55)', 0.12, 1.2);
    const [cx, cy] = mitte(m.x, m.y);
    for (let k = 0; k < 3; k++) {
      const p = (t * 0.8 + k / 3 + hash(m.x * 9 + m.y)) % 1;
      ctx.strokeStyle = `rgba(255,190,120,${0.6 * (1 - p)})`; ctx.lineWidth = Math.max(1, G.tw * 0.015);
      ctx.beginPath(); ctx.ellipse(cx + (hash(k + m.x) - 0.5) * G.tw * 0.2, cy + (hash(k + m.y * 3) - 0.5) * G.th * 0.3, G.tw * 0.04 + p * G.tw * 0.1, G.th * 0.04 + p * G.th * 0.1, 0, 0, Math.PI * 2); ctx.stroke();
    }
  }
  /* Einschlagfelder ihrer Angriffe */
  for (const { a, t: tr, u } of ansagenVon(tz)) {
    if (tr.frei) { markiere(z, tr.x, tr.y, null, 'rgba(255,90,60,0.35)', 0.1, 1); continue; }
    const hervor = UI.feind === u.id || (UI.hover && UI.hover[0] === u.x && UI.hover[1] === u.y);
    markiere(z, tr.x, tr.y, `rgba(255,90,60,${hervor ? 0.34 : 0.2})`, `rgba(255,110,80,${hervor ? 1 : 0.75})`, 0.05, hervor ? 2.4 : 1.6);
    schraffur(z, tr.x, tr.y, `rgba(255,90,60,${hervor ? 0.5 : 0.3})`, t);
  }
  if (!Z) return;
  /* Aufstellen */
  if (Z.phase === 'aufstellen' && !UI.besetzt) {
    for (const [x, y] of aufstellFelder(Z)) markiere(z, x, y, 'rgba(140,196,255,0.14)', 'rgba(140,196,255,0.45)', 0.08, 1);
  }
  /* Wer noch handeln kann, bekommt einen gelben Ring. */
  if (Z.phase === 'wir' && !UI.besetzt)
    for (const m of Z.einheiten)
      if (m.team === 'wir' && R.kannHandeln(Z, m) && m.id !== UI.wahl) {
        const p = 0.5 + Math.sin(t * 3.2 + m.id) * 0.5;
        markiere(z, m.x, m.y, `rgba(242,178,51,${0.06 + p * 0.08})`, `rgba(242,178,51,${0.45 + p * 0.35})`, 0.14, 1.3);
      }
  const u = UI.wahl != null ? R.einheit(z, UI.wahl) : null;
  if (u && !UI.besetzt && Z.phase === 'wir') {
    markiere(z, u.x, u.y, 'rgba(242,178,51,0.18)', FARBE.gelb, 0.02, 2.2);
    if (!UI.zielen && !u.bewegt && R.kannHandeln(Z, R.einheit(Z, u.id))) {
      const felder = R.erreichbar(Z, R.einheit(Z, u.id));
      for (const f of felder) if (f.x !== u.x || f.y !== u.y) markiere(z, f.x, f.y, 'rgba(140,196,255,0.22)', 'rgba(170,215,255,0.7)', 0.07, 1.2);
      if (UI.hover && felder.some(f => f.x === UI.hover[0] && f.y === UI.hover[1])) {
        const weg = felder.weg(UI.hover[0], UI.hover[1]);
        ctx.fillStyle = 'rgba(220,240,255,0.85)';
        for (const [x, y] of weg.slice(1)) { const [cx, cy] = mitte(x, y); ctx.beginPath(); ctx.arc(cx, cy, G.tw * 0.035, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    if (UI.zielen) {
      const echt = R.einheit(Z, u.id);
      for (const f of R.zielfelder(Z, echt)) {
        const gewaehlt = UI.vorschau && UI.vorschau.x === f.x && UI.vorschau.y === f.y;
        markiere(z, f.x, f.y, gewaehlt ? 'rgba(242,178,51,0.42)' : 'rgba(242,178,51,0.14)', gewaehlt ? '#ffd27a' : 'rgba(242,178,51,0.6)', 0.07, gewaehlt ? 2.4 : 1.1);
        if (gewaehlt) {
          const [cx, cy] = mitte(f.x, f.y), r = G.tw * 0.16, p = 1 + Math.sin(t * 7) * 0.08;
          ctx.strokeStyle = '#fff3cf'; ctx.lineWidth = G.tw * 0.025;
          ctx.beginPath(); ctx.ellipse(cx, cy, r * p, r * 0.5 * p, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - r * 1.6, cy); ctx.lineTo(cx - r * 0.6, cy); ctx.moveTo(cx + r * 0.6, cy); ctx.lineTo(cx + r * 1.6, cy);
          ctx.moveTo(cx, cy - r * 0.8); ctx.lineTo(cx, cy - r * 0.3); ctx.moveTo(cx, cy + r * 0.3); ctx.lineTo(cx, cy + r * 0.8);
          ctx.stroke();
        }
      }
    }
  }
  if (UI.hover && !UI.besetzt) markiere(z, UI.hover[0], UI.hover[1], null, 'rgba(255,255,255,0.35)', 0.02, 1);
}

/* Linien, Bögen und Nummern ihrer Angriffe — über allem. */
function ansagenZeichnen(z, t) {
  const tz = UI.vorschau ? UI.vorschau.z : z;
  for (const { a, u, t: tr, w } of ansagenVon(tz)) {
    const echt = R.einheit(z, u.id) || u;
    const ort = UI.vorschau ? [u.x, u.y, 0] : anzeigeOrt(echt, t);
    const [ax, ay] = mitte(ort[0], ort[1]);
    const [bx, by] = mitte(tr.x, tr.y);
    const hervor = UI.feind === u.id;
    const farbe = hervor ? '#ffb199' : 'rgba(255,110,80,0.9)';
    const hoch = G.tw * (u.typ === 'flatterer' ? 0.45 : 0.22);
    if (w.art === 'nah') {
      pfeil(ax + (bx - ax) * 0.25, ay - hoch + (by - ay) * 0.25 + hoch * 0.25, bx - (bx - ax) * 0.12, by - (by - ay) * 0.12, farbe, G.tw * 0.035, G.tw * 0.1);
    } else if (w.art === 'linie') {
      ctx.setLineDash([G.tw * 0.07, G.tw * 0.06]);
      ctx.strokeStyle = farbe; ctx.lineWidth = G.tw * 0.03;
      ctx.beginPath(); ctx.moveTo(ax, ay - hoch); ctx.lineTo(bx, by - G.tw * 0.06); ctx.stroke();
      ctx.setLineDash([]);
      pfeil(lerp(ax, bx, 0.8), lerp(ay - hoch, by - G.tw * 0.06, 0.8), bx, by - G.tw * 0.06, farbe, G.tw * 0.03, G.tw * 0.09);
    } else {
      ctx.setLineDash([G.tw * 0.06, G.tw * 0.06]);
      ctx.strokeStyle = farbe; ctx.lineWidth = G.tw * 0.03;
      const hx = (ax + bx) / 2, hy = Math.min(ay, by) - G.tw * 0.9;
      ctx.beginPath(); ctx.moveTo(ax, ay - hoch); ctx.quadraticCurveTo(hx, hy, bx, by); ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!tr.frei) {
      const n = w.schaden + (u.plus || 0);
      text('−' + n, bx, by - G.tw * 0.02, '#ffe2d9', 0.14, 'rgba(120,25,12,0.9)');
      if (w.stoss === 'weg') {
        const [dx, dy] = R.RICHTUNG[a.r];
        const [cx, cy] = mitte(tr.x + dx * 0.45, tr.y + dy * 0.45);
        pfeil(bx, by, cx, cy, 'rgba(255,200,180,0.9)', G.tw * 0.025, G.tw * 0.07);
      }
    }
    /* Reihenfolge — wer zuerst zuschlägt */
    const [ox, oy] = [ax + G.tw * 0.2, ay - hoch - G.tw * 0.2];
    ctx.fillStyle = hervor ? FARBE.rot : '#b8412b';
    ctx.beginPath(); ctx.arc(ox, oy, G.tw * 0.075, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(G.tw * 0.1)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(a.n), ox, oy + 1);
  }
}

/* Was die Vorschau verspricht: Schaden, Stöße, Tote, Deichverlust. */
function vorschauZeichnen(t) {
  const v = UI.vorschau;
  if (!v) return;
  const blink = 0.65 + Math.sin(t * 8) * 0.35;
  for (const e of v.ev) {
    if (e.art === 'stoss') {
      const [ax, ay] = mitte(e.von[0], e.von[1]), [bx, by] = mitte(e.nach[0], e.nach[1]);
      pfeil(ax, ay - G.tw * 0.05, bx, by - G.tw * 0.05, `rgba(255,255,255,${0.85 * blink})`, G.tw * 0.04, G.tw * 0.11);
    } else if (e.art === 'prall') {
      const [ax, ay] = mitte(e.von[0], e.von[1]), [bx, by] = mitte(e.gegen[0], e.gegen[1]);
      const mx = (ax + bx) / 2, my = (ay + by) / 2 - G.tw * 0.08;
      ctx.strokeStyle = `rgba(255,230,120,${blink})`; ctx.lineWidth = G.tw * 0.025;
      for (let k = 0; k < 6; k++) {
        const w = k / 6 * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(mx + Math.cos(w) * G.tw * 0.04, my + Math.sin(w) * G.tw * 0.04);
        ctx.lineTo(mx + Math.cos(w) * G.tw * 0.11, my + Math.sin(w) * G.tw * 0.11); ctx.stroke();
      }
    }
  }
  const pro = new Map();
  for (const e of v.ev) {
    if (e.art === 'schaden' || e.art === 'haus' || e.art === 'turm' || e.art === 'fels') {
      const k = e.x + ',' + e.y;
      pro.set(k, (pro.get(k) || 0) + (e.n || 1));
    }
  }
  for (const [k, n] of pro) {
    const [x, y] = k.split(',').map(Number);
    const [cx, cy] = mitte(x, y);
    text('−' + n, cx, cy - G.tw * 0.46, '#fff', 0.16, `rgba(200,50,30,${0.9 * blink})`);
  }
  for (const e of v.ev) {
    const [cx, cy] = e.x !== undefined ? mitte(e.x, e.y) : [0, 0];
    if (e.art === 'tod' || e.art === 'wrack') totenkopf(cx, cy - G.tw * 0.2, G.tw * 0.09);
    if (e.art === 'ertrinkt') tropfen(cx, cy - G.tw * 0.2, G.tw * 0.09);
    if (e.art === 'haus') text('DEICH −' + e.n, cx, cy - G.tw * 0.75, '#fff', 0.13, `rgba(200,50,30,${0.95 * blink})`);
  }
}

/* ---------- Kurzlebiges: Geschosse, Zahlen, Staub ---------- */
function fx(art, dauer, daten) { FX.push({ art, t0: jetzt(), dauer, ...daten }); }
function partikel(n, farbe, x, y, weite, hoch, dauer, groesse = 0.03) {
  const teile = [];
  for (let i = 0; i < n; i++) {
    const w = Math.random() * Math.PI * 2, v = 0.4 + Math.random() * 0.6;
    teile.push({ vx: Math.cos(w) * weite * v, vy: Math.sin(w) * weite * v * 0.5, vz: hoch * (0.5 + Math.random() * 0.8), g: groesse * (0.6 + Math.random() * 0.8) });
  }
  fx('teile', dauer, { x, y, teile, farbe });
}
function fxZeichnen(t) {
  for (let i = FX.length - 1; i >= 0; i--) {
    const e = FX[i], k = (t - e.t0) / e.dauer;
    if (k >= 1) { FX.splice(i, 1); continue; }
    if (k < 0) continue;
    const s = G.tw;
    if (e.art === 'geschoss') {
      const x = lerp(e.ax, e.bx, k), y = lerp(e.ay, e.by, k) - Math.sin(k * Math.PI) * (e.bogen || 0);
      const kv = Math.max(0, k - 0.12);
      const x0 = lerp(e.ax, e.bx, kv), y0 = lerp(e.ay, e.by, kv) - Math.sin(kv * Math.PI) * (e.bogen || 0);
      ctx.strokeStyle = rgba(e.farbe, 0.45); ctx.lineWidth = s * 0.04; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = e.farbe; ctx.beginPath(); ctx.arc(x, y, s * (e.gross || 0.035), 0, Math.PI * 2); ctx.fill();
    } else if (e.art === 'zahl') {
      ctx.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4;
      text(e.text, e.x, e.y - k * s * 0.35, e.farbe || '#fff', 0.18, e.grund || 'rgba(170,35,20,0.92)');
      ctx.globalAlpha = 1;
    } else if (e.art === 'blitz') {
      ctx.fillStyle = rgba(e.farbe || '#ffffff', 0.55 * (1 - k));
      viereck(raute(e.fx, e.fy, 0, 0.02)); ctx.fill();
    } else if (e.art === 'ring') {
      ctx.strokeStyle = rgba(e.farbe, 0.8 * (1 - k)); ctx.lineWidth = s * 0.03 * (1 - k) + 1;
      ctx.beginPath(); ctx.ellipse(e.x, e.y, s * (0.1 + k * (e.weit || 0.5)), s * (0.05 + k * (e.weit || 0.5) * 0.5), 0, 0, Math.PI * 2); ctx.stroke();
    } else if (e.art === 'teile') {
      ctx.fillStyle = e.farbe;
      for (const p of e.teile) {
        const x = e.x + p.vx * k * s, y = e.y + p.vy * k * s - (p.vz * k - k * k * p.vz * 1.1) * s;
        ctx.globalAlpha = 1 - k;
        ctx.fillRect(x - p.g * s / 2, y - p.g * s / 2, p.g * s, p.g * s);
      }
      ctx.globalAlpha = 1;
    } else if (e.art === 'rauch') {
      for (let j = 0; j < 4; j++) {
        const kk = (k + j * 0.22) % 1;
        ctx.fillStyle = `rgba(70,74,78,${0.35 * (1 - kk)})`;
        ctx.beginPath(); ctx.arc(e.x + Math.sin(kk * 4 + j) * s * 0.06, e.y - kk * s * 0.7, s * (0.06 + kk * 0.1), 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

/* ---------- Ein Bild ---------- */
function bild() {
  requestAnimationFrame(bild);
  const t = jetzt();
  ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  himmel(t);
  if (ANZ) {
    ctx.save();
    const kb = t - BEBEN.t0;
    if (kb < 0.35) {
      const s = BEBEN.staerke * (1 - kb / 0.35);
      ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }
    const z = ANZ;
    for (let s = 0; s < 2 * N - 1; s++)
      for (let x = Math.max(0, s - N + 1); x <= Math.min(N - 1, s); x++) feldZeichnen(z, x, s - x, t);
    bodenMarken(z, t);

    /* Bauten und Einheiten, von hinten nach vorn. */
    const liste = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const f = R.feld(z, x, y);
      if (f.art === 'fels') liste.push({ tiefe: x + y + 1, mal: () => felsZeichnen(x, y, f) });
      else if (f.art === 'haus') liste.push({ tiefe: x + y + 1, mal: () => hausZeichnen(x, y, f, t) });
      else if (f.art === 'ruine') liste.push({ tiefe: x + y + 1, mal: () => ruineZeichnen(x, y, f, t) });
      else if (f.art === 'turm') liste.push({ tiefe: x + y + 1, mal: () => turmZeichnen(x, y, f, t, z.finale) });
    }
    const verlust = new Map();
    if (UI.vorschau) for (const e of UI.vorschau.ev) if (e.art === 'schaden' && e.id !== undefined) verlust.set(e.id, (verlust.get(e.id) || 0) + e.n);
    for (const u of z.einheiten) {
      const [ox, oy] = anzeigeOrt(u, t);
      const stil = { verlust: Math.min(u.hp, verlust.get(u.id) || 0), nass: u.team === 'wir' && R.imFeld(Math.round(ox), Math.round(oy)) && istWasser(z, Math.round(ox), Math.round(oy)) && !GLEIT.has(u.id) };
      if (u.aufsteigen !== undefined) stil.aufsteigen = u.aufsteigen;
      liste.push({ tiefe: ox + oy + 1.01, mal: () => u.team === 'wir' ? maschineZeichnen(u, ox, oy, t, stil) : feindZeichnen(u, ox, oy, t, stil) });
    }
    /* Geister: wohin die Vorschau jemanden stößt. */
    if (UI.vorschau) for (const e of UI.vorschau.ev) {
      if (e.art !== 'stoss') continue;
      const u = R.einheit(z, e.id); if (!u) continue;
      const [gx, gy] = e.nach;
      liste.push({ tiefe: gx + gy + 1.02, mal: () => {
        ctx.save(); ctx.globalAlpha = 0.38;
        if (u.team === 'wir') maschineZeichnen(u, gx, gy, t, { balken: false, ruhig: true });
        else feindZeichnen(u, gx, gy, t, { balken: false, alpha: 0.6 });
        ctx.restore();
      } });
    }
    liste.sort((a, b) => a.tiefe - b.tiefe);
    for (const d of liste) d.mal();

    ansagenZeichnen(z, t);
    vorschauZeichnen(t);
    fxZeichnen(t);
    ctx.restore();
  }
  regen(t);
}

/* ======================= 4  Wiedergabe ======================= */
/* Jedes Ereignis aus den Regeln bekommt hier seine Bewegung. Die
   Wiedergabe ändert nur ANZ — die Wahrheit steht längst in Z. */
let TEMPO = +(localStorage.getItem('sf_tempo') || 1);
const warte = ms => new Promise(r => setTimeout(r, ms / TEMPO));
function gleite(id, von, nach, ms, hop = 0) {
  GLEIT.set(id, { von, nach, t0: jetzt(), dauer: ms / 1000 / TEMPO, hop });
  return warte(ms).then(() => GLEIT.delete(id));
}
function ruck(id, dx, dy, ms, art = 'stoss') {
  RUCK.set(id, { dx, dy, t0: jetzt(), dauer: ms / 1000 / TEMPO, art });
  setTimeout(() => RUCK.delete(id), ms / TEMPO + 30);
}
const beben = st => { BEBEN = { t0: jetzt(), staerke: st }; };
const anz = id => R.einheit(ANZ, id);
const entfernen = id => { ANZ.einheiten = ANZ.einheiten.filter(u => u.id !== id); };
function richtungVon(ax, ay, bx, by) {
  return R.RICHTUNG.findIndex(([dx, dy]) => dx === Math.sign(bx - ax) && dy === Math.sign(by - ay));
}
const hochPunkt = (x, y, h) => { const [cx, cy] = mitte(x, y); return [cx, cy - G.tw * h]; };

const SPIEL = {
  async geht(e) {
    const u = anz(e.id); if (!u) return;
    TON.fahren(u.team);
    for (let i = 1; i < e.pfad.length; i++) {
      const [ax, ay] = e.pfad[i - 1], [bx, by] = e.pfad[i];
      const r = richtungVon(ax, ay, bx, by); if (r >= 0) u.blick = r;
      await gleite(u.id, [ax, ay], [bx, by], u.fliegt ? 85 : 105);
      u.x = bx; u.y = by;
    }
    if (e.blick !== undefined) u.blick = e.blick;
  },
  async zurueck(e) {
    const u = anz(e.id); if (!u) return;
    await gleite(u.id, e.von, e.nach, 160);
    u.x = e.nach[0]; u.y = e.nach[1];
  },
  async zielt(e) {
    ANZ.angriffe.push({ id: e.id, r: e.r, k: e.k, n: e.n });
    const u = anz(e.id); if (u) u.blick = e.blick ?? e.r;
    TON.ansage();
    await warte(130);
  },
  async handelt(e) {
    UI.feind = e.id;
    await warte(200);
    ANZ.angriffe = ANZ.angriffe.filter(a => a.id !== e.id);
  },
  async ausfall(e) {
    ANZ.angriffe = ANZ.angriffe.filter(a => a.id !== e.id);
    await warte(60);
  },
  async hieb(e) {
    const u = anz(e.id);
    if (u) { u.blick = e.r; const [dx, dy] = R.RICHTUNG[e.r]; ruck(u.id, dx * 0.34, dy * 0.34, 230); }
    TON.hieb(u && u.team);
    await warte(115);
    fx('blitz', 0.25, { fx: e.nach[0], fy: e.nach[1] });
    beben(G.tw * 0.05);
  },
  async schuss(e) {
    const u = anz(e.id); if (u) u.blick = e.r;
    const [ax, ay] = hochPunkt(e.von[0], e.von[1], 0.3), [bx, by] = hochPunkt(e.nach[0], e.nach[1], 0.2);
    const l = Math.hypot(e.nach[0] - e.von[0], e.nach[1] - e.von[1]);
    const ms = 90 + l * 40;
    TON.schuss(u && u.team);
    fx('geschoss', ms / 1000 / TEMPO, { ax, ay, bx, by, farbe: u && u.team === 'sie' ? '#7fffd9' : '#ffe08a' });
    await warte(ms);
    beben(G.tw * 0.04);
  },
  async bogen(e) {
    const u = anz(e.id); if (u) u.blick = e.r;
    const [ax, ay] = hochPunkt(e.von[0], e.von[1], 0.45), [bx, by] = hochPunkt(e.nach[0], e.nach[1], 0.05);
    TON.abschuss(u && u.team);
    fx('geschoss', 0.42 / TEMPO, { ax, ay, bx, by, bogen: G.tw * 1.3, gross: 0.05, farbe: u && u.team === 'sie' ? '#b58a55' : '#ffcf6b' });
    await warte(420);
    TON.einschlag();
    const [cx, cy] = mitte(e.nach[0], e.nach[1]);
    fx('ring', 0.4 / TEMPO, { x: cx, y: cy, farbe: '#ffdca0', weit: 0.7 });
    beben(G.tw * 0.07);
  },
  async schaden(e) {
    const u = anz(e.id);
    if (u) { u.hp = e.hp; ruck(u.id, 0.06, -0.06, 260, 'wackeln'); }
    const [cx, cy] = mitte(e.x, e.y);
    fx('zahl', 0.9 / TEMPO, { text: '−' + e.n, x: cx, y: cy - G.tw * 0.45 });
    fx('blitz', 0.2, { fx: e.x, fy: e.y, farbe: '#ff8a6b' });
    TON.treffer();
    await warte(130);
  },
  async stoss(e) {
    const u = anz(e.id); if (!u) return;
    TON.schub();
    await gleite(u.id, e.von, e.nach, 150);
    u.x = e.nach[0]; u.y = e.nach[1];
  },
  async prall(e) {
    const u = anz(e.id);
    if (u) ruck(u.id, (e.gegen[0] - e.von[0]) * 0.3, (e.gegen[1] - e.von[1]) * 0.3, 200);
    const [ax, ay] = mitte(e.von[0], e.von[1]), [bx, by] = mitte(e.gegen[0], e.gegen[1]);
    partikel(12, '#ffe6a0', (ax + bx) / 2, (ay + by) / 2 - G.tw * 0.1, 0.35, 0.2, 0.45 / TEMPO, 0.025);
    TON.prall();
    beben(G.tw * 0.06);
    await warte(190);
  },
  async ertrinkt(e) {
    const [cx, cy] = mitte(e.x, e.y);
    TON.platsch();
    for (let k = 0; k < 3; k++) setTimeout(() => fx('ring', 0.7 / TEMPO, { x: cx, y: cy - HOEHE_WASSER(), farbe: '#cfeaf5', weit: 0.35 + k * 0.15 }), k * 110 / TEMPO);
    partikel(14, '#bfe3f2', cx, cy - HOEHE_WASSER(), 0.25, 0.5, 0.6 / TEMPO, 0.03);
    entfernen(e.id);
    await warte(380);
  },
  async nass(e) {
    const [cx, cy] = mitte(e.x, e.y);
    TON.platsch(true);
    fx('ring', 0.6 / TEMPO, { x: cx, y: cy - HOEHE_WASSER(), farbe: '#cfeaf5', weit: 0.4 });
    await warte(150);
  },
  async tod(e) {
    const [cx, cy] = mitte(e.x, e.y);
    partikel(18, '#5a4a7a', cx, cy - G.tw * 0.15, 0.4, 0.45, 0.6 / TEMPO, 0.035);
    partikel(8, FARBE.leuchten, cx, cy - G.tw * 0.15, 0.3, 0.6, 0.7 / TEMPO, 0.02);
    TON.tod();
    entfernen(e.id);
    await warte(240);
  },
  async wrack(e) {
    const u = anz(e.id); if (u) { u.wrack = true; u.hp = 0; }
    const [cx, cy] = mitte(e.x, e.y);
    partikel(16, '#ffb35c', cx, cy - G.tw * 0.2, 0.35, 0.5, 0.5 / TEMPO, 0.03);
    fx('rauch', 1.6, { x: cx, y: cy - G.tw * 0.3 });
    TON.wrack(); beben(G.tw * 0.09);
    await warte(320);
  },
  async haus(e) {
    const f = R.feld(ANZ, e.x, e.y);
    f.hp = e.hp; if (e.hp <= 0) f.art = 'ruine';
    ANZ.deich = e.deich;
    const [cx, cy] = mitte(e.x, e.y);
    partikel(20, '#b9ab93', cx, cy - G.tw * 0.25, 0.4, 0.4, 0.8 / TEMPO, 0.04);
    fx('rauch', 1.8, { x: cx, y: cy - G.tw * 0.2 });
    fx('zahl', 1.1 / TEMPO, { text: 'DEICH −' + e.n, x: cx, y: cy - G.tw * 0.8, grund: 'rgba(40,90,150,0.95)' });
    TON.haus(); beben(G.tw * 0.08);
    anzeigeDeich(true);
    await warte(340);
  },
  async turm(e) {
    const f = R.feld(ANZ, e.x, e.y);
    f.hp = e.hp; if (e.hp <= 0) f.art = 'ruine';
    const [cx, cy] = mitte(e.x, e.y);
    partikel(14, '#d8d2c4', cx, cy - G.tw * 0.4, 0.35, 0.4, 0.7 / TEMPO, 0.035);
    fx('zahl', 0.9 / TEMPO, { text: '−' + e.n, x: cx, y: cy - G.tw * 0.9 });
    TON.haus(); beben(G.tw * 0.06);
    await warte(260);
  },
  async fels(e) {
    const f = R.feld(ANZ, e.x, e.y);
    f.hp = e.hp; if (e.hp <= 0) { f.art = 'land'; f.schutt = true; }
    const [cx, cy] = mitte(e.x, e.y);
    partikel(12, '#8a8578', cx, cy - G.tw * 0.15, 0.35, 0.35, 0.55 / TEMPO, 0.035);
    TON.fels();
    await warte(180);
  },
  async blubbert(e) {
    ANZ.auftauchen.push({ x: e.x, y: e.y });
    TON.blubb();
    await warte(120);
  },
  async auftauchen(e) {
    ANZ.auftauchen = ANZ.auftauchen.filter(m => !(m.x === e.x && m.y === e.y));
    const u = structuredClone(e.einheit); u.aufsteigen = 0;
    ANZ.einheiten.push(u);
    const [cx, cy] = mitte(e.x, e.y);
    partikel(16, '#cdbd8e', cx, cy, 0.35, 0.45, 0.6 / TEMPO, 0.03);
    TON.auftauchen();
    const t0 = jetzt(), d = 0.38 / TEMPO;
    while (jetzt() - t0 < d) { u.aufsteigen = glatt((jetzt() - t0) / d); await warte(16 * TEMPO); }
    delete u.aufsteigen;
  },
  async blockiert(e) {
    ANZ.auftauchen = ANZ.auftauchen.filter(m => !(m.x === e.x && m.y === e.y));
    const [cx, cy] = mitte(e.x, e.y);
    fx('ring', 0.5 / TEMPO, { x: cx, y: cy, farbe: '#ffb070', weit: 0.5 });
    TON.prall();
    await warte(200);
  },
};
async function abspielen(ev) {
  for (const e of ev) {
    const f = SPIEL[e.art];
    if (f) await f(e);
    anzeigeMaschinen();
  }
}

/* ======================= 5  Ton ======================= */
/* Alles gemacht, nichts geladen: Rauschen durch Filter, dazu ein paar
   Schwingungen. Im Hintergrund Wind und Brandung, damit die Stille
   zwischen den Zügen nicht leer ist. */
const TON = (() => {
  let ac = null, master = null, rausch = null, an = localStorage.getItem('sf_ton') !== 'aus';
  function start() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = an ? 0.8 : 0; master.connect(ac.destination);
    const len = ac.sampleRate * 2, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    rausch = b;
    /* Wind und Brandung */
    const w = ac.createBufferSource(); w.buffer = rausch; w.loop = true;
    const wf = ac.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
    const wg = ac.createGain(); wg.gain.value = 0.05;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.11;
    const lg = ac.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect(wg.gain); lfo.start();
    w.connect(wf); wf.connect(wg); wg.connect(master); w.start();
  }
  function stoss(dauer, cut, vol, typ = 'lowpass', rate) {
    if (!ac || !an) return;
    const s = ac.createBufferSource(); s.buffer = rausch;
    s.playbackRate.value = rate || (0.7 + Math.random() * 0.6);
    const f = ac.createBiquadFilter(); f.type = typ; f.frequency.value = cut;
    const g = ac.createGain(); g.gain.value = vol;
    g.gain.setTargetAtTime(0.0001, ac.currentTime + dauer * 0.2, dauer * 0.35);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(); s.stop(ac.currentTime + dauer + 0.1);
  }
  function schwing(typ, f0, f1, dauer, vol, ab = 0) {
    if (!ac || !an) return;
    const t = ac.currentTime + ab;
    const o = ac.createOscillator(); o.type = typ;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dauer);
    const g = ac.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(vol, t, 0.004); g.gain.setTargetAtTime(0, t + dauer * 0.35, dauer * 0.3);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dauer + 0.3);
  }
  return {
    start,
    schalten(x) { an = x; localStorage.setItem('sf_ton', x ? 'an' : 'aus'); if (master) master.gain.setTargetAtTime(x ? 0.8 : 0, ac.currentTime, 0.05); },
    get an() { return an; },
    klick() { schwing('sine', 900, 700, 0.05, 0.05); },
    fahren(team) { if (team === 'wir') { schwing('sawtooth', 70, 95, 0.28, 0.05); stoss(0.25, 300, 0.05); } else stoss(0.2, 900, 0.05, 'bandpass'); },
    ansage() { schwing('sine', 540, 400, 0.14, 0.05); },
    hieb(team) { stoss(0.14, 900, 0.3); schwing('sine', 110, 45, 0.25, team === 'wir' ? 0.3 : 0.18); },
    schuss(team) { if (team === 'wir') { stoss(0.12, 3200, 0.25, 'highpass'); schwing('sine', 200, 60, 0.3, 0.25); } else stoss(0.25, 1600, 0.16, 'bandpass'); },
    abschuss(team) { schwing('sine', 130, 70, 0.2, 0.2); stoss(0.45, 1200, 0.08, 'bandpass', 1.4); },
    einschlag() { stoss(0.3, 700, 0.32); schwing('sine', 90, 40, 0.3, 0.25); },
    treffer() { stoss(0.08, 2400, 0.12, 'bandpass'); },
    schub() { stoss(0.15, 500, 0.08); },
    prall() { schwing('square', 320, 180, 0.12, 0.08); stoss(0.1, 3000, 0.15, 'bandpass'); },
    platsch(leise) { stoss(0.5, 1300, leise ? 0.12 : 0.25, 'bandpass'); schwing('sine', 180, 60, 0.35, leise ? 0.06 : 0.12); },
    tod() { stoss(0.35, 700, 0.2, 'bandpass', 0.6); schwing('sawtooth', 160, 50, 0.35, 0.08); },
    wrack() { stoss(0.9, 500, 0.4); schwing('sine', 70, 30, 0.8, 0.3); },
    haus() { stoss(1.0, 600, 0.35); for (let i = 0; i < 4; i++) setTimeout(() => stoss(0.08, 2600, 0.1, 'bandpass'), 80 + i * 90); },
    fels() { stoss(0.35, 900, 0.22); },
    blubb() { for (let i = 0; i < 3; i++) schwing('sine', 300 + Math.random() * 300, 500 + Math.random() * 300, 0.06, 0.04, i * 0.07); },
    auftauchen() { stoss(0.5, 220, 0.3); stoss(0.3, 900, 0.1, 'bandpass', 0.5); },
    wir() { schwing('triangle', 440, 440, 0.16, 0.08); schwing('triangle', 660, 660, 0.22, 0.08, 0.12); },
    sie() { schwing('sawtooth', 150, 110, 0.5, 0.07); schwing('sawtooth', 157, 115, 0.5, 0.05); },
    sieg() { [523, 659, 784, 1046].forEach((f, i) => schwing('triangle', f, f, 0.3, 0.09, i * 0.14)); },
    verloren() { [392, 330, 262, 196].forEach((f, i) => schwing('triangle', f, f * 0.98, 0.45, 0.08, i * 0.22)); },
  };
})();

/* ======================= 6  Eingabe ======================= */
function feldBei(px, py) {
  /* Erst die Einheiten, denn sie ragen über ihr Feld hinaus — von vorn
     nach hinten, damit man die vordere trifft. */
  if (ANZ) {
    const liste = ANZ.einheiten.slice().sort((a, b) => (b.x + b.y) - (a.x + a.y));
    for (const u of liste) {
      const [cx, cy] = mitte(u.x, u.y);
      const w = G.tw * 0.26, hoch = G.tw * (u.typ === 'flatterer' ? 0.6 : 0.48);
      if (px > cx - w && px < cx + w && py > cy - hoch && py < cy + G.th * 0.2) return [u.x, u.y];
    }
  }
  return feldUnter(px, py);
}
function ort(e) { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
let druck = null;
cv.addEventListener('pointerdown', e => { druck = { x: e.clientX, y: e.clientY, typ: e.pointerType }; });
cv.addEventListener('pointerup', e => {
  if (!druck) return;
  const weit = Math.hypot(e.clientX - druck.x, e.clientY - druck.y);
  const typ = druck.typ; druck = null;
  if (weit > 14) return;
  const [px, py] = ort(e);
  tippe(feldBei(px, py), typ !== 'mouse');
});
cv.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  const [px, py] = ort(e);
  schwebe(feldBei(px, py));
});
/* Nur die Maus verlässt das Brett. Ein Finger „verlässt“ es nach jedem
   Tippen auch — der Browser schickt nach dem Anheben ein pointerleave.
   Das hat früher jede Vorschau sofort wieder gelöscht, und das zweite
   Tippen zum Bestätigen war immer wieder das erste. */
cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') schwebe(null); });

function schwebe(f, neu) {
  const alt = UI.hover;
  UI.hover = f;
  if (!Z || UI.besetzt) return;
  if (!neu && alt && f && alt[0] === f[0] && alt[1] === f[1]) return;
  if (Z.phase === 'wir' && UI.zielen && UI.wahl != null) {
    const u = R.einheit(Z, UI.wahl);
    const ziel = f && R.zielfelder(Z, u).find(t => t.x === f[0] && t.y === f[1]);
    if (ziel) vorschauSetzen(f[0], f[1]); else vorschauWeg();
  }
  const o = f && R.einheitAuf(ANZ, f[0], f[1]);
  UI.feind = o && o.team === 'sie' ? o.id : null;
  anzeigeInfo();
}

function vorschauSetzen(x, y) {
  const k = R.klon(Z);
  const ev = R.angreifen(k, UI.wahl, x, y, []);
  UI.vorschau = ev ? { x, y, z: k, ev } : null;
  anzeigeAlles();
}
function vorschauWeg() {
  if (!UI.vorschau && !UI.bestaetigen) return;
  UI.vorschau = null; UI.bestaetigen = null;
  anzeigeAlles();
}
function waehle(id) {
  UI.wahl = id; UI.feind = null; vorschauWeg();
  const u = R.einheit(Z, id);
  /* Wer schon gefahren ist, will als Nächstes zielen. */
  UI.zielen = !!(u && R.kannHandeln(Z, u) && u.bewegt && !R.imWasser(Z, u));
  TON.klick();
  anzeigeAlles();
}
function abwaehlen() {
  UI.wahl = null; UI.zielen = false; vorschauWeg(); anzeigeAlles();
}
/* Nach einer Handlung wird nichts von selbst gewählt. Früher war die
   nächste Maschine gleich ausgewählt — und wer sie dann anklickte, wie
   man das eben tut, schaltete sie damit scharf: der folgende Klick auf
   ein Nachbarfeld wurde zum Schlag statt zur Fahrt. Stattdessen zeigt
   das Brett, wer noch handeln kann. */
function naechsteMaschine() { abwaehlen(); }

function tippe(f, finger) {
  TON.start();
  if (!Z || UI.besetzt) return;
  if (Z.phase === 'aufstellen') return tippeAufstellen(f);
  if (Z.phase !== 'wir') return;
  if (!f) { abwaehlen(); return; }
  const [x, y] = f;
  const u = R.einheitAuf(Z, x, y);
  const gew = UI.wahl != null ? R.einheit(Z, UI.wahl) : null;

  if (gew && UI.zielen) {
    const ziel = R.zielfelder(Z, gew).find(t => t.x === x && t.y === y);
    if (ziel) {
      /* Am Finger gibt es kein Schweben: das erste Tippen zeigt, was
         passiert, das zweite auf dasselbe Feld löst aus. */
      if (finger && !(UI.bestaetigen && UI.bestaetigen[0] === x && UI.bestaetigen[1] === y)) {
        UI.bestaetigen = [x, y];
        vorschauSetzen(x, y);
        return;
      }
      return angriff(x, y);
    }
  }
  if (u && u.team === 'wir') {
    if (u.id === UI.wahl) {
      if (R.kannHandeln(Z, u) && !R.imWasser(Z, u)) { UI.zielen = !UI.zielen; vorschauWeg(); TON.klick(); anzeigeAlles(); }
    } else waehle(u.id);
    return;
  }
  if (gew && R.kannHandeln(Z, gew) && !gew.bewegt && !UI.zielen) {
    if (R.erreichbar(Z, gew).some(e => e.x === x && e.y === y)) return fahren(gew.id, x, y);
  }
  if (u && u.team === 'sie') { UI.feind = u.id; vorschauWeg(); anzeigeInfo(); return; }
  if (UI.zielen) { UI.zielen = false; vorschauWeg(); anzeigeAlles(); return; }
  abwaehlen();
}

function tippeAufstellen(f) {
  if (!f) return;
  const [x, y] = f;
  const u = R.einheitAuf(Z, x, y);
  if (u && u.team === 'wir') { UI.aufstellWahl = u.id; UI.wahl = u.id; TON.klick(); anzeigeAlles(); return; }
  if (UI.aufstellWahl != null && umstellen(Z, UI.aufstellWahl, x, y)) {
    ANZ = R.klon(Z); TON.schub(); anzeigeAlles();
  }
}

async function fahren(id, x, y) {
  UI.besetzt = true;
  const ev = R.bewegen(Z, id, x, y);
  if (ev) await abspielen(ev);
  ANZ = R.klon(Z);
  UI.besetzt = false;
  const u = R.einheit(Z, id);
  UI.zielen = !!(u && R.kannHandeln(Z, u) && !R.imWasser(Z, u));
  schwebe(UI.hover, true);
  anzeigeAlles();
}
async function angriff(x, y) {
  UI.besetzt = true;
  const id = UI.wahl;
  UI.vorschau = null; UI.bestaetigen = null; UI.zielen = false;
  const ev = R.angreifen(Z, id, x, y);
  anzeigeAlles();
  if (ev) await abspielen(ev);
  ANZ = R.klon(Z);
  UI.besetzt = false;
  if (Z.verloren) return einsatzEnde();
  naechsteMaschine();
}
async function zurueckNehmen() {
  if (UI.besetzt || UI.wahl == null) return;
  const u = R.einheit(Z, UI.wahl);
  if (!u || !u.bewegt || u.gehandelt) return;
  UI.besetzt = true; UI.zielen = false; vorschauWeg();
  const ev = R.zurueck(Z, u.id);
  if (ev) await abspielen(ev);
  ANZ = R.klon(Z); UI.besetzt = false;
  anzeigeAlles();
}
function zugNeu() {
  if (UI.besetzt || NEU_UEBRIG <= 0 || !ZUG_START) return;
  NEU_UEBRIG--;
  Z = R.klon(ZUG_START); ANZ = R.klon(Z);
  UI.vorschau = null; UI.bestaetigen = null;
  TON.schub();
  naechsteMaschine();
  speichern();
}

addEventListener('keydown', e => {
  if (!Z || UI.besetzt) return;
  if (['1', '2', '3'].includes(e.key) && Z.phase === 'wir') {
    const m = Z.einheiten.filter(u => u.team === 'wir')[+e.key - 1];
    if (m) waehle(m.id);
  } else if (e.code === 'Space' || e.key === 'q' || e.key === 'f') {
    e.preventDefault();
    const u = UI.wahl != null && R.einheit(Z, UI.wahl);
    if (u && R.kannHandeln(Z, u) && !R.imWasser(Z, u)) { UI.zielen = !UI.zielen; vorschauWeg(); anzeigeAlles(); }
  } else if (e.key === 'Escape') {
    if (UI.zielen) { UI.zielen = false; vorschauWeg(); anzeigeAlles(); } else abwaehlen();
  } else if (e.key === 'z' || e.key === 'Backspace') zurueckNehmen();
  else if (e.key === 'r') zugNeu();
  else if (e.key === 'Enter') { if (Z.phase === 'wir') zugBeenden(); else if (Z.phase === 'aufstellen') los(); }
  else if (e.key === 'm') { TON.schalten(!TON.an); }
});

/* ======================= 7  Anzeige ======================= */
const TYPNAME = t => R.TYPEN[t].name;
function anzeigeDeich(blitz) {
  const z = UI.besetzt ? ANZ : Z;
  const box = $('deichPunkte');
  if (!z) { box.innerHTML = ''; return; }
  const max = z.deichMax || F.DEICH_MAX;
  let verlust = 0;
  if (UI.vorschau) for (const e of UI.vorschau.ev) if (e.art === 'haus') verlust += e.n;
  if (box.children.length !== max) { box.innerHTML = ''; for (let i = 0; i < max; i++) box.appendChild(document.createElement('div')); }
  [...box.children].forEach((d, i) => {
    const an = i < z.deich;
    const vs = an && i >= z.deich - verlust;
    d.className = 'dp' + (vs ? ' vorschau' : an ? ' an' : '') + (blitz && i === z.deich ? ' weg' : '');
  });
}
function anzeigeMaschinen() {
  const z = UI.besetzt ? ANZ : Z;
  const box = $('maschinen');
  if (!z) { box.innerHTML = ''; return; }
  const ms = z.einheiten.filter(u => u.team === 'wir');
  const verlust = new Map();
  if (UI.vorschau) for (const e of UI.vorschau.ev) if (e.art === 'schaden') verlust.set(e.id, (verlust.get(e.id) || 0) + e.n);
  box.innerHTML = '';
  for (const u of ms) {
    const b = document.createElement('button');
    const fertig = Z.phase === 'wir' && !R.kannHandeln(Z, R.einheit(Z, u.id) || u);
    b.className = 'masch' + (u.id === UI.wahl ? ' wahl' : '') + (u.wrack ? ' wrack' : fertig ? ' fertig' : '');
    const v = Math.min(u.hp, verlust.get(u.id) || 0);
    let lp = '';
    for (let i = 0; i < u.max; i++) lp += `<span class="${i < u.hp - v ? 'an' : i < u.hp ? 'vs' : ''}"></span>`;
    b.innerHTML = `<b>${TYPNAME(u.typ).toUpperCase()}</b><div class="lp">${lp}</div>` + (u.wrack ? '' : '<i class="zu"></i>');
    b.addEventListener('click', () => {
      TON.start();
      if (UI.besetzt) return;
      if (Z.phase === 'aufstellen') { UI.aufstellWahl = u.id; UI.wahl = u.id; anzeigeAlles(); }
      else if (Z.phase === 'wir') waehle(u.id);
    });
    box.appendChild(b);
  }
}
function anzeigeAuftraege() {
  const z = Z; if (!z) return;
  $('einsatzName').textContent = z.name;
  $('auftraege').innerHTML = z.auftraege.map(a => {
    const st = R.auftragStand(z, a);
    /* Drei Zustände: erfüllt (sicher), offen, gescheitert. „Erledige vier“
       ist offen, solange noch Runden bleiben; „Turm halten“ ist erst
       erfüllt, wenn der Einsatz vorbei ist und er noch steht. */
    const vorbei = z.phase === 'aus';
    const gescheitert = st.gescheitert || (vorbei && !st.ok);
    const sicher = st.ok && (vorbei || st.sicher);
    const cls = gescheitert ? 'nein' : sicher ? 'ok' : '';
    const zeichen = gescheitert ? '✗' : sicher ? '✓' : '○';
    return `<div class="auftrag ${cls}"><i>${zeichen}</i><span>${R.AUFTRAG_TEXT[a](z)}</span>${st.zahl ? `<small>${st.zahl}</small>` : ''}</div>`;
  }).join('');
  $('muschelZahl').textContent = K ? K.muscheln : 0;
}
function anzeigeKopf() {
  if (!Z) return;
  const r = $('rundeText'), p = $('phaseText');
  if (Z.phase === 'aufstellen') { r.textContent = Z.name.toUpperCase(); p.textContent = 'AUFSTELLEN'; p.className = ''; }
  else { const quelle = UI.feindZug ? ANZ : Z;
         r.textContent = 'RUNDE ' + Math.max(1, quelle.runde) + ' / ' + Z.maxRunden;
         const sie = UI.feindZug;
         p.textContent = sie ? 'SIE SIND DRAN' : Z.runde >= Z.maxRunden ? 'LETZTER ZUG' : 'DEIN ZUG';
         p.className = sie ? 'sie' : ''; }
}
/* Was sich in einem Zug wirklich ändern kann — ohne Merkfelder wie die
   alte Blickrichtung, die nach Fahren und Zurücknehmen übrig bleiben. */
const wesentlich = z => JSON.stringify([z.deich, z.einheiten.map(u => [u.id, u.x, u.y, u.hp, u.wrack, u.gehandelt, u.bewegt]),
                                       z.feld.map(f => f.art + f.hp)]);
function anzeigeKnoepfe() {
  const wir = Z && Z.phase === 'wir' && !UI.besetzt;
  const u = UI.wahl != null && Z ? R.einheit(Z, UI.wahl) : null;
  const kann = u && R.kannHandeln(Z, u);
  $('bWaffe').disabled = !(wir && kann && !R.imWasser(Z, u));
  $('bWaffe').classList.toggle('an', !!UI.zielen);
  $('bWaffe').textContent = UI.zielen ? 'NICHT ZIELEN' : 'ZIELEN';
  $('bZurueck').disabled = !(wir && kann && u.bewegt);
  $('bNeu').disabled = !(wir && NEU_UEBRIG > 0 && ZUG_START && wesentlich(ZUG_START) !== wesentlich(Z));
  $('bNeu').textContent = '⟲ ZUG NEU' + (NEU_UEBRIG > 0 ? '' : ' (0)');
  const aufstellen = Z && Z.phase === 'aufstellen';
  $('bLos').style.display = aufstellen ? '' : 'none';
  $('bEnde').style.display = aufstellen ? 'none' : '';
  $('bEnde').disabled = !wir;
  $('bEnde').classList.toggle('warn', UI.endeWarnung);
  $('bEnde').textContent = UI.endeWarnung ? 'WIRKLICH BEENDEN?' : 'ZUG BEENDEN';
  $('bWaffe').parentElement.style.visibility = aufstellen ? 'hidden' : '';
}
function beschreibung(ev) {
  let tot = 0, ertrunken = 0, deich = 0, wrack = 0, schaden = 0;
  for (const e of ev) {
    if (e.art === 'tod') tot++;
    if (e.art === 'ertrinkt') ertrunken++;
    if (e.art === 'haus') deich += e.n;
    if (e.art === 'wrack') wrack++;
    if (e.art === 'schaden') schaden += e.n;
  }
  const teile = [];
  if (ertrunken) teile.push(`<span class="g">${ertrunken} ertrinkt</span>`);
  if (tot) teile.push(`<span class="g">${tot} erledigt</span>`);
  if (!tot && !ertrunken && schaden) teile.push(`${schaden} Schaden`);
  if (deich) teile.push(`<span class="w">DEICH −${deich}</span>`);
  if (wrack) teile.push(`<span class="w">eigene Maschine fällt aus</span>`);
  return teile.length ? teile.join(' · ') : 'Trifft nichts, was zählt — aber die Stöße können ihre Ziele verschieben.';
}
const GELAENDE = {
  haus: f => `<b>Haus</b> · ${f.hp} von ${f.maxHp || f.hp} · jeder Treffer kostet einen <b>Deichpunkt</b>, auch deiner.`,
  turm: (f, z) => z.pflichtTurm
    ? `<b>Sperrwerk</b> · ${f.hp} von ${f.maxHp || f.hp} · <span class="w">fällt es, ist alles verloren.</span>`
    : `<b>Leuchtturm</b> · ${f.hp} von ${f.maxHp || f.hp} · kostet keinen Deich, aber fällt er, ist der Auftrag weg.`,
  fels: f => `<b>Fels</b> · hält ${f.hp} Treffer aus. Wer dagegen gestoßen wird, prallt ab und nimmt einen Schaden.`,
  ruine: () => '<b>Ruine</b> · steht im Weg und hält Schüsse auf, zählt aber nichts mehr.',
  wasser: () => '<b>Wasser</b> · wer hineingestoßen wird und nicht fliegt, <span class="g">ertrinkt</span>. Maschinen gehen nicht unter, können darin aber nicht schießen.',
  land: (f, z) => z.auftauchen.some(m => m.x === UI.hover[0] && m.y === UI.hover[1])
    ? '<b>Es blubbert</b> · hier kommt nach ihrem Zug etwas heraus. Wer draufsteht, hält es unten und nimmt einen Schaden.'
    : null,
};
const ZIFFER = ['', 'erster', 'zweiter', 'dritter', 'vierter', 'fünfter', 'sechster', 'siebter', 'achter', 'neunter'];
function anzeigeInfo() {
  const el = $('info');
  if (!Z) { el.innerHTML = ''; return; }
  if (UI.vorschau && Z.phase === 'wir' && !UI.besetzt) {
    el.innerHTML = 'Vorschau: ' + beschreibung(UI.vorschau.ev) + (UI.bestaetigen ? ' — <b>noch einmal tippen</b> zum Auslösen.' : '');
    return;
  }
  if (UI.feind != null) {
    const f = R.einheit(ANZ, UI.feind) || R.einheit(Z, UI.feind);
    if (f) {
      const T = R.TYPEN[f.typ];
      const a = (UI.vorschau ? UI.vorschau.z : Z).angriffe.find(x => x.id === f.id);
      el.innerHTML = `<b>${T.name}</b> · ${f.hp}/${f.max} LP · ${T.text}` + (a ? ` Schlägt als <b>${ZIFFER[a.n] || a.n + '.'}</b> zu.` : '');
      return;
    }
  }
  if (Z.phase === 'aufstellen') {
    el.innerHTML = 'Stell deine Maschinen auf: <b>Maschine antippen</b>, dann ein blaues Feld. Wenn alles steht: <b>LOS</b>.';
    return;
  }
  /* Zeigt man auf ein Feld ohne Einheit, sagt die Zeile, was es bedeutet. */
  if (UI.hover && !UI.zielen && !UI.besetzt && !R.einheitAuf(Z, UI.hover[0], UI.hover[1])) {
    const f = R.feld(Z, UI.hover[0], UI.hover[1]);
    const t = GELAENDE[f.art] && GELAENDE[f.art](f, Z);
    if (t && (UI.wahl == null || f.art !== 'land')) { el.innerHTML = t; return; }
  }
  if (Z.phase !== 'wir' || UI.besetzt) { el.innerHTML = UI.besetzt ? '…' : ''; return; }
  if (UI.vorschau) { el.innerHTML = 'Vorschau: ' + beschreibung(UI.vorschau.ev) + (UI.bestaetigen ? ' — <b>noch einmal tippen</b> zum Auslösen.' : ''); return; }
  const u = UI.wahl != null ? R.einheit(Z, UI.wahl) : null;
  if (!u) {
    const frei = Z.einheiten.some(m => m.team === 'wir' && R.kannHandeln(Z, m));
    el.innerHTML = frei ? 'Wähle eine Maschine. <span class="w">Rote Felder</span> zeigen, wo sie gleich zuschlagen.'
                        : 'Alle haben gehandelt. <b>Zug beenden</b>, und sie führen aus, was sie angesagt haben.';
    return;
  }
  const T = R.TYPEN[u.typ];
  if (u.wrack) { el.innerHTML = `<b>${T.name}</b> ist ausgefallen und steht als Wrack im Weg.`; return; }
  if (!R.kannHandeln(Z, u)) { el.innerHTML = `<b>${T.name}</b> hat in diesem Zug schon gehandelt.`; return; }
  if (R.imWasser(Z, u)) { el.innerHTML = `<b>${T.name}</b> steht im Wasser und kann nicht schießen — fahr sie heraus.`; return; }
  if (UI.zielen) {
    el.innerHTML = `<b>${R.WAFFEN[T.waffe].name}</b>${u.plus ? ' (+' + u.plus + ')' : ''}: ${T.text} ` +
      (IST_FINGER ? 'Tippe ein <span class="g">gelbes Feld</span> für die Vorschau.' : 'Zeig auf ein <span class="g">gelbes Feld</span> für die Vorschau.');
    return;
  }
  el.innerHTML = `<b>${T.name}</b> · ${u.hp}/${u.max} LP · fährt ${u.zug} Felder. ` +
    (u.bewegt ? '' : '<b>Blau</b>: dorthin fahren. ') + 'Oder <b>Zielen</b>, um von hier aus zuzuschlagen.';
}
/* ---------- Lernen ----------
   Im allerersten Einsatz erklärt das Spiel sich selbst, Schritt für
   Schritt und immer genau dann, wenn es gebraucht wird. Jeder Hinweis
   erscheint einmal; wer ihn befolgt, sieht den nächsten. */
const GELERNT = new Set(JSON.parse(localStorage.getItem('sf_gelernt') || '[]'));
const LERNEN = [
  { id: 'rot',    wann: () => Z.phase === 'wir' && UI.wahl == null && !UI.besetzt,
    text: '<b>Rote Felder</b>: dort schlagen sie gleich zu. Die Zahl am Feind sagt, wer zuerst. Tippe eine deiner <b>gelben Maschinen</b> an.' },
  { id: 'fahren', wann: () => Z.phase === 'wir' && UI.wahl != null && !UI.zielen && !R.einheit(Z, UI.wahl).bewegt,
    text: '<b>Blaue Felder</b>: dorthin fahren. Danach zielt die Maschine von selbst.' },
  { id: 'zielen', wann: () => Z.phase === 'wir' && UI.zielen && !UI.vorschau,
    text: (IST_FINGER ? 'Tippe' : 'Zeig') + ' auf ein <b>gelbes Feld</b> — das Brett zeigt vorher genau, was passiert.' },
  { id: 'kniff',  wann: () => Z.phase === 'wir' && UI.vorschau && UI.vorschau.ev.some(e => e.art === 'stoss'),
    text: 'Siehst du, wie sich ihr <b>roter Angriff mitbewegt</b>? Wer weggestoßen wird, schlägt woanders zu — vielleicht bei seinesgleichen.' },
  { id: 'ende',   wann: () => Z.phase === 'wir' && !UI.besetzt && !Z.einheiten.some(u => u.team === 'wir' && R.kannHandeln(Z, u)),
    text: 'Alle haben gehandelt. <b>Zug beenden</b> — dann führen sie aus, was sie angesagt haben.' },
];
function anzeigeLernen() {
  const el = $('lern');
  const lernt = K && K.einsaetze === 0 && Z && Z.insel === 0 && Z.nr === 0 && !UI.feindZug;
  const h = lernt && LERNEN.find(l => !GELERNT.has(l.id) && l.wann());
  if (!h) { el.classList.remove('an'); return; }
  el.innerHTML = h.text; el.classList.add('an');
  /* Über dem Brett, nicht darauf: unter der Kopfzeile, oder in der
     Mitte oben, wenn die Anzeige als Leisten an den Seiten steht. */
  const seitlich = matchMedia('(max-height: 520px) and (min-aspect-ratio: 7/5)').matches;
  el.style.top = seitlich ? '' : ($('oben').getBoundingClientRect().bottom + 8) + 'px';
  /* Als gelernt gilt ein Hinweis, sobald seine Lage vorbei ist. */
  el.dataset.id = h.id;
}
function lernenWeiter() {
  const id = $('lern').dataset.id;
  const h = LERNEN.find(l => l.id === id);
  if (h && $('lern').classList.contains('an') && !h.wann()) {
    GELERNT.add(id); localStorage.setItem('sf_gelernt', JSON.stringify([...GELERNT]));
  }
}
function anzeigeAlles() {
  lernenWeiter();
  anzeigeDeich(); anzeigeMaschinen(); anzeigeAuftraege(); anzeigeKopf(); anzeigeKnoepfe(); anzeigeInfo();
  anzeigeLernen();
}
let bannerZeit = 0;
function banner(txt, art) {
  const b = $('banner');
  $('bannerText').textContent = txt;
  b.className = 'an ' + (art || '');
  clearTimeout(bannerZeit);
  bannerZeit = setTimeout(() => { b.className = art || ''; }, 1100 / TEMPO);
  return warte(900);
}

/* ======================= 8  Ablauf ======================= */
const BLENDEN = ['scTitel', 'scEinsatz', 'scBericht', 'scWerft', 'scEnde', 'scHilfe', 'scMenue'];
function zeige(id) {
  for (const b of BLENDEN) $(b).classList.toggle('weg', b !== id);
  /* Hinter Titel und Einweisung stört die Spielanzeige nur. */
  const leer = !!id;
  $('oben').style.visibility = $('unten').style.visibility = leer ? 'hidden' : '';
  groesse();
}
const offen = id => !$(id).classList.contains('weg');

/* ---------- Speichern ----------
   Gespeichert wird an zwei Stellen: vor jedem Einsatz (dann genügt der
   Feldzug, denn die Karte folgt aus dem Keim) und zu Beginn jedes eigenen
   Zuges (dann mit dem ganzen Einsatz). */
const SPEICHER = 'sturmflut_v1';
function speichern(wo) {
  if (!K || K.vorbei) { localStorage.removeItem(SPEICHER); return; }
  const d = { K, wo: wo || (Z && Z.phase === 'wir' ? 'zug' : 'einsatz') };
  if (d.wo === 'zug') { d.Z = Z; d.start = ZUG_START; d.neu = NEU_UEBRIG; }
  try { localStorage.setItem(SPEICHER, JSON.stringify(d)); } catch (e) { /* voll oder gesperrt */ }
}
function laden() {
  try { return JSON.parse(localStorage.getItem(SPEICHER) || 'null'); } catch (e) { return null; }
}

/* ---------- Titel ---------- */
let STUFE = localStorage.getItem('sf_stufe') || 'normal';
const STUFE_TEXT = {
  leicht: 'Acht Deichpunkte zum Start, weniger Nachschub. Zum Kennenlernen.',
  normal: 'Sieben Deichpunkte. Ein Feldzug, bei dem man jeden Zug durchdenken muss.',
  schwer: 'Sechs Deichpunkte und einer mehr von ihnen am Anfang. Fehler werden nicht verziehen.',
};
function titel() {
  K = null; Z = null; UI.wahl = null; UI.zielen = false; UI.vorschau = null;
  /* Hinter dem Titel liegt eine Karte, die atmet — kein leeres Schwarz. */
  ANZ = missionBauen({ keim: 4711, insel: 1, nr: 0, kampagne: F.neuerFeldzug('normal', 1) });
  ANZ.einheiten.forEach((u, i) => { if (u.team === 'sie') u.blick = 2; });
  document.querySelectorAll('#stufen .chip').forEach(c => c.classList.toggle('an', c.dataset.stufe === STUFE));
  $('stufeText').textContent = STUFE_TEXT[STUFE];
  const s = laden();
  $('bWeiterFeldzug').style.display = s ? '' : 'none';
  if (s) $('bWeiterFeldzug').textContent = 'WEITERSPIELEN · ' + inselName(s.K) + (s.K.nr !== undefined ? '' : '');
  $('querHinweis').style.display = G.w < G.h && IST_FINGER ? '' : 'none';
  zeige('scTitel');
  anzeigeAlles();
}
const inselName = k => F.istFinale(k) ? 'FINALE' : 'INSEL ' + (k.insel + 1) + ' · EINSATZ ' + (k.nr + 1);
document.querySelectorAll('#stufen .chip').forEach(c => c.addEventListener('click', () => {
  STUFE = c.dataset.stufe; localStorage.setItem('sf_stufe', STUFE);
  document.querySelectorAll('#stufen .chip').forEach(o => o.classList.toggle('an', o === c));
  $('stufeText').textContent = STUFE_TEXT[STUFE];
  TON.start(); TON.klick();
}));
$('bNeuerFeldzug').addEventListener('click', () => {
  TON.start();
  K = F.neuerFeldzug(STUFE);
  einsatzVorbereiten();
});
$('bWeiterFeldzug').addEventListener('click', () => {
  TON.start();
  const s = laden(); if (!s) return titel();
  K = s.K;
  if (s.wo === 'werft') return werft();
  if (s.wo === 'zug' && s.Z) {
    Z = s.Z; ZUG_START = s.start || R.klon(Z); NEU_UEBRIG = s.neu ?? 1;
    ANZ = R.klon(Z);
    zeige(null);
    naechsteMaschine();
    return;
  }
  einsatzVorbereiten();
});
$('bHilfe').addEventListener('click', () => { TON.start(); zeige('scHilfe'); });
$('bHilfeZu').addEventListener('click', () => { zeige(Z && Z.phase !== 'aus' && K ? null : 'scTitel'); });

/* ---------- Menü ---------- */
$('bMenue').addEventListener('click', () => {
  if (!K) return;
  $('bTon').textContent = 'TON: ' + (TON.an ? 'AN' : 'AUS');
  $('bTempo').textContent = 'TEMPO: ' + (TEMPO > 1 ? 'SCHNELL' : 'NORMAL');
  zeige('scMenue');
});
$('bMenueZu').addEventListener('click', () => zeige(null));
$('bTon').addEventListener('click', () => { TON.schalten(!TON.an); $('bTon').textContent = 'TON: ' + (TON.an ? 'AN' : 'AUS'); });
$('bTempo').addEventListener('click', () => {
  TEMPO = TEMPO > 1 ? 1 : 2; localStorage.setItem('sf_tempo', String(TEMPO));
  $('bTempo').textContent = 'TEMPO: ' + (TEMPO > 1 ? 'SCHNELL' : 'NORMAL');
});
$('bMenueHilfe').addEventListener('click', () => zeige('scHilfe'));
$('bAufgeben').addEventListener('click', () => {
  if (!confirm('Den Feldzug wirklich aufgeben? Der Spielstand wird gelöscht.')) return;
  localStorage.removeItem(SPEICHER);
  titel();
});

/* ---------- Einsatz ---------- */
const EINSATZ_TEXT = [
  'Das Wasser steht hoch, und im Schlick bewegt sich etwas. Halte das Dorf, bis die Flut abläuft.',
  'Sie kommen aus dem Watt, wo niemand sie erwartet hat. Die Leute sind in den Häusern.',
  'Der letzte Einsatz auf dieser Insel. Danach geht es mit der Fähre weiter.',
];
function einsatzVorbereiten() {
  Z = missionBauen({ keim: F.einsatzKeim(K), insel: K.insel, nr: K.nr, kampagne: K });
  ANZ = R.klon(Z); NEU_UEBRIG = 1; ZUG_START = null;
  UI.wahl = null; UI.zielen = false; UI.vorschau = null; UI.feind = null; UI.aufstellWahl = null;
  $('eInsel').textContent = F.istFinale(K) ? 'FINALE · ' + Z.inselName.toUpperCase() : 'INSEL ' + (K.insel + 1) + ' VON 3 · ' + Z.inselName.toUpperCase() + ' · EINSATZ ' + (K.nr + 1);
  $('eName').textContent = Z.name.toUpperCase();
  $('eText').textContent = F.istFinale(K)
    ? 'Das Sperrwerk hält die Eider. Fällt es, ist alles verloren — egal, wie viel Deich noch steht. Fünf Runden.'
    : EINSATZ_TEXT[K.nr] + ' ' + Z.maxRunden + ' Runden.';
  $('eAuftraege').innerHTML = Z.auftraege.map(a => `<li><i>◆</i><span>${R.AUFTRAG_TEXT[a](Z)}</span></li>`).join('')
    + (F.istFinale(K) ? '<li><i>!</i><span>Das Sperrwerk darf nicht fallen.</span></li>' : '');
  speichern('einsatz');
  zeige('scEinsatz');
  anzeigeAlles();
}
$('bAufstellen').addEventListener('click', () => {
  TON.start();
  zeige(null);
  UI.aufstellWahl = Z.einheiten.find(u => u.team === 'wir').id;
  UI.wahl = UI.aufstellWahl;
  anzeigeAlles();
});
async function los() {
  if (!Z || Z.phase !== 'aufstellen' || UI.besetzt) return;
  TON.start();
  UI.besetzt = true; UI.feindZug = true; UI.wahl = null; UI.aufstellWahl = null;
  const vor = R.klon(Z);
  const ev = R.losgehen(Z);
  ANZ = vor; ANZ.phase = 'sie';
  anzeigeAlles();
  TON.sie(); await banner('SIE KOMMEN', 'sie');
  await abspielen(ev);
  ANZ = R.klon(Z);
  UI.besetzt = false; UI.feindZug = false;
  zugBeginn();
}
$('bLos').addEventListener('click', los);

async function zugBeginn() {
  ZUG_START = R.klon(Z);
  UI.endeWarnung = false; UI.feind = null;
  speichern('zug');
  TON.wir();
  banner(Z.runde >= Z.maxRunden ? 'LETZTER ZUG' : 'DEIN ZUG', 'wir');
  naechsteMaschine();
}

const TEIL_TITEL = { handeln: 'SIE SCHLAGEN ZU', auftauchen: 'AUS DEM SCHLICK', ziehen: 'SIE ZIEHEN' };
let endeWarnZeit = 0;
async function zugBeenden() {
  if (!Z || Z.phase !== 'wir' || UI.besetzt) return;
  const offen = Z.einheiten.filter(u => u.team === 'wir' && R.kannHandeln(Z, u));
  if (offen.length && !UI.endeWarnung) {
    UI.endeWarnung = true; anzeigeKnoepfe();
    clearTimeout(endeWarnZeit);
    endeWarnZeit = setTimeout(() => { UI.endeWarnung = false; anzeigeKnoepfe(); }, 3000);
    return;
  }
  UI.endeWarnung = false;
  UI.wahl = null; UI.zielen = false; UI.vorschau = null; UI.bestaetigen = null;
  UI.besetzt = true; UI.feindZug = true;
  const vor = R.klon(Z);
  const teile = R.zugEnde(Z);
  ANZ = vor;
  anzeigeAlles();
  for (const teil of teile) {
    if (!teil.ev.length) continue;
    if (teil.titel === 'handeln') TON.sie();
    await banner(TEIL_TITEL[teil.titel], 'sie');
    await abspielen(teil.ev);
    await warte(250);
  }
  ANZ = R.klon(Z);
  UI.besetzt = false; UI.feindZug = false; UI.feind = null;
  anzeigeAlles();
  if (Z.phase === 'aus' || Z.verloren) return einsatzEnde();
  zugBeginn();
}
$('bEnde').addEventListener('click', () => { TON.start(); zugBeenden(); });
$('bWaffe').addEventListener('click', () => {
  const u = UI.wahl != null && R.einheit(Z, UI.wahl);
  if (u && R.kannHandeln(Z, u) && !R.imWasser(Z, u)) { UI.zielen = !UI.zielen; vorschauWeg(); TON.klick(); schwebe(UI.hover, true); anzeigeAlles(); }
});
$('bZurueck').addEventListener('click', zurueckNehmen);
$('bNeu').addEventListener('click', zugNeu);

/* ---------- Nach dem Einsatz ---------- */
let BERICHT = null;
async function einsatzEnde() {
  UI.besetzt = true;
  await warte(400);
  const deichVor = K.deich;
  BERICHT = F.abschliessen(K, Z);
  UI.besetzt = false;
  const b = BERICHT, zeilen = [];
  if (b.verloren) {
    return ende(false);
  }
  (b.sieg ? TON.sieg : TON.wir)();
  $('bOben').textContent = b.sieg ? 'DAS SPERRWERK HÄLT' : 'EINSATZ ÜBERSTANDEN';
  $('bName').textContent = Z.name.toUpperCase();
  for (const a of b.auftraege)
    zeilen.push(`<div class="${a.ok ? 'gut' : 'schlecht'}"><span>${R.AUFTRAG_TEXT[a.art](Z)}</span><b>${a.ok ? '+1 🐚' : '—'}</b></div>`);
  zeilen.push(`<div><span>Erledigt</span><b>${Z.stat.erledigt}${Z.stat.ertrunken ? ' (' + Z.stat.ertrunken + ' ertrunken)' : ''}</b></div>`);
  zeilen.push(`<div class="${Z.stat.hausVerloren ? 'schlecht' : 'gut'}"><span>Deich verloren</span><b>${Z.stat.hausVerloren ? '−' + Z.stat.hausVerloren : 'nichts'}</b></div>`);
  if (b.deichZurueck) zeilen.push(`<div class="gut"><span>Kein Haus verloren — der Deich wird ausgebessert</span><b>+${b.deichZurueck}</b></div>`);
  if (b.inselHilfe) zeilen.push(`<div class="gut"><span>Die Deichgräfin schickt Leute</span><b>+${b.inselHilfe}</b></div>`);
  zeilen.push(`<div class="muschel"><span>Deich jetzt · Muscheln</span><b>${K.deich} · ${K.muscheln} 🐚</b></div>`);
  $('bZeilen').innerHTML = zeilen.join('');
  $('bBerichtWeiter').textContent = b.sieg ? 'ZUM ENDE' : b.werft ? 'ZUR WERFT' : 'NÄCHSTER EINSATZ';
  speichern(b.werft ? 'werft' : 'einsatz');
  zeige('scBericht');
}
$('bBerichtWeiter').addEventListener('click', () => {
  if (K.vorbei) return ende(K.gewonnen);
  if (BERICHT && BERICHT.werft) return werft();
  einsatzVorbereiten();
});

function werft() {
  zeige('scWerft');
  const nachste = F.istFinale(K) ? 'Danach geht es zum Sperrwerk.' : 'Danach geht es nach ' + INSELN[K.insel].name + '.';
  $('werftText').innerHTML = `Du hast <b>${K.muscheln} Muscheln</b> und <b>${K.deich} von ${F.DEICH_MAX}</b> Deichpunkten. ${nachste}`;
  const liste = $('werftListe'); liste.innerHTML = '';
  for (const w of F.WERFT) {
    const b = document.createElement('button');
    const gekauft = K.gekauft[w.id] || 0;
    b.className = 'ware' + (gekauft ? ' gekauft' : '');
    b.disabled = !F.kaufbar(K, w);
    b.innerHTML = `<em>${w.preis} 🐚</em><b>${w.name}${gekauft && w.id !== 'deich' ? ' ✓' + (w.max > 1 ? gekauft : '') : ''}</b><span>${w.text}</span>`;
    b.addEventListener('click', () => { if (F.kaufen(K, w.id)) { TON.wir(); speichern('werft'); werft(); } });
    liste.appendChild(b);
  }
  $('bWerftWeiter').textContent = F.istFinale(K) ? 'ZUM SPERRWERK' : 'ZUR NÄCHSTEN INSEL';
  speichern('werft');
}
$('bWerftWeiter').addEventListener('click', () => einsatzVorbereiten());

function ende(gewonnen) {
  localStorage.removeItem(SPEICHER);
  (gewonnen ? TON.sieg : TON.verloren)();
  $('endeOben').textContent = gewonnen ? 'FELDZUG GEWONNEN · ' + STUFEN[K.stufe].name.toUpperCase() : 'FELDZUG VERLOREN';
  $('endeTitel').textContent = gewonnen ? 'DIE FLUT GEHT' : 'LAND UNTER';
  $('endeText').textContent = gewonnen
    ? 'Das Sperrwerk hat gehalten. Hinter dem Deich brennen die Lichter noch — und draußen im Watt ist es still.'
    : Z && Z.stat.turmFiel && Z.pflichtTurm
      ? 'Das Sperrwerk ist gefallen. Die Eider läuft über, und was aus dem Schlick kam, geht mit der Flut ins Land.'
      : 'Der Deich ist gebrochen. Das Wasser kommt, und mit ihm das, was darin lebt.';
  $('endeZeilen').innerHTML = [
    `<div><span>Einsätze</span><b>${K.einsaetze}</b></div>`,
    `<div><span>Erledigt</span><b>${K.erledigt}</b></div>`,
    `<div><span>Einsätze ohne Hausverlust</span><b>${K.perfekt}</b></div>`,
    `<div><span>Deich am Ende</span><b>${Math.max(0, K.deich)}</b></div>`,
  ].join('');
  zeige('scEnde');
}
$('bEndeNeu').addEventListener('click', () => titel());

/* ---------- Start ---------- */
groesse();
titel();
requestAnimationFrame(bild);
document.addEventListener('visibilitychange', () => { if (!document.hidden) groesse(); });

/* Prüfhaken für die Messung von außen. */
window.SF = {
  get Z() { return Z; }, get ANZ() { return ANZ; }, get K() { return K; }, UI,
  /* Nur für Prüfungen: nach einem Eingriff in Z die Anzeige nachziehen. */
  set ANZ(_) { ANZ = R.klon(Z); anzeigeAlles(); },
  bildschirm: (x, y) => { const [cx, cy] = mitte(x, y); const r = cv.getBoundingClientRect(); return [r.left + cx, r.top + cy]; },
  tippe: (x, y, finger) => tippe([x, y], finger),
  feldBei: (px, py) => { const r = cv.getBoundingClientRect(); return feldBei(px - r.left, py - r.top); },
  zugBeenden, los, R, F,
  G, wesentlich,
};
