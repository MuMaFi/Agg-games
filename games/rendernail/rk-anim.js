'use strict';
/* ================= Animation =================
   Schritt für Schritt: 1 Hintergrund bauen · 2 Figuren & Bewegung · 3 Kamerafahrt · 4 Licht · 5 Video.
   Zwischen den Schlüsselbildern rechnet Rendernail die Bewegung automatisch und weich aus. */
const AB=16;// ein Block in Figur-Einheiten (eine Figur ist zwei Blöcke hoch)
const AN_STEPS=[['bg','Hintergrund'],['act','Figuren & Bewegung'],['cam','Kamera'],['light','Licht'],['out','Video']];
const AN_FMT={'16:9':{n:'Quer 16:9',s:[[1280,720],[1920,1080]]},'9:16':{n:'Hoch 9:16',s:[[720,1280],[1080,1920]]},'1:1':{n:'Quadrat 1:1',s:[[1080,1080],[1440,1440]]}};
function bounceOut(u){const n=7.5625,d=2.75;if(u<1/d)return n*u*u;if(u<2/d)return n*(u-=1.5/d)*u+.75;if(u<2.5/d)return n*(u-=2.25/d)*u+.9375;return n*(u-=2.625/d)*u+.984375}
const AN_EASE={smooth:['Weich',u=>u*u*(3-2*u)],linear:['Gleichmäßig',u=>u],swing:['Mit Schwung',u=>{const s=1.70158;u-=1;return u*u*((s+1)*u+s)+1}],bounce:['Federnd',bounceOut],hold:['Harter Schnitt',u=>u<1?0:1]};
const AN_LIGHT={
  day:{n:'Tag',sky:'day',sun:'#fff3e0',power:1,amb:1,az:35,el:55,fog:.3,tint:0,vig:.25},
  sunset:{n:'Sonnenuntergang',sky:'sunset',sun:'#ffa860',power:1.15,amb:.85,az:-70,el:11,fog:.5,tint:.35,vig:.4},
  night:{n:'Nacht',sky:'night',sun:'#9fb4ff',power:.5,amb:.55,az:25,el:38,fog:.4,tint:-.35,vig:.5},
  drama:{n:'Dramatisch',sky:'sunset',sun:'#ffd6a8',power:1.5,amb:.32,az:-115,el:16,fog:.2,tint:.12,vig:.6}};
const AN_HEMI={day:['#dfeaff','#7a6a55'],sunset:['#ffcfa0','#4b3d5c'],night:['#4a5a90','#0e1020']};
const AN_GROUND=[['grass','Gras'],['sand','Sand'],['stone','Stein'],['snow','Schnee'],['none','Kein Boden']];
const AN_CAMS=[['orbit','Umkreisen','Fährt langsam um die Szene'],['dolly','Heranfahren','Kommt aus der Ferne näher'],['crane','Von oben','Senkt sich auf Augenhöhe'],['pan','Seitwärts','Gleitet an der Szene vorbei'],['follow','Figur folgen','Bleibt bei der ersten Figur'],['fixed','Fest','Steht still wie ein Stativ']];
const AN_CROUCH={legR:[-35,0,0],legL:[-35,0,0],legRLow:[60,0,0],legLLow:[60,0,0],body:[14,0,0],head:[-10,0,0],armR:[30,0,-10],armL:[30,0,10]};
const AN_MOVES=[
  ['wave','Winken',[[0,'stehen'],[.35,'winken'],[.7,{armL:[0,0,150],armLLow:[0,0,70],head:[0,-10,4]}],[1.05,'winken'],[1.4,{armL:[0,0,150],armLLow:[0,0,70],head:[0,-10,4]}],[1.8,'stehen']]],
  ['jump','Springen',[[0,'stehen',0],[.25,AN_CROUCH,-3],[.55,{armL:[0,0,150],armR:[0,0,-150],legR:[-15,0,0],legL:[-15,0,0],legRLow:[25,0,0],legLLow:[25,0,0]},22],[.85,AN_CROUCH,-3],[1.15,'stehen',0]]],
  ['cheer','Jubeln',[[0,'stehen'],[.35,'jubeln'],[.65,{armL:[0,0,120],armR:[0,0,-120],armLLow:[0,0,40],armRLow:[0,0,-40],head:[-15,0,0]}],[.95,'jubeln'],[1.25,{armL:[0,0,120],armR:[0,0,-120],armLLow:[0,0,40],armRLow:[0,0,-40],head:[-15,0,0]}],[1.7,'stehen']]],
  ['look','Umschauen',[[0,'stehen'],[.5,{armR:[0,0,-4],armL:[0,0,4],head:[0,45,0]}],[1.2,{armR:[0,0,-4],armL:[0,0,4],head:[0,-45,0]}],[1.7,'stehen']]],
  ['hit','Zuschlagen',[[0,'kampf'],[.18,{body:[0,12,0],head:[0,-6,0],armR:[-95,0,0],armRLow:[-5,0,0],armL:[-30,0,20],armLLow:[-60,0,0],legR:[-18,0,0],legL:[18,0,0]}],[.45,'kampf']]],
  ['sit','Hinsetzen',[[0,'stehen',0],[.8,'sitzen',-6]]]];

let AR=null;
const AN={step:0,t:0,playing:false,rec:null,look:'work',sel:null,bone:null,tool:'place',block:null,q:'',hist:[],fut:[],ready:false,failed:false,running:false,
  data:null,cells:new Map(),colTop:new Map(),rts:new Map(),blockMeshes:[],work:null,tween:null,camEdit:false,tcDrag:false,last:0,pathDirty:true};
const anClone=o=>JSON.parse(JSON.stringify(o));
function anPose(k){return anClone((POSES[k]||POSES.stehen)[1])}

/* ---------- Daten ---------- */
/* Vorlagen. Bäume nach dem Bauplan von Minecraft-Eichen und -Birken: Stamm 4–6 (Birke 5–7) hoch, darüber zwei breite
   Laubschichten (5×5, Ecken zufällig) und zwei schmale (3×3, oberste ohne Ecken) – jeder Baum etwas anders. */
function anTemplate(k,seed){const b=[],put=(x,y,z,t)=>b.push([x,y,z,t]),r=mulberry32(seed||(Date.now()&0xffff)),pk=n=>typeof PACK!=='undefined'&&PACK&&PACK.imgs['b/'+n]?'pk:'+n:null;
  const tree=(x,z,y0=0,birch=false)=>{const h=(birch?5:4)+Math.floor(r()*3),log=birch&&pk('birch_log')||'log',lv=birch&&pk('birch_leaves')||'leaves',taken=new Set();
    for(let y=0;y<h;y++){put(x,y0+y,z,log);taken.add(x+','+(y0+y)+','+z)}
    for(let y=h-3;y<=h;y++){const rad=y>=h-1?1:2;for(let i=-rad;i<=rad;i++)for(let j=-rad;j<=rad;j++){const corner=Math.abs(i)===rad&&Math.abs(j)===rad;if(corner&&(y===h||r()<.5))continue;const key=(x+i)+','+(y0+y)+','+(z+j);if(!taken.has(key))put(x+i,y0+y,z+j,lv)}}};
  if(k==='wiese'){tree(-6,-5);tree(7,-7,0,r()<.4);tree(-11,6)}
  if(k==='wald'){const pts=[];for(let n=0;n<120&&pts.length<16;n++){const x=Math.round((r()*2-1)*17),z=Math.round((r()*2-1)*17);if(x*x+z*z<36)continue;if(pts.some(([a,c])=>Math.abs(a-x)<4&&Math.abs(c-z)<4))continue;pts.push([x,z])}
    for(const[x,z]of pts)tree(x,z,0,r()<.3)}
  if(k==='insel'){for(let y=-1;y>=-6;y--){const rr=[6.6,5.6,4.6,3.6,2.4,1.4][-1-y];for(let i=-7;i<=7;i++)for(let j=-7;j<=7;j++)if(i*i+j*j<=rr*rr)put(i,y,j,y===-1?'grass':y>-4?'dirt':'stone')}tree(-3,-2)}
  if(k==='buehne'){for(let i=-4;i<=4;i++)for(let j=-3;j<=3;j++)put(i,0,j,Math.abs(i)===4||Math.abs(j)===3?'stone':'planks')}
  if(k==='block')put(0,-1,0,'grass');
  return b}
function anDefault(){return{v:1,dur:6,fmt:'16:9',bg:{mode:'mc',color:'#2b2b2b',ground:'grass'},blocks:anTemplate('wiese'),actors:[],
  props:[],audio:[],cam:{preset:'orbit',keys:[],fov:35,smooth:true,shake:0},light:{preset:'day',...anClone(AN_LIGHT.day),shadows:true,soft:3},fx:{bars:false,fade:true,look:'none'},fps:30,q:0}}
/* ---------- Mehrere Animationen speichern ---------- */
const AN_IDX='rk-anims';
function anIndex(){const i=store.get(AN_IDX,null);return Array.isArray(i)?i.filter(p=>p&&p.id):[]}
function anInitStore(){let idx=anIndex();
  if(!idx.length){const old=store.get('rk-anim',null),id='an'+uid();idx=[{id,name:'Animation 1',t:Date.now()}];store.set('rk-anim:'+id,old&&old.v===1?old:anDefault());store.set(AN_IDX,idx);store.set('rk-anim-cur',id)}
  let cur=store.get('rk-anim-cur',null);if(!idx.some(p=>p.id===cur))cur=idx[0].id;AN.pid=cur;store.set('rk-anim-cur',cur);return idx}
/* Vorschaubild der aktuellen Ansicht für die Übersicht */
function anCapture(){if(!AR||AN.rec||AR.renderer.domElement.width<10)return'';try{const s=AR.renderer.domElement,c=mk(320,Math.max(1,Math.round(320*s.height/s.width)));c.getContext('2d').drawImage(s,0,0,c.width,c.height);return c.toDataURL('image/jpeg',.7)}catch{return''}}
/* Übersicht aller Animationen (wie die Startseite der Thumbnails) */
function anHome(show=true){const h=$('#an-home');if(!h)return;h.hidden=!show;if(!show)return;anStop();h.innerHTML='';
  const w=document.createElement('div');w.className='wrap home';w.innerHTML='<h1>Animationen</h1><p class="lead">Tippe eine Animation an, um weiterzumachen. Alles speichert sich automatisch.</p><div class="fmt-grid"></div><h2>Deine Animationen <small></small></h2><div class="pgrid"></div>';h.append(w);
  const nb=document.createElement('button');nb.type='button';nb.className='fmt main';nb.innerHTML='<span class="ic">+</span><span><b>Neue Animation</b><span>Schritt für Schritt: Hintergrund, Figuren, Kamera, Licht, Video</span></span>';
  nb.addEventListener('click',()=>{const n=prompt('Name der neuen Animation:','Animation '+(anIndex().length+1));if(n===null)return;anNewProject(n);anHome(false)});
  const ob=document.createElement('button');ob.type='button';ob.className='fmt';ob.innerHTML='<span class="ic">⇪</span><span><b>Datei öffnen</b><span>.rnanim.json aus Rendernail</span></span>';ob.addEventListener('click',()=>$('#f-anfile').click());
  w.querySelector('.fmt-grid').append(nb,ob);
  const idx=anIndex().sort((a,b)=>b.t-a.t);w.querySelector('h2 small').textContent=idx.length||'';const g=w.querySelector('.pgrid');
  for(const p of idx){const c=document.createElement('div');c.className='pcard';const pv=document.createElement('button');pv.type='button';pv.className='pv';pv.setAttribute('aria-label',p.name+' öffnen');
    if(p.preview&&/^data:image\/jpeg;base64,/.test(p.preview)){const im=document.createElement('img');im.alt='';im.src=p.preview;pv.append(im)}else{const sp=document.createElement('span');sp.className='sub';sp.textContent='Noch keine Vorschau';pv.append(sp)}
    pv.addEventListener('click',()=>{if(p.id!==AN.pid)anOpenProject(p.id);anHome(false)});
    const meta=document.createElement('div');meta.className='meta';const t=document.createElement('div');t.style.minWidth='0';const b=document.createElement('b');b.textContent=p.name;const sp=document.createElement('span');sp.textContent='bearbeitet '+rel(new Date(p.t).toISOString());t.append(b,sp);
    const acts=document.createElement('div');acts.className='btnrow';acts.style.flexWrap='nowrap';
    const du=document.createElement('button');du.type='button';du.className='btn ghost sm';du.textContent='Kopie';du.addEventListener('click',()=>{if(p.id===AN.pid)anSaveNow();const d=store.get('rk-anim:'+p.id,null);if(!d)return;const id='an'+uid(),i=anIndex();i.unshift({id,name:(p.name+' (Kopie)').slice(0,60),t:Date.now(),preview:p.preview});if(store.set('rk-anim:'+id,d)&&store.set(AN_IDX,i)){toast('Kopie erstellt.');anHome(true)}else toast('Kein Platz mehr im Browser-Speicher.')});
    const de=document.createElement('button');de.type='button';de.className='btn ghost sm danger';de.textContent='Löschen';de.addEventListener('click',()=>{if(!confirm(`„${p.name}“ wirklich löschen?`))return;const i=anIndex().filter(x=>x.id!==p.id);try{localStorage.removeItem('rk-anim:'+p.id)}catch{}store.set(AN_IDX,i);
      if(p.id===AN.pid){if(i.length)anOpenProject(i[0].id);else{AN.pid=null;anNewProject('Animation 1')}}toast('Gelöscht.');anHome(true)});
    acts.append(du,de);meta.append(t,acts);c.append(pv,meta);g.append(c)}}
function anProjName(){const p=anIndex().find(x=>x.id===AN.pid);return p?p.name:'Animation'}
function anSaveNow(){clearTimeout(anSaveT);if(!AN.pid||!AN.data)return true;const ok=store.set('rk-anim:'+AN.pid,AN.data);
  const idx=anIndex(),p=idx.find(x=>x.id===AN.pid);if(p){p.t=Date.now();const pv=anCapture();if(pv)p.preview=pv;if(!store.set(AN_IDX,idx)){delete p.preview;store.set(AN_IDX,idx)}}
  const st=$('#an-savest');if(st)st.textContent=ok?'Gespeichert':'Nicht gespeichert';if(!ok)toast('Speichern fehlgeschlagen: Der Browser-Speicher ist voll. Lösche alte Animationen oder speichere als Datei.');return ok}
function anOpenProject(id){anSaveNow();anStop();AN.pid=id;store.set('rk-anim-cur',id);AN.data=anLoad();AN.hist=[JSON.stringify(AN.data)];AN.fut=[];AN.t=0;AN.sel=null;AN.bone=null;
  if(AR){AR.tc.detach();AR.tcm.detach();anRebuildAll();anFrameCam(true)}anProjUI();anUndoUI()}
function anNewProject(name,data){anSaveNow();const idx=anIndex(),id='an'+uid();name=(name||'').trim()||('Animation '+(idx.length+1));idx.unshift({id,name:name.slice(0,60),t:Date.now()});
  if(!store.set('rk-anim:'+id,data||anDefault())){toast('Kein Platz mehr im Browser-Speicher.');return}store.set(AN_IDX,idx);anOpenProject(id);if(!data)anGo(0);toast(`„${name}“ angelegt.`)}
function anProjUI(){const b=$('#an-proj');if(b)b.querySelector('span').textContent=anProjName()}
function anProjMenu(btn){closeMenu();const el2=document.createElement('div');el2.className='menu';el2.setAttribute('role','menu');
  const item=(label,fn,chk,kbd)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role',chk!=null?'menuitemradio':'menuitem');b.innerHTML='<span></span><kbd></kbd>';b.firstChild.textContent=label;b.lastChild.textContent=kbd||'';if(chk!=null)b.setAttribute('aria-checked',!!chk);b.addEventListener('click',()=>{closeMenu();fn()});el2.append(b)};
  const idx=anIndex().sort((a,b)=>b.t-a.t),when=t=>new Date(t).toLocaleDateString('de-DE',{day:'numeric',month:'short'});
  for(const p of idx.slice(0,15))item(p.name,()=>{if(p.id!==AN.pid)anOpenProject(p.id)},p.id===AN.pid,when(p.t));
  el2.append(document.createElement('hr'));
  item('Alle Animationen',()=>{anSaveNow();anHome(true)});
  item('Neue Animation',()=>anNewProject(prompt('Name der neuen Animation:','Animation '+(anIndex().length+1))||''));
  item('Umbenennen …',()=>{const n=prompt('Neuer Name:',anProjName());if(!n||!n.trim())return;const i=anIndex(),p=i.find(x=>x.id===AN.pid);if(p){p.name=n.trim().slice(0,60);store.set(AN_IDX,i);anProjUI()}});
  item('Kopie speichern',()=>{anSaveNow();anNewProject(anProjName()+' (Kopie)',JSON.parse(JSON.stringify(AN.data)))});
  el2.append(document.createElement('hr'));
  item('Als Datei speichern',async()=>{anSaveNow();const name=anProjName(),data=await anEmbedAudio(AN.data),blob=new Blob([JSON.stringify({app:'rendernail-animation',v:1,name,data})],{type:'application/json'});saveFile((slug(name)||'animation')+'.rnanim.json',blob)});
  item('Datei öffnen …',()=>$('#f-anfile').click());
  el2.append(document.createElement('hr'));
  item('Diese Animation löschen',()=>{if(!confirm(`„${anProjName()}“ wirklich löschen?`))return;const i=anIndex().filter(x=>x.id!==AN.pid);try{localStorage.removeItem('rk-anim:'+AN.pid)}catch{}store.set(AN_IDX,i);
    if(i.length)anOpenProject(i[0].id);else{AN.pid=null;anNewProject('Animation 1')}toast('Gelöscht.')});
  document.body.append(el2);const r=btn.getBoundingClientRect();el2.style.left=Math.max(6,Math.min(r.left,innerWidth-el2.offsetWidth-6))+'px';el2.style.top=r.bottom+4+'px';openMenu={el:el2,btn};btn.setAttribute('aria-expanded','true')}
function anLoad(){let d=store.get('rk-anim:'+AN.pid,null);if(!d||d.v!==1)return anDefault();const D=anDefault();
  try{d={...D,...d,bg:{...D.bg,...d.bg},cam:{...D.cam,...d.cam},light:{...D.light,...d.light},fx:{...D.fx,...d.fx}};
    d.blocks=Array.isArray(d.blocks)?d.blocks.filter(b=>Array.isArray(b)&&b.length===4).slice(0,30000):[];
    d.actors=(Array.isArray(d.actors)?d.actors:[]).slice(0,6).map(a=>({id:a.id||'a'+uid(),name:String(a.name||'Figur').slice(0,30),skin:typeof a.skin==='string'&&/^data:image\/png;base64,/.test(a.skin)?a.skin:'',slim:!!a.slim,item:typeof a.item==='string'?a.item:'',ign:a.ign===false?false:undefined,faces:(Array.isArray(a.faces)?a.faces:[]).filter(f=>f&&AN_EXPR[f.f]).map(f=>({t:clamp(+f.t||0,0,60),f:f.f})).sort((p,q)=>p.t-q.t),walk:a.walk!==false,size:cleanSize(a.size),
      keys:(Array.isArray(a.keys)&&a.keys.length?a.keys:[{t:0}]).map(k=>({t:clamp(+k.t||0,0,60),pose:k.pose&&typeof k.pose==='object'?k.pose:anPose('stehen'),x:+k.x||0,z:+k.z||0,ry:+k.ry||0,rx:+k.rx||0,rz:+k.rz||0,y:+k.y||0,ease:AN_EASE[k.ease]?k.ease:'smooth',...(typeof k.walk==='boolean'?{walk:k.walk}:{})})).sort((p,q)=>p.t-q.t)}));
    d.props=(Array.isArray(d.props)?d.props:[]).slice(0,40).filter(o=>o&&typeof o.key==='string').map(o=>({id:o.id||'p'+uid(),name:String(o.name||'Block').slice(0,30),key:o.key,
      keys:(Array.isArray(o.keys)&&o.keys.length?o.keys:[{t:0}]).map(k=>({t:clamp(+k.t||0,0,60),x:+k.x||0,y:+k.y||0,z:+k.z||0,rx:+k.rx||0,ry:+k.ry||0,rz:+k.rz||0,s:k.s==null?1:clamp(+k.s,0,8),ease:AN_EASE[k.ease]?k.ease:'smooth'})).sort((p,q)=>p.t-q.t)}));
    d.fps=[15,24,30,60].includes(+d.fps)?+d.fps:30;if(!['none','comic','retro'].includes(d.fx.look))d.fx.look='none';
    d.audio=(Array.isArray(d.audio)?d.audio:[]).filter(c=>c&&typeof c.asset==='string').slice(0,12).map(c=>({id:c.id||'au'+uid(),name:String(c.name||'Ton').slice(0,40),asset:c.asset,dur:Math.max(.05,+c.dur||1),at:Math.max(0,+c.at||0),vol:clamp(c.vol==null?1:+c.vol,0,1.5),...(typeof c.data==='string'?{data:c.data}:{})}));
    d.cam.keys=(d.cam.keys||[]).filter(k=>Array.isArray(k.p)&&Array.isArray(k.q)).map(k=>({t:+k.t||0,p:k.p.map(Number),q:k.q.map(Number)})).sort((p,q)=>p.t-q.t);
    d.dur=clamp(+d.dur||6,2,30);if(!AN_FMT[d.fmt])d.fmt='16:9'}catch{return D}return d}
