/* ═══════════════════════════════════════════════════════════════════
   BLECHSCHADEN — Draufsicht-Städter im Aufbau von GTA 2.
   Alles in einer Ebene: die Stadt ist einmal auf eine Leinwand
   gebrannt, darüber laufen Fahrzeuge, Leute, Polizei und Kugeln.
   ═══════════════════════════════════════════════════════════════════ */
import { baueStadt, aufStrasse, zufall, STRASSE, GEHWEG } from './stadt.js';
import { malStadt } from './zeichnen.js';
import { MISSIONEN } from './missionen.js';

const $ = s => document.querySelector(s);
const klemm = (v,a,b) => v<a?a:v>b?b:v;
const misch = (a,b,t) => a+(b-a)*t;
const laenge = (x,y) => Math.hypot(x,y);
const winkelDiff = (a,b) => { let d=a-b; while(d>Math.PI)d-=Math.PI*2; while(d<-Math.PI)d+=Math.PI*2; return d; };

/* ── Leinwand ──────────────────────────────────────────────────── */
const leinwand = document.createElement('canvas');
$('#buehne').appendChild(leinwand);
const g = leinwand.getContext('2d');
let BB = 1280, BH = 720, DPR = 1;
function passeAn(){
  DPR = Math.min(devicePixelRatio || 1, 2);
  BB = innerWidth; BH = innerHeight;
  leinwand.width = Math.round(BB*DPR); leinwand.height = Math.round(BH*DPR);
  leinwand.style.width = BB+'px'; leinwand.style.height = BH+'px';
}
addEventListener('resize', passeAn); passeAn();

/* ── Welt ──────────────────────────────────────────────────────── */
const stadt = baueStadt();
let stadtBild = null;
const z = zufall(4711);

/* Häuser in ein Raster einsortieren, damit die Stoßprüfung billig bleibt */
const RASTER = 160;
const rasterBreite = Math.ceil(stadt.breite/RASTER), rasterHoehe = Math.ceil(stadt.hoehe/RASTER);
const hausRaster = Array.from({length: rasterBreite*rasterHoehe}, () => []);
for(const b of stadt.gebaeude){
  const i0 = Math.floor(b.x/RASTER), i1 = Math.floor((b.x+b.w)/RASTER);
  const j0 = Math.floor(b.y/RASTER), j1 = Math.floor((b.y+b.h)/RASTER);
  for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){
    const k = j*rasterBreite+i;
    if(k>=0 && k<hausRaster.length) hausRaster[k].push(b);
  }
}
function haeuserNah(x,y,r){
  const i0=Math.floor((x-r)/RASTER), i1=Math.floor((x+r)/RASTER);
  const j0=Math.floor((y-r)/RASTER), j1=Math.floor((y+r)/RASTER);
  const out=[];
  for(let j=j0;j<=j1;j++) for(let i=i0;i<=i1;i++){
    const k=j*rasterBreite+i;
    if(k>=0&&k<hausRaster.length) for(const b of hausRaster[k]) if(!out.includes(b)) out.push(b);
  }
  return out;
}
/* Kreis gegen Häuser schieben. Gibt zurück, wie hart es geknallt hat. */
function schiebeAus(e, r){
  let wucht = 0;
  for(const b of haeuserNah(e.x, e.y, r+2)){
    const nx = klemm(e.x, b.x, b.x+b.w), ny = klemm(e.y, b.y, b.y+b.h);
    let dx = e.x-nx, dy = e.y-ny, d = laenge(dx,dy);
    if(d >= r) continue;
    if(d < .0001){ dx = e.x - (b.x+b.w/2); dy = e.y - (b.y+b.h/2); d = laenge(dx,dy)||1; }
    const ein = r-d;
    e.x += dx/d*ein; e.y += dy/d*ein;
    if(e.vx !== undefined){
      const vn = e.vx*dx/d + e.vy*dy/d;
      if(vn < 0){ wucht = Math.max(wucht, -vn); e.vx -= dx/d*vn*1.5; e.vy -= dy/d*vn*1.5; }
    }
  }
  return wucht;
}
/* Welche Achse hat die Straße unter diesem Punkt? Geparkte Wagen müssen
   in Fahrtrichtung stehen — sonst fahren sie beim Anfahren in die Hauswand. */
function strassenRichtung(x, y){
  const h = STRASSE/2;
  for(const s of stadt.strassenX) if(Math.abs(x-s.x) < h) return 'senkrecht';
  for(const s of stadt.strassenY) if(Math.abs(y-s.y) < h) return 'waagerecht';
  return null;
}

function freiePosition(r = 16){
  for(let v=0; v<400; v++){
    const x = 120 + z()*(stadt.breite-240), y = 120 + z()*(stadt.hoehe-240);
    if(!aufStrasse(stadt, x, y)) continue;
    if(haeuserNah(x,y,r).some(b => x>b.x-r && x<b.x+b.w+r && y>b.y-r && y<b.y+b.h+r)) continue;
    return {x, y};
  }
  return {x: stadt.sx[1], y: stadt.sy[1]};
}

/* ── Waffen ────────────────────────────────────────────────────── */
export const WAFFEN = {
  faust:  {name:'Fäuste',       kurz:'FAU', nah:true,  schaden:9,  reichweite:26, takt:.34, muni:Infinity},
  schlag: {name:'Schläger',     kurz:'SCH', nah:true,  schaden:24, reichweite:36, takt:.48, muni:Infinity},
  pistole:{name:'Pistole',      kurz:'PIS', schaden:17, takt:.26, streu:.035, tempo:640, muni:0, max:120, kugeln:1},
  schrot: {name:'Schrotflinte', kurz:'SHR', schaden:11, takt:.78, streu:.20,  tempo:520, muni:0, max:48,  kugeln:6},
  mp:     {name:'MP',           kurz:'MP',  schaden:10, takt:.085, streu:.075, tempo:720, muni:0, max:260, kugeln:1}
};
const WAFFEN_FOLGE = ['faust','schlag','pistole','schrot','mp'];

/* ── Zustand ───────────────────────────────────────────────────── */
const spieler = {
  x:0, y:0, winkel:0, vx:0, vy:0, leben:100, maxLeben:100,
  imWagen:null, waffe:'faust', schussUhr:0, unverwundbar:0, tot:0,
  geld:0, fahndung:0, fahndungsUhr:0
};
let wagen = [], leute = [], polizei = [], gegner = [], kugeln = [], effekte = [], beute = [], zellen = [];
let kamera = {x:0, y:0, zoom:1};
let laeuft = false, grosseKarte = false;

