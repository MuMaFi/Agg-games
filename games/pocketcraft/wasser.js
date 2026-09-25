/* Pocketcraft · Wasser, das fließt
   Nach den Regeln des Vorbilds, nur ohne die Suche nach dem nächsten Gefälle:
   Eine Quelle (B.WATER) füllt, was unter ihr frei ist, mit fallendem Wasser;
   kann sie nicht nach unten, fließt sie zu allen vier Seiten, mit jedem
   Block eine Stärke schwächer, bis 1. Fließendes Wasser, das keinen
   Nachschub mehr hat, versiegt Schritt für Schritt. Zwei Quellen nebeneinander
   über festem Grund machen eine dritte (der Eimer-Trick).

   Gerechnet wird nur, wo sich etwas geändert hat: Jede Blockänderung meldet
   ihr Wasser in der Nähe an, und alle Viertelsekunde wird die Liste
   abgearbeitet — eine Welle je Schritt. Das Meer steht still, bis jemand
   daneben gräbt. Mit Mitspielern rechnet nur der Host; die Änderungen gehen
   wie jede andere Blockänderung an alle. */
'use strict';

const WASSER_TAKT = 0.25;                 // Sekunden je Schritt, wie beim Vorbild (5 Ticks)
const WASSER_BUDGET = 3000;               // Blöcke je Schritt, der Rest kommt im nächsten
const WASSER_SEITEN = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const WASSER_NACHBARN = [[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/* Ort als eine Zahl: x und z bis ±1 048 576, y bis 127 */
const wKey = (x, y, z) => ((x + 1048576)*2097152 + (z + 1048576))*128 + y;
const wOrt = k => { const y = k % 128, r = (k - y)/128, z = r % 2097152 - 1048576, x = (r - (z + 1048576))/2097152 - 1048576; return [x, y, z]; };

/** Darf Wasser hinein? Luft, Gras und Blumen, Fackeln, Weizen, Redstone —
    was darin steht, spült es weg. Türen, Leitern, Betten halten es auf. */
function flutbar(id){
  if(id === B.AIR) return true;
  if(isWasser(id)) return false;
  const b = blocks[id];
  return !!b && !b.solid && (b.replaceable || b.model === 'cross' || b.model === 'torch' || !!b.rs);
}

class Stroemung{
  constructor(world){
    this.w = world;
    this.naechste = new Set();            // für den nächsten Schritt angemeldet
    this.t = 0;
    this.aenderungen = 0;                 // gezählt, für Tests und Anzeige
    this.wegspuelen = null;               // (x, y, z, id) → was dort stand, fällt heraus
  }
  /** nach einer Blockänderung bei x, y, z: das Wasser dort und daneben neu prüfen */
  melden(x, y, z){
    const w = this.w;
    for(const [dx, dy, dz] of WASSER_NACHBARN){
      const yy = y + dy;
      if(yy < 1 || yy >= WH) continue;
      if(isWasser(w.getBlock(x + dx, yy, z + dz))) this.naechste.add(wKey(x + dx, yy, z + dz));
    }
  }
  tick(dt){
    if(!this.naechste.size){ this.t = 0; return; }
    this.t += dt;
    if(this.t < WASSER_TAKT) return;
    this.t = Math.min(this.t - WASSER_TAKT, WASSER_TAKT);    // Rest mitnehmen, aber nie mehrere Schritte auf einmal
    this.schritt();
  }
  /** ein Schritt: alles abarbeiten, was bis jetzt angemeldet ist */
  schritt(){
    const jetzt = this.naechste;
    this.naechste = new Set();
    let n = 0;
    for(const k of jetzt){
      if(n++ >= WASSER_BUDGET){ this.naechste.add(k); continue; }
      const [x, y, z] = wOrt(k);
      if(!this.geladen(x, z)) continue;       // kommt wieder, wenn der Chunk erzeugt wird (siehe World.generate)
      this.pruefen(x, y, z);
    }
  }
  /** der Block und seine vier Nachbarn liegen in erzeugten Chunks */
  geladen(x, z){
    const w = this.w;
    for(const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]){
      const c = w.chunks.get(ckey((x + dx) >> 4, (z + dz) >> 4));
      if(!c || c.state < 1) return false;
    }
    return true;
  }
  setzen(x, y, z, id){
    const w = this.w, alt = w.getBlock(x, y, z);
    if(alt === id) return;
    if(alt !== B.AIR && !isWasser(alt) && this.wegspuelen) this.wegspuelen(x, y, z, alt);
    if(w.setBlock(x, y, z, id)){ this.aenderungen++; this.melden(x, y, z); }
  }

  /** Was sollte hier stehen? Für fließendes und fallendes Wasser, aus den Nachbarn */
  sollHier(x, y, z){
    const w = this.w;
    let staerkste = 0, quellen = 0;
    for(const [dx, dz] of WASSER_SEITEN){
      const n = w.getBlock(x + dx, y, z + dz);
      if(!isWasser(n)) continue;
      if(n === B.WATER) quellen++;
      staerkste = Math.max(staerkste, wasserMenge(n));
    }
    if(quellen >= 2){
      const unten = w.getBlock(x, y - 1, z);
      if(unten === B.WATER || (blocksMovement(unten) && !isWasser(unten))) return B.WATER;
    }
    if(isWasser(w.getBlock(x, y + 1, z))) return B.FALL;
    const k = staerkste - 1;
    return k <= 0 ? B.AIR : flussId(k);
  }

  pruefen(x, y, z){
    const w = this.w;
    let id = w.getBlock(x, y, z);
    if(!isWasser(id)) return;
    if(id !== B.WATER){
      const soll = this.sollHier(x, y, z);
      if(soll !== id){ this.setzen(x, y, z, soll); id = soll; if(id === B.AIR) return; }
    }
    this.ausbreiten(x, y, z, id);
  }

  ausbreiten(x, y, z, id){
    const w = this.w;
    const unten = y > 1 ? w.getBlock(x, y - 1, z) : B.BEDROCK;
    // nach unten, wenn es geht — fließendes Wasser darunter wird zu fallendem
    if(flutbar(unten) || (isWasser(unten) && unten !== B.WATER && unten !== B.FALL)){
      this.setzen(x, y - 1, z, B.FALL);
      return;
    }
    // steht es auf Wasser, das nicht abfließen kann, breitet sich nur eine Quelle aus
    if(isWasser(unten) && id !== B.WATER) return;
    const staerke = id === B.FALL ? 7 : wasserMenge(id) - 1;
    if(staerke <= 0) return;
    const neu = flussId(staerke);
    for(const [dx, dz] of WASSER_SEITEN){
      const n = w.getBlock(x + dx, y, z + dz);
      if(flutbar(n) || (isWasser(n) && n !== B.WATER && n !== B.FALL && wasserMenge(n) < staerke))
        this.setzen(x + dx, y, z + dz, neu);
    }
  }

  /** Strömung an einem Punkt: Richtung, in die Wasser dort drückt (x, z), und
      ob es fällt (y). Nach der Höhe der Nachbarn — bergab. Quellen und
      stehendes Wasser drücken nicht. */
  zug(x, y, z){
    const w = this.w, id = w.getBlock(x, y, z);
    const out = [0, 0, 0];
    if(!isWasser(id) || id === B.WATER) return out;
    const hier = wasserMenge(id);
    for(const [dx, dz] of WASSER_SEITEN){
      const n = w.getBlock(x + dx, y, z + dz);
      let d = 0;
      if(isWasser(n)) d = hier - wasserMenge(n);
      else if(flutbar(n)) d = isWasser(w.getBlock(x + dx, y - 1, z + dz)) ? hier + 8 - wasserMenge(w.getBlock(x + dx, y - 1, z + dz)) : hier;
      out[0] += dx*d; out[2] += dz*d;
    }
    const l = Math.hypot(out[0], out[2]);
    if(l > 0){ out[0] /= l; out[2] /= l; }
    if(id === B.FALL) out[1] = -1;
    return out;
  }
}
