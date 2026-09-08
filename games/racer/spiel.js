/* ═══════════════════════════════════════════════════════════════════════
   NACHTSCHICHT — Sim-Cade auf einem echten Rundkurs
   Fahrmodell: Einspurmodell mit Schräglaufwinkeln und sättigenden
   Reifenkräften. Kein starrer Körper, keine Physik-Bibliothek — der Wagen
   liegt per Strahl auf der Fahrbahn und wird über die Mittellinie
   eingegrenzt. Das ist genau, schnell und läuft auch auf dem Handy.
   ═══════════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from './lib/three-mesh-bvh.module.js';
import { STRECKE as S } from './strecke.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const $ = s => document.querySelector(s);
const klemm = (v,a,b) => v<a?a:v>b?b:v;
const mischen = (a,b,t) => a+(b-a)*t;

/* ── Fahrzeugdaten ─────────────────────────────────────────────────────
   Werte in SI: Masse kg, Kräfte als Beschleunigung m/s². Die Griffwerte
   sind bewusst über dem physikalisch Sauberen — Sim-Cade eben.         */
const AUTOS = {
  charger: {
    name:'Dodge Charger', typ:'Muscle · Heckantrieb', datei:'assets/charger.glb',
    skalierung:4.95, masse:1810, radstand:3.03, schwerpunkt:.54,
    antrieb:11.2, bremse:17.5, vmax:69,            // m/s ≈ 248 km/h
    luft:.00042, rollen:.34, lenkung:.62, lenkschwund:34,
    haftungV:10.6, haftungH:10.2, steifeV:9.2, steifeH:11.4,
    traegheit:2.35, hoehe:.16, radaufhaengung:0,
    balken:{Tempo:62,Grip:58,Antritt:74,Quer:88}
  },
  p1: {
    name:'McLaren P1', typ:'Hypercar · Mittelmotor', datei:'assets/p1.glb',
    skalierung:.821, masse:1450, radstand:2.67, schwerpunkt:.43,
    antrieb:15.4, bremse:22.5, vmax:92,            // m/s ≈ 331 km/h
    luft:.00030, rollen:.30, lenkung:.55, lenkschwund:46,
    haftungV:14.2, haftungH:13.6, steifeV:13.5, steifeH:15.5,
    traegheit:1.75, hoehe:.06, radaufhaengung:.205,
    balken:{Tempo:96,Grip:94,Antritt:97,Quer:52}
  }
};
let wahl = 'p1';

/* ── Bühne ─────────────────────────────────────────────────────────── */
const rnd = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
rnd.setPixelRatio(Math.min(devicePixelRatio, 1.6));
rnd.outputColorSpace = THREE.SRGBColorSpace;
rnd.toneMapping = THREE.ACESFilmicToneMapping;
rnd.toneMappingExposure = 1.45;
$('#stage').appendChild(rnd.domElement);

const szene = new THREE.Scene();
szene.background = new THREE.Color(0x121b30);
szene.fog = new THREE.Fog(0x121b30, 210, 820);

const kamera = new THREE.PerspectiveCamera(62, 1, .3, 2200);
function passeAn(){
  const w = innerWidth, h = innerHeight;
  rnd.setSize(w,h); kamera.aspect = w/h; kamera.updateProjectionMatrix();
}
addEventListener('resize', passeAn); passeAn();

szene.add(new THREE.HemisphereLight(0x6f8cc4, 0x2a3040, 2.0));
const mond = new THREE.DirectionalLight(0xbcd4ff, 1.55);
mond.position.set(-160, 220, 120); szene.add(mond);
const flut = new THREE.DirectionalLight(0xffd9a0, .85);   // warmes Flutlicht von den Masten
flut.position.set(180, 90, -140); szene.add(flut);
const gegen = new THREE.DirectionalLight(0x8fa8d8, .5);   // Aufheller von hinten
gegen.position.set(40, 60, 200); szene.add(gegen);

/* ── Laden ─────────────────────────────────────────────────────────── */
const lader = new GLTFLoader();
const holen = (pfad, aufFortschritt) => new Promise((ok, fehler) =>
  lader.load(pfad, ok, e => aufFortschritt && aufFortschritt(e), fehler));

let strasse  = [];     // Meshes mit road_mat — darauf klebt der Wagen
let gelaende = [];     // Gras und Sand — der Auslauf neben der Bahn
let boden    = [];     // beides zusammen, nur zum Aufbau der Strahlenbäume
let autoRoh = {};      // geladene Fahrzeugszenen

function fortschritt(p, text){
  $('#bar i').style.width = (p*100).toFixed(0)+'%';
  if(text) $('#bootmsg').textContent = text;
}

