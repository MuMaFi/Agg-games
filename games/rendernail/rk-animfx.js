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
/* ---------- Partikel-Texturen: aus dem Minecraft-Paket (textures/particle/…), sonst nachgezeichnet ---------- */
let anPTex=null;
function anTexOf(c){const T=THREE,t=new T.CanvasTexture(c);t.magFilter=T.NearestFilter;t.minFilter=T.NearestFilter;t.generateMipmaps=false;t.encoding=T.sRGBEncoding;return t}
function anPackFrames(prefix){if(typeof PACK==='undefined'||!PACK)return null;const re=new RegExp('^p/'+prefix+'_(\\d+)$'),L=Object.keys(PACK.imgs).map(k=>[k,k.match(re)]).filter(x=>x[1]).sort((a,b)=>a[1][1]-b[1][1]).map(x=>PACK.imgs[x[0]]);return L.length?L:null}
const anPxCount=c=>{const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>20)n++;return n};
function anParticleTex(){if(anPTex)return anPTex;anPTex={};
  /* generic_0 … 7 (für „poof“): vom größten zum kleinsten Wölkchen */
  let gen=anPackFrames('generic');
  if(!gen){gen=[];for(let i=0;i<8;i++){const c=mk(8,8),x=c.getContext('2d'),r=4.1-i*.46;for(let y=0;y<8;y++)for(let xx=0;xx<8;xx++){const d=Math.hypot(xx+.5-4,y+.5-4);if(d>r)continue;const e=d/r;x.fillStyle=e>.72?'#c8c8c8':e>.4?'#e8e8e8':'#fff';x.fillRect(xx,y,1,1)}gen.push(c)}}
  anPTex.poof=gen.slice().sort((a,b)=>anPxCount(b)-anPxCount(a)).map(anTexOf);
  /* gust_* (Windstoß), sonst nachgezeichnete Wirbel */
  let gu=anPackFrames('gust');
  if(!gu){gu=[];for(let i=0;i<12;i++){const c=mk(32,32),x=c.getContext('2d');x.strokeStyle='rgba(235,245,255,.95)';x.lineWidth=3;const p=i/11;
      for(let k=0;k<3;k++){x.beginPath();const r=5+k*4+p*8;x.arc(16,16,r,k*2.1+p*3,k*2.1+p*3+2.6-p*1.8);x.stroke()}gu.push(c)}}
  anPTex.gust=gu.map(anTexOf);anPTex.real=!!anPackFrames('generic');return anPTex}
if(typeof packWatchers!=='undefined')packWatchers.push(()=>{anPTex=null;anTerrainTex.clear();for(const e of AN_PFX.values())e.key=''});
/* Block-Brocken (TerrainParticle): ein zufälliges 4 × 4-Stück der Blocktextur */
const anTerrainTex=new Map();
function anBlockBelow(m){const D=AN.data,x=Math.floor(m.x/AB),z=Math.floor(m.z/AB),y=Math.round(m.rootY/AB)-1;let best=null;
  for(const b of D.blocks)if(b[0]===x&&b[2]===z&&b[1]<=y&&(!best||b[1]>best[1]))best=b;return best?best[3]:(D.bg.ground==='none'?null:({grass:'dirt',sand:'sand',stone:'stone',snow:'snow'}[D.bg.ground]||'dirt'))}
function anTerrainPiece(key,ox,oy){const id=key+'|'+ox+'|'+oy;let t=anTerrainTex.get(id);if(t)return t;const f=anFaces(key)||anFaces('dirt');if(!f)return null;const src=f[1]||f[0],w=src.width,c=mk(4,4);
  c.getContext('2d').drawImage(src,ox/16*w,oy/16*w,w/4,w/4,0,0,4,4);t=anTexOf(c);anTerrainTex.set(id,t);return t}

/* ---------- Partikel deterministisch simulieren (gleiche Zufallszahlen bei jedem Abspielen und im Video) ---------- */
const AN_PFX=new Map();
function anGauss(r){let u=0,v=0;while(!u)u=r();while(!v)v=r();return Math.sqrt(-2*Math.log(u))*Math.cos(6.283185*v)}
const anSeed=s=>[...s].reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619),2166136261)>>>0;
/* ExplodeParticle („poof“, 20 Stück bei deathTime 20) */
function anPoofSim(r,X,Y,Z){const P=[];
  for(let i=0;i<20;i++){const d0=anGauss(r)*.02,d1=anGauss(r)*.02,d2=anGauss(r)*.02,px=X+.6*(2*r()-1),py=Y+1.8*r(),pz=Z+.6*(2*r()-1);
    P.push({k:'poof',t0:20,px,py,pz,xd:d0+(r()*2-1)*.05,yd:d1+(r()*2-1)*.05,zd:d2+(r()*2-1)*.05,col:r()*.3+.7,size:.1*(r()*r()*6+1),life:Math.floor(16/(r()*.8+.2))+2,grav:-.1,fric:.9})}return P}
/* Streitkolben-Schlag: ParticleUtils.spawnSmashAttackParticles(…, 750) mit DUST_PILLAR (Block-Brocken) */
function anSmashSim(r,X,Y,Z,block){const P=[],power=750,cx=X,cy=Y,cz=Z;if(!block)return P;
  const add=(x,y,z,ys)=>{P.push({k:'dust',t0:0,px:x,py:y,pz:z,xd:anGauss(r)/30,yd:ys+anGauss(r)/2,zd:anGauss(r)/30,col:.6,size:.1*(r()*.5+.5),life:Math.floor(r()*20)+20,grav:1,fric:.98,ground:cy,block,ox:Math.floor(r()*13),oy:Math.floor(r()*13)})};
  for(let i=0;i<power/3;i++){const x=cx+anGauss(r)/2,z=cz+anGauss(r)/2;anGauss(r);const ys=anGauss(r)*.2;anGauss(r);add(x,cy,z,ys)}
  for(let j=0;j<power/1.5;j++){const x=cx+3.5*Math.cos(j)+anGauss(r)/2,z=cz+3.5*Math.sin(j)+anGauss(r)/2;anGauss(r);const ys=anGauss(r)*.05;anGauss(r);add(x,cy,z,ys)}return P}
