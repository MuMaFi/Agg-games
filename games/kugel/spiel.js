import * as T from 'three';

/* ═══════════════════════════════════════════════════════════════════
   KUGELBAHN

   Eine Kugel auf schwebenden Platten. Gesteuert wird nicht die Kugel,
   sondern die Kraft auf sie — sie rollt weiter, auch wenn man aufhört
   zu drücken. Daraus kommt das ganze Spiel: jede Kurve muss man vorher
   bremsen, jeder Sprung vorher ansetzen.

   Die Physik ist Kugel gegen achsenparallele Kästen. Für eine Bahn aus
   Platten reicht das genau: nächsten Punkt auf dem Kasten suchen, bei
   Überschneidung herausschieben, Geschwindigkeit an der Normalen
   spiegeln. Keine Physikbibliothek, keine Drehmomente — die Kugel dreht
   sich nur fürs Auge.
   ═══════════════════════════════════════════════════════════════════ */

const $ = s => document.querySelector(s);
const klemm = (v,a,b) => v<a?a:v>b?b:v;
const zuf = (a,b) => a + Math.random()*(b-a);

const leinwand = $('#szene');
const rnd = new T.WebGLRenderer({canvas:leinwand, antialias:true, powerPreference:'high-performance'});
rnd.setPixelRatio(Math.min(devicePixelRatio||1, 1.75));
rnd.outputColorSpace = T.SRGBColorSpace;
rnd.toneMapping = T.ACESFilmicToneMapping;
rnd.toneMappingExposure = 1.15;

const szene = new T.Scene();
szene.background = new T.Color(0x0e1220);
szene.fog = new T.Fog(0x0e1220, 60, 190);
const kam = new T.PerspectiveCamera(64, 1.6, 0.1, 400);

