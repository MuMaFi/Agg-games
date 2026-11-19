/* ═══════════════════════════════════════════════════════════════════
   Illegal Autostehlen — echte Modelle.
   Lädt die Autos und die Spielfigur (glTF, CC-BY 4.0, siehe Credits)
   und bringt sie in eine einheitliche Form:
     · vorne ist +z, Boden bei y = 0, Länge in Metern
     · Karosserie je Material zu einem Mesh zusammengefasst
     · vier Räder als eigene Drehgelenke (vorne lenkbar)
   Der BMW hat seine Räder an Knochen hängen; die werden hier aus der
   Haut herausgelöst und zu festen Teilen gebacken.
   ═══════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from '../bloxrot/lib/jsm/loaders/GLTFLoader.js';
import { clone as skelettKlon } from '../bloxrot/lib/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from './lib/BufferGeometryUtils.js';

export const MODELLE = {
  fox:     { datei: 'modelle/fox.glb',     drehung: Math.PI/2, laenge: 4.75, lack: 'body', glas: ['glass'], licht: ['lights'], radName: /wheel/i },
  e30:     { datei: 'modelle/e30.glb',     drehung: 0,         laenge: 4.35, lack: 'Marrakesh_brown_metallic', glas: ['Glass'], licht: ['Fog_lights', 'Tail_lights', 'Headlight', 'Reverse_lights', 'Reflector'], radKnochen: /wheel/i },
  mustang: { datei: 'modelle/mustang.glb', drehung: Math.PI/2, laenge: 4.95, lack: null, glas: [], licht: [], radName: /^Wheel$/, radGeteilt: true },
};

// Fahrverhalten und Aussehen der Spieltypen
export const TYPEN = {
  limo:    { modell: 'fox',     vmax: 46, acc: 7.5, griff: 9,  lenk: 2.2 },
  e30:     { modell: 'e30',     vmax: 50, acc: 8.5, griff: 10, lenk: 2.4 },
  sport:   { modell: 'mustang', vmax: 64, acc: 11.5, griff: 10, lenk: 2.4 },
  polizei: { modell: 'fox',     vmax: 56, acc: 10.5, griff: 10, lenk: 2.4, farbe: '#141c2e', blaulicht: true },
  taxi:    { modell: 'fox',     vmax: 44, acc: 7.5, griff: 9,  lenk: 2.2, farbe: '#f2b705', taxi: true },
};
export const LACKE = ['#f4f4f2', '#141518', '#9da3aa', '#7d0f1d', '#1d3f8a', '#0f5c58', '#c2185b', '#e6b422', '#c4561b', '#22412c', '#4a2a73', '#5e7f9c', '#cbb994', '#3a3d44'];

const vorlagen = {};
export const lichtMats = [];   // leuchten nachts
export const MAT = {
  blauLicht: new THREE.MeshBasicMaterial({ color: 0x0a1a66 }),
  rotLicht: new THREE.MeshBasicMaterial({ color: 0x660a0a }),
  schwarz: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: .5, metalness: .2 }),
  taxiSchild: new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
};

const lader = new GLTFLoader();

/* Geometrie auf Position/Normale/UV reduzieren, ohne Index, im Ziel-Raum */
function vereinheitlichen(geo, matrix){
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  const neu = new THREE.BufferGeometry();
  neu.setAttribute('position', g.attributes.position.clone());
  if(g.attributes.normal) neu.setAttribute('normal', g.attributes.normal.clone());
  if(g.attributes.uv) neu.setAttribute('uv', g.attributes.uv.clone());
  else neu.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2), 2));
  if(matrix) neu.applyMatrix4(matrix);
  if(!g.attributes.normal) neu.computeVertexNormals();
  return neu;
}
/* Dreiecke einer Geometrie nach einer Zuordnungsfunktion aufteilen */
function aufteilen(geo, zuordnung){
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  const toepfe = new Map();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for(let t = 0; t < pos.count; t += 3){
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
    const k = zuordnung(t, a, b, c);
    if(!toepfe.has(k)) toepfe.set(k, { p: [], n: [], u: [] });
    const z = toepfe.get(k);
    for(let i = 0; i < 3; i++){
      z.p.push(pos.getX(t + i), pos.getY(t + i), pos.getZ(t + i));
      z.n.push(nor.getX(t + i), nor.getY(t + i), nor.getZ(t + i));
      z.u.push(uv.getX(t + i), uv.getY(t + i));
    }
  }
  const out = new Map();
  for(const [k, z] of toepfe){
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(z.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(z.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(z.u, 2));
    out.set(k, g);
  }
  return out;
}
const quadrant = (x, z) => (x > 0 ? 'l' : 'r') + (z > 0 ? 'v' : 'h');

async function vorlageLaden(name){
  const cfg = MODELLE[name];
  const gltf = await lader.loadAsync(cfg.datei);
  const wurzel = gltf.scene;
  wurzel.updateMatrixWorld(true);
  wurzel.traverse(o => { if(o.isSkinnedMesh) o.skeleton.update(); });
  // Rohteile sammeln: { geo (Weltraum des Modells), mat, rad: null|'auto'|Name }
  const roh = [];
  wurzel.traverse(o => {
    if(!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if(mats.length > 1) return; // kommt bei diesen Modellen nicht vor
    const mat = mats[0];
    if(o.isSkinnedMesh){
      // Haut im Ruhezustand backen und Räder anhand der Knochen herauslösen
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      const pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
      const v = new THREE.Vector3();
      const istRad = new Uint8Array(pos.count);
      // eigene Fassung von applyBoneTransform: ungültige Knochenverweise werden übersprungen
      const knochenM = o.skeleton.bones.map((bn, j) => bn ? new THREE.Matrix4().multiplyMatrices(bn.matrixWorld, o.skeleton.boneInverses[j]) : null);
      const basis = new THREE.Vector3(), summe = new THREE.Vector3(), tmp = new THREE.Vector3();
      for(let i = 0; i < pos.count; i++){
        basis.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix);
        summe.set(0, 0, 0);
        let gw = 0, best = 0, bj = -1;
        for(let k = 0; k < 4; k++){
          const w = sw.getComponent(i, k), j = si.getComponent(i, k);
          if(!w || !knochenM[j]) continue;
          summe.addScaledVector(tmp.copy(basis).applyMatrix4(knochenM[j]), w); gw += w;
          if(w > best){ best = w; bj = j; }
        }
        if(gw > 0) v.copy(summe).multiplyScalar(1/gw).applyMatrix4(o.bindMatrixInverse);
        else v.fromBufferAttribute(pos, i);
        pos.setXYZ(i, v.x, v.y, v.z);
        const knochen = o.skeleton.bones[bj];
        istRad[i] = knochen && cfg.radKnochen && cfg.radKnochen.test(knochen.name) && !/steer|lenk/i.test(knochen.name) ? 1 : 0;
      }
      const ein = vereinheitlichen(g, o.matrixWorld);
      const teile = aufteilen(ein, t => istRad[t] && istRad[t + 1] && istRad[t + 2] ? 'rad' : 'koerper');
      for(const [k, geo] of teile) roh.push({ geo, mat, rad: k === 'rad' ? 'auto' : null });
      return;
    }
    let rad = null;
    for(let p = o; p; p = p.parent) if(cfg.radName && cfg.radName.test(p.name || '')){ rad = cfg.radGeteilt ? 'auto' : p.name; break; }
    roh.push({ geo: vereinheitlichen(o.geometry, o.matrixWorld), mat, rad });
  });
  // In den Fahrzeugraum drehen, skalieren und auf den Boden stellen
  const dreh = new THREE.Matrix4().makeRotationY(cfg.drehung);
  for(const r of roh) r.geo.applyMatrix4(dreh);
  const box = new THREE.Box3();
  for(const r of roh){ r.geo.computeBoundingBox(); box.union(r.geo.boundingBox); }
  const groesse = box.getSize(new THREE.Vector3());
  const k = cfg.laenge/groesse.z;
  const verschiebe = new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x)/2, -box.min.y, -(box.min.z + box.max.z)/2);
  const skal = new THREE.Matrix4().makeScale(k, k, k).multiply(verschiebe);
  for(const r of roh){ r.geo.applyMatrix4(skal); r.geo.computeBoundingBox(); }
  // Radteile nach Viertel zuordnen ('auto') oder nach ihrem Knoten
  const radTeile = { lv: [], rv: [], lh: [], rh: [] };
  const koerper = new Map(); // Material → Geometrien
  for(const r of roh){
    if(!r.rad){ if(!koerper.has(r.mat)) koerper.set(r.mat, []); koerper.get(r.mat).push(r.geo); continue; }
    if(r.rad === 'auto'){
      const teile = aufteilen(r.geo, (t, a, b, c) => quadrant((a.x + b.x + c.x)/3, (a.z + b.z + c.z)/3));
      for(const [q, g] of teile) radTeile[q].push({ geo: g, mat: r.mat });
    } else {
      const bb = r.geo.boundingBox, cx = (bb.min.x + bb.max.x)/2, cz = (bb.min.z + bb.max.z)/2;
      radTeile[quadrant(cx, cz)].push({ geo: r.geo, mat: r.mat });
    }
  }
  const raeder = [];
  let radR = .35;
  for(const [q, liste] of Object.entries(radTeile)){
    if(!liste.length) continue;
    const bb = new THREE.Box3();
    for(const t of liste){ t.geo.computeBoundingBox(); bb.union(t.geo.boundingBox); }
    const mitte = bb.getCenter(new THREE.Vector3());
    radR = Math.max((bb.max.y - bb.min.y)/2, .2);
    const proMat = new Map();
    for(const t of liste){ t.geo.translate(-mitte.x, -mitte.y, -mitte.z); if(!proMat.has(t.mat)) proMat.set(t.mat, []); proMat.get(t.mat).push(t.geo); }
    const teile = [...proMat].map(([mat, gs]) => ({ mat, geo: zusammen(gs) }));
    raeder.push({ q, vorne: q[1] === 'v', mitte, teile });
  }
  const teile = [...koerper].map(([mat, gs]) => ({ mat, geo: zusammen(gs) }));
  // Materialien aufbereiten
  for(const t of teile.concat(raeder.flatMap(r => r.teile))) materialAufbereiten(t, cfg);
  const gesamt = new THREE.Box3();
  for(const t of teile){ t.geo.computeBoundingBox(); gesamt.union(t.geo.boundingBox); }
  const dach = gesamt.max.y;
  let dachZ = 0;
  const glas = teile.find(t => cfg.glas.includes(t.original));
  if(glas){ const b = glas.geo.boundingBox; dachZ = (b.min.z + b.max.z)/2 - .1; }
  vorlagen[name] = { cfg, teile, raeder, L: cfg.laenge, W: gesamt.max.x - gesamt.min.x, H: dach, radR, dachZ };
}
function zusammen(gs){
  if(gs.length === 1) return gs[0];
  const g = mergeGeometries(gs, false);
  return g || gs[0];
}
function materialAufbereiten(t, cfg){
  const m = t.mat;
  t.original = m.name;
  if(cfg.lack && m.name === cfg.lack){ t.lack = true; }
  if(cfg.glas.includes(m.name)){
    const g = m.clone(); g.color.set(0x0c1418); g.metalness = .9; g.roughness = .04; g.envMapIntensity = 1.4;
    g.transparent = false; g.opacity = 1;
    t.mat = g;
  }
  if(cfg.licht.includes(m.name)){
    const l = m.clone();
    l.emissive = m.map ? new THREE.Color(1, 1, 1) : m.color.clone();
    if(m.map) l.emissiveMap = m.map;
    l.emissiveIntensity = 0; t.mat = l; lichtMats.push(l);
  }
  if(m.emissiveMap && !lichtMats.includes(m)){ m.emissive = new THREE.Color(1, 1, 1); m.emissiveIntensity = 0; lichtMats.push(m); }
  // Reifen und Chrom etwas glaubwürdiger
  if(/tire|rubber/i.test(m.name)){ m.roughness = .9; m.metalness = 0; }
  if(/chrom|rim|alumin|steel/i.test(m.name)){ m.metalness = Math.max(m.metalness, .9); m.roughness = Math.min(m.roughness, .3); }
  if(m.name === 'Body' && m.map){ m.metalness = Math.max(m.metalness, .45); m.roughness = Math.min(m.roughness, .35); }
}

