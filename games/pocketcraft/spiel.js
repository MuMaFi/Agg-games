/* Pocketcraft · Spiel, Eingabe, Schleife, Menüs */
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   SPIEL — Streaming, Eingabe, Regeln, Bild
   ═══════════════════════════════════════════════════════════════════ */
const PC_FASSUNG = '2026-11-07i';             // in den Optionen zu sehen: läuft die neueste Fassung?
const OPT_KEY  = 'taschenwelt.opts.v1';      // Name aus der Zeit vor Pocketcraft, bleibt für die Einstellungen
const DAY_LEN  = 720;             // Sekunden je voller Tag
/** so viele Chunks müssen stehen, bevor man spielt — bei großer Sichtweite
    nicht mehr als bei acht, der Rest kommt beim Spielen dazu */
const ladeZiel = rd => { const r = Math.min(rd, 8); return Math.max(9, ((r*2+1)*(r*2+1)) * 0.55 | 0); };
const MOB_SPRUNG = 9;             // so schnell springen Wesen ab: gut einen Block hoch (früher 7,6 — zu wenig für eine Stufe)
const SCHLEIM_MAX = 4;            // so viele Schleime höchstens um einen Spieler
/* Wie viele Monster um einen Spieler herum sein dürfen — nachts, tagsüber
   (in Höhlen und im Dunkeln) und Schleime. Einstellbar in den Optionen;
   beim Mitspielen gilt, was der Host eingestellt hat. */
const MONSTER_MENGE = {
  keine:  { name:'Keine',  nacht:0,  tag:0, schleime:0 },
  wenige: { name:'Wenige', nacht:3,  tag:1, schleime:1 },
  normal: { name:'Normal', nacht:7,  tag:2, schleime:2 },
  viele:  { name:'Viele',  nacht:14, tag:5, schleime:SCHLEIM_MAX },
};
const MONSTER_REIHE = ['normal', 'wenige', 'keine', 'viele'];
const SCHLEIM_HOEHE = 39;         // darunter erscheinen sie, wie beim Vorbild
const BETT_HOEHE = 9/16;          // so hoch ist das Strohbett: darauf liegt man

