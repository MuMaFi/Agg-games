/* ═══════════════════════════════════════════════════════════════════
   NACHSITZEN — Schulhaus aus der Ich-Perspektive.
   Gerendert wird mit einem Raycaster: pro Bildspalte ein Strahl durchs
   Gitter (DDA), die getroffene Wand als Texturspalte in einen Puffer
   geschrieben, Figuren und Gegenstände danach als Billboards mit
   Tiefenprüfung. Kleine Innenauflösung, hart hochskaliert — das gibt
   den groben Look und läuft auch auf dem Handy.
   ═══════════════════════════════════════════════════════════════════ */
import { baueSchule, wegSuche, zufall, FLUR, WAND, RAUM, TUER, SPIND, TAFEL, AUSGANG } from './schule.js';

const $ = s => document.querySelector(s);
const klemm = (v,a,b) => v<a?a:v>b?b:v;
const misch = (a,b,t) => a+(b-a)*t;

/* ── Texturen ──────────────────────────────────────────────────── */
const TG = 64;
function textur(malen){
  const c = document.createElement('canvas'); c.width = c.height = TG;
  const g = c.getContext('2d'); malen(g, TG);
  const d = g.getImageData(0,0,TG,TG).data;
  const px = new Uint32Array(TG*TG);
  for(let i=0;i<TG*TG;i++)
    px[i] = (255<<24) | (d[i*4+2]<<16) | (d[i*4+1]<<8) | d[i*4];
  return px;
}
const z0 = zufall(77);
const TEX = {};
TEX[WAND] = textur((g,S) => {
  g.fillStyle='#cdbf9a'; g.fillRect(0,0,S,S);
  g.fillStyle='#4e7a55'; g.fillRect(0,S*.58,S,S*.42);          // Sockel
  g.fillStyle='#8a9b6e'; g.fillRect(0,S*.55,S,S*.05);           // Zierleiste
  g.fillStyle='rgba(0,0,0,.07)';
  for(let y=0;y<S;y+=8) g.fillRect(0,y,S,1);
  g.fillStyle='rgba(255,255,255,.06)'; g.fillRect(0,0,S,2);
});
TEX[SPIND] = textur((g,S) => {
  g.fillStyle='#4f6f92'; g.fillRect(0,0,S,S);
  for(const x of [2, S/2+1]){
    g.fillStyle='#5f83aa'; g.fillRect(x,3,S/2-4,S-6);
    g.fillStyle='#3d5773';
    for(let i=0;i<3;i++) g.fillRect(x+4,8+i*4,S/2-12,2);        // Lüftungsschlitze
    g.fillStyle='#c9cfd6'; g.fillRect(x+S/2-9,S*.48,3,7);        // Griff
    g.fillStyle='#2c3f56'; g.fillRect(x,3,1,S-6); g.fillRect(x+S/2-4,3,1,S-6);
  }
  g.fillStyle='#33485e'; g.fillRect(0,0,S,3); g.fillRect(0,S-3,S,3);
});
TEX[TUER] = textur((g,S) => {
  g.fillStyle='#7d5c3a'; g.fillRect(0,0,S,S);
  g.fillStyle='#8f6b45'; g.fillRect(4,4,S-8,S-8);
  g.fillStyle='#b9d2dd'; g.fillRect(S*.22,S*.14,S*.56,S*.28);   // Fensterchen
  g.fillStyle='#6a4c30'; g.fillRect(S*.22,S*.27,S*.56,2);
  g.fillStyle='#d8c88a'; g.fillRect(S*.78,S*.54,4,4);           // Klinke
  g.fillStyle='rgba(0,0,0,.18)'; g.fillRect(0,0,3,S); g.fillRect(S-3,0,3,S);
});
TEX[TAFEL] = textur((g,S) => {
  g.fillStyle='#8f6b45'; g.fillRect(0,0,S,S);
  g.fillStyle='#1d3226'; g.fillRect(3,4,S-6,S-14);
  g.strokeStyle='rgba(238,243,234,.55)'; g.lineWidth=1;
  g.beginPath(); g.moveTo(8,14); g.lineTo(24,14); g.moveTo(8,20); g.lineTo(34,20);
  g.moveTo(8,26); g.lineTo(19,26); g.stroke();
  g.font='9px monospace'; g.fillStyle='rgba(238,243,234,.7)'; g.fillText('7×8=', 34, 40);
  g.fillStyle='#c9b98a'; g.fillRect(2,S-10,S-4,4);              // Kreideablage
});
TEX[AUSGANG] = textur((g,S) => {
  g.fillStyle='#2e4a35'; g.fillRect(0,0,S,S);
  g.fillStyle='#79b84a'; g.fillRect(5,5,S-10,S-10);
  g.fillStyle='#0f1a13'; g.font='bold 13px sans-serif'; g.textAlign='center';
  g.fillText('AUS', S/2, S*.44); g.fillText('GANG', S/2, S*.66);
  g.strokeStyle='#d6f0b8'; g.lineWidth=2; g.strokeRect(5,5,S-10,S-10);
});