async function ladeAlles(){
  fortschritt(.02, 'Strecke wird geladen — das sind 25 MB, einen Moment …');
  const t = await holen('assets/track.glb', e => {
    if(e.lengthComputable) fortschritt(.02 + .58*(e.loaded/e.total), 'Strecke … ' + (e.loaded/1048576).toFixed(1) + ' MB');
  });
  const welt = t.scene; welt.updateMatrixWorld(true);

  const bodenMaterialien = new Set(['road_mat','grass1_mat','sand1_mat','sand2_mat']);
  welt.traverse(o => {
    if(!o.isMesh) return;
    o.frustumCulled = true;
    const mn = (o.material && o.material.name) || '';
    if(mn === 'road_mat'){ strasse.push(o); boden.push(o); }
    else if(bodenMaterialien.has(mn)){ gelaende.push(o); boden.push(o); }
    // Flutlicht und Signale leuchten lassen, sonst wird die Nacht zu tot
    if(/light|lamp/i.test(mn) && o.material){
      o.material = o.material.clone();
      o.material.emissive = new THREE.Color(0xffdca8);
      o.material.emissiveIntensity = 1.5;
    }
  });
  szene.add(welt);

  fortschritt(.64, 'Fahrbahn wird für Strahlen aufbereitet …');
  await new Promise(r => setTimeout(r, 16));
  for(const m of boden) m.geometry.computeBoundsTree({maxLeafTris:12});

  let i = 0;
  for(const [id, cfg] of Object.entries(AUTOS)){
    fortschritt(.68 + .14*i, cfg.name + ' wird geladen …');
    const g = await holen(cfg.datei);
    const s = g.scene; s.scale.setScalar(cfg.skalierung); s.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(s);
    s.position.y = -b.min.y;                       // exakt auf die Räder stellen
    const huelle = new THREE.Group(); huelle.add(s);
    huelle.userData.laenge = b.max.z - b.min.z;
    // Räder für Lenkeinschlag und Drehung einsammeln (nur der P1 hat welche)
    huelle.userData.raeder = [];
    s.traverse(o => {
      const m = /^WHEEL_(LF|RF|LR|RR)$/i.exec(o.name);
      if(m) huelle.userData.raeder.push({knoten:o, vorne:/F$/i.test(m[1]), basis:o.rotation.clone()});
    });
    autoRoh[id] = huelle;
    i++;
  }
  fortschritt(1, 'Bereit.');
  await new Promise(r => setTimeout(r, 150));
}

