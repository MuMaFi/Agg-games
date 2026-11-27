/* Pocketcraft · Redstone
   Einfach, aber nach den Regeln des Vorbilds:
   - Strom geben ein umgelegter Hebel, ein gedrückter Knopf (eine Sekunde
     lang), eine Druckplatte, solange jemand darauf steht, eine brennende
     Redstonefackel und der Redstoneblock.
   - Die Leitung (Redstone auf dem Boden) trägt den Strom weiter, mit jedem
     Block eine Stufe schwächer, 15 Blöcke weit. Sie verbindet sich mit
     Leitungen daneben, eine Stufe darüber oder darunter, und mit allem, was
     mit Strom zu tun hat — auch mit Lampen und Türen, damit man sie nicht
     knapp verfehlt.
   - Ein Block, an dem ein Hebel oder Knopf hängt, auf dem eine Druckplatte
     liegt oder unter dem eine Fackel brennt, steht voll unter Strom und
     speist Leitungen daneben. Eine Leitung, die auf einem Block liegt oder
     in ihn hineinzeigt, lädt ihn nur schwach: Lampen, Türen und Fackeln
     daneben schalten, Leitungen nicht.
   - Die Redstonefackel ist ein Nicht: Steht ihr Block unter Strom, geht sie
     aus, einen Augenblick später. Schaltet sie zu oft (acht Mal in drei
     Sekunden), brennt sie aus und bleibt eine Weile dunkel.
   - Lampen leuchten, Türen öffnen sich, solange Strom anliegt.
   Gerechnet wird wie beim Wasser nur, wo sich etwas geändert hat, und nur
   beim Host (oder allein) — in Schritten von 1/20 s. Was sich ändert, geht
   wie jede Blockänderung an die Mitspieler. */
'use strict';

const RS_TAKT = 0.05;                     // ein Schritt, wie beim Vorbild ein Tick
const RS_FACKEL_VERZUG = 0.1;             // so lange braucht eine Fackel zum Umschalten
const RS_KNOPF_ZEIT = 1;                  // so lange bleibt ein Steinknopf gedrückt
const RS_PLATTE_ZEIT = 1;                 // so lange bleibt eine Platte unten, wenn keiner mehr darauf steht
const RS_AUSBRENNEN = 8;                  // so oft darf eine Fackel in drei Sekunden ausgehen …
const RS_ABKUEHLEN = 8;                   // … sonst bleibt sie so viele Sekunden aus
const RS_NETZ_MAX = 4096;                 // größte Leitung, die in einem Schritt gerechnet wird
const RS_SECHS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** hat mit Strom zu tun: Bauteile, Lampen, der Redstoneblock, Türen */
const rsBlock = id => !!(blocks[id] && blocks[id].rs) || isDoor(id);
/** braucht Halt: liegt auf dem Boden oder hängt an einer Wand */
const rsHaengt = id => isStaub(id) || isPlatte(id) || isRSFackel(id) || isHebel(id) || isKnopf(id) || isVerstaerker(id) || isKomparator(id);
/** Ziele, zu denen eine Leitung neben sich einen Arm ausstreckt */
const rsZiel = id => isRSFackel(id) || isHebel(id) || isKnopf(id) || isPlatte(id) || isLampe(id) || id === B.REDSTONEBLOCK || isDoor(id)
  || isVerstaerker(id) || isKolben(id) || isBeobachter(id) || isKomparator(id) || isTagessensor(id) || id === B.ZIELBLOCK || id === B.ZIELBLOCK + 1
  || id === B.SKULK || id === B.SKULK + 1 || isFallentruhe(id);
/** gibt Strom in alle Richtungen, solange an — wie ein Redstoneblock */
const rsRundum = id => id === B.REDSTONEBLOCK || (isTagessensor(id) && tagAn(id)) || id === B.ZIELBLOCK + 1 || id === B.SKULK + 1 || id === B.FALLENTRUHE + 1;
const RS_HOLZKNOPF_ZEIT = 1.5;            // ein Holzknopf bleibt länger gedrückt
const RS_PULS = 0.1;                      // Beobachter: zwei Ticks an
const RS_TRICHTER_TAKT = 0.4;             // ein Trichter reicht alle acht Ticks einen Gegenstand weiter
const RS_SPENDER_VERZUG = 0.2;            // vier Ticks nach dem Strom spuckt der Spender
/** Kolben: was sich nicht schieben lässt (Truhen, Öfen und Plattenspieler mit ihrem Inhalt, Türen, Grundgestein, ausgefahrene Kolben) */
const kolbenFest = id => id === B.BEDROCK || isKopf(id) || (isKolben(id) && kolbenAus(id)) || behaelterGroesse(id) > 0 || id === B.FURNACE
  || id === B.FURNACE_LIT || id === B.JUKEBOX || id === B.JUKEBOX_VOLL || isDoor(id) || id === B.OBSIDIAN || !!(blocks[id] && blocks[id].hardness < 0 && !isWasser(id));
const klebt = id => id === B.SCHLEIMBLOCK || id === B.HONIGBLOCK;
/** … und was dabei zerbricht und herausfällt: alles, was man nicht anstoßen kann, dazu Betten und Kakteen */
const kolbenBricht = id => id !== B.AIR && !isWasser(id) && (SOL[id] !== 1 || isBett(id) || id === B.CACTUS);
const RS_KOLBEN_MAX = 12;                 // so viele Blöcke schiebt ein Kolben höchstens
/** der Block, an dem ein Bauteil mit Anbau a hängt (0: darunter) */
function rsStuetze(x, y, z, a){ return a === 0 ? [x, y - 1, z] : [x + SEITE[a - 1][0], y, z + SEITE[a - 1][1]]; }
/** Seite (Nummer in SEITE) für einen Schritt dx, dz */
const rsSeite = (dx, dz) => dx === 1 ? 0 : dx === -1 ? 1 : dz === 1 ? 2 : 3;

