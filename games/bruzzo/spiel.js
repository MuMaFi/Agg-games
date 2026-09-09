/* ═══════════════════════════════════════════════════════════════════
   BRUZZO — Nachtwache in einer Pizzeria, in drei Dimensionen.

   Das Haus steht als ein Stück da: Büro, zwei Gänge, Speisesaal, Bühne,
   Küche, Werkstatt und ein Lüftungsschacht liegen im selben Raum an
   ihren richtigen Plätzen. Es gibt zwei Kameras auf dieselbe Welt — die
   im Büro, mit der du dich umsiehst, und eine zweite, die beim Griff
   zum Tablet an den gewählten Kameraplatz springt. Was du dort siehst,
   ist deshalb kein Bild von einem Raum, sondern der Raum.

   Die vier Figuren stehen an echten Stellplätzen. Rückt eine vor, geht
   ihr Körper an den nächsten Platz — im Gang siehst du sie durch die
   offene Tür, in der Kamera von vorn.
   ═══════════════════════════════════════════════════════════════════ */
import * as T from 'three';

const $ = s => document.querySelector(s);
const klemm = (v,a,b) => v<a?a:v>b?b:v;
const zuf = (a,b) => a + Math.random()*(b-a);

/* ── Aufbau ───────────────────────────────────────────────────────── */
const leinwand = $('#szene');
const rnd = new T.WebGLRenderer({canvas:leinwand, antialias:false, powerPreference:'high-performance'});
rnd.setPixelRatio(Math.min(devicePixelRatio||1, 1.75));
/* Ein einziger Schattenwerfer: die Schreibtischlampe. Mehr braucht der
   Raum nicht, und ein 512er Schattenbild kostet auch auf dem Telefon
   nichts. Basic statt PCF, das passt zum harten Licht der Lampe. */
rnd.shadowMap.enabled = true;
rnd.shadowMap.type = T.BasicShadowMap;
rnd.outputColorSpace = T.SRGBColorSpace;
rnd.toneMapping = T.ACESFilmicToneMapping;
rnd.toneMappingExposure = 1.32;

const szene = new T.Scene();
szene.background = new T.Color(0x050403);
szene.fog = new T.Fog(0x0b0805, 14, 62);

const kamBuero  = new T.PerspectiveCamera(74, 1.6, 0.05, 90);
const kamTablet = new T.PerspectiveCamera(66, 1.6, 0.05, 90);
kamBuero.position.set(0, 1.5, 2.95);

const ueber = $('#ueber'), u2 = ueber.getContext('2d');
function passeAn(){
  const r = $('#buehne').getBoundingClientRect();
  const b = Math.max(2, Math.round(r.width)), h = Math.max(2, Math.round(r.height));
  rnd.setSize(b, h, false);
  kamBuero.aspect = kamTablet.aspect = b/h;
  kamBuero.updateProjectionMatrix(); kamTablet.updateProjectionMatrix();
  ueber.width = Math.round(b*0.5); ueber.height = Math.round(h*0.5);
}
addEventListener('resize', passeAn);

/* ── Werkstoffe und Texturen ──────────────────────────────────────── */
function malTextur(br, ho, malen, wiederhol){
  const c = document.createElement('canvas'); c.width = br; c.height = ho;
  malen(c.getContext('2d'), br, ho);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  if(wiederhol){ t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(wiederhol[0], wiederhol[1]); }
  t.magFilter = T.NearestFilter;
  return t;
}
/* Ein bisschen Dreck auf jede Fläche: gleichmäßige Farbfelder sehen aus
   wie Papier, und eine Pizzeria um Mitternacht ist nicht sauber. */
function schmutz(g, b, h, menge, farbe){
  g.fillStyle = farbe;
  for(let i=0;i<menge;i++){
    const x = Math.random()*b, y = Math.random()*h, r = Math.random()*2.2 + 0.4;
    g.globalAlpha = 0.05 + Math.random()*0.16;
    g.fillRect(x, y, r, r);
  }
  g.globalAlpha = 1;
}
const texBoden = malTextur(64,64,(g,b,h)=>{
  for(let j=0;j<2;j++) for(let i=0;i<2;i++){
    g.fillStyle = (i+j)%2 ? '#2b211a' : '#241b15';
    g.fillRect(i*b/2, j*h/2, b/2, h/2);
  }
  g.fillStyle='rgba(0,0,0,.35)'; g.fillRect(0,h/2-1,b,2); g.fillRect(b/2-1,0,2,h);
  schmutz(g,b,h,90,'#000'); schmutz(g,b,h,26,'#6b5334');
}, [1,1]);
const texWand = malTextur(64,64,(g,b,h)=>{
  // untere Hälfte Holzvertäfelung, oben Putz, dazwischen eine Leiste
  g.fillStyle='#241c14'; g.fillRect(0,0,b,h);
  g.fillStyle='#2c221a';
  for(let y=0;y<h;y+=16){ for(let x=(y/16%2)*16;x<b;x+=32) g.fillRect(x+1,y+1,30,14); }
  g.fillStyle='#33261a'; g.fillRect(0,h*0.62,b,h*0.38);
  for(let x=0;x<b;x+=8){ g.fillStyle='rgba(0,0,0,.22)'; g.fillRect(x,h*0.62,1,h*0.38); }
  g.fillStyle='#4a3722'; g.fillRect(0,h*0.60,b,3);
  g.fillStyle='#7a2a1c'; g.fillRect(0,h*0.575,b,2);
  schmutz(g,b,h,70,'#000');
}, [1,1]);
const texFliese = malTextur(64,64,(g,b,h)=>{
  // Schachbrett wie in jeder Pizzeria, nur seit Jahren nicht gewischt
  for(let j=0;j<4;j++) for(let i=0;i<4;i++){
    g.fillStyle = (i+j)%2 ? '#3d3126' : '#20190f';
    g.fillRect(i*b/4, j*h/4, b/4, h/4);
  }
  g.strokeStyle='rgba(0,0,0,.5)'; g.lineWidth=1;
  for(let i=1;i<4;i++){
    g.beginPath(); g.moveTo(i*b/4,0); g.lineTo(i*b/4,h); g.stroke();
    g.beginPath(); g.moveTo(0,i*h/4); g.lineTo(b,i*h/4); g.stroke();
  }
  schmutz(g,b,h,110,'#000');
}, [1,1]);
/* Deckenplatten mit Rasterfuge */
const texDecke = malTextur(64,64,(g,b,h)=>{
  g.fillStyle='#191309'; g.fillRect(0,0,b,h);
  g.fillStyle='#221a0e'; g.fillRect(2,2,b-4,h-4);
  schmutz(g,b,h,50,'#000');
}, [4,5]);
/* Warnstreifen für die Rollläden */
const texStreifen = malTextur(64,64,(g,b,h)=>{
  g.fillStyle='#3d3323'; g.fillRect(0,0,b,h);
  g.save(); g.translate(b/2,h/2); g.rotate(-0.7); g.translate(-b,-h);
  for(let x=0;x<b*2.4;x+=22){ g.fillStyle='#c8a02e'; g.fillRect(x,0,11,h*2.4); }
  g.restore();
  g.fillStyle='rgba(0,0,0,.45)';
  for(let y=6;y<h;y+=14) g.fillRect(0,y,b,3);          // Lamellen
}, [1,1]);
/* Wimpelkette und Uhr — zwei Handgriffe, die dem Raum ansehen lassen,
   dass hier tagsüber Kindergeburtstage stattfinden. */
