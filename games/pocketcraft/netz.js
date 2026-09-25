/* Pocketcraft · Mitspieler
   Eine Welt für Freunde öffnen und bei Freunden mitspielen — ohne eigenen
   Server. Der Host ist ein Spieler: Seine Welt gilt, er rechnet Tiere,
   Monster, Öfen und Felder und verteilt jede Blockänderung. Die Geräte
   reden direkt miteinander (WebRTC), nur zum Kennenlernen braucht es einen
   Vermittler (PeerJS). Der Code einer Welt bleibt immer gleich, so lässt
   sie sich wie ein Server in der Liste merken: Sobald der Host sie spielt
   und geöffnet hat, kann man beitreten.

   Nachrichten sind JSON-Texte mit einem Feld t. Große (die Welt beim
   Beitreten) gehen in Stücken, weil ein Datenkanal nicht beliebig lange
   Nachrichten am Stück annimmt. */
'use strict';

const NETZ_VERSION = 11;                 // 2: Hühner, fließendes Wasser · 3: Plattenspieler · 4: neues Gelände, Wetter · 5: Chat, Befehle · 6: Flachland · 7: Redstone · 8: Schleime · 9: Verstärker, Kolben · 10: Rüstung sichtbar · 11: alle schlafen
const NETZ_MAX = 8;                       // Spieler insgesamt, Host eingerechnet
const NETZ_PRAEFIX = 'pocketcraft-';
const NETZ_ZEICHEN = 'ACDEFHJKLMNPRTUVWXY34679';   // ohne 0/O, 1/I, 2/Z, 5/S, 8/B …
const NETZ_TEIL = 30000;
const NETZ_STILLE = 25000;                // so lange ohne Nachricht gilt die Leitung als tot
const SERVER_KEY = 'pocketcraft.server.v1';
const ICH_KEY = 'pocketcraft.ich.v1';
const WESEN_ARTEN = Object.keys(MOBS);
const SPIELER_FARBEN = [
  { name:'Rot',    rgb:[1.05, 0.36, 0.32] },
  { name:'Blau',   rgb:[0.38, 0.58, 1.08] },
  { name:'Grün',   rgb:[0.46, 0.94, 0.4] },
  { name:'Gelb',   rgb:[1.1, 0.92, 0.32] },
  { name:'Lila',   rgb:[0.76, 0.44, 1.08] },
  { name:'Orange', rgb:[1.1, 0.62, 0.26] },
  { name:'Türkis', rgb:[0.32, 0.96, 0.94] },
  { name:'Rosa',   rgb:[1.1, 0.58, 0.84] },
];

function netzCodeNeu(){
  const a = new Uint32Array(6); crypto.getRandomValues(a);
  let s = ''; for(const v of a) s += NETZ_ZEICHEN[v % NETZ_ZEICHEN.length];
  return s;
}
const netzCodeZeigen = c => c ? c.slice(0, 3) + '-' + c.slice(3) : '';
/** was jemand eintippt: Kleinbuchstaben, Bindestrich, Leerzeichen sind egal */
function netzCodeLesen(t){
  const s = String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.length === 6 ? s : null;
}
const r2 = v => Math.round(v*100)/100;
const stapelKurz = s => s ? [s.id, s.n, s.dur | 0] : null;
const stapelLang = a => a ? { id:a[0], n:a[1], dur:a[2] | 0 } : null;
/** kürzester Weg von Winkel a nach b, Anteil k */
function winkelNach(a, b, k){
  const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d*k;
}

