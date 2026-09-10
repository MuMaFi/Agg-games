import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/* ======================================================================
   FOUND TAPE · EBENE 2 — DIE WIESE

   Gras bis zum Rand, ein Himmel mit der falschen Farbe, sonst nichts.
   Keine Aufgabe, kein Gegenstand, keine Tür. Nur sechs Minuten Band und
   etwas Hohes, das still steht, solange du hinsiehst.

   Die Wiese ist nicht gebaut, sondern gerechnet: eine Höhenfunktion, aus
   der sowohl das Netz als auch der Boden unter den Füßen kommt. Deshalb
   hört sie nirgends auf.
   ====================================================================== */

/* ======================= 1  Rahmen ======================= */
const QUAL = {
  low:  { netz:96,  weite:210, schatten:false, sicht:0.80 },
  mid:  { netz:128, weite:250, schatten:false, sicht:0.92 },
  high: { netz:176, weite:300, schatten:true,  sicht:1.0 },
};
const IS_TOUCH = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
let qKey = localStorage.getItem('wi_q') || (IS_TOUCH ? 'low' : 'high');
if(!QUAL[qKey]) qKey = 'mid';
const Q = QUAL[qKey];

const GRADE = {
  fern:   { tempo:4.2, stoer:0.085, ruf:26, name:'Fern' },
  normal: { tempo:5.6, stoer:0.135, ruf:20, name:'Normal' },
  nah:    { tempo:7.2, stoer:0.195, ruf:15, name:'Nah' },
};
let gKey = localStorage.getItem('wi_diff') || 'normal';
if(!GRADE[gKey]) gKey = 'normal';
let GR = GRADE[gKey];

const BANDLAENGE = 360;          // sechs Minuten

const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const lerp  = (a,b,t) => a+(b-a)*t;

const canvas = $('c');
const renderer = new T.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.NeutralToneMapping;
renderer.toneMappingExposure = 0.98;
renderer.shadowMap.enabled = Q.schatten;

const scene  = new T.Scene();
const camera = new T.PerspectiveCamera(72, 16/9, 0.1, 900);

/* Der Dunst hat genau die Farbe des Horizonts. Dadurch löst sich die
   Wiese am Rand auf, statt an einer Kante aufzuhören. */
const HORIZONT = new T.Color(0x9dc6e8);
scene.fog = new T.FogExp2(HORIZONT.getHex(), 0.0112);

/* ======================= 2  Der Himmel ======================= */
/* Zu satt, zu gleichmäßig, ohne Sonne. Ein Himmel, den niemand
   fotografiert hat. Die harte Stufe im Verlauf ist Absicht — sie sieht
   aus wie ein Druckfehler, und genau das ist das Unbehagen. */
const himmelMat = new T.ShaderMaterial({
  side: T.BackSide, depthWrite: false, fog: false,
  uniforms: {
    uOben:  { value: new T.Color(0x1e5fd6) },
    uMitte: { value: new T.Color(0x4f8ee4) },
    uUnten: { value: new T.Color(0xa9d2ef) },
    uZeit:  { value: 0 },
  },
  vertexShader: `
    varying vec3 vP;
    void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    precision highp float;
    uniform vec3 uOben, uMitte, uUnten;
    uniform float uZeit;
    varying vec3 vP;
    void main(){
      float h = clamp(normalize(vP).y, -1.0, 1.0);
      float t = clamp(h*1.35 + 0.06, 0.0, 1.0);
      vec3 c = t < 0.42 ? mix(uUnten, uMitte, t/0.42)
                        : mix(uMitte, uOben, (t-0.42)/0.58);
      /* Stufen wie bei einem zu stark gespeicherten Bild */
      /* Feine Stufen: es soll billig aussehen, nicht kaputt. */
      c = floor(c * 46.0 + 0.5) / 46.0;
      gl_FragColor = vec4(c, 1.0);
      #include <colorspace_fragment>
    }`,
});
const himmel = new T.Mesh(new T.SphereGeometry(600, 24, 16), himmelMat);
himmel.frustumCulled = false;
scene.add(himmel);

/* ======================= 3  Die Wiese ======================= */
/* Eine Höhenfunktion, kein Gelände. Aus ihr kommen die Eckpunkte des
   Netzes und der Boden unter den Füßen — es gibt keine zweite Wahrheit
   darüber, wo die Wiese liegt. */
