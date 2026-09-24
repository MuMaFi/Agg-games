/* Pocketcraft · Inventar und Handwerk
   Herstellen geht wie an einer echten Werkbank: Zutaten werden in ein
   Raster gelegt — 2 × 2 im Inventar, 3 × 3 an der Werkbank — und das
   Muster entscheidet, was herauskommt. Eine Spitzhacke ist drei Stück
   Material oben und zwei Stöcke darunter, nicht »3 Holz und 2 Stöcke
   irgendwo in der Tasche«. Das Rezeptbuch kennt alle Muster, die man
   schon entdeckt hat, und legt sie auf Wunsch selbst ins Raster. */
'use strict';

/* ── DOM-Hilfen ────────────────────────────────────────────────────── */
const $ = s => document.querySelector(s);
const el = (tag, cls) => { const e = document.createElement(tag); if(cls) e.className = cls; return e; };

/* ── Inventar ──────────────────────────────────────────────────────── */
const Inv = {
  slots: new Array(36).fill(null),
  ruestung: [null, null, null, null],      // Kopf, Brust, Beine, Füße
  sel: 0,
  cursor: null,
  bekannt: new Set(),                      // alles, was man je in der Hand hatte

  make(id, n, dur){ const d = defOf(id); return { id, n, dur: dur !== undefined ? dur : (d && d.dur ? d.dur : 0) }; },
  clear(){ this.slots.fill(null); this.ruestung.fill(null); this.cursor = null; this.bekannt.clear(); },

  /** legt Gegenstände ab, gibt den Rest zurück */
  add(id, n){
    const max = stackOf(id);
    if(n > 0) this.bekannt.add(id);
    if(max > 1){
      for(let i=0; i<36 && n>0; i++){
        const s = this.slots[i];
        if(s && s.id === id && s.n < max){ const take = Math.min(max - s.n, n); s.n += take; n -= take; }
      }
    }
    for(let i=0; i<36 && n>0; i++){
      if(!this.slots[i]){ const take = Math.min(max, n); this.slots[i] = this.make(id, take); n -= take; }
    }
    return n;
  },
  /** ganzen Stapel ablegen, Haltbarkeit bleibt; gibt den Rest oder null zurück */
  addStack(st){
    if(!st) return null;
    this.bekannt.add(st.id);
    const max = stackOf(st.id);
    if(max > 1){
      for(let i=0; i<36 && st.n>0; i++){
        const s = this.slots[i];
        if(s && s.id === st.id && s.n < max){ const t = Math.min(max - s.n, st.n); s.n += t; st.n -= t; }
      }
    }
    for(let i=0; i<36 && st.n>0; i++){
      if(this.slots[i]) continue;
      if(st.n <= max){ this.slots[i] = st; return null; }
      this.slots[i] = this.make(st.id, max, st.dur); st.n -= max;
    }
    return st.n > 0 ? st : null;
  },
  platzFuer(id, n){
    const max = stackOf(id);
    for(const s of this.slots){
      if(!s) n -= max; else if(s.id === id && max > 1) n -= max - s.n;
      if(n <= 0) return true;
    }
    return n <= 0;
  },
  countOf(id){ let c = 0; for(const s of this.slots) if(s && s.id === id) c += s.n; return c; },
  take(id, n){
    for(let i=0; i<36 && n>0; i++){
      const s = this.slots[i];
      if(s && s.id === id){ const t = Math.min(s.n, n); s.n -= t; n -= t; if(s.n <= 0) this.slots[i] = null; }
    }
    return n === 0;
  },
  held(){ return this.slots[this.sel]; },
  damageHeld(amount){
    const s = this.held();
    if(!s || !items[s.id] || !items[s.id].dur) return;
    s.dur -= amount;
    if(s.dur <= 0){ this.slots[this.sel] = null; Sfx.play('break'); hint(nameOf(s.id) + ' ist zerbrochen'); }
  },
  consumeHeld(){
    const s = this.held();
    if(!s) return;
    s.n--; if(s.n <= 0) this.slots[this.sel] = null;
  },
  merkeAlles(){
    for(const s of this.slots) if(s) this.bekannt.add(s.id);
    for(const s of this.ruestung) if(s) this.bekannt.add(s.id);
  }
};

/* ── Rüstung ───────────────────────────────────────────────────────── */
const Ruestung = {
  punkte(){
    let p = 0;
    for(const s of Inv.ruestung) if(s && items[s.id] && items[s.id].armor) p += items[s.id].armor.pts;
    return p;
  },
  /** Treffer von Wesen: Rüstung fängt 4 % je Punkt ab und nutzt sich dabei ab */
  abfangen(dmg){
    const p = this.punkte();
    if(!p) return dmg;
    for(let i=0; i<4; i++){
      const s = Inv.ruestung[i];
      if(!s) continue;
      s.dur -= 1;
      if(s.dur <= 0){ Inv.ruestung[i] = null; Sfx.play('break'); hint(nameOf(s.id) + ' ist zerbrochen'); }
    }
    return dmg * (1 - Math.min(0.8, p*0.04));
  }
};

/* ── Rezepte ───────────────────────────────────────────────────────── */
const REZEPTE = [];
const GRUPPEN = [['alle','Alles'],['bauen','Bauen'],['werkzeug','Werkzeug'],['kampf','Kampf'],['essen','Essen'],['stoffe','Stoffe']];

