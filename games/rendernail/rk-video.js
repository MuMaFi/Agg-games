'use strict';
/* ================= Video-Editor =================
   Spuren: eine Hauptspur (Clips stehen lückenlos hintereinander), darüber Overlay-Spuren (Videos, Bilder, Text, Sticker),
   darunter Audiospuren. Zeiten in Sekunden. Ein Clip zeigt den Ausschnitt in…out seiner Quelle, bei Tempo speed.
   Gezeichnet wird alles auf eine Leinwand im Grundformat (z. B. 1080 × 1920); Vorschau und Export nutzen dieselbe Funktion. */
const VE_FMT={'9:16':{n:'Hoch 9:16',d:'TikTok, Shorts, Reels',s:[1080,1920]},'16:9':{n:'Quer 16:9',d:'YouTube',s:[1920,1080]},'1:1':{n:'Quadrat 1:1',d:'Instagram',s:[1080,1080]},'4:5':{n:'Hochformat 4:5',d:'Instagram-Post',s:[1080,1350]}};
const VE_FILTERS=[['none','Original',{}],['vivid','Lebendig',{s:.35,c:.12}],['warm','Warm',{w:.45,s:.08}],['cool','Kühl',{w:-.45}],['bw','Schwarz-Weiß',{s:-1,c:.1}],['retro','Retro',{s:-.35,w:.3,c:-.08,b:.03}],['film','Film',{c:.22,s:-.18,b:-.03}],['night','Nacht',{b:-.12,w:-.3,s:-.2,c:.1}]];
const VE_ANIM=[['none','Keine'],['fade','Einblenden'],['pop','Aufploppen'],['zoom','Reinzoomen'],['up','Von unten'],['top','Von oben'],['left','Von links'],['right','Von rechts'],['spin','Reindrehen'],['type','Schreibmaschine']];
const VE_LOOP=[['none','Keine'],['bounce','Hüpfen'],['shake','Wackeln'],['pulse','Pulsieren'],['float','Schweben'],['wiggle','Zappeln'],['spin','Drehen']];
const VE={pid:null,p:null,hist:[],fut:[],sel:null,t:0,playing:false,pxs:60,els:new Map(),imgs:new Map(),urls:new Map(),thumbs:new Map(),peaks:new Map(),abufs:new Map(),busy:false,built:false,running:false,tab:'media'};
const veL=c=>Math.max(.05,(c.out-c.in)/(c.speed||1));
const veIsVis=c=>c.type!=='audio';
const veHasAudio=c=>(c.type==='video'||c.type==='audio')&&!c.mute&&(c.vol??1)>0;
function veBase(){return VE_FMT[VE.p.fmt].s}
/* ---------- Speicher ---------- */
const VE_IDX='ve-index';
function veIndex(){const i=store.get(VE_IDX,null);return Array.isArray(i)?i.filter(x=>x&&x.id):[]}
function veDefault(fmt,name){return{v:1,name:name||'Video',fmt:VE_FMT[fmt]?fmt:'9:16',bg:'blur',bgColor:'#000000',fps:30,q:1,media:[],main:[],over:[],audio:[],fx:[]}}
function veClean(d){const D=veDefault(d&&d.fmt,d&&d.name);if(!d||typeof d!=='object')return D;const num=(v,a,b,dflt)=>{v=+v;return isFinite(v)?clamp(v,a,b):dflt};
  const clip=c=>{if(!c||!['video','image','audio','text','sticker','char','fx'].includes(c.type))return null;return{...c,keys:(Array.isArray(c.keys)?c.keys:[]).filter(k=>k&&isFinite(+k.t)).map(k=>({t:num(k.t,0,1e5,0),x:num(k.x,-2,3,.5),y:num(k.y,-2,3,.5),s:num(k.s,.01,20,1),r:num(k.r,-3600,3600,0),o:num(k.o,0,1,1)})).sort((a,b)=>a.t-b.t),id:String(c.id||'c'+uid()),in:num(c.in,0,1e5,0),out:num(c.out,.05,1e5,3),speed:num(c.speed,.1,8,1),vol:num(c.vol,0,2,1),fin:num(c.fin,0,10,0),fout:num(c.fout,0,10,0),
    start:num(c.start,0,1e5,0),lane:Math.round(num(c.lane,0,20,0)),x:num(c.x,-2,3,.5),y:num(c.y,-2,3,.5),s:num(c.s,.01,20,1),r:num(c.r,-3600,3600,0),o:num(c.o,0,1,1),adj:{b:num((c.adj||{}).b,-1,1,0),c:num((c.adj||{}).c,-1,1,0),s:num((c.adj||{}).s,-1,1,0),w:num((c.adj||{}).w,-1,1,0)}}};
  return{...D,...d,fmt:VE_FMT[d.fmt]?d.fmt:'9:16',bg:['blur','black','color'].includes(d.bg)?d.bg:'blur',fps:[24,30,60].includes(+d.fps)?+d.fps:30,q:d.q?1:0,
    media:(Array.isArray(d.media)?d.media:[]).filter(m=>m&&typeof m.asset==='string'),main:(d.main||[]).map(clip).filter(Boolean),over:(d.over||[]).map(clip).filter(Boolean),audio:(d.audio||[]).map(clip).filter(Boolean),fx:(d.fx||[]).map(clip).filter(c=>c&&c.type==='fx')}}
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
/* Bilder: sehr große werden fürs Video auf 2560 px verkleinert (spart viel Arbeitsspeicher), GIFs in Einzelbilder zerlegt */
const VE_IMG_MAX=2560;
function veImg(asset){let e=VE.imgs.get(asset);if(e){e.used=performance.now();return e}e={img:null,ok:false,w:0,h:0,sw:0,sh:0,bytes:0,used:performance.now()};VE.imgs.set(asset,e);
  (async()=>{const b=await srcBlob({asset});const head=new Uint8Array(await b.slice(0,6).arrayBuffer());
    if(gifIs(head)){const g=await gifDecode(new Uint8Array(await b.arrayBuffer()));if(g&&g.frames.length>1){if(VE.imgs.get(asset)!==e){gifFree(g);return}e.gif=g;e.img=g.frames[0].c;e.w=g.W;e.h=g.H;e.sw=g.w;e.sh=g.h;e.bytes=g.bytes;e.ok=true;veTimeline();veLib();return}}
    const u=await veUrl(asset),im=new Image();im.decoding='async';await new Promise((ok,no)=>{im.onload=ok;im.onerror=no;im.src=u});let src=im,w=im.naturalWidth,h=im.naturalHeight,sw=w,sh=h;
    if(Math.max(w,h)>VE_IMG_MAX){const k=VE_IMG_MAX/Math.max(w,h);sw=Math.round(w*k);sh=Math.round(h*k);const c=mk(sw,sh),x=c.getContext('2d');x.imageSmoothingQuality='high';x.drawImage(im,0,0,sw,sh);src=c;im.src=''}
    if(VE.imgs.get(asset)!==e)return;Object.assign(e,{img:src,w,h,sw,sh,bytes:sw*sh*4,ok:true});veTimeline();veLib()})().catch(()=>{});return e}
function veHid(){return $('#ve-hid')}
/* Vorschaubilder (Filmstreifen) und Wellenform für die Zeitleiste */
async function vePrepMedia(m){if(m.kind==='image'){veImg(m.asset);return}
  if(m.kind==='video'&&!VE.thumbs.has(m.asset)){VE.thumbs.set(m.asset,[]);try{const v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';veHid().append(v);v.src=await veUrl(m.asset);
      await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=no;setTimeout(ok,8000)});const n=clamp(Math.ceil((m.dur||1)/1.5),4,24),out=[],hh=64,ww=Math.max(16,Math.round(hh*(m.w||16)/(m.h||9)));
      for(let i=0;i<n;i++){const t=Math.min((m.dur||1)-.05,((i+.5)/n)*(m.dur||1));await veSeek(v,t);const c=mk(ww,hh);try{c.getContext('2d').drawImage(v,0,0,ww,hh)}catch{}out.push({t,c})}
      VE.thumbs.set(m.asset,out);v.remove();veTimeline();veLib()}catch{}}
  if((m.kind==='audio'||m.kind==='video')&&!VE.peaks.has(m.asset)){VE.peaks.set(m.asset,null);const b=await veAudioDecode(m.asset,8000);if(b){VE.peaks.set(m.asset,anPeaks(b,1600));veTimeline()}}}
function veSeek(v,t){return new Promise(r=>{let done=false;const fin=()=>{if(done)return;done=true;v.removeEventListener('seeked',fin);r()};if(Math.abs(v.currentTime-t)<.0005&&v.readyState>=2)return r();v.addEventListener('seeked',fin);try{v.currentTime=t}catch{fin()}setTimeout(fin,2500)})}
/* Ton dekodieren: in der gewünschten Abtastrate (weniger Speicher), nur so lange im Speicher wie nötig */
const VE_AUDIO_MAX=1.8e9;
async function veAudioDecode(asset,sr){try{const b=await srcBlob({asset});if(!b||b.size>VE_AUDIO_MAX)return null;const ab=await b.arrayBuffer();const C=window.OfflineAudioContext||window.webkitOfflineAudioContext,ctx=sr&&C?new C(2,1,sr):anACtx();
  return await new Promise((ok,no)=>{const r=ctx.decodeAudioData(ab,ok,no);if(r&&r.then)r.then(ok,no)})}catch{return null}}
async function veAudioBuf(asset,sr){const k=asset+'@'+(sr||48000);if(VE.abufs.has(k))return VE.abufs.get(k);const p=veAudioDecode(asset,sr||48000);VE.abufs.set(k,p);return p}
function veKind(f){const t=f.type||'',n=(f.name||'').toLowerCase();if(t.startsWith('video/')||/\.(mp4|mov|m4v|webm|mkv)$/.test(n))return'video';if(t.startsWith('image/')||/\.(png|jpe?g|webp|gif)$/.test(n))return'image';if(t.startsWith('audio/')||/\.(mp3|m4a|wav|aac|ogg|flac|opus|aiff?)$/.test(n))return'audio';return null}
function veProbe(url,kind){return new Promise(ok=>{if(kind==='image'){const i=new Image();i.onload=()=>ok({w:i.naturalWidth,h:i.naturalHeight,dur:0});i.onerror=()=>ok(null);i.src=url;return}
  const e=document.createElement(kind==='audio'?'audio':'video');e.preload='metadata';e.muted=true;e.onloadedmetadata=()=>ok({w:e.videoWidth||0,h:e.videoHeight||0,dur:isFinite(e.duration)?e.duration:0});e.onerror=()=>ok(null);e.src=url;setTimeout(()=>ok(null),15000)})}
async function veImport(files,opts={}){if(!ASSETS){toast('Speichern ist in dieser Ansicht nicht möglich.');return}let n=0;
  for(const f of files){const kind=veKind(f);if(!kind){toast((f.name||'Datei')+': Dieses Format kenne ich nicht.');continue}
    const st=$('#ve-save');if(st)st.textContent='Importiere '+(f.name||'Datei')+' …';
    let up;try{up=await ASSETS.upload(f)}catch(e){toast((f.name||'Datei')+(e&&e.code==='too_large'||f.size>20*1048576?': zu groß zum Speichern hier. In der AGG-Games-Fassung gibt es keine Grenze.':': konnte nicht gespeichert werden.'));continue}
    const url=URL.createObjectURL(f);VE.urls.set(up.id,Promise.resolve(url));let meta=await veProbe(url,kind);if(kind==='audio'&&(!meta||!meta.dur)){const ab=await veAudioBuf(up.id);if(ab)meta={w:0,h:0,dur:ab.duration}}if(!meta||(kind!=='image'&&!meta.dur)){toast((f.name||'Datei')+': Das kann dein Browser nicht abspielen.');continue}
    const m={asset:up.id,name:String(f.name||opts.name||kind).replace(/\.[a-z0-9]+$/i,'').slice(0,40),kind,...meta};if(kind==='image'){try{const u8=new Uint8Array(await f.slice(0,Math.min(f.size,30e6)).arrayBuffer());if(gifIs(u8)){const G=gifParse(u8);if(G.fr.length>1){m.anim=true;m.gdur=G.fr.reduce((a,x)=>a+(x.delay<=1?10:x.delay)/100,0)}}}catch{}}VE.p.media.push(m);vePrepMedia(m);n++;
    if(opts.add!==false){if(kind==='audio')veAddClip(m,'audio');else veAddClip(m,opts.as||'end')}}
  if(n){if(opts.add!==false&&!opts.keepSel)VE.sel=null;veCommit();veAll();if(VE.p.main.length&&veDur()>0)veFitZoom()}const st=$('#ve-save');if(st)st.textContent='Gespeichert'}
/* Von außen (z. B. fertige Animation) ins aktuelle oder ein neues Projekt */
async function veAddBlob(blob,name,fmt){location.hash='video';await veStart();if(!VE.p||VE.p.main.length)veNew(fmt||'9:16',name);const f=new File([blob],(name||'Animation')+'.mp4',{type:blob.type||'video/mp4'});await veImport([f],{name})}
/* ---------- Clips ---------- */
function veFind(id){const P=VE.p;for(const k of['main','over','audio','fx']){const c=P[k].find(x=>x.id===id);if(c)return c}return null}
function veListOf(c){const P=VE.p;return P.main.includes(c)?P.main:P.over.includes(c)?P.over:P.fx.includes(c)?P.fx:P.audio}
function veLayout(){let s=0;for(const c of VE.p.main){c._s=s;s+=veL(c)}for(const c of VE.p.over)c._s=c.start;for(const c of VE.p.audio)c._s=c.start;for(const c of VE.p.fx)c._s=c.start}
function veDur(){veLayout();let d=0;for(const k of['main','over','audio','fx'])for(const c of VE.p[k])d=Math.max(d,c._s+veL(c));return d}
function veActive(c,t){return t>=c._s-1e-6&&t<c._s+veL(c)-1e-6}
function veSrcT(c,t){return clamp(c.in+(t-c._s)*(c.speed||1),c.in,Math.max(c.in,c.out-.001))}
/* Schlüsselbilder: Lage, Größe, Drehung und Deckkraft ändern sich über die Zeit (Zeiten relativ zum Clip-Anfang) */
const veKV=k=>({x:k.x,y:k.y,s:k.s,r:k.r||0,o:k.o??1});
function veVal(c,t){const K=c.keys;if(!K||!K.length)return veKV(c);const lt=t-c._s;if(lt<=K[0].t)return veKV(K[0]);if(lt>=K[K.length-1].t)return veKV(K[K.length-1]);
  let i=0;while(i<K.length-2&&lt>=K[i+1].t)i++;const a=K[i],b=K[i+1],u=(lt-a.t)/Math.max(1e-6,b.t-a.t),e=u*u*(3-2*u),r={};for(const k of['x','y','s','r','o'])r[k]=a[k]+(b[k]-a[k])*e;return r}
function veKeyAt(c){if(!c.keys||!c.keys.length)return null;veLayout();const lt=VE.t-c._s;return c.keys.find(k=>Math.abs(k.t-lt)<.04)||null}
function veSetVals(c,patch){if(c.keys&&c.keys.length){veLayout();const lt=clamp(VE.t-c._s,0,veL(c));let k=veKeyAt(c);if(!k){k={t:Math.round(lt*100)/100,...veVal(c,VE.t)};c.keys.push(k);c.keys.sort((a,b)=>a.t-b.t)}Object.assign(k,patch)}else Object.assign(c,patch)}
function veAddKey(c){veLayout();const lt=clamp(VE.t-c._s,0,veL(c));c.keys=c.keys||[];if(!c.keys.length)c.keys.push({t:0,x:c.x,y:c.y,s:c.s,r:c.r||0,o:c.o??1});if(!veKeyAt(c)){c.keys.push({t:Math.round(lt*100)/100,...veVal(c,VE.t)});c.keys.sort((a,b)=>a.t-b.t)}veCommit();veAll()}
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
  const cut=c.in+(t-c._s)*c.speed,c2={...JSON.parse(JSON.stringify(c)),id:'c'+uid(),in:cut,fin:0};c.out=cut;c.fout=0;if(['image','text','sticker','char','fx'].includes(c.type)){c2.in=0;c2.out=c2.out-cut;c.out=cut}
  if(c.keys&&c.keys.length){const lc=t-c._s;c2.keys=c.keys.map(k=>({...k,t:Math.round((k.t-lc)*100)/100}))}const list=veListOf(c);if(list!==VE.p.main)c2.start=t;list.splice(list.indexOf(c)+1,0,c2);VE.sel=c2.id;veCommit();veAll()}
function veDelete(){const c=veFind(VE.sel);if(!c)return;const list=veListOf(c);list.splice(list.indexOf(c),1);VE.sel=null;veCommit();veAll()}
function veDuplicate(){const c=veFind(VE.sel);if(!c)return;veLayout();const list=veListOf(c),d={...JSON.parse(JSON.stringify(c)),id:'c'+uid()};
  if(list===VE.p.main)list.splice(list.indexOf(c)+1,0,d);else{d.start=c._s+veL(c);d.lane=veFreeLane(list,d,c.lane);list.push(d)}VE.sel=d.id;veCommit();veAll()}
function veDetachAudio(){const c=veFind(VE.sel);if(!c||c.type!=='video')return;veLayout();const a={id:'c'+uid(),type:'audio',asset:c.asset,name:c.name+' (Ton)',in:c.in,out:c.out,speed:c.speed,vol:c.vol||1,fin:c.fin,fout:c.fout,start:c._s,lane:0};
  a.lane=veFreeLane(VE.p.audio,a);VE.p.audio.push(a);c.vol=0;VE.sel=a.id;veCommit();veAll();toast('Ton abgetrennt. Er liegt jetzt auf einer eigenen Audiospur.')}
