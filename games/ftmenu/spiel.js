/* ======================================================================
   FOUND TAPE — HAUPTMENÜ
   Das gemeinsame Menü für alle drei Bänder. Im Hintergrund läuft eine
   Kamera langsam durch Gänge, die bei jedem Start neu gewürfelt werden:
   gelbe Tapete, feuchter Teppich, summende Röhren. Ab und zu steht
   jemand am Ende eines Ganges.

   Die Einstellungen hier gelten für alle Bänder; ein Band, das aus dem
   Menü heraus gestartet wird, überspringt seine eigenen Titelbilder.
   ====================================================================== */
'use strict';

const $ = id => document.getElementById(id);
const A = u => (window.FT_ASSETS && window.FT_ASSETS[u]) || u;
const IS_TOUCH = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
const lies = (k, v) => { try { const x = localStorage.getItem(k); return x === null ? v : x; } catch(e){ return v; } };
const schreib = (k, v) => { try { localStorage.setItem(k, v); } catch(e){} };
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a)*t;
const ri = n => (Math.random()*n)|0;
const pick = a => a[ri(a.length)];

/* ======================= Einstellungen für alle Bänder ======================= */
const STUFEN = {
  leicht: { b0:'baby',    b1:'ruhig',  b2:'fern',
            text:'Leicht — sie ist langsam, sieht schlecht und gibt schnell auf. Viel Luft, viel Akku.' },
  normal: { b0:'normal',  b1:'normal', b2:'normal',
            text:'Normal — so waren die Bänder gedacht.' },
  extrem: { b0:'extreme', b1:'tief',   b2:'nah',
            text:'Extrem — schneller als du, hört alles und lässt nicht mehr los.' }
};
let stufe = lies('ft_stufe', null);
if(!STUFEN[stufe]) stufe = ({ baby:'leicht', extreme:'extrem' })[lies('ft_diff', 'normal')] || 'normal';
let qual = lies('ft_q', IS_TOUCH ? 'mid' : 'high');
if(['low','mid','high'].indexOf(qual) < 0) qual = 'mid';

function stufeSetzen(s){
  stufe = s; schreib('ft_stufe', s);
  const m = STUFEN[s];
  schreib('ft_diff', m.b0); schreib('pr_diff', m.b1); schreib('wi_diff', m.b2);
}
function qualSetzen(q){
  qual = q;
  schreib('ft_q', q); schreib('pr_q', q); schreib('wi_q', q);
  groesse();
}
stufeSetzen(stufe);

const EBENEN = [
  { band:'b0', name:'FLUR',      nr:'EBENE 0', text:'Gelbe Tapete, summende Röhren, und etwas, das die Gänge mit dir teilt.', frei:() => true },
  { band:'b1', name:'POOLROOMS', nr:'EBENE 1', text:'Kacheln, Chlor und tiefes Wasser. Wo du stehen kannst, kommt es nicht hin.', frei:() => lies('ft_ebene1', '0') === '1' },
  { band:'b2', name:'DIE WIESE', nr:'EBENE 2', text:'Gras bis zum Rand und ein Mast mit rotem Licht. Sieh sie an, dann stehen sie still.', frei:() => lies('ft_ebene2', '0') === '1' }
];

/* ======================= Renderer und Material ======================= */
const QS = { low:{ h:300, licht:4 }, mid:{ h:400, licht:5 }, high:{ h:540, licht:7 } };
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, powerPreference:'high-performance' });
renderer.setPixelRatio(1);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 0.44;

const NEBEL = 0x0a0803;
const scene = new THREE.Scene();
scene.background = new THREE.Color(NEBEL);
scene.fog = new THREE.FogExp2(NEBEL, 0.056);
const camera = new THREE.PerspectiveCamera(70, 16/9, 0.05, 90);
camera.rotation.order = 'YXZ';

