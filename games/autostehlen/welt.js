/* ═══════════════════════════════════════════════════════════════════
   Illegal Autostehlen — die Stadt.
   Festland im Westen (Innenstadt, Wohnviertel, Flughafen), dazwischen
   die Bucht, im Osten eine Strandinsel mit Hotels. Zwei geschwungene
   Brücken verbinden beides; darunter passen Boote durch.
   Einheiten: Meter. +x = Osten, +z = Norden.
   ═══════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import * as T from './texturen.js';

export const WASSER_Y = -1.4;
export const FESTLAND = { x0: -712, x1: 150, z0: -712, z1: 712 };
export const INSEL = { x0: 400, x1: 570, z0: -560, z1: 560 };
export const FLUGHAFEN = { x0: -712, x1: -440, z0: -140, z1: 140 };
export const BRUECKEN = [{ z: -192 }, { z: 288 }];
export const STEGE = [
  { x0: 150, x1: 194, z0: 18, z1: 22 },
  { x0: 150, x1: 194, z0: 78, z1: 82 },
];
export const RAND = 1500; // weiter draußen ist Schluss

const klemm = (v, a, b) => v < a ? a : v > b ? b : v;
const inRect = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const ueberlappt = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

export function brueckeH(x){
  const t = (x - 150)/250;
  return (t <= 0 || t >= 1) ? 0 : 7*Math.sin(Math.PI*t);
}
export function aufBruecke(x, z){
  if(x <= 150 || x >= 400) return false;
  for(const b of BRUECKEN) if(Math.abs(z - b.z) <= 7.3) return true;
  return false;
}
export const INNENRAEUME = [];
export function landAt(x, z){
  if(inRect(FESTLAND, x, z) || inRect(INSEL, x, z)) return true;
  for(const r of INNENRAEUME) if(inRect(r, x, z)) return true;
  for(const s of STEGE) if(inRect(s, x, z)) return true;
  return false;
}
export const begehbar = (x, z) => landAt(x, z) || aufBruecke(x, z);
export function schiffbar(x, z){
  if(Math.abs(x) > RAND || Math.abs(z) > RAND) return false;
  if(landAt(x, z)) return false;
  if(x > 150 && x < 400) for(const b of BRUECKEN)
    if(Math.abs(z - b.z) < 9.5 && brueckeH(x) < 4.2) return false;
  return true;
}

/* ── Plattformen (Gehwegplatten, Stege) für die Bodenhöhe ─────────── */
const plattGitter = new Map();
const PG = 32;
function plattformRein(p){
  for(let ix = Math.floor(p.x0/PG); ix <= Math.floor(p.x1/PG); ix++)
    for(let iz = Math.floor(p.z0/PG); iz <= Math.floor(p.z1/PG); iz++){
      const k = ix*4096 + iz;
      let l = plattGitter.get(k); if(!l) plattGitter.set(k, l = []);
      l.push(p);
    }
}
export function bodenY(x, z){
  if(aufBruecke(x, z)) return brueckeH(x);
  const l = plattGitter.get(Math.floor(x/PG)*4096 + Math.floor(z/PG));
  if(l) for(const p of l) if(inRect(p, x, z)) return p.y;
  return 0;
}

/* ── Hindernisse (Häuser, Palmen, Masten, Pfeiler) ──────────────── */
export const hindernisse = [];
const hGitter = new Map();
const HG = 24;
let abfrageNr = 1;
export function hindernis(x0, x1, z0, z1, y0, y1, art = 'haus'){
  const h = { x0, x1, z0, z1, y0, y1, art, q: 0 };
  hindernisse.push(h);
  for(let ix = Math.floor(x0/HG); ix <= Math.floor(x1/HG); ix++)
    for(let iz = Math.floor(z0/HG); iz <= Math.floor(z1/HG); iz++){
      const k = ix*4096 + iz;
      let l = hGitter.get(k); if(!l) hGitter.set(k, l = []);
      l.push(h);
    }
  return h;
}
const _treffer = [];
export function hindernisseNahe(x, z, r){
  _treffer.length = 0;
  const q = ++abfrageNr;
  for(let ix = Math.floor((x - r)/HG); ix <= Math.floor((x + r)/HG); ix++)
    for(let iz = Math.floor((z - r)/HG); iz <= Math.floor((z + r)/HG); iz++){
      const l = hGitter.get(ix*4096 + iz);
      if(l) for(const h of l) if(h.q !== q){ h.q = q; _treffer.push(h); }
    }
  return _treffer;
}
/* Kreis gegen Kästen: schiebt p hinaus, gibt die Normale des stärksten Stoßes */
export function kreisRaus(p, r, y0, y1){
  let nx = 0, nz = 0, tief = 0;
  const liste = hindernisseNahe(p.x, p.z, r + 1);
  for(const h of liste){
    if(y1 <= h.y0 || y0 >= h.y1) continue;
    const cx = klemm(p.x, h.x0, h.x1), cz = klemm(p.z, h.z0, h.z1);
    let dx = p.x - cx, dz = p.z - cz;
    const d2 = dx*dx + dz*dz;
    if(d2 >= r*r) continue;
    let pen, ux, uz;
    if(d2 > 1e-8){
      const d = Math.sqrt(d2); pen = r - d; ux = dx/d; uz = dz/d;
    } else {
      const l = p.x - h.x0, rr = h.x1 - p.x, u = p.z - h.z0, o = h.z1 - p.z;
      const m = Math.min(l, rr, u, o);
      if(m === l){ ux = -1; uz = 0; pen = l + r; }
      else if(m === rr){ ux = 1; uz = 0; pen = rr + r; }
      else if(m === u){ ux = 0; uz = -1; pen = u + r; }
      else { ux = 0; uz = 1; pen = o + r; }
    }
    p.x += ux*pen; p.z += uz*pen;
    if(pen > tief){ tief = pen; nx = ux; nz = uz; }
  }
  return tief > 0 ? { nx, nz, tief } : null;
}
export function inHindernis(x, y, z){
  const liste = hindernisseNahe(x, z, 0.5);
  for(const h of liste) if(y < h.y1 && y > h.y0 && x > h.x0 && x < h.x1 && z > h.z0 && z < h.z1) return h;
  return null;
}

/* ── Straßennetz ─────────────────────────────────────────────────── */
export const knoten = [];
export const kanten = [];
const knotenNach = new Map();
function knotenRein(x, z){
  const k = x + ',' + z;
  if(knotenNach.has(k)) return knotenNach.get(k);
  const id = knoten.length;
  knoten.push({ id, x, z, nb: [] });
  knotenNach.set(k, id);
  return id;
}
export const knotenBei = (x, z) => knotenNach.get(x + ',' + z);
function verbinde(a, b, bruecke = false){
  if(a === undefined || b === undefined) return;
  const A = knoten[a], B = knoten[b];
  const len = Math.hypot(B.x - A.x, B.z - A.z);
  kanten.push({ a, b, len, bruecke });
  A.nb.push(b); B.nb.push(a);
}
const MX = [], MZ = [], IX = [448, 528], IZ = [];
for(let k = -7; k <= 1; k++) MX.push(k*96);
for(let k = -7; k <= 7; k++) MZ.push(k*96);
for(let k = -5; k <= 5; k++) IZ.push(k*96);
const imFlughafen = (x, z) => x > FLUGHAFEN.x0 - 1 && x < FLUGHAFEN.x1 && z > FLUGHAFEN.z0 && z < FLUGHAFEN.z1;
for(const x of MX) for(const z of MZ) if(!imFlughafen(x, z)) knotenRein(x, z);
for(const x of IX) for(const z of IZ) knotenRein(x, z);
for(let i = 0; i < MX.length; i++) for(let j = 0; j < MZ.length; j++){
  const a = knotenBei(MX[i], MZ[j]);
  if(a === undefined) continue;
  if(i + 1 < MX.length) verbinde(a, knotenBei(MX[i + 1], MZ[j]));
  if(j + 1 < MZ.length) verbinde(a, knotenBei(MX[i], MZ[j + 1]));
}
for(let j = 0; j < IZ.length; j++){
  verbinde(knotenBei(448, IZ[j]), knotenBei(528, IZ[j]));
  if(j + 1 < IZ.length){
    verbinde(knotenBei(448, IZ[j]), knotenBei(448, IZ[j + 1]));
    verbinde(knotenBei(528, IZ[j]), knotenBei(528, IZ[j + 1]));
  }
}
for(const b of BRUECKEN) verbinde(knotenBei(96, b.z), knotenBei(448, b.z), true);

