'use strict';
/* ================= Thumbnails-Startseite ================= */
(function buildFormats(){const g=$('#fmt-grid');
  const card=(cls,ic,title,sub,fn)=>{const b=document.createElement('button');b.type='button';b.className='fmt'+(cls?' '+cls:'');b.innerHTML='<span class="ic"></span><span><b></b><span></span></span>';
    const i=b.querySelector('.ic');if(typeof ic==='string')i.textContent=ic;else{const r=document.createElement('i');r.style.width=ic[0]+'px';r.style.height=ic[1]+'px';i.append(r)}
    b.querySelector('b').textContent=title;b.querySelector('b+span').textContent=sub;b.addEventListener('click',fn);g.append(b)};
  card('main','+','Neues Thumbnail','YouTube · 1280 × 720',()=>createAndOpen('yt'));
  for(const k of['short','insta','portrait']){const f=FORMATS[k];card(k==='short'?'':'adv',f.ic,f.n,`${f.d} · ${f.w} × ${f.h}`,()=>createAndOpen(k))}
  {const f=FORMATS.slides;card('',f.ic,f.n,'Folien · PowerPoint-Export',()=>createAndOpen('slides',{slides:deckNew(f.w,f.h)}))}
  card('adv','⇪','Datei öffnen','.json aus Rendernail',()=>$('#f-project').click())})();
function renderHome(){
  const list=[...PROJECTS.values()].filter(p=>p&&Array.isArray(p.layers)).sort((a,b)=>String(b.updated).localeCompare(String(a.updated)));
  $('#pcount').textContent=list.length||'';const g=$('#pgrid');g.innerHTML='';
  if(projNote){const p=document.createElement('p');p.className='empty';p.textContent=projNote;g.append(p)}
  if(!list.length){if(!projNote){const p=document.createElement('p');p.className='empty';p.textContent='Noch keine Designs. Starte oben mit „Neues Thumbnail“.';g.append(p)}return}
  for(const p of list){const c=document.createElement('div');c.className='pcard';
    const pv=document.createElement('button');pv.type='button';pv.className='pv';pv.setAttribute('aria-label',(p.name||'Design')+' öffnen');
    if(p.preview&&/^data:image\/jpeg;base64,/.test(p.preview)){const im=document.createElement('img');im.alt='';im.src=p.preview;pv.append(im)}else{const s=document.createElement('span');s.className='sub';s.textContent='Noch keine Vorschau';pv.append(s)}
    pv.addEventListener('click',()=>{openProject(p);location.hash='editor'});
    const meta=document.createElement('div');meta.className='meta';const t=document.createElement('div');t.style.minWidth='0';const b=document.createElement('b');b.textContent=p.name||'Design';const s=document.createElement('span');
    const f=FORMATS[p.format];s.textContent=`${f?f.d:''} · bearbeitet ${rel(p.updated)}`;t.append(b,s);
    const acts=document.createElement('div');acts.className='btnrow';acts.style.flexWrap='nowrap';
    const du=document.createElement('button');du.type='button';du.className='btn ghost sm';du.textContent='Kopie';du.setAttribute('aria-label',`${p.name} kopieren`);
    du.addEventListener('click',()=>{const n={...JSON.parse(JSON.stringify(p)),id:'p'+uid(),name:(p.name||'Design')+' (Kopie)',created:new Date().toISOString(),updated:new Date().toISOString()};persistProject(n);toast('Kopie erstellt.')});
    const de=document.createElement('button');de.type='button';de.className='btn ghost sm danger';de.textContent='Löschen';de.setAttribute('aria-label',`${p.name} löschen`);
    de.addEventListener('click',()=>{if(!de.classList.contains('armed')){de.classList.add('armed');de.textContent='Wirklich?';setTimeout(()=>{de.classList.remove('armed');de.textContent='Löschen'},4000);return}if(ED.p&&ED.p.id===p.id){ED.p=null;store.set('rk-current',null)}deleteProject(p.id)});
    acts.append(du,de);meta.append(t,acts);c.append(pv,meta);g.append(c)}}
homeWatchers.push(()=>{if(view==='home')renderHome()});

