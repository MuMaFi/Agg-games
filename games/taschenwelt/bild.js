/* Taschenwelt · Bild */
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   RENDERER — WebGL2, Textur-Array, Chunk-/Entity-/Himmel-Programme
   ═══════════════════════════════════════════════════════════════════ */
const canvas = document.getElementById('gl');
let gl = null;

function compile(src, type){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src);
  return s;
}
function program(vs, fs){
  const p = gl.createProgram();
  gl.attachShader(p, compile(vs, gl.VERTEX_SHADER));
  gl.attachShader(p, compile(fs, gl.FRAGMENT_SHADER));
  gl.linkProgram(p);
  if(!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}, a = {};
  const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for(let i=0;i<nu;i++){ const n = gl.getActiveUniform(p,i).name.replace(/\[0\]$/,''); u[n] = gl.getUniformLocation(p,n); }
  const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
  for(let i=0;i<na;i++){ const n = gl.getActiveAttrib(p,i).name; a[n] = gl.getAttribLocation(p,n); }
  return { p, u, a };
}

const SH_COMMON = `
float lightCurve(float l){ return 0.055 + 0.945 * pow(l, 1.35); }
`;

const VS_CHUNK = `#version 300 es
precision highp float;
in vec3 aPos; in float aPack; in float aLayer; in float aSky; in float aBlk; in vec2 aUV;
uniform mat4 uVP; uniform vec3 uChunk; uniform vec3 uCam;
uniform float uDay, uFogNear, uFogFar, uWater0, uWaterFrame;
out vec3 vUV; out float vShade; out float vFog; out float vSharp;
${SH_COMMON}
void main(){
  vec3 wp = uChunk + aPos / 16.0;
  gl_Position = uVP * vec4(wp, 1.0);
  float p = aPack;
  float ao  = mod(p, 4.0);
  float nrm = floor(mod(p / 4.0, 8.0));
  // Wasser läuft durch seine Bilder: alle Wasserflächen tragen Bild 0
  float L = aLayer;
  if(abs(L - uWater0) < 0.5) L += uWaterFrame;
  vUV = vec3(aUV / 16.0, L);
  vSharp = nrm > 5.5 ? 1.0 : 0.0;      // Kreuz-Modelle: Alpha ohne Mip-Weichzeichnung
  float fs = 1.0;
  if(nrm < 1.5) fs = 0.74;          // ±X
  else if(nrm < 2.5) fs = 1.0;      // +Y
  else if(nrm < 3.5) fs = 0.48;     // -Y
  else if(nrm < 5.5) fs = 0.87;     // ±Z
  float lig = max(aSky / 15.0 * uDay, aBlk / 15.0 * 0.97);
  vShade = fs * (0.55 + ao * 0.15) * lightCurve(lig);
  float d = distance(wp, uCam);
  vFog = clamp((d - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
}`;

const FS_CHUNK = `#version 300 es
precision highp float; precision highp sampler2DArray;
in vec3 vUV; in float vShade; in float vFog; in float vSharp;
uniform sampler2DArray uTex; uniform vec3 uFogCol; uniform float uAlpha; uniform vec3 uWaterTint;
/* negativ: eine feinere Mip-Stufe als nötig — Pixel bleiben auch in der Ferne scharf */
uniform float uSchaerfe;
out vec4 outColor;
void main(){
  // Halme und Blüten würden durch gemittelte Mip-Stufen ausfransen, und
  // eine Kreuzfläche, die man genau von der Kante sieht, holte sich die
  // kleinste Stufe und zöge einen dunklen Strich — für sie immer Stufe 0.
  vec4 c = vSharp > 0.5 ? textureLod(uTex, vUV, 0.0) : texture(uTex, vUV, uSchaerfe);
  float a = c.a;
  if(a < uAlpha) discard;
  vec3 col = c.rgb * vShade * uWaterTint;
  outColor = vec4(mix(col, uFogCol, vFog), c.a);
}`;