let anSaveT=0;
function anCommit(){const s=JSON.stringify(AN.data);if(AN.hist[AN.hist.length-1]!==s){AN.hist.push(s);if(AN.hist.length>80)AN.hist.shift();AN.fut=[]}
  clearTimeout(anSaveT);const st=$('#an-savest');if(st)st.textContent='Ungespeichert …';anSaveT=setTimeout(anSaveNow,400);anUndoUI()}
function anUndo(dir){if(dir<0){if(AN.hist.length<2)return;AN.fut.push(AN.hist.pop())}else{if(!AN.fut.length)return;AN.hist.push(AN.fut.pop())}
  AN.data=JSON.parse(AN.hist[AN.hist.length-1]);anSaveNow();anRebuildAll();anUndoUI()}
function anUndoUI(){const u=$('#an-undo'),r=$('#an-redo');if(u)u.disabled=AN.hist.length<2;if(r)r.disabled=!AN.fut.length}

/* ---------- Szene ---------- */
function initAnim(){
  if(AN.ready||AN.failed)return;
  const fail=t=>{AN.failed=true;const f=$('#an-fail');f.hidden=false;f.textContent=t};
  if(!window.THREE||!THREE.OrbitControls||!THREE.TransformControls){fail('Die 3D-Ansicht konnte nicht geladen werden. Prüf die Internetverbindung und lade die Seite neu.');return}
  const T=THREE;let renderer;
  try{renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true})}catch{fail('Dein Browser kann hier kein 3D (WebGL) darstellen.');return}
  renderer.outputEncoding=T.sRGBEncoding;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;$('#an-frame').prepend(renderer.domElement);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(35,16/9,1,12000);camera.position.set(-90,60,130);
  const controls=new T.OrbitControls(camera,renderer.domElement);controls.target.set(0,16,0);controls.minDistance=18;controls.maxDistance=2600;controls.maxPolarAngle=Math.PI*.495;controls.enableDamping=false;
  controls.addEventListener('start',()=>{if(anLook()==='cam'&&AN_STEPS[AN.step][0]==='cam'){AN.camEdit=true;anStop()}AN.tween=null});
  controls.addEventListener('end',()=>{if(AN.camEdit){AN.camEdit=false;anSetCamKey()}});
  const sky=new T.Mesh(new T.SphereGeometry(9000,32,16),new T.ShaderMaterial({uniforms:{top:{value:new T.Color()},hz:{value:new T.Color()},bel:{value:new T.Color()}},side:T.BackSide,depthWrite:false,fog:false,
    vertexShader:'varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'uniform vec3 top;uniform vec3 hz;uniform vec3 bel;varying vec3 vD;void main(){float y=vD.y;vec3 c=y>0.?mix(hz,top,pow(clamp(y*1.7,0.,1.),.75)):mix(hz,bel,clamp(-y*5.,0.,1.));gl_FragColor=vec4(c,1.);}'}));
  sky.renderOrder=-10;sky.frustumCulled=false;scene.add(sky);
  const sun=new T.Sprite(new T.SpriteMaterial({transparent:true,depthWrite:false,fog:false}));sun.scale.set(820,820,1);sun.renderOrder=-9;scene.add(sun);
  const sp=[];for(let i=0;i<1100;i++){const a=Math.random()*Math.PI*2,y=Math.random()*.95+.04,r=Math.sqrt(1-y*y);sp.push(Math.cos(a)*r*8500,y*8500,Math.sin(a)*r*8500)}
  const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(sp,3));
  const stars=new T.Points(sg,new T.PointsMaterial({size:1.6,sizeAttenuation:false,color:0xffffff,transparent:true,opacity:.85,fog:false,depthWrite:false}));stars.frustumCulled=false;scene.add(stars);
  const clouds=new T.Group();scene.add(clouds);
  const hemi=new T.HemisphereLight(0xffffff,0x444444,.6);scene.add(hemi);
  const dir=new T.DirectionalLight(0xffffff,1);dir.castShadow=true;dir.shadow.mapSize.set(2048,2048);dir.shadow.bias=-.0004;dir.shadow.normalBias=.5;scene.add(dir);scene.add(dir.target);
  const fill=new T.DirectionalLight(0xb8c8ff,.2);scene.add(fill);
  const ground=new T.Mesh(new T.PlaneGeometry(AB*800,AB*800),new T.MeshLambertMaterial({color:0xffffff}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const blocks=new T.Group();scene.add(blocks);const actors=new T.Group();scene.add(actors);const props=new T.Group();scene.add(props);
  const helpers=new T.Group();scene.add(helpers);
  const ghost=new T.Group(),gbox=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.16,depthWrite:false})),gl=new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(1,1,1)),new T.LineBasicMaterial({color:0xffffff}));
  ghost.add(gbox,gl);ghost.visible=false;helpers.add(ghost);
  const ring=new T.Mesh(new T.RingGeometry(10,11.6,48),new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.75,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.visible=false;helpers.add(ring);
  const path=new T.Line(new T.BufferGeometry(),new T.LineDashedMaterial({color:0xe6e6e6,dashSize:7,gapSize:5,transparent:true,opacity:.85,depthTest:false}));path.renderOrder=5;helpers.add(path);
  const camMark=new T.Mesh(new T.ConeGeometry(5,9,4,1,true),new T.MeshBasicMaterial({color:0xe6e6e6,wireframe:true,depthTest:false}));camMark.renderOrder=5;helpers.add(camMark);
  const tc=new T.TransformControls(camera,renderer.domElement);tc.setMode('rotate');tc.setSpace('local');tc.setSize(COARSE?1:.7);
  tc.addEventListener('dragging-changed',e=>{controls.enabled=!e.value;AN.tcDrag=e.value;if(!e.value)anCommit()});
  tc.addEventListener('objectChange',anReadBone);scene.add(tc);
  const tcm=new T.TransformControls(camera,renderer.domElement);tcm.setMode('translate');tcm.setSpace('world');tcm.setSize(COARSE?1.3:.95);
  tcm.addEventListener('dragging-changed',e=>{controls.enabled=!e.value;AN.tcDrag=e.value;if(!e.value){anCommit();anPane()}});
  tcm.addEventListener('objectChange',anReadMove);scene.add(tcm);
  {const pk=tc._gizmo&&tc._gizmo.picker&&tc._gizmo.picker.rotate;if(pk)pk.children.filter(c=>c.name==='XYZE').forEach(c=>pk.remove(c))}/* nur an den Ringen drehen; Ziehen auf der Figur verschiebt sie */
  AR={renderer,scene,camera,controls,sky,sun,stars,clouds,hemi,dir,fill,ground,blocks,actors,props,helpers,ghost,gbox,gl,ring,path,camMark,tc,tcm,stage:$('#an-stage'),frame:$('#an-frame'),aniso:Math.min(8,renderer.capabilities.getMaxAnisotropy())};
  new ResizeObserver(anResize).observe(AR.stage);anPointer();
  anInitStore();anProjUI();AN.data=anLoad();AN.hist=[JSON.stringify(AN.data)];AN.step=clamp(+store.get('rk-anim-step',0)||0,0,AN_STEPS.length-1);
  AN.ready=true;anRebuildAll();anFrameCam(false);anSteps();anResize()}
function startAnim(){initAnim();if(AR&&!AN.running){AN.running=true;AN.last=0;anResize();requestAnimationFrame(anLoop)}}
function anResize(){if(!AR)return;const r=AR.stage.getBoundingClientRect(),[fw,fh]=AN_FMT[AN.data.fmt].s[0],pad=r.width<600?8:18,aw=Math.max(40,r.width-pad*2),ah=Math.max(40,r.height-pad*2);
  let w=aw,h=aw*fh/fw;if(h>ah){h=ah;w=ah*fw/fh}w=Math.round(w);h=Math.round(h);
  Object.assign(AR.frame.style,{width:w+'px',height:h+'px',left:Math.round((r.width-w)/2)+'px',top:Math.round((r.height-h)/2)+'px'});if(typeof anGuide==='function')anGuide();
  if(AN.rec)return;AR.renderer.setPixelRatio(Math.min(COARSE?1.5:2,window.devicePixelRatio||1));AR.renderer.setSize(w,h,false);AR.camera.aspect=fw/fh;AR.camera.updateProjectionMatrix();anFx()}

/* Blöcke: ein Netz pro Blockart, verdeckte Seiten fallen weg, Ecken bekommen weiche Schatten (wie „Weiches Licht“) */
const AN_FACES=[[0,1,[[1,1,1],[1,1,0],[1,0,1],[1,0,0]],1],[0,-1,[[0,1,0],[0,1,1],[0,0,0],[0,0,1]],1],[1,1,[[0,1,0],[1,1,0],[0,1,1],[1,1,1]],0],[1,-1,[[0,0,1],[1,0,1],[0,0,0],[1,0,0]],2],[2,1,[[0,1,1],[1,1,1],[0,0,1],[1,0,1]],3],[2,-1,[[1,1,0],[0,1,0],[1,0,0],[0,0,0]],1]];
const AN_UV=[[0,1],[1,1],[0,0],[1,0]],AN_AO=[.5,.68,.84,1];
const anTexCache=new Map(),anMatCache=new Map(),anOpq=new Map();
function anTex(c){let t=anTexCache.get(c);if(t)return t;const T=THREE;t=new T.CanvasTexture(c);t.magFilter=T.NearestFilter;t.minFilter=T.NearestMipmapLinearFilter;t.encoding=T.sRGBEncoding;t.anisotropy=AR?AR.aniso:1;anTexCache.set(c,t);return t}
function anFaces(k){const t=blockTex(k)||{},s=t.side||t.top;if(!s)return null;return[t.top||s,s,t.bottom||t.top||s,t.front||s]}
function anOpaque(k){const key=k+'|'+packTick;let v=anOpq.get(key);if(v==null){const f=anFaces(k);v=!!f&&!/water|ice/.test(k)&&!(typeof hasAlpha==='function'&&(hasAlpha(f[0])||hasAlpha(f[1])));anOpq.set(key,v)}return v}
function anMats(k){const key=k+'|'+packTick;let m=anMatCache.get(key);if(m)return m;const T=THREE,f=anFaces(k),t=blockTex(k)||{},water=/water/.test(k),alpha=!anOpaque(k)&&!water,bright=t.bright||/lava|glowstone|sea_lantern|shroomlight|froglight|magma/.test(k);
  m=f.map(c=>{const o={map:anTex(c)};if(alpha){o.alphaTest=.5;o.side=T.DoubleSide}if(water){o.transparent=true;o.opacity=.8}return bright?new T.MeshBasicMaterial(o):new T.MeshLambertMaterial({...o,vertexColors:true})});
  anMatCache.set(key,m);return m}
function anRebuildBlocks(){if(!AR)return;const T=THREE;
  for(const m of AN.blockMeshes){AR.blocks.remove(m);m.geometry.dispose()}AN.blockMeshes=[];
  const cells=AN.cells=new Map(),col=AN.colTop=new Map();
  for(const[x,y,z,k]of AN.data.blocks){if(!anFaces(k))continue;cells.set(x+','+y+','+z,k);const top=(y+1)*AB;if(top<=AB*2){const c=x+','+z;if(!col.has(c)||col.get(c)<top)col.set(c,top)}}
  const has=(x,y,z)=>cells.has(x+','+y+','+z)?1:0,by=new Map();
  for(const[key,k]of cells){const[x,y,z]=key.split(',').map(Number);let G=by.get(k);if(!G){G=[0,1,2,3].map(()=>({p:[],n:[],u:[],c:[],i:[]}));by.set(k,G)}
    for(const[ax,sg,cs,mi]of AN_FACES){const n=[0,0,0];n[ax]=sg;const nk=cells.get((x+n[0])+','+(y+n[1])+','+(z+n[2]));if(nk&&(nk===k||anOpaque(nk)))continue;
      const g=G[mi],b=g.p.length/3,u=(ax+1)%3,v=(ax+2)%3,ao=[];
      cs.forEach((c,ci)=>{g.p.push((x+c[0])*AB,(y+c[1])*AB,(z+c[2])*AB);g.n.push(...n);g.u.push(...AN_UV[ci]);
        const o=[x+n[0],y+n[1],z+n[2]],du=[0,0,0],dv=[0,0,0];du[u]=c[u]?1:-1;dv[v]=c[v]?1:-1;
        const s1=has(o[0]+du[0],o[1]+du[1],o[2]+du[2]),s2=has(o[0]+dv[0],o[1]+dv[1],o[2]+dv[2]),cr=has(o[0]+du[0]+dv[0],o[1]+du[1]+dv[1],o[2]+du[2]+dv[2]);
        const a=s1&&s2?0:3-(s1+s2+cr);ao.push(a);const l=AN_AO[a];g.c.push(l,l,l)});
      if(ao[0]+ao[3]>ao[1]+ao[2])g.i.push(b,b+2,b+3,b,b+3,b+1);else g.i.push(b,b+2,b+1,b+1,b+2,b+3)}}
  for(const[k,G]of by){const p=[],n=[],u=[],c=[],idx=[],geo=new T.BufferGeometry();let start=0;
    G.forEach((g,mi)=>{const off=p.length/3;p.push(...g.p);n.push(...g.n);u.push(...g.u);c.push(...g.c);for(const i of g.i)idx.push(i+off);if(g.i.length)geo.addGroup(start,g.i.length,mi);start+=g.i.length});
    if(!idx.length)continue;geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(n,3));geo.setAttribute('uv',new T.Float32BufferAttribute(u,2));geo.setAttribute('color',new T.Float32BufferAttribute(c,3));geo.setIndex(idx);
    const mesh=new T.Mesh(geo,anMats(k));mesh.castShadow=true;mesh.receiveShadow=true;AR.blocks.add(mesh);AN.blockMeshes.push(mesh)}
  AN.pathDirty=true}
function groundY(x,z){let g=AN.colTop.get(Math.floor(x/AB)+','+Math.floor(z/AB))||0;
  /* Betten und bewegliche Blöcke tragen Figuren auch (z. B. hinlegen aufs Bett) */
  const P=AN.data&&AN.data.props;if(P&&P.length&&typeof evalProp==='function')for(const o of P){const v=evalProp(o,AN.t);if(Math.abs(v.rx)>5||Math.abs(v.rz)>5)continue;
    const bed=o.key.startsWith('bed:'),top=v.y+(bed?9:16)*v.s;if(top<=g||top>48)continue;const a=v.ry*Math.PI/180,dx=x-v.x,dz=z-v.z,lx=dx*Math.cos(a)-dz*Math.sin(a),lz=dx*Math.sin(a)+dz*Math.cos(a);
    if(Math.abs(lx)<=8*v.s&&Math.abs(lz)<=(bed?16:8)*v.s)g=top}
  return g}

/* Himmel, Boden, Wolken, Licht */
let anCloudKey='';
function anClouds(){const key=packTick+'|'+(mcCloudMap().key);if(anCloudKey===key)return;anCloudKey=key;const T=THREE;
  AR.clouds.children.slice().forEach(o=>{AR.clouds.remove(o);o.geometry.dispose()});
  const map=mcCloudMap(),N=map.n,R=22,CS=12*AB,H=4*AB,Y=1250,on=(i,j)=>map.a[((j%N+N)%N)*N+((i%N+N)%N)],p=[],c=[],idx=[];
  const quad=(a,b,cc,d,l)=>{const s=p.length/3;p.push(...a,...b,...cc,...d);for(let i=0;i<4;i++)c.push(l,l,l);idx.push(s,s+1,s+2,s,s+2,s+3)};
  for(let j=-R;j<R;j++)for(let i=-R;i<R;i++){if(!on(i,j))continue;const x0=i*CS,x1=x0+CS,z0=j*CS,z1=z0+CS,y0=Y,y1=Y+H;
    quad([x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0],1);quad([x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],.78);
    if(!on(i-1,j))quad([x0,y0,z0],[x0,y0,z1],[x0,y1,z1],[x0,y1,z0],.9);if(!on(i+1,j))quad([x1,y0,z1],[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],.9);
    if(!on(i,j-1))quad([x1,y0,z0],[x0,y0,z0],[x0,y1,z0],[x1,y1,z0],.86);if(!on(i,j+1))quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1],.86)}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.setIndex(idx);
  const m=new T.Mesh(g,new T.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.85,side:T.DoubleSide,depthWrite:false}));m.frustumCulled=false;AR.clouds.add(m)}
let anSunKey='';
function anApplyLook(){if(!AR)return;const T=THREE,D=AN.data,L=D.light,mc=D.bg.mode==='mc',C=MC_SKY[L.sky]||MC_SKY.day;
  AR.sky.visible=mc;AR.clouds.visible=mc;AR.stars.visible=mc&&L.sky==='night';AR.sun.visible=mc&&L.el>-4;
  AR.sky.material.uniforms.top.value.set(C.top);AR.sky.material.uniforms.hz.value.set(C.hz);AR.sky.material.uniforms.bel.value.set(hexMix(C.hz,'#000000',.25));
  const fogCol=mc?C.hz:D.bg.color;AR.scene.background=mc?null:new T.Color(D.bg.color).convertSRGBToLinear();
  const near=2600-L.fog*2300,far=6000-L.fog*4200;AR.scene.fog=new T.Fog(new T.Color(fogCol).convertSRGBToLinear(),near,Math.max(near+200,far));
  if(mc){anClouds();AR.clouds.children.forEach(m=>m.material.color.set(C.cloud).convertSRGBToLinear())}
  const sk=L.sky+'|'+packTick;if(anSunKey!==sk){anSunKey=sk;const t=new T.CanvasTexture(mcSun(L.sky));t.magFilter=T.NearestFilter;t.encoding=T.sRGBEncoding;if(AR.sun.material.map)AR.sun.material.map.dispose();AR.sun.material.map=t;
    AR.sun.material.blending=L.sky==='night'?T.NormalBlending:T.AdditiveBlending;AR.sun.material.needsUpdate=true}
  const g=D.bg.ground;AR.ground.visible=g!=='none';
  if(g!=='none'){const k={grass:'grass',sand:'sand',stone:'stone',snow:'snow'}[g]||'grass',f=anFaces(k),c=f&&f[0];if(c){const key=k+'|'+packTick;if(AR.ground.userData.key!==key){AR.ground.userData.key=key;const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(800,800);t.magFilter=T.NearestFilter;t.minFilter=T.LinearMipmapLinearFilter;t.anisotropy=AR.aniso;t.encoding=T.sRGBEncoding;
      if(AR.ground.material.map)AR.ground.material.map.dispose();AR.ground.material.map=t;AR.ground.material.needsUpdate=true}}}
  const H=AN_HEMI[L.sky]||AN_HEMI.day;AR.hemi.color.set(H[0]).convertSRGBToLinear();AR.hemi.groundColor.set(H[1]).convertSRGBToLinear();AR.hemi.intensity=.62*L.amb;
  AR.dir.color.set(L.sun).convertSRGBToLinear();AR.dir.intensity=.95*L.power*(L.el<3?Math.max(.15,L.el/3):1);AR.fill.intensity=.22*L.amb;
  AR.dir.castShadow=!!L.shadows;AR.dir.shadow.radius=L.soft;anSunPos();anFx()}
