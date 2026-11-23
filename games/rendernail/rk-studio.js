'use strict';
/* ================= Pose-Studio (Three.js) ================= */
const BONES=[['head','Kopf'],['body','Körper'],['armR','Rechter Oberarm'],['armRLow','Rechter Unterarm'],['armL','Linker Oberarm'],['armLLow','Linker Unterarm'],['legR','Rechter Oberschenkel'],['legRLow','Rechter Unterschenkel'],['legL','Linker Oberschenkel'],['legLLow','Linker Unterschenkel']];
const BONE_LABEL=Object.fromEntries(BONES);
const PAIR={armR:'armL',armL:'armR',armRLow:'armLLow',armLLow:'armRLow',legR:'legL',legL:'legR',legRLow:'legLLow',legLLow:'legRLow'};
const POSES={
  stehen:['Stehen',{armR:[0,0,-4],armL:[0,0,4]}],
  laufen:['Laufen',{armR:[-35,0,-4],armRLow:[-20,0,0],armL:[35,0,4],armLLow:[-10,0,0],legR:[28,0,0],legRLow:[22,0,0],legL:[-28,0,0],legLLow:[6,0,0]}],
  rennen:['Rennen',{body:[12,0,0],head:[-12,0,0],armR:[-70,0,-8],armRLow:[-60,0,0],armL:[60,0,8],armLLow:[-50,0,0],legR:[55,0,0],legRLow:[70,0,0],legL:[-60,0,0],legLLow:[20,0,0]}],
  winken:['Winken',{armL:[0,0,150],armLLow:[0,0,25],armR:[0,0,-4],head:[0,-10,4]}],
  jubeln:['Jubeln',{armL:[0,0,155],armR:[0,0,-155],armLLow:[0,0,12],armRLow:[0,0,-12],head:[-15,0,0]}],
  zeigen:['Zeigen',{armR:[-90,0,0],armL:[0,0,4],head:[0,-12,0]}],
  sitzen:['Sitzen',{legR:[-90,8,0],legL:[-90,-8,0],legRLow:[90,0,0],legLLow:[90,0,0],armR:[-25,0,-4],armL:[-25,0,4],armRLow:[-20,0,0],armLLow:[-20,0,0]},-6],
  kampf:['Kampf',{body:[0,-18,0],head:[0,14,0],armR:[-80,0,0],armRLow:[-30,0,0],armL:[-30,0,20],armLLow:[-60,0,0],legR:[-18,0,0],legL:[18,0,0],legRLow:[12,0,0]}],
  dab:['Dab',{head:[35,25,0],armL:[0,0,118],armR:[-60,0,-55],armRLow:[-110,0,0]}],
  zombie:['Zombie',{armR:[-90,0,0],armL:[-90,0,0],head:[6,0,6]}],
  denken:['Denken',{armR:[-60,0,15],armRLow:[-115,0,0],armL:[0,0,4],head:[14,-10,8]}],
  schock:['Schock',{armR:[-35,0,-60],armL:[-35,0,60],armRLow:[-95,0,0],armLLow:[-95,0,0],head:[-12,0,0],body:[-5,0,0]}]
};
const ST_ITEMS=[['','Nichts'],['sw_diamond','Diamantschwert'],['sw_iron','Eisenschwert'],['sw_gold','Goldschwert'],['sw_dark','Obsidianschwert'],['pk_diamond','Spitzhacke'],['axe','Axt'],['bow','Bogen'],['torch','Fackel'],['apple','Apfel'],['gapple','Goldapfel'],['diamond','Diamant'],['shield','Schild'],['potion_red','Heiltrank']];
const D2R=Math.PI/180;
const ST={skyTime:'day',open:{},ready:false,failed:false,models:[],cur:0,bone:null,sym:false,bg:'sky',bgColor:'#3a3a3a',ground:true,light:1,hist:[],fut:[],running:false,tcUsed:false};
let R3=null;
let USER_SKINS=store.get('rk-skins',[]);if(!Array.isArray(USER_SKINS))USER_SKINS=[];
const userSkinCanvas=[];
function loadUserSkins(){USER_SKINS.forEach((s,i)=>{if(userSkinCanvas[i]||!s||!/^data:image\/png;base64,/.test(s.data||''))return;loadSkinFile(s.data).then(c=>{userSkinCanvas[i]=c;ST.models.forEach(m=>{if(m.skin==='u'+i)buildModel(m)})}).catch(()=>{})})}
function skinCanvasFor(m){if(m.skin==='fig'&&typeof FIGEDIT!=='undefined'&&FIGEDIT&&FIGEDIT.skin)return FIGEDIT.skin;if(String(m.skin).startsWith('k:')&&PACK&&PACK.skins[m.skin.slice(2)])return PACK.skins[m.skin.slice(2)];if(String(m.skin).startsWith('u')){const c=userSkinCanvas[+m.skin.slice(1)];if(c)return c}const i=+String(m.skin).slice(1);return PRESET_SKINS[i]||PRESET_SKINS[0]}
function modelData(m){return{name:m.name,skin:m.skin,slim:!!m.slim,item:m.item||'',pose:m.pose||{},rootY:m.rootY||0,x:m.x||0,z:m.z||0,ry:m.ry||0}}
function stSnap(){return JSON.stringify({models:ST.models.map(modelData),skyTime:ST.skyTime,bg:ST.bg,bgColor:ST.bgColor,ground:ST.ground,light:ST.light})}
function stCommit(){const s=stSnap();if(ST.hist[ST.hist.length-1]===s)return;ST.hist.push(s);if(ST.hist.length>60)ST.hist.shift();ST.fut=[];store.set('rk-studio',JSON.parse(s));updStUndo()}
function updStUndo(){$('#st-undo').disabled=ST.hist.length<2;$('#st-redo').disabled=!ST.fut.length}
function stRestore(s){const o=JSON.parse(s);applyStudioState(o);store.set('rk-studio',o);updStUndo()}
function applyStudioState(o){
  ST.models.forEach(disposeModel);ST.models=[];
  (o.models&&o.models.length?o.models:[{name:'Spieler 1',skin:'p0',pose:POSES.stehen[1]}]).slice(0,4).forEach((d,i)=>{const m={id:'m'+uid(),name:d.name||('Spieler '+(i+1)),skin:typeof d.skin==='string'?d.skin:'p0',slim:!!d.slim,item:typeof d.item==='string'&&(d.item===''||ITEM16[d.item]||/^pi_[a-z0-9_]+$/.test(d.item))?d.item:'',pose:typeof d.pose==='object'&&d.pose?d.pose:{},rootY:+d.rootY||0,x:+d.x||0,z:+d.z||0,ry:+d.ry||0};ST.models.push(m);buildModel(m)});
  ST.bg=['sky','color','none'].includes(o.bg)?o.bg:'sky';ST.bgColor=typeof o.bgColor==='string'?o.bgColor:'#3a3a3a';ST.ground=o.ground!==false;ST.skyTime=['day','sunset','night'].includes(o.skyTime)?o.skyTime:'day';ST.light=+o.light||1;
  ST.cur=Math.min(ST.cur,ST.models.length-1);ST.bone=null;if(R3)R3.tc.detach();setBackground();buildModelsBar();buildSide3()}

