'use strict';
/* ================= Skin-Editor =================
   Skin laden (Spielername oder PNG-Datei) und pixeln: in 2D direkt auf der Textur und in 3D am Modell zum Drehen.
   Werkzeuge: Stift, Textur-Pinsel (leichte Unterschiede in Helligkeit und Sättigung), Radierer, Füllen, Pipette.
   Körperteile und Außenschicht lassen sich ein- und ausblenden, „Spiegeln“ malt links und rechts gleichzeitig. */
const SK_PARTS=[['head','Kopf',[0,0],[32,0],8,8,8],['body','Körper',[16,16],[16,32],8,12,4],['armR','Rechter Arm',[40,16],[40,32],4,12,4],['armL','Linker Arm',[32,48],[48,48],4,12,4],['legR','Rechtes Bein',[0,16],[0,32],4,12,4],['legL','Linkes Bein',[16,48],[0,48],4,12,4]];
const SK_FACE={'1,0,0':'links','-1,0,0':'rechts','0,1,0':'oben','0,-1,0':'unten','0,0,1':'vorne','0,0,-1':'hinten'};
const SK_IC={pen:'<path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="M13.5 7l3.5 3.5"/>',
  noise:'<path d="M4 20l1.2-4.6L15.6 5a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L8.6 18.8z"/><path d="M18 14h.01M21 16h.01M19 19h.01M16 18h.01M21 12.5h.01"/>',
  erase:'<path d="M7 21h12M5.5 15.5l8-8a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L13 17H8.5z"/><path d="M9 12l5 5"/>',
  fill:'<path d="M12 3 3.5 11.5a1.5 1.5 0 0 0 0 2.1l5.9 5.9a1.5 1.5 0 0 0 2.1 0L20 11z"/><path d="M3.5 12.5h16"/><path d="M20 15s2 2.3 2 3.6a2 2 0 0 1-4 0c0-1.3 2-3.6 2-3.6z"/>',
  pick:'<path d="m14 7 3 3M5 19l1.5-.5L17 8a2.1 2.1 0 0 0-3-3L3.5 15.5 3 17z"/><path d="M15 4l5 5"/>',
  rotate:'<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>'};
const SK_TOOLS=[['pen','Stift','B'],['noise','Textur-Pinsel','T'],['erase','Radierer','E'],['fill','Füllen','G'],['pick','Pipette','I'],['rotate','Drehen','R']];
const SK_TIPS=['Tipp: Mit „Spiegeln“ malst du links und rechts gleichzeitig.','Tipp: Wähle oben ein Körperteil, um nur daran zu arbeiten.','Tipp: Der Textur-Pinsel macht Flächen lebendig wie echte Minecraft-Texturen.','Tipp: Die Schattierungen unter der Farbe helfen beim Abdunkeln und Aufhellen.','Tipp: In 2D zoomt das Mausrad oder zwei Finger, Rechtsklick verschiebt.'];
const SK_FOCUS=[['','Alles'],['head','Kopf'],['body','Körper'],['arms','Arme'],['legs','Beine']];
const SK_CAMS=[['front','Vorne',[0,0,1]],['back','Hinten',[0,0,-1]],['left','Links',[1,0,0]],['right','Rechts',[-1,0,0]],['top','Oben',[0,1,.02]]];
const SK_PAL=['#000000','#3c3c3c','#7d7d7d','#c8c8c8','#ffffff','#3b2a1c','#7a4a2a','#b8835a','#e8b98a','#f6d7b8','#c0392b','#e67e22','#f1c40f','#5cb03a','#1e8449','#3498db','#273c9c','#8e44ad','#d35490','#3fb8b8'];
const SK={built:false,cv:null,ctx:null,img:null,name:'Mein Skin',slim:false,tool:'pen',prevTool:'pen',size:1,color:'#3498db',recent:[],nL:.12,nS:.15,nMode:'color',tol:40,base:'#3498db',focus:null,z2:1,p2:[0,0],layer:'auto',sym:false,hide:{},outer:true,inner:true,grid:true,
  hist:[],fut:[],R:null,map:null,stroke:null,view:null,running:false,hover:-1};