export function naechsterKnoten(x, z){
  let best = 0, bd = Infinity;
  for(const k of knoten){
    const d = (k.x - x)**2 + (k.z - z)**2;
    if(d < bd){ bd = d; best = k.id; }
  }
  return best;
}
/* Breitensuche: Weg von Knoten a nach b */
export function weg(a, b){
  if(a === b) return [a];
  const vor = new Int32Array(knoten.length).fill(-1);
  vor[a] = a;
  const schlange = [a];
  for(let i = 0; i < schlange.length; i++){
    const k = schlange[i];
    if(k === b) break;
    for(const n of knoten[k].nb) if(vor[n] < 0){ vor[n] = k; schlange.push(n); }
  }
  if(vor[b] < 0) return null;
  const w = [b];
  while(w[w.length - 1] !== a) w.push(vor[w[w.length - 1]]);
  return w.reverse();
}

/* ── Blöcke ─────────────────────────────────────────────────────── */
export const bloecke = []; // { x0,x1,z0,z1, art }
function blockRein(x0, x1, z0, z1, art){
  const b = { x0, x1, z0, z1, art, y: .15 };
  bloecke.push(b); plattformRein(b);
  return b;
}
for(let i = 0; i + 1 < MX.length; i++) for(let j = 0; j + 1 < MZ.length; j++){
  const r = { x0: MX[i] + 8, x1: MX[i + 1] - 8, z0: MZ[j] + 8, z1: MZ[j + 1] - 8 };
  if(ueberlappt(r, FLUGHAFEN)) continue;
  blockRein(r.x0, r.x1, r.z0, r.z1, 'stadt');
}
for(let j = 0; j + 1 < IZ.length; j++) blockRein(456, 520, IZ[j] + 8, IZ[j + 1] - 8, 'hotel');
// Ränder: Promenade, Grünstreifen
const luecken = (a, b, gaps) => { // teilt [a,b] an Brückenstraßen
  const teile = []; let s = a;
  for(const g of gaps){ teile.push([s, g - 8]); s = g + 8; }
  teile.push([s, b]); return teile;
};
for(const [z0, z1] of luecken(-712, 712, [-192, 288])) blockRein(104, 150, z0, z1, 'promenade');
for(const [z0, z1] of luecken(-488, 488, [-192, 288])) blockRein(400, 440, z0, z1, 'promenade');
blockRein(400, 570, 488, 560, 'park'); blockRein(400, 570, -560, -488, 'park');
blockRein(-712, 104, 680, 712, 'park'); blockRein(-712, 104, -712, -680, 'park');
blockRein(-712, -680, 140, 680, 'park'); blockRein(-712, -680, -680, -140, 'park');
for(const s of STEGE) plattformRein({ ...s, y: .45 });

/* ── Geometrie-Baukasten ────────────────────────────────────────── */
class Bau {
  constructor(){ this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; this.vc = 0; }
  quad(a, b, c, d, ua, ub, uc, ud, col = [1, 1, 1]){
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1]*e2[2] - e1[2]*e2[1], ny = e1[2]*e2[0] - e1[0]*e2[2], nz = e1[0]*e2[1] - e1[1]*e2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for(const [q, uv] of [[a, ua], [b, ub], [c, uc], [d, ud]]){
      this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.u.push(uv[0], uv[1]); this.c.push(col[0], col[1], col[2]);
    }
    const v = this.vc;
    this.i.push(v, v + 1, v + 2, v, v + 2, v + 3);
    this.vc += 4;
  }
  quadOben(a, b, c, d, ua, ub, uc, ud, col){ // dreht sich so, dass es nach oben zeigt
    const e1 = [b[0] - a[0], b[2] - a[2]], e2 = [c[0] - a[0], c[2] - a[2]];
    const ny = e1[1]*e2[0] - e1[0]*e2[1];
    if(ny >= 0) this.quad(a, b, c, d, ua, ub, uc, ud, col);
    else this.quad(a, d, c, b, ua, ud, uc, ub, col);
  }
  tri(a, b, c, ua, ub, uc, col = [1, 1, 1]){
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let nx = e1[1]*e2[2] - e1[2]*e2[1], ny = e1[2]*e2[0] - e1[0]*e2[2], nz = e1[0]*e2[1] - e1[1]*e2[0];
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for(const [q, uv] of [[a, ua], [b, ub], [c, uc]]){
      this.p.push(q[0], q[1], q[2]); this.n.push(nx, ny, nz); this.u.push(uv[0], uv[1]); this.c.push(col[0], col[1], col[2]);
    }
    const v = this.vc; this.i.push(v, v + 1, v + 2); this.vc += 3;
  }
  // vier Seiten eines Quaders, v nach absoluter Höhe (Stockwerke fluchten)
  seiten(x0, x1, y0, y1, z0, z1, tw, th, uo = 0, col){
    const W = x1 - x0, D = z1 - z0, v0 = y0/th, v1 = y1/th;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [uo, v0], [uo + W/tw, v0], [uo + W/tw, v1], [uo, v1], col);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [uo, v0], [uo + D/tw, v0], [uo + D/tw, v1], [uo, v1], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [uo, v0], [uo + W/tw, v0], [uo + W/tw, v1], [uo, v1], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [uo, v0], [uo + D/tw, v0], [uo + D/tw, v1], [uo, v1], col);
  }
  deckel(x0, x1, y, z0, z1, ts, col){
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [x0/ts, z1/ts], [x1/ts, z1/ts], [x1/ts, z0/ts], [x0/ts, z0/ts], col);
  }
  quader(x0, x1, y0, y1, z0, z1, ts, col){
    this.seiten(x0, x1, y0, y1, z0, z1, ts, ts, 0, col);
    this.deckel(x0, x1, y1, z0, z1, ts, col);
  }
  geo(){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.vc > 65000 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
}
const stuecke = new Map();
function bau(mat, x, z){
  const k = mat + '|' + Math.floor((x + 900)/300) + '|' + Math.floor((z + 900)/300);
  let b = stuecke.get(k);
  if(!b){ b = new Bau(); b.mat = mat; stuecke.set(k, b); }
  return b;
}
const farbe = h => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

/* ── Welt bauen ─────────────────────────────────────────────────── */
export const neon = [];       // { mat, basis, nacht } — Helligkeit folgt der Nacht
export const fensterMats = []; // Fassaden: emissiveIntensity folgt der Nacht
export const parkplaetze = []; // { x, z, h } für abgestellte Autos
export const lampen = [];
export const palmen = [];
export const baeume = [];
export const hotelSchilder = [];
export const markantes = {};
export let gerueste = [];