/* ── Figuren und Gegenstände als Billboards ────────────────────── */
function sprite(b, h, malen){
  const c = document.createElement('canvas'); c.width=b; c.height=h;
  const g = c.getContext('2d'); malen(g,b,h);
  const d = g.getImageData(0,0,b,h).data;
  const px = new Uint32Array(b*h);
  for(let i=0;i<b*h;i++)
    px[i] = d[i*4+3] < 128 ? 0 : ((255<<24)|(d[i*4+2]<<16)|(d[i*4+1]<<8)|d[i*4]);
  return {b, h, px};
}
function figur(g,B,H,{hemd,hose,haut,haar,extra}){
  g.fillStyle=hose; g.fillRect(B*.30,H*.58,B*.16,H*.36); g.fillRect(B*.54,H*.58,B*.16,H*.36);
  g.fillStyle='#2b2b30'; g.fillRect(B*.28,H*.92,B*.20,H*.07); g.fillRect(B*.52,H*.92,B*.20,H*.07);
  g.fillStyle=hemd; g.fillRect(B*.26,H*.30,B*.48,H*.30);
  g.fillStyle=haut; g.fillRect(B*.17,H*.32,B*.10,H*.24); g.fillRect(B*.73,H*.32,B*.10,H*.24);
  g.fillStyle=haut; g.fillRect(B*.32,H*.08,B*.36,H*.24);
  g.fillStyle=haar; g.fillRect(B*.30,H*.05,B*.40,H*.09);
  g.fillStyle='#1a1a1a'; g.fillRect(B*.39,H*.17,B*.05,H*.05); g.fillRect(B*.56,H*.17,B*.05,H*.05);
  if(extra) extra(g,B,H);
}
const SPR = {
  kreide: sprite(48,80,(g,B,H)=>figur(g,B,H,{hemd:'#c8543f',hose:'#2f3a4a',haut:'#e8bf95',haar:'#3a2b1e',
    extra:(g,B,H)=>{ g.fillStyle='#d9c17a'; g.fillRect(B*.80,H*.30,B*.05,H*.34);       // Lineal
                     g.fillStyle='#efe6c8'; g.fillRect(B*.33,H*.42,B*.34,H*.06); }})), // Kragen
  direktor: sprite(48,80,(g,B,H)=>figur(g,B,H,{hemd:'#3b4a6b',hose:'#20242e',haut:'#d9a97e',haar:'#20242e',
    extra:(g,B,H)=>{ g.fillStyle='#8f2f2f'; g.fillRect(B*.46,H*.30,B*.08,H*.22);       // Krawatte
                     g.fillStyle='#eef3ea'; g.fillRect(B*.40,H*.30,B*.20,H*.04); }})),
  heft: sprite(32,32,(g,B,H)=>{
    g.fillStyle='#2f4f8f'; g.fillRect(B*.16,H*.10,B*.68,H*.80);
    g.fillStyle='#f3f0e2'; g.fillRect(B*.22,H*.16,B*.56,H*.68);
    g.fillStyle='#c9c3ac'; for(let i=0;i<4;i++) g.fillRect(B*.28,H*.26+i*H*.12,B*.44,2);
    g.fillStyle='#d8503f'; g.fillRect(B*.16,H*.10,B*.06,H*.80); }),
  energie: sprite(24,32,(g,B,H)=>{
    g.fillStyle='#c9cfd6'; g.fillRect(B*.22,H*.18,B*.56,H*.72);
    g.fillStyle='#f2c14e'; g.fillRect(B*.22,H*.36,B*.56,H*.30);
    g.fillStyle='#20261c'; g.fillRect(B*.30,H*.10,B*.40,H*.10); }),
  seife: sprite(24,24,(g,B,H)=>{
    g.fillStyle='#8fd0e0'; g.fillRect(B*.14,H*.30,B*.72,H*.42);
    g.fillStyle='#c8ecf5'; g.fillRect(B*.20,H*.34,B*.60,H*.12); }),
  zonk: sprite(26,20,(g,B,H)=>{
    g.fillStyle='#6b4326'; g.fillRect(B*.08,H*.26,B*.84,H*.48);
    g.fillStyle='#c98f4a'; g.fillRect(B*.14,H*.34,B*.72,H*.12);
    g.fillStyle='#efe6c8'; g.font='7px monospace'; g.fillText('ZONK', B*.18, H*.66); })
};

/* ── Eigene Grafiken ───────────────────────────────────────────────
   Liegt unter assets/ eine Datei mit passendem Namen, ersetzt sie die
   eingebaute Zeichnung. Fehlt sie, bleibt es bei der gezeichneten —
   das Spiel läuft also auch mit leerem Ordner.
     Wände (werden auf 64x64 gebracht):
       wand.png  spind.png  tuer.png  tafel.png  ausgang.png
     Figuren und Gegenstände (Seitenverhältnis bleibt, transparent):
       kreide.png  direktor.png  heft.png  energie.png  seife.png  zonk.png   */
const WAND_DATEI  = {[WAND]:'wand', [SPIND]:'spind', [TUER]:'tuer', [TAFEL]:'tafel', [AUSGANG]:'ausgang'};
const FIGUR_DATEI = ['kreide','direktor','heft','energie','seife','zonk'];

function ladeBild(pfad){
  return new Promise(ok => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => ok(null);
    i.src = pfad;
  });
}
function nachPixeln(bildchen, b, h, mitAlpha){
  const c = document.createElement('canvas'); c.width=b; c.height=h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(bildchen, 0, 0, b, h);
  const d = g.getImageData(0,0,b,h).data;
  const px = new Uint32Array(b*h);
  for(let i=0;i<b*h;i++)
    px[i] = (mitAlpha && d[i*4+3] < 128) ? 0
          : (255<<24) | (d[i*4+2]<<16) | (d[i*4+1]<<8) | d[i*4];
  return px;
}
let eigeneGrafiken = 0;
async function eigeneLaden(){
  const versuche = [];
  for(const [zelle, name] of Object.entries(WAND_DATEI))
    versuche.push(ladeBild(`assets/${name}.png`).then(b => {
      if(b){ TEX[zelle] = nachPixeln(b, TG, TG, false); eigeneGrafiken++; }
    }));
  for(const name of FIGUR_DATEI)
    versuche.push(ladeBild(`assets/${name}.png`).then(b => {
      if(!b) return;
      // Höhe auf 80 normieren, Breite aus dem Seitenverhältnis
      const h = 80, br = Math.max(8, Math.round(80 * b.naturalWidth / b.naturalHeight));
      SPR[name] = {b:br, h, px: nachPixeln(b, br, h, true)};
      eigeneGrafiken++;
    }));
  await Promise.all(versuche);
  if(eigeneGrafiken) console.info(`[Nachsitzen] ${eigeneGrafiken} eigene Grafiken aus assets/ übernommen.`);
}