/* ---------- Farben ---------- */
const skHex=(r,g,b)=>'#'+[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
const skRGB=h=>{const n=parseInt(String(h||'#000000').slice(1),16);return[n>>16&255,n>>8&255,n&255]};
function skToHSL(r,g,b){r/=255;g/=255;b/=255;const mx=Math.max(r,g,b),mn=Math.min(r,g,b),l=(mx+mn)/2;let h=0,s=0;if(mx!==mn){const d=mx-mn;s=l>.5?d/(2-mx-mn):d/(mx+mn);h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4;h/=6}return[h,s,l]}
function skFromHSL(h,s,l){if(!s)return[l*255,l*255,l*255];const q=l<.5?l*(1+s):l+s-l*s,p=2*l-q,f=t=>{t=(t%1+1)%1;return t<1/6?p+(q-p)*6*t:t<.5?q:t<2/3?p+(q-p)*(2/3-t)*6:p};return[f(h+1/3)*255,f(h)*255,f(h-1/3)*255]}

/* ---------- Skin laden und umwandeln ---------- */
/* Alte 64×32-Skins: linkes Bein und linker Arm werden wie in Minecraft gespiegelt aus den rechten erzeugt */
function skFrom32(src){const c=mk(64,64),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(src,0,0,64,32);
  const mir=(su,sv,du,dv)=>{const w=4,h=12,d=4,f=(sx,sy,fw,fh,dx,dy)=>{x.save();x.translate(dx+fw,dy);x.scale(-1,1);x.drawImage(src,sx,sy,fw,fh,0,0,fw,fh);x.restore()};
    f(su+d,sv,w,d,du+d,dv);f(su+d+w,sv,w,d,du+d+w,dv);f(su+d+w,sv+d,d,h,du,dv+d);f(su+d,sv+d,w,h,du+d,dv+d);f(su,sv+d,d,h,du+d+w,dv+d);f(su+2*d+w,sv+d,w,h,du+2*d+w,dv+d)};
  mir(0,16,16,48);mir(40,16,32,48);return c}
function skNorm(src){const w=src.width||src.naturalWidth,h=src.height||src.naturalHeight;if(w===64&&h===32)return skFrom32(src);const c=mk(64,64),x=c.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(src,0,0,64,64);return c}
function skIsSlim(c){try{return c.getContext('2d').getImageData(54,20,1,1).data[3]===0&&c.getContext('2d').getImageData(55,20,1,1).data[3]===0}catch{return false}}
function skSet(src,name,slim){const c=skNorm(src);if(SK.img&&SK.map){SK.hist.push(SK.img.data.slice());if(SK.hist.length>100)SK.hist.shift()}SK.ctx.clearRect(0,0,64,64);SK.ctx.drawImage(c,0,0);SK.img=SK.ctx.getImageData(0,0,64,64);if(name)SK.name=String(name).slice(0,30);
  const sl=slim==null?skIsSlim(SK.cv):!!slim;SK.fut=[];if(sl!==SK.slim||!SK.map){SK.slim=sl;sk3dModel()}skDirty();skPanels();skSaveCur()}
async function skLoadName(n){n=String(n||'').trim();if(!n)return;try{const r=await fetchSkinByName(n);skSet(r.canvas,n,r.slim);toastAct(`Skin von ${n} geladen.`,'Rückgängig',()=>skUndo(-1))}catch(e){toast(e&&e.message||'Skin nicht gefunden.')}}
function skLoadFile(f){if(!f)return;blobToDataURL(f).then(loadSkinFile).then(c=>{skSet(c,(f.name||'Skin').replace(/\.png$/i,''));toastAct('Skin geladen.','Rückgängig',()=>skUndo(-1))}).catch(e=>toast(e&&e.message||'Der Skin konnte nicht gelesen werden.'))}

/* ---------- Geometrie und Zuordnung Pixel ↔ Körper (für 3D-Malen, Spiegeln, Füllen) ---------- */
function skLayout(){const aw=SK.slim?3:4;return SK_PARTS.map(([k,n,uvI,uvO,w,h,d],i)=>{const W=k.startsWith('arm')?aw:w,px=k==='armR'?-(4+aw/2):k==='armL'?4+aw/2:k==='legR'?-2:k==='legL'?2:0,py=k==='head'?28:k.startsWith('leg')?6:18;
  return{k,n,i,uvI,uvO,w:W,h,d,piv:[px,py,0],sI:[W,h,d],sO:k==='head'?[9,9,9]:[W+.5,h+.5,d+.5]}})}
function skBuildMap(){const L=skLayout(),faceOf=new Int16Array(4096).fill(-1),rects=[],key=new Map(),pix=[];
  for(const p of L)for(const lay of['in','out']){const g=boxGeo({s:lay==='in'?p.sI:p.sO,uv:lay==='in'?p.uvI:p.uvO,d:[p.w,p.h,p.d],r:[0,p.h]},64,64),P=g.attributes.position.array,U=g.attributes.uv.array,N=g.attributes.normal.array;
    for(let f=0;f<6;f++){const v=f*4,x0=Math.round(U[v*2]*64),x1=Math.round(U[(v+1)*2]*64),y0=Math.round((1-U[v*2+1])*64),y1=Math.round((1-U[(v+2)*2+1])*64),n=[N[v*3],N[v*3+1],N[v*3+2]].map(Math.round);
      const id=rects.length;rects.push({x:x0,y:y0,w:x1-x0,h:y1-y0,part:p.i,lay,n:n.join(',')});
      const tl=[P[v*3],P[v*3+1],P[v*3+2]],tr=[P[v*3+3],P[v*3+4],P[v*3+5]],bl=[P[v*3+6],P[v*3+7],P[v*3+8]];
      for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const s=(x+.5-x0)/(x1-x0),t=(y+.5-y0)/(y1-y0),q=y*64+x;faceOf[q]=id;
        const wp=[0,1,2].map(a=>tl[a]+(tr[a]-tl[a])*s+(bl[a]-tl[a])*t+p.piv[a]);pix.push([q,wp,n,lay]);key.set(lay+'|'+wp.map(a=>Math.round(a*4)).join(',')+'|'+n.join(','),q)}}
    g.dispose()}
  const mir=new Int16Array(4096).fill(-1);for(const[q,wp,n,lay]of pix){const k=lay+'|'+[-wp[0],wp[1],wp[2]].map(a=>Math.round(a*4)).join(',')+'|'+[-n[0],n[1],n[2]].join(',');const m=key.get(k);if(m!=null)mir[q]=m}
  SK.map={faceOf,rects,mir,layout:L}}

/* ---------- Werkzeuge ---------- */
function skPx(q){const d=SK.img.data,i=q*4;return[d[i],d[i+1],d[i+2],d[i+3]]}
function skPut(q,r,g,b,a){const d=SK.img.data,i=q*4;d[i]=r;d[i+1]=g;d[i+2]=b;d[i+3]=a}
function skTargets(q){const out=[q],n=SK.size;if(n>1){const x=q%64,y=q/64|0,f=SK.map.faceOf[q],R=f>=0?SK.map.rects[f]:{x:0,y:0,w:64,h:64},o=Math.floor((n-1)/2);out.length=0;
    for(let yy=y-o;yy<y-o+n;yy++)for(let xx=x-o;xx<x-o+n;xx++)if(xx>=R.x&&xx<R.x+R.w&&yy>=R.y&&yy<R.y+R.h)out.push(yy*64+xx)}
  if(SK.sym){for(const t of[...out]){const m=SK.map.mir[t];if(m>=0&&!out.includes(m))out.push(m)}}return out}
function skVary(r,g,b){const[h,s,l]=skToHSL(r,g,b),rnd=()=>Math.random()*2-1;return skFromHSL(h,clamp(s+rnd()*SK.nS,0,1),clamp(l+rnd()*SK.nL,0,1))}
function skFill(q0){const f=SK.map.faceOf[q0],R=f>=0?SK.map.rects[f]:{x:0,y:0,w:64,h:64},st=skPx(q0),[r,g,b]=skRGB(SK.color),same=q=>{const p=skPx(q);if((p[3]>0)!==(st[3]>0))return false;return!st[3]||Math.hypot(p[0]-st[0],p[1]-st[1],p[2]-st[2])<=SK.tol};
  if(st[0]===r&&st[1]===g&&st[2]===b&&st[3]===255)return;const seen=new Uint8Array(4096),stack=[q0];
  while(stack.length){const q=stack.pop();if(seen[q])continue;seen[q]=1;if(!same(q))continue;skPut(q,r,g,b,255);const x=q%64,y=q/64|0;for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const X=x+dx,Y=y+dy;if(X>=R.x&&X<R.x+R.w&&Y>=R.y&&Y<R.y+R.h)stack.push(Y*64+X)}}}
function skApply(q){if(q<0||q>=4096)return;const T=SK.tool;
  if(T==='pick'){const p=skPx(q);if(p[3]>0){skColor(skHex(p[0],p[1],p[2]));skTool(SK.prevTool==='pick'?'pen':SK.prevTool)}else toast('Hier ist kein Pixel.');return}
  if(T==='fill'){skFill(q);if(SK.sym&&SK.map.mir[q]>=0)skFill(SK.map.mir[q]);return}
  const[r,g,b]=skRGB(SK.color);for(const t of skTargets(q)){if(T==='erase'){skPut(t,0,0,0,0);continue}if(T==='pen'){skPut(t,r,g,b,255);continue}
    if(T==='noise'){if(SK.stroke&&SK.stroke.done.has(t))continue;if(SK.stroke)SK.stroke.done.add(t);let base=[r,g,b];if(SK.nMode==='keep'){const p=skPx(t);if(!p[3])continue;base=p}const v=skVary(...base);skPut(t,v[0],v[1],v[2],255)}}}
function skStrokeStart(){SK.hist.push(SK.img.data.slice());if(SK.hist.length>100)SK.hist.shift();SK.fut=[];SK.stroke={done:new Set(),last:-1};if(['pen','noise','fill'].includes(SK.tool))skRecent(SK.color)}
function skStrokeAt(q){const s=SK.stroke;if(!s)return;if(SK.tool==='fill'||SK.tool==='pick'){if(s.last<0)skApply(q);s.last=q;skDirty();return}
  if(s.last>=0&&s.last!==q&&SK.map.faceOf[s.last]===SK.map.faceOf[q]){let x0=s.last%64,y0=s.last/64|0;const x1=q%64,y1=q/64|0,dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy;
    for(;;){skApply(y0*64+x0);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx}if(e2<=dx){e+=dx;y0+=sy}}}else skApply(q);s.last=q;skDirty()}