/* ---------- Geometrie mit Skin-UV ---------- */
function boxGeo(b,TW,TH){
  const T=THREE,[w,h,d]=b.s,[u,v]=b.uv,[tw,th,td]=b.d,[r0,r1]=b.r,a=w/2,bb=h/2,c=d/2,rows=r1-r0;
  const F=[
    [[a,bb,c],[a,bb,-c],[a,-bb,c],[a,-bb,-c],[u+td+tw,v+td+r0,td,rows],[1,0,0]],
    [[-a,bb,-c],[-a,bb,c],[-a,-bb,-c],[-a,-bb,c],[u,v+td+r0,td,rows],[-1,0,0]],
    [[-a,bb,-c],[a,bb,-c],[-a,bb,c],[a,bb,c],[u+td,v,tw,td],[0,1,0]],
    [[-a,-bb,c],[a,-bb,c],[-a,-bb,-c],[a,-bb,-c],[u+td+tw,v,tw,td],[0,-1,0]],
    [[-a,bb,c],[a,bb,c],[-a,-bb,c],[a,-bb,c],[u+td,v+td+r0,tw,rows],[0,0,1]],
    [[a,bb,-c],[-a,bb,-c],[a,-bb,-c],[-a,-bb,-c],[u+2*td+tw,v+td+r0,tw,rows],[0,0,-1]]];
  const pos=[],uv=[],nor=[],idx=[];
  F.forEach(([tl,tr,bl,br,[x,y,rw,rh],n])=>{const base=pos.length/3;[tl,tr,bl,br].forEach(p=>{pos.push(...p);nor.push(...n)});
    const e=.0005,u0=x/TW+e,u1=(x+rw)/TW-e,v0=1-y/TH-e,v1=1-(y+rh)/TH+e;uv.push(u0,v0,u1,v0,u0,v1,u1,v1);idx.push(base,base+2,base+1,base+1,base+2,base+3)});
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('normal',new T.Float32BufferAttribute(nor,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(idx);return g}
function itemMesh(key){const g=ITEM16[key]||(String(key).startsWith('pi_')&&typeof packItemGrid==='function'?packItemGrid(key.slice(3)):null);if(!g)return null;const T=THREE,cells=[];
  const n=g.length,k=16/n;for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(g[y][x])cells.push([x,y,g[y][x]]);
  const inst=new T.InstancedMesh(new T.BoxGeometry(k,k,1.2),new T.MeshLambertMaterial({color:0xffffff}),cells.length),M=new T.Matrix4(),col=new T.Color();
  cells.forEach(([x,y,c],i)=>{M.makeTranslation((x-(n-1)/2)*k,((n-1)/2-y)*k,0);inst.setMatrixAt(i,M);col.set(c);col.convertSRGBToLinear();inst.setColorAt(i,col)});
  inst.castShadow=true;inst.scale.setScalar(.7);inst.position.set(5.5*.7,5.5*.7,0);const grp=new T.Group();grp.add(inst);grp.rotation.y=-Math.PI/2;return grp}
function disposeModel(m){if(!m.group)return;R3&&R3.scene.remove(m.group);m.group.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){[].concat(o.material).forEach(x=>{if(x.map)x.map.dispose();x.dispose()})}});m.group=null}
function buildModel(m){
  if(!R3)return;const keepTc=R3.tc.object&&m.group&&R3.tc.object.parent&&ST.models[ST.cur]===m;disposeModel(m);
  const root=buildRig(m,skinCanvasFor(m));
  m.group=root;R3.scene.add(root);applyPose(m);
  if(keepTc&&ST.bone&&m.bones[ST.bone])R3.tc.attach(m.bones[ST.bone])}
