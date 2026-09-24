/* Taschenwelt · Titelbild und Weltenwahl
   Aufgebaut wie der Startbildschirm des großen Vorbilds: hinten dreht sich
   eine echte Welt langsam im Kreis, vorn das Logo aus Steinblöcken, ein
   gelber Spruch, drei Knöpfe. »Einzelspieler« führt zur Weltenliste, von
   dort zu »Neue Welt erstellen«, »Bearbeiten«, »Löschen«, »Kopieren«. */
'use strict';

const VERSION = 'Taschenwelt 2.1';
const SPRUECHE = [
  'Jetzt mit Werkbank!', 'Auch hochkant!', '57 Rezepte!', 'Komplett offline!', 'Tür zu, Zombie draußen!',
  'Weizen wächst!', 'Aus Würfeln gebaut!', '100 % kachelbar!', 'Schlaf gut!', 'Eimer inklusive!',
  'Bruchstein ist auch Stein!', 'Kein Download nötig!', 'Mit Strohbett!', 'Hack die Erde!',
  'Diamanten sind selten!', 'Nachts wird es laut!', 'Jetzt mit Rüstung!', 'Äxte auch gespiegelt!',
  'Grab nie senkrecht nach unten!', 'Fackeln helfen!', 'Pixelig und stolz drauf!', 'Frisch gebacken: Brot!',
  'Mehrere Welten!', 'Passt in die Tasche!', 'Schweine grunzen!', 'Voll auf Holz!'
];
const STARTWORTE = ['taschenwelt','morgengrau','fichtental','kalkstein','nordwind','hohlwelt','bernstein','ackerland','moorgrund','eichenhain'];
const MODUS_TEXT = {
  ueberleben: ['Überleben', 'Suche Rohstoffe, stelle Werkzeuge her, pass auf Hunger und Gesundheit auf. Nachts kommen Zombies.'],
  kreativ:    ['Kreativ', 'Unbegrenzte Blöcke aus dem Katalog, fliegen mit doppeltem Sprung, keine Gefahr.'],
};

