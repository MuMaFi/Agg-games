/* Pocketcraft · Klang: Geräusche und Musik
   Die Geräusche sind echte Aufnahmen aus freien Spielen (Quellen in
   ton/QUELLEN.md und im Spiel unter Optionen → Mitwirkende). Jeder Block
   klingt nach seinem Material — beim Laufen, beim Abbauen, beim Setzen —,
   wie beim großen Vorbild. Wesen und Blöcke klingen aus ihrer Richtung und
   werden mit der Entfernung leiser. Solange eine Datei noch lädt (oder
   gar nicht geladen werden kann), springt der alte Synthesizer ein. */
'use strict';

/** Grundname → Anzahl Varianten (0: eine Datei ohne Nummer) */
const KLANG_DATEIEN = {
  schritt_gras:3, schritt_erde:2, schritt_kies:4, schritt_stein:3, schritt_sand:3, schritt_schnee:5,
  schritt_holz:2, schritt_glas:1, schritt_metall:3, schritt_wolle:4, schwimmen:3,
  hacken_stein:3, hacken_erde:1, hacken_holz:3, hacken_blatt:1, hacken_kies:2, hacken_metall:1, hacken_hand:1,
  weg:2, weg_kies:3, weg_glas:3, weg_metall:2, setzen:3, setzen_hart:2, setzen_metall:2,
  essen:3, kaputt:3, skelett:2,
  tuer_auf:0, tuer_zu:0, truhe_auf:0, truhe_zu:0, autsch:0, aufheben:0, platsch:0,
  ruestung_leder:0, ruestung_eisen:0, ruestung_diamant:0, bogen:0, pfeil:0, schere:0, melken:0,
  kuh:0, kuh_au:0, schwein:0, schwein_au:0, schaf:0,
  zombie:0, zombie_au:0, zombie_tot:0, skelett_au:0, skelett_tot:0,
  huhn:3, huhn_au:0, kueken:0, ei_legen:0, ei_kaputt:0, werfen:0,
};

/* Material → [Datei, Lautstärke] je Anlass. Aufbau und Verhältnisse nach
   Minetest Game: Stein klingt beim Abbauen »knackig«, Holz »hackend«,
   abgebaut wird mit dem kräftigeren Schritt-Geräusch. */
const KLANG_MAT = {
  stein:   { schritt:['schritt_stein', .2],  hacken:['hacken_stein', .45], weg:['schritt_stein', .85], setzen:['setzen_hart', .75] },
  metall:  { schritt:['schritt_metall', .2], hacken:['hacken_metall', .5], weg:['weg_metall', .6],     setzen:['setzen_metall', .6] },
  erde:    { schritt:['schritt_erde', .3],   hacken:['hacken_erde', .45],  weg:['schritt_erde', .9],   setzen:['setzen', .8] },
  gras:    { schritt:['schritt_gras', .3],   hacken:['hacken_erde', .45],  weg:['schritt_erde', .9],   setzen:['setzen', .8] },
  sand:    { schritt:['schritt_sand', .16],  hacken:['hacken_erde', .4],   weg:['schritt_sand', .55],  setzen:['setzen', .8] },
  kies:    { schritt:['schritt_kies', .28],  hacken:['hacken_kies', .45],  weg:['weg_kies', .9],       setzen:['setzen', .8] },
  holz:    { schritt:['schritt_holz', .25],  hacken:['hacken_holz', .45],  weg:['schritt_holz', .9],   setzen:['setzen_hart', .75] },
  blatt:   { schritt:['schritt_gras', .3],   hacken:['hacken_blatt', .45], weg:['schritt_gras', .7],   setzen:['setzen', .7] },
  pflanze: { schritt:null,                   hacken:['hacken_hand', .35],  weg:['schritt_gras', .55],  setzen:['setzen', .6] },
  glas:    { schritt:['schritt_glas', .25],  hacken:['schritt_glas', .4],  weg:['weg_glas', .8],       setzen:['setzen_hart', .75] },
  schnee:  { schritt:['schritt_schnee', .22],hacken:['schritt_schnee', .4],weg:['schritt_schnee', .5], setzen:['setzen', .7] },
  wolle:   { schritt:['schritt_wolle', .25], hacken:['schritt_wolle', .4], weg:['schritt_wolle', .6],  setzen:['schritt_wolle', .6] },
  wasser:  { schritt:['schwimmen', .22],     hacken:null,                  weg:['platsch', .5],        setzen:['platsch', .5] },
};
function materialVon(id){
  if(isWasser(id)) return 'wasser';
  if(isWool(id)) return 'wolle';
  if(isWheat(id) || id === B.TALLGRASS || id === B.ROSE || id === B.DANDELION || id === B.TORCH) return 'pflanze';
  if(id === B.LEAVES) return 'blatt';
  if(id === B.GLASS) return 'glas';
  if(id === B.SNOW) return 'schnee';
  if(id === B.SAND) return 'sand';
  if(id === B.GRAVEL) return 'kies';
  if(id === B.GRASS) return 'gras';
  if(id === B.DIRT || id === B.FARMLAND) return 'erde';
  if(id === B.IRON_BLOCK || id === B.GOLD_BLOCK || id === B.DIAMOND_BLOCK) return 'metall';
  const b = blocks[id];
  if(b && (b.tool === 'axe' || isDoor(id) || isLadder(id) || id === B.BED || id === B.CACTUS)) return 'holz';
  return 'stein';
}
/** Wesen: [Datei, Lautstärke, Tonhöhe] für »laut«, »au« und »tot«; »kind«
    ersetzt »laut« bei Jungen, die sonst nur höher klingen */
