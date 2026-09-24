/* Taschenwelt · Texturen
   Alles wird beim Start gezeichnet, nichts wird geladen. 32 × 32 Texel je
   Fläche. Die Regeln, nach denen hier gemalt wird, sind die der Pixelkunst,
   nicht die des Rauschens: jedes Material hat eine feste Palette von fünf,
   sechs Tönen, und ein Wertfeld entscheidet nur, welcher Ton wohin kommt.
   Die Anteile der Töne sind vorgegeben (Rang-Normierung), deshalb sieht
   Stein immer nach Stein aus, egal was das Rauschen gerade würfelt.
   Jede Blocktextur ist nahtlos kachelbar — Rauschen und Zellen laufen über
   den Rand und kommen auf der anderen Seite wieder herein. */
'use strict';

const TS = 32;                       // Texel je Kante
const texNames = [];                 // Layer-Index → Name
const texData  = [];                 // Layer-Index → Uint8Array(RGBA)
const TEX = {};                      // Name → Layer-Index
const WATER_FRAMES = 8;

function hex2rgb(h){ h = h.replace('#',''); return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; }
const pal = (...hx) => hx.map(hex2rgb);
const hell = (c, f) => [c[0]*f, c[1]*f, c[2]*f];
const mischen = (a, b, t) => [lerp(a[0],b[0],t), lerp(a[1],b[1],t), lerp(a[2],b[2],t)];

/* 4×4-Bayer-Schwellen, zentriert um 0 */
const BAYER4 = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5].map(v => (v + .5)/16 - .5);
const bay = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];

/* ── Kachelbares Rauschen ──────────────────────────────────────────── */
function h2(x, y, s){
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
/** Wertrauschen mit cx × cy Gitterzellen über die ganze Kachel */
function vnoise(x, y, cx, cy, s){
  const u = x*cx/TS, v = y*cy/TS, ix = Math.floor(u), iy = Math.floor(v);
  const fx = u - ix, fy = v - iy, sx = fx*fx*(3 - 2*fx), sy = fy*fy*(3 - 2*fy);
  const x0 = ((ix % cx) + cx) % cx, y0 = ((iy % cy) + cy) % cy;
  const x1 = x0 + 1 === cx ? 0 : x0 + 1, y1 = y0 + 1 === cy ? 0 : y0 + 1;
  const a = h2(x0, y0, s), b = h2(x1, y0, s), c = h2(x0, y1, s), d = h2(x1, y1, s);
  return a + (b - a)*sx + (c - a)*sy + (a - b - c + d)*sx*sy;
}
function fbm(x, y, cx, cy, s, okt = 3, gain = .5){
  let a = 1, n = 0, t = 0;
  for(let o = 0; o < okt; o++){ t += a*vnoise(x, y, cx << o, cy << o, s + o*101); n += a; a *= gain; }
  return t / n;
}
/** Zellen (Voronoi), nx × ny, über den Rand hinweg */
function zellen(x, y, nx, ny, s, jit = .9){
  const cw = TS/nx, ch = TS/ny;
  const ci = Math.floor(x/cw), cj = Math.floor(y/ch);
  let d1 = 1e9, d2 = 1e9, id = 0, px = 0, py = 0;
  for(let j = cj-1; j <= cj+1; j++) for(let i = ci-1; i <= ci+1; i++){
    const ii = ((i % nx) + nx) % nx, jj = ((j % ny) + ny) % ny;
    const qx = (i + .5 + (h2(ii, jj, s) - .5)*jit)*cw, qy = (j + .5 + (h2(ii, jj, s+7) - .5)*jit)*ch;
    const d = Math.hypot(x + .5 - qx, y + .5 - qy);
    if(d < d1){ d2 = d1; d1 = d; id = jj*nx + ii; px = qx; py = qy; }
    else if(d < d2) d2 = d;
  }
  return { d1, d2, id, px, py, zufall: h2(id, 3, s + 13) };
}

/* ── Leinwand ──────────────────────────────────────────────────────── */
const _w = v => ((v % TS) + TS) % TS;
class Pix{
  constructor(seed){ this.d = new Uint8Array(TS*TS*4); this.r = mulberry32(seed); this.s = seed >>> 0; }
  /** setzen mit Umlauf — so bleiben Muster kachelbar */
  put(x, y, c, a = 255){
    const i = (_w(Math.floor(x))*1 + _w(Math.floor(y))*TS)*4;
    this.d[i] = clamp(c[0], 0, 255); this.d[i+1] = clamp(c[1], 0, 255); this.d[i+2] = clamp(c[2], 0, 255); this.d[i+3] = a;
  }
  /** setzen ohne Umlauf — für Sprites */
  set(x, y, c, a = 255){ if(x < 0 || y < 0 || x >= TS || y >= TS) return; this.put(x, y, c, a); }
  get(x, y){ const i = (_w(x) + _w(y)*TS)*4; return [this.d[i], this.d[i+1], this.d[i+2], this.d[i+3]]; }
  alpha(x, y){ return this.d[(_w(x) + _w(y)*TS)*4 + 3]; }
  rect(x0, y0, w, h, c, a = 255){ for(let y = y0; y < y0+h; y++) for(let x = x0; x < x0+w; x++) this.put(x, y, c, a); }
  /** Helligkeit eines Pixels verändern */
  tone(x, y, f){ const c = this.get(x, y); if(c[3]) this.put(x, y, hell(c, f), c[3]); }
  klar(){ this.d.fill(0); return this; }
  /**
   * Fläche aus einem Wertfeld. Die Werte werden nach Rang geordnet, dann
   * bekommt jeder Paletten-Ton seinen festen Anteil der Fläche. Bayer-
   * Schwellen weichen die Grenzen zwischen zwei Tönen pixelweise auf.
   */
  fuell(fn, P, anteile, dith = .5, a = 255){
    const N = TS*TS, v = new Float32Array(N);
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++) v[y*TS + x] = fn(x, y);
    const sorted = Float32Array.from(v).sort();
    const k = P.length;
    const ant = anteile || new Array(k).fill(1);
    const summe = ant.reduce((s, t) => s + t, 0);
    const cum = []; let acc = 0; for(const t of ant){ acc += t/summe; cum.push(acc); }
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const val = v[y*TS + x];
      let lo = 0, hi = N;
      while(lo < hi){ const m = (lo + hi) >> 1; if(sorted[m] <= val) lo = m + 1; else hi = m; }
      const r = lo/N + bay(x, y)*dith/k;
      let i = 0; while(i < k-1 && r > cum[i]) i++;
      this.put(x, y, P[i], a);
    }
    return this;
  }
  /** Wert 0…1 direkt auf eine Palette */
  quant(x, y, val, P, dith = .5, a = 255){
    const k = P.length;
    const i = clamp(Math.floor(val*k + bay(x, y)*dith), 0, k-1);
    this.put(x, y, P[i], a);
  }
  /** Zufallsweg — Risse, Maserung */
  weg(x, y, n, dx, dy, c, a = 255, streu = .35){
    for(let i = 0; i < n; i++){
      this.put(x, y, c, a);
      if(this.r() < streu){ if(Math.abs(dx) > Math.abs(dy)) y += this.r() < .5 ? -1 : 1; else x += this.r() < .5 ? -1 : 1; }
      else { x += dx; y += dy; }
    }
  }
}

function addTex(name, fn, seed){
  const p = new Pix(seed !== undefined ? seed : hashStr(name));
  fn(p);
  ausbluten(p.d);
  TEX[name] = texNames.length; texNames.push(name); texData.push(p.d);
  return TEX[name];
}
/**
 * Durchsichtige Texel bekommen die Farbe ihrer Nachbarn. Sonst mischen die
 * Mipmaps Schwarz in jede Kante: Grashalme, Laub und Blumen bekämen aus der
 * Entfernung dunkle Säume, und Kreuzflächen, die man genau von der Kante
 * sieht, zögen schwarze Striche durchs Bild.
 */
function ausbluten(d){
  const N = TS*TS, bekannt = new Uint8Array(N);
  let rest = [];
  for(let i = 0; i < N; i++){ if(d[i*4+3]) bekannt[i] = 1; else rest.push(i); }
  if(!rest.length || rest.length === N) return;
  const NB = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
  while(rest.length){
    const neu = [], setzen = [];
    for(const i of rest){
      const x = i % TS, y = (i / TS) | 0;
      let r = 0, g = 0, b = 0, n = 0;
      for(const [dx, dy] of NB){
        const xx = x + dx, yy = y + dy;
        if(xx < 0 || yy < 0 || xx >= TS || yy >= TS || !bekannt[yy*TS + xx]) continue;
        const j = (yy*TS + xx)*4;
        r += d[j]; g += d[j+1]; b += d[j+2]; n++;
      }
      if(n) setzen.push(i, r/n, g/n, b/n); else neu.push(i);
    }
    if(!setzen.length) break;
    for(let k = 0; k < setzen.length; k += 4){
      const i = setzen[k]; d[i*4] = setzen[k+1]; d[i*4+1] = setzen[k+2]; d[i*4+2] = setzen[k+3]; bekannt[i] = 1;
    }
    rest = neu;
  }
}

