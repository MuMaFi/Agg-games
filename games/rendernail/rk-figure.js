'use strict';
/* ================= Minecraft-Figuren im Editor =================
   Eine Figur-Ebene speichert Skin (PNG als Data-URL), Arme, Gegenstand, Pose und Drehung.
   Gezeichnet wird sie mit derselben 3D-Figur wie im Pose-Studio. */
const GRAY_SKIN=paintSkin({skin:'#a5a5a5',hair:'#8e8e8e',eye:'#6c6c6c',shirt:'#8f8f8f',pants:'#767676',shoe:'#606060',mob:true},9);
const skinCanvasCache=new Map();
function figSkin(fig){const url=fig&&fig.skin;if(!url)return GRAY_SKIN;let c=skinCanvasCache.get(url);if(c)return c;
  if(!/^data:image\/png;base64,/.test(url))return GRAY_SKIN;const e=getImg(url);if(!e||!e.ok)return null;
  c=mk(64,e.img.naturalHeight===32?32:64);c.getContext('2d').drawImage(e.img,0,0);skinCanvasCache.set(url,c);return c}
let FR=null;
function figRenderer(){if(FR!==null)return FR;if(!window.THREE)return null;
  try{const T=THREE,r=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});r.setPixelRatio(1);r.setSize(640,900,false);r.outputEncoding=T.sRGBEncoding;
    const sc=new T.Scene();sc.add(new T.HemisphereLight(0xffffff,0x5a6270,.8));const d=new T.DirectionalLight(0xffffff,.8);d.position.set(40,80,60);sc.add(d);const f=new T.DirectionalLight(0xb8c8ff,.25);f.position.set(-50,30,-40);sc.add(f);
    FR={r,sc,cam:new T.PerspectiveCamera(20,640/900,1,4000)}}catch{FR=false}return FR}
const figCache=new Map();
function figureCanvas(L){
  const fig=L.fig||{},skin=figSkin(fig);if(!skin)return null;const F=figRenderer();if(!F)return null;
  const key=JSON.stringify([fig.skin?fig.skin.length+':'+fig.skin.slice(-48):'grau',!!fig.slim,fig.item||'',fig.pose||{},fig.size||{},fig.ry||0,fig.rootY||0,packTick]);
  let c=figCache.get(key);if(c)return c;
  const T=THREE,m={id:'fig',slim:!!fig.slim,item:fig.item||'',pose:fig.pose||{},size:fig.size||{},rootY:fig.rootY||0,x:0,z:0,ry:fig.ry||0};
  const root=buildRig(m,skin);m.group=root;F.sc.add(root);applyPose(m);root.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(root),ctr=box.getCenter(new T.Vector3()),sz=box.getSize(new T.Vector3());
  const rad=Math.max(sz.x,sz.y,sz.z)*.62+2,dist=rad/Math.tan(T.MathUtils.degToRad(F.cam.fov/2))*1.05,dir=new T.Vector3(-.55,.3,.78).normalize();
  F.cam.position.copy(ctr).addScaledVector(dir,dist);F.cam.lookAt(ctr);F.cam.near=dist/10;F.cam.far=dist*10;F.cam.updateProjectionMatrix();
  F.r.setClearColor(0x000000,0);F.r.render(F.sc,F.cam);c=trimCanvas(F.r.domElement);
  F.sc.remove(root);root.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material)[].concat(o.material).forEach(x=>{if(x.map)x.map.dispose();x.dispose()})});
  if(figCache.size>40)figCache.clear();figCache.set(key,c);return c}
function refitFigure(L){const c=figureCanvas(L);if(c)L.w=L.h*c.width/c.height}
function addFigure(name,skinCanvas,slim,data){
  if(data)skinCanvasCache.set(data,skinCanvas);
  const L=baseLayer('figure',{name:name||'Figur',fig:{skin:data||'',name:name||'',slim:!!slim,item:'',pose:JSON.parse(JSON.stringify(POSES.stehen[1])),rootY:0,ry:0}});
  L.h=ED.p.h*.78;const c=figureCanvas(L);L.w=L.h*(c?c.width/c.height:.5);L.x=ED.p.w*.7;L.y=ED.p.h*.55;pushLayer(L);
  try{const list=store.get('rk-igns',[]).filter(n=>n!==name);if(name)list.unshift(name);store.set('rk-igns',list.slice(0,8))}catch{}}
async function addFigureByName(name){name=String(name||'').trim();const{canvas,slim,data}=await fetchSkinByName(name);addFigure(name,canvas,slim,data);toast(`${name} hinzugefügt. Pose und Drehung stellst du rechts ein.`)}
document.addEventListener('change',e=>{if(!e.target||e.target.id!=='f-figskin')return;const f=e.target.files[0];e.target.value='';if(!f||!ED.p)return;
  blobToDataURL(f).then(loadSkinFile).then(c=>{const slim=c.height===64&&c.getContext('2d').getImageData(54,20,1,1).data[3]===0;addFigure((f.name||'Skin').replace(/\.png$/i,'').slice(0,30),c,slim,c.toDataURL('image/png'))}).catch(err=>toast(err&&err.message?err.message:'Der Skin konnte nicht gelesen werden.'))});

