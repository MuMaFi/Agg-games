/* Pocketcraft · Klassische Texturen
   Eine zweite Garnitur Blockbilder im Stil der ganz frühen Blockwelt-Spiele:
   16 × 16 Pixel, kräftige Farben, grobes Rauschen, Steine mit dunklen Fugen,
   Bretter mit Nahtreihen, Gras mit tropfender Kante. Alles hier im Code
   gemalt — nachempfunden, nicht abgemalt. In den Optionen umschaltbar;
   Gras und Laub sind gleich grün eingefärbt. */
'use strict';

const KLASSIK = {};                       // Name der Textur → Maler (K: 16×16-Leinwand)
function klassik(name, fn){ KLASSIK[name] = fn; }

/** 16 × 16 Pixel zum Malen, mit eigenem Zufall je Bild */
class K16{
  constructor(seed){ this.d = new Uint8Array(16*16*4); this.r = mulberry32(seed); }
  zahl(n){ return (this.r()*n) | 0; }
  put(x, y, c, a = 255){ const i = (((y & 15) << 4) | (x & 15))*4; this.d[i] = c[0]; this.d[i+1] = c[1]; this.d[i+2] = c[2]; this.d[i+3] = a; }
  get(x, y){ const i = (((y & 15) << 4) | (x & 15))*4; return [this.d[i], this.d[i+1], this.d[i+2], this.d[i+3]]; }
  /** jedes Pixel aus fn(x, y) → Farbe (mit a an Stelle 3, sonst deckend) */
  jedes(fn){ for(let y = 0; y < 16; y++) for(let x = 0; x < 16; x++){ const c = fn(x, y); if(c) this.put(x, y, c, c[3] === undefined ? 255 : c[3]); } }
}
const kHell = (c, f) => [0, 1, 2].map(i => Math.max(0, Math.min(255, Math.round(c[i]*f))));
const kMisch = (a, b, t) => [0, 1, 2].map(i => Math.round(a[i] + (b[i] - a[i])*t));
/** Rauschen: jedes Pixel die Grundfarbe, zufällig etwas heller oder dunkler; stufen = [[Anteil, Faktor], …] */
function kRauschen(K, farbe, stufen){
  K.jedes(() => { let n = K.r(); for(const [anteil, f] of stufen){ if(n < anteil) return kHell(farbe, f); n -= anteil; } return farbe; });
}

/* — Grundfarben — */
const KF = {
  stein: [127, 127, 127], erde: [134, 96, 67], gras: [104, 158, 60], sand: [219, 211, 160], holz: [168, 135, 82],
  rinde: [102, 81, 50], laub: [72, 132, 40], fichte: [58, 88, 56], fichtenrinde: [60, 44, 28], schnee: [242, 250, 250],
  sandstein: [218, 206, 156],
};

/* ── Steine und Erden ────────────────────────────────────────────── */
const kStein = K => {
  kRauschen(K, KF.stein, [[.14, .86], [.16, .93], [.12, 1.08]]);
  // kurze dunkle Striche quer, wie Adern
  for(let i = 0; i < 6; i++){ const x = K.zahl(16), y = K.zahl(16), l = 2 + K.zahl(3); for(let k = 0; k < l; k++) K.put(x + k, y, kHell(KF.stein, .8)); }
  for(let i = 0; i < 4; i++){ const x = K.zahl(16), y = K.zahl(16); K.put(x, y, kHell(KF.stein, 1.16)); K.put(x + 1, y, kHell(KF.stein, 1.1)); }
};
klassik('stone', kStein);

/** Steine mit Fugen: n Kerne (kachelbar), Licht von oben links */
function kKiesel(K, n, farbe, fuge, fugenBreite, hell){
  const pts = []; for(let i = 0; i < n; i++) pts.push([K.r()*16, K.r()*16, .88 + K.r()*.26]);
  K.jedes((x, y) => {
    let d1 = 99, d2 = 99, b = null;
    for(const p of pts) for(const ox of [-16, 0, 16]) for(const oy of [-16, 0, 16]){
      const d = Math.hypot(x + .5 - p[0] - ox, y + .5 - p[1] - oy);
      if(d < d1){ d2 = d1; d1 = d; b = [p, ox, oy]; } else if(d < d2) d2 = d;
    }
    if(d2 - d1 < fugenBreite) return kHell(fuge, .9 + K.r()*.2);
    const [p, ox, oy] = b, dx = x + .5 - p[0] - ox, dy = y + .5 - p[1] - oy;
    return kHell(farbe, (p[2] - (dx + dy)*hell) * (1 + (K.r() - .5)*.12));
  });
}
klassik('cobble', K => {
  kKiesel(K, 10, [134, 134, 134], [86, 86, 86], .95, .022);
  for(let i = 0; i < 10; i++){ const x = K.zahl(16), y = K.zahl(16), c = K.get(x, y); if(c[0] > 100) K.put(x, y, kHell(c, 1.14)); }
});
klassik('gravel', K => {
  kKiesel(K, 14, [132, 124, 120], [92, 86, 82], .8, .05);
  // manche Kiesel bräunlich, manche heller
  for(let i = 0; i < 18; i++){ const x = K.zahl(16), y = K.zahl(16), c = K.get(x, y); K.put(x, y, K.r() < .5 ? kMisch(c, [140, 110, 90], .4) : kHell(c, 1.18)); }
});
klassik('bedrock', K => {
  const P = [[40, 40, 40], [62, 62, 62], [86, 86, 86], [112, 112, 112], [140, 140, 140]];
  K.jedes(() => P[Math.min(4, (K.r()*K.r()*6) | 0)]);
  for(let i = 0; i < 5; i++){ const x = K.zahl(16), y = K.zahl(16); for(let k = 0; k < 3; k++) K.put(x + K.zahl(2), y + k, [30, 30, 30]); }
});
const kErde = K => {
  K.jedes(() => {
    const n = K.r();
    if(n < .05) return [118, 112, 106];                         // Steinchen
    if(n < .22) return kHell(KF.erde, .78);
    if(n < .36) return kHell(KF.erde, .9);
    if(n < .46) return kHell(KF.erde, 1.12);
    return KF.erde;
  });
};
klassik('dirt', kErde);
klassik('farmland', K => {
  // feuchte, dunkle Erde; Furchen quer mit Schollen, nicht ganz gerade
  const nass = kHell(KF.erde, .62);
  kRauschen(K, nass, [[.2, .85], [.16, 1.12], [.04, 1.3]]);
  for(let y = 1; y < 16; y += 4) for(let x = 0; x < 16; x++){
    const dy = K.r() < .2 ? 1 : 0;
    K.put(x, y + dy, kHell(nass, .66));
    if(K.r() < .45) K.put(x, y - 1 + dy, kHell(nass, 1.25));
  }
});
klassik('sand', K => kRauschen(K, KF.sand, [[.16, .93], [.12, 1.05], [.05, .86]]));
klassik('snow', K => {
  kRauschen(K, KF.schnee, [[.18, .95], [.06, .9]]);
  for(let i = 0; i < 5; i++) K.put(K.zahl(16), K.zahl(16), [214, 226, 236]);
});

