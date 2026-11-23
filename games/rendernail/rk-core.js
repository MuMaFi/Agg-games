'use strict';
let view='';
/* ================= Hilfen ================= */
const $=s=>document.querySelector(s);
const mk=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.round(w));c.height=Math.max(1,Math.round(h));return c};
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
function hash3(x,y,z){let h=Math.imul(x,374761393)+Math.imul(y,668265263)+Math.imul(z,2147483647);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295*2-1}
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v));return true}catch{return false}}};
const fmt=n=>Number(n).toLocaleString('de-DE');
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hexRgb(h){const n=parseInt(String(h).slice(1),16);return[n>>16&255,n>>8&255,n&255]}
const hexA=(h,a)=>{const[r,g,b]=hexRgb(h);return`rgba(${r},${g},${b},${a})`};
function shadeHex(h,f){return'#'+hexRgb(h).map(v=>clamp(Math.round(v*f),0,255).toString(16).padStart(2,'0')).join('')}
const slug=s=>(s||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'rendernail';
function rel(d){if(!d)return'';const days=Math.floor((Date.now()-new Date(String(d).slice(0,10)+'T12:00:00'))/864e5);
  if(days<=0){const mins=Math.round((Date.now()-new Date(d))/6e4);if(String(d).length>10&&mins>=0&&mins<60)return mins<2?'gerade eben':`vor ${mins} Minuten`;if(String(d).length>10&&mins>=60&&mins<24*60){const h=Math.round(mins/60);return h===1?'vor 1 Stunde':`vor ${h} Stunden`}return'heute'}
  if(days===1)return'gestern';if(days<7)return`vor ${days} Tagen`;if(days<35){const w=Math.round(days/7);return w===1?'vor 1 Woche':`vor ${w} Wochen`}
  return new Date(String(d).slice(0,10)).toLocaleDateString('de-DE',{day:'numeric',month:'short',year:'numeric'})}
const canvasBlob=(c,type='image/png',q)=>new Promise((res,rej)=>c.toBlob(b=>b?res(b):rej(new Error('blob')),type,q));
const blobToDataURL=b=>new Promise((res,rej)=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.onerror=rej;fr.readAsDataURL(b)});
const loadImage=url=>new Promise((res,rej)=>{const im=new Image();im.onload=()=>res(im);im.onerror=()=>rej(new Error('img'));im.src=url});
let toastT=0;
function toast(t){const el=$('#toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{el.hidden=true},3400)}
const dlErr=e=>e&&e.code==='declined'?'Download abgebrochen.':e&&e.code==='rate_limited'?'Es ist schon ein Download-Fenster offen.':'Download hat nicht geklappt. Lange auf das Bild drücken oder Rechtsklick und „Bild speichern“ geht immer.';
const ICON={
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  flip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="M8 7 3 12l5 5V7ZM16 7l5 5-5 5V7Z"/></svg>',
  front:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2"/><path d="M20 8v10a2 2 0 0 1-2 2H8"/></svg>',
  sliders:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></svg>',
  rot3d:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M12 12 20 7.5M12 12v9M12 12 4 7.5"/></svg>',
  group:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/><path d="M15 3h6v6M3 15v6h6"/></svg>',
  ungroup:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
  lk:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  heart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg>',
  dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeoff:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6"/></svg>',
  lock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
  unlock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
  cube:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 2 21 7v10l-9 5-9-5V7Z"/><path d="M3 7l9 5 9-5M12 12v10"/></svg>',
  text:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></svg>',
  image:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>',
  pixel:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 8h3v3H8zM13 13h3v3h-3z" fill="currentColor"/></svg>',
  tpl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
  upload:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 16V4m0 0-4 4m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>'
};

/* ================= Plattform-Funktionen ================= */
let DL=null,ASSETS=null,DB=null;
const capWaiters=[];
function onCaps(fn){capWaiters.push(fn);if(DL)fn('dl');if(ASSETS)fn('assets');if(DB)fn('db')}
function setCaps(dl,assets,db){DL=dl;ASSETS=assets;DB=db;for(const k of['dl','assets','db'])capWaiters.forEach(f=>f(k))}
if(window.claude&&window.claude.use){
  claude.use('downloads').then(x=>{DL=x;capWaiters.forEach(f=>f('dl'))}).catch(()=>{});
  claude.use('assets').then(x=>{ASSETS=x;capWaiters.forEach(f=>f('assets'))}).catch(()=>{});
  claude.use('db').then(x=>{DB=x;capWaiters.forEach(f=>f('db'))}).catch(()=>{});
}
async function saveFile(name,data,fallbackUrl){
  if(DL){try{await DL.save({filename:name,data});toast('Gespeichert: '+name);return true}catch(e){toast(dlErr(e));return false}}
  if(fallbackUrl){openDialog({src:fallbackUrl,title:name,license:false,spec:[],hint:'Lange auf das Bild drücken (iPad) oder Rechtsklick und „Bild speichern unter…“.',actions:[]});return false}
  toast('Speichern ist in dieser Ansicht nicht möglich.');return false}

/* ================= Uploads (Bilder, Renders) ================= */
let UPLOADS=[];const uploadWatchers=[];
function srcUrl(src){if(!src)return'';if(src.asset&&/^[0-9a-f]{32}$/.test(src.asset))return(window.RK_LOCAL?'idb:':'/_blob/')+src.asset;return typeof src.data==='string'&&/^data:image\//.test(src.data)?src.data:''}
async function storeImage(blob,name,kind,w,h){
  if(ASSETS){
    const type=['image/png','image/jpeg','image/webp','image/gif'].includes(blob.type)?blob.type:'image/png';
    const up=await ASSETS.upload(blob,{type});
    const rec={asset:up.id,name:name||'Bild',kind:kind||'upload',w:w||0,h:h||0,created:new Date().toISOString()};
    if(DB){try{await DB.collection('uploads').add(rec)}catch{UPLOADS.unshift(rec);uploadWatchers.forEach(f=>f())}}else{UPLOADS.unshift(rec);uploadWatchers.forEach(f=>f())}
    return{asset:up.id}}
  const data=await blobToDataURL(blob);
  UPLOADS.unshift({data,name:name||'Bild',kind:kind||'upload',w,h,created:new Date().toISOString(),local:true});uploadWatchers.forEach(f=>f());
  return{data}}
function startUploadsSync(){
  if(!DB)return;
  DB.collection('uploads').orderBy('created','desc').onSnapshot(s=>{
    const local=UPLOADS.filter(u=>u.local);
    UPLOADS=local.concat(s.docs.map(d=>({...(d.data()||{}),docId:d.id})).filter(u=>typeof u.asset==='string'));
    uploadWatchers.forEach(f=>f())},()=>{})}
onCaps(k=>{if(k==='db')startUploadsSync()});

const imgCache=new Map();let imgWaiters=[];
/* idb:… = Bild aus dem Browser-Speicher (eigenständige Fassung) */
const realUrl=url=>url.startsWith('idb:')?RKLocal.blobURL(url.slice(4)):Promise.resolve(url);
function getImg(url){if(!url)return null;let e=imgCache.get(url);if(!e){e={img:new Image(),ok:false,err:false};e.p=new Promise(r=>{e.img.onload=()=>{e.ok=true;r();imgWaiters.forEach(f=>f())};e.img.onerror=()=>{e.err=true;r()};
  realUrl(url).then(u=>{e.img.src=u}).catch(()=>{e.err=true;r()})});imgCache.set(url,e)}return e}
async function srcBlob(src){const u=srcUrl(src);if(!u)throw new Error('kein Bild');if(u.startsWith('idb:')){const b=await RKLocal.blob(u.slice(4));if(!b)throw new Error('fehlt');return b}return(await fetch(u)).blob()}
function setImgSrc(el,url){realUrl(url).then(u=>{el.src=u}).catch(()=>{})}

/* ================= Dialog ================= */
const dlg=$('#dlg'),dMsg=$('#d-msg');
function openDialog(o){
  const img=$('#d-img');img.src=o.src;img.alt=o.title||'';
  $('#d-title').textContent=o.title||'';
  const by=$('#d-by');by.textContent='';if(o.author)by.append('von ',Object.assign(document.createElement('b'),{textContent:o.author}),' · ');by.append(o.when||'');
  const spec=$('#d-spec');spec.innerHTML='';for(const[k,v]of(o.spec||[]))spec.append(Object.assign(document.createElement('dt'),{textContent:k}),Object.assign(document.createElement('dd'),{textContent:v}));
  const tags=$('#d-tags');tags.innerHTML='';(o.tags||[]).forEach(t=>tags.append(Object.assign(document.createElement('span'),{textContent:'#'+t})));tags.hidden=!(o.tags||[]).length;
  $('#d-lic').hidden=!o.license;$('#d-hint').textContent=o.hint||'';dMsg.textContent='';
  const box=$('#d-actions');box.innerHTML='';
  for(const a of(o.actions||[]).filter(Boolean)){
    const b=document.createElement('button');b.type='button';b.className='btn'+(a.primary?' primary':'')+(a.danger?' danger':'')+(a.pressed?' like-btn':'');
    const paint=()=>{b.innerHTML=(a.icon||'')+'<span></span>';b.querySelector('span').textContent=typeof a.label==='function'?a.label():a.label;if(a.pressed)b.setAttribute('aria-pressed',a.pressed())};paint();
    b.addEventListener('click',async()=>{
      if(a.confirm&&!b.classList.contains('armed')){b.classList.add('armed');b.querySelector('span').textContent=a.confirm;setTimeout(()=>{b.classList.remove('armed');paint()},4000);return}
      b.disabled=true;dMsg.textContent=a.busy||'';
      try{const r=await a.run();dMsg.textContent=r||''}catch(e){dMsg.textContent=a.fail?a.fail(e):'Das hat nicht geklappt. Versuch es nochmal.'}
      finally{b.disabled=false;b.classList.remove('armed');paint()}});
    box.appendChild(b)}
  if(!dlg.open)dlg.showModal()}
$('#d-close').addEventListener('click',()=>dlg.close());
dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close()});

/* ================= Voxel-Renderer (isometrisch) ================= */
const B={
  grass:{top:'#6fae4a',side:'#866043'}, dirt:{c:'#866043'}, stone:{c:'#8a8c8e',j:.08}, cobble:{c:'#77797b',j:.14},
  log:{top:'#a3855a',side:'#5f4528'}, planks:{c:'#b48c54'}, leaves:{c:'#3e8b37',j:.2},
  sand:{c:'#ddd09a',j:.04}, sandstone:{c:'#d0bb7e',top:'#e0cf96'}, water:{c:'#3c76d6',top:'#4b88e2',a:.74,j:.03},
  glass:{c:'#c4e6f2',a:.4,j:0}, snow:{c:'#f1f5f9',j:.03}, snowgrass:{top:'#f1f5f9',side:'#866043'},
  sprucelog:{top:'#8a6a44',side:'#4a3520'}, spruce:{c:'#2e5c3c',j:.15}, roof:{c:'#6e3a2c',j:.08}, brick:{c:'#9a4c3b',j:.1},
  stonebrick:{c:'#8f9294',j:.07}, path:{c:'#a08a5c',j:.08}, obsidian:{c:'#241840',j:.12}, portal:{c:'#9a4ee0',a:.7,glow:1,j:.1},
  netherrack:{c:'#7a2e2e',j:.15}, lava:{c:'#f37b1d',glow:1,j:.14}, lantern:{c:'#ffcf5a',glow:1,j:0}, cactus:{c:'#4f8a3a',j:.06},
  dark:{c:'#2a2c36',j:.04}, red:{c:'#b8322f',j:.04}, gold:{c:'#e6c140',j:.06}, gravel:{c:'#8d8682',j:.15}
};
const SKY={
  day:{g:['#78b2e6','#d6ebf8'],tint:[1,1,1],sun:'#fff4c2'},
  sunset:{g:['#5b4e92','#e5866a','#f6d49c'],tint:[1.07,.88,.78],sun:'#ffb36a'},
  night:{g:['#0c1230','#2a3868'],tint:[.48,.55,.85],moon:'#e9edf6'},
  nether:{g:['#240b0b','#6b2318'],tint:[1,.72,.62]}
};
const ONE=[1,1,1];
class Scene{
  constructor(){this.m=new Map()}
  k(x,y,z){return x+','+y+','+z}
  set(x,y,z,t){t=typeof t==='string'?B[t]:t;this.m.set(this.k(x,y,z),[x,y,z,t])}
  get(x,y,z){return this.m.get(this.k(x,y,z))}
  has(x,y,z){return this.m.has(this.k(x,y,z))}
  setIfEmpty(x,y,z,t){if(!this.has(x,y,z))this.set(x,y,z,t)}
  box(x0,y0,z0,w,h,d,t){for(let x=x0;x<x0+w;x++)for(let y=y0;y<y0+h;y++)for(let z=z0;z<z0+d;z++)this.set(x,y,z,typeof t==='function'?t(x,y,z):t)}
}
const rgbCache=new Map();
function col(c,f,tint,glow){
  if(!c)c='#777777';
  if(typeof c==='string'){let v=rgbCache.get(c);if(!v){v=hexRgb(c);rgbCache.set(c,v)}c=v}
  const t=glow?ONE:tint;return[clamp(Math.round(c[0]*f*t[0]),0,255),clamp(Math.round(c[1]*f*t[1]),0,255),clamp(Math.round(c[2]*f*t[2]),0,255)]}
const YS=1.2;
function prep(scene){
  if(scene._p)return scene._p;
  const list=[],occ=(t,x,y,z)=>{const o=scene.get(x,y,z);return o&&(!o[3].a||o[3]===t)};
  for(const b of scene.m.values()){const[x,y,z,t]=b;const top=!occ(t,x,y+1,z),px=!occ(t,x+1,y,z),pz=!occ(t,x,y,z+1);if(top||px||pz)list.push({x,y,z,t,top,px,pz})}
  list.sort((a,b)=>(a.x+a.z)-(b.x+b.z)||a.y-b.y);
  let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;
  for(const b of list){const sx=b.x-b.z,sy=(b.x+b.z)/2;minX=Math.min(minX,sx-1);maxX=Math.max(maxX,sx+1);minY=Math.min(minY,sy-(b.y+1)*YS);maxY=Math.max(maxY,sy+1-b.y*YS)}
  return scene._p={list,minX,maxX,minY,maxY}}
function paint(ctx,scene,s,ox,oy,time){
  const p=prep(scene),tint=SKY[time].tint,sh=scene.shade||[1,.8,.64];
  const P=(X,Y,Z)=>[ox+(X-Z)*s,oy+((X+Z)/2-Y*YS)*s];
  const lw=Math.max(.6,s*.03);
  const face=(pts,rgb,a)=>{ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<4;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();
    const c=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;ctx.fillStyle=c;ctx.fill();if(a===1){ctx.strokeStyle=c;ctx.lineWidth=lw;ctx.stroke()}};
  const glows=[];
  for(const b of p.list){const{x,y,z,t}=b,j=1+hash3(x,y,z)*(t.j??.05),a=t.a||1;
    if(b.top)face([P(x,y+1,z),P(x+1,y+1,z),P(x+1,y+1,z+1),P(x,y+1,z+1)],col(t.ft||t.top||t.c,j*sh[0],tint,t.glow),a);
    if(b.px)face([P(x+1,y,z),P(x+1,y+1,z),P(x+1,y+1,z+1),P(x+1,y,z+1)],col(t.fx||t.side||t.c,j*sh[1],tint,t.glow),a);
    if(b.pz)face([P(x,y,z+1),P(x+1,y,z+1),P(x+1,y+1,z+1),P(x,y+1,z+1)],col(t.fz||t.side||t.c,j*sh[2],tint,t.glow),a);
    if(t.glow&&(time==='night'||time==='nether')&&(x+y+z)%2===0)glows.push(P(x+.5,y+.5,z+.5))}
  if(glows.length){ctx.globalCompositeOperation='lighter';for(const[gx,gy]of glows){const r=s*3.2,rg=ctx.createRadialGradient(gx,gy,0,gx,gy,r);rg.addColorStop(0,'rgba(255,170,70,.22)');rg.addColorStop(1,'rgba(255,170,70,0)');ctx.fillStyle=rg;ctx.fillRect(gx-r,gy-r,r*2,r*2)}ctx.globalCompositeOperation='source-over'}}
function drawSky(ctx,W,H,time,seed){
  const sky=SKY[time],r=mulberry32(seed*7+3),u=Math.min(W,H*1.6)/100;
  const g=ctx.createLinearGradient(0,0,0,H);sky.g.forEach((c,i)=>g.addColorStop(i/(sky.g.length-1),c));ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  if(time==='night'){ctx.fillStyle='#ffffff';const n=Math.round(60+W*H/9000);for(let i=0;i<n;i++){ctx.globalAlpha=.3+r()*.7;const s=r()<.15?u*.5:u*.28;ctx.fillRect(r()*W,r()*H*.75,s,s)}ctx.globalAlpha=1;
    ctx.fillStyle=sky.moon;ctx.fillRect(W*.78,H*.1,u*6,u*6);ctx.fillStyle='rgba(120,130,160,.35)';ctx.fillRect(W*.78+u*1.2,H*.1+u*1.5,u*1.6,u*1.6);ctx.fillRect(W*.78+u*3.6,H*.1+u*3.4,u*1.2,u*1.2)}
  if(sky.sun){ctx.fillStyle=sky.sun;ctx.globalAlpha=.95;ctx.fillRect(W*(time==='sunset'?.12:.8),time==='sunset'?H*.55:H*.12,u*7,u*7);ctx.globalAlpha=1}
  if(time==='day'){ctx.fillStyle='rgba(255,255,255,.75)';for(let i=0;i<5;i++){const x=r()*W,y=r()*H*.4,w=u*(10+r()*16);ctx.fillRect(x,y,w,u*2.2);ctx.fillRect(x+u*3,y-u*1.6,w*.5,u*1.8)}}
  if(time==='nether'){for(let i=0;i<40;i++){ctx.fillStyle=`rgba(255,${120+r()*80|0},60,${.15+r()*.35})`;const s=u*(.2+r()*.4);ctx.fillRect(r()*W,r()*H,s,s)}}}
function drawScene(canvas,scene,o){
  const{time='day',seed=1,zoom=1}=o,W=canvas.width,H=canvas.height,ctx=canvas.getContext('2d');
  drawSky(ctx,W,H,time,seed);
  const p=prep(scene);if(!p.list.length)return;
  const s=Math.min(W*.84*zoom/(p.maxX-p.minX),H*.84*zoom/(p.maxY-p.minY));
  paint(ctx,scene,s,W/2-(p.minX+p.maxX)/2*s,H/2-(p.minY+p.maxY)/2*s+H*.02,time)}
function renderTight(scene,unit){
  const p=prep(scene),c=mk((p.maxX-p.minX)*unit+4,(p.maxY-p.minY)*unit+4);
  paint(c.getContext('2d'),scene,unit,2-p.minX*unit,2-p.minY*unit,'day');return c}

/* ================= Skins ================= */
const PRESETS=[
  {name:'Wanderin',skin:'#e3b08a',hair:'#7a3f1c',eye:'#3f6fd0',shirt:'#2f8f8a',trim:'#e8d9b0',pants:'#3b4a8a',shoe:'#4a3626',long:true},
  {name:'Schmied',skin:'#c98d66',hair:'#2a1c14',eye:'#4a3422',shirt:'#b3542f',apron:'#4a3020',pants:'#3a3a3a',shoe:'#252525',beard:true},
  {name:'Nachtwächter',skin:'#f0c6a2',hair:'#d9b45f',eye:'#2f8a6a',shirt:'#2a3566',trim:'#c9a43a',pants:'#22263a',shoe:'#3b2a1a'},
  {name:'Gärtnerin',skin:'#8d5a3f',hair:'#1d1d1d',eye:'#3a2a1a',shirt:'#5e8f3a',trim:'#f0e6c8',pants:'#6b5236',shoe:'#3d2d1f',long:true},
  {name:'Zombie',skin:'#7d9a72',hair:'#4f6b48',eye:'#1a1a1a',shirt:'#7a5a3a',pants:'#3d3d45',shoe:'#2a2a2e',mob:true},
  {name:'Skelett',skin:'#d9d6cc',hair:'#d9d6cc',eye:'#1e1e1e',shirt:'#c9c5b8',pants:'#bcb8ab',shoe:'#a9a59a',mob:true,bones:true}
];
function paintSkin(p,idx){
  const c=mk(64,64),x=c.getContext('2d');
  const R=(cl,u,v,w,h)=>{x.fillStyle=cl;x.fillRect(u,v,w,h)};
  const reg=(u,v,w,h,d)=>({top:[u+d,v,w,d],bottom:[u+d+w,v,w,d],right:[u,v+d,d,h],front:[u+d,v+d,w,h],left:[u+d+w,v+d,d,h],back:[u+2*d+w,v+d,w,h]});
  const all=(r,cl)=>Object.values(r).forEach(a=>R(cl,...a));
  const H=reg(0,0,8,8,8);all(H,p.skin);
  R(p.hair,...H.top);R(p.hair,...H.back);
  R(p.hair,H.right[0],H.right[1],8,p.long?3:2);R(p.hair,H.left[0],H.left[1],8,p.long?3:2);
  R(p.hair,H.right[0],H.right[1],3,p.long?8:4);R(p.hair,H.left[0]+5,H.left[1],3,p.long?8:4);
  const[fu,fv]=H.front;
  if(!p.mob){R(p.hair,fu,fv,8,2);R(p.hair,fu,fv+2,1,p.long?5:1);R(p.hair,fu+7,fv+2,1,p.long?5:1)}
  if(p.bones){R('#1e1e1e',fu+1,fv+3,2,2);R('#1e1e1e',fu+5,fv+3,2,2);R('#1e1e1e',fu+2,fv+6,4,1);R(p.skin,fu+3,fv+6,1,1)}
  else{R('#f4f4f4',fu+1,fv+4,1,1);R(p.eye,fu+2,fv+4,1,1);R(p.eye,fu+5,fv+4,1,1);R('#f4f4f4',fu+6,fv+4,1,1);
    R(shadeHex(p.skin,.88),fu+3,fv+5,2,1);R(shadeHex(p.skin,.68),fu+3,fv+6,2,1);
    if(p.mob){R(p.eye,fu+1,fv+4,1,1);R(p.eye,fu+6,fv+4,1,1);R(shadeHex(p.skin,.6),fu+2,fv+6,4,1)}}
  if(p.beard){R(p.hair,fu+1,fv+5,6,3);R(shadeHex(p.skin,.62),fu+3,fv+6,2,1)}
  const Bd=reg(16,16,8,12,4);all(Bd,p.shirt);const[bu,bv]=Bd.front;
  if(!p.mob)R(p.skin,bu+3,bv,2,1);
  if(p.trim){R(p.trim,bu,bv,3,1);R(p.trim,bu+5,bv,3,1)}
  if(p.apron)R(p.apron,bu+1,bv+2,6,10);
  if(p.bones){for(let i=0;i<4;i++)R('#9d998d',bu+1,bv+2+i*2,6,1);R('#9d998d',bu+3,bv,2,12)}
  if(p.mob&&!p.bones){R(shadeHex(p.shirt,.7),bu+5,bv+8,3,4);R(p.skin,bu+6,bv+10,2,2)}
  const belt=shadeHex(p.pants,.75);for(const s of['front','back','left','right'])R(belt,Bd[s][0],Bd[s][1]+11,Bd[s][2],1);
  for(const[u,v]of[[40,16],[32,48]]){const A=reg(u,v,4,12,4);all(A,p.skin);for(const s of['front','back','left','right']){R(p.shirt,A[s][0],A[s][1],A[s][2],p.mob?3:4);if(p.trim)R(p.trim,A[s][0],A[s][1]+4,A[s][2],1)}R(p.shirt,...A.top)}
  for(const[u,v]of[[0,16],[16,48]]){const L=reg(u,v,4,12,4);all(L,p.pants);for(const s of['front','back','left','right'])R(p.shoe,L[s][0],L[s][1]+9,L[s][2],3);R(p.shoe,...L.bottom)}
  const id=x.getImageData(0,0,64,64),r=mulberry32(idx*991+5);
  for(let i=0;i<id.data.length;i+=4){if(!id.data[i+3])continue;const f=1+(r()-.5)*.09;for(let k=0;k<3;k++)id.data[i+k]=clamp(id.data[i+k]*f,0,255)}
  x.putImageData(id,0,0);
  return c}
const PRESET_SKINS=PRESETS.map(paintSkin);
const skinData=c=>({w:c.width,h:c.height,data:c.getContext('2d').getImageData(0,0,c.width,c.height).data});
const PRESET_IMGS=PRESET_SKINS.map(skinData);
function skinPx(img,x,y){if(x<0||y<0||x>=img.w||y>=img.h)return[128,128,128,255];const i=(y*img.w+x)*4,d=img.data;return[d[i],d[i+1],d[i+2],d[i+3]]}
/* isometrische Figur aus einem Skin; pose: stand | wave | cheer | forward */
function buildChar(img,o){
  const S=new Scene(),legacy=img.h===32,aw=o.slim?3:4;
  const parts=[
    {p:[0,24,0],d:[8,8,8],uv:[0,0],ov:[32,0]},
    {p:[0,12,2],d:[8,12,4],uv:[16,16],ov:legacy?null:[16,32]},
    {p:[-aw,12,2],d:[aw,12,4],uv:[40,16],ov:legacy?null:[40,32],arm:'r'},
    {p:[8,12,2],d:[aw,12,4],uv:legacy?[40,16]:[32,48],ov:legacy?null:[48,48],arm:'l'},
    {p:[0,0,2],d:[4,12,4],uv:[0,16],ov:legacy?null:[0,32]},
    {p:[4,0,2],d:[4,12,4],uv:legacy?[0,16]:[16,48],ov:legacy?null:[0,48]}];
  const up=o.pose==='cheer'?['r','l']:o.pose==='wave'?[o.face==='left'?'l':'r']:[];
  const fwd=o.pose==='forward'?['r','l']:[];
  for(const pt of parts){
    const[w,h,d]=pt.d,[u,v]=pt.uv,raised=!!pt.arm&&up.includes(pt.arm),forward=!!pt.arm&&fwd.includes(pt.arm);
    const tex={py:(i,j,k)=>[d+i,k],ny:(i,j,k)=>[d+w+i,d-1-k],pz:(i,j,k)=>[d+i,d+h-1-j],nz:(i,j,k)=>[2*d+w+(w-1-i),d+h-1-j],nx:(i,j,k)=>[k,d+h-1-j],px:(i,j,k)=>[d+w+(d-1-k),d+h-1-j]};
    const sample=(sx,sy)=>{if(pt.ov){const c=skinPx(img,pt.ov[0]+sx,pt.ov[1]+sy);if(c[3]>=128)return c}return skinPx(img,u+sx,v+sy)};
    for(let i=0;i<w;i++)for(let j=0;j<h;j++)for(let k=0;k<d;k++){
      if(i>0&&i<w-1&&j>0&&j<h-1&&k>0&&k<d-1)continue;
      const fl=[];if(j===h-1)fl.push(['py',[0,1,0]]);if(j===0)fl.push(['ny',[0,-1,0]]);if(k===d-1)fl.push(['pz',[0,0,1]]);if(k===0)fl.push(['nz',[0,0,-1]]);if(i===0)fl.push(['nx',[-1,0,0]]);if(i===w-1)fl.push(['px',[1,0,0]]);
      let pos=[pt.p[0]+i,pt.p[1]+j,pt.p[2]+k];
      if(raised)pos=[pos[0],47-pos[1],7-pos[2]];
      if(forward)pos=[pos[0],pos[2]+20,27-pos[1]];
      if(o.face==='right')pos=[pos[2],pos[1],-pos[0]-1];
      const faces={};
      for(const[f,n0]of fl){let n=n0;if(raised)n=[n[0],-n[1],-n[2]];if(forward)n=[n[0],n[2],-n[1]];if(o.face==='right')n=[n[2],n[1],-n[0]];const[sx,sy]=tex[f](i,j,k);faces[n.join(',')]=sample(sx,sy)}
      S.set(pos[0],pos[1],pos[2],{ft:faces['0,1,0'],fx:faces['1,0,0'],fz:faces['0,0,1'],j:0})}}
  S.shade=o.face==='right'?[1,.95,.78]:[1,.78,.95];
  return S}
/* Wie Minecraft: ist die Hut-Ebene komplett deckend (alte Skins), wird sie ignoriert */
function fixSkin(c){try{const x=c.getContext('2d'),d=x.getImageData(32,0,32,16).data;for(let i=3;i<d.length;i+=4)if(d[i]<255)return c;x.clearRect(32,0,32,16)}catch{}return c}
function loadSkinFile(url){
  return loadImage(url).then(im=>{const w=im.naturalWidth,h=im.naturalHeight;
    if(w<64||w%64||!(h===w||h*2===w))throw new Error('Der Skin muss 64×64 oder 64×32 Pixel groß sein (oder ein Vielfaches davon).');
    const c=mk(64,h*64/w),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(im,0,0,c.width,c.height);return c})}

/* ================= Szenen ================= */
function oak(S,x,y,z,r){const h=4+Math.floor(r()*2);for(let i=0;i<h;i++)S.set(x,y+i,z,'log');
  for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=1;dy++){if(dx*dx+dz*dz+dy*dy*2<=5+(r()<.3?1:0))S.setIfEmpty(x+dx,y+h-1+dy,z+dz,'leaves')}
  S.setIfEmpty(x,y+h+1,z,'leaves')}