/* ================= Galerie ================= */
const CATS=[['alle','Alle'],['builds','Builds'],['landschaft','Landschaften'],['charakter','Charaktere'],['wallpaper','Wallpaper'],['meine','Meine Renders']];
const CAT_LABEL=Object.fromEntries(CATS);
const RAW=[
 ['Schwebende Insel im Abendrot','kubikfee','landschaft','island','sunset','2026-11-22',184,1290,['insel','himmel','abend']],
 ['Fachwerkhaus am Waldrand','holzwurm_42','builds','house','day','2026-11-21',97,640,['haus','dorf','wald']],
 ['Wachturm bei Nacht','nachtschicht','builds','tower','night','2026-11-21',212,1544,['turm','burg','nacht']],
 ['Bergkette im Schnee','frostblock','wallpaper','mountains','day','2026-11-20',356,3021,['berge','schnee']],
 ['Skin-Render: Wanderin','pixelpaula','charakter','character','day','2026-11-20',143,980,['skin','figur']],
 ['Portal in der Unterwelt','glutkern','builds','portal','nether','2026-11-19',268,2210,['portal','nether','lava']],
 ['Oase mit Pyramide','sandmann','builds','pyramid','sunset','2026-11-18',121,870,['wüste','pyramide','oase']],
 ['Flusstal am Morgen','kubikfee','landschaft','plains','day','2026-11-17',88,510,['fluss','wiese']],
 ['Taiga bei Nacht','frostblock','landschaft','taiga','night','2026-11-16',176,1180,['schnee','fichten','nacht']],
 ['Skin-Render: Schmied','amboss_anton','charakter','character','sunset','2026-11-15',64,402,['skin','figur']],
 ['Himmelsinseln','himmelsbauer','wallpaper','island','day','2026-11-14',301,2760,['insel','himmel']],
 ['Dünen bei Sonnenuntergang','sandmann','landschaft','desert','sunset','2026-11-12',73,455,['wüste','kaktus']],
 ['Bauernhaus bei Nacht','holzwurm_42','builds','house','night','2026-11-11',159,1033,['haus','nacht']],
 ['Skin-Render: Nachtwächter','nachtschicht','charakter','character','night','2026-11-10',118,760,['skin','nacht']],
 ['Gipfelblick','frostblock','wallpaper','mountains','sunset','2026-11-08',402,3890,['berge','abend']],
 ['Turmruine im Abendlicht','steinmetz','builds','tower','sunset','2026-11-06',91,598,['turm','ruine']],
 ['Lavafeld','glutkern','landschaft','portal','nether','2026-11-04',134,915,['nether','lava']],
 ['Mondinsel','himmelsbauer','wallpaper','island','night','2026-11-02',288,2477,['insel','nacht','mond']],
 ['Skin-Render: Gärtnerin','pixelpaula','charakter','character','day','2026-10-30',77,498,['skin','figur']],
 ['Wiesenlandschaft im Abendlicht','kubikfee','landschaft','plains','sunset','2026-10-27',59,340,['wiese','fluss']],
 ['Wüstentempel','sandmann','builds','pyramid','day','2026-10-24',103,722,['wüste','tempel']],
 ['Schneetal bei Tag','frostblock','landschaft','taiga','day','2026-10-20',95,661,['schnee','fichten']],
 ['Hütte am See','holzwurm_42','builds','house','sunset','2026-10-15',140,1102,['haus','see']],
 ['Skin-Render: Kundschafter','amboss_anton','charakter','character','night','2026-10-11',52,288,['skin','nacht']]];
const RENDERERS=['Blender Cycles','Chunky','Blender Eevee','Chunky'];
const ITEMS=RAW.map((a,i)=>{const r=mulberry32(i*101+17),wall=a[2]==='wallpaper',res=wall?'3840×2160':['1920×1080','2560×1440','3840×2160'][Math.floor(r()*3)];
  return{id:i+1,seed:i*977+31,title:a[0],author:a[1],cat:a[2],scene:a[3],time:a[4],date:a[5],likes:a[6],dl:a[7],tags:a[8],res,renderer:RENDERERS[Math.floor(r()*4)],samples:[256,512,1024,2048][Math.floor(r()*4)],mb:(res.startsWith('3840')?6+r()*6:2+r()*4).toFixed(1)}});
const liked=new Set(store.get('rk-likes',[]));
const gstate={sort:'neu',cat:store.get('rk-cat','alle'),q:'',shown:12};if(!CAT_LABEL[gstate.cat])gstate.cat='alle';
const likes=it=>it.likes+(liked.has(it.id)?1:0);
function toggleLike(it){liked.has(it.id)?liked.delete(it.id):liked.add(it.id);store.set('rk-likes',[...liked])}
const resLabel=r=>r.startsWith('3840')?'4K':r.startsWith('2560')?'1440p':'1080p';
const myRenders=()=>UPLOADS.filter(u=>u.kind==='render'&&(u.asset||u.data));
function filtered(){const q=gstate.q.trim().toLowerCase(),hit=it=>!q||it.title.toLowerCase().includes(q)||it.author.toLowerCase().includes(q)||it.tags.some(t=>t.includes(q));
  if(gstate.cat==='meine')return[];
  return ITEMS.filter(it=>(gstate.cat==='alle'||it.cat===gstate.cat)&&hit(it)).sort({neu:(a,b)=>b.date.localeCompare(a.date)||b.id-a.id,beliebt:(a,b)=>likes(b)-likes(a),meistgeladen:(a,b)=>b.dl-a.dl}[gstate.sort])}