const lackCache = new Map();
function lackMat(orig, hex){
  const k = orig.uuid + hex;
  if(!lackCache.has(k)){
    const m = new THREE.MeshPhysicalMaterial({ color: hex, metalness: .55, roughness: .3, clearcoat: 1, clearcoatRoughness: .05, normalMap: orig.normalMap || null });
    lackCache.set(k, m);
  }
  return lackCache.get(k);
}

export async function ladeAlles(fortschritt){
  const namen = Object.keys(MODELLE);
  let n = 0;
  for(const name of namen){
    await vorlageLaden(name);
    fortschritt && fortschritt(++n/(namen.length + 1));
  }
  await ladeFigur();
  fortschritt && fortschritt(1);
}

/* ── Auto bauen (gleiche Form wie das alte Modell) ─────────────── */
export function baueAuto(typ, farbeHex){
  const t = TYPEN[typ] || TYPEN.limo;
  const v = vorlagen[t.modell];
  const g = new THREE.Group();
  const aufbau = new THREE.Group(); g.add(aufbau);
  const farbe = t.farbe || farbeHex || LACKE[Math.floor(Math.random()*LACKE.length)];
  for(const teil of v.teile){
    const m = new THREE.Mesh(teil.geo, teil.lack ? lackMat(teil.mat, farbe) : teil.mat);
    m.castShadow = true; m.receiveShadow = true;
    aufbau.add(m);
  }
  const raeder = [], lenkraeder = [];
  for(const r of v.raeder){
    const halter = new THREE.Group(); halter.position.copy(r.mitte);
    const dreher = new THREE.Group(); halter.add(dreher);
    for(const teil of r.teile){ const m = new THREE.Mesh(teil.geo, teil.mat); m.castShadow = true; dreher.add(m); }
    g.add(halter); raeder.push(dreher); if(r.vorne) lenkraeder.push(halter);
  }
  if(t.blaulicht){
    const y = v.H;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.25, .1, .32), MAT.schwarz); bar.position.set(0, y + .04, v.dachZ);
    const blau = new THREE.Mesh(new THREE.BoxGeometry(.52, .15, .28), MAT.blauLicht); blau.position.set(.33, y + .14, v.dachZ);
    const rot = new THREE.Mesh(new THREE.BoxGeometry(.52, .15, .28), MAT.rotLicht); rot.position.set(-.33, y + .14, v.dachZ);
    aufbau.add(bar, blau, rot);
  }
  if(t.taxi){
    const s = new THREE.Mesh(new THREE.BoxGeometry(.7, .22, .3), MAT.taxiSchild); s.position.set(0, v.H + .1, v.dachZ); aufbau.add(s);
  }
  const spec = { L: v.L, W: v.W, rad: v.radR, vmax: t.vmax, acc: t.acc, griff: t.griff, lenk: t.lenk, rueck: 12 };
  return { g, aufbau, raeder, lenkraeder, spec };
}

