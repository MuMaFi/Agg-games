/* ═══════════════════════════════════════════════════════════════════
   NACHSITZEN — Klang. Alles synthetisch, keine Dateien: das Spiel soll
   eine einzige Seite bleiben, die man auf ein Blech kopieren kann.

   Wichtigster Klang ist der Linealschlag. Er kommt im festen Takt von
   Herrn Kreide, wird mit der Entfernung leiser UND dumpfer und liegt im
   Panorama dort, wo er steht. Damit hört man ihn durch Wände hindurch
   kommen — das ist die eigentliche Spannung, das Bild zeigt ihn ja erst,
   wenn es zu spät ist.
   ═══════════════════════════════════════════════════════════════════ */

let ctx = null, meister = null, halle = null, hallGain = null;
let summen = null, summenGain = null, summenFilter = null;
let an = localStorage.getItem('nachsitzen.ton') !== 'aus';
let bereit = false;

const klemm = (v,a,b) => v<a?a:v>b?b:v;

/* Rauschen einmal backen und immer wieder abspielen — billiger als jedes
   Mal einen Puffer zu füllen. */
let rauschPuffer = null;
function rauschen(){
  if(rauschPuffer) return rauschPuffer;
  const n = ctx.sampleRate * 2;
  rauschPuffer = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = rauschPuffer.getChannelData(0);
  for(let i=0;i<n;i++) d[i] = Math.random()*2-1;
  return rauschPuffer;
}

/* Ein kurzer Nachhall, damit der Flur lang klingt. Die Impulsantwort ist
   abfallendes Rauschen — reicht für einen Gang mit Linoleum völlig. */
function baueHalle(){
  const len = Math.floor(ctx.sampleRate * 1.35);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for(let k=0;k<2;k++){
    const d = buf.getChannelData(k);
    for(let i=0;i<len;i++){
      const t = i/len;
      d[i] = (Math.random()*2-1) * Math.pow(1-t, 2.6) * (i < 400 ? i/400 : 1);
    }
  }
  const c = ctx.createConvolver(); c.buffer = buf;
  return c;
}

export function tonStart(){
  if(bereit) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return;
  ctx = new AC();
  if(ctx.state === 'suspended') ctx.resume();
  meister = ctx.createGain(); meister.gain.value = an ? .9 : 0;
  meister.connect(ctx.destination);

  halle = baueHalle();
  hallGain = ctx.createGain(); hallGain.gain.value = .34;
  halle.connect(hallGain); hallGain.connect(meister);

  /* Leuchtstoffröhren: zwei Netzbrummteiltöne und ein schmales Zischen.
     Sehr leise — man merkt es erst, wenn es beim Stromausfall weg ist. */
  summenGain = ctx.createGain(); summenGain.gain.value = .055;
  summenFilter = ctx.createBiquadFilter();
  summenFilter.type = 'lowpass'; summenFilter.frequency.value = 900;
  summenGain.connect(summenFilter); summenFilter.connect(meister);

  const teile = [];
  for(const [f, v] of [[50,.55],[100,.42],[150,.16],[2380,.030]]){
    const o = ctx.createOscillator();
    o.type = f > 1000 ? 'sine' : 'sawtooth';
    o.frequency.value = f;
    const g = ctx.createGain(); g.gain.value = v;
    o.connect(g); g.connect(summenGain); o.start();
    teile.push(o);
  }
  const zisch = ctx.createBufferSource();
  zisch.buffer = rauschen(); zisch.loop = true;
  const zf = ctx.createBiquadFilter(); zf.type='bandpass'; zf.frequency.value=3100; zf.Q.value=1.4;
  const zg = ctx.createGain(); zg.gain.value = .05;
  zisch.connect(zf); zf.connect(zg); zg.connect(summenGain); zisch.start();
  summen = {teile, zisch};
  bereit = true;
}

export function tonSchalten(){
  an = !an;
  localStorage.setItem('nachsitzen.ton', an ? 'an' : 'aus');
  if(meister) meister.gain.setTargetAtTime(an ? .9 : 0, ctx.currentTime, .05);
  return an;
}
export const tonAn = () => an;

function weg(){ return ctx ? ctx.currentTime : 0; }
function bahn(pan){
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if(p) p.pan.value = klemm(pan, -1, 1);
  return p;
}
/* Ein Klang geht immer über dieselbe Kette: Quelle → Filter → Hülle →
   Panorama → trocken + Hall. */
