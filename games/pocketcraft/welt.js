/* Pocketcraft · Welt */
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   WELT — Chunks, Terrain, Höhlen, Erze, Licht, Mesh-Erzeugung
   ═══════════════════════════════════════════════════════════════════ */
const CS = 16, WH = 96, SEA = 38;
const IDX = (x,y,z) => (y*CS + z)*CS + x;
const ckey = (cx,cz) => cx + ',' + cz;

const BIO = { OCEAN:0, BEACH:1, PLAINS:2, FOREST:3, DESERT:4, MOUNT:5, TAIGA:6, SCHNEE:7, FLUSS:8 };
const BIO_NAME = ['Ozean','Strand','Ebene','Wald','Wüste','Gebirge','Nadelwald','Schneeebene','Fluss'];

/* Sichtbarkeits-/Lichtregeln — als flache Tabellen, weil sie im
   Mesh- und Licht-Kern millionenfach abgefragt werden */
const OPQ  = new Uint8Array(256);   // blockt Sicht vollständig
const SOL  = new Uint8Array(256);   // blockt Bewegung
const LOPQ = new Uint8Array(256);   // Licht-Dämpfung 0…15
const COLL = new Float32Array(256*6); // Kollisionskasten je Block, in Blockeinheiten
const VOLL = new Uint8Array(256);     // Kollision füllt den ganzen Block
function buildBlockTables(){
  for(let i=0;i<256;i++){
    const b = blocks[i];
    if(!b){ OPQ[i] = 0; SOL[i] = 0; LOPQ[i] = 0; continue; }
    OPQ[i] = b.opaque ? 1 : 0;
    SOL[i] = b.solid ? 1 : 0;
    // stehendes Wasser dämpft das Licht; fließendes ist zu flach dafür — so
    // muss beim Fließen nur neu gezeichnet, nicht neu belichtet werden
    LOPQ[i] = b.opaque ? 15 : (i === B.WATER ? 2 : (i === B.LEAVES || i === B.FICHTENNADELN ? 1 : 0));
    const k = b.solid && b.box ? b.box : [0,0,0,16,16,16];
    for(let j=0; j<6; j++) COLL[i*6+j] = k[j]/16;
    VOLL[i] = b.solid && !b.box ? 1 : 0;
  }
  OPQ[B.AIR] = 0; SOL[B.AIR] = 0; LOPQ[B.AIR] = 0;
}
const lightOpacity   = id => LOPQ[id];
const isOpaqueCube   = id => OPQ[id] === 1;
const blocksMovement = id => SOL[id] === 1;

/* ── Flächen-Definitionen ──────────────────────────────────────────── */
const FACES = [
  { n:[ 1, 0, 0], nAx:0, uAx:2, vAx:1, v:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]], uv:[[0,1],[0,0],[1,0],[1,1]] },
  { n:[-1, 0, 0], nAx:0, uAx:2, vAx:1, v:[[0,0,0],[0,0,1],[0,1,1],[0,1,0]], uv:[[0,1],[1,1],[1,0],[0,0]] },
  { n:[ 0, 1, 0], nAx:1, uAx:0, vAx:2, v:[[0,1,0],[0,1,1],[1,1,1],[1,1,0]], uv:[[0,0],[0,1],[1,1],[1,0]] },
  { n:[ 0,-1, 0], nAx:1, uAx:0, vAx:2, v:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uv:[[0,0],[1,0],[1,1],[0,1]] },
  { n:[ 0, 0, 1], nAx:2, uAx:0, vAx:1, v:[[0,0,1],[1,0,1],[1,1,1],[0,1,1]], uv:[[0,1],[1,1],[1,0],[0,0]] },
  { n:[ 0, 0,-1], nAx:2, uAx:0, vAx:1, v:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]], uv:[[0,1],[0,0],[1,0],[1,1]] },
];

/* ── Mesh-Puffer ───────────────────────────────────────────────────── */
class MeshBuf{
  constructor(){ this.cap = 2048; this.buf = new ArrayBuffer(this.cap*12);
    this.u16 = new Uint16Array(this.buf); this.u8 = new Uint8Array(this.buf);
    this.n = 0; this.icap = 3072; this.ind = new Uint32Array(this.icap); this.ni = 0; }
  reset(){ this.n = 0; this.ni = 0; }
  grow(){ this.cap *= 2; const b = new ArrayBuffer(this.cap*12);
    new Uint8Array(b).set(this.u8); this.buf = b;
    this.u16 = new Uint16Array(b); this.u8 = new Uint8Array(b); }
  growI(){ this.icap *= 2; const a = new Uint32Array(this.icap); a.set(this.ind); this.ind = a; }
  /** u, v in Sechzehnteln der Textur (0…16) */
  vert(x,y,z, pack, layer, sky, blk, u, v){
    if(this.n + 1 > this.cap) this.grow();
    const o16 = this.n*6, o8 = this.n*12;
    this.u16[o16] = x; this.u16[o16+1] = y; this.u16[o16+2] = z;
    this.u8[o8+6] = pack; this.u8[o8+7] = layer; this.u8[o8+8] = sky; this.u8[o8+9] = blk;
    this.u8[o8+10] = u; this.u8[o8+11] = v;
    return this.n++;
  }
  quad(flip){
    if(this.ni + 6 > this.icap) this.growI();
    const a = this.n-4, b = a+1, c = a+2, d = a+3, I = this.ind;
    if(flip){ I[this.ni++]=a; I[this.ni++]=b; I[this.ni++]=d; I[this.ni++]=b; I[this.ni++]=c; I[this.ni++]=d; }
    else    { I[this.ni++]=a; I[this.ni++]=b; I[this.ni++]=c; I[this.ni++]=a; I[this.ni++]=c; I[this.ni++]=d; }
  }
}

