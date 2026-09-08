/* ═══════════════════════════════════════════════════════════════════
   Schulhausgenerator. Ein Gitter aus Fluren, dazwischen Klassenräume
   mit je einer Tür. Alles aus einem Startwert, damit sich dieselbe
   Schule reproduzieren lässt.

   Zellenwerte:
     0 Flur        1 Wand        2 Klassenraumboden
     3 Tür         4 Spind       5 Tafel        6 Ausgang
   ═══════════════════════════════════════════════════════════════════ */

export function zufall(saat){
  let a = saat >>> 0;
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const FLUR=0, WAND=1, RAUM=2, TUER=3, SPIND=4, TAFEL=5, AUSGANG=6;

export function baueSchule(saat = 1998){
  const z = zufall(saat);
  const B = 45, H = 45;                       // Gitterweite
  const k = new Uint8Array(B*H).fill(WAND);
  const bei = (x,y) => y*B+x;
  const setz = (x,y,v) => { if(x>0&&y>0&&x<B-1&&y<H-1) k[bei(x,y)] = v; };
  const hol  = (x,y) => (x<0||y<0||x>=B||y>=H) ? WAND : k[bei(x,y)];

  // Flurraster: Gänge alle 8–11 Zellen, zwei Zellen breit
  const achsenX = [3], achsenY = [3];
  while(achsenX[achsenX.length-1] < B-12) achsenX.push(achsenX[achsenX.length-1] + 8 + Math.floor(z()*4));
  while(achsenY[achsenY.length-1] < H-12) achsenY.push(achsenY[achsenY.length-1] + 8 + Math.floor(z()*4));
  for(const x of achsenX) for(let y=3;y<H-3;y++){ setz(x,y,FLUR); setz(x+1,y,FLUR); }
  for(const y of achsenY) for(let x=3;x<B-3;x++){ setz(x,y,FLUR); setz(x,y+1,FLUR); }

  // Klassenräume in die Felder zwischen den Fluren
  const raeume = [];
  for(let i=0;i<achsenX.length-1;i++){
    for(let j=0;j<achsenY.length-1;j++){
      const x0 = achsenX[i]+2, y0 = achsenY[j]+2;
      const x1 = achsenX[i+1]-1, y1 = achsenY[j+1]-1;
      if(x1-x0 < 3 || y1-y0 < 3) continue;
      if(z() < .18) continue;                            // manche Felder bleiben Wand
      for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) setz(x,y,RAUM);
      // Tür an eine zufällige Seite
      const seite = Math.floor(z()*4);
      let tx,ty;
      if(seite===0){ tx = x0+Math.floor(z()*(x1-x0)); ty = y0-1; }
      else if(seite===1){ tx = x0+Math.floor(z()*(x1-x0)); ty = y1; }
      else if(seite===2){ tx = x0-1; ty = y0+Math.floor(z()*(y1-y0)); }
      else { tx = x1; ty = y0+Math.floor(z()*(y1-y0)); }
      setz(tx,ty,TUER);
      // Tafel an der gegenüberliegenden Wand, Spinde im Flur davor
      if(seite<2) setz(x0+Math.floor((x1-x0)/2), seite===0?y1-1:y0, TAFEL);
      else setz(seite===2?x1-1:x0, y0+Math.floor((y1-y0)/2), TAFEL);
      raeume.push({x0,y0,x1,y1,tx,ty,mx:(x0+x1)/2, my:(y0+y1)/2});
    }
  }

  // Spinde an Flurwänden, damit die Gänge nicht alle gleich aussehen
  for(let y=2;y<H-2;y++) for(let x=2;x<B-2;x++){
    if(hol(x,y)!==WAND) continue;
    const nachbarFlur = hol(x-1,y)===FLUR||hol(x+1,y)===FLUR||hol(x,y-1)===FLUR||hol(x,y+1)===FLUR;
    if(nachbarFlur && z() < .26) setz(x,y,SPIND);
  }

  // Drei Ausgänge an den Außenwänden, dort wo ein Flur endet
  const ausgaenge = [];
  const kandidaten = [];
  for(const x of achsenX){ kandidaten.push([x,3,0,-1],[x,H-4,0,1]); }
  for(const y of achsenY){ kandidaten.push([3,y,-1,0],[B-4,y,1,0]); }
  for(let i=kandidaten.length-1;i>0;i--){ const j=Math.floor(z()*(i+1)); [kandidaten[i],kandidaten[j]]=[kandidaten[j],kandidaten[i]]; }
  for(const [x,y,dx,dy] of kandidaten){
    if(ausgaenge.length >= 3) break;
    if(hol(x,y)!==FLUR) continue;
    if(ausgaenge.some(a => Math.abs(a.x-x)+Math.abs(a.y-y) < 14)) continue;
    let cx=x, cy=y;
    while(hol(cx+dx,cy+dy)===WAND || hol(cx+dx,cy+dy)===SPIND){ cx+=dx; cy+=dy; setz(cx,cy,FLUR); if(cx<2||cy<2||cx>B-3||cy>H-3) break; }
    setz(cx,cy,AUSGANG); setz(cx+(dy?1:0), cy+(dx?1:0), AUSGANG);
    ausgaenge.push({x:cx, y:cy});
  }

  return {B, H, k, hol, bei, raeume, ausgaenge, achsenX, achsenY, saat,
          begehbar: (x,y) => { const v = hol(Math.floor(x), Math.floor(y));
                               return v===FLUR||v===RAUM||v===TUER||v===AUSGANG; }};
}

/* Kürzester Weg über das Gitter — die Lehrkraft braucht ihn zum Jagen. */
export function wegSuche(s, vonX, vonY, zuX, zuY, maxSchritte = 4000){
  const start = s.bei(Math.floor(vonX), Math.floor(vonY));
  const ziel  = s.bei(Math.floor(zuX),  Math.floor(zuY));
  if(start === ziel) return [];
  const vorher = new Int32Array(s.B*s.H).fill(-1);
  const q = [start]; vorher[start] = start;
  let kopf = 0, schritte = 0;
  while(kopf < q.length && schritte++ < maxSchritte){
    const c = q[kopf++];
    if(c === ziel) break;
    const cx = c % s.B, cy = (c/s.B)|0;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx = cx+dx, ny = cy+dy;
      if(nx<0||ny<0||nx>=s.B||ny>=s.H) continue;
      const n = s.bei(nx,ny);
      if(vorher[n] !== -1) continue;
      const v = s.k[n];
      if(v===WAND || v===SPIND || v===TAFEL) continue;
      vorher[n] = c; q.push(n);
    }
  }
  if(vorher[ziel] === -1) return null;
  const weg = [];
  let c = ziel;
  while(c !== start){ weg.push({x: c%s.B + .5, y: ((c/s.B)|0) + .5}); c = vorher[c]; }
  return weg.reverse();
}