/** wer so trifft, ist ein Golem: die Beute fällt, niemand wird zornig */
const GOLEM_HAND = Object.freeze({ creative: false, golem: true });
const Game = {
  world:null, player:null, mobs:[], drops:[],
  running:false, time: DAY_LEN*0.12, tick:0,
  settings:{ rd:5, sens:12, autojump:true, debug:false, geraeusche:100, musik:70, superGrafik:false, monster:'normal', klassik:false, mcTexturen:false, mcKlaenge:false, steuerung:'kreuz', helligkeit:0 },
  bufA: new MeshBuf(), bufB: new MeshBuf(),
  meshes: new Map(), angriffT:10, lastSave:0, loading:true, loadTarget:1, loadDone:0,
  breakPos:null, breakProg:0, breakTotal:1, fps:60, _fpsAcc:0, _fpsN:0,
  hurtFlash:0, mobTimer:0, camShake:0,
  bett:null, schlafT:0,             // im Bett: wo, und wo man vorher stand · schlafT: Abblenden über Nacht
  meta:null, gesamtZeit:0, panoramaAktiv:false, _panoZiel:0,
  pfeile:[], bogen:{ aktiv:false, t:0 }, partikel:[],
  gaeste:{},                        // Host: Inventar und Ort der Mitspieler, mit der Welt gespeichert
  regeln: Object.assign({}, REGELN_START),   // /gamerule
  ops: new Set(),                   // Host: Mitspieler, die alle Befehle dürfen (/op)

  /** Sichtweite: das Panorama begnügt sich mit weniger */
  sicht(){ return this.panoramaAktiv ? Math.min(4, this.settings.rd) : this.settings.rd; },

  /** eine Welt einrichten — Oberwelt wie Nether: Wasser, Redstone, und jede
      Blockänderung geht an die Mitspieler und an Wasser und Redstone */
  weltEinrichten(w){
    // Jede Blockänderung aus dem eigenen Spiel geht an die Mitspieler; was
    // aus dem Netz kommt (Netz.eingehend), natürlich nicht zurück
    const setzen = w.setBlock.bind(w);
    // Wasser: jede Änderung meldet das Wasser daneben an (gerechnet wird nur beim Host)
    w.feuer = new Map();
    w.stroemung = new Stroemung(w);
    w.stroemung.wegspuelen = (x, y, z, id) => {
      if(isWheat(id)) w.crops.delete(x + ',' + y + ',' + z);
      const d = this.dropsFor(id, true);
      if(d) for(const [i, n] of d) this.dropItem(i, n, x + .5, y + .3, z + .5);
    };
    // Redstone: ebenso, gerechnet wird auch nur beim Host
    w.schaltung = new Schaltung(w);
    w.schaltung.abfallen = w.stroemung.wegspuelen;
    w.schaltung.wesen = () => {
      const l = [], p = this.player, d = dimVonWelt(w);
      if(p && !p.dead && this.world === w && !this._fremd) l.push(p);
      for(const s of Netz.andere.values()) if(!s.tot && (s.dim || 'oben') === d) l.push(s);
      return l.concat(this.world === w ? this.mobs : []);
    };
    w.schaltung.tuer = (x, y, z, offen) => this.tuerStellen(x, y, z, offen);
    w.schaltung.klang = (art, x, y, z) => Sfx.play('rs_' + art, x + .5, y + .5, z + .5);
    // Kolben schieben, was in den Zellen steht, in die die Blöcke rücken — Mitspieler auf ihrem Gerät
    w.schaltung.schieben = (zellen, dx, dy, dz) => {
      const drin = e => { const hw = e.w/2; return zellen.some(([cx, cy, cz]) => e.x + hw > cx && e.x - hw < cx + 1 && e.z + hw > cz && e.z - hw < cz + 1 && e.y + e.h > cy && e.y < cy + 1); };
      const schub = e => { e.x += dx; e.y += dy; e.z += dz; if(dy > 0) e.vy = Math.max(e.vy || 0, 0); };
      const p = this.player;
      if(p && !p.dead && drin(p)){ schub(p); p.fallFrom = null; }
      for(const m of this.mobs) if(drin(m)) schub(m);
      for(const g of Netz.gaeste.values())
        if(g.bereit && !g.tot && drin({ x: g.x, y: g.y, z: g.z, w: 0.6, h: 1.8 })) Befehle.an({ ich: false, g }, 'schub', { dx, dy, dz });
    };
    w.setBlock = (x, y, z, id, noSave) => {
      const vorher = w.getBlock(x, y, z);
      const ok = setzen(x, y, z, id, noSave);
      if(ok && !noSave && Netz.rolle && !Netz.eingehend) Netz.blockGeaendert(x, y, z, id, Netz.dimNr(dimVonWelt(w)));
      if(ok && !Netz.istGast){ w.stroemung.melden(x, y, z); w.schaltung.melden(x, y, z, vorher, id); }
      if(ok && (id === B.FEUER || vorher === B.FEUER)){
        const k = x + ',' + y + ',' + z;
        if(id === B.FEUER) w.feuer.set(k, 6 + Math.random()*10); else w.feuer.delete(k);
      }
      // was nur dort geschieht, wo man selbst ist (der Host rechnet auch die andere Welt mit)
      const hier = w === this.world && !this._fremd;
      if(ok && hier && !Netz.istGast && isGeschnitzt(id) && !isGeschnitzt(vorher)) setTimeout(() => this.golemBauen(x, y, z), 0);
      // Plattenspieler: Platte hinein spielt, Platte heraus oder Block weg verstummt —
      // bei allen, denn auch Änderungen aus dem Netz kommen hier vorbei
      if(ok && hier && (id === B.JUKEBOX_VOLL) !== (vorher === B.JUKEBOX_VOLL)){
        if(id === B.JUKEBOX_VOLL) Plattenspieler.an(x, y, z); else Plattenspieler.aus(x, y, z);
      }
      return ok;
    };
  },

  /* ── Start ───────────────────────────────────────────────────────── */
  /** meta: Steckbrief der Welt · saved: Datenteil oder null für eine neue */
  start(meta, saved){
    this.meta = meta;
    this.bett = null; this.schlafT = 0;
    this.panoramaAktiv = false;
    document.body.classList.remove('imMenue');
    const seed = meta.seed;
    this.world = new World(seed, meta.gen || (saved && saved.gen) || 1, meta.typ || (saved && saved.typ), meta.doerfer || (saved && saved.doerfer),
      meta.obsidian || (saved && saved.obsidian));
    Wetter.laden(saved && saved.wetter);
    this.regelnSetzen(saved && saved.regeln);
    this.ops = new Set((saved && Array.isArray(saved.ops) && saved.ops) || []);
    Chat.leeren();
    // Oberwelt einrichten; den Nether gibt es erst, wenn jemand hinübergeht (netherWelt)
    this.weltEinrichten(this.world);
    this.oben = this.world; this.nether = null; this.ende = null; this.dim = 'oben'; this._dimRest = {};
    this.wasser = this.world.stroemung; this.schaltung = this.world.schaltung;
    Plattenspieler.alleAus();
    this.player = new Player();
    this.mobs = []; this.drops = []; this.pfeile = []; this.partikel = []; this.bogen.aktiv = false;
    this.meshes.forEach(m => { R.freeMesh(m.o); R.freeMesh(m.w); });
    this.meshes.clear();
    Inv.clear(); Inv.sel = 0;
    this.time = DAY_LEN*0.12;

    this.gesamtZeit = saved ? (saved.zeit || 0) : 0;
    this.gaeste = (saved && saved.gaeste) || {};
    if(saved){
      const p = this.player;
      Object.assign(p, saved.p);
      p.dead = false;
      this.time = saved.time || this.time;
      for(let i=0;i<36;i++) Inv.slots[i] = saved.inv[i] ? { id:saved.inv[i][0], n:saved.inv[i][1], dur:saved.inv[i][2]|0 } : null;
      for(const [k, arr] of saved.mods){
        const m = new Map();
        for(let i=0;i<arr.length;i+=2) m.set(arr[i], (saved.lava ? arr[i+1] : altNummer(arr[i+1])));
        this.world.mods.set(k, m);
      }
      for(const [k, f] of (saved.furn || [])) this.world.furnaces.set(k, f);
      const stapel = a => a ? { id:a[0], n:a[1], dur:a[2]|0 } : null;
      for(const [k, arr] of (saved.truhen || [])) this.world.chests.set(k, arr.map(stapel));
      for(const [k, f] of (saved.felder || [])) this.world.crops.set(k, f);
      // Netherportale der Oberwelt, und der Nether selbst, wenn schon jemand dort war
      for(const q of (saved.portale || [])) this.oben.portale.set(q.x + ',' + q.y + ',' + q.z, q);
      if(saved.nether) this.weltLaden(this.netherWelt(), saved.nether);
      if(saved.ende) this.weltLaden(this.endeWelt(), saved.ende);
      if(saved.drache && this.ende) this.ende.drache = saved.drache;
      const dw = saved.dim === 'nether' ? this.nether : saved.dim === 'ende' ? this.ende : null;
      if(dw){ this.dim = saved.dim; this.world = dw; this.wasser = dw.stroemung; this.schaltung = dw.schaltung; }
      // gezüchtete und gefütterte Tiere bleiben in der Welt
      for(const t of (saved.tiere || [])){
        const [art, x, y, z, yaw, hp, kind, pause, wolle, geschoren] = t;
        if(!MOBS[art]) continue;
        const m = new Mob(art, x, y, z, kind > 0);
        m.kind = kind; m.yaw = yaw; m.health = hp; m.pause = pause; m.bleibt = true;
        if(art === 'sheep'){ m.wolle = wolle | 0; m.geschoren = !!geschoren; m.wolleT = 30 + Math.random()*60; }
        if(art === 'villager') m.beruf = wolle | 0;               // herbeigerufene Dorfbewohner behalten ihren Beruf
        this.mobs.push(m);
      }
      (saved.ruest || []).forEach((a, i) => { Inv.ruestung[i] = stapel(a); });
      for(const id of (saved.bekannt || [])) Inv.bekannt.add(id);
      // was beim Speichern im Raster oder in der Hand lag
      for(const a of (saved.rest || [])){ const r = Inv.addStack(stapel(a)); if(r) this.dropItem(r.id, r.n, p.x, p.y + 1, p.z, r.dur); }
      Inv.merkeAlles();
      this.platzSuchen = false;
    } else {
      if(meta.modus === 'kreativ') this.player.creative = true;
      this.findSpawn();
      this.platzSuchen = true;
      if(this.player.creative){
        Inv.add(B.PLANKS,64); Inv.add(B.COBBLE,64); Inv.add(B.GLASS,64);
        Inv.add(B.TORCH,64); Inv.add(B.TABLE,1); Inv.add(B.CHEST,1);
        Inv.add(ITEM.diamond_pickaxe,1); Inv.add(ITEM.diamond_sword,1); Inv.add(B.DOOR,1);
      }
    }
    this.loading = true; this.loadDone = 0;
    this.loadTarget = ladeZiel(this.sicht());
    this.running = true;
    this.lastSave = performance.now();
    HUD.build(); HUD.refreshHotbar();
    Musik.inDieWelt();
    $('#hud').classList.add('on');
    Screens.hide();
  },

  /** Beitreten: Die Welt kommt vom Host — Startwert, veränderte Blöcke,
      Truhen, Öfen, Felder. Wer schon einmal da war, bekommt sein Inventar
      und seinen Platz zurück; Neue stehen am Startpunkt des Hosts. */
  startGast(m){
    const w = m.welt, du = m.du || {};
    const meta = { id: 'gast', gast: true, name: w.name, seed: w.seed, modus: w.modus, gen: w.gen || 1, typ: w.typ, doerfer: !!w.doerfer, obsidian: !!w.obsidian };
    this.start(meta, {
      p: du.p || null, inv: du.inv || [], ruest: du.ruest || [], bekannt: du.bekannt || [], rest: du.rest || [],
      mods: w.mods || [], lava: 1, furn: w.furn || [], truhen: w.truhen || [], felder: w.felder || [],
      portale: w.portale || [], nether: w.nether, ende: w.ende, drache: w.drache, dim: w.dim,
      time: w.time, zeit: w.zeit, tiere: [], wetter: w.wetter, regeln: w.regeln
    });
    const p = this.player;
    p.creative = w.modus === 'kreativ';
    p.dead = false;
    if(!(p.health > 0)) p.health = p.maxHealth;
    if(!du.p){
      const [x, y, z] = w.spawn || [0.5, 70, 0.5];
      p.x = p.spawnX = x; p.y = p.spawnY = y; p.z = p.spawnZ = z;
      this.platzSuchen = true;
    }
  },

  /* ── Panorama: eine Welt dreht sich hinter dem Titelbild ─────────── */
  panorama(seed){
    const neu = !!seed;
    if(neu){
      this.world = new World(seed, WELT_FASSUNG);
      this.player = new Player();
      this.meshes.forEach(m => { R.freeMesh(m.o); R.freeMesh(m.w); });
      this.meshes.clear();
      this.findSpawn();
      this._panoHoehe = true;
      this.loading = true; this.loadDone = 0;
      this.loadTarget = ladeZiel(Math.min(4, this.settings.rd));
      document.body.classList.remove('panoBereit');
    } else {
      // die gerade verlassene Welt bleibt stehen, die Kamera hebt sich über die Bäume
      this.panoramaHoehe();
      document.body.classList.add('panoBereit');
    }
    const p = this.player;
    p.pitch = -0.12; p.vx = p.vy = p.vz = 0; p.swinging = false;
    this.mobs = []; this.drops = []; this.pfeile = []; this.partikel = []; this.bogen.aktiv = false;
    this.time = DAY_LEN*0.2;
    Wetter.aus();
    this.panoramaAktiv = true;
    this.running = false;
    this.meta = null;
    document.body.classList.add('imMenue');
  },
  /** über dem höchsten Punkt der Umgebung, damit kein Baum im Bild steht */
  panoramaHoehe(){
    const w = this.world, p = this.player;
    let h = 0;
    for(let dz = -3; dz <= 3; dz++) for(let dx = -3; dx <= 3; dx++){
      const x = Math.floor(p.x) + dx, z = Math.floor(p.z) + dz;
      for(let y = WH-1; y > 0; y--){ const id = w.getBlock(x, y, z); if(id !== B.AIR && id !== B.TALLGRASS){ h = Math.max(h, y); break; } }
    }
    p.y = h + 3.2;
  },
  zumTitel(){
    Screens.hide();
    Chat.leeren();
    Plattenspieler.alleAus();
    this.running = false;
    this.meta = null;
    $('#hud').classList.remove('on');
    Menue.ladeStand(false);
    this.panorama(null);
    Musik.zumTitel();
  },
  /** Vorschaubild für die Weltenliste, ohne Hand, quadratisch aus der Mitte */
  bildJetzt(){
    if(this.loading || this.panoramaAktiv || document.hidden) return null;
    try{
      this._ohneHand = true; render(0); this._ohneHand = false;
      const q = document.createElement('canvas'); q.width = q.height = 96;
      const s = Math.min(canvas.width, canvas.height);
      q.getContext('2d').drawImage(canvas, (canvas.width - s)/2, (canvas.height - s)/2, s, s, 0, 0, 96, 96);
      return q.toDataURL('image/jpeg', 0.72);
    }catch(e){ this._ohneHand = false; return null; }
  },

  findSpawn(){
    const p = this.player, w = this.world;
    if(w.typ === 'flach'){
      p.x = p.spawnX = 0.5; p.y = p.spawnY = FLACH_H + 1.02; p.z = p.spawnZ = 0.5;
      return;
    }
    // neues Gelände: am liebsten auf Wiesen und in Wäldern, sonst irgendwo an Land, nie auf Gipfeln
    const land = info => info.h > SEA+2 && info.biome !== BIO.OCEAN && info.biome !== BIO.BEACH &&
      (w.gen === 1 || (info.biome !== BIO.FLUSS && info.biome !== BIO.MOUNT && info.h < SEA + 20));
    const gruen = info => land(info) && (w.gen === 1 || info.biome === BIO.PLAINS || info.biome === BIO.FOREST);
    for(const gut of [gruen, land]) for(let r=0; r<(gut === gruen ? 400 : 220); r+=3){
      for(let a=0; a<12; a++){
        const ang = a/12*TAU;
        const x = Math.round(Math.cos(ang)*r), z = Math.round(Math.sin(ang)*r);
        const info = this.world.column(x,z);
        if(gut(info)){
          p.x = x+0.5; p.z = z+0.5; p.y = info.h+1.2;
          p.spawnX = p.x; p.spawnY = p.y; p.spawnZ = p.z;
          return;
        }
      }
    }
    p.x = 0.5; p.z = 0.5; p.y = this.world.column(0,0).h + 1.2;
    p.spawnX = p.x; p.spawnY = p.y; p.spawnZ = p.z;
  },

  /**
   * Der Startpunkt kommt aus der Geländehöhe, Bäume kennt die noch nicht:
   * früher stand man manchmal mitten in einem Stamm. Sobald die Chunks da
   * sind, wird ein Platz unter freiem Himmel gesucht.
   */
  freierPlatz(x0, z0, setzeSpawn){
    const w = this.world, p = this.player;
    for(let r = 0; r <= 14; r++){
      for(let dz = -r; dz <= r; dz++) for(let dx = -r; dx <= r; dx++){
        if(Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = Math.floor(x0) + dx, z = Math.floor(z0) + dz;
        const c = w.getChunk(x >> 4, z >> 4);
        if(!c || c.state < 1) continue;
        const h = w.heightAt(x, z), boden = w.getBlock(x, h, z);
        if(boden !== B.GRASS && boden !== B.SAND && boden !== B.SNOW && boden !== B.DIRT) continue;
        let frei = true;
        for(let y = h + 1; y < Math.min(WH, h + 12); y++){
          const id = w.getBlock(x, y, z);
          if(y <= h + 2 ? blocksMovement(id) : (id === B.LEAVES || id === B.LOG || id === B.FICHTENNADELN || id === B.FICHTENSTAMM)){ frei = false; break; }
        }
        if(!frei) continue;
        p.x = x + 0.5; p.z = z + 0.5; p.y = h + 1.02; p.vy = 0;
        if(setzeSpawn){ p.spawnX = p.x; p.spawnY = p.y; p.spawnZ = p.z; }
        return true;
      }
    }
    return false;
  },

  /* ── Nether ──────────────────────────────────────────────────────────
     Eine zweite Welt mit eigenem Startwert, eigenen Änderungen, Wesen und
     Dingen. Wer durch ein Portal geht, wechselt die Welt: im Nether zählt
     ein Block acht in der Oberwelt. Im Mehrspieler führen alle beide Welten
     (Blöcke, Truhen, Öfen, Portale kommen mit ihrer Welt); Wesen, Liegendes
     und Geschosse rechnet der Host für jede Welt, in der jemand ist. */
  netherWelt(){
    if(!this.nether){ this.nether = new World(this.oben.seedStr + ':nether', 2, 'nether'); this.weltEinrichten(this.nether); }
    return this.nether;
  },
  /** das End: Startwert der Oberwelt mit »:ende«; wie es dem Drachen geht, steht in w.drache */
  endeWelt(){
    if(!this.ende){ this.ende = new World(this.oben.seedStr + ':ende', 2, 'ende'); this.weltEinrichten(this.ende); this.ende.drache = this.ende.drache || { tot: false, kristalle: null }; }
    return this.ende;
  },
  welt(d){ return d === 'nether' ? this.netherWelt() : d === 'ende' ? this.endeWelt() : this.oben; },
  /** Wesen, Liegendes und Geschosse einer Welt (die eigene oder die abgelegte) */
  listen(d){
    if(d === this.dim) return this;
    return this._dimRest[d] || (this._dimRest[d] = { mobs: [], drops: [], pfeile: [] });
  },
  /** fn in der Welt d rechnen, als wäre man dort — nur der Host tut das für
      die Welt, in der er selbst nicht ist; still, man hört dort nichts */
  inDim(d, fn){
    if(d === this.dim) return fn();
    const w = this.welt(d), r = this.listen(d);
    const alt = [this.world, this.dim, this.mobs, this.drops, this.pfeile, this.wasser, this.schaltung, this.partikel, this._fremd, Sfx.stumm];
    this.world = w; this.dim = d; this.mobs = r.mobs; this.drops = r.drops; this.pfeile = r.pfeile;
    this.wasser = w.stroemung; this.schaltung = w.schaltung; this.partikel = []; this._fremd = true; Sfx.stumm = true;
    try{ return fn(); }
    finally {
      r.mobs = this.mobs; r.drops = this.drops; r.pfeile = this.pfeile;
      [this.world, this.dim, this.mobs, this.drops, this.pfeile, this.wasser, this.schaltung, this.partikel, this._fremd, Sfx.stumm] = alt;
    }
  },
  /** Feuer brennt ein paar Sekunden und geht aus — auf Netherrack brennt es
      immer, ohne festen Block darunter sofort nicht mehr. Gemerkt wird es in
      w.feuer ("x,y,z" → Sekunden); was nach dem Laden noch brennt, findet
      sich beim ersten Blick in die Chunks (feuerSuchen). */
  feuerBrennt(dt){
    const w = this.world;
    if(!w.feuer) return;
    for(const [k, t] of w.feuer){
      const [x, y, z] = k.split(',').map(Number);
      if(w.getBlock(x, y, z) !== B.FEUER){ w.feuer.delete(k); continue; }
      const unten = w.getBlock(x, y - 1, z);
      if(!blocksMovement(unten)){ w.setBlock(x, y, z, B.AIR); continue; }
      if(unten === B.NETHERRACK) continue;
      const rest = t - dt;
      if(rest <= 0) w.setBlock(x, y, z, B.AIR); else w.feuer.set(k, rest);
    }
  },
  /** Host: die andere Welt weiterrechnen, solange ein Gast dort ist */
  andereWeltRechnen(dt){
    if(!Netz.istHost) return;
    for(const d of DIMS){
    if(d === this.dim || !Netz.bereiteGaeste().some(g => (g.dim || 'oben') === d)) continue;
    this.inDim(d, () => {
      this.updateMobs(dt); this.updateDrops(dt); this.updatePfeile(dt);
      this.tickFurnaces(dt); this.tickFelder(dt); this.spawnMobs(dt); this.feuerBrennt(dt); if(d === 'oben') this.dorfLeben(dt);
      this.wasser.tick(dt); this.schaltung.tick(dt); this.wolkenTick(dt);
      this._pruefAndere = (this._pruefAndere || 0) - dt;
      if(this._pruefAndere <= 0){ this._pruefAndere = 1; this.portalePruefen(); }
    });
    }
  },
  dimWechseln(ziel){
    if(ziel === this.dim) return;
    this._dimRest[this.dim] = { mobs: this.mobs, drops: this.drops, pfeile: this.pfeile };
    this.dim = ziel;
    this.world = this.welt(ziel);
    this.wasser = this.world.stroemung; this.schaltung = this.world.schaltung;
    const r = this._dimRest[ziel] || {};
    this.mobs = r.mobs || []; this.drops = r.drops || []; this.pfeile = r.pfeile || []; this.partikel = [];
    // als Gast kommt, was in der neuen Welt ist, vom Host — und der erfährt gleich, wo man jetzt ist
    if(Netz.istGast){ this.mobs = []; this.drops = []; this.pfeile = []; this._dimRest = {}; Netz.dimGewechselt(); }
    this.meshes.forEach(m => { R.freeMesh(m.o); R.freeMesh(m.w); });
    this.meshes.clear();
    Plattenspieler.alleAus();
    this.loading = true; this.loadDone = 0; this.loadTarget = ladeZiel(this.sicht());
  },
  /** Rahmen aus Obsidian um die freie Zelle (x, y, z)? Innen 2 … 21 breit
      und 3 … 21 hoch, entlang x oder z, ringsum Obsidian (Ecken egal) */
  portalRahmen(w, x, y, z){
    const G = (a, b, c) => w.getBlock(a, b, c);
    if(G(x, y, z) !== B.AIR) return null;
    for(const a of ['x', 'z']){
      const dx = a === 'x' ? 1 : 0, dz = 1 - dx;
      let y0 = y;
      while(y0 > 1 && y - y0 < 21 && G(x, y0 - 1, z) === B.AIR) y0--;
      if(G(x, y0 - 1, z) !== B.OBSIDIAN) continue;
      let l = 0;
      while(l < 21 && G(x - dx*(l + 1), y0, z - dz*(l + 1)) === B.AIR) l++;
      const x0 = x - dx*l, z0 = z - dz*l;
      let bw = 0;
      while(bw < 22 && G(x0 + dx*bw, y0, z0 + dz*bw) === B.AIR) bw++;
      let h = 0;
      while(h < 22 && G(x0, y0 + h, z0) === B.AIR) h++;
      if(bw < 2 || bw > 21 || h < 3 || h > 21) continue;
      const q = { a, x: x0, y: y0, z: z0, w: bw, h };
      if(this.portalHeil(w, q)) return q;
    }
    return null;
  },
  /** steht der Rahmen noch, und ist innen alles frei? */
  portalHeil(w, q){
    const G = (a, b, c) => w.getBlock(a, b, c), dx = q.a === 'x' ? 1 : 0, dz = 1 - dx;
    for(let i = 0; i < q.w; i++){
      const x = q.x + dx*i, z = q.z + dz*i;
      if(G(x, q.y - 1, z) !== B.OBSIDIAN || G(x, q.y + q.h, z) !== B.OBSIDIAN) return false;
      for(let j = 0; j < q.h; j++) if(G(x, q.y + j, z) !== B.AIR) return false;
    }
    for(let j = 0; j < q.h; j++)
      if(G(q.x - dx, q.y + j, q.z - dz) !== B.OBSIDIAN || G(q.x + dx*q.w, q.y + j, q.z + dz*q.w) !== B.OBSIDIAN) return false;
    return true;
  },
  /** mit dem Feuerzeug in einen Obsidianrahmen: ein Portal */
  zuenden(t){
    if(!t) return;
    const w = this.world, fx = t.x + t.nx, fy = t.y + t.ny, fz = t.z + t.nz, q = this.dim === 'ende' ? null : this.portalRahmen(w, fx, fy, fz);   // im End gibt es kein Netherportal
    if(!q){
      // kein Rahmen: Feuer, wo darunter etwas Festes ist und die Zelle frei
      const da = w.getBlock(fx, fy, fz);
      if(fy < 1 || fy >= WH - 1 || !(da === B.AIR || (blocks[da] && blocks[da].replaceable && !isWasser(da) && da !== B.LAVA))) return;
      if(!blocksMovement(w.getBlock(fx, fy - 1, fz))) return;
      w.setBlock(fx, fy, fz, B.FEUER);
      Inv.damageHeld(1); this.player.swinging = true; this.player.swing = 0; HUD.refreshHotbar();
      Sfx.play('kolben_raus', fx + .5, fy + .5, fz + .5);
      return;
    }
    w.portale.set(q.x + ',' + q.y + ',' + q.z, q);
    Netz.portalNeu(q, this.dim);
    Inv.damageHeld(1); this.player.swinging = true; this.player.swing = 0;
    Sfx.play('kolben_raus', q.x + .5, q.y + 1, q.z + .5);
    hint('Das Portal leuchtet — stell dich hinein', 2400);
  },
  /** das Portal, in dem e gerade steht, oder null */
  imPortal(e){
    const x = Math.floor(e.x), y = Math.floor(e.y + 0.3), z = Math.floor(e.z);
    for(const q of this.world.portale.values()){
      const ix = q.a === 'x' ? x - q.x : z - q.z, quer = q.a === 'x' ? z === q.z : x === q.x;
      if(quer && ix >= 0 && ix < q.w && y >= q.y && y < q.y + q.h) return q;
    }
    return null;
  },
  /** jede Sekunde: kaputte Rahmen löschen ihr Portal */
  portalePruefen(){
    const w = this.world, jetzt = performance.now();
    for(const [k, q] of w.portale){
      // nur, wo das Gelände geladen ist — und ein frisch gemeldetes Portal erst, wenn auch seine Blöcke da sind
      if(q.neu && jetzt - q.neu < 4000) continue;
      const c = w.chunks.get(ckey(q.x >> 4, q.z >> 4));
      if(!c || c.state < 1) continue;
      if(!this.portalHeil(w, q)){ w.portale.delete(k); Sfx.play('kaputt', q.x + .5, q.y + 1, q.z + .5); }
    }
  },
  /** durchs Portal: in die andere Welt, dort zum nächsten Portal — oder eines bauen */
  portalReise(q){
    const p = this.player;
    const nach = this.dim === 'nether' ? 'oben' : 'nether', f = nach === 'nether' ? 1/8 : 8;
    const tx = Math.floor(p.x*f), tz = Math.floor(p.z*f);
    this.dimWechseln(nach);
    const w = this.world;
    for(let dz = -2; dz <= 2; dz++) for(let dx = -2; dx <= 2; dx++) w.ensureChunk((tx >> 4) + dx, (tz >> 4) + dz);
    let ziel = null, best = nach === 'nether' ? 24 : 128;
    for(const z of w.portale.values()){ const d = Math.hypot(z.x - tx, z.z - tz); if(d < best && this.portalHeil(w, z)){ best = d; ziel = z; } }
    if(!ziel) ziel = this.portalBauen(w, tx, tz, q.a);
    const dx = ziel.a === 'x' ? 1 : 0;
    p.x = ziel.x + (dx ? 1 : 0.5); p.z = ziel.z + (dx ? 0.5 : 1); p.y = ziel.y + 0.01;
    p.vx = p.vy = p.vz = 0; p.fallFrom = null; p.portalSperre = true; p.portalT = 0;
    Sfx.play('kolben_rein');
  },
  /** ein Portal in der Zielwelt bauen: auf festem Boden mit Platz, sonst
      mit einer Plattform aus Obsidian; Innenmaß 2 × 3 wie beim Vorbild */
  portalBauen(w, x, z, a){
    const dx = a === 'x' ? 1 : 0, dz = 1 - dx, G = (i, j, k) => w.getBlock(i, j, k);
    let y = -1;
    if(w.typ === 'nether'){
      for(let yy = NETHER_LAVA + 2; yy < WH - 8 && y < 0; yy++)
        if(blocksMovement(G(x, yy - 1, z)) && G(x, yy - 1, z) !== B.LAVA && [0, 1, 2, 3].every(j => G(x, yy + j, z) === B.AIR)) y = yy;
      if(y < 0) y = NETHER_LAVA + 8;
    } else y = Math.max(SEA + 1, w.heightAt(x, z) + 1);
    // Platz: drei tief, vier breit, fünf hoch; Boden aus Obsidian, Rahmen drumherum
    for(let i = -1; i <= 2; i++) for(let k = -1; k <= 1; k++){
      const bx = x + dx*i + dz*k, bz = z + dz*i + dx*k;
      for(let j = 0; j <= 3; j++) w.setBlock(bx, y + j, bz, B.AIR);
      w.setBlock(bx, y - 1, bz, B.OBSIDIAN);
    }
    for(let i = -1; i <= 2; i++){ w.setBlock(x + dx*i, y + 3, z + dz*i, B.OBSIDIAN); }
    for(let j = 0; j < 3; j++){ w.setBlock(x - dx, y + j, z - dz, B.OBSIDIAN); w.setBlock(x + dx*2, y + j, z + dz*2, B.OBSIDIAN); }
    const q = { a, x, y, z, w: 2, h: 3 };
    w.portale.set(x + ',' + y + ',' + z, q);
    Netz.portalNeu(q, dimVonWelt(w));
    return q;
  },

  /* ── Speichern / Laden ───────────────────────────────────────────── */
  /** gibt ein Versprechen zurück; sofort=true schreibt zusätzlich eine
      synchrone Notkopie — für den Moment, in dem die Seite verschwindet */
  /** was an einer Welt über den Startwert hinaus gespeichert wird —
      auch das, was ein Mitspieler beim Beitreten bekommt */
  weltTeil(w = this.oben || this.world){
    const mods = [];
    for(const [k, m] of w.mods){
      const arr = new Array(m.size*2); let i = 0;
      for(const [idx, id] of m){ arr[i++] = idx; arr[i++] = id; }
      mods.push([k, arr]);
    }
    return {
      mods, furn: [...w.furnaces],
      truhen: [...w.chests].map(([k, a]) => [k, a.map(s => s ? [s.id, s.n, s.dur] : null)]),
      felder: [...w.crops], portale: [...w.portale.values()].map(q => ({ a: q.a, x: q.x, y: q.y, z: q.z, w: q.w, h: q.h })),
    };
  },
  /** was weltTeil schrieb, in eine Welt zurück */
  weltLaden(w, t){
    for(const [k, arr] of (t.mods || [])){ const m = new Map(); for(let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i+1]); w.mods.set(k, m); }
    for(const [k, f] of (t.furn || [])) w.furnaces.set(k, f);
    const stapel = a => a ? { id:a[0], n:a[1], dur:a[2]|0 } : null;
    for(const [k, arr] of (t.truhen || [])) w.chests.set(k, arr.map(stapel));
    for(const [k, f] of (t.felder || [])) w.crops.set(k, f);
    for(const q of (t.portale || [])) w.portale.set(q.x + ',' + q.y + ',' + q.z, q);
  },
  save(sofort){
    // Als Gast gehört die Welt dem Host: der bekommt nur den eigenen Stand
    if(Netz.istGast){ Netz.standSenden(); return Promise.resolve(true); }
    if(!this.world || !this.meta || this.panoramaAktiv || this.meta.gast) return Promise.resolve(false);
    let text;
    try{
      const p = this.player;
      const data = Object.assign({
        seed: this.oben.seedStr, gen: this.oben.gen, typ: this.oben.typ, doerfer: this.oben.doerfer, obsidian: this.oben.obsidian, lava: 1,
        dim: this.dim, nether: this.nether ? this.weltTeil(this.nether) : undefined, ende: this.ende ? this.weltTeil(this.ende) : undefined,
        drache: this.ende ? this.ende.drache : undefined, time: this.time, zeit: this.gesamtZeit, wetter: Wetter.daten(),
        regeln: this.regeln, ops: [...this.ops],
        p: { x:p.x, y:p.y, z:p.z, yaw:p.yaw, pitch:p.pitch, health:p.health, food:p.food,
             saturation:p.saturation, air:p.air, creative:p.creative,
             spawnX:p.spawnX, spawnY:p.spawnY, spawnZ:p.spawnZ },
        inv: Inv.slots.map(s => s ? [s.id, s.n, s.dur] : null),
        gaeste: this.gaeste,
        ruest: Inv.ruestung.map(s => s ? [s.id, s.n, s.dur] : null),
        bekannt: [...Inv.bekannt],
        rest: Screens.raster.concat([Inv.cursor]).filter(Boolean).map(s => [s.id, s.n, s.dur]),
        tiere: (this.dim === 'oben' ? this.mobs : ((this._dimRest.oben || {}).mobs || [])).filter(m => m.bleibt && !m.dead && !m.def.hostile).map(m =>
          [m.type, +m.x.toFixed(2), +m.y.toFixed(2), +m.z.toFixed(2), +m.yaw.toFixed(2), m.health, Math.round(m.kind), Math.round(m.pause),
           m.type === 'villager' ? m.beruf | 0 : m.wolle || 0, m.geschoren ? 1 : 0])
      }, this.weltTeil());
      text = JSON.stringify(data);
    }catch(e){ return Promise.resolve(false); }
    const m = this.meta;
    m.gespielt = Date.now();
    m.groesse = text.length;
    m.tag = Math.floor(this.gesamtZeit / DAY_LEN) + 1;
    m.modus = this.player.creative ? 'kreativ' : 'ueberleben';
    if(!sofort){ const bild = this.bildJetzt(); if(bild) m.bild = bild; }
    this.lastSave = performance.now();
    if(sofort) Speicher.notfall(m, text);
    return Speicher.sichern(m, text).then(() => true, e => {
      hint('Speichern fehlgeschlagen' + (e && e.name === 'QuotaExceededError' ? ': der Speicher ist voll' : ''), 3000);
      return false;
    });
  },
  saveOpts(){ try{ localStorage.setItem(OPT_KEY, JSON.stringify(this.settings)); }catch(e){} },
  loadOpts(){ try{ const r = localStorage.getItem(OPT_KEY); if(r) Object.assign(this.settings, JSON.parse(r)); }catch(e){} },

  /* ── Chunk-Streaming ─────────────────────────────────────────────── */
  streamChunks(budgetMs){
    const w = this.world, p = this.player;
    const pcx = Math.floor(p.x/CS), pcz = Math.floor(p.z/CS);
    const rd = this.sicht();
    const t0 = performance.now();

    // Entladen
    if((this.tick & 31) === 0){
      for(const [k, m] of this.meshes){
        const c = w.chunks.get(k);
        if(!c) { R.freeMesh(m.o); R.freeMesh(m.w); this.meshes.delete(k); continue; }
        if((Math.abs(c.cx-pcx) > rd+2 || Math.abs(c.cz-pcz) > rd+2) && !Netz.chunkGebraucht(c.cx, c.cz)){
          R.freeMesh(m.o); R.freeMesh(m.w); this.meshes.delete(k);
          w.chunks.delete(k);
        }
      }
    }

    // Änderungen zuerst
    let done = 0;
    for(const k of w.dirty){
      if(performance.now()-t0 > budgetMs) return;
      w.dirty.delete(k);
      const c = w.chunks.get(k);
      if(!c || c.state < 1) continue;
      // Chunks, die hier (noch) nicht zu sehen sind — etwa neben einem
      // Mitspieler —, brauchen nur frisches Licht; ihr Gitter entsteht, wenn
      // sie in Sichtweite kommen
      if(!this.meshes.has(k)){ if(w.relight.has(k)){ w.relight.delete(k); if(c.state >= 2) w.computeLight(c); } continue; }
      if(w.relight.has(k)){ w.relight.delete(k); w.computeLight(c); }
      this.meshChunk(c);
      done++;
    }
    w.relight.clear();

    // Neue Chunks, von nah nach fern
    let best = null, bestD = 1e9;
    for(let ring=0; ring<=rd; ring++){
      for(let dz=-ring; dz<=ring; dz++) for(let dx=-ring; dx<=ring; dx++){
        if(Math.max(Math.abs(dx),Math.abs(dz)) !== ring) continue;
        const cx = pcx+dx, cz = pcz+dz, k = ckey(cx,cz);
        if(this.meshes.has(k)) continue;
        const c = w.chunks.get(k);
        if(c && c.state >= 3) continue;
        const d = dx*dx + dz*dz;
        if(d < bestD){ bestD = d; best = [cx,cz,k]; }
      }
      if(best) break;
    }
    while(best && performance.now()-t0 < budgetMs){
      const c = w.ensureChunk(best[0], best[1]);
      this.meshChunk(c);
      this.loadDone++;
      best = null; bestD = 1e9;
      for(let ring=0; ring<=rd && !best; ring++){
        for(let dz=-ring; dz<=ring; dz++) for(let dx=-ring; dx<=ring; dx++){
          if(Math.max(Math.abs(dx),Math.abs(dz)) !== ring) continue;
          const cx = pcx+dx, cz = pcz+dz, k = ckey(cx,cz);
          if(this.meshes.has(k)) continue;
          const ch = w.chunks.get(k); if(ch && ch.state >= 3) continue;
          const d = dx*dx+dz*dz; if(d < bestD){ bestD = d; best = [cx,cz,k]; }
        }
      }
    }
    if(this.loading && this.loadDone >= this.loadTarget) this.loading = false;
  },
  meshChunk(c){
    const w = this.world;
    w.buildMesh(c, this.bufA, this.bufB);
    const k = ckey(c.cx,c.cz);
    let m = this.meshes.get(k);
    if(!m){ m = { o:null, w:null, cx:c.cx, cz:c.cz }; this.meshes.set(k, m); }
    m.o = R.uploadChunk(m.o, this.bufA);
    m.w = R.uploadChunk(m.w, this.bufB);
    c.state = 3;
  },

  /* ── Gegenstände in der Welt ─────────────────────────────────────── */
  /** Etwas fällt in die Welt. wurf: [vx, vy, vz, Sperre in Sekunden] für
      Geworfenes. Liegende Gegenstände gehören dem Host: als Gast wird nur
      gefragt, er legt es hin — so sehen es alle und jeder kann es aufheben. */
  dropItem(id, n, x, y, z, dur, wurf){
    if(!id || n <= 0) return null;
    if(Netz.istGast){ Netz.dropAnfrage(id, n, x, y, z, dur, wurf); return null; }
    if(this.drops.length > 90) this.drops.shift();
    const d = new Drop(id, n, x, y, z);
    if(dur) d.dur = dur;
    if(wurf){ d.vx = wurf[0]; d.vy = wurf[1]; d.vz = wurf[2]; d.pickDelay = wurf[3]; }
    this.drops.push(d);
    return d;
  },
  /** was ein abgebauter Block fallen lässt: Liste aus [id, anzahl] */
  dropsFor(blockId, tierOk){
    const b = blocks[blockId];
    if(!b) return null;
    if(b.tool === 'pickaxe' && !tierOk) return null;
    if(blockId === B.GLASS) return null;
    if(blockId === B.REDSTONE_ERZ) return [[ITEM.redstone, 4 + (Math.random() < .5 ? 1 : 0)]];
    if(blockId === B.LEAVES) return Math.random() < 0.06 ? [[ITEM.apple,1]] : (Math.random() < 0.05 ? [[B.LEAVES,1]] : null);
    if(blockId === B.FICHTENNADELN) return Math.random() < 0.05 ? [[B.FICHTENNADELN,1]] : null;
    if(blockId === B.TALLGRASS) return Math.random() < 0.14 ? [[ITEM.seeds,1]] : null;
    if(blockId === B.GRAVEL && Math.random() < 0.12) return [[ITEM.flint,1]];
    if(isWheat(blockId)) return b.stufe === 3 ? [[ITEM.wheat,1],[ITEM.seeds,1 + (Math.random()*3|0)]] : [[ITEM.seeds,1]];
    if(b.drop === null || b.drop === undefined) return [[blockId, 1]];
    if(b.drop === B.AIR) return null;
    if(typeof b.drop === 'string') return [[ITEM[b.drop.replace(/^i_/, '')] || ITEM[b.drop], 1]];
    return [[b.drop, 1]];
  },

  /* ── Abbauen ─────────────────────────────────────────────────────── */
  targetBlock(){
    if(this.bett) return null;                        // im Bett baut man nicht
    const p = this.player, f = p.forward();
    const r = this.world.raycast(p.x, p.eyeY(), p.z, f[0], f[1], f[2], p.creative ? 7 : 5, false);
    return r.hit ? r : null;
  },
  breakSpeed(id){
    const b = blocks[id];
    // Kreativ baut man wie beim Vorbild auch Grundgestein und Endportalrahmen ab — nur nicht das Portal
    if(b && this.player.creative && id !== B.AIR && id !== B.LAVA && id !== B.ENDPORTAL) return { time: 0.04, tierOk: true };
    if(!b || b.hardness < 0) return { time: 0, tierOk: false };   // unzerstörbar
    const s = Inv.held();
    const it = s ? items[s.id] : null;
    const needsTier = !!(b.tool && b.tier > 0);
    const right = !!(b.tool && it && it.tool === b.tool);
    const tierOk = !needsTier || (right && it.tier >= b.tier);
    let t = tierOk ? b.hardness * 1.5 / (right ? it.speed : 1) : b.hardness * 5;
    if(this.player.creative) t = 0.02;
    return { time: Math.max(0.04, t), tierOk };
  },
  finishBreak(x,y,z,id){
    const info = this.breakSpeed(id);
    if(!this.player.creative){ Inv.damageHeld(1); this.player.addExhaustion(0.02); }
    this.entfernen(x, y, z, info.tierOk);
    Sfx.block('weg', id, x, y, z);
    this.camShake = 0.05;
  },
  /** Block weg, mit allem, was daran hängt: Inhalt, zweite Türhälfte, Pflanzen, Leitern */
  entfernen(x, y, z, tierOk){
    const w = this.world, id = w.getBlock(x,y,z), k = x+','+y+','+z;
    if(id === B.AIR) return;
    if(!this.player.creative){
      const d = this.dropsFor(id, tierOk);
      if(d) for(const [i, n] of d) this.dropItem(i, n, x+0.5, y+0.4, z+0.5);
    }
    const inhalt = [];
    if(id === B.FURNACE || id === B.FURNACE_LIT){
      const f = w.furnaces.get(k);
      if(f){ inhalt.push(f.in, f.fuel, f.out); w.furnaces.delete(k); }
    }
    if(id === B.CHEST){ const t = w.chests.get(k); if(t) inhalt.push(...t); w.chests.delete(k); }
    if(id === B.JUKEBOX_VOLL) inhalt.push(Inv.make(ITEM.platte, 1));
    for(const st of inhalt) if(st) this.dropItem(st.id, st.n, x+.5, y+.5, z+.5, st.dur);
    if(isWheat(id)) w.crops.delete(k);
    w.setBlock(x,y,z,B.AIR);
    if(isDoor(id)){
      const oy = doorInfo(id).oben ? y-1 : y+1;
      if(isDoor(w.getBlock(x,oy,z))) w.setBlock(x,oy,z,B.AIR);
    }
    // Bett: das andere Teil geht mit; wer das Kopfteil abbaut, bekommt das Bett aus dem Fußteil
    if(isBett(id)){
      const k2 = bettPartner((a, b, c) => w.getBlock(a, b, c), x, y, z, id);
      if(k2 >= 0){
        const fx = x + SEITE[k2][0], fz = z + SEITE[k2][1];
        if(id === B.BETTKOPF) this.entfernen(fx, y, fz, tierOk);
        else if(w.getBlock(fx, y, fz) === B.BETTKOPF) w.setBlock(fx, y, fz, B.AIR);
      }
    }
    // Kolben: Kopf und Fuß gehören zusammen — wer den Kopf abbaut, bekommt den Kolben
    if(isKopf(id)){
      const [dx, dy, dz] = RICHTUNG6[kopfRichtung(id)];
      if(isKolben(w.getBlock(x - dx, y - dy, z - dz))) this.entfernen(x - dx, y - dy, z - dz, tierOk);
    } else if(isKolben(id) && kolbenAus(id)){
      const [dx, dy, dz] = RICHTUNG6[kolbenRichtung(id)];
      if(isKopf(w.getBlock(x + dx, y + dy, z + dz))) w.setBlock(x + dx, y + dy, z + dz, B.AIR);
    }
    this.stuetzePruefen(x, y, z);
  },
  /** Was nicht mehr gestützt wird, fällt ab */
  stuetzePruefen(x, y, z){
    const w = this.world;
    const oben = w.getBlock(x, y+1, z), bo = blocks[oben];
    if(bo && (bo.model === 'cross' || bo.model === 'torch' || oben === B.CACTUS || oben === B.SCHNEEDECKE || (isDoor(oben) && !doorInfo(oben).oben)
      || (rsHaengt(oben) && rsAnbau(oben) <= 0)))
      this.entfernen(x, y+1, z, true);
    for(let sIdx = 0; sIdx < 4; sIdx++){
      const lx = x - SEITE[sIdx][0], lz = z - SEITE[sIdx][1], n = w.getBlock(lx, y, lz);
      // Leitern und Redstone-Teile, die an diesem Block hingen
      if(n === ladderId(sIdx) || n === fackelWand(sIdx) || (rsHaengt(n) && rsAnbau(n) === sIdx + 1)) this.entfernen(lx, y, lz, true);
    }
  },
  /** steht jemand dort, wo der Block seinen Kollisionskasten hätte? */
  belegt(bx, by, bz, id){
    const o = id*6;
    const x0 = bx + COLL[o], y0 = by + COLL[o+1], z0 = bz + COLL[o+2], x1 = bx + COLL[o+3], y1 = by + COLL[o+4], z1 = bz + COLL[o+5];
    const trifft = e => { const hw = e.w/2; return x1 > e.x-hw && x0 < e.x+hw && z1 > e.z-hw && z0 < e.z+hw && y1 > e.y && y0 < e.y+e.h; };
    if(trifft(this.player) || this.mobs.some(trifft)) return true;
    for(const s of Netz.andere.values()) if(!s.tot && Netz.hier(s) && trifft(s)) return true;
    return false;
  },

  /* ── Setzen / Benutzen ───────────────────────────────────────────── */
  useAt(t){
    const w = this.world, p = this.player;
    if(!t){
      // ins Leere: ein Ei fliegt trotzdem, und Wasser schöpft man auch, wenn dahinter nichts in Reichweite ist
      const h = Inv.held();
      if(h && istWurf(h.id)) this.eiWerfen();
      else if(h && h.id === ITEM.enderauge) this.augeWerfen();
      else if(h && h.id === ITEM.bucket) this.schoepfen();
      return;
    }
    const id = w.getBlock(t.x,t.y,t.z), k = t.x+','+t.y+','+t.z;
    const s = Inv.held(), it = s ? items[s.id] : null;
    if(s && s.id === ITEM.feuerzeug){ this.zuenden(t); return; }
    // Enderauge: in einen Rahmen setzen — sonst werfen, es zeigt den Weg zur Endfestung
    if(s && s.id === ITEM.enderauge){ if(id === B.ENDRAHMEN) this.augeEinsetzen(t.x, t.y, t.z); else this.augeWerfen(); return; }
    // Benutzbare Blöcke — geduckt baut man stattdessen daran
    if(!Input.sneak){
      if(id === B.TABLE){ Screens.oeffne('werkbank'); Sfx.block('hacken', B.TABLE, t.x, t.y, t.z, .6); return; }
      if(id === B.KUERBIS && s && s.id === ITEM.shears){
        // geschnitzt wird die Seite, auf die man zielt — von oben die, die zum Spieler schaut
        let r = SEITE.findIndex(([sx, sz]) => sx === t.nx && sz === t.nz);
        if(r < 0){ const f = p.forward(); r = Math.abs(f[0]) > Math.abs(f[2]) ? (f[0] > 0 ? 1 : 0) : (f[2] > 0 ? 3 : 2); }
        w.setBlock(t.x, t.y, t.z, B.GESCHNITZT + r);
        if(!p.creative) Inv.damageHeld(1);
        Sfx.play('schere', t.x + .5, t.y + .5, t.z + .5); p.swinging = true; p.swing = 0; HUD.refreshHotbar();
        return;
      }
      if(id === B.FURNACE || id === B.FURNACE_LIT){
        if(!w.furnaces.has(k)) w.furnaces.set(k, { in:null, fuel:null, out:null, burn:0, burnMax:0, cook:0, x:t.x, y:t.y, z:t.z });
        Screens.oeffne('ofen', k); return;
      }
      if(id === B.CHEST){
        if(!w.chests.has(k)) w.chests.set(k, new Array(27).fill(null));
        Screens.oeffne('truhe', k); Sfx.play('truhe_auf', t.x + .5, t.y + .5, t.z + .5); return;
      }
      if(isDoor(id)){ this.tuerSchalten(t.x, t.y, t.z); return; }
      // Hebel umlegen, Knopf drücken (springt nach einer Sekunde von selbst heraus)
      if(isHebel(id)){
        const an = !rsAn(id);
        w.setBlock(t.x, t.y, t.z, hebelId(an, rsAnbau(id)));
        Sfx.play(an ? 'rs_an' : 'rs_aus', t.x + .5, t.y + .5, t.z + .5);
        p.swinging = true; p.swing = 0;
        return;
      }
      if(isKnopf(id)){
        if(!rsAn(id)){ w.setBlock(t.x, t.y, t.z, knopfId(true, rsAnbau(id))); Sfx.play('rs_an', t.x + .5, t.y + .5, t.z + .5); }
        p.swinging = true; p.swing = 0;
        return;
      }
      // Verstärker: jeder Klick eine Zehntelsekunde länger, nach vier wieder eine
      if(isVerstaerker(id)){
        w.setBlock(t.x, t.y, t.z, verstaerkerId(rsAn(id), vStufe(id) % 4 + 1, vRichtung(id)));
        Sfx.play('rs_an', t.x + .5, t.y + .5, t.z + .5);
        p.swinging = true; p.swing = 0;
        return;
      }
      if(isBett(id)){ this.schlafen(t.x, t.y, t.z); return; }
      // Plattenspieler: Schallplatte einlegen — oder die, die drin ist, herausholen
      if(id === B.JUKEBOX_VOLL){
        w.setBlock(t.x, t.y, t.z, B.JUKEBOX);
        this.dropItem(ITEM.platte, 1, t.x + .5, t.y + 1.05, t.z + .5);
        return;
      }
      if(id === B.JUKEBOX && s && s.id === ITEM.platte){
        w.setBlock(t.x, t.y, t.z, B.JUKEBOX_VOLL);
        if(!p.creative) Inv.consumeHeld();
        hint('Die Schallplatte läuft', 1600);
        p.swinging = true; p.swing = 0; HUD.refreshHotbar();
        return;
      }
    }
    if(!s) return;
    if(it && it.food){ this.eat(); return; }
    if(istWurf(s.id)){ this.eiWerfen(); return; }
    const schwing = () => { p.swinging = true; p.swing = 0; HUD.refreshHotbar(); };
    // Knochenmehl: Weizen wächst sofort ein, zwei Stufen, auf Gras sprießt es
    if(s.id === ITEM.bone_meal){
      if(isWheat(id) && id < B.WHEAT + 3){
        w.setBlock(t.x, t.y, t.z, Math.min(B.WHEAT + 3, id + 1 + (Math.random() < .5 ? 1 : 0)));
      } else if(id === B.GRASS && t.ny === 1){
        for(let i = 0; i < 12; i++){
          const x = t.x + ((Math.random()*5)|0) - 2, z = t.z + ((Math.random()*5)|0) - 2, y = w.heightAt(x, z);
          if(w.getBlock(x, y, z) === B.GRASS && w.getBlock(x, y+1, z) === B.AIR)
            w.setBlock(x, y+1, z, Math.random() < .8 ? B.TALLGRASS : [B.ROSE, B.DANDELION, B.KORNBLUME][(Math.random()*3) | 0]);
        }
      } else return;
      if(!p.creative) Inv.consumeHeld();
      Sfx.block('setzen', B.TALLGRASS, t.x, t.y, t.z); schwing();
      return;
    }
    // Hacke: aus Erde wird Acker
    if(it && it.tool === 'hoe'){
      if((id === B.GRASS || id === B.DIRT) && t.ny === 1){
        const ob = w.getBlock(t.x,t.y+1,t.z);
        if(ob !== B.AIR && !(blocks[ob] && blocks[ob].replaceable)) return;
        if(ob !== B.AIR) w.setBlock(t.x,t.y+1,t.z,B.AIR);
        w.setBlock(t.x,t.y,t.z,B.FARMLAND);
        Sfx.block('hacken', B.DIRT, t.x, t.y, t.z); if(!p.creative) Inv.damageHeld(1); schwing();
      }
      return;
    }
    // Säen
    if(s.id === ITEM.seeds){
      if(id === B.FARMLAND && t.ny === 1 && w.getBlock(t.x,t.y+1,t.z) === B.AIR){
        w.setBlock(t.x,t.y+1,t.z,B.WHEAT);
        w.crops.set(t.x+','+(t.y+1)+','+t.z, { t:0 });
        if(!p.creative) Inv.consumeHeld();
        Sfx.block('setzen', B.WHEAT, t.x, t.y + 1, t.z); schwing();
      } else hint('Weizenkörner brauchen Ackerboden — den macht eine Hacke aus Erde');
      return;
    }
    // Eimer schöpfen und ausgießen
    if(s.id === ITEM.bucket){ this.schoepfen(); return; }
    if(s.id === ITEM.water_bucket){
      const bx = t.x + t.nx, by = t.y + t.ny, bz = t.z + t.nz, cur = w.getBlock(bx,by,bz);
      if(cur !== B.AIR && !(blocks[cur] && blocks[cur].replaceable)) return;
      w.setBlock(bx, by, bz, B.WATER);
      if(!p.creative) Inv.slots[Inv.sel] = Inv.make(ITEM.bucket, 1);
      Sfx.play('platsch', bx + .5, by + .5, bz + .5); schwing();
      return;
    }
    // Redstone: auf festen Boden gestreut wird eine Leitung daraus
    if(s.id === ITEM.redstone){
      let bx = t.x + t.nx, by = t.y + t.ny, bz = t.z + t.nz;
      if(blocks[id] && blocks[id].replaceable && !isWasser(id)){ bx = t.x; by = t.y; bz = t.z; }
      const cur = w.getBlock(bx, by, bz);
      if(cur !== B.AIR && !(blocks[cur] && blocks[cur].replaceable)) return;
      if(!isOpaqueCube(w.getBlock(bx, by - 1, bz))){ hint('Redstone braucht festen Boden'); return; }
      if(w.setBlock(bx, by, bz, staubId(0))){
        if(!p.creative) Inv.consumeHeld();
        Sfx.block('setzen', staubId(0), bx, by, bz); schwing();
      }
      return;
    }
    if(!isBlockId(s.id)) return;
    const bd = blocks[s.id];
    if(!bd || !bd.item) return;
    let bx = t.x + t.nx, by = t.y + t.ny, bz = t.z + t.nz;
    // Gras und Blumen werden einfach ersetzt, wenn man sie selbst anklickt
    if(blocks[id] && blocks[id].replaceable && !isWasser(id)){ bx = t.x; by = t.y; bz = t.z; }
    // Stufe auf die offene Seite einer Stufe derselben Art: ein ganzer Block
    if(isStufe(s.id)){
      const art = stufeArt(s.id), n = w.getBlock(bx, by, bz);
      const ziel = isStufe(id) && stufeArt(id) === art && t.ny === (stufeOben(id) ? -1 : 1) ? [t.x, t.y, t.z]
        : isStufe(n) && stufeArt(n) === art ? [bx, by, bz] : null;
      if(ziel){
        const voll = STUFEN[art].stoff;
        if(this.belegt(ziel[0], ziel[1], ziel[2], voll)) return;
        w.setBlock(ziel[0], ziel[1], ziel[2], voll);
        if(!p.creative) Inv.consumeHeld();
        Sfx.block('setzen', voll, ziel[0], ziel[1], ziel[2]); schwing();
        return;
      }
    }
    const cur = w.getBlock(bx,by,bz);
    if(cur !== B.AIR && !(blocks[cur] && blocks[cur].replaceable)) return;
    let setzId = s.id;
    if(s.id === B.LADDER){
      if(t.ny !== 0 || !isOpaqueCube(id)){ hint('Leitern gehören an eine Wand'); return; }
      setzId = ladderId(SEITE.findIndex(([a, b]) => a === -t.nx && b === -t.nz));
    }
    // Redstonefackel, Hebel, Knopf: auf den Boden oder an die Wand, je nachdem, wohin man zielt
    if(s.id === B.RS_FACKEL || s.id === B.HEBEL || s.id === B.KNOPF){
      let a = 0;
      if(t.ny === 0 && isOpaqueCube(id) && bx === t.x + t.nx && bz === t.z + t.nz && by === t.y)
        a = 1 + SEITE.findIndex(([sx, sz]) => sx === -t.nx && sz === -t.nz);
      else if(!blocksMovement(w.getBlock(bx, by - 1, bz))){ hint(nameOf(s.id) + ' gehört auf festen Boden oder an eine Wand'); return; }
      setzId = s.id === B.RS_FACKEL ? rsFackel(true, a) : s.id === B.HEBEL ? hebelId(false, a) : knopfId(false, a);
    }
    // Fackel: an die Wand, wenn man auf die Seite eines Blocks zielt — sonst auf den Boden
    if(s.id === B.TORCH && t.ny === 0 && isOpaqueCube(id) && bx === t.x + t.nx && bz === t.z + t.nz && by === t.y)
      setzId = fackelWand(SEITE.findIndex(([sx, sz]) => sx === -t.nx && sz === -t.nz));
    if(s.id === B.DRUCKPLATTE && !blocksMovement(w.getBlock(bx, by - 1, bz))){ hint('Eine Druckplatte braucht festen Boden'); return; }
    // Treppen steigen vom Spieler weg an; an einer Decke oder der oberen Hälfte
    // einer Wand gesetzt, hängen sie umgedreht — wie beim Vorbild
    if(isTreppe(s.id)){
      const f = p.forward();
      const r = Math.abs(f[0]) > Math.abs(f[2]) ? (f[0] > 0 ? 0 : 1) : (f[2] > 0 ? 2 : 3);
      const hy = p.eyeY() + f[1]*t.t;
      setzId = treppeId(treppeArt(s.id), r, t.ny < 0 || (t.ny === 0 && hy - Math.floor(hy) > 0.5));
    }
    // geschnitzter Kürbis: das Gesicht schaut zum Spieler
    if(isGeschnitzt(s.id)){
      const f = p.forward();
      setzId = B.GESCHNITZT + (Math.abs(f[0]) > Math.abs(f[2]) ? (f[0] > 0 ? 1 : 0) : (f[2] > 0 ? 3 : 2));
    }
    // Stufen: an eine Decke oder die obere Hälfte einer Wand gesetzt, sitzen sie oben
    if(isStufe(s.id)){
      const hy = p.eyeY() + p.forward()[1]*t.t;
      setzId = stufeId(stufeArt(s.id), t.ny < 0 || (t.ny === 0 && hy - Math.floor(hy) > 0.5));
    }
    // Verstärker: der Ausgang zeigt vom Spieler weg
    if(s.id === B.VERSTAERKER){
      if(!blocksMovement(w.getBlock(bx, by - 1, bz))){ hint('Ein Verstärker braucht festen Boden'); return; }
      const f = p.forward();
      setzId = verstaerkerId(false, 1, Math.abs(f[0]) > Math.abs(f[2]) ? (f[0] > 0 ? 0 : 1) : (f[2] > 0 ? 2 : 3));
    }
    // Kolben: die Vorderseite schaut zum Spieler, auch nach oben oder unten
    if(s.id === B.KOLBEN || s.id === B.KLEBKOLBEN){
      const f = p.forward(), ax = Math.abs(f[0]), ay = Math.abs(f[1]), az = Math.abs(f[2]);
      setzId = kolbenId(s.id === B.KLEBKOLBEN, false, ay > ax && ay > az ? (f[1] > 0 ? 1 : 0) : ax > az ? (f[0] > 0 ? 3 : 2) : (f[2] > 0 ? 5 : 4));
    }
    if(s.id === B.DOOR){
      if(!blocksMovement(w.getBlock(bx,by-1,bz))){ hint('Eine Tür braucht festen Boden'); return; }
      const ob = w.getBlock(bx,by+1,bz);
      if(ob !== B.AIR && !(blocks[ob] && blocks[ob].replaceable)){ hint('Eine Tür ist zwei Blöcke hoch'); return; }
      // Blatt auf der Seite, von der man kommt — oder gegenüber, wenn man dort steht
      const dx = p.x - (bx+.5), dz = p.z - (bz+.5);
      const nah = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : (dz > 0 ? 2 : 3);
      const fern = nah ^ 1;
      const seite = [nah, fern].find(q => !this.belegt(bx,by,bz,doorId(0,0,q)) && !this.belegt(bx,by+1,bz,doorId(1,0,q)));
      if(seite === undefined){ hint('Geh erst aus dem Weg'); return; }
      w.setBlock(bx,by,bz,doorId(0,0,seite)); w.setBlock(bx,by+1,bz,doorId(1,0,seite));
      if(!p.creative) Inv.consumeHeld();
      Sfx.block('setzen', B.DOOR, bx, by, bz); schwing();
      return;
    }
    // Bett: wie beim Vorbild zwei Blöcke in Blickrichtung — hier das Fußteil (mit der Farbe), dahinter das Kopfteil
    if(isBett(s.id)){
      const f = p.forward(), quer = Math.abs(f[0]) > Math.abs(f[2]);
      const hx = bx + (quer ? Math.sign(f[0]) : 0), hz = bz + (quer ? 0 : (Math.sign(f[2]) || 1));
      const hb = w.getBlock(hx, by, hz);
      if(hb !== B.AIR && !(blocks[hb] && blocks[hb].replaceable)){ hint('Ein Bett ist zwei Blöcke lang — dahinter ist kein Platz'); return; }
      if(!blocksMovement(w.getBlock(bx, by-1, bz)) || !blocksMovement(w.getBlock(hx, by-1, hz))) return;
      if(this.belegt(bx, by, bz, s.id) || this.belegt(hx, by, hz, B.BETTKOPF)) return;
      if(w.setBlock(bx, by, bz, s.id)){
        w.setBlock(hx, by, hz, B.BETTKOPF);
        if(!p.creative) Inv.consumeHeld();
        Sfx.block('setzen', s.id, bx, by, bz); schwing();
      }
      return;
    }
    // Pflanzen, Fackeln und Betten brauchen Boden
    if((bd.model === 'cross' || setzId === B.TORCH || isBett(s.id) || s.id === B.SCHNEEDECKE) && !blocksMovement(w.getBlock(bx,by-1,bz))) return;
    if(bd.solid && this.belegt(bx,by,bz,setzId)) return;
    if(w.setBlock(bx,by,bz,setzId)){
      if(!p.creative) Inv.consumeHeld();
      const k2 = bx+','+by+','+bz;
      if(s.id === B.FURNACE) w.furnaces.set(k2, { in:null, fuel:null, out:null, burn:0, burnMax:0, cook:0, x:bx, y:by, z:bz });
      if(s.id === B.CHEST) w.chests.set(k2, new Array(27).fill(null));
      // Acker unter einem festen Block wird wieder Erde
      if(bd.solid && w.getBlock(bx,by-1,bz) === B.FARMLAND) w.setBlock(bx,by-1,bz,B.DIRT);
      Sfx.block('setzen', setzId, bx, by, bz); schwing();
    }
  },
  /** Eimer: eine Quelle schöpfen — fließendes Wasser rinnt durch */
  schoepfen(){
    const w = this.world, p = this.player, f = p.forward();
    const r = w.raycast(p.x, p.eyeY(), p.z, f[0], f[1], f[2], 5, 'quelle');
    if(!r.hit || r.id !== B.WATER) return false;
    w.setBlock(r.x, r.y, r.z, B.AIR);
    if(!p.creative){ Inv.consumeHeld(); const rest = Inv.add(ITEM.water_bucket, 1); if(rest) this.dropItem(ITEM.water_bucket, 1, p.x, p.y+1, p.z); }
    Sfx.play('platsch', r.x + .5, r.y + .5, r.z + .5);
    p.swinging = true; p.swing = 0; HUD.refreshHotbar();
    return true;
  },
  tuerSchalten(x, y, z){
    const di = doorInfo(this.world.getBlock(x,y,z));
    if(!this.tuerStellen(x, di.oben ? y-1 : y, z, !di.offen)) hint('Geh erst aus der Tür');
  },
  /** Tür (untere Hälfte bei y0) auf oder zu — nicht, solange jemand im Weg steht */
  tuerStellen(x, y0, z, offen){
    const w = this.world, di = doorInfo(w.getBlock(x,y0,z));
    if(di.offen === offen) return true;
    const neuSeite = di.offen ? DOOR_AUF.indexOf(di.seite) : DOOR_AUF[di.seite];
    const unten = doorId(0, offen, neuSeite), oben = doorId(1, offen, neuSeite);
    if(this.belegt(x,y0,z,unten) || this.belegt(x,y0+1,z,oben)) return false;
    w.setBlock(x,y0,z,unten);
    if(isDoor(w.getBlock(x,y0+1,z))) w.setBlock(x,y0+1,z,oben);
    Sfx.play(offen ? 'tuer_auf' : 'tuer_zu', x + .5, y0 + 1, z + .5);
    return true;
  },
  /** Ins Bett: nachts, ohne Monster in der Nähe, und nur, wenn dort noch
      niemand liegt. Die Nacht vergeht erst, wenn alle Spieler im Bett
      liegen (schlafPruefen); bis dahin kann man wieder aufstehen. */
  schlafen(x, y, z){
    const p = this.player;
    if(this.dim !== 'oben'){ hint(this.dim === 'ende' ? 'Im End kann man nicht schlafen' : 'Im Nether kann man nicht schlafen', 2400); return; }
    // im zweiteiligen Bett liegt man im Kopfteil
    const bid = this.world.getBlock(x, y, z);
    if(bid !== B.BETTKOPF){
      const k = bettPartner((a, b, c) => this.world.getBlock(a, b, c), x, y, z, bid);
      if(k >= 0){ x += SEITE[k][0]; z += SEITE[k][1]; }
    }
    p.spawnX = x + 0.5; p.spawnY = y + 0.6; p.spawnZ = z + 0.5;
    if(this.bett) return;
    if(!this.istNacht()){ hint('Schlafen geht nur nachts — dein Startpunkt ist jetzt hier', 2600); return; }
    if(this.mobs.some(m => m.def.hostile && Math.hypot(m.x - x, m.z - z) < 10 && Math.abs(m.y - y) < 5)){
      hint('Du kannst nicht schlafen, Monster sind in der Nähe', 2400); return;
    }
    for(const s of Netz.andere.values())
      if(Netz.hier(s) && (s.flags & 16) && Math.floor(s.zx) === x && Math.floor(s.zy) === y && Math.floor(s.zz) === z){ hint('In diesem Bett liegt schon ' + s.name, 2400); return; }
    this.bett = { x, y, z, vorher: [p.x, p.y, p.z, p.flying], hp: p.health };
    p.liegt = true; p.flying = false; p.sneaking = false; p.pitch = 0.45;
    p.x = x + 0.5; p.y = y + BETT_HOEHE; p.z = z + 0.5; p.vx = p.vy = p.vz = 0;
    const [n, alle] = this.schlaefer();
    hint(alle > 1 ? 'Gute Nacht · ' + n + ' von ' + alle + ' liegen im Bett' : 'Gute Nacht …', 2000);
  },
  /** Raus aus dem Bett, dorthin, wo man vorher stand (wenn es dort noch frei ist) */
  aufstehen(grund){
    const b = this.bett, p = this.player, w = this.world;
    if(!b) return;
    this.bett = null; p.liegt = false;
    const [vx, vy, vz, flog] = b.vorher;
    const frei = y => !blocksMovement(w.getBlock(Math.floor(vx), Math.floor(y), Math.floor(vz)));
    if(frei(vy) && frei(vy + 1)){ p.x = vx; p.y = vy; p.z = vz; } else p.y = b.y + BETT_HOEHE;
    p.flying = !!flog && p.creative; p.vx = p.vy = p.vz = 0; p.fallFrom = null;
    if(grund) hint(grund, 2200);
  },
  /** Im Bett: liegen bleiben, bis man sich bewegt, das Bett weg ist, einen
      etwas trifft oder es hell wird */
  imBett(input){
    const p = this.player, b = this.bett;
    p.x = b.x + 0.5; p.y = b.y + BETT_HOEHE; p.z = b.z + 0.5; p.vx = p.vy = p.vz = 0; p.fallFrom = null;
    if(this.schlafT > 0) return;                             // gleich ist Morgen
    if(input.mx || input.mz || input.jump || input.sneak) this.aufstehen();
    else if(!isBett(this.world.getBlock(b.x, b.y, b.z))) this.aufstehen('Dein Bett ist weg');
    else if(p.health < b.hp) this.aufstehen('Aua — du bist aufgewacht');
    else if(!this.istNacht()) this.aufstehen('Es ist schon hell');
    b.hp = p.health;
  },
  istNacht(){ return Math.sin(this.sunAngle()) <= 0.06; },
  /** [wie viele im Bett liegen, wie viele mitspielen] — wer gerade tot ist, zählt nicht */
  schlaefer(){
    // geschlafen wird oben; wer im Nether ist, zählt nicht mit (wie beim Vorbild)
    let n = this.bett && !this.player.dead ? 1 : 0, alle = this.player.dead || this.dim !== 'oben' ? 0 : 1;
    for(const s of Netz.andere.values()) if(!s.tot && (s.dim || 'oben') === 'oben'){ alle++; if(s.flags & 16) n++; }
    return [n, alle];
  },
  /** Beim Host (oder allein): liegen alle im Bett, vergeht die Nacht — für alle */
  schlafPruefen(){
    if(Netz.istGast || this.schlafT > 0 || !this.istNacht()) return;
    const [n, alle] = this.schlaefer();
    if(!n || n < alle) return;
    this.schlafT = 0.001;
    if(Netz.istHost) Netz.anAlle({ t:'schlaf' });
  },
  eat(){
    const p = this.player, s = Inv.held();
    if(!s || !items[s.id] || !items[s.id].food) return;
    const it = items[s.id];
    if(p.food >= 20 && !it.heal && !p.creative) { hint('Du bist satt'); return; }
    p.food = Math.min(20, p.food + it.food);
    p.saturation = Math.min(p.food, p.saturation + it.food*0.6);
    if(it.heal) p.health = Math.min(p.maxHealth, p.health + it.heal);
    if(!p.creative){
      if(s.id === ITEM.milk_bucket) Inv.slots[Inv.sel] = Inv.make(ITEM.bucket, 1);
      else Inv.consumeHeld();
    }
    Sfx.play('eat'); HUD.refreshHotbar();
  },
  /** das Wesen unter dem Fadenkreuz (bis maxD): Strahl gegen den Körper.
      Ein echter Treffer schlägt einen Treffer im großzügigen Rand (0.12)
      eines näheren Wesens — sonst bekommt beim Füttern eines Kalbs dicht
      neben den Eltern ein Elternteil den Weizen. Trifft der Strahl gar
      nichts, zählt das, was dem Fadenkreuz am nächsten liegt. */
  /** Mitspieler, die man treffen darf: PvP an, nicht tot, nicht im Bett */
  gegner(){
    if(!this.regeln.pvp || !(Netz.istGast || Netz.istHost)) return [];
    return [...Netz.andere.values()].filter(s => !s.tot && Netz.hier(s) && !(s.flags & 16));
  },
  wesenImBlick(maxD, auchSpieler){
    const p = this.player, f = p.forward(), o = [p.x, p.eyeY(), p.z];
    const ziele = auchSpieler ? this.mobs.concat(this.gegner()) : this.mobs;
    const strahl = (m, rand) => {
      const r = m.w/2 + rand;
      const lo = [m.x - r, m.y - rand*0.4, m.z - r], hi = [m.x + r, m.y + m.h + rand, m.z + r];
      let t0 = 0, t1 = maxD;
      for(let a = 0; a < 3; a++){
        if(Math.abs(f[a]) < 1e-9){ if(o[a] < lo[a] || o[a] > hi[a]) return -1; continue; }
        let ta = (lo[a] - o[a])/f[a], tb = (hi[a] - o[a])/f[a];
        if(ta > tb){ const q = ta; ta = tb; tb = q; }
        t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
        if(t0 > t1) return -1;
      }
      return t0;
    };
    let best = null;
    // wie weit weg, und ob der Strahl es wirklich trifft (für Körner: Huhn oder Acker?)
    this.wesenGenau = true;
    for(const rand of [0, 0.12]){
      let bestT = maxD;
      for(const m of ziele){
        if(m.dead) continue;
        const t = strahl(m, rand);
        if(t >= 0 && t < bestT){ bestT = t; best = m; }
      }
      if(best){ this.wesenT = bestT; return best; }
    }
    let bestDot = 0.9;
    for(const m of ziele){
      const dx = m.x-o[0], dy = (m.y+m.h*0.6)-o[1], dz = m.z-o[2];
      const d = Math.hypot(dx,dy,dz);
      if(d > maxD || m.dead) continue;
      const dot = (dx*f[0]+dy*f[1]+dz*f[2])/d;
      if(dot > bestDot){ bestDot = dot; best = m; this.wesenT = d; }
    }
    this.wesenGenau = false;
    return best;
  },
  /* ── Kampf wie beim Vorbild (Java, seit der Kampf-Überarbeitung) ──────
     Jeder Schlag muss sich wieder aufladen: wie schnell, sagt die Waffe
     (tempo, Schläge je Sekunde — Schwert 1,6, Axt 0,8 … 1, Hand 4). Wer
     früher zuschlägt, trifft schwächer: Schaden × (0,2 + 0,8 · Ladung²).
     Voll aufgeladen gibt es mehr: im Fallen einen kritischen Treffer (× 1,5),
     im Sprint einen weiten Rückstoß, mit dem Schwert am Boden einen Schwung,
     der alle dicht beim Ziel mittrifft. Auch ein Schlag ins Leere oder ein
     Wechsel der Waffe fängt das Aufladen von vorn an. */
  angriffLadung(){
    const s = Inv.held(), it = s && items[s.id], tempo = it && it.tempo ? it.tempo : 4;
    return clamp((this.angriffT + 0.025)*tempo, 0, 1);
  },
  attack(){
    if(this.bett) return false;
    // eine Feuerkugel im Blick: zurückschlagen, wie beim Vorbild — dann trifft sie den Ghast
    {
      const p = this.player, f = p.forward(), ex = p.x, ey = p.eyeY(), ez = p.z;
      for(const a of this.pfeile){
        if(!a.feuer || a.klein || a.vomSpieler || a.weg) continue;
        const dx = a.x - ex, dy = a.y - ey, dz = a.z - ez, d = Math.hypot(dx, dy, dz);
        if(d > 4.5 || (dx*f[0] + dy*f[1] + dz*f[2])/d < 0.8) continue;
        const v = Math.hypot(a.vx, a.vy, a.vz) || 11;
        a.vx = f[0]*v*1.3; a.vy = f[1]*v*1.3; a.vz = f[2]*v*1.3; a.vomSpieler = true; a.dmg = 1000;
        Sfx.probe('angriff_stark', { gain: .6 }); this.angriffT = 0;
        return true;
      }
    }
    const best = this.wesenImBlick(3.4, true);
    if(!best){ if(!this.targetBlock()) this.angriffT = 0; return false; }
    const p = this.player, s = Inv.held(), it = s && items[s.id];
    const lade = this.angriffLadung(), voll = lade > 0.9;
    this.angriffT = 0;
    let dmg = (it ? it.dmg : 1)*(0.2 + lade*lade*0.8);
    const krit = voll && !p.onGround && p.vy < 0 && !p.inWater && !p.flying && !Input.sprint;
    if(krit) dmg *= 1.5;
    const sprintStoss = voll && Input.sprint;
    const schwung = voll && it && it.tool === 'sword' && p.onGround && !Input.sprint;
    const l = Math.hypot(best.x-p.x, best.z-p.z) || 1, kx = (best.x-p.x)/l, kz = (best.z-p.z)/l;
    // ein Mitspieler: der Treffer geht übers Netz, hier blitzt er nur rot auf
    const treffen = (z, d, k) => { if(z instanceof Mob) this.mobTreffer(z, d, kx*k, kz*k); else { z.rotT = 0.4; Netz.pvpTreffer(z, d, kx*k, kz*k); } };
    treffen(best, dmg, sprintStoss ? 2 : 1);
    if(schwung) for(const z of this.mobs.concat(this.gegner()))
      if(z !== best && !z.dead && !z.tot && Math.hypot(z.x - best.x, z.z - best.z) < 1.5 && Math.abs(z.y - best.y) < 1.2 && Math.hypot(z.x - p.x, z.z - p.z) < 3.6)
        treffen(z, 1, 1);
    if(it && it.dur && it.tool !== 'bow') Inv.damageHeld(1);
    p.addExhaustion(0.1);
    // die Geräusche des Vorbilds (mit dem Minecraft-Paket), dazu das Aua des Getroffenen
    Sfx.probe(krit ? 'angriff_krit' : schwung ? 'angriff_schwung' : sprintStoss ? 'angriff_rueck' : voll ? 'angriff_stark' : 'angriff_schwach',
      { gain: .6, rate: zufall(.9, 1.1), x: best.x, y: best.y + 1, z: best.z });
    if(best instanceof Mob) Sfx.wesen(best, 'au'); else Sfx.play('hurt', best.x, best.y + 1, best.z);
    if(krit) for(let k = 0; k < 8; k++) this.partikel.push({ x: best.x + (Math.random() - .5)*.8, y: best.y + best.h*(.4 + Math.random()*.5),
      z: best.z + (Math.random() - .5)*.8, t: -k*0.015, dauer: .5, gr: .1, tex: 'p_dotter' });     // goldene Funken
    return true;
  },
  herz(m, verzug){
    this.partikel.push({ x: m.x + (Math.random()-.5)*m.w*.8, y: m.y + m.h + 0.1, z: m.z + (Math.random()-.5)*m.w*.8, t: -(verzug || 0) });
  },
  /** zwei verliebte Tiere einer Art: ein Junges zwischen ihnen */
  geburt(a, b){
    const nah = this.mobs.filter(m => m.bleibt && Math.hypot(m.x - a.x, m.z - a.z) < 32).length;
    a.liebe = b.liebe = 0;
    a.pause = b.pause = ZUCHT_PAUSE;
    if(nah >= 60){ hint('Hier sind schon zu viele Tiere', 2000); return; }
    const jung = new Mob(a.type, (a.x + b.x)/2, Math.max(a.y, b.y) + 0.1, (a.z + b.z)/2, true);
    jung.yaw = a.yaw;
    if(a.type === 'sheep') jung.wolle = Math.random() < .5 ? a.wolle : b.wolle;
    a.bleibt = b.bleibt = true;
    this.mobs.push(jung);
    for(let k = 0; k < 6; k++) this.herz(jung, k*0.08);
    Sfx.play('geburt');
  },
  /** Treffer auf ein Wesen, vom Schlag oder vom Pfeil; von: der Mitspieler, der traf */
  mobTreffer(m, dmg, kx, kz, von){
    if(m.dead) return;
    // Als Gast rechnet der Host: nur fragen, aufblitzen lassen
    if(Netz.istGast){ Netz.wesenAnfrage('treffer', m, { dmg, kx: r2(kx), kz: r2(kz) }); m.hurtTimer = 0.4; return; }
    if(m.def.neutral) this.enderWuetend(m);
    if(m.type === 'kristall'){ m.dead = true; this.kristallPlatzt(m); return; }
    // eine halbe Sekunde unverwundbar wie beim Vorbild: dann zählt nur, was ein Treffer mehr bringt, ohne neuen Stoß
    let stoss = true;
    if(m.trefferT > 0){ if(dmg <= (m.letzterTreffer || 0)) return; const mehr = dmg - m.letzterTreffer; m.letzterTreffer = dmg; dmg = mehr; stoss = false; }
    else { m.letzterTreffer = dmg; m.trefferT = 0.5; }
    m.health -= dmg; m.hurtTimer = 0.4;
    if(!m.def.golem && !m.def.drache && stoss){ m.vx += kx*6; m.vz += kz*6; m.vy = Math.max(m.vy, 4.5); }
    if(m.def.drache) Sfx.wesen(m, 'au');
    if(!m.def.hostile && !m.def.golem){ m.flucht = 4; m.fluchtX = kx; m.fluchtZ = kz; }   // Tiere laufen weg
    if(von !== GOLEM_HAND && (m.def.golem || m.def.dorf)) this.golemZorn(m, von);
    if(m.health <= 0){
      m.dead = true;
      if(m.def.drache) this.drachenSieg(m);
      if(m.def.schleim && m.groesse > 1) this.schleimTeilen(m);
      if(!(m.kind > 0)){
        const beute = m.def.beute(m).filter(([, n]) => n > 0);
        // die Beute fällt für alle hin — außer, wer getroffen hat, spielt kreativ
        if(!(von ? von.creative : this.player.creative)) for(const [id, n] of beute) this.dropItem(id, n, m.x, m.y + 0.4, m.z);
      }
    }
  },
  /** wer einen Golem oder einen Dorfbewohner schlägt, den verfolgen die Golems in der Nähe eine Weile */
  golemZorn(m, von){
    for(const g of this.mobs){
      if(!g.def.golem || g.dead || (g !== m && Math.hypot(g.x - m.x, g.z - m.z) > 32)) continue;
      g.zorn = von || 'ich'; g.zornT = 40;
    }
  },
  /** ein Golem mit Eisen geflickt */
  golemFlicken(m){
    if(!m.def.golem || m.dead || m.health >= m.def.health) return false;
    m.health = Math.min(m.def.health, m.health + 25);
    return true;
  },
  /** Golem aus vier Eisenblöcken in T-Form und einem geschnitzten Kürbis obendrauf.
      Die Arme dürfen quer in x oder in z stehen, unter ihnen muss Platz sein. */
  golemBauen(x, y, z){
    const w = this.world, E = B.IRON_BLOCK;
    if(!isGeschnitzt(w.getBlock(x, y, z)) || w.getBlock(x, y - 1, z) !== E || w.getBlock(x, y - 2, z) !== E) return false;
    for(const [ax, az] of [[1, 0], [0, 1]]){
      if(w.getBlock(x + ax, y - 1, z + az) !== E || w.getBlock(x - ax, y - 1, z - az) !== E) continue;
      if(blocksMovement(w.getBlock(x + ax, y - 2, z + az)) || blocksMovement(w.getBlock(x - ax, y - 2, z - az))) continue;
      for(const [bx, by, bz] of [[x, y, z], [x, y - 1, z], [x, y - 2, z], [x + ax, y - 1, z + az], [x - ax, y - 1, z - az]]) w.setBlock(bx, by, bz, B.AIR);
      const m = new Mob('golem', x + 0.5, y - 2, z + 0.5);
      const p = this.player;
      m.yaw = Math.atan2(-(p.x - m.x), -(p.z - m.z)) + Math.PI;
      m.bleibt = true; m.heimX = m.x; m.heimZ = m.z; m.heimR = 20;
      this.mobs.push(m);
      Sfx.wesen(m, 'laut');
      Chat.system('Ein Eisengolem ist erwacht!');
      return true;
    }
    return false;
  },
  /** Eisengolem: geht auf Monster los (oder auf den, der ihn gereizt hat), schlägt
      sie hoch in die Luft; sonst schlendert er um sein Dorf oder den Ort, wo er
      gebaut wurde. Gibt [Richtung x, Richtung z, Tempo] zurück. */
  golemDenken(m, dt, leute, speed, hoerbar){
    if(m.schlagT > 0) m.schlagT -= dt;
    let ziel = null, zd = 18;
    if(m.zornT > 0){
      m.zornT -= dt;
      const q = leute.find(q => (m.zorn === 'ich' ? q.ich : q.g === m.zorn) && !q.dead && !q.creative);
      if(q){ const d = Math.hypot(q.x - m.x, q.z - m.z); if(d < 28){ ziel = q; zd = d; } }
    }
    if(!ziel) for(const o of this.mobs){
      if(!o.def.hostile || o.dead) continue;
      const d = Math.hypot(o.x - m.x, o.z - m.z);
      if(d < zd && Math.abs(o.y - m.y) < 6){ zd = d; ziel = o; }
    }
    if(ziel){
      const dx = ziel.x - m.x, dz = ziel.z - m.z, l = zd || 1;
      m.yaw = Math.atan2(-dx/l, -dz/l); m.moving = true;
      const reich = m.w/2 + (ziel.w || 0.6)/2 + 0.9;
      if(zd < reich && Math.abs(ziel.y - m.y) < 2.5 && m.attackCd <= 0){
        m.attackCd = 1.25; m.schlagT = 0.5;
        const dmg = 7 + ((Math.random()*14) | 0);
        if(ziel instanceof Mob){ this.mobTreffer(ziel, dmg, dx/l, dz/l, GOLEM_HAND); ziel.vy = 9.5; Sfx.wesen(ziel, 'au'); }
        else if(ziel.ich){ if(this.player.hurt(dmg, 'Ein Eisengolem hat dich erwischt', dx/l, dz/l)){ this.player.vy = 9.5; this.hurtFlash = 1; Sfx.play('hurt'); } }
        else Netz.autsch(ziel.g, dmg, 'Ein Eisengolem hat dich erwischt', dx/l, dz/l);
        Sfx.wesen(m, 'schlag');
      }
      if(zd < reich - 0.3){ m.moving = false; return [0, 0, 0]; }
      return [dx/l, dz/l, speed*1.25];
    }
    m.wander -= dt;
    if(m.wander <= 0){
      m.wander = 3 + Math.random()*6;
      m.moving = Math.random() < 0.45;
      m.wanderYaw = Math.random()*TAU;
      if(m.heimX !== undefined){
        const ex = m.heimX - m.x, ez = m.heimZ - m.z;
        if(Math.hypot(ex, ez) > (m.heimR || 16)){ m.wanderYaw = Math.atan2(-ex, -ez); m.moving = true; }
      }
    }
    if(hoerbar && Math.random() < 0.0008) Sfx.wesen(m, 'laut');
    if(!m.moving) return [0, 0, 0];
    m.yaw = m.wanderYaw;
    return [-Math.sin(m.yaw), -Math.cos(m.yaw), speed*0.5];
  },
  /** Benutzen auf ein Wesen: mit Dorfbewohnern tauschen, füttern, Schaf scheren,
      Kuh melken. tipp: auf dem Telefon getippt — mit einer Waffe wird dann geschlagen */
  benutzeWesen(tipp){
    if(this.bett) return false;
    const s = Inv.held();
    const m = this.wesenImBlick(3.4); if(!m) return false;
    if(m.def.dorf){
      const waffe = s && items[s.id] && (items[s.id].tool === 'sword' || items[s.id].tool === 'axe');
      if(tipp && waffe) return false;
      this.handeln(m);
      return true;
    }
    if(!s) return false;
    const p = this.player;
    if(m.def.golem){
      if(s.id !== ITEM.iron) return false;
      if(m.health >= m.def.health){ hint('Der Eisengolem ist heil', 1400); return true; }
      if(Netz.istGast) Netz.wesenAnfrage('eisen', m); else this.golemFlicken(m);
      if(!p.creative) Inv.consumeHeld();
      Sfx.wesen(m, 'schlag'); p.swinging = true; p.swing = 0; HUD.refreshHotbar();
      return true;
    }
    // Körner gehören auch aufs Feld: dann zählt, was näher unterm Fadenkreuz liegt
    if(s.id === ITEM.seeds){
      const t = this.targetBlock();
      if(t && t.id === B.FARMLAND && (!this.wesenGenau || t.t < this.wesenT)) return false;
    }
    // Futter (Weizen, für Hühner Körner): Junge wachsen schneller, Erwachsene werden verliebt
    const futter = m.def.hostile ? 0 : futterVon(m);
    if(futter && s.id !== futter && (s.id === ITEM.wheat || s.id === ITEM.seeds)){
      hint(m.def.name + ' frisst lieber ' + nameOf(futter), 1600);
      return true;
    }
    if(futter && s.id === futter){
      if(!(m.kind > 0) && (m.pause > 0 || m.liebe > 0)){
        hint(m.liebe > 0 ? m.def.name + ' sucht schon einen Partner' : m.def.name + ' braucht noch etwas Zeit', 1600);
        return true;
      }
      if(Netz.istGast) Netz.wesenAnfrage('futter', m); else this.fuettern(m);
      if(!p.creative) Inv.consumeHeld();
      Sfx.play('eat'); p.swinging = true; p.swing = 0; HUD.refreshHotbar();
      return true;
    }
    if(m.kind > 0) return false;
    if(s.id === ITEM.shears && m.type === 'sheep' && !m.geschoren){
      if(Netz.istGast){ Netz.wesenAnfrage('schere', m); m.geschoren = true; }
      else this.scheren(m, null);
      if(!p.creative) Inv.damageHeld(1);
      Sfx.play('schere', m.x, m.y + 1, m.z); p.swinging = true; p.swing = 0; HUD.refreshHotbar();
      return true;
    }
    if(s.id === ITEM.bucket && m.type === 'cow'){
      if(!p.creative){ Inv.consumeHeld(); const r = Inv.add(ITEM.milk_bucket, 1); if(r) this.dropItem(ITEM.milk_bucket, 1, p.x, p.y + 1, p.z); }
      Sfx.play('melken', m.x, m.y + 1, m.z); p.swinging = true; p.swing = 0; HUD.refreshHotbar();
      return true;
    }
    return false;
  },

  /** Tauschen: der Dorfbewohner bleibt stehen und schaut einen an */
  handeln(m){
    Sfx.wesen(m, 'laut');
    this.player.swinging = true; this.player.swing = 0;
    Screens.oeffne('handel', m);
  },
  /** Dorfbewohner: bleiben in ihrem Dorf, schauen Leute an, die nah kommen,
      und gehen nachts heim, vor ihre Tür. Gibt [Richtung x, Richtung z, Tempo] zurück. */
  dorfDenken(m, dt, z, dx, dz, dist, dl, speed, hoerbar){
    const schaut = () => { m.yaw = Math.atan2(dx, dz) + Math.PI; m.moving = false; return [0, 0, 0]; };
    if(Screens.open === 'beh' && Screens.modus === 'handel' && Screens.handelWesen === m) return schaut();
    if(dl < 0.3 && m.heimX !== undefined){
      const hx = m.heimX - m.x, hz = m.heimZ - m.z, hd = Math.hypot(hx, hz);
      if(hd > 1.2){ m.yaw = Math.atan2(-hx, -hz); m.moving = true; return [hx/hd, hz/hd, speed*0.7]; }
      m.moving = false; return [0, 0, 0];
    }
    if(!z.dead && dist < 3.5 && Math.abs(z.y - m.y) < 2) return schaut();
    m.wander -= dt;
    if(m.wander <= 0){
      m.wander = 2 + Math.random()*5;
      m.moving = Math.random() < 0.55;
      m.wanderYaw = Math.random()*TAU;
      // zu weit draußen: zurück zur Mitte des Dorfs
      if(m.dorfX !== undefined){
        const ex = m.dorfX - m.x, ez = m.dorfZ - m.z;
        if(Math.hypot(ex, ez) > m.dorfR){ m.wanderYaw = Math.atan2(-ex, -ez); m.moving = true; }
      }
    }
    if(hoerbar && Math.random() < 0.0015) Sfx.wesen(m, 'laut');
    if(!m.moving) return [0, 0, 0];
    m.yaw = m.wanderYaw;
    return [-Math.sin(m.yaw), -Math.cos(m.yaw), speed*0.55];
  },
  /** Dorfbewohner erscheinen vor ihren Häusern, sobald jemand in die Nähe
      kommt, und verschwinden mit den anderen Wesen, wenn niemand mehr da ist.
      Wer stirbt, kommt erst nach fünf Minuten wieder. */
  dorfLeben(dt){
    const w = this.world;
    if(!w.doerfer) return;
    this._dorfT = (this._dorfT || 0) - dt;
    if(this._dorfT > 0) return;
    this._dorfT = 1.5;
    const ruhe = this._dorfRuhe || (this._dorfRuhe = new Map());
    for(const q of this.spielerOrte()) for(const d of doerferBei(w, q.x - 72, q.z - 72, q.x + 72, q.z + 72)){
      if(Math.hypot(d.cx - q.x, d.cz - q.z) > 72) continue;
      if(d.spawn.length >= 3 && !this.mobs.some(m => m.golemDorf === d.key && !m.dead) && (ruhe.get(d.key + '#golem') || 0) <= this.gesamtZeit)
        for(const [gx, gz] of [[d.cx + 3, d.cz + 3], [d.cx - 4, d.cz - 4], [d.cx + 3, d.cz - 4], [d.cx - 4, d.cz + 3]]){
          const k = ckey(gx >> 4, gz >> 4), ch = w.chunks.get(k);
          if(!this.meshes.has(k) || !(ch && ch.state >= 1)) continue;
          const g = new Mob('golem', gx + 0.5, d.hoehe(gx, gz) + 1, gz + 0.5);
          if(!this.frei(g)) continue;
          g.golemDorf = d.key; g.heimX = d.cx + 0.5; g.heimZ = d.cz + 0.5; g.heimR = Math.max(12, d.radius - 4);
          this.mobs.push(g);
          return;
        }
      const da = new Set();
      for(const m of this.mobs) if(m.dorfKey === d.key && !m.dead) da.add(m.dorfSlot);
      for(let i = 0; i < d.spawn.length; i++){
        if(da.has(i) || (ruhe.get(d.key + '#' + i) || 0) > this.gesamtZeit) continue;
        const sp = d.spawn[i], k = ckey(Math.floor(sp.x) >> 4, Math.floor(sp.z) >> 4), ch = w.chunks.get(k);
        if(!this.meshes.has(k) || !(ch && ch.state >= 1)) continue;
        const m = new Mob('villager', sp.x, sp.y, sp.z);
        if(!this.frei(m)) continue;
        m.beruf = sp.beruf; m.dorfKey = d.key; m.dorfSlot = i;
        m.heimX = sp.x; m.heimZ = sp.z; m.dorfX = d.cx + 0.5; m.dorfZ = d.cz + 0.5; m.dorfR = Math.max(12, d.radius - 6);
        this.mobs.push(m);
        return;                                       // je Runde einer
      }
    }
  },

  /** Futter: Junges wächst schneller, Erwachsenes wird verliebt */
  fuettern(m){
    if(m.kind > 0) m.kind = Math.max(0, m.kind - WACHS_ZEIT*0.1);
    else if(m.pause > 0 || m.liebe > 0) return false;
    else { m.liebe = LIEBE_ZEIT; m.herzT = 0; for(let k = 0; k < 3; k++) this.herz(m, k*0.12); }
    m.bleibt = true;
    return true;
  },
  /** Schaf scheren; von: der Mitspieler, der die Wolle bekommt */
  scheren(m, von){
    if(m.geschoren || m.kind > 0) return;
    m.geschoren = true; m.wolleT = 30 + Math.random()*60;
    const n = zufallN(1, 3);
    for(let i = 0; i < n; i++) this.dropItem(B.WOOL + m.wolle, 1, m.x, m.y + 1, m.z);
  },

  /* ── Bogen und Pfeile ────────────────────────────────────────────── */
  hatPfeile(){ return this.player.creative || Inv.countOf(ITEM.arrow) > 0; },
  bogenStart(){
    const s = Inv.held();
    if(!s || s.id !== ITEM.bow || this.bett) return false;
    if(!this.hatPfeile()){ hint('Keine Pfeile'); return true; }
    this.bogen.aktiv = true; this.bogen.t = 0;
    return true;
  },
  bogenLos(){
    const b = this.bogen;
    if(!b.aktiv) return;
    b.aktiv = false;
    const s = Inv.held();
    if(!s || s.id !== ITEM.bow || b.t < 0.12 || !this.hatPfeile()) return;
    const x = Math.min(1, b.t);
    const kraft = (x*x + 2*x)/3;                        // wie beim Vorbild: gegen Ende zieht es an
    const p = this.player, f = p.forward(), v = 34*kraft;
    const pf = new Pfeil(p.x + f[0]*0.4, p.eyeY() - 0.1 + f[1]*0.4, p.z + f[2]*0.4, f[0]*v, f[1]*v, f[2]*v,
      Math.round(2 + 7*kraft), true);
    this.pfeile.push(pf);
    Netz.pfeilSenden(pf, true);
    if(!p.creative){ Inv.take(ITEM.arrow, 1); Inv.damageHeld(1); }
    Sfx.play('bogen'); HUD.refreshHotbar();
  },
  /** Ei oder Enderperle werfen: fliegt im Bogen; das Ei zerbricht, wo es
      auftrifft, die Perle bringt einen dorthin (eine Sekunde Pause danach) */
  eiWerfen(){
    const s = Inv.held();
    if(!s || !istWurf(s.id)) return false;
    const perle = s.id === ITEM.enderperle, jetzt = performance.now();
    if(jetzt - (this._wurfT || 0) < (perle || this._perleT ? 1000 : 250)) return true;
    this._wurfT = jetzt; this._perleT = perle;
    const p = this.player, f = p.forward(), v = 20;
    const ei = new Pfeil(p.x + f[0]*0.4, p.eyeY() - 0.1 + f[1]*0.4, p.z + f[2]*0.4, f[0]*v, f[1]*v + 1.5, f[2]*v, 0, true, true);
    ei.perle = perle;
    this.pfeile.push(ei);
    if(!perle) Netz.pfeilSenden(ei, true);
    if(!p.creative) Inv.consumeHeld();
    Sfx.play('werfen');
    p.swinging = true; p.swing = 0; HUD.refreshHotbar();
    return true;
  },
  /** Ein Ei zerbricht bei x, y, z: Schalen, Dotter, Geräusch. Wer es geworfen
      hat, würfelt wie beim Vorbild: 1 zu 8 schlüpft ein Küken, und davon
      1 zu 32 gleich vier. */
  eiZerbricht(a, x, y, z){
    if(a.perle){ this.perleLandet(a, x, y, z); return; }
    Sfx.play('ei_kaputt', x, y, z);
    for(let k = 0; k < 8; k++)
      this.partikel.push({ x, y, z, t: 0, tex: k < 5 ? 'p_schale' : 'p_dotter', gr: 0.06 + Math.random()*0.05, dauer: 0.6 + Math.random()*0.35,
        fall: true, vx: (Math.random() - .5)*2.6, vy: 1.2 + Math.random()*2.2, vz: (Math.random() - .5)*2.6 });
    if(!a.vomSpieler || Math.random() >= 1/8) return;
    const n = Math.random() < 1/32 ? 4 : 1;
    if(Netz.istGast) Netz.kuekenAnfrage(x, y, z, n);
    else this.kuekenSchluepfen(x, y, z, n);
  },
  /** Die Enderperle schlägt auf: der Werfer landet in der Luftzelle davor,
      wie beim Vorbild mit 5 Schaden (der Rüstung egal), und der Fall beginnt neu */
  perleLandet(a, x, y, z){
    const p = this.player, w = this.world;
    this.portalFunken(x, y, z, 12);
    if(!a.vomSpieler || p.dead) return;
    const bx = Math.floor(x), bz = Math.floor(z);
    let by = Math.floor(y);
    if(blocksMovement(w.getBlock(bx, by, bz))) return;
    // die Füße auf den Boden, wenn er gleich darunter ist; Platz für den Kopf
    if(blocksMovement(w.getBlock(bx, by + 1, bz)) && !blocksMovement(w.getBlock(bx, by - 1, bz))) by--;
    p.x = clamp(x, bx + 0.3, bx + 0.7); p.z = clamp(z, bz + 0.3, bz + 0.7);
    p.y = blocksMovement(w.getBlock(bx, by - 1, bz)) ? by : Math.max(by, y - 0.9);
    p.vx = p.vy = p.vz = 0; p.fallFrom = null;
    Sfx.probe('ender_tele', { gain: .7 });
    this.portalFunken(p.x, p.y + 1, p.z, 16);
    if(!p.creative && p.hurt(5, 'Eine Enderperle war zu hart gelandet')){ this.hurtFlash = 1; Sfx.play('hurt'); }
  },
  /** lila Funken wie beim Vorbild, wo etwas sich wegbeamt */
  portalFunken(x, y, z, n){
    for(let k = 0; k < n; k++)
      this.partikel.push({ x: x + (Math.random() - .5)*.8, y: y + (Math.random() - .5)*1.6, z: z + (Math.random() - .5)*.8, t: -k*0.01,
        tex: 'portal', gr: 0.05 + Math.random()*0.05, dauer: 0.6 + Math.random()*0.4,
        fall: false, vx: (Math.random() - .5)*1.2, vy: (Math.random() - .5)*1.2, vz: (Math.random() - .5)*1.2 });
  },
  /** Küken in die Luftzelle, in der das Ei zerbrach — nie halb in einer Wand */
  kuekenSchluepfen(x, y, z, n){
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    if(blocksMovement(this.world.getBlock(bx, by, bz))) return;
    const nah = this.mobs.filter(m => m.bleibt && Math.hypot(m.x - x, m.z - z) < 32).length;
    for(let k = 0; k < n && nah + k < 60; k++){
      const m = new Mob('chicken', clamp(x + (Math.random() - .5)*.3, bx + .15, bx + .85), by + 0.01,
                                   clamp(z + (Math.random() - .5)*.3, bz + .15, bz + .85), true);
      this.mobs.push(m);
      Sfx.wesen(m, 'laut');
    }
  },
  /** freie Sicht zwischen zwei Punkten — nur feste Blöcke halten auf */
  freieSicht(ax, ay, az, bx, by, bz){
    const d = Math.hypot(bx-ax, by-ay, bz-az), n = Math.ceil(d/0.3);
    for(let i = 1; i < n; i++){
      const t = i/n;
      if(blocksMovement(this.world.getBlock(Math.floor(ax + (bx-ax)*t), Math.floor(ay + (by-ay)*t), Math.floor(az + (bz-az)*t)))) return false;
    }
    return true;
  },
  /** eine Feuerkugel platzt: ein Knall, ein paar Funken (Blöcke bleiben heil) */
  feuerkugelPlatzt(a){
    if(a.drachen){ this.atemWolke(a.x, a.y, a.z, 3, 6); return; }
    Sfx.play('kaputt', a.x, a.y, a.z);
    if(!a.klein) this.camShake = Math.max(this.camShake, 0.15);
    for(let k = 0, n = a.klein ? 4 : 10; k < n; k++) this.partikel.push({ x: a.x + (Math.random() - .5), y: a.y + (Math.random() - .5), z: a.z + (Math.random() - .5),
      t: -k*0.01, dauer: .5, gr: .14, tex: 'p_dotter' });
  },
  updatePfeile(dt){
    const w = this.world, p = this.player;
    for(let i = this.pfeile.length - 1; i >= 0; i--){
      const a = this.pfeile[i];
      a.alter += dt;
      if(a.weg || a.alter > 40){ this.pfeile.splice(i, 1); continue; }
      if(a.auge){ if(this.augeFliegt(a, dt)) this.pfeile.splice(i, 1); continue; }
      if(a.steckt){
        // Pfeile des Spielers aufheben, sobald man nah ist; fremde verschwinden bald
        if(a.vomSpieler && !p.creative && Math.hypot(p.x - a.x, p.y + 0.9 - a.y, p.z - a.z) < 1.6){
          if(Inv.add(ITEM.arrow, 1) === 0){ Sfx.play('pickup'); HUD.refreshHotbar(); this.pfeile.splice(i, 1); continue; }
        }
        if(!a.vomSpieler && a.alter > 6) this.pfeile.splice(i, 1);
        continue;
      }
      if(!a.feuer){
        a.vy -= (a.ei ? 12 : 20)*dt;
        const k = Math.pow(0.99, dt*60); a.vx *= k; a.vy *= k; a.vz *= k;
      }
      a.rx = a.vx; a.ry = a.vy; a.rz = a.vz;
      const weg = Math.hypot(a.vx, a.vy, a.vz)*dt, n = Math.max(1, Math.ceil(weg/0.2));
      for(let j = 0; j < n && !a.steckt && !a.weg; j++){
        const ox = a.x, oy = a.y, oz = a.z;
        a.x += a.vx*dt/n; a.y += a.vy*dt/n; a.z += a.vz*dt/n;
        if(blocksMovement(w.getBlock(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)))){
          if(a.feuer){ a.weg = true; this.feuerkugelPlatzt(a); break; }
          if(a.ei){ a.weg = true; this.eiZerbricht(a, ox, oy, oz); break; }
          a.steckt = true; a.alter = 0; Sfx.play('pfeil', a.x, a.y, a.z); break;
        }
        const tv = Math.hypot(a.vx, a.vz) || 1;
        // eigene Pfeile und Eier treffen Wesen; fremde Eier zerbrechen dort nur fürs Auge
        if(a.vomSpieler && !a.ei){
          const s = this.gegner().find(q => Math.abs(a.x - q.x) < q.w/2 + .1 && Math.abs(a.z - q.z) < q.w/2 + .1 && a.y > q.y && a.y < q.y + q.h);
          if(s){ s.rotT = 0.4; Netz.pvpTreffer(s, a.dmg, a.vx/tv*.6, a.vz/tv*.6); Sfx.play('hurt', s.x, s.y + 1, s.z); a.weg = true; break; }
        }
        if(a.vomSpieler || a.ei){
          for(const m of this.mobs){
            if(m.dead || Math.abs(a.x - m.x) > m.w/2 + .1 || Math.abs(a.z - m.z) > m.w/2 + .1 || a.y < m.y || a.y > m.y + m.h) continue;
            // dem Enderman fliegt nichts ins Gesicht: er ist schon weg (und böse)
            if(m.def.neutral && !a.ei){ this.enderWuetend(m); this.enderSpringen(m); continue; }
            if(a.vomSpieler){ this.mobTreffer(m, a.dmg, a.vx/tv*.6, a.vz/tv*.6); Sfx.wesen(m, 'au'); }
            if(a.feuer) this.feuerkugelPlatzt(a);
            a.weg = true;
            if(a.ei) this.eiZerbricht(a, ox, oy, oz);
            break;
          }
        } else if(!a.nurBild && !this._fremd && !p.dead && Math.abs(a.x - p.x) < p.w/2 + (a.feuer ? (a.klein ? .2 : .45) : .1) && Math.abs(a.z - p.z) < p.w/2 + (a.feuer ? (a.klein ? .2 : .45) : .1)
                  && a.y > p.y - (a.feuer ? .4 : 0) && a.y < p.y + p.h + (a.feuer ? .4 : 0)){
          const wer = a.drachen ? 'Der Enderdrache hat dich getroffen' : a.klein ? 'Eine Lohe hat dich getroffen' : a.feuer ? 'Ein Ghast hat dich getroffen' : 'Ein Skelett hat dich getroffen';
          if(p.hurt(a.dmg, wer, a.vx/tv*(a.feuer && !a.klein ? 1.2 : .5), a.vz/tv*(a.feuer && !a.klein ? 1.2 : .5))){ this.hurtFlash = 1; Sfx.play('hurt'); }
          if(a.feuer) this.feuerkugelPlatzt(a);
          a.weg = true;
        }
      }
    }
  },

  /* ── Öfen ────────────────────────────────────────────────────────── */
  tickFurnaces(dt){
    const w = this.world;
    for(const [k, f] of w.furnaces){
      const can = f.in && SMELT[f.in.id] !== undefined &&
        (!f.out || (f.out.id === SMELT[f.in.id] && f.out.n < stackOf(f.out.id)));
      let lit = f.burn > 0;
      if(f.burn > 0) f.burn -= dt*20;
      if(f.burn <= 0 && can && f.fuel){
        const v = fuelValue(f.fuel.id);
        if(v > 0){ f.burnMax = v; f.burn = v; f.fuel.n--; if(f.fuel.n <= 0) f.fuel = null; lit = true; }
      }
      if(f.burn > 0 && can){
        f.cook += dt*20;
        if(f.cook >= 200){
          f.cook = 0;
          const out = SMELT[f.in.id];
          if(f.out) f.out.n++; else f.out = Inv.make(out, 1);
          f.in.n--; if(f.in.n <= 0) f.in = null;
        }
      } else f.cook = Math.max(0, f.cook - dt*40);
      const cur = w.getBlock(f.x, f.y, f.z);
      const want = (f.burn > 0) ? B.FURNACE_LIT : B.FURNACE;
      if((cur === B.FURNACE || cur === B.FURNACE_LIT) && cur !== want) w.setBlock(f.x, f.y, f.z, want);
      else if(cur !== B.FURNACE && cur !== B.FURNACE_LIT) w.furnaces.delete(k);
    }
    if(Screens.open === 'beh' && Screens.modus === 'ofen' && (this.tick & 7) === 0) Screens.render();
  },

  /* ── Felder ──────────────────────────────────────────────────────── */
  tickFelder(dt){
    this._feldT = (this._feldT || 0) + dt;
    if(this._feldT < 1) return;
    const schritt = this._feldT; this._feldT = 0;
    const w = this.world;
    for(const [k, f] of w.crops){
      const [x, y, z] = k.split(',').map(Number);
      const c = w.getChunk(x >> 4, z >> 4);
      if(!c || c.state < 1) continue;
      const id = w.getBlock(x, y, z);
      if(!isWheat(id)){ w.crops.delete(k); continue; }
      if(id === B.WHEAT + 3 || w.getBlock(x, y-1, z) !== B.FARMLAND) continue;
      if(f.nass === undefined || Math.random() < 0.02) f.nass = this.wasserNahe(x, y-1, z);
      const lv = w.getLight(x, y, z);
      if(Math.max((lv & 15)*this.dayLight(), lv >> 4) < 7) continue;
      f.t = (f.t || 0) + schritt*(f.nass || Wetter.regnetAn(x, y, z) ? 1.7 : 1);    // Regen gießt mit
      if(f.t >= 45){ f.t = 0; w.setBlock(x, y, z, id + 1); }
    }
  },
  wasserNahe(x, y, z){
    const w = this.world;
    for(let dy = 0; dy <= 1; dy++) for(let dz = -4; dz <= 4; dz++) for(let dx = -4; dx <= 4; dx++)
      if(isWasser(w.getBlock(x+dx, y+dy, z+dz))) return true;
    return false;
  },

  /* ── Mobs ────────────────────────────────────────────────────────── */
  /** alle Spieler dieser Welt: man selbst und, als Host, die Mitspieler */
  spielerOrte(){
    const p = this.player, h = Inv.held(), l = [];
    if(!this._fremd) l.push({ x:p.x, y:p.y, z:p.z, yaw:p.yaw, pitch:p.pitch, dead:p.dead, creative:p.creative, held: h ? h.id : 0, ich:true, g:null });
    if(Netz.istHost) for(const g of Netz.gaeste.values())
      if(g.bereit && (g.dim || 'oben') === this.dim) l.push({ x:g.x, y:g.y, z:g.z, yaw:g.yaw, pitch:g.pitch, dead:g.tot, creative:g.creative, held:g.held, ich:false, g });
    return l;
  },
  spawnMobs(dt){
    const menge = MONSTER_MENGE[this.settings.monster] || MONSTER_MENGE.normal;
    if(this.dim === 'ende') this.endKampf();                   // der Drache gehört zum End, auch ohne Monster
    // »Keine«: auch die, die schon da sind, verschwinden — wie friedlich beim Vorbild
    if(!menge.nacht && this.mobs.some(m => m.def.hostile && !m.def.drache)) this.mobs = this.mobs.filter(m => !m.def.hostile || m.def.drache);
    if(!this.regeln.doMobSpawning) return;
    if(this.dim === 'nether'){ if(menge.nacht) this.netherSpawnen(dt); return; }
    if(this.dim === 'ende'){ this.endeSpawnen(dt, menge); return; }
    this.mobTimer -= dt;
    if(this.mobTimer > 0) return;
    // Wesen erscheinen rund um jeden Spieler, reihum
    const leute = this.spielerOrte().filter(q => !q.creative);
    this.mobTimer = 2.2 / Math.max(1, leute.length);
    if(!leute.length) return;
    const p = leute[(Math.random()*leute.length) | 0], w = this.world;
    let host = 0, pass = 0;
    // gezählt wird nur, was in der Nähe ist — ferne Weiden verhindern keine neuen Tiere
    let schleime = 0;
    for(const m of this.mobs){ if(Math.hypot(m.x - p.x, m.z - p.z) < 48) (m.def.schleim ? schleime++ : m.def.hostile ? host++ : pass++); }
    if(schleime < menge.schleime) this.schleimeSpawnen(p);
    const dl = this.dayLight();
    const wantHost = dl < 0.42 ? menge.nacht : menge.tag, wantPass = 12;
    let neuHost = 0;                              // je Runde höchstens ein neues Monster
    for(let a=0; a<6; a++){
      const ang = Math.random()*TAU, r = 22 + Math.random()*22;
      const x = Math.floor(p.x + Math.cos(ang)*r), z = Math.floor(p.z + Math.sin(ang)*r);
      const cx = x>>4, cz = z>>4, ch = w.chunks.get(ckey(cx,cz));
      if(!this.meshes.has(ckey(cx,cz)) && !(ch && ch.state >= 2)) continue;
      const h = w.heightAt(x,z);
      const y = h+1;
      if(y >= WH-2) continue;
      const ground = w.getBlock(x,h,z);
      if(!blocksMovement(ground) || isWasser(ground)) continue;
      if(blocksMovement(w.getBlock(x,y,z)) || blocksMovement(w.getBlock(x,y+1,z))) continue;
      const lv = w.getLight(x,y,z), sky = lv & 15, blk = lv >> 4;
      const bright = Math.max(sky*dl, blk);
      if(host < wantHost && bright < 6.5){
        if(neuHost) continue;
        const ender = Math.random() < 0.07 && !blocksMovement(w.getBlock(x, y + 2, z));
        this.mobs.push(new Mob(ender ? 'enderman' : Math.random() < 0.4 ? 'skeleton' : 'zombie', x+0.5, y, z+0.5)); host++; neuHost++;
      } else if(pass < wantPass && bright > 8 && ground === B.GRASS){
        // Tiere kommen in kleinen Herden
        const art = ['pig', 'cow', 'sheep', 'chicken'][(Math.random()*4) | 0];
        for(let k = 0, n = 1 + ((Math.random()*3)|0); k < n && pass < wantPass; k++){
          const hx = x + ((Math.random()*5)|0) - 2, hz = z + ((Math.random()*5)|0) - 2, hh = w.heightAt(hx, hz);
          if(w.getBlock(hx, hh, hz) !== B.GRASS || blocksMovement(w.getBlock(hx, hh+1, hz)) || blocksMovement(w.getBlock(hx, hh+2, hz))) continue;
          this.mobs.push(new Mob(art, hx+0.5, hh+1, hz+0.5)); pass++;
        }
      }
    }
  },
  /* ── Das End ─────────────────────────────────────────────────────────
     Enderauge werfen (zeigt zur nächsten Endfestung) oder in einen Rahmen
     setzen; zwölf volle Rahmen öffnen das Portal. Im End warten der Drache
     und seine Kristalle; wer ihn besiegt, kommt durch das Ausgangsportal heim. */
  augeWerfen(){
    const p = this.player, jetzt = performance.now();
    if(jetzt - (this._augeT || 0) < 600) return;
    this._augeT = jetzt;
    if(this.dim !== 'oben'){ hint('Hier weiß das Enderauge keinen Weg', 2000); return; }
    const f = endfestungNaechste(this.world, p.x, p.z);
    if(!f){ hint('In dieser Welt gibt es keine Endfestung', 2200); return; }
    const dx = f.px + 0.5 - p.x, dz = f.pz + 0.5 - p.z, d = Math.hypot(dx, dz) || 1;
    const a = new Pfeil(p.x, p.eyeY() - 0.2, p.z, 0, 0, 0, 0, true, false);
    // steht man fast darüber, fliegt es erst ein Stück in Blickrichtung — sonst sähe man es nicht
    const fw = p.forward(), fh = Math.hypot(fw[0], fw[2]) || 1;
    const nah = d < 3;
    a.auge = { ux: nah ? fw[0]/fh : dx/d, uz: nah ? fw[2]/fh : dz/d, weit: nah ? 3 : Math.min(12, d), x0: p.x, y0: p.eyeY() - 0.2, z0: p.z, nah: d < 12 };
    this.pfeile.push(a);
    if(!p.creative) Inv.consumeHeld();
    Sfx.play('werfen'); p.swinging = true; p.swing = 0; HUD.refreshHotbar();
  },
  /** das geworfene Auge: steigt und fliegt zwölf Blöcke in Richtung der Festung, schwebt kurz,
      dann fällt es meistens herunter (aufheben!) — eins von fünf zerbricht. true: es ist weg */
  augeFliegt(a, dt){
    const o = a.auge, t = Math.min(1, a.alter/1.7);
    const glatt = t*t*(3 - 2*t);
    a.x = o.x0 + o.ux*o.weit*glatt; a.z = o.z0 + o.uz*o.weit*glatt;
    // erst steigen, dann schweben — ist die Festung nah, sinkt es danach langsam (zeigt nach unten),
    // aber nie in einen Block hinein
    let y = o.y0 + 2.6*Math.min(1, a.alter/1.1) + Math.sin(a.alter*6)*0.08;
    if(o.nah && a.alter > 1.2) y -= Math.min(3.5, (a.alter - 1.2)*2.2);
    if(blocksMovement(this.world.getBlock(Math.floor(a.x), Math.floor(y), Math.floor(a.z)))) y = Math.max(a.y, Math.floor(y) + 1.15);
    a.y = y;
    a.rx = o.ux; a.ry = 0; a.rz = o.uz;
    if(Math.random() < dt*12) this.partikel.push({ x: a.x, y: a.y, z: a.z, t: 0, tex: 'portal', gr: 0.05, dauer: 0.5, fall: false, vx: 0, vy: 0, vz: 0 });
    if(a.alter < (o.nah ? 2.9 : 2.3)) return false;
    if(Math.random() < 0.8) this.dropItem(ITEM.enderauge, 1, a.x, a.y, a.z);
    else { Sfx.play('kaputt', a.x, a.y, a.z); this.portalFunken(a.x, a.y, a.z, 14); }
    return true;
  },
  augeEinsetzen(x, y, z){
    const w = this.world, p = this.player;
    w.setBlock(x, y, z, B.ENDRAHMEN_AUGE);
    if(!p.creative) Inv.consumeHeld();
    p.swinging = true; p.swing = 0; HUD.refreshHotbar();
    if(!Sfx.probe('auge_setzen', { gain: .8, x: x + .5, y: y + .5, z: z + .5 })) Sfx.play('kolben_raus', x + .5, y + .5, z + .5);
    this.endportalPruefen(x, y, z);
  },
  /** zwölf Rahmen mit Auge um ein 3 × 3-Feld: das Portal öffnet sich */
  endportalPruefen(x, y, z){
    const w = this.world;
    for(let cz = z - 2; cz <= z + 2; cz++) for(let cx = x - 2; cx <= x + 2; cx++){
      let voll = true;
      for(let dz = -2; dz <= 2 && voll; dz++) for(let dx = -2; dx <= 2 && voll; dx++){
        const rand = (Math.abs(dx) === 2) !== (Math.abs(dz) === 2);
        if(rand && w.getBlock(cx + dx, y, cz + dz) !== B.ENDRAHMEN_AUGE) voll = false;
      }
      if(!voll) continue;
      for(let dz = -1; dz <= 1; dz++) for(let dx = -1; dx <= 1; dx++) w.setBlock(cx + dx, y, cz + dz, B.ENDPORTAL);
      if(!Sfx.probe('endportal', { gain: 1 })) Sfx.play('kolben_rein');
      this.portalFunken(cx + .5, y + 1, cz + .5, 30);
      hint('Das Endportal ist offen!', 3000);
      return true;
    }
    return false;
  },
  /** durchs Endportal: hin auf die Plattform aus Obsidian — oder (im End) heim zum Startpunkt */
  endReise(){
    const p = this.player;
    p.endSperre = true; p.vx = p.vy = p.vz = 0; p.fallFrom = null;
    if(this.dim === 'ende'){
      this.dimWechseln('oben');
      p.x = p.spawnX; p.y = p.spawnY; p.z = p.spawnZ;
      this.platzSuchen = !this.bett;
      hint('Zurück in der Oberwelt', 2400);
      return;
    }
    this.dimWechseln('ende');
    const w = this.world, [ax, ay, az] = END_ANKUNFT;
    for(let dz = -2; dz <= 2; dz++) for(let dx = -2; dx <= 2; dx++) w.ensureChunk((ax >> 4) + dx, (az >> 4) + dz);
    for(let dz = -2; dz <= 2; dz++) for(let dx = -2; dx <= 2; dx++){
      w.setBlock(ax + dx, ay - 1, az + dz, B.OBSIDIAN);
      for(let y = ay; y <= ay + 2; y++) if(w.getBlock(ax + dx, y, az + dz) !== B.AIR) w.setBlock(ax + dx, y, az + dz, B.AIR);
    }
    p.x = ax + 0.5; p.y = ay; p.z = az + 0.5; p.yaw = Math.PI/2; p.pitch = 0;
    p.ankunftT = 4;                                   // ein paar Sekunden hält die Plattform sicher fest (endAnkunft)
    if(!Netz.istGast) this.endKampf();
    hint('Das End', 2400);
  },
  /** steckt der Spieler in einem festen Block? Dann wie beim Vorbild nach oben hinaus,
      höchstens drei Blöcke weit, bis Füße und Kopf frei sind */
  herausdruecken(w, p){
    const steckt = y => {
      const hw = p.w/2 - 0.01;
      for(let by = Math.floor(y + 0.01); by <= Math.floor(y + p.h - 0.01); by++)
        for(let bz = Math.floor(p.z - hw); bz <= Math.floor(p.z + hw); bz++)
          for(let bx = Math.floor(p.x - hw); bx <= Math.floor(p.x + hw); bx++){
            const id = w.getBlock(bx, by, bz);
            if(!blocksMovement(id) || isTreppe(id)) continue;       // Treppen haben eigene Kästen (treppeKaesten)
            const o = id*6, unten = by + COLL[o + 1], oben = by + COLL[o + 4];
            if(y + p.h > unten + 0.01 && y < oben - 0.01 && p.x + hw > bx + COLL[o] && p.x - hw < bx + COLL[o + 3] && p.z + hw > bz + COLL[o + 2] && p.z - hw < bz + COLL[o + 5]) return oben;
          }
      return -1;
    };
    let y = p.y;
    for(let k = 0; k < 4; k++){ const o = steckt(y); if(o < 0) break; y = o; }
    if(y !== p.y && steckt(y) < 0 && y - p.y <= 3){ p.y = y + 0.001; p.vy = Math.max(p.vy, 0); p.fallFrom = null; }
  },
  /** gleich nach der Ankunft im End: steht man nicht auf der Plattform (Chunk noch nicht da,
      Plattform weg), wird sie neu gelegt und man darauf gestellt; wer im Kreativmodus ins
      Nichts fällt, kommt auf die Plattform zurück */
  endAnkunft(dt){
    const p = this.player, w = this.world, [ax, ay, az] = END_ANKUNFT;
    const zurueck = () => {
      const c = w.ensureChunk(ax >> 4, az >> 4);
      if(!c) return;
      for(let dz = -2; dz <= 2; dz++) for(let dx = -2; dx <= 2; dx++) if(w.getBlock(ax + dx, ay - 1, az + dz) !== B.OBSIDIAN) w.setBlock(ax + dx, ay - 1, az + dz, B.OBSIDIAN);
      p.x = ax + 0.5; p.y = ay; p.z = az + 0.5; p.vx = p.vy = p.vz = 0; p.fallFrom = null;
    };
    if(p.ankunftT > 0){
      p.ankunftT -= dt;
      if(p.y < ay - 0.5 && Math.hypot(p.x - ax - .5, p.z - az - .5) < 3) zurueck();
    }
    if(p.creative && p.y < END_INSEL_Y - 60) zurueck();
  },
  /** Drache und Kristalle, solange er lebt (und was von ihnen noch übrig ist) */
  endKampf(){
    const w = this.world;
    if(w.typ !== 'ende') return;
    const d = w.drache || (w.drache = { tot: false, kristalle: null });
    const S = endSaeulen(w);
    if(!Array.isArray(d.kristalle)) d.kristalle = S.map((s, i) => i);
    if(!this.mobs.some(m => m.type === 'kristall'))
      for(const i of d.kristalle){ const s = S[i]; if(!s) continue; const k = new Mob('kristall', s.x + .5, s.top + 1, s.z + .5, false); k.saeule = i; k.bleibt = true; this.mobs.push(k); }
    if(!d.tot && !this.mobs.some(m => m.type === 'drache')){
      const m = new Mob('drache', 40.5, 80, 0.5, false); m.bleibt = true;
      if(d.leben > 0) m.health = d.leben;
      this.mobs.push(m);
    }
  },
  /** ein Kristall platzt: Knall, Schaden ringsum; der Drache spürt es */
  kristallPlatzt(m){
    const d = this.world.drache;
    if(d && Array.isArray(d.kristalle)) d.kristalle = d.kristalle.filter(i => i !== m.saeule);
    Sfx.wesen(m, 'tot');
    for(let k = 0; k < 24; k++) this.partikel.push({ x: m.x + (Math.random() - .5)*2, y: m.y + 1 + (Math.random() - .5)*2, z: m.z + (Math.random() - .5)*2,
      t: -k*0.01, dauer: .7, gr: .2, tex: 'p_dotter' });
    for(const q of this.spielerOrte()){
      const e = Math.hypot(q.x - m.x, q.y + 1 - m.y - 1, q.z - m.z);
      if(e > 6 || q.dead || q.creative) continue;
      const dmg = Math.max(1, Math.round(12*(1 - e/6))), kx = (q.x - m.x)/(e || 1), kz = (q.z - m.z)/(e || 1);
      if(q.ich){ if(this.player.hurt(dmg, 'Ein Endkristall ist explodiert', kx, kz)){ this.hurtFlash = 1; this.camShake = 0.4; Sfx.play('hurt'); } }
      else Netz.autsch(q.g, dmg, 'Ein Endkristall ist explodiert', kx, kz);
    }
    for(const r of this.mobs) if(r.type === 'drache' && r.heilt === m){ r.health -= 10; r.hurtTimer = 0.4; r.heilt = null; if(r.health <= 0){ r.dead = true; this.drachenSieg(r); } }
  },
  /** der Drache: kreist, stößt herab, speit Feuer, heilt sich an den Kristallen */
  drachenDenken(m, dt, leute){
    const d = this.world.drache || {};
    const opfer = leute.filter(q => !q.dead && !q.creative && Math.hypot(q.x, q.z) < 150);
    let heil = null, hd = 48;
    for(const k of this.mobs) if(k.type === 'kristall' && !k.dead){ const e = Math.hypot(k.x - m.x, k.y - m.y, k.z - m.z); if(e < hd){ hd = e; heil = k; } }
    m.heilt = heil;
    if(heil && m.health < m.def.health) m.health = Math.min(m.def.health, m.health + dt*1.5);
    if(!m.zustand){ m.zustand = 'kreisen'; m.zustandT = 8; m.winkel = Math.atan2(m.z, m.x); }
    m.zustandT -= dt;
    const finde = o => o && leute.find(q => o.ich ? q.ich : q.g === o.g);
    let ziel;
    if(m.zustand === 'kreisen'){
      m.winkel += dt*0.26;
      ziel = [Math.cos(m.winkel)*52, 76 + Math.sin(m.age*0.7)*5, Math.sin(m.winkel)*52];
      if(m.zustandT <= 0){
        // landen oder herabstoßen: je weniger Kristalle, desto öfter setzt er sich auf das Portal (wie beim Vorbild)
        const rest = this.mobs.filter(k => k.type === 'kristall' && !k.dead).length;
        if(Math.random() < 0.3 + (10 - rest)*0.05 || !opfer.length){ m.zustand = 'anflug'; m.zustandT = 14; }
        else { m.opfer = opfer[(Math.random()*opfer.length) | 0]; m.zustand = 'sturz'; m.zustandT = 7; }
        Sfx.wesen(m, 'laut');
      }
      m.feuerCd = (m.feuerCd === undefined ? 5 : m.feuerCd) - dt;
      if(m.feuerCd <= 0 && opfer.length){
        const q = opfer[(Math.random()*opfer.length) | 0], hx = m.x - Math.sin(m.yaw)*5, hy = m.y + 1.5, hz = m.z - Math.cos(m.yaw)*5;
        const l = Math.hypot(q.x - hx, q.y + 1 - hy, q.z - hz);
        if(l < 70 && this.freieSicht(hx, hy, hz, q.x, q.y + 1.2, q.z)){
          const v = 14, ux = (q.x - hx)/l, uy = (q.y + 1 - hy)/l, uz = (q.z - hz)/l;
          const pf = new Pfeil(hx, hy, hz, ux*v, uy*v, uz*v, 6, false, false, true);
          pf.drachen = true;                                            // lila: hinterlässt eine Atemwolke
          this.pfeile.push(pf); Netz.pfeilSenden(pf, false); Sfx.wesen(m, 'feuer');
        }
        m.feuerCd = 5 + Math.random()*4;
      }
    } else if(m.zustand === 'sturz'){
      const q = finde(m.opfer);
      if(!q || q.dead || q.creative || m.zustandT <= 0){ m.zustand = 'steigen'; m.zustandT = 3; }
      else ziel = [q.x, q.y + 1, q.z];
    }
    // Landen: erst über die Mitte, dann hinunter auf die Säule des Ausgangsportals
    const sitzY = END_PORTAL_Y + 4 + 1.7;
    if(m.zustand === 'anflug'){
      const ueber = Math.hypot(m.x - 0.5, m.z - 0.5) < 6;
      ziel = ueber ? [0.5, sitzY, 0.5] : [0.5, sitzY + 10, 0.5];
      if(ueber && Math.abs(m.y - sitzY) < 1.2){ m.zustand = 'sitzen'; m.zustandT = 7 + Math.random()*3; m.vx = m.vy = m.vz = 0; Sfx.wesen(m, 'laut'); }
      else if(m.zustandT <= 0){ m.zustand = 'steigen'; m.zustandT = 3; }
    }
    if(m.zustand === 'sitzen'){
      m.x += (0.5 - m.x)*Math.min(1, dt*3); m.y += (sitzY - m.y)*Math.min(1, dt*3); m.z += (0.5 - m.z)*Math.min(1, dt*3);
      m.vx = m.vy = m.vz = 0; m.moving = false;
      // sich nach dem Nächsten umdrehen, nah beißen, weiter weg Feuer speien
      let q = null, qd = 40;
      for(const o of opfer){ const e = Math.hypot(o.x - m.x, o.z - m.z); if(e < qd){ qd = e; q = o; } }
      if(q){
        m.yaw = winkelNach(m.yaw, Math.atan2(-(q.x - m.x), -(q.z - m.z)), Math.min(1, dt*2));
        // Drachenatem: ein lila Strahl schräg vor ihm auf den Boden, dort bleibt eine Wolke liegen
        m.feuerCd = (m.feuerCd === undefined ? 1.5 : m.feuerCd) - dt;
        const blick = Math.abs(((Math.atan2(-(q.x - m.x), -(q.z - m.z)) - m.yaw + 3*Math.PI) % (2*Math.PI)) - Math.PI);
        if(m.feuerCd <= 0 && blick < 0.35){                           // erst, wenn er hinsieht
          const fx = -Math.sin(m.yaw), fz = -Math.cos(m.yaw), d = clamp(qd, 4, 9);
          this.atemWolke(m.x + fx*d, m.y + 1, m.z + fz*d, 3.5, 7);
          m.atemT = 2.2; m.feuerT = 2.2; Sfx.wesen(m, 'feuer');
          m.feuerCd = 4 + Math.random()*2;
        }
      }
      if(m.feuerT > 0) m.feuerT -= dt;
      if(m.zustandT <= 0){ m.zustand = 'steigen'; m.zustandT = 3; Sfx.wesen(m, 'fluegel'); }
    }
    if(m.zustand === 'steigen'){
      ziel = [Math.cos(m.winkel)*52, 86, Math.sin(m.winkel)*52];
      if(m.zustandT <= 0){ m.zustand = 'kreisen'; m.zustandT = 12 + Math.random()*8; }
    }
    // steuern: sanft zum Ziel, ohne Rücksicht auf Blöcke (er fliegt durch, wie beim Vorbild)
    if(m.zustand === 'sitzen'){ ziel = null; }
    if(ziel){
    const sp = m.zustand === 'sturz' ? 19 : m.zustand === 'anflug' ? 9 : 13;
    const ex = ziel[0] - m.x, ey = ziel[1] - m.y, ez = ziel[2] - m.z, el = Math.hypot(ex, ey, ez) || 1;
    const k = Math.min(1, dt*1.5);
    m.vx += (ex/el*sp - m.vx)*k; m.vy += (ey/el*sp - m.vy)*k; m.vz += (ez/el*sp - m.vz)*k;
    m.x += m.vx*dt; m.y = clamp(m.y + m.vy*dt, END_INSEL_Y - 20, WH - 6); m.z += m.vz*dt;
    m.yaw = Math.atan2(-m.vx, -m.vz); m.moving = true;
    }
    // wer ihm zu nahe kommt, den trifft er mit Kopf oder Flügel und schleudert ihn fort
    for(const q of opfer){
      const e = Math.hypot(q.x - m.x, q.y + 1 - (m.y + 1.5), q.z - m.z);
      if(e > 5 || m.attackCd > 0) continue;
      const kx = (q.x - m.x)/(e || 1), kz = (q.z - m.z)/(e || 1), dmg = m.zustand === 'sturz' ? 10 : 5;
      if(q.ich){ if(this.player.hurt(dmg, m.def.treffer, kx*2, kz*2)){ this.player.vy = 11; this.hurtFlash = 1; Sfx.play('hurt'); } }
      else Netz.autsch(q.g, dmg, m.def.treffer, kx*2, kz*2);
      m.attackCd = 1.2;
      if(m.zustand === 'sturz'){ m.zustand = 'steigen'; m.zustandT = 3; }
    }
    if(Math.random() < dt*0.6) Sfx.wesen(m, 'fluegel');
    if(Math.random() < dt*0.06) Sfx.wesen(m, 'laut');
    d.leben = m.health;
  },
  /** besiegt: das Ausgangsportal öffnet sich, obenauf liegt das Drachenei */
  drachenSieg(m){
    const w = this.world, d = w.drache || (w.drache = {});
    d.tot = true; d.leben = 0;
    Sfx.wesen(m, 'tot');
    for(let k = 0; k < 80; k++) this.partikel.push({ x: m.x + (Math.random() - .5)*8, y: m.y + Math.random()*4, z: m.z + (Math.random() - .5)*8,
      t: -k*0.02, dauer: 1.6, gr: .25, tex: 'portal' });
    endAusgangOeffnen(w, (x, y, z, id) => w.setBlock(x, y, z, id));
    w.setBlock(0, END_PORTAL_Y + 4, 0, B.DRACHENEI);
    const text = 'Der Enderdrache ist besiegt! In der Mitte führt ein Portal zurück.';
    hint(text, 5000);
    if(Netz.istHost) Netz.anDim({ t:'hinweis', text }, 'ende');
  },
  /** im End: Endermen auf dem Endstein, und der Kampf, solange der Drache lebt */
  endeSpawnen(dt, menge){
    this.mobTimer -= dt;
    if(this.mobTimer > 0) return;
    this.mobTimer = 2;
    const w = this.world, leute = this.spielerOrte().filter(q => !q.creative && !q.dead);
    if(!leute.length || !menge.nacht) return;
    const p = leute[(Math.random()*leute.length) | 0];
    if(this.mobs.filter(m => m.type === 'enderman' && Math.hypot(m.x - p.x, m.z - p.z) < 64).length >= 10) return;
    for(let a = 0; a < 6; a++){
      const ang = Math.random()*TAU, r = 16 + Math.random()*30;
      const x = Math.floor(p.x + Math.cos(ang)*r), z = Math.floor(p.z + Math.sin(ang)*r);
      const c = w.chunks.get(ckey(x >> 4, z >> 4));
      if(!c || c.state < 1) continue;
      let y = WH - 4;
      while(y > 2 && w.getBlock(x, y - 1, z) !== B.ENDSTEIN) y--;
      if(y <= 2 || blocksMovement(w.getBlock(x, y, z)) || blocksMovement(w.getBlock(x, y + 1, z)) || blocksMovement(w.getBlock(x, y + 2, z))) continue;
      this.mobs.push(new Mob('enderman', x + .5, y, z + .5)); break;
    }
  },
  /* Drachenatem: eine lila Wolke am Boden, die eine Weile liegen bleibt und jedem schadet,
     der darin steht (beim Vorbild der Trank des Schadens). Der Host rechnet den Schaden,
     alle sehen die Wolke (Netz: »wolke«). */
  atemWolke(x, y, z, r, dauer, vomNetz){
    if(Netz.istGast && !vomNetz) return;                 // beim Gast kommt sie vom Host
    const w = this.world;
    let gy = Math.floor(y);
    for(let k = 0; k < 8 && gy > 1 && !blocksMovement(w.getBlock(Math.floor(x), gy - 1, Math.floor(z))); k++) gy--;
    (w.wolken || (w.wolken = [])).push({ x, y: gy, z, r, t: dauer });
    Sfx.play('kaputt', x, gy, z);
    if(Netz.istHost && !vomNetz) Netz.anDim({ t:'wolke', d: Netz.dimNr(this.dim), a: [r2(x), gy, r2(z), r, dauer] }, this.dim);
  },
  wolkenTick(dt){
    const w = this.world;
    if(!w.wolken || !w.wolken.length) return;
    const leute = Netz.istGast ? [] : this.spielerOrte();
    this._atemCd = this._atemCd || new Map();
    for(let i = w.wolken.length - 1; i >= 0; i--){
      const c = w.wolken[i];
      c.t -= dt;
      if(c.t <= 0){ w.wolken.splice(i, 1); continue; }
      // lila Teilchen steigen auf, am Rand weniger
      if(!this._fremd) for(let n = Math.random() < c.r*c.r*dt*10 % 1 ? 1 : 0, k = Math.floor(c.r*c.r*dt*10) + n; k > 0; k--){
        const a = Math.random()*TAU, e = Math.sqrt(Math.random())*c.r;
        this.partikel.push({ x: c.x + Math.cos(a)*e, y: c.y + Math.random()*0.6, z: c.z + Math.sin(a)*e, t: 0, tex: 'p_atem', hell: true,
          gr: 0.25 + Math.random()*0.3, dauer: 0.8 + Math.random()*0.8, fall: false });
      }
      for(const q of leute){
        if(q.dead || q.creative || Math.hypot(q.x - c.x, q.z - c.z) > c.r || q.y < c.y - 1 || q.y > c.y + 2.5) continue;
        // einmal je Sekunde, wie der Trank des Schadens beim Vorbild
        const k = q.ich ? 'ich' : q.g.id, jetzt = this.gesamtZeit;
        if((this._atemCd.get(k) || 0) > jetzt) continue;
        this._atemCd.set(k, jetzt + 1);
        if(q.ich){ if(this.player.hurt(3, 'Der Drachenatem war zu viel')){ this.hurtFlash = 1; Sfx.play('hurt'); } }
        else Netz.autsch(q.g, 3, 'Der Drachenatem war zu viel', 0, 0);
      }
    }
  },
  /** der Lebensbalken oben, solange der Drache in der Nähe ist */
  atemStrahl(dt){
    for(const m of this.mobs){
      if(m.type !== 'drache' || !(m.atemT > 0)) continue;
      m.atemT -= dt;
      const fx = -Math.sin(m.yaw), fz = -Math.cos(m.yaw), hx = m.x + fx*4.2, hy = m.y + (m.def.mcHoch || 0) + 0.6, hz = m.z + fz*4.2;
      for(let k = 0; k < 4; k++){
        const v = 5 + Math.random()*3;
        this.partikel.push({ x: hx, y: hy, z: hz, t: 0, tex: 'p_atem', hell: true, gr: 0.2 + Math.random()*0.25, dauer: 0.9,
          fall: false, vx: (fx + (Math.random() - .5)*0.5)*v, vy: -v*0.45, vz: (fz + (Math.random() - .5)*0.5)*v, fliegt: true });
      }
    }
  },
  bossLeiste(){
    const el = document.getElementById('bossbar');
    if(!el) return;
    const p = this.player, m = this.dim === 'ende' ? this.mobs.find(q => q.type === 'drache' && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < 192) : null;
    el.classList.toggle('on', !!m);
    if(m){ const f = clamp(m.health/m.def.health, 0, 1); if(this._bossF !== f){ this._bossF = f; el.querySelector('b').style.width = (f*100).toFixed(1) + '%'; } }
  },
  /** Ghast: schwebt von Ziel zu Ziel; sieht er einen Spieler, dreht er sich zu
      ihm, öffnet das Maul und schießt alle drei, vier Sekunden eine Feuerkugel */
  ghastDenken(m, dt, z, dist, dx, dz){
    m.flugT = (m.flugT || 0) - dt;
    if(m.feuerT > 0) m.feuerT -= dt;
    if(!m.flugZiel || m.flugT <= 0 || Math.hypot(m.flugZiel[0] - m.x, m.flugZiel[2] - m.z) < 2){
      m.flugZiel = [m.x + (Math.random() - .5)*28, clamp(m.y + (Math.random() - .5)*10, NETHER_LAVA + 6, WH - 12), m.z + (Math.random() - .5)*28];
      m.flugT = 5 + Math.random()*4;
    }
    const fx = m.flugZiel[0] - m.x, fz = m.flugZiel[2] - m.z, fl = Math.hypot(fx, fz) || 1;
    // Kopf und Tentakel hängen wie beim Vorbild fast vier Blöcke unter seinem Körper:
    // nie tiefer schweben, als dass unter ihm fünf Blöcke frei sind
    const w = this.world, bx = Math.floor(m.x), bz = Math.floor(m.z);
    let frei = 0;
    while(frei < 6 && !blocksMovement(w.getBlock(bx, Math.floor(m.y) - 1 - frei, bz)) && w.getBlock(bx, Math.floor(m.y) - 1 - frei, bz) !== B.LAVA) frei++;
    const zielY = frei < 5 ? Math.max(m.flugZiel[1], m.y + 5 - frei) : m.flugZiel[1];
    if(frei < 5 && m.flugZiel[1] < zielY) m.flugZiel[1] = zielY;
    m.vy += clamp(zielY - m.y, -3, 3)*1.6*dt;
    m.moving = true;
    if(z && dist < 40){
      m.yaw = Math.atan2(-dx, -dz);
      m.schussCd = (m.schussCd === undefined ? 2 : m.schussCd) - dt;
      if(m.schussCd < 0.6 && m.schussCd + dt >= 0.6) m.feuerT = 0.9;                   // kurz vorher: Maul auf
      if(m.schussCd <= 0){
        const ax = m.x, ay = m.y + 2.2, az = m.z, zx = z.x, zy = z.y + 1.2, zz = z.z;
        if(this.freieSicht(ax, ay, az, zx, zy, zz)){
          const l = Math.hypot(zx - ax, zy - ay, zz - az) || 1, v = 11;
          const ux = (zx - ax)/l, uy = (zy - ay)/l, uz = (zz - az)/l;
          const pf = new Pfeil(ax + ux*2.6, ay + uy*2.6, az + uz*2.6, ux*v, uy*v, uz*v, 6, false, false, true);
          this.pfeile.push(pf);
          Netz.pfeilSenden(pf, false);           // Mitspieler prüfen selbst, ob sie getroffen werden
          Sfx.wesen(m, 'feuer'); m.feuerT = 0.5;
        }
        m.schussCd = 3 + Math.random()*1.5;
      }
    } else m.yaw = Math.atan2(-fx, -fz);
    if(Math.random() < 0.003) Sfx.wesen(m, 'laut');
    return [fx/fl, fz/fl, m.def.speed];
  },
  /** Lohe: schwebt ein, zwei Blöcke über dem Boden (oder über dem Spieler),
      hält etwas Abstand und schießt Salven aus drei kleinen Feuerkugeln */
  loheDenken(m, dt, z, dist, dx, dz){
    const w = this.world, bx = Math.floor(m.x), bz = Math.floor(m.z);
    let boden = Math.floor(m.y);
    for(let k = 0; k < 12 && boden > 1 && !blocksMovement(w.getBlock(bx, boden - 1, bz)); k++) boden--;
    let zielY = boden + 1.2 + Math.sin(m.age*0.8)*0.6, tx = 0, tz = 0;
    m.moving = false;
    if(z && dist < 32){
      const sicht = this.freieSicht(m.x, m.y + 1.5, m.z, z.x, z.y + 1.4, z.z), l = dist || 1;
      m.yaw = Math.atan2(-dx, -dz);
      zielY = Math.max(zielY, z.y + 1.2);
      if(dist > 9 || !sicht){ tx = dx/l; tz = dz/l; m.moving = true; }
      else if(dist < 3.5){ tx = -dx/l; tz = -dz/l; m.moving = true; }
      // wer sie berührt, verbrennt sich
      if(dist < 1.3 && Math.abs(z.y - m.y) < 1.8 && m.attackCd <= 0){
        if(z.ich){ if(this.player.hurt(m.def.dmg, m.def.treffer, dx/l, dz/l)){ this.hurtFlash = 1; Sfx.play('hurt'); } }
        else Netz.autsch(z.g, m.def.dmg, m.def.treffer, dx/l, dz/l);
        m.attackCd = 1.1;
      }
      m.schussCd = (m.schussCd === undefined ? 1.5 : m.schussCd) - dt;
      if(m.schussCd <= 0){
        if(sicht && dist < 24){
          if(!m.salve) m.salve = 3;
          const ax = m.x, ay = m.y + 1.4, az = m.z, zx = z.x + (Math.random() - .5)*1.2, zy = z.y + 1.1, zz = z.z + (Math.random() - .5)*1.2;
          const ll = Math.hypot(zx - ax, zy - ay, zz - az) || 1, v = 13, ux = (zx - ax)/ll, uy = (zy - ay)/ll, uz = (zz - az)/ll;
          const pf = new Pfeil(ax + ux*0.7, ay + uy*0.7, az + uz*0.7, ux*v, uy*v, uz*v, 5, false, false, true);
          pf.klein = true;
          this.pfeile.push(pf);
          Netz.pfeilSenden(pf, false);
          Sfx.wesen(m, 'feuer');
          m.salve--;
          m.schussCd = m.salve > 0 ? 0.3 : 3 + Math.random()*2;
        } else m.schussCd = 0.5;
      }
    } else {
      m.wander = (m.wander || 0) - dt;
      if(m.wander <= 0){ m.wander = 3 + Math.random()*4; m.wanderYaw = Math.random() < 0.6 ? Math.random()*TAU : null; }
      if(m.wanderYaw !== null && m.wanderYaw !== undefined){ m.yaw = m.wanderYaw; tx = -Math.sin(m.yaw)*0.5; tz = -Math.cos(m.yaw)*0.5; m.moving = true; }
    }
    m.vy += clamp(zielY - m.y, -2, 2)*2*dt;
    if(Math.random() < 0.004) Sfx.wesen(m, 'laut');
    return [tx, tz, m.def.speed];
  },
  /** Enderman: wer ihm in die Augen schaut, macht ihn wütend; Wasser tut ihm
      weh; wütend springt er dem Spieler hinterher, sonst ab und zu irgendwohin */
  enderDenken(m, dt, opfer, od, leute){
    const w = this.world;
    if(m.wut > 0){ m.wut -= dt; if(m.wut <= 0) m.wut = 0; }
    m.teleCd = (m.teleCd || 0) - dt;
    if(imWasser(w, m)){
      m.health -= dt*2; m.hurtTimer = 0.2;
      if(m.health <= 0){ m.dead = true; return; }
      if(m.teleCd <= 0) this.enderSpringen(m);
    }
    for(const q of leute){
      if(q.dead || q.creative || m.wut > 0) continue;
      const ex = q.x, ey = q.y + 1.62, ez = q.z, kx = m.x, ky = m.y + m.h - 0.25, kz = m.z;
      const dx = kx - ex, dy = ky - ey, dz = kz - ez, d = Math.hypot(dx, dy, dz);
      if(d > 64 || d < 0.5) continue;
      const cp = Math.cos(q.pitch || 0), f = [-Math.sin(q.yaw || 0)*cp, Math.sin(q.pitch || 0), -Math.cos(q.yaw || 0)*cp];
      const dot = (dx*f[0] + dy*f[1] + dz*f[2])/d;
      // beim Vorbild 1 − 0,025/d — hier etwas großzügiger, man zielt auch mit dem Finger
      if(dot > 1 - 0.05/d && this.freieSicht(ex, ey, ez, kx, ky, kz)) this.enderWuetend(m);
    }
    if(m.wut > 0 && opfer && od > 14 && m.teleCd <= 0 && Math.random() < dt*0.8) this.enderSpringen(m, opfer);
    else if(!(m.wut > 0) && m.teleCd <= 0 && Math.random() < dt/45) this.enderSpringen(m);
  },
  enderWuetend(m){
    if(!(m.wut > 0)) Sfx.wesen(m, 'schrei');
    m.wut = 30;
  },
  /** Enderman springt: irgendwohin in der Nähe (bis 32 weit), oder nah an ein Ziel */
  enderSpringen(m, ziel){
    const w = this.world;
    for(let v = 0; v < 24; v++){
      const r = ziel ? 5 : 32, ox = ziel ? ziel.x : m.x, oy = ziel ? ziel.y : m.y, oz = ziel ? ziel.z : m.z;
      const x = Math.floor(ox + (Math.random() - .5)*2*r), z = Math.floor(oz + (Math.random() - .5)*2*r);
      const c = w.chunks.get(ckey(x >> 4, z >> 4));
      if(!c || c.state < 1) continue;
      let y = Math.min(WH - 4, Math.floor(oy + (Math.random() - .5)*(ziel ? 6 : 24)));
      for(let k = 0; k < 24 && y > 1 && !blocksMovement(w.getBlock(x, y - 1, z)); k++) y--;
      const g = w.getBlock(x, y - 1, z);
      if(!blocksMovement(g) || isWasser(g) || g === B.LAVA) continue;
      let frei = true;
      for(let k = 0; k < 3 && frei; k++){ const b = w.getBlock(x, y + k, z); if(blocksMovement(b) || isWasser(b) || b === B.LAVA) frei = false; }
      if(!frei) continue;
      this.portalFunken(m.x, m.y + 1.4, m.z, 14);
      Sfx.wesen(m, 'tele');
      m.x = x + 0.5; m.y = y; m.z = z + 0.5; m.vx = m.vy = m.vz = 0;
      this.portalFunken(m.x, m.y + 1.4, m.z, 14);
      Sfx.wesen(m, 'tele');
      m.teleCd = 1 + Math.random();
      return true;
    }
    m.teleCd = 0.5;
    return false;
  },
  /** im Nether ein freier Platz auf festem Boden, von y0 abwärts, hoch Blöcke hoch; sonst −1 */
  netherBoden(x, y0, z, hoch){
    const w = this.world;
    for(let y = y0; y > NETHER_LAVA; y--){
      if(blocksMovement(w.getBlock(x, y, z))) continue;
      const g = w.getBlock(x, y - 1, z);
      if(!blocksMovement(g)) continue;
      for(let k = 0; k < hoch; k++){ const b = w.getBlock(x, y + k, z); if(blocksMovement(b) || b === B.LAVA) return -1; }
      return y;
    }
    return -1;
  },
  /** Nether: Ghasts schweben in weiten Höhlen, Witherskelette sind im Ödland
      unterwegs, Lohen nur in den Festungen; im Wirrwald gibt es nur Endermen, dafür viele */
  netherSpawnen(dt){
    this.mobTimer -= dt;
    if(this.mobTimer > 0) return;
    this.mobTimer = 2;
    const leute = this.spielerOrte().filter(q => !q.creative && !q.dead), w = this.world;
    if(!leute.length) return;
    const p = leute[(Math.random()*leute.length) | 0];
    const zahl = {};
    for(const m of this.mobs) if(Math.hypot(m.x - p.x, m.z - p.z) < 64) zahl[m.type] = (zahl[m.type] || 0) + 1;
    const neu = (art, x, y, z) => { this.mobs.push(new Mob(art, x + 0.5, y, z + 0.5)); return true; };
    // Lohen gibt es nur in den Festungen: aus dem Spawner, wenn jemand in der Nähe ist
    this._spawnerT = this._spawnerT || new Map();
    for(const q of leute) for(const f of festungenBei(w, q.x - 20, q.z - 20, q.x + 20, q.z + 20)) for(const [sx, sy, sz] of f.spawner){
      if(Math.hypot(sx - q.x, sy - q.y, sz - q.z) > 18 || w.getBlock(sx, sy, sz) !== B.SPAWNER) continue;
      const k = sx + ',' + sy + ',' + sz, t = (this._spawnerT.get(k) || 0) - 2;
      this._spawnerT.set(k, t);
      if(t > 0) continue;
      this._spawnerT.set(k, 8 + Math.random()*12);
      if(this.mobs.filter(m => m.type === 'blaze' && Math.hypot(m.x - sx, m.z - sz) < 12).length >= 4) continue;
      for(let n = 1 + ((Math.random()*2) | 0), v = 0; n > 0 && v < 12; v++){
        const x = sx + ((Math.random()*7) | 0) - 3, y = sy + ((Math.random()*2) | 0) - 1, z = sz + ((Math.random()*7) | 0) - 3;
        if(blocksMovement(w.getBlock(x, y, z)) || blocksMovement(w.getBlock(x, y + 1, z)) || w.getBlock(x, y, z) === B.SPAWNER) continue;
        neu('blaze', x, y, z); this.portalFunken(x + 0.5, y + 1, z + 0.5, 8); n--;
      }
    }
    for(let a = 0; a < 10; a++){
      const ang = Math.random()*TAU, r = 18 + Math.random()*26;
      const x = Math.floor(p.x + Math.cos(ang)*r), z = Math.floor(p.z + Math.sin(ang)*r), y0 = Math.floor(p.y) + ((Math.random()*24) | 0) - 12;
      const c = w.chunks.get(ckey(x >> 4, z >> 4));
      if(!c || c.state < 1 || y0 < NETHER_LAVA + 1 || y0 > WH - 8) continue;
      if(w.biomeAt(x, z) === BIO.WIRRWALD){
        if((zahl.enderman || 0) >= 8) continue;
        const y = this.netherBoden(x, y0, z, 3);
        if(y > 0 && neu('enderman', x, y, z)) break;
        continue;
      }
      // auf dem Grund einer Festung: Lohen und Witherskelette, wie beim Vorbild
      if(festungBei(w, x, z)){
        const y = this.netherBoden(x, y0, z, 3);
        if(y < 0) continue;
        if(Math.random() < 0.35 && (zahl.blaze || 0) < 6 && neu('blaze', x, y + 0.5, z)) break;
        if((zahl.wither || 0) < 5 && neu('wither', x, y, z)) break;
        continue;
      }
      const wurf = Math.random();
      if(wurf < 0.3 && (zahl.ghast || 0) < 2){
        // ein Ghast braucht Platz: fünf mal fünf mal fünf frei
        let frei = true;
        for(let k = 0; k < 27 && frei; k++){ const i = (k % 3) - 1, j = ((k/3) | 0) % 3 - 1, l = ((k/9) | 0) - 1; if(w.getBlock(x + i*2, y0 + 2 + j*2, z + l*2) !== B.AIR) frei = false; }
        // und darunter Platz für die Tentakel
        for(let dy = 1; dy <= 5 && frei; dy++) if(w.getBlock(x, y0 - dy, z) !== B.AIR) frei = false;
        if(frei && neu('ghast', x, y0, z)) break;
      } else if((zahl.wither || 0) < 3){
        const y = this.netherBoden(x, y0, z, 3);
        if(y > 0 && neu('wither', x, y, z)) break;
      }
    }
  },
  /** Schleime erscheinen wie beim Vorbild tief unten (unter Höhe 40) in
      Schleim-Chunks — jedem zehnten Chunk einer Welt. Sümpfe gibt es hier
      nicht; dafür nur, wo kein Himmel zu sehen ist: in Höhlen und unter Dächern. */
  schleimeSpawnen(p){
    const w = this.world;
    for(let a = 0; a < 3; a++){
      const ang = Math.random()*TAU, r = 12 + Math.random()*24;
      const x = Math.floor(p.x + Math.cos(ang)*r), z = Math.floor(p.z + Math.sin(ang)*r);
      if(!schleimChunk(w, x >> 4, z >> 4)) continue;
      const ch = w.chunks.get(ckey(x >> 4, z >> 4));
      if(!ch || ch.state < 2) continue;
      // eine Höhe nahe beim Spieler, von dort abwärts den Boden suchen
      let y = Math.min(SCHLEIM_HOEHE, Math.floor(p.y) + ((Math.random()*16)|0) - 8);
      for(let k = 0; k < 16 && y > 1; k++, y--){
        const unten = w.getBlock(x, y - 1, z);
        if(!blocksMovement(unten) || isWasser(unten)) continue;
        if(blocksMovement(w.getBlock(x, y, z)) || blocksMovement(w.getBlock(x, y + 1, z)) || isWasser(w.getBlock(x, y, z))) break;
        if((w.getLight(x, y, z) & 15) >= 8) break;          // unter freiem Himmel nicht
        const g = [1, 2, 4][(Math.random()*3) | 0];
        const m = schleimGroesse(new Mob('slime', x + 0.5, y, z + 0.5), g);
        if(this.frei(m)) this.mobs.push(m);
        break;
      }
    }
  },
  /** hat ein Wesen an seinem Platz genug Luft? */
  frei(e){
    const w = this.world, hw = e.w/2;
    for(let y = Math.floor(e.y); y <= Math.floor(e.y + e.h - 0.01); y++)
      for(let z = Math.floor(e.z - hw); z <= Math.floor(e.z + hw); z++)
        for(let x = Math.floor(e.x - hw); x <= Math.floor(e.x + hw); x++)
          if(blocksMovement(w.getBlock(x, y, z)) || isWasser(w.getBlock(x, y, z))) return false;
    return true;
  },
  /** Schleime hüpfen, statt zu gehen: am Boden sammeln sie sich kurz, dann
      springen sie — auf den nächsten Spieler zu, wenn einer nah ist, sonst
      irgendwohin. Wer einen mittleren oder großen berührt, nimmt Schaden;
      die kleinen tun nichts. Gibt [Richtung x, Richtung z, Tempo] zurück. */
  schleimDenken(m, dt, opfer, od){
    const g = m.groesse;
    m.hopT -= dt;
    const jagt = !!opfer && od < 16 && Math.abs(opfer.y - m.y) < 8;
    if(m.onGround){
      if(m.imFlug){ m.imFlug = false; m.moving = false; }
      if(jagt) m.yaw = Math.atan2(-(opfer.x - m.x), -(opfer.z - m.z));
      if(m.hopT <= 0){
        m.hopT = jagt ? 0.5 + Math.random()*0.7 : 1.2 + Math.random()*2.5;
        if(jagt || Math.random() < 0.7){
          if(!jagt) m.yaw = Math.random()*TAU;
          m.vy = MOB_SPRUNG*(g === 1 ? 0.85 : 1); m.imFlug = true; m.moving = true;
        }
      }
    }
    if(jagt && g > 1 && m.attackCd <= 0){
      const rw = m.w/2 + 0.35, dx = opfer.x - m.x, dz = opfer.z - m.z;
      if(Math.abs(dx) < rw && Math.abs(dz) < rw && opfer.y < m.y + m.h && opfer.y + 1.8 > m.y){
        const l = Math.hypot(dx, dz) || 1, dmg = g === 4 ? 4 : 2;
        if(opfer.ich){
          if(this.player.hurt(dmg, 'Ein Schleim hat dich erwischt', dx/l, dz/l)){ this.hurtFlash = 1; Sfx.play('hurt'); }
        } else Netz.autsch(opfer.g, dmg, 'Ein Schleim hat dich erwischt', dx/l, dz/l);
        m.attackCd = 1;
      }
    }
    if(!m.imFlug) return [0, 0, 0];
    return [-Math.sin(m.yaw), -Math.cos(m.yaw), 1.3 + 0.45*g];
  },
  /** ein großer Schleim zerfällt in zwei bis vier halb so große */
  schleimTeilen(m){
    const g = m.groesse/2, n = 2 + ((Math.random()*3) | 0);
    for(let i = 0; i < n; i++){
      const a = Math.random()*TAU, r = g*0.25;
      const k = schleimGroesse(new Mob('slime', m.x + Math.cos(a)*r, m.y + 0.1, m.z + Math.sin(a)*r), g);
      k.vx = Math.cos(a)*2; k.vz = Math.sin(a)*2; k.vy = 4; k.yaw = Math.random()*TAU; k.hopT = 0.5 + Math.random();
      this.mobs.push(k);
    }
  },
  partnerFuer(m){
    let best = null, bd = 8;
    for(const o of this.mobs){
      if(o === m || o.type !== m.type || o.dead || o.kind > 0 || o.liebe <= 0) continue;
      const d = Math.hypot(o.x - m.x, o.z - m.z);
      if(d < bd){ bd = d; best = o; }
    }
    return best;
  },
  elternFuer(m){
    let best = null, bd = 16;
    for(const o of this.mobs){
      if(o === m || o.type !== m.type || o.dead || o.kind > 0) continue;
      const d = Math.hypot(o.x - m.x, o.z - m.z);
      if(d < bd){ bd = d; best = o; }
    }
    return best;
  },
  /** Wesen, die ineinander stehen, drücken sich sanft auseinander (wie in
      Minecraft) — sonst steckt ein Kalb halb in seinen Eltern. */
  wesenSchieben(dt){
    const ms = this.mobs, n = ms.length;
    for(let i = 0; i < n; i++){
      const a = ms[i]; if(a.dead) continue;
      for(let j = i + 1; j < n; j++){
        const b = ms[j]; if(b.dead) continue;
        const min = (a.w + b.w)/2, dx = b.x - a.x, dz = b.z - a.z;
        if(Math.abs(dx) >= min || Math.abs(dz) >= min) continue;
        if(a.y >= b.y + b.h || b.y >= a.y + a.h) continue;
        let d = Math.hypot(dx, dz), ux = dx/(d || 1), uz = dz/(d || 1);
        if(d < 1e-4){ const r = Math.random()*TAU; ux = Math.cos(r); uz = Math.sin(r); }
        if(d >= min) continue;
        const k = (min - d)/min * 14 * dt, ga = b.w/(a.w + b.w);   // Kleine weichen mehr aus
        a.vx -= ux*k*ga*2; a.vz -= uz*k*ga*2;
        b.vx += ux*k*(1-ga)*2; b.vz += uz*k*(1-ga)*2;
      }
    }
  },
  updateMobs(dt){
    const p = this.player, w = this.world, dl = this.dayLight();
    // weiter als acht Chunks rechnet kein Wesen: bei großer Sichtweite sammelten sich sonst ferne Monster
    const far = (Math.min(this.settings.rd, 8)*CS) + 30;
    const leute = this.spielerOrte();
    if(!leute.length) return;
    this.wesenSchieben(dt);
    for(let i=this.mobs.length-1; i>=0; i--){
      const m = this.mobs[i];
      // Ziel ist der nächste Spieler; Monster suchen sich den nächsten, den sie angreifen können
      let naechst = leute[0], nd = Infinity, opfer = null, od = Infinity;
      for(const q of leute){
        const d = Math.hypot(q.x - m.x, q.z - m.z);
        if(d < nd){ nd = d; naechst = q; }
        if(!q.dead && !q.creative && d < od){ od = d; opfer = q; }
      }
      const z = (m.def.hostile && opfer) ? opfer : naechst;
      const dx = z.x-m.x, dz = z.z-m.z;
      const dist = Math.hypot(dx,dz);
      const hoerbar = Math.hypot(p.x - m.x, p.z - m.z) < 24;
      if(m.dead || (nd > far && !m.bleibt) || m.y < -4){
        if(m.dead) Sfx.wesen(m, 'tot');
        if(m.dead && m.dorfKey) (this._dorfRuhe || (this._dorfRuhe = new Map())).set(m.dorfKey + '#' + m.dorfSlot, this.gesamtZeit + 300);
        if(m.dead && m.golemDorf) (this._dorfRuhe || (this._dorfRuhe = new Map())).set(m.golemDorf + '#golem', this.gesamtZeit + 300);
        this.mobs.splice(i,1); continue;
      }
      // Bleibende Tiere in ungeladenen Chunks warten, statt ins Nichts zu fallen
      if(m.bleibt){ const c = w.getChunk(Math.floor(m.x) >> 4, Math.floor(m.z) >> 4); if(!c || c.state < 1 || nd > far) continue; }
      m.age += dt;
      if(m.kind > 0){
        m.kind -= dt;
        if(m.kind <= 0){ m.kind = 0; m.w = m.def.w; m.h = m.def.h; }
      }
      if(m.pause > 0) m.pause -= dt;
      if(m.liebe > 0){
        m.liebe -= dt; m.herzT -= dt;
        if(m.herzT <= 0){ m.herzT = 0.7 + Math.random()*0.4; this.herz(m); }
      }
      if(m.hurtTimer > 0) m.hurtTimer -= dt;
      if(m.trefferT > 0) m.trefferT -= dt;
      if(m.attackCd > 0) m.attackCd -= dt;
      if(m.jumpCd > 0) m.jumpCd -= dt;
      if(m.def.statisch) continue;                                  // Endkristall: steht und dreht sich nur
      if(m.def.drache){ this.drachenDenken(m, dt, leute); continue; }

      let tx = 0, tz = 0, speed = m.def.speed, partner = null, eltern = null;
      if(m.def.neutral) this.enderDenken(m, dt, opfer, od, leute);
      const jagt = m.def.hostile && !!opfer && (m.def.neutral ? m.wut > 0 && dist < 48 : dist < 22);
      const heldId = z.held;
      if(m.def.schleim){
        [tx, tz, speed] = this.schleimDenken(m, dt, opfer, od);
      } else if(m.def.golem){
        [tx, tz, speed] = this.golemDenken(m, dt, leute, speed, hoerbar);
      } else if(m.def.lohe){
        [tx, tz, speed] = this.loheDenken(m, dt, opfer ? z : null, dist, dx, dz);
      } else if(m.def.schwebt){
        [tx, tz, speed] = this.ghastDenken(m, dt, opfer ? z : null, dist, dx, dz);
      } else if(jagt && m.def.fernkampf){
        // Skelett: Abstand halten, seitlich ausweichen, schießen, wenn es freie Sicht hat
        const l = dist || 1, ux = dx/l, uz = dz/l;
        m.yaw = Math.atan2(-ux, -uz);
        m.seiteT -= dt; if(m.seiteT <= 0){ m.seiteT = 1.5 + Math.random()*2; m.seite = -m.seite; }
        const vor = dist > 11 ? 1 : (dist < 6 ? -1 : 0);
        tx = ux*vor + (-uz)*m.seite*0.6; tz = uz*vor + ux*m.seite*0.6;
        m.moving = true; speed *= vor < 0 ? 0.9 : 0.75;
        m.schussCd -= dt;
        if(m.schussCd <= 0 && dist < 16){
          const ax = m.x, ay = m.y + 1.5, az = m.z, zx = z.x, zy = z.y + 1.3, zz = z.z;
          if(this.freieSicht(ax, ay, az, zx, zy, zz)){
            const v = 18, flug = Math.hypot(zx-ax, zz-az)/v;
            const ungenau = () => (Math.random() - .5)*0.9;
            const vy = (zy - ay)/Math.max(flug, .1) + 0.5*20*flug;       // Fallen ausgleichen
            const hl = Math.hypot(zx-ax, zz-az) || 1;
            const pf = new Pfeil(ax + ux*.5, ay, az + uz*.5, (zx-ax)/hl*v + ungenau(), vy + ungenau()*.5, (zz-az)/hl*v + ungenau(), 2 + ((Math.random()*3)|0), false);
            this.pfeile.push(pf);
            Netz.pfeilSenden(pf, false);           // jeder Mitspieler prüft selbst, ob er getroffen wird
            Sfx.play('bogen', m.x, m.y + 1.5, m.z);
            m.schussCd = 1.8 + Math.random()*1.2;
          } else m.schussCd = 0.4;
        }
        if(Math.random() < 0.004) Sfx.wesen(m, 'laut');
      } else if(jagt){
        const l = dist || 1; tx = dx/l; tz = dz/l;
        m.yaw = Math.atan2(-tx, -tz);
        m.moving = true;
        if(dist < 1.5 && Math.abs(z.y - m.y) < 2 && m.attackCd <= 0){
          if(z.ich){
            // der Stoß geht vom Zombie weg (früher zog er einen zu sich heran)
            if(p.hurt(m.def.dmg, m.def.treffer || 'Ein Zombie hat dich erwischt', tx, tz)){ m.attackCd = 1.1; this.hurtFlash = 1; Sfx.play('hurt'); }
          } else { Netz.autsch(z.g, m.def.dmg, m.def.treffer || 'Ein Zombie hat dich erwischt', tx, tz); m.attackCd = 1.1; }
        }
        if(Math.random() < 0.004) Sfx.wesen(m, 'laut');
      } else if(!m.def.hostile && m.flucht > 0){
        // getroffen: ein paar Sekunden weg vom Spieler
        m.flucht -= dt;
        tx = m.fluchtX; tz = m.fluchtZ; m.yaw = Math.atan2(-tx, -tz); m.moving = true; speed *= 1.6;
      } else if(!m.def.hostile && m.liebe > 0 && (partner = this.partnerFuer(m))){
        // verliebt: zum Partner laufen; nah genug, gibt es ein Junges
        const ex = partner.x - m.x, ez = partner.z - m.z, d = Math.hypot(ex, ez) || 1;
        if(d < 1.3){ if(m.liebe > 0 && partner.liebe > 0) this.geburt(m, partner); }
        else { tx = ex/d; tz = ez/d; m.yaw = Math.atan2(-tx, -tz); m.moving = true; speed *= 0.9; }
      } else if(!m.def.hostile && m.kind > 0 && (eltern = this.elternFuer(m))){
        // Junge bleiben in der Nähe der Großen
        const ex = eltern.x - m.x, ez = eltern.z - m.z, d = Math.hypot(ex, ez) || 1;
        if(d > 3){ tx = ex/d; tz = ez/d; m.yaw = Math.atan2(-tx, -tz); m.moving = true; speed *= 1.1; }
        else { m.moving = false; }
      } else if(!m.def.hostile && heldId === futterVon(m) && dist < 10 && dist > 2.2 && !z.dead){
        // Futter in der Hand: Kühe, Schafe und Schweine laufen dem Weizen hinterher, Hühner den Körnern
        const l = dist || 1; tx = dx/l; tz = dz/l;
        m.yaw = Math.atan2(-tx, -tz); m.moving = true; speed *= 0.8;
      } else if(m.def.dorf){
        [tx, tz, speed] = this.dorfDenken(m, dt, z, dx, dz, dist, dl, speed, hoerbar);
      } else {
        m.wander -= dt;
        if(m.wander <= 0){
          m.wander = 2 + Math.random()*4;
          m.moving = Math.random() < 0.65;
          m.wanderYaw = Math.random()*TAU;
        }
        if(m.moving){ m.yaw = m.wanderYaw; tx = -Math.sin(m.yaw); tz = -Math.cos(m.yaw); speed *= 0.55; }
        if(!m.def.hostile && hoerbar && Math.random() < 0.0012) Sfx.wesen(m, 'laut');
        if(!m.def.hostile && heldId === futterVon(m) && dist <= 2.2){ m.yaw = Math.atan2(dx, dz) + Math.PI; m.moving = false; tx = tz = 0; }
      }
      // Hühner legen ab und zu ein Ei — es landet bei dem Spieler, der am nächsten ist
      if(m.eiT !== undefined && !(m.kind > 0)){
        m.eiT -= dt;
        if(m.eiT <= 0){
          m.eiT = 300 + Math.random()*300;
          this.dropItem(ITEM.egg, 1, m.x, m.y + 0.3, m.z);
          if(hoerbar) Sfx.play('ei_legen', m.x, m.y + 0.3, m.z);
        }
      }
      // geschorene Schafe fressen Gras, dann wächst die Wolle nach
      if(m.geschoren){
        m.wolleT -= dt;
        if(m.wolleT <= 0){
          const bx = Math.floor(m.x), by = Math.floor(m.y) - 1, bz = Math.floor(m.z);
          if(w.getBlock(bx, by, bz) === B.GRASS){ w.setBlock(bx, by, bz, B.DIRT); m.geschoren = false; }
          else m.wolleT = 5;
        }
      }

      // Physik — in Lava treiben sie wie im Wasser und verbrennen
      const inL = imLava(w, m);
      if(!inL && !m.def.feuerfest && !m.def.golem && imFeuer(w, m)){ m.health -= dt*2; m.hurtTimer = 0.2; if(m.health <= 0) m.dead = true; }
      if(inL && !m.def.golem && !m.def.feuerfest){ m.health -= dt*8; m.hurtTimer = 0.2; if(m.health <= 0) m.dead = true; }
      const inW = imWasser(w, m) || inL;
      if(inW){ const zug = this.stroemungBei(m); m.vx += zug[0]*5*dt; m.vz += zug[2]*5*dt; }
      if(m.def.schwebt) m.vy *= Math.pow(0.3, dt);                // Ghast: keine Schwere, er steuert seine Höhe selbst
      else m.vy -= GRAV*dt*(inW ? 0.35 : 1);
      if(inW && !m.def.schwebt){ m.vy = Math.max(m.vy, -3); if(m.vy < 1.2) m.vy += 9*dt; }
      if(m.def.flattert && m.vy < -2.4) m.vy = -2.4;            // Hühner flattern: sie fallen langsam
      m.vy = Math.max(m.vy, -TERMINAL);
      const res = moveAABB(w, m, (tx*speed + m.vx)*dt, m.vy*dt, (tz*speed + m.vz)*dt);
      // gegen eine Stufe gelaufen: hochspringen — so hoch, dass ein ganzer Block reicht
      if((res.bx || res.bz) && m.onGround && m.jumpCd <= 0 && !m.def.schwebt){ m.vy = MOB_SPRUNG; m.jumpCd = 0.5; }
      if(m.def.schwebt && (res.bx || res.bz)) m.flugT = 0;          // gegen eine Wand geschwebt: ein neues Ziel
      if(m.def.schleim) schleimQuetschen(m, dt);
      m.vx *= Math.pow(0.02, dt); m.vz *= Math.pow(0.02, dt);
      if(m.moving || tx || tz) m.walkPhase += dt*speed*3.2;

      // Sonnenbrand — nicht bei Regen, da ist der Tag zu trüb
      if(m.def.hostile && !m.def.feuerfest && !m.def.sonnenfest && dl > 0.6 && Wetter.staerke < 0.5 && this.dim === 'oben'){
        const lv = w.getLight(Math.floor(m.x), Math.floor(m.y+m.h), Math.floor(m.z));
        if((lv & 15) >= 14){ m.health -= dt*3.2; m.hurtTimer = 0.2; if(m.health <= 0) m.dead = true; }
      }
    }
  },
  updateDrops(dt){
    const p = this.player, w = this.world;
    if(Netz.istGast){ Netz.dropsNachziehen(dt); return; }      // beim Gast liegen sie, wie der Host sie schickt
    for(let i=this.drops.length-1; i>=0; i--){
      const d = this.drops[i];
      d.age += dt; d.pickDelay -= dt;
      if(d.age > 300){ this.drops.splice(i,1); continue; }
      if(imLava(w, d)){ this.drops.splice(i,1); Sfx.play('kaputt', d.x, d.y, d.z); continue; }     // in Lava verbrannt
      d.vy -= GRAV*dt;
      const inW = imWasser(w, d);
      if(inW){ d.vy = Math.max(d.vy, -1.6); if(d.vy < 1) d.vy += 7*dt;
        const zug = this.stroemungBei(d); d.vx += zug[0]*1.4*dt; d.vz += zug[2]*1.4*dt; }
      moveAABB(w, d, d.vx*dt, d.vy*dt, d.vz*dt);
      if(d.onGround){ d.vx *= Math.pow(0.005, dt); d.vz *= Math.pow(0.005, dt); }
      else { d.vx *= Math.pow(0.5, dt); d.vz *= Math.pow(0.5, dt); }
      const dx = p.x-d.x, dy = (p.y+0.9)-(d.y+0.14), dz = p.z-d.z;
      const dd = Math.hypot(dx,dy,dz);
      if(d.pickDelay <= 0 && dd < 1.6 && !this._fremd && !p.dead){
        if(dd > 0.5){ const s = 9*dt/dd; d.x += dx*s; d.y += dy*s; d.z += dz*s; }
        else {
          const r = Inv.addStack(Inv.make(d.id, d.count, d.dur || undefined)), rest = r ? r.n : 0;
          if(rest === 0){ this.drops.splice(i,1); Sfx.play('pickup'); HUD.refreshHotbar(); if(Screens.open) Screens.render(); }
          else d.count = rest;
        }
      }
    }
  },

  /** Strömung, die an einem Körper zieht: an den Füßen und in der Mitte */
  stroemungBei(e){
    const x = Math.floor(e.x), z = Math.floor(e.z);
    const a = this.wasser.zug(x, Math.floor(e.y + 0.05), z), b = this.wasser.zug(x, Math.floor(e.y + e.h*0.5), z);
    return [a[0] + b[0], 0, a[2] + b[2]];
  },

  /* ── Spieler ─────────────────────────────────────────────────────── */
  updatePlayer(dt, input){
    const p = this.player, w = this.world;
    if(p.dead) return;
    if(p.hurtTimer > 0) p.hurtTimer -= dt;
    if(p.trefferT > 0) p.trefferT -= dt;
    // Netherportal: wer drin steht, wechselt nach einer Weile die Welt (im Kreativmodus gleich);
    // wer gerade angekommen ist, muss erst einmal heraustreten
    {
      const q = this.imPortal(p);
      if(!q) p.portalSperre = false;
      p.portalT = q && !p.portalSperre ? (p.portalT || 0) + dt : 0;
      if(p.portalT > (p.creative ? 0.5 : 3)) this.portalReise(q);
      this._portalPruefT = (this._portalPruefT || 0) - dt;
      if(this._portalPruefT <= 0){ this._portalPruefT = 1; this.portalePruefen(); }
    }
    this.angriffT += dt;                                      // Abklingzeit des Schlags (angriffLadung)
    const hid = Inv.held() ? Inv.held().id : 0;
    if(hid !== this._angriffId){ this._angriffId = hid; this.angriffT = 0; }   // Waffe gewechselt: neu aufladen
    if(this.bett){ this.imBett(input); return; }

    const feetId = w.getBlock(Math.floor(p.x), Math.floor(p.y+0.1), Math.floor(p.z));
    const warImWasser = p.inWater;
    p.inLava = imLava(w, p);
    p.inWater = imWasser(w, p) || p.inLava;                     // Lava ist zäh: man schwimmt darin wie im Wasser, nur langsamer
    if(p.inWater && !warImWasser && p.vy < -5) Sfx.play('platsch');
    if(p.inLava && !p.creative && p.hurt(4, 'Du bist in Lava gefallen')){ this.hurtFlash = 1; Sfx.play('hurt'); }
    if(!p.inLava && !p.creative && imFeuer(w, p) && p.hurt(1, 'Du bist verbrannt')){ this.hurtFlash = 1; Sfx.play('hurt'); }
    if(this.dim === 'ende') this.endAnkunft(dt);
    this.herausdruecken(w, p);
    // Endportal: wer hineintritt, ist sofort drüben (wie beim Vorbild, ohne Warten)
    {
      const im = w.getBlock(Math.floor(p.x), Math.floor(p.y + 0.1), Math.floor(p.z)) === B.ENDPORTAL;
      if(im && !p.endSperre && !p.dead){ this.endReise(); return; }
      if(!im) p.endSperre = false;
    }
    p.headInLava = w.getBlock(Math.floor(p.x), Math.floor(p.eyeY()), Math.floor(p.z)) === B.LAVA;
    {
      const ey = p.eyeY(), ky = Math.floor(ey), kopf = w.getBlock(Math.floor(p.x), ky, Math.floor(p.z));
      p.headInWater = isWasser(kopf) && (kopf === B.WATER || kopf === B.FALL || ey - ky < wasserMenge(kopf)/9 ||
        isWasser(w.getBlock(Math.floor(p.x), ky + 1, Math.floor(p.z))));
    }
    // fließendes Wasser nimmt einen mit
    if(p.inWater && !(p.creative && p.flying)){ const zug = this.stroemungBei(p); p.vx += zug[0]*5*dt; p.vz += zug[2]*5*dt; }

    // Bewegung
    let mx = input.mx, mz = input.mz;
    const len = Math.hypot(mx,mz);
    if(len > 1){ mx /= len; mz /= len; }
    // Blickrichtung ist (-sin yaw, -cos yaw), rechts davon (cos yaw, -sin yaw);
    // mz ist negativ für vorwärts, also: Bewegung = -mz*vorn + mx*rechts.
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    let wx = mx*cy + mz*sy, wz = mz*cy - mx*sy;
    p.sneaking = input.sneak && p.onGround;

    let speed = p.sneaking ? 1.45 : (input.sprint ? 5.7 : 4.35);
    if(p.inLava) speed *= 0.45;
    if(p.inWater) speed *= 0.62;
    if(p.food <= 0) speed *= 0.7;
    p.stepUp = this.settings.autojump && !p.sneaking;
    if(p.stufeGlatt) p.stufeGlatt = Math.min(0, p.stufeGlatt + dt*3.2);

    if(p.creative && p.flying){
      p.vy = 0;
      const fly = input.jump ? 7 : (input.sneak ? -7 : 0);
      moveAABB(w, p, wx*speed*1.9*dt, fly*dt, wz*speed*1.9*dt);
    } else {
      if(p.inWater){
        p.vy -= GRAV*0.34*dt;
        if(input.jump) p.vy = Math.min(p.vy + 26*dt, 3.1);
        p.vy = Math.max(p.vy, -3.2);
      } else {
        p.vy -= GRAV*dt;
        if(input.jump && p.onGround){ p.vy = 8.6; p.addExhaustion(0.05); }
      }
      p.vy = clamp(p.vy, -TERMINAL, 30);
      // Sturzhöhe verfolgen
      if(!p.onGround && p.vy < 0 && p.fallFrom === null) p.fallFrom = p.y;
      if(p.vy > 0) p.fallFrom = null;

      // Leiter: gegen die Wand laufen oder springen klettert, ducken hält fest
      if(inBlockOfType(w, p, isLadder)){
        p.fallFrom = null;
        if(input.jump || this._gegenWand) p.vy = 3.2;
        else if(input.sneak) p.vy = 0;
        else p.vy = Math.max(p.vy, -2.4);
      }

      const wasAir = !p.onGround;
      const res = moveAABB(w, p, (wx*speed + p.vx)*dt, p.vy*dt, (wz*speed + p.vz)*dt);
      // eine Stufe hinauf: der Blick folgt weich statt mit einem Ruck
      if(res.gestiegen) p.stufeGlatt = Math.max(-0.6, (p.stufeGlatt || 0) - res.gestiegen);
      this._gegenWand = (res.bx || res.bz) && (wx !== 0 || wz !== 0);
      p.vx *= Math.pow(0.02, dt); p.vz *= Math.pow(0.02, dt);
      // Auto-Sprung: genau eine Stufe hoch, Kopffreiheit vorausgesetzt
      if((res.bx || res.bz) && p.onGround && this.settings.autojump && !p.sneaking && (wx || wz)){
        const fx = Math.abs(wx) > Math.abs(wz) ? Math.sign(wx) : 0;
        const fz = fx === 0 ? Math.sign(wz) : 0;
        const tx = Math.floor(p.x + fx*0.55), tz = Math.floor(p.z + fz*0.55), y0 = Math.floor(p.y);
        if(blocksMovement(w.getBlock(tx,y0,tz)) && !blocksMovement(w.getBlock(tx,y0+1,tz))
           && !blocksMovement(w.getBlock(tx,y0+2,tz))) p.vy = 8.6;
      }
      if(p.onGround && wasAir && p.fallFrom !== null){
        const fall = p.fallFrom - p.y;
        if(fall > 3.2 && !p.inWater && !p.creative){
          const dmg = Math.floor(fall - 3);
          if(dmg > 0){ p.hurt(dmg, 'Du bist zu tief gefallen'); this.hurtFlash = 1; Sfx.play('hurt'); this.camShake = 0.16; }
        }
        p.fallFrom = null;
      }
      if(p.inWater) p.fallFrom = null;
    }

    // Schritt-Geräusch + Erschöpfung
    if(p.onGround && (Math.abs(wx)+Math.abs(wz)) > 0.05){
      p.bob += dt*speed*1.9;
      if(p.bob > this._lastStep + 2.6){ this._lastStep = p.bob;
        // der Block unter den Füßen gibt den Klang; geduckt leiser
        const unten = w.getBlock(Math.floor(p.x), Math.floor(p.y - 0.2), Math.floor(p.z));
        Sfx.block('schritt', feetId === B.SCHNEEDECKE ? feetId : (unten !== B.AIR ? unten : feetId), undefined, undefined, undefined, p.sneaking ? .45 : 1);
        p.addExhaustion(input.sprint ? 0.06 : 0.012); }
    } else this._lastStep = p.bob;
    if(p.inWater && !p.onGround && (Math.abs(wx)+Math.abs(wz)) > 0.05){
      this._schwimmT = (this._schwimmT || 0) + dt;
      if(this._schwimmT > 0.8){ this._schwimmT = 0; Sfx.block('schritt', B.WATER); }
    }

    // Kaktus / Ersticken
    if(inBlockOfType(w, p, id => id === B.CACTUS) && !p.creative){
      if(p.hurt(1, 'Ein Kaktus war stärker')) { this.hurtFlash = 1; Sfx.play('hurt'); }
    }
    // Luft
    if(p.headInWater && !p.creative){
      p.air -= dt*3.2;
      if(p.air <= 0){ p.air = 0; this.drownTimer = (this.drownTimer||0) + dt;
        if(this.drownTimer > 1){ this.drownTimer = 0; if(p.hurt(2, 'Du bist ertrunken')){ this.hurtFlash = 1; Sfx.play('hurt'); } } }
    } else { p.air = Math.min(p.maxAir, p.air + dt*8); this.drownTimer = 0; }

    // Hunger & Heilung
    if(!p.creative){
      if(p.exhaustion >= 4){ p.exhaustion -= 4;
        if(p.saturation > 0) p.saturation = Math.max(0, p.saturation-1); else p.food = Math.max(0, p.food-1); }
      if(p.food >= 18 && p.health < p.maxHealth){
        p.regenTimer += dt;
        if(p.regenTimer > 3.6){ p.regenTimer = 0; p.health = Math.min(p.maxHealth, p.health+1); p.addExhaustion(1.2); }
      } else p.regenTimer = 0;
      if(p.food <= 0){
        p.starveTimer += dt;
        if(p.starveTimer > 4){ p.starveTimer = 0; if(p.hurt(1, 'Du bist verhungert')){ this.hurtFlash = 1; } }
      }
    }
    if(p.y < -8 && !p.creative) p.hurt(20, 'Du bist aus der Welt gefallen');
  },
  respawn(){
    const p = this.player;
    this.bett = null; p.liegt = false;
    if(this.dim !== 'oben') this.dimWechseln('oben');            // wer im Nether stirbt, wacht oben auf
    p.health = p.maxHealth; p.food = 20; p.saturation = 5; p.air = p.maxAir;
    p.dead = false; p.vx = p.vy = p.vz = 0; p.exhaustion = 0;
    p.x = p.spawnX; p.y = p.spawnY; p.z = p.spawnZ;
    // Früher landete man auf dem Dach, wenn der Startpunkt unter einem lag.
    // Jetzt nur ausweichen, wenn der Platz selbst zugebaut ist.
    const w = this.world, bx = Math.floor(p.x), bz = Math.floor(p.z);
    for(let n = 0; n < 60; n++){
      const fy = Math.floor(p.y);
      if(!blocksMovement(w.getBlock(bx, fy, bz)) && !blocksMovement(w.getBlock(bx, fy+1, bz))) break;
      p.y = fy + 1.02;
    }
    this.mobs = this.mobs.filter(m => !m.def.hostile);
    Screens.hide();
  },

  /** Spielregeln aus dem Stand oder vom Host — Unbekanntes bleibt draußen */
  regelnSetzen(r){
    this.regeln = Object.assign({}, REGELN_START);
    if(r && typeof r === 'object') for(const k of Object.keys(REGELN_START)) if(typeof r[k] === 'boolean') this.regeln[k] = r[k];
  },

  /* ── Tageszeit ───────────────────────────────────────────────────── */
  sunAngle(){ return (this.time/DAY_LEN) * TAU; },
  dayLight(){
    if(this.dim === 'ende') return END_LICHT;                   // im End ist es immer gleich dämmrig
    const s = Math.sin(this.sunAngle());
    return (0.165 + 0.835 * clamp(s*2.1 + 0.34, 0, 1)) * (1 - 0.25*Wetter.staerke);    // Regen macht den Tag trüb
  },
};