/** geformtes Rezept: Zeilen als Zeichenketten, Leerzeichen = leeres Feld */
function geformt(gruppe, out, n, muster, key){
  const h = muster.length, w = Math.max(...muster.map(r => r.length));
  const zellen = [];
  for(let r=0; r<h; r++) for(let c=0; c<w; c++){
    const ch = muster[r][c] || ' ';
    zellen.push(ch === ' ' ? null : [].concat(key[ch]));
  }
  REZEPTE.push({ out, n, w, h, zellen, formlos:false, gruppe, gross: w > 2 || h > 2 });
}
/** formloses Rezept: nur die Zutaten zählen, nicht wo sie liegen */
function formlos(gruppe, out, n, zutaten){
  const z = zutaten.map(x => [].concat(x));
  REZEPTE.push({ out, n, formlos:true, zutaten:z, gruppe, gross: z.length > 4,
    w: Math.min(3, z.length), h: Math.ceil(z.length/3) });
}
function initRecipes(){
  const P = B.PLANKS, S = ITEM.stick;
  formlos('stoffe', B.PLANKS, 4, [B.LOG]);
  geformt('stoffe', S, 4, ['#','#'], {'#':P});
  geformt('bauen', B.TABLE, 1, ['##','##'], {'#':P});
  geformt('bauen', B.TORCH, 4, ['k','|'], {k:ITEM.coal, '|':S});
  geformt('bauen', B.CHEST, 1, ['###','# #','###'], {'#':P});
  geformt('bauen', B.FURNACE, 1, ['###','# #','###'], {'#':B.COBBLE});
  geformt('bauen', B.LADDER, 3, ['| |','|||','| |'], {'|':S});
  geformt('bauen', B.DOOR, 3, ['##','##','##'], {'#':P});
  geformt('bauen', B.BED, 1, ['www','###'], {w:ITEM.wheat, '#':P});
  geformt('bauen', B.STONEBRICK, 4, ['##','##'], {'#':B.STONE});
  geformt('bauen', B.SANDSTONE, 1, ['##','##'], {'#':B.SAND});
  const MATS = [['wood',P],['stone',B.COBBLE],['iron',ITEM.iron],['gold',ITEM.gold],['diamond',ITEM.diamond]];
  for(const [m, mat] of MATS){
    const k = { M:mat, '|':S };
    geformt('werkzeug', ITEM[m+'_pickaxe'], 1, ['MMM',' | ',' | '], k);
    geformt('werkzeug', ITEM[m+'_axe'],     1, ['MM','M|',' |'], k);
    geformt('werkzeug', ITEM[m+'_shovel'],  1, ['M','|','|'], k);
    geformt('werkzeug', ITEM[m+'_hoe'],     1, ['MM',' |',' |'], k);
    geformt('kampf',    ITEM[m+'_sword'],   1, ['M','M','|'], k);
  }
  for(const [m, mat] of [['iron',ITEM.iron],['gold',ITEM.gold],['diamond',ITEM.diamond]]){
    const k = { M:mat };
    geformt('kampf', ITEM[m+'_helmet'],     1, ['MMM','M M'], k);
    geformt('kampf', ITEM[m+'_chestplate'], 1, ['M M','MMM','MMM'], k);
    geformt('kampf', ITEM[m+'_leggings'],   1, ['MMM','M M','M M'], k);
    geformt('kampf', ITEM[m+'_boots'],      1, ['M M','M M'], k);
  }
  geformt('werkzeug', ITEM.bucket, 1, ['I I',' I '], {I:ITEM.iron});
  // Pocketcraft: was die neuen Tiere hergeben
  const WOLL = [B.WOOL, B.WOOL + 1, B.WOOL + 2, B.WOOL + 3];
  geformt('werkzeug', ITEM.shears, 1, [' I','I '], {I:ITEM.iron});
  geformt('kampf', ITEM.bow, 1, [' |f','| f',' |f'], {'|':S, f:ITEM.string});
  geformt('kampf', ITEM.arrow, 4, ['F','|','f'], {F:ITEM.flint, '|':S, f:ITEM.string});
  geformt('bauen', B.BED, 1, ['WWW','###'], {W:WOLL, '#':P});
  geformt('stoffe', B.WOOL, 1, ['ff','ff'], {f:ITEM.string});
  formlos('stoffe', ITEM.string, 4, [WOLL]);
  formlos('stoffe', ITEM.bone_meal, 3, [ITEM.bone]);
  {
    const k = { M:ITEM.leather };
    geformt('kampf', ITEM.leather_helmet,     1, ['MMM','M M'], k);
    geformt('kampf', ITEM.leather_chestplate, 1, ['M M','MMM','MMM'], k);
    geformt('kampf', ITEM.leather_leggings,   1, ['MMM','M M','M M'], k);
    geformt('kampf', ITEM.leather_boots,      1, ['M M','M M'], k);
  }
  geformt('essen', ITEM.bread, 1, ['www'], {w:ITEM.wheat});
  geformt('essen', ITEM.golden_apple, 1, ['GGG','GaG','GGG'], {G:ITEM.gold, a:ITEM.apple});
  for(const [blk, it] of [[B.IRON_BLOCK, ITEM.iron],[B.GOLD_BLOCK, ITEM.gold],[B.DIAMOND_BLOCK, ITEM.diamond]]){
    geformt('bauen', blk, 1, ['###','###','###'], {'#':it});
    formlos('stoffe', it, 9, [blk]);
  }
}
const zutatenVon = r => r.formlos ? r.zutaten : r.zellen.filter(Boolean);

/** Welches Rezept liegt im Raster? Muster dürfen verschoben und gespiegelt liegen. */
function rasterRezept(raster, g){
  let x0 = g, y0 = g, x1 = -1, y1 = -1, zahl = 0;
  for(let i=0; i<g*g; i++){
    if(!raster[i]) continue;
    const x = i % g, y = (i / g) | 0;
    if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y;
    zahl++;
  }
  if(!zahl) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  for(const r of REZEPTE){
    if(r.formlos){
      if(r.zutaten.length !== zahl) continue;
      const rest = r.zutaten.slice(); let ok = true;
      for(let i=0; i<g*g && ok; i++){
        const s = raster[i]; if(!s) continue;
        const k = rest.findIndex(z => z.includes(s.id));
        if(k < 0) ok = false; else rest.splice(k, 1);
      }
      if(ok) return r;
      continue;
    }
    if(r.w !== w || r.h !== h) continue;
    for(const spiegel of [false, true]){
      let ok = true;
      for(let yy=0; yy<h && ok; yy++) for(let xx=0; xx<w; xx++){
        const want = r.zellen[yy*w + (spiegel ? w-1-xx : xx)];
        const s = raster[(y0+yy)*g + x0 + xx];
        if(!want){ if(s){ ok = false; break; } }
        else if(!s || !want.includes(s.id)){ ok = false; break; }
      }
      if(ok) return r;
    }
  }
  return null;
}
/** Zutaten zählen: Inventar plus das, was schon im Raster liegt */
function vorrat(){
  const m = new Map();
  const zaehl = s => { if(s) m.set(s.id, (m.get(s.id) || 0) + s.n); };
  Inv.slots.forEach(zaehl); Screens.raster.forEach(zaehl);
  return m;
}
function fehlendeZutaten(r, v){
  const rest = new Map(v), fehlt = new Map();
  for(const z of zutatenVon(r)){
    const id = z.find(i => (rest.get(i) || 0) > 0);
    if(id === undefined){ fehlt.set(z[0], (fehlt.get(z[0]) || 0) + 1); continue; }
    rest.set(id, rest.get(id) - 1);
  }
  return fehlt;
}
function zutatenText(r){
  const m = new Map();
  for(const z of zutatenVon(r)) m.set(z[0], (m.get(z[0]) || 0) + 1);
  return [...m].map(([id, n]) => n + '× ' + nameOf(id)).join(', ');
}
/** Rezept sichtbar, sobald man eine seiner Zutaten schon einmal hatte */
function rezeptBekannt(r){
  if(Game.player && Game.player.creative) return true;
  return zutatenVon(r).some(z => z.some(id => Inv.bekannt.has(id))) || Inv.bekannt.has(r.out);
}

/* ── Schmelzen ─────────────────────────────────────────────────────── */
const SMELT = {};
function initSmelt(){
  SMELT[B.COBBLE] = B.STONE;
  SMELT[B.SAND] = B.GLASS;
  SMELT[B.IRON_ORE] = ITEM.iron;
  SMELT[B.GOLD_ORE] = ITEM.gold;
  SMELT[ITEM.pork_raw] = ITEM.pork_cook;
  SMELT[B.LOG] = ITEM.coal;
  SMELT[ITEM.beef_raw] = ITEM.beef_cooked;
  SMELT[ITEM.mutton_raw] = ITEM.mutton_cooked;
}
function fuelValue(id){
  if(items[id] && items[id].fuel) return items[id].fuel;
  if(id === B.PLANKS || id === B.LOG || id === B.TABLE || id === B.CHEST || id === B.LADDER) return 300;
  return 0;
}