/* ── Paletten (dunkel → hell) ──────────────────────────────────────── */
const PAL = {
  stein:   pal('#54555b','#63646a','#727379','#818288','#909197','#a1a2a7'),
  fuge:    pal('#34353a','#3f4045'),
  erde:    pal('#47301f','#573b26','#67472d','#775335','#855e3d','#936b46'),
  gras:    pal('#3b6a26','#467829','#51862f','#5c9335','#68a03c','#78ae47'),
  sand:    pal('#bda46c','#c9b279','#d4bf86','#ddc991','#e6d49d','#efdfae'),
  kies:    pal('#4d4946','#605b57','#736d68','#878079','#9b948d','#aea8a1'),
  rinde:   pal('#2c2012','#3a2a17','#48351d','#574124','#664c2b','#735733'),
  kern:    pal('#80603a','#8f6d42','#9e7b4b','#ad8955','#bb9760','#c8a56c'),
  brett:   pal('#654727','#74532e','#836035','#926d3d','#a17a45','#b0884f'),
  laub:    pal('#1b3f12','#244f18','#2e5f1e','#387025','#43812c','#529336'),
  wasser:  pal('#19468a','#1f539c','#2661ad','#2e6fbc','#3a80ca','#5596d6','#86b9e8'),
  urstein: pal('#121214','#222226','#34353a','#484950','#5e5f66'),
  sandst:  pal('#b39a60','#c1a86d','#cdb57a','#d7c086','#e0cb93','#e9d6a2'),
  schnee:  pal('#c6d3e2','#d4dfec','#e0e9f3','#eaf1f8','#f5f9fd'),
  kaktus:  pal('#1c4418','#27581f','#326c27','#3e7f30','#4c923b'),
  kohle:   pal('#0f0f11','#1d1d21','#2d2e33','#44454d','#6c6e7a'),
  eisenerz:pal('#6a4630','#946446','#bd865e','#d8a582','#edc9a6'),
  golderz: pal('#76560b','#ae820f','#dcab1f','#f3cf46','#fff09c'),
  diaerz:  pal('#0e5b5c','#158688','#2bb5b3','#5fdcd8','#c6fff8'),
  ofen:    pal('#48494e','#56575c','#64656a','#727378','#818287','#909196'),
};

/* ── Wiederverwendbare Maler ───────────────────────────────────────── */
function malStein(p, s, P = PAL.stein){
  // flache, leicht waagerechte Schlieren, dazu feine Körnung
  p.fuell((x, y) => .62*fbm(x, y, 2, 5, s, 3) + .38*fbm(x, y, 8, 8, s+50, 2), P, [5,14,28,29,17,7], .55);
  // ein paar Haarrisse im dunkelsten Ton
  for(let i = 0; i < 3; i++){
    const x = (p.r()*TS)|0, y = (p.r()*TS)|0;
    p.weg(x, y, 4 + (p.r()*6|0), p.r() < .5 ? 1 : -1, 0, P[0], 255, .45);
  }
  // helle Einschlüsse mit Schlagschatten
  for(let i = 0; i < 5; i++){
    const x = (p.r()*TS)|0, y = (p.r()*TS)|0;
    p.put(x, y, P[P.length-1]); p.put(x+1, y+1, P[1]);
  }
}
function malErde(p, s){
  const P = PAL.erde;
  p.fuell((x, y) => .7*fbm(x, y, 4, 4, s, 3) + .3*vnoise(x, y, 16, 16, s+9), P, [5,14,30,30,15,6], .6);
  // Kiesel: hell mit dunkler Unterkante
  for(let i = 0; i < 7; i++){
    const x = (p.r()*TS)|0, y = (p.r()*TS)|0, g = p.r() < .5;
    const c = g ? [138,124,108] : [150,112,78];
    p.put(x, y, c); if(p.r() < .6) p.put(x+1, y, hell(c, .9));
    p.put(x, y+1, P[0]); p.put(x+1, y+1, P[0]);
  }
  // dunkle Krümel
  for(let i = 0; i < 10; i++) p.put(p.r()*TS, p.r()*TS, P[0]);
}
function malGrasOben(p, s){
  const P = PAL.gras;
  p.fuell((x, y) => .65*fbm(x, y, 4, 4, s, 3) + .35*vnoise(x, y, 16, 16, s+5), P, [6,16,28,27,16,7], .7);
  // Halme: kurze Striche, oben heller als unten
  for(let i = 0; i < 90; i++){
    const x = p.r()*TS, y = p.r()*TS, l = 2 + (p.r()*2|0);
    const hi = 3 + (p.r()*3|0);
    const sch = p.r() < .5 ? 0 : (p.r() < .5 ? 1 : -1);
    for(let k = 0; k < l; k++) p.put(x + (k === l-1 ? sch : 0), y - k, P[Math.min(5, hi - (l-1-k) + (k === l-1 ? 1 : 0))]);
    p.put(x, y + 1, P[1]);
  }
}
function malBretter(p, s, P = PAL.brett, fugen = true){
  for(let b = 0; b < 4; b++){
    const ton = (h2(b, 1, s) - .5)*.18;
    const stoss = (b*13 + 5 + (h2(b, 2, s)*6|0)) % TS;
    for(let yy = 0; yy < 8; yy++){
      const y = b*8 + yy;
      for(let x = 0; x < TS; x++){
        let v = .55 + ton + (fbm(x, y, 2, 16, s + b*31, 3) - .5)*.9;
        if(yy === 0) v += .22;               // Lichtkante oben
        if(yy === 6) v -= .12;
        let c;
        if(yy === 7) c = P[0];                // Fuge
        else if(fugen && x === stoss) c = P[0];
        else if(fugen && x === (stoss + 1) % TS) c = P[Math.min(P.length-1, 4)];
        else { p.quant(x, y, v, P, .55); continue; }
        p.put(x, y, c);
      }
    }
    // Nagelköpfe neben dem Stoß
    if(fugen){ p.put(stoss - 2, b*8 + 2, P[0]); p.put(stoss - 2, b*8 + 4, P[0]); p.put(stoss + 3, b*8 + 3, P[0]); }
  }
}
function malRinde(p, s){
  const P = PAL.rinde;
  const rippe = x => .5 + .5*Math.sin((x/TS)*TAU*5 + vnoise(x, 0, 8, 1, s+3)*5);
  p.fuell((x, y) => .5*rippe(x) + .5*fbm(x, y, 8, 2, s, 3), P, [8,16,26,26,17,7], .5);
  // tiefe Längsrisse
  for(let i = 0; i < 6; i++){
    let x = (p.r()*TS)|0; const y0 = (p.r()*TS)|0, l = 6 + (p.r()*14|0);
    for(let k = 0; k < l; k++){ p.put(x, y0 + k, P[0]); p.put(x + 1, y0 + k, P[1]); if(p.r() < .18) x += p.r() < .5 ? -1 : 1; }
  }
}
/** Zellen mit Fase: helle Kante oben links, Schatten unten rechts */
function malZellen(p, s, nx, ny, farbeFn, fuge, fugenBreite = 1.3, fase = 3.2, dith = .5){
  for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
    const z = zellen(x, y, nx, ny, s);
    const kante = z.d2 - z.d1;
    if(kante < fugenBreite){ p.put(x, y, fuge); continue; }
    const dx = x + .5 - z.px, dy = y + .5 - z.py, l = Math.hypot(dx, dy) || 1;
    const nahe = 1 - clamp((kante - fugenBreite)/fase, 0, 1);
    const licht = (-dx - dy)/l*.7071;
    const r = farbeFn(z, x, y);            // { P, v }
    p.quant(x, y, r.v + licht*(.18 + .34*nahe) + (vnoise(x, y, 16, 16, s + 77) - .5)*.12, r.P, dith);
  }
}
/** Erzklumpen auf Stein */
function malErz(p, s, P, haufen = 4){
  malStein(p, s);
  for(let h = 0; h < haufen; h++){
    const cx = p.r()*TS, cy = p.r()*TS;
    const n = 3 + (p.r()*3|0);
    for(let k = 0; k < n; k++){
      const bx = Math.round(cx + (p.r() - .5)*9), by = Math.round(cy + (p.r() - .5)*9);
      const w = 2 + (p.r()*2|0), hh = 2 + (p.r()*2|0);
      for(let yy = -1; yy <= hh; yy++) for(let xx = -1; xx <= w; xx++){
        const rand = xx < 0 || yy < 0 || xx >= w || yy >= hh;
        const ecke = (xx < 0 || xx >= w) && (yy < 0 || yy >= hh);
        if(ecke) continue;
        if(rand){ if(yy >= hh || xx >= w) p.put(bx + xx, by + yy, P[0]); continue; }
        const i = (xx === 0 && yy === 0) ? 4 : (xx === w-1 || yy === hh-1 ? 1 : (p.r() < .5 ? 2 : 3));
        p.put(bx + xx, by + yy, P[i]);
      }
    }
  }
}
/** Metallplatte für Speicherblöcke */
function malPlatte(p, P, s){
  for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
    let v = .5 + (fbm(x, y, 1, 16, s, 2) - .5)*.35;
    const r = Math.min(x, y, TS-1-x, TS-1-y);
    if(r === 0) { p.put(x, y, P[x === 0 || y === 0 ? 3 : 0]); continue; }
    if(r === 1) v += (x === 1 || y === 1) ? .35 : -.35;
    if(r === 5 || r === 6){ v += (Math.min(x, y) === r) ? -.28 : .2; }
    p.quant(x, y, v, P, .6);
  }
  for(const [x, y] of [[3,3],[27,3],[3,27],[27,27]]){ p.rect(x, y, 2, 2, P[4]); p.put(x+1, y+1, P[1]); p.put(x+2, y+2, P[0]); }
}

