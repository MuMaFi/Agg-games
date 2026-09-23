/* Prüft den Regelkern von Sturmflut. Aufruf: node werkzeug/sturmflut-test.mjs
   Jede Prüfung baut ihr Brett aus einer Zeichnung:
     .  Land   ~  Wasser   ^  Fels   H  Haus   D  Doppelhaus   T  Turm */
import * as R from '../games/sturmflut/regeln.js';
import { missionBauen } from '../games/sturmflut/karten.js';

let ok = 0, fehl = 0;
function pruef(name, bed, info) {
  if (bed) { ok++; }
  else { fehl++; console.log('  FEHLER:', name, info !== undefined ? JSON.stringify(info) : ''); }
}

function brett(zeilen, einheiten = [], extra = {}) {
  const z = {
    zufall: 12345, naechsteId: 1, feld: [], einheiten: [], angriffe: [], auftauchen: [],
    deich: 7, deichMax: 8, runde: 1, maxRunden: 4, phase: 'wir', pool: ['scherer'],
    nachschub: [1, 1, 1], stat: { erledigt: 0, ertrunken: 0, hausVerloren: 0, turmFiel: false,
    maschinenSchaden: 0, ausgefallen: 0 }, auftraege: [], toeteZiel: 5, verloren: false, geschafft: false,
    ...extra,
  };
  const art = { '.': 'land', '~': 'wasser', '^': 'fels', 'H': 'haus', 'D': 'haus', 'T': 'turm' };
  for (const r of zeilen) for (const c of r)
    z.feld.push({ art: art[c], hp: c === '^' ? 2 : c === 'H' ? 1 : c === 'D' ? 2 : c === 'T' ? 2 : 0, v: 0 });
  for (const [typ, x, y, mehr] of einheiten) R.neueEinheit(z, typ, x, y, mehr);
  return z;
}
const leer8 = () => Array.from({ length: 8 }, () => '........');
const bei = (z, x, y) => R.einheitAuf(z, x, y);