const thumbCache=new Map();
function thumbFor(it){let c=thumbCache.get(it.id);if(!c){c=mk(640,400);drawScene(c,sceneFor(it.scene,it.seed),{time:it.time,seed:it.seed});thumbCache.set(it.id,c)}return c}
const grid=$('#grid'),moreBtn=$('#more');
function draw(){
  document.querySelectorAll('.tabs a').forEach(a=>{if(a.dataset.sort===gstate.sort)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  document.querySelectorAll('#chips button').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.cat===gstate.cat);if(b.dataset.cat==='meine'){const n=myRenders().length;b.textContent='Meine Renders'+(n?` (${n})`:'')}});
  grid.innerHTML='';
  if(gstate.cat==='meine'){const l=myRenders();moreBtn.hidden=true;
    if(!l.length){const p=document.createElement('p');p.className='empty';p.textContent=ASSETS?'Noch keine eigenen Renders. Erstell einen unter „Renders“ und speichere ihn.':'Eigene Renders lassen sich in dieser Ansicht nicht dauerhaft speichern.';grid.append(p);return}
    for(const u of l)grid.append(mineCard(u));return}
  const l=filtered();
  if(!l.length){const p=document.createElement('p');p.className='empty';p.textContent=`Keine Renders gefunden${gstate.q?` für „${gstate.q}“`:''}.`;grid.append(p);moreBtn.hidden=true;return}
  for(const it of l.slice(0,gstate.shown))grid.append(itemCard(it));
  const rest=l.length-gstate.shown;moreBtn.hidden=rest<=0;moreBtn.textContent=`Mehr laden (${Math.min(12,rest)} weitere)`}
function itemCard(it){const el=document.createElement('article');el.className='card';
  el.innerHTML=`<button class="card-open" type="button"><div class="thumb"><canvas width="640" height="400"></canvas><span class="res">${resLabel(it.res)}</span></div><div class="cmeta"><h3></h3><p class="by">von <b></b> · ${rel(it.date)}</p></div></button>
    <div class="foot"><span class="lic">Privat nutzbar</span><span class="stats"><button class="like" type="button" aria-label="Gefällt mir"></button><span title="Downloads">${ICON.dl}${fmt(it.dl)}</span></span></div>`;
  el.querySelector('h3').textContent=it.title;el.querySelector('.by b').textContent=it.author;el.querySelector('.card-open').setAttribute('aria-label',it.title+' öffnen');
  el.querySelector('canvas').getContext('2d').drawImage(thumbFor(it),0,0);
  const lb=el.querySelector('.like'),upd=()=>{lb.setAttribute('aria-pressed',liked.has(it.id));lb.innerHTML=`${ICON.heart}<span>${fmt(likes(it))}</span>`};upd();
  lb.addEventListener('click',()=>{toggleLike(it);upd()});el.querySelector('.card-open').addEventListener('click',()=>openItem(it));return el}
function mineCard(u){const el=document.createElement('article');el.className='card';const url=srcUrl(u.asset?{asset:u.asset}:{data:u.data});
  el.innerHTML=`<button class="card-open" type="button"><div class="thumb"><img class="contain" alt="" loading="lazy"><span class="res"></span></div><div class="cmeta"><h3></h3><p class="by"></p></div></button>`;
  setImgSrc(el.querySelector('img'),url);el.querySelector('.res').textContent=u.w&&u.h?`${u.w}×${u.h}`:'Render';el.querySelector('h3').textContent=u.name||'Render';el.querySelector('.by').textContent='Eigener Render · '+rel(u.created);
  el.querySelector('.card-open').addEventListener('click',()=>openMine(u,url));return el}
function openItem(it){const c=mk(1600,1000);drawScene(c,sceneFor(it.scene,it.seed),{time:it.time,seed:it.seed});
  openDialog({src:c.toDataURL('image/png'),title:it.title,author:it.author,when:rel(it.date),license:true,tags:it.tags,
    spec:[['Kategorie',CAT_LABEL[it.cat]],['Auflösung',it.res],['Renderer',it.renderer],['Samples',fmt(it.samples)],['Dateigröße',it.mb.replace('.',',')+' MB'],['Downloads',fmt(it.dl)],['Hochgeladen',new Date(it.date).toLocaleDateString('de-DE')]],
    hint:DL?'':'Zum Speichern lange auf das Bild drücken oder Rechtsklick und „Bild speichern unter…“.',
    actions:[DL&&{label:'PNG herunterladen',primary:true,icon:ICON.dl,run:async()=>{await saveFile(slug(it.title)+'.png',await canvasBlob(c))}},
      {label:'Als Thumbnail-Hintergrund',run:()=>{dlg.close();useAsBackdrop({mode:'scene',scene:it.scene==='character'?'plains':it.scene,time:it.time==='nether'?'night':it.time,seed:it.seed,zoom:1.25})}},
      {label:()=>`${liked.has(it.id)?'Gefällt dir':'Gefällt mir'} · ${fmt(likes(it))}`,icon:ICON.heart,pressed:()=>liked.has(it.id),run:()=>{toggleLike(it);draw()}}]})}