/* ── Sprites: Formen auf Lagen, dann Kanten-Schattierung und Umriss ── */
class Skizze{
  constructor(p){ this.p = p; this.lagen = []; }
  lage(P, o = {}){ const L = Object.assign({ m: new Uint8Array(TS*TS), P, glanz: [], muster: null, kante: false }, o); this.lagen.push(L); return L; }
  static M(L, x, y){ return x >= 0 && y >= 0 && x < TS && y < TS && L.m[y*TS + x] === 1; }
  punkt(L, x, y, an = 1){ x |= 0; y |= 0; if(x >= 0 && y >= 0 && x < TS && y < TS) L.m[y*TS + x] = an; }
  rechteck(L, x, y, w, h){ for(let j = y; j < y+h; j++) for(let i = x; i < x+w; i++) this.punkt(L, i, j); }
  oval(L, cx, cy, rx, ry, an = 1){
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const dx = (x + .5 - cx)/rx, dy = (y + .5 - cy)/ry;
      if(dx*dx + dy*dy <= 1) this.punkt(L, x, y, an);
    }
  }
  poly(L, pts, an = 1){
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const px = x + .5, py = y + .5; let inn = false;
      for(let i = 0, j = pts.length-1; i < pts.length; j = i++){
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if(((yi > py) !== (yj > py)) && px < (xj - xi)*(py - yi)/(yj - yi) + xi) inn = !inn;
      }
      if(inn) this.punkt(L, x, y, an);
    }
  }
  /** Strich entlang einer Punktfolge, Radius von r0 nach r1 */
  strich(L, pts, r0, r1 = r0, an = 1){
    const seg = []; let ges = 0;
    for(let i = 0; i < pts.length-1; i++){ const l = Math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]); seg.push([ges, l]); ges += l; }
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const px = x + .5, py = y + .5;
      for(let i = 0; i < seg.length; i++){
        const [ax, ay] = pts[i], [bx, by] = pts[i+1], [s0, l] = seg[i];
        const t = l ? clamp(((px-ax)*(bx-ax) + (py-ay)*(by-ay))/(l*l), 0, 1) : 0;
        const d = Math.hypot(px - (ax + (bx-ax)*t), py - (ay + (by-ay)*t));
        const r = lerp(r0, r1, ges ? (s0 + t*l)/ges : 0);
        if(d <= r){ this.punkt(L, x, y, an); break; }
      }
    }
  }
  loesch(L, fn){ for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++) if(fn(x, y)) L.m[y*TS + x] = 0; }
  fertig(umriss = false){
    const p = this.p;
    const wer = new Int8Array(TS*TS).fill(-1);
    this.lagen.forEach((L, li) => {
      const M = (x, y) => Skizze.M(L, x, y);
      for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
        if(!M(x, y)) continue;
        let i = 2;
        if(!M(x-1, y) || !M(x, y-1)) i = 3;
        else if(!M(x+1, y) || !M(x, y+1)) i = 1;
        else if(!M(x+1, y+1)) i = 1;
        if(L.muster) i = clamp(i + L.muster(x, y, i), 1, L.P.length-1);
        p.put(x, y, L.P[i]); wer[y*TS + x] = li;
      }
      // Trennlinie gegen darunterliegende Lagen
      if(L.kante) for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
        if(M(x, y) || wer[y*TS + x] < 0 || wer[y*TS + x] === li) continue;
        if(M(x-1, y) || M(x+1, y) || M(x, y-1) || M(x, y+1)) p.put(x, y, L.P[1]);
      }
      for(const [x, y, k] of L.glanz) if(M(x, y)) p.put(x, y, L.P[k !== undefined ? k : L.P.length-1]);
    });
    if(!umriss) return;
    const d = p.d, neu = [];
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      if(d[(y*TS + x)*4 + 3]) continue;
      let q = -1;
      for(const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const xx = x + dx, yy = y + dy;
        if(xx < 0 || yy < 0 || xx >= TS || yy >= TS) continue;
        if(wer[yy*TS + xx] >= 0){ q = wer[yy*TS + xx]; break; }
      }
      if(q >= 0) neu.push([x, y, this.lagen[q].P[0]]);
    }
    for(const [x, y, c] of neu) p.put(x, y, c);
  }
}
function sprite(name, fn){ return addTex(name, p => { const S = new Skizze(p); fn(S, p); S.fertig(); }); }

