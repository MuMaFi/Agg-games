'use strict';
/* ================= Video-Editor =================
   Spuren: eine Hauptspur (Clips stehen lückenlos hintereinander), darüber Overlay-Spuren (Videos, Bilder, Text, Sticker),
   darunter Audiospuren. Zeiten in Sekunden. Ein Clip zeigt den Ausschnitt in…out seiner Quelle, bei Tempo speed.
   Gezeichnet wird alles auf eine Leinwand im Grundformat (z. B. 1080 × 1920); Vorschau und Export nutzen dieselbe Funktion. */
const VE_FMT={'9:16':{n:'Hoch 9:16',d:'TikTok, Shorts, Reels',s:[1080,1920]},'16:9':{n:'Quer 16:9',d:'YouTube',s:[1920,1080]},'1:1':{n:'Quadrat 1:1',d:'Instagram',s:[1080,1080]},'4:5':{n:'Hochformat 4:5',d:'Instagram-Post',s:[1080,1350]}};
const VE_FILTERS=[['none','Original',{}],['vivid','Lebendig',{s:.35,c:.12}],['warm','Warm',{w:.45,s:.08}],['cool','Kühl',{w:-.45}],['bw','Schwarz-Weiß',{s:-1,c:.1}],['retro','Retro',{s:-.35,w:.3,c:-.08,b:.03}],['film','Film',{c:.22,s:-.18,b:-.03}],['night','Nacht',{b:-.12,w:-.3,s:-.2,c:.1}]];
const VE_ANIM=[['none','Keine'],['fade','Einblenden'],['pop','Aufploppen'],['up','Von unten'],['left','Von links'],['type','Schreibmaschine']];
const VE={pid:null,p:null,hist:[],fut:[],sel:null,t:0,playing:false,pxs:60,els:new Map(),imgs:new Map(),urls:new Map(),thumbs:new Map(),peaks:new Map(),abufs:new Map(),busy:false,built:false,running:false,tab:'media'};
const veL=c=>Math.max(.05,(c.out-c.in)/(c.speed||1));
const veIsVis=c=>c.type!=='audio';
const veHasAudio=c=>(c.type==='video'||c.type==='audio')&&!c.mute&&(c.vol??1)>0;
function veBase(){return VE_FMT[VE.p.fmt].s}
/* ---------- Speicher ---------- */
const VE_IDX='ve-index';
function veIndex(){const i=store.get(VE_IDX,null);return Array.isArray(i)?i.filter(x=>x&&x.id):[]}
function veDefault(fmt,name){return{v:1,name:name||'Video',fmt:VE_FMT[fmt]?fmt:'9:16',bg:'blur',bgColor:'#000000',fps:30,q:1,media:[],main:[],over:[],audio:[]}}
function veClean(d){const D=veDefault(d&&d.fmt,d&&d.name);if(!d||typeof d!=='object')return D;const num=(v,a,b,dflt)=>{v=+v;return isFinite(v)?clamp(v,a,b):dflt};
  const clip=c=>{if(!c||!['video','image','audio','text','sticker'].includes(c.type))return null;return{...c,id:String(c.id||'c'+uid()),in:num(c.in,0,1e5,0),out:num(c.out,.05,1e5,3),speed:num(c.speed,.1,8,1),vol:num(c.vol,0,2,1),fin:num(c.fin,0,10,0),fout:num(c.fout,0,10,0),
    start:num(c.start,0,1e5,0),lane:Math.round(num(c.lane,0,20,0)),x:num(c.x,-2,3,.5),y:num(c.y,-2,3,.5),s:num(c.s,.01,20,1),r:num(c.r,-3600,3600,0),o:num(c.o,0,1,1),adj:{b:num((c.adj||{}).b,-1,1,0),c:num((c.adj||{}).c,-1,1,0),s:num((c.adj||{}).s,-1,1,0),w:num((c.adj||{}).w,-1,1,0)}}};
  return{...D,...d,fmt:VE_FMT[d.fmt]?d.fmt:'9:16',bg:['blur','black','color'].includes(d.bg)?d.bg:'blur',fps:[24,30,60].includes(+d.fps)?+d.fps:30,q:d.q?1:0,
    media:(Array.isArray(d.media)?d.media:[]).filter(m=>m&&typeof m.asset==='string'),main:(d.main||[]).map(clip).filter(Boolean),over:(d.over||[]).map(clip).filter(Boolean),audio:(d.audio||[]).map(clip).filter(Boolean)}}
let veSaveT=0;
function veSaveNow(){clearTimeout(veSaveT);if(!VE.pid||!VE.p)return;const ok=store.set('ve:'+VE.pid,VE.p),i=veIndex(),e=i.find(x=>x.id===VE.pid);
  if(e){e.t=Date.now();e.name=VE.p.name;try{e.preview=veThumbShot()}catch{}store.set(VE_IDX,i)}const s=$('#ve-save');if(s)s.textContent=ok?'Gespeichert':'Nicht gespeichert: Speicher voll'}
function veCommit(){const s=JSON.stringify(VE.p);if(VE.hist[VE.hist.length-1]!==s){VE.hist.push(s);if(VE.hist.length>80)VE.hist.shift();VE.fut=[]}clearTimeout(veSaveT);const sv=$('#ve-save');if(sv)sv.textContent='Speichert…';veSaveT=setTimeout(veSaveNow,500);veUndoUI()}
function veUndo(dir){if(dir<0){if(VE.hist.length<2)return;VE.fut.push(VE.hist.pop())}else{if(!VE.fut.length)return;VE.hist.push(VE.fut.pop())}VE.p=veClean(JSON.parse(VE.hist[VE.hist.length-1]));if(VE.sel&&!veFind(VE.sel))VE.sel=null;veAll();clearTimeout(veSaveT);veSaveT=setTimeout(veSaveNow,500)}
function veUndoUI(){const u=$('#ve-undo'),r=$('#ve-redo');if(u)u.disabled=VE.hist.length<2;if(r)r.disabled=!VE.fut.length}
function veNew(fmt,name){veSaveNow();const i=veIndex(),id='ve'+uid();name=(name||'').trim()||('Video '+(i.length+1));i.unshift({id,name,t:Date.now()});store.set(VE_IDX,i);VE.p=veDefault(fmt,name);VE.pid=id;store.set('ve-cur',id);store.set('ve:'+id,VE.p);VE.hist=[JSON.stringify(VE.p)];VE.fut=[];VE.sel=null;VE.t=0;veHome(false);veAll();veFitZoom()}
function veOpen(id){veSaveNow();const d=store.get('ve:'+id,null);if(!d){toast('Das Projekt konnte nicht geladen werden.');return}VE.pid=id;store.set('ve-cur',id);VE.p=veClean(d);VE.hist=[JSON.stringify(VE.p)];VE.fut=[];VE.sel=null;VE.t=0;veAll();veFitZoom();
  for(const m of VE.p.media)vePrepMedia(m)}
function veThumbShot(){const cv=$('#ve-cv');if(!cv||!cv.width)return'';const w=240,h=Math.round(w*cv.height/cv.width),c=mk(w,h);c.getContext('2d').drawImage(cv,0,0,w,h);return c.toDataURL('image/jpeg',.6)}
/* ---------- Medien ---------- */
async function veUrl(asset){if(VE.urls.has(asset))return VE.urls.get(asset);const p=(async()=>{const b=await srcBlob({asset});return URL.createObjectURL(b)})();VE.urls.set(asset,p);p.catch(()=>VE.urls.delete(asset));return p}
function veMedia(asset){return(VE.p.media||[]).find(m=>m.asset===asset)}
function veImg(asset){let e=VE.imgs.get(asset);if(!e){e={img:new Image(),ok:false};VE.imgs.set(asset,e);veUrl(asset).then(u=>{e.img.onload=()=>{e.ok=true;veTimeline();veLib()};e.img.src=u}).catch(()=>{})}return e}
function veHid(){return $('#ve-hid')}
/* Vorschaubilder (Filmstreifen) und Wellenform für die Zeitleiste */
async function vePrepMedia(m){if(m.kind==='image'){veImg(m.asset);return}
  if(m.kind==='video'&&!VE.thumbs.has(m.asset)){VE.thumbs.set(m.asset,[]);try{const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';veHid().append(v);v.src=await veUrl(m.asset);
      await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=no;setTimeout(ok,8000)});const n=clamp(Math.ceil((m.dur||1)/1.5),4,24),out=[],hh=64,ww=Math.max(16,Math.round(hh*(m.w||16)/(m.h||9)));
      for(let i=0;i<n;i++){const t=Math.min((m.dur||1)-.05,((i+.5)/n)*(m.dur||1));await veSeek(v,t);const c=mk(ww,hh);try{c.getContext('2d').drawImage(v,0,0,ww,hh)}catch{}out.push({t,c})}
      VE.thumbs.set(m.asset,out);v.remove();veTimeline();veLib()}catch{}}
  if((m.kind==='audio'||m.kind==='video')&&!VE.peaks.has(m.asset)){VE.peaks.set(m.asset,null);const b=await veAudioBuf(m.asset);if(b){VE.peaks.set(m.asset,anPeaks(b,1600));veTimeline()}}}
function veSeek(v,t){return new Promise(r=>{let done=false;const fin=()=>{if(done)return;done=true;v.removeEventListener('seeked',fin);r()};if(Math.abs(v.currentTime-t)<.0005&&v.readyState>=2)return r();v.addEventListener('seeked',fin);try{v.currentTime=t}catch{fin()}setTimeout(fin,2500)})}
async function veAudioBuf(asset){if(VE.abufs.has(asset))return VE.abufs.get(asset);const p=(async()=>{try{const b=await srcBlob({asset}),ab=await b.arrayBuffer();return await new Promise((ok,no)=>{const r=anACtx().decodeAudioData(ab,ok,no);if(r&&r.then)r.then(ok,no)})}catch{return null}})();VE.abufs.set(asset,p);return p}
function veKind(f){const t=f.type||'',n=(f.name||'').toLowerCase();if(t.startsWith('video/')||/\.(mp4|mov|m4v|webm|mkv)$/.test(n))return'video';if(t.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/.test(n))return'image';if(t.startsWith('audio/')||/\.(mp3|m4a|wav|aac|ogg|flac|opus|aiff?)$/.test(n))return'audio';return null}
function veProbe(url,kind){return new Promise(ok=>{if(kind==='image'){const i=new Image();i.onload=()=>ok({w:i.naturalWidth,h:i.naturalHeight,dur:0});i.onerror=()=>ok(null);i.src=url;return}
  const e=document.createElement(kind==='audio'?'audio':'video');e.preload='metadata';e.muted=true;e.onloadedmetadata=()=>ok({w:e.videoWidth||0,h:e.videoHeight||0,dur:isFinite(e.duration)?e.duration:0});e.onerror=()=>ok(null);e.src=url;setTimeout(()=>ok(null),15000)})}