function anSunDir(){const L=AN.data.light,a=L.az*D2R,e=L.el*D2R;return new THREE.Vector3(Math.cos(e)*Math.sin(a),Math.sin(e),Math.cos(e)*Math.cos(a))}
function anSunPos(){const s=anSceneInfo(),d=anSunDir(),R=Math.max(220,s.r+90);AR.dir.target.position.set(s.c[0],0,s.c[2]);AR.dir.position.set(s.c[0]+d.x*1400,d.y*1400,s.c[2]+d.z*1400);
  Object.assign(AR.dir.shadow.camera,{left:-R,right:R,top:R,bottom:-R,near:10,far:3200});AR.dir.shadow.camera.updateProjectionMatrix();AR.fill.position.set(-d.x*600,300,-d.z*600)}
function anSceneInfo(){const D=AN.data;let n=0,x0=1e9,x1=-1e9,z0=1e9,z1=-1e9,y1=0;
  for(const a of D.actors){const k=a.keys[0];if(!k)continue;n++;x0=Math.min(x0,k.x);x1=Math.max(x1,k.x);z0=Math.min(z0,k.z);z1=Math.max(z1,k.z)}
  if(!n&&D.blocks.length){for(const[x,y,z]of D.blocks.slice(0,4000)){x0=Math.min(x0,x*AB);x1=Math.max(x1,(x+1)*AB);z0=Math.min(z0,z*AB);z1=Math.max(z1,(z+1)*AB);y1=Math.max(y1,(y+1)*AB)}n=1}
  if(!n)return{c:[0,16,0],r:48};const c=[(x0+x1)/2,0,(z0+z1)/2];c[1]=(D.actors.length?groundY(c[0],c[2]):0)+16;return{c,r:Math.max(48,Math.hypot(x1-x0,z1-z0)/2+24,y1*.6)}}
function anFx(){if(!AR)return;const D=AN.data,L=D.light,fr=AR.frame,w=fr.clientWidth,h=fr.clientHeight;
  fr.style.setProperty('--vig',L.vig);const t=$('#an-tint');t.style.background=L.tint>0?'#ff9a3c':'#4682ff';t.style.opacity=Math.abs(L.tint)*.55;
  const bh=D.fx.bars?(w>h?Math.max(0,(h-w/2.39)/2):h*.09):0;$('#an-bar-t').style.height=$('#an-bar-b').style.height=bh+'px'}

/* ---------- Figuren ---------- */
const anSkins=new Map(),anSkinLoad=new Set();
function anSkin(a){if(!a.skin)return GRAY_SKIN;const c=anSkins.get(a.skin);if(c)return c;
  if(!anSkinLoad.has(a.skin)){anSkinLoad.add(a.skin);loadImage(a.skin).then(im=>{const c=mk(64,im.naturalHeight===32?32:64);c.getContext('2d').drawImage(im,0,0);anSkins.set(a.skin,c);anSyncActors()}).catch(()=>{})}return null}
function anDispose(o){o.traverse(x=>{if(x.geometry)x.geometry.dispose();if(x.material)[].concat(x.material).forEach(m=>{if(m.map)m.map.dispose();m.dispose()})})}
function anSyncActors(){if(!AR)return;const ids=new Set(AN.data.actors.map(a=>a.id));
  for(const[id,rt]of AN.rts)if(!ids.has(id)){AR.actors.remove(rt.m.group);anDispose(rt.m.group);AN.rts.delete(id)}
  for(const a of AN.data.actors){const sk=anSkin(a),sig=[a.skin.length,a.skin.slice(-40),!!sk,a.slim,a.item,JSON.stringify(a.size||{}),packTick].join('|');let rt=AN.rts.get(a.id);
    if(rt&&rt.sig===sig)continue;if(rt){AR.actors.remove(rt.m.group);anDispose(rt.m.group)}
    const m={id:a.id,slim:!!a.slim,item:a.item||'',size:a.size||{},pose:{},rootY:0,x:0,z:0,ry:0};m.group=buildRig(m,sk||GRAY_SKIN);AR.actors.add(m.group);
    m.group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true}});rt={m,sig,face:null};AN.rts.set(a.id,rt)}
  if(AN.bone&&AN.sel){const rt=AN.rts.get(AN.sel);if(rt&&rt.m.bones[AN.bone]&&AR.tc.object!==rt.m.bones[AN.bone])AR.tc.attach(rt.m.bones[AN.bone])}
  if(AN.sel&&!AN.bone&&AR.tcm.object){const rt=AN.rts.get(AN.sel);if(rt&&AR.tcm.object!==rt.m.group)AR.tcm.attach(rt.m.group)}}
/* Läuft die Figur auf der Strecke bis zu diesem Schlüsselbild? Eigene Einstellung am Schlüsselbild, sonst die der Figur */
const anWalks=(a,k)=>typeof k.walk==='boolean'?k.walk:a.walk!==false;
/* Gesichter: Ausdrücke als 8×8-Pixel über der unteren Gesichtshälfte (s Haut, w weiß, e Auge, m Mund, r Zunge) */
const AN_EXPR={normal:['Normal',null],blink:['Augen zu',['','','','','ssssssss','seesseee','','']],happy:['Fröhlich',['','','','','seessees','esseesse','smssssms','ssmmmmss']],
  laugh:['Lachen',['','','','','seessees','esseesse','smmmmmms','ssmrrmss']],talk:['Sprechen',['','','','','swessews','ssssssss','sssmmsss','sssmmsss']],
  wow:['Staunen',['','','','ssssssss','swessews','swessews','sssmmsss','sssmmsss']],angry:['Wütend',['','','','eessssee','sweSSews'.replace(/S/g,'s'),'ssssssss','ssmmmmss','smssssms']],
  sad:['Traurig',['','','','seessees','swessews','ssssssss','ssmmmmss','smssssms']],wink:['Zwinkern',['','','','','swessess','sssssees','smssssms','ssmmmmss']],
  sleep:['Schlafen',['','','','','ssssssss','seesseee','ssssssss','sssmssss']]};
function evalFace(a,t){let f='normal';for(const k of a.faces||[])if(k.t<=t+1e-6)f=k.f;else break;return f}
function anFaceCanvas(sk,f){const d=AN_EXPR[f]&&AN_EXPR[f][1];if(!d)return null;const c=mk(8,8),x=c.getContext('2d');
  const px=sk.getContext('2d').getImageData(8,8,8,8).data,cnt={};let best='#c69c7d',bn=0;for(let i=0;i<64;i++){if(px[i*4+3]<200)continue;const k=(px[i*4]>>3)+','+(px[i*4+1]>>3)+','+(px[i*4+2]>>3);cnt[k]=(cnt[k]||0)+1;if(cnt[k]>bn){bn=cnt[k];best=`rgb(${px[i*4]},${px[i*4+1]},${px[i*4+2]})`}}
  const col={s:best,w:'#ffffff',e:'#231a16',m:'#4a2420',r:'#c4505b'};d.forEach((row,y)=>{[...row].forEach((ch,xx)=>{if(col[ch]){x.fillStyle=col[ch];x.fillRect(xx,y,1,1)}})});return c}