const texWimpel = malTextur(128,32,(g,b,h)=>{
  g.clearRect(0,0,b,h);
  g.strokeStyle='#4a3722'; g.lineWidth=2;
  g.beginPath(); g.moveTo(0,3); g.lineTo(b,3); g.stroke();
  const farben=['#c8402e','#e8b44a','#3f8ecc','#5aa34a'];
  for(let i=0;i<8;i++){
    g.fillStyle=farben[i%4];
    g.beginPath(); g.moveTo(i*16+1,4); g.lineTo(i*16+15,4); g.lineTo(i*16+8,h-4); g.closePath(); g.fill();
  }
}, [3,1]);
const texUhr = malTextur(64,64,(g,b,h)=>{
  g.fillStyle='#1a140c'; g.fillRect(0,0,b,h);
  g.fillStyle='#e6dcc4'; g.beginPath(); g.arc(b/2,h/2,26,0,6.284); g.fill();
  g.strokeStyle='#20180a'; g.lineWidth=2;
  for(let i=0;i<12;i++){
    const a=i*0.5236; g.beginPath();
    g.moveTo(b/2+Math.cos(a)*22, h/2+Math.sin(a)*22);
    g.lineTo(b/2+Math.cos(a)*25, h/2+Math.sin(a)*25); g.stroke();
  }
  g.lineWidth=3; g.beginPath(); g.moveTo(b/2,h/2); g.lineTo(b/2, h/2-15); g.stroke();
  g.lineWidth=2; g.beginPath(); g.moveTo(b/2,h/2); g.lineTo(b/2+12, h/2+6); g.stroke();
});
const texPlakat = malTextur(128,96,(g,b,h)=>{
  g.fillStyle='#e8b44a'; g.fillRect(0,0,b,h);
  g.fillStyle='#c8402e';
  g.beginPath(); g.moveTo(b/2,12); g.lineTo(b-18,h-24); g.lineTo(18,h-24); g.closePath(); g.fill();
  g.fillStyle='#f0e6d2'; g.fillRect(b/2-14,h/2-6,10,10); g.fillRect(b/2+8,h/2+4,9,9);
  g.fillStyle='#20180a'; g.font='700 15px monospace'; g.textAlign='center';
  g.fillText('BRUZZO', b/2, h-8);
});
const texVorhang = malTextur(64,64,(g,b,h)=>{
  g.fillStyle='#8a2c1e'; g.fillRect(0,0,b,h);
  g.fillStyle='#c8402e';
  for(let x=0;x<b;x+=10) g.fillRect(x,0,6,h);
}, [6,1]);
const texGitter = malTextur(64,64,(g,b,h)=>{
  g.fillStyle='#100c08'; g.fillRect(0,0,b,h);
  g.fillStyle='#3a2f22';
  for(let y=4;y<h-2;y+=10) g.fillRect(3,y,b-6,5);
});

const M = {
  boden:   new T.MeshLambertMaterial({map:texBoden}),
  wand:    new T.MeshLambertMaterial({map:texWand}),
  fliese:  new T.MeshLambertMaterial({map:texFliese}),
  decke:   new T.MeshLambertMaterial({color:0x191309}),
  dunkel:  new T.MeshLambertMaterial({color:0x0d0a07}),
  metall:  new T.MeshLambertMaterial({color:0x3d3323}),
  rot:     new T.MeshLambertMaterial({color:0xc8402e}),
  holz:    new T.MeshLambertMaterial({color:0x3c3226}),
  plakat:  new T.MeshBasicMaterial({map:texPlakat}),
  vorhang: new T.MeshLambertMaterial({map:texVorhang}),
  gitter:  new T.MeshLambertMaterial({map:texGitter}),
  glas:    new T.MeshBasicMaterial({color:0xffdca0}),
  deckePl: new T.MeshLambertMaterial({map:texDecke}),
  streifen:new T.MeshLambertMaterial({map:texStreifen}),
  wimpel:  new T.MeshBasicMaterial({map:texWimpel, transparent:true, side:T.DoubleSide}),
  uhr:     new T.MeshLambertMaterial({map:texUhr}),
  schirm:  new T.MeshBasicMaterial({color:0xffe6b8}),
  papier:  new T.MeshLambertMaterial({color:0xcfc3a4}),
  karton:  new T.MeshLambertMaterial({color:0xa87c47}),
  leiste:  new T.MeshLambertMaterial({color:0x4a3722}),
  warnAus: new T.MeshLambertMaterial({color:0x3a1512}),
  warnAn:  new T.MeshBasicMaterial({color:0xff5a3c})
};
const kasten = (b,h,t,mat,x,y,z,ry=0) => {
  const m = new T.Mesh(new T.BoxGeometry(b,h,t), mat);
  m.position.set(x,y,z); m.rotation.y = ry; szene.add(m); return m;
};
/* Eine Wand mit Loch: vier Streifen um die Öffnung herum. Billiger und
   robuster als eine ausgeschnittene Geometrie. */
function wandMitTuer(mat, achse, fest, von, bis, hoehe, lochVon, lochBis, lochHoch){
  const teile = [];
  const mach = (a, b2, y0, y1) => {
    if(b2-a < 0.01 || y1-y0 < 0.01) return;
    const br = b2-a, ho = y1-y0, m2 = (a+b2)/2, my = (y0+y1)/2;
    teile.push(achse === 'x'
      ? kasten(br, ho, 0.2, mat, m2, my, fest)
      : kasten(0.2, ho, br, mat, fest, my, m2));
  };
  mach(von, lochVon, 0, hoehe);
  mach(lochBis, bis, 0, hoehe);
  mach(lochVon, lochBis, lochHoch, hoehe);
  return teile;
}

/* ── Das Haus ─────────────────────────────────────────────────────── */
const BUERO = {bx:2.7, bz:3.4, h:3.0};
/* Die Öffnungen müssen NEBEN dem Stuhl liegen, nicht vor ihm. Zuerst
   standen sie bei z = -2,1 bis -0,5, also gut drei Meter vor dem
   Betrachter: die Sichtlinie vom Schreibtisch zur Gestalt im Gang traf
   dann die Wand statt die Öffnung, und wer das Türlicht anmachte, sah
   nichts. Jetzt liegen sie auf Kopfhöhe des Stuhls. */
const TUER  = {z0:-0.9, z1:1.1, h:2.35};
const LUKE  = {x0:-2.2, x1:-1.1, y0:0.15, y1:1.0};
let tuerL, tuerR, lukeKlappe, luefterFluegel;
const warnLampen = {};
let schattenFrisch = true;
const lichter = {};

