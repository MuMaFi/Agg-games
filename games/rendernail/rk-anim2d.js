'use strict';
/* ================= Animation: 2D-Ebenen (Text, Elemente, Bilder) über der 3D-Szene =================
   Jede Ebene hat eigene Schlüsselbilder: Position (Anteil am Bild), Größe, Drehung, Deckkraft. */
const AN_OFONTS=Object.keys(FONTS);
const AN_OMOVES=[
  ['fadein','Einblenden',c=>[[0,{o:0}],[.5,{o:c.o||1}]]],['fadeout','Ausblenden',c=>[[0,{}],[.5,{o:0}]]],
  ['pop','Aufploppen',c=>[[0,{s:0}],[.45,{s:c.s||1},'swing']]],['gone','Wegploppen',c=>[[0,{}],[.35,{s:0},'smooth']]],
  ['left','Von links',c=>[[0,{x:-.35}],[.6,{x:c.x},'swing']]],['right','Von rechts',c=>[[0,{x:1.35}],[.6,{x:c.x},'swing']]],
  ['top','Von oben',c=>[[0,{y:-.3}],[.8,{y:c.y},'bounce']]],['bottom','Von unten',c=>[[0,{y:1.3}],[.6,{y:c.y},'swing']]],
  ['spin','Drehen',c=>[[0,{}],[1,{r:c.r+360},'linear']]],['pulse','Pulsieren',c=>[[0,{}],[.25,{s:c.s*1.18}],[.5,{s:c.s}]]],
  ['shake','Wackeln',c=>[[0,{}],[.1,{r:c.r+9}],[.2,{r:c.r-9}],[.3,{r:c.r+6}],[.4,{r:c.r-4}],[.5,{r:c.r}]]],['outleft','Nach links raus',c=>[[0,{}],[.5,{x:-.35},'smooth']]]];
function anOvl(){return(AN.data.ovl||[]).find(o=>o.id===AN.sel)||null}
function anOvlName(o){if(o.kind==='text')return(String(o.text||'').split('\n')[0]||'Text').slice(0,30);if(o.kind==='el')return(LIBK[o.key]||{}).name||'Element';return o.name||'Bild'}
function evalOvl(o,t){const K=o.keys,f=k=>({x:k.x,y:k.y,s:k.s,r:k.r,o:k.o});if(!K.length)return{x:.5,y:.5,s:1,r:0,o:1};
  if(t<=K[0].t)return f(K[0]);if(t>=K[K.length-1].t)return f(K[K.length-1]);let i=0;while(i<K.length-2&&t>=K[i+1].t)i++;
  const k0=K[i],k1=K[i+1],u=(t-k0.t)/Math.max(1e-6,k1.t-k0.t),e=(AN_EASE[k1.ease]||AN_EASE.smooth)[1](u),r={};for(const q of['x','y','s','r','o'])r[q]=lerp(k0[q],k1[q],e);return r}
function anSetOvlKey(o,patch){const t=AN.t;if(AN.moveAll&&!('o'in patch)){anShift(o.keys,evalOvl(o,t),patch,['x','y','s','r']);return}let k=anKeyAt(o.keys,t);
  if(!k){const v=evalOvl(o,t),nx=o.keys.find(q=>q.t>t);k={t,...v,ease:nx?nx.ease:'smooth'};o.keys.push(k);o.keys.sort((p,q)=>p.t-q.t);anTimeline()}Object.assign(k,patch)}
