/* ======================================================================
   STURMFLUT · Feldzug

   Was zwischen den Einsätzen passiert: Deich, Muscheln, die Werft.
   Rein und ohne DOM wie die Regeln — der Spielautomat benutzt genau
   diese Funktionen, damit das, was er misst, auch das ist, was man
   spielt.

   Der Deich wird von Einsatz zu Einsatz mitgenommen. Wer einen Einsatz
   ohne Verlust übersteht, bekommt einen Punkt zurück; beim Wechsel auf
   die nächste Insel schickt die Deichgräfin Leute für drei weitere.
   Jeder erfüllte Auftrag bringt eine Muschel, und für Muscheln gibt es
   in der Werft Deich oder Nachrüstung.
   ====================================================================== */
import { INSELN, STUFEN } from './karten.js';
import { auftragStand } from './regeln.js';

export const DEICH_MAX = 8;
export const INSEL_HILFE = 3;

export const WERFT = [
  { id: 'deich',        name: 'Deich ausbessern', text: 'Ein Deichpunkt zurück.', preis: 1 },
  { id: 'ramme_schaden', typ: 'ramme',  feld: 'schaden', name: 'Schwerere Faust',  text: 'Ramme: +1 Schaden.', preis: 3, max: 1 },
  { id: 'kanone_schaden', typ: 'kanone', feld: 'schaden', name: 'Größeres Kaliber', text: 'Kanone: +1 Schaden.', preis: 3, max: 1 },
  { id: 'werfer_schaden', typ: 'werfer', feld: 'schaden', name: 'Schwerere Ladung', text: 'Werfer: +1 Schaden in der Mitte.', preis: 3, max: 1 },
  { id: 'ramme_hp',  typ: 'ramme',  feld: 'hp',  name: 'Panzer für die Ramme',  text: 'Ramme: +1 Lebenspunkt.', preis: 2, max: 2 },
  { id: 'kanone_hp', typ: 'kanone', feld: 'hp',  name: 'Panzer für die Kanone', text: 'Kanone: +1 Lebenspunkt.', preis: 2, max: 2 },
  { id: 'werfer_hp', typ: 'werfer', feld: 'hp',  name: 'Panzer für den Werfer', text: 'Werfer: +1 Lebenspunkt.', preis: 2, max: 2 },
  { id: 'ramme_zug',  typ: 'ramme',  feld: 'zug', name: 'Raupen für die Ramme',  text: 'Ramme: +1 Feld Bewegung.', preis: 2, max: 1 },
  { id: 'kanone_zug', typ: 'kanone', feld: 'zug', name: 'Raupen für die Kanone', text: 'Kanone: +1 Feld Bewegung.', preis: 2, max: 1 },
  { id: 'werfer_zug', typ: 'werfer', feld: 'zug', name: 'Raupen für den Werfer', text: 'Werfer: +1 Feld Bewegung.', preis: 2, max: 1 },
];

export function neuerFeldzug(stufe = 'normal', keim = (Math.random() * 1e9) | 0) {
  return {
    version: 1, stufe, keim,
    deich: STUFEN[stufe].deich, muscheln: 0,
    insel: 0, nr: 0,
    maschinen: { ramme: {}, kanone: {}, werfer: {} },
    gekauft: {},
    erledigt: 0, einsaetze: 0, perfekt: 0,
    vorbei: false, gewonnen: false,
  };
}

/* Welcher Einsatz kommt? insel == INSELN.length ist das Finale. */
export const einsatzKeim = k => (k.keim * 97 + k.insel * 13 + k.nr * 7) | 0;
export const istFinale = k => k.insel >= INSELN.length;

/* Ein Einsatz ist vorbei. Liefert, was es dafür gab — für die Anzeige. */
export function abschliessen(k, z) {
  const bericht = { auftraege: [], muscheln: 0, deichZurueck: 0, inselHilfe: 0, werft: false };
  k.einsaetze++;
  k.erledigt += z.stat.erledigt;
  if (z.verloren) {
    k.deich = z.deich; k.vorbei = true; k.gewonnen = false;
    bericht.verloren = true;
    return bericht;
  }
  for (const a of z.auftraege) {
    const ok = auftragStand(z, a).ok;
    bericht.auftraege.push({ art: a, ok });
    if (ok) bericht.muscheln++;
  }
  k.muscheln += bericht.muscheln;
  k.deich = z.deich;
  if (z.stat.hausVerloren === 0) {
    bericht.deichZurueck = Math.min(1, DEICH_MAX - k.deich);
    k.deich += bericht.deichZurueck; k.perfekt++;
  }
  if (istFinale(k)) { k.vorbei = true; k.gewonnen = true; bericht.sieg = true; return bericht; }
  k.nr++;
  if (k.nr >= INSELN[k.insel].einsaetze.length) {
    k.nr = 0; k.insel++;
    bericht.inselHilfe = Math.min(INSEL_HILFE, DEICH_MAX - k.deich);
    k.deich += bericht.inselHilfe;
    bericht.werft = true;
  }
  return bericht;
}

export function kaufbar(k, w) {
  if (k.muscheln < w.preis) return false;
  if (w.id === 'deich') return k.deich < DEICH_MAX;
  return (k.gekauft[w.id] || 0) < (w.max || 1);
}
export function kaufen(k, id) {
  const w = WERFT.find(x => x.id === id);
  if (!w || !kaufbar(k, w)) return false;
  k.muscheln -= w.preis;
  if (w.id === 'deich') { k.deich++; return true; }
  k.gekauft[w.id] = (k.gekauft[w.id] || 0) + 1;
  const m = k.maschinen[w.typ];
  m[w.feld] = (m[w.feld] || 0) + 1;
  return true;
}
