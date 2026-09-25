/* Pocketcraft · Chat
   Wie beim Vorbild: T öffnet den Chat, / öffnet ihn gleich mit einem
   Schrägstrich für Befehle, auf dem Handy der Knopf CHAT. Neue Zeilen stehen
   zehn Sekunden da und verblassen dann; bei offenem Chat ist der ganze
   Verlauf zu sehen. Die Pfeiltasten holen zurück, was man zuletzt
   geschrieben hat, Tab ergänzt Befehle (Vorschläge auch zum Antippen).

   Mit Mitspielern geht jede Nachricht zum Host, und der schickt sie an alle
   — so sehen alle dieselbe Reihenfolge. Befehle rechnet auch der Host
   (siehe befehle.js). Geschrieben wird nur mit textContent, nie als HTML. */
'use strict';

const CHAT_MAX = 256;               // Zeichen je Nachricht, wie beim Vorbild
const CHAT_VERLAUF = 100;           // so viele Zeilen merkt sich der Chat
const CHAT_STEHT = 10;              // Sekunden, die eine neue Zeile zu sehen ist
const CHAT_ZEILEN = 10;             // so viele stehen höchstens da, solange der Chat zu ist

/** Todesursachen in der dritten Person, für die Nachricht an alle */
const TOD_TEXT = {
  'Du bist verhungert': '{n} ist verhungert',
  'Du bist aus der Welt gefallen': '{n} ist aus der Welt gefallen',
  'Ein Skelett hat dich getroffen': '{n} wurde von einem Skelett erschossen',
  'Ein Zombie hat dich erwischt': '{n} wurde von einem Zombie erwischt',
  'Du bist zu tief gefallen': '{n} ist zu tief gefallen',
  'Ein Kaktus war stärker': '{n} wurde von einem Kaktus zu Tode gestochen',
  'Du bist ertrunken': '{n} ist ertrunken',
  'Durch einen Befehl getötet': '{n} wurde getötet',
};

/** Farbe eines Spielers als CSS-Farbe (die Farben sind für das Licht der Welt etwas überhöht) */
function spielerFarbe(f){
  const c = (SPIELER_FARBEN[f | 0] || SPIELER_FARBEN[0]).rgb;
  return 'rgb(' + c.map(v => Math.min(255, Math.round(v*215))).join(',') + ')';
}

