import * as T from 'three';

/* ═══════════════════════════════════════════════════════════════════
   SEGELFLUG

   Ein Segler hat keinen Motor. Sein ganzer Vorrat ist Höhe, und der
   Tausch geht in beide Richtungen: Nase runter macht schnell und kostet
   Höhe, Nase hoch macht langsam und kauft welche. Wer nur geradeaus
   fliegt, sinkt — zurück kommt die Höhe nur über den Aufwinden.

   Das Gelände ist eine Höhenfunktion, kein Modell. Dieselbe Funktion
   baut das Netz und beantwortet später "wie hoch ist der Boden hier" —
   ein zweiter Datensatz für die Berührung würde irgendwann abweichen,
   und dann fliegt man durch einen Berg oder gegen unsichtbare Luft.
   ═══════════════════════════════════════════════════════════════════ */

const $ = s => document.querySelector(s);
const klemm = (v,a,b) => v<a?a:v>b?b:v;
const misch = (a,b,t) => a+(b-a)*t;

const leinwand = $('#szene');
const rnd = new T.WebGLRenderer({canvas:leinwand, antialias:true, powerPreference:'high-performance'});
rnd.setPixelRatio(Math.min(devicePixelRatio||1, 1.5));
rnd.outputColorSpace = T.SRGBColorSpace;
rnd.toneMapping = T.ACESFilmicToneMapping;
rnd.toneMappingExposure = 1.05;

const HIMMEL = 0x8ec5e8;
const szene = new T.Scene();
szene.background = new T.Color(HIMMEL);
szene.fog = new T.Fog(HIMMEL, 220, 780);
const kam = new T.PerspectiveCamera(70, 1.6, 0.5, 1400);

function passeAn(){
  const b = Math.max(2, innerWidth), h = Math.max(2, innerHeight);
  rnd.setSize(b, h, false);
  kam.aspect = b/h; kam.updateProjectionMatrix();
}
addEventListener('resize', passeAn); passeAn();

/* ── Gelände ──────────────────────────────────────────────────────────
   Wertrauschen: ein Gitter aus Zufallszahlen, dazwischen weich
   überblendet, und drei Lagen davon übereinander. Reicht für ein Tal mit
   Graten und kostet nichts — vor allem lässt es sich an jeder Stelle
   direkt ausrechnen, ohne das Netz zu befragen.                        */
const WELT = 1500, RASTER = 150;
function hash(x, z){
  const s = Math.sin(x*127.1 + z*311.7) * 43758.5453;
  return s - Math.floor(s);
}
function rauschen(x, z){
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x-xi, zf = z-zi;
  const u = xf*xf*(3-2*xf), v = zf*zf*(3-2*zf);
  return misch(misch(hash(xi,zi),   hash(xi+1,zi),   u),
               misch(hash(xi,zi+1), hash(xi+1,zi+1), u), v);
}
function hoeheBei(x, z){
  let h = 0, f = 1/260, a = 1;
  for(let i=0;i<4;i++){ h += rauschen(x*f, z*f) * a; f *= 2.1; a *= 0.45; }
  h = (h/1.85 - 0.42);
  /* Ein Tal in der Mitte: die Ränder werden angehoben, damit man in einer
     Schüssel fliegt und nicht über eine endlose Ebene. */
  const d = Math.hypot(x, z) / (WELT*0.5);
  h += Math.pow(klemm(d, 0, 1.4), 2.2) * 0.85;
  return h * 210;
}
function baueGelaende(){
  const g = new T.PlaneGeometry(WELT, WELT, RASTER, RASTER);
  g.rotateX(-Math.PI/2);
  const pos = g.attributes.position;
  const farben = new Float32Array(pos.count*3);
  const c = new T.Color();
  for(let i=0;i<pos.count;i++){
    const x = pos.getX(i), z = pos.getZ(i);
    const y = hoeheBei(x, z);
    pos.setY(i, y);
    // Farbe nach Höhe: Wasser, Ufer, Wiese, Fels, Schnee
    if(y < 2)        c.setHex(0x6f8f5e);
    else if(y < 30)  c.setHex(0x5f8a4c);
    else if(y < 78)  c.setHex(0x4f7a46);
    else if(y < 128) c.setHex(0x6f6f5e);
    else             c.setHex(0xdfe6ea);
    const schatten = 0.86 + rauschen(x*0.05, z*0.05)*0.28;
    farben[i*3] = c.r*schatten; farben[i*3+1] = c.g*schatten; farben[i*3+2] = c.b*schatten;
  }
  g.setAttribute('color', new T.BufferAttribute(farben, 3));
  g.computeVertexNormals();
  const m = new T.Mesh(g, new T.MeshLambertMaterial({vertexColors:true, flatShading:true}));
  szene.add(m);
  // Wasserfläche
  const w = new T.Mesh(new T.PlaneGeometry(WELT*1.4, WELT*1.4),
    new T.MeshLambertMaterial({color:0x3f7fa8, transparent:true, opacity:.85}));
  w.rotation.x = -Math.PI/2; w.position.y = 1.5; szene.add(w);
  return m;
}