async function veImport(files,opts={}){if(!ASSETS){toast('Speichern ist in dieser Ansicht nicht möglich.');return}let n=0;
  for(const f of files){const kind=veKind(f);if(!kind){toast((f.name||'Datei')+': Dieses Format kenne ich nicht.');continue}
    const st=$('#ve-save');if(st)st.textContent='Importiere '+(f.name||'Datei')+' …';
    let up;try{up=await ASSETS.upload(f)}catch(e){toast((f.name||'Datei')+(e&&e.code==='too_large'||f.size>20*1048576?': zu groß zum Speichern hier. In der AGG-Games-Fassung gibt es keine Grenze.':': konnte nicht gespeichert werden.'));continue}
    const url=URL.createObjectURL(f);VE.urls.set(up.id,Promise.resolve(url));const meta=await veProbe(url,kind);if(!meta||(kind!=='image'&&!meta.dur)){toast((f.name||'Datei')+': Das kann dein Browser nicht abspielen.');continue}
    const m={asset:up.id,name:String(f.name||opts.name||kind).replace(/\.[a-z0-9]+$/i,'').slice(0,40),kind,...meta};VE.p.media.push(m);vePrepMedia(m);n++;
    if(opts.add!==false){if(kind==='audio')veAddClip(m,'audio');else veAddClip(m,opts.as||'end')}}
  if(n){veCommit();veAll();if(VE.p.main.length&&veDur()>0)veFitZoom()}const st=$('#ve-save');if(st)st.textContent='Gespeichert'}
/* Von außen (z. B. fertige Animation) ins aktuelle oder ein neues Projekt */
async function veAddBlob(blob,name,fmt){location.hash='video';await veStart();if(!VE.p||VE.p.main.length)veNew(fmt||'9:16',name);const f=new File([blob],(name||'Animation')+'.mp4',{type:blob.type||'video/mp4'});await veImport([f],{name})}
/* ---------- Clips ---------- */
function veFind(id){const P=VE.p;for(const k of['main','over','audio']){const c=P[k].find(x=>x.id===id);if(c)return c}return null}
function veListOf(c){const P=VE.p;return P.main.includes(c)?P.main:P.over.includes(c)?P.over:P.audio}
function veLayout(){let s=0;for(const c of VE.p.main){c._s=s;s+=veL(c)}for(const c of VE.p.over)c._s=c.start;for(const c of VE.p.audio)c._s=c.start}
function veDur(){veLayout();let d=0;for(const k of['main','over','audio'])for(const c of VE.p[k])d=Math.max(d,c._s+veL(c));return d}
function veActive(c,t){return t>=c._s-1e-6&&t<c._s+veL(c)-1e-6}
function veSrcT(c,t){return clamp(c.in+(t-c._s)*(c.speed||1),c.in,Math.max(c.in,c.out-.001))}
function veNewClip(m,extra){const base={id:'c'+uid(),type:m.kind,asset:m.asset,name:m.name,in:0,out:m.kind==='image'?3:m.dur,speed:1,vol:1,fin:0,fout:0,start:0,lane:0,x:.5,y:.5,s:1,r:0,o:1,fit:'fit',flip:false,filt:'none',adj:{b:0,c:0,s:0,w:0},ain:'none',aout:'none'};return Object.assign(base,extra||{})}
function veFreeLane(list,c,from){for(let l=from||0;l<30;l++){if(!list.some(x=>x!==c&&x.lane===l&&x.start<c.start+veL(c)-1e-3&&c.start<x.start+veL(x)-1e-3))return l}return 0}
function veAddClip(m,as){const P=VE.p;veLayout();let c;
  if(as==='audio'||m.kind==='audio'){c=veNewClip(m,{type:'audio',start:VE.t});c.lane=veFreeLane(P.audio,c);P.audio.push(c)}
  else if(as==='over'){c=veNewClip(m,{start:VE.t,s:.5});c.lane=veFreeLane(P.over,c);P.over.push(c)}
  else{c=veNewClip(m);const cur=as==='end'?null:P.main.find(x=>veActive(x,VE.t));const i=cur?P.main.indexOf(cur)+1:P.main.length;P.main.splice(i,0,c)}
  VE.sel=c.id;return c}
function veAddText(pr){const P=VE.p;veLayout();const c={id:'c'+uid(),type:'text',name:'Text',in:0,out:3,speed:1,start:VE.t,lane:0,x:.5,y:.3,s:1,r:0,o:1,text:pr.text,font:pr.font,size:pr.size,color:pr.color,color2:pr.color2||pr.color,grad:!!pr.grad,stroke:pr.stroke||0,strokeColor:pr.strokeColor||'#15161b',depth:pr.depth||0,box:false,boxColor:'#000000',ain:'pop',aout:'fade',adj:{b:0,c:0,s:0,w:0}};
  c.lane=veFreeLane(P.over,c);P.over.push(c);VE.sel=c.id;veCommit();veAll()}
function veAddSticker(key){const P=VE.p;veLayout();const c={id:'c'+uid(),type:'sticker',name:(LIBK[key]||{}).name||'Sticker',key,in:0,out:3,speed:1,start:VE.t,lane:0,x:.5,y:.5,s:1,r:0,o:1,ain:'pop',aout:'none',adj:{b:0,c:0,s:0,w:0}};
  c.lane=veFreeLane(P.over,c);P.over.push(c);VE.sel=c.id;veCommit();veAll()}
function veSplit(){const c=veFind(VE.sel)||VE.p.main.find(x=>veActive(x,VE.t));veLayout();if(!c){toast('Stell den Zeitregler auf einen Clip.');return}const t=VE.t;
  if(!(t>c._s+.04&&t<c._s+veL(c)-.04)){toast('Der Zeitregler muss mitten im Clip stehen.');return}
  const cut=c.in+(t-c._s)*c.speed,c2={...JSON.parse(JSON.stringify(c)),id:'c'+uid(),in:cut,fin:0};c.out=cut;c.fout=0;if(c.type==='image'||c.type==='text'||c.type==='sticker'){c2.in=0;c2.out=c2.out-cut;c.out=cut}
  const list=veListOf(c);if(list!==VE.p.main)c2.start=t;list.splice(list.indexOf(c)+1,0,c2);VE.sel=c2.id;veCommit();veAll()}
function veDelete(){const c=veFind(VE.sel);if(!c)return;const list=veListOf(c);list.splice(list.indexOf(c),1);VE.sel=null;veCommit();veAll()}
function veDuplicate(){const c=veFind(VE.sel);if(!c)return;veLayout();const list=veListOf(c),d={...JSON.parse(JSON.stringify(c)),id:'c'+uid()};
  if(list===VE.p.main)list.splice(list.indexOf(c)+1,0,d);else{d.start=c._s+veL(c);d.lane=veFreeLane(list,d,c.lane);list.push(d)}VE.sel=d.id;veCommit();veAll()}
function veDetachAudio(){const c=veFind(VE.sel);if(!c||c.type!=='video')return;veLayout();const a={id:'c'+uid(),type:'audio',asset:c.asset,name:c.name+' (Ton)',in:c.in,out:c.out,speed:c.speed,vol:c.vol||1,fin:c.fin,fout:c.fout,start:c._s,lane:0};
  a.lane=veFreeLane(VE.p.audio,a);VE.p.audio.push(a);c.vol=0;VE.sel=a.id;veCommit();veAll();toast('Ton abgetrennt. Er liegt jetzt auf einer eigenen Audiospur.')}
/* ---------- Zeichnen (Vorschau und Export) ---------- */
let veGL=null;
function veAdjust(src,sw,sh,a){if(!a||(!a.b&&!a.c&&!a.s&&!a.w))return src;
  try{if(!veGL){const c=document.createElement('canvas'),g=c.getContext('webgl',{premultipliedAlpha:false,preserveDrawingBuffer:true});if(!g)return src;
      const sh2=(t,s)=>{const o=g.createShader(t);g.shaderSource(o,s);g.compileShader(o);return o},pr=g.createProgram();
      g.attachShader(pr,sh2(g.VERTEX_SHADER,'attribute vec2 p;varying vec2 u;void main(){u=p*.5+.5;gl_Position=vec4(p,0.,1.);}'));
      g.attachShader(pr,sh2(g.FRAGMENT_SHADER,'precision mediump float;varying vec2 u;uniform sampler2D t;uniform vec4 a;void main(){vec4 c=texture2D(t,u);vec3 r=c.rgb+a.x;r=(r-.5)*(1.+a.y)+.5;float l=dot(r,vec3(.299,.587,.114));r=mix(vec3(l),r,1.+a.z);r+=vec3(a.w*.12,a.w*.02,-a.w*.12);gl_FragColor=vec4(clamp(r,0.,1.),c.a);}'));
      g.linkProgram(pr);g.useProgram(pr);const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),g.STATIC_DRAW);const loc=g.getAttribLocation(pr,'p');g.enableVertexAttribArray(loc);g.vertexAttribPointer(loc,2,g.FLOAT,false,0,0);
      const tx=g.createTexture();g.bindTexture(g.TEXTURE_2D,tx);for(const[k,v]of[[g.TEXTURE_MIN_FILTER,g.LINEAR],[g.TEXTURE_MAG_FILTER,g.LINEAR],[g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE],[g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE]])g.texParameteri(g.TEXTURE_2D,k,v);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);veGL={c,g,ua:g.getUniformLocation(pr,'a')}}
    const{c,g,ua}=veGL,k=Math.min(1,1920/Math.max(sw,sh)),w=Math.max(2,Math.round(sw*k)),h=Math.max(2,Math.round(sh*k));if(c.width!==w||c.height!==h){c.width=w;c.height=h}g.viewport(0,0,w,h);
    g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,src);g.uniform4f(ua,a.b||0,a.c||0,a.s||0,a.w||0);g.drawArrays(g.TRIANGLE_STRIP,0,4);return c}catch{return src}}
