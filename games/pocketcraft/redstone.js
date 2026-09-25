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
const rsHaengt = id => isStaub(id) || isPlatte(id) || isRSFackel(id) || isHebel(id) || isKnopf(id);
/** Ziele, zu denen eine Leitung neben sich einen Arm ausstreckt */
const rsZiel = id => isRSFackel(id) || isHebel(id) || isKnopf(id) || isPlatte(id) || isLampe(id) || id === B.REDSTONEBLOCK || isDoor(id);
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
    if(isStaub(n) || rsZiel(n)) v = 1;
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
    this._plattenT = 0;
    this.aenderungen = 0;                 // gezählt, für Tests
    // vom Spiel gesetzt:
    this.abfallen = null;                 // (x, y, z, id): ohne Halt heruntergefallen
    this.wesen = null;                    // () → [{ x, y, z, w }]: wer auf Druckplatten treten kann
    this.tuer = null;                     // (x, y, z, offen) → ob es ging
    this.klang = null;                    // (art, x, y, z)
    this._v = new Uint8Array(4);
    this._get = (x, y, z) => this.w.getBlock(x, y, z);
  }

  /** nach einer Blockänderung bei x, y, z: was in der Nähe mit Strom zu tun
      hat, im nächsten Schritt prüfen */
  melden(x, y, z, alt, neu){
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
      if(isKnopf(id) && rsAn(id)){ this.setzen(x, y, z, knopfId(false, rsAnbau(id))); if(this.klang) this.klang('aus', x, y, z); }
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
      if(!this.knoepfe.has(k)) this.knoepfe.set(k, this.jetzt + RS_KNOPF_ZEIT);
    } else if(id === B.DRUCKPLATTE + 1){
      if(!this.platten.has(k)) this.platten.set(k, this.jetzt);
    }
  }
  /** liegt oder hängt das Bauteil noch an etwas? */
  haelt(x, y, z, id){
    const w = this.w;
    if(isStaub(id)) return OPQ[w.getBlock(x, y - 1, z)] === 1;
    if(isPlatte(id)) return SOL[w.getBlock(x, y - 1, z)] === 1;
    const a = rsAnbau(id), [sx, sy, sz] = rsStuetze(x, y, z, a), s = w.getBlock(sx, sy, sz);
    return a === 0 ? SOL[s] === 1 : OPQ[s] === 1;
  }

  /* — Strom — */
  /** gibt das Bauteil n bei nx, ny, nz Strom an den Nachbarn zx, zy, zz ab? (Leitungen nicht) */
  quelleZu(n, nx, ny, nz, zx, zy, zz){
    if(n === B.REDSTONEBLOCK) return true;
    if(isRSFackel(n)){
      if(!rsAn(n)) return false;
      const [sx, sy, sz] = rsStuetze(nx, ny, nz, rsAnbau(n));
      return sx !== zx || sy !== zy || sz !== zz;        // nur nicht in den eigenen Block
    }
    if(isHebel(n) || isKnopf(n) || isPlatte(n)) return rsAn(n);
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
    if(id === B.REDSTONEBLOCK) return true;
    return OPQ[id] === 1 && (this.stark(x, y, z) || this.schwach(x, y, z));
  }
  /** Strom für ein Bauteil bei x, y, z (Lampe, Tür): von einer Quelle daneben,
      von einer Leitung, die darauf liegt oder hineinzeigt, oder von einem
      geladenen Block daneben */
  hatStrom(x, y, z){
    const w = this.w;
    for(const [dx, dy, dz] of RS_SECHS){
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
          if(!rsAn(id)){ this.setzen(bx, by, bz, B.DRUCKPLATTE + 1); if(this.klang) this.klang('an', bx, by, bz); }
        }
    }
    for(const [k, t] of this.platten){
      if(drauf.has(k)) continue;
      const [x, y, z] = wOrt(k), id = w.getBlock(x, y, z);
      if(id !== B.DRUCKPLATTE + 1){ if(!this.geladen(x, z) && id === B.AIR) continue; this.platten.delete(k); continue; }
      if(this.jetzt - t < RS_PLATTE_ZEIT - 1e-6) continue;
      this.platten.delete(k);
      this.setzen(x, y, z, B.DRUCKPLATTE);
      if(this.klang) this.klang('aus', x, y, z);
    }
  }
}