/* Ebene als Editor-Ebene beschreiben, damit sie genauso gezeichnet wird wie im Thumbnail-Editor */
function anOvlLayer(o,v,W,H,sc){const q=Math.max(1,sc),base={x:v.x*W,y:v.y*H,rot:v.r||0,opacity:clamp(v.o,0,1),flip:!!o.flip,hidden:false,ol:o.ol||0,olc:o.olc||'#ffffff',shade:0,shadow:o.shadow||0,glow:o.glow||0,glc:o.glc||'#ffd36b',blur:0};
  if(o.kind==='text'){const L={...base,type:'text',text:o.text||' ',font:o.font,size:Math.round((o.size||90)*q),color:o.color,color2:o.color2,grad:!!o.grad,stroke:Math.round((o.stroke||0)*q),strokeColor:o.strokeColor||'#000000',depth:Math.round((o.depth||0)*q),align:'center',ol:0,shadow:o.shadow||0};
    const c=textCanvas(L);L.w=c.width/q*v.s;L.h=c.height/q*v.s;return L}
  const L=o.kind==='el'?{...base,type:'asset',key:o.key,color:o.color||null}:{...base,type:'image',src:o.src,pixel:!!o.pixel};const s=sourceOf(L);if(!s)return null;
  const sw=s.c.naturalWidth||s.c.width,sh=s.c.naturalHeight||s.c.height;if(!sw||!sh)return null;const bw=W*(o.bw||.22);L.w=bw*v.s;L.h=bw*sh/sw*v.s;return L}
/* Alle Ebenen ins Bild zeichnen (Vorschau und Video): W×H ist das Format, sc der Maßstab zum Ziel */
function anDrawOvl(x,W,H,sc,t){const D=AN.data;if(!D.ovl||!D.ovl.length)return;x.save();x.scale(sc,sc);
  for(const o of D.ovl){if(o.hidden)continue;const v=evalOvl(o,t);if(v.o<=.001||v.s<=.001)continue;const L=anOvlLayer(o,v,W,H,sc);if(L)try{drawLayer(x,L,sc,W,H)}catch{}}x.restore()}
function anOvlBase(){return AN_FMT[AN.data.fmt].s[0]}
/* Vorschau-Leinwand über der Szene, mit Rahmen um die gewählte Ebene */
function anOvlPreview(){const c=$('#an-ovl');if(!c||!AR)return;const fr=AR.frame,w=fr.clientWidth,h=fr.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr)}const x=c.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,c.width,c.height);
  if(AN.rec)return;const[W,H]=anOvlBase(),sc=c.width/W;anDrawOvl(x,W,H,sc,AN.t);
  const o=anOvl();if(!o||AN.playing||AN_STEPS[AN.step][0]!=='ovl')return;const g=anOvlGeo(o);if(!g)return;x.setTransform(dpr,0,0,dpr,0,0);
  x.strokeStyle='#ffffff';x.lineWidth=1.5;x.setLineDash([5,4]);x.beginPath();g.pts.forEach((p,i)=>i?x.lineTo(...p):x.moveTo(...p));x.closePath();x.stroke();x.setLineDash([]);
  x.beginPath();x.moveTo(...g.top);x.lineTo(...g.rot);x.stroke();const R=COARSE?11:7;
  x.fillStyle='#ffffff';x.strokeStyle='#1e1e1e';x.beginPath();x.arc(...g.rot,R,0,7);x.fill();x.stroke();for(const p of[g.pts[2]]){x.fillRect(p[0]-R,p[1]-R,R*2,R*2);x.strokeRect(p[0]-R,p[1]-R,R*2,R*2)}
  if(AN.osnap){x.strokeStyle='rgba(90,169,255,.9)';x.lineWidth=1;if(AN.osnap.x){x.beginPath();x.moveTo(w/2,0);x.lineTo(w/2,h);x.stroke()}if(AN.osnap.y){x.beginPath();x.moveTo(0,h/2);x.lineTo(w,h/2);x.stroke()}}}
/* Lage der gewählten Ebene in Bildschirm-Pixeln der Vorschau */
function anOvlGeo(o){const fr=AR.frame,w=fr.clientWidth,h=fr.clientHeight,[W,H]=anOvlBase(),k=w/W,v=evalOvl(o,AN.t),L=anOvlLayer(o,{...v,o:1,s:Math.max(.05,v.s)},W,H,k);if(!L)return null;
  const a=(L.rot||0)*D2R,c=Math.cos(a),s=Math.sin(a),cx=L.x*k,cy=L.y*k,hw=L.w*k/2,hh=L.h*k/2,P=(i,j)=>[cx+i*hw*c-j*hh*s,cy+i*hw*s+j*hh*c];
  const top=P(0,-1),off=COARSE?40:28;return{cx,cy,hw,hh,a,pts:[P(-1,-1),P(1,-1),P(1,1),P(-1,1)],top,rot:[top[0]+s*off,top[1]-c*off],k,v}}
