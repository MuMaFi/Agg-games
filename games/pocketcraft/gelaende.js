/* Pocketcraft · Gelände, zweite Fassung
   Nach Art des Vorbilds: Ein grobes Rauschen legt Festland und Meer fest,
   ein zweites, wie stark das Land abgetragen ist — wo wenig, stehen Berge,
   und ein Grat-Rauschen gibt ihnen Kämme und Gipfel. Flüsse ziehen als
   schmale Bänder durchs Land, das Ufer sinkt zu ihnen ab. Kalt ist es, wo
   das Temperaturrauschen es sagt, und je höher, desto kälter: dort liegt eine
   dünne Schneedecke, auf den Gipfeln Schnee. Steile Hänge zeigen Fels.
   Höhlen: lange Gänge, die an Land auch an der Oberfläche aufbrechen, und
   tief unten weite Hallen. Beides wird auf einem groben Gitter gerechnet und
   dazwischen gemittelt, das spart neun von zehn Rauschwerten.

   Welten von früher behalten ihr Gelände (Fassung 1 in welt.js), sonst
   stünde, was dort gebaut wurde, plötzlich in fremden Bergen. */
'use strict';

const WELT_FASSUNG = 2;                       // neue Welten
const SCHNEEGRENZE = SEA + 34;                // darüber liegt Schnee
const GIPFEL = SEA + 44;                      // darüber Schneeblöcke

/* Flachland wie beim Vorbild: Grundgestein, zwei Lagen Erde, Gras — sonst
   nichts, nur Platz. Keine Bäume, keine Höhlen, kein Wasser. */
const FLACH_SCHICHTEN = [B.BEDROCK, B.DIRT, B.DIRT, B.GRASS];
const FLACH_H = FLACH_SCHICHTEN.length - 1;       // oberster Block, man steht darüber
const FLACH_SPALTE = Object.freeze({ h: FLACH_H, biome: BIO.PLAINS, kalt: false, berg: 0 });
/* ── Nether ──────────────────────────────────────────────────────────
   Schlicht, wie gewünscht: Grundgestein unten und oben, dazwischen
   Netherrack aus dreidimensionalem Rauschen — am Boden und unter der Decke
   dichter, in der Mitte weite Höhlen —, und was unten frei bleibt, ist ein
   Lavameer. Kein Himmel: Licht gibt es von der Lava und ein dämmriges
   Grundlicht (NETHER_GRUNDLICHT, im Shader). */
const NETHER_LAVA = 24, NETHER_GRUNDLICHT = 0.38;
const NETHER_SPALTE = { h: NETHER_LAVA, biome: BIO.NETHER }, WIRR_SPALTE = { h: NETHER_LAVA, biome: BIO.WIRRWALD };
/** Wirrwald: große blaugrüne Flecken im Nether, etwa ein Drittel der Fläche */
const istWirrwald = (w, wx, wz) => w.nTemp.fbm2(wx*0.0065 + 17.31, wz*0.0065 - 9.73, 3, 2, .5) > 0.06;
function erzeugenNether(w, c){
  const bl = c.blocks = new Uint16Array(CS*WH*CS), ox = c.cx*CS, oz = c.cz*CS;
  for(let z = 0; z < CS; z++) for(let x = 0; x < CS; x++){
    const wx = ox + x, wz = oz + z;
    for(let y = 0; y < WH; y++){
      let id;
      if(y === 0 || y === WH - 1) id = B.BEDROCK;
      else if(y <= 3 && ghash(wx, y, wz, w.seed) < (4 - y)*0.25) id = B.BEDROCK;
      else if(y >= WH - 4 && ghash(wx, y, wz, w.seed) < (y - (WH - 5))*0.25) id = B.BEDROCK;
      else {
        const n = w.nCont.fbm3(wx*0.024, y*0.05, wz*0.024, 3, 2, .5);
        const rand = Math.max(0, (16 - y)/16) + Math.max(0, (y - (WH - 24))/18);
        id = n + rand*0.9 > 0.06 ? B.NETHERRACK : (y <= NETHER_LAVA ? B.LAVA : B.AIR);
      }
      bl[IDX(x, y, z)] = id;
    }
  }
  c.hmap.fill(NETHER_LAVA); c.biome.fill(BIO.NETHER); c.kalt.fill(0);
  wirrwaldBewachsen(w, c);
  festungenBauen(w, c);
}

/* ── Netherfestungen ─────────────────────────────────────────────────
   Wie die Dörfer: je Feld höchstens eine, Lage und Gestalt allein aus dem
   Startwert, jeder Chunk baut seinen Teil. In der Mitte eine Halle mit dem
   Lohen-Spawner auf einem Sockel, von dort Brücken auf Pfeilern in zwei bis
   vier Richtungen, am Ende jeder Brücke ein Turm mit einer Truhe. Durch das
   Netherrack schneiden sie ihre Gänge. */
