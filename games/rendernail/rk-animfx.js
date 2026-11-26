'use strict';
/* ================= Animation: Sterben wie in Minecraft, eigene Pixel-Gesichter, Cartoon-Effekt ================= */

/* ---------- Sterben (nachgebaut nach LivingEntityRenderer / LivingEntity.tickDeath / ExplodeParticle) ----------
   deathTime zählt Ticks (20 pro Sekunde). Umkippen um die Z-Achse an den Füßen: f = √((deathTime+partial−1)/20·1,6), höchstens 1, mal 90°.
   Die ganze Zeit rotes Schaden-Overlay (Textur zu 70 %, Rot zu 30 %). Bei deathTime 20 verschwindet die Figur und 20 „Poof“-Partikel entstehen. */
const AN_TICK=20;
function anDeathU(a,t){return a.die==null?-1:t-a.die}
function anDieAngle(u){if(u<0)return 0;const dt=u*AN_TICK+1;let f=(dt-1)/20*1.6;f=Math.sqrt(Math.max(0,f));return Math.min(1,f)*Math.PI/2}
/* Rotes Overlay: Lambert-Farbe × 0,7 plus 0,3 Rot (wie mix(rot, Textur, 0,7) im Spiel) */
function anHurt(rt,on){const m=rt.m;if(!on&&!rt.hurt)return;rt.hurt=on;
  m.group.traverse(o=>{if(!o.isMesh||!o.material)return;for(const mt of[].concat(o.material)){if(!mt.color)continue;if(on){mt.color.setRGB(.7,.7,.7);if(mt.emissive)mt.emissive.setRGB(.3,0,0)}else{mt.color.setRGB(1,1,1);if(mt.emissive)mt.emissive.setRGB(0,0,0)}}})}
/* Partikel-Bilder generic_0 … generic_7: Wölkchen, das von Bild zu Bild kleiner wird (8 × 8 Pixel) */
let anPoofTex=null;
function anPoofFrames(){if(anPoofTex)return anPoofTex;const T=THREE;anPoofTex=[];
  for(let i=0;i<8;i++){const c=mk(8,8),x=c.getContext('2d'),r=4.1-i*.46;for(let y=0;y<8;y++)for(let xx=0;xx<8;xx++){const d=Math.hypot(xx+.5-4,y+.5-4);if(d>r)continue;
      const e=d/r;x.fillStyle=e>.72?'rgba(200,200,200,1)':e>.4?'rgba(232,232,232,1)':'rgba(255,255,255,1)';x.fillRect(xx,y,1,1)}
    const t=new T.CanvasTexture(c);t.magFilter=T.NearestFilter;t.minFilter=T.NearestFilter;t.generateMipmaps=false;t.encoding=T.sRGBEncoding;anPoofTex.push(t)}return anPoofTex}
function anGauss(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(6.283185*v)}
const AN_POOF=new Map();
/* Partikel deterministisch berechnen (gleiche Zufallszahlen bei jedem Abspielen und im Video) */
function anPoofSim(a,X,Y,Z){const seed=[...a.id].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619),2166136261)>>>0,r=mulberry32(seed),P=[];
  for(let i=0;i<20;i++){const d0=anGauss(r)*.02,d1=anGauss(r)*.02,d2=anGauss(r)*.02;
    const px=X+.6*(2*r()-1),py=Y+1.8*r(),pz=Z+.6*(2*r()-1);
    const xd=d0+(r()*2-1)*.05,yd=d1+(r()*2-1)*.05,zd=d2+(r()*2-1)*.05,col=r()*.3+.7,size=.1*(r()*r()*6+1),life=Math.floor(16/(r()*.8+.2))+2;
    P.push({px,py,pz,xd,yd,zd,col,size,life})}return P}
function anPoofAt(p,ticks){/* Zustand nach „ticks“ Ticks (mit Zwischenwert für flüssige Bilder) */
  let x=p.px,y=p.py,z=p.pz,xd=p.xd,yd=p.yd,zd=p.zd;const n=Math.floor(ticks),fr=ticks-n;let px=x,py=y,pz=z;
  for(let i=0;i<=n;i++){px=x;py=y;pz=z;yd+=.004;x+=xd;y+=yd;z+=zd;xd*=.9;yd*=.9;zd*=.9}
  return[px+(x-px)*fr,py+(y-py)*fr,pz+(z-pz)*fr]}