/* ── Streckenhilfen ────────────────────────────────────────────────── */
const N = S.n;
function normale(i){ return [-S.tz[i], S.tx[i]]; }
/* Nächsten Stützpunkt suchen — ausgehend vom letzten, damit es billig bleibt */
function naechsterIndex(x, z, letzter){
  let best = letzter, bd = Infinity;
  for(let d = -14; d <= 24; d++){
    const i = (letzter + d + N*2) % N;
    const dx = x - S.x[i], dz = z - S.z[i];
    const q = dx*dx + dz*dz;
    if(q < bd){ bd = q; best = i; }
  }
  return best;
}
function vollSuche(x, z){
  let best = 0, bd = Infinity;
  for(let i = 0; i < N; i++){
    const dx = x - S.x[i], dz = z - S.z[i], q = dx*dx + dz*dz;
    if(q < bd){ bd = q; best = i; }
  }
  return best;
}
/* Startplatz: der Abschnitt mit der geringsten Richtungsänderung */
function startIndex(){
  let best = 0, bp = -Infinity;
  for(let i = 0; i < N; i++){
    let kurve = 0, schmal = Infinity;
    for(let k = 0; k < 26; k++){
      const a = (i+k)%N, b = (i+k+1)%N;
      let d = Math.atan2(S.tx[b],S.tz[b]) - Math.atan2(S.tx[a],S.tz[a]);
      while(d> Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
      kurve += Math.abs(d);
      schmal = Math.min(schmal, S.l[a] + S.r[a]);
    }
    // gerade UND breit — eine schmale Zufahrt taugt nicht als Start-Ziel
    const punkte = schmal - kurve * 9;
    if(punkte > bp){ bp = punkte; best = i; }
  }
  return best;
}
/* Bereinigte Halbbreiten. Die gemessenen Werte haben Ausreißer bis 26 —
   dort ist die seitliche Abtastung in einen benachbarten Streckenteil
   gelaufen. Deckeln und glätten macht daraus brauchbare Streckengrenzen. */
const HW_P = new Float32Array(N), HW_M = new Float32Array(N);  // + / - entlang der Normalen (+ = rechts)
(() => {
  const cl = i => klemm(S.l[i], 3.2, 9.5), cr = i => klemm(S.r[i], 3.2, 9.5);
  for(let i=0;i<N;i++){
    let a=0,b=0;
    for(let j=-4;j<=4;j++){ a += cl((i+j+N)%N); b += cr((i+j+N)%N); }
    HW_P[i] = a/9; HW_M[i] = b/9;
  }
})();

const START = startIndex();

/* Krümmung je Stützpunkt (1/Radius): daraus ergibt sich das Kurventempo */
const KRUEMMUNG = (() => {
  const k = new Float32Array(N);
  for(let i=0;i<N;i++){
    const a=(i-2+N)%N, b=(i+2)%N;
    let d = Math.atan2(S.tx[b],S.tz[b]) - Math.atan2(S.tx[a],S.tz[a]);
    while(d> Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
    const bogen = 4 * (S.laenge / N);
    k[i] = Math.abs(d)/bogen;
  }
  // etwas verschmieren, sonst zappelt das Wunschtempo
  const g = new Float32Array(N);
  for(let i=0;i<N;i++){ let sum=0; for(let j=-3;j<=3;j++) sum+=k[(i+j+N)%N]; g[i]=sum/7; }
  return g;
})();

/* ── Zustand ───────────────────────────────────────────────────────── */
const strahl = new THREE.Raycaster();
strahl.firstHitOnly = true;
const RUNTER = new THREE.Vector3(0,-1,0);
const hilf = new THREE.Vector3();

const auto = {
  pos: new THREE.Vector3(), gier: 0,
  vx: 0, vy: 0, gierRate: 0,            // längs / quer / Drehrate
  lenk: 0, gas: 0, brems: 0,
  aufBahn: true, bodenY: 0, normalV: new THREE.Vector3(0,1,0),
  idx: 0, quer: 0, fortschritt: 0, runde: 0, letzterIdx: 0,
  puls: 0, pulsAn: false, luft: 0, radWinkel: 0
};
let profil = AUTOS[wahl], modell = null;

const zeit = { start: 0, aktuell: 0, letzte: 0, beste: 0, runden: 0, laeuft: false };
let geister = { beste: null, aufnahme: [], zeiger: 0 };
let geistObj = null;

const spulPuffer = [];        // Schnappschüsse fürs Zurückspulen
const SPUL_HZ = 20, SPUL_SEK = 8;

let modus = 'menu';           // menu | fahren | spulen
let kameraArt = 0;            // 0 verfolgen, 1 Stoßstange
const kamPos = new THREE.Vector3(), kamZiel = new THREE.Vector3();

/* ── Eingabe ───────────────────────────────────────────────────────── */
const taste = {};
const tasten = {ArrowUp:'gas',KeyW:'gas',ArrowDown:'brems',KeyS:'brems',
                ArrowLeft:'links',KeyA:'links',ArrowRight:'rechts',KeyD:'rechts',
                Space:'hand',ShiftLeft:'puls',ShiftRight:'puls',KeyR:'spulen'};
addEventListener('keydown', e => {
  if(tasten[e.code]){ taste[tasten[e.code]] = true; e.preventDefault(); }
  if(e.code === 'KeyC') kameraWechsel();
  if(e.code === 'Escape') zumMenue();
});
addEventListener('keyup', e => { if(tasten[e.code]){ taste[tasten[e.code]] = false; e.preventDefault(); } });

function knopf(id, feld){
  const el = $(id);
  const an = e => { e.preventDefault(); taste[feld] = true; el.classList.add('gedrueckt'); };
  const aus = e => { e.preventDefault(); taste[feld] = false; el.classList.remove('gedrueckt'); };
  el.addEventListener('pointerdown', an); el.addEventListener('pointerup', aus);
  el.addEventListener('pointercancel', aus); el.addEventListener('pointerleave', aus);
}
knopf('#tLinks','links'); knopf('#tRechts','rechts'); knopf('#tGas','gas');
knopf('#tBrems','brems'); knopf('#tPuls','puls'); knopf('#tHand','hand');
if(matchMedia('(pointer:coarse)').matches) $('#touch').classList.add('an');

function kameraWechsel(){
  kameraArt = (kameraArt+1) % 2;
  $('#btnKamera').textContent = 'KAMERA: ' + (kameraArt ? 'STOSSSTANGE' : 'VERFOLGEN');
}
$('#btnKamera').addEventListener('click', kameraWechsel);

/* ── Wagen setzen ──────────────────────────────────────────────────── */
function setzeAuf(i, seitlich = 0){
  auto.pos.set(S.x[i] + normale(i)[0]*seitlich, S.y[i], S.z[i] + normale(i)[1]*seitlich);
  auto.gier = Math.atan2(S.tx[i], S.tz[i]);
  auto.vx = auto.vy = auto.gierRate = auto.lenk = 0;
  auto.idx = auto.letzterIdx = i; auto.puls = 0; auto.luft = 0;
  spulPuffer.length = 0;
  kameraSetzen();
}
/* Nach dem Setzen darf die Kamera nicht erst heranziehen — sonst steht der
   Wagen sekundenlang außerhalb des Bildes. Gilt auch fürs Zurücksetzen. */
function kameraSetzen(){
  const s = Math.sin(auto.gier), c = Math.cos(auto.gier);
  kamPos.set(auto.pos.x - s*8.4, auto.pos.y + 3.1, auto.pos.z - c*8.4);
  kamZiel.set(auto.pos.x + s*7, auto.pos.y + 1.5, auto.pos.z + c*7);
}
function baueAuto(){
  if(modell) szene.remove(modell);
  profil = AUTOS[wahl];
  modell = autoRoh[wahl];
  szene.add(modell);
  // Scheinwerfer
  if(!modell.userData.licht){
    const machLicht = seite => {
      const sp = new THREE.SpotLight(0xfff2d8, 620, 210, .52, .38, 1.2);
      sp.position.set(seite*.7, .65, 1.9);
      sp.target.position.set(seite*.9, -.2, 34);
      modell.add(sp); modell.add(sp.target); return sp;
    };
    modell.userData.licht = [machLicht(-1), machLicht(1)];
    const rueck = new THREE.PointLight(0xff2a1a, 6, 12); rueck.position.set(0,.6,-2.3);
    modell.add(rueck); modell.userData.rueck = rueck;
  }
}

/* ── Fahrphysik ────────────────────────────────────────────────────── */
const vorgabe = {lenk:null, gas:null, brems:null};   // analoger Kanal (Autopilot, Touch)
function fahre(dt){
  const p = profil;
  const lenkZiel = vorgabe.lenk !== null ? vorgabe.lenk
                 : (taste.links?1:0) - (taste.rechts?1:0);   // + = links
  const tempo = Math.abs(auto.vx);
  const maxLenk = p.lenkung * (1 - .60*klemm(tempo/p.lenkschwund, 0, 1));
  auto.lenk = mischen(auto.lenk, lenkZiel*maxLenk, klemm(dt*11, 0, 1));

  const handbremse = !!taste.hand;
  const pulsAn = taste.puls && auto.puls > .02;
  auto.pulsAn = pulsAn;

  const a = p.radstand * p.schwerpunkt, b = p.radstand * (1 - p.schwerpunkt);
  const vRef = Math.abs(auto.vx) + .9;
  const richtung = auto.vx >= 0 ? 1 : -1;

  // Schräglaufwinkel vorne/hinten
  const alphaV = Math.atan2(auto.vy + auto.gierRate*a, vRef) - auto.lenk*richtung;
  const alphaH = Math.atan2(auto.vy - auto.gierRate*b, vRef);

  // Untergrund: neben der Bahn bricht der Grip weg
  let griff = auto.aufBahn ? 1 : .60;
  if(auto.luft > 0) griff *= .12;

  const reifen = (al, steife, max) => klemm(-steife*al, -max, max);
  let FyV = reifen(alphaV, p.steifeV, p.haftungV) * griff;
  let FyH = reifen(alphaH, p.steifeH, p.haftungH) * griff;
  if(handbremse) FyH *= .30;                       // Heck losbrechen lassen

  // Längskräfte
  const vAnteil = klemm(tempo / p.vmax, 0, 1);
  const drehmoment = (1 - .62*vAnteil*vAnteil);     // oben raus wird's zäh
  let Fx = 0;
  const gasWert   = vorgabe.gas   !== null ? vorgabe.gas   : (taste.gas?1:0);
  const bremsWert = vorgabe.brems !== null ? vorgabe.brems : (taste.brems?1:0);
  if(gasWert > 0) Fx += p.antrieb * drehmoment * griff * gasWert * (pulsAn ? 1.55 : 1);
  if(bremsWert > 0){
    if(auto.vx > .6) Fx -= p.bremse * griff * bremsWert;
    else Fx -= p.antrieb * .52 * griff * bremsWert; // Rückwärtsgang
  }
  if(handbremse) Fx -= klemm(auto.vx, -6, 6) * 2.6;
  Fx -= p.luft * auto.vx * Math.abs(auto.vx) * (pulsAn ? .84 : 1);
  Fx -= p.rollen * auto.vx * (auto.aufBahn ? 1 : 3.4);

  // Steigung zieht am Wagen
  const steigung = -auto.normalV.x*Math.sin(auto.gier) - auto.normalV.z*Math.cos(auto.gier);
  Fx += steigung * 9.81 * .85;

  // Integration im Fahrzeugsystem
  const ay = (FyV*Math.cos(auto.lenk) + FyH);
  auto.vx += (Fx + auto.gierRate*auto.vy) * dt;
  auto.vy += (ay - auto.gierRate*auto.vx) * dt;
  auto.gierRate += ((a*FyV*Math.cos(auto.lenk) - b*FyH) / p.traegheit) * dt;
  auto.gierRate *= Math.pow(.986, dt*60);           // Dämpfung, sonst schaukelt es
  auto.vy *= Math.pow(.995, dt*60);
  auto.gier += auto.gierRate * dt;

  // In die Welt bewegen: vorne = (sin, cos), links = (cos, -sin)
  const s = Math.sin(auto.gier), c = Math.cos(auto.gier);
  auto.pos.x += (auto.vx*s + auto.vy*c) * dt;
  auto.pos.z += (auto.vx*c - auto.vy*s) * dt;
}

/* ── Boden und Streckengrenzen ─────────────────────────────────────── */
const normalMat = new THREE.Matrix3();
function nimmTreffer(t){
  auto.bodenY = t.point.y;
  if(t.face) auto.normalV.copy(t.face.normal)
    .applyNormalMatrix(normalMat.getNormalMatrix(t.object.matrixWorld)).normalize();
}
function anDenBoden(dt){
  // Erst nur gegen die Fahrbahn strahlen. Das Gelände-Mesh spannt sich über
  // die ganze Karte und liegt stellenweise über dem Asphalt — würde man in
  // einem Rutsch gegen beides strahlen, gälte der Wagen ständig als neben
  // der Bahn. Der Ursprung liegt dicht überm Wagen, damit Brücken über uns
  // nicht fälschlich getroffen werden.
  strahl.far = 24;
  strahl.set(hilf.set(auto.pos.x, auto.pos.y + 4, auto.pos.z), RUNTER);
  const aufAsphalt = strahl.intersectObjects(strasse, false);
  if(aufAsphalt.length){
    auto.aufBahn = true;
    nimmTreffer(aufAsphalt[0]);
  } else {
    strahl.far = 60;
    strahl.set(hilf.set(auto.pos.x, auto.pos.y + 12, auto.pos.z), RUNTER);
    const daneben = strahl.intersectObjects(gelaende, false);
    auto.aufBahn = false;
    if(daneben.length) nimmTreffer(daneben[0]);
  }
  const soll = auto.bodenY;
  if(auto.pos.y < soll + .02){ auto.pos.y = soll; auto.luft = 0; }
  else { auto.luft += dt; auto.pos.y = mischen(auto.pos.y, soll, klemm(dt*14,0,1)); }

  // Grenzen über die Mittellinie: erst Warnung, dann Leitplanke
  auto.idx = naechsterIndex(auto.pos.x, auto.pos.z, auto.idx);
  const i = auto.idx, [nx, nz] = normale(i);
  const dx = auto.pos.x - S.x[i], dz = auto.pos.z - S.z[i];
  auto.quer = dx*nx + dz*nz;
  const grenzePlus = HW_P[i] + 2.2, grenzeMinus = -(HW_M[i] + 2.2);
  let ueber = 0;
  if(auto.quer > grenzePlus) ueber = auto.quer - grenzePlus;
  else if(auto.quer < grenzeMinus) ueber = auto.quer - grenzeMinus;
  if(ueber !== 0){
    auto.pos.x -= nx*ueber; auto.pos.z -= nz*ueber;
    // Geschwindigkeit in die Welt drehen und in Bandennormale/-tangente zerlegen.
    // Nur der Anteil senkrecht zur Bande wird gebrochen; längs rutscht der Wagen
    // weiter. Nimmt man beides, klebt er nach dem ersten Kontakt fest.
    const sy = Math.sin(auto.gier), cy = Math.cos(auto.gier);
    let wx = auto.vx*sy + auto.vy*cy, wz = auto.vx*cy - auto.vy*sy;
    const vn = wx*nx + wz*nz;                 // Anteil auf die Bande zu
    const wucht = Math.abs(vn);
    if(vn * ueber > 0){                       // fährt weiter hinein
      const weg = vn * 1.35;                  // abprallen mit Verlust
      wx -= nx*weg; wz -= nz*weg;
    }
    wx *= .975; wz *= .975;                   // Schrammen kostet etwas Tempo
    auto.vx = wx*sy + wz*cy;
    auto.vy = wx*cy - wz*sy;
    auto.gierRate *= .62;
    if(wucht > 13){ auto.puls = 0; melde('EINSCHLAG', 'Puls zurückgesetzt'); }
  }
}

/* ── Runden zählen ─────────────────────────────────────────────────── */
function rundenLogik(){
  const i = auto.idx, vor = auto.letzterIdx;
  const zielIdx = START;
  // Überquerung der Ziellinie erkennen: Index läuft über START hinweg
  const warVor = ((vor - zielIdx + N) % N) > N*0.5;
  const istNach = ((i - zielIdx + N) % N) < N*0.5;
  if(warVor && istNach && Math.abs(((i - vor + N + N/2) % N) - N/2) < 20){
    if(zeit.laeuft){
      zeit.letzte = zeit.aktuell;
      if(!zeit.beste || zeit.letzte < zeit.beste){
        zeit.beste = zeit.letzte;
        geister.beste = geister.aufnahme.slice();
        melde('BESTZEIT', fmt(zeit.letzte));
      } else melde('RUNDE ' + (zeit.runden+1), fmt(zeit.letzte));
      zeit.runden++;
    }
    zeit.laeuft = true; zeit.aktuell = 0;
    geister.aufnahme = []; geister.zeiger = 0;
  }
  auto.letzterIdx = i;
}

/* ── PULS ──────────────────────────────────────────────────────────── */
function pulsLogik(dt){
  const tempo = Math.abs(auto.vx);
  let laden = 0;
  if(auto.aufBahn && tempo > 12){
    const i = auto.idx;
    const kante = Math.min(Math.abs(HW_P[i] - auto.quer), Math.abs(auto.quer + HW_M[i]));
    if(kante < 3.2) laden += (3.2 - kante) * .085;          // dicht an der Kante
    const quer = Math.abs(Math.atan2(auto.vy, Math.abs(auto.vx)+1));
    if(quer > .16) laden += (quer - .16) * 1.35;            // quer stehen
  }
  if(auto.luft > .12) laden += 1.1;                         // abheben
  laden *= klemm(tempo/26, 0, 1.4);
  if(auto.pulsAn) auto.puls -= dt * .40;
  else auto.puls += laden * dt * .30;
  auto.puls = klemm(auto.puls, 0, 1);
}

/* ── Zurückspulen ──────────────────────────────────────────────────── */
let spulUhr = 0;
function merkeSchnappschuss(dt){
  spulUhr += dt;
  if(spulUhr < 1/SPUL_HZ) return;
  spulUhr = 0;
  spulPuffer.push({x:auto.pos.x,y:auto.pos.y,z:auto.pos.z,g:auto.gier,
                   vx:auto.vx,vy:auto.vy,gr:auto.gierRate,i:auto.idx,t:zeit.aktuell});
  if(spulPuffer.length > SPUL_HZ*SPUL_SEK) spulPuffer.shift();
}
function spuleZurueck(dt){
  if(!spulPuffer.length){ modus = 'fahren'; return; }
  const s = spulPuffer.pop();
  auto.pos.set(s.x, s.y, s.z); auto.gier = s.g;
  auto.vx = s.vx*.6; auto.vy = s.vy*.6; auto.gierRate = 0;
  auto.idx = auto.letzterIdx = s.i; zeit.aktuell = s.t;
  auto.puls = klemm(auto.puls - dt*.55, 0, 1);
  if(auto.puls <= 0) modus = 'fahren';
}

/* ── Geist ─────────────────────────────────────────────────────────── */
function geistLogik(dt){
  geister.aufnahme.push({t:zeit.aktuell, x:auto.pos.x, y:auto.pos.y, z:auto.pos.z, g:auto.gier});
  if(!geister.beste || !geistObj) return;
  const g = geister.beste;
  while(geister.zeiger < g.length-1 && g[geister.zeiger+1].t < zeit.aktuell) geister.zeiger++;
  const a = g[geister.zeiger], b = g[Math.min(geister.zeiger+1, g.length-1)];
  const sp = b.t > a.t ? klemm((zeit.aktuell-a.t)/(b.t-a.t),0,1) : 0;
  geistObj.visible = zeit.aktuell <= g[g.length-1].t;
  geistObj.position.set(mischen(a.x,b.x,sp), mischen(a.y,b.y,sp)+.02, mischen(a.z,b.z,sp));
  let d = b.g-a.g; while(d>Math.PI) d-=Math.PI*2; while(d<-Math.PI) d+=Math.PI*2;
  geistObj.rotation.y = a.g + d*sp;
}
function machGeist(){
  if(geistObj) return;
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({color:0x39e0ff, transparent:true, opacity:.20, depthWrite:false});
  const k = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.2, 4.6), mat);
  k.position.y = .6; g.add(k);
  const kante = new THREE.LineSegments(new THREE.EdgesGeometry(k.geometry),
    new THREE.LineBasicMaterial({color:0x39e0ff, transparent:true, opacity:.55}));
  kante.position.y = .6; g.add(kante);
  g.visible = false; geistObj = g; szene.add(g);
}