/* ═══════════════════════════════════════════════════════════════════
   EINGABE
   ═══════════════════════════════════════════════════════════════════ */
const Input = {
  mx:0, mz:0, jump:false, sneak:false, sprint:false,
  keys:{}, lookId:null, moveId:null, moveOX:0, moveOY:0,
  digging:false, holdStart:0, holdMoved:0, pendingTap:false,
  usePressed:false, attackHeld:false,

  init(){
    const cv = canvas;
    cv.addEventListener('contextmenu', e => e.preventDefault());
    // Am Fenster statt an der Leinwand: so kann kein Overlay eine
    // Berührung verschlucken, die eigentlich der Welt gilt.
    window.addEventListener('pointerdown', e => this.down(e));
    window.addEventListener('pointermove', e => this.move(e));
    window.addEventListener('pointerup', e => this.up(e));
    window.addEventListener('pointercancel', e => this.up(e));
    window.addEventListener('keydown', e => this.key(e, true));
    // Fenster verlassen (Cmd+Tab, anderer Tab): das Loslassen der Tasten kommt dann nie an — also alles los
    window.addEventListener('blur', () => this.loslassen());
    window.addEventListener('keyup', e => this.key(e, false));
    window.addEventListener('wheel', e => {
      if(!Game.running || Screens.open) return;
      Inv.sel = (Inv.sel + (e.deltaY > 0 ? 1 : 8)) % 9;
      HUD.refreshHotbar(); showItemName();
    }, { passive:true });

    // Touch-Schaltflächen. Der Zeiger wird je Knopf gemerkt und auch am
    // Fenster losgelassen — so bleibt kein Knopf hängen, wenn der Finger
    // abrutscht oder das System die Geste abbricht.
    const hold = (id, on, off) => {
      const n = $(id);
      let pid = null;
      const start = e => {
        e.preventDefault();
        if(pid !== null) return;
        pid = e.pointerId;
        n.classList.add('on');
        on();
        try{ n.setPointerCapture(pid); }catch(_){}
      };
      const stop = e => {
        if(pid === null) return;
        if(e && e.pointerId !== undefined && e.pointerId !== pid) return;
        pid = null; n.classList.remove('on'); if(off) off();
      };
      n.addEventListener('pointerdown', start);
      n.addEventListener('pointerup', stop);
      n.addEventListener('pointercancel', stop);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
      window.addEventListener('blur', () => stop());
    };
    hold('#btnJump', () => { this.jump = true; }, () => { this.jump = false; });
    hold('#btnSneak', () => { this.sneak = true; }, () => { this.sneak = false; });
    hold('#btnUp', () => { this.jump = true; }, () => { this.jump = false; });
    // WERFEN wie Q: eins fällt vor einem auf den Boden; wer hält, wirft eins nach dem anderen
    let werfT = null;
    hold('#btnWerfen', () => {
      dropHeld(); clearTimeout(werfT);
      const weiter = () => { dropHeld(); werfT = Inv.held() ? setTimeout(weiter, 140) : null; };
      werfT = setTimeout(weiter, 420);
    }, () => { clearTimeout(werfT); werfT = null; });
    // SCHLAG: mit dem Bogen in der Hand spannt Halten, Loslassen schießt
    hold('#btnAttack', () => { if(Game.bogenStart()) return;
                               this.attackHeld = true; if(!Game.attack()) this.digging = true; Game.player.swinging = true; Game.player.swing = 0; },
                       () => { if(Game.bogen.aktiv) Game.bogenLos(); this.attackHeld = false; this.digging = false; });
    hold('#btnMode', () => Game.eat());
    $('#btnInv').addEventListener('pointerdown', e => { e.preventDefault();
      if(Screens.open){ Screens.hide(); } else Screens.oeffne('inv'); });
    $('#btnPause').addEventListener('pointerdown', e => { e.preventDefault(); togglePause(); });
    $('#bettAuf').addEventListener('click', () => Game.aufstehen());

    // Hotbar: tippen wählt, lange drücken wirft weg (wie in Minecraft Pocket Edition), „…“ öffnet das Inventar
    let wegT = null, wegId = null;
    const wegAus = e => { if(e && e.pointerId !== wegId) return; clearTimeout(wegT); wegT = null; wegId = null; };
    $('#hotbar').addEventListener('pointerdown', e => {
      const s = e.target.closest('.slot'); if(!s) return;
      e.preventDefault();
      if(s.classList.contains('mehr')){ if(Screens.open) Screens.hide(); else Screens.oeffne('inv'); return; }
      Inv.sel = +s.dataset.i; HUD.refreshHotbar(); showItemName();
      if(e.pointerType === 'mouse') return;
      wegAus(); wegId = e.pointerId;
      const weiter = () => { if(!Inv.held()){ wegT = null; return; } dropHeld(); wegT = setTimeout(weiter, 160); };
      wegT = setTimeout(weiter, 480);
    });
    window.addEventListener('pointerup', wegAus); window.addEventListener('pointercancel', wegAus);

    // Steuerkreuz: ein Finger, der von Pfeil zu Pfeil gleiten darf; Mitte schaltet Ducken um;
    // zweimal kurz hintereinander vorwärts: sprinten
    const dp = $('#dpad');
    let dpId = null, vorEnde = 0, warVor = false;
    const dpSetzen = e => {
      const r = dp.getBoundingClientRect(), k = r.width/3;
      const dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2);
      let x = Math.abs(dx) > k/2 ? Math.sign(dx) : 0, z = Math.abs(dy) > k/2 ? Math.sign(dy) : 0;
      if(z > 0) x = 0;                                     // rückwärts nur gerade, wie beim Vorbild
      const vor = z < 0, jetzt = performance.now();
      if(vor && !warVor && jetzt - vorEnde < 320) this.sprint = true;
      if(!vor && warVor){ vorEnde = jetzt; this.sprint = false; }
      warVor = vor;
      const l = Math.hypot(x, z) || 1;
      this.mx = x/l; this.mz = z/l;
      dp.classList.toggle('vor', vor);
      for(const d of dp.children){
        const rr = d.dataset.r;
        d.classList.toggle('on', (rr === 'vor' && vor && !x) || (rr === 'zurueck' && z > 0) || (rr === 'links' && x < 0 && !z) || (rr === 'rechts' && x > 0 && !z)
          || (rr === 'vl' && vor && x < 0) || (rr === 'vr' && vor && x > 0) || (rr === 'mitte' && this.sneak));
      }
    };
    dp.addEventListener('pointerdown', e => {
      e.preventDefault();
      if(dpId !== null) return;
      const r = dp.getBoundingClientRect(), k = r.width/3;
      const dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2);
      if(Math.abs(dx) < k/2 && Math.abs(dy) < k/2){
        this.sneak = !this.sneak;
        dp.querySelector('[data-r=mitte]').classList.toggle('on', this.sneak);
        return;
      }
      dpId = e.pointerId;
      try{ dp.setPointerCapture(e.pointerId); }catch(_){}
      dpSetzen(e);
    });
    dp.addEventListener('pointermove', e => { if(e.pointerId === dpId) dpSetzen(e); });
    const dpAus = e => {
      if(e.pointerId !== dpId) return;
      dpId = null; this.mx = this.mz = 0;
      if(warVor) vorEnde = performance.now();
      warVor = false; this.sprint = false; dp.classList.remove('vor');
      for(const d of dp.children) if(d.dataset.r !== 'mitte') d.classList.remove('on');
    };
    dp.addEventListener('pointerup', dpAus); dp.addEventListener('pointercancel', dpAus);
    this.steuerungZeigen();

  },

  /** mit dem Steuerkreuz ist der ganze freie Bildschirm zum Umsehen da */
  zone(e){ return Game.settings.steuerung !== 'kreuz' && e.clientX < window.innerWidth*0.42 ? 'move' : 'look'; },
  steuerungZeigen(){ document.body.classList.toggle('kreuz', Game.settings.steuerung === 'kreuz'); },
  /** Berührungen auf echten Bedienelementen gehören diesen, nicht der Welt */
  onWidget(e){
    const t = e.target;
    return !!(t && t.closest && t.closest('.tbtn, #dpad, #hotbar, .screen, .mc-schirm, button, input'));
  },

  down(e){
    if(!Game.running || Screens.open || this.onWidget(e)) return;
    if(Chat.offen){ Chat.schliessen(); return; }       // Tippen in die Welt schließt den Chat
    if(this.zone(e) === 'move' && this.moveId === null){
      this.moveId = e.pointerId; this.moveOX = e.clientX; this.moveOY = e.clientY;
      const st = $('#stick');
      st.classList.add('act');
      st.style.left = (e.clientX-66) + 'px'; st.style.top = (e.clientY-66) + 'px'; st.style.bottom = 'auto';
    } else if(this.lookId === null){
      this.lookId = e.pointerId; this.lookType = e.pointerType;
      this.lastX = e.clientX; this.lastY = e.clientY;
      this.holdStart = performance.now(); this.holdMoved = 0; this.pendingTap = true;
      if(document.pointerLockElement !== canvas && e.pointerType === 'mouse'){
        try{ const r = canvas.requestPointerLock && canvas.requestPointerLock(); if(r && r.catch) r.catch(()=>{}); }catch(_){}
      }
      if(e.pointerType === 'mouse'){
        this.pendingTap = false;
        if(e.button === 2){ if(!Game.bogenStart() && !Game.benutzeWesen()) Game.useAt(Game.targetBlock()); }
        else { if(!Game.attack()) this.digging = true; Game.player.swinging = true; Game.player.swing = 0; }
      }
    }
  },
  move(e){
    if(!Game.running) return;
    if(e.pointerId === this.moveId){
      const dx = e.clientX - this.moveOX, dy = e.clientY - this.moveOY;
      const r = 52, l = Math.hypot(dx,dy);
      const k = l > r ? r/l : 1;
      if(l < 7){ this.mx = 0; this.mz = 0; }        // Totzone
      else { this.mx = dx*k/r; this.mz = dy*k/r; }
      this.sprint = l > r*0.92;
      $('#stick').firstElementChild.style.transform = `translate(${dx*k}px, ${dy*k}px)`;
    } else if(e.pointerId === this.lookId || (document.pointerLockElement === canvas && e.pointerType === 'mouse')){
      const p = Game.player;
      let dx, dy;
      if(document.pointerLockElement === canvas){ dx = e.movementX; dy = e.movementY; }
      else { dx = e.clientX - this.lastX; dy = e.clientY - this.lastY; this.lastX = e.clientX; this.lastY = e.clientY; }
      const s = Game.settings.sens * 0.00028;
      p.yaw -= dx*s; p.pitch -= dy*s;
      p.pitch = clamp(p.pitch, -Math.PI/2+0.01, Math.PI/2-0.01);
      this.holdMoved += Math.abs(dx)+Math.abs(dy);
      if(this.holdMoved > 14) this.pendingTap = false;
    }
  },
  up(e){
    if(e.pointerId === this.moveId){
      this.moveId = null; this.mx = 0; this.mz = 0; this.sprint = false;
      const st = $('#stick');
      st.classList.remove('act');
      st.firstElementChild.style.transform = '';
      st.style.left = ''; st.style.top = ''; st.style.bottom = '';
    } else if(e.pointerId === this.lookId){
      const held = performance.now() - this.holdStart;
      if(Game.bogen.aktiv) Game.bogenLos();
      if(this.pendingTap && held < 260 && this.holdMoved < 14 && e.pointerType !== 'mouse'){
        // Tippen: erst Schere oder Eimer an einem Tier, dann Schlag, dann Block.
        // Mit einem Ei in der Hand wird geworfen statt geschlagen.
        const h = Inv.held();
        if(h && istWurf(h.id)){ if(!Game.benutzeWesen()) Game.useAt(Game.targetBlock()); }
        else if(!Game.benutzeWesen(true) && !Game.attack()) Game.useAt(Game.targetBlock());
        Game.player.swinging = true; Game.player.swing = 0;
      }
      this.lookId = null; this.digging = false; this.pendingTap = false;
    }
    if(e.pointerType === 'mouse') this.digging = false;
  },
  /** Laufrichtung aus den gedrückten Tasten (W A S D) */
  bewegungAusTasten(){
    let x = 0, z = 0;
    if(this.keys['w']) z -= 1; if(this.keys['s']) z += 1;
    if(this.keys['a']) x -= 1; if(this.keys['d']) x += 1;
    if(!this.moveId){ this.mx = x; this.mz = z; }
    this.jump = !!this.keys[' ']; this.sneak = !!this.keys['shift'];
  },
  /** alles loslassen — etwa, wenn der Chat aufgeht, während man läuft */
  loslassen(){
    this.keys = {}; this.mx = this.mz = 0; this.jump = this.sneak = this.sprint = false;
    this.digging = this.attackHeld = false;
  },
  key(e, dn){
    const k = e.code === 'Space' || e.key === 'Spacebar' ? ' ' : e.key.toLowerCase();
    const schonUnten = !!this.keys[k];                 // gehalten: macOS schickt Wiederholungen, nicht jeder Browser markiert sie
    if(!dn && this.keys[k]){ this.keys[k] = false; if(Screens.open || Chat.offen || Menue.aktiv) this.bewegungAusTasten(); }
    // Titelbild und Optionen: Escape geht einen Schritt zurück, sonst nichts
    if(Menue.aktiv){ if(dn && k === 'escape') Menue.zurueck(); return; }
    if(!Game.running) return;
    if(Chat.offen) return;                             // Tasten gehören dem Eingabefeld
    // Pause mit Enter: Escape beendet in Safari auf dem Mac das Vollbild (und schließt das Fenster) — Escape geht trotzdem weiter
    if(dn && (k === 'enter' || k === 'escape')){ e.preventDefault(); if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); if(Screens.open) Screens.hide(); else togglePause(); return; }
    if(Screens.open && Screens.open !== 'pause') { if(!dn) this.keys[k] = false; if(dn && (k === 'e')) Screens.hide(); return; }
    // T öffnet den Chat, / gleich mit Schrägstrich — wie beim Vorbild
    if(dn && !Screens.open && (k === 't' || e.key === '/')){ e.preventDefault(); Chat.oeffnen(e.key === '/' ? '/' : ''); return; }
    this.keys[k] = dn;
    if(dn && k >= '1' && k <= '9'){ Inv.sel = +k-1; HUD.refreshHotbar(); showItemName(); }
    if(dn && k === 'e') Screens.oeffne('inv');
    if(dn && k === 'f3'){ Game.settings.debug = !Game.settings.debug; $('#dbg').classList.toggle('on', Game.settings.debug); Game.saveOpts(); e.preventDefault(); }
    if(dn && k === 'f' && Game.player && Game.player.creative) Game.player.flying = !Game.player.flying;
    // zweimal kurz hintereinander Leertaste: im Kreativmodus fliegen (und wieder landen) wie beim Vorbild
    if(dn && k === ' ' && !e.repeat && !schonUnten && Game.player && Game.player.creative){
      // wann gedrückt wurde, nicht wann es ankam — sofern der Browser einen passenden Zeitstempel liefert
      const jetzt0 = performance.now(), jetzt = e.timeStamp > jetzt0 - 2000 && e.timeStamp <= jetzt0 + 5 ? e.timeStamp : jetzt0;
      if(jetzt - (this._leerT || 0) < 380){ Game.player.flying = !Game.player.flying; this._leerT = 0; Game.player.vy = 0; hint(Game.player.flying ? 'Fliegen an' : 'Fliegen aus', 900); }
      else this._leerT = jetzt;
    }
    if(dn && k === 'q') dropHeld();
    if(k === ' ') e.preventDefault();
    this.jump = !!(this.keys[' ']);
    this.sneak = !!(this.keys['shift']);
    this.sprint = !!(this.keys['control']) || this.sprint;
    let x = 0, z = 0;
    if(this.keys['w']) z -= 1; if(this.keys['s']) z += 1;
    if(this.keys['a']) x -= 1; if(this.keys['d']) x += 1;
    if(x || z || (!this.moveId)){ this.mx = x; this.mz = z; }
    if(!this.keys['control'] && !this.moveId) this.sprint = false;
  }
};

