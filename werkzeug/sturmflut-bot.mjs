/* Ein Spielautomat für Sturmflut: spielt unsere Seite, Zug für Zug.
   Er probiert für jede Maschine jedes Zielfeld und jeden Schuss auf
   einer Kopie aus, bewertet das Ergebnis und nimmt das Beste — dann die
   nächste Maschine. Das ist gierig, nicht allwissend, und damit etwa so
   gut wie jemand, der das Spiel verstanden hat.

   Aufruf:  node werkzeug/sturmflut-bot.mjs [feldzüge=40] [stufe=normal]  */
import * as R from '../games/sturmflut/regeln.js';
import { missionBauen, INSELN } from '../games/sturmflut/karten.js';
import * as F from '../games/sturmflut/feldzug.js';

export function bewerte(z) {
  let w = z.deich * 14;
  if (z.verloren) w -= 500;
  for (const a of z.angriffe) {
    const u = R.einheit(z, a.id); if (!u) continue;
    const t = R.aufschlag(z, u, a.r, a.k); if (!t || t.frei) continue;
    const n = R.waffeVon(u).schaden + (u.plus || 0);
    const o = R.einheitAuf(z, t.x, t.y);
    if (o) {
      if (o.wrack) continue;
      if (o.team === 'sie') w += 5 + (o.hp <= n ? 5 : 0);
      else w -= o.hp <= n ? 16 : 4 * n;
      continue;
    }
    const f = R.feld(z, t.x, t.y);
    if (f.art === 'haus') w -= 13 * Math.min(n, f.hp);
    if (f.art === 'turm') w -= z.pflichtTurm ? (f.hp <= n ? 400 : 30) : 9;
  }
  for (const u of z.einheiten) {
    if (u.team === 'sie') { w -= 7 + u.hp * 1.6; continue; }
    if (u.wrack) { w -= 18; continue; }
    w += u.hp * 2.5;
    if (R.imWasser(z, u)) w -= 4;
    if (z.auftauchen.some(m => m.x === u.x && m.y === u.y)) w += 2;
  }
  for (const f of z.feld) if (f.art === 'turm') w += f.hp * (z.pflichtTurm ? 20 : 5);
  return w;
}

/* Ein ganzer Zug für uns. Liefert die Liste der Handlungen. */
export function spieleZug(z) {
  const log = [];
  for (let runde = 0; runde < 3; runde++) {
    let beste = null;
    for (const u of z.einheiten) {
      if (!R.kannHandeln(z, u)) continue;
      const orte = u.bewegt ? [{ x: u.x, y: u.y }] : R.erreichbar(z, u);
      for (const o of orte) {
        const k1 = R.klon(z);
        if (o.x !== u.x || o.y !== u.y) R.bewegen(k1, u.id, o.x, o.y);
        const m = R.einheit(k1, u.id);
        /* Auch ohne Schuss — manchmal ist Hinstellen die ganze Tat. */
        const kein = bewerte(k1) - 0.5;
        if (!beste || kein > beste.w) beste = { w: kein, id: u.id, x: o.x, y: o.y, ziel: null };
        if (R.imWasser(k1, m)) continue;
        for (const t of R.zielfelder(k1, m)) {
          const k2 = R.klon(k1);
          R.angreifen(k2, u.id, t.x, t.y);
          const w = bewerte(k2);
          if (w > beste.w) beste = { w, id: u.id, x: o.x, y: o.y, ziel: [t.x, t.y] };
        }
      }
    }
    if (!beste) break;
    const u = R.einheit(z, beste.id);
    if (beste.x !== u.x || beste.y !== u.y) R.bewegen(z, u.id, beste.x, beste.y);
    if (beste.ziel) R.angreifen(z, u.id, beste.ziel[0], beste.ziel[1]);
    else { u.gehandelt = true; u.bewegt = true; }
    log.push(beste);
  }
  return log;
}

export function einsatz(z) {
  R.losgehen(z);
  let zuege = 0;
  while (z.phase === 'wir' && zuege++ < 12) {
    spieleZug(z);
    R.zugEnde(z);
  }
  return z;
}

/* Ein ganzer Feldzug nach den echten Regeln des Feldzugs. Einkaufen
   tut der Automat wie jemand Vernünftiges: erst Deich bis sechs,
   dann die Faust, das Kaliber, Panzer — und was übrig bleibt in Deich. */
const PLAN = ['ramme_schaden', 'kanone_schaden', 'werfer_hp', 'werfer_schaden', 'ramme_hp', 'kanone_hp'];
function einkaufen(k) {
  while (k.deich < 6 && F.kaufen(k, 'deich'));
  for (const id of PLAN) F.kaufen(k, id);
  while (F.kaufen(k, 'deich'));
}
export function feldzug(keim, stufe) {
  const k = F.neuerFeldzug(stufe, keim);
  const verlauf = [];
  while (!k.vorbei) {
    const z = missionBauen({ keim: F.einsatzKeim(k), insel: k.insel, nr: k.nr, kampagne: k });
    const vor = k.deich, i = k.insel, j = k.nr;
    einsatz(z);
    const b = F.abschliessen(k, z);
    verlauf.push({ i, j, name: z.name, deichVor: vor, deichNach: z.deich, verloren: z.verloren,
                   erledigt: z.stat.erledigt, ausgefallen: z.stat.ausgefallen,
                   erfuellt: b.muscheln, von: z.auftraege.length });
    if (b.werft) einkaufen(k);
  }
  return { gewonnen: k.gewonnen, verlauf, k };
}

if (typeof process !== 'undefined' && import.meta.url === `file://${process.argv[1]}`) {
  const anzahl = +(process.argv[2] || 40), stufe = process.argv[3] || 'normal';
  const ab = +(process.argv[4] || 1);           // erster Keim, zum Aufteilen auf mehrere Prozesse
  const t0 = Date.now();
  let siege = 0;
  const proEinsatz = {};
  const endeBei = {};
  for (let s = ab; s < ab + anzahl; s++) {
    const f = feldzug(s, stufe);
    if (f.gewonnen) siege++;
    else { const l = f.verlauf[f.verlauf.length - 1]; const k = l.i + '.' + l.j; endeBei[k] = (endeBei[k] || 0) + 1; }
    for (const v of f.verlauf) {
      const k = v.i + '.' + v.j;
      const p = proEinsatz[k] ||= { n: 0, verlust: 0, verloren: 0, erfuellt: 0, von: 0, erledigt: 0, ausgefallen: 0, name: v.name };
      p.n++; p.verlust += v.deichVor - v.deichNach; p.verloren += v.verloren ? 1 : 0;
      p.erfuellt += v.erfuellt; p.von += v.von; p.erledigt += v.erledigt; p.ausgefallen += v.ausgefallen;
    }
  }
  console.log(`Stufe ${stufe}: ${siege}/${anzahl} Feldzüge gewonnen (${Math.round(siege / anzahl * 100)} %)  ·  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log('Einsatz          gespielt  Deich−  verloren  Aufträge  erledigt  Wracks');
  for (const [k, p] of Object.entries(proEinsatz))
    console.log(`${k} ${p.name.padEnd(14)} ${String(p.n).padStart(4)}   ${(p.verlust / p.n).toFixed(2).padStart(5)}   ${String(p.verloren).padStart(5)}    ${(p.erfuellt / p.von * 100).toFixed(0).padStart(4)} %   ${(p.erledigt / p.n).toFixed(1).padStart(5)}   ${(p.ausgefallen / p.n).toFixed(2)}`);
  if (Object.keys(endeBei).length) console.log('Feldzug endete bei:', endeBei);
}