function spruce(S,x,y,z,r){const h=6+Math.floor(r()*3);for(let i=0;i<h;i++)S.set(x,y+i,z,'sprucelog');
  for(let yy=y+2;yy<=y+h;yy++){const rad=Math.max(0,Math.round((y+h-yy)/2.3))+((yy-y)%2?0:-1);if(rad<1){S.setIfEmpty(x,yy,z,'spruce');continue}
    for(let dx=-rad;dx<=rad;dx++)for(let dz=-rad;dz<=rad;dz++)if(Math.abs(dx)+Math.abs(dz)<=rad+1)S.setIfEmpty(x+dx,yy,z+dz,'spruce')}
  S.set(x,y+h+1,z,'spruce')}
function island(r){const S=new Scene(),R=7+Math.floor(r()*2),ph=r()*6,p2=r()*6,tops={};
  for(let x=-R-2;x<=R+2;x++)for(let z=-R-2;z<=R+2;z++){const d=Math.hypot(x,z),edge=R+Math.sin(Math.atan2(z,x)*3+ph)*1.3;if(d>edge)continue;
    const top=2+Math.round(Math.sin(x*.5+p2)*1.1+Math.cos(z*.45+ph)*1.1),bot=-Math.round((edge-d)*1.5+r()*1.6)-1;tops[x+','+z]=top;
    for(let y=bot;y<=top;y++)S.set(x,y,z,y===top?'grass':top-y<=2?'dirt':'stone')}
  let n=0;for(let i=0;i<40&&n<3;i++){const x=Math.round((r()-.5)*R*1.2),z=Math.round((r()-.5)*R*1.2),t=tops[x+','+z];if(t!=null){oak(S,x,t+1,z,r);n++}}
  const px=Math.round(R*.35),pz=-Math.round(R*.3);if(tops[px+','+pz]!=null){const t=tops[px+','+pz];S.set(px,t+1,pz,'cobble');S.set(px,t+2,pz,'lantern')}
  const wz=Math.round(R*.2);let wx=null;for(let x=R+2;x>0;x--){if(tops[x+','+wz]!=null){wx=x;break}}
  if(wx!=null){const t=tops[wx+','+wz];S.set(wx,t,wz,'water');for(let y=t;y>t-9;y--)S.set(wx+1,y,wz,'water')}
  for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){if(x*x+z*z>5)continue;const ox=-R-6,oz=R-1;S.set(ox+x,-3,oz+z,'grass');if(x*x+z*z<=2)S.set(ox+x,-4,oz+z,'dirt');if(!x&&!z)S.set(ox,-5,oz,'stone')}
  return S}