/* Figur mit Gelenken aus einem Skin bauen (auch für Figuren im Editor) */
function buildRig(m,skinSrc){const T=THREE;
  const skin=fixSkin(skinSrc),TW=skin.width,TH=skin.height,legacy=TH===32,aw=m.slim?3:4;
  const tex=new T.CanvasTexture(skin);tex.magFilter=T.NearestFilter;tex.minFilter=T.NearestFilter;tex.generateMipmaps=false;tex.encoding=T.sRGBEncoding;
  const mat=new T.MeshLambertMaterial({map:tex,alphaTest:.1}),matO=new T.MeshLambertMaterial({map:tex,transparent:true,alphaTest:.45,side:T.DoubleSide});
  const root=new T.Group();m.bones={};m.meshes=[];
  const part=(name,parent,pivot,boxes)=>{const g=new T.Group();g.position.set(...pivot);parent.add(g);m.bones[name]=g;
    for(const b of boxes){if(!b)continue;const mesh=new T.Mesh(boxGeo(b,TW,TH),b.ov?matO:mat);mesh.position.set(...b.off);mesh.castShadow=true;mesh.userData={model:m.id,bone:name};g.add(mesh);m.meshes.push(mesh)}return g};
  const body=part('body',root,[0,12,0],[{s:[8,12,4],off:[0,6,0],uv:[16,16],d:[8,12,4],r:[0,12]},!legacy&&{s:[8.5,12.5,4.5],off:[0,6,0],uv:[16,32],d:[8,12,4],r:[0,12],ov:1}]);
  part('head',body,[0,12,0],[{s:[8,8,8],off:[0,4,0],uv:[0,0],d:[8,8,8],r:[0,8]},{s:[9,9,9],off:[0,4,0],uv:[32,0],d:[8,8,8],r:[0,8],ov:1}]);
  const arm=(side,uv,ov)=>{const sx=side==='R'?-(4+aw/2):(4+aw/2);
    const up=part('arm'+side,body,[sx,10,0],[{s:[aw,6,4],off:[0,-1,0],uv,d:[aw,12,4],r:[0,6]},ov&&{s:[aw+.5,6.25,4.5],off:[0,-.9,0],uv:ov,d:[aw,12,4],r:[0,6],ov:1}]);
    return part('arm'+side+'Low',up,[0,-4,0],[{s:[aw,6,4],off:[0,-3,0],uv,d:[aw,12,4],r:[6,12]},ov&&{s:[aw+.5,6.25,4.5],off:[0,-3.1,0],uv:ov,d:[aw,12,4],r:[6,12],ov:1}])};
  const handR=arm('R',[40,16],legacy?null:[40,32]);arm('L',legacy?[40,16]:[32,48],legacy?null:[48,48]);
  const leg=(side,uv,ov)=>{const up=part('leg'+side,root,[side==='R'?-2:2,12,0],[{s:[4,6,4],off:[0,-3,0],uv,d:[4,12,4],r:[0,6]},ov&&{s:[4.5,6.25,4.5],off:[0,-2.9,0],uv:ov,d:[4,12,4],r:[0,6],ov:1}]);
    part('leg'+side+'Low',up,[0,-6,0],[{s:[4,6,4],off:[0,-3,0],uv,d:[4,12,4],r:[6,12]},ov&&{s:[4.5,6.25,4.5],off:[0,-3.1,0],uv:ov,d:[4,12,4],r:[6,12],ov:1}])};
  leg('R',[0,16],legacy?null:[0,32]);leg('L',legacy?[0,16]:[16,48],legacy?null:[0,48]);
  if(m.item){const im=itemMesh(m.item);if(im){const holder=new T.Group();holder.position.set(0,-5.5,.5);holder.add(im);handR.add(holder)}}
  return root}
function applyPose(m){if(!m.group)return;for(const[b]of BONES){const r=(m.pose&&m.pose[b])||[0,0,0];m.bones[b].rotation.set(r[0]*D2R,r[1]*D2R,r[2]*D2R)}
  m.group.position.set(m.x||0,m.rootY||0,m.z||0);m.group.rotation.y=(m.ry||0)*D2R}

/* ---------- Szene ---------- */
function initStudio(){
  if(ST.ready||ST.failed)return;
  const fail=t=>{ST.failed=true;const f=$('#st-fail');f.hidden=false;f.textContent=t};
  if(!window.THREE||!THREE.OrbitControls||!THREE.TransformControls){fail('Die 3D-Ansicht konnte nicht geladen werden. Prüf die Internetverbindung und lade die Seite neu.');return}
  const T=THREE,wrap=$('#st-wrap');let renderer;
  try{renderer=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true})}catch{fail('Dein Browser kann hier kein 3D (WebGL) darstellen.');return}
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));renderer.outputEncoding=T.sRGBEncoding;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;wrap.append(renderer.domElement);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(30,1,1,3000);
  const controls=new T.OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.12;controls.target.set(0,16,0);controls.minDistance=12;controls.maxDistance=420;
  const hemi=new T.HemisphereLight(0xffffff,0x5a6270,.75);scene.add(hemi);
  const dir=new T.DirectionalLight(0xffffff,.85);dir.position.set(40,80,50);dir.castShadow=true;dir.shadow.mapSize.set(2048,2048);
  Object.assign(dir.shadow.camera,{left:-70,right:70,top:70,bottom:-70,near:1,far:320});dir.shadow.bias=-.0006;scene.add(dir);scene.add(dir.target);
  const fillL=new T.DirectionalLight(0xb8c8ff,.28);fillL.position.set(-50,30,-40);scene.add(fillL);
  const ground=new T.Mesh(new T.PlaneGeometry(900,900),new T.ShadowMaterial({opacity:.3}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const tc=new T.TransformControls(camera,renderer.domElement);tc.setMode('rotate');tc.setSpace('local');tc.setSize(.75);
  tc.addEventListener('dragging-changed',e=>{controls.enabled=!e.value;if(e.value)ST.tcUsed=true;else stCommit()});
  tc.addEventListener('objectChange',()=>{readBone();syncBoneUI()});scene.add(tc);
  R3={renderer,scene,camera,controls,tc,hemi,dir,ground,wrap};
  let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];ST.tcUsed=false});
  renderer.domElement.addEventListener('pointerup',e=>{if(!down)return;const mv=Math.hypot(e.clientX-down[0],e.clientY-down[1]);down=null;if(mv>6||ST.tcUsed)return;pick(e)});
  new ResizeObserver(resize3).observe(wrap);
  ST.ready=true;loadUserSkins();
  applyStudioState(store.get('rk-studio',{})||{});ST.hist=[stSnap()];updStUndo();setCamera('left');resize3()}
