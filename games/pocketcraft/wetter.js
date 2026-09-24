/* Pocketcraft · Wetter
   Irgendwann zieht Regen auf, ohne Vorwarnung, und hört nach ein paar
   Minuten wieder auf — dazwischen bleibt es eine ganze Weile klar. Wo es
   kalt ist (Nadelwald, Schneeebene, hohe Gipfel), fällt Schnee statt Regen
   und legt nach und nach eine dünne Schneedecke; über der Wüste regnet es
   nicht. Regen fällt nur unter freiem Himmel: nicht durch Dächer, Laub und
   Wasser, nicht in Höhlen. Er färbt den Himmel grau, macht den Tag
   dunkler, gießt die Felder, und Zombies brennen nicht, solange es regnet.

   Mit Mitspielern entscheidet der Host über das Wetter und schickt es mit;
   die Schneedecke legt auch nur er, als gewöhnliche Blockänderungen. */
'use strict';

const WETTER_KLAR  = [300, 900];            // Sekunden ohne Regen, zufällig dazwischen
const WETTER_REGEN = [120, 300];            // Sekunden Regen
const WETTER_UEBERGANG = 6;                 // so lange, bis der Regen ganz da (oder ganz weg) ist
const WETTER_N = 3000;                      // Tropfen und Flocken höchstens
const WETTER_R = 10;                        // Halbseite des Kastens um den Spieler
const WETTER_OBEN = 10, WETTER_UNTEN = 8;   // so weit über und unter den Füßen
const REGEN_TEMPO = 14, SCHNEE_TEMPO = 1.8; // Blöcke je Sekunde
const REGEN_LAUT = 0.5;
const ART_REGEN = 0, ART_SCHNEE = 1, ART_SPRITZER = 2, ART_WARTET = 3;
const wZufall = ([a, b]) => a + Math.random()*(b - a);

/* Was den Regen aufhält (alles Feste, Wasser, Laub, die Schneedecke) und
   wie hoch in seinem Block er dort aufkommt. Die Blöcke gibt es erst nach
   initBlocks(), darum beim ersten Gebrauch. */
let REGEN_HALT = null, REGEN_OBEN = null;
function regenTabellen(){
  REGEN_HALT = new Uint8Array(256); REGEN_OBEN = new Float32Array(256);
  for(let id = 1; id < 256; id++){
    const b = blocks[id];
    if(!b) continue;
    if(b.solid){ REGEN_HALT[id] = 1; REGEN_OBEN[id] = b.box ? b.box[4]/16 : 1; }
    else if(isWasser(id)){ REGEN_HALT[id] = 1; REGEN_OBEN[id] = 0.875; }
    else if(id === B.LEAVES || id === B.FICHTENNADELN){ REGEN_HALT[id] = 1; REGEN_OBEN[id] = 1; }
    else if(id === B.SCHNEEDECKE){ REGEN_HALT[id] = 1; REGEN_OBEN[id] = 0.125; }
  }
}
/** Höhe, auf der Regen in der Säule x, z aufkommt — WH, solange sie nicht geladen ist */
function regenBoden(w, x, z){
  if(!REGEN_HALT) regenTabellen();
  const c = w.chunks.get(ckey(x >> 4, z >> 4));
  if(!c || c.state < 1) return WH;
  const b = c.blocks, i0 = ((z & 15) << 4) + (x & 15);
  for(let y = WH - 1; y > 0; y--){
    const id = b[(y << 8) + i0];
    if(id && REGEN_HALT[id]) return y + REGEN_OBEN[id];
  }
  return 1;
}
/** was hier vom Himmel fällt: Regen, Schnee — oder über der Wüste nichts */
function niederschlag(w, x, z){
  if(w.kaltAt(x, z)) return ART_SCHNEE;
  return w.biomeAt(x, z) === BIO.DESERT ? ART_WARTET : ART_REGEN;
}