/* ---------- Zeichnen (Vorschau und Export) ---------- */
/* WebGL-Helfer: Clip-Shader (Farbe anpassen + Greenscreen) und Bild-Effekte (Glitch, VHS) */
let veGLX=null;
const VE_SH={clip:'precision mediump float;varying vec2 u;uniform sampler2D t;uniform vec4 a;uniform vec3 kc;uniform vec3 kp;vec2 cv(vec3 c){return vec2(-.169*c.r-.331*c.g+.5*c.b,.5*c.r-.419*c.g-.081*c.b);}void main(){vec4 c=texture2D(t,u);float al=c.a;if(kp.z>.5){float d=distance(cv(c.rgb),cv(kc));float m=smoothstep(kp.x,kp.x+kp.y,d);al*=m;float l=dot(c.rgb,vec3(.299,.587,.114));c.rgb=mix(vec3(l),c.rgb,.35+.65*m);}vec3 r=c.rgb+a.x;r=(r-.5)*(1.+a.y)+.5;float l2=dot(r,vec3(.299,.587,.114));r=mix(vec3(l2),r,1.+a.z);r+=vec3(a.w*.12,a.w*.02,-a.w*.12);gl_FragColor=vec4(clamp(r,0.,1.),al);}',
  fx:'precision mediump float;varying vec2 u;uniform sampler2D t;uniform vec4 f;float rn(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}void main(){vec2 p=u;float o=0.;if(f.x<1.5){float st=floor(f.z*12.);float j=rn(vec2(floor(p.y*28.),st));if(j>.82)p.x+=(rn(vec2(st,floor(p.y*28.)))-.5)*.08*f.y;o=f.y*.012*(.4+rn(vec2(st,1.))*1.6);}else{p.x+=(sin(p.y*240.+f.z*9.)*.0015+(rn(vec2(floor(p.y*90.),floor(f.z*20.)))>.985?.012:0.))*f.y;o=f.y*.004;}vec4 c=vec4(texture2D(t,p+vec2(o,0.)).r,texture2D(t,p).g,texture2D(t,p-vec2(o,0.)).b,1.);if(f.x>1.5){c.rgb*=.86+.14*sin(p.y*f.w*3.14159);c.rgb+=(rn(p*f.z+f.z)-.5)*.1*f.y;c.rgb=mix(c.rgb,vec3(dot(c.rgb,vec3(.3,.59,.11)))*vec3(1.05,1.,.92),.25*f.y);}gl_FragColor=c;}'};
function veGLInit(){if(veGLX!==null)return veGLX;try{const c=document.createElement('canvas'),g=c.getContext('webgl',{premultipliedAlpha:false,preserveDrawingBuffer:true});if(!g){veGLX=false;return false}
    const b=g.createBuffer();g.bindBuffer(g.ARRAY_BUFFER,b);g.bufferData(g.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),g.STATIC_DRAW);
    const tx=g.createTexture();g.bindTexture(g.TEXTURE_2D,tx);for(const[k,v]of[[g.TEXTURE_MIN_FILTER,g.LINEAR],[g.TEXTURE_MAG_FILTER,g.LINEAR],[g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE],[g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE]])g.texParameteri(g.TEXTURE_2D,k,v);
    g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);veGLX={c,g,progs:{}}}catch{veGLX=false}return veGLX}
function veGLRun(src,sw,sh,name,setU){const X=veGLInit();if(!X)return null;try{const{c,g}=X;let P=X.progs[name];
    if(!P){const mk2=(t,code)=>{const o=g.createShader(t);g.shaderSource(o,code);g.compileShader(o);return o},pr=g.createProgram();g.attachShader(pr,mk2(g.VERTEX_SHADER,'attribute vec2 p;varying vec2 u;void main(){u=p*.5+.5;gl_Position=vec4(p,0.,1.);}'));g.attachShader(pr,mk2(g.FRAGMENT_SHADER,VE_SH[name]));g.linkProgram(pr);
      if(!g.getProgramParameter(pr,g.LINK_STATUS))return null;P=X.progs[name]={pr,loc:g.getAttribLocation(pr,'p'),u:{}}}
    g.useProgram(P.pr);g.enableVertexAttribArray(P.loc);g.vertexAttribPointer(P.loc,2,g.FLOAT,false,0,0);
    const k=Math.min(1,1920/Math.max(sw,sh)),w=Math.max(2,Math.round(sw*k)),h=Math.max(2,Math.round(sh*k));if(c.width!==w||c.height!==h){c.width=w;c.height=h}g.viewport(0,0,w,h);
    g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,src);const U=n=>P.u[n]||(P.u[n]=g.getUniformLocation(P.pr,n));setU(g,U);g.drawArrays(g.TRIANGLE_STRIP,0,4);return c}catch{return null}}
const veHex=h=>{const n=parseInt(String(h||'#00ff00').slice(1),16);return[(n>>16&255)/255,(n>>8&255)/255,(n&255)/255]};
function veClipGL(src,sw,sh,c){const a=veAdjOf(c),k=c.key||{};const keyOn=!!k.on;if(!keyOn&&!a.b&&!a.c&&!a.s&&!a.w)return src;
  return veGLRun(src,sw,sh,'clip',(g,U)=>{g.uniform4f(U('a'),a.b||0,a.c||0,a.s||0,a.w||0);const kc=veHex(k.color);g.uniform3f(U('kc'),kc[0],kc[1],kc[2]);g.uniform3f(U('kp'),k.sim??.12,k.smooth??.08,keyOn?1:0)})||src}
function veAdjOf(c){const f=(VE_FILTERS.find(x=>x[0]===c.filt)||VE_FILTERS[0])[2],a=c.adj||{};return{b:(a.b||0)+(f.b||0),c:(a.c||0)+(f.c||0),s:(a.s||0)+(f.s||0),w:(a.w||0)+(f.w||0)}}
/* Quelle und Grundgröße eines sichtbaren Clips (in Einheiten des Grundformats) */
function veSource(c,t,ex,q,dims){const[BW,BH]=veBase();
  const cr=c.crop||{},cx=clamp(1-(cr.l||0)-(cr.r||0),.05,1),cy=clamp(1-(cr.t||0)-(cr.b||0),.05,1);
  if(c.type==='video'){const v=(ex?ex.els:VE.els).get(c.id);if(!v||v.readyState<2||!v.videoWidth)return null;return{src:v,nw:v.videoWidth,nh:v.videoHeight,w:v.videoWidth*cx,h:v.videoHeight*cy,fitBox:true,crop:cr}}
  if(c.type==='image'){const e=veImg(c.asset);if(!e.ok)return null;let src=e.img;if(e.gif)src=gifFrameAt(e.gif,(t-c._s)*(c.speed||1)+(c.in||0))||src;return{src,nw:e.sw,nh:e.sh,w:e.w*cx,h:e.h*cy,fitBox:true,crop:cr}}
  if(c.type==='text'){let txt=String(c.text||' ');if(c.ain==='type'){const lt=t-c._s;txt=txt.slice(0,Math.max(0,Math.ceil(txt.length*clamp(lt/Math.min(1.2,veL(c)*.6),0,1))))||' '}
    const L={text:txt,font:c.font,size:Math.round((c.size||100)*q),color:c.color,color2:c.color2,grad:!!c.grad,stroke:Math.round((c.stroke||0)*q),strokeColor:c.strokeColor,depth:Math.round((c.depth||0)*q),align:'center'};
    const cv=textCanvas(L);return{src:cv,w:cv.width/q,h:cv.height/q,box:c.box?c.boxColor||'#000':null}}
  if(c.type==='char'){const h=BH*.55,w=h*2/3;if(dims)return{src:null,w,h};const cv=veCharFrame(c,t);return cv?{src:cv,w,h}:null}
  if(c.type==='sticker'){const a=LIBK[c.key];if(!a)return null;const cv=a.bk?blockCanvas(a.bk):libCanvas(c.key,c.color);if(!cv)return null;const w=BW*.3,h=w*cv.height/cv.width;return{src:cv,w,h,pixel:a.pixel}}
  return null}
const veEase=u=>1-Math.pow(1-u,3),veBack=u=>{const s=1.7;u-=1;return u*u*((s+1)*u+s)+1};
function veGeo(c,t,ex,q,dims){const[BW,BH]=veBase(),S=veSource(c,t,ex,q,dims);if(!S)return null;let w=S.w,h=S.h;
  if(S.fitBox){const f=c.fit==='fill'?Math.max(BW/w,BH/h):Math.min(BW/w,BH/h);w*=f;h*=f}
  const V=veVal(c,t);let sc=V.s,x=V.x*BW,y=V.y*BH,a=V.o;const isOver=!VE.p.main.includes(c);
  if(isOver){const lt=t-c._s,L=veL(c),D=.45,edit=!ex&&!VE.playing&&c.id===VE.sel;/* beim Bearbeiten (angehalten, ausgewählt) ganz zeigen */for(const[kind,p]of[[c.ain,clamp(lt/D,0,1)],[c.aout,clamp((L-lt)/D,0,1)]]){if(edit||!kind||kind==='none'||kind==='type'||p>=1)continue;const e=veEase(p);
      if(kind==='fade')a*=p;else if(kind==='pop'){sc*=Math.max(0,veBack(p));a*=Math.min(1,p*3)}else if(kind==='up'){y+=(1-e)*BH*.18;a*=p}else if(kind==='left'){x-=(1-e)*BW*.45;a*=p}else if(kind==='right'){x+=(1-e)*BW*.45;a*=p}else if(kind==='top'){y-=(1-e)*BH*.2;a*=p}else if(kind==='zoom'){sc*=1+(1-e)*.9;a*=p}else if(kind==='spin'){sc*=e;a*=p;V.r=(V.r||0)-(1-e)*360}}
    const lp=c.aloop;if(lp==='bounce')y-=Math.abs(Math.sin(lt*Math.PI/.55))*BH*.03;else if(lp==='shake')V.r=(V.r||0)+Math.sin(lt*38)*5;else if(lp==='pulse')sc*=1+.07*Math.sin(lt*2*Math.PI/.8);else if(lp==='spin')V.r=(V.r||0)+lt*140;else if(lp==='float')y+=Math.sin(lt*2*Math.PI/2.2)*BH*.018;else if(lp==='wiggle'){x+=Math.sin(lt*9)*BW*.008;V.r=(V.r||0)+Math.sin(lt*7)*3}}
  return{...S,x,y,w:w*sc,h:h*sc,r:(V.r||0)*Math.PI/180,a}}
const VE_BLEND={normal:'source-over',screen:'screen',multiply:'multiply',overlay:'overlay',lighten:'lighten',darken:'darken',add:'lighter',difference:'difference'};
function veDrawClip(x,c,t,ex,q){const g=veGeo(c,t,ex,q);if(!g||!g.src||g.a<=.001||g.w<.5)return;let src=g.src,sx=0,sy=0,sw=0,sh=0;
  if(c.type==='video'||c.type==='image'){const nw=g.nw,nh=g.nh;src=veClipGL(g.src,nw,nh,c);const W2=src.width||nw,H2=src.height||nh,cr=g.crop||{};sx=(cr.l||0)*W2;sy=(cr.t||0)*H2;sw=W2*clamp(1-(cr.l||0)-(cr.r||0),.05,1);sh=H2*clamp(1-(cr.t||0)-(cr.b||0),.05,1)}
  x.save();x.globalAlpha=clamp(g.a,0,1);x.globalCompositeOperation=VE_BLEND[c.blend]||'source-over';x.translate(g.x,g.y);x.rotate(g.r);if(c.flip)x.scale(-1,1);x.imageSmoothingEnabled=!g.pixel;x.imageSmoothingQuality='high';
  const k=x.getTransform?Math.hypot(x.getTransform().a,x.getTransform().b):1;
  if(c.glow>0){x.shadowColor=c.glc||'#ffe066';x.shadowBlur=c.glow*k;x.shadowOffsetX=0;x.shadowOffsetY=0}else if(c.shadow>0){x.shadowColor='rgba(0,0,0,.6)';x.shadowBlur=c.shadow*k;x.shadowOffsetX=c.shadow*.25*k;x.shadowOffsetY=c.shadow*.4*k}
  if(g.box){const p=g.h*.12;x.fillStyle=g.box;x.beginPath();if(x.roundRect)x.roundRect(-g.w/2-p,-g.h/2,g.w+p*2,g.h,g.h*.18);else x.rect(-g.w/2-p,-g.h/2,g.w+p*2,g.h);x.fill()}
  try{if(sw)x.drawImage(src,sx,sy,sw,sh,-g.w/2,-g.h/2,g.w,g.h);else x.drawImage(src,-g.w/2,-g.h/2,g.w,g.h)}catch{}x.restore()}