/* ── Kamera ────────────────────────────────────────────────────────── */
function kameraFuehren(dt){
  const s = Math.sin(auto.gier), c = Math.cos(auto.gier);
  const tempo = Math.abs(auto.vx);
  if(kameraArt === 0){
    const weg = 8.4 + tempo*.075, hoch = 3.1 + tempo*.016;
    const ziel = hilf.set(auto.pos.x - s*weg, auto.pos.y + hoch, auto.pos.z - c*weg);
    kamPos.lerp(ziel, klemm(dt*4.6, 0, 1));
    kamZiel.lerp(hilf.set(auto.pos.x + s*7, auto.pos.y + 1.5, auto.pos.z + c*7), klemm(dt*6.5,0,1));
    kamera.position.copy(kamPos);
    kamera.lookAt(kamZiel);
    kamera.fov = 62 + klemm(tempo/ profil.vmax, 0, 1)*15 + (auto.pulsAn?6:0);
  } else {
    kamera.position.set(auto.pos.x + s*.5, auto.pos.y + 1.15, auto.pos.z + c*.5);
    kamZiel.set(auto.pos.x + s*40, auto.pos.y + 1.4, auto.pos.z + c*40);
    kamera.lookAt(kamZiel);
    kamera.fov = 68 + klemm(tempo/profil.vmax,0,1)*12;
  }
  kamera.updateProjectionMatrix();
}

