/* ═══════════════════════════════════════════════════════════════════
   Illegal Autostehlen — das Spiel.
   Eine Küstenstadt bei Sonnenuntergang: zu Fuß, im Auto, im Boot und
   im Flugzeug. Verkehr, Fußgänger, Polizei mit Fahndungssternen,
   Kurieraufträge und Geld auf der Straße.
   ═══════════════════════════════════════════════════════════════════ */
import * as THREE from 'three';
import { EffectComposer } from './lib/postprocessing/EffectComposer.js';
import { RenderPass } from './lib/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './lib/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './lib/postprocessing/OutputPass.js';
import { ShaderPass } from './lib/postprocessing/ShaderPass.js';
import { FXAAShader } from './lib/shaders/FXAAShader.js';
import * as T from './texturen.js';
import * as W from './welt.js';
import { baueBoot, baueFlugzeug, baueHubschrauber } from './modelle.js';
import { ladeWaffen, baueWaffe, ladeAlles, ladeKulisse, kulisse, kulissenStueck, baueAuto, baueFigur, animiereFigur, LACKE, MAT, lichtMats } from './fahrzeugbau.js';
import { Water } from './lib/Water.js';

const $ = id => document.getElementById(id);
const klemm = (v, a, b) => v < a ? a : v > b ? b : v;
const misch = (a, b, t) => a + (b - a)*t;
const glatt = (a, b, x) => { const t = klemm((x - a)/(b - a), 0, 1); return t*t*(3 - 2*t); };
const daempf = (a, b, k, dt) => misch(a, b, 1 - Math.exp(-k*dt));
const winkel = a => { a = (a + Math.PI) % (Math.PI*2); if(a < 0) a += Math.PI*2; return a - Math.PI; };
const daempfW = (a, b, k, dt) => a + winkel(b - a)*(1 - Math.exp(-k*dt));
const Z = T.mulberry32(99);
const R = (a, b) => a + (b - a)*Z();
const wahl = l => l[Math.floor(Z()*l.length)];

const TOUCH = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
document.body.classList.toggle('touch', TOUCH);

function speicherLesen(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } }
function speicherSchreiben(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

/* ── Grafik ────────────────────────────────────────────────────── */
const STUFEN = {
  hoch:    { pr: Math.min(devicePixelRatio || 1, 2), schatten: 2048, bloom: true, msaa: 4, verkehr: 36, leute: 28 },
  mittel:  { pr: Math.min(devicePixelRatio || 1, 1.4), schatten: 1024, bloom: true, msaa: 0, verkehr: 26, leute: 18 },
  niedrig: { pr: Math.min(devicePixelRatio || 1, 1), schatten: 0, bloom: false, msaa: 0, verkehr: 16, leute: 10 },
};
let stufeName = speicherLesen('autostehlen.grafik', TOUCH ? 'mittel' : 'hoch');
if(!STUFEN[stufeName]) stufeName = 'mittel';
let Q = STUFEN[stufeName];

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', logarithmicDepthBuffer: true });
} catch(e){
  $('ladetext').textContent = 'Dein Gerät kann kein WebGL. Ohne WebGL läuft das Spiel leider nicht.';
  throw e;
}
T.setzeAniso(Math.min(8, renderer.capabilities.getMaxAnisotropy()));
renderer.setPixelRatio(Q.pr);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = Q.schatten > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('buehne').appendChild(renderer.domElement);

const szene = new THREE.Scene();
const kamera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, .4, 6000);
kamera.position.set(300, 120, -100);

let composer, bloomPass, kinoPass, fxaaPass, aufl = 1;
// Kinolook: leichte Farbkorrektur (warme Lichter, kühle Schatten), Vignette,
// Farbsaum am Bildrand und feines Filmkorn
const KinoShader = {
  uniforms: { tDiffuse: { value: null }, uZeit: { value: 0 }, uVignette: { value: .32 }, uKorn: { value: .035 }, uAufl: { value: new THREE.Vector2(1, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uZeit, uVignette, uKorn; uniform vec2 uAufl; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)))*43758.5453); }
    void main(){
      vec2 m = vUv - .5; float r = dot(m, m);
      vec2 off = m*r*.012;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(c, c*vec3(1.05, 1., .93), smoothstep(.45, 1., l));
      c = mix(c, c*vec3(.93, 1., 1.07), 1. - smoothstep(0., .35, l));
      c = (c - .5)*1.06 + .5;
      c = mix(vec3(l), c, 1.1);
      c *= 1. - uVignette*smoothstep(.12, .7, r*1.7);
      c += (hash(floor(vUv*uAufl) + fract(uZeit)*61.) - .5)*uKorn;
      gl_FragColor = vec4(clamp(c, 0., 1.), 1.);
    }`,
};
function baueComposer(){
  if(composer){ composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); }
  composer = null;
  if(!Q.bloom) return;
  const rt = new THREE.WebGLRenderTarget(innerWidth*Q.pr, innerHeight*Q.pr, { type: THREE.HalfFloatType, samples: Q.msaa });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(Q.pr);
  composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(szene, kamera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .5, .45, .92);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  if(!Q.msaa){ fxaaPass = new ShaderPass(FXAAShader); composer.addPass(fxaaPass); } else fxaaPass = null;
  kinoPass = new ShaderPass(KinoShader);
  kinoPass.uniforms.uAufl.value.set(innerWidth*Q.pr, innerHeight*Q.pr);
  composer.addPass(kinoPass);
  auflSetzen(aufl);
}
// mitlaufende Auflösung: fällt die Bildrate, wird intern feiner oder gröber gerechnet
function auflSetzen(a){
  aufl = a; const pr = Q.pr*a;
  renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight);
  if(composer){ composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
  if(fxaaPass) fxaaPass.material.uniforms.resolution.value.set(1/(innerWidth*pr), 1/(innerHeight*pr));
  if(kinoPass) kinoPass.uniforms.uAufl.value.set(innerWidth*pr, innerHeight*pr);
}
let fpsZeit = 0, fpsBilder = 0;
function auflRegeln(dtEcht){
  if(!laeuft || pausiert) return;
  fpsZeit += dtEcht; fpsBilder++;
  if(fpsZeit < 1.5) return;
  const fps = fpsBilder/fpsZeit; fpsZeit = 0; fpsBilder = 0;
  if(fps < 45 && aufl > .55) auflSetzen(Math.max(.55, aufl*.85));
  else if(fps > 57 && aufl < 1) auflSetzen(Math.min(1, aufl*1.08));
}
baueComposer();

/* ── Himmel ────────────────────────────────────────────────────── */
const himmelUni = {
  uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() },
  uSonne: { value: new THREE.Vector3(0, 1, 0) }, uSonnenFarbe: { value: new THREE.Color() },
  uZeit: { value: 0 }, uNacht: { value: 0 },
};
const himmelMat = new THREE.ShaderMaterial({
  uniforms: himmelUni, side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: `varying vec3 vDir;
    void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position, 1.); gl_Position = p.xyww; }`,
  fragmentShader: `uniform vec3 uZen, uHor, uSonne, uSonnenFarbe; uniform float uZeit, uNacht; varying vec3 vDir;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
    float rau(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3. - 2.*f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
    float fbm(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 5; i++){ s += a*rau(p); p = p*2.03 + 1.7; a *= .5; } return s; }
    void main(){
      vec3 d = normalize(vDir); float h = d.y;
      vec3 col = mix(uZen, uHor, pow(1. - max(h, 0.), 2.6));
      if(h < 0.) col = mix(uHor, uHor*.4 + vec3(.01, .012, .02), clamp(-h*5., 0., 1.));
      float sd = max(dot(d, uSonne), 0.);
      col += uSonnenFarbe*(pow(sd, 900.)*12. + pow(sd, 40.)*.3 + pow(sd, 5.)*.1)*smoothstep(-.14, .02, uSonne.y);
      float mo = max(dot(d, -uSonne), 0.);
      col += vec3(.85, .9, 1.)*(pow(mo, 2500.)*6. + pow(mo, 50.)*.05)*uNacht;
      if(h > 0.){
        vec2 sp = floor(d.xz/(h + .4)*230.); float s = hash(sp);
        col += vec3(step(.9967, s))*uNacht*(.55 + .45*sin(uZeit*3. + s*60.))*smoothstep(0., .25, h);
        vec2 uv = d.xz/(h + .12)*1.25 + vec2(uZeit*.006, uZeit*.0025);
        float c = smoothstep(.47, .82, fbm(uv*.9))*smoothstep(0., .16, h);
        vec3 hell = mix(uHor*1.05 + vec3(.05), uSonnenFarbe*1.25 + vec3(.12), pow(sd, 3.)*.85);
        vec3 wolke = mix(hell, uZen*.7 + uHor*.3, .3);
        wolke = mix(wolke, vec3(.045, .05, .085) + uHor*.3, uNacht);
        col = mix(col, wolke, c*.9);
      }
      gl_FragColor = vec4(col, 1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
});
const himmel = new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), himmelMat);
himmel.frustumCulled = false; himmel.renderOrder = -10;
szene.add(himmel);
const umweltSzene = new THREE.Scene();
umweltSzene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), himmelMat));
const pmrem = new THREE.PMREMGenerator(renderer);
let umweltRT = null, umweltE = -9, umweltZeit = 0;

const sonne = new THREE.DirectionalLight(0xffffff, 3);
sonne.castShadow = Q.schatten > 0;
function schattenEinstellen(){
  sonne.castShadow = Q.schatten > 0;
  renderer.shadowMap.enabled = Q.schatten > 0;
  if(Q.schatten){
    sonne.shadow.mapSize.set(Q.schatten, Q.schatten);
    if(sonne.shadow.map){ sonne.shadow.map.dispose(); sonne.shadow.map = null; }
    const c = sonne.shadow.camera, s = Q.schatten >= 2048 ? 62 : 50;
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 10; c.far = 700; c.updateProjectionMatrix();
    sonne.shadow.bias = -.0004; sonne.shadow.normalBias = .06;
  }
  szene.traverse(o => { if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.needsUpdate = true); } });
}
szene.add(sonne, sonne.target);
const halb = new THREE.HemisphereLight(0xbcd4ff, 0x4a3f33, 1);
szene.add(halb);
// Aufhelllicht aus Richtung der Kamera: hellt Figur und Autos auf (vor allem im Gegenlicht),
// den Boden trifft es fast nur streifend
const fuell = new THREE.DirectionalLight(0xffffff, 1);
szene.add(fuell, fuell.target);
szene.fog = new THREE.FogExp2(0xffffff, .0011);

// Farben über der Sonnenhöhe
const HIMMEL = [
  [-.4, '#02040c', '#0b0d26'], [-.16, '#070821', '#22194a'], [-.06, '#1d1650', '#6b347d'],
  [.0, '#33287a', '#ff6a8e'], [.06, '#3d4fa8', '#ff9e7a'], [.14, '#3f6cc4', '#ffcfa2'],
  [.28, '#3a74cf', '#cfe2f2'], [.7, '#2a68d2', '#b9d9f4'],
].map(([e, z, h]) => [e, new THREE.Color(z), new THREE.Color(h)]);
const SONNENFARBE = [[-.05, '#ff5a3a'], [.03, '#ff7a3a'], [.12, '#ffb070'], [.3, '#fff0da'], [1, '#fff8ee']].map(([e, c]) => [e, new THREE.Color(c)]);
function stufe(liste, e, idx){
  if(e <= liste[0][0]) return liste[0][idx];
  for(let i = 1; i < liste.length; i++) if(e <= liste[i][0]){
    const t = (e - liste[i - 1][0])/(liste[i][0] - liste[i - 1][0]);
    return _c.copy(liste[i - 1][idx]).lerp(liste[i][idx], t);
  }
  return liste[liste.length - 1][idx];
}
const _c = new THREE.Color(), _c2 = new THREE.Color();

let stunde = speicherLesen('autostehlen.stunde', 17.6);
if(typeof stunde !== 'number' || !(stunde >= 0 && stunde < 24)) stunde = 17.6;
const tagSekunden = () => (einst.tag || 0)*60;
let nacht = 0;
const sonnenRichtung = new THREE.Vector3();
let zeitSprung = true;
function zeitAktualisieren(dt, erzwingen){
  if(erzwingen) zeitSprung = true;
  if(tagSekunden() > 0) stunde = (stunde + dt*24/tagSekunden()) % 24;
  const a = (stunde - 6)/12*Math.PI;
  sonnenRichtung.set(Math.cos(a)*.93, Math.sin(a), .36).normalize();
  const e = sonnenRichtung.y;
  nacht = glatt(.04, -.13, e);
  himmelUni.uZen.value.copy(stufe(HIMMEL, e, 1));
  himmelUni.uHor.value.copy(stufe(HIMMEL, e, 2));
  himmelUni.uSonne.value.copy(sonnenRichtung);
  himmelUni.uSonnenFarbe.value.copy(stufe(SONNENFARBE, e, 1)).multiplyScalar(1 - nacht*.9);
  himmelUni.uNacht.value = nacht;
  himmelUni.uZeit.value += dt;
  // Licht: tags die Sonne, nachts der Mond
  const tagI = glatt(-.03, .18, e);
  if(e > -.04){
    sonne.color.copy(stufe(SONNENFARBE, e, 1)); sonne.intensity = 2.7*tagI + .05;
  } else {
    sonne.color.set(0x8fa8ff); sonne.intensity = .45*nacht;
  }
  halb.color.copy(himmelUni.uZen.value).lerp(_c2.set(0xffffff), .35);
  halb.groundColor.set(0x4a3f33).lerp(_c2.set(0x1a1630), nacht);
  halb.intensity = .45 + .35*tagI + .3*nacht;
  szene.fog.color.copy(himmelUni.uHor.value).multiplyScalar(.85);
  szene.fog.density = .0009 + nacht*.0003;
  szene.environmentIntensity = 1 - nacht*.55;
  fuell.color.set(0xfff4e8).lerp(_c2.set(0xa8b8ff), nacht);
  fuell.intensity = (.85 + glatt(.25, .02, e)*.75)*(1 - nacht) + nacht*.85;
  if(drinnen){ sonne.intensity = 0; halb.intensity = .55; szene.environmentIntensity = .35; fuell.intensity = .6; }
  // Leuchten der Stadt
  for(const n of W.neon) n.mat.color.copy(n.basis).multiplyScalar(n.tag + nacht*n.nacht);
  for(const m of W.fensterMats) m.emissiveIntensity = nacht*1.35 + glatt(.12, -.02, e)*.15;
  if(W.markantes.lichtflecken){ W.markantes.lichtflecken.opacity = nacht*.55; W.markantes.lichtflecken.visible = nacht > .02; }
  for(const m of lichtMats) m.emissiveIntensity = .15 + nacht*2.6;
  wasserMat.color.set(0x0e3a4a).lerp(_c2.set(0x050b1c), nacht);
  if(spiegel){
    const u = spiegel.material.uniforms;
    u.sunDirection.value.copy(nacht > .6 ? _v3.copy(sonnenRichtung).negate() : sonnenRichtung).normalize();
    u.sunColor.value.copy(sonne.color).multiplyScalar(Math.min(1, sonne.intensity/2.5));
    u.waterColor.value.set(0x0c3646).lerp(_c2.set(0x040a18), nacht);
  }
  // Umgebungslicht für Spiegelungen neu berechnen
  umweltZeit -= dt;
  if(erzwingen || Math.abs(e - umweltE) > .012 || umweltZeit < 0 && Math.abs(e - umweltE) > .002){
    umweltE = e; umweltZeit = 3;
    const alt = umweltRT;
    umweltRT = pmrem.fromScene(umweltSzene, 0, .1, 200);
    szene.environment = umweltRT.texture;
    if(alt) alt.dispose();
  }
}

/* ── Wasser ────────────────────────────────────────────────────── */
const wasserNormal = new THREE.TextureLoader().load('bilder/wassernormalen.jpg');
wasserNormal.wrapS = wasserNormal.wrapT = THREE.RepeatWrapping;
wasserNormal.repeat.set(260, 260);
const wasserMat = new THREE.MeshStandardMaterial({ color: 0x0e3a4a, roughness: .07, metalness: .05, normalMap: wasserNormal, normalScale: new THREE.Vector2(.32, .32) });
const wasser = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI/2), wasserMat);
wasser.position.y = W.WASSER_Y; wasser.receiveShadow = true;
szene.add(wasser);
// Bei hoher Grafik: echtes Spiegelwasser (die Stadt spiegelt sich in der Bucht)
const spiegelNormal = new THREE.TextureLoader().load('bilder/wassernormalen.jpg');
spiegelNormal.wrapS = spiegelNormal.wrapT = THREE.RepeatWrapping;
const spiegel = new Water(new THREE.PlaneGeometry(9000, 9000), {
  textureWidth: 512, textureHeight: 512, waterNormals: spiegelNormal,
  sunDirection: new THREE.Vector3(0, 1, 0), sunColor: 0xffffff, waterColor: 0x0c3646, distortionScale: 2.2, fog: true,
});
spiegel.rotation.x = -Math.PI/2; spiegel.position.y = W.WASSER_Y; spiegel.material.uniforms.size.value = 1.6;
szene.add(spiegel);
const spiegelOrig = spiegel.onBeforeRender;
spiegel.onBeforeRender = function(r, sz, kam){
  if(bildNr % 2 === 1 && !zeitSprung) return; // jedes zweite Bild reicht für Wellen
  // Kleinkram erscheint im Spiegelbild ohnehin kaum: weglassen spart viel
  const weg = [];
  for(const g of W.ortsGruppen) for(const im of g.ims) if(im.visible){ im.visible = false; weg.push(im); }
  for(const p of leute) if(p.m.g.visible){ p.m.g.visible = false; weg.push(p.m.g); }
  for(const f of fahrzeuge) if(f.art === 'auto' && f.g.visible && f !== spieler.fz){ f.g.visible = false; weg.push(f.g); }
  spiegelOrig.call(this, r, sz, kam);
  for(const o of weg) o.visible = true;
};
function wasserWahl(){ spiegel.visible = stufeName === 'hoch'; wasser.visible = !spiegel.visible; }
wasserWahl();
// Brandung am Strand
const gischtMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .5, depthWrite: false, map: T.ring() });
const gischt = new THREE.Mesh(new THREE.PlaneGeometry(6, 1120).rotateX(-Math.PI/2), gischtMat);
gischt.position.set(587, W.WASSER_Y + .04, 0);
szene.add(gischt);

/* ── Stadt ─────────────────────────────────────────────────────── */
$('ladetext').textContent = 'Stadt wird gebaut …';
let welt, aufgestellt = false;
const schrift = '"Pricedown", Impact, sans-serif';

function ladeStand(anteil, text){
  $('ladeBalken').style.width = Math.round(anteil*100) + '%';
  if(text) $('ladetext').textContent = text;
}
async function aufbauen(){
  ladeStand(.04, 'Schrift wird geladen …');
  try { await Promise.race([document.fonts.load('80px "Pricedown"'), new Promise(r => setTimeout(r, 2500))]); } catch(e){}
  ladeStand(.08, 'Autos kommen aus der Werkstatt …');
  await ladeAlles(a => ladeStand(.08 + a*.5, a < 1 ? 'Autos kommen aus der Werkstatt …' : 'Leute ziehen ein …'));
  ladeStand(.6, 'Hochhäuser werden hochgezogen …');
  await ladeKulisse();
  await ladeWaffen();
  ladeStand(.7, 'Palma Bay wird gebaut …');
  await new Promise(r => setTimeout(r, 30));
  welt = W.baueWelt(szene, Q, kulisse);
  ladeStand(.85, 'Neonschilder werden angeknipst …');
  await new Promise(r => setTimeout(r, 30));
  // Leuchtschilder
  for(const s of W.hotelSchilder){
    const tex = T.schild(s.name.toUpperCase(), s.farbe, 'italic 700 96px Georgia, "Times New Roman", serif');
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1) });
    W.neon.push({ mat: m, basis: new THREE.Color(1, 1, 1), tag: .9, nacht: 2.2 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(16, 5), m);
    p.position.set(s.x + .1, s.y, s.z); p.rotation.y = Math.PI/2;
    szene.add(p);
  }
  if(W.markantes.polizei){
    const tex = T.schild('POLIZEI', '#4fa8ff', '96px ' + schrift);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1) });
    W.neon.push({ mat: m, basis: new THREE.Color(1, 1, 1), tag: 1, nacht: 2 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(18, 5.6), m);
    p.position.set(W.markantes.polizei.x, W.markantes.polizei.schildY, W.markantes.polizei.z - .2); p.rotation.y = Math.PI;
    szene.add(p);
  }
  if(W.markantes.krankenhaus){
    drinnen = null; ladenZu();
    const k = W.markantes.krankenhaus;
    const tex = T.schild('+ KRANKENHAUS', '#ff4040', '84px ' + schrift);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1) });
    W.neon.push({ mat: m, basis: new THREE.Color(1, 1, 1), tag: 1, nacht: 2 });
    const p = new THREE.Mesh(new THREE.PlaneGeometry(26, 7), m);
    p.position.set(k.x, k.schildY, k.schildZ + .25);
    szene.add(p);
  }
  zeitAktualisieren(0, true);
  aufstellen();
  laedenBauen();
  karteVorrendern();
  aufgestellt = true;
  ladeStand(1, 'Fertig');
  // ein paar Bilder vorab rendern, damit Shader fertig sind, bevor das Menü erscheint
  for(let i = 0; i < 3; i++){ schritt(1/60); rendern(); await new Promise(r => setTimeout(r, 16)); }
  menueZeigen();
  window.__spielBereit = true;
}

