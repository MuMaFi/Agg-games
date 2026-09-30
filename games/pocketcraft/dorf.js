/* Pocketcraft · Dörfer
   Wie beim Vorbild liegen in neuen Welten Dörfer: um einen Brunnen ein
   Platz, von dort Wege in alle vier Richtungen, manche mit einer Abzweigung,
   und an den Wegen kleine und große Häuser, eine Schmiede, ein Turm, Felder
   und Laternen. Je Feld von DORF_FELD × DORF_FELD Blöcken höchstens eins —
   wo es liegt und was dort steht, folgt allein aus dem Startwert und dem
   Gelände. So baut jeder Chunk genau seinen Teil, in welcher Reihenfolge sie
   auch entstehen, und Mitspieler sehen dasselbe Dorf.
   Häuser stehen auf einem Sockel, wo das Gelände abfällt, und schneiden sich
   in den Hang, wo es steigt; die Tür liegt am Weg, auf seiner Höhe. In der
   Wüste ist alles aus Sandstein mit flachen Dächern, im Nadelwald und im
   Schnee sind die Wände aus Fichtenstämmen.
   Ob eine Welt Dörfer hat, steht in ihr (doerfer) — Welten von früher
   bleiben, wie sie waren. */
'use strict';

const DORF_FELD = 160;            // je Feld höchstens ein Dorf
const DORF_WEIT = 80;             // so weit reicht ein Dorf von seiner Mitte höchstens
const DORF_CHANCE = 0.75;
const DORF_BEWOHNER = 10;         // so viele Dorfbewohner höchstens je Dorf

/* Baustoffe je Gegend. dach/platte: Art der Treppe bzw. Stufe */
const DORF_STILE = {
  wiese:  { name:'Dorf',        boden:B.PLANKS,    wand:B.PLANKS,       ecke:B.LOG,          sockel:B.COBBLE,    dach:0, first:B.PLANKS,
            weg:B.GRAVEL,    pfosten:B.LOG,          platte:1, flach:false },
  wueste: { name:'Wüstendorf',  boden:B.SANDSTONE, wand:B.SANDSTONE,    ecke:B.SANDSTONE,    sockel:B.SANDSTONE, dach:3, first:B.SANDSTONE,
            weg:B.SANDSTONE, pfosten:B.SANDSTONE,    platte:4, flach:true },
  taiga:  { name:'Walddorf',    boden:B.PLANKS,    wand:B.FICHTENSTAMM, ecke:B.COBBLE,       sockel:B.COBBLE,    dach:1, first:B.COBBLE,
            weg:B.GRAVEL,    pfosten:B.FICHTENSTAMM, platte:1, flach:false },
};
function dorfStil(biome){
  if(biome === BIO.PLAINS || biome === BIO.FOREST) return 'wiese';
  if(biome === BIO.DESERT) return 'wueste';
  if(biome === BIO.TAIGA || biome === BIO.SCHNEE) return 'taiga';
  return null;
}

/* Berufe: Kuttenfarbe (färbt das helle Bild) und was sie tauschen.
   gib: was man hergibt, bekommt: was man dafür erhält — je [Nummer, Anzahl] */