/** Q oder WERFEN: eins aus der Hand. Wie beim Vorbild fliegt es ein Stück
    nach vorn und lässt sich erst nach zwei Sekunden wieder aufheben — sonst
    sammelte man es gleich wieder ein. Werkzeug behält seine Abnutzung. */
function dropHeld(){
  const s = Inv.held(); if(!s) return;
  const p = Game.player, f = p.forward();
  Game.dropItem(s.id, 1, p.x + f[0]*0.5, p.eyeY() - 0.3, p.z + f[2]*0.5, s.dur, [f[0]*4.2, 2.2 + f[1]*3, f[2]*4.2, 2]);
  Inv.consumeHeld(); HUD.refreshHotbar();
}
function togglePause(){
  if(Screens.open === 'pause') Screens.hide();
  else Screens.show('pause');
}

Game._lastStep = 0;
Input.touchDig = false;
/** im Spielmenü mit Mitspielern: die Welt läuft, man selbst steht still */
const KEINE_EINGABE = { mx:0, mz:0, jump:false, sneak:false, sprint:false };


/* ── Hauptschleife ─────────────────────────────────────────────────── */
let lastT = performance.now();
function frame(now){
  requestAnimationFrame(frame);
  let dt = (now - lastT)/1000; lastT = now;
  if(dt > 0.1) dt = 0.1;
  Chat.tick();
  if(Game.panoramaAktiv){
    Game.streamChunks(Game.loading ? 16 : 6);
    if(Game._panoHoehe && Game.world.getChunk(Math.floor(Game.player.x/CS), Math.floor(Game.player.z/CS))){
      Game._panoHoehe = false; Game.panoramaHoehe();
    }
    if(!Game.loading) document.body.classList.add('panoBereit');
    Game.player.yaw += dt*0.045;
    render(dt);
    return;
  }
  if(!Game.running){ return; }

  Game.tick++;
  Game._fpsAcc += dt; Game._fpsN++;
  if(Game._fpsAcc > 0.5){ Game.fps = Game._fpsN/Game._fpsAcc; Game._fpsAcc = 0; Game._fpsN = 0; }

  Game.streamChunks(Game.loading ? 22 : 7);

  // Mit Mitspielern hält das Spielmenü die Welt nicht an — wie beim Vorbild
  const imMenue = Screens.open === 'pause' || Screens.open === 'death';
  const mitAnderen = Netz.istGast || (Netz.istHost && Netz.hatGaeste());
  const paused = imMenue && !mitAnderen;
  Menue.ladeStand(Game.loading, Game.loadDone / Game.loadTarget);
  if(!paused){
    if(Game.regeln.doDaylightCycle) Game.time = (Game.time + dt) % DAY_LEN;
    Game.gesamtZeit += dt;
    if(!Game.loading || Game.world.getChunk(Math.floor(Game.player.x/CS), Math.floor(Game.player.z/CS))){
      Game.updatePlayer(dt, imMenue ? KEINE_EINGABE : Input);
    }
    // Als Gast kommen die Wesen fertig vom Host
    if(Netz.istGast) Netz.wesenNachziehen(dt); else Game.updateMobs(dt);
    Game.updateDrops(dt);
    Game.updatePfeile(dt);
    for(let i = Game.partikel.length - 1; i >= 0; i--){
      const q = Game.partikel[i]; q.t += dt;
      if(q.fall){
        // Eierschalen fliegen auseinander und bleiben liegen, wo sie aufkommen
        q.vy -= 16*dt;
        const nx = q.x + q.vx*dt, ny = q.y + q.vy*dt, nz = q.z + q.vz*dt;
        if(blocksMovement(Game.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz)))) q.vx = q.vy = q.vz = 0;
        else { q.x = nx; q.y = ny; q.z = nz; }
      } else if(q.fliegt){ q.x += q.vx*dt; q.y += q.vy*dt; q.z += q.vz*dt; }
      else if(q.t > 0) q.y += dt*0.55;
      if(q.t > (q.dauer || 1.3)) Game.partikel.splice(i, 1);
    }
    if(Game.bogen.aktiv){
      const s = Inv.held();
      if(!s || s.id !== ITEM.bow) Game.bogen.aktiv = false; else Game.bogen.t = Math.min(1.2, Game.bogen.t + dt);
    }
    if(!Netz.istGast){
      Game.tickFurnaces(dt);
      Game.tickFelder(dt);
      Game.feuerBrennt(dt);
      Game.spawnMobs(dt);
      Game.dorfLeben(dt);
      Game.wasser.tick(dt);
      Game.schaltung.tick(dt);
      Game.andereWeltRechnen(dt);
    } else { Game.wasser.naechste.clear(); Game.schaltung.naechste.clear(); }   // beim Gast fließt und schaltet es, wie der Host es schickt
    if(!imMenue) handleDigging(dt);
  }
  Wetter.tick(dt, paused || Game.dim !== 'oben');      // im Nether und im End regnet es nicht
  // oben wechselt das Wetter trotzdem weiter — für die Mitspieler dort
  if(Game.dim !== 'oben' && !paused && Netz.istHost && Game.regeln.doWeatherCycle){ Wetter.rest -= dt; if(Wetter.rest <= 0) Wetter.wechseln(); }
  Netz.tick(dt);
  if(!paused){ Game.wolkenTick(dt); Game.atemStrahl(dt); }
  Game.bossLeiste();
  /* Tod: gleich wodurch — Sturz, Zombie, Hunger. Früher prüfte das nur die
     Spielerbewegung selbst; wer von einem Zombie erschlagen wurde, blieb
     ohne Todesbildschirm einfach stehen. */
  if(Game.player.dead && Screens.open !== 'death'){
    Sfx.play('die'); $('#deathCause').textContent = Game.player.deathCause; Screens.show('death');
    Chat.tod(Game.player.deathCause);
  }
  if(Game.platzSuchen && !Game.loading){
    Game.platzSuchen = false;
    Game.freierPlatz(Game.player.x, Game.player.z, true);
  }
  // Schlafen: liegen alle im Bett, abblenden, die Nacht überspringen (das
  // macht der Host, die Gäste bekommen die Zeit von ihm), aufblenden, aufstehen
  Game.schlafPruefen();
  if(Game.schlafT > 0){
    const vorher = Game.schlafT;
    Game.schlafT += dt;
    if(vorher < 1 && Game.schlafT >= 1){
      if(!Netz.istGast){
        // die übersprungene Nacht zählt als Spielzeit: ein neuer Tag
        Game.gesamtZeit += (DAY_LEN - Game.time + DAY_LEN*0.01) % DAY_LEN;
        Game.time = DAY_LEN*0.01;
        if(Wetter.regen) Wetter.klar();          // wer die Nacht verschläft, verschläft auch den Regen
        Game.save();
        if(Netz.istHost) Netz.zeitSenden();
      }
      hint('Guten Morgen', 1800);
    }
    if(Game.schlafT > 2.4){ Game.schlafT = 0; Game.aufstehen(); }
  }
  {
    // im Bett etwas dunkler, beim Schlafen ganz dunkel; dazu, wer schon liegt
    const t = Game.schlafT, b = $('#bett');
    const o = t > 0 ? (t < 1 ? Math.max(t, 0.4) : Math.max(0, 1 - (t - 1.5)/0.9)) : (Game.bett ? 0.4 : 0);
    if(Game._schlafO !== o){ Game._schlafO = o; $('#schlaf').style.opacity = o; }
    const zeigen = !!Game.bett && !t;
    if(zeigen){
      const [n, alle] = Game.schlaefer();
      const text = alle > 1 ? n + ' von ' + alle + ' liegen im Bett — die Nacht vergeht, wenn alle schlafen' : 'Gute Nacht …';
      if($('#bettText').textContent !== text) $('#bettText').textContent = text;
    }
    if(b.classList.contains('on') !== zeigen) b.classList.toggle('on', zeigen);
  }
  if(Game.camShake > 0) Game.camShake = Math.max(0, Game.camShake - dt*0.4);
  if(Game.hurtFlash > 0){ Game.hurtFlash -= dt*2.4; $('#hurt').style.opacity = Math.max(0, Game.hurtFlash*0.9); }
  $('#water').style.opacity = Game.player.headInWater ? 1 : 0;

  const p = Game.player;
  if(p.swinging){ p.swing += dt*3.6; if(p.swing >= 1){ p.swing = 0; p.swinging = Input.digging || Input.touchDig || Input.attackHeld; } }

  HUD.refreshVitals(p);
  HUD.refreshHotbar();
  const sp = $('#spannung');
  sp.classList.toggle('on', Game.bogen.aktiv);
  if(Game.bogen.aktiv) sp.firstElementChild.style.width = Math.round(Math.min(1, Game.bogen.t)*100) + '%';
  $('#portalSchleier').style.opacity = Math.min(1, (p.portalT || 0)/(p.creative ? 0.5 : 3)).toFixed(2);
  // Aufladen des Schlags unter dem Fadenkreuz, wie beim Vorbild — nur solange er nicht voll ist
  const ak = $('#abklingen'), lade = Game.angriffLadung();
  ak.classList.toggle('on', lade < 1 && !Game.bogen.aktiv && !p.dead);
  if(lade < 1) ak.firstElementChild.style.width = Math.round(lade*100) + '%';
  if(Game.settings.debug) updateDebug();

  Sfx.hoerer(p.x, p.eyeY(), p.z, p.yaw, p.pitch);
  render(dt);
  Netz.schilder();

  if(now - Game.lastSave > 45000){ Game.save(); }
}