function anApplyFace(a,rt){const f=evalFace(a,AN.t);if(rt.face===f)return;rt.face=f;const m=rt.m,head=m.bones&&m.bones.head;if(!head)return;
  if(rt.fmesh){head.remove(rt.fmesh);rt.fmesh.geometry.dispose();if(rt.fmesh.material.map)rt.fmesh.material.map.dispose();rt.fmesh.material.dispose();rt.fmesh=null}
  const c=anFaceCanvas(anSkin(a)||GRAY_SKIN,f);if(!c)return;const T=THREE,k=((a.size||{}).head||100)/100,tex=new T.CanvasTexture(c);tex.magFilter=T.NearestFilter;tex.minFilter=T.NearestFilter;tex.generateMipmaps=false;tex.encoding=T.sRGBEncoding;
  const me=new T.Mesh(new T.PlaneGeometry(8*k,8*k),new T.MeshLambertMaterial({map:tex,transparent:true,alphaTest:.5,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));me.position.set(0,4*k,4*k+.02);head.add(me);rt.fmesh=me}
const lerp=(a,b,u)=>a+(b-a)*u,lerpAng=(a,b,u)=>a+((((b-a)%360)+540)%360-180)*u;
function evalActor(a,t,noWalk){const K=a.keys;if(!K.length)return{pose:{},x:0,z:0,ry:0,y:0};
  const fix=k=>({pose:anClone(k.pose||{}),x:k.x,z:k.z,ry:k.ry,rx:k.rx||0,rz:k.rz||0,y:k.y});
  if(t<=K[0].t)return fix(K[0]);if(t>=K[K.length-1].t)return fix(K[K.length-1]);
  let i=0;while(i<K.length-2&&t>=K[i+1].t)i++;const k0=K[i],k1=K[i+1],u=(t-k0.t)/Math.max(1e-6,k1.t-k0.t),e=(AN_EASE[k1.ease]||AN_EASE.smooth)[1](u);
  const pose={};for(const b of new Set([...Object.keys(k0.pose||{}),...Object.keys(k1.pose||{})])){const r0=(k0.pose||{})[b]||[0,0,0],r1=(k1.pose||{})[b]||[0,0,0];pose[b]=[0,1,2].map(j=>lerp(r0[j],r1[j],e))}
  const s={pose,x:lerp(k0.x,k1.x,e),z:lerp(k0.z,k1.z,e),ry:lerpAng(k0.ry,k1.ry,e),rx:lerp(k0.rx||0,k1.rx||0,e),rz:lerp(k0.rz||0,k1.rz||0,e),y:lerp(k0.y,k1.y,e)};
  /* In der Luft (Sprung, Parkour): Höhe in der Welt glatt von Schlüsselbild zu Schlüsselbild, unabhängig davon, was darunter ist.
     Steht die Figur an beiden Schlüsselbildern auf dem Boden, folgt sie dem Gelände. */
  const walks=anWalks(a,k1);
  if(!walks||Math.abs(k0.y)>.5||Math.abs(k1.y)>.5){const a0=groundY(k0.x,k0.z)+k0.y,a1=groundY(k1.x,k1.z)+k1.y;s.y=lerp(a0,a1,e)-groundY(s.x,s.z)}
  else{const g0=Math.min(groundY(k0.x,k0.z),groundY(k1.x,k1.z)),gp=groundY(s.x,s.z);if(gp<g0)s.y+=g0-gp}/* beim Laufen nie in Lücken zwischen gleich hohen Blöcken fallen */
  const dx=k1.x-k0.x,dz=k1.z-k0.z,d=Math.hypot(dx,dz);
  if(!noWalk&&walks&&d>6&&k1.ease!=='hold'){const amp=clamp(Math.min(u,1-u)*6,0,1),ph=e*d/AB*Math.PI,sw=Math.sin(ph),add=(b,v)=>{const r=pose[b]||[0,0,0];pose[b]=[r[0]+v,r[1],r[2]]};
    add('legR',38*sw*amp);add('legL',-38*sw*amp);add('armR',-32*sw*amp);add('armL',32*sw*amp);add('legRLow',22*Math.max(0,sw)*amp);add('legLLow',22*Math.max(0,-sw)*amp);
    s.y+=.9*Math.abs(Math.cos(ph))*amp;s.ry=lerpAng(s.ry,Math.atan2(dx,dz)/D2R,Math.min(1,amp*1.4))}
  return s}
function anApplyActors(){for(const a of AN.data.actors){const rt=AN.rts.get(a.id);if(!rt)continue;const s=evalActor(a,AN.t,!AN.playing&&!AN.rec&&AN.sel===a.id&&AN.bone),m=rt.m;
    m.pose=s.pose;m.x=s.x;m.z=s.z;m.ry=s.ry;m.rootY=groundY(s.x,s.z)+s.y;applyPose(m);anApplyFace(a,rt);m.group.rotation.order='YXZ';m.group.rotation.x=(s.rx||0)*D2R;m.group.rotation.z=(s.rz||0)*D2R}}
function anKeyAt(keys,t){return keys.find(k=>Math.abs(k.t-t)<.02)}
AN.moveAll=false;
function anShift(keys,cur,patch,fields){const dl={};for(const f of fields)if(f in patch)dl[f]=patch[f]-(cur[f]||0);for(const k of keys)for(const f in dl)k[f]=(k[f]||0)+dl[f];AN.pathDirty=true}
function anSetKey(a,patch){const t=AN.t;if(AN.moveAll&&!('pose'in patch)&&['x','z','y','ry','rx','rz'].some(f=>f in patch)){anShift(a.keys,evalActor(a,t,true),patch,['x','z','y','ry','rx','rz']);return}let k=anKeyAt(a.keys,t);
  if(!k){const s=evalActor(a,t,true),nx=a.keys.find(q=>q.t>t);k={t,pose:s.pose,x:s.x,z:s.z,ry:s.ry,rx:s.rx||0,rz:s.rz||0,y:s.y,ease:nx?nx.ease:'smooth'};a.keys.push(k);a.keys.sort((p,q)=>p.t-q.t);anTimeline()}
  Object.assign(k,patch);AN.pathDirty=true}
function anReadBone(){const a=anActor(),b=AN.bone;if(!a||!b)return;const rt=AN.rts.get(a.id),o=rt.m.bones[b].rotation,r=[o.x,o.y,o.z].map(v=>Math.round(v/D2R*10)/10);
  const s=evalActor(a,AN.t,true);anSetKey(a,{pose:{...s.pose,[b]:r}});anBoneUI()}
function anFocusActor(id){const rt=AN.rts.get(id);if(!rt||anLook()!=='work')return;const m=rt.m,cam=AR.camera,c=[m.x,m.rootY+17,m.z],want=32/(.62*2*Math.tan(cam.fov*D2R/2));
  const d=new THREE.Vector3().subVectors(cam.position,new THREE.Vector3(...c)),dist=d.length();if(dist<want*1.25)return;d.normalize();anTweenTo([c[0]+d.x*want,c[1]+d.y*want,c[2]+d.z*want],c,550)}
/* ---------- Bewegliche Blöcke ---------- */
AN.pmesh=new Map();AN.pmode='translate';
const anPBox=()=>{const T=THREE;return anPBox.g||(anPBox.g=new T.BoxGeometry(AB,AB,AB))};
function anPropMats(k){const key='p|'+k+'|'+packTick;let m=anMatCache.get(key);if(m)return m;const T=THREE,f=anFaces(k);if(!f)return null;const t=blockTex(k)||{},water=/water/.test(k),alpha=!anOpaque(k)&&!water,bright=t.bright||/lava|glowstone|sea_lantern|shroomlight|froglight|magma/.test(k);
  const mk2=c=>{const o={map:anTex(c)};if(alpha){o.alphaTest=.5;o.side=T.DoubleSide}if(water){o.transparent=true;o.opacity=.8}return bright?new T.MeshBasicMaterial(o):new T.MeshLambertMaterial(o)};
  const [top,side,bot,front]=f.map(mk2);m=[side,side,top,bot,front,side];anMatCache.set(key,m);return m}
function anPropPalette(){return anPalette().concat(typeof packBedColors==='function'?packBedColors().map(c=>['bed:'+c,prettyName(c+'_bed')]):[])}
function anSyncProps(){if(!AR)return;const ids=new Set(AN.data.props.map(o=>o.id));
  for(const[id,m]of AN.pmesh)if(!ids.has(id)){AR.props.remove(m);AN.pmesh.delete(id)}
  for(const o of AN.data.props){let m=AN.pmesh.get(o.id);const sig=o.key+'|'+packTick;if(m&&m.userData.sig===sig)continue;
    if(o.key.startsWith('bed:')){if(!PACK)continue;if(m){AR.props.remove(m);anDispose(m)}const b=bedMesh(o.key.slice(4));b.position.y=-AB/2;m=new THREE.Group();m.add(b);m.userData={prop:o.id,sig};
      m.traverse(x=>{if(x.isMesh){x.castShadow=true;x.receiveShadow=true;x.userData={prop:o.id}}});AR.props.add(m);AN.pmesh.set(o.id,m);continue}
    const mats=anPropMats(o.key);if(!mats)continue;if(m&&!m.isMesh){AR.props.remove(m);anDispose(m);m=null}
    if(m){m.material=mats;m.userData.sig=sig;continue}m=new THREE.Mesh(anPBox(),mats);m.castShadow=true;m.receiveShadow=true;m.userData={prop:o.id,sig};AR.props.add(m);AN.pmesh.set(o.id,m)}
  if(AN.sel&&AN.pmesh.has(AN.sel)&&AR.tcm.object&&AR.tcm.object!==AN.pmesh.get(AN.sel))AR.tcm.attach(AN.pmesh.get(AN.sel))}
function evalProp(o,t){const K=o.keys,f=k=>({x:k.x,y:k.y,z:k.z,rx:k.rx,ry:k.ry,rz:k.rz,s:k.s});if(!K.length)return{x:0,y:0,z:0,rx:0,ry:0,rz:0,s:1};
  if(t<=K[0].t)return f(K[0]);if(t>=K[K.length-1].t)return f(K[K.length-1]);let i=0;while(i<K.length-2&&t>=K[i+1].t)i++;
  const k0=K[i],k1=K[i+1],u=(t-k0.t)/Math.max(1e-6,k1.t-k0.t),e=(AN_EASE[k1.ease]||AN_EASE.smooth)[1](u),r={};for(const q of['x','y','z','rx','ry','rz','s'])r[q]=lerp(k0[q],k1[q],e);return r}
function anApplyProps(){for(const o of AN.data.props){const m=AN.pmesh.get(o.id);if(!m)continue;const v=evalProp(o,AN.t),sc=Math.max(.001,v.s);
  m.scale.setScalar(sc);m.position.set(v.x,v.y+AB/2*sc,v.z);m.rotation.set(v.rx*D2R,v.ry*D2R,v.rz*D2R)}}
function anProp(){return AN.data.props.find(o=>o.id===AN.sel)||null}
function anSetPropKey(o,patch){const t=AN.t;if(AN.moveAll){anShift(o.keys,evalProp(o,t),patch,['x','y','z','rx','ry','rz','s']);return}let k=anKeyAt(o.keys,t);
  if(!k){const v=evalProp(o,t),nx=o.keys.find(q=>q.t>t);k={t,...v,ease:nx?nx.ease:'smooth'};o.keys.push(k);o.keys.sort((p,q)=>p.t-q.t);anTimeline()}Object.assign(k,patch)}
const anUnwrap=(v,ref)=>v+Math.round((ref-v)/360)*360;
function anReadProp(){const o=anProp(),m=AR.tcm.object;if(!o||!m)return;const cur=evalProp(o,AN.t),r=v=>Math.round(v*10)/10;
  if(AR.tcm.mode==='rotate')anSetPropKey(o,{rx:r(anUnwrap(m.rotation.x/D2R,cur.rx)),ry:r(anUnwrap(m.rotation.y/D2R,cur.ry)),rz:r(anUnwrap(m.rotation.z/D2R,cur.rz))});
  else anSetPropKey(o,{x:r(m.position.x),y:r(m.position.y-AB/2*Math.max(.001,cur.s)),z:r(m.position.z)})}
function anAddProp(k){const D=AN.data,s=anSceneInfo(),n=D.props.length,o={id:'p'+uid(),name:(anPropPalette().find(p=>p[0]===k)||[k,'Block'])[1],key:k,
  keys:[{t:0,x:Math.round(s.c[0]+AB*1.5+(n%4)*AB*1.2),y:groundY(s.c[0]+AB*1.5,s.c[2]),z:Math.round(s.c[2]+AB),rx:0,ry:0,rz:0,s:1,ease:'smooth'}]};
  D.props.push(o);anSyncProps();anSelect(o.id);anCommit();toast(`${o.name} ist in der Szene. Zieh den Block oder nutze die Pfeile.`)}
const AN_PMOVES=[['spin','Drehen',(c)=>[[0,{}],[2,{ry:c.ry+360},'linear']]],['hop','Hüpfen',(c)=>[[0,{}],[.3,{y:c.y+24},'swing'],[.65,{y:c.y},'bounce']]],
  ['fall','Herunterfallen',(c)=>[[0,{y:c.y+96}],[.9,{y:c.y},'bounce']]],['pop','Auftauchen',(c)=>[[0,{s:0}],[.5,{s:c.s||1},'swing']]],['gone','Verschwinden',(c)=>[[0,{}],[.4,{s:0},'smooth']]],['tumble','Überschlagen',(c)=>[[0,{}],[1,{x:c.x+AB*3,rz:c.rz-360,y:c.y},'smooth']]]];
function anPropMove(o,fn){const t0=AN.t,c=evalProp(o,t0),steps=fn(c),last=steps[steps.length-1][0];if(t0+last>AN.data.dur)AN.data.dur=Math.min(30,Math.ceil((t0+last+.5)*2)/2);
  for(const[dt,patch,ease]of steps){const t=Math.round((t0+dt)*20)/20,v=evalProp(o,t);let k=anKeyAt(o.keys,t);if(!k){k={t,...v};o.keys.push(k)}Object.assign(k,patch,{ease:ease||k.ease||'smooth'})}
  o.keys.sort((p,q)=>p.t-q.t);anTimeline();anCommit();anPane();toast('Bewegung eingefügt. Drück auf Abspielen.')}
function anReadMove(){if(anProp()){anReadProp();return}const a=anActor(),g=AR.tcm.object;if(!a||!g)return;
  if(AR.tcm.mode==='rotate'){const c=evalActor(a,AN.t,true),r=v=>Math.round(v*10)/10;anSetKey(a,{rx:r(anUnwrap(g.rotation.x/D2R,c.rx||0)),ry:r(((anUnwrap(g.rotation.y/D2R,c.ry)+540)%360)-180),rz:r(anUnwrap(g.rotation.z/D2R,c.rz||0))});return}
  const x=Math.round(g.position.x*10)/10,z=Math.round(g.position.z*10)/10,y=Math.round(clamp(g.position.y-groundY(x,z),-600,600)*10)/10;anSetKey(a,{x,z,y})}
function anCopyObj(){const a=anActor(),o=anProp();if(!a&&!o)return false;AN.clip={kind:a?'actor':'prop',data:JSON.parse(JSON.stringify(a||o))};toast('Kopiert. Mit Strg/Cmd+V einfügen.');return true}
function anPasteObj(){const c=AN.clip;if(!c)return false;const d=JSON.parse(JSON.stringify(c.data)),off=AB*1.5;for(const k of d.keys){k.x+=off;k.z+=off*.5}
  if(c.kind==='actor'){d.id='a'+uid();d.name=(d.name+' 2').slice(0,30);AN.data.actors.push(d);anSyncActors()}else{d.id='p'+uid();AN.data.props.push(d);anSyncProps()}
  c.data.keys.forEach(k=>{k.x+=off;k.z+=off*.5});anSelect(d.id);anCommit();anTimeline();toast('Eingefügt – mit derselben Animation.');return true}
function anActor(){return AN.data.actors.find(a=>a.id===AN.sel)||null}
function anSelect(id,bone){AN.sel=id;AN.bone=bone||null;{const f=$('#an-posedone');if(f){f.hidden=!AN.bone;if(AN.bone)f.querySelector('span').textContent=BONE_LABEL[AN.bone]||'Körperteil'}}if(!AR)return;const rt=id&&AN.rts.get(id);if(bone&&rt&&rt.m.bones[bone])AR.tc.attach(rt.m.bones[bone]);else AR.tc.detach();const pm=id&&AN.pmesh.get(id),ed=!AN.playing&&AN_STEPS[AN.step][0]==='act';const md=pm?AN.pmode:rt?(AN.amode||'translate'):'translate';AR.tcm.setMode(md);AR.tcm.setSpace(md==='rotate'?'local':'world');if(rt&&!bone&&ed)AR.tcm.attach(rt.m.group);else if(pm&&ed)AR.tcm.attach(pm);else AR.tcm.detach();anPane();anTimeline()}
async function anAddActor(name,skin,slim){const D=AN.data,n=D.actors.length,a={id:'a'+uid(),name:name||'Figur '+(n+1),skin:skin||'',slim:!!slim,item:'',walk:true,size:{},
  keys:[{t:0,pose:anPose('stehen'),x:(n%2?1:-1)*Math.ceil(n/2)*28,z:0,ry:0,y:0,ease:'smooth'}]};if(n===0)a.keys[0].x=0;
  D.actors.push(a);anSyncActors();anSelect(a.id);anCommit();anHint();toast(`${a.name} ist in der Szene. Zieh die Figur, um sie zu bewegen.`)}

/* ---------- Kamera ---------- */
function anCamPreset(k){const D=AN.data,s=anSceneInfo(),c=s.c,dist=Math.max(120,s.r*2.3),T=D.dur,P=(x,y,z)=>[c[0]+x,y,c[2]+z],Q=[...c];let keys=[];
  if(k==='orbit'){for(let i=0;i<5;i++){const a=(-40+i*30)*D2R;keys.push({t:T*i/4,p:P(Math.sin(a)*dist,c[1]+dist*.3,Math.cos(a)*dist),q:Q})}}
  else if(k==='dolly'){const a=-25*D2R;keys=[{t:0,p:P(Math.sin(a)*dist*1.7,c[1]+dist*.42,Math.cos(a)*dist*1.7),q:Q},{t:T,p:P(Math.sin(a)*dist*.55,c[1]+dist*.08,Math.cos(a)*dist*.55),q:[c[0],c[1]+4,c[2]]}]}
  else if(k==='crane'){keys=[{t:0,p:P(-dist*.2,c[1]+dist*1.25,dist*.55),q:[c[0],c[1]-6,c[2]]},{t:T,p:P(-dist*.3,c[1]+2,dist*.95),q:[c[0],c[1]+4,c[2]]}]}
  else if(k==='pan'){keys=[{t:0,p:P(-dist*.75,c[1]+dist*.18,dist*.85),q:[c[0]-dist*.25,c[1],c[2]]},{t:T,p:P(dist*.75,c[1]+dist*.18,dist*.85),q:[c[0]+dist*.25,c[1],c[2]]}]}
  else if(k==='follow'){const a=D.actors[0];if(!a){toast('Für „Figur folgen“ brauchst du zuerst eine Figur.');return}const n=Math.max(2,Math.round(T)+1),dd=Math.max(90,dist*.6);
    for(let i=0;i<n;i++){const t=T*i/(n-1),st=evalActor(a,t,true),gy=groundY(st.x,st.z)+st.y;keys.push({t,p:[st.x-dd*.5,gy+16+dd*.35,st.z+dd*.85],q:[st.x,gy+17,st.z]})}}
  else{const a=-35*D2R;keys=[{t:0,p:P(Math.sin(a)*dist,c[1]+dist*.28,Math.cos(a)*dist),q:Q}]}
  D.cam.preset=k;D.cam.keys=keys;D.cam.smooth=k!=='follow';AN.pathDirty=true;anTimeline();anCommit()}
function cr(p0,p1,p2,p3,s){const s2=s*s,s3=s2*s;return .5*(2*p1+(-p0+p2)*s+(2*p0-5*p1+4*p2-p3)*s2+(-p0+3*p1-3*p2+p3)*s3)}
function evalCam(t){const C=AN.data.cam,K=C.keys;let p,q;
  if(!K.length){const s=anSceneInfo(),d=Math.max(120,s.r*2.3),a=-35*D2R;p=[s.c[0]+Math.sin(a)*d,s.c[1]+d*.28,s.c[2]+Math.cos(a)*d];q=s.c}
  else if(K.length===1||t<=K[0].t){p=K[0].p;q=K[0].q}else if(t>=K[K.length-1].t){p=K[K.length-1].p;q=K[K.length-1].q}
  else{let i=0;while(i<K.length-2&&t>=K[i+1].t)i++;let s=(t-K[i].t)/Math.max(1e-6,K[i+1].t-K[i].t);const n=K.length-1;
    if(C.smooth){if(n===1)s=s*s*(3-2*s);else if(i===0)s=2*s*s-s*s*s;else if(i===n-1){const v=1-s;s=1-(2*v*v-v*v*v)}}
    const g=j=>K[clamp(j,0,K.length-1)];p=[0,1,2].map(j=>cr(g(i-1).p[j],g(i).p[j],g(i+1).p[j],g(i+2).p[j],s));q=[0,1,2].map(j=>cr(g(i-1).q[j],g(i).q[j],g(i+1).q[j],g(i+2).q[j],s))}
  if(C.shake>0){const n=(a,b)=>Math.sin(t*a+b)*.6+Math.sin(t*a*1.73+b*2.1)*.4,A=C.shake*2.2;p=[p[0]+n(1.3,.2)*A,p[1]+n(1.7,1.4)*A,p[2]+n(1.1,2.7)*A];q=[q[0]+n(1.9,3.1)*A*.6,q[1]+n(2.3,.7)*A*.6,q[2]+q[2]*0]}
  return{p,q}}
function anSetCamKey(){const C=AN.data.cam,cam=AR.camera,tg=AR.controls.target,t=AN.t;let k=anKeyAt(C.keys,t);
  if(!k){k={t};C.keys.push(k);C.keys.sort((a,b)=>a.t-b.t)}k.p=[cam.position.x,cam.position.y,cam.position.z].map(v=>Math.round(v*10)/10);k.q=[tg.x,tg.y,tg.z].map(v=>Math.round(v*10)/10);
  C.preset='custom';AN.pathDirty=true;anTimeline();anPane();anCommit();toast(`Kameraposition bei ${anFmtT(t)} gemerkt.`)}
function anLook(){return AN.rec||AN.playing||AN_STEPS[AN.step][0]==='cam'?'cam':AN.look}
function anFrameCam(tween){const s=anSceneInfo(),d=Math.max(140,s.r*2.6),a=-38*D2R;const p=[s.c[0]+Math.sin(a)*d,s.c[1]+d*.3,s.c[2]+Math.cos(a)*d];AN.work={p,q:s.c};if(tween)anTweenTo(p,s.c);else{AR.camera.position.set(...p);AR.controls.target.set(...s.c);AR.camera.lookAt(...s.c)}}
function anTweenTo(p,q,ms=650){const c=AR.camera.position,g=AR.controls.target;AN.tween={a:[c.x,c.y,c.z],b:[g.x,g.y,g.z],p,q,t0:performance.now(),ms}}
let anPrevLook='work';
function anUpdCam(now){const look=anLook(),cam=AR.camera,C=AN.data.cam;
  if(look!==anPrevLook){if(look==='cam'){const c=cam.position,g=AR.controls.target;AN.work={p:[c.x,c.y,c.z],q:[g.x,g.y,g.z]};if(!AN.playing&&!AN.rec){const e=evalCam(AN.t);anTweenTo(e.p,e.q)}}else if(AN.work)anTweenTo(AN.work.p,AN.work.q);anPrevLook=look}
  const fov=look==='cam'?C.fov:35;if(Math.abs(cam.fov-fov)>.01){cam.fov=lerp(cam.fov,fov,AN.tween?.18:1);cam.updateProjectionMatrix()}
  if(AN.tween){const T=AN.tween;let u=clamp((now-T.t0)/T.ms,0,1);const e=u<.5?4*u*u*u:1-Math.pow(-2*u+2,3)/2;
    const tgt=look==='cam'&&!AN.camEdit?evalCam(AN.t):null,P=tgt?tgt.p:T.p,Q=tgt?tgt.q:T.q;
    cam.position.set(...[0,1,2].map(j=>lerp(T.a[j],P[j],e)));AR.controls.target.set(...[0,1,2].map(j=>lerp(T.b[j],Q[j],e)));cam.lookAt(AR.controls.target);if(u>=1)AN.tween=null}
  else if(look==='cam'&&!AN.camEdit){const e=evalCam(AN.t);cam.position.set(...e.p);AR.controls.target.set(...e.q);cam.lookAt(...e.q)}
  AR.controls.enabled=!AN.rec&&!AN.playing&&!AN.tcDrag&&(look==='work'||AN_STEPS[AN.step][0]==='cam')}
function anPath(){AN.pathDirty=false;const K=AN.data.cam.keys,T=THREE,pts=[];
  if(K.length>1){for(let i=0;i<=80;i++){const e=evalCam(K[0].t+(K[K.length-1].t-K[0].t)*i/80);pts.push(new T.Vector3(...e.p))}}
  AR.path.geometry.dispose();AR.path.geometry=new T.BufferGeometry().setFromPoints(pts);AR.path.computeLineDistances();AR.path.visible=pts.length>1}

/* ---------- Ablauf ---------- */
function anLoop(now){if(view!=='anim'||!AR){AN.running=false;return}requestAnimationFrame(anLoop);
  const dt=AN.last?Math.min(.1,(now-AN.last)/1000):0;AN.last=now;
  if(AN.playing&&!AN.rec){if(AN.audT0!=null&&anAC)AN.t=AN.audT+Math.max(0,anAC.currentTime-AN.audT0);else AN.t+=dt;if(AN.t>=AN.data.dur){if(AN.loop){AN.t=0;anAudioStart()}else{AN.t=AN.data.dur;anStop()}}}
  if(!AN.rec)anRender(now)}
function anRender(now){if(AN.pathDirty)anPath();anApplyActors();anApplyProps();anUpdCam(now);
  const cam=AR.camera;AR.sky.position.copy(cam.position);AR.stars.position.copy(cam.position);AR.sun.position.copy(cam.position).addScaledVector(anSunDir(),8000);
  AR.clouds.position.set(-AN.t*14,0,-AN.t*4);
  const edit=!AN.playing&&!AN.rec,look=anLook();AR.helpers.visible=edit;AR.path.visible=edit&&look==='work'&&AN.data.cam.keys.length>1;
  if(AR.path.visible){const e=evalCam(AN.t);AR.camMark.position.set(...e.p);AR.camMark.lookAt(...e.q);AR.camMark.rotateX(-Math.PI/2);AR.camMark.visible=true}else AR.camMark.visible=false;
  AR.tc.visible=edit&&!!AR.tc.object;AR.tcm.visible=edit&&!!AR.tcm.object;
  if(AR.tc.object){const w=new THREE.Vector3();AR.tc.object.getWorldPosition(w);const H=AR.frame.clientHeight||600,ppu=H/(2*w.distanceTo(cam.position)*Math.tan(cam.fov*D2R/2)),px=Math.max(COARSE?50:36,8*ppu);AR.tc.size=clamp(px/H/.1357,.15,1.1)}
  const rt=AN.sel&&AN.rts.get(AN.sel);AR.ring.visible=edit&&!!rt&&AN_STEPS[AN.step][0]==='act';if(AR.ring.visible){const m=rt.m;AR.ring.position.set(m.x,m.rootY+.3,m.z)}
  AR.renderer.render(AR.scene,cam);
  {const pc=$('#an-post'),lk=AN.data.fx.look;if(pc){const on=lk&&lk!=='none'&&!AN.rec;pc.hidden=!on;if(on){const w=AR.frame.clientWidth,h=AR.frame.clientHeight;if(pc.width!==w||pc.height!==h){pc.width=w;pc.height=h}const px=pc.getContext('2d');px.drawImage(AR.renderer.domElement,0,0,w,h);anPostFx(px,w,h,lk)}}}
  const f=AN.data.fx.fade&&(AN.playing||AN.rec)?anFade(AN.t):0;$('#an-fade').style.opacity=f;anPH()}
function anFade(t){const D=AN.data.dur;return clamp(Math.max(1-t/.6,1-(D-t)/.6),0,1)}
function anPlay(){if(AN.playing){anStop();return}if(AN.t>=AN.data.dur-.01)AN.t=0;AN.playing=true;AR.tc.detach();AR.tcm.detach();anAudioStart();anPlayUI()}
function anStop(){if(!AN.playing)return;AN.playing=false;anAudioStop();AN.t=Math.round(AN.t*20)/20;anPlayUI();if(AN.sel)anSelect(AN.sel,AN.bone);anPane()}
function anPlayUI(){const b=$('#an-play');if(!b)return;b.innerHTML=AN.playing?'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>':'<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>';b.setAttribute('aria-label',AN.playing?'Anhalten':'Abspielen');if(AN.playing)anHintShow(false);else $('#an-help').hidden=!$('#an-hint').classList.contains('off')}
function anSeek(t){AN.t=clamp(Math.round(t*20)/20,0,AN.data.dur);if(AN.playing)return;anScrub(AN.t);anPH();anPaneSoft()}
const anFmtT=t=>t.toFixed(1).replace('.',',')+' s';

/* ---------- Zeigen, Bauen, Bewegen in der 3D-Ansicht ---------- */
function anRay(e){const r=AR.renderer.domElement.getBoundingClientRect(),v=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),ray=new THREE.Raycaster();ray.setFromCamera(v,AR.camera);return ray}
function anBuildHit(e){const ray=anRay(e),hits=ray.intersectObjects(AN.blockMeshes,false);
  if(hits.length){const h=hits[0],n=h.face.normal,c=[h.point.x-n.x*.5,h.point.y-n.y*.5,h.point.z-n.z*.5].map(v=>Math.floor(v/AB));return{cell:c,place:[c[0]+Math.round(n.x),c[1]+Math.round(n.y),c[2]+Math.round(n.z)]}}
  const pl=new THREE.Plane(new THREE.Vector3(0,1,0),0),p=new THREE.Vector3();if(ray.ray.intersectPlane(pl,p)&&p.distanceTo(AR.camera.position)<6000)return{cell:null,place:[Math.floor(p.x/AB),0,Math.floor(p.z/AB)]};return null}
function anGhost(c0,c1,erase){const g=AR.ghost;if(!c0){g.visible=false;return}const a=[0,1,2].map(i=>Math.min(c0[i],c1[i])),b=[0,1,2].map(i=>Math.max(c0[i],c1[i])+1);
  g.position.set((a[0]+b[0])/2*AB,(a[1]+b[1])/2*AB,(a[2]+b[2])/2*AB);g.scale.set((b[0]-a[0])*AB+.4,(b[1]-a[1])*AB+.4,(b[2]-a[2])*AB+.4);g.visible=true;
  AR.gbox.material.color.set(erase?0xff6b6b:0xffffff);AR.gl.material.color.set(erase?0xff8a8a:0xffffff)}