function cv(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function korn(x, w, h, amt){
  const im = x.getImageData(0, 0, w, h), d = im.data;
  for(let i=0;i<d.length;i+=4){ const n = (Math.random()-0.5)*amt; d[i]+=n; d[i+1]+=n; d[i+2]+=n*0.8; }
  x.putImageData(im, 0, 0);
}
function ausBild(url, rx, ry){
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
function ausLeinwand(c, rx, ry){
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
  return t;
}
function deckenBild(){
  const s = 256, c = cv(s, s), x = c.getContext('2d');
  x.fillStyle = '#cfc9a8'; x.fillRect(0, 0, s, s);
  for(let i=0;i<900;i++){
    x.fillStyle = 'rgba(' + (150+Math.random()*60|0) + ',' + (146+Math.random()*55|0) + ',120,.10)';
    x.fillRect(Math.random()*s, Math.random()*s, 2, 2);
  }
  for(let i=0;i<4;i++){
    const px = Math.random()*s, py = Math.random()*s, r = 15 + Math.random()*35;
    const g = x.createRadialGradient(px, py, r*0.6, px, py, r);
    g.addColorStop(0, 'rgba(150,120,60,.18)'); g.addColorStop(0.85, 'rgba(110,84,36,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py, r, 0, 7); x.fill();
  }
  x.strokeStyle = 'rgba(96,90,64,.75)'; x.lineWidth = 4; x.strokeRect(0, 0, s, s);
  x.beginPath(); x.moveTo(s/2, 0); x.lineTo(s/2, s); x.moveTo(0, s/2); x.lineTo(s, s/2); x.stroke();
  korn(x, s, s, 16);
  return c;
}

const G = 14, CS = 4.2, WH = 3.2, SPAN = G*CS;
const MAT = {
  wand:  new THREE.MeshStandardMaterial({ map:ausBild(A('assets/wall.jpg'), 1.6, 1.15), roughness:0.94, metalness:0 }),
  boden: new THREE.MeshStandardMaterial({ map:ausBild(A('assets/floor.jpg'), G*4, G*4), roughness:0.99, metalness:0, color:0xb4aa7c }),
  decke: new THREE.MeshStandardMaterial({ map:ausLeinwand(deckenBild(), G*3, G*3), roughness:0.96, metalness:0,
                                          emissive:0x120f08 }),
  kante: new THREE.MeshStandardMaterial({ color:0x6a5c33, roughness:0.95, metalness:0 }),
  leiste: new THREE.MeshStandardMaterial({ color:0x8c8458, roughness:0.6, metalness:0.05 }),
  gehaeuse: new THREE.MeshStandardMaterial({ color:0xb3ad90, roughness:0.5, metalness:0.25 }),
  schwarz: new THREE.MeshBasicMaterial({ color:0x000000 })
};
const ROEHRE = new THREE.Color(2.1, 1.95, 1.6);

/* ======================= Gänge würfeln ======================= */
/* Ein Labyrinth ohne Sackgassen: erst ein vollständiger Irrgarten, dann
   viele Wände heraus, bis es nach Hallen und Gängen aussieht — und
   jede Zelle mindestens zwei Ausgänge hat, damit die Kamera nie umkehrt. */
const wV = new Uint8Array((G+1)*G).fill(1), wH = new Uint8Array(G*(G+1)).fill(1);
const vI = (x, y) => y*(G+1) + x, hI = (x, y) => y*G + x;
const idx = (x, y) => y*G + x;
function wandZwischen(x, y, nx, ny){
  if(nx > x) return wV[vI(x+1, y)];
  if(nx < x) return wV[vI(x, y)];
  if(ny > y) return wH[hI(x, y+1)];
  return wH[hI(x, y)];
}
function oeffne(x, y, nx, ny){
  if(nx > x) wV[vI(x+1, y)] = 0;
  else if(nx < x) wV[vI(x, y)] = 0;
  else if(ny > y) wH[hI(x, y+1)] = 0;
  else wH[hI(x, y)] = 0;
}
const innen = (x, y) => x >= 0 && y >= 0 && x < G && y < G;
const RICHT = [[1,0],[-1,0],[0,1],[0,-1]];
{
  const da = new Uint8Array(G*G);
  const st = [[ri(G), ri(G)]];
  da[idx(st[0][0], st[0][1])] = 1;
  while(st.length){
    const [x, y] = st[st.length-1];
    const n = RICHT.map(([dx, dy]) => [x+dx, y+dy]).filter(([nx, ny]) => innen(nx, ny) && !da[idx(nx, ny)]);
    if(!n.length){ st.pop(); continue; }
    const [nx, ny] = pick(n);
    oeffne(x, y, nx, ny); da[idx(nx, ny)] = 1; st.push([nx, ny]);
  }
  for(let y=0;y<G;y++) for(let x=0;x<G;x++){
    if(x < G-1 && Math.random() < 0.42) oeffne(x, y, x+1, y);
    if(y < G-1 && Math.random() < 0.42) oeffne(x, y, x, y+1);
  }
  for(let runde=0; runde<4; runde++){
    for(let y=0;y<G;y++) for(let x=0;x<G;x++){
      const aus = RICHT.filter(([dx, dy]) => innen(x+dx, y+dy) && !wandZwischen(x, y, x+dx, y+dy));
      if(aus.length >= 2) continue;
      const zu = RICHT.filter(([dx, dy]) => innen(x+dx, y+dy) && wandZwischen(x, y, x+dx, y+dy));
      if(zu.length){ const [dx, dy] = pick(zu); oeffne(x, y, x+dx, y+dy); }
    }
  }
}
function nachbarn(c){
  const x = c % G, y = (c/G)|0, raus = [];
  for(const [dx, dy] of RICHT) if(innen(x+dx, y+dy) && !wandZwischen(x, y, x+dx, y+dy)) raus.push(idx(x+dx, y+dy));
  return raus;
}
const mitte = c => new THREE.Vector3((c % G)*CS + CS/2, 0, ((c/G)|0)*CS + CS/2);

/* ======================= Halle bauen ======================= */
{
  const boden = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN), MAT.boden);
  boden.rotation.x = -Math.PI/2; boden.position.set(SPAN/2, 0, SPAN/2); scene.add(boden);
  const decke = new THREE.Mesh(new THREE.PlaneGeometry(SPAN, SPAN), MAT.decke);
  decke.rotation.x = Math.PI/2; decke.position.set(SPAN/2, WH, SPAN/2); scene.add(decke);

  const teile = [];
  for(let y=0;y<G;y++) for(let x=0;x<=G;x++) if(wV[vI(x, y)]) teile.push([x*CS, y*CS + CS/2, Math.PI/2]);
  for(let y=0;y<=G;y++) for(let x=0;x<G;x++) if(wH[hI(x, y)]) teile.push([x*CS + CS/2, y*CS, 0]);
  // die schmalen Stirnseiten bekommen keine Tapete, sonst wird sie dort zu Streifen gequetscht
  const wand = new THREE.InstancedMesh(new THREE.BoxGeometry(CS + 0.24, WH, 0.24),
    [MAT.kante, MAT.kante, MAT.kante, MAT.kante, MAT.wand, MAT.wand], teile.length);
  const leiste = new THREE.InstancedMesh(new THREE.BoxGeometry(CS + 0.24, 0.13, 0.32), MAT.leiste, teile.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), e1 = new THREE.Vector3(1,1,1), eu = new THREE.Euler();
  teile.forEach((t, i) => {
    q.setFromEuler(eu.set(0, t[2], 0));
    wand.setMatrixAt(i, m4.compose(v.set(t[0], WH/2, t[1]), q, e1));
    leiste.setMatrixAt(i, m4.compose(v.set(t[0], 0.065, t[1]), q, e1));
  });
  wand.frustumCulled = leiste.frustumCulled = false;
  scene.add(wand, leiste);
}

/* Deckenleuchten — manche tot, manche flackern */
const LEUCHTEN = [];
{
  const roehre = new THREE.PlaneGeometry(1.15, 0.58), haus = new THREE.BoxGeometry(1.3, 0.09, 0.72);
  const liste = [];
  for(let y=0;y<G;y++) for(let x=0;x<G;x++){
    if((x + y) % 2 !== 0 && Math.random() < 0.75) continue;
    const r = Math.random() < 0.5 ? 0 : Math.PI/2;
    const p = new THREE.Vector3(x*CS + CS/2, WH - 0.045, y*CS + CS/2);
    const m = new THREE.Mesh(roehre, new THREE.MeshBasicMaterial({ color:ROEHRE, fog:false }));
    m.rotation.x = Math.PI/2; m.rotation.z = r; m.position.copy(p); scene.add(m);
    const w = Math.random();
    LEUCHTEN.push({ pos:new THREE.Vector3(p.x, WH - 0.3, p.z), mesh:m, tot: w < 0.12, kaputt: w > 0.12 && w < 0.24,
                    f:2 + Math.random()*7, ph:Math.random()*6.28, an:1 });
    liste.push([p.x, p.z, r]);
  }
  const im = new THREE.InstancedMesh(haus, MAT.gehaeuse, liste.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), e1 = new THREE.Vector3(1,1,1), eu = new THREE.Euler();
  liste.forEach((l, i) => { q.setFromEuler(eu.set(0, l[2], 0)); im.setMatrixAt(i, m4.compose(v.set(l[0], WH - 0.06, l[1]), q, e1)); });
  im.frustumCulled = false;
  scene.add(im);
}
const RIG = [];
for(let i=0;i<7;i++){ const l = new THREE.PointLight(0xffd894, 0, 13, 2); scene.add(l); RIG.push(l); }
scene.add(new THREE.HemisphereLight(0xffe0a4, 0x2a2109, 0.04));
let sortT = 0;
function lichter(dt, t){
  for(const f of LEUCHTEN){
    let v;
    if(f.tot) v = 0;
    else if(f.kaputt){ const s = Math.sin(t*f.f + f.ph) + Math.sin(t*f.f*2.6 + f.ph*1.7); v = s > 0.7 ? 1 : (Math.random() < 0.25 ? 0.4 : 0.02); }
    else { v = 0.96 + Math.sin(t*118 + f.ph)*0.04; if(Math.random() < 0.003) v = 0.3; }
    if(GESTALT.sichtbar && f.pos.distanceToSquared(GESTALT.obj.position) < 64 && Math.random() < 0.5) v *= 0.05;
    f.an = v;
    f.mesh.material.color.copy(ROEHRE).multiplyScalar(v);
  }
  sortT -= dt;
  if(sortT <= 0){
    sortT = 0.3;
    LEUCHTEN.sort((a, b) => a.pos.distanceToSquared(camera.position) - b.pos.distanceToSquared(camera.position));
  }
  const n = QS[qual].licht;
  for(let i=0;i<RIG.length;i++){
    const f = LEUCHTEN[i];
    if(!f || i >= n){ RIG[i].intensity = 0; continue; }
    RIG[i].position.copy(f.pos);
    RIG[i].intensity = 3.4*f.an;
  }
}

/* ======================= Die Gestalt ======================= */
const GESTALT = { obj:new THREE.Group(), sichtbar:false, t:0, warte:18 + Math.random()*20, zelle:-1,
                  gegen:new THREE.PointLight(0xffd894, 0, 9, 2) };
GESTALT.obj.visible = false;
scene.add(GESTALT.obj, GESTALT.gegen);
{
  // Notfigur, bis das Modell da ist
  const put = (w, h, d, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), MAT.schwarz); m.position.y = y; GESTALT.obj.add(m); };
  put(.52,1.25,.30,1.75); put(.40,.34,.30,1.02); put(.16,.30,.16,2.50); put(.30,.40,.30,2.78);
  put(.13,1.05,.13,0.52);
  if(THREE.GLTFLoader){
    new THREE.GLTFLoader().load(A('assets/monster.glb'), gl => {
      const m = gl.scene;
      const box = new THREE.Box3().setFromObject(m), sz = new THREE.Vector3();
      box.getSize(sz); m.scale.setScalar(2.55/(sz.y || 1));
      box.setFromObject(m); m.position.y = -box.min.y;
      m.traverse(o => { if(o.isMesh){ o.material = MAT.schwarz; o.frustumCulled = false; } });
      for(const k of GESTALT.obj.children.slice()) GESTALT.obj.remove(k);
      GESTALT.obj.add(m);
    }, undefined, () => {});
  }
}