/* ── Anzeige ───────────────────────────────────────────────────────── */
function fmt(t){
  if(!t) return '--:--.---';
  const m = Math.floor(t/60), s = Math.floor(t%60), ms = Math.floor((t%1)*1000);
  return `${m}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`;
}
let meldeUhr = 0;
function melde(gross, klein){
  $('#meldung').innerHTML = gross + (klein? '<small>'+klein+'</small>' : '');
  $('#meldung').classList.add('an'); meldeUhr = 2.2;
}
const kkarte = $('#karte canvas'), kctx = kkarte.getContext('2d');
let kartenBox = null;
function zeichneKarte(){
  if(!kartenBox){
    let miX=1e9,maX=-1e9,miZ=1e9,maZ=-1e9;
    for(let i=0;i<N;i++){ miX=Math.min(miX,S.x[i]); maX=Math.max(maX,S.x[i]);
                          miZ=Math.min(miZ,S.z[i]); maZ=Math.max(maZ,S.z[i]); }
    const sp = Math.max(maX-miX, maZ-miZ)*1.1;
    kartenBox = {cx:(miX+maX)/2, cz:(miZ+maZ)/2, sp};
  }
  const W = kkarte.width, k = W/kartenBox.sp;
  const px = x => W/2 + (x-kartenBox.cx)*k, pz = z => W/2 + (z-kartenBox.cz)*k;
  kctx.clearRect(0,0,W,W);
  kctx.strokeStyle='#2b3a45'; kctx.lineWidth=13; kctx.lineJoin='round';
  kctx.beginPath(); kctx.moveTo(px(S.x[0]),pz(S.z[0]));
  for(let i=1;i<N;i++) kctx.lineTo(px(S.x[i]),pz(S.z[i]));
  kctx.closePath(); kctx.stroke();
  kctx.strokeStyle='#4b5a74'; kctx.lineWidth=2; kctx.stroke();
  // Ziellinie
  const [nx,nz]=normale(START);
  kctx.strokeStyle='#e8edf6'; kctx.lineWidth=4; kctx.beginPath();
  kctx.moveTo(px(S.x[START]+nx*11), pz(S.z[START]+nz*11));
  kctx.lineTo(px(S.x[START]-nx*11), pz(S.z[START]-nz*11)); kctx.stroke();
  if(geistObj && geistObj.visible){
    kctx.fillStyle='#39e0ff'; kctx.beginPath();
    kctx.arc(px(geistObj.position.x), pz(geistObj.position.z), 5, 0, 7); kctx.fill();
  }
  kctx.fillStyle = auto.pulsAn ? '#ffd66b' : '#ff9d2e';
  kctx.beginPath(); kctx.arc(px(auto.pos.x), pz(auto.pos.z), 7, 0, 7); kctx.fill();
}
function anzeige(dt){
  const kmh = Math.abs(auto.vx)*3.6;
  $('#kmh').innerHTML = Math.round(kmh) + '<sub>KM/H</sub>';
  const anteil = klemm(Math.abs(auto.vx)/profil.vmax, 0, 1);
  const gang = klemm(Math.floor(anteil*6)+1, 1, 6);
  $('#gang').textContent = auto.vx < -.5 ? 'Rückwärts' : 'Gang ' + gang;
  $('#drehzahl i').style.width = (((anteil*6)%1)*100).toFixed(0)+'%';
  $('#tAktuell').textContent = fmt(zeit.aktuell);
  $('#tBeste').textContent = fmt(zeit.beste);
  $('#tLetzte').textContent = fmt(zeit.letzte);
  $('#tRunde').textContent = zeit.runden + 1;
  const d = $('#delta');
  if(zeit.beste && geister.beste && geister.beste.length){
    const g = geister.beste;
    let j = 0; while(j<g.length-1 && g[j+1].t < zeit.aktuell) j++;
    const dxx = auto.pos.x-g[j].x, dzz = auto.pos.z-g[j].z;
    const vorn = (dxx*Math.sin(auto.gier)+dzz*Math.cos(auto.gier));
    const sek = -vorn / Math.max(8, Math.abs(auto.vx));
    d.textContent = (sek>=0?'+':'') + sek.toFixed(2);
    d.className = sek>=0 ? 'plus' : 'minus';
  } else { d.textContent = '--'; d.className=''; }
  $('#pulsbar i').style.width = (auto.puls*100).toFixed(0)+'%';
  $('#pulszahl').textContent = Math.round(auto.puls*100)+'%';
  $('#pulsbar').classList.toggle('voll', auto.puls > .85);
  $('#pulstext').textContent = modus==='spulen' ? 'Zurückspulen …'
    : auto.pulsAn ? 'Gezündet' : auto.puls>.15 ? 'Shift zündet · R spult zurück' : '';
  if(meldeUhr > 0){ meldeUhr -= dt; if(meldeUhr <= 0) $('#meldung').classList.remove('an'); }
  zeichneKarte();
}