const VS_ENT = `#version 300 es
precision highp float;
in vec3 aPos; in vec2 aUV; in float aLayer; in float aShade;
uniform mat4 uVP, uModel; uniform vec3 uCam; uniform float uFogNear, uFogFar;
uniform float uLayers[6];
out vec3 vUV; out float vFog; out float vShade;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  gl_Position = uVP * wp;
  vUV = vec3(aUV, uLayers[int(aLayer + 0.5)]); vShade = aShade;
  vFog = clamp((distance(wp.xyz, uCam) - uFogNear) / max(1.0, uFogFar - uFogNear), 0.0, 1.0);
}`;

const FS_ENT = `#version 300 es
precision highp float; precision highp sampler2DArray;
in vec3 vUV; in float vFog; in float vShade;
uniform sampler2DArray uTex; uniform vec3 uFogCol; uniform vec4 uTint;
uniform float uUseTex, uLight, uAlpha;
out vec4 outColor;
void main(){
  vec4 c = mix(vec4(1.0), texture(uTex, vUV), uUseTex);
  if(c.a < uAlpha) discard;
  c *= uTint;
  vec3 col = c.rgb * uLight * vShade;
  outColor = vec4(mix(col, uFogCol, vFog * uUseTex), c.a);
}`;

const VS_SKY = `#version 300 es
precision highp float;
in vec2 aPos; out vec2 vP;
void main(){ vP = aPos; gl_Position = vec4(aPos, 1.0, 1.0); }`;

const FS_SKY = `#version 300 es
precision highp float;
in vec2 vP; out vec4 outColor;
uniform mat4 uInvVP; uniform vec3 uCam, uZenith, uHorizon, uSunDir, uSunCol;
uniform float uNight;
float h21(vec2 p){ p = fract(p * vec2(233.34, 851.73)); p += dot(p, p + 23.45); return fract(p.x * p.y); }
void main(){
  vec4 f = uInvVP * vec4(vP, 1.0, 1.0);
  vec3 dir = normalize(f.xyz / f.w - uCam);
  float up = clamp(dir.y, -1.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.04, 0.42, up));
  col = mix(col, uHorizon, smoothstep(0.0, -0.25, up));
  // Sterne
  if(uNight > 0.01 && up > -0.02){
    vec2 sp = floor(dir.xz / max(0.03, abs(dir.y) * 0.06 + 0.03) * 8.0);
    float s = h21(sp);
    float star = smoothstep(0.9975, 1.0, s) * uNight * smoothstep(0.0, 0.25, up);
    col += vec3(star) * (0.6 + 0.4 * h21(sp + 7.7));
  }
  // Sonne / Mond
  float sd = dot(dir, uSunDir);
  col += uSunCol * (pow(max(sd, 0.0), 900.0) * 2.4 + pow(max(sd, 0.0), 12.0) * 0.16);
  float md = dot(dir, -uSunDir);
  col += vec3(0.72, 0.76, 0.9) * pow(max(md, 0.0), 1400.0) * 1.6 * uNight;
  outColor = vec4(col, 1.0);
}`;