const BERUFE = [
  { key:'bauer', name:'Bauer', farbe:[0.66, 0.46, 0.28], handel: () => [
    { gib:[[ITEM.wheat, 20]], bekommt:[ITEM.emerald, 1] },
    { gib:[[ITEM.seeds, 32]], bekommt:[ITEM.emerald, 1] },
    { gib:[[ITEM.emerald, 1]], bekommt:[ITEM.bread, 6] },
    { gib:[[ITEM.emerald, 1]], bekommt:[ITEM.apple, 4] },
    { gib:[[ITEM.emerald, 1]], bekommt:[ITEM.bone_meal, 8] },
  ] },
  { key:'hirte', name:'Hirte', farbe:[0.96, 0.95, 0.9], handel: () => [
    { gib:[[B.WOOL, 16]], bekommt:[ITEM.emerald, 1] },
    { gib:[[ITEM.emerald, 1]], bekommt:[ITEM.shears, 1] },
    { gib:[[ITEM.emerald, 1]], bekommt:[B.WOOL + 2, 8] },
    { gib:[[ITEM.emerald, 3]], bekommt:[bettId('blau'), 1] },
    { gib:[[ITEM.emerald, 3]], bekommt:[bettId('gruen'), 1] },
  ] },
  { key:'schmied', name:'Schmied', farbe:[0.34, 0.34, 0.38], handel: () => [
    { gib:[[ITEM.coal, 16]], bekommt:[ITEM.emerald, 1] },
    { gib:[[ITEM.iron, 6]], bekommt:[ITEM.emerald, 1] },
    { gib:[[ITEM.emerald, 3]], bekommt:[ITEM.iron_pickaxe, 1] },
    { gib:[[ITEM.emerald, 4]], bekommt:[ITEM.iron_sword, 1] },
    { gib:[[ITEM.emerald, 6], [ITEM.iron, 2]], bekommt:[ITEM.iron_chestplate, 1] },
  ] },
  { key:'priester', name:'Priester', farbe:[0.62, 0.36, 0.74], handel: () => [
    { gib:[[ITEM.bone, 12]], bekommt:[ITEM.emerald, 1] },
    { gib:[[ITEM.emerald, 1]], bekommt:[ITEM.redstone, 4] },
    { gib:[[ITEM.emerald, 5]], bekommt:[ITEM.golden_apple, 1] },
    { gib:[[ITEM.emerald, 10]], bekommt:[ITEM.diamond, 1] },
  ] },
];
const berufNr = key => BERUFE.findIndex(b => b.key === key);

/* ── Wo liegen Dörfer? ─────────────────────────────────────────────── */
function dorfImFeld(w, rx, rz){
  if(!w._doerfer) w._doerfer = new Map();
  const k = rx + ',' + rz;
  let d = w._doerfer.get(k);
  if(d === undefined){ d = w.doerfer ? dorfPlanen(w, rx, rz) : null; w._doerfer.set(k, d); }
  return d;
}
/** alle Dörfer, die das Rechteck x0…x1, z0…z1 berühren könnten */
function doerferBei(w, x0, z0, x1, z1){
  const l = [];
  if(!w.doerfer) return l;
  for(let rz = Math.floor((z0 - DORF_WEIT)/DORF_FELD); rz <= Math.floor((z1 + DORF_WEIT)/DORF_FELD); rz++)
    for(let rx = Math.floor((x0 - DORF_WEIT)/DORF_FELD); rx <= Math.floor((x1 + DORF_WEIT)/DORF_FELD); rx++){
      const d = dorfImFeld(w, rx, rz);
      if(d && x0 <= d.box[2] && x1 >= d.box[0] && z0 <= d.box[3] && z1 >= d.box[1]) l.push(d);
    }
  return l;
}
/** steht hier etwas vom Dorf (oder gleich daneben)? Dort wachsen keine Bäume
    und brechen keine Höhlen auf */
function dorfPlatz(w, x, z){
  for(const d of doerferBei(w, x, z, x, z))
    for(const r of d.plaetze) if(x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]) return true;
  return false;
}
/** das nächste Dorf um x, z (höchstens weit Blöcke entfernt), oder null */
function dorfSuchen(w, x, z, weit){
  let best = null, bd = weit;
  for(const d of doerferBei(w, x - weit, z - weit, x + weit, z + weit)){
    const e = Math.hypot(d.cx - x, d.cz - z);
    if(e < bd){ bd = e; best = d; }
  }
  return best;
}