/* ── Fahrzeuge ─────────────────────────────────────────────────── */
const fahrzeuge = [];
const schattenTex = T.kontaktSchatten();
const schattenMat = new THREE.MeshBasicMaterial({ map: schattenTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
function bodenSchatten(g, breite, laenge, y = .04){
  const m = new THREE.Mesh(new THREE.PlaneGeometry(breite, laenge).rotateX(-Math.PI/2), schattenMat);
  m.position.y = y; m.renderOrder = 1; g.add(m); return m;
}
class Fz {
  constructor(art, typ, modell){
    this.art = art; this.typ = typ; this.mod = modell; this.g = modell.g;
    this.x = 0; this.z = 0; this.y = 0; this.h = 0; this.vx = 0; this.vz = 0; this.vf = 0; this.yaw = 0;
    this.lenk = 0; this.ki = null; this.fahrer = null; this.neigung = 0; this.kipp = 0; this.nick = 0;
    if(art === 'auto'){ this.spec = modell.spec; this.L = this.spec.L; this.W = this.spec.W; bodenSchatten(this.g, this.W*1.45, this.L*1.18); }
    if(art === 'boot'){ this.spec = { vmax: 30, acc: 9, griff: 2.4, lenk: 1.25, rueck: 5 }; this.L = 9.4; this.W = 3.1; }
    if(art === 'flug'){ this.L = 11; this.W = 12; }
    if(this.spec && !this.spec.rueck) this.spec.rueck = 12;
    this.boden = art === 'boot' ? W.WASSER_Y - .45 : 0;
    szene.add(this.g);
    fahrzeuge.push(this);
  }
  setze(x, z, h){ this.x = x; this.z = z; this.h = h; this.vx = this.vz = 0; this.y = this.art === 'boot' ? this.boden : W.bodenY(x, z); this.zeige(0); }
  zeige(dt){
    const g = this.g;
    if(this.art === 'auto'){
      const fx = Math.sin(this.h), fz = Math.cos(this.h), o = this.L*.38;
      const yv = W.bodenY(this.x + fx*o, this.z + fz*o), yh = W.bodenY(this.x - fx*o, this.z - fz*o);
      const yz = Math.max(yv, yh, W.bodenY(this.x, this.z));
      this.y = dt ? daempf(this.y, (yv + yh)/2 > yz - .2 ? (yv + yh)/2 : yz, 14, dt) : yz;
      const nick = Math.atan2(yv - yh, o*2);
      g.position.set(this.x, this.y, this.z);
      g.rotation.set(-nick, this.h, 0, 'YXZ');
      const m = this.mod;
      for(const r of m.raeder) r.rotation.x += this.vf/m.spec.rad*dt;
      for(const l of m.lenkraeder) l.rotation.y = -this.lenk*.48;
      this.kipp = dt ? daempf(this.kipp, klemm(this.yaw*this.vf*.003, -.035, .035), 8, dt) : 0;
      m.aufbau.rotation.z = this.kipp;
      m.aufbau.rotation.x = dt ? daempf(m.aufbau.rotation.x, this.nick, 8, dt) : 0;
    } else if(this.art === 'boot'){
      const t = performance.now()/1000;
      const sp = Math.abs(this.vf);
      g.position.set(this.x, this.boden + Math.sin(t*1.7 + this.x*.1)*.12 + Math.min(sp, 25)*.012, this.z);
      g.rotation.set(-Math.min(sp, 22)*.0085 + Math.sin(t*1.3 + this.z*.1)*.025, this.h, Math.sin(t*1.1)*.03 + this.kipp, 'YXZ');
      this.kipp = dt ? daempf(this.kipp, klemm(this.yaw*this.vf*.01, -.12, .12), 4, dt) : 0;
    }
  }
}
function neuesAuto(typ, farbe){ return new Fz('auto', typ, baueAuto(typ, farbe || wahl(LACKE))); }

const _p = { x: 0, z: 0 };
function passt(f, x, z, h, medium){
  const fx = Math.sin(h), fz = Math.cos(h), rx = -fz, rz = fx;
  const l = f.L*.47, b = f.W*.47;
  for(const [a, c] of [[l, b], [l, -b], [-l, b], [-l, -b], [0, b], [0, -b]]){
    if(!medium(x + fx*a + rx*c, z + fz*a + rz*c)) return false;
  }
  return true;
}
function physik(f, st, dt){
  const sp = f.spec;
  const fx = Math.sin(f.h), fz = Math.cos(f.h), rx = -fz, rz = fx;
  let vf = f.vx*fx + f.vz*fz, vr = f.vx*rx + f.vz*rz;
  const alt = vf;
  const g = st.gas;
  const auto = f.art === 'auto';
  if(g > .05){
    if(vf < -.4) vf += (auto ? 14 : 20)*g*dt;
    else vf += sp.acc*g*Math.max(0, 1 - (vf/sp.vmax)**2)*dt;
  } else if(g < -.05){
    if(vf > .4) vf -= (auto ? 14 : 22)*(-g)*dt;
    else { vf -= 8*(-g)*dt; if(vf < -sp.rueck) vf = -sp.rueck; }
  } else {
    const d = (auto ? 3.2 : 1.6)*dt;
    vf = Math.abs(vf) < d ? 0 : vf - Math.sign(vf)*d;
  }
  if(st.hand){ const d = 10*dt; vf = Math.abs(vf) < d ? 0 : vf - Math.sign(vf)*d; }
  // Autos: Lenkung spricht direkt an, Reifen haften (kaum Nachschieben);
  // nur mit Handbremse bricht das Heck aus. Boote bleiben weich.
  const griff = st.hand ? (auto ? 1.6 : 1.3) : sp.griff;
  vr *= Math.exp(-griff*dt);
  f.lenk = daempf(f.lenk, st.lenk, auto ? (st.lenk ? 16 : 20) : 7, dt);
  const sf = klemm(vf/(auto ? 3.5 : 5), -1, 1);
  let yaw = -f.lenk*sp.lenk*sf/(1 + Math.abs(vf)/(auto ? 48 : 30))*(st.hand ? 1.45 : 1);
  // Reifen halten etwa 1,4 g Querbeschleunigung: bei Tempo nicht unrealistisch eng einlenken
  if(auto && !st.hand && Math.abs(vf) > 4){ const max = 13.5/Math.abs(vf); yaw = klemm(yaw, -max, max); }
  f.hAlt = f.h;
  f.h += yaw*dt;
  if(auto && !st.hand){
    // Geschwindigkeit dreht mit der Fahrtrichtung mit, statt geradeaus weiterzurutschen
    const nfx = Math.sin(f.h), nfz = Math.cos(f.h);
    f.vx = nfx*vf - nfz*vr; f.vz = nfz*vf + nfx*vr;
  } else { f.vx = fx*vf + rx*vr; f.vz = fz*vf + rz*vr; }
  f.vf = vf; f.yaw = yaw;
  f.nick = klemm((vf - alt)/Math.max(dt, .001)*-.0035, -.05, .05);
  f.drift = Math.abs(vr);
}
function bewege(f, dt){
  const medium = f.art === 'boot' ? W.schiffbar : W.begehbar;
  const nx = f.x + f.vx*dt, nz = f.z + f.vz*dt;
  let stoss = 0;
  if(passt(f, nx, nz, f.h, medium) || !passt(f, f.x, f.z, f.hAlt ?? f.h, medium)){ f.x = nx; f.z = nz; }
  else if(passt(f, nx, f.z, f.h, medium)){ f.x = nx; stoss = Math.abs(f.vz); f.vz *= -.25; }
  else if(passt(f, f.x, nz, f.h, medium)){ f.z = nz; stoss = Math.abs(f.vx); f.vx *= -.25; }
  else { stoss = Math.hypot(f.vx, f.vz); f.vx *= -.25; f.vz *= -.25; }
  if(f.hAlt !== undefined && !passt(f, f.x, f.z, f.h, medium) && passt(f, f.x, f.z, f.hAlt, medium)) f.h = f.hAlt;
  const fx = Math.sin(f.h), fz = Math.cos(f.h), off = f.L/2 - f.W/2, r = f.W/2 + .05;
  const y0 = f.art === 'boot' ? W.WASSER_Y - 1 : f.y + .1, y1 = y0 + 1.6;
  for(const s of [-1, 0, 1]){
    _p.x = f.x + fx*off*s; _p.z = f.z + fz*off*s;
    const ox = _p.x, oz = _p.z;
    const t = W.kreisRaus(_p, r, y0, y1);
    if(t){
      f.x += _p.x - ox; f.z += _p.z - oz;
      const vn = f.vx*t.nx + f.vz*t.nz;
      if(vn < 0){ f.vx -= t.nx*vn*1.25; f.vz -= t.nz*vn*1.25; stoss = Math.max(stoss, -vn); }
    }
  }
  return stoss;
}
// Fahrzeuge untereinander: drei Kreise je Fahrzeug
function kreise(f, out){
  const fx = Math.sin(f.h), fz = Math.cos(f.h), off = f.L/2 - f.W/2;
  out[0] = f.x - fx*off; out[1] = f.z - fz*off; out[2] = f.x; out[3] = f.z; out[4] = f.x + fx*off; out[5] = f.z + fz*off;
  return out;
}
const _ka = new Float32Array(6), _kb = new Float32Array(6);
function fahrzeugStoesse(){
  const n = fahrzeuge.length;
  for(let i = 0; i < n; i++){
    const a = fahrzeuge[i];
    if(a.art === 'flug' || !a.g.visible) continue;
    for(let j = i + 1; j < n; j++){
      const b = fahrzeuge[j];
      if(b.art !== a.art || !b.g.visible) continue;
      const dx0 = a.x - b.x, dz0 = a.z - b.z;
      if(dx0*dx0 + dz0*dz0 > 100) continue;
      if(Math.abs(a.y - b.y) > 2.5) continue;
      if(a.ki && b.ki && (a.ki.geist > 0 || b.ki.geist > 0)) continue;
      kreise(a, _ka); kreise(b, _kb);
      const rr = (a.W + b.W)/2*.98;
      let best = 0, nx = 0, nz = 0;
      for(let p = 0; p < 6; p += 2) for(let q = 0; q < 6; q += 2){
        const dx = _ka[p] - _kb[q], dz = _ka[p + 1] - _kb[q + 1], d = Math.hypot(dx, dz);
        if(d < rr && rr - d > best){ best = rr - d; nx = d > 1e-4 ? dx/d : 1; nz = d > 1e-4 ? dz/d : 0; }
      }
      if(best <= 0) continue;
      const fa = a.ki && a.ki.kinematisch ? 0 : 1, fb = b.ki && b.ki.kinematisch ? 0 : 1;
      const summe = fa + fb || 1;
      a.x += nx*best*fa/summe; a.z += nz*best*fa/summe;
      b.x -= nx*best*fb/summe; b.z -= nz*best*fb/summe;
      const rv = (a.vx - b.vx)*nx + (a.vz - b.vz)*nz;
      if(rv < 0){
        const imp = -rv*1.3;
        if(fa){ a.vx += nx*imp*fa/summe*(fb ? 1 : 1.6)*.6; a.vz += nz*imp*fa/summe*(fb ? 1 : 1.6)*.6; }
        if(fb){ b.vx -= nx*imp*fb/summe*(fa ? 1 : 1.6)*.6; b.vz -= nz*imp*fb/summe*(fa ? 1 : 1.6)*.6; }
        const wucht = -rv;
        if(a === spieler.fz || b === spieler.fz){
          const anderes = a === spieler.fz ? b : a;
          aufprall(wucht);
          // ein heftiger Stoß reißt Verkehr aus der Spur
          if(anderes.ki && anderes.ki.art === 'verkehr' && wucht > 7){
            anderes.ki = null; anderes.fahrer = 'geflohen';
            const imp2 = wucht*.7;
            anderes.vx += (a === anderes ? nx : -nx)*imp2; anderes.vz += (a === anderes ? nz : -nz)*imp2;
            meldung('Fahrer flieht');
          }
          if(anderes.typ === 'polizei' && anderes.ki && wucht > 6) fahndung(1, 'Polizei gerammt', 2);
        }
      }
    }
  }
}

/* ── Verkehr ───────────────────────────────────────────────────── */
function linie(a, b, spur){
  const A = W.knoten[a], B = W.knoten[b];
  const L = Math.hypot(B.x - A.x, B.z - A.z), dx = (B.x - A.x)/L, dz = (B.z - A.z)/L, rx = -dz, rz = dx;
  return { k: 0, ax: A.x + dx*10 + rx*spur, az: A.z + dz*10 + rz*spur, bx: B.x - dx*10 + rx*spur, bz: B.z - dz*10 + rz*spur, len: L - 20 };
}
function kurve(a, b, c, spur){
  const A = W.knoten[a], B = W.knoten[b], C = W.knoten[c];
  let d1x = B.x - A.x, d1z = B.z - A.z, l1 = Math.hypot(d1x, d1z); d1x /= l1; d1z /= l1;
  let d2x = C.x - B.x, d2z = C.z - B.z, l2 = Math.hypot(d2x, d2z); d2x /= l2; d2z /= l2;
  const r1x = -d1z, r1z = d1x, r2x = -d2z, r2z = d2x;
  const p0x = B.x - d1x*10 + r1x*spur, p0z = B.z - d1z*10 + r1z*spur;
  const p2x = B.x + d2x*10 + r2x*spur, p2z = B.z + d2z*10 + r2z*spur;
  const dot = d1x*d2x + d1z*d2z;
  let p1x, p1z;
  if(dot > .9){ p1x = (p0x + p2x)/2; p1z = (p0z + p2z)/2; }
  else if(dot < -.9){ p1x = B.x + d1x*9; p1z = B.z + d1z*9; }
  else { p1x = B.x + r1x*spur + r2x*spur; p1z = B.z + r1z*spur + r2z*spur; }
  const st = { k: 1, p0x, p0z, p1x, p1z, p2x, p2z, len: 0 };
  let len = 0, px = p0x, pz = p0z;
  for(let i = 1; i <= 10; i++){ const q = auswerten(st, i/10, {}); len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
  st.len = Math.max(len, 1);
  st.eng = dot < .5;
  return st;
}
function auswerten(st, t, o){
  if(st.k === 0){ o.x = misch(st.ax, st.bx, t); o.z = misch(st.az, st.bz, t); o.dx = st.bx - st.ax; o.dz = st.bz - st.az; }
  else {
    const u = 1 - t;
    o.x = u*u*st.p0x + 2*u*t*st.p1x + t*t*st.p2x; o.z = u*u*st.p0z + 2*u*t*st.p1z + t*t*st.p2z;
    o.dx = 2*u*(st.p1x - st.p0x) + 2*t*(st.p2x - st.p1x); o.dz = 2*u*(st.p1z - st.p0z) + 2*t*(st.p2z - st.p1z);
  }
  return o;
}
const _o = {};
class Verkehr {
  constructor(f){ this.f = f; this.art = 'verkehr'; this.kinematisch = true; this.spur = Z() < .5 ? 2.2 : 5.6; this.v = 8; this.warte = 0; this.geist = 0; this.wunsch = R(11, 15); this.hup = 0; }
  aufKante(a, b, anteil){
    this.von = a; this.nach = b; this.st = linie(a, b, this.spur); this.s = anteil*this.st.len; this.dreht = false;
    this.platziere();
  }
  weiter(){
    if(!this.dreht){
      const B = W.knoten[this.nach];
      let opt = B.nb.filter(n => n !== this.von);
      if(!opt.length) opt = [this.von];
      this.folge = opt[Math.floor(Z()*opt.length)];
      this.st = kurve(this.von, this.nach, this.folge, this.spur); this.dreht = true;
    } else {
      this.von = this.nach; this.nach = this.folge;
      this.st = linie(this.von, this.nach, this.spur); this.dreht = false;
    }
  }
  platziere(){
    auswerten(this.st, klemm(this.s/this.st.len, 0, 1), _o);
    const f = this.f;
    f.x = _o.x; f.z = _o.z; f.h = Math.atan2(_o.dx, _o.dz);
  }
  update(dt){
    const f = this.f;
    const fx = Math.sin(f.h), fz = Math.cos(f.h), rx = -fz, rz = fx;
    let ziel = this.dreht && this.st.eng ? 7 : this.wunsch;
    if(!this.dreht){
      const A = W.knoten[this.von], B = W.knoten[this.nach];
      const achse = Math.abs(B.x - A.x) > Math.abs(B.z - A.z) ? 'x' : 'z';
      const licht = W.ampelZustand(this.nach, achse, uhr);
      const rest = this.st.len - this.s;
      // bei Rot halten; bei Gelb nur, wenn noch genug Platz zum Bremsen ist
      if(licht === 'rot' || (licht === 'gelb' && rest > 12)) ziel = Math.min(ziel, Math.max(0, (rest - 1.5)*1.1));
    }
    // Vorausschau
    const pruefe = (x, z, breite) => {
      const dx = x - f.x, dz = z - f.z;
      const vo = dx*fx + dz*fz;
      if(vo < 0 || vo > 18) return;
      if(Math.abs(dx*rx + dz*rz) > breite) return;
      ziel = Math.min(ziel, Math.max(0, (vo - 6.5)*1.3));
    };
    for(const o of fahrzeuge){
      if(o === f || o.art !== 'auto' || !o.g.visible) continue;
      if(this.geist > 0 && o.ki && o.ki.art === 'verkehr') continue;
      if(Math.abs(o.x - f.x) > 20 || Math.abs(o.z - f.z) > 20) continue;
      pruefe(o.x, o.z, 2.5);
    }
    if(spieler.modus === 'fuss') pruefe(spieler.x, spieler.z, 2);
    for(const p of leute) if(p.zustand !== 'weg' && Math.abs(p.x - f.x) < 18 && Math.abs(p.z - f.z) < 18) pruefe(p.x, p.z, 1.6);
    const a = ziel > this.v ? 4.5 : 11;
    this.v = this.v + klemm(ziel - this.v, -a*dt, a*dt);
    if(this.v < .4 && ziel < .5){
      this.warte += dt;
      const nahSpieler = Math.hypot(spieler.x - f.x, spieler.z - f.z) < 25;
      if(this.warte > 2 && nahSpieler && (this.hup -= dt) < 0){ this.hup = R(3, 6); ton.hupe(.4); }
      if(this.warte > 5){ this.geist = 2.5; this.warte = 0; }
    } else this.warte = Math.max(0, this.warte - dt);
    this.geist -= dt;
    this.s += this.v*dt;
    let n = 0;
    while(this.s > this.st.len && n++ < 4){ this.s -= this.st.len; this.weiter(); }
    this.platziere();
    f.vf = this.v; f.vx = Math.sin(f.h)*this.v; f.vz = Math.cos(f.h)*this.v;
    f.lenk = this.dreht ? klemm(-winkel(Math.atan2(_o.dx, _o.dz) - f.h)*4, -1, 1) : 0;
    f.yaw = 0; f.nick = 0;
  }
}
function zufallsKante(nahX, nahZ, min, max){
  for(let i = 0; i < 40; i++){
    const k = W.kanten[Math.floor(Z()*W.kanten.length)];
    const A = W.knoten[k.a], B = W.knoten[k.b];
    const t = R(.15, .85);
    const x = misch(A.x, B.x, t), z = misch(A.z, B.z, t);
    const d = Math.hypot(x - nahX, z - nahZ);
    if(d < min || d > max) continue;
    if(fahrzeuge.some(f => f.art === 'auto' && f.g.visible && Math.abs(f.x - x) < 16 && Math.abs(f.z - z) < 16)) continue;
    return Z() < .5 ? [k.a, k.b, t] : [k.b, k.a, 1 - t];
  }
  return null;
}
const verkehr = [];
function verkehrEinsetzen(f, min, max){
  const k = zufallsKante(spieler.x, spieler.z, min, max);
  if(!k) return false;
  if(!f.ki || f.ki.art !== 'verkehr') f.ki = new Verkehr(f);
  f.fahrer = 'npc';
  f.ki.aufKante(k[0], k[1], k[2]);
  f.g.visible = true;
  f.zeige(0);
  return true;
}

/* ── Polizei ───────────────────────────────────────────────────── */
const streifen = [];
class Streife {
  constructor(f){ this.f = f; this.art = 'polizei'; this.kinematisch = false; this.weg = null; this.wegZeit = 0; this.rueck = 0; this.haeng = 0; this.fern = 0; }
  update(dt){
    const f = this.f;
    const zx = spieler.px, zz = spieler.pz;
    const d = Math.hypot(zx - f.x, zz - f.z);
    let tx = zx, tz = zz;
    const st = { gas: 1, lenk: 0, hand: false };
    if(sterne === 0){
      st.gas = .35;
    } else if(d < 75 && sicht(f.x, f.z, zx, zz)){
      tx = zx + spieler.vx*.5; tz = zz + spieler.vz*.5;
    } else {
      this.wegZeit -= dt;
      if(this.wegZeit < 0 || !this.weg){
        this.wegZeit = 1.3;
        this.weg = W.weg(W.naechsterKnoten(f.x, f.z), W.naechsterKnoten(zx, zz));
      }
      if(this.weg && this.weg.length){
        while(this.weg.length > 1){
          const k = W.knoten[this.weg[0]];
          if(Math.hypot(k.x - f.x, k.z - f.z) < 16) this.weg.shift(); else break;
        }
        const k = W.knoten[this.weg[0]];
        tx = k.x; tz = k.z;
      }
    }
    if(sterne > 0){
      const soll = Math.atan2(tx - f.x, tz - f.z);
      const diff = winkel(soll - f.h);
      st.lenk = klemm(-diff*2.4, -1, 1);
      if(Math.abs(diff) > 1.5 && f.vf > 9) st.gas = -.6;
      if(d < 10 && spieler.tempo < 4) st.gas = klemm((d - 5.5)/5, -.6, .5);
      // Spieler zu Fuß: abbremsen und daneben halten statt hineinzufahren
      if(spieler.modus === 'fuss'){
        if(d < 26) st.gas = f.vf > 7 ? -1 : d > 12 ? .35 : f.vf > 1 ? -1 : 0;
        if(d < 14) st.lenk = klemm(st.lenk + (winkel(soll - f.h) > 0 ? -.8 : .8), -1, 1);
      }
    }
    if(this.rueck > 0){ this.rueck -= dt; st.gas = -1; st.lenk = -st.lenk || .8; }
    else if(st.gas > .3 && Math.abs(f.vf) < 1.3){ this.haeng += dt; if(this.haeng > 1.4){ this.haeng = 0; this.rueck = 1.1; } }
    else this.haeng = 0;
    physik(f, st, dt);
    bewege(f, dt);
    if(d > 420) this.fern += dt; else this.fern = 0;
  }
}
function sicht(ax, az, bx, bz){
  const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d/7);
  for(let i = 1; i < n; i++){
    const t = i/n;
    if(W.inHindernis(misch(ax, bx, t), 1.2, misch(az, bz, t))) return false;
  }
  return true;
}
let sterne = 0, sternZeit = 0, festnahme = 0;
// n: Sterne dazu; ohneZeugen: höchstens so viele, wenn keine Streife zusieht
let fahndungSperre = 0;
function polizeiSieht(){
  return streifen.some(s => s.f.g.visible && Math.hypot(s.f.x - spieler.px, s.f.z - spieler.pz) < 90 && sicht(s.f.x, s.f.z, spieler.px, spieler.pz));
}
function fahndung(n, grund, ohneZeugen = 5){
  if(uhr < fahndungSperre && n < 2) return;
  fahndungSperre = uhr + 4;
  const alt = sterne;
  const grenze = polizeiSieht() ? 5 : Math.max(alt, ohneZeugen);
  sterne = klemm(Math.min(sterne + n, grenze), 0, 5);
  sternZeit = 0;
  if(sterne > alt){ meldung(grund || 'Fahndung!'); hudSterne(); }
}
function polizeiNachsetzen(){
  const soll = sterne === 0 ? 0 : Math.min(5, sterne + 1);
  const aktiv = streifen.filter(s => s.f.g.visible);
  if(aktiv.length >= soll) return;
  const k = zufallsKante(spieler.px, spieler.pz, 110, 220);
  if(!k) return;
  let f = streifen.find(s => !s.f.g.visible)?.f;
  if(!f){ f = neuesAuto('polizei'); f.ki = new Streife(f); streifen.push(f.ki); }
  const A = W.knoten[k[0]], B = W.knoten[k[1]];
  const x = misch(A.x, B.x, k[2]), z = misch(A.z, B.z, k[2]);
  f.setze(x, z, Math.atan2(B.x - A.x, B.z - A.z));
  f.g.visible = true; f.fahrer = 'polizei'; f.schaden = 0; f.ki.schussT = 2;
  f.ki.weg = null; f.ki.fern = 0;
}

/* ── Fußgänger ─────────────────────────────────────────────────── */
const leute = [];
class Person {
  constructor(){ this.m = baueFigur(leute.length + 1); bodenSchatten(this.m.g, 1.1, 1.1); szene.add(this.m.g); this.m.g.visible = false; this.zustand = 'weg'; this.x = 0; this.z = 0; this.y = 0; }
  setzeAuf(b){
    this.b = b; this.rand = 2.4;
    this.w = b.x1 - b.x0 - 2*this.rand; this.d = b.z1 - b.z0 - 2*this.rand;
    this.U = 2*(this.w + this.d);
    this.s = Z()*this.U; this.dir = Z() < .5 ? 1 : -1; this.tempo = R(1.1, 1.6);
    this.zustand = 'geht'; this.m.g.visible = true; this.m.g.rotation.set(0, 0, 0);
    this.leben = 100; this.wut = 0;
    // manche tragen eine Waffe, manche boxen zurück, die meisten rennen weg
    this.bewaffnet = Z() < .17 ? wahl(['pistole', 'pistole', 'revolver', 'uzi', 'schrot']) : null;
    this.kaempfer = !this.bewaffnet && Z() < .4;
    if(this.wm){ this.wm.visible = false; }
    this.punkt(this.s, this); this.y = W.bodenY(this.x, this.z);
  }
  punkt(s, o){
    s = ((s % this.U) + this.U) % this.U;
    const b = this.b, r = this.rand;
    if(s < this.w){ o.x = b.x0 + r + s; o.z = b.z0 + r; }
    else if(s < this.w + this.d){ o.x = b.x1 - r; o.z = b.z0 + r + (s - this.w); }
    else if(s < 2*this.w + this.d){ o.x = b.x1 - r - (s - this.w - this.d); o.z = b.z1 - r; }
    else { o.x = b.x0 + r; o.z = b.z1 - r - (s - 2*this.w - this.d); }
    return o;
  }
  update(dt){
    const g = this.m.g;
    if(this.zustand === 'kampf') return this.kampf(dt);
    if(this.zustand === 'steht'){
      // steht herum, schaut sich um, geht irgendwann weiter
      animiereFigur(this.m, 0, dt);
      if(Math.random() < dt*.15) this.blick = Math.random()*Math.PI*2;
      if(this.blick !== undefined) g.rotation.y = daempfW(g.rotation.y, this.blick, 2, dt);
      if((this.stehen -= dt) < 0) this.zustand = 'geht';
      g.position.set(this.x, this.y, this.z);
      return;
    }
    if(this.zustand === 'geht' || this.zustand === 'rennt'){
      const v = this.zustand === 'rennt' ? 4.6 : this.tempo;
      this.s += this.dir*v*dt;
      const ziel = this.punkt(this.s, _q);
      const dx = ziel.x - this.x, dz = ziel.z - this.z, l = Math.hypot(dx, dz);
      if(l > .01){
        const k = Math.min(1, v*dt*1.6/l);
        this.x += dx*k; this.z += dz*k;
        g.rotation.y = daempfW(g.rotation.y, Math.atan2(dx, dz), 8, dt);
      }
      this.y = daempf(this.y, W.bodenY(this.x, this.z), 10, dt);
      animiereFigur(this.m, v, dt);
      if(this.zustand === 'rennt' && (this.flucht -= dt) < 0) this.zustand = 'geht';
    } else if(this.zustand === 'tot'){
      g.rotation.x = daempf(g.rotation.x, -Math.PI/2, 8, dt);
      this.y = daempf(this.y, W.bodenY(this.x, this.z) + .1, 8, dt);
      if((this.liegen -= dt) < 0){ this.zustand = 'weg'; g.visible = false; g.rotation.x = 0; }
    } else if(this.zustand === 'liegt'){
      this.vy -= 18*dt;
      this.x += this.vx*dt; this.z += this.vz*dt; this.y += this.vy*dt;
      const boden = W.bodenY(this.x, this.z);
      if(this.y < boden){ this.y = boden; this.vy = 0; this.vx *= .8; this.vz *= .8; }
      if(!W.begehbar(this.x, this.z)){ this.x -= this.vx*dt; this.z -= this.vz*dt; this.vx = this.vz = 0; }
      g.rotation.x = daempf(g.rotation.x, -Math.PI/2, 6, dt);
      if((this.liegen -= dt) < 0){ this.zustand = 'rennt'; this.flucht = 7; g.rotation.x = 0; }
    }
    g.position.set(this.x, this.y, this.z);
  }
  erschrecken(){ if(this.zustand === 'geht' || this.zustand === 'steht'){ this.zustand = 'rennt'; this.flucht = 8; this.dir = -this.dir; } }
  getroffen(dmg, wie){
    if(this.zustand === 'tot' || this.zustand === 'weg') return;
    this.leben -= dmg;
    ton.dumpf(.4);
    if(this.leben <= 0) return this.sterben(wie);
    if(this.bewaffnet || this.kaempfer){ this.zustand = 'kampf'; this.schussT = .8; this.schlagT = .6; }
    else { this.zustand = 'rennt'; this.flucht = 10; }
    if(wie === 'faust') fahndung(1, 'Schlägerei', 0);
  }
  sterben(wie){
    this.zustand = 'tot'; this.liegen = 25;
    if(this.wm) this.wm.visible = false;
    fahndung(1, wie === 'faust' ? 'Passant niedergeschlagen' : 'Passant erschossen', wie === 'faust' ? 1 : 2);
    // Beute: Waffe, Geld oder Munition
    const x = this.x + (Math.random() - .5), z = this.z + (Math.random() - .5);
    if(this.bewaffnet) beuteFallen(x, z, 'waffe', this.bewaffnet, WAFFEN[this.bewaffnet].mag*2);
    else if(Math.random() < .6) beuteFallen(x, z, 'geld', null, 20 + Math.floor(Math.random()*6)*20);
    else {
      const da = REIHE.filter(t => inventar[t] && !WAFFEN[t].nah);
      if(da.length){ const t = wahl(da); beuteFallen(x, z, 'munition', t, Math.ceil(WAFFEN[t].mag*.75)); }
      else beuteFallen(x, z, 'geld', null, 40);
    }
  }
  kampf(dt){
    const g = this.m.g;
    const dx = spieler.px - this.x, dz = spieler.pz - this.z, d = Math.hypot(dx, dz);
    if(spieler.modus === 'tot' || d > 70){ this.zustand = 'rennt'; this.flucht = 6; if(this.wm) this.wm.visible = false; return; }
    const blick = Math.atan2(dx, dz);
    g.rotation.y = daempfW(g.rotation.y, blick, 10, dt);
    let v = 0;
    if(this.bewaffnet){
      const w = WAFFEN[this.bewaffnet];
      if(d > Math.min(18, w.weite*.5)) v = 3.6; else if(d < 6) v = -2;
      if(!this.wm){ this.m.hand = this.m.hand || handKnochen(this.m); this.wm = baueWaffe(this.bewaffnet); szene.add(this.wm); }
      this.wm.visible = true;
      waffeInHand(this.m, this.wm, g.rotation.y, 0);
      this.schussT -= dt;
      if(this.schussT <= 0 && d < w.weite*.7 && spieler.modus !== 'fall'){
        this.schussT = Math.max(.35, w.rate*3) + Math.random()*.6;
        if(sicht(this.x, this.z, spieler.px, spieler.pz)){
          _a.copy(this.wm.position).addScaledVector(_r.set(Math.sin(blick), 0, Math.cos(blick)), this.wm.userData.laenge || .3);
          let treffer = 0;
          for(let k = 0; k < w.kugeln; k++) if(Math.random() < (.32 - d*.004 - w.streu)*(spieler.fz ? .6 : 1)) treffer++;
          _t.set(spieler.px + (treffer ? 0 : (Math.random() - .5)*3), spieler.y + 1.2, spieler.pz + (treffer ? 0 : (Math.random() - .5)*3));
          schussLinie(_a, _t); ton.schuss(true, w.ton);
          if(treffer){ if(spieler.fz) spieler.fz.schaden = (spieler.fz.schaden || 0) + w.dmg*.2*treffer; else schaden(w.dmg*.28*treffer, 'ERSCHOSSEN'); }
        }
      }
    } else {
      if(d > 1.3) v = 4.2;
      this.schlagT -= dt;
      if(d < 1.6 && this.schlagT <= 0 && !spieler.fz){
        this.schlagT = .9 + Math.random()*.4; this.m.koerper.rotation.x = .35;
        schaden(7, 'VERPRÜGELT'); ton.dumpf(.6); kam.wackel = Math.min(1, kam.wackel + .2);
      }
      this.m.koerper.rotation.x = daempf(this.m.koerper.rotation.x, 0, 6, dt);
    }
    if(v){
      const nx = this.x + Math.sin(blick)*v*dt, nz = this.z + Math.cos(blick)*v*dt;
      if(W.begehbar(nx, nz)){ const p = { x: nx, z: nz }; W.kreisRaus(p, .35, this.y + .1, this.y + 1.8); this.x = p.x; this.z = p.z; }
    }
    this.y = daempf(this.y, W.bodenY(this.x, this.z), 10, dt);
    animiereFigur(this.m, Math.abs(v), dt);
    g.position.set(this.x, this.y, this.z);
  }
  umfahren(f, tempo){
    if(this.zustand === 'liegt') return;
    this.zustand = 'liegt'; this.liegen = 3.2;
    const a = Math.atan2(this.x - f.x, this.z - f.z);
    this.vx = Math.sin(a)*tempo*.45 + f.vx*.35; this.vz = Math.cos(a)*tempo*.45 + f.vz*.35; this.vy = 2.5 + tempo*.12;
    ton.dumpf(.5);
  }
}
const _q = {};
const gehBloecke = () => {
  const l = W.bloecke.filter(b => b.art === 'stadt' || b.art === 'hotel' || b.art === 'promenade');
  // Strand: lange schmale Wege im Sand, mehrfach, damit dort viel los ist
  for(let z = -500; z < 500; z += 125) for(let k = 0; k < 2; k++) l.push({ x0: 538, x1: 566, z0: z, z1: z + 110, art: 'strand', y: .05 });
  return l;
};
let gehwegBloecke = [];
function personEinsetzen(p, min, max){
  for(let i = 0; i < 30; i++){
    const b = gehwegBloecke[Math.floor(Z()*gehwegBloecke.length)];
    const d = Math.hypot((b.x0 + b.x1)/2 - spieler.x, (b.z0 + b.z1)/2 - spieler.z);
    if(d < min || d > max) continue;
    p.setzeAuf(b);
    if(Z() < .22){ p.zustand = 'steht'; p.stehen = R(12, 40); }
    return;
  }
}

/* ── Spieler ───────────────────────────────────────────────────── */
const spieler = {
  x: 120, y: .15, z: 34, vy: 0, h: 0, vx: 0, vz: 0, tempo: 0, modus: 'fuss', fz: null,
  px: 120, pz: 34, boden: true, liegt: 0,
  m: null,
};
let geld = speicherLesen('autostehlen.geld', 500);
if(typeof geld !== 'number' || !isFinite(geld)) geld = 500;
let flieger, scheinwerfer;
const umgebung = {};

function aufstellen(){
  spieler.m = baueFigur();
  bodenSchatten(spieler.m.g, 1.1, 1.1);
  spieler.m.hand = handKnochen(spieler.m);
  szene.add(spieler.m.g);
  gehwegBloecke = gehBloecke();
  // Sportwagen gleich neben dem Start
  const start = neuesAuto('sport'); start.setze(112, 50, 0); start.fahrer = null;
  // geparkte Autos
  // höchstens 36 abgestellte Autos, die Polizeiwagen vor der Wache immer
  const plaetze = W.parkplaetze.filter(p => p.polizei).concat(W.parkplaetze.filter(p => !p.polizei).sort(() => Z() - .5).slice(0, 34));
  for(const p of plaetze){
    const f = neuesAuto(p.polizei ? 'polizei' : wahl(['limo', 'limo', 'e30', 'e30', 'taxi', 'sport']));
    f.setze(p.x, p.z, p.h); f.parkt = true;
  }
  // Boote am Steg
  for(const [x, z, c] of [[174, 24.4, '#ff4fa0'], [174, 75.6, '#2fd2ff'], [178, 84.4, '#ffd24a']]){
    const b = new Fz('boot', 'boot', baueBoot(c)); b.setze(x, z, Math.PI/2);
  }
  // Flugzeug am Flughafen
  const fl = baueFlugzeug(false);
  flieger = new Fz('flug', 'flug', fl);
  flieger.flug = { pitch: 0, roll: 0, tempo: 0, schub: 0, amBoden: true, vy: 0 };
  flugzeugZuruck();
  // Verkehr
  for(let i = 0; i < Q.verkehr; i++){
    const f = neuesAuto(wahl(['limo', 'limo', 'limo', 'e30', 'e30', 'e30', 'taxi', 'sport']));
    f.g.visible = false;
    if(!verkehrEinsetzen(f, 25, 320)) f.g.visible = false;
    verkehr.push(f);
  }
  // Fußgänger
  for(let i = 0; i < Q.leute; i++){ const p = new Person(); personEinsetzen(p, 0, 200); leute.push(p); }
  // Scheinwerfer für das eigene Auto
  scheinwerfer = new THREE.SpotLight(0xfff1d6, 0, 80, .5, .65, 1.4);
  scheinwerfer.castShadow = false;
  szene.add(scheinwerfer, scheinwerfer.target);
  // Hintergrundleben
  const lf = baueFlugzeug(true); szene.add(lf.g); umgebung.flieger = lf;
  const hs = baueHubschrauber(); szene.add(hs.g); umgebung.heli = hs;
  umgebung.boote = [];
  for(let i = 0; i < 4; i++){
    const b = baueBoot(wahl(['#ff4fa0', '#2fd2ff', '#ffffff', '#ffd24a', '#7cf2b0']));
    szene.add(b.g);
    const bucht = i < 2;
    umgebung.boote.push({ m: b, bucht, t: R(0, 6.28), v: bucht ? .045 : .02, cx: bucht ? 275 : 760, cz: bucht ? 40 : R(-300, 300), rx: bucht ? 62 : 120, rz: bucht ? 180 : 260 });
  }
  geldScheine(); jobsAufstellen(); moewenBauen(); werbungBauen();
  spielerZeigen();
}
function flugzeugZuruck(){
  flieger.setze(W.markantes.flugzeug.x, W.markantes.flugzeug.z, Math.PI/2);
  flieger.y = 1.44; flieger.vx = flieger.vz = 0;
  Object.assign(flieger.flug, { pitch: 0, roll: 0, tempo: 0, schub: 0, amBoden: true, vy: 0 });
  flieger.g.visible = true;
  flieger.g.position.set(flieger.x, flieger.y, flieger.z);
  flieger.g.rotation.set(0, flieger.h, 0, 'YXZ');
}
function spielerZeigen(){
  const g = spieler.m.g;
  g.visible = spieler.modus === 'fuss';
  g.position.set(spieler.x, spieler.y, spieler.z);
  g.rotation.y = spieler.h;
}

/* ── Geld und Aufträge ─────────────────────────────────────────── */
const scheine = [];
let scheinMesh, scheinRing;
function geldScheine(){
  const n = 40;
  const mat = new THREE.MeshStandardMaterial({ color: 0x5fd88a, emissive: 0x2aff8a, emissiveIntensity: .6, roughness: .4 });
  scheinMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(.75, .3, .4), mat, n);
  const rmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(.4, 2.2, 1), map: T.ring(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  scheinRing = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6, 2.6).rotateX(-Math.PI/2), rmat, n);
  szene.add(scheinMesh, scheinRing);
  const zz = T.mulberry32(77);
  for(let i = 0; i < n; i++){
    const b = gehwegBloecke[Math.floor(zz()*gehwegBloecke.length)];
    const seite = Math.floor(zz()*4), t = zz();
    let x, z;
    if(seite === 0){ x = misch(b.x0 + 2, b.x1 - 2, t); z = b.z0 + 1.6; }
    else if(seite === 1){ x = misch(b.x0 + 2, b.x1 - 2, t); z = b.z1 - 1.6; }
    else if(seite === 2){ x = b.x0 + 1.6; z = misch(b.z0 + 2, b.z1 - 2, t); }
    else { x = b.x1 - 1.6; z = misch(b.z0 + 2, b.z1 - 2, t); }
    scheine.push({ x, z, y: W.bodenY(x, z), wert: 50 + Math.floor(zz()*5)*50, weg: 0 });
  }
}
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _s3 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _e3 = new THREE.Euler();
function scheineUpdate(dt, t){
  scheine.forEach((s, i) => {
    if(s.weg > 0) s.weg -= dt;
    const sichtbar = s.weg <= 0;
    _e3.set(0, t*2 + i, 0); _q4.setFromEuler(_e3);
    _s3.setScalar(sichtbar ? 1 : 0);
    _v3.set(s.x, s.y + .9 + Math.sin(t*3 + i)*.15, s.z);
    _m4.compose(_v3, _q4, _s3); scheinMesh.setMatrixAt(i, _m4);
    _v3.set(s.x, s.y + .06, s.z); _q4.identity(); _s3.setScalar(sichtbar ? 1 + Math.sin(t*4 + i)*.12 : 0);
    _m4.compose(_v3, _q4, _s3); scheinRing.setMatrixAt(i, _m4);
    if(sichtbar && Math.abs(s.x - spieler.px) < 2.4 && Math.abs(s.z - spieler.pz) < 2.4 && spieler.modus !== 'flug'){
      s.weg = 150; geldDazu(s.wert, 'Geld gefunden'); ton.muenze();
    }
  });
  scheinMesh.instanceMatrix.needsUpdate = true; scheinRing.instanceMatrix.needsUpdate = true;
}
function geldDazu(n, grund){
  geld = Math.max(0, geld + n);
  speicherSchreiben('autostehlen.geld', geld);
  hudGeld(n);
  if(grund) meldung((n >= 0 ? '+' : '−') + '$' + Math.abs(n) + '  ' + grund);
}