const WAGENTYPEN = [
  {name:'Kombi',    farbe:'#a8433c', l:40, b:20, vmax:250, kraft:230, griff:.86},
  {name:'Limousine',farbe:'#3c5aa8', l:42, b:20, vmax:270, kraft:250, griff:.87},
  {name:'Kleinwagen',farbe:'#c9a83c',l:34, b:18, vmax:230, kraft:250, griff:.89},
  {name:'Lieferer', farbe:'#d8d2c2', l:50, b:23, vmax:200, kraft:190, griff:.80},
  {name:'Sportler', farbe:'#2fa36a', l:40, b:19, vmax:340, kraft:320, griff:.90},
  {name:'Streife',  farbe:'#e8e8ee', l:42, b:20, vmax:300, kraft:290, griff:.89, polizei:true}
];

function neuerWagen(x, y, typ){
  const t = typ || WAGENTYPEN[Math.floor(z()*(WAGENTYPEN.length-1))];
  const achse = strassenRichtung(x, y);
  const winkel = achse === 'waagerecht' ? (z()<.5 ? Math.PI/2 : -Math.PI/2)
               : achse === 'senkrecht'  ? (z()<.5 ? 0 : Math.PI)
               : Math.round(z()*4)*Math.PI/2;
  return {x, y, winkel, vx:0, vy:0, typ:t,
          leben:100, verkehr:false, ziel:null, letzterKnoten:null, blinken:0};
}

/* ── Aufbau ────────────────────────────────────────────────────── */
function bevoelkern(){
  // Telefonzellen an Kreuzungen — dort werden Aufträge angenommen
  const kr = [...stadt.knoten];
  for(let i = kr.length-1; i > 0; i--){ const j = Math.floor(z()*(i+1)); [kr[i],kr[j]]=[kr[j],kr[i]]; }
  zellen = kr.slice(0, MISSIONEN.length + 4).map(k => ({
    x: k.x + (z()<.5?-1:1)*(STRASSE/2+GEHWEG-6),
    y: k.y + (z()<.5?-1:1)*(STRASSE/2+GEHWEG-6), frei:true
  }));

  // Parkende und fahrende Wagen
  for(let i=0;i<58;i++){ const p = freiePosition(20); wagen.push(neuerWagen(p.x,p.y)); }
  for(let i=0;i<40;i++){
    const k = stadt.knoten[Math.floor(z()*stadt.knoten.length)];
    const w = neuerWagen(k.x, k.y); w.verkehr = true; w.letzterKnoten = k;
    w.ziel = stadt.knoten[k.nachbarn[Math.floor(z()*k.nachbarn.length)]];
    wagen.push(w);
  }
  // Leute auf den Gehwegen
  for(let i=0;i<140;i++){
    const p = gehwegPunkt();
    leute.push({x:p.x, y:p.y, winkel: z()*7, tempo: 26+z()*16, ziel:null, leben:24,
                angst:0, farbe:`hsl(${Math.floor(z()*360)} 32% ${52+z()*18}%)`});
  }
  // Beutewaffen liegen in der Stadt herum
  for(const w of ['pistole','schrot','mp','schrot','pistole','mp','pistole']){
    const p = freiePosition(14);
    beute.push({x:p.x, y:p.y, art:'waffe', waffe:w, phase: z()*7});
  }
  for(let i=0;i<8;i++){ const p=freiePosition(14); beute.push({x:p.x,y:p.y,art:'leben',phase:z()*7}); }
}
function gehwegPunkt(){
  const senk = z()<.5;
  if(senk){
    const s = stadt.strassenX[Math.floor(z()*stadt.strassenX.length)];
    return {x: s.x + (z()<.5?-1:1)*(STRASSE/2+GEHWEG*.5), y: 80+z()*(stadt.hoehe-160)};
  }
  const s = stadt.strassenY[Math.floor(z()*stadt.strassenY.length)];
  return {x: 80+z()*(stadt.breite-160), y: s.y + (z()<.5?-1:1)*(STRASSE/2+GEHWEG*.5)};
}

/* ── Eingabe ───────────────────────────────────────────────────── */
const taste = {};
const bindung = {KeyW:'oben',ArrowUp:'oben',KeyS:'unten',ArrowDown:'unten',
                 KeyA:'links',ArrowLeft:'links',KeyD:'rechts',ArrowRight:'rechts',
                 Space:'feuer',ShiftLeft:'hand',ShiftRight:'hand'};
addEventListener('keydown', e => {
  if(bindung[e.code]){ taste[bindung[e.code]] = true; e.preventDefault(); }
  if(e.code === 'KeyE') einAussteigen();
  if(e.code === 'KeyQ') waffeWechseln(1);
  if(e.code === 'KeyM') grosseKarte = !grosseKarte;
  const n = /^Digit([1-5])$/.exec(e.code);
  if(n) waffeSetzen(WAFFEN_FOLGE[+n[1]-1]);
});
addEventListener('keyup', e => { if(bindung[e.code]){ taste[bindung[e.code]] = false; e.preventDefault(); } });
let mausAn = false, mausX = 0, mausY = 0;
leinwand.addEventListener('mousedown', e => { mausAn = true; mausX = e.clientX; mausY = e.clientY; });
addEventListener('mouseup', () => mausAn = false);
addEventListener('mousemove', e => { mausX = e.clientX; mausY = e.clientY; });
addEventListener('wheel', e => waffeWechseln(e.deltaY > 0 ? 1 : -1), {passive:true});