/* ── Bühne ─────────────────────────────────────────────────────── */
const leinwand = document.createElement('canvas');
$('#buehne').appendChild(leinwand);
const ctx = leinwand.getContext('2d');
ctx.imageSmoothingEnabled = false;
let W = 400, H = 240, bild = null, tiefe = null, puffer = null;
function passeAn(){
  const seite = innerWidth / innerHeight;
  H = 240; W = Math.round(klemm(H*seite, 220, 640));
  leinwand.width = W; leinwand.height = H;
  bild = ctx.createImageData(W, H);
  puffer = new Uint32Array(bild.data.buffer);
  tiefe = new Float32Array(W);
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', passeAn); passeAn();

/* ── Welt ──────────────────────────────────────────────────────── */
let s, spieler, kreide, direktor, dinge, hefte, laeuft = false;
const z = zufall(Date.now() & 0xffff);

function frei(){
  for(let v=0;v<600;v++){
    const x = 1+Math.floor(z()*(s.B-2)), y = 1+Math.floor(z()*(s.H-2));
    if(s.hol(x,y) === FLUR || s.hol(x,y) === RAUM) return {x:x+.5, y:y+.5};
  }
  return {x:s.achsenX[0]+.5, y:s.achsenY[0]+.5};
}

function startPlatz(){
  const richtungen = [0, Math.PI/2, Math.PI, -Math.PI/2];
  for(let v=0; v<900; v++){
    const x = 2+Math.floor(z()*(s.B-4)), y = 2+Math.floor(z()*(s.H-4));
    if(s.hol(x,y) !== FLUR) continue;
    for(const a of richtungen){
      const dx = Math.cos(a), dy = Math.sin(a);
      let weit = 0;
      while(weit < 8 && s.begehbar(x+.5 + dx*(weit+1), y+.5 + dy*(weit+1))) weit++;
      if(weit >= 6) return {x:x+.5, y:y+.5, a};
    }
  }
  return {x:s.achsenX[0]+.5, y:s.achsenY[0]+.5, a:0};
}

function neueRunde(){
  s = baueSchule(1000 + Math.floor(z()*9000));
  // Startplatz: ein Flurstück, aus dem heraus man in Blickrichtung
  // mindestens sechs Zellen weit sieht — sonst steht man an einer Wand.
  const st = startPlatz();
  spieler = {x:st.x, y:st.y, wx:1, wy:0, ebx:0, eby:.66, blick:st.a,
             hefte:0, fehler:0, tempo:2.1, sprint:0, gehalten:{energie:0,seife:0,zonk:0},
             energieUhr:0, gefangen:false, gewonnen:false};
  setzeBlick(st.a);

  // Hefte in Klassenräume verteilen
  const raeume = [...s.raeume];
  for(let i=raeume.length-1;i>0;i--){ const j=Math.floor(z()*(i+1)); [raeume[i],raeume[j]]=[raeume[j],raeume[i]]; }
  hefte = raeume.slice(0,7).map((r,i) => ({x:r.mx, y:r.my, nr:i+1, weg:false}));

  // Gegenstände in weitere Räume
  dinge = [];
  const arten = ['energie','seife','zonk','energie','seife','zonk','energie','seife'];
  for(const a of arten){ const p = frei(); dinge.push({x:p.x, y:p.y, art:a, weg:false}); }

  // Herr Kreide startet weit weg
  let kp = frei(), versuch = 0;
  while(Math.hypot(kp.x-st.x, kp.y-st.y) < 18 && versuch++ < 200) kp = frei();
  kreide = {x:kp.x, y:kp.y, tempo:1.35, weg:null, wegUhr:0, betaeubt:0, lockZiel:null,
            zustand:'wandert', wanderZiel:null};
  const dp = frei();
  direktor = {x:dp.x, y:dp.y, tempo:1.6, weg:null, wegUhr:0, ziel:null, ruheUhr:0};
}
function setzeBlick(a){
  spieler.wx = Math.cos(a); spieler.wy = Math.sin(a);
  spieler.ebx = -spieler.wy*.66; spieler.eby = spieler.wx*.66;
  spieler.blick = a;
}

/* ── Eingabe ───────────────────────────────────────────────────── */
const taste = {};
const bindung = {KeyW:'vor',ArrowUp:'vor',KeyS:'zurueck',ArrowDown:'zurueck',
                 KeyA:'links',KeyD:'rechts',ArrowLeft:'drehL',ArrowRight:'drehR',
                 ShiftLeft:'rennen',ShiftRight:'rennen'};
addEventListener('keydown', e => {
  if($('#heft').classList.contains('an')) return;
  if(bindung[e.code]){ taste[bindung[e.code]] = true; e.preventDefault(); }
  if(e.code === 'KeyE') nehmen();
  if(e.code === 'Digit1') benutze('energie');
  if(e.code === 'Digit2') benutze('seife');
  if(e.code === 'Digit3') benutze('zonk');
});
addEventListener('keyup', e => { if(bindung[e.code]){ taste[bindung[e.code]] = false; e.preventDefault(); } });
leinwand.addEventListener('click', () => { if(laeuft && !document.pointerLockElement) leinwand.requestPointerLock(); });
addEventListener('mousemove', e => {
  if(document.pointerLockElement === leinwand) setzeBlick(spieler.blick + e.movementX * .0026);
});

const knueppel = {an:false, id:-1, mx:0, my:0, dx:0, dy:0};
if(matchMedia('(pointer:coarse)').matches) $('#touch').classList.add('an');
const stick = $('#stick');
stick.addEventListener('pointerdown', e => {
  knueppel.an = true; knueppel.id = e.pointerId;
  const r = stick.getBoundingClientRect(); knueppel.mx = r.left+r.width/2; knueppel.my = r.top+r.height/2;
  stick.setPointerCapture(e.pointerId); e.preventDefault();
});
stick.addEventListener('pointermove', e => {
  if(!knueppel.an || e.pointerId !== knueppel.id) return;
  const dx = e.clientX-knueppel.mx, dy = e.clientY-knueppel.my, d = Math.hypot(dx,dy)||1;
  const k = Math.min(1, d/50);
  knueppel.dx = dx/d*k; knueppel.dy = dy/d*k;
  stick.querySelector('i').style.transform = `translate(${knueppel.dx*38}px,${knueppel.dy*38}px)`;
});
const stickAus = e => { if(e.pointerId!==knueppel.id) return;
  knueppel.an=false; knueppel.dx=knueppel.dy=0; stick.querySelector('i').style.transform=''; };
stick.addEventListener('pointerup', stickAus); stick.addEventListener('pointercancel', stickAus);
let blickId = -1, blickX = 0;
const blickFeld = $('#blick');
blickFeld.addEventListener('pointerdown', e => { blickId = e.pointerId; blickX = e.clientX;
  blickFeld.setPointerCapture(e.pointerId); e.preventDefault(); });
blickFeld.addEventListener('pointermove', e => {
  if(e.pointerId !== blickId) return;
  setzeBlick(spieler.blick + (e.clientX-blickX)*.0075); blickX = e.clientX;
});
blickFeld.addEventListener('pointerup', e => { if(e.pointerId===blickId) blickId=-1; });
function tippKnopf(id, aktion, halten){
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.classList.add('gedrueckt');
    if(halten) taste[halten]=true; else aktion(); });
  const aus = e => { e.preventDefault(); el.classList.remove('gedrueckt'); if(halten) taste[halten]=false; };
  el.addEventListener('pointerup', aus); el.addEventListener('pointercancel', aus);
}
tippKnopf('#tRennen', null, 'rennen');
tippKnopf('#tNutzen', () => { if(!nehmen()) benutze(spieler.gehalten.seife?'seife':spieler.gehalten.energie?'energie':'zonk'); });