function skStrokeEnd(){if(!SK.stroke)return;SK.stroke=null;skSaveCur()}
function skUndo(dir){if(dir<0){if(!SK.hist.length)return;SK.fut.push(SK.img.data.slice());SK.img.data.set(SK.hist.pop())}else{if(!SK.fut.length)return;SK.hist.push(SK.img.data.slice());SK.img.data.set(SK.fut.pop())}skDirty();skSaveCur()}

/* ---------- Anzeige: Textur aktualisieren ---------- */
let skDirtyT=0;
function skDirty(){SK.ctx.putImageData(SK.img,0,0);cancelAnimationFrame(skDirtyT);skDirtyT=requestAnimationFrame(()=>{skDisp();sk2d();skUndoUI();liveWake(300)})}
function skDisp(){const R=SK.R;if(!R)return;const x=R.disp.getContext('2d');x.clearRect(0,0,512,512);x.imageSmoothingEnabled=false;x.drawImage(SK.cv,0,0,512,512);
  if(SK.grid){x.strokeStyle='rgba(0,0,0,.2)';x.lineWidth=1;const d=SK.img.data;x.beginPath();for(let q=0;q<4096;q++)if(d[q*4+3]>20){const px=(q%64)*8,py=(q/64|0)*8;x.rect(px+.5,py+.5,7,7)}x.stroke()}
  if(SK.hover>=0&&SK.map&&SK.tool!=='rotate'){const T=SK.tool==='fill'||SK.tool==='pick'?[SK.hover,...(SK.sym&&SK.map.mir[SK.hover]>=0?[SK.map.mir[SK.hover]]:[])]:skTargets(SK.hover);x.lineWidth=2;for(const q of T){const px=(q%64)*8,py=(q/64|0)*8;x.strokeStyle='rgba(0,0,0,.7)';x.strokeRect(px+1,py+1,6,6);x.strokeStyle='#fff';x.strokeRect(px+2,py+2,4,4)}}
  R.tex.needsUpdate=true}
function skUndoUI(){const u=$('#sk-undo'),r=$('#sk-redo');if(u)u.disabled=!SK.hist.length;if(r)r.disabled=!SK.fut.length}

/* ---------- 3D ---------- */
function sk3dInit(){if(SK.R)return;const T=THREE,wrap=$('#sk-3d');let r;try{r=new T.WebGLRenderer({antialias:true})}catch{wrap.append(Object.assign(document.createElement('p'),{className:'sub',textContent:'Dein Browser kann hier kein 3D (WebGL) darstellen.'}));return}
  r.outputEncoding=T.sRGBEncoding;wrap.prepend(r.domElement);const scene=new T.Scene();scene.background=new T.Color(0x24262a);const cam=new T.PerspectiveCamera(30,1,1,600);cam.position.set(30,24,74);
  const ctl=new T.OrbitControls(cam,r.domElement);ctl.target.set(0,16,0);ctl.enableDamping=true;ctl.dampingFactor=.16;ctl.minDistance=16;ctl.maxDistance=140;ctl.mouseButtons={LEFT:T.MOUSE.ROTATE,MIDDLE:T.MOUSE.DOLLY,RIGHT:T.MOUSE.PAN};ctl.addEventListener('change',()=>liveWake(400));
  scene.add(new T.AmbientLight(0xffffff,.78));const d1=new T.DirectionalLight(0xffffff,.42);d1.position.set(25,45,35);scene.add(d1);const d2=new T.DirectionalLight(0xffffff,.16);d2.position.set(-30,10,-25);scene.add(d2);
  const disp=mk(512,512),tex=new T.CanvasTexture(disp);tex.magFilter=T.NearestFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.encoding=T.sRGBEncoding;tex.anisotropy=Math.min(8,r.capabilities.getMaxAnisotropy());
  const matI=new T.MeshLambertMaterial({map:tex,alphaTest:.08}),matO=new T.MeshLambertMaterial({map:tex,transparent:true,alphaTest:.08,side:T.DoubleSide,depthWrite:false});
  SK.R={r,scene,cam,ctl,disp,tex,matI,matO,group:null,ray:new T.Raycaster(),v2:new T.Vector2()};sk3dModel();sk3dEvents();
  if(window.ResizeObserver)new ResizeObserver(()=>{sk3dSize();sk2dSize()}).observe(wrap);sk3dSize()}
function sk3dModel(){skBuildMap();const R=SK.R;if(!R)return;const T=THREE;if(R.group){R.scene.remove(R.group);R.group.traverse(o=>{if(o.geometry)o.geometry.dispose()})}const G=new T.Group();
  for(const p of SK.map.layout){const g=new T.Group();g.position.set(...p.piv);for(const lay of['in','out']){const m=new T.Mesh(boxGeo({s:lay==='in'?p.sI:p.sO,uv:lay==='in'?p.uvI:p.uvO,d:[p.w,p.h,p.d],r:[0,p.h]},64,64),lay==='in'?R.matI:R.matO);m.userData={part:p.i,lay};m.renderOrder=lay==='out'?1:0;g.add(m)}G.add(g)}
  R.group=G;R.scene.add(G);sk3dVis();skDisp();liveWake(300)}
function sk3dVis(){const R=SK.R;if(!R||!R.group)return;R.group.traverse(o=>{if(o.isMesh){const p=SK_PARTS[o.userData.part][0];o.visible=!SK.hide[p]&&skInFocus(p)&&(o.userData.lay==='in'?SK.inner:SK.outer)}});liveWake(300);sk2d()}
function sk3dSize(){const R=SK.R;if(!R)return;const w=$('#sk-3d').clientWidth,h=$('#sk-3d').clientHeight;if(!w||!h)return;R.r.setPixelRatio(Math.min(2,window.devicePixelRatio||1,Math.sqrt(3.5e6/(w*h))));R.r.setSize(w,h,false);R.cam.aspect=w/h;R.cam.updateProjectionMatrix();liveWake(300)}
/* Pixel unter dem Zeiger: oberste sichtbare Schicht; durchsichtige Außen-Pixel werden durchgereicht (außer „Außen“ ist gewählt) */
function sk3dHit(e){const R=SK.R,c=R.r.domElement,b=c.getBoundingClientRect();R.v2.set((e.clientX-b.left)/b.width*2-1,-((e.clientY-b.top)/b.height)*2+1);R.ray.setFromCamera(R.v2,R.cam);
  const meshes=[];R.group.traverse(o=>{if(o.isMesh&&o.visible)meshes.push(o)});const hits=R.ray.intersectObjects(meshes,false);
  for(const h of hits){const lay=h.object.userData.lay;if(SK.layer==='in'&&lay==='out')continue;if(SK.layer==='out'&&lay==='in')continue;if(!h.uv)continue;
    const q=clamp(Math.floor((1-h.uv.y)*64),0,63)*64+clamp(Math.floor(h.uv.x*64),0,63);if(lay==='out'&&SK.layer==='auto'&&skPx(q)[3]<20)continue;return q}return-1}