/* ======================= Die Kamerafahrt ======================= */
/* Eine Zellenfolge, durch die eine weiche Kurve gelegt wird. Die Kamera
   geht langsam, sieht ein Stück voraus, und biegt lieber geradeaus. */
const WEG = [];
{
  let c = ri(G*G);
  WEG.push(c);
  while(WEG.length < 7) WEG.push(naechsteZelle());
}
function naechsteZelle(){
  const n = WEG.length, c = WEG[n-1], vor = n > 1 ? WEG[n-2] : -1;
  let opt = nachbarn(c).filter(k => k !== vor);
  if(!opt.length) opt = nachbarn(c);
  if(vor >= 0){
    const gerade = c + (c - vor);
    const g = opt.indexOf(gerade);
    if(g >= 0 && Math.random() < 0.62) return opt[g];
  }
  return pick(opt);
}
function kurve(p0, p1, p2, p3, t, aus){
  const t2 = t*t, t3 = t2*t;
  for(const k of ['x', 'z'])
    aus[k] = 0.5*((2*p1[k]) + (-p0[k] + p2[k])*t + (2*p0[k] - 5*p1[k] + 4*p2[k] - p3[k])*t2 + (-p0[k] + 3*p1[k] - 3*p2[k] + p3[k])*t3);
  return aus;
}
const FAHRT = { u:0, gier:0, nick:-0.03, tempo:1.15, bob:0 };
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function punktBei(u, aus){
  let i = Math.floor(u); const t = u - i;
  return kurve(mitte(WEG[i]), mitte(WEG[i+1]), mitte(WEG[i+2]), mitte(WEG[i+3]), t, aus);
}
function fahren(dt, t){
  FAHRT.u += FAHRT.tempo*dt/CS;
  while(FAHRT.u >= 1){ FAHRT.u -= 1; WEG.shift(); WEG.push(naechsteZelle()); }
  punktBei(FAHRT.u, _a);
  punktBei(FAHRT.u + 0.55, _b);
  const ziel = Math.atan2(-(_b.x - _a.x), -(_b.z - _a.z));
  let d = ziel - FAHRT.gier;
  while(d > Math.PI) d -= Math.PI*2;
  while(d < -Math.PI) d += Math.PI*2;
  FAHRT.gier += d*Math.min(dt*1.6, 1);
  FAHRT.bob += dt*FAHRT.tempo*3.3;
  const hand = Math.sin(t*0.37)*0.012 + Math.sin(t*0.91)*0.005;
  camera.position.set(_a.x, 1.62 + Math.sin(FAHRT.bob)*0.018, _a.z);
  camera.rotation.set(FAHRT.nick + Math.sin(t*0.53 + 1.7)*0.01 + Math.sin(FAHRT.bob*0.5)*0.004,
                      FAHRT.gier + hand, Math.cos(FAHRT.bob*0.5)*0.006 - d*0.05);
}
function gestaltTick(dt){
  const G_ = GESTALT;
  if(G_.sichtbar){
    G_.t -= dt;
    G_.obj.lookAt(camera.position.x, 0, camera.position.z);
    const nah = G_.obj.position.distanceTo(_v.set(camera.position.x, 0, camera.position.z));
    if(nah < 6.5 || G_.t <= 0){
      G_.sichtbar = false; G_.obj.visible = false; G_.gegen.intensity = 0;
      if(nah < 6.5){ STOER.ziel = 0.9; tonStoss(); }
      G_.warte = 28 + Math.random()*35;
    }
    return;
  }
  G_.warte -= dt;
  if(G_.warte > 0) return;
  // geradeaus im Gang, so weit wie möglich, aber in Sichtweite
  const c = sichtZelle();
  if(c < 0){ G_.warte = 1.5; return; }
  const p = mitte(c);
  G_.obj.position.set(p.x + (Math.random()-0.5)*0.8, 0, p.z + (Math.random()-0.5)*0.8);
  G_.obj.visible = true; G_.sichtbar = true; G_.t = 7;
  // ein Licht hinter ihr, damit sie als Umriss vor dem Gang steht
  _v.set(p.x - camera.position.x, 0, p.z - camera.position.z).normalize();
  G_.gegen.position.set(G_.obj.position.x + _v.x*1.8, WH - 0.4, G_.obj.position.z + _v.z*1.8);
  G_.gegen.intensity = 4.5;
  STOER.ziel = 0.5;
}
const _v = new THREE.Vector3();
/* Die Zelle am Ende der Geraden, auf die die Kamera gerade zufährt —
   mindestens zwei Zellen weit, sonst steht sie einem gleich im Gesicht. */