/* ── Renderer ──────────────────────────────────────────────────────── */
const R = {
  progChunk:null, progEnt:null, progSky:null, texArr:null,
  skyVAO:null, cubeVAO:null, cubeCount:0, quadVAO:null,
  vp: M4.create(), proj: M4.create(), view: M4.create(), invVP: M4.create(),
  planes: new Float32Array(24),

  init(){
    gl = canvas.getContext('webgl2', { antialias:false, alpha:false, powerPreference:'high-performance', desynchronized:true });
    if(!gl) return false;
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    this.progChunk = program(VS_CHUNK, FS_CHUNK);
    this.progEnt   = program(VS_ENT, FS_ENT);
    this.progSky   = program(VS_SKY, FS_SKY);
    this.buildTexArray();
    this.buildSky();
    this.buildCube();
    return true;
  },

  buildTexArray(){
    const n = texData.length;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    const all = new Uint8Array(TS*TS*4*n);
    for(let i=0;i<n;i++) all.set(texData[i], i*TS*TS*4);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, TS, TS, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, all);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    /* Keine anisotrope Filterung: sie filtert linear, auch wenn NEAREST
       eingestellt ist, und macht jede Pixeltextur weich. */
    this.texArr = t;
  },

  buildSky(){
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = this.progSky.a.aPos;
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null); this.skyVAO = vao;
  },

  /** Einheitswürfel mit 6 unabhängigen Flächen (Layer je Fläche per Draw) */
  buildCube(){
    const verts = [], idx = [];
    const shades = [0.74, 0.74, 1.0, 0.48, 0.87, 0.87];
    for(let f=0; f<6; f++){
      const F = FACES[f], base = verts.length / 7;
      for(let i=0; i<4; i++){
        const v = F.v[i], uv = F.uv[i];
        verts.push(v[0], v[1], v[2], uv[0], uv[1], f, shades[f]);
      }
      idx.push(base, base+1, base+2, base, base+2, base+3);
    }
    const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);
    const A = this.progEnt.a;
    gl.enableVertexAttribArray(A.aPos);   gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(A.aUV);    gl.vertexAttribPointer(A.aUV, 2, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(A.aLayer); gl.vertexAttribPointer(A.aLayer, 1, gl.FLOAT, false, 28, 20);
    gl.enableVertexAttribArray(A.aShade); gl.vertexAttribPointer(A.aShade, 1, gl.FLOAT, false, 28, 24);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.cubeVAO = vao; this.cubeVB = vb; this.cubeIB = ib; this.cubeCount = idx.length;
  },

  uploadChunk(mesh, buf){
    if(buf.n === 0){ if(mesh) this.freeMesh(mesh); return null; }
    if(!mesh){
      mesh = { vao: gl.createVertexArray(), vb: gl.createBuffer(), ib: gl.createBuffer(), count:0 };
      gl.bindVertexArray(mesh.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
      const A = this.progChunk.a;
      gl.enableVertexAttribArray(A.aPos);   gl.vertexAttribPointer(A.aPos, 3, gl.UNSIGNED_SHORT, false, 12, 0);
      gl.enableVertexAttribArray(A.aPack);  gl.vertexAttribPointer(A.aPack, 1, gl.UNSIGNED_BYTE, false, 12, 6);
      gl.enableVertexAttribArray(A.aLayer); gl.vertexAttribPointer(A.aLayer, 1, gl.UNSIGNED_BYTE, false, 12, 7);
      gl.enableVertexAttribArray(A.aSky);   gl.vertexAttribPointer(A.aSky, 1, gl.UNSIGNED_BYTE, false, 12, 8);
      gl.enableVertexAttribArray(A.aBlk);   gl.vertexAttribPointer(A.aBlk, 1, gl.UNSIGNED_BYTE, false, 12, 9);
      gl.enableVertexAttribArray(A.aUV);    gl.vertexAttribPointer(A.aUV, 2, gl.UNSIGNED_BYTE, false, 12, 10);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
      gl.bindVertexArray(null);
    }
    /* Erst das gebundene VAO loslassen. Die Bindung des Indexpuffers
       gehört zum VAO-Zustand, nicht zum globalen: der Bildaufbau endet mit
       gebundenem cubeVAO (die Gegenstände werden zuletzt gezeichnet), und
       ein Chunk, der danach neu hochgeladen wird — genau das passiert beim
       Abbauen eines Blocks — hat dem Würfel-VAO seinen Indexpuffer
       untergeschoben. Von da an las jede Kiste und jeder Mob die Indizes
       des Chunks: verstreute Dreiecke, die nur aus bestimmten Richtungen
       sichtbar waren. */
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(buf.buf, 0, buf.n*12), gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, buf.ind.subarray(0, buf.ni), gl.DYNAMIC_DRAW);
    mesh.count = buf.ni;
    return mesh;
  },
  freeMesh(m){ if(!m) return; gl.deleteBuffer(m.vb); gl.deleteBuffer(m.ib); gl.deleteVertexArray(m.vao); },

  resize(){
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
    if(canvas.width !== w || canvas.height !== h){ canvas.width = w; canvas.height = h; }
    return [w, h];
  },

  setCamera(px,py,pz, yaw,pitch, fov, near, far, w, h){
    M4.persp(this.proj, fov, w/h, near, far);
    const v = M4.ident(this.view);
    M4.rotX(v, v, -pitch); M4.rotY(v, v, -yaw);
    M4.translate(v, v, -px, -py, -pz);
    M4.mul(this.vp, this.proj, this.view);
    this.extractPlanes();
  },
  extractPlanes(){
    const m = this.vp, p = this.planes;
    const rw = [m[3], m[7], m[11], m[15]];
    let k = 0;
    for(let i=0; i<3; i++){
      const ri = [m[i], m[4+i], m[8+i], m[12+i]];
      for(let s=0; s<2; s++){
        const sg = s ? -1 : 1;
        p[k++] = rw[0] + sg*ri[0]; p[k++] = rw[1] + sg*ri[1];
        p[k++] = rw[2] + sg*ri[2]; p[k++] = rw[3] + sg*ri[3];
      }
    }
  },
  boxVisible(x0,y0,z0,x1,y1,z1){
    const p = this.planes;
    for(let i=0;i<6;i++){
      const a=p[i*4], b=p[i*4+1], c=p[i*4+2], d=p[i*4+3];
      const vx = a>0?x1:x0, vy = b>0?y1:y0, vz = c>0?z1:z0;
      if(a*vx + b*vy + c*vz + d < 0) return false;
    }
    return true;
  },
};