const JOBS = [[-96, -96], [-384, 288], [448, 96], [-192, -480], [96, 384], [-480, 480], [528, -384]].map(([x, z]) => ({ x: x + 11.5, z: z + 11.5 }));
let auftrag = null;
const strahlTex = T.strahl();
function strahl(farbe, r, h){
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24, 1, true).translate(0, h/2, 0),
    new THREE.MeshBasicMaterial({ color: farbe, map: strahlTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.renderOrder = 3; szene.add(m); return m;
}
const jobStrahlen = [];
let zielStrahl;
function jobsAufstellen(){
  for(const j of JOBS){ const s = strahl(new THREE.Color(1.6, 1.1, .2), 1.6, 22); s.position.set(j.x, W.bodenY(j.x, j.z), j.z); jobStrahlen.push(s); }
  zielStrahl = strahl(new THREE.Color(2, .4, 1.4), 5, 160); zielStrahl.visible = false;
}
function auftragStarten(j){
  // Ziel: eine Kreuzung 350–900 m entfernt
  let ziel = null;
  for(let i = 0; i < 60 && !ziel; i++){
    const k = W.knoten[Math.floor(Z()*W.knoten.length)];
    const d = Math.hypot(k.x - j.x, k.z - j.z);
    if(d > 350 && d < 900) ziel = k;
  }
  if(!ziel) ziel = W.knoten[0];
  const d = Math.hypot(ziel.x - j.x, ziel.z - j.z);
  const ORTE = ['zur Arena', 'zum Hafen', 'an die Strandbar', 'zum Juwelier', 'ins Motel', 'zur Werkstatt', 'zum Nachtclub', 'zur Tankstelle'];
  const WAREN = ['ein Paket', 'eine Sporttasche', 'einen Koffer', 'eine Kiste Zigarren', 'ein Bild', 'einen Umschlag'];
  auftrag = { ziel, zeit: Math.round(d/13 + 30), lohn: Math.round((180 + d*.75)/10)*10, text: 'Bring ' + wahl(WAREN) + ' ' + wahl(ORTE) + '.', start: j };
  zielStrahl.position.set(ziel.x, 0, ziel.z); zielStrahl.visible = true;
  jobStrahlen.forEach(s => s.visible = false);
  ton.muenze();
  grossText('AUFTRAG', auftrag.text, 2.6);
  hudAuftrag();
}
function auftragEnde(ok){
  if(ok){ geldDazu(auftrag.lohn, 'Auftrag erledigt'); grossText('ERLEDIGT', '+$' + auftrag.lohn, 2.6); ton.erfolg(); }
  else grossText('ZU SPÄT', 'Der Auftrag ist geplatzt.', 2.6);
  auftrag = null; zielStrahl.visible = false;
  jobStrahlen.forEach(s => s.visible = true);
  jobPause = 4;
  hudAuftrag();
}
let jobPause = 0;
function auftraegeUpdate(dt){
  jobPause -= dt;
  if(auftrag){
    auftrag.zeit -= dt;
    if(Math.hypot(auftrag.ziel.x - spieler.px, auftrag.ziel.z - spieler.pz) < 12){ auftragEnde(true); return; }
    if(auftrag.zeit <= 0){ auftragEnde(false); return; }
    $('auftragZeit').textContent = Math.max(0, Math.ceil(auftrag.zeit)) + ' s';
  } else if(jobPause < 0 && spieler.modus !== 'flug'){
    for(const j of JOBS) if(Math.hypot(j.x - spieler.px, j.z - spieler.pz) < 4.5){ auftragStarten(j); break; }
  }
}

/* ── Eingabe ───────────────────────────────────────────────────── */
const tasten = new Set();
const gedrueckt = new Set();
addEventListener('keydown', e => {
  if(e.repeat) return;
  const k = e.code;
  tasten.add(k); gedrueckt.add(k);
  if(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(k) && laeuft) e.preventDefault();
  if(ladenOffen && (k === 'Escape' || k === 'KeyE' || k === 'Backspace')){ ladenZu(); gedrueckt.clear(); return; }
  if((k === 'Escape' || k === 'KeyP') && laeuft && ansicht === 'spiel' && !(pausiert && tafelOffen)) pauseUmschalten();
  if(k === 'KeyM' && laeuft && !pausiert && ansicht === 'spiel') karteUmschalten();
  if(laeuft && !pausiert && ansicht === 'spiel'){
    if(k === 'Tab'){ e.preventDefault(); radAuf(); }
    const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(k);
    if(n >= 0) waffeWaehlen(REIHE[n]);
    if(k === 'KeyR' && !WAFFEN[aktiv].nah && ladenT <= 0 && inventar[aktiv].mag < WAFFEN[aktiv].mag && inventar[aktiv].vorrat > 0){ ladenT = WAFFEN[aktiv].laden; hudWaffe(); }
  }
});
/* Zoom-Schutz: die Seite soll sich nie vergrößern, egal ob Finger, Mausrad oder Tastatur */
for(const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', e => { if(e.touches.length > 1 || (e.scale !== undefined && e.scale !== 1)) e.preventDefault(); }, { passive: false });
let letzterTipp = 0;
document.addEventListener('touchend', e => { const t = Date.now(); if(t - letzterTipp < 320 && !e.target.closest('input')) e.preventDefault(); letzterTipp = t; }, { passive: false });
document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
addEventListener('wheel', e => { if(e.ctrlKey || e.metaKey) e.preventDefault(); }, { passive: false });
addEventListener('keydown', e => { if((e.ctrlKey || e.metaKey) && ['Equal', 'Minus', 'NumpadAdd', 'NumpadSubtract', 'Digit0', 'Numpad0', 'BracketRight', 'Slash'].includes(e.code)) e.preventDefault(); }, { capture: true });
addEventListener('keyup', e => { tasten.delete(e.code); if(e.code === 'Tab') radZu(); });
addEventListener('blur', () => tasten.clear());
const kam = { yaw: Math.PI*.05, pitch: .3, dist: 6.5, hand: -9, zoom: 1, dx: 0, dy: 0, wackel: 0 };
const leinwandEl = renderer.domElement;
let mausUnten = false;
leinwandEl.addEventListener('mousedown', e => {
  if(!laeuft || pausiert || TOUCH) return;
  mausUnten = true;
  if(document.pointerLockElement === leinwandEl && e.button === 0){ schussGewollt = true; return; }
  if(document.pointerLockElement !== leinwandEl){ try { const p = leinwandEl.requestPointerLock(); if(p && p.catch) p.catch(() => {}); } catch(_){} }
});
addEventListener('mouseup', () => mausUnten = false);
addEventListener('mousemove', e => {
  if(!laeuft || pausiert || TOUCH) return;
  if(radOffen){ radBewegen(e.movementX || 0, e.movementY || 0); return; }
  if(document.pointerLockElement === leinwandEl || mausUnten){ kam.dx += e.movementX || 0; kam.dy += e.movementY || 0; }
});
leinwandEl.addEventListener('wheel', e => { kam.zoom = klemm(kam.zoom*(e.deltaY > 0 ? 1.1 : .9), .6, 2.2); e.preventDefault(); }, { passive: false });

// Touch: Stick links, Kamera auf der freien Fläche, Knöpfe rechts
const stick = { id: null, x: 0, y: 0, ax: 0, ay: 0 };
const blick = { id: null, x: 0, y: 0 };
const knopf = { aktion: false, sprung: false, sprint: false };
let schussGewollt = false;
if(TOUCH){
  const zone = $('stickZone'), griff = $('stickGriff');
  zone.addEventListener('pointerdown', e => {
    stick.id = e.pointerId; stick.x = e.clientX; stick.y = e.clientY;
    try { zone.setPointerCapture(e.pointerId); } catch(_){}
    $('stick').style.left = (e.clientX - 60) + 'px'; $('stick').style.top = (e.clientY - 60) + 'px';
    $('stick').classList.add('an');
  });
  zone.addEventListener('pointermove', e => {
    if(e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.x, dy = e.clientY - stick.y;
    const l = Math.hypot(dx, dy), m = 50;
    if(l > m){ dx = dx/l*m; dy = dy/l*m; }
    stick.ax = dx/m; stick.ay = -dy/m;
    griff.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const stickLos = e => { if(e.pointerId !== stick.id) return; stick.id = null; stick.ax = stick.ay = 0; griff.style.transform = ''; $('stick').classList.remove('an'); };
  zone.addEventListener('pointerup', stickLos); zone.addEventListener('pointercancel', stickLos);
  const flaeche = $('blickZone');
  flaeche.addEventListener('pointerdown', e => { blick.id = e.pointerId; blick.x = e.clientX; blick.y = e.clientY; try { flaeche.setPointerCapture(e.pointerId); } catch(_){} });
  flaeche.addEventListener('pointermove', e => {
    if(e.pointerId !== blick.id) return;
    kam.dx += (e.clientX - blick.x)*1.6; kam.dy += (e.clientY - blick.y)*1.6;
    blick.x = e.clientX; blick.y = e.clientY;
  });
  const blickLos = e => { if(e.pointerId === blick.id) blick.id = null; };
  flaeche.addEventListener('pointerup', blickLos); flaeche.addEventListener('pointercancel', blickLos);
  $('kSchuss').addEventListener('pointerdown', e => { schussGewollt = true; schussHalten = true; $('kSchuss').classList.add('an'); e.preventDefault(); });
  for(const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('kSchuss').addEventListener(ev, () => { schussHalten = false; $('kSchuss').classList.remove('an'); });
  $('kWaffen').addEventListener('pointerdown', e => { e.preventDefault(); if(radOffen) radZu(); else radAuf(); });
  for(const [id, k] of [['kAktion', 'aktion'], ['kSprung', 'sprung'], ['kSprint', 'sprint']]){
    const el = $(id);
    el.addEventListener('pointerdown', e => { knopf[k] = true; if(k === 'aktion') gedrueckt.add('KeyE'); if(k === 'sprung') gedrueckt.add('Space'); el.classList.add('an'); e.preventDefault(); });
    const los = () => { knopf[k] = false; el.classList.remove('an'); };
    el.addEventListener('pointerup', los); el.addEventListener('pointercancel', los); el.addEventListener('pointerleave', los);
  }
  $('kKarte').addEventListener('click', () => { if(laeuft && !pausiert) karteUmschalten(); });
}
function achsen(){
  let x = 0, y = 0;
  if(tasten.has('KeyW') || tasten.has('ArrowUp')) y += 1;
  if(tasten.has('KeyS') || tasten.has('ArrowDown')) y -= 1;
  if(tasten.has('KeyD') || tasten.has('ArrowRight')) x += 1;
  if(tasten.has('KeyA') || tasten.has('ArrowLeft')) x -= 1;
  if(stick.id !== null){ x = stick.ax; y = stick.ay; }
  return { x, y };
}
const taste = k => { const da = gedrueckt.has(k); return da; };

/* ── Spielerlogik ──────────────────────────────────────────────── */
function naechstesFahrzeug(){
  let best = null, bd = Infinity;
  for(const f of fahrzeuge){
    if(!f.g.visible) continue;
    const r = f.art === 'flug' ? 8 : f.art === 'boot' ? 6.5 : 4.2;
    const d = Math.hypot(f.x - spieler.x, f.z - spieler.z);
    if(d < r && d < bd && Math.abs(f.y - spieler.y) < 3){ bd = d; best = f; }
  }
  return best;
}
function einsteigen(f){
  if(f.ki && f.ki.art === 'verkehr'){
    const nahPolizei = streifen.some(s => s.f.g.visible && Math.hypot(s.f.x - f.x, s.f.z - f.z) < 120);
    meldung('Auto geklaut — garantiert');
    if(nahPolizei) fahndung(1, 'Autodiebstahl gesehen', 1);
    f.ki = null;
  } else if(f.ki && f.ki.art === 'polizei'){
    fahndung(2, 'Streifenwagen geklaut');
    f.ki = null;
    const i = streifen.findIndex(s => s.f === f); if(i >= 0) streifen.splice(i, 1);
  } else if(f.typ === 'polizei' && f.parkt){ fahndung(2, 'Streifenwagen geklaut'); }
  f.parkt = false;
  f.fahrer = 'spieler';
  spieler.fz = f; spieler.modus = f.art === 'auto' ? 'auto' : f.art;
  kam.hand = -9;
  spielerZeigen();
  ton.tuer();
}
function aussteigen(){
  const f = spieler.fz;
  if(f.art === 'flug' && (!f.flug.amBoden || f.flug.tempo > 4)){
    if(f.flug.amBoden){ meldung('Erst anhalten'); return; }
    // Absprung mit Fallschirm
    f.fahrer = null; spieler.fz = null; spieler.modus = 'fall';
    spieler.x = f.x; spieler.z = f.z; spieler.y = f.y - 2; spieler.vy = -8; spieler.h = f.h;
    spielerZeigen(); spieler.m.g.visible = true; ton.tuer(); meldung('Absprung!');
    return;
  }
  const fx = Math.sin(f.h), fz = Math.cos(f.h), lx = fz, lz = -fx; // links = +x lokal
  const versuche = f.art === 'boot'
    ? [[3.2, 0], [-3.2, 0], [0, 6], [0, -6], [5, 0], [-5, 0], [7, 0], [-7, 0], [5, 4], [-5, 4], [5, -4], [-5, -4]]
    : f.art === 'flug' ? [[7.5, 0], [-7.5, 0], [0, -8], [0, 8]] : [[f.W/2 + .7, 0], [-f.W/2 - .7, 0], [0, -f.L/2 - 1], [0, f.L/2 + 1]];
  for(const [s, v] of versuche){
    const x = f.x + lx*s + fx*v, z = f.z + lz*s + fz*v;
    if(!W.begehbar(x, z)) continue;
    _p.x = x; _p.z = z;
    const y = W.bodenY(x, z);
    if(W.kreisRaus({ x, z }, .4, y, y + 1.8)) continue;
    spieler.x = x; spieler.z = z; spieler.y = y; spieler.vy = 0; spieler.h = f.h;
    f.fahrer = null; spieler.fz = null; spieler.modus = 'fuss';
    if(f.art === 'auto' || f.art === 'boot'){ /* rollt aus */ }
    spielerZeigen(); ton.tuer();
    return;
  }
  meldung(f.art === 'boot' ? 'Fahr näher ans Ufer oder an einen Steg' : 'Hier kannst du nicht aussteigen');
}
function aufprall(w){
  if(w > 9 && spieler.fz){ spieler.fz.schaden = (spieler.fz.schaden || 0) + (w - 9)*3; if(w > 22) schaden((w - 22)*2.5, 'SCHWERER UNFALL'); }
  if(w > 4){ kam.wackel = Math.min(1, kam.wackel + w*.04); ton.krach(Math.min(1, w/20)); }
}

function spielerFuss(dt){
  const a = achsen();
  const fx = Math.sin(kam.yaw), fz = Math.cos(kam.yaw), rx = -fz, rz = fx;
  let mx = fx*a.y + rx*a.x, mz = fz*a.y + rz*a.x;
  const l = Math.hypot(mx, mz);
  if(l > 1){ mx /= l; mz /= l; }
  const sprint = tasten.has('ShiftLeft') || tasten.has('ShiftRight') || knopf.sprint;
  if(spieler.liegt > 0){ spieler.liegt -= dt; mx = mz = 0; }
  const v = sprint ? 8.4 : 4.6;
  const ziel = Math.min(1, l)*v;
  spieler.tempo = daempf(spieler.tempo, ziel, 10, dt);
  if(l > .05) spieler.h = daempfW(spieler.h, Math.atan2(mx, mz), 12, dt);
  const sx = Math.sin(spieler.h)*spieler.tempo, sz = Math.cos(spieler.h)*spieler.tempo;
  // achsweise, damit man an Ufern und Brüstungen entlang gleitet
  const nx = spieler.x + sx*dt, nz = spieler.z + sz*dt;
  if(W.begehbar(nx, spieler.z)) spieler.x = nx;
  if(W.begehbar(spieler.x, nz)) spieler.z = nz;
  const p = { x: spieler.x, z: spieler.z };
  W.kreisRaus(p, .36, spieler.y + .1, spieler.y + 1.8);
  if(W.begehbar(p.x, p.z)){ spieler.x = p.x; spieler.z = p.z; }
  // Fahrzeuge schieben
  for(const f of fahrzeuge){
    if(!f.g.visible || f.art === 'flug' && !f.flug.amBoden) continue;
    const dx = spieler.x - f.x, dz = spieler.z - f.z;
    if(dx*dx + dz*dz > 60) continue;
    if(f.art === 'boot' && spieler.y > W.WASSER_Y + 1) continue;
    const ffx = Math.sin(f.h), ffz = Math.cos(f.h);
    const lv = dx*ffx + dz*ffz, ls = dx*-ffz + dz*ffx;
    const hl = f.L/2 + .35, hb = f.W/2 + .35;
    if(Math.abs(lv) < hl && Math.abs(ls) < hb && Math.abs(f.y - spieler.y) < 2){
      const tempo = Math.hypot(f.vx, f.vz);
      if(tempo > 6 && spieler.liegt <= 0 && f.art === 'auto'){ spieler.liegt = 1.4; spieler.vy = 4; ton.dumpf(.6); kam.wackel = .5; schaden(Math.min(55, tempo*(f.typ === 'polizei' ? 1.2 : 2)), 'ÜBERFAHREN'); }
      const pv = hl - Math.abs(lv), ps = hb - Math.abs(ls);
      if(pv < ps){ const s = Math.sign(lv) || 1; spieler.x += ffx*pv*s; spieler.z += ffz*pv*s; }
      else { const s = Math.sign(ls) || 1; spieler.x += -ffz*ps*s; spieler.z += ffx*ps*s; }
    }
  }
  // Springen und Schwerkraft
  const boden = W.bodenY(spieler.x, spieler.z);
  if(taste('Space') && spieler.boden && spieler.liegt <= 0){ spieler.vy = 5.4; spieler.boden = false; }
  const fallVorher = spieler.vy;
  spieler.vy -= 15*dt;
  spieler.y += spieler.vy*dt;
  if(spieler.y <= boden && !spieler.boden && fallVorher < -13) schaden((-fallVorher - 13)*9, 'ABGESTÜRZT');
  if(spieler.y <= boden){ spieler.y = spieler.boden ? daempf(spieler.y, boden, 25, dt) : boden; if(spieler.y < boden - .3) spieler.y = boden - .3; spieler.vy = 0; spieler.boden = true; }
  else if(spieler.y > boden + .05) spieler.boden = spieler.vy <= 0 && spieler.y - boden < .4 ? spieler.boden : false;
  if(spieler.boden && spieler.y < boden) spieler.y = boden;
  const g = spieler.m.g;
  g.position.set(spieler.x, spieler.y, spieler.z);
  g.rotation.y = spieler.h;
  g.rotation.x = daempf(g.rotation.x, spieler.liegt > 0 ? -Math.PI/2 : 0, 10, dt);
  animiereFigur(spieler.m, spieler.boden ? spieler.tempo : 1.2, spieler.boden ? dt : dt*.2);
  spieler.vx = sx; spieler.vz = sz;
  spieler.px = spieler.x; spieler.pz = spieler.z;
  // Leute anrempeln
  for(const p of leute) if(p.zustand !== 'weg' && p.zustand !== 'liegt'){
    const dx = p.x - spieler.x, dz = p.z - spieler.z, d = Math.hypot(dx, dz);
    if(d < .7 && d > .001){ p.x += dx/d*(.7 - d); p.z += dz/d*(.7 - d); }
  }
  // Einsteigen
  const f = naechstesFahrzeug();
  if(f && !(f.art === 'flug' && !f.flug.amBoden)){
    eingabeHinweis(f.ki && f.ki.art === 'verkehr' ? 'Auto klauen' : f.art === 'boot' ? 'Boot nehmen' : f.art === 'flug' ? 'Einsteigen und fliegen' : 'Einsteigen');
    if(taste('KeyE') || taste('KeyF')) einsteigen(f);
  } else eingabeHinweis(null);
}

function spielerFahrzeug(dt){
  const f = spieler.fz;
  const a = achsen();
  const hand = tasten.has('Space') || knopf.sprung;
  let gas = a.y;
  const boost = (tasten.has('ShiftLeft') || knopf.sprint) && f.art === 'auto';
  if(f.art === 'auto' || f.art === 'boot'){
    const st = { gas: gas*(boost ? 1.25 : 1), lenk: a.x, hand };
    const alt = f.spec.vmax;
    if(boost) f.spec.vmax = alt*1.12;
    physik(f, st, dt);
    f.spec.vmax = alt;
    const stoss = bewege(f, dt);
    aufprall(stoss);
    f.zeige(dt);
    // Bremslicht
    // Leute umfahren
    const tempo = Math.hypot(f.vx, f.vz);
    if(tempo > 3.5 && f.art === 'auto') for(const p of leute){
      if(p.zustand === 'weg' || p.zustand === 'liegt') continue;
      const dx = p.x - f.x, dz = p.z - f.z;
      if(dx*dx + dz*dz > 16) continue;
      const fx = Math.sin(f.h), fz = Math.cos(f.h);
      if(Math.abs(dx*fx + dz*fz) < f.L/2 + .3 && Math.abs(-dx*fz + dz*fx) < f.W/2 + .3){
        p.umfahren(f, tempo);
        fahndung(1, 'Fußgänger umgefahren', 1);
      }
    }
    spieler.tempo = tempo; spieler.vx = f.vx; spieler.vz = f.vz;
    if((f.schaden || 0) > 70 && !f.warnte){ f.warnte = true; meldung('Der Motor qualmt. Steig lieber aus!'); }
    if(f.art === 'boot') bootSpur(f, dt);
  } else if(f.art === 'flug') fliegen(f, a, dt);
  spieler.x = f.x; spieler.z = f.z; spieler.y = f.y;
  spieler.px = f.x; spieler.pz = f.z;
  eingabeHinweis(null);
  if(taste('KeyE') || taste('KeyF')) aussteigen();
}

/* Fliegen: vereinfachtes Flugmodell mit Schub, Nicken, Rollen */
function fliegen(f, a, dt, ohnePilot){
  const fl = f.flug;
  const schubAuf = !ohnePilot && (tasten.has('KeyW') || knopf.sprint), schubAb = ohnePilot || tasten.has('KeyS') || knopf.sprung;
  let nick = 0, roll = 0;
  if(ohnePilot){ nick = -.25; roll = .15; }
  else if(TOUCH){ nick = stick.ay; roll = stick.ax; }
  else {
    if(tasten.has('ArrowUp') || tasten.has('Space')) nick += 1;
    if(tasten.has('ArrowDown') || tasten.has('ShiftLeft')) nick -= 1;
    if(tasten.has('KeyD') || tasten.has('ArrowRight')) roll += 1;
    if(tasten.has('KeyA') || tasten.has('ArrowLeft')) roll -= 1;
  }
  if(schubAuf) fl.schub = Math.min(1, fl.schub + dt*.6);
  if(schubAb) fl.schub = Math.max(0, fl.schub - dt*.6);
  if(TOUCH && !schubAb && fl.schub < .05 && fl.amBoden && stick.ay > .5) fl.schub = Math.min(1, fl.schub + dt*.6);
  const zug = fl.schub*15;
  const luft = .0018*fl.tempo*fl.tempo + (fl.amBoden ? (fl.schub < .05 ? 4 : .6) : .4);
  fl.tempo = Math.max(0, fl.tempo + (zug - luft - Math.sin(fl.pitch)*9.8)*dt);
  if(fl.amBoden){
    fl.roll = daempf(fl.roll, 0, 6, dt);
    const abheben = fl.tempo > 31 && nick > .2;
    fl.pitch = daempf(fl.pitch, abheben ? .16 : 0, 3, dt);
    f.h -= roll*.7*Math.min(1, fl.tempo/8)*dt;
    if(abheben && fl.pitch > .1){ fl.amBoden = false; meldung('Abgehoben!'); }
    const fx = Math.sin(f.h), fz = Math.cos(f.h);
    const nx = f.x + fx*fl.tempo*dt, nz = f.z + fz*fl.tempo*dt;
    if(W.begehbar(nx, nz) && !W.kreisRaus({ x: nx, z: nz }, 1.2, f.y - 1, f.y + 1)){ f.x = nx; f.z = nz; }
    else { if(fl.tempo > 12) return absturz(f); fl.tempo = 0; }
    f.y = W.bodenY(f.x, f.z) + 1.44;
  } else {
    fl.roll = daempf(fl.roll, roll*.95, 2.2, dt);
    fl.pitch = klemm(fl.pitch + nick*.85*dt, -.9, .9);
    if(!nick) fl.pitch = daempf(fl.pitch, 0, .4, dt);
    if(fl.tempo < 27){ fl.pitch -= (27 - fl.tempo)*.035*dt; }
    f.h -= Math.sin(fl.roll)*1.05*dt;
    const sink = fl.tempo < 24 ? (24 - fl.tempo)*.6 : 0;
    const cp = Math.cos(fl.pitch);
    f.x += Math.sin(f.h)*cp*fl.tempo*dt; f.z += Math.cos(f.h)*cp*fl.tempo*dt;
    fl.vy = Math.sin(fl.pitch)*fl.tempo - sink;
    f.y += fl.vy*dt;
    if(f.y > 1400) f.y = 1400;
    // weit draußen sanft zurücklenken
    const r = Math.hypot(f.x, f.z);
    if(r > 2300){ const soll = Math.atan2(-f.x, -f.z); f.h = daempfW(f.h, soll, .5, dt); }
    // Boden, Wasser, Häuser
    const boden = W.bodenY(f.x, f.z);
    const ueberLand = W.begehbar(f.x, f.z);
    if(!ueberLand && f.y < W.WASSER_Y + 1.2) return absturz(f, true);
    if(ueberLand && f.y < boden + 1.44){
      const sanft = fl.vy > -6 && Math.abs(fl.roll) < .35 && fl.pitch > -.25 && fl.pitch < .35;
      if(sanft && !W.kreisRaus({ x: f.x, z: f.z }, 2, boden, boden + 2)){ fl.amBoden = true; fl.pitch = 0; f.y = boden + 1.44; meldung('Gelandet'); kam.wackel = .3; }
      else return absturz(f);
    }
    if(W.inHindernis(f.x, f.y, f.z) || W.inHindernis(f.x + Math.sin(f.h)*5, f.y, f.z + Math.cos(f.h)*5)) return absturz(f);
  }
  f.vx = Math.sin(f.h)*fl.tempo; f.vz = Math.cos(f.h)*fl.tempo; f.vf = fl.tempo;
  f.g.position.set(f.x, f.y, f.z);
  f.g.rotation.set(-fl.pitch, f.h, fl.roll, 'YXZ');
  f.mod.prop.rotation.z += (fl.schub*60 + 4)*dt;
  if(!ohnePilot) spieler.tempo = fl.tempo;
}
function absturz(f, wasser){
  explosion(f.x, Math.max(f.y, W.WASSER_Y + .5), f.z, wasser);
  f.g.visible = false; f.wrackZeit = 0;
  if(spieler.fz === f){ spieler.fz = null; tod(wasser ? 'ABGESOFFEN' : 'ZERSCHELLT', f.x, f.y, f.z); }
}
/* ── Gesundheit, Tod, Krankenhaus ──────────────────────────────── */
let leben = 100, totZeit = -1, totPos = new THREE.Vector3();
function schaden(n, grund){
  if(spieler.modus === 'tot' || n <= 0) return;
  leben = Math.max(0, leben - n);
  $('treffer').classList.add('an'); clearTimeout(schaden.t); schaden.t = setTimeout(() => $('treffer').classList.remove('an'), 160);
  if(leben <= 0) tod(grund || 'AUSGESCHALTET');
}
function tod(titel, x, y, z){
  if(spieler.modus === 'tot') return;
  if(spieler.fz){ spieler.fz.fahrer = null; spieler.fz = null; }
  spieler.modus = 'tot'; leben = 0; totZeit = 0;
  totPos.set(x ?? spieler.x, y ?? spieler.y, z ?? spieler.z);
  spieler.m.g.visible = true; spieler.m.g.position.set(totPos.x, W.begehbar(totPos.x, totPos.z) ? W.bodenY(totPos.x, totPos.z) : totPos.y, totPos.z);
  spieler.m.g.rotation.x = -Math.PI/2;
  if(x !== undefined) spieler.m.g.visible = false;
  grossText(titel, 'Du wachst gleich im Krankenhaus auf.', 3.4);
  ton.alarm();
}
function totUpdate(dt){
  if(totZeit < 0) return;
  totZeit += dt;
  if(totZeit >= 3.6){
    totZeit = -1;
    const kosten = Math.min(geld, 200);
    geldDazu(-kosten, 'Krankenhausrechnung');
    sterne = 0; hudSterne();
    for(const s2 of streifen){ s2.f.g.visible = false; s2.f.vx = s2.f.vz = 0; }
    if(auftrag) auftragEnde(false);
    const k = W.markantes.krankenhaus;
    spieler.x = k.x; spieler.z = k.z; spieler.y = W.bodenY(k.x, k.z); spieler.h = k.h; spieler.vy = 0;
    spieler.modus = 'fuss'; leben = 100; spieler.liegt = 0; spieler.m.g.rotation.x = 0;
    kam.yaw = k.h; spielerZeigen();
  }
}
// Fallschirm: Aussteigen in der Luft
const schirm = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 8, 0, Math.PI*2, 0, Math.PI*.38),
  new THREE.MeshStandardMaterial({ color: 0xff4fa0, side: THREE.DoubleSide, roughness: .7 }));
schirm.scale.y = .55; schirm.visible = false; szene.add(schirm);
function fallschirmUpdate(dt){
  const a = achsen();
  const fx = Math.sin(kam.yaw), fz = Math.cos(kam.yaw), rx = -fz, rz = fx;
  spieler.vy = daempf(spieler.vy, -4.2, 1.5, dt);
  spieler.x += (fx*a.y + rx*a.x)*7*dt; spieler.z += (fz*a.y + rz*a.x)*7*dt;
  spieler.y += spieler.vy*dt;
  if(a.x || a.y) spieler.h = daempfW(spieler.h, Math.atan2(fx*a.y + rx*a.x, fz*a.y + rz*a.x), 3, dt);
  const g = spieler.m.g; g.position.set(spieler.x, spieler.y, spieler.z); g.rotation.set(0, spieler.h, 0);
  animiereFigur(spieler.m, 0, dt);
  schirm.visible = true; schirm.position.set(spieler.x, spieler.y + 5.6, spieler.z); schirm.rotation.y = spieler.h;
  spieler.px = spieler.x; spieler.pz = spieler.z; spieler.tempo = 4;
  const land = W.begehbar(spieler.x, spieler.z);
  const boden = land ? W.bodenY(spieler.x, spieler.z) : W.WASSER_Y;
  if(spieler.y <= boden + .05){
    schirm.visible = false;
    if(!land){
      // im Wasser gelandet: ans nächste Ufer schwimmen
      for(let r = 4; r < 400; r += 4){ let ok = false;
        for(let w = 0; w < 16 && !ok; w++){ const x = spieler.x + Math.cos(w/16*Math.PI*2)*r, z = spieler.z + Math.sin(w/16*Math.PI*2)*r;
          if(W.begehbar(x, z) && !W.kreisRaus({ x, z }, .5, 0, 2)){ spieler.x = x; spieler.z = z; ok = true; } }
        if(ok) break; }
      meldung('Ans Ufer geschwommen');
    }
    spieler.y = W.bodenY(spieler.x, spieler.z); spieler.vy = 0; spieler.modus = 'fuss'; spieler.boden = true;
  }
}
// das verlassene Flugzeug fliegt weiter, bis es abstürzt; danach steht ein neues am Flughafen
function fliegerOhnePilot(dt){
  const f = flieger;
  if(!f || f === spieler.fz) return;
  if(f.g.visible && !f.flug.amBoden) fliegen(f, null, dt, true);
  else if(!f.g.visible){ f.wrackZeit = (f.wrackZeit || 0) + dt; if(f.wrackZeit > 12 && Math.hypot(spieler.px - W.markantes.flugzeug.x, spieler.pz - W.markantes.flugzeug.z) > 60) flugzeugZuruck(); }
}

/* ── Waffen ──────────────────────────────────────────────────── */
// Jede Waffe verhält sich anders: Schaden je Kugel, Pause zwischen Schüssen,
// Streuung, Reichweite, Magazin, Nachladezeit, Kugeln je Schuss (Schrot)
const WAFFEN = {
  faust:    { name: 'Faust',        nah: true, dmg: 26, rate: .45 },
  pistole:  { name: 'Pistole',      dmg: 34, rate: .30, streu: .018, weite: 90,  mag: 12, laden: 1.2, kugeln: 1, auto: false, ton: 1 },
  revolver: { name: 'Revolver',     dmg: 78, rate: .70, streu: .007, weite: 115, mag: 6,  laden: 2.1, kugeln: 1, auto: false, ton: .7 },
  schrot:   { name: 'Schrotflinte', dmg: 16, rate: .95, streu: .085, weite: 32,  mag: 2,  laden: 1.8, kugeln: 8, auto: false, ton: .5 },
  uzi:      { name: 'Uzi',          dmg: 17, rate: .075, streu: .055, weite: 60, mag: 32, laden: 1.5, kugeln: 1, auto: true,  ton: 1.3 },
  gewehr:   { name: 'M4A1',         dmg: 31, rate: .11, streu: .022, weite: 150, mag: 30, laden: 1.9, kugeln: 1, auto: true,  ton: .9 },
};
const REIHE = ['faust', 'pistole', 'revolver', 'schrot', 'uzi', 'gewehr'];
let inventar = { faust: {} }, aktiv = 'faust';
let schussPause = 0, ladenT = 0, schlagT = 0, schussHalten = false;
const handMeshes = {}; // Waffen in der Hand des Spielers, je Art einmal gebaut
function handKnochen(fig){ let h = null; fig.koerper.traverse(o => { if(!h && o.isBone && /hand_r/i.test(o.name)) h = o; }); return h; }
const _hp = new THREE.Vector3();
function waffeInHand(fig, mesh, yaw, pitch){
  if(fig.hand){ fig.hand.getWorldPosition(_hp); mesh.position.copy(_hp); }
  else mesh.position.set(fig.g.position.x, fig.g.position.y + 1.2, fig.g.position.z);
  mesh.rotation.set(-pitch, yaw, 0, 'YXZ');
}
function waffeGeben(typ, munition){
  const w = WAFFEN[typ]; if(!w) return;
  const neu = !inventar[typ];
  if(neu) inventar[typ] = { mag: Math.min(w.mag, munition), vorrat: Math.max(0, munition - w.mag) };
  else inventar[typ].vorrat += munition;
  meldung(neu ? w.name + ' aufgehoben' : '+' + munition + ' Schuss ' + w.name);
  if(neu && aktiv === 'faust') waffeWaehlen(typ);
  hudWaffe();
}
function waffeWaehlen(typ){
  if(!inventar[typ] || typ === aktiv) return;
  aktiv = typ; ladenT = 0; schussPause = .25; ton.menue(); hudWaffe();
}
function hudWaffe(){
  const w = WAFFEN[aktiv], inv = inventar[aktiv];
  $('waffeName').textContent = w.name;
  $('waffeMuni').textContent = w.nah ? '' : ladenT > 0 ? 'lädt …' : inv.mag + ' | ' + inv.vorrat;
}
const _a = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3();
let spurZeit = 0;
const spurLinie = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(16*6), 3)),
  new THREE.LineBasicMaterial({ color: new THREE.Color(3, 2.4, 1.2), transparent: true }));
spurLinie.frustumCulled = false; spurLinie.visible = false; szene.add(spurLinie);
const muendung = new THREE.PointLight(0xffc070, 0, 14, 2); szene.add(muendung);
let spurN = 0;
function schussLinie(a, b){
  const p = spurLinie.geometry.attributes.position;
  if(spurZeit <= 0) spurN = 0;
  const i = spurN++ % 16;
  p.setXYZ(i*2, a.x, a.y, a.z); p.setXYZ(i*2 + 1, b.x, b.y, b.z);
  spurLinie.geometry.setDrawRange(0, Math.min(spurN, 16)*2);
  p.needsUpdate = true;
  spurLinie.visible = true; spurZeit = .06;
  muendung.position.copy(a); muendung.intensity = 30;
}
function strahlKugel(o, d, cx, cy, cz, r){
  const ox = o.x - cx, oy = o.y - cy, oz = o.z - cz;
  const b = ox*d.x + oy*d.y + oz*d.z, c = ox*ox + oy*oy + oz*oz - r*r, h = b*b - c;
  if(h < 0) return -1;
  const t = -b - Math.sqrt(h);
  return t > 0 ? t : -1;
}
// ein Strahl: trifft Haus/Boden, Person oder Fahrzeug
function schussStrahl(o, d, t0, weite){
  let best = weite, ziel = null;
  for(let t = t0 + .5; t < best; t += .7){
    const x = o.x + d.x*t, y = o.y + d.y*t, z = o.z + d.z*t;
    if(W.inHindernis(x, y, z) || (W.begehbar(x, z) ? y < W.bodenY(x, z) : y < W.WASSER_Y)){ best = t; break; }
  }
  for(const p of leute){
    if(p.zustand === 'weg' || p.zustand === 'tot') continue;
    const t = strahlKugel(o, d, p.x, p.y + 1.1, p.z, .5);
    if(t > t0 && t < best){ best = t; ziel = { p }; }
  }
  for(const f of fahrzeuge){
    if(!f.g.visible || f === spieler.fz || f.art === 'flug') continue;
    const fx = Math.sin(f.h), fz = Math.cos(f.h), off = f.L/2 - f.W/2;
    for(const sx of [-1, 0, 1]){
      const t = strahlKugel(o, d, f.x + fx*off*sx, f.y + .8, f.z + fz*off*sx, f.W/2 + .15);
      if(t > t0 && t < best){ best = t; ziel = { f }; }
    }
  }
  return { t: best, ziel };
}
function trefferZeigen(){ $('fadenkreuz').classList.add('treffer'); clearTimeout(trefferZeigen.t); trefferZeigen.t = setTimeout(() => $('fadenkreuz').classList.remove('treffer'), 150); }
function schiessen(){
  const w = WAFFEN[aktiv], inv = inventar[aktiv];
  kamera.getWorldDirection(_d);
  spieler.h = Math.atan2(_d.x, _d.z);
  if(w.nah){
    // Faustschlag: wer vorne in Reichweite steht, bekommt ihn ab
    schussPause = w.rate; schlagT = .28; ton.dumpf(.25);
    let best = null, bd = 1.9;
    for(const p of leute){
      if(p.zustand === 'weg' || p.zustand === 'tot') continue;
      const dx = p.x - spieler.x, dz = p.z - spieler.z, d = Math.hypot(dx, dz);
      if(d < bd && (dx*Math.sin(spieler.h) + dz*Math.cos(spieler.h))/Math.max(d, .01) > .5){ bd = d; best = p; }
    }
    if(best){
      ton.dumpf(.7); trefferZeigen();
      best.x += Math.sin(spieler.h)*.6; best.z += Math.cos(spieler.h)*.6;
      best.getroffen(w.dmg, 'faust');
    }
    return;
  }
  if(ladenT > 0) return;
  if(inv.mag <= 0){
    if(inv.vorrat > 0){ ladenT = w.laden; hudWaffe(); } else { ton.piepLeer(); schussPause = .3; }
    return;
  }
  inv.mag--; schussPause = w.rate;
  const o = kamera.position;
  const t0 = Math.max(0, (spieler.x - o.x)*_d.x + (spieler.y + 1.4 - o.y)*_d.y + (spieler.z - o.z)*_d.z);
  const mesh = handMeshes[aktiv];
  if(mesh){ _a.copy(mesh.position).addScaledVector(_r.set(Math.sin(spieler.h), 0, Math.cos(spieler.h)), mesh.userData.laenge || .3); }
  else _a.set(spieler.x + Math.sin(spieler.h)*.5, spieler.y + 1.45, spieler.z + Math.cos(spieler.h)*.5);
  let getroffen = false;
  for(let k = 0; k < w.kugeln; k++){
    _r.copy(_d); _r.x += (Math.random() - .5)*2*w.streu; _r.y += (Math.random() - .5)*2*w.streu; _r.z += (Math.random() - .5)*2*w.streu; _r.normalize();
    const e = schussStrahl(o, _r, t0, w.weite);
    _t.copy(o).addScaledVector(_r, e.t);
    schussLinie(_a, _t);
    if(e.ziel && e.ziel.p){ e.ziel.p.getroffen(w.dmg, 'schuss'); getroffen = true; }
    else if(e.ziel && e.ziel.f){
      const f = e.ziel.f; f.schaden = (f.schaden || 0) + w.dmg*.4; getroffen = true;
      if(f.typ === 'polizei' && f.ki) fahndung(1, 'Auf Polizei geschossen', 3);
    }
  }
  if(getroffen) trefferZeigen();
  ton.schuss(false, w.ton);
  kam.wackel = Math.min(1, kam.wackel + (aktiv === 'schrot' || aktiv === 'revolver' ? .25 : .08));
  fahndung(1, 'Schüsse in der Stadt', 1);
  // Leute in der Nähe erschrecken
  for(const p of leute) if(p.zustand === 'geht' && Math.hypot(p.x - spieler.x, p.z - spieler.z) < 40) p.erschrecken();
  if(inv.mag === 0 && inv.vorrat > 0) ladenT = w.laden;
  hudWaffe();
}
function waffeUpdate(dt){
  schussPause -= dt; spurZeit -= dt; schlagT -= dt;
  if(spurZeit <= 0){ spurLinie.visible = false; muendung.intensity = 0; }
  if(ladenT > 0){
    ladenT -= dt;
    if(ladenT <= 0){ const w = WAFFEN[aktiv], inv = inventar[aktiv]; const n = Math.min(w.mag - inv.mag, inv.vorrat); inv.mag += n; inv.vorrat -= n; ton.tuer(); hudWaffe(); }
  }
  const zuFuss = spieler.modus === 'fuss' && ansicht === 'spiel' && !drinnen;
  $('fadenkreuz').hidden = !zuFuss || radOffen;
  const w = WAFFEN[aktiv];
  const will = schussGewollt || (w.auto && (schussHalten || (mausUnten && document.pointerLockElement === leinwandEl)));
  if(will && zuFuss && !radOffen && spieler.liegt <= 0 && schussPause <= 0) schiessen();
  schussGewollt = false;
  // Waffe in der Hand
  for(const [typ, m] of Object.entries(handMeshes)) m.visible = false;
  if(zuFuss && !w.nah){
    if(!handMeshes[aktiv]){ handMeshes[aktiv] = baueWaffe(aktiv); szene.add(handMeshes[aktiv]); }
    const m = handMeshes[aktiv]; m.visible = true;
    kamera.getWorldDirection(_d);
    waffeInHand(spieler.m, m, spieler.h, Math.asin(klemm(_d.y, -1, 1)));
  }
  // Faustschlag: kurzer Ausfallschritt nach vorn
  spieler.m.koerper.rotation.x = schlagT > 0 ? Math.sin((1 - schlagT/.28)*Math.PI)*.35 : spieler.m.koerper.rotation.x;
  // Polizei schießt ab zwei Sternen
  if(sterne < 2 || spieler.modus === 'tot') return;
  for(const s2 of streifen){
    const f = s2.f;
    if(!f.g.visible || f === spieler.fz) continue;
    const d = Math.hypot(f.x - spieler.px, f.z - spieler.pz);
    if(d > 55) continue;
    s2.schussT = (s2.schussT ?? 1.5) - dt;
    if(s2.schussT > 0) continue;
    s2.schussT = 1.4 - sterne*.15 + Math.random()*.5;
    if(!sicht(f.x, f.z, spieler.px, spieler.pz)) continue;
    _a.set(f.x, f.y + 1.3, f.z);
    const trifft = Math.random() < (.3 + sterne*.07)*(spieler.fz ? .7 : 1)*(d > 30 ? .6 : 1);
    _t.set(spieler.px + (trifft ? 0 : (Math.random() - .5)*4), spieler.y + 1.2, spieler.pz + (trifft ? 0 : (Math.random() - .5)*4));
    schussLinie(_a, _t);
    ton.schuss(true);
    if(trifft){
      if(spieler.fz) spieler.fz.schaden = (spieler.fz.schaden || 0) + 5 + sterne;
      else schaden(4 + sterne*1.6, 'ERSCHOSSEN');
    }
  }
}

/* ── Beute: Geld, Munition, Waffen zum Aufheben ───────────────── */
const beute = [];
const beuteGeo = { geld: new THREE.BoxGeometry(.5, .2, .3), munition: new THREE.BoxGeometry(.4, .25, .3) };
const beuteMat = {
  geld: new THREE.MeshStandardMaterial({ color: 0x5fd88a, emissive: 0x1a8a4a, emissiveIntensity: .8, roughness: .5 }),
  munition: new THREE.MeshStandardMaterial({ color: 0xc9a23a, emissive: 0x6a4a10, emissiveIntensity: .8, roughness: .4, metalness: .5 }),
};
function beuteFallen(x, z, art, typ, menge){
  let m;
  if(art === 'waffe'){ m = baueWaffe(typ, 1.6); }
  else m = new THREE.Mesh(beuteGeo[art], beuteMat[art]);
  m.castShadow = true; szene.add(m);
  beute.push({ x, z, y: W.bodenY(x, z), art, typ, menge, m, t: 0 });
}
function beuteUpdate(dt){
  for(let i = beute.length - 1; i >= 0; i--){
    const b = beute[i];
    b.t += dt;
    b.m.position.set(b.x, b.y + .55 + Math.sin(b.t*3)*.12, b.z); b.m.rotation.set(0, b.t*2, 0);
    let weg = b.t > 90;
    if(spieler.modus === 'fuss' && Math.hypot(b.x - spieler.x, b.z - spieler.z) < 1.6){
      weg = true; ton.muenze();
      if(b.art === 'geld') geldDazu(b.menge, 'Geld aufgehoben');
      else if(b.art === 'waffe') waffeGeben(b.typ, b.menge);
      else { const typ = b.typ; waffeGeben(typ, b.menge); }
    }
    if(weg){ szene.remove(b.m); beute.splice(i, 1); }
  }
}

/* ── Waffenrad ─────────────────────────────────────────────────── */
let radOffen = false, radWahl = null, radX = 0, radY = 0;
function radAuf(){
  if(spieler.modus !== 'fuss' || ansicht !== 'spiel' || radOffen) return;
  radOffen = true; radX = radY = 0; radWahl = aktiv;
  const el = $('rad'); el.innerHTML = '';
  const da = REIHE.filter(t => inventar[t]);
  da.forEach((t, i) => {
    const a = i/da.length*Math.PI*2 - Math.PI/2, w = WAFFEN[t], inv = inventar[t];
    const b = document.createElement('button');
    b.className = 'radFeld' + (t === aktiv ? ' an' : ''); b.dataset.typ = t;
    b.style.left = `calc(50% + ${Math.cos(a)*120}px)`; b.style.top = `calc(50% + ${Math.sin(a)*120}px)`;
    b.innerHTML = `<b>${w.name}</b><small>${w.nah ? '∞' : inv.mag + ' | ' + inv.vorrat}</small>`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); radWahl = t; radZu(); });
    el.appendChild(b);
  });
  const mitte = document.createElement('div'); mitte.className = 'radMitte'; mitte.textContent = da.length > 1 ? 'Waffe wählen' : 'Noch keine Waffe – erledigte Gegner lassen welche fallen'; el.appendChild(mitte);
  el.classList.add('an');
}
function radBewegen(dx, dy){
  if(!radOffen) return;
  radX += dx; radY += dy;
  const l = Math.hypot(radX, radY);
  if(l > 30){
    const da = REIHE.filter(t => inventar[t]);
    let w = Math.atan2(radY, radX) + Math.PI/2; if(w < 0) w += Math.PI*2;
    radWahl = da[Math.round(w/(Math.PI*2)*da.length) % da.length];
    if(l > 150){ radX *= 150/l; radY *= 150/l; }
    for(const b of $('rad').querySelectorAll('.radFeld')) b.classList.toggle('an', b.dataset.typ === radWahl);
  }
}
function radZu(){
  if(!radOffen) return;
  radOffen = false; $('rad').classList.remove('an');
  if(radWahl) waffeWaehlen(radWahl);
}