/* ── Aufwinde ─────────────────────────────────────────────────────────
   Säulen warmer Luft. Sie stehen über hellen Flecken, damit man sie von
   oben sieht — ein unsichtbarer Aufwind wäre Raten, kein Können.      */
const AUFWINDE = [];
function baueAufwinde(){
  const stellen = [[-260,-180],[120,-300],[330,60],[-120,240],[-380,320],[210,330],[-40,-60],[420,-260]];
  for(const [x,z] of stellen){
    const boden = hoeheBei(x,z);
    /* Radius 52 war kleiner als der Kurvenradius des Seglers: der ist
       Tempo²/(sin(Querlage)·SCHWERE), bei Tempo 45 und voller Schräglage
       rund 71 Einheiten. Man konnte im Aufwind gar nicht kreisen, er hat
       das Sinken nur gebremst. Jetzt passt die Säule um die Kurve. */
    const a = {x, z, r:120, kraft:42, boden};
    AUFWINDE.push(a);
    const scheibe = new T.Mesh(new T.CircleGeometry(a.r, 24),
      new T.MeshBasicMaterial({color:0xffe9a8, transparent:true, opacity:.32}));
    scheibe.rotation.x = -Math.PI/2;
    scheibe.position.set(x, boden + 1.2, z);
    szene.add(scheibe);
    // Ein paar Ringe als Säule, damit man ihn auch von der Seite sieht
    for(let i=1;i<=5;i++){
      const r = new T.Mesh(new T.TorusGeometry(a.r*0.8, 0.9, 6, 20),
        new T.MeshBasicMaterial({color:0xffe9a8, transparent:true, opacity:.16}));
      r.rotation.x = Math.PI/2;
      r.position.set(x, boden + i*34, z);
      szene.add(r); a.ringe = a.ringe || []; a.ringe.push(r);
    }
  }
}

/* ── Ringe ────────────────────────────────────────────────────────── */
const RINGE = [];
function baueRinge(){
  const stellen = [[-160,-120],[60,-260],[280,-40],[140,180],[-90,300],[-330,150],[-420,-60],[380,240]];
  stellen.forEach(([x,z], i) => {
    const y = hoeheBei(x,z) + 70 + (i%3)*26;
    const g = new T.Group();
    const t = new T.Mesh(new T.TorusGeometry(17, 1.9, 8, 28),
      new T.MeshLambertMaterial({color:0xff7a4d, emissive:0x4a1a08}));
    g.add(t);
    const inn = new T.Mesh(new T.TorusGeometry(17, 0.6, 6, 28),
      new T.MeshBasicMaterial({color:0xffd0b8}));
    g.add(inn);
    g.position.set(x, y, z);
    g.rotation.y = (i*1.1) % 3.14;
    szene.add(g);
    RINGE.push({x, y, z, netz:g, torus:t, genommen:false, achse:g.rotation.y});
  });
}

