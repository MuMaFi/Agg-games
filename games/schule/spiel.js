/* ═══════════════════════════════════════════════════════════════════
   NACHSITZEN — Schulhaus aus der Ich-Perspektive.
   Gerendert wird mit einem Raycaster: pro Bildspalte ein Strahl durchs
   Gitter (DDA), die getroffene Wand als Texturspalte in einen Puffer
   geschrieben, Figuren und Gegenstände danach als Billboards mit
   Tiefenprüfung. Kleine Innenauflösung, hart hochskaliert — das gibt
   den groben Look und läuft auch auf dem Handy.
   ═══════════════════════════════════════════════════════════════════ */
import { baueSchule, wegSuche, zufall, FLUR, WAND, RAUM, TUER, SPIND, TAFEL, AUSGANG } from './schule.js';
import * as klang from './klang.js';

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
/* Boden und Decke werden ab jetzt texturiert statt flach gefüllt —
   das ist der größte Unterschied im Bild. */
const BODEN = textur((g,S) => {
  // Linoleum in zwei Tönen, mit Fugen
  for(let j=0;j<2;j++) for(let i=0;i<2;i++){
    g.fillStyle = (i+j)%2 ? '#7d7a6b' : '#8c8879';
    g.fillRect(i*S/2, j*S/2, S/2, S/2);
  }
  g.fillStyle='rgba(255,255,255,.05)';
  for(let k=0;k<70;k++) g.fillRect(z0()*S, z0()*S, 1+z0()*2, 1);   // Sprenkel
  g.fillStyle='rgba(40,38,32,.45)';
  g.fillRect(0,S/2-1,S,2); g.fillRect(S/2-1,0,2,S);
  g.fillRect(0,0,S,1); g.fillRect(0,0,1,S);
});
const DECKE = textur((g,S) => {
  g.fillStyle='#3a3f38'; g.fillRect(0,0,S,S);
  g.fillStyle='#454b42';
  g.fillRect(2,2,S-4,S-4);
  g.fillStyle='rgba(20,22,19,.5)';
  g.fillRect(0,0,S,2); g.fillRect(0,0,2,S);
  // Leuchtröhre in jeder zweiten Platte
  g.fillStyle='#cfd6c4'; g.fillRect(S*.22, S*.42, S*.56, S*.16);
  g.fillStyle='#eef3ea'; g.fillRect(S*.24, S*.44, S*.52, S*.08);
});
/* Dieselbe Platte mit erloschener Röhre. Ungefähr ein Drittel der Decke
   bekommt sie — ein Gang, in dem jede Röhre brennt, sieht aus wie ein Amt,
   einer mit Lücken sieht aus, als hätte ihn jemand vergessen. */
const DECKE_TOT = textur((g,S) => {
  g.fillStyle='#33382f'; g.fillRect(0,0,S,S);
  g.fillStyle='#3b4038'; g.fillRect(2,2,S-4,S-4);
  g.fillStyle='rgba(16,18,15,.55)';
  g.fillRect(0,0,S,2); g.fillRect(0,0,2,S);
  g.fillStyle='#2a2e27'; g.fillRect(S*.22, S*.42, S*.56, S*.16);
  g.fillStyle='#4a4a3c'; g.fillRect(S*.24, S*.44, S*.52, S*.08);   // kaltes Glas
});

/* Wandvarianten: Plakat und Anschlagbrett, damit die Gänge nicht
   alle gleich aussehen. Welche Zelle welche bekommt, entscheidet ein
   Streuwert aus ihren Koordinaten — bleibt also über die Runde gleich. */
const WAND_PLAKAT = textur((g,S) => {
  g.fillStyle='#cdbf9a'; g.fillRect(0,0,S,S);
  g.fillStyle='#4e7a55'; g.fillRect(0,S*.58,S,S*.42);
  g.fillStyle='#8a9b6e'; g.fillRect(0,S*.55,S,S*.05);
  g.fillStyle='#d8503f'; g.fillRect(S*.22,S*.10,S*.56,S*.38);
  g.fillStyle='#f3f0e2'; g.fillRect(S*.26,S*.14,S*.48,S*.16);
  g.fillStyle='#20261c'; for(let i=0;i<3;i++) g.fillRect(S*.28,S*.34+i*4,S*.30-i*3,2);
  g.fillStyle='rgba(0,0,0,.22)'; g.fillRect(S*.22,S*.48,S*.56,2);
});
const WAND_BRETT = textur((g,S) => {
  g.fillStyle='#cdbf9a'; g.fillRect(0,0,S,S);
  g.fillStyle='#4e7a55'; g.fillRect(0,S*.58,S,S*.42);
  g.fillStyle='#8a9b6e'; g.fillRect(0,S*.55,S,S*.05);
  g.fillStyle='#6b4326'; g.fillRect(S*.10,S*.08,S*.80,S*.42);
  g.fillStyle='#9a7a52'; g.fillRect(S*.13,S*.11,S*.74,S*.36);
  const bl=[['#f3f0e2',.17,.15,.20,.14],['#e8dfa8',.42,.13,.16,.18],
            ['#dfe8f0',.62,.18,.20,.12],['#f0dfe0',.24,.32,.18,.12]];
  for(const [f,x,y,b,h] of bl){ g.fillStyle=f; g.fillRect(S*x,S*y,S*b,S*h);
    g.fillStyle='rgba(0,0,0,.25)'; g.fillRect(S*x,S*(y+h),S*b,1); }
});
function wandVariante(mx,my){
  const h = ((mx*73856093) ^ (my*19349663)) >>> 0;
  const v = h % 11;
  return v === 3 ? WAND_PLAKAT : v === 7 ? WAND_BRETT : TEX[WAND];
}

