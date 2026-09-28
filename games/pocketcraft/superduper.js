/* Pocketcraft · SUPER DUPER GRAFIK PAKET
   In den Optionen einschaltbar. Ohne das Paket zeichnet bild.js wie immer;
   mit ihm treten hier eigene Programme an die Stelle von Block-, Wesen-
   und Himmels-Shader, und vor jedem Bild entsteht eine Schattenkarte:

   · Schatten von Sonne und Mond: die Welt um den Spieler (SD_WEITE Blöcke)
     wird aus Richtung des Lichts in eine Tiefenkarte gezeichnet, Blöcke,
     Laub, Pflanzen und Wesen. Weich durch 3 × 3 Proben.
   · Licht mit Richtung: was zur Sonne zeigt, ist heller; morgens und abends
     ist die Sonne orange, nachts scheint der Mond bläulich. Fackeln und
     Glut leuchten warm statt weiß.
   · Laub, Gras, Blumen und Weizen wiegen sich im Wind, bei Regen stärker.
   · Wasser mit Wellen, das den Himmel spiegelt (je flacher der Blick,
     desto mehr) und in der Sonne glitzert.
   · Ziehende Wolken, Dunst in Richtung der Sonne, eine Filmkurve für die
     Helligkeit und ein dunkler Rand ums Bild.

   Wer es nicht schafft (sehr alte Geräte), bekommt einen Hinweis, und das
   Paket bleibt aus. */
'use strict';

const SD_KARTE = 2048;          // Kantenlänge der Schattenkarte in Texeln
const SD_WEITE = 44;            // so weit um den Spieler fallen Schatten (Blöcke)

const SD_WIEGEN = `
uniform float uZeit, uWind;
uniform float uWiegen[10];
// Laub schwankt ganz, Pflanzen nur oben (dort ist v = 0)
vec3 wiegen(vec3 wp, float layer, vec2 uv){
  float w = 0.0;
  for(int i = 0; i < 10; i++) if(abs(layer - uWiegen[i]) < 0.5) w = i < 2 ? 0.45 : 1.0 - uv.y / 16.0;
  if(w > 0.0){
    float t = uZeit * 1.7;
    wp.x += (sin(t + wp.z * 0.7 + wp.y * 0.3) * 0.045 + sin(t * 2.3 + wp.x * 1.9) * 0.015) * w * uWind;
    wp.z += cos(t * 0.8 + wp.x * 0.6 + wp.y * 0.2) * 0.035 * w * uWind;
  }
  return wp;
}`;

const SD_TON = `
// Filmkurve (nach ACES) und etwas mehr Farbe
vec3 ton(vec3 c){
  c *= 1.0;
  c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  return clamp(mix(vec3(l), c, 1.28), 0.0, 1.0);
}`;

const SD_SCHATTEN = `
uniform highp sampler2DShadow uSchatten;
uniform float uTexel, uSchattenAn;
float schatten(vec4 lp, float neig){
  if(uSchattenAn < 0.5) return 1.0;
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  if(p.x <= 0.0 || p.y <= 0.0 || p.x >= 1.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  float s = 0.0;
  for(int i = -1; i <= 1; i++) for(int j = -1; j <= 1; j++)
    s += texture(uSchatten, vec3(p.xy + vec2(float(i), float(j)) * uTexel, p.z - neig));
  s /= 9.0;
  // zum Rand der Karte hin ausblenden, damit keine Kante zu sehen ist
  vec2 r = abs(p.xy - 0.5) * 2.0;
  return mix(s, 1.0, smoothstep(0.82, 0.98, max(r.x, r.y)));
}`;