/* ── Chunk ─────────────────────────────────────────────────────────── */
class Chunk{
  constructor(cx,cz){
    this.cx = cx; this.cz = cz;
    this.blocks = null; this.light = null;
    this.state = 0;              // 0 leer · 1 erzeugt · 2 belichtet · 3 vermascht
    this.mesh = null; this.wmesh = null;
    this.mods = null;            // Map: index → BlockId (Spieler-Änderungen)
    this.empty = true;
    this.lights = [];            // Indizes leuchtender Blöcke
    this.hmap = new Uint8Array(CS*CS);
    this.biome = new Uint8Array(CS*CS);
    this.kalt = new Uint8Array(CS*CS);  // hier schneit es statt zu regnen
  }
}

/* ── Welt ──────────────────────────────────────────────────────────── */
const LM = 8, LW = CS + LM*2;                  // Licht-Arbeitsbereich
const _lop = new Uint8Array(LW*WH*LW);
const _lsk = new Uint8Array(LW*WH*LW);
const _lbk = new Uint8Array(LW*WH*LW);
const _lq  = new Int32Array(LW*WH*LW*3);
const LIDX = (x,y,z) => (y*LW + z)*LW + x;

const PW = CS+2;                                // Mesh-Nachbarschafts-Cache
const _pb  = new Uint8Array(PW*WH*PW);          // Block-IDs
const _plt = new Uint8Array(PW*WH*PW);          // Licht, gepackt: Sonne | Block<<4
const PIDX = (x,y,z) => (y*PW + z)*PW + x;
const PYS = PW*PW;                              // Schrittweite je Y-Ebene

/* Für jede Fläche und Ecke die beiden Nachbar-Versätze vorberechnen —
   spart im Mesh-Kern rund 6000 Array-Allokationen pro Chunk. */
const FACE_NB = [];
/* Für Kästen: welche Achse die Texturkoordinate s/t trägt und ob sie
   gespiegelt läuft — abgeleitet aus den Ecken des Einheitswürfels, damit
   ein Kasten dieselbe Ausrichtung hat wie ein voller Block. */
const FACE_ST = [];
function buildFaceST(){
  for(const F of FACES){
    const e = { sAx:0, sFlip:false, tAx:0, tFlip:false };
    for(const k of ['s','t']){
      const j = k === 's' ? 0 : 1;
      for(let ax = 0; ax < 3; ax++){
        if(ax === F.nAx) continue;
        if(F.v.every((v, i) => v[ax] === F.uv[i][j])){ e[k+'Ax'] = ax; e[k+'Flip'] = false; }
        else if(F.v.every((v, i) => v[ax] === 1 - F.uv[i][j])){ e[k+'Ax'] = ax; e[k+'Flip'] = true; }
      }
    }
    FACE_ST.push(e);
  }
}
const _aoV = new Int32Array(4), _skV = new Int32Array(4), _bkV = new Int32Array(4);
const _eckeH = new Float32Array(4);             // Wasser: Höhe der vier oberen Ecken
function buildFaceTables(){
  for(let f=0; f<6; f++){
    const F = FACES[f], t = new Int8Array(24);
    for(let i=0; i<4; i++){
      const vo = F.v[i];
      const o1 = [0,0,0], o2 = [0,0,0];
      o1[F.uAx] = vo[F.uAx]*2 - 1;
      o2[F.vAx] = vo[F.vAx]*2 - 1;
      t[i*6]   = o1[0]; t[i*6+1] = o1[1]; t[i*6+2] = o1[2];
      t[i*6+3] = o2[0]; t[i*6+4] = o2[1]; t[i*6+5] = o2[2];
    }
    FACE_NB.push(t);
  }
  buildFaceST();
}

class World{
  /** gen: Fassung des Geländes — 1 für Welten von früher, 2 für neue (gelaende.js) */
  constructor(seedStr, gen){
    this.seedStr = seedStr;
    this.gen = gen === 2 ? 2 : 1;
    const s = hashStr(seedStr || 'taschenwelt');
    this.seed = s;
    this.nCont = new Noise(s);
    this.nHill = new Noise(s ^ 0x9e37);
    this.nMount= new Noise(s ^ 0x51ed);
    this.nTemp = new Noise(s ^ 0x1234);
    this.nHum  = new Noise(s ^ 0xabcd);
    this.nCaveA= new Noise(s ^ 0x7f11);
    this.nCaveB= new Noise(s ^ 0x22b9);
    this.nOre  = new Noise(s ^ 0x5c4d);
    if(this.gen === 2){
      this.nEro = new Noise(s ^ 0x3a7f); this.nGrat = new Noise(s ^ 0x6d2b); this.nFluss = new Noise(s ^ 0x4e91);
      this.nKaese = new Noise(s ^ 0x1b3c); this.nKies = new Noise(s ^ 0x7e57);
      // Das Rauschen ist an seinen Gitterpunkten immer null — ohne Versatz läge
      // in jeder Welt genau am Ursprung ein Fluss
      this.versatz = [((s >>> 3) & 0xfff) + 0.5137, ((s >>> 15) & 0xfff) + 0.2871];
    }
    this.chunks = new Map();
    this.mods = new Map();       // "cx,cz" → Map(index→id)
    this.furnaces = new Map();   // "x,y,z" → {in,fuel,out,burn,burnMax,cook}
    this.chests = new Map();     // "x,y,z" → 27 Stapel
    this.crops = new Map();      // "x,y,z" → {t, nass}
    this.dirty = new Set();
    this.relight = new Set();
  }