function anPoofUpdate(a,rt,u){let e=AN_POOF.get(a.id);const show=u>=1&&u<1+90/AN_TICK;
  if(!show){if(e)e.g.visible=false;return}
  const m=rt.m,X=m.x/AB,Y=(m.rootY)/AB,Z=m.z/AB,key=[Math.round(m.x*10),Math.round(m.rootY*10),Math.round(m.z*10)].join(',');
  if(!e){const T=THREE,g=new T.Group();AR.scene.add(g);e={g,sp:[],key:''};AN_POOF.set(a.id,e);
    for(let i=0;i<20;i++){const s=new T.Sprite(new T.SpriteMaterial({map:anPoofFrames()[0],transparent:true,alphaTest:.05,depthWrite:false,fog:true}));g.add(s);e.sp.push(s)}}
  if(e.key!==key){e.P=anPoofSim(a,X,Y,Z);e.key=key}
  e.g.visible=true;const ticks=(u-1)*AN_TICK,fr=anPoofFrames(),lt=AN.data.light||{},dim=lt.sky==='night'?.45:lt.sky==='sunset'?.85:1;
  e.P.forEach((p,i)=>{const s=e.sp[i];if(ticks>=p.life){s.visible=false;return}s.visible=true;const[x,y,z]=anPoofAt(p,ticks);s.position.set(x*AB,y*AB,z*AB);
    s.scale.setScalar(p.size*2*AB);s.material.map=fr[Math.min(7,Math.floor(ticks*7/p.life))];s.material.color.setRGB(p.col*dim,p.col*dim,p.col*dim)})}
/* Wird nach dem Setzen der Pose für jede Figur aufgerufen */
function anApplyDeath(a,rt){const u=anDeathU(a,AN.t),g=rt.m.group;if(u>=0)g.rotation.z+=anDieAngle(u);g.visible=!(u>=1);anHurt(rt,u>=0&&u<1);anPoofUpdate(a,rt,u)}
function anPoofCleanup(){for(const[id,e]of AN_POOF)if(!AN.data.actors.some(a=>a.id===id&&a.die!=null)){AR.scene.remove(e.g);e.sp.forEach(s=>s.material.dispose());AN_POOF.delete(id)}}
function anDie(a){a.die=Math.round(AN.t*20)/20;if(a.die+1.8>AN.data.dur){AN.data.dur=Math.min(30,Math.ceil((a.die+1.8)*2)/2)}anCommit();anTimeline();anPane();toast(a.name+' stirbt bei '+anFmtT(a.die)+'. Drück auf Abspielen.')}

/* ---------- Eigene Pixel-Gesichter (8 × 8, Vorderseite des Kopfes) ---------- */
function anCustomFace(a,id){const px=a.cfaces&&a.cfaces[id];if(!Array.isArray(px))return null;const c=mk(8,8),x=c.getContext('2d');
  px.forEach((v,i)=>{if(v){x.fillStyle=v;x.fillRect(i%8,i>>3,1,1)}});return c}