/* Malen am Modell: Ereignisse werden schon am Container abgefangen, bevor die Kamerasteuerung sie sieht */
function sk3dEvents(){const R=SK.R,c=R.r.domElement,w=$('#sk-3d');let id=null;c.style.touchAction='none';
  w.addEventListener('pointerdown',e=>{if(e.target!==c||SK.tool==='rotate'||e.button!==0||id!=null)return;const q=sk3dHit(e);if(q<0)return;e.stopPropagation();e.preventDefault();id=e.pointerId;try{c.setPointerCapture(id)}catch{}skStrokeStart();skStrokeAt(q)},{capture:true});
  w.addEventListener('pointermove',e=>{if(e.target!==c)return;if(id!=null&&e.pointerId===id){e.stopPropagation();const q=sk3dHit(e);if(q>=0)skStrokeAt(q);return}if(e.buttons)return;const q=sk3dHit(e);skHover(q);c.style.cursor=q>=0&&SK.tool!=='rotate'?'crosshair':'grab'},{capture:true});
  const up=e=>{if(id==null||e.pointerId!==id)return;e.stopPropagation();id=null;skStrokeEnd()};w.addEventListener('pointerup',up,{capture:true});w.addEventListener('pointercancel',up,{capture:true});
  /* Touch: ein Finger auf dem Modell malt (Kamera bleibt stehen), zwei Finger drehen/zoomen */
  w.addEventListener('touchstart',e=>{if(id==null)return;if(e.touches.length>1){id=null;skStrokeEnd();return}e.stopPropagation()},{capture:true,passive:true});
  w.addEventListener('touchmove',e=>{if(id!=null)e.stopPropagation()},{capture:true,passive:true});
  c.addEventListener('pointerleave',()=>skHover(-1))}
function skLoop(now){if(view!=='skin'){SK.running=false;return}requestAnimationFrame(skLoop);const R=SK.R;if(!R||!liveFrame('sk',now,!!SK.camA))return;
  if(SK.camA){const A=SK.camA,u=clamp((now-A.t0)/A.d,0,1),e=u<.5?2*u*u:1-Math.pow(-2*u+2,2)/2;R.cam.position.lerpVectors(A.p0,A.p1,e);R.ctl.target.lerpVectors(A.c0,A.c1,e);if(u>=1)SK.camA=null}
  R.ctl.update();R.r.render(R.scene,R.cam)}
/* Kamera weich zu Blickrichtung/Ziel fahren */
function skCamTo(dir,target,dist){const R=SK.R;if(!R)return;const T=THREE,c1=target?new T.Vector3(...target):R.ctl.target.clone(),d=dist||R.cam.position.distanceTo(R.ctl.target);
  const v=dir?new T.Vector3(...dir).normalize():R.cam.position.clone().sub(R.ctl.target).normalize();SK.camA={t0:performance.now(),d:420,p0:R.cam.position.clone(),p1:c1.clone().add(v.multiplyScalar(d)),c0:R.ctl.target.clone(),c1};liveWake(600)}
function skCam(k){const c=SK_CAMS.find(x=>x[0]===k);if(c)skCamTo(c[2])}
/* Körperteil-Fokus: nur dieses Teil zeigen, Kamera und 2D-Ansicht darauf ausrichten */
function skFocusParts(){return{head:['head'],body:['body'],arms:['armR','armL'],legs:['legR','legL']}[SK.focus]||SK_PARTS.map(p=>p[0])}
function skInFocus(p){return!SK.focus||skFocusParts().includes(p)}
function skFocus(f){SK.focus=f||null;document.querySelectorAll('#sk-focus button').forEach(b=>b.setAttribute('aria-pressed',(b.dataset.f||'')===(f||'')));sk3dVis();
  const T={'':[[0,16,0],74],head:[[0,28,0],30],body:[[0,18,0],38],arms:[[0,18,0],44],legs:[[0,6,0],40]}[f||''];skCamTo(null,T[0],T[1]);sk2dFit()}

/* ---------- 2D ---------- */
function sk2dSize(){const w=$('#sk-2d'),c=$('#sk-2dcv');if(!w||!c)return;const W=w.clientWidth,H=w.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);if(!W||!H)return;c.style.width=W+'px';c.style.height=H+'px';c.width=Math.round(W*dpr);c.height=Math.round(H*dpr);sk2d()}
function sk2dGeo(){const c=$('#sk-2dcv'),fz=Math.min(c.width,c.height)*.96/64,z=Math.max(1,Math.round(fz*SK.z2)),fc=SK.f2||[32,32];return{c,z,ox:Math.round(c.width/2-fc[0]*z+SK.p2[0]),oy:Math.round(c.height/2-fc[1]*z+SK.p2[1])}}
function sk2dFit(){SK.z2=1;SK.p2=[0,0];SK.f2=null;if(SK.focus){const k=skFocusParts();let a=64,b=64,c=0,d=0;for(const R of SK.map.rects)if(k.includes(SK_PARTS[R.part][0])){a=Math.min(a,R.x);b=Math.min(b,R.y);c=Math.max(c,R.x+R.w);d=Math.max(d,R.y+R.h)}SK.f2=[(a+c)/2,(b+d)/2];SK.z2=Math.min(5,Math.max(1,.9*64/Math.max(c-a,d-b)))}sk2d()}
function sk2d(){const c=$('#sk-2dcv');if(!c||!c.width||!SK.map)return;const x=c.getContext('2d'),{z,ox,oy}=sk2dGeo();x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,c.width,c.height);
  for(const R of SK.map.rects){const hid=SK.hide[SK_PARTS[R.part][0]]||!skInFocus(SK_PARTS[R.part][0])||(R.lay==='in'?!SK.inner:!SK.outer);for(let yy=0;yy<R.h;yy++)for(let xx=0;xx<R.w;xx++){x.fillStyle=(R.x+xx+R.y+yy)%2?'#3a3d42':'#30333a';x.fillRect(ox+(R.x+xx)*z,oy+(R.y+yy)*z,z,z)}if(hid){x.fillStyle='rgba(0,0,0,.35)';x.fillRect(ox+R.x*z,oy+R.y*z,R.w*z,R.h*z)}}
  x.imageSmoothingEnabled=false;x.drawImage(SK.cv,ox,oy,64*z,64*z);
  if(SK.grid&&z>=6){x.strokeStyle='rgba(0,0,0,.18)';x.lineWidth=1;x.beginPath();for(let i=0;i<=64;i++){x.moveTo(ox+i*z+.5,oy);x.lineTo(ox+i*z+.5,oy+64*z);x.moveTo(ox,oy+i*z+.5);x.lineTo(ox+64*z,oy+i*z+.5)}x.stroke()}
  x.strokeStyle='rgba(255,255,255,.28)';x.lineWidth=Math.max(1,z/8);for(const R of SK.map.rects)x.strokeRect(ox+R.x*z+.5,oy+R.y*z+.5,R.w*z-1,R.h*z-1);
  if(SK.hover>=0){const T=SK.tool==='fill'||SK.tool==='pick'?[SK.hover,...(SK.sym&&SK.map.mir[SK.hover]>=0?[SK.map.mir[SK.hover]]:[])]:skTargets(SK.hover);x.lineWidth=Math.max(1.5,z/6);for(const q of T){x.strokeStyle='rgba(0,0,0,.6)';x.strokeRect(ox+(q%64)*z-1,oy+(q/64|0)*z-1,z+2,z+2);x.strokeStyle='#fff';x.strokeRect(ox+(q%64)*z,oy+(q/64|0)*z,z,z)}}}
