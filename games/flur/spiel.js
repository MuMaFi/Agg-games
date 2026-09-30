/* ======================================================================
   FOUND TAPE — SUBLEVEL 0   (mobile)
   Spielbare Fassung des Fundstücks: Camcorder, Bänder, Ausgang,
   und etwas, das die Gänge mit dir teilt.

   Aufbau dieser Datei
     1  Einstellungen, Qualität, Zufall
     2  Renderer, Texturen, Materialien
     3  Grundriss, Begehbarkeit, Wegfindung
     4  Aufbau der Halle (Wände, Licht, Requisiten, Fundstücke)
     5  Der nachgebaute Ort aus dem Originalfoto
     6  Ausgang, Fundstücke, Alterung (Schmutz, Deckenschäden, Kritzeleien)
        und die drei Verstecke hinter Tapetentüren
     7  Die Gestalt und die Regie der Schrecken
     8  Bild (Fischauge, Band, Nachtsicht) und Anzeige
        Ton: alles im Spiel selbst erzeugt, keine fremden Aufnahmen
     9  Steuerung (Touch, Maus, Tastatur)
    10  Spielablauf
   ====================================================================== */
'use strict';

/* ============================ 1  Grundlagen ============================ */

const PARAMS = new URLSearchParams(location.search);
const QUALITY = {
  low:  { renderH:320, lights:4, shadows:false, dust:260,  aniso:1, fixtures:0.55 },
  mid:  { renderH:432, lights:6, shadows:false, dust:650,  aniso:4, fixtures:0.8  },
  high: { renderH:600, lights:8, shadows:true,  dust:1200, aniso:8, fixtures:1.0  }
};
const IS_TOUCH = matchMedia('(hover: none)').matches || 'ontouchstart' in window;

const CFG = {
  seed:       +(PARAMS.get('seed') || (Math.random()*1e9|0)),
  grid:       20,
  cell:       4.2,
  wallH:      3.2,
  eye:        1.62,
  radius:     0.40,

  walk:       2.35,
  sprint:     4.65,
  staminaMax: 6.0,
  staminaRegen: 0.95,
  staminaFrei: 0.33,  // so voll muss der Balken sein, um wieder rennen zu dürfen

  tapes:      6,
  batteries:  5,

  monWalk:    1.45,   // streift umher
  monHunt:    3.35,   // jagt (langsamer als Sprint, schneller als Gehen)
  monCatch:   1.15,
  dirMin:     12,
  dirRnd:     8,
  verlier:    6.5,
  steigerung: 0.075,
  monSight:   26,
  monCone:    Math.cos(1.28),   // ~147° Sichtfeld

  drainIdle:  0.030,  // Akku %/s
  drainNv:    0.62,
  batteryGain: 26,

  exposure:   0.54,
  lightPower: 5.2,
  fog:        0.038,
  vhs:        0.42,
  yellow:     PARAMS.has('yellow') ? +PARAMS.get('yellow') : 1.0,   // Gelbstich, 0 = aus, 1 = voll
  lens:       0.34
};

let quality = QUALITY[localStorage.getItem('ft_q') || (IS_TOUCH ? 'mid' : 'high')] || QUALITY.mid;

/* Schwierigkeitsgrade. Die Etage wird immer mit der größten Zahl an Fundstücken
   gebaut; überzählige werden beim Start abgeschaltet. So lässt sich der Grad
   noch im Menü wechseln, ohne alles neu zu erzeugen. */
const MAXTAPES = 8, MAXBATT = 7;
const DIFFS = {
  baby: {
    tapes:4, batts:6, hunt:2.75, sight:18, cone:Math.cos(1.00), fang:1.00,
    stamina:8.0, regen:1.30, drainNv:0.45, dirMin:20, dirRnd:12, verlier:4.5, steigerung:0.03
  },
  normal: {
    tapes:6, batts:5, hunt:3.35, sight:26, cone:Math.cos(1.28), fang:1.15,
    stamina:6.0, regen:0.95, drainNv:0.62, dirMin:12, dirRnd:8,  verlier:6.5, steigerung:0.075
  },
  extreme: {
    tapes:8, batts:4, hunt:3.95, sight:34, cone:Math.cos(1.55), fang:1.35,
    stamina:4.5, regen:0.70, drainNv:0.85, dirMin:7,  dirRnd:5,  verlier:9.0, steigerung:0.11
  }
};
let diffKey = localStorage.getItem('ft_diff') || 'normal';
if(!DIFFS[diffKey]) diffKey = 'normal';

/* Zufall mit Seed — dasselbe Band ergibt dieselbe Etage */
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
let rnd = mulberry32(CFG.seed);
const ri = n => (rnd()*n)|0;
const pick = arr => arr[ri(arr.length)];
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const lerp = (a,b,t) => a+(b-a)*t;

const $ = id => document.getElementById(id);

/* Dateipfade laufen über diese Stelle. In der Einzeldatei-Fassung liegt in
   window.FT_ASSETS für jeden Pfad der eingebettete Inhalt. */
const A = u => (window.FT_ASSETS && window.FT_ASSETS[u]) || u;

/* Die Folgeebenen liegen als eigene Ordner neben dieser Seite. In der
   Einzeldatei-Fassung gibt es die nicht — dort bleiben sie zu. */
const EBENEN_DA = !window.FT_EINZELDATEI;

/* ====================== 2  Renderer und Material ====================== */

const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
renderer.setPixelRatio(1);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = CFG.exposure;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const FOGCOL = 0x0a0803;      // Tiefe läuft ins Schwarz, nicht in gelben Dunst
scene.fog = new THREE.FogExp2(FOGCOL, CFG.fog);
scene.background = new THREE.Color(FOGCOL);

const camera = new THREE.PerspectiveCamera(74, 16/9, 0.06, 200);
camera.rotation.order = 'YXZ';

const ANISO = Math.min(quality.aniso, renderer.capabilities.getMaxAnisotropy());

const loadMgr = new THREE.LoadingManager();
const texLoader = new THREE.TextureLoader(loadMgr);

function cv(w,h){ const c=document.createElement('canvas'); c.width=w; c.height=h; return c; }
function grain(ctx,w,h,amt){
  const im=ctx.getImageData(0,0,w,h), d=im.data;
  for(let i=0;i<d.length;i+=4){ const n=(Math.random()-0.5)*amt; d[i]+=n; d[i+1]+=n; d[i+2]+=n*0.8; }
  ctx.putImageData(im,0,0);
}
function blobs(ctx,w,h,n,col,r0,r1){
  for(let i=0;i<n;i++){
    const x=Math.random()*w, y=Math.random()*h, r=r0+Math.random()*(r1-r0);
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,col); g.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.fill();
  }
}
function fromCanvas(c,rx,ry){
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.encoding=THREE.sRGBEncoding; t.anisotropy=ANISO;
  return t;
}
function fromFile(url,rx,ry){
  const t=texLoader.load(url);
  t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(rx,ry);
  t.encoding=THREE.sRGBEncoding; t.anisotropy=ANISO;
  return t;
}

// Deckenplatten mit sichtbarem Raster
function ceilTex(){
  const s=512, c=cv(s,s), x=c.getContext('2d');
  x.fillStyle='#cfc9a8'; x.fillRect(0,0,s,s);
  for(let i=0;i<2200;i++){
    x.fillStyle='rgba('+(150+Math.random()*60|0)+','+(146+Math.random()*55|0)+',120,.10)';
    x.fillRect(Math.random()*s,Math.random()*s,3,2);
  }
  blobs(x,s,s,10,'rgba(120,104,52,.20)',20,90);
  x.strokeStyle='rgba(96,90,64,.75)'; x.lineWidth=5; x.strokeRect(0,0,s,s);
  x.beginPath(); x.moveTo(s/2,0); x.lineTo(s/2,s); x.moveTo(0,s/2); x.lineTo(s,s/2); x.stroke();
  x.strokeStyle='rgba(232,228,204,.5)'; x.lineWidth=2;
  x.beginPath(); x.moveTo(s/2+3,0); x.lineTo(s/2+3,s); x.moveTo(0,s/2+3); x.lineTo(s,s/2+3); x.stroke();
  grain(x,s,s,16);
  return c;
}
function ventTex(){
  const w=128,h=64,c=cv(w,h),x=c.getContext('2d');
  x.fillStyle='#1c1a13'; x.fillRect(0,0,w,h);
  x.fillStyle='#4a463a';
  for(let i=4;i<h-3;i+=6) x.fillRect(4,i,w-8,3);
  grain(x,w,h,20);
  return c;
}
function slatTex(){
  const w=256,h=256,c=cv(w,h),x=c.getContext('2d');
  x.fillStyle='#d9d2b0'; x.fillRect(0,0,w,h);
  for(let i=0;i<w;i+=7){
    x.fillStyle='rgba(120,112,80,0.28)'; x.fillRect(i,0,2,h);
    x.fillStyle='rgba(255,250,225,0.30)'; x.fillRect(i+3,0,2,h);
  }
  grain(x,w,h,14);
  return c;
}
function stainAlpha(){
  const s=192, c=cv(s,s), x=c.getContext('2d');
  x.fillStyle='#000'; x.fillRect(0,0,s,s);
  x.globalCompositeOperation='lighter';
  for(let i=0;i<14;i++){
    const px=s/2+(Math.random()-0.5)*s*0.34, py=s/2+(Math.random()-0.5)*s*0.34;
    const r=s*(0.16+Math.random()*0.2);
    const g=x.createRadialGradient(px,py,0,px,py,r);
    g.addColorStop(0,'rgba(255,255,255,0.55)');
    g.addColorStop(0.55,'rgba(255,255,255,0.28)');
    g.addColorStop(1,'rgba(255,255,255,0)');
    x.fillStyle=g; x.beginPath(); x.arc(px,py,r,0,7); x.fill();
  }
  return c;
}
function labelTex(){
  const w=256,h=160,c=cv(w,h),x=c.getContext('2d');
  x.fillStyle='#141210'; x.fillRect(0,0,w,h);
  x.fillStyle='#cfc6a4'; x.fillRect(16,18,w-32,64);
  x.fillStyle='#1a1712'; x.font='bold 26px "Courier New",monospace';
  x.fillText('SUBLEVEL 0', 26, 58);
  x.fillStyle='#2a2620'; x.fillRect(16,96,w-32,44);
  x.fillStyle='#8a8266'; x.font='16px "Courier New",monospace';
  x.fillText('VHS · SP · 120', 26, 126);
  grain(x,w,h,10);
  return c;
}

const CS = CFG.cell, G = CFG.grid, WH = CFG.wallH, SPAN = G*CS;

/* Eine Textur trägt 2×2 Platten. Bei dreifacher Wiederholung je Zelle wird
   eine Platte 70 cm breit — so groß wie die echten, vorher waren es 2,1 m. */
const ceilMap  = fromCanvas(ceilTex(), G*3, G*3);
const TILE = CS/6, NT = G*6;
const wallMap  = fromFile(A('assets/wall.jpg'), 1.6, 1.15);
const wall2Map = fromFile(A('assets/wall2.jpg'), 1.2, 1.0);
const floorMap = fromFile(A('assets/floor.jpg'), G*4, G*4);
const stainMap = new THREE.CanvasTexture(stainAlpha());

const MAT = {
  wall:  new THREE.MeshStandardMaterial({ map:wallMap, roughness:0.94, metalness:0,
                                          bumpMap:wallMap, bumpScale:0.006 }),
  wall2: new THREE.MeshStandardMaterial({ map:wall2Map, roughness:0.93, metalness:0 }),
  floor: new THREE.MeshStandardMaterial({ map:floorMap, roughness:0.99, metalness:0,
                                          color:0xc3b988, bumpMap:floorMap, bumpScale:0.03 }),
  ceil:  new THREE.MeshStandardMaterial({ map:ceilMap, roughness:0.96, metalness:0,
                                          emissive:0x121009, emissiveMap:ceilMap }),
  base:  new THREE.MeshStandardMaterial({ color:0xd8cd8e, roughness:0.55, metalness:0.05 }),
  hous:  new THREE.MeshStandardMaterial({ color:0xb3ad90, roughness:0.5, metalness:0.25 }),
  tube:  new THREE.MeshBasicMaterial({ color:0xfff6e0, fog:false }),
  vent:  new THREE.MeshStandardMaterial({ map:fromCanvas(ventTex(),1,1), roughness:0.7, metalness:0.3 }),
  chair: new THREE.MeshStandardMaterial({ color:0x4b3c20, roughness:0.7, metalness:0.05 }),
  stain: new THREE.MeshStandardMaterial({ color:0x2e2612, roughness:1, metalness:0,
                                          alphaMap:stainMap, transparent:true, opacity:0.9,
                                          depthWrite:false, polygonOffset:true,
                                          polygonOffsetFactor:-2, polygonOffsetUnits:-2 }),
  slat:  new THREE.MeshStandardMaterial({ map:fromCanvas(slatTex(),4,1), roughness:0.85, metalness:0.05 }),
  rail:  new THREE.MeshStandardMaterial({ color:0xb99a52, roughness:0.5, metalness:0.1 }),
  rad:   new THREE.MeshStandardMaterial({ color:0xc9c2a4, roughness:0.6, metalness:0.3 }),
  plug:  new THREE.MeshStandardMaterial({ color:0xd8d2b4, roughness:0.6, metalness:0 }),
  black: new THREE.MeshBasicMaterial({ color:0x000000, fog:false }),
  dark:  new THREE.MeshBasicMaterial({ color:0x070605, fog:false }),
  tapeBody: new THREE.MeshStandardMaterial({ color:0x1a1712, roughness:0.55, metalness:0.1 }),
  tapeLbl:  new THREE.MeshStandardMaterial({ map:fromCanvas(labelTex(),1,1), roughness:0.7, metalness:0 }),
  batt:  new THREE.MeshStandardMaterial({ color:0x2a2a2e, roughness:0.5, metalness:0.4,
                                          emissive:0x113311, emissiveIntensity:0.6 }),
  door:  new THREE.MeshStandardMaterial({ color:0x6d6a5c, roughness:0.45, metalness:0.6 }),
  signOn:  new THREE.MeshBasicMaterial({ color:0x39d15a, fog:false }),
  signOff: new THREE.MeshBasicMaterial({ color:0x3a1414, fog:false }),
  photo: new THREE.MeshStandardMaterial({ map:fromFile(A('assets/photo.jpg'),1,1), roughness:0.8, metalness:0 })
};
const TUBECOL = new THREE.Color(2.15, 1.98, 1.6);

/* ---------- Schmutz, Feuchte und Winkelschatten ----------
   Wände, Boden und Decke rechnen ihre Alterung in Weltkoordinaten: das
   Wasser läuft an derselben Stelle über jede Wand, die Feuchte kriecht vom
   Boden hoch, und in den Winkeln sammelt sich Schatten. Boden und Decke
   lesen dazu zwei Karten, die nach dem Grundriss gebacken werden. */
const FTU = { tBoden:{ value:null }, tDecke:{ value:null } };
const fl = v => v.toFixed(4);
const GLSL_RAUSCH = `
float ftH1(float n){ return fract(sin(n)*43758.5453); }
float ftH2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float ftRausch(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f*f*(3.0-2.0*f);
  return mix(mix(ftH2(i), ftH2(i+vec2(1.0,0.0)), f.x),
             mix(ftH2(i+vec2(0.0,1.0)), ftH2(i+vec2(1.0,1.0)), f.x), f.y);
}`;
const SCHMUTZ = {
  wand: `
  {
    float h = vFtW.y, a = vFtW.x + vFtW.z;
    // Feuchte steigt vom Boden auf, ungleichmäßig hoch
    float kante = 0.28 + 0.34*ftRausch(vec2(a*0.8, 3.1)) + 0.10*ftRausch(vec2(a*4.0, 7.0));
    float feucht = 1.0 - smoothstep(kante*0.45, kante, h);
    // Wasserläufe von der Decke, schmal und unterschiedlich lang
    float sp = a*2.3, id = floor(sp);
    float wahl = ftH1(id*1.37 + 4.1);
    float mitte = 1.0 - abs(fract(sp) - 0.5)*2.0;
    float laenge = 0.5 + 2.3*ftH1(id*7.9 + 1.3);
    float lauf = step(0.74, wahl) * smoothstep(0.30, 0.95, mitte)
               * smoothstep(${fl(WH)} - laenge, ${fl(WH)} - laenge*0.4, h)
               * (0.5 + 0.5*ftRausch(vec2(a*16.0, h*2.2)));
    // große, wolkige Verfärbungen
    float wolke = smoothstep(0.58, 0.86, ftRausch(vec2(a*0.33, h*0.5) + 11.0));
    vec3 braun = vec3(0.56, 0.45, 0.25);
    diffuseColor.rgb *= mix(vec3(1.0), braun, clamp(feucht*0.85 + lauf*0.6 + wolke*0.28, 0.0, 1.0));
    // Schatten, wo die Wand auf Boden und Decke trifft, und in den Ecken
    float ao = mix(0.52, 1.0, smoothstep(0.0, 0.6, h)) * mix(0.64, 1.0, smoothstep(${fl(WH)}, ${fl(WH-0.8)}, h));
    float eng = texture2D(tFtBoden, vFtW.xz / ${fl(SPAN)}).r;
    ao *= mix(1.0, 0.62, smoothstep(0.30, 0.75, eng));
    diffuseColor.rgb *= ao;
  }`,
  boden: `
  {
    vec4 k = texture2D(tFtBoden, vFtW.xz / ${fl(SPAN)});
    ftNass = k.g;
    diffuseColor.rgb *= mix(1.0, 0.40, k.r);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.46, 0.40, 0.27), ftNass);
    diffuseColor.rgb *= 0.86 + 0.14*ftRausch(vFtW.xz*0.35);
  }`,
  decke: `
  {
    vec2 t = vFtW.xz / ${fl(TILE)};
    vec4 d = texture2D(tFtDecke, (floor(t) + 0.5) / ${fl(NT)});
    ftLoch = d.r;
    // Wasserrand auf der Platte: hellbraune Fläche, dunkler Saum
    vec2 f = fract(t) - 0.5 + (d.ba - 0.5)*0.55;
    float rr = length(f) + 0.13*(ftRausch(vFtW.xz*3.1) - 0.5);
    float rad = 0.16 + 0.32*d.g;
    float innen = smoothstep(rad, rad - 0.10, rr);
    float saum  = smoothstep(0.045, 0.0, abs(rr - rad));
    float fleck = step(0.02, d.g) * (innen*0.42 + saum*0.85);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(0.60, 0.47, 0.26), fleck);
    float eng = texture2D(tFtBoden, vFtW.xz / ${fl(SPAN)}).r;
    diffuseColor.rgb *= mix(1.0, 0.50, eng);
    diffuseColor.rgb *= 1.0 - ftLoch;
  }`
};
function schmutz(mat, art){
  mat.customProgramCacheKey = () => 'ft-schmutz-' + art;
  mat.onBeforeCompile = sh => {
    sh.uniforms.tFtBoden = FTU.tBoden;
    sh.uniforms.tFtDecke = FTU.tDecke;
    sh.vertexShader = 'varying vec3 vFtW;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n  vec4 ftW = vec4(transformed, 1.0);\n' +
      '#ifdef USE_INSTANCING\n  ftW = instanceMatrix * ftW;\n#endif\n  vFtW = (modelMatrix * ftW).xyz;');
    let f = sh.fragmentShader.replace('void main() {',
      'varying vec3 vFtW;\nuniform sampler2D tFtBoden;\nuniform sampler2D tFtDecke;\n' + GLSL_RAUSCH +
      '\nvoid main() {\n  float ftNass = 0.0;\n  float ftLoch = 0.0;');
    f = f.replace('#include <map_fragment>', '#include <map_fragment>\n' + SCHMUTZ[art]);
    // nasser Teppich glänzt
    f = f.replace('#include <roughnessmap_fragment>',
      '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.30, ftNass);');
    // wo eine Platte fehlt, leuchtet auch nichts
    f = f.replace('#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= 1.0 - ftLoch;');
    sh.fragmentShader = f;
  };
}
schmutz(MAT.wall, 'wand');
schmutz(MAT.wall2, 'wand');
schmutz(MAT.floor, 'boden');
schmutz(MAT.ceil, 'decke');
schmutz(MAT.base, 'wand');

/* ================= 3  Grundriss, Begehbarkeit, Wegfindung ================= */

const idx = (x,y) => y*G + x;
const blocked = new Uint8Array(G*G);        // Pfeilerzellen
const wallV   = new Uint8Array((G+1)*G);    // Wand westlich von (x,y)
const wallHz  = new Uint8Array(G*(G+1));    // Wand nördlich von (x,y)
const vi = (x,y) => y*(G+1) + x;
const hi = (x,y) => y*G + x;

for(let y=0;y<G;y++){ wallV[vi(0,y)]=1; wallV[vi(G,y)]=1; }
for(let x=0;x<G;x++){ wallHz[hi(x,0)]=1; wallHz[hi(x,G)]=1; }

// Innenwände als lange Züge mit Durchgängen
const RUNS = Math.round(G*G/11);
for(let r=0;r<RUNS;r++){
  const horiz = rnd()<0.5;
  const len = 3 + ri(6);
  const x = 1 + ri(G-2), y = 1 + ri(G-2);
  const gap1 = ri(len), gap2 = ri(len);
  for(let k=0;k<len;k++){
    if(k===gap1 || k===gap2) continue;      // Türöffnung
    if(horiz){ const cx=x+k; if(cx<1||cx>=G-1) continue; wallHz[hi(cx,y)]=1; }
    else     { const cy=y+k; if(cy<1||cy>=G-1) continue; wallV[vi(x,cy)]=1; }
  }
}

// Pfeilerreihen prägen die großen Hallen
const PILLARS = [];
for(let r=0;r<Math.round(G/2.2);r++){
  const horiz = rnd()<0.5;
  const len = 3 + ri(5);
  const x = 2 + ri(G-4), y = 2 + ri(G-4);
  for(let k=0;k<len;k++){
    const cx = horiz ? x+k*2 : x, cy = horiz ? y : y+k*2;
    if(cx<1||cy<1||cx>=G-1||cy>=G-1) continue;
    blocked[idx(cx,cy)] = 1;
  }
}
for(let i=0;i<G*G;i++) if(!blocked[i] && rnd()<0.02) blocked[i]=1;

/* Der nachgebaute Ort aus dem Originalfoto bekommt einen freigeräumten Block */
const LM = { bx: 2 + ri(G-9), by: 2 + ri(G-9) };
for(let y=LM.by;y<LM.by+4;y++) for(let x=LM.bx;x<LM.bx+4;x++){
  blocked[idx(x,y)] = 0;
  if(x>LM.bx) wallV[vi(x,y)] = 0;
  if(y>LM.by) wallHz[hi(x,y)] = 0;
}
for(let y=LM.by;y<LM.by+4;y++){ wallV[vi(LM.bx,y)]=1; wallV[vi(LM.bx+4,y)]=1; }
for(let x=LM.bx;x<LM.bx+4;x++) wallHz[hi(x, LM.by+4)] = 1;
for(let x=LM.bx;x<LM.bx+4;x++) wallHz[hi(x, LM.by)] = (x === LM.bx+2) ? 0 : 1;   // ein Durchgang
LM.cell = idx(LM.bx+2, LM.by);
LM.vx = (LM.bx+2)*CS + CS/2;
LM.vz = LM.by*CS + CS/2;

/* ---------- Verstecke ----------
   Drei Kammern je Etage, rundum zugemauert. Eine ihrer Wände ist eine
   Tapetentür: sie sieht aus wie jede andere, nur eine feine Naht und das,
   was man dahinter hört, verraten sie. Die Kammern gehören nicht zur
   Etage — keine Bänder, kein Umherstreifen der Gestalt, kein Deckenlicht. */
const SECRET = new Int8Array(G*G).fill(-1);
const VERSTECKE = [];
{
  const ARTEN = ['lager', 'schrein', 'zimmer'];
  const frei = (x0, y0, w, h) => {
    for(let y=y0-1; y<=y0+h; y++) for(let x=x0-1; x<=x0+w; x++){
      if(x<1 || y<1 || x>=G-1 || y>=G-1) return false;
      if(x>=LM.bx-1 && x<=LM.bx+4 && y>=LM.by-1 && y<=LM.by+4) return false;   // nicht an den Nachbau
      if(SECRET[idx(x,y)] >= 0) return false;
    }
    // nicht dort, wo man aufwacht
    for(let y=y0; y<y0+h; y++) for(let x=x0; x<x0+w; x++)
      if(Math.abs(x - G/2) + Math.abs(y - G/2) < 4) return false;
    return true;
  };
  for(let k=0; k<ARTEN.length; k++){
    const art = ARTEN[k];
    const lang = art !== 'schrein';                    // Lager und Zimmer sind länglich
    for(let v=0; v<80; v++){
      const quer = rnd() < 0.5;
      const w = lang && quer ? 2 : 1, h = lang && !quer ? 2 : 1;
      const x0 = 1 + ri(G-2-w), y0 = 1 + ri(G-2-h);
      if(!frei(x0, y0, w, h)) continue;
      for(let y=y0; y<y0+h; y++) for(let x=x0; x<x0+w; x++){
        const i = idx(x,y);
        SECRET[i] = VERSTECKE.length; blocked[i] = 0;
        // innen offen, außen dicht
        wallV[vi(x,y)]   = x === x0 ? 1 : 0;
        wallV[vi(x+1,y)] = x === x0+w-1 ? 1 : wallV[vi(x+1,y)];
        wallHz[hi(x,y)]   = y === y0 ? 1 : 0;
        wallHz[hi(x,y+1)] = y === y0+h-1 ? 1 : wallHz[hi(x,y+1)];
      }
      for(let y=y0; y<y0+h; y++) for(let x=x0; x<x0+w; x++){
        if(x < x0+w-1) wallV[vi(x+1,y)] = 0;
        if(y < y0+h-1) wallHz[hi(x,y+1)] = 0;
      }
      VERSTECKE.push({ art, x0, y0, w, h, offen:false, gefunden:false, tuer:null });
      break;
    }
  }
}

/* Die Wandzüge können Zellen komplett einmauern. Alles, was nicht am
   größten Bereich hängt, wird angebunden — sonst steht der Spieler in
   einer versiegelten Kammer und die Etage hat keine Bänder. */
function ensureConnected(){
  const comp = new Int32Array(G*G).fill(-1);
  const nb = [];
  const sizes = [];
  let nc = 0;
  for(let i=0;i<G*G;i++){
    if(blocked[i] || comp[i] >= 0 || SECRET[i] >= 0) continue;   // Verstecke bleiben zu
    const q=[i]; comp[i]=nc; let n=0;
    for(let h=0;h<q.length;h++){
      const c=q[h]; n++;
      for(const k of neighbours(c, nb)) if(comp[k] < 0){ comp[k]=nc; q.push(k); }
    }
    sizes.push(n); nc++;
  }
  if(nc <= 1) return;
  let main = 0;
  for(let k=1;k<nc;k++) if(sizes[k] > sizes[main]) main = k;

  const relabel = from => { for(let i=0;i<G*G;i++) if(comp[i] === from) comp[i] = main; };
  const openWall = (x,y,nx,ny) => {
    if(nx === x+1) wallV[vi(x+1,y)] = 0;
    else if(nx === x-1) wallV[vi(x,y)] = 0;
    else if(ny === y+1) wallHz[hi(x,y+1)] = 0;
    else wallHz[hi(x,y)] = 0;
  };

  for(let pass=0; pass<3; pass++){
    let open = false;
    for(let y=0;y<G;y++) for(let x=0;x<G;x++){
      const i = idx(x,y);
      if(blocked[i] || comp[i] < 0 || comp[i] === main) continue;
      const dirs = [[x+1,y],[x-1,y],[x,y+1],[x,y-1]];
      for(const d of dirs){
        const nx=d[0], ny=d[1];
        if(nx<0||ny<0||nx>=G||ny>=G) continue;
        const j = idx(nx,ny);
        if(blocked[j]){
          // Pfeiler dahinter: nur aufbrechen, wenn dahinter der Hauptbereich liegt
          const ax = nx + (nx-x), ay = ny + (ny-y);
          if(ax<0||ay<0||ax>=G||ay>=G) continue;
          if(comp[idx(ax,ay)] !== main) continue;
          blocked[j] = 0; comp[j] = main;
          openWall(x,y,nx,ny); openWall(nx,ny,ax,ay);
        } else if(comp[j] === main){
          openWall(x,y,nx,ny);
        } else continue;
        relabel(comp[i]);
        open = true;
        break;
      }
    }
    if(!open) break;
  }
}
ensureConnected();

for(let y=0;y<G;y++) for(let x=0;x<G;x++) if(blocked[idx(x,y)]) PILLARS.push([x,y]);

function canGo(x,y,nx,ny){
  if(nx<0||ny<0||nx>=G||ny>=G) return false;
  if(blocked[idx(nx,ny)]) return false;
  if(nx===x+1) return !wallV[vi(x+1,y)];
  if(nx===x-1) return !wallV[vi(x,y)];
  if(ny===y+1) return !wallHz[hi(x,y+1)];
  if(ny===y-1) return !wallHz[hi(x,y)];
  return false;
}
function neighbours(i, out){
  const x=i%G, y=(i/G)|0; out.length=0;
  if(canGo(x,y,x+1,y)) out.push(idx(x+1,y));
  if(canGo(x,y,x-1,y)) out.push(idx(x-1,y));
  if(canGo(x,y,x,y+1)) out.push(idx(x,y+1));
  if(canGo(x,y,x,y-1)) out.push(idx(x,y-1));
  /* Von draußen führt kein Weg in ein Versteck, auch wenn die Tür offen
     steht — die grobe Suche ist nur noch für die Gestalt da, und die
     passt nicht durch die Tapetentür. */
  if(SECRET[i] < 0){
    let n = 0;
    for(const k of out) if(SECRET[k] < 0) out[n++] = k;
    out.length = n;
  }
  return out;
}
const nbuf = [];
function bfs(start){
  const prev = new Int32Array(G*G).fill(-1);
  const dist = new Int32Array(G*G).fill(-1);
  dist[start]=0; const q=[start];
  for(let h=0; h<q.length; h++){
    const cur=q[h];
    for(const n of neighbours(cur, nbuf)) if(dist[n]<0){ dist[n]=dist[cur]+1; prev[n]=cur; q.push(n); }
  }
  return { prev, dist };
}
/* Die Zellensuche kennt nur Wandkanten und Pfeiler. Die frei stehenden Wände
   des nachgebauten Ortes stecken dagegen in SOLIDS — für die Gestalt muss die
   Verbindung zweier Zellen deshalb zusätzlich am Begehbarkeitsraster geprüft
   werden, sonst plant sie Wege quer durch diese Wände. */