/* Touch: Knüppel links, Knöpfe rechts */
const knueppel = {an:false, id:-1, x:0, y:0, dx:0, dy:0};
if(matchMedia('(pointer:coarse)').matches) $('#touch').classList.add('an');
const stick = $('#stick');
stick.addEventListener('pointerdown', e => {
  knueppel.an = true; knueppel.id = e.pointerId;
  const r = stick.getBoundingClientRect(); knueppel.x = r.left+r.width/2; knueppel.y = r.top+r.height/2;
  stick.setPointerCapture(e.pointerId); e.preventDefault();
});
stick.addEventListener('pointermove', e => {
  if(!knueppel.an || e.pointerId !== knueppel.id) return;
  const dx = e.clientX-knueppel.x, dy = e.clientY-knueppel.y, d = laenge(dx,dy)||1;
  const k = Math.min(1, d/52);
  knueppel.dx = dx/d*k; knueppel.dy = dy/d*k;
  stick.querySelector('i').style.transform = `translate(${knueppel.dx*40}px,${knueppel.dy*40}px)`;
});
const knueppelAus = e => { if(e.pointerId!==knueppel.id) return;
  knueppel.an=false; knueppel.dx=knueppel.dy=0; stick.querySelector('i').style.transform=''; };
stick.addEventListener('pointerup', knueppelAus); stick.addEventListener('pointercancel', knueppelAus);
function tippKnopf(id, aktion, halten){
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('gedrueckt');
    if(halten) taste[halten]=true; else aktion(); });
  const aus = e => { e.preventDefault(); el.classList.remove('gedrueckt'); if(halten) taste[halten]=false; };
  el.addEventListener('pointerup', aus); el.addEventListener('pointercancel', aus); el.addEventListener('pointerleave', aus);
}
tippKnopf('#tFeuer', null, 'feuer');
tippKnopf('#tEin', einAussteigen);
tippKnopf('#tWechsel', () => waffeWechseln(1));

/* ── Waffen bedienen ───────────────────────────────────────────── */
function hatWaffe(w){ const d = WAFFEN[w]; return d.nah || d.muni > 0; }
function waffeSetzen(w){ if(w && hatWaffe(w)) spieler.waffe = w; }
function waffeWechseln(richtung){
  const i = WAFFEN_FOLGE.indexOf(spieler.waffe);
  for(let k=1;k<=WAFFEN_FOLGE.length;k++){
    const j = (i + richtung*k + WAFFEN_FOLGE.length*9) % WAFFEN_FOLGE.length;
    if(hatWaffe(WAFFEN_FOLGE[j])){ spieler.waffe = WAFFEN_FOLGE[j]; return; }
  }
}
function schiessen(schuetze, winkel, waffeName, feindlich){
  const w = WAFFEN[waffeName];
  if(w.nah){
    const zx = schuetze.x + Math.sin(winkel)*w.reichweite, zy = schuetze.y - Math.cos(winkel)*w.reichweite;
    for(const o of zieleFuer(feindlich)){
      if(laenge(o.x-zx, o.y-zy) < 16){ trefferAn(o, w.schaden, schuetze); knall(zx, zy, '#ffd9a0', 5); }
    }
    return;
  }
  if(w.muni <= 0) return;
  w.muni--;
  for(let i=0;i<(w.kugeln||1);i++){
    const a = winkel + (Math.random()-.5)*w.streu*2;
    kugeln.push({x: schuetze.x + Math.sin(a)*13, y: schuetze.y - Math.cos(a)*13,
                 vx: Math.sin(a)*w.tempo, vy: -Math.cos(a)*w.tempo,
                 schaden: w.schaden, leben: .9, feindlich});
  }
  muendungsfeuer(schuetze.x + Math.sin(winkel)*15, schuetze.y - Math.cos(winkel)*15);
}
function zieleFuer(feindlich){
  return feindlich ? [spieler] : [...leute, ...polizei, ...gegner];
}
function trefferAn(o, schaden, von){
  if(o === spieler){
    if(spieler.unverwundbar > 0 || spieler.tot > 0) return;
    spieler.leben -= schaden;
    $('#treffer').classList.add('an');
    clearTimeout(trefferAn._t); trefferAn._t = setTimeout(()=>$('#treffer').classList.remove('an'), 170);
    if(spieler.leben <= 0) niederlage();
    return;
  }
  o.leben -= schaden;
  o.angst = 9;
  knall(o.x, o.y, '#e0463c', 6);
  if(o.leben <= 0){
    o.weg = true;
    knall(o.x, o.y, '#e0463c', 16);
    if(von === spieler || von === spieler.imWagen){
      if(polizei.includes(o)) fahndungHoch(2.0);
      else if(gegner.includes(o)) spieler.geld += 120;
      else fahndungHoch(1.2);
    }
  }
}

/* ── Fahndung ──────────────────────────────────────────────────── */
function fahndungHoch(v){
  spieler.fahndung = klemm(spieler.fahndung + v, 0, 5);
  spieler.fahndungsUhr = 0;
}
let streifenUhr = 0;
function fahndungPflege(dt){
  spieler.fahndungsUhr += dt;
  // Ohne Zwischenfall kühlt es langsam ab
  if(spieler.fahndungsUhr > 14 && spieler.fahndung > 0){
    spieler.fahndung = Math.max(0, spieler.fahndung - dt*.22);
  }
  const stufe = Math.floor(spieler.fahndung);
  streifenUhr -= dt;
  if(stufe >= 1 && polizei.length < stufe*2 + 1 && streifenUhr <= 0){
    streifenUhr = 2.4;
    const a = Math.random()*7, d = 620 + Math.random()*260;
    const px = klemm(spieler.x + Math.sin(a)*d, 60, stadt.breite-60);
    const py = klemm(spieler.y - Math.cos(a)*d, 60, stadt.hoehe-60);
    const p = {x:px, y:py, winkel:a, vx:0, vy:0, leben:52, tempo:44, schussUhr:0,
               farbe:'#20408a', wagen:null};
    if(stufe >= 2 && Math.random() < .65){
      const w = neuerWagen(px, py, WAGENTYPEN[5]); w.streife = true; w.fahrer = p;
      p.wagen = w; wagen.push(w);
    }
    polizei.push(p);
  }
}

/* ── Ein- und Aussteigen ───────────────────────────────────────── */
function einAussteigen(){
  if(!laeuft) return;
  if(spieler.imWagen){
    const w = spieler.imWagen;
    spieler.imWagen = null;
    spieler.x = w.x + Math.cos(w.winkel)*(w.typ.b/2+12);
    spieler.y = w.y + Math.sin(w.winkel)*(w.typ.b/2+12);
    spieler.vx = spieler.vy = 0;
    schiebeAus(spieler, 8);
    return;
  }
  let beste = null, bd = 46;
  for(const w of wagen){
    const d = laenge(w.x-spieler.x, w.y-spieler.y);
    if(d < bd){ bd = d; beste = w; }
  }
  if(beste){
    if(beste.streife) fahndungHoch(1.4);
    else if(beste.verkehr) fahndungHoch(.7);
    beste.verkehr = false; beste.streife = false;
    if(beste.fahrer){ beste.fahrer.wagen = null; beste.fahrer = null; }
    spieler.imWagen = beste;
    ruf('WAGEN GEKAPERT', beste.typ.name);
  }
}