function sk2dEvents(){const c=$('#sk-2dcv');let id=null;const pts=new Map();let pin=null;
  c.addEventListener('wheel',e=>{e.preventDefault();const b=c.getBoundingClientRect(),k=c.width/b.width,mx=(e.clientX-b.left)*k,my=(e.clientY-b.top)*k,g=sk2dGeo(),u=(mx-g.ox)/g.z,v=(my-g.oy)/g.z;SK.z2=clamp(SK.z2*(e.deltaY<0?1.15:1/1.15),.6,8);const g2=sk2dGeo();SK.p2=[SK.p2[0]+mx-(g2.ox+u*g2.z),SK.p2[1]+my-(g2.oy+v*g2.z)];sk2d()},{passive:false});
  c.addEventListener('pointerdown',e=>{pts.set(e.pointerId,[e.clientX,e.clientY]);if(pts.size===2){if(id!=null){id=null;skStrokeEnd();skUndo(-1)}const[a,b]=[...pts.values()];pin={d:Math.hypot(a[0]-b[0],a[1]-b[1]),z:SK.z2,c:[(a[0]+b[0])/2,(a[1]+b[1])/2],p:[...SK.p2]};return}if(e.button===2||e.button===1){pin={pan:[e.clientX,e.clientY],p:[...SK.p2]};e.preventDefault()}},true);
  c.addEventListener('pointermove',e=>{if(!pts.has(e.pointerId))return;pts.set(e.pointerId,[e.clientX,e.clientY]);const k=c.width/c.getBoundingClientRect().width;
    if(pin&&pin.pan){SK.p2=[pin.p[0]+(e.clientX-pin.pan[0])*k,pin.p[1]+(e.clientY-pin.pan[1])*k];sk2d();e.stopImmediatePropagation();return}
    if(pin&&pts.size===2){const[a,b]=[...pts.values()],d=Math.hypot(a[0]-b[0],a[1]-b[1]),cx=(a[0]+b[0])/2,cy=(a[1]+b[1])/2;SK.z2=clamp(pin.z*d/Math.max(10,pin.d),.6,8);SK.p2=[pin.p[0]+(cx-pin.c[0])*k,pin.p[1]+(cy-pin.c[1])*k];sk2d();e.stopImmediatePropagation()}},true);
  const rel=e=>{pts.delete(e.pointerId);if(pts.size<2&&pin&&!pin.pan)pin=null;if(pin&&pin.pan&&!pts.size)pin=null};c.addEventListener('pointerup',rel,true);c.addEventListener('pointercancel',rel,true);c.addEventListener('contextmenu',e=>e.preventDefault());const at=e=>{const b=c.getBoundingClientRect(),{z,ox,oy}=sk2dGeo(),k=c.width/b.width,px=Math.floor(((e.clientX-b.left)*k-ox)/z),py=Math.floor(((e.clientY-b.top)*k-oy)/z);return px<0||py<0||px>63||py>63?-1:py*64+px};
  c.addEventListener('pointerdown',e=>{if(e.button!==0||id!=null||pts.size>1)return;const q=at(e);if(q<0)return;if(SK.tool==='rotate')skTool('pen');e.preventDefault();id=e.pointerId;try{c.setPointerCapture(id)}catch{}skStrokeStart();skStrokeAt(q)});
  c.addEventListener('pointermove',e=>{const q=at(e);skHover(q);if(id!=null&&e.pointerId===id&&q>=0)skStrokeAt(q)});
  const up=e=>{if(id==null||e.pointerId!==id)return;id=null;skStrokeEnd()};c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);c.addEventListener('pointerleave',()=>skHover(-1))}
function skHover(q){if(SK.hover===q)return;SK.hover=q;sk2d();skDisp();liveWake(200);const st=$('#sk-status');if(!st)return;if(q<0||!SK.map){st.textContent=tr(SK_TIPS[(Date.now()/6000|0)%SK_TIPS.length]);return}const f=SK.map.faceOf[q];
  st.textContent=f<0?tr('Ungenutzter Bereich')+` · ${q%64}, ${q/64|0}`:`${tr(SK_PARTS[SK.map.rects[f].part][1])} (${tr(SK.map.rects[f].lay==='in'?'innen':'außen')}) · ${tr(SK_FACE[SK.map.rects[f].n]||'')} · ${q%64}, ${q/64|0}`}

function skUndoToast(n){toastAct(tr('Geöffnet:')+' '+tr(n),'Rückgängig',()=>skUndo(-1))}
/* ---------- Speichern, Verwenden ---------- */
let skSaveT=0;function skSaveCur(){clearTimeout(skSaveT);const st=$('#sk-state');if(st)st.textContent=tr('Speichert…');skSaveT=setTimeout(()=>{store.set('sk-cur',{name:SK.name,slim:SK.slim,data:SK.cv.toDataURL('image/png')});if(st)st.textContent=tr('Automatisch gesichert')},400)}
function skList(){const a=store.get('sk-list',[]);return Array.isArray(a)?a.filter(s=>s&&s.data):[]}
function skSave(){const a=skList(),data=SK.cv.toDataURL('image/png'),i=a.findIndex(s=>s.name===SK.name);const e={id:i>=0?a[i].id:'s'+uid(),name:SK.name,slim:SK.slim,data,t:Date.now()};if(i>=0)a.splice(i,1);a.unshift(e);if(!store.set('sk-list',a.slice(0,60))){toast('Speichern hat nicht geklappt: zu wenig Platz.');return}skLeft();toast('Gespeichert unter „Meine Skins“.')}
function skDownload(){canvasBlob(SK.cv,'image/png').then(b=>saveFile((SK.name||'skin').replace(/[^\w\-äöüÄÖÜß ]+/g,'').trim().replace(/\s+/g,'-')+'.png',b)).catch(()=>toast('Das hat nicht geklappt.'))}
function skUseStudio(){const data=SK.cv.toDataURL('image/png'),c=mk(64,64);c.getContext('2d').drawImage(SK.cv,0,0);USER_SKINS.push({name:SK.name,data});if(USER_SKINS.length>12){USER_SKINS.shift();userSkinCanvas.shift()}store.set('rk-skins',USER_SKINS);const i=USER_SKINS.length-1;userSkinCanvas[i]=c;
  location.hash='renders';setTimeout(()=>{const m=typeof curModel==='function'&&curModel();if(m){m.skin='u'+i;m.slim=SK.slim;m.name=SK.name;buildModel(m);stCommit();buildModelsBar()}if(typeof buildSide3==='function')buildSide3();toast('Skin im Pose-Studio übernommen.')},500)}