/* ── Klänge (WebAudio, komplett synthetisch) ───────────────────────── */
const Sfx = {
  ctx:null, on:true,
  init(){ if(this.ctx) return; try{ this.ctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){ this.on = false; } },
  tone(f, dur, type, gain, slide){
    if(!this.on) { return; }
    this.init(); if(!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, c.currentTime);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f*slide), c.currentTime + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, c.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(c.destination); o.start(); o.stop(c.currentTime + dur + 0.02);
  },
  noise(dur, gain, filterFreq){
    if(!this.on) return; this.init(); if(!this.ctx) return;
    const c = this.ctx, n = c.sampleRate * dur | 0;
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i] = (Math.random()*2-1) * (1 - i/n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 900;
    const g = c.createGain(); g.gain.value = gain || 0.16;
    src.connect(f); f.connect(g); g.connect(c.destination); src.start();
  },
  play(what){
    switch(what){
      case 'dig':   this.noise(0.07, 0.10, 1500); break;
      case 'break': this.noise(0.16, 0.20, 1100); break;
      case 'place': this.noise(0.10, 0.16, 700); break;
      case 'step':  this.noise(0.05, 0.05, 500); break;
      case 'hurt':  this.tone(220, 0.18, 'sawtooth', 0.14, 0.5); break;
      case 'hit':   this.tone(160, 0.09, 'square', 0.12, 0.7); break;
      case 'craft': this.tone(660, 0.07, 'triangle', 0.10); setTimeout(()=>this.tone(880,0.09,'triangle',0.10), 60); break;
      case 'pickup':this.tone(880, 0.05, 'triangle', 0.07); break;
      case 'klick': this.tone(520, 0.03, 'triangle', 0.05); break;
      case 'eat':   this.noise(0.14, 0.08, 400); break;
      case 'door':  this.noise(0.12, 0.14, 500); this.tone(140, 0.08, 'square', 0.05, 0.8); break;
      case 'zombie':this.tone(110, 0.4, 'sawtooth', 0.06, 0.6); break;
      case 'pig':   this.tone(300, 0.14, 'square', 0.05, 1.5); break;
      case 'kuh':   this.tone(118, 0.7, 'sawtooth', 0.06, 0.7); break;
      case 'schaf': this.tone(430, 0.09, 'square', 0.04, 0.9); setTimeout(()=>this.tone(410,0.09,'square',0.04,0.85), 90); setTimeout(()=>this.tone(400,0.14,'square',0.035,0.8), 180); break;
      case 'skelett': for(let i=0;i<4;i++) setTimeout(()=>this.noise(0.03, 0.08, 3200), i*55); break;
      case 'bogen': this.noise(0.12, 0.10, 2400); this.tone(220, 0.1, 'triangle', 0.05, 0.6); break;
      case 'pfeil': this.noise(0.06, 0.12, 900); break;
      case 'schere': this.noise(0.04, 0.10, 4000); setTimeout(()=>this.noise(0.04, 0.10, 4000), 90); break;
      case 'die':   this.tone(300, 0.7, 'sawtooth', 0.16, 0.25); break;
    }
  }
};

/* ── Slot-Darstellung ──────────────────────────────────────────────── */
function zeigeSlot(d, s, geist){
  const sig = s ? s.id + ':' + s.n + ':' + (s.dur|0) : (geist ? 'g' + geist : '-');
  if(d._sig === sig) return;
  d._sig = sig;
  d.textContent = '';
  d.classList.toggle('geist', !s && !!geist);
  d.classList.toggle('voll', !!s);
  const id = s ? s.id : geist;
  if(!id) return;
  const ic = el('i', 'ic'); ic.style.backgroundImage = 'url(' + iconFor(id) + ')'; d.appendChild(ic);
  if(!s) return;
  if(s.n > 1){ const c = el('span', 'cnt'); c.textContent = s.n; d.appendChild(c); }
  const def = items[s.id];
  if(def && def.dur && s.dur < def.dur){
    const b = el('div', 'dur'), i = el('i');
    const f = s.dur / def.dur; i.style.width = (f*100) + '%';
    i.style.background = f > .5 ? '#78a84e' : (f > .25 ? '#e0a63a' : '#d9484c');
    b.appendChild(i); d.appendChild(b);
  }
}
function slotEl(slot){ const d = el('div', 'slot'); zeigeSlot(d, slot); return d; }
function beschreibung(s){
  if(!s) return '';
  const d = defOf(s.id); if(!d) return '';
  const t = [d.name];
  const it = items[s.id];
  if(it && it.dur) t.push('Haltbarkeit ' + Math.max(0, s.dur|0) + '/' + it.dur);
  if(it && it.armor) t.push('Rüstung +' + it.armor.pts);
  if(it && it.tool === 'sword') t.push('Schaden ' + it.dmg);
  if(it && it.food) t.push('+' + it.food + ' Hunger' + (it.heal ? ', heilt ' + it.heal : ''));
  if(SMELT[s.id] !== undefined) t.push('schmilzt zu ' + nameOf(SMELT[s.id]));
  if(fuelValue(s.id)) t.push('brennt');
  if(s.id === ITEM.seeds) t.push('auf Ackerboden säen');
  if(it && it.tool === 'hoe') t.push('macht aus Erde Acker');
  if(s.id === B.BED) t.push('nachts schlafen, Startpunkt');
  return t.join(' · ');
}

/* ── HUD ───────────────────────────────────────────────────────────── */
const HUD = {
  lastHot: '',
  build(){
    const hb = $('#hotbar'); hb.innerHTML = '';
    for(let i=0;i<9;i++){ const s = el('div', 'slot'); s.dataset.i = i; hb.appendChild(s); }
    for(const [id, cls, n] of [['#hp','',10], ['#food','food',10], ['#airbar','air',10], ['#armor','arm',10]]){
      const c = $(id); c.innerHTML = '';
      for(let i=0;i<n;i++){ const p = el('i', 'pip' + (cls ? ' ' + cls : '')); c.appendChild(p); }
    }
    this.lastHot = '';
  },
  refreshHotbar(){
    const key = Inv.slots.slice(0,9).map(s => s ? s.id+'x'+s.n+'x'+(s.dur|0) : '-').join('|') + '#' + Inv.sel;
    if(key === this.lastHot) return;
    this.lastHot = key;
    const hb = $('#hotbar');
    for(let i=0;i<9;i++){
      const cell = hb.children[i];
      cell.classList.toggle('sel', i === Inv.sel);
      zeigeSlot(cell, Inv.slots[i]);
    }
    for(let i=0;i<9;i++) if(Inv.slots[i]) Inv.bekannt.add(Inv.slots[i].id);
  },
  refreshVitals(p){
    const set = (sel, val, maxPips, per) => {
      const c = $(sel);
      for(let i=0;i<maxPips;i++){
        const f = clamp((val - i*per) / per, 0, 1);
        c.children[i].style.setProperty('--fill', (f*100) + '%');
      }
    };
    set('#hp', p.health, 10, 2);
    set('#food', p.food, 10, 2);
    const ab = $('#airbar');
    ab.style.display = (p.air < p.maxAir) ? 'flex' : 'none';
    if(p.air < p.maxAir) set('#airbar', p.air, 10, 2);
    const rp = Ruestung.punkte();
    $('#armor').style.display = rp > 0 && !p.creative ? 'flex' : 'none';
    if(rp > 0) set('#armor', rp, 10, 2);
    $('#hp').style.display = p.creative ? 'none' : 'flex';
    $('#food').style.display = p.creative ? 'none' : 'flex';
  }
};