const FESTUNG_FELD = 224, FESTUNG_WEIT = 72, FESTUNG_CHANCE = 0.75;
function festungImFeld(w, rx, rz){
  if(!w._festungen) w._festungen = new Map();
  const k = rx + ',' + rz;
  let f = w._festungen.get(k);
  if(f === undefined){ f = festungPlanen(w, rx, rz); w._festungen.set(k, f); }
  return f;
}
/** alle Festungen, die das Rechteck x0…x1, z0…z1 berühren */
function festungenBei(w, x0, z0, x1, z1){
  const l = [];
  if(w.typ !== 'nether') return l;
  for(let rz = Math.floor((z0 - FESTUNG_WEIT)/FESTUNG_FELD); rz <= Math.floor((z1 + FESTUNG_WEIT)/FESTUNG_FELD); rz++)
    for(let rx = Math.floor((x0 - FESTUNG_WEIT)/FESTUNG_FELD); rx <= Math.floor((x1 + FESTUNG_WEIT)/FESTUNG_FELD); rx++){
      const f = festungImFeld(w, rx, rz);
      if(f && x0 <= f.box[2] && x1 >= f.box[0] && z0 <= f.box[3] && z1 >= f.box[1]) l.push(f);
    }
  return l;
}
/** die Festung, auf deren Grund x, z liegt, oder null */
function festungBei(w, x, z){
  for(const f of festungenBei(w, x, z, x, z))
    for(const t of f.teile) if(x >= t.box[0] && x <= t.box[2] && z >= t.box[1] && z <= t.box[3]) return f;
  return null;
}
function festungPlanen(w, rx, rz){
  const r = mulberry32(Math.imul(rx, 0x2545f491) ^ Math.imul(rz, 0x6c8e9cf5) ^ w.seed ^ 0xf0e57);
  if(r() > FESTUNG_CHANCE) return null;
  const rand = FESTUNG_WEIT + 4, span = FESTUNG_FELD - 2*rand;
  const cx = rx*FESTUNG_FELD + rand + Math.floor(r()*span), cz = rz*FESTUNG_FELD + rand + Math.floor(r()*span);
  const y0 = 40 + Math.floor(r()*9), H = 6, N = B.NETHERZIEGEL;
  const f = { cx, cz, y0, teile: [], spawner: [[cx, y0 + 2, cz]], box: [cx - H, cz - H, cx + H, cz + H] };
  const teil = (box, bauen) => {
    f.teile.push({ box, bauen });
    f.box = [Math.min(f.box[0], box[0]), Math.min(f.box[1], box[1]), Math.max(f.box[2], box[2]), Math.max(f.box[3], box[3])];
  };
  // Pfeiler: von oben hinab, bis fester Grund kommt (durch Luft und Lava)
  const pfeiler = (setze, get, x, z, y) => {
    for(let k = 0; k < 50 && y > 1; k++, y--){
      const b = get(x, y, z);
      if(b < 0) return;
      if(b !== B.AIR && b !== B.LAVA && !(blocks[b] && blocks[b].replaceable)) return;
      setze(x, y, z, N);
    }
  };
  let richt = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(() => r() < 0.75);
  if(richt.length < 2) richt = r() < 0.5 ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
  const tueren = richt.map(([dx, dz]) => dx + ',' + dz);
  // die Halle
  teil([cx - H, cz - H, cx + H, cz + H], (setze, get) => {
    for(let v = -H; v <= H; v++) for(let u = -H; u <= H; u++){
      const x = cx + u, z = cz + v, rand = Math.abs(u) === H || Math.abs(v) === H;
      setze(x, y0 - 1, z, N); setze(x, y0, z, N); setze(x, y0 + 6, z, N);
      for(let y = y0 + 1; y <= y0 + 5; y++){
        let id = rand ? N : B.AIR;
        if(rand){
          // Türen zu den Brücken, Fenster rundum
          const seite = Math.abs(u) === H && Math.abs(v) < H ? Math.sign(u) + ',0' : Math.abs(v) === H && Math.abs(u) < H ? '0,' + Math.sign(v) : null;
          const quer = seite && seite.startsWith('0') ? u : v;
          if(seite && tueren.includes(seite) && Math.abs(quer) <= 1 && y <= y0 + 3) id = B.AIR;
          else if(seite && y === y0 + 3 && Math.abs(quer) % 3 === 2) id = B.AIR;
        }
        setze(x, y, z, id);
      }
      if(Math.abs(u) <= 1 && Math.abs(v) <= 1) setze(x, y0 + 1, z, N);           // der Sockel
      if(rand && (u % 4 === 0 || v % 4 === 0 || (Math.abs(u) === H && Math.abs(v) === H))) pfeiler(setze, get, x, z, y0 - 2);
    }
    setze(cx, y0 + 2, cz, B.SPAWNER);
  });
  // Brücken, am Ende ein Turm
  for(const [dx, dz] of richt){
    const L = 18 + Math.floor(r()*26), a = H + 1, b = H + L, ex = Math.abs(dz), ez = Math.abs(dx);
    const p0 = [cx + dx*a, cz + dz*a], p1 = [cx + dx*b, cz + dz*b];
    teil([Math.min(p0[0], p1[0]) - 2*ex, Math.min(p0[1], p1[1]) - 2*ez, Math.max(p0[0], p1[0]) + 2*ex, Math.max(p0[1], p1[1]) + 2*ez], (setze, get) => {
      for(let t = a; t <= b; t++) for(let s = -2; s <= 2; s++){
        const x = cx + dx*t + ex*s, z = cz + dz*t + ez*s, kante = Math.abs(s) === 2;
        setze(x, y0, z, N);
        if(!kante) setze(x, y0 - 1, z, N);
        setze(x, y0 + 1, z, kante ? N : B.AIR);
        for(let y = y0 + 2; y <= y0 + 4; y++) setze(x, y, z, B.AIR);
        if(kante && (t - a) % 7 === 3) pfeiler(setze, get, x, z, y0 - 1);
      }
    });
    const T = 4, tx = cx + dx*(b + T + 1), tz = cz + dz*(b + T + 1), spawner = r() < 0.3, truhe = [tx + (ex ? -2 : 0) + dx*2, tz + (ez ? -2 : 0) + dz*2];
    if(spawner) f.spawner.push([tx, y0 + 1, tz]);
    teil([tx - T, tz - T, tx + T, tz + T], (setze, get) => {
      for(let v = -T; v <= T; v++) for(let u = -T; u <= T; u++){
        const x = tx + u, z = tz + v, rand = Math.abs(u) === T || Math.abs(v) === T;
        setze(x, y0 - 1, z, N); setze(x, y0, z, N); setze(x, y0 + 5, z, N);
        // die Tür zeigt zurück zur Brücke
        const tuer = rand && (x - tx)*dx + (z - tz)*dz === -T && Math.abs((x - tx)*ex + (z - tz)*ez) <= 1;
        for(let y = y0 + 1; y <= y0 + 4; y++) setze(x, y, z, rand && !(tuer && y <= y0 + 3) ? N : B.AIR);
        if(rand && (Math.abs(u) === T && Math.abs(v) === T || u === 0 || v === 0)) pfeiler(setze, get, x, z, y0 - 2);
      }
      if(spawner) setze(tx, y0 + 1, tz, B.SPAWNER);
      setze(truhe[0], y0 + 1, truhe[1], B.CHEST);
    });
  }
  return f;
}
function festungenBauen(w, c){
  const ox = c.cx*CS, oz = c.cz*CS, bl = c.blocks;
  const l = festungenBei(w, ox, oz, ox + CS - 1, oz + CS - 1);
  if(!l.length) return;
  const drin = (x, y, z) => x >= ox && z >= oz && x < ox + CS && z < oz + CS && y >= 1 && y < WH - 1;
  const get = (x, y, z) => drin(x, y, z) ? bl[IDX(x - ox, y, z - oz)] : -1;
  const setze = (x, y, z, id) => {
    if(!drin(x, y, z)) return;
    bl[IDX(x - ox, y, z - oz)] = id;
    if(id === B.CHEST) (c.dorfTruhen || (c.dorfTruhen = [])).push([x, y, z, 'festung']);
  };
  for(const f of l) for(const t of f.teile)
    if(t.box[0] <= ox + CS - 1 && t.box[2] >= ox && t.box[1] <= oz + CS - 1 && t.box[3] >= oz) t.bauen(setze, get);
  // wo die Gänge den Boden weggeschnitten haben, schwebt keine Pflanze in der Luft
  for(let z = 0; z < CS; z++) for(let x = 0; x < CS; x++) for(let y = 2; y < WH - 1; y++){
    const i = IDX(x, y, z), id = bl[i];
    if((id === B.WIRR_WURZELN || id === B.WIRR_PILZ) && !blocksMovement(bl[IDX(x, y - 1, z)])) bl[i] = B.AIR;
  }
}
/** Beute einer Festungstruhe: fest nach Ort und Startwert */
function festungBeute(w, x, y, z){
  const r = mulberry32(Math.imul(x, 0x2f6b4c3) ^ Math.imul(y, 0x1d3a7f) ^ Math.imul(z, 0x51c9e3) ^ w.seed ^ 0xf0e5);
  const t = new Array(27).fill(null);
  const rein = (id, a, b, p = 1) => {
    if(id === undefined || r() > p) return;
    let i = Math.floor(r()*27), n = 0;
    while(t[i] && n++ < 27) i = (i + 1) % 27;
    if(t[i]) return;
    t[i] = { id, n: a + Math.floor(r()*(b - a + 1)), dur: items[id] ? items[id].dur : 0 };
  };
  rein(ITEM.gold, 1, 3, 0.7); rein(ITEM.iron, 1, 5, 0.6); rein(ITEM.diamond, 1, 3, 0.25); rein(ITEM.feuerzeug, 1, 1, 0.3);
  rein(B.OBSIDIAN, 2, 4, 0.25); rein(ITEM.gold_sword, 1, 1, 0.2); rein(ITEM.gold_chestplate, 1, 1, 0.15); rein(ITEM.netherziegel, 2, 8, 0.4);
  return t;
}