async function skUseAnim(){const data=SK.cv.toDataURL('image/png');location.hash='animation';for(let i=0;i<60&&!(typeof AN!=='undefined'&&AN.ready);i++)await new Promise(r=>setTimeout(r,100));if(!AN.ready){toast('Die Animation konnte nicht geöffnet werden.');return}
  if(typeof anHome==='function')anHome(false);await anAddActor(SK.name,data,SK.slim);toast('Figur mit deinem Skin hinzugefügt.')}
async function skUseVideo(){const data=SK.cv.toDataURL('image/png');location.hash='video';await veStart();if(!VE.p)veNew('9:16',SK.name);veAddChar({name:SK.name,skin:data,slim:SK.slim});toast('Figur mit deinem Skin ins Video eingefügt.')}
function skUseMenu(btn){showMenu(btn,[['Im Pose-Studio verwenden',skUseStudio],['In einer Animation verwenden',skUseAnim],['Im Video verwenden',skUseVideo],null,['Als PNG herunterladen',skDownload]])}

/* ---------- Oberfläche ---------- */
const skEl=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
function skSec(P,t,sub){const s=skEl('section','an-sec');if(t)s.append(skEl('h4',null,t));if(sub)s.append(skEl('p','sub',sub));const b=skEl('div','stack');s.append(b);P.append(s);return b}
function skSeg(P,label,opts,get,set){const w=skEl('div','field');if(label){const l=skEl('div','lab');l.append(skEl('span',null,label));w.append(l)}const g=skEl('div','seg');for(const[v,n]of opts){const b=skEl('button',null,n);b.type='button';b.setAttribute('aria-pressed',String(get())===String(v));b.addEventListener('click',()=>{set(v);g.querySelectorAll('button').forEach(z=>z.setAttribute('aria-pressed',z===b))});g.append(b)}w.append(g);P.append(w);return w}
function skRange(P,label,min,max,step,get,set,fmt){const w=skEl('div','field'),id='sk-'+uid();w.innerHTML=`<div class="lab"><label for="${id}"></label><output></output></div><input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;w.querySelector('label').textContent=label;const i=w.querySelector('input'),o=w.querySelector('output');i.value=get();o.textContent=fmt(+i.value);i.addEventListener('input',()=>{set(+i.value);o.textContent=fmt(+i.value)});P.append(w);return w}
function skCheck(P,label,get,set){const l=skEl('label','row check');l.innerHTML='<input type="checkbox"><span></span>';l.querySelector('span').textContent=label;const i=l.querySelector('input');i.checked=!!get();i.addEventListener('change',()=>set(i.checked));P.append(l);return l}
function skTool(t){if(t!=='pick')SK.prevTool=t;SK.tool=t;document.querySelectorAll('#sk-tools button,#sk-dock [data-t]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===t));const nz=$('#sk-noise');if(nz)nz.hidden=t!=='noise';const fo=$('#sk-fillopt');if(fo)fo.hidden=t!=='fill';const c=SK.R&&SK.R.r.domElement;if(c)c.style.cursor=t==='rotate'?'grab':'crosshair'}
function skColor(h,base=true){SK.color=h;if(base)SK.base=h;document.querySelectorAll('.sk-col').forEach(i=>{i.value=h});document.querySelectorAll('.sk-cur').forEach(sw=>{sw.style.background=h});skShades()}
/* Schattierungen der Grundfarbe: dunkler (etwas satter) bis heller, wie man sie zum Schattieren braucht */
function skShades(){const[h,s,l]=skToHSL(...skRGB(SK.base));document.querySelectorAll('.sk-shades').forEach(g=>{g.innerHTML='';for(const d of[-.27,-.18,-.09,0,.09,.18,.27]){const c=skHex(...skFromHSL((h-d*.04+1)%1,clamp(s+(d<0?-d*.25:-d*.3),0,1),clamp(l+d,0,1))),b=skEl('button','sk-sw'+(c===SK.color?' on':''));b.type='button';b.style.background=c;b.title=c;b.setAttribute('aria-label',(d<0?tr('dunkler'):d>0?tr('heller'):tr('Grundfarbe'))+' '+c);b.addEventListener('click',()=>skColor(c,false));g.append(b)}})}
function skRecent(h){if(h)SK.recent=[h,...SK.recent.filter(x=>x!==h)].slice(0,10);document.querySelectorAll('.sk-recent').forEach(r=>{r.innerHTML='';for(const c of SK.recent){const b=skEl('button','sk-sw');b.type='button';b.style.background=c;b.title=c;b.setAttribute('aria-label',c);b.addEventListener('click',()=>skColor(c));r.append(b)}})}
/* Farbauswahl: aktuelle Farbe, Schattierungen, Palette, zuletzt benutzt */
function skColorUI(s){const r=skEl('div','sk-colrow');const cur=skEl('span','sk-cur');const i=document.createElement('input');i.type='color';i.className='sk-col';i.value=SK.color;i.setAttribute('aria-label',tr('Farbe wählen'));i.addEventListener('input',()=>skColor(i.value));r.append(cur,i);s.append(r);
  s.append(skEl('p','sub sk-rlab','Schattierungen'));s.append(skEl('div','sk-pal sk-shades'));
  s.append(skEl('p','sub sk-rlab','Palette'));const g=skEl('div','sk-pal');for(const c of SK_PAL){const b=skEl('button','sk-sw');b.type='button';b.style.background=c;b.title=c;b.setAttribute('aria-label',c);b.addEventListener('click',()=>skColor(c));g.append(b)}s.append(g);
  s.append(skEl('p','sub sk-rlab','Zuletzt benutzt'));s.append(skEl('div','sk-pal sk-recent'))}
function skLeft(){const P=$('#sk-left');if(!P)return;P.innerHTML='';let s=skSec(P,'Skin laden');
  const f=skEl('form','btnrow');f.innerHTML='<input class="ve-in" type="text" maxlength="16" autocomplete="off" spellcheck="false" placeholder="Minecraft-Name" aria-label="Minecraft-Name"><button class="btn sm primary" type="submit">Laden</button>';f.addEventListener('submit',e=>{e.preventDefault();skLoadName(f.querySelector('input').value)});s.append(f);
  if(!window.RK_LOCAL)s.append(skEl('p','sub','Laden per Name geht in der AGG-Games-Fassung und in der Mac-App.'));
  {const r=skEl('div','btnrow');const b=skEl('button','btn sm','Skin-Datei (PNG) hochladen');b.type='button';b.addEventListener('click',()=>{const i=document.createElement('input');i.type='file';i.accept='image/png';i.addEventListener('change',()=>skLoadFile(i.files[0]));i.click()});r.append(b);s.append(r)}
  s=skSec(P,'Neu anfangen');{const g=skEl('div','sk-new');PRESETS.forEach((p,i)=>{const b=skEl('button','sk-skin');b.type='button';b.title=p.name;const c=paintSkin(p,i),t=mk(32,32),x=t.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,8,8,8,8,0,0,32,32);x.drawImage(c,40,8,8,8,0,0,32,32);b.append(t,skEl('span',null,p.name));b.addEventListener('click',()=>{skSet(c,p.name,false);skUndoToast(p.name)});g.append(b)});
    const b=skEl('button','sk-skin');b.type='button';const t=mk(32,32);b.append(t,skEl('span',null,'Leer'));b.addEventListener('click',()=>{const c=mk(64,64);skSet(c,'Neuer Skin',SK.slim);skUndoToast('Leer')});g.append(b);s.append(g)}
  s=skSec(P,'Arme');skSeg(s,null,[[0,'Klassisch (4 px)'],[1,'Schmal (3 px)']],()=>SK.slim?1:0,v=>{SK.slim=!!+v;sk3dModel();sk2d();skSaveCur()});
  const L=skList();s=skSec(P,'Meine Skins',L.length?null:'Noch keine gespeicherten Skins. Oben auf „Speichern“ tippen.');if(L.length){const g=skEl('div','sk-new');for(const e of L){const w=skEl('div','sk-mine');const b=skEl('button','sk-skin');b.type='button';b.title=e.name;const t=mk(32,32);loadImage(e.data).then(im=>{const x=t.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(im,8,8,8,8,0,0,32,32);x.drawImage(im,40,8,8,8,0,0,32,32)}).catch(()=>{});
      b.append(t,skEl('span',null,e.name));b.addEventListener('click',()=>loadImage(e.data).then(im=>{skSet(im,e.name,e.slim);skUndoToast(e.name)}));const d=skEl('button','sk-del','×');d.type='button';d.setAttribute('aria-label',e.name+' löschen');d.addEventListener('click',()=>{store.set('sk-list',skList().filter(x=>x.id!==e.id));skLeft()});w.append(b,d);g.append(w)}s.append(g)}}
function skRight(){const P=$('#sk-right');if(!P)return;P.innerHTML='';let s=skSec(P,'Werkzeug');const tb=skEl('div','sk-tools');tb.id='sk-tools';
  for(const[k,n,key]of SK_TOOLS){const b=skEl('button');b.type='button';b.dataset.t=k;b.title=tr(n)+' ('+key+')';b.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${SK_IC[k]}</svg><span></span>`;b.querySelector('span').textContent=n;b.addEventListener('click',()=>skTool(k));tb.append(b)}s.append(tb);
  skSeg(s,'Pinselgröße',[[1,'1 px'],[2,'2 px'],[3,'3 px']],()=>SK.size,v=>{SK.size=+v});
  const nz=skEl('div','stack sk-noise');nz.id='sk-noise';nz.append(skEl('p','sub','Malt mit leichten Unterschieden, so wirkt die Fläche wie echte Minecraft-Textur.'));skRange(nz,'Helligkeit',0,.35,.01,()=>SK.nL,v=>{SK.nL=v},v=>'± '+Math.round(v*100)+' %');skRange(nz,'Sättigung',0,.5,.01,()=>SK.nS,v=>{SK.nS=v},v=>'± '+Math.round(v*100)+' %');
  skSeg(nz,'Malt',[['color','Gewählte Farbe'],['keep','Vorhandene Pixel']],()=>SK.nMode,v=>{SK.nMode=v});s.append(nz);
  const fo=skEl('div','stack sk-noise');fo.id='sk-fillopt';skRange(fo,'Toleranz',0,120,1,()=>SK.tol,v=>{SK.tol=v},v=>v?Math.round(v/1.2)+' %':'genau');fo.append(skEl('p','sub','Füllt zusammenhängende, ähnliche Farben auf einer Seite des Körperteils.'));s.append(fo);
  s=skSec(P,'Farbe');s.parentElement.classList.add('sk-colsec');skColorUI(s);
  s=skSec(P,'Malen');skCheck(s,'Spiegeln (links und rechts gleichzeitig)',()=>SK.sym,v=>{SK.sym=v;sk2d()});skSeg(s,'Malen auf',[['auto','Automatisch'],['in','Innen'],['out','Außen']],()=>SK.layer,v=>{SK.layer=v});
  s=skSec(P,'Anzeigen');const g=skEl('div','sk-parts');for(const[k,n]of SK_PARTS)skCheck(g,n,()=>!SK.hide[k],v=>{SK.hide[k]=!v;sk3dVis()});s.append(g);
  skCheck(s,'Innere Schicht',()=>SK.inner,v=>{SK.inner=v;sk3dVis()});skCheck(s,'Äußere Schicht (Hut, Jacke …)',()=>SK.outer,v=>{SK.outer=v;sk3dVis()});skCheck(s,'Pixelraster',()=>SK.grid,v=>{SK.grid=v;skDisp();sk2d();liveWake(300)});
  skTool(SK.tool);skColor(SK.color,false);skRecent(SK.recent.length?null:SK.color);skDock()}