function kanteOffen(x, y, nx, ny){
  if(!OCC_M) return true;
  const ax = x*CS+CS/2, az = y*CS+CS/2, bx = nx*CS+CS/2, bz = ny*CS+CS/2;
  for(let i=0;i<=8;i++){
    const t = i/8;
    if(!freeIn(OCC_M, ax+(bx-ax)*t, az+(bz-az)*t)) return false;
  }
  return true;
}
function nachbarnMon(i, out){
  const x=i%G, y=(i/G)|0; out.length=0;
  const ok = (nx, ny) => canGo(x,y,nx,ny) && SECRET[idx(nx,ny)] < 0 && kanteOffen(x,y,nx,ny);
  if(ok(x+1,y)) out.push(idx(x+1,y));
  if(ok(x-1,y)) out.push(idx(x-1,y));
  if(ok(x,y+1)) out.push(idx(x,y+1));
  if(ok(x,y-1)) out.push(idx(x,y-1));
  return out;
}
/* Weg für die Gestalt. Findet sich keiner (etwa weil sie in einer Nische
   steht), wird auf die grobe Suche zurückgefallen. */
function pathToMon(from, to){
  const prev = new Int32Array(G*G).fill(-1);
  const dist = new Int32Array(G*G).fill(-1);
  const buf = [];
  dist[from] = 0;
  const q = [from];
  for(let h=0; h<q.length; h++){
    const cur = q[h];
    if(cur === to) break;
    for(const n of nachbarnMon(cur, buf)) if(dist[n] < 0){ dist[n]=dist[cur]+1; prev[n]=cur; q.push(n); }
  }
  if(dist[to] < 0) return pathTo(from, to);
  const out = []; let c = to;
  while(c >= 0 && c !== from){ out.push(c); c = prev[c]; }
  out.reverse();
  return out;
}

// Weg als Liste von Zellen (start ausgenommen)
function pathTo(from, to){
  const { prev, dist } = bfs(from);
  if(dist[to] < 0) return null;
  const out=[]; let c=to;
  while(c>=0 && c!==from){ out.push(c); c=prev[c]; }
  out.reverse();
  return out;
}

/* Startzelle: möglichst mittig und frei */
let startCell = -1;
{
  let best = 1e9;
  for(let i=0;i<G*G;i++){
    if(blocked[i] || SECRET[i] >= 0) continue;
    const x=i%G, y=(i/G)|0;
    const d = Math.abs(x-G/2) + Math.abs(y-G/2);
    if(d < best){ best=d; startCell=i; }
  }
}
const REACH = bfs(startCell).dist;
const FREE = [];
for(let i=0;i<G*G;i++) if(REACH[i] > 2) FREE.push(i);
if(!FREE.length) for(let i=0;i<G*G;i++) if(REACH[i] >= 0) FREE.push(i);
if(!FREE.length) FREE.push(startCell);

/* Die Tapetentür jedes Verstecks: eine Außenwand, vor der ein erreichbarer
   Gang liegt. Findet sich keine, bleibt die Kammer ein toter Hohlraum. */
const TUERKANTE = new Set();
for(let k=VERSTECKE.length-1; k>=0; k--){
  const V = VERSTECKE[k];
  const kand = [];
  for(let y=V.y0; y<V.y0+V.h; y++) for(let x=V.x0; x<V.x0+V.w; x++){
    for(const [nx, ny] of [[x+1,y],[x-1,y],[x,y+1],[x,y-1]]){
      if(nx<0 || ny<0 || nx>=G || ny>=G) continue;
      const j = idx(nx, ny);
      if(SECRET[j] >= 0 || blocked[j] || REACH[j] < 0) continue;
      if(nx>=LM.bx && nx<LM.bx+4 && ny>=LM.by && ny<LM.by+4) continue;
      kand.push({ x, y, nx, ny });
    }
  }
  if(!kand.length){ V.tot = true; continue; }
  const t = pick(kand);
  const senk = t.nx !== t.x;                      // Wand steht senkrecht (entlang z)
  t.typ = senk ? 'V' : 'H';
  t.gx = senk ? Math.max(t.x, t.nx) : t.x;
  t.gy = senk ? t.y : Math.max(t.y, t.ny);
  t.innen = idx(t.x, t.y); t.aussen = idx(t.nx, t.ny);
  t.cx = senk ? t.gx*CS : t.x*CS + CS/2;
  t.cz = senk ? t.y*CS + CS/2 : t.gy*CS;
  t.rot = senk ? Math.PI/2 : 0;
  t.inX = t.x - t.nx; t.inZ = t.y - t.ny;         // Richtung ins Versteck
  t.oeff = (rnd() - 0.5)*1.4;                     // Lage der Tür in der Wand
  V.tuer = t;
  TUERKANTE.add(t.typ + ':' + t.gx + ':' + t.gy);
}
const versteckVon = (x, z) => {
  const cx = Math.floor(x/CS), cz = Math.floor(z/CS);
  if(cx<0 || cz<0 || cx>=G || cz>=G) return -1;
  return SECRET[idx(cx, cz)];
};

const cellCenter = (i, y) => new THREE.Vector3((i%G)*CS+CS/2, y||0, ((i/G)|0)*CS+CS/2);

/* --------- Begehbarkeitsraster: Wände um einen Radius aufgeblasen --------- */
const SUB = 8, SG = G*SUB, SC = CS/SUB;
const SOLIDS = [];   // zusätzliche Klötze (Landmarke, Tür): [cx, cz, halfX, halfZ]

function buildOcc(clear){
  const occ = new Uint8Array(SG*SG);
  const mark = (cx,cz,hw,hd) => {
    const x0=Math.max(0,Math.floor((cx-hw)/SC)), x1=Math.min(SG-1,Math.floor((cx+hw)/SC));
    const z0=Math.max(0,Math.floor((cz-hd)/SC)), z1=Math.min(SG-1,Math.floor((cz+hd)/SC));
    for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++) occ[z*SG+x]=1;
  };
  for(let y=0;y<G;y++) for(let x=0;x<=G;x++)
    if(wallV[vi(x,y)]) mark(x*CS, y*CS+CS/2, 0.12+clear, CS/2+0.05);
  for(let y=0;y<=G;y++) for(let x=0;x<G;x++)
    if(wallHz[hi(x,y)]) mark(x*CS+CS/2, y*CS, CS/2+0.05, 0.12+clear);
  for(const p of PILLARS) mark(p[0]*CS+CS/2, p[1]*CS+CS/2, 0.78+clear, 0.78+clear);
  for(const s of SOLIDS)  mark(s[0], s[1], s[2]+clear, s[3]+clear);
  return occ;
}
/* Für den Spieler wird gegen die echten Klötze geprüft. Das Raster hat
   Stufen von einer halben Zelle — an einer Wand entlang zu rennen hat
   sich dadurch angefühlt, als hake man alle paar Schritte ein. */
const BOXES = [];
const BGRID = [];
function buildBoxes(){
  BOXES.length = 0;
  for(let y=0;y<G;y++) for(let x=0;x<=G;x++)
    if(wallV[vi(x,y)]) BOXES.push({x:x*CS, z:y*CS+CS/2, hx:0.12, hz:CS/2});
  for(let y=0;y<=G;y++) for(let x=0;x<G;x++)
    if(wallHz[hi(x,y)]) BOXES.push({x:x*CS+CS/2, z:y*CS, hx:CS/2, hz:0.12});
  for(const p of PILLARS) BOXES.push({x:p[0]*CS+CS/2, z:p[1]*CS+CS/2, hx:0.78, hz:0.78});
  for(const s of SOLIDS)  BOXES.push({x:s[0], z:s[1], hx:s[2], hz:s[3]});

  BGRID.length = 0;
  for(let i=0;i<G*G;i++) BGRID.push(null);
  for(const b of BOXES){
    const x0=Math.max(0,Math.floor((b.x-b.hx-1)/CS)), x1=Math.min(G-1,Math.floor((b.x+b.hx+1)/CS));
    const z0=Math.max(0,Math.floor((b.z-b.hz-1)/CS)), z1=Math.min(G-1,Math.floor((b.z+b.hz+1)/CS));
    for(let z=z0;z<=z1;z++) for(let x=x0;x<=x1;x++){
      const i = idx(x,z);
      (BGRID[i] || (BGRID[i] = [])).push(b);
    }
  }
}
/* Schiebt einen Kreis aus allen Klötzen heraus, die er berührt. */
const _near = [];
function resolveCircle(px, pz, r){
  _near.length = 0;
  const cx0 = clamp(Math.floor(px/CS), 0, G-1), cz0 = clamp(Math.floor(pz/CS), 0, G-1);
  for(let z=cz0-1; z<=cz0+1; z++) for(let x=cx0-1; x<=cx0+1; x++){
    if(x<0||z<0||x>=G||z>=G) continue;
    const l = BGRID[idx(x,z)];
    if(l) for(const b of l) if(_near.indexOf(b) < 0) _near.push(b);
  }
  for(let pass=0; pass<2; pass++){
    for(const b of _near){
      const dx = px-b.x, dz = pz-b.z;
      const nx = clamp(dx, -b.hx, b.hx), nz = clamp(dz, -b.hz, b.hz);
      const ox = dx-nx, oz = dz-nz;
      const d2 = ox*ox + oz*oz;
      if(d2 >= r*r) continue;
      if(d2 > 1e-9){
        const d = Math.sqrt(d2);
        px += ox/d*(r-d); pz += oz/d*(r-d);
      } else {                        // Mittelpunkt im Klotz: kürzesten Weg raus
        const ax = b.hx + r - Math.abs(dx), az = b.hz + r - Math.abs(dz);
        if(ax < az) px += (dx < 0 ? -ax : ax);
        else        pz += (dz < 0 ? -az : az);
      }
    }
  }
  return [px, pz];
}

let OCC_RAW, OCC_P, OCC_M;
function rebuildOcc(){
  buildBoxes();
  OCC_RAW = buildOcc(0.02);        // Sichtlinien
  OCC_P   = buildOcc(CFG.radius);  // Spieler
  OCC_M   = buildOcc(0.55);        // Gestalt
}
function freeIn(occ,x,z){
  const ix=Math.floor(x/SC), iz=Math.floor(z/SC);
  return ix>=0 && iz>=0 && ix<SG && iz<SG && !occ[iz*SG+ix];
}
const freeP = (x,z) => freeIn(OCC_P,x,z);
const freeM = (x,z) => freeIn(OCC_M,x,z);
function losClear(ax,az,bx,bz){
  const dx=bx-ax, dz=bz-az, n=Math.ceil(Math.hypot(dx,dz)/0.28);
  for(let i=1;i<n;i++){ const t=i/n; if(!freeIn(OCC_RAW, ax+dx*t, az+dz*t)) return false; }
  return true;
}

/* ==================== 4  Aufbau der Halle ==================== */

const floorM = new THREE.Mesh(new THREE.PlaneGeometry(SPAN,SPAN), MAT.floor);
floorM.rotation.x = -Math.PI/2; floorM.position.set(SPAN/2, 0, SPAN/2);
floorM.receiveShadow = true; scene.add(floorM);

const ceilM = new THREE.Mesh(new THREE.PlaneGeometry(SPAN,SPAN), MAT.ceil);
ceilM.rotation.x = Math.PI/2; ceilM.position.set(SPAN/2, WH, SPAN/2);
scene.add(ceilM);

const segs = [];   // [x, z, rotY]
for(let y=0;y<G;y++) for(let x=0;x<=G;x++)
  if(wallV[vi(x,y)] && !TUERKANTE.has('V:'+x+':'+y)) segs.push([x*CS, y*CS+CS/2, Math.PI/2]);
for(let y=0;y<=G;y++) for(let x=0;x<G;x++)
  if(wallHz[hi(x,y)] && !TUERKANTE.has('H:'+x+':'+y)) segs.push([x*CS+CS/2, y*CS, 0]);

const m4=new THREE.Matrix4(), qt=new THREE.Quaternion(), vv=new THREE.Vector3(), s1=new THREE.Vector3(1,1,1);
function place(mesh, i, x, y, z, rot){
  qt.setFromEuler(new THREE.Euler(0, rot, 0));
  vv.set(x,y,z);
  mesh.setMatrixAt(i, m4.compose(vv,qt,s1));
}

const wallMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CS, WH, 0.24), MAT.wall, segs.length);
const baseMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(CS, 0.13, 0.32), MAT.base, segs.length);
segs.forEach((s,i)=>{ place(wallMesh,i,s[0],WH/2,s[1],s[2]); place(baseMesh,i,s[0],0.065,s[1],s[2]); });
wallMesh.castShadow = wallMesh.receiveShadow = quality.shadows;
baseMesh.receiveShadow = quality.shadows;
scene.add(wallMesh, baseMesh);

const PW = 1.55;
const pilMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(PW, WH, PW), MAT.wall2, Math.max(1,PILLARS.length));
const pilBase = new THREE.InstancedMesh(new THREE.BoxGeometry(PW+0.16, 0.13, PW+0.16), MAT.base, Math.max(1,PILLARS.length));
PILLARS.forEach((p,i)=>{
  const x=p[0]*CS+CS/2, z=p[1]*CS+CS/2;
  place(pilMesh,i,x,WH/2,z,0); place(pilBase,i,x,0.065,z,0);
});
pilMesh.count = pilBase.count = PILLARS.length;
pilMesh.castShadow = pilMesh.receiveShadow = quality.shadows;
scene.add(pilMesh, pilBase);

/* ---------- Deckenleuchten, mit toten Zonen ---------- */
const tubeGeo  = new THREE.PlaneGeometry(1.45, 0.17);
const panelGeo = new THREE.PlaneGeometry(1.15, 0.58);
const tubeHous = new THREE.BoxGeometry(1.6, 0.09, 0.3);
const panHous  = new THREE.BoxGeometry(1.3, 0.09, 0.72);
const fixtures = [];
const housT = [], housP = [];

// drei Bereiche, in denen das Licht ganz ausgefallen ist
const DARKZONES = [];
for(let i=0;i<3;i++){
  const c = pick(FREE);
  DARKZONES.push({ x:(c%G)*CS+CS/2, z:((c/G)|0)*CS+CS/2, r:8.5+rnd()*4 });
}
const inDark = (x,z) => DARKZONES.some(d => (x-d.x)**2 + (z-d.z)**2 < d.r*d.r);

function addFixture(geo, hg, cx, cz, rot){
  const m = new THREE.Mesh(geo, MAT.tube.clone());
  m.rotation.x = Math.PI/2; m.rotation.z = rot;
  m.position.set(cx, WH-0.045, cz);
  scene.add(m);
  hg.push([cx, cz, rot]);
  const dead = inDark(cx,cz);
  fixtures.push({ pos:new THREE.Vector3(cx, WH-0.30, cz), mesh:m, dead:dead,
                  broken: !dead && rnd()<0.12, f:2+rnd()*7, ph:rnd()*6.28, on: dead?0:1 });
}
for(let y=0;y<G;y++) for(let x=0;x<G;x++){
  const cx = x*CS+CS/2, cz = y*CS+CS/2;
  if(SECRET[idx(x,y)] >= 0) continue;          // Verstecke bringen ihr eigenes Licht mit
  if(y % 3 === 1){ if(rnd() <= quality.fixtures) addFixture(tubeGeo, housT, cx, cz, 0); }
  else if((x+y) % 5 === 0 && rnd()<0.8) addFixture(panelGeo, housP, cx, cz, rnd()<0.5?0:Math.PI/2);
}
function housingMesh(geo, list){
  if(!list.length) return;
  const im = new THREE.InstancedMesh(geo, MAT.hous, list.length);
  list.forEach((h,i)=> place(im, i, h[0], WH-0.06, h[1], h[2]));
  scene.add(im);
}
housingMesh(tubeHous, housT);
housingMesh(panHous,  housP);

for(let i=0;i<Math.round(G*G/26);i++){
  const x=1+ri(G-2), y=1+ri(G-2);
  const v=new THREE.Mesh(new THREE.PlaneGeometry(1.0,0.42), MAT.vent);
  v.rotation.x=Math.PI/2; v.rotation.z = rnd()<0.5?0:Math.PI/2;
  v.position.set(x*CS+CS/2, WH-0.02, y*CS+CS/2);
  scene.add(v);
}

/* ---------- Licht ---------- */
const rig = [];
for(let i=0;i<quality.lights;i++){
  const pl = new THREE.PointLight(0xffd894, 0, 14, 2);
  if(quality.shadows && i<1){
    pl.castShadow=true; pl.shadow.mapSize.set(512,512);
    pl.shadow.bias=-0.005; pl.shadow.camera.near=0.4; pl.shadow.camera.far=13;
  }
  scene.add(pl); rig.push(pl);
}
scene.add(new THREE.HemisphereLight(0xffe0a4, 0x2a2109, 0.035));
scene.add(new THREE.AmbientLight(0x050403, 1.0));

// Nachtsicht-Aufheller am Camcorder
const nvLight = new THREE.PointLight(0xcfe4ff, 0, 15, 1.8);
scene.add(nvLight);

let sortT = 0, lichtHier = 1, innenLicht = 0;
function updateLights(dt, t, danger){
  const mx = MON.pos.x, mz = MON.pos.z;
  let tinks = 0;
  for(const f of fixtures){
    let v;
    if(f.dead) v = 0;
    else if(f.art === 'laterne') v = 0.82 + Math.sin(t*9 + f.ph)*0.05 + Math.random()*0.06;
    else if(f.art === 'lampe')   v = Math.random() < 0.004 ? 0.2 : 0.95;
    else if(f.art === 'tv')      v = TV.zustand === 'aus' ? 0 : (TV.zustand === 'bild' || TV.zustand === 'geist' ? 0.55 : 0.25 + Math.random()*0.45);
    else if(f.broken){
      const s = Math.sin(t*f.f + f.ph) + Math.sin(t*f.f*2.6 + f.ph*1.7);
      v = s > 0.75 ? 1 : (Math.random()<0.28 ? 0.45 : 0.02);
    } else {
      v = 0.96 + Math.sin(t*118 + f.ph)*0.04;
      if(Math.random() < 0.0035) v = 0.28;
    }
    // Stromausfall, danach zündet Röhre für Röhre
    if(f.aus){
      if(f.zuend !== undefined){
        f.zuend -= dt;
        if(f.zuend <= 0){
          f.aus = false; f.zuend = undefined;
          if(tinks < 3 && f.pos.distanceToSquared(camera.position) < 200){ tinks++; KLANG.tink(f.pos.x, f.pos.z); }
        } else v = f.zuend < 0.28 ? (Math.random() < 0.5 ? 0.9 : 0.04) : 0;
      } else v = 0;
    }
    // In ihrer Nähe halten die Röhren nicht durch
    if(!f.dead && !f.art){
      const md2 = (f.pos.x - mx)**2 + (f.pos.z - mz)**2;
      if(md2 < 56){
        const k = 1 - Math.sqrt(md2)/7.5;
        if(Math.random() < 0.3 + k*0.6) v *= Math.random() < k ? 0.02 : 0.4;
        if(k > 0.45 && Math.random() < dt*2.5 && f.pos.distanceToSquared(camera.position) < 300)
          KLANG.knistern(f.pos.x, f.pos.z, k);
      }
    }
    if(danger > 0 && Math.random() < 0.25*danger) v *= 0.12;
    if(SCARE.blitz > 0 && !f.art) v = Math.min(2.4, v + 1.6);        // eine Röhre platzt
    f.on = v;
    if(f.mesh) f.mesh.material.color.copy(f.basis || TUBECOL).multiplyScalar(v);
  }
  sortT -= dt;
  if(sortT <= 0){
    sortT = 0.25;
    fixtures.sort((a,b)=> a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
  }
  /* Das Licht der Gänge fällt durch die Wände (die Lampen werfen keine
     Schatten). In einem Versteck soll es aber dunkel sein, nur die eigene
     Funzel brennt — draußen wird deshalb heruntergedreht, solange man drin ist. */
  innenLicht += ((versteckVon(camera.position.x, camera.position.z) >= 0 ? 1 : 0) - innenLicht) * Math.min(dt*4, 1);
  for(let i=0;i<rig.length;i++){
    const f = fixtures[i], pl = rig[i];
    if(!f){ pl.intensity = 0; continue; }
    pl.position.copy(f.pos);
    const drinnen = f.art ? 1 + innenLicht*0.4 : 1 - innenLicht*0.9;
    pl.intensity = CFG.lightPower * f.on * (f.kraft || 1) * drinnen;
    pl.color.setHex(danger > 0.5 && !f.art ? 0xff6a34 : (f.farbe || 0xffd894));
  }
  // Das Brummen kommt aus den Röhren: unter einer hellen laut, im Dunkeln leise
  let n = 0;
  for(let i=0; i<Math.min(10, fixtures.length); i++){
    const f = fixtures[i];
    const d = f.pos.distanceTo(camera.position);
    n += f.on * Math.max(0, 1 - d/10) * (f.art ? f.kraft : 1);
  }
  lichtHier = n;
  if(SND.ctx && SND.on && S.phase === 'play'){
    const ziel = SND.humAus ? 0 : 0.010 + 0.05*Math.min(n, 1.4);
    SND.hum.gain.setTargetAtTime(ziel, SND.ctx.currentTime, SND.humAus ? 0.35 : 0.08);
  }
  // hängende Platten und Kabel pendeln
  for(const h of HAENGT){
    const w = Math.sin(t*0.7 + h.ph)*h.amp + Math.sin(t*1.9 + h.ph*2)*h.amp*0.3;
    if(h.kabel) h.o.rotation.set(w, 0, w*0.6);
    else {
      h.o.rotation.z = h.basis + w;
      h.halter.updateMatrixWorld(true);
      haengePlatten.setMatrixAt(h.idx, h.stueck.matrixWorld);
    }
  }
  if(haengePlatten) haengePlatten.instanceMatrix.needsUpdate = true;
}

/* ---------- Requisiten ---------- */
/* Mehrere Klötze zu einer Form verschmelzen — ein Stuhl kostet dann einen
   Zeichenaufruf statt sechs. teile: [breite, höhe, tiefe, x, y, z] */
function verschmolzen(teile){
  const pos = [], nrm = [], uv = [];
  for(const [w, h, d, x, y, z] of teile){
    const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    g.translate(x, y, z);
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uv.push(...g.attributes.uv.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
const STUHL = verschmolzen([
  [.46,.06,.46, 0,.44,0], [.46,.5,.05, 0,.69,-.21],
  [.045,.44,.045, -.19,.22,-.19], [.045,.44,.045, .19,.22,-.19],
  [.045,.44,.045, -.19,.22,.19],  [.045,.44,.045, .19,.22,.19]
]);
function chairMesh(){
  const m = new THREE.Mesh(STUHL, MAT.chair);
  m.castShadow = quality.shadows;
  return m;
}
const props = new THREE.Group(); scene.add(props);
for(let i=0;i<G*G;i++){
  if(blocked[i] || SECRET[i] >= 0 || rnd()>0.09) continue;
  const cx=(i%G)*CS+CS/2, cz=((i/G)|0)*CS+CS/2;
  const ox=(rnd()-0.5)*2.2, oz=(rnd()-0.5)*2.2;
  const k = rnd();
  const ch = chairMesh();
  ch.position.set(cx+ox, 0, cz+oz);
  ch.rotation.y = rnd()*6.28;
  if(k<0.20){ ch.rotation.z = Math.PI/2; ch.position.y=0.23; }
  else if(k<0.30){
    for(let s=1;s<2+ri(3);s++){
      const c2=chairMesh(); c2.position.set(cx+ox+(rnd()-.5)*.1, s*0.41, cz+oz+(rnd()-.5)*.1);
      c2.rotation.y=ch.rotation.y+(rnd()-.5)*0.5; props.add(c2);
    }
  } else if(k<0.36){ ch.position.y = WH-0.02; ch.rotation.x = Math.PI; }
  props.add(ch);
}
for(let i=0;i<Math.round(G*G/9);i++){
  const r0=0.5+rnd()*1.1;
  const st=new THREE.Mesh(new THREE.PlaneGeometry(r0*2, r0*2*(0.7+rnd()*0.6)), MAT.stain);
  st.rotation.x=-Math.PI/2; st.rotation.z=rnd()*6.28;
  st.position.set(rnd()*SPAN, 0.012, rnd()*SPAN);
  props.add(st);
}
for(let i=0;i<30;i++){
  const s = pick(segs);
  const st=new THREE.Mesh(new THREE.PlaneGeometry(0.7+rnd()*1.6, 0.5+rnd()*1.5), MAT.stain);
  const side = rnd()<0.5 ? 0.14 : -0.14;
  st.position.set(s[0] + (s[2]===0 ? (rnd()-0.5)*CS*0.6 : side),
                  0.3+rnd()*1.9,
                  s[1] + (s[2]===0 ? side : (rnd()-0.5)*CS*0.6));
  st.rotation.y = s[2] + (side<0 ? Math.PI : 0);
  props.add(st);
}

/* ---------- Staub ---------- */
const dustN = quality.dust;
const dustGeo = new THREE.BufferGeometry();
const dpos = new Float32Array(dustN*3);
for(let i=0;i<dustN;i++){
  dpos[i*3]   = (Math.random()-0.5)*30;
  dpos[i*3+1] =  Math.random()*WH;
  dpos[i*3+2] = (Math.random()-0.5)*30;
}
dustGeo.setAttribute('position', new THREE.BufferAttribute(dpos,3));
const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
  color:0xffeec4, size:0.034, sizeAttenuation:true, transparent:true,
  opacity:0.42, depthWrite:false, fog:true }));
dust.frustumCulled = false;
scene.add(dust);

/* ============ 5  Der nachgebaute Ort aus dem Originalfoto ============ */
{
  const vx = LM.vx, vz = LM.vz;
  const parts = [
    ['wall',  vx+1.75, 1.6,  vz+1.10,  0.25, 3.2, 5.00],
    ['wall',  vx-2.35, 1.6,  vz+0.50,  0.25, 3.2, 3.80],
    ['wall',  vx-2.95, 1.6,  vz+13.50, 11.10, 3.2, 0.25],
    ['pil',   vx-6.30, 1.6,  vz+5.60,  1.55, 3.2, 1.55],
    ['base',  vx-2.95, 0.065, vz+13.35, 11.10, 0.13, 0.33],
    ['base',  vx+1.60, 0.065, vz+1.10,  0.33, 0.13, 5.00],
    ['base',  vx-2.20, 0.065, vz+0.50,  0.33, 0.13, 3.80],
    ['rad',   vx-4.20, 0.26, vz+13.22,  4.80, 0.52, 0.26],
    ['rail',  vx-2.21, 1.05, vz+0.50,   0.06, 0.09, 3.80],
    ['plug',  vx+1.61, 0.34, vz+1.60,   0.03, 0.13, 0.09]
  ];
  const M = { wall:MAT.wall, pil:MAT.wall2, base:MAT.base, rad:MAT.rad, rail:MAT.rail, plug:MAT.plug };
  for(const p of parts){
    const m = new THREE.Mesh(new THREE.BoxGeometry(p[4],p[5],p[6]), M[p[0]]);
    m.position.set(p[1],p[2],p[3]);
    m.castShadow = m.receiveShadow = quality.shadows;
    scene.add(m);
  }
  const q = new THREE.Mesh(new THREE.PlaneGeometry(3.80, 2.10), MAT.slat);
  q.position.set(vx-4.30, 1.35, vz+13.34); q.rotation.y = Math.PI;
  scene.add(q);

  for(let k=0;k<5;k++){
    addFixture(tubeGeo, [], vx-0.50, vz+3.0+k*2.6, Math.PI/2);
    addFixture(tubeGeo, [], vx-5.40, vz+3.4+k*2.6, Math.PI/2);
  }
  // die Trennwände blockieren den Weg
  SOLIDS.push([vx+1.75, vz+1.10, 0.13, 2.50],
              [vx-2.35, vz+0.50, 0.13, 1.90],
              [vx-2.95, vz+13.50, 5.55, 0.13],
              [vx-6.30, vz+5.60, 0.78, 0.78]);
  LM.view = new THREE.Vector3(vx, 1.50, vz);
}

/* ==================== 6  Ausgang und Fundstücke ==================== */

// Ausgang: freie Randzelle möglichst weit weg vom Start
const EXIT = {};
{
  let best=-1, bestD=-1, side=0;
  for(let i=0;i<G*G;i++){
    if(blocked[i] || REACH[i] < 0) continue;
    const x=i%G, y=(i/G)|0;
    const isEdge = (x===0||y===0||x===G-1||y===G-1);
    if(!isEdge) continue;
    if(REACH[i] > bestD){ bestD=REACH[i]; best=i; side = x===0?0 : x===G-1?1 : y===0?2:3; }
  }
  if(best < 0){ best = FREE[FREE.length-1]; side = 0; }
  if(best === undefined) best = startCell;
  const x=best%G, y=(best/G)|0;
  EXIT.cell = best;
  EXIT.pos = new THREE.Vector3(x*CS+CS/2, 0, y*CS+CS/2);
  // Position und Ausrichtung in der Außenwand
  if(side===0){ EXIT.pos.x = 0.18;        EXIT.rot = Math.PI/2; }
  if(side===1){ EXIT.pos.x = SPAN-0.18;   EXIT.rot = -Math.PI/2; }
  if(side===2){ EXIT.pos.z = 0.18;        EXIT.rot = 0; }
  if(side===3){ EXIT.pos.z = SPAN-0.18;   EXIT.rot = Math.PI; }

  const g = new THREE.Group();
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.15, 0.10), MAT.door);
  door.position.y = 1.075; g.add(door);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.42, 2.42, 0.06), MAT.base);
  frame.position.set(0, 1.21, -0.04); g.add(frame);
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.07,0.28,0.07), MAT.rail);
  handle.position.set(0.42, 1.05, 0.09); g.add(handle);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.28), MAT.signOff);
  sign.position.set(0, 2.62, 0.06); g.add(sign);
  EXIT.sign = sign;
  g.position.copy(EXIT.pos);
  g.rotation.y = EXIT.rot;
  scene.add(g);
  EXIT.group = g;
  // Der Türblock steht ein Stück in den Raum
  EXIT.door = door;
}