function anEditBlocks(fn){const D=AN.data,m=new Map(D.blocks.map(b=>[b[0]+','+b[1]+','+b[2],b]));fn(m);if(m.size>30000){toast('Mehr als 30 000 Blöcke gehen nicht.');return}D.blocks=[...m.values()];anRebuildBlocks();anSunPos();anCommit()}
function anPointer(){const fr=AR.frame;let D=null;
  fr.addEventListener('pointerdown',e=>{if(AN.rec||e.button===2)return;AN.tween=null;{const k=AN_STEPS[AN.step][0];anHintSeen.add(k+(k==='act'?AN.data.actors.length>0:''));if(!$('#an-hint').classList.contains('off'))anHintShow(false)}const st=AN_STEPS[AN.step][0];D={x:e.clientX,y:e.clientY,moved:false,id:e.pointerId};
    if(AN.playing)anStop();
    if(st==='bg'&&AN.tool==='area'){const h=anBuildHit(e);if(h){D.area=h.place;AR.controls.enabled=false;anGhost(h.place,h.place)}}
    if(st==='act'&&anLook()==='work'){const hits=anRay(e).intersectObjects([...AN.rts.values()].flatMap(r=>r.m.meshes||[]),false),ph=anRay(e).intersectObjects([...AN.pmesh.values()],true);
      const ray=anRay(e),pk=AR.tc.object&&AR.tc._gizmo&&AR.tc._gizmo.picker.rotate,onRing=(pk&&ray.intersectObject(pk,true).length>0)||(AR.tcm.object&&AR.tcm._gizmo&&ray.intersectObject(AR.tcm._gizmo.picker[AR.tcm.mode],true).length>0);
      if(ph.length&&!onRing&&(!hits.length||ph[0].distance<hits[0].distance)){e.stopPropagation();const o=AN.data.props.find(x=>x.id===ph[0].object.userData.prop),v=evalProp(o,AN.t);D.prop=o.id;D.y=v.y;AR.controls.enabled=false;const p=new THREE.Vector3();ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-v.y),p);D.off=[v.x-p.x,v.z-p.z]}
      else if(hits.length&&!onRing){e.stopPropagation();const u=hits[0].object.userData;D.actor=u.model;D.bone=u.bone;AR.controls.enabled=false;const a=AN.data.actors.find(x=>x.id===u.model),s=evalActor(a,AN.t,true);D.y=groundY(s.x,s.z)+s.y;
        const p=new THREE.Vector3();anRay(e).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-D.y),p);D.off=[s.x-p.x,s.z-p.z]}}},{capture:true});
  fr.addEventListener('pointermove',e=>{const st=AN_STEPS[AN.step][0];
    if(!D){if(st==='bg'&&e.pointerType!=='touch'&&anLook()==='work'){const h=anBuildHit(e);if(!h)anGhost(null);else if(AN.tool==='erase')anGhost(h.cell,h.cell||null,true);else anGhost(h.place,h.place)}return}
    if(Math.hypot(e.clientX-D.x,e.clientY-D.y)>6)D.moved=true;if(AN.tcDrag)return;
    if(D.area){const p=new THREE.Vector3();if(anRay(e).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-D.area[1]*AB),p)){const c=[clamp(Math.floor(p.x/AB),D.area[0]-31,D.area[0]+31),D.area[1],clamp(Math.floor(p.z/AB),D.area[2]-31,D.area[2]+31)];D.area2=c;anGhost(D.area,c)}}
    else if(D.prop&&D.moved){const p=new THREE.Vector3();if(anRay(e).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-D.y),p)){const o=AN.data.props.find(x=>x.id===D.prop);if(o){if(AN.sel!==o.id)anSelect(o.id);anSetPropKey(o,{x:Math.round((p.x+D.off[0])*10)/10,z:Math.round((p.z+D.off[1])*10)/10});D.dragged=true}}}
    else if(D.actor&&D.moved){const p=new THREE.Vector3();if(anRay(e).ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-D.y),p)){const a=AN.data.actors.find(x=>x.id===D.actor);if(a){if(AN.sel!==a.id)anSelect(a.id);anSetKey(a,{x:Math.round((p.x+D.off[0])*10)/10,z:Math.round((p.z+D.off[1])*10)/10});D.dragged=true}}}},{capture:true});
  const up=e=>{if(!D||D.id!==e.pointerId)return;const d=D;D=null;const st=AN_STEPS[AN.step][0];
    if(AN.tcDrag||AR.tc.dragging||AR.tcm.dragging){return}
    if(d.area){anGhost(null);const b=d.area2||d.area,a=d.area,k=AN.block||anPalette()[0][0];anEditBlocks(m=>{for(let x=Math.min(a[0],b[0]);x<=Math.max(a[0],b[0]);x++)for(let z=Math.min(a[2],b[2]);z<=Math.max(a[2],b[2]);z++)m.set(x+','+a[1]+','+z,[x,a[1],z,k])});return}
    if(d.dragged){anCommit();anPane();return}
    if(d.moved||e.type==='pointercancel')return;
    if(st==='bg'&&anLook()==='work'){const h=anBuildHit(e);if(!h)return;if(AN.tool==='erase'){if(h.cell)anEditBlocks(m=>m.delete(h.cell.join(',')))}else{const k=AN.block||anPalette()[0][0];anEditBlocks(m=>m.set(h.place.join(','),[...h.place,k]))}}
    if(st==='act'&&d.prop){anSelect(d.prop);return}
    if(st==='act'){if(d.actor){if(AN.sel===d.actor){const first=!AN.bone;anSelect(d.actor,d.bone);if(first)anFocusActor(d.actor)}else anSelect(d.actor)}else if(!AR.tc.dragging&&!AR.tcm.dragging)anSelect(null)}};
  fr.addEventListener('pointerup',up,{capture:true});fr.addEventListener('pointercancel',up,{capture:true});
  fr.addEventListener('pointerleave',()=>{if(!D)anGhost(null)});fr.addEventListener('contextmenu',e=>e.preventDefault())}

