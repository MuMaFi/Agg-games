/* Pocketcraft · Titelbild und Weltenwahl
   Aufgebaut wie der Startbildschirm des großen Vorbilds: hinten dreht sich
   eine echte Welt langsam im Kreis, vorn das Logo aus Steinblöcken, ein
   gelber Spruch, drei Knöpfe. »Einzelspieler« führt zur Weltenliste, von
   dort zu »Neue Welt erstellen«, »Bearbeiten«, »Löschen«, »Kopieren«.
   »Mitspieler« führt zur Serverliste: gemerkte Codes von Freunden, die
   ihre Welt geöffnet haben (siehe netz.js). */
'use strict';

const VERSION = 'Pocketcraft 26.9.7';              // Jahr.Nummer.Update
const SPRUECHE = [
  'Jetzt mit Werkbank!', 'Auch hochkant!', '79 Rezepte!', 'Komplett offline!', 'Tür zu, Zombie draußen!',
  'Weizen wächst!', 'Aus Würfeln gebaut!', '100 % kachelbar!', 'Schlaf gut!', 'Eimer inklusive!',
  'Bruchstein ist auch Stein!', 'Kein Download nötig!', 'Mit Strohbett!', 'Hack die Erde!',
  'Diamanten sind selten!', 'Nachts wird es laut!', 'Jetzt mit Rüstung!', 'Äxte auch gespiegelt!',
  'Grab nie senkrecht nach unten!', 'Fackeln helfen!', 'Pixelig und stolz drauf!', 'Frisch gebacken: Brot!',
  'Mehrere Welten!', 'Passt in die Tasche!', 'Schweine grunzen!', 'Voll auf Holz!',
  'Jetzt mit Schafen!', 'Muh!', 'Skelette zielen gut!', 'Scheren scheren!', 'Früher Taschenwelt!', 'Frische Milch!', 'Pfeil und Bogen!',
  'Jetzt mit Freunden!', 'Code eingeben, mitspielen!', 'Bis zu acht Spieler!', 'Jetzt mit Musik!', 'Hör mal, Kies!', 'Knirscht wie echt!',
  'Jetzt mit Hühnern!', 'Gack!', 'Erst das Huhn, dann das Ei!', 'Küken aus dem Ei!', 'Wasser marsch!', 'Es fließt!', 'Achtung, Wasserfall!',
  'Jetzt mit Plattenspieler!', 'Leg eine Platte auf!',
  'Jetzt mit Bergen!', 'Es regnet!', 'Schnee auf den Gipfeln!', 'Tief in der Höhle!', 'Regenschirm vergessen!',
  'Jetzt mit Chat!', 'Probier /hilfe!', '/gamemode kreativ!', 'Drück T zum Reden!',
  'Jetzt mit Flachland!', 'Flach wie eine Flunder!', 'Platz ohne Ende!',
  'Jetzt mit Redstone!', 'Strom an!', 'Hebel umlegen!', 'Es werde Licht!', 'Nicht, und, oder!',
  'Jetzt mit Schleimen!', 'Boing!', 'Schleim-Chunks!', 'Klein, mittel, groß!',
  'Jetzt mit Kolben!', 'Schieben und ziehen!', 'Klebrig!', 'Eine Zehntelsekunde bitte!',
  'Sichtweite 16!', 'So weit das Auge reicht!',
  'Zeig, was du trägst!', 'Glänzt wie Gold!'
];
const STARTWORTE = ['taschenwelt','morgengrau','fichtental','kalkstein','nordwind','hohlwelt','bernstein','ackerland','moorgrund','eichenhain'];
const TYP_TEXT = {
  normal: ['Normal', 'Berge, Wälder, Flüsse, Höhlen — eine ganze Welt zum Entdecken.'],
  flach:  ['Flachland', 'Eine flache Wiese ohne Ende: Grundgestein, zwei Lagen Erde, Gras. Viel Platz zum Bauen.'],
};
const MODUS_TEXT = {
  ueberleben: ['Überleben', 'Suche Rohstoffe, stelle Werkzeuge her, pass auf Hunger und Gesundheit auf. Nachts kommen Zombies.'],
  kreativ:    ['Kreativ', 'Unbegrenzte Blöcke aus dem Katalog, fliegen mit doppeltem Sprung, keine Gefahr.'],
};