/** Verbindungen einer Leitung bei x, y, z, je Seite (Reihenfolge wie SEITE):
    0 keine, 1 eben (Leitung oder Bauteil), 2 hinauf (die Leitung liegt auf dem
    Nachbarblock, man sieht sie an seiner Wand hochlaufen), 3 hinunter (neben
    der Kante eine Stufe tiefer). Ein Block über der Leitung versperrt den Weg
    hinauf, ein Block neben ihr den hinunter. get(x, y, z) gibt die Blocknummer. */
function staubVerbindungen(get, x, y, z, out){
  const deckeZu = OPQ[get(x, y + 1, z)] === 1;
  for(let s = 0; s < 4; s++){
    const nx = x + SEITE[s][0], nz = z + SEITE[s][1], n = get(nx, y, nz);
    let v = 0;
    // ein Verstärker nur von vorn und hinten
    if(isStaub(n) || (rsZiel(n) && (!isVerstaerker(n) || (vRichtung(n) >> 1) === (s >> 1))
      && (!isBeobachter(n) || (RICHTUNG6[beobRichtung(n)][0] === SEITE[s][0] && RICHTUNG6[beobRichtung(n)][2] === SEITE[s][1])))) v = 1;
    else if(OPQ[n] === 1){ if(!deckeZu && isStaub(get(nx, y + 1, nz))) v = 2; }
    else if(isStaub(get(nx, y - 1, nz))) v = 3;
    out[s] = v;
  }
  return out;
}
/** Wohin eine Leitung zeigt, als Bits (1 +X, 2 −X, 4 +Z, 8 −Z): wohin sie
    verbunden ist; mit nur einer Verbindung auch geradeaus weiter, ganz ohne
    in alle vier Richtungen. Wohin sie zeigt, lädt sie Blöcke und Bauteile. */
function staubRichtungen(v){
  let m = 0, n = 0, s1 = 0;
  for(let s = 0; s < 4; s++) if(v[s]){ m |= 1 << s; n++; s1 = s; }
  if(n === 0) return 15;
  if(n === 1) m |= 1 << (s1 ^ 1);
  return m;
}

class Schaltung{
  constructor(world){
    this.w = world;
    this.naechste = new Set();            // im nächsten Schritt zu prüfen
    this.t = 0;
    this.jetzt = 0;                       // Uhr der Schaltung, Sekunden
    this.fackeln = new Map();             // Ort → wann die Fackel umschalten darf
    this.knoepfe = new Map();             // Ort → wann der Knopf herausspringt
    this.platten = new Map();             // Ort → wann zuletzt jemand darauf stand
    this.tueren = new Map();              // Ort der unteren Türhälfte → Strom beim letzten Mal
    this.schaltzeiten = new Map();        // Fackel → wann sie zuletzt ausging (fürs Ausbrennen)
    this.verstaerker = new Map();         // Ort → { bis, an }: so schaltet der Verstärker nach seiner Verzögerung
    this._plattenT = 0;
    this.beob = new Map();                // Beobachter → { an, bis }: Puls an, dann wieder aus
    this.pulse = new Map();               // Zielblock, Skulk-Sensor → wann er wieder ausgeht
    this.spender = new Map();             // Spender, Werfer → wann sie auswerfen
    this.komp = new Map();                // Komparator → { bis, an }
    this.noten = new Map();               // Notenblock → hatte er Strom (nur der Anstoß spielt)
    this.falltueren = new Map();          // Falltür → Strom beim letzten Mal
    this.trichter = new Set();            // Orte der Trichter
    this.sensoren = new Set();            // Orte der Tageslichtsensoren
    this.skulks = new Set();              // Orte der Skulk-Sensoren
    this._trichterT = 0; this._tagT = 0;
    this.aenderungen = 0;                 // gezählt, für Tests
    // vom Spiel gesetzt:
    this.abfallen = null;                 // (x, y, z, id): ohne Halt heruntergefallen
    this.wesen = null;                    // () → [{ x, y, z, w }]: wer auf Druckplatten treten kann
    this.tuer = null;                     // (x, y, z, offen) → ob es ging
    this.klang = null;                    // (art, x, y, z)
    this.schieben = null;                 // (zellen, dx, dy, dz): Wesen in diesen Zellen mitschieben
    this.tag = null;                      // () → ist es Tag (für Tageslichtsensoren)?
    this.noteSpielen = null;              // (x, y, z, ton): ein Notenblock bekommt Strom
    this.tntZuenden = null;               // (x, y, z): TNT unter Strom
    this.auswerfen = null;                // (x, y, z, id): ein Spender oder Werfer wird ausgelöst
    this.trichterSchritt = null;          // (x, y, z, id): ein Trichter reicht weiter
    this._v = new Uint8Array(4);
    this._get = (x, y, z) => this.w.getBlock(x, y, z);
  }