function ausgeben(knoten, huelle, pan, hallAnteil){
  const p = bahn(pan);
  const ziel = p || meister;
  huelle.connect(ziel);
  if(p) p.connect(meister);
  if(hallAnteil > 0){
    const hg = ctx.createGain(); hg.gain.value = hallAnteil;
    huelle.connect(hg); hg.connect(halle);
  }
}

/* ── Der Linealschlag ──────────────────────────────────────────────
   Zwei Schichten: der Knall (Rauschband, sehr kurz) und der Körper
   (tiefer Sinus, der schnell nach unten rutscht). Entfernung macht ihn
   leiser und schluckt die Höhen, so klingt er hinter einer Wand dumpf
   und im selben Gang scharf.                                         */
export function linealSchlag(entfernung, pan){
  if(!bereit || !an) return;
  const t = weg();
  const d = Math.max(0, entfernung);
  const laut = klemm(1.15 / (1 + d*d*0.045), .02, 1);
  const grenz = 420 + 6200 / (1 + d*0.62);

  const n = ctx.createBufferSource(); n.buffer = rauschen();
  n.playbackRate.value = 1.4;
  const bp = ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2100; bp.Q.value=.9;
  const lp = ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=grenz;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(laut*.85, t+.004);
  g.gain.exponentialRampToValueAtTime(.0001, t+.10);
  n.connect(bp); bp.connect(lp); lp.connect(g);
  ausgeben(n, g, pan, .30);
  n.start(t); n.stop(t+.14);

  const o = ctx.createOscillator(); o.type='sine';
  o.frequency.setValueAtTime(190, t);
  o.frequency.exponentialRampToValueAtTime(58, t+.13);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(laut*.6, t+.006);
  og.gain.exponentialRampToValueAtTime(.0001, t+.17);
  o.connect(og);
  ausgeben(o, og, pan*.6, .18);
  o.start(t); o.stop(t+.2);
}

/* ── Schritte ─────────────────────────────────────────────────────── */
export function schritt(rennt){
  if(!bereit || !an) return;
  const t = weg();
  const n = ctx.createBufferSource(); n.buffer = rauschen();
  n.playbackRate.value = rennt ? 1.6 : 1.1;
  const f = ctx.createBiquadFilter(); f.type='lowpass';
  f.frequency.value = rennt ? 1500 : 900;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(rennt ? .10 : .055, t+.005);
  g.gain.exponentialRampToValueAtTime(.0001, t+(rennt ? .10 : .13));
  n.connect(f); f.connect(g);
  ausgeben(n, g, (Math.random()-.5)*.3, .10);
  n.start(t); n.stop(t+.16);
}

/* ── Herzschlag ───────────────────────────────────────────────────── */
export function herz(staerke){
  if(!bereit || !an) return;
  const t = weg();
  for(const [ab, v] of [[0,1],[0.17,.62]]){
    const o = ctx.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(78, t+ab);
    o.frequency.exponentialRampToValueAtTime(34, t+ab+.16);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t+ab);
    g.gain.linearRampToValueAtTime(.30*staerke*v, t+ab+.012);
    g.gain.exponentialRampToValueAtTime(.0001, t+ab+.20);
    o.connect(g); g.connect(meister);
    o.start(t+ab); o.stop(t+ab+.24);
  }
}

/* ── Kleinkram ────────────────────────────────────────────────────── */
function tonKurz({f0, f1, form='sine', dauer=.18, laut=.16, pan=0, hall=.12}){
  if(!bereit || !an) return;
  const t = weg();
  const o = ctx.createOscillator(); o.type = form;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20,f1), t+dauer);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(laut, t+.01);
  g.gain.exponentialRampToValueAtTime(.0001, t+dauer);
  o.connect(g);
  ausgeben(o, g, pan, hall);
  o.start(t); o.stop(t+dauer+.05);
}
function rauschKurz({mitte=1200, q=1, dauer=.2, laut=.12, pan=0, hall=.2, rate=1}){
  if(!bereit || !an) return;
  const t = weg();
  const n = ctx.createBufferSource(); n.buffer = rauschen(); n.playbackRate.value = rate;
  const f = ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=mitte; f.Q.value=q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(laut, t+.012);
  g.gain.exponentialRampToValueAtTime(.0001, t+dauer);
  n.connect(f); f.connect(g);
  ausgeben(n, g, pan, hall);
  n.start(t); n.stop(t+dauer+.05);
}