function terrain(r,biome){const S=new Scene(),N=biome==='mountains'?22:20,p=[r()*6,r()*6,r()*6,r()*6];
  const amp=biome==='mountains'?6.5:biome==='desert'?2:2.6,base=biome==='mountains'?7:4,wl=biome==='mountains'?4:biome==='desert'?2:3,H=[];
  for(let x=0;x<N;x++){H[x]=[];for(let z=0;z<N;z++){let h=base+amp*(Math.sin(x*.32+p[0])+Math.sin(z*.27+p[1])+Math.sin((x+z)*.18+p[2])*.8+Math.sin((x-z)*.41+p[3])*.4)/2.4;
    if(biome==='plains'){const river=Math.abs(z-N/2-Math.sin(x*.35+p[0])*3);if(river<1.8)h=Math.min(h,wl-1)}
    H[x][z]=Math.max(1,Math.round(h))}}
  for(let x=0;x<N;x++)for(let z=0;z<N;z++){const h=H[x][z];
    for(let y=0;y<=h;y++){let t;
      if(biome==='desert')t=y===h?'sand':h-y<3?'sandstone':'stone';
      else if(biome==='taiga')t=y===h?(h<=wl?'gravel':'snowgrass'):h-y<3?'dirt':'stone';
      else if(biome==='mountains')t=y===h?(h>=12?'snow':h>=9?'stone':h<=wl?'gravel':'grass'):h-y<2&&h<9?'dirt':'stone';
      else t=y===h?(h<=wl?'sand':'grass'):h-y<3?'dirt':'stone';
      S.set(x,y,z,t)}
    for(let y=h+1;y<=wl;y++)S.set(x,y,z,'water')}
  for(let x=2;x<N-2;x++)for(let z=2;z<N-2;z++){const h=H[x][z];if(h<=wl)continue;
    if(biome==='desert'){if(r()<.03){const c=2+Math.floor(r()*2);for(let i=1;i<=c;i++)S.set(x,h+i,z,'cactus')}}
    else if(biome==='taiga'){if(r()<.07)spruce(S,x,h+1,z,r)}
    else if(biome==='mountains'){if(h<9&&r()<.06)spruce(S,x,h+1,z,r)}
    else if(r()<.035)oak(S,x,h+1,z,r)}
  return S}
