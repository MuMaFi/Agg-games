/* Pocketcraft · Mehr (seit 26.11)
   Was zu den neuen Blöcken und Gegenständen gehört und nicht schon in der
   Redstone-Schaltung steckt: TNT und Explosionen, Notenblock, Spender,
   Werfer und Trichter, der Lavaeimer, die Windkugel, der Streitkolben, der
   Speer und die Wurfscheibe. Die Methoden kommen in Game (spiel.js:
   Object.assign(Game, Mehr)), »this« ist also das Spiel. */
'use strict';

const TNT_ZUENDER = 4;                 // so lange zischt gezündetes TNT, wie beim Vorbild
const TNT_KRAFT = 4;                   // Sprengkraft wie beim Vorbild
const SPEER_REICH = 4.6;               // ein Stich reicht weiter als ein Schwert (3,4)
const SCHEIBE_TEMPO = 20;              // Blöcke je Sekunde
const istScheibe = id => !!(items[id] && items[id].tool === 'scheibe');
const istSpeer = id => !!(items[id] && items[id].tool === 'speer');

const Mehr = {
  /* ── Einrichten: was die Schaltung einer Welt vom Spiel braucht ───── */
  mehrEinrichten(w){
    w.tnts = [];
    const sch = w.schaltung;
    // Tageslicht: es muss Tag sein, und der Sensor muss den Himmel sehen
    sch.tag = (x, y, z) => dimVonWelt(w) === 'oben' && this.dayLight() > 0.45 && (w.getLight(x, y + 1, z) & 15) >= 10;
    sch.noteSpielen = (x, y, z, ton) => this.noteSpielen(w, x, y, z, ton);
    sch.tntZuenden = (x, y, z) => this.tntZuenden(w, x, y, z, TNT_ZUENDER);
    sch.auswerfen = (x, y, z, id) => this.inWelt(w, () => this.auswerfen(x, y, z, id));
    sch.trichterSchritt = (x, y, z, id) => this.inWelt(w, () => this.trichterSchritt(x, y, z, id));
  },
  /** fn in der Welt w rechnen (der Host rechnet die andere Welt mit) */
  inWelt(w, fn){
    if(w === this.world) return fn();
    const d = dimVonWelt(w);
    return (d === 'oben' ? this.oben : d === 'nether' ? this.nether : this.ende) === w ? this.inDim(d, fn) : undefined;
  },
  /** jeden Schritt: gezündetes TNT, Sturmangriff mit dem Speer */
  mehrTick(dt){
    const w = this.world;
    if(w.tnts && w.tnts.length) this.tntTick(w, dt);
    this.speerTick(dt);
  },

  /* ── Notenblock ─────────────────────────────────────────────────── */
  /** welches Instrument: nach dem Block darunter, wie beim Vorbild */
  instrument(id){
    if(id === B.GOLD_BLOCK) return 'bell';
    if(id === B.IRON_BLOCK) return 'eisen';
    if(id === B.TON) return 'flute';
    const m = materialVon(id);
    return m === 'stein' || m === 'metall' ? 'bd' : m === 'sand' || m === 'kies' ? 'snare' : m === 'glas' ? 'hat'
      : m === 'holz' ? 'bass' : m === 'wolle' ? 'guitar' : 'harp';
  },
  noteSpielen(w, x, y, z, ton){
    // wie beim Vorbild: über dem Notenblock muss Luft sein
    if(w.getBlock(x, y + 1, z) !== B.AIR || w !== this.world) return;
    Sfx.note(this.instrument(w.getBlock(x, y - 1, z)), ton, x + .5, y + .5, z + .5);
    const f = ton/24;
    this.partikel.push({ x: x + .5, y: y + 1.15, z: z + .5, t: 0, tex: 'p_note', gr: 0.22, dauer: 0.9, hell: true, farbe: f });
  },

  /* ── TNT und Explosionen ────────────────────────────────────────── */
  tntZuenden(w, x, y, z, zeit){
    if(w.getBlock(x, y, z) !== B.TNT) return;
    w.setBlock(x, y, z, B.AIR);
    (w.tnts || (w.tnts = [])).push({ x: x + .5, y, z: z + .5, vx: (Math.random() - .5)*0.4, vy: 2, vz: (Math.random() - .5)*0.4, t: zeit });
    if(w === this.world && !Sfx.probe('zuendschnur', { gain: .7, x: x + .5, y: y + .5, z: z + .5 })) Sfx.synth('rs_zischen');
  },
  tntTick(w, dt){
    for(let i = w.tnts.length - 1; i >= 0; i--){
      const t = w.tnts[i];
      t.t -= dt;
      t.vy -= 20*dt;
      const k = Math.pow(0.02, dt); t.vx *= k; t.vz *= k;
      const fest = (x, y, z) => blocksMovement(w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
      if(!fest(t.x + t.vx*dt, t.y + 0.01, t.z)) t.x += t.vx*dt; else t.vx = 0;
      if(!fest(t.x, t.y + 0.01, t.z + t.vz*dt)) t.z += t.vz*dt; else t.vz = 0;
      const ny = t.y + t.vy*dt;
      if(t.vy < 0 && fest(t.x, ny, t.z)){ t.y = Math.floor(ny) + 1; t.vy = 0; }
      else if(t.vy > 0 && fest(t.x, ny + 0.98, t.z)) t.vy = 0;
      else t.y = ny;
      if(t.y < -10) { w.tnts.splice(i, 1); continue; }
      if(t.t <= 0){ w.tnts.splice(i, 1); this.explosion(w, t.x, t.y + 0.49, t.z, TNT_KRAFT); }
    }
  },
  /** Explosion bei cx, cy, cz: Blöcke im Umkreis (zufällig ausgefranst) gehen kaputt,
      Wesen werden getroffen und weggestoßen, TNT daneben geht mit hoch */
  explosion(w, cx, cy, cz, kraft){
    const hier = w === this.world, p = this.player;
    if(hier && !this._fremd){
      if(!Sfx.probe('explosion', { gain: 1, x: cx, y: cy, z: cz, weit: 64 })) Sfx.synth('explosion');
      const d = Math.hypot(p.x - cx, p.y - cy, p.z - cz);
      this.camShake = Math.max(this.camShake || 0, clamp(1.2 - d/16, 0, 1));
      for(let k = 0; k < 26; k++)
        this.partikel.push({ x: cx + (Math.random() - .5)*kraft, y: cy + (Math.random() - .5)*kraft*.8, z: cz + (Math.random() - .5)*kraft,
          t: -k*0.008, tex: 'p_rauch', gr: 0.35 + Math.random()*0.5, dauer: 0.7 + Math.random()*0.8, hell: true });
    }
    // im Wasser bleibt alles heil, wie beim Vorbild
    const imWasser = isWasser(w.getBlock(Math.floor(cx), Math.floor(cy), Math.floor(cz)));
    if(!imWasser){
      const r = Math.ceil(kraft), weg = [];
      for(let dy = -r; dy <= r; dy++) for(let dz = -r; dz <= r; dz++) for(let dx = -r; dx <= r; dx++){
        const d = Math.hypot(dx, dy, dz);
        if(d > kraft*(0.7 + Math.random()*0.6)) continue;
        const x = Math.floor(cx) + dx, y = Math.floor(cy) + dy, z = Math.floor(cz) + dz;
        if(y < 1 || y >= WH) continue;
        const id = w.getBlock(x, y, z), b = blocks[id];
        if(id === B.AIR || isWasser(id) || id === B.LAVA || !b || b.hardness < 0 || b.hardness >= 50) continue;
        if(id === B.TNT){ this.tntZuenden(w, x, y, z, 0.5 + Math.random()); continue; }
        weg.push([x, y, z, id]);
      }
      for(const [x, y, z, id] of weg){
        const k = x + ',' + y + ',' + z, inhalt = [];
        if(behaelterGroesse(id)){ const t = w.chests.get(k); if(t) inhalt.push(...t); w.chests.delete(k); }
        if(id === B.FURNACE || id === B.FURNACE_LIT){ const f = w.furnaces.get(k); if(f) inhalt.push(f.in, f.fuel, f.out); w.furnaces.delete(k); }
        if(isWheat(id)) w.crops.delete(k);
        w.setBlock(x, y, z, B.AIR);
        if(!hier) continue;
        for(const st of inhalt) if(st) this.dropItem(st.id, st.n, x + .5, y + .5, z + .5, st.dur);
        // wie beim Vorbild fällt nur ein Teil der Blöcke heraus
        if(Math.random() < 1/kraft){ const dr = this.dropsFor(id, true); if(dr) for(const [i, n] of dr) this.dropItem(i, n, x + .5, y + .5, z + .5); }
      }
    }
    if(!hier) return;
    // Wesen und Spieler: getroffen, je näher, desto härter (Formel des Vorbilds)
    const reich = kraft*2;
    const wirkung = (ex, ey, ez) => { const d = Math.hypot(ex - cx, ey - cy, ez - cz); return d >= reich ? 0 : 1 - d/reich; };
    for(const m of this.mobs){
      if(m.dead) continue;
      const imp = wirkung(m.x, m.y + m.h/2, m.z); if(!imp) continue;
      const l = Math.hypot(m.x - cx, m.z - cz) || 1;
      this.mobTreffer(m, Math.round((imp*imp + imp)/2*7*reich + 1), (m.x - cx)/l*imp*1.6, (m.z - cz)/l*imp*1.6);
      m.vy = Math.max(m.vy, 6*imp);
    }
    for(const q of this.spielerOrte()){
      if(q.dead || q.creative) continue;
      const imp = wirkung(q.x, q.y + 0.9, q.z); if(!imp) continue;
      const l = Math.hypot(q.x - cx, q.z - cz) || 1, kx = (q.x - cx)/l, kz = (q.z - cz)/l, dmg = Math.round((imp*imp + imp)/2*7*reich + 1);
      if(q.ich){
        if(p.hurt(dmg, 'Du bist in die Luft geflogen', kx, kz)){ this.hurtFlash = 1; Sfx.play('hurt'); }
        p.vx += kx*imp*14; p.vz += kz*imp*14; p.vy = Math.max(p.vy, 9*imp); p.fallFrom = null;
      } else Netz.autsch(q.g, dmg, 'Ist in die Luft geflogen', kx, kz);
    }
    for(const d of this.drops){
      const imp = wirkung(d.x, d.y, d.z); if(!imp) continue;
      const l = Math.hypot(d.x - cx, d.y - cy, d.z - cz) || 1;
      d.vx += (d.x - cx)/l*imp*8; d.vy += 3 + imp*5; d.vz += (d.z - cz)/l*imp*8;
    }
  },

  /* ── Spender, Werfer, Trichter ──────────────────────────────────── */
  /** ein Behälter bei x, y, z: { fach(i), anzahl, legen(st) → Rest } — Truhen, Spender, Trichter, Öfen */
  behaelterBei(x, y, z, vonOben){
    const w = this.world, id = w.getBlock(x, y, z), k = x + ',' + y + ',' + z;
    if(behaelterGroesse(id)){
      let t = w.chests.get(k);
      if(!t){ t = new Array(behaelterGroesse(id)).fill(null); w.chests.set(k, t); }
      return {
        nehmen(){ for(let i = 0; i < t.length; i++) if(t[i]){ const st = t[i]; st.n--; const eins = Inv.make(st.id, 1, st.dur); if(st.n <= 0) t[i] = null; return eins; } return null; },
        legen(st){
          const max = stackOf(st.id);
          for(let i = 0; i < t.length; i++) if(t[i] && t[i].id === st.id && t[i].n < max && max > 1){ t[i].n++; return null; }
          for(let i = 0; i < t.length; i++) if(!t[i]){ t[i] = st; return null; }
          return st;
        },
      };
    }
    if(id === B.FURNACE || id === B.FURNACE_LIT){
      let f = w.furnaces.get(k);
      if(!f){ f = { in:null, fuel:null, out:null, burn:0, burnMax:0, cook:0, x, y, z }; w.furnaces.set(k, f); }
      const dazu = (feld, st) => {
        if(!f[feld]){ f[feld] = st; return null; }
        if(f[feld].id === st.id && f[feld].n < stackOf(st.id)){ f[feld].n++; return null; }
        return st;
      };
      return {
        nehmen(){ if(!f.out) return null; const eins = Inv.make(f.out.id, 1); f.out.n--; if(f.out.n <= 0) f.out = null; return eins; },
        // von oben in den Ofen, von der Seite auf die Glut — wie beim Vorbild
        legen(st){ return vonOben ? (SMELT[st.id] !== undefined ? dazu('in', st) : st) : (fuelValue(st.id) > 0 ? dazu('fuel', st) : st); },
      };
    }
    return null;
  },
  /** ein Trichter: einen Gegenstand weiterreichen, einen hereinholen */
  trichterSchritt(x, y, z, id){
    const w = this.world, t = this.behaelterBei(x, y, z);
    if(!t) return;
    const k = x + ',' + y + ',' + z, fach = w.chests.get(k);
    let geaendert = false;
    // weiterreichen: der erste Gegenstand geht in den Behälter, auf den das Rohr zeigt
    const [dx, dy, dz] = trichterZiel(id);
    const ziel = this.behaelterBei(x + dx, y + dy, z + dz, dy < 0);
    if(ziel){
      const st = t.nehmen();
      if(st){ const rest = ziel.legen(st); if(rest) t.legen(rest); else { geaendert = true; w.schaltung.inhalt(x + dx, y + dy, z + dz); } }
    }
    // hereinholen: aus dem Behälter darüber — oder was oben auf dem Trichter liegt
    if(fach.some(s => !s) || fach.some(s => s && s.n < stackOf(s.id))){
      // ein Trichter darüber, der nach unten zeigt, schiebt selbst — aus ihm wird nicht gezogen
      const obenId = w.getBlock(x, y + 1, z), oben = obenId === B.TRICHTER ? null : this.behaelterBei(x, y + 1, z);
      if(oben){
        const st = oben.nehmen();
        if(st){ const rest = t.legen(st); if(rest) oben.legen(rest); else { geaendert = true; w.schaltung.inhalt(x, y + 1, z); } }
      } else if(!blocksMovement(w.getBlock(x, y + 1, z))){
        for(const d of this.drops){
          if(d.dead || d.pickDelay > 0.2 || Math.abs(d.x - (x + .5)) > .7 || Math.abs(d.z - (z + .5)) > .7 || d.y < y + .5 || d.y > y + 1.9) continue;
          const st = Inv.make(d.id, 1, d.dur);
          if(t.legen(st)) break;
          d.count--; if(d.count <= 0) d.dead = true;
          geaendert = true;
          break;
        }
      }
    }
    if(geaendert){
      w.schaltung.inhalt(x, y, z);
      if(Screens.open === 'beh' && Screens.modus === 'truhe') Screens.render();
    }
  },
  /** Spender oder Werfer ausgelöst: ein zufälliges volles Fach — der Werfer wirft
      es aus, der Spender benutzt es, wenn er kann (Pfeile, Eier, Windkugeln,
      Eimer, TNT, Feuerzeug), sonst wirft auch er */
  auswerfen(x, y, z, id){
    const w = this.world, k = x + ',' + y + ',' + z, t = w.chests.get(k);
    const r = auswurfRichtung(id), [dx, dy, dz] = RICHTUNG6[r];
    const voll = t ? t.map((s, i) => s ? i : -1).filter(i => i >= 0) : [];
    if(!voll.length){ Sfx.play('rs_aus', x + .5, y + .5, z + .5); return; }
    const i = voll[(Math.random()*voll.length) | 0], st = t[i];
    const ax = x + .5 + dx*.7, ay = y + .5 + dy*.7 - (dy === 0 ? .15 : 0), az = z + .5 + dz*.7;
    const fx = x + dx, fy = y + dy, fz = z + dz, vor = w.getBlock(fx, fy, fz);
    const einsWeg = () => { st.n--; if(st.n <= 0) t[i] = null; };
    const fertig = () => { w.schaltung.inhalt(x, y, z); if(Screens.open === 'beh' && Screens.truheKey === k) Screens.render(); };
    if(isSpender(id)){
      const frei = vor === B.AIR || (blocks[vor] && blocks[vor].replaceable && !isWasser(vor) && vor !== B.LAVA);
      if(st.id === ITEM.arrow || st.id === ITEM.egg || st.id === ITEM.windkugel){
        const v = st.id === ITEM.arrow ? 22 : 16, pf = new Pfeil(ax, ay, az, dx*v, dy*v + (dy ? 0 : 1.2), dz*v, st.id === ITEM.arrow ? 6 : 0, true, st.id !== ITEM.arrow);
        pf.vomSpender = true;
        if(st.id === ITEM.windkugel){ pf.wind = true; pf.dmg = 1; }
        this.pfeile.push(pf); einsWeg();
        Sfx.play(st.id === ITEM.arrow ? 'bogen' : 'werfen', x + .5, y + .5, z + .5);
        return fertig();
      }
      if((st.id === ITEM.water_bucket || st.id === ITEM.lava_bucket) && frei){
        w.setBlock(fx, fy, fz, st.id === ITEM.water_bucket ? B.WATER : B.LAVA);
        t[i] = Inv.make(ITEM.bucket, 1);
        Sfx.play('platsch', fx + .5, fy + .5, fz + .5);
        return fertig();
      }
      if(st.id === ITEM.bucket && (vor === B.WATER || vor === B.LAVA)){
        w.setBlock(fx, fy, fz, B.AIR);
        const neu = Inv.make(vor === B.WATER ? ITEM.water_bucket : ITEM.lava_bucket, 1);
        einsWeg();
        const p = this.behaelterBei(x, y, z); if(p.legen(neu)) this.dropItem(neu.id, 1, ax, ay, az);
        Sfx.play('platsch', fx + .5, fy + .5, fz + .5);
        return fertig();
      }
      if(st.id === B.TNT && frei){
        w.setBlock(fx, fy, fz, B.TNT); this.tntZuenden(w, fx, fy, fz, TNT_ZUENDER); einsWeg();
        return fertig();
      }
      if(st.id === ITEM.feuerzeug && frei && blocksMovement(w.getBlock(fx, fy - 1, fz))){
        w.setBlock(fx, fy, fz, B.FEUER);
        st.dur = (st.dur || 64) - 1; if(st.dur <= 0) t[i] = null;
        return fertig();
      }
      if(st.id === ITEM.feuerzeug && vor === B.TNT){ this.tntZuenden(w, fx, fy, fz, TNT_ZUENDER); st.dur = (st.dur || 64) - 1; if(st.dur <= 0) t[i] = null; return fertig(); }
    } else {
      // der Werfer legt in einen Behälter davor, statt zu werfen
      const ziel = this.behaelterBei(fx, fy, fz, dy < 0);
      if(ziel){
        const eins = Inv.make(st.id, 1, st.dur);
        if(!ziel.legen(eins)){ einsWeg(); w.schaltung.inhalt(fx, fy, fz); Sfx.play('rs_an', x + .5, y + .5, z + .5); }
        return fertig();
      }
    }
    einsWeg();
    this.dropItem(st.id, 1, ax, ay, az, st.dur, [dx*5 + (Math.random() - .5), dy*5 + 1.5, dz*5 + (Math.random() - .5), 0.3]);
    Sfx.play('rs_an', x + .5, y + .5, z + .5);
    fertig();
  },

  /* ── Lavaeimer ──────────────────────────────────────────────────── */
  lavaGiessen(t){
    const w = this.world, p = this.player;
    const bx = t.x + t.nx, by = t.y + t.ny, bz = t.z + t.nz, cur = w.getBlock(bx, by, bz);
    if(cur !== B.AIR && !(blocks[cur] && blocks[cur].replaceable)) return;
    w.setBlock(bx, by, bz, isWasser(cur) ? B.OBSIDIAN : B.LAVA);
    if(!p.creative) Inv.slots[Inv.sel] = Inv.make(ITEM.bucket, 1);
    Sfx.play('platsch', bx + .5, by + .5, bz + .5);
    p.swinging = true; p.swing = 0; HUD.refreshHotbar();
  },

  /* ── Windkugel ──────────────────────────────────────────────────── */
  /** Windstoß bei x, y, z: stößt Wesen und Spieler weg (wer darüber steht,
      fliegt hoch) und legt Hebel, Knöpfe, Türen und Falltüren um */
  windStoss(x, y, z){
    const w = this.world, p = this.player, R = 2.6;
    if(!Sfx.probe('windstoss', { gain: .8, x, y, z })) { Sfx.noise(0.35, 0.18, 1800); Sfx.tone(180, 0.25, 'sine', 0.06, 0.5); }
    for(let k = 0; k < 14; k++){
      const a = Math.random()*TAU, v = 2 + Math.random()*3;
      this.partikel.push({ x, y, z, t: -k*0.01, tex: 'p_wind', gr: 0.2 + Math.random()*0.2, dauer: 0.5, hell: true, fliegt: true,
        vx: Math.cos(a)*v, vy: (Math.random() - .3)*v, vz: Math.sin(a)*v });
    }
    const stoss = (e, eh, istSpieler) => {
      const dx = e.x - x, dy = e.y + eh/2 - y, dz = e.z - z, d = Math.hypot(dx, dy, dz);
      if(d > R) return false;
      const s = 1 - d/R, l = d || 1;
      e.vx = (e.vx || 0) + dx/l*9*s; e.vz = (e.vz || 0) + dz/l*9*s;
      e.vy = Math.max(e.vy || 0, (istSpieler ? 13 : 8)*s + 2);
      return true;
    };
    if(!p.dead && stoss(p, p.h, true)){ p.fallFrom = null; p.onGround = false; }
    for(const m of this.mobs) if(!m.dead && !m.def.drache) stoss(m, m.h, false);
    // Bauteile im Umkreis von einem Block umlegen
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    for(let dy = -1; dy <= 1; dy++) for(let dz = -1; dz <= 1; dz++) for(let dx = -1; dx <= 1; dx++){
      const X = bx + dx, Y = by + dy, Z = bz + dz, id = w.getBlock(X, Y, Z);
      if(isHebel(id)) w.setBlock(X, Y, Z, hebelId(!rsAn(id), rsAnbau(id)));
      else if(isKnopf(id) && !rsAn(id)) w.setBlock(X, Y, Z, knopfUm(id, true));
      else if(isDoor(id) && !isEisentuer(id) && !doorInfo(id).oben) this.tuerStellen(X, Y, Z, !doorInfo(id).offen);
      else if(isFalltuer(id) && !isEisenfalltuer(id)){ const f = falltuerInfo(id); w.setBlock(X, Y, Z, falltuerId(B.FALLTUER, f.seite, !f.offen, f.oben)); }
    }
  },

  /* ── Streitkolben ───────────────────────────────────────────────── */
  /** Schmetterschlag aus dem Fall: wie viel Schaden dazukommt (beim Vorbild
      vier je Block für die ersten drei, dann zwei bis acht, danach einer) */
  kolbenBonus(fall){
    return 4*Math.min(fall, 3) + 2*clamp(fall - 3, 0, 5) + Math.max(0, fall - 8);
  },
  kolbenSchmettern(ziel, fall){
    const p = this.player;
    p.fallFrom = null; p.vy = Math.max(p.vy, 4);          // man fängt sich am Getroffenen ab
    this.camShake = Math.max(this.camShake || 0, clamp(0.15 + fall*0.03, 0, 0.5));
    for(let k = 0; k < 12; k++){
      const a = Math.random()*TAU;
      this.partikel.push({ x: ziel.x + Math.cos(a)*0.6, y: ziel.y + 0.1, z: ziel.z + Math.sin(a)*0.6, t: -k*0.01, tex: 'p_rauch', gr: 0.25, dauer: 0.6,
        hell: true, fliegt: true, vx: Math.cos(a)*3, vy: 0.6, vz: Math.sin(a)*3 });
    }
    // was drumherum steht, wird weggeschleudert
    for(const m of this.mobs){
      if(m === ziel || m.dead) continue;
      const dx = m.x - ziel.x, dz = m.z - ziel.z, d = Math.hypot(dx, dz);
      if(d > 3.5 || Math.abs(m.y - ziel.y) > 2) continue;
      const s = 1 - d/3.5;
      m.vx += dx/(d || 1)*7*s; m.vz += dz/(d || 1)*7*s; m.vy = Math.max(m.vy, 5*s);
    }
  },

  /* ── Speer: Sturmangriff ────────────────────────────────────────── */
  speerStart(vonSchlag){
    this.bogen.aktiv = true; this.bogen.t = 0; this.bogen.speer = true; this.bogen.vonSchlag = !!vonSchlag;
    this._speer = { t: 0, x: this.player.x, z: this.player.z, getroffen: new Set() };
    return true;
  },
  speerLos(){
    const kurz = this._speer && this._speer.t < 0.25, schlag = this.bogen.vonSchlag;
    this.bogen.aktiv = false; this.bogen.speer = false; this._speer = null;
    // kurz getippt: ein gewöhnlicher Stich
    if(kurz && schlag) this.attack();
  },
  speerTick(dt){
    const sp = this._speer;
    if(!sp) return;
    if(!this.bogen.aktiv || !this.bogen.speer){ this._speer = null; return; }
    const p = this.player, s = Inv.held();
    if(!s || !istSpeer(s.id) || p.dead){ this.bogen.aktiv = false; this.bogen.speer = false; this._speer = null; return; }
    sp.t += dt;
    const v = Math.hypot(p.x - sp.x, p.z - sp.z)/Math.max(dt, 1e-3);
    sp.x = p.x; sp.z = p.z;
    if(sp.t > 4){ this.bogen.aktiv = false; this.bogen.speer = false; this._speer = null; hint('Der Sturmangriff ist vorbei — loslassen und neu ansetzen', 1600); return; }
    if(sp.t < 0.25 || v < 2.5) return;
    const ziel = this.wesenImBlick(SPEER_REICH, true);
    if(!ziel || sp.getroffen.has(ziel)) return;
    sp.getroffen.add(ziel);
    const it = items[s.id], dmg = Math.round(it.dmg*0.5 + v*1.15 + (p.vy < -2 ? -p.vy*0.4 : 0));
    const l = Math.hypot(ziel.x - p.x, ziel.z - p.z) || 1, kx = (ziel.x - p.x)/l, kz = (ziel.z - p.z)/l;
    if(ziel instanceof Mob) this.mobTreffer(ziel, dmg, kx*2.2, kz*2.2); else { ziel.rotT = 0.4; Netz.pvpTreffer(ziel, dmg, kx*2.2, kz*2.2); }
    Sfx.probe('angriff_stark', { gain: .7, rate: zufall(.85, .95), x: ziel.x, y: ziel.y + 1, z: ziel.z });
    if(ziel instanceof Mob) Sfx.wesen(ziel, 'au');
    if(!p.creative) Inv.damageHeld(1);
    p.swinging = true; p.swing = 0; HUD.refreshHotbar();
  },

  /* ── Wurfscheibe ────────────────────────────────────────────────── */
  scheibeWerfen(){
    const p = this.player, s = Inv.held();
    if(!s || !istScheibe(s.id) || this.bett) return false;
    if(this.pfeile.some(a => a.scheibe && !a.weg)) return true;           // eine nach der anderen
    const f = p.forward();
    const a = new Pfeil(p.x + f[0]*0.5, p.eyeY() - 0.25 + f[1]*0.5, p.z + f[2]*0.5, f[0]*SCHEIBE_TEMPO, f[1]*SCHEIBE_TEMPO, f[2]*SCHEIBE_TEMPO,
      items[s.id].scheibe, true, false);
    a.scheibe = { stapel: s, fach: Inv.sel, getroffen: new Set(), zurueck: false, weg: 0, prall: 0 };
    Inv.slots[Inv.sel] = null;
    this.pfeile.push(a);
    Sfx.play('werfen'); p.swinging = true; p.swing = 0; HUD.refreshHotbar();
    return true;
  },
  /** die Scheibe fliegt: vorwärts, prallt von Wänden ab, kehrt um und fliegt
      durch alles zurück in die Hand; trifft jedes Wesen einmal je Richtung.
      true: sie ist weg (zurück oder liegen geblieben) */
  scheibeFliegt(a, dt){
    const w = this.world, p = this.player, sc = a.scheibe;
    if(p.dead || a.alter > 10){ this.scheibeAblegen(a, true); return true; }
    const v = Math.hypot(a.vx, a.vy, a.vz) || SCHEIBE_TEMPO;
    if(!sc.zurueck && (sc.weg > 16 || a.alter > 1.1 || sc.prall > 3)){ sc.zurueck = true; sc.getroffen.clear(); }
    if(sc.zurueck){
      const dx = p.x - a.x, dy = p.eyeY() - 0.5 - a.y, dz = p.z - a.z, d = Math.hypot(dx, dy, dz);
      if(d < 1.1){ this.scheibeAblegen(a, false); return true; }
      const tempo = Math.min(28, SCHEIBE_TEMPO + a.alter*4);
      a.vx = dx/d*tempo; a.vy = dy/d*tempo; a.vz = dz/d*tempo;
    }
    a.rx = a.vx; a.ry = a.vy; a.rz = a.vz;
    const n = Math.max(1, Math.ceil(v*dt/0.2));
    for(let j = 0; j < n; j++){
      const sx = a.vx*dt/n, sy = a.vy*dt/n, sz = a.vz*dt/n;
      const fest = (x, y, z) => blocksMovement(w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)));
      if(!sc.zurueck && fest(a.x + sx, a.y + sy, a.z + sz)){
        const hx = Math.floor(a.x + sx), hy = Math.floor(a.y + sy), hz = Math.floor(a.z + sz);
        if(w.getBlock(hx, hy, hz) === B.ZIELBLOCK && !Netz.istGast) w.schaltung.zielTreffer(hx, hy, hz);
        // abprallen: die Richtung umkehren, in der die Wand liegt
        if(fest(a.x + sx, a.y, a.z)) a.vx = -a.vx;
        if(fest(a.x, a.y + sy, a.z)) a.vy = -a.vy;
        if(fest(a.x, a.y, a.z + sz)) a.vz = -a.vz;
        if(!fest(a.x + sx, a.y, a.z) && !fest(a.x, a.y + sy, a.z) && !fest(a.x, a.y, a.z + sz)){ a.vx = -a.vx; a.vy = -a.vy; a.vz = -a.vz; }
        sc.prall++;
        Sfx.play('pfeil', a.x, a.y, a.z);
        break;
      }
      a.x += sx; a.y += sy; a.z += sz;
      sc.weg += Math.hypot(sx, sy, sz);
      const tv = Math.hypot(a.vx, a.vz) || 1;
      for(const m of this.mobs){
        if(m.dead || sc.getroffen.has(m) || Math.abs(a.x - m.x) > m.w/2 + .25 || Math.abs(a.z - m.z) > m.w/2 + .25 || a.y < m.y - .1 || a.y > m.y + m.h + .1) continue;
        sc.getroffen.add(m);
        this.mobTreffer(m, a.dmg, a.vx/tv*.5, a.vz/tv*.5); Sfx.wesen(m, 'au');
      }
      for(const g of this.gegner()){
        if(sc.getroffen.has(g) || Math.abs(a.x - g.x) > .55 || Math.abs(a.z - g.z) > .55 || a.y < g.y || a.y > g.y + 1.8) continue;
        sc.getroffen.add(g); g.rotT = 0.4; Netz.pvpTreffer(g, a.dmg, a.vx/tv*.5, a.vz/tv*.5);
      }
    }
    return false;
  },
  /** zurück in die Hand (ins Fach, aus dem sie kam) — oder liegen lassen */
  scheibeAblegen(a, liegen){
    const sc = a.scheibe, st = sc.stapel, p = this.player;
    a.weg = true;
    if(!p.creative) st.dur = (st.dur || items[st.id].dur) - 1;
    if(st.dur <= 0 && !p.creative){ Sfx.play('break'); hint(nameOf(st.id) + ' ist zerbrochen'); return; }
    if(liegen){ this.dropItem(st.id, 1, a.x, a.y, a.z, st.dur); return; }
    if(!Inv.slots[sc.fach]) Inv.slots[sc.fach] = st;
    else { const rest = Inv.addStack(st); if(rest) this.dropItem(st.id, 1, p.x, p.y + 1, p.z, st.dur); }
    Sfx.play('pickup'); HUD.refreshHotbar();
  },
};