/* ── Der Segler ───────────────────────────────────────────────────── */
let seglerNetz = null;
function baueSegler(){
  const g = new T.Group();
  const weiss = new T.MeshLambertMaterial({color:0xf2f6fa});
  const grau  = new T.MeshLambertMaterial({color:0xb9c6d4});
  const glas  = new T.MeshLambertMaterial({color:0x35506b});
  // Rumpf: vorne dick, hinten dünn
  const rumpf = new T.Mesh(new T.CylinderGeometry(0.9, 0.32, 11, 10), weiss);
  rumpf.rotation.x = Math.PI/2; rumpf.position.z = -1.2; g.add(rumpf);
  const nase = new T.Mesh(new T.SphereGeometry(0.9, 10, 8), weiss);
  nase.position.z = -6.6; nase.scale.z = 1.6; g.add(nase);
  const haube = new T.Mesh(new T.SphereGeometry(0.75, 10, 8), glas);
  haube.position.set(0, 0.5, -4.2); haube.scale.set(1, 0.8, 2.0); g.add(haube);
  // Tragfläche: lang und schmal, das ist der ganze Punkt an einem Segler
  const fluegel = new T.Mesh(new T.BoxGeometry(34, 0.28, 2.4), weiss);
  fluegel.position.set(0, 0.5, -2.2); g.add(fluegel);
  for(const s of [-1,1]){
    const spitze = new T.Mesh(new T.BoxGeometry(5, 0.24, 1.5), grau);
    spitze.position.set(s*18.6, 0.85, -2.2); spitze.rotation.z = s*0.20; g.add(spitze);
  }
  // Leitwerk
  const hoehen = new T.Mesh(new T.BoxGeometry(9, 0.22, 1.5), weiss);
  hoehen.position.set(0, 1.4, 3.6); g.add(hoehen);
  const seiten = new T.Mesh(new T.BoxGeometry(0.22, 3.0, 2.2), weiss);
  seiten.position.set(0, 1.6, 3.9); g.add(seiten);
  szene.add(g); seglerNetz = g;
}
function baueLicht(){
  szene.add(new T.AmbientLight(0xa8c4dc, 1.9));
  szene.add(new T.HemisphereLight(0xbfe0f5, 0x4a5a3a, 1.1));
  const s = new T.DirectionalLight(0xfff2d8, 2.1);
  s.position.set(200, 400, 120); szene.add(s);
  // Wolken als flache Scheiben, billig und von unten überzeugend
  const wolke = new T.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:.75});
  for(let i=0;i<26;i++){
    const w = new T.Group();
    for(let j=0;j<4;j++){
      const s2 = new T.Mesh(new T.SphereGeometry(14 + Math.random()*16, 7, 5), wolke);
      s2.position.set((Math.random()-.5)*46, (Math.random()-.5)*7, (Math.random()-.5)*30);
      s2.scale.y = 0.5; w.add(s2);
    }
    /* Die Wolken lagen bei 250 bis 340 — genau auf Starthöhe. Der erste
       Blick ging dadurch in weißes Mus. Sie gehören über das Flugband. */
    w.position.set((Math.random()-.5)*WELT, 430 + Math.random()*130, (Math.random()-.5)*WELT);
    szene.add(w);
  }
}

/* ── Flugmodell ───────────────────────────────────────────────────────
   Kein echtes Profil, aber die eine Regel, auf die es ankommt: Höhe und
   Geschwindigkeit sind dasselbe Konto. Nase hoch zieht von der
   Geschwindigkeit ab und schreibt der Höhe gut, Nase runter umgekehrt.
   Dazu ein Grundsinken, das nie aufhört — sonst bräuchte man die
   Aufwinde nicht, und die sind das Spiel.                              */
const SCHWERE = 34, SINKEN = 6.4, WIDERSTAND = 0.010,
      TEMPO_MIN = 21, TEMPO_MAX = 92, START_HOEHE = 260;
const fl = {x:0, y:0, z:0, gier:0, nick:0, roll:0, tempo:52, steigen:0};

let laeuft = false, zeit = 0, uhr = 0, ringeDrin = 0, vorbei = false;
const tasten = new Set();
let steuerNick = 0, steuerRoll = 0;