  /* — Spalteninfo: Höhe + Biom — */
  column(wx,wz){
    if(this.gen === 2) return spalte2(this, wx, wz);
    const cont = this.nCont.fbm2(wx*0.0032, wz*0.0032, 4, 2, .5);
    const hill = this.nHill.fbm2(wx*0.014, wz*0.014, 4, 2, .5);
    let mt = this.nMount.fbm2(wx*0.0021, wz*0.0021, 3, 2, .5);
    mt = Math.max(0, mt - 0.12) * 1.6;
    const temp = this.nTemp.fbm2(wx*0.0015, wz*0.0015, 2, 2, .5);
    const hum  = this.nHum.fbm2(wx*0.0018, wz*0.0018, 2, 2, .5);
    let h = SEA + 3 + cont*17 + hill*5.5 + mt*mt*46;
    h = Math.round(clamp(h, 4, WH-14));
    let biome;
    if(h <= SEA-1) biome = BIO.OCEAN;
    else if(h <= SEA+1) biome = BIO.BEACH;
    else if(h > SEA+24) biome = BIO.MOUNT;
    else if(temp > 0.16 && hum < 0.02) biome = BIO.DESERT;
    else if(hum > 0.06) biome = BIO.FOREST;
    else biome = BIO.PLAINS;
    return { h, biome };
  }

  cave(x,y,z){
    if(y < 2) return false;
    const a = this.nCaveA.n3(x*0.026, y*0.048, z*0.026);
    const b = this.nCaveB.n3(x*0.026, y*0.048, z*0.026);
    if(a*a + b*b < 0.0038) return true;
    if(y < 30){
      const c = this.nCaveA.fbm3(x*0.021, y*0.036, z*0.021, 3, 2, .5);
      if(c > 0.42) return true;
    }
    return false;
  }

  oreAt(x,y,z){
    const n = this.nOre.n3(x*0.34, y*0.34, z*0.34);
    if(n < 0.52) return 0;
    const r = ((hashStr(x+':'+y+':'+z+':'+this.seed) % 1000) / 1000);
    if(y < 15){ if(r < 0.14) return B.DIAMOND_ORE; if(r < 0.30) return B.GOLD_ORE;
                if(r < 0.62) return B.IRON_ORE; return B.COAL_ORE; }
    if(y < 30){ if(r < 0.06) return B.GOLD_ORE; if(r < 0.46) return B.IRON_ORE; return B.COAL_ORE; }
    if(y < 52){ if(r < 0.30) return B.IRON_ORE; return B.COAL_ORE; }
    return r < 0.75 ? B.COAL_ORE : 0;
  }

  getChunk(cx,cz){ return this.chunks.get(ckey(cx,cz)); }

  ensureChunk(cx,cz){
    const k = ckey(cx,cz);
    let c = this.chunks.get(k);
    if(!c){ c = new Chunk(cx,cz); this.chunks.set(k,c); }
    if(c.state === 0) this.generate(c);
    return c;
  }

  /* — Terrain erzeugen — */
  generate(c){
    if(this.gen === 2) erzeugen2(this, c); else this.erzeugen1(c);
    const bl = c.blocks;
    const m = this.mods.get(ckey(c.cx,c.cz));
    if(m) for(const [i,id] of m) bl[i] = id;
    c.mods = m || null;
    c.lights = [];
    if(m) for(const [i,id] of m){ const bd = blocks[id]; if(bd && bd.light > 0) c.lights.push(i); }
    // Wasser, das jemand gegossen hat oder das gerade floss, rechnet weiter —
    // etwa nach dem Laden, oder wenn man zurückkommt
    const ox = c.cx*CS, oz = c.cz*CS;
    if(m && this.stroemung) for(const [i,id] of m) if(isWasser(id))
      this.stroemung.naechste.add(wKey(ox + (i & 15), i >> 8, oz + ((i >> 4) & 15)));
    c.state = 1;
  }
  /** Gelände der ersten Fassung — bleibt für alte Welten, wie es war */
  erzeugen1(c){
    const bl = c.blocks = new Uint8Array(CS*WH*CS);
    const ox = c.cx*CS, oz = c.cz*CS;
    const cols = [];
    for(let z=0; z<CS; z++) for(let x=0; x<CS; x++){
      const info = this.column(ox+x, oz+z);
      cols[z*CS+x] = info;
      c.hmap[z*CS+x] = info.h; c.biome[z*CS+x] = info.biome;
      const h = info.h, bio = info.biome;
      c.kalt[z*CS+x] = bio === BIO.MOUNT && h > SEA+28 ? 1 : 0;       // oben liegt Schnee
      for(let y=0; y<=Math.max(h, SEA); y++){
        let id = B.AIR;
        if(y <= 1) id = y === 0 ? B.BEDROCK : (((hashStr(x+':'+y+':'+z+':'+ox+oz) & 3) < 2) ? B.BEDROCK : B.STONE);
        else if(y > h){ if(y <= SEA) id = B.WATER; }
        else if(y === h){
          if(bio === BIO.DESERT || bio === BIO.BEACH || bio === BIO.OCEAN) id = B.SAND;
          else if(bio === BIO.MOUNT) id = h > SEA+32 ? B.SNOW : (h > SEA+27 ? B.STONE : B.GRASS);
          else id = B.GRASS;
        }
        else if(y > h-4){
          if(bio === BIO.DESERT) id = y > h-3 ? B.SAND : B.SANDSTONE;
          else if(bio === BIO.BEACH || bio === BIO.OCEAN) id = B.SAND;
          else if(bio === BIO.MOUNT && h > SEA+27) id = B.STONE;
          else id = B.DIRT;
        }
        else id = B.STONE;

        if(id === B.STONE || (id === B.DIRT && y < h-1)){
          if(this.cave(ox+x, y, oz+z) && y < h-2){ id = B.AIR; }
          else if(id === B.STONE){ const o = this.oreAt(ox+x, y, oz+z); if(o) id = o; }
        }
        bl[IDX(x,y,z)] = id;
      }
    }
    this.decorate(c, cols);
  }