/* ── Fahrzeugphysik ────────────────────────────────────────────── */
function fahre(w, gas, lenk, hand, dt){
  const vor = {x: Math.sin(w.winkel), y: -Math.cos(w.winkel)};
  const rechts = {x: Math.cos(w.winkel), y: Math.sin(w.winkel)};
  let vv = w.vx*vor.x + w.vy*vor.y;
  let vq = w.vx*rechts.x + w.vy*rechts.y;

  vv += gas * w.typ.kraft * dt;
  vv *= Math.pow(.995, dt*60);
  vv = klemm(vv, -w.typ.vmax*.45, w.typ.vmax);
  const griff = hand ? .965 : w.typ.griff;
  vq *= Math.pow(griff, dt*60);

  const tempoAnteil = klemm(Math.abs(vv)/90, 0, 1);
  w.winkel += lenk * 2.5 * tempoAnteil * dt * Math.sign(vv || 1);

  w.vx = vor.x*vv + rechts.x*vq;
  w.vy = vor.y*vv + rechts.y*vq;
  w.x += w.vx*dt; w.y += w.vy*dt;

  const wucht = schiebeAus(w, w.typ.l*.42);
  if(wucht > 120){
    w.leben -= wucht*.05;
    knall(w.x, w.y, '#d8b45a', 6);
    if(w === spieler.imWagen && wucht > 200) trefferAn(spieler, wucht*.02, null);
  }
  w.x = klemm(w.x, 24, stadt.breite-24); w.y = klemm(w.y, 24, stadt.hoehe-24);
}

/* ── Verkehr und Polizei ───────────────────────────────────────── */
function lenkeNach(w, zx, zy){
  const soll = Math.atan2(zx-w.x, -(zy-w.y));
  return klemm(winkelDiff(soll, w.winkel)*1.6, -1, 1);
}
function verkehrFahren(w, dt){
  if(!w.ziel){ w.ziel = stadt.knoten[Math.floor(z()*stadt.knoten.length)]; }
  // Rechts von der Mitte fahren
  const dx = w.ziel.x-w.x, dy = w.ziel.y-w.y, d = laenge(dx,dy)||1;
  const zx = w.ziel.x - dy/d*14, zy = w.ziel.y + dx/d*14;
  if(d < 46){
    const kandidaten = w.ziel.nachbarn.filter(i => stadt.knoten[i] !== w.letzterKnoten);
    const liste = kandidaten.length ? kandidaten : w.ziel.nachbarn;
    w.letzterKnoten = w.ziel;
    w.ziel = stadt.knoten[liste[Math.floor(Math.random()*liste.length)]];
  }
  // Bremsen, wenn jemand direkt davor ist
  let frei = 1;
  const vx = Math.sin(w.winkel), vy = -Math.cos(w.winkel);
  for(const a of wagen){
    if(a===w) continue;
    const rx=a.x-w.x, ry=a.y-w.y;
    if(rx*vx+ry*vy > 0 && laenge(rx,ry) < 62) { frei = 0; break; }
  }
  for(const p of [...leute, spieler]){
    const rx=p.x-w.x, ry=p.y-w.y;
    if(rx*vx+ry*vy > 0 && laenge(rx,ry) < 46){ frei = 0; break; }
  }
  fahre(w, frei ? .34 : -.5, lenkeNach(w, zx, zy), false, dt);
}
function polizeiDenken(p, dt){
  const dx = spieler.x-p.x, dy = spieler.y-p.y, d = laenge(dx,dy);
  const stufe = Math.floor(spieler.fahndung);
  if(p.wagen){
    const w = p.wagen;
    p.x = w.x; p.y = w.y; p.winkel = w.winkel;
    fahre(w, d > 90 ? 1 : -.3, lenkeNach(w, spieler.x, spieler.y), false, dt);
    if(d < 150 && stufe >= 2){ p.schussUhr -= dt;
      if(p.schussUhr <= 0){ p.schussUhr = .55; schiessen(p, Math.atan2(dx,-dy), 'pistole', true); } }
    return;
  }
  if(d > 30){
    const a = Math.atan2(dx,-dy);
    p.winkel = a;
    p.x += Math.sin(a)*p.tempo*dt; p.y -= Math.cos(a)*p.tempo*dt;
    schiebeAus(p, 8);
  }
  p.schussUhr -= dt;
  if(d < 240 && stufe >= 1 && p.schussUhr <= 0){
    p.schussUhr = stufe >= 3 ? .35 : .8;
    schiessen(p, Math.atan2(dx,-dy), 'pistole', true);
  }
}
function leuteDenken(l, dt){
  l.angst = Math.max(0, l.angst - dt);
  const dSp = laenge(spieler.x-l.x, spieler.y-l.y);
  if(l.angst > 0 || dSp < 60 && spieler.imWagen && laenge(spieler.imWagen.vx,spieler.imWagen.vy) > 120){
    const a = Math.atan2(l.x-spieler.x, -(l.y-spieler.y));
    l.winkel = a;
    l.x += Math.sin(a)*l.tempo*2.1*dt; l.y -= Math.cos(a)*l.tempo*2.1*dt;
  } else {
    if(!l.ziel || laenge(l.ziel.x-l.x, l.ziel.y-l.y) < 24) l.ziel = gehwegPunkt();
    const a = Math.atan2(l.ziel.x-l.x, -(l.ziel.y-l.y));
    l.winkel = misch(l.winkel, a, klemm(dt*3,0,1));
    l.x += Math.sin(l.winkel)*l.tempo*dt; l.y -= Math.cos(l.winkel)*l.tempo*dt;
  }
  schiebeAus(l, 7);
  l.x = klemm(l.x, 20, stadt.breite-20); l.y = klemm(l.y, 20, stadt.hoehe-20);
}

