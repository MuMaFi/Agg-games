import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as skelettKlon } from 'three/examples/jsm/utils/SkeletonUtils.js';

/* ═══════════════════════════════════════════════════════════════════
   KÜCHENSCHLACHT

   Rundenkampf in einer Großküche. Die Köche holen den Topf und stellen
   ihn auf einen der beiden Herde; ist er drauf, muss er durchkochen.
   Die Kontrolle nimmt ihn wieder runter oder räumt die Köche weg.

   Zwei Dinge bestimmen den Aufbau:

   1. Die Karte ist eine Liste von Kisten. Daraus kommt beides — was man
      sieht und woran man hängenbleibt. Eine zweite, unsichtbare
      Kollisionswelt wäre eine zweite Wahrheit, und die läuft irgendwann
      auseinander.
   2. Die Bots laufen über ein Raster mit Breitensuche, nicht über
      Sichtlinien. Ein Bot, der nur geradeaus zum Ziel steuert, klebt in
      einer Küche voller Tresen sofort an einer Ecke fest.
   ═══════════════════════════════════════════════════════════════════ */

const $ = s => document.querySelector(s);
const klemm = (v,a,b) => v<a?a:v>b?b:v;
const misch = (a,b,t) => a+(b-a)*t;
const zuf = (a,b) => a + Math.random()*(b-a);

/* ── Bühne ────────────────────────────────────────────────────────── */
const leinwand = $('#szene');
const rnd = new T.WebGLRenderer({canvas:leinwand, antialias:false, powerPreference:'high-performance'});
rnd.setPixelRatio(Math.min(devicePixelRatio||1, 1.5));
rnd.outputColorSpace = T.SRGBColorSpace;
rnd.toneMapping = T.ACESFilmicToneMapping;
rnd.toneMappingExposure = 1.1;

const szene = new T.Scene();
szene.background = new T.Color(0x0a0d13);
szene.fog = new T.Fog(0x0a0d13, 22, 58);
const kam = new T.PerspectiveCamera(78, 1.6, 0.05, 120);
/* Die Waffe steckt in einer eigenen Szene mit eigener Kamera. Sonst
   schneidet sie bei jeder Wand durch die Geometrie, sobald man sich
   danebenstellt — das klassische Waffe-in-der-Wand-Problem. */
const szeneWaffe = new T.Scene();
const kamWaffe = new T.PerspectiveCamera(58, 1.6, 0.01, 6);

function passeAn(){
  const b = Math.max(2, innerWidth), h = Math.max(2, innerHeight);
  rnd.setSize(b, h, false);
  kam.aspect = kamWaffe.aspect = b/h;
  kam.updateProjectionMatrix(); kamWaffe.updateProjectionMatrix();
}
addEventListener('resize', passeAn); passeAn();

/* ── Werkstoffe ───────────────────────────────────────────────────── */
function malTextur(br, ho, malen, wdh){
  const c = document.createElement('canvas'); c.width = br; c.height = ho;
  malen(c.getContext('2d'), br, ho);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  if(wdh){ t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(wdh[0], wdh[1]); }
  return t;
}
const dreck = (g,b,h,n,f) => { g.fillStyle=f;
  for(let i=0;i<n;i++){ g.globalAlpha=.04+Math.random()*.12;
    g.fillRect(Math.random()*b, Math.random()*h, Math.random()*3+1, Math.random()*3+1); }
  g.globalAlpha=1; };

const texBoden = malTextur(64,64,(g,b,h)=>{
  for(let j=0;j<2;j++) for(let i=0;i<2;i++){
    g.fillStyle = (i+j)%2 ? '#cdd2d8' : '#aeb4bc';
    g.fillRect(i*b/2, j*h/2, b/2, h/2);
  }
  g.strokeStyle='#7d838c'; g.lineWidth=2;
  g.strokeRect(0,0,b,h); g.beginPath(); g.moveTo(b/2,0); g.lineTo(b/2,h);
  g.moveTo(0,h/2); g.lineTo(b,h/2); g.stroke();
  dreck(g,b,h,60,'#5a6068');
}, [22,16]);
const texWand = malTextur(64,64,(g,b,h)=>{
  g.fillStyle='#dfe4e9'; g.fillRect(0,0,b,h);
  g.strokeStyle='#b6bcc4'; g.lineWidth=2;
  for(let y=0;y<h;y+=16){ g.beginPath(); g.moveTo(0,y); g.lineTo(b,y); g.stroke(); }
  for(let x=0;x<b;x+=16){ g.beginPath(); g.moveTo(x,0); g.lineTo(x,h); g.stroke(); }
  dreck(g,b,h,40,'#8d949c');
}, [8,2]);
const texStahl = malTextur(64,64,(g,b,h)=>{
  g.fillStyle='#9aa3ad'; g.fillRect(0,0,b,h);
  for(let y=0;y<h;y+=3){ g.fillStyle = y%6 ? '#a5aeb8' : '#8e97a1'; g.fillRect(0,y,b,2); }
  dreck(g,b,h,30,'#666e77');
}, [2,1]);
const texKachel = malTextur(64,64,(g,b,h)=>{
  g.fillStyle='#2b3a46'; g.fillRect(0,0,b,h);
  g.fillStyle='#374a58';
  for(let y=2;y<h;y+=16) for(let x=2;x<b;x+=16) g.fillRect(x,y,12,12);
}, [6,2]);

const M = {
  boden: new T.MeshLambertMaterial({map:texBoden}),
  wand:  new T.MeshLambertMaterial({map:texWand}),
  stahl: new T.MeshLambertMaterial({map:texStahl}),
  kachel:new T.MeshLambertMaterial({map:texKachel}),
  decke: new T.MeshLambertMaterial({color:0x1b222c}),
  holz:  new T.MeshLambertMaterial({color:0x6b4f34}),
  dunkel:new T.MeshLambertMaterial({color:0x2a323d}),
  herdA: new T.MeshLambertMaterial({color:0x3a2a18}),
  glut:  new T.MeshBasicMaterial({color:0xff7a2a}),
  koch:  new T.MeshLambertMaterial({color:0xe0a648}),
  gegner:new T.MeshLambertMaterial({color:0x4a90d0}),
  topf:  new T.MeshLambertMaterial({color:0xb9c0c8})
};

/* ── Die Karte ────────────────────────────────────────────────────────
   Jede Kiste ist Wand und Hindernis zugleich: {x,z,b,t,h,mat,deko}.
   `deko` heißt nur ansehen, nicht anstoßen (Herdplatten, Schilder).   */
const HALLE = {x:22, z:16, h:4.2};
const KISTEN = [];
const kiste = (x,z,b,t,h,mat,y=0,deko=false) => {
  KISTEN.push({x,z,b,t,h,y,mat,deko}); return KISTEN[KISTEN.length-1];
};

// Außenwände
kiste(0, -HALLE.z, HALLE.x*2, 0.6, HALLE.h, M.wand);
kiste(0,  HALLE.z, HALLE.x*2, 0.6, HALLE.h, M.wand);
kiste(-HALLE.x, 0, 0.6, HALLE.z*2, HALLE.h, M.wand);
kiste( HALLE.x, 0, 0.6, HALLE.z*2, HALLE.h, M.wand);

// Mittelblock: zwingt die Wege außen herum, lässt aber zwei Durchgänge
kiste(0, 0, 7, 1.2, 2.6, M.kachel);
kiste(0, -5.4, 1.2, 6, 2.6, M.kachel);
kiste(0,  5.4, 1.2, 6, 2.6, M.kachel);

