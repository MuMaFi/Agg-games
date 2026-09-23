/* ======================================================================
   STURMFLUT · Karten und Feldzug

   Jeder Einsatz wird aus einem Keim gebaut: gleicher Keim, gleiche
   Karte. Gebaut wird nach Vorgaben — wie viel Wasser, wie viele Felsen,
   wie viel Stadt — und danach geprüft. Eine Karte, auf der sie die
   Stadt gar nicht erreichen können oder man nirgends aufstellen kann,
   wird verworfen und neu gewürfelt.
   ====================================================================== */
import { N, RICHTUNG, imFeld, neueEinheit, zufall } from './regeln.js';

/* Drei Inseln zu je drei Einsätzen, dann das Sperrwerk. Mit jeder Insel
   kommt ein neuer Gegner dazu und ein Einsatz mehr Nachschub. */
export const INSELN = [
  { name: 'Süderoog', pool: ['scherer', 'scherer', 'speier'], feinde: 2,
    nachschub: [2, 1, 2], runden: 4,
    einsaetze: [
      { name: 'Fischerkate', see: 0.70, teiche: 1, felsen: 4, haus: 7, turm: false, auftraege: ['toete', 'deich'], toete: 4 },
      { name: 'Salzwiese',   see: 0.60, teiche: 2, felsen: 3, haus: 7, turm: true,  auftraege: ['turm', 'heil'] },
      { name: 'Sielhafen',   see: 0.80, teiche: 1, felsen: 5, haus: 8, turm: false, auftraege: ['toete', 'heil'], toete: 5 },
    ] },
  { name: 'Pellworm', pool: ['scherer', 'speier', 'flatterer', 'schlamm'], feinde: 3,
    nachschub: [2, 1, 1], runden: 4,
    einsaetze: [
      { name: 'Warft Ost',     see: 0.65, teiche: 2, felsen: 4, haus: 8, turm: true,  auftraege: ['turm', 'deich'] },
      { name: 'Prielkante',    see: 0.75, teiche: 3, felsen: 3, haus: 7, turm: false, auftraege: ['toete', 'heil'], toete: 6 },
      { name: 'Alter Koog',    see: 0.60, teiche: 1, felsen: 6, haus: 9, turm: false, auftraege: ['deich', 'heil'] },
    ] },
  { name: 'Nordstrand', pool: ['scherer', 'speier', 'flatterer', 'schlamm', 'scherer'], feinde: 3,
    nachschub: [2, 1, 2], runden: 4, brocken: 1,
    einsaetze: [
      { name: 'Hafenmole',     see: 0.80, teiche: 2, felsen: 4, haus: 9, turm: true,  auftraege: ['turm', 'toete'], toete: 7 },
      { name: 'Deichschart',   see: 0.70, teiche: 2, felsen: 5, haus: 8, turm: false, auftraege: ['deich', 'heil'] },
      { name: 'Kirchwarft',    see: 0.65, teiche: 3, felsen: 3, haus: 9, turm: true,  auftraege: ['turm', 'deich'] },
    ] },
];
export const FINALE = {
  name: 'Das Sperrwerk', see: 0.75, teiche: 2, felsen: 4, haus: 7, runden: 5,
  pool: ['scherer', 'speier', 'flatterer', 'schlamm'], feinde: 3, brocken: 1,
  nachschub: [2, 2, 1, 1],
  turmZeilen: [5, 6], turmHp: 5,
};

/* Schwierigkeit: eine Stellschraube für Nachschub und Startdeich. */
export const STUFEN = {
  leicht: { name: 'Leicht', deich: 8, nachschub: -1, feinde: 0 },
  normal: { name: 'Normal', deich: 7, nachschub: 0,  feinde: 0 },
  schwer: { name: 'Schwer', deich: 6, nachschub: 0,  feinde: 1 },
};

const LANDSEITE = y => y >= 4;
const SEESEITE = y => y <= 3;

function leer() {
  const f = [];
  for (let i = 0; i < N * N; i++) f.push({ art: 'land', hp: 0, v: 0 });
  return f;
}

/* Kann ein Feind zu Fuß von der Seeseite an die Stadt heran? Gesucht
   wird über Land, von allen Feldern der Seeseite aus. */