const WESEN_KLANG = {
  pig:      { laut:['schwein', .6],  au:['schwein_au', .65],  tot:['schwein_au', .65, .82] },
  cow:      { laut:['kuh', .55],     au:['kuh_au', .65],      tot:['kuh_au', .65, .8] },
  sheep:    { laut:['schaf', .6],    au:['schaf', .65, 1.3],  tot:['schaf', .65, 1.05] },
  zombie:   { laut:['zombie', .55],  au:['zombie_au', .7],    tot:['zombie_tot', .75] },
  skeleton: { laut:['skelett', .8],  au:['skelett_au', .7],   tot:['skelett_tot', .75] },
  chicken:  { laut:['huhn', .5],     au:['huhn_au', .6],      tot:['huhn_au', .6, .85], kind:['kueken', .45] },
};
const zufall = (a, b) => a + Math.random()*(b - a);

const Sfx = {
  ctx:null, on:true, laut:1, haupt:null,
  puffer: new Map(), laedt: new Map(), _letzte: {}, _ort: null,

  init(){
    if(this.ctx){ if(this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); return; }
    try{ this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }catch(e){ this.on = false; return; }
    this.haupt = this.ctx.createGain();
    this.haupt.gain.value = this.laut;
    this.haupt.connect(this.ctx.destination);
    this.vorladen();
    if(typeof Musik !== 'undefined') Musik.bereit();
  },
  /** 0 … 1; 0 heißt aus */
  lautSetzen(v){
    this.laut = v; this.on = v > 0;
    if(this.haupt) this.haupt.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  },

  /* — Dateien — */
  laden(datei){
    if(this.puffer.has(datei)) return Promise.resolve(this.puffer.get(datei));
    let p = this.laedt.get(datei);
    if(p) return p;
    p = fetch('ton/' + datei + '.mp3')
      .then(r => { if(!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(b => new Promise((ok, fehler) => {
        // ältere Safaris kennen nur die Rückruf-Form
        const r = this.ctx.decodeAudioData(b, ok, fehler);
        if(r && r.then) r.then(ok, fehler);
      }))
      .then(buf => { this.puffer.set(datei, buf); return buf; })
      .catch(() => { this.puffer.set(datei, null); return null; });
    this.laedt.set(datei, p);
    return p;
  },
  /** alles im Hintergrund, vier auf einmal — die ersten Schritte sollen nicht warten */
  vorladen(){
    const alle = [];
    for(const [n, k] of Object.entries(KLANG_DATEIEN)){
      if(k) for(let i = 1; i <= k; i++) alle.push(n + '_' + i); else alle.push(n);
    }
    let i = 0;
    const weiter = () => { if(i < alle.length) this.laden(alle[i++]).then(weiter); };
    for(let k = 0; k < 4; k++) weiter();
  },

  /* — Abspielen — */
  /** die Ohren sitzen in der Kamera */
  hoerer(x, y, z, yaw, pitch){
    this._ort = [x, y, z];
    if(!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    const cp = Math.cos(pitch), fx = -Math.sin(yaw)*cp, fy = Math.sin(pitch), fz = -Math.cos(yaw)*cp;
    if(L.positionX){
      L.positionX.setValueAtTime(x, t); L.positionY.setValueAtTime(y, t); L.positionZ.setValueAtTime(z, t);
      L.forwardX.setValueAtTime(fx, t); L.forwardY.setValueAtTime(fy, t); L.forwardZ.setValueAtTime(fz, t);
      L.upX.setValueAtTime(0, t); L.upY.setValueAtTime(1, t); L.upZ.setValueAtTime(0, t);
    } else if(L.setPosition){ L.setPosition(x, y, z); L.setOrientation(fx, fy, fz, 0, 1, 0); }
  },
  /** name: Grundname aus KLANG_DATEIEN; o: gain, rate, x/y/z (dann aus dieser Richtung), weit */
  probe(name, o){
    if(!this.on) return true;                      // stumm geschaltet: nichts nachholen
    this.init(); if(!this.ctx) return false;
    const n = KLANG_DATEIEN[name];
    if(n === undefined) return false;
    o = o || {};
    const weit = o.weit || 24;
    if(o.x !== undefined && this._ort){
      const d = Math.hypot(o.x - this._ort[0], o.y - this._ort[1], o.z - this._ort[2]);
      if(d > weit) return true;                    // zu weit weg: nicht zu hören
    }
    // zufällige Variante, aber nicht zweimal hintereinander dieselbe
    let i = n ? 1 + ((Math.random()*n) | 0) : 0;
    if(n > 1 && i === this._letzte[name]) i = (i % n) + 1;
    this._letzte[name] = i;
    const datei = n ? name + '_' + i : name;
    const buf = this.puffer.get(datei);
    if(!buf){ if(buf === undefined) this.laden(datei); return false; }
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate || 1;
    const g = c.createGain(); g.gain.value = o.gain !== undefined ? o.gain : 1;
    src.connect(g);
    let ende = g;
    if(o.x !== undefined){
      const pan = c.createPanner();
      pan.panningModel = 'equalpower'; pan.distanceModel = 'linear';
      pan.refDistance = 2; pan.maxDistance = weit; pan.rolloffFactor = 1;
      if(pan.positionX){ pan.positionX.value = o.x; pan.positionY.value = o.y; pan.positionZ.value = o.z; }
      else pan.setPosition(o.x, o.y, o.z);
      g.connect(pan); ende = pan;
    }
    ende.connect(this.haupt);
    src.start();
    return true;
  },
  /** Blockgeräusch nach Material: art = schritt · hacken · weg · setzen */
  block(art, id, x, y, z, laut){
    const m = KLANG_MAT[materialVon(id)], e = m && m[art];
    if(!e) return;
    const rate = art === 'hacken' ? zufall(.8, 1) : (art === 'schritt' ? zufall(.9, 1.1) : zufall(.85, 1.05));
    const o = { gain: e[1]*(laut || 1), rate };
    if(x !== undefined){ o.x = x + .5; o.y = y + .5; o.z = z + .5; o.weit = 16; }
    if(!this.probe(e[0], o)) this.synth(art === 'schritt' ? 'step' : art === 'hacken' ? 'dig' : art === 'weg' ? 'break' : 'place');
  },
  /** Wesen: art = laut · au · tot; Junge klingen höher */
  wesen(m, art){
    const k = WESEN_KLANG[m.type], piepst = m.kind > 0 && art === 'laut' && k && k.kind;
    const e = piepst ? k.kind : k && k[art];
    if(!e) return;
    const rate = (e[2] || 1)*zufall(.9, 1.1)*(m.kind > 0 && !piepst ? 1.35 : 1);
    if(!this.probe(e[0], { gain: e[1], rate, x: m.x, y: m.y + m.h*.7, z: m.z, weit: 20 }))
      this.synth(art === 'laut' ? (m.def.laut || '') : 'hit');
  },
  ruestung(id){
    const key = (items[id] && items[id].key) || '';
    const name = key.startsWith('leather') ? 'ruestung_leder' : key.startsWith('diamond') ? 'ruestung_diamant' : 'ruestung_eisen';
    this.probe(name, { gain: .6, rate: zufall(.95, 1.05) });
  },
  /** die alten Namen; mit Ort (x, y, z) klingt es aus dieser Richtung */
  play(what, x, y, z){
    const o = x !== undefined ? { x, y, z } : {};
    const mit = (name, gain, a, b) => this.probe(name, Object.assign({ gain, rate: zufall(a || .9, b || 1.1) }, o));
    let ok = false;
    switch(what){
      case 'hurt':    ok = mit('autsch', .9); break;
      case 'die':     ok = this.probe('autsch', { gain: 1, rate: .72 }); break;
      case 'eat':     ok = mit('essen', .55); break;
      case 'pickup':  ok = mit('aufheben', .45, .7, 1.5); break;
      case 'bogen':   ok = mit('bogen', .7); break;
      case 'pfeil':   ok = mit('pfeil', .6); break;
      case 'schere':  ok = mit('schere', .75); break;
      case 'melken':  ok = mit('melken', .7); break;
      case 'werfen':  ok = mit('werfen', .5, .75, .95); break;
      case 'ei_kaputt': ok = mit('ei_kaputt', .6); break;
      case 'ei_legen':  ok = mit('ei_legen', .7); break;
      case 'platsch': ok = mit('platsch', .55); break;
      case 'break':
      case 'kaputt':  ok = mit('kaputt', .7); break;
      case 'door':
      case 'tuer_auf':  ok = mit('tuer_auf', .5, .92, 1.05); break;
      case 'tuer_zu':   ok = mit('tuer_zu', .45, .92, 1.05); break;
      case 'truhe_auf': ok = mit('truhe_auf', .55, .92, 1.05); break;
      case 'truhe_zu':  ok = mit('truhe_zu', .5, .92, 1.05); break;
      case 'dig':     ok = mit('hacken_erde', .45); break;
      case 'place':   ok = mit('setzen', .7); break;
      case 'step':    ok = mit('schritt_gras', .3); break;
    }
    if(!ok) this.synth(what);
  },

  /* — Der alte Synthesizer: für Klick, Handwerk, Geburt und als Ersatz — */
  tone(f, dur, type, gain, slide){
    if(!this.on) return;
    this.init(); if(!this.ctx) return;
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, c.currentTime);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f*slide), c.currentTime + dur);
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.exponentialRampToValueAtTime(gain || 0.12, c.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g); g.connect(this.haupt); o.start(); o.stop(c.currentTime + dur + 0.02);
  },
  noise(dur, gain, filterFreq){
    if(!this.on) return; this.init(); if(!this.ctx) return;
    const c = this.ctx, n = c.sampleRate * dur | 0;
    const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for(let i=0;i<n;i++) d[i] = (Math.random()*2-1) * (1 - i/n);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterFreq || 900;
    const g = c.createGain(); g.gain.value = gain || 0.16;
    src.connect(f); f.connect(g); g.connect(this.haupt); src.start();
  },
  synth(what){
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
      case 'huhn':  this.tone(720, 0.05, 'square', 0.035, 1.3); setTimeout(()=>this.tone(640,0.07,'square',0.035,0.8), 70); break;
      case 'werfen': this.noise(0.08, 0.06, 2000); break;
      case 'ei_kaputt': this.noise(0.06, 0.12, 2600); break;
      case 'ei_legen': this.tone(500, 0.06, 'triangle', 0.06, 0.6); break;
      case 'geburt': this.tone(660, 0.08, 'triangle', 0.07, 1.3); setTimeout(()=>this.tone(990, 0.12, 'triangle', 0.07, 1.1), 90); break;
      case 'schere': this.noise(0.04, 0.10, 4000); setTimeout(()=>this.noise(0.04, 0.10, 4000), 90); break;
      case 'die':   this.tone(300, 0.7, 'sawtooth', 0.16, 0.25); break;
    }
  }
};

