'use strict';
/* ================= Formate & Projekte ================= */
const FORMATS={
  yt:{n:'YouTube-Thumbnail',d:'YouTube',w:1280,h:720,ic:[30,17]},
  short:{n:'Shorts / TikTok / Reels',d:'9:16',w:1080,h:1920,ic:[14,25]},
  insta:{n:'Instagram-Post',d:'1:1',w:1080,h:1080,ic:[22,22]},
  portrait:{n:'Instagram Hochformat',d:'4:5',w:1080,h:1350,ic:[19,24]}
};
let PROJECTS=new Map(),projNote='';const homeWatchers=[];
const setSave=t=>{$('#savestate').textContent=t};
function localProj(){return store.get('rk-projects',{})}
for(const[id,p]of Object.entries(localProj()))PROJECTS.set(id,p);
function projDoc(p){if(Array.isArray(p.slides)&&p.slides[p.cur|0])p.slides[p.cur|0].layers=p.layers;
  return{id:p.id,name:p.name,format:p.format,w:p.w,h:p.h,layers:p.layers,created:p.created,updated:p.updated,preview:p.preview||'',...(Array.isArray(p.slides)?{slides:p.slides,cur:p.cur|0}:{})}}
let saveQ=Promise.resolve();
function persistProject(p){
  const doc=projDoc(p);PROJECTS.set(p.id,doc);homeWatchers.forEach(f=>f());
  if(DB){setSave('Speichert…');saveQ=saveQ.then(()=>DB.collection('projects').doc(p.id).set(doc)).then(()=>setSave('Gespeichert')).catch(e=>setSave(e&&e.code==='invalid_argument'?'Nicht gespeichert: Design zu groß':'Nicht gespeichert'))}
  else{const o=localProj();o[p.id]=doc;setSave(store.set('rk-projects',o)?'Auf diesem Gerät gespeichert':'Nicht gespeichert: Speicher voll')}}
function deleteProject(id){PROJECTS.delete(id);homeWatchers.forEach(f=>f());
  if(DB)DB.collection('projects').doc(id).delete().catch(()=>toast('Löschen hat nicht geklappt.'));
  else{const o=localProj();delete o[id];store.set('rk-projects',o)}}
onCaps(async k=>{
  if(k!=='db'||!DB)return;
  const local=localProj();
  for(const[id,doc]of Object.entries(local)){try{await DB.collection('projects').doc(id).set(doc);delete local[id]}catch{}}
  store.set('rk-projects',local);
  let t=setTimeout(()=>{projNote='Deine gespeicherten Designs sind gerade nicht erreichbar.';homeWatchers.forEach(f=>f())},10000);
  DB.collection('projects').onSnapshot(s=>{
    if(!s.metadata.fromCache){clearTimeout(t);projNote=''}
    const m=new Map();for(const[id,p]of Object.entries(localProj()))m.set(id,p);
    s.docs.forEach(d=>{const v=d.data();if(v&&Array.isArray(v.layers))m.set(d.id,{...v,id:d.id})});
    if(ED.p&&m.has(ED.p.id))m.set(ED.p.id,projDoc(ED.p));
    PROJECTS=m;homeWatchers.forEach(f=>f())},
  ()=>{clearTimeout(t);projNote='Gespeicherte Designs konnten nicht geladen werden.';homeWatchers.forEach(f=>f())})});

/* ================= Editor-Zustand ================= */
const ED={rot3d:false,ghost:null,multi:false,snap:true,marquee:null,snapT:null,showN:90,p:null,sel:[],z:1,fit:true,panX:0,panY:0,hist:[],fut:[],tab:'assets',cat:'items',q:'',drag:null,guides:null,propsOpen:true,ptrs:new Map()};
const TYPE_LABEL={asset:'Element',text:'Text',image:'Bild',backdrop:'Hintergrund',figure:'Minecraft-Figur'};
const CAT_LABEL_A=Object.fromEntries(CATS_A);
function newProject(format,o={}){const f=FORMATS[format]||FORMATS.yt;const n=[...PROJECTS.values()].length+1;
  const p={id:'p'+uid(),name:o.name||(o.slides?`Präsentation ${n}`:`Design ${n}`),format,w:o.w||f.w,h:o.h||f.h,layers:o.layers||[],created:new Date().toISOString(),updated:new Date().toISOString(),preview:''};
  if(Array.isArray(o.slides)&&o.slides.length){p.slides=o.slides;p.cur=0;p.layers=o.slides[0].layers}return p}
function openProject(doc){
  ED.p=JSON.parse(JSON.stringify(doc));if(Array.isArray(ED.p.slides)&&ED.p.slides.length){ED.p.cur=clamp(ED.p.cur|0,0,ED.p.slides.length-1);ED.p.layers=ED.p.slides[ED.p.cur].layers}else delete ED.p.slides;ED.sel=[];ED.hist=[snap()];ED.fut=[];ED.fit=true;ED.panX=ED.panY=0;
  store.set('rk-current',ED.p.id);$('#ed-name').value=ED.p.name;
  const f=FORMATS[ED.p.format];$('#ed-fmt').textContent=`${f?f.d:'Design'} · ${ED.p.w}×${ED.p.h}`;
  updUndo();buildSide();renderLayers();buildSelbar();buildProps();requestRender();
  if(typeof deckBar==='function')deckBar();
  if(typeof refreshFigureSkins==='function')setTimeout(refreshFigureSkins,60)}
function createAndOpen(format,o){const p=newProject(format,o);PROJECTS.set(p.id,projDoc(p));openProject(p);persistProject(ED.p);location.hash='editor'}
function selLayers(){if(!ED.p)return[];const s=new Set(ED.sel);return ED.p.layers.filter(l=>s.has(l.id))}
function selLayer(){const ls=selLayers();return ls.length===1?ls[0]:null}
const groupOf=L=>L&&L.group?ED.p.layers.filter(l=>l.group===L.group):[L];
function getBackdrop(){return ED.p?ED.p.layers.find(l=>l.type==='backdrop'):null}
function baseLayer(type,o){return Object.assign({id:'l'+uid(),type,x:ED.p.w/2,y:ED.p.h/2,w:200,h:200,rot:0,opacity:1,flip:false,hidden:false,locked:false,shade:0,ol:0,olc:'#ffffff',shadow:0,glow:0,glc:'#ffd36b',free:false},o)}
const isBlock=L=>L&&L.type==='asset'&&!!(LIBK[L.key]||{}).bk;
function layerName(L){if(L.type==='text')return(String(L.text||'').split('\n')[0]||'Text').slice(0,40);return L.name||TYPE_LABEL[L.type]||'Ebene'}

/* ================= Zeichnen ================= */
const txtCache=new Map();let fontsTick=0;
function textCanvas(L){
  const f=FONTS[L.font]||FONTS.luckiest;
  const key=[L.text,L.font,L.size,L.color,L.color2,L.grad,L.stroke,L.strokeColor,L.depth,L.align,fontsTick].join('|');
  let c=txtCache.get(key);if(c)return c;
  const size=Math.max(6,Math.min(900,L.size||80)),lines=String(L.text||' ').split('\n'),font=`${f[2]} ${size}px ${f[1]}`;
  const m=mk(1,1).getContext('2d');m.font=font;
  const widths=lines.map(l=>m.measureText(l||' ').width),sw=L.stroke||0,dep=L.depth||0,lh=size*1.06,pad=Math.ceil(sw+size*.1+4);
  const W=Math.ceil(Math.max(1,...widths)+pad*2+dep),H=Math.ceil(lh*(lines.length-1)+size*1.18+pad*2+dep);
  c=mk(W,H);const x=c.getContext('2d');x.font=font;x.textBaseline='top';x.lineJoin='round';x.miterLimit=2;x.textAlign=L.align||'center';
  const ax=L.align==='left'?pad:L.align==='right'?W-pad-dep:(W-dep)/2,Y=i=>pad+i*lh+size*.06;
  if(dep>0){const dc=shadeHex(L.strokeColor||'#000000',.85);x.fillStyle=dc;x.strokeStyle=dc;x.lineWidth=sw*2;for(let d=dep;d>=1;d--)lines.forEach((ln,i)=>{if(sw)x.strokeText(ln,ax+d,Y(i)+d);x.fillText(ln,ax+d,Y(i)+d)})}
  if(sw){x.strokeStyle=L.strokeColor;x.lineWidth=sw*2;lines.forEach((ln,i)=>x.strokeText(ln,ax,Y(i)))}
  let fill=L.color||'#ffffff';if(L.grad){const g=x.createLinearGradient(0,pad,0,H-pad-dep);g.addColorStop(0,L.color);g.addColorStop(1,L.color2||L.color);fill=g}
  x.fillStyle=fill;lines.forEach((ln,i)=>x.fillText(ln,ax,Y(i)));
  if(txtCache.size>150)txtCache.clear();txtCache.set(key,c);return c}
function refitText(L){const c=textCanvas(L);L.w=c.width;L.h=c.height}
function sourceOf(L){
  if(L.type==='asset'){const a=LIBK[L.key];if(a&&a.bk)return{c:blockCanvas(a.bk,L.yaw??-45,L.pitch??30,L.roll??0),pixel:false};const c=libCanvas(L.key,L.color);return c?{c,pixel:a.pixel}:null}
  if(L.type==='text')return{c:textCanvas(L),pixel:false};
  if(L.type==='figure'){const c=typeof figureCanvas==='function'?figureCanvas(L):null;return c?{c,pixel:false}:null}
  if(L.type==='image'){const e=getImg(srcUrl(L.src));return e&&e.ok?{c:e.img,pixel:!!L.pixel}:null}
  return null}
const srcIds=new WeakMap();let srcN=0;const sid=o=>{let v=srcIds.get(o);if(!v){v=++srcN;srcIds.set(o,v)}return v};
const fxCache=new Map();
function fxOf(L,src){
  const sw=src.c.naturalWidth||src.c.width,sh=src.c.naturalHeight||src.c.height;
  if(!(L.ol>0)&&!L.shade&&!(L.blur>0))return{c:src.c,pad:0,cw:sw,ch:sh};
  const s0=Math.min(1,1600/Math.max(sw,sh)),cw=Math.max(1,Math.round(sw*s0)),ch=Math.max(1,Math.round(sh*s0));
  const os=(L.ol||0)*cw/Math.max(1,L.w),pad=Math.ceil(os)+2;
  const br=(L.blur||0)*cw/Math.max(1,L.w),key=[sid(src.c),cw,ch,Math.round(os*4),L.olc,L.shade,src.pixel?1:0,Math.round(br*4)].join('|');let hit=fxCache.get(key);if(hit)return hit;
  let base=src.c;
  if(s0<1||L.shade){base=mk(cw,ch);const b=base.getContext('2d');b.imageSmoothingEnabled=!src.pixel;b.drawImage(src.c,0,0,cw,ch);
    if(L.shade){b.globalCompositeOperation='source-atop';b.fillStyle=L.shade<0?`rgba(0,0,0,${-L.shade})`:`rgba(255,255,255,${L.shade})`;b.fillRect(0,0,cw,ch)}}
  const c=mk(cw+pad*2,ch+pad*2),x=c.getContext('2d');x.imageSmoothingEnabled=!src.pixel;
  if(os>0){const sil=mk(cw,ch),s=sil.getContext('2d');s.imageSmoothingEnabled=!src.pixel;s.drawImage(base,0,0,cw,ch);s.globalCompositeOperation='source-in';s.fillStyle=L.olc||'#ffffff';s.fillRect(0,0,cw,ch);
    const rings=os>6?[[os,32],[os*.66,22],[os*.33,12]]:[[os,24],[os*.5,12]];
    for(const[r,n]of rings)for(let i=0;i<n;i++){const a=i/n*Math.PI*2;x.drawImage(sil,pad+Math.cos(a)*r,pad+Math.sin(a)*r)}}
  x.drawImage(base,pad,pad,cw,ch);
  let out={c,pad,cw,ch};if(br>0)out=blurFx(out,br);if(fxCache.size>80)fxCache.clear();fxCache.set(key,out);return out}
/* Weichzeichnen: dreifacher Box-Blur (≈ Gauß), bei starker Unschärfe in kleinerer Auflösung */
function blurFx(o,r){const ex=Math.ceil(r*2.2)+2,W0=o.c.width+ex*2,H0=o.c.height+ex*2,d=Math.min(1,8/r),w=Math.max(1,Math.round(W0*d)),h=Math.max(1,Math.round(H0*d)),rr=Math.max(1,Math.round(r*d*.58));
  const t=mk(w,h),x=t.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(o.c,ex*d,ex*d,o.c.width*d,o.c.height*d);
  const im=x.getImageData(0,0,w,h),p=im.data,n=w*h,ch=[0,1,2,3].map(()=>new Float32Array(n));
  for(let i=0;i<n;i++){const a=p[i*4+3]/255;ch[3][i]=a;ch[0][i]=p[i*4]*a;ch[1][i]=p[i*4+1]*a;ch[2][i]=p[i*4+2]*a}
  const tmp=new Float32Array(n),pass=(s,len,cnt,step,lstep)=>{for(let l=0;l<cnt;l++){const o0=l*lstep;let acc=0;const win=rr*2+1;
      for(let k=-rr;k<=rr;k++)acc+=s[o0+clamp(k,0,len-1)*step];
      for(let i=0;i<len;i++){tmp[o0+i*step]=acc/win;acc+=s[o0+Math.min(len-1,i+rr+1)*step]-s[o0+Math.max(0,i-rr)*step]}}
    s.set(tmp)};
  for(const s of ch)for(let k=0;k<3;k++){pass(s,w,h,1,w);pass(s,h,w,w,1)}
  for(let i=0;i<n;i++){const a=ch[3][i];p[i*4+3]=a*255;if(a>0){p[i*4]=ch[0][i]/a;p[i*4+1]=ch[1][i]/a;p[i*4+2]=ch[2][i]/a}}
  x.putImageData(im,0,0);return{c:t,pad:o.pad+ex,cw:o.cw,ch:o.ch,sc:1/d}}
