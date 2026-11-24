'use strict';
/* ================= Texturpaket des Nutzers =================
   Liest ein Texturpaket (.zip) oder die eigene Minecraft-.jar im Browser.
   Nichts davon wird hochgeladen; gespeichert wird nur in diesem Browser. */
const PACK_BLOCKS={
  grass:{top:['grass_block_top|grass_top','#91bd59'],side:['grass_block_side|grass_side',null,'grass_block_side_overlay|grass_side_overlay','#91bd59'],bottom:['dirt']},
  dirt:{all:['dirt']},stone:{all:['stone']},cobble:{all:['cobblestone']},planks:{all:['oak_planks|planks_oak']},
  log:{top:['oak_log_top|log_oak_top'],side:['oak_log|log_oak']},leaves:{all:['oak_leaves|leaves_oak','#77ab2f']},
  glass:{all:['glass'],alpha:1},sand:{all:['sand']},brick:{all:['bricks|brick']},snow:{all:['snow']},ice:{all:['ice'],alpha:1},
  obsidian:{all:['obsidian']},netherrack:{all:['netherrack']},lava:{all:['lava_still'],bright:1},water:{all:['water_still','#3f76e4'],alpha:1},
  diamondblock:{all:['diamond_block']},goldblock:{all:['gold_block']},diamondore:{all:['diamond_ore']},goldore:{all:['gold_ore']}};
const PACK_ITEMS={sw_diamond:'diamond_sword',sw_iron:'iron_sword',sw_gold:'golden_sword|gold_sword',sw_dark:'netherite_sword|stone_sword',sw_wood:'wooden_sword|wood_sword',
  pk_diamond:'diamond_pickaxe',pk_iron:'iron_pickaxe',axe:'iron_axe',bow:'bow|bow_standby',apple:'apple',gapple:'golden_apple|apple_golden',diamond:'diamond',emerald:'emerald',
  ingot:'gold_ingot',torch:'@torch|torch_on',star:'nether_star',cookie:'cookie',pearl:'ender_pearl',bucket:'water_bucket|bucket_water',xp:'experience_bottle'};
let PACK=null;const ORIG_ITEM16={...ITEM16};const packWatchers=[];
/* ZIP lesen (eine .jar ist eine ZIP-Datei) */
async function rkZip(blob){
  const n=blob.size,tail=Math.min(n,65557),end=new DataView(await blob.slice(n-tail).arrayBuffer());let p=-1;
  for(let i=tail-22;i>=0;i--)if(end.getUint32(i,true)===0x06054b50){p=i;break}
  if(p<0)throw new Error('Die Datei ist kein ZIP- oder JAR-Archiv.');
  const count=end.getUint16(p+10,true),cdLen=end.getUint32(p+12,true),cdStart=end.getUint32(p+16,true);
  const cd=new DataView(await blob.slice(cdStart,cdStart+cdLen).arrayBuffer()),td=new TextDecoder(),list=new Map();let q=0;
  for(let i=0;i<count&&q+46<=cd.byteLength;i++){if(cd.getUint32(q,true)!==0x02014b50)break;
    const nl=cd.getUint16(q+28,true),xl=cd.getUint16(q+30,true),kl=cd.getUint16(q+32,true);
    list.set(td.decode(new Uint8Array(cd.buffer,cd.byteOffset+q+46,nl)),{m:cd.getUint16(q+10,true),len:cd.getUint32(q+20,true),at:cd.getUint32(q+42,true)});q+=46+nl+xl+kl}
  return{names:()=>[...list.keys()],has:k=>list.has(k),async read(k){const e=list.get(k);if(!e)return null;
    const h=new DataView(await blob.slice(e.at,e.at+30).arrayBuffer());if(h.getUint32(0,true)!==0x04034b50)throw new Error('Die Datei ist beschädigt.');
    const st=e.at+30+h.getUint16(26,true)+h.getUint16(28,true),raw=blob.slice(st,st+e.len);
    if(e.m===0)return raw.arrayBuffer();if(e.m===8)return new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();return null}}}