let skyT=0;function resize3(){if(!R3)return;const w=R3.wrap.clientWidth,h=R3.wrap.clientHeight;if(!w||!h)return;R3.renderer.setSize(w,h,false);R3.camera.aspect=w/h;R3.camera.updateProjectionMatrix();if(ST.bg==='sky'){clearTimeout(skyT);skyT=setTimeout(setBackground,150)}}
function loop3(){if(view!=='studio'||!R3){ST.running=false;return}requestAnimationFrame(loop3);R3.controls.update();R3.renderer.render(R3.scene,R3.camera)}
function startStudio(){initStudio();if(R3&&!ST.running){ST.running=true;resize3();loop3()}}
let skyTex=null,skyKey='';
function setBackground(){if(!R3)return;const T=THREE;$('#st-stage').classList.toggle('transparent',ST.bg==='none');
  if(ST.bg==='sky'){const w=R3.wrap.clientWidth||1280,h=R3.wrap.clientHeight||720,W=1600,H=Math.max(200,Math.round(W*h/w)),key=[ST.skyTime,W,H,packTick].join('|');
    if(!skyTex||skyKey!==key){if(skyTex)skyTex.dispose();const c=mk(W,H);drawMcSky(c,ST.skyTime,7);skyTex=new T.CanvasTexture(c);skyTex.encoding=T.sRGBEncoding;skyKey=key}R3.scene.background=skyTex}
  else if(ST.bg==='color')R3.scene.background=new T.Color(ST.bgColor).convertSRGBToLinear();
  else R3.scene.background=null;
  R3.ground.visible=ST.ground;R3.hemi.intensity=.75*ST.light;R3.dir.intensity=.85*ST.light}
function center3(){const T=THREE,v=new T.Vector3();if(!ST.models.length)return v.set(0,16,0);ST.models.forEach(m=>{v.x+=m.x||0;v.z+=m.z||0});v.x/=ST.models.length;v.z/=ST.models.length;v.y=16;return v}
function setCamera(k){if(!R3)return;const c=center3(),spread=ST.models.length>1?Math.max(...ST.models.map(m=>Math.abs((m.x||0)-c.x)))*1.2:0;
  const P={front:[0,18,95+spread*1.6],left:[-58,32,76+spread*1.2],right:[58,32,76+spread*1.2],low:[26,3,70+spread*1.3],close:[22,30,38]}[k]||[-58,32,76];
  const t=k==='close'?[c.x,26,c.z]:k==='low'?[c.x,19,c.z]:[c.x,16,c.z];
  R3.camera.position.set(c.x+P[0],P[1],c.z+P[2]);R3.controls.target.set(...t);R3.controls.update()}
document.querySelectorAll('[data-cam]').forEach(b=>b.addEventListener('click',()=>setCamera(b.dataset.cam)));
function pick(e){const T=THREE,r=R3.renderer.domElement.getBoundingClientRect(),v=new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);
  const ray=new T.Raycaster();ray.setFromCamera(v,R3.camera);const hits=ray.intersectObjects(ST.models.flatMap(m=>m.meshes||[]),false);
  if(hits.length){const u=hits[0].object.userData,i=ST.models.findIndex(m=>m.id===u.model);if(i>=0){ST.cur=i;selectBone(u.bone);buildModelsBar();return}}
  selectBone(null)}
function curModel(){return ST.models[ST.cur]}
function selectBone(b){ST.bone=b;if(b)ST.open.bone=true;const m=curModel();if(b&&m&&m.bones[b])R3.tc.attach(m.bones[b]);else R3.tc.detach();buildSide3()}
function readBone(){const m=curModel(),b=ST.bone;if(!m||!b)return;const o=m.bones[b].rotation,r=[o.x/D2R,o.y/D2R,o.z/D2R].map(v=>Math.round(v*10)/10);m.pose={...m.pose,[b]:r};
  if(ST.sym&&PAIR[b]){m.pose[PAIR[b]]=[r[0],-r[1],-r[2]];const p=m.bones[PAIR[b]];p.rotation.set(r[0]*D2R,-r[1]*D2R,-r[2]*D2R)}}
function mirrorPose(m){const n={};for(const[b]of BONES){const r=(m.pose||{})[b]||[0,0,0],src=PAIR[b]?((m.pose||{})[PAIR[b]]||[0,0,0]):r;n[b]=[src[0],-src[1],-src[2]]}m.pose=n;applyPose(m)}