function stadtErreichbar(feld) {
  const at = (x, y) => feld[y * N + x];
  const ges = new Set(), q = [];
  for (let y = 0; y <= 3; y++)
    for (let x = 0; x < N; x++)
      if (at(x, y).art === 'land') { ges.add(y * N + x); q.push([x, y]); }
  let neben = 0;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of RICHTUNG) {
      const nx = x + dx, ny = y + dy;
      if (!imFeld(nx, ny)) continue;
      const f = at(nx, ny);
      if (f.art === 'haus' || f.art === 'turm') neben++;
      const k = ny * N + nx;
      if (ges.has(k) || f.art !== 'land') continue;
      ges.add(k); q.push([nx, ny]);
    }
  }
  return neben;
}

function kartenVersuch(R, v) {
  const feld = leer();
  const at = (x, y) => feld[y * N + x];
  /* Das Watt: die erste Reihe meist Wasser, die zweite nur hier und da. */
  for (let x = 0; x < N; x++) {
    if (R() < v.see) at(x, 0).art = 'wasser';
    if (at(x, 0).art === 'wasser' && R() < 0.28) at(x, 1).art = 'wasser';
  }
  /* Priele und Teiche im Land — dort ertrinkt, wer hineingestoßen wird. */
  for (let t = 0; t < v.teiche; t++) {
    let x = 1 + ((R() * (N - 2)) | 0), y = 2 + ((R() * 4) | 0);
    const len = 2 + ((R() * 2) | 0);
    for (let i = 0; i < len; i++) {
      if (imFeld(x, y)) at(x, y).art = 'wasser';
      if (R() < 0.5) x += R() < 0.5 ? 1 : -1; else y += R() < 0.5 ? 1 : -1;
    }
  }
  /* Felsen. */
  for (let i = 0, n = 0; n < v.felsen && i < 60; i++) {
    const x = (R() * N) | 0, y = 1 + ((R() * 6) | 0);
    if (at(x, y).art !== 'land') continue;
    at(x, y).art = 'fels'; at(x, y).hp = 2; n++;
  }
  /* Die Stadt: zwei, drei Haufen auf der Landseite. Nie weiter vor als
     Reihe 4 — gemessen: ein Haus in Reihe 3 steht praktisch dort, wo sie
     auftauchen, und kostet im Schnitt dreimal so viel Deich wie eines in
     Reihe 5. Das ist kein Rätsel mehr, das ist Pech. */
  let rest = v.haus;
  const kerne = 2 + ((R() * 2) | 0);
  for (let c = 0; c < kerne && rest > 0; c++) {
    let x = (R() * N) | 0, y = 4 + ((R() * 4) | 0);
    for (let i = 0; i < 12 && rest > 0; i++) {
      if (imFeld(x, y) && at(x, y).art === 'land') {
        const doppel = rest >= 2 && R() < 0.3;
        at(x, y).art = 'haus'; at(x, y).hp = at(x, y).maxHp = doppel ? 2 : 1;
        rest -= at(x, y).hp;
      }
      const [dx, dy] = RICHTUNG[(R() * 4) | 0];
      x = Math.max(0, Math.min(N - 1, x + dx));
      y = Math.max(4, Math.min(N - 1, y + dy));
    }
  }
  if (rest > 0) return null;
  /* Der Turm steht vorn, zur See hin — er soll in Gefahr sein. */
  if (v.turm) {
    const frei = [];
    const [y0, y1] = v.turmZeilen || [2, 4];
    for (let y = y0; y <= y1; y++) for (let x = 1; x < N - 1; x++) if (at(x, y).art === 'land') frei.push([x, y]);
    if (!frei.length) return null;
    const [tx, ty] = frei[(R() * frei.length) | 0];
    at(tx, ty).art = 'turm'; at(tx, ty).hp = at(tx, ty).maxHp = v.turmHp || 2;
  }
  for (const f of feld) f.v = (R() * 1000) | 0;
  return feld;
}

function zaehle(feld, pred) {
  let n = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (pred(feld[y * N + x], x, y)) n++;
  return n;
}

