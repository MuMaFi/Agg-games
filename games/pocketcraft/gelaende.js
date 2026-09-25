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
function erzeugenFlach(c){
  const bl = c.blocks = new Uint8Array(CS*WH*CS);
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
  switch(s.biome){
    case BIO.FOREST: return r < 0.04 ? 'eiche' : null;
    case BIO.PLAINS: return r < 0.005 ? 'eiche' : null;
    case BIO.TAIGA:  return r < 0.035 ? 'fichte' : null;
    case BIO.SCHNEE: return r < 0.006 ? 'fichte' : null;
    case BIO.MOUNT:  return r < 0.012 && s.h < SEA + 30 ? 'fichte' : null;
    case BIO.DESERT: return r < 0.006 ? 'kaktus' : null;
  }
  return null;
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

function erz2(w, x, y, z){
  if(w.nOre.n3(x*0.34, y*0.34, z*0.34) < 0.5) return 0;
  const r = ghash(x, y, z, w.seed ^ 0x5bd1);
  if(y < 16){ if(r < 0.12) return B.DIAMOND_ORE; if(r < 0.28) return B.GOLD_ORE; if(r < 0.6) return B.IRON_ORE; return B.COAL_ORE; }
  if(y < 32){ if(r < 0.07) return B.GOLD_ORE; if(r < 0.45) return B.IRON_ORE; return B.COAL_ORE; }
  if(y < 56) return r < 0.3 ? B.IRON_ORE : B.COAL_ORE;
  return r < 0.8 ? B.COAL_ORE : 0;
}

/** einen Chunk erzeugen: Boden, Höhlen, Erze, dann Bäume und Schnee */
function erzeugen2(w, c){
  const bl = c.blocks = new Uint8Array(CS*WH*CS);
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
      && w.nHill.n2((wx + w.versatz[0])*0.013 + 71.3, (wz + w.versatz[1])*0.013) > 0.12;
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
        if(y <= oberkante && gang(g, x, y, z)) id = B.AIR;
        else if(y >= 5 && y <= h - 8 && halle(g, x, y, z)) id = B.AIR;
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
  schmuecken2(w, c, S, steilAn);
  // dünner Schnee in kalten Gegenden und über der Schneegrenze, auch auf Laub
  for(let z = 0; z < CS; z++) for(let x = 0; x < CS; x++){
    if(!S(x, z).kalt) continue;
    let y = WH - 2;
    while(y > 0 && bl[IDX(x, y, z)] === B.AIR) y--;
    const id = bl[IDX(x, y, z)];
    if(isOpaqueCube(id) || id === B.LEAVES || id === B.FICHTENNADELN) bl[IDX(x, y + 1, z)] = B.SCHNEEDECKE;
  }
}

/** Bäume, Kakteen, Gras und Blumen — auch die, die aus Nachbarchunks herüberragen */
function schmuecken2(w, c, S, steilAn){
  const bl = c.blocks, ox = c.cx*CS, oz = c.cz*CS;
  const setze = (x, y, z, id, weich) => {
    if(x < 0 || z < 0 || x >= CS || z >= CS || y < 0 || y >= WH) return;
    const i = IDX(x, y, z), cur = bl[i];
    if(cur === B.AIR || cur === B.TALLGRASS || cur === B.ROSE || cur === B.DANDELION ||
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
        setze(dx, h + 1, dz, rb < 0.955 || s.biome === BIO.TAIGA ? B.TALLGRASS : (rb < 0.978 ? B.ROSE : B.DANDELION));
      }
    }
  }
}