/* ---------- Bedienung ---------- */
function buildModelsBar(){const bar=$('#st-models');bar.innerHTML='';
  ST.models.forEach((m,i)=>{const b=document.createElement('button');b.type='button';b.className='btn ghost sm tool';b.textContent=m.name;b.setAttribute('aria-pressed',i===ST.cur);b.addEventListener('click',()=>{ST.cur=i;selectBone(null);buildModelsBar()});bar.append(b)});
  if(ST.models.length<4){const a=document.createElement('button');a.type='button';a.className='btn ghost sm';a.textContent='+ Figur';a.addEventListener('click',addModel);bar.append(a)}}
function addModel(){const n=ST.models.length;const m={id:'m'+uid(),name:'Spieler '+(n+1),skin:'p'+(n%4),slim:false,item:'',pose:{...POSES.stehen[1]},rootY:0,x:n%2?18*Math.ceil(n/2):-18*Math.ceil(n/2),z:0,ry:0};
  ST.models.push(m);buildModel(m);ST.cur=ST.models.length-1;selectBone(null);buildModelsBar();stCommit();setCamera('front')}
function removeModel(){if(ST.models.length<2)return;const m=curModel();R3.tc.detach();disposeModel(m);ST.models.splice(ST.cur,1);ST.cur=0;ST.bone=null;buildModelsBar();buildSide3();stCommit()}
let boneUI=null;
function syncBoneUI(){if(boneUI)boneUI()}
function buildSide3(){
  const s=$('#st-side');if(!s)return;s.innerHTML='';boneUI=null;const m=curModel();if(!m)return;
  const sec=(t,key,open)=>{const d=document.createElement('details');d.className='stsec';d.open=ST.open[key]??open;d.addEventListener('toggle',()=>{ST.open[key]=d.open});const sm=document.createElement('summary');sm.textContent=t;const body=document.createElement('div');body.className='stack';d.append(sm,body);s.append(d);return body};
  // Posen
  const ps=sec('Posen · '+m.name,'pose',true);const pg=document.createElement('div');pg.className='posegrid';ps.append(pg);
  for(const[k,[n,p,ry]]of Object.entries(POSES)){const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=n;b.addEventListener('click',()=>{m.pose=JSON.parse(JSON.stringify(p));m.rootY=ry||0;applyPose(m);stCommit();syncBoneUI()});pg.append(b)}
  const saved=store.get('rk-poses',[]);
  if(Array.isArray(saved)&&saved.length){const sv=document.createElement('div');sv.className='saved';
    saved.forEach((sp,i)=>{const r=document.createElement('div');const a=document.createElement('button');a.type='button';a.className='btn sm';a.textContent=sp.name;a.addEventListener('click',()=>{m.pose=JSON.parse(JSON.stringify(sp.pose||{}));m.rootY=+sp.rootY||0;applyPose(m);stCommit();syncBoneUI()});
      const x=document.createElement('button');x.type='button';x.className='btn sm danger';x.textContent='×';x.setAttribute('aria-label',`Pose ${sp.name} löschen`);x.addEventListener('click',()=>{saved.splice(i,1);store.set('rk-poses',saved);buildSide3()});r.append(a,x);sv.append(r)});ps.append(sv)}
  const sr=document.createElement('div');sr.className='btnrow';const si=document.createElement('input');si.type='text';si.maxLength=30;si.placeholder='Name der Pose';si.setAttribute('aria-label','Name der Pose');si.style.cssText='flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:6px 9px';
  const sb=document.createElement('button');sb.type='button';sb.className='btn sm';sb.textContent='Pose speichern';sb.addEventListener('click',()=>{const nm=si.value.trim()||('Pose '+(saved.length+1));saved.push({name:nm.slice(0,30),pose:m.pose,rootY:m.rootY||0});store.set('rk-poses',saved.slice(-24));toast(`Pose „${nm}“ gespeichert.`);buildSide3()});sr.append(si,sb);ps.append(sr);
  // Körperteile
  const bs=sec('Körperteil','bone',!!ST.bone);const line=document.createElement('div');line.className='boneline';bs.append(line);
  const NS='http://www.w3.org/2000/svg',svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 46 76');svg.setAttribute('class','bonemap');svg.setAttribute('role','group');svg.setAttribute('aria-label','Körperteil wählen');
  const R={head:[15,1,16,16],body:[15,18,16,22],armR:[6,18,8,10.5],armRLow:[6,29.5,8,10.5],armL:[32,18,8,10.5],armLLow:[32,29.5,8,10.5],legR:[15,41,7.5,16.5],legRLow:[15,58.5,7.5,16.5],legL:[23.5,41,7.5,16.5],legLLow:[23.5,58.5,7.5,16.5]};
  for(const[b,[x,y,w,h]]of Object.entries(R)){const r=document.createElementNS(NS,'rect');Object.entries({x,y,width:w,height:h,rx:1.2}).forEach(([k,v])=>r.setAttribute(k,v));r.setAttribute('tabindex','0');r.setAttribute('role','button');r.setAttribute('aria-label',BONE_LABEL[b]);if(b===ST.bone)r.setAttribute('class','on');
    const t=document.createElementNS(NS,'title');t.textContent=BONE_LABEL[b];r.append(t);r.addEventListener('click',()=>selectBone(b));r.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectBone(b)}});svg.append(r)}
  line.append(svg);const ctl=document.createElement('div');ctl.className='stack';ctl.style.gap='10px';line.append(ctl);
  if(!ST.bone){const p=document.createElement('p');p.className='sub';p.textContent='Tippe auf ein Körperteil der Figur oder hier im Schema. Dann drehst du es mit dem Ring in der 3D-Ansicht oder mit den Reglern.';ctl.append(p)}
  else{const h=document.createElement('b');h.textContent=BONE_LABEL[ST.bone];ctl.append(h);const sliders=[];
    ['X','Y','Z'].forEach((ax,i)=>{const w=document.createElement('div');w.className='field';const id='br'+ax;w.innerHTML=`<div class="lab"><label for="${id}">Drehung ${ax}</label><output></output></div><input type="range" id="${id}" min="-180" max="180" step="1">`;
      const inp=w.querySelector('input'),out=w.querySelector('output');inp.addEventListener('input',()=>{const r=[...((m.pose||{})[ST.bone]||[0,0,0])];r[i]=+inp.value;m.pose={...m.pose,[ST.bone]:r};if(ST.sym&&PAIR[ST.bone])m.pose[PAIR[ST.bone]]=[r[0],-r[1],-r[2]];applyPose(m);out.textContent=inp.value+'°'});
      inp.addEventListener('change',stCommit);sliders.push([inp,out,i]);ctl.append(w)});
    boneUI=()=>{const r=(curModel().pose||{})[ST.bone]||[0,0,0];sliders.forEach(([inp,out,i])=>{inp.value=Math.round(r[i]);out.textContent=Math.round(r[i])+'°'})};boneUI();
    const br=document.createElement('div');br.className='btnrow';const rb=document.createElement('button');rb.type='button';rb.className='btn sm';rb.textContent='Teil zurücksetzen';rb.addEventListener('click',()=>{const p={...m.pose};delete p[ST.bone];if(ST.sym&&PAIR[ST.bone])delete p[PAIR[ST.bone]];m.pose=p;applyPose(m);stCommit();syncBoneUI()});br.append(rb);ctl.append(br)}
  const sy=document.createElement('label');sy.className='row check';sy.innerHTML='<input type="checkbox" id="st-sym"><span>Symmetrie (beide Seiten gleich)</span>';sy.querySelector('input').checked=ST.sym;sy.querySelector('input').addEventListener('change',e=>{ST.sym=e.target.checked});bs.append(sy);
  const mb=document.createElement('button');mb.type='button';mb.className='btn sm';mb.textContent='Pose spiegeln';mb.addEventListener('click',()=>{mirrorPose(m);stCommit();syncBoneUI()});bs.append(mb);
  // Figur
  const fs=sec('Figur & Skin','fig',true);
  const skinField=document.createElement('div');skinField.className='field';skinField.innerHTML='<div class="lab"><label for="st-skin">Skin</label></div><select id="st-skin"></select>';const ss=skinField.querySelector('select');
  if(m.skin==='fig'&&typeof FIGEDIT!=='undefined'&&FIGEDIT)ss.append(new Option('Aus dem Design: '+FIGEDIT.name,'fig'));PRESETS.forEach((p,i)=>ss.append(new Option('Beispiel: '+p.name,'p'+i)));if(PACK)Object.keys(PACK.skins).forEach(k=>ss.append(new Option('Paket: '+k.slice(2).replace(/_/g,' '),'k:'+k)));USER_SKINS.forEach((u,i)=>ss.append(new Option(u.name||('Eigener Skin '+(i+1)),'u'+i)));ss.value=m.skin;
  ss.addEventListener('change',()=>{m.skin=ss.value;if(ss.value.startsWith('k:'))m.slim=ss.value.startsWith('k:s:');buildModel(m);stCommit();buildSide3()});fs.append(skinField);
  const ub=document.createElement('button');ub.type='button';ub.className='btn sm';ub.textContent='Eigenen Skin hochladen (PNG)';ub.addEventListener('click',()=>$('#f-skin').click());fs.append(ub);
  if(window.RK_LOCAL){const ig=document.createElement('div');ig.className='btnrow';const ii=document.createElement('input');ii.type='text';ii.maxLength=16;ii.placeholder='Spielername (IGN)';ii.setAttribute('aria-label','Spielername');ii.autocomplete='off';ii.spellcheck=false;
    ii.style.cssText='flex:1;min-width:0;background:var(--panel2);border:1px solid var(--line2);border-radius:8px;padding:6px 9px';
    const ib=document.createElement('button');ib.type='button';ib.className='btn sm primary';ib.textContent='Skin laden';
    const go=async()=>{ib.disabled=true;ib.textContent='Lädt …';try{await skinFromIGN(ii.value.trim(),m)}catch(e){toast(e.message||'Skin nicht gefunden.')}finally{ib.disabled=false;ib.textContent='Skin laden'}};
    ib.addEventListener('click',go);ii.addEventListener('keydown',e=>{if(e.key==='Enter')go()});ig.append(ii,ib);fs.append(ig)}
  const note=document.createElement('p');note.className='sub';note.textContent=window.RK_LOCAL?'Spielername eintippen oder eine Skin-Datei (64×64 PNG) hochladen.':'Normaler Minecraft-Skin, 64×64 oder 64×32 Pixel. Laden per Spielername geht nur in der AGG-Games-Fassung.';fs.append(note);
  const seg=(label,opts,get,set)=>{const w=document.createElement('div');w.className='field';w.innerHTML='<div class="lab"><span></span></div><div class="seg" role="group"></div>';w.querySelector('span').textContent=label;const g=w.querySelector('.seg');g.setAttribute('aria-label',label);
    for(const[v,l]of opts){const b=document.createElement('button');b.type='button';b.textContent=l;b.setAttribute('aria-pressed',String(get())===String(v));b.addEventListener('click',()=>{set(v);g.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b))});g.append(b)}return w};
  fs.append(seg('Arme',[['0','Klassisch (4 px)'],['1','Schmal (3 px)']],()=>m.slim?'1':'0',v=>{m.slim=v==='1';buildModel(m);stCommit()}));
  const itf=document.createElement('div');itf.className='field';itf.innerHTML='<div class="lab"><label for="st-item">In der rechten Hand</label></div><select id="st-item"></select>';const is=itf.querySelector('select');ST_ITEMS.forEach(([k,n])=>is.append(new Option(n,k)));if(PACK){const og=document.createElement('optgroup');og.label='Aus '+PACK.name;Object.keys(PACK.imgs).filter(k=>k.startsWith('i/')).sort().forEach(k=>og.append(new Option(prettyName(k.slice(2)),'pi_'+k.slice(2))));is.append(og)}is.value=m.item||'';is.addEventListener('change',()=>{m.item=is.value;buildModel(m);stCommit()});fs.append(itf);
  const rng=(label,get,set,min,max,unit)=>{const w=document.createElement('div');w.className='field';const id='st-'+uid();w.innerHTML=`<div class="lab"><label for="${id}"></label><output></output></div><input type="range" id="${id}" min="${min}" max="${max}" step="1">`;w.querySelector('label').textContent=label;
    const i=w.querySelector('input'),o=w.querySelector('output');i.value=get();o.textContent=get()+unit;i.addEventListener('input',()=>{set(+i.value);o.textContent=i.value+unit});i.addEventListener('change',stCommit);return w};
  fs.append(rng('Position links/rechts',()=>m.x||0,v=>{m.x=v;applyPose(m)},-70,70,''));
  fs.append(rng('Position vorne/hinten',()=>m.z||0,v=>{m.z=v;applyPose(m)},-70,70,''));
  fs.append(rng('Drehung',()=>m.ry||0,v=>{m.ry=v;applyPose(m)},-180,180,'°'));
  fs.append(rng('Höhe',()=>m.rootY||0,v=>{m.rootY=v;applyPose(m)},-20,40,''));
  if(ST.models.length>1){const rm=document.createElement('button');rm.type='button';rm.className='btn sm danger';rm.textContent=m.name+' entfernen';rm.addEventListener('click',removeModel);fs.append(rm)}
  // Szene
  const sc=sec('Szene & Licht','scene',false);
  sc.append(seg('Hintergrund',[['sky','Minecraft-Himmel'],['color','Farbe'],['none','Transparent']],()=>ST.bg,v=>{ST.bg=v;setBackground();stCommit();buildSide3()}));
  if(ST.bg==='sky')sc.append(seg('Tageszeit',[['day','Tag'],['sunset','Abend'],['night','Nacht']],()=>ST.skyTime,v=>{ST.skyTime=v;setBackground();stCommit()}));
  if(ST.bg==='color'){const r=document.createElement('label');r.className='row';r.innerHTML='<span>Farbe</span><input type="color" id="st-bgc">';const ci=r.querySelector('input');ci.value=ST.bgColor;ci.addEventListener('input',()=>{ST.bgColor=ci.value;setBackground()});ci.addEventListener('change',stCommit);sc.append(r)}
  const gr=document.createElement('label');gr.className='row check';gr.innerHTML='<input type="checkbox" id="st-ground"><span>Schatten am Boden</span>';gr.querySelector('input').checked=ST.ground;gr.querySelector('input').addEventListener('change',e=>{ST.ground=e.target.checked;setBackground();stCommit()});sc.append(gr);
  const lt=rng('Licht',()=>Math.round(ST.light*100),v=>{ST.light=v/100;setBackground()},30,170,' %');sc.append(lt);
  const hint=document.createElement('p');hint.className='sub';hint.textContent=ST.bg==='none'?'Transparent: Der Render wird freigestellt und lässt sich direkt ins Thumbnail setzen.':'Tipp: Mit „Transparent“ bekommst du eine freigestellte Figur fürs Thumbnail.';sc.append(hint);
  const help=document.createElement('p');help.className='sub st-help';help.textContent='Ziehen dreht die Kamera. Zwei Finger oder Mausrad zoomen. Rechte Maustaste oder zwei Finger verschieben.';s.append(help)}