/* ── Gras: oben grün, an der Seite eine tropfende Kante ─────────── */
const kGras = K => kRauschen(K, KF.gras, [[.16, .86], [.18, .93], [.12, 1.1], [.04, .78]]);
klassik('grass_top', kGras);
function kGrasSeite(K, farbe, stufen){
  kErde(K);
  const tief = [];
  for(let x = 0; x < 16; x++) tief.push(3 + (K.r() < .4 ? 1 : 0) + (K.r() < .18 ? 1 : 0) + (K.r() < .08 ? 2 : 0));
  for(let x = 0; x < 16; x++) for(let y = 0; y < tief[x]; y++){
    let f = 1, n = K.r();
    for(const [anteil, g] of stufen){ if(n < anteil){ f = g; break; } n -= anteil; }
    K.put(x, y, kHell(farbe, y === tief[x] - 1 ? f*.86 : f));
  }
}
klassik('grass_side', K => kGrasSeite(K, KF.gras, [[.2, .88], [.15, 1.08]]));
klassik('grass_side_snow', K => kGrasSeite(K, KF.schnee, [[.2, .94]]));

/* ── Holz ────────────────────────────────────────────────────────── */
/** Bretter: vier Reihen zu je vier Pixeln. Unten jede Reihe eine dunkle Naht,
    oben eine helle Kante; lange Maserstriche; jede Reihe an einer anderen
    Stelle gestoßen, der Stoß dunkel mit hellem Nachbarn */
function kBretter(K, farbe){
  K.jedes((x, y) => {
    const r = y & 3;
    if(r === 3) return kHell(farbe, .56);                                     // Naht
    if(r === 0) return kHell(farbe, K.r() < .3 ? 1.08 : 1.14);                 // Lichtkante
    const n = K.r();
    return kHell(farbe, n < .16 ? .9 : n < .24 ? 1.06 : 1);
  });
  for(let reihe = 0; reihe < 4; reihe++){
    const y0 = reihe*4;
    // Maserung: ein, zwei lange dunkle Striche, darunter heller
    for(let m = 0; m < 2; m++){
      const gy = y0 + 1 + K.zahl(2), gx = K.zahl(16), l = 4 + K.zahl(6);
      for(let k = 0; k < l; k++){ K.put(gx + k, gy, kHell(farbe, .8)); if(gy + 1 < y0 + 3 && K.r() < .5) K.put(gx + k, gy + 1, kHell(farbe, 1.06)); }
    }
    const x = (reihe*7 + 2 + K.zahl(4)) & 15;
    for(let y = y0; y < y0 + 3; y++){ K.put(x, y, kHell(farbe, .6)); K.put(x + 1, y, kHell(farbe, 1.12)); }   // Stoß
  }
}
klassik('planks', K => kBretter(K, KF.holz));
/** Rinde: senkrechte Streifen, dunkle Risse, helle Grate */
function kRinde(K, farbe){
  const spalten = [];
  for(let x = 0; x < 16; x++) spalten.push(x % 4 === 0 ? .7 : x % 4 === 2 ? 1.12 : K.r() < .3 ? .88 : 1);
  K.jedes((x, y) => kHell(farbe, spalten[x] * (K.r() < .14 ? .9 : K.r() < .08 ? 1.1 : 1)));
  for(let i = 0; i < 7; i++){
    const x = K.zahl(16), y = K.zahl(16), l = 2 + K.zahl(4);
    for(let k = 0; k < l; k++) K.put(x, y + k, kHell(farbe, .6));
    K.put(x + 1, y + K.zahl(l), kHell(farbe, 1.2));
  }
}
/** Stirnseite: Jahresringe um einen hellen Kern, außen die Rinde */
function kStirn(K, innen, rinde){
  K.jedes((x, y) => {
    const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if(r > 7) return kHell(rinde, K.r() < .3 ? .8 : 1);
    if(r < 1) return kHell(innen, 1.1);
    const ring = Math.floor(r) % 2 ? .8 : 1.02;
    return kHell(innen, ring * (K.r() < .1 ? .92 : 1));
  });
}
klassik('log_side', K => kRinde(K, KF.rinde));
klassik('log_top', K => kStirn(K, [180, 146, 92], KF.rinde));
klassik('fichte_side', K => kRinde(K, KF.fichtenrinde));
klassik('fichte_top', K => kStirn(K, [150, 112, 70], KF.fichtenrinde));