/* ── Wirkung ───────────────────────────────────────────────────── */
function knall(x,y,farbe,n){
  for(let i=0;i<n;i++){
    const a=Math.random()*7, s=40+Math.random()*130;
    effekte.push({x,y,vx:Math.sin(a)*s,vy:-Math.cos(a)*s,leben:.28+Math.random()*.3,farbe,gr:2+Math.random()*3});
  }
}
function muendungsfeuer(x,y){ effekte.push({x,y,vx:0,vy:0,leben:.06,farbe:'#ffe08a',gr:7}); }
let rufUhr = 0;
function ruf(gross, klein){
  $('#ruf').innerHTML = gross + (klein ? '<small>'+klein+'</small>' : '');
  $('#ruf').classList.add('an'); rufUhr = 2.4;
}

/* ── Missionen ─────────────────────────────────────────────────── */
const auftrag = {aktiv:null, schritt:0, uhr:0, marken:[], erledigt:0};
function auftragStarten(m){
  auftrag.aktiv = m; auftrag.schritt = 0; auftrag.uhr = m.zeit || 0;
  schrittVorbereiten();
  ruf(m.name.toUpperCase(), m.text);
}
function schrittVorbereiten(){
  const m = auftrag.aktiv; if(!m) return;
  const s = m.schritte[auftrag.schritt];
  auftrag.marken = [];
  if(!s){ auftragFertig(); return; }
  if(s.art === 'fahre' || s.art === 'liefere'){
    const p = ortFuer(s.ort);
    auftrag.marken.push({x:p.x, y:p.y, r: s.r || 40, farbe:'#ffc233'});
  }
  if(s.art === 'sammle'){
    for(let i=0;i<s.anzahl;i++){ const p = freiePosition(16);
      auftrag.marken.push({x:p.x, y:p.y, r:26, farbe:'#7fd36a'}); }
  }
  if(s.art === 'raeume'){
    gegner.length = 0;
    const mitte = ortFuer(s.ort);
    for(let i=0;i<s.anzahl;i++){
      const a = Math.random()*7, d = 40+Math.random()*90;
      const gg = {x: mitte.x+Math.sin(a)*d, y: mitte.y-Math.cos(a)*d, winkel:a,
                  leben:44, tempo:38, schussUhr:Math.random(), farbe:'#7a3f8c'};
      schiebeAus(gg, 9); gegner.push(gg);
    }
    auftrag.marken.push({x:mitte.x, y:mitte.y, r:120, farbe:'#e0463c', nurKarte:true});
  }
  zeigeAuftrag();
}
function ortFuer(o){
  if(o === 'zufall') return freiePosition(20);
  if(typeof o === 'object') return o;
  return freiePosition(20);
}
function auftragPruefen(dt){
  const m = auftrag.aktiv; if(!m) return;
  if(m.zeit){ auftrag.uhr -= dt; if(auftrag.uhr <= 0){ auftragAbbruch('Zeit abgelaufen'); return; } }
  const s = m.schritte[auftrag.schritt]; if(!s) return;
  const px = spieler.imWagen ? spieler.imWagen.x : spieler.x;
  const py = spieler.imWagen ? spieler.imWagen.y : spieler.y;

  if(s.art === 'fahre' || s.art === 'liefere'){
    const mk = auftrag.marken[0];
    if(mk && laenge(px-mk.x, py-mk.y) < mk.r){
      if(s.imWagen && !spieler.imWagen) return;
      naechsterSchritt();
    }
  } else if(s.art === 'sammle'){
    for(let i=auftrag.marken.length-1;i>=0;i--){
      const mk = auftrag.marken[i];
      if(laenge(px-mk.x, py-mk.y) < mk.r){ auftrag.marken.splice(i,1); knall(mk.x,mk.y,'#7fd36a',10); }
    }
    if(!auftrag.marken.length) naechsterSchritt();
  } else if(s.art === 'raeume'){
    if(!gegner.some(o => !o.weg)) naechsterSchritt();
  } else if(s.art === 'entkomme'){
    if(spieler.fahndung < .5) naechsterSchritt();
  }
  zeigeAuftrag();
}
function naechsterSchritt(){
  auftrag.schritt++;
  if(auftrag.schritt >= auftrag.aktiv.schritte.length) auftragFertig();
  else { schrittVorbereiten(); knall(spieler.x, spieler.y, '#ffc233', 12); }
}
function auftragFertig(){
  const m = auftrag.aktiv;
  spieler.geld += m.lohn;
  auftrag.erledigt++;
  ruf('AUFTRAG ERLEDIGT', '+ ' + m.lohn + ' €');
  auftrag.aktiv = null; auftrag.marken = []; gegner.length = 0;
  zeigeAuftrag();
}
function auftragAbbruch(grund){
  ruf('AUFTRAG GEPLATZT', grund);
  auftrag.aktiv = null; auftrag.marken = []; gegner.length = 0;
  zeigeAuftrag();
}
function zeigeAuftrag(){
  const el = $('#auftrag');
  if(!auftrag.aktiv){
    el.querySelector('.zeile').textContent = auftrag.erledigt >= MISSIONEN.length
      ? 'Alle Aufträge erledigt. Die Stadt gehört dir.'
      : 'Such dir eine gelbe Telefonzelle.';
    el.querySelector('.zeit').classList.remove('an');
    return;
  }
  const s = auftrag.aktiv.schritte[auftrag.schritt];
  el.querySelector('.zeile').textContent = s ? s.text : '';
  const zt = el.querySelector('.zeit');
  if(auftrag.aktiv.zeit){ zt.classList.add('an'); zt.textContent = Math.max(0,auftrag.uhr).toFixed(1) + ' s'; }
  else zt.classList.remove('an');
}

/* ── Niederlage ────────────────────────────────────────────────── */
function niederlage(){
  spieler.tot = 2.4;
  knall(spieler.x, spieler.y, '#e0463c', 26);
  ruf('AUSGEKNOCKT', 'Du wachst im Krankenhaus auf — halbe Kasse weg');
  if(auftrag.aktiv) auftragAbbruch('Du warst weg');
}
function wiederbeleben(){
  const p = freiePosition(16);
  spieler.x = p.x; spieler.y = p.y; spieler.leben = spieler.maxLeben;
  spieler.imWagen = null; spieler.fahndung = 0; spieler.unverwundbar = 2.5;
  spieler.geld = Math.floor(spieler.geld/2); spieler.tot = 0;
  polizei.length = 0;
}