const pngURL=ab=>blobToDataURL(new Blob([ab],{type:'image/png'})).then(u=>u.replace(/^data:[^;,]*/,'data:image/png'));
/* Alle Block- und Gegenstand-Texturen aus einer Quelle sammeln (Pfade relativ zu assets/minecraft/textures/) */
async function collectPack(src,name,status=()=>{}){
  const out={v:2,name:String(name||'Texturpaket').slice(0,60),files:{},skins:{}};
  const env=/^environment\/(?:celestial\/)?(sun|clouds|moon_phases|moon\/full_moon)\.png$/,re=/^(block|blocks|item|items)\/([a-z0-9_]+)\.png$/,sk=/^entity\/(?:player\/(wide|slim)\/)?([a-z0-9_]+)\.png$/;
  const list=src.names();let n=0;const todo=list.filter(p=>re.test(p)||sk.test(p)||env.test(p));
  for(const p of todo){const ab=await src.read(p).catch(()=>null);if(++n%60===0)status(`Texturen werden entpackt … ${n} von ${todo.length}`,n/todo.length);if(!ab)continue;const blob=new Blob([ab],{type:'image/png'});
    let m=p.match(env);if(m){out.files['e/'+(m[1]==='moon/full_moon'?'moon':m[1])]=blob;continue}
    m=p.match(re);if(m){out.files[(m[1][0]==='b'?'b/':'i/')+m[2]]=blob;continue}
    m=p.match(sk);if(m&&(m[1]||['steve','alex'].includes(m[2]))&&Object.keys(out.skins).length<24)out.skins[(m[1]==='slim'||m[2]==='alex'?'s:':'w:')+m[2]]=blob}
  if(!Object.keys(out.files).length&&!Object.keys(out.skins).length)throw new Error('In der Datei wurden keine Minecraft-Texturen gefunden.');
  return out}
async function readPack(file,name,status){
  if(typeof DecompressionStream==='undefined')throw new Error('Dieser Browser ist zu alt zum Entpacken. Ein aktueller Chrome, Firefox oder Safari kann es.');
  const z=await rkZip(file),pre='assets/minecraft/textures/';
  return collectPack({names:()=>z.names().filter(k=>k.startsWith(pre)).map(k=>k.slice(pre.length)),has:p=>z.has(pre+p),read:p=>z.read(pre+p)},name||file.name,status)}
/* Wie in Pocketcraft: die client.jar der neuesten Vollversion direkt von Mojang */
async function packFromMojang(status){
  const j=async u=>{let r;try{r=await fetch(u,{cache:'no-cache'})}catch{throw new Error('Mojangs Server sind nicht erreichbar. Bist du online?')}if(!r.ok)throw new Error('Mojangs Server antwortet nicht ('+r.status+').');return r.json()};
  status('Mojang wird gefragt …',0);
  const m=await j('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'),id=m.latest.release,v=m.versions.find(x=>x.id===id),info=await j(v.url),c=info.downloads.client;
  let r;try{r=await fetch(c.url)}catch{throw new Error('Der Download von Mojang ist fehlgeschlagen.')}
  if(!r.ok||!r.body)throw new Error('Der Download von Mojang ist fehlgeschlagen ('+r.status+').');
  const total=+r.headers.get('content-length')||c.size||0,parts=[],rd=r.body.getReader();let got=0;
  for(;;){const{done,value}=await rd.read();if(done)break;parts.push(value);got+=value.length;status(`Minecraft ${id} wird geladen: ${Math.round(got/1048576)} von ${Math.round(total/1048576)} MB`,total?got/total:0)}
  status('Texturen werden entpackt …',1);
  return readPack(new Blob(parts),`Minecraft ${id} (von Mojang)`,status)}
/* Texturen, die Pocketcraft auf derselben Seite schon geladen hat */
async function pocketcraftTextures(){
  if(!window.indexedDB||!indexedDB.databases)return null;
  const dbs=await indexedDB.databases().catch(()=>[]);if(!dbs.some(d=>d.name==='pocketcraft-minecraft'))return null;
  const db=await new Promise((ok,no)=>{const r=indexedDB.open('pocketcraft-minecraft');r.onupgradeneeded=()=>{r.transaction.abort()};r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)}).catch(()=>null);
  if(!db)return null;
  try{if(!db.objectStoreNames.contains('paket'))return null;
    const t=await new Promise((ok,no)=>{const q=db.transaction('paket','readonly').objectStore('paket').get('texturen');q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)});
    return t&&t.bilder&&Object.keys(t.bilder).length?t:null}catch{return null}finally{db.close()}}