async function openMine(u,url){
  url=await realUrl(url).catch(()=>url);
  openDialog({src:url,title:u.name||'Render',when:'Eigener Render · '+rel(u.created),license:false,spec:u.w?[['Größe',`${u.w} × ${u.h} px`]]:[],
    hint:DL?'':'Zum Speichern lange auf das Bild drücken oder Rechtsklick und „Bild speichern unter…“.',
    actions:[DL&&{label:'PNG herunterladen',primary:true,icon:ICON.dl,run:async()=>{await saveFile(slug(u.name||'render')+'.png',await srcBlob(u.asset?{asset:u.asset}:{data:u.data}))}},
      {label:'Ins Thumbnail einfügen',run:async()=>{const e=getImg(url);await e.p;dlg.close();insertImageIntoDesign(u.asset?{asset:u.asset}:{data:u.data},e.img.naturalWidth||u.w,e.img.naturalHeight||u.h,u.name||'Render',{fitH:.85,x:.72})}},
      (u.docId&&DB)&&{label:'Löschen',danger:true,confirm:'Wirklich löschen?',run:async()=>{await DB.collection('uploads').doc(u.docId).delete();if(ASSETS){try{await ASSETS.delete(u.asset)}catch{}}dlg.close()},fail:()=>'Löschen hat nicht geklappt.'}]})}
(function(){const chips=$('#chips');for(const[k,l]of CATS){const b=document.createElement('button');b.type='button';b.dataset.cat=k;b.textContent=l;b.addEventListener('click',()=>{gstate.cat=k;gstate.shown=12;store.set('rk-cat',k);draw()});chips.append(b)}})();
$('#q').addEventListener('input',e=>{gstate.q=e.target.value;gstate.shown=12;draw()});
moreBtn.addEventListener('click',()=>{gstate.shown+=12;draw()});
uploadWatchers.push(()=>{if(view==='gallery')draw()});

/* ================= Navigation ================= */
function route(){
  const h=location.hash.slice(1);let v;
  if(h==='renders')v='studio';
  else if(h==='animation')v='anim';
  else if(h==='editor'){if(!ED.p){const id=store.get('rk-current',null),d=id&&PROJECTS.get(id);if(d)openProject(d)}v=ED.p?'editor':'home'}
  else if(['neu','beliebt','meistgeladen'].includes(h))v='gallery';
  else v='home';
  if(view==='editor'&&v!=='editor'&&saveT)saveNow();
  view=v;
  for(const[id,n]of[['v-studio','studio'],['v-anim','anim'],['v-home','home'],['v-editor','editor'],['v-gallery','gallery']])$('#'+id).hidden=n!==v;
  document.querySelectorAll('.nav a').forEach(a=>{const on=a.dataset.r===v||(a.dataset.r==='home'&&v==='editor');if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')});
  if(v!=='editor')setSave('');
  if(v==='studio')startStudio();
  if(v==='anim'){startAnim();if(typeof anHome==='function'&&AN.ready)anHome(true)}
  if(v==='home')renderHome();
  if(v==='gallery'){gstate.sort=['neu','beliebt','meistgeladen'].includes(h)?h:'neu';gstate.shown=12;draw()}
  if(v==='editor'){buildSide();renderLayers();buildSelbar();buildProps();requestRender()}}
window.addEventListener('hashchange',route);
route();

/* ================= Schriften ================= */
if(document.fonts&&document.fonts.load){
  Promise.all(Object.values(FONTS).map(f=>document.fonts.load(`${f[2]} 40px ${f[1].split(',')[0]}`).catch(()=>{}))).then(()=>{
    fontsTick++;txtCache.clear();clearFontAssets();fxCache.clear();
    if(ED.p){ED.p.layers.filter(L=>L.type==='text').forEach(refitText)}
    if(view==='editor'){requestRender();renderLayers();if(['text','templates','assets'].includes(ED.tab))buildSide()}})}

$('#start-new').addEventListener('click',()=>createAndOpen('yt'));$('#start-open').addEventListener('click',()=>$('#f-project').click());