// Autos mit zu viel Schaden fliegen in die Luft
function autoSchaeden(){
  for(const f of fahrzeuge){
    if(f.art !== 'auto' || !f.g.visible || (f.schaden || 0) < 100) continue;
    explosion(f.x, f.y + 1, f.z, false);
    f.g.visible = false; f.vx = f.vz = 0; f.schaden = 0;
    // Leute in der Nähe
    for(const p of leute) if(p.zustand !== 'weg' && Math.hypot(p.x - f.x, p.z - f.z) < 6){ p.zustand = 'tot'; p.liegen = 25; }
    if(Math.hypot(spieler.px - f.x, spieler.pz - f.z) < 6 && spieler.fz !== f && spieler.modus === 'fuss') schaden(45, 'IN DIE LUFT GEFLOGEN');
    if(spieler.fz === f){ spieler.fz = null; tod('IN DIE LUFT GEFLOGEN', f.x, f.y, f.z); }
    if(f.typ === 'polizei' && f.ki){ fahndung(1, 'Streifenwagen zerstört', 4); }
    else if(!verkehr.includes(f) && !streifen.some(s2 => s2.f === f)) f.zerstoert = uhr;
  }
}

/* ── Läden: Clocking Chicken und Knallhaus ───────────────────────
   Jeder Laden hat außen eine Tür und weit draußen einen echten Innenraum.
   Tür berühren: hinein. Ausgang berühren: hinaus. An der Theke: E.      */
