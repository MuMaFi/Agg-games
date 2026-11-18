/* ═══════════════════════════════════════════════════════════════════
   Illegal Autostehlen — selbst gebaute Modelle.
   Boote, ein Kleinflugzeug, ein Linienflieger und ein Hubschrauber.
   Autos und Leute kommen als echte Modelle aus fahrzeugbau.js.
   Vorne ist +z, links ist +x, oben +y.
   ═══════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';

/* ── gemeinsame Materialien ───────────────────────────────────── */
const lackCache = new Map();
export function lack(hex){
  if(!lackCache.has(hex)) lackCache.set(hex, new THREE.MeshPhysicalMaterial({ color: hex, metalness: .55, roughness: .32, clearcoat: 1, clearcoatRoughness: .06 }));
  return lackCache.get(hex);
}
export const MAT = {
  glas: new THREE.MeshStandardMaterial({ color: 0x0b1117, metalness: .9, roughness: .06 }),
  reifen: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: .92 }),
  chrom: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: .2 }),
  schwarz: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: .6 }),
};

/* ── Boot ──────────────────────────────────────────────────────── */
export function baueBoot(farbeHex = '#ff4fa0'){
  const g = new THREE.Group();
  const s = new THREE.Shape();
  s.moveTo(-4.4, -1.45); s.lineTo(1.6, -1.45); s.quadraticCurveTo(4.0, -1.2, 4.7, 0); s.quadraticCurveTo(4.0, 1.2, 1.6, 1.45); s.lineTo(-4.4, 1.45); s.closePath();
  const rumpf = new THREE.ExtrudeGeometry(s, { depth: 1.15, bevelEnabled: true, bevelThickness: .18, bevelSize: .14, bevelSegments: 2 });
  rumpf.rotateX(-Math.PI/2); rumpf.rotateY(-Math.PI/2);
  const r = new THREE.Mesh(rumpf, new THREE.MeshPhysicalMaterial({ color: 0xf6f6f4, roughness: .25, clearcoat: 1 }));
  r.castShadow = true; g.add(r);
  const streifen = new THREE.ExtrudeGeometry(s, { depth: .22, bevelEnabled: false });
  streifen.rotateX(-Math.PI/2); streifen.rotateY(-Math.PI/2); streifen.scale(1.035, 1, 1.02); streifen.translate(0, .55, 0);
  g.add(new THREE.Mesh(streifen, lack(farbeHex)));
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, .5, 2.4), new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: .7 }));
  deck.position.set(0, 1.45, -1.6); g.add(deck);
  const scheibe = new THREE.Mesh(new THREE.BoxGeometry(2.1, .7, .08), MAT.glas);
  scheibe.position.set(0, 1.75, .4); scheibe.rotation.x = -.5; g.add(scheibe);
  const motor = new THREE.Mesh(new THREE.BoxGeometry(.6, .8, .6), MAT.schwarz); motor.position.set(0, 1.1, -4.6); g.add(motor);
  return { g };
}

