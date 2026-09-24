/* Pocketcraft · Speicher für mehrere Welten
   Jede Welt hat einen kleinen Steckbrief (Name, Startwert, Modus, Bild,
   zuletzt gespielt) und einen großen Datenteil. Beides liegt in
   IndexedDB, getrennt, damit die Weltenliste nicht jeden Datenteil laden
   muss. localStorage ist klein und wird von allen Spielen dieser Seite
   geteilt — dort liegt nur eine Notkopie der gerade gespielten Welt,
   synchron geschrieben, wenn die Seite verschwindet. Beim nächsten Start
   wird sie eingespielt, falls sie neuer ist als der Stand in der Datenbank.
   Ohne IndexedDB (sehr alte Browser, manche private Fenster) fällt alles
   auf localStorage zurück. */
'use strict';

/* Die Schlüssel tragen noch den alten Namen »Taschenwelt«. Umbenennen
   hieße, jeden Spielstand umzuziehen — sie bleiben, wie sie sind. */
const ALT_KEY     = 'taschenwelt.world.v1';        // Spielstand der ersten Fassung
const NOTFALL_KEY = 'taschenwelt.notfall.v2';
const LS_INDEX    = 'taschenwelt.welten.v2';
const LS_WELT     = id => 'taschenwelt.welt.v2.' + id;

function neueWeltId(){ return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

const Speicher = {
  db: null, art: 'idb',

  async init(){
    try{
      if(!window.indexedDB) throw new Error('keine IndexedDB');
      this.db = await new Promise((ok, nein) => {
        const r = indexedDB.open('taschenwelt', 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if(!d.objectStoreNames.contains('welten')) d.createObjectStore('welten', { keyPath:'id' });
          if(!d.objectStoreNames.contains('daten')) d.createObjectStore('daten', { keyPath:'id' });
        };
        r.onsuccess = () => ok(r.result);
        r.onerror = () => nein(r.error);
        r.onblocked = () => nein(new Error('blockiert'));
      });
    }catch(e){ this.db = null; this.art = 'ls'; }
    try{ await this.notfallEinspielen(); }catch(e){}
    try{ await this.altEinspielen(); }catch(e){}
  },

  _req(r){ return new Promise((ok, nein) => { r.onsuccess = () => ok(r.result); r.onerror = () => nein(r.error); }); },
  _fertig(t){ return new Promise((ok, nein) => { t.oncomplete = () => ok(); t.onerror = () => nein(t.error); t.onabort = () => nein(t.error || new Error('abgebrochen')); }); },
  _lsIndex(){ try{ return JSON.parse(localStorage.getItem(LS_INDEX)) || []; }catch(e){ return []; } },

  /** alle Steckbriefe, zuletzt gespielte zuerst */
  async liste(){
    let alle;
    if(this.art === 'ls') alle = this._lsIndex();
    else alle = await this._req(this.db.transaction('welten').objectStore('welten').getAll());
    return alle.sort((a, b) => (b.gespielt || 0) - (a.gespielt || 0));
  },
  async steckbrief(id){
    if(this.art === 'ls') return this._lsIndex().find(m => m.id === id) || null;
    return (await this._req(this.db.transaction('welten').objectStore('welten').get(id))) || null;
  },
  /** Datenteil als Text */
  async laden(id){
    if(this.art === 'ls') return localStorage.getItem(LS_WELT(id));
    const r = await this._req(this.db.transaction('daten').objectStore('daten').get(id));
    return r ? r.text : null;
  },
  async sichern(meta, text){
    if(this.art === 'ls'){
      localStorage.setItem(LS_WELT(meta.id), text);
      const idx = this._lsIndex().filter(m => m.id !== meta.id);
      idx.push(meta);
      localStorage.setItem(LS_INDEX, JSON.stringify(idx));
      return;
    }
    const t = this.db.transaction(['welten', 'daten'], 'readwrite');
    t.objectStore('welten').put(Object.assign({}, meta));
    t.objectStore('daten').put({ id: meta.id, text });
    await this._fertig(t);
  },
  /** nur den Steckbrief ändern (umbenennen) */
  async steckbriefSichern(meta){
    if(this.art === 'ls'){
      const idx = this._lsIndex().map(m => m.id === meta.id ? meta : m);
      localStorage.setItem(LS_INDEX, JSON.stringify(idx));
      return;
    }
    const t = this.db.transaction('welten', 'readwrite');
    t.objectStore('welten').put(Object.assign({}, meta));
    await this._fertig(t);
  },
  async loeschen(id){
    if(this.art === 'ls'){
      localStorage.removeItem(LS_WELT(id));
      localStorage.setItem(LS_INDEX, JSON.stringify(this._lsIndex().filter(m => m.id !== id)));
      return;
    }
    const t = this.db.transaction(['welten', 'daten'], 'readwrite');
    t.objectStore('welten').delete(id);
    t.objectStore('daten').delete(id);
    await this._fertig(t);
  },
  async kopieren(id, name){
    const meta = await this.steckbrief(id), text = await this.laden(id);
    if(!meta || !text) throw new Error('Welt nicht gefunden');
    const neu = Object.assign({}, meta, { id: neueWeltId(), name, erstellt: Date.now(), gespielt: Date.now() });
    await this.sichern(neu, text);
    return neu;
  },

  /* — Notkopie — */
  notfall(meta, text){
    try{ localStorage.setItem(NOTFALL_KEY, JSON.stringify({ meta, text })); return true; }
    catch(e){ return false; }
  },
  notfallLoeschen(){ try{ localStorage.removeItem(NOTFALL_KEY); }catch(e){} },
  async notfallEinspielen(){
    let n = null;
    try{ n = JSON.parse(localStorage.getItem(NOTFALL_KEY)); }catch(e){}
    if(!n || !n.meta || !n.text) return;
    const da = await this.steckbrief(n.meta.id);
    if(!da || (da.gespielt || 0) < (n.meta.gespielt || 0)) await this.sichern(n.meta, n.text);
    this.notfallLoeschen();
  },
  /** der eine Spielstand der ersten Fassung wird zur Welt »Meine Welt« */
  async altEinspielen(){
    const raw = localStorage.getItem(ALT_KEY);
    if(!raw) return;
    let d = null; try{ d = JSON.parse(raw); }catch(e){}
    if(!d || !d.seed){ return; }
    const meta = { id: neueWeltId(), name: 'Meine Welt', seed: String(d.seed),
      modus: d.p && d.p.creative ? 'kreativ' : 'ueberleben', erstellt: Date.now(), gespielt: Date.now(),
      groesse: raw.length, tag: 1, bild: null };
    await this.sichern(meta, raw);
    localStorage.removeItem(ALT_KEY);
  }
};