function mische(i, j){
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function welle(x, z){
  const i = Math.floor(x), j = Math.floor(z);
  const fx = x - i, fz = z - j;
  const sx = fx*fx*(3-2*fx), sz = fz*fz*(3-2*fz);
  const a = mische(i, j),   b = mische(i+1, j);
  const c = mische(i, j+1), d = mische(i+1, j+1);
  return lerp(lerp(a,b,sx), lerp(c,d,sx), sz);
}
function hoeheBei(x, z){
  return 6.4*welle(x/108, z/108)
       + 2.4*welle(x/43 + 31.7, z/43 - 12.3)
       + 0.78*welle(x/16.5 - 7.1, z/16.5 + 4.9)
       + 0.20*welle(x/6.2 + 55.3, z/6.2 + 18.1)
       - 4.8;
}
function normaleBei(x, z, out){
  const d = 0.9;
  const hx = hoeheBei(x+d,z) - hoeheBei(x-d,z);
  const hz = hoeheBei(x,z+d) - hoeheBei(x,z-d);
  return out.set(-hx, 2*d, -hz).normalize();
}

/* ---------- Grasnarbe: kurz gemäht, fleckig, nahtlos ---------- */
function grasTextur(px){
  const c = document.createElement('canvas'); c.width = c.height = px;
  const g = c.getContext('2d');
  g.fillStyle = '#4c8a2c'; g.fillRect(0,0,px,px);
  /* Große Flecken zuerst, damit die Halme darüber liegen. Alles wird an
     den Rändern doppelt gezeichnet — sonst hat die Kachel eine Naht. */
  const wickel = (fn) => {
    for(const dx of [0, px, -px]) for(const dz of [0, px, -px]){
      g.save(); g.translate(dx, dz); fn(); g.restore();
    }
  };
  const flecken = [];
  for(let i=0;i<70;i++)
    flecken.push([Math.random()*px, Math.random()*px, px*(0.04+Math.random()*0.13),
                  Math.random()<0.5 ? 'rgba(112,150,58,0.32)' : 'rgba(56,96,30,0.30)']);
  wickel(() => {
    for(const [x,y,r,f] of flecken){
      const gr = g.createRadialGradient(x,y,0,x,y,r);
      gr.addColorStop(0,f); gr.addColorStop(1,'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x,y,r,0,7); g.fill();
    }
  });
  /* Halme: kurze Striche, leicht gedreht, in fünf Grüntönen */
  const toene = ['#6fa83c','#5b9331','#437d24','#83b94e','#38691c','#96c45f'];
  const halme = [];
  const n = Math.round(px*px/26);
  for(let i=0;i<n;i++){
    const x = Math.random()*px, y = Math.random()*px;
    const w = 0.9 + Math.random()*0.7;
    const l = 3 + Math.random()*5;
    const a = (Math.random()-0.5)*1.5 + (Math.random()<0.5 ? 0 : Math.PI);
    halme.push([x,y,w,l,a, toene[(Math.random()*toene.length)|0]]);
  }
  wickel(() => {
    g.lineCap = 'round';
    for(const [x,y,w,l,a,t] of halme){
      g.strokeStyle = t; g.lineWidth = w;
      g.beginPath(); g.moveTo(x,y);
      g.lineTo(x + Math.cos(a)*l, y + Math.sin(a)*l);
      g.stroke();
    }
  });
  /* Etwas Trockenes dazwischen, sonst wirkt es wie Kunstrasen */
  wickel(() => {
    g.globalAlpha = 0.5;
    for(let i=0;i<Math.round(n*0.035);i++){
      const x = Math.random()*px, y = Math.random()*px, a = Math.random()*6.3;
      g.strokeStyle = Math.random()<0.5 ? '#8d9c4a' : '#a5a85c';
      g.lineWidth = 1; g.beginPath(); g.moveTo(x,y);
      g.lineTo(x+Math.cos(a)*4, y+Math.sin(a)*4); g.stroke();
    }
    g.globalAlpha = 1;
  });
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}
const grasTex = grasTextur(1024);
grasTex.repeat.set(1,1);

/* ---------- Das Netz, das dem Spieler folgt ---------- */
/* Ein einziges Feld, das mitwandert und bei jedem Schritt über ein
   Raster neu ausgerichtet wird. Weil die Höhe aus einer Funktion kommt,
   fällt der Sprung nicht auf: die Ecken landen wieder auf derselben
   Wiese, nur ein Stück weiter. */
const WEITE = Q.weite, NETZ = Q.netz, RASTER = WEITE / NETZ;
const bodenGeo = new T.PlaneGeometry(WEITE, WEITE, NETZ, NETZ);
bodenGeo.rotateX(-Math.PI/2);
const bodenMat = new T.MeshStandardMaterial({ map: grasTex, roughness: 0.94, metalness: 0.0 });
/* Große, langsame Farbschwankung über die Fläche — ohne sie sieht man
   die Kachel schon aus zehn Metern. */
bodenMat.onBeforeCompile = sh => {
  sh.vertexShader = 'varying vec3 vWiese;\n' + sh.vertexShader.replace(
    '#include <begin_vertex>',
    '#include <begin_vertex>\n vWiese = (modelMatrix * vec4(transformed,1.0)).xyz;');
  sh.fragmentShader = 'varying vec3 vWiese;\n' + sh.fragmentShader.replace(
    '#include <color_fragment>',
    `#include <color_fragment>
     float f1 = sin(vWiese.x*0.031 + 1.7) * sin(vWiese.z*0.027 - 0.9);
     float f2 = sin(vWiese.x*0.0091 - 2.3) * sin(vWiese.z*0.0107 + 1.1);
     diffuseColor.rgb *= 1.0 + 0.20*f1 + 0.17*f2;
     diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.36,0.49,0.21), clamp(0.10 + 0.12*f2, 0.0, 0.3));`);
};
const boden = new T.Mesh(bodenGeo, bodenMat);
boden.frustumCulled = false;
boden.receiveShadow = Q.schatten;
scene.add(boden);

let bodenAnker = { x: 1e9, z: 1e9 };
function bodenSetzen(px, pz){
  const ax = Math.round(px/RASTER)*RASTER, az = Math.round(pz/RASTER)*RASTER;
  if(ax === bodenAnker.x && az === bodenAnker.z) return;
  bodenAnker = { x:ax, z:az };
  const p = bodenGeo.attributes.position;
  const uv = bodenGeo.attributes.uv;
  for(let i=0;i<p.count;i++){
    const wx = ax + p.getX(i), wz = az + p.getZ(i);
    p.setY(i, hoeheBei(wx, wz));
    /* Weltfeste Kachelung: sonst schwimmt die Textur beim Nachrücken. */
    uv.setXY(i, wx/3.0, wz/3.0);
  }
  p.needsUpdate = true; uv.needsUpdate = true;
  bodenGeo.computeVertexNormals();
  boden.position.set(ax, 0, az);
}

/* Hinter dem Netz eine große Scheibe in Horizontfarbe: damit endet die
   Welt nicht an einer Kante, sondern im Dunst. */
{
  const scheibe = new T.Mesh(new T.CircleGeometry(760, 40),
    new T.MeshBasicMaterial({ color: 0x74a04c, fog: true }));
  scheibe.rotation.x = -Math.PI/2;
  scheibe.position.y = -5.6;
  scheibe.frustumCulled = false;
  scene.add(scheibe);
  scheibe.renderOrder = -1;
  window.__scheibe = scheibe;
}

/* ======================= 4  Licht ======================= */
/* Ein Tag ohne Sonne. Das Licht kommt von überall, wirft kaum Schatten
   und lässt sich nicht orten — man weiß nie, wie spät es ist. */
scene.add(new T.HemisphereLight(0xdff0ff, 0x4c7a2c, 2.05));
scene.add(new T.AmbientLight(0xffffff, 0.18));
const streiflicht = new T.DirectionalLight(0xfff6e2, 0.55);
streiflicht.position.set(-60, 48, 30);
if(Q.schatten){
  streiflicht.castShadow = true;
  streiflicht.shadow.mapSize.set(1024,1024);
  streiflicht.shadow.camera.left = -30; streiflicht.shadow.camera.right = 30;
  streiflicht.shadow.camera.top = 30; streiflicht.shadow.camera.bottom = -30;
  streiflicht.shadow.camera.far = 160; streiflicht.shadow.bias = -0.0016;
}
scene.add(streiflicht); scene.add(streiflicht.target);

/* ======================= 5  Die Figur ======================= */
const AUGEN = 1.66, KOPF = 1.74;
const P = {
  x: 0, z: 0, y: 0, gier: 0, nick: -0.03,
  kraft: 1, schrittWeg: 0, bob: 0, tempo: 0,
  gelaufen: 0,
};
const TEMPO = { gehen: 2.55, rennen: 5.05 };

const IN = { mx:0, mz:0, dyaw:0, dpitch:0, run:false };
const KEY = {};

function spielerSchritt(dt){
  P.gier += IN.dyaw; IN.dyaw = 0;
  P.nick = clamp(P.nick + IN.dpitch, -1.25, 1.15); IN.dpitch = 0;

  let vor = -IN.mz, quer = IN.mx;
  if(KEY.KeyW || KEY.ArrowUp)    vor += 1;
  if(KEY.KeyS || KEY.ArrowDown)  vor -= 1;
  if(KEY.KeyD || KEY.ArrowRight) quer += 1;
  if(KEY.KeyA || KEY.ArrowLeft)  quer -= 1;
  const l = Math.hypot(vor, quer);
  if(l > 1){ vor /= l; quer /= l; }
  const gas = Math.min(1, l);

  const rennt = IN.run && P.kraft > 0.04 && gas > 0.1;
  P.kraft = clamp(P.kraft + (rennt ? -0.155 : 0.105)*dt, 0, 1);
  const tempo = rennt ? TEMPO.rennen : TEMPO.gehen;
  P.tempo = tempo * gas;

  const sin = Math.sin(P.gier), cos = Math.cos(P.gier);
  const dx = (-sin*vor + cos*quer) * tempo * dt;
  const dz = (-cos*vor - sin*quer) * tempo * dt;
  P.x += dx; P.z += dz;
  P.gelaufen += Math.hypot(dx, dz);
  P.y = hoeheBei(P.x, P.z);

  P.schrittWeg += gas * tempo * dt;
  const schrittLaenge = rennt ? 1.35 : 0.95;
  if(P.schrittWeg > schrittLaenge){ P.schrittWeg = 0; grasTon(rennt); }
  P.bob = P.bob*0.86 + gas*(rennt ? 0.055 : 0.032)*0.14;

  bodenSetzen(P.x, P.z);
  streiflicht.position.set(P.x - 60, 48, P.z + 30);
  streiflicht.target.position.set(P.x, 0, P.z);
  streiflicht.target.updateMatrixWorld();
  himmel.position.set(P.x, 0, P.z);
  if(window.__scheibe) window.__scheibe.position.set(P.x, -5.6 + hoeheBei(P.x,P.z)*0.0, P.z);

  /* Kamera in der Hand — dieselbe Unruhe wie in den anderen Bändern. */
  const t = ZEIT.t;
  const stark = 0.55 + gas * (rennt ? 1.9 : 1.0);
  const wGier = (Math.sin(t*1.31)*0.42 + Math.sin(t*0.57+1.7)*0.30 + Math.sin(t*2.63+0.4)*0.16)*0.0125*stark;
  const wNick = (Math.sin(t*1.07+2.1)*0.40 + Math.sin(t*2.21+0.9)*0.22 + Math.sin(t*0.43)*0.34)*0.0105*stark;
  const wRoll = (Math.sin(t*0.83+1.2)*0.55 + Math.sin(t*1.77+2.6)*0.25)*0.016*stark;
  const stoss = Math.sin(P.schrittWeg*6.4)*0.013*gas*(rennt?1.8:1);
  camera.position.set(
    P.x + Math.sin(t*0.61)*0.012*stark,
    P.y + AUGEN + Math.sin(t*7.4)*P.bob + stoss + Math.sin(t*0.94+0.3)*0.014*stark,
    P.z + Math.sin(t*0.73+2.2)*0.012*stark);
  camera.rotation.set(P.nick + wNick, P.gier + wGier, wRoll, 'YXZ');
}

/* ======================= 6  Sie ======================= */
/* Steht still, solange man hinsieht. Sieht man weg, kommt sie — nicht
   schleichend, sondern zügig. Das Ansehen ist deshalb die einzige
   Bremse, die es gibt, und es kostet Band. */
const SIE = {
  gruppe: null, mixer: null, klipp: null,
  x: 0, z: 0, y: 0, gier: 0,
  hoehe: 12.0, abstand: 999, gesehen: false, gesehenT: 0,
  rufT: 8, ruftJetzt: 0, geladen: false,
};
const _ndc = new T.Vector3();

new GLTFLoader().load('./modelle/sirene.glb', gltf => {
  const g = gltf.scene;
  const box = new T.Box3().setFromObject(g);
  const gr = new T.Vector3(); box.getSize(gr);
  const skal = SIE.hoehe / Math.max(gr.y, 0.001);
  g.scale.setScalar(skal);
  /* Nach dem Skalieren die Füße auf null legen. */
  const box2 = new T.Box3().setFromObject(g);
  g.position.y -= box2.min.y;
  g.traverse(o => {
    if(o.isMesh){
      o.castShadow = Q.schatten;
      o.frustumCulled = false;
      if(o.material){
        o.material.roughness = 0.85;
        o.material.metalness = 0.0;
      }
    }
  });
  const halter = new T.Group();
  halter.add(g);
  scene.add(halter);
  SIE.gruppe = halter;
  if(gltf.animations && gltf.animations.length){
    SIE.mixer = new T.AnimationMixer(g);
    SIE.klipp = SIE.mixer.clipAction(gltf.animations[0]);
    SIE.klipp.play();
  }
  SIE.geladen = true;
  ladeStand = 1;
}, e => {
  if(e.total) ladeStand = Math.min(0.95, e.loaded / e.total);
}, () => { SIE.geladen = true; ladeStand = 1; });

/* Sichtprüfung: im Bild, nicht zu weit, und kein Hügel dazwischen. */
function siehtSie(){
  if(!SIE.gruppe) return false;
  const kopf = SIE.y + SIE.hoehe*0.72;
  _ndc.set(SIE.x, kopf, SIE.z).project(camera);
  if(_ndc.z > 1 || Math.abs(_ndc.x) > 0.92 || Math.abs(_ndc.y) > 0.95) return false;
  if(SIE.abstand > 170) return false;
  if(STAND.stoerung > 0.995) return false;         // im Rauschen sieht man nichts
  /* Kuppen verdecken: die Sichtlinie gegen die Höhenfunktion prüfen. */
  const ax = camera.position.x, ay = camera.position.y, az = camera.position.z;
  const n = Math.min(48, Math.max(8, Math.round(SIE.abstand/3)));
  for(let i=1;i<n;i++){
    const t = i/n;
    const x = lerp(ax, SIE.x, t), z = lerp(az, SIE.z, t);
    const y = lerp(ay, kopf, t);
    if(hoeheBei(x,z) > y + 0.25) return false;
  }
  return true;
}

function sieSetzen(abstand){
  const w = Math.random()*Math.PI*2;
  SIE.x = P.x + Math.sin(w)*abstand;
  SIE.z = P.z + Math.cos(w)*abstand;
  SIE.y = hoeheBei(SIE.x, SIE.z);
}

function sieSchritt(dt){
  if(!SIE.gruppe) return;
  SIE.abstand = Math.hypot(SIE.x - P.x, SIE.z - P.z);
  const gesehen = siehtSie();
  SIE.gesehen = gesehen;

  if(gesehen){
    SIE.gesehenT += dt;
    /* Der Rundfunk stört das Band, und zwar heftiger, je näher sie steht. */
    const nah = clamp(1 - SIE.abstand/120, 0, 1);
    STAND.stoerung = clamp(STAND.stoerung + GR.stoer*(0.35 + nah*1.3)*dt, 0, 1);
    if(SIE.klipp) SIE.klipp.paused = true;
  } else {
    SIE.gesehenT = 0;
    STAND.stoerung = clamp(STAND.stoerung - 0.11*dt, 0, 1);
    if(SIE.klipp) SIE.klipp.paused = false;
    /* Gehen. Auf sehr kurze Entfernung wird sie schneller — das ist der
       Moment, in dem Wegsehen teuer wird. */
    const eile = GR.tempo * (SIE.abstand < 25 ? 1.25 : 1);
    const dx = P.x - SIE.x, dz = P.z - SIE.z, dl = Math.hypot(dx,dz) || 1;
    SIE.x += dx/dl * eile * dt;
    SIE.z += dz/dl * eile * dt;
    SIE.gier = Math.atan2(dx, dz);
    /* Zu weit weg wird langweilig: dann steht sie beim nächsten Wegsehen
       wieder am Rand des Dunstes. */
    if(SIE.abstand > 200) sieSetzen(120);
  }
  SIE.y = hoeheBei(SIE.x, SIE.z);
  SIE.gruppe.position.set(SIE.x, SIE.y, SIE.z);
  SIE.gruppe.rotation.y = SIE.gier;
  if(SIE.mixer) SIE.mixer.update(gesehen ? 0 : dt);

  /* Der Ruf. Man hört ihn, bevor man sie sieht. */
  SIE.rufT -= dt;
  if(SIE.rufT <= 0){
    SIE.rufT = GR.ruf * (0.7 + Math.random()*0.6);
    SIE.ruftJetzt = 3.5;
    rufTon(clamp(1 - SIE.abstand/180, 0.12, 1));
    peilAnzeigen();
  }
  if(SIE.ruftJetzt > 0) SIE.ruftJetzt -= dt;

  if(SIE.abstand < 3.4 && STAND.phase === 'spiel') erwischt();
}

/* ======================= 7  Ton ======================= */
const SND = { an:true, ctx:null };
function tonStart(){
  if(SND.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  const ac = new AC(); SND.ctx = ac;
  SND.master = ac.createGain(); SND.master.gain.value = SND.an ? 0.9 : 0;
  SND.master.connect(ac.destination);

  const len = ac.sampleRate * 2;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<len;i++) d[i] = Math.random()*2-1;
  SND.rausch = buf;

  /* Wind über offener Fläche: gefiltertes Rauschen mit langsamer Atmung */
  const w = ac.createBufferSource(); w.buffer = buf; w.loop = true;
  const wf = ac.createBiquadFilter(); wf.type='lowpass'; wf.frequency.value = 420; wf.Q.value = 0.5;
  SND.wind = ac.createGain(); SND.wind.gain.value = 0.055;
  w.connect(wf); wf.connect(SND.wind); SND.wind.connect(SND.master); w.start();
  const lfo = ac.createOscillator(); lfo.type='sine'; lfo.frequency.value = 0.09;
  const lg = ac.createGain(); lg.gain.value = 0.03;
  lfo.connect(lg); lg.connect(SND.wind.gain); lfo.start();

  /* Ihre Nähe: ein Brummen, das nichts erklärt */
  const n = ac.createOscillator(); n.type='sawtooth'; n.frequency.value = 28;
  const nf = ac.createBiquadFilter(); nf.type='lowpass'; nf.frequency.value = 110;
  SND.naehe = ac.createGain(); SND.naehe.gain.value = 0;
  n.connect(nf); nf.connect(SND.naehe); SND.naehe.connect(SND.master); n.start();

  /* Bandrauschen, wenn das Bild kippt */
  const r = ac.createBufferSource(); r.buffer = buf; r.loop = true;
  const rf = ac.createBiquadFilter(); rf.type='highpass'; rf.frequency.value = 1800;
  SND.stoer = ac.createGain(); SND.stoer.gain.value = 0;
  r.connect(rf); rf.connect(SND.stoer); SND.stoer.connect(SND.master); r.start();
}
function knall(dauer, cut, vol, typ){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  const s = ac.createBufferSource(); s.buffer = SND.rausch;
  s.playbackRate.value = 0.7 + Math.random()*0.6;
  const f = ac.createBiquadFilter(); f.type = typ || 'lowpass'; f.frequency.value = cut;
  const g = ac.createGain(); g.gain.value = vol;
  g.gain.setTargetAtTime(0.0001, ac.currentTime + dauer*0.25, dauer*0.35);
  s.connect(f); f.connect(g); g.connect(SND.master);
  s.start(); s.stop(ac.currentTime + dauer + 0.1);
}
const grasTon = rennt => knall(rennt ? 0.16 : 0.13, 2600 + Math.random()*1200,
                               rennt ? 0.14 : 0.09, 'bandpass');
/* Der Ruf: zwei Töne, die nicht zusammenpassen, mit einem langen Abfall. */
function rufTon(laut){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  const jetzt = ac.currentTime;
  for(const [f0, f1, ver] of [[420, 300, 0], [560, 395, 0.06]]){
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0*0.72, jetzt+ver);
    o.frequency.linearRampToValueAtTime(f0, jetzt+ver+0.9);
    o.frequency.setValueAtTime(f0, jetzt+ver+2.0);
    o.frequency.linearRampToValueAtTime(f1, jetzt+ver+3.4);
    const bp = ac.createBiquadFilter(); bp.type='bandpass';
    bp.frequency.value = 700; bp.Q.value = 2.2;
    const g = ac.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(0.10*laut, jetzt+ver, 0.5);
    g.gain.setTargetAtTime(0.0, jetzt+ver+2.4, 0.7);
    o.connect(bp); bp.connect(g); g.connect(SND.master);
    o.start(jetzt+ver); o.stop(jetzt+ver+4.4);
  }
  knall(1.4, 900, 0.05*laut, 'bandpass');
}
function schreckTon(){
  const ac = SND.ctx; if(!ac || !SND.an) return;
  knall(0.08, 9000, 0.55, 'highpass');
  knall(1.5, 1400, 0.42);
  const o = ac.createOscillator(); o.type='square';
  o.frequency.setValueAtTime(680, ac.currentTime);
  o.frequency.exponentialRampToValueAtTime(48, ac.currentTime+1.1);
  const g = ac.createGain(); g.gain.value = 0;
  g.gain.setTargetAtTime(0.34, ac.currentTime, 0.004);
  g.gain.setTargetAtTime(0, ac.currentTime+0.6, 0.3);
  o.connect(g); g.connect(SND.master); o.start(); o.stop(ac.currentTime+2.0);
}
function tonSchalten(an){
  SND.an = an;
  if(SND.ctx) SND.master.gain.setTargetAtTime(an ? 0.9 : 0, SND.ctx.currentTime, 0.05);
  $('bTon').textContent = 'TON: ' + (an ? 'AN' : 'AUS');
}

/* ======================= 8  Bildnachbearbeitung ======================= */
/* Dasselbe Band wie in Ebene 0 und 1: Linsenverzug, Kopfspur, Bandlauf,
   Blockversatz, Korn, Zeilen. Neu ist nur, was ihr Rundfunk anrichtet. */
const bildRT = new T.WebGLRenderTarget(16, 16, {
  minFilter:T.LinearFilter, magFilter:T.LinearFilter, type:T.HalfFloatType });
const postScene = new T.Scene();
const postCam = new T.OrthographicCamera(-1,1,1,-1,0,1);
const postMat = new T.ShaderMaterial({
  uniforms: {
    uBild:  { value: bildRT.texture },
    uZeit:  { value: 0 },
    uStoer: { value: 0 },
    uNah:   { value: 0 },
    uEnde:  { value: 0 },
    uVhs:   { value: 0.42 },
    uLens:  { value: 0.34 },
    uPixel: { value: new T.Vector2(1,1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy,0.0,1.0); }`,
  fragmentShader: `
    precision highp float;
    uniform sampler2D uBild;
    uniform float uZeit, uStoer, uNah, uEnde, uVhs, uLens;
    uniform vec2 uPixel;
    varying vec2 vUv;
    float lrm(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 hi(vec2 p){ return max(texture2D(uBild, clamp(p,0.002,0.998)).rgb - 0.80, 0.0); }
    vec3 bloom(vec2 p){
      vec2 r = vec2(0.008,0.011);
      vec3 s = hi(p+vec2(r.x,0.))+hi(p-vec2(r.x,0.))+hi(p+vec2(0.,r.y))+hi(p-vec2(0.,r.y))
            + hi(p+r*0.7)+hi(p-r*0.7)+hi(p+vec2(r.x,-r.y)*0.7)+hi(p+vec2(-r.x,r.y)*0.7);
      vec2 w = r*2.8;
      s += hi(p+vec2(w.x,0.))+hi(p-vec2(w.x,0.))+hi(p+vec2(0.,w.y))+hi(p-vec2(0.,w.y));
      return s/12.0;
    }
    void main(){
      float V = uVhs;
      float St = uStoer;
      vec2 uv = vUv;
      vec2 cc = uv - 0.5;
      uv = 0.5 + cc*(1.0 + uLens*dot(cc,cc))/(1.0 + uLens*0.22);
      uv.x += sin(uv.y*88.0 + uZeit*2.4)*0.0011*V*(1.0 + St*4.0);
      float bandPos = fract(uZeit*0.10);
      float band = smoothstep(0.045, 0.0, abs(uv.y-bandPos))*V;
      uv.x += band*(lrm(vec2(uv.y, floor(uZeit*30.0)))-0.5)*0.028*(0.3 + St*2.2);
      float row = floor(uv.y*48.0);
      float blk = step(0.992 - St*0.45, lrm(vec2(row, floor(uZeit*16.0))));
      uv.x += blk*(lrm(vec2(row,uZeit))-0.5)*0.22*St*(0.35 + V);
      uv = clamp(uv, 0.002, 0.998);
      float ca = (0.0010 + St*0.010 + band*0.002)*(0.4 + V*0.6);
      vec3 col;
      col.r = texture2D(uBild, uv + vec2(ca,0.0)).r;
      col.g = texture2D(uBild, uv).g;
      col.b = texture2D(uBild, uv - vec2(ca,0.0)).b;
      col += bloom(uv) * vec3(1.0,0.98,0.94);
      float lum = dot(col, vec3(0.299,0.587,0.114));
      col = mix(col, vec3(lum), 0.10*V + 0.35*St);
      col = toneMapping(col);
      col += 0.018*V;
      col *= 1.0 - 0.07*V*(0.5 - 0.5*sin(uv.y*uPixel.y*3.14159));
      col *= 1.0 - 0.018*V*lrm(vec2(floor(uv.y*uPixel.y), floor(uZeit*24.0)));
      float lf = clamp(dot(col, vec3(0.299,0.587,0.114)), 0.0, 1.0);
      float g1 = lrm(uv*uPixel + fract(uZeit)*91.7) - 0.5;
      float g2 = lrm(floor(uv*uPixel*0.30) + fract(uZeit*0.83)*57.3) - 0.5;
      col += (g1*0.020 + g2*0.014) * (0.55 + 0.45*(1.0-lf)) * (0.75 + 0.5*V + St*1.6);
      float vig = dot(vUv-0.5, vUv-0.5);
      col *= 1.0 - vig*(0.62 + 0.60*V + 0.9*uNah);
      /* Ihr Rundfunk frisst das Bild von den Rändern her auf */
      col = mix(col, vec3(lrm(uv*uPixel*0.7 + uZeit*57.3)), clamp(St*St*1.15, 0.0, 1.0));
      col *= 1.0 - uEnde;
      gl_FragColor = vec4(col, 1.0);
      #include <colorspace_fragment>
    }`,
});
postScene.add(new T.Mesh(new T.PlaneGeometry(2,2), postMat));

/* ======================= 9  Anzeige und Ablauf ======================= */
const ZEIT = { t: 0 };
const STAND = { phase:'menu', t:0, rest:BANDLAENGE, stoerung:0, blind:0, endT:0, tode:0 };
let ladeStand = 0;

const scTitle = $('scTitle'), scDiff = $('scDiff'), scBrief = $('scBrief'),
      scPause = $('scPause'), scEnd = $('scEnd');
const MENUES = [scTitle, scDiff, scBrief, scPause, scEnd];
function zeige(el){
  for(const m of MENUES) m.classList.add('hidden');
  if(el) el.classList.remove('hidden');
  $('hud').classList.toggle('an', !el);
  $('steuer').classList.toggle('an', !el && IS_TOUCH);
}
function zeitStr(sek){
  const m = Math.max(0, Math.floor(sek/60)), s = Math.max(0, Math.floor(sek)%60);
  return (m<10?'0':'')+m+':'+(s<10?'0':'')+s;
}
function bandStr(sek){
  const h=(sek/3600)|0, m=((sek/60)|0)%60, s=(sek|0)%60, z=n=>(n<10?'0':'')+n;
  return z(h)+':'+z(m)+':'+z(s);
}
let meldT = 0;
function melde(txt, sek){ const e=$('toast'); e.textContent=txt; e.classList.add('an'); meldT=sek||3; }
function peilAnzeigen(){
  const dx = SIE.x - P.x, dz = SIE.z - P.z;
  const w = (Math.atan2(dx, -dz) * 180/Math.PI + 360) % 360;
  const namen = ['NORD','NORDOST','OST','SÜDOST','SÜD','SÜDWEST','WEST','NORDWEST'];
  $('peilRichtung').textContent = namen[Math.round(w/45) % 8];
  $('peil').classList.add('an');
  setTimeout(() => $('peil').classList.remove('an'), 4200);
}
let hudAcc = 0;
function hudSchritt(dt){
  hudAcc += dt;
  if(hudAcc < 0.08) return;
  hudAcc = 0;
  $('tc').textContent = bandStr(STAND.t);
  $('restZeit').textContent = zeitStr(STAND.rest);
  $('band').classList.toggle('knapp', STAND.rest < 60);
  const st = $('stoer');
  st.classList.toggle('an', STAND.stoerung > 0.02);
  st.classList.toggle('voll', STAND.stoerung > 0.7);
  $('stoerFuell').style.width = (STAND.stoerung*100).toFixed(0) + '%';
  if(meldT > 0){ meldT -= dt; if(meldT <= 0) $('toast').classList.remove('an'); }
}

function neuStart(){
  P.x = 0; P.z = 0; P.y = hoeheBei(0,0); P.gier = Math.random()*Math.PI*2; P.nick = -0.03;
  P.kraft = 1; P.gelaufen = 0;
  STAND.t = 0; STAND.rest = BANDLAENGE; STAND.stoerung = 0; STAND.blind = 0; STAND.endT = 0;
  SIE.rufT = 7; SIE.gesehenT = 0;
  sieSetzen(105);
  bodenAnker = { x:1e9, z:1e9 };
  bodenSetzen(P.x, P.z);
  melde('SECHS MINUTEN. HIER IST NICHTS AUSSER IHR.', 5);
}
function spielStart(){
  tonStart();
  if(SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  neuStart();
  STAND.phase = 'spiel';
  zeige(null);
}
function pause(){
  if(STAND.phase !== 'spiel') return;
  STAND.phase = 'pause'; allesLos(); zeige(scPause);
  if(document.pointerLockElement) document.exitPointerLock();
}
function endBild(titel, text){
  $('endTitle').textContent = titel;
  $('endText').textContent = text;
  $('endStats').innerHTML =
    'DURCHGEHALTEN ' + zeitStr(BANDLAENGE - STAND.rest) + ' VON ' + zeitStr(BANDLAENGE) +
    '<br>GELAUFEN ' + Math.round(P.gelaufen) + ' m';
  zeige(scEnd);
  if(document.pointerLockElement) document.exitPointerLock();
}
function erwischt(){
  if(STAND.phase !== 'spiel') return;
  STAND.phase = 'tot'; STAND.endT = 0; STAND.tode++;
  P.gier = Math.atan2(SIE.x - P.x, SIE.z - P.z);
  P.nick = 0.42;                                   // der Blick geht hoch
  schreckTon();
  if(navigator.vibrate) navigator.vibrate([0,90,50,240]);
  allesLos();
  if(document.pointerLockElement) document.exitPointerLock();
}
function ueberstanden(){
  if(STAND.phase !== 'spiel') return;
  STAND.phase = 'fertig'; STAND.endT = 0;
  allesLos();
}

/* ======================= 10  Steuerung ======================= */
const elStick = $('stick'), elKnob = $('knob');
const zMove = $('zoneMove'), zLook = $('zoneLook');
const bRun = $('bRun'), bMenu = $('bMenu');
let moveId = null, moveOx = 0, moveOy = 0, lookId = null, lookLx = 0, lookLy = 0;
const STICK_R = 52;

zMove.addEventListener('pointerdown', e => {
  if(moveId !== null) return;
  moveId = e.pointerId; moveOx = e.clientX; moveOy = e.clientY;
  elStick.style.left = e.clientX+'px'; elStick.style.top = e.clientY+'px';
  elStick.classList.add('on');
  zMove.setPointerCapture(e.pointerId);
  e.preventDefault();
});
zMove.addEventListener('pointermove', e => {
  if(e.pointerId !== moveId) return;
  let dx = e.clientX-moveOx, dy = e.clientY-moveOy;
  const l = Math.hypot(dx,dy);
  if(l > STICK_R){ dx = dx/l*STICK_R; dy = dy/l*STICK_R; }
  elKnob.style.transform = 'translate('+dx+'px,'+dy+'px)';
  IN.mx = dx/STICK_R; IN.mz = dy/STICK_R;
  /* Der Knüppel bewegt nur. Rennen sagt man mit dem Knopf. */
  IN.run = bRun.classList.contains('held');
  e.preventDefault();
});
function endMove(e){
  if(e.pointerId !== moveId) return;
  moveId = null; IN.mx = IN.mz = 0;
  IN.run = bRun.classList.contains('held');
  elKnob.style.transform = 'translate(0,0)';
  elStick.classList.remove('on');
}
zMove.addEventListener('pointerup', endMove);
zMove.addEventListener('pointercancel', endMove);

zLook.addEventListener('pointerdown', e => {
  if(lookId !== null) return;
  lookId = e.pointerId; lookLx = e.clientX; lookLy = e.clientY;
  zLook.setPointerCapture(e.pointerId); e.preventDefault();
});
zLook.addEventListener('pointermove', e => {
  if(e.pointerId !== lookId) return;
  IN.dyaw   -= (e.clientX-lookLx)*0.0042;
  IN.dpitch -= (e.clientY-lookLy)*0.0034;
  lookLx = e.clientX; lookLy = e.clientY; e.preventDefault();
});
function endLook(e){ if(e.pointerId === lookId) lookId = null; }
zLook.addEventListener('pointerup', endLook);
zLook.addEventListener('pointercancel', endLook);

function haltKnopf(el, an, aus){
  el.addEventListener('pointerdown', e => { el.classList.add('held'); an(); e.preventDefault(); });
  ['pointerup','pointercancel','pointerleave'].forEach(t =>
    el.addEventListener(t, () => { if(el.classList.contains('held')){ el.classList.remove('held'); aus(); } }));
}
haltKnopf(bRun, () => IN.run = true, () => IN.run = false);
bMenu.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); pause(); });

function allesLos(){
  for(const k in KEY) KEY[k] = false;
  IN.run = false; IN.mx = IN.mz = 0; IN.dyaw = IN.dpitch = 0;
  bRun.classList.remove('held');
  moveId = lookId = null;
  elKnob.style.transform = 'translate(0,0)'; elStick.classList.remove('on');
}
addEventListener('blur', allesLos);
addEventListener('keydown', e => {
  KEY[e.code] = true;
  if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') IN.run = true;
  if(e.key.toLowerCase() === 'm') tonSchalten(!SND.an);
  if(e.code === 'Escape' && STAND.phase === 'spiel') pause();
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => {
  KEY[e.code] = false;
  if(e.code === 'ShiftLeft' || e.code === 'ShiftRight') IN.run = false;
});
canvas.addEventListener('click', () => {
  if(STAND.phase === 'spiel' && !IS_TOUCH && document.pointerLockElement !== canvas)
    canvas.requestPointerLock && canvas.requestPointerLock();
});
addEventListener('mousemove', e => {
  if(document.pointerLockElement !== canvas) return;
  IN.dyaw   -= e.movementX*0.0022;
  IN.dpitch -= e.movementY*0.0020;
});

/* ======================= 11  Bild und Schleife ======================= */
function zeichnen(){
  himmelMat.uniforms.uZeit.value = ZEIT.t;
  postMat.uniforms.uZeit.value = ZEIT.t;
  postMat.uniforms.uStoer.value = Math.max(STAND.stoerung, STAND.blind > 0 ? 1 : 0);
  postMat.uniforms.uNah.value = lerp(postMat.uniforms.uNah.value,
    clamp(1 - SIE.abstand/45, 0, 1), 0.12);
  postMat.uniforms.uEnde.value =
    STAND.phase === 'tot'    ? clamp(STAND.endT*0.7, 0, 1) :
    STAND.phase === 'fertig' ? clamp((STAND.endT-1.2)*0.8, 0, 1) : 0;
  renderer.setRenderTarget(bildRT);
  renderer.clear();
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}
function groesse(){
  const w = Math.max(320, innerWidth), h = Math.max(240, innerHeight);
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
  const rw = Math.max(320, Math.round(w*Q.sicht)), rh = Math.max(200, Math.round(h*Q.sicht));
  bildRT.setSize(rw, rh);
  postMat.uniforms.uPixel.value.set(rw, rh);
}
addEventListener('resize', groesse);
groesse();

const uhr = new T.Clock();
function schritt(dt){
  ZEIT.t += dt;
  if(STAND.phase === 'spiel'){
    STAND.t += dt;
    STAND.rest -= dt;
    spielerSchritt(dt);
    sieSchritt(dt);
    /* Bei voller Störung sieht man ein paar Sekunden gar nichts — und sie
       läuft weiter. Das ist der Preis fürs Hinsehen. */
    if(STAND.blind > 0){
      STAND.blind -= dt;
      if(STAND.blind <= 0) STAND.stoerung = 0.34;
    } else if(STAND.stoerung >= 1){
      STAND.blind = 2.6;
      melde('DAS BAND KIPPT. NICHT STEHEN BLEIBEN.', 3);
      knall(1.2, 6000, 0.3, 'highpass');
    }
    if(SND.ctx && SND.an){
      const nah = clamp(1 - SIE.abstand/70, 0, 1);
      SND.naehe.gain.setTargetAtTime(nah*nah*0.30, SND.ctx.currentTime, 0.3);
      SND.stoer.gain.setTargetAtTime(STAND.stoerung*0.13, SND.ctx.currentTime, 0.2);
      SND.wind.gain.setTargetAtTime(0.05 + P.tempo*0.012, SND.ctx.currentTime, 0.4);
    }
    hudSchritt(dt);
    if(STAND.rest <= 0){ STAND.rest = 0; ueberstanden(); }
  } else if(STAND.phase === 'tot'){
    STAND.endT += dt;
    /* Sie füllt das Bild. Kein Schnitt, kein Umschauen. */
    const dx = SIE.x - P.x, dz = SIE.z - P.z, dl = Math.hypot(dx,dz) || 1;
    SIE.x = P.x + dx/dl*Math.max(1.6, dl - dt*5);
    SIE.z = P.z + dz/dl*Math.max(1.6, dl - dt*5);
    SIE.y = hoeheBei(SIE.x, SIE.z);
    if(SIE.gruppe) SIE.gruppe.position.set(SIE.x, SIE.y, SIE.z);
    if(SIE.mixer) SIE.mixer.update(dt);
    camera.rotation.set(P.nick, P.gier, Math.sin(ZEIT.t*9)*0.03, 'YXZ');
    if(STAND.endT > 2.4 && scEnd.classList.contains('hidden'))
      endBild('BAND REISST', 'Der Rest des Bandes ist Rauschen. Wer die Kamera ' +
        'gefunden hat, hat sie im Gras gefunden, mitten auf einer Wiese, auf der ' +
        'sonst nichts war.');
  } else if(STAND.phase === 'fertig'){
    STAND.endT += dt;
    if(STAND.endT > 2.6 && scEnd.classList.contains('hidden'))
      endBild('BAND ENDE', 'Sechs Minuten, kein Schnitt. Das Bild wird schwarz, ' +
        'während sie noch dasteht. Sie ist nicht nähergekommen — man hat ja ' +
        'hingesehen.');
  }
}
function bild(){
  requestAnimationFrame(bild);
  const dt = Math.min(0.05, uhr.getDelta());
  schritt(dt);
  zeichnen();
}

/* ======================= 12  Menü ======================= */
zeige(scTitle);
P.y = hoeheBei(0,0);
bodenSetzen(0,0);
camera.position.set(0, P.y + AUGEN, 0);
camera.rotation.set(-0.02, 0.6, 0, 'YXZ');
himmel.position.set(0,0,0);

const DIFFTEXT = {
  fern:   'Fern — sie geht gemächlich, wenn du wegsiehst, und ihr Rundfunk stört das Band nur langsam.',
  normal: 'Normal — sie geht zügig, wenn du wegsiehst, und der Blick auf sie stört das Band in mittlerem Tempo.',
  nah:    'Nah — sie ist schnell, ruft öfter, und Hinsehen frisst das Band in wenigen Sekunden.',
};
document.querySelectorAll('.chip[data-diff]').forEach(el => {
  el.classList.toggle('sel', el.dataset.diff === gKey);
  el.addEventListener('click', () => {
    document.querySelectorAll('.chip[data-diff]').forEach(o => o.classList.remove('sel'));
    el.classList.add('sel');
    gKey = el.dataset.diff; GR = GRADE[gKey];
    localStorage.setItem('wi_diff', gKey);
    $('diffText').textContent = DIFFTEXT[gKey];
  });
});
document.querySelectorAll('.chip[data-q]').forEach(el => {
  el.classList.toggle('sel', el.dataset.q === qKey);
  el.addEventListener('click', () => { localStorage.setItem('wi_q', el.dataset.q); location.reload(); });
});
$('bStart').addEventListener('click', () => { tonStart(); zeige(scDiff); });
$('bZurueck').addEventListener('click', () => zeige(scTitle));
$('bPlay').addEventListener('click', () => zeige(scBrief));
scBrief.addEventListener('click', spielStart);
$('bWeiter').addEventListener('click', () => { if(STAND.phase==='pause'){ STAND.phase='spiel'; zeige(null); } });
$('bTon').addEventListener('click', () => tonSchalten(!SND.an));
$('bNeu').addEventListener('click', () => { neuStart(); STAND.phase='spiel'; zeige(null); });
$('bNochmal').addEventListener('click', () => { neuStart(); STAND.phase='spiel'; zeige(null); });
for(const id of ['bRaus','bRaus2'])
  $(id).addEventListener('click', () => location.href = '../foundtape.html');

/* Ladeanzeige: das Modell wiegt drei Megabyte, das darf man sehen. */
{
  const f = $('ladefuell'), b = $('bStart');
  const tick = setInterval(() => {
    f.style.width = Math.round(clamp(ladeStand,0,1)*100) + '%';
    if(ladeStand >= 1){
      clearInterval(tick);
      b.disabled = false;
      b.textContent = '▶ BAND ABSPIELEN';
    }
  }, 120);
  if(IS_TOUCH) $('titelHint').textContent = 'LINKS LAUFEN · RECHTS UMSEHEN · KNOPF RENNEN';
}

/* Prüfhaken für die Messung von außen. */
window.WI = {
  stand(){ return { x:+P.x.toFixed(2), z:+P.z.toFixed(2), y:+P.y.toFixed(2),
    phase:STAND.phase, rest:+STAND.rest.toFixed(1), stoer:+STAND.stoerung.toFixed(3),
    sie:{ x:+SIE.x.toFixed(2), z:+SIE.z.toFixed(2), abstand:+SIE.abstand.toFixed(1),
          gesehen:SIE.gesehen, geladen:SIE.geladen, hoehe:SIE.hoehe } }; },
  hoehe:(x,z)=>hoeheBei(x,z),
  setzSie(x,z){ SIE.x=x; SIE.z=z; SIE.y=hoeheBei(x,z); },
  blick(g,n){ P.gier=g; if(n!==undefined) P.nick=n; },
  setz(x,z){ P.x=x; P.z=z; P.y=hoeheBei(x,z); },
  P, SIE, STAND, IN, GR,
};

bild();