/* ── Hefte und Mathe ───────────────────────────────────────────── */
const heftLage = {aktiv:null, aufgabe:0, loesung:0, fehlerHier:0};

/* ── Rechenaufgaben ────────────────────────────────────────────────
   Der Druck soll aus der Verfolgung kommen, nicht aus dem Kopfrechnen.
   Nichts geht über das kleine Einmaleins hinaus, Minus wird nie
   negativ, Geteilt geht immer glatt auf.                            */
let schwere = localStorage.getItem('nachsitzen.schwere') || 'leicht';
const r = (a,b) => a + Math.floor(Math.random()*(b-a+1));
const w = (...v) => v[Math.floor(Math.random()*v.length)];

/* Jede Stufe schaltet eine neue Art frei; gewürfelt wird aus allen bisher
   freigeschalteten, mit Übergewicht auf der neuesten. Dadurch steigt es
   spürbar an, ohne dass Heft 6 plötzlich leichter ist als Heft 3.        */
const AUFGABEN = {
  leicht: [
    () => { const a=r(1,9), b=r(1,9);   return {t:`${a} + ${b}`, l:a+b}; },
    () => { const a=r(6,18), b=r(1,6);  return {t:`${a} − ${b}`, l:a-b}; },
    () => { const a=r(10,29), b=r(2,9); return {t:`${a} + ${b}`, l:a+b}; },
    () => { const a=r(18,45), b=r(2,9); return {t:`${a} − ${b}`, l:a-b}; }
  ],
  normal: [
    () => { const a=r(1,9), b=r(1,9);   return {t:`${a} + ${b}`, l:a+b}; },
    () => { const a=r(12,49), b=r(2,9); return w(
              {t:`${a} + ${b}`, l:a+b}, {t:`${a} − ${b}`, l:a-b}); },
    () => { const a=r(2,9), b=r(2,5);   return {t:`${a} × ${b}`, l:a*b}; },
    () => { const a=r(2,9), b=r(2,9);   return w(
              {t:`${a} × ${b}`, l:a*b}, {t:`${a*b} ÷ ${b}`, l:a}); },
    () => { const a=r(2,9), b=r(2,9), c=r(2,9); return {t:`${a} × ${b} + ${c}`, l:a*b+c}; }
  ],
  schwer: [
    () => { const a=r(12,49), b=r(3,9);  return {t:`${a} + ${b}`, l:a+b}; },
    () => { const a=r(2,10), b=r(2,10);  return {t:`${a} × ${b}`, l:a*b}; },
    () => { const a=r(24,68), b=r(11,39);return w(
              {t:`${a} + ${b}`, l:a+b}, {t:`${a} − ${b}`, l:a-b}); },
    () => { const a=r(3,12), b=r(3,12);  return w(
              {t:`${a} × ${b}`, l:a*b}, {t:`${a*b} ÷ ${b}`, l:a}); },
    () => { const a=r(4,12), b=r(4,12), c=r(3,15); return w(
              {t:`${a} × ${b} + ${c}`, l:a*b+c}, {t:`${a} × ${b} − ${c}`, l:a*b-c}); }
  ]
};
function frageBauen(heftNr, aufgabeNr){
  const liste = AUFGABEN[schwere] || AUFGABEN.normal;
  const stufe = heftNr + (aufgabeNr === 2 ? 1 : 0);          // dritte zählt als ein Heft mehr
  const offen = Math.min(liste.length, Math.max(1, Math.round(stufe * liste.length / 8)));
  // Meist die zuletzt freigeschaltete Art, sonst eine der älteren
  const i = (offen > 1 && Math.random() < .38) ? Math.floor(Math.random()*(offen-1)) : offen-1;
  return liste[i]();
}