const VS_WETTER = `#version 300 es
precision highp float;
in vec2 aEcke;          // x −0.5 … 0.5, y 0 … 1
in vec4 aTeil;          // Ort; Art, im Bruchteil Größe oder Rest eines Spritzers
in float aLicht;        // Sonne | Block << 4, dort wo es aufkommt
uniform mat4 uVP; uniform vec3 uCam, uRechts, uOben; uniform float uDay;
out vec2 vE; out float vArt; out float vA; out float vHell;
void main(){
  float art = floor(aTeil.w), f = fract(aTeil.w);
  vec3 p = aTeil.xyz, wp;
  if(art < 0.5)      wp = p + uRechts*aEcke.x*0.04 + vec3(0.0, aEcke.y*0.7, 0.0);       // Strich, zur Kamera gedreht
  else if(art < 1.5){ float s = 0.06 + f*0.05; wp = p + (uRechts*aEcke.x + uOben*(aEcke.y - 0.5))*s; }
  else               wp = p + uRechts*aEcke.x*0.16 + vec3(0.0, aEcke.y*0.07, 0.0);     // Spritzer, flach
  gl_Position = uVP * vec4(wp, 1.0);
  float l = max(mod(aLicht, 16.0)/15.0*uDay, floor(aLicht/16.0)/15.0*0.97);
  vHell = 0.055 + 0.945*pow(l, 1.35);
  vE = aEcke; vArt = art;
  // ganz nah an der Kamera würde ein Tropfen das halbe Bild füllen
  vA = smoothstep(0.5, 1.6, distance(p, uCam)) * (art > 1.5 ? f : 1.0);
}`;
const FS_WETTER = `#version 300 es
precision highp float;
in vec2 vE; in float vArt; in float vA; in float vHell;
out vec4 outColor;
void main(){
  vec3 c; float a;
  if(vArt < 0.5){ c = vec3(0.62, 0.7, 0.86); a = 0.6*(1.0 - vE.y*0.7); }
  else if(vArt < 1.5){
    vec2 q = abs(vec2(vE.x, vE.y - 0.5))*2.0;
    float r = max(q.x, q.y);
    c = vec3(0.96, 0.97, 1.0); a = r < 0.5 ? 0.95 : 0.5;          // Pixelflocke: fester Kern, heller Rand
  } else { c = vec3(0.66, 0.74, 0.88); a = 0.55; }
  outColor = vec4(c*vHell, a*vA);
}`;