function anOvlHit(px,py){const fr=AR.frame,w=fr.clientWidth,[W]=anOvlBase(),k=w/W,list=(AN.data.ovl||[]).filter(o=>!o.hidden);
  for(let i=list.length-1;i>=0;i--){const o=list[i],v=evalOvl(o,AN.t);if(v.o<.05)continue;const L=anOvlLayer(o,v,W,AN_FMT[AN.data.fmt].s[0][1],k);if(!L)continue;
    const a=-(L.rot||0)*D2R,dx=px-L.x*k,dy=py-L.y*k,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);if(Math.abs(lx)<=L.w*k/2+6&&Math.abs(ly)<=L.h*k/2+6)return o}return null}
function anAddOvl(kind,extra){const D=AN.data;D.ovl=D.ovl||[];if(D.ovl.length>=40){toast('Mehr als 40 Ebenen gehen nicht.');return}const n=D.ovl.length;
  const o={id:'o'+uid(),kind,keys:[{t:AN.t,x:.5,y:kind==='text'?.22+(n%3)*.12:.5,s:1,r:0,o:1,ease:'smooth'}],...(kind==='text'?{text:'TEXT',font:'luckiest',size:96,color:'#ffffff',stroke:8,strokeColor:'#000000',depth:0}:{}),...extra};
  if(AN.t>.05)o.keys.unshift({...o.keys[0],t:0,o:0});D.ovl.push(o);anSelect(o.id);anCommit();anTimeline();anPane();toast(anOvlName(o)+' hinzugefügt. Zieh es im Bild an die richtige Stelle.')}
function anOvlMove(o,fn){const t0=AN.t,c=evalOvl(o,t0),steps=fn(c),last=steps[steps.length-1][0];if(t0+last>AN.data.dur)AN.data.dur=Math.min(30,Math.ceil((t0+last+.5)*2)/2);
  for(const[dt,patch,ease]of steps){const t=Math.round((t0+dt)*20)/20,v=evalOvl(o,t);let k=anKeyAt(o.keys,t);if(!k){k={t,...v};o.keys.push(k)}Object.assign(k,patch,{ease:ease||k.ease||'smooth'})}
  o.keys.sort((p,q)=>p.t-q.t);anTimeline();anCommit();anPane();toast('Bewegung eingefügt. Drück auf Abspielen.')}
async function anOvlImage(f){if(!f||!/^image\//.test(f.type)){toast('Das ist kein Bild.');return}try{const r=await ASSETS.upload(f);anAddOvl('img',{src:{asset:r.id},name:(f.name||'Bild').replace(/\.[a-z0-9]+$/i,'').slice(0,30)});
  const e=getImg(srcUrl({asset:r.id}));if(e&&e.p)e.p.then(()=>anPane())}catch{toast('Das Bild konnte nicht geladen werden.')}}