TEX[AUSGANG] = textur((g,S) => {
  g.fillStyle='#2e4a35'; g.fillRect(0,0,S,S);
  g.fillStyle='#79b84a'; g.fillRect(5,5,S-10,S-10);
  g.fillStyle='#0f1a13'; g.font='bold 13px sans-serif'; g.textAlign='center';
  g.fillText('AUS', S/2, S*.44); g.fillText('GANG', S/2, S*.66);
  g.strokeStyle='#d6f0b8'; g.lineWidth=2; g.strokeRect(5,5,S-10,S-10);
});

/* ── Figuren und Gegenstände als Billboards ────────────────────── */
function sprite(b, h, malen, rand = true){
  const c = document.createElement('canvas'); c.width=b; c.height=h;
  const g = c.getContext('2d'); malen(g,b,h);
  const d = g.getImageData(0,0,b,h).data;
  let px = new Uint32Array(b*h);
  for(let i=0;i<b*h;i++)
    px[i] = d[i*4+3] < 128 ? 0 : ((255<<24)|(d[i*4+2]<<16)|(d[i*4+1]<<8)|d[i*4]);
  if(rand) px = mitRand(px, b, h);
  return {b, h, px};
}
/* Dunkler Umriss um alles Undurchsichtige — dadurch heben sich die
   Figuren von der Wand ab, statt in ihr zu verschwimmen. */
function mitRand(px, b, h){
  const aus = px.slice();
  for(let y=0;y<h;y++) for(let x=0;x<b;x++){
    if(px[y*b+x]) continue;
    let nachbar = false;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, ny=y+dy;
      if(nx>=0&&ny>=0&&nx<b&&ny<h&&px[ny*b+nx]){ nachbar = true; break; }
    }
    if(nachbar) aus[y*b+x] = 0xff1a1614;
  }
  return aus;
}

/* Zeichenhilfe: spiegelt links/rechts automatisch, damit Figuren
   symmetrisch bleiben, ohne jede Koordinate doppelt zu schreiben. */
function paar(g, farbe, x, y, b, h, B){
  g.fillStyle = farbe;
  g.fillRect(x, y, b, h);
  g.fillRect(B-x-b, y, b, h);
}

/* Herr Kreide — Glatze mit Haarkranz, Pullunder, Lineal in der Hand. */
function malKreide(g, B, H){
  const HAUT='#e9c39a', HAUT_D='#c9a077', KRANZ='#5e564d', PULLI='#3f7a63',
        PULLI_D='#2e5c4a', HEMD='#eef3ea', HOSE='#3b3f4a', SCHUH='#23252b';
  // Beine
  paar(g, HOSE, B*.30, H*.62, B*.15, H*.28, B);
  paar(g, SCHUH, B*.27, H*.89, B*.20, H*.07, B);
  // Rumpf
  g.fillStyle = PULLI;  g.fillRect(B*.24, H*.34, B*.52, H*.30);
  g.fillStyle = PULLI_D; g.fillRect(B*.24, H*.58, B*.52, H*.06);
  // Hemdkragen als V
  g.fillStyle = HEMD;
  g.fillRect(B*.40, H*.34, B*.20, H*.05);
  g.fillRect(B*.44, H*.39, B*.12, H*.05);
  // Arme
  paar(g, PULLI, B*.16, H*.36, B*.09, H*.18, B);
  paar(g, HAUT,  B*.16, H*.54, B*.09, H*.07, B);
  // Kopf: Glatze
  g.fillStyle = HAUT;   g.fillRect(B*.30, H*.10, B*.40, H*.22);
  g.fillStyle = HAUT;   g.fillRect(B*.34, H*.07, B*.32, H*.04);   // gewölbter Scheitel
  g.fillStyle = 'rgba(255,255,255,.30)';
  g.fillRect(B*.38, H*.09, B*.14, H*.03);                          // Glanz auf der Glatze
  paar(g, HAUT_D, B*.26, H*.18, B*.05, H*.07, B);                  // Ohren
  // Haarkranz nur an den Seiten und hinten
  paar(g, KRANZ, B*.28, H*.20, B*.04, H*.11, B);
  g.fillStyle = KRANZ; g.fillRect(B*.30, H*.29, B*.40, H*.03);
  // Gesicht
  g.fillStyle = '#f6f6f2'; g.fillRect(B*.37, H*.19, B*.09, H*.05); g.fillRect(B*.54, H*.19, B*.09, H*.05);
  g.fillStyle = '#20262e'; g.fillRect(B*.40, H*.20, B*.04, H*.04); g.fillRect(B*.57, H*.20, B*.04, H*.04);
  g.fillStyle = KRANZ;    g.fillRect(B*.36, H*.16, B*.11, H*.02); g.fillRect(B*.53, H*.16, B*.11, H*.02);
  g.fillStyle = HAUT_D;   g.fillRect(B*.47, H*.22, B*.06, H*.05);  // Nase
  g.fillStyle = '#8f5f52'; g.fillRect(B*.42, H*.28, B*.16, H*.02); // Mund
  g.fillStyle = HAUT;     g.fillRect(B*.42, H*.32, B*.16, H*.03);  // Hals
  // Lineal
  g.fillStyle = '#d9c17a'; g.fillRect(B*.80, H*.28, B*.06, H*.34);
  g.fillStyle = '#a8894a';
  for(let i=0;i<7;i++) g.fillRect(B*.80, H*(.31+i*.045), B*.03, H*.008);
}