const bdCache=new Map();
function backdropCanvas(L,W,H){
  const url=L.mode==='image'?srcUrl(L.src):'',e=url?getImg(url):null;
  const key=[W,H,packTick,L.mode,L.scene,L.time,L.seed,L.zoom,L.grad,L.color,url,e&&e.ok,L.blur,L.dim,L.vig].join('|');let c=bdCache.get(key);if(c)return c;
  c=mk(W,H);const x=c.getContext('2d');
  if(L.mode==='mcsky')drawMcSky(c,L.time||'day',L.seed||1);
  else if(L.mode==='scene')drawScene(c,sceneFor(L.scene,L.seed),{time:L.scene==='portal'?'nether':L.time,seed:L.seed,zoom:L.zoom||1.2});
  else if(L.mode==='grad'){const st=(GRADS[L.grad]||GRADS.sunset)[1],g=x.createLinearGradient(0,0,0,H);st.forEach((s,i)=>g.addColorStop(i/(st.length-1),s));x.fillStyle=g;x.fillRect(0,0,W,H)}
  else if(L.mode==='image'){x.fillStyle='#10141a';x.fillRect(0,0,W,H);if(e&&e.ok){const im=e.img,s=Math.max(W/im.naturalWidth,H/im.naturalHeight)*(L.zoom||1),iw=im.naturalWidth*s,ih=im.naturalHeight*s;x.drawImage(im,(W-iw)/2,(H-ih)/2,iw,ih)}}
  else{x.fillStyle=L.color||'#1b2433';x.fillRect(0,0,W,H)}
  if(L.blur>0){const f=1/(1+L.blur*.5),t=mk(W*f,H*f),tx=t.getContext('2d');tx.imageSmoothingQuality='high';tx.drawImage(c,0,0,t.width,t.height);
    const t2=mk(t.width*.5,t.height*.5);t2.getContext('2d').drawImage(t,0,0,t2.width,t2.height);tx.clearRect(0,0,t.width,t.height);tx.drawImage(t2,0,0,t.width,t.height);
    x.imageSmoothingQuality='high';x.drawImage(t,-3,-3,W+6,H+6)}
  if(L.dim>0){x.fillStyle=`rgba(0,0,0,${L.dim})`;x.fillRect(0,0,W,H)}
  if(L.vig>0){const g=x.createRadialGradient(W/2,H/2,Math.min(W,H)*.3,W/2,H/2,Math.hypot(W,H)/2);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${L.vig})`);x.fillStyle=g;x.fillRect(0,0,W,H)}
  if(bdCache.size>12)bdCache.clear();bdCache.set(key,c);return c}
function drawLayer(x,L,k,W,H){
  if(L.hidden)return;
  if(L.type==='backdrop'){x.save();x.globalAlpha=clamp(L.opacity??1,0,1);x.drawImage(backdropCanvas(L,W,H),0,0,W,H);x.restore();return}
  const src=sourceOf(L);if(!src)return;const f=fxOf(L,src);
  const kx=L.w/f.cw,ky=L.h/f.ch,dx=-L.w/2-f.pad*kx,dy=-L.h/2-f.pad*ky,dw=(f.cw+2*f.pad)*kx,dh=(f.ch+2*f.pad)*ky;
  x.save();x.globalAlpha=clamp(L.opacity??1,0,1);x.translate(L.x,L.y);x.rotate((L.rot||0)*Math.PI/180);if(L.flip)x.scale(-1,1);
  x.imageSmoothingEnabled=!src.pixel;x.imageSmoothingQuality='high';
  if(L.glow>0){x.shadowColor=L.glc||'#ffd36b';x.shadowBlur=L.glow*k;x.shadowOffsetX=0;x.shadowOffsetY=0;x.drawImage(f.c,dx,dy,dw,dh);x.drawImage(f.c,dx,dy,dw,dh)}
  if(L.shadow>0){x.shadowColor='rgba(0,0,0,.6)';x.shadowBlur=L.shadow*k;x.shadowOffsetX=L.shadow*.3*k;x.shadowOffsetY=L.shadow*.45*k}else{x.shadowColor='rgba(0,0,0,0)';x.shadowBlur=0;x.shadowOffsetX=0;x.shadowOffsetY=0}
  x.drawImage(f.c,dx,dy,dw,dh);x.restore()}

/* ================= Bühne ================= */
const cv=$('#ed-canvas'),cx=cv.getContext('2d');let rq=0,checkerPat=null;
function requestRender(){if(rq)return;rq=requestAnimationFrame(()=>{rq=0;renderStage()})}
function metrics(){const cw=cv.clientWidth,ch=cv.clientHeight,W=ED.p.w,H=ED.p.h;const fitZ=Math.max(.04,Math.min((cw-48)/W,(ch-130)/H));const z=ED.fit?fitZ:ED.z;return{cw,ch,z,ox:(cw-W*z)/2+ED.panX,oy:(ch-H*z)/2+ED.panY+4}}
const toScreen=(p,m)=>[m.ox+p[0]*m.z,m.oy+p[1]*m.z];
const toDesign=(px,py,m)=>[(px-m.ox)/m.z,(py-m.oy)/m.z];
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function corners(L){const a=(L.rot||0)*Math.PI/180,c=Math.cos(a),s=Math.sin(a);return[[-1,-1],[1,-1],[1,1],[-1,1]].map(([i,j])=>{const lx=i*L.w/2,ly=j*L.h/2;return[L.x+lx*c-ly*s,L.y+lx*s+ly*c]})}
function rotHandle(L,m){const a=(L.rot||0)*Math.PI/180,top=[L.x+(L.h/2)*Math.sin(a),L.y-(L.h/2)*Math.cos(a)],p=toScreen(top,m);const o=COARSE?42:30;return[p[0]+Math.sin(a)*o,p[1]-Math.cos(a)*o]}
function drawHandles(pts,tm,rh){cx.strokeStyle='#f0f0f0';cx.lineWidth=1.5;cx.beginPath();cx.moveTo(tm[0],tm[1]);cx.lineTo(rh[0],rh[1]);cx.stroke();
  cx.fillStyle='#ffffff';cx.beginPath();cx.arc(rh[0],rh[1],COARSE?12:8,0,7);cx.fill();cx.stroke();cx.beginPath();cx.arc(rh[0],rh[1],COARSE?5:3.5,.4,5.6);cx.stroke();
  const q=COARSE?8:5;for(const p of pts){cx.fillStyle='#ffffff';cx.fillRect(p[0]-q,p[1]-q,q*2,q*2);cx.strokeStyle='#1e1e1e';cx.lineWidth=1.5;cx.strokeRect(p[0]-q,p[1]-q,q*2,q*2)}}
function selBox(ls){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9,n=0;for(const l of ls){if(l.type==='backdrop')continue;n++;for(const[x,y]of corners(l)){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)}}return n?{x0,y0,x1,y1}:null}
const bbCorners=b=>[[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]];
function renderStage(){
  if(view!=='editor'||!ED.p)return;
  const dpr=Math.min(2,window.devicePixelRatio||1),cw=cv.clientWidth,ch=cv.clientHeight;if(!cw||!ch)return;
  if(cv.width!==Math.round(cw*dpr)||cv.height!==Math.round(ch*dpr)){cv.width=Math.round(cw*dpr);cv.height=Math.round(ch*dpr)}
  const m=metrics(),W=ED.p.w,H=ED.p.h;
  cx.setTransform(dpr,0,0,dpr,0,0);cx.clearRect(0,0,cw,ch);
  cx.fillStyle='#9b9b9b';cx.font='500 12px Inter, system-ui, sans-serif';cx.textBaseline='bottom';cx.textAlign='left';
  if(!checkerPat){const t=mk(16,16),tx=t.getContext('2d');tx.fillStyle='#ffffff';tx.fillRect(0,0,16,16);tx.fillStyle='#d6d6d6';tx.fillRect(0,0,8,8);tx.fillRect(8,8,8,8);checkerPat=cx.createPattern(t,'repeat')}
  cx.save();cx.shadowColor='rgba(0,0,0,.55)';cx.shadowBlur=16;cx.fillStyle='#ffffff';cx.fillRect(m.ox,m.oy,W*m.z,H*m.z);cx.restore();cx.fillStyle=checkerPat;cx.fillRect(m.ox,m.oy,W*m.z,H*m.z);
  cx.save();cx.beginPath();cx.rect(m.ox,m.oy,W*m.z,H*m.z);cx.clip();cx.translate(m.ox,m.oy);cx.scale(m.z,m.z);
  for(const L of ED.p.layers)drawLayer(cx,L,m.z*dpr,W,H);
  if(ED.ghost){cx.save();cx.globalAlpha=.55;drawLayer(cx,ED.ghost,m.z*dpr,W,H);cx.restore()}
  cx.restore();
  cx.strokeStyle='rgba(255,255,255,.1)';cx.lineWidth=1;cx.strokeRect(m.ox-.5,m.oy-.5,W*m.z+1,H*m.z+1);
  if(!ED.p.layers.length){cx.fillStyle='rgba(233,237,242,.6)';cx.textAlign='center';cx.textBaseline='middle';cx.font='600 15px Inter, system-ui, sans-serif';
    cx.fillText('Bilder hier ablegen oder einfügen (⌘V)',m.ox+W*m.z/2,m.oy+H*m.z/2-12);cx.font='13px Inter, system-ui, sans-serif';cx.fillText('oder links ein Element, einen Hintergrund oder eine Vorlage wählen',m.ox+W*m.z/2,m.oy+H*m.z/2+14)}
  if(ED.guides){cx.strokeStyle='#ff4fd8';cx.lineWidth=1;cx.setLineDash([5,4]);
    if(ED.guides.v){cx.beginPath();cx.moveTo(m.ox+W*m.z/2,m.oy);cx.lineTo(m.ox+W*m.z/2,m.oy+H*m.z);cx.stroke()}
    if(ED.guides.h){cx.beginPath();cx.moveTo(m.ox,m.oy+H*m.z/2);cx.lineTo(m.ox+W*m.z,m.oy+H*m.z/2);cx.stroke()}cx.setLineDash([])}
  const SL=selLayers().filter(l=>!l.hidden),L=SL.length===1?SL[0]:null;
  if(ED.snapT){const pts=corners(ED.snapT).map(p=>toScreen(p,m));cx.strokeStyle='#ff4fd8';cx.lineWidth=1.5;cx.setLineDash([4,3]);cx.beginPath();pts.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1]));cx.closePath();cx.stroke();cx.setLineDash([])}
  if(L){
    if(L.type==='backdrop'){cx.strokeStyle='#f0f0f0';cx.lineWidth=2;cx.strokeRect(m.ox,m.oy,W*m.z,H*m.z)}
    else{const pts=corners(L).map(p=>toScreen(p,m));cx.strokeStyle=L.locked?'rgba(255,255,255,.7)':'#f0f0f0';cx.lineWidth=1.5;if(L.locked)cx.setLineDash([5,4]);
      cx.beginPath();pts.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1]));cx.closePath();cx.stroke();cx.setLineDash([]);
      if(!L.locked){const rh=rotHandle(L,m),a=(L.rot||0)*Math.PI/180,tm=toScreen([L.x+(L.h/2)*Math.sin(a),L.y-(L.h/2)*Math.cos(a)],m);drawHandles(pts,tm,rh)}}}
  else if(SL.length>1){
    cx.strokeStyle='rgba(255,255,255,.45)';cx.lineWidth=1;for(const l of SL){if(l.type==='backdrop')continue;const pts=corners(l).map(p=>toScreen(p,m));cx.beginPath();pts.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1]));cx.closePath();cx.stroke()}
    const bb=selBox(SL);if(bb){const pts=bbCorners(bb).map(p=>toScreen(p,m));cx.strokeStyle='#f0f0f0';cx.lineWidth=1.5;cx.setLineDash([6,4]);cx.beginPath();pts.forEach((p,i)=>i?cx.lineTo(p[0],p[1]):cx.moveTo(p[0],p[1]));cx.closePath();cx.stroke();cx.setLineDash([]);
      if(!SL.some(l=>l.locked)){const tm=toScreen([(bb.x0+bb.x1)/2,bb.y0],m);drawHandles(pts,tm,[tm[0],tm[1]-30])}}}
  if(ED.marquee){const a=toScreen([ED.marquee.x0,ED.marquee.y0],m),b=toScreen([ED.marquee.x1,ED.marquee.y1],m);cx.fillStyle='rgba(255,255,255,.08)';cx.strokeStyle='#f0f0f0';cx.lineWidth=1;cx.fillRect(a[0],a[1],b[0]-a[0],b[1]-a[1]);cx.strokeRect(a[0],a[1],b[0]-a[0],b[1]-a[1])}
  $('#z-range').value=Math.round(m.z*100);$('#z-val').textContent=Math.round(m.z*100)+' %';$('#doc-zoom').textContent='@ '+Math.round(m.z*100)+' %'}
new ResizeObserver(()=>requestRender()).observe($('#stagewrap'));
imgWaiters.push(()=>{if(view==='editor'){requestRender();layersSoon()}});
let layersT=0;function layersSoon(){clearTimeout(layersT);layersT=setTimeout(()=>{if(ED.p)renderLayers()},120)}

function hitLayer(d){for(let i=ED.p.layers.length-1;i>=0;i--){const L=ED.p.layers[i];if(L.hidden||L.type==='backdrop')continue;
  const a=-(L.rot||0)*Math.PI/180,dx=d[0]-L.x,dy=d[1]-L.y,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
  if(Math.abs(lx)<=L.w/2&&Math.abs(ly)<=L.h/2)return L}return null}
cv.addEventListener('pointerdown',e=>{
  if(!ED.p)return;closeExport();
  ED.ptrs.set(e.pointerId,[e.offsetX,e.offsetY]);try{cv.setPointerCapture(e.pointerId)}catch{}
  const m=metrics();
  if(ED.ptrs.size===2){const[a,b]=[...ED.ptrs.values()];ED.marquee=null;ED.drag={mode:'pinch',d0:dist(a,b),z0:m.z,mid:[(a[0]+b[0])/2,(a[1]+b[1])/2],px:ED.panX,py:ED.panY};return}
  if(e.button===2)return;
  const P=[e.offsetX,e.offsetY],d=toDesign(P[0],P[1],m);
  if(ED.area){const A=ED.p.layers.find(l=>l.id===ED.area);if(A){ED.drag={mode:'area',L:A,made:[],sx:P[0],sy:P[1]};return}ED.area=null}
  clearTimeout(ED.lpT);if(e.pointerType!=='mouse'){const h0=hitLayer(d);if(h0&&isBlock(h0))ED.lpT=setTimeout(()=>{if(ED.drag&&!ED.drag.moved){ED.drag=null;blockMenu(h0,e.clientX,e.clientY)}},560)}
  const tol=e.pointerType==='touch'?24:12,SL=selLayers().filter(l=>l.type!=='backdrop'&&!l.hidden),additive=e.shiftKey||e.metaKey||e.ctrlKey||ED.multi;
  const pan=()=>({mode:'pan',sx:P[0],sy:P[1],px:ED.panX,py:ED.panY});
  if(SL.length===1&&!SL[0].locked){const L=SL[0];
    if(dist(P,rotHandle(L,m))<tol){ED.drag={mode:'rot',L};return}
    const cs=corners(L),ss=cs.map(p=>toScreen(p,m));
    for(let i=0;i<4;i++)if(dist(P,ss[i])<tol){ED.drag={mode:'size',L,opp:cs[(i+2)%4],sx:i===1||i===2?1:-1,sy:i>=2?1:-1,w0:L.w,h0:L.h,size0:L.size};return}}
  if(SL.length>1&&!SL.some(l=>l.locked)){const bb=selBox(SL),cs=bbCorners(bb),ss=cs.map(p=>toScreen(p,m)),tm=toScreen([(bb.x0+bb.x1)/2,bb.y0],m),st=SL.map(l=>({l,x:l.x,y:l.y,w:l.w,h:l.h,size:l.size,rot:l.rot||0}));
    if(dist(P,[tm[0],tm[1]-30])<tol){const c=[(bb.x0+bb.x1)/2,(bb.y0+bb.y1)/2];ED.drag={mode:'mrot',st,c,a0:Math.atan2(d[1]-c[1],d[0]-c[0])};return}
    for(let i=0;i<4;i++)if(dist(P,ss[i])<tol){ED.drag={mode:'msize',st,opp:cs[(i+2)%4],c0:cs[i]};return}}
  const hit=hitLayer(d);
  if(hit&&ED.rot3d&&SL.length===1&&hit.id===SL[0].id&&isBlock(hit)&&!hit.locked){ED.drag={mode:'rot3d',L:hit,sx:P[0],sy:P[1],y0:hit.yaw??-45,p0:hit.pitch??30};return}
  if(hit){
    if(additive){select(hit.id,'toggle');ED.drag=pan();ED.drag.tap=true;return}
    if(!ED.sel.includes(hit.id))select(hit.id);
    const movers=selLayers().filter(l=>!l.locked&&l.type!=='backdrop');if(!movers.length){ED.drag=pan();return}
    const bb=selBox(movers);ED.drag={mode:'move',ls:movers,start:movers.map(l=>[l.x,l.y]),sx:d[0],sy:d[1],c0:[(bb.x0+bb.x1)/2,(bb.y0+bb.y1)/2]};return}
  if(additive){ED.drag={mode:'marquee',a:d,base:[...ED.sel]};ED.marquee={x0:d[0],y0:d[1],x1:d[0],y1:d[1]};return}
  if(ED.sel.length)select(null);ED.drag=pan()});
const isBed=L=>/^bed:/.test((LIBK[L&&L.key]||{}).bk||'');
function blockSnap(L,nx,ny){let best=null;if(isBed(L))return null;
  for(const T of ED.p.layers){if(T===L||T.hidden||!isBlock(T)||ED.sel.includes(T.id))continue;const A=cubeAxes(T.yaw??-45,T.pitch??30,T.roll??0),k=T.w/3.6,th=T.w*.22;
    if(isBed(T))continue;for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)for(let l=-1;l<=1;l++){if(!i&&!j&&!l)continue;
      const px=T.x+(i*A[0][0]+j*A[1][0]+l*A[2][0])*k,py=T.y+(i*A[0][1]+j*A[1][1]+l*A[2][1])*k,dd=Math.hypot(px-nx,py-ny);
      if(dd>=th||(best&&dd>=best.d))continue;
      if(T.build&&T.cell){const c=[T.cell[0]+i,T.cell[1]+j,T.cell[2]+l];if(ED.p.layers.some(o=>o!==L&&o.build===T.build&&o.cell&&o.cell[0]===c[0]&&o.cell[1]===c[1]&&o.cell[2]===c[2]))continue}
      best={d:dd,x:px,y:py,T,off:[i,j,l]}}}
  return best}
/* Bauwerke: eingerastete Blöcke kennen ihren Platz im 3D-Raster (cell) */
const blockDepth=(c,A)=>c[0]*A[0][2]+c[1]*A[1][2]+c[2]*A[2][2];
/* Fläche: vom Block aus aufziehen, es entstehen Blöcke im selben Raster */
function startArea(L){if(!L||!isBlock(L))return;if(isBed(L)){toast('Betten lassen sich nicht als Fläche verwenden.');return}select(L.id);ED.area=L.id;$('#ed-canvas').classList.add('areamode');buildSelbar();toast('Zieh vom Block weg, um die Fläche aufzuziehen.')}
function areaDrag(D,d){const L=D.L,ls=ED.p.layers;
  for(const o of D.made){const i=ls.indexOf(o);if(i>=0)ls.splice(i,1)}D.made=[];
  if(!L.build||!L.cell){L.build='b'+uid();L.cell=[0,0,0]}
  const A=cubeAxes(L.yaw??-45,L.pitch??30,L.roll??0),k=L.w/3.6,ax=A.map(a=>[a[0]*k,a[1]*k]),det=(p,q)=>p[0]*q[1]-p[1]*q[0];
  const pairs=[[0,2],[0,1],[1,2]],dets=pairs.map(([a,b])=>Math.abs(det(ax[a],ax[b]))),mx=Math.max(...dets),[pa,pb]=pairs[dets[0]>=mx*.35?0:dets.indexOf(mx)];
  const v=[d[0]-L.x,d[1]-L.y],D0=det(ax[pa],ax[pb]);if(Math.abs(D0)<1e-6)return;
  const ni=clamp(Math.round(det(v,ax[pb])/D0),-23,23),nj=clamp(Math.round(det(ax[pa],v)/D0),-23,23);
  const occ=new Set(buildMembers(L.build).map(o=>o.cell.join(','))),at=ls.indexOf(L)+1,grp=L.group||null;
  for(let i=0;Math.abs(i)<=Math.abs(ni);i+=Math.sign(ni)||1){for(let j=0;Math.abs(j)<=Math.abs(nj);j+=Math.sign(nj)||1){if(!i&&!j){if(!nj)break;continue}
      const c=[...L.cell];c[pa]+=i;c[pb]+=j;if(occ.has(c.join(',')))continue;
      const n=JSON.parse(JSON.stringify(L));n.id='l'+uid();n.cell=c;n.locked=false;if(grp)n.group=grp;D.made.push(n);if(!nj)break}if(!ni)break}
  ls.splice(at,0,...D.made);relayoutBuild(L)}
function blockMenu(L,x,y){select(L.id);closeMenu();const el=document.createElement('div');el.className='menu';el.setAttribute('role','menu');
  for(const[label,fn]of[['Als Fläche verwenden',()=>startArea(L)],['Kopie',dup],['Löschen',del]]){const b=document.createElement('button');b.type='button';b.setAttribute('role','menuitem');b.innerHTML='<span></span><kbd></kbd>';b.firstChild.textContent=label;b.addEventListener('click',()=>{closeMenu();fn()});el.append(b)}
  document.body.append(el);el.style.left=Math.max(6,Math.min(x,innerWidth-el.offsetWidth-6))+'px';el.style.top=Math.max(6,Math.min(y,innerHeight-el.offsetHeight-6))+'px';openMenu={el,btn:document.createElement('button')};el.querySelector('button').focus({preventScroll:true})}
cv.addEventListener('contextmenu',e=>{if(!ED.p)return;e.preventDefault();const r=cv.getBoundingClientRect(),d=toDesign(e.clientX-r.left,e.clientY-r.top,metrics()),h=hitLayer(d);if(h&&isBlock(h)){ED.drag=null;blockMenu(h,e.clientX,e.clientY)}});
function buildMembers(b){return ED.p.layers.filter(l=>l.build===b&&l.cell&&isBlock(l))}
function sortBuild(b){const ls=ED.p.layers,mem=buildMembers(b);if(mem.length<2)return;
  const A=cubeAxes(mem[0].yaw??-45,mem[0].pitch??30,mem[0].roll??0),slots=mem.map(l=>ls.indexOf(l)).sort((x,y)=>x-y);
  const sorted=[...mem].sort((a,c)=>blockDepth(a.cell,A)-blockDepth(c.cell,A)||a.cell[1]-c.cell[1]);slots.forEach((i,n)=>{ls[i]=sorted[n]})}
function relayoutBuild(anchor){if(!anchor||!anchor.build||!anchor.cell)return;const mem=buildMembers(anchor.build),A=cubeAxes(anchor.yaw??-45,anchor.pitch??30,anchor.roll??0),k=anchor.w/3.6;
  for(const l of mem){if(l===anchor)continue;const o=[l.cell[0]-anchor.cell[0],l.cell[1]-anchor.cell[1],l.cell[2]-anchor.cell[2]];
    l.x=anchor.x+(o[0]*A[0][0]+o[1]*A[1][0]+o[2]*A[2][0])*k;l.y=anchor.y+(o[0]*A[0][1]+o[1]*A[1][1]+o[2]*A[2][1])*k;l.w=anchor.w;l.h=anchor.h;l.yaw=anchor.yaw;l.pitch=anchor.pitch;l.roll=anchor.roll;l.rot=anchor.rot||0}
  sortBuild(anchor.build)}
function attachToBuild(L,T,off){if(!T.build||!T.cell){T.build='b'+uid();T.cell=[0,0,0]}L.build=T.build;L.cell=[T.cell[0]+off[0],T.cell[1]+off[1],T.cell[2]+off[2]];sortBuild(T.build)}
function detachFromBuild(L){const b=L.build;delete L.build;delete L.cell;if(b){const mem=buildMembers(b);if(mem.length===1){delete mem[0].build;delete mem[0].cell}}}
/* Freie Blöcke: wer weiter unten im Bild steht, liegt vorne */
function autoOrderFree(L){const ls=ED.p.layers,b=selBox([L]),ov=ls.filter(o=>o!==L&&!o.hidden&&isBlock(o)&&!(o.build&&o.build===L.build)&&(()=>{const c=selBox([o]);return c.x1>b.x0&&c.x0<b.x1&&c.y1>b.y0&&c.y0<b.y1})());
  if(!ov.length)return;const behind=ov.filter(o=>o.y+o.h/2<=L.y+L.h/2),front=ov.filter(o=>o.y+o.h/2>L.y+L.h/2);
  ls.splice(ls.indexOf(L),1);let at;
  if(behind.length)at=Math.max(...behind.map(o=>ls.indexOf(o)))+1;else at=Math.min(...front.map(o=>ls.indexOf(o)));
  ls.splice(at,0,L)}
cv.addEventListener('pointermove',e=>{
  if(ED.ptrs.has(e.pointerId))ED.ptrs.set(e.pointerId,[e.offsetX,e.offsetY]);
  const D=ED.drag;if(!D)return;const m=metrics(),W=ED.p.w,H=ED.p.h,P=[e.offsetX,e.offsetY],d=toDesign(P[0],P[1],m);
  if(!D.moved&&D.tap&&dist(P,[D.sx,D.sy])<5)return;if(D.sx!=null&&dist(P,[D.sx,D.sy])>8)clearTimeout(ED.lpT);D.moved=true;
  if(D.mode==='area'){areaDrag(D,d);requestRender();return}
  if(D.mode==='pinch'){if(ED.ptrs.size<2)return;const[a,b]=[...ED.ptrs.values()];ED.fit=false;ED.z=clamp(D.z0*dist(a,b)/D.d0,.05,4);const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];ED.panX=D.px+mid[0]-D.mid[0];ED.panY=D.py+mid[1]-D.mid[1]}
  else if(D.mode==='move'){let dx=d[0]-D.sx,dy=d[1]-D.sy;const th=8/m.z,cxn=D.c0[0]+dx,cyn=D.c0[1]+dy;ED.guides={v:Math.abs(cxn-W/2)<th,h:Math.abs(cyn-H/2)<th};if(ED.guides.v)dx=W/2-D.c0[0];if(ED.guides.h)dy=H/2-D.c0[1];
    D.snap=null;ED.snapT=null;
    ED.ghost=null;
    if(ED.snap&&D.ls.length===1&&isBlock(D.ls[0])){const L=D.ls[0],sn=Math.hypot(d[0]-D.sx,d[1]-D.sy)<4/m.z?null:blockSnap(L,D.start[0][0]+d[0]-D.sx,D.start[0][1]+d[1]-D.sy);if(sn){ED.guides=null;D.snap=sn;ED.snapT=sn.T;ED.ghost={...L,x:sn.x,y:sn.y,w:sn.T.w,h:sn.T.h,yaw:sn.T.yaw,pitch:sn.T.pitch,roll:sn.T.roll,opacity:.5,ol:0,shadow:0,glow:0}}}
    if(ED.snap&&D.ls.length>1&&D.ls.every(l=>isBlock(l)&&l.build&&l.cell&&l.build===D.ls[0].build)&&Math.hypot(d[0]-D.sx,d[1]-D.sy)>=4/m.z){let best=null;
      D.ls.forEach((l,i)=>{const sn=blockSnap(l,D.start[i][0]+dx,D.start[i][1]+dy);if(sn&&(!best||sn.d<best.sn.d))best={sn,i}});
      if(best&&best.sn.T.w===D.ls[0].w&&best.sn.T.yaw===D.ls[0].yaw&&best.sn.T.pitch===D.ls[0].pitch&&best.sn.T.roll===D.ls[0].roll){ED.guides=null;dx=best.sn.x-D.start[best.i][0];dy=best.sn.y-D.start[best.i][1];D.gsnap=best;ED.snapT=best.sn.T}else D.gsnap=null}
    D.ls.forEach((l,i)=>{l.x=D.start[i][0]+dx;l.y=D.start[i][1]+dy})}
  else if(D.mode==='size'){const L=D.L,a=(L.rot||0)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),vx=d[0]-D.opp[0],vy=d[1]-D.opp[1],lx=vx*ca+vy*sa,ly=-vx*sa+vy*ca;
    let w,h;const free=L.type!=='text'&&(L.free!==e.shiftKey);
    if(free){w=Math.max(8,lx*D.sx);h=Math.max(8,ly*D.sy)}
    else{const s=Math.max(.03,Math.max(lx*D.sx/D.w0,ly*D.sy/D.h0));w=D.w0*s;h=D.h0*s;if(L.type==='text'){L.size=Math.round(Math.max(6,D.size0*s));const c=textCanvas(L);w=c.width;h=c.height}}
    L.w=w;L.h=h;const cxl=D.sx*w/2,cyl=D.sy*h/2;L.x=D.opp[0]+cxl*ca-cyl*sa;L.y=D.opp[1]+cxl*sa+cyl*ca;if(L.build)relayoutBuild(L)}
  else if(D.mode==='msize'){const ex=Math.abs(D.c0[0]-D.opp[0])||1,ey=Math.abs(D.c0[1]-D.opp[1])||1,s=Math.max(.05,Math.max(Math.abs(d[0]-D.opp[0])/ex,Math.abs(d[1]-D.opp[1])/ey));
    for(const o of D.st){const l=o.l;l.x=D.opp[0]+(o.x-D.opp[0])*s;l.y=D.opp[1]+(o.y-D.opp[1])*s;if(l.type==='text'){l.size=Math.max(6,Math.round(o.size*s));refitText(l)}else{l.w=o.w*s;l.h=o.h*s}}}
  else if(D.mode==='mrot'){let da=Math.atan2(d[1]-D.c[1],d[0]-D.c[0])-D.a0,deg=da*180/Math.PI;if(!e.shiftKey){const sn=Math.round(deg/15)*15;if(Math.abs(sn-deg)<4){deg=sn;da=deg*Math.PI/180}}
    const c=Math.cos(da),sn=Math.sin(da);for(const o of D.st){const vx=o.x-D.c[0],vy=o.y-D.c[1];o.l.x=D.c[0]+vx*c-vy*sn;o.l.y=D.c[1]+vx*sn+vy*c;let r=o.rot+deg;r=((r+180)%360+360)%360-180;o.l.rot=Math.round(r*10)/10}}
  else if(D.mode==='rot'){let ang=Math.atan2(d[1]-D.L.y,d[0]-D.L.x)*180/Math.PI+90;if(!e.shiftKey){const sn=Math.round(ang/15)*15;if(Math.abs(sn-ang)<4)ang=sn}if(ang>180)ang-=360;D.L.rot=Math.round(ang*10)/10}
  else if(D.mode==='pan'){ED.panX=D.px+P[0]-D.sx;ED.panY=D.py+P[1]-D.sy}
  else if(D.mode==='rot3d'){let y=D.y0+(P[0]-D.sx)*.6;y=((y+180)%360+360)%360-180;D.L.yaw=Math.round(y);D.L.pitch=Math.round(clamp(D.p0+(P[1]-D.sy)*.6,-90,90));if(D.L.build)relayoutBuild(D.L)}
  else if(D.mode==='marquee'){const a=D.a;ED.marquee={x0:Math.min(a[0],d[0]),y0:Math.min(a[1],d[1]),x1:Math.max(a[0],d[0]),y1:Math.max(a[1],d[1])};
    const r=ED.marquee,ids=new Set(D.base);for(const l of ED.p.layers){if(l.type==='backdrop'||l.hidden)continue;const b=selBox([l]);if(b.x1>=r.x0&&b.x0<=r.x1&&b.y1>=r.y0&&b.y0<=r.y1)groupOf(l).forEach(g=>ids.add(g.id))}
    ED.sel=[...ids];renderLayers();buildSelbar()}
  requestRender();if(!['pan','pinch','marquee'].includes(D.mode))syncProps()});
function endPtr(e){clearTimeout(ED.lpT);ED.ptrs.delete(e.pointerId);const D=ED.drag;if(!D)return;if(D.mode==='pinch'&&ED.ptrs.size){ED.drag=null;return}
  ED.drag=null;ED.guides=null;ED.snapT=null;ED.ghost=null;
  if(D.mode==='marquee'){ED.marquee=null;select(ED.sel[0]?ED.sel[0]:null,'keep');requestRender();return}
  if(D.moved&&D.mode==='move'&&D.ls.length===1&&isBlock(D.ls[0])){const L=D.ls[0];if(D.snap){const T=D.snap.T;Object.assign(L,{x:D.snap.x,y:D.snap.y,w:T.w,h:T.h,yaw:T.yaw,pitch:T.pitch,roll:T.roll});attachToBuild(L,T,D.snap.off)}else{detachFromBuild(L);autoOrderFree(L)}}
  if(D.moved&&D.mode==='move'&&D.gsnap){const{sn,i}=D.gsnap,ref=D.ls[i],T=sn.T;if(!T.build||!T.cell){T.build='b'+uid();T.cell=[0,0,0]}
    const base=[T.cell[0]+sn.off[0],T.cell[1]+sn.off[1],T.cell[2]+sn.off[2]],rc=[...ref.cell];
    for(const l of D.ls){l.cell=[base[0]+l.cell[0]-rc[0],base[1]+l.cell[1]-rc[1],base[2]+l.cell[2]-rc[2]];l.build=T.build}relayoutBuild(T)}
  else if(D.moved&&D.mode==='move'&&D.ls.length>1)D.ls.filter(l=>isBlock(l)&&!l.build).forEach(autoOrderFree);
  if(D.mode==='area'){ED.area=null;$('#ed-canvas').classList.remove('areamode');if(D.made.length){toast(`Fläche mit ${D.made.length+1} Blöcken erstellt.`);commit()}buildSelbar();requestRender();return}
  if(D.moved&&['rot3d','size'].includes(D.mode)&&D.L&&D.L.build)relayoutBuild(D.L);
  if(D.moved&&['move','size','rot','rot3d','msize','mrot'].includes(D.mode))commit();requestRender()}
cv.addEventListener('pointerup',endPtr);cv.addEventListener('pointercancel',endPtr);
cv.addEventListener('wheel',e=>{if(!ED.p)return;e.preventDefault();const m=metrics();
  if(e.ctrlKey||e.metaKey){ED.fit=false;ED.z=clamp(m.z*Math.exp(-e.deltaY*.01),.05,4)}else{ED.panX-=e.deltaX;ED.panY-=e.deltaY}
  requestRender()},{passive:false});
$('#z-range').addEventListener('input',e=>{ED.fit=false;ED.z=e.target.value/100;requestRender()});
$('#z-in').addEventListener('click',()=>{const m=metrics();ED.fit=false;ED.z=clamp(m.z*1.2,.05,4);requestRender()});
$('#z-out').addEventListener('click',()=>{const m=metrics();ED.fit=false;ED.z=clamp(m.z/1.2,.05,4);requestRender()});
$('#z-fit').addEventListener('click',()=>{ED.fit=true;ED.panX=ED.panY=0;requestRender()});

/* ================= Verlauf & Speichern ================= */
function snap(){return JSON.stringify(ED.p.layers)}
function commit(){const s=snap();if(ED.hist[ED.hist.length-1]===s)return;ED.hist.push(s);if(ED.hist.length>80)ED.hist.shift();ED.fut=[];afterChange()}
let softT=0;const softCommit=()=>{clearTimeout(softT);softT=setTimeout(commit,350)};
function afterChange(){updUndo();renderLayers();scheduleSave();if(typeof deckChanged==='function')deckChanged()}
function updUndo(){$('#ed-undo').disabled=ED.hist.length<2;$('#ed-redo').disabled=!ED.fut.length}
function undo(){if(ED.hist.length<2)return;ED.fut.push(ED.hist.pop());restoreSnap(ED.hist[ED.hist.length-1])}
function redo(){if(!ED.fut.length)return;const s=ED.fut.pop();ED.hist.push(s);restoreSnap(s)}
function restoreSnap(s){ED.p.layers=JSON.parse(s);ED.sel=ED.sel.filter(id=>ED.p.layers.some(l=>l.id===id));buildSelbar();buildProps();updUndo();renderLayers();scheduleSave();requestRender()}
$('#ed-undo').addEventListener('click',undo);$('#ed-redo').addEventListener('click',redo);
let saveT=0;
function scheduleSave(){setSave('Nicht gespeicherte Änderungen');clearTimeout(saveT);saveT=setTimeout(saveNow,1200)}
function saveNow(){clearTimeout(saveT);if(!ED.p)return;ED.p.updated=new Date().toISOString();ED.p.name=$('#ed-name').value.trim()||ED.p.name;ED.p.preview=makePreview();persistProject(ED.p)}
function makePreview(){const W=ED.p.w,H=ED.p.h,s=Math.min(360/W,360/H),c=mk(W*s,H*s),x=c.getContext('2d');x.fillStyle='#2a2a2a';x.fillRect(0,0,c.width,c.height);x.scale(s,s);for(const L of ED.p.layers)drawLayer(x,L,s,W,H);try{return c.toDataURL('image/jpeg',.72)}catch{return''}}
$('#ed-name').addEventListener('input',()=>{if(ED.p){ED.p.name=$('#ed-name').value;scheduleSave()}});
window.addEventListener('pagehide',()=>{if(saveT&&ED.p)saveNow()});

/* ================= Ebenen-Operationen ================= */
function select(id,how='set'){
  if(how!=='keep'&&!(id&&ED.sel.length===1&&ED.sel[0]===id))ED.rot3d=false;
  if(!id)ED.sel=[];
  else if(how!=='keep'){const L=ED.p.layers.find(l=>l.id===id),ids=how==='one'||!L?[id]:groupOf(L).map(l=>l.id);
    if(how==='toggle'){const on=ids.every(i=>ED.sel.includes(i));ED.sel=on?ED.sel.filter(i=>!ids.includes(i)):[...new Set([...ED.sel,...ids])]}
    else ED.sel=ids}
  if(ED.sel.length>1)ED.sel=ED.sel.filter(i=>(ED.p.layers.find(l=>l.id===i)||{}).type!=='backdrop');
  renderLayers();buildSelbar();buildProps();requestRender()}
function pushLayer(L){if(L.type==='backdrop'){ED.p.layers=ED.p.layers.filter(l=>l.type!=='backdrop');ED.p.layers.unshift(L)}else ED.p.layers.push(L);select(L.id);commit();closeSideNarrow()}
function addAsset(key,o={}){const a=LIBK[key],c=libCanvas(key);if(!c)return;const W=ED.p.w,H=ED.p.h;let w,h;
  if(a.cover){w=W;h=W*c.height/c.width;if(h<H){h=H;w=H*c.width/c.height}}
  else{const m=Math.min(W,H)*(a.cat==='hud'?.75:a.cat==='mobs'?.6:.42),s=m/Math.max(c.width,c.height);w=c.width*s;h=c.height*s}
  pushLayer(baseLayer('asset',{key,name:a.name,w,h,color:a.color||undefined,...o}))}
function addText(p){const L=baseLayer('text',{name:'Text',text:p.text,font:p.font,size:p.size,color:p.color,color2:p.color2||p.color,grad:!!p.grad,stroke:p.stroke||0,strokeColor:p.strokeColor||'#15161b',depth:p.depth||0,align:'center'});refitText(L);pushLayer(L)}
function addImageLayer(src,w,h,name,o={}){const W=ED.p.w,H=ED.p.h;const s=o.fitH?H*o.fitH/h:Math.min(W*.6/w,H*.75/h);
  const L=baseLayer('image',{src,name:name||'Bild',w:w*s,h:h*s,pixel:!!o.pixel});if(o.x!=null)L.x=W*o.x;if(o.y!=null)L.y=H*o.y;pushLayer(L)}
function setBackdrop(props){let L=getBackdrop();
  if(!L){L=baseLayer('backdrop',{name:'Hintergrund',locked:true,w:ED.p.w,h:ED.p.h,mode:'color',scene:'island',time:'sunset',seed:31,zoom:1.25,grad:'sunset',color:'#1b2433',blur:0,dim:0,vig:0});ED.p.layers.unshift(L)}
  Object.assign(L,props);select(L.id);commit();requestRender()}
function dup(){ED.rot3d=false;const ls=selLayers().filter(l=>l.type!=='backdrop');if(!ls.length)return;const gm={},ids=[];
  for(const L of ls){const c=JSON.parse(JSON.stringify(L));c.id='l'+uid();c.x+=Math.max(32,L.w*.12);c.y+=Math.max(32,L.h*.12);c.locked=false;if(c.build&&ls.length===1){delete c.build;delete c.cell}if(c.build)c.build=gm['B'+c.build]||(gm['B'+c.build]='b'+uid());if(c.group)c.group=gm[c.group]||(gm[c.group]='g'+uid());ED.p.layers.push(c);ids.push(c.id)}
  ED.sel=ids;select(ids[0],'keep');commit()}
function del(){const s=new Set(ED.sel);if(!s.size)return;ED.p.layers=ED.p.layers.filter(l=>!s.has(l.id));select(null);commit()}
function moveLayer(dir){const ls=ED.p.layers,s=new Set(selLayers().filter(l=>l.type!=='backdrop').map(l=>l.id)),min=getBackdrop()?1:0;if(!s.size)return;let ch=false;
  const idx=ls.map((l,i)=>s.has(l.id)?i:-1).filter(i=>i>=0);if(dir<0)idx.sort((a,b)=>a-b);else idx.sort((a,b)=>b-a);
  for(const i of idx){const j=i+dir;if(j<min||j>=ls.length||s.has(ls[j].id))continue;[ls[i],ls[j]]=[ls[j],ls[i]];ch=true}
  if(ch){commit();requestRender()}}
function groupSel(){const ls=selLayers().filter(l=>l.type!=='backdrop');if(ls.length<2)return;const g='g'+uid(),all=ED.p.layers,top=Math.max(...ls.map(l=>all.indexOf(l)));
  ls.forEach(l=>{l.group=g});const rest=all.filter(l=>!ls.includes(l)),at=rest.indexOf(all.slice(top+1).find(l=>!ls.includes(l)));ED.p.layers=at<0?rest.concat(ls):[...rest.slice(0,at),...ls,...rest.slice(at)];
  commit();select(ls[0].id);toast('Gruppiert.')}
function ungroupSel(){const ls=selLayers();if(!ls.some(l=>l.group))return;ls.forEach(l=>{delete l.group});commit();select(ls[0].id,'keep');toast('Gruppe gelöst.')}
function alignSel(k){const ls=selLayers().filter(l=>l.type!=='backdrop'&&!l.locked);if(!ls.length)return;const bb=ls.length>1?selBox(ls):{x0:0,y0:0,x1:ED.p.w,y1:ED.p.h};
  for(const l of ls){const b=selBox([l]);if(k==='l')l.x+=bb.x0-b.x0;if(k==='r')l.x+=bb.x1-b.x1;if(k==='cx')l.x+=(bb.x0+bb.x1)/2-(b.x0+b.x1)/2;if(k==='t')l.y+=bb.y0-b.y0;if(k==='b')l.y+=bb.y1-b.y1;if(k==='cy')l.y+=(bb.y0+bb.y1)/2-(b.y0+b.y1)/2}
  commit();requestRender()}
function selectAll(){ED.sel=ED.p.layers.filter(l=>l.type!=='backdrop'&&!l.hidden).map(l=>l.id);select(ED.sel[0]||null,'keep')}

/* ================= Ebenenliste ================= */
function iconBtn(svg,label,fn){const b=document.createElement('button');b.type='button';b.className='ib';b.innerHTML=svg;b.setAttribute('aria-label',label);b.title=label;b.addEventListener('click',e=>{e.stopPropagation();fn()});return b}
function drawThumb(c,L){const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height);
  if(L.type==='backdrop'){const b=backdropCanvas(L,ED.p.w,ED.p.h),s=Math.max(c.width/b.width,c.height/b.height);x.drawImage(b,(c.width-b.width*s)/2,(c.height-b.height*s)/2,b.width*s,b.height*s);return}
  const src=sourceOf(L);if(!src)return;const sw=src.c.naturalWidth||src.c.width,sh=src.c.naturalHeight||src.c.height,s=Math.min((c.width-8)/sw,(c.height-8)/sh);
  x.imageSmoothingEnabled=!src.pixel;x.drawImage(src.c,(c.width-sw*s)/2,(c.height-sh*s)/2,sw*s,sh*s)}
function layerRow(L,member){const row=document.createElement('div');row.className='layer'+(member?' member':'');row.tabIndex=0;row.setAttribute('role','button');row.setAttribute('aria-selected',ED.sel.includes(L.id));
  const th=mk(76,76);drawThumb(th,L);
  const t=document.createElement('div');t.style.minWidth='0';t.innerHTML='<b></b><small></small>';t.querySelector('b').textContent=layerName(L);
  t.querySelector('small').textContent=L.type==='asset'?(CAT_LABEL_A[(LIBK[L.key]||{}).cat]||'Element'):TYPE_LABEL[L.type];row.append(t);
  const eye=iconBtn(L.hidden?ICON.eyeoff:ICON.eye,L.hidden?'Einblenden':'Ausblenden',()=>{L.hidden=!L.hidden;commit();requestRender()});if(L.hidden)eye.classList.add('off');
  const lock=iconBtn(L.locked?ICON.lock:ICON.unlock,L.locked?'Entsperren':'Sperren',()=>{L.locked=!L.locked;commit();buildSelbar();requestRender()});if(!L.locked)lock.classList.add('off');
  row.append(eye,th,t,lock);
  const act=e=>{const add=e.shiftKey||e.metaKey||e.ctrlKey||ED.multi;select(L.id,add?(member?'toggle':'toggle'):member?'one':'set')};
  row.addEventListener('click',act);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act(e)}});return row}
function renderLayers(){
  const box=$('#layer-list');box.innerHTML='';if(!ED.p)return;const ls=ED.p.layers;$('#lcount').textContent=ls.length;
  if(!ls.length){const p=document.createElement('p');p.className='sub';p.style.padding='6px 4px';p.textContent='Noch keine Ebenen. Füge oben ein Element, Text oder einen Hintergrund hinzu.';box.append(p);return}
  const done=new Set(),gnum={};let gi=0;for(const l of ls)if(l.group&&!(l.group in gnum))gnum[l.group]=++gi;
  for(let i=ls.length-1;i>=0;i--){const L=ls[i];
    if(!L.group){box.append(layerRow(L));continue}
    if(done.has(L.group))continue;done.add(L.group);const mem=ls.filter(l=>l.group===L.group).reverse();
    const h=document.createElement('div');h.className='layer grouphead';h.tabIndex=0;h.setAttribute('role','button');h.setAttribute('aria-selected',mem.every(l=>ED.sel.includes(l.id)));
    h.innerHTML='<span class="gicon" aria-hidden="true">▾</span><div style="min-width:0"><b></b><small></small></div>';const gi=h.firstElementChild,gt=h.lastElementChild;h.querySelector('b').textContent='Gruppe '+gnum[L.group];h.querySelector('small').textContent=mem.length+' Ebenen';
    const allH=mem.every(l=>l.hidden),allL=mem.every(l=>l.locked);
    const eye=iconBtn(allH?ICON.eyeoff:ICON.eye,allH?'Gruppe einblenden':'Gruppe ausblenden',()=>{mem.forEach(l=>{l.hidden=!allH});commit();requestRender()});if(allH)eye.classList.add('off');
    const lock=iconBtn(allL?ICON.lock:ICON.unlock,allL?'Gruppe entsperren':'Gruppe sperren',()=>{mem.forEach(l=>{l.locked=!allL});commit();buildSelbar();requestRender()});if(!allL)lock.classList.add('off');
    h.append(eye,gi,gt,lock);const act=e=>select(L.id,e.shiftKey||e.metaKey||e.ctrlKey||ED.multi?'toggle':'set');
    h.addEventListener('click',act);h.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();act(e)}});box.append(h);
    for(const m of mem)box.append(layerRow(m,true))}}

/* ================= Auswahl-Leiste & Eigenschaften ================= */
function buildSelbar(){const bar=$('#selbar'),SL=selLayers(),L=SL.length===1?SL[0]:null;bar.innerHTML='';if(!SL.length){const h=document.createElement('span');h.className='sub';h.style.padding='0 6px';h.textContent=ED.multi?'Mehrfach-Auswahl: Ebenen antippen oder einen Rahmen ziehen.':'Ebene antippen, um sie zu bearbeiten. Elemente fügst du links hinzu.';bar.append(h);return}
  const b=(label,icon,fn,o={})=>{const x=document.createElement('button');x.type='button';x.className='btn ghost'+(o.cls?' '+o.cls:'');x.innerHTML=(icon||'')+'<span></span>';x.querySelector('span').textContent=label;x.title=label;x.setAttribute('aria-label',label);x.addEventListener('click',fn);if(o.ic)x.classList.add('ic');if(o.pressed!=null){x.classList.add('tool');x.setAttribute('aria-pressed',o.pressed)}bar.append(x);return x};
  const sep=()=>{const s=document.createElement('span');s.className='sep';bar.append(s)};
  if(SL.length>1){const sp=document.createElement('span');sp.className='sub';sp.style.padding='0 8px';sp.textContent=SL.length+' ausgewählt';bar.append(sp);
    const g=SL[0].group,same=g&&SL.every(l=>l.group===g);if(!same)b('Gruppieren',ICON.group,groupSel);else b('Gruppe lösen',ICON.ungroup,ungroupSel);sep()}
  if(L&&isBlock(L)){b('Fläche',ICON.group,()=>startArea(L),{pressed:ED.area===L.id});b('3D drehen',ICON.rot3d,()=>{ED.rot3d=!ED.rot3d;buildSelbar();if(ED.rot3d)toast('Zieh auf dem Block, um ihn zu drehen. Zum Verschieben wieder ausschalten.')},{pressed:ED.rot3d});sep()}
  if(L&&L.group)b('Ganze Gruppe',ICON.group,()=>select(L.id));
  if(!L||L.type!=='backdrop'){b('Kopie',ICON.copy,dup);if(L)b('Spiegeln',ICON.flip,()=>{L.flip=!L.flip;commit();requestRender()},{ic:1});b('Nach vorne',ICON.front,()=>moveLayer(1),{ic:1});b('Nach hinten',ICON.back,()=>moveLayer(-1),{ic:1})}
  const allL=SL.every(l=>l.locked);b(allL?'Entsperren':'Sperren',ICON.lk,()=>{SL.forEach(l=>{l.locked=!allL});commit();buildSelbar();requestRender()},{pressed:allL,ic:1});
  b('Löschen',ICON.trash,del,{cls:'danger'})}
let propSync=[];
function syncProps(){propSync.forEach(f=>f())}
const pct=v=>Math.round(v*100)+' %';
function fRange(g,label,get,set,min,max,step,fm=v=>v){const id='pr-'+uid();const w=document.createElement('div');w.className='field';
  const sc=fm===pct||(Math.abs(max)<=1&&Math.abs(min)<=1&&step<1)?100:1,dec=step*sc<1?1:0;
  w.innerHTML=`<div class="lab"><label for="${id}"></label><input class="num" type="number" inputmode="decimal" step="${+(step*sc).toFixed(3)}" min="${min*sc}" max="${max*sc}"></div><input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;
  w.querySelector('label').textContent=label;const i=w.querySelector('input[type=range]'),o=w.querySelector('.num');o.setAttribute('aria-label',label);
  const show=v=>{o.value=(+v*sc).toFixed(dec)};const up=()=>{i.value=get();show(get())};up();
  i.addEventListener('input',()=>{set(+i.value);show(+i.value);requestRender();softCommit()});
  o.addEventListener('change',()=>{const v=+o.value/sc;if(isNaN(v)){up();return}set(clamp(v,min,max));up();requestRender();commit()});
  propSync.push(up);g.append(w);return w}