function handleDigging(dt){
  const p = Game.player;
  if(Input.lookId !== null && !Input.touchDig && Input.lookType !== 'mouse'
     && performance.now() - Input.holdStart > 280 && Input.holdMoved < 26){
    Input.touchDig = true; Input.pendingTap = false;
    const s = Inv.held();
    if(s && s.id === ITEM.bow) Game.bogenStart();       // mit dem Bogen: Halten spannt statt abzubauen
  }
  if(Input.lookId === null) Input.touchDig = false;
  if(Game.bogen.aktiv){ Game.breakPos = null; Game.breakProg = 0; return; }
  const want = Input.digging || Input.touchDig || Input.attackHeld;
  if(!want){ Game.breakPos = null; Game.breakProg = 0; return; }
  const t = Game.targetBlock();
  if(!t){ Game.breakPos = null; Game.breakProg = 0; return; }
  p.swinging = true;
  if(!Game.breakPos || Game.breakPos[0] !== t.x || Game.breakPos[1] !== t.y || Game.breakPos[2] !== t.z){
    Game.breakPos = [t.x, t.y, t.z];
    Game.breakProg = 0;
    Game.breakTotal = Game.breakSpeed(t.id).time;
    Game._digSnd = 0;
  }
  if(Game.breakTotal <= 0){ Game.breakPos = null; return; }
  Game.breakProg += dt;
  Game._digSnd += dt;
  if(Game._digSnd > 0.22){ Game._digSnd = 0; Sfx.block('hacken', t.id, t.x, t.y, t.z); }
  if(Game.breakProg >= Game.breakTotal){
    Game.finishBreak(t.x, t.y, t.z, t.id);
    Game.breakPos = null; Game.breakProg = 0;
  }
}