const LADEN = {
  huhn: { name: 'Clocking Chicken', ox: 2000, oz: 0, farbe: '#ffcc33', schild: 'CLOCKING CHICKEN', schildFarbe: '#ffb020',
    waren: [
      { id: 'k', name: 'Kleiner Eimer', info: '+30 Gesundheit', preis: 8, kauf(){ leben = Math.min(100, leben + 30); } },
      { id: 'g', name: 'Großer Eimer', info: '+60 Gesundheit', preis: 15, kauf(){ leben = Math.min(100, leben + 60); } },
      { id: 'f', name: 'Familien-Eimer', info: 'volle Gesundheit', preis: 25, kauf(){ leben = 100; } },
      { id: 's', name: 'Clock-Shake', info: '+10 Gesundheit', preis: 3, kauf(){ leben = Math.min(100, leben + 10); } },
    ] },
  waffen: { name: 'Knallhaus', ox: 2100, oz: 0, farbe: '#ff5050', schild: 'KNALLHAUS · WAFFEN', schildFarbe: '#ff4040', waren: [] },
};
const PREISE = { pistole: [250, 40], revolver: [600, 60], schrot: [900, 70], uzi: [1400, 110], gewehr: [2500, 160] };
for(const t of ['pistole', 'revolver', 'schrot', 'uzi', 'gewehr']){
  const w = WAFFEN[t];
  LADEN.waffen.waren.push({ id: t, name: w.name, info: () => inventar[t] ? 'hast du schon' : 'mit ' + w.mag*2 + ' Schuss', preis: PREISE[t][0], geht: () => !inventar[t], kauf(){ waffeGeben(t, w.mag*2); } });
  LADEN.waffen.waren.push({ id: t + 'M', name: 'Munition ' + w.name, info: () => inventar[t] ? '+' + w.mag*2 + ' Schuss' : 'erst die Waffe kaufen', preis: PREISE[t][1], geht: () => !!inventar[t], kauf(){ waffeGeben(t, w.mag*2); } });
}
let drinnen = null, ladenOffen = null, tuerSperre = 0;
const ladenListe = [];
function innenraum(art){
  const L = LADEN[art], ox = L.ox, oz = L.oz, B = 18, TI = 13, H = 4.6;
  const raum = { x0: ox - B/2, x1: ox + B/2, z0: oz - TI/2, z1: oz + TI/2 };
  W.INNENRAEUME.push(raum);
  const g = new THREE.Group(); szene.add(g);
  const huhn = art === 'huhn';
  // Boden, Wände, Decke (selbst gezeichnet)
  const c = document.createElement('canvas'); c.width = c.height = 256; const cx = c.getContext('2d');
  for(let y = 0; y < 8; y++) for(let x = 0; x < 8; x++){ cx.fillStyle = (x + y) % 2 ? (huhn ? '#e9e2d4' : '#2c2f35') : (huhn ? '#b8302a' : '#3a3e46'); cx.fillRect(x*32, y*32, 32, 32); }
  const bodenTex = new THREE.CanvasTexture(c); bodenTex.colorSpace = THREE.SRGBColorSpace; bodenTex.wrapS = bodenTex.wrapT = THREE.RepeatWrapping; bodenTex.repeat.set(B/4, TI/4);
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(B, TI).rotateX(-Math.PI/2), new THREE.MeshStandardMaterial({ map: bodenTex, roughness: .35, metalness: .05 }));
  boden.position.set(ox, .01, oz); boden.receiveShadow = true; g.add(boden);
  const wandMat = new THREE.MeshStandardMaterial({ color: huhn ? 0xfff3dc : 0x4a4f58, roughness: .8 });
  const leiste = new THREE.MeshStandardMaterial({ color: huhn ? 0xc8352c : 0x1d1f24, roughness: .6 });
  const wand = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), wandMat); m.position.set(x, H/2, z); g.add(m);
    const l = new THREE.Mesh(new THREE.BoxGeometry(w + .02, .9, d + .02), leiste); l.position.set(x, .45, z); g.add(l);
    W.hindernis(x - w/2, x + w/2, z - d/2, z + d/2, -1, H + 1, 'wand'); };
  wand(B, .3, ox, raum.z0 - .15); wand(B, .3, ox, raum.z1 + .15); wand(.3, TI, raum.x0 - .15, oz); wand(.3, TI, raum.x1 + .15, oz);
  const decke = new THREE.Mesh(new THREE.PlaneGeometry(B, TI).rotateX(Math.PI/2), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, roughness: .9 }));
  decke.position.set(ox, H, oz); g.add(decke);
  for(const x of [-5, 0, 5]) for(const z of [-3, 2.5]){
    const lampe = new THREE.Mesh(new THREE.BoxGeometry(1.6, .06, .5), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 1.25, 1.15) }));
    lampe.position.set(ox + x, H - .04, oz + z); g.add(lampe);
  }
  for(const x of [-4.5, 4.5]){ const l = new THREE.PointLight(huhn ? 0xffe8c8 : 0xe8eeff, 14, 18, 1.5); l.position.set(ox + x, H - .4, oz); g.add(l); }
  // Tür (innen), Theke, Kasse, Verkäufer
  const tuer = new THREE.Mesh(new THREE.BoxGeometry(2, 2.6, .08), new THREE.MeshStandardMaterial({ color: 0x0b1117, metalness: .8, roughness: .1 }));
  tuer.position.set(ox, 1.3, raum.z1 - .02); g.add(tuer);
  const kasse = kulissenStueck('i_kasse', 1.25); kasse.position.set(ox, 0, raum.z0 + 2.6); g.add(kasse);
  W.hindernis(ox - kasse.userData.breite/2, ox + kasse.userData.breite/2, raum.z0 + 2.6 - kasse.userData.tiefe/2, raum.z0 + 2.6 + kasse.userData.tiefe/2, -1, 2, 'theke');
  for(const x of [-6, 6]){ const th = kulissenStueck('i_theke', 1.05); th.rotation.y = Math.PI/2; th.position.set(ox + x, 0, raum.z0 + .8); g.add(th); }
  W.hindernis(raum.x0, raum.x1, raum.z0, raum.z0 + 1.4, -1, 2, 'theke');
  const verkaeufer = baueFigur(huhn ? 4 : 6); verkaeufer.g.position.set(ox + .4, 0, raum.z0 + 1.7); verkaeufer.g.rotation.y = 0; g.add(verkaeufer.g);
  if(huhn){
    const essen = kulissenStueck('i_essen', .35); essen.position.set(ox - 1.4, 1.02, raum.z0 + 2.7); g.add(essen);
    for(const [x, z] of [[-5.5, 2], [5.5, 2], [-5.5, -1.6], [5.5, -1.6]]){ const t = kulissenStueck('i_tisch', 1.15); t.position.set(ox + x, 0, oz + z); g.add(t); W.hindernis(ox + x - .7, ox + x + .7, oz + z - .7, oz + z + .7, -1, 1.2, 'tisch'); }
    for(const x of [raum.x0 + .05, raum.x1 - .05]){ const pst = kulissenStueck('i_poster', 1.9); pst.position.set(x, 1.4, oz - 1); pst.rotation.y = x < ox ? 0 : Math.PI; g.add(pst); }
    const statue = kulissenStueck('i_huhn', 2.2); statue.position.set(raum.x1 - 1.4, 0, raum.z1 - 1.6); statue.rotation.y = -Math.PI*.75; g.add(statue);
  } else {
    // Waffen an der Rückwand
    const brett = new THREE.Mesh(new THREE.BoxGeometry(12, 2.2, .08), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: .8 }));
    brett.position.set(ox, 2.6, raum.z0 + .06); g.add(brett);
    ['pistole', 'revolver', 'schrot', 'uzi', 'gewehr'].forEach((t, i) => { const w = baueWaffe(t, 2.2); w.rotation.set(0, Math.PI/2, 0); w.position.set(ox - 4.8 + i*2.4, 2.6, raum.z0 + .25); g.add(w); });
  }
  // Schild über der Theke
  const tex = T.schild(L.schild, L.schildFarbe, '72px ' + schrift);
  const sch = new THREE.Mesh(new THREE.PlaneGeometry(8, 2.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(.9, .9, .9) }));
  sch.position.set(ox, 3.7, raum.z0 + .12); g.add(sch);
  return { raum, ausgang: { x: ox, z: raum.z1 - 1.1 }, theke: { x: ox, z: raum.z0 + 3.9 }, start: { x: ox, z: raum.z1 - 2.2 } };
}
function laedenBauen(){
  for(const l of W.markantes.laeden || []){
    const L = LADEN[l.art];
    // Schild an der Fassade und (beim Hähnchenladen) das Maskottchen auf dem Dach
    const tex = T.schild(L.schild, L.schildFarbe, '72px ' + schrift);
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1, 1, 1) });
    W.neon.push({ mat: m, basis: new THREE.Color(1, 1, 1), tag: 1, nacht: 2.2 });
    const sch = new THREE.Mesh(new THREE.PlaneGeometry(20, 5.5), m); sch.position.set(l.cx, 4.6, l.z1 + .3); szene.add(sch);
    if(l.art === 'huhn'){ const h = kulissenStueck('i_huhn', 7); h.position.set(l.cx, l.dachY, l.cz); szene.add(h); }
    const tuer = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.7, .1), new THREE.MeshStandardMaterial({ color: 0x0b1117, metalness: .8, roughness: .1, emissive: new THREE.Color(L.farbe), emissiveIntensity: .25 }));
    tuer.position.set(l.tuerX, 1.5, l.z1 + .06); szene.add(tuer);
    const s2 = strahl(new THREE.Color(L.farbe).multiplyScalar(1.4), .9, 3); s2.position.set(l.tuerX, W.bodenY(l.tuerX, l.tuerZ), l.tuerZ);
    const innen = innenraum(l.art);
    ladenListe.push({ ...l, L, innen });
  }
}
const _blende = () => { const el = $('blende'); el.classList.add('an'); setTimeout(() => el.classList.remove('an'), 420); };
function laedenUpdate(dt){
  tuerSperre -= dt;
  if(spieler.modus !== 'fuss' || ladenOffen) return;
  if(!drinnen){
    for(const l of ladenListe){
      if(Math.hypot(spieler.x - l.tuerX, spieler.z - l.tuerZ) > 1.5 || tuerSperre > 0) continue;
      tuerSperre = 1.2;
      if(sterne > 0){ meldung('Mit der Polizei auf den Fersen lässt dich niemand rein'); continue; }
      _blende(); ton.tuer();
      drinnen = l.innen; drinnen.laden = l;
      spieler.x = drinnen.start.x; spieler.z = drinnen.start.z; spieler.y = 0; spieler.h = Math.PI; kam.yaw = Math.PI; kam.pitch = .15;
      meldung('Willkommen bei ' + l.L.name);
      return;
    }
  } else {
    const d = drinnen;
    if(Math.hypot(spieler.x - d.ausgang.x, spieler.z - d.ausgang.z) < 1.1 && tuerSperre <= 0 && Math.cos(spieler.h) > 0){
      tuerSperre = 1.2; _blende(); ton.tuer();
      const l = d.laden; drinnen = null;
      spieler.x = l.tuerX; spieler.z = l.tuerZ + 2.2; spieler.y = W.bodenY(spieler.x, spieler.z); spieler.h = 0; kam.yaw = 0;
      return;
    }
    if(Math.hypot(spieler.x - d.theke.x, spieler.z - d.theke.z) < 1.8){
      eingabeHinweis(d.laden.art === 'huhn' ? 'Bestellen' : 'Einkaufen');
      if(taste('KeyE') || taste('KeyF')) ladenAuf(d.laden);
    }
  }
}
function ladenAuf(l){
  ladenOffen = l; tasten.clear();
  try { document.exitPointerLock && document.exitPointerLock(); } catch(_){}
  $('ladenTitel').textContent = l.L.name;
  ladenListeZeigen();
  $('laden').classList.add('an');
  setTimeout(() => { const b = $('ladenWaren').querySelector('button:not(:disabled)'); if(b) b.focus({ preventScroll: true }); }, 30);
}
function ladenListeZeigen(){
  const l = ladenOffen, el = $('ladenWaren'); el.innerHTML = '';
  $('ladenGeld').textContent = '$' + geld.toLocaleString('de-DE');
  for(const w of l.L.waren){
    const info = typeof w.info === 'function' ? w.info() : w.info;
    const geht = (!w.geht || w.geht()) && geld >= w.preis;
    const b = document.createElement('button'); b.className = 'ware'; b.disabled = !geht;
    b.innerHTML = `<span><b>${w.name}</b><small>${info}</small></span><em>$${w.preis}</em>`;
    b.addEventListener('click', () => { if(geld < w.preis) return; geldDazu(-w.preis); w.kauf(); ton.muenze(); ladenListeZeigen(); });
    el.appendChild(b);
  }
}
function ladenZu(){ ladenOffen = null; $('laden').classList.remove('an'); }