/* ── Spielfigur: Nathan (Renderpeople) ─────────────────────────── */
let figur = null;
async function ladeFigur(){
  const gltf = await lader.loadAsync('modelle/nathan.glb');
  const wurzel = gltf.scene;
  const box = new THREE.Box3().setFromObject(wurzel);
  const k = 1.78/(box.max.y - box.min.y);
  wurzel.scale.multiplyScalar(k);
  wurzel.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(wurzel);
  wurzel.position.y -= b2.min.y;
  wurzel.traverse(o => { if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; if(o.material){ o.material.roughness = .8; o.material.metalness = 0; } } });
  // Laufclip ohne Vorwärtsdrift: die Hüfte bleibt über dem Ursprung
  const clip = gltf.animations[0];
  for(const tr of clip.tracks){
    if(!/\.position$/.test(tr.name)) continue;
    if(!/(root|hip)/i.test(tr.name)) continue;
    const w = tr.values, n = w.length/3;
    const d = [0, 1, 2].map(a => w[(n - 1)*3 + a] - w[a]);
    for(let i = 0; i < n; i++){
      const t = n > 1 ? i/(n - 1) : 0;
      for(let a = 0; a < 3; a++) w[i*3 + a] -= d[a]*t;
    }
  }
  // Ruhehaltung: der Moment, in dem beide Füße am dichtesten beieinander stehen
  const probe = skelettKlon(wurzel);
  const mixer = new THREE.AnimationMixer(probe);
  const a = mixer.clipAction(clip); a.play();
  const fussL = findeKnochen(probe, /foot_l|ball_l/i), fussR = findeKnochen(probe, /foot_r|ball_r/i);
  let ruhe = 0, best = Infinity;
  const pl = new THREE.Vector3(), pr = new THREE.Vector3();
  for(let i = 0; i < 40; i++){
    const t = i/40*clip.duration;
    mixer.setTime(t); probe.updateMatrixWorld(true);
    if(!fussL || !fussR) break;
    fussL.getWorldPosition(pl); fussR.getWorldPosition(pr);
    // Füße dicht beieinander UND beide auf dem Boden (sonst schwingt gerade einer vorbei)
    const d = Math.hypot(pl.x - pr.x, pl.z - pr.z) + Math.abs(pl.y - pr.y)*4;
    if(d < best){ best = d; ruhe = t; }
  }
  // Blickrichtung: wohin schaut die Figur? (Nase vor dem Kopf)
  let mat = null; wurzel.traverse(o => { if(o.isMesh && !mat) mat = o.material; });
  figur = { wurzel, clip, ruhe, dauer: clip.duration, mat };
}
function findeKnochen(o, re){ let r = null; o.traverse(b => { if(!r && b.isBone && re.test(b.name)) r = b; }); return r; }