function baueHaus(){
  // ── Büro ──
  const bodenBuero = new T.Mesh(new T.PlaneGeometry(BUERO.bx*2, BUERO.bz*2), M.boden);
  bodenBuero.rotation.x = -Math.PI/2; szene.add(bodenBuero);
  texBoden.repeat.set(3,4);
  kasten(BUERO.bx*2, 0.2, BUERO.bz*2, M.deckePl, 0, BUERO.h, 0);
  // Rückwand (hinter dem Spieler) und Frontwand
  kasten(BUERO.bx*2, BUERO.h, 0.2, M.wand, 0, BUERO.h/2,  BUERO.bz);
  wandMitTuer(M.wand, 'x', -BUERO.bz, -BUERO.bx, BUERO.bx, BUERO.h, LUKE.x0, LUKE.x1, LUKE.y1);
  kasten(LUKE.x1-LUKE.x0, LUKE.y0, 0.2, M.wand, (LUKE.x0+LUKE.x1)/2, LUKE.y0/2, -BUERO.bz);
  kasten(LUKE.x1-LUKE.x0, LUKE.y1-LUKE.y0, 0.08, M.gitter,
         (LUKE.x0+LUKE.x1)/2, (LUKE.y0+LUKE.y1)/2, -BUERO.bz+0.08);
  // Seitenwände mit den beiden Türöffnungen
  wandMitTuer(M.wand, 'z', -BUERO.bx, -BUERO.bz, BUERO.bz, BUERO.h, TUER.z0, TUER.z1, TUER.h);
  wandMitTuer(M.wand, 'z',  BUERO.bx, -BUERO.bz, BUERO.bz, BUERO.h, TUER.z0, TUER.z1, TUER.h);
  // Plakat an der Frontwand
  const pl = new T.Mesh(new T.PlaneGeometry(1.5, 1.12), M.plakat);
  pl.position.set(0.7, 1.75, -BUERO.bz+0.11); szene.add(pl);

  // Schreibtisch, Ventilator, Becher
  kasten(2.3, 0.09, 0.8, M.holz, 0, 1.02, 1.55);
  kasten(2.1, 0.62, 0.06, M.dunkel, 0, 0.7, 1.9);
  /* Der Ventilator stand mit halbem Meter Flügellänge anderthalb Meter vor
     der Nase und hat das halbe Bild zugedeckt. Kleiner und weiter an den
     Rand — er soll sich drehen, nicht im Weg stehen. */
  kasten(0.04, 0.24, 0.04, M.metall, 0.62, 1.16, 1.72);
  luefterFluegel = new T.Group(); luefterFluegel.position.set(0.62, 1.30, 1.72);
  for(let i=0;i<3;i++){
    const f = kasten(0.18, 0.04, 0.02, M.metall, 0,0,0);
    szene.remove(f); f.position.set(0,0,0); f.rotation.z = i*2.094;
    f.geometry.translate(0.09, 0, 0);
    luefterFluegel.add(f);
  }
  szene.add(luefterFluegel);
  const korb = new T.Mesh(new T.TorusGeometry(0.115, 0.01, 6, 16), M.metall);
  korb.position.set(0.62, 1.30, 1.72); szene.add(korb);
  kasten(0.075, 0.1, 0.075, M.rot, -0.5, 1.11, 1.62);

  /* ── Kram, der den Raum bewohnt aussehen lässt ──────────────────────
     Ein leerer Kasten mit Tisch wirkt wie ein Modell. Was hier steht,
     hat keine Spielwirkung — es ist nur da, damit man glaubt, dass hier
     jemand seit Stunden sitzt. */

  // Schreibtischlampe: der einzige Schattenwerfer im Haus
  kasten(0.16, 0.03, 0.16, M.metall, -1.62, 1.08, 1.74);
  kasten(0.03, 0.30, 0.03, M.metall, -1.62, 1.23, 1.74);
  const schirm = new T.Mesh(new T.ConeGeometry(0.17, 0.16, 10, 1, true), M.metall);
  schirm.position.set(-1.55, 1.38, 1.72); schirm.rotation.z = -0.6; szene.add(schirm);
  const gluehe = new T.Mesh(new T.SphereGeometry(0.045, 8, 6), M.schirm);
  gluehe.position.set(-1.52, 1.33, 1.71); szene.add(gluehe);
  const lampe = new T.PointLight(0xffcf92, 5.5, 6.5, 1.6);
  lampe.position.set(-1.50, 1.30, 1.68);
  lampe.castShadow = true;
  lampe.shadow.mapSize.set(512, 512);
  lampe.shadow.camera.near = 0.08; lampe.shadow.camera.far = 7;
  lampe.shadow.bias = -0.006;
  szene.add(lampe);

  // Bildschirm mit Standfuß, das Bild leuchtet von selbst
  /* Der Bildschirm stand erst mittig und groß auf dem Tisch — er hat das
     halbe Bild und das Plakat verdeckt. Klein und schräg an den Rand:
     die Sichtlinie zu den beiden Türöffnungen muss frei bleiben. */
  const mon = new T.Group(); mon.position.set(-0.92, 1.06, 1.66); mon.rotation.y = 0.55;
  const fuss = new T.Mesh(new T.BoxGeometry(0.16, 0.015, 0.11), M.dunkel);
  fuss.position.y = 0.008; mon.add(fuss);
  const hals = new T.Mesh(new T.BoxGeometry(0.03, 0.10, 0.03), M.dunkel);
  hals.position.y = 0.06; mon.add(hals);
  const geh = new T.Mesh(new T.BoxGeometry(0.34, 0.23, 0.035), M.dunkel);
  geh.position.y = 0.22; geh.rotation.x = 0.09; mon.add(geh);
  const bild = new T.Mesh(new T.PlaneGeometry(0.29, 0.18),
                          new T.MeshBasicMaterial({color:0x1d3a2e}));
  bild.position.set(0, 0.22, 0.022); bild.rotation.x = 0.09; mon.add(bild);
  szene.add(mon);

  // Pizzakarton, halb offen, mit einem Rest darin
  const karton = new T.Group(); karton.position.set(1.42, 1.07, 1.68); karton.rotation.y = -0.4;
  const unten = new T.Mesh(new T.BoxGeometry(0.42, 0.05, 0.42), M.karton);
  unten.position.y = 0.025; karton.add(unten);
  const deckel = new T.Mesh(new T.BoxGeometry(0.42, 0.04, 0.42), M.karton);
  deckel.position.set(0, 0.20, -0.19); deckel.rotation.x = -0.95; karton.add(deckel);
  const rest = new T.Mesh(new T.BoxGeometry(0.15, 0.02, 0.12), M.rot);
  rest.position.y = 0.06; karton.add(rest);
  szene.add(karton);

  // Becher, Papierstapel, Stift
  const becher = new T.Mesh(new T.CylinderGeometry(0.05, 0.042, 0.11, 8), M.papier);
  becher.position.set(0.86, 1.12, 1.78); szene.add(becher);
  for(let i=0;i<4;i++){
    const bl = kasten(0.22, 0.006, 0.30, M.papier, -0.30 + i*0.012, 1.073 + i*0.007, 1.80);
    bl.rotation.y = (i-1.5) * 0.06;
  }
  kasten(0.012, 0.012, 0.14, M.rot, -0.22, 1.083, 1.86, 0.4);

  // Fußleiste rundum, damit Wand und Boden nicht stumpf aneinanderstoßen
  for(const [b2,t2,x2,z2] of [[BUERO.bx*2,0.06,0,BUERO.bz-0.03],
                              [BUERO.bx*2,0.06,0,-BUERO.bz+0.03]])
    kasten(b2, 0.12, t2, M.leiste, x2, 0.06, z2);
  for(const sx of [-1,1]){
    kasten(0.06, 0.12, BUERO.bz*2, M.leiste, sx*(BUERO.bx-0.03), 0.06, 0);
  }

  // Wimpelkette unter der Decke und eine Uhr, die immer kurz vor zwölf steht
  const kette = new T.Mesh(new T.PlaneGeometry(BUERO.bx*2 - 0.2, 0.3), M.wimpel);
  kette.position.set(0, BUERO.h - 0.34, -BUERO.bz + 0.12); szene.add(kette);
  const uhr = new T.Mesh(new T.PlaneGeometry(0.42, 0.42), M.uhr);
  uhr.position.set(-1.55, 2.05, -BUERO.bz + 0.11); szene.add(uhr);

  // Über jeder Türöffnung eine Warnleuchte — sie geht an, wenn zu ist
  for(const sx of [-1, 1]){
    const kap = kasten(0.1, 0.1, 0.22, M.warnAus, sx*(BUERO.bx-0.06), TUER.h + 0.22, 0.1);
    warnLampen[sx < 0 ? 'L' : 'R'] = kap;
  }

  // Rollläden in den Türöffnungen
  const tuerGeo = new T.BoxGeometry(0.14, TUER.h, TUER.z1-TUER.z0);
  tuerL = new T.Mesh(tuerGeo, M.streifen);
  tuerL.position.set(-BUERO.bx, TUER.h/2 + TUER.h, (TUER.z0+TUER.z1)/2); szene.add(tuerL);
  tuerR = tuerL.clone(); tuerR.position.x = BUERO.bx; szene.add(tuerR);
  lukeKlappe = kasten(LUKE.x1-LUKE.x0+0.1, LUKE.y1-LUKE.y0+0.1, 0.06, M.metall,
                      (LUKE.x0+LUKE.x1)/2, (LUKE.y0+LUKE.y1)/2, -BUERO.bz+0.16);
  lukeKlappe.position.y -= 2.4;                   // offen: nach unten weggefahren

  // ── Gänge ──
  for(const s of [-1, 1]){
    const x0 = s*BUERO.bx, x1 = s*13;
    const mitte = (x0+x1)/2, laenge = Math.abs(x1-x0);
    const b = new T.Mesh(new T.PlaneGeometry(laenge, TUER.z1-TUER.z0), M.fliese);
    b.rotation.x = -Math.PI/2; b.position.set(mitte, 0.01, (TUER.z0+TUER.z1)/2); szene.add(b);
    kasten(laenge, 0.2, TUER.z1-TUER.z0, M.decke, mitte, TUER.h, (TUER.z0+TUER.z1)/2);
    kasten(laenge, TUER.h, 0.2, M.wand, mitte, TUER.h/2, TUER.z0);
    kasten(laenge, TUER.h, 0.2, M.wand, mitte, TUER.h/2, TUER.z1);
    kasten(0.2, TUER.h, TUER.z1-TUER.z0, M.wand, x1, TUER.h/2, (TUER.z0+TUER.z1)/2);
    // Türlicht, anfangs aus
    const l = new T.PointLight(0xffd9a0, 0, 12, 1);
    l.position.set(s*4.0, 2.0, (TUER.z0+TUER.z1)/2); szene.add(l);
    lichter[s < 0 ? 'L' : 'R'] = l;
  }

  // ── Speisesaal ──
  raum(-9, 9, -22, -12, 3.4, M.fliese);
  for(const [tx,tz] of [[-5,-15],[0,-18],[5,-14],[-3,-20],[6,-19]]){
    kasten(1.5, 0.08, 1.5, M.holz, tx, 0.78, tz);
    kasten(0.14, 0.78, 0.14, M.metall, tx, 0.39, tz);
    for(const [sx,sz] of [[-1.1,0],[1.1,0]]){
      kasten(0.5,0.07,0.5, M.holz, tx+sx, 0.46, tz+sz);
      kasten(0.5,0.55,0.07, M.holz, tx+sx, 0.74, tz+sz-0.22);
    }
  }
  // ── Bühne ──
  raum(-6.5, 6.5, -30, -22, 4.0, M.fliese);
  kasten(11, 0.5, 4.5, M.holz, 0, 0.25, -26.5);
  const vh = new T.Mesh(new T.PlaneGeometry(13, 1.5), M.vorhang);
  vh.position.set(0, 3.2, -22.3); szene.add(vh);
  // ── Küche ──
  raum(-21, -13.5, -22, -14, 3.0, M.fliese);
  kasten(6, 0.9, 0.7, M.metall, -17, 0.45, -21.4);
  kasten(0.7, 1.9, 3, M.metall, -20.4, 0.95, -17);
  // ── Werkstatt ──
  raum(13.5, 21, -22, -14, 3.0, M.fliese);
  kasten(5, 0.9, 0.8, M.holz, 17, 0.45, -21.3);
  kasten(0.8, 2.2, 2.6, M.dunkel, 20.4, 1.1, -17.5);
  // ── Lüftungsschacht ──
  const schachtZ = -BUERO.bz - 1.2;
  for(const teil of [[-2.0, 8.0]]){
    const [x0, x1] = teil, mitte=(x0+x1)/2, laenge=x1-x0;
    kasten(laenge, 0.06, 1.1, M.metall, mitte, 0.2, schachtZ);
    kasten(laenge, 0.06, 1.1, M.metall, mitte, 1.2, schachtZ);
    kasten(laenge, 1.0, 0.06, M.metall, mitte, 0.7, schachtZ-0.55);
    kasten(laenge, 1.0, 0.06, M.metall, mitte, 0.7, schachtZ+0.55);
  }

  // ── Licht ──
  /* Das Haus soll düster sein, aber sichtbar. Mit dem ersten Satz Werte
     war es schlicht schwarz — Punktlichter mit decay 1.6 und Reichweite 20
     kommen über zehn Meter nicht an. Jetzt lineare Abnahme (decay 1) und
     kräftigere Werte, dazu Grundlicht. */
  szene.add(new T.AmbientLight(0x4d3d2a, 2.6));
  szene.add(new T.HemisphereLight(0x3a2e1e, 0x120c08, 0.9));
  const bueroLicht = new T.PointLight(0xffc98a, 9, 16, 1);
  bueroLicht.position.set(0, 2.7, 0.4); szene.add(bueroLicht);
  lichter.buero = bueroLicht;
  for(const [x,y,z,f,st,w] of [[0,3.1,-17,0xffd0a0,14,26], [0,3.7,-26,0xff9a6a,16,26],
                               [-17,2.7,-18,0xbfd4ff,10,20], [17,2.7,-18,0xffd0a0,10,20],
                               [-8,2.1,-1.3,0xffd9a0,4,14], [8,2.1,-1.3,0xffd9a0,4,14],
                               [3,1.0,-4.6,0x9fd4ff,3,12], [0,3.1,-24,0xffb26a,8,18]]){
    const l = new T.PointLight(f, st, w, 1); l.position.set(x,y,z); szene.add(l);
  }
}
/* Ein Raum aus Boden, Decke und vier Wänden, vorne offen zum Betrachter. */
function raum(x0, x1, z0, z1, h, bodenMat){
  const bx = x1-x0, bz = z1-z0, mx = (x0+x1)/2, mz = (z0+z1)/2;
  const b = new T.Mesh(new T.PlaneGeometry(bx, bz), bodenMat);
  b.rotation.x = -Math.PI/2; b.position.set(mx, 0.01, mz); szene.add(b);
  kasten(bx, 0.2, bz, M.decke, mx, h, mz);
  kasten(bx, h, 0.2, M.wand, mx, h/2, z0);
  kasten(bx, h, 0.2, M.wand, mx, h/2, z1);
  kasten(0.2, h, bz, M.wand, x0, h/2, mz);
  kasten(0.2, h, bz, M.wand, x1, h/2, mz);
}