function updateDebug(){
  const p = Game.player, w = Game.world;
  const x = Math.floor(p.x), y = Math.floor(p.y), z = Math.floor(p.z);
  const lv = w.getLight(x, y+1, z);
  const hh = Math.floor(Game.time/DAY_LEN*24), mm = Math.floor((Game.time/DAY_LEN*24 % 1)*60);
  $('#dbg').textContent =
    'FPS ' + Game.fps.toFixed(0) + '   Chunks ' + Game.meshes.size + '\n' +
    'XYZ ' + p.x.toFixed(1) + ' / ' + p.y.toFixed(1) + ' / ' + p.z.toFixed(1) + '\n' +
    'Biom ' + BIO_NAME[w.biomeAt(x,z)] + '   Höhe ' + w.heightAt(x,z) + (schleimChunk(w, x >> 4, z >> 4) ? '   Schleim-Chunk' : '') + '\n' +
    'Licht Sonne ' + (lv & 15) + ' Block ' + (lv >> 4) + '   Tag ' + Game.dayLight().toFixed(2) + '\n' +
    'Zeit ' + String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0') +
    '   Mobs ' + Game.mobs.length + '   Objekte ' + Game.drops.length + '\n' +
    'Wetter ' + Wetter.text();
}

/* ═══════════════════════════════════════════════════════════════════
   SPIEL-KNÖPFE — alles Übrige an Menüs steht in menue.js
   ═══════════════════════════════════════════════════════════════════ */
