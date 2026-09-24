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
  settings:{ rd:5, sens:12, autojump:true, debug:false },
  bufA: new MeshBuf(), bufB: new MeshBuf(),
  meshes: new Map(), lastSave:0, loading:true, loadTarget:1, loadDone:0,
  breakPos:null, breakProg:0, breakTotal:1, fps:60, _fpsAcc:0, _fpsN:0,
  hurtFlash:0, mobTimer:0, camShake:0,
  meta:null, gesamtZeit:0, panoramaAktiv:false, _panoZiel:0,
  pfeile:[], bogen:{ aktiv:false, t:0 },

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
    this.player = new Player();
    this.mobs = []; this.drops = []; this.pfeile = []; this.bogen.aktiv = false;
    this.meshes.forEach(m => { R.freeMesh(m.o); R.freeMesh(m.w); });
    this.meshes.clear();
    Inv.clear(); Inv.sel = 0;
    this.time = DAY_LEN*0.12;

    this.gesamtZeit = saved ? (saved.zeit || 0) : 0;
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
    $('#hud').classList.add('on');
    Screens.hide();
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
    this.mobs = []; this.drops = []; this.pfeile = []; this.bogen.aktiv = false;
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
    this.running = false;
    this.meta = null;
    $('#hud').classList.remove('on');
    Menue.ladeStand(false);
    this.panorama(null);
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
  save(sofort){
    if(!this.world || !this.meta || this.panoramaAktiv) return Promise.resolve(false);
    let text;
    try{
      const p = this.player;
      const mods = [];
      for(const [k, m] of this.world.mods){
        const arr = new Array(m.size*2); let i = 0;
        for(const [idx, id] of m){ arr[i++] = idx; arr[i++] = id; }
        mods.push([k, arr]);
      }
      const data = {
        seed: this.world.seedStr, time: this.time, zeit: this.gesamtZeit,
        p: { x:p.x, y:p.y, z:p.z, yaw:p.yaw, pitch:p.pitch, health:p.health, food:p.food,
             saturation:p.saturation, air:p.air, creative:p.creative,
             spawnX:p.spawnX, spawnY:p.spawnY, spawnZ:p.spawnZ },
        inv: Inv.slots.map(s => s ? [s.id, s.n, s.dur] : null),
        mods, furn: [...this.world.furnaces],
        truhen: [...this.world.chests].map(([k, a]) => [k, a.map(s => s ? [s.id, s.n, s.dur] : null)]),
        felder: [...this.world.crops],
        ruest: Inv.ruestung.map(s => s ? [s.id, s.n, s.dur] : null),
        bekannt: [...Inv.bekannt],
        rest: Screens.raster.concat([Inv.cursor]).filter(Boolean).map(s => [s.id, s.n, s.dur])
      };
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
        if(Math.abs(c.cx-pcx) > rd+2 || Math.abs(c.cz-pcz) > rd+2){
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
    Sfx.play('break');
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
    return trifft(this.player) || this.mobs.some(trifft);
  },

  /* ── Setzen / Benutzen ───────────────────────────────────────────── */
  useAt(t){
    const w = this.world, p = this.player;
    if(!t) return;
    const id = w.getBlock(t.x,t.y,t.z), k = t.x+','+t.y+','+t.z;
    const s = Inv.held(), it = s ? items[s.id] : null;
    // Benutzbare Blöcke — geduckt baut man stattdessen daran
    if(!Input.sneak){
      if(id === B.TABLE){ Screens.oeffne('werkbank'); Sfx.play('place'); return; }
      if(id === B.FURNACE || id === B.FURNACE_LIT){
        if(!w.furnaces.has(k)) w.furnaces.set(k, { in:null, fuel:null, out:null, burn:0, burnMax:0, cook:0, x:t.x, y:t.y, z:t.z });
        Screens.oeffne('ofen', k); return;
      }
      if(id === B.CHEST){
        if(!w.chests.has(k)) w.chests.set(k, new Array(27).fill(null));
        Screens.oeffne('truhe', k); Sfx.play('door'); return;
      }
      if(isDoor(id)){ this.tuerSchalten(t.x, t.y, t.z); return; }
      if(id === B.BED){ this.schlafen(t.x, t.y, t.z); return; }
    }
    if(!s) return;
    if(it && it.food){ this.eat(); return; }
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
      Sfx.play('dig'); schwing();
      return;
    }
    // Hacke: aus Erde wird Acker
    if(it && it.tool === 'hoe'){
      if((id === B.GRASS || id === B.DIRT) && t.ny === 1){
        const ob = w.getBlock(t.x,t.y+1,t.z);
        if(ob !== B.AIR && !(blocks[ob] && blocks[ob].replaceable)) return;
        if(ob !== B.AIR) w.setBlock(t.x,t.y+1,t.z,B.AIR);
        w.setBlock(t.x,t.y,t.z,B.FARMLAND);
        Sfx.play('dig'); if(!p.creative) Inv.damageHeld(1); schwing();
      }
      return;
    }
    // Säen
    if(s.id === ITEM.seeds){
      if(id === B.FARMLAND && t.ny === 1 && w.getBlock(t.x,t.y+1,t.z) === B.AIR){
        w.setBlock(t.x,t.y+1,t.z,B.WHEAT);
        w.crops.set(t.x+','+(t.y+1)+','+t.z, { t:0 });
        if(!p.creative) Inv.consumeHeld();
        Sfx.play('place'); schwing();
      } else hint('Weizenkörner brauchen Ackerboden — den macht eine Hacke aus Erde');
      return;
    }
    // Eimer schöpfen und ausgießen
    if(s.id === ITEM.bucket){
      const f = p.forward(), r = w.raycast(p.x, p.eyeY(), p.z, f[0], f[1], f[2], 5, true);
      if(r.hit && r.id === B.WATER){
        w.setBlock(r.x, r.y, r.z, B.AIR);
        if(!p.creative){ Inv.consumeHeld(); const rest = Inv.add(ITEM.water_bucket, 1); if(rest) this.dropItem(ITEM.water_bucket, 1, p.x, p.y+1, p.z); }
        Sfx.play('place'); schwing();
      }
      return;
    }
    if(s.id === ITEM.water_bucket){
      const bx = t.x + t.nx, by = t.y + t.ny, bz = t.z + t.nz, cur = w.getBlock(bx,by,bz);
      if(cur !== B.AIR && !(blocks[cur] && blocks[cur].replaceable)) return;
      w.setBlock(bx, by, bz, B.WATER);
      if(!p.creative) Inv.slots[Inv.sel] = Inv.make(ITEM.bucket, 1);
      Sfx.play('place'); schwing();
      return;
    }
    if(!isBlockId(s.id)) return;
    const bd = blocks[s.id];
    if(!bd || !bd.item) return;
    let bx = t.x + t.nx, by = t.y + t.ny, bz = t.z + t.nz;
    // Gras und Blumen werden einfach ersetzt, wenn man sie selbst anklickt
    if(blocks[id] && blocks[id].replaceable && id !== B.WATER){ bx = t.x; by = t.y; bz = t.z; }
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
      Sfx.play('place'); schwing();
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
      Sfx.play('place'); schwing();
    }
  },
  tuerSchalten(x, y, z){
    const w = this.world, di = doorInfo(w.getBlock(x,y,z));
    const y0 = di.oben ? y-1 : y;
    const neuSeite = di.offen ? DOOR_AUF.indexOf(di.seite) : DOOR_AUF[di.seite];
    const unten = doorId(0, !di.offen, neuSeite), oben = doorId(1, !di.offen, neuSeite);
    if(this.belegt(x,y0,z,unten) || this.belegt(x,y0+1,z,oben)){ hint('Geh erst aus der Tür'); return; }
    w.setBlock(x,y0,z,unten);
    if(isDoor(w.getBlock(x,y0+1,z))) w.setBlock(x,y0+1,z,oben);
    Sfx.play('door');
  },
  schlafen(x, y, z){
    const p = this.player;
    p.spawnX = x + 0.5; p.spawnY = y + 0.6; p.spawnZ = z + 0.5;
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
  /** das Wesen, auf das man schaut (bis maxD) */
  wesenImBlick(maxD){
    const p = this.player, f = p.forward();
    let best = null, bestD = maxD;
    for(const m of this.mobs){
      const dx = m.x-p.x, dy = (m.y+m.h*0.6)-p.eyeY(), dz = m.z-p.z;
      const d = Math.hypot(dx,dy,dz);
      if(d > bestD) continue;
      const dot = (dx*f[0]+dy*f[1]+dz*f[2])/d;
      if(dot < 0.86) continue;
      bestD = d; best = m;
    }
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
    Sfx.play('hit');
    return true;
  },
  /** Treffer auf ein Wesen, vom Schlag oder vom Pfeil */
  mobTreffer(m, dmg, kx, kz){
    if(m.dead) return;
    m.health -= dmg; m.hurtTimer = 0.4;
    m.vx += kx*6; m.vz += kz*6; m.vy = Math.max(m.vy, 4.5);
    if(!m.def.hostile){ m.flucht = 4; m.fluchtX = kx; m.fluchtZ = kz; }   // Tiere laufen weg
    if(m.health <= 0){
      m.dead = true;
      if(!this.player.creative) for(const [id, n] of m.def.beute(m)) if(n > 0) this.dropItem(id, n, m.x, m.y + 0.4, m.z);
    }
  },
  /** Benutzen auf ein Wesen: Schaf scheren, Kuh melken */
  benutzeWesen(){
    const s = Inv.held(); if(!s) return false;
    const m = this.wesenImBlick(3.4); if(!m) return false;
    const p = this.player;
    if(s.id === ITEM.shears && m.type === 'sheep' && !m.geschoren){
      m.geschoren = true; m.wolleT = 30 + Math.random()*60;
      for(let i = 0, n = zufallN(1, 3); i < n; i++) this.dropItem(B.WOOL + m.wolle, 1, m.x, m.y + 1, m.z);
      if(!p.creative) Inv.damageHeld(1);
      Sfx.play('schere'); p.swinging = true; p.swing = 0; HUD.refreshHotbar();
      return true;
    }
    if(s.id === ITEM.bucket && m.type === 'cow'){
      if(!p.creative){ Inv.consumeHeld(); const r = Inv.add(ITEM.milk_bucket, 1); if(r) this.dropItem(ITEM.milk_bucket, 1, p.x, p.y + 1, p.z); }
      Sfx.play('kuh'); p.swinging = true; p.swing = 0; HUD.refreshHotbar();
      return true;
    }
    return false;
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
    this.pfeile.push(new Pfeil(p.x + f[0]*0.4, p.eyeY() - 0.1 + f[1]*0.4, p.z + f[2]*0.4, f[0]*v, f[1]*v, f[2]*v,
      Math.round(2 + 7*kraft), true));
    if(!p.creative){ Inv.take(ITEM.arrow, 1); Inv.damageHeld(1); }
    Sfx.play('bogen'); HUD.refreshHotbar();
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
      a.vy -= 20*dt;
      const k = Math.pow(0.99, dt*60); a.vx *= k; a.vy *= k; a.vz *= k;
      a.rx = a.vx; a.ry = a.vy; a.rz = a.vz;
      const weg = Math.hypot(a.vx, a.vy, a.vz)*dt, n = Math.max(1, Math.ceil(weg/0.2));
      for(let j = 0; j < n && !a.steckt && !a.weg; j++){
        a.x += a.vx*dt/n; a.y += a.vy*dt/n; a.z += a.vz*dt/n;
        if(blocksMovement(w.getBlock(Math.floor(a.x), Math.floor(a.y), Math.floor(a.z)))){
          a.steckt = true; a.alter = 0; Sfx.play('pfeil'); break;
        }
        const tv = Math.hypot(a.vx, a.vz) || 1;
        if(a.vomSpieler){
          for(const m of this.mobs){
            if(m.dead || Math.abs(a.x - m.x) > m.w/2 + .1 || Math.abs(a.z - m.z) > m.w/2 + .1 || a.y < m.y || a.y > m.y + m.h) continue;
            this.mobTreffer(m, a.dmg, a.vx/tv*.6, a.vz/tv*.6);
            Sfx.play('hit'); a.weg = true; break;
          }
        } else if(!p.dead && Math.abs(a.x - p.x) < p.w/2 + .1 && Math.abs(a.z - p.z) < p.w/2 + .1 && a.y > p.y && a.y < p.y + p.h){
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
      if(w.getBlock(x+dx, y+dy, z+dz) === B.WATER) return true;
    return false;
  },

  /* ── Mobs ────────────────────────────────────────────────────────── */
  spawnMobs(dt){
    this.mobTimer -= dt;
    if(this.mobTimer > 0) return;
    this.mobTimer = 2.2;
    const p = this.player, w = this.world;
    if(p.creative) return;
    let host = 0, pass = 0;
    for(const m of this.mobs) (m.def.hostile ? host++ : pass++);
    const dl = this.dayLight();
    const wantHost = dl < 0.42 ? 14 : 5, wantPass = 12;
    for(let a=0; a<6; a++){
      const ang = Math.random()*TAU, r = 22 + Math.random()*22;
      const x = Math.floor(p.x + Math.cos(ang)*r), z = Math.floor(p.z + Math.sin(ang)*r);
      const cx = x>>4, cz = z>>4;
      if(!this.meshes.has(ckey(cx,cz))) continue;
      const h = w.heightAt(x,z);
      const y = h+1;
      if(y >= WH-2) continue;
      const ground = w.getBlock(x,h,z);
      if(!blocksMovement(ground) || ground === B.WATER) continue;
      if(blocksMovement(w.getBlock(x,y,z)) || blocksMovement(w.getBlock(x,y+1,z))) continue;
      const lv = w.getLight(x,y,z), sky = lv & 15, blk = lv >> 4;
      const bright = Math.max(sky*dl, blk);
      if(host < wantHost && bright < 6.5){
        this.mobs.push(new Mob(Math.random() < 0.4 ? 'skeleton' : 'zombie', x+0.5, y, z+0.5)); host++;
      } else if(pass < wantPass && bright > 8 && ground === B.GRASS){
        // Tiere kommen in kleinen Herden
        const r = Math.random(), art = r < 0.3 ? 'pig' : (r < 0.62 ? 'cow' : 'sheep');
        for(let k = 0, n = 1 + ((Math.random()*3)|0); k < n && pass < wantPass; k++){
          const hx = x + ((Math.random()*5)|0) - 2, hz = z + ((Math.random()*5)|0) - 2, hh = w.heightAt(hx, hz);
          if(w.getBlock(hx, hh, hz) !== B.GRASS || blocksMovement(w.getBlock(hx, hh+1, hz)) || blocksMovement(w.getBlock(hx, hh+2, hz))) continue;
          this.mobs.push(new Mob(art, hx+0.5, hh+1, hz+0.5)); pass++;
        }
      }
    }
  },
  updateMobs(dt){
    const p = this.player, w = this.world, dl = this.dayLight();
    const far = (this.settings.rd*CS) + 30;
    for(let i=this.mobs.length-1; i>=0; i--){
      const m = this.mobs[i];
      const dx = p.x-m.x, dz = p.z-m.z;
      const dist = Math.hypot(dx,dz);
      if(m.dead || dist > far || m.y < -4){
        if(m.dead) Sfx.play('hit');
        this.mobs.splice(i,1); continue;
      }
      m.age += dt;
      if(m.hurtTimer > 0) m.hurtTimer -= dt;
      if(m.attackCd > 0) m.attackCd -= dt;
      if(m.jumpCd > 0) m.jumpCd -= dt;

      let tx = 0, tz = 0, speed = m.def.speed;
      const jagt = m.def.hostile && dist < 22 && !p.dead && !p.creative;
      const held = Inv.held();
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
          const ax = m.x, ay = m.y + 1.5, az = m.z, zx = p.x, zy = p.y + 1.3, zz = p.z;
          if(this.freieSicht(ax, ay, az, zx, zy, zz)){
            const v = 18, flug = Math.hypot(zx-ax, zz-az)/v;
            const ungenau = () => (Math.random() - .5)*0.9;
            const vy = (zy - ay)/Math.max(flug, .1) + 0.5*20*flug;       // Fallen ausgleichen
            const hl = Math.hypot(zx-ax, zz-az) || 1;
            this.pfeile.push(new Pfeil(ax + ux*.5, ay, az + uz*.5, (zx-ax)/hl*v + ungenau(), vy + ungenau()*.5, (zz-az)/hl*v + ungenau(), 2 + ((Math.random()*3)|0), false));
            Sfx.play('bogen');
            m.schussCd = 1.8 + Math.random()*1.2;
          } else m.schussCd = 0.4;
        }
        if(Math.random() < 0.004) Sfx.play('skelett');
      } else if(jagt){
        const l = dist || 1; tx = dx/l; tz = dz/l;
        m.yaw = Math.atan2(-tx, -tz);
        m.moving = true;
        if(dist < 1.5 && Math.abs(p.y - m.y) < 2 && m.attackCd <= 0){
          if(p.hurt(m.def.dmg, 'Ein Zombie hat dich erwischt', -tx, -tz)){
            m.attackCd = 1.1; this.hurtFlash = 1; Sfx.play('hurt');
          }
        }
        if(Math.random() < 0.004) Sfx.play('zombie');
      } else if(!m.def.hostile && m.flucht > 0){
        // getroffen: ein paar Sekunden weg vom Spieler
        m.flucht -= dt;
        tx = m.fluchtX; tz = m.fluchtZ; m.yaw = Math.atan2(-tx, -tz); m.moving = true; speed *= 1.6;
      } else if(!m.def.hostile && held && held.id === ITEM.wheat && dist < 10 && dist > 2.2 && !p.dead){
        // Weizen in der Hand: Kühe, Schafe und Schweine laufen hinterher
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
        if(!m.def.hostile && Math.random() < 0.0012) Sfx.play(m.def.laut);
        if(held && held.id === ITEM.wheat && !m.def.hostile && dist <= 2.2){ m.yaw = Math.atan2(dx, dz) + Math.PI; m.moving = false; tx = tz = 0; }
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
      const inW = inBlockOfType(w, m, id => id === B.WATER);
      m.vy -= GRAV*dt*(inW ? 0.35 : 1);
      if(inW){ m.vy = Math.max(m.vy, -3); if(m.vy < 1.2) m.vy += 9*dt; }
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
      const inW = inBlockOfType(w, d, id => id === B.WATER);
      if(inW){ d.vy = Math.max(d.vy, -1.6); if(d.vy < 1) d.vy += 7*dt; }
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

  /* ── Spieler ─────────────────────────────────────────────────────── */
  updatePlayer(dt, input){
    const p = this.player, w = this.world;
    if(p.dead) return;
    if(p.hurtTimer > 0) p.hurtTimer -= dt;

    const feetId = w.getBlock(Math.floor(p.x), Math.floor(p.y+0.1), Math.floor(p.z));
    p.inWater = inBlockOfType(w, p, id => id === B.WATER);
    p.headInWater = w.getBlock(Math.floor(p.x), Math.floor(p.eyeY()), Math.floor(p.z)) === B.WATER;

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
      if(p.bob > this._lastStep + 2.6){ this._lastStep = p.bob; Sfx.play('step');
        p.addExhaustion(input.sprint ? 0.06 : 0.012); }
    } else this._lastStep = p.bob;

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
        // Tippen: erst Schere oder Eimer an einem Tier, dann Schlag, dann Block
        if(!Game.benutzeWesen() && !Game.attack()) Game.useAt(Game.targetBlock());
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

  const paused = Screens.open === 'pause' || Screens.open === 'death';
  Menue.ladeStand(Game.loading, Game.loadDone / Game.loadTarget);
  if(!paused){
    Game.time = (Game.time + dt) % DAY_LEN;
    Game.gesamtZeit += dt;
    if(!Game.loading || Game.world.getChunk(Math.floor(Game.player.x/CS), Math.floor(Game.player.z/CS))){
      Game.updatePlayer(dt, Input);
    }
    Game.updateMobs(dt);
    Game.updateDrops(dt);
    Game.updatePfeile(dt);
    if(Game.bogen.aktiv){
      const s = Inv.held();
      if(!s || s.id !== ITEM.bow) Game.bogen.aktiv = false; else Game.bogen.t = Math.min(1.2, Game.bogen.t + dt);
    }
    Game.tickFurnaces(dt);
    Game.tickFelder(dt);
    Game.spawnMobs(dt);
    handleDigging(dt);
  }
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

  render(dt);

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
  if(Game._digSnd > 0.22){ Game._digSnd = 0; Sfx.play('dig'); }
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
  if(Game.settings.ton === false) Sfx.on = false;
  Input.init();
  wireSpiel();
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
  R, Game, gl, Screens, Inv, Geste, REZEPTE, rasterRezept, B, ITEM, blocks, items, TEX, texNames, Input, Menue, Speicher, Mob, Pfeil, MOBS,
  vaoHeil(){
    gl.bindVertexArray(R.cubeVAO);
    const ib = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
    gl.bindVertexArray(null);
    return ib === R.cubeIB;
  }
};