function fColor(g,label,get,set){const id='pr-'+uid();const w=document.createElement('label');w.className='row';w.htmlFor=id;w.innerHTML=`<span></span><input type="color" id="${id}">`;w.querySelector('span').textContent=label;
  const i=w.querySelector('input');i.value=get();i.addEventListener('input',()=>{set(i.value);requestRender();softCommit()});g.append(w);return w}
function fCheck(g,label,get,set){const id='pr-'+uid();const w=document.createElement('label');w.className='row check';w.htmlFor=id;w.innerHTML=`<input type="checkbox" id="${id}"><span></span>`;w.querySelector('span').textContent=label;
  const i=w.querySelector('input');i.checked=!!get();i.addEventListener('change',()=>{set(i.checked);requestRender();commit()});g.append(w);return w}
function fSelect(g,label,opts,get,set){const id='pr-'+uid();const w=document.createElement('div');w.className='field';w.innerHTML=`<div class="lab"><label for="${id}"></label></div><select id="${id}"></select>`;w.querySelector('label').textContent=label;
  const s=w.querySelector('select');for(const[v,l]of opts)s.append(new Option(l,v));s.value=get();s.addEventListener('change',()=>{set(s.value);requestRender();commit()});g.append(w);return w}
function fSeg(g,label,opts,get,set,dis){const w=document.createElement('div');w.className='field';w.innerHTML=`<div class="lab"><span></span></div><div class="seg" role="group"></div>`;w.querySelector('span').textContent=label;
  const sg=w.querySelector('.seg');sg.setAttribute('aria-label',label);for(const[v,l]of opts){const b=document.createElement('button');b.type='button';b.textContent=l;b.setAttribute('aria-pressed',String(get())===String(v));if(dis)b.disabled=true;
    b.addEventListener('click',()=>{set(v);sg.querySelectorAll('button').forEach(x=>x.setAttribute('aria-pressed',x===b));requestRender();commit()});sg.append(b)}g.append(w);return w}