// Tresenreihen als Deckung
for(const s of [-1, 1]){
  kiste(s*10.5, 3.5, 5, 1, 1.05, M.stahl);
  kiste(s*10.5, -1.5, 5, 1, 1.05, M.stahl);
  kiste(s*16.5, 7.5, 1, 5, 1.05, M.stahl);
  kiste(s*5.5, 9.5, 1, 4, 1.05, M.stahl);
  kiste(s*15, -10, 4, 1, 1.05, M.stahl);
}
// Regale, hoch genug zum Verstecken
kiste(-7.5, -12.5, 3, 1, 2.4, M.holz);
kiste( 7.5, -12.5, 3, 1, 2.4, M.holz);
kiste(-18, -2, 1, 4, 2.4, M.holz);
kiste( 18, -2, 1, 4, 2.4, M.holz);
// Kisten im Weg
for(const [x,z] of [[-3.5,7],[3.5,7],[-13,-6.5],[13,-6.5],[-8,1],[8,1],[0,-11],[-19,9],[19,9]])
  kiste(x, z, 1.1, 1.1, 1.1, M.holz);

/* Die beiden Herde. Die Platte ist Deko, der Block darunter nicht. */
const HERDE = [
  {name:'A', x:-14.5, z:-13, r:2.2},
  {name:'B', x: 14.5, z:-13, r:2.2}
];
for(const H of HERDE){
  kiste(H.x, H.z, 3.2, 1.6, 0.95, M.stahl);
  kiste(H.x, H.z, 3.0, 1.4, 0.06, M.herdA, 0.98, true);
  for(const dx of [-0.85, 0, 0.85])
    kiste(H.x+dx, H.z, 0.6, 0.6, 0.02, M.glut, 1.02, true);
}

const SPAWN_KOCH = {x:0, z:12.5};
const SPAWN_KONT = {x:0, z:-13.5};
const TOPF_START = {x:0, z:13.8};

/* ── Bauen ────────────────────────────────────────────────────────── */
function baueWelt(){
  const boden = new T.Mesh(new T.PlaneGeometry(HALLE.x*2, HALLE.z*2), M.boden);
  boden.rotation.x = -Math.PI/2; szene.add(boden);
  const decke = new T.Mesh(new T.PlaneGeometry(HALLE.x*2, HALLE.z*2), M.decke);
  decke.rotation.x = Math.PI/2; decke.position.y = HALLE.h; szene.add(decke);

  for(const k of KISTEN){
    const m = new T.Mesh(new T.BoxGeometry(k.b, k.h, k.t), k.mat);
    m.position.set(k.x, k.y + k.h/2, k.z);
    szene.add(m);
  }
  // Hängelampen: geben der Halle Tiefe und markieren die Wege
  for(const [x,z] of [[0,9],[0,-9],[-13,0],[13,0],[-14.5,-13],[14.5,-13],[0,0]]){
    const l = new T.PointLight(0xffe2b8, 22, 20, 1.7);
    l.position.set(x, 3.4, z); szene.add(l);
    const g = new T.Mesh(new T.BoxGeometry(1.6, 0.12, 0.5),
                         new T.MeshBasicMaterial({color:0xfff0d0}));
    g.position.set(x, 3.55, z); szene.add(g);
  }
  szene.add(new T.AmbientLight(0x5a6470, 1.5));
  szene.add(new T.HemisphereLight(0x8899aa, 0x20262e, 0.8));
}

/* ── Anstoßen ─────────────────────────────────────────────────────────
   Kreis gegen Rechtecke, Achse für Achse aufgelöst. Das reicht für eine
   Küche aus lauter rechtwinkligen Möbeln und rutscht sauber an Kanten
   entlang, statt hängenzubleiben. */
const FEST = KISTEN.filter(k => !k.deko && k.h > 0.4);
function schiebeFrei(p, r){
  for(const k of FEST){
    if(k.y > 1.4) continue;                       // drüber weg (Deko oben)
    const hx = k.b/2 + r, hz = k.t/2 + r;
    const dx = p.x - k.x, dz = p.z - k.z;
    if(Math.abs(dx) < hx && Math.abs(dz) < hz){
      const rausX = hx - Math.abs(dx), rausZ = hz - Math.abs(dz);
      if(rausX < rausZ) p.x += Math.sign(dx || 1) * rausX;
      else              p.z += Math.sign(dz || 1) * rausZ;
    }
  }
  p.x = klemm(p.x, -HALLE.x+0.8, HALLE.x-0.8);
  p.z = klemm(p.z, -HALLE.z+0.8, HALLE.z-0.8);
}
/* Sichtlinie: trifft die Strecke a→b eine Kiste? Grob abgetastet, das
   genügt bei Möbeln dieser Größe und kostet fast nichts. */
function freieSicht(a, b, hoehe=1.2){
  const dx = b.x-a.x, dz = b.z-a.z;
  const d = Math.hypot(dx, dz);
  const schritte = Math.ceil(d/0.45);
  for(let i=1;i<schritte;i++){
    const t = i/schritte, x = a.x+dx*t, z = a.z+dz*t;
    for(const k of FEST){
      if(k.y + k.h < hoehe) continue;
      if(Math.abs(x-k.x) < k.b/2 && Math.abs(z-k.z) < k.t/2) return false;
    }
  }
  return true;
}

/* ── Raster für die Bots ──────────────────────────────────────────── */
const RZ = 1.0;
const RB = Math.ceil(HALLE.x*2/RZ), RH = Math.ceil(HALLE.z*2/RZ);
const zuRaster = (x,z) => [Math.floor((x+HALLE.x)/RZ), Math.floor((z+HALLE.z)/RZ)];
const zuWelt = (i,j) => ({x: i*RZ - HALLE.x + RZ/2, z: j*RZ - HALLE.z + RZ/2});
const blockiert = new Uint8Array(RB*RH);
for(let j=0;j<RH;j++) for(let i=0;i<RB;i++){
  const w = zuWelt(i,j);
  for(const k of FEST){
    if(k.y > 1.4) continue;
    if(Math.abs(w.x-k.x) < k.b/2 + 0.45 && Math.abs(w.z-k.z) < k.t/2 + 0.45){
      blockiert[j*RB+i] = 1; break;
    }
  }
  if(w.x < -HALLE.x+1 || w.x > HALLE.x-1 || w.z < -HALLE.z+1 || w.z > HALLE.z-1)
    blockiert[j*RB+i] = 1;
}
/* Breitensuche vom Ziel aus: ein Entfernungsfeld, dem alle Bots folgen
   können, die dasselbe Ziel haben. Einmal rechnen statt fünfmal. */
function feldZu(zx, zz){
  const d = new Uint16Array(RB*RH).fill(65535);
  const [zi, zj] = zuRaster(zx, zz);
  if(zi<0||zj<0||zi>=RB||zj>=RH) return d;
  const start = zj*RB+zi;
  d[start] = 0;
  const q = [start];
  for(let k=0;k<q.length;k++){
    const c = q[k], i = c%RB, j = (c/RB)|0;
    for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const ni = i+di, nj = j+dj;
      if(ni<0||nj<0||ni>=RB||nj>=RH) continue;
      const n = nj*RB+ni;
      if(blockiert[n] || d[n] !== 65535) continue;
      d[n] = d[c]+1; q.push(n);
    }
  }
  return d;
}
function schrittRichtung(feld, x, z){
  const [i,j] = zuRaster(x,z);
  if(i<0||j<0||i>=RB||j>=RH) return null;
  let best = null, bw = feld[j*RB+i];
  for(const [di,dj] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){
    const ni=i+di, nj=j+dj;
    if(ni<0||nj<0||ni>=RB||nj>=RH) continue;
    const n = nj*RB+ni;
    if(blockiert[n]) continue;
    if(feld[n] < bw){ bw = feld[n]; best = zuWelt(ni,nj); }
  }
  return best;
}