const SD_VS_CHUNK = `#version 300 es
precision highp float;
in vec3 aPos; in float aPack; in float aLayer; in float aSky; in float aBlk; in vec2 aUV;
uniform mat4 uVP, uLichtVP; uniform vec3 uChunk; uniform vec3 uCam;
uniform float uFogNear, uFogFar, uWater0, uWaterFrame;
out vec3 vUV; out vec3 vWelt; out vec3 vN; out float vAO; out float vSky; out float vBlk;
out float vFog; out float vSharp; out float vWasser; out vec4 vLicht;
${SD_WIEGEN}
void main(){
  vec3 wp = uChunk + aPos / 64.0;
  float ao = mod(aPack, 4.0);
  float nrm = floor(mod(aPack / 4.0, 8.0));
  float L = aLayer;
  vWasser = abs(L - uWater0) < 0.5 ? 1.0 : 0.0;
  if(vWasser > 0.5) L += uWaterFrame;
  vec3 N = nrm < 0.5 ? vec3(1.0, 0.0, 0.0) : nrm < 1.5 ? vec3(-1.0, 0.0, 0.0) : nrm < 2.5 ? vec3(0.0, 1.0, 0.0)
         : nrm < 3.5 ? vec3(0.0, -1.0, 0.0) : nrm < 4.5 ? vec3(0.0, 0.0, 1.0) : nrm < 5.5 ? vec3(0.0, 0.0, -1.0) : vec3(0.0, 1.0, 0.0);
  vSharp = nrm > 5.5 ? 1.0 : 0.0;
  wp = wiegen(wp, aLayer, aUV);
  // Wellen: nur die Oberfläche, etwas abgesenkt, damit sie nie über den Rand steigt
  if(vWasser > 0.5 && nrm > 1.5 && nrm < 2.5)
    wp.y += (sin(wp.x * 1.3 + uZeit * 1.6) + sin(wp.z * 1.1 - uZeit * 1.3)) * 0.022 - 0.045;
  vWelt = wp; vN = N;
  vUV = vec3(aUV / 16.0, L);
  vAO = 0.42 + ao * 0.1933;
  vSky = aSky / 15.0; vBlk = aBlk / 15.0;
  vLicht = uLichtVP * vec4(wp + N * 0.07, 1.0);
  gl_Position = uVP * vec4(wp, 1.0);
  vFog = clamp((distance(wp, uCam) - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
}`;

const SD_FS_CHUNK = `#version 300 es
precision highp float; precision highp sampler2DArray;
in vec3 vUV; in vec3 vWelt; in vec3 vN; in float vAO; in float vSky; in float vBlk;
in float vFog; in float vSharp; in float vWasser; in vec4 vLicht;
uniform sampler2DArray uTex; uniform vec3 uFogCol; uniform float uAlpha; uniform vec3 uWaterTint;
uniform float uSchaerfe, uZeit;
uniform vec3 uCam, uLichtDir, uLichtFarbe, uUmgebung, uZenith, uHorizon;
out vec4 outColor;
${SD_SCHATTEN}
${SD_TON}
void main(){
  vec4 c = vSharp > 0.5 ? textureLod(uTex, vUV, 0.0) : texture(uTex, vUV, uSchaerfe);
  if(c.a < uAlpha) discard;
  float himmel = 0.055 + 0.945 * pow(vSky, 1.35);
  float glut = pow(vBlk, 1.7);
  float frei = smoothstep(0.45, 0.95, vSky);          // direktes Licht nur, wo der Himmel hinsieht
  float sv = schatten(vLicht, 0.0006);
  vec3 N = normalize(vN);
  float ndl = vSharp > 0.5 ? 0.6 : max(dot(N, uLichtDir), 0.0);
  vec3 licht = uUmgebung * himmel + uLichtFarbe * ndl * sv * frei + vec3(1.0, 0.66, 0.38) * glut * 0.95;
  vec3 col = c.rgb * max(licht, vec3(0.03)) * vAO;
  float a = c.a;
  vec3 V = normalize(uCam - vWelt);
  if(vWasser > 0.5 && N.y > 0.5){
    vec3 n = normalize(vec3(cos(vWelt.x * 1.3 + uZeit * 1.6) * 0.06, 1.0, cos(vWelt.z * 1.1 - uZeit * 1.3) * 0.06));
    float fres = pow(1.0 - max(dot(V, n), 0.0), 4.0);
    vec3 R = reflect(-V, n);
    vec3 spiegel = mix(uHorizon, uZenith, clamp(R.y * 1.6, 0.0, 1.0)) * mix(0.35, 1.0, frei);
    col = mix(col, spiegel, clamp(fres * 0.75, 0.0, 0.7));
    col += uLichtFarbe * pow(max(dot(R, uLichtDir), 0.0), 160.0) * 2.2 * sv * frei;
    a = mix(0.6, 0.94, fres);
  }
  col = ton(col * uWaterTint);
  vec3 dunst = uFogCol + uLichtFarbe * pow(max(dot(-V, uLichtDir), 0.0), 6.0) * 0.3;
  outColor = vec4(mix(col, dunst, vFog), a);
}`;