/* 1 — Faust: 2 Schaden, ein Feld weiter */
{
  const z = brett(leer8(), [['ramme', 3, 3], ['scherer', 3, 2]]);
  const s = bei(z, 3, 2);
  R.angreifen(z, 1, 3, 2);
  pruef('Faust trifft mit 2', s.hp === 1, s.hp);
  pruef('Faust stößt eins weiter', s.x === 3 && s.y === 1, [s.x, s.y]);
  pruef('Ramme hat gehandelt', R.einheit(z, 1).gehandelt);
}
/* 2 — Prall gegen Fels */
{
  const b = leer8(); b[1] = '...^....';
  const z = brett(b, [['ramme', 3, 3], ['scherer', 3, 2]]);
  const s = bei(z, 3, 2);
  R.angreifen(z, 1, 3, 2);
  pruef('Prall: 2 + 1 Schaden', s.hp === 0 || !R.einheit(z, s.id), s.hp);
  pruef('Prall: Fels nimmt einen', R.feld(z, 3, 1).hp === 1, R.feld(z, 3, 1));
}
/* 3 — Ertrinken, und eine nasse Maschine schießt nicht */
{
  const b = leer8(); b[1] = '...~....'; b[4] = '...~....';
  const z = brett(b, [['kanone', 3, 6], ['scherer', 3, 2], ['ramme', 3, 5], ['werfer', 0, 0]]);
  R.angreifen(z, 1, 3, 5);                  // Kanone schießt die eigene Ramme ins Wasser? nein: Richtung See
  const ramme = R.einheit(z, 3);
  pruef('Maschine im Wasser lebt', ramme && !ramme.wrack && ramme.y === 4, ramme && [ramme.x, ramme.y, ramme.hp]);
  pruef('Maschine im Wasser ist nass', R.imWasser(z, ramme));
  pruef('nasse Maschine kann nicht schießen', R.angreifen(z, 3, 3, 3) === null);
  const z2 = brett(b, [['ramme', 3, 3], ['scherer', 3, 2]]);
  const ev = R.angreifen(z2, 1, 3, 2);
  pruef('Scherer ertrinkt', !R.einheit(z2, 2) && ev.some(e => e.art === 'ertrinkt'), ev.map(e => e.art));
  pruef('Ertrunkene zählen als erledigt', z2.stat.erledigt === 1 && z2.stat.ertrunken === 1);
}
/* 4 — Haus kostet Deich, Doppelhaus zwei Treffer */
{
  const b = leer8(); b[1] = '...H....'; b[5] = '...D....';
  const z = brett(b, [['ramme', 3, 3], ['scherer', 3, 2]]);
  R.angreifen(z, 1, 3, 2);
  pruef('Prall gegen Haus: Deich −1', z.deich === 6, z.deich);
  pruef('Haus ist Ruine', R.feld(z, 3, 1).art === 'ruine');
  const z2 = brett(b, [['ramme', 3, 6]]);
  R.angreifen(z2, 1, 3, 5);
  pruef('Faust (2) gegen Doppelhaus: Deich −2', z2.deich === 5 && R.feld(z2, 3, 5).art === 'ruine', [z2.deich, R.feld(z2, 3, 5)]);
}
/* 5 — Rand: nichts passiert */
{
  const z = brett(leer8(), [['ramme', 3, 1], ['scherer', 3, 0]]);
  R.angreifen(z, 1, 3, 0);
  const s = R.einheit(z, 2);
  pruef('Am Rand kein Stoß, kein Prall', s && s.y === 0 && s.hp === 1, s && [s.y, s.hp]);
}
/* 6 — Kanone: trifft das Erste im Weg */
{
  const z = brett(leer8(), [['kanone', 0, 4], ['scherer', 4, 4], ['speier', 6, 4]]);
  R.angreifen(z, 1, 7, 4);
  const s = R.einheit(z, 2), p = R.einheit(z, 3);
  pruef('Kanone trifft den ersten', s.hp === 2 && p.hp === 2, [s.hp, p.hp]);
  pruef('Kanone stößt in Schussrichtung', s.x === 5, s.x);
}
/* 7 — Werfer: Mitte 1, Nachbarn nach außen; der innere prallt auf den Werfer */
{
  const z = brett(leer8(), [['werfer', 1, 4], ['scherer', 3, 4], ['scherer', 2, 4], ['scherer', 3, 3], ['scherer', 4, 4]]);
  R.angreifen(z, 1, 3, 4);
  const w = R.einheit(z, 1), m = R.einheit(z, 2), innen = R.einheit(z, 3), oben = R.einheit(z, 4), rechts = R.einheit(z, 5);
  pruef('Werfer: Mitte 1 Schaden, nicht bewegt', m.hp === 2 && m.x === 3 && m.y === 4, [m.hp, m.x, m.y]);
  pruef('Werfer: oben nach oben', oben.y === 2);
  pruef('Werfer: rechts nach rechts', rechts.x === 5);
  pruef('Werfer: innen prallt auf den Werfer', innen.x === 2 && innen.hp === 2 && w.hp === 1, [innen.x, innen.hp, w.hp]);
}
/* 8 — Der Kern des Spiels: ein angesagter Angriff wandert mit */
{
  const b = leer8(); b[4] = '...HH...';
  const z = brett(b, [['scherer', 3, 3], ['ramme', 2, 3]]);
  z.angriffe = [{ id: 1, r: 2, k: 1, n: 1 }];          // Scherer will nach Süden, aufs Haus (3,4)
  pruef('vorher zielt er aufs Haus', JSON.stringify(R.aufschlag(z, R.einheit(z, 1), 2, 1)) === '{"x":3,"y":4}');
  R.angreifen(z, 2, 3, 3);                              // Ramme schlägt ihn nach rechts
  const s = R.einheit(z, 1);
  pruef('er steht jetzt rechts', s.x === 4 && s.y === 3, [s.x, s.y]);
  const ev = R.feindeHandeln(z);
  pruef('und trifft das Haus unter sich (4,4)', R.feld(z, 4, 4).art === 'ruine' && R.feld(z, 3, 4).art === 'haus',
        [R.feld(z, 3, 4).art, R.feld(z, 4, 4).art]);
}
/* 9 — Eigenbeschuss */
{
  const z = brett(leer8(), [['scherer', 3, 3], ['scherer', 4, 4], ['ramme', 2, 3]]);
  z.angriffe = [{ id: 1, r: 2, k: 1, n: 1 }];
  R.angreifen(z, 3, 3, 3);                              // nach rechts: jetzt zielt er auf (4,4)
  R.feindeHandeln(z);
  const b2 = R.einheit(z, 2);
  pruef('er trifft seinesgleichen', b2.hp === 2, b2.hp);
}
/* 10 — Tot vor dem Zug: Angriff fällt aus */
{
  const b = leer8(); b[4] = '...H....';
  const z = brett(b, [['speier', 3, 2], ['ramme', 3, 1]]);
  z.angriffe = [{ id: 1, r: 2, k: 1, n: 1 }];
  R.angreifen(z, 2, 3, 2);
  const ev = R.feindeHandeln(z);
  pruef('Angriff eines Toten fällt aus', ev.some(e => e.art === 'ausfall') && R.feld(z, 3, 4).art === 'haus');
}
/* 11 — Auftauchen blockieren */
{
  const z = brett(leer8(), [['ramme', 2, 2]]);
  z.auftauchen = [{ x: 2, y: 2, typ: 'scherer' }, { x: 5, y: 1, typ: 'speier' }];
  const ev = R.auftauchenLassen(z);
  pruef('Blockierer nimmt 1', R.einheit(z, 1).hp === 2);
  pruef('nur der freie taucht auf', z.einheiten.length === 2 && bei(z, 5, 1).typ === 'speier');
}
/* 12 — Brocken lässt sich nicht schieben */
{
  const z = brett(leer8(), [['ramme', 3, 3], ['brocken', 3, 2]]);
  R.angreifen(z, 1, 3, 2);
  const b = R.einheit(z, 2);
  pruef('Brocken bleibt stehen', b.x === 3 && b.y === 2 && b.hp === 3, [b.x, b.y, b.hp]);
}
/* 13 — Flatterer ertrinkt nicht */
{
  const b = leer8(); b[1] = '...~....';
  /* Mit 5 LP, damit ihn nicht schon die Faust umhaut — gefragt ist das Wasser. */
  const z = brett(b, [['ramme', 3, 3], ['flatterer', 3, 2, { hp: 5, max: 5 }]]);
  R.angreifen(z, 1, 3, 2);
  const f = R.einheit(z, 2);
  pruef('Flatterer schwebt über Wasser', f && f.y === 1 && f.hp === 3, f && [f.y, f.hp]);
}
/* 14 — Wrack blockiert, nimmt nichts */
{
  const z = brett(leer8(), [['werfer', 3, 4, { hp: 1 }], ['speier', 3, 0], ['kanone', 3, 7]]);
  R.schaden(z, 3, 4, 1, []);
  const w = R.einheit(z, 1);
  pruef('Maschine wird Wrack', w.wrack && w.hp === 0);
  z.angriffe = [{ id: 2, r: 2, k: 1, n: 1 }];
  R.feindeHandeln(z);
  pruef('Spucke bleibt am Wrack hängen', R.einheit(z, 3).hp === 3);
  pruef('Wrack kann nicht mehr handeln', R.angreifen(z, 1, 3, 2) === null);
}
/* 15 — Bewegen: durch eigene hindurch, nicht auf sie, nicht durch Feinde, nicht ins Wasser */
{
  const b = leer8(); b[3] = '....~...';
  const z = brett(b, [['ramme', 3, 3], ['kanone', 3, 2], ['scherer', 2, 3]]);
  const r = R.erreichbar(z, R.einheit(z, 1));
  const hat = (x, y) => r.some(f => f.x === x && f.y === y);
  pruef('durch eigene Maschine hindurch', hat(3, 1));
  pruef('nicht auf der eigenen stehen', !hat(3, 2));
  pruef('nicht auf den Feind', !hat(2, 3));
  pruef('nicht ins Wasser', !hat(4, 3));
  pruef('Weg führt Schritt für Schritt', r.weg(3, 1).length === 3, r.weg(3, 1));
}
/* 16 — Rückgängig */
{
  const z = brett(leer8(), [['ramme', 3, 3], ['scherer', 5, 1]]);
  R.bewegen(z, 1, 3, 5);
  R.zurueck(z, 1);
  const u = R.einheit(z, 1);
  pruef('zurück an den Start', u.x === 3 && u.y === 3 && !u.bewegt);
  R.bewegen(z, 1, 5, 2);
  R.angreifen(z, 1, 5, 1);
  pruef('nach dem Schlag kein Zurück', R.zurueck(z, 1) === null);
  pruef('nach dem Schlag kein Zug', R.bewegen(z, 1, 5, 3) === null);
}
/* 17 — Sperrwerk fällt: alles verloren */
{
  const b = leer8(); b[4] = '...T....';
  const z = brett(b, [['scherer', 3, 3]], { pflichtTurm: true });
  z.feld[4 * 8 + 3].hp = 1;
  z.angriffe = [{ id: 1, r: 2, k: 1, n: 1 }];
  R.feindeHandeln(z);
  pruef('Sperrwerk weg → verloren', z.verloren && z.stat.turmFiel);
}
/* 18 — Letzte Runde: geschafft, kein neuer Nachschub */
{
  const z = brett(leer8(), [['ramme', 3, 6], ['scherer', 3, 1]], { runde: 4, maxRunden: 4 });
  const teile = R.zugEnde(z);
  pruef('nach der letzten Runde geschafft', z.geschafft && z.phase === 'aus', [z.geschafft, z.phase]);
  pruef('danach kein Auftauchen mehr', teile.length === 1);
}
/* 19 — Gleicher Keim, gleicher Verlauf */
{
  const k = { deich: 7, stufe: 'normal', maschinen: {} };
  const lauf = () => {
    const z = missionBauen({ keim: 777, insel: 1, nr: 0, kampagne: k });
    R.losgehen(z);
    for (let i = 0; i < 3 && z.phase === 'wir'; i++) R.zugEnde(z);
    return JSON.stringify(z);
  };
  pruef('deterministisch', lauf() === lauf());
}
/* 20 — Sie ziehen und sagen an, und sie meiden es, sich selbst zu treffen */
{
  const b = leer8(); b[5] = '..HHH...';
  const z = brett(b, [['scherer', 3, 2], ['ramme', 0, 7], ['kanone', 7, 7], ['werfer', 7, 6]]);
  R.feindeZiehen(z);
  const a = z.angriffe[0], s = R.einheit(z, 1);
  const t = R.aufschlag(z, s, a.r, a.k);
  pruef('Scherer sagt einen Angriff an', !!a);
  pruef('und zielt auf ein Haus', t && R.feld(z, t.x, t.y).art === 'haus', [s.x, s.y, t]);
}
/* 21 — Ansage sieht nur, was jetzt da ist; Vorschau per Kopie ändert das Original nicht */
{
  const z = brett(leer8(), [['ramme', 3, 3], ['scherer', 3, 2]]);
  const k = R.klon(z);
  R.angreifen(k, 1, 3, 2);
  pruef('Kopie lässt Original unberührt', R.einheit(z, 2).hp === 3 && R.einheit(z, 2).y === 2);
}

console.log(`\n${ok} bestanden, ${fehl} fehlgeschlagen`);
process.exit(fehl ? 1 : 0);
