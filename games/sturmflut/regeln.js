/* ======================================================================
   STURMFLUT · Regeln

   Der ganze Spielkern, ohne Bild, ohne Ton, ohne DOM. Ein Zustand ist
   ein schlichtes Datenobjekt; jede Funktion hier verändert ihn und
   schreibt dabei eine Liste von Ereignissen, aus der die Darstellung
   später ihre Bewegungen macht.

   Das hat zwei Gründe. Erstens die Vorschau: bevor man einen Angriff
   bestätigt, wird er auf einer Kopie des Zustands ausgeführt, und das
   Ergebnis wird gezeigt — genau, nicht geschätzt. Zweitens die Prüfung:
   dieser Kern läuft auch in Node, und ein Spielautomat spielt damit
   Hunderte Einsätze durch, bevor ein Mensch einen einzigen spielt.

   Das Brett ist 8 × 8. y = 0 ist die Seeseite, von dort kommen sie;
   y = 7 ist die Landseite, dort steht die Stadt.

   Der Kniff, an dem das ganze Spiel hängt: ein angesagter Angriff eines
   Feindes zielt nicht auf ein Feld, sondern in eine Richtung, von ihm
   aus gesehen. Wer ihn wegschiebt, verschiebt sein Ziel mit — und mit
   etwas Glück steht dort jetzt einer von seinesgleichen.
   ====================================================================== */

export const N = 8;
/* Richtungen im Brett: 0 = zur See (y−1), 1 = nach rechts (x+1),
   2 = zum Land (y+1), 3 = nach links (x−1). */
export const RICHTUNG = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const imFeld = (x, y) => x >= 0 && y >= 0 && x < N && y < N;
const idx = (x, y) => y * N + x;

/* ----------------------------------------------------------------------
   Einheiten und Waffen
   ---------------------------------------------------------------------- */
export const TYPEN = {
  /* Drei Maschinen aus dem Hafen. Jede kann genau eine Sache, und
     zusammen können sie fast alles. */
  ramme:     { team: 'wir', name: 'Ramme',   hp: 3, zug: 3, waffe: 'faust',
               text: 'Schlägt das Feld daneben: 2 Schaden, stößt eins weiter.' },
  kanone:    { team: 'wir', name: 'Kanone',  hp: 3, zug: 3, waffe: 'schuss',
               text: 'Schießt geradeaus, trifft das Erste im Weg: 1 Schaden, stößt es weg.' },
  werfer:    { team: 'wir', name: 'Werfer',  hp: 2, zug: 3, waffe: 'bogen',
               text: 'Wirft über alles hinweg, mindestens zwei Felder weit: 1 Schaden in der Mitte, die vier Nachbarn werden nach außen gestoßen.' },

  /* Was aus dem Watt kommt. */
  scherer:   { team: 'sie', name: 'Scherer', hp: 3, zug: 3, waffe: 'zange',
               text: 'Kneift das Feld vor sich: 1 Schaden.' },
  speier:    { team: 'sie', name: 'Speier',  hp: 2, zug: 2, waffe: 'spucke',
               text: 'Spuckt geradeaus, trifft das Erste im Weg: 1 Schaden.' },
  flatterer: { team: 'sie', name: 'Flatterer', hp: 2, zug: 4, waffe: 'stich', fliegt: true,
               text: 'Fliegt, ertrinkt also nicht. Sticht das Feld vor sich: 1 Schaden.' },
  schlamm:   { team: 'sie', name: 'Schlammwerfer', hp: 2, zug: 2, waffe: 'klumpen',
               text: 'Wirft einen Klumpen über alles hinweg auf ein Feld in gerader Linie: 1 Schaden.' },
  brocken:   { team: 'sie', name: 'Brocken', hp: 5, zug: 2, waffe: 'wucht', stabil: true,
               text: 'Lässt sich nicht verschieben. Schlägt das Feld vor sich: 2 Schaden, stößt es weg.' },
};

export const WAFFEN = {
  faust:   { name: 'Faust',   art: 'nah',   schaden: 2, stoss: 'weg' },
  schuss:  { name: 'Schuss',  art: 'linie', schaden: 1, stoss: 'weg' },
  bogen:   { name: 'Bogen',   art: 'bogen', schaden: 1, stoss: 'umher', min: 2 },
  zange:   { name: 'Zange',   art: 'nah',   schaden: 1 },
  stich:   { name: 'Stich',   art: 'nah',   schaden: 1 },
  spucke:  { name: 'Spucke',  art: 'linie', schaden: 1 },
  klumpen: { name: 'Klumpen', art: 'bogen', schaden: 1, min: 2 },
  wucht:   { name: 'Wucht',   art: 'nah',   schaden: 2, stoss: 'weg' },
};