/* ── Logo aus Steinblöcken ─────────────────────────────────────────── */
const GLYPHEN = {
  T:['#####','..#..','..#..','..#..','..#..','..#..','..#..'],
  A:['.###.','#...#','#...#','#####','#...#','#...#','#...#'],
  S:['.####','#....','#....','.###.','....#','....#','####.'],
  C:['.####','#....','#....','#....','#....','#....','.####'],
  H:['#...#','#...#','#...#','#####','#...#','#...#','#...#'],
  E:['#####','#....','#....','####.','#....','#....','#####'],
  N:['#...#','##..#','#.#.#','#.#.#','#..##','#...#','#...#'],
  W:['#...#','#...#','#...#','#.#.#','#.#.#','##.##','#...#'],
  L:['#....','#....','#....','#....','#....','#....','#####'],
};
function logoZeichnen(cv, wort, maxBreite){
  // fett gesetzt: jede Zelle bekommt ihre rechte Nachbarin dazu, so werden
  // senkrechte Striche zwei Blöcke breit wie im Logo des Vorbilds
  const zellen = [], da = new Set();
  let x0 = 0;
  for(const ch of wort){
    const g = GLYPHEN[ch];
    for(let y=0; y<7; y++) for(let x=0; x<5; x++) if(g[y][x] === '#')
      for(const xx of [x0 + x, x0 + x + 1]){ const k = xx + ',' + y; if(!da.has(k)){ da.add(k); zellen.push([xx, y]); } }
    x0 += 7;
  }
  const breite = x0 - 1;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const zelle = Math.max(3, Math.floor(maxBreite*dpr / (breite + 1.2)));
  const tiefe = Math.round(zelle*0.95), schraeg = 0.35;
  cv.width = Math.ceil((breite + 1)*zelle + tiefe*schraeg + 4);
  cv.height = Math.ceil(7*zelle + tiefe + 4);
  cv.style.width = (cv.width/dpr) + 'px';
  cv.style.height = (cv.height/dpr) + 'px';
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = false;
  const ox = 2, oy = 2;
  // Tiefe: nach unten rechts versetzte Schichten, dunkler mit dem Abstand
  for(let k = tiefe; k >= 1; k--){
    const t = k/tiefe, g = Math.round(58 - 34*t);
    c.fillStyle = 'rgb(' + g + ',' + g + ',' + (g + 2) + ')';
    for(const [x, y] of zellen) c.fillRect(ox + x*zelle + k*schraeg, oy + y*zelle + k, zelle, zelle);
  }
  // Umriss
  c.fillStyle = '#121214';
  const r = Math.max(1, Math.round(zelle/10));
  for(const [x, y] of zellen) c.fillRect(ox + x*zelle - r, oy + y*zelle - r, zelle + 2*r, zelle + 2*r);
  // Vorderseite: Bruchstein-Textur, eine Kachel über vier Zellen
  const muster = c.createPattern(layerCanvas('cobble'), 'repeat');
  const s = zelle*4/TS;
  if(muster.setTransform) muster.setTransform(new DOMMatrix([s, 0, 0, s, ox, oy]));
  c.fillStyle = muster;
  for(const [x, y] of zellen) c.fillRect(ox + x*zelle, oy + y*zelle, zelle, zelle);
  // Verlauf: oben heller
  const vg = c.createLinearGradient(0, oy, 0, oy + 7*zelle);
  vg.addColorStop(0, 'rgba(255,255,255,.22)'); vg.addColorStop(.5, 'rgba(255,255,255,0)'); vg.addColorStop(1, 'rgba(0,0,0,.22)');
  c.fillStyle = vg;
  for(const [x, y] of zellen) c.fillRect(ox + x*zelle, oy + y*zelle, zelle, zelle);
  // jede Zelle ein Block: Lichtkante oben links, Schatten unten rechts
  const b = Math.max(1, Math.round(zelle/9));
  const hat = new Set(zellen.map(([x, y]) => x + ',' + y));
  for(const [x, y] of zellen){
    const px = ox + x*zelle, py = oy + y*zelle;
    c.fillStyle = 'rgba(255,255,255,.30)';
    if(!hat.has(x + ',' + (y-1))) c.fillRect(px, py, zelle, b);
    if(!hat.has((x-1) + ',' + y)) c.fillRect(px, py, b, zelle);
    c.fillStyle = 'rgba(0,0,0,.34)';
    if(!hat.has(x + ',' + (y+1))) c.fillRect(px, py + zelle - b, zelle, b);
    if(!hat.has((x+1) + ',' + y)) c.fillRect(px + zelle - b, py, b, zelle);
    c.fillStyle = 'rgba(0,0,0,.10)';
    c.fillRect(px + zelle - 1, py, 1, zelle); c.fillRect(px, py + zelle - 1, zelle, 1);
  }
}