/* Kleidervarianten: Shirt, Hose, Haut und Haare in der Textur umfärben.
   Helligkeit bleibt erhalten, damit Falten und Licht stimmen. */
const OUTFITS = [
  { shirt: '#c8323c', hose: '#2b2b30', haut: 1.0, haar: '#1a1410' },
  { shirt: '#f2f2ee', hose: '#c9b48a', haut: .62, haar: '#0e0b09' },
  { shirt: '#1f7a5a', hose: '#3a4a6a', haut: .82, haar: '#5a3a1e' },
  { shirt: '#f2c12e', hose: '#22262e', haut: .45, haar: '#0a0a0a' },
  { shirt: '#ff5fa2', hose: '#e8e2d0', haut: 1.08, haar: '#b8924a' },
  { shirt: '#2b2b30', hose: '#5b6b57', haut: .72, haar: '#2a1c12' },
  { shirt: '#3fa2e6', hose: '#1d2a44', haut: 1.12, haar: '#c9a465' },
  { shirt: '#8f6bff', hose: '#30343c', haut: .55, haar: '#111111' },
];
const outfitCache = new Map();
function hsv(r, g, b){
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if(d){ if(mx === r) h = ((g - b)/d) % 6; else if(mx === g) h = (b - r)/d + 2; else h = (r - g)/d + 4; h *= 60; if(h < 0) h += 360; }
  return [h, mx ? d/mx : 0, mx];
}
function outfitMaterial(n){
  if(outfitCache.has(n)) return outfitCache.get(n);
  const basis = figur.mat, bild = basis.map && basis.map.image;
  let mat = basis;
  try {
    const o = OUTFITS[n % OUTFITS.length];
    const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); g.drawImage(bild, 0, 0, S, S);
    const d = g.getImageData(0, 0, S, S), p = d.data;
    const farbe = h => { const x = new THREE.Color(h); return [x.r*255, x.g*255, x.b*255]; };
    const shirt = farbe(o.shirt), hose = farbe(o.hose), haar = farbe(o.haar);
    for(let i = 0; i < p.length; i += 4){
      const r = p[i]/255, gg = p[i + 1]/255, b = p[i + 2]/255;
      const [h, sat, v] = hsv(r, gg, b);
      const lum = (r + gg + b)/3;
      let ziel = null, k = 1;
      if(h > 195 && h < 245 && sat < .3 && v > .55){ ziel = shirt; k = lum/.72; }          // Shirt
      else if(h > 200 && h < 240 && sat >= .28 && v > .12 && v < .62){ ziel = hose; k = lum/.32; } // Jeans
      else if(h > 5 && h < 40 && sat > .22 && sat < .7 && v > .32){                           // Haut
        p[i] = Math.min(255, p[i]*o.haut); p[i + 1] = Math.min(255, p[i + 1]*o.haut*(o.haut < .8 ? .94 : 1)); p[i + 2] = Math.min(255, p[i + 2]*o.haut*(o.haut < .8 ? .88 : 1));
        continue;
      }
      else if(h > 10 && h < 45 && v < .3 && sat > .2){ ziel = haar; k = lum/.16; }            // Haare
      if(ziel){ p[i] = Math.min(255, ziel[0]*k); p[i + 1] = Math.min(255, ziel[1]*k); p[i + 2] = Math.min(255, ziel[2]*k); }
    }
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = basis.map.flipY;
    mat = basis.clone(); mat.map = t;
  } catch(e){ mat = basis; }
  outfitCache.set(n, mat);
  return mat;
}
export function baueFigur(variante = 0){
  const g = new THREE.Group();
  const k = skelettKlon(figur.wurzel);
  if(variante > 0){ const m = outfitMaterial(variante - 1); k.traverse(o => { if(o.isMesh) o.material = m; }); }
  g.add(k);
  const mixer = new THREE.AnimationMixer(k);
  const aktion = mixer.clipAction(figur.clip);
  aktion.play();
  const f = { g, koerper: k, mixer, aktion, t: Math.random()*figur.dauer, ruhe: figur.ruhe, dauer: figur.dauer, gewicht: 0 };
  mixer.setTime(f.ruhe);
  return f;
}
// Tempo in m/s: 0 steht, ~1.4 geht, ab 5 rennt (schnellere Wiedergabe, mehr Vorlage)
export function animiereFigur(f, tempo, dt){
  const geht = Math.min(1, tempo/1.2);
  f.gewicht = f.gewicht + (geht - f.gewicht)*Math.min(1, dt*8);
  if(f.gewicht < .04){
    // langsam in die Ruhehaltung gleiten
    const d = ((f.ruhe - f.t) % f.dauer + f.dauer*1.5) % f.dauer - f.dauer/2;
    f.t += Math.abs(d) < .02 ? d : d*Math.min(1, dt*10);
  } else {
    const rate = tempo < 2.5 ? tempo/1.35 : 1.6 + (tempo - 2.5)*.14;
    f.t += dt*rate;
  }
  f.t = ((f.t % f.dauer) + f.dauer) % f.dauer;
  f.mixer.setTime(f.t);
  f.koerper.rotation.x = tempo > 5 ? .12 : tempo > 2.5 ? .05 : 0;
}