$('#f-skin').addEventListener('change',e=>{const f=e.target.files[0];e.target.value='';if(!f)return;
  blobToDataURL(f).then(loadSkinFile).then(c=>{const data=c.toDataURL('image/png');USER_SKINS.push({name:(f.name||'Eigener Skin').replace(/\.png$/i,'').slice(0,30),data});if(USER_SKINS.length>12){USER_SKINS.shift();userSkinCanvas.shift()}
    store.set('rk-skins',USER_SKINS);const i=USER_SKINS.length-1;userSkinCanvas[i]=c;const m=curModel();if(m){m.skin='u'+i;buildModel(m);stCommit()}buildSide3();toast('Skin geladen.')}).catch(err=>toast(err&&err.message?err.message:'Der Skin konnte nicht gelesen werden.'))});
$('#st-undo').addEventListener('click',()=>{if(ST.hist.length<2)return;ST.fut.push(ST.hist.pop());stRestore(ST.hist[ST.hist.length-1])});
$('#st-redo').addEventListener('click',()=>{if(!ST.fut.length)return;const s=ST.fut.pop();ST.hist.push(s);stRestore(s)});
$('#st-reset').addEventListener('click',()=>{ST.models.forEach(m=>{m.pose={...POSES.stehen[1]};m.rootY=0;applyPose(m)});selectBone(null);stCommit()});