async function packFromPocketcraft(){const t=await pocketcraftTextures();if(!t)throw new Error('In Pocketcraft sind noch keine Minecraft-Texturen geladen.');
  const b=t.bilder,keys=Object.keys(b).map(k=>k.replace(/\.png$/,''));
  return collectPack({names:()=>Object.keys(b),has:p=>p in b,read:async p=>{const v=b[p];return v instanceof Blob?v.arrayBuffer():v}},`Minecraft ${t.version||''} (aus Pocketcraft)`.replace('  ',' '))}
function resolveB(alts){for(const n of String(alts).split('|')){const im=PACK.imgs['b/'+n];if(im)return im}return null}
const frameCanvas=c=>c;
function tintCanvas(c,hex){const o=mk(c.width,c.height),x=o.getContext('2d');x.drawImage(c,0,0);x.globalCompositeOperation='multiply';x.fillStyle=hex;x.fillRect(0,0,o.width,o.height);x.globalCompositeOperation='destination-in';x.drawImage(c,0,0);return o}
function packFace(spec){const im=resolveB(spec[0]);if(!im)return null;let c=im;if(spec[1])c=tintCanvas(c,spec[1]);
  if(spec[2]){const o=resolveB(spec[2]);if(o){const oc=tintCanvas(o,spec[3]||'#91bd59'),cc=mk(c.width,c.height),x=cc.getContext('2d');x.drawImage(c,0,0);x.drawImage(oc,0,0,c.width,c.height);c=cc}}return c}
function packBlockTex(k){if(!PACK)return null;const d=PACK_BLOCKS[k];if(!d)return null;const t={};
  if(d.all){const f=packFace(d.all);if(!f)return null;t.top=t.side=f}else{t.top=packFace(d.top);t.side=packFace(d.side);if(!t.top||!t.side)return null;if(d.bottom)t.bottom=packFace(d.bottom)}
  if(d.alpha)t.alpha=true;if(d.bright)t.bright=true;return t}
/* Alle Blöcke aus dem Paket: Name → Seiten nach Minecraft-Namensregeln (_top, _side, _bottom, _front, _end) */
const PK_TINT={grass_block_top:'#91bd59',oak_leaves:'#77ab2f',jungle_leaves:'#77ab2f',acacia_leaves:'#77ab2f',dark_oak_leaves:'#77ab2f',mangrove_leaves:'#77ab2f',birch_leaves:'#80a755',spruce_leaves:'#619961',vine:'#77ab2f',water_still:'#3f76e4',water_flow:'#3f76e4',short_grass:'#91bd59',grass:'#91bd59',fern:'#91bd59',large_fern_top:'#91bd59',large_fern_bottom:'#91bd59',tall_grass_top:'#91bd59',tall_grass_bottom:'#91bd59',sugar_cane:'#91bd59',lily_pad:'#208030',leaves_oak:'#77ab2f',grass_top:'#91bd59'};
const PK_BOTTOM={grass_block:'dirt',podzol:'dirt',mycelium:'dirt',dirt_path:'dirt',farmland:'dirt',grass_path:'dirt'};
const PK_SKIP=/(^destroy_stage_\d|_overlay$|^debug|^structure_void$|^barrier$|_particle$|_bed_(head|foot)_|^bed_down$|^bed_head_north$)/;
/* Betten: Neuere Minecraft-Versionen liefern ein Bett als Einzelflächen (Kopf/Fuß, oben, Seiten, Ende).
   Daraus entsteht hier ein echtes 3D-Bett nach Minecrafts eigenem Bettmodell (Kopf im Norden, Fuß im Süden). */