/* ── Modelle ──────────────────────────────────────────────────────── */
let vorlageKoerper = null, vorlagePistole = null;
function ladeModelle(fortschritt){
  const l = new GLTFLoader();
  const hol = (pfad, was) => l.loadAsync(pfad).then(g => { fortschritt(was); return g; });
  return Promise.all([
    hol('./modelle/koch.glb', 'Figur'),
    hol('./modelle/pistole.glb', 'Pistole')
  ]).then(([figur, waffe]) => {
    vorlageKoerper = figur.scene;
    /* Der Rohbau steht in Zentimetern und schaut in die falsche Richtung.
       Einmal messen, einmal einnorden — danach stimmen alle Klone. */
    const box = new T.Box3().setFromObject(vorlageKoerper);
    const hoehe = box.max.y - box.min.y;
    vorlageKoerper.scale.setScalar(1.8 / (hoehe || 1.8));
    vorlagePistole = waffe.scene;
    const pb = new T.Box3().setFromObject(vorlagePistole);
    const pl = Math.max(pb.max.x-pb.min.x, pb.max.y-pb.min.y, pb.max.z-pb.min.z);
    vorlagePistole.scale.setScalar(0.22 / (pl || 0.22));
  });
}
const KNOCHEN = ['pelvis_01','spine_02','chest_03','head_05',
                 'upper_arm_left_07','forearm_left_08','upper_arm_right_014','forearm_right_015',
                 'thigh_left_020','shin.L_021','thigh_right_023','shin.R_024'];
function baueKoerper(farbe){
  const g = skelettKlon(vorlageKoerper);
  const k = {};
  g.traverse(o => {
    if(o.isBone && KNOCHEN.includes(o.name)) k[o.name] = o;
    if(o.isMesh){
      o.material = o.material.clone();
      o.material.color.multiply(new T.Color(farbe));
      o.frustumCulled = false;      // geklonte Skinnetze melden falsche Grenzen
    }
  });
  const wurzel = new T.Group(); wurzel.add(g);
  // Ruhehaltung merken, damit die gerechnete Bewegung darauf aufsetzt
  const ruhe = {};
  for(const n in k) ruhe[n] = k[n].rotation.clone();
  return {wurzel, knochen:k, ruhe};
}
/* Gehen, Zielen und Umfallen sind gerechnet — das Modell bringt ein
   Skelett mit, aber keine einzige Animationsspur. */
function belebe(koerper, takt, tempo, tot){
  const {knochen:k, ruhe:r} = koerper;
  const setz = (n, x, y, z) => { const b = k[n]; if(!b) return;
    b.rotation.set(r[n].x + x, r[n].y + y, r[n].z + z); };
  if(tot){
    /* Nur die Gelenke zu verdrehen sah aus wie ein Kopfstand. Hinlegen
       macht die Gruppe selbst (siehe koerperStellen), hier bleibt nur
       eine schlaffe Haltung. */
    setz('spine_02', 0.16, 0, 0);
    setz('upper_arm_left_07', 0, 0, 0.8);
    setz('upper_arm_right_014', 0, 0, -0.8);
    setz('thigh_left_020', 0.25, 0, 0);
    setz('thigh_right_023', -0.15, 0, 0);
    return;
  }
  const s = Math.sin(takt) * tempo, c = Math.cos(takt) * tempo;
  setz('thigh_left_020',  s*0.85, 0, 0);
  setz('thigh_right_023', -s*0.85, 0, 0);
  setz('shin.L_021',  Math.max(0, -s)*0.9, 0, 0);
  setz('shin.R_024',  Math.max(0,  s)*0.9, 0, 0);
  setz('upper_arm_left_07',  -s*0.5, 0, 0.25);
  setz('upper_arm_right_014', s*0.5, 0, -0.25);
  setz('spine_02', 0.06 + Math.abs(c)*0.05, 0, 0);
}

/* ── Kämpfer ──────────────────────────────────────────────────────── */
const AUGE = 1.62, RADIUS = 0.42;
class Kaempfer {
  constructor(team, name, istIch){
    this.team = team; this.name = name; this.istIch = !!istIch;
    this.x = 0; this.z = 0; this.y = 0; this.vy = 0;
    this.gier = 0; this.nick = 0;
    this.leben = 100; this.lebt = true;
    this.magazin = 12; this.vorrat = 36; this.ladeUhr = 0; this.feuerUhr = 0;
    this.takt = 0; this.traegtTopf = false;
    this.zielUhr = 0; this.feind = null; this.streuUhr = 0;
    if(!istIch){
      this.koerper = baueKoerper(team === 'koch' ? 0xffca7a : 0x8fc4f5);
      szene.add(this.koerper.wurzel);
    }
  }
  get augeY(){ return this.y + AUGE; }
  setzeAn(p){ this.x = p.x; this.z = p.z; this.y = 0; this.vy = 0; }
  wiederbeleben(p){
    this.leben = 100; this.lebt = true; this.magazin = 12; this.vorrat = 36;
    this.ladeUhr = 0; this.traegtTopf = false; this.feind = null;
    this.setzeAn(p);
    if(this.koerper) this.koerper.wurzel.visible = true;
  }
  schaden(menge, von){
    if(!this.lebt) return;
    this.leben -= menge;
    if(this.leben <= 0){
      this.leben = 0; this.lebt = false;
      if(this.traegtTopf) topfFallenLassen(this);
      meldeAbschuss(von, this);
      if(this.istIch){ sp.totUhr = 0; sp.toeter = von ? von.name : null; }
    } else if(this.istIch){
      sp.wehUhr = 0.35;
    }
  }
}

/* ── Der Topf ─────────────────────────────────────────────────────── */
let topfNetz = null;
function baueTopf(){
  const g = new T.Group();
  const koerper = new T.Mesh(new T.CylinderGeometry(0.34, 0.30, 0.42, 14), M.topf);
  koerper.position.y = 0.21; g.add(koerper);
  const deckel = new T.Mesh(new T.CylinderGeometry(0.36, 0.36, 0.05, 14), M.stahl);
  deckel.position.y = 0.45; g.add(deckel);
  const knauf = new T.Mesh(new T.SphereGeometry(0.06, 8, 6), M.dunkel);
  knauf.position.y = 0.51; g.add(knauf);
  for(const s of [-1,1]){
    const griff = new T.Mesh(new T.TorusGeometry(0.09, 0.022, 6, 10), M.dunkel);
    griff.position.set(s*0.36, 0.28, 0); griff.rotation.y = Math.PI/2; g.add(griff);
  }
  szene.add(g); return g;
}
const topf = {zustand:'lager', x:TOPF_START.x, z:TOPF_START.z, traeger:null, herd:null,
              kochUhr:0, griffUhr:0, greifer:null};
function topfFallenLassen(wer){
  wer.traegtTopf = false;
  topf.zustand = 'boden'; topf.traeger = null;
  topf.x = wer.x; topf.z = wer.z;
}