/* Wesen, Mitspieler, Gegenstände: wie VS_ENT/FS_ENT, dazu Schatten und die Filmkurve */
const SD_VS_ENT = `#version 300 es
precision highp float;
in vec3 aPos; in vec2 aUV; in float aLayer; in float aShade;
uniform mat4 uVP, uModel, uLichtVP; uniform vec3 uCam; uniform float uFogNear, uFogFar;
uniform float uLayers[6];
out vec3 vUV; out float vFog; out float vShade; out vec4 vLicht; out vec3 vWelt;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * wp;
  vUV = vec3(aUV, uLayers[int(aLayer + 0.5)]); vShade = aShade;
  vWelt = wp.xyz;
  vLicht = uLichtVP * wp;
  vFog = clamp((distance(wp.xyz, uCam) - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
}`;
const SD_FS_ENT = `#version 300 es
precision highp float; precision highp sampler2DArray;
in vec3 vUV; in float vFog; in float vShade; in vec4 vLicht; in vec3 vWelt;
uniform sampler2DArray uTex; uniform vec3 uFogCol; uniform vec4 uTint;
uniform float uUseTex, uLight, uAlpha, uSonne;
out vec4 outColor;
${SD_SCHATTEN}
${SD_TON}
void main(){
  vec4 c = mix(vec4(1.0), texture(uTex, vUV), uUseTex);
  if(c.a < uAlpha) discard;
  c *= uTint;
  float sv = schatten(vLicht, 0.004);
  vec3 col = c.rgb * uLight * vShade * mix(1.0, mix(0.62, 1.0, sv), uSonne);
  col = mix(col, ton(col * 1.05), uUseTex);
  outColor = vec4(mix(col, uFogCol, vFog * uUseTex), c.a);
}`;

/* Schattenkarte: nur Tiefe; Laub und Pflanzen stanzen ihre Löcher aus */
const SD_VS_TIEFE = `#version 300 es
precision highp float;
in vec3 aPos; in float aLayer; in vec2 aUV;
uniform mat4 uVP; uniform vec3 uChunk;
out vec3 vUV;
${SD_WIEGEN}
void main(){
  vec3 wp = wiegen(uChunk + aPos / 64.0, aLayer, aUV);
  vUV = vec3(aUV / 16.0, aLayer);
  gl_Position = uVP * vec4(wp, 1.0);
}`;
const SD_VS_TIEFE_ENT = `#version 300 es
precision highp float;
in vec3 aPos; in vec2 aUV; in float aLayer;
uniform mat4 uVP, uModel; uniform float uLayers[6];
out vec3 vUV;
void main(){
  vUV = vec3(aUV, uLayers[int(aLayer + 0.5)]);
  gl_Position = uVP * uModel * vec4(aPos, 1.0);
}`;
const SD_FS_TIEFE = `#version 300 es
precision highp float; precision highp sampler2DArray;
in vec3 vUV; uniform sampler2DArray uTex;
void main(){ if(textureLod(uTex, vUV, 0.0).a < 0.5) discard; }`;

/* Himmel: wie FS_SKY, dazu ziehende Wolken und ein größerer Hof um die Sonne */
const SD_FS_SKY = `#version 300 es
precision highp float;
in vec2 vP; out vec4 outColor;
uniform mat4 uInvVP; uniform vec3 uCam, uZenith, uHorizon, uSunDir, uSunCol;
uniform float uNight, uZeit, uWolken, uHell;
float h21(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
float rausch(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p){ float s = 0.0, a = 0.5; for(int i = 0; i < 5; i++){ s += rausch(p) * a; p = p * 2.03 + 11.7; a *= 0.5; } return s; }
${SD_TON}
void main(){
  vec4 f = uInvVP * vec4(vP, 1.0, 1.0);
  vec3 dir = normalize(f.xyz / f.w - uCam);
  float up = clamp(dir.y, -1.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.04, 0.42, up));
  col = mix(col, uHorizon, smoothstep(0.0, -0.25, up));
  if(uNight > 0.01 && up > -0.02){
    vec2 sp = floor(dir.xz / max(0.03, abs(dir.y) * 0.06 + 0.03) * 8.0);
    float s = h21(sp);
    col += vec3(smoothstep(0.9975, 1.0, s) * uNight * smoothstep(0.0, 0.25, up)) * (0.6 + 0.4 * h21(sp + 7.7));
  }
  float sd = dot(dir, uSunDir);
  col += uSunCol * (pow(max(sd, 0.0), 900.0) * 2.4 + pow(max(sd, 0.0), 12.0) * 0.2 + pow(max(sd, 0.0), 3.0) * 0.12);
  float md = dot(dir, -uSunDir);
  col += vec3(0.72, 0.76, 0.9) * (pow(max(md, 0.0), 1400.0) * 1.6 + pow(max(md, 0.0), 40.0) * 0.06) * uNight;
  // Wolken auf einer Ebene über der Welt
  if(up > 0.0){
    vec2 uv = dir.xz / (up + 0.1) * 1.4 + vec2(uZeit * 0.010, uZeit * 0.004);
    float d = fbm(uv);
    float w = smoothstep(0.58 - uWolken * 0.28, 0.9, d) * smoothstep(0.0, 0.2, up);
    vec3 wc = mix(uHorizon, vec3(1.0), 0.55) * (0.25 + 0.75 * uHell) + uSunCol * pow(max(sd, 0.0), 4.0) * 0.5;
    col = mix(col, wc, w * 0.88);
  }
  outColor = vec4(mix(col, ton(col), 0.35), 1.0);
}`;