function fText(g,label,get,set,area){const id='pr-'+uid();const w=document.createElement('div');w.className='field';w.innerHTML=`<div class="lab"><label for="${id}"></label></div>`+(area?`<textarea id="${id}" rows="3" maxlength="200"></textarea>`:`<input type="text" id="${id}" maxlength="80">`);
  w.querySelector('label').textContent=label;const i=w.querySelector(area?'textarea':'input');i.value=get();i.addEventListener('input',()=>{set(i.value);requestRender();softCommit()});g.append(w);return w}
function fBtns(g,list){const w=document.createElement('div');w.className='btnrow';for(const[l,fn,cls]of list){const b=document.createElement('button');b.type='button';b.className='btn sm'+(cls?' '+cls:'');b.textContent=l;b.addEventListener('click',fn);w.append(b)}g.append(w);return w}
function buildPropsMulti(P,SL){
  const h=document.createElement('h3');h.innerHTML='<span></span>';h.querySelector('span').textContent=SL.length+' Ebenen ausgewählt';P.append(h);
  const grp=t=>{const g=document.createElement('div');g.className='grp';const l=document.createElement('p');l.className='lbl';l.style.margin='0';l.textContent=t;g.append(l);P.append(g);return g};
  const g=grp('Ausrichten');fBtns(g,[['Links',()=>alignSel('l')],['Mitte',()=>alignSel('cx')],['Rechts',()=>alignSel('r')]]);fBtns(g,[['Oben',()=>alignSel('t')],['Mitte',()=>alignSel('cy')],['Unten',()=>alignSel('b')]]);
  const g2=grp('Gruppe');const same=SL[0].group&&SL.every(l=>l.group===SL[0].group);fBtns(g2,[same?['Gruppe lösen',ungroupSel]:['Gruppieren',groupSel]]);
  const p=document.createElement('p');p.className='sub';p.textContent='Eine Gruppe bewegt, dreht und skaliert sich zusammen. Einzelne Teile wählst du in der Ebenenliste.';g2.append(p);
  const all=(k,v)=>SL.forEach(l=>{l[k]=v});const e=grp('Alle zusammen');
  fRange(e,'Deckkraft',()=>SL[0].opacity??1,v=>all('opacity',v),0,1,.01,pct);
  fRange(e,'Kontur',()=>SL[0].ol||0,v=>all('ol',v),0,40,1,v=>v+' px');fColor(e,'Konturfarbe',()=>SL[0].olc||'#ffffff',v=>all('olc',v));
  fRange(e,'Schatten',()=>SL[0].shadow||0,v=>all('shadow',v),0,80,1,v=>v+' px');
  fRange(e,'Leuchten',()=>SL[0].glow||0,v=>all('glow',v),0,120,1,v=>v+' px');fColor(e,'Leuchtfarbe',()=>SL[0].glc||'#ffd36b',v=>all('glc',v))}