/* ── Zustand ──────────────────────────────────────────────────────── */
const RUNDEN_ZIEL = 4, RUNDE_S = 100, KOCH_S = 35, STELL_S = 3, RUNTER_S = 5;
let sp = null, laeuft = false, ich = null;
const lauffeld = [];

function neuesSpiel(){
  sp = {phase:'vor', uhr:3, rundeKoch:0, rundeKont:0, runde:1,
        totUhr:0, wehUhr:0, ruecken:0, treffUhr:0, meldUhr:0};
  for(const k of kaempfer) k.wiederbeleben(startPunkt(k));
  lauffeld.length = 0; zeichneLauf();
  rundeAufbauen();
}
const kaempfer = [];
function startPunkt(k){
  const b = k.team === 'koch' ? SPAWN_KOCH : SPAWN_KONT;
  const i = kaempfer.filter(x => x.team === k.team).indexOf(k);
  return {x: b.x + (i-1)*2.4 + zuf(-.4,.4), z: b.z + zuf(-.6,.6)};
}
function rundeAufbauen(){
  sp.phase = 'vor'; sp.uhr = 3;
  for(const k of kaempfer) k.wiederbeleben(startPunkt(k));
  topf.zustand = 'lager'; topf.x = TOPF_START.x; topf.z = TOPF_START.z;
  topf.traeger = null; topf.herd = null; topf.kochUhr = 0; topf.griffUhr = 0;
  melde('RUNDE ' + sp.runde, 'Topf holen und aufstellen');
}
function rundeVorbei(wer, grund){
  if(sp.phase !== 'lauf') return;
  sp.phase = 'aus'; sp.uhr = 4;
  if(wer === 'koch') sp.rundeKoch++; else sp.rundeKont++;
  melde(wer === 'koch' ? 'DURCHGEKOCHT' : 'ABGEBROCHEN', grund);
  anzeige();
}

/* ── Eingabe ──────────────────────────────────────────────────────── */
const tasten = new Set();
let zeigerFest = false;
addEventListener('keydown', e => {
  if(!laeuft || !sp) return;
  tasten.add(e.code);
  if(e.code === 'KeyR') nachladen(ich);
  if(e.code === 'KeyE') sp.nutzen = true;
  if(e.code === 'Space'){ springen(ich); e.preventDefault(); }
});
addEventListener('keyup', e => tasten.delete(e.code));
addEventListener('blur', () => tasten.clear());
leinwand.addEventListener('mousedown', e => {
  if(!laeuft || !sp) return;
  if(!zeigerFest && !daumen.aktiv){ leinwand.requestPointerLock(); return; }
  if(e.button === 0) sp.feuerHalten = true;
});
addEventListener('mouseup', e => { if(sp && e.button === 0) sp.feuerHalten = false; });
document.addEventListener('pointerlockchange', () => {
  zeigerFest = document.pointerLockElement === leinwand;
});
document.addEventListener('mousemove', e => {
  if(!zeigerFest || !ich) return;      // tot darf man weiterschauen
  ich.gier -= e.movementX * 0.0022;
  ich.nick = klemm(ich.nick - e.movementY * 0.0020, -1.35, 1.35);
});

/* Daumensteuerung — dieselbe Aufteilung wie bei BloxRot: links laufen,
   rechts zielen, Knöpfe rechts unten. Entschieden wird pro Zeiger, damit
   ein Rechner mit Berührungsbildschirm bei der Maus bleibt. */
const daumen = {
  aktiv:false, knueppel:{x:0,y:0}, stiel:null, blick:null, wurzel:null,
  bauen(){
    const stil = document.createElement('style');
    stil.textContent = `
#daumen{position:fixed; inset:0; z-index:15; pointer-events:none; display:none; touch-action:none}
#daumen.an{display:block}
@media (hover:none) and (pointer:coarse){ #daumen{display:block} }
#dstab{position:absolute; width:120px; height:120px; margin:-60px 0 0 -60px; border-radius:50%;
  border:2px solid #ffffff30; background:#0d101655; display:none}
#dstab.an{display:block}
#dstab i{position:absolute; left:50%; top:50%; width:52px; height:52px; margin:-26px 0 0 -26px;
  border-radius:50%; background:#ffffffcc}
#dtasten{position:absolute; right:calc(14px + env(safe-area-inset-right,0px));
  bottom:calc(14px + env(safe-area-inset-bottom,0px)); display:grid;
  grid-template-columns:auto auto; gap:9px; align-items:end; justify-items:end}
#dtasten button{font-family:inherit; font-size:11px; font-weight:700; color:#fff;
  pointer-events:auto; touch-action:none; width:60px; height:60px; border-radius:50%;
  border:2px solid #ffffff40; background:#161b24cc}
#dtasten button.gross{width:82px; height:82px; font-size:12px; border-color:#ffb64866}
#dtasten button:active{transform:scale(.93); background:#ffb64855}
@media (max-height:430px){ #dtasten button{width:52px;height:52px} #dtasten button.gross{width:70px;height:70px} }`;
    document.head.appendChild(stil);
    const w = document.createElement('div');
    w.id = 'daumen';
    w.innerHTML = '<div id="dstab"><i></i></div><div id="dtasten">' +
      '<button type="button" data-tu="nutzen">E</button>' +
      '<button type="button" data-tu="laden">LADEN</button>' +
      '<button type="button" data-tu="springen">HOCH</button>' +
      '<button type="button" data-tu="feuer" class="gross">FEUER</button></div>';
    document.body.appendChild(w);
    this.wurzel = w; this.stab = w.querySelector('#dstab'); this.knopf = this.stab.querySelector('i');
    for(const b of w.querySelectorAll('button')){
      const tu = b.dataset.tu;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); this.wecken();
        if(!sp) return;
        if(tu === 'feuer') sp.feuerHalten = true;
        if(tu === 'laden') nachladen(ich);
        if(tu === 'springen') springen(ich);
        if(tu === 'nutzen') sp.nutzen = true;
      });
      for(const art of ['pointerup','pointercancel','pointerleave'])
        b.addEventListener(art, () => { if(sp && tu === 'feuer') sp.feuerHalten = false; });
    }
    /* Berührungen laufen über TouchEvents, nicht über PointerEvents.
       Grund ist gemessen: in der Prüfumgebung meldet der PointerEvent
       clientX = 0, während der TouchEvent daneben die richtige Stelle
       trägt — der Knüppel bekam damit immer die Auslenkung null. Touch
       ist hier ohnehin die genauere Quelle: er bringt die Kennung des
       einzelnen Fingers gleich mit. Die Maus bleibt bei den Zeigern. */
    addEventListener('touchstart', e => this.nieder(e), {passive:false});
    addEventListener('touchmove', e => this.zug(e), {passive:false});
    for(const art of ['touchend','touchcancel'])
      addEventListener(art, e => this.hoch(e), {passive:false});
  },
  wecken(){ if(!this.aktiv){ this.aktiv = true; this.wurzel.classList.add('an'); } },
  nieder(e){
    for(const t of e.changedTouches){
      if(t.target.closest && t.target.closest('#dtasten')) continue;
      this.wecken();
      if(t.clientX < innerWidth*0.5){
        if(this.stiel) continue;
        this.stiel = {id:t.identifier, x:t.clientX, y:t.clientY};
        this.stab.style.left = t.clientX+'px'; this.stab.style.top = t.clientY+'px';
        this.stab.classList.add('an');
      } else {
        if(this.blick) continue;
        this.blick = {id:t.identifier, x:t.clientX, y:t.clientY};
      }
      e.preventDefault();
    }
  },
  zug(e){
    for(const t of e.changedTouches){
      if(this.stiel && t.identifier === this.stiel.id){
        e.preventDefault();
        const weit = 50;
        let dx = t.clientX - this.stiel.x, dy = t.clientY - this.stiel.y;
        const l = Math.hypot(dx,dy);
        if(l > weit){ dx = dx/l*weit; dy = dy/l*weit; }
        this.knopf.style.transform = `translate(${dx}px,${dy}px)`;
        this.knueppel.x = dx/weit; this.knueppel.y = dy/weit;
      } else if(this.blick && t.identifier === this.blick.id){
        e.preventDefault();
        const dx = t.clientX - this.blick.x, dy = t.clientY - this.blick.y;
        this.blick.x = t.clientX; this.blick.y = t.clientY;
        if(ich){
          ich.gier -= dx * 0.0052;
          ich.nick = klemm(ich.nick - dy * 0.0044, -1.35, 1.35);
        }
      }
    }
  },
  hoch(e){
    for(const t of e.changedTouches){
      if(this.stiel && t.identifier === this.stiel.id){
        this.stiel = null; this.stab.classList.remove('an');
        this.knueppel.x = this.knueppel.y = 0;
        this.knopf.style.transform = 'translate(0,0)';
      } else if(this.blick && t.identifier === this.blick.id){ this.blick = null; }
    }
  }
};

