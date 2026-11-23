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
/* Texturen aus einer Quelle sammeln: has/read mit Pfaden relativ zu assets/minecraft/textures/ */
async function collectPack(src,name){
  const out={name:String(name||'Texturpaket').slice(0,60),tex:{},skins:{}};
  const get=async(dirs,names,pref)=>{for(const n of names.split('|'))for(const d of dirs){const p=`${d}/${n}.png`;if(src.has(p)){const ab=await src.read(p);if(ab)out.tex[pref+n]=await pngURL(ab);return}}};
  const bn=new Set();for(const def of Object.values(PACK_BLOCKS))for(const v of Object.values(def)){if(!Array.isArray(v))continue;bn.add(v[0]);if(v[2])bn.add(v[2])}
  for(const n of bn)await get(['block','blocks'],n,'b/');
  for(const n of Object.values(PACK_ITEMS)){if(n.startsWith('@'))await get(['block','blocks'],n.slice(1),'b/');else await get(['item','items'],n,'i/')}
  const re=/^entity\/(?:player\/(wide|slim)\/)?([a-z0-9_]+)\.png$/;
  for(const p of src.names()){const m=p.match(re);if(!m||(!m[1]&&!['steve','alex'].includes(m[2])))continue;if(Object.keys(out.skins).length>=18)break;
    const ab=await src.read(p);if(ab)out.skins[(m[1]==='slim'||m[2]==='alex'?'s:':'w:')+m[2]]=await pngURL(ab)}
  if(!Object.keys(out.tex).length&&!Object.keys(out.skins).length)throw new Error('In der Datei wurden keine Minecraft-Texturen gefunden.');
  return out}
async function readPack(file,name){
  if(typeof DecompressionStream==='undefined')throw new Error('Dieser Browser ist zu alt zum Entpacken. Ein aktueller Chrome, Firefox oder Safari kann es.');
  const z=await rkZip(file),pre='assets/minecraft/textures/';
  return collectPack({names:()=>z.names().filter(k=>k.startsWith(pre)).map(k=>k.slice(pre.length)),has:p=>z.has(pre+p),read:p=>z.read(pre+p)},name||file.name)}
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
  return readPack(new Blob(parts),`Minecraft ${id} (von Mojang)`)}
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
  return collectPack({names:()=>keys.map(k=>k+'.png'),has:p=>p in b,read:async p=>{const v=b[p];return v instanceof Blob?v.arrayBuffer():v}},`Minecraft ${t.version||''} (aus Pocketcraft)`.replace('  ',' '))}
function resolveB(alts){for(const n of String(alts).split('|')){const im=PACK.imgs['b/'+n];if(im)return im}return null}
function frameCanvas(im){const w=im.naturalWidth,c=mk(w,w);c.getContext('2d').drawImage(im,0,0,w,w,0,0,w,w);return c}
function tintCanvas(c,hex){const o=mk(c.width,c.height),x=o.getContext('2d');x.drawImage(c,0,0);x.globalCompositeOperation='multiply';x.fillStyle=hex;x.fillRect(0,0,o.width,o.height);x.globalCompositeOperation='destination-in';x.drawImage(c,0,0);return o}
function packFace(spec){const im=resolveB(spec[0]);if(!im)return null;let c=frameCanvas(im);if(spec[1])c=tintCanvas(c,spec[1]);
  if(spec[2]){const o=resolveB(spec[2]);if(o){const oc=tintCanvas(frameCanvas(o),spec[3]||'#91bd59');c.getContext('2d').drawImage(oc,0,0,c.width,c.height)}}return c}
function packBlockTex(k){if(!PACK)return null;const d=PACK_BLOCKS[k];if(!d)return null;const t={};
  if(d.all){const f=packFace(d.all);if(!f)return null;t.top=t.side=f}else{t.top=packFace(d.top);t.side=packFace(d.side);if(!t.top||!t.side)return null;if(d.bottom)t.bottom=packFace(d.bottom)}
  if(d.alpha)t.alpha=true;if(d.bright)t.bright=true;return t}