/* ── Schleife ──────────────────────────────────────────────────── */
function schritt(dt){
  if(spieler.tot > 0){ spieler.tot -= dt; if(spieler.tot <= 0) wiederbeleben(); }
  if(spieler.unverwundbar > 0) spieler.unverwundbar -= dt;

  // Eingaberichtung
  let ex = (taste.rechts?1:0)-(taste.links?1:0);
  let ey = (taste.unten?1:0)-(taste.oben?1:0);
  if(knueppel.dx || knueppel.dy){ ex = knueppel.dx; ey = knueppel.dy; }

  if(spieler.imWagen && spieler.tot <= 0){
    const w = spieler.imWagen;
    fahre(w, -ey, ex, taste.hand, dt);
    spieler.x = w.x; spieler.y = w.y; spieler.winkel = w.winkel;
    if(laenge(w.vx,w.vy) > 40) ueberfahren(w);
  } else if(spieler.tot <= 0){
    const d = laenge(ex,ey);
    if(d > .08){
      spieler.winkel = Math.atan2(ex, -ey);
      const t = 96;
      spieler.x += ex/Math.max(d,1)*t*dt; spieler.y += ey/Math.max(d,1)*t*dt;
      schiebeAus(spieler, 8);
      spieler.x = klemm(spieler.x, 20, stadt.breite-20); spieler.y = klemm(spieler.y, 20, stadt.hoehe-20);
    }
  }

  // Zielen und Feuern
  let zielWinkel = spieler.winkel;
  if(mausAn){
    const wx = kamera.x + (mausX - BB/2)/kamera.zoom, wy = kamera.y + (mausY - BH/2)/kamera.zoom;
    zielWinkel = Math.atan2(wx-spieler.x, -(wy-spieler.y));
    if(!spieler.imWagen) spieler.winkel = zielWinkel;
  }
  spieler.schussUhr -= dt;
  if((taste.feuer || mausAn) && spieler.schussUhr <= 0 && spieler.tot <= 0){
    const w = WAFFEN[spieler.waffe];
    if(hatWaffe(spieler.waffe)){
      spieler.schussUhr = w.takt;
      schiessen(spieler, zielWinkel, spieler.waffe, false);
      if(!w.nah){ fahndungHoch(.16); if(w.muni<=0) waffeWechseln(-1); }
    }
  }

  // Welt
  for(const w of wagen){
    if(w === spieler.imWagen) continue;
    if(w.streife && w.fahrer) continue;
    if(w.verkehr) verkehrFahren(w, dt);
    else { w.vx *= Math.pow(.9,dt*60); w.vy *= Math.pow(.9,dt*60); w.x += w.vx*dt; w.y += w.vy*dt; schiebeAus(w, w.typ.l*.42); }
  }
  for(const l of leute) leuteDenken(l, dt);
  for(const p of polizei) polizeiDenken(p, dt);
  for(const gg of gegner) gegnerDenken(gg, dt);

  // Kugeln
  for(const k of kugeln){
    k.x += k.vx*dt; k.y += k.vy*dt; k.leben -= dt;
    if(haeuserNah(k.x,k.y,3).some(b => k.x>b.x&&k.x<b.x+b.w&&k.y>b.y&&k.y<b.y+b.h)){
      k.leben = 0; knall(k.x,k.y,'#cfc6b0',3); continue;
    }
    for(const o of zieleFuer(k.feindlich)){
      if(o.weg || o === spieler && spieler.tot > 0) continue;
      if(laenge(o.x-k.x, o.y-k.y) < 11){ trefferAn(o, k.schaden, k.feindlich?null:spieler); k.leben = 0; break; }
    }
  }
  kugeln = kugeln.filter(k => k.leben > 0);
  for(const e of effekte){ e.x += e.vx*dt; e.y += e.vy*dt; e.vx*=.94; e.vy*=.94; e.leben -= dt; }
  effekte = effekte.filter(e => e.leben > 0);
  leute = leute.filter(l => !l.weg); polizei = polizei.filter(p => !p.weg);
  while(leute.length < 140){ const p = gehwegPunkt();
    if(laenge(p.x-spieler.x,p.y-spieler.y) > 700) leute.push({x:p.x,y:p.y,winkel:z()*7,tempo:26+z()*16,
      ziel:null,leben:24,angst:0,farbe:`hsl(${Math.floor(z()*360)} 32% ${52+z()*18}%)`}); else break; }

  // Beute aufheben
  for(let i=beute.length-1;i>=0;i--){
    const b = beute[i]; b.phase += dt*3;
    if(laenge(b.x-spieler.x, b.y-spieler.y) < 22 && !spieler.imWagen){
      if(b.art === 'waffe'){ const w = WAFFEN[b.waffe];
        w.muni = Math.min(w.max, w.muni + Math.round(w.max*.45)); waffeSetzen(b.waffe);
        ruf(w.name.toUpperCase(), 'aufgenommen'); }
      else { spieler.leben = Math.min(spieler.maxLeben, spieler.leben + 35); ruf('VERBANDSKASTEN', '+35'); }
      knall(b.x,b.y,'#ffc233',8); beute.splice(i,1);
    }
  }
  // Telefonzellen
  if(!auftrag.aktiv && auftrag.erledigt < MISSIONEN.length){
    for(const zl of zellen){
      if(laenge(zl.x-spieler.x, zl.y-spieler.y) < 34){ auftragStarten(MISSIONEN[auftrag.erledigt]); break; }
    }
  }
  auftragPruefen(dt);
  fahndungPflege(dt);

  // Kamera
  const zx = spieler.x, zy = spieler.y;
  const tempo = spieler.imWagen ? laenge(spieler.imWagen.vx, spieler.imWagen.vy) : 0;
  kamera.zoom = misch(kamera.zoom, klemm(1.35 - tempo/900, .92, 1.35), klemm(dt*2,0,1));
  kamera.x = misch(kamera.x, zx, klemm(dt*7,0,1));
  kamera.y = misch(kamera.y, zy, klemm(dt*7,0,1));
  // Nicht über den Stadtrand hinausschauen
  const hb = BB/kamera.zoom/2, hh = BH/kamera.zoom/2;
  kamera.x = stadt.breite > hb*2 ? klemm(kamera.x, hb, stadt.breite-hb) : stadt.breite/2;
  kamera.y = stadt.hoehe  > hh*2 ? klemm(kamera.y, hh, stadt.hoehe -hh) : stadt.hoehe/2;

  if(rufUhr > 0){ rufUhr -= dt; if(rufUhr <= 0) $('#ruf').classList.remove('an'); }
  anzeige();
}
function gegnerDenken(gg, dt){
  const dx = spieler.x-gg.x, dy = spieler.y-gg.y, d = laenge(dx,dy);
  if(d < 300){
    gg.winkel = Math.atan2(dx,-dy);
    if(d > 90){ gg.x += Math.sin(gg.winkel)*gg.tempo*dt; gg.y -= Math.cos(gg.winkel)*gg.tempo*dt; schiebeAus(gg,9); }
    gg.schussUhr -= dt;
    if(gg.schussUhr <= 0){ gg.schussUhr = .7 + Math.random()*.5; schiessen(gg, gg.winkel, 'pistole', true); }
  }
}
function ueberfahren(w){
  for(const o of [...leute, ...polizei, ...gegner]){
    if(o.weg) continue;
    if(laenge(o.x-w.x, o.y-w.y) < w.typ.l*.45){
      trefferAn(o, 60, spieler);
      const s = laenge(w.vx,w.vy);
      o.x += w.vx/s*24; o.y += w.vy/s*24;
    }
  }
}

