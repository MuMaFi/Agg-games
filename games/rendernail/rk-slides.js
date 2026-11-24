'use strict';
/* ================= Präsentationen =================
   Eine Präsentation ist ein Design mit mehreren Folien (ED.p.slides). Die gerade offene Folie liegt
   wie gewohnt in ED.p.layers, damit alle Werkzeuge des Editors unverändert funktionieren.
   Export als .pptx: Jede Ebene (auch Text) wird ein einzelnes Bild, damit alles genau wie in Rendernail aussieht. */
FORMATS.slides={n:'Präsentation',d:'PowerPoint 16:9',w:1280,h:720,ic:[30,17]};
const SLIDE_TPL=[
  {name:'Titel',make:({bd,as,tx})=>{bd({mode:'mcsky',time:'day',seed:4});
    as('bl_grass',{x:.07,y:.88,s:.2});as('bl_grass',{x:.17,y:.92,s:.18});as('bl_dirt',{x:.11,y:.97,s:.16});as('fig_0',{x:.85,y:.6,s:.72,shadow:16});
    tx({text:'MEINE PRÄSENTATION',x:.44,y:.36,size:92,color:'#ffe14d',color2:'#ff9a1f',grad:true,depth:8});
    tx({text:'Untertitel oder dein Name',x:.44,y:.56,size:40,font:'inter',stroke:6})}},
  {name:'Inhalt',make:({bd,as,tx})=>{bd({mode:'scene',scene:'mountains',time:'day',seed:9,zoom:1.3,blur:6,dim:.45,vig:.35});
    tx({text:'Überschrift',x:.5,y:.15,size:76,color:'#ffffff',stroke:8,depth:4});
    tx({text:'• Erster Punkt\n• Zweiter Punkt\n• Dritter Punkt',x:.4,y:.56,size:46,font:'inter',align:'left',stroke:6});
    as('it_diamond',{x:.85,y:.56,s:.24,rot:-10,glow:40,glc:'#5fe3d6'})}},
  {name:'Bild & Text',make:({bd,as,tx})=>{bd({mode:'mcsky',time:'sunset',seed:12});as('fig_1',{x:.24,y:.6,s:.78,shadow:18});as('bl_planks',{x:.08,y:.9,s:.16});
    tx({text:'Thema',x:.66,y:.24,size:80,color:'#ffe14d',color2:'#ffb23a',grad:true,depth:6});
    tx({text:'Hier steht dein Text.\nZwei bis drei kurze Sätze\nlassen sich gut lesen.',x:.66,y:.56,size:38,font:'inter',align:'left',stroke:5})}},
  {name:'Vergleich',make:({bd,as,tx})=>{bd({mode:'scene',scene:'island',time:'day',seed:31,zoom:1.3,blur:5,dim:.35,vig:.3});
    tx({text:'Vorher oder nachher?',x:.5,y:.13,size:64,color:'#ffffff',stroke:8,depth:4});as('bl_dirt',{x:.27,y:.52,s:.34,shadow:14});as('bl_diamondblock',{x:.73,y:.52,s:.34,shadow:14,glow:30,glc:'#7ff5ea'});as('sh_vs',{x:.5,y:.52,s:.22});
    tx({text:'Erde',x:.27,y:.86,size:42,font:'inter',stroke:6});tx({text:'Diamant',x:.73,y:.86,size:42,font:'inter',stroke:6})}},
  {name:'Abschluss',make:({bd,as,tx})=>{bd({mode:'mcsky',time:'night',seed:2});as('fx_rays',{x:.5,y:.44,s:1.2,opacity:.35,color:'#ffe9a8'});
    tx({text:'DANKE FÜRS\nZUHÖREN!',x:.5,y:.42,size:116,color:'#ffffff',color2:'#9ff5ea',grad:true,depth:8});
    as('bl_grass',{x:.1,y:.9,s:.18});as('bl_grass',{x:.9,y:.9,s:.18});as('it_diamond',{x:.5,y:.82,s:.12})}},
  {name:'Leer',make:({bd})=>{bd({mode:'mcsky',time:'day',seed:7})}}];
const isDeck=()=>!!(ED.p&&Array.isArray(ED.p.slides)&&ED.p.slides.length);
function deckNew(W=1280,H=720){return[0,1,2,4].map(i=>({id:'s'+uid(),layers:tplLayers(SLIDE_TPL[i],W,H)}))}
function deckSync(){if(isDeck()){ED.p.cur=clamp(ED.p.cur|0,0,ED.p.slides.length-1);ED.p.slides[ED.p.cur].layers=ED.p.layers}}
function deckShow(i){ED.p.cur=clamp(i,0,ED.p.slides.length-1);ED.p.layers=ED.p.slides[ED.p.cur].layers;ED.sel=[];ED.hist=[snap()];ED.fut=[];
  updUndo();renderLayers();buildSelbar();buildProps();requestRender();deckBar();scheduleSave()}