/* ── Kameraplätze ─────────────────────────────────────────────────── */
/* Jeder Kameraplatz muss INNERHALB seines Raums liegen. Zuerst standen
   sie knapp davor — die Kamera schaute damit von außen auf eine Wand, und
   das Bild war schwarz. */
const RAEUME = [
  {id:'buehne',   nr:'1A', name:'Bühne',       pos:[0, 3.2, -22.6],   blick:[0, 1.1, -27.5]},
  {id:'saal',     nr:'1B', name:'Speisesaal',  pos:[0, 2.9, -12.7],   blick:[0, 0.9, -18.5]},
  {id:'gangL',    nr:'2L', name:'Gang links',  pos:[-12.4, 1.85, 0.1], blick:[0, 1.3, 0.1]},
  {id:'gangR',    nr:'2R', name:'Gang rechts', pos:[ 12.4, 1.85, 0.1], blick:[0, 1.3, 0.1]},
  {id:'kueche',   nr:'3',  name:'Küche',       pos:[-14.2, 2.4, -14.8], blick:[-19, 0.9, -19.5], blind:true},
  {id:'werkstatt',nr:'4',  name:'Werkstatt',   pos:[14.2, 2.4, -14.8], blick:[19, 0.9, -19.5]},
  {id:'lueftung', nr:'5',  name:'Lüftung',     pos:[7.2, 0.72, -4.6], blick:[-2, 0.7, -4.6]}
];
/* Wo eine Figur in welchem Raum steht. Die Türplätze stehen direkt vor
   der Öffnung, damit man sie im Licht sieht. */
const PLATZ = {
  buehne:   [[-2.2, -25.5], [2.2, -25.5]],
  saal:     [[-3.5, -16.5], [3.5, -16.0]],
  gangL:    [[-7.2, 0.1]],
  gangR:    [[ 7.2, 0.1]],
  kueche:   [[-17.5, -18.0]],
  werkstatt:[[17.5, -18.0]],
  lueftung: [[4.5, -4.6]],
  tuerL:    [[-3.55, 0.1]],
  tuerR:    [[ 3.55, 0.1]],
  luke:     [[-1.65, -4.4]]
};