/* ── Zeichnen ──────────────────────────────────────────────────── */
function malPerson(o, farbe, hut){
  g.save(); g.translate(o.x, o.y); g.rotate(o.winkel);
  g.fillStyle = 'rgba(18,16,22,.32)'; g.beginPath(); g.ellipse(3,3,7,7,0,0,7); g.fill();
  g.fillStyle = farbe; g.beginPath(); g.arc(0,0,6.6,0,7); g.fill();
  g.fillStyle = hut || '#e8c9a0'; g.beginPath(); g.arc(0,-1.5,4.1,0,7); g.fill();
  g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(-1.4,-9.5,2.8,4);   // Blickrichtung
  g.restore();
}
function malWagen(w){
  const t = w.typ;
  g.save(); g.translate(w.x, w.y); g.rotate(w.winkel);
  g.fillStyle = 'rgba(18,16,22,.34)';
  g.fillRect(-t.b/2+4, -t.l/2+4, t.b, t.l);
  g.fillStyle = t.farbe; g.fillRect(-t.b/2, -t.l/2, t.b, t.l);
  g.fillStyle = 'rgba(255,240,210,.16)'; g.fillRect(-t.b/2, -t.l/2, t.b, 4);
  g.fillStyle = '#151821';
  g.fillRect(-t.b/2+2.5, -t.l*.30, t.b-5, t.l*.20);            // Frontscheibe
  g.fillRect(-t.b/2+2.5, t.l*.12,  t.b-5, t.l*.16);            // Heckscheibe
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fillRect(-t.b/2-1.5, -t.l*.34, 1.5, t.l*.24); g.fillRect(t.b/2, -t.l*.34, 1.5, t.l*.24);
  if(w.streife){
    const an = (performance.now()/120|0)%2;
    g.fillStyle = an?'#4a7dff':'#12203f'; g.fillRect(-t.b/2+1, -3, t.b/2-1, 5);
    g.fillStyle = an?'#12203f':'#ff4a4a'; g.fillRect(0, -3, t.b/2-1, 5);
  }
  g.restore();
}
function malMarke(m){
  const p = (performance.now()/1000)%1;
  g.strokeStyle = m.farbe; g.lineWidth = 3; g.globalAlpha = .85-p*.5;
  g.beginPath(); g.arc(m.x, m.y, m.r*(0.55+p*.55), 0, 7); g.stroke();
  g.globalAlpha = .22; g.fillStyle = m.farbe;
  g.beginPath(); g.arc(m.x, m.y, m.r, 0, 7); g.fill();
  g.globalAlpha = 1;
}
function zeichne(){
  g.setTransform(DPR,0,0,DPR,0,0);
  g.fillStyle = '#14161c'; g.fillRect(0,0,BB,BH);
  g.save();
  g.translate(BB/2, BH/2); g.scale(kamera.zoom, kamera.zoom); g.translate(-kamera.x, -kamera.y);

  const sichtB = BB/kamera.zoom, sichtH = BH/kamera.zoom;
  const sx = kamera.x - sichtB/2, sy = kamera.y - sichtH/2;
  g.drawImage(stadtBild, sx, sy, sichtB, sichtH, sx, sy, sichtB, sichtH);

  for(const b of beute){
    const s = 1 + Math.sin(b.phase)*.14;
    g.save(); g.translate(b.x, b.y); g.scale(s,s);
    g.fillStyle = b.art==='waffe' ? '#ffc233' : '#7fd36a';
    g.fillRect(-8,-8,16,16);
    g.fillStyle = '#151821'; g.font = 'bold 11px sans-serif'; g.textAlign='center';
    g.fillText(b.art==='waffe' ? WAFFEN[b.waffe].kurz[0] : '+', 0, 4);
    g.restore();
  }
  for(const zl of zellen){
    g.fillStyle = auftrag.aktiv ? '#6b5a2a' : '#ffc233';
    g.fillRect(zl.x-7, zl.y-9, 14, 18);
    g.fillStyle = '#151821'; g.fillRect(zl.x-4, zl.y-6, 8, 9);
  }
  for(const m of auftrag.marken) if(!m.nurKarte) malMarke(m);

  for(const l of leute) malPerson(l, l.farbe);
  for(const gg of gegner) if(!gg.weg) malPerson(gg, gg.farbe, '#2b1b33');
  for(const p of polizei) if(!p.weg && !p.wagen) malPerson(p, p.farbe, '#dfe4ee');
  for(const w of wagen) malWagen(w);
  if(spieler.tot <= 0 && (spieler.unverwundbar <= 0 || (performance.now()/90|0)%2)){
    // Ring unter dem Spieler, damit er im Gewimmel auffindbar bleibt
    const mx = spieler.imWagen ? spieler.imWagen.x : spieler.x;
    const my = spieler.imWagen ? spieler.imWagen.y : spieler.y;
    g.strokeStyle = 'rgba(255,194,51,.75)'; g.lineWidth = 2;
    g.beginPath(); g.arc(mx, my, spieler.imWagen ? 30 : 13, 0, 7); g.stroke();
    if(!spieler.imWagen) malPerson(spieler, '#e0463c', '#ffd9a0');
  }

  g.fillStyle = '#fff3c4';
  for(const k of kugeln) g.fillRect(k.x-1.5, k.y-1.5, 3, 3);
  for(const e of effekte){
    g.globalAlpha = klemm(e.leben*3,0,1); g.fillStyle = e.farbe;
    g.fillRect(e.x-e.gr/2, e.y-e.gr/2, e.gr, e.gr);
  }
  g.globalAlpha = 1;
  g.restore();
  malKarte();
}