/* ---------- Rendern ---------- */
function trimCanvas(src){const w=src.width,h=src.height,c=mk(w,h),x=c.getContext('2d');x.drawImage(src,0,0);const d=x.getImageData(0,0,w,h).data;let a=w,b=h,X=-1,Y=-1;
  for(let y=0;y<h;y++)for(let i=0;i<w;i++)if(d[(y*w+i)*4+3]>8){if(i<a)a=i;if(i>X)X=i;if(y<b)b=y;if(y>Y)Y=y}
  if(X<0)return c;const p=Math.round(Math.max(X-a,Y-b)*.03);a=Math.max(0,a-p);b=Math.max(0,b-p);X=Math.min(w-1,X+p);Y=Math.min(h-1,Y+p);
  const o=mk(X-a+1,Y-b+1);o.getContext('2d').drawImage(c,a,b,o.width,o.height,0,0,o.width,o.height);return o}
$('#st-render').addEventListener('click',async()=>{
  if(!ST.ready){toast('Die 3D-Ansicht ist nicht bereit.');return}
  const{renderer,scene,camera,tc}=R3,att=tc.object;tc.detach();tc.visible=false;
  const pr=renderer.getPixelRatio(),w=R3.wrap.clientWidth,h=R3.wrap.clientHeight;renderer.setPixelRatio(Math.min(4,Math.max(pr,2200/Math.max(w,h))));renderer.setSize(w,h,false);
  renderer.render(scene,camera);const raw=renderer.domElement;const out=ST.bg==='none'?trimCanvas(raw):(()=>{const c=mk(raw.width,raw.height);c.getContext('2d').drawImage(raw,0,0);return c})();
  renderer.setPixelRatio(pr);resize3();tc.visible=true;if(att)tc.attach(att);
  let blob;try{blob=await canvasBlob(out)}catch{toast('Rendern hat nicht geklappt.');return}
  const url=URL.createObjectURL(blob);let stored=null;const keep=async()=>{if(!stored)stored=await storeImage(blob,'Render','render',out.width,out.height);return stored};
  openDialog({src:url,title:'Dein Render',when:`${out.width} × ${out.height} px`,license:false,spec:[],
    hint:DL?'':'Zum Speichern lange auf das Bild drücken oder Rechtsklick und „Bild speichern unter…“.',
    actions:[
      DL&&{label:'PNG herunterladen',primary:true,icon:ICON.dl,run:async()=>{await saveFile('render-'+new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')+'.png',blob)}},
      {label:'Ins Thumbnail einfügen',primary:!DL,run:async()=>{const src=await keep();dlg.close();insertImageIntoDesign(src,out.width,out.height,'Render',{fitH:.85,x:.72})},fail:()=>'Einfügen hat nicht geklappt.'},
      ASSETS&&{label:'In Uploads speichern',run:async()=>{await keep();return'Gespeichert. Du findest den Render im Editor unter Uploads und in der Galerie unter „Meine Renders“.'},fail:e=>e&&e.code==='quota_or_state'?'Der Speicher ist voll.':'Speichern hat nicht geklappt.'}]})});

packWatchers.push(()=>{if(ST.ready){ST.models.forEach(buildModel);buildSide3();setBackground()}});

/* Skin über den Spielernamen (Java-Edition). Mojangs eigene Schnittstellen erlauben Webseiten keinen
   Zugriff, darum über mc-heads.net, ersatzweise minotar.net; beide liefern den aktuellen Skin. */
function loadCORSImage(u){return new Promise((ok,no)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=()=>no(new Error('img'));i.src=u})}
async function fetchSkinByName(name){
  if(!/^[A-Za-z0-9_]{3,16}$/.test(name))throw new Error('Spielernamen haben 3 bis 16 Zeichen: Buchstaben, Zahlen und _.');
  let im=null;for(const u of[`https://mc-heads.net/skin/${encodeURIComponent(name)}`,`https://minotar.net/skin/${encodeURIComponent(name)}`]){try{im=await loadCORSImage(u);break}catch{}}
  if(!im)throw new Error(window.RK_LOCAL?'Den Skin konnte ich nicht laden. Bist du online?':'Skins per Name gehen nur in der AGG-Games-Fassung. Wähle stattdessen eine Skin-Datei.');
  const w=im.naturalWidth,h=im.naturalHeight;if(w!==64||(h!==64&&h!==32))throw new Error('Der Skin hat ein unbekanntes Format.');
  const c=mk(64,h);c.getContext('2d').drawImage(im,0,0);
  const slim=h===64&&c.getContext('2d').getImageData(54,20,1,1).data[3]===0;
  return{canvas:c,slim,data:c.toDataURL('image/png')}}
async function skinFromIGN(name,m){
  const{canvas:c,slim,data}=await fetchSkinByName(name);let i=USER_SKINS.findIndex(s=>s.name===name);
  if(i<0){USER_SKINS.push({name,data});if(USER_SKINS.length>12){USER_SKINS.shift();userSkinCanvas.shift()}i=USER_SKINS.length-1}else USER_SKINS[i].data=data;
  store.set('rk-skins',USER_SKINS);userSkinCanvas[i]=c;
  if(m){m.skin='u'+i;m.slim=slim;m.name=name;buildModel(m);stCommit();buildModelsBar()}buildSide3();toast(`Skin von ${name} geladen.`)}