/* ── Die Welt ──────────────────────────────────────────────────────── */
function buildTextures(){
  /* — Böden und Gestein — */
  addTex('stone', p => malStein(p, 11));
  addTex('cobble', p => {
    const P = PAL.stein;
    malZellen(p, 21, 4, 4, z => ({ P, v: .3 + z.zufall*.45 }), PAL.fuge[0], 1.25, 3.4);
    // Moos- und Schmutzkörnchen in den Fugen
    for(let i = 0; i < 14; i++) p.tone(p.r()*TS, p.r()*TS, .82);
  });
  addTex('dirt', p => malErde(p, 31));
  addTex('grass_top', p => malGrasOben(p, 41));
  addTex('grass_side', p => {
    malErde(p, 31);
    const P = PAL.gras;
    for(let x = 0; x < TS; x++){
      let tief = 6 + Math.round((vnoise(x, 0, 8, 1, 43) - .5)*4);
      if(h2(x, 5, 44) < .22) tief += 2 + (h2(x, 6, 44)*4|0);    // herabhängende Halme
      for(let y = 0; y < tief; y++){
        let i = y === 0 ? 5 : (y < 2 ? 4 : (y >= tief-1 ? 1 : (y >= tief-2 ? 2 : 3)));
        if(h2(x, y, 45) < .18) i = Math.max(1, i - 1);
        p.put(x, y, P[i]);
      }
      p.tone(x, tief, .72);                                          // Schatten unter der Grasnarbe
    }
  });
  addTex('sand', p => {
    const P = PAL.sand;
    p.fuell((x, y) => .6*fbm(x, y, 8, 8, 51, 2) + .4*vnoise(x, y, 16, 16, 52), P, [4,13,31,31,15,6], .9);
    for(let i = 0; i < 12; i++) p.put(p.r()*TS, p.r()*TS, P[0]);
    for(let i = 0; i < 8; i++) p.put(p.r()*TS, p.r()*TS, [250,244,222]);
  });
  addTex('gravel', p => {
    const G = [PAL.kies, pal('#4a4038','#5c5047','#6f6157','#827367','#958578','#a8988b'), PAL.stein];
    malZellen(p, 61, 6, 6, z => ({ P: G[(z.zufall*3)|0], v: .25 + h2(z.id, 9, 61)*.5 }), [52,48,45], 1.0, 2.2);
  });
  addTex('bedrock', p => {
    const P = PAL.urstein;
    malZellen(p, 71, 5, 5, z => ({ P, v: .15 + z.zufall*.75 }), [10,10,12], 1.1, 2.6, .7);
  });
  addTex('sandstone', p => {
    const P = PAL.sandst;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      let v = .45 + (fbm(x, y, 1, 8, 81, 3) - .5)*.8;
      if(y < 4) v = .78 + (vnoise(x, y, 8, 8, 82) - .5)*.3;           // Kappe
      if(y === 3) v = .28;
      if(y === 4) v -= .2;
      if(y > 27) v = .3 + (vnoise(x, y, 8, 8, 83) - .5)*.3;           // Fuß
      if(y === 28) v = .88;
      if(y === 15 || y === 22) v -= .22;                               // Schichtlinien
      p.quant(x, y, v, P, .55);
    }
  });
  addTex('sandstone_top', p => {
    const P = PAL.sandst;
    p.fuell((x, y) => fbm(x, y, 4, 4, 85, 3), P, [3,12,30,32,17,6], .8);
    for(let i = 0; i < 10; i++) p.put(p.r()*TS, p.r()*TS, P[0]);
  });
  addTex('snow', p => {
    const P = PAL.schnee;
    p.fuell((x, y) => fbm(x, y, 4, 4, 91, 3), P, [6,18,34,30,12], .8);
    for(let i = 0; i < 9; i++) p.put(p.r()*TS, p.r()*TS, [255,255,255]);
  });
  addTex('stonebrick', p => {
    const P = PAL.stein;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const reihe = y >> 3, yy = y & 7, off = (reihe & 1) ? 8 : 0, xx = (x + off) & 15;
      if(yy === 7 || xx === 15){ p.put(x, y, PAL.fuge[0]); continue; }
      const stein = reihe*2 + (((x + off) >> 4) & 1);
      let v = .42 + (h2(stein, 1, 99) - .5)*.2 + (fbm(x, y, 8, 8, 98, 2) - .5)*.35;
      if(yy === 0 || xx === 0) v += .3;
      if(yy === 6 || xx === 14) v -= .3;
      p.quant(x, y, v, P, .5);
    }
    // zwei Steine haben einen Sprung
    p.weg(5, 18, 7, 1, 1, P[0], 255, .3); p.weg(21, 3, 5, 1, 0, P[0], 255, .5);
  });

  /* — Holz und Laub — */
  addTex('log_side', p => malRinde(p, 101));
  addTex('log_top', p => {
    const R = PAL.rinde, K = PAL.kern;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const dx = x + .5 - 16, dy = y + .5 - 16;
      const q = Math.max(Math.abs(dx), Math.abs(dy));
      if(q > 13.2){ p.quant(x, y, .35 + (vnoise(x, y, 16, 16, 102) - .5)*.7 + (q > 15 ? -.2 : .1), R, .6); continue; }
      const r = Math.hypot(dx, dy) + (fbm(x, y, 4, 4, 103, 2) - .5)*2.2;
      const ring = .5 + .5*Math.cos(r*1.9);
      let v = .35 + ring*.45 + (vnoise(x, y, 16, 16, 104) - .5)*.15;
      if(q > 12.2) v -= .3;
      if(r < 1.6) v = .08;
      p.quant(x, y, v, K, .45);
    }
  });
  addTex('planks', p => malBretter(p, 111));
  addTex('leaves', p => {
    const P = PAL.laub;
    p.fuell((x, y) => fbm(x, y, 4, 4, 121, 2), [P[0], P[1], P[2]], [30,45,25], .6);
    // Blätter: kleine Ovale, oben links hell, unten rechts dunkel
    for(let i = 0; i < 120; i++){
      const cx = p.r()*TS, cy = p.r()*TS, t = 2 + (p.r()*3|0);
      const w = p.r() < .5;
      for(let yy = -1; yy <= 1; yy++) for(let xx = -1; xx <= (w ? 2 : 1); xx++){
        if(Math.abs(xx) + Math.abs(yy) > 2) continue;
        const i2 = (xx < 0 || yy < 0) ? t+1 : ((xx > 0 && yy > 0) ? t-1 : t);
        p.put(cx + xx, cy + yy, P[clamp(i2, 1, 5)]);
      }
    }
    // Löcher, durch die man den Himmel sieht
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++)
      if(fbm(x, y, 8, 8, 125, 2) < .31 && h2(x, y, 126) < .75) p.put(x, y, [0,0,0], 0);
  });
  addTex('glass', p => {
    p.klar();
    const R = [214,236,244], D = [140,178,194];
    for(let i = 0; i < TS; i++){ p.put(i, 0, R, 235); p.put(0, i, R, 235); p.put(i, TS-1, D, 235); p.put(TS-1, i, D, 235); }
    for(let i = 1; i < TS-1; i++){ p.put(i, 1, R, 120); p.put(1, i, R, 120); }
    // Glanzlinien schräg
    for(let k = 0; k < 7; k++){ p.put(5 + k, 12 - k, [240,250,255], 190); p.put(6 + k, 12 - k, [240,250,255], 120); }
    for(let k = 0; k < 4; k++) p.put(9 + k, 14 - k, [240,250,255], 150);
    for(let k = 0; k < 5; k++) p.put(20 + k, 27 - k, [240,250,255], 140);
  });
  for(let f = 0; f < WATER_FRAMES; f++){
    addTex('water' + f, p => {
      const P = PAL.wasser, t = f/WATER_FRAMES, sh = t*TS;
      for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
        const a = fbm(x + sh, y, 4, 4, 131, 2);
        const b = fbm(x - sh*.5, y + sh, 4, 4, 137, 2);      // läuft genau eine Kachel pro Umlauf
        const w = Math.sin((x + y*.5)/TS*TAU*2 + t*TAU);
        let v = .18 + .5*(a*.55 + b*.45) + w*.08;
        if(a > .64 && b > .52) v += .3;                          // Schaumkronen
        p.quant(x, y, v, P, .5, 188);
      }
    }, 1300 + f);
  }
  addTex('cactus_side', p => {
    const P = PAL.kaktus;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const rip = (x - 1) % 6;
      let v = .55 + (fbm(x, y, 4, 8, 141, 2) - .5)*.4;
      if(rip === 0) v = .12; else if(rip === 1) v += .25; else if(rip === 4) v -= .12;
      if(x === 0 || x === TS-1) v = .02;
      p.quant(x, y, v, P, .4);
    }
    for(let y = 3; y < TS; y += 6) for(let x = 1; x < TS; x += 6){
      const yy = y + ((x/6|0) % 2)*3;
      p.put(x, yy, [232,226,168]); p.put(x, yy + 1, P[0]);
    }
  });
  addTex('cactus_top', p => {
    const P = PAL.kaktus;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const dx = x + .5 - 16, dy = y + .5 - 16, r = Math.hypot(dx, dy), w = Math.atan2(dy, dx);
      let v = .45 + .25*Math.cos(w*8) * clamp(r/12, 0, 1) + (vnoise(x, y, 8, 8, 143) - .5)*.2;
      if(Math.min(x, y, TS-1-x, TS-1-y) < 1) v = .02;
      if(r < 4) v = .85 - r*.08;
      p.quant(x, y, v, P, .4);
    }
  });

  /* — Erze — */
  addTex('coal_ore', p => malErz(p, 151, PAL.kohle, 4));
  addTex('iron_ore', p => malErz(p, 152, PAL.eisenerz, 4));
  addTex('gold_ore', p => malErz(p, 153, PAL.golderz, 3));
  addTex('diamond_ore', p => malErz(p, 154, PAL.diaerz, 3));

  /* — Speicherblöcke — */
  addTex('iron_block', p => malPlatte(p, pal('#6f7076','#9b9ca3','#c3c4ca','#dfe0e5','#f7f7fa'), 161));
  addTex('gold_block', p => malPlatte(p, pal('#8a6408','#c49414','#eabd2a','#f8d955','#fff4a8'), 162));
  addTex('diamond_block', p => {
    const P = pal('#127072','#1f9d9b','#3cc7c2','#7ae6df','#d2fffa');
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const u = (x + y) & 15, v2 = (x - y + 64) & 15;
      let v = .55 + (fbm(x, y, 4, 4, 165, 2) - .5)*.3;
      if(u === 0 || v2 === 0) v = .18;
      else if(u === 1 || v2 === 1) v += .3;
      if(Math.min(x, y, TS-1-x, TS-1-y) === 0) v = x === 0 || y === 0 ? .8 : .05;
      p.quant(x, y, v, P, .5);
    }
  });

  /* — Werkbank, Ofen, Truhe — */
  addTex('craft_top', p => {
    malBretter(p, 171, PAL.brett, false);
    const D = pal('#3a2915','#4c3620')[0], H = [196,160,104];
    for(let i = 0; i < TS; i++) for(const k of [0, 1, TS-2, TS-1]){ p.put(i, k, D); p.put(k, i, D); }
    for(const g of [11, 21]) for(let i = 2; i < TS-2; i++){ p.put(g, i, D); p.put(i, g, D); p.put(g+1, i, H); p.put(i, g+1, H); }
    for(let i = 2; i < TS-2; i++){ p.put(i, 2, H); p.put(2, i, H); }
  });
  addTex('craft_side', p => {
    malBretter(p, 172);
    const R = PAL.rinde;
    for(let y = 0; y < 6; y++) for(let x = 0; x < TS; x++) p.quant(x, y, y === 0 ? .9 : (y === 5 ? .05 : .45 + (vnoise(x, y, 8, 4, 173) - .5)*.4), R, .5);
    // Säge
    const Ms = [150,152,160], Mh = [205,208,214], Md = [74,76,82];
    for(let x = 4; x < 15; x++){ p.put(x, 10, Mh); p.put(x, 11, Ms); p.put(x, 12, Ms); if(x % 2) p.put(x, 13, Md); }
    p.rect(15, 9, 3, 5, R[3]); p.put(15, 9, R[5]);
    // Hammer
    p.rect(21, 9, 7, 3, Ms); for(let x = 21; x < 28; x++) p.put(x, 9, Mh); p.rect(21, 12, 7, 1, Md);
    for(let y = 12; y < 24; y++){ p.put(24, y, R[4]); p.put(25, y, R[2]); }
  });
  addTex('furn_side', p => {
    const P = PAL.ofen;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const reihe = y >> 4, yy = y & 15, off = reihe ? 12 : 0, xx = (x + off) % TS, sx = xx & 15;
      if(yy === 15 || sx === 15){ p.put(x, y, PAL.fuge[0]); continue; }
      let v = .45 + (fbm(x, y, 8, 8, 181, 2) - .5)*.4 + (h2(reihe*2 + (xx >> 4), 1, 182) - .5)*.2;
      if(yy === 0 || sx === 0) v += .3; if(yy === 14 || sx === 14) v -= .3;
      p.quant(x, y, v, P, .5);
    }
  });
  addTex('furn_top', p => {
    const P = PAL.ofen;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const r = Math.min(x, y, TS-1-x, TS-1-y);
      let v = .5 + (fbm(x, y, 8, 8, 183, 2) - .5)*.35;
      if(r === 0) v = (x === 0 || y === 0) ? .85 : .05;
      if(r >= 9 && r <= 10) v = Math.min(x, y) === r ? .08 : .75;
      if(r > 10) v = .2 + (h2(x, y, 184) - .5)*.2;
      p.quant(x, y, v, P, .5);
    }
  });
  const ofenFront = (lit) => p => {
    const P = PAL.ofen;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const r = Math.min(x, y, TS-1-x, TS-1-y);
      let v = .5 + (fbm(x, y, 8, 8, 185, 2) - .5)*.35;
      if(r === 0) v = (x === 0 || y === 0) ? .85 : .05;
      if(y === 7) v = .08; if(y === 8) v += .25;
      p.quant(x, y, v, P, .5);
    }
    // Feuerloch mit Rundbogen
    const inn = (x, y) => x >= 7 && x <= 24 && y >= 13 && y <= 27 && !(y < 16 && Math.hypot(x - 15.5, y - 16.5) > 9);
    for(let y = 11; y < 29; y++) for(let x = 5; x < 27; x++){
      if(!inn(x, y)) { if(inn(x-1, y) || inn(x, y-1)) p.put(x, y, P[5]); else if(inn(x+1, y) || inn(x, y+1)) p.put(x, y, P[0]); continue; }
      if(!lit){ p.put(x, y, y > 23 ? [26,26,29] : [15,15,17]); continue; }
      const glut = clamp((y - 13)/14, 0, 1);
      const zunge = Math.sin(x*1.3) * 2.2 + Math.sin(x*.55 + 1)*1.6;
      const f = clamp((y - 16 + zunge)/9, 0, 1);
      const c = f > .78 ? [255,236,150] : f > .5 ? [255,184,64] : f > .22 ? [226,110,28] : [70,28,14];
      p.put(x, y, mischen([40,18,10], c, .35 + glut*.65));
    }
    // Gitter
    for(let x = 8; x < 25; x += 4) for(let y = 24; y < 28; y++) p.put(x, y, lit ? [120,60,30] : [58,58,62]);
    for(let x = 7; x < 25; x++) p.put(x, 24, lit ? [150,80,40] : [70,70,76]);
  };
  addTex('furn_front', ofenFront(false));
  addTex('furn_lit', ofenFront(true));

  const truheHolz = pal('#4a3017','#5b3b1c','#6d4722','#7f5429','#916131','#a26f3a');
  const truhe = (vorn, oben) => p => {
    malBretter(p, oben ? 191 : 192, truheHolz, !oben);
    const D = [44,28,12], H = [170,120,66];
    for(let i = 0; i < TS; i++) for(const k of [0, TS-1]){ p.put(i, k, D); p.put(k, i, D); }
    for(let i = 1; i < TS-1; i++){ p.put(i, 1, H); p.put(1, i, H); }
    if(!oben){ for(let x = 1; x < TS-1; x++){ p.put(x, 11, D); p.put(x, 12, H); } }
    if(vorn){
      const E = pal('#3c3d42','#6c6d74','#a4a6ad','#d6d8dd');
      for(let y = 8; y < 17; y++) for(let x = 13; x < 19; x++){
        const rand = x === 13 || x === 18 || y === 8 || y === 16;
        p.put(x, y, rand ? E[0] : (x === 14 || y === 9 ? E[3] : E[2]));
      }
      p.rect(15, 12, 2, 3, E[0]); p.put(15, 12, E[1]);
    }
  };
  addTex('chest_top', truhe(false, true));
  addTex('chest_side', truhe(false, false));
  addTex('chest_front', truhe(true, false));

  /* — Bett — */
  addTex('bed_top', p => {
    const Rot = pal('#5e1418','#7c1c21','#982429','#b22f33','#c8403f'), Kissen = pal('#b9b2a2','#cfc8b8','#e2dccd','#f1ecdf');
    const H = PAL.brett;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const r = Math.min(x, TS-1-x);
      if(r < 2 || y < 1 || y > TS-2){ p.quant(x, y, r === 0 || y === 0 || y === TS-1 ? .1 : .6, H, .3); continue; }
      if(y < 11){                                                         // Kissen
        const kr = Math.min(x - 3, 28 - x, y - 2, 9 - y);
        if(kr < 0){ p.put(x, y, Kissen[0]); continue; }
        p.quant(x, y, .45 + (kr === 0 ? (x < 16 && y < 6 ? .35 : -.3) : .1) + (vnoise(x, y, 8, 8, 201) - .5)*.2, Kissen, .5);
        continue;
      }
      let v = .5 + Math.sin((x + y*.3)*.7)*.08 + (fbm(x, y, 4, 8, 202, 2) - .5)*.3;   // Decke mit Falten
      if(y === 11) v = .95; if(y === 12) v = .75;
      if(y === 13 || y === TS-3) v = .1;
      p.quant(x, y, v, Rot, .5);
    }
  });
  addTex('bed_side', p => {
    // Die Seite ist nur 9/16 hoch und zeigt die unteren 18 Zeilen:
    // Decke 14…19, Naht 20, Rahmen 21…26, Beine 27…31.
    const Rot = pal('#5e1418','#7c1c21','#982429','#b22f33','#c8403f'), H = PAL.brett;
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      if(y < 20){ p.quant(x, y, .55 + (y === 14 ? .4 : 0) + (y === 19 ? -.3 : 0) + (vnoise(x, y, 8, 4, 203) - .5)*.25, Rot, .5); continue; }
      if(y === 20){ p.put(x, y, Rot[0]); continue; }
      if(y < 27){ p.quant(x, y, .5 + (y === 21 ? .35 : 0) + (y === 26 ? -.35 : 0) + (fbm(x, y, 2, 8, 204, 2) - .5)*.4, H, .5); continue; }
      const bein = x < 4 || x > 27;
      if(bein) p.quant(x, y, .35 + (x === 0 || x === 28 ? .3 : 0), H, .3); else p.put(x, y, [0,0,0], 0);
    }
  });

  /* — Acker und Weizen — */
  addTex('farmland', p => {
    const P = pal('#2f1f13','#3c2819','#4a321f','#583c26','#66462d','#72503a');
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const f = (y + 1) & 7;
      let v = .5 + (fbm(x, y, 8, 8, 211, 2) - .5)*.45;
      if(f === 0) v = .06; else if(f === 1) v -= .25; else if(f === 4 || f === 5) v += .28;
      p.quant(x, y, v, P, .6);
    }
  });
  const halm = (p, x, h, farbe, spitze, neig) => {
    let xx = x;
    for(let k = 0; k < h; k++){
      const y = TS - 1 - k;
      if(k > 2 && h2(x, k, 219) < .22) xx += neig;
      p.set(xx, y, k > h - 3 && spitze ? spitze : hell(farbe, .8 + .35*k/h));
    }
    return xx;
  };
  const weizen = (stufe) => p => {
    p.klar();
    const gruen = [74,140,44], gelbgruen = [150,164,58], gold = [206,164,62];
    const farbe = [gruen, gruen, gelbgruen, gold][stufe];
    const hoehe = [7, 14, 22, 27][stufe];
    const xs = [3, 6, 9, 12, 16, 19, 22, 25, 28];
    xs.forEach((x0, n) => {
      const h = hoehe - (h2(n, stufe, 220)*5|0);
      const neig = n % 2 ? 1 : -1;
      const x = halm(p, x0, h, farbe, stufe < 2 ? [124,190,80] : null, neig);
      if(stufe >= 2){                                                    // Ähren
        const E = stufe === 3 ? pal('#8a6420','#b88a2e','#dcb04a','#f2d27a') : pal('#667a2a','#879a38','#a8b64e','#c8d070');
        for(let k = 0; k < 6; k++){
          const y = TS - h - 1 + k;
          p.set(x - 1, y, E[k % 2 ? 1 : 2]); p.set(x, y, E[k === 0 ? 3 : 2]); p.set(x + 1, y, E[k % 2 ? 2 : 0]);
        }
        p.set(x, TS - h - 2, E[3]);
      }
      if(stufe >= 1 && n % 3 === 0){                                     // Blatt
        const y = TS - 1 - ((h*.4)|0);
        for(let k = 1; k < 4; k++) p.set(x + k*neig, y - (k >> 1), hell(farbe, 1.05));
      }
    });
  };
  for(let s = 0; s < 4; s++) addTex('wheat' + s, weizen(s));

  /* — Leiter und Tür — */
  addTex('ladder', p => {
    p.klar();
    const H = PAL.brett;
    for(let y = 0; y < TS; y++) for(const x0 of [4, 24]){
      for(let k = 0; k < 4; k++) p.put(x0 + k, y, H[k === 0 ? 5 : k === 3 ? 1 : 3 - ((h2(y, x0, 231)*2)|0) + 1]);
    }
    for(const y0 of [3, 11, 19, 27]) for(let x = 8; x < 24; x++){
      p.put(x, y0, H[4]); p.put(x, y0 + 1, H[3 - ((h2(x, y0, 232)*2)|0) + 1]); p.put(x, y0 + 2, H[1]);
      if(x === 8) p.put(x, y0 + 3, H[0]);
    }
  });
  const tuer = (oben) => p => {
    const H = pal('#5b3e1f','#6b4a26','#7b562d','#8b6234','#9b6e3c','#ab7b45'), D = [42,28,12];
    for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
      const r = Math.min(x, TS-1-x, oben ? y : 99, oben ? 99 : TS-1-y);
      if(r < 3){ p.quant(x, y, r === 0 ? .05 : (r === 1 ? .8 : .45), H, .3); continue; }
      const brett = ((x - 3)/9)|0, bx = (x - 3) % 9;
      let v = .45 + (fbm(x, y, 2, 16, 241 + brett, 3) - .5)*.8;
      if(bx === 0) v = .08; else if(bx === 1) v += .25;
      p.quant(x, y, v, H, .5);
    }
    if(oben){                                                            // zwei Fenster
      for(const x0 of [7, 18]) for(let y = 6; y < 17; y++) for(let x = x0; x < x0 + 7; x++){
        const rand = x === x0 || x === x0 + 6 || y === 6 || y === 16;
        if(rand) p.put(x, y, D); else p.put(x, y, [0,0,0], 0);
      }
      for(let x = 5; x < 27; x++){ p.put(x, 23, D); p.put(x, 24, H[5]); }
    } else {
      const E = pal('#2a2b30','#5c5e66','#9ea1aa','#d4d6dc');
      for(let y = 4; y < 10; y++) for(let x = 23; x < 26; x++) p.put(x, y, y === 4 ? E[3] : (x === 25 || y === 9 ? E[0] : E[2]));
      for(let x = 5; x < 27; x++){ p.put(x, 16, D); p.put(x, 17, H[5]); }
      for(const y0 of [6, 22]) for(let x = 0; x < 6; x++){ p.put(x, y0, E[2]); p.put(x, y0 + 1, E[1]); }
    }
  };
  addTex('door_top', tuer(true));
  addTex('door_bottom', tuer(false));

  /* — Fackel, Gras, Blumen — */
  sprite('torch', S => {
    const holz = S.lage(pal('#2e1d0c','#5a3a1a','#7c5226','#9c6b34','#b98545'));
    S.rechteck(holz, 14, 12, 4, 20);
    holz.muster = (x, y) => (x === 14 ? 1 : x === 17 ? -1 : 0);
    const kopf = S.lage(pal('#4a2e14','#3a2410','#2a1a0c','#5a3a1a','#6a4420'));
    S.rechteck(kopf, 13, 11, 6, 3);
    const flamme = S.lage(pal('#8a3a08','#e0701a','#ffa82e','#ffd35a','#fff4c0'));
    S.poly(flamme, [[16,1],[20,6],[20,10],[18,12],[14,12],[12,10],[12,6]]);
    flamme.muster = (x, y) => (y > 9 ? -1 : (y < 5 ? 1 : 0));
    flamme.glanz = [[15,7,4],[16,7,4],[15,8,4],[16,8,4],[16,6,4],[15,9,3],[16,9,3]];
  });
  addTex('tallgrass', p => {
    p.klar();
    const P = PAL.gras;
    for(let k = 0; k < 13; k++){
      let x = 2 + h2(k, 1, 251)*27, dx = (h2(k, 2, 251) - .5)*.5;
      const h = 9 + (h2(k, 3, 251)*17|0);
      for(let i = 0; i < h; i++){
        const y = TS - 1 - i, t = i/h;
        const c = P[clamp(Math.round(1 + t*4 + (h2(k, i, 252) - .5)), 0, 5)];
        p.set(x, y, c);
        if(i < h*.4) p.set(x + 1, y, P[Math.max(0, Math.round(t*4))]);
        x += dx + (t > .6 ? dx*1.5 : 0);
      }
    }
  });
  sprite('rose', S => {
    const stiel = S.lage(pal('#1e3d14','#2f5d1e','#3f7a27','#52963a','#6bb04c'));
    S.strich(stiel, [[16,31],[16,14]], 1);
    S.poly(stiel, [[16,24],[23,19],[21,23]]); S.poly(stiel, [[16,21],[9,17],[11,21]]);
    const blute = S.lage(pal('#5a0a0e','#9a1a1c','#c52b28','#e04a40','#f47a66'), { kante: true });
    S.oval(blute, 12.5, 9, 4.2, 4); S.oval(blute, 19.5, 9, 4.2, 4); S.oval(blute, 16, 5.5, 4.2, 3.6); S.oval(blute, 16, 12, 4.4, 3.4);
    const mitte = S.lage(pal('#140c06','#241810','#34221a','#3c2a1e','#6a5030'));
    S.oval(mitte, 16, 9, 2, 1.8);
  });
  sprite('dandelion', S => {
    const stiel = S.lage(pal('#1e3d14','#2f5d1e','#3f7a27','#52963a','#6bb04c'));
    S.strich(stiel, [[16,31],[15,16]], 1);
    S.poly(stiel, [[16,31],[9,26],[12,25],[10,23],[16,28]]); S.poly(stiel, [[16,31],[24,25],[21,25],[23,22],[16,28]]);
    const kopf = S.lage(pal('#8a6a08','#c79a10','#ecc21e','#f8dd4a','#fff39a'));
    S.oval(kopf, 15.5, 11, 6, 5.2);
    kopf.muster = (x, y) => ((x + y) % 3 === 0 ? -1 : 0);
    kopf.glanz = [[13,8],[14,8],[13,9],[17,7],[12,10,3],[18,9,3]];
  });

  /* — Bruchstufen — */
  {
    const rng = mulberry32(1337), seg = [];
    const ast = (x, y, w, n, tiefe) => {
      for(let i = 0; i < n; i++){
        const nx = x + Math.cos(w)*2.2, ny = y + Math.sin(w)*2.2;
        seg.push([x, y, nx, ny, seg.length]); x = nx; y = ny; w += (rng() - .5)*.9;
        if(tiefe < 2 && rng() < .22) ast(x, y, w + (rng() < .5 ? 1 : -1)*(.7 + rng()*.6), (n - i)*.6|0, tiefe + 1);
      }
    };
    for(let k = 0; k < 5; k++) ast(16, 16, k/5*TAU + rng()*.6, 7, 0);
    seg.sort((a, b) => Math.hypot(a[0]-16, a[1]-16) - Math.hypot(b[0]-16, b[1]-16));
    for(let s = 0; s < 8; s++){
      addTex('crack' + s, p => {
        p.klar();
        const n = Math.ceil(seg.length*(s + 1)/8);
        for(let i = 0; i < n; i++){
          const [x0, y0, x1, y1] = seg[i];
          for(let t = 0; t <= 1; t += .2){
            const x = Math.round(lerp(x0, x1, t)), y = Math.round(lerp(y0, y1, t));
            if(x < 0 || y < 0 || x >= TS || y >= TS) continue;
            p.set(x, y, [0,0,0], 210);
            if(!p.alpha(x+1, y+1)) p.set(x+1, y+1, [255,255,255], 50);
          }
        }
      }, 99 + s);
    }
  }

  /* — Gegenstände — */
  const HOLZ = pal('#2e1d0c','#5c3c1b','#7e5528','#9d6e37','#b88947');
  const MAT = {
    wood:    pal('#3a2410','#6e4d26','#8f6734','#ae8144','#c69c5a'),
    stone:   pal('#2c2d31','#5d5e64','#7c7d83','#9a9ba1','#b9babf'),
    iron:    pal('#3a3b40','#8e9097','#bfc1c7','#dfe1e5','#fbfbfd'),
    gold:    pal('#5c4006','#b98a10','#e5b726','#f8d858','#fff6b4'),
    diamond: pal('#0a4a4c','#1a9492','#33c6c0','#7ae8e0','#dcfffb'),
  };
  sprite('i_stick', S => {
    const L = S.lage(HOLZ); S.strich(L, [[7,26],[25,8]], 1.6);
    L.glanz = [[10,22],[14,18],[18,14],[22,10]];
  });
  sprite('i_coal', S => {
    const L = S.lage(PAL.kohle);
    S.poly(L, [[8,12],[13,7],[20,6],[25,10],[27,17],[23,24],[15,27],[9,23],[6,17]]);
    const facette = S.lage([PAL.kohle[1], PAL.kohle[2], PAL.kohle[3], PAL.kohle[4], [150,152,164]], { kante: true });
    S.poly(facette, [[11,11],[15,8],[19,9],[17,14],[12,15]]);
    S.poly(facette, [[20,16],[24,15],[22,21],[18,22]]);
    L.muster = (x, y) => (h2(x, y, 261) < .18 ? -1 : 0);
    facette.glanz = [[14,9],[15,9],[13,10],[21,16,3]];
  });
  const barren = (name, P) => sprite(name, S => {
    const oben = S.lage([P[1], P[2], P[3], P[4], P[4]]);
    S.poly(oben, [[5,15],[17,9],[28,13],[16,19]]);
    const vorn = S.lage(P, { kante: true }); S.poly(vorn, [[5,15],[16,19],[16,25],[5,21]]);
    const seite = S.lage([P[0], P[0], P[1], P[2], P[3]], { kante: true }); S.poly(seite, [[16,19],[28,13],[28,19],[16,25]]);
    oben.glanz = [[10,14],[11,14],[12,13],[13,13],[14,12]];
  });
  barren('i_iron', MAT.iron); barren('i_gold', MAT.gold);
  sprite('i_diamond', S => {
    const P = MAT.diamond;
    const krone = S.lage([P[0], P[2], P[3], P[4], P[4]]);
    S.poly(krone, [[10,8],[22,8],[27,13],[5,13]]);
    const bauch = S.lage(P, { kante: true }); S.poly(bauch, [[5,13],[27,13],[16,27]]);
    bauch.muster = (x, y) => (x < 16 && (x + y) % 5 === 0 ? 1 : (x > 18 ? -1 : 0));
    krone.glanz = [[11,9],[12,9],[13,9],[10,10],[11,10]];
    bauch.glanz = [[12,15,4],[13,16,4],[14,17,3]];
  });
  sprite('i_pork_raw', S => {
    const fett = S.lage(pal('#8a6a5a','#d8c0b0','#efe0d4','#fbf2ea','#ffffff'));
    S.oval(fett, 16, 16, 11, 9);
    const fleisch = S.lage(pal('#7a1e24','#b8434a','#d8676b','#ec8e8c','#f8b8b0'));
    S.oval(fleisch, 15, 15.5, 9, 7);
    fleisch.muster = (x, y) => (h2(x >> 1, y, 262) < .15 ? 1 : 0);
    const knochen = S.lage(pal('#8a826e','#cfc6ae','#e6dec8','#f6f0e0','#ffffff'));
    S.oval(knochen, 22, 12, 2.5, 2.5); S.oval(knochen, 25, 10, 2, 2);
  });
  sprite('i_pork_cook', S => {
    const rand = S.lage(pal('#3a1a08','#7a4418','#9a5a24','#b87434','#d49048'));
    S.oval(rand, 16, 16, 11, 9);
    const fleisch = S.lage(pal('#4a2410','#8a4c22','#a8622e','#c47c3c','#dc9a54'));
    S.oval(fleisch, 15, 15.5, 9, 7);
    fleisch.muster = (x, y) => ((x - y + 40) % 6 === 0 ? -1 : 0);
    const knochen = S.lage(pal('#7a705a','#c2b89c','#dcd2b8','#eee6d0','#ffffff'));
    S.oval(knochen, 22, 12, 2.5, 2.5); S.oval(knochen, 25, 10, 2, 2);
  });
  const apfel = (name, P, funkeln) => sprite(name, S => {
    const L = S.lage(P);
    S.oval(L, 12, 18, 7.5, 8); S.oval(L, 20, 18, 7.5, 8); S.oval(L, 16, 20, 9, 7.5);
    S.loesch(L, (x, y) => y < 12 && Math.abs(x + .5 - 16) < 2);
    L.glanz = [[10,14],[11,14],[10,15],[9,16,3],[12,13,3]];
    const stiel = S.lage(HOLZ); S.strich(stiel, [[16,13],[17,6]], 1);
    const blatt = S.lage(pal('#1e3d14','#2f6a1e','#3f8a27','#58a83a','#7cc452'));
    S.poly(blatt, [[18,8],[23,4],[27,6],[22,10]]);
    if(funkeln) L.glanz.push([21,16,4],[22,17,4],[20,17,4],[21,18,4],[21,15,4]);
  });
  apfel('i_apple', pal('#5a0c0c','#9e1c1a','#c83028','#e2503e','#f68a70'), false);
  apfel('i_golden_apple', MAT.gold, true);
  sprite('i_seeds', S => {
    const L = S.lage(pal('#3a3a14','#6e7426','#8e9636','#b0b64e','#d4d878'));
    for(const [x, y] of [[10,12],[17,9],[22,15],[13,19],[20,22],[9,24],[25,23]]) S.oval(L, x, y, 1.8, 2.4);
  });
  sprite('i_wheat', S => {
    const halme = S.lage(pal('#4a3810','#8a6a22','#b08a34','#cfa84a','#e8c868'));
    const fuss = [16, 29], koepfe = [[9,11],[16,8],[23,11],[12.5,15],[19.5,15]];
    for(const k of koepfe) S.strich(halme, [fuss, k], .75);
    const band = S.lage(pal('#3a220c','#7a4a1c','#9a6228','#b87c36','#d09a50'), { kante: true });
    S.rechteck(band, 13, 21, 7, 3);
    const aehren = S.lage(pal('#6a4c12','#b08624','#d8aa38','#f0cc5c','#fbe79a'), { kante: true });
    for(const [x, y] of koepfe) S.oval(aehren, x, y - 3.5, 2.1, 4.6);
    aehren.muster = (x, y) => (y % 3 === 0 ? -1 : 0);
  });
  sprite('i_bread', S => {
    const L = S.lage(pal('#4a2608','#8a4e18','#b06a24','#cc8a38','#e6ac58'));
    S.oval(L, 16, 17, 13, 8);
    L.muster = (x, y) => (y < 14 ? 1 : 0);
    const schnitt = S.lage(pal('#6a3a10','#e0bc84','#f0d6a4','#f8e6c0','#fff4dc'));
    for(const x0 of [9, 15, 21]) S.strich(schnitt, [[x0, 15],[x0 + 3, 12]], .6);
  });
  const eimer = (name, voll) => sprite(name, S => {
    const P = MAT.iron;
    const henkel = S.lage(P); S.strich(henkel, [[7,12],[9,5],[16,3],[23,5],[25,12]], .8);
    S.loesch(henkel, (x, y) => y > 11);
    const koerper = S.lage(P, { kante: true }); S.poly(koerper, [[6,11],[26,11],[23,28],[9,28]]);
    koerper.muster = (x) => (x < 11 ? 1 : x > 20 ? -1 : 0);
    const rand = S.lage([P[0], P[1], P[3], P[4], P[4]], { kante: true }); S.oval(rand, 16, 11, 10.5, 2.6);
    const innen = S.lage(voll ? PAL.wasser.slice(1) : [P[0], P[0], P[1], P[1], P[2]]); S.oval(innen, 16, 11, 8.5, 1.6);
    if(voll) innen.glanz = [[12,11],[13,11],[20,10]];
  });
  eimer('i_bucket', false); eimer('i_water_bucket', true);

  /* Werkzeuge: Stiel von links unten nach rechts oben, Kopf je Art */
  const stiel = (S, bis = [21,11]) => { const L = S.lage(HOLZ); S.strich(L, [[5,28], bis], 1.55); L.glanz = [[8,24],[12,20],[16,16]]; return L; };
  const WERKZEUG = {
    pickaxe(S, P){ stiel(S, [22,10]);
      const k = S.lage(P, { kante: true });
      S.strich(k, [[7,7],[12,4.5],[19,4.2],[24,6.5],[27.5,13],[27.8,20]], 1.2, 1.2);
      S.strich(k, [[10,5.5],[17,4],[23,6],[27,12]], 2.2);
      k.glanz = [[11,4],[12,4],[16,3],[17,3]]; },
    axe(S, P){ stiel(S, [23,9]);
      const k = S.lage(P, { kante: true });
      // Kopf quer zum Stiel, die Schneide zeigt nach links oben
      S.poly(k, [[19,8],[22,5],[26,9],[23,12]]);
      S.poly(k, [[20,7],[16,3],[11,3],[7,7],[7,12],[11,16],[16,12],[23,12]]);
      k.muster = (x, y) => (x + y < 16 ? 1 : 0);
      k.glanz = [[9,7],[10,6],[11,5],[8,9],[8,10]]; },
    shovel(S, P){ stiel(S, [19,13]);
      const k = S.lage(P, { kante: true });
      S.poly(k, [[17,11],[21,15],[28,9],[27,5],[24,3],[20,4]]);
      k.glanz = [[22,5],[23,5],[21,6],[20,7]]; },
    sword(S, P){
      const griff = S.lage(HOLZ); S.strich(griff, [[4,28],[10,22]], 1.6);
      const knauf = S.lage(P); S.oval(knauf, 4.5, 27.5, 2.2, 2.2);
      const klinge = S.lage(P, { kante: true });
      S.poly(klinge, [[10,20],[24,6],[28,4],[26,8],[12,22]]);
      klinge.muster = (x, y) => (x + y === 30 || x + y === 29 ? 1 : (x + y > 31 ? -1 : 0));
      const parier = S.lage(HOLZ.map(c => hell(c, .8)), { kante: true });
      S.strich(parier, [[6,17],[15,26]], 1.4);
      klinge.glanz = [[23,7],[24,6],[25,5],[26,4]]; },
    hoe(S, P){ stiel(S, [22,10]);
      const k = S.lage(P, { kante: true });
      S.strich(k, [[15,5],[22,5.5],[25,8]], 1.8, 1.8);
      S.poly(k, [[13,4],[17,3],[17,8],[13,8]]);
      k.glanz = [[16,4],[18,4],[19,4]]; },
  };
  for(const m of ['wood','stone','iron','gold','diamond'])
    for(const k of Object.keys(WERKZEUG)) sprite('i_' + m + '_' + k, S => WERKZEUG[k](S, MAT[m]));

  /* Rüstung */
  const RUEST = {
    helmet(S, P){
      const L = S.lage(P);
      S.poly(L, [[6,20],[6,12],[9,7],[16,5],[23,7],[26,12],[26,20],[21,20],[21,15],[11,15],[11,20]]);
      L.muster = (x, y) => (y === 13 ? -1 : 0);
      L.glanz = [[10,9],[11,8],[12,8],[13,7]]; },
    chestplate(S, P){
      const L = S.lage(P);
      S.poly(L, [[4,7],[11,5],[13,9],[19,9],[21,5],[28,7],[29,14],[24,15],[24,28],[8,28],[8,15],[3,14]]);
      L.muster = (x, y) => (x === 16 && y > 11 ? -1 : (y === 20 ? -1 : 0));
      L.glanz = [[6,8],[7,8],[10,12],[10,13],[11,17]]; },
    leggings(S, P){
      const L = S.lage(P);
      S.poly(L, [[7,5],[25,5],[26,28],[19,28],[16,13],[13,28],[6,28]]);
      L.muster = (x, y) => (y === 8 ? -1 : 0);
      L.glanz = [[9,10],[9,11],[9,12],[9,13]]; },
    boots(S, P){
      const L = S.lage(P);
      S.poly(L, [[4,11],[12,11],[12,21],[14,24],[14,27],[3,27]]);
      S.poly(L, [[18,11],[26,11],[26,21],[28,24],[28,27],[17,27]]);
      L.glanz = [[6,13],[6,14],[20,13],[20,14]]; },
  };
  for(const m of ['iron','gold','diamond'])
    for(const k of Object.keys(RUEST)) sprite('i_' + m + '_' + k, S => RUEST[k](S, MAT[m]));

  sprite('i_door', S => {
    const L = S.lage(pal('#2e1d0c','#6b4a26','#8b6234','#a57a45','#c49a60'));
    S.rechteck(L, 9, 2, 14, 28);
    L.muster = (x, y) => ((x - 9) % 5 === 0 && y > 3 ? -1 : 0);
    const f = S.lage(pal('#1a1a20','#3a5a70','#6a9ab4','#a8d4e8','#e0f4fc'), { kante: true });
    S.rechteck(f, 11, 5, 4, 6); S.rechteck(f, 17, 5, 4, 6);
    const g = S.lage(MAT.iron); S.rechteck(g, 19, 18, 2, 2);
  });
  sprite('i_bed', S => {
    const holz = S.lage(pal('#2e1d0c','#6b4a26','#8b6234','#a57a45','#c49a60'));
    S.rechteck(holz, 3, 16, 26, 6); S.rechteck(holz, 3, 22, 3, 5); S.rechteck(holz, 26, 22, 3, 5);
    const decke = S.lage(pal('#3a0a0e','#7c1c21','#a8282c','#c8403f','#e0706a'), { kante: true });
    S.rechteck(decke, 11, 12, 18, 5);
    const kissen = S.lage(pal('#6a6456','#cfc8b8','#e2dccd','#f1ecdf','#ffffff'), { kante: true });
    S.rechteck(kissen, 4, 12, 7, 5);
  });

  /* — Wesen — */
  const haut = (P, s, anteile) => p => p.fuell((x, y) => .7*fbm(x, y, 4, 4, s, 2) + .3*vnoise(x, y, 16, 16, s+1), P, anteile || [8,22,34,26,10], .6);
  const PIG = pal('#c97a78','#d98a87','#e69b97','#f0aca7','#f7bfb9');
  addTex('m_pig', p => { haut(PIG, 301)(p); for(let i = 0; i < 6; i++){ const x = p.r()*TS, y = p.r()*TS; p.put(x, y, hell(PIG[0], .92)); p.put(x+1, y, PIG[0]); } });
  addTex('m_pig_face', p => {
    haut(PIG, 302)(p);
    for(const x0 of [4, 22]){                                            // Augen
      p.rect(x0, 9, 6, 4, [238,238,238]); p.rect(x0 + (x0 < 16 ? 3 : 0), 9, 3, 4, [22,14,18]);
      p.put(x0 + (x0 < 16 ? 3 : 0), 9, [90,70,80]);
    }
    const S = pal('#b85f63','#d77d80','#eb9796','#f6b1ad');
    for(let y = 15; y < 25; y++) for(let x = 9; x < 23; x++){
      const r = x === 9 || x === 22 || y === 15 || y === 24;
      p.put(x, y, r ? S[0] : (y === 16 || x === 10 ? S[3] : S[2]));
    }
    p.rect(11, 18, 3, 4, [110,50,56]); p.rect(18, 18, 3, 4, [110,50,56]);
    p.put(11, 18, [150,80,86]); p.put(18, 18, [150,80,86]);
  });
  addTex('m_pig_leg', p => {
    haut(PIG, 303)(p);
    for(let y = 25; y < TS; y++) for(let x = 0; x < TS; x++) p.quant(x, y, .35 + (y === 25 ? .4 : 0) + (vnoise(x, y, 8, 8, 304) - .5)*.3, pal('#3a2a24','#54403a','#6a544c','#806a60'), .5);
  });
  const ZH = pal('#35592b','#406a34','#4c7b3e','#598c48','#679c54');
  addTex('m_zsk', p => { haut(ZH, 311)(p); for(let i = 0; i < 5; i++){ const x = p.r()*TS, y = p.r()*TS; p.rect(x, y, 2, 2, hell(ZH[0], .75)); } });
  addTex('m_zface', p => {
    haut(ZH, 312)(p);
    for(const x0 of [5, 19]){ p.rect(x0, 11, 8, 5, [16,26,14]); p.rect(x0 + 1, 12, 6, 3, [8,14,8]); p.put(x0 + (x0 < 16 ? 5 : 2), 13, [140,40,30]); }
    p.rect(14, 17, 4, 3, hell(ZH[0], .7));
    for(let x = 9; x < 23; x++) p.put(x, 23 + (x % 3 === 0 ? 1 : 0), [22,34,20]);
    p.rect(10, 24, 12, 2, [30,44,26]);
    for(let y = 3; y < 8; y++) p.put(24, y, hell(ZH[0], .8));
  });
  addTex('m_zshirt', p => {
    const P = pal('#1e4f58','#27616c','#2f7280','#3a8493','#4a96a4');
    p.fuell((x, y) => .5*fbm(x, y, 2, 8, 321, 3) + .5*vnoise(x, y, 16, 16, 322), P, [8,22,34,26,10], .5);
    for(let x = 0; x < TS; x++){ p.put(x, 0, P[0]); p.put(x, 1, P[1]); }
    for(let x = 0; x < TS; x++){ const riss = h2(x, 1, 323) < .35; if(riss) for(let y = TS - 1 - (h2(x, 2, 323)*5|0); y < TS; y++) p.put(x, y, ZH[2]); }
    p.rect(20, 12, 5, 4, [58,44,30]); p.rect(21, 13, 3, 2, [72,54,36]);
  });
  addTex('m_zpants', p => {
    const P = pal('#232a58','#2c356b','#36407e','#414c90','#5260a2');
    p.fuell((x, y) => .5*fbm(x, y, 8, 2, 331, 3) + .5*vnoise(x, y, 16, 16, 332), P, [8,22,34,26,10], .5);
    for(let y = 0; y < TS; y += 4) p.put(15, y, P[4]);
    p.rect(4, 20, 6, 5, [70,78,140]); for(let x = 4; x < 10; x++) p.put(x, 20, [110,118,176]);
  });
  addTex('m_skin', p => haut(pal('#a8764f','#bb865d','#cc966b','#d9a679','#e4b688'), 341)(p));
}