/* Wirrwald: jeder freiliegende Netherrack-Boden wird Nezel, darauf Wurzeln
   und Pilze; dazu Riesenpilze — ein Stiel, darüber ein Hut aus
   Warzenblöcken mit Pilzlicht darin (nur, wo sie ganz in den Chunk passen) */
function wirrwaldBewachsen(w, c){
  const bl = c.blocks, ox = c.cx*CS, oz = c.cz*CS;
  const wirr = new Uint8Array(CS*CS);
  for(let z = 0; z < CS; z++) for(let x = 0; x < CS; x++) if(istWirrwald(w, ox + x, oz + z)){ wirr[z*CS + x] = 1; c.biome[z*CS + x] = BIO.WIRRWALD; }
  const B_ = (x, y, z) => bl[IDX(x, y, z)];
  const setze = (x, y, z, id) => { if(x >= 0 && z >= 0 && x < CS && z < CS && y > 0 && y < WH - 1) bl[IDX(x, y, z)] = id; };
  const pilze = [];
  for(let z = 0; z < CS; z++) for(let x = 0; x < CS; x++){
    if(!wirr[z*CS + x]) continue;
    const wx = ox + x, wz = oz + z;
    for(let y = NETHER_LAVA; y < WH - 6; y++){
      if(B_(x, y, z) !== B.NETHERRACK || B_(x, y + 1, z) !== B.AIR) continue;
      bl[IDX(x, y, z)] = B.WIRR_NYZEL;
      const r = ghash(wx, y, wz, w.seed ^ 0x51f7);
      if(r < 0.035 && x >= 3 && x <= 12 && z >= 3 && z <= 12) pilze.push([x, y + 1, z, r]);
      else if(r < 0.2) bl[IDX(x, y + 1, z)] = B.WIRR_WURZELN;
      else if(r < 0.24) bl[IDX(x, y + 1, z)] = B.WIRR_PILZ;
    }
  }
  for(const [x, y0, z, r] of pilze){
    const h = 4 + Math.floor(ghash(x, y0, z, w.seed ^ 0x2c1) * 5);
    // Platz bis über den Hut?
    let frei = true;
    for(let y = y0; y <= y0 + h + 1 && frei; y++) if(y >= WH - 2 || (B_(x, y, z) !== B.AIR && B_(x, y, z) !== B.WIRR_WURZELN && B_(x, y, z) !== B.WIRR_PILZ)) frei = false;
    if(!frei) continue;
    const rad = h > 6 ? 3 : 2, top = y0 + h;
    for(let dy = -2; dy <= 1; dy++){
      const rr = dy === 1 ? rad - 1 : rad;
      for(let dz = -rr; dz <= rr; dz++) for(let dx = -rr; dx <= rr; dx++){
        const rand = Math.abs(dx) === rr || Math.abs(dz) === rr;
        if(dy < 0 && !rand) continue;                                // darunter nur der Rand, der herabhängt
        if(dy === -2 && ghash(x + dx, top + dy, z + dz, w.seed ^ 0x77) < 0.5) continue;
        if(Math.abs(dx) === rr && Math.abs(dz) === rr && dy >= 0) continue;   // runde Ecken
        if(B_(x + dx, top + dy, z + dz) !== B.AIR) continue;
        const k = ghash(x + dx, top + dy, z + dz, w.seed ^ 0x1d3);
        setze(x + dx, top + dy, z + dz, k < 0.07 ? B.PILZLICHT : B.WIRR_WARZE);
      }
    }
    for(let y = y0; y < top; y++) setze(x, y, z, B.WIRR_STIEL);
    setze(x, top, z, B.WIRR_WARZE);
  }
}