function heftOeffnen(h){
  heftLage.aktiv = h; heftLage.aufgabe = 0; heftLage.fehlerHier = 0;
  $('#heft').classList.add('an');
  if(document.pointerLockElement) document.exitPointerLock();
  for(const k in taste) taste[k] = false;
  naechsteAufgabe();
}
function naechsteAufgabe(){
  const h = heftLage.aktiv;
  const f = frageBauen(h.nr, heftLage.aufgabe);
  heftLage.loesung = f.l;
  $('#heftName').textContent = 'Heft ' + h.nr;
  $('#heftFort').textContent = `Aufgabe ${heftLage.aufgabe+1} von 3`;
  $('#frage').textContent = f.t;
  $('#antwort').value = '';
  $('#heftFehler').textContent = heftLage.fehlerHier ? heftLage.fehlerHier + ' daneben' : '';
  setTimeout(() => $('#antwort').focus(), 30);
}
function antwortPruefen(){
  const w = parseInt($('#antwort').value, 10);
  if(Number.isNaN(w)) return;
  if(w === heftLage.loesung){
    heftLage.aufgabe++;
    if(heftLage.aufgabe >= 3){
      heftLage.aktiv.weg = true; spieler.hefte++;
      $('#heft').classList.remove('an');
      meldung('HEFT ' + heftLage.aktiv.nr, spieler.hefte >= 7
        ? 'Alle sieben. Raus hier!' : 'Herr Kreide wird schneller');
      hoert(spieler.x, spieler.y, 1);
      heftLage.aktiv = null;
      if(laeuft) leinwand.requestPointerLock();
    } else naechsteAufgabe();
  } else {
    heftLage.fehlerHier++; spieler.fehler++;
    $('#frage').classList.remove('wackel'); void $('#frage').offsetWidth; $('#frage').classList.add('wackel');
    $('#heftFehler').textContent = heftLage.fehlerHier + ' daneben';
    $('#antwort').value = '';
    hoert(spieler.x, spieler.y, 1);                            // Fehler ruft ihn her
  }
}
$('#antwort').addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); antwortPruefen(); } });
(() => {
  const zb = $('#ziffern');
  for(const t of ['1','2','3','4','5','6','7','8','9','←','0','OK']){
    const b = document.createElement('button'); b.textContent = t;
    b.addEventListener('click', () => {
      const f = $('#antwort');
      if(t === '←') f.value = f.value.slice(0,-1);
      else if(t === 'OK') antwortPruefen();
      else f.value += t;
    });
    zb.appendChild(b);
  }
})();

/* ── Aufnehmen und Benutzen ────────────────────────────────────── */
function nehmen(){
  for(const h of hefte){
    if(!h.weg && Math.hypot(h.x-spieler.x, h.y-spieler.y) < .9){ heftOeffnen(h); return true; }
  }
  for(const d of dinge){
    if(!d.weg && Math.hypot(d.x-spieler.x, d.y-spieler.y) < .8){
      d.weg = true; spieler.gehalten[d.art]++;
      meldung(NAME[d.art].toUpperCase(), 'eingesteckt'); return true;
    }
  }
  return false;
}
const NAME = {energie:'Energie', seife:'Seife', zonk:'Zonk'};
function benutze(art){
  if(!art || !spieler.gehalten[art]) return;
  spieler.gehalten[art]--;
  if(art === 'energie'){ spieler.energieUhr = 18; meldung('ENERGIE', '18 s schneller, ohne Lärm'); }
  if(art === 'seife'){ dinge.push({x:spieler.x, y:spieler.y, art:'seife', gelegt:true, weg:false});
                       meldung('SEIFE', 'liegt jetzt hinter dir'); }
  if(art === 'zonk'){ const a = spieler.blick + Math.PI;
    hoert(spieler.x + Math.cos(a)*8, spieler.y + Math.sin(a)*8, 1);
    meldung('ZONK', 'Krach hinter dir geworfen'); }
}