/* ── Waffe ────────────────────────────────────────────────────────── */
const WAFFE = {schaden:26, kopf:100, takt:0.14, laden:1.4, magazin:12, streu:0.011, reichweite:60};
let waffenNetz = null;
function nachladen(k){
  if(!k || !k.lebt || k.ladeUhr > 0) return;
  if(k.magazin >= WAFFE.magazin || k.vorrat <= 0) return;
  k.ladeUhr = WAFFE.laden;
}
function springen(k){
  if(k && k.lebt && k.y <= 0.001){ k.vy = 4.6; }
}
/* Ein Schuss ist eine Gerade: erst prüfen, ob eine Wand dazwischen ist,
   dann, wen sie unterwegs trifft. Kopf zählt doppelt und mehr. */
function schiessen(schuetze, richtung, streu){
  const start = {x:schuetze.x, y:schuetze.augeY, z:schuetze.z};
  const r = richtung.clone();
  r.x += zuf(-streu,streu); r.y += zuf(-streu,streu); r.z += zuf(-streu,streu);
  r.normalize();
  let bestesT = WAFFE.reichweite, opfer = null, kopf = false;
  for(const k of kaempfer){
    if(k === schuetze || !k.lebt || k.team === schuetze.team) continue;
    for(const [hy, rad, istKopf] of [[k.y+1.05, 0.40, false], [k.y+1.58, 0.20, true]]){
      const dx = k.x-start.x, dy = hy-start.y, dz = k.z-start.z;
      const t = dx*r.x + dy*r.y + dz*r.z;
      if(t <= 0 || t >= bestesT) continue;
      const ax = start.x + r.x*t, ay = start.y + r.y*t, az = start.z + r.z*t;
      if(Math.hypot(ax-k.x, ay-hy, az-k.z) < rad){
        if(freieSicht(start, {x:k.x,z:k.z}, Math.min(start.y, hy))){
          bestesT = t; opfer = k; kopf = istKopf;
        }
      }
    }
  }
  if(opfer) opfer.schaden(kopf ? WAFFE.kopf : WAFFE.schaden, schuetze);
  return opfer;
}
function feuern(k, richtung){
  if(!k.lebt || k.feuerUhr > 0 || k.ladeUhr > 0) return false;
  if(k.magazin <= 0){ nachladen(k); return false; }
  k.magazin--; k.feuerUhr = WAFFE.takt;
  const streu = WAFFE.streu * (k.istIch ? (1 + k.streuUhr*2.2) : 2.4);
  const getroffen = schiessen(k, richtung, streu);
  if(k.istIch){
    sp.ruecken += 0.035;
    if(getroffen){ sp.treffUhr = 0.12; }
  }
  return true;
}

/* ── Der Spieler ──────────────────────────────────────────────────── */
const TEMPO = 5.0, SCHWERKRAFT = 14;
function ichDenken(dt){
  if(!ich.lebt) return;
  let vor = 0, quer = 0;
  if(tasten.has('KeyW') || tasten.has('ArrowUp'))    vor += 1;
  if(tasten.has('KeyS') || tasten.has('ArrowDown'))  vor -= 1;
  if(tasten.has('KeyA') || tasten.has('ArrowLeft'))  quer -= 1;
  if(tasten.has('KeyD') || tasten.has('ArrowRight')) quer += 1;
  if(daumen.knueppel.x || daumen.knueppel.y){ quer += daumen.knueppel.x; vor -= daumen.knueppel.y; }
  const laenge = Math.hypot(vor, quer);
  if(laenge > 1){ vor /= laenge; quer /= laenge; }
  const sin = Math.sin(ich.gier), cos = Math.cos(ich.gier);
  const vx = (-sin*vor + cos*quer) * TEMPO;
  const vz = (-cos*vor - sin*quer) * TEMPO;
  ich.x += vx*dt; ich.z += vz*dt;
  schiebeFrei(ich, RADIUS);
  ich.vy -= SCHWERKRAFT*dt; ich.y += ich.vy*dt;
  if(ich.y < 0){ ich.y = 0; ich.vy = 0; }
  ich.takt += dt * Math.hypot(vx,vz) * 1.6;
  /* Wer läuft, trifft schlechter — sonst gibt es keinen Grund
     stehenzubleiben, und dann ist es kein taktisches Spiel mehr. */
  const tempoAnteil = Math.hypot(vx,vz) / TEMPO;
  ich.streuUhr = misch(ich.streuUhr, tempoAnteil, Math.min(dt*6,1));

  if(ich.feuerUhr > 0) ich.feuerUhr -= dt;
  if(ich.ladeUhr > 0){
    ich.ladeUhr -= dt;
    if(ich.ladeUhr <= 0){
      const braucht = WAFFE.magazin - ich.magazin;
      const nimmt = Math.min(braucht, ich.vorrat);
      ich.magazin += nimmt; ich.vorrat -= nimmt;
    }
  }
  if(sp.feuerHalten && sp.phase === 'lauf'){
    const r = new T.Vector3(0,0,-1).applyEuler(new T.Euler(ich.nick, ich.gier, 0, 'YXZ'));
    feuern(ich, r);
  }
  sp.ruecken = Math.max(0, sp.ruecken - dt*0.28);
}

/* ── Topf anfassen ────────────────────────────────────────────────── */
function topfPosition(){
  if(topf.zustand === 'getragen' && topf.traeger)
    return {x:topf.traeger.x, z:topf.traeger.z, y:1.0};
  if(topf.zustand === 'herd' || topf.zustand === 'kocht'){
    const H = HERDE.find(h => h.name === topf.herd);
    return {x:H.x, z:H.z, y:1.05};
  }
  return {x:topf.x, z:topf.z, y:0};
}
function naheHerd(k){
  for(const H of HERDE) if(Math.hypot(k.x-H.x, k.z-H.z) < H.r) return H;
  return null;
}
/* Aufnehmen, Abstellen, Runternehmen laufen alle über dasselbe Halten:
   `griffUhr` zählt hoch, solange jemand dranbleibt, und fällt zurück,
   sobald er loslässt oder wegläuft. */