/* ── Laub: grün, mit Lücken zum Durchsehen ───────────────────────── */
function kLaub(K, farbe, luecken){
  K.jedes(() => {
    const n = K.r();
    if(n < luecken) return [0, 0, 0, 0];
    return kHell(farbe, n < luecken + .18 ? .78 : n < luecken + .36 ? .9 : n > .9 ? 1.18 : 1);
  });
}
klassik('leaves', K => kLaub(K, KF.laub, .16));
klassik('fichtennadeln', K => kLaub(K, KF.fichte, .14));

/* ── Glas: nur ein heller Rahmen und zwei Glanzstriche ───────────── */
klassik('glass', K => {
  K.jedes((x, y) => {
    const rand = x === 0 || y === 0 || x === 15 || y === 15;
    if(rand) return (x + y) % 5 === 0 ? [180, 210, 220] : [222, 238, 244];
    return [0, 0, 0, 0];
  });
  for(let k = 0; k < 4; k++){ K.put(3 + k, 5 - k, [236, 246, 250]); K.put(9 + k, 12 - k, [236, 246, 250]); }
  K.put(4, 3, [236, 246, 250]);
});

/* ── Erze und Blöcke daraus ──────────────────────────────────────── */
/* Erz: Stein mit fünf, sechs dicken Brocken. Jeder Brocken hat oben links
   einen hellen Glanz, unten rechts Schatten, und der Stein um ihn herum
   ist dunkler — so liegen sie wie eingewachsen darin. */
const ERZ_FORMEN = [
  ['.##.', '####', '.###'], ['.##', '###', '##.'], ['##.', '###', '.##'], ['###', '###', '.#.'], ['.#.', '###', '.##'], ['##', '###', '.##'],
];
function kErz(farbe, hell, dunkel){
  return K => {
    kStein(K);
    const belegt = new Set();
    for(let n = 0, versuch = 0; n < 5 && versuch < 80; versuch++){
      const f = ERZ_FORMEN[K.zahl(ERZ_FORMEN.length)], x0 = K.zahl(16), y0 = K.zahl(16);
      const zellen = [];
      f.forEach((z, dy) => [...z].forEach((c, dx) => { if(c === '#') zellen.push([(x0 + dx) & 15, (y0 + dy) & 15]); }));
      // nicht in einen anderen Brocken hinein und nicht direkt daneben
      if(zellen.some(([x, y]) => [-1, 0, 1].some(a => [-1, 0, 1].some(b => belegt.has(((x + a) & 15) + ',' + ((y + b) & 15)))))) continue;
      const hier = new Set(zellen.map(([x, y]) => x + ',' + y));
      // Rand im Stein: rechts und unten dunkler
      for(const [x, y] of zellen) for(const [a, b] of [[1, 0], [0, 1], [1, 1]]){
        const k = ((x + a) & 15) + ',' + ((y + b) & 15);
        if(!hier.has(k)) K.put(x + a, y + b, kHell(KF.stein, .66));
      }
      for(const [x, y] of zellen){
        const obenFrei = !hier.has(x + ',' + ((y - 1) & 15)), linksFrei = !hier.has(((x - 1) & 15) + ',' + y);
        const untenFrei = !hier.has(x + ',' + ((y + 1) & 15)), rechtsFrei = !hier.has(((x + 1) & 15) + ',' + y);
        K.put(x, y, obenFrei && linksFrei ? hell : untenFrei || rechtsFrei ? dunkel : farbe);
      }
      zellen.forEach(([x, y]) => { belegt.add(x + ',' + y); });
      n++;
    }
  };
}
klassik('coal_ore', kErz([46, 46, 46], [92, 92, 92], [22, 22, 22]));
klassik('iron_ore', kErz([214, 170, 138], [240, 214, 190], [160, 116, 88]));
klassik('gold_ore', kErz([250, 226, 64], [255, 252, 170], [200, 150, 20]));
klassik('diamond_ore', kErz([90, 226, 222], [226, 255, 254], [30, 160, 156]));
klassik('rs_erz', kErz([226, 20, 20], [255, 120, 110], [130, 6, 6]));
/** Block aus Barren: heller Rand oben links, dunkler unten rechts, feine Linien */
function kMetall(hell, mitte, dunkel){
  return K => K.jedes((x, y) => {
    if(x === 0 || y === 0) return hell;
    if(x === 15 || y === 15) return dunkel;
    if(x === 1 || y === 1) return kMisch(hell, mitte, .5);
    if(x === 14 || y === 14) return kMisch(dunkel, mitte, .5);
    if((x + y) % 7 === 0) return kMisch(mitte, hell, .45);
    return kHell(mitte, K.r() < .1 ? .95 : 1);
  });
}
klassik('iron_block', kMetall([250, 250, 250], [220, 220, 220], [150, 150, 150]));
klassik('gold_block', kMetall([255, 255, 150], [248, 222, 60], [190, 140, 20]));
klassik('diamond_block', kMetall([220, 255, 252], [100, 226, 218], [40, 150, 144]));
klassik('rs_block', kMetall([255, 90, 70], [200, 20, 10], [110, 10, 5]));