function paneOvl(P){const D=AN.data,o=anOvl();D.ovl=D.ovl||[];
  let s=aSec(P,'Text & 2D','Text, Minecraft-Elemente und Bilder liegen über der Szene und bewegen sich mit Schlüsselbildern.');
  if(D.ovl.length){const list=el('div','an-actors');for(const x of[...D.ovl].reverse()){const b=el('button','an-actor');b.type='button';b.setAttribute('aria-pressed',x.id===AN.sel);const c=mk(40,40),cx=c.getContext('2d');
    try{if(x.kind==='text'){cx.fillStyle='#3a3a3a';cx.fillRect(0,0,40,40);cx.fillStyle=x.color||'#fff';cx.font='700 22px Inter, sans-serif';cx.textAlign='center';cx.textBaseline='middle';cx.fillText('T',20,21)}
      else{const L=x.kind==='el'?{type:'asset',key:x.key,color:x.color}:{type:'image',src:x.src},sr=sourceOf(L);if(sr){const iw=sr.c.naturalWidth||sr.c.width,ih=sr.c.naturalHeight||sr.c.height,f=Math.min(36/iw,36/ih);cx.imageSmoothingEnabled=!sr.pixel;cx.drawImage(sr.c,20-iw*f/2,20-ih*f/2,iw*f,ih*f)}}}catch{}
    b.append(c,el('span',null,anOvlName(x)));b.addEventListener('click',()=>{anSelect(x.id);anPane()});list.append(b)}s.append(list)}
  {const r=aRow(s);aBtn(r,'+ Text',()=>anAddOvl('text'));aBtn(r,'+ Bild hochladen',()=>{const i=$('#f-anovl');if(i)i.click()})}
  const add=el('details','an-padd');add.innerHTML='<summary class="btn sm">+ Element</summary>';const q=el('input');q.type='search';q.placeholder='Elemente durchsuchen';q.className='an-search';
  const cats=el('div','seg an-ocats');let cat='items';const grid=el('div','an-pal');add.append(q,cats,grid);
  for(const[k,n]of CATS_A){const b=el('button',null,n);b.type='button';b.setAttribute('aria-pressed',k===cat);b.addEventListener('click',()=>{cat=k;q.value='';cats.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b));fill()});cats.append(b)}
  const fill=()=>{grid.innerHTML='';const f=q.value.trim().toLowerCase();const items=LIB.filter(a=>!a.hidden&&!a.cover&&(f?(a.name.toLowerCase().includes(f)||a.key.includes(f)):a.cat===cat)).slice(0,60);
    for(const a of items){const b=el('button','an-blk');b.type='button';b.title=a.name;b.setAttribute('aria-label',a.name+' hinzufügen');const c=mk(56,56);try{const sc=libCanvas(a.key),cx=c.getContext('2d'),iw=sc.width,ih=sc.height,k=Math.min(52/iw,52/ih);cx.imageSmoothingEnabled=!a.pixel;cx.drawImage(sc,28-iw*k/2,28-ih*k/2,iw*k,ih*k)}catch{}b.append(c);
      b.addEventListener('click',()=>anAddOvl('el',{key:a.key,...(a.bk?{bw:.16}:{})}));grid.append(b)}
    if(!items.length)grid.append(el('p','sub','Nichts gefunden.'))};
  add.addEventListener('toggle',()=>{if(add.open&&!grid.childElementCount)fill()});q.addEventListener('input',fill);s.append(add);
  if(!o)return;const cur=evalOvl(o,AN.t),k=anKeyAt(o.keys,AN.t);
  if(o.kind==='text'){s=aSec(P,'Text');const ta=el('textarea','an-otext');ta.rows=2;ta.value=o.text||'';ta.setAttribute('aria-label','Text');ta.addEventListener('input',()=>{o.text=ta.value.slice(0,200);anTimeline()});ta.addEventListener('change',anCommit);s.append(ta);
    aSelect(s,'Schrift',AN_OFONTS.map(f=>[f,FONTS[f][0]]),()=>o.font,v=>{o.font=v});
    aRange(s,'Schriftgröße',20,260,1,()=>o.size||90,v=>{o.size=v});
    const cr=el('div','an-ocolors');const col=(lab,get,set)=>{const l=el('label','an-ocol');const i=el('input');i.type='color';i.value=get();i.addEventListener('input',()=>set(i.value));i.addEventListener('change',anCommit);l.append(i,el('span',null,lab));cr.append(l)};
    col('Farbe',()=>o.color||'#ffffff',v=>{o.color=v});col('Kontur',()=>o.strokeColor||'#000000',v=>{o.strokeColor=v});s.append(cr);
    aRange(s,'Kontur',0,30,1,()=>o.stroke||0,v=>{o.stroke=v});aRange(s,'3D-Tiefe',0,20,1,()=>o.depth||0,v=>{o.depth=v})}
  else{s=aSec(P,'Aussehen');const a=o.kind==='el'?LIBK[o.key]:null;
    if(a&&a.color){const cr=el('div','an-ocolors'),l=el('label','an-ocol'),i=el('input');i.type='color';i.value=o.color||a.color;i.addEventListener('input',()=>{o.color=i.value});i.addEventListener('change',anCommit);l.append(i,el('span',null,'Farbe'));cr.append(l);s.append(cr)}
    aRange(s,'Grundgröße',4,100,1,()=>Math.round((o.bw||.22)*100),v=>{o.bw=v/100},v=>v+' %');aCheck(s,'Spiegeln',()=>o.flip,v=>{o.flip=v});
    aRange(s,'Kontur',0,24,1,()=>o.ol||0,v=>{o.ol=v})}
  aRange(s,'Schatten',0,40,1,()=>o.shadow||0,v=>{o.shadow=v});aRange(s,'Leuchten',0,60,1,()=>o.glow||0,v=>{o.glow=v});
  s=aSec(P,anOvlName(o)+' · bei '+anFmtT(AN.t),k?'Hier liegt ein Schlüsselbild. Änderungen gelten ab dieser Stelle.':'Eine Änderung legt hier automatisch ein neues Schlüsselbild an.');
  const mg=el('div','posegrid');for(const[,n,fn]of AN_OMOVES){const b=el('button','btn sm',n);b.type='button';b.addEventListener('click',()=>anOvlMove(o,fn));mg.append(b)}s.append(el('p','sub','Bewegung einfügen (ab hier):'),mg);
  s=aSec(P,'Lage');const set=f=>v=>anSetOvlKey(o,f(v));
  aRange(s,'Links/rechts',-50,150,.5,()=>Math.round(cur.x*200)/2,set(v=>({x:v/100})),v=>Math.round(v)+' %');aRange(s,'Oben/unten',-50,150,.5,()=>Math.round(cur.y*200)/2,set(v=>({y:v/100})),v=>Math.round(v)+' %');
  aRange(s,'Größe',0,4,.02,()=>cur.s,set(v=>({s:v})),v=>Math.round(v*100)+' %');aRange(s,'Drehen',-360,360,1,()=>Math.round(cur.r),set(v=>({r:v})),v=>v+'°');
  aRange(s,'Deckkraft',0,1,.05,()=>cur.o,set(v=>({o:v})),v=>Math.round(v*100)+' %');
  if(k){s=aSec(P,'Schlüsselbild bei '+anFmtT(k.t));aSelect(s,'Übergang hierher',Object.entries(AN_EASE).map(([e,[n]])=>[e,n]),()=>k.ease||'smooth',v=>{k.ease=v});
    if(o.keys.length>1)aBtn(aRow(s),'Schlüsselbild löschen',()=>{o.keys.splice(o.keys.indexOf(k),1);anTimeline();anCommit();anPane()},'btn sm danger')}
  if(k||AN.kclip){if(!k)s=aSec(P,null);anKeyBtns(s)}
  s=aSec(P,'Reihenfolge');{const r=aRow(s),i=D.ovl.indexOf(o);const mv=d=>()=>{const j=clamp(i+d,0,D.ovl.length-1);if(j===i)return;D.ovl.splice(i,1);D.ovl.splice(j,0,o);anCommit();anTimeline();anPane()};
    const b1=aBtn(r,'Nach vorne',mv(1));b1.disabled=i===D.ovl.length-1;const b2=aBtn(r,'Nach hinten',mv(-1));b2.disabled=i===0}
  s=aSec(P,null);{const r=aRow(s);aBtn(r,'Duplizieren (mit Animation)',()=>{anCopyObj();anPasteObj()});aBtn(r,'Ebene entfernen',()=>{D.ovl.splice(D.ovl.indexOf(o),1);anSelect(null);anCommit();anTimeline();anPane()},'btn sm danger')}}