  /* — Bäume, Kakteen, Gras, Blumen (deterministisch je Spalte) — */
  decorate(c, cols){
    const ox = c.cx*CS, oz = c.cz*CS;
    for(let dz=-3; dz<CS+3; dz++) for(let dx=-3; dx<CS+3; dx++){
      const wx = ox+dx, wz = oz+dz;
      const inside = dx>=0 && dx<CS && dz>=0 && dz<CS;
      const info = inside ? cols[dz*CS+dx] : this.column(wx,wz);
      const rng = mulberry32(hashStr(wx+'#'+wz+'#'+this.seed));
      const h = info.h, bio = info.biome;
      if(h <= SEA) continue;
      const r = rng();
      if((bio === BIO.FOREST && r < 0.038) || (bio === BIO.PLAINS && r < 0.006)){
        const th = 4 + ((rng()*3)|0);
        for(let y=1; y<=th; y++) this.setLocal(c, dx, h+y, dz, B.LOG);
        for(let ly=-2; ly<=1; ly++){
          const rad = ly <= -1 ? 2 : 1;
          for(let lz=-rad; lz<=rad; lz++) for(let lx=-rad; lx<=rad; lx++){
            if(Math.abs(lx)===rad && Math.abs(lz)===rad && (ly>=0 || rng()<.5)) continue;
            if(lx===0 && lz===0 && ly<1) continue;
            this.setLocal(c, dx+lx, h+th+ly, dz+lz, B.LEAVES, true);
          }
        }
        continue;
      }
      if(bio === BIO.DESERT && r < 0.022){
        const ch = 1 + ((rng()*3)|0);
        for(let y=1; y<=ch; y++) this.setLocal(c, dx, h+y, dz, B.CACTUS);
        continue;
      }
      if(!inside) continue;
      if((bio === BIO.PLAINS || bio === BIO.FOREST) && r < 0.26){
        const rr = rng();
        this.setLocal(c, dx, h+1, dz, rr < 0.955 ? B.TALLGRASS : (rr < 0.978 ? B.ROSE : B.DANDELION));
      }
    }
  }
  setLocal(c, x, y, z, id, soft){
    if(x<0||z<0||x>=CS||z>=CS||y<0||y>=WH) return;
    const i = IDX(x,y,z);
    const cur = c.blocks[i];
    if(cur !== B.AIR && !(soft && cur === B.LEAVES)) { if(!(cur===B.TALLGRASS||cur===B.ROSE||cur===B.DANDELION)) return; }
    c.blocks[i] = id;
  }

  /* — Blockzugriff — */
  getBlock(x,y,z){
    if(y < 0 || y >= WH) return B.AIR;
    const c = this.chunks.get(ckey(x>>4, z>>4));
    if(!c || c.state < 1) return B.AIR;
    return c.blocks[IDX(x&15, y, z&15)];
  }
  getLight(x,y,z){
    if(y < 0 || y >= WH) return 0xF0;
    const c = this.chunks.get(ckey(x>>4, z>>4));
    if(!c || !c.light) return 0x0F;
    return c.light[IDX(x&15, y, z&15)];
  }
  heightAt(x,z){
    const c = this.chunks.get(ckey(x>>4, z>>4));
    if(c && c.state >= 1) return c.hmap[(z&15)*CS + (x&15)];
    return this.column(x,z).h;
  }
  /** schneit es hier, statt zu regnen? */
  kaltAt(x,z){
    const c = this.chunks.get(ckey(x>>4, z>>4));
    return !!(c && c.state >= 1 && c.kalt[(z&15)*CS + (x&15)]);
  }
  biomeAt(x,z){
    const c = this.chunks.get(ckey(x>>4, z>>4));
    if(c && c.state >= 1) return c.biome[(z&15)*CS + (x&15)];
    return this.column(x,z).biome;
  }