/* Kachel und Eingabe im Bereich „Mobs“ */
function skinTileCanvas(){const c=renderTight(buildChar(skinData(GRAY_SKIN),{pose:'stand',face:'left'}),10),o=mk(c.width+40,c.height+20),x=o.getContext('2d');x.drawImage(c,20,10);
  const r=Math.min(o.width,o.height)*.16,cx=o.width-r-6,cy=o.height-r-6;x.fillStyle='#e2e2e2';x.beginPath();x.arc(cx,cy,r,0,7);x.fill();x.strokeStyle='#1e1e1e';x.lineWidth=r*.22;x.beginPath();x.moveTo(cx-r*.5,cy);x.lineTo(cx+r*.5,cy);x.moveTo(cx,cy-r*.5);x.lineTo(cx,cy+r*.5);x.stroke();return o}
let skinTileImg=null;
function skinAddBlock(){
  const wrap=document.createElement('div');wrap.className='skinadd';
  const t=tileFrom(skinTileImg||(skinTileImg=skinTileCanvas()),'Minecraft-Skin hinzufügen',false,()=>{form.hidden=!form.hidden;if(!form.hidden)inp.focus()});
  t.title='Minecraft-Skin hinzufügen: Ingame-Namen eingeben, die Figur erscheint im Design und lässt sich frei posieren';t.classList.add('skin-tile');
  const form=document.createElement('form');form.className='ignform';form.hidden=true;
  form.innerHTML='<label class="sub" for="ign-in">Ingame-Name (Java-Edition)</label><div class="btnrow"><input id="ign-in" type="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="z. B. Notch"><button class="btn primary sm" type="submit">Hinzufügen</button></div><p class="sub ign-msg" role="status"></p><div class="btnrow ign-recent"></div><button class="btn ghost sm" type="button" data-file>Oder Skin-Datei (PNG) wählen</button>';
  const inp=form.querySelector('input'),msg=form.querySelector('.ign-msg'),sb=form.querySelector('[type=submit]');
  form.addEventListener('submit',async e=>{e.preventDefault();const n=inp.value.trim();if(!n)return;sb.disabled=true;msg.textContent='Skin wird geladen …';
    try{await addFigureByName(n);msg.textContent='';inp.value='';form.hidden=true}catch(err){msg.textContent=err.message||'Skin nicht gefunden.'}finally{sb.disabled=false}});
  form.querySelector('[data-file]').addEventListener('click',()=>$('#f-figskin').click());
  const rec=form.querySelector('.ign-recent');for(const n of store.get('rk-igns',[])){const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent=n;b.addEventListener('click',()=>{inp.value=n;form.requestSubmit()});rec.append(b)}
  wrap.append(t,form);return wrap}

/* Pose im Pose-Studio bearbeiten und zurück ins Design übernehmen */
let FIGEDIT=null;
function editFigureInStudio(L){
  saveNow();const f=L.fig||{},prev=ST.ready?stSnap():JSON.stringify(store.get('rk-studio',{})||{});
  FIGEDIT={pid:ED.p.id,lid:L.id,prev,skin:figSkin(f)||GRAY_SKIN,name:L.name||'Figur'};
  const state={models:[{name:L.name||'Figur',skin:'fig',slim:!!f.slim,item:f.item||'',pose:f.pose||{},size:f.size||{},rootY:f.rootY||0,ry:f.ry||0}],bg:ST.bg||'sky',skyTime:ST.skyTime||'day',ground:true,light:ST.light||1};
  if(ST.ready){applyStudioState(state);ST.hist=[stSnap()];updStUndo()}else store.set('rk-studio',state);
  location.hash='renders';figBar();setTimeout(()=>{if(R3){setCamera('left');buildSide3()}},60)}
function figBar(){let bar=$('#st-figbar');const opt=$('.st-opt');
  if(!FIGEDIT){if(bar)bar.remove();return}
  if(!bar){bar=document.createElement('div');bar.id='st-figbar';bar.className='figbar';opt.prepend(bar)}
  bar.innerHTML='<span class="sub"></span>';bar.firstChild.textContent=`Pose für „${FIGEDIT.name}“`;
  const ok=document.createElement('button');ok.type='button';ok.className='btn primary sm';ok.textContent='Ins Design übernehmen';ok.addEventListener('click',()=>finishFigEdit(true));
  const no=document.createElement('button');no.type='button';no.className='btn ghost sm';no.textContent='Abbrechen';no.addEventListener('click',()=>finishFigEdit(false));bar.append(ok,no)}
function finishFigEdit(apply){if(!FIGEDIT)return;const E=FIGEDIT,m=ST.models[0];
  if(apply&&m){if(!ED.p||ED.p.id!==E.pid){const d=PROJECTS.get(E.pid);if(d)openProject(d)}const L=ED.p&&ED.p.layers.find(l=>l.id===E.lid);
    if(L){L.fig.pose=JSON.parse(JSON.stringify(m.pose||{}));L.fig.size=cleanSize(m.size);L.fig.rootY=m.rootY||0;L.fig.ry=m.ry||0;L.fig.slim=!!m.slim;L.fig.item=m.item||'';refitFigure(L);select(L.id);commit();toast('Pose übernommen.')}}
  FIGEDIT=null;figBar();try{const o=JSON.parse(E.prev);applyStudioState(o);store.set('rk-studio',o);ST.hist=[stSnap()];updStUndo()}catch{}
  location.hash='editor'}
window.addEventListener('hashchange',()=>{if(FIGEDIT&&location.hash==='#renders')figBar()});