function house(r){const S=new Scene(),N=15,pond=r()<.6;
  for(let x=0;x<N;x++)for(let z=0;z<N;z++){S.set(x,-1,z,'dirt');S.set(x,0,z,'grass')}
  if(pond)for(let x=0;x<N;x++)for(let z=0;z<N;z++){if((x-12)**2+(z-12)**2<=6)S.set(x,0,z,'water')}
  const x0=3,x1=10,z0=2,z1=8,wh=4;
  for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++)S.set(x,0,z,'cobble');
  for(let y=1;y<=wh;y++)for(let x=x0;x<=x1;x++)for(let z=z0;z<=z1;z++){
    const ex=x===x0||x===x1,ez=z===z0||z===z1;if(!ex&&!ez)continue;const corner=ex&&ez;let t=corner?'log':'planks';
    if(!corner&&(y===2||y===3)&&((ez&&(x===x0+2||x===x1-2))||(ex&&(z===z0+2||z===z1-2))))t='glass';
    if(z===z1&&x===6&&y<=2)continue;S.set(x,y,z,t)}
  for(let k=0;k<=4;k++){const y=wh+1+k;for(let z=z0-1;z<=z1+1;z++){S.set(x0-1+k,y,z,'roof');S.set(x1+1-k,y,z,'roof')}
    for(let x=x0+k;x<=x1-k;x++){S.setIfEmpty(x,y,z0,'planks');S.setIfEmpty(x,y,z1,'planks')}}
  for(let y=wh+1;y<=wh+6;y++)S.set(x1-1,y,z0+1,'brick');
  for(let z=z1+1;z<N;z++)S.set(6,0,z,'path');
  S.set(7,1,z1+1,'cobble');S.set(7,2,z1+1,'lantern');S.set(5,1,z1+1,'cobble');S.set(5,2,z1+1,'lantern');
  oak(S,1,1,11,r);oak(S,13,1,4,r);if(!pond)oak(S,12,1,12,r);return S}