/* ── Die Figuren als Körper ───────────────────────────────────────── */
function augen(gruppe, farbe, y, abstand, gr){
  const mat = new T.MeshBasicMaterial({color:farbe});
  for(const s of [-1,1]){
    const m = new T.Mesh(new T.SphereGeometry(gr, 8, 6), mat);
    m.position.set(s*abstand, y, 0.26); gruppe.add(m);
  }
  return mat;
}
function baueBruzzo(){
  const gr = new T.Group();
  const koerper = new T.Mesh(new T.CylinderGeometry(0.42, 0.5, 1.15, 12),
                             new T.MeshLambertMaterial({color:0xe8b44a}));
  koerper.position.y = 0.72; gr.add(koerper);
  const band = new T.Mesh(new T.CylinderGeometry(0.44, 0.46, 0.2, 12),
                          new T.MeshLambertMaterial({color:0xc8402e}));
  band.position.y = 0.55; gr.add(band);
  const kopf = new T.Mesh(new T.BoxGeometry(0.62, 0.5, 0.5),
                          new T.MeshLambertMaterial({color:0xf0e6d2}));
  kopf.position.y = 1.58; gr.add(kopf);
  const muetze = new T.Mesh(new T.CylinderGeometry(0.30, 0.26, 0.34, 10),
                            new T.MeshLambertMaterial({color:0xf4efe2}));
  muetze.position.y = 1.98; gr.add(muetze);
  const bart = new T.Mesh(new T.BoxGeometry(0.42, 0.09, 0.1),
                          new T.MeshLambertMaterial({color:0x3a2a18}));
  bart.position.set(0, 1.44, 0.26); gr.add(bart);
  const a = new T.Group(); a.position.set(0, 1.62, 0); gr.add(a);
  augen(a, 0xffd66b, 0, 0.14, 0.065);
  for(const s of [-1,1]){
    const bein = new T.Mesh(new T.CylinderGeometry(0.11,0.11,0.28,8),
                            new T.MeshLambertMaterial({color:0x241a10}));
    bein.position.set(s*0.2, 0.14, 0); gr.add(bein);
  }
  return gr;
}
function baueOlivia(){
  const gr = new T.Group();
  const stab = new T.Mesh(new T.CylinderGeometry(0.08,0.08,1.15,8),
                          new T.MeshLambertMaterial({color:0x243014}));
  stab.position.y = 0.6; gr.add(stab);
  const kopf = new T.Mesh(new T.SphereGeometry(0.42, 14, 10),
                          new T.MeshLambertMaterial({color:0x7ab648}));
  kopf.scale.set(1, 1.15, 1); kopf.position.y = 1.52; gr.add(kopf);
  const rot = new T.Mesh(new T.CylinderGeometry(0.19,0.19,0.08,12),
                         new T.MeshLambertMaterial({color:0xc8402e}));
  rot.rotation.x = Math.PI/2; rot.position.set(0, 1.55, 0.38); gr.add(rot);
  const pupille = new T.Mesh(new T.SphereGeometry(0.1, 10, 8),
                             new T.MeshBasicMaterial({color:0x140a06}));
  pupille.position.set(0, 1.55, 0.46); gr.add(pupille);
  for(const s of [-1,1]){
    const arm = new T.Mesh(new T.CylinderGeometry(0.045,0.045,0.85,6),
                           new T.MeshLambertMaterial({color:0x243014}));
    arm.position.set(s*0.24, 0.72, 0); arm.rotation.z = s*0.42; gr.add(arm);
    const bein = new T.Mesh(new T.CylinderGeometry(0.05,0.05,0.4,6),
                            new T.MeshLambertMaterial({color:0x243014}));
    bein.position.set(s*0.11, 0.2, 0); gr.add(bein);
  }
  return gr;
}
function baueKrempel(){
  const gr = new T.Group();
  const kasten2 = new T.Mesh(new T.BoxGeometry(0.9, 1.1, 0.6),
                             new T.MeshLambertMaterial({color:0x1a2430}));
  kasten2.position.y = 0.72; gr.add(kasten2);
  const gitter = new T.Mesh(new T.PlaneGeometry(0.68, 0.5), M.gitter);
  gitter.position.set(0, 0.95, 0.31); gr.add(gitter);
  const mund = new T.Mesh(new T.BoxGeometry(0.36, 0.07, 0.05),
                          new T.MeshLambertMaterial({color:0xc8402e}));
  mund.position.set(0, 0.62, 0.31); gr.add(mund);
  const a = new T.Group(); a.position.set(0, 1.02, 0.06); gr.add(a);
  augen(a, 0xffd66b, 0, 0.17, 0.07);
  for(const s of [-1,1]){
    const rad = new T.Mesh(new T.CylinderGeometry(0.16,0.16,0.1,10),
                           new T.MeshLambertMaterial({color:0x3a4a5a}));
    rad.rotation.z = Math.PI/2; rad.position.set(s*0.4, 0.16, 0); gr.add(rad);
  }
  return gr;
}
function baueTeigling(){
  const gr = new T.Group();
  const klumpen = new T.Mesh(new T.SphereGeometry(0.6, 12, 9),
                             new T.MeshLambertMaterial({color:0xd8c8a8}));
  klumpen.scale.set(0.85, 1.35, 0.8); klumpen.position.y = 0.95; gr.add(klumpen);
  const beule = new T.Mesh(new T.SphereGeometry(0.28, 10, 8),
                           new T.MeshLambertMaterial({color:0xc0ad8c}));
  beule.position.set(-0.24, 1.42, 0.16); gr.add(beule);
  const kiefer = new T.Mesh(new T.BoxGeometry(0.5, 0.2, 0.12),
                            new T.MeshLambertMaterial({color:0x1a1008}));
  kiefer.position.set(0, 1.02, 0.42); gr.add(kiefer);
  for(let i=0;i<5;i++){
    const zahn = new T.Mesh(new T.BoxGeometry(0.06,0.1,0.06),
                            new T.MeshLambertMaterial({color:0xd8c8a8}));
    zahn.position.set(-0.18+i*0.09, 1.02, 0.46); gr.add(zahn);
  }
  return gr;
}

/* ── Spiel: Zustand und Regeln (aus der flachen Fassung übernommen) ── */
const EIFER = [
  [ 4, 0, 0, 0], [ 6, 4, 3, 2], [ 8, 7, 5, 4],
  [10, 9, 7, 6], [13,12, 9, 8], [16,15,12,11]
];
const STUNDEN = 6, STUNDE_S = 52;
const KOSTEN = {grund:0.20, tuer:0.30, licht:0.26, luke:0.22, tablet:0.18};
const KURBEL = 2.4;

function neueFiguren(){
  return [
    {id:'bruzzo', name:'Bruzzo', weg:['buehne','saal','gangL','tuerL'], pos:0, uhr:0, takt:4.6,
     eifer:0, griff:0, koerper:null},
    {id:'olivia', name:'Olivia', weg:['buehne','saal','gangR','tuerR'], pos:0, uhr:0, takt:4.2,
     eifer:0, griff:0, stillWennGesehen:true, koerper:null},
    {id:'krempel', name:'Krempel', weg:['kueche','werkstatt','lueftung','luke'], pos:0, uhr:0,
     takt:5.6, eifer:0, griff:0, koerper:null},
    {id:'teigling', name:'Der Teigling', weg:['werkstatt'], pos:0, uhr:0, takt:9,
     eifer:0, griff:0, wach:0, koerper:null}
  ];
}
let sp = null, laeuft = false, zeit = 0;
let geschafft = +(localStorage.getItem('bruzzo.naechte') || 0);
let gewaehlteNacht = Math.min(geschafft, EIFER.length-1);
let bau = null;

function neu(nacht){
  sp = {
    nacht, stunde:0, uhr:0, strom:100,
    tuerL:false, tuerR:false, lichtL:false, lichtR:false, luke:false,
    tablet:false, kamera:0, kurbel:false,
    laerm:0, tabletUhr:0, blitz:0, ruettel:0, gier:0, gierZiel:0,
    figuren:neueFiguren(), aus:false, gewonnen:false, taeter:null,
    schreck:0, schreckWer:null, statik:0
  };
  const e = EIFER[klemm(nacht,0,EIFER.length-1)];
  sp.figuren.forEach((f,i) => f.eifer = e[i]);
  for(const f of sp.figuren){
    f.koerper = bau[f.id];
    f.koerper.visible = false;
  }
  koerperSetzen();
  anzeige(); raeumeBauen();
}
/* Jede Figur an ihren Platz stellen und zum Betrachter drehen. */
function koerperSetzen(){
  const belegt = {};
  for(const f of sp.figuren){
    const ort = f.weg[f.pos];
    const plaetze = PLATZ[ort];
    if(!plaetze){ f.koerper.visible = false; continue; }
    const i = (belegt[ort] = (belegt[ort] || 0)) % plaetze.length;
    belegt[ort]++;
    const [x,z] = plaetze[i];
    f.koerper.position.set(x, ort === 'lueftung' || ort === 'luke' ? -0.05 : 0, z);
    if(ort === 'lueftung' || ort === 'luke') f.koerper.scale.setScalar(0.55);
    else f.koerper.scale.setScalar(1);
    // Richtung: Türplätze schauen ins Büro, sonst Richtung Ausgang
    const zuBuero = Math.atan2(0 - x, 0 - z);
    f.koerper.rotation.y = zuBuero;
    f.koerper.visible = true;
  }
}