/* ── Planen ────────────────────────────────────────────────────────── */
function dorfPlanen(w, rx, rz){
  const rnd = mulberry32(Math.imul(rx, 0x3c6ef372) ^ Math.imul(rz, 0x1b873593) ^ w.seed ^ 0x0d0f5ee);
  if(rnd() > DORF_CHANCE) return null;
  const rand = 56;
  const cx = rx*DORF_FELD + rand + Math.floor(rnd()*(DORF_FELD - 2*rand));
  const cz = rz*DORF_FELD + rand + Math.floor(rnd()*(DORF_FELD - 2*rand));
  const flach = w.typ === 'flach';
  const H = new Map();
  const hoehe = (x, z) => {
    const k = (x - cx + 1024)*4096 + (z - cz + 1024);
    let h = H.get(k);
    if(h === undefined){ h = w.column(x, z).h; H.set(k, h); }
    return h;
  };
  const nass = h => !flach && h <= SEA;
  const mitte = w.column(cx, cz), stilKey = dorfStil(mitte.biome);
  if(!stilKey || nass(mitte.h)) return null;
  // eben genug? Auf einem Ring um die Mitte darf es nicht zu sehr auf und ab gehen
  let lo = mitte.h, hi = mitte.h, wasser = 0;
  for(let a = 0; a < 12; a++) for(const r of [8, 18]){
    const h = hoehe(cx + Math.round(Math.cos(a*TAU/12)*r), cz + Math.round(Math.sin(a*TAU/12)*r));
    lo = Math.min(lo, h); hi = Math.max(hi, h); if(nass(h)) wasser++;
  }
  if(hi - lo > 6 || wasser > 3) return null;
  const st = DORF_STILE[stilKey];
  const d = { cx, cz, stil: stilKey, st, name: st.name, teile: [], plaetze: [], spawn: [], wege: null, hoehe, flach, box: null, key: rx + ',' + rz };
  const wege = d.wege = [], bauten = [];
  const schneidet = (a, b) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
  const teil = (x0, z0, x1, z1, bauen, rahmen = 1, art = '') => {
    d.teile.push({ box: [x0 - rahmen, z0 - rahmen, x1 + rahmen, z1 + rahmen], bauen, art });
    d.plaetze.push([x0 - 2, z0 - 2, x1 + 2, z1 + 2]);
  };

  // Platz und Brunnen in der Mitte
  const platz = [cx - 4, cz - 4, cx + 3, cz + 3];
  wege.push(platz);
  teil(platz[0], platz[1], platz[2], platz[3], s => wegBauen(d, s, platz), 0);
  const fb = hoehe(cx, cz);
  teil(cx - 2, cz - 2, cx + 1, cz + 1, s => brunnenBauen(d, s, cx - 2, cz - 2, fb));
  bauten.push([cx - 2, cz - 2, cx + 1, cz + 1]);

  // Wege: in jede Richtung einer, am Ende oft eine Abzweigung zur Seite
  const strecken = [];
  const strecke = (ax, az, dx, dz, L) => {
    const px = -dz, pz = dx;
    const xs = [ax, ax + dx*(L - 1)], zs = [az, az + dz*(L - 1)];
    const r = [Math.min(...xs) - Math.abs(px), Math.min(...zs) - Math.abs(pz), Math.max(...xs) + Math.abs(px), Math.max(...zs) + Math.abs(pz)];
    wege.push(r);
    teil(r[0], r[1], r[2], r[3], s => wegBauen(d, s, r), 0);
    strecken.push({ ax, az, dx, dz, L, px, pz });
  };
  for(const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]){
    const L = 14 + Math.floor(rnd()*16);
    const ax = dx > 0 ? cx + 4 : dx < 0 ? cx - 5 : cx, az = dz > 0 ? cz + 4 : dz < 0 ? cz - 5 : cz;
    // ein Arm endet, bevor er ins Wasser führt
    let n = 0;
    while(n < L && !nass(hoehe(ax + dx*n, az + dz*n)) && Math.abs(hoehe(ax + dx*n, az + dz*n) - fb) < 8) n++;
    if(n < 6) continue;
    strecke(ax, az, dx, dz, n);
    if(n === L && rnd() < 0.7){
      const seite = rnd() < 0.5 ? 1 : -1, bx = ax + dx*(n - 1), bz = az + dz*(n - 1);
      const qx = -dz*seite, qz = dx*seite, L2 = 10 + Math.floor(rnd()*10);
      let m = 2;
      while(m < L2 && !nass(hoehe(bx + qx*m, bz + qz*m)) && Math.abs(hoehe(bx + qx*m, bz + qz*m) - fb) < 9) m++;
      if(m >= 6) strecke(bx + qx*2, bz + qz*2, qx, qz, m - 2);
    }
  }

  // Häuser an den Wegen: Vorderwand am Wegrand, die Tür in der Mitte
  const ARTEN = [
    { art:'klein', W:5, D:5, g:4 }, { art:'gross', W:7, D:7, g:2 }, { art:'schmiede', W:7, D:6, g:1, max:1 },
    { art:'turm', W:5, D:7, g:1, max:1 }, { art:'feld', W:7, D:9, g:3 },
  ];
  const zahl = {};
  const waehle = () => {
    const l = ARTEN.filter(a => !(a.max && (zahl[a.art] || 0) >= a.max));
    let r = rnd()*l.reduce((s, a) => s + a.g, 0);
    for(const a of l){ r -= a.g; if(r <= 0) return a; }
    return l[0];
  };
  const setzeHaus = (sk, t, seite, A) => {
    const V = [sk.px*seite, sk.pz*seite], U = [V[1], -V[0]];
    const ex = sk.ax + sk.dx*t, ez = sk.az + sk.dz*t;              // Wegmitte vor der Tür
    const vx = ex + V[0]*2, vz = ez + V[1]*2;                          // Tür in der Vorderwand
    const hu = Math.floor(A.W/2);
    const ox = vx - U[0]*hu, oz = vz - U[1]*hu;
    const xs = [ox, ox + U[0]*(A.W - 1) + V[0]*(A.D - 1)], zs = [oz, oz + U[1]*(A.W - 1) + V[1]*(A.D - 1)];
    const r = [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)];
    if(wege.some(q => schneidet(r, q))) return false;
    const r2 = [r[0] - 2, r[1] - 2, r[2] + 2, r[3] + 2];
    if(bauten.some(q => schneidet(r2, q))) return false;
    if(Math.max(Math.abs(r[0] - cx), Math.abs(r[2] - cx), Math.abs(r[1] - cz), Math.abs(r[3] - cz)) > DORF_WEIT - 4) return false;
    const f = hoehe(ex + V[0], ez + V[1]);                             // der Wegrand vor der Tür
    for(let x = r[0]; x <= r[2]; x++) for(let z = r[1]; z <= r[3]; z++){
      const h = hoehe(x, z);
      if(nass(h) || h - f > 3 || f - h > 4) return false;
    }
    bauten.push(r);
    zahl[A.art] = (zahl[A.art] || 0) + 1;
    const s0 = Math.floor(rnd()*1e9);
    const B0 = { d, st, ox, oz, U, V, W: A.W, D: A.D, f, s0 };
    const bau = { klein: kleinesHaus, gross: grossesHaus, schmiede, turm, feld }[A.art];
    teil(r[0], r[1], r[2], r[3], s => bau(s, B0), 2, A.art);
    // wer hier wohnt, erscheint vor der Tür
    const sx = vx - V[0] + 0.5, sz = vz - V[1] + 0.5, sy = f + 1;
    const wer = A.art === 'schmiede' ? ['schmied'] : A.art === 'turm' ? ['priester'] : A.art === 'feld' ? ['bauer']
      : A.art === 'gross' ? ['bauer', 'hirte'] : [rnd() < 0.5 ? 'bauer' : 'hirte'];
    for(const b of wer) d.spawn.push({ x: sx, y: sy, z: sz, beruf: berufNr(b) });
    return true;
  };
  for(const sk of strecken) for(const seite of [1, -1]){
    let t = 1;
    while(t < sk.L - 1){
      const A = waehle(), tc = t + Math.floor(A.W/2);
      if(tc > sk.L - 2) break;
      if(setzeHaus(sk, tc, seite, A)) t += A.W + 1 + Math.floor(rnd()*3);
      else t += 2;
    }
  }
  if(!d.spawn.length) return null;                        // nur Wege: kein Dorf
  // wer wohnt hier: gemischt, Schmied und Priester zuerst, höchstens DORF_BEWOHNER
  const sp = d.spawn;
  for(let i = sp.length - 1; i > 0; i--){ const j = Math.floor(rnd()*(i + 1)); const q = sp[i]; sp[i] = sp[j]; sp[j] = q; }
  sp.sort((a, b) => (a.beruf >= 2 ? 0 : 1) - (b.beruf >= 2 ? 0 : 1));
  d.spawn = sp.slice(0, DORF_BEWOHNER);
  // Laternen am Wegrand, wo Platz ist
  for(const sk of strecken) for(let t = 3; t < sk.L - 1; t += 7 + Math.floor(rnd()*4)){
    const seite = rnd() < 0.5 ? 1 : -1;
    const x = sk.ax + sk.dx*t + sk.px*seite*2, z = sk.az + sk.dz*t + sk.pz*seite*2;
    const r = [x, z, x, z];
    if(wege.some(q => schneidet(r, q)) || bauten.some(q => schneidet([x - 1, z - 1, x + 1, z + 1], q))) continue;
    const h = hoehe(x, z);
    if(nass(h)) continue;
    bauten.push(r);
    teil(x, z, x, z, s => laterneBauen(d, s, x, z, h), 0);
  }
  // Umriss
  let b = [cx, cz, cx, cz];
  for(const t of d.teile) b = [Math.min(b[0], t.box[0]), Math.min(b[1], t.box[1]), Math.max(b[2], t.box[2]), Math.max(b[3], t.box[3])];
  d.box = b;
  d.radius = Math.max(b[2] - cx, cx - b[0], b[3] - cz, cz - b[1]);
  return d;
}