function wireSpiel(){
  window.addEventListener('resize', () => Screens.masse());
  // Doppel-Tipp auf Sprung = fliegen (Kreativ)
  let lastJump = 0;
  $('#btnJump').addEventListener('pointerdown', e => {
    const n = e.timeStamp || performance.now();
    if(Game.player && Game.player.creative && n - lastJump < 320) Game.player.flying = !Game.player.flying;
    lastJump = n;
    if(Game.player) $('#btnUp').style.display = Game.player.flying ? 'grid' : 'none';
  });
  // Verschwindet die Seite, wird gespeichert — mit Notkopie, weil die
  // Datenbank nicht mehr fertig schreiben könnte
  const weg = () => { if(Game.running) Game.save(true); };
  window.addEventListener('visibilitychange', () => { if(document.hidden) weg(); });
  window.addEventListener('pagehide', weg);
  window.addEventListener('beforeunload', weg);
}

/* Android-App: Die Zurück-Taste fragt erst hier nach. true heißt erledigt;
   false heißt, die App darf in den Hintergrund (nur auf dem Titelbild).
   Im Spiel öffnet sie die Pause wie Escape, statt die App zu schließen. */
window.androidZurueck = () => {
  if(Menue.aktiv){
    if(Menue.aktiv === 'titel') return false;
    Menue.zurueck(); return true;
  }
  if(!Game.running) return false;
  if(Chat.offen){ Chat.schliessen(); return true; }
  if(Screens.open === 'death') return true;
  if(Screens.open) Screens.hide(); else togglePause();
  return true;
};
/** Die App geht in den Hintergrund: anhalten und sichern */
window.androidPause = () => {
  if(!Game.running) return;
  Chat.schliessen();
  if(!Screens.open && !Menue.aktiv) Screens.show('pause');
  Game.save(true);
};