export const modellHaeuser = [];
export const ampeln = [];      // { knoten, achse, x, z, rot } je Ampelmast
export const ampelKnoten = new Map(); // Knoten → Phasenversatz
export const moebel = { s_bank: [], s_eimer: [], s_container: [], s_bistro: [] };
export const werbung = [];
export function baueWelt(szene, qualitaet, K){
  const Z = T.mulberry32(20261118);
  const R = (a, b) => a + (b - a)*Z();
  const RI = (a, b) => Math.floor(R(a, b + 1));
  const wahl = l => l[Math.floor(Z()*l.length)];

  /* Materialien */
  const fas = {};
  const M = {};
  for(const [art, seed] of [['glas', 1], ['dunkel', 2], ['buero', 3], ['deko', 4], ['haus', 5]]){
    const t = T.fassade(art, seed);
    fas[art] = t;
    const m = new THREE.MeshStandardMaterial({
      map: t.map, roughnessMap: t.rm, metalnessMap: t.rm, roughness: 1, metalness: 1,
      emissiveMap: t.em, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true,
      normalMap: T.normalVon(t.map.image, (art === 'glas' || art === 'dunkel') ? -1.2 : 2.4),
    });
    if(art === 'buero' || art === 'deko' || art === 'haus') m.envMapIntensity = .6;
    M[art] = m; fensterMats.push(m);
  }
  M.dach = new THREE.MeshStandardMaterial({ map: T.dach(), roughness: .9, metalness: 0, vertexColors: true });
  M.ziegel = new THREE.MeshStandardMaterial({ map: T.ziegel(), roughness: .8, vertexColors: true });
  const strT = T.asphaltStrasse(), kreuzT = T.asphaltKreuzung(), wegT = T.gehweg(), grasT = T.gras(), parkT = T.parkplatz(), sandT = T.sand();
  M.strasse = new THREE.MeshStandardMaterial({ map: strT, normalMap: T.normalVon(strT.image, 2.2), roughnessMap: T.rauheitVon(strT.image, .82, .35), roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  M.kreuzung = new THREE.MeshStandardMaterial({ map: kreuzT, normalMap: T.normalVon(kreuzT.image, 2.2), roughnessMap: T.rauheitVon(kreuzT.image, .82, .35), roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  M.gehweg = new THREE.MeshStandardMaterial({ map: wegT, normalMap: T.normalVon(wegT.image, 1.4), roughnessMap: T.rauheitVon(wegT.image, .85, .25), roughness: 1, vertexColors: true });
  M.gras = new THREE.MeshStandardMaterial({ map: grasT, normalMap: T.normalVon(grasT.image, 1.1), roughness: 1, vertexColors: true });
  M.sand = new THREE.MeshStandardMaterial({ map: sandT, normalMap: T.normalVon(sandT.image, 1.2), roughness: 1, vertexColors: true });
  M.beton = new THREE.MeshStandardMaterial({ color: 0xbfb9ae, roughness: .9, vertexColors: true, side: THREE.DoubleSide });
  M.piste = new THREE.MeshStandardMaterial({ map: T.piste(), roughness: .85, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  M.parkplatz = new THREE.MeshStandardMaterial({ map: parkT, normalMap: T.normalVon(parkT.image, 2), roughnessMap: T.rauheitVon(parkT.image, .8, .3), roughness: 1, vertexColors: true });
  M.wandschatten = new THREE.MeshBasicMaterial({ map: T.wandSchatten(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 });
  M.holz = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: .85, vertexColors: true });
  const neonFarben = { pink: '#ff2bb4', cyan: '#22e2ff', lila: '#a54dff', gruen: '#3dff9a', gold: '#ffc84a', rot: '#ff3a3a' };
  for(const [k, hex] of Object.entries(neonFarben)){
    const basis = new THREE.Color(hex);
    M['neon_' + k] = new THREE.MeshBasicMaterial({ color: basis.clone(), side: THREE.DoubleSide });
    neon.push({ mat: M['neon_' + k], basis, tag: .35, nacht: 3.2 });
  }

  const TINT_GLAS = ['#d6ecff', '#c9f1ea', '#dfeedd', '#f0dfc6', '#e2e2f2', '#ffffff'].map(farbe);
  const TINT_PASTELL = ['#ffd3de', '#c6f2e2', '#cfe6ff', '#fff0b5', '#e7d6ff', '#ffffff', '#ffe0c4'].map(farbe);
  const TINT_BUERO = ['#ffffff', '#f1e9dc', '#e2e6ea', '#f6e3cf'].map(farbe);

  /* Häuser */
  function gebaeude(x0, x1, z0, z1, h, art, opt = {}){
    const tex = fas[art];
    const col = opt.col || (art === 'glas' || art === 'dunkel' ? wahl(TINT_GLAS) : art === 'buero' ? wahl(TINT_BUERO) : wahl(TINT_PASTELL));
    const cx = (x0 + x1)/2, cz = (z0 + z1)/2;
    const uo = RI(0, 7)*1;
    let oben = h;
    if(opt.stufe && h > 60){
      const h1 = Math.round(h*R(.5, .72)/tex.tileH*10)/10*tex.tileH;
      bau(art, cx, cz).seiten(x0, x1, .15, h1, z0, z1, tex.tileW, tex.tileH, uo, col);
      bau('dach', cx, cz).deckel(x0, x1, h1, z0, z1, 5, [1, 1, 1]);
      const e = R(3, 6);
      x0 += e; x1 -= e; z0 += e; z1 -= e;
      bau(art, cx, cz).seiten(x0, x1, h1, h, z0, z1, tex.tileW, tex.tileH, uo, col);
    } else {
      bau(art, cx, cz).seiten(x0, x1, .15, h, z0, z1, tex.tileW, tex.tileH, uo, col);
    }
    if(opt.spitz){
      // Walmdach
      const ue = .5, Y = h, F = h + Math.min(x1 - x0, z1 - z0)*.32;
      const a = [x0 - ue, Y, z0 - ue], b = [x1 + ue, Y, z0 - ue], c = [x1 + ue, Y, z1 + ue], d = [x0 - ue, Y, z1 + ue];
      const mx = (x0 + x1)/2, mz = (z0 + z1)/2, lx = (x1 - x0)/2*.35;
      const g1 = [mx - lx, F, mz], g2 = [mx + lx, F, mz];
      const B = bau('ziegel', cx, cz), dc = opt.dachfarbe || [1, 1, 1];
      B.quad(d, c, g2, g1, [0, 0], [3, 0], [2, 2], [1, 2], dc);
      B.quad(b, a, g1, g2, [0, 0], [3, 0], [2, 2], [1, 2], dc);
      B.tri(c, b, g2, [0, 0], [2, 0], [1, 2], dc);
      B.tri(a, d, g1, [0, 0], [2, 0], [1, 2], dc);
    } else {
      bau('dach', cx, cz).deckel(x0, x1, h, z0, z1, 5, [1, 1, 1]);
      if(h > 18 && h < 95 && x1 - x0 > 16 && Z() < .16) werbung.push({ x: cx, z: cz, y: h, rot: Math.floor(Z()*4)*Math.PI/2, breite: Math.min(x1 - x0, z1 - z0)*.8, nr: Math.floor(Z()*8) });
      // Dachaufbauten
      const n = h > 12 ? RI(1, 3) : 0;
      for(let i = 0; i < n; i++){
        const w = R(2, 5), d2 = R(2, 5);
        const ax = R(x0 + 1, x1 - 1 - w), az = R(z0 + 1, z1 - 1 - d2);
        bau('dach', cx, cz).quader(ax, ax + w, h, h + R(1.2, 3), az, az + d2, 3, [.85, .85, .87]);
      }
    }
    if(opt.krone){
      const k = 'neon_' + opt.krone, B = bau(k, cx, cz), t = .5, o = .06;
      B.seiten(x0 - o, x1 + o, h - .9, h - .9 + t, z0 - o, z1 + o, 4, 4);
      B.seiten(x0 - o, x1 + o, h - 2.6, h - 2.6 + .25, z0 - o, z1 + o, 4, 4);
    }
    if(opt.kanten){
      const k = 'neon_' + opt.kanten, B = bau(k, cx, cz), s = .35;
      for(const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]])
        B.seiten(px - s, px + s, opt.kantenAb || 0.2, oben, pz - s, pz + s, 4, 4);
    }
    if(opt.antenne){
      bau('dach', cx, cz).quader(cx - .3, cx + .3, h, h + opt.antenne, cz - .3, cz + .3, 2, [.6, .6, .62]);
      gerueste.push({ x: cx, y: h + opt.antenne, z: cz });
    }
    hindernis(opt.hx0 ?? x0 - (opt.stufe ? 0 : 0), opt.hx1 ?? x1, opt.hz0 ?? z0, opt.hz1 ?? z1, -6, oben + (opt.antenne || 0));
    wandFuss(opt.hx0 ?? x0, opt.hx1 ?? x1, opt.hz0 ?? z0, opt.hz1 ?? z1, Math.min(3.2, 1.2 + oben*.02));
  }

  function platte(b, mat){
    const B = bau(mat, (b.x0 + b.x1)/2, (b.z0 + b.z1)/2);
    const ts = mat === 'gras' ? 3.5 : 2;
    B.seiten(b.x0, b.x1, -.06, b.y, b.z0, b.z1, 4, 1, 0, [.85, .85, .85]);
    B.deckel(b.x0, b.x1, b.y, b.z0, b.z1, ts, [1, 1, 1]);
  }
  // Turm aus einem echten Modell: Grundfläche aus seinen Maßen, Drehung in 90°-Schritten
  function modellTurm(typ, cx, cz, h, maxB){
    const m = K && K[typ]; if(!m) return false;
    const rot = Math.floor(Z()*4);
    let b = m.b*h, t = m.t*h;
    if(maxB && Math.max(b, t) > maxB){ const f = maxB/Math.max(b, t); h *= f; b *= f; t *= f; }
    if(rot % 2){ const x = b; b = t; t = x; }
    modellHaeuser.push({ typ, x: cx, z: cz, h, rot: rot*Math.PI/2 });
    hindernis(cx - b*.36, cx + b*.36, cz - t*.36, cz + t*.36, -6, h);
    hindernis(cx - b/2, cx + b/2, cz - t/2, cz + t/2, -6, h*.06); // Sockel
    return true;
  }
  // Kontaktschatten am Fuß der Wände: Streifen, der von der Wand nach außen ausläuft
  function wandFuss(x0, x1, z0, z1, b){
    const B = bau('wandschatten', (x0 + x1)/2, (z0 + z1)/2), y = .17;
    B.quadOben([x0, y, z1], [x1, y, z1], [x1 + b, y, z1 + b], [x0 - b, y, z1 + b], [0, .5], [0, .5], [1, .5], [1, .5]);
    B.quadOben([x1, y, z0], [x0, y, z0], [x0 - b, y, z0 - b], [x1 + b, y, z0 - b], [0, .5], [0, .5], [1, .5], [1, .5]);
    B.quadOben([x1, y, z1], [x1, y, z0], [x1 + b, y, z0 - b], [x1 + b, y, z1 + b], [0, .5], [0, .5], [1, .5], [1, .5]);
    B.quadOben([x0, y, z0], [x0, y, z1], [x0 - b, y, z1 + b], [x0 - b, y, z0 - b], [0, .5], [0, .5], [1, .5], [1, .5]);
  }
  function palme(x, z, s = 1){ palmen.push({ x, z, s: s*R(.85, 1.2), r: R(0, 6.28), y: bodenY(x, z) }); hindernis(x - .35, x + .35, z - .35, z + .35, -1, 9, 'palme'); }
  function baum(x, z){ baeume.push({ x, z, s: R(.8, 1.3), r: R(0, 6.28), y: bodenY(x, z) }); hindernis(x - .4, x + .4, z - .4, z + .4, -1, 6, 'baum'); }
  function inPlatz(b, rand, n, f){
    for(let i = 0; i < n; i++) f(R(b.x0 + rand, b.x1 - rand), R(b.z0 + rand, b.z1 - rand));
  }

  const STADT = { x: 20, z: 40 };
  // besondere Blöcke
  const arenaBlock = bloecke.find(b => b.x0 === 8 && b.z0 === 104);
  const polizeiBlock = bloecke.find(b => b.x0 === -184 && b.z0 === 200);
  const krankenBlock = bloecke.find(b => b.x0 === -184 && b.z0 === -88);
  const huhnBlock = bloecke.find(b => b.x0 === 8 && b.z0 === -88);
  const waffenBlock = bloecke.find(b => b.x0 === -376 && b.z0 === 104);
  markantes.laeden = [];
  const NAMEN = ['Flamingo', 'Coral', 'Starlite', 'Paradiso', 'Bay Breeze', 'Sunset', 'Pelican', 'Tropicana', 'Neptun', 'Blue Moon', 'Riviera', 'Palmetto'];
  let hotelNr = 0;

  for(const b of bloecke){
    const cx = (b.x0 + b.x1)/2, cz = (b.z0 + b.z1)/2;
    if(b.art === 'park'){ platte(b, 'gras'); inPlatz(b, 3, Math.floor((b.x1 - b.x0)*(b.z1 - b.z0)/500), (x, z) => Z() < .5 ? palme(x, z) : baum(x, z)); continue; }
    if(b.art === 'promenade'){
      platte(b, 'gehweg');
      const x = b.x1 - 6;
      for(let z = b.z0 + 6; z < b.z1 - 4; z += 14) palme(x + R(-1, 1), z + R(-2, 2));
      continue;
    }
    if(b.art === 'hotel'){
      platte(b, 'gehweg');
      for(let k = 0; k < 2; k++){
        const z0 = k === 0 ? b.z0 + 4 : cz + 2, z1 = k === 0 ? cz - 2 : b.z1 - 4;
        if(Z() < .4 && modellTurm('condo', (b.x0 + b.x1)/2, (z0 + z1)/2, R(55, 95), Math.min(b.x1 - b.x0 - 8, z1 - z0))) continue;
        const h = Math.round(R(14, 46)/3.25)*3.25;
        const kr = Z() < .5 ? wahl(['pink', 'cyan', 'lila', 'gruen']) : null;
        gebaeude(b.x0 + 6, b.x1 - 6, z0, z1, h, 'deko', { krone: kr, kanten: Z() < .35 ? wahl(['pink', 'cyan']) : null, kantenAb: h*.15 });
        hotelSchilder.push({ name: NAMEN[hotelNr++ % NAMEN.length], x: b.x1 - 6 + .25, y: Math.min(h - 4, 14 + R(0, 6)), z: (z0 + z1)/2, farbe: wahl(['#ff3fb4', '#2fe6ff', '#ffd24a', '#b77bff', '#46ff9f']) });
      }
      continue;
    }
    // Stadtblöcke nach Lage
    if(b === arenaBlock){ platte(b, 'gehweg'); markantes.arena = { x: cx, z: cz }; hindernis(cx - 36, cx + 36, cz - 36, cz + 36, -6, 22); continue; }
    if(b === huhnBlock || b === waffenBlock){
      // Laden: flacher Bau, Eingang nach Norden (+z) zur Straße
      platte(b, 'gehweg');
      const huhn = b === huhnBlock;
      const x0 = cx - 15, x1 = cx + 15, z0 = b.z1 - 36, z1 = b.z1 - 14, h = 7;
      gebaeude(x0, x1, z0, z1, h, huhn ? 'haus' : 'buero', { col: farbe(huhn ? '#fff1d6' : '#c9ccd2') });
      // Rest des Blocks: kleines Bürohaus dahinter, Palmen vorn
      if(b.z1 - 36 - b.z0 > 30) gebaeude(b.x0 + 6, b.x1 - 6, b.z0 + 6, z0 - 6, R(18, 34), 'buero');
      for(const x of [b.x0 + 4, b.x1 - 4]) palme(x, b.z1 - 5);
      markantes.laeden.push({ art: huhn ? 'huhn' : 'waffen', tuerX: cx, tuerZ: z1 + 1.4, dachY: h, cx, cz: (z0 + z1)/2, z1, x0, x1 });
      continue;
    }
    if(b === krankenBlock){
      platte(b, 'gehweg');
      gebaeude(b.x0 + 6, b.x1 - 6, b.z0 + 6, b.z1 - 26, 28, 'buero', { col: farbe('#f4f6f8') });
      // Eingang zeigt nach Norden (+z) auf die Straße
      markantes.krankenhaus = { x: cx, z: b.z1 - 12, h: 0, schildZ: b.z1 - 26, schildY: 22 };
      for(const x of [b.x0 + 6, b.x1 - 6]) palme(x, b.z1 - 6);
      continue;
    }
    if(b === polizeiBlock){
      platte(b, 'gehweg');
      gebaeude(b.x0 + 6, b.x1 - 6, b.z0 + 30, b.z1 - 6, 16, 'buero', { col: farbe('#dfe6ee') });
      markantes.polizei = { x: cx, z: b.z0 + 30, schildY: 12 };
      for(let i = 0; i < 4; i++) parkplaetze.push({ x: b.x0 + 14 + i*6.5, z: b.z0 + 12, h: 0, polizei: i < 2 });
      continue;
    }
    const d = Math.hypot(cx - STADT.x, cz - STADT.z);
    const zone = d < 240 ? 'mitte' : d < 430 ? 'rand' : 'vorort';
    const r = Z();
    if(zone !== 'mitte' && r < .12){
      platte(b, 'gras'); inPlatz(b, 4, RI(8, 14), (x, z) => Z() < .55 ? palme(x, z) : baum(x, z));
      continue;
    }
    if(zone !== 'vorort' && r > .93 || zone === 'vorort' && r > .95){
      const B = bau('parkplatz', cx, cz);
      B.seiten(b.x0, b.x1, 0, b.y, b.z0, b.z1, 4, 1, 0, [.85, .85, .85]);
      B.deckel(b.x0, b.x1, b.y, b.z0, b.z1, 8, [1, 1, 1]);
      for(let i = 0; i < 6; i++) if(Z() < .7) parkplaetze.push({ x: b.x0 + 8 + i*12, z: b.z0 + 12, h: 0 });
      for(let i = 0; i < 6; i++) if(Z() < .5) parkplaetze.push({ x: b.x0 + 8 + i*12, z: b.z1 - 12, h: Math.PI });
      for(const [x, z] of [[b.x0 + 3, b.z0 + 3], [b.x1 - 3, b.z0 + 3], [b.x0 + 3, b.z1 - 3], [b.x1 - 3, b.z1 - 3]]) palme(x, z);
      continue;
    }
    platte(b, 'gehweg');
    if(zone === 'mitte'){
      const nah = 1 - d/240;
      if(Z() < .58 && modellTurm(Z() < .55 ? 'hochhaus' : 'condo', cx, cz, R(95, 165)*(.8 + nah*.3), 74)){
        for(const [x, z] of [[b.x0 + 3, b.z0 + 3], [b.x1 - 3, b.z0 + 3], [b.x0 + 3, b.z1 - 3], [b.x1 - 3, b.z1 - 3]]) palme(x, z);
      } else if(Z() < .3){
        // ein großer Turm mit Platz davor
        const w = R(30, 44), x0 = cx - w/2 + R(-6, 6), z0 = cz - w/2 + R(-6, 6);
        const h = R(110, 200)*(.75 + nah*.4);
        gebaeude(x0, x0 + w, z0, z0 + w, h, Z() < .5 ? 'glas' : 'dunkel', { stufe: Z() < .6, krone: Z() < .55 ? wahl(['pink', 'cyan', 'lila', 'gruen', 'gold']) : null, kanten: Z() < .25 ? wahl(['cyan', 'pink']) : null, antenne: Z() < .5 ? R(8, 22) : 0 });
        for(const [x, z] of [[b.x0 + 4, b.z0 + 4], [b.x1 - 4, b.z0 + 4], [b.x0 + 4, b.z1 - 4], [b.x1 - 4, b.z1 - 4]]) palme(x, z);
      } else {
        for(let i = 0; i < 2; i++) for(let j = 0; j < 2; j++){
          const x0 = b.x0 + 3 + i*39, z0 = b.z0 + 3 + j*39;
          if(Z() < .3 && modellTurm(Z() < .5 ? 'hochhaus' : 'condo', x0 + 17, z0 + 17, R(70, 130)*(.7 + nah*.4), 34)) continue;
          const w = R(26, 34), dd = R(26, 34);
          const h = R(40, 150)*(.6 + nah*.6);
          const art = Z() < .4 ? 'glas' : Z() < .5 ? 'dunkel' : 'buero';
          gebaeude(x0, x0 + w, z0, z0 + dd, h, art, { stufe: Z() < .4, krone: art !== 'buero' && Z() < .4 ? wahl(['pink', 'cyan', 'lila', 'gruen']) : null, antenne: h > 100 && Z() < .4 ? R(6, 16) : 0 });
        }
      }
    } else if(zone === 'rand'){
      for(let i = 0; i < 2; i++) for(let j = 0; j < 2; j++){
        if(Z() < .12){ palme(b.x0 + 20 + i*40, b.z0 + 20 + j*40); continue; }
        const x0 = b.x0 + 3 + i*39, z0 = b.z0 + 3 + j*39;
        if(Z() < .14 && modellTurm('condo', x0 + 17, z0 + 17, R(55, 85), 34)) continue;
        const w = R(24, 34), dd = R(24, 34);
        const art = Z() < .55 ? 'buero' : Z() < .5 ? 'deko' : 'glas';
        const h = art === 'deko' ? Math.round(R(12, 34)/3.25)*3.25 : R(16, 60);
        gebaeude(x0, x0 + w, z0, z0 + dd, h, art, { krone: Z() < .12 ? wahl(['pink', 'cyan']) : null });
      }
    } else {
      // Wohnviertel: 3 × 3 Häuser mit Garten und Einfahrt
      for(let i = 0; i < 3; i++) for(let j = 0; j < 3; j++){
        const lx = b.x0 + i*26.7, lz = b.z0 + j*26.7;
        if(i === 1 && j === 1){ baum(lx + 13, lz + 13); palme(lx + 8, lz + 18); continue; }
        const w = R(10, 14), dd = R(9, 13);
        const x0 = lx + R(3, 26.7 - w - 3), z0 = lz + R(3, 26.7 - dd - 3);
        gebaeude(x0, x0 + w, z0, z0 + dd, Z() < .3 ? 6.4 : 3.2 + R(0, .4), 'haus', { spitz: Z() < .7, dachfarbe: wahl([[1, 1, 1], [.75, .78, .8], [1, .85, .75]]) });
        if(Z() < .6) palme(lx + R(2, 24), lz + R(2, 24) < z0 ? lz + 2 : lz + 24);
        if(Z() < .22){
          // Auto in der Einfahrt, wo Platz ist
          const px = i === 0 ? lx + 4 : i === 2 ? lx + 22.7 : null;
          if(px !== null && (px < x0 - 2.5 || px > x0 + w + 2.5)) parkplaetze.push({ x: px, z: lz + 13.3, h: 0 });
        }
      }
    }
  }

  /* Straßen */
  const SB = 8; // halbe Straßenbreite
  for(const k of kanten){
    const A = knoten[k.a], B = knoten[k.b];
    const dx = (B.x - A.x)/k.len, dz = (B.z - A.z)/k.len, rx = -dz, rz = dx;
    const n = k.bruecke ? 60 : 1;
    const L = k.len - 2*SB;
    for(let s = 0; s < n; s++){
      const t0 = SB + L*s/n, t1 = SB + L*(s + 1)/n;
      const p0x = A.x + dx*t0, p0z = A.z + dz*t0, p1x = A.x + dx*t1, p1z = A.z + dz*t1;
      const y0 = (k.bruecke ? brueckeH(p0x) : 0) + .03, y1 = (k.bruecke ? brueckeH(p1x) : 0) + .03;
      const v0 = t0/32, v1 = t1/32;
      bau('strasse', (p0x + p1x)/2, (p0z + p1z)/2).quadOben(
        [p0x - rx*SB, y0, p0z - rz*SB], [p0x + rx*SB, y0, p0z + rz*SB], [p1x + rx*SB, y1, p1z + rz*SB], [p1x - rx*SB, y1, p1z - rz*SB],
        [0, v0], [1, v0], [1, v1], [0, v1]);
    }
    // Laternen am Rand
    for(let t = 16; t < k.len - 12; t += 32){
      for(const seite of [-1, 1]){
        const px = A.x + dx*t + rx*seite*(k.bruecke ? 7.6 : 9.4), pz = A.z + dz*t + rz*seite*(k.bruecke ? 7.6 : 9.4);
        if(!k.bruecke && !landAt(px, pz)) continue;
        const y = k.bruecke ? brueckeH(px) : bodenY(px, pz);
        lampen.push({ x: px, z: pz, y, ax: -rx*seite, az: -rz*seite });
        if(!k.bruecke) hindernis(px - .2, px + .2, pz - .2, pz + .2, -1, 8, 'mast');
      }
    }
  }
  for(const kn of knoten){
    if(kn.nb.length === 4 && Z() < .55 && Math.abs(kn.x - 96) > 1){
      ampelKnoten.set(kn.id, Z()*20);
      // vier Masten an den Ecken; jeder zeigt dem ankommenden Verkehr entgegen
      for(const [dx, dz, rot, achse] of [[-1, -1, 0, 'z'], [1, 1, Math.PI, 'z'], [1, -1, -Math.PI/2, 'x'], [-1, 1, Math.PI/2, 'x']]){
        const x = kn.x + dx*9.2, z = kn.z + dz*9.2;
        ampeln.push({ knoten: kn.id, achse, x, z, rot });
        hindernis(x - .2, x + .2, z - .2, z + .2, -1, 5, 'mast');
      }
    }
  }
  for(const kn of knoten){
    bau('kreuzung', kn.x, kn.z).quadOben([kn.x - SB, .035, kn.z - SB], [kn.x + SB, .035, kn.z - SB], [kn.x + SB, .035, kn.z + SB], [kn.x - SB, .035, kn.z + SB], [0, 0], [1, 0], [1, 1], [0, 1]);
  }

  /* Straßenmöbel: Bänke, Mülleimer, Container, Bistrotische */
  for(const b of bloecke){
    if(b.art !== 'stadt' && b.art !== 'hotel' && b.art !== 'promenade') continue;
    const y = b.y;
    // Bänke und Mülleimer am Gehwegrand, mit Blick zur Straße
    for(const [kante, rot] of [['z0', Math.PI], ['z1', 0], ['x0', -Math.PI/2], ['x1', Math.PI/2]]){
      const laenge = kante[0] === 'z' ? b.x1 - b.x0 : b.z1 - b.z0;
      for(let t = 14; t < laenge - 10; t += 34){
        if(Z() < .45) continue;
        const r = 1.1;
        let x = kante === 'x0' ? b.x0 + r : kante === 'x1' ? b.x1 - r : b.x0 + t;
        let z = kante === 'z0' ? b.z0 + r : kante === 'z1' ? b.z1 - r : b.z0 + t;
        if(b.art === 'promenade' && kante !== 'x1') continue;
        if(inHindernis(x, 1, z)) continue;
        moebel.s_bank.push({ x, z, y, rot });
        hindernis(x - .9, x + .9, z - .9, z + .9, -1, .9, 'bank');
        const ex = x + (kante[0] === 'z' ? 2 : 0), ez = z + (kante[0] === 'x' ? 2 : 0);
        if(!inHindernis(ex, 1, ez)){ moebel.s_eimer.push({ x: ex, z: ez, y, rot }); hindernis(ex - .3, ex + .3, ez - .3, ez + .3, -1, 1.1, 'eimer'); }
      }
    }
    // Container in Hinterhöfen
    if(b.art === 'stadt' && Z() < .5){
      const x = R(b.x0 + 6, b.x1 - 6), z = R(b.z0 + 6, b.z1 - 6);
      if(!inHindernis(x, 1, z) && !inHindernis(x + 1.2, 1, z) && !inHindernis(x - 1.2, 1, z)){ moebel.s_container.push({ x, z, y, rot: Math.floor(Z()*4)*Math.PI/2 }); hindernis(x - 1.1, x + 1.1, z - 1.1, z + 1.1, -1, 1.7, 'container'); }
    }
    // Straßencafés vor Hotels
    if(b.art === 'hotel'){
      for(let i = 0; i < 4; i++){ const x = b.x1 - 3.5, z = (b.z0 + b.z1)/2 - 12 + i*8; if(!inHindernis(x, 1, z)){ moebel.s_bistro.push({ x, z, y, rot: 0 }); hindernis(x - .4, x + .4, z - .4, z + .4, -1, 1.1, 'tisch'); } }
    }
  }

  /* Brücken */
  for(const br of BRUECKEN){
    const z0 = br.z - 8, z1 = br.z + 8;
    const n = 50;
    for(let s = 0; s < n; s++){
      const xa = 150 + 250*s/n, xb = 150 + 250*(s + 1)/n;
      const ya = brueckeH(xa), yb = brueckeH(xb);
      const B = bau('beton', (xa + xb)/2, br.z), Bn = bau('neon_pink', (xa + xb)/2, br.z);
      // Brüstungen
      for(const [za, zb, aussen] of [[z0, z0 + .4, z0], [z1 - .4, z1, z1]]){
        B.quad([xa, ya - 1.3, aussen], [xb, yb - 1.3, aussen], [xb, yb + 1, aussen], [xa, ya + 1, aussen], [0, 0], [1, 0], [1, 1], [0, 1]);
        B.quad([xa, ya + 1, za], [xa, ya + 1, zb], [xb, yb + 1, zb], [xb, yb + 1, za], [0, 0], [1, 0], [1, 1], [0, 1]);
        const innen = aussen === z0 ? zb : za;
        B.quad([xa, ya, innen], [xb, ya*0 + yb, innen], [xb, yb + 1, innen], [xa, ya + 1, innen], [0, 0], [1, 0], [1, 1], [0, 1]);
        // Leuchtband an der Unterkante
        const zz = aussen === z0 ? z0 - .03 : z1 + .03;
        Bn.quad([xa, ya - 1.25, zz], [xb, yb - 1.25, zz], [xb, yb - .95, zz], [xa, ya - .95, zz], [0, 0], [1, 0], [1, 1], [0, 1]);
      }
      // Unterseite
      B.quad([xa, ya - 1.3, z1], [xb, yb - 1.3, z1], [xb, yb - 1.3, z0], [xa, ya - 1.3, z0], [0, 0], [1, 0], [1, 1], [0, 1]);
    }
    // Brüstungen nach innen zeigen lassen (die erste Liste oben deckt die Innenseiten ab)
    for(const px of [168, 190, 275, 360, 382]){
      const y = brueckeH(px) - 1.3;
      for(const pz of [br.z - 4.5, br.z + 4.5]){
        bau('beton', px, br.z).seiten(px - 1.2, px + 1.2, WASSER_Y - 4, y, pz - 1.2, pz + 1.2, 4, 4);
        hindernis(px - 1.2, px + 1.2, pz - 1.2, pz + 1.2, WASSER_Y - 4, y, 'pfeiler');
      }
    }
  }

  /* Boden, Ufer, Strand */
  {
    for(const r of [FESTLAND, INSEL]){
      const B = bau('gras', (r.x0 + r.x1)/2, (r.z0 + r.z1)/2);
      B.quadOben([r.x0, -.06, r.z0], [r.x1, -.06, r.z0], [r.x1, -.06, r.z1], [r.x0, -.06, r.z1], [r.x0/3.5, r.z0/3.5], [r.x1/3.5, r.z0/3.5], [r.x1/3.5, r.z1/3.5], [r.x0/3.5, r.z1/3.5], [.92, .95, .9]);
      const W = bau('beton', (r.x0 + r.x1)/2, (r.z0 + r.z1)/2), u = -6, c = [.8, .78, .74];
      W.quad([r.x0, u, r.z0], [r.x1, u, r.z0], [r.x1, 0, r.z0], [r.x0, 0, r.z0], [0, 0], [1, 0], [1, 1], [0, 1], c);
      W.quad([r.x1, u, r.z1], [r.x0, u, r.z1], [r.x0, 0, r.z1], [r.x1, 0, r.z1], [0, 0], [1, 0], [1, 1], [0, 1], c);
      W.quad([r.x0, u, r.z1], [r.x0, u, r.z0], [r.x0, 0, r.z0], [r.x0, 0, r.z1], [0, 0], [1, 0], [1, 1], [0, 1], c);
      if(r !== INSEL) W.quad([r.x1, u, r.z0], [r.x1, u, r.z1], [r.x1, 0, r.z1], [r.x1, 0, r.z0], [0, 0], [1, 0], [1, 1], [0, 1], c);
    }
    // Strand: Sand und flacher Abhang ins Meer
    const S = bau('sand', 560, 0);
    S.quadOben([536, .05, -560], [570, .05, -560], [570, .05, 560], [536, .05, 560], [178.7, -186.7], [190, -186.7], [190, 186.7], [178.7, 186.7]);
    S.quadOben([570, .05, -560], [610, -3.6, -560], [610, -3.6, 560], [570, .05, 560], [190, -186.7], [203.3, -186.7], [203.3, 186.7], [190, 186.7]);
    // Flughafen
    const P = bau('piste', -575, 0);
    P.quadOben([-695, .03, -20], [-455, .03, -20], [-455, .03, 20], [-695, .03, 20], [0, 0], [6, 0], [6, 1], [0, 1]);
    const V = bau('gehweg', -600, -80);
    V.quadOben([-690, .02, -125], [-470, .02, -125], [-470, .02, -40], [-690, .02, -40], [-69, -12.5], [-47, -12.5], [-47, -4], [-69, -4], [.8, .8, .8]);
    gebaeude(-660, -540, -138, -112, 14, 'glas', { col: farbe('#e0f0ff') });
    // Tower
    bau('beton', -500, -110).seiten(-503, -497, 0, 26, -113, -107, 4, 4);
    gebaeude(-505, -495, -115, -105, 32, 'dunkel', { hx0: -505, hx1: -495 });
    markantes.flugzeug = { x: -675, z: 0 };
    // Stege
    for(const s of STEGE){
      const B = bau('holz', (s.x0 + s.x1)/2, (s.z0 + s.z1)/2);
      B.quader(s.x0, s.x1, .25, .45, s.z0, s.z1, 2);
      for(let x = s.x0 + 4; x < s.x1; x += 6) for(const z of [s.z0 + .3, s.z1 - .3])
        B.seiten(x - .2, x + .2, WASSER_Y - 2, .25, z - .2, z + .2, 1, 1);
    }
  }

  /* Riesenrad an der Promenade */
  {
    const g = new THREE.Group();
    g.position.set(127, 0, 150);
    const stahl = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: .6, roughness: .35 });
    const R2 = 24, Y = 29;
    const rad = new THREE.Group(); rad.position.y = Y; g.add(rad);
    const kranz = new THREE.Mesh(new THREE.TorusGeometry(R2, .35, 8, 72), stahl); kranz.rotation.y = Math.PI/2; rad.add(kranz);
    const kranz2 = kranz.clone(); kranz2.position.x = 2.4; rad.add(kranz2); kranz.position.x = -2.4;
    const led = new THREE.Mesh(new THREE.TorusGeometry(R2 + .45, .16, 6, 96), M.neon_cyan); led.rotation.y = Math.PI/2; rad.add(led);
    const led2 = new THREE.Mesh(new THREE.TorusGeometry(R2*.55, .14, 6, 64), M.neon_pink); led2.rotation.y = Math.PI/2; rad.add(led2);
    for(let i = 0; i < 16; i++){
      const sp = new THREE.Mesh(new THREE.BoxGeometry(.2, R2*2, .2), stahl);
      sp.rotation.x = i/16*Math.PI; rad.add(sp);
    }
    const gondeln = [];
    const gm = [0xff4fa0, 0x3ee6ff, 0xffd24a, 0x9b6bff].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: .4, metalness: .2 }));
    for(let i = 0; i < 16; i++){
      const gd = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.2), gm[i % 4]);
      gd.castShadow = true; g.add(gd); gondeln.push(gd);
    }
    for(const s of [-1, 1]) for(const t of [-1, 1]){
      const bein = new THREE.Mesh(new THREE.CylinderGeometry(.35, .5, 31, 8), stahl);
      bein.position.set(s*4, 14.5, t*8); bein.rotation.z = -s*.12; bein.rotation.x = t*.26; g.add(bein);
    }
    szene.add(g);
    hindernis(121, 133, 140, 160, -1, 4, 'rad');
    markantes.rad = { rad, gondeln, R: R2, Y };
  }

  /* Arena */
  if(markantes.arena){
    const a = markantes.arena;
    const band = T.arenaBand();
    band.repeat.set(4, 1);
    const fas2 = T.arenaFassade(); fas2.repeat.set(4, 1);
    const ledMat = new THREE.MeshStandardMaterial({ map: fas2, roughness: .45, metalness: .15, emissive: 0xffffff, emissiveMap: band, emissiveIntensity: 0 });
    fensterMats.push(ledMat);
    const wand = new THREE.Mesh(new THREE.CylinderGeometry(35, 36, 15, 64, 1, true), ledMat);
    wand.position.set(a.x, 7.6, a.z); wand.castShadow = wand.receiveShadow = true;
    const kuppel = new THREE.Mesh(new THREE.SphereGeometry(36, 48, 12, 0, Math.PI*2, 0, .55), new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: .35, metalness: .5 }));
    kuppel.scale.y = .38; kuppel.position.set(a.x, 15, a.z); kuppel.castShadow = true;
    szene.add(wand, kuppel);
  }

  /* Meshes aus den Baukästen */
  const schattenWerfer = new Set(['glas', 'dunkel', 'buero', 'deko', 'haus', 'ziegel', 'dach', 'beton']);
  for(const b of stuecke.values()){
    if(!b.vc) continue;
    const mesh = new THREE.Mesh(b.geo(), M[b.mat]);
    mesh.receiveShadow = !b.mat.startsWith('neon') && b.mat !== 'wandschatten';
    if(b.mat === 'wandschatten') mesh.renderOrder = 1;
    mesh.castShadow = schattenWerfer.has(b.mat);
    mesh.matrixAutoUpdate = false; mesh.updateMatrix();
    szene.add(mesh);
  }

  /* Palmen, Bäume, Laternen (instanziert) */
  const tmp = new THREE.Object3D();
  {
    const kurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(.2, 4.5, 0), new THREE.Vector3(1.4, 8.6, 0));
    const stammGeo = new THREE.TubeGeometry(kurve, 10, .2, 7, false);
    const stammMat = new THREE.MeshStandardMaterial({ map: T.stamm(), roughness: .9 });
    // Wedel: gebogene Streifen um die Krone
    const wedelBau = [];
    const spitze = kurve.getPoint(1);
    for(let i = 0; i < 9; i++){
      const w = i/9*Math.PI*2 + (i % 2)*.2;
      const g = new THREE.PlaneGeometry(1.5, 4.2, 1, 8);
      const pos = g.attributes.position;
      for(let v = 0; v < pos.count; v++){
        const lx = pos.getX(v), ly = pos.getY(v) + 2.1; // 0..4.2 entlang des Wedels
        const t = ly/4.2;
        // nach außen, dann herunterhängen
        const aus = ly*.92, hang = -t*t*2.4 + t*.6;
        const breite = lx*(.4 + .6*Math.sin(Math.PI*Math.min(1, t*1.15 + .05)));
        const ax = Math.cos(w), az = Math.sin(w);
        pos.setXYZ(v, spitze.x + ax*aus - az*breite, spitze.y + hang + Math.abs(lx)*.25*t, spitze.z + az*aus + ax*breite);
      }
      g.computeVertexNormals();
      wedelBau.push(g);
    }
    const wedelGeo = mergeSimple(wedelBau);
    const wedelMat = new THREE.MeshStandardMaterial({ map: T.wedel(), alphaTest: .45, side: THREE.DoubleSide, roughness: .8 });
    if(K && K.palmeFern && K.palmeNah) palmenAusModellen(szene, K, tmp);
    else {
      const stamm = new THREE.InstancedMesh(stammGeo, stammMat, palmen.length);
      const krone = new THREE.InstancedMesh(wedelGeo, wedelMat, palmen.length);
      palmen.forEach((p, i) => {
        tmp.position.set(p.x, p.y, p.z); tmp.rotation.set(0, p.r, 0); tmp.scale.setScalar(p.s); tmp.updateMatrix();
        stamm.setMatrixAt(i, tmp.matrix); krone.setMatrixAt(i, tmp.matrix);
      });
      stamm.castShadow = krone.castShadow = true; krone.receiveShadow = true;
      szene.add(stamm, krone);
    }
    if(K) turmeAufstellen(szene, K, tmp);

    if(K && K.s_baum){
      nachOrt(szene, K.s_baum, baeume, (b, t) => { t.position.set(b.x, b.y, b.z); t.rotation.set(0, b.r, 0); t.scale.setScalar(b.s*7.5); }, { weite: 420, schatten: true });
    } else {
    const baumStamm = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .28, 3, 6).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: 0x6b4f37, roughness: .9 }), baeume.length);
    const laubGeo = new THREE.IcosahedronGeometry(2.4, 1).translate(0, 4.2, 0);
    const laub = new THREE.InstancedMesh(laubGeo, new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: .85, flatShading: true }), baeume.length);
    const gruen = new THREE.Color();
    baeume.forEach((b, i) => {
      tmp.position.set(b.x, b.y, b.z); tmp.rotation.set(0, b.r, 0); tmp.scale.set(b.s, b.s*R(.85, 1.15), b.s); tmp.updateMatrix();
      baumStamm.setMatrixAt(i, tmp.matrix); laub.setMatrixAt(i, tmp.matrix);
      gruen.setHSL(.25 + R(-.03, .04), .45, .3 + R(-.06, .06)); laub.setColorAt(i, gruen);
    });
    baumStamm.castShadow = laub.castShadow = true;
    szene.add(baumStamm, laub);
    }
    if(K) moebelAufstellen(szene, K, tmp);

    // Laternen
    const mast = mergeSimple([
      new THREE.CylinderGeometry(.09, .13, 8, 6).translate(0, 4, 0),
      new THREE.BoxGeometry(2.6, .12, .12).translate(1.3, 7.9, 0),
    ]);
    const masten = new THREE.InstancedMesh(mast, new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: .6, roughness: .5 }), lampen.length);
    const kopfMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
    neon.push({ mat: kopfMat, basis: new THREE.Color(0xffd9a0), tag: .5, nacht: 4 });
    const koepfe = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, .14, .4), kopfMat, lampen.length);
    const fleckMat = new THREE.MeshBasicMaterial({ map: T.lichtfleck(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0 });
    const flecken = new THREE.InstancedMesh(new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI/2), fleckMat, lampen.length);
    lampen.forEach((l, i) => {
      const w = Math.atan2(-l.az, l.ax);
      tmp.position.set(l.x, l.y, l.z); tmp.rotation.set(0, w, 0); tmp.scale.setScalar(1); tmp.updateMatrix();
      masten.setMatrixAt(i, tmp.matrix);
      tmp.position.set(l.x + l.ax*2.4, l.y + 7.82, l.z + l.az*2.4); tmp.updateMatrix(); koepfe.setMatrixAt(i, tmp.matrix);
      tmp.position.set(l.x + l.ax*3, l.y + .07, l.z + l.az*3); tmp.updateMatrix(); flecken.setMatrixAt(i, tmp.matrix);
    });
    masten.castShadow = true;
    flecken.renderOrder = 2;
    szene.add(masten, koepfe, flecken);
    markantes.lichtflecken = fleckMat;

    // Warnlichter auf Antennen
    const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2020 });
    const warn = new THREE.InstancedMesh(new THREE.SphereGeometry(.6, 8, 6), warnMat, Math.max(1, gerueste.length));
    gerueste.forEach((g, i) => { tmp.position.set(g.x, g.y, g.z); tmp.rotation.set(0, 0, 0); tmp.updateMatrix(); warn.setMatrixAt(i, tmp.matrix); });
    warn.count = gerueste.length;
    szene.add(warn);
    markantes.warnMat = warnMat;
  }

  /* Strandschirme und Rettungstürme */
  {
    const n = 40;
    const schirm = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, .8, 8).translate(0, 2.4, 0), new THREE.MeshStandardMaterial({ roughness: .7 }), n);
    const stock = new THREE.InstancedMesh(new THREE.CylinderGeometry(.04, .04, 2.4, 4).translate(0, 1.2, 0), new THREE.MeshStandardMaterial({ color: 0xeeeeee }), n);
    const c = new THREE.Color();
    for(let i = 0; i < n; i++){
      tmp.position.set(R(552, 566), .05, R(-540, 540)); tmp.rotation.set(R(-.1, .1), 0, R(-.1, .1)); tmp.scale.setScalar(1); tmp.updateMatrix();
      schirm.setMatrixAt(i, tmp.matrix); stock.setMatrixAt(i, tmp.matrix);
      c.set(wahl(['#ff5fa2', '#3fd7ff', '#ffd54a', '#ffffff', '#ff8a3d', '#7cf2b0'])); schirm.setColorAt(i, c);
    }
    schirm.castShadow = true;
    szene.add(schirm, stock);
    const turmMat = [0xffb3c8, 0x9ff0dc, 0xffe28a, 0xb9d6ff].map(c2 => new THREE.MeshStandardMaterial({ color: c2, roughness: .6 }));
    for(let i = 0; i < 6; i++){
      const z = -450 + i*180, g = new THREE.Group();
      const haus = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 3), turmMat[i % 4]); haus.position.y = 3.4; haus.castShadow = true;
      const dach2 = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1, 4), turmMat[(i + 1) % 4]); dach2.position.y = 5; dach2.rotation.y = Math.PI/4;
      g.add(haus, dach2);
      for(const sx of [-1, 1]) for(const sz of [-1, 1]){
        const b = new THREE.Mesh(new THREE.BoxGeometry(.18, 2.4, .18), turmMat[0]); b.position.set(sx*1.2, 1.2, sz*1.2); g.add(b);
      }
      g.position.set(556, 0, z); szene.add(g);
      hindernis(554.5, 557.5, z - 1.5, z + 1.5, -1, 5.5, 'turm');
    }
  }

  return { M };
}