/* ---------- Oberfläche ---------- */
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function aSec(P,title,sub){const s=el('section','an-sec');if(title)s.append(el('h4',null,title));if(sub)s.append(el('p','sub',sub));const b=el('div','stack');s.append(b);P.append(s);return b}
function aRange(P,label,min,max,step,get,set,fmt=v=>v){const w=el('div','field'),id='an-'+uid();w.innerHTML=`<div class="lab"><label for="${id}"></label><output></output></div><input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;
  w.querySelector('label').textContent=label;const i=w.querySelector('input'),o=w.querySelector('output');i.value=get();o.textContent=fmt(+get());
  i.addEventListener('input',()=>{set(+i.value);o.textContent=fmt(+i.value)});i.addEventListener('change',anCommit);P.append(w);return w}
function aSeg(P,label,opts,get,set){const w=el('div','field');if(label)w.append(Object.assign(el('div','lab'),{innerHTML:'<span></span>'}));if(label)w.querySelector('span').textContent=label;const g=el('div','seg');g.setAttribute('role','group');if(label)g.setAttribute('aria-label',label);
  for(const[v,l]of opts){const b=el('button',null,l);b.type='button';b.setAttribute('aria-pressed',String(get())===String(v));b.addEventListener('click',()=>{set(v);g.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b))});g.append(b)}w.append(g);P.append(w);return w}
function aCheck(P,label,get,set){const l=el('label','row check');l.innerHTML='<input type="checkbox"><span></span>';l.querySelector('span').textContent=label;const i=l.querySelector('input');i.checked=!!get();i.addEventListener('change',()=>{set(i.checked);anCommit()});P.append(l);return l}
function aSelect(P,label,opts,get,set){const w=el('div','field'),id='an-'+uid();w.innerHTML=`<div class="lab"><label for="${id}"></label></div><select id="${id}"></select>`;w.querySelector('label').textContent=label;const s=w.querySelector('select');
  for(const[v,l]of opts)s.append(new Option(l,v));s.value=get();s.addEventListener('change',()=>{set(s.value);anCommit()});P.append(w);return w}
function aBtn(P,text,fn,cls='btn sm'){const b=el('button',cls,text);b.type='button';b.addEventListener('click',fn);P.append(b);return b}
function aRow(P){const r=el('div','btnrow');P.append(r);return r}

function anSteps(){const box=$('#an-steps-in');box.innerHTML='';
  AN_STEPS.forEach(([k,l],i)=>{if(i){const ln=el('span','an-line'+(i<=AN.step?' done':''));ln.append(el('i'));box.append(ln)}
    const b=el('button','an-step'+(i<AN.step?' done':''));b.type='button';b.innerHTML='<span class="no"></span><span class="tx"></span>';b.querySelector('.no').innerHTML=i<AN.step?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>':String(i+1);
    b.querySelector('.tx').textContent=l;if(i===AN.step)b.setAttribute('aria-current','step');b.addEventListener('click',()=>anGo(i));box.append(b)});
  const an=$('#v-anim .an');an.classList.toggle('no-tl',AN_STEPS[AN.step][0]==='bg');an.dataset.step=AN_STEPS[AN.step][0];anPane();anTimeline();anHint()}
function anGo(i){i=clamp(i,0,AN_STEPS.length-1);if(i===AN.step)return;const back=i<AN.step;AN.step=i;store.set('rk-anim-step',i);anGhost(null);
  if(AN_STEPS[i][0]!=='act')anSelect(null);if(AN_STEPS[i][0]==='cam'&&!AN.data.cam.keys.length)anCamPreset(AN.data.cam.preset==='custom'?'orbit':AN.data.cam.preset);
  if(AN_STEPS[i][0]==='act'&&!AN.data.actors.length&&anLook()==='work')anFrameCam(true);
  anSteps();const p=$('#an-side');p.classList.remove('in-l','in-r');void p.offsetWidth;p.classList.add(back?'in-l':'in-r')}
const anHintSeen=new Set();
function anHintShow(on){$('#an-hint').classList.toggle('off',!on);$('#an-help').hidden=on||AN.playing}
function anHint(){const k=AN_STEPS[AN.step][0],h=$('#an-hint span');h.textContent={
  bg:'Tippe auf den Boden oder einen Block, um zu bauen. Ziehen dreht die Ansicht, zwei Finger oder das Mausrad zoomen. Mit Tastatur: WASD bewegt die Kamera, E/Q hoch/runter, Shift schneller.',
  act:AN.data.actors.length?'Zieh eine Figur, um sie zu verschieben. Schieb vorher den Zeitregler weiter: So entsteht ein Schlüsselbild, dazwischen läuft die Figur von selbst. Zweimal antippen dreht einzelne Körperteile.':'Füge rechts eine Figur mit Minecraft-Skin hinzu.',
  cam:'Du siehst durch die Kamera. Wähle eine Fahrt oder dreh die Ansicht an einer Zeitstelle (oder fahr mit WASD, E/Q): Die Position wird dort gemerkt.',
  light:'Wähle eine Stimmung und verfeinere sie mit den Reglern.',
  out:'Alles fertig. Spiel die Animation ab oder erstelle das Video.'}[k];anHintShow(!anHintSeen.has(k+(k==='act'?AN.data.actors.length>0:'')))}
let anPaneT=0;function anPaneSoft(){clearTimeout(anPaneT);anPaneT=setTimeout(()=>{if(['act','cam'].includes(AN_STEPS[AN.step][0]))anPane()},120)}
function anPane(){const P=$('#an-side');if(!P||!AN.data)return;const sc=P.scrollTop;P.innerHTML='';const k=AN_STEPS[AN.step][0];({bg:paneBg,act:paneAct,cam:paneCam,light:paneLight,out:paneOut})[k](P);P.scrollTop=sc;
  const nav=$('#an-nav');nav.innerHTML='';const b=aBtn(nav,'Zurück',()=>anGo(AN.step-1),'btn');b.disabled=AN.step===0;
  if(AN.step<AN_STEPS.length-1)aBtn(nav,'Weiter: '+AN_STEPS[AN.step+1][1],()=>anGo(AN.step+1),'btn primary');else aBtn(nav,'Video erstellen',anRecord,'btn primary')}
function anPalette(){if(PACK&&typeof packBlockBases==='function'){const l=packBlockBases().filter(b=>!(typeof pkFlat==='function'&&pkFlat(b))).map(b=>['pk:'+b,prettyName(b)]);if(l.length)return l}return BLOCK_DEFS.map(d=>[d[0],d[1]])}
function paneBg(P){const D=AN.data;
  let s=aSec(P,'Vorlage','Ein Startpunkt, den du danach umbauen kannst.');const tg=el('div','an-tpl');
  for(const[k,n,d]of[['wiese','Wiese','Gras mit ein paar Bäumen'],['wald','Wald','Viele Eichen und Birken'],['insel','Himmelsinsel','Schwebt im Himmel'],['buehne','Bühne','Holzbühne auf Gras'],['block','Ein Block','Ein Grasblock im Nichts'],['leer','Leer','Nur der Boden']]){const b=el('button','an-card');b.type='button';b.innerHTML='<b></b><span></span>';b.querySelector('b').textContent=n;b.querySelector('span').textContent=d;
    b.addEventListener('click',()=>{D.blocks=anTemplate(k);D.bg.ground=k==='insel'||k==='block'?'none':'grass';anRebuildBlocks();anApplyLook();anFrameCam(true);anCommit();anPane()});tg.append(b)}s.append(tg);
  s=aSec(P,'Bauen');aSeg(s,null,[['place','Bauen'],['erase','Abbauen'],['area','Fläche']],()=>AN.tool,v=>{AN.tool=v;anGhost(null);if(v==='area')toast('Auf den Boden tippen und ziehen: Eine Fläche aus Blöcken entsteht.')});
  const q=el('input');q.type='search';q.placeholder='Block suchen';q.className='an-search';q.value=AN.q;s.append(q);const grid=el('div','an-pal');s.append(grid);
  const pal=anPalette();if(!AN.block||!pal.some(p=>p[0]===AN.block))AN.block=(pal.find(p=>/grass/.test(p[0]))||pal[0])[0];
  const fill=()=>{grid.innerHTML='';const f=AN.q.trim().toLowerCase(),list=pal.filter(([k,n])=>!f||n.toLowerCase().includes(f)||k.includes(f)).slice(0,60);
    for(const[k,n]of list){const b=el('button','an-blk');b.type='button';b.title=n;b.setAttribute('aria-label',n);b.setAttribute('aria-pressed',k===AN.block);const c=mk(56,56);try{c.getContext('2d').drawImage(blockCanvas(k),0,0,56,56)}catch{}b.append(c);
      b.addEventListener('click',()=>{AN.block=k;if(AN.tool==='erase')AN.tool='place';grid.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b))});grid.append(b)}
    if(!list.length)grid.append(el('p','sub','Kein Block gefunden.'))};fill();q.addEventListener('input',()=>{AN.q=q.value;fill()});
  if(!PACK)s.append(el('p','sub','Mit den Minecraft-Texturen (Thumbnails → Elemente) stehen dir alle Blöcke zur Verfügung.'));
  aBtn(aRow(s),'Alle Blöcke entfernen',()=>{D.blocks=[];anRebuildBlocks();anCommit();toast('Alle Blöcke entfernt.')},'btn sm danger');
  s=aSec(P,'Himmel & Boden');aSeg(s,'Himmel',[['mc','Minecraft-Himmel'],['color','Farbe']],()=>D.bg.mode,v=>{D.bg.mode=v;anApplyLook();anCommit();anPane()});
  if(D.bg.mode==='color'){const w=el('div','field');w.innerHTML='<div class="lab"><span>Farbe</span></div><input type="color">';const i=w.querySelector('input');i.value=D.bg.color;i.addEventListener('input',()=>{D.bg.color=i.value;anApplyLook()});i.addEventListener('change',anCommit);s.append(w)}
  aSelect(s,'Boden',AN_GROUND,()=>D.bg.ground,v=>{D.bg.ground=v;anApplyLook()});
  s.append(el('p','sub','Die Tageszeit stellst du im Schritt „Licht“ ein.'))}
function paneProps(P){const D=AN.data,o=anProp();let s=aSec(P,'Bewegliche Blöcke','Blöcke, die sich bewegen, drehen, hüpfen oder auftauchen.');
  if(D.props.length){const list=el('div','an-actors');for(const x of D.props){const b=el('button','an-actor');b.type='button';b.setAttribute('aria-pressed',x.id===AN.sel);const c=mk(40,40);try{c.getContext('2d').drawImage(blockCanvas(x.key),0,0,40,40)}catch{}b.append(c,el('span',null,x.name));b.addEventListener('click',()=>anSelect(x.id));list.append(b)}s.append(list)}
  const add=el('details','an-padd');add.innerHTML='<summary class="btn sm">+ Block hinzufügen</summary>';const q=el('input');q.type='search';q.placeholder='Block suchen';q.className='an-search';const grid=el('div','an-pal');add.append(q,grid);
  const pal=anPropPalette(),fill=()=>{grid.innerHTML='';const f=q.value.trim().toLowerCase();for(const[k,n]of pal.filter(([k,n])=>!f||n.toLowerCase().includes(f)||k.includes(f)).slice(0,48)){const b=el('button','an-blk');b.type='button';b.title=n;b.setAttribute('aria-label',n+' hinzufügen');const c=mk(56,56);try{c.getContext('2d').drawImage(blockCanvas(k),0,0,56,56)}catch{}b.append(c);b.addEventListener('click',()=>{anAddProp(k);anPane()});grid.append(b)}};
  add.addEventListener('toggle',()=>{if(add.open&&!grid.childElementCount)fill()});q.addEventListener('input',fill);s.append(add);
  if(!o)return;const cur=evalProp(o,AN.t),k=anKeyAt(o.keys,AN.t);
  s=aSec(P,o.name+' · bei '+anFmtT(AN.t),k?'Hier liegt ein Schlüsselbild. Änderungen gelten ab dieser Stelle.':'Eine Änderung legt hier automatisch ein neues Schlüsselbild an.');
  aSeg(s,'Pfeile in der Ansicht',[['translate','Verschieben'],['rotate','Drehen']],()=>AN.pmode,v=>{AN.pmode=v;anSelect(o.id)});
  const mg=el('div','posegrid');for(const[id,n,fn]of AN_PMOVES){const b=el('button','btn sm',n);b.type='button';b.addEventListener('click',()=>anPropMove(o,fn));mg.append(b)}s.append(el('p','sub','Bewegung einfügen (ab hier):'),mg);
  s=aSec(P,'Lage');const set=f=>v=>anSetPropKey(o,f(v)),n1=v=>String(Math.round(v*10)/10).replace('.',',');
  aRange(s,'Links/rechts',-400,400,1,()=>Math.round(cur.x),set(v=>({x:v})));aRange(s,'Höhe',-64,400,1,()=>Math.round(cur.y),set(v=>({y:v})));aRange(s,'Vorne/hinten',-400,400,1,()=>Math.round(cur.z),set(v=>({z:v})));
  aRange(s,'Drehen',-360,360,1,()=>Math.round(cur.ry),set(v=>({ry:v})),v=>v+'°');aRange(s,'Kippen',-360,360,1,()=>Math.round(cur.rx),set(v=>({rx:v})),v=>v+'°');aRange(s,'Rollen',-360,360,1,()=>Math.round(cur.rz),set(v=>({rz:v})),v=>v+'°');
  aRange(s,'Größe',0,4,.05,()=>cur.s,set(v=>({s:v})),v=>Math.round(v*100)+' %');
  if(k){s=aSec(P,'Schlüsselbild bei '+anFmtT(k.t));aSelect(s,'Übergang hierher',Object.entries(AN_EASE).map(([e,[n]])=>[e,n]),()=>k.ease||'smooth',v=>{k.ease=v});
    if(o.keys.length>1)aBtn(aRow(s),'Schlüsselbild löschen',()=>{o.keys.splice(o.keys.indexOf(k),1);anTimeline();anCommit();anPane()},'btn sm danger')}
  s=aSec(P,null);{const rr=aRow(s);aBtn(rr,'Duplizieren (mit Animation)',()=>{anCopyObj();anPasteObj()});aBtn(rr,'Block entfernen',()=>{D.props.splice(D.props.indexOf(o),1);anSelect(null);anSyncProps();anCommit();anPane()},'btn sm danger')}}
function paneAct(P){const D=AN.data,a=anActor();if(anProp()){paneActors(P,null);paneProps(P);return}paneActors(P,a);paneProps(P)}
function paneActors(P,a){const D=AN.data;
  let s=aSec(P,'Figuren');const list=el('div','an-actors');
  for(const x of D.actors){const b=el('button','an-actor');b.type='button';b.setAttribute('aria-pressed',x.id===AN.sel);const c=mk(40,40),sk=anSkin(x)||GRAY_SKIN,cx=c.getContext('2d');cx.imageSmoothingEnabled=false;cx.drawImage(sk,8,8,8,8,4,4,32,32);cx.drawImage(sk,40,8,8,8,2,2,36,36);b.append(c,el('span',null,x.name));b.addEventListener('click',()=>anSelect(x.id));list.append(b)}
  if(D.actors.length)s.append(list);
  if(D.actors.length<6){const add=el('div','an-add');const t=el('button','an-addtile');t.type='button';const img=skinTileCanvas();img.className='an-addimg';t.append(img,el('span',null,'Minecraft-Skin hinzufügen'));add.append(t);
    const f=el('form','ignform');f.hidden=D.actors.length>0;f.innerHTML='<label class="sub" for="an-ign">Ingame-Name (Java-Edition)</label><div class="btnrow"><input id="an-ign" type="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="z. B. Notch"><button class="btn primary sm" type="submit">Hinzufügen</button></div><p class="sub ign-msg" role="status"></p><div class="btnrow"><button class="btn ghost sm" type="button" data-f>Skin-Datei (PNG)</button><button class="btn ghost sm" type="button" data-g>Ohne Skin</button></div>';
    t.addEventListener('click',()=>{f.hidden=!f.hidden;if(!f.hidden)f.querySelector('input').focus()});const inp=f.querySelector('input'),msg=f.querySelector('.ign-msg'),sb=f.querySelector('[type=submit]');
    f.addEventListener('submit',async e=>{e.preventDefault();const n=inp.value.trim();if(!n)return;sb.disabled=true;msg.textContent='Skin wird geladen …';try{const r=await fetchSkinByName(n);anSkins.set(r.data,r.canvas);await anAddActor(n,r.data,r.slim);anPane()}catch(err){msg.textContent=err.message||'Skin nicht gefunden.'}finally{sb.disabled=false}});
    f.querySelector('[data-f]').addEventListener('click',()=>$('#f-anskin').click());f.querySelector('[data-g]').addEventListener('click',()=>{anAddActor('',''+'',false);anPane()});add.append(f);s.append(add)}
  if(!a){if(D.actors.length)s.append(el('p','sub','Tippe eine Figur an, um sie zu bearbeiten.'));return}
  const k=anKeyAt(a.keys,AN.t);
  s=aSec(P,a.name+' · bei '+anFmtT(AN.t),k?'Hier liegt ein Schlüsselbild. Änderungen gelten ab dieser Stelle.':'Eine Änderung legt hier automatisch ein neues Schlüsselbild an.');
  {const f=el('form','an-skinform');f.innerHTML='<label class="sub" for="an-rename">Name / Skin (Ingame-Name)</label><div class="btnrow"><input id="an-rename" type="text" maxlength="30" autocomplete="off" spellcheck="false"><button class="btn sm primary" type="submit">Skin laden</button></div><p class="sub an-skinmsg" role="status"></p><div class="btnrow"><button class="btn ghost sm" type="button" data-up>Eigenen Skin hochladen (PNG)</button></div>';
    const inp=f.querySelector('input'),msg=f.querySelector('.an-skinmsg'),sb=f.querySelector('button');inp.value=a.name;
    f.addEventListener('submit',async e=>{e.preventDefault();const n=inp.value.trim();if(!n||sb.disabled)return;
      if(/^[A-Za-z0-9_]{3,16}$/.test(n)){sb.disabled=true;msg.textContent='Skin von '+n+' wird geladen …';
        try{const r=await fetchSkinByName(n);anSkins.set(r.data,r.canvas);a.skin=r.data;a.slim=r.slim;a.name=n;anSyncActors();anTimeline();anCommit();msg.textContent='';toast(`Skin von ${n} geladen. Pose und Bewegung bleiben.`);anPane()}
        catch(err){msg.textContent=(err.message||'Skin nicht gefunden.')+' Der Name wurde trotzdem geändert.';a.name=n;anTimeline();anCommit()}finally{sb.disabled=false}}
      else{a.name=n.slice(0,30);anTimeline();anCommit();anPane();toast('Name geändert.')}});
    f.querySelector('[data-up]').addEventListener('click',()=>{const i=document.createElement('input');i.type='file';i.accept='image/png';i.addEventListener('change',()=>{const fl=i.files[0];if(!fl)return;
      blobToDataURL(fl).then(loadSkinFile).then(c=>{const dd=c.toDataURL('image/png');anSkins.set(dd,c);a.skin=dd;a.slim=c.height===64&&c.getContext('2d').getImageData(54,20,1,1).data[3]===0;a.ign=false;const rt=AN.rts.get(a.id);if(rt)rt.face=null;anSyncActors();anCommit();anPane();toast('Eigener Skin übernommen. Pose und Bewegung bleiben.')}).catch(err=>toast(err&&err.message?err.message:'Der Skin konnte nicht gelesen werden.'))});i.click()});
    s.append(f)}
  {const fs=aSec(P,'Gesicht bei '+anFmtT(AN.t),'Der Ausdruck gilt ab hier bis zum nächsten Gesichts-Schlüsselbild (eigene Zeile in der Zeitleiste).'),cur=evalFace(a,AN.t),g=el('div','posegrid');
    for(const[fk,[fn]]of Object.entries(AN_EXPR)){const b=el('button','btn sm',fn);b.type='button';b.setAttribute('aria-pressed',fk===cur);b.addEventListener('click',()=>{a.faces=a.faces||[];let k=a.faces.find(q=>Math.abs(q.t-AN.t)<.02);if(!k){k={t:AN.t};a.faces.push(k);a.faces.sort((p,q)=>p.t-q.t)}k.f=fk;const rt=AN.rts.get(a.id);if(rt)rt.face=null;anCommit();anTimeline();anPane()});g.append(b)}fs.append(g);
    const fk=(a.faces||[]).find(q=>Math.abs(q.t-AN.t)<.02);if(fk)aBtn(aRow(fs),'Gesichts-Schlüsselbild löschen',()=>{a.faces.splice(a.faces.indexOf(fk),1);const rt=AN.rts.get(a.id);if(rt)rt.face=null;anCommit();anTimeline();anPane()},'btn sm danger')}
  const pg=el('div','posegrid');for(const[pk,[n,p,ry]]of Object.entries(POSES)){const b=el('button','btn sm',n);b.type='button';b.addEventListener('click',()=>{anSetKey(a,{pose:anClone(p),y:ry||0});anCommit();anPane()});pg.append(b)}s.append(pg);
  s=aSec(P,'Bewegung einfügen','Fügt ab hier eine fertige Bewegung ein.');const mg=el('div','posegrid');
  for(const[id,n,steps]of AN_MOVES){const b=el('button','btn sm',n);b.type='button';b.addEventListener('click',()=>anMove(a,steps));mg.append(b)}s.append(mg);
  if(AN.bone){s=aSec(P,BONE_LABEL[AN.bone]||'Körperteil','Dreh an den farbigen Ringen. Ziehen auf der Figur verschiebt weiterhin die ganze Figur.');anBoneUI.box=s;aBtn(aRow(s),'Teil zurücksetzen',()=>{const st=evalActor(a,AN.t,true),p={...st.pose};delete p[AN.bone];anSetKey(a,{pose:p});anCommit()});aBtn(s.lastChild,'Fertig',()=>anSelect(a.id),'btn ghost sm')}
  else{s=aSec(P,null);s.append(el('p','sub','Verschieben: an den Pfeilen ziehen (rot = links/rechts, grün = hoch/runter, blau = vorne/hinten) oder die Figur direkt über den Boden ziehen. Tippe sie noch einmal an, um einen Arm, ein Bein oder den Kopf einzeln zu drehen.'))}
  const cur=evalActor(a,AN.t,true);s=aSec(P,'Haltung');
  aRange(s,'Position links/rechts',-400,400,1,()=>Math.round(cur.x),v=>{anSetKey(a,{x:v})});
  aRange(s,'Position vorne/hinten',-400,400,1,()=>Math.round(cur.z),v=>{anSetKey(a,{z:v})});
  aSeg(s,'Pfeile in der Ansicht',[['translate','Verschieben'],['rotate','Drehen / Kippen']],()=>AN.amode||'translate',v=>{AN.amode=v;anSelect(a.id)});
  aRange(s,'Drehung',-180,180,1,()=>Math.round(cur.ry),v=>{anSetKey(a,{ry:v})},v=>v+'°');
  aRange(s,'Kippen (vor/zurück)',-180,180,1,()=>Math.round(cur.rx||0),v=>{anSetKey(a,{rx:v})},v=>v+'°');
  aRange(s,'Zur Seite kippen',-180,180,1,()=>Math.round(cur.rz||0),v=>{anSetKey(a,{rz:v})},v=>v+'°');
  {const r=aRow(s),lay=rx=>()=>{const c=evalActor(a,AN.t,true),up=!Math.abs(c.rx||0)&&!Math.abs(c.rz||0);anSetKey(a,{rx,rz:0,y:Math.round(((up?c.y:c.y-2)+(rx?2:0))*2)/2,pose:anPose('stehen')});anCommit();anPane()};
    aBtn(r,'Auf den Rücken legen',lay(-90));aBtn(r,'Auf den Bauch legen',lay(90));aBtn(r,'Aufrichten',lay(0))}
  aRange(s,'Höhe über dem Boden',-200,200,.5,()=>Math.round(cur.y*2)/2,v=>{anSetKey(a,{y:v})},v=>String(Math.round(v*10)/10).replace('.',','));
  const items=ST_ITEMS.map(([k2,n])=>[k2,n]).concat(PACK?Object.keys(PACK.imgs).filter(x=>x.startsWith('i/')).sort().map(x=>['pi_'+x.slice(2),prettyName(x.slice(2))]):[]);
  aSelect(s,'In der rechten Hand',items,()=>a.item||'',v=>{a.item=v;anSyncActors()});
  aSeg(s,'Arme',[['0','Klassisch'],['1','Schmal']],()=>a.slim?'1':'0',v=>{a.slim=v==='1';anSyncActors();anCommit()});
  aCheck(s,'Neue Strecken: automatisch laufen',()=>a.walk!==false,v=>{a.walk=v;anTimeline()});
  {const seg=k&&a.keys.indexOf(k)>0?k:a.keys.find(q=>q.t>AN.t+.02);if(seg){const i=a.keys.indexOf(seg),prev=a.keys[i-1];
    s=aSec(P,'Strecke '+anFmtT(prev.t)+' → '+anFmtT(seg.t),'Gilt für die Bewegung bis zu diesem Schlüsselbild. In der Zeitleiste zeigt ein Balken, wo gelaufen wird.');
    aSeg(s,null,[['1','Laufen'],['0','Gleiten / Fliegen']],()=>anWalks(a,seg)?'1':'0',v=>{seg.walk=v==='1';AN.pathDirty=true;anTimeline();anCommit()})}}
  if(k){s=aSec(P,'Schlüsselbild bei '+anFmtT(k.t));aSelect(s,'Übergang hierher',Object.entries(AN_EASE).map(([e,[n]])=>[e,n]),()=>k.ease||'smooth',v=>{k.ease=v;AN.pathDirty=true});
    if(a.keys.length>1)aBtn(aRow(s),'Schlüsselbild löschen',()=>{a.keys.splice(a.keys.indexOf(k),1);anTimeline();anCommit();anPane()},'btn sm danger')}
  s=aSec(P,null);const r=aRow(s);aBtn(r,'Duplizieren (mit Animation)',()=>{anCopyObj();anPasteObj()});aBtn(r,'Figur entfernen',()=>{D.actors.splice(D.actors.indexOf(a),1);anSelect(null);anSyncActors();anCommit();anPane()},'btn sm danger')}
function anBoneUI(){}
function anMove(a,steps){const t0=AN.t,last=steps[steps.length-1][0];if(t0+last>AN.data.dur){AN.data.dur=Math.min(30,Math.ceil((t0+last+.5)*2)/2)}
  for(const[dt,p,y]of steps){const t=Math.round((t0+dt)*20)/20,st=evalActor(a,t,true);let k=anKeyAt(a.keys,t);if(!k){k={t,ease:'smooth'};a.keys.push(k)}
    Object.assign(k,{pose:typeof p==='string'?anPose(p):anClone(p),x:st.x,z:st.z,ry:st.ry,y:y!=null?y:(typeof p==='string'&&POSES[p][2])||st.y,ease:dt?'smooth':(k.ease||'smooth')})}
  a.keys.sort((p,q)=>p.t-q.t);anTimeline();anCommit();anPane();toast('Bewegung eingefügt. Drück auf Abspielen.')}
function paneCam(P){const C=AN.data.cam;let s=aSec(P,'Kamerafahrt','Ein Klick erzeugt die ganze Fahrt. Danach kannst du sie anpassen.');const g=el('div','an-tpl');
  for(const[k,n,d]of AN_CAMS){const b=el('button','an-card');b.type='button';b.setAttribute('aria-pressed',C.preset===k);b.innerHTML='<b></b><span></span>';b.querySelector('b').textContent=n;b.querySelector('span').textContent=d;b.addEventListener('click',()=>{anCamPreset(k);anPane();anSeek(0);anPlay()});g.append(b)}s.append(g);
  if(C.preset==='custom')s.append(el('p','sub','Eigene Fahrt: Zeitregler verschieben und die Ansicht drehen oder zoomen.'));
  s=aSec(P,'Bild');aSeg(s,'Format',Object.entries(AN_FMT).map(([k,f])=>[k,f.n]),()=>AN.data.fmt,v=>{AN.data.fmt=v;anResize();anCommit()});
  aRange(s,'Brennweite (Zoom)',18,70,1,()=>C.fov,v=>{C.fov=v},v=>v<28?'Weitwinkel':v>48?'Tele':'Normal');
  aCheck(s,'Weich anfahren und abbremsen',()=>C.smooth,v=>{C.smooth=v;AN.pathDirty=true});
  aRange(s,'Handkamera (leichtes Wackeln)',0,1,.05,()=>C.shake||0,v=>{C.shake=v},v=>v?Math.round(v*100)+' %':'Aus');
  const k=anKeyAt(C.keys,AN.t);s=aSec(P,'Positionen',C.keys.length+(C.keys.length===1?' Position':' Positionen')+' in der Fahrt.');const r=aRow(s);
  aBtn(r,k?'Position hier ersetzen':'Position hier merken',anSetCamKey,'btn sm');if(k&&C.keys.length>1)aBtn(r,'Löschen',()=>{C.keys.splice(C.keys.indexOf(k),1);C.preset='custom';AN.pathDirty=true;anTimeline();anCommit();anPane()},'btn sm danger')}
function paneLight(P){const L=AN.data.light,fx=AN.data.fx;let s=aSec(P,'Stimmung');const g=el('div','an-tpl');
  for(const[k,v]of Object.entries(AN_LIGHT)){const b=el('button','an-card an-mood');b.type='button';b.dataset.mood=k;b.setAttribute('aria-pressed',L.preset===k);b.innerHTML='<b></b>';b.querySelector('b').textContent=v.n;
    b.addEventListener('click',()=>{Object.assign(L,anClone(v),{preset:k});anApplyLook();anCommit();anPane()});g.append(b)}s.append(g);
  const set=f=>v=>{f(v);L.preset='custom';anApplyLook()};
  s=aSec(P,'Sonne');aSeg(s,'Himmel',[['day','Tag'],['sunset','Abend'],['night','Nacht']],()=>L.sky,v=>{L.sky=v;L.preset='custom';anApplyLook();anCommit()});
  aRange(s,'Richtung',-180,180,1,()=>L.az,set(v=>L.az=v),v=>v+'°');aRange(s,'Höhe',2,85,1,()=>L.el,set(v=>L.el=v),v=>v+'°');
  aRange(s,'Sonnenlicht',0,2,.05,()=>L.power,set(v=>L.power=v),v=>Math.round(v*100)+' %');aRange(s,'Umgebungslicht',0,2,.05,()=>L.amb,set(v=>L.amb=v),v=>Math.round(v*100)+' %');
  aCheck(s,'Schatten',()=>L.shadows,v=>{L.shadows=v;anApplyLook()});aRange(s,'Weiche Schatten',1,8,1,()=>L.soft,set(v=>L.soft=v));
  s=aSec(P,'Look');aRange(s,'Dunst in der Ferne',0,1,.05,()=>L.fog,set(v=>L.fog=v),v=>Math.round(v*100)+' %');
  aRange(s,'Farbe: kühl ↔ warm',-1,1,.05,()=>L.tint,set(v=>L.tint=v),v=>v>0?'warm':v<0?'kühl':'neutral');
  aRange(s,'Vignette',0,1,.05,()=>L.vig,set(v=>L.vig=v),v=>Math.round(v*100)+' %');
  aSeg(s,'Kamera-Effekt',[['none','Aus'],['comic','Comic-Punkte'],['retro','16-Bit']],()=>fx.look||'none',v=>{fx.look=v;anCommit()});
  aCheck(s,'Kinobalken',()=>fx.bars,v=>{fx.bars=v;anFx()});aCheck(s,'Am Anfang ein- und am Ende ausblenden',()=>fx.fade,v=>{fx.fade=v})}
function paneOut(P){const D=AN.data,[w,h]=AN_FMT[D.fmt].s[D.q||0];let s=aSec(P,'Dein Video');
  const sum=el('dl','an-sum');for(const[a,b]of[['Länge',anFmtT(D.dur)],['Format',AN_FMT[D.fmt].n],['Größe',w+' × '+h],['Figuren',String(D.actors.length)],['Blöcke',String(D.blocks.length)]]){sum.append(el('dt',null,a),el('dd',null,b))}s.append(sum);
  aSeg(s,'Bilder pro Sekunde',[[15,'15'],[24,'24 (Film)'],[30,'30'],[60,'60']],()=>D.fps||30,v=>{D.fps=+v;anCommit()});
  aSeg(s,'Qualität',[[0,'Standard'],[1,'Hoch (Full HD)']],()=>D.q||0,v=>{D.q=+v;anCommit();anPane()});
  const r=aRow(s);aBtn(r,'Video erstellen',anRecord,'btn primary');aBtn(r,'Standbild (PNG)',anStill,'btn');
  s.append(el('p','sub',window.VideoEncoder&&window.Mp4Muxer?'Jedes Bild wird einzeln berechnet (30 Bilder pro Sekunde), das Video wird darum immer flüssig. Es wird als MP4 gespeichert.':'Das Video wird in Echtzeit aufgenommen. '+(anMime().includes('mp4')?'Es wird als MP4 gespeichert.':'Es wird als WebM gespeichert; das öffnen z. B. Chrome, VLC und YouTube.')))}

/* Zeitleiste */
function anTimeline(){const box=$('#an-tracks');if(!box||!AN.data)return;const D=AN.data;box.innerHTML='';
  const row=(lab,keys,id,sel,bars)=>{const r=el('div','an-row'+(sel?' sel':''));const l=el('div','an-lab',lab);const tr=el('div','an-trk');const inn=el('div','an-in');tr.append(inn);
    for(const k of keys){const b=el('button','an-key'+(Math.abs(k.t-AN.t)<.02?' on':''));b.type='button';b.style.left=(k.t/D.dur*100)+'%';b.title=anFmtT(k.t);b.setAttribute('aria-label',`${lab}: Schlüsselbild bei ${anFmtT(k.t)}`);b._k=k;b._id=id;b._keys=keys;inn.append(b)}
    if(bars)for(let i=1;i<keys.length;i++){if(!bars(keys[i]))continue;const g=el('span','an-walkseg');g.style.left=(keys[i-1].t/D.dur*100)+'%';g.style.width=((keys[i].t-keys[i-1].t)/D.dur*100)+'%';g.title='läuft';inn.prepend(g)}
    r.append(l,tr);box.append(r)};
  const ru=el('div','an-row an-ruler');ru.append(el('div','an-lab'));const rt=el('div','an-trk'),ri=el('div','an-in');rt.append(ri);ru.append(rt);
  const st=D.dur>15?5:D.dur>8?2:1;for(let s=0;s<=D.dur+1e-6;s+=st){const t=el('span','an-tick',s+' s');t.style.left=(s/D.dur*100)+'%';ri.append(t)}box.append(ru);
  if(AN.step>=2||D.cam.keys.length)row('Kamera',D.cam.keys,'cam',false);
  for(const a of D.actors){row(a.name,a.keys,a.id,a.id===AN.sel,k=>anWalks(a,k));if((a.faces||[]).length||a.id===AN.sel){a.faces=a.faces||[];row('↳ Gesicht',a.faces,a.id,a.id===AN.sel);box.lastChild.classList.add('an-facerow')}}
  for(const o of D.props)row(o.name,o.keys,o.id,o.id===AN.sel);
  for(const c of D.audio||[]){const r=el('div','an-row an-audrow'),l=el('div','an-lab','♪ '+c.name),tr=el('div','an-trk'),inn=el('div','an-in'),cl=el('button','an-clip');cl.type='button';cl._clip=c;
    cl.style.left=(c.at/D.dur*100)+'%';cl.style.width=(Math.max(.05,Math.min(c.dur,D.dur-c.at))/D.dur*100)+'%';cl.title=c.name+' · '+anFmtT(c.dur)+' · Lautstärke '+Math.round((c.vol??1)*100)+' %';cl.setAttribute('aria-label','Ton '+c.name+', antippen für Optionen');
    const e=AN_AUD.get(c.asset);if(e&&e.peaks){const cvs=mk(240,40),x=cvs.getContext('2d'),n=e.peaks.length,vis=Math.min(1,(D.dur-c.at)/c.dur);x.fillStyle='rgba(255,255,255,.75)';for(let i=0;i<240;i++){const v=e.peaks[Math.min(n-1,Math.floor(i/240*n*vis))]*36;x.fillRect(i,20-v/2,1,Math.max(1,v))}cl.append(cvs)}else anAudBuf(c);
    inn.append(cl);tr.append(inn);r.append(l,tr);box.append(r)}
  if(!D.actors.length&&!(AN.step>=2))box.append(Object.assign(el('div','an-row an-empty'),{textContent:''}));
  const ph=el('div','an-phl');ph.innerHTML='<div class="an-ph" id="an-ph"></div>';box.append(ph);ph.style.height=box.scrollHeight+'px';
  const ds=$('#an-dur');if(![...ds.options].some(o=>+o.value===D.dur))ds.append(new Option(String(D.dur).replace('.',',')+' s',String(D.dur)));ds.value=String(D.dur);anPH()}
function anPH(){const p=$('#an-ph');if(p)p.style.left=(AN.t/AN.data.dur*100)+'%';const l=$('#an-tlabel');if(l)l.textContent=anFmtT(AN.t)+' / '+anFmtT(AN.data.dur);
  document.querySelectorAll('#an-tracks .an-key').forEach(b=>b.classList.toggle('on',Math.abs(b._k.t-AN.t)<.02))}
(function(){const box=$('#an-tracks');if(!box)return;let D=null;
  const tAt=e=>{const inn=box.querySelector('.an-in');if(!inn)return 0;const r=inn.getBoundingClientRect();return clamp((e.clientX-r.left)/r.width,0,1)*AN.data.dur};
  /* Maus: sofort spulen/ziehen. Finger: senkrecht wischen scrollt die Zeilen, waagerecht spult, Tippen springt. */
  box.addEventListener('pointerdown',e=>{if(!AN.data||AN.rec)return;const k=e.target.closest('.an-key'),touch=e.pointerType==='touch';
    if(AN.playing)anStop();const cl=e.target.closest('.an-clip');D=cl?{clip:cl,at0:cl._clip.at,x:e.clientX,y:e.clientY,moved:false}:k?{k,x:e.clientX,y:e.clientY,moved:false}:{seek:true,x:e.clientX,y:e.clientY};D.id=e.pointerId;
    if(touch){D.pending=true;return}try{box.setPointerCapture(e.pointerId)}catch{}if(D.seek)anSeek(tAt(e))});
  box.addEventListener('pointermove',e=>{if(!D||e.pointerId!==D.id)return;
    if(D.pending){const dx=Math.abs(e.clientX-D.x),dy=Math.abs(e.clientY-D.y);if(dy>8&&dy>dx){D=null;return}if(dx<=6)return;D.pending=false;try{box.setPointerCapture(e.pointerId)}catch{}}
    if(D.seek){anSeek(tAt(e));return}if(Math.abs(e.clientX-D.x)>4)D.moved=true;if(!D.moved)return;
    if(D.clip){const inn=box.querySelector('.an-in'),w=inn?inn.getBoundingClientRect().width:600,c=D.clip._clip;c.at=clamp(Math.round((D.at0+(e.clientX-D.x)/w*AN.data.dur)*20)/20,0,AN.data.dur-.05);D.clip.style.left=(c.at/AN.data.dur*100)+'%';return}
    const b=D.k,ks=b._keys,i=ks.indexOf(b._k),lo=i>0?ks[i-1].t+.05:0,hi=i<ks.length-1?ks[i+1].t-.05:AN.data.dur;b._k.t=clamp(Math.round(tAt(e)*20)/20,lo,hi);b.style.left=(b._k.t/AN.data.dur*100)+'%';AN.t=b._k.t;AN.pathDirty=true;anPH()});
  const up=e=>{if(!D||e.pointerId!==D.id)return;const d=D;D=null;if(e.type==='pointercancel'&&d.pending)return;
    if(d.clip){const c=d.clip._clip;if(d.moved){anCommit();anTimeline();return}
      showMenu(d.clip,[['Neu zuschneiden …',async()=>{try{const buf=await anAudBuf(c);anTrimDialog({name:c.name,buf,at:c.at,vol:c.vol,clip:c})}catch{toast('Der Ton konnte nicht geladen werden.')}}],null,
        ...[1.5,1,.75,.5,.25].map(v=>['Lautstärke '+Math.round(v*100)+' %',()=>{c.vol=v;anCommit();anTimeline()},'',null,()=>Math.abs((c.vol??1)-v)<.01]),null,
        ['Ton entfernen',()=>{AN.data.audio.splice(AN.data.audio.indexOf(c),1);anCommit();anTimeline()}]]);return}
    if(d.k){const b=d.k;if(d.moved){anCommit();anTimeline()}else{anSeek(b._k.t);if(b._id!=='cam')anSelect(b._id)}if(!d.moved)anPane()}else{if(d.pending)anSeek(tAt(e));anPaneSoft()}};
  box.addEventListener('pointerup',up);box.addEventListener('pointercancel',up)})();

/* ---------- Video und Standbild ---------- */
function anMime(){if(!window.MediaRecorder)return'';for(const m of['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'])try{if(MediaRecorder.isTypeSupported(m))return m}catch{}return''}
/* Kamera-Effekte: Comic-Raster (Punkte) und 16-Farben-Look */
const AN_PAL=['#1a1c2c','#5d275d','#b13e53','#ef7d57','#ffcd75','#a7f070','#38b764','#257179','#29366f','#3b5dc9','#41a6f6','#73eff7','#f4f4f4','#94b0c2','#566c86','#333c57'].map(h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)));
let anLut=null;function anPalLut(){if(anLut)return anLut;anLut=new Uint8Array(32768);for(let i=0;i<32768;i++){const r=(i>>10)<<3|4,g=(i>>5&31)<<3|4,b=(i&31)<<3|4;let bi=0,bd=1e9;
  AN_PAL.forEach((c,j)=>{const d=(c[0]-r)**2*.3+(c[1]-g)**2*.59+(c[2]-b)**2*.11;if(d<bd){bd=d;bi=j}});anLut[i]=bi}return anLut}
const anTmp={a:null,b:null};
function anPostFx(x,W,H,kind){if(!kind||kind==='none')return;
  if(kind==='retro'){/* 16-Bit-Farben (RGB 5-6-5, 65 536 Farben) mit 4×4-Raster (Dithering) und leicht groben Pixeln */
    const sc=Math.max(2,Math.round(W/480)),w=Math.ceil(W/sc),h=Math.ceil(H/sc),c=anTmp.a&&anTmp.a.width===w&&anTmp.a.height===h?anTmp.a:(anTmp.a=mk(w,h)),cx=c.getContext('2d');
    cx.drawImage(x.canvas,0,0,w,h);const im=cx.getImageData(0,0,w,h),d=im.data,B=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
    for(let y=0;y<h;y++)for(let xx=0;xx<w;xx++){const i=(y*w+xx)*4,t=B[(y&3)*4+(xx&3)]/16-.5;
      const q=(v,bits)=>{const n=(1<<bits)-1,s=255/n;return clamp(Math.round((v+t*s)/s),0,n)*s};d[i]=q(d[i],5);d[i+1]=q(d[i+1],6);d[i+2]=q(d[i+2],5)}
    cx.putImageData(im,0,0);x.save();x.imageSmoothingEnabled=false;x.drawImage(c,0,0,W,H);x.restore();return}
  if(kind==='comic'){const w=Math.ceil(W/2),h=Math.ceil(H/2),c=anTmp.a&&anTmp.a.width===w&&anTmp.a.height===h?anTmp.a:(anTmp.a=mk(w,h)),cx=c.getContext('2d');cx.drawImage(x.canvas,0,0,w,h);
    const im=cx.getImageData(0,0,w,h),d=im.data,q=v=>Math.round(v/255*4)/4*255;for(let i=0;i<d.length;i+=4){const l=(d[i]+d[i+1]+d[i+2])/3;for(let k=0;k<3;k++)d[i+k]=clamp(q(l+(d[i+k]-l)*1.35),0,255)}cx.putImageData(im,0,0);
    x.save();x.drawImage(c,0,0,W,H);const cell=Math.max(5,Math.round(W/160)),gw=Math.ceil(W/cell)+1,gh=Math.ceil(H/cell)+1,g=anTmp.b&&anTmp.b.width===gw&&anTmp.b.height===gh?anTmp.b:(anTmp.b=mk(gw,gh)),gx=g.getContext('2d');
    gx.drawImage(x.canvas,0,0,gw,gh);const gd=gx.getImageData(0,0,gw,gh).data;x.fillStyle='rgba(18,12,28,.55)';x.beginPath();
    for(let y=0;y<gh;y++)for(let xx=0;xx<gw;xx++){const i=(y*gw+xx)*4,l=(gd[i]*.3+gd[i+1]*.59+gd[i+2]*.11)/255,r=(1-l)*cell*.62;if(r<.7)continue;const px=xx*cell+(y%2?cell/2:0),py=y*cell;x.moveTo(px+r,py);x.arc(px,py,r,0,6.2832)}x.fill();
    x.globalCompositeOperation='screen';x.globalAlpha=.18;x.drawImage(x.canvas,Math.max(1,W/400),0,W,H);x.restore()}}
function anComposite(x,W,H,t){const D=AN.data,L=D.light;x.drawImage(AR.renderer.domElement,0,0,W,H);anPostFx(x,W,H,D.fx.look);
  if(L.tint){x.save();x.globalCompositeOperation='soft-light';x.globalAlpha=Math.abs(L.tint)*.55;x.fillStyle=L.tint>0?'#ff9a3c':'#4682ff';x.fillRect(0,0,W,H);x.restore()}
  if(L.vig>0){x.save();x.translate(W/2,H/2);x.scale(W/2,H/2);const g=x.createRadialGradient(0,0,0,0,0,1.42);g.addColorStop(.38,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${L.vig})`);x.fillStyle=g;x.fillRect(-1,-1,2,2);x.restore()}
  if(D.fx.bars){const bh=W>H?Math.max(0,(H-W/2.39)/2):H*.09;x.fillStyle='#000';x.fillRect(0,0,W,bh);x.fillRect(0,H-bh,W,bh)}
  const f=D.fx.fade&&t!=null?anFade(t):0;if(f>0){x.fillStyle=`rgba(0,0,0,${f})`;x.fillRect(0,0,W,H)}}