function tower(r){const S=new Scene(),N=13,c=6,R=3.2,h=13+Math.floor(r()*3);
  for(let x=0;x<N;x++)for(let z=0;z<N;z++){S.set(x,-1,z,'dirt');S.set(x,0,z,r()<.15?'gravel':'grass')}
  for(let x=0;x<N;x++)for(let z=0;z<N;z++){const d=Math.hypot(x-c,z-c);if(d>R+.5)continue;const wall=d>R-.9;
    for(let y=1;y<=h;y++){if(!wall&&y<h)continue;let t=r()<.18?'cobble':'stonebrick';if(wall&&y%4===2&&(x===c||z===c))t='dark';S.set(x,y,z,t)}
    if(wall&&((x+z)%2===0))S.set(x,h+1,z,'stonebrick')}
  for(let y=h-6;y<=h-1;y++)S.set(c,y,c+4,'red');
  S.set(c+4,h+1,c,'lantern');S.set(c-4,h+1,c,'lantern');
  for(let z=c+4;z<N;z++)S.set(c,0,z,'path');oak(S,1,1,10,r);oak(S,11,1,1,r);return S}
function pyramid(r){const S=new Scene(),N=19;
  for(let x=0;x<N;x++)for(let z=0;z<N;z++){S.set(x,-1,z,'sandstone');S.set(x,0,z,'sand')}
  for(let k=0;k<7;k++)for(let x=2+k;x<=12-k;x++)for(let z=2+k;z<=12-k;z++){if(x===2+k||x===12-k||z===2+k||z===12-k||k===6)S.set(x,1+k,z,'sandstone')}
  S.set(7,1,12,'dark');S.set(7,2,12,'dark');S.set(7,7,7,'gold');S.set(7,8,7,'gold');
  for(let x=0;x<N;x++)for(let z=0;z<N;z++){if((x-15)**2+(z-15)**2<=5)S.set(x,0,z,'water')}
  for(const[x,z]of[[13,14],[16,12],[17,17],[12,17]]){const hh=2+Math.floor(r()*2);for(let i=1;i<=hh;i++)S.set(x,i,z,'cactus')}
  oak(S,17,1,14,r);return S}