/* invertierte VP für den Himmel */
function invert4(out, a){
  const b00=a[0]*a[5]-a[1]*a[4], b01=a[0]*a[6]-a[2]*a[4], b02=a[0]*a[7]-a[3]*a[4],
        b03=a[1]*a[6]-a[2]*a[5], b04=a[1]*a[7]-a[3]*a[5], b05=a[2]*a[7]-a[3]*a[6],
        b06=a[8]*a[13]-a[9]*a[12], b07=a[8]*a[14]-a[10]*a[12], b08=a[8]*a[15]-a[11]*a[12],
        b09=a[9]*a[14]-a[10]*a[13], b10=a[9]*a[15]-a[11]*a[13], b11=a[10]*a[15]-a[11]*a[14];
  let det = b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
  if(!det) return out; det = 1/det;
  out[0]=(a[5]*b11-a[6]*b10+a[7]*b09)*det;  out[1]=(a[2]*b10-a[1]*b11-a[3]*b09)*det;
  out[2]=(a[13]*b05-a[14]*b04+a[15]*b03)*det; out[3]=(a[10]*b04-a[9]*b05-a[11]*b03)*det;
  out[4]=(a[6]*b08-a[4]*b11-a[7]*b07)*det;  out[5]=(a[0]*b11-a[2]*b08+a[3]*b07)*det;
  out[6]=(a[14]*b02-a[12]*b05-a[15]*b01)*det; out[7]=(a[8]*b05-a[10]*b02+a[11]*b01)*det;
  out[8]=(a[4]*b10-a[5]*b08+a[7]*b06)*det;  out[9]=(a[1]*b08-a[0]*b10-a[3]*b06)*det;
  out[10]=(a[12]*b04-a[13]*b02+a[15]*b00)*det; out[11]=(a[9]*b02-a[8]*b04-a[11]*b00)*det;
  out[12]=(a[5]*b07-a[4]*b09-a[6]*b06)*det; out[13]=(a[0]*b09-a[1]*b07+a[2]*b06)*det;
  out[14]=(a[13]*b01-a[12]*b03-a[14]*b00)*det; out[15]=(a[8]*b03-a[9]*b01+a[10]*b00)*det;
  return out;
}

/* ═══════════════════════════════════════════════════════════════════
   BILD & SCHLEIFE — Himmel, Chunks, Wesen, Hand, Menüs, Start
   ═══════════════════════════════════════════════════════════════════ */

const _m = M4.create(), _cam = M4.create(), _tmp = M4.create();
const _layers = new Float32Array(6);
let wireVAO = null, wireCount = 0;