const BED_ELS={foot:[[[0,3,0],[16,9,16],{down:[[0,0,16,16],'down'],up:[[0,0,16,16],'up'],south:[[0,7,16,13],'south'],west:[[0,7,16,13],'west'],east:[[0,7,16,13],'east']}],
    [[0,0,13],[3,3,16],{down:[[7,13,10,16],'west'],north:[[10,13,13,16],'west'],south:[[0,13,3,16],'south'],west:[[13,13,16,16],'west'],east:[[3,13,6,16],'south']}],
    [[13,0,13],[16,3,16],{down:[[6,13,9,16],'east'],north:[[3,13,6,16],'east'],south:[[13,13,16,16],'south'],west:[[10,13,13,16],'south'],east:[[0,13,3,16],'east']}]],
  head:[[[0,3,0],[16,9,16],{down:[[0,0,16,16],'down'],up:[[0,0,16,16],'up'],north:[[0,7,16,13],'north'],west:[[0,7,16,13],'west'],east:[[0,7,16,13],'east']}],
    [[0,0,0],[3,3,3],{down:[[6,13,9,16],'west'],north:[[13,13,16,16],'north'],south:[[3,13,6,16],'west'],west:[[0,13,3,16],'west'],east:[[10,13,13,16],'north']}],
    [[13,0,0],[16,3,3],{down:[[7,13,10,16],'east'],north:[[0,13,3,16],'north'],south:[[10,13,13,16],'east'],west:[[3,13,6,16],'north'],east:[[13,13,16,16],'east']}]]};
function packBedColors(){if(!PACK)return[];const s=new Set();for(const k of Object.keys(PACK.imgs)){const m=k.match(/^b\/([a-z_]+)_bed_head_up$/);if(m&&PACK.imgs['b/'+m[1]+'_bed_foot_up'])s.add(m[1])}return[...s].sort()}
function bedTex(c,part,v){const n=v==='down'?'bed_down':v==='north'?'bed_head_north':`${c}_bed_${part}_${v}`;return PACK&&PACK.imgs['b/'+n]}
function bedMesh(c){const T=THREE,by=new Map(),e=.0005;
  for(const part of['head','foot'])for(const[from,to,faces]of BED_ELS[part]){const oz=part==='head'?-16:0,x0=from[0]-8,x1=to[0]-8,y0=from[1],y1=to[1],z0=from[2]+oz,z1=to[2]+oz;
    const C={north:[[x1,y1,z0],[x0,y1,z0],[x1,y0,z0],[x0,y0,z0],[0,0,-1]],south:[[x0,y1,z1],[x1,y1,z1],[x0,y0,z1],[x1,y0,z1],[0,0,1]],east:[[x1,y1,z1],[x1,y1,z0],[x1,y0,z1],[x1,y0,z0],[1,0,0]],
      west:[[x0,y1,z0],[x0,y1,z1],[x0,y0,z0],[x0,y0,z1],[-1,0,0]],up:[[x0,y1,z0],[x1,y1,z0],[x0,y1,z1],[x1,y1,z1],[0,1,0]],down:[[x0,y0,z1],[x1,y0,z1],[x0,y0,z0],[x1,y0,z0],[0,-1,0]]};
    for(const[f,[uv,v]]of Object.entries(faces)){const tex=bedTex(c,part,v);if(!tex)continue;let g=by.get(tex);if(!g){g={p:[],n:[],u:[],i:[]};by.set(tex,g)}
      const[tl,tr,bl,br,n]=C[f],b=g.p.length/3,[u1,v1,u2,v2]=uv;for(const q of[tl,tr,bl,br]){g.p.push(...q);g.n.push(...n)}
      g.u.push(u1/16+e,1-v1/16-e,u2/16-e,1-v1/16-e,u1/16+e,1-v2/16+e,u2/16-e,1-v2/16+e);g.i.push(b,b+2,b+1,b+1,b+2,b+3)}}
  const grp=new T.Group();
  for(const[tex,g]of by){const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(g.p,3));geo.setAttribute('normal',new T.Float32BufferAttribute(g.n,3));geo.setAttribute('uv',new T.Float32BufferAttribute(g.u,2));geo.setIndex(g.i);
    const t=new T.CanvasTexture(tex);t.magFilter=T.NearestFilter;t.minFilter=T.NearestFilter;t.generateMipmaps=false;t.encoding=T.sRGBEncoding;grp.add(new T.Mesh(geo,new T.MeshLambertMaterial({map:t,alphaTest:.1})))}
  return grp}