/* Ziehen im Bild: Ebene verschieben, Ecke = Größe, Kreis oben = Drehen */
(function(){const fr=$('#an-frame');if(!fr)return;let D=null;
  const pos=e=>{const r=fr.getBoundingClientRect();return[e.clientX-r.left,e.clientY-r.top]};
  const active=()=>AN.ready&&AR&&!AN.rec&&AN_STEPS[AN.step][0]==='ovl';
  fr.addEventListener('pointerdown',e=>{if(!active()||e.button===2)return;if(e.target.closest('button,.an-hint,.an-rec,.an-posedone'))return;e.stopImmediatePropagation();e.preventDefault();
    if(AN.playing)anStop();if(!$('#an-hint').classList.contains('off'))anHintShow(false);anHintSeen.add('ovl');const[px,py]=pos(e),R=COARSE?22:14;let o=anOvl(),mode=null;
    if(o){const g=anOvlGeo(o);if(g){if(Math.hypot(px-g.rot[0],py-g.rot[1])<R)mode='rot';else if(Math.hypot(px-g.pts[2][0],py-g.pts[2][1])<R)mode='scale'}}
    if(!mode){const h=anOvlHit(px,py);if(h){if(h!==o){anSelect(h.id);o=h}mode='move'}else{if(AN.sel)anSelect(null);anPane();return}}
    const g=anOvlGeo(o);D={id:e.pointerId,o,mode,x:px,y:py,v0:evalOvl(o,AN.t),g,moved:false};try{fr.setPointerCapture(e.pointerId)}catch{}},{capture:true});
  fr.addEventListener('pointermove',e=>{if(!D||e.pointerId!==D.id)return;e.stopImmediatePropagation();const[px,py]=pos(e);if(!D.moved&&Math.hypot(px-D.x,py-D.y)<3)return;D.moved=true;
    const w=fr.clientWidth,h=fr.clientHeight,o=D.o,g=D.g;
    if(D.mode==='move'){let x=D.v0.x+(px-D.x)/w,y=D.v0.y+(py-D.y)/h;AN.osnap={x:Math.abs(x-.5)*w<6,y:Math.abs(y-.5)*h<6};if(AN.osnap.x)x=.5;if(AN.osnap.y)y=.5;anSetOvlKey(o,{x:Math.round(x*1000)/1000,y:Math.round(y*1000)/1000})}
    else if(D.mode==='scale'){const d0=Math.hypot(D.x-g.cx,D.y-g.cy),d1=Math.hypot(px-g.cx,py-g.cy);anSetOvlKey(o,{s:Math.round(clamp(D.v0.s*d1/Math.max(4,d0),.02,8)*100)/100})}
    else{const a0=Math.atan2(D.y-g.cy,D.x-g.cx),a1=Math.atan2(py-g.cy,px-g.cx);let r=D.v0.r+(a1-a0)/D2R;if(!e.shiftKey){const sn=Math.round(r/15)*15;if(Math.abs(sn-r)<3)r=sn}anSetOvlKey(o,{r:Math.round(r*10)/10})}},{capture:true});
  const up=e=>{if(!D||e.pointerId!==D.id)return;e.stopImmediatePropagation();const d=D;D=null;AN.osnap=null;if(d.moved){anCommit();anTimeline()}anPane()};
  fr.addEventListener('pointerup',up,{capture:true});fr.addEventListener('pointercancel',up,{capture:true});
  fr.addEventListener('wheel',e=>{if(active())e.stopImmediatePropagation()},{capture:true,passive:true});
  document.addEventListener('change',e=>{if(!e.target||e.target.id!=='f-anovl')return;const f=e.target.files[0];e.target.value='';if(f&&AN.ready)anOvlImage(f)});
  document.addEventListener('keydown',e=>{if(view!=='anim'||!AN.ready||AN.rec||!active())return;const t=e.target;if(t.closest&&t.closest('input,textarea,select'))return;const o=anOvl();if(!o)return;
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();AN.data.ovl.splice(AN.data.ovl.indexOf(o),1);anSelect(null);anCommit();anTimeline();anPane()}})})();