/* ── Geräte ──────────────────────────────────────────────────────── */
/** Pixel für Pixel: 16 Zeilen zu 16 Zeichen, jedes Zeichen eine Farbe aus
    farben oder eine Funktion (x, y) → Farbe; unbekannte Zeichen bleiben stehen.
    rauschen: wie weit jedes Pixel zufällig heller oder dunkler werden darf */
function kPixel(K, zeilen, farben, rauschen = 0){
  if(zeilen.length !== 16 || zeilen.some(z => z.length !== 16)) throw new Error('kPixel: 16 × 16 Zeichen');
  for(let y = 0; y < 16; y++) for(let x = 0; x < 16; x++){
    const f = farben[zeilen[y][x]];
    if(!f) continue;
    const c = typeof f === 'function' ? f(x, y) : f;
    K.put(x, y, rauschen ? kHell(c, 1 + (K.r() - .5)*rauschen) : c);
  }
}
/* Werkbank: oben eine Platte in einem Rahmen mit eisernen Eckwinkeln, darin
   neun erhabene Felder; an den Seiten Tischkante, Beine an den Ecken,
   Bretter dazwischen und Werkzeug am Haken — vorn Hammer und Säge, an der
   Seite Beil und Zange. */
const WERKBANK = {
  O: [44, 28, 14], S: [58, 38, 20], D: [92, 60, 30], f: [150, 104, 58], g: [84, 54, 28], G: [62, 40, 20],
  c: [200, 148, 92], b: [172, 122, 72], a: [144, 98, 56],
  t: [206, 150, 92], T: [170, 118, 68], l: [124, 78, 42], m: [98, 60, 30], n: [66, 40, 20],
  p: [186, 146, 92], q: [164, 126, 78], r: [140, 104, 62], P: [52, 34, 18],
  J: [214, 214, 220], I: [150, 150, 158], K: [86, 86, 94], h: [150, 96, 54], H: [104, 62, 30],
};
klassik('craft_top', K => kPixel(K, [
  'OOOOOOOOOOOOOOOO',
  'OJIffffffffffIIO',
  'OISSSSSSSSSSSSIO',
  'OfSccbgccbgccbDO',
  'OfScbagcbagcbaDO',
  'OfSbaagbaagbaaDO',
  'OfSgggGgggGgggDO',
  'OfSccbgccbgccbDO',
  'OfScbagcbagcbaDO',
  'OfSbaagbaagbaaDO',
  'OfSgggGgggGgggDO',
  'OfSccbgccbgccbDO',
  'OfScbagcbagcbaDO',
  'OISbaagbaagbaaIO',
  'OIIDDDDDDDDDDIKO',
  'OOOOOOOOOOOOOOOO',
], WERKBANK, .08));
klassik('craft_front', K => kPixel(K, [
  'OOOOOOOOOOOOOOOO',
  'tttttttttttttttt',
  'TTTTTTTTTTTTTTTT',
  'SSSSSSSSSSSSSSSS',
  'lmqqqPqqqqPqqqmn',
  'lmpJJJJKphhhHpmn',
  'lmqIIIIKqhSSHqmn',
  'lmgggHggghhhHgmn',
  'lmppphpppJIIKpmn',
  'lmqqqhqqqJIIKqmn',
  'lmrqqhqqqJIKqqmn',
  'lmgggHgggJIIggmn',
  'lmppphpppJKpppmn',
  'lmqqqhqqqJIqqqmn',
  'lmqrqHqqqKqqqqmn',
  'nngggggggggggggn',
], WERKBANK, .08));
klassik('craft_side', K => kPixel(K, [
  'OOOOOOOOOOOOOOOO',
  'tttttttttttttttt',
  'TTTTTTTTTTTTTTTT',
  'SSSSSSSSSSSSSSSS',
  'lmqqqqPqqqPPqqmn',
  'lmppIIhppJIppqmn',
  'lmqJIIhqqJIqqqmn',
  'lmgJIIhggKKgggmn',
  'lmppKKhppIpIppmn',
  'lmqqqqhqqIqIqqmn',
  'lmrqqqhqIqqqIqmn',
  'lmggggHgIgggIgmn',
  'lmppppHpKpppKpmn',
  'lmqqqqhqqqqqqqmn',
  'lmqrqqHqqqqqqrmn',
  'nngggggggggggggn',
], WERKBANK, .08));
/* Kürbis: senkrechte Rippen, oben ein Stiel, geschnitzt mit Augen und Mund */
const kKuerbis = K => K.jedes((x, y) => {
  const r = (x + 1) & 3, c = r === 0 ? [168, 84, 12] : r === 2 ? [236, 150, 40] : [214, 118, 24];
  return kHell(c, (y === 0 || y === 15 ? .85 : 1) * (K.r() < .12 ? .94 : 1));
});
klassik('kuerbis', kKuerbis);
klassik('kuerbis_oben', K => {
  K.jedes((x, y) => { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)); return kHell([214, 118, 24], d > 6.5 ? .85 : ((Math.round(d) & 1) ? 1.08 : .96)); });
  for(const [x, y] of [[7, 7], [8, 7], [7, 8], [8, 8]]) K.put(x, y, [86, 106, 30]);
  K.put(8, 6, [110, 134, 40]);
});
klassik('kuerbis_gesicht', K => {
  kKuerbis(K);
  const loch = [[3, 4], [4, 4], [11, 4], [12, 4], [3, 5], [4, 5], [5, 5], [10, 5], [11, 5], [12, 5],
    [3, 10], [4, 10], [6, 10], [7, 10], [8, 10], [9, 10], [11, 10], [12, 10], [4, 11], [5, 11], [6, 11], [9, 11], [10, 11], [11, 11]];
  for(const [x, y] of loch) K.put(x, y, (x + y) & 1 ? [40, 18, 6] : [60, 28, 8]);
});
/* Ofen: gemauerter Stein mit einem Sims rundherum und einem Sockel. Vorn
   oben ein schmales Zugloch, unter dem Sims das Feuerloch mit Rundbogen und
   Rost; brennt er, glühen beide und der Bogen bekommt Widerschein. */