function buildWire(){
  const c = [[0,0,0],[1,0,0],[1,0,1],[0,0,1],[0,1,0],[1,1,0],[1,1,1],[0,1,1]];
  const E = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const P = [];
  for(const [a,b] of E) for(const i of [a,b]) P.push(c[i][0], c[i][1], c[i][2], 0, 0, 0, 1);
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(P), gl.STATIC_DRAW);
  const A = R.progEnt.a;
  gl.enableVertexAttribArray(A.aPos);   gl.vertexAttribPointer(A.aPos, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(A.aUV);    gl.vertexAttribPointer(A.aUV, 2, gl.FLOAT, false, 28, 12);
  gl.enableVertexAttribArray(A.aLayer); gl.vertexAttribPointer(A.aLayer, 1, gl.FLOAT, false, 28, 20);
  gl.enableVertexAttribArray(A.aShade); gl.vertexAttribPointer(A.aShade, 1, gl.FLOAT, false, 28, 24);
  gl.bindVertexArray(null);
  wireVAO = vao; wireCount = P.length/7;
}

/* ── Himmels- und Nebelfarben ──────────────────────────────────────── */
const SkyCol = { zen:[0,0,0], hor:[0,0,0], fog:[0,0,0], sun:[0,0,0], night:0 };
function computeSky(){
  const a = Game.sunAngle(), s = Math.sin(a);
  const day = clamp(s*2.3 + 0.30, 0, 1);
  const night = clamp(-s*2.0 + 0.25, 0, 1);
  const dusk = clamp(1 - Math.abs(s)*3.4, 0, 1) * clamp(s*4 + 0.9, 0, 1);
  const mix3 = (A, B, t) => [lerp(A[0],B[0],t), lerp(A[1],B[1],t), lerp(A[2],B[2],t)];
  const dayZen = [0.28,0.51,0.85], dayHor = [0.68,0.82,0.95];
  const nitZen = [0.022,0.035,0.075], nitHor = [0.055,0.075,0.14];
  let zen = mix3(nitZen, dayZen, day);
  let hor = mix3(nitHor, dayHor, day);
  hor = mix3(hor, [0.92,0.48,0.26], dusk*0.85);
  zen = mix3(zen, [0.35,0.24,0.42], dusk*0.45);
  SkyCol.zen = zen; SkyCol.hor = hor; SkyCol.night = night;
  SkyCol.fog = mix3(hor, zen, 0.28);
  SkyCol.sun = mix3([1.0,0.62,0.32], [1.0,0.96,0.86], clamp(s*3, 0, 1));
}
function sunDir(){
  const a = Game.sunAngle();
  const x = Math.cos(a), y = Math.sin(a), z = 0.28;
  const l = Math.hypot(x,y,z);
  return [x/l, y/l, z/l];
}