/* ── Klang ────────────────────────────────────────────────────────── */
let actx=null, meister=null, summen=null;
function tonStart(){
  if(actx) return;
  const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
  actx = new AC(); if(actx.state==='suspended') actx.resume();
  meister = actx.createGain(); meister.gain.value = .8; meister.connect(actx.destination);
  const o = actx.createOscillator(); o.type='sawtooth'; o.frequency.value=52;
  const gn = actx.createGain(); gn.gain.value=.03;
  const f = actx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=240;
  o.connect(f); f.connect(gn); gn.connect(meister); o.start(); summen = gn;
  const n = actx.createBufferSource(); n.buffer = rauschPuffer(2); n.loop = true;
  const nf = actx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=560; nf.Q.value=.7;
  const ng = actx.createGain(); ng.gain.value=.045;
  n.connect(nf); nf.connect(ng); ng.connect(meister); n.start();
}
function rauschPuffer(sek){
  const n = Math.floor(actx.sampleRate*sek), b = actx.createBuffer(1,n,actx.sampleRate);
  const d = b.getChannelData(0);
  for(let i=0;i<n;i++) d[i] = Math.random()*2-1;
  return b;
}
function ton(f0,f1,form,dauer,laut){
  if(!actx) return;
  const t=actx.currentTime, o=actx.createOscillator(), gn=actx.createGain();
  o.type=form; o.frequency.setValueAtTime(f0,t);
  o.frequency.exponentialRampToValueAtTime(Math.max(18,f1), t+dauer);
  gn.gain.setValueAtTime(0,t); gn.gain.linearRampToValueAtTime(laut,t+.01);
  gn.gain.exponentialRampToValueAtTime(.0001,t+dauer);
  o.connect(gn); gn.connect(meister); o.start(t); o.stop(t+dauer+.03);
}
function knall(dauer,laut,mitte,q,rate){
  if(!actx) return;
  const t=actx.currentTime, s=actx.createBufferSource();
  s.buffer = rauschPuffer(Math.max(dauer,.05)); s.playbackRate.value = rate||1;
  const f=actx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=mitte; f.Q.value=q;
  const gn=actx.createGain();
  gn.gain.setValueAtTime(laut,t); gn.gain.exponentialRampToValueAtTime(.0001,t+dauer);
  s.connect(f); f.connect(gn); gn.connect(meister); s.start(t); s.stop(t+dauer+.05);
}
const klangTuer  = zu => { knall(.22,.30,180,.6,.7); ton(zu?120:200, zu?60:300,'square',.14,.07); };
const klangKlick = () => ton(700,540,'square',.05,.05);
const klangSchritt = () => knall(.10,.10,300,.9,.6);
const klangBumm  = () => { knall(.35,.34,110,.5,.5); ton(90,40,'sine',.4,.12); };
const klangStatik= () => knall(.16,.10,2600,.5,1.5);
const klangUhr   = () => { ton(523,523,'triangle',.18,.09); setTimeout(()=>ton(784,784,'triangle',.4,.08),160); };
function klangOrgel(){
  if(!actx) return;
  [392,440,466,392].forEach((f,i) => setTimeout(() => ton(f,f,'triangle',.22,.05), i*150));
}
function klangSchreck(){
  if(!actx) return;
  knall(.9,.55,900,.3,1);
  for(const f of [70,74,110,180]) ton(f*3, f, 'sawtooth', .9, .16);
}

/* ── Bedienung ────────────────────────────────────────────────────── */
function schalte(was){
  if(!laeuft || sp.aus) return;
  tonStart();
  if(was === 'tuerL'){ sp.tuerL = !sp.tuerL; klangTuer(sp.tuerL); larm(sp.tuerL?3:2); }
  if(was === 'tuerR'){ sp.tuerR = !sp.tuerR; klangTuer(sp.tuerR); larm(sp.tuerR?3:2); }
  if(sp.kurbel && tuerZu()){ sp.kurbel = false; melde('KURBEL BLOCKIERT', 'der Rollladen ist im Weg'); }
  if(was === 'luke'){  sp.luke  = !sp.luke;  klangTuer(sp.luke);  larm(2); }
  if(was === 'lichtL'){ sp.lichtL = !sp.lichtL; sp.lichtR = false; klangKlick(); }
  if(was === 'lichtR'){ sp.lichtR = !sp.lichtR; sp.lichtL = false; klangKlick(); }
  if(was === 'tablet'){
    sp.tablet = !sp.tablet;
    $('#raeume').classList.toggle('an', sp.tablet);
    if(sp.tablet){ klangStatik(); sp.tabletUhr = 0; sp.statik = 1; }
  }
  knoepfe();
}
const larm = menge => { sp.laerm = Math.min(24, sp.laerm + menge); };
/* Die Kurbel sitzt draußen an der Wand: wer sie dreht, muss den Arm durch
   eine offene Tür strecken. Also lädt sie nur, solange kein Rollladen
   unten ist — Verstecken und Nachladen geht nicht gleichzeitig. */
const tuerZu = () => sp.tuerL || sp.tuerR;
function raeumeBauen(){
  const box = $('#raeume'); box.innerHTML = '';
  RAEUME.forEach((r,i) => {
    const el = document.createElement('button');
    el.className = 'rk' + (i === sp.kamera ? ' an' : '');
    el.innerHTML = '<b>' + r.nr + '</b>' + r.name;
    el.addEventListener('click', e => {
      e.stopPropagation();
      if(!sp.tablet) return;
      sp.kamera = i; sp.statik = 1; klangStatik(); raeumeBauen();
    });
    box.appendChild(el);
  });
  box.classList.toggle('an', !!sp.tablet);
}
function knoepfe(){
  $('#knTuerL').classList.toggle('an', sp.tuerL);
  $('#knTuerR').classList.toggle('an', sp.tuerR);
  $('#knLuke').classList.toggle('an', sp.luke);
  $('#knLichtL').classList.toggle('an', sp.lichtL);
  $('#knLichtR').classList.toggle('an', sp.lichtR);
  $('#knTablet').classList.toggle('an', sp.tablet);
  $('#knKurbel').classList.toggle('an', sp.kurbel);
  $('#knKurbel').classList.toggle('gesperrt', tuerZu());
}
for(const [id, was] of [['#knTuerL','tuerL'],['#knTuerR','tuerR'],['#knLuke','luke'],
                        ['#knLichtL','lichtL'],['#knLichtR','lichtR'],['#knTablet','tablet']])
  $(id).addEventListener('click', e => { e.stopPropagation(); schalte(was); });
const kurbelKn = $('#knKurbel');
kurbelKn.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  if(!laeuft || sp.aus) return;
  tonStart();
  if(tuerZu()){ klangKlick(); melde('GEHT NICHT', 'erst die Türen aufmachen'); return; }
  sp.kurbel = true; knoepfe();
});
for(const t of ['pointerup','pointercancel','pointerleave'])
  kurbelKn.addEventListener(t, () => { if(sp){ sp.kurbel = false; knoepfe(); } });

/* Umsehen: ziehen. Der Blick bleibt im Büro, es gibt keinen Rundumblick —
   das ist der Punkt an einem Wachraum. */
let zieher = null;
leinwand.addEventListener('pointerdown', e => {
  if(!laeuft || sp.tablet) return;
  zieher = {id:e.pointerId, x:e.clientX, start:sp.gierZiel};
  try{ leinwand.setPointerCapture(e.pointerId); }catch(_){}
  $('#dreh').classList.add('weg');
  e.preventDefault();
});
leinwand.addEventListener('pointermove', e => {
  if(!zieher || e.pointerId !== zieher.id || !sp) return;
  const r = leinwand.getBoundingClientRect();
  sp.gierZiel = klemm(zieher.start + (e.clientX - zieher.x)/r.width * 2.3, -0.95, 0.95);
});
for(const t of ['pointerup','pointercancel'])
  leinwand.addEventListener(t, e => { if(zieher && e.pointerId === zieher.id) zieher = null; });
addEventListener('keydown', e => {
  if(!laeuft) return;
  const k = {KeyA:'lichtL', KeyQ:'tuerL', KeyD:'lichtR', KeyE:'tuerR',
             KeyS:'luke', Space:'tablet', KeyW:'tablet'}[e.code];
  if(k){ schalte(k); e.preventDefault(); }
  if(e.code === 'ArrowLeft')  sp.gierZiel = klemm(sp.gierZiel + .16, -0.95, 0.95);
  if(e.code === 'ArrowRight') sp.gierZiel = klemm(sp.gierZiel - .16, -0.95, 0.95);
  if(e.code === 'ShiftLeft' || e.code === 'ShiftRight'){
    if(tuerZu()){ if(!sp.kurbel) melde('GEHT NICHT', 'erst die Türen aufmachen'); }
    else { sp.kurbel = true; }
    knoepfe();
  }
});
addEventListener('keyup', e => {
  if(sp && (e.code === 'ShiftLeft' || e.code === 'ShiftRight')){ sp.kurbel = false; knoepfe(); }
});
addEventListener('blur', () => { if(sp){ sp.kurbel = false; knoepfe(); } zieher = null; });