let bedR=null;
function bedCanvas(c,yaw,pitch,roll){if(!window.THREE)return mk(4,4);const T=THREE,R=Math.PI/180;
  if(bedR===null){try{const r=new T.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true});r.setPixelRatio(1);r.setSize(512,512,false);r.outputEncoding=T.sRGBEncoding;
    const sc=new T.Scene();sc.add(new T.HemisphereLight(0xffffff,0x6a6a6a,.72));const d=new T.DirectionalLight(0xffffff,.7);d.position.set(25,80,45);sc.add(d);
    const cam=new T.OrthographicCamera(-23,23,23,-23,-200,200);cam.position.set(0,0,100);bedR={r,sc,cam}}catch{bedR=false}}
  if(!bedR)return mk(4,4);const g=bedMesh(c),piv=new T.Group();g.position.y=-4.5;piv.add(g);piv.rotation.set(pitch*R,yaw*R,roll*R,'XYZ');
  bedR.sc.add(piv);bedR.r.setClearColor(0x000000,0);bedR.r.render(bedR.sc,bedR.cam);const out=trimCanvas(bedR.r.domElement);bedR.sc.remove(piv);
  g.traverse(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(o.material.map)o.material.map.dispose();o.material.dispose()}});return out}
const alphaMemo=new WeakMap();
function hasAlpha(c){let v=alphaMemo.get(c);if(v!=null)return v;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;v=false;for(let i=3;i<d.length;i+=4)if(d[i]<250){v=true;break}alphaMemo.set(c,v);return v}
let pkBases=null;
function packBlockBases(){if(pkBases)return pkBases;if(!PACK)return[];const has=n=>!!PACK.imgs['b/'+n],set=new Set();
  for(const k of Object.keys(PACK.imgs)){if(!k.startsWith('b/'))continue;const n=k.slice(2);if(PK_SKIP.test(n))continue;const b=n.replace(/_(top|side|bottom|front|back|end)$/,'');set.add(has(b)||has(b+'_side')||has(b+'_front')||has(b+'_top')?b:n)}
  return pkBases=[...set].sort()}
function pkFace(n){const c=PACK.imgs['b/'+n];if(!c)return null;let o=PK_TINT[n]?tintCanvas(c,PK_TINT[n]):c;
  if(n==='grass_block_side'&&PACK.imgs['b/grass_block_side_overlay']){const oc=tintCanvas(PACK.imgs['b/grass_block_side_overlay'],'#91bd59'),cc=mk(o.width,o.height),x=cc.getContext('2d');x.drawImage(o,0,0);x.drawImage(oc,0,0,o.width,o.height);o=cc}return o}
/* Pflanzen, Fackeln, Schienen usw. sind in Minecraft keine Würfel (z. B. zwei gekreuzte Flächen).
   Sie werden flach wie im Inventar gezeigt statt als falscher Block. */
const PK_FLAT=/(flower|sapling|tulip|orchid|allium|bluet|daisy|poppy|dandelion|cornflower|lily_of_the_valley|wither_rose|rose_bush|peony|lilac|sunflower|fern|^short_grass|^tall_grass|^grass$|seagrass|_bush$|^bush$|dead_bush|(?<!_block)_mushroom$|^(red|brown)_mushroom$|fungus$|_roots$|sprouts|nether_wart$|_stage\d|_stem$|attached_|vine|kelp|coral(?!_block)|_fan$|torch|lantern|^chain$|rail|ladder|lever|cobweb|sugar_cane|bamboo_stage|^bamboo$|pointed_dripstone|propagule|pitcher_crop|pitcher_plant|spore_blossom|hanging_roots|glow_lichen|sculk_vein|_carpet_overlay|lily_pad|frogspawn|small_dripleaf|big_dripleaf_stem|cave_vines|weeping|twisting|tripwire|redstone_dust|repeater|comparator|_door_|_door$|iron_bars|_pane|sweet_berry|beetroots|carrots|potatoes|wheat|cocoa|melon_stem|pumpkin_stem|firefly|leaf_litter|wildflowers|cactus_flower|eyeblossom)/;
const flatMemo=new Map();
function pkFlat(b){if(flatMemo.has(b))return flatMemo.get(b);let v=PK_FLAT.test(b);
  if(!v&&PACK.imgs['b/'+b]&&![b+'_side',b+'_top',b+'_front',b+'_end'].some(n=>PACK.imgs['b/'+n])){const c=PACK.imgs['b/'+b],w=c.width,h=Math.min(w,c.height),d=c.getContext('2d').getImageData(0,0,w,h).data;
    let tr=0,edge=0,en=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const t=d[(y*w+x)*4+3]<30;if(t)tr++;if(x===0||x===w-1){en++;if(t)edge++}}
    v=tr/(w*h)>.3&&edge/en>.5}
  flatMemo.set(b,v);return v}