/* ── Symbole für die Oberfläche ────────────────────────────────────── */
const _layerCanvas = new Map();
function layerCanvas(name){
  if(_layerCanvas.has(name)) return _layerCanvas.get(name);
  const cv = document.createElement('canvas'); cv.width = TS; cv.height = TS;
  const ctx = cv.getContext('2d'), img = ctx.createImageData(TS, TS);
  const L = TEX[name];
  if(L !== undefined) img.data.set(texData[L]);
  ctx.putImageData(img, 0, 0);
  _layerCanvas.set(name, cv);
  return cv;
}
const _iconCache = new Map();
/** flaches Symbol: die Textur selbst */
function iconURL(texName){
  const k = 'f:' + texName;
  if(_iconCache.has(k)) return _iconCache.get(k);
  const url = layerCanvas(texName).toDataURL();
  _iconCache.set(k, url);
  return url;
}
/**
 * Würfel in Iso-Ansicht: oben, links (Vorderseite), rechts. Die Seiten
 * werden abgedunkelt wie im Spiel, damit der Block im Inventar so aussieht
 * wie in der Welt. hoehe < 1 für flache Blöcke.
 */
function isoIconURL(oben, links, rechts, hoehe = 1){
  const k = 'i:' + oben + '|' + links + '|' + rechts + '|' + hoehe;
  if(_iconCache.has(k)) return _iconCache.get(k);
  const S = 96, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const e = S/2 - 2, q = e/2;                         // halbe Breite, Viertel
  const hs = (S - 4 - e) * hoehe;                     // Seitenhöhe
  const y0 = 2 + (S - 4 - e) * (1 - hoehe);
  const k32 = 1/TS;
  const flaeche = (name, a, b, cc, d, x, y, dunkel) => {
    c.save();
    c.setTransform(a*k32, b*k32, cc*k32, d*k32, x, y);
    c.drawImage(layerCanvas(name), 0, 0);
    if(dunkel){ c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(0,0,0,' + dunkel + ')'; c.fillRect(0, 0, TS, TS); }
    c.restore();
  };
  // Seiten erst, dann Deckel — so liegen die Kanten richtig
  flaeche(links,  e, q, 0, hs, 2, y0 + q, .26);
  flaeche(rechts, e, -q, 0, hs, 2 + e, y0 + 2*q, .42);
  flaeche(oben,   e, q, -e, q, S/2, y0, 0);
  const url = cv.toDataURL();
  _iconCache.set(k, url);
  return url;
}