function veAdjOf(c){const f=(VE_FILTERS.find(x=>x[0]===c.filt)||VE_FILTERS[0])[2],a=c.adj||{};return{b:(a.b||0)+(f.b||0),c:(a.c||0)+(f.c||0),s:(a.s||0)+(f.s||0),w:(a.w||0)+(f.w||0)}}
/* Quelle und Grundgröße eines sichtbaren Clips (in Einheiten des Grundformats) */
function veSource(c,t,ex,q){const[BW,BH]=veBase();
  if(c.type==='video'){const v=(ex?ex.els:VE.els).get(c.id);if(!v||v.readyState<2||!v.videoWidth)return null;return{src:v,w:v.videoWidth,h:v.videoHeight,fitBox:true}}
  if(c.type==='image'){const e=veImg(c.asset);if(!e.ok)return null;return{src:e.img,w:e.img.naturalWidth,h:e.img.naturalHeight,fitBox:true}}
  if(c.type==='text'){let txt=String(c.text||' ');if(c.ain==='type'){const lt=t-c._s;txt=txt.slice(0,Math.max(0,Math.ceil(txt.length*clamp(lt/Math.min(1.2,veL(c)*.6),0,1))))||' '}
    const L={text:txt,font:c.font,size:Math.round((c.size||100)*q),color:c.color,color2:c.color2,grad:!!c.grad,stroke:Math.round((c.stroke||0)*q),strokeColor:c.strokeColor,depth:Math.round((c.depth||0)*q),align:'center'};
    const cv=textCanvas(L);return{src:cv,w:cv.width/q,h:cv.height/q,box:c.box?c.boxColor||'#000':null}}
  if(c.type==='sticker'){const a=LIBK[c.key];if(!a)return null;const cv=a.bk?blockCanvas(a.bk):libCanvas(c.key,c.color);if(!cv)return null;const w=BW*.3,h=w*cv.height/cv.width;return{src:cv,w,h,pixel:a.pixel}}
  return null}
const veEase=u=>1-Math.pow(1-u,3),veBack=u=>{const s=1.7;u-=1;return u*u*((s+1)*u+s)+1};
function veGeo(c,t,ex,q){const[BW,BH]=veBase(),S=veSource(c,t,ex,q);if(!S)return null;let w=S.w,h=S.h;
  if(S.fitBox){const f=c.fit==='fill'?Math.max(BW/w,BH/h):Math.min(BW/w,BH/h);w*=f;h*=f}
  let sc=c.s,x=c.x*BW,y=c.y*BH,a=c.o??1;const isOver=!VE.p.main.includes(c);
  if(isOver){const lt=t-c._s,L=veL(c),D=.45;for(const[kind,p]of[[c.ain,clamp(lt/D,0,1)],[c.aout,clamp((L-lt)/D,0,1)]]){if(!kind||kind==='none'||kind==='type'||p>=1)continue;const e=veEase(p);
      if(kind==='fade')a*=p;else if(kind==='pop'){sc*=Math.max(0,veBack(p));a*=Math.min(1,p*3)}else if(kind==='up'){y+=(1-e)*BH*.18;a*=p}else if(kind==='left'){x-=(1-e)*BW*.45;a*=p}}}
  return{...S,x,y,w:w*sc,h:h*sc,r:(c.r||0)*Math.PI/180,a}}
function veDrawClip(x,c,t,ex,q){const g=veGeo(c,t,ex,q);if(!g||g.a<=.001||g.w<.5)return;let src=g.src;const adj=veAdjOf(c);
  if(c.type==='video'||c.type==='image')src=veAdjust(src,g.src.videoWidth||g.src.naturalWidth||g.src.width,g.src.videoHeight||g.src.naturalHeight||g.src.height,adj);
  x.save();x.globalAlpha=clamp(g.a,0,1);x.translate(g.x,g.y);x.rotate(g.r);if(c.flip)x.scale(-1,1);x.imageSmoothingEnabled=!g.pixel;x.imageSmoothingQuality='high';
  if(g.box){const p=g.h*.12;x.fillStyle=g.box;x.beginPath();if(x.roundRect)x.roundRect(-g.w/2-p,-g.h/2,g.w+p*2,g.h,g.h*.18);else x.rect(-g.w/2-p,-g.h/2,g.w+p*2,g.h);x.fill()}
  try{x.drawImage(src,-g.w/2,-g.h/2,g.w,g.h)}catch{}x.restore()}
const veBlurC={};
function veDraw(x,TW,TH,t,ex){const P=VE.p,[BW,BH]=veBase(),k=TW/BW,q=Math.max(1,k);veLayout();x.save();x.setTransform(1,0,0,1,0,0);
  x.fillStyle=P.bg==='color'?P.bgColor:'#000';x.fillRect(0,0,TW,TH);x.scale(k,TH/BH);
  const mainC=P.main.find(c=>veActive(c,t));
  if(mainC&&P.bg==='blur'){const g=veGeo(mainC,t,ex,q);if(g){const bw=Math.max(8,Math.round(BW/24)),bh=Math.max(8,Math.round(BH/24)),b=veBlurC.c&&veBlurC.c.width===bw&&veBlurC.c.height===bh?veBlurC.c:(veBlurC.c=mk(bw,bh)),bx=b.getContext('2d');
      const nw=g.src.videoWidth||g.src.naturalWidth||g.src.width,nh=g.src.videoHeight||g.src.naturalHeight||g.src.height,f=Math.max(bw/nw,bh/nh),sw=nw*f,sh=nh*f;bx.clearRect(0,0,bw,bh);try{bx.drawImage(g.src,(bw-sw)/2,(bh-sh)/2,sw,sh)}catch{}
      x.save();x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(b,-BW*.04,-BH*.04,BW*1.08,BH*1.08);x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,0,BW,BH);x.restore()}}
  if(mainC)veDrawClip(x,mainC,t,ex,q);
  for(const c of P.over.slice().sort((a,b)=>a.lane-b.lane))if(veActive(c,t))veDrawClip(x,c,t,ex,q);
  x.restore()}
/* ---------- Vorschau ---------- */
function veEl(c){let e=VE.els.get(c.id);if(e&&e._asset===c.asset)return e;if(e){e.pause();e.remove()}
  e=document.createElement(c.type==='audio'?'audio':'video');e.playsInline=true;e.setAttribute('playsinline','');e.preload='auto';e.preservesPitch=false;e.webkitPreservesPitch=false;e.mozPreservesPitch=false;e._asset=c.asset;veHid().append(e);
  veUrl(c.asset).then(u=>{e.src=u}).catch(()=>{});VE.els.set(c.id,e);return e}
function veFadeK(c,t){const lt=t-c._s,L=veL(c);let k=1;if(c.fin>0)k=Math.min(k,clamp(lt/c.fin,0,1));if(c.fout>0)k=Math.min(k,clamp((L-lt)/c.fout,0,1));return k}
function veSync(){const P=VE.p,live=new Set();veLayout();
  for(const c of[...P.main,...P.over,...P.audio]){if(c.type!=='video'&&c.type!=='audio')continue;live.add(c.id);const e=veEl(c),on=veActive(c,VE.t),st=veSrcT(c,VE.t);
    e.muted=!!c.mute||(c.vol??1)<=0;try{e.volume=clamp((c.vol??1)*veFadeK(c,VE.t),0,1)}catch{}
    if(VE.playing&&on){if(Math.abs(e.playbackRate-c.speed)>.001)e.playbackRate=c.speed;if(e.paused){if(Math.abs(e.currentTime-st)>.05)e.currentTime=st;e.play().catch(()=>{})}else if(Math.abs(e.currentTime-st)>.3)e.currentTime=st}
    else{if(!e.paused)e.pause();if(on&&c.type==='video'&&!e.seeking&&Math.abs(e.currentTime-st)>.02)try{e.currentTime=st}catch{}}}
  for(const[id,e]of VE.els)if(!live.has(id)){e.pause();e.removeAttribute('src');e.remove();VE.els.delete(id)}}
function vePlay(){if(VE.playing){vePause();return}const D=veDur();if(D<.05)return;if(VE.t>=D-.02)VE.t=0;VE.playing=true;VE.t0=VE.t;VE.tw=performance.now();
  /* iPad/Safari: Medien müssen einmal direkt aus dem Tippen heraus starten dürfen */
  for(const e of VE.els.values()){const was=e.muted;e.muted=true;const pr=e.play();if(pr&&pr.then)pr.then(()=>{e.pause();e.muted=was}).catch(()=>{e.muted=was});else{e.pause();e.muted=was}}
  vePlayUI()}
function vePause(){if(!VE.playing)return;VE.playing=false;for(const e of VE.els.values())e.pause();vePlayUI();veProps()}
function vePlayUI(){const b=$('#ve-play');if(b)b.innerHTML=VE.playing?'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>':'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';if(b)b.setAttribute('aria-label',VE.playing?'Anhalten':'Abspielen')}
function veGoto(t){VE.t=clamp(t,0,Math.max(0,veDur()));if(VE.playing){VE.t0=VE.t;VE.tw=performance.now()}vePH()}
function veFmt(t){t=Math.max(0,t);const m=Math.floor(t/60),s=t-m*60;return m+':'+(s<10?'0':'')+s.toFixed(1).replace('.',',')}
function veResize(){const st=$('#ve-stage'),cv=$('#ve-cv');if(!st||!cv||!VE.p)return;const[BW,BH]=veBase(),r=st.getBoundingClientRect(),pad=14,aw=Math.max(40,r.width-pad*2),ah=Math.max(40,r.height-pad*2),s=Math.min(aw/BW,ah/BH),w=Math.round(BW*s),h=Math.round(BH*s);
  cv.style.width=w+'px';cv.style.height=h+'px';const dpr=Math.min(2,window.devicePixelRatio||1),bw=Math.min(BW,Math.round(w*dpr)),bh=Math.round(bw*BH/BW);if(cv.width!==bw||cv.height!==bh){cv.width=bw;cv.height=bh}}