function buildProps(){
  const P=$('#props'),SL=selLayers(),L=SL.length===1?SL[0]:null;propSync=[];P.hidden=false;P.innerHTML='';$('#dock').classList.toggle('noselect',!SL.length);
  if(!SL.length){const n=document.createElement('p');n.className='none';n.textContent=ED.p?`${(FORMATS[ED.p.format]||{n:'Design'}).n} · ${ED.p.w} × ${ED.p.h} px. Wähle eine Ebene aus, um sie hier zu bearbeiten.`:'';P.append(n);return}
  if(!L){buildPropsMulti(P,SL);return}
  const h=document.createElement('h3');const hs=document.createElement('span');hs.textContent=layerName(L);h.append(hs);
  P.append(h);
  const grp=t=>{const g=document.createElement('div');g.className='grp';if(t){const l=document.createElement('p');l.className='lbl';l.style.margin='0';l.textContent=t;g.append(l)}P.append(g);return g};
  const W=ED.p.w,H=ED.p.h,rt=()=>{refitText(L);hs.textContent=layerName(L)};
  if(L.type==='backdrop'){
    const g=grp('Hintergrund');
    fSeg(g,'Art',[['mcsky','Himmel'],['scene','Szene'],['grad','Verlauf'],['color','Farbe'],['image','Bild']],()=>L.mode,v=>{if(v==='image'&&!L.src){$('#f-backdrop').click();return}L.mode=v;buildProps()});
    if(L.mode==='scene'){fSelect(g,'Szene',BG_SCENES.map(s=>[s[0],s[1]]),()=>L.scene,v=>{L.scene=v;const d=BG_SCENES.find(s=>s[0]===v);if(d&&d[2]!=='nether')L.time=d[2];buildProps()});
      fSeg(g,'Tageszeit',[['day','Tag'],['sunset','Abend'],['night','Nacht']],()=>L.time,v=>{L.time=v},L.scene==='portal');
      fBtns(g,[['Neu würfeln',()=>{L.seed=Math.floor(Math.random()*1e6);commit();requestRender();renderLayers()}]]);
      fRange(g,'Zoom',()=>L.zoom||1.2,v=>{L.zoom=v},.6,2.6,.05,pct)}
    if(L.mode==='mcsky'){fSeg(g,'Tageszeit',[['day','Tag'],['sunset','Abend'],['night','Nacht']],()=>L.time||'day',v=>{L.time=v});fBtns(g,[['Andere Wolken',()=>{L.seed=Math.floor(Math.random()*1e6);commit();requestRender();renderLayers()}]])}
    if(L.mode==='grad')fSelect(g,'Verlauf',Object.entries(GRADS).map(([k,v])=>[k,v[0]]),()=>L.grad,v=>{L.grad=v});
    if(L.mode==='color')fColor(g,'Farbe',()=>L.color||'#1b2433',v=>{L.color=v});
    if(L.mode==='image'){fBtns(g,[['Bild ersetzen',()=>$('#f-backdrop').click()]]);fRange(g,'Zoom',()=>L.zoom||1,v=>{L.zoom=v},1,3,.05,pct)}
    const g2=grp('Wirkung');
    fRange(g2,'Unschärfe',()=>L.blur||0,v=>{L.blur=v},0,20,1,v=>v+' px');
    fRange(g2,'Abdunkeln',()=>L.dim||0,v=>{L.dim=v},0,.85,.05,pct);
    fRange(g2,'Vignette',()=>L.vig||0,v=>{L.vig=v},0,.9,.05,pct);
    fRange(g2,'Deckkraft',()=>L.opacity??1,v=>{L.opacity=v},0,1,.01,pct);
    fBtns(grp(),[['Hintergrund entfernen',del,'danger']]);return}
  if(L.type==='text'){const g=grp('Text');
    fText(g,'Text',()=>L.text,v=>{L.text=v;rt()},true);
    fSelect(g,'Schrift',Object.entries(FONTS).map(([k,v])=>[k,v[0]]),()=>L.font,v=>{L.font=v;rt()});
    fRange(g,'Schriftgröße',()=>L.size,v=>{L.size=v;rt()},10,400,1,v=>v+' px');
    fColor(g,'Farbe',()=>L.color,v=>{L.color=v});
    fCheck(g,'Farbverlauf',()=>L.grad,v=>{L.grad=v;buildProps()});
    if(L.grad)fColor(g,'Farbe unten',()=>L.color2||L.color,v=>{L.color2=v});
    fRange(g,'Textkontur',()=>L.stroke||0,v=>{L.stroke=v;rt()},0,40,1,v=>v+' px');
    fColor(g,'Konturfarbe',()=>L.strokeColor||'#15161b',v=>{L.strokeColor=v});
    fRange(g,'3D-Tiefe',()=>L.depth||0,v=>{L.depth=v;rt()},0,30,1,v=>v+' px');
    fSeg(g,'Ausrichtung',[['left','Links'],['center','Mitte'],['right','Rechts']],()=>L.align||'center',v=>{L.align=v;rt()})}
  if(isBlock(L)){const g3=grp('3D-Drehung');
    fRange(g3,'Drehen',()=>L.yaw??-45,v=>{L.yaw=v;relayoutBuild(L)},-180,180,1,v=>v+'°');
    fRange(g3,'Kippen',()=>L.pitch??30,v=>{L.pitch=v;relayoutBuild(L)},-90,90,1,v=>v+'°');
    fRange(g3,'Rollen',()=>L.roll??0,v=>{L.roll=v;relayoutBuild(L)},-180,180,1,v=>v+'°');
    const setR=(y,p,r)=>()=>{L.yaw=y;L.pitch=p;L.roll=r;relayoutBuild(L);commit();requestRender();buildProps()};
    if(L.build){const n=buildMembers(L.build).length;const bp=document.createElement('p');bp.className='sub';bp.textContent=`Teil eines Bauwerks aus ${n} Blöcken: Drehen und Größe gelten für alle, vorne und hinten wird automatisch sortiert.`;g3.append(bp)}
    fBtns(g3,[['Schräg',setR(-45,30,0)],['Vorne',setR(0,0,0)],['Von oben',setR(-45,70,0)],['Von unten',setR(-45,-30,0)]])}
  if(L.type==='asset'&&LIBK[L.key]&&LIBK[L.key].color){fColor(grp('Farbe'),'Farbe',()=>L.color||LIBK[L.key].color,v=>{L.color=v})}
  if(L.type==='figure'){const f=L.fig,fg=grp('Minecraft-Figur'),pg=document.createElement('div');pg.className='posegrid';fg.append(pg);
    const upd=()=>{refitFigure(L);requestRender();renderLayers()};
    for(const[k,[n,p,ry]]of Object.entries(POSES)){const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent=n;b.addEventListener('click',()=>{f.pose=JSON.parse(JSON.stringify(p));f.rootY=ry||0;upd();commit()});pg.append(b)}
    fBtns(fg,[['Im Pose-Studio bearbeiten',()=>editFigureInStudio(L),'primary']]);
    fRange(fg,'Figur drehen',()=>f.ry||0,v=>{f.ry=v;refitFigure(L)},-180,180,1,v=>v+'°');
    const zg=grp('Körperteile: Größe');for(const[k,n]of SIZE_PARTS)fRange(zg,n,()=>(f.size||{})[k]||100,v=>{f.size=cleanSize({...(f.size||{}),[k]:v});refitFigure(L)},30,300,5,v=>Math.round(v)+' %');
    fBtns(zg,[['Normale Größe',()=>{f.size={};upd();commit();buildProps()}]]);
    fSeg(fg,'Arme',[['0','Klassisch'],['1','Schmal']],()=>f.slim?'1':'0',v=>{f.slim=v==='1';refitFigure(L)});
    const items=ST_ITEMS.map(([k,n])=>[k,n]).concat(PACK?Object.keys(PACK.imgs).filter(k=>k.startsWith('i/')).sort().map(k=>['pi_'+k.slice(2),prettyName(k.slice(2))]):[]);
    fSelect(fg,'In der rechten Hand',items,()=>f.item||'',v=>{f.item=v;refitFigure(L)});
    const sr=document.createElement('form');sr.className='btnrow';sr.innerHTML='<input class="num" style="flex:1;width:auto;text-align:left;font-family:inherit" type="text" maxlength="16" placeholder="Anderer Ingame-Name" aria-label="Anderer Ingame-Name"><button class="btn sm" type="submit">Skin wechseln</button>';
    if(f.name)sr.querySelector('input').value=f.name;sr.addEventListener('submit',async e=>{e.preventDefault();const n=sr.querySelector('input').value.trim();if(!n)return;try{const r=await fetchSkinByName(n);skinCanvasCache.set(r.data,r.canvas);f.skin=r.data;f.slim=r.slim;f.name=n;L.name=n;upd();commit();buildProps();toast('Skin gewechselt.')}catch(err){toast(err.message||'Skin nicht gefunden.')}});fg.append(sr)}
  const xg=grp('Transformieren'),xb=document.createElement('div');xg.classList.add('xf-grp');xb.className='xf';xg.append(xb);
  const nf=(lab,title,get,set)=>{const l=document.createElement('label');l.innerHTML='<span></span><input class="num" type="number" inputmode="decimal" step="1">';l.firstChild.textContent=lab;const n=l.querySelector('input');n.setAttribute('aria-label',title);
    const up=()=>{n.value=Math.round(get())};up();n.addEventListener('change',()=>{const v=+n.value;if(isNaN(v)){up();return}set(v);up();requestRender();commit();syncProps()});propSync.push(up);xb.append(l)};
  nf('X','Position X',()=>L.x,v=>{L.x=v;relayoutBuild(L)});nf('Y','Position Y',()=>L.y,v=>{L.y=v;relayoutBuild(L)});
  const setW=v=>{v=Math.max(4,v);if(L.type==='text'){L.size=Math.max(6,L.size*v/L.w);refitText(L)}else if(L.free)L.w=v;else{const r=L.h/L.w;L.w=v;L.h=v*r}relayoutBuild(L)};
  const setH=v=>{v=Math.max(4,v);if(L.type==='text'){L.size=Math.max(6,L.size*v/L.h);refitText(L)}else if(L.free)L.h=v;else{const r=L.w/L.h;L.h=v;L.w=v*r}relayoutBuild(L)};
  nf('B','Breite',()=>L.w,setW);nf('H','Höhe',()=>L.h,setH);nf('∠','Winkel',()=>L.rot||0,v=>{L.rot=((v+180)%360+360)%360-180});
  const g=grp('Darstellung');
  fRange(g,'Deckkraft',()=>L.opacity??1,v=>{L.opacity=v},0,1,.01,pct);
  fRange(g,'Unschärfe',()=>L.blur||0,v=>{L.blur=v},0,40,1,v=>v+' px');
  fRange(g,'Helligkeit',()=>L.shade||0,v=>{L.shade=v},-.8,.8,.05,v=>(v>0?'+':'')+Math.round(v*100)+' %');
  if(L.type!=='text')fCheck(g,'Frei verzerren (ohne Seitenverhältnis)',()=>L.free,v=>{L.free=v});
  if(L.type==='image')fCheck(g,'Pixelig darstellen',()=>L.pixel,v=>{L.pixel=v});
  const e=grp('Effekte');
  fRange(e,'Kontur',()=>L.ol||0,v=>{L.ol=v},0,40,1,v=>v+' px');
  fColor(e,'Konturfarbe',()=>L.olc||'#ffffff',v=>{L.olc=v});
  fRange(e,'Schatten',()=>L.shadow||0,v=>{L.shadow=v},0,80,1,v=>v+' px');
  fRange(e,'Leuchten',()=>L.glow||0,v=>{L.glow=v},0,120,1,v=>v+' px');
  fColor(e,'Leuchtfarbe',()=>L.glc||'#ffd36b',v=>{L.glc=v})}