  /** nach einer Blockänderung bei x, y, z: was in der Nähe mit Strom zu tun
      hat, im nächsten Schritt prüfen */
  melden(x, y, z, alt, neu){
    // Beobachter sehen jede Änderung vor ihrem Gesicht — auch die, die mit Strom nichts zu tun hat
    if(alt !== neu) for(let r = 0; r < 6; r++){
      const d = RICHTUNG6[r], bx = x - d[0], by = y - d[1], bz = z - d[2];
      if(this.w.getBlock(bx, by, bz) === beobId(r, false) || this.w.getBlock(bx, by, bz) === beobId(r, true)) this.beobAusloesen(bx, by, bz);
    }
    const k = wKey(x, y, z);
    if(isTrichter(neu)) this.trichter.add(k); else if(isTrichter(alt)) this.trichter.delete(k);
    if(isTagessensor(neu)) this.sensoren.add(k); else if(isTagessensor(alt)) this.sensoren.delete(k);
    if(neu === B.SKULK || neu === B.SKULK + 1) this.skulks.add(k); else if(alt === B.SKULK || alt === B.SKULK + 1) this.skulks.delete(k);
    if(!rsBlock(alt) && !rsBlock(neu) && OPQ[alt] === OPQ[neu]) return;
    for(let dy = -2; dy <= 2; dy++){
      const yy = y + dy;
      if(yy < 1 || yy >= WH) continue;
      const r = 2 - Math.abs(dy);
      for(let dx = -r; dx <= r; dx++){
        const rz = r - Math.abs(dx);
        for(let dz = -rz; dz <= rz; dz++) this.naechste.add(wKey(x + dx, yy, z + dz));
      }
    }
  }
  tick(dt){
    this.t += dt;
    for(let n = 0; this.t >= RS_TAKT && n < 3; n++){ this.t -= RS_TAKT; this.jetzt += RS_TAKT; this.schritt(); }
    if(this.t > RS_TAKT) this.t = 0;        // nie mehr als drei Schritte auf einmal nachholen
  }
  /** der Block und seine Nachbarn liegen in erzeugten Chunks */
  geladen(x, z){
    const w = this.w;
    for(const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]){
      const c = w.chunks.get(ckey((x + dx) >> 4, (z + dz) >> 4));
      if(!c || c.state < 1) return false;
    }
    return true;
  }
  setzen(x, y, z, id){
    if(this.w.setBlock(x, y, z, id)){ this.aenderungen++; return true; }
    return false;
  }

  schritt(){
    const w = this.w, jetzt = this.jetzt;
    // Knöpfe springen heraus
    for(const [k, bis] of this.knoepfe){
      if(jetzt < bis - 1e-6) continue;
      this.knoepfe.delete(k);
      const [x, y, z] = wOrt(k), id = w.getBlock(x, y, z);
      if(isKnopf(id) && rsAn(id)){ this.setzen(x, y, z, knopfUm(id, false)); if(this.klang) this.klang('aus', x, y, z); }
    }
    // Druckplatten: zehnmal je Sekunde nachsehen, wer darauf steht
    if((this._plattenT += RS_TAKT) >= 0.1 - 1e-6){ this._plattenT = 0; this.plattenPruefen(); }
    // Fackeln, deren Augenblick um ist
    for(const [k, bis] of this.fackeln){
      if(jetzt < bis - 1e-6) continue;
      this.fackeln.delete(k);
      const [x, y, z] = wOrt(k);
      this.fackelSchalten(x, y, z, k);
    }
    // Verstärker, deren Verzögerung um ist: schalten, wie es beim Anstoßen hieß —
    // so wird auch ein kurzer Puls so lang wie die Verzögerung
    for(const [k, v] of this.verstaerker){
      if(jetzt < v.bis - 1e-6) continue;
      this.verstaerker.delete(k);
      const [x, y, z] = wOrt(k), id = w.getBlock(x, y, z);
      if(isVerstaerker(id) && rsAn(id) !== v.an) this.setzen(x, y, z, verstaerkerId(v.an, vStufe(id), vRichtung(id)));
      this.naechste.add(k);
    }
    // Beobachter: Puls an, zwei Ticks später wieder aus
    for(const [k, b] of this.beob){
      if(jetzt < b.bis - 1e-6) continue;
      const [x, y, z] = wOrt(k), id = w.getBlock(x, y, z);
      if(!isBeobachter(id)){ this.beob.delete(k); continue; }
      if(b.an){ this.setzen(x, y, z, beobId(beobRichtung(id), true)); b.an = false; b.bis = jetzt + RS_PULS; }
      else { this.setzen(x, y, z, beobId(beobRichtung(id), false)); this.beob.delete(k); }
    }
    // Zielblock und Skulk-Sensor gehen nach ihrem Puls aus
    for(const [k, bis] of this.pulse){
      if(jetzt < bis - 1e-6) continue;
      this.pulse.delete(k);
      const [x, y, z] = wOrt(k), id = w.getBlock(x, y, z);
      if(id === B.ZIELBLOCK + 1) this.setzen(x, y, z, B.ZIELBLOCK);
      if(id === B.SKULK + 1) this.setzen(x, y, z, B.SKULK);
    }
    for(const [k, bis] of this.spender){
      if(jetzt < bis - 1e-6) continue;
      this.spender.delete(k);
      const [x, y, z] = wOrt(k), id = w.getBlock(x, y, z);
      if((isSpender(id) || isWerfer(id)) && this.auswerfen) this.auswerfen(x, y, z, id);
    }
    for(const [k, v] of this.komp){
      if(jetzt < v.bis - 1e-6) continue;
      this.komp.delete(k);
      const [x, y, z] = wOrt(k), id = w.getBlock(x, y, z);
      if(isKomparator(id) && kompAn(id) !== v.an) this.setzen(x, y, z, kompId(kompRichtung(id), kompMinus(id), v.an));
      this.naechste.add(k);
    }
    // Tageslichtsensoren: jede Sekunde nachsehen, Trichter alle acht Ticks
    if((this._tagT += RS_TAKT) >= 1 - 1e-6){ this._tagT = 0; for(const k of this.sensoren) this.naechste.add(k); }
    if((this._trichterT += RS_TAKT) >= RS_TRICHTER_TAKT - 1e-6){
      this._trichterT = 0;
      for(const k of this.trichter){
        const [x, y, z] = wOrt(k), id = w.getBlock(x, y, z);
        if(!isTrichter(id)){ if(this.geladen(x, z)) this.trichter.delete(k); continue; }
        if(this.trichterSchritt && this.geladen(x, z) && !this.hatStrom(x, y, z)) this.trichterSchritt(x, y, z, id);
      }
    }
    if(!this.naechste.size) return;
    const liste = this.naechste;
    this.naechste = new Set();
    // erst die Leitungen, dann was an ihnen hängt — das sieht so schon die neuen Stufen
    const staub = [];
    for(const k of liste){
      const [x, y, z] = wOrt(k);
      if(isStaub(w.getBlock(x, y, z))) staub.push(k);
    }
    if(staub.length) this.leitungenRechnen(staub);
    for(const k of liste){
      const [x, y, z] = wOrt(k);
      if(this.geladen(x, z)) this.pruefen(x, y, z, k);
    }
  }

  /** ein Block: hält er noch, und stimmt sein Zustand? */
  pruefen(x, y, z, k){
    const w = this.w, id = w.getBlock(x, y, z);
    if(id === B.AIR || !rsBlock(id)) return;
    if(rsHaengt(id) && !this.haelt(x, y, z, id)){
      this.setzen(x, y, z, B.AIR);
      if(this.abfallen) this.abfallen(x, y, z, id);
      return;
    }
    if(isRSFackel(id)){
      if(this.fackelSoll(x, y, z, id) !== rsAn(id) && !this.fackeln.has(k)) this.fackeln.set(k, this.jetzt + RS_FACKEL_VERZUG);
    } else if(isLampe(id)){
      const an = this.hatStrom(x, y, z);
      if(an !== rsAn(id)) this.setzen(x, y, z, an ? B.RS_LAMPE + 1 : B.RS_LAMPE);
    } else if(isDoor(id)){
      this.tuerPruefen(x, y, z, id);
    } else if(isKnopf(id) && rsAn(id)){
      if(!this.knoepfe.has(k)) this.knoepfe.set(k, this.jetzt + (isHolzknopf(id) ? RS_HOLZKNOPF_ZEIT : RS_KNOPF_ZEIT));
    } else if(isPlatte(id) && platteGedrueckt(id)){
      if(!this.platten.has(k)) this.platten.set(k, this.jetzt);
    } else if(isBeobachter(id)){
      if(beobAn(id) && !this.beob.has(k)) this.beob.set(k, { an:false, bis:this.jetzt + RS_PULS });     // nach dem Laden: aus
    } else if(isTagessensor(id)){
      if(this.tag){ const soll = this.tag(x, y, z) !== tagUmgekehrt(id); if(soll !== tagAn(id)) this.setzen(x, y, z, tagId(soll, tagUmgekehrt(id))); }
    } else if(id === B.ZIELBLOCK + 1 || id === B.SKULK + 1){
      if(!this.pulse.has(k)) this.pulse.set(k, this.jetzt + 1);
    } else if(isNotenblock(id)){
      const strom = this.hatStrom(x, y, z);
      if(strom && !this.noten.get(k) && this.noteSpielen) this.noteSpielen(x, y, z, id - B.NOTENBLOCK);
      if(strom) this.noten.set(k, true); else this.noten.delete(k);
    } else if(id === B.TNT){
      if(this.hatStrom(x, y, z) && this.tntZuenden) this.tntZuenden(x, y, z);
    } else if(isFalltuer(id)){
      const strom = this.hatStrom(x, y, z);
      if(strom !== (this.falltueren.get(k) || false)){
        const f = falltuerInfo(id);
        if(f.offen !== strom){ this.setzen(x, y, z, falltuerId(falltuerBasis(id), f.seite, strom, f.oben)); if(this.klang) this.klang(strom ? 'an' : 'aus', x, y, z); }
        if(strom) this.falltueren.set(k, true); else this.falltueren.delete(k);
      }
    } else if(isSpender(id) || isWerfer(id)){
      // wie beim Vorbild zählt auch Strom am Block darüber
      const strom = this.hatStrom(x, y, z) || this.hatStrom(x, y + 1, z);
      if(strom && !auswurfAus(id)){ this.setzen(x, y, z, auswurfId(auswurfBasis(id), auswurfRichtung(id), true)); this.spender.set(k, this.jetzt + RS_SPENDER_VERZUG); }
      else if(!strom && auswurfAus(id)) this.setzen(x, y, z, auswurfId(auswurfBasis(id), auswurfRichtung(id), false));
    } else if(isKomparator(id)){
      const soll = this.kompSoll(x, y, z, id);
      if(soll !== kompAn(id) && !this.komp.has(k)) this.komp.set(k, { bis: this.jetzt + 0.1, an: soll });
    } else if(isKupferleuchte(id)){
      const strom = this.hatStrom(x, y, z), an = kupferAn(id), gesp = kupferGespeist(id);
      if(strom && !gesp) this.setzen(x, y, z, kupferId(!an, true));
      else if(!strom && gesp) this.setzen(x, y, z, kupferId(an, false));
    } else if(isVerstaerker(id)){
      const ein = this.vEingang(x, y, z, vRichtung(id));
      if(ein !== rsAn(id) && !this.verstaerker.has(k)) this.verstaerker.set(k, { bis: this.jetzt + vStufe(id)*0.1, an: ein });
    } else if(isKolben(id)){
      this.kolbenPruefen(x, y, z, id);
    } else if(isKopf(id)){
      // ein Kopf ohne seinen Kolben verschwindet
      const [dx, dy, dz] = RICHTUNG6[kopfRichtung(id)], b = w.getBlock(x - dx, y - dy, z - dz);
      if(!(isKolben(b) && kolbenAus(b) && kolbenRichtung(b) === kopfRichtung(id))) this.setzen(x, y, z, B.AIR);
    }
  }
  /** liegt oder hängt das Bauteil noch an etwas? */
  haelt(x, y, z, id){
    const w = this.w;
    if(isStaub(id)) return OPQ[w.getBlock(x, y - 1, z)] === 1;
    if(isPlatte(id) || isVerstaerker(id) || isKomparator(id)) return SOL[w.getBlock(x, y - 1, z)] === 1;
    const a = rsAnbau(id), [sx, sy, sz] = rsStuetze(x, y, z, a), s = w.getBlock(sx, sy, sz);
    return a === 0 ? SOL[s] === 1 : OPQ[s] === 1;
  }

  /* — Strom — */
  /** gibt das Bauteil n bei nx, ny, nz Strom an den Nachbarn zx, zy, zz ab? (Leitungen nicht) */
  quelleZu(n, nx, ny, nz, zx, zy, zz){
    if(rsRundum(n)) return true;
    if(isBeobachter(n)){
      if(!beobAn(n)) return false;
      const d = RICHTUNG6[beobRichtung(n)];
      return nx - d[0] === zx && ny - d[1] === zy && nz - d[2] === zz;                     // nur nach hinten
    }
    if(isKomparator(n)){
      const r = kompRichtung(n);
      return kompAn(n) && nx + SEITE[r][0] === zx && nz + SEITE[r][1] === zz && ny === zy;
    }
    if(isRSFackel(n)){
      if(!rsAn(n)) return false;
      const [sx, sy, sz] = rsStuetze(nx, ny, nz, rsAnbau(n));
      return sx !== zx || sy !== zy || sz !== zz;        // nur nicht in den eigenen Block
    }
    if(isHebel(n) || isKnopf(n) || isPlatte(n)) return rsAn(n);
    if(isVerstaerker(n)){
      const r = vRichtung(n);
      return rsAn(n) && nx + SEITE[r][0] === zx && nz + SEITE[r][1] === zz && ny === zy;      // nur nach vorn
    }
    return false;
  }
  /** Block voll unter Strom: ein Hebel oder Knopf hängt daran, eine Platte liegt
      darauf, eine Fackel brennt darunter */
  stark(bx, by, bz){
    const w = this.w;
    for(const [dx, dy, dz] of RS_SECHS){
      const nx = bx + dx, ny = by + dy, nz = bz + dz, n = w.getBlock(nx, ny, nz);
      if(!rsAn(n)) continue;
      if(isHebel(n) || isKnopf(n)){
        const [sx, sy, sz] = rsStuetze(nx, ny, nz, rsAnbau(n));
        if(sx === bx && sy === by && sz === bz) return true;
      } else if(isPlatte(n)){ if(dy === 1) return true; }
      else if(isRSFackel(n)){ if(dy === -1) return true; }
      else if(isVerstaerker(n)){ const r = vRichtung(n); if(dy === 0 && nx + SEITE[r][0] === bx && nz + SEITE[r][1] === bz) return true; }
      else if(isKomparator(n)){ const r = kompRichtung(n); if(dy === 0 && nx + SEITE[r][0] === bx && nz + SEITE[r][1] === bz) return true; }
      else if(isBeobachter(n)){ const d = RICHTUNG6[beobRichtung(n)]; if(nx - d[0] === bx && ny - d[1] === by && nz - d[2] === bz) return true; }
      else if(n === B.FALLENTRUHE + 1){ if(dy === 1) return true; }
    }
    return false;
  }
  /** Block schwach geladen: eine Leitung mit Strom liegt darauf oder zeigt hinein */
  schwach(bx, by, bz){
    const w = this.w;
    const o = w.getBlock(bx, by + 1, bz);
    if(isStaub(o) && staubLadung(o) > 0) return true;
    for(let s = 0; s < 4; s++){
      const nx = bx - SEITE[s][0], nz = bz - SEITE[s][1], n = w.getBlock(nx, by, nz);
      if(isStaub(n) && staubLadung(n) > 0 && (staubRichtungen(staubVerbindungen(this._get, nx, by, nz, this._v)) & (1 << s))) return true;
    }
    return false;
  }
  /** steht der Block bei x, y, z unter Strom — so, dass eine Fackel an ihm ausgeht? */
  blockGeladen(x, y, z){
    const id = this.w.getBlock(x, y, z);
    if(rsRundum(id)) return true;
    return OPQ[id] === 1 && (this.stark(x, y, z) || this.schwach(x, y, z));
  }
  /** Strom für ein Bauteil bei x, y, z (Lampe, Tür): von einer Quelle daneben,
      von einer Leitung, die darauf liegt oder hineinzeigt, oder von einem
      geladenen Block daneben */
  hatStrom(x, y, z, ohne){
    const w = this.w;
    for(const [dx, dy, dz] of RS_SECHS){
      if(ohne && dx === ohne[0] && dy === ohne[1] && dz === ohne[2]) continue;        // (Kolben: nicht von vorn)
      const nx = x + dx, ny = y + dy, nz = z + dz, n = w.getBlock(nx, ny, nz);
      if(this.quelleZu(n, nx, ny, nz, x, y, z)) return true;
      if(isStaub(n)){
        if(staubLadung(n) === 0 || dy < 0) continue;
        if(dy === 1) return true;
        if(staubRichtungen(staubVerbindungen(this._get, nx, ny, nz, this._v)) & (1 << rsSeite(-dx, -dz))) return true;
        continue;
      }
      if(OPQ[n] === 1 && (this.stark(nx, ny, nz) || this.schwach(nx, ny, nz))) return true;
    }
    return false;
  }
  /** Strom, der von außen in eine Leitung fließt: 15 oder nichts */
  einspeisung(x, y, z){
    const w = this.w;
    for(const [dx, dy, dz] of RS_SECHS){
      const nx = x + dx, ny = y + dy, nz = z + dz, n = w.getBlock(nx, ny, nz);
      if(this.quelleZu(n, nx, ny, nz, x, y, z)) return 15;
      if(OPQ[n] === 1 && this.stark(nx, ny, nz)) return 15;
    }
    return 0;
  }

  /** Leitungen, die bei den Orten start liegen: jede ganz einsammeln, Strom
      von außen einspeisen und nach innen mit jedem Block eine Stufe schwächer
      werden lassen — der stärkste Weg gewinnt */
  leitungenRechnen(start){
    const get = this._get, v = this._v, fertig = new Set();
    for(const k0 of start){
      if(fertig.has(k0)) continue;
      const netz = new Map(), stapel = [k0];
      let offen = false;
      while(stapel.length && netz.size < RS_NETZ_MAX){
        const k = stapel.pop();
        if(netz.has(k)) continue;
        const [x, y, z] = wOrt(k), id = get(x, y, z);
        if(!isStaub(id)) continue;
        if(!this.geladen(x, z)){ offen = true; continue; }
        const nb = [];
        staubVerbindungen(get, x, y, z, v);
        for(let s = 0; s < 4; s++){
          if(!v[s]) continue;
          const nx = x + SEITE[s][0], nz = z + SEITE[s][1], ny = v[s] === 2 ? y + 1 : v[s] === 3 ? y - 1 : y;
          if(v[s] === 1 && !isStaub(get(nx, ny, nz))) continue;      // ein Bauteil, keine Leitung
          const nk = wKey(nx, ny, nz);
          nb.push(nk);
          if(!netz.has(nk)) stapel.push(nk);
        }
        netz.set(k, { x, y, z, id, nb });
      }
      for(const k of netz.keys()) fertig.add(k);
      // reicht die Leitung in einen Chunk, der noch nicht da ist, wartet sie, bis er kommt
      if(offen || stapel.length) continue;
      const stufe = new Map(), eimer = [];
      for(let l = 0; l <= 15; l++) eimer.push([]);
      for(const [k, d] of netz){
        const q = this.einspeisung(d.x, d.y, d.z);
        stufe.set(k, q);
        if(q > 0) eimer[q].push(k);
      }
      for(let l = 15; l > 1; l--){
        for(const k of eimer[l]){
          if(stufe.get(k) !== l) continue;
          for(const nk of netz.get(k).nb){
            const s = stufe.get(nk);
            if(s !== undefined && s < l - 1){ stufe.set(nk, l - 1); eimer[l - 1].push(nk); }
          }
        }
      }
      for(const [k, d] of netz){
        const l = stufe.get(k);
        if(staubLadung(d.id) !== l) this.setzen(d.x, d.y, d.z, staubId(l));
      }
    }
  }

  /* — Fackeln — */
  fackelSoll(x, y, z, id){
    const [sx, sy, sz] = rsStuetze(x, y, z, rsAnbau(id));
    return !this.blockGeladen(sx, sy, sz);
  }
  /** ausgegangen (neu) und nachsehen, ob sie zu oft ausging */
  ausgebrannt(k, neu){
    let z = this.schaltzeiten.get(k) || [];
    z = z.filter(t => this.jetzt - t <= 3);
    if(neu) z.push(this.jetzt);
    if(z.length) this.schaltzeiten.set(k, z); else this.schaltzeiten.delete(k);
    return z.length >= RS_AUSBRENNEN;
  }
  fackelSchalten(x, y, z, k){
    const id = this.w.getBlock(x, y, z);
    if(!isRSFackel(id)) return;
    const soll = this.fackelSoll(x, y, z, id), a = rsAnbau(id);
    if(rsAn(id)){
      if(soll) return;
      this.setzen(x, y, z, rsFackel(false, a));
      if(this.ausgebrannt(k, true)){
        if(this.klang) this.klang('zischen', x, y, z);
        this.fackeln.set(k, this.jetzt + RS_ABKUEHLEN);        // danach noch einmal versuchen
      }
    } else if(soll && !this.ausgebrannt(k, false)) this.setzen(x, y, z, rsFackel(true, a));
  }

  /* — Türen — */
  tuerPruefen(x, y, z, id){
    const w = this.w, y0 = doorInfo(id).oben ? y - 1 : y, unten = w.getBlock(x, y0, z);
    if(!isDoor(unten) || doorInfo(unten).oben) return;
    const k = wKey(x, y0, z);
    const strom = this.hatStrom(x, y0, z) || this.hatStrom(x, y0 + 1, z);
    if(strom === (this.tueren.get(k) || false)) return;
    if(doorInfo(unten).offen !== strom && this.tuer && !this.tuer(x, y0, z, strom)){
      this.naechste.add(k);                 // steht jemand im Weg: gleich noch einmal
      return;
    }
    if(strom) this.tueren.set(k, true); else this.tueren.delete(k);
  }

  /* — Verstärker — */
  /** kommt von hinten Strom? Von einer Quelle, einer Leitung oder einem geladenen Block */
  vEingang(x, y, z, r){
    const w = this.w, bx = x - SEITE[r][0], bz = z - SEITE[r][1], n = w.getBlock(bx, y, bz);
    if(this.quelleZu(n, bx, y, bz, x, y, z)) return true;
    if(isStaub(n)) return staubLadung(n) > 0;
    return OPQ[n] === 1 && (this.stark(bx, y, bz) || this.schwach(bx, y, bz));
  }

  /* — Kolben — */
  kolbenPruefen(x, y, z, id){
    const w = this.w, r = kolbenRichtung(id), kl = kolbenKlebrig(id), d = RICHTUNG6[r];
    if(kolbenAus(id) && w.getBlock(x + d[0], y + d[1], z + d[2]) !== kopfId(kl, r)){
      this.setzen(x, y, z, kolbenId(kl, false, r));             // Kopf fehlt: eingefahren
      return;
    }
    const strom = this.hatStrom(x, y, z, d);
    if(strom && !kolbenAus(id)) this.ausfahren(x, y, z, r, kl);
    else if(!strom && kolbenAus(id)) this.einfahren(x, y, z, r, kl);
  }
  /** Was ein Kolben bewegt, wenn der Block bei sx, sy, sz in Richtung d rücken
      soll: die Reihe davor und alles, was an Schleim- und Honigblöcken klebt
      (Honig klebt nicht an Schleim). kx, ky, kz: der Kolben selbst — dorthin
      darf nichts. → { bewegen, brechen } oder null, wenn es nicht geht */
  struktur(sx, sy, sz, d, kx, ky, kz){
    const w = this.w, bewegen = new Map(), brechen = new Map(), stapel = [[sx, sy, sz, true]];
    while(stapel.length){
      const [x, y, z, vorn] = stapel.pop(), k = wKey(x, y, z);
      if(bewegen.has(k) || brechen.has(k)) continue;
      if(x === kx && y === ky && z === kz){ if(vorn) return null; continue; }      // am Kolben selbst klebt nichts
      if(y < 1 || y >= WH - 1 || !this.geladen(x, z)){ if(vorn) return null; continue; }
      const b = w.getBlock(x, y, z);
      if(b === B.AIR || isWasser(b)) continue;
      if(kolbenBricht(b)){ if(vorn) brechen.set(k, [x, y, z, b]); continue; }
      if(kolbenFest(b)){ if(vorn) return null; continue; }
      bewegen.set(k, [x, y, z, b]);
      if(bewegen.size > RS_KOLBEN_MAX) return null;
      stapel.push([x + d[0], y + d[1], z + d[2], true]);
      if(klebt(b)) for(const e of RS_SECHS){
        const nx = x + e[0], ny = y + e[1], nz = z + e[2], n = w.getBlock(nx, ny, nz);
        if((b === B.SCHLEIMBLOCK && n === B.HONIGBLOCK) || (b === B.HONIGBLOCK && n === B.SCHLEIMBLOCK)) continue;
        stapel.push([nx, ny, nz, false]);
      }
    }
    for(const k of bewegen.keys()) brechen.delete(k);
    return { bewegen: [...bewegen.values()], brechen: [...brechen.values()] };
  }
  /** die Blöcke einer Struktur um d verschieben; gibt die Zellen zurück, in die sie rückten */
  verschieben(st, d){
    for(const [x, y, z, b] of st.brechen){ this.setzen(x, y, z, B.AIR); if(this.abfallen) this.abfallen(x, y, z, b); }
    const ziele = new Set(st.bewegen.map(([x, y, z]) => wKey(x + d[0], y + d[1], z + d[2])));
    for(const [x, y, z] of st.bewegen) if(!ziele.has(wKey(x, y, z))) this.setzen(x, y, z, B.AIR);
    const zellen = [];
    for(const [x, y, z, b] of st.bewegen){ this.setzen(x + d[0], y + d[1], z + d[2], b); zellen.push([x + d[0], y + d[1], z + d[2]]); }
    return zellen;
  }
  /** ausfahren: was davor steht, ein Stück weiterschieben (höchstens zwölf
      Blöcke, mit allem, was an Schleim klebt); was im Weg zerbricht, fällt
      heraus. Geht es nicht, bleibt der Kolben drin. */
  ausfahren(x, y, z, r, kl){
    const d = RICHTUNG6[r], hx = x + d[0], hy = y + d[1], hz = z + d[2];
    if(hy < 1 || hy >= WH - 1 || !this.geladen(hx, hz)) return false;
    const st = this.struktur(hx, hy, hz, d, x, y, z);
    if(!st) return false;
    const zellen = this.verschieben(st, d);
    this.setzen(x, y, z, kolbenId(kl, true, r));
    this.setzen(hx, hy, hz, kopfId(kl, r));
    zellen.push([hx, hy, hz]);
    if(this.schieben) this.schieben(zellen, d[0], d[1], d[2]);
    if(this.klang) this.klang('raus', x, y, z);
    return true;
  }
  /** einfahren: der Kopf verschwindet; ein klebriger zieht den Block davor mit (und was an ihm klebt) */
  einfahren(x, y, z, r, kl){
    const w = this.w, d = RICHTUNG6[r], hx = x + d[0], hy = y + d[1], hz = z + d[2];
    if(isKopf(w.getBlock(hx, hy, hz))) this.setzen(hx, hy, hz, B.AIR);
    this.setzen(x, y, z, kolbenId(kl, false, r));
    if(kl){
      const fx = hx + d[0], fy = hy + d[1], fz = hz + d[2];
      if(fy >= 1 && fy < WH && this.geladen(fx, fz)){
        const b = w.getBlock(fx, fy, fz);
        if(b !== B.AIR && !isWasser(b) && !kolbenFest(b) && !kolbenBricht(b) && w.getBlock(hx, hy, hz) === B.AIR){
          const zurueck = [-d[0], -d[1], -d[2]], st = this.struktur(fx, fy, fz, zurueck, x, y, z);
          if(st){ const zellen = this.verschieben(st, zurueck); if(this.schieben) this.schieben(zellen, zurueck[0], zurueck[1], zurueck[2]); }
        }
      }
    }
    if(this.klang) this.klang('rein', x, y, z);
  }

  /* — Beobachter, Komparator, Zielblock, Skulk-Sensor — */
  beobAusloesen(x, y, z){
    const k = wKey(x, y, z);
    if(!this.beob.has(k)) this.beob.set(k, { an:true, bis:this.jetzt + RS_PULS });
  }
  /** Strom von der Seite s (Nummer in SEITE) in den Block bei x, y, z, wie ihn ein Komparator dort sieht */
  seitenStrom(x, y, z, s){
    const w = this.w, nx = x + SEITE[s][0], nz = z + SEITE[s][1], n = w.getBlock(nx, y, nz);
    if(this.quelleZu(n, nx, y, nz, x, y, z)) return true;
    if(isStaub(n)) return staubLadung(n) > 0;
    return false;
  }
  /** soll der Komparator an sein? Hinten ein Behälter mit Inhalt oder Strom;
      vergleichend genügt das, subtrahierend darf von der Seite keiner kommen */
  kompSoll(x, y, z, id){
    const w = this.w, r = kompRichtung(id), hs = r ^ 1, bx = x + SEITE[hs][0], bz = z + SEITE[hs][1], b = w.getBlock(bx, y, bz);
    let hinten;
    if(behaelterGroesse(b) > 0){ const t = w.chests.get(bx + ',' + y + ',' + bz); hinten = !!(t && t.some(Boolean)); }
    else if(b === B.FURNACE || b === B.FURNACE_LIT){ const f = w.furnaces.get(bx + ',' + y + ',' + bz); hinten = !!(f && (f.in || f.fuel || f.out)); }
    else if(b === B.JUKEBOX_VOLL) hinten = true;
    else hinten = this.vEingang(x, y, z, r);
    if(!hinten) return false;
    if(!kompMinus(id)) return true;
    const quer = r < 2 ? [2, 3] : [0, 1];
    return !quer.some(s => this.seitenStrom(x, y, z, s));
  }
  /** Inhalt eines Behälters hat sich geändert: Komparatoren daneben neu fragen */
  inhalt(x, y, z){ for(const [dx, dz] of SEITE) this.naechste.add(wKey(x + dx, y, z + dz)); }
  /** ein Geschoss trifft einen Zielblock */
  zielTreffer(x, y, z){
    if(this.w.getBlock(x, y, z) !== B.ZIELBLOCK) return;
    this.setzen(x, y, z, B.ZIELBLOCK + 1);
    this.pulse.set(wKey(x, y, z), this.jetzt + 1);
  }
  /** Erschütterung (Schritte, Abbauen, Setzen): Skulk-Sensoren in acht Blöcken Umkreis schlagen an */
  vibration(x, y, z){
    for(const k of this.skulks){
      const [sx, sy, sz] = wOrt(k);
      if((sx - x)*(sx - x) + (sy - y)*(sy - y) + (sz - z)*(sz - z) > 64) continue;
      if(this.w.getBlock(sx, sy, sz) !== B.SKULK) continue;
      this.setzen(sx, sy, sz, B.SKULK + 1);
      this.pulse.set(k, this.jetzt + 1.5);
    }
  }

  /* — Druckplatten — */
  plattenPruefen(){
    const w = this.w, drauf = new Set();
    for(const e of (this.wesen ? this.wesen() : [])){
      const by = Math.floor(e.y);
      if(e.y - by > 0.3) continue;              // zu hoch, etwa im Sprung
      const hw = (e.w || 0.6)/2 - 0.0625;
      for(let bx = Math.floor(e.x - hw); bx <= Math.floor(e.x + hw); bx++)
        for(let bz = Math.floor(e.z - hw); bz <= Math.floor(e.z + hw); bz++){
          const id = w.getBlock(bx, by, bz);
          if(!isPlatte(id)) continue;
          const k = wKey(bx, by, bz);
          drauf.add(k);
          this.platten.set(k, this.jetzt);
          if(!rsAn(id)){ this.setzen(bx, by, bz, platteBasis(id) + 1); if(this.klang) this.klang('an', bx, by, bz); }
        }
    }
    for(const [k, t] of this.platten){
      if(drauf.has(k)) continue;
      const [x, y, z] = wOrt(k), id = w.getBlock(x, y, z);
      if(!isPlatte(id) || !platteGedrueckt(id)){ if(!this.geladen(x, z) && id === B.AIR) continue; this.platten.delete(k); continue; }
      if(this.jetzt - t < RS_PLATTE_ZEIT - 1e-6) continue;
      this.platten.delete(k);
      this.setzen(x, y, z, platteBasis(id));
      if(this.klang) this.klang('aus', x, y, z);
    }
  }
}
