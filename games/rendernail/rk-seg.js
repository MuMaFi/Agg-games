/* ================= Hintergrund entfernen ohne Greenscreen (KI auf dem Gerät) =================
   MediaPipe-Selfie-Segmentierung: erkennt Personen im Bild und macht den Rest durchsichtig.
   Läuft komplett lokal (die Mac-App bringt alles mit). Ergebnis wird pro Bild zwischengespeichert. */
const SEG_V='0.10.35',SEG_CDN='https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@'+SEG_V,SEG_MODEL='https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';
const SEG={p:null,seg:null,fail:false,outs:new Map(),inp:null,mc:null,delegate:''};
function segLocal(){return window.RN_AI?new URL(window.RN_AI,location.href).href+'mp/':null}
function segLoad(){if(SEG.seg)return Promise.resolve(SEG.seg);if(SEG.p)return SEG.p;
  SEG.p=(async()=>{const loc=segLocal(),mod=await import(loc?loc+'vision_bundle.mjs':SEG_CDN+'/vision_bundle.mjs'),fs=await mod.FilesetResolver.forVisionTasks(loc?loc+'wasm':SEG_CDN+'/wasm');let err=null;
    for(const delegate of['GPU','CPU']){try{SEG.seg=await mod.ImageSegmenter.createFromOptions(fs,{baseOptions:{modelAssetPath:loc?loc+'selfie_segmenter.tflite':SEG_MODEL,delegate},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true});SEG.delegate=delegate;SEG.fail=false;liveWake(500);return SEG.seg}catch(e){err=e}}
    throw err||new Error('seg')})();
  SEG.p.catch(()=>{SEG.p=null;SEG.fail=true});return SEG.p}
/* Liefert das Bild mit durchsichtigem Hintergrund (oder null, solange die KI noch lädt) */
function segApply(c,src,sw,sh,key){if(!SEG.seg){if(!SEG.p&&!SEG.fail)segLoad().catch(()=>{});return null}
  let o=SEG.outs.get(c.id);if(o&&o.key===key)return o.c;
  const iw=Math.min(512,sw),ih=Math.max(1,Math.round(iw*sh/sw)),inp=SEG.inp||(SEG.inp=mk(iw,ih));if(inp.width!==iw||inp.height!==ih){inp.width=iw;inp.height=ih}
  try{inp.getContext('2d').drawImage(src,0,0,iw,ih)}catch{return null}
  const ow=Math.min(1280,sw),oh=Math.max(1,Math.round(ow*sh/sw));if(!o){o={c:mk(ow,oh),key:''};SEG.outs.set(c.id,o);if(SEG.outs.size>12){const k0=SEG.outs.keys().next().value;SEG.outs.delete(k0)}}
  if(o.c.width!==ow||o.c.height!==oh){o.c.width=ow;o.c.height=oh}let ok=false;
  try{SEG.seg.segment(inp,r=>{const ms=r.confidenceMasks||[],m=ms[ms.length-1];if(!m)return;const W=m.width,H=m.height,a=m.getAsFloat32Array();
      const mc=SEG.mc&&SEG.mc.width===W&&SEG.mc.height===H?SEG.mc:(SEG.mc=mk(W,H)),x=mc.getContext('2d'),id=x.createImageData(W,H),d=id.data;
      for(let i=0;i<a.length;i++){const v=a[i];d[i*4]=d[i*4+1]=d[i*4+2]=255;d[i*4+3]=v<.2?0:v>.8?255:Math.round((v-.2)/.6*255)}x.putImageData(id,0,0);
      const ox=o.c.getContext('2d');ox.globalCompositeOperation='copy';ox.drawImage(src,0,0,ow,oh);ox.globalCompositeOperation='destination-in';ox.imageSmoothingEnabled=true;ox.imageSmoothingQuality='high';ox.drawImage(mc,0,0,ow,oh);ox.globalCompositeOperation='source-over';ok=true})}catch{return null}
  if(!ok)return null;o.key=key;return o.c}