  setBlock(x,y,z,id,noSave){
    if(y < 1 || y >= WH) return false;
    const cx = x>>4, cz = z>>4, k = ckey(cx,cz);
    const c = this.chunks.get(k);
    if(!c || c.state < 1) return false;
    const i = IDX(x&15, y, z&15);
    const old = c.blocks[i];
    if(old === id) return false;
    c.blocks[i] = id;
    const ol = blocks[old] && blocks[old].light > 0, nl = blocks[id] && blocks[id].light > 0;
    if(ol && !nl){ const k2 = c.lights.indexOf(i); if(k2 >= 0) c.lights.splice(k2,1); }
    else if(!ol && nl) c.lights.push(i);
    if(!noSave){
      let m = this.mods.get(k);
      if(!m){ m = new Map(); this.mods.set(k, m); }
      m.set(i, id); c.mods = m;
    }
    // Höhenkarte auffrischen
    const hi = (z&15)*CS + (x&15);
    if(id !== B.AIR && y > c.hmap[hi] && isOpaqueCube(id)) c.hmap[hi] = y;
    else if(id === B.AIR && y === c.hmap[hi]){ let ny = y; while(ny > 0 && !isOpaqueCube(c.blocks[IDX(x&15,ny,z&15)])) ny--; c.hmap[hi] = ny; }
    // Licht hängt nur an Dämpfung und Leuchtkraft: ändern die sich nicht
    // (Gras weg, Weizen wächst, Wasser fließt), reicht neu zeichnen
    const lo = blocks[old] ? blocks[old].light : 0, ln = blocks[id] ? blocks[id].light : 0;
    // eine Fackel leuchtet weit: beim Setzen und beim Entfernen alle Nachbarn neu belichten
    this.markDirty(cx, cz, x&15, z&15, ln > 0 || lo > 0, LOPQ[old] !== LOPQ[id] || lo !== ln);
    return true;
  }
  markDirty(cx,cz,lx,lz,wide,licht = true){
    const k = ckey(cx,cz);
    this.dirty.add(k); if(licht) this.relight.add(k);
    const touch = (a,b,mesh,light) => {
      light = light && licht;
      if(!mesh && !light) return;
      const ch = this.getChunk(a,b); if(!ch || ch.state < 1) return;
      const kk = ckey(a,b);
      if(mesh) this.dirty.add(kk);
      if(light){ this.dirty.add(kk); this.relight.add(kk); }
    };
    touch(cx-1, cz, lx <= 1 || wide, lx <= 4 || wide);
    touch(cx+1, cz, lx >= CS-2 || wide, lx >= CS-5 || wide);
    touch(cx, cz-1, lz <= 1 || wide, lz <= 4 || wide);
    touch(cx, cz+1, lz >= CS-2 || wide, lz >= CS-5 || wide);
    if(wide){
      touch(cx-1,cz-1,true,true); touch(cx+1,cz-1,true,true);
      touch(cx-1,cz+1,true,true); touch(cx+1,cz+1,true,true);
    }
  }

  /* — Licht: Sonne + Blocklicht per BFS im gepolsterten Bereich — */
  computeLight(c){
    for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++) this.ensureChunk(c.cx+dx, c.cz+dz);
    _lsk.fill(0); _lbk.fill(0);
    const ox = c.cx*CS - LM, oz = c.cz*CS - LM;
    let qh = 0, qt = 0;

    // Opazität einsammeln + Sonnenlicht von oben
    for(let z=0; z<LW; z++){
      for(let x=0; x<LW; x++){
        const wx = ox+x, wz = oz+z;
        const ch = this.chunks.get(ckey(wx>>4, wz>>4));
        const bx = wx&15, bz = wz&15;
        let l = 15;
        for(let y=WH-1; y>=0; y--){
          const id = ch ? ch.blocks[IDX(bx,y,bz)] : B.AIR;
          const op = lightOpacity(id);
          const i = LIDX(x,y,z);
          _lop[i] = op;
          if(l > 0){
            l = op >= 15 ? 0 : Math.max(0, l - op);
            if(l > 0){ _lsk[i] = l; _lq[qt++] = i; }
          }
        }
      }
    }
    // Sonnenlicht ausbreiten
    this.spread(_lsk, qh, qt);