/* ── Bauen: je Chunk sein Teil ─────────────────────────────────────── */
/** alles aus Dörfern, was in den Chunk c fällt; truhen und felder merken sich,
    was nach den Änderungen der Spieler noch gefüllt werden will */
function doerferBauen(w, c){
  const ox = c.cx*CS, oz = c.cz*CS, bl = c.blocks;
  const l = doerferBei(w, ox, oz, ox + CS - 1, oz + CS - 1);
  if(!l.length) return;
  let art = '';
  const setze = (x, y, z, id) => {
    const lx = x - ox, lz = z - oz;
    if(lx < 0 || lz < 0 || lx >= CS || lz >= CS || y < 1 || y >= WH) return;
    bl[IDX(lx, y, lz)] = id;
    if(id === B.CHEST) (c.dorfTruhen || (c.dorfTruhen = [])).push([x, y, z, art]);
    else if(isWheat(id) && id !== B.WHEAT + 3) (c.dorfFelder || (c.dorfFelder = [])).push([x, y, z]);
  };
  for(const d of l) for(const t of d.teile)
    if(t.box[0] <= ox + CS - 1 && t.box[2] >= ox && t.box[1] <= oz + CS - 1 && t.box[3] >= oz){ art = t.art; t.bauen(setze); }
  // die Höhenkarte (Licht, Wesen) kennt jetzt Dächer und Wege
  for(let z = 0; z < CS; z++) for(let x = 0; x < CS; x++){
    let y = WH - 1;
    while(y > 0 && !isOpaqueCube(bl[IDX(x, y, z)])) y--;
    c.hmap[z*CS + x] = y;
  }
}
/** nach den Änderungen der Spieler: Truhen füllen und Felder wachsen lassen,
    die es noch gibt und die noch niemand kennt */