const kOfenGrau = s => (x, y) => {
  const n = h2(x >> 1, (y + (x >> 2)) >> 1, s)*.55 + h2(x, y, s + 1)*.45;
  return n < .14 ? [102, 102, 106] : n < .34 ? [118, 118, 122] : n < .62 ? [132, 132, 136] : n < .86 ? [146, 146, 150] : [164, 164, 168];
};
const OFEN = {
  O: [46, 46, 50], L: [184, 184, 188], Z: [80, 80, 86], z: [98, 98, 104], k: [88, 88, 92],
  N: [18, 16, 16], n: [30, 27, 26], A: [70, 66, 64], R: [58, 58, 62], r: [88, 88, 94],
};
function kOfenSeite(zeilen, s, extra){
  return K => kPixel(K, zeilen, Object.assign({ s: kOfenGrau(s) }, OFEN, extra), .06);
}
const OFEN_SEITE = [
  'OOOOOOOOOOOOOOOO',
  'ZLLLLLLLLLLLLLLO',
  'ZssssssssssssssO',
  'ZssssssssksssssO',
  'ZssssssssssssssO',
  'ZssksssssssssssO',
  'ZssssssssssssssO',
  'ZLLLLLLLLLLLLLLO',
  'ZZZZZZZZZZZZZZZO',
  'ZssssssssssssssO',
  'ZssssssksssssssO',
  'ZssssssssssssssO',
  'ZssssssssssskssO',
  'ZssssssssssssssO',
  'ZZZZZZZZZZZZZZZO',
  'OOOOOOOOOOOOOOOO',
];
klassik('furn_side', kOfenSeite(OFEN_SEITE, 301));
klassik('furn_top', kOfenSeite([
  'OOOOOOOOOOOOOOOO',
  'OLLLLLLLLLLLLLZO',
  'OLssssssssssssZO',
  'OLssssssskssssZO',
  'OLssssssssssssZO',
  'OLssskssssssssZO',
  'OLssssssssssssZO',
  'OLssssssssssssZO',
  'OLssssssssssssZO',
  'OLssssssssskssZO',
  'OLssssssssssssZO',
  'OLssssssssssssZO',
  'OLskssssssssssZO',
  'OLssssssssssssZO',
  'OZZZZZZZZZZZZZZO',
  'OOOOOOOOOOOOOOOO',
], 302));
const OFEN_VORN = [
  'OOOOOOOOOOOOOOOO',
  'ZLLLLLLLLLLLLLLO',
  'ZssZZZZZZZZZZssO',
  'ZssZ12121212LssO',
  'ZssZ21212121LssO',
  'ZssLLLLLLLLLLssO',
  'ZssssssssssssssO',
  'ZLLLLLLLLLLLLLLO',
  'ZZZZZZZZZZZZZZZO',
  'ZsZL34444443LLsO',
  'ZsZ4454445444LsO',
  'ZsZ5565556555LsO',
  'ZsZ6676767667LsO',
  'ZsZRrRrRrRrRrLsO',
  'ZZZZZZZZZZZZZZZO',
  'OOOOOOOOOOOOOOOO',
];
klassik('furn_front', kOfenSeite(OFEN_VORN, 303, {
  1: [24, 22, 22], 2: [34, 31, 30], 3: [26, 24, 24], 4: [16, 14, 14], 5: [20, 18, 18], 6: [30, 28, 27], 7: [66, 62, 60],
  R: [74, 74, 80], r: [22, 20, 20],
}));
klassik('furn_lit', kOfenSeite(OFEN_VORN, 303, {
  1: [255, 150, 40], 2: [236, 96, 24], 3: [150, 60, 20], 4: [110, 36, 14], 5: [226, 92, 22], 6: [255, 170, 50], 7: [255, 232, 130],
  L: (x, y) => (x === 13 && y >= 9 && y <= 13) || (y === 5 && x >= 3 && x <= 12) ? [214, 170, 132] : [184, 184, 188],
  R: [196, 90, 24], r: [255, 214, 90],
}));
function kTruhe(K, vorn, oben){
  kBretter(K, [150, 108, 58]);
  K.jedes((x, y) => (x === 0 || y === 0 || x === 15 || y === 15) ? [70, 46, 24] : null);
  if(!oben) for(let x = 1; x < 15; x++){ K.put(x, 5, [70, 46, 24]); K.put(x, 6, [120, 84, 44]); }
  if(vorn) for(let y = 4; y < 9; y++) for(let x = 7; x < 9; x++) K.put(x, y, y === 4 || y === 8 ? [110, 110, 110] : [200, 200, 200]);
}
klassik('chest_top', K => kTruhe(K, false, true));
klassik('chest_side', K => kTruhe(K, false, false));
klassik('chest_front', K => kTruhe(K, true, false));
function kPlattenspieler(K, oben, voll){
  kBretter(K, [120, 84, 58]);
  K.jedes((x, y) => (x === 0 || y === 0 || x === 15 || y === 15) ? [70, 48, 32] : null);
  if(!oben) return;
  for(let y = 3; y < 13; y++) for(let x = 3; x < 13; x++) K.put(x, y, [40, 32, 28]);
  if(voll) for(let y = 5; y < 11; y++) for(let x = 5; x < 11; x++) K.put(x, y, (x + y) % 3 ? [24, 24, 26] : [60, 60, 70]);
  K.put(7, 7, [90, 90, 90]); K.put(8, 8, [90, 90, 90]);
}
klassik('jukebox_side', K => kPlattenspieler(K, false));
klassik('jukebox_top', K => kPlattenspieler(K, true, false));
klassik('jukebox_top_voll', K => kPlattenspieler(K, true, true));