/* ═══════════════════════════════════════════════════════════════════
   MUSIK
   Auf dem Titelbild laufen die Stücke durch; in der Welt kommt ab und zu
   eins, mit Pausen dazwischen — wie beim Vorbild. Welche es gibt, steht
   in musik/liste.json, samt Pegelangabe (db), damit leise und laute gleich
   laut klingen. Ist die Liste leer, bleibt es still. Angezeigt wird nichts:
   keine Titel, kein Name.
   ═══════════════════════════════════════════════════════════════════ */
const Musik = {
  liste: null,
  laut: 0.7, modus: null, spielt: false, titel: null,
  _a: null, _g: null, _plan: 0, _reihe: [], _geladen: null,

  laden(){
    if(this._geladen) return this._geladen;
    this._geladen = fetch('musik/liste.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .then(d => { this.liste = (d && Array.isArray(d.titel) ? d.titel : []).filter(t => t && t.datei); })
      .catch(() => { this.liste = []; });
    return this._geladen;
  },
  hat(){ return !!(this.liste && this.liste.length); },
  /** Regler mal Pegelangabe des Stücks */
  ziel(){ return this.laut*Math.pow(10, ((this.titel && +this.titel.db) || 0)/20); },
  lautSetzen(v){
    this.laut = v;
    if(this._g && Sfx.ctx && this.spielt) this._g.gain.setTargetAtTime(this.ziel(), Sfx.ctx.currentTime, 0.1);
    if(v <= 0) this.stopp(0.2);
    else if(!this.spielt && this.modus === 'titel') this.weiter(0.5);
  },
  /** nach der ersten Berührung: vorher darf der Browser nichts abspielen */
  bereit(){ if(this.modus === 'titel' && !this.spielt) this.weiter(0.3); },
  zumTitel(){ this.modus = 'titel'; clearTimeout(this._plan); if(!this.spielt) this.weiter(0.8); },
  inDieWelt(){
    this.modus = 'spiel';
    this.stopp(2.5);
    clearTimeout(this._plan);
    this._plan = setTimeout(() => this.weiter(0), (25 + Math.random()*50)*1000);
  },
  /** der nächste Titel, in zufälliger Reihenfolge, jeder einmal pro Runde */
  weiter(verzug){
    clearTimeout(this._plan);
    this._plan = setTimeout(async () => {
      await this.laden();
      if(!this.hat() || this.laut <= 0 || !this.modus || !Sfx.ctx || document.hidden) return;
      if(!this._reihe.length) this._reihe = this.liste.slice().sort(() => Math.random() - .5);
      this.spielen(this._reihe.shift());
    }, (verzug || 0)*1000);
  },
  spielen(t){
    const c = Sfx.ctx; if(!c || !t) return;
    if(!this._a){
      this._a = new Audio();
      this._a.preload = 'auto';
      // über WebAudio, damit der Lautstärkeregler auch auf dem iPhone wirkt
      try{
        const q = c.createMediaElementSource(this._a);
        this._g = c.createGain(); this._g.gain.value = 0;
        q.connect(this._g); this._g.connect(c.destination);
      }catch(e){ this._g = null; }
      this._a.addEventListener('ended', () => this.fertig());
      this._a.addEventListener('error', () => this.fertig());
    }
    const a = this._a;
    a.src = 'musik/' + String(t.datei).split('/').map(encodeURIComponent).join('/');
    this.titel = t; this.spielt = true;
    if(this._g){ this._g.gain.cancelScheduledValues(c.currentTime); this._g.gain.setValueAtTime(0, c.currentTime); this._g.gain.linearRampToValueAtTime(this.ziel(), c.currentTime + 2); }
    else a.volume = Math.min(1, this.ziel());
    const p = a.play(); if(p && p.catch) p.catch(() => { this.spielt = false; });
  },
  fertig(){
    this.spielt = false; this.titel = null;
    // auf dem Titelbild gleich weiter, in der Welt erst nach einer Pause
    if(this.modus === 'titel') this.weiter(2);
    else if(this.modus === 'spiel') this.weiter(120 + Math.random()*150);
  },
  stopp(blende){
    const a = this._a, c = Sfx.ctx;
    if(!a || !this.spielt) return;
    this.spielt = false;
    if(this._g && c){
      this._g.gain.cancelScheduledValues(c.currentTime);
      this._g.gain.setValueAtTime(this._g.gain.value, c.currentTime);
      this._g.gain.linearRampToValueAtTime(0, c.currentTime + (blende || 0.01));
      setTimeout(() => { if(!this.spielt) a.pause(); }, (blende || 0.01)*1000 + 50);
    } else a.pause();
  },
};
// Musik ruht, solange das Spiel nicht zu sehen ist
document.addEventListener('visibilitychange', () => {
  const a = Musik._a; if(!a) return;
  if(document.hidden){ if(Musik.spielt){ Musik._warAn = true; a.pause(); } }
  else if(Musik._warAn){ Musik._warAn = false; const p = a.play(); if(p && p.catch) p.catch(() => {}); }
});