function anFacePixels(c){const d=c.getContext('2d').getImageData(0,0,8,8).data,o=[];for(let i=0;i<64;i++)o.push(d[i*4+3]<20?'':'#'+[0,1,2].map(k=>d[i*4+k].toString(16).padStart(2,'0')).join(''));return o}
function anFaceEditor(a,id){const sk=anSkin(a)||GRAY_SKIN,cur=evalFace(a,AN.t),start=id?anCustomFace(a,id):(anFaceCanvas(sk,cur,a)||(()=>{const c=mk(8,8);c.getContext('2d').drawImage(sk,8,8,8,8,0,0,8,8);return c})());
  const skinFace=mk(8,8);skinFace.getContext('2d').drawImage(sk,8,8,8,8,0,0,8,8);const orig=anFacePixels(skinFace);let px=anFacePixels(start),col='#231a16',tool='pen';const hist=[];
  const ov=el('div','an-fed');ov.setAttribute('role','dialog');ov.setAttribute('aria-label','Gesicht malen');const card=el('div','an-fedcard');ov.append(card);
  card.append(el('h3',null,id?'Gesicht bearbeiten':'Gesicht malen'));
  const body=el('div','an-fedbody'),cv=document.createElement('canvas');cv.width=cv.height=256;cv.className='an-fedgrid';body.append(cv);
  const side=el('div','an-fedside');body.append(side);card.append(body);
  const draw=()=>{const x=cv.getContext('2d');x.clearRect(0,0,256,256);px.forEach((v,i)=>{x.fillStyle=v||'#00000000';if(v)x.fillRect((i%8)*32,(i>>3)*32,32,32)});
    x.strokeStyle='rgba(0,0,0,.35)';x.lineWidth=1;for(let i=1;i<8;i++){x.beginPath();x.moveTo(i*32+.5,0);x.lineTo(i*32+.5,256);x.moveTo(0,i*32+.5);x.lineTo(256,i*32+.5);x.stroke()}};
  const tools=el('div','seg');for(const[k,n]of[['pen','Stift'],['erase','Radierer'],['pick','Pipette']]){const b=el('button',null,n);b.type='button';b.setAttribute('aria-pressed',k===tool);b.addEventListener('click',()=>{tool=k;tools.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b))});tools.append(b)}
  side.append(tools);
  const pal=el('div','an-fedpal'),cin=el('input');cin.type='color';cin.value=col;cin.setAttribute('aria-label','Eigene Farbe');
  const setCol=v=>{col=v;cin.value=v;pal.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.c===v));if(tool!=='pen'){tool='pen';tools.querySelectorAll('button').forEach((z,i)=>z.setAttribute('aria-pressed',i===0))}};
  const colors=[...new Set(orig.filter(Boolean))].slice(0,12).concat(['#ffffff','#231a16','#000000','#4a2420','#c4505b','#3b6fd8','#4fb35a','#ffd23a','#ff8ac0']);
  for(const c of[...new Set(colors)]){const b=el('button','an-fedsw');b.type='button';b.dataset.c=c;b.style.background=c;b.title=c;b.setAttribute('aria-label','Farbe '+c);b.setAttribute('aria-pressed',c===col);b.addEventListener('click',()=>setCol(c));pal.append(b)}
  cin.addEventListener('input',()=>setCol(cin.value));side.append(pal,cin);
  const r1=el('div','btnrow');aBtn(r1,'Rückgängig',()=>{if(hist.length){px=hist.pop();draw()}});aBtn(r1,'Original-Skin',()=>{hist.push(px.slice());px=orig.slice();draw()});side.append(r1);
  const prev=document.createElement('canvas');prev.width=prev.height=64;prev.className='an-fedprev';side.append(prev);
  const upPrev=()=>{const c=mk(8,8),x=c.getContext('2d');px.forEach((v,i)=>{if(v){x.fillStyle=v;x.fillRect(i%8,i>>3,1,1)}});const p=prev.getContext('2d');p.imageSmoothingEnabled=false;p.clearRect(0,0,64,64);p.drawImage(c,0,0,64,64)};
  const at=e=>{const r=cv.getBoundingClientRect();const cx=Math.floor((e.clientX-r.left)/r.width*8),cy=Math.floor((e.clientY-r.top)/r.height*8);return cx>=0&&cx<8&&cy>=0&&cy<8?cy*8+cx:-1};
  let down=false;const paint=e=>{const i=at(e);if(i<0)return;if(tool==='pick'){if(px[i])setCol(px[i]);return}const v=tool==='erase'?orig[i]:col;if(px[i]!==v){px[i]=v;draw();upPrev()}};
  cv.addEventListener('pointerdown',e=>{e.preventDefault();down=true;hist.push(px.slice());if(hist.length>60)hist.shift();try{cv.setPointerCapture(e.pointerId)}catch{}paint(e)});
  cv.addEventListener('pointermove',e=>{if(down)paint(e)});const stop=()=>{down=false};cv.addEventListener('pointerup',stop);cv.addEventListener('pointercancel',stop);
  const foot=el('div','btnrow an-fedfoot');card.append(foot);const close=()=>{ov.remove();document.removeEventListener('keydown',onKey,true)};
  const onKey=e=>{if(e.key==='Escape'){e.stopPropagation();close()}};document.addEventListener('keydown',onKey,true);
  aBtn(foot,'Abbrechen',close,'btn');aBtn(foot,'Speichern',()=>{a.cfaces=a.cfaces||{};const fid=id||('f'+uid());a.cfaces[fid]=px.slice();
    a.faces=a.faces||[];let k=a.faces.find(q=>Math.abs(q.t-AN.t)<.02);if(!k){k={t:AN.t};a.faces.push(k);a.faces.sort((p,q)=>p.t-q.t)}k.f='c:'+fid;
    const rt=AN.rts.get(a.id);if(rt)rt.face=null;anCommit();anTimeline();anPane();close();toast('Gesicht gespeichert. Es gilt ab '+anFmtT(AN.t)+'.')},'btn primary');
  ov.addEventListener('pointerdown',e=>{if(e.target===ov)close()});document.body.append(ov);draw();upPrev()}