function dorfNachbereiten(w, c){
  const ox = c.cx*CS, oz = c.cz*CS, bl = c.blocks;
  for(const [x, y, z, art] of c.dorfTruhen || []){
    const k = x + ',' + y + ',' + z;
    if(bl[IDX(x - ox, y, z - oz)] === B.CHEST && !w.chests.has(k)) w.chests.set(k, dorfBeute(w, x, y, z, art === 'schmiede'));
  }
  for(const [x, y, z] of c.dorfFelder || []){
    const k = x + ',' + y + ',' + z;
    if(isWheat(bl[IDX(x - ox, y, z - oz)]) && !w.crops.has(k)) w.crops.set(k, { t: 0 });
  }
  c.dorfTruhen = c.dorfFelder = null;
}
/** was in einer Truhe liegt: fest nach Ort und Startwert, damit jeder dasselbe findet */
function dorfBeute(w, x, y, z, schmiede){
  const r = mulberry32(Math.imul(x, 0x2f6b4c3) ^ Math.imul(y, 0x1d3a7f) ^ Math.imul(z, 0x51c9e3) ^ w.seed ^ 0xbe07e);
  const t = new Array(27).fill(null);
  const rein = (id, a, b, p = 1) => {
    if(r() > p) return;
    let i = Math.floor(r()*27), n = 0;
    while(t[i] && n++ < 27) i = (i + 1) % 27;
    if(t[i]) return;
    t[i] = { id, n: a + Math.floor(r()*(b - a + 1)), dur: 0 };
  };
  rein(ITEM.bread, 1, 3); rein(ITEM.apple, 1, 3, 0.7); rein(ITEM.emerald, 1, 3, 0.45);
  rein(ITEM.iron, 1, 5, schmiede ? 0.9 : 0.3); rein(ITEM.coal, 2, 8, 0.5); rein(ITEM.seeds, 2, 6, 0.5);
  if(schmiede){
    rein(ITEM.iron_pickaxe, 1, 1, 0.3); rein(ITEM.iron_sword, 1, 1, 0.25); rein(ITEM.iron_helmet, 1, 1, 0.15);
    rein(ITEM.gold, 1, 3, 0.25); rein(ITEM.diamond, 1, 2, 0.1);
  } else { rein(ITEM.wheat, 3, 9, 0.5); rein(B.WOOL, 1, 4, 0.3); rein(ITEM.platte, 1, 1, 0.05); }
  for(const s of t) if(s) s.dur = items[s.id] ? items[s.id].dur : 0;
  return t;
}