function fliegen(dt){
  // Steuerausschlag aus Tastatur und Finger
  let sn = 0, sr = 0;
  if(tasten.has('KeyW') || tasten.has('ArrowUp'))    sn -= 1;
  if(tasten.has('KeyS') || tasten.has('ArrowDown'))  sn += 1;
  if(tasten.has('KeyA') || tasten.has('ArrowLeft'))  sr -= 1;
  if(tasten.has('KeyD') || tasten.has('ArrowRight')) sr += 1;
  sn += steuerNick; sr += steuerRoll;
  fl.nick = klemm(fl.nick + klemm(sn,-1,1) * 1.5 * dt, -0.95, 0.75);
  fl.roll = klemm(fl.roll + klemm(sr,-1,1) * 2.2 * dt, -1.15, 1.15);
  // ohne Eingabe geht die Lage langsam zurück in die Ruhe
  if(Math.abs(sn) < 0.05) fl.nick -= fl.nick * Math.min(dt*0.7, 1);
  if(Math.abs(sr) < 0.05) fl.roll -= fl.roll * Math.min(dt*1.1, 1);

  /* Kurve kommt aus der Querlage, nicht aus dem Seitenruder: schräg
     gestellt zieht der Auftrieb zur Seite. Je langsamer, desto enger. */
  fl.gier -= Math.sin(fl.roll) * (SCHWERE / Math.max(fl.tempo, 24)) * dt;

  // Höhe gegen Geschwindigkeit
  fl.tempo += (-Math.sin(fl.nick) * SCHWERE - WIDERSTAND * fl.tempo * fl.tempo * 0.1) * dt;
  fl.tempo = klemm(fl.tempo, 8, TEMPO_MAX);
  if(fl.tempo < TEMPO_MIN){          // Strömungsabriss: die Nase fällt von selbst
    fl.nick -= (TEMPO_MIN - fl.tempo) * 0.4 * dt;
    if(!vorbei && Math.random() < dt*2) melde('ZU LANGSAM', 'Nase runter');
  }

  // Aufwind suchen
  let auf = 0;
  for(const a of AUFWINDE){
    const d = Math.hypot(fl.x-a.x, fl.z-a.z);
    if(d < a.r && fl.y < a.boden + 300){
      /* Flacher Abfall zum Rand hin: mit (1 - d/r) trug nur die Mitte,
         und der Segler kreist bauartbedingt weit außen — gemessen 98 von
         120. Er hätte dort fast nichts bekommen. */
      auf = Math.max(auf, a.kraft * (1 - 0.55*d/a.r));
    }
  }
  const vorherY = fl.y;
  const cn = Math.cos(fl.nick);
  fl.x += -Math.sin(fl.gier) * cn * fl.tempo * dt;
  fl.z += -Math.cos(fl.gier) * cn * fl.tempo * dt;
  fl.y += (Math.sin(fl.nick) * fl.tempo - SINKEN + auf) * dt;
  fl.steigen = misch(fl.steigen, (fl.y - vorherY)/Math.max(dt,1e-4), Math.min(dt*3,1));

  // Ringe
  for(const r of RINGE){
    if(r.genommen) continue;
    if(Math.hypot(fl.x-r.x, fl.y-r.y, fl.z-r.z) < 16){
      r.genommen = true; ringeDrin++;
      r.torus.material = new T.MeshLambertMaterial({color:0x6fd08a, emissive:0x0d3a1c});
      melde('RING ' + ringeDrin + ' / ' + RINGE.length,
            ringeDrin === RINGE.length ? 'alle geholt — jetzt landen' : 'weiter');
    }
  }
  // Boden
  const boden = hoeheBei(fl.x, fl.z);
  if(fl.y <= boden + 2.2){
    fl.y = boden + 2.2;
    const sanft = fl.steigen > -9 && Math.abs(fl.roll) < 0.5;
    ende(sanft);
  }
  if(Math.abs(fl.x) > WELT*0.62 || Math.abs(fl.z) > WELT*0.62){
    // sanft zurückdrehen statt hart abbrechen
    const zurueck = Math.atan2(-fl.x, -fl.z);
    let d = ((zurueck - fl.gier + Math.PI*3) % (Math.PI*2)) - Math.PI;
    fl.gier += klemm(d, -0.6*dt, 0.6*dt) * 2;
    if(!vorbei) melde('UMKEHREN', 'das Tal liegt hinter dir');
  }

  if(seglerNetz){
    seglerNetz.position.set(fl.x, fl.y, fl.z);
    seglerNetz.rotation.set(0,0,0);
    seglerNetz.rotateY(fl.gier);
    seglerNetz.rotateX(fl.nick);
    seglerNetz.rotateZ(-fl.roll);
  }
  for(const r of RINGE) if(!r.genommen) r.netz.rotation.z += dt*0.4;
}