/* ── Herr Kreide ───────────────────────────────────────────────── */
function hoert(x, y, staerke){
  if(kreide.betaeubt > 0) return;
  kreide.zustand = 'jagt'; kreide.lockZiel = {x, y}; kreide.wegUhr = 0;
}
function kreideDenken(dt){
  const kt = 1.35 + (spieler.hefte + spieler.fehler) * .30;     // wird mit jedem Heft zäher
  kreide.tempo = kt;
  if(kreide.betaeubt > 0){ kreide.betaeubt -= dt; return; }

  const dSp = Math.hypot(spieler.x-kreide.x, spieler.y-kreide.y);
  const rennt = taste.rennen && (taste.vor||taste.zurueck||taste.links||taste.rechts||knueppel.dx||knueppel.dy);
  if(rennt && spieler.energieUhr <= 0 && dSp < 13) hoert(spieler.x, spieler.y, 1);
  if(dSp < 4.5 && sicht(kreide, spieler)) hoert(spieler.x, spieler.y, 1);

  let ziel = kreide.lockZiel;
  if(kreide.zustand !== 'jagt' || !ziel){
    if(!kreide.wanderZiel || Math.hypot(kreide.wanderZiel.x-kreide.x, kreide.wanderZiel.y-kreide.y) < 1)
      kreide.wanderZiel = frei();
    ziel = kreide.wanderZiel;
  }
  kreide.wegUhr -= dt;
  if(kreide.wegUhr <= 0 || !kreide.weg || !kreide.weg.length){
    kreide.wegUhr = .45;
    kreide.weg = wegSuche(s, kreide.x, kreide.y, ziel.x, ziel.y);
  }
  laufeWeg(kreide, dt);
  if(kreide.zustand === 'jagt' && kreide.lockZiel &&
     Math.hypot(kreide.lockZiel.x-kreide.x, kreide.lockZiel.y-kreide.y) < 1.1){
    kreide.zustand = 'wandert'; kreide.lockZiel = null; kreide.weg = null;
  }
  // Seife?
  for(const d of dinge){
    if(d.gelegt && !d.weg && Math.hypot(d.x-kreide.x, d.y-kreide.y) < .7){
      d.weg = true; kreide.betaeubt = 5; kreide.weg = null;
      meldung('AUSGERUTSCHT', 'Herr Kreide liegt fünf Sekunden');
    }
  }
  if(dSp < .62 && !spieler.gewonnen) ende(false, 'Herr Kreide hat dich am Ärmel.');
}
function laufeWeg(o, dt){
  if(!o.weg || !o.weg.length) return;
  const p = o.weg[0];
  const dx = p.x-o.x, dy = p.y-o.y, d = Math.hypot(dx,dy);
  if(d < .12){ o.weg.shift(); return; }
  o.x += dx/d * o.tempo * dt; o.y += dy/d * o.tempo * dt;
}
function sicht(a, b){
  const dx = b.x-a.x, dy = b.y-a.y, d = Math.hypot(dx,dy);
  const n = Math.ceil(d*3);
  for(let i=1;i<n;i++){
    const t = i/n;
    if(!s.begehbar(a.x+dx*t, a.y+dy*t)) return false;
  }
  return true;
}

/* ── Der Direktor ──────────────────────────────────────────────── */
function direktorDenken(dt){
  if(direktor.ruheUhr > 0){ direktor.ruheUhr -= dt; return; }
  if(!direktor.ziel || Math.hypot(direktor.ziel.x-direktor.x, direktor.ziel.y-direktor.y) < 1)
    direktor.ziel = frei();
  direktor.wegUhr -= dt;
  if(direktor.wegUhr <= 0 || !direktor.weg || !direktor.weg.length){
    direktor.wegUhr = .8;
    direktor.weg = wegSuche(s, direktor.x, direktor.y, direktor.ziel.x, direktor.ziel.y);
  }
  laufeWeg(direktor, dt);

  const rennt = taste.rennen && (taste.vor||taste.zurueck||taste.links||taste.rechts||knueppel.dx||knueppel.dy);
  const d = Math.hypot(spieler.x-direktor.x, spieler.y-direktor.y);
  const imFlur = s.hol(Math.floor(spieler.x), Math.floor(spieler.y)) === FLUR;
  if(rennt && imFlur && d < 7 && sicht(direktor, spieler)){
    // Erwischt: ab in einen weit entfernten Raum
    let p = frei(), v = 0;
    while(Math.hypot(p.x-spieler.x, p.y-spieler.y) < 14 && v++ < 200) p = frei();
    spieler.x = p.x; spieler.y = p.y;
    direktor.ruheUhr = 9; direktor.weg = null;
    meldung('KEIN RENNEN IM FLUR', 'Der Direktor hat dich versetzt');
  }
}

/* ── Bewegung ──────────────────────────────────────────────────── */
function bewege(dt){
  let vor = (taste.vor?1:0)-(taste.zurueck?1:0);
  let quer = (taste.rechts?1:0)-(taste.links?1:0);
  if(knueppel.dx || knueppel.dy){ vor = -knueppel.dy; quer = knueppel.dx; }
  if(taste.drehL) setzeBlick(spieler.blick - 2.3*dt);
  if(taste.drehR) setzeBlick(spieler.blick + 2.3*dt);

  let t = spieler.tempo;
  if(taste.rennen) t *= 1.55;
  if(spieler.energieUhr > 0){ t *= 1.35; spieler.energieUhr -= dt; }

  const nx = spieler.wx*vor + (-spieler.wy)*quer;
  const ny = spieler.wy*vor + ( spieler.wx)*quer;
  const l = Math.hypot(nx,ny) || 1;
  const sx = nx/l*t*dt, sy = ny/l*t*dt;
  if(vor || quer){
    // Achsen getrennt prüfen, damit man an Wänden entlanggleitet, und mit
    // festem Radius statt nur einem Schritt Vorausschau
    const R = .28;
    if(s.begehbar(spieler.x + sx + Math.sign(sx)*R, spieler.y)) spieler.x += sx;
    if(s.begehbar(spieler.x, spieler.y + sy + Math.sign(sy)*R)) spieler.y += sy;
  }
  // Ausgang?
  if(spieler.hefte >= 7 && s.hol(Math.floor(spieler.x), Math.floor(spieler.y)) === AUSGANG)
    ende(true, 'Sieben Hefte, drei Türen, du hast die richtige genommen.');
}