/* ---------- Effekte auf das ganze Bild ---------- */
const VE_FX=[['shake','Wackeln','〰',1],['punch','Zoom-Puls','◎',2],['zoomin','Ranzoomen','⤢',3],['flash','Lichtblitz','✦',.5],['hurt','Schaden','♥',.6],['glitch','Glitch','▚',1],['vhs','VHS','▤',3],['bw','Schwarz-Weiß','◐',3],['blur','Unscharf','◌',2],['vignette','Vignette','◉',3],['bars','Kinobalken','▭',3],['fadein','Aufblenden','◒',1],['fadeout','Abblenden','◓',1]];
const veFxC={};const veFxCan=(k,w,h)=>{let c=veFxC[k];if(!c||c.width!==w||c.height!==h)c=veFxC[k]=mk(w,h);return c};
function veApplyFx(x,TW,TH,t,fxs){x.save();x.setTransform(1,0,0,1,0,0);x.globalAlpha=1;x.globalCompositeOperation='source-over';let sc=1,dx=0,dy=0;
  for(const f of fxs){const lt=t-f._s,L=veL(f),A=f.amt??1;
    if(f.kind==='shake'){const n=(a,b)=>Math.sin(lt*a)*.6+Math.sin(lt*b+1.3)*.4;dx+=n(37.1,91.7)*TW*.022*A;dy+=n(43.3,77.9)*TH*.016*A;sc=Math.max(sc,1+.05*A)}
    else if(f.kind==='punch'){const ph=(lt%.5)/.5;sc*=1+.13*A*Math.exp(-ph*6)}else if(f.kind==='zoomin')sc*=1+.3*A*clamp(lt/L,0,1)}
  if(sc!==1||dx||dy){const tmp=veFxCan('t',TW,TH),tx=tmp.getContext('2d');tx.clearRect(0,0,TW,TH);tx.drawImage(x.canvas,0,0);x.fillStyle='#000';x.fillRect(0,0,TW,TH);x.translate(TW/2+dx,TH/2+dy);x.scale(sc,sc);x.drawImage(tmp,-TW/2,-TH/2);x.setTransform(1,0,0,1,0,0)}
  for(const f of fxs){const lt=t-f._s,L=veL(f),A=f.amt??1;
    if(f.kind==='glitch'||f.kind==='vhs'){const r=veGLRun(x.canvas,TW,TH,'fx',(g,U)=>g.uniform4f(U('f'),f.kind==='glitch'?1:2,A,t,TH/3));if(r)x.drawImage(r,0,0,TW,TH)}
    else if(f.kind==='bw'){const r=veGLRun(x.canvas,TW,TH,'clip',(g,U)=>{g.uniform4f(U('a'),0,.08*A,-A,0);g.uniform3f(U('kc'),0,0,0);g.uniform3f(U('kp'),0,0,0)});if(r)x.drawImage(r,0,0,TW,TH)}
    else if(f.kind==='blur'){const k=Math.max(2,Math.round(10*A)),w=Math.max(2,Math.round(TW/k)),h=Math.max(2,Math.round(TH/k)),sm=veFxCan('b',w,h),sx=sm.getContext('2d');sx.imageSmoothingQuality='high';sx.drawImage(x.canvas,0,0,w,h);x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(sm,0,0,TW,TH)}
    else if(f.kind==='flash'){const a=clamp(1-lt/Math.min(.45,L),0,1)*A;if(a>0){x.fillStyle=`rgba(255,255,255,${Math.min(1,a)})`;x.fillRect(0,0,TW,TH)}}
    else if(f.kind==='hurt'){const a=clamp(1-lt/Math.min(.6,L),0,1)*.45*A;if(a>0){x.fillStyle=`rgba(255,20,20,${Math.min(.9,a)})`;x.fillRect(0,0,TW,TH)}}
    else if(f.kind==='vignette'){const g=x.createRadialGradient(TW/2,TH/2,Math.min(TW,TH)*.3,TW/2,TH/2,Math.hypot(TW,TH)/2);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${Math.min(.95,.7*A)})`);x.fillStyle=g;x.fillRect(0,0,TW,TH)}
    else if(f.kind==='bars'){const bh=(TW>TH?Math.max(0,(TH-TW/2.39)/2):TH*.1)*Math.min(1.5,A)*clamp(lt/.4,0,1)*clamp((L-lt)/.4,0,1);x.fillStyle='#000';x.fillRect(0,0,TW,bh);x.fillRect(0,TH-bh,TW,bh)}
    else if(f.kind==='fadein'){const a=clamp(1-lt/L,0,1);x.fillStyle=`rgba(0,0,0,${a})`;x.fillRect(0,0,TW,TH)}
    else if(f.kind==='fadeout'){const a=clamp(lt/L,0,1);x.fillStyle=`rgba(0,0,0,${a})`;x.fillRect(0,0,TW,TH)}}
  x.restore()}
const veBlurC={};
function veDraw(x,TW,TH,t,ex){const P=VE.p,[BW,BH]=veBase(),k=TW/BW,q=Math.max(1,k);veLayout();x.save();x.setTransform(1,0,0,1,0,0);
  x.fillStyle=P.bg==='color'?P.bgColor:'#000';x.fillRect(0,0,TW,TH);x.scale(k,TH/BH);
  const mainC=P.main.find(c=>veActive(c,t));
  if(mainC&&P.bg==='blur'){const g=veGeo(mainC,t,ex,q);if(g){const bw=Math.max(8,Math.round(BW/24)),bh=Math.max(8,Math.round(BH/24)),b=veBlurC.c&&veBlurC.c.width===bw&&veBlurC.c.height===bh?veBlurC.c:(veBlurC.c=mk(bw,bh)),bx=b.getContext('2d');
      const nw=g.src.videoWidth||g.src.naturalWidth||g.src.width,nh=g.src.videoHeight||g.src.naturalHeight||g.src.height,f=Math.max(bw/nw,bh/nh),sw=nw*f,sh=nh*f;bx.clearRect(0,0,bw,bh);try{bx.drawImage(g.src,(bw-sw)/2,(bh-sh)/2,sw,sh)}catch{}
      x.save();x.imageSmoothingEnabled=true;x.imageSmoothingQuality='high';x.drawImage(b,-BW*.04,-BH*.04,BW*1.08,BH*1.08);x.fillStyle='rgba(0,0,0,.22)';x.fillRect(0,0,BW,BH);x.restore()}}
  if(mainC)veDrawClip(x,mainC,t,ex,q);
  for(const c of P.over.slice().sort((a,b)=>a.lane-b.lane))if(veActive(c,t))veDrawClip(x,c,t,ex,q);
  x.restore();const fxs=(P.fx||[]).filter(c=>veActive(c,t)).sort((a,b)=>a.lane-b.lane);if(fxs.length)veApplyFx(x,TW,TH,t,fxs)}
/* ---------- Vorschau ---------- */
function veEl(c){let e=VE.els.get(c.id);if(e&&e._asset===c.asset)return e;if(e){e.pause();e.remove()}
  e=document.createElement(c.type==='audio'?'audio':'video');e.playsInline=true;e.setAttribute('playsinline','');e.preload='auto';e.preservesPitch=false;e.webkitPreservesPitch=false;e.mozPreservesPitch=false;e._asset=c.asset;veHid().append(e);
  e._has=false;VE.els.set(c.id,e);return e}
function veFadeK(c,t){const lt=t-c._s,L=veL(c);let k=1;if(c.fin>0)k=Math.min(k,clamp(lt/c.fin,0,1));if(c.fout>0)k=Math.min(k,clamp((L-lt)/c.fout,0,1));return k}
/* Nur Clips in der Nähe des Zeitreglers bekommen ein Video-/Ton-Element (spart Arbeitsspeicher bei vielen Clips) */
function veNear(c,t){const L=veL(c);return t>=c._s-(VE.playing?3:.6)&&t<c._s+L+.5}
function veSync(){const P=VE.p,live=new Set();veLayout();
  for(const c of[...P.main,...P.over,...P.audio]){if(c.type!=='video'&&c.type!=='audio')continue;live.add(c.id);const e=veEl(c);
    /* Element bleibt (auf iPad schon freigeschaltet), aber nur nahe Clips haben eine Quelle geladen */
    if(!veNear(c,VE.t)){if(e._has){e.pause();e._has=false;e.removeAttribute('src');try{e.load()}catch{}}continue}
    if(!e._has){e._has=true;veUrl(c.asset).then(u=>{if(e._has)e.src=u}).catch(()=>{})}
    const on=veActive(c,VE.t),st=veSrcT(c,VE.t);
    e.muted=!!c.mute||(c.vol??1)<=0||!!VE.recMute;try{e.volume=clamp((c.vol??1)*veFadeK(c,VE.t),0,1)}catch{}
    if(VE.playing&&on){if(Math.abs(e.playbackRate-c.speed)>.001)e.playbackRate=c.speed;if(e.paused){if(Math.abs(e.currentTime-st)>.05)e.currentTime=st;e.play().catch(()=>{})}else if(Math.abs(e.currentTime-st)>.3)e.currentTime=st}
    else{if(!e.paused)e.pause();if(on&&c.type==='video'&&!e.seeking&&Math.abs(e.currentTime-st)>.02)try{e.currentTime=st}catch{}}}
  for(const[id,e]of VE.els)if(!live.has(id)){e.pause();e.removeAttribute('src');try{e.load()}catch{}e.remove();VE.els.delete(id)}}
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
  veSync();const cv=$('#ve-cv');if(!cv)return;const x=cv.getContext('2d');veDraw(x,cv.width,cv.height,VE.t,null);if(!VE.playing)veSelBox(x,cv);if(VE.safe)veSafe(x,cv)}
/* Auswahlrahmen im Vorschaubild */
function veSelGeo(c,cv){const[BW]=veBase(),k=cv.width/BW,g=veGeo(c,VE.t,null,Math.max(1,k),true);if(!g)return null;const r=g.r,co=Math.cos(r),si=Math.sin(r),P=(i,j)=>[(g.x+i*g.w/2*co-j*g.h/2*si)*k,(g.y+i*g.w/2*si+j*g.h/2*co)*cv.height/veBase()[1]];
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
    e.preventDefault();try{cv.setPointerCapture(e.pointerId)}catch{}const g=veSelGeo(c,cv);veLayout();D={id:e.pointerId,c,mode,x:px,y:py,c0:veVal(c,VE.t),g,moved:false}});
  cv.addEventListener('pointermove',e=>{if(!D||e.pointerId!==D.id)return;const[px,py]=pos(e);if(!D.moved&&Math.hypot(px-D.x,py-D.y)<3)return;D.moved=true;const c=D.c,g=D.g;
    if(D.mode==='move'){let nx=D.c0.x+(px-D.x)/cv.width,ny=D.c0.y+(py-D.y)/cv.height;if(Math.abs(nx-.5)*cv.clientWidth<6)nx=.5;if(Math.abs(ny-.5)*cv.clientHeight<6)ny=.5;veSetVals(c,{x:Math.round(nx*1000)/1000,y:Math.round(ny*1000)/1000})}
    else if(D.mode==='scale'){const d0=Math.hypot(D.x-g.cx,D.y-g.cy),d1=Math.hypot(px-g.cx,py-g.cy);veSetVals(c,{s:Math.round(clamp(D.c0.s*d1/Math.max(4,d0),.02,20)*1000)/1000})}
    else{const a0=Math.atan2(D.y-g.cy,D.x-g.cx),a1=Math.atan2(py-g.cy,px-g.cx);let r=D.c0.r+(a1-a0)*180/Math.PI;if(!e.shiftKey){const sn=Math.round(r/15)*15;if(Math.abs(sn-r)<3)r=sn}veSetVals(c,{r:Math.round(r*10)/10})}});
  const up=e=>{if(!D||e.pointerId!==D.id)return;const d=D;D=null;if(d.moved){veCommit();veProps()}};cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
  cv.addEventListener('wheel',e=>{const c=veFind(VE.sel);if(!c||!veIsVis(c)||!veActive(c,VE.t))return;e.preventDefault();veLayout();veSetVals(c,{s:clamp(veVal(c,VE.t).s*Math.exp(-e.deltaY*.0015),.02,20)});clearTimeout(veWheelT);veWheelT=setTimeout(()=>{veCommit();veProps()},300)},{passive:false})}
let veWheelT=0;
/* ---------- Zeitleiste ---------- */
const VE_PAD=16,VE_ROW={over:34,main:56,audio:34};
function veRows(){const P=VE.p,ov=Math.max(1,...P.over.map(c=>c.lane+2)),au=Math.max(1,...P.audio.map(c=>c.lane+2)),fxn=P.fx.length?Math.max(...P.fx.map(c=>c.lane+2)):0,rows=[];
  for(let l=fxn-1;l>=0;l--)rows.push({kind:'fx',lane:l,h:26});
  for(let l=ov-1;l>=0;l--)rows.push({kind:'over',lane:l,h:VE_ROW.over});rows.push({kind:'main',lane:0,h:VE_ROW.main});for(let l=0;l<au;l++)rows.push({kind:'audio',lane:l,h:VE_ROW.audio});
  let y=26;for(const r of rows){r.y=y;y+=r.h+4}return{rows,h:y+6}}
function veFitZoom(){const sc=$('#ve-scroll');if(!sc||!VE.p)return;const D=Math.max(5,veDur());VE.pxs=clamp((sc.clientWidth-VE_PAD*2-30)/D,8,400);const z=$('#ve-zoom');if(z)z.value=Math.log(VE.pxs);veTimeline()}
function veTimeline(){const tin=$('#ve-tin');if(!tin||!VE.p)return;const P=VE.p,D=veDur(),pxs=VE.pxs,{rows,h}=veRows(),sc=$('#ve-scroll');
  const W=Math.max(sc?sc.clientWidth:600,VE_PAD*2+(D+8)*pxs);tin.style.width=W+'px';tin.style.height=h+'px';tin.innerHTML='';
  const ru=document.createElement('div');ru.className='ve-ruler';const step=[.5,1,2,5,10,15,30,60,120].find(s=>s*pxs>=64)||300;for(let s=0;s<=D+8;s+=step){const tk=document.createElement('span');tk.className='ve-tick';tk.style.left=(VE_PAD+s*pxs)+'px';tk.textContent=veFmt(s).replace(/,0$/,'');ru.append(tk)}tin.append(ru);
  for(const r of rows){const bg=document.createElement('div');bg.className='ve-lane '+r.kind;bg.style.top=r.y+'px';bg.style.height=r.h+'px';if(r.kind==='main'&&!P.main.length)bg.textContent='Füge ein Video oder Bild hinzu. Es landet hier auf der Hauptspur.';tin.append(bg)}
  const rowOf=(kind,lane)=>rows.find(r=>r.kind===kind&&r.lane===lane);
  for(const[kind,list]of[['main',P.main],['over',P.over],['audio',P.audio],['fx',P.fx]])for(const c of list){const r=rowOf(kind,kind==='main'?0:c.lane);if(!r)continue;const L=veL(c),el=document.createElement('div');
    el.className='ve-clip t-'+c.type+(c.sub?' sub':'')+(c.id===VE.sel?' sel':'');el.style.left=(VE_PAD+c._s*pxs)+'px';el.style.top=r.y+'px';el.style.width=Math.max(6,L*pxs)+'px';el.style.height=r.h+'px';el.dataset.id=c.id;
    const w=Math.max(6,Math.round(L*pxs));if(c.type==='video'||c.type==='image'||c.type==='audio'){const cv=document.createElement('canvas');cv.className='ve-cth';cv.width=Math.min(4000,w);cv.height=r.h;veDrawStrip(cv,c,pxs);el.append(cv)}
    for(const k of c.keys||[]){const d=document.createElement('i');d.className='ve-key';d.style.left=(k.t*pxs)+'px';el.append(d)}
    const lb=document.createElement('span');lb.className='ve-lab';lb.textContent=(c.type==='text'?'T  '+(String(c.text||'').split('\n')[0]):c.type==='sticker'?'★ '+c.name:c.type==='char'?'☺ '+c.name:c.type==='fx'?'✦ '+((VE_FX.find(f=>f[0]===c.kind)||[])[1]||'Effekt'):c.name||'')+(c.speed&&c.speed!==1?'  '+String(c.speed).replace('.',',')+'×':'')+((c.type==='video'||c.type==='audio')&&(c.mute||(c.vol??1)<=0)?'  🔇':'');el.append(lb);
    for(const s of['l','r']){const hd=document.createElement('div');hd.className='ve-h '+s;hd.dataset.h=s;el.append(hd)}tin.append(el)}
  const ph=document.createElement('div');ph.className='ve-ph';ph.id='ve-ph';tin.append(ph);vePH()}
function veDrawStrip(cv,c,pxs){const x=cv.getContext('2d'),w=cv.width,h=cv.height;x.clearRect(0,0,w,h);
  if(c.type==='audio'){const pk=VE.peaks.get(c.asset),m=veMedia(c.asset);if(!pk||!m||!m.dur)return;x.fillStyle='rgba(255,255,255,.55)';const n=pk.length;
    for(let i=0;i<w;i+=2){const st=c.in+(i/pxs)*(c.speed||1);if(st>c.out)break;const v=pk[Math.min(n-1,Math.floor(st/m.dur*n))]*(h-8)*Math.min(1,c.vol??1);x.fillRect(i,(h-v)/2,1.5,Math.max(1,v))}return}
  if(c.type==='image'){const e=veImg(c.asset);if(!e.ok)return;const tw=Math.max(8,h*e.w/e.h);for(let i=0;i<w;i+=tw)try{x.drawImage(e.img,i,0,tw,h)}catch{}return}
  const th=VE.thumbs.get(c.asset);if(!th||!th.length)return;const tw=th[0].c.width*h/th[0].c.height;
  for(let i=0;i<w;i+=tw){const st=c.in+((i+tw/2)/pxs)*(c.speed||1);let best=th[0];for(const z of th)if(Math.abs(z.t-st)<Math.abs(best.t-st))best=z;x.drawImage(best.c,i,0,tw,h)}}
function vePH(){const p=$('#ve-ph');if(p)p.style.left=(VE_PAD+VE.t*VE.pxs)+'px';const l=$('#ve-time');if(l)l.textContent=veFmt(VE.t)+' / '+veFmt(veDur())}
function veFollow(){const sc=$('#ve-scroll');if(!sc)return;const x=VE_PAD+VE.t*VE.pxs;if(x>sc.scrollLeft+sc.clientWidth-40||x<sc.scrollLeft)sc.scrollLeft=x-sc.clientWidth*.25}
function veTLPointer(){const sc=$('#ve-scroll');let D=null;
  const tAt=e=>{const r=$('#ve-tin').getBoundingClientRect();return Math.max(0,(e.clientX-r.left-VE_PAD)/VE.pxs)};
  const snapT=(t,self)=>{const P=VE.p,th=8/VE.pxs;let best=t,bd=th;const cand=[0,VE.t];for(const k of['main','over','audio','fx'])for(const c of P[k])if(c!==self){cand.push(c._s,c._s+veL(c))}for(const v of cand)if(Math.abs(v-t)<bd){bd=Math.abs(v-t);best=v}return best};
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
    else if(list!==VE.p.main){c.start=Math.max(0,snapT(D.start0+dx,c));const up=list===VE.p.over||list===VE.p.fx,row=Math.round((e.clientY-D.y)/((list===VE.p.fx?26:list===VE.p.over?VE_ROW.over:VE_ROW.audio)+4));c.lane=clamp(D.lane0+(up?-row:row),0,19)}
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
/* ---------- Bedienung: Symbole, Bibliothek-Reiter, Werkzeuge ---------- */
const VE_IC={media:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z" fill="currentColor"/>',
  text:'<path d="M5 7V5h14v2M12 5v14M9 19h6"/>',sticker:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c.9 1.4 2.1 2.1 3.5 2.1s2.6-.7 3.5-2.1M9 10h.01M15 10h.01"/>',
  gif:'<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><text x="12" y="15.4" text-anchor="middle" font-size="7.4" font-weight="800" fill="currentColor" stroke="none" font-family="Inter,Arial,sans-serif">GIF</text>',
  fx:'<path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9z"/><path d="M18.5 15.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>',audio:'<path d="M9 18V5.5l11-2.2v12.4"/><circle cx="6.2" cy="18" r="2.8"/><circle cx="17.2" cy="15.7" r="2.8"/>',
  sub:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 12.5h4M13 12.5h4M7 15.5h6.5"/>',char:'<rect x="8" y="2.8" width="8" height="8" rx="1"/><path d="M5.5 21v-5.5a2.3 2.3 0 0 1 2.3-2.3h8.4a2.3 2.3 0 0 1 2.3 2.3V21"/><path d="M10.4 6.8h.01M13.6 6.8h.01"/>',
  proj:'<path d="M3 7.5a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',x:'<path d="M6 6l12 12M18 6 6 18"/>',
  pos:'<path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5"/>',
  speed:'<path d="M4 17a8 8 0 1 1 16 0"/><path d="m12 17 4.5-5"/>',vol:'<path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"/>',
  anim:'<circle cx="15" cy="12" r="5"/><path d="M3 8h5M2 12h6M3 16h5"/>',filter:'<circle cx="9" cy="10" r="5"/><circle cx="15" cy="10" r="5"/><circle cx="12" cy="15" r="5"/>',
  adjust:'<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',crop:'<path d="M6.5 2.5v13a2 2 0 0 0 2 2h13"/><path d="M2.5 6.5h13a2 2 0 0 1 2 2v13"/>',
  key:'<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 2.4"/><circle cx="12" cy="10" r="3"/><path d="M7 19c.8-3 2.8-4.5 5-4.5s4.2 1.5 5 4.5"/>',
  glow:'<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  color:'<path d="M12 3.5s6 6.4 6 10.8a6 6 0 0 1-12 0C6 9.9 12 3.5 12 3.5z"/>',move:'<circle cx="14" cy="4.5" r="2"/><path d="M9 21l2.5-6 2.5 2.5V21M7 11.5l3-3.5h4l2 3.5 3 1M11.5 15l1-6"/>',
  face:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8.5 10h.01M15.5 10h.01M9 15h6"/>',skin:'<path d="M8.5 3 4 6l2 4 2-1v12h8V9l2 1 2-4-4.5-3a3.5 3.5 0 0 1-7 0z"/>',
  split:'<circle cx="6" cy="6" r="2.6"/><circle cx="6" cy="18" r="2.6"/><path d="M8.1 7.6 20 19M8.1 16.4 20 5"/>',del:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  dup:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',back:'<path d="m15 18-6-6 6-6"/>',
  fmt:'<rect x="3.5" y="6" width="17" height="12" rx="2"/><path d="M8 3.5v2.5M16 3.5v2.5"/>',plus:'<path d="M12 5v14M5 12h14"/>',key2:'<path d="M12 2.5 14.6 8l6 .6-4.5 4 1.3 5.9L12 15.5l-5.4 3 1.3-5.9-4.5-4 6-.6z"/>'};
const VE_LIBTABS=[['media','Medien'],['text','Text'],['sticker','Sticker'],['gif','GIFs'],['fx','Effekte'],['audio','Audio'],['sub','Untertitel'],['char','Figuren'],['proj','Projekte']];
const VE_TOOLS=[['move','Bewegung','move'],['face','Gesicht','face'],['skin','Skin','skin'],['text','Text','text'],['fxs','Effekt','fx'],['pos','Position','pos'],['audio','Ton','vol'],['speed','Tempo','speed'],['anim','Animation','anim'],['filter','Filter','filter'],['adjust','Anpassen','adjust'],['crop','Zuschneiden','crop'],['key','Greenscreen','key'],['glow','Schatten','glow'],['color','Farbe','color']];
const VE_SECTOOL={'Text':'text','Bild':'pos','Bewegung':'pos','Dauer':'pos','Geschwindigkeit':'speed','Ton':'audio','Animation':'anim','Filter':'filter','Anpassen':'adjust','Zuschneiden':'crop','Greenscreen':'key','Schatten und Leuchten':'glow','Farbe':'color','Bewegung der Figur':'move','Gesicht':'face','Skin':'skin'};
const veSmall=()=>matchMedia('(max-width:980px)').matches,vePhone=()=>matchMedia('(max-width:680px)').matches;
function veSheet(which){const r=$('#v-video .ve');if(!r)return;r.classList.toggle('lib-open',which==='lib');r.classList.toggle('props-open',which==='props');veDock()}
function veToolsOf(c){if(VE.toolSel===c.id&&VE.toolList)return VE.toolList;/* welche Werkzeuge der Clip hat: Probe-Aufbau der Eigenschaften */const box=document.createElement('div');veBuildProps(box,c);const have=new Set([...box.querySelectorAll('.an-sec[data-sec]')].map(x=>VE_SECTOOL[x.dataset.sec]||(c.type==='fx'?'fxs':null)).filter(Boolean));return VE_TOOLS.filter(t=>have.has(t[0]))}
function veDock(){const d=$('#ve-dock');if(!d||!VE.p)return;const c=veFind(VE.sel),r=$('#v-video .ve'),open=r&&(r.classList.contains('lib-open')?'lib':r.classList.contains('props-open')?'props':null);let h='';
  const b=(a,ic,n,on)=>`<button type="button" data-a="${a}"${on?' aria-pressed="true"':''}><svg viewBox="0 0 24 24" aria-hidden="true">${VE_IC[ic]}</svg><span>${n}</span></button>`;
  if(!c){h=VE_LIBTABS.map(([k,n])=>b('lib:'+k,k,n,open==='lib'&&VE.tab===k)).join('')+(vePhone()?b('props:','fmt','Format',open==='props'):'')}
  else{h=b('done','back','Fertig')+b('split','split','Teilen')+veToolsOf(c).map(([k,n,ic])=>b('tool:'+k,ic,n,open==='props'&&VE.tool===k)).join('')+(c.type==='video'?b('detach','vol','Ton trennen')+b('freeze','media','Standbild'):'')+b('dup','dup','Kopie')+b('del','del','Löschen')}
  d.innerHTML=h}
function veDockClick(e){const bt=e.target.closest('button[data-a]');if(!bt)return;const a=bt.dataset.a,r=$('#v-video .ve');
  if(a.startsWith('lib:')){const k=a.slice(4);if(r.classList.contains('lib-open')&&VE.tab===k){veSheet(null);return}VE.tab=k;veLib();veSheet('lib');return}
  if(a==='props:'){veSheet(r.classList.contains('props-open')?null:'props');return}
  if(a.startsWith('tool:')){const k=a.slice(5);if(r.classList.contains('props-open')&&VE.tool===k&&vePhone()){veSheet(null);return}VE.tool=k;veProps();if(vePhone())veSheet('props');else veDock();return}
  if(a==='done'){VE.sel=null;veSheet(null);veTimeline();veProps();return}
  if(a==='split')veSplit();else if(a==='detach')veDetachAudio();else if(a==='freeze')veFreeze();else if(a==='dup')veDuplicate();else if(a==='del'){veDelete();veSheet(null)}}
function veEmpty(){const el=$('#ve-empty');if(!el||!VE.p)return;const on=!VE.p.main.length&&!VE.p.over.length&&!VE.busy;el.hidden=!on;if(!on||el.dataset.b)return;el.dataset.b='1';
  el.innerHTML=`<div class="ve-emptycard"><div class="ve-emptyic"><svg viewBox="0 0 24 24" aria-hidden="true">${VE_IC.plus}</svg></div><b>Füge dein erstes Video hinzu</b><p>Videos, Bilder oder deine Animationen aus Rendernail.</p><button type="button" class="btn primary ve-big" data-a="import">+ Video oder Bild</button>
    <div class="ve-emptyrow"><button type="button" class="btn" data-a="proj"><svg viewBox="0 0 24 24" aria-hidden="true">${VE_IC.proj}</svg>Animation</button><button type="button" class="btn" data-a="char"><svg viewBox="0 0 24 24" aria-hidden="true">${VE_IC.char}</svg>Figur</button><button type="button" class="btn" data-a="text"><svg viewBox="0 0 24 24" aria-hidden="true">${VE_IC.text}</svg>Text</button><button type="button" class="btn" data-a="gif"><svg viewBox="0 0 24 24" aria-hidden="true">${VE_IC.gif}</svg>GIF</button></div><p class="sub">Du kannst Dateien auch einfach hierher ziehen.</p></div>`;
  el.addEventListener('click',e=>{const b=e.target.closest('button[data-a]');if(!b)return;const a=b.dataset.a;if(a==='import'){$('#ve-file').click();return}if(a==='text'){veAddText(TEXT_PRESETS[0]);return}VE.tab=a;veLib();if(veSmall())veSheet('lib')})}
function veLib(){const box=$('#ve-libin');if(!box||!VE.p)return;if(!VE_LIBTABS.some(t=>t[0]===VE.tab))VE.tab='media';const sc=VE.libTab===VE.tab?box.scrollTop:0;VE.libTab=VE.tab;box.innerHTML='';const tabs=$('#ve-tabs');tabs.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===VE.tab));$('#ve-libtitle').textContent=(VE_LIBTABS.find(t=>t[0]===VE.tab)||[])[1]||'';
  if(VE.tab==='media'){const r=document.createElement('div');r.className='btnrow';const b=document.createElement('button');b.type='button';b.className='btn primary';b.textContent='+ Importieren';b.addEventListener('click',()=>$('#ve-file').click());r.append(b);box.append(r);
    box.append(Object.assign(document.createElement('p'),{className:'sub',textContent:'Videos, Bilder und Ton (MP4, MOV, PNG, JPG, MP3, M4A, WAV …). Antippen fügt sie in die Zeitleiste ein.'}));
    const g=document.createElement('div');g.className='ve-mgrid';for(const m of VE.p.media){const t=document.createElement('div');t.className='ve-mt';const pv=document.createElement('button');pv.type='button';pv.className='ve-mpv';pv.title=m.name;pv.setAttribute('aria-label',m.name+' einfügen');
        const c=mk(160,100),x=c.getContext('2d');x.fillStyle='#1a1a1a';x.fillRect(0,0,160,100);try{if(m.kind==='image'){const e=veImg(m.asset);if(e.ok){const f=Math.max(160/e.w,100/e.h);x.drawImage(e.img,(160-e.w*f)/2,(100-e.h*f)/2,e.w*f,e.h*f)}}
          else if(m.kind==='video'){const th=VE.thumbs.get(m.asset);if(th&&th.length){const z=th[0].c,f=Math.max(160/z.width,100/z.height);x.drawImage(z,(160-z.width*f)/2,(100-z.height*f)/2,z.width*f,z.height*f)}}
          else{x.fillStyle='#3d7a4f';x.fillRect(0,0,160,100);x.fillStyle='#fff';x.font='700 40px Inter,sans-serif';x.textAlign='center';x.textBaseline='middle';x.fillText('♪',80,52)}}catch{}
        pv.append(c);if(m.dur){const d=document.createElement('span');d.className='ve-mdur';d.textContent=veFmt(m.dur);pv.append(d)}
        pv.addEventListener('click',()=>{veAddClip(m,m.kind==='audio'?'audio':'main');veCommit();veAll()});pv.draggable=true;pv.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','ve-asset:'+m.asset);e.dataTransfer.effectAllowed='copy'});t.append(pv);
        const row=document.createElement('div');row.className='ve-mrow';const nm=document.createElement('span');nm.textContent=m.name;row.append(nm);
        if(m.kind!=='audio'){const ob=document.createElement('button');ob.type='button';ob.className='btn ghost sm';ob.textContent='Overlay';ob.title='Über dem Hauptvideo einfügen';ob.addEventListener('click',()=>{veAddClip(m,'over');veCommit();veAll()});row.append(ob)}t.append(row);g.append(t)}
    box.append(g);
    const ups=(typeof UPLOADS!=='undefined'?UPLOADS:[]).filter(u=>u.asset).slice(0,24);if(ups.length){const h=document.createElement('h4');h.textContent='Aus Rendernail (Renders, Uploads)';h.className='ve-h4';box.append(h);const g2=document.createElement('div');g2.className='ve-mgrid small';
      for(const u of ups){const b=document.createElement('button');b.type='button';b.className='ve-mpv';b.title=u.name||'Bild';const e=getImg(srcUrl(u));const im=document.createElement('img');im.alt='';if(e){e.p.then(()=>{if(e.ok)im.src=e.img.src})}b.append(im);
        b.addEventListener('click',()=>{let m=veMedia(u.asset);if(!m){m={asset:u.asset,name:u.name||'Bild',kind:'image',w:u.w||0,h:u.h||0,dur:0};VE.p.media.push(m);vePrepMedia(m)}veAddClip(m,VE.p.main.length?'over':'main');veCommit();veAll()});g2.append(b)}box.append(g2)}}
  else if(VE.tab==='proj')veLibProj(box);
  else if(VE.tab==='gif')veLibGif(box);
  else if(VE.tab==='sub')veLibSub(box);
  else if(VE.tab==='fx')veLibFx(box);
  else if(VE.tab==='audio')veLibAudio(box);
  else if(VE.tab==='char')veLibChar(box);
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
function vSec(P,title,sub){const s=document.createElement('section');s.className='an-sec';s.dataset.sec=typeof title==='string'?title:'';if(title){const h=document.createElement('h4');h.textContent=title;s.append(h)}if(sub){const p=document.createElement('p');p.className='sub';p.textContent=sub;s.append(p)}const b=document.createElement('div');b.className='stack';s.append(b);P.append(s);return b}
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
  {const ph=document.createElement('div');ph.className='ve-phead';ph.innerHTML='<b></b><button class="btn ghost sm icon" type="button" aria-label="Schließen"><svg viewBox="0 0 24 24" aria-hidden="true">'+VE_IC.x+'</svg></button>';ph.querySelector('b').textContent=c?((VE_TOOLS.find(t=>t[0]===VE.tool)||[])[1]||'Bearbeiten'):'Format und Export';ph.querySelector('button').addEventListener('click',()=>veSheet(null));P.append(ph)}
  if(!c){let s=vSec(P,'Projekt');vSeg(s,'Format',Object.entries(VE_FMT).map(([k,f])=>[k,f.n]),()=>VE.p.fmt,v=>{VE.p.fmt=v;veResize()});
    vSeg(s,'Hintergrund',[['blur','Unscharf'],['black','Schwarz'],['color','Farbe']],()=>VE.p.bg,v=>{VE.p.bg=v;veProps()});if(VE.p.bg==='color')vColor(s,'Farbe',()=>VE.p.bgColor,v=>{VE.p.bgColor=v});
    s=vSec(P,'Export');vSeg(s,'Qualität',[[0,'Standard (720p)'],[1,'Hoch (1080p)']],()=>VE.p.q,v=>{VE.p.q=+v});vSeg(s,'Bilder pro Sekunde',[[24,'24'],[30,'30'],[60,'60']],()=>VE.p.fps,v=>{VE.p.fps=+v});
    vBtn(s,'Video exportieren',veExport,'btn primary');s.append(Object.assign(document.createElement('p'),{className:'sub',textContent:'Tipp: Clip antippen (unten oder im Bild), um ihn zu bearbeiten. Leertaste spielt ab, S teilt am Zeitregler.'}));
    simplify(P,VE_SIMPLE);P.scrollTop=sc;veDock();veEmpty();return}
  const vis=veIsVis(c),isMain=VE.p.main.includes(c);
  let s=vSec(P,{video:'Video',image:'Bild',audio:'Ton',text:'Text',sticker:'Sticker',char:'Figur',fx:'Effekt'}[c.type]+' · '+veFmt(veL(c)));{const r=document.createElement('div');r.className='btnrow';vBtn(r,'Teilen',veSplit);vBtn(r,'Duplizieren',veDuplicate);if(c.type==='video'){vBtn(r,'Ton abtrennen',veDetachAudio);vBtn(r,'Standbild',veFreeze)}vBtn(r,'Löschen',veDelete,'btn sm danger');s.append(r);s.parentElement.classList.add('ve-head')}
  /* Werkzeuge als Reiter: immer nur ein Bereich sichtbar, nichts geht verloren */
  const body=document.createElement('div');veBuildProps(body,c);simplify(body,VE_SIMPLE);const secs=[...body.querySelectorAll(':scope>.an-sec')],tk=x=>VE_SECTOOL[x.dataset.sec]||(c.type==='fx'?'fxs':'pos');
  const tools=VE_TOOLS.filter(t=>secs.some(x=>x.style.display!=='none'&&tk(x)===t[0]));VE.toolSel=c.id;VE.toolList=tools;if(!tools.some(t=>t[0]===VE.tool))VE.tool=tools.length?tools[0][0]:null;
  if(tools.length>1){const bar=document.createElement('div');bar.className='ve-tools';bar.setAttribute('role','tablist');for(const[k,n,ic]of tools){const b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',k===VE.tool);b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+VE_IC[ic]+'</svg><span></span>';b.querySelector('span').textContent=n;b.addEventListener('click',()=>{VE.tool=k;veProps()});bar.append(b)}P.append(bar)}
  for(const x of secs)if(tools.length>1&&tk(x)!==VE.tool)x.style.display='none';P.append(...body.childNodes);P.scrollTop=VE.propTool===VE.tool+c.id?sc:0;VE.propTool=VE.tool+c.id;veDock();veEmpty()}
function veBuildProps(P,c){const pct=v=>Math.round(v*100)+' %',vis=veIsVis(c),isMain=VE.p.main.includes(c);let s;
  if(c.type==='text'){s=vSec(P,'Text');const ta=document.createElement('textarea');ta.className='an-otext';ta.rows=2;ta.value=c.text||'';ta.setAttribute('aria-label','Text');ta.addEventListener('input',()=>{c.text=ta.value.slice(0,300);veTimelineSoft()});ta.addEventListener('change',veCommit);s.append(ta);
    fontField(s,'Schrift',()=>c.font,v=>{c.font=v;veCommit();veTimelineSoft()});vRange(s,'Schriftgröße',20,400,1,()=>c.size||100,v=>{c.size=v});
    vColor(s,'Farbe',()=>c.color||'#ffffff',v=>{c.color=v;c.color2=v;c.grad=false});vRange(s,'Kontur',0,40,1,()=>c.stroke||0,v=>{c.stroke=v});vColor(s,'Konturfarbe',()=>c.strokeColor||'#000000',v=>{c.strokeColor=v});
    vCheck(s,'Hintergrund-Fläche',()=>c.box,v=>{c.box=v;veProps()});if(c.box)vColor(s,'Flächenfarbe',()=>c.boxColor||'#000000',v=>{c.boxColor=v})}
  if(c.type==='sticker'&&LIBK[c.key]&&LIBK[c.key].color){s=vSec(P,'Farbe');vColor(s,'Farbe',()=>c.color||LIBK[c.key].color,v=>{c.color=v})}
  if(c.type==='fx'){s=vSec(P,(VE_FX.find(f=>f[0]===c.kind)||[])[1]||'Effekt','Wirkt auf das ganze Bild, solange der Effekt-Clip läuft.');vRange(s,'Stärke',.1,2,.05,()=>c.amt??1,v=>{c.amt=v},v=>Math.round(v*100)+' %')}
  if(c.type==='char')veCharProps(P,c);
  if(vis&&c.type!=='fx'){s=vSec(P,'Bild');if(c.type==='video'||c.type==='image')vSeg(s,null,[['fit','Einpassen'],['fill','Füllen']],()=>c.fit||'fit',v=>{c.fit=v});
    veLayout();const cur=veVal(c,VE.t);vRange(s,'Größe',.05,4,.01,()=>cur.s,v=>{veSetVals(c,{s:v})},pct);vRange(s,'Drehung',-180,180,1,()=>Math.round(cur.r),v=>{veSetVals(c,{r:v})},v=>v+'°');
    vRange(s,'Links/rechts',-50,150,.5,()=>Math.round(cur.x*200)/2,v=>{veSetVals(c,{x:v/100})},v=>Math.round(v)+' %');vRange(s,'Oben/unten',-50,150,.5,()=>Math.round(cur.y*200)/2,v=>{veSetVals(c,{y:v/100})},v=>Math.round(v)+' %');
    vRange(s,'Deckkraft',0,1,.01,()=>cur.o,v=>{veSetVals(c,{o:v})},pct);vCheck(s,'Spiegeln',()=>c.flip,v=>{c.flip=v});
    if(!isMain)vSelect(s,'Mischmodus',[['normal','Normal'],['screen','Aufhellen (Screen)'],['add','Addieren (Leuchten)'],['multiply','Multiplizieren'],['overlay','Überlagern'],['lighten','Heller'],['darken','Dunkler'],['difference','Differenz']],()=>c.blend||'normal',v=>{c.blend=v});{const r=document.createElement('div');r.className='btnrow';vBtn(r,'Zurücksetzen',()=>{c.keys=[];Object.assign(c,{x:.5,y:isMain||c.type!=='text'?.5:.3,s:isMain?1:c.s,r:0});veCommit();veAll()});s.append(r)}
    s=vSec(P,'Bewegung',c.keys&&c.keys.length?'Zeitregler verschieben, dann im Bild ziehen oder die Regler ändern. Dazwischen bewegt es sich von selbst.':'Für Bewegung: Schlüsselbild setzen, Zeitregler verschieben, dann im Bild ziehen.');
    {const r=document.createElement('div');r.className='btnrow';const k=veKeyAt(c);vBtn(r,'◆ Schlüsselbild setzen',()=>veAddKey(c),'btn sm primary');
      if(k)vBtn(r,'Schlüsselbild löschen',()=>{c.keys.splice(c.keys.indexOf(k),1);veCommit();veAll()});if(c.keys&&c.keys.length)vBtn(r,'Alle entfernen',()=>{const v=veVal(c,VE.t);c.keys=[];Object.assign(c,v);veCommit();veAll()},'btn sm danger');s.append(r)}}
  if(c.type==='video'||c.type==='image'){s=vSec(P,'Filter');const g=document.createElement('div');g.className='ve-filters';for(const[k,n]of VE_FILTERS){const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent=n;b.setAttribute('aria-pressed',(c.filt||'none')===k);b.addEventListener('click',()=>{c.filt=k;veCommit();veProps()});g.append(b)}s.append(g);
    s=vSec(P,'Anpassen');c.adj=c.adj||{b:0,c:0,s:0,w:0};const sg=v=>(v>0?'+':'')+Math.round(v*100);vRange(s,'Helligkeit',-.5,.5,.01,()=>c.adj.b,v=>{c.adj.b=v},sg);vRange(s,'Kontrast',-.5,.8,.01,()=>c.adj.c,v=>{c.adj.c=v},sg);vRange(s,'Sättigung',-1,1,.01,()=>c.adj.s,v=>{c.adj.s=v},sg);vRange(s,'Wärme',-1,1,.01,()=>c.adj.w,v=>{c.adj.w=v},sg)}
  if(c.type==='video'||c.type==='image'){c.crop=c.crop||{};s=vSec(P,'Zuschneiden');const cp=v=>Math.round(v*100)+' %';vRange(s,'Links',0,.45,.01,()=>c.crop.l||0,v=>{c.crop.l=v},cp);vRange(s,'Rechts',0,.45,.01,()=>c.crop.r||0,v=>{c.crop.r=v},cp);vRange(s,'Oben',0,.45,.01,()=>c.crop.t||0,v=>{c.crop.t=v},cp);vRange(s,'Unten',0,.45,.01,()=>c.crop.b||0,v=>{c.crop.b=v},cp);
    c.key=c.key||{on:false,color:'#00ff00',sim:.12,smooth:.08};s=vSec(P,'Greenscreen','Entfernt eine Hintergrundfarbe, z. B. einen grünen Hintergrund.');vCheck(s,'Hintergrundfarbe entfernen',()=>c.key.on,v=>{c.key.on=v;veProps()});
    if(c.key.on){{const r=document.createElement('div');r.className='btnrow';for(const[l,v]of[['Grün','#00ff00'],['Blau','#0047ff'],['Schwarz','#000000'],['Weiß','#ffffff']])vBtn(r,l,()=>{c.key.color=v;veCommit();veProps()});s.append(r)}
      vColor(s,'Farbe',()=>c.key.color||'#00ff00',v=>{c.key.color=v});vRange(s,'Stärke',.02,.4,.01,()=>c.key.sim??.12,v=>{c.key.sim=v},v=>Math.round(v*250)+' %');vRange(s,'Weiche Kante',0,.25,.01,()=>c.key.smooth??.08,v=>{c.key.smooth=v},v=>Math.round(v*400)+' %')}}
  if(vis&&c.type!=='fx'&&(!isMain||c.type==='char')){s=vSec(P,'Schatten und Leuchten');vRange(s,'Schatten',0,40,1,()=>c.shadow||0,v=>{c.shadow=v});vRange(s,'Leuchten',0,60,1,()=>c.glow||0,v=>{c.glow=v});if(c.glow>0)vColor(s,'Leuchtfarbe',()=>c.glc||'#ffe066',v=>{c.glc=v})}
  if(c.type==='video'||c.type==='audio'){s=vSec(P,'Geschwindigkeit');vSeg(s,null,[[.5,'0,5×'],[1,'1×'],[1.5,'1,5×'],[2,'2×'],[3,'3×']],()=>c.speed,v=>{c.speed=+v;veProps()});vRange(s,'Tempo',.1,8,.05,()=>c.speed,v=>{c.speed=v},v=>String(Math.round(v*100)/100).replace('.',',')+'×');
    s=vSec(P,'Ton');vCheck(s,'Stumm',()=>c.mute,v=>{c.mute=v});vRange(s,'Lautstärke',0,2,.01,()=>c.vol??1,v=>{c.vol=v},pct);vRange(s,'Einblenden',0,Math.min(10,veL(c)/2),.1,()=>c.fin||0,v=>{c.fin=v},v=>String(Math.round(v*10)/10).replace('.',',')+' s');vRange(s,'Ausblenden',0,Math.min(10,veL(c)/2),.1,()=>c.fout||0,v=>{c.fout=v},v=>String(Math.round(v*10)/10).replace('.',',')+' s')}
  if(c.type==='image'&&isMain){s=vSec(P,'Dauer');vRange(s,'Länge',.2,30,.1,()=>c.out-c.in,v=>{c.out=c.in+v},v=>String(Math.round(v*10)/10).replace('.',',')+' s')}
  if(!isMain&&vis&&c.type!=='fx'){s=vSec(P,'Animation');vSelect(s,'Rein',VE_ANIM.filter(a=>a[0]!=='type'||c.type==='text'),()=>c.ain||'none',v=>{c.ain=v});vSelect(s,'Raus',VE_ANIM.filter(a=>a[0]!=='type'),()=>c.aout||'none',v=>{c.aout=v});vSelect(s,'Dauerhaft',VE_LOOP,()=>c.aloop||'none',v=>{c.aloop=v})}}
/* ---------- Export ---------- */
/* Ton für den Export in Abschnitten von 20 s mischen und gleich kodieren: so liegt nie der ganze Ton im Speicher */
function veGainAt(c,v,t){const t0=c._s,L=veL(c);let g=v;if(c.fin>0&&t<t0+c.fin)g=v*clamp((t-t0)/c.fin,0,1);if(c.fout>0&&t>t0+L-c.fout)g=Math.min(g,v*clamp((t0+L-t)/c.fout,0,1));return g}
async function veMixEncode(muxer,codec,D,ui){const P=VE.p,sr=48000,WIN=20,clips=[...P.main,...P.over,...P.audio].filter(veHasAudio),C=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!clips.length||!C)return false;
  veLayout();const bufs=new Map();for(const c of clips)if(!bufs.has(c.asset))bufs.set(c.asset,await veAudioBuf(c.asset,sr));
  let err=null;const ae=new AudioEncoder({output:(ch,m)=>muxer.addAudioChunk(ch,m),error:e=>{err=e}});ae.configure({codec,sampleRate:sr,numberOfChannels:2,bitrate:160000});
  const N=Math.max(1,Math.ceil(D*sr));let pos=0;
  for(let w0=0;pos<N;w0+=WIN){const w1=Math.min(D,w0+WIN),len=Math.min(N-pos,Math.max(1,Math.round((w1-w0)*sr)));const oc=new C(2,len,sr);
    for(const c of clips){const b=bufs.get(c.asset);if(!b)continue;const t0=c._s,L=veL(c),sp=c.speed||1;if(t0>=w1||t0+L<=w0)continue;
      const src=oc.createBufferSource();src.buffer=b;src.playbackRate.value=sp;const g=oc.createGain(),v=c.vol??1,a=Math.max(t0,w0),z=Math.min(t0+L,w1);
      const tp=[...new Set([a,z,t0+(c.fin||0),t0+L-(c.fout||0)].filter(t=>t>=a&&t<=z))].sort((p,q)=>p-q);g.gain.setValueAtTime(veGainAt(c,v,tp[0]),Math.max(0,tp[0]-w0));for(const t of tp.slice(1))g.gain.linearRampToValueAtTime(veGainAt(c,v,t),t-w0);
      src.connect(g);g.connect(oc.destination);src.start(Math.max(0,a-w0),c.in+(a-t0)*sp,Math.max(.01,(z-a)*sp))}
    const r=await oc.startRendering(),Lc=r.getChannelData(0),Rc=r.numberOfChannels>1?r.getChannelData(1):Lc;
    for(let i=0;i<len;i+=4096){const n=Math.min(4096,len-i),d=new Float32Array(n*2);d.set(Lc.subarray(i,i+n),0);d.set(Rc.subarray(i,i+n),n);const ad=new AudioData({format:'f32-planar',sampleRate:sr,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round((pos+i)/sr*1e6),data:d});ae.encode(ad);ad.close()}
    pos+=len;while(ae.encodeQueueSize>8&&!err)await new Promise(q=>setTimeout(q,5));if(err)throw err;if(ui)ui.prog(1,'Ton wird eingefügt … '+Math.min(100,Math.round(pos/N*100))+' %')}
  await ae.flush();ae.close();if(err)throw err;return true}
/* Fertiges Video in Blob-Stücken sammeln statt in einem großen Puffer (der Browser kann sie auslagern) */
function veSink(){const segs=[];
  return{onData(data,pos){const end=pos+data.length,ov=segs.filter(q=>q.pos<end&&pos<q.pos+q.len);
      for(const q of ov){const a=Math.max(pos,q.pos),z=Math.min(end,q.pos+q.len);q.b=new Blob([q.b.slice(0,a-q.pos),data.slice(a-pos,z-pos),q.b.slice(z-q.pos)])}
      let lo=pos;const cov=ov.map(q=>[q.pos,q.pos+q.len]).sort((x,y)=>x[0]-y[0]);for(const[a,z]of cov){if(a>lo)segs.push({pos:lo,len:a-lo,b:new Blob([data.slice(lo-pos,a-pos)])});lo=Math.max(lo,z)}
      if(lo<end)segs.push({pos:lo,len:end-lo,b:new Blob([data.slice(lo-pos)])});segs.sort((x,y)=>x.pos-y.pos)},
    blob(type){return new Blob(segs.map(q=>q.b),{type})}}}
function veRecUI(title){const ov=$('#ve-ov');ov.hidden=false;ov.innerHTML='<div class="an-reccard"><b></b><div class="an-prog"><i></i></div><p class="sub" id="ve-recst"></p><button class="btn sm" type="button">Abbrechen</button></div>';
  ov.querySelector('b').textContent=title||'Video wird erstellt';const ui={cancel:false,prog(p,t){ov.querySelector('.an-prog i').style.width=Math.round(p*100)+'%';const s=$('#ve-recst');if(s&&t)s.textContent=t}};ov.querySelector('button').addEventListener('click',()=>{ui.cancel=true});return ui}
async function veExport(){if(VE.busy||!VE.p)return;const P=VE.p,D=veDur();if(D<.05){toast('Füge zuerst ein Video oder Bild hinzu.');return}vePause();
  const[BW,BH]=veBase(),sc=P.q?1:2/3,W=Math.round(BW*sc/2)*2,H=Math.round(BH*sc/2)*2,fps=P.fps||30,cfg=await anCodec(W,H);
  if(!cfg){toast('Dieser Browser kann hier keine Videos erstellen. Nimm ein aktuelles Chrome, Edge oder Safari.');return}
  VE.busy=true;const ui=veRecUI();let err=null,acod=null;const els=new Map();
  try{if([...P.main,...P.over,...P.audio].some(veHasAudio))acod=await anAudCodec();
    ui.prog(0,'Schriften werden geladen …');try{await Promise.race([fontsReady([...P.over,...P.main].filter(c=>c.type==='text').map(c=>c.font)),new Promise(r=>setTimeout(r,8000))])}catch{}
    veLayout();const vids=[...P.main,...P.over].filter(c=>c.type==='video'),sink=veSink();
    const muxer=new Mp4Muxer.Muxer({target:new Mp4Muxer.StreamTarget({onData:(d,p)=>sink.onData(d,p),chunked:true,chunkSize:1<<23}),video:{codec:'avc',width:W,height:H,frameRate:fps},...(acod?{audio:{codec:acod.mux,sampleRate:48000,numberOfChannels:2}}:{}),fastStart:false});
    const enc=new VideoEncoder({output:(ch,m)=>muxer.addVideoChunk(ch,m),error:e=>{err=e}});enc.configure({...cfg,framerate:fps,latencyMode:'quality'});
    const out=mk(W,H),x=out.getContext('2d'),N=Math.max(1,Math.round(D*fps)),ex={els};
    for(let i=0;i<N;i++){if(ui.cancel||err)break;const t=i/fps;
      /* Videos erst kurz vor ihrem Einsatz laden und danach wieder freigeben */
      for(const c of vids){const on=veActive(c,t);let v=els.get(c.id);
        if(on&&!v){v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='auto';veHid().append(v);v.src=await veUrl(c.asset);await new Promise(ok=>{v.onloadeddata=ok;v.onerror=ok;setTimeout(ok,10000)});els.set(c.id,v)}
        if(on&&v)await veSeek(v,veSrcT(c,t));else if(v&&t>=c._s+veL(c)){v.removeAttribute('src');try{v.load()}catch{}v.remove();els.delete(c.id)}}
      veDraw(x,W,H,t,ex);const f=new VideoFrame(out,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});enc.encode(f,{keyFrame:i%(fps*2)===0});f.close();
      {const w0=performance.now();let pushed=false;while(enc.encodeQueueSize>3&&!err&&enc.state!=='closed'){if(performance.now()-w0>1500){if(pushed)throw new Error('encoder_stalled');pushed=true;await Promise.race([enc.flush(),new Promise(r=>setTimeout(r,4000))])}else await new Promise(r=>setTimeout(r,4))}if(err||enc.state==='closed')throw err||new Error('encoder_closed')}
      if(i%3===0){ui.prog(i/N,veFmt(t)+' von '+veFmt(D));await new Promise(r=>setTimeout(r,0))}}
    if(!ui.cancel&&!err){ui.prog(1,'Wird gespeichert …');await Promise.race([enc.flush(),new Promise((_,no)=>setTimeout(()=>no(new Error('flush_timeout')),20000))]);if(err)throw err;if(acod){ui.prog(1,'Ton wird eingefügt …');await veMixEncode(muxer,acod.codec,D,ui)}muxer.finalize()}
    try{enc.close()}catch{}
    if(!ui.cancel&&!err)veDone(sink.blob('video/mp4'))}catch(e){err=e}
  for(const v of els.values()){v.removeAttribute('src');v.remove()}VE.abufs.clear();VE.busy=false;
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
function veProjMenu(btn){showMenu(btn,[['Alle Videos',()=>veHome(true)],['Umbenennen …',async()=>{const n=await askText('Neuer Name',VE.p.name,{ok:'Umbenennen'});if(n===null||!n.trim())return;VE.p.name=n.trim().slice(0,60);veCommit();veSaveNow();veNameUI();toast('Name geändert.')}],null,['Neues Video',()=>veHome(true)]])}
function veNameUI(){const b=$('#ve-name');if(b&&VE.p)b.querySelector('span').textContent=VE.p.name}
/* ---------- Aufbau ---------- */
function veAll(){if(!VE.p)return;const n=VE.p.main.length+VE.p.over.length+VE.p.audio.length+VE.p.fx.length;if(VE.nClips!=null&&n>VE.nClips&&vePhone()){const r=$('#v-video .ve');if(r&&r.classList.contains('lib-open')&&VE.tab!=='sub')r.classList.remove('lib-open')}VE.nClips=n;
  veNameUI();veResize();veTimeline();veLib();veProps();veUndoUI();vePH()}
function veBuild(){if(VE.built)return;VE.built=true;const root=$('#v-video');
  root.innerHTML=`<div class="ve"><header class="ve-top"><button class="ve-name" id="ve-name" type="button" aria-haspopup="menu"><span></span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><span class="hstat" id="ve-save" role="status"></span><span class="grow"></span>
    <button class="btn ghost sm icon" id="ve-undo" type="button" aria-label="Rückgängig" title="Rückgängig (⌘Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button><button class="btn ghost sm icon" id="ve-redo" type="button" aria-label="Wiederholen" title="Wiederholen (⇧⌘Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg></button>
    <button class="btn primary" id="ve-export" type="button">Exportieren</button></header>
    <div class="ve-main"><aside class="ve-lib" id="ve-lib"><nav class="ve-rail" id="ve-tabs" aria-label="Einfügen">${VE_LIBTABS.map(([k,n])=>`<button type="button" data-t="${k}"><svg viewBox="0 0 24 24" aria-hidden="true">${VE_IC[k]}</svg><span>${n}</span></button>`).join('')}</nav>
      <div class="ve-libpane"><div class="ve-libhead"><h3 id="ve-libtitle"></h3><button class="btn ghost sm icon ve-x" id="ve-libx" type="button" aria-label="Schließen"><svg viewBox="0 0 24 24" aria-hidden="true">${VE_IC.x}</svg></button></div><div class="ve-libin" id="ve-libin"></div></div></aside>
      <div class="ve-stage" id="ve-stage"><canvas id="ve-cv" aria-label="Vorschau"></canvas><div class="ve-empty" id="ve-empty" hidden></div><div class="an-rec ve-ov" id="ve-ov" hidden></div></div><aside class="ve-props an-side" id="ve-props"></aside></div>
    <div class="ve-tl"><div class="ve-tbar"><button class="btn ghost sm" id="ve-split" type="button" title="Am Zeitregler teilen (S)">Teilen</button><button class="btn ghost sm" id="ve-del" type="button" title="Löschen (Entf)">Löschen</button><span class="grow"></span>
      <button class="btn ghost sm icon" id="ve-start" type="button" aria-label="Zum Anfang"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 5v14"/><path d="M18 6 9 12l9 6z"/></svg></button><button class="an-playbtn ve-playbtn" id="ve-play" type="button" aria-label="Abspielen"></button><span class="ve-time" id="ve-time"></span><span class="grow"></span>
      <button class="btn ghost sm icon" id="ve-safe" type="button" aria-pressed="false" aria-label="Sicherheitsbereich" title="Sicherheitsbereich: zeigt, wo bei TikTok und Shorts Knöpfe und Text liegen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M8.5 16.5h5M15.5 9v4" stroke-dasharray="2 2"/></svg></button><button class="btn ghost sm icon" id="ve-full" type="button" aria-label="Vorschau im Vollbild" title="Vorschau im Vollbild"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button><label class="ve-zoomlab"><span class="sr">Zoom</span><input type="range" id="ve-zoom" min="2" max="6" step="0.01" aria-label="Zeitleiste zoomen"></label><button class="btn ghost sm" id="ve-fit" type="button">Anpassen</button></div>
      <div class="ve-scroll" id="ve-scroll"><div class="ve-tin" id="ve-tin"></div></div></div>
    <nav class="ve-dock" id="ve-dock" aria-label="Werkzeuge"></nav>
    <div class="ve-home an-home" id="ve-homeov" hidden></div><div class="ve-hid" id="ve-hid" aria-hidden="true"></div><input type="file" id="ve-file" multiple accept="video/*,image/*,audio/*,.mov,.mp4,.m4a,.mp3,.wav,.flac,.gif" hidden></div>`;
  $('#ve-file').addEventListener('change',e=>{const fs=[...e.target.files];e.target.value='';if(fs.length)veImport(fs)});
  $('#ve-tabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;VE.tab=b.dataset.t;veLib()});$('#ve-libx').addEventListener('click',()=>veSheet(null));$('#ve-dock').addEventListener('click',veDockClick);
  $('#ve-undo').addEventListener('click',()=>veUndo(-1));$('#ve-redo').addEventListener('click',()=>veUndo(1));$('#ve-export').addEventListener('click',veExport);
  $('#ve-name').addEventListener('click',e=>{e.stopPropagation();veProjMenu(e.currentTarget)});$('#ve-play').addEventListener('click',vePlay);$('#ve-start').addEventListener('click',()=>{vePause();veGoto(0);$('#ve-scroll').scrollLeft=0});
  $('#ve-split').addEventListener('click',veSplit);$('#ve-safe').addEventListener('click',e=>{VE.safe=!VE.safe;e.currentTarget.setAttribute('aria-pressed',VE.safe);if(VE.safe&&VE.p&&VE.p.fmt!=='9:16')toast('Der Sicherheitsbereich gilt für Hochformat 9:16.')});$('#ve-full').addEventListener('click',veFull);$('#ve-del').addEventListener('click',veDelete);$('#ve-fit').addEventListener('click',veFitZoom);
  $('#ve-zoom').addEventListener('input',e=>{VE.pxs=Math.exp(+e.target.value);veTimeline()});
  const st=$('#ve-stage');st.addEventListener('dragover',e=>{e.preventDefault()});st.addEventListener('drop',e=>{e.preventDefault();const fs=[...(e.dataTransfer&&e.dataTransfer.files||[])];if(fs.length)veImport(fs)});
  veStagePointer();veTLPointer();veTLExtras();vePlayUI();
  if(window.ResizeObserver)new ResizeObserver(()=>{veResize()}).observe(st);addEventListener('resize',()=>{if(view==='video'){veResize();veTimeline()}});
  document.addEventListener('keydown',e=>{if(view!=='video'||!VE.p||VE.busy)return;const t=e.target;if(t.closest&&t.closest('input,textarea,select'))return;const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
    if(e.key===' '){e.preventDefault();vePlay()}else if(mod&&k==='z'){e.preventDefault();veUndo(e.shiftKey?1:-1)}else if(mod&&k==='d'){e.preventDefault();veDuplicate()}else if(mod&&k==='c'){if(veCopy())e.preventDefault()}else if(mod&&k==='v'){if(vePaste())e.preventDefault()}else if(mod&&k==='b'||(!mod&&k==='s')){e.preventDefault();veSplit()}
    else if(e.key==='Delete'||e.key==='Backspace'){if(VE.sel){e.preventDefault();veDelete()}}else if(e.key==='ArrowLeft'){e.preventDefault();vePause();veGoto(VE.t-(e.shiftKey?1:1/(VE.p.fps||30)))}else if(e.key==='ArrowRight'){e.preventDefault();vePause();veGoto(VE.t+(e.shiftKey?1:1/(VE.p.fps||30)))}
    else if(e.key==='Escape'){if($('#ve-stage').classList.contains('ve-max')){veMax(false);return}VE.sel=null;veTimeline();veProps()}})}
async function veStart(){veBuild();if(!VE.p){const id=store.get('ve-cur',null);if(id&&store.get('ve:'+id,null))veOpen(id);else if(veIndex().length)veOpen(veIndex()[0].id)}
  if(!VE.running){VE.running=true;requestAnimationFrame(veLoop)}if(!VE.p)veHome(true);else{veAll();requestAnimationFrame(()=>{veResize();veTimeline()})}}
/* ---------- Minecraft-Figuren im Video ----------
   Eine kleine eigene 3D-Bühne (transparent) zeichnet die Figur; das Bild wird wie ein Sticker ins Video gesetzt.
   Bewegungen laufen in Schleife, Gesichter wie in der Animation. Keine Gegenstände in der Hand. */
const VE_MOVES=[['stand','Stehen'],['walk','Laufen'],['run','Rennen'],['wave','Winken'],['jump','Springen'],['cheer','Jubeln'],['look','Umschauen'],['hit','Zuschlagen'],['dance','Tanzen']];
const VE_DANCE=[[0,{armL:[0,0,150],armR:[0,0,-20],legR:[-10,0,0],body:[0,0,6],head:[0,0,-8]}],[.3,{armR:[0,0,-150],armL:[0,0,20],legL:[-10,0,0],body:[0,0,-6],head:[0,0,8]}],[.6,{armL:[0,0,150],armR:[0,0,-20],legR:[-10,0,0],body:[0,0,6],head:[0,0,-8]}]];
let veCR=null;const veSkins=new Map();
function veCharRenderer(){if(veCR)return veCR;const T=THREE;const cv=document.createElement('canvas');cv.width=360;cv.height=540;
  const r=new T.WebGLRenderer({canvas:cv,alpha:true,antialias:true,preserveDrawingBuffer:true});r.setClearColor(0x000000,0);r.outputEncoding=T.sRGBEncoding;
  const sc=new T.Scene();sc.add(new T.HemisphereLight(0xffffff,0x8a7a66,.9));const d=new T.DirectionalLight(0xffffff,.7);d.position.set(40,70,90);sc.add(d);
  const cam=new T.PerspectiveCamera(28,2/3,1,1000);cam.position.set(0,20,100);cam.lookAt(0,20,0);veCR={cv,r,sc,cam,models:new Map()};return veCR}
function veSkinCanvas(c){if(c.skin){let e=veSkins.get(c.skin);if(!e){e={c:null};veSkins.set(c.skin,e);loadImage(c.skin).then(im=>{const k=mk(64,im.naturalHeight===32?32:64);k.getContext('2d').drawImage(im,0,0);e.c=k}).catch(()=>{})}return e.c}
  return(typeof PRESET_SKINS!=='undefined'&&PRESET_SKINS[c.preset||0])||GRAY_SKIN}
function veCharPose(c,lt){const base=anClone((POSES[c.pose]||POSES.stehen)[1]);let y=(POSES[c.pose]||POSES.stehen)[2]||0;const mv=c.move||'stand';
  if(mv==='stand'){const b=Math.sin(lt*2*Math.PI/3)*2;base.armR=[(base.armR||[0,0,0])[0],(base.armR||[0,0,0])[1],(base.armR||[0,0,-4])[2]-b];base.armL=[(base.armL||[0,0,0])[0],(base.armL||[0,0,0])[1],(base.armL||[0,0,4])[2]+b];return{pose:base,y}}
  if(mv==='walk'||mv==='run'){const run=mv==='run',P=run?.45:.7,A=run?55:30,s=Math.sin(lt*2*Math.PI/P)*A,p={legR:[s,0,0],legL:[-s,0,0],legRLow:[Math.max(0,-s)*.9+(run?15:4),0,0],legLLow:[Math.max(0,s)*.9+(run?15:4),0,0],armR:[-s*1.1,0,-4],armL:[s*1.1,0,4],armRLow:[run?-60:-12,0,0],armLLow:[run?-60:-12,0,0]};
    if(run){p.body=[12,0,0];p.head=[-12,0,0]}return{pose:p,y:Math.abs(Math.sin(lt*2*Math.PI/P))*(run?1.6:.7)}}
  const steps=mv==='dance'?VE_DANCE:((AN_MOVES.find(m=>m[0]===mv)||[])[2]);if(!steps)return{pose:base,y};const last=steps[steps.length-1][0]+.35,tt=lt%last;
  const st=s=>({pose:typeof s[1]==='string'?anPose(s[1]):anClone(s[1]),y:s[2]||0});let i=0;while(i<steps.length-2&&tt>=steps[i+1][0])i++;const a=st(steps[i]),b=st(steps[Math.min(i+1,steps.length-1)]),t0=steps[i][0],t1=steps[Math.min(i+1,steps.length-1)][0];
  const u=t1>t0?clamp((tt-t0)/(t1-t0),0,1):1,e=u*u*(3-2*u),pose={};for(const k of new Set([...Object.keys(a.pose),...Object.keys(b.pose)])){const r0=a.pose[k]||[0,0,0],r1=b.pose[k]||[0,0,0];pose[k]=[0,1,2].map(j=>r0[j]+(r1[j]-r0[j])*e)}
  return{pose,y:a.y+(b.y-a.y)*e}}
function veCharModel(c){const R=veCharRenderer(),sk=veSkinCanvas(c);if(!sk)return null;const key=[c.skin?c.skin.length+c.skin.slice(-30):'p'+(c.preset||0),!!c.slim,packTick].join('|');let e=R.models.get(c.id);
  if(e&&e.key===key)return e;if(e){R.sc.remove(e.m.group);anDispose(e.m.group)}const m={id:c.id,slim:!!c.slim,item:'',size:{},pose:{},rootY:0,x:0,z:0,ry:0};m.group=buildRig(m,sk);m.group.visible=false;R.sc.add(m.group);e={m,key,sk,face:null,fmesh:null};R.models.set(c.id,e);return e}
function veCharFace(e,c){const f=c.face||'normal';if(e.face===f)return;e.face=f;const head=e.m.bones.head;if(e.fmesh){head.remove(e.fmesh);e.fmesh.geometry.dispose();if(e.fmesh.material.map)e.fmesh.material.map.dispose();e.fmesh.material.dispose();e.fmesh=null}
  const cv=anFaceCanvas(e.sk,f,c);if(!cv)return;const T=THREE,tex=new T.CanvasTexture(cv);tex.magFilter=T.NearestFilter;tex.minFilter=T.NearestFilter;tex.generateMipmaps=false;tex.encoding=T.sRGBEncoding;
  const me=new T.Mesh(new T.PlaneGeometry(8,8),new T.MeshLambertMaterial({map:tex,alphaTest:.5,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));me.position.set(0,4,4.02);head.add(me);e.fmesh=me}
function veCharFrame(c,t){if(!window.THREE||typeof buildRig!=='function')return null;let e;try{e=veCharModel(c)}catch{return null}if(!e)return null;const R=veCR,lt=Math.max(0,t-c._s),P=veCharPose(c,lt);
  veCharFace(e,c);e.m.pose=P.pose;e.m.rootY=P.y;e.m.ry=c.yaw||0;applyPose(e.m);for(const x of R.models.values())x.m.group.visible=x===e;R.r.render(R.sc,R.cam);e.m.group.visible=false;return R.cv}
function veAddChar(o){const P=VE.p;veLayout();const c={id:'c'+uid(),type:'char',name:o.name||'Figur',skin:o.skin||'',slim:!!o.slim,preset:o.preset||0,move:'stand',pose:'stehen',face:'normal',yaw:-20,in:0,out:4,speed:1,start:VE.t,lane:0,x:.5,y:.62,s:1,r:0,o:1,ain:'pop',aout:'none',keys:[],adj:{b:0,c:0,s:0,w:0}};
  c.lane=veFreeLane(P.over,c);P.over.push(c);VE.sel=c.id;VE.tab='char';veCommit();veAll();toast(c.name+' ist im Video. Wähle rechts eine Bewegung.')}
function veLibChar(box){const sub=t=>box.append(Object.assign(document.createElement('p'),{className:'sub',textContent:t}));
  sub('Minecraft-Figuren direkt im Video: mit Skin, Bewegung, Pose und Gesicht. Mit Schlüsselbildern laufen sie durchs Bild.');
  if(window.RK_LOCAL){const f=document.createElement('form');f.className='btnrow';f.innerHTML='<input type="text" maxlength="16" placeholder="Ingame-Name, z. B. Notch" aria-label="Ingame-Name" autocomplete="off" spellcheck="false" class="ve-in"><button class="btn primary sm" type="submit">Hinzufügen</button>';
    f.addEventListener('submit',async e=>{e.preventDefault();const n=f.querySelector('input').value.trim();if(!n)return;const b=f.querySelector('button');b.disabled=true;try{const r=await fetchSkinByName(n);veAddChar({name:n,skin:r.data,slim:r.slim})}catch(err){toast(err&&err.message||'Skin nicht gefunden.')}finally{b.disabled=false}});box.append(f)}
  {const r=document.createElement('div');r.className='btnrow';vBtn(r,'Skin-Datei (PNG)',()=>{const i=document.createElement('input');i.type='file';i.accept='image/png';i.onchange=async()=>{const fl=i.files[0];if(!fl)return;try{const d=await blobToDataURL(fl),im=await loadImage(d);if(im.naturalWidth!==64||![64,32].includes(im.naturalHeight))throw new Error('Der Skin muss 64×64 oder 64×32 Pixel groß sein.');veAddChar({name:fl.name.replace(/\.png$/i,'').slice(0,30),skin:d})}catch(err){toast(err&&err.message||'Der Skin konnte nicht gelesen werden.')}};i.click()});box.append(r)}
  const h=document.createElement('h4');h.className='ve-h4';h.textContent='Beispiele';box.append(h);const g=document.createElement('div');g.className='ve-mgrid small';
  (typeof PRESETS!=='undefined'?PRESETS:[]).forEach((p,i)=>{const b=document.createElement('button');b.type='button';b.className='ve-mpv ve-skin';b.title=p.name;b.setAttribute('aria-label',p.name+' hinzufügen');const c=mk(48,48),x=c.getContext('2d');x.imageSmoothingEnabled=false;const sk=PRESET_SKINS&&PRESET_SKINS[i];if(sk)x.drawImage(sk,8,8,8,8,0,0,48,48);b.append(c);const s=document.createElement('span');s.textContent=p.name;b.append(s);b.addEventListener('click',()=>veAddChar({name:p.name,preset:i}));g.append(b)});box.append(g);
  const used=[...new Map(VE.p.over.filter(c=>c.type==='char'&&c.skin).map(c=>[c.skin,c])).values()];if(used.length){const h2=document.createElement('h4');h2.className='ve-h4';h2.textContent='In diesem Video';box.append(h2);const g2=document.createElement('div');g2.className='ve-mgrid small';
    for(const u of used){const b=document.createElement('button');b.type='button';b.className='ve-mpv ve-skin';b.title=u.name;const c=mk(48,48),x=c.getContext('2d');x.imageSmoothingEnabled=false;const sk=veSkinCanvas(u);if(sk)x.drawImage(sk,8,8,8,8,0,0,48,48);b.append(c);const s=document.createElement('span');s.textContent=u.name;b.append(s);b.addEventListener('click',()=>veAddChar({name:u.name,skin:u.skin,slim:u.slim}));g2.append(b)}box.append(g2)}}
function veCharProps(P,c){let s=vSec(P,'Bewegung der Figur');const g=document.createElement('div');g.className='ve-filters three';
  for(const[k,n]of VE_MOVES){const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent=n;b.setAttribute('aria-pressed',(c.move||'stand')===k);b.addEventListener('click',()=>{c.move=k;veCommit();veProps()});g.append(b)}s.append(g);
  if((c.move||'stand')==='stand')vSelect(s,'Pose',Object.entries(POSES).map(([k,v])=>[k,v[0]]),()=>c.pose||'stehen',v=>{c.pose=v});
  vRange(s,'Drehen',-180,180,1,()=>c.yaw||0,v=>{c.yaw=v},v=>v+'°');{const r=document.createElement('div');r.className='btnrow';for(const[l,v]of[['Vorne',0],['Schräg',-30],['Seite',-90],['Hinten',180]])vBtn(r,l,()=>{c.yaw=v;veCommit();veProps()});s.append(r)}
  s=vSec(P,'Gesicht','Für ein anderes Gesicht später: Clip am Zeitregler teilen und dort ein neues wählen.');const fg=document.createElement('div');fg.className='ve-filters three';
  for(const[k,[n]]of Object.entries(AN_EXPR)){const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent=n;b.setAttribute('aria-pressed',(c.face||'normal')===k);b.addEventListener('click',()=>{c.face=k;veCommit();veProps()});fg.append(b)}s.append(fg);
  s=vSec(P,'Skin');vSeg(s,'Arme',[['0','Klassisch'],['1','Schmal']],()=>c.slim?'1':'0',v=>{c.slim=v==='1'});
  if(window.RK_LOCAL){const f=document.createElement('form');f.className='btnrow';f.innerHTML='<input type="text" maxlength="16" aria-label="Ingame-Name" autocomplete="off" spellcheck="false" class="ve-in"><button class="btn sm" type="submit">Skin laden</button>';f.querySelector('input').value=c.name||'';
    f.addEventListener('submit',async e=>{e.preventDefault();const n=f.querySelector('input').value.trim();if(!n)return;try{const r=await fetchSkinByName(n);c.skin=r.data;c.slim=r.slim;c.name=n;veCommit();veAll();toast('Skin von '+n+' geladen.')}catch(err){toast(err&&err.message||'Skin nicht gefunden.')}});s.append(f)}}
/* ---------- Eigene Animationen und Designs einfügen ---------- */
function veLibProj(box){const sub=t=>box.append(Object.assign(document.createElement('p'),{className:'sub',textContent:t}));
  let h=document.createElement('h4');h.className='ve-h4';h.textContent='Deine Animationen';box.append(h);
  const ai=(typeof anIndex==='function'?anIndex():[]).sort((a,b)=>b.t-a.t);if(!ai.length)sub('Noch keine Animationen. Bau eine im Bereich „Animation“.');
  else{sub('Antippen: Die Animation wird als Video gerendert und eingefügt.');const g=document.createElement('div');g.className='ve-mgrid';for(const p of ai){const t=document.createElement('div');t.className='ve-mt';const b=document.createElement('button');b.type='button';b.className='ve-mpv';b.setAttribute('aria-label',p.name+' einfügen');
      if(p.preview&&/^data:image\/jpeg;base64,/.test(p.preview)){const im=document.createElement('img');im.alt='';im.src=p.preview;b.append(im)}b.addEventListener('click',()=>veInsertAnim(p.id));t.append(b);const nm=document.createElement('div');nm.className='ve-mrow';const sp=document.createElement('span');sp.textContent=p.name;nm.append(sp);t.append(nm);g.append(t)}box.append(g)}
  h=document.createElement('h4');h.className='ve-h4';h.textContent='Deine Thumbnails und Designs';box.append(h);
  const ds=(typeof PROJECTS!=='undefined'?[...PROJECTS.values()]:[]).filter(p=>p&&Array.isArray(p.layers)).sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));if(!ds.length)sub('Noch keine Designs. Gestalte eins im Bereich „Thumbnails“.');
  else{sub('Antippen fügt das Design als Bild ein (Präsentationen: jede Folie).');const g=document.createElement('div');g.className='ve-mgrid';for(const p of ds){const t=document.createElement('div');t.className='ve-mt';const b=document.createElement('button');b.type='button';b.className='ve-mpv';b.setAttribute('aria-label',(p.name||'Design')+' einfügen');
      if(p.preview&&/^data:image\//.test(p.preview)){const im=document.createElement('img');im.alt='';im.src=p.preview;b.append(im)}b.addEventListener('click',()=>veInsertDesign(p));t.append(b);const nm=document.createElement('div');nm.className='ve-mrow';const sp=document.createElement('span');sp.textContent=p.name||'Design';nm.append(sp);
      const ob=document.createElement('button');ob.type='button';ob.className='btn ghost sm';ob.textContent='Overlay';ob.title='Über dem Hauptvideo einfügen';ob.addEventListener('click',()=>veInsertDesign(p,'over'));nm.append(ob);t.append(nm);g.append(t)}box.append(g)}}
async function veInsertAnim(pid){if(VE.busy)return;if(typeof anRenderProjectBlob!=='function'){toast('Die 3D-Ansicht ist nicht bereit.');return}vePause();VE.busy=true;const ui=veRecUI('Animation wird gerendert');let r=null;
  try{r=await anRenderProjectBlob(pid,ui)}catch(e){toast(e&&e.message==='no_codec'?'Dieser Browser kann hier keine Videos erstellen. Nimm ein aktuelles Chrome, Edge oder Safari.':'Die Animation konnte nicht gerendert werden.')}
  VE.busy=false;$('#ve-ov').hidden=true;if(!r||!r.blob){if(r&&!r.blob)toast('Abgebrochen.');return}
  await veImport([new File([r.blob],(r.name||'Animation')+'.mp4',{type:'video/mp4'})],{name:r.name})}
async function veInsertDesign(d,as){if(VE.busy)return;const slides=Array.isArray(d.slides)&&d.slides.length?d.slides.map(s=>s.layers):[d.layers];const files=[];
  try{for(let i=0;i<slides.length;i++){const ls=slides[i]||[];await Promise.all(ls.map(L=>{const u=L.type==='image'||L.mode==='image'?srcUrl(L.src):'';const e=u?getImg(u):null;return e?e.p:null}));
      const c=mk(d.w,d.h),x=c.getContext('2d');for(const L of ls)drawLayer(x,L,1,d.w,d.h);const b=await canvasBlob(c,'image/png');files.push(new File([b],(d.name||'Design')+(slides.length>1?' '+(i+1):'')+'.png',{type:'image/png'}))}}
  catch{toast('Das Design konnte nicht gezeichnet werden.');return}
  await veImport(files,{as:as==='over'?'over':'end'})}

/* ---------- Effekte, Audio, Standbild, Sicherheitsbereich, Vollbild ---------- */
function veAddFx(kind,at){const P=VE.p;veLayout();const d=VE_FX.find(f=>f[0]===kind);if(!d)return;const c={id:'c'+uid(),type:'fx',kind,name:d[1],in:0,out:d[3],speed:1,start:at??VE.t,lane:0,amt:1,keys:[],x:.5,y:.5,s:1,r:0,o:1,adj:{b:0,c:0,s:0,w:0}};
  c.lane=veFreeLane(P.fx,c);P.fx.push(c);VE.sel=c.id;veCommit();veAll()}
function veLibFx(box){box.append(Object.assign(document.createElement('p'),{className:'sub',textContent:'Effekte wirken auf das ganze Bild. Antippen setzt sie an den Zeitregler, die Länge ziehst du in der Zeitleiste.'}));
  const g=document.createElement('div');g.className='ve-fxgrid';for(const[k,n,ic]of VE_FX){const b=document.createElement('button');b.type='button';b.className='ve-fxb';b.innerHTML='<span class="ic"></span><span class="nm"></span>';b.querySelector('.ic').textContent=ic;b.querySelector('.nm').textContent=n;
    b.addEventListener('click',()=>veAddFx(k));b.draggable=true;b.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain','ve-fx:'+k)});g.append(b)}box.append(g)}
const VE_SFX=[['whoosh','Whoosh'],['riser','Aufsteigen'],['pop','Pop'],['ding','Ding'],['boom','Bass-Boom'],['click','Klick'],['coin','Bling'],['buzz','Fehler'],['heart','Herzschlag'],['drum','Trommelwirbel']];
const veSfxCache=new Map();
async function veSfxBuf(k){if(veSfxCache.has(k))return veSfxCache.get(k);const sr=44100,len={whoosh:.8,riser:1.5,pop:.25,ding:1.5,boom:1.7,click:.08,coin:.55,buzz:.55,heart:1.1,drum:1.7}[k],C=window.OfflineAudioContext||window.webkitOfflineAudioContext,oc=new C(2,Math.ceil(sr*len),sr);
  const out=oc.createGain();out.gain.value=.9;out.connect(oc.destination);
  const noise=()=>{const b=oc.createBuffer(1,Math.ceil(sr*len),sr),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;const n=oc.createBufferSource();n.buffer=b;return n};
  const gain=(pts,exp)=>{const g=oc.createGain();g.gain.setValueAtTime(pts[0][1],pts[0][0]);for(const[t,v]of pts.slice(1)){if(exp)g.gain.exponentialRampToValueAtTime(Math.max(.0001,v),t);else g.gain.linearRampToValueAtTime(v,t)}g.connect(out);return g};
  const osc=(type,f0,f1,t1,dest,start=0,stop=len)=>{const o=oc.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,start);if(f1)o.frequency.exponentialRampToValueAtTime(f1,t1);o.connect(dest);o.start(start);o.stop(stop);return o};
  if(k==='whoosh'){const n=noise(),f=oc.createBiquadFilter();f.type='bandpass';f.Q.value=1.4;f.frequency.setValueAtTime(300,0);f.frequency.exponentialRampToValueAtTime(2600,.35);f.frequency.exponentialRampToValueAtTime(500,len);n.connect(f);f.connect(gain([[0,0],[.32,1],[len,0]]));n.start()}
  else if(k==='riser'){const n=noise(),f=oc.createBiquadFilter();f.type='highpass';f.frequency.setValueAtTime(200,0);f.frequency.exponentialRampToValueAtTime(5000,len);n.connect(f);f.connect(gain([[0,0],[len*.92,.7],[len,0]]));n.start();osc('sine',180,900,len,gain([[0,0],[len*.92,.22],[len,0]]))}
  else if(k==='pop'){osc('sine',760,110,.14,gain([[0,0],[.005,1],[.18,0]]))}
  else if(k==='ding'){const g=gain([[0,.0001],[.01,.7],[len,.0005]],true);osc('sine',1318,0,0,g);const g2=gain([[0,.0001],[.01,.22],[len*.6,.0005]],true);osc('sine',2637,0,0,g2)}
  else if(k==='boom'){const ws=oc.createWaveShaper(),cv=new Float32Array(1024);for(let i=0;i<1024;i++){const x=i/511.5-1;cv[i]=Math.tanh(x*3)}ws.curve=cv;ws.connect(gain([[0,.0001],[.01,1],[len,.0005]],true));osc('sine',95,32,1.3,ws)}
  else if(k==='click'){const n=noise(),f=oc.createBiquadFilter();f.type='highpass';f.frequency.value=2500;n.connect(f);f.connect(gain([[0,1],[.04,0]]));n.start()}
  else if(k==='coin'){const f=oc.createBiquadFilter();f.type='lowpass';f.frequency.value=5000;f.connect(gain([[0,.0001],[.005,.35],[len,.0005]],true));osc('square',1047,0,0,f,0,.08);osc('square',1568,0,0,f,.08,len)}
  else if(k==='buzz'){const g=gain([[0,0],[.02,.35],[len-.05,.35],[len,0]]);osc('sawtooth',110,0,0,g);osc('sawtooth',117,0,0,g)}
  else if(k==='heart'){for(const t0 of[0,.28]){const g=oc.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(1,t0+.01);g.gain.exponentialRampToValueAtTime(.0005,t0+.22);g.connect(out);osc('sine',70,40,t0+.2,g,t0,t0+.25)}}
  else if(k==='drum'){const n=noise(),f=oc.createBiquadFilter();f.type='bandpass';f.frequency.value=1800;f.Q.value=.8;n.connect(f);const g=oc.createGain();g.gain.setValueAtTime(0,0);for(let t0=0;t0<len-.3;t0+=.045){const v=.15+.6*(t0/len);g.gain.setValueAtTime(v,t0);g.gain.linearRampToValueAtTime(.02,t0+.035)}g.gain.setValueAtTime(1,len-.3);g.gain.exponentialRampToValueAtTime(.001,len);f.connect(g);g.connect(out);n.start()}
  const buf=await oc.startRendering();veSfxCache.set(k,buf);return buf}
async function veAddSfx(k,n){let m=(VE.p.media||[]).find(x=>x.sfx===k);if(m){veAddClip(m,'audio');veCommit();veAll();return}
  try{const buf=await veSfxBuf(k),b=anWav(buf,0,buf.duration);const t0=VE.t;await veImport([new File([b],n+'.wav',{type:'audio/wav'})],{});const mm=VE.p.media[VE.p.media.length-1];if(mm&&mm.name===n){mm.sfx=k;veCommit()}VE.t=t0}catch{toast('Der Sound konnte nicht erzeugt werden.')}}
async function veSfxPlay(k){try{const buf=await veSfxBuf(k),ctx=anACtx();ctx.resume();const s=ctx.createBufferSource();s.buffer=buf;s.connect(ctx.destination);s.start()}catch{}}
async function veVoice(){if(VE.rec){try{VE.rec.stop()}catch{}return}
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){toast('Aufnehmen geht in diesem Browser nicht.');return}
  let st;try{st=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}})}catch{toast('Kein Zugriff aufs Mikrofon. Erlaube es in den Browser-Einstellungen.');return}
  const t0=VE.t,mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(m=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(m))||'',rec=new MediaRecorder(st,mime?{mimeType:mime}:{}),ch=[];
  rec.ondataavailable=e=>{if(e.data&&e.data.size)ch.push(e.data)};
  rec.onstop=async()=>{st.getTracks().forEach(x=>x.stop());VE.rec=null;VE.recMute=false;vePause();veLib();const type=(rec.mimeType||mime||'audio/webm').split(';')[0],b=new Blob(ch,{type});if(b.size<400){toast('Die Aufnahme war leer.');return}
    VE.t=t0;await veImport([new File([b],'Sprachaufnahme.'+(type.includes('mp4')?'m4a':'webm'),{type})],{});toast('Sprachaufnahme eingefügt.')};
  VE.rec=rec;VE.recMute=true;rec.start(250);if(!VE.playing&&veDur()>0)vePlay();veLib()}
function veLibAudio(box){const sub=t=>box.append(Object.assign(document.createElement('p'),{className:'sub',textContent:t}));
  let h=document.createElement('h4');h.className='ve-h4';h.textContent='Sprachaufnahme';box.append(h);
  sub(VE.rec?'Läuft … Das Video spielt stumm mit. Tippe auf Stopp, wenn du fertig bist.':'Sprich über dein Video, ab der Stelle des Zeitreglers.');
  {const r=document.createElement('div');r.className='btnrow';const b=vBtn(r,VE.rec?'■ Stopp':'● Aufnehmen',veVoice,'btn '+(VE.rec?'danger':'primary'));b.classList.toggle('ve-recbtn',!!VE.rec);box.append(r)}
  h=document.createElement('h4');h.className='ve-h4';h.textContent='Soundeffekte';box.append(h);sub('Antippen setzt den Sound an den Zeitregler. ▶ spielt ihn vorher ab.');
  const g=document.createElement('div');g.className='ve-sfx';for(const[k,n]of VE_SFX){const row=document.createElement('div');row.className='ve-sfxrow';const pl=document.createElement('button');pl.type='button';pl.className='btn ghost sm icon';pl.textContent='▶';pl.setAttribute('aria-label',n+' anhören');pl.addEventListener('click',()=>veSfxPlay(k));
    const ad=document.createElement('button');ad.type='button';ad.className='btn sm';ad.textContent=n;ad.addEventListener('click',()=>veAddSfx(k,n));row.append(pl,ad);g.append(row)}box.append(g);
  h=document.createElement('h4');h.className='ve-h4';h.textContent='Musik und eigene Töne';box.append(h);{const r=document.createElement('div');r.className='btnrow';vBtn(r,'+ Ton importieren',()=>$('#ve-file').click());box.append(r)}}
async function veFreeze(){const c=veFind(VE.sel);veLayout();if(!c||c.type!=='video'||!veActive(c,VE.t)){toast('Stell den Zeitregler auf das Video.');return}if(!ASSETS){toast('Speichern ist in dieser Ansicht nicht möglich.');return}
  let v=VE.els.get(c.id),tmp=null;if(!v||!v.videoWidth){tmp=document.createElement('video');tmp.muted=true;tmp.playsInline=true;tmp.preload='auto';veHid().append(tmp);tmp.src=await veUrl(c.asset);await new Promise(ok=>{tmp.onloadeddata=ok;tmp.onerror=ok;setTimeout(ok,8000)});v=tmp}
  if(!v.videoWidth){if(tmp)tmp.remove();toast('Das Standbild konnte nicht gespeichert werden.');return}await veSeek(v,veSrcT(c,VE.t));const cv=mk(v.videoWidth,v.videoHeight);cv.getContext('2d').drawImage(v,0,0);if(tmp){tmp.removeAttribute('src');tmp.remove()}let up;try{up=await ASSETS.upload(await canvasBlob(cv,'image/png'))}catch{toast('Das Standbild konnte nicht gespeichert werden.');return}
  const m={asset:up.id,name:(c.name||'Video')+' (Standbild)',kind:'image',w:cv.width,h:cv.height,dur:0};VE.p.media.push(m);VE.imgs.delete(up.id);const t=VE.t,list=veListOf(c);
  const img=veNewClip(m,{out:2,fit:c.fit,x:c.x,y:c.y,s:c.s,r:c.r,o:c.o,flip:c.flip,filt:c.filt,adj:{...(c.adj||{})},crop:c.crop?{...c.crop}:undefined,key:c.key?{...c.key}:undefined,blend:c.blend});
  if(list===VE.p.main){if(t>c._s+.04&&t<c._s+veL(c)-.04){VE.sel=c.id;veSplit()}veLayout();let i=VE.p.main.findIndex(x=>Math.abs(x._s+veL(x)-t)<.03);if(i<0)i=VE.p.main.indexOf(c);VE.p.main.splice(i+1,0,img)}
  else{img.start=t;img.lane=veFreeLane(list,img,c.lane);VE.p.over.push(img)}VE.sel=img.id;veCommit();veAll();toast('Standbild eingefügt (2 s).')}
function veSafe(x,cv){if(VE.p.fmt!=='9:16')return;const W=cv.width,H=cv.height,f=Math.max(1,W/400);x.save();x.fillStyle='rgba(255,60,60,.18)';x.strokeStyle='rgba(255,90,90,.85)';x.lineWidth=1.5*f;x.setLineDash([6*f,4*f]);
  for(const[a,b,c,d]of[[.84,.38,.16,.48],[0,.8,.82,.2],[0,0,1,.08]]){x.fillRect(a*W,b*H,c*W,d*H);x.strokeRect(a*W,b*H,c*W,d*H)}x.setLineDash([]);x.fillStyle='rgba(255,255,255,.85)';x.font=`600 ${11*f}px Inter,sans-serif`;x.fillText(tr('Knöpfe'),.85*W,.37*H);x.fillText(tr('Beschreibung'),.02*W,.79*H);x.restore()}
function veFull(){const st=$('#ve-stage');if(document.fullscreenElement){document.exitFullscreen().catch(()=>{});return}
  if(st.requestFullscreen&&!/iPhone/.test(navigator.userAgent)){st.requestFullscreen().then(()=>setTimeout(veResize,100)).catch(()=>veMax(true));return}veMax(!st.classList.contains('ve-max'))}
function veMax(on){const st=$('#ve-stage');st.classList.toggle('ve-max',on);let b=st.querySelector('.ve-maxx');if(on&&!b){b=document.createElement('button');b.type='button';b.className='btn ve-maxx';b.textContent='✕';b.setAttribute('aria-label','Vollbild beenden');b.addEventListener('click',()=>veMax(false));st.append(b)}else if(!on&&b)b.remove();setTimeout(veResize,50)}
document.addEventListener('fullscreenchange',()=>setTimeout(veResize,80));
/* ---------- Kopieren, Einfügen, Menü, Ziehen aus der Mediathek, Zoomen mit zwei Fingern ---------- */
function veCopy(){const c=veFind(VE.sel);if(!c)return false;const P=VE.p;VE.clipb={c:JSON.parse(JSON.stringify(c)),k:P.main.includes(c)?'main':P.over.includes(c)?'over':P.fx.includes(c)?'fx':'audio'};toast('Kopiert.');return true}
function vePaste(){const cb=VE.clipb;if(!cb||!VE.p)return false;veLayout();const P=VE.p,d={...JSON.parse(JSON.stringify(cb.c)),id:'c'+uid()};
  if(cb.k==='main'){const cur=P.main.find(x=>veActive(x,VE.t));P.main.splice(cur?P.main.indexOf(cur)+1:P.main.length,0,d)}else{d.start=VE.t;const list=P[cb.k];d.lane=veFreeLane(list,d,d.lane);list.push(d)}VE.sel=d.id;veCommit();veAll();toast('Eingefügt.');return true}
function veClipMenu(el,c){VE.sel=c.id;veTimeline();veProps();const tgt=document.querySelector(`.ve-clip[data-id="${c.id}"]`)||el;
  showMenu(tgt,[['Teilen',veSplit,'S'],['Duplizieren',veDuplicate,'⌘D'],['Kopieren',veCopy,'⌘C'],['Einfügen',vePaste,'⌘V',()=>!!VE.clipb],null,
    ...(c.type==='video'?[['Ton abtrennen',veDetachAudio],['Standbild',veFreeze]]:[]),...(veIsVis(c)&&c.type!=='fx'?[['◆ Schlüsselbild setzen',()=>veAddKey(c)]]:[]),null,['Löschen',veDelete,'Entf']])}
function veTLExtras(){const sc=$('#ve-scroll');let lp=null;
  sc.addEventListener('contextmenu',e=>{const el=e.target.closest('.ve-clip');if(!el)return;e.preventDefault();const c=veFind(el.dataset.id);if(c)veClipMenu(el,c)});
  sc.addEventListener('pointerdown',e=>{clearTimeout(lp&&lp.t);lp=null;if(e.pointerType!=='touch')return;const el=e.target.closest('.ve-clip');if(!el)return;lp={x:e.clientX,y:e.clientY,t:setTimeout(()=>{const c=veFind(el.dataset.id);if(c)veClipMenu(el,c);lp=null},550)}},true);
  sc.addEventListener('pointermove',e=>{if(lp&&Math.hypot(e.clientX-lp.x,e.clientY-lp.y)>8){clearTimeout(lp.t);lp=null}},true);
  const endLp=()=>{if(lp){clearTimeout(lp.t);lp=null}};sc.addEventListener('pointerup',endLp,true);sc.addEventListener('pointercancel',endLp,true);
  sc.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'});
  sc.addEventListener('drop',e=>{e.preventDefault();const dt=e.dataTransfer;if(dt.files&&dt.files.length){veImport([...dt.files]);return}const v=dt.getData('text/plain')||'';const r=$('#ve-tin').getBoundingClientRect(),t=Math.max(0,(e.clientX-r.left-VE_PAD)/VE.pxs),y=e.clientY-r.top,{rows}=veRows(),row=rows.find(q=>y>=q.y&&y<q.y+q.h+4);
    if(v.startsWith('ve-fx:')){veAddFx(v.slice(6),t);return}if(!v.startsWith('ve-asset:'))return;const m=veMedia(v.slice(9));if(!m)return;const P=VE.p;veLayout();
    if(m.kind==='audio'||(row&&row.kind==='audio')){if(m.kind!=='audio')return;const c=veNewClip(m,{type:'audio',start:t});c.lane=veFreeLane(P.audio,c,row&&row.kind==='audio'?row.lane:0);P.audio.push(c);VE.sel=c.id}
    else if(row&&row.kind==='over'){const c=veNewClip(m,{start:t,s:.5});c.lane=veFreeLane(P.over,c,row.lane);P.over.push(c);VE.sel=c.id}
    else{const c=veNewClip(m);let i=0;for(const x of P.main)if(x._s+veL(x)/2<t)i++;P.main.splice(i,0,c);VE.sel=c.id}veCommit();veAll()});
  let pz=null;sc.addEventListener('touchstart',e=>{if(e.touches.length===2){const[a,b]=e.touches;pz={d:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY),p:VE.pxs}}},{passive:true});
  sc.addEventListener('touchmove',e=>{if(!pz||e.touches.length!==2)return;e.preventDefault();const[a,b]=e.touches,d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);VE.pxs=clamp(pz.p*d/Math.max(10,pz.d),8,400);const z=$('#ve-zoom');if(z)z.value=Math.log(VE.pxs);if(!pz.raf)pz.raf=requestAnimationFrame(()=>{if(pz)pz.raf=0;veTimeline()})},{passive:false});
  sc.addEventListener('touchend',e=>{if(e.touches.length<2)pz=null})}
/* ---------- GIFs (GIPHY und eigene) ---------- */
async function veAddGifBlob(blob,name,meta){if(!ASSETS){toast('Speichern ist in dieser Ansicht nicht möglich.');return}const u8=new Uint8Array(await blob.arrayBuffer());if(!gifIs(u8)){toast('Das ist kein GIF.');return}
  const G=gifParse(u8),up=await ASSETS.upload(new Blob([u8],{type:'image/gif'})),P=VE.p;const m={asset:up.id,name:String(name||'GIF').slice(0,40),kind:'image',w:G.W,h:G.H,dur:0,anim:G.fr.length>1,gdur:G.fr.reduce((a,x)=>a+(x.delay<=1?10:x.delay)/100,0),...(meta||{})};
  P.media.push(m);vePrepMedia(m);const c=veAddClip(m,P.main.length?'over':'main');if(!VE.p.main.includes(c)){c.s=.55;c.out=Math.max(2,Math.min(6,m.gdur*Math.ceil(2/Math.max(.2,m.gdur))))}veCommit();veAll();toast('GIF eingefügt.')}
function veLibGif(box){const sub=t=>box.append(Object.assign(document.createElement('p'),{className:'sub',textContent:t}));const key=giphyKey();
  {const r=document.createElement('div');r.className='btnrow';vBtn(r,'+ GIF von deinem Gerät',()=>{const i=document.createElement('input');i.type='file';i.accept='image/gif,.gif';i.addEventListener('change',()=>{const f=i.files[0];if(f)veAddGifBlob(f,f.name.replace(/\.gif$/i,''))});i.click()});box.append(r)}
  if(!key){const card=document.createElement('div');card.className='ve-card';card.innerHTML=`<b>GIFs von GIPHY suchen</b><p class="sub">Dafür brauchst du einmal einen kostenlosen Schlüssel von GIPHY:</p><ol class="ve-steps"><li>Anmelden auf: <a href="https://developers.giphy.com/dashboard/" target="_blank" rel="noopener">developers.giphy.com</a></li><li>„Create an API Key“ antippen und „API“ wählen.</li><li>Den Schlüssel kopieren und hier einfügen.</li></ol><form class="btnrow"><input class="ve-in" type="text" autocomplete="off" spellcheck="false" placeholder="GIPHY-Schlüssel" aria-label="GIPHY-Schlüssel"><button class="btn sm primary" type="submit">Speichern</button></form>`;
    card.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const v=card.querySelector('input').value.trim();if(v.length<10){toast('Der Schlüssel ist zu kurz.');return}store.set('rn-giphy-key',v);VE.gres=null;veLib()});box.append(card);return}
  const f=document.createElement('form');f.className='ve-gsearch';f.innerHTML='<input type="search" class="an-search" placeholder="GIPHY durchsuchen" aria-label="GIPHY durchsuchen">';const q=f.querySelector('input');q.value=VE.gq||'';box.append(f);
  const seg=document.createElement('div');seg.className='seg';for(const[k,n]of[['g','GIFs'],['s','Sticker']]){const b=document.createElement('button');b.type='button';b.textContent=n;b.setAttribute('aria-pressed',(VE.gkind||'g')===k);b.addEventListener('click',()=>{VE.gkind=k;VE.gres=null;veLib()});seg.append(b)}box.append(seg);
  const grid=document.createElement('div');grid.className='ve-gifs';box.append(grid);const more=document.createElement('div');more.className='btnrow';box.append(more);
  const foot=document.createElement('p');foot.className='sub ve-gfoot';foot.innerHTML='<span>Powered by GIPHY</span>';const ch=document.createElement('button');ch.type='button';ch.className='btn ghost sm';ch.textContent='Schlüssel ändern';ch.addEventListener('click',()=>{store.set('rn-giphy-key','');VE.gres=null;veLib()});foot.append(ch);box.append(foot);
  const paint=()=>{grid.innerHTML='';more.innerHTML='';const R=VE.gres;if(!R)return;if(R.err){grid.append(Object.assign(document.createElement('p'),{className:'sub',textContent:R.err}));return}
    if(!R.items.length){grid.append(Object.assign(document.createElement('p'),{className:'sub',textContent:'Nichts gefunden.'}));return}
    for(const it of R.items){const im=(it.images||{}).fixed_width_small||(it.images||{}).fixed_width||{};if(!im.url)continue;const b=document.createElement('button');b.type='button';b.className='ve-gif'+(VE.gkind==='s'?' st':'');b.title=it.title||'GIF';const i=document.createElement('img');i.loading='lazy';i.alt=it.title||'GIF';i.src=im.url;i.width=+im.width||100;i.height=+im.height||100;b.append(i);
      b.addEventListener('click',async()=>{if(b.classList.contains('busy'))return;b.classList.add('busy');try{const r=await fetch(giphyPick(it));if(!r.ok)throw 0;await veAddGifBlob(await r.blob(),(it.title||'GIF').replace(/\s+GIF.*$/i,''),{giphy:it.id})}catch{toast('Das GIF konnte nicht geladen werden.')}b.classList.remove('busy')});grid.append(b)}
    if(R.more)vBtn(more,'Mehr laden',()=>load(true))};
  const load=async add=>{const kind=VE.gkind||'g',qq=(VE.gq||'').trim(),off=add&&VE.gres?VE.gres.items.length:0;if(!add)VE.gres={items:[],loading:true};
    try{const r=await giphyApi((kind==='s'?'stickers':'gifs')+(qq?'/search':'/trending'),{...(qq?{q:qq}:{}),limit:24,offset:off,lang:'de'});const items=(r.data||[]);VE.gres={items:[...(add&&VE.gres?VE.gres.items:[]),...items],more:items.length===24&&off+24<((r.pagination||{}).total_count||0)}}
    catch(e){VE.gres={items:[],err:e&&e.code==='badkey'?'Der GIPHY-Schlüssel funktioniert nicht. Tippe unten auf „Schlüssel ändern“.':e&&e.code==='rate'?'GIPHY bekommt gerade zu viele Anfragen. Versuch es gleich nochmal.':'GIPHY ist gerade nicht erreichbar. Prüfe die Internetverbindung.'}}
    if(VE.tab==='gif'&&grid.isConnected)paint()};
  let tq=0;q.addEventListener('input',()=>{clearTimeout(tq);tq=setTimeout(()=>{VE.gq=q.value;load(false)},400)});f.addEventListener('submit',e=>{e.preventDefault();clearTimeout(tq);VE.gq=q.value;load(false)});
  if(VE.gres&&!VE.gres.loading)paint();else if(!VE.gres)load(false)}
/* ---------- Untertitel ---------- */
function veLibSub(box){const sub=t=>box.append(Object.assign(document.createElement('p'),{className:'sub',textContent:t}));const L=subList();VE.subo=VE.subo||{lang:LANG==='en'?'english':'german',model:'good',style:'clean',only:false};const o=VE.subo;
  const sel=veFind(VE.sel),canOnly=sel&&veHasAudio(sel);
  if(!L.length){const h=document.createElement('h4');h.className='ve-h4';h.textContent='Automatische Untertitel';box.append(h);sub('Rendernail hört sich die Stimme in deinem Video an und schreibt daraus Untertitel. Alles passiert auf deinem Gerät.')}
  const sec=document.createElement('div');sec.className='stack';box.append(sec);
  vSelect(sec,'Sprache',SUB_LANGS,()=>o.lang,v=>{o.lang=v});vSelect(sec,'Genauigkeit',SUB_MODELS.map(m=>[m[0],m[1]]),()=>o.model,v=>{o.model=v});
  if(canOnly)vCheck(sec,'Nur der ausgewählte Clip',()=>o.only,v=>{o.only=v});
  const h2=document.createElement('h4');h2.className='ve-h4';h2.textContent='Aussehen';sec.append(h2);const g=document.createElement('div');g.className='ve-substyles';
  for(const[k,n,st]of SUB_STYLES){const b=document.createElement('button');b.type='button';b.className='ve-substyle';b.setAttribute('aria-pressed',o.style===k);const sp=document.createElement('span');sp.textContent=n;const F=FONTS[st.font]||FONTS.inter;sp.style.cssText=`font-family:${F[1]};font-weight:${F[2]};color:${st.color};-webkit-text-stroke:${Math.min(2,st.stroke/6)}px ${st.strokeColor};${st.box?'background:'+st.boxColor+';padding:0 6px;border-radius:4px;':''}${st.glow?'text-shadow:0 0 8px '+st.glc+';':''}`;b.append(sp);
    b.addEventListener('click',()=>{o.style=k;if(L.length)subStyleAll(k);else veLib()});g.append(b)}sec.append(g);
  {const r=document.createElement('div');r.className='btnrow';vBtn(r,L.length?'Neu erstellen':'Untertitel erstellen',()=>subCreate(o),'btn primary');if(L.length)vBtn(r,'Alle löschen',()=>{VE.p.over=VE.p.over.filter(c=>!c.sub);veCommit();veAll()},'btn sm danger');sec.append(r)}
  if(!L.length){sub('Beim ersten Mal wird das Sprachmodell aus dem Internet geladen, danach geht es schneller.');return}
  const h3=document.createElement('h4');h3.className='ve-h4';h3.textContent=L.length+' Untertitel';box.append(h3);sub('Antippen springt zur Stelle. Du kannst den Text direkt ändern.');
  const list=document.createElement('div');list.className='ve-sublist';for(const c of L){const row=document.createElement('div');row.className='ve-subrow'+(c.id===VE.sel?' sel':'');const tb=document.createElement('button');tb.type='button';tb.className='ve-subt';tb.textContent=veFmt(c._s);tb.addEventListener('click',()=>{vePause();veGoto(c._s+.01);VE.sel=c.id;veTimeline();veProps()});
    const inp=document.createElement('input');inp.type='text';inp.className='ve-in';inp.value=c.text||'';inp.setAttribute('aria-label','Untertitel bei '+veFmt(c._s));inp.addEventListener('focus',()=>{vePause();veGoto(c._s+.01)});inp.addEventListener('input',()=>{c.text=inp.value.slice(0,200);veTimelineSoft()});inp.addEventListener('change',veCommit);
    const del=document.createElement('button');del.type='button';del.className='btn ghost sm icon';del.setAttribute('aria-label','Löschen');del.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true">'+VE_IC.x+'</svg>';del.addEventListener('click',()=>{VE.p.over.splice(VE.p.over.indexOf(c),1);veCommit();veAll()});row.append(tb,inp,del);list.append(row)}box.append(list)}
/* ---------- Speicher-Wächter ---------- */
const VE_IMG_BUDGET=350e6;
function veMemTrim(hard){const now=performance.now(),P=VE.p,used=new Set();if(P){veLayout();for(const c of[...P.main,...P.over])if(c.type==='image'&&(!hard||veNear(c,VE.t)))used.add(c.asset)}
  let tot=0;for(const[k,e]of[...VE.imgs.entries()].sort((a,b)=>b[1].used-a[1].used)){if(!e.ok)continue;tot+=e.bytes||0;const drop=hard?!used.has(k):((!used.has(k)&&now-e.used>60000)||(tot>VE_IMG_BUDGET&&now-e.used>4000));
    if(drop){if(e.gif)gifFree(e.gif);else if(e.img&&e.img.getContext)e.img.width=e.img.height=0;VE.imgs.delete(k);tot-=e.bytes||0}}
  if(!VE.busy)VE.abufs.clear();if(hard&&typeof txtCache!=='undefined')txtCache.clear()}
setInterval(()=>{if(VE.p&&!VE.busy)veMemTrim(false)},10000);
if(window.rnNative&&typeof rnNative.onMemory==='function')rnNative.onMemory(()=>{veMemTrim(true);if(typeof txtCache!=='undefined')txtCache.clear()});