function sichtZelle(){
  const a = WEG[1], b = WEG[2];
  const dx = (b % G) - (a % G), dy = ((b/G)|0) - ((a/G)|0);
  let x = a % G, y = (a/G)|0, n = 0, ende = -1;
  while(n < 5){
    const nx = x + dx, ny = y + dy;
    if(!innen(nx, ny) || wandZwischen(x, y, nx, ny)) break;
    x = nx; y = ny; n++;
    if(n >= 2) ende = idx(x, y);
  }
  return ende;
}

/* ======================= Bild: VHS ======================= */
const rt = new THREE.WebGLRenderTarget(640, 360, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter });
rt.texture.encoding = THREE.sRGBEncoding;
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const post = new THREE.ShaderMaterial({
  uniforms:{ tBild:{ value:rt.texture }, uZeit:{ value:0 }, uStoer:{ value:0.05 }, uRausch:{ value:0 },
             uHell:{ value:0 }, uRes:{ value:new THREE.Vector2(640, 360) } },
  vertexShader:'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader:[
    'uniform sampler2D tBild; uniform float uZeit, uStoer, uRausch, uHell; uniform vec2 uRes; varying vec2 vUv;',
    'float r(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233)))*43758.5453); }',
    'void main(){',
    '  vec2 uv = vUv, cc = uv - 0.5;',
    '  uv = 0.5 + cc*(1.0 + 0.32*dot(cc,cc))/(1.0 + 0.32*0.22);',
    '  uv.x += sin(uv.y*88.0 + uZeit*2.4)*0.0011*(1.0 + uStoer*4.0);',
    '  float band = smoothstep(0.045, 0.0, abs(uv.y - fract(uZeit*0.1)));',
    '  uv.x += band*(r(vec2(uv.y, floor(uZeit*30.0))) - 0.5)*0.024*(0.3 + uStoer*1.6);',
    '  float zeile = floor(uv.y*48.0);',
    '  uv.x += step(0.995 - uStoer*0.3, r(vec2(zeile, floor(uZeit*14.0))))*(r(vec2(zeile, uZeit)) - 0.5)*0.15*uStoer;',
    '  float kopf = smoothstep(0.045, 0.0, uv.y);',
    '  uv.x += kopf*(0.01 + 0.03*r(vec2(floor(uv.y*uRes.y*0.5), floor(uZeit*30.0))));',
    '  uv = clamp(uv, 0.002, 0.998);',
    '  float ca = 0.0012 + uStoer*0.006;',
    '  vec3 c = vec3(texture2D(tBild, uv + vec2(ca,0.0)).r, texture2D(tBild, uv).g, texture2D(tBild, uv - vec2(ca,0.0)).b);',
    '  vec3 sm = texture2D(tBild, uv - vec2(3.0/uRes.x, 0.0)).rgb + texture2D(tBild, uv - vec2(6.0/uRes.x, 0.0)).rgb;',
    '  vec3 mi = (c + sm)/3.0;',
    '  c = mix(c, mi + (dot(c, vec3(.299,.587,.114)) - dot(mi, vec3(.299,.587,.114))), 0.7);',
    '  float ly = dot(c, vec3(0.32,0.55,0.13));',
    '  c = pow(max(c - 0.02, 0.0), vec3(1.16));',
    '  float lit = smoothstep(0.006, 0.12, ly), blow = smoothstep(0.72, 0.95, ly);',
    '  c = mix(c, vec3(ly*1.10, ly*0.90, ly*0.40), lit*(1.0 - blow)*0.75);',
    '  c *= 1.0 - 0.07*(0.5 - 0.5*sin(uv.y*uRes.y*3.14159));',
    '  float g1 = r(uv*uRes + fract(uZeit)*91.7) - 0.5, g2 = r(floor(uv*uRes*0.3) + fract(uZeit*0.83)*57.3) - 0.5;',
    '  c += (g1*0.085 + g2*0.075)*(0.45 + 0.95*(1.0 - clamp(ly, 0.0, 1.0)))*1.5;',
    '  c = mix(c, vec3(r(uv*uRes + uZeit*13.1)), kopf*0.3);',
    '  c *= 1.0 - dot(vUv - 0.5, vUv - 0.5)*1.7;',
    '  c = mix(c, vec3(r(uv*uRes*0.7 + uZeit*57.3)), uRausch);',
    '  gl_FragColor = vec4(c*uHell, 1.0);',
    '}'].join('\n'),
  depthTest:false, depthWrite:false
});
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