/* Der Direktor — grauer Anzug, Brille, Klemmbrett. */
function malDirektor(g, B, H){
  const HAUT='#dcae86', HAAR='#8e9099', ANZUG='#404a5c', ANZUG_D='#2f3746',
        HEMD='#eef3ea', KRAW='#8f2f3a', SCHUH='#1e2026';
  paar(g, ANZUG_D, B*.30, H*.62, B*.15, H*.28, B);
  paar(g, SCHUH, B*.27, H*.89, B*.20, H*.07, B);
  g.fillStyle = ANZUG; g.fillRect(B*.24, H*.34, B*.52, H*.30);
  g.fillStyle = HEMD;  g.fillRect(B*.42, H*.34, B*.16, H*.24);
  g.fillStyle = KRAW;  g.fillRect(B*.46, H*.36, B*.08, H*.20);
  g.fillStyle = ANZUG; g.fillRect(B*.24, H*.34, B*.14, H*.30); g.fillRect(B*.62, H*.34, B*.14, H*.30);
  paar(g, ANZUG, B*.16, H*.36, B*.09, H*.18, B);
  paar(g, HAUT,  B*.16, H*.54, B*.09, H*.07, B);
  g.fillStyle = HAUT; g.fillRect(B*.31, H*.11, B*.38, H*.21);
  g.fillStyle = HAAR; g.fillRect(B*.29, H*.08, B*.42, H*.07);
  paar(g, HAAR, B*.28, H*.14, B*.04, H*.10, B);
  paar(g, HAUT, B*.26, H*.18, B*.05, H*.07, B);
  // Brille
  g.fillStyle = '#20262e';
  g.fillRect(B*.34, H*.19, B*.13, H*.02); g.fillRect(B*.53, H*.19, B*.13, H*.02);
  g.fillStyle = '#cfe2ea'; g.fillRect(B*.36, H*.21, B*.09, H*.05); g.fillRect(B*.55, H*.21, B*.09, H*.05);
  g.fillStyle = '#20262e'; g.fillRect(B*.45, H*.22, B*.10, H*.015);
  g.fillStyle = '#c08f6a'; g.fillRect(B*.47, H*.24, B*.06, H*.05);
  g.fillStyle = '#7a4f45'; g.fillRect(B*.43, H*.29, B*.14, H*.02);
  // Klemmbrett
  g.fillStyle = '#8a6a45'; g.fillRect(B*.72, H*.44, B*.18, H*.20);
  g.fillStyle = '#f3f0e2'; g.fillRect(B*.74, H*.47, B*.14, H*.15);
  g.fillStyle = '#9aa0a8'; g.fillRect(B*.76, H*.44, B*.10, H*.03);
}