const Wetter = {
  regen: false,                 // Ziel: regnet (oder schneit) es?
  staerke: 0,                   // 0 … 1, gleitet dem Ziel nach
  rest: 600,                    // Sekunden bis zum nächsten Umschwung; es zählt nur der Host
  x: new Float32Array(WETTER_N), y: new Float32Array(WETTER_N), z: new Float32Array(WETTER_N),
  boden: new Float32Array(WETTER_N), v: new Float32Array(WETTER_N), t: new Float32Array(WETTER_N),
  art: new Uint8Array(WETTER_N).fill(ART_WARTET), licht: new Uint8Array(WETTER_N),
  aktiv: 0,
  _daten: new Float32Array(WETTER_N*5),
  _gl: null, _quelle: null, _g: null, _ziel: 0, _draussen: 0, _ohrT: 0, _stilleT: 0, _schneeT: 0,

  /* — Zustand — */
  neu(){ this.regen = false; this.staerke = 0; this.rest = wZufall(WETTER_KLAR); this.leeren(); },
  /** aus dem Spielstand (oder vom Host); ohne Angaben beginnt eine Welt klar */
  laden(d){
    this.neu();
    if(!d || typeof d !== 'object') return;
    this.regen = !!d.regen;
    this.staerke = this.regen ? 1 : 0;
    const max = this.regen ? WETTER_REGEN[1] : WETTER_KLAR[1];
    if(Number.isFinite(+d.rest) && +d.rest > 0) this.rest = Math.min(+d.rest, max);
  },
  daten(){ return { regen: this.regen, rest: Math.round(this.rest) }; },
  /** Regen fängt an oder hört auf */
  wechseln(){
    this.regen = !this.regen;
    this.rest = wZufall(this.regen ? WETTER_REGEN : WETTER_KLAR);
    this.senden();
  },
  /** nach dem Schlafen: ein klarer Morgen */
  klar(){ this.regen = false; this.staerke = 0; this.rest = wZufall(WETTER_KLAR); this.senden(); },
  senden(){ if(Netz.istHost && Netz.hatGaeste()) Netz.anAlle({ t:'wetter', r: this.regen ? 1 : 0 }); },
  /** beim Gast: wie der Host es sagt */
  vomHost(r){ this.regen = !!+r; },
  /** zum Titelbild: kein Wetter hinter dem Menü */
  aus(){ this.regen = false; this.staerke = 0; this.leeren(); this.tonAus(); },
  leeren(){ this.art.fill(ART_WARTET); this.aktiv = 0; },
  text(){
    return (this.regen ? 'Regen' : 'klar') + ' ' + Math.round(this.staerke*100) + '%' +
      (Netz.istGast ? '' : ', Wechsel in ' + Math.round(this.rest) + ' s');
  },
  /** regnet es gerade auf diesen Block — unter freiem Himmel, nicht als Schnee, nicht in der Wüste? */
  regnetAn(x, y, z){
    if(this.staerke < 0.3) return false;
    const w = Game.world;
    return regenBoden(w, x, z) <= y + 0.01 && niederschlag(w, x, z) === ART_REGEN;
  },

  /** jeden Frame, solange eine Welt läuft */
  tick(dt, angehalten){
    if(!angehalten){
      if(!Netz.istGast){ this.rest -= dt; if(this.rest <= 0) this.wechseln(); }
      const ziel = this.regen ? 1 : 0, s = dt/WETTER_UEBERGANG;
      this.staerke = ziel > this.staerke ? Math.min(ziel, this.staerke + s) : Math.max(ziel, this.staerke - s);
      this.teilchen(dt);
      if(!Netz.istGast) this.schneien(dt);
    }
    this.klang(dt, angehalten);
  },

  /* — Tropfen und Flocken — */
  teilchen(dt){
    const p = Game.player, soll = Math.round(WETTER_N*this.staerke);
    // beim Aufziehen kommen neue von oben; nach dem Laden ist der Regen gleich überall
    const oben = soll - this.aktiv < 200;
    for(let i = this.aktiv; i < soll; i++) this.setzen(i, oben);
    for(let i = soll; i < this.aktiv; i++) this.art[i] = ART_WARTET;
    this.aktiv = soll;
    const R = WETTER_R, D = 2*R, px = p.x, py = p.y, pz = p.z;
    for(let i = 0; i < soll; i++){
      const a = this.art[i];
      if(a === ART_WARTET){ if(Math.random() < 0.1) this.setzen(i, true); continue; }
      if(a === ART_SPRITZER){ this.t[i] -= dt; if(this.t[i] <= 0) this.setzen(i, true); continue; }
      // der Kasten wandert mit: wer hinten hinausfällt, kommt vorn wieder herein
      const x = this.x[i], z = this.z[i];
      if(x < px - R || x >= px + R || z < pz - R || z >= pz + R){
        this.x[i] = px - R + ((x - px + R) % D + D) % D;
        this.z[i] = pz - R + ((z - pz + R) % D + D) % D;
        if(!this.saeule(i)){ this.setzen(i, true); continue; }
      }
      let y = this.y[i] - this.v[i]*dt;
      if(a === ART_SCHNEE){
        // Flocken trudeln
        const t = this.t[i] += dt;
        this.x[i] += Math.sin(t*1.3 + i)*0.35*dt;
        this.z[i] += Math.cos(t*1.1 + i*0.7)*0.35*dt;
      }
      if(y <= this.boden[i]){
        // Regen spritzt auf, wo er aufkommt
        if(a === ART_REGEN && Math.random() < 0.4){ this.art[i] = ART_SPRITZER; this.t[i] = 0.2; this.y[i] = this.boden[i] + 0.02; }
        else this.setzen(i, true);
        continue;
      }
      if(y < py - WETTER_UNTEN || y > py + WETTER_OBEN + 4){ this.setzen(i, y < py); continue; }
      this.y[i] = y;
    }
  },
  /** Tropfen i neu irgendwo im Kasten; oben: ganz oben statt irgendwo in der Höhe */
  setzen(i, oben){
    const p = Game.player, w = Game.world, R = WETTER_R, hoch = p.y + WETTER_OBEN;
    for(let versuch = 0; versuch < 3; versuch++){
      const x = p.x + (Math.random()*2 - 1)*R, z = p.z + (Math.random()*2 - 1)*R;
      const bx = Math.floor(x), bz = Math.floor(z);
      const boden = regenBoden(w, bx, bz);
      if(boden >= hoch - 0.5) continue;                  // Dach, Höhle — oder noch nicht geladen
      const art = niederschlag(w, bx, bz);
      if(art === ART_WARTET) continue;
      const unten = Math.max(boden, p.y - WETTER_UNTEN);
      this.x[i] = x; this.z[i] = z; this.boden[i] = boden;
      this.y[i] = oben ? Math.max(unten, hoch - Math.random()*2) : unten + Math.random()*(hoch - unten);
      this.art[i] = art; this.tempo(i);
      this.t[i] = Math.random()*10;
      this.licht[i] = w.getLight(bx, Math.min(WH - 1, Math.floor(boden)), bz);
      return true;
    }
    this.art[i] = ART_WARTET;
    return false;
  },
  /** nach dem Wandern: in der neuen Säule nachsehen, ob er da weiterfallen kann */
  saeule(i){
    const w = Game.world, bx = Math.floor(this.x[i]), bz = Math.floor(this.z[i]);
    const boden = regenBoden(w, bx, bz);
    if(this.y[i] <= boden) return false;
    const art = niederschlag(w, bx, bz);
    if(art === ART_WARTET) return false;
    if(art !== this.art[i]){ this.art[i] = art; this.tempo(i); }
    this.boden[i] = boden;
    this.licht[i] = w.getLight(bx, Math.min(WH - 1, Math.floor(boden)), bz);
    return true;
  },
  tempo(i){ this.v[i] = this.art[i] === ART_SCHNEE ? SCHNEE_TEMPO*(0.75 + Math.random()*0.5) : REGEN_TEMPO*(0.9 + Math.random()*0.2); },

  /* — Schneedecke: der Host legt sie, rund um jeden Spieler — */
  schneien(dt){
    if(this.staerke < 0.6){ this._schneeT = 0; return; }
    this._schneeT += dt;
    if(this._schneeT < 0.5) return;
    this._schneeT = 0;
    const w = Game.world;
    for(const q of Game.spielerOrte()){
      for(let k = 0; k < 8; k++){
        const x = Math.floor(q.x + (Math.random()*2 - 1)*24), z = Math.floor(q.z + (Math.random()*2 - 1)*24);
        if(!w.kaltAt(x, z)) continue;
        const boden = regenBoden(w, x, z);
        if(boden >= WH - 1) continue;
        const y = Math.ceil(boden) - 1, id = w.getBlock(x, y, z);
        if(!(isOpaqueCube(id) || id === B.LEAVES || id === B.FICHTENNADELN)) continue;
        if(w.getBlock(x, y + 1, z) !== B.AIR) continue;
        w.setBlock(x, y + 1, z, B.SCHNEEDECKE);
      }
    }
  },

  /* — Rauschen: eine Schleife, so laut, wie es ringsum regnet — */
  klang(dt, angehalten){
    const c = Sfx.ctx;
    if(!c || !Sfx.haupt) return;
    this._ohrT -= dt;
    if(this._ohrT <= 0){ this._ohrT = 0.4; this._draussen = this.draussen(); }
    let ziel = angehalten || document.hidden || !Sfx.on ? 0 : this.staerke*this._draussen*REGEN_LAUT;
    if(Game.player.headInWater) ziel *= 0.3;
    if(ziel > 0.002){
      this._stilleT = 0;
      if(!this._quelle) this.tonAn();
    } else if(this._quelle){
      this._stilleT += dt;
      if(this._stilleT > 4){ this.tonAus(); return; }
    }
    // nur bei merklicher Änderung neu ansetzen, nicht in jedem Frame
    if(this._g && Math.abs(ziel - this._ziel) > 0.004){ this._g.gain.setTargetAtTime(ziel, c.currentTime, 0.6); this._ziel = ziel; }
  },
  /** Anteil der Säulen ringsum, in die es in Hörweite regnet (nicht schneit);
      Regen auf einem Dach über dem Kopf zählt gedämpft */
  draussen(){
    if(this.staerke <= 0) return 0;
    const p = Game.player, w = Game.world, N = 20;
    let n = 0;
    for(let k = 0; k < N; k++){
      const a = (k + Math.random()*0.5)/N*TAU, r = 1 + (k % 4)*2.2;       // vier Ringe, bis 7,6 Blöcke weit
      const x = Math.floor(p.x + Math.cos(a)*r), z = Math.floor(p.z + Math.sin(a)*r);
      const boden = regenBoden(w, x, z);
      if(boden > p.y + 10 || boden < p.y - 14) continue;
      if(niederschlag(w, x, z) === ART_REGEN) n += boden > p.y + 2.5 ? 0.4 : 1;
    }
    return n/N;
  },
  tonAn(){
    const c = Sfx.ctx, buf = Sfx.puffer.get('regen');
    if(!buf){ if(!Sfx.puffer.has('regen')) Sfx.laden('regen'); return; }
    const q = c.createBufferSource(), g = c.createGain();
    q.buffer = buf; q.loop = true;
    q.loopStart = 0.1; q.loopEnd = Math.min(8.1, buf.duration);         // nahtlos (siehe ton/QUELLEN.md)
    g.gain.value = 0; this._ziel = 0;
    q.connect(g); g.connect(Sfx.haupt);
    q.start(0, 0.1 + Math.random()*7.9);
    this._quelle = q; this._g = g;
  },
  tonAus(){
    if(!this._quelle) return;
    try{ this._quelle.stop(); }catch(e){}
    try{ this._quelle.disconnect(); this._g.disconnect(); }catch(e){}
    this._quelle = this._g = null;
  },

  /* — Zeichnen: alle Tropfen in einem Aufruf — */
  zeichnen(){
    const p = Game.player;
    if(!this.aktiv || p.headInWater) return;
    if(!this._gl) this.glBauen();
    const G = this._gl, d = this._daten;
    let n = 0;
    for(let i = 0; i < this.aktiv; i++){
      const a = this.art[i];
      if(a === ART_WARTET) continue;
      const o = n*5;
      d[o] = this.x[i]; d[o + 1] = this.y[i]; d[o + 2] = this.z[i];
      d[o + 3] = a === ART_SPRITZER ? 2 + Math.min(0.99, this.t[i]/0.2) : (a === ART_SCHNEE ? 1 + (i % 5)*0.19 : 0);
      d[o + 4] = this.licht[i];
      n++;
    }
    if(!n) return;
    const P = G.p;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, R.vp);
    gl.uniform3f(P.u.uCam, p.x, p.eyeY(), p.z);
    const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw), cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    gl.uniform3f(P.u.uRechts, cy, 0, -sy);
    gl.uniform3f(P.u.uOben, sp*sy, cp, sp*cy);
    gl.uniform1f(P.u.uDay, Game.dayLight());
    gl.bindVertexArray(G.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, G.teile);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, d, 0, n*5);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false); gl.disable(gl.CULL_FACE);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.enable(gl.CULL_FACE); gl.depthMask(true); gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  },
  glBauen(){
    const P = program(VS_WETTER, FS_WETTER);
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const ecken = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, ecken);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-0.5, 0, 0.5, 0, -0.5, 1, 0.5, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(P.a.aEcke); gl.vertexAttribPointer(P.a.aEcke, 2, gl.FLOAT, false, 0, 0);
    const teile = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, teile);
    gl.bufferData(gl.ARRAY_BUFFER, this._daten.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(P.a.aTeil);  gl.vertexAttribPointer(P.a.aTeil, 4, gl.FLOAT, false, 20, 0);  gl.vertexAttribDivisor(P.a.aTeil, 1);
    gl.enableVertexAttribArray(P.a.aLicht); gl.vertexAttribPointer(P.a.aLicht, 1, gl.FLOAT, false, 20, 16); gl.vertexAttribDivisor(P.a.aLicht, 1);
    gl.bindVertexArray(null);
    this._gl = { p: P, vao, teile };
  },
};

// Unsichtbar heißt still: im Hintergrund läuft kein Frame, der den Regen leiser drehen könnte
if(typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => { if(document.hidden) Wetter.tonAus(); });