/* ── Logo ──────────────────────────────────────────────────────────────
   Das Logo ist Pixelgrafik in Originalgröße (bilder/logo.png, 363 × 64) und
   wird um ganze Faktoren vergrößert, damit jeder Pixel scharf bleibt. Bis es
   geladen ist — oder wenn es gar nicht lädt —, steht das gezeichnete aus
   Steinblöcken da. */
const LOGO = new Image();
LOGO.src = 'bilder/logo.png';
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
  P:['####.','#...#','#...#','####.','#....','#....','#....'],
  O:['.###.','#...#','#...#','#...#','#...#','#...#','.###.'],
  K:['#...#','#..#.','#.#..','##...','#.#..','#..#.','#...#'],
  R:['####.','#...#','#...#','####.','#.#..','#..#.','#...#'],
  F:['#####','#....','#....','####.','#....','#....','#....'],
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
  welten: [], gewaehlt: null, neuModus: 'ueberleben', neuTyp: 'normal', bearbeiteId: null, loeschId: null,
  serverGewaehlt: null, serverStatus: {}, formModus: null, formIndex: -1,
  _letzterTipp: { id: null, t: 0 },

  init(){
    document.documentElement.style.setProperty('--steinbild', 'url(' + iconURL('stone') + ')');
    document.documentElement.style.setProperty('--erdbild', 'url(' + iconURL('dirt') + ')');
    $('#tVersion').textContent = VERSION;
    const knopf = (id, fn) => $(id).addEventListener('click', e => { Sfx.play('klick'); fn(e); });
    knopf('#tEinzel', () => this.zuWelten());
    knopf('#tOptionen', () => this.zeige('optionen'));
    knopf('#tMehr', () => this.zuMitspieler());
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
    knopf('#nTyp', () => { this.neuTyp = this.neuTyp === 'flach' ? 'normal' : 'flach'; this.modusZeigen(); });
    knopf('#nLos', () => this.erstellen());
    knopf('#nAbbruch', () => this.zuWelten());
    knopf('#bSichern', () => this.umbenennen());
    knopf('#bExport', () => this.exportieren());
    knopf('#bAbbruch', () => this.zuWelten());
    knopf('#lJa', () => this.loeschen());
    knopf('#lNein', () => this.zuWelten());
    knopf('#oFertig', () => this.optionenZu());
    knopf('#oSprung', () => { Game.settings.autojump = !Game.settings.autojump; Game.saveOpts(); this.optionenZeigen(); });
    $('#oGer').addEventListener('input', e => { Game.settings.geraeusche = +e.target.value; Sfx.lautSetzen(Game.settings.geraeusche/100); Game.saveOpts(); this.optionenZeigen(); });
    $('#oGer').addEventListener('change', () => Sfx.play('pickup'));      // hören, wie laut es jetzt ist
    $('#oMusik').addEventListener('input', e => { Game.settings.musik = +e.target.value; Musik.lautSetzen(Game.settings.musik/100); Game.saveOpts(); this.optionenZeigen(); });
    knopf('#oMitw', () => this.zuMitwirkende());
    knopf('#mwFertig', () => this.zeige('optionen'));
    knopf('#oDebug', () => { Game.settings.debug = !Game.settings.debug; $('#dbg').classList.toggle('on', Game.settings.debug); Game.saveOpts(); this.optionenZeigen(); });
    $('#oRd').addEventListener('input', e => { Game.settings.rd = +e.target.value; Game.saveOpts(); this.optionenZeigen(); });
    $('#oSens').addEventListener('input', e => { Game.settings.sens = +e.target.value; Game.saveOpts(); this.optionenZeigen(); });
    // Pause und Tod im selben Stil
    // Mitspieler
    knopf('#msBeitreten', () => this.serverBeitreten());
    knopf('#msDirekt', () => { this.nameSichern(); this.serverForm('direkt', -1); });
    knopf('#msNeu', () => { this.nameSichern(); this.serverForm('neu', -1); });
    knopf('#msBearb', () => { const i = Netz.serverListe().findIndex(q => q.code === this.serverGewaehlt); if(i >= 0){ this.nameSichern(); this.serverForm('bearbeiten', i); } });
    knopf('#msLoeschen', () => this.serverLoeschen());
    knopf('#msAuffrischen', () => this.serverAuffrischen());
    knopf('#msZurueck', () => { this.nameSichern(); this.zeige('titel'); });
    knopf('#msFarbe', () => { Netz.ich.farbe = (Netz.ich.farbe + 1) % SPIELER_FARBEN.length; Netz.ichSichern(); this.farbeZeigen(); });
    $('#msName').addEventListener('change', () => this.nameSichern());
    knopf('#sfOk', () => this.serverFormOk());
    knopf('#sfAbbruch', () => this.zuMitspieler());
    for(const id of ['#sfName', '#sfCode']) $(id).addEventListener('keydown', e => { if(e.key === 'Enter') this.serverFormOk(); });
    knopf('#vbZurueck', () => this.vbZurueck());
    knopf('#pOeffnen', () => this.zuOeffnen());
    knopf('#oeLos', () => this.oeffnenUmschalten());
    knopf('#oeAuto', () => this.oeffnenAuto());
    knopf('#oeKopie', () => this.codeKopieren());
    knopf('#oeTeilen', () => this.codeTeilen());
    knopf('#oeZurueck', () => this.optionenZu());
    $('#oeName').addEventListener('change', () => {
      const n = ($('#oeName').value || '').replace(/\s+/g, ' ').trim().slice(0, 16);
      if(n){ Netz.ich.name = n; Netz.ichSichern(); }
    });
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
    Musik.zumTitel();
    this.bereit = Speicher.init().then(() => this.listeLaden());
  },

  zeige(name){
    for(const id of ['titel','welten','neu','bearbeiten','loeschen','optionen','mitspieler','serverForm','verbinden','oeffnen','mitwirkende'])
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
    const z = { welten:'titel', neu:'welten', bearbeiten:'welten', loeschen:'welten', optionen: null, serverForm:'mitspieler', mitwirkende:'optionen' };
    if(this.aktiv === 'optionen' || this.aktiv === 'oeffnen'){ this.optionenZu(); return; }
    if(this.aktiv === 'verbinden'){ this.vbZurueck(); return; }
    if(this.aktiv === 'mitspieler'){ this.nameSichern(); this.zeige('titel'); return; }
    if(this.aktiv && z[this.aktiv]) this.zeige(z[this.aktiv]);
  },
  spruch(){
    const s = $('#spruch');
    s.textContent = SPRUECHE[(Math.random()*SPRUECHE.length)|0];
    // lange Sprüche etwas kleiner, wie beim Vorbild
    s.style.setProperty('--gross', Math.max(.62, Math.min(1, 16/s.textContent.length)).toFixed(2));
  },
  logo(){
    const w = Math.min(window.innerWidth*0.9, 760, window.innerHeight*1.25), cv = $('#logo');
    if(!(LOGO.complete && LOGO.naturalWidth)){
      logoZeichnen(cv, 'POCKETCRAFT', w);
      if(!LOGO._warte){ LOGO._warte = true; LOGO.addEventListener('load', () => { if(this.aktiv === 'titel') this.logo(); }); }
      return;
    }
    const dpr = Math.min(window.devicePixelRatio || 1, 3), lw = LOGO.naturalWidth, lh = LOGO.naturalHeight;
    let k = Math.max(1, Math.round(w*dpr/lw));
    while(k > 1 && lw*k/dpr > window.innerWidth - 12) k--;
    cv.width = lw*k; cv.height = lh*k;
    cv.style.width = (cv.width/dpr) + 'px'; cv.style.height = (cv.height/dpr) + 'px';
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.clearRect(0, 0, cv.width, cv.height);
    c.drawImage(LOGO, 0, 0, cv.width, cv.height);
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
      i.textContent = MODUS_TEXT[w.modus || 'ueberleben'][0] + ' · ' + (w.typ === 'flach' ? 'Flachland' : 'Startwert „' + w.seed + '“') +
        ' · Tag ' + (w.tag || 1) + ' · ' + groesse(w.groesse);
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
    this.neuModus = 'ueberleben'; this.neuTyp = 'normal';
    this.modusZeigen();
    this.zeige('neu');
  },
  modusZeigen(){
    const [n, t] = MODUS_TEXT[this.neuModus];
    $('#nModus').textContent = 'Spielmodus: ' + n;
    $('#nModusText').textContent = t;
    const [tn, tt] = TYP_TEXT[this.neuTyp || 'normal'];
    $('#nTyp').textContent = 'Welttyp: ' + tn;
    $('#nTypText').textContent = tt;
  },
  async erstellen(){
    await this.bereit;
    const name = ($('#nName').value || '').trim() || 'Neue Welt';
    let seed = ($('#nSeed').value || '').trim();
    if(!seed) seed = STARTWORTE[(Math.random()*STARTWORTE.length)|0] + '-' + ((Math.random()*9000 + 1000)|0);
    const meta = { id: neueWeltId(), name, seed, modus: this.neuModus, gen: WELT_FASSUNG, erstellt: Date.now(), gespielt: Date.now(), tag: 1, groesse: 0, bild: null };
    if(this.neuTyp === 'flach') meta.typ = 'flach';
    Sfx.init();
    this.alleZu();
    Game.start(meta, null);
    this.gewaehlt = meta.id;
    hint(this.neuModus === 'kreativ' ? 'Kreativmodus — flieg mit doppeltem Sprung-Tipp'
       : this.neuTyp === 'flach' ? 'Flachland: Hier wächst kein Baum — im Kreativmodus baut es sich leichter'
       : 'Schlag Holz, bau eine Werkbank, überleb die Nacht', 4200);
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
    // »Immer öffnen«: die Welt ist gleich wieder für Freunde da
    if(meta.netzAuto) Netz.oeffnen().then(ok => { if(ok) hint('Für Freunde geöffnet · Code ' + netzCodeZeigen(Netz.code), 3200); });
  },
  async speichernUndTitel(){
    if(Netz.istGast){
      Netz.verlassen();
      Game.zumTitel();
      this.zuMitspieler();
      return;
    }
    $('#toMenu').disabled = true;
    if(Netz.istHost) Netz.schliessen('Der Host hat die Welt verlassen.');
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
    const datei = JSON.stringify({ format:'pocketcraft-welt', version:2, meta:w, daten:text });
    const name = 'pocketcraft-' + w.name.replace(/[^\wäöüÄÖÜß-]+/g, '_') + '.json';
    // Der WebView der Android-App lädt nichts herunter — dort fragt die App, wohin
    if(window.AGGApp && window.AGGApp.dateiSichern){ window.AGGApp.dateiSichern(name, datei); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([datei], { type:'application/json' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  async einlesen(datei){
    if(!datei) return;
    try{
      const d = JSON.parse(await datei.text());
      // Sicherungen aus der Zeit vor der Umbenennung gelten weiter
      if(!d || (d.format !== 'pocketcraft-welt' && d.format !== 'taschenwelt-welt') || !d.meta || typeof d.daten !== 'string') throw new Error('Format');
      JSON.parse(d.daten);
      const namen = new Set(this.welten.map(w => w.name));
      let name = d.meta.name || 'Eingelesene Welt';
      if(namen.has(name)) name += ' (eingelesen)';
      const meta = Object.assign({}, d.meta, { id: neueWeltId(), name, gespielt: Date.now() });
      await Speicher.sichern(meta, d.daten);
      this.gewaehlt = meta.id;
      await this.listeLaden();
      hint('„' + name + '“ eingelesen', 2200);
    }catch(e){ hint('Das ist keine Pocketcraft-Sicherung', 2600); }
    $('#wDatei').value = '';
  },

  /* — Mitspieler: die Serverliste — */
  zuMitspieler(){
    $('#msName').value = Netz.ich.name;
    this.farbeZeigen();
    this.zeige('mitspieler');
    this.serverZeichnen();
    this.serverAuffrischen();
  },
  nameSichern(){
    const n = ($('#msName').value || '').replace(/\s+/g, ' ').trim().slice(0, 16);
    if(n && n !== Netz.ich.name){ Netz.ich.name = n; Netz.ichSichern(); }
  },
  farbeZeigen(){
    const f = SPIELER_FARBEN[Netz.ich.farbe];
    $('#msFarbe span').textContent = f.name;
    const k = f.rgb.map(v => Math.round(Math.min(1, v*0.8)*255));
    $('#msFarbe i').style.background = 'rgb(' + k.join(',') + ')';
  },
  serverZeichnen(){
    const box = $('#msListe'); box.innerHTML = '';
    const liste = Netz.serverListe();
    if(this.serverGewaehlt && !liste.some(q => q.code === this.serverGewaehlt)) this.serverGewaehlt = null;
    if(!this.serverGewaehlt && liste.length) this.serverGewaehlt = liste[0].code;
    for(const sv of liste){
      const e = el('div', 'welt' + (sv.code === this.serverGewaehlt ? ' gewaehlt' : ''));
      const bild = el('div', 'weltBild ohne');
      bild.style.backgroundImage = 'url(' + isoIconURL('grass_top', 'grass_side', 'grass_side') + ')';
      const los = el('button', 'weltLos'); los.setAttribute('aria-label', sv.name + ' beitreten'); los.innerHTML = '<i></i>';
      bild.appendChild(los);
      e.appendChild(bild);
      const t = el('div', 'weltText');
      const n = el('b'); n.textContent = sv.name; t.appendChild(n);
      const c = el('span'); c.textContent = 'Code ' + netzCodeZeigen(sv.code); t.appendChild(c);
      const st = el('span', 'serverStatus'), z = this.serverStatus[sv.code];
      if(!z || z.lade){ st.textContent = 'Wird gesucht …'; }
      else if(z.online){
        const i = z.info;
        st.textContent = '● Offen · „' + i.name + '“ · ' + i.spieler + '/' + i.max + ' Spieler · ' +
          (i.modus === 'kreativ' ? 'Kreativ' : 'Überleben') + ' · Tag ' + i.tag + ' · Host ' + i.host;
        st.classList.add('an');
      } else if(z.fehler){ st.textContent = z.fehler; st.classList.add('fehler'); }
      else st.textContent = '○ Gerade niemand da';
      t.appendChild(st);
      e.appendChild(t);
      e.addEventListener('click', ev => {
        const jetzt = performance.now(), L = this._letzterTipp;
        if(ev.target.closest('.weltLos') || (L.id === sv.code && jetzt - L.t < 400)){ this.serverBeitreten(sv.code); return; }
        this._letzterTipp = { id: sv.code, t: jetzt };
        this.serverGewaehlt = sv.code; Sfx.play('klick'); this.serverZeichnen();
      });
      box.appendChild(e);
    }
    if(!liste.length){
      const p = el('p', 'weltLeer');
      p.textContent = 'Noch keine Server. Wer seine Welt im Spielmenü mit „Für Freunde öffnen“ freigibt, bekommt einen Code — ' +
        'den hier mit „Server hinzufügen“ merken oder mit „Direkt verbinden“ gleich beitreten.';
      box.appendChild(p);
    }
    const hat = !!this.serverGewaehlt;
    for(const id of ['#msBeitreten', '#msBearb', '#msLoeschen']) $(id).disabled = !hat;
    $('#msAuffrischen').disabled = !liste.length;
  },
  async serverAuffrischen(){
    const liste = Netz.serverListe();
    if(!liste.length) return;
    for(const sv of liste) this.serverStatus[sv.code] = { lade: true };
    this.serverZeichnen();
    await Promise.all(liste.map(async sv => {
      const r = await Netz.ping(sv.code);
      if(r.abgeloest) return;
      this.serverStatus[sv.code] = r;
      if(this.aktiv === 'mitspieler') this.serverZeichnen();
    }));
  },
  serverForm(modus, idx){
    this.formModus = modus; this.formIndex = idx;
    const sv = idx >= 0 ? Netz.serverListe()[idx] : null;
    $('#sfTitel').textContent = modus === 'direkt' ? 'Direkt verbinden' : (modus === 'neu' ? 'Server hinzufügen' : 'Server bearbeiten');
    $('#sfNameZeile').style.display = modus === 'direkt' ? 'none' : '';
    $('#sfName').value = sv ? sv.name : 'Pocketcraft-Server';
    $('#sfCode').value = sv ? netzCodeZeigen(sv.code) : (modus === 'direkt' ? (this._letzterCode || '') : '');
    $('#sfOk').textContent = modus === 'direkt' ? 'Beitreten' : 'Fertig';
    $('#sfFehler').textContent = '';
    this.zeige('serverForm');
  },
  serverFormOk(){
    const code = netzCodeLesen($('#sfCode').value);
    if(!code){ $('#sfFehler').textContent = 'Ein Code hat sechs Zeichen, zum Beispiel KUH-4X7.'; return; }
    if(this.formModus === 'direkt'){ this._letzterCode = netzCodeZeigen(code); this.serverBeitreten(code); return; }
    const name = ($('#sfName').value || '').trim().slice(0, 32) || 'Pocketcraft-Server';
    const l = Netz.serverListe();
    if(this.formModus === 'bearbeiten' && l[this.formIndex]) l[this.formIndex] = { name, code };
    else { const i = l.findIndex(q => q.code === code); if(i >= 0) l[i].name = name; else l.push({ name, code }); }
    Netz.serverSichern(l);
    this.serverGewaehlt = code;
    this.zuMitspieler();
  },
  /** nach dem Beitreten: der Server kommt in die Liste, falls er fehlt */
  serverMerken(code, weltName){
    const l = Netz.serverListe();
    if(!l.some(q => q.code === code)){ l.push({ name: weltName || 'Pocketcraft-Server', code }); Netz.serverSichern(l); }
    this.serverGewaehlt = code;
  },
  serverLoeschen(){
    const l = Netz.serverListe().filter(q => q.code !== this.serverGewaehlt);
    Netz.serverSichern(l);
    this.serverGewaehlt = null;
    this.serverZeichnen();
  },
  serverBeitreten(code){
    code = code || this.serverGewaehlt; if(!code) return;
    this.nameSichern();
    Sfx.init();
    Netz.beitreten(code);
  },
  /* — Verbinden — */
  verbindenZeigen(titel, text){
    $('#vbTitel').textContent = titel;
    const t = $('#vbText'); t.textContent = text || ''; t.classList.remove('fehler');
    $('#vbZurueck').textContent = 'Abbrechen';
    this.zeige('verbinden');
  },
  verbindenFehler(text){
    $('#vbTitel').textContent = 'Beitreten ging nicht';
    const t = $('#vbText'); t.textContent = text; t.classList.add('fehler');
    $('#vbZurueck').textContent = 'Zurück zur Serverliste';
    this.zeige('verbinden');
  },
  /** mitten im Spiel: Host weg, Leitung tot */
  verbindungWeg(grund){
    if(Game.running) Game.zumTitel();
    $('#vbTitel').textContent = 'Verbindung getrennt';
    const t = $('#vbText'); t.textContent = grund; t.classList.add('fehler');
    $('#vbZurueck').textContent = 'Zurück zur Serverliste';
    this.zeige('verbinden');
  },
  vbZurueck(){
    if(Netz.rolle === 'verbinde') Netz.trennen();
    this.zuMitspieler();
  },

  /* — Für Freunde öffnen (aus dem Spielmenü) — */
  zuOeffnen(){
    const m = Game.meta; if(!m || m.gast) return;
    if(!m.netzCode){ m.netzCode = netzCodeNeu(); Speicher.steckbriefSichern(m).catch(() => {}); }
    this.vonPause = true;
    $('#oeName').value = Netz.ich.name;
    this.zeige('oeffnen');
    this.oeffnenZeigen();
  },
  oeffnenZeigen(){
    const m = Game.meta; if(!m) return;
    const offen = Netz.istHost, code = offen ? Netz.code : m.netzCode;
    $('#oeCode').textContent = code ? netzCodeZeigen(code) : '———';
    $('#oeCode').classList.toggle('blass', !offen);
    $('#oeLos').textContent = offen ? 'Welt schließen' : 'Welt öffnen';
    $('#oeAuto').textContent = 'Immer öffnen, wenn ich sie spiele: ' + (m.netzAuto ? 'An' : 'Aus');
    $('#oeTeilen').style.display = navigator.share ? '' : 'none';
    $('#oeKopie').parentElement.style.gridTemplateColumns = navigator.share ? '' : '1fr';
    let st;
    if(!offen) st = 'Noch zu. Offen ist die Welt, solange du in ihr bist — Freunde geben dann auf dem Titelbild unter „Mitspieler“ diesen Code ein.';
    else if(Netz.status === 'offen'){
      const n = [...Netz.andere.values()].map(q => q.name);
      st = n.length ? 'Offen · mit dir spielen: ' + n.join(', ') : 'Offen! Freunde tippen auf dem Titelbild auf „Mitspieler“ und geben diesen Code ein.';
    } else st = Netz.status;
    const e = $('#oeStatus'); e.textContent = st; e.classList.toggle('fehler', !!Netz.statusFehler);
  },
  async oeffnenUmschalten(){
    if(Netz.istHost) Netz.schliessen('Der Host hat die Welt geschlossen.');
    else await Netz.oeffnen();
    this.oeffnenZeigen();
  },
  oeffnenAuto(){
    const m = Game.meta; if(!m) return;
    m.netzAuto = !m.netzAuto;
    Speicher.steckbriefSichern(m).catch(() => {});
    this.oeffnenZeigen();
  },
  codeKopieren(){
    const c = netzCodeZeigen(Netz.code || (Game.meta && Game.meta.netzCode));
    if(!c) return;
    const gut = () => hint('Code kopiert: ' + c, 1800), schlecht = () => hint('Der Code: ' + c, 3000);
    try{ navigator.clipboard.writeText(c).then(gut, schlecht); }catch(e){ schlecht(); }
  },
  codeTeilen(){
    const c = netzCodeZeigen(Netz.code || (Game.meta && Game.meta.netzCode));
    if(!c || !navigator.share) return;
    navigator.share({ title: 'Pocketcraft', text: 'Spiel mit mir Pocketcraft! Titelbild → Mitspieler → Direkt verbinden → Code ' + c }).catch(() => {});
  },
  /** Spielmenü: je nach Rolle andere Knöpfe */
  pauseAnzeigen(){
    const gast = Netz.istGast;
    $('#pOeffnen').style.display = gast ? 'none' : '';
    $('#pOeffnen').textContent = Netz.istHost ? 'Geöffnet · Code ' + netzCodeZeigen(Netz.code) + ' …' : 'Für Freunde öffnen …';
    $('#toMenu').textContent = gast ? 'Verbindung trennen' : 'Speichern und zum Titelbild';
    const n = [...Netz.andere.values()].map(q => q.name);
    const info = $('#pNetz');
    info.textContent = n.length ? 'Mit dir spielen: ' + n.join(', ') : (Netz.istHost ? 'Offen · noch niemand da' : '');
    info.style.display = info.textContent ? '' : 'none';
  },
  netzAnzeigen(){
    if(Screens.open === 'pause') this.pauseAnzeigen();
    if(this.aktiv === 'oeffnen') this.oeffnenZeigen();
  },

  /* — Optionen — */
  optionenZeigen(){
    const s = Game.settings;
    // ab 13 Chunks wird es für schwächere Handys eng: das sagen wir dazu
    $('#oRd').value = s.rd; $('#oRdText').textContent = 'Sichtweite: ' + s.rd + ' Chunks' + (s.rd > 12 ? ' · braucht ein schnelles Gerät' : '');
    $('#oSens').value = s.sens; $('#oSensText').textContent = 'Blick-Tempo: ' + Math.round(s.sens/12*100) + ' %';
    $('#oSprung').textContent = 'Auto-Sprung: ' + (s.autojump ? 'An' : 'Aus');
    const pz = v => v > 0 ? v + ' %' : 'Aus';
    $('#oGer').value = s.geraeusche; $('#oGerText').textContent = 'Geräusche: ' + pz(s.geraeusche);
    $('#oMusik').value = s.musik;
    $('#oMusikText').textContent = 'Musik: ' + pz(s.musik) + (Musik.liste && !Musik.hat() ? ' · noch keine Titel' : '');
    $('#oDebug').textContent = 'Debug-Anzeige: ' + (s.debug ? 'An' : 'Aus');
  },
  /* — Mitwirkende — */
  zuMitwirkende(){
    this.zeige('mitwirkende');
    $('.mitw').scrollTop = 0;
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