/* ---------- Cartoon-Effekt ----------
   1. Farben: Kuwahara-Filter (glättet Texturrauschen zu flachen Flächen, Kanten bleiben scharf), dann Cel-Shading in 4 Helligkeitsstufen, kräftigere Farben
   2. Schatten: Rasterpunkte nur in der dunkelsten Stufe
   3. Tusche-Linien: aus einem eigenen Render-Durchgang mit Normalen und Tiefe (echte Kanten von Blöcken und Figuren, nicht vom Texturmuster) */
let anNrm=null;
function anNormalPass(W,H){const T=THREE;
  if(!anNrm){anNrm={rt:new T.WebGLRenderTarget(W,H,{minFilter:T.NearestFilter,magFilter:T.NearestFilter,depthBuffer:true}),
    mat:new T.ShaderMaterial({vertexShader:'#include <common>\nvarying vec3 vN;varying float vZ;\nvoid main(){\n#include <beginnormal_vertex>\n#include <defaultnormal_vertex>\n#include <begin_vertex>\n#include <project_vertex>\nvN=normalize(transformedNormal);vZ=-mvPosition.z;}',
      fragmentShader:'varying vec3 vN;varying float vZ;void main(){vec3 n=normalize(vN);float d=clamp(6./max(vZ,6.),0.,1.);float hi=floor(d*255.)/255.;float lo=fract(d*255.);gl_FragColor=vec4(n.xy*.5+.5,hi,lo);}',side:T.DoubleSide}),buf:null}}
  const N=anNrm;if(N.rt.width!==W||N.rt.height!==H){N.rt.setSize(W,H);N.buf=null}if(!N.buf)N.buf=new Uint8Array(W*H*4);
  const R=AR.renderer,S=AR.scene,hide=[AR.helpers,AR.tc,AR.tcm,AR.ring,AR.ghost,AR.path,AR.camMark,AR.stars].filter(Boolean),vis=hide.map(o=>o.visible),bg=S.background,fog=S.fog,ov=S.overrideMaterial,au=R.shadowMap.autoUpdate,cc=new T.Color();R.getClearColor(cc);const ca=R.getClearAlpha();
  hide.forEach(o=>o.visible=false);S.background=null;S.fog=null;S.overrideMaterial=N.mat;R.shadowMap.autoUpdate=false;R.setClearColor(0x8080,0);
  /* durchsichtige Gesichts- und Pflanzenflächen nicht als Kante zählen */
  const flat=[];for(const rt of AN.rts.values())if(rt.fmesh&&rt.fmesh.visible){flat.push(rt.fmesh);rt.fmesh.visible=false}
  R.setRenderTarget(N.rt);R.clear();R.render(S,AR.camera);R.readRenderTargetPixels(N.rt,0,0,W,H,N.buf);R.setRenderTarget(null);
  flat.forEach(o=>o.visible=true);hide.forEach((o,i)=>o.visible=vis[i]);S.background=bg;S.fog=fog;S.overrideMaterial=ov;R.shadowMap.autoUpdate=au;R.setClearColor(cc,ca);return N.buf}