rebuildOcc();

/* ============ 6a  Alterung: Schatten, Feuchte, Deckenschäden ============ */

/* Bodenkarte: rot = Winkelschatten, grün = nasser Teppich. Sie liegt als
   Textur über der ganzen Etage und wird auch für Schritte gelesen. */
const BK = 512, BS = BK / SPAN;
const NASS = new Float32Array(BK*BK);
function nassBei(x, z){
  const px = clamp(Math.floor(x*BS), 0, BK-1), pz = clamp(Math.floor(z*BS), 0, BK-1);
  return NASS[pz*BK + px];
}
{
  const occ = new Float32Array(BK*BK);
  for(const b of BOXES){
    const x0 = Math.max(0, Math.floor((b.x-b.hx)*BS)), x1 = Math.min(BK-1, Math.floor((b.x+b.hx)*BS));
    const z0 = Math.max(0, Math.floor((b.z-b.hz)*BS)), z1 = Math.min(BK-1, Math.floor((b.z+b.hz)*BS));
    for(let z=z0; z<=z1; z++) for(let x=x0; x<=x1; x++) occ[z*BK+x] = 1;
  }
  // Kastenunschärfe, getrennt nach Zeilen und Spalten, laufende Summe
  const weich = (a, r) => {
    const t = new Float32Array(BK*BK), o = new Float32Array(BK*BK), n = 2*r+1;
    for(let z=0; z<BK; z++){
      let s = 0;
      for(let x=-r; x<=r; x++) s += a[z*BK + clamp(x,0,BK-1)];
      for(let x=0; x<BK; x++){
        t[z*BK+x] = s/n;
        s += a[z*BK + Math.min(x+r+1, BK-1)] - a[z*BK + Math.max(x-r, 0)];
      }
    }
    for(let x=0; x<BK; x++){
      let s = 0;
      for(let z=-r; z<=r; z++) s += t[clamp(z,0,BK-1)*BK + x];
      for(let z=0; z<BK; z++){
        o[z*BK+x] = s/n;
        s += t[Math.min(z+r+1, BK-1)*BK + x] - t[Math.max(z-r, 0)*BK + x];
      }
    }
    return o;
  };
  const ao = weich(weich(occ, 2), 2);

  // Feuchte: weiche Wolken, dazu einzelne Pfützen — in den dunklen Zonen mehr
  const WN = 22, wr = new Float32Array((WN+1)*(WN+1));
  for(let i=0; i<wr.length; i++) wr[i] = rnd();
  const pfuetzen = [];
  for(let i=0; i<16; i++){
    const d = i < 6 ? DARKZONES[i % DARKZONES.length] : null;
    const x = d ? d.x + (rnd()-0.5)*d.r : rnd()*SPAN, z = d ? d.z + (rnd()-0.5)*d.r : rnd()*SPAN;
    pfuetzen.push([x, z, 1.2 + rnd()*3.2]);
  }
  const data = new Uint8Array(BK*BK*4);
  for(let pz=0; pz<BK; pz++) for(let px=0; px<BK; px++){
    const i = pz*BK + px;
    const u = px/BK*WN, v = pz/BK*WN, iu = u|0, iv = v|0;
    let fu = u-iu, fv = v-iv; fu = fu*fu*(3-2*fu); fv = fv*fv*(3-2*fv);
    const a = wr[iv*(WN+1)+iu], b = wr[iv*(WN+1)+iu+1], c = wr[(iv+1)*(WN+1)+iu], d = wr[(iv+1)*(WN+1)+iu+1];
    const n = lerp(lerp(a,b,fu), lerp(c,d,fu), fv);
    let w = clamp((n - 0.66)/0.22, 0, 1) * 0.75;
    const x = (px+0.5)/BS, z = (pz+0.5)/BS;
    for(const p of pfuetzen){
      const q = ((x-p[0])**2 + (z-p[1])**2) / (p[2]*p[2]);
      if(q < 1) w = Math.max(w, (1-q)*(1-q)*1.1);
    }
    w = clamp(w, 0, 1);
    NASS[i] = occ[i] ? 0 : w;
    data[i*4]   = Math.round(clamp(ao[i]*2.1, 0, 1)*255);
    data[i*4+1] = Math.round(NASS[i]*255);
    data[i*4+3] = 255;
  }
  const t = new THREE.DataTexture(data, BK, BK, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  FTU.tBoden.value = t;
}

/* Deckenkarte: je Platte ein Texel. rot = Platte fehlt, grün = Wasserfleck,
   blau/alpha = wo auf der Platte der Fleck sitzt. */
const LOECHER = [];
{
  const nahLicht = new Uint8Array(NT*NT);
  for(const f of fixtures){
    const r = 1.3;
    for(let tz=Math.floor((f.pos.z-r)/TILE); tz<=Math.floor((f.pos.z+r)/TILE); tz++)
      for(let tx=Math.floor((f.pos.x-r)/TILE); tx<=Math.floor((f.pos.x+r)/TILE); tx++)
        if(tx>=0 && tz>=0 && tx<NT && tz<NT) nahLicht[tz*NT+tx] = 1;
  }
  const data = new Uint8Array(NT*NT*4);
  for(let tz=0; tz<NT; tz++) for(let tx=0; tx<NT; tx++){
    const i = tz*NT + tx, wx = (tx+0.5)*TILE, wz = (tz+0.5)*TILE;
    const nass = nassBei(wx, wz);
    const frei = freeIn(OCC_RAW, wx-0.3, wz-0.3) && freeIn(OCC_RAW, wx+0.3, wz+0.3) &&
                 freeIn(OCC_RAW, wx-0.3, wz+0.3) && freeIn(OCC_RAW, wx+0.3, wz-0.3);
    const p = 0.008 + (inDark(wx, wz) ? 0.07 : 0) + nass*0.06;
    if(frei && !nahLicht[i] && versteckVon(wx, wz) < 0 && rnd() < p){
      data[i*4] = 255;
      LOECHER.push([wx, wz]);
    } else if(rnd() < 0.05 + nass*0.35){
      data[i*4+1] = 60 + ri(196); data[i*4+2] = ri(256); data[i*4+3] = ri(256);
    }
  }
  const t = new THREE.DataTexture(data, NT, NT, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  FTU.tDecke.value = t;
}

/* Eine einzelne Deckenplatte für das, was heruntergekommen ist */
function platteTex(){
  const s=128, c=cv(s,s), x=c.getContext('2d');
  x.fillStyle='#cdc6a2'; x.fillRect(0,0,s,s);
  for(let i=0;i<500;i++){
    x.fillStyle='rgba('+(140+Math.random()*60|0)+','+(134+Math.random()*50|0)+',104,.14)';
    x.fillRect(Math.random()*s, Math.random()*s, 2, 2);
  }
  blobs(x,s,s,4,'rgba(128,98,44,.35)',10,40);
  x.strokeStyle='rgba(90,84,60,.8)'; x.lineWidth=3; x.strokeRect(1,1,s-2,s-2);
  grain(x,s,s,18);
  return c;
}
MAT.platte = new THREE.MeshStandardMaterial({ map:fromCanvas(platteTex(),1,1), roughness:0.96, metalness:0 });
MAT.kabel  = new THREE.MeshStandardMaterial({ color:0x14120e, roughness:0.6, metalness:0.2 });
const HAENGT = [];      // hängende Platten und Kabel, die leise pendeln
let haengePlatten = null;
{
  const start = cellCenter(startCell);
  const liegend = [];     // Matrizen der heruntergefallenen Stücke
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
  const loecher = LOECHER.slice().sort(() => rnd() - 0.5);
  let haengend = 0, kabel = 0;
  for(const [hx, hz] of loecher){
    if(Math.hypot(hx - start.x, hz - start.z) < 5) continue;
    const r = rnd();
    if(r < 0.30 && haengend < 16){
      haengend++;
      const halter = new THREE.Group();
      halter.position.set(hx, 0, hz);
      halter.rotation.y = ri(4) * Math.PI/2;
      const scharnier = new THREE.Group();
      scharnier.position.set(-TILE/2, WH - 0.012, 0);
      const stueck = new THREE.Object3D();          // nur für die Lage — gezeichnet wird gesammelt
      scharnier.add(stueck);
      scharnier.rotation.z = -(0.85 + rnd()*0.55);
      halter.add(scharnier);
      HAENGT.push({ o:scharnier, basis:scharnier.rotation.z, ph:rnd()*6.28, amp:0.025, halter, stueck });
    } else if(r < 0.42 && kabel < 10){
      kabel++;
      const tief = 0.5 + rnd()*1.0;
      const ox = (rnd()-0.5)*0.4, oz = (rnd()-0.5)*0.4;
      const kurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(ox*0.4, -tief*0.45, oz*0.4),
        new THREE.Vector3(ox, -tief*0.8, oz),
        new THREE.Vector3(ox*1.1 + 0.05, -tief, oz*1.1)
      ]);
      const m = new THREE.Mesh(new THREE.TubeGeometry(kurve, 10, 0.009, 4, false), MAT.kabel);
      const halter = new THREE.Group();
      halter.position.set(hx + (rnd()-0.5)*0.3, WH, hz + (rnd()-0.5)*0.3);
      halter.add(m);
      scene.add(halter);
      HAENGT.push({ o:halter, basis:0, ph:rnd()*6.28, amp:0.05, kabel:true });
    }
    // was heruntergefallen ist
    if(rnd() < 0.45){
      const n = 1 + ri(3);
      for(let k=0; k<n; k++){
        const px = hx + (rnd()-0.5)*1.1, pz = hz + (rnd()-0.5)*1.1;
        if(!freeP(px, pz)) continue;
        const w = 0.14 + rnd()*0.34, d = 0.12 + rnd()*0.30;
        _e.set((rnd()-0.5)*0.08, rnd()*6.28, (rnd()-0.5)*0.08);
        liegend.push(new THREE.Matrix4().compose(_p.set(px, 0.009 + k*0.014, pz), _q.setFromEuler(_e), _s.set(w, 1, d)));
      }
    }
  }
  if(liegend.length){
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.016, 1), MAT.platte, liegend.length);
    liegend.forEach((m, i) => im.setMatrixAt(i, m));
    im.frustumCulled = false;
    scene.add(im);
  }
  const platten = HAENGT.filter(h => h.stueck);
  if(platten.length){
    const g = new THREE.BoxGeometry(TILE*0.96, 0.018, TILE*0.96);
    g.translate(TILE*0.48, 0, 0);
    haengePlatten = new THREE.InstancedMesh(g, MAT.platte, platten.length);
    haengePlatten.frustumCulled = false;
    haengePlatten.castShadow = quality.shadows;
    platten.forEach((h, i) => { h.idx = i; h.halter.updateMatrixWorld(true); haengePlatten.setMatrixAt(i, h.stueck.matrixWorld); });
    scene.add(haengePlatten);
  }
}

/* ---------- Kritzeleien an den Wänden ---------- */
function kritzelTex(zeilen, art){
  const W = 512, H = 256, c = cv(W, H), x = c.getContext('2d');
  const farbe = art === 'rost' ? [92, 26, 14] : [26, 18, 11];
  const fam = '"Arial Black", Impact, "Arial", sans-serif';
  let F = zeilen.length > 1 ? 92 : 110;
  x.font = 'bold ' + F + 'px ' + fam;
  const breit = Math.max(...zeilen.map(z => x.measureText(z).width));
  if(breit > W - 24){ F = Math.floor(F * (W - 24) / breit); x.font = 'bold ' + F + 'px ' + fam; }
  x.textBaseline = 'middle';
  const zh = F * 1.05, y0 = H/2 - (zeilen.length-1)*zh/2;
  zeilen.forEach((zeile, zi) => {
    const w = x.measureText(zeile).width;
    let px = (W - w)/2 + (Math.random()-0.5)*20;
    const py = y0 + zi*zh;
    for(const ch of zeile){
      const cw = x.measureText(ch).width;
      x.save();
      x.translate(px + cw/2, py + (Math.random()-0.5)*F*0.10);
      x.rotate((Math.random()-0.5)*0.16);
      // Filzstift: mehrere dünne Lagen, nie ganz deckend
      for(let l=0; l<3; l++){
        x.fillStyle = 'rgba(' + farbe.join(',') + ',' + (0.55 + Math.random()*0.3) + ')';
        x.fillText(ch, -cw/2 + (Math.random()-0.5)*3, (Math.random()-0.5)*3);
      }
      x.restore();
      // Farbe läuft herunter
      if(ch !== ' ' && Math.random() < 0.22){
        const lx = px + cw*(0.25 + Math.random()*0.5), ly = py + F*0.3, len = 10 + Math.random()*60;
        const g = x.createLinearGradient(0, ly, 0, ly+len);
        g.addColorStop(0, 'rgba(' + farbe.join(',') + ',0.55)');
        g.addColorStop(1, 'rgba(' + farbe.join(',') + ',0)');
        x.fillStyle = g; x.fillRect(lx, ly, 2 + Math.random()*2.5, len);
      }
      px += cw * (0.96 + Math.random()*0.08);
    }
  });
  // Die Wand schluckt einen Teil der Farbe
  x.globalCompositeOperation = 'destination-out';
  for(let i=0; i<500; i++){
    x.fillStyle = 'rgba(0,0,0,' + Math.random()*0.35 + ')';
    x.fillRect(Math.random()*W, Math.random()*H, 1 + Math.random()*3, 1 + Math.random()*2);
  }
  return c;
}
function handTex(){
  const s = 256, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = 'rgba(70,34,16,0.55)';
  x.save(); x.translate(s/2, s*0.62); x.rotate((Math.random()-0.5)*0.4);
  x.beginPath(); x.ellipse(0, 0, 44, 52, 0, 0, 7); x.fill();
  const finger = [[-38,-50,-0.45,56],[-17,-72,-0.12,74],[6,-78,0.02,80],[28,-70,0.16,70],[52,-18,0.95,50]];
  for(const [fx, fy, r, l] of finger){
    x.save(); x.translate(fx, fy); x.rotate(r);
    x.beginPath(); x.ellipse(0, -l*0.25, 11, l*0.55, 0, 0, 7); x.fill();
    x.restore();
  }
  x.restore();
  // verschmiert nach unten
  for(let i=0; i<6; i++){
    const g = x.createLinearGradient(0, s*0.6, 0, s);
    g.addColorStop(0, 'rgba(70,34,16,0.35)'); g.addColorStop(1, 'rgba(70,34,16,0)');
    x.fillStyle = g; x.fillRect(s/2 - 40 + Math.random()*80, s*0.6, 3 + Math.random()*5, s*0.4*Math.random());
  }
  x.globalCompositeOperation = 'destination-out';
  for(let i=0; i<700; i++){
    x.fillStyle = 'rgba(0,0,0,' + Math.random()*0.7 + ')';
    x.fillRect(Math.random()*s, Math.random()*s, 1 + Math.random()*3, 1 + Math.random()*3);
  }
  return c;
}
function strichTex(n){
  const W = 512, H = 256, c = cv(W, H), x = c.getContext('2d');
  x.strokeStyle = 'rgba(28,20,12,0.75)'; x.lineWidth = 5; x.lineCap = 'round';
  let px = 24, py = 30;
  for(let i=0; i<n; i++){
    const inGruppe = i % 5;
    if(inGruppe === 4){
      x.beginPath(); x.moveTo(px - 70 + Math.random()*6, py + 50); x.lineTo(px + 4, py + 6); x.stroke();
      px += 34;
      if(px > W - 90){ px = 24; py += 76; }
    } else {
      x.beginPath();
      x.moveTo(px + (Math.random()-0.5)*6, py + (Math.random()-0.5)*6);
      x.lineTo(px + (Math.random()-0.5)*8, py + 56 + (Math.random()-0.5)*8);
      x.stroke();
      px += 16;
    }
  }
  return c;
}
function pfeilTex(){
  const W = 256, H = 128, c = cv(W, H), x = c.getContext('2d');
  x.strokeStyle = 'rgba(92,26,14,0.7)'; x.lineWidth = 12; x.lineCap = 'round'; x.lineJoin = 'round';
  x.beginPath(); x.moveTo(20, 66); x.quadraticCurveTo(120, 58 + Math.random()*10, 214, 62); x.stroke();
  x.beginPath(); x.moveTo(170, 24); x.lineTo(222, 62); x.lineTo(172, 102); x.stroke();
  return c;
}

/* Alle Wandstücke mit ihren beiden Seiten: welche Zelle davor liegt und
   wohin die Fläche zeigt. */
const WANDSEITEN = [];
for(const s of segs){
  const senk = s[2] !== 0;
  const gx = senk ? Math.round(s[0]/CS) : Math.floor(s[0]/CS);
  const gy = senk ? Math.floor(s[1]/CS) : Math.round(s[1]/CS);
  const seiten = senk ? [[gx-1, gy, -1, 0], [gx, gy, 1, 0]] : [[gx, gy-1, 0, -1], [gx, gy, 0, 1]];
  for(const [cx, cy, nx, nz] of seiten){
    if(cx<0 || cy<0 || cx>=G || cy>=G) continue;
    const c = idx(cx, cy);
    if(blocked[c] || REACH[c] < 0 || SECRET[c] >= 0) continue;
    WANDSEITEN.push({ x:s[0], z:s[1], senk, zelle:c, nx, nz });
  }
}
function wandBei(zelle, r){
  const zx = zelle % G, zy = (zelle/G)|0;
  const l = WANDSEITEN.filter(w => Math.abs(w.zelle%G - zx) + Math.abs(((w.zelle/G)|0) - zy) <= r && !w.belegt);
  return l.length ? pick(l) : null;
}
function anWand(ws, canvas, breite, hoehe, y, versatz){
  if(!ws) return null;
  ws.belegt = true;
  const t = new THREE.CanvasTexture(canvas);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = ANISO;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(breite, hoehe), new THREE.MeshStandardMaterial({
    map:t, transparent:true, depthWrite:false, roughness:0.9, metalness:0,
    polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }));
  const entlang = versatz !== undefined ? versatz : (rnd()-0.5)*(CS - breite - 0.4);
  m.position.set(ws.x + ws.nx*0.125 + (ws.senk ? 0 : entlang), y, ws.z + ws.nz*0.125 + (ws.senk ? entlang : 0));
  m.rotation.y = Math.atan2(ws.nx, ws.nz);
  props.add(m);
  return m;
}
let START_BLICK = null, START_HINWEIS = null;
const KRITZEL = [
  ['NICHT RENNEN'], ['ES HÖRT DICH'], ['ZÄHL DIE', 'LAMPEN'], ['WENN DAS LICHT GEHT', 'BLEIB STEHEN'],
  ['KEIN AUSGANG'], ['WO BIST DU'], ['SIE HAT', 'KEIN GESICHT'], ['DREH DICH', 'NICHT UM'],
  ['DAS SUMMEN', 'IST SIE'], ['HILFE'], ['ICH WAR', 'HIER'], ['NICHT DIE', 'LAMPEN ANSEHEN']
];
{
  /* Der erste Hinweis steht gleich beim Aufwachen vor einem: an einer hellen
     Wand in der Nähe, auf die freie Sicht besteht. */
  {
    const st = cellCenter(startCell);
    let best = null, bestW = -1;
    // erst nah und hell, sonst weiter weg — Hauptsache, man sieht ihn
    for(const [rz, dMax] of [[3, 7.5], [6, 14]]){
      for(const ws of WANDSEITEN){
        const c = ws.zelle, cx = c % G, cy = (c/G)|0;
        if(Math.abs(cx - startCell%G) + Math.abs(cy - ((startCell/G)|0)) > rz) continue;
        const px = ws.x + ws.nx*0.8, pz = ws.z + ws.nz*0.8;      // eine Rasterzelle vor der Wand
        const d = Math.hypot(px - st.x, pz - st.z);
        if(d < 2.5 || d > dMax || !losClear(st.x, st.z, px, pz)) continue;
        // die Fläche muss zum Aufwachpunkt zeigen
        if((st.x - ws.x)*ws.nx + (st.z - ws.z)*ws.nz <= 0.5) continue;
        let licht = 0;
        for(const f of fixtures) if(!f.dead) licht = Math.max(licht, 1 - Math.hypot(f.pos.x - px, f.pos.z - pz)/6);
        const wert = licht*2 + rnd()*0.3 - Math.abs(d - 4.5)*0.15;
        if(wert > bestW){ bestW = wert; best = ws; }
      }
      if(best) break;
    }
    const ws = best || wandBei(startCell, 2);
    const m = anWand(ws, kritzelTex(['HINTER DER TAPETE', 'IST ETWAS'], 'rost'), 2.1, 1.05, 1.5, 0);
    if(m && best) START_BLICK = Math.atan2(-(m.position.x - st.x), -(m.position.z - st.z));
    START_HINWEIS = { m, gefunden: !!best };
  }
  const texte = KRITZEL.slice().sort(() => rnd() - 0.5);
  for(let i=0; i<10; i++){
    const ws = pick(WANDSEITEN);
    if(ws.belegt) continue;
    anWand(ws, kritzelTex(texte[i % texte.length], rnd() < 0.3 ? 'rost' : 'stift'), 1.8, 0.9, 1.2 + rnd()*0.6);
  }
  for(let i=0; i<6; i++){
    const ws = pick(WANDSEITEN);
    if(!ws.belegt) anWand(ws, handTex(), 0.34, 0.34, 0.9 + rnd()*0.8);
  }
  for(let i=0; i<3; i++){
    const ws = pick(WANDSEITEN);
    if(!ws.belegt) anWand(ws, strichTex(12 + ri(40)), 1.2, 0.6, 1.0 + rnd()*0.4);
  }
}

/* ---------- Fundstücke verteilen ---------- */
function spreadCells(count, minSteps, minFromStart){
  const out = [];
  let cand = FREE.filter(i => REACH[i] >= minFromStart && i !== EXIT.cell);
  if(cand.length < 2) cand = FREE.slice();
  for(let n=0; n<count; n++){
    let best=-1, bestScore=-1;
    for(let t=0;t<220;t++){
      const c = pick(cand);
      const cx=c%G, cy=(c/G)|0;
      let near = 1e9;
      for(const o of out) near = Math.min(near, Math.abs(cx-o%G) + Math.abs(cy-(o/G|0)));
      if(near < minSteps) continue;
      const score = near + rnd()*3;
      if(score > bestScore){ bestScore=score; best=c; }
    }
    if(best<0) best = cand.length ? pick(cand) : pick(FREE);
    out.push(best);
  }
  return out;
}

const items = [];      // { kind, obj, pos, taken }
function addItem(kind, obj, pos, mehr){
  obj.position.copy(pos);
  scene.add(obj);
  const it = { kind, obj, pos:pos.clone(), taken:false, spin: rnd()*6.28 };
  if(mehr) Object.assign(it, mehr);
  if(it.ruhig) it.spin = obj.rotation.y;
  items.push(it);
  return it;
}
function tapeMesh(){
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.032, 0.105), MAT.tapeBody);
  g.add(body);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.085), MAT.tapeLbl);
  lbl.rotation.x = -Math.PI/2; lbl.position.y = 0.0175;
  g.add(lbl);
  return g;
}
function battMesh(){
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.055, 0.16), MAT.batt);
  g.add(b);
  const led = new THREE.Mesh(new THREE.PlaneGeometry(0.04,0.012), MAT.signOn);
  led.rotation.x = -Math.PI/2; led.position.set(0, 0.029, 0.05);
  g.add(led);
  return g;
}
{
  const tapeCells = spreadCells(MAXTAPES, 4, 4);
  for(const c of tapeCells){
    const p = cellCenter(c, 0.045);
    p.x += (rnd()-0.5)*1.8; p.z += (rnd()-0.5)*1.8;
    if(!freeP(p.x,p.z)){ p.copy(cellCenter(c, 0.045)); }
    const m = tapeMesh(); m.rotation.y = rnd()*6.28;
    addItem('tape', m, p);
  }
  const battCells = spreadCells(MAXBATT, 3, 3);
  for(const c of battCells){
    const p = cellCenter(c, 0.03);
    p.x += (rnd()-0.5)*1.6; p.z += (rnd()-0.5)*1.6;
    if(!freeP(p.x,p.z)){ p.copy(cellCenter(c, 0.03)); }
    const m = battMesh(); m.rotation.y = rnd()*6.28;
    addItem('batt', m, p);
  }
  // Das Originalfoto liegt am nachgebauten Ort
  const ph = new THREE.Group();
  const card = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.225), MAT.photo);
  card.rotation.x = -Math.PI/2; ph.add(card);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.006, 0.245), MAT.base);
  back.position.y = -0.006; ph.add(back);
  const pp = new THREE.Vector3(LM.vx-0.6, 0.03, LM.vz+2.4);
  ph.rotation.y = 0.4;
  addItem('photo', ph, pp);
}

/* ================= 6b  Die Verstecke einrichten ================= */

MAT.naht   = new THREE.MeshBasicMaterial({ color:0x2b2212 });
MAT.matratze = new THREE.MeshStandardMaterial({ color:0x8c8260, roughness:0.95, metalness:0 });
MAT.decke2 = new THREE.MeshStandardMaterial({ color:0x4f5a3a, roughness:0.95, metalness:0 });
MAT.dose   = new THREE.MeshStandardMaterial({ color:0x9a9486, roughness:0.35, metalness:0.8 });
MAT.plastik = new THREE.MeshStandardMaterial({ color:0x26241f, roughness:0.55, metalness:0.1 });
MAT.holz   = new THREE.MeshStandardMaterial({ color:0x8a6a44, roughness:0.75, metalness:0 });
MAT.weiss  = new THREE.MeshStandardMaterial({ color:0xd9d2c2, roughness:0.8, metalness:0 });
MAT.blau   = new THREE.MeshStandardMaterial({ color:0x7f97b8, roughness:0.9, metalness:0 });
MAT.rosa   = new THREE.MeshStandardMaterial({ color:0xc9959a, roughness:0.6, metalness:0.1 });
MAT.rot    = new THREE.MeshStandardMaterial({ color:0x9c2a22, roughness:0.5, metalness:0 });

function papierTex(){
  const w=128, h=160, c=cv(w,h), x=c.getContext('2d');
  x.fillStyle='#d8cfb0'; x.fillRect(0,0,w,h);
  x.strokeStyle='rgba(40,30,20,.75)'; x.lineWidth=1.6;
  for(let y=18; y<h-12; y+=11){
    x.beginPath(); x.moveTo(10, y);
    for(let px=10; px<w-10-Math.random()*30; px+=4) x.lineTo(px, y + (Math.random()-0.5)*3);
    x.stroke();
  }
  blobs(x,w,h,3,'rgba(120,90,40,.25)',8,30);
  grain(x,w,h,12);
  return c;
}
function holzTex(){
  const w=256, h=256, c=cv(w,h), x=c.getContext('2d');
  for(let i=0;i<8;i++){
    const t = 0.8 + Math.random()*0.35;
    x.fillStyle = 'rgb(' + (128*t|0) + ',' + (92*t|0) + ',' + (58*t|0) + ')';
    x.fillRect(0, i*32, w, 32);
    x.strokeStyle='rgba(40,24,10,.55)'; x.lineWidth=2; x.strokeRect(-2 + (i%2)*97, i*32, w+4, 32);
    for(let k=0;k<14;k++){
      x.strokeStyle='rgba(60,36,16,.18)'; x.lineWidth=1;
      x.beginPath(); const y = i*32 + Math.random()*32; x.moveTo(0,y); x.bezierCurveTo(80,y+4,160,y-4,w,y+2); x.stroke();
    }
  }
  grain(x,w,h,14);
  return c;
}
function kinderTapeteTex(){
  const w=256, h=256, c=cv(w,h), x=c.getContext('2d');
  x.fillStyle='#5f7486'; x.fillRect(0,0,w,h);
  for(let i=0;i<w;i+=32){ x.fillStyle='rgba(255,255,255,.12)'; x.fillRect(i,0,12,h); }
  x.fillStyle='rgba(255,236,170,.95)';
  for(let k=0;k<9;k++){
    const sx = (k%3)*85 + 30 + (Math.floor(k/3)%2)*40, sy = Math.floor(k/3)*85 + 40;
    x.beginPath();
    for(let j=0;j<10;j++){
      const r = j%2 ? 6 : 14, a = j/10*6.283 - 1.57;
      x.lineTo(sx + Math.cos(a)*r, sy + Math.sin(a)*r);
    }
    x.fill();
  }
  blobs(x,w,h,5,'rgba(120,100,50,.20)',20,70);
  grain(x,w,h,16);
  return c;
}
function zeichnungTex(art){
  const w=256, h=192, c=cv(w,h), x=c.getContext('2d');
  x.fillStyle='#ece6d6'; x.fillRect(0,0,w,h);
  const krakel = (farbe, breite, pts) => {
    x.strokeStyle = farbe; x.lineWidth = breite; x.lineCap = 'round'; x.lineJoin = 'round';
    for(let l=0; l<2; l++){
      x.beginPath();
      pts.forEach((p,i) => { const px = p[0] + (Math.random()-0.5)*3, py = p[1] + (Math.random()-0.5)*3;
        i ? x.lineTo(px,py) : x.moveTo(px,py); });
      x.stroke();
    }
  };
  const figur = (fx, fy, s, farbe) => {
    x.strokeStyle = farbe; x.lineWidth = 3;
    x.beginPath(); x.arc(fx, fy-30*s, 9*s, 0, 7); x.stroke();
    krakel(farbe, 3, [[fx, fy-21*s],[fx, fy+6*s]]);
    krakel(farbe, 3, [[fx-14*s, fy-10*s],[fx, fy-14*s],[fx+14*s, fy-10*s]]);
    krakel(farbe, 3, [[fx-9*s, fy+28*s],[fx, fy+6*s],[fx+9*s, fy+28*s]]);
  };
  if(art === 2){
    // alles gelb, mittendrin eine kleine Tür
    for(let i=0;i<90;i++) krakel('rgba(214,184,60,.5)', 6, [[Math.random()*w, Math.random()*h],[Math.random()*w, Math.random()*h]]);
    krakel('#3a2a18', 4, [[110,150],[110,92],[146,92],[146,150]]);
    x.fillStyle='#3a2a18'; x.font='bold 22px "Comic Sans MS", "Chalkboard", sans-serif';
    x.fillText('DIE TÜR', 84, 40);
    return c;
  }
  krakel('#d9a520', 4, [[200,30],[214,30],[214,44],[200,44],[200,30]]);        // Sonne
  for(let a=0;a<8;a++) krakel('#d9a520', 3, [[207+Math.cos(a)*12,37+Math.sin(a)*12],[207+Math.cos(a)*22,37+Math.sin(a)*22]]);
  krakel('#8a3b2a', 4, [[30,150],[30,100],[70,70],[110,100],[110,150],[30,150]]); // Haus
  krakel('#3f6a2f', 5, [[0,172],[256,168]]);
  figur(140, 140, 1.0, '#2f4a8a'); figur(170, 146, 0.8, '#8a2f4a'); figur(195, 152, 0.6, '#2f7a5a');
  if(art === 1){
    // dahinter: groß, schwarz, zu lange Arme
    x.fillStyle = 'rgba(12,10,8,.9)';
    x.fillRect(222, 40, 16, 110);
    x.beginPath(); x.arc(230, 34, 12, 0, 7); x.fill();
    krakel('rgba(12,10,8,.9)', 4, [[222,60],[190,110],[176,160]]);
    krakel('rgba(12,10,8,.9)', 4, [[238,60],[250,120],[246,176]]);
  }
  return c;
}