function deckGo(i){if(!isDeck()||i===ED.p.cur)return;deckSync();deckShow(i)}
function deckAdd(t){deckSync();ED.p.slides.splice(ED.p.cur+1,0,{id:'s'+uid(),layers:tplLayers(t,ED.p.w,ED.p.h)});deckShow(ED.p.cur+1);toast(`Folie „${t.name}“ eingefügt.`)}
function deckDup(){deckSync();const c=JSON.parse(JSON.stringify(ED.p.slides[ED.p.cur]));c.id='s'+uid();c.layers.forEach(l=>{l.id='l'+uid()});ED.p.slides.splice(ED.p.cur+1,0,c);deckShow(ED.p.cur+1)}
function deckDel(){if(ED.p.slides.length<2){toast('Eine Folie muss bleiben.');return}if(!confirm(`Folie ${ED.p.cur+1} löschen?`))return;deckSync();ED.p.slides.splice(ED.p.cur,1);deckShow(Math.min(ED.p.cur,ED.p.slides.length-1))}
function deckMove(d){deckSync();const i=ED.p.cur,j=i+d,S=ED.p.slides;if(j<0||j>=S.length)return;[S[i],S[j]]=[S[j],S[i]];ED.p.cur=j;deckBar();scheduleSave()}
function deckThumb(s){const W=ED.p.w,H=ED.p.h,sc=124/W,c=mk(124,Math.round(H*sc)),x=c.getContext('2d');x.fillStyle='#2a2a2a';x.fillRect(0,0,c.width,c.height);x.scale(sc,sc);for(const L of s.layers)drawLayer(x,L,sc,W,H);return c}
function deckBar(){const bar=$('#slidebar');if(!bar)return;const on=isDeck();bar.hidden=!on;document.querySelector('.stagecol').classList.toggle('deck',on);if(!on)return;deckSync();bar.innerHTML='';
  const list=document.createElement('div');list.className='sl-list';list.setAttribute('role','listbox');list.setAttribute('aria-label','Folien');
  ED.p.slides.forEach((s,i)=>{const b=document.createElement('button');b.type='button';b.className='sl-item';b.setAttribute('role','option');b.setAttribute('aria-selected',i===ED.p.cur);b.title='Folie '+(i+1);
    const n=document.createElement('span');n.textContent=i+1;b.append(n,deckThumb(s));b.addEventListener('click',()=>deckGo(i));list.append(b)});
  const tools=document.createElement('div');tools.className='sl-tools';
  const add=document.createElement('button');add.type='button';add.className='btn primary sm';add.textContent='+ Folie';add.setAttribute('aria-haspopup','menu');
  add.addEventListener('click',()=>showMenu(add,SLIDE_TPL.map(t=>[t.name,()=>deckAdd(t)])));
  const mkB=(t,fn,lab)=>{const b=document.createElement('button');b.type='button';b.className='btn ghost sm';b.textContent=t;if(lab)b.setAttribute('aria-label',lab);b.addEventListener('click',fn);return b};
  tools.append(add,mkB('Duplizieren',deckDup),mkB('◀',()=>deckMove(-1),'Folie nach links'),mkB('▶',()=>deckMove(1),'Folie nach rechts'),mkB('Löschen',deckDel));
  bar.append(list,tools);const cur=list.children[ED.p.cur];if(cur)cur.scrollIntoView({block:'nearest',inline:'nearest'})}
let deckT=0;function deckChanged(){if(!isDeck())return;clearTimeout(deckT);deckT=setTimeout(()=>{const it=document.querySelectorAll('#slidebar .sl-item')[ED.p.cur];if(it){deckSync();it.querySelector('canvas').replaceWith(deckThumb(ED.p.slides[ED.p.cur]))}},250)}
document.addEventListener('keydown',e=>{if(view!=='editor'||!isDeck()||dlg.open)return;const t=e.target;if(t.closest&&t.closest('input,textarea,select'))return;
  if(e.key==='PageDown'){e.preventDefault();deckGo(ED.p.cur+1)}else if(e.key==='PageUp'){e.preventDefault();deckGo(ED.p.cur-1)}});

/* ---------- Export als PowerPoint ---------- */
function layerImage(L){const pad=Math.ceil(Math.max(L.ol||0,L.glow||0,(L.shadow||0)*1.2)*1.6)+6,w=L.w+pad*2,h=L.h+pad*2,sc=Math.min(2,2400/Math.max(w,h));
  const c=mk(Math.max(1,Math.round(w*sc)),Math.max(1,Math.round(h*sc))),x=c.getContext('2d');x.scale(sc,sc);drawLayer(x,{...L,rot:0,x:w/2,y:h/2,opacity:1},sc,w,h);return{url:c.toDataURL('image/png'),w,h}}
async function exportPptx(){
  if(typeof PptxGenJS==='undefined'){toast('Der PowerPoint-Export konnte nicht geladen werden. Prüf die Internetverbindung.');return}
  deckSync();const W=ED.p.w,H=ED.p.h,PX=96,slides=isDeck()?ED.p.slides:[{layers:ED.p.layers}];toast('PowerPoint-Datei wird erstellt …');
  await Promise.all(slides.flatMap(s=>s.layers).map(L=>{const u=L.type==='image'||L.mode==='image'?srcUrl(L.src):'';const e=u?getImg(u):null;return e?e.p:null}));
  const pptx=new PptxGenJS();pptx.defineLayout({name:'RN',width:W/PX,height:H/PX});pptx.layout='RN';pptx.title=ED.p.name;pptx.company='Rendernail';
  const inch=v=>Math.round(v/PX*1000)/1000,hex=c=>(/^#[0-9a-f]{6}$/i.test(c||'')?c:'#ffffff').slice(1).toUpperCase(),d64=u=>u.replace(/^data:/,'');
  for(const s of slides){const sl=pptx.addSlide();
    for(const L of s.layers){if(L.hidden)continue;
      if(L.type==='backdrop'){sl.background={data:d64(backdropCanvas(L,W,H).toDataURL('image/jpeg',.9))};continue}
      const r=layerImage(L),o={data:d64(r.url),x:inch(L.x-r.w/2),y:inch(L.y-r.h/2),w:inch(r.w),h:inch(r.h),rotate:Math.round(L.rot||0)};
      if((L.opacity??1)<1)o.transparency=Math.round((1-L.opacity)*100);sl.addImage(o)}}
  let blob;try{blob=await pptx.write({outputType:'blob'})}catch{toast('Die PowerPoint-Datei konnte nicht erstellt werden.');return}
  await saveFile(slug(ED.p.name)+'.pptx',blob)}