/* Windstoß (gust_emitter_large: 7 Ticks lang je ein Gust, Abstand (rand−rand)·3, Gust: 12–15 Ticks, 1 Block halbe Größe, voll hell) */
function anGustSim(r,X,Y,Z){const P=[];for(let t=0;t<7;t++)P.push({k:'gust',t0:t,px:X+(r()-r())*3,py:Y+1+(r()-r())*3,pz:Z+(r()-r())*3,xd:0,yd:0,zd:0,col:1,size:1,life:12+Math.floor(r()*4),grav:0,fric:1,bright:1});return P}
function anPartAt(p,ticks){let x=p.px,y=p.py,z=p.pz,xd=p.xd,yd=p.yd,zd=p.zd,og=false;const n=Math.floor(ticks),fr=ticks-n;let qx=x,qy=y,qz=z;
  for(let i=0;i<=n;i++){qx=x;qy=y;qz=z;yd-=.04*p.grav;x+=xd;y+=yd;z+=zd;if(p.ground!=null&&y<p.ground){y=p.ground;yd=0;og=true}xd*=p.fric;yd*=p.fric;zd*=p.fric;if(og){xd*=.7;zd*=.7}}
  return[qx+(x-qx)*fr,qy+(y-qy)*fr,qz+(z-qz)*fr]}
function anPfxUpdate(a,rt,u){let e=AN_PFX.get(a.id);const ticks=u*AN_TICK;if(u<0||ticks>130){if(e)e.g.visible=false;return}
  const m=rt.m,X=m.x/AB,Y=m.rootY/AB,Z=m.z/AB,key=[Math.round(m.x*10),Math.round(m.rootY*10),Math.round(m.z*10),a.dieFx||'',packTick].join(',');
  if(!e){e={g:new THREE.Group(),sp:[],key:''};AR.scene.add(e.g);AN_PFX.set(a.id,e)}
  if(e.key!==key){const r=mulberry32(anSeed(a.id));e.P=anPoofSim(r,X,Y,Z);if(a.dieFx==='mace'){const r2=mulberry32(anSeed(a.id+'m'));e.P=e.P.concat(anSmashSim(r2,X,Y,Z,anBlockBelow(m)),anGustSim(r2,X,Y,Z))}e.key=key}
  while(e.sp.length<e.P.length){const s=new THREE.Sprite(new THREE.SpriteMaterial({transparent:true,alphaTest:.05,depthWrite:false,fog:true}));e.g.add(s);e.sp.push(s)}
  e.g.visible=true;const tex=anParticleTex(),lt=AN.data.light||{},dim=lt.sky==='night'?.45:lt.sky==='sunset'?.85:1;
  e.P.forEach((p,i)=>{const s=e.sp[i],age=ticks-p.t0;if(age<0||age>=p.life){s.visible=false;return}const map=p.k==='poof'?tex.poof[Math.min(tex.poof.length-1,Math.floor(age*(tex.poof.length-1)/p.life))]:p.k==='gust'?tex.gust[Math.min(tex.gust.length-1,Math.floor(age*(tex.gust.length-1)/p.life))]:anTerrainPiece(p.block,p.ox,p.oy);
    if(!map){s.visible=false;return}s.visible=true;const[x,y,z]=anPartAt(p,age);s.position.set(x*AB,y*AB,z*AB);s.scale.setScalar(p.size*2*AB);if(s.material.map!==map){s.material.map=map;s.material.needsUpdate=true}
    const c=p.col*(p.bright?1:dim);s.material.color.setRGB(c,c,c)});
  for(let i=e.P.length;i<e.sp.length;i++)e.sp[i].visible=false}
/* Wird nach dem Setzen der Pose für jede Figur aufgerufen */
function anApplyDeath(a,rt){const u=anDeathU(a,AN.t),g=rt.m.group;if(u>=0)g.rotation.z+=anDieAngle(u);g.visible=!(u>=1);anHurt(rt,u>=0&&u<1);anPfxUpdate(a,rt,u)}
function anPoofCleanup(){for(const[id,e]of AN_PFX)if(!AN.data.actors.some(a=>a.id===id&&a.die!=null)){AR.scene.remove(e.g);e.sp.forEach(s=>s.material.dispose());AN_PFX.delete(id)}}
function anDie(a,fx){a.die=Math.round(AN.t*20)/20;if(fx)a.dieFx=fx;else delete a.dieFx;if(typeof PACK!=='undefined'&&PACK&&!anPackFrames('generic'))setTimeout(()=>toast('Für die Original-Partikel: Einstellungen → Minecraft-Texturen → „Neu von Mojang laden“.'),2600);if(a.die+1.8>AN.data.dur){AN.data.dur=Math.min(30,Math.ceil((a.die+1.8)*2)/2)}anCommit();anTimeline();anPane();toast(a.name+(fx==='mace'?' wird bei ':' stirbt bei ')+anFmtT(a.die)+(fx==='mace'?' mit dem Streitkolben besiegt. Drück auf Abspielen.':'. Drück auf Abspielen.'))}

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