function erzeugenFlach(c){
  const bl = c.blocks = new Uint16Array(CS*WH*CS);
  for(let y = 0; y < FLACH_SCHICHTEN.length; y++) bl.fill(FLACH_SCHICHTEN[y], y*CS*CS, (y + 1)*CS*CS);
  c.hmap.fill(FLACH_H); c.biome.fill(BIO.PLAINS); c.kalt.fill(0);
}

const glatt = (a, b, x) => { const t = clamp((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
/** schneller Ganzzahl-Hash, 0 … 1 */
function ghash(x, y, z, s){
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Höhe, Biom und ob es kalt ist, für eine Spalte */
function spalte2(w, x0, z0){
  const x = x0 + w.versatz[0], z = z0 + w.versatz[1];
  const kont = w.nCont.fbm2(x*0.0021, z*0.0021, 4, 2, .5);
  const ero = w.nEro.fbm2(x*0.0032, z*0.0032, 3, 2, .5);
  const grat = 1 - Math.abs(w.nGrat.fbm2(x*0.009, z*0.009, 4, 2, .5))*1.7;
  const huegel = w.nHill.fbm2(x*0.018, z*0.018, 3, 2, .5);
  let basis;
  if(kont < -0.2) basis = SEA - 6 + (kont + 0.2)*45;              // offenes Meer, nach draußen tiefer
  else if(kont < -0.06) basis = SEA - 6 + (kont + 0.2)/0.14*8;     // Küste: vom Meeresgrund zum Strand
  else basis = SEA + 2 + (kont + 0.06)*30;                         // Land steigt sanft an
  const berg = glatt(0.0, -0.2, ero) * glatt(-0.04, 0.1, kont);
  const spitze = Math.pow(clamp(grat, 0, 1), 3);
  // zackige Gipfel: ein feineres Grat-Rauschen, nur im Gebirge
  const zacke = berg > 0.2 ? Math.pow(1 - Math.abs(w.nGrat.n2(x*0.034 + 31.7, z*0.034)), 3)*berg : 0;
  let h = basis + huegel*(2.5 + 8*berg) + berg*(7 + spitze*42) + zacke*9;
  if(h > 72) h = 72 + (h - 72)*0.5;                                 // oben flacher, statt abgeschnitten
  // Fluss: ein schmales Band um die Nullstelle des Flussrauschens
  const fr = Math.abs(w.nFluss.fbm2(x*0.0026, z*0.0026, 3, 2, .5));
  const breite = 0.03*(1 - 0.75*berg);
  let fluss = false, ufer = false;
  if(kont > -0.1 && fr < breite*1.6){
    const t = 1 - fr/(breite*1.6);                                  // 0 am Rand, 1 in der Mitte
    const bett = SEA - 1 - 3*glatt(0.35, 1, t);
    h = lerp(h, Math.min(h, bett), glatt(0, 0.6, t));
    fluss = fr < breite && h < SEA;
    ufer = !fluss;
  }
  h = Math.round(clamp(h, 4, WH - 12));
  const temp = w.nTemp.fbm2(x*0.0013, z*0.0013, 2, 2, .5) - Math.max(0, h - SEA - 18)*0.011;
  const hum = w.nHum.fbm2(x*0.0017, z*0.0017, 2, 2, .5);
  let biome;
  if(h < SEA) biome = fluss ? BIO.FLUSS : BIO.OCEAN;
  else if(h <= SEA + 1 && (kont < -0.03 || ufer)) biome = BIO.BEACH;
  else if(berg > 0.45 && h > SEA + 14) biome = BIO.MOUNT;
  else if(temp < -0.2) biome = hum > -0.04 ? BIO.TAIGA : BIO.SCHNEE;
  else if(temp < -0.1 && hum > 0.04) biome = BIO.TAIGA;
  else if(temp > 0.16 && hum < 0.02) biome = BIO.DESERT;
  else if(hum > 0.06) biome = BIO.FOREST;
  else biome = BIO.PLAINS;
  return { h, biome, kalt: temp < -0.2 || h >= SCHNEEGRENZE, berg };
}

/** Zufall je Spalte — gleich, egal welcher Chunk ihn zieht */
const spaltenZufall = (w, x, z) => mulberry32(Math.imul(x, 0x27d4eb2d) ^ Math.imul(z, 0x165667b1) ^ w.seed ^ 0x51a3);
/** Was auf dieser Spalte wächst: 'eiche', 'fichte', 'kaktus' oder nichts.
    Unter einem Baum bricht keine Höhle auf, sonst schwebte er. */
function pflanzeHier(w, x, z, s, steil){
  if(s.h <= SEA || steil) return null;
  const r = spaltenZufall(w, x, z)();
  let art = null;
  switch(s.biome){
    case BIO.FOREST: art = r < 0.04 ? 'eiche' : null; break;
    case BIO.PLAINS: art = r < 0.005 ? 'eiche' : null; break;
    case BIO.TAIGA:  art = r < 0.035 ? 'fichte' : null; break;
    case BIO.SCHNEE: art = r < 0.006 ? 'fichte' : null; break;
    case BIO.MOUNT:  art = r < 0.012 && s.h < SEA + 30 ? 'fichte' : null; break;
    case BIO.DESERT: art = r < 0.006 ? 'kaktus' : null; break;
  }
  if(art && w.doerfer && dorfPlatz(w, x, z)) return null;        // in Dörfern und an ihren Wegen nicht
  return art;
}

/* Höhlenrauschen auf einem Gitter alle vier Blöcke, in Weltkoordinaten:
   Gänge dort, wo zwei Rauschfelder zugleich nahe null sind, Hallen, wo ein
   drittes hoch ist; dazu Kiesnester im Stein. */
const HG = 4, HNX = CS/HG + 1, HNY = WH/HG + 1;
function hoehlenGitter(w, ox, oz){
  const n = HNX*HNX*HNY;
  const g = { a: new Float32Array(n), b: new Float32Array(n), k: new Float32Array(n), q: new Float32Array(n) };
  for(let iy = 0; iy < HNY; iy++) for(let iz = 0; iz < HNX; iz++) for(let ix = 0; ix < HNX; ix++){
    const x = ox + ix*HG + w.versatz[0], y = iy*HG + 0.37, z = oz + iz*HG + w.versatz[1], i = (iy*HNX + iz)*HNX + ix;
    g.a[i] = w.nCaveA.n3(x*0.021, y*0.034, z*0.021);
    g.b[i] = w.nCaveB.n3(x*0.021, y*0.034, z*0.021);
    g.k[i] = w.nKaese.fbm3(x*0.012, y*0.022, z*0.012, 2, 2, .5);
    g.q[i] = w.nKies.n3(x*0.045, y*0.06, z*0.045);
  }
  return g;
}
/** Wert an einem Block (x, z im Chunk), aus den acht Gitterpunkten ringsum */
function gitterWert(arr, x, y, z){
  const fx = x/HG, fy = y/HG, fz = z/HG;
  const ix = Math.min(fx | 0, HNX - 2), iy = Math.min(fy | 0, HNY - 2), iz = Math.min(fz | 0, HNX - 2);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const i = (iy*HNX + iz)*HNX + ix, j = i + HNX*HNX;
  const x00 = arr[i] + (arr[i+1] - arr[i])*tx, x10 = arr[i+HNX] + (arr[i+HNX+1] - arr[i+HNX])*tx;
  const x01 = arr[j] + (arr[j+1] - arr[j])*tx, x11 = arr[j+HNX] + (arr[j+HNX+1] - arr[j+HNX])*tx;
  const z0 = x00 + (x10 - x00)*tz, z1 = x01 + (x11 - x01)*tz;
  return z0 + (z1 - z0)*ty;
}
function gang(g, x, y, z){ const a = gitterWert(g.a, x, y, z), b = gitterWert(g.b, x, y, z); return a*a + b*b < 0.0042; }
function halle(g, x, y, z){ return gitterWert(g.k, x, y, z) > 0.3 + Math.max(0, (y - 24)/30)*0.25; }

/* Lava wie beim Vorbild: was eine Höhle unterhalb von LAVA_SPIEGEL frei
   macht, füllt Lava. Nur in neuen Welten (w.obsidian, ab 26.11) — ältere
   bleiben Block für Block, wie sie waren. */
const LAVA_SPIEGEL = 10;
const LAVA_UNTEN = (w, y) => w.obsidian && y <= LAVA_SPIEGEL ? B.LAVA : B.AIR;
/** Selten ein kleiner Lavasee an der Oberfläche, mit Steinrand — nur auf
    ebenem Land und ganz im Chunk, damit er nicht an der Chunkgrenze zerfällt */
function lavaSee(w, c){
  if(!w.obsidian || ghash(c.cx, 7, c.cz, w.seed ^ 0x1a7a) > 0.035) return;
  const bl = c.blocks, mx = 5 + Math.floor(ghash(c.cx, 8, c.cz, w.seed)*6), mz = 5 + Math.floor(ghash(c.cx, 9, c.cz, w.seed)*6);
  const ra = 2 + ghash(c.cx, 10, c.cz, w.seed)*1.6, rb = 2 + ghash(c.cx, 11, c.cz, w.seed)*1.6;
  const h0 = c.hmap[mz*CS + mx];
  if(h0 <= SEA + 1 || h0 >= WH - 8) return;
  const zellen = [];
  for(let dz = -5; dz <= 5; dz++) for(let dx = -5; dx <= 5; dx++){
    const x = mx + dx, z = mz + dz, d = (dx/ra)**2 + (dz/rb)**2;
    if(d > 1.7) continue;
    if(x < 1 || z < 1 || x > CS - 2 || z > CS - 2) return;
    const h = c.hmap[z*CS + x], oben = bl[IDX(x, h, z)];
    if(Math.abs(h - h0) > 1 || !(oben === B.GRASS || oben === B.DIRT || oben === B.SAND || oben === B.STONE)) return;
    zellen.push([x, z, d]);
  }
  for(const [x, z, d] of zellen){
    for(let y = h0 + 1; y <= h0 + 3; y++) bl[IDX(x, y, z)] = B.AIR;
    if(d <= 1){ bl[IDX(x, h0, z)] = B.LAVA; bl[IDX(x, h0 - 1, z)] = d < 0.45 ? B.LAVA : B.STONE; bl[IDX(x, h0 - 2, z)] = B.STONE; }
    else { bl[IDX(x, h0, z)] = B.STONE; bl[IDX(x, h0 - 1, z)] = B.STONE; }
    c.hmap[z*CS + x] = h0;
  }
}

function erz2(w, x, y, z){
  if(w.nOre.n3(x*0.34, y*0.34, z*0.34) < 0.5) return 0;
  const r = ghash(x, y, z, w.seed ^ 0x5bd1);
  // ganz unten, wo beim Vorbild Lavaseen zu Obsidian erstarren: hier und da Obsidian
  if(w.obsidian && y < 10 && r > 0.93) return B.OBSIDIAN;
  if(y < 16){ if(r < 0.12) return B.DIAMOND_ORE; if(r < 0.28) return B.GOLD_ORE; if(r < 0.6) return B.IRON_ORE; return B.COAL_ORE; }
  if(y < 32){ if(r < 0.07) return B.GOLD_ORE; if(r < 0.45) return B.IRON_ORE; return B.COAL_ORE; }
  if(y < 56) return r < 0.3 ? B.IRON_ORE : B.COAL_ORE;
  return r < 0.8 ? B.COAL_ORE : 0;
}

/** Redstone-Erz, für beide Fassungen des Geländes: in jedem Chunk drei bis
    fünf kleine Adern tief unten (bis Höhe 15). Jede bleibt in ihrem Chunk und
    macht nur aus Stein Erz — sonst ändert sich am Gelände nichts. */
function redstoneAdern(w, c){
  const bl = c.blocks, s = w.seed ^ 0x2ed5, h = (a, b) => ghash(c.cx, a*16 + b, c.cz, s);
  const adern = 3 + Math.floor(h(0, 0)*3);
  for(let a = 1; a <= adern; a++){
    let x = Math.floor(h(a, 1)*16), y = 2 + Math.floor(h(a, 2)*13), z = Math.floor(h(a, 3)*16);
    const laenge = 3 + Math.floor(h(a, 4)*6);
    for(let i = 0; i < laenge; i++){
      const j = IDX(x, y, z);
      if(bl[j] === B.STONE) bl[j] = B.REDSTONE_ERZ;
      switch(Math.floor(h(a, 5 + i)*6)){
        case 0: if(x < 15) x++; break;
        case 1: if(x > 0) x--; break;
        case 2: if(y < 15) y++; break;
        case 3: if(y > 2) y--; break;
        case 4: if(z < 15) z++; break;
        default: if(z > 0) z--;
      }
    }
  }
}

/** Schleim-Chunk: jeder zehnte, fest nach dem Startwert der Welt (wie beim Vorbild) */
function schleimChunk(w, cx, cz){ return ghash(cx, 987, cz, w.seed ^ 0x5eed5) < 0.1; }

/** einen Chunk erzeugen: Boden, Höhlen, Erze, dann Bäume und Schnee */
function erzeugen2(w, c){
  const bl = c.blocks = new Uint16Array(CS*WH*CS);
  const ox = c.cx*CS, oz = c.cz*CS, R = 4, GW = CS + 2*R;
  // Spalten mit Rand: für Hänge und für Bäume, die herüberragen
  const sp = new Array(GW*GW);
  for(let dz = 0; dz < GW; dz++) for(let dx = 0; dx < GW; dx++) sp[dz*GW + dx] = spalte2(w, ox + dx - R, oz + dz - R);
  const S = (x, z) => sp[(z + R)*GW + x + R];
  const steilAn = (x, z) => {
    const h = S(x, z).h; let hang = 0;
    for(const [ax, az] of [[1,0],[-1,0],[0,1],[0,-1]]) hang = Math.max(hang, Math.abs(S(x + ax, z + az).h - h));
    return hang >= (S(x, z).biome === BIO.MOUNT ? 3 : 4);
  };
  const g = hoehlenGitter(w, ox, oz);
  for(let z = 0; z < CS; z++) for(let x = 0; x < CS; x++){
    const s = S(x, z), h = s.h, bio = s.biome, wx = ox + x, wz = oz + z;
    c.biome[z*CS + x] = bio; c.kalt[z*CS + x] = s.kalt ? 1 : 0;
    let tief = h;
    for(let az = -1; az <= 1; az++) for(let ax = -1; ax <= 1; ax++) tief = Math.min(tief, S(x + ax, z + az).h);
    const steil = steilAn(x, z);
    const land = bio !== BIO.OCEAN && bio !== BIO.FLUSS && bio !== BIO.BEACH;
    // Höhlen brechen nur an Land auf, fern vom Wasser, nicht unter Bäumen, und nur stellenweise
    const offen = land && h >= SEA + 4 && tief >= SEA + 2 && !pflanzeHier(w, wx, wz, s, steil)
      && w.nHill.n2((wx + w.versatz[0])*0.013 + 71.3, (wz + w.versatz[1])*0.013) > 0.12
      && !(w.doerfer && dorfPlatz(w, wx, wz));
    const oberkante = offen ? h : (tief >= SEA + 2 ? h - 3 : Math.min(h - 4, SEA - 4));
    // Oberfläche: oben, darunter und wie dick
    let oben = B.GRASS, unter = B.DIRT, dicke = 4;
    switch(bio){
      case BIO.OCEAN: case BIO.FLUSS:
        oben = unter = (w.nKies.n2((wx + w.versatz[0])*0.05, (wz + w.versatz[1])*0.05) > 0.22 || h < SEA - 9) ? B.GRAVEL : B.SAND; dicke = 3; break;
      case BIO.BEACH: oben = unter = B.SAND; break;
      case BIO.DESERT: oben = B.SAND; unter = B.SANDSTONE; dicke = 6; break;
      case BIO.MOUNT:
        if(h >= GIPFEL){ oben = B.SNOW; unter = B.STONE; dicke = 2; }
        else if(steil || h > SEA + 30){ oben = unter = B.STONE; }
        break;
    }
    if(steil && oben === B.GRASS){ oben = unter = B.STONE; }               // Felswände
    const top = Math.max(h, SEA);
    for(let y = 0; y <= top; y++){
      let id;
      if(y === 0) id = B.BEDROCK;
      else if(y <= 2) id = ghash(wx, y, wz, w.seed) < (y === 1 ? 0.55 : 0.2) ? B.BEDROCK : B.STONE;
      else if(y > h) id = B.WATER;
      else if(y === h) id = oben;
      else if(y > h - dicke) id = (bio === BIO.DESERT && y > h - 3) ? B.SAND : unter;
      else id = B.STONE;
      if(y >= 3 && id !== B.WATER && id !== B.BEDROCK){
        if(y <= oberkante && gang(g, x, y, z)) id = LAVA_UNTEN(w, y);
        else if(y >= 5 && y <= h - 8 && halle(g, x, y, z)) id = LAVA_UNTEN(w, y);
        else if(id === B.STONE){
          const e = erz2(w, wx, y, wz);
          if(e) id = e;
          else if(y < h - 4 && gitterWert(g.q, x, y, z) > 0.42) id = B.GRAVEL;
        }
      }
      bl[IDX(x, y, z)] = id;
    }
    // Höhe ohne Bäume: der oberste undurchsichtige Block — eine Höhle kann ihn weggenommen haben
    let hy = h;
    while(hy > 0 && !isOpaqueCube(bl[IDX(x, hy, z)])) hy--;
    c.hmap[z*CS + x] = hy;
  }
  lavaSee(w, c);
  schmuecken2(w, c, S, steilAn);
  doerferBauen(w, c);
  // dünner Schnee in kalten Gegenden und über der Schneegrenze, auch auf Laub
  for(let z = 0; z < CS; z++) for(let x = 0; x < CS; x++){
    if(!S(x, z).kalt) continue;
    let y = WH - 2;
    while(y > 0 && bl[IDX(x, y, z)] === B.AIR) y--;
    const id = bl[IDX(x, y, z)];
    if((isOpaqueCube(id) && id !== B.LAVA) || id === B.LEAVES || id === B.FICHTENNADELN) bl[IDX(x, y + 1, z)] = B.SCHNEEDECKE;
  }
}

/** Bäume, Kakteen, Gras und Blumen — auch die, die aus Nachbarchunks herüberragen */
function schmuecken2(w, c, S, steilAn){
  const bl = c.blocks, ox = c.cx*CS, oz = c.cz*CS;
  const setze = (x, y, z, id, weich) => {
    if(x < 0 || z < 0 || x >= CS || z >= CS || y < 0 || y >= WH) return;
    const i = IDX(x, y, z), cur = bl[i];
    if(cur === B.AIR || cur === B.TALLGRASS || cur === B.ROSE || cur === B.DANDELION || cur === B.KORNBLUME ||
       (weich && (cur === B.LEAVES || cur === B.FICHTENNADELN))) bl[i] = id;
  };
  for(let dz = -3; dz < CS + 3; dz++) for(let dx = -3; dx < CS + 3; dx++){
    const s = S(dx, dz), h = s.h, wx = ox + dx, wz = oz + dz;
    const art = pflanzeHier(w, wx, wz, s, steilAn(dx, dz));
    const r = spaltenZufall(w, wx, wz); r();            // der erste Wert hat die Art bestimmt
    if(art === 'eiche'){
      const th = 4 + ((r()*3) | 0);
      for(let y = 1; y <= th; y++) setze(dx, h + y, dz, B.LOG);
      for(let ly = -2; ly <= 1; ly++){
        const rad = ly <= -1 ? 2 : 1;
        for(let lz = -rad; lz <= rad; lz++) for(let lx = -rad; lx <= rad; lx++){
          if(Math.abs(lx) === rad && Math.abs(lz) === rad && (ly >= 0 || r() < .5)) continue;
          if(lx === 0 && lz === 0 && ly < 1) continue;
          setze(dx + lx, h + th + ly, dz + lz, B.LEAVES, true);
        }
      }
    } else if(art === 'fichte'){
      // schmal und spitz: Lagen abwechselnd weit und eng, nach unten breiter
      const th = 6 + ((r()*4) | 0);
      for(let y = 1; y <= th; y++) setze(dx, h + y, dz, B.FICHTENSTAMM);
      const spitze = h + th + 1;
      for(let y = spitze; y >= h + 3; y--){
        const k = spitze - y;
        const rad = k === 0 ? 0 : (k % 2 === 1 ? 1 : Math.min(3, 1 + Math.floor(k/3)));
        for(let lz = -rad; lz <= rad; lz++) for(let lx = -rad; lx <= rad; lx++){
          if(rad >= 2 && Math.abs(lx) === rad && Math.abs(lz) === rad) continue;
          if(lx === 0 && lz === 0 && y <= h + th) continue;
          setze(dx + lx, y, dz + lz, B.FICHTENNADELN, true);
        }
      }
    } else if(art === 'kaktus'){
      const ch = 1 + ((r()*3) | 0);
      for(let y = 1; y <= ch; y++) setze(dx, h + y, dz, B.CACTUS);
    } else if(dx >= 0 && dx < CS && dz >= 0 && dz < CS && h > SEA && bl[IDX(dx, h, dz)] === B.GRASS && !s.kalt){
      const rr = r();
      const dicht = (s.biome === BIO.PLAINS || s.biome === BIO.FOREST) ? 0.26 : (s.biome === BIO.TAIGA ? 0.1 : 0);
      if(rr < dicht){
        const rb = r();
        setze(dx, h + 1, dz, rb < 0.955 || s.biome === BIO.TAIGA ? B.TALLGRASS : (rb < 0.978 ? B.ROSE : rb < 0.99 ? B.DANDELION : B.KORNBLUME));
      }
    }
  }
}