function veLoop(now){if(view!=='video'){VE.running=false;return}requestAnimationFrame(veLoop);if(!VE.p||VE.busy)return;
  if(VE.playing){const D=veDur();VE.t=VE.t0+(now-VE.tw)/1000;if(VE.t>=D){VE.t=D;vePause()}vePH();veFollow()}
  veSync();const cv=$('#ve-cv');if(!cv)return;const x=cv.getContext('2d');veDraw(x,cv.width,cv.height,VE.t,null);if(!VE.playing)veSelBox(x,cv)}
/* Auswahlrahmen im Vorschaubild */
function veSelGeo(c,cv){const[BW]=veBase(),k=cv.width/BW,g=veGeo(c,VE.t,null,Math.max(1,k));if(!g)return null;const r=g.r,co=Math.cos(r),si=Math.sin(r),P=(i,j)=>[(g.x+i*g.w/2*co-j*g.h/2*si)*k,(g.y+i*g.w/2*si+j*g.h/2*co)*cv.height/veBase()[1]];
  const top=P(0,-1),off=(COARSE?40:28)*(cv.width/cv.clientWidth);return{cx:g.x*k,cy:g.y*cv.height/veBase()[1],pts:[P(-1,-1),P(1,-1),P(1,1),P(-1,1)],top,rot:[top[0]+si*off,top[1]-co*off],r}}
function veSelBox(x,cv){const c=veFind(VE.sel);if(!c||!veIsVis(c)||!veActive(c,VE.t))return;const g=veSelGeo(c,cv);if(!g)return;const s=cv.width/cv.clientWidth;
  x.save();x.strokeStyle='#ffffff';x.lineWidth=1.5*s;x.setLineDash([5*s,4*s]);x.beginPath();g.pts.forEach((p,i)=>i?x.lineTo(...p):x.moveTo(...p));x.closePath();x.stroke();x.setLineDash([]);
  x.beginPath();x.moveTo(...g.top);x.lineTo(...g.rot);x.stroke();const R=(COARSE?11:7)*s;x.fillStyle='#fff';x.strokeStyle='#1e1e1e';x.beginPath();x.arc(...g.rot,R,0,7);x.fill();x.stroke();x.fillRect(g.pts[2][0]-R,g.pts[2][1]-R,R*2,R*2);x.strokeRect(g.pts[2][0]-R,g.pts[2][1]-R,R*2,R*2);x.restore()}
function veHitClip(px,py,cv){const P=VE.p;veLayout();const list=[...P.over.filter(c=>veActive(c,VE.t)).sort((a,b)=>b.lane-a.lane),...P.main.filter(c=>veActive(c,VE.t))];
  for(const c of list){const g=veSelGeo(c,cv);if(!g)continue;const dx=px-g.cx,dy=py-g.cy,co=Math.cos(-g.r),si=Math.sin(-g.r),lx=dx*co-dy*si,ly=dx*si+dy*co,hw=Math.hypot(g.pts[1][0]-g.pts[0][0],g.pts[1][1]-g.pts[0][1])/2,hh=Math.hypot(g.pts[3][0]-g.pts[0][0],g.pts[3][1]-g.pts[0][1])/2;
    if(Math.abs(lx)<=hw+6&&Math.abs(ly)<=hh+6)return c}return null}