const SPR = {
  kreide:   sprite(56, 96, malKreide),
  direktor: sprite(56, 96, malDirektor),
  heft: sprite(40, 46, (g,B,H) => {
    g.fillStyle='#2f4f8f'; g.fillRect(B*.12,H*.06,B*.76,H*.88);
    g.fillStyle='#24407a'; g.fillRect(B*.12,H*.86,B*.76,H*.08);
    g.fillStyle='#f3f0e2'; g.fillRect(B*.22,H*.12,B*.60,H*.74);
    g.fillStyle='#c9c3ac'; for(let i=0;i<5;i++) g.fillRect(B*.28,H*(.22+i*.13),B*.48,H*.022);
    g.fillStyle='#d8503f'; g.fillRect(B*.12,H*.06,B*.07,H*.88);
    g.fillStyle='#9aa0a8';                                    // Spiralbindung
    for(let i=0;i<5;i++) g.fillRect(B*.09,H*(.14+i*.17),B*.10,H*.035);
  }),
  energie: sprite(28, 44, (g,B,H) => {
    g.fillStyle='#b9bfc6'; g.fillRect(B*.20,H*.16,B*.60,H*.76);
    g.fillStyle='#d6dbe1'; g.fillRect(B*.24,H*.18,B*.18,H*.72);
    g.fillStyle='#f2c14e'; g.fillRect(B*.20,H*.38,B*.60,H*.26);
    g.fillStyle='#d8503f'; g.fillRect(B*.20,H*.46,B*.60,H*.06);
    g.fillStyle='#8a8f96'; g.fillRect(B*.30,H*.08,B*.40,H*.10);
    g.fillStyle='#c9cfd6'; g.fillRect(B*.34,H*.05,B*.32,H*.05);
  }),
  seife: sprite(32, 24, (g,B,H) => {
    g.fillStyle='#5fb6cc'; g.fillRect(B*.10,H*.30,B*.80,H*.46);
    g.fillStyle='#8fd0e0'; g.fillRect(B*.10,H*.30,B*.80,H*.16);
    g.fillStyle='#c8ecf5'; g.fillRect(B*.18,H*.34,B*.40,H*.08);
    g.fillStyle='#3f8fa5'; g.fillRect(B*.10,H*.70,B*.80,H*.06);
  }),
  zonk: sprite(36, 24, (g,B,H) => {
    g.fillStyle='#5b3a20'; g.fillRect(B*.06,H*.24,B*.88,H*.52);
    g.fillStyle='#7a4f2b'; g.fillRect(B*.06,H*.24,B*.88,H*.16);
    g.fillStyle='#c98f4a'; g.fillRect(B*.12,H*.42,B*.76,H*.14);
    g.fillStyle='#efe6c8'; g.font='bold 8px monospace'; g.fillText('ZONK', B*.16, H*.66);
  })
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

/* ── Stimmung: Licht, Flackern, Stromausfall ───────────────────────
   Das Haus wird nicht gleichmäßig ausgeleuchtet. Jede Deckenplatte hat
   ihren eigenen Wert, ein Drittel der Röhren ist tot, ein paar flackern.
   Danach läuft ein Weichzeichner über die Karte, damit das Licht von
   einer Zelle in die nächste blutet statt an der Fuge abzureißen.

   Mit jedem Heft geht das Licht ein Stück weiter zurück und ab dem
   fünften fällt der Strom kurz ganz aus. Herr Kreide wird nicht
   schneller — das Haus wird enger. */
let lichtBasis = null;      // fester Wert je Zelle
let licht = null;           // derselbe Wert, jeden Frame mit Flackern
let flackerZellen = [];     // Röhren, die zucken
const ST = {
  reich: 15,        // wie weit das Licht trägt, in Zellen
  strom: 1,         // 1 = alles an, klein = Stromausfall
  ausfallUhr: 14,
  ausfallRest: 0,
  tuerUhr: 14,
  herzUhr: 0,
  schrittWeg: 0,
  schreckSperre: 0,
  war: 0            // zuletzt gemeldeter Heftstand
};

function lichtBauen(){
  const n = s.B*s.H;
  lichtBasis = new Float32Array(n);
  licht = new Float32Array(n);
  flackerZellen = [];
  const roh = new Float32Array(n);
  for(let i=0;i<n;i++){
    const r = z();
    roh[i] = r < .32 ? .30 : 1;                  // ein Drittel der Röhren ist aus
    if(roh[i] === 1 && z() < .09) flackerZellen.push(i);
  }
  // Weichzeichnen, sonst reißt das Licht an jeder Plattenfuge ab
  for(let y=0;y<s.H;y++) for(let x=0;x<s.B;x++){
    let sum = 0, zahl = 0;
    for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
      const nx = x+dx, ny = y+dy;
      if(nx<0||ny<0||nx>=s.B||ny>=s.H) continue;
      const g = (dx===0&&dy===0) ? 3 : 1;
      sum += roh[ny*s.B+nx]*g; zahl += g;
    }
    lichtBasis[y*s.B+x] = sum/zahl;
  }
  licht.set(lichtBasis);
}
/* Ob eine Deckenplatte ihre Röhre noch hat — entscheidet die Textur. */
const roehreTot = i => lichtBasis[i] < .62;

function stimmungDenken(dt, t){
  // Sichtweite schrumpft mit jedem Heft
  ST.reich = 15 - spieler.hefte*.85;

  // Stromausfälle ab dem fünften Heft
  if(ST.ausfallRest > 0){
    ST.ausfallRest -= dt;
    if(ST.ausfallRest <= 0){ ST.strom = 1; klang.roehreAn(); $('#dunkel').classList.remove('an'); }
  } else if(spieler.hefte >= 5){
    ST.ausfallUhr -= dt;
    if(ST.ausfallUhr <= 0){
      ST.ausfallUhr = 18 + z()*22;
      ST.ausfallRest = .5 + z()*1.1;
      ST.strom = .12; klang.roehreAus();
      $('#dunkel').classList.add('an');
      meldung('DUNKEL', 'Der Strom ist weg');
    }
  }

  // Einzelne Röhren zucken
  licht.set(lichtBasis);
  for(const i of flackerZellen){
    const f = Math.sin(i*1.7 + t*17) + Math.sin(i*.31 + t*41);
    licht[i] *= f > .6 ? .22 : (f > .1 ? .7 : 1);
  }

  // Irgendwo im Haus fällt eine Tür zu. Da ist nichts — es macht nur nervös.
  ST.tuerUhr -= dt;
  if(ST.tuerUhr <= 0){ ST.tuerUhr = 20 + z()*34; klang.ferneTuer(); }

  // Das Brummen zieht mit dem Heftstand an
  if(spieler.hefte !== ST.war){ ST.war = spieler.hefte; klang.anspannung(spieler.hefte/7); }
  if(ST.schreckSperre > 0) ST.schreckSperre -= dt;
  if(kreide.ping) kreide.ping.alt += dt;
}
/* Licht einer Zelle, außerhalb der Karte ist es finster. */
function lichtBei(x, y){
  const zx = x|0, zy = y|0;
  if(zx<0||zy<0||zx>=s.B||zy>=s.H) return .12;
  return licht[zy*s.B+zx];
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
  lichtBauen();
  ST.strom = 1; ST.ausfallRest = 0; ST.ausfallUhr = 14;
  ST.tuerUhr = 14; ST.herzUhr = 0; ST.schrittWeg = 0; ST.war = 0;
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
  kreide = {x:kp.x, y:kp.y, weg:null, wegUhr:0, betaeubt:0, lockZiel:null,
            zustand:'wandert', wanderZiel:null, ping:null,
            schlagUhr:SCHLAG_TAKT, ruckRest:0, schlagBlitz:0};
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
  if(e.code === 'KeyM') tonUmschalten();
});
addEventListener('keyup', e => { if(bindung[e.code]){ taste[bindung[e.code]] = false; e.preventDefault(); } });
leinwand.addEventListener('click', () => { if(laeuft && !document.pointerLockElement) leinwand.requestPointerLock(); });
addEventListener('mousemove', e => {
  if(document.pointerLockElement === leinwand) setzeBlick(spieler.blick + e.movementX * .0026);
});