function passeAn(){
  const b = Math.max(2, innerWidth), h = Math.max(2, innerHeight);
  rnd.setSize(b, h, false);
  kam.aspect = b/h; kam.updateProjectionMatrix();
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
const texPlatte = malTextur(64,64,(g,b,h)=>{
  g.fillStyle='#39456a'; g.fillRect(0,0,b,h);
  g.fillStyle='#2f3a5c';
  for(let y=0;y<h;y+=16) for(let x=(y/16%2)*16;x<b;x+=32) g.fillRect(x+1,y+1,30,14);
  g.fillStyle='rgba(255,255,255,.05)'; g.fillRect(0,0,b,2);
}, [1,1]);

const M = {
  platte: new T.MeshLambertMaterial({map:texPlatte}),
  rand:   new T.MeshLambertMaterial({color:0x1d2540}),
  tempo:  new T.MeshBasicMaterial({color:0xffd75e}),
  feder:  new T.MeshBasicMaterial({color:0x8f6ee0}),
  kugel:  new T.MeshStandardMaterial({color:0xffd75e, roughness:.35, metalness:.35}),
  ring:   new T.MeshBasicMaterial({color:0x4fd08a}),
  ringAus:new T.MeshBasicMaterial({color:0x3d4c6b}),
  ziel:   new T.MeshBasicMaterial({color:0x4fd08a})
};

/* ── Die Bahnen ───────────────────────────────────────────────────────
   Eine Platte ist {x,y,z,b,t} — Mitte, Breite, Tiefe; die Dicke ist
   überall gleich. `art` macht daraus ein Tempo- oder Federfeld, `fahrt`
   lässt sie zwischen zwei Punkten pendeln. Ringe sind Zwischenstände,
   der letzte ist das Ziel.                                            */
const DICKE = 0.6;
const BAHNEN = [
  { name:'Anfang', platten:[
      {x:0,   y:0, z:0,   b:8,  t:8},
      {x:0,   y:0, z:-11, b:5,  t:9},
      {x:0,   y:0, z:-21, b:5,  t:6, art:'tempo'},
      {x:0,   y:0, z:-31, b:5,  t:8},
      {x:7,   y:0, z:-39, b:9,  t:5},
      {x:16,  y:0, z:-39, b:6,  t:6},
      {x:16,  y:0, z:-49, b:7,  t:8}],
    ringe:[{x:0,y:1,z:-21}], ziel:{x:16,y:1,z:-49} },

  { name:'Sprünge', platten:[
      {x:0,  y:0, z:0,   b:8, t:8},
      {x:0,  y:0, z:-11, b:4, t:5, art:'feder'},
      {x:0,  y:6, z:-24, b:5, t:5},
      {x:0,  y:6, z:-33, b:4, t:4},
      {x:-8, y:6, z:-40, b:4, t:4, art:'tempo'},
      {x:-8, y:6, z:-52, b:5, t:7},
      {x:-8, y:0, z:-62, b:9, t:6},
      {x:0,  y:0, z:-70, b:7, t:7}],
    ringe:[{x:0,y:7,z:-24},{x:-8,y:7,z:-52}], ziel:{x:0,y:1,z:-70} },

  { name:'Fahrt', platten:[
      {x:0,  y:0, z:0,   b:8, t:8},
      {x:0,  y:0, z:-12, b:5, t:5, fahrt:{achse:'x', weite:9, takt:5}},
      {x:0,  y:0, z:-24, b:6, t:6},
      {x:0,  y:0, z:-36, b:5, t:5, fahrt:{achse:'x', weite:11, takt:4, phase:1.6}},
      {x:0,  y:0, z:-48, b:5, t:5, fahrt:{achse:'y', weite:5, takt:6}},
      {x:0,  y:0, z:-60, b:9, t:8}],
    ringe:[{x:0,y:1,z:-24}], ziel:{x:0,y:1,z:-60} },

  { name:'Zickzack', platten:[
      {x:0,   y:0, z:0,   b:7, t:7},
      {x:0,   y:0, z:-10, b:3.4, t:12},
      {x:6,   y:0, z:-17, b:12, t:3.4, art:'tempo'},
      {x:13,  y:0, z:-24, b:3.4, t:12},
      {x:13,  y:0, z:-33, b:5, t:5, art:'feder'},
      {x:13,  y:7, z:-45, b:4, t:8},
      {x:5,   y:7, z:-51, b:12, t:3.4},
      {x:-3,  y:7, z:-58, b:3.4, t:11},
      {x:-3,  y:7, z:-68, b:8, t:7}],
    ringe:[{x:6,y:1,z:-17},{x:13,y:8,z:-45}], ziel:{x:-3,y:8,z:-68} }
];

/* ── Aufbau ───────────────────────────────────────────────────────── */
let platten = [], ringNetze = [], zielNetz = null, kugelNetz = null;
const bahnGruppe = new T.Group(); szene.add(bahnGruppe);

function baueBahn(nr){
  bahnGruppe.clear(); platten = []; ringNetze = [];
  const B = BAHNEN[nr];
  for(const p of B.platten){
    const m = new T.Mesh(new T.BoxGeometry(p.b, DICKE, p.t),
      p.art === 'tempo' ? M.tempo : p.art === 'feder' ? M.feder : M.platte);
    m.position.set(p.x, p.y, p.z);
    bahnGruppe.add(m);
    // Kante ringsum, damit man die Höhe sieht
    const k = new T.Mesh(new T.BoxGeometry(p.b+0.3, 0.18, p.t+0.3), M.rand);
    k.position.set(p.x, p.y - DICKE/2 - 0.08, p.z);
    bahnGruppe.add(k);
    platten.push({...p, netz:m, kante:k, grundX:p.x, grundY:p.y, vx:0, vy:0});
  }
  for(const r of B.ringe){
    const m = new T.Mesh(new T.TorusGeometry(1.5, 0.16, 8, 20), M.ringAus);
    m.position.set(r.x, r.y + 1.4, r.z); m.rotation.x = Math.PI/2;
    bahnGruppe.add(m); ringNetze.push({netz:m, ...r, genommen:false});
  }
  const z = new T.Mesh(new T.TorusGeometry(2.0, 0.22, 8, 24), M.ziel);
  z.position.set(B.ziel.x, B.ziel.y + 1.9, B.ziel.z); z.rotation.x = Math.PI/2;
  bahnGruppe.add(z); zielNetz = z;
}
function baueKugel(){
  kugelNetz = new T.Mesh(new T.SphereGeometry(0.45, 20, 14), M.kugel);
  szene.add(kugelNetz);
  const l = new T.PointLight(0xffe9a8, 8, 14, 1.6);
  kugelNetz.add(l);
}
function baueLicht(){
  szene.add(new T.AmbientLight(0x5b6a92, 1.5));
  szene.add(new T.HemisphereLight(0x9fb4e0, 0x161d30, 1.0));
  const s = new T.DirectionalLight(0xfff0d8, 1.8);
  s.position.set(12, 26, 8); szene.add(s);
  // Sterne, damit die Leere Tiefe bekommt
  const g = new T.BufferGeometry();
  const n = 700, pos = new Float32Array(n*3);
  for(let i=0;i<n;i++){
    const r = zuf(110, 260), a = zuf(0, 6.283), b = Math.acos(zuf(-1,1));
    pos[i*3]   = Math.sin(b)*Math.cos(a)*r;
    pos[i*3+1] = Math.cos(b)*r*0.6 + 20;
    pos[i*3+2] = Math.sin(b)*Math.sin(a)*r;
  }
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  szene.add(new T.Points(g, new T.PointsMaterial({color:0x9fb0d8, size:1.1, sizeAttenuation:false})));
}

/* ── Die Kugel ────────────────────────────────────────────────────────
   Kugel gegen Kasten: den nächsten Punkt auf dem Kasten suchen; liegt er
   näher als der Radius, entlang der Verbindung herausschieben und die
   Geschwindigkeit an dieser Richtung spiegeln. Reibung greift nur längs
   der Fläche, sonst klebt die Kugel an Wänden fest.                    */
const R = 0.45, SCHWERE = 22, KRAFT = 30, LUFTKRAFT = 9,
      REIBUNG = 2.4, TEMPO_MAX = 15, SPRUNG = 8.6, ABPRALL = 0.28,
      FEDER = 14, TEMPOFELD = 26;
const ku = {x:0, y:2, z:0, vx:0, vy:0, vz:0, boden:false, letzterBoden:0};

function stossen(dt){
  ku.boden = false;
  for(const p of platten){
    const hx = p.b/2, hy = DICKE/2, hz = p.t/2;
    const nx = klemm(ku.x, p.x-hx, p.x+hx);
    const ny = klemm(ku.y, p.y-hy, p.y+hy);
    const nz = klemm(ku.z, p.z-hz, p.z+hz);
    let dx = ku.x-nx, dy = ku.y-ny, dz = ku.z-nz;
    let d = Math.hypot(dx, dy, dz);
    if(d >= R) continue;
    if(d < 1e-6){ dy = 1; d = 1; dx = dz = 0; }      // Mittelpunkt genau auf der Fläche
    const ex = dx/d, ey = dy/d, ez = dz/d;
    const raus = R - d;
    ku.x += ex*raus; ku.y += ey*raus; ku.z += ez*raus;
    const laengs = ku.vx*ex + ku.vy*ey + ku.vz*ez;
    if(laengs < 0){
      ku.vx -= (1+ABPRALL)*laengs*ex;
      ku.vy -= (1+ABPRALL)*laengs*ey;
      ku.vz -= (1+ABPRALL)*laengs*ez;
    }
    if(ey > 0.55){
      ku.boden = true; ku.letzterBoden = zeit;
      // Platte trägt die Kugel mit
      ku.x += p.vx*dt; ku.y += p.vy*dt;
      if(p.art === 'tempo'){
        const l = Math.hypot(ku.vx, ku.vz) || 1;
        ku.vx += ku.vx/l * TEMPOFELD * dt;
        ku.vz += ku.vz/l * TEMPOFELD * dt;
      }
      if(p.art === 'feder' && ku.vy < FEDER*0.6){ ku.vy = FEDER; melde('SCHWUNG', ''); }
      const daempf = Math.pow(0.0035, dt*(REIBUNG/2.4));
      ku.vx *= daempf; ku.vz *= daempf;
    }
  }
}
function plattenFahren(dt){
  for(const p of platten){
    if(!p.fahrt) continue;
    const f = p.fahrt;
    const w = Math.sin((zeit + (f.phase||0)) * (6.283/f.takt)) * f.weite/2;
    const alt = f.achse === 'y' ? p.netz.position.y : p.netz.position.x;
    const neu = (f.achse === 'y' ? p.grundY : p.grundX) + w;
    const v = (neu - alt)/Math.max(dt, 1e-4);
    if(f.achse === 'y'){ p.y = neu; p.vy = v; p.vx = 0; }
    else { p.x = neu; p.vx = v; p.vy = 0; }
    p.netz.position[f.achse] = neu;
    p.kante.position[f.achse] = neu - (f.achse === 'y' ? DICKE/2 + 0.08 : 0);
  }
}

/* ── Eingabe ──────────────────────────────────────────────────────── */
const tasten = new Set();
let kamGier = 0, zieher = null;
addEventListener('keydown', e => {
  if(!laeuft) return;
  tasten.add(e.code);
  if(e.code === 'Space'){ springen(); e.preventDefault(); }
  if(e.code === 'KeyR') zumRing();
});
addEventListener('keyup', e => tasten.delete(e.code));
addEventListener('blur', () => tasten.clear());
leinwand.addEventListener('pointerdown', e => {
  if(e.pointerType === 'touch') return;               // Finger macht die Daumenebene
  zieher = {id:e.pointerId, x:e.clientX};
  try{ leinwand.setPointerCapture(e.pointerId); }catch(_){}
});
leinwand.addEventListener('pointermove', e => {
  if(!zieher || e.pointerId !== zieher.id) return;
  kamGier -= (e.clientX - zieher.x) * 0.006;
  zieher.x = e.clientX;
});
for(const art of ['pointerup','pointercancel'])
  leinwand.addEventListener(art, e => { if(zieher && e.pointerId === zieher.id) zieher = null; });

/* Berührung über TouchEvents, nicht über Zeiger: die tragen die Stelle
   des einzelnen Fingers zuverlässig und bringen seine Kennung mit. */
const daumen = {aktiv:false, knueppel:{x:0,y:0}, stiel:null, blick:null};
function daumenBauen(){
  const stil = document.createElement('style');
  stil.textContent = `
#daumen{position:fixed; inset:0; z-index:15; pointer-events:none; display:none; touch-action:none}
#daumen.an{display:block}
@media (hover:none) and (pointer:coarse){ #daumen{display:block} }
#dstab{position:absolute; width:118px; height:118px; margin:-59px 0 0 -59px; border-radius:50%;
  border:2px solid #ffffff2e; background:#0e122055; display:none}
#dstab.an{display:block}
#dstab i{position:absolute; left:50%; top:50%; width:50px; height:50px; margin:-25px 0 0 -25px;
  border-radius:50%; background:#ffffffcc}
#dspring{position:absolute; right:calc(16px + env(safe-area-inset-right,0px));
  bottom:calc(18px + env(safe-area-inset-bottom,0px)); width:86px; height:86px; border-radius:50%;
  border:2px solid #ffd75e66; background:#161d30cc; color:#ffd75e; font-family:inherit;
  font-size:12px; font-weight:700; pointer-events:auto; touch-action:none}
#dspring:active{transform:scale(.93); background:#ffd75e44}
@media (max-height:430px){ #dspring{width:72px;height:72px} }`;
  document.head.appendChild(stil);
  const w = document.createElement('div');
  w.id = 'daumen';
  w.innerHTML = '<div id="dstab"><i></i></div><button type="button" id="dspring">SPRUNG</button>';
  document.body.appendChild(w);
  const stab = w.querySelector('#dstab'), knopf = stab.querySelector('i');
  const wecken = () => { if(!daumen.aktiv){ daumen.aktiv = true; w.classList.add('an'); } };
  w.querySelector('#dspring').addEventListener('pointerdown', e => {
    e.preventDefault(); wecken(); springen();
  });
  addEventListener('touchstart', e => {
    for(const t of e.changedTouches){
      if(t.target.closest && t.target.closest('#dspring')) continue;
      wecken();
      if(t.clientX < innerWidth*0.5){
        if(daumen.stiel) continue;
        daumen.stiel = {id:t.identifier, x:t.clientX, y:t.clientY};
        stab.style.left = t.clientX+'px'; stab.style.top = t.clientY+'px';
        stab.classList.add('an');
      } else {
        if(daumen.blick) continue;
        daumen.blick = {id:t.identifier, x:t.clientX};
      }
      e.preventDefault();
    }
  }, {passive:false});
  addEventListener('touchmove', e => {
    for(const t of e.changedTouches){
      if(daumen.stiel && t.identifier === daumen.stiel.id){
        e.preventDefault();
        const weit = 48;
        let dx = t.clientX - daumen.stiel.x, dy = t.clientY - daumen.stiel.y;
        const l = Math.hypot(dx,dy);
        if(l > weit){ dx = dx/l*weit; dy = dy/l*weit; }
        knopf.style.transform = `translate(${dx}px,${dy}px)`;
        daumen.knueppel.x = dx/weit; daumen.knueppel.y = dy/weit;
      } else if(daumen.blick && t.identifier === daumen.blick.id){
        e.preventDefault();
        kamGier -= (t.clientX - daumen.blick.x) * 0.007;
        daumen.blick.x = t.clientX;
      }
    }
  }, {passive:false});
  for(const art of ['touchend','touchcancel'])
    addEventListener(art, e => {
      for(const t of e.changedTouches){
        if(daumen.stiel && t.identifier === daumen.stiel.id){
          daumen.stiel = null; stab.classList.remove('an');
          daumen.knueppel.x = daumen.knueppel.y = 0;
          knopf.style.transform = 'translate(0,0)';
        } else if(daumen.blick && t.identifier === daumen.blick.id) daumen.blick = null;
      }
    }, {passive:false});
}
function springen(){
  /* Kurze Gnadenfrist nach dem Verlassen der Kante: ohne sie fühlt sich
     jeder Sprung an, als hätte das Spiel den Druck verschluckt. */
  if(zeit - ku.letzterBoden < 0.12){ ku.vy = SPRUNG; ku.letzterBoden = -9; }
}

/* ── Zustand ──────────────────────────────────────────────────────── */
let laeuft = false, zeit = 0, uhr = 0, bahnNr = 0, imZiel = false;
let startPunkt = {x:0, y:2.5, z:0};
const best = JSON.parse(localStorage.getItem('kugelbahn.best') || '{}');
const meldEl = {kasten:$('#meldung'), gross:$('#meldung b'), klein:$('#meldung small')};
let meldUhr = 0;
function melde(gross, klein){
  meldEl.gross.textContent = gross; meldEl.klein.textContent = klein || '';
  meldEl.kasten.classList.add('an'); meldUhr = 1.6;
}
const zeitText = s => Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0') +
                      '.' + Math.floor((s%1)*10);

function neu(nr){
  bahnNr = nr; imZiel = false;
  baueBahn(nr);
  const p0 = BAHNEN[nr].platten[0];
  startPunkt = {x:p0.x, y:p0.y + 2.2, z:p0.z};
  zumStart();
  uhr = 0;
  $('#bahnKarte b').textContent = (nr+1);
  const b = best[nr];
  $('#bestKarte b').textContent = b ? zeitText(b) : '—';
  melde(BAHNEN[nr].name, 'Bahn ' + (nr+1));
}
function zumStart(){
  ku.x = startPunkt.x; ku.y = startPunkt.y; ku.z = startPunkt.z;
  ku.vx = ku.vy = ku.vz = 0;
  kamGier = 0;
}
function zumRing(){
  // letzter genommener Ring, sonst der Anfang
  let ziel = startPunkt;
  for(const r of ringNetze) if(r.genommen) ziel = {x:r.x, y:r.y + 2.0, z:r.z};
  ku.x = ziel.x; ku.y = ziel.y; ku.z = ziel.z;
  ku.vx = ku.vy = ku.vz = 0;
}

/* ── Ablauf ───────────────────────────────────────────────────────── */
function schritt(dt){
  zeit += dt;
  if(!imZiel) uhr += dt;
  plattenFahren(dt);

  // Kraft in Blickrichtung der Kamera
  let vor = 0, quer = 0;
  if(tasten.has('KeyW') || tasten.has('ArrowUp'))    vor += 1;
  if(tasten.has('KeyS') || tasten.has('ArrowDown'))  vor -= 1;
  if(tasten.has('KeyA') || tasten.has('ArrowLeft'))  quer -= 1;
  if(tasten.has('KeyD') || tasten.has('ArrowRight')) quer += 1;
  if(daumen.knueppel.x || daumen.knueppel.y){ quer += daumen.knueppel.x; vor -= daumen.knueppel.y; }
  const l = Math.hypot(vor, quer);
  if(l > 1){ vor /= l; quer /= l; }
  const sin = Math.sin(kamGier), cos = Math.cos(kamGier);
  const kraft = (ku.boden ? KRAFT : LUFTKRAFT) * dt;
  ku.vx += (-sin*vor + cos*quer) * kraft;
  ku.vz += (-cos*vor - sin*quer) * kraft;
  const waag = Math.hypot(ku.vx, ku.vz);
  if(waag > TEMPO_MAX){ ku.vx *= TEMPO_MAX/waag; ku.vz *= TEMPO_MAX/waag; }

  ku.vy -= SCHWERE*dt;
  ku.x += ku.vx*dt; ku.y += ku.vy*dt; ku.z += ku.vz*dt;
  stossen(dt);

  // Ringe einsammeln
  for(const r of ringNetze){
    if(r.genommen) continue;
    if(Math.hypot(ku.x-r.x, ku.y-(r.y+1.4), ku.z-r.z) < 2.0){
      r.genommen = true; r.netz.material = M.ring;
      melde('RING', 'von hier geht es weiter');
    }
  }
  // Ziel
  const Z = BAHNEN[bahnNr].ziel;
  if(!imZiel && Math.hypot(ku.x-Z.x, ku.y-(Z.y+1.9), ku.z-Z.z) < 2.4){
    imZiel = true;
    const alt = best[bahnNr];
    if(!alt || uhr < alt){ best[bahnNr] = uhr; localStorage.setItem('kugelbahn.best', JSON.stringify(best)); }
    zielGeschafft(!alt || uhr < alt);
  }
  // heruntergefallen
  if(ku.y < -26){ zumRing(); melde('DANEBEN', 'zurück zum letzten Ring'); }

  if(kugelNetz){
    kugelNetz.position.set(ku.x, ku.y, ku.z);
    // Drehung nur fürs Auge: so weit, wie die Kugel gerollt wäre
    kugelNetz.rotation.x += ku.vz/R * dt;
    kugelNetz.rotation.z -= ku.vx/R * dt;
  }
  if(zielNetz){ zielNetz.rotation.z += dt*1.2; }
  for(const r of ringNetze) r.netz.rotation.z += dt*0.7;
}
function zielGeschafft(bestzeit){
  laeuft = false;
  $('#endeTitel').textContent = bestzeit ? 'BESTZEIT' : 'IM ZIEL';
  $('#endeText').textContent = BAHNEN[bahnNr].name + ' in ' + zeitText(uhr) +
    (bestzeit ? ' — das ist deine beste.' : ' · beste: ' + zeitText(best[bahnNr]));
  bahnKnoepfe($('#bahnen2'));
  $('#ende').classList.remove('weg');
  $('#hud').classList.remove('an');
}
function kameraStellen(dt){
  const abstand = 9, hoehe = 4.6;
  const ziel = new T.Vector3(
    ku.x + Math.sin(kamGier)*abstand,
    ku.y + hoehe,
    ku.z + Math.cos(kamGier)*abstand);
  kam.position.lerp(ziel, Math.min(dt*6, 1));
  kam.lookAt(ku.x, ku.y + 0.8, ku.z);
}
function anzeige(){
  $('#zeitKarte b').textContent = zeitText(uhr);
}

/* ── Bahnwahl ─────────────────────────────────────────────────────── */
let gewaehlt = 0;
function bahnKnoepfe(wo){
  wo.innerHTML = '';
  BAHNEN.forEach((B, i) => {
    const b = document.createElement('button');
    b.className = 'bahn' + (i === gewaehlt ? ' gewaehlt' : '');
    b.innerHTML = B.name + '<small>' + (best[i] ? zeitText(best[i]) : 'noch nie') + '</small>';
    b.addEventListener('click', () => { gewaehlt = i; bahnKnoepfe(wo); });
    wo.appendChild(b);
  });
}

/* ── Schleife ─────────────────────────────────────────────────────── */
let vorher = 0;
function schleife(t){
  requestAnimationFrame(schleife);
  const dt = Math.min(0.04, (t - vorher)/1000 || 0);
  vorher = t;
  if(laeuft){
    schritt(dt);
    if(meldUhr > 0){ meldUhr -= dt; if(meldUhr <= 0) meldEl.kasten.classList.remove('an'); }
    anzeige();
  }
  kameraStellen(dt);
  rnd.render(szene, kam);
}
function starten(){
  $('#start').classList.add('weg'); $('#ende').classList.add('weg');
  $('#hud').classList.add('an');
  if(!kugelNetz){ baueKugel(); baueLicht(); daumenBauen(); }
  neu(gewaehlt);
  laeuft = true;
}
$('#losKnopf').addEventListener('click', starten);
$('#nochmal').addEventListener('click', starten);
bahnKnoepfe($('#bahnen'));
requestAnimationFrame(t => { vorher = t; requestAnimationFrame(schleife); });

window.__kugel = {
  get ku(){return ku}, get zeit(){return uhr}, get laeuft(){return laeuft},
  get bahnNr(){return bahnNr}, get imZiel(){return imZiel}, get ringe(){return ringNetze},
  BAHNEN, platten: () => platten, starten, neu, zumStart, zumRing, springen,
  setzeBahn: n => { gewaehlt = n; }, best,
  SPRUNG, SCHWERE, TEMPO_MAX
};