const anCartoonTmp={};
/* Comic-Texturen: Blocktexturen (bis 32 px) auf ihre 3 Hauptfarben reduzieren und Einzelpixel glätten → flache, saubere Flächen */
const anComicTex=new WeakMap();
function anFlatTex(tex){const img=tex&&tex.image;if(!img||!img.width||img.width>32||img.height>32)return tex;let t=anComicTex.get(tex);if(t)return t;
  const w=img.width,h=img.height,c=mk(w,h),x=c.getContext('2d');x.drawImage(img,0,0);const im=x.getImageData(0,0,w,h),d=im.data,n=w*h,P=[];
  for(let i=0;i<n;i++)if(d[i*4+3]>20)P.push(i);if(P.length<4){anComicTex.set(tex,tex);return tex}
  const L=i=>d[i*4]*.3+d[i*4+1]*.59+d[i*4+2]*.11,so=P.slice().sort((a,b)=>L(a)-L(b));let C=[so[Math.floor(so.length*.15)],so[Math.floor(so.length*.5)],so[Math.floor(so.length*.85)]].map(i=>[d[i*4],d[i*4+1],d[i*4+2]]);
  const lab=new Int8Array(n).fill(-1);
  for(let it=0;it<8;it++){const S=C.map(()=>[0,0,0,0]);for(const i of P){let b=0,bd=1e9;C.forEach((c2,k)=>{const dd=(d[i*4]-c2[0])**2+(d[i*4+1]-c2[1])**2+(d[i*4+2]-c2[2])**2;if(dd<bd){bd=dd;b=k}});lab[i]=b;S[b][0]+=d[i*4];S[b][1]+=d[i*4+1];S[b][2]+=d[i*4+2];S[b][3]++}
    C=C.map((c2,k)=>S[k][3]?[S[k][0]/S[k][3],S[k][1]/S[k][3],S[k][2]/S[k][3]]:c2)}
  const out=new Int8Array(lab);for(const i of P){const px=i%w,py=(i/w)|0,cnt=[0,0,0];for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const j=((py+dy+h)%h)*w+(px+dx+w)%w;if(lab[j]>=0)cnt[lab[j]]++}
    const m=cnt.indexOf(Math.max(...cnt));if(cnt[m]>=5)out[i]=m}
  for(const i of P){const c2=C[out[i]];d[i*4]=c2[0];d[i*4+1]=c2[1];d[i*4+2]=c2[2]}x.putImageData(im,0,0);
  const T=THREE;t=new T.CanvasTexture(c);t.magFilter=T.NearestFilter;t.minFilter=tex.minFilter;t.wrapS=tex.wrapS;t.wrapT=tex.wrapT;t.encoding=tex.encoding;t.anisotropy=tex.anisotropy;t.generateMipmaps=tex.generateMipmaps;
  anComicTex.set(tex,t);return t}
/* Cel-Shading mit 2 harten Stufen: Lambert-Materialien werden für diesen Durchgang gegen Toon-Materialien getauscht */
const anToon=new WeakMap();let anToonGrad=null;
function anToonMat(m){let t=anToon.get(m);const T=THREE;
  if(!anToonGrad){anToonGrad=new T.DataTexture(new Uint8Array([150,150,150,255,205,205,205,255,255,255,255,255]),3,1,T.RGBAFormat);anToonGrad.magFilter=anToonGrad.minFilter=T.NearestFilter;anToonGrad.generateMipmaps=false;anToonGrad.needsUpdate=true}
  const map=m.map||null;
  if(!t){t=new T.MeshToonMaterial({map,gradientMap:anToonGrad,vertexColors:m.vertexColors,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest,side:m.side,depthWrite:m.depthWrite,
      polygonOffset:m.polygonOffset,polygonOffsetFactor:m.polygonOffsetFactor,polygonOffsetUnits:m.polygonOffsetUnits});anToon.set(m,t)}
  if(t.map!==map){t.map=map;t.needsUpdate=true}t.color.copy(m.color);if(m.emissive)t.emissive.copy(m.emissive);t.visible=m.visible;return t}
function anSwapRender(fn){const S=AR.scene,sw=[];
  S.traverse(o=>{if(!o.isMesh||!o.material)return;const ms=o.material;if(Array.isArray(ms)){if(!ms.some(m=>m.isMeshLambertMaterial))return;sw.push([o,ms]);o.material=ms.map(m=>m.isMeshLambertMaterial?fn(m):m)}
    else if(ms.isMeshLambertMaterial){sw.push([o,ms]);o.material=fn(ms)}});
  try{AR.renderer.render(S,AR.camera)}finally{for(const[o,m]of sw)o.material=m}}