/* ── Menüs ─────────────────────────────────────────────────────────── */
const Menue = {
  aktiv: null, vonPause: false,
  welten: [], gewaehlt: null, neuModus: 'ueberleben', bearbeiteId: null, loeschId: null,
  _letzterTipp: { id: null, t: 0 },

  init(){
    document.documentElement.style.setProperty('--steinbild', 'url(' + iconURL('stone') + ')');
    document.documentElement.style.setProperty('--erdbild', 'url(' + iconURL('dirt') + ')');
    $('#tVersion').textContent = VERSION;
    const knopf = (id, fn) => $(id).addEventListener('click', e => { Sfx.play('klick'); fn(e); });
    knopf('#tEinzel', () => this.zuWelten());
    knopf('#tOptionen', () => this.zeige('optionen'));
    knopf('#tHeim', () => { location.href = '../../index.html'; });
    knopf('#wSpielen', () => this.spielen(this.gewaehlt));
    knopf('#wNeu', () => this.zuNeu());
    knopf('#wBearb', () => this.zuBearbeiten());
    knopf('#wLoeschen', () => {
      const w = this.welten.find(q => q.id === this.gewaehlt); if(!w) return;
      this.loeschId = w.id;
      $('#lText').textContent = '„' + w.name + '“ wird für immer verloren sein! (Eine lange Zeit!)';
      this.zeige('loeschen');
    });
    knopf('#wKopie', () => this.kopieren());
    knopf('#wZurueck', () => this.zeige('titel'));
    knopf('#wEinlesen', () => $('#wDatei').click());
    $('#wDatei').addEventListener('change', e => this.einlesen(e.target.files && e.target.files[0]));
    $('#wSuche').addEventListener('input', () => this.listeZeichnen());
    knopf('#nModus', () => { this.neuModus = this.neuModus === 'ueberleben' ? 'kreativ' : 'ueberleben'; this.modusZeigen(); });
    knopf('#nLos', () => this.erstellen());
    knopf('#nAbbruch', () => this.zuWelten());
    knopf('#bSichern', () => this.umbenennen());
    knopf('#bExport', () => this.exportieren());
    knopf('#bAbbruch', () => this.zuWelten());
    knopf('#lJa', () => this.loeschen());
    knopf('#lNein', () => this.zuWelten());
    knopf('#oFertig', () => this.optionenZu());
    knopf('#oSprung', () => { Game.settings.autojump = !Game.settings.autojump; Game.saveOpts(); this.optionenZeigen(); });
    knopf('#oTon', () => { Sfx.on = !Sfx.on; Game.settings.ton = Sfx.on; Game.saveOpts(); this.optionenZeigen(); });
    knopf('#oDebug', () => { Game.settings.debug = !Game.settings.debug; $('#dbg').classList.toggle('on', Game.settings.debug); Game.saveOpts(); this.optionenZeigen(); });
    $('#oRd').addEventListener('input', e => { Game.settings.rd = +e.target.value; Game.saveOpts(); this.optionenZeigen(); });
    $('#oSens').addEventListener('input', e => { Game.settings.sens = +e.target.value; Game.saveOpts(); this.optionenZeigen(); });
    // Pause und Tod im selben Stil
    knopf('#resume', () => Screens.hide());
    knopf('#pOptionen', () => { this.vonPause = true; this.zeige('optionen'); });
    knopf('#toMenu', () => this.speichernUndTitel());
    knopf('#respawn', () => Game.respawn());
    knopf('#deathTitel', () => { Game.respawn(); this.speichernUndTitel(); });
    // Enter im Namensfeld = erstellen
    $('#nName').addEventListener('keydown', e => { if(e.key === 'Enter') this.erstellen(); });
    $('#nSeed').addEventListener('keydown', e => { if(e.key === 'Enter') this.erstellen(); });
    $('#bName').addEventListener('keydown', e => { if(e.key === 'Enter') this.umbenennen(); });
    window.addEventListener('resize', () => { if(this.aktiv === 'titel') this.logo(); });

    this.spruch();
    this.logo();
    this.zeige('titel');
    Game.panorama(STARTWORTE[0] + '-panorama');
    this.bereit = Speicher.init().then(() => this.listeLaden());
  },

  zeige(name){
    for(const id of ['titel','welten','neu','bearbeiten','loeschen','optionen'])
      $('#' + id).classList.toggle('on', id === name);
    this.aktiv = name;
    document.body.classList.toggle('imMenue', !!name && !Game.running);
    document.body.classList.toggle('mcOffen', !!name);
    if(name === 'titel') this.logo();
    if(name === 'optionen') this.optionenZeigen();
  },
  alleZu(){ this.zeige(null); this.aktiv = null; document.body.classList.remove('imMenue', 'mcOffen'); },
  /** Escape und Zurück-Taste */
  zurueck(){
    const z = { welten:'titel', neu:'welten', bearbeiten:'welten', loeschen:'welten', optionen: null };
    if(this.aktiv === 'optionen'){ this.optionenZu(); return; }
    if(this.aktiv && z[this.aktiv]) this.zeige(z[this.aktiv]);
  },
  spruch(){
    const s = $('#spruch');
    s.textContent = SPRUECHE[(Math.random()*SPRUECHE.length)|0];
    // lange Sprüche etwas kleiner, wie beim Vorbild
    s.style.setProperty('--gross', Math.max(.62, Math.min(1, 16/s.textContent.length)).toFixed(2));
  },
  logo(){
    const w = Math.min(window.innerWidth*0.9, 760, window.innerHeight*1.6);
    logoZeichnen($('#logo'), 'TASCHENWELT', w);
  },

  /* — Weltenliste — */
  async listeLaden(){
    try{ this.welten = await Speicher.liste(); }catch(e){ this.welten = []; }
    if(this.gewaehlt && !this.welten.some(w => w.id === this.gewaehlt)) this.gewaehlt = null;
    if(!this.gewaehlt && this.welten.length) this.gewaehlt = this.welten[0].id;
    this.listeZeichnen();
  },
  async zuWelten(){
    await this.bereit;
    await this.listeLaden();
    if(!this.welten.length){ this.zuNeu(); return; }
    this.zeige('welten');
  },
  listeZeichnen(){
    const box = $('#wListe'); box.innerHTML = '';
    const such = ($('#wSuche').value || '').trim().toLowerCase();
    const liste = this.welten.filter(w => !such || w.name.toLowerCase().includes(such) || String(w.seed).toLowerCase().includes(such));
    for(const w of liste){
      const e = el('div', 'welt' + (w.id === this.gewaehlt ? ' gewaehlt' : ''));
      e.dataset.id = w.id;
      const bild = el('div', 'weltBild');
      bild.style.backgroundImage = 'url(' + (w.bild || isoIconURL('grass_top', 'grass_side', 'grass_side')) + ')';
      if(!w.bild) bild.classList.add('ohne');
      const los = el('button', 'weltLos'); los.setAttribute('aria-label', w.name + ' spielen'); los.innerHTML = '<i></i>';
      bild.appendChild(los);
      e.appendChild(bild);
      const t = el('div', 'weltText');
      const n = el('b'); n.textContent = w.name; t.appendChild(n);
      const d = el('span'); d.textContent = 'Zuletzt gespielt: ' + datum(w.gespielt); t.appendChild(d);
      const i = el('span');
      i.textContent = MODUS_TEXT[w.modus || 'ueberleben'][0] + ' · Tag ' + (w.tag || 1) + ' · Startwert „' + w.seed + '“ · ' + groesse(w.groesse);
      t.appendChild(i);
      e.appendChild(t);
      e.addEventListener('click', ev => {
        const jetzt = performance.now(), L = this._letzterTipp;
        if(ev.target.closest('.weltLos') || (L.id === w.id && jetzt - L.t < 400)){ this.spielen(w.id); return; }
        this._letzterTipp = { id: w.id, t: jetzt };
        this.gewaehlt = w.id; Sfx.play('klick'); this.listeZeichnen();
      });
      box.appendChild(e);
    }
    if(!liste.length){
      const p = el('p', 'weltLeer');
      p.textContent = this.welten.length ? 'Keine Welt passt zur Suche.' : 'Noch keine Welten. Erstelle deine erste!';
      box.appendChild(p);
    }
    const hat = !!this.gewaehlt;
    for(const id of ['#wSpielen','#wBearb','#wLoeschen','#wKopie']) $(id).disabled = !hat;
  },

  /* — Neue Welt — */
  zuNeu(){
    const namen = new Set(this.welten.map(w => w.name));
    let name = 'Neue Welt', k = 2;
    while(namen.has(name)) name = 'Neue Welt (' + (k++) + ')';
    $('#nName').value = name;
    $('#nSeed').value = '';
    this.neuModus = 'ueberleben';
    this.modusZeigen();
    this.zeige('neu');
  },
  modusZeigen(){
    const [n, t] = MODUS_TEXT[this.neuModus];
    $('#nModus').textContent = 'Spielmodus: ' + n;
    $('#nModusText').textContent = t;
  },
  async erstellen(){
    await this.bereit;
    const name = ($('#nName').value || '').trim() || 'Neue Welt';
    let seed = ($('#nSeed').value || '').trim();
    if(!seed) seed = STARTWORTE[(Math.random()*STARTWORTE.length)|0] + '-' + ((Math.random()*9000 + 1000)|0);
    const meta = { id: neueWeltId(), name, seed, modus: this.neuModus, erstellt: Date.now(), gespielt: Date.now(), tag: 1, groesse: 0, bild: null };
    Sfx.init();
    this.alleZu();
    Game.start(meta, null);
    this.gewaehlt = meta.id;
    hint(this.neuModus === 'kreativ' ? 'Kreativmodus — flieg mit doppeltem Sprung-Tipp' : 'Schlag Holz, bau eine Werkbank, überleb die Nacht', 4200);
    Game.save();                     // gleich in die Liste, auch wenn man sofort wieder geht
  },

  /* — Spielen — */
  async spielen(id){
    if(!id) return;
    await this.bereit;
    const meta = this.welten.find(w => w.id === id) || await Speicher.steckbrief(id);
    let text = null;
    try{ text = await Speicher.laden(id); }catch(e){}
    let daten = null;
    try{ daten = text ? JSON.parse(text) : null; }catch(e){}
    if(!meta || !daten){ hint('Diese Welt lässt sich nicht laden', 2600); return; }
    Sfx.init();
    this.alleZu();
    this.gewaehlt = id;
    Game.start(meta, daten);
    hint('Willkommen zurück in „' + meta.name + '“', 2400);
  },
  async speichernUndTitel(){
    $('#toMenu').disabled = true;
    await Game.save();
    $('#toMenu').disabled = false;
    Speicher.notfallLoeschen();
    Game.zumTitel();
    await this.listeLaden();
    this.spruch();
    this.zeige('titel');
  },

  /* — Bearbeiten, Kopieren, Löschen — */
  zuBearbeiten(){
    const w = this.welten.find(q => q.id === this.gewaehlt); if(!w) return;
    this.bearbeiteId = w.id;
    $('#bName').value = w.name;
    $('#bInfo').textContent = 'Startwert „' + w.seed + '“ · erstellt am ' + datum(w.erstellt) + ' · ' + groesse(w.groesse);
    this.zeige('bearbeiten');
  },
  async umbenennen(){
    const w = this.welten.find(q => q.id === this.bearbeiteId); if(!w) return;
    const name = ($('#bName').value || '').trim();
    if(name && name !== w.name){ w.name = name; await Speicher.steckbriefSichern(w); }
    await this.zuWelten();
  },
  async kopieren(){
    const w = this.welten.find(q => q.id === this.gewaehlt); if(!w) return;
    try{
      const neu = await Speicher.kopieren(w.id, w.name + ' – Kopie');
      this.gewaehlt = neu.id;
      await this.listeLaden();
    }catch(e){ hint('Kopieren fehlgeschlagen' + (e && e.name === 'QuotaExceededError' ? ': Speicher voll' : ''), 2600); }
  },
  async loeschen(){
    const id = this.loeschId; if(!id) return;
    await Speicher.loeschen(id);
    if(this.gewaehlt === id) this.gewaehlt = null;
    this.loeschId = null;
    await this.listeLaden();
    this.zeige('welten');
  },
  /** Sicherungsdatei: Steckbrief und Datenteil in einer JSON-Datei */
  async exportieren(){
    const w = this.welten.find(q => q.id === this.bearbeiteId); if(!w) return;
    const text = await Speicher.laden(w.id); if(!text) return;
    const datei = JSON.stringify({ format:'taschenwelt-welt', version:2, meta:w, daten:text });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([datei], { type:'application/json' }));
    a.download = 'taschenwelt-' + w.name.replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  async einlesen(datei){
    if(!datei) return;
    try{
      const d = JSON.parse(await datei.text());
      if(!d || d.format !== 'taschenwelt-welt' || !d.meta || typeof d.daten !== 'string') throw new Error('Format');
      JSON.parse(d.daten);
      const namen = new Set(this.welten.map(w => w.name));
      let name = d.meta.name || 'Eingelesene Welt';
      if(namen.has(name)) name += ' (eingelesen)';
      const meta = Object.assign({}, d.meta, { id: neueWeltId(), name, gespielt: Date.now() });
      await Speicher.sichern(meta, d.daten);
      this.gewaehlt = meta.id;
      await this.listeLaden();
      hint('„' + name + '“ eingelesen', 2200);
    }catch(e){ hint('Das ist keine Taschenwelt-Sicherung', 2600); }
    $('#wDatei').value = '';
  },

  /* — Optionen — */
  optionenZeigen(){
    const s = Game.settings;
    $('#oRd').value = s.rd; $('#oRdText').textContent = 'Sichtweite: ' + s.rd + ' Chunks';
    $('#oSens').value = s.sens; $('#oSensText').textContent = 'Blick-Tempo: ' + Math.round(s.sens/12*100) + ' %';
    $('#oSprung').textContent = 'Auto-Sprung: ' + (s.autojump ? 'An' : 'Aus');
    $('#oTon').textContent = 'Ton: ' + (Sfx.on ? 'An' : 'Aus');
    $('#oDebug').textContent = 'Debug-Anzeige: ' + (s.debug ? 'An' : 'Aus');
  },
  optionenZu(){
    if(this.vonPause){ this.vonPause = false; this.alleZu(); return; }
    this.zeige('titel');
  },

  /* — Ladeanzeige beim Betreten einer Welt — */
  ladeStand(an, anteil){
    const l = $('#laden');
    l.classList.toggle('on', an);
    if(an) $('#ladenBalken').style.width = Math.round(Math.min(1, anteil)*100) + '%';
  }
};

function datum(t){
  if(!t) return '—';
  return new Date(t).toLocaleString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function groesse(b){
  if(!b) return 'neu';
  return b < 1024*1024 ? Math.max(1, Math.round(b/1024)) + ' KB' : (b/1024/1024).toFixed(1).replace('.', ',') + ' MB';
}