/* ── Die Bauten ────────────────────────────────────────────────────── */
/** Weg: der oberste Block wird Kies (Sandstein in der Wüste), darüber frei;
    über Wasser eine Brücke aus Brettern */
function wegBauen(d, s, r){
  for(let x = r[0]; x <= r[2]; x++) for(let z = r[1]; z <= r[3]; z++){
    let h = d.hoehe(x, z);
    if(!d.flach && h < SEA){ h = SEA; s(x, h, z, B.PLANKS); }
    else s(x, h, z, d.st.weg);
    for(let y = h + 1; y <= h + 5; y++) s(x, y, z, B.AIR);
  }
}
const aufWeg = (d, x, z) => d.wege.some(r => x >= r[0] && x <= r[2] && z >= r[1] && z <= r[3]);
/** lokale Koordinaten eines Baus: u quer (vom Weg aus nach rechts), v in die
    Tiefe (0 = Vorderwand), y wie in der Welt */
function bauplan(s, B0){
  const { ox, oz, U, V } = B0;
  const wx = (u, v) => ox + U[0]*u + V[0]*v, wz = (u, v) => oz + U[1]*u + V[1]*v;
  const seite = (du, dv) => { const x = U[0]*du + V[0]*dv, z = U[1]*du + V[1]*dv; return SEITE.findIndex(q => q[0] === x && q[1] === z); };
  return {
    wx, wz, seite,
    put: (u, y, v, id) => s(wx(u, v), y, wz(u, v), id),
    boden: (u, v) => B0.d.hoehe(wx(u, v), wz(u, v)),
  };
}
/** Grundriss: frei räumen, Sockel bis zum Boden, Fußboden, Wände mit Ecken */
function rohbau(s, B0, H, o = {}){
  const P = bauplan(s, B0), { W, D, f, st } = B0;
  const wand = o.wand || st.wand, ecke = o.ecke || st.ecke, boden = o.boden || st.boden, sockel = o.sockel || st.sockel;
  const oben = f + H + (st.flach || o.flach ? 3 : Math.ceil(W/2) + 3);
  for(let u = -1; u <= W; u++) for(let v = -1; v <= D; v++){
    const innen = u >= 0 && v >= 0 && u < W && v < D;
    const g = P.boden(u, v);
    // rundum frei machen (auch Bäume und Hang), nur Wege bleiben
    if(!innen && (v < 0 || aufWeg(B0.d, P.wx(u, v), P.wz(u, v)))) continue;
    for(let y = f + 1; y <= Math.max(oben, g); y++) P.put(u, y, v, B.AIR);
    if(!innen) continue;
    for(let y = g + 1; y < f; y++) P.put(u, y, v, sockel);
    if(g < f) for(let y = Math.max(1, g - 2); y <= g; y++) P.put(u, y, v, sockel);   // fest gegründet
    P.put(u, f, v, boden);
    const rand = u === 0 || v === 0 || u === W - 1 || v === D - 1;
    if(!rand) continue;
    const istEcke = (u === 0 || u === W - 1) && (v === 0 || v === D - 1);
    for(let y = f + 1; y <= f + H; y++) P.put(u, y, v, istEcke ? ecke : wand);
  }
  return P;
}
/** Satteldach aus Treppen, der First läuft von vorn nach hinten; die Giebel
    sind gemauert, im vorderen ein Fenster. In der Wüste ein flaches Dach. */