function veStagePointer(){const cv=$('#ve-cv');let D=null;const pos=e=>{const r=cv.getBoundingClientRect();return[(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};
  cv.addEventListener('pointerdown',e=>{if(VE.busy)return;if(VE.playing)vePause();const[px,py]=pos(e),s=cv.width/cv.clientWidth,R=(COARSE?22:14)*s;let c=veFind(VE.sel),mode=null;
    if(c&&veIsVis(c)&&veActive(c,VE.t)){const g=veSelGeo(c,cv);if(g){if(Math.hypot(px-g.rot[0],py-g.rot[1])<R)mode='rot';else if(Math.hypot(px-g.pts[2][0],py-g.pts[2][1])<R)mode='scale'}}
    if(!mode){const h=veHitClip(px,py,cv);if(!h){if(VE.sel){VE.sel=null;veTimeline();veProps()}return}if(h.id!==VE.sel){VE.sel=h.id;veTimeline();veProps()}c=h;mode='move'}
    e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch{}const g=veSelGeo(c,cv);D={id:e.pointerId,c,mode,x:px,y:py,c0:{x:c.x,y:c.y,s:c.s,r:c.r},g,moved:false}});
  cv.addEventListener('pointermove',e=>{if(!D||e.pointerId!==D.id)return;const[px,py]=pos(e);if(!D.moved&&Math.hypot(px-D.x,py-D.y)<3)return;D.moved=true;const c=D.c,g=D.g;
    if(D.mode==='move'){let nx=D.c0.x+(px-D.x)/cv.width,ny=D.c0.y+(py-D.y)/cv.height;if(Math.abs(nx-.5)*cv.clientWidth<6)nx=.5;if(Math.abs(ny-.5)*cv.clientHeight<6)ny=.5;c.x=Math.round(nx*1000)/1000;c.y=Math.round(ny*1000)/1000}
    else if(D.mode==='scale'){const d0=Math.hypot(D.x-g.cx,D.y-g.cy),d1=Math.hypot(px-g.cx,py-g.cy);c.s=Math.round(clamp(D.c0.s*d1/Math.max(4,d0),.02,20)*1000)/1000}
    else{const a0=Math.atan2(D.y-g.cy,D.x-g.cx),a1=Math.atan2(py-g.cy,px-g.cx);let r=D.c0.r+(a1-a0)*180/Math.PI;if(!e.shiftKey){const sn=Math.round(r/15)*15;if(Math.abs(sn-r)<3)r=sn}c.r=Math.round(r*10)/10}});
  const up=e=>{if(!D||e.pointerId!==D.id)return;const d=D;D=null;if(d.moved){veCommit();veProps()}};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',e=>{const c=veFind(VE.sel);if(!c||!veIsVis(c)||!veActive(c,VE.t))return;e.preventDefault();c.s=clamp(c.s*Math.exp(-e.deltaY*.0015),.02,20);clearTimeout(veWheelT);veWheelT=setTimeout(()=>{veCommit();veProps()},300)},{passive:false})}
let veWheelT=0;
/* ---------- Zeitleiste ---------- */
const VE_PAD=16,VE_ROW={over:34,main:56,audio:34};
function veRows(){const P=VE.p,ov=Math.max(1,...P.over.map(c=>c.lane+2)),au=Math.max(1,...P.audio.map(c=>c.lane+2)),rows=[];
  for(let l=ov-1;l>=0;l--)rows.push({kind:'over',lane:l,h:VE_ROW.over});rows.push({kind:'main',lane:0,h:VE_ROW.main});for(let l=0;l<au;l++)rows.push({kind:'audio',lane:l,h:VE_ROW.audio});
  let y=26;for(const r of rows){r.y=y;y+=r.h+4}return{rows,h:y+6}}
function veFitZoom(){const sc=$('#ve-scroll');if(!sc||!VE.p)return;const D=Math.max(5,veDur());VE.pxs=clamp((sc.clientWidth-VE_PAD*2-30)/D,8,400);const z=$('#ve-zoom');if(z)z.value=Math.log(VE.pxs);veTimeline()}
function veTimeline(){const tin=$('#ve-tin');if(!tin||!VE.p)return;const P=VE.p,D=veDur(),pxs=VE.pxs,{rows,h}=veRows(),sc=$('#ve-scroll');
  const W=Math.max(sc?sc.clientWidth:600,VE_PAD*2+(D+8)*pxs);tin.style.width=W+'px';tin.style.height=h+'px';tin.innerHTML='';
  const ru=document.createElement('div');ru.className='ve-ruler';const step=[.5,1,2,5,10,15,30,60,120].find(s=>s*pxs>=64)||300;for(let s=0;s<=D+8;s+=step){const tk=document.createElement('span');tk.className='ve-tick';tk.style.left=(VE_PAD+s*pxs)+'px';tk.textContent=veFmt(s).replace(/,0$/,'');ru.append(tk)}tin.append(ru);
  for(const r of rows){const bg=document.createElement('div');bg.className='ve-lane '+r.kind;bg.style.top=r.y+'px';bg.style.height=r.h+'px';if(r.kind==='main'&&!P.main.length)bg.textContent='Importiere links ein Video oder Bild. Es landet hier auf der Hauptspur.';tin.append(bg)}
  const rowOf=(kind,lane)=>rows.find(r=>r.kind===kind&&r.lane===lane);
  for(const[kind,list]of[['main',P.main],['over',P.over],['audio',P.audio]])for(const c of list){const r=rowOf(kind,kind==='main'?0:c.lane);if(!r)continue;const L=veL(c),el=document.createElement('div');
    el.className='ve-clip t-'+c.type+(c.id===VE.sel?' sel':'');el.style.left=(VE_PAD+c._s*pxs)+'px';el.style.top=r.y+'px';el.style.width=Math.max(6,L*pxs)+'px';el.style.height=r.h+'px';el.dataset.id=c.id;
    const w=Math.max(6,Math.round(L*pxs));if(c.type==='video'||c.type==='image'||c.type==='audio'){const cv=document.createElement('canvas');cv.className='ve-cth';cv.width=Math.min(4000,w);cv.height=r.h;veDrawStrip(cv,c,pxs);el.append(cv)}
    const lb=document.createElement('span');lb.className='ve-lab';lb.textContent=(c.type==='text'?'T  '+(String(c.text||'').split('\n')[0]):c.type==='sticker'?'★ '+c.name:c.name||'')+(c.speed&&c.speed!==1?'  '+String(c.speed).replace('.',',')+'×':'')+((c.type==='video'||c.type==='audio')&&(c.mute||(c.vol??1)<=0)?'  🔇':'');el.append(lb);
    for(const s of['l','r']){const hd=document.createElement('div');hd.className='ve-h '+s;hd.dataset.h=s;el.append(hd)}tin.append(el)}
  const ph=document.createElement('div');ph.className='ve-ph';ph.id='ve-ph';tin.append(ph);vePH()}
function veDrawStrip(cv,c,pxs){const x=cv.getContext('2d'),w=cv.width,h=cv.height;x.clearRect(0,0,w,h);
  if(c.type==='audio'){const pk=VE.peaks.get(c.asset),m=veMedia(c.asset);if(!pk||!m||!m.dur)return;x.fillStyle='rgba(255,255,255,.55)';const n=pk.length;
    for(let i=0;i<w;i+=2){const st=c.in+(i/pxs)*(c.speed||1);if(st>c.out)break;const v=pk[Math.min(n-1,Math.floor(st/m.dur*n))]*(h-8)*Math.min(1,c.vol??1);x.fillRect(i,(h-v)/2,1.5,Math.max(1,v))}return}
  if(c.type==='image'){const e=veImg(c.asset);if(!e.ok)return;const tw=Math.max(8,h*e.img.naturalWidth/e.img.naturalHeight);for(let i=0;i<w;i+=tw)try{x.drawImage(e.img,i,0,tw,h)}catch{}return}
  const th=VE.thumbs.get(c.asset);if(!th||!th.length)return;const tw=th[0].c.width*h/th[0].c.height;
  for(let i=0;i<w;i+=tw){const st=c.in+((i+tw/2)/pxs)*(c.speed||1);let best=th[0];for(const z of th)if(Math.abs(z.t-st)<Math.abs(best.t-st))best=z;x.drawImage(best.c,i,0,tw,h)}}
function vePH(){const p=$('#ve-ph');if(p)p.style.left=(VE_PAD+VE.t*VE.pxs)+'px';const l=$('#ve-time');if(l)l.textContent=veFmt(VE.t)+' / '+veFmt(veDur())}
function veFollow(){const sc=$('#ve-scroll');if(!sc)return;const x=VE_PAD+VE.t*VE.pxs;if(x>sc.scrollLeft+sc.clientWidth-40||x<sc.scrollLeft)sc.scrollLeft=x-sc.clientWidth*.25}
function veTLPointer(){const sc=$('#ve-scroll');let D=null;
  const tAt=e=>{const r=$('#ve-tin').getBoundingClientRect();return Math.max(0,(e.clientX-r.left-VE_PAD)/VE.pxs)};
  const snapT=(t,self)=>{const P=VE.p,th=8/VE.pxs;let best=t,bd=th;const cand=[0,VE.t];for(const k of['main','over','audio'])for(const c of P[k])if(c!==self){cand.push(c._s,c._s+veL(c))}for(const v of cand)if(Math.abs(v-t)<bd){bd=Math.abs(v-t);best=v}return best};
  sc.addEventListener('pointerdown',e=>{if(VE.busy||!VE.p)return;const clipEl=e.target.closest('.ve-clip'),hd=e.target.closest('.ve-h');if(VE.playing)vePause();
    if(clipEl){const c=veFind(clipEl.dataset.id);if(!c)return;const wasSel=VE.sel===c.id;if(!wasSel){VE.sel=c.id;sc.querySelectorAll('.ve-clip.sel').forEach(x=>x.classList.remove('sel'));clipEl.classList.add('sel');veProps()}
      if(e.pointerType==='touch'&&!wasSel&&!hd){D={id:e.pointerId,tap:true,x:e.clientX,y:e.clientY};return}
      veLayout();D={id:e.pointerId,c,el:clipEl,mode:hd?'trim'+hd.dataset.h:'move',x:e.clientX,y:e.clientY,s0:c._s,in0:c.in,out0:c.out,start0:c.start,lane0:c.lane,moved:false};try{sc.setPointerCapture(e.pointerId)}catch{}e.preventDefault();return}
    if(e.target.closest('.ve-ruler')||e.pointerType!=='touch'){D={id:e.pointerId,seek:true,desel:!e.target.closest('.ve-ruler'),x:e.clientX};try{sc.setPointerCapture(e.pointerId)}catch{}veGoto(tAt(e));return}
    D={id:e.pointerId,tap:true,x:e.clientX,y:e.clientY,seekTap:true}});
  sc.addEventListener('pointermove',e=>{if(!D||e.pointerId!==D.id)return;if(D.tap){if(Math.hypot(e.clientX-D.x,e.clientY-D.y)>8)D=null;return}if(D.seek){veGoto(tAt(e));return}
    const dx=(e.clientX-D.x)/VE.pxs;if(!D.moved&&Math.abs(e.clientX-D.x)<4&&Math.abs(e.clientY-D.y)<4)return;D.moved=true;const c=D.c,list=veListOf(c),sp=c.speed||1,src=veMedia(c.asset),maxOut=(c.type==='video'||c.type==='audio')&&src?src.dur:3600;
    if(D.mode==='trimr'){let end=snapT(D.s0+(D.out0-D.in0)/sp+dx,c);c.out=clamp(D.in0+(end-D.s0)*sp,D.in0+.05*sp,maxOut)}
    else if(D.mode==='triml'){if(c.type==='video'||c.type==='audio'){let ns=snapT(D.s0+dx,c);let nin=clamp(D.in0+(ns-D.s0)*sp,0,D.out0-.05*sp);if(list!==VE.p.main)nin=Math.max(nin,D.in0-D.start0*sp);c.in=nin;if(list!==VE.p.main)c.start=D.start0+(nin-D.in0)/sp}
      else{let ns=snapT(D.s0+dx,c);const d=clamp(ns-D.s0,list===VE.p.main?-1e5:-D.start0,(D.out0-D.in0)/sp-.05);c.out=D.out0-d*sp;if(list!==VE.p.main)c.start=D.start0+d}}
    else if(list!==VE.p.main){c.start=Math.max(0,snapT(D.start0+dx,c));const row=Math.round((e.clientY-D.y)/((list===VE.p.over?VE_ROW.over:VE_ROW.audio)+4));c.lane=clamp(D.lane0+(list===VE.p.over?-row:row),0,19)}
    else{D.el.style.transform=`translateX(${(e.clientX-D.x)}px)`;D.el.style.zIndex=5;return}
    veTimeline();veProps()});
  const up=e=>{if(!D||e.pointerId!==D.id)return;const d=D;D=null;
    if(d.tap){if(d.seekTap){veGoto(tAt(e));if(VE.sel){VE.sel=null;veTimeline();veProps()}}return}if(d.seek){if(d.desel&&Math.abs(e.clientX-d.x)<4&&VE.sel){VE.sel=null;veTimeline();veProps()}return}
    if(!d.moved){veGoto(tAt(e));return}const c=d.c,list=veListOf(c);
    if(d.mode==='move'&&list===VE.p.main){const mid=d.s0+veL(c)/2+(e.clientX-d.x)/VE.pxs,rest=list.filter(x=>x!==c);veLayout();let i=0;for(const x of rest){if(x._s+veL(x)/2<mid)i++}list.splice(list.indexOf(c),1);list.splice(i,0,c)}
    if(list!==VE.p.main){const bad=list.some(x=>x!==c&&x.lane===c.lane&&x.start<c.start+veL(c)-1e-3&&c.start<x.start+veL(x)-1e-3);if(bad)c.lane=veFreeLane(list,c,c.lane)}
    veCommit();veTimeline();veProps()};
  sc.addEventListener('pointerup',up);sc.addEventListener('pointercancel',up);
  sc.addEventListener('wheel',e=>{if(!(e.ctrlKey||e.metaKey))return;e.preventDefault();VE.pxs=clamp(VE.pxs*Math.exp(-e.deltaY*.003),8,400);const z=$('#ve-zoom');if(z)z.value=Math.log(VE.pxs);veTimeline()},{passive:false})}
/* ---------- Mediathek ---------- */
function veLib(){const box=$('#ve-libin');if(!box||!VE.p)return;const sc=box.scrollTop;box.innerHTML='';const tabs=$('#ve-tabs');tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===VE.tab));
  if(VE.tab==='media'){const r=document.createElement('div');r.className='btnrow';const b=document.createElement('button');b.type='button';b.className='btn primary';b.textContent='+ Importieren';b.addEventListener('click',()=>$('#ve-file').click());r.append(b);box.append(r);
    box.append(Object.assign(document.createElement('p'),{className:'sub',textContent:'Videos, Bilder und Ton (MP4, MOV, PNG, JPG, MP3, M4A, WAV …). Antippen fügt sie in die Zeitleiste ein.'}));
    const g=document.createElement('div');g.className='ve-mgrid';for(const m of VE.p.media){const t=document.createElement('div');t.className='ve-mt';const pv=document.createElement('button');pv.type='button';pv.className='ve-mpv';pv.title=m.name;pv.setAttribute('aria-label',m.name+' einfügen');
        const c=mk(160,100),x=c.getContext('2d');x.fillStyle='#1a1a1a';x.fillRect(0,0,160,100);try{if(m.kind==='image'){const e=veImg(m.asset);if(e.ok){const f=Math.max(160/e.img.naturalWidth,100/e.img.naturalHeight);x.drawImage(e.img,(160-e.img.naturalWidth*f)/2,(100-e.img.naturalHeight*f)/2,e.img.naturalWidth*f,e.img.naturalHeight*f)}}
          else if(m.kind==='video'){const th=VE.thumbs.get(m.asset);if(th&&th.length){const z=th[0].c,f=Math.max(160/z.width,100/z.height);x.drawImage(z,(160-z.width*f)/2,(100-z.height*f)/2,z.width*f,z.height*f)}}
          else{x.fillStyle='#3d7a4f';x.fillRect(0,0,160,100);x.fillStyle='#fff';x.font='700 40px Inter,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('♪',80,52)}}catch{}
        pv.append(c);if(m.dur){const d=document.createElement('span');d.className='ve-mdur';d.textContent=veFmt(m.dur);pv.append(d)}
        pv.addEventListener('click',()=>{veAddClip(m,m.kind==='audio'?'audio':'main');veCommit();veAll()});t.append(pv);
        const row=document.createElement('div');row.className='ve-mrow';const nm=document.createElement('span');nm.textContent=m.name;row.append(nm);
        if(m.kind!=='audio'){const ob=document.createElement('button');ob.type='button';ob.className='btn ghost sm';ob.textContent='Overlay';ob.title='Über dem Hauptvideo einfügen';ob.addEventListener('click',()=>{veAddClip(m,'over');veCommit();veAll()});row.append(ob)}t.append(row);g.append(t)}
    box.append(g);
    const ups=(typeof UPLOADS!=='undefined'?UPLOADS:[]).filter(u=>u.asset).slice(0,24);if(ups.length){const h=document.createElement('h4');h.textContent='Aus Rendernail (Renders, Uploads)';h.className='ve-h4';box.append(h);const g2=document.createElement('div');g2.className='ve-mgrid small';
      for(const u of ups){const b=document.createElement('button');b.type='button';b.className='ve-mpv';b.title=u.name||'Bild';const e=getImg(srcUrl(u));const im=document.createElement('img');im.alt='';if(e){e.p.then(()=>{if(e.ok)im.src=e.img.src})}b.append(im);
        b.addEventListener('click',()=>{let m=veMedia(u.asset);if(!m){m={asset:u.asset,name:u.name||'Bild',kind:'image',w:u.w||0,h:u.h||0,dur:0};VE.p.media.push(m);vePrepMedia(m)}veAddClip(m,VE.p.main.length?'over':'main');veCommit();veAll()});g2.append(b)}box.append(g2)}}
  else if(VE.tab==='text'){box.append(Object.assign(document.createElement('p'),{className:'sub',textContent:'Antippen fügt den Text an der Stelle des Zeitreglers ein.'}));
    for(const p of TEXT_PRESETS){const b=document.createElement('button');b.type='button';b.className='txt-preset';const f=FONTS[p.font];const s=document.createElement('span');s.className='tp';s.textContent=p.text;s.style.cssText=`font-family:${f[1]};font-weight:${f[2]};color:${p.color};-webkit-text-stroke:${Math.min(3,(p.stroke||0)/4)}px ${p.strokeColor||'#000'};font-size:24px`;b.append(s);
      b.addEventListener('click',()=>veAddText(p));box.append(b)}}
  else{const q=document.createElement('input');q.type='search';q.placeholder='Sticker suchen';q.className='an-search';q.id='ve-sq';const cats=document.createElement('div');cats.className='seg';const grid=document.createElement('div');grid.className='an-pal';let cat=VE.scat||'items';box.append(q,cats,grid);
    for(const[k,n]of CATS_A){const b=document.createElement('button');b.type='button';b.textContent=n;b.setAttribute('aria-pressed',k===cat);b.addEventListener('click',()=>{cat=VE.scat=k;cats.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b));fill()});cats.append(b)}
    const fill=()=>{grid.innerHTML='';const f=q.value.trim().toLowerCase();for(const a of LIB.filter(a=>!a.hidden&&!a.cover&&(f?a.name.toLowerCase().includes(f):a.cat===cat)).slice(0,72)){const b=document.createElement('button');b.type='button';b.className='an-blk';b.title=a.name;b.setAttribute('aria-label',a.name+' hinzufügen');
        const c=mk(56,56);try{const s=a.bk?blockCanvas(a.bk):libCanvas(a.key),cx=c.getContext('2d'),k=Math.min(52/s.width,52/s.height);cx.imageSmoothingEnabled=!a.pixel;cx.drawImage(s,28-s.width*k/2,28-s.height*k/2,s.width*k,s.height*k)}catch{}b.append(c);b.addEventListener('click',()=>veAddSticker(a.key));grid.append(b)}};
    q.addEventListener('input',fill);fill()}
  box.scrollTop=sc}
/* ---------- Eigenschaften ---------- */
function vSec(P,title,sub){const s=document.createElement('section');s.className='an-sec';if(title){const h=document.createElement('h4');h.textContent=title;s.append(h)}if(sub){const p=document.createElement('p');p.className='sub';p.textContent=sub;s.append(p)}const b=document.createElement('div');b.className='stack';s.append(b);P.append(s);return b}
function vRange(P,label,min,max,step,get,set,fmt=v=>v){const w=document.createElement('div');w.className='field';const id='ve-'+uid();w.innerHTML=`<div class="lab"><label for="${id}"></label><output></output></div><input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;
  w.querySelector('label').textContent=label;const i=w.querySelector('input'),o=w.querySelector('output');i.value=get();o.textContent=fmt(+get());i.addEventListener('input',()=>{set(+i.value);o.textContent=fmt(+i.value);veTimelineSoft()});i.addEventListener('change',veCommit);P.append(w);return w}
function vSeg(P,label,opts,get,set){const w=document.createElement('div');w.className='field';if(label){const l=document.createElement('div');l.className='lab';const s=document.createElement('span');s.textContent=label;l.append(s);w.append(l)}const g=document.createElement('div');g.className='seg';
  for(const[v,l]of opts){const b=document.createElement('button');b.type='button';b.textContent=l;b.setAttribute('aria-pressed',String(get())===String(v));b.addEventListener('click',()=>{set(v);g.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b));veCommit();veTimelineSoft()});g.append(b)}w.append(g);P.append(w);return w}
function vCheck(P,label,get,set){const l=document.createElement('label');l.className='row check';l.innerHTML='<input type="checkbox"><span></span>';l.querySelector('span').textContent=label;const i=l.querySelector('input');i.checked=!!get();i.addEventListener('change',()=>{set(i.checked);veCommit();veTimelineSoft()});P.append(l);return l}
function vSelect(P,label,opts,get,set){const w=document.createElement('div');w.className='field';const id='ve-'+uid();w.innerHTML=`<div class="lab"><label for="${id}"></label></div><select id="${id}"></select>`;w.querySelector('label').textContent=label;const s=w.querySelector('select');for(const[v,l]of opts)s.append(new Option(l,v));s.value=get();s.addEventListener('change',()=>{set(s.value);veCommit();veTimelineSoft()});P.append(w);return w}
function vColor(P,label,get,set){const l=document.createElement('label');l.className='row';l.innerHTML='<span></span><input type="color">';l.querySelector('span').textContent=label;const i=l.querySelector('input');i.value=get();i.addEventListener('input',()=>set(i.value));i.addEventListener('change',veCommit);P.append(l);return l}
function vBtn(P,text,fn,cls='btn sm'){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=text;b.addEventListener('click',fn);P.append(b);return b}
let veTLT=0;function veTimelineSoft(){clearTimeout(veTLT);veTLT=setTimeout(veTimeline,60)}
const VE_SIMPLE={fields:new Set(['Kontrast','Sättigung','Wärme','Helligkeit','Bilder pro Sekunde','Links/rechts','Oben/unten']),secs:new Set(['Anpassen']),head:'h4',sec:'.an-sec'};
function veProps(){const P=$('#ve-props');if(!P||!VE.p)return;const sc=P.scrollTop;P.innerHTML='';const c=veFind(VE.sel),pct=v=>Math.round(v*100)+' %';
  if(!c){let s=vSec(P,'Projekt');vSeg(s,'Format',Object.entries(VE_FMT).map(([k,f])=>[k,f.n]),()=>VE.p.fmt,v=>{VE.p.fmt=v;veResize()});
    vSeg(s,'Hintergrund',[['blur','Unscharf'],['black','Schwarz'],['color','Farbe']],()=>VE.p.bg,v=>{VE.p.bg=v;veProps()});if(VE.p.bg==='color')vColor(s,'Farbe',()=>VE.p.bgColor,v=>{VE.p.bgColor=v});
    s=vSec(P,'Export');vSeg(s,'Qualität',[[0,'Standard (720p)'],[1,'Hoch (1080p)']],()=>VE.p.q,v=>{VE.p.q=+v});vSeg(s,'Bilder pro Sekunde',[[24,'24'],[30,'30'],[60,'60']],()=>VE.p.fps,v=>{VE.p.fps=+v});
    vBtn(s,'Video exportieren',veExport,'btn primary');s.append(Object.assign(document.createElement('p'),{className:'sub',textContent:'Tipp: Clip antippen (unten oder im Bild), um ihn zu bearbeiten. Leertaste spielt ab, S teilt am Zeitregler.'}));
    simplify(P,VE_SIMPLE);P.scrollTop=sc;return}
  const vis=veIsVis(c),isMain=VE.p.main.includes(c);
  let s=vSec(P,{video:'Video',image:'Bild',audio:'Ton',text:'Text',sticker:'Sticker'}[c.type]+' · '+veFmt(veL(c)));{const r=document.createElement('div');r.className='btnrow';vBtn(r,'Teilen',veSplit);vBtn(r,'Duplizieren',veDuplicate);if(c.type==='video')vBtn(r,'Ton abtrennen',veDetachAudio);vBtn(r,'Löschen',veDelete,'btn sm danger');s.append(r)}
  if(c.type==='text'){s=vSec(P,'Text');const ta=document.createElement('textarea');ta.className='an-otext';ta.rows=2;ta.value=c.text||'';ta.setAttribute('aria-label','Text');ta.addEventListener('input',()=>{c.text=ta.value.slice(0,300);veTimelineSoft()});ta.addEventListener('change',veCommit);s.append(ta);
    vSelect(s,'Schrift',Object.entries(FONTS).map(([k,v])=>[k,v[0]]),()=>c.font,v=>{c.font=v});vRange(s,'Schriftgröße',20,400,1,()=>c.size||100,v=>{c.size=v});
    vColor(s,'Farbe',()=>c.color||'#ffffff',v=>{c.color=v;c.color2=v;c.grad=false});vRange(s,'Kontur',0,40,1,()=>c.stroke||0,v=>{c.stroke=v});vColor(s,'Konturfarbe',()=>c.strokeColor||'#000000',v=>{c.strokeColor=v});
    vCheck(s,'Hintergrund-Fläche',()=>c.box,v=>{c.box=v;veProps()});if(c.box)vColor(s,'Flächenfarbe',()=>c.boxColor||'#000000',v=>{c.boxColor=v})}
  if(c.type==='sticker'&&LIBK[c.key]&&LIBK[c.key].color){s=vSec(P,'Farbe');vColor(s,'Farbe',()=>c.color||LIBK[c.key].color,v=>{c.color=v})}
  if(vis){s=vSec(P,'Bild');if(c.type==='video'||c.type==='image')vSeg(s,null,[['fit','Einpassen'],['fill','Füllen']],()=>c.fit||'fit',v=>{c.fit=v});
    vRange(s,'Größe',.05,4,.01,()=>c.s,v=>{c.s=v},pct);vRange(s,'Drehung',-180,180,1,()=>c.r||0,v=>{c.r=v},v=>v+'°');
    vRange(s,'Links/rechts',-50,150,.5,()=>Math.round(c.x*200)/2,v=>{c.x=v/100},v=>Math.round(v)+' %');vRange(s,'Oben/unten',-50,150,.5,()=>Math.round(c.y*200)/2,v=>{c.y=v/100},v=>Math.round(v)+' %');
    vRange(s,'Deckkraft',0,1,.01,()=>c.o??1,v=>{c.o=v},pct);vCheck(s,'Spiegeln',()=>c.flip,v=>{c.flip=v});{const r=document.createElement('div');r.className='btnrow';vBtn(r,'Zurücksetzen',()=>{Object.assign(c,{x:.5,y:isMain||c.type!=='text'?.5:.3,s:isMain?1:c.s,r:0});veCommit();veProps()});s.append(r)}}
  if(c.type==='video'||c.type==='image'){s=vSec(P,'Filter');const g=document.createElement('div');g.className='ve-filters';for(const[k,n]of VE_FILTERS){const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent=n;b.setAttribute('aria-pressed',(c.filt||'none')===k);b.addEventListener('click',()=>{c.filt=k;veCommit();veProps()});g.append(b)}s.append(g);
    s=vSec(P,'Anpassen');c.adj=c.adj||{b:0,c:0,s:0,w:0};const sg=v=>(v>0?'+':'')+Math.round(v*100);vRange(s,'Helligkeit',-.5,.5,.01,()=>c.adj.b,v=>{c.adj.b=v},sg);vRange(s,'Kontrast',-.5,.8,.01,()=>c.adj.c,v=>{c.adj.c=v},sg);vRange(s,'Sättigung',-1,1,.01,()=>c.adj.s,v=>{c.adj.s=v},sg);vRange(s,'Wärme',-1,1,.01,()=>c.adj.w,v=>{c.adj.w=v},sg)}
  if(c.type==='video'||c.type==='audio'){s=vSec(P,'Geschwindigkeit');vSeg(s,null,[[.5,'0,5×'],[1,'1×'],[1.5,'1,5×'],[2,'2×'],[3,'3×']],()=>c.speed,v=>{c.speed=+v;veProps()});vRange(s,'Tempo',.1,8,.05,()=>c.speed,v=>{c.speed=v},v=>String(Math.round(v*100)/100).replace('.',',')+'×');
    s=vSec(P,'Ton');vRange(s,'Lautstärke',0,2,.01,()=>c.vol??1,v=>{c.vol=v},pct);vRange(s,'Einblenden',0,Math.min(10,veL(c)/2),.1,()=>c.fin||0,v=>{c.fin=v},v=>String(Math.round(v*10)/10).replace('.',',')+' s');vRange(s,'Ausblenden',0,Math.min(10,veL(c)/2),.1,()=>c.fout||0,v=>{c.fout=v},v=>String(Math.round(v*10)/10).replace('.',',')+' s')}
  if(c.type==='image'&&isMain){s=vSec(P,'Dauer');vRange(s,'Länge',.2,30,.1,()=>c.out-c.in,v=>{c.out=c.in+v},v=>String(Math.round(v*10)/10).replace('.',',')+' s')}
  if(!isMain&&vis){s=vSec(P,'Animation');vSelect(s,'Rein',VE_ANIM.filter(a=>a[0]!=='type'||c.type==='text'),()=>c.ain||'none',v=>{c.ain=v});vSelect(s,'Raus',VE_ANIM.filter(a=>a[0]!=='type'),()=>c.aout||'none',v=>{c.aout=v})}
  simplify(P,VE_SIMPLE);P.scrollTop=sc}
/* ---------- Export ---------- */
async function veMix(D){const P=VE.p,sr=48000,clips=[...P.main,...P.over,...P.audio].filter(veHasAudio);if(!clips.length)return null;const C=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!C)return null;
  const oc=new C(2,Math.max(1,Math.ceil(D*sr)),sr);let any=false;veLayout();
  for(const c of clips){const b=await veAudioBuf(c.asset);if(!b)continue;any=true;const s=oc.createBufferSource();s.buffer=b;s.playbackRate.value=c.speed||1;const g=oc.createGain(),v=c.vol??1,t0=c._s,L=veL(c);
    g.gain.setValueAtTime(c.fin>0?0:v,t0);if(c.fin>0)g.gain.linearRampToValueAtTime(v,t0+Math.min(c.fin,L));if(c.fout>0){g.gain.setValueAtTime(v,Math.max(t0,t0+L-c.fout));g.gain.linearRampToValueAtTime(0,t0+L)}
    s.connect(g);g.connect(oc.destination);s.start(t0,c.in,Math.max(.01,c.out-c.in))}
  if(!any)return null;return await oc.startRendering()}
function veRecUI(){const ov=$('#ve-ov');ov.hidden=false;ov.innerHTML='<div class="an-reccard"><b>Video wird erstellt</b><div class="an-prog"><i></i></div><p class="sub" id="ve-recst"></p><button class="btn sm" type="button">Abbrechen</button></div>';
  const ui={cancel:false,prog(p,t){ov.querySelector('.an-prog i').style.width=Math.round(p*100)+'%';const s=$('#ve-recst');if(s&&t)s.textContent=t}};ov.querySelector('button').addEventListener('click',()=>{ui.cancel=true});return ui}
async function veExport(){if(VE.busy||!VE.p)return;const P=VE.p,D=veDur();if(D<.05){toast('Füge zuerst ein Video oder Bild hinzu.');return}vePause();
  const[BW,BH]=veBase(),sc=P.q?1:2/3,W=Math.round(BW*sc/2)*2,H=Math.round(BH*sc/2)*2,fps=P.fps||30,cfg=await anCodec(W,H);
  if(!cfg){toast('Dieser Browser kann hier keine Videos erstellen. Nimm ein aktuelles Chrome, Edge oder Safari.');return}
  VE.busy=true;const ui=veRecUI();let err=null,mix=null,acod=null;const els=new Map();
  try{if([...P.main,...P.over,...P.audio].some(veHasAudio)){ui.prog(0,'Ton wird gemischt …');try{mix=await veMix(D)}catch{mix=null}if(mix){acod=await anAudCodec();if(!acod)mix=null}}
    ui.prog(0,'Videos werden geladen …');veLayout();
    for(const c of[...P.main,...P.over])if(c.type==='video'){const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';veHid().append(v);v.src=await veUrl(c.asset);await new Promise(ok=>{v.onloadeddata=ok;v.onerror=ok;setTimeout(ok,10000)});els.set(c.id,v)}
    const muxer=new Mp4Muxer.Muxer({target:new Mp4Muxer.ArrayBufferTarget(),video:{codec:'avc',width:W,height:H,frameRate:fps},...(mix?{audio:{codec:acod.mux,sampleRate:mix.sampleRate,numberOfChannels:2}}:{}),fastStart:'in-memory'});
    const enc=new VideoEncoder({output:(ch,m)=>muxer.addVideoChunk(ch,m),error:e=>{err=e}});enc.configure({...cfg,framerate:fps,latencyMode:'quality'});
    const out=mk(W,H),x=out.getContext('2d'),N=Math.max(1,Math.round(D*fps)),ex={els};
    for(let i=0;i<N;i++){if(ui.cancel||err)break;const t=i/fps;
      for(const c of[...P.main,...P.over])if(c.type==='video'&&veActive(c,t)){const v=els.get(c.id);if(v)await veSeek(v,veSrcT(c,t))}
      veDraw(x,W,H,t,ex);const f=new VideoFrame(out,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});enc.encode(f,{keyFrame:i%(fps*2)===0});f.close();
      {const w0=performance.now();let pushed=false;while(enc.encodeQueueSize>3&&!err&&enc.state!=='closed'){if(performance.now()-w0>1500){if(pushed)throw new Error('encoder_stalled');pushed=true;await Promise.race([enc.flush(),new Promise(r=>setTimeout(r,4000))])}else await new Promise(r=>setTimeout(r,4))}if(err||enc.state==='closed')throw err||new Error('encoder_closed')}
      if(i%3===0){ui.prog(i/N,veFmt(t)+' von '+veFmt(D));await new Promise(r=>setTimeout(r,0))}}
    if(!ui.cancel&&!err){ui.prog(1,'Wird gespeichert …');await Promise.race([enc.flush(),new Promise((_,no)=>setTimeout(()=>no(new Error('flush_timeout')),20000))]);if(err)throw err;if(mix){ui.prog(1,'Ton wird eingefügt …');await anEncodeAudio(muxer,mix,acod.codec)}muxer.finalize()}
    try{enc.close()}catch{}
    if(!ui.cancel&&!err)veDone(new Blob([muxer.target.buffer],{type:'video/mp4'}))}catch(e){err=e}
  for(const v of els.values()){v.removeAttribute('src');v.remove()}VE.busy=false;
  if(ui.cancel){$('#ve-ov').hidden=true;toast('Export abgebrochen.')}else if(err){$('#ve-ov').hidden=true;toast('Das Video konnte nicht erstellt werden. Versuch „Standard“ als Qualität oder ein anderes Video-Format.')}}
function veDone(blob){const ov=$('#ve-ov'),url=URL.createObjectURL(blob);
  ov.innerHTML='<div class="an-reccard an-done"><b>Fertig!</b><div class="btnrow"><button class="btn primary" type="button" data-s>Video speichern</button><button class="btn" type="button" data-c>Schließen</button></div><video controls playsinline loop muted></video></div>';
  const v=ov.querySelector('video'),fit=()=>{const card=ov.querySelector('.an-done');if(!card)return;v.style.maxHeight=Math.max(80,ov.clientHeight-24-(card.offsetHeight-v.offsetHeight))+'px'};requestAnimationFrame(fit);v.addEventListener('loadedmetadata',fit);v.src=url;v.play().catch(()=>{});
  ov.querySelector('[data-s]').addEventListener('click',()=>saveFile((VE.p.name||'video').replace(/[^\w\-äöüÄÖÜß ]+/g,'').trim().replace(/\s+/g,'-')+'.mp4',blob));ov.querySelector('[data-c]').addEventListener('click',()=>{ov.hidden=true;v.pause();URL.revokeObjectURL(url)})}
/* ---------- Projekte ---------- */
function veHome(show=true){const h=$('#ve-homeov');if(!h)return;h.hidden=!show;if(!show)return;vePause();veSaveNow();h.innerHTML='';
  const w=document.createElement('div');w.className='wrap home';w.innerHTML='<h1>Videos</h1><p class="lead">Schneide Videos, Renders und Animationen zusammen. Alles speichert sich automatisch.</p><h2>Neues Video</h2><div class="fmt-grid"></div><h2>Deine Videos <small></small></h2><div class="pgrid"></div>';h.append(w);
  const fg=w.querySelector('.fmt-grid');for(const[k,f]of Object.entries(VE_FMT)){const b=document.createElement('button');b.type='button';b.className='fmt'+(k==='9:16'?' main':'');b.innerHTML='<span class="ic"><i></i></span><span><b></b><span></span></span>';const i=b.querySelector('.ic i'),[a,c]=f.s,m=26/Math.max(a,c);i.style.width=a*m+'px';i.style.height=c*m+'px';
    b.querySelector('b').textContent=f.n;b.querySelector('b+span').textContent=f.d;b.addEventListener('click',()=>{veNew(k);veHome(false)});fg.append(b)}
  const idx=veIndex().sort((a,b)=>b.t-a.t);w.querySelector('h2 small').textContent=idx.length||'';const g=w.querySelector('.pgrid');
  for(const p of idx){const c=document.createElement('div');c.className='pcard';const pv=document.createElement('button');pv.type='button';pv.className='pv';pv.setAttribute('aria-label',p.name+' öffnen');
    if(p.preview&&/^data:image\/jpeg;base64,/.test(p.preview)){const im=document.createElement('img');im.alt='';im.src=p.preview;pv.append(im)}else{const sp=document.createElement('span');sp.className='sub';sp.textContent='Noch keine Vorschau';pv.append(sp)}
    pv.addEventListener('click',()=>{if(p.id!==VE.pid)veOpen(p.id);veHome(false)});const meta=document.createElement('div');meta.className='meta';const t=document.createElement('div');t.style.minWidth='0';const b=document.createElement('b');b.textContent=p.name;const sp=document.createElement('span');sp.textContent='bearbeitet '+rel(new Date(p.t).toISOString());t.append(b,sp);
    const acts=document.createElement('div');acts.className='btnrow';acts.style.flexWrap='nowrap';const de=document.createElement('button');de.type='button';de.className='btn ghost sm danger';de.textContent='Löschen';
    de.addEventListener('click',()=>{if(!confirm(`„${p.name}“ wirklich löschen?`))return;const i=veIndex().filter(x=>x.id!==p.id);try{localStorage.removeItem('ve:'+p.id)}catch{}store.set(VE_IDX,i);if(p.id===VE.pid){VE.pid=null;VE.p=null}toast('Gelöscht.');veHome(true)});
    acts.append(de);meta.append(t,acts);c.append(pv,meta);g.append(c)}}
function veProjMenu(btn){showMenu(btn,[['Alle Videos',()=>veHome(true)],['Umbenennen …',()=>{const n=prompt('Neuer Name:',VE.p.name);if(n===null||!n.trim())return;VE.p.name=n.trim().slice(0,60);veCommit();veSaveNow();veNameUI();toast('Name geändert.')}],null,['Neues Video',()=>veHome(true)]])}
function veNameUI(){const b=$('#ve-name');if(b&&VE.p)b.querySelector('span').textContent=VE.p.name}
/* ---------- Aufbau ---------- */
function veAll(){if(!VE.p)return;veNameUI();veResize();veTimeline();veLib();veProps();veUndoUI();vePH()}
function veBuild(){if(VE.built)return;VE.built=true;const root=$('#v-video');
  root.innerHTML=`<div class="ve"><header class="ve-top"><button class="btn ghost sm" id="ve-libbtn" type="button">Medien</button><button class="ve-name" id="ve-name" type="button" aria-haspopup="menu"><span></span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><span class="hstat" id="ve-save" role="status"></span><span class="grow"></span>
    <button class="btn ghost sm icon" id="ve-undo" type="button" aria-label="Rückgängig" title="Rückgängig (⌘Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button><button class="btn ghost sm icon" id="ve-redo" type="button" aria-label="Wiederholen" title="Wiederholen (⇧⌘Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg></button>
    <button class="btn ghost sm" id="ve-propbtn" type="button">Bearbeiten</button><button class="btn primary" id="ve-export" type="button">Exportieren</button></header>
    <div class="ve-main"><aside class="ve-lib" id="ve-lib"><div class="seg ve-tabs" id="ve-tabs"><button type="button" data-t="media">Medien</button><button type="button" data-t="text">Text</button><button type="button" data-t="sticker">Sticker</button></div><div class="ve-libin" id="ve-libin"></div></aside>
      <div class="ve-stage" id="ve-stage"><canvas id="ve-cv" aria-label="Vorschau"></canvas><div class="an-rec ve-ov" id="ve-ov" hidden></div></div><aside class="ve-props an-side" id="ve-props"></aside></div>
    <div class="ve-tl"><div class="ve-tbar"><button class="btn ghost sm" id="ve-split" type="button" title="Am Zeitregler teilen (S)">Teilen</button><button class="btn ghost sm" id="ve-del" type="button" title="Löschen (Entf)">Löschen</button><span class="grow"></span>
      <button class="btn ghost sm icon" id="ve-start" type="button" aria-label="Zum Anfang"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 5v14"/><path d="M18 6 9 12l9 6z"/></svg></button><button class="an-playbtn ve-playbtn" id="ve-play" type="button" aria-label="Abspielen"></button><span class="ve-time" id="ve-time"></span><span class="grow"></span>
      <label class="ve-zoomlab"><span class="sr">Zoom</span><input type="range" id="ve-zoom" min="2" max="6" step="0.01" aria-label="Zeitleiste zoomen"></label><button class="btn ghost sm" id="ve-fit" type="button">Anpassen</button></div>
      <div class="ve-scroll" id="ve-scroll"><div class="ve-tin" id="ve-tin"></div></div></div>
    <div class="ve-home an-home" id="ve-homeov" hidden></div><div class="ve-hid" id="ve-hid" aria-hidden="true"></div><input type="file" id="ve-file" multiple accept="video/*,image/*,audio/*,.mov,.mp4,.m4a,.mp3,.wav,.flac" hidden></div>`;
  $('#ve-file').addEventListener('change',e=>{const fs=[...e.target.files];e.target.value='';if(fs.length)veImport(fs)});
  $('#ve-tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;VE.tab=b.dataset.t;veLib()});
  $('#ve-undo').addEventListener('click',()=>veUndo(-1));$('#ve-redo').addEventListener('click',()=>veUndo(1));$('#ve-export').addEventListener('click',veExport);
  $('#ve-name').addEventListener('click',e=>{e.stopPropagation();veProjMenu(e.currentTarget)});$('#ve-play').addEventListener('click',vePlay);$('#ve-start').addEventListener('click',()=>{vePause();veGoto(0);$('#ve-scroll').scrollLeft=0});
  $('#ve-split').addEventListener('click',veSplit);$('#ve-del').addEventListener('click',veDelete);$('#ve-fit').addEventListener('click',veFitZoom);
  $('#ve-zoom').addEventListener('input',e=>{VE.pxs=Math.exp(+e.target.value);veTimeline()});
  $('#ve-libbtn').addEventListener('click',()=>{const r=$('#v-video .ve');r.classList.toggle('lib-open');r.classList.remove('props-open')});$('#ve-propbtn').addEventListener('click',()=>{const r=$('#v-video .ve');r.classList.toggle('props-open');r.classList.remove('lib-open')});
  const st=$('#ve-stage');st.addEventListener('dragover',e=>{e.preventDefault()});st.addEventListener('drop',e=>{e.preventDefault();const fs=[...(e.dataTransfer&&e.dataTransfer.files||[])];if(fs.length)veImport(fs)});
  veStagePointer();veTLPointer();vePlayUI();
  if(window.ResizeObserver)new ResizeObserver(()=>{veResize()}).observe(st);addEventListener('resize',()=>{if(view==='video'){veResize();veTimeline()}});
  document.addEventListener('keydown',e=>{if(view!=='video'||!VE.p||VE.busy)return;const t=e.target;if(t.closest&&t.closest('input,textarea,select'))return;const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
    if(e.key===' '){e.preventDefault();vePlay()}else if(mod&&k==='z'){e.preventDefault();veUndo(e.shiftKey?1:-1)}else if(mod&&k==='d'){e.preventDefault();veDuplicate()}else if(mod&&k==='b'||(!mod&&k==='s')){e.preventDefault();veSplit()}
    else if(e.key==='Delete'||e.key==='Backspace'){if(VE.sel){e.preventDefault();veDelete()}}else if(e.key==='ArrowLeft'){e.preventDefault();vePause();veGoto(VE.t-(e.shiftKey?1:1/(VE.p.fps||30)))}else if(e.key==='ArrowRight'){e.preventDefault();vePause();veGoto(VE.t+(e.shiftKey?1:1/(VE.p.fps||30)))}
    else if(e.key==='Escape'){VE.sel=null;veTimeline();veProps()}})}
async function veStart(){veBuild();if(!VE.p){const id=store.get('ve-cur',null);if(id&&store.get('ve:'+id,null))veOpen(id);else if(veIndex().length)veOpen(veIndex()[0].id)}
  if(!VE.running){VE.running=true;requestAnimationFrame(veLoop)}if(!VE.p)veHome(true);else{veAll();requestAnimationFrame(()=>{veResize();veTimeline()})}}