/* ================= Seitenleiste ================= */
const TABS=[['assets','Elemente',ICON.cube],['text','Text',ICON.text],['backdrop','Hintergrund',ICON.image],['pixel','Pixel-Art',ICON.pixel],['templates','Vorlagen',ICON.tpl],['uploads','Uploads',ICON.upload]];
const narrow=()=>matchMedia('(max-width:1000px)').matches;
function closeSideNarrow(){if(narrow())$('#side').classList.add('closed')}
(function buildRail(){const r=$('#rail');for(const[k,l,ic]of TABS){const b=document.createElement('button');b.type='button';b.dataset.tab=k;b.innerHTML=ic+'<span></span>';b.querySelector('span').textContent=l;b.title=l;b.setAttribute('aria-label',l);
  b.addEventListener('click',()=>{const side=$('#side');if(ED.tab===k&&narrow()&&!side.classList.contains('closed')){side.classList.add('closed');return}ED.tab=k;side.classList.remove('closed');buildSide()});r.append(b)}
  if(narrow())$('#side').classList.add('closed')})();
$('#side-close').addEventListener('click',()=>$('#side').classList.add('closed'));
function buildSide(){const s=$('#side-scroll');s.innerHTML='';const tt=TABS.find(t=>t[0]===ED.tab);$('#side-title').textContent=tt?tt[1]:'';document.querySelectorAll('#rail button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.tab===ED.tab));
  ({assets:panelAssets,text:panelText,backdrop:panelBackdrop,pixel:panelPixel,templates:panelTemplates,uploads:panelUploads})[ED.tab](s)}
function tileFrom(c,label,pixel,fn,two){const b=document.createElement('button');b.type='button';b.className='tile';const ti=document.createElement('span');ti.className='ti';
  const t=mk(two?192:112,two?120:112),x=t.getContext('2d');const sw=c.naturalWidth||c.width,sh=c.naturalHeight||c.height;const s=two?Math.max(t.width/sw,t.height/sh):Math.min(t.width/sw,t.height/sh);x.imageSmoothingEnabled=!pixel;x.imageSmoothingQuality='high';x.drawImage(c,(t.width-sw*s)/2,(t.height-sh*s)/2,sw*s,sh*s);
  if(pixel)t.classList.add('pix');ti.append(t);const sp=document.createElement('span');sp.textContent=label;b.append(ti,sp);b.addEventListener('click',fn);return b}
let PC_CHECK=null;
function packBox(){
  const pb=document.createElement('div');pb.className='packbox';pb.innerHTML='<div class="top"><b>Texturen</b><span></span></div><div class="btnrow"></div><p class="sub" id="pack-status" role="status"></p>';
  pb.querySelector('span').textContent=PACK?PACK.name:'Eigene Grafiken';
  const row=pb.querySelector('.btnrow'),btn=(t,fn,cls)=>{const b=document.createElement('button');b.type='button';b.className='btn sm'+(cls?' '+cls:'');b.textContent=t;b.disabled=PACK_BUSY;b.addEventListener('click',fn);row.append(b);return b};
  const st=pb.querySelector('#pack-status');st.textContent=PACK_STATUS;
  if(window.RK_LOCAL){
    btn(PACK?'Neu von Mojang laden':'Original-Texturen von Mojang laden',loadPackMojang,'primary');
    btn('Eigene .jar oder Texturpaket',()=>$('#f-pack').click());
    if(PACK)btn('Entfernen',removePack,'ghost');
    if(!PC_CHECK)PC_CHECK=pocketcraftTextures().catch(()=>null);
    PC_CHECK.then(t=>{if(t&&!PACK&&pb.isConnected)btn('Aus Pocketcraft übernehmen',loadPackPocketcraft)});
    if(!PACK&&!PACK_STATUS)st.textContent='Lädt die aktuelle Minecraft-Version direkt von Mojang (rund 40 MB, einmalig) und nimmt daraus Blöcke, Gegenstände und Skins. Alles bleibt in diesem Browser.'}
  else{
    btn(PACK?'Anderes Paket laden':'Texturpaket laden',()=>$('#f-pack').click());if(PACK)btn('Entfernen',removePack,'ghost');
    if(!PACK){const ol=document.createElement('ol');ol.className='sub';ol.style.cssText='margin:0;padding-left:18px;display:flex;flex-direction:column;gap:4px';
      ol.innerHTML='<li>Original-Texturen von Mojang holen: <a target="_blank" rel="noopener" href="https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar">Minecraft 26.3 (client.jar, 41,5 MB)</a></li><li>Warten, bis der Download fertig ist.</li><li>Hier auf „Texturpaket laden“ tippen und <b>client.jar</b> wählen.</li>';
      ol.querySelectorAll('a').forEach(a=>{a.style.color='var(--accent)'});pb.append(ol)}}
  return pb}
function panelAssets(s){
  s.append(packBox());
  const inp=document.createElement('input');inp.type='search';inp.className='search-in';inp.placeholder='Alle Elemente durchsuchen';inp.setAttribute('aria-label','Elemente durchsuchen');inp.value=ED.q;s.append(inp);
  const cats=document.createElement('div');cats.className='cats';cats.setAttribute('role','group');cats.setAttribute('aria-label','Kategorie');s.append(cats);
  for(const[k,l]of CATS_A){const b=document.createElement('button');b.type='button';b.textContent=l;b.setAttribute('aria-pressed',ED.cat===k);b.addEventListener('click',()=>{ED.cat=k;ED.q='';ED.showN=90;buildSide()});cats.append(b)}
  const skinBox=document.createElement('div');s.append(skinBox);
  const grid=document.createElement('div');grid.className='agrid';s.append(grid);
  const fill=()=>{grid.innerHTML='';const q=ED.q.trim().toLowerCase();cats.hidden=!!q;skinBox.innerHTML='';if(ED.cat==='mobs'&&!q&&typeof skinAddBlock==='function')skinBox.append(skinAddBlock());
    const usePack=c=>!!PACK&&LIB.some(a=>a.pack&&a.cat===c),ok=a=>!['blocks','items'].includes(a.cat)||!!a.pack===usePack(a.cat);
    const full=(q?LIB.filter(a=>!a.hidden&&ok(a)&&a.name.toLowerCase().includes(q)):LIB.filter(a=>!a.hidden&&a.cat===ED.cat&&ok(a)));const list=full.slice(0,ED.showN);
    if(!list.length){const p=document.createElement('p');p.className='sub';p.style.gridColumn='1/-1';p.textContent=`Nichts gefunden für „${ED.q}“.`;grid.append(p)}
    for(const a of list)grid.append(tileFrom(libCanvas(a.key),a.name,a.pixel,()=>addAsset(a.key)));
    if(full.length>list.length){const mb=document.createElement('button');mb.type='button';mb.className='btn sm';mb.style.gridColumn='1/-1';mb.textContent=`Mehr anzeigen (${full.length-list.length} weitere)`;mb.addEventListener('click',()=>{ED.showN+=90;fill()});grid.append(mb)}
    if(usePack(ED.cat)&&!q){const n=document.createElement('p');n.className='sub';n.style.gridColumn='1/-1';n.textContent=`${full.length} ${ED.cat==='blocks'?'Blöcke':'Gegenstände'} aus ${PACK.name}. Mit der Suche findest du sie schneller (englische Namen, z. B. „oak“, „diamond“).`;grid.prepend(n)}};
  inp.addEventListener('input',()=>{ED.q=inp.value;ED.showN=90;fill()});fill()}
const TEXT_PRESETS=[
  {label:'Überschrift',font:'luckiest',size:150,color:'#ffe14d',color2:'#ff9a1f',grad:true,stroke:12,strokeColor:'#15161b',depth:8,text:'ÜBERSCHRIFT'},
  {label:'Unterzeile',font:'inter',size:60,color:'#ffffff',stroke:8,strokeColor:'#15161b',text:'Unterzeile'},
  {label:'Block',font:'bungee',size:110,color:'#ffffff',stroke:10,strokeColor:'#1f5fd6',depth:6,text:'BLOCK'},
  {label:'Pixel',font:'press',size:64,color:'#ffff55',stroke:7,strokeColor:'#2a2a00',depth:6,text:'PIXEL'},
  {label:'Comic',font:'bangers',size:140,color:'#ff3b3b',stroke:10,strokeColor:'#ffffff',text:'BOOM!'},
  {label:'Weich',font:'lilita',size:120,color:'#7cf0ff',color2:'#2f8cff',grad:true,stroke:10,strokeColor:'#0b1b3a',depth:6,text:'Weich'}];
function panelText(s){const l=document.createElement('p');l.className='lbl';l.textContent='Text hinzufügen';s.append(l);
  const st=document.createElement('div');st.className='stack';s.append(st);
  for(const p of TEXT_PRESETS){const b=document.createElement('button');b.type='button';b.className='txt-preset';const f=FONTS[p.font];
    const d=document.createElement('div');d.textContent=p.text;d.style.cssText=`font-family:${f[1]};font-weight:${f[2]};font-size:${p.font==='press'?18:30}px;line-height:1.1;color:${p.color};-webkit-text-stroke:${p.font==='press'?1:2}px ${p.strokeColor||'transparent'};paint-order:stroke fill;overflow:hidden;white-space:nowrap;text-overflow:ellipsis`;
    if(p.grad){d.style.background=`linear-gradient(${p.color},${p.color2})`;d.style.webkitBackgroundClip='text';d.style.backgroundClip='text';d.style.webkitTextFillColor='transparent'}
    const sm=document.createElement('small');sm.className='sub';sm.textContent=p.label;b.append(d,sm);b.addEventListener('click',()=>addText(p));st.append(b)}
  const n=document.createElement('p');n.className='sub';n.style.marginTop='12px';n.textContent='Text auf der Fläche auswählen, dann rechts unter Eigenschaften ändern.';s.append(n)}
const sceneThumbs=new Map();
function sceneThumb(name,time){const k=name+time;let c=sceneThumbs.get(k);if(!c){c=mk(320,200);drawScene(c,sceneFor(name,31),{time,seed:31,zoom:1.2});sceneThumbs.set(k,c)}return c}
function panelBackdrop(s){
  const h=(t)=>{const l=document.createElement('p');l.className='lbl';l.style.marginTop='16px';l.textContent=t;s.append(l)};
  const l9=document.createElement('p');l9.className='lbl';l9.textContent='Minecraft-Himmel';s.append(l9);
  const g9=document.createElement('div');g9.className='agrid two';s.append(g9);
  for(const[t,n]of[['day','Tag'],['sunset','Abend'],['night','Nacht']]){const c=mk(320,200);drawMcSky(c,t,3);g9.append(tileFrom(c,n,false,()=>setBackdrop({mode:'mcsky',time:t,seed:Math.floor(Math.random()*1e6)}),true))}
  const l0=document.createElement('p');l0.className='lbl';l0.style.marginTop='16px';l0.textContent='Szenen';s.append(l0);
  const g=document.createElement('div');g.className='agrid two';s.append(g);
  for(const[k,n,t]of BG_SCENES)g.append(tileFrom(sceneThumb(k,t),n,false,()=>setBackdrop({mode:'scene',scene:k,time:t==='nether'?'night':t,seed:31,zoom:1.25}),true));
  h('Verläufe');const g2=document.createElement('div');g2.className='agrid';s.append(g2);
  for(const[k,[n,st]]of Object.entries(GRADS)){const c=mk(112,112),x=c.getContext('2d'),gr=x.createLinearGradient(0,0,0,112);st.forEach((v,i)=>gr.addColorStop(i/(st.length-1),v));x.fillStyle=gr;x.fillRect(0,0,112,112);
    const t=tileFrom(c,n,false,()=>setBackdrop({mode:'grad',grad:k}));t.querySelector('canvas').style.cssText='max-width:100%;max-height:100%';g2.append(t)}
  h('Farbe');const row=document.createElement('div');row.className='btnrow';const ci=document.createElement('input');ci.type='color';ci.value=(getBackdrop()||{}).color||'#1b2433';ci.setAttribute('aria-label','Hintergrundfarbe');ci.style.cssText='width:48px;height:34px;border:1px solid var(--line2);border-radius:8px;background:var(--panel2);padding:2px';
  const cb=document.createElement('button');cb.type='button';cb.className='btn sm';cb.textContent='Als Hintergrund';cb.addEventListener('click',()=>setBackdrop({mode:'color',color:ci.value}));row.append(ci,cb);s.append(row);
  h('Eigenes Bild');const ub=document.createElement('button');ub.type='button';ub.className='btn sm';ub.textContent='Bild als Hintergrund hochladen';ub.addEventListener('click',()=>$('#f-backdrop').click());s.append(ub);
  if(getBackdrop()){const rb=document.createElement('button');rb.type='button';rb.className='btn sm danger';rb.style.marginTop='16px';rb.textContent='Hintergrund entfernen';rb.addEventListener('click',()=>{ED.p.layers=ED.p.layers.filter(l=>l.type!=='backdrop');select(null);commit();buildSide()});s.append(rb)}}

/* ---------- Pixel-Art ---------- */
const PX={grid:store.get('rk-pixel',null)||Array(256).fill(null),tool:'pen',color:'#3fd6c6'};
if(!Array.isArray(PX.grid)||PX.grid.length!==256)PX.grid=Array(256).fill(null);
const PAL=['#15161b','#ffffff','#8a8c8e','#4a4f57','#e02f36','#ff9a2a','#ffd23a','#7fd12a','#2fae5b','#3fd6c6','#3c76d6','#7a4fd0','#e05aa8','#866043','#c98a4a','#f0c6a2'];
function pixelCanvas(scale){const c=mk(16*scale,16*scale),x=c.getContext('2d');PX.grid.forEach((v,i)=>{if(v){x.fillStyle=v;x.fillRect(i%16*scale,Math.floor(i/16)*scale,scale,scale)}});return c}
function panelPixel(s){
  const l=document.createElement('p');l.className='lbl';l.textContent='Eigenes Pixel-Bild (16 × 16)';s.append(l);
  const c=mk(320,320);c.className='pixgrid';c.setAttribute('aria-label','Zeichenfläche 16 mal 16 Pixel');s.append(c);
  const x=c.getContext('2d');
  const draw=()=>{x.clearRect(0,0,320,320);PX.grid.forEach((v,i)=>{if(v){x.fillStyle=v;x.fillRect(i%16*20,Math.floor(i/16)*20,20,20)}});x.strokeStyle='rgba(255,255,255,.08)';x.lineWidth=1;for(let i=1;i<16;i++){x.beginPath();x.moveTo(i*20+.5,0);x.lineTo(i*20+.5,320);x.moveTo(0,i*20+.5);x.lineTo(320,i*20+.5);x.stroke()}};draw();
  const cell=e=>{const r=c.getBoundingClientRect();const X=Math.floor((e.clientX-r.left)/r.width*16),Y=Math.floor((e.clientY-r.top)/r.height*16);return X>=0&&Y>=0&&X<16&&Y<16?Y*16+X:-1};
  const flood=(i,to)=>{const from=PX.grid[i];if(from===to)return;const st=[i];while(st.length){const j=st.pop();if(PX.grid[j]!==from)continue;PX.grid[j]=to;const X=j%16,Y=Math.floor(j/16);if(X>0)st.push(j-1);if(X<15)st.push(j+1);if(Y>0)st.push(j-16);if(Y<15)st.push(j+16)}};
  let down=false;const act=e=>{const i=cell(e);if(i<0)return;if(PX.tool==='fill')flood(i,PX.color);else PX.grid[i]=PX.tool==='erase'?null:PX.color;draw()};
  c.addEventListener('pointerdown',e=>{down=true;c.setPointerCapture(e.pointerId);act(e)});c.addEventListener('pointermove',e=>{if(down&&PX.tool!=='fill')act(e)});
  const up=()=>{if(down){down=false;store.set('rk-pixel',PX.grid)}};c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);
  const tools=document.createElement('div');tools.className='seg';tools.style.marginTop='10px';tools.setAttribute('role','group');tools.setAttribute('aria-label','Werkzeug');
  for(const[k,n]of[['pen','Stift'],['erase','Radierer'],['fill','Füllen']]){const b=document.createElement('button');b.type='button';b.textContent=n;b.setAttribute('aria-pressed',PX.tool===k);b.addEventListener('click',()=>{PX.tool=k;tools.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b))});tools.append(b)}s.append(tools);
  const pal=document.createElement('div');pal.className='pal';pal.style.marginTop='10px';
  const setCol=v=>{PX.color=v;pal.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z.dataset.c===v));ci.value=v};
  for(const p of PAL){const b=document.createElement('button');b.type='button';b.dataset.c=p;b.style.background=p;b.setAttribute('aria-label','Farbe '+p);b.addEventListener('click',()=>setCol(p));pal.append(b)}s.append(pal);
  const row=document.createElement('label');row.className='row';row.style.marginTop='10px';row.innerHTML='<span>Eigene Farbe</span>';const ci=document.createElement('input');ci.type='color';ci.addEventListener('input',()=>setCol(ci.value));row.append(ci);s.append(row);setCol(PX.color);
  const br=document.createElement('div');br.className='btnrow';br.style.marginTop='12px';
  const add=document.createElement('button');add.type='button';add.className='btn primary sm';add.textContent='Ins Design einfügen';
  add.addEventListener('click',()=>{if(!PX.grid.some(Boolean)){toast('Zeichne zuerst etwas.');return}const big=pixelCanvas(16);addImageLayer({data:big.toDataURL('image/png')},256,256,'Pixel-Art',{pixel:true})});
  const clr=document.createElement('button');clr.type='button';clr.className='btn sm';clr.textContent='Leeren';clr.addEventListener('click',()=>{PX.grid=Array(256).fill(null);store.set('rk-pixel',PX.grid);draw()});
  br.append(add,clr);s.append(br)}