/* einfache Zusammenführung gleichartiger Geometrien (Position/Normale/UV) */
export function mergeSimple(geos){
  let n = 0, ni = 0;
  for(const g of geos){ const gg = g.index ? g : g; n += gg.attributes.position.count; ni += gg.index ? gg.index.count : gg.attributes.position.count; }
  const pos = new Float32Array(n*3), nor = new Float32Array(n*3), uv = new Float32Array(n*2), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for(const g of geos){
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o*3);
    if(g.attributes.normal) nor.set(g.attributes.normal.array, o*3);
    if(g.attributes.uv) uv.set(g.attributes.uv.array, o*2);
    if(g.index){ for(let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + o; oi += g.index.count; }
    else { for(let i = 0; i < c; i++) idx[oi + i] = o + i; oi += c; }
    o += c;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

/* ── Modelle aufstellen ────────────────────────────────────────── */
/* Instanzen nach Stadtviertel (200 m) getrennt: so fallen unsichtbare Viertel aus dem Bild
   (Frustum-Culling) und ferne Viertel werden gar nicht erst gezeichnet. */
export const ortsGruppen = [];
function nachOrt(szene, modell, liste, setze, { weite = 250, schatten = false } = {}){
  const viertel = new Map(), t = new THREE.Object3D();
  for(const e of liste){
    const k = Math.floor(e.x/200) + ',' + Math.floor(e.z/200);
    if(!viertel.has(k)) viertel.set(k, []);
    viertel.get(k).push(e);
  }
  for(const teile of viertel.values()){
    const ims = modell.teile.map(tl => { const im = new THREE.InstancedMesh(tl.geo, tl.mat, teile.length); im.castShadow = schatten; im.receiveShadow = true; szene.add(im); return im; });
    let cx = 0, cz = 0;
    teile.forEach((e, i) => { setze(e, t); t.updateMatrix(); for(const im of ims) im.setMatrixAt(i, t.matrix); cx += e.x; cz += e.z; });
    for(const im of ims){ im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); im.computeBoundingBox(); }
    ortsGruppen.push({ ims, x: cx/teile.length, z: cz/teile.length, weite });
  }
}
export function ortsGruppenZeigen(px, pz){
  for(const g of ortsGruppen){
    const an = Math.hypot(g.x - px, g.z - pz) < g.weite + 100;
    for(const im of g.ims) im.visible = an;
  }
}
function instanzen(szene, modell, n, schatten = true){
  return modell.teile.map(t => {
    const im = new THREE.InstancedMesh(t.geo, t.mat, Math.max(1, n));
    im.castShadow = schatten; im.receiveShadow = true; im.count = n;
    szene.add(im); return im;
  });
}
function turmeAufstellen(szene, K, tmp){
  for(const typ of ['condo', 'hochhaus']){
    const liste = modellHaeuser.filter(m => m.typ === typ);
    if(!liste.length || !K[typ]) continue;
    for(const t of K[typ].teile) if(!fensterMats.includes(t.mat) && t.mat.emissiveMap) fensterMats.push(t.mat);
    const ims = instanzen(szene, K[typ], liste.length);
    liste.forEach((m, i) => {
      tmp.position.set(m.x, .15, m.z); tmp.rotation.set(0, m.rot, 0); tmp.scale.setScalar(m.h); tmp.updateMatrix();
      for(const im of ims) im.setMatrixAt(i, tmp.matrix);
    });
    for(const im of ims){ im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }
}
// Palmen: alle als leichte Phoenix-Palme, die nächsten 90 als detaillierte Dattelpalme
const NAH_MAX = 45;
let palmFern = null, palmNah = null, palmNahIdx = [], palmIstNah = null;
const _m = new THREE.Matrix4(), _null = new THREE.Matrix4().makeScale(0, 0, 0);
function palmMatrix(p, nah, out){
  const t = new THREE.Object3D();
  t.position.set(p.x, p.y, p.z); t.rotation.set(0, p.r, 0); t.scale.setScalar(p.s*(nah ? 8.6 : 9.4)); t.updateMatrix();
  return out.copy(t.matrix);
}
function palmenAusModellen(szene, K, tmp){
  palmFern = instanzen(szene, K.palmeFern, palmen.length);
  palmNah = instanzen(szene, K.palmeNah, NAH_MAX);
  palmIstNah = new Uint8Array(palmen.length);
  palmen.forEach((p, i) => { palmMatrix(p, false, _m); for(const im of palmFern) im.setMatrixAt(i, _m); });
  for(const im of palmFern){ im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  for(const im of palmNah){ im.count = 0; im.frustumCulled = false; }
}
let palmTakt = 0;
export function palmenNah(px, pz, dt){
  if(!palmFern || (palmTakt -= dt) > 0) return;
  palmTakt = .5;
  const kand = [];
  for(let i = 0; i < palmen.length; i++){
    const p = palmen[i], d = (p.x - px)**2 + (p.z - pz)**2;
    if(d < 110*110) kand.push([d, i]);
  }
  kand.sort((a, b) => a[0] - b[0]);
  const neu = new Uint8Array(palmen.length);
  const idx = kand.slice(0, NAH_MAX).map(k => k[1]);
  for(const i of idx) neu[i] = 1;
  let geaendert = false;
  for(let i = 0; i < palmen.length; i++) if(neu[i] !== palmIstNah[i]){
    geaendert = true;
    const m = neu[i] ? _null : palmMatrix(palmen[i], false, _m);
    for(const im of palmFern) im.setMatrixAt(i, m);
  }
  palmIstNah = neu;
  if(!geaendert && idx.length === palmNahIdx.length) return;
  palmNahIdx = idx;
  idx.forEach((i, n) => { palmMatrix(palmen[i], true, _m); for(const im of palmNah) im.setMatrixAt(n, _m); });
  for(const im of palmNah){ im.count = idx.length; im.instanceMatrix.needsUpdate = true; }
  for(const im of palmFern) im.instanceMatrix.needsUpdate = true;
}

function moebelAufstellen(szene, K, tmp){
  const hoehe = { s_bank: .9, s_eimer: 1.05, s_container: 1.6, s_bistro: 1.05 };
  for(const [name, liste] of Object.entries(moebel)){
    if(!liste.length || !K[name]) continue;
    nachOrt(szene, K[name], liste, (m, t) => { t.position.set(m.x, m.y, m.z); t.rotation.set(0, m.rot, 0); t.scale.setScalar(hoehe[name]); }, { weite: name === 's_container' ? 260 : 170, schatten: false });
  }
  // Ampelmasten (Modell) und eigene Lampen darüber
  if(ampeln.length && K.s_ampel){
    const H = 4.2;
    nachOrt(szene, K.s_ampel, ampeln, (a, t) => { t.position.set(a.x, .15, a.z); t.rotation.set(0, a.rot, 0); t.scale.setScalar(H); }, { weite: 280, schatten: false });
    const lampe = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), ampeln.length*3);
    const c = new THREE.Color(.05, .05, .05);
    ampeln.forEach((a, i) => {
      const fx = Math.sin(a.rot), fz = Math.cos(a.rot), rx = Math.cos(a.rot), rz = -Math.sin(a.rot);
      [.925, .81, .68].forEach((hy, k) => {
        tmp.position.set(a.x + fx*H*.085 - rx*H*.05, .15 + hy*H, a.z + fz*H*.085 - rz*H*.05); tmp.scale.setScalar(1); tmp.updateMatrix();
        lampe.setMatrixAt(i*3 + k, tmp.matrix); lampe.setColorAt(i*3 + k, c);
      });
    });
    lampe.instanceMatrix.needsUpdate = true; lampe.computeBoundingSphere();
    szene.add(lampe);
    markantes.ampelLampen = lampe;
  }
}
// Ampelphase: 20 s Umlauf. 0–8 grün für Nord-Süd (z), 8–10 gelb, 10–18 grün für Ost-West (x), 18–20 gelb
export function ampelZustand(knotenId, achse, zeit){
  const v = ampelKnoten.get(knotenId);
  if(v === undefined) return 'gruen';
  const t = ((zeit + v) % 20 + 20) % 20;
  if(achse === 'z') return t < 8 ? 'gruen' : t < 10 ? 'gelb' : 'rot';
  return t < 10 ? 'rot' : t < 18 ? 'gruen' : 'gelb';
}
const _farben = { rot: [new THREE.Color(6, .2, .1), 0], gelb: [new THREE.Color(6, 3.6, .2), 1], gruen: [new THREE.Color(.2, 5, 1.2), 2] };
const _aus = new THREE.Color(.04, .04, .04);
export function ampelnZeigen(zeit){
  const l = markantes.ampelLampen; if(!l) return;
  ampeln.forEach((a, i) => {
    const z = ampelZustand(a.knoten, a.achse, zeit), [farbe, k] = _farben[z];
    for(let j = 0; j < 3; j++) l.setColorAt(i*3 + j, j === k ? farbe : _aus);
  });
  l.instanceColor.needsUpdate = true;
}