/* ── Steuerung mit dem Daumen ─────────────────────────────────────────
   Die ganze Ebene nimmt Berührungen an: linke Bildhälfte ist ein Knüppel,
   der dort entsteht, wo der Daumen aufsetzt, rechte Hälfte dreht den
   Blick. Vorher lag unten links ein fester Kreis von 130 Pixeln, den man
   treffen musste, und die Umsehfläche endete bei 78 % der Höhe — also
   genau über dem Daumen. Wer danebengriff, stand still.               */
const knueppel = {an:false, id:-1, mx:0, my:0, dx:0, dy:0};
const stick = $('#stick'), touchFeld = $('#touch');
let blickId = -1, blickX = 0;

if(matchMedia('(pointer:coarse)').matches){
  touchFeld.classList.add('an');
  $('#griffTipp').classList.add('an');
}
function knueppelHin(x, y){
  knueppel.an = true; knueppel.mx = x; knueppel.my = y;
  stick.style.left = (x-65) + 'px'; stick.style.top = (y-65) + 'px';
  stick.classList.add('an');
}
function knueppelWeg(){
  knueppel.an = false; knueppel.id = -1; knueppel.dx = knueppel.dy = 0;
  stick.classList.remove('an');
  stick.querySelector('i').style.transform = '';
}
touchFeld.addEventListener('pointerdown', e => {
  if(e.pointerType === 'mouse') return;
  const links = e.clientX < innerWidth/2;
  if(links){
    if(knueppel.id >= 0) return;
    knueppel.id = e.pointerId; knueppelHin(e.clientX, e.clientY);
  } else {
    if(blickId >= 0) return;
    blickId = e.pointerId; blickX = e.clientX;
  }
  try{ touchFeld.setPointerCapture(e.pointerId); }catch(_){}
  $('#griffTipp').classList.add('weg');
  e.preventDefault();
});
touchFeld.addEventListener('pointermove', e => {
  if(e.pointerId === knueppel.id){
    const dx = e.clientX-knueppel.mx, dy = e.clientY-knueppel.my, d = Math.hypot(dx,dy)||1;
    const k = Math.min(1, d/50);
    knueppel.dx = dx/d*k; knueppel.dy = dy/d*k;
    stick.querySelector('i').style.transform = `translate(${knueppel.dx*38}px,${knueppel.dy*38}px)`;
  } else if(e.pointerId === blickId){
    setzeBlick(spieler.blick + (e.clientX-blickX)*.0075); blickX = e.clientX;
  }
});
for(const art of ['pointerup','pointercancel']) touchFeld.addEventListener(art, e => {
  if(e.pointerId === knueppel.id) knueppelWeg();
  if(e.pointerId === blickId) blickId = -1;
});

/* Die Knöpfe liegen in der rechten Hälfte. Ohne stopPropagation würde ein
   Druck auf sie gleichzeitig eine Drehung starten. */
function tippKnopf(id, aktion, halten){
  const el = $(id);
  el.addEventListener('pointerdown', e => {
    e.preventDefault(); e.stopPropagation();
    el.classList.add('gedrueckt');
    if(halten) taste[halten] = true; else aktion();
  });
  const aus = e => { e.preventDefault(); e.stopPropagation();
    el.classList.remove('gedrueckt'); if(halten) taste[halten] = false; };
  el.addEventListener('pointerup', aus);
  el.addEventListener('pointercancel', aus);
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
  klang.heftAuf();
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
    klang.richtig();
    heftLage.aufgabe++;
    if(heftLage.aufgabe >= 3){
      heftLage.aktiv.weg = true; spieler.hefte++;
      $('#heft').classList.remove('an');
      meldung('HEFT ' + heftLage.aktiv.nr, spieler.hefte >= 7
        ? 'Alle sieben. Raus hier!' : 'Das hat Herr Kreide gehört');
      hoert(spieler.x, spieler.y, 1);
      heftLage.aktiv = null;
      if(laeuft) leinwand.requestPointerLock();
    } else naechsteAufgabe();
  } else {
    heftLage.fehlerHier++; spieler.fehler++;
    klang.falsch();
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
      klang.aufnehmen();
      meldung(NAME[d.art].toUpperCase(), 'eingesteckt'); return true;
    }
  }
  return false;
}
const NAME = {energie:'Energie', seife:'Seife', zonk:'Zonk'};
function benutze(art){
  if(!art || !spieler.gehalten[art]) return;
  spieler.gehalten[art]--;
  if(art === 'energie'){ spieler.energieUhr = 18; klang.energie(); meldung('ENERGIE', '18 s schneller, ohne Lärm'); }
  if(art === 'seife'){ dinge.push({x:spieler.x, y:spieler.y, art:'seife', gelegt:true, weg:false});
                       meldung('SEIFE', 'liegt jetzt hinter dir'); }
  if(art === 'zonk'){ const a = spieler.blick + Math.PI;
    klang.zonkWurf();
    hoert(spieler.x + Math.cos(a)*8, spieler.y + Math.sin(a)*8, 1);
    meldung('ZONK', 'Krach hinter dir geworfen'); }
}