function portal(r){const S=new Scene(),N=15;
  for(let x=0;x<N;x++)for(let z=0;z<N;z++){const h=r()<.12?1:0;for(let y=-1;y<=h;y++)S.set(x,y,z,'netherrack')}
  for(let x=0;x<N;x++)for(let z=0;z<N;z++){if((x-3)**2+(z-11)**2<=5||(x-12)**2+(z-3)**2<=3)S.set(x,0,z,'lava')}
  for(let x=5;x<=8;x++)for(let y=1;y<=5;y++){const fr=x===5||x===8||y===1||y===5;S.set(x,y,6,fr?'obsidian':'portal')}
  for(let i=0;i<4;i++){const x=1+Math.floor(r()*12),zz=1+Math.floor(r()*12),g=S.get(x,0,zz);if(!g||g[3]===B.lava)continue;const hh=2+Math.floor(r()*3);for(let y=1;y<=hh;y++)S.set(x,y,zz,'netherrack')}
  S.set(10,1,10,'gold');S.set(3,1,4,'lantern');return S}
function characterScene(r){
  const S=buildChar(PRESET_IMGS[Math.floor(r()*4)],{slim:false,pose:r()<.45?'wave':'stand',face:'left'});
  for(let x=-7;x<=14;x++)for(let z=-6;z<=12;z++){S.set(x,-2,z,'dirt');S.set(x,-1,z,r()<.08?'gravel':'grass')}
  S.set(12,0,10,'lantern');oak(S,-5,0,-4,r);return S}
const SCENES={island,house,tower,pyramid,portal,character:characterScene,mountains:r=>terrain(r,'mountains'),plains:r=>terrain(r,'plains'),taiga:r=>terrain(r,'taiga'),desert:r=>terrain(r,'desert')};
const BG_SCENES=[['island','Schwebende Insel','sunset'],['mountains','Berge','day'],['plains','Flusstal','day'],['taiga','Taiga','night'],['desert','Wüste','sunset'],['house','Haus','day'],['tower','Wachturm','night'],['pyramid','Pyramide','sunset'],['portal','Unterwelt','nether']];
const sceneCache=new Map();
function sceneFor(name,seed){const k=name+'|'+seed;let s=sceneCache.get(k);if(!s){if(sceneCache.size>40)sceneCache.clear();s=(SCENES[name]||SCENES.island)(mulberry32(seed));sceneCache.set(k,s)}return s}