/* ── Kleinflugzeug ─────────────────────────────────────────────── */
export function baueFlugzeug(gross = false){
  const g = new THREE.Group();
  const weiss = new THREE.MeshPhysicalMaterial({ color: 0xf4f5f7, metalness: .3, roughness: .3, clearcoat: .8 });
  const akzent = lack(gross ? '#1f3f8f' : '#ff3f8e');
  const profil = [[0, -5.2], [.35, -5], [.7, -4], [.95, -2], [1, 1], [.92, 3], [.62, 4.6], [.25, 5.5], [0, 5.75]].map(p => new THREE.Vector2(p[0], p[1]));
  const rumpf = new THREE.LatheGeometry(profil, 18); rumpf.rotateX(Math.PI/2);
  const r = new THREE.Mesh(rumpf, weiss); r.castShadow = true; g.add(r);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.75, 14, 10, 0, Math.PI*2, 0, Math.PI/2), MAT.glas);
  cockpit.scale.set(.9, .75, 1.8); cockpit.position.set(0, .5, 3.1); g.add(cockpit);
  const fl = new THREE.Shape();
  fl.moveTo(0, -1); fl.lineTo(6.2, -.2); fl.lineTo(6.2, .5); fl.lineTo(0, 1.2); fl.closePath();
  const flG = new THREE.ExtrudeGeometry(fl, { depth: .16, bevelEnabled: false }); flG.rotateX(Math.PI/2);
  const links = new THREE.Mesh(flG, weiss); links.position.set(0, -.15, .2); links.castShadow = true;
  const rechts = links.clone(); rechts.scale.x = -1;
  g.add(links, rechts);
  const spitzeL = new THREE.Mesh(new THREE.BoxGeometry(.5, .2, .7), akzent); spitzeL.position.set(6.1, -.15, .35);
  const spitzeR = spitzeL.clone(); spitzeR.position.x = -6.1;
  g.add(spitzeL, spitzeR);
  const leit = new THREE.Shape(); leit.moveTo(0, 0); leit.lineTo(-1.6, 0); leit.lineTo(-2.4, 2.2); leit.lineTo(-1.5, 2.2); leit.closePath();
  const leitG = new THREE.ExtrudeGeometry(leit, { depth: .14, bevelEnabled: false }); leitG.translate(0, 0, -.07); leitG.rotateY(-Math.PI/2);
  const seite = new THREE.Mesh(leitG, akzent); seite.position.set(0, .5, -3.2); g.add(seite);
  const hl = new THREE.Mesh(new THREE.BoxGeometry(4.2, .1, 1), weiss); hl.position.set(0, .35, -4.6); g.add(hl);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(2.4, .14, .05), MAT.schwarz); prop.position.set(0, 0, 5.8); g.add(prop);
  const nase = new THREE.Mesh(new THREE.ConeGeometry(.28, .5, 10).rotateX(Math.PI/2), akzent); nase.position.set(0, 0, 5.85); g.add(nase);
  for(const x of [-1.4, 1.4]){
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, .8), MAT.schwarz); b.position.set(x, -.85, .5); g.add(b);
    const w = new THREE.Mesh(new THREE.CylinderGeometry(.24, .24, .16, 10).rotateZ(Math.PI/2), MAT.reifen); w.position.set(x, -1.2, .5); g.add(w);
  }
  const vb = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .14, 10).rotateZ(Math.PI/2), MAT.reifen); vb.position.set(0, -1.15, 4); g.add(vb);
  const navR = new THREE.Mesh(new THREE.SphereGeometry(.12, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, .1, .1) })); navR.position.set(6.4, -.1, .3);
  const navG = new THREE.Mesh(new THREE.SphereGeometry(.12, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(.1, 3, .3) })); navG.position.set(-6.4, -.1, .3);
  const blitz = new THREE.Mesh(new THREE.SphereGeometry(.14, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5, 5) })); blitz.position.set(0, 2.6, -4.6);
  g.add(navR, navG, blitz);
  if(gross) g.scale.setScalar(3.2);
  return { g, prop, blitz };
}

export function baueHubschrauber(){
  const g = new THREE.Group();
  const m = lack('#1e2a44');
  const k = new THREE.Mesh(new THREE.SphereGeometry(1.3, 16, 12), m); k.scale.set(1, .9, 1.6); g.add(k);
  const s = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10, 0, Math.PI*2, 0, Math.PI/2), MAT.glas);
  s.rotation.x = Math.PI/2.4; s.position.set(0, .15, 1); g.add(s);
  const schwanz = new THREE.Mesh(new THREE.CylinderGeometry(.18, .35, 5, 8).rotateX(Math.PI/2), m); schwanz.position.set(0, .3, -3.6); g.add(schwanz);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, .06, .28), MAT.schwarz); rotor.position.y = 1.4; g.add(rotor);
  const rotor2 = rotor.clone(); rotor2.rotation.y = Math.PI/2; rotor.add(rotor2); rotor2.position.set(0, 0, 0);
  const kufe = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 3.2), MAT.chrom);
  for(const x of [-.9, .9]){ const kk = kufe.clone(); kk.position.set(x, -1.3, 0); g.add(kk); }
  const blitz = new THREE.Mesh(new THREE.SphereGeometry(.15, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, .2, .2) })); blitz.position.set(0, -1.1, 0); g.add(blitz);
  return { g, rotor, blitz };
}