function groesse(){
  const w = Math.max(320, innerWidth), h = Math.max(240, innerHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w/h; camera.updateProjectionMatrix();
  const rh = QS[qual].h, rw = Math.round(rh*w/h);
  rt.setSize(rw, rh);
  post.uniforms.uRes.value.set(rw, rh);
}
addEventListener('resize', groesse);
addEventListener('orientationchange', () => setTimeout(groesse, 300));
groesse();

/* ======================= Ton ======================= */
/* Röhrenbrummen, Lüftung und ab und zu Musik. Ein Browser lässt Ton erst
   nach der ersten Berührung zu — dann geht es los. */
const TON = { ctx:null, puffer:{}, musik:null, an: lies('ft_music', '1') !== '0' };
function tonLaden(n){
  return fetch(A('flur/ton/' + n + '.mp3')).then(r => r.arrayBuffer())
    .then(b => new Promise((ok, nein) => TON.ctx.decodeAudioData(b, ok, nein)))
    .then(p => (TON.puffer[n] = p)).catch(() => null);
}
function schleife(n, vol){
  const p = TON.puffer[n]; if(!p) return;
  const s = TON.ctx.createBufferSource(); s.buffer = p; s.loop = true;
  s.loopStart = 0.1; s.loopEnd = p.duration - 0.1;
  const g = TON.ctx.createGain(); g.gain.value = vol;
  s.connect(g); g.connect(TON.haupt); s.start(0, 0.1 + Math.random()*Math.max(0, p.duration - 0.3));
}
function einmal(n, vol){
  if(!TON.ctx || !TON.puffer[n]) return;
  const s = TON.ctx.createBufferSource(); s.buffer = TON.puffer[n];
  const g = TON.ctx.createGain(); g.gain.value = vol;
  s.connect(g); g.connect(TON.haupt); s.start();
}
function tonStoss(){ einmal('rauschen', 0.5); einmal(pick(['stich_1', 'stich_2', 'stich_3']), 0.35); }
function tonStart(){
  if(TON.ctx){ if(TON.ctx.state === 'suspended') TON.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  TON.ctx = new AC();
  TON.haupt = TON.ctx.createGain(); TON.haupt.gain.value = 0.9; TON.haupt.connect(TON.ctx.destination);
  tonLaden('summen').then(() => schleife('summen', 0.22));
  tonLaden('luft').then(() => schleife('luft', 0.3));
  for(const n of ['rauschen', 'squelch', 'stich_1', 'stich_2', 'stich_3', 'aufheben']) tonLaden(n);
  musikStarten();
}
function musikStarten(){
  if(!TON.an || TON.musik) return;
  fetch(A('assets/music/tracks.json')).then(r => r.json()).then(j => {
    const liste = (j.tracks || []).filter(t => t && t.file);
    if(!liste.length || !TON.an || TON.musik) return;
    const a = new Audio(A('assets/music/' + pick(liste).file));
    a.loop = true; a.volume = 0.42;
    TON.musik = a;
    try {
      const q = TON.ctx.createMediaElementSource(a), g = TON.ctx.createGain();
      g.gain.value = 0.42; q.connect(g); g.connect(TON.haupt); a.volume = 1;
    } catch(e){}
    const p = a.play(); if(p && p.catch) p.catch(() => {});
  }).catch(() => {});
}
function musikStopp(){ if(TON.musik){ try { TON.musik.pause(); } catch(e){} TON.musik = null; } }
for(const art of ['pointerdown', 'keydown']) addEventListener(art, tonStart, { passive:true });
const klick = () => einmal('aufheben', 0.25);

/* ======================= Menü ======================= */
const TAFELN = ['tEbenen', 'tEinst', 'tDank'];
function tafel(id){
  for(const t of TAFELN) $(t).classList.toggle('offen', t === id);
  $('haupt').classList.toggle('weg', !!id);
}
function hoechsteEbene(){ return EBENEN[2].frei() ? 2 : (EBENEN[1].frei() ? 1 : 0); }
function menueAuffrischen(){
  const h = hoechsteEbene();
  const w = $('mWeiter');
  w.style.display = h > 0 ? '' : 'none';
  w.textContent = 'WEITER · ' + EBENEN[h].nr + ' · ' + EBENEN[h].name;
  const box = $('ebenenListe'); box.innerHTML = '';
  EBENEN.forEach((e, i) => {
    const frei = e.frei();
    const b = document.createElement('button');
    b.className = 'ebene' + (frei ? '' : ' zu');
    b.innerHTML = '<span class="nr">' + e.nr + '</span><span class="nm">' + e.name + '</span><span class="tx">' +
      (frei ? e.text : 'NOCH NICHT GELESEN — ERST ' + EBENEN[i-1].nr + ' ÜBERSTEHEN') + '</span>';
    b.addEventListener('click', () => { if(frei) starten(e.band); else { STOER.ziel = 0.6; einmal('squelch', 0.4); } });
    box.appendChild(b);
  });
  document.querySelectorAll('[data-stufe]').forEach(el => el.classList.toggle('sel', el.dataset.stufe === stufe));
  document.querySelectorAll('[data-qual]').forEach(el => el.classList.toggle('sel', el.dataset.qual === qual));
  $('stufeText').textContent = STUFEN[stufe].text;
  $('bMusik').textContent = 'MUSIK: ' + (TON.an ? 'AN' : 'AUS');
  $('bMusik').classList.toggle('sel', TON.an);
}

let startet = false;
function starten(band){
  if(startet) return;
  startet = true;
  klick();
  einmal('rauschen', 0.6);
  STOER.ziel = 1;
  try {
    sessionStorage.setItem('ft_start', JSON.stringify({ art:'menu' }));
    if(band === 'b0') sessionStorage.setItem('ft_lauf', JSON.stringify({ ab:'b0' }));
    else sessionStorage.removeItem('ft_lauf');
  } catch(e){}
  const e = EBENEN.find(x => x.band === band);
  setTimeout(() => {
    if(window.FT_RAUSCHEN_AN) window.FT_RAUSCHEN_AN(e.nr + ' · ' + e.name);
    musikStopp();
    location.replace('#' + band);          // kein Verlaufseintrag: Zurück führt nicht ins alte Band
  }, 650);
}

$('mNeu').addEventListener('click', () => starten('b0'));
$('mWeiter').addEventListener('click', () => starten(EBENEN[hoechsteEbene()].band));
$('mEbenen').addEventListener('click', () => { klick(); menueAuffrischen(); tafel('tEbenen'); });
$('mEinst').addEventListener('click', () => { klick(); tafel('tEinst'); });
$('mDank').addEventListener('click', () => { klick(); tafel('tDank'); });
document.querySelectorAll('.zurueck').forEach(b => b.addEventListener('click', () => { klick(); tafel(null); }));
document.querySelectorAll('[data-stufe]').forEach(el => el.addEventListener('click', () => { klick(); stufeSetzen(el.dataset.stufe); menueAuffrischen(); }));
document.querySelectorAll('[data-qual]').forEach(el => el.addEventListener('click', () => { klick(); qualSetzen(el.dataset.qual); menueAuffrischen(); }));
$('bMusik').addEventListener('click', () => {
  TON.an = !TON.an; schreib('ft_music', TON.an ? '1' : '0');
  if(TON.an) musikStarten(); else musikStopp();
  menueAuffrischen();
});
{
  const regler = $('empfRegler'), wert = $('empfWert');
  let empf = clamp(parseFloat(lies('ft_empf', '1')) || 1, 0.3, 2.5);
  const zeigen = () => { wert.textContent = empf.toFixed(1).replace('.', ',') + '×'; };
  regler.value = Math.round(empf*100); zeigen();
  regler.addEventListener('input', () => { empf = clamp(regler.value/100, 0.3, 2.5); schreib('ft_empf', String(empf)); zeigen(); });
}
menueAuffrischen();
/* Aus dem Verlauf zurück: der Stand kann sich geändert haben */
addEventListener('pageshow', menueAuffrischen);

/* Zurück-Taste der App: erst die offene Tafel schließen */
window.androidZurueck = () => {
  if(TAFELN.some(t => $(t).classList.contains('offen'))){ tafel(null); return true; }
  return false;
};

/* ======================= Schleife ======================= */
const STOER = { wert:0.05, ziel:0.05 };
const uhr = new THREE.Clock();
let zeit = 0, tcT = 0;
function bild(){
  requestAnimationFrame(bild);
  const dt = Math.min(uhr.getDelta(), 0.05);
  zeit += dt;
  if(document.hidden) return;
  fahren(dt, zeit);
  gestaltTick(dt);
  lichter(dt, zeit);
  STOER.ziel += (0.05 - STOER.ziel)*Math.min(dt*1.5, 1);
  STOER.wert += (STOER.ziel - STOER.wert)*Math.min(dt*8, 1);
  if(Math.random() < 0.004) STOER.wert += 0.4;
  post.uniforms.uZeit.value = zeit;
  post.uniforms.uStoer.value = STOER.wert;
  post.uniforms.uHell.value = Math.min(1, zeit*0.6);
  post.uniforms.uRausch.value = startet ? Math.min(1, post.uniforms.uRausch.value + dt*1.6) : Math.max(0, 0.6 - zeit*0.8);
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
  tcT -= dt;
  if(tcT <= 0){
    tcT = 1/15;
    const s = zeit + 7*3600 + 13*60 + 42.7;
    const z = n => String(n|0).padStart(2, '0');
    $('tc').textContent = z(s/3600) + ':' + z((s/60)%60) + ':' + z(s%60) + ':' + z((s%1)*30);
  }
}
bild();
if(window.FT_RAUSCHEN_AUS) window.FT_RAUSCHEN_AUS(0.9);

/* Prüfhaken */
window.FTM = { FAHRT, WEG, GESTALT, STOER, starten, stufe:() => stufe, qual:() => qual,
  zeigeGestalt(){ GESTALT.warte = 0; } };