function griffDenken(dt){
  let werGreift = null, was = null, dauer = 0;
  const tp = topfPosition();
  for(const k of kaempfer){
    if(!k.lebt) continue;
    const nah = Math.hypot(k.x-tp.x, k.z-tp.z) < 1.9;
    const willGreifen = k.istIch ? sp.nutzenHalten : botWillGreifen(k);
    if(!willGreifen) continue;
    if(k.team === 'koch'){
      if((topf.zustand === 'lager' || topf.zustand === 'boden') && nah && !topf.traeger){
        k.traegtTopf = true; topf.zustand = 'getragen'; topf.traeger = k;
        if(k.istIch) melde('TOPF', 'jetzt auf einen Herd damit');
        return;
      }
      if(topf.zustand === 'getragen' && topf.traeger === k && naheHerd(k)){
        werGreift = k; was = 'stellen'; dauer = STELL_S;
      }
    } else {
      if((topf.zustand === 'herd' || topf.zustand === 'kocht') && nah){
        werGreift = k; was = 'runter'; dauer = RUNTER_S;
      }
    }
  }
  if(werGreift){
    if(topf.greifer !== werGreift){ topf.greifer = werGreift; topf.griffUhr = 0; }
    topf.griffUhr += dt;
    topf.griffArt = was; topf.griffDauer = dauer;
    if(topf.griffUhr >= dauer){
      if(was === 'stellen'){
        const H = naheHerd(werGreift);
        werGreift.traegtTopf = false;
        topf.zustand = 'kocht'; topf.herd = H.name; topf.traeger = null; topf.kochUhr = KOCH_S;
        melde('TOPF STEHT', 'Herd ' + H.name + ' — ' + KOCH_S + ' Sekunden');
      } else {
        topf.zustand = 'boden'; topf.herd = null;
        topf.x = werGreift.x; topf.z = werGreift.z;
        melde('RUNTERGENOMMEN', 'die Kontrolle hat den Topf');
        rundeVorbei('kont', 'Topf vom Herd genommen');
      }
      topf.griffUhr = 0; topf.greifer = null;
    }
  } else {
    topf.greifer = null;
    topf.griffUhr = Math.max(0, topf.griffUhr - dt*2);
  }
}

/* ── Bots ─────────────────────────────────────────────────────────────
   Drei Zustände reichen: zum Ziel laufen, auf Sicht schießen, in Deckung
   bleiben, wenn nichts zu tun ist. Wichtiger als Schlauheit ist, dass sie
   nicht in Ecken kleben — dafür sorgt das Entfernungsfeld. */
let felder = {}, feldUhr = 0;
function felderRechnen(){
  const tp = topfPosition();
  felder.topf = feldZu(tp.x, tp.z);
  felder.herdA = feldZu(HERDE[0].x, HERDE[0].z);
  felder.herdB = feldZu(HERDE[1].x, HERDE[1].z);
}
function botWillGreifen(k){
  const tp = topfPosition();
  if(Math.hypot(k.x-tp.x, k.z-tp.z) > 1.9) return false;
  if(k.team === 'koch') return topf.zustand !== 'kocht';
  return topf.zustand === 'kocht' || topf.zustand === 'herd';
}
function botZiel(k){
  if(k.team === 'koch'){
    if(k.traegtTopf) return k.lieblingsHerd === 'B' ? felder.herdB : felder.herdA;
    if(topf.zustand === 'lager' || topf.zustand === 'boden') return felder.topf;
    if(topf.zustand === 'kocht') return felder.topf;      // bewachen
    return k.lieblingsHerd === 'B' ? felder.herdB : felder.herdA;
  }
  if(topf.zustand === 'kocht' || topf.zustand === 'herd') return felder.topf;
  if(topf.zustand === 'getragen') return felder.topf;
  return k.lieblingsHerd === 'B' ? felder.herdB : felder.herdA;
}
function botDenken(k, dt){
  if(!k.lebt) return;
  if(k.feuerUhr > 0) k.feuerUhr -= dt;
  if(k.ladeUhr > 0){
    k.ladeUhr -= dt;
    if(k.ladeUhr <= 0){
      const n = Math.min(WAFFE.magazin - k.magazin, k.vorrat);
      k.magazin += n; k.vorrat -= n;
    }
  }
  // Feind suchen
  let feind = null, beste = 1e9;
  for(const g of kaempfer){
    if(!g.lebt || g.team === k.team) continue;
    const d = Math.hypot(g.x-k.x, g.z-k.z);
    if(d > 34 || d > beste) continue;
    if(!freieSicht({x:k.x, z:k.z}, {x:g.x, z:g.z}, 1.3)) continue;
    beste = d; feind = g;
  }
  if(feind !== k.feind){ k.feind = feind; k.zielUhr = feind ? zuf(0.22, 0.5) : 0; }

  let laufZiel = null;
  if(feind){
    k.gier = Math.atan2(-(feind.x-k.x), -(feind.z-k.z));
    k.zielUhr -= dt;
    if(k.zielUhr <= 0 && k.magazin > 0){
      const r = new T.Vector3(feind.x-k.x, (feind.y+1.15)-(k.y+AUGE), feind.z-k.z).normalize();
      if(feuern(k, r)) k.zielUhr = zuf(0.30, 0.62);
    }
    if(k.magazin <= 0) nachladen(k);
    // auf Distanz halten, aber nicht stehenbleiben
    if(beste < 6) laufZiel = {x: k.x - (feind.x-k.x)*0.4, z: k.z - (feind.z-k.z)*0.4};
    else if(beste > 14) laufZiel = {x: feind.x, z: feind.z};
  } else {
    const feld = botZiel(k);
    const s = feld && schrittRichtung(feld, k.x, k.z);
    if(s) laufZiel = s;
  }
  if(laufZiel){
    const dx = laufZiel.x - k.x, dz = laufZiel.z - k.z;
    const d = Math.hypot(dx, dz);
    if(d > 0.15){
      const v = TEMPO * 0.86;
      k.x += dx/d * v * dt; k.z += dz/d * v * dt;
      k.takt += dt * v * 1.6;
      if(!feind) k.gier = Math.atan2(-dx, -dz);
    }
  }
  schiebeFrei(k, RADIUS);
}