/* ── Gebautes ────────────────────────────────────────────────────── */
klassik('stonebrick', K => {
  K.jedes((x, y) => {
    const reihe = y >> 3, fx = (x + (reihe ? 8 : 0)) & 15;
    if((y & 7) === 7 || fx === 15) return [72, 72, 72];                  // Fugen
    if((y & 7) === 0 || fx === 0) return [150, 150, 150];                 // helle Kante
    const n = K.r();
    return kHell([122, 122, 122], n < .18 ? .9 : n < .28 ? 1.08 : 1);
  });
});
klassik('sandstone', K => {
  kRauschen(K, KF.sandstein, [[.14, .94], [.1, 1.04]]);
  for(let x = 0; x < 16; x++){
    K.put(x, 0, kHell(KF.sandstein, 1.06)); K.put(x, 3, kHell(KF.sandstein, .84));
    K.put(x, 12, kHell(KF.sandstein, .86)); K.put(x, 15, kHell(KF.sandstein, .8));
    if(K.r() < .5) K.put(x, 13, kHell(KF.sandstein, .9));
  }
});
klassik('sandstone_top', K => kRauschen(K, KF.sandstein, [[.18, .93], [.12, 1.05], [.04, .85]]));
klassik('cactus_side', K => {
  K.jedes((x, y) => {
    const streifen = x === 0 || x === 15 ? .7 : x === 3 || x === 7 || x === 11 ? .8 : 1;
    return kHell([30, 124, 34], streifen * (K.r() < .15 ? .9 : 1));
  });
  for(let i = 0; i < 10; i++){ const x = 1 + K.zahl(14), y = K.zahl(16); K.put(x, y, [40, 40, 30]); K.put(x, y - 1, [200, 220, 170]); }
});
klassik('cactus_top', K => K.jedes((x, y) => {
  const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
  return kHell([30, 124, 34], r > 7 ? .7 : r > 6 ? .82 : r < 3 ? 1.12 : 1);
}));
/* Wolle: gewebt, in den vier Farben der Schafe */
function kWolle(tint){
  return K => K.jedes((x, y) => {
    const web = ((x + y) & 3) === 0 ? .9 : ((x - y) & 3) === 0 ? 1.04 : 1;
    return kHell([226, 226, 226].map((c, i) => c*tint[i]), web * (K.r() < .12 ? .94 : 1));
  });
}
for(let k = 0; k < 4; k++) klassik('wool' + k, K => kWolle(WOLLE[k].tint)(K));

/* ── Tiere und Monster ───────────────────────────────────────────────
   Grob wie früher: Gesichter und Flecken in Doppelpixeln (8 × 8 Felder),
   die Spielerfigur bleibt, wie sie ist. */
/** 8 × 8 Felder zu je 2 × 2 Pixeln malen; zeilen: 8 Zeichenketten, farben: Zeichen → Farbe */
function kFelder(K, zeilen, farben, rauschen = .06){
  for(let fy = 0; fy < 8; fy++) for(let fx = 0; fx < 8; fx++){
    const c = farben[zeilen[fy][fx]];
    if(!c) continue;
    for(let y = 0; y < 2; y++) for(let x = 0; x < 2; x++){
      const n = K.r();
      K.put(fx*2 + x, fy*2 + y, c.length === 4 ? c : kHell(c, n < rauschen ? .92 : n > 1 - rauschen ? 1.06 : 1), c.length === 4 ? c[3] : 255);
    }
  }
}
/** Fell: Doppelpixel in Grundfarbe mit hellen und dunklen Tupfen */
function kFell(K, farbe, dunkel = .9, hell = 1.07, anteil = .22){
  for(let fy = 0; fy < 8; fy++) for(let fx = 0; fx < 8; fx++){
    const n = K.r(), f = n < anteil/2 ? dunkel : n < anteil ? hell : 1;
    for(let y = 0; y < 2; y++) for(let x = 0; x < 2; x++) K.put(fx*2 + x, fy*2 + y, kHell(farbe, f*(K.r() < .12 ? .96 : 1)));
  }
}
/** Bein: Fell, unten zwei Reihen Huf */
function kBein(farbe, huf){ return K => { kFell(K, farbe); for(let y = 12; y < 16; y++) for(let x = 0; x < 16; x++) K.put(x, y, kHell(huf, K.r() < .2 ? .9 : 1)); }; }