/* ---------- Vorlagen ---------- */
function tplLayers(t,W,H){
  const m=Math.min(W,H),out=[];
  const bd=o=>out.push({id:'l'+uid(),type:'backdrop',name:'Hintergrund',x:W/2,y:H/2,w:W,h:H,rot:0,opacity:1,locked:true,hidden:false,flip:false,shade:0,ol:0,olc:'#fff',shadow:0,glow:0,glc:'#ffd36b',mode:'scene',scene:'island',time:'sunset',seed:31,zoom:1.3,grad:'sunset',color:'#1b2433',blur:0,dim:0,vig:0,...o});
  const as=(key,o)=>{const a=LIBK[key],c=libCanvas(key,o.color);const s=m*o.s/Math.max(c.width,c.height);out.push({id:'l'+uid(),type:'asset',key,name:a.name,x:W*o.x,y:H*o.y,w:c.width*s,h:c.height*s,rot:o.rot||0,opacity:o.opacity??1,flip:!!o.flip,hidden:false,locked:false,shade:0,ol:o.ol||0,olc:o.olc||'#ffffff',shadow:o.shadow||0,glow:o.glow||0,glc:o.glc||'#ffd36b',free:false,color:o.color||a.color||undefined})};
  const tx=o=>{const L={id:'l'+uid(),type:'text',name:'Text',x:W*o.x,y:H*o.y,rot:o.rot||0,opacity:1,flip:false,hidden:false,locked:false,shade:0,ol:0,olc:'#fff',shadow:o.shadow||0,glow:0,glc:'#ffd36b',free:false,text:o.text,font:o.font||'luckiest',size:o.size*m/720,color:o.color||'#ffffff',color2:o.color2||o.color||'#ffffff',grad:!!o.grad,stroke:(o.stroke??10)*m/720,strokeColor:o.strokeColor||'#15161b',depth:(o.depth||0)*m/720,align:o.align||'center'};refitText(L);out.push(L)};
  t.make({bd,as,tx},W,H);return out}
const TEMPLATES=[
  {name:'Tag 1',make:({bd,as,tx})=>{bd({scene:'island',time:'sunset',seed:31,zoom:1.35,blur:3,dim:.1,vig:.4});as('fx_rays',{x:.74,y:.5,s:1.1,opacity:.5,color:'#ffe9a8'});as('fig_0',{x:.74,y:.6,s:.95,ol:8,shadow:20});
    tx({text:'TAG 1',x:.28,y:.32,size:210,color:'#ffe14d',color2:'#ff9a1f',grad:true,depth:10,rot:-4});tx({text:'Survival auf der Insel',x:.28,y:.6,size:56,font:'inter',stroke:8});as('sh_arrow',{x:.52,y:.8,s:.26,rot:-12});as('it_diamond',{x:.1,y:.82,s:.2,rot:-14,glow:30,glc:'#7ff5ea'})}},
  {name:'Diamanten!',make:({bd,as,tx})=>{bd({scene:'mountains',time:'night',seed:7,zoom:1.4,blur:4,dim:.25,vig:.5});as('fx_rays',{x:.32,y:.5,s:1.2,opacity:.7,color:'#9ff5ea'});as('it_diamond',{x:.32,y:.5,s:.6,rot:-8,glow:60,glc:'#5fe3d6',ol:10});as('fx_sparkle',{x:.32,y:.5,s:.8,color:'#9ff5ea'});
    as('fig_1',{x:.78,y:.6,s:.95,ol:8,shadow:20});tx({text:'ENDLICH\nDIAMANTEN!',x:.36,y:.15,size:110,color:'#ffffff',color2:'#7ff5ea',grad:true,depth:8,rot:-3})}},
  {name:'Mob-Angriff',make:({bd,as,tx})=>{bd({scene:'taiga',time:'night',seed:12,zoom:1.4,blur:3,dim:.2,vig:.55});as('fx_explosion',{x:.5,y:.55,s:.9,opacity:.9});as('mob_zombie',{x:.22,y:.62,s:.85,ol:7,olc:'#ff3b3b',shadow:20});as('fig_2',{x:.8,y:.62,s:.85,ol:7,shadow:20,flip:true});
    as('sh_vs',{x:.5,y:.55,s:.32});tx({text:'NICHT SCHON WIEDER!',x:.5,y:.12,size:96,color:'#ff4d4d',stroke:10,depth:6})}},
  {name:'Traumhaus',make:({bd,as,tx})=>{bd({scene:'house',time:'day',seed:5,zoom:1.15,blur:1,vig:.3});as('fig_3',{x:.17,y:.62,s:.9,ol:8,shadow:20});tx({text:'MEIN\nTRAUMHAUS',x:.7,y:.2,size:120,color:'#ffe14d',color2:'#ffb23a',grad:true,depth:8,rot:3});
    as('sh_curve',{x:.48,y:.7,s:.3,rot:20});as('hud_hotbar',{x:.62,y:.9,s:.6});as('bl_planks',{x:.92,y:.62,s:.2,rot:8,shadow:16})}}];
function panelTemplates(s){const l=document.createElement('p');l.className='lbl';l.textContent='Vorlagen';s.append(l);
  const n=document.createElement('p');n.className='sub';n.style.marginBottom='10px';n.textContent='Ersetzt alle Ebenen. Mit ↶ kommst du zurück.';s.append(n);
  const g=document.createElement('div');g.className='agrid two';s.append(g);
  const W=ED.p.w,H=ED.p.h;
  const deck=typeof isDeck==='function'&&isDeck();if(deck)n.textContent='Ersetzt die aktuelle Folie. Neue Folien fügst du unten mit „+ Folie“ hinzu.';
  for(const t of(deck?SLIDE_TPL:TEMPLATES)){const ls=tplLayers(t,W,H),sc=Math.min(320/W,320/H),c=mk(W*sc,H*sc),x=c.getContext('2d');x.scale(sc,sc);for(const L of ls)drawLayer(x,L,sc,W,H);
    g.append(tileFrom(c,t.name,false,()=>{ED.p.layers=tplLayers(t,W,H);select(null);commit();requestRender();toast(`Vorlage „${t.name}“ eingefügt.`);closeSideNarrow()},true))}}

/* ---------- Uploads ---------- */
function panelUploads(s){
  const b=document.createElement('button');b.type='button';b.className='btn primary';b.style.width='100%';b.textContent='Bild hochladen';b.addEventListener('click',()=>$('#f-image').click());s.append(b);
  const n=document.createElement('p');n.className='sub';n.style.margin='8px 0 14px';n.textContent='Du kannst Bilder auch auf die Fläche ziehen oder mit ⌘V einfügen. Renders aus dem Pose-Studio landen auch hier.';s.append(n);
  if(!UPLOADS.length){const p=document.createElement('p');p.className='sub';p.textContent='Noch keine Uploads.';s.append(p);return}
  const g=document.createElement('div');g.className='agrid two';s.append(g);
  for(const u of UPLOADS){const url=srcUrl(u.asset?{asset:u.asset}:{data:u.data});if(!url)continue;
    const bt=document.createElement('button');bt.type='button';bt.className='tile';bt.innerHTML='<span class="ti"><img alt="" loading="lazy"></span><span></span>';setImgSrc(bt.querySelector('img'),url);bt.querySelector('span:last-child').textContent=(u.kind==='render'?'Render · ':'')+(u.name||'Bild');
    bt.addEventListener('click',async()=>{const e=getImg(url);await e.p;if(!e.ok){toast('Bild konnte nicht geladen werden.');return}addImageLayer(u.asset?{asset:u.asset}:{data:u.data},e.img.naturalWidth,e.img.naturalHeight,u.name,u.kind==='render'?{fitH:.85,x:.72}:{})});g.append(bt)}}
uploadWatchers.push(()=>{if(view==='editor'&&ED.tab==='uploads')buildSide()});
packWatchers.push(()=>{fxCache.clear();if(ED.p){requestRender();renderLayers();if(['assets','templates'].includes(ED.tab))buildSide()}});

/* ================= Bilder laden ================= */
async function prepImageBlob(file){const url=URL.createObjectURL(file);try{const im=await loadImage(url);let w=im.naturalWidth,h=im.naturalHeight,blob=file;
  if(Math.max(w,h)>2400||!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)){const s=Math.min(1,2400/Math.max(w,h)),c=mk(w*s,h*s);c.getContext('2d').drawImage(im,0,0,c.width,c.height);blob=await canvasBlob(c,file.type==='image/jpeg'?'image/jpeg':'image/png',.9);w=c.width;h=c.height}
  return{blob,w,h}}finally{URL.revokeObjectURL(url)}}