const Chat = {
  offen: false,
  zeilen: [],                       // { el, t } — t: seit wann sie da ist (performance.now)
  gesendet: [],                     // eigene Eingaben, für die Pfeiltasten
  _blaettern: -1, _entwurf: '',
  _vorschlaege: [], _vorschlagNr: -1,
  _sichtbar: null,

  init(){
    this.el = $('#chat'); this.liste = $('#chatVerlauf'); this.eingabe = $('#chatEingabe'); this.vorschlagEl = $('#chatVorschlag');
    this.eingabe.maxLength = CHAT_MAX;
    $('#chatForm').addEventListener('submit', e => { e.preventDefault(); this.abschicken(); });
    $('#chatZu').addEventListener('click', () => this.schliessen());
    // Tasten im Eingabefeld gehören dem Chat, nicht der Welt (Escape darf nicht die Pause öffnen)
    const taste = e => { e.stopPropagation(); if(e.type === 'keydown') this.taste(e); };
    this.eingabe.addEventListener('keydown', taste);
    this.eingabe.addEventListener('keyup', e => e.stopPropagation());
    this.eingabe.addEventListener('input', () => { this._vorschlagNr = -1; this.vorschlaegeZeigen(); });
    this.vorschlagEl.addEventListener('pointerdown', e => {
      const b = e.target.closest('button'); if(!b) return;
      e.preventDefault();                 // das Feld behält den Fokus, die Tastatur bleibt offen
      this.ergaenzen(b.dataset.wert);
    });
    $('#btnChat').addEventListener('pointerdown', e => { e.preventDefault(); if(this.offen) this.schliessen(); else this.oeffnen(''); });
  },

  /* — Öffnen, Schließen, Absenden — */
  oeffnen(vorgabe){
    if(this.offen || !Game.running || Screens.open || Menue.aktiv) return;
    this.offen = true;
    Screens.mausFrei();
    Input.loslassen();
    this.el.classList.add('offen');
    this.eingabe.value = vorgabe || '';
    this._blaettern = -1; this._vorschlagNr = -1;
    this.sichtbarkeit(true);
    this.eingabe.focus();
    this.vorschlaegeZeigen();
    this.liste.scrollTop = this.liste.scrollHeight;
  },
  schliessen(){
    if(!this.offen) return;
    this.offen = false;
    this.el.classList.remove('offen');
    this.eingabe.blur();
    this.vorschlagEl.textContent = '';
    this.tick();
  },
  abschicken(){
    const text = this.eingabe.value.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
    this.schliessen();
    if(!text) return;
    if(this.gesendet[this.gesendet.length - 1] !== text) this.gesendet.push(text);
    if(this.gesendet.length > 50) this.gesendet.shift();
    if(text.startsWith('/')) Befehle.eingeben(text);
    else this.sagen(text);
  },
  taste(e){
    const k = e.key;
    if(k === 'Escape'){ e.preventDefault(); this.schliessen(); return; }
    if(k === 'Tab'){ e.preventDefault(); this.tab(e.shiftKey); return; }
    if(k === 'ArrowUp' || k === 'ArrowDown'){
      // zurückblättern durch das, was man selbst geschrieben hat
      if(!this.gesendet.length) return;
      e.preventDefault();
      if(this._blaettern < 0){ this._entwurf = this.eingabe.value; this._blaettern = this.gesendet.length; }
      this._blaettern = clamp(this._blaettern + (k === 'ArrowUp' ? -1 : 1), 0, this.gesendet.length);
      this.eingabe.value = this._blaettern === this.gesendet.length ? this._entwurf : this.gesendet[this._blaettern];
      this.vorschlaegeZeigen();
    }
  },

  /* — Nachrichten — */
  /** eine eigene Nachricht an alle */
  sagen(text){
    if(Netz.istGast){ Netz.senden(Netz.hostConn, { t:'chat', text }); return; }
    this.verteilen({ n: Netz.ich.name, f: Netz.ich.farbe, text });
  },
  /** Host (oder allein): eine Zeile bei allen zeigen, bei sich auch */
  verteilen(m){
    this.zeigen(m);
    if(Netz.istHost && Netz.hatGaeste()) Netz.anAlle(Object.assign({ t:'chat' }, m));
  },
  /** gelb, für alle: beigetreten, gestorben, … */
  system(text){ this.verteilen({ art:'system', text }); },
  /** nur hier: Antworten auf Befehle */
  info(text){ this.zeigen({ art:'info', text }); },
  fehler(text){ this.zeigen({ art:'fehler', text }); },
  /** wer gestorben ist, sagt es allen — als Gast über den Host */
  tod(grund){
    if(Netz.istGast){ Netz.senden(Netz.hostConn, { t:'tod', grund }); return; }
    this.todMelden(Netz.ich.name, grund);
  },
  todMelden(name, grund){
    const g = String(grund || '');
    this.system((TOD_TEXT[g] || '{n} ist gestorben').replace('{n}', name));
  },

  /** eine Zeile anhängen: { n, f, text } von Spielern, sonst { art, text } */
  zeigen(m){
    if(!m || m.text === undefined || !this.liste) return;
    const el = document.createElement('div');
    const art = ['system', 'info', 'fehler', 'privat', 'me'].includes(m.art) ? m.art : '';
    el.className = 'chatZeile' + (art ? ' ' + art : '');
    const text = String(m.text).slice(0, CHAT_MAX*2);
    if(!art && m.n !== undefined){
      const n = document.createElement('span');
      n.className = 'chatName';
      n.style.color = spielerFarbe(m.f);
      n.textContent = String(m.n).slice(0, 24);
      el.append('<', n, '> ' + text);
    } else el.textContent = text;
    this.liste.appendChild(el);
    this.zeilen.push({ el, t: performance.now() });
    while(this.zeilen.length > CHAT_VERLAUF) this.zeilen.shift().el.remove();
    if(this.offen){
      // wer gerade weiter oben liest, wird nicht nach unten gerissen
      const unten = this.liste.scrollHeight - this.liste.scrollTop - this.liste.clientHeight < 40;
      if(unten) this.liste.scrollTop = this.liste.scrollHeight;
    }
    this.tick();
  },
  leeren(){
    this.schliessen();
    for(const z of this.zeilen) z.el.remove();
    this.zeilen = [];
  },

  /** jeden Frame: sichtbar nur im Spiel, und neue Zeilen verblassen */
  tick(){
    if(!this.el) return;
    this.sichtbarkeit(Game.running && !Screens.open && !Menue.aktiv);
    if(this.offen) return;
    const jetzt = performance.now(), n = this.zeilen.length;
    for(let i = 0; i < n; i++){
      const z = this.zeilen[i], alter = (jetzt - z.t)/1000;
      const sicht = i >= n - CHAT_ZEILEN && alter < CHAT_STEHT;
      if(!sicht){ if(!z.alt){ z.alt = true; z.el.classList.add('alt'); } continue; }
      if(z.alt){ z.alt = false; z.el.classList.remove('alt'); }
      const o = alter > CHAT_STEHT - 1 ? Math.max(0, CHAT_STEHT - alter).toFixed(2) : '';
      if(z.o !== o){ z.o = o; z.el.style.opacity = o; }
    }
  },
  sichtbarkeit(an){
    if(this._sichtbar === an) return;
    this._sichtbar = an;
    this.el.classList.toggle('sichtbar', an);
    if(!an && this.offen) this.schliessen();
  },

  /* — Vorschläge und Tab — */
  vorschlaegeZeigen(){
    const v = this.offen ? Befehle.vorschlaege(this.eingabe.value) : null;
    this._vorschlaege = v ? v.liste : [];
    const box = this.vorschlagEl;
    box.textContent = '';
    if(!v) return;
    if(v.hilfe){ const h = document.createElement('div'); h.className = 'chatHilfe'; h.textContent = v.hilfe; box.appendChild(h); }
    if(v.liste.length){
      const reihe = document.createElement('div'); reihe.className = 'chatWahl';
      v.liste.slice(0, 12).forEach((w, i) => {
        const b = document.createElement('button');
        b.type = 'button'; b.tabIndex = -1; b.dataset.wert = w; b.textContent = w;
        if(i === this._vorschlagNr) b.className = 'an';
        reihe.appendChild(b);
      });
      box.appendChild(reihe);
    }
  },
  /** Tab: den ersten Vorschlag nehmen, weiteres Tab geht die Liste durch */
  tab(zurueck){
    if(!this._vorschlaege.length) return;
    const n = Math.min(12, this._vorschlaege.length);
    this._vorschlagNr = (this._vorschlagNr + (zurueck ? n - 1 : 1) + (this._vorschlagNr < 0 && zurueck ? 1 : 0)) % n;
    const liste = this._vorschlaege, nr = this._vorschlagNr;
    this.ergaenzen(liste[nr], true);
    this._vorschlaege = liste; this._vorschlagNr = nr;
    for(const [i, b] of [...this.vorschlagEl.querySelectorAll('.chatWahl button')].entries()) b.classList.toggle('an', i === nr);
  },
  /** das Wort, an dem man gerade schreibt, durch w ersetzen */
  ergaenzen(w, bleiben){
    const v = this.eingabe.value, i = v.lastIndexOf(' ');
    this.eingabe.value = (i < 0 ? '/' : v.slice(0, i + 1)) + w + (bleiben ? '' : ' ');
    if(!bleiben){ this._vorschlagNr = -1; this.vorschlaegeZeigen(); }
    this.eingabe.focus();
  },
};