/* ── Effekte ───────────────────────────────────────────────────── */
const blitzLicht = new THREE.PointLight(0xff9a40, 0, 120, 1.6);
szene.add(blitzLicht);
const feuerball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, .4), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
feuerball.visible = false; szene.add(feuerball);
let feuerZeit = 0;
function explosion(x, y, z, wasser){
  feuerball.position.set(x, y, z); feuerball.visible = true; feuerZeit = 0;
  feuerball.material.color.set(wasser ? new THREE.Color(2, 2.4, 2.8) : new THREE.Color(4, 1.6, .4));
  blitzLicht.position.set(x, y + 3, z); blitzLicht.intensity = wasser ? 0 : 900;
  kam.wackel = 1; ton.krach(1);
}
function effekteUpdate(dt){
  if(feuerball.visible){
    feuerZeit += dt;
    feuerball.scale.setScalar(2 + feuerZeit*22);
    feuerball.material.opacity = Math.max(0, 1 - feuerZeit/1.1);
    blitzLicht.intensity *= Math.exp(-dt*4);
    if(feuerZeit > 1.1){ feuerball.visible = false; blitzLicht.intensity = 0; }
  }
}
// Kielwasser
const spurMax = 70;
const spurMat = new THREE.MeshBasicMaterial({ map: T.ring(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffffff });
const spur = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI/2), spurMat, spurMax);
spur.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(spurMax*3), 3);
spur.frustumCulled = false; szene.add(spur);
const spurTeile = Array.from({ length: spurMax }, () => ({ x: 0, z: 0, t: 9, s: 1 }));
let spurNr = 0, spurTakt = 0;
function bootSpur(f, dt){
  spurTakt -= dt;
  if(Math.abs(f.vf) > 4 && spurTakt < 0){
    spurTakt = .06;
    const p = spurTeile[spurNr++ % spurMax];
    p.x = f.x - Math.sin(f.h)*4.6; p.z = f.z - Math.cos(f.h)*4.6; p.t = 0; p.s = 2 + Math.abs(f.vf)*.05;
  }
}
const _farbe = new THREE.Color();
function spurUpdate(dt){
  spurTeile.forEach((p, i) => {
    p.t += dt;
    const leben = Math.max(0, 1 - p.t/2.6);
    _v3.set(p.x, W.WASSER_Y + .05, p.z); _q4.identity(); _s3.setScalar(leben > 0 ? p.s + p.t*3.2 : 0);
    _m4.compose(_v3, _q4, _s3); spur.setMatrixAt(i, _m4);
    _farbe.setScalar(leben*.55); spur.setColorAt(i, _farbe);
  });
  spur.instanceMatrix.needsUpdate = true; spur.instanceColor.needsUpdate = true;
}

/* ── Kamera ────────────────────────────────────────────────────── */
const kamZiel = new THREE.Vector3();
function kameraUpdate(dt){
  const m = spieler.modus;
  let x = spieler.x, y = spieler.y, z = spieler.z, dist = 5.8, hoehe = 1.55, grundPitch = .26;
  if(m === 'auto'){ dist = 8.8; hoehe = 1.75; grundPitch = .25; }
  if(m === 'boot'){ dist = 13; hoehe = 2.6; grundPitch = .2; }
  if(m === 'flug'){ dist = 24; hoehe = 3; grundPitch = .14; }
  if(m === 'tot'){ x = totPos.x; y = Math.max(totPos.y, W.bodenY(totPos.x, totPos.z)); z = totPos.z; dist = 14 + totZeit*4; kam.yaw += dt*.25; }
  if(m === 'fall'){ dist = 9; hoehe = 2.5; }
  if(drinnen){ dist = 3.4; hoehe = 1.6; }
  if(kam.dx || kam.dy){
    kam.yaw -= kam.dx*.0042*einst.empf; kam.pitch = klemm(kam.pitch + kam.dy*.0032*einst.empf*(einst.umkehren ? -1 : 1), -.25, 1.25);
    kam.dx = kam.dy = 0; kam.hand = uhr;
  }
  const f = spieler.fz;
  if(f && uhr - kam.hand > (f.art === 'auto' ? .7 : 1.4)){
    const fahrt = f.art === 'flug' ? f.flug.tempo : Math.abs(f.vf);
    if(fahrt > 2){
      let soll = f.h;
      if(f.art !== 'flug' && f.vf < -2) soll = f.h; // rückwärts nicht umdrehen
      kam.yaw = daempfW(kam.yaw, soll, f.art === 'flug' ? 3 : f.art === 'auto' ? 5 : 2.6, dt);
      const pSoll = f.art === 'flug' ? grundPitch + f.flug.pitch*.6 : grundPitch;
      kam.pitch = daempf(kam.pitch, pSoll, 2, dt);
    }
  }
  kamZiel.set(x, y + hoehe, z);
  const D = dist*kam.zoom*(1 + (f ? Math.min(Math.abs(f.vf), 50)/160 : 0));
  const cp = Math.cos(kam.pitch);
  const dx = -Math.sin(kam.yaw)*cp, dy = Math.sin(kam.pitch), dz = -Math.cos(kam.yaw)*cp;
  // Kamera gegen Häuser
  let d = D;
  for(let i = 1; i <= 10; i++){
    const t = i/10*D;
    if(W.inHindernis(kamZiel.x + dx*t, kamZiel.y + dy*t, kamZiel.z + dz*t)){ d = Math.max(1.2, t - .6); break; }
  }
  kamera.position.set(kamZiel.x + dx*d, kamZiel.y + dy*d, kamZiel.z + dz*d);
  const bodenK = W.begehbar(kamera.position.x, kamera.position.z) ? W.bodenY(kamera.position.x, kamera.position.z) + .4 : W.WASSER_Y + .6;
  if(kamera.position.y < bodenK) kamera.position.y = bodenK;
  if(drinnen){ const r = drinnen.raum; kamera.position.x = klemm(kamera.position.x, r.x0 + .3, r.x1 - .3); kamera.position.z = klemm(kamera.position.z, r.z0 + .3, r.z1 - .3); kamera.position.y = Math.min(kamera.position.y, 4.1); }
  if(kam.wackel > 0){
    kamera.position.x += (Math.random() - .5)*kam.wackel*.6; kamera.position.y += (Math.random() - .5)*kam.wackel*.4;
    kam.wackel = Math.max(0, kam.wackel - dt*2.2);
  }
  kamera.lookAt(kamZiel);
  fuell.position.set(kamera.position.x, kamera.position.y + 2.5, kamera.position.z); fuell.target.position.copy(kamZiel);
  const fovSoll = 62 + (f ? Math.min(Math.abs(f.vf), 60)*.22 : 0);
  kamera.fov = daempf(kamera.fov, fovSoll, 3, dt); kamera.updateProjectionMatrix();
}
// Titelbild: langsamer Flug um die Innenstadt
function titelKamera(t){
  fuell.position.copy(kamera.position); fuell.target.position.set(30, 45, 40);
  const a = t*.04 + 1.1;
  kamera.position.set(40 + Math.cos(a)*330, 95 + Math.sin(t*.07)*20, 60 + Math.sin(a)*330);
  kamera.lookAt(30, 45, 40);
  kamera.fov = 55; kamera.updateProjectionMatrix();
}

/* ── Ton (alles synthetisch) ───────────────────────────────────── */
const ton = (() => {
  let ctx = null, master = null, motor = null, sirene = null, wellen = null, an = speicherLesen('autostehlen.ton', true), geraeuschT = 2;
  function start(){
    if(ctx) { if(ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = an ? einst.laut*.9 : 0; master.connect(ctx.destination);
      // Motor
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), fi = ctx.createBiquadFilter(), g = ctx.createGain();
      o1.type = 'sawtooth'; o2.type = 'square'; fi.type = 'lowpass'; fi.frequency.value = 500; g.gain.value = 0;
      o1.connect(fi); o2.connect(fi); fi.connect(g); g.connect(master); o1.start(); o2.start();
      motor = { o1, o2, fi, g };
      // Sirene
      const so = ctx.createOscillator(), sg = ctx.createGain(); so.type = 'triangle'; sg.gain.value = 0; so.connect(sg); sg.connect(master); so.start();
      sirene = { so, sg };
      // Meer und Stadt: gefiltertes Rauschen
      const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate*3, ctx.sampleRate), d = buf.getChannelData(0);
      let letzte = 0; for(let i = 0; i < d.length; i++){ letzte = (letzte + .02*(Math.random()*2 - 1))/1.02; d[i] = letzte*3.5; }
      n.buffer = buf; n.loop = true;
      const nf = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 600;
      const ng = ctx.createGain(); ng.gain.value = .12;
      n.connect(nf); nf.connect(ng); ng.connect(master); n.start();
      wellen = ng;
    } catch(e){ ctx = null; }
  }
  function piep(f, dauer, typ = 'square', lautst = .2, glide = 0){
    if(!ctx || !an) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    o.type = typ; o.frequency.setValueAtTime(f, t); if(glide) o.frequency.exponentialRampToValueAtTime(glide, t + dauer);
    g.gain.setValueAtTime(lautst, t); g.gain.exponentialRampToValueAtTime(.001, t + dauer);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dauer + .02);
  }
  function rauschen(dauer, lautst, freq){
    if(!ctx || !an) return;
    const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate*dauer), ctx.sampleRate), d = buf.getChannelData(0);
    for(let i = 0; i < d.length; i++) d[i] = (Math.random()*2 - 1)*(1 - i/d.length);
    n.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = lautst;
    n.connect(f); f.connect(g); g.connect(master); n.start();
  }
  return {
    start,
    get an(){ return an; },
    umschalten(){ an = !an; speicherSchreiben('autostehlen.ton', an); if(master) master.gain.value = an ? einst.laut*.9 : 0; return an; },
    lautstaerke(){ if(master) master.gain.value = an ? einst.laut*.9 : 0; },
    menue(){ piep(660, .05, 'triangle', .07); },
    wahl(){ piep(520, .07, 'square', .08); setTimeout(() => piep(880, .1, 'square', .07), 60); },
    update(dt){
      if(!ctx) return;
      const t = ctx.currentTime;
      const f = spieler.fz;
      if(f && an && !pausiert){
        const v = Math.abs(f.art === 'flug' ? f.flug.tempo : f.vf);
        let drehzahl;
        if(f.art === 'flug') drehzahl = 60 + f.flug.schub*110;
        else { const gang = Math.min(5, Math.floor(v/11)); drehzahl = 38 + (v - gang*11)*6.5 + gang*7; }
        motor.o1.frequency.setTargetAtTime(drehzahl, t, .05);
        motor.o2.frequency.setTargetAtTime(drehzahl*.5, t, .05);
        motor.fi.frequency.setTargetAtTime(300 + drehzahl*8, t, .08);
        motor.g.gain.setTargetAtTime(f.art === 'boot' ? .07 : .085, t, .1);
      } else motor.g.gain.setTargetAtTime(0, t, .1);
      // Sirene der nächsten Streife
      let nah = Infinity;
      for(const s of streifen) if(s.f.g.visible && sterne > 0) nah = Math.min(nah, Math.hypot(s.f.x - spieler.px, s.f.z - spieler.pz));
      const sl = nah < 220 && !pausiert ? (1 - nah/220)*.07 : 0;
      sirene.sg.gain.setTargetAtTime(sl, t, .2);
      sirene.so.frequency.setTargetAtTime(760 + Math.sin(t*5.5)*260, t, .02);
      wellen.gain.setTargetAtTime(pausiert || !laeuft ? .03 : .1, t, .5);
      // Stadtgeräusche: tags Vögel und ferne Hupen, nachts Grillen, am Wasser Möwen
      if(!pausiert && laeuft && an && !drinnen){
        geraeuschT -= dt;
        if(geraeuschT < 0){
          geraeuschT = .6 + Math.random()*2.2;
          const amWasser = !W.begehbar(spieler.px + 40, spieler.pz) || !W.begehbar(spieler.px - 40, spieler.pz) || spieler.px > 520;
          const r = Math.random();
          if(nacht > .5){ if(r < .7){ for(let i = 0; i < 3; i++) setTimeout(() => piep(4200 + Math.random()*300, .04, 'sine', .015), i*90); } }
          else if(amWasser && r < .5){ piep(1500 + Math.random()*300, .5, 'sawtooth', .025, 900); }
          else if(r < .45){ const f = 2600 + Math.random()*1400; piep(f, .07, 'sine', .02, f*1.3); setTimeout(() => piep(f*1.1, .06, 'sine', .018, f*.9), 110); }
          else if(r < .55){ piep(360 + Math.random()*80, .35, 'square', .012); }
        }
      }
    },
    muenze(){ piep(988, .08, 'square', .12); setTimeout(() => piep(1318, .18, 'square', .12), 70); },
    erfolg(){ [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => piep(f, .2, 'square', .1), i*110)); },
    krach(s){ rauschen(.35 + s*.3, .5*s + .1, 900); piep(90, .25, 'sawtooth', .2*s, 40); },
    dumpf(s){ rauschen(.15, .35*s, 400); },
    tuer(){ piep(180, .08, 'square', .12, 90); },
    hupe(s){ piep(420, .3, 'square', .08*s); piep(520, .3, 'square', .06*s); },
    alarm(){ piep(300, .6, 'sawtooth', .15, 120); },
    schuss(fern, k = 1){ rauschen(.1 + .08/k, fern ? .18 : .5, fern ? 1400 : 2400*k); piep(fern ? 160 : 180*k, .08, 'square', fern ? .05 : .13, 50); },
    piepLeer(){ piep(900, .03, 'square', .06); },
  };
})();