async function addImageFiles(files,asBackdrop){for(const f of files){if(!f||!/^image\//.test(f.type||'image/png'))continue;
  try{toast('Bild wird geladen…');const{blob,w,h}=await prepImageBlob(f);const src=await storeImage(blob,(f.name||'Bild').replace(/\.[a-z0-9]+$/i,''),'upload',w,h);
    if(asBackdrop)setBackdrop({mode:'image',src,zoom:1});else addImageLayer(src,w,h,(f.name||'Bild').replace(/\.[a-z0-9]+$/i,''));toast('Bild eingefügt.')}
  catch(e){toast(e&&e.code==='quota_or_state'?'Der Speicher ist voll.':'Das Bild konnte nicht geladen werden.')}}}
$('#f-image').addEventListener('change',e=>{const fs=[...e.target.files];e.target.value='';if(ED.p)addImageFiles(fs)});
$('#f-backdrop').addEventListener('change',e=>{const fs=[...e.target.files];e.target.value='';if(ED.p&&fs[0])addImageFiles([fs[0]],true)});
const sw$=$('#stagewrap');sw$.addEventListener('dragover',e=>{e.preventDefault()});sw$.addEventListener('drop',e=>{e.preventDefault();if(ED.p)addImageFiles([...e.dataTransfer.files])});
document.addEventListener('paste',e=>{if(view!=='editor'||!ED.p)return;if(e.target.closest&&e.target.closest('input,textarea'))return;const fs=[...(e.clipboardData||{}).files||[]].filter(f=>/^image\//.test(f.type));if(fs.length){e.preventDefault();addImageFiles(fs)}});

/* ================= Export ================= */
const expMenu=$('#exportmenu');
function closeExport(){expMenu.hidden=true;$('#ed-export').setAttribute('aria-expanded','false')}
$('#ed-export').addEventListener('click',e=>{e.stopPropagation();expMenu.hidden=!expMenu.hidden;$('#ed-export').setAttribute('aria-expanded',String(!expMenu.hidden))});
document.addEventListener('click',e=>{if(!expMenu.hidden&&!e.target.closest('#exportmenu,#ed-export'))closeExport()});
expMenu.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>exportDesign(b.dataset.exp)));
async function exportDesign(kind){closeExport();if(!ED.p)return;saveNow();
  if(kind==='pptx'){await exportPptx();return}
  if(kind==='json'){toast('Projektdatei wird erstellt…');const data=await projectFile();await saveFile(slug(ED.p.name)+'.json',JSON.stringify(data));return}
  await Promise.all(ED.p.layers.map(L=>{const u=L.type==='image'||L.mode==='image'?srcUrl(L.src):'';const e=u?getImg(u):null;return e?e.p:null}));
  const W=ED.p.w,H=ED.p.h,c=mk(W,H),x=c.getContext('2d');if(kind==='jpg'){x.fillStyle='#000';x.fillRect(0,0,W,H)}
  for(const L of ED.p.layers)drawLayer(x,L,1,W,H);
  const type=kind==='jpg'?'image/jpeg':'image/png';let blob;try{blob=await canvasBlob(c,type,.92)}catch{toast('Export hat nicht geklappt.');return}
  await saveFile(slug(ED.p.name)+(kind==='jpg'?'.jpg':'.png'),blob,DL?null:c.toDataURL(type,.92))}
async function projectFile(){const p=JSON.parse(JSON.stringify(projDoc(ED.p)));delete p.preview;
  for(const L of[p.layers,...(p.slides||[]).map(x=>x.layers)].flat()){if(L&&L.src&&L.src.asset){try{L.src={data:await blobToDataURL(await srcBlob(L.src))}}catch{L.src=null}}}
  return{app:'rendernail',version:1,project:p}}
/* Ebenen aus einer Projektdatei prüfen und eingebettete Bilder wieder speichern */
async function cleanImportLayers(arr){const layers=(Array.isArray(arr)?arr:[]).filter(L=>L&&typeof L==='object'&&['asset','text','image','backdrop','figure'].includes(L.type)).map(L=>({...L,id:'l'+uid()}));
  for(const L of layers){if(L.src){const d=L.src.data;if(typeof d==='string'&&/^data:image\//.test(d)){if(ASSETS){try{L.src=await storeImage(await(await fetch(d)).blob(),L.name||'Bild','upload')}catch{}}}else if(!(L.src.asset&&/^[0-9a-f]{32}$/.test(L.src.asset)))L.src=null}
    if(L.type==='asset'&&!LIBK[L.key])L.hidden=true;if(L.type==='figure'&&L.fig&&typeof L.fig.skin==='string'&&L.fig.skin&&!/^data:image\/png;base64,/.test(L.fig.skin))L.fig.skin=''}
  return layers.filter(L=>L.type!=='image'||L.src)}
async function importProjectFile(file){
  try{const j=JSON.parse(await file.text()),p=j&&j.project;if(!p||!Array.isArray(p.layers)||!(p.w>0)||!(p.h>0))throw new Error('format');
    const o={name:String(p.name||'Importiertes Design').slice(0,80),w:Math.min(4096,p.w|0),h:Math.min(4096,p.h|0)};
    if(Array.isArray(p.slides)&&p.slides.length){const slides=[];for(const sl of p.slides.slice(0,200))slides.push({id:'s'+uid(),layers:await cleanImportLayers(sl&&sl.layers)});
      createAndOpen('slides',{...o,slides});if(typeof deckShow==='function'&&isDeck())deckShow(clamp(p.cur|0,0,slides.length-1));toast(`Präsentation mit ${slides.length} Folien geöffnet.`);return}
    const fmtKey=Object.keys(FORMATS).find(k=>k!=='slides'&&FORMATS[k].w===p.w&&FORMATS[k].h===p.h)||'yt';
    createAndOpen(fmtKey,{...o,layers:await cleanImportLayers(p.layers)});toast('Projekt geöffnet.')}
  catch{toast('Diese Datei ist keine Rendernail-Projektdatei.')}}
$('#f-project').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(f)importProjectFile(f)});

/* Render oder Bild aus anderen Bereichen ins aktuelle Design */
function ensureProject(){if(ED.p)return;const last=[...PROJECTS.values()].sort((a,b)=>String(b.updated).localeCompare(String(a.updated)))[0];if(last)openProject(last);else{const p=newProject('yt');PROJECTS.set(p.id,projDoc(p));openProject(p);persistProject(ED.p)}}
function insertImageIntoDesign(src,w,h,name,o){ensureProject();addImageLayer(src,w,h,name,o);location.hash='editor'}
function useAsBackdrop(o){ensureProject();setBackdrop(o);location.hash='editor'}

/* ================= Tastatur ================= */
document.addEventListener('keydown',e=>{if(view!=='editor'||!ED.p||dlg.open)return;const t=e.target;if(t.closest&&t.closest('input,textarea,select'))return;const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
  if(mod&&k==='z'){e.preventDefault();e.shiftKey?redo():undo();return}
  if(mod&&k==='y'){e.preventDefault();redo();return}
  if(mod&&k==='a'){e.preventDefault();selectAll();return}
  if(mod&&k==='g'){e.preventDefault();e.shiftKey?ungroupSel():groupSel();return}
  const SL=selLayers();if(!SL.length)return;
  if(mod&&k==='d'){e.preventDefault();dup();return}
  if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();del();return}
  if(e.key==='Escape'){if(ED.area){ED.area=null;cv.classList.remove('areamode');buildSelbar();return}select(null);return}
  const st=e.shiftKey?10:1,mv={ArrowLeft:[-st,0],ArrowRight:[st,0],ArrowUp:[0,-st],ArrowDown:[0,st]}[e.key];
  if(mv){const ms=SL.filter(l=>!l.locked&&l.type!=='backdrop');if(ms.length){e.preventDefault();ms.forEach(l=>{l.x+=mv[0];l.y+=mv[1]});requestRender();softCommit()}}});
/* Werkzeug-Schalter in der Zoom-Leiste */
(function(){const ot=$('#opt-tools'),dt=$('#dock-toggle'),mkT=(label,title,get,set)=>{const b=document.createElement('button');b.type='button';b.className='btn ghost sm tool';b.textContent=label;b.title=title;b.setAttribute('aria-pressed',get());b.addEventListener('click',()=>{set(!get());b.setAttribute('aria-pressed',get())});return b};
  ot.insertBefore(mkT('Mehrfach','Mehrere Ebenen antippen oder einen Rahmen ziehen',()=>ED.multi,v=>{ED.multi=v;buildSelbar()}),dt);
  ot.insertBefore(mkT('Einrasten','Blöcke rasten an anderen Blöcken ein',()=>ED.snap,v=>{ED.snap=v}),dt);
  const dock=$('#dock');if(matchMedia('(max-width:760px)').matches)dock.classList.add('closed');dt.addEventListener('click',()=>dock.classList.toggle('closed'))})();

/* ================= Menüleiste ================= */
const hasSel=()=>selLayers().length>0;
function flipSel(){selLayers().filter(l=>l.type!=='backdrop').forEach(l=>{l.flip=!l.flip});commit();requestRender()}
function lockSel(){const ls=selLayers(),all=ls.every(l=>l.locked);ls.forEach(l=>{l.locked=!all});commit();buildSelbar();requestRender()}
function zoomBy(f){const m=metrics();ED.fit=false;ED.z=clamp(m.z*f,.05,4);requestRender()}
function syncToggles(){document.querySelectorAll('#opt-tools [data-t]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t==='multi'?ED.multi:ED.snap))}
const MENUS=[
  ['Datei',[['Neues YouTube-Thumbnail',()=>createAndOpen('yt')],['Neues Short (9:16)',()=>createAndOpen('short')],['Neuer Instagram-Post',()=>createAndOpen('insta')],['Öffnen …',()=>$('#f-project').click(),'⌘O'],null,
    ['Als PNG exportieren …',()=>exportDesign('png'),'⌘E'],['Als JPG exportieren …',()=>exportDesign('jpg')],['Projektdatei speichern …',()=>exportDesign('json')],null,['Zur Startseite',()=>{location.hash='thumbnails'}]]],
  ['Bearbeiten',[['Rückgängig',undo,'⌘Z',()=>ED.hist.length>1],['Wiederholen',redo,'⇧⌘Z',()=>ED.fut.length>0],null,['Kopie erstellen',dup,'⌘D',hasSel],['Löschen',del,'⌫',hasSel],null,['Alles auswählen',selectAll,'⌘A'],['Auswahl aufheben',()=>select(null),'Esc',hasSel]]],
  ['Ebene',[['Gruppieren',groupSel,'⌘G',()=>selLayers().filter(l=>l.type!=='backdrop').length>1],['Gruppierung aufheben',ungroupSel,'⇧⌘G',()=>selLayers().some(l=>l.group)],null,
    ['Nach vorne',()=>moveLayer(1),'⌘]',hasSel],['Nach hinten',()=>moveLayer(-1),'⌘[',hasSel],null,['Horizontal spiegeln',flipSel,'',hasSel],['Sperren / Entsperren',lockSel,'',hasSel],null,
    ['Links ausrichten',()=>alignSel('l'),'',hasSel],['Horizontal zentrieren',()=>alignSel('cx'),'',hasSel],['Rechts ausrichten',()=>alignSel('r'),'',hasSel],['Oben ausrichten',()=>alignSel('t'),'',hasSel],['Vertikal zentrieren',()=>alignSel('cy'),'',hasSel],['Unten ausrichten',()=>alignSel('b'),'',hasSel]]],
  ['Ansicht',[['Einzoomen',()=>zoomBy(1.25),'⌘+'],['Auszoomen',()=>zoomBy(.8),'⌘−'],['An Fenster anpassen',()=>{ED.fit=true;ED.panX=ED.panY=0;requestRender()},'⌘0'],['100 %',()=>{ED.fit=false;ED.z=1;ED.panX=ED.panY=0;requestRender()},'⌘1'],null,
    ['Mehrfach-Auswahl',()=>{ED.multi=!ED.multi;syncToggles();buildSelbar()},'',null,()=>ED.multi],['An Blöcken einrasten',()=>{ED.snap=!ED.snap;syncToggles()},'',null,()=>ED.snap]]]];
let openMenu=null;
function closeMenu(){if(!openMenu)return;openMenu.el.remove();openMenu.btn.setAttribute('aria-expanded','false');openMenu=null}
function showMenu(btn,items){closeMenu();const el=document.createElement('div');el.className='menu';el.setAttribute('role','menu');
  for(const it of items){if(!it){el.append(document.createElement('hr'));continue}const[label,fn,kbd,en,chk]=it;const b=document.createElement('button');b.type='button';b.setAttribute('role',chk?'menuitemcheckbox':'menuitem');
    b.innerHTML='<span></span><kbd></kbd>';b.firstChild.textContent=label;b.lastChild.textContent=kbd||'';if(en&&!en())b.disabled=true;if(chk)b.setAttribute('aria-checked',!!chk());
    b.addEventListener('click',()=>{closeMenu();fn()});el.append(b)}
  document.body.append(el);const r=btn.getBoundingClientRect();el.style.left=Math.min(r.left,innerWidth-el.offsetWidth-6)+'px';el.style.top=r.bottom+2+'px';if(r.bottom+2+el.offsetHeight>innerHeight-6)el.style.top=Math.max(6,r.top-el.offsetHeight-4)+'px';
  btn.setAttribute('aria-expanded','true');openMenu={el,btn};const f=el.querySelector('button:not(:disabled)');if(f)f.focus({preventScroll:true})}
(function(){const box=$('#menus');for(const[name,items]of MENUS){const b=document.createElement('button');b.type='button';b.className='menu-btn';b.textContent=name;b.setAttribute('aria-haspopup','menu');b.setAttribute('aria-expanded','false');
    b.addEventListener('click',e=>{e.stopPropagation();if(openMenu&&openMenu.btn===b)closeMenu();else showMenu(b,items)});
    b.addEventListener('pointerenter',()=>{if(openMenu&&openMenu.btn!==b)showMenu(b,items)});box.append(b)}
  document.addEventListener('pointerdown',e=>{if(openMenu&&!e.target.closest('.menu,.menu-btn'))closeMenu()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu()});
  document.querySelectorAll('#opt-tools .tool').forEach((b,i)=>{b.dataset.t=i===0?'multi':'snap'});
  const f=$('#layer-foot');f.append(iconBtn(ICON.group,'Gruppieren',groupSel),iconBtn(ICON.copy,'Kopie erstellen',dup),iconBtn(ICON.trash,'Löschen',del))})();
document.addEventListener('keydown',e=>{if(view!=='editor'||!ED.p||dlg.open)return;const t=e.target;if(t.closest&&t.closest('input,textarea,select'))return;const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();if(!mod)return;
  if(k==='s'){e.preventDefault();saveNow();toast('Gespeichert.')}else if(k==='o'){e.preventDefault();$('#f-project').click()}else if(k==='e'){e.preventDefault();exportDesign('png')}
  else if(k==='0'){e.preventDefault();ED.fit=true;ED.panX=ED.panY=0;requestRender()}else if(k==='1'){e.preventDefault();ED.fit=false;ED.z=1;requestRender()}
  else if(k==='+'||k==='='){e.preventDefault();zoomBy(1.25)}else if(k==='-'){e.preventDefault();zoomBy(.8)}else if(k===']'){e.preventDefault();moveLayer(1)}else if(k==='['){e.preventDefault();moveLayer(-1)}});

multiTap($('#ed-canvas'),()=>{undo();toast('Rückgängig')},()=>{redo();toast('Wiederholt')});