/* ── Herr Kreide ───────────────────────────────────────────────── */
function hoert(x, y, staerke){
  if(kreide.betaeubt > 0) return;
  kreide.zustand = 'jagt'; kreide.lockZiel = {x, y}; kreide.wegUhr = 0;
}
/* Herr Kreide läuft nicht, er ruckt. Im Takt schlägt er das Lineal in die
   Hand und schiebt sich dabei ein Stück vor — dazwischen steht er still.
   Der Takt bleibt über die ganze Runde gleich: Hefte und Rechenfehler rufen
   ihn her, machen ihn aber nicht schneller. */
const SCHLAG_TAKT  = 1.05;   // Sekunden zwischen zwei Schlägen
const SCHLAG_WEITE = 1.50;   // Zellen, die ein Ruck weit trägt
const RUCK_TEMPO   = 7.0;    // wie hastig der Ruck abläuft

function kreideDenken(dt){
  if(kreide.betaeubt > 0){ kreide.betaeubt -= dt; kreide.schlagUhr = SCHLAG_TAKT*.6; return; }

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
  // Takt: Lineal in die Hand -> ein Ruck nach vorn
  kreide.schlagUhr -= dt;
  if(kreide.schlagUhr <= 0){
    kreide.schlagUhr = SCHLAG_TAKT;
    kreide.ruckRest  = SCHLAG_WEITE;
    kreide.schlagBlitz = .16;
    /* Der Schlag ist das wichtigste Geräusch im Spiel: leiser und dumpfer
       mit der Entfernung, im Panorama dort, wo er steht. So hört man ihn
       durch zwei Wände hindurch näher kommen. */
    const rx = kreide.x-spieler.x, ry = kreide.y-spieler.y;
    const e = Math.hypot(rx,ry) || .001;
    klang.linealSchlag(e, (-spieler.wy*rx + spieler.wx*ry)/e);
    // Der Schlag ist auch das, was die Karte überhaupt von ihm weiß
    kreide.ping = {x:kreide.x, y:kreide.y, alt:0};
  }
  if(kreide.ruckRest > 0){
    const s = Math.min(kreide.ruckRest, RUCK_TEMPO*dt);
    laufeWeg(kreide, s);
    kreide.ruckRest -= s;
  }
  if(kreide.schlagBlitz > 0) kreide.schlagBlitz -= dt;

  if(kreide.zustand === 'jagt' && kreide.lockZiel &&
     Math.hypot(kreide.lockZiel.x-kreide.x, kreide.lockZiel.y-kreide.y) < 1.1){
    kreide.zustand = 'wandert'; kreide.lockZiel = null; kreide.weg = null;
  }
  // Seife?
  for(const d of dinge){
    if(d.gelegt && !d.weg && Math.hypot(d.x-kreide.x, d.y-kreide.y) < .7){
      d.weg = true; kreide.betaeubt = 5; kreide.weg = null;
      klang.rutschen();
      meldung('AUSGERUTSCHT', 'Herr Kreide liegt fünf Sekunden');
    }
  }
  if(dSp < .62 && !spieler.gewonnen) ende(false, 'Herr Kreide hat dich am Ärmel.');
}
/* Bewegt die Figur um `strecke` Zellen entlang ihres Wegs. Kreide bekommt
   die Strecke aus seinem Ruck, der Direktor aus Tempo mal Zeit. */
function laufeWeg(o, strecke){
  let rest = strecke;
  while(rest > 0 && o.weg && o.weg.length){
    const p = o.weg[0];
    const dx = p.x-o.x, dy = p.y-o.y, d = Math.hypot(dx,dy);
    if(d < .06){ o.weg.shift(); continue; }
    const s = Math.min(rest, d);
    o.x += dx/d * s; o.y += dy/d * s;
    rest -= s;
    if(s >= d - 1e-6) o.weg.shift();
  }
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
  laufeWeg(direktor, direktor.tempo * dt);

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
    const ax = spieler.x, ay = spieler.y;
    if(s.begehbar(spieler.x + sx + Math.sign(sx)*R, spieler.y)) spieler.x += sx;
    if(s.begehbar(spieler.x, spieler.y + sy + Math.sign(sy)*R)) spieler.y += sy;
    // Schritte hängen an der wirklich gelaufenen Strecke, nicht an einer Uhr:
    // wer an einer Wand klebt, macht auch kein Geräusch
    ST.schrittWeg += Math.hypot(spieler.x-ax, spieler.y-ay);
    const takt = taste.rennen ? .52 : .72;
    if(ST.schrittWeg >= takt){ ST.schrittWeg = 0; klang.schritt(!!taste.rennen); }
  }
  // Ausgang?
  if(spieler.hefte >= 7 && s.hol(Math.floor(spieler.x), Math.floor(spieler.y)) === AUSGANG)
    ende(true, 'Sieben Hefte, drei Türen, du hast die richtige genommen.');
}