const Netz = {
  rolle: null,              // null · 'host' · 'verbinde' · 'gast'
  istHost: false, istGast: false,
  peer: null, code: null,
  status: '', statusFehler: false,
  gaeste: new Map(),        // Host: Verbindungs-ID → Gast
  hostConn: null,           // Gast: die Leitung zum Host
  andere: new Map(),        // Spieler-ID → Figur fürs Bild
  ausgang: [],              // Blockänderungen, flach: x, y, z, id, …
  eingehend: false,         // gerade wird etwas aus dem Netz eingespielt
  ich: null,
  _t: { pos:0, wesen:0, ofen:0, zeit:0, stand:0, umgebung:0, aufraeumen:0 },
  _teile: new Map(), _teilNr: 0, _pings: new Map(), _behSig: {}, _ofenSig: {},
  _gastPeer: null, _gastPeerWarte: null, _hostZuletzt: 0, _letzt: null,

  init(){
    this.ich = this.ichLaden();
    // Seite wird geschlossen: sauber abmelden, damit der Code beim
    // Vermittler gleich wieder frei ist und die Gäste Bescheid wissen
    window.addEventListener('pagehide', e => {
      if(e.persisted) return;
      if(this.istHost) this.schliessen('Der Host hat das Spiel geschlossen.');
      else if(this.istGast) this.verlassen();
      if(this._gastPeer) try{ this._gastPeer.destroy(); }catch(x){}
    });
  },

  /* ── Wer bin ich ─────────────────────────────────────────────────── */
  ichLaden(){
    try{
      const d = JSON.parse(localStorage.getItem(ICH_KEY));
      if(d && d.id) return { id: String(d.id), name: String(d.name || 'Spieler').slice(0, 16), farbe: (d.farbe | 0) % SPIELER_FARBEN.length };
    }catch(e){}
    const d = { id: 'sp-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
                name: 'Spieler ' + (100 + ((Math.random()*900) | 0)), farbe: (Math.random()*SPIELER_FARBEN.length) | 0 };
    this.ichSichern(d);
    return d;
  },
  ichSichern(d){ try{ localStorage.setItem(ICH_KEY, JSON.stringify(d || this.ich)); }catch(e){} },

  /* ── Die gemerkten Server ────────────────────────────────────────── */
  serverListe(){
    try{ const l = JSON.parse(localStorage.getItem(SERVER_KEY)); if(Array.isArray(l)) return l.filter(s => s && netzCodeLesen(s.code)); }catch(e){}
    return [];
  },
  serverSichern(l){ try{ localStorage.setItem(SERVER_KEY, JSON.stringify(l)); }catch(e){} },

  /* ── PeerJS erst laden, wenn es gebraucht wird ───────────────────── */
  laden(){
    if(window.Peer) return Promise.resolve();
    if(this._laedt) return this._laedt;
    this._laedt = new Promise((ok, fehler) => {
      const s = document.createElement('script');
      s.src = 'netz/peerjs.min.js';
      s.onload = () => window.Peer ? ok() : fehler(new Error('laden'));
      s.onerror = () => { this._laedt = null; s.remove(); fehler(new Error('laden')); };
      document.head.appendChild(s);
    });
    return this._laedt;
  },
  /** Standard: der öffentliche Vermittler von PeerJS samt seinen TURN-Servern.
      Für Tests lässt sich ein eigener einstellen (window.POCKETCRAFT_NETZ). */
  optionen(){
    const o = { debug: 0 };
    if(window.POCKETCRAFT_NETZ) Object.assign(o, window.POCKETCRAFT_NETZ);
    return o;
  },
  fehlerText(e){
    const t = e && e.type;
    if(t === 'browser-incompatible') return 'Dieser Browser kann keine direkten Verbindungen (WebRTC).';
    if(t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed')
      return 'Der Vermittler ist nicht erreichbar. Bist du mit dem Internet verbunden?';
    if(t === 'webrtc') return 'Die direkte Verbindung ist gescheitert. Manche Netze (Schule, Firma) sperren das.';
    return 'Etwas ist schiefgegangen' + (t ? ' (' + t + ')' : '') + '.';
  },
  statusSetzen(text, fehler){
    this.status = text; this.statusFehler = !!fehler;
    if(typeof Menue !== 'undefined' && Menue.netzAnzeigen) Menue.netzAnzeigen();
  },

  /* ── Senden und Empfangen ────────────────────────────────────────── */
  senden(conn, obj){
    if(!conn || !conn.open) return;
    const s = JSON.stringify(obj);
    try{
      if(s.length <= NETZ_TEIL){ conn.send(s); return; }
      const id = ++this._teilNr, n = Math.ceil(s.length/NETZ_TEIL);
      for(let i = 0; i < n; i++) conn.send('#' + id + ':' + i + ':' + n + ':' + s.slice(i*NETZ_TEIL, (i + 1)*NETZ_TEIL));
    }catch(e){}
  },
  lesen(quelle, roh){
    if(typeof roh !== 'string') return null;
    if(roh[0] !== '#'){ try{ return JSON.parse(roh); }catch(e){ return null; } }
    const a = roh.indexOf(':'), b = roh.indexOf(':', a + 1), c = roh.indexOf(':', b + 1);
    if(a < 0 || b < 0 || c < 0) return null;
    const k = quelle + '|' + roh.slice(1, a), i = +roh.slice(a + 1, b), n = +roh.slice(b + 1, c);
    let t = this._teile.get(k);
    if(!t){ t = { n, da: 0, s: new Array(n) }; this._teile.set(k, t); }
    if(t.s[i] === undefined){ t.s[i] = roh.slice(c + 1); t.da++; }
    if(t.da < t.n) return null;
    this._teile.delete(k);
    try{ return JSON.parse(t.s.join('')); }catch(e){ return null; }
  },
  bereiteGaeste(){ const l = []; for(const g of this.gaeste.values()) if(g.bereit) l.push(g); return l; },
  hatGaeste(){ for(const g of this.gaeste.values()) if(g.bereit) return true; return false; },
  /** an alle Gäste, auf Wunsch ohne einen */
  anAlle(obj, ausser){
    let s = null;
    for(const g of this.gaeste.values()){
      if(!g.bereit || g === ausser) continue;
      if(s === null) s = obj;
      this.senden(g.conn, s);
    }
  },

  /* ═══ HOST ═══════════════════════════════════════════════════════ */
  async oeffnen(){
    if(this.istGast || !Game.running || !Game.meta || Game.meta.gast) return false;
    if(this.istHost) return true;
    const meta = Game.meta;
    if(!meta.netzCode){ meta.netzCode = netzCodeNeu(); Speicher.steckbriefSichern(meta).catch(() => {}); }
    this.code = meta.netzCode;
    this.rolle = 'host'; this.istHost = true;
    this._letzt = null;
    this.statusSetzen('Verbinde mit dem Vermittler …');
    try{ await this.laden(); }
    catch(e){ this.schliessen(); this.statusSetzen('Die Mitspieler-Technik ließ sich nicht laden. Bist du offline?', true); return false; }
    if(!this.istHost) return false;
    this.hostPeer(0);
    return true;
  },
  hostPeer(versuch){
    let P;
    try{ P = new Peer(NETZ_PRAEFIX + this.code, this.optionen()); }
    catch(e){ this.schliessen(); this.statusSetzen(this.fehlerText({ type:'browser-incompatible' }), true); return; }
    this.peer = P;
    P.on('open', () => { if(this.peer === P) this.statusSetzen('offen'); });
    P.on('connection', conn => { if(this.peer === P) this.hostVerbindung(conn); });
    P.on('disconnected', () => {
      // vom Vermittler getrennt: Die Mitspieler bleiben, nur neue kämen nicht mehr herein
      if(this.peer !== P) return;
      this.statusSetzen('Verbindung zum Vermittler unterbrochen, versuche es wieder …');
      setTimeout(() => { if(this.peer === P && !P.destroyed) try{ P.reconnect(); }catch(e){} }, 3000);
    });
    P.on('error', e => {
      if(this.peer !== P) return;
      if(e.type === 'unavailable-id'){
        // Der Code hängt meist noch vom letzten Mal am Vermittler — kurz warten
        P.destroy();
        if(versuch < 16){
          this.statusSetzen('Der Code ist noch belegt, gleich noch einmal …');
          setTimeout(() => { if(this.istHost && this.peer === P) this.hostPeer(versuch + 1); }, 4000);
        } else this.statusSetzen('Der Code ist belegt. Läuft diese Welt gerade auf einem anderen Gerät?', true);
        return;
      }
      if(e.type === 'peer-unavailable') return;
      this.statusSetzen(this.fehlerText(e), true);
    });
  },
  /** Welt schließen: alle Gäste bekommen Bescheid */
  schliessen(grund){
    for(const g of this.gaeste.values()){
      if(g.bereit){ this.senden(g.conn, { t:'zu', grund: grund || 'Der Host hat die Welt geschlossen.' }); }
      const c = g.conn; setTimeout(() => { try{ c.close(); }catch(e){} }, 400);
    }
    this.gaeste.clear();
    const P = this.peer; this.peer = null;
    if(P) setTimeout(() => { try{ P.destroy(); }catch(e){} }, 500);
    if(this.istHost){ this.rolle = null; this.istHost = false; }
    this.andereLeeren();
    this.ausgang = [];
    this.statusSetzen('');
  },
  hostVerbindung(conn){
    const g = { conn, id:null, name:'?', farbe:0, x:0, y:0, z:0, yaw:0, pitch:0, held:0, flags:0, ruest:0,
                tot:false, creative:false, bereit:false, zuletzt: performance.now() };
    conn.on('data', roh => { const m = this.lesen(conn.connectionId, roh); if(m) this.hostEmpfang(g, m); });
    conn.on('close', () => this.gastWeg(g));
    conn.on('error', () => this.gastWeg(g));
    conn.on('open', () => {
      // nur nachsehen, wer da ist (Serverliste): antworten und auflegen
      if(conn.metadata && conn.metadata.ping){ this.senden(conn, this.info()); setTimeout(() => { try{ conn.close(); }catch(e){} }, 1500); return; }
      this.gaeste.set(conn.connectionId, g);
    });
  },
  info(){
    return { t:'info', v: NETZ_VERSION, name: Game.meta ? Game.meta.name : '', host: this.ich.name,
             modus: Game.player && Game.player.creative ? 'kreativ' : 'ueberleben',
             tag: Math.floor(Game.gesamtZeit/DAY_LEN) + 1, spieler: 1 + this.bereiteGaeste().length, max: NETZ_MAX };
  },
  hostEmpfang(g, m){
    g.zuletzt = performance.now();
    if(m.t === 'hallo'){ this.hallo(g, m); return; }
    if(m.t === 'ping'){ this.senden(g.conn, this.info()); return; }
    if(!g.bereit) return;
    switch(m.t){
      case 'ich':
        g.x = +m.x || 0; g.y = +m.y || 0; g.z = +m.z || 0; g.yaw = +m.a || 0; g.pitch = +m.p || 0;
        g.flags = m.f | 0; g.held = m.h | 0; g.tot = !!(g.flags & 4); g.creative = !!m.c; g.ruest = (m.r | 0) & 0xfff;
        this.figurZiel(this.andere.get(g.id), g.x, g.y, g.z, g.yaw, g.pitch, g.flags, g.held, g.ruest);
        break;
      case 'stand': this.standMerken(g, m); break;
      case 'b': this.bloeckeEmpfangen(m.l); break;
      case 'wesen': this.wesenAnfrageHost(g, m); break;
      case 'truhe': this.truheEmpfangen(m, g); break;
      case 'ofen': this.ofenEmpfangen(m); break;
      case 'pfeil': this.pfeilEmpfangen(m, g); break;
      case 'kueken': this.kuekenHost(g, m); break;
      case 'chat': if(this.nichtZuSchnell(g)) Chat.verteilen({ n: g.name, f: g.farbe, text: String(m.text || '').slice(0, CHAT_MAX) }); break;
      case 'befehl': if(this.nichtZuSchnell(g)) Befehle.vonGast(g, String(m.text || '').slice(0, CHAT_MAX)); break;
      case 'tod': Chat.todMelden(g.name, m.grund); break;
      case 'tschuess': this.gastWeg(g); setTimeout(() => { try{ g.conn.close(); }catch(e){} }, 200); break;
    }
  },
  hallo(g, m){
    const nein = grund => { this.senden(g.conn, { t:'nein', grund }); setTimeout(() => { try{ g.conn.close(); }catch(e){} }, 800); };
    if(m.v !== NETZ_VERSION){ nein('Ihr habt verschiedene Pocketcraft-Fassungen. Ladet beide die Seite neu.'); return; }
    if(!Game.running || !Game.meta){ nein('Die Welt ist gerade nicht geöffnet.'); return; }
    const id = String(m.id || '').slice(0, 48);
    if(!id){ nein('Unbekannter Spieler.'); return; }
    if(id === this.ich.id){ nein('Das ist deine eigene Welt — auf diesem Gerät bist du schon der Host.'); return; }
    // dieselbe Person noch einmal (Seite neu geladen): die alte Leitung fliegt raus
    for(const [k, o] of this.gaeste) if(o !== g && o.id === id){ o.bereit = false; this.gaeste.delete(k); try{ o.conn.close(); }catch(e){} this.andere.delete(id); }
    if(this.bereiteGaeste().length >= NETZ_MAX - 1){ nein('Die Welt ist voll (' + NETZ_MAX + ' Spieler).'); return; }
    g.id = id; g.name = String(m.name || 'Gast').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Gast';
    g.farbe = Math.abs(m.farbe | 0) % SPIELER_FARBEN.length;
    g.bereit = true;
    this.gaeste.set(g.conn.connectionId, g);
    const p = Game.player, du = Game.gaeste[id] || null;
    const ort = du && du.p ? du.p : { x: p.spawnX, y: p.spawnY, z: p.spawnZ, yaw: 0, pitch: 0 };
    g.x = ort.x; g.y = ort.y; g.z = ort.z;
    this.senden(g.conn, { t:'willkommen', v: NETZ_VERSION, code: this.code, du, op: Game.ops.has(id),
      welt: Object.assign({ name: Game.meta.name, seed: Game.world.seedStr, gen: Game.world.gen, typ: Game.world.typ, modus: p.creative ? 'kreativ' : 'ueberleben',
                            time: Game.time, zeit: Game.gesamtZeit, wetter: Wetter.daten(), regeln: Game.regeln,
                            spawn: [p.spawnX, p.spawnY, p.spawnZ] }, Game.weltTeil()) });
    this.andere.set(id, this.figur(id, g.name, g.farbe, ort));
    // Öfen und Wesen gleich hinterher, nicht erst beim nächsten Takt
    this._ofenSig = {};
    this._t.pos = this._t.wesen = 1;
    Chat.system(g.name + ' ist beigetreten');
    if(typeof Menue !== 'undefined' && Menue.netzAnzeigen) Menue.netzAnzeigen();
  },
  gastWeg(g){
    const war = this.gaeste.get(g.conn.connectionId) === g;
    if(war) this.gaeste.delete(g.conn.connectionId);
    if(!g.bereit) return;
    g.bereit = false;
    // wo er zuletzt stand, auch wenn der letzte Stand nicht mehr ankam
    const d = Game.gaeste[g.id] || (Game.gaeste[g.id] = {});
    d.name = g.name;
    d.p = Object.assign(d.p || {}, { x: g.x, y: g.y, z: g.z, yaw: g.yaw, pitch: g.pitch });
    this.andere.delete(g.id); this.schildWeg(g.id);
    if(this.istHost){
      Chat.system(g.name + ' hat die Welt verlassen');
      if(typeof Menue !== 'undefined' && Menue.netzAnzeigen) Menue.netzAnzeigen();
    }
  },
  /** Inventar und Ort eines Gastes: der Host hebt sie mit der Welt auf */
  standMerken(g, m){
    if(!m.p) return;
    Game.gaeste[g.id] = { name: g.name, p: m.p, inv: m.inv || [], ruest: m.ruest || [], bekannt: m.bekannt || [], rest: m.rest || [], zeit: Date.now() };
  },
  wesenAnfrageHost(g, m){
    const mob = Game.mobs.find(q => q.nid === m.n && !q.dead);
    if(!mob) return;
    // ein Ei trifft mit 0 Schaden — das bleibt 0
    const dmg = Number.isFinite(+m.dmg) ? clamp(+m.dmg, 0, 20) : 1;
    if(m.a === 'treffer') Game.mobTreffer(mob, dmg, clamp(+m.kx || 0, -1, 1), clamp(+m.kz || 0, -1, 1), g);
    else if(m.a === 'futter') Game.fuettern(mob);
    else if(m.a === 'schere') Game.scheren(mob, g);
  },
  /** ein Gast hat mit einem Ei Glück gehabt: Küken bei ihm schlüpfen lassen */
  kuekenHost(g, m){
    const x = +m.x, y = +m.y, z = +m.z;
    if(![x, y, z].every(Number.isFinite) || Math.hypot(x - g.x, z - g.z) > 48 || y < 1 || y >= WH) return;
    Game.kuekenSchluepfen(x, y, z, m.n === 4 ? 4 : 1);
  },
  /** höchstens acht Nachrichten oder Befehle in vier Sekunden */
  nichtZuSchnell(g){
    const jetzt = performance.now();
    g._chat = (g._chat || []).filter(t => jetzt - t < 4000);
    if(g._chat.length >= 8){ this.senden(g.conn, { t:'chat', art:'fehler', text:'Nicht so schnell!' }); return false; }
    g._chat.push(jetzt);
    return true;
  },
  /** /kick: der Gast bekommt den Grund zu sehen, dann ist die Leitung zu */
  rauswerfen(g, grund){
    this.senden(g.conn, { t:'zu', grund });
    this.gastWeg(g);
    setTimeout(() => { try{ g.conn.close(); }catch(e){} }, 400);
  },
  beuteAn(g, liste, x, y, z){ if(liste.length) this.senden(g.conn, { t:'beute', l: liste, x: r2(x), y: r2(y), z: r2(z) }); },
  autsch(g, n, grund, kx, kz){ this.senden(g.conn, { t:'autsch', n, grund, kx: r2(kx), kz: r2(kz) }); },
  zeitSenden(){ this.anAlle({ t:'zeit', a: Game.time, z: Game.gesamtZeit, w: Wetter.regen ? 1 : 0 }); },

  /** Wesen für jeden Gast, soweit sie in seiner Nähe sind */
  wesenSenden(){
    for(const g of this.gaeste.values()){
      if(!g.bereit) continue;
      const l = [];
      for(const m of Game.mobs){
        if(m.dead || Math.abs(m.x - g.x) > 80 || Math.abs(m.z - g.z) > 80) continue;
        const f = (m.moving ? 1 : 0) | (m.hurtTimer > 0 ? 2 : 0) | (m.geschoren ? 4 : 0) | (m.liebe > 0 ? 8 : 0) | (m.pause > 0 ? 16 : 0) | (m.kind > 0 ? 32 : 0)
          | (m.onGround ? 0 : 64);
        l.push(m.nid, WESEN_ARTEN.indexOf(m.type), r2(m.x), r2(m.y), r2(m.z), r2(m.yaw), f, m.groesse || m.wolle | 0);
      }
      this.senden(g.conn, { t:'w', l });
    }
  },
  spielerSenden(){
    const p = Game.player, h = Inv.held();
    const l = [[this.ich.id, this.ich.name, this.ich.farbe, r2(p.x), r2(p.y), r2(p.z), r2(p.yaw), r2(p.pitch), this.meineFlags(), h ? h.id : 0, Ruestung.code()]];
    for(const g of this.gaeste.values())
      if(g.bereit) l.push([g.id, g.name, g.farbe, r2(g.x), r2(g.y), r2(g.z), r2(g.yaw), r2(g.pitch), g.flags, g.held, g.ruest]);
    this.anAlle({ t:'s', l });
  },
  /** Öfen: Inhalt, Glut und Fortschritt, sobald sich etwas ändert */
  oefenSenden(alle){
    const l = [];
    for(const [k, f] of Game.world.furnaces){
      const e = [k, stapelKurz(f.in), stapelKurz(f.fuel), stapelKurz(f.out), Math.round(f.burn), Math.round(f.burnMax), Math.round(f.cook)];
      const sig = JSON.stringify(e);
      if(!alle && this._ofenSig[k] === sig) continue;
      this._ofenSig[k] = sig; l.push(e);
    }
    if(l.length) this.anAlle({ t:'oefen', l });
  },
  /** Rund um jeden Gast braucht der Host Gelände, sonst fallen dort Tiere
      durch den Boden und Monster können nicht erscheinen. Nur erzeugt und
      beleuchtet, nicht gezeichnet. */
  gastUmgebung(){
    const w = Game.world; let budget = 2;
    for(const g of this.gaeste.values()){
      if(!g.bereit) continue;
      const cx0 = Math.floor(g.x) >> 4, cz0 = Math.floor(g.z) >> 4;
      for(let r = 0; r <= 2 && budget > 0; r++)
        for(let dz = -r; dz <= r && budget > 0; dz++) for(let dx = -r; dx <= r && budget > 0; dx++){
          if(Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const c = w.chunks.get(ckey(cx0 + dx, cz0 + dz));
          if(c && c.state >= 2) continue;
          w.computeLight(w.ensureChunk(cx0 + dx, cz0 + dz)); budget--;
        }
    }
  },
  chunkGebraucht(cx, cz){
    if(!this.istHost) return false;
    for(const g of this.gaeste.values()){
      if(!g.bereit) continue;
      if(Math.abs((Math.floor(g.x) >> 4) - cx) <= 3 && Math.abs((Math.floor(g.z) >> 4) - cz) <= 3) return true;
    }
    return false;
  },
  chunksAufraeumen(){
    const w = Game.world, p = Game.player, rd = Game.sicht() + 3, pcx = Math.floor(p.x/CS), pcz = Math.floor(p.z/CS);
    for(const [k, c] of w.chunks){
      if(Game.meshes.has(k)) continue;
      if(Math.abs(c.cx - pcx) <= rd && Math.abs(c.cz - pcz) <= rd) continue;
      if(this.chunkGebraucht(c.cx, c.cz)) continue;
      w.chunks.delete(k);
    }
  },

  /* ═══ GAST ═══════════════════════════════════════════════════════ */
  gastPeerHolen(){
    const P0 = this._gastPeer;
    if(P0 && !P0.destroyed && !P0.disconnected && P0.open) return Promise.resolve(P0);
    if(this._gastPeerWarte) return this._gastPeerWarte;
    if(P0 && !P0.destroyed){ try{ P0.destroy(); }catch(e){} }
    this._gastPeer = null;
    this._gastPeerWarte = new Promise((ok, fehler) => {
      let P;
      try{ P = new Peer(this.optionen()); }catch(e){ this._gastPeerWarte = null; fehler({ type:'browser-incompatible' }); return; }
      const t = setTimeout(() => { this._gastPeerWarte = null; try{ P.destroy(); }catch(e){} fehler({ type:'network' }); }, 12000);
      P.on('open', () => { clearTimeout(t); this._gastPeer = P; this._gastPeerWarte = null; ok(P); });
      P.on('error', e => {
        if(e.type === 'peer-unavailable'){ this.nichtDa(e); return; }
        if(this._gastPeer !== P){ clearTimeout(t); this._gastPeerWarte = null; try{ P.destroy(); }catch(x){} fehler(e); return; }
        if(this.rolle === 'verbinde') this.verbindenGescheitert(this.fehlerText(e));
      });
      P.on('disconnected', () => { if(this._gastPeer === P && !P.destroyed) setTimeout(() => { try{ if(!P.destroyed) P.reconnect(); }catch(e){} }, 2000); });
    });
    return this._gastPeerWarte;
  },
  /** den gesuchten Host gibt es gerade nicht */
  nichtDa(e){
    const m = /peer (\S+)/i.exec((e && e.message) || ''), id = m ? m[1] : '';
    const code = id.startsWith(NETZ_PRAEFIX) ? id.slice(NETZ_PRAEFIX.length) : '';
    const w = this._pings.get(code); if(w) w({ online:false });
    if(this.rolle === 'verbinde' && this.code === code)
      this.verbindenGescheitert('Niemand hat die Welt ' + netzCodeZeigen(code) + ' gerade geöffnet. Der Host muss in der Welt sein und sie im Spielmenü mit „Für Freunde öffnen“ freigeben.');
  },
  /** Serverliste: ist jemand da? */
  ping(code){
    return new Promise(fertig => {
      const alt = this._pings.get(code); if(alt) alt({ online:false, abgeloest:true });
      let erledigt = false, conn = null;
      const ende = r => {
        if(erledigt) return; erledigt = true; clearTimeout(t);
        if(this._pings.get(code) === ende) this._pings.delete(code);
        if(conn) setTimeout(() => { try{ conn.close(); }catch(e){} }, 50);
        fertig(r);
      };
      this._pings.set(code, ende);
      const t = setTimeout(() => ende({ online:false }), 9000);
      this.laden().then(() => this.gastPeerHolen()).then(P => {
        if(erledigt) return;
        const start = performance.now();
        conn = P.connect(NETZ_PRAEFIX + code, { serialization:'raw', reliable:true, metadata:{ ping:1 } });
        conn.on('data', roh => { const m = this.lesen('ping' + code, roh); if(m && m.t === 'info') ende({ online:true, info:m, ms: Math.round(performance.now() - start) }); });
        conn.on('error', () => ende({ online:false }));
      }).catch(e => ende({ online:false, fehler: this.fehlerText(e) }));
    });
  },
  async beitreten(code){
    code = netzCodeLesen(code);
    if(!code){ Menue.verbindenFehler('Ein Code hat sechs Zeichen, zum Beispiel KUH-4X7.'); return; }
    this.trennen();
    this.code = code; this.rolle = 'verbinde';
    const nr = this._versuch = (this._versuch || 0) + 1;
    Menue.verbindenZeigen('Verbinde mit ' + netzCodeZeigen(code) + ' …', 'Suche den Host …');
    try{ await this.laden(); }
    catch(e){ if(nr === this._versuch) this.verbindenGescheitert('Die Mitspieler-Technik ließ sich nicht laden. Bist du offline?'); return; }
    let P;
    try{ P = await this.gastPeerHolen(); }
    catch(e){ if(nr === this._versuch) this.verbindenGescheitert(this.fehlerText(e)); return; }
    if(nr !== this._versuch || this.rolle !== 'verbinde') return;
    Menue.verbindenZeigen('Verbinde mit ' + netzCodeZeigen(code) + ' …', 'Warte auf den Host …');
    const conn = P.connect(NETZ_PRAEFIX + code, { serialization:'raw', reliable:true });
    this.hostConn = conn;
    this._verbindeT = setTimeout(() => {
      if(this.hostConn === conn && this.rolle === 'verbinde') this.verbindenGescheitert('Keine Antwort vom Host. Vielleicht lässt euer Netz keine direkte Verbindung zu.');
    }, 25000);
    conn.on('open', () => {
      Menue.verbindenZeigen('Verbinde mit ' + netzCodeZeigen(code) + ' …', 'Welt wird übertragen …');
      this.senden(conn, { t:'hallo', v: NETZ_VERSION, id: this.ich.id, name: this.ich.name, farbe: this.ich.farbe });
    });
    conn.on('data', roh => { if(this.hostConn !== conn) return; const m = this.lesen('host', roh); if(m) this.gastEmpfang(m); });
    conn.on('close', () => { if(this.hostConn === conn) this.hostWeg(); });
    conn.on('error', () => { if(this.hostConn === conn) this.hostWeg(); });
  },
  verbindenGescheitert(text){
    clearTimeout(this._verbindeT);
    this.trennen();
    Menue.verbindenFehler(text);
  },
  gastEmpfang(m){
    this._hostZuletzt = performance.now();
    if(m.t === 'nein'){ this.verbindenGescheitert(m.grund || 'Der Host hat abgelehnt.'); return; }
    if(m.t === 'willkommen'){ this.willkommen(m); return; }
    if(this.rolle !== 'gast') return;
    switch(m.t){
      case 's': this.spielerEmpfangen(m.l); break;
      case 'w': this.wesenEmpfangen(m.l); break;
      case 'b': this.bloeckeEmpfangen(m.l); break;
      case 'zeit': if(isFinite(m.a)) Game.time = +m.a; if(isFinite(m.z)) Game.gesamtZeit = +m.z; if(m.w !== undefined) Wetter.vomHost(m.w); break;
      case 'wetter': Wetter.vomHost(m.r); break;
      case 'truhe': this.truheEmpfangen(m, null); break;
      case 'oefen': this.oefenEmpfangen(m.l); break;
      case 'pfeil': this.pfeilEmpfangen(m, null); break;
      case 'autsch': {
        const p = Game.player;
        if(p.hurt(+m.n || 1, m.grund || '', +m.kx || 0, +m.kz || 0)){ Game.hurtFlash = 1; Sfx.play('hurt'); }
        break;
      }
      case 'beute':
        if(!Game.player.creative) for(const [id, n] of (m.l || [])) Game.dropItem(id, n, +m.x, +m.y, +m.z);
        break;
      case 'hinweis': hint(String(m.text || ''), 2400); break;
      case 'schlaf': if(Game.bett && !Game.schlafT) Game.schlafT = 0.001; break;     // alle liegen: die Nacht vergeht
      case 'chat': Chat.zeigen(m); break;
      case 'anwenden': Befehle.anwenden(m); break;
      case 'op': Befehle.op = !!m.an; break;
      case 'regeln': Game.regelnSetzen(m.r); break;
      case 'zu': this.trennen(); Menue.verbindungWeg(m.grund || 'Der Host hat die Welt geschlossen.'); break;
    }
  },
  willkommen(m){
    clearTimeout(this._verbindeT);
    if(m.v !== NETZ_VERSION || !m.welt){ this.verbindenGescheitert('Die Welt ließ sich nicht übertragen.'); return; }
    this.rolle = 'gast'; this.istGast = true; this.istHost = false;
    Befehle.op = !!m.op;
    this._hostZuletzt = performance.now();
    for(const k in this._t) this._t[k] = 0;
    this._behSig = {};
    Menue.serverMerken(this.code, m.welt.name);
    Menue.alleZu();
    Game.startGast(m);
    hint('Willkommen in „' + m.welt.name + '“', 2600);
  },
  /** Verbindung zum Host verloren */
  hostWeg(){
    if(this.rolle === 'verbinde'){ this.verbindenGescheitert('Die Verbindung ist abgebrochen.'); return; }
    if(this.rolle !== 'gast') return;
    this.trennen();
    Menue.verbindungWeg('Die Verbindung zum Host ist abgebrochen.');
  },
  /** selbst gehen: Stand abgeben, tschüss sagen */
  verlassen(){
    if(this.istGast && this.hostConn){
      this.standSenden();
      this.senden(this.hostConn, { t:'tschuess' });
      const c = this.hostConn; this.hostConn = null;
      setTimeout(() => { try{ c.close(); }catch(e){} }, 300);
    }
    this.trennen();
  },
  trennen(){
    clearTimeout(this._verbindeT);
    if(this.hostConn){ const c = this.hostConn; this.hostConn = null; try{ c.close(); }catch(e){} }
    if(this.rolle === 'gast' || this.rolle === 'verbinde'){ this.rolle = null; this.istGast = false; Befehle.op = false; }
    this._versuch = (this._versuch || 0) + 1;
    this.andereLeeren();
    this.ausgang = [];
  },
  standSenden(){
    if(!this.istGast || !this.hostConn) return;
    const p = Game.player;
    this.senden(this.hostConn, { t:'stand',
      p: { x:p.x, y:p.y, z:p.z, yaw:p.yaw, pitch:p.pitch, health:p.health, food:p.food, saturation:p.saturation, air:p.air,
           spawnX:p.spawnX, spawnY:p.spawnY, spawnZ:p.spawnZ },
      inv: Inv.slots.map(stapelKurz), ruest: Inv.ruestung.map(stapelKurz), bekannt: [...Inv.bekannt],
      rest: Screens.raster.concat([Inv.cursor]).filter(Boolean).map(stapelKurz) });
  },
  ichSenden(){
    const p = Game.player, h = Inv.held();
    this.senden(this.hostConn, { t:'ich', x: r2(p.x), y: r2(p.y), z: r2(p.z), a: r2(p.yaw), p: r2(p.pitch),
      f: this.meineFlags(), h: h ? h.id : 0, c: p.creative ? 1 : 0, r: Ruestung.code() });
  },
  kuekenAnfrage(x, y, z, n){
    if(this.istGast) this.senden(this.hostConn, { t:'kueken', x: r2(x), y: r2(y), z: r2(z), n });
  },
  wesenAnfrage(art, m, mehr){
    if(!this.istGast) return;
    this.senden(this.hostConn, Object.assign({ t:'wesen', a: art, n: m.nid }, mehr || {}));
  },
  spielerEmpfangen(l){
    const da = new Set();
    for(const e of (l || [])){
      const [id, name, farbe, x, y, z, yaw, pitch, f, held, ruest] = e;
      if(id === this.ich.id) continue;
      da.add(id);
      let s = this.andere.get(id);
      if(!s){ s = this.figur(id, name, farbe, { x, y, z, yaw, pitch }); this.andere.set(id, s); }
      s.name = name; s.farbe = farbe | 0;
      this.figurZiel(s, x, y, z, yaw, pitch, f, held, ruest);
    }
    for(const id of [...this.andere.keys()]) if(!da.has(id)){ this.andere.delete(id); this.schildWeg(id); }
  },
  /** Die Wesen kommen fertig gerechnet vom Host; hier werden sie nur
      nachgeführt. Wer nicht mehr in der Liste steht, ist weg. */
  wesenEmpfangen(l){
    const alt = new Map();
    for(const m of Game.mobs) alt.set(m.nid, m);
    const neu = [];
    for(let i = 0; i + 7 < (l || []).length; i += 8){
      const nid = l[i], art = WESEN_ARTEN[l[i+1]], f = l[i+6] | 0;
      if(!art) continue;
      const jung = (f & 32) !== 0;
      let m = alt.get(nid);
      if(!m || m.type !== art){ m = new Mob(art, l[i+2], l[i+3], l[i+4], jung); m.nid = nid; m.yaw = l[i+5]; }
      m.zx = l[i+2]; m.zy = l[i+3]; m.zz = l[i+4]; m.zyaw = l[i+5];
      m.moving = !!(f & 1); m.onGround = !(f & 64);
      if(f & 2) m.hurtTimer = Math.max(m.hurtTimer, 0.25);
      m.liebe = (f & 8) ? 1 : 0; m.pause = (f & 16) ? 1 : 0;
      if(art === 'sheep'){ m.geschoren = !!(f & 4); m.wolle = l[i+7] | 0; }
      if(art === 'slime' && m.groesse !== (l[i+7] | 0) && [1, 2, 4].includes(l[i+7])) schleimGroesse(m, l[i+7]);
      if(jung && !(m.kind > 0)){ m.kind = 1; m.w = m.def.w*BABY; m.h = m.def.h*BABY; }
      else if(!jung && m.kind > 0){ m.kind = 0; m.w = m.def.w; m.h = m.def.h; }
      neu.push(m);
      alt.delete(nid);
    }
    for(const m of alt.values()) if(m.hurtTimer > 0) Sfx.wesen(m, 'tot');
    Game.mobs = neu;
  },
  wesenNachziehen(dt){
    const k = Math.min(1, dt*10), p = Game.player;
    for(const m of Game.mobs){
      if(m.zx === undefined) continue;
      if(Math.abs(m.zx - m.x) > 8 || Math.abs(m.zz - m.z) > 8 || Math.abs(m.zy - m.y) > 8){ m.x = m.zx; m.y = m.zy; m.z = m.zz; }
      else { m.x += (m.zx - m.x)*k; m.y += (m.zy - m.y)*k; m.z += (m.zz - m.z)*k; }
      m.yaw = winkelNach(m.yaw, m.zyaw, k);
      m.age += dt;
      if(m.hurtTimer > 0) m.hurtTimer -= dt;
      if(m.moving) m.walkPhase += dt*m.def.speed*3.2*0.8;
      if(m.def.schleim) schleimQuetschen(m, dt);
      if(m.liebe > 0){ m.herzT -= dt; if(m.herzT <= 0){ m.herzT = 0.7 + Math.random()*0.4; Game.herz(m); } }
      if(Math.hypot(m.x - p.x, m.z - p.z) < 20 && Math.random() < (m.def.hostile ? 0.003 : 0.0012)) Sfx.wesen(m, 'laut');
    }
  },

  /* ═══ BEIDE ══════════════════════════════════════════════════════ */
  meineFlags(){
    const p = Game.player, l = this._letzt;
    const bewegt = !!l && Math.hypot(p.x - l[0], p.z - l[1]) > 0.02;
    this._letzt = [p.x, p.z];
    return (p.sneaking ? 1 : 0) | (p.swinging ? 2 : 0) | (p.dead ? 4 : 0) | (bewegt ? 8 : 0) | (Game.bett ? 16 : 0);
  },
  /** jede Blockänderung aus dem eigenen Spiel */
  blockGeaendert(x, y, z, id){ this.ausgang.push(x, y, z, id); },
  bloeckeEmpfangen(l){
    if(!Array.isArray(l)) return;
    this._toene = 4;
    for(let i = 0; i + 3 < l.length; i += 4){
      const x = l[i] | 0, y = l[i+1] | 0, z = l[i+2] | 0, id = l[i+3] | 0;
      if(!blocks[id] && id !== B.AIR) continue;
      this.blockSetzen(x, y, z, id);
      // der Host gibt alles an alle weiter, auch zurück an den Absender:
      // So landen alle beim selben Stand, selbst wenn zwei gleichzeitig bauen
      if(this.istHost) this.ausgang.push(x, y, z, id);
    }
  },
  /** Block aus dem Netz einsetzen, samt Truhe, Ofen oder Feld dahinter */
  blockSetzen(x, y, z, id){
    if(y < 1 || y >= WH) return;
    const w = Game.world, ck = ckey(x >> 4, z >> 4), c = w.chunks.get(ck), k = x + ',' + y + ',' + z;
    this.eingehend = true;
    try{
      let alt;
      if(c && c.state >= 1){ alt = w.getBlock(x, y, z); w.setBlock(x, y, z, id); }
      else {
        // Chunk nicht geladen: in die Änderungen, dort findet ihn der Generator
        let m = w.mods.get(ck); if(!m){ m = new Map(); w.mods.set(ck, m); }
        const i = IDX(x & 15, y, z & 15);
        alt = m.has(i) ? m.get(i) : -1;
        m.set(i, id);
      }
      if(alt === id) return;
      if(alt >= 0 && this._toene > 0) this.bauKlang(alt, id, x, y, z);
      if(alt === B.CHEST && id !== B.CHEST) w.chests.delete(k);
      if((alt === B.FURNACE || alt === B.FURNACE_LIT) && id !== B.FURNACE && id !== B.FURNACE_LIT) w.furnaces.delete(k);
      if(id === B.CHEST && !w.chests.has(k)) w.chests.set(k, new Array(27).fill(null));
      if((id === B.FURNACE || id === B.FURNACE_LIT) && !w.furnaces.has(k))
        w.furnaces.set(k, { in:null, fuel:null, out:null, burn:0, burnMax:0, cook:0, x, y, z });
      if(isWheat(id)){ if(!w.crops.has(k)) w.crops.set(k, { t:0 }); }
      else w.crops.delete(k);
    } finally { this.eingehend = false; }
  },

  /** Abbauen, Setzen, Türen der anderen — Wachsen und Ofenglut bleiben still */
  bauKlang(alt, id, x, y, z){
    if((isWheat(alt) && isWheat(id)) || ((alt === B.FURNACE || alt === B.FURNACE_LIT) && (id === B.FURNACE || id === B.FURNACE_LIT))) return;
    if((isWasser(alt) || alt === B.AIR) && (isWasser(id) || id === B.AIR)) return;     // Wasser fließt oder versiegt
    this._toene--;
    if(isDoor(alt) && isDoor(id)){ if(doorInfo(id).oben) return; Sfx.play(doorInfo(id).offen ? 'tuer_auf' : 'tuer_zu', x + .5, y + 1, z + .5); }
    else if(id === B.AIR) Sfx.block('weg', alt, x, y, z);
    else Sfx.block('setzen', id, x, y, z);
  },

  /* — Truhen und Öfen: wer etwas hineinlegt, schickt den neuen Inhalt — */
  behaelterGeoeffnet(){
    if(!this.rolle) return;
    const w = Game.world;
    if(Screens.modus === 'truhe'){ const t = w.chests.get(Screens.truheKey); if(t) this._behSig[Screens.truheKey] = JSON.stringify(t.map(stapelKurz)); }
    if(Screens.modus === 'ofen'){ const f = w.furnaces.get(Screens.ofenKey); if(f) this._behSig['o' + Screens.ofenKey] = JSON.stringify([f.in, f.fuel, f.out].map(stapelKurz)); }
  },
  behaelterPruefen(){
    if(!this.rolle || this.rolle === 'verbinde' || Screens.open !== 'beh') return;
    const w = Game.world;
    if(Screens.modus === 'truhe'){
      const k = Screens.truheKey, t = w.chests.get(k); if(!t) return;
      const s = t.map(stapelKurz), sig = JSON.stringify(s);
      if(this._behSig[k] === sig) return;
      this._behSig[k] = sig;
      if(this.istGast) this.senden(this.hostConn, { t:'truhe', k, s });
      else this.anAlle({ t:'truhe', k, s });
    } else if(Screens.modus === 'ofen' && this.istGast){
      // der Host schickt seine Öfen ohnehin laufend
      const k = Screens.ofenKey, f = w.furnaces.get(k); if(!f) return;
      const s = [f.in, f.fuel, f.out].map(stapelKurz), sig = JSON.stringify(s);
      if(this._behSig['o' + k] === sig) return;
      this._behSig['o' + k] = sig;
      this.senden(this.hostConn, { t:'ofen', k, s });
    }
  },
  truheEmpfangen(m, von){
    const w = Game.world, k = String(m.k);
    let t = w.chests.get(k);
    if(!t){ t = new Array(27).fill(null); w.chests.set(k, t); }
    // an Ort und Stelle ändern: Ist die Truhe gerade offen, hängt die Anzeige an genau diesem Feld
    const s = Array.isArray(m.s) ? m.s : [];
    for(let i = 0; i < 27; i++) t[i] = stapelLang(s[i]);
    this._behSig[k] = JSON.stringify(t.map(stapelKurz));
    if(this.istHost) this.anAlle({ t:'truhe', k, s: t.map(stapelKurz) }, von);
    if(Screens.open === 'beh' && Screens.modus === 'truhe' && Screens.truheKey === k) Screens.render();
  },
  ofenEmpfangen(m){
    const w = Game.world, k = String(m.k), f = w.furnaces.get(k);
    if(!f || !Array.isArray(m.s)) return;
    f.in = stapelLang(m.s[0]); f.fuel = stapelLang(m.s[1]); f.out = stapelLang(m.s[2]);
    if(Screens.open === 'beh' && Screens.modus === 'ofen' && Screens.ofenKey === k){ this.behaelterGeoeffnet(); Screens.render(); }
  },
  oefenEmpfangen(l){
    const w = Game.world;
    for(const [k, a, b, c, burn, burnMax, cook] of (l || [])){
      let f = w.furnaces.get(k);
      if(!f){ const [x, y, z] = String(k).split(',').map(Number); f = { in:null, fuel:null, out:null, burn:0, burnMax:0, cook:0, x, y, z }; w.furnaces.set(k, f); }
      f.in = stapelLang(a); f.fuel = stapelLang(b); f.out = stapelLang(c); f.burn = burn; f.burnMax = burnMax; f.cook = cook;
      if(Screens.open === 'beh' && Screens.modus === 'ofen' && Screens.ofenKey === k){ this.behaelterGeoeffnet(); Screens.render(); }
    }
  },

  /* — Pfeile: Monsterpfeile treffen, die der Spieler sind nur zu sehen — */
  pfeilSenden(a, nurBild){
    if(!this.rolle || this.rolle === 'verbinde') return;
    const m = { t:'pfeil', a: [r2(a.x), r2(a.y), r2(a.z), r2(a.vx), r2(a.vy), r2(a.vz), a.dmg | 0], bild: nurBild ? 1 : 0, ei: a.ei ? 1 : 0 };
    if(this.istGast) this.senden(this.hostConn, m); else this.anAlle(m);
  },
  pfeilEmpfangen(m, von){
    const a = m.a; if(!Array.isArray(a) || a.length < 7) return;
    const pf = new Pfeil(+a[0], +a[1], +a[2], +a[3], +a[4], +a[5], a[6] | 0, false, !!m.ei);
    // ein Gast schießt: für alle anderen nur zu sehen, getroffen wird beim Schützen
    if(von || m.bild) pf.nurBild = true;
    Game.pfeile.push(pf);
    if(pf.ei) Sfx.play('werfen', pf.x, pf.y, pf.z);
    if(this.istHost && von) this.anAlle({ t:'pfeil', a, bild: 1, ei: m.ei ? 1 : 0 }, von);
  },

  /* — Figuren der anderen — */
  figur(id, name, farbe, o){
    return { id, name, farbe: farbe | 0, w: 0.6, h: 1.8,
             x: +o.x || 0, y: +o.y || 0, z: +o.z || 0, yaw: +o.yaw || 0, pitch: +o.pitch || 0,
             zx: +o.x || 0, zy: +o.y || 0, zz: +o.z || 0, zyaw: +o.yaw || 0, zpitch: +o.pitch || 0,
             flags: 0, held: 0, ruest: 0, walkPhase: 0, schlagT: 0, tot: false };
  },
  figurZiel(s, x, y, z, yaw, pitch, f, held, ruest){
    if(!s) return;
    const lag = s.flags & 16;
    s.zx = +x; s.zy = +y; s.zz = +z; s.zyaw = +yaw; s.zpitch = +pitch; s.flags = f | 0; s.held = held | 0; s.tot = !!(f & 4);
    s.ruest = (ruest | 0) & 0xfff;
    // jemand legt sich hin: alle erfahren, wie viele schon liegen
    if((s.flags & 16) && !lag && Game.running){ const [n, alle] = Game.schlaefer(); hint(s.name + ' liegt im Bett · ' + n + ' von ' + alle, 2600); }
  },
  figurenNachziehen(dt){
    const k = Math.min(1, dt*12);
    for(const s of this.andere.values()){
      if(Math.abs(s.zx - s.x) > 10 || Math.abs(s.zz - s.z) > 10 || Math.abs(s.zy - s.y) > 10){ s.x = s.zx; s.y = s.zy; s.z = s.zz; }
      else { s.x += (s.zx - s.x)*k; s.y += (s.zy - s.y)*k; s.z += (s.zz - s.z)*k; }
      s.yaw = winkelNach(s.yaw, s.zyaw, k); s.pitch += (s.zpitch - s.pitch)*k;
      if(s.flags & 8) s.walkPhase += dt*7.5;
      s.schlagT = (s.flags & 2) ? s.schlagT + dt : 0;
    }
  },
  andereLeeren(){ this.andere.clear(); const n = document.getElementById('namen'); if(n) n.innerHTML = ''; },
  schildWeg(id){ const e = document.getElementById('schild-' + id); if(e) e.remove(); },
  /** Namensschilder über den Köpfen: Position aus der Kameramatrix */
  schilder(){
    if(!this.andere.size) return;
    const box = document.getElementById('namen'); if(!box) return;
    const vp = R.vp, W = window.innerWidth, H = window.innerHeight, p = Game.player;
    for(const s of this.andere.values()){
      let e = document.getElementById('schild-' + s.id);
      if(!e){ e = document.createElement('div'); e.className = 'schild'; e.id = 'schild-' + s.id; box.appendChild(e); }
      if(e.textContent !== s.name) e.textContent = s.name;
      const liegt = s.flags & 16;                          // im Bett: das Schild über dem Kopfkissen
      const x = s.x, y = s.y + (liegt ? 0.75 : (s.flags & 1) ? 1.95 : 2.1), z = s.z - (liegt ? 0.3 : 0);
      const cw = vp[3]*x + vp[7]*y + vp[11]*z + vp[15];
      const weit = Math.hypot(x - p.x, z - p.z);
      if(cw < 0.1 || s.tot || weit > 64){ e.style.display = 'none'; continue; }
      const cx = (vp[0]*x + vp[4]*y + vp[8]*z + vp[12])/cw, cy = (vp[1]*x + vp[5]*y + vp[9]*z + vp[13])/cw;
      if(Math.abs(cx) > 1.3 || Math.abs(cy) > 1.3){ e.style.display = 'none'; continue; }
      e.style.display = '';
      e.style.transform = 'translate(' + ((cx*0.5 + 0.5)*W).toFixed(1) + 'px,' + ((0.5 - cy*0.5)*H).toFixed(1) + 'px) translate(-50%,-100%)';
      e.style.opacity = (s.flags & 1) ? 0.45 : 1;
    }
  },

  /** jeden Frame, solange eine Welt läuft */
  tick(dt){
    if(this.rolle !== 'host' && this.rolle !== 'gast') return;
    const T = this._t, jetzt = performance.now();
    for(const k in T) T[k] += dt;
    this.figurenNachziehen(dt);
    if(this.istGast){
      if(this.ausgang.length){ this.senden(this.hostConn, { t:'b', l: this.ausgang }); this.ausgang = []; }
      if(T.pos >= 0.1){ T.pos = 0; this.ichSenden(); }
      if(T.stand >= 20){ T.stand = 0; this.standSenden(); }
      if(jetzt - this._hostZuletzt > NETZ_STILLE) this.hostWeg();
      return;
    }
    // Host
    if(!this.hatGaeste()){ this.ausgang = []; return; }
    if(this.ausgang.length){ this.anAlle({ t:'b', l: this.ausgang }); this.ausgang = []; }
    if(T.pos >= 0.1){ T.pos = 0; this.spielerSenden(); }
    if(T.wesen >= 0.125){ T.wesen = 0; this.wesenSenden(); }
    if(T.ofen >= 0.5){ T.ofen = 0; this.oefenSenden(false); }
    if(T.zeit >= 5){ T.zeit = 0; this.zeitSenden(); }
    if(T.umgebung >= 0.25){ T.umgebung = 0; this.gastUmgebung(); }
    if(T.aufraeumen >= 6){ T.aufraeumen = 0; this.chunksAufraeumen(); }
    for(const g of [...this.gaeste.values()])
      if(g.bereit && jetzt - g.zuletzt > NETZ_STILLE){ this.gastWeg(g); try{ g.conn.close(); }catch(e){} }
  },
};