/* ── Raycaster ─────────────────────────────────────────────────── */
function zeichne(){
  const px = spieler.x, py = spieler.y;
  const dx = spieler.wx, dy = spieler.wy, ebx = spieler.ebx, eby = spieler.eby;

  // Decke und Boden
  for(let y=0;y<H;y++){
    const oben = y < H/2;
    const t = oben ? y/(H/2) : (y-H/2)/(H/2);
    const c = oben
      ? mischFarbe(0x1c2119, 0x3c443a, t)
      : mischFarbe(0x746f60, 0x35322b, 1-t);
    puffer.fill(0xff000000 | ((c&0xff)<<16) | (((c>>8)&0xff)<<8) | ((c>>16)&0xff), y*W, y*W+W);
  }

  for(let x=0;x<W;x++){
    const kam = 2*x/W - 1;
    const rdx = dx + ebx*kam, rdy = dy + eby*kam;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = Math.abs(1/rdx), ddy = Math.abs(1/rdy);
    let stx, sty, sdx, sdy;
    if(rdx < 0){ stx = -1; sdx = (px-mx)*ddx; } else { stx = 1; sdx = (mx+1-px)*ddx; }
    if(rdy < 0){ sty = -1; sdy = (py-my)*ddy; } else { sty = 1; sdy = (my+1-py)*ddy; }
    let seite = 0, feld = WAND, sicher = 0;
    while(sicher++ < 128){
      if(sdx < sdy){ sdx += ddx; mx += stx; seite = 0; }
      else { sdy += ddy; my += sty; seite = 1; }
      feld = s.hol(mx,my);
      if(feld===WAND || feld===SPIND || feld===TUER || feld===TAFEL || feld===AUSGANG) break;
    }
    const dist = seite === 0 ? (sdx-ddx) : (sdy-ddy);
    tiefe[x] = dist;
    const hoch = Math.floor(H/dist);
    let y0 = Math.floor(-hoch/2 + H/2), y1 = Math.floor(hoch/2 + H/2);
    const tex = TEX[feld] || TEX[WAND];
    let wandX = seite === 0 ? py + dist*rdy : px + dist*rdx;
    wandX -= Math.floor(wandX);
    let tx = Math.floor(wandX*TG);
    if(seite === 0 && rdx > 0) tx = TG-tx-1;
    if(seite === 1 && rdy < 0) tx = TG-tx-1;
    const schritt = TG/hoch;
    let texPos = (y0 < 0 ? -y0 : 0) * schritt;
    const dunkel = seite === 1;
    const neb = klemm(1 - dist/17, .18, 1);
    const a0 = Math.max(y0,0), a1 = Math.min(y1,H);
    for(let y=a0;y<a1;y++){
      const ty = Math.min(TG-1, texPos|0); texPos += schritt;
      let c = tex[ty*TG+tx];
      let r = c&0xff, gg = (c>>8)&0xff, b = (c>>16)&0xff;
      const f = neb * (dunkel ? .72 : 1);
      puffer[y*W+x] = 0xff000000 | (((b*f)|0)<<16) | (((gg*f)|0)<<8) | ((r*f)|0);
    }
  }

  // Billboards nach Entfernung hinten zuerst
  const liste = [];
  for(const h of hefte) if(!h.weg) liste.push({x:h.x, y:h.y, sp:SPR.heft, hoehe:.55, boden:.30});
  for(const d of dinge) if(!d.weg) liste.push({x:d.x, y:d.y, sp:SPR[d.art], hoehe:.42, boden:.05});
  liste.push({x:kreide.x, y:kreide.y, sp:SPR.kreide, hoehe:1.0, boden:0});
  liste.push({x:direktor.x, y:direktor.y, sp:SPR.direktor, hoehe:1.0, boden:0});
  for(const o of liste) o.d = (o.x-px)**2 + (o.y-py)**2;
  liste.sort((a,b) => b.d - a.d);

  const invDet = 1/(ebx*dy - dx*eby);
  for(const o of liste){
    const rx = o.x-px, ry = o.y-py;
    const tx2 = invDet * (dy*rx - dx*ry);
    const ty2 = invDet * (-eby*rx + ebx*ry);
    if(ty2 <= .12) continue;
    const bx = Math.floor((W/2) * (1 + tx2/ty2));
    const hoehe = Math.abs(Math.floor(H/ty2 * o.hoehe));
    const versatz = Math.floor(H/ty2 * o.boden);
    const breite = Math.abs(Math.floor(H/ty2 * o.hoehe * (o.sp.b/o.sp.h)));
    const oben = Math.floor(H/2 + (H/ty2)/2 - hoehe - versatz);
    const neb = klemm(1 - ty2/17, .18, 1);
    for(let sx2=0; sx2<breite; sx2++){
      const x = bx - (breite>>1) + sx2;
      if(x < 0 || x >= W || ty2 >= tiefe[x]) continue;
      const tx3 = Math.min(o.sp.b-1, (sx2*o.sp.b/breite)|0);
      for(let sy2=0; sy2<hoehe; sy2++){
        const y = oben + sy2;
        if(y < 0 || y >= H) continue;
        const ty3 = Math.min(o.sp.h-1, (sy2*o.sp.h/hoehe)|0);
        const c = o.sp.px[ty3*o.sp.b+tx3];
        if(!c) continue;
        const r = c&0xff, gg = (c>>8)&0xff, b = (c>>16)&0xff;
        puffer[y*W+x] = 0xff000000 | (((b*neb)|0)<<16) | (((gg*neb)|0)<<8) | ((r*neb)|0);
      }
    }
  }
  ctx.putImageData(bild, 0, 0);
}
function mischFarbe(a, b, t){
  const ar=(a>>16)&255, ag=(a>>8)&255, ab=a&255;
  const br=(b>>16)&255, bg=(b>>8)&255, bb=b&255;
  return (((misch(ar,br,t))|0)<<16) | (((misch(ag,bg,t))|0)<<8) | ((misch(ab,bb,t))|0);
}