const Super = {
  an: false,              // eingeschaltet und bereit
  imSchatten: false,      // gerade beim Zeichnen der Schattenkarte
  bereit: false, kaputt: false,
  chunk: null, ent: null, sky: null, tiefe: null, tiefeEnt: null,
  fbo: null, karte: null,
  lichtVP: new Float32Array(16), lichtDir: [0, 1, 0], lichtFarbe: [0, 0, 0], umgebung: [0, 0, 0], sonne: 0,
  wiegen: new Float32Array(10),

  /** einschalten oder aus; false, wenn das Gerät es nicht kann */
  setzen(an){
    if(an && !this.bereit && !this.kaputt){
      try{ this.bauen(); this.bereit = true; }
      catch(e){ console.warn('SUPER DUPER GRAFIK PAKET geht hier nicht:', e.message); this.kaputt = true; }
    }
    this.an = !!an && this.bereit;
    document.body.classList.toggle('superGrafik', this.an);
    return this.an || !an;
  },

  bauen(){
    const ortC = R.progChunk.a, ortE = R.progEnt.a;
    this.chunk = program(SD_VS_CHUNK, SD_FS_CHUNK, ortC);
    this.ent = program(SD_VS_ENT, SD_FS_ENT, ortE);
    this.sky = program(VS_SKY, SD_FS_SKY);
    this.tiefe = program(SD_VS_TIEFE, SD_FS_TIEFE, ortC);
    this.tiefeEnt = program(SD_VS_TIEFE_ENT, SD_FS_TIEFE, ortE);
    // Tiefenkarte mit Vergleich: die Hardware mittelt je Probe schon vier Texel
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, SD_KARTE, SD_KARTE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    gl.activeTexture(gl.TEXTURE0);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, t, 0);
    gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if(!ok) throw new Error('Schattenkarte unvollständig');
    this.karte = t; this.fbo = fb;
    ['leaves', 'fichtennadeln', 'tallgrass', 'rose', 'dandelion', 'wheat0', 'wheat1', 'wheat2', 'wheat3', 'kornblume']
      .forEach((n, i) => { this.wiegen[i] = TEX[n] !== undefined ? TEX[n] : -99; });
  },

  /** Licht dieses Bildes: Richtung, Farbe, Umgebung — aus Tageszeit und Wetter */
  lichtRechnen(){
    const s = Math.sin(Game.sunAngle()), d = sunDir(), r = Wetter.staerke;
    const tag = smooth01(s / 0.25), nacht = smooth01(-s / 0.25);
    if(s > 0){
      this.lichtDir = d;
      const k = tag * 0.88;                            // SkyCol.sun ist bei Regen schon schwächer
      this.lichtFarbe = SkyCol.sun.map(v => v*k);
    } else {
      this.lichtDir = [-d[0], -d[1], -d[2]];
      const k = nacht * 0.2 * (1 - 0.8*r);
      this.lichtFarbe = [0.55*k, 0.63*k, 0.9*k];
    }
    this.sonne = Math.max(tag, nacht*0.6) * (1 - 0.7*r);
    const dl = Game.dayLight();
    // Umgebung: bläulicher Himmel am Tag, dunkles Blau nachts, morgens und abends wärmer
    const h = SkyCol.hor;
    this.umgebung = [0.34*dl + h[0]*0.05, 0.38*dl + h[1]*0.05, 0.46*dl + h[2]*0.05];
  },

  /** Schattenkarte zeichnen, bevor das eigentliche Bild entsteht */
  schattenPass(){
    this.lichtRechnen();
    const p = Game.player;
    this.schattenAn = this.sonne > 0.02 && !Game.panoramaAktiv;
    if(!this.schattenAn) return;
    this.lichtMatrix(this.lichtDir, p.x, p.y, p.z);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, SD_KARTE, SD_KARTE);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2.0, 3.0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, R.texArr);
    // Blöcke
    const P = this.tiefe;
    gl.useProgram(P.p);
    gl.uniformMatrix4fv(P.u.uVP, false, this.lichtVP);
    gl.uniform1i(P.u.uTex, 0);
    this.wiegenUniforms(P);
    const w2 = (SD_WEITE + 24)*(SD_WEITE + 24);
    for(const m of Game.meshes.values()){
      if(!m.o || !m.o.count) continue;
      const x0 = m.cx*CS, z0 = m.cz*CS;
      if((x0 + 8 - p.x)**2 + (z0 + 8 - p.z)**2 > w2) continue;
      gl.uniform3f(P.u.uChunk, x0, 0, z0);
      gl.bindVertexArray(m.o.vao);
      gl.drawElements(gl.TRIANGLES, m.o.count, gl.UNSIGNED_INT, 0);
    }
    // Wesen und Mitspieler: dieselben Zeichenwege wie im Bild, nur mit der Licht-Matrix
    const vp = R.vp; R.vp = this.lichtVP;
    this.imSchatten = true;
    try{ drawMobs(SkyCol.fog, 1, 2); drawSpieler(SkyCol.fog, 1, 2); }
    finally{ this.imSchatten = false; R.vp = vp; }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    gl.enable(gl.CULL_FACE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
  },

  /** senkrechte Projektion aus Richtung des Lichts, auf Texel eingerastet (sonst flimmern die Kanten beim Gehen) */
  lichtMatrix(L, cx, cy, cz){
    const f = [-L[0], -L[1], -L[2]];
    const up = Math.abs(f[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0];
    const kreuz = (a, b) => [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
    const norm = a => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0]/l, a[1]/l, a[2]/l]; };
    const r = norm(kreuz(f, up)), u = kreuz(r, f);
    const W = SD_WEITE, D = SD_WEITE + WH, texel = 2*W/SD_KARTE;
    const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2], c = [cx, cy, cz];
    const cr = Math.round(dot(c, r)/texel)*texel, cu = Math.round(dot(c, u)/texel)*texel, cf = dot(c, f);
    const m = this.lichtVP;
    m[0] = r[0]/W; m[4] = r[1]/W; m[8]  = r[2]/W; m[12] = -cr/W;
    m[1] = u[0]/W; m[5] = u[1]/W; m[9]  = u[2]/W; m[13] = -cu/W;
    m[2] = f[0]/D; m[6] = f[1]/D; m[10] = f[2]/D; m[14] = -cf/D;
    m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
  },

  wiegenUniforms(P){
    gl.uniform1f(P.u.uZeit, performance.now()/1000 % 10000);
    gl.uniform1f(P.u.uWind, 1 + Wetter.staerke*1.6);
    gl.uniform1fv(P.u.uWiegen, this.wiegen);
  },
  schattenUniforms(P){
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.karte);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(P.u.uSchatten, 1);
    gl.uniform1f(P.u.uTexel, 1/SD_KARTE);
    gl.uniform1f(P.u.uSchattenAn, this.schattenAn ? 1 : 0);
    gl.uniformMatrix4fv(P.u.uLichtVP, false, this.lichtVP);
  },
  /** zusätzlich zu chunkUniforms */
  chunkUniforms(P){
    this.wiegenUniforms(P);
    this.schattenUniforms(P);
    gl.uniform3fv(P.u.uLichtDir, this.lichtDir);
    gl.uniform3fv(P.u.uLichtFarbe, this.lichtFarbe);
    gl.uniform3fv(P.u.uUmgebung, this.umgebung);
    gl.uniform3fv(P.u.uZenith, SkyCol.zen);
    gl.uniform3fv(P.u.uHorizon, SkyCol.hor);
  },
  entUniforms(P){
    if(this.imSchatten) return;
    this.schattenUniforms(P);
    gl.uniform1f(P.u.uSonne, this.schattenAn ? Math.min(1, this.sonne) : 0);
  },
  skyUniforms(P){
    gl.uniform1f(P.u.uZeit, performance.now()/1000 % 10000);
    gl.uniform1f(P.u.uWolken, 0.25 + Wetter.staerke*0.75);
    gl.uniform1f(P.u.uHell, clamp((Game.dayLight() - 0.165)/0.835, 0, 1));
  },
};
function smooth01(x){ x = clamp(x, 0, 1); return x*x*(3 - 2*x); }
/** das Programm für Wesen und Gegenstände: je nach Paket und Durchgang */
function entProg(){ return !Super.an ? R.progEnt : Super.imSchatten ? Super.tiefeEnt : Super.ent; }