const TIER = {
  schwein: [238, 164, 160], rind: [236, 236, 232], schwarz: [44, 40, 40], schaf: [216, 186, 152], huhn: [242, 242, 238],
  zombie: [76, 128, 64], hemd: [30, 150, 160], hose: [70, 62, 156], knochen: [206, 206, 200], dorf: [196, 142, 106],
};
klassik('m_pig', K => kFell(K, TIER.schwein, .92, 1.05, .3));
klassik('m_pig_face', K => kFelder(K, ['PPPPPPPP', 'PPPPPPPP', 'PWEPPEWP', 'PPPPPPPP', 'PPSSSSPP', 'PPNSSNPP', 'PPSSSSPP', 'PPPPPPPP'],
  { P: TIER.schwein, W: [245, 245, 245], E: [30, 24, 24], S: [248, 190, 186], N: [150, 84, 84] }));
klassik('m_pig_leg', kBein(TIER.schwein, [176, 112, 108]));
klassik('m_kuh', K => {
  kFell(K, TIER.rind, .93, 1.02);
  // zwei, drei große schwarze Flecken aus Doppelpixeln
  for(let f = 0; f < 3; f++){
    const cx = K.zahl(8), cy = K.zahl(8), r = 1.2 + K.r()*1.4;
    for(let fy = 0; fy < 8; fy++) for(let fx = 0; fx < 8; fx++){
      const dx = Math.min(Math.abs(fx - cx), 8 - Math.abs(fx - cx)), dy = Math.min(Math.abs(fy - cy), 8 - Math.abs(fy - cy));
      if(Math.hypot(dx, dy*1.2) <= r + (K.r() - .5)*.8) for(let y = 0; y < 2; y++) for(let x = 0; x < 2; x++) K.put(fx*2 + x, fy*2 + y, kHell(TIER.schwarz, K.r() < .15 ? 1.3 : 1));
    }
  }
});
klassik('m_kuh_face', K => kFelder(K, ['BBBWWBBB', 'BBBWWBBB', 'BWEWWEWB', 'BBBWWBBB', 'BMMMMMMB', 'BMNMMNMB', 'BMMMMMMB', 'BBBBBBBB'],
  { B: TIER.schwarz, W: TIER.rind, E: [18, 18, 18], M: [196, 156, 146], N: [96, 62, 54] }));
klassik('m_kuh_bein', K => { kFell(K, TIER.rind); for(let y = 0; y < 8; y++) for(let x = 0; x < 16; x++) if(K.r() < .5 || y < 4) K.put(x, y, TIER.schwarz); for(let y = 12; y < 16; y++) for(let x = 0; x < 16; x++) K.put(x, y, [60, 56, 52]); });
klassik('m_horn', K => { kFell(K, [226, 216, 186], .92, 1.04); for(let y = 0; y < 4; y++) for(let x = 0; x < 16; x++) K.put(x, y, [120, 110, 90]); });
klassik('m_euter', K => kFell(K, [232, 150, 150], .9, 1.06));
klassik('m_schaf_wolle', K => {
  for(let fy = 0; fy < 8; fy++) for(let fx = 0; fx < 8; fx++){
    const n = K.r(), f = n < .25 ? .88 : n < .4 ? 1.03 : .96;
    for(let y = 0; y < 2; y++) for(let x = 0; x < 2; x++) K.put(fx*2 + x, fy*2 + y, kHell([246, 246, 242], f*((x + y) % 2 ? .97 : 1)));
  }
});
klassik('m_schaf_haut', K => kFell(K, TIER.schaf, .92, 1.04));
klassik('m_schaf_face', K => kFelder(K, ['FFFFFFFF', 'FFFFFFFF', 'FWEFFEWF', 'FFFFFFFF', 'FFFDDFFF', 'FFFNNFFF', 'FFFFFFFF', 'FFFFFFFF'],
  { F: TIER.schaf, W: [245, 245, 245], E: [28, 24, 24], D: [196, 164, 132], N: [170, 118, 104] }));
klassik('m_schaf_bein', kBein(TIER.schaf, [120, 96, 76]));
klassik('m_huhn', K => kFell(K, TIER.huhn, .9, 1.02, .18));
klassik('m_huhn_face', K => kFelder(K, ['HHHHHHHH', 'HHHHHHHH', 'HEHHHHEH', 'HEHHHHEH', 'HHHHHHHH', 'HHHHHHHH', 'HHHHHHHH', 'HHHHHHHH'],
  { H: TIER.huhn, E: [20, 20, 20] }));