export const heftAuf   = () => rauschKurz({mitte:3400, q:.7, dauer:.30, laut:.13, rate:.55});
export const richtig   = () => tonKurz({f0:520, f1:512, form:'triangle', dauer:.13, laut:.10});
export const falsch    = () => { tonKurz({f0:150, f1:56, form:'square', dauer:.34, laut:.10, hall:.3});
                                 rauschKurz({mitte:300, q:.6, dauer:.5, laut:.06, hall:.4}); };
export const aufnehmen = () => tonKurz({f0:700, f1:900, form:'triangle', dauer:.10, laut:.09});
export const rutschen  = () => rauschKurz({mitte:900, q:.4, dauer:.7, laut:.14, rate:.4, hall:.35});
export const zonkWurf  = () => rauschKurz({mitte:600, q:.5, dauer:.35, laut:.16, rate:.7, hall:.5});
export const energie   = () => tonKurz({f0:240, f1:760, form:'sawtooth', dauer:.3, laut:.07});

/* Ferne Tür irgendwo im Haus. Passiert einfach, ohne dass etwas dahinter
   steckt — genau deshalb bleibt man unruhig. */
export function ferneTuer(){
  if(!bereit || !an) return;
  const p = (Math.random()*2-1)*.8;
  rauschKurz({mitte:180, q:.5, dauer:.55, laut:.11, rate:.5, pan:p, hall:.85});
  tonKurz({f0:96, f1:40, form:'sine', dauer:.4, laut:.07, pan:p, hall:.7});
}

/* Wenn er plötzlich im Gang steht. Ein Streicherschrei aus zwei
   gegeneinander verstimmten Sägezähnen. */
export function schreck(){
  if(!bereit || !an) return;
  const t = weg();
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(.16, t+.05);
  g.gain.exponentialRampToValueAtTime(.0001, t+1.1);
  const f = ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1400; f.Q.value=.8;
  g.connect(f); f.connect(meister);
  const hg = ctx.createGain(); hg.gain.value=.4; f.connect(hg); hg.connect(halle);
  for(const [b, ziel] of [[0,1],[+7,1.06],[-5,0.94]]){
    const o = ctx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(300*ziel, t);
    o.frequency.exponentialRampToValueAtTime(1150*ziel, t+.55);
    o.detune.value = b*12;
    o.connect(g); o.start(t); o.stop(t+1.15);
  }
}

/* Röhre geht aus / kommt zurück. */
export function roehreAus(){
  if(!bereit) return;
  summenGain.gain.setTargetAtTime(.004, ctx.currentTime, .03);
  rauschKurz({mitte:2600, q:2, dauer:.12, laut:.07, hall:.3});
}
export function roehreAn(){
  if(!bereit) return;
  summenGain.gain.setTargetAtTime(.055, ctx.currentTime, .05);
}
/* Je mehr Hefte, desto angespannter das Brummen. */
export function anspannung(stufe){
  if(!bereit) return;
  summenFilter.frequency.setTargetAtTime(900 + stufe*420, ctx.currentTime, 1.2);
  summenGain.gain.setTargetAtTime(.055 + stufe*.022, ctx.currentTime, 1.2);
}

export function schluss(gewonnen){
  if(!bereit) return;
  summenGain.gain.setTargetAtTime(.002, ctx.currentTime, .6);   // Röhren aus
  if(!an) return;
  const t = weg();
  if(gewonnen){
    for(let i=0;i<3;i++){
      const o = ctx.createOscillator(); o.type='triangle';
      o.frequency.value = [262,330,392][i];
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t+i*.09);
      g.gain.linearRampToValueAtTime(.10, t+i*.09+.03);
      g.gain.exponentialRampToValueAtTime(.0001, t+i*.09+1.3);
      o.connect(g); g.connect(meister);
      const hg=ctx.createGain(); hg.gain.value=.5; g.connect(hg); hg.connect(halle);
      o.start(t+i*.09); o.stop(t+i*.09+1.4);
    }
  } else {
    linealSchlag(0, 0);
    for(const f of [58, 61, 87]){
      const o = ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(.13, t+.02);
      g.gain.exponentialRampToValueAtTime(.0001, t+1.8);
      o.connect(g); g.connect(meister);
      o.start(t); o.stop(t+1.9);
    }
  }
}