function dach(P, B0, H, o = {}){
  const { W, D, f, st } = B0, y0 = f + H + 1;
  if(st.flach || o.flach){
    for(let u = 0; u < W; u++) for(let v = 0; v < D; v++) P.put(u, y0, v, o.stoff || st.wand);
    for(let u = 0; u < W; u++) for(let v = 0; v < D; v++)
      if(u === 0 || v === 0 || u === W - 1 || v === D - 1) P.put(u, y0 + 1, v, stufeId(st.platte, false));
    return;
  }
  // die erste Reihe Treppen hängt neben der Mauerkrone, jede weitere eins höher und weiter innen
  const art = st.dach, links = P.seite(1, 0), rechts = P.seite(-1, 0);
  for(let k = 0; ; k++){
    const a = k - 1, b = W - k, y = f + H + k;
    if(a > b) break;
    if(a === b){ for(let v = -1; v <= D; v++) P.put(a, y, v, st.first); break; }
    for(let v = -1; v <= D; v++){ P.put(a, y, v, treppeId(art, links, false)); P.put(b, y, v, treppeId(art, rechts, false)); }
    if(k > 0) for(let u = a + 1; u < b; u++){
      P.put(u, y, 0, k === 2 && u === Math.floor(W/2) ? B.GLASS : st.wand === B.FICHTENSTAMM ? B.PLANKS : st.wand);
      P.put(u, y, D - 1, st.wand === B.FICHTENSTAMM ? B.PLANKS : st.wand);
    }
    if(a + 1 === b) break;
  }
}
/** Tür vorn in der Mitte (u), Blatt innen */
function tuer(P, B0, u){
  const s = P.seite(0, 1);
  P.put(u, B0.f + 1, 0, doorId(false, false, s));
  P.put(u, B0.f + 2, 0, doorId(true, false, s));
}
const BETTFARBEN = [B.BED, bettId('gelb'), bettId('blau'), bettId('gruen'), bettId('weiss'), bettId('braun')];
function bett(P, B0, u, v, k = 0){ P.put(u, B0.f + 1, v, BETTFARBEN[(B0.s0 + k) % BETTFARBEN.length]); }

function kleinesHaus(s, B0){
  const H = 3, P = rohbau(s, B0, H), { f } = B0;
  for(const [u, v] of [[0, 2], [4, 2], [2, 4]]) P.put(u, f + 2, v, B.GLASS);
  tuer(P, B0, 2);
  bett(P, B0, 1, 3); P.put(3, f + 1, 3, B.TABLE); P.put(3, f + 1, 1, B.TORCH);
  dach(P, B0, H);
}
function grossesHaus(s, B0){
  const H = 4, P = rohbau(s, B0, H), { f } = B0;
  for(const [u, v] of [[0, 2], [0, 4], [6, 2], [6, 4]]){ P.put(u, f + 2, v, B.GLASS); P.put(u, f + 3, v, B.GLASS); }
  for(const [u, v] of [[1, 0], [5, 0], [2, 6], [4, 6]]) P.put(u, f + 2, v, B.GLASS);
  tuer(P, B0, 3);
  bett(P, B0, 1, 5); bett(P, B0, 2, 5, 1);
  P.put(5, f + 1, 5, B.CHEST); P.put(5, f + 1, 4, B.TABLE); P.put(5, f + 1, 3, B.FURNACE);
  P.put(1, f + 1, 1, B.TORCH); P.put(5, f + 1, 1, B.TORCH);
  dach(P, B0, H);
}
function schmiede(s, B0){
  const H = 4, st = B0.st, P = rohbau(s, B0, H, { wand: st.sockel, ecke: st.ecke === B.COBBLE ? B.LOG : st.ecke, boden: st.sockel }), { f } = B0;
  for(const v of [2, 3]){ P.put(0, f + 2, v, B.GLASS); P.put(6, f + 2, v, B.GLASS); }
  P.put(2, f + 2, 0, B.GLASS); P.put(4, f + 2, 0, B.GLASS);
  tuer(P, B0, 3);
  P.put(4, f + 1, 4, B.FURNACE); P.put(5, f + 1, 4, B.FURNACE); P.put(5, f + 2, 4, st.sockel); P.put(4, f + 2, 4, st.sockel);
  P.put(1, f + 1, 4, B.CHEST); P.put(1, f + 1, 3, B.TABLE);
  P.put(1, f + 1, 1, B.TORCH); P.put(5, f + 1, 1, B.TORCH);
  dach(P, B0, H, { flach: true, stoff: st.sockel });
}
/** Turm: hoch, aus Stein, innen eine Leiter zur Plattform mit Zinnen und Fackeln */
function turm(s, B0){
  const H = 9, st = B0.st, P = rohbau(s, B0, H, { wand: st.sockel, ecke: st.sockel, flach: true }), { f, W, D } = B0;
  for(const v of [3]) for(const y of [f + 2, f + 3, f + 6, f + 7]){ P.put(0, y, v, B.GLASS); P.put(W - 1, y, v, B.GLASS); }
  P.put(2, f + 5, 0, B.GLASS); P.put(2, f + 6, D - 1, B.GLASS);
  tuer(P, B0, 2);
  const lw = P.seite(0, 1);
  for(let y = f + 1; y <= f + H + 1; y++) P.put(2, y, D - 2, ladderId(lw));
  P.put(1, f + 1, 1, B.TORCH); P.put(3, f + 1, 3, B.TORCH);
  const y0 = f + H + 1;
  for(let u = 0; u < W; u++) for(let v = 0; v < D; v++){
    if(u === 2 && v === D - 2) continue;
    P.put(u, y0, v, st.sockel);
    const rand = u === 0 || v === 0 || u === W - 1 || v === D - 1;
    if(rand && (u + v) % 2 === 0) P.put(u, y0 + 1, v, st.sockel);
  }
  for(const [u, v] of [[0, 0], [W - 1, 0], [0, D - 1], [W - 1, D - 1]]) P.put(u, y0 + 2, v, B.TORCH);
}
/** Feld: ein Rahmen aus Stämmen, in der Mitte ein Wassergraben, rechts und
    links Ackerboden mit Weizen in allen Stufen */