/* ── HUD ───────────────────────────────────────────────────────── */
let geldAngezeigt = -1, geldZiel = 0;
function hudGeld(delta){
  geldZiel = geld;
  if(delta){ const el = $('geldDelta'); el.textContent = (delta > 0 ? '+$' : '−$') + Math.abs(delta); el.className = delta > 0 ? 'plus an' : 'minus an'; clearTimeout(hudGeld.t); hudGeld.t = setTimeout(() => el.className = '', 1800); }
}
function hudSterne(){
  const el = $('sterne');
  el.innerHTML = '';
  for(let i = 0; i < 5; i++){ const s = document.createElement('span'); s.textContent = '★'; if(i < sterne) s.className = 'an'; el.appendChild(s); }
  el.classList.toggle('blinkt', sterne > 0 && sternZeit > 4);
}
let meldTimer;
function meldung(t){
  const el = $('meldung'); el.textContent = t; el.classList.add('an');
  clearTimeout(meldTimer); meldTimer = setTimeout(() => el.classList.remove('an'), 2600);
}
let grossTimer;
function grossText(a, b, s){
  $('grossA').textContent = a; $('grossB').textContent = b || '';
  $('gross').classList.add('an');
  clearTimeout(grossTimer); grossTimer = setTimeout(() => $('gross').classList.remove('an'), s*1000);
}
let hinweisAlt = undefined;
function eingabeHinweis(t){
  if(t === hinweisAlt) return; hinweisAlt = t;
  const el = $('hinweis');
  if(!t){ el.classList.remove('an'); $('kAktion').classList.remove('bereit'); return; }
  el.innerHTML = (TOUCH ? '' : '<kbd>E</kbd> ') + t; el.classList.add('an');
  $('kAktion').classList.add('bereit');
}
function hudAuftrag(){
  const el = $('auftrag');
  if(!auftrag){ el.classList.remove('an'); return; }
  el.classList.add('an');
  $('auftragText').textContent = auftrag.text;
  $('auftragLohn').textContent = '$' + auftrag.lohn;
}
let modusAlt = '';
function hudModus(){
  if(spieler.modus === modusAlt) return; modusAlt = spieler.modus;
  const m = spieler.modus;
  $('tacho').classList.toggle('an', m === 'auto' || m === 'boot' || m === 'flug');
  $('hoehe').classList.toggle('an', m === 'flug');
  const L = {
    fuss: ['Aktion', 'Sprung', 'Rennen'], auto: ['Raus', 'Bremse', 'Boost'], boot: ['Raus', 'Bremse', '—'],
    flug: ['Fallschirm', 'Schub −', 'Schub +'], tot: ['', '', ''], fall: ['', '', ''],
  }[m] || ['', '', ''];
  $('kSchuss').hidden = m !== 'fuss';
  $('kAktion').textContent = L[0]; $('kSprung').textContent = L[1]; $('kSprint').textContent = L[2];
}
function uhrText(){
  const h = Math.floor(stunde), mi = Math.floor((stunde - h)*60);
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}
let hudTakt = 0;
function hudUpdate(dt){
  if(geldAngezeigt !== geldZiel){
    const d = geldZiel - geldAngezeigt;
    geldAngezeigt = Math.abs(d) < 3 || geldAngezeigt < 0 ? geldZiel : Math.round(geldAngezeigt + d*Math.min(1, dt*6));
    $('geld').textContent = '$' + geldAngezeigt.toLocaleString('de-DE').padStart(1, '0');
  }
  hudTakt -= dt;
  if(hudTakt < 0){
    hudTakt = .1;
    $('uhr').textContent = uhrText();
    const f = spieler.fz;
    if(f){
      const v = f.art === 'flug' ? f.flug.tempo : Math.abs(f.vf);
      $('tachoZahl').textContent = Math.round(v*3.6);
      if(f.art === 'flug'){ $('hoehe').textContent = Math.round(f.y*3.28) + ' ft · Schub ' + Math.round(f.flug.schub*100) + ' %'; }
    }
    $('sterne').classList.toggle('blinkt', sterne > 0 && sternZeit > 4);
    $('lebenBalken').style.width = leben + '%';
    $('leben').classList.toggle('knapp', leben < 30);
  }
  hudModus();
}

/* ── Karte ─────────────────────────────────────────────────────── */
const KARTE = 1024, WELTK = 1800;
const kartePre = document.createElement('canvas'); kartePre.width = kartePre.height = KARTE;
const km = v => (v + WELTK/2)/WELTK*KARTE;
function karteVorrendern(){
  const g = kartePre.getContext('2d');
  g.fillStyle = '#16324f'; g.fillRect(0, 0, KARTE, KARTE);
  const rect = (r, c) => { g.fillStyle = c; g.fillRect(km(r.x0), km(r.z0), km(r.x1) - km(r.x0), km(r.z1) - km(r.z0)); };
  rect(W.FESTLAND, '#33413f'); rect(W.INSEL, '#33413f');
  rect({ x0: 536, x1: 570, z0: -560, z1: 560 }, '#cdb47e');
  for(const b of W.bloecke) rect(b, b.art === 'park' ? '#2f5b3a' : '#4a5658');
  for(const h of W.hindernisse) if(h.art === 'haus' && h.y1 > 2) rect(h, '#2b3335');
  g.strokeStyle = '#a7b3bd'; g.lineWidth = 16/WELTK*KARTE; g.lineCap = 'square';
  for(const k of W.kanten){ const A = W.knoten[k.a], B = W.knoten[k.b]; g.beginPath(); g.moveTo(km(A.x), km(A.z)); g.lineTo(km(B.x), km(B.z)); g.stroke(); }
  rect({ x0: -695, x1: -455, z0: -20, z1: 20 }, '#7d858c');
  for(const s of W.STEGE) rect(s, '#8a6a4a');
}
const mini = $('mini'), miniG = mini.getContext('2d');
const gross = $('karteGross'), grossG = gross.getContext('2d');
function blips(){
  const l = [];
  for(const j of JOBS) if(!auftrag) l.push({ x: j.x, z: j.z, c: '#ffc233', r: 5, form: 'j' });
  if(auftrag) l.push({ x: auftrag.ziel.x, z: auftrag.ziel.z, c: '#ff4fd0', r: 7, form: 'ziel', rand: true });
  for(const s of streifen) if(s.f.g.visible) l.push({ x: s.f.x, z: s.f.z, c: Math.floor(uhr*6) % 2 ? '#3a7bff' : '#ff3a3a', r: 4.5 });
  if(spieler.modus !== 'flug' && flieger.g.visible) l.push({ x: flieger.x, z: flieger.z, c: '#e9edf5', r: 4, form: 'f' });
  return l;
}
function miniKarte(){
  const S = mini.width, c = S/2;
  const g = miniG;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI*2); g.clip();
  g.fillStyle = '#16324f'; g.fillRect(0, 0, S, S);
  const f = spieler.fz;
  const tempo = f ? Math.abs(f.art === 'flug' ? f.flug.tempo : f.vf) : 0;
  const sicht = (spieler.modus === 'flug' ? 600 : 170) + tempo*2.2;
  const k = c/sicht;
  const fy = Math.sin(kam.yaw), fz = Math.cos(kam.yaw), rx = -fz, rz = fy;
  const a = rx*k, cc = rz*k, b = -fy*k, d = -fz*k;
  const px = spieler.px, pz = spieler.pz;
  g.setTransform(a, b, cc, d, c - (a*px + cc*pz), c - (b*px + d*pz));
  g.drawImage(kartePre, -WELTK/2, -WELTK/2, WELTK, WELTK);
  g.setTransform(1, 0, 0, 1, 0, 0);
  for(const p of blips()){
    let sx = a*(p.x - px) + cc*(p.z - pz), sy = b*(p.x - px) + d*(p.z - pz);
    const l = Math.hypot(sx, sy), max = c - 9;
    if(l > max){ if(!p.rand && !p.form) continue; sx = sx/l*max; sy = sy/l*max; }
    zeichneBlip(g, c + sx, c + sy, p);
  }
  // Spieler: Pfeil in Blickrichtung des Spielers relativ zur Kamera
  const hw = (spieler.fz ? spieler.fz.h : spieler.h) - kam.yaw;
  g.save(); g.translate(c, c); g.rotate(-hw);
  g.fillStyle = '#ffffff'; g.strokeStyle = '#0b0d12'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.stroke(); g.fill();
  g.restore();
  g.restore();
  g.strokeStyle = sterne > 0 ? (Math.floor(uhr*4) % 2 ? '#ff3a3a' : '#3a7bff') : 'rgba(255,255,255,.55)';
  g.lineWidth = 3; g.beginPath(); g.arc(c, c, c - 2, 0, Math.PI*2); g.stroke();
  // Norden
  const nx = c + (b*0 + d*-1)*0, ny = 0;
  const nwx = -cc, nwy = -d; // Richtung -z (Norden)
  const nl = Math.hypot(nwx, nwy) || 1;
  g.fillStyle = '#ffffff'; g.font = 'bold 12px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('N', c + nwx/nl*(c - 12), c + nwy/nl*(c - 12));
  void nx; void ny;
}
function zeichneBlip(g, x, y, p){
  g.fillStyle = p.c; g.strokeStyle = '#0b0d12'; g.lineWidth = 2;
  if(p.form === 'j'){ g.beginPath(); g.arc(x, y, p.r + 2, 0, Math.PI*2); g.fill(); g.stroke(); g.fillStyle = '#0b0d12'; g.font = 'bold 9px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('A', x, y + .5); }
  else if(p.form === 'ziel'){ g.beginPath(); g.moveTo(x, y - p.r - 2); g.lineTo(x + p.r, y); g.lineTo(x, y + p.r + 2); g.lineTo(x - p.r, y); g.closePath(); g.fill(); g.stroke(); }
  else if(p.form === 'f'){ g.font = 'bold 13px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.strokeText('✈', x, y); g.fillText('✈', x, y); }
  else { g.beginPath(); g.arc(x, y, p.r, 0, Math.PI*2); g.fill(); g.stroke(); }
}
let karteOffen = false;
function karteUmschalten(){
  karteOffen = !karteOffen;
  $('karteBox').classList.toggle('an', karteOffen);
  if(karteOffen) grosseKarte();
}
function grosseKarte(){
  const S = Math.min(innerWidth - 32, innerHeight - 90, 900);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  gross.width = gross.height = Math.round(S*dpr); gross.style.width = gross.style.height = S + 'px';
  const g = grossG, k = S*dpr/WELTK;
  g.setTransform(1, 0, 0, 1, 0, 0);
  // Norden ist -z: das vorgerenderte Bild (x nach rechts, z nach unten) passt so, wie es ist
  g.drawImage(kartePre, 0, 0, gross.width, gross.height);
  const zu = (x, z) => [(x + WELTK/2)*k, (z + WELTK/2)*k];
  g.font = `bold ${13*dpr}px system-ui, sans-serif`; g.textAlign = 'center';
  const namen = [['Innenstadt', 20, 40], ['Flughafen', -580, 0], ['Die Bucht', 275, -40], ['Strandinsel', 485, 150], ['Wohnviertel', -400, -520], ['Wohnviertel', -400, 450]];
  g.fillStyle = 'rgba(255,255,255,.8)';
  for(const [n, x, z] of namen){ const [sx, sy] = zu(x, z); g.fillText(n, sx, sy); }
  for(const p of blips()){ const [sx, sy] = zu(p.x, p.z); zeichneBlip(g, sx, sy, { ...p, r: p.r*dpr }); }
  const [sx, sy] = zu(spieler.px, spieler.pz);
  const h = spieler.fz ? spieler.fz.h : spieler.h;
  g.save(); g.translate(sx, sy); g.rotate(Math.PI - h);
  g.fillStyle = '#ffffff'; g.strokeStyle = '#0b0d12'; g.lineWidth = 2*dpr;
  g.beginPath(); g.moveTo(0, -9*dpr); g.lineTo(7*dpr, 7*dpr); g.lineTo(0, 3*dpr); g.lineTo(-7*dpr, 7*dpr); g.closePath(); g.stroke(); g.fill();
  g.restore();
}

/* ── Welt-Updates ──────────────────────────────────────────────── */
function verkehrUpdate(dt){
  for(const f of verkehr){
    if(f === spieler.fz) continue;
    if(f.ki && f.ki.art === 'verkehr'){
      f.ki.update(dt); f.zeige(dt);
      const d = Math.hypot(f.x - spieler.px, f.z - spieler.pz);
      if(d > 400 && !verkehrEinsetzen(f, 170, 330)) f.g.visible = false;
    } else if(!f.ki && f.fahrer !== 'spieler'){
      // stehengelassen oder gerammt: rollt aus, wird später wieder Verkehr
      physik(f, { gas: 0, lenk: 0, hand: true }, dt); bewege(f, dt); f.zeige(dt);
      const d = Math.hypot(f.x - spieler.px, f.z - spieler.pz);
      if(d > 260){ verkehrEinsetzen(f, 170, 330); }
    } else if(!f.g.visible){ if(verkehrEinsetzen(f, 170, 330)) f.schaden = 0; }
  }
}
function parkUpdate(dt){
  for(const f of fahrzeuge){
    if(f === spieler.fz || f.ki || verkehr.includes(f) || f.art === 'flug') continue;
    if(f.zerstoert){ if(uhr - f.zerstoert > 60 && Math.hypot(f.x - spieler.px, f.z - spieler.pz) > 200){ f.zerstoert = 0; f.schaden = 0; } else { f.g.visible = false; continue; } }
    // abgestellte Autos weit weg gar nicht erst zeichnen
    if(f.art === 'auto' && !streifen.some(s => s.f === f)) f.g.visible = Math.abs(f.x - spieler.px) < 330 && Math.abs(f.z - spieler.pz) < 330;
    if(!f.g.visible) continue;
    if(Math.abs(f.vx) + Math.abs(f.vz) > .02){ physik(f, { gas: 0, lenk: 0, hand: true }, dt); bewege(f, dt); f.zeige(dt); }
    else if(f.art === 'boot') f.zeige(dt);
  }
}
function polizeiUpdate(dt){
  polizeiNachsetzen();
  let nahe = false;
  for(const s of streifen){
    const f = s.f;
    if(!f.g.visible || f === spieler.fz) continue;
    s.update(dt); f.zeige(dt);
    const d = Math.hypot(f.x - spieler.px, f.z - spieler.pz);
    if(sterne > 0 && d < 85 && sicht(f.x, f.z, spieler.px, spieler.pz)) nahe = true;
    if(sterne > 0 && d < 8 && spieler.tempo < 3.5 && spieler.modus !== 'flug' && spieler.modus !== 'fall' && spieler.modus !== 'tot') festnahme += dt*(1/streifen.length + .5);
    if((sterne === 0 && d > 140) || s.fern > 6){ f.g.visible = false; f.vx = f.vz = 0; }
  }
  // Blaulicht
  const t = uhr*7;
  MAT.blauLicht.color.setRGB(.05, .15, Math.sin(t) > 0 ? 6 : .3);
  MAT.rotLicht.color.setRGB(Math.sin(t) > 0 ? .3 : 6, .05, .05);
  if(sterne > 0){
    if(nahe) sternZeit = 0; else sternZeit += dt;
    if(sternZeit > 8 + sterne*3){ sterne = 0; sternZeit = 0; hudSterne(); meldung('Polizei abgehängt'); }
  }
  if(festnahme > 2.6) verhaftet();
  festnahme = Math.max(0, festnahme - dt*.4);
}
function verhaftet(){
  festnahme = 0;
  const strafe = Math.min(geld, Math.max(100, Math.round(geld*.1)));
  grossText('VERHAFTET', 'Kaution: $' + strafe, 3.2);
  ton.alarm();
  geldDazu(-strafe);
  sterne = 0; hudSterne();
  if(spieler.fz){ spieler.fz.fahrer = null; spieler.fz.vx = spieler.fz.vz = 0; }
  spieler.fz = null; spieler.modus = 'fuss';
  const p = W.markantes.polizei;
  spieler.x = p.x; spieler.z = p.z - 22; spieler.y = W.bodenY(spieler.x, spieler.z); spieler.h = Math.PI;
  for(const s of streifen){ s.f.g.visible = false; s.f.vx = s.f.vz = 0; }
  if(auftrag) auftragEnde(false);
  kam.yaw = Math.PI; spielerZeigen();
}
function leuteUpdate(dt){
  for(const p of leute){
    if(p.zustand === 'weg'){ personEinsetzen(p, 60, 180); continue; }
    const d = Math.hypot(p.x - spieler.px, p.z - spieler.pz);
    const fern = d > 150 && p.zustand !== 'kampf';
    p.m.g.visible = !fern;
    if(fern){ if(d > 230){ p.zustand = 'weg'; if(p.wm) p.wm.visible = false; } continue; }
    p.update(dt);
    if(d > 230 && p.zustand !== 'liegt'){ p.zustand = 'weg'; p.m.g.visible = false; if(p.wm) p.wm.visible = false; }
  }
  // Polizei fährt Leute nicht um, sie schiebt sie nur zur Seite
}
const moewen = [];
function moewenBauen(){
  const fluegel = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, .15, 0, 0, -.12, .7, .05, 0], 3));
  fluegel.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, side: THREE.DoubleSide, roughness: .8 });
  const koerperGeo = new THREE.SphereGeometry(.12, 6, 4).scale(1, .8, 2.6);
  for(let i = 0; i < 22; i++){
    const g = new THREE.Group();
    const k = new THREE.Mesh(koerperGeo, mat); g.add(k);
    const l = new THREE.Mesh(fluegel, mat), r = new THREE.Mesh(fluegel, mat); r.scale.x = -1;
    g.add(l, r); g.scale.setScalar(1.6); szene.add(g);
    const bucht = i < 14;
    moewen.push({ g, l, r, cx: bucht ? R(180, 380) : R(540, 640), cz: R(-450, 450), rad: R(25, 70), hoehe: R(14, 40), w: R(0, 6.28), v: R(.12, .25)*(Z() < .5 ? -1 : 1), flap: R(0, 6) });
  }
}
const werbeTexte = [
  ['CLOCKING CHICKEN', 'Gackert nie. Schmeckt immer.', '#ffb020'], ['PALMA BAY FM 98,6', 'Neon, Palmen, Synthwave', '#ff4fd0'],
  ['FLAMINGO LIMO', 'Die Rosa unter den Limonaden', '#ff6fa8'], ['KNALLHAUS', 'Seit 1987 in Palma Bay', '#ff4040'],
  ['SONNENSTUDIO 24/7', 'Braun werden ohne Strand', '#ffd24a'], ['HOTEL PARADISO', 'Zimmer mit Meerblick', '#3ee8ff'],
  ['AUTOHAUS KÖNIG', 'Kaufen ist auch eine Option', '#7dffb0'], ['PALMA BAY ZOO', 'Jetzt mit Alligatoren', '#8f6bff'],
];
function werbungBauen(){
  const pfosten = new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: .6, roughness: .5 });
  const texCache = {};
  for(const w of W.werbung){
    const [titel, unter, farbe] = werbeTexte[w.nr % werbeTexte.length];
    let tex = texCache[w.nr];
    if(!tex){
      const c = document.createElement('canvas'); c.width = 1024; c.height = 384; const g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#1a1030'); gr.addColorStop(1, '#2d1748'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 384);
      g.strokeStyle = farbe; g.lineWidth = 10; g.strokeRect(14, 14, 996, 356);
      g.textAlign = 'center'; g.fillStyle = farbe; g.shadowColor = farbe; g.shadowBlur = 24;
      g.font = '120px ' + schrift; let b = g.measureText(titel).width; if(b > 940) g.font = Math.floor(120*940/b) + 'px ' + schrift;
      g.fillText(titel, 512, 200); g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.font = '600 48px system-ui, sans-serif'; g.fillText(unter, 512, 300);
      tex = texCache[w.nr] = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    }
    const breite = Math.min(22, w.breite), hoehe = breite*.375;
    const grp = new THREE.Group(); grp.position.set(w.x, w.y, w.z); grp.rotation.y = w.rot;
    const m = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: .4, roughness: .6 });
    W.fensterMats.push(m);
    const tafel = new THREE.Mesh(new THREE.PlaneGeometry(breite, hoehe), m); tafel.position.y = 3 + hoehe/2; grp.add(tafel);
    const rueck = new THREE.Mesh(new THREE.BoxGeometry(breite + .4, hoehe + .4, .3), pfosten); rueck.position.set(0, 3 + hoehe/2, -.2); grp.add(rueck);
    for(const x of [-breite*.35, breite*.35]){ const p = new THREE.Mesh(new THREE.BoxGeometry(.3, 3.2, .3), pfosten); p.position.set(x, 1.6, -.2); grp.add(p); }
    szene.add(grp);
  }
}
let ampelTakt = 0, viertelTakt = 0;
function umgebungUpdate(dt, t){
  if((ampelTakt -= dt) < 0){ ampelTakt = .25; W.ampelnZeigen(uhr); }
  for(const m of moewen){
    m.w += m.v*dt; m.flap += dt*(6 + Math.sin(t*.7 + m.cx)*2);
    const x = m.cx + Math.cos(m.w)*m.rad, z = m.cz + Math.sin(m.w)*m.rad;
    m.g.position.set(x, m.hoehe + Math.sin(t*.5 + m.cz)*2, z);
    m.g.rotation.set(0, Math.atan2(-Math.sin(m.w)*Math.sign(m.v), Math.cos(m.w)*Math.sign(m.v)), Math.sign(m.v)*.25);
    const f = Math.sin(m.flap)*.6; m.l.rotation.z = f; m.r.rotation.z = -f;
  }
  // Linienflieger zieht große Kreise
  const lf = umgebung.flieger;
  const a = t*.022;
  lf.g.position.set(Math.cos(a)*1100, 430 + Math.sin(t*.05)*30, Math.sin(a)*1100);
  lf.g.rotation.set(0, -a, -.18, 'YXZ');
  lf.blitz.visible = Math.floor(t*1.2) % 2 === 0;
  lf.prop.rotation.z += dt*40;
  const hs = umgebung.heli;
  const b = -t*.09;
  hs.g.position.set(30 + Math.cos(b)*190, 150 + Math.sin(t*.3)*8, 40 + Math.sin(b)*190);
  hs.g.rotation.set(.12, -b + Math.PI, .2, 'YXZ');
  hs.rotor.rotation.y += dt*28;
  hs.blitz.visible = Math.floor(t*1.6) % 2 === 0;
  for(const u of umgebung.boote){
    u.t += dt*u.v;
    const x = u.cx + Math.cos(u.t)*u.rx, z = u.cz + Math.sin(u.t)*u.rz;
    const dx = -Math.sin(u.t)*u.rx, dz = Math.cos(u.t)*u.rz;
    u.m.g.position.set(x, W.WASSER_Y - .45 + Math.sin(t*1.7 + x)*.1, z);
    u.m.g.rotation.set(-.12, Math.atan2(dx, dz), Math.sin(t)*.03, 'YXZ');
    u.x = x; u.z = z;
    if(Math.random() < dt*12){ const p = spurTeile[spurNr++ % spurMax]; p.x = x - Math.sin(Math.atan2(dx, dz))*4.6; p.z = z - Math.cos(Math.atan2(dx, dz))*4.6; p.t = 0; p.s = 2.6; }
  }
  // Riesenrad
  const rd = W.markantes.rad;
  if(rd){
    rd.rad.rotation.x = t*.05;
    rd.gondeln.forEach((g, i) => {
      const w = t*.05 + i/rd.gondeln.length*Math.PI*2;
      g.position.set(0, rd.Y + Math.cos(w)*rd.R - 1.6, -Math.sin(w)*rd.R);
    });
  }
  if(W.markantes.warnMat) W.markantes.warnMat.color.setRGB(Math.sin(t*2.5) > .3 ? 6 : .2, .05, .05);
  wasserNormal.offset.set(t*.004, t*.0025);
  gischtMat.opacity = .25 + .2*Math.sin(t*1.1);
  gischt.position.x = 587 + Math.sin(t*1.1)*.8;
}
function schattenFolgen(){
  sonne.target.position.set(spieler.px, 0, spieler.pz);
  const s = sonne.intensity > .01 ? 1 : 0;
  const dir = nacht > .6 ? _v3.copy(sonnenRichtung).negate() : _v3.copy(sonnenRichtung);
  if(dir.y < .08) dir.y = .08;
  dir.normalize();
  // auf Schatten-Texel einrasten, damit Kanten nicht flimmern
  const raster = (Q.schatten >= 2048 ? 124 : 100)/Math.max(Q.schatten, 1);
  const tx = Math.round(spieler.px/raster)*raster, tz = Math.round(spieler.pz/raster)*raster;
  sonne.target.position.set(tx, 0, tz);
  sonne.position.set(tx + dir.x*300, dir.y*300, tz + dir.z*300);
  void s;
}
function scheinwerferUpdate(){
  const f = spieler.fz;
  if(f && f.art === 'auto' && nacht > .15){
    const fx = Math.sin(f.h), fz = Math.cos(f.h);
    scheinwerfer.position.set(f.x + fx*2.6, f.y + .75, f.z + fz*2.6);
    scheinwerfer.target.position.set(f.x + fx*30, f.y - .5, f.z + fz*30);
    scheinwerfer.intensity = nacht*260;
  } else scheinwerfer.intensity = 0;
}