function anSize(){const D=AN.data;return AN_FMT[D.fmt].s[D.q||0]}
function anStill(){if(!AR)return;const[W,H]=anSize(),prev=AR.renderer.getPixelRatio();AR.renderer.setPixelRatio(1);AR.renderer.setSize(W,H,false);
  const ph=AN.playing;AN.playing=false;AR.helpers.visible=false;AR.tc.visible=false;AR.renderer.render(AR.scene,AR.camera);const c=mk(W,H);anComposite(c.getContext('2d'),W,H,null);AR.renderer.setPixelRatio(prev);AN.playing=ph;anResize();
  c.toBlob(b=>{if(b)saveFile('rendernail-standbild.png',b,c.toDataURL('image/png'))},'image/png')}
/* Video: am liebsten Bild für Bild mit WebCodecs (immer flüssig, unabhängig vom Gerät), sonst Echtzeit-Aufnahme */
async function anCodec(W,H){if(!window.VideoEncoder||!window.VideoFrame||!window.Mp4Muxer)return null;
  for(const codec of['avc1.640033','avc1.640028','avc1.4d0028','avc1.42003e','avc1.42001f'])try{const c={codec,width:W,height:H,bitrate:H>=1080||W>=1080?12e6:8e6,framerate:30};if((await VideoEncoder.isConfigSupported(c)).supported)return c}catch{}return null}
function anRecUI(){const ov=$('#an-rec');ov.hidden=false;ov.innerHTML='<div class="an-reccard"><b>Video wird erstellt</b><div class="an-prog"><i></i></div><p class="sub" id="an-recst"></p><button class="btn sm" type="button">Abbrechen</button></div>';
  const st={cancel:false};ov.querySelector('button').addEventListener('click',()=>{st.cancel=true});
  st.prog=(t,txt)=>{const p=ov.querySelector('.an-prog i');if(p)p.style.width=(t*100)+'%';const s=$('#an-recst');if(s)s.textContent=txt};return st}
function anRecDone(blob,ext){const ov=$('#an-rec'),url=URL.createObjectURL(blob);
  ov.innerHTML='<div class="an-reccard an-done"><b>Fertig!</b><video controls playsinline loop muted></video><div class="btnrow"><button class="btn primary" type="button" data-s>Video speichern</button><button class="btn" type="button" data-c>Schließen</button></div></div>';
  const v=ov.querySelector('video');v.src=url;v.play().catch(()=>{});ov.querySelector('[data-s]').addEventListener('click',()=>saveFile('rendernail-animation.'+ext,blob));
  ov.querySelector('[data-c]').addEventListener('click',()=>{ov.hidden=true;v.pause();URL.revokeObjectURL(url)})}
function anRecPrep(W,H){anStop();anSelect(AN.sel);AR.tc.detach();AR.tcm.detach();AR.renderer.setPixelRatio(1);AR.renderer.setSize(W,H,false)}
async function anRecord(){if(!AR||AN.rec)return;const[W,H]=anSize(),cfg=await anCodec(W,H);
  if(!cfg){anRecordLive();return}
  const out=mk(W,H),x=out.getContext('2d'),fps=AN.data.fps||30,N=Math.max(1,Math.round(AN.data.dur*fps)),ui=anRecUI();let err=null;
  let mix=null,acod=null;if((AN.data.audio||[]).length){ui.prog(0,'Ton wird gemischt …');try{mix=await anMixAudio()}catch{mix=null}if(mix){acod=await anAudCodec();if(!acod){$('#an-rec').hidden=true;anRecordLive(mix);return}}}
  const muxer=new Mp4Muxer.Muxer({target:new Mp4Muxer.ArrayBufferTarget(),video:{codec:'avc',width:W,height:H,frameRate:fps},...(mix?{audio:{codec:acod.mux,sampleRate:mix.sampleRate,numberOfChannels:2}}:{}),fastStart:'in-memory'});
  const enc=new VideoEncoder({output:(c,m)=>muxer.addVideoChunk(c,m),error:e=>{err=e}});enc.configure({...cfg,latencyMode:'quality'});
  AN.rec={enc};anRecPrep(W,H);const t0=AN.t;
  try{for(let i=0;i<N;i++){if(ui.cancel||err)break;const t=i/fps;AN.t=t;anRender(performance.now());anComposite(x,W,H,t);
      const f=new VideoFrame(out,{timestamp:Math.round(i*1e6/fps),duration:Math.round(1e6/fps)});enc.encode(f,{keyFrame:i%(fps*2)===0});f.close();
      while(enc.encodeQueueSize>3)await new Promise(r=>setTimeout(r,4));
      if(i%2===0){ui.prog(i/N,anFmtT(t)+' von '+anFmtT(AN.data.dur));await new Promise(r=>requestAnimationFrame(r))}}
    if(!ui.cancel&&!err){ui.prog(1,'Wird gespeichert …');await enc.flush();if(mix){ui.prog(1,'Ton wird eingefügt …');await anEncodeAudio(muxer,mix,acod.codec)}muxer.finalize()}}catch(e){err=e}
  try{enc.close()}catch{}AN.rec=null;AN.t=t0;anResize();
  if(ui.cancel){$('#an-rec').hidden=true;toast('Aufnahme abgebrochen.');return}
  if(err){$('#an-rec').hidden=true;toast('Das Video konnte nicht erstellt werden, ich versuche die Echtzeit-Aufnahme.');anRecordLive();return}
  anRecDone(new Blob([muxer.target.buffer],{type:'video/mp4'}),'mp4')}
function anRecordLive(mix){let asrc=null;const withAudio=st=>{if(mix){const ctx=anACtx(),dst=ctx.createMediaStreamDestination();asrc=ctx.createBufferSource();asrc.buffer=mix;asrc.connect(dst);dst.stream.getAudioTracks().forEach(t=>st.addTrack(t))}return st};const mime=anMime(),c0=mk(2,2);if(!mime||!c0.captureStream){toast('Dieser Browser kann keine Videos aufnehmen. Nimm Chrome, Edge oder Safari.');return}
  const[W,H]=anSize(),out=mk(W,H),x=out.getContext('2d'),stream=withAudio(out.captureStream(AN.data.fps||30)),rec=new MediaRecorder(stream,{mimeType:mix?mime.split(';')[0]:mime,videoBitsPerSecond:H>=1080||W>=1080?12e6:8e6}),chunks=[],ui=anRecUI();
  anRecPrep(W,H);AN.rec={rec};AN.t=0;rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
  rec.onstop=()=>{AN.rec=null;anResize();if(ui.cancel){$('#an-rec').hidden=true;toast('Aufnahme abgebrochen.');return}anRecDone(new Blob(chunks,{type:mime.split(';')[0]}),mime.includes('mp4')?'mp4':'webm')};
  rec.start(250);const start=performance.now();if(asrc){anACtx().resume();asrc.start()}
  const tick=now=>{if(!AN.rec)return;const t=Math.min(AN.data.dur,(now-start)/1000);AN.t=t;anRender(now);anComposite(x,W,H,t);ui.prog(t/AN.data.dur,anFmtT(t)+' von '+anFmtT(AN.data.dur));
    if(ui.cancel||t>=AN.data.dur){setTimeout(()=>{try{rec.stop()}catch{AN.rec=null}},120);return}requestAnimationFrame(tick)};requestAnimationFrame(tick)}

/* ---------- Alles neu aufbauen ---------- */
async function anRefreshSkins(){if(!window.RK_LOCAL||typeof currentSkin!=='function')return;const pid=AN.pid;let n=0;
  for(const a of AN.data.actors.filter(x=>x.skin&&x.ign!==false)){const r=await currentSkin(a.name);if(!r||AN.pid!==pid)continue;if(r.data!==a.skin){anSkins.set(r.data,r.canvas);a.skin=r.data;a.slim=r.slim;n++}}
  if(n&&AN.pid===pid){anSyncActors();AN.hist[AN.hist.length-1]=JSON.stringify(AN.data);anSaveNow();anPane();toast(n===1?'Skin auf den aktuellen Stand gebracht.':`${n} Skins auf den aktuellen Stand gebracht.`)}}
function anRebuildAll(){if(!AR)return;setTimeout(anRefreshSkins,80);AN.t=clamp(AN.t,0,AN.data.dur);anRebuildBlocks();anSyncActors();anSyncProps();anApplyLook();if(AN.sel&&!anActor()&&!anProp())anSelect(null);anTimeline();anPane();anResize()}
document.addEventListener('change',e=>{if(!e.target||e.target.id!=='f-anskin')return;const f=e.target.files[0];e.target.value='';if(!f)return;
  blobToDataURL(f).then(loadSkinFile).then(c=>{const slim=c.height===64&&c.getContext('2d').getImageData(54,20,1,1).data[3]===0,d=c.toDataURL('image/png');anSkins.set(d,c);anAddActor((f.name||'Skin').replace(/\.png$/i,'').slice(0,30),d,slim);{const a=AN.data.actors[AN.data.actors.length-1];if(a){a.ign=false;anCommit()}}anPane()}).catch(err=>toast(err&&err.message?err.message:'Der Skin konnte nicht gelesen werden.'))});