const TEXTE = {
  lager:  'TAG 41. GLAUBE ICH.\n\nDie Lampen summen lauter, wenn sie in der Nähe ist. ' +
          'Wenn das Licht ausgeht: stehen bleiben. Nicht rennen.\n\n' +
          'Sie hört Rennen durch drei Wände.\nHinter der Tapete findet sie dich nicht.\n\n' +
          'Ich habe noch zwei Akkus. Nehmt sie.',
  zimmer: 'Das Zimmer war gestern noch nicht hier.\n\n' +
          'Die Spieluhr hört nicht auf.\nIch habe sie nie aufgezogen.\n\n' +
          'Auf dem dritten Bild ist die Tür gelb. Ich glaube, das ist der Ausgang. ' +
          'Ich glaube, das ist nicht der Ausgang.'
};

function tuerBauen(V){
  const t = V.tuer;
  const g = new THREE.Group();
  g.position.set(t.cx, 0, t.cz);
  g.rotation.y = t.rot;
  scene.add(g);
  // lokal z: zeigt die Wandseite +z ins Versteck oder hinaus?
  const lzx = Math.sin(t.rot), lzz = Math.cos(t.rot);
  const seite = (lzx*t.inX + lzz*t.inZ) > 0 ? 1 : -1;
  const DW = 1.2, DH = 2.15, o = t.oeff, D = 0.24;
  const L = o - DW/2, R = o + DW/2;
  // Tapete genau wie auf der vollen Wand: u läuft entlang, v nach oben
  const teil = (x0, x1, y0, y1, d, mat) => {
    const geo = new THREE.BoxGeometry(x1-x0, y1-y0, d);
    geo.translate((x0+x1)/2, (y0+y1)/2, 0);
    const pos = geo.attributes.position, uv = geo.attributes.uv, nrm = geo.attributes.normal;
    for(let i=0; i<pos.count; i++){
      const nz = nrm.getZ(i);
      if(Math.abs(nz) < 0.5) continue;
      const x = pos.getX(i), y = pos.getY(i);
      uv.setXY(i, nz > 0 ? (x + CS/2)/CS : (CS/2 - x)/CS, y/WH);
    }
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = m.receiveShadow = quality.shadows;
    return m;
  };
  g.add(teil(-CS/2, L, 0, WH, D, MAT.wall), teil(R, CS/2, 0, WH, D, MAT.wall), teil(L, R, DH, WH, D, MAT.wall));
  const sockel = (x0, x1, d) => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1-x0, 0.13, d), MAT.base);
    m.position.set((x0+x1)/2, 0.065, 0); return m; };
  g.add(sockel(-CS/2, L, 0.32), sockel(R, CS/2, 0.32));
  // die Naht: fein, nur von nah zu sehen
  const naht = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, D+0.004), MAT.naht);
    m.position.set(x, y, 0); g.add(m); };
  naht(0.007, DH, L, DH/2); naht(0.007, DH, R, DH/2); naht(DW, 0.007, o, DH);

  // das Türblatt hängt innen an der linken Kante
  const blatt = teil(L+0.008, R-0.008, 0.004, DH-0.006, 0.2, MAT.wall);
  blatt.geometry.translate(-L, 0, -seite*0.10);
  const bs = new THREE.Mesh(new THREE.BoxGeometry(DW-0.02, 0.13, 0.26), MAT.base);
  bs.position.set(DW/2, 0.065, -seite*0.10);
  const angel = new THREE.Group();
  angel.position.set(L, 0, seite*0.10);
  angel.add(blatt, bs);
  g.add(angel);
  // ein Handabdruck, wo jemand dagegen gedrückt hat
  {
    const tx = new THREE.CanvasTexture(handTex()); tx.encoding = THREE.sRGBEncoding;
    const hm = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.30), new THREE.MeshStandardMaterial({
      map:tx, transparent:true, depthWrite:false, roughness:0.9, opacity:0.75,
      polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2 }));
    hm.position.set(DW*0.78, 1.18 + rnd()*0.2, -seite*0.205);
    hm.rotation.y = seite > 0 ? Math.PI : 0;
    angel.add(hm);
  }
  t.gruppe = g; t.angel = angel; t.seite = seite; t.L = L; t.R = R; t.DW = DW;
  t.winkel = 0; t.ziel = 0;
  // Mitte der Öffnung in der Welt
  t.mx = t.cx + Math.cos(t.rot)*o;
  t.mz = t.cz - Math.sin(t.rot)*o;
}

/* Lokale Kästen der Türwand in Weltkästen für die Kollision */
function tuerKasten(t, lx, lz, hx, hz){
  return t.rot === 0 ? [t.cx + lx, t.cz + lz, hx, hz] : [t.cx + lz, t.cz - lx, hz, hx];
}
function tuerOeffnen(V){
  const t = V.tuer;
  if(V.offen) return;
  V.offen = true;
  t.ziel = -t.seite * 1.5;
  if(t.typ === 'V') wallV[vi(t.gx, t.gy)] = 0; else wallHz[hi(t.gx, t.gy)] = 0;
  SOLIDS.push(tuerKasten(t, (-CS/2 + t.L)/2, 0, (t.L + CS/2)/2, 0.12),
              tuerKasten(t, (t.R + CS/2)/2, 0, (CS/2 - t.R)/2, 0.12),
              tuerKasten(t, t.L + 0.14, t.seite*0.70, 0.14, 0.60));
  rebuildOcc();
}

/* Raum in eigenen Achsen: a läuft von der Tür weg, b quer dazu */
function raumAchsen(V){
  const t = V.tuer;
  const mx = (V.x0 + V.w/2)*CS, mz = (V.y0 + V.h/2)*CS;
  const vx = t.inX, vz = t.inZ, qx = -t.inZ, qz = t.inX;
  const tiefe = (vx !== 0 ? V.w : V.h)*CS - 0.3, breite = (vx !== 0 ? V.h : V.w)*CS - 0.3;
  const tb = (t.mx - mx)*qx + (t.mz - mz)*qz;              // Tür quer versetzt
  const welt = (a, b) => new THREE.Vector3(mx + vx*a + qx*b, 0, mz + vz*a + qz*b);
  const gier = Math.atan2(vx, vz);                          // lokal +z zeigt in die Tiefe
  return { mx, mz, tiefe, breite, tb, welt, gier, vx, vz, qx, qz };
}

/* Lichter der Verstecke laufen im selben Lichtgerüst wie die Deckenröhren */
function raumLicht(pos, farbe, kraft, mesh, art){
  const f = { pos:pos.clone(), mesh, dead:false, broken:false, f:3+rnd()*4, ph:rnd()*6.28, on:1,
              farbe, kraft, basis:new THREE.Color(farbe).multiplyScalar(2.2), art };
  fixtures.push(f);
  return f;
}

function lagerEinrichten(V, R){
  const s = R.tb > 0 ? -1 : 1;                              // weg von der Türseite
  const bett = R.welt(R.tiefe/2 - 1.0, s*(R.breite/2 - 0.55));
  const mat = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.14, 0.95), MAT.matratze);
  mat.position.set(bett.x, 0.07, bett.z); mat.rotation.y = R.gier + Math.PI/2; props.add(mat);
  const dk = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 0.9), MAT.decke2);
  dk.position.set(bett.x, 0.17, bett.z); dk.rotation.y = R.gier + Math.PI/2 + 0.2; props.add(dk);
  // Laterne
  const lp = R.welt(R.tiefe/2 - 0.45, s*(R.breite/2 - 2.4));
  const lat = new THREE.Group();
  const fuss = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.05, 10), MAT.plastik); fuss.position.y = 0.025;
  const glas = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 10), new THREE.MeshBasicMaterial({ color:0xffc070 }));
  glas.position.y = 0.13;
  const kopf = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.075, 0.05, 10), MAT.plastik); kopf.position.y = 0.235;
  lat.add(fuss, glas, kopf); lat.position.copy(lp); props.add(lat);
  V.licht = raumLicht(new THREE.Vector3(lp.x, 0.45, lp.z), 0xffa650, 0.26, glas, 'laterne');
  // Dosen, ein Rucksack, das Radio
  for(let i=0;i<6;i++){
    const p = R.welt(R.tiefe/2 - 0.4 - rnd()*1.6, s*(R.breite/2 - 0.5 - rnd()*2.6));
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.11, 8), MAT.dose);
    if(rnd() < 0.6){ d.rotation.z = Math.PI/2; d.rotation.y = rnd()*6.28; d.position.set(p.x, 0.035, p.z); }
    else d.position.set(p.x, 0.055, p.z);
    props.add(d);
  }
  const rp = R.welt(R.tiefe/2 - 0.35, -s*(R.breite/2 - 0.8));
  const radio = new THREE.Group();
  const kasten = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.12), MAT.plastik); kasten.position.y = 0.1;
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4), MAT.dose);
  ant.position.set(0.12, 0.42, 0); ant.rotation.z = -0.4;
  radio.add(kasten, ant); radio.position.copy(rp); radio.rotation.y = R.gier + (rnd()-0.5)*0.6; props.add(radio);
  V.klangPos = new THREE.Vector3(rp.x, 0.3, rp.z);
  // die Striche an der Wand gegenüber der Tür
  const sp = R.welt(R.tiefe/2 + 0.022, 0);
  const st = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshStandardMaterial({
    map:(() => { const t = new THREE.CanvasTexture(strichTex(41)); t.encoding = THREE.sRGBEncoding; return t; })(),
    transparent:true, depthWrite:false, roughness:0.9, polygonOffset:true, polygonOffsetFactor:-2 }));
  st.position.set(sp.x, 1.25, sp.z); st.rotation.y = R.gier + Math.PI; props.add(st);
  // Zettel auf der Matratze, zwei Akkus daneben
  const zettel = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), new THREE.MeshStandardMaterial({
    map:new THREE.CanvasTexture(papierTex()), roughness:0.9 }));
  zettel.rotation.x = -Math.PI/2;
  const zg = new THREE.Group(); zg.add(zettel); zg.rotation.y = rnd()*6.28;
  addItem('notiz', zg, new THREE.Vector3(bett.x, 0.206, bett.z), { ruhig:true, text:TEXTE.lager, versteck:V });
  for(let i=0;i<2;i++){
    const bp = R.welt(R.tiefe/2 - 0.5 - i*0.25, s*(R.breite/2 - 2.1 - i*0.2));
    const m = battMesh(); m.rotation.y = rnd()*6.28;
    addItem('batt', m, new THREE.Vector3(bp.x, 0.03, bp.z), { extra:true });
  }
}

/* Der Fernseher im Stuhlkreis: Rauschen, und ab und zu ein Bild */
const TV = { rt:null, cam:null, mat:null, schirm:null, ich:null, geist:null, zustand:'warten', t:0, V:null };
function schreinEinrichten(V, R){
  const mitte = R.welt(0.45, 0);
  for(let i=0;i<6;i++){
    const a = i/6*6.283 + 0.4;
    const ch = chairMesh();
    const px = mitte.x + Math.cos(a)*1.2, pz = mitte.z + Math.sin(a)*1.2;
    ch.position.set(px, 0, pz);
    ch.rotation.y = Math.atan2(mitte.x - px, mitte.z - pz);
    if(i === 3){ ch.rotation.z = Math.PI/2; ch.position.y = 0.23; }
    props.add(ch);
  }
  const tv = new THREE.Group();
  const schrank = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.5, 0.48), MAT.holz);
  schrank.position.y = 0.25; tv.add(schrank);
  const koerper = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.55), MAT.plastik);
  koerper.position.y = 0.8; tv.add(koerper);
  TV.rt = new THREE.WebGLRenderTarget(200, 150, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter });
  TV.mat = new THREE.ShaderMaterial({
    uniforms:{ tFeed:{ value:TV.rt.texture }, uZeit:{ value:0 }, uModus:{ value:0 }, uRausch:{ value:1 }, uHell:{ value:1 } },
    vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader:[
      'uniform sampler2D tFeed; uniform float uZeit, uModus, uRausch, uHell; varying vec2 vUv;',
      'float r(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }',
      'void main(){',
      '  vec2 uv = vUv;',
      '  float st = r(floor(uv*vec2(170.0,130.0)) + floor(uZeit*24.0)*1.73);',
      '  vec3 c = vec3(st*0.5);',
      '  if(uModus > 0.5){',
      '    uv.x += (r(vec2(floor(uv.y*120.0), floor(uZeit*18.0))) - 0.5)*0.012*(0.4 + uRausch);',
      '    vec3 f = texture2D(tFeed, uv).rgb;',
      // Restlichtkamera: alles hell und grau, was schwarz ist, bleibt schwarz
      '    float l = pow(dot(f, vec3(0.3, 0.59, 0.11)), 0.75)*0.95;',
      '    c = mix(vec3(l*0.86, l, l*0.9), vec3(st*0.6), uRausch);',
      '  }',
      '  c *= 0.82 + 0.18*sin(vUv.y*380.0);',
      '  float vg = 1.0 - dot(vUv-0.5, vUv-0.5)*1.6;',
      '  gl_FragColor = vec4(c*vg*uHell, 1.0);',
      '}'].join('\n'),
    fog:false
  });
  TV.schirm = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.48), TV.mat);
  TV.schirm.position.set(0, 0.8, 0.277); tv.add(TV.schirm);
  tv.position.copy(mitte);
  tv.rotation.y = R.gier + Math.PI;                         // schaut zur Tür
  props.add(tv);
  TV.pos = mitte.clone();
  V.licht = raumLicht(new THREE.Vector3(mitte.x - R.vx*0.6, 0.6, mitte.z - R.vz*0.6), 0x9fb6ff, 0.32, null, 'tv');
  V.klangPos = new THREE.Vector3(mitte.x, 0.3, mitte.z);
  // Die Überwachungskamera hängt über der Tür in der Ecke
  TV.cam = new THREE.PerspectiveCamera(46, 4/3, 0.1, 14);
  // in die Ecke, in die das Türblatt nicht aufschwingt
  const t = V.tuer;
  const hx = t.cx + Math.cos(t.rot)*t.L, hz = t.cz - Math.sin(t.rot)*t.L;
  const hb = (hx - R.mx)*R.qx + (hz - R.mz)*R.qz;
  const ecke = R.welt(-R.tiefe/2 + 0.2, hb > 0 ? -R.breite/2 + 0.2 : R.breite/2 - 0.2);
  TV.cam.position.set(ecke.x, WH - 0.25, ecke.z);
  TV.cam.layers.enable(1);
  // Stellvertreter für den Spieler — nur im Fernsehbild
  const ich = new THREE.Group();
  const jacke = new THREE.MeshStandardMaterial({ color:0x2c313a, roughness:0.8 });
  const haut  = new THREE.MeshStandardMaterial({ color:0x8c7662, roughness:0.8 });
  const hose  = new THREE.MeshStandardMaterial({ color:0x1d2026, roughness:0.9 });
  const box = (w,h,d,m,x,y,z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m); b.position.set(x,y,z); ich.add(b); return b; };
  box(0.42, 0.62, 0.24, jacke, 0, 1.18, 0);
  box(0.16, 0.82, 0.18, hose, -0.1, 0.41, 0); box(0.16, 0.82, 0.18, hose, 0.1, 0.41, 0);
  const kopfM = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), haut); kopfM.position.set(0, 1.62, 0); ich.add(kopfM);
  box(0.1, 0.1, 0.4, jacke, -0.2, 1.42, -0.18).rotation.x = 0.3;
  box(0.1, 0.1, 0.4, jacke, 0.2, 1.42, -0.18).rotation.x = 0.3;
  box(0.12, 0.12, 0.24, MAT.plastik, 0, 1.58, -0.3);
  ich.traverse(o => o.layers.set(1));
  ich.visible = false;
  scene.add(ich);
  TV.ich = ich;
  // und was hinter ihm steht
  TV.geist = new THREE.Group();
  TV.geist.visible = false;
  scene.add(TV.geist);
  TV.V = V;
  // das Geheimband liegt auf dem Fernseher
  const band = tapeMesh();
  const auf = new THREE.Vector3(mitte.x, 1.12, mitte.z);
  addItem('geheim', band, auf, { ruhig:true, versteck:V });
}

function zimmerEinrichten(V, R){
  const t = V.tuer;
  const tap = fromCanvas(kinderTapeteTex(), 3, 2.5);
  const tapM = new THREE.MeshStandardMaterial({ map:tap, roughness:0.9 });
  // Tapete über die Innenseiten der Wände — nur die Tapetentür bleibt gelb
  for(let y=V.y0; y<V.y0+V.h; y++) for(let x=V.x0; x<V.x0+V.w; x++){
    const seiten = [[x, y, x*CS, y*CS+CS/2, 1, 0, 'V', x, y], [x+1, y, (x+1)*CS, y*CS+CS/2, -1, 0, 'V', x+1, y],
                    [x, y, x*CS+CS/2, y*CS, 0, 1, 'H', x, y], [x, y+1, x*CS+CS/2, (y+1)*CS, 0, -1, 'H', x, y+1]];
    for(const [, , wx, wz, nx, nz, typ, gx, gy] of seiten){
      const zu = typ === 'V' ? wallV[vi(gx,gy)] : wallHz[hi(gx,gy)];
      if(!zu || (typ === t.typ && gx === t.gx && gy === t.gy)) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(CS, WH - 0.14), tapM);
      m.position.set(wx + nx*0.123, WH/2 + 0.07, wz + nz*0.123);
      m.rotation.y = Math.atan2(nx, nz);
      props.add(m);
    }
  }
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(V.w*CS - 0.26, V.h*CS - 0.26), new THREE.MeshStandardMaterial({
    map:fromCanvas(holzTex(), V.w*2, V.h*2), roughness:0.7 }));
  boden.rotation.x = -Math.PI/2;
  boden.position.set(R.mx, 0.005, R.mz);
  props.add(boden);
  // Kinderbett an der Wand gegenüber
  const s = R.tb > 0 ? -1 : 1;
  const bp = R.welt(R.tiefe/2 - 0.5, s*(R.breite/2 - 0.95));
  const bett = new THREE.Group();
  const box = (w,h,d,m,x,y,z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m); b.position.set(x,y,z); bett.add(b); return b; };
  box(0.86, 0.3, 1.7, MAT.weiss, 0, 0.15, 0);
  box(0.8, 0.12, 1.62, MAT.matratze, 0, 0.36, 0);
  box(0.82, 0.07, 1.05, MAT.blau, 0, 0.44, 0.28);
  box(0.5, 0.1, 0.28, MAT.weiss, 0, 0.47, -0.62);
  box(0.86, 0.6, 0.06, MAT.weiss, 0, 0.3, -0.85);
  bett.position.copy(bp); bett.rotation.y = R.gier + Math.PI/2*s;
  props.add(bett);
  // Nachttisch mit Lampe und Spieluhr
  const np = R.welt(R.tiefe/2 - 0.3, s*(R.breite/2 - 2.15));
  const nt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.36), MAT.holz);
  nt.position.set(np.x, 0.25, np.z); nt.rotation.y = R.gier; props.add(nt);
  const schirm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.14, 12, 1, true), new THREE.MeshBasicMaterial({ color:0xffc48a, side:THREE.DoubleSide }));
  schirm.position.set(np.x + 0.08*R.qx, 0.72, np.z + 0.08*R.qz); props.add(schirm);
  const stab = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), MAT.dose);
  stab.position.set(np.x + 0.08*R.qx, 0.58, np.z + 0.08*R.qz); props.add(stab);
  V.licht = raumLicht(new THREE.Vector3(np.x, 0.9, np.z), 0xffb070, 0.28, schirm, 'lampe');
  const uhr = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.09), MAT.rosa);
  uhr.position.set(np.x - 0.1*R.qx, 0.54, np.z - 0.1*R.qz); uhr.rotation.y = R.gier + 0.3; props.add(uhr);
  V.klangPos = new THREE.Vector3(uhr.position.x, 0.55, uhr.position.z);
  // Bilder an der Wand
  [0, 1, 2].forEach(k => {
    const tx = new THREE.CanvasTexture(zeichnungTex(k)); tx.encoding = THREE.sRGBEncoding;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.315), new THREE.MeshStandardMaterial({ map:tx, roughness:0.9,
      polygonOffset:true, polygonOffsetFactor:-3, polygonOffsetUnits:-3 }));
    const p = R.welt(R.tiefe/2 + 0.015, (k - 1)*0.62 - s*0.3);
    m.position.set(p.x, 1.22 + (k%2)*0.12, p.z);
    m.rotation.y = R.gier + Math.PI; m.rotation.z = (rnd()-0.5)*0.12;
    props.add(m);
  });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), MAT.rot);
  const bl = R.welt(0.3, -s*0.6); ball.position.set(bl.x, 0.1, bl.z); props.add(ball);
  // Zettel auf dem Bett, ein Akku auf dem Nachttisch
  const zettel = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), new THREE.MeshStandardMaterial({
    map:new THREE.CanvasTexture(papierTex()), roughness:0.9 }));
  zettel.rotation.x = -Math.PI/2;
  const zg = new THREE.Group(); zg.add(zettel); zg.rotation.y = rnd()*6.28;
  addItem('notiz', zg, new THREE.Vector3(bp.x, 0.485, bp.z), { ruhig:true, text:TEXTE.zimmer, versteck:V });
  const m = battMesh(); m.rotation.y = rnd()*6.28;
  addItem('batt', m, new THREE.Vector3(np.x + 0.12*R.qx, 0.53, np.z + 0.12*R.qz), { extra:true });
}

for(const V of VERSTECKE){
  if(!V.tuer) continue;
  tuerBauen(V);
  const R = raumAchsen(V);
  V.R = R;
  if(V.art === 'lager') lagerEinrichten(V, R);
  else if(V.art === 'schrein') schreinEinrichten(V, R);
  else zimmerEinrichten(V, R);
  // draußen ein Hinweis in der Nähe der Tür
  const HINWEIS = { lager:['HIER', 'WOHNT JEMAND'], schrein:['NICHT', 'HINSEHEN'], zimmer:['HÖRST DU', 'DIE MUSIK?'] };
  anWand(wandBei(V.tuer.aussen, 1), kritzelTex(HINWEIS[V.art], 'rost'), 1.4, 0.7, 1.5);
}
const VERSTECKE_DA = VERSTECKE.filter(V => V.tuer).length;

/* ======================== 7  Die Gestalt ======================== */

function fallbackMonster(){
  const g=new THREE.Group(), D=MAT.black;
  const put=(w,h,d,y)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),D); m.position.y=y; g.add(m); return m; };
  put(.52,1.25,.30, 1.75); put(.40,.34,.30, 1.02); put(.16,.30,.16, 2.50); put(.30,.40,.30, 2.78);
  const limb=(w,h,px,py)=>{ const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,w),D);
    m.geometry.translate(0,-h/2,0); m.position.set(px,py,0); g.add(m); return m; };
  limb(.10,1.35,-.33,2.32); limb(.10,1.35,.33,2.32);
  limb(.13,1.05,-.14,1.02); limb(.13,1.05,.14,1.02);
  return g;
}

const MON = {
  group: new THREE.Group(),
  body:  null,
  pos:   new THREE.Vector3(),
  dir:   new THREE.Vector3(0,0,1),
  state: 'roam',
  path:  null,
  pathIdx: 0,
  repath: 0,
  lastSeen: new THREE.Vector3(),
  seenT: -99,
  searchT: 0,
  stuck: 0,
  dirT: 12,
  sndT: 2,
  height: 2.55
};
MON.group.visible = false;
scene.add(MON.group);

/* Augen: im normalen Bild kaum zu ahnen, im Nachtsichtbild werfen sie das
   Infrarot zurück wie bei einem Tier am Straßenrand. */
function glanzTex(){
  const s = 64, c = cv(s, s), x = c.getContext('2d');
  const g = x.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return c;
}
MAT.auge = new THREE.MeshBasicMaterial({ map:new THREE.CanvasTexture(glanzTex()), color:0x000000, transparent:true,
  blending:THREE.AdditiveBlending, depthWrite:false, fog:false });
const AUGEN_FARBE = new THREE.Color();
function augenSetzen(ziel, koerper){
  const pos = ziel.position.clone(), rot = ziel.rotation.y;
  ziel.position.set(0, 0, 0); ziel.rotation.y = 0; ziel.updateMatrixWorld(true);
  const kopf = koerper.getObjectByName && koerper.getObjectByName('Head');
  const box = new THREE.Box3();
  if(kopf) box.setFromObject(kopf);
  else box.set(new THREE.Vector3(-0.15, 2.58, -0.15), new THREE.Vector3(0.15, 2.98, 0.15));
  ziel.position.copy(pos); ziel.rotation.y = rot; ziel.updateMatrixWorld(true);
  const c = new THREE.Vector3(), sz = new THREE.Vector3();
  box.getCenter(c); box.getSize(sz);
  for(const alt of ziel.children.filter(o => o.userData.auge)) ziel.remove(alt);
  for(const sx of [-1, 1]){
    const a = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.17), MAT.auge);
    a.position.set(c.x + sx*Math.max(0.045, sz.x*0.17), c.y + sz.y*0.08, box.max.z + 0.02);
    a.userData.auge = true;
    a.renderOrder = 3;
    ziel.add(a);
  }
}
function gestaltKlon(ziel, ebene){
  // Wechselt die Figur in einer Gruppe gegen einen Abguss der Gestalt aus
  for(const alt of ziel.children.slice()) ziel.remove(alt);
  const k = MON.body.clone();
  ziel.add(k);
  augenSetzen(ziel, k);
  if(ebene) ziel.traverse(o => o.layers.set(ebene));
}
{
  const fb = fallbackMonster();
  MON.group.add(fb); MON.body = fb;
  augenSetzen(MON.group, fb);
  const loader = new THREE.GLTFLoader(loadMgr);
  loader.load(A('assets/monster.glb'), gl => {
    const m = gl.scene;
    const box = new THREE.Box3().setFromObject(m), sz = new THREE.Vector3();
    box.getSize(sz);
    m.scale.setScalar(MON.height / (sz.y || 1));
    box.setFromObject(m);
    m.position.y = -box.min.y;
    m.traverse(o => { if(o.isMesh){ o.material = MAT.black; o.frustumCulled = false; o.castShadow = false; } });
    MON.group.remove(fb);
    MON.group.add(m);
    MON.body = m;
    augenSetzen(MON.group, m);
    gestaltKlon(glimpse);
    if(TV.geist) gestaltKlon(TV.geist, 1);
  }, undefined, () => { /* Notfigur bleibt stehen */ });
}

// Startpunkt: möglichst weit weg vom Spieler
{
  let far=-1, farD=-1;
  for(const i of FREE){
    if(i === EXIT.cell || REACH[i] <= farD) continue;
    const c = cellCenter(i);
    if(!freeM(c.x, c.z)) continue;          // zu eng für die Gestalt
    farD = REACH[i]; far = i;
  }
  if(far < 0) for(const i of FREE){ const c = cellCenter(i); if(freeM(c.x,c.z)){ far=i; break; } }
  if(far < 0) far = startCell;
  const p = cellCenter(far, 0);
  MON.pos.copy(p);
  MON.group.position.copy(p);
}

const cellOf = (x,z) => idx(clamp(Math.floor(x/CS),0,G-1), clamp(Math.floor(z/CS),0,G-1));

function monSetPath(toCell){
  // In ein Versteck führt kein Weg — dann eben vor dessen Tür
  const vk = SECRET[toCell];
  if(vk >= 0 && VERSTECKE[vk].tuer) toCell = VERSTECKE[vk].tuer.aussen;
  const from = cellOf(MON.pos.x, MON.pos.z);
  const p = pathToMon(from, toCell);
  MON.path = (p && p.length) ? p : null;
  MON.pathIdx = 0;
}
function monRoam(){
  let c = pick(FREE), t=0;
  while(t++ < 12 && cellCenter(c).distanceTo(MON.pos) < 12) c = pick(FREE);
  MON.state = 'roam';
  monSetPath(c);
}

const _mv = new THREE.Vector3();
function monUnstick(){
  if(freeM(MON.pos.x, MON.pos.z)) return;
  const c = cellCenter(cellOf(MON.pos.x, MON.pos.z));
  if(freeM(c.x, c.z)){ MON.pos.set(c.x, 0, c.z); MON.path=null; return; }
  for(const i of FREE){
    const p = cellCenter(i);
    if(freeM(p.x, p.z)){ MON.pos.set(p.x, 0, p.z); MON.path=null; return; }
  }
}

/* Etwas hat die Gestalt aufmerksam gemacht — sie geht der Stelle nach. */
function monAlert(x, z, lange){
  MON.lastSeen.set(x, 0, z);
  if(MON.state === 'hunt') return;
  MON.state = 'search';
  MON.searchT = Math.max(MON.searchT, lange ? 16 : 11);
  MON.repath = 0;
}