/* ── Zeichnen ──────────────────────────────────────────────────────── */
function drawSky(){
  const P = R.progSky;
  gl.useProgram(P.p);
  gl.depthMask(false); gl.disable(gl.DEPTH_TEST);
  invert4(R.invVP, R.vp);
  const p = Game.player;
  gl.uniformMatrix4fv(P.u.uInvVP, false, R.invVP);
  gl.uniform3f(P.u.uCam, p.x, p.eyeY(), p.z);
  gl.uniform3fv(P.u.uZenith, SkyCol.zen);
  gl.uniform3fv(P.u.uHorizon, SkyCol.hor);
  gl.uniform3fv(P.u.uSunCol, SkyCol.sun);
  gl.uniform3fv(P.u.uSunDir, sunDir());
  gl.uniform1f(P.u.uNight, SkyCol.night);
  gl.bindVertexArray(R.skyVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
}

function chunkUniforms(P, fogCol, near, far){
  gl.uniformMatrix4fv(P.u.uVP, false, R.vp);
  const p = Game.player;
  gl.uniform3f(P.u.uCam, p.x, p.eyeY(), p.z);
  gl.uniform1f(P.u.uDay, Game.dayLight());
  gl.uniform1f(P.u.uFogNear, near);
  gl.uniform1f(P.u.uFogFar, far);
  gl.uniform3fv(P.u.uFogCol, fogCol);
  gl.uniform1i(P.u.uTex, 0);
}

function drawChunks(waterPass, fogCol, near, far){
  const P = R.progChunk;
  gl.useProgram(P.p);
  chunkUniforms(P, fogCol, near, far);
  gl.uniform1f(P.u.uAlpha, waterPass ? 0.02 : 0.35);
  const uw = Game.player.headInWater;
  gl.uniform3f(P.u.uWaterTint, uw ? 0.55 : 1, uw ? 0.72 : 1, uw ? 0.95 : 1);
  gl.uniform1f(P.u.uWater0, TEX['water0']);
  gl.uniform1f(P.u.uSchaerfe, -1.0);
  gl.uniform1f(P.u.uWaterFrame, Math.floor(performance.now()/1000*7) % WATER_FRAMES);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, R.texArr);

  const list = [];
  const px = Game.player.x, pz = Game.player.z;
  for(const m of Game.meshes.values()){
    const mesh = waterPass ? m.w : m.o;
    if(!mesh || !mesh.count) continue;
    const x0 = m.cx*CS, z0 = m.cz*CS;
    if(!R.boxVisible(x0, 0, z0, x0+CS, WH, z0+CS)) continue;
    const d = (x0+8-px)*(x0+8-px) + (z0+8-pz)*(z0+8-pz);
    list.push([d, mesh, x0, z0]);
  }
  list.sort((a,b) => waterPass ? b[0]-a[0] : a[0]-b[0]);
  if(waterPass){ gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
  for(const [, mesh, x0, z0] of list){
    gl.uniform3f(P.u.uChunk, x0, 0, z0);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }
  if(waterPass){ gl.disable(gl.BLEND); gl.depthMask(true); }
}

function entUniforms(P, fogCol, near, far){
  gl.useProgram(P.p);
  gl.uniformMatrix4fv(P.u.uVP, false, R.vp);
  const p = Game.player;
  gl.uniform3f(P.u.uCam, p.x, p.eyeY(), p.z);
  gl.uniform1f(P.u.uFogNear, near); gl.uniform1f(P.u.uFogFar, far);
  gl.uniform3fv(P.u.uFogCol, fogCol);
  gl.uniform1i(P.u.uTex, 0);
  gl.uniform1f(P.u.uAlpha, 0.35);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, R.texArr);
}
function setLayers(P, all, faceTex){
  for(let i=0;i<6;i++) _layers[i] = all;
  if(faceTex !== undefined) _layers[5] = faceTex;
  gl.uniform1fv(P.u.uLayers, _layers);
}
function blockLightAt(x,y,z){
  const lv = Game.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
  const l = Math.max((lv & 15)/15 * Game.dayLight(), (lv >> 4)/15 * 0.97);
  return 0.09 + 0.91 * Math.pow(clamp(l, 0, 1), 1.35);
}

function drawMobs(fogCol, near, far){
  const P = R.progEnt;
  entUniforms(P, fogCol, near, far);
  gl.uniform1f(P.u.uUseTex, 1);
  gl.bindVertexArray(R.cubeVAO);
  for(const m of Game.mobs){
    if(!R.boxVisible(m.x-1, m.y-0.5, m.z-1, m.x+1, m.y+m.h+0.5, m.z+1)) continue;
    const light = blockLightAt(m.x, m.y+m.h*0.6, m.z);
    const hurt = m.hurtTimer > 0;
    gl.uniform4f(P.u.uTint, hurt ? 1.6 : 1, hurt ? 0.45 : 1, hurt ? 0.45 : 1, 1);
    gl.uniform1f(P.u.uLight, light);
    const sw = Math.sin(m.walkPhase) * (m.moving || m.def.hostile ? 0.62 : 0.06);
    for(const part of m.def.parts){
      let ang = 0;
      if(part.anim === 'leg') ang = part.ph ? -sw : sw;
      else if(part.anim === 'arm') ang = (part.ph ? -sw : sw) * 0.7 + (m.def.hostile ? -1.45 : 0);
      else if(part.anim === 'head') ang = Math.sin(m.age*0.9) * 0.08;
      partMatrix(_m, m, part, ang);
      gl.uniformMatrix4fv(P.u.uModel, false, _m);
      setLayers(P, TEX[part.tex], part.face !== undefined ? TEX[part.face] : undefined);
      gl.drawElements(gl.TRIANGLES, R.cubeCount, gl.UNSIGNED_SHORT, 0);
    }
  }
}
function partMatrix(out, mob, part, ang){
  M4.ident(out);
  M4.translate(out, out, mob.x, mob.y, mob.z);
  M4.rotY(out, out, mob.yaw);
  const [ox, oy, oz, w, h, d] = part.box;
  if(ang){
    const px = ox + w/2, py = part.anim === 'head' ? oy + h/2 : oy + h, pz = oz + d/2;
    M4.translate(out, out, px, py, pz);
    M4.rotX(out, out, ang);
    M4.translate(out, out, -px, -py, -pz);
  }
  M4.translate(out, out, ox, oy, oz);
  M4.scale(out, out, w, h, d);
}