document.addEventListener('keydown',e=>{if(view!=='anim'||!AN.ready||AN.rec)return;const t=e.target;if(t.closest&&t.closest('input,textarea,select'))return;
  if(e.key===' '){e.preventDefault();anPlay()}else if(e.key==='ArrowLeft'){e.preventDefault();anSeek(AN.t-(e.shiftKey?1:.05))}else if(e.key==='ArrowRight'){e.preventDefault();anSeek(AN.t+(e.shiftKey?1:.05))}
  else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();anUndo(e.shiftKey?1:-1)}
  else if(e.key==='Escape'){if(AN.bone)anSelect(AN.sel);else anSelect(null)}
  else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='c'){if(anCopyObj())e.preventDefault()}
  else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='v'){if(anPasteObj())e.preventDefault()}
  else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='d'){e.preventDefault();if(anCopyObj())anPasteObj()}});
(function(){const q=s=>document.querySelector(s);if(!q('#an-play'))return;
  q('#an-play').addEventListener('click',()=>{if(AN.ready)anPlay()});q('#an-start').addEventListener('click',()=>{if(AN.ready){anStop();anSeek(0)}});
  q('#an-loop').addEventListener('click',e=>{AN.loop=!AN.loop;e.currentTarget.setAttribute('aria-pressed',AN.loop)});
  q('#an-dur').addEventListener('change',e=>{const D=AN.data,nd=+e.target.value,f=nd/D.dur;for(const a of D.actors)a.keys.forEach(k=>k.t=Math.round(k.t*f*20)/20);D.cam.keys.forEach(k=>k.t=Math.round(k.t*f*20)/20);D.dur=nd;AN.t=Math.min(AN.t*f,nd);AN.pathDirty=true;anTimeline();anCommit();anPane()});
  q('#an-undo').addEventListener('click',()=>anUndo(-1));q('#an-redo').addEventListener('click',()=>anUndo(1));
  q('#an-look').addEventListener('click',e=>{AN.look=AN.look==='cam'?'work':'cam';e.currentTarget.setAttribute('aria-pressed',AN.look==='cam')});
  q('#an-new').addEventListener('click',()=>{if(AN.ready)anNewProject(prompt('Name der neuen Animation:','Animation '+(anIndex().length+1))||'')});
  q('#an-proj').addEventListener('click',e=>{if(!AN.ready)return;if(openMenu&&openMenu.btn===e.currentTarget){closeMenu();return}anProjMenu(e.currentTarget)});
  document.addEventListener('change',e=>{if(!e.target||e.target.id!=='f-anfile')return;const f=e.target.files[0];e.target.value='';if(!f)return;
    f.text().then(async t=>{const o=JSON.parse(t);if(!o||o.app!=='rendernail-animation'||!o.data||o.data.v!==1)throw new Error('Das ist keine Rendernail-Animation.');await anUnembedAudio(o.data);anNewProject(String(o.name||f.name.replace(/\.rnanim\.json$|\.json$/i,'')).slice(0,60),o.data);toast('Animation geöffnet.')}).catch(err=>toast(err.message||'Die Datei konnte nicht gelesen werden.'))});
  addEventListener('pagehide',()=>{if(AN.ready)anSaveNow()});document.addEventListener('visibilitychange',()=>{if(document.hidden&&AN.ready)anSaveNow()});
  document.addEventListener('keydown',e=>{if(view==='anim'&&AN.ready&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(anSaveNow())toast('Gespeichert.')}})})();
packWatchers.push(()=>{if(!AR)return;anOpq.clear();anCloudKey='';anSunKey='';anRebuildBlocks();anSyncActors();anSyncProps();anApplyLook();if(view==='anim')anPane()});

(function(){const h=$('#an-hint'),b=$('#an-help');if(!h||!b)return;
  h.querySelector('.x').addEventListener('click',()=>{const k=AN_STEPS[AN.step][0];anHintSeen.add(k+(k==='act'?AN.data.actors.length>0:''));anHintShow(false)});
  b.addEventListener('click',()=>anHintShow(true))})();
multiTap($('#an-frame'),()=>{if(AN.ready&&AN.hist.length>1){anUndo(-1);toast('Rückgängig')}},()=>{if(AN.ready&&AN.fut.length){anUndo(1);toast('Wiederholt')}});

(function(){const b=$('#an-posedone');if(b)b.querySelector('button').addEventListener('click',()=>anSelect(AN.sel))})();
FLY_CTX.push(()=>{if(view!=='anim'||!AR||AN.rec||AN.playing)return null;const st=AN_STEPS[AN.step][0];if(anLook()==='cam'&&st!=='cam')return null;
  return{camera:AR.camera,controls:AR.controls,start(){AN.tween=null;if(st==='cam')AN.camEdit=true},end(){if(AN.camEdit){AN.camEdit=false;anSetCamKey()}}}});

/* ================= Ton-Spur =================
   Audio oder Video laden (alles, was der Browser lesen kann: MP3, M4A, AAC, WAV, FLAC, OGG, Opus, MP4, MOV, WebM …),
   Ausschnitt wählen, als WAV speichern und in der Zeitleiste platzieren. Läuft beim Abspielen und kommt mit ins Video. */
const AN_AUD=new Map();let anAC=null;
function anACtx(){if(!anAC){const C=window.AudioContext||window.webkitAudioContext;anAC=new C()}return anAC}
function anPeaks(buf,n){const d=buf.getChannelData(0),s=Math.max(1,Math.floor(d.length/n)),st=Math.max(1,Math.floor(s/48)),o=new Float32Array(n);
  for(let i=0;i<n;i++){let m=0;const a=i*s,b=Math.min(d.length,a+s);for(let j=a;j<b;j+=st){const v=Math.abs(d[j]);if(v>m)m=v}o[i]=m}return o}
function anAudBuf(c){let e=AN_AUD.get(c.asset);if(e)return e.p;e={};e.p=(async()=>{const b=await srcBlob({asset:c.asset});const buf=await anACtx().decodeAudioData(await b.arrayBuffer());e.buf=buf;e.peaks=anPeaks(buf,600);anTimeline();return buf})();e.p.catch(()=>{});AN_AUD.set(c.asset,e);return e.p}
function anWav(buf,a,b){const ch=Math.min(2,buf.numberOfChannels),sr=buf.sampleRate,s0=Math.floor(a*sr),n=Math.max(1,Math.floor((b-a)*sr)),D=[...Array(ch)].map((_,i)=>buf.getChannelData(i));
  const ab=new ArrayBuffer(44+n*ch*2),v=new DataView(ab),w=(o,t)=>{for(let i=0;i<t.length;i++)v.setUint8(o+i,t.charCodeAt(i))};
  w(0,'RIFF');v.setUint32(4,36+n*ch*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);v.setUint32(24,sr,true);v.setUint32(28,sr*ch*2,true);v.setUint16(32,ch*2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*ch*2,true);
  let o=44;for(let i=0;i<n;i++)for(let c=0;c<ch;c++){const x=clamp(D[c][s0+i]||0,-1,1);v.setInt16(o,x<0?x*32768:x*32767,true);o+=2}return new Blob([ab],{type:'audio/wav'})}
const AN_AUDIO_ACCEPT='audio/*,video/*,.mp3,.m4a,.m4b,.aac,.wav,.wave,.flac,.ogg,.oga,.opus,.aif,.aiff,.caf,.mp4,.m4v,.mov,.webm,.mkv,.3gp';
async function anAudioFile(f){if(!f)return;if(f.size>900*1048576){toast('Die Datei ist zu groß (über 900 MB). Schneide sie vorher kürzer.');return}
  if(!ASSETS){toast('Hier kann ich keine Töne speichern.');return}toast('Ton wird gelesen …');
  let buf;try{buf=await anACtx().decodeAudioData(await f.arrayBuffer())}catch{toast('Den Ton dieser Datei kann dein Browser nicht lesen. Probier MP3, M4A oder WAV, oder ein Video mit AAC-Ton.');return}
  anTrimDialog({name:String(f.name||'Ton').replace(/\.[a-z0-9]+$/i,'').slice(0,40),buf,at:AN.t,vol:1})}
function anTrimDialog(o){const buf=o.buf,full=buf.duration,ov=$('#an-trim');let a=o.a??0,b=o.b??Math.min(full,60),play=null,raf=0;
  ov.hidden=false;ov.innerHTML=`<div class="an-reccard an-trimcard"><b></b><p class="sub">Zieh den hellen Bereich oder seine Ränder, um den Ausschnitt zu wählen (höchstens 60 s).</p>
    <canvas class="an-wave" width="1040" height="200" aria-label="Wellenform"></canvas>
    <div class="an-trimrow"><label>Von <input type="number" step="0.01" min="0" data-a> s</label><label>Bis <input type="number" step="0.01" min="0" data-b> s</label><span class="sub" data-len></span><button class="btn sm" type="button" data-play>▶ Anhören</button></div>
    <div class="an-trimrow"><label>Startet in der Animation bei <input type="number" step="0.05" min="0" data-at> s</label><label class="grow">Lautstärke <input type="range" min="0" max="1.5" step="0.05" data-vol></label></div>
    <div class="btnrow"><button class="btn primary" type="button" data-ok>Übernehmen</button><button class="btn" type="button" data-x>Abbrechen</button></div></div>`;
  ov.querySelector('b').textContent='Ton: '+o.name+' ('+anFmtT(full)+')';
  const cv=ov.querySelector('canvas'),x=cv.getContext('2d'),pk=anPeaks(buf,cv.width),ia=ov.querySelector('[data-a]'),ib=ov.querySelector('[data-b]'),iat=ov.querySelector('[data-at]'),iv=ov.querySelector('[data-vol]');
  iat.value=(Math.round((o.at||0)*20)/20).toFixed(2);iv.value=o.vol??1;
  const draw=(ph)=>{const W=cv.width,H=cv.height,X=t=>t/full*W;x.clearRect(0,0,W,H);x.fillStyle='#1a1a1a';x.fillRect(0,0,W,H);
    x.fillStyle='rgba(255,255,255,.1)';x.fillRect(X(a),0,X(b)-X(a),H);
    for(let i=0;i<W;i++){const t=i/W*full,h=Math.max(1,pk[i]*H*.92);x.fillStyle=t>=a&&t<=b?'#d6d6d6':'#5a5a5a';x.fillRect(i,(H-h)/2,1,h)}
    x.fillStyle='#ffffff';x.fillRect(X(a)-2,0,4,H);x.fillRect(X(b)-2,0,4,H);if(ph!=null){x.fillStyle='#ffb84d';x.fillRect(X(ph)-1,0,2,H)}
    ia.value=a.toFixed(2);ib.value=b.toFixed(2);ov.querySelector('[data-len]').textContent='Länge '+anFmtT(b-a)};
  const fix=()=>{a=clamp(a,0,full);b=clamp(b,0,full);if(b-a<.05)b=Math.min(full,a+.05);if(b-a>60)b=a+60};
  const stop=()=>{if(play){try{play.stop()}catch{}play=null}cancelAnimationFrame(raf);ov.querySelector('[data-play]').textContent='▶ Anhören';draw()};
  let D=null;const tAt=e=>{const r=cv.getBoundingClientRect();return clamp((e.clientX-r.left)/r.width,0,1)*full};
  cv.addEventListener('pointerdown',e=>{stop();const t=tAt(e),r=cv.getBoundingClientRect(),px=full/r.width*14;cv.setPointerCapture(e.pointerId);
    D=Math.abs(t-a)<px?{m:'a'}:Math.abs(t-b)<px?{m:'b'}:t>a&&t<b?{m:'mv',t0:t,a0:a,b0:b}:{m:'new',t0:t};if(D.m==='new'){a=b=t}draw()});
  cv.addEventListener('pointermove',e=>{if(!D)return;const t=tAt(e);if(D.m==='a')a=Math.min(t,b-.05);else if(D.m==='b')b=Math.max(t,a+.05);else if(D.m==='mv'){const d=clamp(t-D.t0,-D.a0,full-D.b0);a=D.a0+d;b=D.b0+d}else{a=Math.min(D.t0,t);b=Math.max(D.t0,t)}fix();draw()});
  cv.addEventListener('pointerup',()=>{D=null;fix();draw()});
  ia.addEventListener('change',()=>{a=+ia.value||0;fix();draw()});ib.addEventListener('change',()=>{b=+ib.value||0;fix();draw()});
  ov.querySelector('[data-play]').addEventListener('click',()=>{if(play){stop();return}const ctx=anACtx();ctx.resume();const s=ctx.createBufferSource(),g=ctx.createGain();g.gain.value=+iv.value;s.buffer=buf;s.connect(g).connect(ctx.destination);
    const t0=ctx.currentTime;s.start(0,a,b-a);play=s;s.onended=()=>{if(play===s)stop()};ov.querySelector('[data-play]').textContent='■ Stopp';const tick=()=>{draw(a+ctx.currentTime-t0);raf=requestAnimationFrame(tick)};tick()});
  const close=()=>{stop();ov.hidden=true;ov.innerHTML=''};
  ov.querySelector('[data-x]').addEventListener('click',close);
  ov.querySelector('[data-ok]').addEventListener('click',async()=>{const btn=ov.querySelector('[data-ok]');btn.disabled=true;btn.textContent='Wird gespeichert …';fix();
    try{const blob=anWav(buf,a,b),r=await ASSETS.upload(blob),at=Math.max(0,Math.round((+iat.value||0)*20)/20),len=b-a,D2=AN.data;
      const seg=await anACtx().decodeAudioData(await blob.arrayBuffer());AN_AUD.set(r.id,{p:Promise.resolve(seg),buf:seg,peaks:anPeaks(seg,600)});
      if(o.clip){Object.assign(o.clip,{asset:r.id,dur:len,at,vol:+iv.value})}else D2.audio.push({id:'au'+uid(),name:o.name,asset:r.id,dur:len,at,vol:+iv.value});
      if(at+len>D2.dur&&D2.dur<30){const nd=Math.min(30,Math.ceil(at+len));D2.dur=nd;toast(`Animation auf ${nd} s verlängert, damit der Ton hineinpasst.`)}else toast('Ton eingefügt. Er läuft beim Abspielen mit.');
      AN.pathDirty=true;close();anTimeline();anCommit()}catch(e){btn.disabled=false;btn.textContent='Übernehmen';toast('Der Ton konnte nicht gespeichert werden.')}});
  draw()}
/* Abspielen: Ton läuft mit, die Zeit folgt der Tonuhr (bleibt synchron) */
AN.srcs=[];AN.audT0=null;
function anAudioStart(){anAudioStop();const C=AN.data.audio||[];if(!C.length)return;const ctx=anACtx();ctx.resume();const t0=AN.t;
  for(const c of C){const e=AN_AUD.get(c.asset);if(!e||!e.buf){anAudBuf(c);continue}const off=t0-c.at;if(off>=c.dur)continue;
    const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=e.buf;g.gain.value=c.vol??1;s.connect(g).connect(ctx.destination);s.start(ctx.currentTime+Math.max(0,-off)+.02,Math.max(0,off),c.dur-Math.max(0,off));AN.srcs.push(s)}
  AN.audT0=ctx.currentTime+.02;AN.audT=t0}
function anAudioStop(){for(const s of AN.srcs)try{s.stop()}catch{}AN.srcs=[];AN.audT0=null}
let anScrubT=0;function anScrub(t){const C=AN.data.audio||[];if(!C.length||AN.playing)return;const now=performance.now();if(now-anScrubT<70)return;anScrubT=now;const ctx=anACtx();ctx.resume();
  for(const c of C){const e=AN_AUD.get(c.asset);if(!e||!e.buf)continue;const off=t-c.at;if(off<0||off>=c.dur)continue;const s=ctx.createBufferSource(),g=ctx.createGain();s.buffer=e.buf;
    g.gain.setValueAtTime(0,ctx.currentTime);g.gain.linearRampToValueAtTime(c.vol??1,ctx.currentTime+.01);g.gain.linearRampToValueAtTime(0,ctx.currentTime+.09);s.connect(g).connect(ctx.destination);s.start(0,off,.1)}}
/* Für das Video: alles zu einer Stereo-Spur mischen */
async function anMixAudio(sr=48000){const C=(AN.data.audio||[]).filter(c=>c.at<AN.data.dur);if(!C.length)return null;const D=AN.data.dur,len=Math.ceil(D*sr),oc=new OfflineAudioContext(2,len,sr),m=oc.createGain();m.connect(oc.destination);
  if(AN.data.fx.fade){m.gain.setValueAtTime(0,0);m.gain.linearRampToValueAtTime(1,.6);m.gain.setValueAtTime(1,Math.max(.6,D-.6));m.gain.linearRampToValueAtTime(0,D)}
  for(const c of C){let buf;try{buf=await anAudBuf(c)}catch{continue}const s=oc.createBufferSource(),g=oc.createGain();s.buffer=buf;g.gain.value=c.vol??1;s.connect(g).connect(m);s.start(c.at,0,Math.min(c.dur,D-c.at))}
  return oc.startRendering()}
async function anEncodeAudio(muxer,buf,codec){const sr=buf.sampleRate,L=buf.getChannelData(0),R=buf.numberOfChannels>1?buf.getChannelData(1):L;let err=null;
  const ae=new AudioEncoder({output:(c,m)=>muxer.addAudioChunk(c,m),error:e=>{err=e}});ae.configure({codec,sampleRate:sr,numberOfChannels:2,bitrate:160000});
  for(let i=0;i<L.length;i+=4096){const n=Math.min(4096,L.length-i),d=new Float32Array(n*2);d.set(L.subarray(i,i+n),0);d.set(R.subarray(i,i+n),n);
    const ad=new AudioData({format:'f32-planar',sampleRate:sr,numberOfFrames:n,numberOfChannels:2,timestamp:Math.round(i/sr*1e6),data:d});ae.encode(ad);ad.close()}
  await ae.flush();ae.close();if(err)throw err}
async function anAudCodec(){if(!window.AudioEncoder||!window.AudioData)return null;for(const[c,m]of[['mp4a.40.2','aac'],['opus','opus']]){try{if((await AudioEncoder.isConfigSupported({codec:c,sampleRate:48000,numberOfChannels:2,bitrate:160000})).supported)return{codec:c,mux:m}}catch{}}return null}
/* Datei-Export/Import der Animation: Töne werden eingebettet */
async function anEmbedAudio(data){const d=JSON.parse(JSON.stringify(data));for(const c of d.audio||[]){try{c.data=await blobToDataURL(await srcBlob({asset:c.asset}))}catch{}}return d}
async function anUnembedAudio(data){for(const c of data.audio||[]){if(typeof c.data==='string'&&/^data:audio\//.test(c.data)&&ASSETS){try{const r=await ASSETS.upload(await(await fetch(c.data)).blob());c.asset=r.id}catch{}}delete c.data}return data}
(function(){const b=$('#an-addaudio');if(!b)return;b.addEventListener('click',()=>{const i=$('#f-anaudio');i.accept=AN_AUDIO_ACCEPT;i.click()});
  document.addEventListener('change',e=>{if(!e.target||e.target.id!=='f-anaudio')return;const f=e.target.files[0];e.target.value='';if(f&&AN.ready){anStop();anAudioFile(f)}})})();

(function(){const g=document.querySelector('#an-mode');if(g)g.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{AN.moveAll=b.dataset.m==='1';g.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b));
    toast(AN.moveAll?'Ganzes verschieben: Ziehen bewegt die komplette Animation, Schlüsselbilder bleiben gleich.':'Animieren: Änderungen legen Schlüsselbilder an.')}));
  const gb=document.querySelector('#an-guide');if(gb){const modes=[['','Hochkant-Rahmen'],['9:16','Rahmen: 9:16'],['1:1','Rahmen: 1:1']];let i=0;
    gb.addEventListener('click',()=>{i=(i+1)%modes.length;AN.guide=modes[i][0];gb.textContent=modes[i][1];gb.setAttribute('aria-pressed',!!AN.guide);anGuide()})}})();
function anGuide(){const box=$('#an-guidebox');if(!box||!AN.data)return;const on=!!AN.guide&&AN.data.fmt==='16:9';box.hidden=!on;if(!on)return;const fr=AR.frame,h=fr.clientHeight,w=AN.guide==='9:16'?h*9/16:h;box.style.width=w+'px';box.dataset.l=AN.guide+' – das sieht man im Hochformat'}