function packDynTex(b){if(!PACK)return null;const has=n=>!!PACK.imgs['b/'+n];
  const side=[b,b+'_side',b+'_front',b+'_top'].find(has);if(!side)return null;
  const top=[b+'_top',b+'_end',side].find(has),bottom=[PK_BOTTOM[b],b+'_bottom',top].filter(Boolean).find(has),front=[b+'_front',side].find(has);
  const t={top:pkFace(top),side:pkFace(side),bottom:pkFace(bottom),front:pkFace(front)};
  if(hasAlpha(t.side)||hasAlpha(t.top))t.alpha=true;if(/lava|glowstone|sea_lantern|shroomlight|magma|froglight|redstone_lamp_on/.test(b))t.bright=true;return t}
function gridFromImage(im){const w=im.width,n=Math.min(32,w),c=mk(n,n),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(im,0,0,w,w,0,0,n,n);
  const d=x.getImageData(0,0,n,n).data,g=[];for(let y=0;y<n;y++){const r=[];for(let X=0;X<n;X++){const i=(y*n+X)*4;r.push(d[i+3]>=100?'#'+[d[i],d[i+1],d[i+2]].map(v=>v.toString(16).padStart(2,'0')).join(''):null)}g.push(r)}return g}
function packItemImg(names){const pre=names.startsWith('@')?'b/':'i/';for(const n of names.replace(/^@/,'').split('|')){const im=PACK.imgs[pre+n];if(im)return im}return null}
const pkGrid=new Map();
function packItemGrid(n){if(!PACK||!PACK.imgs['i/'+n])return null;let g=pkGrid.get(n);if(!g){g=gridFromImage(PACK.imgs['i/'+n]);pkGrid.set(n,g)}return g}
const prettyName=n=>{const s=n.replace(/_/g,' ');return s[0].toUpperCase()+s.slice(1)};
let PACK_LIB=[];
function registerPackLib(){
  for(const a of PACK_LIB){delete LIBK[a.key];const i=LIB.indexOf(a);if(i>=0)LIB.splice(i,1)}PACK_LIB=[];pkBases=null;pkGrid.clear();flatMemo.clear();
  if(!PACK)return;
  for(const b of packBlockBases()){const flat=pkFlat(b);
    const a=flat?{key:'pb_'+b,cat:'blocks',name:prettyName(b),gen:()=>{const f=[b,b+'_front',b+'_side',b+'_top',b+'_bottom'].map(pkFace).find(Boolean)||mk(16,16);return upscale(f,Math.max(1,Math.round(256/f.width)))},pixel:true,color:null,font:false,cover:false,bk:null,pack:true}
      :{key:'pb_'+b,cat:'blocks',name:prettyName(b),gen:()=>blockCanvas('pk:'+b),pixel:false,color:null,font:false,cover:false,bk:'pk:'+b,pack:true};PACK_LIB.push(a)}
  for(const c of packBedColors())PACK_LIB.push({key:'pb_bed_'+c,cat:'blocks',name:prettyName(c+'_bed'),gen:()=>blockCanvas('bed:'+c),pixel:false,color:null,font:false,cover:false,bk:'bed:'+c,pack:true});
  for(const k of Object.keys(PACK.imgs).filter(k=>k.startsWith('i/')).sort()){const n=k.slice(2),im=PACK.imgs[k];
    PACK_LIB.push({key:'pi_'+n,cat:'items',name:prettyName(n),gen:()=>upscale(im,Math.max(1,Math.round(256/im.width))),pixel:true,color:null,font:false,cover:false,bk:null,pack:true})}
  for(const a of PACK_LIB){LIB.push(a);LIBK[a.key]=a}}
