/* Pocketcraft · Spiel, Eingabe, Schleife, Menüs */
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   SPIEL — Streaming, Eingabe, Regeln, Bild
   ═══════════════════════════════════════════════════════════════════ */
const OPT_KEY  = 'taschenwelt.opts.v1';      // Name aus der Zeit vor Pocketcraft, bleibt für die Einstellungen
const DAY_LEN  = 720;             // Sekunden je voller Tag

const Game = {
  world:null, player:null, mobs:[], drops:[],
  running:false, time: DAY_LEN*0.12, tick:0,
  settings:{ rd:5, sens:12, autojump:true, debug:false, geraeusche:100, musik:70 },
  bufA: new MeshBuf(), bufB: new MeshBuf(),
  meshes: new Map(), lastSave:0, loading:true, loadTarget:1, loadDone:0,
  breakPos:null, breakProg:0, breakTotal:1, fps:60, _fpsAcc:0, _fpsN:0,
  hurtFlash:0, mobTimer:0, camShake:0,
  meta:null, gesamtZeit:0, panoramaAktiv:false, _panoZiel:0,
  pfeile:[], bogen:{ aktiv:false, t:0 }, partikel:[],
  gaeste:{},                        // Host: Inventar und Ort der Mitspieler, mit der Welt gespeichert

  /** Sichtweite: das Panorama begnügt sich mit weniger */
  sicht(){ return this.panoramaAktiv ? Math.min(4, this.settings.rd) : this.settings.rd; },

  /* ── Start ───────────────────────────────────────────────────────── */
  /** meta: Steckbrief der Welt · saved: Datenteil oder null für eine neue */
  start(meta, saved){
    this.meta = meta;
    this.panoramaAktiv = false;
    document.body.classList.remove('imMenue');
    const seed = meta.seed;
    this.world = new World(seed);
    // Jede Blockänderung aus dem eigenen Spiel geht an die Mitspieler; was
    // aus dem Netz kommt (Netz.eingehend), natürlich nicht zurück
    const w = this.world, setzen = w.setBlock.bind(w);
    // Wasser: jede Änderung meldet das Wasser daneben an (gerechnet wird nur beim Host)
    this.wasser = w.stroemung = new Stroemung(w);
    this.wasser.wegspuelen = (x, y, z, id) => {
      if(isWheat(id)) w.crops.delete(x + ',' + y + ',' + z);
      const d = this.dropsFor(id, true);
      if(d) for(const [i, n] of d) this.dropItem(i, n, x + .5, y + .3, z + .5);
    };
    w.setBlock = (x, y, z, id, noSave) => {
      const vorher = w.getBlock(x, y, z);
      const ok = setzen(x, y, z, id, noSave);
      if(ok && !noSave && Netz.rolle && !Netz.eingehend) Netz.blockGeaendert(x, y, z, id);
      if(ok && !Netz.istGast) this.wasser.melden(x, y, z);
      // Plattenspieler: Platte hinein spielt, Platte heraus oder Block weg verstummt —
      // bei allen, denn auch Änderungen aus dem Netz kommen hier vorbei
      if(ok && (id === B.JUKEBOX_VOLL) !== (vorher === B.JUKEBOX_VOLL)){
        if(id === B.JUKEBOX_VOLL) Plattenspieler.an(x, y, z); else Plattenspieler.aus(x, y, z);
      }
      return ok;
    };
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
        for(let i=0;i<arr.length;i+=2) m.set(arr[i], arr[i+1]);
        this.world.mods.set(k, m);
      }
      for(const [k, f] of (saved.furn || [])) this.world.furnaces.set(k, f);
      const stapel = a => a ? { id:a[0], n:a[1], dur:a[2]|0 } : null;
      for(const [k, arr] of (saved.truhen || [])) this.world.chests.set(k, arr.map(stapel));
      for(const [k, f] of (saved.felder || [])) this.world.crops.set(k, f);
      // gezüchtete und gefütterte Tiere bleiben in der Welt
      for(const t of (saved.tiere || [])){
        const [art, x, y, z, yaw, hp, kind, pause, wolle, geschoren] = t;
        if(!MOBS[art]) continue;
        const m = new Mob(art, x, y, z, kind > 0);
        m.kind = kind; m.yaw = yaw; m.health = hp; m.pause = pause; m.bleibt = true;
        if(art === 'sheep'){ m.wolle = wolle | 0; m.geschoren = !!geschoren; m.wolleT = 30 + Math.random()*60; }
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
    const rd = this.sicht();
    this.loadTarget = Math.max(9, ((rd*2+1)*(rd*2+1)) * 0.55 | 0);
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
    const meta = { id: 'gast', gast: true, name: w.name, seed: w.seed, modus: w.modus };
    this.start(meta, {
      p: du.p || null, inv: du.inv || [], ruest: du.ruest || [], bekannt: du.bekannt || [], rest: du.rest || [],
      mods: w.mods || [], furn: w.furn || [], truhen: w.truhen || [], felder: w.felder || [],
      time: w.time, zeit: w.zeit, tiere: []
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
      this.world = new World(seed);
      this.player = new Player();
      this.meshes.forEach(m => { R.freeMesh(m.o); R.freeMesh(m.w); });
      this.meshes.clear();
      this.findSpawn();
      this._panoHoehe = true;
      this.loading = true; this.loadDone = 0;
      const rd = Math.min(4, this.settings.rd);
      this.loadTarget = Math.max(9, ((rd*2+1)*(rd*2+1)) * 0.55 | 0);
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
    const p = this.player;
    for(let r=0; r<220; r+=3){
      for(let a=0; a<12; a++){
        const ang = a/12*TAU;
        const x = Math.round(Math.cos(ang)*r), z = Math.round(Math.sin(ang)*r);
        const info = this.world.column(x,z);
        if(info.h > SEA+2 && info.biome !== BIO.OCEAN && info.biome !== BIO.BEACH){
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
          if(y <= h + 2 ? blocksMovement(id) : (id === B.LEAVES || id === B.LOG)){ frei = false; break; }
        }
        if(!frei) continue;
        p.x = x + 0.5; p.z = z + 0.5; p.y = h + 1.02; p.vy = 0;
        if(setzeSpawn){ p.spawnX = p.x; p.spawnY = p.y; p.spawnZ = p.z; }
        return true;
      }
    }
    return false;
  },

  /* ── Speichern / Laden ───────────────────────────────────────────── */
  /** gibt ein Versprechen zurück; sofort=true schreibt zusätzlich eine
      synchrone Notkopie — für den Moment, in dem die Seite verschwindet */
  /** was an einer Welt über den Startwert hinaus gespeichert wird —
      auch das, was ein Mitspieler beim Beitreten bekommt */
  weltTeil(){
    const mods = [];
    for(const [k, m] of this.world.mods){
      const arr = new Array(m.size*2); let i = 0;
      for(const [idx, id] of m){ arr[i++] = idx; arr[i++] = id; }
      mods.push([k, arr]);
    }
    return {
      mods, furn: [...this.world.furnaces],
      truhen: [...this.world.chests].map(([k, a]) => [k, a.map(s => s ? [s.id, s.n, s.dur] : null)]),
      felder: [...this.world.crops],
    };
  },
  save(sofort){
    // Als Gast gehört die Welt dem Host: der bekommt nur den eigenen Stand
    if(Netz.istGast){ Netz.standSenden(); return Promise.resolve(true); }
    if(!this.world || !this.meta || this.panoramaAktiv || this.meta.gast) return Promise.resolve(false);
    let text;
    try{
      const p = this.player;
      const data = Object.assign({
        seed: this.world.seedStr, time: this.time, zeit: this.gesamtZeit,
        p: { x:p.x, y:p.y, z:p.z, yaw:p.yaw, pitch:p.pitch, health:p.health, food:p.food,
             saturation:p.saturation, air:p.air, creative:p.creative,
             spawnX:p.spawnX, spawnY:p.spawnY, spawnZ:p.spawnZ },
        inv: Inv.slots.map(s => s ? [s.id, s.n, s.dur] : null),
        gaeste: this.gaeste,
        ruest: Inv.ruestung.map(s => s ? [s.id, s.n, s.dur] : null),
        bekannt: [...Inv.bekannt],
        rest: Screens.raster.concat([Inv.cursor]).filter(Boolean).map(s => [s.id, s.n, s.dur]),
        tiere: this.mobs.filter(m => m.bleibt && !m.dead && !m.def.hostile).map(m =>
          [m.type, +m.x.toFixed(2), +m.y.toFixed(2), +m.z.toFixed(2), +m.yaw.toFixed(2), m.health, Math.round(m.kind), Math.round(m.pause),
           m.wolle || 0, m.geschoren ? 1 : 0])
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
  dropItem(id, n, x, y, z, dur){
    if(!id || n <= 0) return;
    if(this.drops.length > 90) this.drops.shift();
    const d = new Drop(id, n, x, y, z);
    if(dur) d.dur = dur;
    this.drops.push(d);
  },
  /** was ein abgebauter Block fallen lässt: Liste aus [id, anzahl] */
  dropsFor(blockId, tierOk){
    const b = blocks[blockId];
    if(!b) return null;
    if(b.tool === 'pickaxe' && !tierOk) return null;
    if(blockId === B.GLASS) return null;
    if(blockId === B.LEAVES) return Math.random() < 0.06 ? [[ITEM.apple,1]] : (Math.random() < 0.05 ? [[B.LEAVES,1]] : null);
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
    const p = this.player, f = p.forward();
    const r = this.world.raycast(p.x, p.eyeY(), p.z, f[0], f[1], f[2], p.creative ? 7 : 5, false);
    return r.hit ? r : null;
  },
  breakSpeed(id){
    const b = blocks[id];
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
    this.stuetzePruefen(x, y, z);
  },
  /** Was nicht mehr gestützt wird, fällt ab */
  stuetzePruefen(x, y, z){
    const w = this.world;
    const oben = w.getBlock(x, y+1, z), bo = blocks[oben];
    if(bo && (bo.model === 'cross' || bo.model === 'torch' || oben === B.CACTUS || (isDoor(oben) && !doorInfo(oben).oben)))
      this.entfernen(x, y+1, z, true);
    for(let sIdx = 0; sIdx < 4; sIdx++){
      const lx = x - SEITE[sIdx][0], lz = z - SEITE[sIdx][1];
      if(w.getBlock(lx, y, lz) === ladderId(sIdx)) this.entfernen(lx, y, lz, true);
    }
  },
  /** steht jemand dort, wo der Block seinen Kollisionskasten hätte? */
  belegt(bx, by, bz, id){
    const o = id*6;
    const x0 = bx + COLL[o], y0 = by + COLL[o+1], z0 = bz + COLL[o+2], x1 = bx + COLL[o+3], y1 = by + COLL[o+4], z1 = bz + COLL[o+5];
    const trifft = e => { const hw = e.w/2; return x1 > e.x-hw && x0 < e.x+hw && z1 > e.z-hw && z0 < e.z+hw && y1 > e.y && y0 < e.y+e.h; };
    if(trifft(this.player) || this.mobs.some(trifft)) return true;
    for(const s of Netz.andere.values()) if(!s.tot && trifft(s)) return true;
    return false;
  },

  /* ── Setzen / Benutzen ───────────────────────────────────────────── */
  useAt(t){
    const w = this.world, p = this.player;
    if(!t){
      // ins Leere: ein Ei fliegt trotzdem, und Wasser schöpft man auch, wenn dahinter nichts in Reichweite ist
      const h = Inv.held();
      if(h && h.id === ITEM.egg) this.eiWerfen();
      else if(h && h.id === ITEM.bucket) this.schoepfen();
      return;
    }
    const id = w.getBlock(t.x,t.y,t.z), k = t.x+','+t.y+','+t.z;
    const s = Inv.held(), it = s ? items[s.id] : null;
    // Benutzbare Blöcke — geduckt baut man stattdessen daran
    if(!Input.sneak){
      if(id === B.TABLE){ Screens.oeffne('werkbank'); Sfx.block('hacken', B.TABLE, t.x, t.y, t.z, .6); return; }
      if(id === B.FURNACE || id === B.FURNACE_LIT){
        if(!w.furnaces.has(k)) w.furnaces.set(k, { in:null, fuel:null, out:null, burn:0, burnMax:0, cook:0, x:t.x, y:t.y, z:t.z });
        Screens.oeffne('ofen', k); return;
      }
      if(id === B.CHEST){
        if(!w.chests.has(k)) w.chests.set(k, new Array(27).fill(null));
        Screens.oeffne('truhe', k); Sfx.play('truhe_auf', t.x + .5, t.y + .5, t.z + .5); return;
      }
      if(isDoor(id)){ this.tuerSchalten(t.x, t.y, t.z); return; }
      if(id === B.BED){ this.schlafen(t.x, t.y, t.z); return; }
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
    if(s.id === ITEM.egg){ this.eiWerfen(); return; }
    const schwing = () => { p.swinging = true; p.swing = 0; HUD.refreshHotbar(); };
    // Knochenmehl: Weizen wächst sofort ein, zwei Stufen, auf Gras sprießt es
    if(s.id === ITEM.bone_meal){
      if(isWheat(id) && id < B.WHEAT + 3){
        w.setBlock(t.x, t.y, t.z, Math.min(B.WHEAT + 3, id + 1 + (Math.random() < .5 ? 1 : 0)));
      } else if(id === B.GRASS && t.ny === 1){
        for(let i = 0; i < 12; i++){
          const x = t.x + ((Math.random()*5)|0) - 2, z = t.z + ((Math.random()*5)|0) - 2, y = w.heightAt(x, z);
          if(w.getBlock(x, y, z) === B.GRASS && w.getBlock(x, y+1, z) === B.AIR)
            w.setBlock(x, y+1, z, Math.random() < .8 ? B.TALLGRASS : (Math.random() < .5 ? B.ROSE : B.DANDELION));
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
    if(!isBlockId(s.id)) return;
    const bd = blocks[s.id];
    if(!bd || !bd.item) return;
    let bx = t.x + t.nx, by = t.y + t.ny, bz = t.z + t.nz;
    // Gras und Blumen werden einfach ersetzt, wenn man sie selbst anklickt
    if(blocks[id] && blocks[id].replaceable && !isWasser(id)){ bx = t.x; by = t.y; bz = t.z; }
    const cur = w.getBlock(bx,by,bz);
    if(cur !== B.AIR && !(blocks[cur] && blocks[cur].replaceable)) return;
    let setzId = s.id;
    if(s.id === B.LADDER){
      if(t.ny !== 0 || !isOpaqueCube(id)){ hint('Leitern gehören an eine Wand'); return; }
      setzId = ladderId(SEITE.findIndex(([a, b]) => a === -t.nx && b === -t.nz));
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
    // Pflanzen, Fackeln und Betten brauchen Boden
    if((bd.model === 'cross' || s.id === B.TORCH || s.id === B.BED) && !blocksMovement(w.getBlock(bx,by-1,bz))) return;
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
    const w = this.world, di = doorInfo(w.getBlock(x,y,z));
    const y0 = di.oben ? y-1 : y;
    const neuSeite = di.offen ? DOOR_AUF.indexOf(di.seite) : DOOR_AUF[di.seite];
    const unten = doorId(0, !di.offen, neuSeite), oben = doorId(1, !di.offen, neuSeite);
    if(this.belegt(x,y0,z,unten) || this.belegt(x,y0+1,z,oben)){ hint('Geh erst aus der Tür'); return; }
    w.setBlock(x,y0,z,unten);
    if(isDoor(w.getBlock(x,y0+1,z))) w.setBlock(x,y0+1,z,oben);
    Sfx.play(di.offen ? 'tuer_zu' : 'tuer_auf', x + .5, y0 + 1, z + .5);
  },
  schlafen(x, y, z){
    const p = this.player;
    p.spawnX = x + 0.5; p.spawnY = y + 0.6; p.spawnZ = z + 0.5;
    if(Netz.istGast){ hint('Die Nacht überspringen kann nur der Host — dein Startpunkt ist jetzt hier', 2800); return; }
    if(Math.sin(this.sunAngle()) > 0.06){ hint('Schlafen geht nur nachts — dein Startpunkt ist jetzt hier', 2600); return; }
    if(this.mobs.some(m => m.def.hostile && Math.hypot(m.x - x, m.z - z) < 10 && Math.abs(m.y - y) < 5)){
      hint('Du kannst nicht schlafen, Zombies sind in der Nähe', 2400); return;
    }
    this.schlafT = 0.001;
    hint('Gute Nacht …', 1600);
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
  wesenImBlick(maxD){
    const p = this.player, f = p.forward(), o = [p.x, p.eyeY(), p.z];
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
      for(const m of this.mobs){
        if(m.dead) continue;
        const t = strahl(m, rand);
        if(t >= 0 && t < bestT){ bestT = t; best = m; }
      }
      if(best){ this.wesenT = bestT; return best; }
    }
    let bestDot = 0.9;
    for(const m of this.mobs){
      const dx = m.x-o[0], dy = (m.y+m.h*0.6)-o[1], dz = m.z-o[2];
      const d = Math.hypot(dx,dy,dz);
      if(d > maxD || m.dead) continue;
      const dot = (dx*f[0]+dy*f[1]+dz*f[2])/d;
      if(dot > bestDot){ bestDot = dot; best = m; this.wesenT = d; }
    }
    this.wesenGenau = false;
    return best;
  },
  attack(){
    const best = this.wesenImBlick(3.4);
    if(!best) return false;
    const p = this.player, s = Inv.held();
    const dmg = s && items[s.id] ? items[s.id].dmg : 1;
    const l = Math.hypot(best.x-p.x, best.z-p.z) || 1;
    this.mobTreffer(best, dmg, (best.x-p.x)/l, (best.z-p.z)/l);
    if(s && items[s.id] && items[s.id].dur && items[s.id].tool !== 'bow') Inv.damageHeld(1);
    this.player.addExhaustion(0.1);
    Sfx.wesen(best, 'au');
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
  /** Treffer auf ein Wesen, vom Schlag oder vom Pfeil */
  mobTreffer(m, dmg, kx, kz, von){
    if(m.dead) return;
    // Als Gast rechnet der Host: nur fragen, aufblitzen lassen
    if(Netz.istGast){ Netz.wesenAnfrage('treffer', m, { dmg, kx: r2(kx), kz: r2(kz) }); m.hurtTimer = 0.4; return; }
    m.health -= dmg; m.hurtTimer = 0.4;
    m.vx += kx*6; m.vz += kz*6; m.vy = Math.max(m.vy, 4.5);
    if(!m.def.hostile){ m.flucht = 4; m.fluchtX = kx; m.fluchtZ = kz; }   // Tiere laufen weg
    if(m.health <= 0){
      m.dead = true;
      if(!(m.kind > 0)){
        const beute = m.def.beute(m).filter(([, n]) => n > 0);
        // die Beute bekommt, wer getroffen hat — ein Mitspieler auf seinem Gerät
        if(von) Netz.beuteAn(von, beute, m.x, m.y + 0.4, m.z);
        else if(!this.player.creative) for(const [id, n] of beute) this.dropItem(id, n, m.x, m.y + 0.4, m.z);
      }
    }
  },
  /** Benutzen auf ein Wesen: füttern, Schaf scheren, Kuh melken */
  benutzeWesen(){
    const s = Inv.held(); if(!s) return false;
    const m = this.wesenImBlick(3.4); if(!m) return false;
    const p = this.player;
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
    if(von) Netz.beuteAn(von, [[B.WOOL + m.wolle, n]], m.x, m.y + 1, m.z);
    else for(let i = 0; i < n; i++) this.dropItem(B.WOOL + m.wolle, 1, m.x, m.y + 1, m.z);
  },

  /* ── Bogen und Pfeile ────────────────────────────────────────────── */
  hatPfeile(){ return this.player.creative || Inv.countOf(ITEM.arrow) > 0; },
  bogenStart(){
    const s = Inv.held();
    if(!s || s.id !== ITEM.bow) return false;
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
  /** Ei werfen: fliegt im Bogen, zerbricht, wo es auftrifft */
  eiWerfen(){
    const s = Inv.held();
    if(!s || s.id !== ITEM.egg) return false;
    const jetzt = performance.now();
    if(jetzt - (this._wurfT || 0) < 250) return true;
    this._wurfT = jetzt;
    const p = this.player, f = p.forward(), v = 20;
    const ei = new Pfeil(p.x + f[0]*0.4, p.eyeY() - 0.1 + f[1]*0.4, p.z + f[2]*0.4, f[0]*v, f[1]*v + 1.5, f[2]*v, 0, true, true);
    this.pfeile.push(ei);
    Netz.pfeilSenden(ei, true);
    if(!p.creative) Inv.consumeHeld();
    Sfx.play('werfen');
    p.swinging = true; p.swing = 0; HUD.refreshHotbar();
    return true;
  },
  /** Ein Ei zerbricht bei x, y, z: Schalen, Dotter, Geräusch. Wer es geworfen
      hat, würfelt wie beim Vorbild: 1 zu 8 schlüpft ein Küken, und davon
      1 zu 32 gleich vier. */
  eiZerbricht(a, x, y, z){
    Sfx.play('ei_kaputt', x, y, z);
    for(let k = 0; k < 8; k++)
      this.partikel.push({ x, y, z, t: 0, tex: k < 5 ? 'p_schale' : 'p_dotter', gr: 0.06 + Math.random()*0.05, dauer: 0.6 + Math.random()*0.35,
        fall: true, vx: (Math.random() - .5)*2.6, vy: 1.2 + Math.random()*2.2, vz: (Math.random() - .5)*2.6 });
    if(!a.vomSpieler || Math.random() >= 1/8) return;
    const n = Math.random() < 1/32 ? 4 : 1;
    if(Netz.istGast) Netz.kuekenAnfrage(x, y, z, n);
    else this.kuekenSchluepfen(x, y, z, n);
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
  updatePfeile(dt){
    const w = this.world, p = this.player;
    for(let i = this.pfeile.length - 1; i >= 0; i--){
      const a = this.pfeile[i];
      a.alter += dt;
      if(a.weg || a.alter > 40){ this.pfeile.splice(i, 1); continue; }
      if(a.steckt){
        // Pfeile des Spielers aufheben, sobald man nah ist; fremde verschwinden bald
        if(a.vomSpieler && !p.creative && Math.hypot(p.x - a.x, p.y + 0.9 - a.y, p.z - a.z) < 1.6){
          if(Inv.add(ITEM.arrow, 1) === 0){ Sfx.play('pickup'); HUD.refreshHotbar(); this.pfeile.splice(i, 1); continue; }
        }
        if(!a.vomSpieler && a.alter > 6) this.pfeile.splice(i, 1);
        continue;
      }
      a.vy -= (a.ei ? 12 : 20)*dt;
      const k = Math.pow(0.99, dt*60); a.vx *= k; a.vy *= k; a.vz *= k;
      a.rx = a.vx; a.ry = a.vy; a.rz = a.vz;
      const weg = Math.hypot(a.vx, a.vy, a.vz)*dt, n = Math.max(1, Math.ceil(weg/0.2));
      for(let j = 0; j < n && !a.steckt && !a.weg; j++){
        const ox = a.x, oy = a.y, oz = a.z;
        a.x += a.vx*dt/n; a.y += a.vy*dt/n; a.z += a.vz*dt/n;
        if(blocksMovement(w.getBlock(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)))){
          if(a.ei){ a.weg = true; this.eiZerbricht(a, ox, oy, oz); break; }
          a.steckt = true; a.alter = 0; Sfx.play('pfeil', a.x, a.y, a.z); break;
        }
        const tv = Math.hypot(a.vx, a.vz) || 1;
        // eigene Pfeile und Eier treffen Wesen; fremde Eier zerbrechen dort nur fürs Auge
        if(a.vomSpieler || a.ei){
          for(const m of this.mobs){
            if(m.dead || Math.abs(a.x - m.x) > m.w/2 + .1 || Math.abs(a.z - m.z) > m.w/2 + .1 || a.y < m.y || a.y > m.y + m.h) continue;
            if(a.vomSpieler){ this.mobTreffer(m, a.dmg, a.vx/tv*.6, a.vz/tv*.6); Sfx.wesen(m, 'au'); }
            a.weg = true;
            if(a.ei) this.eiZerbricht(a, ox, oy, oz);
            break;
          }
        } else if(!a.nurBild && !p.dead && Math.abs(a.x - p.x) < p.w/2 + .1 && Math.abs(a.z - p.z) < p.w/2 + .1 && a.y > p.y && a.y < p.y + p.h){
          if(p.hurt(a.dmg, 'Ein Skelett hat dich getroffen', a.vx/tv*.5, a.vz/tv*.5)){ this.hurtFlash = 1; Sfx.play('hurt'); }
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
      f.t = (f.t || 0) + schritt*(f.nass ? 1.7 : 1);
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
    const p = this.player, h = Inv.held();
    const l = [{ x:p.x, y:p.y, z:p.z, dead:p.dead, creative:p.creative, held: h ? h.id : 0, ich:true, g:null }];
    if(Netz.istHost) for(const g of Netz.gaeste.values())
      if(g.bereit) l.push({ x:g.x, y:g.y, z:g.z, dead:g.tot, creative:g.creative, held:g.held, ich:false, g });
    return l;
  },
  spawnMobs(dt){
    this.mobTimer -= dt;
    if(this.mobTimer > 0) return;
    // Wesen erscheinen rund um jeden Spieler, reihum
    const leute = this.spielerOrte().filter(q => !q.creative);
    this.mobTimer = 2.2 / Math.max(1, leute.length);
    if(!leute.length) return;
    const p = leute[(Math.random()*leute.length) | 0], w = this.world;
    let host = 0, pass = 0;
    // gezählt wird nur, was in der Nähe ist — ferne Weiden verhindern keine neuen Tiere
    for(const m of this.mobs){ if(Math.hypot(m.x - p.x, m.z - p.z) < 48) (m.def.hostile ? host++ : pass++); }
    const dl = this.dayLight();
    const wantHost = dl < 0.42 ? 14 : 5, wantPass = 12;
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
        this.mobs.push(new Mob(Math.random() < 0.4 ? 'skeleton' : 'zombie', x+0.5, y, z+0.5)); host++;
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
    const far = (this.settings.rd*CS) + 30;
    const leute = this.spielerOrte();
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
      if(m.attackCd > 0) m.attackCd -= dt;
      if(m.jumpCd > 0) m.jumpCd -= dt;

      let tx = 0, tz = 0, speed = m.def.speed, partner = null, eltern = null;
      const jagt = m.def.hostile && !!opfer && dist < 22;
      const heldId = z.held;
      if(jagt && m.def.fernkampf){
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
            if(p.hurt(m.def.dmg, 'Ein Zombie hat dich erwischt', -tx, -tz)){ m.attackCd = 1.1; this.hurtFlash = 1; Sfx.play('hurt'); }
          } else { Netz.autsch(z.g, m.def.dmg, 'Ein Zombie hat dich erwischt', -tx, -tz); m.attackCd = 1.1; }
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
          if(naechst.g) Netz.beuteAn(naechst.g, [[ITEM.egg, 1]], m.x, m.y + 0.3, m.z);
          else this.dropItem(ITEM.egg, 1, m.x, m.y + 0.3, m.z);
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

      // Physik
      const inW = imWasser(w, m);
      if(inW){ const zug = this.stroemungBei(m); m.vx += zug[0]*5*dt; m.vz += zug[2]*5*dt; }
      m.vy -= GRAV*dt*(inW ? 0.35 : 1);
      if(inW){ m.vy = Math.max(m.vy, -3); if(m.vy < 1.2) m.vy += 9*dt; }
      if(m.def.flattert && m.vy < -2.4) m.vy = -2.4;            // Hühner flattern: sie fallen langsam
      m.vy = Math.max(m.vy, -TERMINAL);
      const res = moveAABB(w, m, (tx*speed + m.vx)*dt, m.vy*dt, (tz*speed + m.vz)*dt);
      if((res.bx || res.bz) && m.onGround && m.jumpCd <= 0){ m.vy = 7.6; m.jumpCd = 0.5; }
      m.vx *= Math.pow(0.02, dt); m.vz *= Math.pow(0.02, dt);
      if(m.moving || tx || tz) m.walkPhase += dt*speed*3.2;

      // Sonnenbrand
      if(m.def.hostile && dl > 0.6){
        const lv = w.getLight(Math.floor(m.x), Math.floor(m.y+m.h), Math.floor(m.z));
        if((lv & 15) >= 14){ m.health -= dt*3.2; m.hurtTimer = 0.2; if(m.health <= 0) m.dead = true; }
      }
    }
  },
  updateDrops(dt){
    const p = this.player, w = this.world;
    for(let i=this.drops.length-1; i>=0; i--){
      const d = this.drops[i];
      d.age += dt; d.pickDelay -= dt;
      if(d.age > 300){ this.drops.splice(i,1); continue; }
      d.vy -= GRAV*dt;
      const inW = imWasser(w, d);
      if(inW){ d.vy = Math.max(d.vy, -1.6); if(d.vy < 1) d.vy += 7*dt;
        const zug = this.stroemungBei(d); d.vx += zug[0]*1.4*dt; d.vz += zug[2]*1.4*dt; }
      moveAABB(w, d, d.vx*dt, d.vy*dt, d.vz*dt);
      if(d.onGround){ d.vx *= Math.pow(0.005, dt); d.vz *= Math.pow(0.005, dt); }
      else { d.vx *= Math.pow(0.5, dt); d.vz *= Math.pow(0.5, dt); }
      const dx = p.x-d.x, dy = (p.y+0.9)-(d.y+0.14), dz = p.z-d.z;
      const dd = Math.hypot(dx,dy,dz);
      if(d.pickDelay <= 0 && dd < 1.6){
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

    const feetId = w.getBlock(Math.floor(p.x), Math.floor(p.y+0.1), Math.floor(p.z));
    const warImWasser = p.inWater;
    p.inWater = imWasser(w, p);
    if(p.inWater && !warImWasser && p.vy < -5) Sfx.play('platsch');
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
    if(p.inWater) speed *= 0.62;
    if(p.food <= 0) speed *= 0.7;
    p.stepUp = this.settings.autojump && !p.sneaking;

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
        Sfx.block('schritt', unten !== B.AIR ? unten : feetId, undefined, undefined, undefined, p.sneaking ? .45 : 1);
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

  /* ── Tageszeit ───────────────────────────────────────────────────── */
  sunAngle(){ return (this.time/DAY_LEN) * TAU; },
  dayLight(){
    const s = Math.sin(this.sunAngle());
    return 0.165 + 0.835 * clamp(s*2.1 + 0.34, 0, 1);
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
    // SCHLAG: mit dem Bogen in der Hand spannt Halten, Loslassen schießt
    hold('#btnAttack', () => { if(Game.bogenStart()) return;
                               this.attackHeld = true; if(!Game.attack()) this.digging = true; Game.player.swinging = true; Game.player.swing = 0; },
                       () => { if(Game.bogen.aktiv) Game.bogenLos(); this.attackHeld = false; this.digging = false; });
    hold('#btnMode', () => Game.eat());
    $('#btnInv').addEventListener('pointerdown', e => { e.preventDefault();
      if(Screens.open){ Screens.hide(); } else Screens.oeffne('inv'); });
    $('#btnPause').addEventListener('pointerdown', e => { e.preventDefault(); togglePause(); });

    // Hotbar
    $('#hotbar').addEventListener('pointerdown', e => {
      const s = e.target.closest('.slot'); if(!s) return;
      e.preventDefault(); Inv.sel = +s.dataset.i; HUD.refreshHotbar(); showItemName();
    });

  },

  zone(e){ return e.clientX < window.innerWidth*0.42 ? 'move' : 'look'; },
  /** Berührungen auf echten Bedienelementen gehören diesen, nicht der Welt */
  onWidget(e){
    const t = e.target;
    return !!(t && t.closest && t.closest('.tbtn, #hotbar, .screen, .mc-schirm, button, input'));
  },

  down(e){
    if(!Game.running || Screens.open || this.onWidget(e)) return;
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
        if(h && h.id === ITEM.egg){ if(!Game.benutzeWesen()) Game.useAt(Game.targetBlock()); }
        else if(!Game.benutzeWesen() && !Game.attack()) Game.useAt(Game.targetBlock());
        Game.player.swinging = true; Game.player.swing = 0;
      }
      this.lookId = null; this.digging = false; this.pendingTap = false;
    }
    if(e.pointerType === 'mouse') this.digging = false;
  },
  key(e, dn){
    const k = e.key.toLowerCase();
    // Titelbild und Optionen: Escape geht einen Schritt zurück, sonst nichts
    if(Menue.aktiv){ if(dn && k === 'escape') Menue.zurueck(); return; }
    if(!Game.running) return;
    if(dn && k === 'escape'){ if(Screens.open) Screens.hide(); else togglePause(); return; }
    if(Screens.open && Screens.open !== 'pause') { if(dn && (k === 'e')) Screens.hide(); return; }
    this.keys[k] = dn;
    if(dn && k >= '1' && k <= '9'){ Inv.sel = +k-1; HUD.refreshHotbar(); showItemName(); }
    if(dn && k === 'e') Screens.oeffne('inv');
    if(dn && k === 'f3'){ Game.settings.debug = !Game.settings.debug; $('#dbg').classList.toggle('on', Game.settings.debug); Game.saveOpts(); e.preventDefault(); }
    if(dn && k === 'f' && Game.player && Game.player.creative) Game.player.flying = !Game.player.flying;
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

function dropHeld(){
  const s = Inv.held(); if(!s) return;
  const p = Game.player, f = p.forward();
  Game.dropItem(s.id, 1, p.x + f[0]*0.6, p.eyeY()-0.3, p.z + f[2]*0.6);
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
    Game.time = (Game.time + dt) % DAY_LEN;
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
      } else if(q.t > 0) q.y += dt*0.55;
      if(q.t > (q.dauer || 1.3)) Game.partikel.splice(i, 1);
    }
    if(Game.bogen.aktiv){
      const s = Inv.held();
      if(!s || s.id !== ITEM.bow) Game.bogen.aktiv = false; else Game.bogen.t = Math.min(1.2, Game.bogen.t + dt);
    }
    if(!Netz.istGast){
      Game.tickFurnaces(dt);
      Game.tickFelder(dt);
      Game.spawnMobs(dt);
      Game.wasser.tick(dt);
    } else Game.wasser.naechste.clear();          // beim Gast fließt es, wie der Host es schickt
    if(!imMenue) handleDigging(dt);
  }
  Netz.tick(dt);
  /* Tod: gleich wodurch — Sturz, Zombie, Hunger. Früher prüfte das nur die
     Spielerbewegung selbst; wer von einem Zombie erschlagen wurde, blieb
     ohne Todesbildschirm einfach stehen. */
  if(Game.player.dead && Screens.open !== 'death'){
    Sfx.play('die'); $('#deathCause').textContent = Game.player.deathCause; Screens.show('death');
  }
  if(Game.platzSuchen && !Game.loading){
    Game.platzSuchen = false;
    Game.freierPlatz(Game.player.x, Game.player.z, true);
  }
  // Schlafen: abblenden, die Nacht überspringen, aufblenden
  if(Game.schlafT > 0){
    const vorher = Game.schlafT;
    Game.schlafT += dt;
    if(vorher < 1 && Game.schlafT >= 1){
      // die übersprungene Nacht zählt als Spielzeit: ein neuer Tag
      Game.gesamtZeit += (DAY_LEN - Game.time + DAY_LEN*0.01) % DAY_LEN;
      Game.time = DAY_LEN*0.01; hint('Guten Morgen', 1800); Game.save();
      if(Netz.istHost) Netz.zeitSenden();
    }
    const t = Game.schlafT;
    $('#schlaf').style.opacity = t < 1 ? t : Math.max(0, 1 - (t - 1.5)/0.9);
    if(t > 2.4){ Game.schlafT = 0; $('#schlaf').style.opacity = 0; }
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
    'Biom ' + BIO_NAME[w.biomeAt(x,z)] + '   Höhe ' + w.heightAt(x,z) + '\n' +
    'Licht Sonne ' + (lv & 15) + ' Block ' + (lv >> 4) + '   Tag ' + Game.dayLight().toFixed(2) + '\n' +
    'Zeit ' + String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0') +
    '   Mobs ' + Game.mobs.length + '   Objekte ' + Game.drops.length;
}

/* ═══════════════════════════════════════════════════════════════════
   SPIEL-KNÖPFE — alles Übrige an Menüs steht in menue.js
   ═══════════════════════════════════════════════════════════════════ */
function wireSpiel(){
  window.addEventListener('resize', () => Screens.masse());
  // Doppel-Tipp auf Sprung = fliegen (Kreativ)
  let lastJump = 0;
  $('#btnJump').addEventListener('pointerdown', () => {
    const n = performance.now();
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
  if(Screens.open === 'death') return true;
  if(Screens.open) Screens.hide(); else togglePause();
  return true;
};
/** Die App geht in den Hintergrund: anhalten und sichern */
window.androidPause = () => {
  if(!Game.running) return;
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
  // früher gab es nur »Ton an/aus«
  if(Game.settings.ton === false){ Game.settings.geraeusche = 0; delete Game.settings.ton; Game.saveOpts(); }
  Sfx.lautSetzen(Game.settings.geraeusche/100);
  Musik.lautSetzen(Game.settings.musik/100);
  Musik.laden();
  Input.init();
  wireSpiel();
  Netz.init();
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
  R, Game, gl, Screens, Inv, Geste, REZEPTE, rasterRezept, B, ITEM, blocks, items, TEX, texNames, Input, Menue, Speicher, Mob, Pfeil, MOBS, Netz,
  vaoHeil(){
    gl.bindVertexArray(R.cubeVAO);
    const ib = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
    gl.bindVertexArray(null);
    return ib === R.cubeIB;
  }
};