/* ── Hauptschleife ─────────────────────────────────────────────── */
let laeuft = false, pausiert = false, uhr = 0, letzte = performance.now();
function schritt(dt){
  if(radOffen) dt *= .2; // Zeitlupe, solange das Waffenrad offen ist
  uhr += dt;
  zeitAktualisieren(dt);
  if(laeuft && !pausiert){
    if(ansicht !== 'spiel' || ladenOffen){ tasten.clear(); stick.ax = stick.ay = 0; }
    if(spieler.modus === 'fuss') spielerFuss(dt);
    else if(spieler.modus === 'fall') fallschirmUpdate(dt);
    else if(spieler.fz) spielerFahrzeug(dt);
    fliegerOhnePilot(dt);
    waffeUpdate(dt);
    autoSchaeden();
    verkehrUpdate(dt);
    parkUpdate(dt);
    polizeiUpdate(dt);
    fahrzeugStoesse();
    leuteUpdate(dt);
    scheineUpdate(dt, uhr);
    laedenUpdate(dt);
    beuteUpdate(dt);
    auftraegeUpdate(dt);
    totUpdate(dt);
    kameraUpdate(dt);
    hudUpdate(dt);
    ton.update(dt);
    $('miniRahmen').hidden = !!drinnen;
    if(!drinnen) miniKarte();
    if(karteOffen && Math.floor(uhr*4) !== Math.floor((uhr - dt)*4)) grosseKarte();
    speicherTakt -= dt;
    if(speicherTakt < 0){ speicherTakt = 10; speicherSchreiben('autostehlen.stunde', stunde); standSichern(); }
  } else if(!laeuft){
    verkehrUpdate(dt); leuteUpdate(dt);
    titelKamera(uhr);
  }
  W.palmenNah(laeuft ? spieler.px : kamera.position.x, laeuft ? spieler.pz : kamera.position.z, dt);
  if((viertelTakt -= dt) < 0){
    viertelTakt = .4;
    const px = laeuft ? spieler.px : kamera.position.x, pz = laeuft ? spieler.pz : kamera.position.z;
    W.ortsGruppenZeigen(px, pz);
    // ferne Autos nicht zeichnen (sie bleiben im Spiel, nur unsichtbar)
    for(const f of fahrzeuge) if(f.art === 'auto'){ const weit = Math.hypot(f.x - px, f.z - pz) > 280; if(f.weit !== weit){ f.weit = weit; for(const c of f.g.children) c.visible = !weit; } }
  }
  if(spiegel) spiegel.material.uniforms.time.value += dt*.55;
  umgebungUpdate(dt, uhr);
  spurUpdate(dt);
  effekteUpdate(dt);
  schattenFolgen();
  scheinwerferUpdate();
  himmel.position.copy(kamera.position);
  gedrueckt.clear();
}
let speicherTakt = 10;
let bildNr = 0;
function rendern(){
  bildNr++;
  if(Q.schatten && (bildNr % 2 === 0 || zeitSprung)) renderer.shadowMap.needsUpdate = true;
  zeitSprung = false;
  if(kinoPass) kinoPass.uniforms.uZeit.value = performance.now()/1000;
  if(composer) composer.render(); else renderer.render(szene, kamera);
}
function schleife(jetzt){
  requestAnimationFrame(schleife);
  if(!aufgestellt) return;
  let dt = (jetzt - letzte)/1000; letzte = jetzt;
  if(!(dt > 0)) dt = 0;
  auflRegeln(dt);
  dt = Math.min(dt, .05);
  try {
    // feste Teilschritte, damit schnelle Autos nicht durch Wände rutschen
    const n = Math.max(1, Math.ceil(dt/.0175));
    for(let i = 0; i < n; i++){ schritt(dt/n); if(i < n - 1) gedruecktSichern(); }
    rendern();
  } catch(e){
    console.error(e);
    fehlerZeigen(e);
  }
}
let gesichert = null;
function gedruecktSichern(){ /* Eingabe-Flanken gelten nur im ersten Teilschritt */ }
function fehlerZeigen(e){
  if(fehlerZeigen.da) return; fehlerZeigen.da = true;
  const el = $('fehler'); el.hidden = false;
  el.textContent = 'Ein Fehler ist aufgetreten: ' + (e && e.message || e) + ' — Seite neu laden hilft meist.';
}
requestAnimationFrame(schleife);
void gesichert;

addEventListener('resize', () => {
  kamera.aspect = innerWidth/innerHeight; kamera.updateProjectionMatrix();
  auflSetzen(aufl);
  if(bloomPass) bloomPass.resolution.set(innerWidth, innerHeight);
  if(kinoPass) kinoPass.uniforms.uAufl.value.set(innerWidth*Q.pr, innerHeight*Q.pr);
  if(karteOffen) grosseKarte();
});
document.addEventListener('visibilitychange', () => { if(document.hidden && laeuft && !pausiert) pauseUmschalten(); });

/* ── Menüs ─────────────────────────────────────────────────────── */
const einst = Object.assign({ laut: .8, empf: 1, umkehren: false, tag: 12 }, speicherLesen('autostehlen.einst', {}));
function einstSichern(){ speicherSchreiben('autostehlen.einst', einst); }
let ansicht = 'laden';         // laden | menue | intro | spiel
let tafelOffen = null, tafelVon = null;
const TIPPS = [
  'Gelbe Lichtsäulen sind Kurieraufträge. Hineinlaufen, und die Uhr läuft.',
  'Einen Streifenwagen zu klauen bringt sofort zwei Sterne.',
  'Abhängen klappt, wenn dich eine Weile keine Streife sieht. Enge Gassen helfen.',
  'Am Steg der Promenade liegen Boote. Unter den Brücken passt du durch.',
  'Das Flugzeug steht am Flughafen im Westen. Schub geben, dann sanft hochziehen.',
  'Geld liegt auf den Gehwegen. Es kommt nach einer Weile zurück.',
  'Mit der Handbremse kommst du quer um jede Ecke.',
];
let tippNr = Math.floor(Math.random()*TIPPS.length);
function tippWechseln(){ $('tipp').textContent = 'Tipp: ' + TIPPS[tippNr++ % TIPPS.length]; }
tippWechseln();
const tippTimer = setInterval(() => { if(ansicht === 'laden') tippWechseln(); else clearInterval(tippTimer); }, 4200);

function spielstand(){ return speicherLesen('autostehlen.stand', null); }
function standSichern(){
  if(!laeuft) return;
  let x = spieler.modus === 'fuss' ? spieler.x : spieler.px, z = spieler.modus === 'fuss' ? spieler.z : spieler.pz;
  if(drinnen){ x = drinnen.laden.tuerX; z = drinnen.laden.tuerZ + 2.5; }
  speicherSchreiben('autostehlen.stand', { x, z, geld, stunde, zeit: Date.now(), inventar, aktiv });
}
function menueZeigen(){
  ansicht = 'menue';
  laeuft = false; pausiert = false;
  $('lade').classList.remove('an');
  $('menue').classList.add('an');
  $('pause').classList.remove('an');
  $('hud').classList.remove('an'); $('touch').classList.remove('an');
  if(karteOffen) karteUmschalten();
  spieler.m.g.visible = false;
  const st = spielstand();
  $('mWeiter').hidden = !st;
  if(st) $('mWeiterInfo').textContent = '$' + (st.geld || 0).toLocaleString('de-DE') + ' · ' + new Date(st.zeit).toLocaleDateString('de-DE');
  if(/\bAGGApp\/einzeln\b/.test(navigator.userAgent)) $('mHeim').hidden = true;
  setTimeout(() => ersterKnopf($('hauptListe')), 30);
}
function ersterKnopf(liste){ const b = [...liste.querySelectorAll('button:not([hidden]), a:not([hidden])')][0]; if(b) b.focus({ preventScroll: true }); }
function spielStarten(neu){
  ton.start(); ton.wahl();
  if(neu){
    geld = 500; speicherSchreiben('autostehlen.geld', geld);
    inventar = { faust: {} }; aktiv = 'faust';
    for(const b of beute) szene.remove(b.m); beute.length = 0;
    stunde = 17.6; zeitAktualisieren(0, true);
    spieler.x = 120; spieler.z = 34; spieler.h = 0;
  } else {
    const st = spielstand();
    if(st){
      geld = typeof st.geld === 'number' ? st.geld : geld;
      if(typeof st.stunde === 'number') { stunde = st.stunde; zeitAktualisieren(0, true); }
      if(st.inventar && st.inventar.faust){ inventar = st.inventar; aktiv = inventar[st.aktiv] ? st.aktiv : 'faust'; }
      if(typeof st.x === 'number' && W.begehbar(st.x, st.z) && !W.kreisRaus({ x: st.x, z: st.z }, .5, 0, 2)){ spieler.x = st.x; spieler.z = st.z; }
    }
  }
  if(spieler.fz){ spieler.fz.fahrer = null; spieler.fz = null; }
  if(totZeit >= 0 || !flieger.g.visible){ totZeit = -1; flugzeugZuruck(); }
  spieler.modus = 'fuss'; spieler.y = W.bodenY(spieler.x, spieler.z); spieler.vy = 0; spieler.liegt = 0;
  sterne = 0; festnahme = 0; hudSterne();
  leben = 100; totZeit = -1; schirm.visible = false; drinnen = null; ladenZu(); spieler.m.g.rotation.x = 0;
  for(const s2 of streifen){ s2.f.g.visible = false; s2.f.vx = s2.f.vz = 0; }
  if(auftrag){ auftrag = null; zielStrahl.visible = false; jobStrahlen.forEach(j => j.visible = true); hudAuftrag(); }
  kam.yaw = spieler.h; kam.pitch = .25; kam.hand = -9;
  spielerZeigen();
  hudWaffe();
  geldAngezeigt = geld; geldZiel = geld; $('geld').textContent = '$' + geld.toLocaleString('de-DE');
  // Übergang: Titelkarte, dann ins Spiel
  ansicht = 'intro';
  $('menue').classList.remove('an');
  $('introZeit').textContent = (['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][new Date().getDay()]) + ' · ' + uhrText();
  $('intro').classList.add('an');
  laeuft = true; pausiert = false;
  kameraUpdate(1);
  setTimeout(() => {
    $('intro').classList.remove('an');
    ansicht = 'spiel';
    $('hud').classList.add('an');
    if(TOUCH) $('touch').classList.add('an');
    if(neu) grossText('WILLKOMMEN', TOUCH ? 'Der Wagen da vorne gehört jetzt dir. Aktion drücken.' : 'Der Wagen da vorne gehört jetzt dir. E zum Einsteigen.', 4);
  }, 2600);
}
function tafel(name, von){
  for(const t of document.querySelectorAll('.tafel')) t.classList.toggle('an', t.id === 't' + name);
  tafelOffen = name; tafelVon = von;
  einstAnzeigen();
  const t = $('t' + name);
  setTimeout(() => { const b = t.querySelector('button, input'); if(b) b.focus({ preventScroll: true }); }, 30);
}
function tafelZu(){
  if(!tafelOffen) return;
  for(const t of document.querySelectorAll('.tafel')) t.classList.remove('an');
  tafelOffen = null;
  ersterKnopf(tafelVon === 'pause' ? $('pauseListe') : $('hauptListe'));
}
function pauseUmschalten(){
  if(ansicht !== 'spiel') return;
  pausiert = !pausiert;
  $('pause').classList.toggle('an', pausiert);
  if(pausiert){ try { document.exitPointerLock && document.exitPointerLock(); } catch(_){} tasten.clear(); standSichern(); setTimeout(() => ersterKnopf($('pauseListe')), 30); }
  else tafelZu();
  einstAnzeigen();
}
function einstAnzeigen(){
  document.querySelectorAll('[data-grafik]').forEach(b => b.setAttribute('aria-pressed', b.dataset.grafik === stufeName));
  $('eLaut').value = Math.round(einst.laut*100); $('eLautWert').textContent = Math.round(einst.laut*100) + ' %';
  $('eEmpf').value = Math.round(einst.empf*100); $('eEmpfWert').textContent = Math.round(einst.empf*100) + ' %';
  $('eUmkehren').setAttribute('aria-pressed', einst.umkehren); $('eUmkehren').textContent = einst.umkehren ? 'Umgekehrt' : 'Normal';
  document.querySelectorAll('[data-tag]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.tag === einst.tag));
  $('eTon').setAttribute('aria-pressed', ton.an); $('eTon').textContent = ton.an ? 'An' : 'Aus';
}
// Hauptmenü
$('hauptListe').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  const z = b.dataset.ziel;
  ton.start();
  if(z === 'weiter') spielStarten(false);
  else if(z === 'neu'){ if(spielstand()) { ton.menue(); tafel('Neu', 'menue'); } else spielStarten(true); }
  else { ton.menue(); tafel(z, 'menue'); }
});
$('neuJa').addEventListener('click', () => { tafelZu(); spielStarten(true); });
$('neuNein').addEventListener('click', () => { ton.menue(); tafelZu(); });
// Pause
$('pauseListe').addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  const z = b.dataset.ziel;
  ton.menue();
  if(z === 'weiter') pauseUmschalten();
  else if(z === 'karte'){ pauseUmschalten(); karteUmschalten(); }
  else if(z === 'hauptmenue'){ standSichern(); tafelZu(); menueZeigen(); }
  else tafel(z, 'pause');
});
for(const b of document.querySelectorAll('[data-zurueck]')) b.addEventListener('click', () => { ton.menue(); tafelZu(); });
$('pauseKnopf').addEventListener('click', () => pauseUmschalten());
$('karteZu').addEventListener('click', () => karteUmschalten());
$('ladenZu').addEventListener('click', () => ladenZu());
// Einstellungen
document.querySelectorAll('[data-grafik]').forEach(b => b.addEventListener('click', () => {
  stufeName = b.dataset.grafik; Q = STUFEN[stufeName]; speicherSchreiben('autostehlen.grafik', stufeName);
  renderer.setPixelRatio(Q.pr); renderer.setSize(innerWidth, innerHeight);
  baueComposer(); schattenEinstellen(); wasserWahl(); einstAnzeigen(); ton.menue();
}));
document.querySelectorAll('[data-zeit]').forEach(b => b.addEventListener('click', () => {
  stunde = +b.dataset.zeit; zeitAktualisieren(0, true); speicherSchreiben('autostehlen.stunde', stunde); ton.menue();
}));
$('eLaut').addEventListener('input', e => { einst.laut = e.target.value/100; einstSichern(); ton.start(); ton.lautstaerke(); einstAnzeigen(); });
$('eEmpf').addEventListener('input', e => { einst.empf = e.target.value/100; einstSichern(); einstAnzeigen(); });
$('eUmkehren').addEventListener('click', () => { einst.umkehren = !einst.umkehren; einstSichern(); einstAnzeigen(); ton.menue(); });
document.querySelectorAll('[data-tag]').forEach(b => b.addEventListener('click', () => { einst.tag = +b.dataset.tag; einstSichern(); einstAnzeigen(); ton.menue(); }));
$('eTon').addEventListener('click', () => { ton.start(); ton.umschalten(); einstAnzeigen(); });
// Tastatur in Menüs: Pfeile wählen, Esc geht zurück
addEventListener('keydown', e => {
  if(ansicht === 'menue' || pausiert){
    if(e.code === 'Escape' || e.code === 'Backspace'){ if(tafelOffen){ e.preventDefault(); tafelZu(); ton.menue(); } else if(pausiert && e.code === 'Escape'){ /* oben schon behandelt */ } return; }
    if(e.code === 'ArrowDown' || e.code === 'ArrowUp'){
      const bereich = tafelOffen ? $('t' + tafelOffen) : pausiert ? $('pauseListe') : $('hauptListe');
      const knoepfe = [...bereich.querySelectorAll('button:not([hidden]), a:not([hidden]), input')];
      if(!knoepfe.length) return;
      const i = knoepfe.indexOf(document.activeElement);
      const n = (i + (e.code === 'ArrowDown' ? 1 : -1) + knoepfe.length) % knoepfe.length;
      knoepfe[n].focus({ preventScroll: true }); ton.menue(); e.preventDefault();
    }
  }
});
for(const liste of [$('hauptListe'), $('pauseListe')]) liste.addEventListener('pointerover', e => {
  const b = e.target.closest('button, a'); if(b && document.activeElement !== b && !TOUCH){ b.focus({ preventScroll: true }); ton.menue(); }
});
addEventListener('pagehide', standSichern);
einstAnzeigen();
schattenEinstellen();

// Für Tests: Spielzeit ohne Bild vorspulen (Eingaben bleiben wie gesetzt)
function simuliere(sek, schrittweite = 1/60){
  const n = Math.round(sek/schrittweite);
  for(let i = 0; i < n; i++) schritt(schrittweite);
}
window.__spiel = { simuliere, messen(){ renderer.info.autoReset = false; renderer.info.reset(); rendern(); rendern(); const r = { aufrufe: Math.round(renderer.info.render.calls/2), dreiecke: Math.round(renderer.info.render.triangles/2) }; renderer.info.autoReset = true; const t0 = performance.now(); for(let i = 0; i < 60; i++) schritt(1/60); r.logikMs = ((performance.now() - t0)/60).toFixed(2); return r; }, get inventar(){ return inventar; }, get aktiv(){ return aktiv; }, waffeGeben, waffeWaehlen, radAuf, radZu, beute, WAFFEN, schuss: () => { schussPause = 0; schiessen(); }, get leben(){ return leben; }, get flieger(){ return flieger; }, streifen, verkehr, leute, get geld(){ return geld; }, get auftrag(){ return auftrag; }, spieler, fahrzeuge, W, get sterne(){ return sterne; }, fahndung, einsteigen, aussteigen, kam, setzeStunde: h => { stunde = h; zeitAktualisieren(0, true); }, tasten, gedrueckt, get laeuft(){ return laeuft; } };
aufbauen().catch(e => { console.error(e); $('ladetext').textContent = 'Fehler beim Aufbau: ' + e.message + ' — bitte neu laden.'; });