/* ── Runde ────────────────────────────────────────────────────────── */
function rundeDenken(dt){
  sp.uhr -= dt;
  if(sp.phase === 'vor'){
    if(sp.uhr <= 0){ sp.phase = 'lauf'; sp.uhr = RUNDE_S; melde('LOS', ''); }
    return;
  }
  if(sp.phase === 'aus'){
    if(sp.uhr <= 0){
      if(sp.rundeKoch >= RUNDEN_ZIEL || sp.rundeKont >= RUNDEN_ZIEL){ spielEnde(); return; }
      sp.runde++; rundeAufbauen();
    }
    return;
  }
  // laufende Runde
  if(topf.zustand === 'kocht'){
    topf.kochUhr -= dt;
    if(topf.kochUhr <= 0){ rundeVorbei('koch', 'der Topf ist durch'); return; }
  }
  const kochLebt = kaempfer.some(k => k.team === 'koch' && k.lebt);
  const kontLebt = kaempfer.some(k => k.team === 'kont' && k.lebt);
  if(!kochLebt){ rundeVorbei('kont', 'alle Köche ausgeschaltet'); return; }
  if(!kontLebt && topf.zustand !== 'kocht'){ rundeVorbei('koch', 'die Küche gehört euch'); return; }
  if(sp.uhr <= 0 && topf.zustand !== 'kocht'){ rundeVorbei('kont', 'Zeit abgelaufen'); return; }
}
function spielEnde(){
  laeuft = false;
  document.body.classList.remove('spielt');
  const gewonnen = sp.rundeKoch > sp.rundeKont;
  $('#endeTitel').textContent = gewonnen ? 'DURCHGEKOCHT' : 'KÜCHE DICHT';
  $('#endeText').textContent = gewonnen
    ? `Du hast die Schicht mit ${sp.rundeKoch} zu ${sp.rundeKont} gewonnen.`
    : `Die Kontrolle hat mit ${sp.rundeKont} zu ${sp.rundeKoch} gewonnen.`;
  $('#ende').classList.remove('weg');
  $('#hud').classList.remove('an');
  if(document.pointerLockElement) document.exitPointerLock();
}
function meldeAbschuss(von, opfer){
  lauffeld.unshift({wer: von ? von.name : '—', wen: opfer.name,
                    ich: (von && von.istIch) || opfer.istIch, uhr: 5});
  if(lauffeld.length > 5) lauffeld.pop();
  zeichneLauf();
}

/* ── Anzeige ──────────────────────────────────────────────────────── */
const el = {leben:$('#leben'), lebenB:$('#leben b'), muni:$('#munition'),
            muniB:$('#munition b'), muniS:$('#munition small'),
            punkte:$('#punkte b'), uhr:$('#uhrKarte b'), lage:$('#lage'),
            ziel:$('#ziel'), zielText:$('#zielText'), zielBalken:$('#zielBalken'),
            meld:$('#meldung'), meldB:$('#meldung b'), meldS:$('#meldung small'),
            lauf:$('#lauf'), marke:$('#topfmarke'), kreuz:$('#kreuz')};
function melde(gross, klein){
  el.meldB.textContent = gross; el.meldS.textContent = klein || '';
  el.meld.classList.add('an'); sp.meldUhr = 2.2;
}
function zeichneLauf(){
  el.lauf.innerHTML = lauffeld.map(z =>
    `<div class="${z.ich?'ich':''}">${z.wer} ▸ ${z.wen}</div>`).join('');
}
const elTot = {karte:$('#totKarte'), von:$('#totVon'), lage:$('#totLage')};
function totAnzeige(){
  if(ich.lebt || sp.phase === 'aus'){ elTot.karte.classList.remove('an'); return; }
  elTot.karte.classList.add('an');
  elTot.von.textContent = sp.toeter ? sp.toeter + ' hat dich erwischt' : 'du bist raus';
  const kollegen = kaempfer.filter(k => k.team === 'koch' && k.lebt).length;
  elTot.lage.textContent = kollegen
    ? (kollegen === 1 ? 'Noch eine(r) von euch ist drin' : 'Noch ' + kollegen + ' von euch sind drin')
    : 'Runde vorbei';
}
function anzeige(){
  totAnzeige();
  el.lebenB.textContent = Math.max(0, Math.round(ich.leben));
  el.leben.classList.toggle('wenig', ich.leben <= 35);
  el.muniB.textContent = ich.ladeUhr > 0 ? '··' : ich.magazin;
  el.muniS.textContent = '/ ' + ich.vorrat;
  el.muni.classList.toggle('leer', ich.magazin === 0 && ich.ladeUhr <= 0);
  el.punkte.innerHTML = `<span>${sp.rundeKoch}</span> : <span>${sp.rundeKont}</span>`;
  const t = Math.max(0, sp.uhr);
  el.uhr.textContent = Math.floor(t/60) + ':' + String(Math.floor(t%60)).padStart(2,'0');
  el.uhr.classList.toggle('knapp', sp.phase === 'lauf' && t < 20);
  el.lage.textContent =
    sp.phase === 'vor' ? 'gleich geht es los' :
    sp.phase === 'aus' ? 'Runde vorbei' :
    topf.zustand === 'kocht' ? 'kocht: ' + Math.ceil(topf.kochUhr) + ' s' :
    topf.zustand === 'getragen' ? (topf.traeger === ich ? 'auf den Herd damit' : 'Topf ist unterwegs') :
    'Topf holen';
}
/* Die Topfmarke am Bildschirmrand: ohne sie sucht man in einer Halle mit
   Tresen ewig, und das ist keine Spannung, sondern Verwaltung. */
const hilf = new T.Vector3();
function marke(){
  const tp = topfPosition();
  if(topf.zustand === 'getragen' && topf.traeger === ich){ el.marke.classList.remove('an'); return; }
  hilf.set(tp.x, tp.y + 0.7, tp.z).project(kam);
  const vorn = hilf.z < 1;
  const x = klemm((hilf.x*0.5+0.5)*innerWidth, 22, innerWidth-22);
  const y = klemm((-hilf.y*0.5+0.5)*innerHeight, 70, innerHeight-90);
  el.marke.classList.add('an');
  el.marke.style.left = (vorn ? x : (hilf.x > 0 ? innerWidth-22 : 22)) + 'px';
  el.marke.style.top = (vorn ? y : innerHeight/2) + 'px';
  el.marke.style.opacity = vorn ? 1 : .5;
}

/* ── Waffe im Bild ────────────────────────────────────────────────── */
function baueWaffe(){
  waffenNetz = new T.Group();
  const p = vorlagePistole.clone(true);
  /* Gemessen: die längste Achse des Modells ist Z (0,22 gegen 0,15 und
     0,04), und die Masse liegt bei +Z — also zum Betrachter hin. Die
     Kamera schaut nach -Z, deshalb eine halbe Drehung, damit der Lauf
     nach vorn zeigt. Vorher stand sie quer im Bild. Das kleine Gieren
     dazu ist Absicht: eine achsenparallele Waffe sieht aufgeklebt aus. */
  p.rotation.set(0, Math.PI + 0.10, 0);
  p.position.z = -0.06;
  waffenNetz.add(p);
  szeneWaffe.add(waffenNetz);
  szeneWaffe.add(new T.AmbientLight(0xffffff, 2.2));
  const l = new T.DirectionalLight(0xfff2e0, 2.4); l.position.set(1,2,1); szeneWaffe.add(l);
}
function waffeStellen(dt){
  if(!waffenNetz) return;
  waffenNetz.visible = ich.lebt;
  if(!ich.lebt) return;
  const wippe = Math.sin(ich.takt*2) * 0.010 * ich.streuUhr;
  const seit = Math.cos(ich.takt) * 0.014 * ich.streuUhr;
  const zurueck = sp.ruecken * 0.5;
  waffenNetz.position.set(0.13 + seit, -0.14 + wippe - zurueck*0.3, -0.34 + zurueck);
  waffenNetz.rotation.set(-0.04 - sp.ruecken*1.2, 0.06, 0.02);
  if(ich.ladeUhr > 0){
    const f = 1 - Math.abs(ich.ladeUhr/WAFFE.laden - 0.5)*2;
    waffenNetz.position.y -= f*0.16;
    waffenNetz.rotation.x -= f*0.7;
  }
}