/* Ein Einsatz. kampagne liefert Deich, Maschinenstand und Schwierigkeit. */
export function missionBauen({ keim, insel, nr, kampagne }) {
  const finale = insel >= INSELN.length;
  const I = finale ? FINALE : INSELN[insel];
  const v = finale ? { ...FINALE, turm: true } : I.einsaetze[nr];
  const stufe = STUFEN[kampagne.stufe || 'normal'];

  const g = { zufall: keim | 0 };
  const R = () => zufall(g);
  let feld = null;
  for (let versuch = 0; versuch < 400 && !feld; versuch++) {
    const f = kartenVersuch(R, v);
    if (!f) continue;
    if (zaehle(f, (t, x, y) => SEESEITE(y) && t.art === 'land') < 8) continue;
    if (zaehle(f, (t, x, y) => LANDSEITE(y) && t.art === 'land') < 7) continue;
    if (stadtErreichbar(f) < 3) continue;
    feld = f;
  }
  if (!feld) throw new Error('keine Karte für Keim ' + keim);

  const z = {
    version: 1, zufall: (keim * 2654435761) | 0, naechsteId: 1,
    feld, einheiten: [], angriffe: [], auftauchen: [],
    deich: kampagne.deich, deichMax: 8,
    runde: 0, maxRunden: v.runden || I.runden,
    phase: 'aufstellen',
    pool: I.pool.slice(),
    nachschub: I.nachschub.map(n => Math.max(0, n + stufe.nachschub)),
    stat: { erledigt: 0, ertrunken: 0, hausVerloren: 0, turmFiel: false, maschinenSchaden: 0, ausgefallen: 0 },
    auftraege: finale ? ['turm'] : v.auftraege.slice(),
    toeteZiel: v.toete || 5,
    turmName: finale ? 'Sperrwerk' : 'Leuchtturm',
    pflichtTurm: finale,
    name: v.name, inselName: finale ? 'Eiderstedt' : I.name, insel, nr, finale,
    verloren: false, geschafft: false,
  };
  if (finale) z.auftraege = ['turm', 'deich'];

  /* Die ersten von ihnen stehen schon da. */
  const frei = [];
  for (let y = 0; y <= 2; y++) for (let x = 0; x < N; x++) if (feld[y * N + x].art === 'land') frei.push([x, y]);
  const anzahl = I.feinde + stufe.feinde;
  for (let i = 0; i < anzahl && frei.length; i++) {
    const [x, y] = frei.splice((R() * frei.length) | 0, 1)[0];
    neueEinheit(z, I.pool[(R() * I.pool.length) | 0], x, y);
  }
  for (let b = 0; b < (I.brocken || 0) && frei.length; b++) {
    const [x, y] = frei.splice((R() * frei.length) | 0, 1)[0];
    neueEinheit(z, 'brocken', x, y);
  }

  /* Unsere drei, mit allem, was bisher nachgerüstet wurde. */
  const plaetze = aufstellFelder(z);
  const vorschlag = vorschlagAufstellung(z, plaetze);
  ['ramme', 'kanone', 'werfer'].forEach((typ, i) => {
    const m = kampagne.maschinen[typ] || {};
    const [x, y] = vorschlag[i];
    const u = neueEinheit(z, typ, x, y);
    u.max += m.hp || 0; u.hp = u.max;
    u.zug += m.zug || 0;
    u.plus = m.schaden || 0;
  });
  return z;
}

/* Wo darf man die Maschinen hinstellen? Auf freies Land der Landseite. */
export function aufstellFelder(z) {
  const raus = [];
  for (let y = 4; y < N; y++)
    for (let x = 0; x < N; x++) {
      const f = z.feld[y * N + x];
      if (f.art !== 'land') continue;
      if (z.einheiten.some(u => u.x === x && u.y === y && u.team === 'sie')) continue;
      raus.push([x, y]);
    }
  return raus;
}
/* Ein vernünftiger Vorschlag: vorn, verteilt, nicht auf einem Haufen. */
function vorschlagAufstellung(z, plaetze) {
  const sortiert = plaetze.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const wahl = [];
  for (const ziel of [2, 5, 3.5]) {
    let beste = null, bw = 1e9;
    for (const p of sortiert) {
      if (wahl.some(q => q[0] === p[0] && q[1] === p[1])) continue;
      const w = Math.abs(p[0] - ziel) * 1.2 + (p[1] - 4) * 1.0;
      if (w < bw) { bw = w; beste = p; }
    }
    wahl.push(beste);
  }
  return wahl;
}

/* Umstellen während der Aufstellung. */
export function umstellen(z, id, x, y) {
  if (z.phase !== 'aufstellen') return false;
  const u = z.einheiten.find(e => e.id === id);
  if (!u || u.team !== 'wir') return false;
  if (!aufstellFelder(z).some(p => p[0] === x && p[1] === y)) return false;
  const anderer = z.einheiten.find(e => e !== u && e.team === 'wir' && e.x === x && e.y === y);
  if (anderer) { anderer.x = u.x; anderer.y = u.y; anderer.sx = u.x; anderer.sy = u.y; }
  u.x = x; u.y = y; u.sx = x; u.sy = y;
  return true;
}