/* ── Raycaster ─────────────────────────────────────────────────── */
function zeichne(){
  const px = spieler.x, py = spieler.y;
  const dx = spieler.wx, dy = spieler.wy, ebx = spieler.ebx, eby = spieler.eby;

  /* Boden und Decke texturiert statt flach: für jede Bildzeile unterhalb
     des Horizonts steht der Abstand zum Betrachter fest, daraus ergibt sich
     die Weltposition, die man Spalte für Spalte weiterschiebt. Die Decke ist
     dieselbe Zeile gespiegelt. */
  const rdx0 = dx - ebx, rdy0 = dy - eby;
  const rdx1 = dx + ebx, rdy1 = dy + eby;
  const reich = ST.reich, strom = ST.strom;
  for(let y = (H>>1)+1; y < H; y++){
    const abstand = (H*.5) / (y - H*.5);
    const schrittX = abstand * (rdx1-rdx0) / W;
    const schrittY = abstand * (rdy1-rdy0) / W;
    let fx = px + abstand*rdx0, fy = py + abstand*rdy0;
    const weite = klemm(1 - abstand/reich, 0, 1);
    const zOben = (H-y-1)*W, zUnten = y*W;
    for(let x=0; x<W; x++){
      const gx = Math.floor(fx), gy = Math.floor(fy);
      const tx = (((fx - gx) * TG) | 0) & (TG-1);
      const ty = (((fy - gy) * TG) | 0) & (TG-1);
      fx += schrittX; fy += schrittY;
      /* Jede Deckenplatte bringt ihr eigenes Licht mit. Vorher war das
         Haus überall gleich hell und sah aus wie ein Bürogang am
         Vormittag. */
      const drin = gx>=0 && gy>=0 && gx<s.B && gy<s.H;
      const zi = drin ? gy*s.B+gx : -1;
      const lam = drin ? licht[zi] : .12;
      const neb = klemm(weite*lam*strom + .045, .03, 1);
      const nebD = neb * .82;                       // Decke etwas dunkler
      const i = ty*TG + tx;
      let c = BODEN[i];
      puffer[zUnten + x] = 0xff000000
        | ((((c>>16&0xff)*neb)|0)<<16) | ((((c>>8&0xff)*neb)|0)<<8) | (((c&0xff)*neb)|0);
      c = (zi >= 0 && roehreTot(zi) ? DECKE_TOT : DECKE)[i];
      puffer[zOben + x] = 0xff000000
        | ((((c>>16&0xff)*nebD)|0)<<16) | ((((c>>8&0xff)*nebD)|0)<<8) | (((c&0xff)*nebD)|0);
    }
  }
  puffer.fill(0xff14170f, 0, W);                  // oberste Zeile, sonst Rest vom Vorbild

  for(let x=0;x<W;x++){
    const kam = 2*x/W - 1;
    const rdx = dx + ebx*kam, rdy = dy + eby*kam;
    let mx = Math.floor(px), my = Math.floor(py);
    const ddx = Math.abs(1/rdx), ddy = Math.abs(1/rdy);
    let stx, sty, sdx, sdy;
    if(rdx < 0){ stx = -1; sdx = (px-mx)*ddx; } else { stx = 1; sdx = (mx+1-px)*ddx; }
    if(rdy < 0){ sty = -1; sdy = (py-my)*ddy; } else { sty = 1; sdy = (my+1-py)*ddy; }
    let seite = 0, feld = WAND, sicher = 0;
    let vx = mx, vy = my;                         // letzte freie Zelle davor
    while(sicher++ < 128){
      vx = mx; vy = my;
      if(sdx < sdy){ sdx += ddx; mx += stx; seite = 0; }
      else { sdy += ddy; my += sty; seite = 1; }
      feld = s.hol(mx,my);
      if(feld===WAND || feld===SPIND || feld===TUER || feld===TAFEL || feld===AUSGANG) break;
    }
    const dist = seite === 0 ? (sdx-ddx) : (sdy-ddy);
    tiefe[x] = dist;
    const hoch = Math.floor(H/dist);
    let y0 = Math.floor(-hoch/2 + H/2), y1 = Math.floor(hoch/2 + H/2);
    const tex = feld === WAND ? wandVariante(mx,my) : (TEX[feld] || TEX[WAND]);
    let wandX = seite === 0 ? py + dist*rdy : px + dist*rdx;
    wandX -= Math.floor(wandX);
    let tx = Math.floor(wandX*TG);
    if(seite === 0 && rdx > 0) tx = TG-tx-1;
    if(seite === 1 && rdy < 0) tx = TG-tx-1;
    const schritt = TG/hoch;
    let texPos = (y0 < 0 ? -y0 : 0) * schritt;
    const dunkel = seite === 1;
    // Eine Wand wird von dem Licht angestrahlt, das vor ihr steht
    const neb = klemm(klemm(1 - dist/reich, 0, 1) * lichtBei(vx, vy) * strom + .04, .03, 1);
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
    const neb = klemm(klemm(1 - ty2/reich, 0, 1) * lichtBei(o.x, o.y) * strom + .05, .04, 1);
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
  /* Die Karte zeigt Herrn Kreide nicht mehr live. Sie zeigt, wo das Lineal
     zuletzt geklatscht hat — ein Ping, der über einen Takt verklingt. Der
     Dauerpunkt hat jede Spannung weggenommen: man wusste immer, wo er ist,
     und musste nie hinhören. Jetzt weiß man, wo er war. */
  if(kreide.ping){
    const a = klemm(1 - kreide.ping.alt/(SCHLAG_TAKT*1.5), 0, 1);
    if(a > 0){
      const px2 = kreide.ping.x*S, py2 = kreide.ping.y*S;
      kg.strokeStyle = `rgba(216,80,63,${(a*.85).toFixed(2)})`;
      kg.lineWidth = 1.5;
      kg.beginPath(); kg.arc(px2, py2, 3 + (1-a)*9, 0, 6.284); kg.stroke();
      kg.fillStyle = `rgba(216,80,63,${(a*.95).toFixed(2)})`;
      kg.fillRect(px2-2, py2-2, 5, 5);
    }
  }
  kg.fillStyle='#6b8fd8'; kg.fillRect(direktor.x*S-1.5, direktor.y*S-1.5, 4, 4);
  kg.fillStyle='#eef3ea'; kg.fillRect(spieler.x*S-2, spieler.y*S-2, 5, 5);
  kg.strokeStyle='#eef3ea'; kg.lineWidth=1; kg.beginPath();
  kg.moveTo(spieler.x*S, spieler.y*S);
  kg.lineTo(spieler.x*S + spieler.wx*7, spieler.y*S + spieler.wy*7); kg.stroke();
}
function tonUmschalten(){
  const an = klang.tonSchalten();
  $('#ton').textContent = an ? 'TON' : 'STUMM';
  $('#ton').classList.toggle('aus', !an);
  meldung('TON', an ? 'an' : 'aus');
}
$('#ton').addEventListener('click', e => { e.stopPropagation(); tonUmschalten(); });
$('#ton').textContent = klang.tonAn() ? 'TON' : 'STUMM';
$('#ton').classList.toggle('aus', !klang.tonAn());

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
  let nah = klemm(1 - d/13, 0, 1);
  /* Der Puls schlägt schneller, je näher er ist — und nur dann. Stille ist
     hier die Voreinstellung, sonst nutzt sich das Ganze ab. */
  if(nah > .30){
    ST.herzUhr -= dt;
    if(ST.herzUhr <= 0){ ST.herzUhr = misch(1.15, .46, nah); klang.herz(nah); }
  } else ST.herzUhr = 0;
  /* Wenn er auf einmal wirklich im Gang steht. Danach eine Weile Ruhe,
     ein Schreck, der dreimal kommt, ist kein Schreck mehr. */
  if(d < 7 && ST.schreckSperre <= 0 && sicht(spieler, kreide)){
    ST.schreckSperre = 16; klang.schreck();
  }
  // Jeder Linealschlag pulst kurz durch den roten Rand — so sieht man ihn
  // kommen, auch wenn er noch hinter einer Ecke steht
  if(kreide.schlagBlitz > 0) nah = klemm(nah + kreide.schlagBlitz*2.2, 0, 1);
  $('#naehe').style.boxShadow = `inset 0 0 ${90+nah*140}px ${18+nah*56}px rgba(216,80,63,${(nah*.6).toFixed(2)})`;
  if(meldeUhr > 0){ meldeUhr -= dt; if(meldeUhr <= 0) $('#meldung').classList.remove('an'); }
  malKarte();
}