/* ── Räder drehen ──────────────────────────────────────────────────── */
function raederDrehen(dt){
  const rs = modell.userData.raeder;
  if(!rs || !rs.length) return;
  auto.radWinkel += (auto.vx / .34) * dt;
  for(const r of rs){
    r.knoten.rotation.copy(r.basis);
    r.knoten.rotation.x = r.basis.x - auto.radWinkel;
    if(r.vorne) r.knoten.rotation.y = r.basis.y + auto.lenk;
  }
}

/* ── Schleife ──────────────────────────────────────────────────────── */
let vorher = performance.now();
function schleife(jetzt){
  requestAnimationFrame(schleife);
  let dt = (jetzt - vorher)/1000; vorher = jetzt;
  dt = Math.min(dt, .05);
  if(modus === 'menu'){ menuKamera(dt); rnd.render(szene, kamera); return; }

  if(modus === 'fahren' && taste.spulen && auto.puls > .05) modus = 'spulen';
  if(modus === 'spulen'){
    if(!taste.spulen) modus = 'fahren';
    else spuleZurueck(dt);
  } else {
    // Feste Teilschritte: das Reifenmodell mag keine großen Zeitsprünge
    const schritte = Math.max(1, Math.ceil(dt/(1/120)));
    const h = dt/schritte;
    for(let k=0;k<schritte;k++) fahre(h);
    anDenBoden(dt);
    rundenLogik();
    pulsLogik(dt);
    merkeSchnappschuss(dt);
    if(zeit.laeuft){ zeit.aktuell += dt; geistLogik(dt); }
  }

  modell.position.copy(auto.pos);
  modell.rotation.set(0, auto.gier, 0);
  // Wagen an die Fahrbahn anlegen (nur Optik) + etwas Wanken
  const neigung = klemm(-auto.gierRate*Math.abs(auto.vx)*.010, -.10, .10);
  modell.rotateZ(neigung);
  modell.rotateX(klemm((auto.vx>0?-1:1)*(taste.brems?.030:taste.gas?-.020:0), -.05, .05));
  if(modell.userData.rueck) modell.userData.rueck.intensity = taste.brems ? 26 : 6;
  raederDrehen(dt);

  kameraFuehren(dt);
  anzeige(dt);
  rnd.render(szene, kamera);
}