function packChanged(){packTick++;cloudMapCache=null;libCache.clear();cubeCache.clear();blockTexCache.clear();registerPackLib();packWatchers.forEach(f=>{try{f()}catch{}})}
/* Speicher: IndexedDB (die Dateien sind zu groß für localStorage) */
const packKV={_p:null,open(){if(this._p)return this._p;this._p=new Promise((ok,no)=>{if(!window.indexedDB)return no(new Error('kein Speicher'));const r=indexedDB.open('renderkammer-pack',1);r.onupgradeneeded=()=>r.result.createObjectStore('kv');r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});this._p.catch(()=>{this._p=null});return this._p},
  async get(k){const d=await this.open();return new Promise((ok,no)=>{const q=d.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>ok(q.result);q.onerror=()=>no(q.error)})},
  async set(k,v){const d=await this.open();return new Promise((ok,no)=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>ok();t.onerror=()=>no(t.error);t.onabort=()=>no(t.error)})},
  async del(k){const d=await this.open();return new Promise(ok=>{const t=d.transaction('kv','readwrite');t.objectStore('kv').delete(k);t.oncomplete=()=>ok();t.onerror=()=>ok()})}};
async function decodeTex(blob,full){const bm=await createImageBitmap(blob);const w=bm.width,h=full?bm.height:Math.min(bm.height,w),c=mk(w,h);c.getContext('2d').drawImage(bm,0,0,w,h,0,0,w,h);if(bm.close)bm.close();return c}
async function applyPack(data,status=()=>{}){
  if(!data){PACK=null;Object.assign(ITEM16,ORIG_ITEM16);packChanged();return}
  const imgs={},skins={};
  if(data.v===2){const ents=Object.entries(data.files||{});let n=0;
    for(let i=0;i<ents.length;i+=48){await Promise.all(ents.slice(i,i+48).map(async([k,b])=>{try{imgs[k]=await decodeTex(b,k.startsWith('e/'))}catch{}}));n=Math.min(ents.length,i+48);status(`Texturen werden vorbereitet … ${n} von ${ents.length}`,n/ents.length)}
    for(const[k,b]of Object.entries(data.skins||{})){try{const c=await decodeTex(b,true);if(c.width===64&&(c.height===64||c.height===32))skins[k]=c}catch{}}}
  else{for(const[k,u]of Object.entries(data.tex||{})){if(typeof u!=='string'||!/^data:image\/png;base64,/.test(u))continue;try{const im=await loadImage(u),w=im.naturalWidth,c=mk(w,Math.min(w,im.naturalHeight));c.getContext('2d').drawImage(im,0,0);imgs[k]=c}catch{}}
    for(const[k,u]of Object.entries(data.skins||{})){if(typeof u!=='string'||!/^data:image\/png;base64,/.test(u))continue;try{const im=await loadImage(u);if(im.naturalWidth===64&&(im.naturalHeight===64||im.naturalHeight===32)){const c=mk(64,im.naturalHeight);c.getContext('2d').drawImage(im,0,0);skins[k]=c}}catch{}}}
  PACK={name:data.name||'Texturpaket',imgs,skins};
  Object.assign(ITEM16,ORIG_ITEM16);for(const[k,names]of Object.entries(PACK_ITEMS)){const im=packItemImg(names);if(im)ITEM16[k]=gridFromImage(im)}
  packChanged()}
let PACK_BUSY=false,PACK_STATUS='';
function packStatus(t,f){PACK_STATUS=t;const el=document.getElementById('pack-status');if(el)el.textContent=t;const gs=document.getElementById('gate-st');if(gs&&!$('#gate').hidden){gs.textContent=t;const b=$('#gate-bar');b.hidden=false;if(f!=null)b.firstElementChild.style.width=Math.round(f*100)+'%'}}
async function runPackLoad(make){
  if(PACK_BUSY)return;PACK_BUSY=true;packUI();
  let ok=false;
  try{const data=await make(packStatus);await applyPack(data,packStatus);ok=true;
    const kept=await packKV.set('pack',data).then(()=>true,()=>false);try{localStorage.removeItem('rk-pack')}catch{}
    const nb=packBlockBases().length,ni=Object.keys(PACK.imgs).filter(k=>k.startsWith('i/')).length,ns=Object.keys(PACK.skins).length;
    {const g=document.getElementById('gate');if(g&&!g.hidden){g.hidden=true;if(typeof onGateClosed==='function')setTimeout(onGateClosed,0)}}
    packStatus('');toast(`Geladen: ${nb} Blöcke, ${ni} Gegenstände${ns?`, ${ns} Skins`:''}.`+(kept?'':' Es bleibt nur bis zum Neuladen, weil der Browser-Speicher voll ist.'))}
  catch(e){packStatus('Das hat nicht geklappt: '+(e&&e.message?e.message:'unbekannter Fehler'))}
  finally{PACK_BUSY=false;packUI()}
  return ok}