function updateMonster(dt, player, noiseRadius){
  monUnstick();
  const toP = _mv.set(player.x - MON.pos.x, 0, player.z - MON.pos.z);
  const distP = toP.length();
  /* Hinter der Tapete findet sie dich nicht. Sie weiß aber, wo du
     verschwunden bist — und wartet dort. */
  const vk = versteckVon(player.x, player.z);
  if(vk >= 0){
    noiseRadius = 0;
    const V = VERSTECKE[vk];
    if(MON.state === 'hunt' && V.tuer){
      const c = cellCenter(V.tuer.aussen);
      MON.lastSeen.set(c.x, 0, c.z);
      MON.state = 'search'; MON.searchT = 16; MON.repath = 0;
      MON.wartet = vk;
    }
  } else MON.wartet = -1;
  const sees = vk < 0 && distP < CFG.monSight &&
               (distP < 6 || toP.clone().normalize().dot(MON.dir) > CFG.monCone) &&
               losClear(MON.pos.x, MON.pos.z, player.x, player.z);

  if(sees){
    MON.seenT = 0;
    MON.lastSeen.set(player.x, 0, player.z);
    if(MON.state !== 'hunt'){ MON.state = 'hunt'; MON.repath = 0; onMonsterSpots(); }
  } else {
    MON.seenT += dt;
  }
  // Lärm: rennende Schritte tragen weit
  if(!sees && noiseRadius > 0 && distP < noiseRadius){
    MON.lastSeen.set(player.x, 0, player.z);
    if(MON.state === 'roam'){ MON.state = 'search'; MON.searchT = 12; MON.repath = 0; }
    else if(MON.state === 'search'){ MON.searchT = Math.max(MON.searchT, 10); MON.repath = Math.min(MON.repath, 0.2); }
  }

  /* Regie: die Gestalt darf nicht ewig am anderen Ende der Etage kreisen.
     Zieht sie zu lange ihre Bahnen, wandert sie in die Gegend des Spielers —
     nah genug für eine Begegnung, ohne dass sie direkt auf ihn zuläuft. */
  MON.dirT -= dt;
  if(MON.dirT <= 0){
    MON.dirT = CFG.dirMin + Math.random()*CFG.dirRnd;
    if(MON.state === 'roam' && distP > 26){
      const pc = cellOf(player.x, player.z), px = pc%G, py = (pc/G)|0;
      for(let t=0;t<40;t++){
        const cx = clamp(px + (Math.random()*15|0) - 7, 0, G-1);
        const cy = clamp(py + (Math.random()*15|0) - 7, 0, G-1);
        const c = idx(cx,cy);
        if(blocked[c] || REACH[c] < 0) continue;
        const ring = Math.abs(cx-px) + Math.abs(cy-py);
        if(ring < 3 || ring > 8) continue;      // in die Gegend, nicht auf den Schoß
        monSetPath(c);
        break;
      }
    }
  }

  // Schwere Schritte, sobald sie in Hörweite ist — das kündigt sie an.
  // Man hört, aus welcher Richtung sie kommt, und ob eine Wand dazwischen ist.
  MON.sndT -= dt;
  if(MON.sndT <= 0){
    const hear = MON.state === 'hunt' ? 30 : 22;
    if(distP < hear && MON.bewegt){
      MON.sndT = MON.state === 'hunt' ? 0.42 : 0.9 + Math.random()*0.5;
      KLANG.gestaltSchritt(MON.pos.x, MON.pos.z, MON.state === 'hunt');
    } else MON.sndT = 0.6;
  }
  // Atmen, wenn sie nah ist; Knurren, wenn sie jagt
  MON.atemT = (MON.atemT || 2) - dt;
  if(MON.atemT <= 0){
    if(MON.state === 'hunt'){
      MON.atemT = 2.4 + Math.random()*1.8;
      if(distP < 22) KLANG.knurren(MON.pos.x, MON.pos.z);
    } else {
      MON.ein = !MON.ein;
      MON.atemT = MON.ein ? 1.05 : 1.6 + Math.random()*0.8;
      if(distP < 13) KLANG.atem(MON.pos.x, MON.pos.z, MON.ein, clamp(1.2 - distP/13, 0.25, 1));
    }
  }
  // Wer sich versteckt, hört sie vor der Tür
  if(MON.wartet >= 0 && VERSTECKE[MON.wartet].tuer){
    const t = VERSTECKE[MON.wartet].tuer;
    MON.kratzT = (MON.kratzT || 4) - dt;
    if(MON.kratzT <= 0 && Math.hypot(MON.pos.x - t.mx, MON.pos.z - t.mz) < 4.5){
      MON.kratzT = 5 + Math.random()*6;
      KLANG.kratzen(t.mx, t.mz);
    }
  }

  MON.repath -= dt;
  if(MON.state === 'hunt'){
    if(MON.seenT > CFG.verlier){ MON.state='search'; MON.searchT=12; MON.repath=0; }
    else if(MON.repath <= 0){ MON.repath = 0.55; monSetPath(cellOf(MON.lastSeen.x, MON.lastSeen.z)); }
  } else if(MON.state === 'search'){
    MON.searchT -= dt;
    if(MON.searchT <= 0) monRoam();
    else if(MON.repath <= 0 || !MON.path){
      MON.repath = 2.5;
      const base = cellOf(MON.lastSeen.x, MON.lastSeen.z);
      const bx = clamp((base%G) + ri(5)-2, 0, G-1), by = clamp(((base/G)|0) + ri(5)-2, 0, G-1);
      monSetPath(blocked[idx(bx,by)] ? base : idx(bx,by));
    }
  } else if(!MON.path || MON.pathIdx >= MON.path.length){
    monRoam();
  }

  // Bewegung entlang des Weges
  const hunted = CFG.monHunt + (S.tapes || 0)*CFG.steigerung;   // mit jedem Band wird sie zäher
  const speed = MON.state==='hunt' ? hunted : (MON.state==='search' ? CFG.monWalk*1.6 : CFG.monWalk*1.15);
  let tx, tz;
  if(MON.state === 'hunt' && distP < 7 && losClear(MON.pos.x, MON.pos.z, player.x, player.z)){
    tx = player.x; tz = player.z;                       // in Sichtweite direkt drauf zu
  } else if(MON.path && MON.pathIdx < MON.path.length){
    const c = MON.path[MON.pathIdx];
    tx = (c%G)*CS+CS/2; tz = ((c/G)|0)*CS+CS/2;
    if((MON.pos.x-tx)**2 + (MON.pos.z-tz)**2 < 0.55){ MON.pathIdx++; MON.stuck = 0; }
  } else {
    // Auf der Suche bleibt sie stehen und lauscht, bis ihr die nächste Stelle einfällt
    if(MON.state !== 'search') monRoam();
    MON.bewegt = false;
    return distP;
  }

  const dx = tx-MON.pos.x, dz = tz-MON.pos.z, dl = Math.hypot(dx,dz) || 1;
  const step = speed*dt;
  const nx = MON.pos.x + dx/dl*step, nz = MON.pos.z + dz/dl*step;
  let moved = false;
  MON.bewegt = true;
  if(freeM(nx,nz)){ MON.pos.x=nx; MON.pos.z=nz; moved=true; }
  else if(freeM(nx, MON.pos.z)){ MON.pos.x=nx; moved=true; }
  else if(freeM(MON.pos.x, nz)){ MON.pos.z=nz; moved=true; }
  MON.bewegt = moved;
  if(!moved){
    MON.stuck += dt;
    if(MON.stuck > 0.7){ MON.stuck=0; MON.repath=0; if(MON.state==='roam') monRoam(); }
  }

  // Ausrichtung weich nachziehen
  const want = Math.atan2(dx, dz);
  const cur = MON.group.rotation.y;
  let d = want - cur;
  while(d >  Math.PI) d -= Math.PI*2;
  while(d < -Math.PI) d += Math.PI*2;
  MON.group.rotation.y = cur + d*Math.min(dt*4.5, 1);
  MON.dir.set(Math.sin(MON.group.rotation.y), 0, Math.cos(MON.group.rotation.y));

  // schwerer Gang
  const w = performance.now()*0.001 * (MON.state==='hunt' ? 11 : 5.5);
  MON.group.position.set(MON.pos.x, Math.abs(Math.sin(w))*0.11, MON.pos.z);
  if(MON.body){
    MON.body.rotation.z = Math.sin(w)*0.05;
    MON.body.rotation.x = 0.06 + Math.sin(w*2)*0.028;
  }
  MON.group.visible = distP < 42;
  return distP;
}

/* ---------- Eine Gestalt am Gangende, die verschwindet ---------- */
const glimpse = new THREE.Group();
glimpse.visible = false;
scene.add(glimpse);
gestaltKlon(glimpse);                       // bis das Modell da ist: die Notfigur
if(TV.geist) gestaltKlon(TV.geist, 1);

const SCARE = {
  t: 22 + Math.random()*18, glimpseT: 0, blitz: 0, weg: 0,
  aus: 0, ausListe: [], imDunkeln: false,
  echo: 0, echoNach: false,
  fluesterT: 35 + Math.random()*30, klopfT: 28 + Math.random()*30, grollT: 20 + Math.random()*25
};

/* Stellen, an denen es von der Decke tropft: dort, wo der Teppich am
   nassesten ist. */
const TROPFEN = [];
for(let v=0; v<400 && TROPFEN.length<14; v++){
  const x = rnd()*SPAN, z = rnd()*SPAN;
  if(nassBei(x, z) < 0.55 || !freeP(x, z)) continue;
  TROPFEN.push({ x, z, t: rnd()*3 });
}

/* Sucht einen Platz im Blickfeld, auf den freie Sicht besteht. */
function platzImBlick(minD, maxD){
  for(let v=0; v<26; v++){
    const ab = (Math.random()-0.5) * 0.9;                  // bis ±26° zur Blickachse
    const d  = minD + Math.random()*(maxD-minD);
    const y  = S.yaw + ab;
    const x  = S.pos.x - Math.sin(y)*d, z = S.pos.z - Math.cos(y)*d;
    if(!freeP(x, z)) continue;
    if(!losClear(S.pos.x, S.pos.z, x, z)) continue;
    return { x, z, d };
  }
  return null;
}

/* Eine Röhre in Sichtweite platzt */
function roehrePlatzt(){
  let f = null, best = 1e9;
  for(const k of fixtures){
    if(k.dead || k.art || k.aus) continue;
    const d = k.pos.distanceTo(camera.position);
    if(d < 3 || d > 16) continue;
    if(!losClear(S.pos.x, S.pos.z, k.pos.x, k.pos.z)) continue;
    if(d < best){ best = d; f = k; }
  }
  if(!f) return false;
  f.dead = true;
  SCARE.blitz = 0.12;
  burst(0.10, 5200, 0.34, 'highpass');                      // Knall
  if(tonAn()) setTimeout(() => KLANG.knall(f.pos.x, f.pos.z), 60);
  S.glitch = Math.max(S.glitch, 0.8);
  if(navigator.vibrate) navigator.vibrate(45);
  return true;
}

/* Mit jedem Band wird es dunkler: ein paar Röhren sterben still. */
function lichterSterben(){
  setTimeout(() => { if(S.phase === 'play') roehrePlatzt(); }, 2200 + Math.random()*1500);
  for(const f of fixtures){
    if(f.dead || f.art || rnd() > 0.05) continue;
    if(f.pos.distanceTo(camera.position) < 10) continue;
    f.dead = true;
  }
}

/* Stromausfall: alles ringsum geht aus, das Brummen fällt in sich
   zusammen. Wer jetzt die Nachtsicht anhat, sieht, wer da steht. */
function stromAus(){
  SCARE.aus = 3.8 + Math.random()*2.6;
  SCARE.ausListe.length = 0;
  for(const f of fixtures){
    if(f.dead || f.art) continue;
    if(f.pos.distanceTo(camera.position) < 36){ f.aus = true; f.zuend = undefined; SCARE.ausListe.push(f); }
  }
  KLANG.relais();
  KLANG.brummen(false, 1.4);
  const p = platzImBlick(5, 10);
  if(p){
    glimpse.position.set(p.x, 0, p.z);
    glimpse.visible = true;
    SCARE.imDunkeln = true;
    SCARE.glimpseT = SCARE.aus + 1;
  }
  S.glitch = Math.max(S.glitch, 0.5);
}
function stromAn(){
  const l = SCARE.ausListe.slice().sort((a,b) =>
    a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
  l.forEach((f, i) => { f.zuend = 0.2 + i*0.05 + Math.random()*0.3; });
  SCARE.ausListe.length = 0;
  KLANG.brummen(true, 0.7);
  if(SCARE.imDunkeln){ glimpse.visible = false; SCARE.imDunkeln = false; }
}

/* Regie für die Schrecken zwischendurch. Sie greift nur, wenn die
   Gestalt gerade nicht ohnehin hinter einem her ist. */
function scareTick(dt){
  const versteckt = versteckVon(S.pos.x, S.pos.z) >= 0;
  // Die Gestalt am Gangende wieder einsammeln
  if(glimpse.visible){
    SCARE.glimpseT -= dt;
    glimpse.lookAt(camera.position.x, 0, camera.position.z);
    const dx = glimpse.position.x - camera.position.x, dz = glimpse.position.z - camera.position.z;
    const d = Math.hypot(dx, dz) || 1;
    const imBlick = (-Math.sin(S.yaw)*dx - Math.cos(S.yaw)*dz)/d > 0.72;
    SCARE.weg = imBlick ? 0 : SCARE.weg + dt;
    const nah = d < (SCARE.imDunkeln ? 3 : 7);
    // sie ist weg, sobald man wegsieht — oder zu nah kommt
    if(SCARE.glimpseT <= 0 || nah || (SCARE.weg > 0.35 && !SCARE.imDunkeln)){
      glimpse.visible = false;
      if(nah) burst(0.20, 900, 0.10, 'highpass');           // ein Rascheln, dann weg
      if(nah && SCARE.imDunkeln){ KLANG.fluestern(0, 0.8, 1.2); SCARE.imDunkeln = false; }
    }
  }
  if(SCARE.blitz > 0) SCARE.blitz -= dt;

  // Stromausfall läuft
  if(SCARE.aus > 0){
    SCARE.aus -= dt;
    if(SCARE.aus <= 0) stromAn();
  }

  // Die Schritte hinter dir: jeder deiner Schritte kommt noch einmal
  if(SCARE.echo > 0){
    SCARE.echo -= dt;
    if(S.t - S.lastStep > 0.55 && S.t - S.lastStep < 2 && !SCARE.echoNach){
      // du bleibst stehen — es macht noch einen Schritt
      SCARE.echoNach = true;
      const bx = S.pos.x + Math.sin(S.yaw)*3.2, bz = S.pos.z + Math.cos(S.yaw)*3.2;
      setTimeout(() => { if(S.phase === 'play') KLANG.fremdSchritt(bx, bz, 1.1); }, 350);
      SCARE.echo = 0;
    }
  }

  // Tropfen
  for(const tr of TROPFEN){
    const d2 = (tr.x - S.pos.x)**2 + (tr.z - S.pos.z)**2;
    if(d2 > 100) continue;
    tr.t -= dt;
    if(tr.t <= 0){ tr.t = 1.1 + Math.random()*2.6; KLANG.tropfen(tr.x, tr.z); }
  }

  if(MON.state === 'hunt') return;

  // Flüstern, öfter im Dunkeln und im Stillstand
  const dunkel = inDark(S.pos.x, S.pos.z) || SCARE.aus > 0;
  SCARE.fluesterT -= dt * (dunkel ? 2 : 1) * (S.gait < 0.2 ? 1.6 : 1);
  if(SCARE.fluesterT <= 0){
    SCARE.fluesterT = 45 + Math.random()*50;
    KLANG.fluestern(Math.random() < 0.5 ? -0.85 : 0.85, 1.4 + Math.random()*1.4, 0.9);
    S.glitch = Math.max(S.glitch, 0.3);
  }
  // Klopfen hinter einer Wand
  SCARE.klopfT -= dt;
  if(SCARE.klopfT <= 0){
    SCARE.klopfT = 35 + Math.random()*45;
    const a = Math.random()*6.283, d = 8 + Math.random()*8;
    KLANG.klopfen(clamp(S.pos.x + Math.cos(a)*d, 1, SPAN-1), clamp(S.pos.z + Math.sin(a)*d, 1, SPAN-1), 3);
  }
  // Das Gebäude arbeitet
  SCARE.grollT -= dt;
  if(SCARE.grollT <= 0){
    SCARE.grollT = 30 + Math.random()*40;
    const a = Math.random()*6.283;
    KLANG.grollen(clamp(S.pos.x + Math.cos(a)*25, 1, SPAN-1), clamp(S.pos.z + Math.sin(a)*25, 1, SPAN-1));
  }

  SCARE.t -= dt;
  if(SCARE.t > 0 || SCARE.aus > 0) return;
  SCARE.t = 26 + Math.random()*32;
  if(versteckt){ SCARE.t = 8; return; }            // in einem Versteck lässt die Regie dich in Ruhe

  const distM = MON.pos.distanceTo(S.pos);
  const wahl = Math.random();
  if(wahl < 0.28){
    // Jemand steht am Ende des Ganges
    const p = platzImBlick(11, 24);
    if(p){
      glimpse.position.set(p.x, 0, p.z);
      glimpse.visible = true;
      SCARE.weg = 0;
      SCARE.glimpseT = 1.4 + Math.random()*1.6;
      if(tonAn()) rausch(SND.master, 0.9, 'lowpass', 260, 0.7, 0.12, 0.3, SND.braunBuf);
      S.glitch = Math.max(S.glitch, 0.55);
    }
  } else if(wahl < 0.48){
    roehrePlatzt();
  } else if(wahl < 0.68){
    stromAus();
  } else if(wahl < 0.84){
    // Irgendwo schlägt Metall auf
    const a = Math.random()*6.283, d = 12 + Math.random()*10;
    KLANG.knall(clamp(S.pos.x + Math.cos(a)*d, 1, SPAN-1), clamp(S.pos.z + Math.sin(a)*d, 1, SPAN-1));
    S.glitch = Math.max(S.glitch, 0.45);
  } else if(distM > 18){
    // Ab jetzt geht jemand hinter dir
    SCARE.echo = 7 + Math.random()*6;
    SCARE.echoNach = false;
  } else SCARE.t = 5;
}

/* ============ 8  Bild: Fischauge, Bandfehler, Nachtsicht ============ */

let RT_W = 640, RT_H = 360;
const rt = new THREE.WebGLRenderTarget(RT_W, RT_H, {
  minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat });
rt.texture.encoding = THREE.sRGBEncoding;

let HUD_W = 640, HUD_H = 360;
const hudC = cv(HUD_W, HUD_H), hudX = hudC.getContext('2d');
const hudTex = new THREE.CanvasTexture(hudC);
hudTex.minFilter = THREE.LinearFilter;

const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
const postMat = new THREE.ShaderMaterial({
  uniforms:{
    tDiffuse:{value:rt.texture}, tHud:{value:hudTex},
    uTime:{value:0}, uGlitch:{value:0.06}, uStatic:{value:0}, uFade:{value:0},
    uRed:{value:0}, uNv:{value:0}, uVhs:{value:CFG.vhs}, uLens:{value:CFG.lens},
    uYellow:{value:CFG.yellow},
    uRes:{value:new THREE.Vector2(RT_W,RT_H)}
  },
  vertexShader:'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader:[
    'uniform sampler2D tDiffuse, tHud;',
    'uniform float uTime,uGlitch,uStatic,uFade,uRed,uNv,uVhs,uLens,uYellow;',
    'uniform vec2 uRes;',
    'varying vec2 vUv;',
    'float rand(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }',
    'vec3 hi(vec2 p){ return max(texture2D(tDiffuse, clamp(p,0.002,0.998)).rgb - 0.80, 0.0); }',
    'vec3 bloom(vec2 p){',
    '  vec2 r = vec2(0.008,0.011);',
    '  vec3 s = hi(p+vec2(r.x,0.))+hi(p-vec2(r.x,0.))+hi(p+vec2(0.,r.y))+hi(p-vec2(0.,r.y))',
    '        + hi(p+r*0.7)+hi(p-r*0.7)+hi(p+vec2(r.x,-r.y)*0.7)+hi(p+vec2(-r.x,r.y)*0.7);',
    '  vec2 w = r*2.8;',
    '  s += hi(p+vec2(w.x,0.))+hi(p-vec2(w.x,0.))+hi(p+vec2(0.,w.y))+hi(p-vec2(0.,w.y));',
    '  return s/12.0;',
    '}',
    'void main(){',
    '  float V = uVhs;',
    '  vec2 uv = vUv;',
    '  vec2 cc = uv-0.5;',
    '  float r2 = dot(cc,cc);',
    '  uv = 0.5 + cc*(1.0 + uLens*r2)/(1.0 + uLens*0.22);',
    '  uv.x += sin(uv.y*88.0 + uTime*2.4)*0.0011*V*(1.0+uGlitch*3.0);',
    '  float bandPos = fract(uTime*0.10);',
    '  float band = smoothstep(0.045,0.0,abs(uv.y-bandPos))*V;',
    '  uv.x += band*(rand(vec2(uv.y,floor(uTime*30.0)))-0.5)*0.028*(0.3+uGlitch*1.4);',
    '  float row = floor(uv.y*48.0);',
    '  float blk = step(0.995-uGlitch*0.30, rand(vec2(row, floor(uTime*14.0))));',
    '  uv.x += blk*(rand(vec2(row,uTime))-0.5)*0.15*uGlitch*(0.35+V);',
    // Kopfumschaltung: die untersten Zeilen reißen seitlich weg
    '  float kopf = smoothstep(0.045, 0.0, uv.y);',
    '  uv.x += kopf*(0.010 + 0.03*rand(vec2(floor(uv.y*uRes.y*0.5), floor(uTime*30.0))))*V;',
    '  uv = clamp(uv, 0.002, 0.998);',
    '  float ca = (0.0010 + uGlitch*0.006 + band*0.002)*(0.4+V*0.6);',
    '  vec3 col;',
    '  col.r = texture2D(tDiffuse, uv + vec2(ca,0.0)).r;',
    '  col.g = texture2D(tDiffuse, uv).g;',
    '  col.b = texture2D(tDiffuse, uv - vec2(ca,0.0)).b;',
    // Die Farbe läuft der Helligkeit hinterher, wie auf jedem Heimvideo
    '  vec3 sm = texture2D(tDiffuse, uv - vec2(3.0/uRes.x, 0.0)).rgb + texture2D(tDiffuse, uv - vec2(6.0/uRes.x, 0.0)).rgb;',
    '  vec3 mitt = (col + sm)/3.0;',
    '  float y0 = dot(col, vec3(0.299,0.587,0.114)), ym = dot(mitt, vec3(0.299,0.587,0.114));',
    '  col = mix(col, mitt + (y0 - ym), 0.7*V);',
    '  col += bloom(uv) * vec3(1.0,0.95,0.80) * 1.05;',
    '  float lum = dot(col, vec3(0.299,0.587,0.114));',
    '  col = mix(col, vec3(lum), 0.10*V);',
    '  col *= mix(vec3(1.0), vec3(1.06,1.0,0.86), V);',
    // Farbgebung nach dem Vorbild der Aufnahmen: beleuchtete Flächen warm und
    // kräftig, die Tiefe dahinter schwarz, die Röhren bleiben weiß ausgebrannt.
    '  if(uYellow > 0.001){',
    '    float ly = dot(col, vec3(0.32,0.55,0.13));',
    '    col = max(col - 0.020, 0.0);',                 // Schwarzpunkt: Ecken laufen zu
    '    col = pow(col, vec3(1.16));',                  // Mitten runter, mehr Kontrast
    '    vec3 warm = vec3(ly*1.16, ly*0.88, ly*0.14);',
    '    float lit  = smoothstep(0.006, 0.12, ly);',    // alles, worauf Licht fällt
    // Gerechnet wird in 8 Bit, alles über 1 ist längst abgeschnitten. Die Röhren
    // erkennt man deshalb an ihrer Helligkeit, nicht an einem Wert über 1.
    '    float blow = smoothstep(0.72, 0.95, ly);',     // Lampen bleiben weiß
    '    col = mix(col, warm, uYellow * lit * (1.0 - blow));',
    '    col *= 1.0 + 0.15*uYellow*lit*(1.0 - blow);',
    '  }',
    // Nachtsicht: alles ins Grüne, dunkle Bereiche hochgezogen
    '  if(uNv > 0.001){',
    '    float e = 1.0 - exp(-lum*3.6);',
    '    float g = pow(e, 0.85) * 1.04 + 0.02;',
    '    g += (rand(uv*uRes*1.3 + fract(uTime)*37.1)-0.5)*0.16;',
    '    vec3 nv = vec3(g*0.20, g*1.06, g*0.34);',
    '    col = mix(col, nv, uNv);',
    '  }',
    '  col = mix(col, vec3(0.9,0.15,0.1)*lum*1.6, uRed);',
    '  col += 0.018*V;',
    '  col *= 1.0 - 0.07*V*(0.5-0.5*sin(uv.y*uRes.y*3.14159));',
    '  col *= 1.0 - 0.03*V*rand(vec2(floor(uv.y*uRes.y), floor(uTime*24.0)));',
    // Filmkorn: eine feine und eine gröbere Lage, in den Schatten kräftiger —
    // so liegt es im Bild statt nur darüber.
    '  float lf = clamp(dot(col, vec3(0.299,0.587,0.114)), 0.0, 1.0);',
    '  float g1 = rand(uv*uRes + fract(uTime)*91.7) - 0.5;',
    '  float g2 = rand(floor(uv*uRes*0.30) + fract(uTime*0.83)*57.3) - 0.5;',
    '  float korn = (g1*0.085 + g2*0.075) * (0.45 + 0.95*(1.0 - lf));',
    '  col += korn * (0.85 + 0.7*V + uGlitch*0.8);',
    // Aussetzer: kurze weiße Striche, wo das Band abgenutzt ist
    '  float zeile = floor(vUv.y*uRes.y*0.5);',
    '  float aus = step(0.9993 - uGlitch*0.004, rand(vec2(zeile, floor(uTime*24.0))))',
    '            * step(0.45, rand(vec2(floor(vUv.x*7.0 + rand(vec2(zeile, 3.0))*7.0), zeile + floor(uTime*24.0))));',
    '  col = mix(col, vec3(0.9), aus*0.65*(0.4+V));',
    '  col = mix(col, vec3(rand(uv*uRes + uTime*13.1)), kopf*0.30*V);',
    '  float vig = dot(vUv-0.5, vUv-0.5);',
    '  col *= 1.0 - vig*(1.05+0.60*V);',
    '  vec4 hud = texture2D(tHud, vUv + vec2(ca,0.0));',
    '  col = mix(col, hud.rgb*(1.0-uNv*0.35), hud.a*0.95);',
    '  col = mix(col, vec3(rand(uv*uRes*0.7+uTime*57.3)), uStatic);',
    '  gl_FragColor = vec4(col*uFade, 1.0);',
    '}'
  ].join('\n')
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2), postMat));

/* ==================== 9  Anzeige im Sucher ==================== */

const HUDS = { tapes:0, battery:100, stamina:1, signal:0, nv:false, time:0, exit:null };
function drawHud(){
  const W = HUD_W, H = HUD_H;
  hudX.clearRect(0,0,W,H);
  const F = Math.round(H*0.048), PAD = Math.round(H*0.062);
  hudX.textBaseline = 'top';
  hudX.shadowColor = 'rgba(0,0,0,0.8)'; hudX.shadowBlur = Math.max(3, F*0.28);
  hudX.font = 'bold ' + F + 'px "Courier New",monospace';

  /* --- oben links: Aufnahme --- */
  if(Math.sin(HUDS.time*3.2) > 0){
    hudX.fillStyle = 'rgba(206,52,42,0.96)';
    hudX.beginPath(); hudX.arc(PAD+F*0.42, PAD+F*0.5, F*0.30, 0, 7); hudX.fill();
    hudX.fillStyle = 'rgba(244,242,232,0.96)';
    hudX.fillText('REC', PAD+F*1.05, PAD);
  }
  hudX.fillStyle = 'rgba(238,234,214,0.86)';
  hudX.fillText(HUDS.nv ? 'NIGHTSHOT' : 'SP', PAD, PAD + F*1.3);
  // Der Camcorder merkt, wenn er nichts mehr sieht
  if(HUDS.dunkel && !HUDS.nv && Math.sin(HUDS.time*5) > -0.2){
    hudX.fillStyle = 'rgba(236,196,96,0.92)';
    hudX.fillText('LOW LIGHT', PAD, PAD + F*2.6);
  }

  /* --- oben rechts: Datum und Zeitcode (Platz für die Pausentaste) --- */
  const sec = HUDS.time + 42.7;
  const hh = String(11 + ((sec/3600)|0)).padStart(2,'0'),
        mm = String((13 + ((sec/60|0)%60))%60).padStart(2,'0'),
        ss = String(sec%60|0).padStart(2,'0'),
        ff = String(Math.floor((sec%1)*30)).padStart(2,'0');
  const rightPad = PAD + Math.round(W*0.085);
  hudX.fillStyle = 'rgba(248,246,236,0.94)';
  let d1 = '10/17/1989', d2 = hh+':'+mm+':'+ss+':'+ff;
  // In ihrer Nähe verliert der Zeitcode den Takt
  if(HUDS.stoer > 0.25){
    const wirr = t => t.replace(/[0-9]/g, z => Math.random() < HUDS.stoer*0.45 ? '-8#?'[Math.random()*4|0] : z);
    d1 = wirr(d1); d2 = wirr(d2);
  }
  hudX.fillText(d1, W-rightPad-hudX.measureText(d1).width, PAD);
  hudX.fillText(d2, W-rightPad-hudX.measureText(d2).width, PAD + F*1.3);

  /* --- unten links: Bänder, Signal, Ausdauer, Akku --- */
  const bw = Math.round(W*0.17), bh = Math.round(F*0.60);
  const bx = PAD, by = H - PAD - bh;
  hudX.strokeStyle = 'rgba(232,226,200,0.8)'; hudX.lineWidth = 2;
  hudX.strokeRect(bx, by, bw, bh);
  hudX.fillStyle = 'rgba(232,226,200,0.8)';
  hudX.fillRect(bx+bw+2, by+bh*0.28, 4, bh*0.44);
  const lvl = clamp(HUDS.battery/100, 0, 1);
  hudX.fillStyle = lvl > 0.25 ? 'rgba(230,224,196,0.9)'
                 : (Math.sin(HUDS.time*7) > 0 ? 'rgba(220,74,56,0.95)' : 'rgba(90,30,24,0.6)');
  hudX.fillRect(bx+3, by+3, Math.max(0,(bw-6)*lvl), bh-6);
  hudX.font = 'bold ' + Math.round(F*0.68) + 'px "Courier New",monospace';
  hudX.fillStyle = 'rgba(226,220,192,0.8)';
  hudX.fillText(Math.round(HUDS.battery) + '%', bx + bw + 12, by + bh*0.10);

  const sy = by - F*0.62;                        // Ausdauer
  hudX.fillStyle = 'rgba(150,142,110,0.34)'; hudX.fillRect(bx, sy, bw, 4);
  // Wer rennen will, aber nicht mehr kann, sieht den Balken blinken
  const leer = HUDS.ausgepustet && Math.sin(HUDS.time*14) > 0;
  hudX.fillStyle = leer ? 'rgba(226,90,60,0.95)'
                 : (HUDS.stamina > 0.2 ? 'rgba(206,196,156,0.75)' : 'rgba(206,120,80,0.8)');
  hudX.fillRect(bx, sy, bw*Math.max(clamp(HUDS.stamina,0,1), leer ? 0.12 : 0), 4);

  if(HUDS.signal > 0.01){                        // Bandsignal
    const gy = sy - F*0.72;
    hudX.fillStyle = 'rgba(150,142,110,0.30)'; hudX.fillRect(bx, gy, bw, 5);
    hudX.fillStyle = 'rgba(228,208,132,0.9)';   hudX.fillRect(bx, gy, bw*clamp(HUDS.signal,0,1), 5);
    hudX.fillStyle = 'rgba(228,214,164,0.7)';
    hudX.fillText('SIGNAL', bx + bw + 12, gy - F*0.22);
  }
  hudX.font = 'bold ' + F + 'px "Courier New",monospace';
  hudX.fillStyle = 'rgba(242,236,206,0.92)';
  hudX.fillText('BÄNDER ' + HUDS.tapes + '/' + CFG.tapes, bx, by - F*2.6);

  /* --- oben Mitte: Richtung zum Ausgang, sobald das Foto gefunden ist --- */
  if(HUDS.exit !== null && HUDS.exit !== undefined){
    const cx = W/2, cy = PAD + F*0.95, R = F*0.8;
    hudX.save();
    hudX.translate(cx, cy);
    hudX.rotate(HUDS.exit);
    hudX.fillStyle = 'rgba(228,208,132,0.78)';
    hudX.beginPath();
    hudX.moveTo(0,-R); hudX.lineTo(R*0.52, R*0.5); hudX.lineTo(0, R*0.18); hudX.lineTo(-R*0.52, R*0.5);
    hudX.closePath(); hudX.fill();
    hudX.restore();
    hudX.font = 'bold ' + Math.round(F*0.62) + 'px "Courier New",monospace';
    hudX.fillStyle = 'rgba(228,208,132,0.6)';
    const lab = 'AUSGANG';
    hudX.fillText(lab, cx - hudX.measureText(lab).width/2, cy + F*0.95);
  }
  hudTex.needsUpdate = true;
}