/* ── Selbsttest ────────────────────────────────────────────────────────
   Fährt die Strecke ohne zu zeichnen mit fester Schrittweite ab und
   meldet, ob Runde, Zeitnahme und Streckengrenzen greifen. Nur für die
   Werkbank; das Spiel selbst ruft das nie auf.                        */
window.__AUTOS = AUTOS;
window.__probelauf = (sekunden = 120, dt = 1/60) => {
  setzeAuf(START, 0);
  zeit.laeuft = false; zeit.aktuell = 0; zeit.runden = 0; zeit.beste = 0; zeit.letzte = 0;
  geister.aufnahme = []; geister.beste = null;
  const b = {schritte:0, neben:0, maxKmh:0, runden:[], maxQuer:0, wandTreffer:0, spur:[]};
  for(let k = 0; k < sekunden/dt; k++){
    fahrhilfe(dt);
    const n = Math.max(1, Math.ceil(dt/(1/120))), h = dt/n;
    for(let q=0;q<n;q++) fahre(h);
    const querVor = auto.quer;
    anDenBoden(dt);
    if(Math.abs(querVor) > HW_P[auto.idx] + 2.2) b.wandTreffer++;
    const vorher = zeit.runden;
    rundenLogik();
    if(zeit.runden > vorher) b.runden.push(+zeit.letzte.toFixed(3));
    pulsLogik(dt);
    if(zeit.laeuft) zeit.aktuell += dt;
    if(b.spur && k % Math.round(0.4/dt) === 0) b.spur.push({
      t:+(k*dt).toFixed(1), i:auto.idx, quer:+auto.quer.toFixed(1),
      kmh:+(auto.vx*3.6).toFixed(0), lenk:+auto.lenk.toFixed(2),
      soll:+(vorgabe.lenk??0).toFixed(2), bahn:auto.aufBahn?1:0,
      hw:+((auto.quer>0?HW_P:HW_M)[auto.idx]).toFixed(1)});
    b.schritte++;
    if(!auto.aufBahn) b.neben++;
    b.maxKmh = Math.max(b.maxKmh, Math.abs(auto.vx)*3.6);
    b.maxQuer = Math.max(b.maxQuer, Math.abs(auto.quer));
  }
  vorgabe.lenk = vorgabe.gas = vorgabe.brems = null;
  b.maxKmh=+b.maxKmh.toFixed(1); b.maxQuer=+b.maxQuer.toFixed(1);
  b.nebenAnteil=+(100*b.neben/b.schritte).toFixed(1);
  return b;
};

/* Breiten neu vermessen — mit demselben kurzen Strahl, den auch der Wagen
   benutzt. Die erste Messung strahlte aus großer Höhe und traf dabei
   benachbarte Streckenteile, was die Fahrbahn viel zu breit erscheinen ließ. */
window.__vermessen = () => {
  const L = [], R = [], Y = [];
  for(let i = 0; i < N; i++){
    const [nx, nz] = normale(i);
    const treffer = (d) => {
      const x = S.x[i] + nx*d, z = S.z[i] + nz*d;
      strahl.far = 24;
      strahl.set(hilf.set(x, S.y[i] + 4, z), RUNTER);
      const t = strahl.intersectObjects(strasse, false);
      return t.length ? t[0].point.y : null;
    };
    Y.push(+(treffer(0) ?? S.y[i]).toFixed(2));
    let l = 0, r = 0;
    for(let d = 0.25; d <= 14; d += 0.25){ if(treffer(d)  === null) break; l = d; }
    for(let d = 0.25; d <= 14; d += 0.25){ if(treffer(-d) === null) break; r = d; }
    L.push(+l.toFixed(2)); R.push(+r.toFixed(2));
  }
  return {L, R, Y};
};