/* ── Karte, Anzeige, Meldungen ─────────────────────────────────── */
const kk = $('#karte canvas'), kg = kk.getContext('2d');
function malKarte(){
  const S = kk.width / s.B;
  kg.fillStyle = '#0d1710'; kg.fillRect(0,0,kk.width,kk.height);
  for(let y=0;y<s.H;y++) for(let x=0;x<s.B;x++){
    const v = s.hol(x,y);
    if(v===WAND) continue;
    kg.fillStyle = v===AUSGANG ? '#79b84a' : v===TUER ? '#8f6b45' : v===RAUM ? '#2b3a2f' : '#3d5142';
    kg.fillRect(x*S, y*S, S, S);
  }
  for(const h of hefte) if(!h.weg){ kg.fillStyle='#f2c14e'; kg.fillRect(h.x*S-1.5, h.y*S-1.5, 4, 4); }
  kg.fillStyle='#d8503f'; kg.fillRect(kreide.x*S-2, kreide.y*S-2, 5, 5);
  kg.fillStyle='#6b8fd8'; kg.fillRect(direktor.x*S-1.5, direktor.y*S-1.5, 4, 4);
  kg.fillStyle='#eef3ea'; kg.fillRect(spieler.x*S-2, spieler.y*S-2, 5, 5);
  kg.strokeStyle='#eef3ea'; kg.lineWidth=1; kg.beginPath();
  kg.moveTo(spieler.x*S, spieler.y*S);
  kg.lineTo(spieler.x*S + spieler.wx*7, spieler.y*S + spieler.wy*7); kg.stroke();
}
let meldeUhr = 0;
function meldung(gross, klein){
  $('#meldung').innerHTML = gross + (klein ? '<small>'+klein+'</small>' : '');
  $('#meldung').classList.add('an'); meldeUhr = 2.6;
}
function anzeige(dt){
  $('#hefte .zahl').textContent = spieler.hefte + ' / 7';
  const box = $('#sachen');
  const soll = ['energie','seife','zonk'].map((a,i) =>
    `<div class="s ${spieler.gehalten[a]?'hat':''}"><b>${spieler.gehalten[a]}</b>${NAME[a]}</div>`).join('');
  if(box.innerHTML !== soll) box.innerHTML = soll;
  const d = Math.hypot(spieler.x-kreide.x, spieler.y-kreide.y);
  const nah = klemm(1 - d/11, 0, 1);
  $('#naehe').style.boxShadow = `inset 0 0 ${90+nah*130}px ${20+nah*50}px rgba(216,80,63,${(nah*.55).toFixed(2)})`;
  if(meldeUhr > 0){ meldeUhr -= dt; if(meldeUhr <= 0) $('#meldung').classList.remove('an'); }
  malKarte();
}

/* ── Ende ──────────────────────────────────────────────────────── */
function ende(gewonnen, text){
  laeuft = false; spieler.gewonnen = gewonnen;
  if(document.pointerLockElement) document.exitPointerLock();
  $('#endeTitel').textContent = gewonnen ? 'RAUSGEKOMMEN' : 'ERWISCHT';
  $('#endeTitel').className = gewonnen ? 'gut' : 'schlecht';
  $('#endeText').textContent = text + (gewonnen ? '' :
    `  Hefte: ${spieler.hefte} von 7, ${spieler.fehler} Rechenfehler.`);
  $('#ende').classList.add('an');
  $('#hud').classList.remove('an');
}
$('#nochmal').addEventListener('click', () => { $('#ende').classList.remove('an'); starten(); });

/* ── Schleife ──────────────────────────────────────────────────── */
let vorher = performance.now();
function schleife(jetzt){
  requestAnimationFrame(schleife);
  const dt = Math.min((jetzt-vorher)/1000, .05); vorher = jetzt;
  if(!s) return;
  if(laeuft && !$('#heft').classList.contains('an')){
    bewege(dt); kreideDenken(dt); direktorDenken(dt);
  }
  zeichne();
  if(laeuft) anzeige(dt);
}
async function starten(){
  $('#losKnopf').textContent = 'LÄDT …';
  await eigeneLaden();
  $('#losKnopf').textContent = 'SCHULHAUS BETRETEN';
  neueRunde();
  $('#start').classList.add('weg'); $('#hud').classList.add('an');
  laeuft = true;
  meldung('SIEBEN HEFTE', 'Die gelben Punkte auf der Karte');
  leinwand.requestPointerLock();
}
(() => {
  const box = $('#schwere');
  const zeichne = () => [...box.children].forEach(b =>
    b.classList.toggle('an', b.dataset.s === schwere));
  for(const [id, name, hinweis] of [
      ['leicht','Leicht','Plus und Minus bis 50'],
      ['normal','Normal','dazu das kleine Einmaleins'],
      ['schwer','Schwer','bis 12 × 12 mit Zwischenschritt']]){
    const b = document.createElement('button');
    b.dataset.s = id; b.innerHTML = `${name}<small>${hinweis}</small>`;
    b.addEventListener('click', () => {
      schwere = id; localStorage.setItem('nachsitzen.schwere', id); zeichne();
    });
    box.appendChild(b);
  }
  zeichne();
})();
$('#losKnopf').addEventListener('click', starten);
neueRunde(); laeuft = false;
requestAnimationFrame(schleife);

window.__schule = {
  frageBauen, setSchwere:(v)=>{schwere=v},
  get eigeneGrafiken(){return eigeneGrafiken},
  get s(){return s}, get spieler(){return spieler}, get kreide(){return kreide},
  get direktor(){return direktor}, get hefte(){return hefte}, get dinge(){return dinge},
  starten, setzen:(x,y)=>{spieler.x=x;spieler.y=y;},
  alleHefte:()=>{for(const h of hefte)h.weg=true; spieler.hefte=7;},
  laueft:()=>laeuft
};