/* Nur das Licht (weißes Material): zeigt, wo Schatten liegt – dort kommen die Comic-Rasterpunkte hin */
let anLightMat=null;
function anLightOnly(m){if(!anLightMat)anLightMat=new THREE.MeshLambertMaterial({color:0xffffff});return anLightMat}
function anCartoon(x,W,H){const T0=anCartoonTmp;
  /* 1. Szene mit Comic-Texturen und 2-Stufen-Licht rendern, kräftige Farben */
  let ok=true;try{anSwapRender(anToonMat)}catch{ok=false}
  if(ok){x.save();try{x.filter='saturate(1.25) contrast(1.07) brightness(1.03)'}catch{}x.drawImage(AR.renderer.domElement,0,0,W,H);x.restore()}
  let buf=null;try{buf=anNormalPass(W,H)}catch{buf=null}
  const id=i=>(buf[i*4+2]+buf[i*4+3]/255)/255;
  /* 2. Rasterpunkte (Ben-Day) in Schattenbereichen */
  if(buf){try{anSwapRender(anLightOnly);const cell=Math.max(5,Math.round(H/100)),gw=Math.ceil(W/cell)+1,gh=Math.ceil(H/cell)+1;
    const g=T0.g&&T0.g.width===gw&&T0.g.height===gh?T0.g:(T0.g=mk(gw,gh)),gx=g.getContext('2d',{willReadFrequently:true});gx.drawImage(AR.renderer.domElement,0,0,gw,gh);const gd=gx.getImageData(0,0,gw,gh).data;
    x.save();x.globalCompositeOperation='multiply';x.fillStyle='rgba(20,10,40,.22)';x.beginPath();
    for(let gy=0;gy<gh;gy++)for(let gxx=0;gxx<gw;gxx++){const px=gxx*cell+(gy%2?cell/2:0),py=gy*cell;if(px>=W||py>=H)continue;const bi=((H-1-Math.min(H-1,py|0))*W+Math.min(W-1,px|0));if(id(bi)<.004)continue;
      const l=gd[(gy*gw+gxx)*4]/255,r=cell*.32*Math.min(1,(.66-l)/.2);if(r<.7)continue;x.moveTo(px+r,py);x.arc(px,py,r,0,6.2832)}
    x.fill();x.restore()}catch{}}
  if(!buf)return;
  /* 3. Dicke Tusche-Linien an echten Kanten (Normalen und Tiefe) */
  const lc=T0.l&&T0.l.width===W&&T0.l.height===H?T0.l:(T0.l=mk(W,H)),lx=lc.getContext('2d'),li=lx.createImageData(W,H),ld=li.data,o=Math.max(1,Math.round(H/340));
  for(let y=o;y<H-o;y++){const sy=H-1-y;for(let xx=o;xx<W-o;xx++){const i=sy*W+xx,iL=i-o,iR=i+o,iU=i+o*W,iD=i-o*W,dc=id(i);
    const nx=(Math.abs(buf[iL*4]-buf[iR*4])+Math.abs(buf[iL*4+1]-buf[iR*4+1])+Math.abs(buf[iU*4]-buf[iD*4])+Math.abs(buf[iU*4+1]-buf[iD*4+1]))/255;
    const dl=Math.abs(id(iL)+id(iR)-2*dc),du=Math.abs(id(iU)+id(iD)-2*dc),near=Math.max(dc,id(iL),id(iR),id(iU),id(iD)),dd=Math.max(dl,du)/Math.max(.002,near);
    let a=Math.max(Math.min(1,(nx-.4)/.25),Math.min(1,(dd-.07)/.07));if(a<=0)continue;a*=Math.min(1,Math.max(.35,(near-.005)/.025));
    const k=(y*W+xx)*4;ld[k]=18;ld[k+1]=14;ld[k+2]=24;ld[k+3]=Math.round(a*235)}}
  lx.putImageData(li,0,0);x.drawImage(lc,0,0)}