function packUI(){if(typeof buildSide==='function'&&view==='editor'&&ED.p&&ED.tab==='assets')buildSide()}
const loadPackFile=file=>runPackLoad(st=>{st('Datei wird gelesen …');return readPack(file,null,st)});
const loadPackMojang=()=>runPackLoad(packFromMojang);
const loadPackPocketcraft=()=>runPackLoad(st=>{st('Pocketcraft-Texturen werden übernommen …');return packFromPocketcraft()});
function removePack(){try{localStorage.removeItem('rk-pack')}catch{}packKV.del('pack').catch(()=>{});applyPack(null);toast('Eigene Grafiken sind wieder aktiv.')}
(async function(){const ready=()=>{if(typeof shellPackState==='function')shellPackState(true)};try{const d=await packKV.get('pack');if(d&&d.v===2){PACK_BUSY=true;await applyPack(d);PACK_BUSY=false;packUI();ready();return}}catch{PACK_BUSY=false}
  const saved=store.get('rk-pack',null);if(saved&&saved.tex){await applyPack(saved);ready();return}
  gateOpen()})();
/* ================= Installation beim ersten Start ================= */
function gateOpen(){
  const g=$('#gate'),go=$('#gate-go'),alt=$('#gate-alt'),st=$('#gate-st');g.hidden=false;
  const altBtn=(t,fn)=>{const b=document.createElement('button');b.type='button';b.className='btn ghost sm';b.textContent=t;b.addEventListener('click',fn);alt.append(b);return b};
  const done=()=>{g.hidden=true;toast('Minecraft-Texturen sind installiert.');if(typeof onGateClosed==='function')onGateClosed()};
  const fill=()=>{alt.innerHTML='';
    if(!window.RK_LOCAL)altBtn('client.jar herunterladen',()=>window.open('https://piston-data.mojang.com/v1/objects/e877b6a07acd633fb3bb475002175cec036e7b87/client.jar','_blank','noopener'));
    altBtn(window.RK_LOCAL?'Eigene .jar auswählen':'Texturpaket auswählen',()=>$('#f-pack').click());
    altBtn('Ohne Texturen starten',()=>{g.hidden=true;if(typeof onGateClosed==='function')onGateClosed()})};
  if(window.RK_LOCAL){go.textContent='Installieren';go.onclick=async()=>{go.disabled=true;st.textContent='';if(await runPackLoad(packFromMojang))done();else{go.disabled=false;go.textContent='Nochmal versuchen'}}}
  else{$('#gate-p').textContent='Rendernail braucht einmalig die Original-Texturen aus Minecraft. Lade die client.jar von Mojang herunter und wähle sie hier aus.';
    $('#gate-list').lastElementChild.textContent='Bleibt in diesem Browser';go.textContent='client.jar auswählen';go.onclick=()=>$('#f-pack').click()}
  fill();pocketcraftTextures().then(t=>{if(t&&!g.hidden)altBtn('Aus Pocketcraft übernehmen',async()=>{if(await runPackLoad(st2=>{st2('Pocketcraft-Texturen werden übernommen …');return packFromPocketcraft()}))done()})}).catch(()=>{});
  packWatchers.push(()=>{if(PACK&&!g.hidden&&!PACK_BUSY)done()});
  setTimeout(()=>go.focus(),50)}
document.addEventListener('change',e=>{if(e.target&&e.target.id==='f-pack'){const f=e.target.files[0];e.target.value='';if(f)loadPackFile(f)}});