klassik('m_huhn_fluegel', K => { kFell(K, TIER.huhn, .9, 1.02); for(let y = 12; y < 16; y++) for(let x = 0; x < 16; x++) K.put(x, y, [196, 196, 190]); });
klassik('m_huhn_schnabel', K => kFell(K, [242, 170, 44], .9, 1.06));
klassik('m_huhn_lappen', K => kFell(K, [214, 30, 30], .86, 1.08));
klassik('m_huhn_bein', K => kFell(K, [236, 156, 40], .9, 1.05));
klassik('m_huhn_fuss', K => kFell(K, [236, 156, 40], .9, 1.05));
klassik('m_zsk', K => kFell(K, TIER.zombie, .86, 1.06, .3));
klassik('m_zarm', K => kFell(K, TIER.zombie, .86, 1.06, .3));
klassik('m_zface', K => kFelder(K, ['GGGGGGGG', 'GGGGGGGG', 'GEEGGEEG', 'GGGGGGGG', 'GGGDDGGG', 'GDMMMMDG', 'GGGGGGGG', 'GGGGGGGG'],
  { G: TIER.zombie, E: [18, 28, 16], D: [54, 94, 46], M: [34, 58, 30] }, .12));
klassik('m_zshirt', K => { kFell(K, TIER.hemd, .82, 1.06, .3); for(let x = 0; x < 16; x += 2) if(K.r() < .45) K.put(x, 15, TIER.zombie); });
klassik('m_zpants', K => kFell(K, TIER.hose, .84, 1.08, .26));
klassik('m_skelett', K => kFell(K, TIER.knochen, .9, 1.04, .2));
klassik('m_skelett_face', K => kFelder(K, ['KKKKKKKK', 'KKKKKKKK', 'KDDKKDDK', 'KDDKKDDK', 'KKKDDKKK', 'KKKKKKKK', 'KDKDKDKK', 'KKKKKKKK'],
  { K: TIER.knochen, D: [44, 44, 44] }));
klassik('m_skelett_brust', K => kFelder(K, ['DDDKKDDD', 'KKKKKKKK', 'DDDKKDDD', 'KKKKKKKK', 'DDDKKDDD', 'KKKKKKKK', 'DDDKKDDD', 'DDDKKDDD'],
  { K: TIER.knochen, D: [44, 44, 44] }, .1));
klassik('m_dorf_haut', K => kFell(K, TIER.dorf, .92, 1.05, .2));
klassik('m_dorf_face', K => kFelder(K, ['HHHHHHHH', 'HBBBBBBH', 'HWGHHGWH', 'HHHHHHHH', 'HHHHHHHH', 'HHHHHHHH', 'HHHMMHHH', 'HHHHHHHH'],
  { H: TIER.dorf, B: [66, 42, 28], W: [240, 240, 236], G: [40, 140, 64], M: [128, 78, 56] }));
klassik('m_dorf_kutte', K => { kFell(K, [232, 232, 226], .9, 1.04, .3); for(let x = 0; x < 16; x++) K.put(x, 15, [160, 160, 156]); for(let y = 0; y < 3; y++){ K.put(7 - y, y, [170, 170, 166]); K.put(8 + y, y, [170, 170, 166]); } });
klassik('m_golem', K => {
  kFell(K, [212, 206, 198], .9, 1.05, .3);
  for(let i = 0; i < 4; i++){ const x = K.zahl(16), y = K.zahl(16); K.put(x, y, [150, 100, 64]); }
  for(let y = 0; y < 11; y++) K.put(4 + (y > 5 ? 1 : 0), y, [58, 118, 38]);
  K.put(5, 3, [80, 150, 50]); K.put(3, 8, [80, 150, 50]);
});
klassik('m_golem_face', K => kFelder(K, ['GGGGGGGG', 'GBBBBBBG', 'GARGGRAG', 'GGGGGGGG', 'GGGGGGGG', 'GGGGGGGG', 'GGGGGGGG', 'GGGDDGGG'],
  { G: [212, 206, 198], B: [120, 116, 110], A: [52, 48, 46], R: [196, 44, 32], D: [170, 166, 158] }));
klassik('m_skelett_glied', K => K.jedes((x, y) => (x === 0 || x === 15) ? kHell(TIER.knochen, .7) : kHell(TIER.knochen, K.r() < .15 ? .9 : 1)));

/* ── Umschalten ──────────────────────────────────────────────────── */
/** ein klassisches Bild in voller Größe (TS × TS), Pixel scharf vergrößert */
function klassikMalen(name){
  const K = new K16(hashStr('klassik:' + name));
  KLASSIK[name](K);
  const d = new Uint8Array(TS*TS*4), f = TS/16;
  for(let y = 0; y < TS; y++) for(let x = 0; x < TS; x++){
    const q = (((y/f) | 0)*16 + ((x/f) | 0))*4, i = (y*TS + x)*4;
    d[i] = K.d[q]; d[i+1] = K.d[q+1]; d[i+2] = K.d[q+2]; d[i+3] = K.d[q+3];
  }
  ausbluten(d);
  return d;
}
const Klassik = {
  an: false,
  _modern: null,                       // die gewohnten Bilder, zum Zurückschalten
  /** umschalten: die Bilder der Blöcke tauschen, ohne die Welt neu zu bauen */
  setzen(an){
    an = !!an;
    if(!this._modern){
      this._modern = {};
      for(const n of Object.keys(KLASSIK)) if(TEX[n] !== undefined) this._modern[n] = texData[TEX[n]];
    }
    if(an === this.an) return;
    this.an = an;
    for(const n of Object.keys(KLASSIK)){
      const L = TEX[n];
      if(L === undefined) continue;
      texData[L] = an ? klassikMalen(n) : this._modern[n];
    }
    texturenNeuLaden(Object.keys(KLASSIK));
  },
};