/* ── Kulisse: Türme und Palmen (CC BY 4.0, siehe Credits) ──────────
   Jedes Modell wird zu wenigen Geometrien je Material, Boden bei y = 0,
   mittig, Höhe 1 (Breite/Tiefe im gleichen Maßstab). So lässt es sich
   mit InstancedMesh beliebig oft und in jeder Größe aufstellen.        */
export const kulisse = {};
async function kulisseLaden(name, datei, art){
  const gltf = await lader.loadAsync(datei);
  const w = gltf.scene; w.updateMatrixWorld(true);
  const proMat = new Map();
  w.traverse(o => { if(o.isMesh){ const m = Array.isArray(o.material) ? o.material[0] : o.material; if(!proMat.has(m)) proMat.set(m, []); proMat.get(m).push(vereinheitlichen(o.geometry, o.matrixWorld)); } });
  const box = new THREE.Box3();
  for(const gs of proMat.values()) for(const g of gs){ g.computeBoundingBox(); box.union(g.boundingBox); }
  const groesse = box.getSize(new THREE.Vector3());
  const k = 1/groesse.y;
  const m4 = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x)/2, -box.min.y, -(box.min.z + box.max.z)/2));
  const teile = [];
  for(const [mat, gs] of proMat){
    for(const g of gs) g.applyMatrix4(m4);
    const geo = zusammen(gs); geo.computeBoundingSphere();
    if(art === 'turm') nachtfenster(mat);
    if(mat.alphaTest || mat.transparent){ mat.transparent = false; mat.alphaTest = Math.max(mat.alphaTest || 0, .45); mat.side = THREE.DoubleSide; }
    teile.push({ geo, mat });
  }
  kulisse[name] = { teile, b: groesse.x*k, t: groesse.z*k };
}
// Nachtfenster: dunkle, bläuliche Stellen der Fassade werden zu Fenstern, ein Teil davon leuchtet
export const turmMats = [];
function nachtfenster(mat){
  const bild = mat.map && mat.map.image;
  if(!bild) return;
  try {
    const w = Math.min(1024, bild.width), h = Math.min(1024, bild.height);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(bild, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h), p = d.data;
    const zelle = 6, an = [];
    const z = (x, y) => { const s = Math.sin(x*127.1 + y*311.7)*43758.5453; return s - Math.floor(s); };
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
      const i = (y*w + x)*4, r = p[i], gg = p[i + 1], b = p[i + 2];
      const hell = (r + gg + b)/3;
      const glas = (b > r + 6 || gg > r + 10) && hell < 150;
      const cx = (x/zelle)|0, cy = (y/zelle)|0;
      const los = z(cx, cy);
      if(glas && los < .42){
        const warm = z(cy, cx) < .75;
        p[i] = warm ? 255 : 210; p[i + 1] = warm ? 196 : 228; p[i + 2] = warm ? 128 : 255;
        const f = .55 + .45*z(cx + 9, cy);
        p[i] *= f; p[i + 1] *= f; p[i + 2] *= f;
      } else { p[i] = p[i + 1] = p[i + 2] = 0; }
      p[i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = mat.map.flipY;
    t.wrapS = mat.map.wrapS; t.wrapT = mat.map.wrapT;
    mat.emissiveMap = t; mat.emissive = new THREE.Color(1, 1, 1); mat.emissiveIntensity = 0;
    mat.roughness = Math.min(mat.roughness ?? 1, .6); mat.metalness = Math.max(mat.metalness ?? 0, .15);
    mat.needsUpdate = true;
    turmMats.push(mat);
  } catch(e){ /* ohne Nachtfenster weiter */ }
}
export async function ladeKulisse(){
  await kulisseLaden('condo', 'modelle/condo.glb', 'turm');
  await kulisseLaden('hochhaus', 'modelle/hochhaus.glb', 'turm');
  await kulisseLaden('palmeNah', 'modelle/palme_dattel.glb', 'palme');
  await kulisseLaden('palmeFern', 'modelle/palme_phoenix.glb', 'palme');
  for(const n of ['i_huhn', 'i_essen', 'i_poster', 'i_tisch', 'i_kasse', 'i_theke']) await kulisseLaden(n, 'modelle/' + n + '.glb', 'deko');
}

/* ── Waffen (CC BY 4.0, siehe Credits) ─────────────────────────────
   Jede Waffe wird so gedreht, dass die Mündung nach +z zeigt, oben +y,
   der Griff liegt am Ursprung; Länge in Metern.                        */
export const WAFFEN_MODELL = {
  pistole:  { datei: 'modelle/w_pistole.glb',  drehung: 0,           laenge: .2 },
  revolver: { datei: 'modelle/w_revolver.glb', drehung: Math.PI/2,   laenge: .34 },
  schrot:   { datei: 'modelle/w_schrot.glb',   drehung: -Math.PI/2,  laenge: .56 },
  uzi:      { datei: 'modelle/w_uzi.glb',      drehung: -Math.PI/2,  laenge: .5 },
  gewehr:   { datei: 'modelle/w_gewehr.glb',   drehung: 0,           laenge: .86 },
};
export const waffenVorlagen = {};
export async function ladeWaffen(){
  for(const [name, cfg] of Object.entries(WAFFEN_MODELL)){
    const gltf = await lader.loadAsync(cfg.datei);
    const w = gltf.scene; w.updateMatrixWorld(true);
    const dreh = new THREE.Matrix4().makeRotationY(cfg.drehung);
    const teile = [];
    w.traverse(o => { if(o.isMesh){ const g = vereinheitlichen(o.geometry, o.matrixWorld); g.applyMatrix4(dreh); teile.push({ geo: g, mat: Array.isArray(o.material) ? o.material[0] : o.material }); } });
    const box = new THREE.Box3(); for(const t of teile){ t.geo.computeBoundingBox(); box.union(t.geo.boundingBox); }
    const sz = box.getSize(new THREE.Vector3());
    const k = cfg.laenge/sz.z;
    // Griff ungefähr im hinteren Drittel, unten
    const m = new THREE.Matrix4().makeScale(k, k, k).multiply(new THREE.Matrix4().makeTranslation(-(box.min.x + box.max.x)/2, -(box.min.y + box.max.y)/2, -(box.min.z + (box.max.z - box.min.z)*.3)));
    for(const t of teile){ t.geo.applyMatrix4(m); t.geo.computeBoundingSphere(); }
    waffenVorlagen[name] = { teile, laenge: cfg.laenge*.7 };
  }
}
export function baueWaffe(name, skala = 1){
  const v = waffenVorlagen[name];
  const g = new THREE.Group();
  if(!v) return g;
  for(const t of v.teile){ const m = new THREE.Mesh(t.geo, t.mat); m.castShadow = true; g.add(m); }
  g.scale.setScalar(skala);
  g.userData.laenge = v.laenge*skala;
  return g;
}

// ein Kulissenmodell als normales Objekt in gewünschter Höhe
export function kulissenStueck(name, hoehe){
  const k = kulisse[name], g = new THREE.Group();
  if(!k) return g;
  for(const t of k.teile){ const m = new THREE.Mesh(t.geo, t.mat); m.castShadow = true; m.receiveShadow = true; g.add(m); }
  g.scale.setScalar(hoehe);
  g.userData.breite = k.b*hoehe; g.userData.tiefe = k.t*hoehe;
  return g;
}