/* Was im Weg steht. Wasser steht nicht im Weg, es ist nur tödlich. */
const BAU = new Set(['fels', 'haus', 'ruine', 'turm']);

/* ----------------------------------------------------------------------
   Zufall — im Zustand selbst, damit jede Kopie genau dasselbe würfelt
   ---------------------------------------------------------------------- */
export function zufall(z) {
  let t = (z.zufall = (z.zufall + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const klon = z => structuredClone(z);

/* ----------------------------------------------------------------------
   Nachschlagen
   ---------------------------------------------------------------------- */
export const feld = (z, x, y) => z.feld[idx(x, y)];
export function einheitAuf(z, x, y) {
  for (const u of z.einheiten) if (u.x === x && u.y === y) return u;
  return null;
}
export function einheit(z, id) {
  for (const u of z.einheiten) if (u.id === id) return u;
  return null;
}
export const waffeVon = u => WAFFEN[TYPEN[u.typ].waffe];
export const imWasser = (z, u) => !u.fliegt && feld(z, u.x, u.y).art === 'wasser';
/* Hält ein Geschoss auf, prallt ein Gestoßener dagegen? */
export function blockiert(z, x, y) {
  if (!imFeld(x, y)) return true;
  if (BAU.has(feld(z, x, y).art)) return true;
  return !!einheitAuf(z, x, y);
}

export function neueEinheit(z, typ, x, y, extra) {
  const T = TYPEN[typ];
  const u = {
    id: z.naechsteId++, typ, team: T.team, x, y,
    hp: T.hp, max: T.hp, zug: T.zug, plus: 0,
    fliegt: !!T.fliegt, wrack: false,
    bewegt: false, gehandelt: false, sx: x, sy: y,
    /* Nur fürs Bild: wohin sie schaut. Maschinen zur See, sie zum Land. */
    blick: T.team === 'wir' ? 0 : 2,
  };
  if (extra) Object.assign(u, extra);
  z.einheiten.push(u);
  return u;
}

/* ----------------------------------------------------------------------
   Schaden, Stoß, Tod
   ---------------------------------------------------------------------- */
function sterben(z, u, ev) {
  if (u.team === 'sie') {
    z.einheiten.splice(z.einheiten.indexOf(u), 1);
    z.stat.erledigt++;
    ev.push({ art: 'tod', id: u.id, typ: u.typ, x: u.x, y: u.y });
  } else {
    /* Eine Maschine stirbt nicht, sie bleibt als Wrack stehen — und
       steht dann im Weg, für beide Seiten. */
    u.wrack = true; u.hp = 0;
    z.stat.ausgefallen++;
    ev.push({ art: 'wrack', id: u.id, x: u.x, y: u.y });
  }
}

export function schaden(z, x, y, n, ev) {
  if (!imFeld(x, y) || n <= 0) return;
  const u = einheitAuf(z, x, y);
  if (u) {
    if (u.wrack) return;
    u.hp -= n;
    ev.push({ art: 'schaden', id: u.id, x, y, n, hp: Math.max(0, u.hp) });
    if (u.team === 'wir') z.stat.maschinenSchaden += n;
    if (u.hp <= 0) sterben(z, u, ev);
    return;
  }
  const f = feld(z, x, y);
  if (f.art === 'haus') {
    /* Jeder Treffer an einem Haus kostet den Deich einen Punkt — so
       viele, wie das Haus noch Stockwerke hat, nicht mehr. */
    const weg = Math.min(n, f.hp);
    f.hp -= weg;
    z.deich = Math.max(0, z.deich - weg);
    z.stat.hausVerloren += weg;
    if (f.hp <= 0) f.art = 'ruine';
    ev.push({ art: 'haus', x, y, n: weg, hp: f.hp, deich: z.deich });
    if (z.deich <= 0) z.verloren = true;
  } else if (f.art === 'turm') {
    f.hp = Math.max(0, f.hp - n);
    if (f.hp <= 0) {
      f.art = 'ruine'; z.stat.turmFiel = true;
      /* Im letzten Einsatz ist der Turm das Sperrwerk — fällt es, ist
         alles verloren, egal wie viel Deich noch steht. */
      if (z.pflichtTurm) z.verloren = true;
    }
    ev.push({ art: 'turm', x, y, n, hp: f.hp });
  } else if (f.art === 'fels') {
    f.hp = Math.max(0, f.hp - n);
    if (f.hp <= 0) { f.art = 'land'; f.schutt = true; }
    ev.push({ art: 'fels', x, y, n, hp: f.hp });
  }
}

/* Ein Stoß bewegt genau ein Feld weit. Ist dort etwas, prallen beide
   aufeinander und nehmen je einen Schaden; bewegt wird dann nichts. */
export function stossen(z, x, y, r, ev) {
  if (!imFeld(x, y)) return;
  const u = einheitAuf(z, x, y);
  if (!u || u.wrack || TYPEN[u.typ].stabil) return;
  const [dx, dy] = RICHTUNG[r], nx = x + dx, ny = y + dy;
  if (!imFeld(nx, ny)) return;
  if (blockiert(z, nx, ny)) {
    ev.push({ art: 'prall', id: u.id, von: [x, y], gegen: [nx, ny] });
    schaden(z, x, y, 1, ev);
    schaden(z, nx, ny, 1, ev);
    return;
  }
  u.x = nx; u.y = ny;
  ev.push({ art: 'stoss', id: u.id, von: [x, y], nach: [nx, ny] });
  if (feld(z, nx, ny).art === 'wasser' && !u.fliegt) {
    if (u.team === 'sie') {
      z.einheiten.splice(z.einheiten.indexOf(u), 1);
      z.stat.erledigt++; z.stat.ertrunken++;
      ev.push({ art: 'ertrinkt', id: u.id, typ: u.typ, x: nx, y: ny });
    } else {
      ev.push({ art: 'nass', id: u.id, x: nx, y: ny });
    }
  }
}

/* ----------------------------------------------------------------------
   Wirkung einer Waffe — für beide Seiten dieselbe
   ---------------------------------------------------------------------- */
/* Wo landet eine Waffe, wenn sie jetzt in Richtung r (und Weite k)
   abgefeuert wird? Für Geschosse ist das das erste Hindernis. */
export function aufschlag(z, u, r, k) {
  const w = waffeVon(u), [dx, dy] = RICHTUNG[r];
  if (w.art === 'nah') {
    const x = u.x + dx, y = u.y + dy;
    return imFeld(x, y) ? { x, y } : null;
  }
  if (w.art === 'linie') {
    let letzt = null;
    for (let s = 1; s < N; s++) {
      const x = u.x + dx * s, y = u.y + dy * s;
      if (!imFeld(x, y)) break;
      letzt = { x, y, frei: true };
      if (blockiert(z, x, y)) return { x, y };
    }
    return letzt;           // fliegt bis an den Rand und trifft nichts
  }
  const x = u.x + dx * k, y = u.y + dy * k;
  return imFeld(x, y) ? { x, y } : null;
}

export function wirken(z, u, r, k, ev) {
  const w = waffeVon(u);
  u.blick = r;
  const n = w.schaden + (u.plus || 0);
  const t = aufschlag(z, u, r, k);
  if (!t) return;
  const bild = w.art === 'nah' ? 'hieb' : w.art === 'linie' ? 'schuss' : 'bogen';
  ev.push({ art: bild, id: u.id, typ: u.typ, von: [u.x, u.y], nach: [t.x, t.y], r });
  if (t.frei) return;       // Geschoss ins Leere
  schaden(z, t.x, t.y, n, ev);
  if (w.stoss === 'weg') stossen(z, t.x, t.y, r, ev);
  else if (w.stoss === 'umher')
    for (let q = 0; q < 4; q++) {
      const [ex, ey] = RICHTUNG[q];
      stossen(z, t.x + ex, t.y + ey, q, ev);
    }
}

/* ----------------------------------------------------------------------
   Bewegung
   ---------------------------------------------------------------------- */
/* Breitensuche: durch eigene Leute darf man hindurch, stehenbleiben
   aber nicht auf ihnen. Wasser betritt nur, wer fliegt. Liefert die
   Endfelder samt Vorgänger, damit der Weg gezeichnet werden kann. */
export function erreichbar(z, u) {
  const vor = new Map([[idx(u.x, u.y), -1]]);
  const tiefe = new Map([[idx(u.x, u.y), 0]]);
  const q = [[u.x, u.y]];
  while (q.length) {
    const [x, y] = q.shift();
    const d = tiefe.get(idx(x, y));
    if (d >= u.zug) continue;
    for (const [dx, dy] of RICHTUNG) {
      const nx = x + dx, ny = y + dy;
      if (!imFeld(nx, ny)) continue;
      const k = idx(nx, ny);
      if (tiefe.has(k)) continue;
      const f = feld(z, nx, ny);
      if (BAU.has(f.art)) continue;
      if (f.art === 'wasser' && !u.fliegt) continue;
      const o = einheitAuf(z, nx, ny);
      if (o && (o.team !== u.team || o.wrack)) continue;
      tiefe.set(k, d + 1); vor.set(k, idx(x, y));
      q.push([nx, ny]);
    }
  }
  const raus = [];
  for (const [k, d] of tiefe) {
    const x = k % N, y = (k / N) | 0;
    const o = einheitAuf(z, x, y);
    if (o && o !== u) continue;
    raus.push({ x, y, d });
  }
  raus.weg = (x, y) => {
    const p = [];
    for (let k = idx(x, y); k !== -1 && k !== undefined; k = vor.get(k)) p.push([k % N, (k / N) | 0]);
    return p.reverse();
  };
  return raus;
}

function blickNach(u, pfad) {
  if (!pfad || pfad.length < 2) return;
  const [ax, ay] = pfad[pfad.length - 2], [bx, by] = pfad[pfad.length - 1];
  const r = RICHTUNG.findIndex(([dx, dy]) => dx === bx - ax && dy === by - ay);
  if (r >= 0) u.blick = r;
}

/* ----------------------------------------------------------------------
   Unser Zug
   ---------------------------------------------------------------------- */
export function kannHandeln(z, u) {
  return u && u.team === 'wir' && !u.wrack && !u.gehandelt && z.phase === 'wir';
}

export function bewegen(z, id, x, y, ev = []) {
  const u = einheit(z, id);
  if (!kannHandeln(z, u) || u.bewegt) return null;
  const r = erreichbar(z, u);
  if (!r.some(f => f.x === x && f.y === y)) return null;
  const pfad = r.weg(x, y);
  u.sx = u.x; u.sy = u.y; u.sblick = u.blick;
  u.x = x; u.y = y; u.bewegt = true;
  blickNach(u, pfad);
  ev.push({ art: 'geht', id, pfad, blick: u.blick });
  return ev;
}

/* Rückgängig, solange noch nicht geschossen wurde. */
export function zurueck(z, id, ev = []) {
  const u = einheit(z, id);
  if (!kannHandeln(z, u) || !u.bewegt) return null;
  const von = [u.x, u.y];
  u.x = u.sx; u.y = u.sy; u.bewegt = false;
  if (u.sblick !== undefined) u.blick = u.sblick;
  ev.push({ art: 'zurueck', id, von, nach: [u.x, u.y] });
  return ev;
}

/* Wohin kann diese Maschine gerade zielen? */
export function zielfelder(z, u) {
  const w = waffeVon(u), raus = [];
  for (let r = 0; r < 4; r++) {
    const [dx, dy] = RICHTUNG[r];
    if (w.art === 'nah') {
      const x = u.x + dx, y = u.y + dy;
      if (imFeld(x, y)) raus.push({ x, y, r, k: 1 });
    } else {
      for (let k = w.art === 'bogen' ? (w.min || 2) : 1; k < N; k++) {
        const x = u.x + dx * k, y = u.y + dy * k;
        if (!imFeld(x, y)) break;
        raus.push({ x, y, r, k });
      }
    }
  }
  return raus;
}

export function angreifen(z, id, tx, ty, ev = []) {
  const u = einheit(z, id);
  if (!kannHandeln(z, u) || imWasser(z, u)) return null;
  const t = zielfelder(z, u).find(f => f.x === tx && f.y === ty);
  if (!t) return null;
  wirken(z, u, t.r, t.k, ev);
  /* Die Maschine kann nach dem Schuss selbst hinüber sein — ein Prall
     gegen sie genügt. */
  u.gehandelt = true; u.bewegt = true;
  return ev;
}

/* ----------------------------------------------------------------------
   Ihr Zug: ziehen und ansagen
   ---------------------------------------------------------------------- */
/* Was ist es einem Feind wert, dieses Feld zu treffen? Häuser zuerst —
   sie wollen die Stadt, nicht uns. Eigene Leute treffen sie ungern, aber
   sie rechnen nur mit dem, was sie jetzt sehen. */
function zielWert(z, x, y, n) {
  if (!imFeld(x, y)) return 0;
  const o = einheitAuf(z, x, y);
  if (o) {
    if (o.wrack) return 0;
    if (o.team === 'sie') return -14;
    return 6 + (o.hp <= n ? 3 : 0);
  }
  const f = feld(z, x, y);
  if (f.art === 'haus') return 10;
  if (f.art === 'turm') return 11;
  return 0;
}

function angriffsWahl(z, u) {
  const w = waffeVon(u), n = w.schaden + (u.plus || 0);
  const wahl = [];
  for (let r = 0; r < 4; r++) {
    if (w.art === 'bogen') {
      for (let k = w.min || 2; k < N; k++) {
        const t = aufschlag(z, u, r, k);
        if (!t) break;
        wahl.push({ r, k, wert: zielWert(z, t.x, t.y, n) });
      }
    } else {
      const t = aufschlag(z, u, r, 1);
      if (!t) continue;
      wahl.push({ r, k: 1, wert: t.frei ? 0 : zielWert(z, t.x, t.y, n) });
    }
  }
  return wahl;
}

export function feindeZiehen(z, ev = []) {
  z.angriffe = [];
  const sie = z.einheiten.filter(u => u.team === 'sie').sort((a, b) => a.id - b.id);
  let nr = 1;
  for (const u of sie) {
    const felder = erreichbar(z, u);
    const ax = u.x, ay = u.y;
    let beste = null;
    for (const f of felder) {
      /* Kurz hinstellen, nachsehen, zurück. */
      u.x = f.x; u.y = f.y;
      let lage = f.y * 0.18;                                   // Richtung Stadt
      if (z.auftauchen.some(m => m.x === f.x && m.y === f.y)) lage -= 4;
      for (const a of angriffsWahl(z, u)) {
        const wert = a.wert + lage + zufall(z) * 1.4;
        if (!beste || wert > beste.wert) beste = { x: f.x, y: f.y, r: a.r, k: a.k, wert };
      }
    }
    u.x = ax; u.y = ay;
    if (!beste) continue;
    if (beste.x !== ax || beste.y !== ay) {
      const pfad = felder.weg(beste.x, beste.y);
      u.x = beste.x; u.y = beste.y;
      blickNach(u, pfad);
      ev.push({ art: 'geht', id: u.id, pfad, blick: u.blick });
    }
    u.blick = beste.r;
    const a = { id: u.id, r: beste.r, k: beste.k, n: nr++ };
    z.angriffe.push(a);
    ev.push({ art: 'zielt', ...a, blick: u.blick });
  }
  return ev;
}

/* Wo wird als Nächstes etwas aus dem Sand kommen? Nur auf freiem Land
   der Seeseite, und nicht dort, wo schon etwas steht. Reihe 3 bleibt
   frei: die Stadt beginnt in Reihe 4, und wer direkt vor der Haustür
   auftaucht, lässt einem keinen Zug zum Antworten. */
export const AUFTAUCH_BIS = 2;
export function auftauchenPlanen(z, anzahl, ev = []) {
  const frei = [];
  for (let y = 0; y <= AUFTAUCH_BIS; y++)
    for (let x = 0; x < N; x++) {
      if (feld(z, x, y).art !== 'land') continue;
      if (einheitAuf(z, x, y)) continue;
      if (z.auftauchen.some(m => m.x === x && m.y === y)) continue;
      frei.push({ x, y });
    }
  for (let i = 0; i < anzahl && frei.length; i++) {
    const j = (zufall(z) * frei.length) | 0;
    const [m] = frei.splice(j, 1);
    const pool = z.pool, typ = pool[(zufall(z) * pool.length) | 0];
    z.auftauchen.push({ x: m.x, y: m.y, typ });
    ev.push({ art: 'blubbert', x: m.x, y: m.y });
  }
  return ev;
}

/* ----------------------------------------------------------------------
   Ihr Zug: handeln, auftauchen
   ---------------------------------------------------------------------- */
export function feindeHandeln(z, ev = []) {
  const liste = z.angriffe.slice().sort((a, b) => a.n - b.n);
  z.angriffe = [];
  for (const a of liste) {
    const u = einheit(z, a.id);
    if (!u) { ev.push({ art: 'ausfall', id: a.id, n: a.n }); continue; }
    ev.push({ art: 'handelt', id: u.id, n: a.n });
    wirken(z, u, a.r, a.k, ev);
  }
  return ev;
}

/* Wer auf der Stelle steht, hält es unten — und bekommt dafür einen ab. */
export function auftauchenLassen(z, ev = []) {
  for (const m of z.auftauchen) {
    const o = einheitAuf(z, m.x, m.y);
    if (o) {
      ev.push({ art: 'blockiert', x: m.x, y: m.y, id: o.id });
      if (!o.wrack) schaden(z, m.x, m.y, 1, ev);
      continue;
    }
    if (feld(z, m.x, m.y).art !== 'land') continue;
    const u = neueEinheit(z, m.typ, m.x, m.y);
    ev.push({ art: 'auftauchen', id: u.id, typ: m.typ, x: m.x, y: m.y, einheit: { ...u } });
  }
  z.auftauchen = [];
  return ev;
}

/* ----------------------------------------------------------------------
   Ablauf
   ---------------------------------------------------------------------- */
/* Nach dem Aufstellen: sie ziehen zum ersten Mal, dann sind wir dran. */
export function losgehen(z) {
  const ev = [];
  feindeZiehen(z, ev);
  auftauchenPlanen(z, z.nachschub[0] || 0, ev);
  z.phase = 'wir';
  z.runde = 1;
  for (const u of z.einheiten) if (u.team === 'wir') { u.bewegt = u.gehandelt = false; u.sx = u.x; u.sy = u.y; }
  return ev;
}

/* Unser Zug ist vorbei. Zurück kommen drei Abschnitte, jeder mit seinen
   Ereignissen — die Darstellung spielt sie nacheinander ab. */
export function zugEnde(z) {
  const teile = [];
  const h = [];
  z.phase = 'sie';
  feindeHandeln(z, h);
  teile.push({ titel: 'handeln', ev: h });
  if (z.verloren) { z.phase = 'aus'; return teile; }
  if (z.runde >= z.maxRunden) {
    z.phase = 'aus'; z.geschafft = true;
    return teile;
  }
  const a = [];
  auftauchenLassen(z, a);
  teile.push({ titel: 'auftauchen', ev: a });
  if (z.verloren) { z.phase = 'aus'; return teile; }
  const zi = [];
  feindeZiehen(z, zi);
  if (z.runde + 1 < z.maxRunden) auftauchenPlanen(z, z.nachschub[z.runde] || 0, zi);
  teile.push({ titel: 'ziehen', ev: zi });
  z.runde++;
  z.phase = 'wir';
  for (const u of z.einheiten)
    if (u.team === 'wir') { u.bewegt = u.gehandelt = false; u.sx = u.x; u.sy = u.y; }
  return teile;
}

/* ----------------------------------------------------------------------
   Aufträge — was es neben dem Überleben noch zu holen gibt
   ---------------------------------------------------------------------- */
export const AUFTRAG_TEXT = {
  turm:    z => (z.turmName === 'Sperrwerk' ? 'Das Sperrwerk' : 'Den Leuchtturm') + ' halten',
  toete:   z => 'Mindestens ' + z.toeteZiel + ' erledigen',
  deich:   () => 'Höchstens einen Deichpunkt verlieren',
  heil:    () => 'Keine Maschine fällt aus',
};
/* ok: im Augenblick erfüllt · sicher: lässt sich nicht mehr verlieren ·
   gescheitert: lässt sich nicht mehr erreichen */
export function auftragStand(z, art) {
  if (art === 'turm')  return { ok: !z.stat.turmFiel, sicher: false, gescheitert: z.stat.turmFiel };
  if (art === 'toete') return { ok: z.stat.erledigt >= z.toeteZiel, sicher: z.stat.erledigt >= z.toeteZiel,
                                gescheitert: false, zahl: z.stat.erledigt + ' / ' + z.toeteZiel };
  if (art === 'deich') return { ok: z.stat.hausVerloren <= 1, sicher: false, gescheitert: z.stat.hausVerloren > 1 };
  if (art === 'heil')  return { ok: z.stat.ausgefallen === 0, sicher: false, gescheitert: z.stat.ausgefallen > 0 };
  return { ok: false };
}