/* ========================== 10  Ton ========================== */

/* Alles, was hier zu hören ist, wird im Spiel selbst erzeugt: Oszillatoren,
   Rauschen, Filter und ein selbst gebauter Hall. Keine Aufnahmen, keine
   fremden Dateien — frei verwendbar, ohne dass jemand gefragt werden muss. */
const SND = { on:true, ctx:null };
const tonAn = () => !!(SND.ctx && SND.on);
function initAudio(){
  if(SND.ctx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) { SND.on = false; return; }
  const ac = new AC();
  SND.ctx = ac;
  const sr = ac.sampleRate;

  // Alles läuft durch einen Begrenzer, damit Schrei und Knall nicht übersteuern
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
  comp.attack.value = 0.004; comp.release.value = 0.25;
  comp.connect(ac.destination);
  SND.master = ac.createGain(); SND.master.gain.value = 1; SND.master.connect(comp);

  // Hall eines großen, feuchten Raums: frühe Echos, dann ein langer Schwanz
  const len = Math.floor(sr*2.1);
  const ir = ac.createBuffer(2, len, sr);
  for(let ch=0; ch<2; ch++){
    const d = ir.getChannelData(ch);
    for(let i=Math.floor(sr*0.006); i<len; i++){
      const t = i/sr;
      d[i] = (Math.random()*2-1) * Math.exp(-t*2.9) * (0.55 + 0.45*Math.exp(-t*9));
    }
    for(const [ms, a] of [[11,0.7],[19,0.5],[29,0.45],[43,0.35],[61,0.3],[83,0.22]]){
      const i = Math.floor(sr*(ms + ch*3)/1000);
      if(i < len) d[i] += (Math.random() < 0.5 ? -a : a);
    }
  }
  SND.hall = ac.createConvolver(); SND.hall.buffer = ir;
  const hg = ac.createGain(); hg.gain.value = 0.5;
  SND.hall.connect(hg); hg.connect(SND.master);

  // Nah am Ohr: die eigenen Schritte, mit einem Hauch Raum
  SND.nah = ac.createGain(); SND.nah.gain.value = 1; SND.nah.connect(SND.master);
  const nh = ac.createGain(); nh.gain.value = 0.14; SND.nah.connect(nh); nh.connect(SND.hall);

  // Rauschen, einmal erzeugt: weiß und braun (tief, für Grollen)
  const buf = ac.createBuffer(1, sr*2, sr), d = buf.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i] = (Math.random()*2-1)*0.5;
  SND.noiseBuf = buf;
  const bb = ac.createBuffer(1, sr*3, sr), bd = bb.getChannelData(0);
  let last = 0;
  for(let i=0;i<bd.length;i++){ last = (last + (Math.random()*2-1)*0.02)/1.02; bd[i] = last*3.2; }
  SND.braunBuf = bb;

  // Verzerrerkurve für Schrei und Knurren
  const kurve = new Float32Array(1024);
  for(let i=0;i<1024;i++){ const x = i/512 - 1; kurve[i] = Math.tanh(x*3.2); }
  SND.kurve = kurve;

  // Netzbrummen der Röhren: 50 Hz und Obertöne, dazu das Zischeln der Vorschaltgeräte
  const g = ac.createGain(); g.gain.value = 0.05; g.connect(SND.master);
  SND.humOsc = [];
  [[50,'sine',0.5],[100,'sawtooth',0.32],[150,'sawtooth',0.14],[200,'square',0.05]].forEach(([f, typ, v]) => {
    const o = ac.createOscillator(); o.type = typ; o.frequency.value = f;
    const gg = ac.createGain(); gg.gain.value = v;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    o.connect(gg); gg.connect(lp); lp.connect(g); o.start();
    SND.humOsc.push({ o, f });
  });
  {
    const s = ac.createBufferSource(); s.buffer = buf; s.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6800; bp.Q.value = 1.4;
    const sg = ac.createGain(); sg.gain.value = 0.10;
    s.connect(bp); bp.connect(sg); sg.connect(g); s.start();
  }
  SND.hum = g;

  // Bandrauschen des Camcorders
  const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
  const hsg = ac.createGain(); hsg.gain.value = 0.030;
  const hp = ac.createBiquadFilter(); hp.type='highpass'; hp.frequency.value = 2400;
  src.connect(hp); hp.connect(hsg); hsg.connect(SND.master); src.start();
  SND.hiss = hsg;

  // Raumton: kaum hörbar, aber ohne ihn klingt die Etage nach Studio
  {
    const s = ac.createBufferSource(); s.buffer = bb; s.loop = true;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const rg = ac.createGain(); rg.gain.value = 0.07;
    s.connect(lp); lp.connect(rg); rg.connect(SND.master); s.start();
    SND.raum = rg;
  }

  // Bedrohung: zwei tiefe, gegeneinander schwebende Töne
  const dg = ac.createGain(); dg.gain.value = 0;
  const lp2 = ac.createBiquadFilter(); lp2.type='lowpass'; lp2.frequency.value = 190;
  for(const f of [41, 43.3]){
    const o2 = ac.createOscillator(); o2.type='sawtooth'; o2.frequency.value = f;
    o2.connect(lp2); o2.start();
  }
  const sub = ac.createOscillator(); sub.type = 'sine'; sub.frequency.value = 29;
  const sg = ac.createGain(); sg.gain.value = 0.8; sub.connect(sg); sg.connect(dg); sub.start();
  lp2.connect(dg); dg.connect(SND.master);
  SND.drone = dg;

  verstecktonStarten();
}

/* ---------- Bausteine ---------- */
function hoererSetzen(){
  const ac = SND.ctx; if(!ac) return;
  const L = ac.listener, p = camera.position;
  const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
  if(L.positionX){
    L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
    L.forwardX.value = fx; L.forwardY.value = 0; L.forwardZ.value = fz;
    L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
  } else {
    L.setPosition(p.x, p.y, p.z);
    L.setOrientation(fx, 0, fz, 0, 1, 0);
  }
}
function setzOrt(pn, x, y, z){
  if(pn.positionX){ pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z; }
  else pn.setPosition(x, y, z);
}
/* Ein Ort, an dem ein Klang entsteht. Stehen Wände zwischen ihm und der
   Kamera, kommt er dumpf an. Zurück kommt der Eingang für den Klang. */
function ort(x, y, z, o){
  o = o || {};
  const ac = SND.ctx;
  const pn = ac.createPanner();
  pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse';
  pn.refDistance = o.ref || 1.5; pn.rolloffFactor = o.roll || 1.0; pn.maxDistance = 90;
  setzOrt(pn, x, y, z);
  const frei = losClear(camera.position.x, camera.position.z, x, z);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass';
  lp.frequency.value = frei ? 16000 : (o.dumpf || 650);
  lp.connect(pn); pn.connect(SND.master);
  const weit = Math.hypot(camera.position.x - x, camera.position.z - z);
  const hs = ac.createGain();
  hs.gain.value = (o.hall !== undefined ? o.hall : 0.35) * (frei ? 1 : 0.6) / (1 + weit*0.07);
  lp.connect(hs); hs.connect(SND.hall);
  return lp;
}
function rausch(ziel, dauer, typ, freq, q, vol, an, buf){
  const ac = SND.ctx, t0 = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = buf || SND.noiseBuf;
  const f = ac.createBiquadFilter(); f.type = typ; f.frequency.value = freq; f.Q.value = q || 0.7;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + (an || 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
  s.connect(f); f.connect(g); g.connect(ziel);
  s.start(t0, Math.random()*Math.max(0, s.buffer.duration - dauer - 0.1)); s.stop(t0 + dauer + 0.05);
  return { f, g, s, t0 };
}
function ton(ziel, typ, f0, f1, dauer, vol, an, wann){
  const ac = SND.ctx, t0 = wann || ac.currentTime;
  const o = ac.createOscillator(); o.type = typ; o.frequency.setValueAtTime(f0, t0);
  if(f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dauer);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + (an || 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dauer);
  o.connect(g); g.connect(ziel); o.start(t0); o.stop(t0 + dauer + 0.05);
  return { o, g };
}
function verzerrer(){
  const w = SND.ctx.createWaveShaper(); w.curve = SND.kurve; w.oversample = '2x'; return w;
}

function burst(dur, cut, vol, type){
  const ac = SND.ctx;
  if(!ac || !SND.on) return;
  const n = Math.floor(ac.sampleRate*dur);
  const b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
  for(let i=0;i<n;i++) d[i] = (Math.random()*2-1)*Math.pow(1-i/n, 3);
  const s = ac.createBufferSource(); s.buffer = b;
  const f = ac.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = cut;
  const g = ac.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(SND.master); s.start();
}
function beep(freq, dur, vol, type){
  const ac = SND.ctx;
  if(!ac || !SND.on) return;
  const o = ac.createOscillator(); o.type = type || 'square'; o.frequency.value = freq;
  const g = ac.createGain(); g.gain.value = 0;
  g.gain.setTargetAtTime(vol, ac.currentTime, 0.005);
  g.gain.setTargetAtTime(0, ac.currentTime + dur*0.5, dur*0.25);
  o.connect(g); g.connect(SND.master); o.start(); o.stop(ac.currentTime + dur + 0.3);
}

/* ---------- Die Geräusche ---------- */
const KLANG = {
  // Teppich, feucht: dumpfer Auftritt, Fasern, auf nassen Stellen ein Schmatzen
  schritt(laut, nass, ziel){
    if(!tonAn()) return;
    const ac = SND.ctx, z = ziel || SND.nah;
    ton(z, 'sine', 90 + Math.random()*25, 45, 0.10, 0.30*laut);
    rausch(z, 0.09 + Math.random()*0.05, 'bandpass', 650 + Math.random()*550, 0.9, 0.26*laut, 0.006);
    rausch(z, 0.05, 'highpass', 3500 + Math.random()*1500, 0.7, 0.03*laut, 0.003);
    if(nass > 0.18){
      const r = rausch(z, 0.2, 'bandpass', 2100 + Math.random()*900, 3.0, 0.16*nass*laut, 0.012);
      r.f.frequency.exponentialRampToValueAtTime(650, r.t0 + 0.18);
    }
  },
  // Schritte, die nicht deine sind
  fremdSchritt(x, z, laut){
    if(!tonAn()) return;
    const e = ort(x, 0.1, z, { ref:1.4, hall:0.3 });
    KLANG.schritt(laut * 2.6, nassBei(x, z), e);
  },
  gestaltSchritt(x, z, jagd){
    if(!tonAn()) return;
    const e = ort(x, 0.2, z, { ref:2.4, roll:0.9, hall:0.5, dumpf:420 });
    ton(e, 'sine', 64 + Math.random()*10, 34, 0.26, jagd ? 1.5 : 1.1);
    rausch(e, 0.2, 'lowpass', 340, 0.7, jagd ? 0.9 : 0.6, 0.003);
    if(Math.random() < 0.35){
      const r = rausch(e, 0.45, 'bandpass', 480 + Math.random()*320, 7, 0.12, 0.06);
      r.f.frequency.linearRampToValueAtTime(r.f.frequency.value*1.4, r.t0 + 0.4);
    }
    if(!jagd && Math.random() < 0.25) rausch(e, 0.6, 'bandpass', 1100, 1.2, 0.05, 0.25);   // etwas schleift
  },
  // Atmen: ein Rauschen durch zwei Engstellen, rau gemacht durch schnelles Zittern
  atem(x, z, ein, laut){
    if(!tonAn()) return;
    const ac = SND.ctx, t0 = ac.currentTime, e = ort(x, 2.2, z, { ref:1.8, roll:1.15, hall:0.35, dumpf:500 });
    const dauer = ein ? 0.95 : 1.5;
    const s = ac.createBufferSource(); s.buffer = SND.noiseBuf;
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = ein ? 1250 : 560; f1.Q.value = 1.6;
    const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = ein ? 2600 : 1200; f2.Q.value = 2.2;
    const rau = ac.createGain(); rau.gain.value = 0.55;
    const lfo = ac.createOscillator(); lfo.frequency.value = 26 + Math.random()*14;
    const lg = ac.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(rau.gain);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(0.5*laut, t0 + dauer*0.45);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dauer);
    s.connect(f1); s.connect(f2); f1.connect(rau); f2.connect(rau); rau.connect(g); g.connect(e);
    s.start(t0, Math.random()); s.stop(t0 + dauer + 0.05); lfo.start(t0); lfo.stop(t0 + dauer + 0.05);
  },
  knurren(x, z){
    if(!tonAn()) return;
    const ac = SND.ctx, t0 = ac.currentTime, e = ort(x, 2.0, z, { ref:2.5, roll:0.8, hall:0.6 });
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(58 + Math.random()*12, t0);
    o.frequency.linearRampToValueAtTime(44, t0 + 0.9);
    const w = verzerrer();
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const am = ac.createGain(); am.gain.value = 0.6;
    const lfo = ac.createOscillator(); lfo.frequency.value = 11 + Math.random()*5;
    const lg = ac.createGain(); lg.gain.value = 0.4; lfo.connect(lg); lg.connect(am.gain);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.35, t0 + 0.15);
    g.gain.linearRampToValueAtTime(0.0001, t0 + 1.0);
    o.connect(w); w.connect(lp); lp.connect(am); am.connect(g); g.connect(e);
    o.start(t0); o.stop(t0 + 1.05); lfo.start(t0); lfo.stop(t0 + 1.05);
    rausch(e, 0.9, 'bandpass', 700, 1.1, 0.14, 0.1);
  },
  // Der Schrei, wenn sie dich sieht: zwei verstimmte Stimmen, verzerrt, im Hall
  schrei(x, z){
    if(!tonAn()) return;
    const ac = SND.ctx, t0 = ac.currentTime, e = ort(x, 2.2, z, { ref:5, roll:0.5, hall:0.9, dumpf:1200 });
    const w = verzerrer();
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 1.3;
    const bp2 = ac.createBiquadFilter(); bp2.type = 'bandpass'; bp2.frequency.value = 2700; bp2.Q.value = 2;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
    g.gain.setTargetAtTime(0.0001, t0 + 0.55, 0.22);
    for(const [f, d] of [[560, 0], [573, 0.004], [281, 0.01]]){
      const o = ac.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t0 + d);
      o.frequency.exponentialRampToValueAtTime(f*1.25, t0 + 0.12);
      o.frequency.exponentialRampToValueAtTime(f*0.34, t0 + 1.2);
      o.connect(w); o.start(t0 + d); o.stop(t0 + 1.6);
    }
    w.connect(bp); w.connect(bp2); bp.connect(g); bp2.connect(g); g.connect(e);
    rausch(e, 0.9, 'bandpass', 2400, 1.0, 0.25, 0.01);
  },
  // Drei Schläge gegen eine Wand, irgendwo
  klopfen(x, z, n){
    if(!tonAn()) return;
    for(let i=0;i<n;i++) setTimeout(() => {
      if(!tonAn()) return;
      const e = ort(x, 1.2, z, { ref:1.8, hall:0.8, dumpf:480 });
      ton(e, 'sine', 150, 78, 0.14, 1.6, 0.002);
      rausch(e, 0.06, 'bandpass', 1500, 1.3, 1.0, 0.001);
    }, i*(300 + Math.random()*90));
  },
  // Flüstern: Rauschen durch zwei Formanten, die von Silbe zu Silbe springen
  fluestern(seite, dauer, laut){
    if(!tonAn()) return;
    const ac = SND.ctx, t0 = ac.currentTime + 0.02;
    let ziel;
    if(ac.createStereoPanner){
      const sp = ac.createStereoPanner(); sp.pan.value = seite; sp.connect(SND.master);
      const hs = ac.createGain(); hs.gain.value = 0.3; sp.connect(hs); hs.connect(SND.hall);
      ziel = sp;
    } else ziel = SND.master;
    const s = ac.createBufferSource(); s.buffer = SND.noiseBuf; s.loop = true;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
    const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 5;
    const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 7;
    const vg = ac.createGain(); vg.gain.value = 0.0001;
    const zisch = ac.createBiquadFilter(); zisch.type = 'highpass'; zisch.frequency.value = 4800;
    const zg = ac.createGain(); zg.gain.value = 0.0001;
    const aus = ac.createGain(); aus.gain.value = 1.3*laut;
    s.connect(hp); hp.connect(f1); hp.connect(f2); f1.connect(vg); f2.connect(vg);
    s.connect(zisch); zisch.connect(zg);
    vg.connect(aus); zg.connect(aus); aus.connect(ziel);
    const VOK = [[800,1250],[450,2000],[300,2300],[480,850],[330,800],[650,1750]];
    let t = t0;
    while(t < t0 + dauer){
      const syl = 0.08 + Math.random()*0.15;
      const [a, b] = VOK[(Math.random()*VOK.length)|0];
      f1.frequency.setValueAtTime(a, t); f2.frequency.setValueAtTime(b, t);
      f1.frequency.linearRampToValueAtTime(a*(0.85 + Math.random()*0.3), t + syl);
      vg.gain.setValueAtTime(0.0001, t);
      vg.gain.linearRampToValueAtTime(0.5 + Math.random()*0.5, t + syl*0.35);
      vg.gain.linearRampToValueAtTime(0.0001, t + syl);
      if(Math.random() < 0.4){
        const zs = t + syl*(Math.random() < 0.5 ? 0 : 0.7);
        zg.gain.setValueAtTime(0.0001, zs);
        zg.gain.linearRampToValueAtTime(0.25, zs + 0.03);
        zg.gain.linearRampToValueAtTime(0.0001, zs + 0.09 + Math.random()*0.08);
      }
      t += syl + (Math.random() < 0.18 ? 0.15 + Math.random()*0.2 : 0.015);
    }
    s.start(t0); s.stop(t + 0.1);
  },
  // Metall schlägt irgendwo auf: Knall und nachschwingende Teiltöne
  knall(x, z){
    if(!tonAn()) return;
    const e = ort(x, 1.5, z, { ref:3, hall:1.0, dumpf:380 });
    rausch(e, 0.5, 'lowpass', 700, 0.7, 1.1, 0.002);
    for(const f of [187, 431, 779, 1123]) ton(e, 'sine', f, f*0.985, 1.4 + Math.random(), 0.15, 0.002);
  },
  tropfen(x, z){
    if(!tonAn()) return;
    const e = ort(x, 0.05, z, { ref:0.8, roll:1.5, hall:0.7 });
    ton(e, 'sine', 1300 + Math.random()*900, 420, 0.08, 1.2, 0.001);
  },
  // Das Vorschaltgerät zündet: ein hohes Ticken
  tink(x, z){
    if(!tonAn()) return;
    const e = ort(x, WH - 0.1, z, { ref:1.5, hall:0.4 });
    ton(e, 'square', 3000 + Math.random()*900, 2600, 0.035, 0.18, 0.001);
    rausch(e, 0.03, 'highpass', 5200, 0.7, 0.4, 0.001);
  },
  knistern(x, z, st){
    if(!tonAn()) return;
    const e = ort(x, WH - 0.2, z, { ref:1.2, hall:0.2 });
    rausch(e, 0.03 + Math.random()*0.07, 'bandpass', 2300 + Math.random()*2800, 1.6, 1.1*st, 0.001);
    ton(e, 'sawtooth', 100, 100, 0.07, 0.22*st, 0.002);
  },
  // Die Tapetentür: ein Knarzen aus lauter kleinen Rucken, dann Staub
  knarren(x, z){
    if(!tonAn()) return;
    const ac = SND.ctx, t0 = ac.currentTime, e = ort(x, 1.2, z, { ref:1.6, hall:0.5 });
    const o = ac.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(34, t0);
    o.frequency.linearRampToValueAtTime(68, t0 + 0.35);
    o.frequency.linearRampToValueAtTime(41, t0 + 0.8);
    o.frequency.linearRampToValueAtTime(88, t0 + 1.15);
    const b1 = ac.createBiquadFilter(); b1.type = 'bandpass'; b1.frequency.value = 720; b1.Q.value = 9;
    const b2 = ac.createBiquadFilter(); b2.type = 'bandpass'; b2.frequency.value = 1460; b2.Q.value = 7;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.9, t0 + 0.06);
    g.gain.setValueAtTime(0.9, t0 + 1.0); g.gain.linearRampToValueAtTime(0.0001, t0 + 1.3);
    o.connect(b1); o.connect(b2); b1.connect(g); b2.connect(g); g.connect(e);
    o.start(t0); o.stop(t0 + 1.35);
    rausch(e, 1.1, 'lowpass', 900, 0.7, 0.10, 0.25);
  },
  // Kratzen an der Wand — sie wartet draußen
  kratzen(x, z){
    if(!tonAn()) return;
    const e = ort(x, 1.3, z, { ref:1.6, hall:0.4, dumpf:900 });
    for(let i=0;i<5;i++) setTimeout(() => {
      if(!tonAn()) return;
      const r = rausch(e, 0.16 + Math.random()*0.1, 'bandpass', 2600 + Math.random()*1400, 3, 2.6, 0.02);
      r.f.frequency.linearRampToValueAtTime(1500, r.t0 + 0.18);
    }, i*(170 + Math.random()*120));
  },
  // Das Gebäude arbeitet: tiefes Grollen von weit weg
  grollen(x, z){
    if(!tonAn()) return;
    const e = ort(x, 1.5, z, { ref:6, roll:0.5, hall:0.9, dumpf:200 });
    rausch(e, 3.2, 'lowpass', 90, 0.8, 0.9, 1.2, SND.braunBuf);
  },
  herz(st){
    if(!tonAn()) return;
    ton(SND.master, 'sine', 64, 40, 0.15, 0.40*st, 0.006);
    setTimeout(() => { if(tonAn()) ton(SND.master, 'sine', 56, 36, 0.13, 0.28*st, 0.006); }, 165);
  },
  pfeifen(){
    if(!tonAn()) return;
    ton(SND.master, 'sine', 6300, 6150, 3.4, 0.025, 0.15);
  },
  // Kassette rastet ein
  kassette(){
    if(!tonAn()) return;
    rausch(SND.master, 0.025, 'bandpass', 3200, 2, 0.3, 0.001);
    setTimeout(() => { if(tonAn()) rausch(SND.master, 0.03, 'bandpass', 2400, 2, 0.35, 0.001); }, 70);
  },
  // Relais klackt, das Licht geht
  relais(){
    if(!tonAn()) return;
    rausch(SND.master, 0.05, 'bandpass', 1100, 2.2, 0.35, 0.001);
    ton(SND.master, 'sine', 90, 50, 0.12, 0.25, 0.002);
  },
  // Das Netzbrummen fährt herunter oder wieder hoch
  brummen(an, zeit){
    if(!SND.ctx) return;
    const ac = SND.ctx, t0 = ac.currentTime;
    for(const h of SND.humOsc){
      h.o.frequency.cancelScheduledValues(t0);
      h.o.frequency.setValueAtTime(h.o.frequency.value, t0);
      h.o.frequency.linearRampToValueAtTime(an ? h.f : h.f*0.5, t0 + zeit);
    }
    SND.humAus = !an;
  },
  // Zu viel auf einmal: der Ton klingelt nach
  zischen(st){
    if(!tonAn()) return;
    rausch(SND.master, 0.4, 'highpass', 3000, 0.7, 0.3*st, 0.004);
  }
};

const sndStep    = () => KLANG.schritt(0.8, nassBei(S.pos.x, S.pos.z));
const sndRunStep = () => KLANG.schritt(1.25, nassBei(S.pos.x, S.pos.z));
const sndClunk   = () => {
  if(!tonAn()) return;
  // irgendwo in den Wänden arbeitet etwas
  const a = Math.random()*6.283, d = 9 + Math.random()*12;
  const x = clamp(S.pos.x + Math.cos(a)*d, 1, SPAN-1), z = clamp(S.pos.z + Math.sin(a)*d, 1, SPAN-1);
  const e = ort(x, WH - 0.3, z, { ref:2, hall:0.8, dumpf:300 });
  rausch(e, 0.5, 'lowpass', 190, 0.7, 1.6, 0.003);
  ton(e, 'sine', 120, 60, 0.3, 0.9, 0.003);
};
const sndPickup  = () => { KLANG.kassette(); beep(880, 0.06, 0.07); setTimeout(()=>beep(1320,0.09,0.06), 90); };
const sndDenied  = () => beep(180, 0.16, 0.09, 'sawtooth');
const sndTick    = () => beep(2100, 0.02, 0.035, 'square');
const sndDoor    = () => { burst(0.7, 260, 0.30); setTimeout(()=>burst(0.35,150,0.22), 320); };
function sndScream(){ KLANG.schrei(MON.pos.x, MON.pos.z); }

/* ---------- Was hinter den Tapetentüren zu hören ist ----------
   Jedes Versteck hat seinen Klang: ein Radio, das nur noch rauscht, ein
   Fernseher, eine Spieluhr. Durch die Wand kommt er dumpf an — so findet
   man die Türen, wenn man hinhört. */
const VTON = [];
const SPIELUHR = [[659,1],[784,1],[988,1],[880,2],[784,1],[740,1],[659,2],[587,1],[659,1],[740,1],[784,2],
                  [740,1],[659,1],[587,1],[494,3],[0,2]];
