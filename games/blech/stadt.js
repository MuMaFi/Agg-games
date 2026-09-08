/* ═══════════════════════════════════════════════════════════════════
   Stadtgenerator — ein Straßenraster mit unregelmäßigen Abständen,
   dazwischen Blöcke aus Häusern, Parks und Parkplätzen. Alles aus
   einem Startwert, damit dieselbe Stadt reproduzierbar bleibt.
   ═══════════════════════════════════════════════════════════════════ */

/* Kleiner, schneller Zufallsgenerator mit Startwert (mulberry32) */
export function zufall(saat){
  let a = saat >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const STRASSE = 58;      // Fahrbahnbreite
export const GEHWEG  = 13;      // Gehweg je Seite

const HAUSFARBEN = [
  ['#8d6f5a','#6f5646'], ['#7d8a72','#616c58'], ['#8a7d6a','#6b6152'],
  ['#7a7f8c','#5e626d'], ['#946f63','#73554c'], ['#6f7f86','#556269'],
  ['#8f8464','#6e654d'], ['#7b6b7d','#5e5160'], ['#87755f','#69594a']
];

export function baueStadt(saat = 20260908){
  const z = zufall(saat);

  // Unregelmäßige Straßenachsen: mal enge Gassen, mal lange Blöcke
  const achsen = (laenge, min, max) => {
    const a = [140]; 
    while(a[a.length-1] < laenge - 260) a.push(a[a.length-1] + Math.round(min + z()*(max-min)));
    return a;
  };
  const BREITE = 3600, HOEHE = 2900;
  const sx = achsen(BREITE, 300, 560);
  const sy = achsen(HOEHE, 290, 520);

  const strassenX = sx.map(x => ({x, w: STRASSE}));
  const strassenY = sy.map(y => ({y, w: STRASSE}));

  // Blöcke zwischen den Achsen füllen
  const gebaeude = [], parks = [], parkplaetze = [];
  const RAND = STRASSE/2 + GEHWEG;
  for(let i = 0; i < sx.length - 1; i++){
    for(let j = 0; j < sy.length - 1; j++){
      const bx = sx[i] + RAND, by = sy[j] + RAND;
      const bw = sx[i+1] - sx[i] - RAND*2, bh = sy[j+1] - sy[j] - RAND*2;
      if(bw < 60 || bh < 60) continue;
      const w = z();
      if(w < .10){ parks.push({x:bx, y:by, w:bw, h:bh, baeume: baumSetzen(bx,by,bw,bh,z)}); continue; }
      if(w < .17){ parkplaetze.push({x:bx, y:by, w:bw, h:bh}); continue; }
      // Block in Parzellen teilen und bebauen
      for(const p of parzellen(bx, by, bw, bh, z)){
        if(p.w < 34 || p.h < 34) continue;
        const [f, dach] = HAUSFARBEN[Math.floor(z()*HAUSFARBEN.length)];
        gebaeude.push({x:p.x, y:p.y, w:p.w, h:p.h, farbe:f, dach,
                       stock: 1 + Math.floor(z()*5), saat: Math.floor(z()*1e6)});
      }
    }
  }

  // Straßengraph für Verkehr und Wegsuche
  const knoten = [], knotenId = new Map();
  sx.forEach((x, i) => sy.forEach((y, j) => {
    knotenId.set(i + ',' + j, knoten.length);
    knoten.push({x, y, i, j, nachbarn: []});
  }));
  const verbinde = (a, b) => { knoten[a].nachbarn.push(b); knoten[b].nachbarn.push(a); };
  sx.forEach((_, i) => sy.forEach((_, j) => {
    const a = knotenId.get(i + ',' + j);
    if(i < sx.length-1) verbinde(a, knotenId.get((i+1) + ',' + j));
    if(j < sy.length-1) verbinde(a, knotenId.get(i + ',' + (j+1)));
  }));

  return {breite: BREITE, hoehe: HOEHE, sx, sy, strassenX, strassenY,
          gebaeude, parks, parkplaetze, knoten, saat};
}

/* Einen Block rekursiv in Parzellen schneiden — ergibt ungleiche Häuser */
function parzellen(x, y, w, h, z, tiefe = 0){
  if(tiefe > 3 || (w < 120 && h < 120) || z() < .16) return [{x, y, w, h}];
  const quer = w > h ? true : h > w ? false : z() < .5;
  const t = .34 + z()*.32;
  const luecke = 5 + z()*7;
  if(quer){
    const a = Math.round(w * t);
    return [...parzellen(x, y, a - luecke, h, z, tiefe+1),
            ...parzellen(x + a, y, w - a, h, z, tiefe+1)];
  }
  const a = Math.round(h * t);
  return [...parzellen(x, y, w, a - luecke, z, tiefe+1),
          ...parzellen(x, y + a, w, h - a, z, tiefe+1)];
}

function baumSetzen(x, y, w, h, z){
  const b = [], n = Math.floor((w*h) / 5200);
  for(let i = 0; i < n; i++)
    b.push({x: x + 16 + z()*(w-32), y: y + 16 + z()*(h-32), r: 9 + z()*8});
  return b;
}

/* Liegt der Punkt auf Asphalt? Wird für Verkehr und Fahndung gebraucht. */
export function aufStrasse(stadt, x, y){
  const h = STRASSE/2;
  for(const s of stadt.strassenX) if(Math.abs(x - s.x) < h) return true;
  for(const s of stadt.strassenY) if(Math.abs(y - s.y) < h) return true;
  return false;
}