/* ── Ablauf ───────────────────────────────────────────────────────── */
function schritt(dt){
  zeit += dt;
  if(luefterFluegel) luefterFluegel.rotation.z += dt * (sp && sp.strom > 0 ? 9 : 0.4);
  if(!laeuft || !sp || sp.aus) return;

  let ab = KOSTEN.grund;
  if(sp.tuerL) ab += KOSTEN.tuer;
  if(sp.tuerR) ab += KOSTEN.tuer;
  if(sp.luke)  ab += KOSTEN.luke;
  if(sp.lichtL || sp.lichtR) ab += KOSTEN.licht;
  if(sp.tablet) ab += KOSTEN.tablet;
  sp.strom -= ab*dt;
  if(sp.kurbel && tuerZu()) sp.kurbel = false;      // falls doch etwas durchrutscht
  if(sp.kurbel){
    sp.strom = Math.min(100, sp.strom + KURBEL*dt);
    larm(9*dt);
    if(Math.random() < dt*7) knall(.06,.05,420,1.2,.8);
  }
  if(sp.strom <= 0){
    sp.strom = 0;
    if(sp.tuerL || sp.tuerR || sp.luke || sp.tablet || sp.lichtL || sp.lichtR){
      sp.tuerL = sp.tuerR = sp.luke = sp.tablet = sp.lichtL = sp.lichtR = false;
      $('#raeume').classList.remove('an');
      knoepfe(); klangBumm(); melde('STROM WEG', 'die Türen stehen offen');
    }
  }
  sp.laerm = Math.max(0, sp.laerm - dt*2.2);

  sp.uhr += dt;
  if(sp.uhr >= STUNDE_S){
    sp.uhr = 0; sp.stunde++;
    klangUhr();
    if(sp.stunde >= STUNDEN){ gewonnen(); return; }
    melde(uhrzeit(), 'noch ' + (STUNDEN - sp.stunde) + ' Stunden');
  }
  if(sp.tablet) sp.tabletUhr += dt; else sp.tabletUhr = Math.max(0, sp.tabletUhr - dt*1.6);
  if(sp.blitz > 0) sp.blitz -= dt;
  if(sp.statik > 0) sp.statik -= dt*2.4;
  if(sp.ruettel > 0) sp.ruettel = Math.max(0, sp.ruettel - dt*2.6);

  figurenDenken(dt);
  anzeige();
}
const uhrzeit = () => (sp.stunde === 0 ? '12' : String(sp.stunde)) + ' UHR';

function figurenDenken(dt){
  let bewegt = false;
  for(const f of sp.figuren){
    if(f.id === 'teigling'){ teiglingDenken(f, dt); continue; }
    if(f.eifer <= 0) continue;
    const ort = f.weg[f.pos];
    const amZiel = f.pos === f.weg.length-1;
    if(amZiel){
      const zu = ort === 'tuerL' ? sp.tuerL : ort === 'tuerR' ? sp.tuerR : sp.luke;
      if(zu){
        f.pos = Math.max(0, f.pos-2); f.griff = 0; bewegt = true;
        klangBumm(); sp.ruettel = .5;
        melde('BLECH', f.name + ' ist wieder weg');
      } else {
        f.griff += dt;
        if(f.griff > 2.2){ erwischt(f); return; }
      }
      continue;
    }
    if(f.stillWennGesehen && sp.tablet && RAEUME[sp.kamera].id === ort) continue;
    f.uhr += dt;
    if(f.uhr < f.takt) continue;
    f.uhr = 0;
    if(Math.random() < (f.eifer + sp.laerm*0.5) / 22){
      f.pos++; bewegt = true;
      const neu2 = f.weg[f.pos];
      if(neu2 === 'gangL' || neu2 === 'gangR' || neu2 === 'tuerL' || neu2 === 'tuerR') klangSchritt();
      if(neu2 === 'lueftung' || neu2 === 'luke') klangOrgel();
      if(f.pos === f.weg.length-1) f.griff = 0;
    }
  }
  if(bewegt) koerperSetzen();
}
function teiglingDenken(f, dt){
  if(f.eifer <= 0) return;
  if(sp.tablet) f.wach += dt * (f.eifer/9);
  else f.wach = Math.max(0, f.wach - dt*2.4);
  if(f.wach > 9 && !f.griff){
    f.griff = 1.15; sp.blitz = .5; klangStatik(); knall(.3,.2,700,.6,.6);
  }
  if(f.griff > 0){
    if(!sp.tablet){ f.griff = 0; f.wach = 0; melde('KNAPP', 'der Teigling geht zurück'); return; }
    f.griff -= dt;
    if(f.griff <= 0) erwischt(f);
  }
}
function erwischt(f){
  sp.aus = true; laeuft = false;
  sp.schreck = 1.3; sp.schreckWer = f; sp.ruettel = 1; sp.taeter = f;
  sp.tablet = false; $('#raeume').classList.remove('an');
  // Die Figur springt vor die Kamera
  f.koerper.visible = true; f.koerper.scale.setScalar(1);
  f.koerper.position.set(kamBuero.position.x, 0.2, kamBuero.position.z - 1.15);
  f.koerper.rotation.y = Math.PI;
  klangSchreck();
  setTimeout(() => {
    $('#endeTitel').textContent = 'ERWISCHT';
    $('#endeTitel').style.color = 'var(--sauce)';
    $('#endeText').textContent = uhrzeit().replace(' UHR',' Uhr') + ' — so weit bist du gekommen.';
    $('#endeWer').textContent = f.name + ' hat dich geholt.';
    $('#ende').classList.remove('weg');
  }, 1700);
}
function gewonnen(){
  sp.aus = true; sp.gewonnen = true; laeuft = false;
  klangUhr();
  if(sp.nacht + 1 > geschafft){
    geschafft = sp.nacht + 1;
    localStorage.setItem('bruzzo.naechte', String(geschafft));
  }
  $('#endeTitel').textContent = '6 UHR';
  $('#endeTitel').style.color = 'var(--gruen)';
  $('#endeText').textContent = 'Schicht überstanden. Nacht ' + (sp.nacht+1) + ' ist durch.';
  $('#endeWer').textContent = sp.nacht+1 < EIFER.length
    ? 'Nacht ' + (sp.nacht+2) + ' ist jetzt frei.' : 'Alle sechs Nächte geschafft.';
  $('#ende').classList.remove('weg');
}
let meldeUhr = 0;
function melde(gross, klein){
  $('#meldung').innerHTML = gross + (klein ? '<small>'+klein+'</small>' : '');
  $('#meldung').classList.add('an'); meldeUhr = 1.7;
}
function anzeige(){
  $('#uhrB b').textContent = uhrzeit().replace('UHR','Uhr');
  $('#nachtT').textContent = 'Nacht ' + (sp.nacht+1);
  $('#stromZ').textContent = Math.ceil(sp.strom);
  $('#stromleiste i').style.transform = 'scaleX(' + (klemm(sp.strom,0,100)/100).toFixed(3) + ')';
  $('#stromleiste').classList.toggle('knapp', sp.strom < 25);
}