function verstecktonStarten(){
  const ac = SND.ctx;
  for(const V of VERSTECKE){
    if(!V.tuer || !V.klangPos) continue;
    const p = V.klangPos;
    const pn = ac.createPanner();
    pn.panningModel = 'equalpower'; pn.distanceModel = 'inverse';
    pn.refDistance = 1.2; pn.rolloffFactor = 1.35; pn.maxDistance = 60;
    setzOrt(pn, p.x, p.y, p.z);
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const g = ac.createGain(); g.gain.value = 0;
    g.connect(lp); lp.connect(pn); pn.connect(SND.master);
    const hs = ac.createGain(); hs.gain.value = 0.25; lp.connect(hs); hs.connect(SND.hall);
    const Q = { V, pn, lp, g, art:V.art, naechste:ac.currentTime + 1, schlag:0, tempo:0.30, stoer:0 };
    if(V.art === 'lager' || V.art === 'schrein'){
      // Grundrauschen: beim Radio schmal und knisternd, beim Fernseher hell
      const s = ac.createBufferSource(); s.buffer = SND.noiseBuf; s.loop = true;
      const f = ac.createBiquadFilter();
      if(V.art === 'lager'){ f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 0.7; }
      else { f.type = 'highpass'; f.frequency.value = 2200; }
      const sg = ac.createGain(); sg.gain.value = V.art === 'lager' ? 0.35 : 0.45;
      s.connect(f); f.connect(sg); sg.connect(g); s.start();
      Q.rausch = sg;
      if(V.art === 'schrein'){
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 60;
        const ol = ac.createBiquadFilter(); ol.type = 'lowpass'; ol.frequency.value = 180;
        const og = ac.createGain(); og.gain.value = 0.12;
        o.connect(ol); ol.connect(og); og.connect(g); o.start();
      }
    }
    VTON.push(Q);
  }
}
function spieluhrNote(Q, f, wann, dauer){
  const ac = SND.ctx;
  for(const [m, v] of [[1, 0.22], [3.01, 0.05], [5.4, 0.02]]){
    const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = f*m*Q.verstimmt;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, wann);
    g.gain.exponentialRampToValueAtTime(v, wann + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, wann + Math.min(1.6, dauer*2.2)/m);
    o.connect(g); g.connect(Q.g); o.start(wann); o.stop(wann + 1.7);
  }
}
function verstecktonTick(dt){
  if(!SND.ctx) return;
  const ac = SND.ctx, jetzt = ac.currentTime;
  for(const Q of VTON){
    const V = Q.V, p = V.klangPos;
    const d = Math.hypot(S.pos.x - p.x, S.pos.z - p.z);
    const aus = V.art === 'schrein' && TV.zustand === 'aus';
    const ziel = (!SND.on || d > 26 || aus || S.phase !== 'play') ? 0 : 1;
    Q.g.gain.setTargetAtTime(ziel, jetzt, 0.3);
    // durch die geschlossene Tür dumpf, offen und in Sicht klar
    const drin = versteckVon(S.pos.x, S.pos.z) === VERSTECKE.indexOf(V);
    const klar = drin || (V.offen && losClear(S.pos.x, S.pos.z, p.x, p.z));
    Q.lp.frequency.setTargetAtTime(klar ? 9000 : (V.offen ? 900 : 380), jetzt, 0.15);
    if(ziel === 0) continue;
    if(V.art === 'zimmer'){
      // Die Spieluhr läuft langsam ab — und fängt von vorn an
      if(!Q.verstimmt) Q.verstimmt = 1;
      while(Q.naechste < jetzt + 0.25){
        const [f, len] = SPIELUHR[Q.schlag % SPIELUHR.length];
        if(f) spieluhrNote(Q, f, Math.max(Q.naechste, jetzt), Q.tempo*len);
        Q.naechste = Math.max(Q.naechste, jetzt) + Q.tempo*len;
        Q.schlag++;
        if(Q.schlag % SPIELUHR.length === 0){
          Q.tempo = Q.tempo < 0.55 ? Q.tempo * 1.08 : 0.30;
          Q.verstimmt = Q.tempo < 0.55 ? Q.verstimmt * 0.994 : 1;
          Q.naechste += Q.tempo * 3;
        }
      }
    } else if(V.art === 'lager'){
      // Knistern und ab und zu Stimmen aus dem Radio
      if(Math.random() < dt*6) Q.rausch.gain.setValueAtTime(0.1 + Math.random()*0.6, jetzt);
      Q.stoer -= dt;
      if(Q.stoer <= 0){
        Q.stoer = 5 + Math.random()*8;
        if(d < 16) radioStimme(Q, 1.2 + Math.random()*1.6);
      }
    } else if(V.art === 'schrein'){
      Q.rausch.gain.setTargetAtTime(TV.zustand === 'bild' || TV.zustand === 'geist' ? 0.12 : 0.45, jetzt, 0.1);
    }
  }
}
function radioStimme(Q, dauer){
  // wie das Flüstern, nur durch einen engen Telefonfilter und zerhackt
  const ac = SND.ctx, t0 = ac.currentTime;
  const s = ac.createBufferSource(); s.buffer = SND.noiseBuf; s.loop = true;
  const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 6;
  const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 8;
  const tel = ac.createBiquadFilter(); tel.type = 'bandpass'; tel.frequency.value = 1300; tel.Q.value = 0.9;
  const vg = ac.createGain(); vg.gain.value = 0.0001;
  const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 110 + Math.random()*40;
  const og = ac.createGain(); og.gain.value = 0.25;
  s.connect(f1); s.connect(f2); o.connect(og); og.connect(f1); og.connect(f2);
  f1.connect(vg); f2.connect(vg); vg.connect(tel);
  const aus = ac.createGain(); aus.gain.value = 2.2; tel.connect(aus); aus.connect(Q.g);
  const VOK = [[700,1200],[400,2100],[300,2400],[500,900],[350,800]];
  let t = t0;
  while(t < t0 + dauer){
    const syl = 0.07 + Math.random()*0.12;
    const [a, b] = VOK[(Math.random()*VOK.length)|0];
    f1.frequency.setValueAtTime(a, t); f2.frequency.setValueAtTime(b, t);
    vg.gain.setValueAtTime(0.0001, t);
    vg.gain.linearRampToValueAtTime(Math.random() < 0.15 ? 0.0001 : 0.6, t + syl*0.3);
    vg.gain.linearRampToValueAtTime(0.0001, t + syl);
    t += syl + 0.01;
  }
  s.start(t0); s.stop(t + 0.1); o.start(t0); o.stop(t + 0.1);
}

/* ---------- Hintergrundmusik ---------- */
const MUSIC = {
  list: [], idx: 0, el: null, vol: 0, gap: 0, base: 0.40,
  gain: null, quelle: null, alle: [],
  on: localStorage.getItem('ft_music') !== '0'
};
fetch(A('assets/music/tracks.json'))
  .then(r => r.json())
  .then(j => {
    MUSIC.list = (j.tracks || []).filter(t => t && t.file);
    for(let i=MUSIC.list.length-1; i>0; i--){            // mischen
      const k = Math.random()*(i+1)|0;
      const tmp = MUSIC.list[i]; MUSIC.list[i] = MUSIC.list[k]; MUSIC.list[k] = tmp;
    }
  })
  .catch(() => {});

function musikAn(){
  if(MUSIC.el) return;             // läuft schon, kein zweites Stück obendrauf
  MUSIC.gap = 0;
  musicNext();
}

function musicNext(){
  if(!MUSIC.list.length || !MUSIC.on) return;
  // Erst aufräumen: sonst läuft ein vergessenes Stück unhörbar weiter mit
  if(MUSIC.el){ try { MUSIC.el.pause(); } catch(e){} }
  const t = MUSIC.list[MUSIC.idx % MUSIC.list.length];
  MUSIC.idx++;
  const a = new Audio(A('assets/music/' + t.file));
  a.preload = 'auto';
  const done = wartezeit => {
    if(MUSIC.el === a){ MUSIC.el = null; MUSIC.quelle = null; }
    MUSIC.gap = wartezeit;
  };
  a.addEventListener('ended', () => done(14 + Math.random()*22));   // Stille zwischen den Stücken
  a.addEventListener('error', () => done(20));

  /* Android regelt die Lautstärke am Gerät, nicht am Element: audio.volume
     bleibt dort wirkungslos. Der Ton läuft deshalb über die Tonleitung, dort
     lässt er sich zuverlässig ein- und ausblenden. */
  if(SND.ctx){
    if(!MUSIC.gain){
      MUSIC.gain = SND.ctx.createGain();
      MUSIC.gain.gain.value = 0;
      MUSIC.gain.connect(SND.master);
    }
    try {
      MUSIC.quelle = SND.ctx.createMediaElementSource(a);
      MUSIC.quelle.connect(MUSIC.gain);
    } catch(e){ MUSIC.quelle = null; }
  }

  const pr = a.play();
  if(pr && pr.catch) pr.catch(() => done(20));
  MUSIC.el = a;
  MUSIC.alle.push(a);
  if(MUSIC.alle.length > 8) MUSIC.alle.splice(0, MUSIC.alle.length - 8);
  MUSIC.vol = 0;
  setzeLautstaerke(0);
}

/* Lautstärke setzen — über die Tonleitung, wo vorhanden, sonst am Element. */
function setzeLautstaerke(v){
  if(MUSIC.gain && SND.ctx){
    MUSIC.gain.gain.setTargetAtTime(v, SND.ctx.currentTime, 0.05);
  }
  if(MUSIC.el){
    try { MUSIC.el.volume = clamp(v / Math.max(MUSIC.base, 0.001), 0, 1); } catch(e){}
  }
}

function musicUpdate(dt, danger, ausblenden){
  const aus = (!MUSIC.on || ausblenden || !SND.on);
  if(!MUSIC.el){
    if(aus || !MUSIC.list.length) return;
    MUSIC.gap -= dt;
    if(MUSIC.gap <= 0) musicNext();
    return;
  }
  const ziel = aus ? 0 : MUSIC.base * (1 + danger*0.30);
  MUSIC.vol += (ziel - MUSIC.vol) * Math.min(dt * (aus ? 3.2 : 0.55), 1);
  if(aus && MUSIC.vol < 0.02) MUSIC.vol = 0;
  setzeLautstaerke(MUSIC.vol);
  if(aus && MUSIC.vol <= 0){
    // Nicht nur leise drehen: im Spiel soll das Stück wirklich stehen.
    try { MUSIC.el.pause(); } catch(e){}
    MUSIC.el = null; MUSIC.quelle = null;
    MUSIC.gap = 1.2;
  }
}

/* Hart anhalten: kein Ausblenden abwarten, das Stück steht sofort. */
function musikStopp(){
  // Alles anhalten, was je gestartet wurde - nicht nur das zuletzt gestartete
  for(const a of MUSIC.alle){
    try { a.pause(); a.currentTime = 0; } catch(e){}
  }
  MUSIC.alle.length = 0;
  MUSIC.el = null;
  MUSIC.quelle = null;
  MUSIC.vol = 0;
  setzeLautstaerke(0);
  MUSIC.gap = 1.2;
}

function setMusic(on){
  MUSIC.on = on;
  localStorage.setItem('ft_music', on ? '1' : '0');
  if(on){
    if(!MUSIC.el) MUSIC.gap = 0.4;
  } else {
    musicUpdate(1.0, 0, true);      // sofort ausblenden und anhalten
  }
}

function setSound(on){
  SND.on = on;
  if(!SND.ctx) return;
  SND.master.gain.setTargetAtTime(on?1:0, SND.ctx.currentTime, 0.05);
}

/* ======================= 11  Steuerung ======================= */

const IN = { mx:0, mz:0, dyaw:0, dpitch:0, run:false, nv:false, use:false };
/* Empfindlichkeit des Umsehens. Wird über alle Bänder hinweg gemerkt und
   im Pausenbild eingestellt. */
let EMPF = clamp(parseFloat(localStorage.getItem('ft_empf')) || 1, 0.3, 2.5);
const KEY = {};

const elHud   = $('hud');
const elStick = $('stick'), elKnob = $('knob');
const zMove = $('zoneMove'), zLook = $('zoneLook');
const bRun = $('bRun'), bNv = $('bNv'), bUse = $('bUse'), bMenu = $('bMenu');

let moveId = null, moveOx = 0, moveOy = 0;
let lookId = null, lookLx = 0, lookLy = 0;
const STICK_R = 52;

zMove.addEventListener('pointerdown', e => {
  if(moveId !== null) return;
  moveId = e.pointerId; moveOx = e.clientX; moveOy = e.clientY;
  elStick.style.left = e.clientX + 'px';
  elStick.style.top  = e.clientY + 'px';
  elStick.classList.add('on');
  zMove.setPointerCapture(e.pointerId);
  e.preventDefault();
});
zMove.addEventListener('pointermove', e => {
  if(e.pointerId !== moveId) return;
  let dx = e.clientX - moveOx, dy = e.clientY - moveOy;
  const l = Math.hypot(dx,dy);
  if(l > STICK_R){ dx = dx/l*STICK_R; dy = dy/l*STICK_R; }
  elKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  IN.mx = dx/STICK_R;
  IN.mz = dy/STICK_R;
  /* Rennen hängt allein am Knopf. Vorher löste auch ein weit
     durchgedrückter Knüppel aus — beim Ausweichen in eine Ecke rannte man
     dann ungewollt los, und das kostet in diesem Spiel Puste, macht Lärm
     und zieht die Gestalt an. Wer rennen will, sagt es ausdrücklich. */
  IN.run = bRun.classList.contains('held');
  e.preventDefault();
});
function endMove(e){
  if(e.pointerId !== moveId) return;
  moveId = null; IN.mx = IN.mz = 0; IN.run = bRun.classList.contains('held');
  elKnob.style.transform = 'translate(0,0)';
  elStick.classList.remove('on');
}
zMove.addEventListener('pointerup', endMove);
zMove.addEventListener('pointercancel', endMove);

zLook.addEventListener('pointerdown', e => {
  if(lookId !== null) return;
  lookId = e.pointerId; lookLx = e.clientX; lookLy = e.clientY;
  zLook.setPointerCapture(e.pointerId);
  e.preventDefault();
});
zLook.addEventListener('pointermove', e => {
  if(e.pointerId !== lookId) return;
  IN.dyaw   -= (e.clientX - lookLx) * 0.0042 * EMPF;
  IN.dpitch -= (e.clientY - lookLy) * 0.0034 * EMPF;
  lookLx = e.clientX; lookLy = e.clientY;
  e.preventDefault();
});
function endLook(e){ if(e.pointerId === lookId) lookId = null; }
zLook.addEventListener('pointerup', endLook);
zLook.addEventListener('pointercancel', endLook);

function holdBtn(el, on, off){
  el.addEventListener('pointerdown', e => { el.classList.add('held'); on(); e.preventDefault(); });
  ['pointerup','pointercancel','pointerleave'].forEach(t =>
    el.addEventListener(t, () => { if(el.classList.contains('held')){ el.classList.remove('held'); off(); } }));
}
holdBtn(bRun, ()=>IN.run=true, ()=>IN.run=false);

/* Wer mit gehaltener Umschalttaste das Fenster wechselt, bekam sie nie wieder
   los: keyup geht an das andere Fenster, KEY.ShiftLeft blieb wahr, und nach
   der Rückkehr rannte die Figur von allein, bis die Luft weg war. Beim
   Fokusverlust und in der Pause geht deshalb alles auf null. */
function steuerungLoslassen(){
  for(const k in KEY) KEY[k] = false;
  IN.run = false; IN.use = false;
  IN.mx = IN.mz = 0; IN.dyaw = IN.dpitch = 0;
  bRun.classList.remove('held');
  moveId = null; lookId = null;
  elKnob.style.transform = 'translate(0,0)';
  elStick.classList.remove('on');
}
addEventListener('blur', steuerungLoslassen);

/* Ein Knopf muss auch dann gehen, wenn schon ein Finger auf dem Stick liegt.
   Android schickt bei einer zweiten Berührung kein click mehr - deshalb hängt
   die Auslösung an pointerdown; click bleibt für Maus und Tastatur daneben. */
function tapBtn(el, fn){
  let zuletzt = 0;
  const ausloesen = e => {
    const jetzt = performance.now();
    if(jetzt - zuletzt < 350) return;      // nicht doppelt zählen
    zuletzt = jetzt;
    if(e.cancelable) e.preventDefault();
    e.stopPropagation();
    fn();
  };
  el.addEventListener('pointerdown', ausloesen);
  el.addEventListener('click', ausloesen);
}
tapBtn(bNv,   () => toggleNv());
tapBtn(bUse,  () => { IN.use = true; });
tapBtn(bMenu, () => pauseGame());

addEventListener('keydown', e => {
  KEY[e.code] = true;
  const k = e.key.toLowerCase();
  if(k === 'f') toggleNv();
  if(k === 'e') IN.use = true;
  if(k === 'm') setSound(!SND.on);
  if(e.code === 'Escape') { if(S.phase==='play') pauseGame(); }
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(e.code) >= 0) e.preventDefault();
});
addEventListener('keyup', e => { KEY[e.code] = false; });

// Maussteuerung am Rechner
canvas.addEventListener('click', () => {
  if(S.phase === 'play' && !IS_TOUCH && document.pointerLockElement !== canvas)
    canvas.requestPointerLock && canvas.requestPointerLock();
});
addEventListener('mousemove', e => {
  if(document.pointerLockElement !== canvas) return;
  IN.dyaw   -= e.movementX * 0.0022 * EMPF;
  IN.dpitch -= e.movementY * 0.0020 * EMPF;
});

function toggleNv(){
  IN.nv = !IN.nv;
  bNv.classList.toggle('act', IN.nv);
  beep(IN.nv ? 1400 : 700, 0.05, 0.05);
}

/* ======================= 12  Spielablauf ======================= */

const S = {
  phase: 'menu',
  t: 0, endT: 0,
  yaw: 0, pitch: 0, yawT: 0, pitchT: 0, swing: 0, tilt: 0,
  pos: new THREE.Vector3(),
  bob: 0, lastStep: 0, speed: 0, gait: 0, eyeY: CFG.eye, pusteLos: false,
  stamina: CFG.staminaMax, erschoepft: false,
  battery: 100,
  tapes: 0,
  hasPhoto: false,
  exitOpen: false,
  danger: 0,
  glitch: 0.06,
  heart: 0,
  tick: 0,
  clunk: 6,
  nearDoor: false,
  verstecke: 0, notizen: 0, geheimband: false,
  deathDir: new THREE.Vector3()
};
S.pos.copy(cellCenter(startCell, CFG.eye));
if(!freeP(S.pos.x, S.pos.z)){
  outer:
  for(let r=1;r<6;r++) for(let a=0;a<12;a++){
    const x = S.pos.x + Math.cos(a/12*6.283)*r*0.5, z = S.pos.z + Math.sin(a/12*6.283)*r*0.5;
    if(freeP(x,z)){ S.pos.x=x; S.pos.z=z; break outer; }
  }
}
S.yaw = S.yawT = rnd()*6.28;
if(START_BLICK !== null) S.yaw = S.yawT = START_BLICK;     // man wacht vor dem ersten Hinweis auf

/* Setzt einen Schwierigkeitsgrad. Überzählige Fundstücke verschwinden,
   die Werte der Gestalt und des Camcorders wandern in CFG. */
function applyDifficulty(key){
  if(!DIFFS[key]) key = 'normal';
  diffKey = key;
  localStorage.setItem('ft_diff', key);
  const d = DIFFS[key];

  CFG.tapes = d.tapes;       CFG.batteries = d.batts;
  CFG.monHunt = d.hunt;      CFG.monSight = d.sight;
  CFG.monCone = d.cone;      CFG.monCatch = d.fang;
  CFG.staminaMax = d.stamina;CFG.staminaRegen = d.regen;
  CFG.drainNv = d.drainNv;
  CFG.dirMin = d.dirMin;     CFG.dirRnd = d.dirRnd;
  CFG.verlier = d.verlier;   CFG.steigerung = d.steigerung;
  S.stamina = d.stamina; S.erschoepft = false;

  let t = 0, b = 0;
  for(const it of items){
    if(it.kind === 'tape'){
      const an = t++ < d.tapes;
      it.taken = !an; it.obj.visible = an;
    } else if(it.kind === 'batt' && !it.extra){
      const an = b++ < d.batts;
      it.taken = !an; it.obj.visible = an;
    }
  }
  const ziel = $('tapeGoal');
  if(ziel) ziel.textContent = d.tapes;
}

const toastEl = $('toast');
let toastT = 0;
function toast(msg, secs){
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  toastT = secs || 2.6;
}

function onMonsterSpots(){
  sndScream();
  toast('ES HAT DICH GESEHEN', 2.2);
  if(SND.drone && SND.ctx) SND.drone.gain.setTargetAtTime(0.22, SND.ctx.currentTime, 0.4);
  if(navigator.vibrate) navigator.vibrate([60,40,120]);
}

/* ---------- Bildschirmgröße ---------- */
function resize(){
  const w = Math.max(320, window.innerWidth), h = Math.max(240, window.innerHeight);
  const scale = Math.min(1, (quality.renderH*1.6) / h);
  renderer.setSize(Math.round(w*scale), Math.round(h*scale), false);
  camera.aspect = w/h;
  camera.updateProjectionMatrix();
  RT_H = quality.renderH;
  RT_W = Math.round(RT_H * (w/h));
  rt.setSize(RT_W, RT_H);
  postMat.uniforms.uRes.value.set(RT_W, RT_H);
  // Die Anzeige bekommt dasselbe Seitenverhältnis, sonst zieht sie die Schrift breit
  HUD_H = 360;
  HUD_W = clamp(Math.round(HUD_H * (w/h)), 200, 900);
  if(hudC.width !== HUD_W || hudC.height !== HUD_H){
    hudC.width = HUD_W; hudC.height = HUD_H;
    hudTex.needsUpdate = true;
  }
  drawHud();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 300));
resize();

/* ---------- Bewegung mit Wandgleiten ---------- */
function movePlayer(dt, fwd, strafe, speed){
  const sy = Math.sin(S.yaw), cy = Math.cos(S.yaw);
  // Blickrichtung: -z in Kameraraum
  let dx = (-sy*fwd) + (cy*strafe);
  let dz = (-cy*fwd) - (sy*strafe);
  const l = Math.hypot(dx,dz);
  if(l > 0.0001){ dx/=l; dz/=l; } else { dx=0; dz=0; }

  const x0 = S.pos.x, z0 = S.pos.z;
  const step = speed*dt;
  let px = x0 + dx*step, pz = z0 + dz*step;
  const out = resolveCircle(px, pz, CFG.radius);
  S.pos.x = clamp(out[0], 0.3, SPAN-0.3);
  S.pos.z = clamp(out[1], 0.3, SPAN-0.3);
  return Math.hypot(S.pos.x-x0, S.pos.z-z0);
}

/* ---------- Fundstücke ---------- */
function checkItems(dt){
  let bestSignal = 0;
  for(const it of items){
    if(it.taken) continue;
    const dx = it.pos.x - S.pos.x, dz = it.pos.z - S.pos.z;
    const d2 = dx*dx + dz*dz;
    if(it.kind === 'tape'){
      const d = Math.sqrt(d2);
      bestSignal = Math.max(bestSignal, clamp((24-d)/24, 0, 1));
    }
    if(!it.ruhig){
      it.spin += dt*0.9;
      it.obj.rotation.y = it.spin;
      it.obj.position.y = it.pos.y + Math.sin(it.spin*1.6)*0.012;
    }
    if(d2 < 1.1){
      it.taken = true;
      it.obj.visible = false;
      sndPickup();
      if(navigator.vibrate) navigator.vibrate(35);
      if(it.kind === 'tape'){
        S.tapes++;
        monAlert(S.pos.x, S.pos.z, true);   // das hat sie gehört
        lichterSterben();                   // und es wird dunkler
        if(S.tapes >= CFG.tapes){
          S.exitOpen = true;
          EXIT.sign.material = MAT.signOn;
          toast('ALLE BÄNDER GEFUNDEN\nDER AUSGANG IST ENTRIEGELT', 4.5);
        } else {
          toast('BAND ' + S.tapes + '/' + CFG.tapes + ' GEFUNDEN', 2.2);
        }
      } else if(it.kind === 'batt'){
        S.battery = Math.min(100, S.battery + CFG.batteryGain);
        toast('AKKU +' + CFG.batteryGain + '%', 2.0);
      } else if(it.kind === 'photo'){
        S.hasPhoto = true;
        toast('FOTO GEFUNDEN\nDER AUSGANG STEHT AUF DER RÜCKSEITE', 4.2);
      } else if(it.kind === 'notiz'){
        S.notizen++;
        zeigeNotiz(it.text);
      } else if(it.kind === 'geheim'){
        S.geheimband = true;
        toast('BAND ? GEFUNDEN\nAUF DEM ETIKETT STEHT: NICHT UMDREHEN', 4.5);
      }
    }
  }
  return bestSignal;
}

/* ---------- Tür ---------- */
/* Eine geschlossene Tapetentür, vor der man steht und auf die man sieht */
function tapetentuerBei(){
  const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw);
  for(const V of VERSTECKE){
    const t = V.tuer;
    if(!t || V.offen) continue;
    const dx = t.mx - S.pos.x, dz = t.mz - S.pos.z, d = Math.hypot(dx, dz) || 1;
    if(d > 1.8) continue;
    if((fx*dx + fz*dz)/d < 0.3) continue;
    return V;
  }
  return null;
}
function checkDoor(){
  const d = Math.hypot(EXIT.pos.x - S.pos.x, EXIT.pos.z - S.pos.z);
  S.nearDoor = d < 2.6;
  const V = S.nearDoor ? null : tapetentuerBei();
  bUse.classList.toggle('on', (S.nearDoor || !!V) && S.phase === 'play');
  const text = V ? 'ABTASTEN' : (S.exitOpen ? 'TÜR ÖFFNEN' : 'VERSCHLOSSEN');
  if(bUse.textContent !== text) bUse.textContent = text;
  if(IN.use){
    IN.use = false;
    if(S.nearDoor){
      if(S.exitOpen){ sndDoor(); win(); }
      else { sndDenied(); toast('VERSCHLOSSEN — ' + (CFG.tapes-S.tapes) + ' BÄNDER FEHLEN', 2.6); }
    } else if(V){
      tuerOeffnen(V);
      KLANG.knarren(V.tuer.mx, V.tuer.mz);
      toast('DIE TAPETE GIBT NACH', 2.4);
      S.glitch = Math.max(S.glitch, 0.4);
      if(navigator.vibrate) navigator.vibrate(30);
    }
  }
}

/* ---------- Verstecke im Spiel ---------- */
let notizEl = null, notizT = 0;
function zeigeNotiz(text){
  if(!notizEl){
    notizEl = document.createElement('div');
    notizEl.style.cssText = 'position:fixed;left:50%;top:48%;transform:translate(-50%,-50%) rotate(-1.4deg);' +
      'width:min(80vw,430px);max-height:72vh;overflow:hidden;padding:18px 22px;background:#d6cba8;color:#2a2015;' +
      'font:15px/1.5 "Courier New",monospace;letter-spacing:.02em;box-shadow:0 10px 36px rgba(0,0,0,.7);' +
      'opacity:0;transition:opacity .5s;pointer-events:none;white-space:pre-line;z-index:40;' +
      'background-image:repeating-linear-gradient(transparent 0 21px, rgba(90,110,150,.25) 21px 22px)';
    document.body.appendChild(notizEl);
  }
  notizEl.textContent = text;
  notizEl.style.opacity = '1';
  notizT = 6 + text.length/40;
}
function versteckeTick(dt){
  // Türen schwingen auf
  for(const V of VERSTECKE){
    const t = V.tuer;
    if(!t || t.winkel === t.ziel) continue;
    t.winkel += (t.ziel - t.winkel) * Math.min(dt*2.4, 1);
    if(Math.abs(t.ziel - t.winkel) < 0.002) t.winkel = t.ziel;
    t.angel.rotation.y = t.winkel;
  }
  // Wer zum ersten Mal drin steht, hat es gefunden
  const vk = versteckVon(S.pos.x, S.pos.z);
  if(vk >= 0 && !VERSTECKE[vk].gefunden){
    VERSTECKE[vk].gefunden = true;
    S.verstecke++;
    toast('VERSTECK GEFUNDEN  ' + S.verstecke + '/' + VERSTECKE_DA, 3.0);
    beep(660, 0.08, 0.05, 'triangle'); setTimeout(() => beep(990, 0.12, 0.05, 'triangle'), 110);
  }
  if(notizT > 0){ notizT -= dt; if(notizT <= 0 && notizEl) notizEl.style.opacity = '0'; }
  tvTick(dt);
}

/* Der Fernseher im Stuhlkreis zeigt, was die Kamera in der Ecke sieht */
function tvTick(dt){
  if(!TV.V) return;
  const U = TV.mat.uniforms;
  U.uZeit.value = S.t;
  const d = Math.hypot(S.pos.x - TV.pos.x, S.pos.z - TV.pos.z);
  const drin = versteckVon(S.pos.x, S.pos.z) === VERSTECKE.indexOf(TV.V);
  TV.t += dt;
  if(TV.zustand === 'warten'){
    U.uModus.value = 0; U.uHell.value = 1; U.uRausch.value = 1;
    if(drin && d < 2.8){ TV.zustand = 'bild'; TV.t = 0; burst(0.3, 3000, 0.10, 'highpass'); }
  } else if(TV.zustand === 'bild'){
    U.uModus.value = 1;
    U.uRausch.value = TV.t < 0.35 ? 1 - TV.t/0.35 : 0.10 + Math.random()*0.08;
    if(TV.t > 3.0){
      TV.zustand = 'geist'; TV.t = 0;
      // es steht jetzt hinter dir — im Bild
      const kx = TV.cam.position.x - S.pos.x, kz = TV.cam.position.z - S.pos.z, kl = Math.hypot(kx, kz) || 1;
      const gx = S.pos.x + kx/kl*0.85, gz = S.pos.z + kz/kl*0.85;
      TV.geist.position.set(gx, 0, gz);
      TV.geist.rotation.y = Math.atan2(S.pos.x - gx, S.pos.z - gz);
      KLANG.fluestern(0, 1.6, 0.7);
    }
  } else if(TV.zustand === 'geist'){
    U.uModus.value = 1;
    U.uRausch.value = 0.14 + TV.t*0.14 + Math.random()*0.1;
    if(TV.t > 2.2){
      TV.zustand = 'knall'; TV.t = 0;
      burst(0.7, 4200, 0.4, 'highpass');
      KLANG.zischen(1); KLANG.pfeifen();
      S.glitch = 1;
      if(navigator.vibrate) navigator.vibrate([40,30,90]);
    }
  } else if(TV.zustand === 'knall'){
    U.uModus.value = 0; U.uRausch.value = 1; U.uHell.value = 1.5;
    if(TV.t > 0.4){
      TV.zustand = 'aus'; TV.t = 0; U.uHell.value = 0.03;
      monAlert(S.pos.x, S.pos.z, false);
    }
  }
  const zeigen = TV.zustand === 'bild' || TV.zustand === 'geist';
  TV.ich.visible = zeigen;
  if(zeigen){
    TV.ich.position.set(S.pos.x, 0, S.pos.z);
    TV.ich.rotation.y = S.yaw;
    TV.cam.lookAt(S.pos.x, 1.05, S.pos.z);
  }
  TV.geist.visible = TV.zustand === 'geist';
}

/* ---------- Zustandswechsel ---------- */
const scPause = $('scPause'), scEnd = $('scEnd');
let wakeLock = null;