/* ═══════════════════════════════════════════════════════════════════
   START
   ═══════════════════════════════════════════════════════════════════ */
function boot(){
  buildTextures();
  initBlocks(); buildBlockTables(); buildFaceTables(); initItems(); initRecipes(); initSmelt();
  if(!R.init()){
    const t = document.getElementById('titel');
    t.classList.add('on');
    t.innerHTML = '<h1 class="mc-titel" style="margin-top:auto">Pocketcraft</h1>' +
      '<p class="mc-text" style="margin-bottom:auto">Dieser Browser unterstützt kein WebGL 2. Auf iPad und iPhone hilft ein Update auf iOS 15 oder neuer; ' +
      'am Desktop ein aktueller Chrome, Firefox oder Safari.</p>';
    return;
  }
  buildWire();
  Game.loadOpts();
  if(Game.settings.superGrafik && !Super.setzen(true)) Game.settings.superGrafik = false;
  if(Game.settings.klassik) Klassik.setzen(true);
  McPaket.start();                   // Minecraft-Texturen und -Geräusche, falls geladen (läuft im Hintergrund an)
  // früher gab es nur »Ton an/aus«
  if(Game.settings.ton === false){ Game.settings.geraeusche = 0; delete Game.settings.ton; Game.saveOpts(); }
  Sfx.lautSetzen(Game.settings.geraeusche/100);
  Musik.lautSetzen(Game.settings.musik/100);
  Musik.laden();
  Input.init();
  wireSpiel();
  Netz.init();
  Chat.init();
  Menue.init();
  symboleVorwaermen();
  $('#dbg').classList.toggle('on', Game.settings.debug);
  requestAnimationFrame(frame);
}
boot();

/* Werkbank: von außen prüfbar, ob das Würfel-VAO seinen eigenen
   Indexpuffer behält. Genau da lag der Fehler mit den zerrissenen
   Gegenständen und Mobs. */
window.__welt = {
  R, Game, gl, Screens, Inv, Geste, REZEPTE, rasterRezept, B, ITEM, blocks, items, TEX, texNames, Input, Menue, Speicher, Mob, Pfeil, MOBS, Netz, Wetter, Chat, Befehle,
  schleimGroesse, schleimChunk, Super, Klassik, dorfSuchen, doerferBei, BERUFE,
  vaoHeil(){
    gl.bindVertexArray(R.cubeVAO);
    const ib = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
    gl.bindVertexArray(null);
    return ib === R.cubeIB;
  }
};