function feld(s, B0){
  const P = bauplan(s, B0), { W, D, f, st } = B0;
  for(let u = 0; u < W; u++) for(let v = 0; v < D; v++){
    const g = P.boden(u, v);
    for(let y = f + 1; y <= Math.max(f + 4, g); y++) P.put(u, y, v, B.AIR);
    for(let y = g + 1; y < f; y++) P.put(u, y, v, B.DIRT);
    const rand = u === 0 || v === 0 || u === W - 1 || v === D - 1;
    if(rand){ P.put(u, f, v, st.pfosten); continue; }
    if(u === Math.floor(W/2)){ P.put(u, f, v, B.WATER); P.put(u, f - 1, v, B.DIRT); continue; }
    P.put(u, f, v, B.FARMLAND);
    const k = ghash(P.wx(u, v), f, P.wz(u, v), B0.s0);
    P.put(u, f + 1, v, B.WHEAT + (k < 0.45 ? 3 : k < 0.7 ? 2 : k < 0.9 ? 1 : 0));
  }
}
/** Laterne: ein Pfosten mit einer Fackel obendrauf */
function laterneBauen(d, s, x, z, h){
  for(let y = h + 1; y <= h + 4; y++) s(x, y, z, B.AIR);
  s(x, h + 1, z, d.st.pfosten); s(x, h + 2, z, d.st.pfosten); s(x, h + 3, z, B.TORCH);
}
/** Brunnen: ein Becken mit Wasser, drei tief, mit Rand; auf vier Pfosten ein Dach aus Stufen */
function brunnenBauen(d, s, x0, z0, f){
  const st = d.st;
  for(let u = 0; u < 4; u++) for(let v = 0; v < 4; v++){
    const x = x0 + u, z = z0 + v, rand = u === 0 || v === 0 || u === 3 || v === 3;
    for(let y = f + 1; y <= f + 6; y++) s(x, y, z, B.AIR);
    s(x, f - 3, z, st.sockel);
    for(let y = f - 2; y <= f; y++) s(x, y, z, rand ? st.sockel : B.WATER);
    if(rand) s(x, f + 1, z, st.sockel);
    const ecke = (u === 0 || u === 3) && (v === 0 || v === 3);
    if(ecke){ s(x, f + 2, z, st.pfosten); s(x, f + 3, z, st.pfosten); }
    s(x, f + 4, z, stufeId(st.platte, false));
  }
}