/* ── Bild ─────────────────────────────────────────────────────────── */
function koerperStellen(dt){
  for(const k of kaempfer){
    if(!k.koerper) continue;
    k.koerper.wurzel.position.set(k.x, k.y, k.z);
    k.koerper.wurzel.rotation.set(0, k.gier, 0);
    if(!k.lebt){
      // nach hinten umkippen und liegen bleiben
      k.kippUhr = Math.min(1, (k.kippUhr || 0) + dt*3.4);
      k.koerper.wurzel.rotation.x = -Math.PI/2 * k.kippUhr;
      k.koerper.wurzel.position.y = k.y + 0.12*k.kippUhr;
    } else k.kippUhr = 0;
    belebe(k.koerper, k.takt, k.lebt ? 1 : 0, !k.lebt);
  }
  const tp = topfPosition();
  if(topfNetz){
    topfNetz.visible = !(topf.zustand === 'getragen' && topf.traeger === ich);
    topfNetz.position.set(tp.x, tp.y, tp.z);
    topfNetz.rotation.y += dt * (topf.zustand === 'kocht' ? 0.6 : 0.1);
  }
}
function kameraStellen(){
  if(!ich.lebt){
    /* Zuschauen: die Kamera hängt sich hinter einen lebenden Kollegen.
       Vorher blieb sie am Sterbeort stehen, und wer allein starb, sah bis
       zum Rundenende eine Wand an — das fühlte sich an wie ein Fehler,
       obwohl die Regel (Rückkehr erst zur nächsten Runde) so gewollt ist. */
    const kollege = kaempfer.find(k => k.team === ich.team && k.lebt);
    const ziel = kollege || {x:ich.x, y:0, z:ich.z};
    /* Die Kamera darf nicht durch die Wand rutschen — sonst schaut man
       von außen auf die Halle. Also den Abstand so weit verkürzen, bis
       die Sicht auf den Kollegen frei ist. */
    let abstand = kollege ? 4.2 : 0.2;
    if(kollege){
      while(abstand > 0.6){
        const px = ziel.x + Math.sin(ich.gier)*abstand;
        const pz = ziel.z + Math.cos(ich.gier)*abstand;
        if(Math.abs(px) < HALLE.x-0.6 && Math.abs(pz) < HALLE.z-0.6 &&
           freieSicht({x:ziel.x, z:ziel.z}, {x:px, z:pz}, 1.8)) break;
        abstand -= 0.5;
      }
    }
    const p = {
      x: ziel.x + Math.sin(ich.gier) * abstand,
      y: ziel.y + (kollege ? 2.5 : AUGE - 0.9),
      z: ziel.z + Math.cos(ich.gier) * abstand
    };
    kam.position.lerp(new T.Vector3(p.x, p.y, p.z), 0.12);
    if(kollege) kam.lookAt(ziel.x, ziel.y + 1.2, ziel.z);
    else kam.rotation.set(ich.nick, ich.gier, 0, 'YXZ');
    return;
  }
  kam.position.set(ich.x, ich.augeY, ich.z);
  kam.rotation.set(ich.nick + sp.ruecken, ich.gier, 0, 'YXZ');
  if(sp.wehUhr > 0){
    kam.position.x += zuf(-0.04, 0.04);
    kam.position.y += zuf(-0.04, 0.04);
  }
}

/* ── Schleife ─────────────────────────────────────────────────────── */
let vorher = 0;
function schleife(t){
  requestAnimationFrame(schleife);
  const dt = Math.min(0.05, (t - vorher)/1000 || 0);
  vorher = t;
  if(laeuft && sp){
    sp.nutzenHalten = sp.nutzen || tasten.has('KeyE');
    sp.nutzen = false;
    rundeDenken(dt);
    /* Nur in der laufenden Runde wird gelaufen und geschossen. Vorher
       standen die Bots schon im Gefecht, bevor die Runde begonnen hatte —
       die Vorbereitungszeit war damit sinnlos. */
    if(sp.phase === 'lauf'){
      ichDenken(dt);
      feldUhr -= dt;
      if(feldUhr <= 0){ felderRechnen(); feldUhr = 0.4; }
      for(const k of kaempfer) if(!k.istIch) botDenken(k, dt);
      griffDenken(dt);
    }
    if(sp.wehUhr > 0) sp.wehUhr -= dt;
    if(sp.treffUhr > 0){ sp.treffUhr -= dt; el.kreuz.classList.add('treffer'); }
    else el.kreuz.classList.remove('treffer');
    if(sp.meldUhr > 0){ sp.meldUhr -= dt; if(sp.meldUhr <= 0) el.meld.classList.remove('an'); }
    for(const z of lauffeld) z.uhr -= dt;
    if(lauffeld.length && lauffeld[lauffeld.length-1].uhr <= 0){ lauffeld.pop(); zeichneLauf(); }
    // Griffbalken
    if(topf.greifer && topf.griffUhr > 0.05){
      el.ziel.classList.add('an');
      el.zielText.textContent = topf.griffArt === 'stellen' ? 'Topf abstellen' : 'Topf runternehmen';
      el.zielBalken.style.width = Math.round(topf.griffUhr/topf.griffDauer*100) + '%';
    } else el.ziel.classList.remove('an');
    koerperStellen(dt);
    kameraStellen();
    waffeStellen(dt);
    marke();
    anzeige();
  }
  rnd.render(szene, kam);
  rnd.autoClear = false;
  rnd.clearDepth();
  rnd.render(szeneWaffe, kamWaffe);
  rnd.autoClear = true;
}

/* ── Start ────────────────────────────────────────────────────────── */
function aufstellen(){
  ich = new Kaempfer('koch', 'Du', true);
  kaempfer.push(ich);
  for(const [n, i] of [['Rosa',0],['Timo',1]])
    kaempfer.push(Object.assign(new Kaempfer('koch', n), {lieblingsHerd: i ? 'B' : 'A'}));
  for(const [n, i] of [['Kontrolle 1',0],['Kontrolle 2',1],['Kontrolle 3',2]])
    kaempfer.push(Object.assign(new Kaempfer('kont', n), {lieblingsHerd: i%2 ? 'B' : 'A'}));
}
async function starten(){
  $('#start').classList.add('weg'); $('#ende').classList.add('weg');
  document.body.classList.add('spielt');
  if(!vorlageKoerper){
    $('#hud').classList.remove('an');
    await ladeModelle(() => {});
    baueWelt(); baueWaffe(); topfNetz = baueTopf(); aufstellen();
    daumen.bauen();
  }
  $('#hud').classList.add('an');
  neuesSpiel();
  laeuft = true;
  if(!daumen.aktiv) leinwand.requestPointerLock();
}
$('#losKnopf').addEventListener('click', starten);
$('#nochmal').addEventListener('click', starten);
requestAnimationFrame(t => { vorher = t; requestAnimationFrame(schleife); });

window.__kueche = {
  get sp(){return sp}, get kaempfer(){return kaempfer}, topf, HERDE, KISTEN,
  get ich(){return ich}, get laeuft(){return laeuft},
  starten, feuern, schiessen, feldZu, freieSicht, rnd, T, daumen,
  get waffenNetz(){return waffenNetz}, get vorlagePistole(){return vorlagePistole},
  kamera: () => ({x:+kam.position.x.toFixed(1), y:+kam.position.y.toFixed(1), z:+kam.position.z.toFixed(1),
    drin: Math.abs(kam.position.x) < HALLE.x && Math.abs(kam.position.z) < HALLE.z}),
  get tasten(){return tasten}
};