function skPanels(){skLeft();const n=$('#sk-name');if(n)n.querySelector('span').textContent=SK.name;skUndoUI()}
function skViewMode(v){SK.view=v;const r=$('#v-skin .sk');if(r)r.dataset.view=v;document.querySelectorAll('#sk-vtabs button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));setTimeout(()=>{sk3dSize();sk2dSize()},30)}
function skBuild(){if(SK.built)return;SK.built=true;const root=$('#v-skin');
  root.innerHTML=`<div class="sk"><header class="ve-top sk-top"><button class="ve-name" id="sk-name" type="button" aria-haspopup="menu"><span></span><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button><span class="hstat" id="sk-state" role="status"></span><span class="grow"></span><button class="btn ghost sm icon" id="sk-help" type="button" aria-label="Rundgang starten" title="Rundgang starten"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.6 2.2-2.6 3.8M12 17.2h.01"/></svg></button>
    <button class="btn ghost sm icon" id="sk-undo" type="button" aria-label="Rückgängig" title="Rückgängig (⌘Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button><button class="btn ghost sm icon" id="sk-redo" type="button" aria-label="Wiederholen" title="Wiederholen (⇧⌘Z)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg></button>
    <button class="btn sm" id="sk-save" type="button">Speichern</button><button class="btn primary" id="sk-use" type="button" aria-haspopup="menu">Verwenden</button></header>
    <div class="sk-main"><aside class="sk-left an-side" id="sk-left"></aside><div class="sk-center"><div class="sk-bar"><div class="seg sk-vtabs" id="sk-vtabs" aria-label="Ansicht"><button type="button" data-v="3d">3D</button><button type="button" data-v="2d">2D</button><button type="button" data-v="both">Beides</button></div>
      <div class="seg sk-focus" id="sk-focus" aria-label="Körperteil">${SK_FOCUS.map(([k,n])=>`<button type="button" data-f="${k}" aria-pressed="${!k}">${n}</button>`).join('')}</div>
      <div class="seg sk-cams" id="sk-cams" aria-label="Blickrichtung">${SK_CAMS.map(([k,n])=>`<button type="button" data-c="${k}">${n}</button>`).join('')}</div></div>
      <div class="sk-views"><div class="sk-pane sk-3d" id="sk-3d"><p class="sk-hint">Ziehen auf dem Modell malt · daneben ziehen dreht · Mausrad oder zwei Finger zoomen</p></div><div class="sk-pane sk-2d" id="sk-2d"><canvas id="sk-2dcv" aria-label="Skin-Textur"></canvas><button type="button" class="btn sm sk-fit" id="sk-fit" title="Ganze Textur zeigen">Einpassen</button></div></div><div class="sk-status" id="sk-status" role="status"></div></div>
      <aside class="sk-right an-side" id="sk-right"></aside></div><nav class="sk-dock" id="sk-dock" aria-label="Werkzeuge"></nav><div class="sk-colsheet" id="sk-colsheet" hidden></div></div>`;
  SK.cv=mk(64,64);SK.ctx=SK.cv.getContext('2d',{willReadFrequently:true});
  $('#sk-undo').addEventListener('click',()=>skUndo(-1));$('#sk-redo').addEventListener('click',()=>skUndo(1));$('#sk-save').addEventListener('click',skSave);$('#sk-use').addEventListener('click',e=>{e.stopPropagation();skUseMenu(e.currentTarget)});
  $('#sk-name').addEventListener('click',async()=>{const n=await askText('Name des Skins',SK.name,{ok:'Umbenennen'});if(n){SK.name=n.slice(0,30);skPanels();skSaveCur()}});
  $('#sk-vtabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)skViewMode(b.dataset.v)});
  $('#sk-focus').addEventListener('click',e=>{const b=e.target.closest('button');if(b)skFocus(b.dataset.f)});$('#sk-cams').addEventListener('click',e=>{const b=e.target.closest('button');if(b)skCam(b.dataset.c)});
  $('#sk-fit').addEventListener('click',sk2dFit);$('#sk-help').addEventListener('click',()=>skTour(true));
  document.addEventListener('keydown',e=>{if(view!=='skin')return;const t=e.target;if(t.closest&&t.closest('input,textarea,select'))return;const mod=e.metaKey||e.ctrlKey,k=e.key.toLowerCase();
    if(mod&&k==='z'){e.preventDefault();skUndo(e.shiftKey?1:-1);return}if(mod)return;const m={b:'pen',t:'noise',e:'erase',g:'fill',i:'pick',r:'rotate'}[k];if(m){skTool(m);return}if(k==='m'){SK.sym=!SK.sym;skRight();toast(SK.sym?'Spiegeln an':'Spiegeln aus')}if(['1','2','3'].includes(k)){SK.size=+k;skRight()}});
  $('#sk-dock').addEventListener('click',skDockClick);
  const cur=store.get('sk-cur',null),start=()=>{skBuildMap();sk3dInit();sk2dEvents();skRight();skPanels();skViewMode(SK.view||(matchMedia('(max-width:980px)').matches?'3d':'both'))};
  SK.img=SK.ctx.getImageData(0,0,64,64);
  if(cur&&/^data:image\/png;base64,/.test(cur.data||''))loadImage(cur.data).then(im=>{SK.ctx.drawImage(im,0,0);SK.img=SK.ctx.getImageData(0,0,64,64);SK.name=cur.name||SK.name;SK.slim=!!cur.slim;start();skDirty()}).catch(()=>{skSet(paintSkin(PRESETS[0],0),PRESETS[0].name,false);start()});
  else{const c=paintSkin(PRESETS[0],0);SK.ctx.drawImage(c,0,0);SK.img=SK.ctx.getImageData(0,0,64,64);SK.name=PRESETS[0].name;start();skDirty()}}
function skStart(){skBuild();if(!SK.running){SK.running=true;requestAnimationFrame(skLoop)}setTimeout(()=>{sk3dSize();sk2dSize();liveWake(500)},30);setTimeout(()=>{if(view==='skin')skTour(false)},900)}
/* Werkzeugleiste unten (Handy, iPad): Werkzeuge, Farbe, Größe, Spiegeln, Außenschicht, Rückgängig */
function skDock(){const d=$('#sk-dock');if(!d)return;const I=(k,ic,label,on)=>`<button type="button" data-k="${k}"${on!=null?` aria-pressed="${on}"`:''} title="${label}"><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg><span>${label}</span></button>`;
  const T=k=>{const[,n]=SK_TOOLS.find(t=>t[0]===k);return`<button type="button" data-t="${k}" aria-pressed="${SK.tool===k}" title="${tr(n)}"><svg viewBox="0 0 24 24" aria-hidden="true">${SK_IC[k]}</svg><span>${tr(n)}</span></button>`};
  /* Reihenfolge nach Häufigkeit: Malen, Farbe, dann Hilfen; Drehen zuletzt (Ziehen neben dem Modell dreht ohnehin) */
  d.innerHTML=T('pen')+T('noise')+T('erase')+`<button type="button" data-k="col" class="sk-dcol" title="${tr('Farbe')}"><span class="sk-cur"></span><span>${tr('Farbe')}</span></button>`+T('fill')+T('pick')+
    I('sym','<path d="M12 3v18" stroke-dasharray="2 2.2"/><path d="M9 7 4 12l5 5M15 7l5 5-5 5"/>',tr('Spiegeln'),SK.sym)+I('size','<rect x="7" y="7" width="10" height="10" rx="1"/>',SK.size+' px')+I('out','<path d="M5 15c0-4 3-8 7-8s7 4 7 8"/><path d="M3 15h18v3H3z"/>',tr('Außen'),SK.outer)+
    I('undo','<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',tr('Zurück'))+T('rotate');
  document.querySelectorAll('.sk-cur').forEach(sw=>{sw.style.background=SK.color})}
function skDockClick(e){const b=e.target.closest('button');if(!b)return;if(b.dataset.t){skTool(b.dataset.t);return}const k=b.dataset.k;
  if(k==='col'){const sh=$('#sk-colsheet');if(!sh.hidden){sh.hidden=true;return}sh.innerHTML='';const s=skEl('div','stack');skColorUI(s);const x=skEl('button','btn sm','Fertig');x.type='button';x.addEventListener('click',()=>{sh.hidden=true});sh.append(s,x);sh.hidden=false;skColor(SK.color,false);skRecent(null);return}
  if(k==='size'){SK.size=SK.size%3+1}else if(k==='sym'){SK.sym=!SK.sym;toast(SK.sym?'Spiegeln an':'Spiegeln aus')}else if(k==='out'){SK.outer=!SK.outer;sk3dVis()}else if(k==='undo'){skUndo(-1);return}skRight()}
/* Rundgang beim ersten Öffnen */
function skTour(force){if(typeof rnTour!=='function')return;const sm=matchMedia('(max-width:980px)').matches;
  rnTour('sk-tour',[[sm?'.sk-center':'#sk-left',sm?'Malen':'Skin laden',sm?'Auf dem Modell malst du direkt mit dem Finger. Daneben ziehen dreht es, zwei Finger zoomen.':'Lade einen Skin per Minecraft-Name oder Datei, oder fang mit einem Beispiel an.'],
    ...(sm?[]:[['#sk-3d','Malen','Auf dem Modell malst du direkt. Daneben ziehen dreht es, das Mausrad zoomt. Daneben siehst du die flache Textur.']]),
    ['.sk-bar','Ansicht','Hier wechselst du zwischen 3D und 2D, wählst ein Körperteil oder drehst das Modell auf eine Seite.'],
    [sm?'#sk-dock':'#sk-right','Werkzeuge und Farben','Der Textur-Pinsel malt mit leichten Unterschieden wie echte Minecraft-Texturen. „Spiegeln“ malt beide Seiten gleichzeitig.'],
    ['#sk-use','Fertig?','Speichern legt den Skin unter „Meine Skins“ ab. Mit „Verwenden“ kommt er ins Pose-Studio, in Animationen oder Videos.']],force)}