    // Blocklicht sammeln (nur bekannte Leuchtquellen der 9 Nachbar-Chunks)
    qh = 0; qt = 0;
    for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){
      const ch = this.chunks.get(ckey(c.cx+dx, c.cz+dz));
      if(!ch || !ch.lights.length) continue;
      const bx0 = (c.cx+dx)*CS - ox, bz0 = (c.cz+dz)*CS - oz;
      for(const bi of ch.lights){
        const by = (bi / (CS*CS)) | 0, r = bi - by*CS*CS, bz = (r / CS) | 0, bxx = r - bz*CS;
        const x = bx0 + bxx, z = bz0 + bz;
        if(x < 0 || z < 0 || x >= LW || z >= LW) continue;
        const bd = blocks[ch.blocks[bi]];
        if(!bd || bd.light <= 0) continue;
        const i = LIDX(x, by, z);
        if(bd.light > _lbk[i]){ _lbk[i] = bd.light; _lq[qt++] = i; }
      }
    }
    this.spread(_lbk, qh, qt);

    // Mittelbereich in den Chunk kopieren
    if(!c.light) c.light = new Uint8Array(CS*WH*CS);
    const L = c.light;
    for(let y=0; y<WH; y++) for(let z=0; z<CS; z++){
      const li = LIDX(LM, y, z+LM), ci = IDX(0,y,z);
      for(let x=0; x<CS; x++) L[ci+x] = _lsk[li+x] | (_lbk[li+x] << 4);
    }
    c.state = Math.max(c.state, 2);
  }
  spread(arr, qh, qt){
    const cap = _lq.length;
    while(qh < qt){
      const i = _lq[qh++]; if(qh > cap) break;
      const l = arr[i];
      if(l <= 1) continue;
      const y = (i / (LW*LW)) | 0, r = i - y*LW*LW, z = (r / LW) | 0, x = r - z*LW;
      const nb = l - 1;
      if(x > 0)     this.push(arr, i-1, nb, qt) && (_lq[qt++] = i-1);
      if(x < LW-1)  this.push(arr, i+1, nb, qt) && (_lq[qt++] = i+1);
      if(z > 0)     this.push(arr, i-LW, nb, qt) && (_lq[qt++] = i-LW);
      if(z < LW-1)  this.push(arr, i+LW, nb, qt) && (_lq[qt++] = i+LW);
      if(y > 0)     this.push(arr, i-LW*LW, nb, qt) && (_lq[qt++] = i-LW*LW);
      if(y < WH-1)  this.push(arr, i+LW*LW, nb, qt) && (_lq[qt++] = i+LW*LW);
      if(qt >= cap - 8) break;
    }
  }
  push(arr, i, nb){
    const op = _lop[i];
    if(op >= 15) return false;
    const v = Math.max(0, nb - op);
    if(v <= arr[i]) return false;
    arr[i] = v; return true;
  }

  /* — Mesh bauen — */
  buildMesh(c, opaqueBuf, waterBuf){
    for(let dz=-1; dz<=1; dz++) for(let dx=-1; dx<=1; dx++){
      const n = this.ensureChunk(c.cx+dx, c.cz+dz);
      if(n.state < 2) this.computeLight(n);
    }
    if(c.state < 2) this.computeLight(c);
    const ox = c.cx*CS, oz = c.cz*CS;

    // Nachbarschafts-Cache (18er-Scheibe): Kern am Stück, Rand spaltenweise
    const CB = c.blocks, CL = c.light;
    for(let y=0; y<WH; y++){
      const py = y*PYS;
      for(let z=0; z<CS; z++){
        const src = (y*CS + z)*CS, dst = py + (z+1)*PW + 1;
        _pb.set(CB.subarray(src, src+CS), dst);
        _plt.set(CL.subarray(src, src+CS), dst);
      }
    }
    for(let z=0; z<PW; z++) for(let x=0; x<PW; x++){
      if(x > 0 && x < PW-1 && z > 0 && z < PW-1) continue;
      const wx = ox + x - 1, wz = oz + z - 1;
      const ch = this.chunks.get(ckey(wx>>4, wz>>4));
      const bx = wx&15, bz = wz&15;
      const nb = ch ? ch.blocks : null, nl = ch && ch.light ? ch.light : null;
      for(let y=0; y<WH; y++){
        const pi = y*PYS + z*PW + x;
        if(!nb){ _pb[pi] = 0; _plt[pi] = 15; continue; }
        const bi = (y*CS + bz)*CS + bx;
        _pb[pi] = nb[bi];
        _plt[pi] = nl ? nl[bi] : 15;
      }
    }

    opaqueBuf.reset(); waterBuf.reset();
    for(let y=0; y<WH; y++){
      for(let z=0; z<CS; z++){
        for(let x=0; x<CS; x++){
          const id = _pb[PIDX(x+1,y,z+1)];
          if(id === B.AIR) continue;
          const bd = blocks[id];
          if(!bd) continue;
          if(bd.model === 'cross'){ this.emitCross(opaqueBuf, x, y, z, bd); continue; }
          if(bd.model === 'torch'){ this.emitTorch(opaqueBuf, x, y, z, bd); continue; }
          if(bd.model === 'box'){ this.emitBox(opaqueBuf, x, y, z, bd); continue; }
          const buf = isWasser(id) ? waterBuf : opaqueBuf;
          this.emitCube(buf, x, y, z, id, bd);
        }
      }
    }
  }

  pb(x,y,z){ if(y<0||y>=WH) return y<0 ? B.STONE : B.AIR; return _pb[y*PYS + z*PW + x]; }

  /* Wasserhöhe einer Zelle in Sechzehnteln für die Ecken der Oberfläche:
     16 mit Wasser darüber, sonst nach der Menge; Luft zieht die Ecke nach
     unten (0), feste Blöcke zählen nicht (−1). Wie beim Vorbild. */
  wasserZelle(px, y, pz){
    const id = this.pb(px, y, pz);
    if(isWasser(id)) return isWasser(this.pb(px, y+1, pz)) ? 16 : wasserMenge(id)*16/9;
    return SOL[id] === 1 ? -1 : 0;
  }
  /** Höhe einer oberen Ecke (cx, cz ∈ {0, 1}) des Wasserblocks bei px, pz:
      Mittel der vier Zellen an der Ecke, hohes Wasser zählt zehnfach —
      so geht die Oberfläche von Block zu Block ohne Stufe über */
  wasserEcke(px, y, pz, cx, cz){
    const sx = cx ? 1 : -1, sz = cz ? 1 : -1;
    const a = this.wasserZelle(px + sx, y, pz), b = this.wasserZelle(px, y, pz + sz);
    if(a >= 16 || b >= 16) return 16;
    let summe = 0, gewicht = 0;
    const dazu = h => { if(h >= 12.8){ summe += h*10; gewicht += 10; } else if(h >= 0){ summe += h; gewicht++; } };
    if(a > 0 || b > 0){ const d = this.wasserZelle(px + sx, y, pz + sz); if(d >= 16) return 16; dazu(d); }
    dazu(this.wasserZelle(px, y, pz)); dazu(a); dazu(b);
    return gewicht ? summe/gewicht : 14;
  }

  emitCube(buf, x, y, z, id, bd){
    const px = x+1, pz = z+1;
    const water = isWasser(id);
    const cutout = bd.model === 'cutout';
    const opaqueSelf = bd.opaque === true;
    // Wasser ohne Wasser darüber: die Oberfläche liegt tiefer und neigt sich zum Rand
    const topOpen = water && !isWasser(this.pb(px, y+1, pz));
    if(topOpen) for(let cz = 0; cz < 2; cz++) for(let cx = 0; cx < 2; cx++) _eckeH[cz*2 + cx] = this.wasserEcke(px, y, pz, cx, cz);
    for(let f=0; f<6; f++){
      const F = FACES[f];
      const nx = px + F.n[0], ny = y + F.n[1], nz = pz + F.n[2];
      const nid = this.pb(nx, ny, nz);
      if(nid === id && cutout) continue;
      if(water && isWasser(nid)) continue;
      if(OPQ[nid] === 1) continue;
      if(water && nid !== B.AIR && SOL[nid] === 0) continue;

      let texName = bd.faces[f];
      if(bd.dirFront && f === 5) texName = bd.dirFront;
      // Gras unter Schnee: die Seiten tragen einen weißen Saum
      if(id === B.GRASS && F.n[1] === 0){ const ob = this.pb(px, y+1, pz); if(ob === B.SCHNEEDECKE || ob === B.SNOW) texName = 'grass_side_snow'; }
      const layer = TEX[texName] !== undefined ? TEX[texName] : 0;

      const T = FACE_NB[f];
      const nOut = ny < 0 || ny >= WH;
      const nBase = nOut ? -1 : ny*PYS + nz*PW + nx;
      const nSky = nOut ? (ny < 0 ? 0 : 15) : (_plt[nBase] & 15);
      const nBlk = nOut ? 0 : (_plt[nBase] >> 4);

      for(let i=0; i<4; i++){
        const k = i*6;
        const ax = nx + T[k],   ay = ny + T[k+1],   az = nz + T[k+2];
        const bx = nx + T[k+3], by = ny + T[k+4],   bz = nz + T[k+5];
        const cx = bx + T[k],   cy = by + T[k+1],   cz2 = bz + T[k+2];
        const s1 = this.pb(ax, ay, az), s2 = this.pb(bx, by, bz), cn = this.pb(cx, cy, cz2);
        const a1 = OPQ[s1], a2 = OPQ[s2], ac = OPQ[cn];
        _aoV[i] = opaqueSelf ? ((a1 && a2) ? 0 : 3 - (a1 + a2 + ac)) : 3;
        let ss = nSky, bb = nBlk, cnt = 1;
        if(!a1 && ay >= 0 && ay < WH){ const li = _plt[ay*PYS + az*PW + ax]; ss += li & 15; bb += li >> 4; cnt++; }
        if(!a2 && by >= 0 && by < WH){ const li = _plt[by*PYS + bz*PW + bx]; ss += li & 15; bb += li >> 4; cnt++; }
        if(!ac && !(a1 && a2) && cy >= 0 && cy < WH){ const li = _plt[cy*PYS + cz2*PW + cx]; ss += li & 15; bb += li >> 4; cnt++; }
        _skV[i] = (ss/cnt) | 0; _bkV[i] = (bb/cnt) | 0;
      }
      for(let i=0; i<4; i++){
        const vo = F.v[i], uv = F.uv[i];
        let vy = (y + vo[1])*16;
        if(topOpen && vo[1] === 1) vy = y*16 + Math.round(_eckeH[vo[2]*2 + vo[0]]);
        buf.vert((x+vo[0])*16, vy, (z+vo[2])*16,
                 _aoV[i] | (f<<2), layer, _skV[i], _bkV[i], uv[0]*16, uv[1]*16);
      }
      buf.quad(_aoV[0] + _aoV[2] > _aoV[1] + _aoV[3]);
    }
  }

  emitCross(buf, x, y, z, bd){
    const layer = TEX[bd.faces[0]] !== undefined ? TEX[bd.faces[0]] : 0;
    const lv = this.getLightLocal(x+1, y, z+1);
    const sky = lv & 15, blk = lv >> 4;
    const X = x*16, Y = y*16, Z = z*16;
    const planes = [[[1,0,1],[15,0,15]], [[15,0,1],[1,0,15]]];
    for(const [a,b] of planes){
      for(let side=0; side<2; side++){
        const p0 = side ? b : a, p1 = side ? a : b;
        buf.vert(X+p0[0], Y,    Z+p0[2], 3|(6<<2), layer, sky, blk, 0, 16);
        buf.vert(X+p1[0], Y,    Z+p1[2], 3|(6<<2), layer, sky, blk, 16, 16);
        buf.vert(X+p1[0], Y+16, Z+p1[2], 3|(6<<2), layer, sky, blk, 16, 0);
        buf.vert(X+p0[0], Y+16, Z+p0[2], 3|(6<<2), layer, sky, blk, 0, 0);
        buf.quad(false);
      }
    }
  }

  /* Fackel: ein Stab von 2/16 Breite. Die Textur ist das Symbol selbst;
     der Stab zeigt die mittleren vier Spalten, von der Flamme bis zum Fuß. */
  emitTorch(buf, x, y, z, bd){
    const layer = TEX['torch'];
    const lv = this.getLightLocal(x+1, y+1, z+1);
    const sky = lv & 15, blk = Math.max(lv >> 4, 14);
    const X = x*16, Y = y*16, Z = z*16;
    const a = 7, b = 9, top = 10, v0 = 3;
    const sides = [
      [[b,0,a],[b,top,a],[b,top,b],[b,0,b], 0],
      [[a,0,b],[a,top,b],[a,top,a],[a,0,a], 1],
      [[a,0,b],[b,0,b],[b,top,b],[a,top,b], 4],
      [[b,0,a],[a,0,a],[a,top,a],[b,top,a], 5],
    ];
    const uvs = [[a,16],[a,v0],[b,v0],[b,16]];
    const uvs2 = [[a,16],[b,16],[b,v0],[a,v0]];
    for(const s of sides){
      const U = s[4] >= 4 ? uvs2 : uvs;
      for(let i=0; i<4; i++){
        const p = s[i];
        buf.vert(X+p[0], Y+p[1], Z+p[2], 3|(6<<2), layer, sky, blk, U[i][0], U[i][1]);
      }
      buf.quad(false);
    }
    const tp = [[a,top,a],[a,top,b],[b,top,b],[b,top,a]];
    const uvt = [[a,4],[a,6],[b,6],[b,4]];
    for(let i=0; i<4; i++) buf.vert(X+tp[i][0], Y+tp[i][1], Z+tp[i][2], 3|(2<<2), layer, sky, blk, uvt[i][0], uvt[i][1]);
    buf.quad(false);
  }

  /* Kasten kleiner als ein Block: Bett, Acker, Tür, Leiter. Die Textur wird
     zugeschnitten, nicht gestaucht — ein halbhohes Bett zeigt die untere
     Hälfte seiner Seitentextur. Flächen auf dem Blockrand werden wie beim
     Würfel gegen undurchsichtige Nachbarn verworfen. */
  emitBox(buf, x, y, z, bd){
    const bx = bd.box, px = x+1, pz = z+1;
    const own = this.getLightLocal(px, y, pz);
    for(let f=0; f<6; f++){
      const F = FACES[f], ST = FACE_ST[f];
      const ax = F.nAx, pos = F.n[ax] > 0;
      const amRand = pos ? bx[ax+3] === 16 : bx[ax] === 0;
      let lv = own;
      if(amRand){
        const nx = px + F.n[0], ny = y + F.n[1], nz = pz + F.n[2];
        const nid = this.pb(nx, ny, nz);
        if(OPQ[nid] === 1) continue;
        lv = this.getLightLocal(nx, ny, nz);
      }
      const texName = (bd.dirFront && f === 5) ? bd.dirFront : bd.faces[f];
      const layer = TEX[texName] !== undefined ? TEX[texName] : 0;
      const sky = lv & 15, blk = lv >> 4;
      for(let i=0; i<4; i++){
        const vo = F.v[i];
        const cx = vo[0] ? bx[3] : bx[0], cy = vo[1] ? bx[4] : bx[1], cz = vo[2] ? bx[5] : bx[2];
        const c = [cx, cy, cz];
        const s = ST.sFlip ? 16 - c[ST.sAx] : c[ST.sAx];
        const t = ST.tFlip ? 16 - c[ST.tAx] : c[ST.tAx];
        buf.vert(x*16 + cx, y*16 + cy, z*16 + cz, 3 | (f<<2), layer, sky, blk, s, t);
      }
      buf.quad(false);
    }
  }

  getLightLocal(px,py,pz){
    if(py < 0 || py >= WH) return 0x0F;
    return _plt[py*PYS + pz*PW + px];
  }

  /* — Strahl-Abfrage (Amanatides & Woo) — */
  raycast(ox,oy,oz, dx,dy,dz, maxD, liquid){
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = Math.abs(1/dx), tdy = Math.abs(1/dy), tdz = Math.abs(1/dz);
    let tmx = (dx > 0 ? (x+1-ox) : (ox-x)) * tdx;
    let tmy = (dy > 0 ? (y+1-oy) : (oy-y)) * tdy;
    let tmz = (dz > 0 ? (z+1-oz) : (oz-z)) * tdz;
    let fx = 0, fy = 0, fz = 0, t = 0;
    for(let i=0; i<512 && t <= maxD; i++){
      const id = this.getBlock(x,y,z);
      const bd = blocks[id];
      if(id !== B.AIR && bd && bd.model !== 'none' && (!isWasser(id) || (liquid && (liquid !== 'quelle' || id === B.WATER))))
        return { hit:true, x, y, z, nx:fx, ny:fy, nz:fz, id, t };
      if(tmx < tmy && tmx < tmz){ x += sx; t = tmx; tmx += tdx; fx = -sx; fy = 0; fz = 0; }
      else if(tmy < tmz){ y += sy; t = tmy; tmy += tdy; fx = 0; fy = -sy; fz = 0; }
      else { z += sz; t = tmz; tmz += tdz; fx = 0; fy = 0; fz = -sz; }
    }
    return { hit:false };
  }
}