/* Punktprobe: Wagen auf die Mittellinie setzen und die Bahnerkennung fragen */
window.__probeBahn = (schritt = 8) => {
  const raus = [], quer = [];
  for(let i = 0; i < N; i += schritt){
    setzeAuf(i, 0);
    anDenBoden(1/60);
    if(!auto.aufBahn) raus.push(i);
    quer.push(+auto.quer.toFixed(2));
  }
  // Auch seitlich versetzt prüfen
  const seit = {};
  for(const d of [-6,-4,-2,0,2,4,6]){
    let treffer = 0, n = 0;
    for(let i = 0; i < N; i += schritt){ setzeAuf(i, d); anDenBoden(1/60); if(auto.aufBahn) treffer++; n++; }
    seit[d] = Math.round(100*treffer/n) + '%';
  }
  return {geprueft: Math.ceil(N/schritt), nichtAufBahn: raus, querMax: Math.max(...quer.map(Math.abs)), seitlich: seit};
};

/* Regler, der die Mittellinie abfährt — Grundlage für Selbsttest und Gegner */
function fahrhilfe(dt, aggressiv = 1){
  const tempo = Math.abs(auto.vx);
  const voraus = Math.round(3 + tempo * 0.30);            // weiter schauen, je schneller
  const zi = (auto.idx + voraus) % N;
  // Ziel etwas zur Kurveninnenseite ziehen
  const [nx, nz] = normale(auto.idx);
  const zx = S.x[zi] - auto.pos.x, zz = S.z[zi] - auto.pos.z;
  let ab = Math.atan2(zx, zz) - auto.gier;
  while(ab >  Math.PI) ab -= Math.PI*2;
  while(ab < -Math.PI) ab += Math.PI*2;
  // Gegenlenken, wenn das Heck kommt
  const schwimm = Math.atan2(auto.vy, Math.abs(auto.vx) + 1);
  // Zusätzlich zur Richtung auch die seitliche Ablage ausregeln.
  // Achtung: die Normale (-tz, tx) zeigt nach RECHTS. Positive Ablage heißt
  // also „zu weit rechts" und wird mit positivem (linkem) Lenkeinschlag geholt.
  const ablage = auto.quer;
  vorgabe.lenk = klemm((ab * 3.0 + schwimm * 0.85 + ablage * 0.12) * aggressiv, -1, 1);

  // Wunschtempo aus der Krümmung im Vorausbereich
  let kMax = 0;
  for(let j = 2; j < Math.max(8, voraus + 8); j++) kMax = Math.max(kMax, KRUEMMUNG[(auto.idx + j) % N]);
  const haftung = (profil.haftungV + profil.haftungH) / 2;
  const vKurve = kMax > 1e-4 ? Math.sqrt(haftung / kMax) * 0.80 * aggressiv : profil.vmax;
  const vSoll = Math.min(profil.vmax, vKurve);
  if(tempo < vSoll - 1.5){ vorgabe.gas = 1; vorgabe.brems = 0; }
  else if(tempo > vSoll + 1.5){ vorgabe.gas = 0; vorgabe.brems = klemm((tempo - vSoll)/9, .2, 1); }
  else { vorgabe.gas = .45; vorgabe.brems = 0; }
}

/* ── Menü ──────────────────────────────────────────────────────────── */
let menuWinkel = 0;
function menuKamera(dt){
  menuWinkel += dt*.22;
  const r = 12, i = START;
  const cx = S.x[i], cz = S.z[i], cy = S.y[i];
  kamera.position.set(cx + Math.sin(menuWinkel)*r, cy + 3.6, cz + Math.cos(menuWinkel)*r);
  kamera.lookAt(cx, cy + .7, cz);
  kamera.fov = 46; kamera.updateProjectionMatrix();
}
function baueAutowahl(){
  const box = $('#autowahl'); box.innerHTML = '';
  for(const [id, c] of Object.entries(AUTOS)){
    const el = document.createElement('div');
    el.className = 'auto' + (id===wahl?' aktiv':'');
    el.innerHTML = `<div class="typ">${c.typ}</div><h3>${c.name}</h3>
      <div class="balken">${Object.entries(c.balken).map(([k,v])=>
        `<u>${k}</u><span><i style="width:${v}%"></i></span>`).join('')}</div>`;
    el.addEventListener('click', () => {
      wahl = id; baueAutowahl();
      if(modell) szene.remove(modell);
      baueAuto(); setzeAuf(START, 0);
      modell.position.copy(auto.pos); modell.rotation.set(0, auto.gier, 0);
    });
    box.appendChild(el);
  }
}
function zumMenue(){
  modus = 'menu'; $('#menu').classList.add('an'); $('#hud').classList.remove('an');
  zeit.laeuft = false; zeit.aktuell = 0;
}
$('#start').addEventListener('click', () => {
  $('#menu').classList.remove('an'); $('#hud').classList.add('an');
  setzeAuf(START, 0);
  zeit.laeuft = false; zeit.aktuell = 0; zeit.runden = 0;
  geister.aufnahme = []; geister.zeiger = 0;
  modus = 'fahren';
  melde('LOS', 'Erste Runde startet an der Linie');
});

/* ── Start ─────────────────────────────────────────────────────────── */
ladeAlles().then(() => {
  baueAuto(); machGeist(); setzeAuf(START, 0);
  modell.position.copy(auto.pos); modell.rotation.set(0, auto.gier, 0);
  baueAutowahl();
  $('#boot').classList.add('weg');
  $('#menu').classList.add('an');
  requestAnimationFrame(schleife);
}).catch(e => {
  console.error(e);
  $('#bootmsg').innerHTML = 'Laden fehlgeschlagen.<br><small>' + String(e).slice(0,180) +
    '</small><br><br><small>Die Seite braucht einen Webserver — direkt vom Dateisystem blockiert der Browser die Modelle.</small>';
});