function ende(sanft){
  if(vorbei) return;
  vorbei = true; laeuft = false;
  const alle = ringeDrin === RINGE.length;
  $('#endeTitel').textContent = alle ? 'ALLE RINGE' : sanft ? 'GELANDET' : 'AUFGESETZT';
  $('#endeText').textContent =
    (alle ? 'Alle ' + RINGE.length + ' Ringe in ' + zeitText(uhr) + '. '
          : ringeDrin + ' von ' + RINGE.length + ' Ringen in ' + zeitText(uhr) + '. ') +
    (sanft ? 'Sauber runtergekommen.' : 'Das war eher ein Einschlag.');
  $('#ende').classList.remove('weg');
  $('#hud').classList.remove('an');
}

/* ── Eingabe ──────────────────────────────────────────────────────── */
addEventListener('keydown', e => {
  if(!laeuft) return;
  tasten.add(e.code);
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => tasten.delete(e.code));
addEventListener('blur', () => { tasten.clear(); steuerNick = steuerRoll = 0; });

let maus = null;
leinwand.addEventListener('pointerdown', e => {
  if(e.pointerType === 'touch') return;
  maus = {id:e.pointerId, x:e.clientX, y:e.clientY};
  try{ leinwand.setPointerCapture(e.pointerId); }catch(_){}
});
leinwand.addEventListener('pointermove', e => {
  if(!maus || e.pointerId !== maus.id) return;
  steuerRoll = klemm((e.clientX - maus.x)/110, -1, 1);
  steuerNick = klemm((e.clientY - maus.y)/110, -1, 1);
});
for(const art of ['pointerup','pointercancel'])
  leinwand.addEventListener(art, e => {
    if(maus && e.pointerId === maus.id){ maus = null; steuerNick = steuerRoll = 0; }
  });

/* Finger: eine Fläche, keine Knöpfe — der Segler braucht nur zwei Achsen.
   Über TouchEvents, weil die die Stelle des Fingers zuverlässig tragen. */
let finger = null;
function daumenBauen(){
  const stil = document.createElement('style');
  stil.textContent = `
#dmarke{position:fixed; z-index:15; width:96px; height:96px; margin:-48px 0 0 -48px;
  border-radius:50%; border:2px solid #ffffff35; pointer-events:none; display:none}
#dmarke.an{display:block}
#dmarke i{position:absolute; left:50%; top:50%; width:26px; height:26px; margin:-13px 0 0 -13px;
  border-radius:50%; background:#ffffffcc}`;
  document.head.appendChild(stil);
  const m = document.createElement('div');
  m.id = 'dmarke'; m.innerHTML = '<i></i>';
  document.body.appendChild(m);
  const knopf = m.querySelector('i');
  addEventListener('touchstart', e => {
    if(finger) return;
    const t = e.changedTouches[0];
    finger = {id:t.identifier, x:t.clientX, y:t.clientY};
    m.style.left = t.clientX+'px'; m.style.top = t.clientY+'px';
    m.classList.add('an');
    e.preventDefault();
  }, {passive:false});
  addEventListener('touchmove', e => {
    if(!finger) return;
    for(const t of e.changedTouches){
      if(t.identifier !== finger.id) continue;
      e.preventDefault();
      const weit = 44;
      let dx = klemm(t.clientX - finger.x, -weit, weit), dy = klemm(t.clientY - finger.y, -weit, weit);
      knopf.style.transform = `translate(${dx}px,${dy}px)`;
      steuerRoll = dx/weit; steuerNick = dy/weit;
    }
  }, {passive:false});
  for(const art of ['touchend','touchcancel'])
    addEventListener(art, e => {
      if(!finger) return;
      for(const t of e.changedTouches){
        if(t.identifier !== finger.id) continue;
        finger = null; steuerNick = steuerRoll = 0;
        m.classList.remove('an'); knopf.style.transform = 'translate(0,0)';
      }
    }, {passive:false});
}

/* ── Anzeige ──────────────────────────────────────────────────────── */
const meldEl = {kasten:$('#meldung'), gross:$('#meldung b'), klein:$('#meldung small')};
let meldUhr = 0;
function melde(gross, klein){
  meldEl.gross.textContent = gross; meldEl.klein.textContent = klein || '';
  meldEl.kasten.classList.add('an'); meldUhr = 1.8;
}
const zeitText = s => Math.floor(s/60) + ':' + String(Math.floor(s%60)).padStart(2,'0');
function anzeige(){
  $('#ringKarte b').textContent = ringeDrin + ' / ' + RINGE.length;
  $('#zeitKarte b').textContent = zeitText(uhr);
  $('#tempo b').textContent = Math.round(fl.tempo * 3.0);
  const ueber = Math.round(fl.y - hoeheBei(fl.x, fl.z));
  const hk = $('#hoeheKarte b');
  hk.textContent = Math.max(0, ueber);
  hk.classList.toggle('tief', ueber < 45);
  const st = $('#steig b');
  st.textContent = (fl.steigen >= 0 ? '+' : '') + fl.steigen.toFixed(1);
  st.classList.toggle('auf', fl.steigen > 0.6);
  st.classList.toggle('ab', fl.steigen < -0.6);
  // Der Horizont kippt mit der Querlage — billige, aber wirksame Rückmeldung
  $('#horizont').style.transform = `rotate(${(-fl.roll*40).toFixed(1)}deg)`;
}
/* Kamera hinter dem Segler, mit Nachlauf: hart angeheftet wirkt jede
   Kurve wie ein Ruck, und man sieht nicht, wie schräg man liegt. */
const kamZiel = new T.Vector3();
function kameraStellen(dt){
  const abstand = 24 + fl.tempo*0.16, hoehe = 7.5;
  const hinter = new T.Vector3(
    fl.x + Math.sin(fl.gier) * abstand,
    fl.y + hoehe - Math.sin(fl.nick)*10,
    fl.z + Math.cos(fl.gier) * abstand);
  const boden = hoeheBei(hinter.x, hinter.z) + 4;
  if(hinter.y < boden) hinter.y = boden;
  kam.position.lerp(hinter, Math.min(dt*3.4, 1));
  kamZiel.set(fl.x, fl.y + 1.5, fl.z);
  kam.lookAt(kamZiel);
  kam.rotation.z += -fl.roll * 0.35;      // Kameraneigung deutet die Querlage an
}

/* ── Schleife ─────────────────────────────────────────────────────── */
let vorher = 0;
function schleife(t){
  requestAnimationFrame(schleife);
  const dt = Math.min(0.04, (t - vorher)/1000 || 0);
  vorher = t;
  zeit += dt;
  if(laeuft){
    uhr += dt;
    fliegen(dt);
    if(meldUhr > 0){ meldUhr -= dt; if(meldUhr <= 0) meldEl.kasten.classList.remove('an'); }
    anzeige();
  }
  kameraStellen(dt);
  rnd.render(szene, kam);
}

/* ── Start ────────────────────────────────────────────────────────── */
let gebaut = false;
function starten(){
  $('#start').classList.add('weg'); $('#ende').classList.add('weg');
  $('#hud').classList.add('an');
  if(!gebaut){
    baueGelaende(); baueAufwinde(); baueRinge(); baueSegler(); baueLicht(); daumenBauen();
    gebaut = true;
  }
  for(const r of RINGE){
    r.genommen = false;
    r.torus.material = new T.MeshLambertMaterial({color:0xff7a4d, emissive:0x4a1a08});
  }
  ringeDrin = 0; uhr = 0; vorbei = false;
  fl.x = 0; fl.z = 220; fl.y = hoeheBei(0, 220) + START_HOEHE;
  fl.gier = Math.PI; fl.nick = -0.06; fl.roll = 0; fl.tempo = 54; fl.steigen = 0;
  steuerNick = steuerRoll = 0; tasten.clear();
  kam.position.set(fl.x, fl.y + 8, fl.z + 26);
  laeuft = true;
  melde('AUSGEKLINKT', 'Aufwinde sind die hellen Flecken');
}
$('#losKnopf').addEventListener('click', starten);
$('#nochmal').addEventListener('click', starten);
requestAnimationFrame(t => { vorher = t; requestAnimationFrame(schleife); });

window.__segeln = {
  get fl(){return fl}, get laeuft(){return laeuft}, get ringe(){return RINGE},
  get ringeDrin(){return ringeDrin}, get vorbei(){return vorbei}, get uhr(){return uhr},
  AUFWINDE, hoeheBei, starten,
  setzeSteuer: (n, r) => { steuerNick = n; steuerRoll = r; },
  SINKEN, SCHWERE, TEMPO_MIN, TEMPO_MAX
};