async function goFullscreen(){
  try{
    if(IS_TOUCH && document.documentElement.requestFullscreen && !document.fullscreenElement)
      await document.documentElement.requestFullscreen({ navigationUI:'hide' });
    if(screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
  }catch(e){}
  try{ if('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }catch(e){}
}

function startGame(){
  initAudio();
  if(SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  goFullscreen();
  for(const m of MENUS) if(m) m.classList.add('hidden');
  elHud.classList.remove('hidden');
  musikStopp();                      // im Spiel läuft keine Musik
  S.phase = 'play';
  clock.getDelta();
  toast('BAND LÄUFT', 2.0);
}
function pauseGame(){
  if(S.phase !== 'play') return;
  S.phase = 'pause';
  steuerungLoslassen();
  if(notizEl){ notizEl.style.opacity = '0'; notizT = 0; }
  if(document.pointerLockElement) document.exitPointerLock();
  $('pauseStats').innerHTML =
    'BÄNDER ' + S.tapes + '/' + CFG.tapes + '<br>AKKU ' + Math.round(S.battery) + '%' +
    '<br>VERSTECKE ' + S.verstecke + '/' + VERSTECKE_DA +
    '<br>ZEIT ' + fmtTime(S.t) + '<br>SEED ' + CFG.seed;
  verstecktonTick(0);
  scPause.classList.remove('hidden');
}
function resumeGame(){
  scPause.classList.add('hidden');
  S.phase = 'play';
  clock.getDelta();
  tonWecken();
}
/* Android hängt den Tonzweig ab, sobald die App in den Hintergrund geht,
   und weckt ihn nicht von selbst wieder auf. Ohne das hier kommt man
   zurück in ein stummes Band. */
function tonWecken(){
  if(SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
}
function fmtTime(sec){
  const m = String(Math.floor(sec/60)).padStart(2,'0'), s = String(Math.floor(sec%60)).padStart(2,'0');
  return m + ':' + s;
}
function endScreen(title, text){
  $('endTitle').textContent = title;
  $('endText').innerHTML = text;
  $('endStats').innerHTML =
    'BÄNDER ' + S.tapes + '/' + CFG.tapes + ' &nbsp;·&nbsp; ZEIT ' + fmtTime(S.t) +
    '<br>VERSTECKE ' + S.verstecke + '/' + VERSTECKE_DA +
    (S.notizen ? ' &nbsp;·&nbsp; NOTIZEN ' + S.notizen : '') +
    (S.geheimband ? ' &nbsp;·&nbsp; BAND ?' : '') +
    '<br>SEED ' + CFG.seed;
  verstecktonTick(0);
  scEnd.classList.remove('hidden');
  elHud.classList.add('hidden');
  bUse.classList.remove('on');
  if(document.pointerLockElement) document.exitPointerLock();
}
/* Der Schrei im Moment des Zugriffs: mehrere Lagen übereinander, laut. */
function jumpscareTon(){
  const ac = SND.ctx;
  if(!ac || !SND.on) return;
  burst(0.06, 9000, 0.55, 'highpass');                     // harter Anschlag
  burst(1.1, 700, 0.34);                                   // Rauschwand
  const kreisch = ac.createOscillator(); kreisch.type = 'sawtooth';
  kreisch.frequency.setValueAtTime(1750, ac.currentTime);
  kreisch.frequency.exponentialRampToValueAtTime(220, ac.currentTime + 0.7);
  const g1 = ac.createGain(); g1.gain.value = 0;
  g1.gain.setTargetAtTime(0.30, ac.currentTime, 0.004);
  g1.gain.setTargetAtTime(0.0, ac.currentTime + 0.35, 0.18);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
  kreisch.connect(bp); bp.connect(g1); g1.connect(SND.master);
  kreisch.start(); kreisch.stop(ac.currentTime + 1.4);

  const tief = ac.createOscillator(); tief.type = 'square';
  tief.frequency.setValueAtTime(90, ac.currentTime);
  tief.frequency.exponentialRampToValueAtTime(28, ac.currentTime + 1.0);
  const g2 = ac.createGain(); g2.gain.value = 0;
  g2.gain.setTargetAtTime(0.34, ac.currentTime, 0.01);
  g2.gain.setTargetAtTime(0.0, ac.currentTime + 0.6, 0.3);
  tief.connect(g2); g2.connect(SND.master);
  tief.start(); tief.stop(ac.currentTime + 1.8);
}

function die(){
  if(S.phase !== 'play') return;
  S.phase = 'dead'; S.endT = 0;
  if(notizEl){ notizEl.style.opacity = '0'; notizT = 0; }
  // Der Blick springt sofort auf sie - kein Nachziehen, kein Suchen
  const dx = MON.pos.x - S.pos.x, dz = MON.pos.z - S.pos.z;
  S.yaw = S.yawT = Math.atan2(-dx, -dz);
  S.pitch = S.pitchT = 0.12;
  musikStopp();
  jumpscareTon();
  if(navigator.vibrate) navigator.vibrate([0,90,40,180,60,320]);
  if(SND.ctx && SND.on){
    SND.hiss.gain.setTargetAtTime(0.34, SND.ctx.currentTime, 0.05);
    SND.hiss.gain.setTargetAtTime(0.0,  SND.ctx.currentTime+1.6, 0.4);
    SND.hum.gain.setTargetAtTime(0.0,   SND.ctx.currentTime+0.3, 0.3);
    SND.drone.gain.setTargetAtTime(0.5, SND.ctx.currentTime, 0.05);
    SND.drone.gain.setTargetAtTime(0.0, SND.ctx.currentTime+1.1, 0.3);
  }
}
function win(){
  if(S.phase !== 'play') return;
  S.phase = 'won'; S.endT = 0;
  if(notizEl){ notizEl.style.opacity = '0'; notizT = 0; }
  if(SND.ctx && SND.on){
    SND.drone.gain.setTargetAtTime(0.0, SND.ctx.currentTime, 0.3);
    SND.hiss.gain.setTargetAtTime(0.22, SND.ctx.currentTime+0.6, 0.4);
  }
}

/* ---------- Hauptschleife ---------- */
const clock = new THREE.Clock();
let hudAcc = 0;

function step(dt){
  S.t += dt;

  /* Blick: der Finger bewegt das Ziel, die Kamera zieht weich nach und
     schwingt beim Schwenk leicht nach — ein Camcorder in der Hand steht nie
     ganz still und dreht sich nicht auf den Punkt. */
  S.yawT += IN.dyaw; IN.dyaw = 0;
  S.pitchT = clamp(S.pitchT + IN.dpitch, -1.15, 1.15); IN.dpitch = 0;
  const folge = 1 - Math.exp(-dt*11);
  const dYaw = (S.yawT - S.yaw) * folge;
  S.yaw   += dYaw;
  S.pitch += (S.pitchT - S.pitch) * folge;
  const schwenk = dYaw / Math.max(dt, 0.0001);              // rad/s
  S.swing += (clamp(schwenk*0.030, -0.20, 0.20) - S.swing) * Math.min(dt*5.0, 1);
  S.tilt  += (clamp(schwenk*0.012, -0.09, 0.09) - S.tilt)  * Math.min(dt*3.5, 1);

  // Gehen
  let fwd = 0, strafe = 0;
  if(KEY.KeyW || KEY.ArrowUp)    fwd += 1;
  if(KEY.KeyS || KEY.ArrowDown)  fwd -= 1;
  if(KEY.KeyD || KEY.ArrowRight) strafe += 1;
  if(KEY.KeyA || KEY.ArrowLeft)  strafe -= 1;
  fwd += -IN.mz; strafe += IN.mx;
  let mag = Math.hypot(fwd, strafe);
  if(mag > 1){ fwd/=mag; strafe/=mag; mag = 1; }

  /* RENNEN verlangte bisher, dass der Stick über 45 % ausgeschlagen ist. Wer
     den Daumen nur ein Stück bewegt, hielt den Knopf und ging trotzdem im
     Schritt — der Knopf wirkte kaputt. Jetzt genügt eine Bewegungsabsicht,
     und der Knopf schiebt den Ausschlag selbst auf Anschlag. */
  const willRennen = (IN.run || KEY.ShiftLeft || KEY.ShiftRight) && mag > 0.12;

  /* Ausdauer mit Sperre. Vorher hieß die Bedingung `S.stamina > 0.05`: leer
     gelaufen, wurde sie schon nach drei Bildern wieder wahr, und gedrückt
     gehaltenes Rennen flatterte danach dauerhaft zwischen Gehen und Sprint —
     Tempo pendelte um 3,5, der Ausdauerbalken strobte, und auf richtiges
     Tempo kam man nie wieder. Wer leer ist, geht jetzt, bis der Balken zu
     einem Drittel voll ist. */
  if(S.stamina <= 0) S.erschoepft = true;
  else if(S.stamina >= CFG.staminaMax * CFG.staminaFrei) S.erschoepft = false;

  const wantRun = willRennen && !S.erschoepft;
  if(wantRun && mag < 1){ fwd /= mag; strafe /= mag; mag = 1; }
  S.pusteLos = willRennen && !wantRun;        // gedrückt, aber die Luft ist weg

  /* Tempo weich nachziehen. Vorher sprang es hart zwischen Gehen und
     Rennen, und mit ihm Wippen, Blickwinkel und Schrittakt — das hat sich
     angefühlt, als ruckle man vorwärts. */
  const wanted = (wantRun ? CFG.sprint : CFG.walk) * mag;
  S.speed += (wanted - S.speed) * Math.min(dt*7, 1);
  const moved = S.speed > 0.03 ? movePlayer(dt, fwd, strafe, S.speed) : 0;
  const real  = dt > 0 ? moved/dt : 0;            // was tatsächlich zurückgelegt wurde

  /* Der Verbrauch hing an `moved`: wer im Sprint frontal gegen eine Wand
     lief, kam auf 0 Bewegung — und füllte den Balken bei vollem Sprinttempo
     wieder auf. Es zählt jetzt die Absicht, nicht der Erfolg. */
  if(wantRun) S.stamina = Math.max(0, S.stamina - dt);
  else S.stamina = Math.min(CFG.staminaMax, S.stamina + dt*CFG.staminaRegen);

  // Schrittakt hängt am echten Tempo, nicht an einer Stufe — und wird gedämpft,
  // damit ein Streifen an der Wand das Wippen nicht abwürgt.
  S.gait += (real - S.gait) * Math.min(dt*5, 1);
  const g = clamp(S.gait / CFG.walk, 0, 2.1);
  S.bob += dt * 3.35 * Math.max(S.gait, 0.001);
  const bobY = Math.sin(S.bob) * (0.020 + 0.006*g) * Math.min(g, 1.3);
  let noise = 0;
  if(g > 0.15){
    noise = g > 1.35 ? 20 : 9;
    if(Math.sin(S.bob) < -0.9 && S.t - S.lastStep > 0.19){
      S.lastStep = S.t;
      g > 1.35 ? sndRunStep() : sndStep();
      if(SCARE.echo > 0){
        // jemand geht hinter dir, im selben Takt
        const bx = S.pos.x + Math.sin(S.yaw)*3.4, bz = S.pos.z + Math.cos(S.yaw)*3.4;
        const laut = g > 1.35 ? 1.2 : 0.9;
        setTimeout(() => { if(S.phase === 'play') KLANG.fremdSchritt(bx, bz, laut); }, 230 + Math.random()*70);
      }
    }
  }

  // Augenhöhe zusätzlich dämpfen, das nimmt dem Wippen die Härte
  const eyeTarget = CFG.eye + bobY + Math.sin(S.t*0.5)*0.010;
  S.eyeY += (eyeTarget - S.eyeY) * Math.min(dt*16, 1);
  // ruhiges Wandern der Hand, damit das Bild nie einrastet
  const driftY = Math.sin(S.t*0.37)*0.009 + Math.sin(S.t*0.91)*0.0035;
  const driftP = Math.sin(S.t*0.53 + 1.7)*0.007;
  camera.position.set(S.pos.x, S.eyeY, S.pos.z);
  camera.rotation.set(S.pitch + driftP + S.tilt + Math.sin(S.bob*0.5)*0.005*Math.min(g,1),
                      S.yaw + driftY,
                      -S.swing + Math.cos(S.bob*0.5)*0.007*Math.min(g,1.4));
  camera.fov = 74 + Math.min(g,2)*1.1;
  camera.updateProjectionMatrix();
  hoererSetzen();
  versteckeTick(dt);
  verstecktonTick(dt);

  // Akku und Nachtsicht
  if(IN.nv && S.battery <= 0){ IN.nv = false; bNv.classList.remove('act'); toast('AKKU LEER', 2.2); }
  S.battery = Math.max(0, S.battery - dt*(CFG.drainIdle + (IN.nv ? CFG.drainNv : 0)));
  const nvTarget = IN.nv ? 1 : 0;
  postMat.uniforms.uNv.value += (nvTarget - postMat.uniforms.uNv.value) * Math.min(dt*6, 1);
  nvLight.position.copy(camera.position);
  nvLight.intensity = postMat.uniforms.uNv.value * 3.1;

  // Fundstücke und Tür
  const signal = checkItems(dt);
  checkDoor();

  scareTick(dt);

  // Die Gestalt
  let distP = updateMonster(dt, S.pos, noise);
  if(!isFinite(distP)) distP = 999;
  const inVersteck = versteckVon(S.pos.x, S.pos.z) >= 0 && versteckVon(MON.pos.x, MON.pos.z) < 0;
  if(distP < CFG.monCatch && !inVersteck) die();

  // Augen: im Nachtsichtbild hell, auf der Jagd ein schwaches Rot
  {
    const nv = postMat.uniforms.uNv.value, j = MON.state === 'hunt' ? 1 : 0;
    MAT.auge.color.setRGB(0.05 + nv*1.1 + j*0.35, 0.02 + nv*1.1 + j*0.04, 0.012 + nv*1.1);
  }

  const near = clamp((24 - distP)/24, 0, 1);
  const dangerTarget = near * (MON.state === 'hunt' ? 1 : (MON.state === 'search' ? 0.5 : 0.3));
  S.danger += (dangerTarget - S.danger) * Math.min(dt*2.2, 1);

  // Stimmung
  updateLights(dt, S.t, S.danger);
  postMat.uniforms.uRed.value = MON.state === 'hunt' ? S.danger*0.20 : 0;
  renderer.toneMappingExposure = CFG.exposure * (1 - S.danger*0.12);
  scene.fog.density = CFG.fog + S.danger*0.010 - postMat.uniforms.uNv.value*0.008;

  let gl = 0.04 + Math.max(0, Math.sin(S.t*0.37))*0.04 + S.danger*0.42;
  if(Math.random() < 0.006) gl += 0.45;
  S.glitch += (gl - S.glitch) * Math.min(dt*9, 1);

  // Ton
  if(SND.ctx && SND.on){
    SND.drone.gain.value = 0.02 + S.danger*0.34;
    SND.hiss.gain.value  = 0.030 + S.danger*0.02 + postMat.uniforms.uNv.value*0.02;
  }
  S.heart -= dt;
  if(S.danger > 0.32 && S.heart <= 0){
    S.heart = lerp(1.15, 0.42, clamp((S.danger-0.32)/0.68, 0, 1));
    KLANG.herz(0.45 + S.danger*0.6);
  }
  S.tick -= dt;
  if(signal > 0.06 && S.tick <= 0){ S.tick = lerp(1.7, 0.14, signal); sndTick(); }
  S.clunk -= dt;
  if(S.clunk <= 0){ S.clunk = 11 + Math.random()*16; sndClunk(); }

  // Staub um die Kamera halten
  const dp = dustGeo.attributes.position.array;
  for(let i=0;i<dustN;i++){
    const j=i*3;
    dp[j+1] += Math.sin(S.t*0.7 + i)*0.0016;
    if(dp[j+1] > WH) dp[j+1] = 0.1;
    const dx = dp[j] + dust.position.x - camera.position.x;
    const dz = dp[j+2] + dust.position.z - camera.position.z;
    if(dx >  15) dp[j] -= 30; else if(dx < -15) dp[j] += 30;
    if(dz >  15) dp[j+2] -= 30; else if(dz < -15) dp[j+2] += 30;
  }
  dust.position.set(camera.position.x, 0, camera.position.z);
  dustGeo.attributes.position.needsUpdate = true;

  postMat.uniforms.uFade.value = Math.min(S.t*0.8, 1);

  HUDS.tapes = S.tapes; HUDS.battery = S.battery; HUDS.time = S.t;
  HUDS.stamina = S.stamina/CFG.staminaMax; HUDS.signal = signal; HUDS.nv = IN.nv;
  HUDS.ausgepustet = S.pusteLos;
  HUDS.dunkel = SCARE.aus > 0 || lichtHier < 0.12;
  HUDS.stoer = clamp(1 - distP/13, 0, 1);
  bRun.classList.toggle('leer', S.erschoepft || S.stamina < CFG.staminaMax*0.25);
  // Der Pfeil erscheint mit dem Foto — und spätestens, wenn alle Bänder da sind
  HUDS.exit = (S.hasPhoto || S.exitOpen)
    ? (Math.atan2(EXIT.pos.x - S.pos.x, -(EXIT.pos.z - S.pos.z)) + S.yaw) : null;

  if(toastT > 0){ toastT -= dt; if(toastT <= 0) toastEl.classList.remove('on'); }
}

function deathStep(dt){
  S.endT += dt;
  const t = S.endT;

  /* Sie steht im nächsten Bild vor der Linse: der Kopf wandert auf Augenhöhe,
     das Bild schlägt auf, dann reißt das Band. */
  const rein = Math.min(t/0.11, 1);
  const d = lerp(2.2, 0.92, rein);
  const gx = S.pos.x - Math.sin(S.yaw)*d, gz = S.pos.z - Math.cos(S.yaw)*d;
  MON.group.visible = true;
  MON.group.position.set(gx, lerp(0, -0.66, rein), gz);          // Kopf auf Augenhöhe
  MON.group.rotation.y = Math.atan2(S.pos.x - gx, S.pos.z - gz);  // schaut in die Kamera

  const schuett = Math.max(0, 1 - t/0.9);
  camera.position.set(
    S.pos.x + (Math.random()-0.5)*0.10*schuett,
    CFG.eye - Math.min(t*0.35, 0.30) + (Math.random()-0.5)*0.12*schuett,
    S.pos.z + (Math.random()-0.5)*0.10*schuett);
  camera.rotation.set(S.pitch + (Math.random()-0.5)*0.10*schuett,
                      S.yaw + (Math.random()-0.5)*0.10*schuett,
                      (Math.random()-0.5)*0.22*schuett);
  camera.fov = lerp(74, 101, rein) - Math.max(0, t-0.3)*9;
  camera.fov = clamp(camera.fov, 62, 101);
  camera.updateProjectionMatrix();

  updateLights(dt, S.t, 1);
  MAT.auge.color.setRGB(1.3, 0.22, 0.08);
  S.glitch = 1;
  postMat.uniforms.uRed.value = Math.max(0, 0.55 - t*0.5);
  postMat.uniforms.uStatic.value = t < 0.10 ? 1 : (t > 0.55 ? Math.min((t-0.55)*4, 1) : 0);
  if(t > 1.5) postMat.uniforms.uFade.value = Math.max(0, 1-(t-1.5)*1.6);
  if(t > 2.4 && scEnd.classList.contains('hidden')){
    endScreen('END OF TAPE', 'Das Band bricht an dieser Stelle ab.<br>Was danach kommt, hat niemand gesehen.');
  }
}

function winStep(dt){
  S.endT += dt;
  S.glitch = Math.min(1, S.endT*0.8);
  postMat.uniforms.uStatic.value = S.endT > 0.6 ? Math.min((S.endT-0.6)*2, 1) : 0;
  if(S.endT > 1.1) postMat.uniforms.uFade.value = Math.max(0, 1-(S.endT-1.1)*1.8);
  if(S.endT > 2.0 && scEnd.classList.contains('hidden')){
    endScreen('AUSGESTIEGEN',
      'Die Tür fällt hinter dir zu.<br>' + CFG.tapes + ' Bänder, ein Foto und ein Treppenhaus ins Nichts.' +
      (S.hasPhoto ? '' : '<br>Das Foto liegt noch da unten.') +
      (EBENEN_DA ? '<br><br>Das Treppenhaus geht nur nach unten. Unten steht Wasser.' : ''));
    /* Wer Ebene 0 geschafft hat, kommt hier weiter — der Knopf steht nur
       nach einem Ausstieg da, nicht nach einem Tod. */
    if(EBENEN_DA){
      localStorage.setItem('ft_ebene1', '1');      // Band 2 ist jetzt gelesen
      const weiter = $('bWeiterPool');
      if(weiter) weiter.style.display = '';
    }
  }
}

function render(){
  postMat.uniforms.uTime.value = S.t;
  postMat.uniforms.uGlitch.value = S.glitch;
  if(TV.V && (TV.zustand === 'bild' || TV.zustand === 'geist')){
    TV.bild = (TV.bild || 0) + 1;
    if(TV.bild % 2 === 0){
      // der Schirm darf sich nicht selbst filmen
      TV.schirm.visible = false;
      const a = MAT.auge.color.clone(); MAT.auge.color.setRGB(1.2, 1.2, 1.2);
      const bel = renderer.toneMappingExposure;
      renderer.toneMappingExposure = bel*1.3;
      renderer.setRenderTarget(TV.rt);
      renderer.render(scene, TV.cam);
      renderer.toneMappingExposure = bel;
      TV.schirm.visible = true; MAT.auge.color.copy(a);
    }
  }
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
}

function frame(){
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  if(S.phase === 'play') step(dt);
  else if(S.phase === 'dead') deathStep(dt);
  else if(S.phase === 'won')  winStep(dt);
  else if(S.phase === 'menu' || S.phase === 'pause') return;   // Bild einfrieren, Akku sparen
  hudAcc += dt;
  if(hudAcc > 0.08){ hudAcc = 0; drawHud(); }
  render();
}

applyDifficulty(diffKey);        // gespeicherte Wahl gilt sofort

/* ---------- Menüfluss: Vorspann, Titel, Schwierigkeit, Briefing ---------- */
const scSplash = $('scSplash'), scTitle = $('scTitle'), scDiff = $('scDiff'), scBrief = $('scBrief');
const MENUS = [scSplash, scTitle, scDiff, scBrief, scPause, scEnd];
function zeige(el){
  for(const m of MENUS) if(m) m.classList.add('hidden');
  if(el) el.classList.remove('hidden');
}

// Der Vorspann läuft einmal je Sitzung; nach einem Neuladen wegen der
// Bildqualität soll man nicht wieder davorsitzen.
let vorspannLaeuft = sessionStorage.getItem('ft_intro') !== '1';
if(!vorspannLaeuft) zeige(scTitle);
else {
  sessionStorage.setItem('ft_intro', '1');
  setTimeout(() => { if(!scSplash.classList.contains('hidden')) zeige(scTitle); }, 3200);
  scSplash.addEventListener('click', () => zeige(scTitle));
}

document.querySelectorAll('.chip[data-q]').forEach(el => {
  el.addEventListener('click', () => {
    localStorage.setItem('ft_q', el.dataset.q);
    location.search = '?seed=' + CFG.seed;
  });
});
{
  const cur = localStorage.getItem('ft_q') || (IS_TOUCH ? 'mid' : 'high');
  document.querySelectorAll('.chip[data-q]').forEach(el => el.classList.toggle('sel', el.dataset.q === cur));
}

document.querySelectorAll('.diff[data-diff]').forEach(el => {
  el.classList.toggle('sel', el.dataset.diff === diffKey);
  el.addEventListener('click', () => {
    document.querySelectorAll('.diff[data-diff]').forEach(o => o.classList.remove('sel'));
    el.classList.add('sel');
    applyDifficulty(el.dataset.diff);
  });
});

$('bStart').addEventListener('click', () => {
  initAudio();                       // im Klick, sonst blockt der Browser den Ton
  if(SND.ctx && SND.ctx.state === 'suspended') SND.ctx.resume();
  musikAn();
  zeige(scDiff);
});
$('bBackTitle').addEventListener('click', () => zeige(scTitle));
$('bPlay').addEventListener('click', () => {
  applyDifficulty(diffKey);
  zeige(scBrief);
});
scBrief.addEventListener('click', startGame);
$('bResume').addEventListener('click', resumeGame);
{
  const bm = $('bMusic');
  const zeigen = () => { bm.textContent = 'MUSIK: ' + (MUSIC.on ? 'AN' : 'AUS'); bm.classList.toggle('sel', MUSIC.on); };
  zeigen();
  bm.addEventListener('click', () => { setMusic(!MUSIC.on); zeigen(); });
}
$('bQuit').addEventListener('click', () => location.reload());
$('bNewSeed').addEventListener('click', () => { location.search = '?seed=' + (Math.random()*1e9|0); });
$('bWeiterPool').addEventListener('click', () => location.href = '#b1');

/* ---------- Bandwahl: dieselbe Kassette, zwei Ebenen ----------
   Ebene 1 liegt in einer eigenen Datei, weil sie eine neuere three-Fassung
   braucht und dieses Band hier schon acht Megabyte wiegt. Für den Spieler
   ist es ein Spiel: ein Eintrag, ein Titelbild, eine Auswahl. */
{
  const b0 = $('bEbene0'), sub = $('titleSub');
  /* Jedes Band schaltet das nächste frei. Wer nur Ebene 0 gesehen hat,
     soll gar nicht erst wissen, was danach kommt.
     Die Ziele nennen die Datei ausdrücklich: ein Webserver ergänzt die
     index.html von selbst, der Asset-Lader der App tut das nicht. */
  const baender = [
    { knopf: $('bEbene1'), schluessel: 'ft_ebene1', ziel: '#b1', vor: 'EBENE 0' },
    { knopf: $('bEbene2'), schluessel: 'ft_ebene2', ziel: '#b2',     vor: 'EBENE 1' }
  ];
  b0.addEventListener('click', () => {
    b0.classList.add('sel');
    for(const b of baender) b.knopf.classList.remove('sel');
    sub.innerHTML = 'SUBLEVEL 0 &nbsp;·&nbsp; LOST FOOTAGE';
  });
  for(const b of baender){
    if(!EBENEN_DA){
      b.knopf.style.opacity = '.35';
      b.knopf.title = 'In der Einzeldatei nicht enthalten.';
    } else if(localStorage.getItem(b.schluessel) !== '1'){
      b.knopf.style.opacity = '.45';
      b.knopf.title = 'Erst ' + b.vor + ' überstehen.';
    }
    b.knopf.addEventListener('click', () => {
      if(!EBENEN_DA){
        sub.innerHTML = 'DIE WEITEREN BÄNDER GIBT ES NUR IN DER APP &nbsp;·&nbsp; ODER IM NETZ';
        sndDenied();
        return;
      }
      if(localStorage.getItem(b.schluessel) !== '1'){
        sub.innerHTML = 'DIESES BAND IST NOCH NICHT GELESEN &nbsp;·&nbsp; ERST ' + b.vor;
        sndDenied();
        return;
      }
      initAudio();
      location.href = b.ziel;
    });
  }
}
$('bAgain').addEventListener('click', () => location.reload());
$('bAgainSeed').addEventListener('click', () => { location.search = '?seed=' + (Math.random()*1e9|0); });
document.addEventListener('visibilitychange', () => {
  if(document.hidden){ if(S.phase === 'play') pauseGame(); }
  else tonWecken();
});

/* ---------- Ladeanzeige ---------- */
{
  const fill = $('loadfill'), btn = $('bStart');
  let done = false;
  const ready = () => {
    if(done) return;
    done = true;
    fill.style.width = '100%';
    btn.disabled = false;
    btn.textContent = '● BAND EINLEGEN';
    // Shader einmal übersetzen, damit der erste Schritt nicht ruckelt
    camera.position.copy(S.pos);
    render();
  };
  const poll = setInterval(() => {
    const total = Math.max(1, loadMgr.itemsTotal || 1);
    const p = Math.min(99, Math.round((loadMgr.itemsLoaded/total)*100));
    fill.style.width = p + '%';
    if(loadMgr.itemsTotal > 0 && loadMgr.itemsLoaded >= loadMgr.itemsTotal){ clearInterval(poll); ready(); }
  }, 120);
  setTimeout(() => { clearInterval(poll); ready(); }, 9000);   // Notausstieg
}

/* Die Musik gehört ins Menü. Während des Spiels bleibt es beim Brummen,
   Rauschen und dem, was in den Gängen unterwegs ist. */
let warImSpiel = false;
setInterval(() => {
  const imSpiel = (S.phase === 'play');
  if(warImSpiel && !imSpiel) MUSIC.gap = Math.min(MUSIC.gap, 1.4);   // zurück ins Menü: zügig wieder Musik
  warImSpiel = imSpiel;
  musicUpdate(0.12, 0, imSpiel);
}, 120);

drawHud();
frame();

/* ---------- Empfindlichkeit des Umsehens ----------
   Ein Regler im Pausenbild, über alle Bänder hinweg gemerkt. */
{
  const regler = $('empfRegler'), wert = $('empfWert');
  if(regler){
    const zeigen = () => { if(wert) wert.textContent = EMPF.toFixed(1).replace('.', ',') + '×'; };
    regler.value = Math.round(EMPF * 100);
    zeigen();
    regler.addEventListener('input', () => {
      EMPF = clamp(regler.value / 100, 0.3, 2.5);
      localStorage.setItem('ft_empf', String(EMPF));
      zeigen();
    });
    for(const art of ['pointerdown','pointermove','pointerup'])
      regler.addEventListener(art, e => e.stopPropagation());
  }
}

/* Prüfhaken für die Messung von außen — dieselbe Handhabe wie in den
   anderen Bändern, damit sich alle drei gleich testen lassen. */
window.FT = {
  stand(){ return { x:+S.pos.x.toFixed(2), z:+S.pos.z.toFixed(2), phase:S.phase,
    gier:+S.yaw.toFixed(3), gierZ:+S.yawT.toFixed(3),
    schwung:+S.swing.toFixed(3), kipp:+S.tilt.toFixed(3),
    akku:Math.round(S.battery), baender:S.tapes, versteck:versteckVon(S.pos.x, S.pos.z),
    verstecke:S.verstecke, notizen:S.notizen, geheim:S.geheimband, tv:TV.zustand, gestalt:MON.state }; },
  blick(g,n){ S.yaw=S.yawT=g; if(n!==undefined) S.pitch=S.pitchT=n; },
  verstecke(){ return VERSTECKE.map(V => ({ art:V.art, offen:V.offen, gefunden:V.gefunden,
    tuer: V.tuer ? { mx:+V.tuer.mx.toFixed(2), mz:+V.tuer.mz.toFixed(2), inX:V.tuer.inX, inZ:V.tuer.inZ } : null })); },
  hin(x, z, g){ S.pos.x = x; S.pos.z = z; if(g !== undefined) S.yaw = S.yawT = g; return this.stand(); },
  vorTuer(k, abstand){
    const t = VERSTECKE[k].tuer; const a = abstand === undefined ? 1.1 : abstand;
    S.pos.x = t.mx - t.inX*a; S.pos.z = t.mz - t.inZ*a;
    S.yaw = S.yawT = Math.atan2(-t.inX, -t.inZ);
    return this.stand();
  },
  gestalt(x, z){ MON.pos.set(x, 0, z); MON.path = null; },
  strom(){ stromAus(); }, tv(){ return TV.zustand; },
  lauf(sek){ const n = Math.round(sek/0.05); for(let i=0;i<n && S.phase==='play';i++) step(0.05); return this.stand(); },
  MON, SCARE, TV, VERSTECKE,
  empf(){ return EMPF; },
  S, IN,
};