function drawDrops(fogCol, near, far){
  const P = R.progEnt;
  gl.uniform4f(P.u.uTint, 1, 1, 1, 1);
  gl.bindVertexArray(R.cubeVAO);
  for(const d of Game.drops){
    if(!R.boxVisible(d.x-.4, d.y-.4, d.z-.4, d.x+.4, d.y+.6, d.z+.4)) continue;
    gl.uniform1f(P.u.uLight, blockLightAt(d.x, d.y+0.3, d.z));
    M4.ident(_m);
    M4.translate(_m, _m, d.x, d.y + 0.14 + Math.sin(d.age*2.2)*0.06, d.z);
    M4.rotY(_m, _m, d.age*1.6);
    const flach = isFlat(d.id);
    const sc = flach ? 0.34 : 0.3;
    M4.scale(_m, _m, sc, sc, flach ? 0.05 : sc);
    M4.translate(_m, _m, -0.5, -0.5, -0.5);
    gl.uniformMatrix4fv(P.u.uModel, false, _m);
    if(!flach){
      const b = blocks[d.id];
      for(let i=0;i<6;i++) _layers[i] = TEX[b.faces[i]];
      if(b.dirFront) _layers[5] = TEX[b.dirFront];
      gl.uniform1fv(P.u.uLayers, _layers);
    } else setLayers(P, TEX[flatTexOf(d.id)]);
    gl.drawElements(gl.TRIANGLES, R.cubeCount, gl.UNSIGNED_SHORT, 0);
  }
}

function drawSelection(target, fogCol, near, far){
  if(!target) return;
  const P = R.progEnt;
  gl.useProgram(P.p);
  gl.uniform1f(P.u.uLight, 1);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  // Bruchstufen
  if(Game.breakPos && Game.breakProg > 0){
    const st = clamp(Math.floor(Game.breakProg / Game.breakTotal * 8), 0, 7);
    gl.uniform1f(P.u.uUseTex, 1);
    gl.uniform4f(P.u.uTint, 1, 1, 1, 1);
    setLayers(P, TEX['crack'+st]);
    M4.ident(_m);
    M4.translate(_m, _m, Game.breakPos[0]-0.004, Game.breakPos[1]-0.004, Game.breakPos[2]-0.004);
    M4.scale(_m, _m, 1.008, 1.008, 1.008);
    gl.uniformMatrix4fv(P.u.uModel, false, _m);
    gl.bindVertexArray(R.cubeVAO);
    gl.depthFunc(gl.LEQUAL);
    gl.drawElements(gl.TRIANGLES, R.cubeCount, gl.UNSIGNED_SHORT, 0);
    gl.depthFunc(gl.LESS);
  }
  // Auswahlrahmen
  gl.uniform1f(P.u.uUseTex, 0);
  gl.uniform4f(P.u.uTint, 0, 0, 0, 0.45);
  M4.ident(_m);
  M4.translate(_m, _m, target.x-0.003, target.y-0.003, target.z-0.003);
  M4.scale(_m, _m, 1.006, 1.006, 1.006);
  gl.uniformMatrix4fv(P.u.uModel, false, _m);
  gl.bindVertexArray(wireVAO);
  gl.drawArrays(gl.LINES, 0, wireCount);
  gl.disable(gl.BLEND);
}