/* ── Minikarte ─────────────────────────────────────────────────── */
const kk = $('#karte canvas'), kg = kk.getContext('2d');
let kleinBild = null;
function malKarte(){
  if(!kleinBild) return;
  const gross = grosseKarte;
  const W = kk.width, H = kk.height;
  const rahmen = kk.parentElement;
  if(gross){
    // Mittig einblenden und an die kleinere Bildschirmseite anpassen
    const b = Math.min(BB*.82, (BH*.78)*stadt.breite/stadt.hoehe);
    rahmen.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);'
      + 'background:var(--panel);border:1px solid var(--kante);padding:5px';
    kk.style.width = b+'px'; kk.style.height = 'auto';
  } else {
    rahmen.style.cssText = '';
    kk.style.width = ''; kk.style.height = '';
  }
  kg.clearRect(0,0,W,H);
  const sk = gross ? Math.min(W/stadt.breite, H/stadt.hoehe) : Math.min(W/stadt.breite, H/stadt.hoehe);
  const sicht = gross ? {x:0,y:0,w:stadt.breite,h:stadt.hoehe}
                      : {x: klemm(spieler.x-560,0,stadt.breite-1120), y: klemm(spieler.y-450,0,stadt.hoehe-900), w:1120, h:900};
  const px = x => (x-sicht.x)/sicht.w*W, py = y => (y-sicht.y)/sicht.h*H;
  kg.drawImage(kleinBild, sicht.x/stadt.breite*kleinBild.width, sicht.y/stadt.hoehe*kleinBild.height,
               sicht.w/stadt.breite*kleinBild.width, sicht.h/stadt.hoehe*kleinBild.height, 0,0,W,H);
  for(const zl of zellen){ kg.fillStyle='#ffc233'; kg.fillRect(px(zl.x)-2, py(zl.y)-2, 5, 5); }
  for(const m of auftrag.marken){ kg.fillStyle='#7fd36a'; kg.fillRect(px(m.x)-3, py(m.y)-3, 7, 7); }
  for(const p of polizei){ kg.fillStyle='#5aa9e6'; kg.fillRect(px(p.x)-2, py(p.y)-2, 5, 5); }
  // Spieler zuletzt und mit heller Fassung, damit er nie untergeht
  const sx2 = px(spieler.x), sy2 = py(spieler.y);
  kg.fillStyle='#fff'; kg.fillRect(sx2-5, sy2-5, 11, 11);
  kg.fillStyle='#e0463c'; kg.fillRect(sx2-3, sy2-3, 7, 7);
}

/* ── Anzeige ───────────────────────────────────────────────────── */
function anzeige(){
  $('#geld').textContent = spieler.geld.toLocaleString('de-DE') + ' €';
  const st = Math.floor(spieler.fahndung);
  $('#sterne').innerHTML = '★★★★★'.split('').map((s,i)=> i<st ? '<b>★</b>' : '★').join('');
  $('#leben i').style.width = klemm(spieler.leben/spieler.maxLeben*100,0,100) + '%';
  const w = WAFFEN[spieler.waffe];
  $('#waffe .name').textContent = w.name;
  $('#waffe .muni').textContent = w.nah ? '—' : w.muni + ' Schuss';
  $('#waffe .liste').innerHTML = WAFFEN_FOLGE.map(k =>
    `<span class="${k===spieler.waffe?'aktiv':hatWaffe(k)?'hat':''}">${WAFFEN[k].kurz}</span>`).join('');
}

/* ── Start ─────────────────────────────────────────────────────── */
let vorher = performance.now();
function schleife(jetzt){
  requestAnimationFrame(schleife);
  const dt = Math.min((jetzt-vorher)/1000, .05); vorher = jetzt;
  if(laeuft) schritt(dt);
  if(stadtBild) zeichne();
}
$('#losKnopf').addEventListener('click', async () => {
  $('#ladebalken i').style.width = '40%';
  await new Promise(r => setTimeout(r, 30));
  stadtBild = malStadt(stadt);
  // Verkleinerte Fassung für die Karte
  kleinBild = document.createElement('canvas');
  kleinBild.width = 720; kleinBild.height = Math.round(720*stadt.hoehe/stadt.breite);
  kleinBild.getContext('2d').drawImage(stadtBild, 0,0,stadt.breite,stadt.hoehe, 0,0,kleinBild.width,kleinBild.height);
  $('#ladebalken i').style.width = '80%';
  bevoelkern();
  const p = freiePosition(16);
  spieler.x = p.x; spieler.y = p.y;
  kamera.x = p.x; kamera.y = p.y;
  $('#ladebalken i').style.width = '100%';
  $('#start').classList.add('weg'); $('#hud').classList.add('an');
  laeuft = true;
  ruf('BLECHSCHADEN', 'Such dir eine gelbe Telefonzelle');
});
requestAnimationFrame(schleife);

/* Für die Werkbank */
window.__spiel = {
  spieler, stadt, auftrag, WAFFEN,
  get wagen(){return wagen}, get leute(){return leute}, get polizei(){return polizei},
  get gegner(){return gegner}, get kugeln(){return kugeln}, get zellen(){return zellen},
  get beute(){return beute},
  starten: () => $('#losKnopf').click(),
  setzen: (x,y) => { spieler.x=x; spieler.y=y; spieler.imWagen=null; kamera.x=x; kamera.y=y; },
  gib: (w,n) => { WAFFEN[w].muni = n; spieler.waffe = w; },
  fahndung: v => { spieler.fahndung = v; }
};