/* ── Bild ─────────────────────────────────────────────────────────── */
function zeichnen(dt){
  if(!sp) return;
  // Türen und Luke fahren
  const zielL = sp.tuerL ? TUER.h/2 : TUER.h/2 + TUER.h;
  const zielR = sp.tuerR ? TUER.h/2 : TUER.h/2 + TUER.h;
  tuerL.position.y += (zielL - tuerL.position.y) * Math.min(dt*7, 1);
  tuerR.position.y += (zielR - tuerR.position.y) * Math.min(dt*7, 1);
  const lukeY = (LUKE.y0+LUKE.y1)/2 - (sp.luke ? 0 : 2.4);
  lukeKlappe.position.y += (lukeY - lukeKlappe.position.y) * Math.min(dt*7, 1);
  /* Die Warnleuchten über den Öffnungen zeigen dasselbe wie die Knöpfe,
     nur im Raum: rot heißt zu — und rot heißt damit auch, dass die Kurbel
     gerade nicht geht. */
  if(warnLampen.L) warnLampen.L.material = sp.tuerL ? M.warnAn : M.warnAus;
  if(warnLampen.R) warnLampen.R.material = sp.tuerR ? M.warnAn : M.warnAus;

  lichter.L.intensity += ((sp.lichtL ? 13 : 0) - lichter.L.intensity) * Math.min(dt*12,1);
  lichter.R.intensity += ((sp.lichtR ? 13 : 0) - lichter.R.intensity) * Math.min(dt*12,1);
  lichter.buero.intensity = sp.strom > 0 ? 9 : 0.7;

  sp.gier += (sp.gierZiel - sp.gier) * Math.min(dt*9, 1);
  const r = sp.ruettel > 0 ? sp.ruettel : 0;
  kamBuero.position.set(zuf(-r,r)*0.06, 1.5 + zuf(-r,r)*0.05, 2.95);
  kamBuero.rotation.set(-0.075 + zuf(-r,r)*0.03, sp.gier, 0, 'YXZ');

  let kam = kamBuero;
  if(sp.tablet && !sp.schreck){
    const R = RAEUME[sp.kamera];
    kamTablet.position.set(R.pos[0], R.pos[1], R.pos[2]);
    kamTablet.lookAt(R.blick[0], R.blick[1], R.blick[2]);
    kam = kamTablet;
  }
  rnd.render(szene, kam);
  /* Der Schatten der Schreibtischlampe wird genau einmal gerechnet. Eine
     Punktlampe wirft ihn als Würfelbild, also sechs zusätzliche Durchläufe
     pro Bild — und dabei steht alles still, was sie beleuchtet: Tisch,
     Lampe, Kram. Die Figuren laufen draußen im Gang, weit außerhalb ihrer
     Reichweite. Einmal rechnen genügt. */
  if(schattenFrisch){ schattenFrisch = false; rnd.shadowMap.autoUpdate = false; }
  malUeberlage();
}
/* Alles, was flach über dem Bild liegt: Kamerarauschen, der rote Blitz,
   die Beschriftung des Kanals. */
function malUeberlage(){
  const b = ueber.width, h = ueber.height;
  u2.clearRect(0,0,b,h);
  if(!sp) return;
  if(sp.tablet && !sp.schreck){
    const R = RAEUME[sp.kamera];
    if(R.blind){
      u2.fillStyle = '#0c0e0b'; u2.fillRect(0,0,b,h);
      rauschen(0.6);
      u2.fillStyle = '#6a6153'; u2.font = '700 ' + Math.round(h*0.05) + 'px "Pixelify Sans",monospace';
      u2.textAlign = 'center';
      u2.fillText('KEIN BILD', b/2, h/2 - h*0.02);
      u2.font = '400 ' + Math.round(h*0.033) + 'px "Pixelify Sans",monospace';
      const wer = sp.figuren.some(f => f.weg[f.pos] === R.id);
      u2.fillText(wer ? 'aber Geschirr klappert' : 'nur das Kühlaggregat', b/2, h/2 + h*0.04);
      if(wer && Math.random() < .04) knall(.09,.09,1800,1.4,1.2);
    } else {
      rauschen(0.13 + Math.max(0, sp.statik)*0.5);
    }
    // Zeilen und Rahmen
    u2.fillStyle = 'rgba(255,255,255,.045)';
    const y = ((zeit*90) % (h+60)) - 30;
    u2.fillRect(0, y, b, 16);
    u2.strokeStyle = 'rgba(232,180,74,.35)'; u2.lineWidth = 2;
    u2.strokeRect(3, 3, b-6, h-6);
    u2.fillStyle = '#e8b44a';
    u2.font = '700 ' + Math.round(h*0.035) + 'px "Pixelify Sans",monospace';
    u2.textAlign = 'center';
    u2.fillText('KAM ' + R.nr + '  ·  ' + R.name.toUpperCase(), b/2, h*0.065);
    if(Math.sin(zeit*4) > 0){
      u2.fillStyle = '#c8402e';
      u2.beginPath(); u2.arc(b-18, h*0.055, 5, 0, 6.284); u2.fill();
    }
    const tg = sp.figuren.find(f => f.id === 'teigling');
    if(tg && tg.wach > 5){
      u2.fillStyle = 'rgba(200,64,46,' + (0.10 + 0.14*Math.sin(zeit*12)).toFixed(2) + ')';
      u2.fillRect(0,0,b,h);
    }
  }
  if(sp.schreck > 0){
    rauschen(0.3);
    u2.fillStyle = 'rgba(200,64,46,' + (0.16 + 0.2*Math.abs(Math.sin(zeit*20))).toFixed(2) + ')';
    u2.fillRect(0,0,b,h);
  }
  if(sp.blitz > 0){
    u2.fillStyle = 'rgba(200,64,46,' + (sp.blitz*.5).toFixed(2) + ')';
    u2.fillRect(0,0,b,h);
  }
  if(sp.strom <= 0 && !sp.tablet){
    u2.fillStyle = 'rgba(0,0,0,.55)'; u2.fillRect(0,0,b,h);
    u2.fillStyle = '#c8402e';
    u2.font = '700 ' + Math.round(h*0.05) + 'px "Pixelify Sans",monospace';
    u2.textAlign = 'center'; u2.fillText('KEIN STROM', b/2, h*0.5);
  }
}
function rauschen(staerke){
  const b = ueber.width, h = ueber.height;
  u2.globalAlpha = klemm(staerke, 0, 1);
  for(let i=0;i<450;i++){
    const x = Math.random()*b, y = Math.random()*h, g2 = Math.random()*255|0;
    u2.fillStyle = 'rgb(' + g2 + ',' + g2 + ',' + g2 + ')';
    u2.fillRect(x, y, 3, 3);
  }
  u2.globalAlpha = 1;
}

/* ── Schleife ─────────────────────────────────────────────────────── */
let vorher = 0;
function schleife(jetzt){
  requestAnimationFrame(schleife);
  const dt = Math.min((jetzt-vorher)/1000, .05); vorher = jetzt;
  schritt(dt);
  if(sp && sp.schreck > 0) sp.schreck = Math.max(0, sp.schreck - dt*0.8);
  if(meldeUhr > 0){ meldeUhr -= dt; if(meldeUhr <= 0) $('#meldung').classList.remove('an'); }
  zeichnen(dt);
}

/* ── Menü ─────────────────────────────────────────────────────────── */
function naechteBauen(){
  const box = $('#naechte'); box.innerHTML = '';
  for(let i=0;i<EIFER.length;i++){
    const el = document.createElement('button');
    const frei = i <= geschafft;
    el.className = 'nk' + (i < geschafft ? ' geschafft' : frei ? ' frei' : '');
    el.textContent = i+1; el.disabled = !frei;
    if(i === gewaehlteNacht) el.style.background = 'var(--edge)';
    el.addEventListener('click', () => { gewaehlteNacht = i; naechteBauen(); });
    box.appendChild(el);
  }
}
function starten(){
  tonStart(); neu(gewaehlteNacht); laeuft = true;
  $('#start').classList.add('weg'); $('#ende').classList.add('weg');
  $('#dreh').classList.remove('weg');
  knoepfe(); melde('12 UHR', 'sechs Stunden');
}
$('#losKnopf').addEventListener('click', starten);
$('#nochmal').addEventListener('click', () => {
  if(sp && sp.gewonnen && sp.nacht+1 < EIFER.length) gewaehlteNacht = sp.nacht+1;
  naechteBauen(); starten();
});

/* ── Start ────────────────────────────────────────────────────────── */
baueHaus();
bau = {bruzzo:baueBruzzo(), olivia:baueOlivia(), krempel:baueKrempel(), teigling:baueTeigling()};
for(const k in bau){ bau[k].visible = false; szene.add(bau[k]); }
passeAn();
naechteBauen();
neu(gewaehlteNacht); laeuft = false;
$('#lade').classList.add('weg');
$('#start').classList.remove('weg');
requestAnimationFrame(t => { vorher = t; requestAnimationFrame(schleife); });

window.__bruzzo = {
  get sp(){return sp}, RAEUME, EIFER, STUNDEN, STUNDE_S, PLATZ,
  starten, schalte, neu, koerperSetzen,
  setzeNacht: n => { gewaehlteNacht = n; },
  setzeFigur: (id, pos) => { const f = sp.figuren.find(x=>x.id===id); if(f){ f.pos = pos; koerperSetzen(); } },
  setzeKamera: n => { sp.kamera = n; raeumeBauen(); },
  get laeuft(){return laeuft}, get szene(){return szene}, T, rnd
};