function gridFromImage(im){const w=im.naturalWidth,n=Math.min(32,w),c=mk(n,n),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(im,0,0,w,w,0,0,n,n);
  const d=x.getImageData(0,0,n,n).data,g=[];for(let y=0;y<n;y++){const r=[];for(let X=0;X<n;X++){const i=(y*n+X)*4;r.push(d[i+3]>=100?'#'+[d[i],d[i+1],d[i+2]].map(v=>v.toString(16).padStart(2,'0')).join(''):null)}g.push(r)}return g}
function packItemImg(names){const pre=names.startsWith('@')?'b/':'i/';for(const n of names.replace(/^@/,'').split('|')){const im=PACK.imgs[pre+n];if(im)return im}return null}
function packChanged(){packTick++;libCache.clear();cubeCache.clear();blockTexCache.clear();packWatchers.forEach(f=>{try{f()}catch{}})}
async function applyPack(data){
  if(!data){PACK=null;Object.assign(ITEM16,ORIG_ITEM16);packChanged();return}
  const imgs={},skins={};
  await Promise.all(Object.entries(data.tex||{}).map(async([k,u])=>{if(typeof u!=='string'||!/^data:image\/png;base64,/.test(u))return;try{imgs[k]=await loadImage(u)}catch{}}));
  await Promise.all(Object.entries(data.skins||{}).map(async([k,u])=>{if(typeof u!=='string'||!/^data:image\/png;base64,/.test(u))return;try{const im=await loadImage(u);if(im.naturalWidth===64&&(im.naturalHeight===64||im.naturalHeight===32)){const c=mk(64,im.naturalHeight);c.getContext('2d').drawImage(im,0,0);skins[k]=c}}catch{}}));
  PACK={name:data.name||'Texturpaket',imgs,skins};
  Object.assign(ITEM16,ORIG_ITEM16);for(const[k,names]of Object.entries(PACK_ITEMS)){const im=packItemImg(names);if(im)ITEM16[k]=gridFromImage(im)}
  packChanged()}
let PACK_BUSY=false,PACK_STATUS='';
function packStatus(t){PACK_STATUS=t;const el=document.getElementById('pack-status');if(el)el.textContent=t}
async function runPackLoad(make){
  if(PACK_BUSY)return;PACK_BUSY=true;packUI();
  try{const data=await make(packStatus);await applyPack(data);
    const kept=store.set('rk-pack',data);
    const nb=Object.keys(PACK_BLOCKS).filter(k=>packBlockTex(k)).length,ni=Object.keys(PACK_ITEMS).filter(k=>packItemImg(PACK_ITEMS[k])).length,ns=Object.keys(PACK.skins).length;
    packStatus('');toast(`Geladen: ${nb} Blöcke, ${ni} Gegenstände${ns?`, ${ns} Skins`:''}.`+(kept?'':' Es bleibt nur bis zum Neuladen, weil der Browser-Speicher voll ist.'))}
  catch(e){packStatus('Das hat nicht geklappt: '+(e&&e.message?e.message:'unbekannter Fehler'))}
  finally{PACK_BUSY=false;packUI()}}
function packUI(){if(typeof buildSide==='function'&&view==='editor'&&ED.p&&ED.tab==='assets')buildSide()}
const loadPackFile=file=>runPackLoad(st=>{st('Datei wird gelesen …');return readPack(file)});
const loadPackMojang=()=>runPackLoad(packFromMojang);
const loadPackPocketcraft=()=>runPackLoad(st=>{st('Pocketcraft-Texturen werden übernommen …');return packFromPocketcraft()});
function removePack(){try{localStorage.removeItem('rk-pack')}catch{}applyPack(null);toast('Eigene Grafiken sind wieder aktiv.')}
(function(){const saved=store.get('rk-pack',null);if(saved&&saved.tex)applyPack(saved)})();
document.addEventListener('change',e=>{if(e.target&&e.target.id==='f-pack'){const f=e.target.files[0];e.target.value='';if(f)loadPackFile(f)}});