let _hintT = 0;
function hint(msg, ms){
  const h = $('#hint'); h.textContent = msg; h.classList.add('show');
  clearTimeout(_hintT); _hintT = setTimeout(()=>h.classList.remove('show'), ms || 1800);
}
let _nameT = 0;
function showItemName(){
  const s = Inv.held();
  const n = $('#itemname');
  if(!s){ n.classList.remove('show'); return; }
  n.textContent = nameOf(s.id);
  n.classList.add('show');
  clearTimeout(_nameT); _nameT = setTimeout(()=>n.classList.remove('show'), 1400);
}

/* ═══════════════════════════════════════════════════════════════════
   BEHÄLTER-BILDSCHIRM — Inventar, Werkbank, Truhe, Ofen
   ═══════════════════════════════════════════════════════════════════ */
const RUEST_LEER = ['i_iron_helmet','i_iron_chestplate','i_iron_leggings','i_iron_boots'];
const TITEL = { inv:'Inventar', werkbank:'Werkbank', truhe:'Truhe', ofen:'Ofen' };

const Screens = {
  open: null,           // 'beh' | 'pause' | 'death'
  modus: null,          // 'inv' | 'werkbank' | 'truhe' | 'ofen'
  g: 2,
  raster: new Array(9).fill(null),
  truheKey: null, ofenKey: null,
  geist: null,
  gruppe: 'alle', nurMachbar: false,
  slots: [],            // Slot-Elemente des offenen Bildschirms
  _buchSig: '',

  /* — Öffnen und Schließen — */
  /** Die Maus war in der Welt gefangen — für Menüs muss sie frei sein */
  mausFrei(){ try{ if(document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }catch(_){} },
  show(which){
    if(which === 'inv'){ this.oeffne('inv'); return; }
    this.hide();
    this.mausFrei();
    this.open = which;
    $('#pause').classList.toggle('on', which === 'pause');
    $('#death').classList.toggle('on', which === 'death');
  },
  oeffne(modus, key){
    if(this.open) this.hide();
    this.mausFrei();
    this._offenSeit = performance.now();
    this.open = 'beh'; this.modus = modus;
    this.g = modus === 'werkbank' ? 3 : 2;
    this.truheKey = modus === 'truhe' ? key : null;
    this.ofenKey = modus === 'ofen' ? key : null;
    this.geist = null;
    Inv.merkeAlles();
    this.bau();
    $('#beh').classList.add('on');
    this.masse();
    this.render();
    this.info(modus === 'inv' && !Game.player.creative
      ? 'Leg Zutaten ins Raster oder tipp ein Rezept an. Lang drücken nimmt die Hälfte oder legt eins ab.'
      : '');
  },
  hide(){
    if(this.open === 'beh'){
      // Raster und Hand zurück in die Tasche, was nicht passt, fällt vor die Füße
      for(let i=0; i<9; i++){ if(this.raster[i]){ this.zurueck(this.raster[i]); this.raster[i] = null; } }
      if(Inv.cursor){ this.zurueck(Inv.cursor); Inv.cursor = null; }
      this.drag(null);
    }
    this.open = null; this.modus = null; this.truheKey = null; this.ofenKey = null; this.geist = null;
    Geste.g = null;
    for(const s of ['#beh','#pause','#death']) $(s).classList.remove('on');
    if(Game.player) HUD.refreshHotbar();
  },
  zurueck(st){
    const rest = Inv.addStack(st);
    if(rest) Game.dropItem(rest.id, rest.n, Game.player.x, Game.player.y + 1.2, Game.player.z, rest.dur);
  },

  /* — Aufbau — */
  bau(){
    const root = $('#beh');
    if(!root.firstChild){
      root.innerHTML =
        '<div class="sheet beh" id="behSheet">' +
          '<div class="behKopf"><h2 id="behTitel"></h2><span class="luecke"></span>' +
          '<button class="btn ghost" id="behZu" aria-label="Schließen">Schließen</button></div>' +
          '<div class="behRumpf" id="behRumpf">' +
            '<section class="buch" id="behBuch">' +
              '<div class="buchKopf"><div class="tabs" id="buchTabs"></div>' +
              '<button class="schalter" id="buchNur" aria-pressed="false">nur machbare</button></div>' +
              '<p class="lbl" id="behZahl"></p>' +
              '<div id="buchListe"></div>' +
            '</section>' +
            '<section class="lager">' +
              '<div id="behOben"></div>' +
              '<div class="reihe9" id="behHaupt"></div>' +
              '<div class="reihe9 guertel" id="behGuertel"></div>' +
              '<p id="behInfo"></p>' +
            '</section>' +
          '</div>' +
        '</div>';
      const tabs = $('#buchTabs');
      for(const [k, n] of GRUPPEN){
        const b = el('button'); b.textContent = n; b.dataset.g = k; tabs.appendChild(b);
        b.addEventListener('click', () => { this.gruppe = k; this.renderBuch(true); });
      }
      $('#buchNur').addEventListener('click', () => { this.nurMachbar = !this.nurMachbar; this.renderBuch(true); });
      $('#behZu').addEventListener('click', () => this.hide());
      /* Nach einem Tipp schickt der Browser noch einen Klick hinterher, an
         dieselbe Stelle. Liegt dort nach dem Öffnen ein Knopf dieses Blatts —
         quer auf dem Telefon sitzt »Schließen« genau unter »INV« —, würde
         das Inventar sofort wieder zugehen. Klicks kurz nach dem Öffnen
         zählen deshalb nicht. */
      root.addEventListener('click', e => {
        if(performance.now() - this._offenSeit < 450){ e.stopPropagation(); e.preventDefault(); }
      }, true);
      Geste.init(root);
    }
    // Slots für diesen Modus neu anlegen
    this.slots = [];
    const oben = $('#behOben'); oben.innerHTML = ''; oben.className = 'oben-' + this.modus;
    const haupt = $('#behHaupt'); haupt.innerHTML = '';
    const guertel = $('#behGuertel'); guertel.innerHTML = '';
    for(let i=9; i<36; i++) haupt.appendChild(this.mk(this.invRef(i, 'haupt')));
    for(let i=0; i<9; i++) guertel.appendChild(this.mk(this.invRef(i, 'guertel')));
    $('#behTitel').textContent = TITEL[this.modus];

    const kreativ = Game.player.creative;
    if(this.modus === 'inv' || this.modus === 'werkbank'){
      if(this.modus === 'inv'){
        const r = el('div', 'ruest');
        for(let k=0; k<4; k++) r.appendChild(this.mk({
          gruppe:'ruestung', art:'lager', get:() => Inv.ruestung[k], set:v => { Inv.ruestung[k] = v; },
          passt: st => !!(items[st.id] && items[st.id].armor && items[st.id].armor.slot === k),
          nein:'Hier gehört ' + ['ein Helm','ein Brustpanzer','eine Hose','ein Paar Stiefel'][k] + ' hin', leer: RUEST_LEER[k] }));
        oben.appendChild(r);
      }
      const g = this.g, rs = el('div', 'raster'); rs.style.gridTemplateColumns = 'repeat(' + g + ', var(--s))';
      for(let i=0; i<g*g; i++) rs.appendChild(this.mk({
        gruppe:'raster', art:'lager', index:i, get:() => this.raster[i], set:v => { this.raster[i] = v; }, passt: () => true }));
      oben.appendChild(rs);
      const pf = el('div', 'pfeil'); pf.textContent = '➜'; oben.appendChild(pf);
      oben.appendChild(this.mk({ gruppe:'ergebnis', art:'ergebnis', get:() => this.ergebnis(), set:() => {}, passt:() => false }, 'ergebnis'));
      if(kreativ)
        oben.appendChild(this.mk({ gruppe:'muell', art:'muell', get:() => null, set:() => {}, passt:() => true, leer:'crack7' }, 'muell'));
    } else if(this.modus === 'truhe'){
      const t = Game.world.chests.get(this.truheKey);
      const box = el('div', 'reihe9');
      for(let i=0; i<27; i++) box.appendChild(this.mk({ gruppe:'truhe', art:'lager', get:() => t[i], set:v => { t[i] = v; }, passt:() => true }));
      oben.appendChild(box);
    } else if(this.modus === 'ofen'){
      const f = Game.world.furnaces.get(this.ofenKey);
      const links = el('div', 'ofenLinks');
      links.appendChild(this.mk({ gruppe:'ofenEin', art:'lager', get:() => f.in, set:v => { f.in = v; },
        passt: st => SMELT[st.id] !== undefined, nein:'Das lässt sich nicht schmelzen' }));
      const fl = el('div', 'flame'); fl.innerHTML = '<i id="furnFlame"></i>'; links.appendChild(fl);
      links.appendChild(this.mk({ gruppe:'ofenBrenn', art:'lager', get:() => f.fuel, set:v => { f.fuel = v; },
        passt: st => fuelValue(st.id) > 0, nein:'Das brennt nicht' }));
      oben.appendChild(links);
      const pb = el('div', 'progbar'); pb.innerHTML = '<i id="furnProg"></i>'; oben.appendChild(pb);
      oben.appendChild(this.mk({ gruppe:'ofenAus', art:'aus', get:() => f.out, set:v => { f.out = v; }, passt:() => false }, 'ergebnis'));
    }
    $('#behBuch').classList.toggle('aus', this.modus === 'truhe' || this.modus === 'ofen');
    this._buchSig = '';
  },
  invRef(i, gruppe){ return { gruppe, art:'lager', get:() => Inv.slots[i], set:v => { Inv.slots[i] = v; }, passt:() => true }; },
  mk(ref, cls){
    const d = el('div', 'slot' + (cls ? ' ' + cls : ''));
    d._ref = ref;
    if(ref.leer){ d.style.setProperty('--leer', 'url(' + iconURL(ref.leer) + ')'); d.classList.add('mitLeer'); }
    this.slots.push(d);
    return d;
  },

  /* — Größen: alles passt ohne Scrollen, auch quer auf dem Telefon — */
  masse(){
    if(this.open !== 'beh') return;
    const W = window.innerWidth, H = window.innerHeight;
    const breit = W >= 600 && W > H*1.15;
    const buch = !$('#behBuch').classList.contains('aus');
    const reihen = { inv:6, werkbank:7, truhe:7, ofen:6.4 }[this.modus] || 6;
    const buchW = breit && buch ? Math.min(330, Math.max(190, W*0.3)) : 0;
    const sW = (Math.min(W, 1040) - 24 - 24 - buchW - (buchW ? 14 : 0) - 8*4) / 9;
    const sH = (H - 24 - 24 - 40 - 22 - 34 - (reihen - 1)*4) / reihen;
    const s = clamp(Math.floor(Math.min(sW, sH)), 26, 56);
    const sheet = $('#behSheet');
    sheet.style.setProperty('--s', s + 'px');
    sheet.style.setProperty('--buchW', buchW + 'px');
    $('#behRumpf').classList.toggle('breit', breit);
    // Nebeneinander ist das Buch so hoch wie das Lager und scrollt in sich
    const buchEl = $('#behBuch');
    buchEl.style.height = '';
    if(breit && buch) buchEl.style.height = $('#behRumpf .lager').offsetHeight + 'px';
  },

  /* — Handwerk — */
  ergebnis(){
    if(this.modus !== 'inv' && this.modus !== 'werkbank') return null;
    const r = rasterRezept(this.raster, this.g);
    return r ? { id:r.out, n:r.n, dur: items[r.out] ? items[r.out].dur : 0 } : null;
  },
  verbrauchen(){
    for(let i=0; i<this.g*this.g; i++){
      const s = this.raster[i]; if(!s) continue;
      s.n--; if(s.n <= 0) this.raster[i] = null;
    }
  },
  /** ein Ergebnis nehmen: in die Hand, oder mit alle=true so oft wie möglich in die Tasche */
  nimmErgebnis(alle){
    let r = rasterRezept(this.raster, this.g);
    if(!r) return;
    if(!alle){
      const cur = Inv.cursor, max = stackOf(r.out);
      if(!cur) Inv.cursor = Inv.make(r.out, r.n);
      else if(cur.id === r.out && cur.n + r.n <= max) cur.n += r.n;
      else { this.info('Die Hand ist voll — erst ablegen'); return; }
      this.verbrauchen();
      Inv.bekannt.add(r.out);
      Sfx.play('craft');
      this.info(nameOf(r.out) + ' hergestellt');
      return;
    }
    let k = 0;
    const ziel = r;
    while(k < 64 && (r = rasterRezept(this.raster, this.g)) === ziel && Inv.platzFuer(r.out, r.n)){
      Inv.add(r.out, r.n); this.verbrauchen(); k++;
    }
    if(k){ Sfx.play('craft'); this.info(k*ziel.n + '× ' + nameOf(ziel.out) + ' hergestellt'); }
    else this.info('Kein Platz in der Tasche');
  },
  /** Raster leeren — false, wenn die Tasche zu voll ist */
  rasterLeeren(){
    for(let i=0; i<9; i++){
      const s = this.raster[i]; if(!s) continue;
      const rest = Inv.addStack(s);
      this.raster[i] = rest;
      if(rest) return false;
    }
    return true;
  },
  /** Rezeptbuch: das Muster aus der Tasche ins Raster legen */
  fuellen(r, alle){
    const g = this.g;
    if(r.gross && g < 3){ this.geist = null; this.info(nameOf(r.out) + ' braucht das 3 × 3-Raster einer Werkbank'); Sfx.play('klick'); return; }
    if(rasterRezept(this.raster, g) !== r && !this.rasterLeeren()){ this.info('Kein Platz in der Tasche, um das Raster zu leeren'); return; }
    const plan = [];
    if(r.formlos) r.zutaten.forEach((z, k) => plan.push([k, z]));
    else for(let yy=0; yy<r.h; yy++) for(let xx=0; xx<r.w; xx++){ const z = r.zellen[yy*r.w + xx]; if(z) plan.push([yy*g + xx, z]); }
    // aus dem Hauptfach zuerst, damit die Schnellleiste bleibt, wie sie ist
    const reihenfolge = [];
    for(let k=9; k<36; k++) reihenfolge.push(k);
    for(let k=0; k<9; k++) reihenfolge.push(k);
    let saetze = 0;
    while(saetze < (alle ? 64 : 1)){
      const genommen = []; let ok = true;
      for(const [i, erlaubt] of plan){
        const cur = this.raster[i];
        if(cur && cur.n >= stackOf(cur.id)){ ok = false; break; }
        const ids = cur ? [cur.id] : erlaubt;
        let j = -1;
        for(const k of reihenfolge) if(Inv.slots[k] && ids.includes(Inv.slots[k].id)){ j = k; break; }
        if(j < 0){ ok = false; break; }
        const s = Inv.slots[j];
        if(cur) cur.n++; else this.raster[i] = Inv.make(s.id, 1, s.dur);
        s.n--; if(s.n <= 0) Inv.slots[j] = null;
        genommen.push([i, s.id, s.dur]);
      }
      if(!ok){
        for(const [i, id, dur] of genommen.reverse()){
          const c = this.raster[i]; c.n--; if(c.n <= 0) this.raster[i] = null;
          Inv.addStack(Inv.make(id, 1, dur));
        }
        break;
      }
      saetze++;
    }
    if(saetze){ this.geist = null; Sfx.play('klick'); this.info(nameOf(r.out) + ': ' + zutatenText(r) + ' — jetzt das Ergebnis rechts antippen'); }
    else {
      this.geist = r;
      const fehlt = fehlendeZutaten(r, vorrat());
      this.info(nameOf(r.out) + ' — es fehlt: ' + [...fehlt].map(([id, n]) => n + '× ' + nameOf(id)).join(', '));
    }
  },
  /** Geisterbild: welches Feld im Raster welche Zutat bräuchte */
  geistFuer(i){
    const r = this.geist; if(!r || this.raster.some(Boolean)) return null;
    const g = this.g;
    if(r.formlos) return r.zutaten[i] ? r.zutaten[i][0] : null;
    const x = i % g, y = (i / g) | 0;
    if(x >= r.w || y >= r.h) return null;
    const z = r.zellen[y*r.w + x];
    return z ? z[0] : null;
  },

  /* — Slot-Regeln — */
  ablegbar(ref, st){
    if(ref.art !== 'lager' || !st || !ref.passt(st)) return false;
    const s = ref.get();
    return !s || (s.id === st.id && s.n < stackOf(s.id));
  },
  links(ref){
    const cur = Inv.cursor, s = ref.get();
    if(ref.art === 'ergebnis'){ this.nimmErgebnis(false); return; }
    if(ref.art === 'muell'){ if(cur){ this.info(nameOf(cur.id) + ' weggeworfen'); Inv.cursor = null; } return; }
    if(ref.art === 'aus'){
      if(!s) return;
      if(!cur){ Inv.cursor = s; ref.set(null); }
      else if(cur.id === s.id){ const t = Math.min(stackOf(s.id) - cur.n, s.n); cur.n += t; s.n -= t; if(s.n <= 0) ref.set(null); }
      return;
    }
    if(!cur){ if(s){ Inv.cursor = s; ref.set(null); } return; }
    if(!ref.passt(cur)){ this.info(ref.nein || 'Das passt hier nicht hin'); return; }
    if(!s){ ref.set(cur); Inv.cursor = null; return; }
    if(s.id === cur.id && stackOf(s.id) > 1){
      const t = Math.min(stackOf(s.id) - s.n, cur.n); s.n += t; cur.n -= t;
      if(cur.n <= 0) Inv.cursor = null;
      return;
    }
    ref.set(cur); Inv.cursor = s;
  },
  rechts(ref){
    const cur = Inv.cursor, s = ref.get();
    if(ref.art !== 'lager'){ this.links(ref); return; }
    if(!cur){
      if(!s) return;
      const h = Math.ceil(s.n/2);
      Inv.cursor = Inv.make(s.id, h, s.dur); s.n -= h;
      if(s.n <= 0) ref.set(null);
      return;
    }
    this.einsAb(ref);
  },
  einsAb(ref){
    const cur = Inv.cursor, s = ref.get();
    if(!cur) return;
    if(!this.ablegbar(ref, cur)){
      if(s && s.id !== cur.id && ref.art === 'lager' && ref.passt(cur)){ ref.set(cur); Inv.cursor = s; }
      else if(!ref.passt(cur)) this.info(ref.nein || 'Das passt hier nicht hin');
      return;
    }
    if(!s) ref.set(Inv.make(cur.id, 1, cur.dur)); else s.n++;
    cur.n--; if(cur.n <= 0) Inv.cursor = null;
  },
  /** gezogen mit der linken Maustaste: gleichmäßig verteilen */
  gleichVerteilen(refs){
    const cur = Inv.cursor; if(!cur) return;
    const ziele = refs.filter(r => this.ablegbar(r, cur));
    if(!ziele.length) return;
    const je = Math.floor(cur.n / ziele.length);
    if(je < 1){ for(const r of ziele){ if(!Inv.cursor) break; this.einsAb(r); } return; }
    for(const r of ziele){
      const s = r.get(), platz = s ? stackOf(s.id) - s.n : stackOf(cur.id);
      const t = Math.min(je, platz);
      if(!s) r.set(Inv.make(cur.id, t, cur.dur)); else s.n += t;
      cur.n -= t;
    }
    if(cur.n <= 0) Inv.cursor = null;
  },
  /** Schnell verschieben: Umschalt+Klick, Doppeltipp */
  schnell(ref){
    if(ref.art === 'ergebnis'){ this.nimmErgebnis(true); return; }
    const s = ref.get(); if(!s || ref.art === 'muell') return;
    const max = stackOf(s.id);
    const nach = (refs) => {
      for(const r of refs){
        if(s.n <= 0) break;
        const t = r.get();
        if(t && t.id === s.id && max > 1 && t.n < max && r.passt(s)){ const k = Math.min(max - t.n, s.n); t.n += k; s.n -= k; }
      }
      for(const r of refs){
        if(s.n <= 0) break;
        if(r.get() || !r.passt(s)) continue;
        if(s.n <= max){ r.set(Inv.make(s.id, s.n, s.dur)); s.n = 0; }
        else { r.set(Inv.make(s.id, max, s.dur)); s.n -= max; }
      }
    };
    const gruppe = g => this.slots.filter(d => d._ref.gruppe === g).map(d => d._ref);
    const vorher = s.n;
    if(ref.gruppe === 'haupt' || ref.gruppe === 'guertel'){
      const it = items[s.id];
      if(this.modus === 'truhe') nach(gruppe('truhe'));
      else if(this.modus === 'ofen'){
        if(SMELT[s.id] !== undefined) nach(gruppe('ofenEin'));
        else if(fuelValue(s.id)) nach(gruppe('ofenBrenn'));
      }
      else if(this.modus === 'inv' && it && it.armor) nach(gruppe('ruestung'));
      if(s.n === vorher) nach(gruppe(ref.gruppe === 'haupt' ? 'guertel' : 'haupt'));
    } else {
      nach(gruppe('haupt')); if(s.n > 0) nach(gruppe('guertel'));
    }
    if(s.n <= 0) ref.set(null);
    if(s.n !== vorher) Sfx.play('klick');
  },

  /* — Zeichnen — */
  render(){
    if(this.open !== 'beh') return;
    if(this.modus === 'ofen' && !Game.world.furnaces.get(this.ofenKey)){ this.hide(); return; }
    if(this.modus === 'truhe' && !Game.world.chests.get(this.truheKey)){ this.hide(); return; }
    for(const d of this.slots){
      const ref = d._ref;
      const geist = ref.gruppe === 'raster' ? this.geistFuer(ref.index) : null;
      zeigeSlot(d, ref.get(), geist);
      if(ref.art === 'ergebnis') d.classList.toggle('bereit', !!ref.get());
    }
    if(this.modus === 'ofen'){
      const f = Game.world.furnaces.get(this.ofenKey);
      $('#furnFlame').style.setProperty('--f', (f.burnMax ? (f.burn/f.burnMax*100) : 0) + '%');
      $('#furnProg').style.setProperty('--p', (f.cook/200*100) + '%');
    }
    this.renderBuch(false);
    this.drag(Inv.cursor);
    HUD.refreshHotbar();
  },
  renderBuch(neu){
    const buch = $('#behBuch');
    if(buch.classList.contains('aus')){ $('#behZahl').textContent = ''; return; }
    const kreativ = Game.player.creative;
    for(const b of $('#buchTabs').children) b.setAttribute('aria-selected', b.dataset.g === this.gruppe);
    $('#buchTabs').style.display = kreativ ? 'none' : '';
    $('#buchNur').style.display = kreativ ? 'none' : '';
    $('#buchNur').setAttribute('aria-pressed', this.nurMachbar);
    const liste = $('#buchListe');
    if(kreativ){
      if(!neu && this._buchSig === 'k') return;
      this._buchSig = 'k';
      liste.innerHTML = '';
      $('#behZahl').textContent = 'Katalog — antippen nimmt einen Stapel';
      for(const id of katalog()){
        const b = el('button', 'rz ok'); b._katalog = id;
        const ic = el('i', 'ic'); ic.style.backgroundImage = 'url(' + iconFor(id) + ')'; b.appendChild(ic);
        b.title = nameOf(id);
        liste.appendChild(b);
      }
      return;
    }
    const v = vorrat(), g = this.g;
    const alle = REZEPTE.filter(rezeptBekannt);
    const zeilen = [];
    for(const r of alle){
      if(this.gruppe !== 'alle' && r.gruppe !== this.gruppe) continue;
      const fehlt = fehlendeZutaten(r, v).size > 0;
      const bank = r.gross && g < 3;
      const zust = fehlt ? 'fehlt' : (bank ? 'bank' : 'ok');
      if(this.nurMachbar && zust !== 'ok') continue;
      zeilen.push([r, zust]);
    }
    const rang = { ok:0, bank:1, fehlt:2 };
    zeilen.sort((a, b) => rang[a[1]] - rang[b[1]]);
    const sig = zeilen.map(([r, z]) => REZEPTE.indexOf(r) + z).join(',') + '|' + (this.geist ? REZEPTE.indexOf(this.geist) : -1);
    $('#behZahl').textContent = alle.length + ' von ' + REZEPTE.length + ' Rezepten entdeckt';
    if(!neu && sig === this._buchSig) return;
    this._buchSig = sig;
    liste.innerHTML = '';
    for(const [r, z] of zeilen){
      const b = el('button', 'rz ' + z + (this.geist === r ? ' gewaehlt' : ''));
      b._rezept = r;
      const ic = el('i', 'ic'); ic.style.backgroundImage = 'url(' + iconFor(r.out) + ')'; b.appendChild(ic);
      if(r.n > 1){ const c = el('span', 'cnt'); c.textContent = r.n; b.appendChild(c); }
      if(z === 'bank'){ const k = el('span', 'bankzeichen'); k.textContent = '3×3'; b.appendChild(k); }
      b.title = nameOf(r.out) + ' — ' + zutatenText(r);
      liste.appendChild(b);
    }
    if(!zeilen.length){
      const p = el('p', 'buchLeer');
      p.textContent = alle.length ? 'Nichts in dieser Gruppe.' : 'Noch keine Rezepte entdeckt. Schlag einen Baum — mit dem ersten Holz kennst du die ersten Rezepte.';
      liste.appendChild(p);
    }
  },
  info(t){ const p = $('#behInfo'); if(p) p.textContent = t || ''; },
  drag(slot, x, y){
    let d = $('#drag');
    if(!d){ d = el('div'); d.id = 'drag'; document.body.appendChild(d); }
    if(!slot){ d.style.display = 'none'; d._sig = ''; return; }
    d.style.display = 'block';
    if(x !== undefined){ d.style.left = x + 'px'; d.style.top = y + 'px'; }
    const sig = slot.id + ':' + slot.n;
    if(d._sig === sig) return;
    d._sig = sig;
    d.innerHTML = '';
    const ic = el('i','ic'); ic.style.backgroundImage = 'url(' + iconFor(slot.id) + ')'; d.appendChild(ic);
    if(slot.n > 1){ const c = el('span','cnt'); c.textContent = slot.n; d.appendChild(c); }
  },
  /** Hand in die Welt werfen */
  werfen(){
    const c = Inv.cursor; if(!c) return;
    const p = Game.player, f = p.forward();
    Game.dropItem(c.id, c.n, p.x + f[0]*0.8, p.eyeY() - 0.3, p.z + f[2]*0.8, c.dur);
    Inv.cursor = null;
    this.info(nameOf(c.id) + ' weggeworfen');
  }
};

/** Kreativ-Katalog: alles, was man in der Hand halten kann */
let _katalog = null;
function katalog(){
  if(_katalog) return _katalog;
  _katalog = [];
  for(let i=1; i<ITEM0; i++) if(blocks[i] && blocks[i].item) _katalog.push(i);
  for(const id of Object.keys(items)) _katalog.push(+id);
  return _katalog;
}

/* ── Gesten im Behälter: tippen, lang drücken, ziehen, doppelt tippen ──
   Ob lang oder kurz gedrückt wurde, entscheiden die Zeitstempel der
   Ereignisse beim Loslassen, nicht ein Zeitgeber: ist das Telefon kurz
   beschäftigt, kommt das Loslassen verspätet an, und ein Zeitgeber hielte
   einen schnellen Tipp für langes Drücken. Der Zeitgeber zeigt nur an,
   dass jetzt »lang« gilt. */
const LANG_MS = 420, DOPPEL_MS = 380;
const Geste = {
  g: null, letzt: null,
  init(root){
    root.addEventListener('pointerdown', e => this.runter(e));
    window.addEventListener('pointermove', e => this.bewegen(e));
    window.addEventListener('pointerup', e => this.hoch(e));
    window.addEventListener('pointercancel', () => this.abbruch());
    root.addEventListener('contextmenu', e => e.preventDefault());
    root.addEventListener('pointerover', e => {
      if(e.pointerType !== 'mouse') return;
      const s = e.target.closest && e.target.closest('.slot');
      if(s && s._ref){ const st = s._ref.get(); if(st) Screens.info(beschreibung(st)); }
      const b = e.target.closest && e.target.closest('.rz');
      if(b && b._rezept) Screens.info(nameOf(b._rezept.out) + ' — ' + zutatenText(b._rezept) + (b.classList.contains('bank') ? ' · braucht eine Werkbank' : ''));
      if(b && b._katalog !== undefined) Screens.info(nameOf(b._katalog));
    });
  },
  zeigeHand(e){
    // auf dem Finger sitzt die Hand etwas höher, sonst verdeckt der Finger sie
    Screens.drag(Inv.cursor, e.clientX, e.clientY - (e.pointerType === 'mouse' ? 0 : 34));
  },
  abbruch(){
    const g = this.g; if(!g) return;
    clearTimeout(g.timer);
    const el = g.rz || g.start; if(el) el.classList.remove('haelt');
    if(g.besucht) for(const s of g.besucht) s.classList.remove('ziel');
    this.g = null;
  },
  halten(){
    const g = this.g; if(!g || g.modus || g.erledigt) return;
    (g.rz || g.start).classList.add('haelt');
    if(navigator.vibrate) try{ navigator.vibrate(10); }catch(_){}
  },
  runter(e){
    if(Screens.open !== 'beh') return;
    const t = e.target;
    this.zeigeHand(e);
    // Hintergrund: Hand wegwerfen oder schließen
    if(t.id === 'beh'){ e.preventDefault(); if(Inv.cursor){ Screens.werfen(); Screens.render(); } else Screens.hide(); return; }
    const rz = t.closest && t.closest('.rz');
    if(rz){ this.g = { rz, t0: e.timeStamp, timer: setTimeout(() => this.halten(), LANG_MS), erledigt:false }; return; }
    const s = t.closest && t.closest('.slot');
    if(!s || !s._ref) return;
    e.preventDefault();
    const ref = s._ref, maus = e.pointerType === 'mouse';
    const st = ref.get(); if(st) Screens.info(beschreibung(st));
    if(maus && e.button === 2){
      Screens.rechts(ref);
      this.g = { start:s, ref, maus, knopf:2, besucht:new Set([s]), modus: Inv.cursor ? 'eins' : null, erledigt:true, trug:true, t0:e.timeStamp };
      Screens.render(); return;
    }
    if(maus && e.shiftKey){ Screens.schnell(ref); this.g = null; Screens.render(); return; }
    // Doppeltipp: der erste Tipp hat den Stapel aufgenommen — zurücklegen und verschieben
    const L = this.letzt;
    if(L && L.slot === s && e.timeStamp - L.t < DOPPEL_MS && Inv.cursor && Inv.cursor === L.stapel){
      this.letzt = null;
      Screens.links(ref); Screens.schnell(ref);
      this.g = null; Screens.render(); return;
    }
    this.g = { start:s, ref, maus, knopf:e.button, besucht:new Set([s]), modus:null, erledigt:false, trug: !!Inv.cursor, t0:e.timeStamp };
    if(maus && !Inv.cursor){
      // mit der Maus nimmt man beim Drücken auf, wie gewohnt
      Screens.links(ref); this.g.erledigt = true;
      this.letzt = st && Inv.cursor === st ? { slot:s, t:e.timeStamp, stapel:st } : null;
      Screens.render(); return;
    }
    if(!maus) this.g.timer = setTimeout(() => this.halten(), LANG_MS);
  },
  bewegen(e){
    if(Screens.open !== 'beh') return;
    this.zeigeHand(e);
    const g = this.g; if(!g || g.rz) return;
    if(!Inv.cursor || !g.trug) return;
    const t = document.elementFromPoint(e.clientX, e.clientY);
    const s = t && t.closest && t.closest('.slot');
    if(!s || !s._ref || g.besucht.has(s)) return;
    if(!Screens.ablegbar(s._ref, Inv.cursor)) return;
    if(!g.modus){
      g.modus = (g.maus && g.knopf === 0) ? 'gleich' : 'eins';
      clearTimeout(g.timer); g.start.classList.remove('haelt');
      if(g.modus === 'eins' && !g.erledigt) Screens.einsAb(g.start._ref);
      g.erledigt = true;
      g.start.classList.add('ziel');
    }
    g.besucht.add(s); s.classList.add('ziel');
    if(g.modus === 'eins') Screens.einsAb(s._ref);
    Screens.render();
  },
  hoch(e){
    const g = this.g; if(!g) return;
    this.abbruch();
    if(Screens.open !== 'beh') return;
    const lang = e.timeStamp - g.t0 >= LANG_MS;
    if(g.rz){ this.rezept(g.rz, lang); Screens.render(); return; }
    if(g.modus === 'gleich') Screens.gleichVerteilen([...g.besucht].map(s => s._ref));
    else if(!g.erledigt){
      if(lang){
        if(g.ref.art === 'ergebnis') Screens.schnell(g.ref); else Screens.rechts(g.ref);
      } else {
        const vorher = g.ref.get(), trug = Inv.cursor;
        Screens.links(g.ref);
        this.letzt = !trug && vorher && Inv.cursor === vorher ? { slot:g.start, t:e.timeStamp, stapel:vorher } : null;
      }
    }
    Screens.render();
  },
  rezept(b, alle){
    if(b._katalog !== undefined){
      const id = b._katalog, c = Inv.cursor;
      if(c && c.id === id) c.n = stackOf(id); else Inv.cursor = Inv.make(id, stackOf(id));
      Screens.info(nameOf(id));
      return;
    }
    Screens.fuellen(b._rezept, alle);
  }
};

/* Symbole im Leerlauf vorbereiten: das erste Öffnen des Rezeptbuchs
   müsste sonst jedes Würfelbild auf einmal zeichnen und kodieren. */
function symboleVorwaermen(){
  const liste = [...new Set(REZEPTE.map(r => r.out).concat(katalog()))];
  let i = 0;
  const schritt = (frist) => {
    const ende = performance.now() + 8;
    while(i < liste.length && (frist && frist.timeRemaining ? frist.timeRemaining() > 2 : performance.now() < ende)) iconFor(liste[i++]);
    if(i < liste.length) (window.requestIdleCallback || (f => setTimeout(f, 50)))(schritt);
  };
  (window.requestIdleCallback || (f => setTimeout(f, 200)))(schritt);
}