function drawHeld(fogCol){
  const p = Game.player;
  const s = Inv.held();
  gl.clear(gl.DEPTH_BUFFER_BIT);
  const P = R.progEnt;
  gl.useProgram(P.p);
  gl.uniform1f(P.u.uUseTex, 1);
  gl.uniform4f(P.u.uTint, 1, 1, 1, 1);
  gl.uniform3fv(P.u.uFogCol, fogCol);
  gl.uniform1f(P.u.uFogNear, 900); gl.uniform1f(P.u.uFogFar, 1000);
  gl.uniform1f(P.u.uLight, Math.max(0.42, blockLightAt(p.x, p.eyeY(), p.z)));

  M4.ident(_cam);
  M4.translate(_cam, _cam, p.x, p.eyeY(), p.z);
  M4.rotY(_cam, _cam, p.yaw);
  M4.rotX(_cam, _cam, p.pitch);

  const sw = p.swinging ? Math.sin(clamp(p.swing,0,1)*Math.PI) : 0;
  M4.translate(_cam, _cam, 0.40 - sw*0.07, -0.36 + sw*0.10, -0.78 + sw*0.10);
  M4.rotY(_cam, _cam, -0.46);
  M4.rotZ(_cam, _cam, 0.16 + sw*0.45);
  M4.rotX(_cam, _cam, -sw*0.70);

  if(!s){
    M4.rotZ(_cam, _cam, 0.25);
    M4.scale(_cam, _cam, 0.115, 0.34, 0.115);
    M4.translate(_cam, _cam, -0.5, -0.85, -0.5);
    gl.uniformMatrix4fv(P.u.uModel, false, _cam);
    setLayers(P, TEX['m_skin']);
  } else if(!isFlat(s.id)){
    M4.rotY(_cam, _cam, 0.22); M4.rotX(_cam, _cam, 0.16);
    M4.scale(_cam, _cam, 0.21, 0.21, 0.21);
    M4.translate(_cam, _cam, -0.5, -0.5, -0.5);
    gl.uniformMatrix4fv(P.u.uModel, false, _cam);
    const b = blocks[s.id];
    for(let i=0;i<6;i++) _layers[i] = TEX[b.faces[i]];
    if(b.dirFront) _layers[5] = TEX[b.dirFront];
    gl.uniform1fv(P.u.uLayers, _layers);
  } else {
    M4.rotY(_cam, _cam, 0.26);
    M4.scale(_cam, _cam, 0.30, 0.30, 0.035);
    M4.translate(_cam, _cam, -0.5, -0.35, -0.5);
    gl.uniformMatrix4fv(P.u.uModel, false, _cam);
    setLayers(P, TEX[flatTexOf(s.id)]);
  }
  gl.bindVertexArray(R.cubeVAO);
  gl.drawElements(gl.TRIANGLES, R.cubeCount, gl.UNSIGNED_SHORT, 0);
  gl.uniform4f(P.u.uTint, 1, 1, 1, 1);
}

/* ── Ein Bild ──────────────────────────────────────────────────────── */
function render(dt){
  const [vw, vh] = R.resize();
  gl.viewport(0, 0, vw, vh);
  const p = Game.player;
  computeSky();

  const rd = Game.settings.rd;
  let far = rd*CS*0.98, near = far*0.55;
  let fog = SkyCol.fog;
  if(p.headInWater){ fog = [0.10, 0.28, 0.42]; near = 0.2; far = 15; }

  let fov = 1.28 + (Input.sprint ? 0.07 : 0) + (p.inWater ? -0.04 : 0);
  const bobY = p.onGround ? Math.sin(p.bob*2)*0.022 : 0;
  const shake = Game.camShake > 0 ? (Math.random()-0.5)*Game.camShake : 0;
  R.setCamera(p.x, p.eyeY() + bobY + shake, p.z, p.yaw, p.pitch, fov, 0.08, Math.max(180, far*2.4), vw, vh);

  gl.clearColor(fog[0], fog[1], fog[2], 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawSky();
  drawChunks(false, fog, near, far);
  drawMobs(fog, near, far);
  drawDrops(fog, near, far);
  const t = Game.targetBlock();
  drawSelection(t, fog, near, far);
  drawChunks(true, fog, near, far);
  drawHeld(fog);
}