/* ── Ende ──────────────────────────────────────────────────────── */
function ende(gewonnen, text){
  laeuft = false; spieler.gewonnen = gewonnen;
  klang.schluss(gewonnen);
  ST.strom = 1; $('#dunkel').classList.remove('an');
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
  if(laeuft) stimmungDenken(dt, jetzt/1000);
  zeichne();
  if(laeuft) anzeige(dt);
}
async function starten(){
  klang.tonStart();               // muss im Klick passieren, sonst blockt der Browser
  $('#losKnopf').textContent = 'LÄDT …';
  await eigeneLaden();
  $('#losKnopf').textContent = 'SCHULHAUS BETRETEN';
  neueRunde();
  $('#start').classList.add('weg'); $('#hud').classList.add('an');
  laeuft = true;
  klang.roehreAn(); klang.anspannung(0);
  meldung('SIEBEN HEFTE', 'Die gelben Punkte auf der Karte');
  if(!matchMedia('(pointer:coarse)').matches) leinwand.requestPointerLock();
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
  get st(){return ST}, get licht(){return licht}, klang,
  get direktor(){return direktor}, get hefte(){return hefte}, get dinge(){return dinge},
  starten, setzen:(x,y)=>{spieler.x=x;spieler.y=y;},
  alleHefte:()=>{for(const h of hefte)h.weg=true; spieler.hefte=7;},
  laueft:()=>laeuft
};
