/* ================= Automatische Untertitel (Spracherkennung auf dem Gerät mit Whisper) =================
   Ton wird auf 16 kHz Mono gemischt, an leisen Stellen in Stücke ≤ 28 s geschnitten und in einem eigenen Worker erkannt.
   Der Worker wird danach beendet, damit das Sprachmodell keinen Speicher mehr belegt. */
const SUB_TF='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const SUB_MODELS=[['fast','Schnell, ungenauer (40 MB)','onnx-community/whisper-tiny'],['good','Genau (80 MB)','onnx-community/whisper-base'],['best','Sehr genau (250 MB)','onnx-community/whisper-small']];
const SUB_LANGS=[['german','Deutsch'],['english','Englisch'],['spanish','Spanisch'],['french','Französisch'],['italian','Italienisch'],['turkish','Türkisch'],['polish','Polnisch'],['dutch','Niederländisch'],['portuguese','Portugiesisch'],['russian','Russisch'],['arabic','Arabisch']];
const SUB_STYLES=[['clean','Klar',{font:'inter',size:74,color:'#ffffff',stroke:10,strokeColor:'#000000',box:false,depth:0}],['yellow','Gelb',{font:'luckiest',size:84,color:'#ffe14d',stroke:12,strokeColor:'#000000',box:false,depth:0}],
  ['box','Kasten',{font:'inter',size:66,color:'#ffffff',stroke:0,strokeColor:'#000000',box:true,boxColor:'#000000',depth:0}],['mc','Minecraft',{font:'pixel',size:70,color:'#ffffff',stroke:0,strokeColor:'#000000',box:false,depth:7}],
  ['comic','Comic',{font:'bangers',size:90,color:'#ffffff',stroke:12,strokeColor:'#1b1b1b',box:false,depth:6}],['neon','Neon',{font:'bungee',size:68,color:'#ff4fd8',stroke:6,strokeColor:'#2a0030',box:false,depth:0,glow:24,glc:'#ff4fd8'}]];
const SUB_WORKER=`let tf=null,pipe=null,cur='';
self.onmessage=async e=>{const m=e.data;try{
  if(m.type==='load'){if(!tf){tf=await import(m.tf);tf.env.allowLocalModels=false}
    if(!pipe||cur!==m.model){pipe=await tf.pipeline('automatic-speech-recognition',m.model,{dtype:{encoder_model:'q8',decoder_model_merged:'q8'},device:'wasm',progress_callback:p=>{if(p&&p.status==='progress')self.postMessage({type:'dl',file:p.file,loaded:p.loaded,total:p.total})}});cur=m.model}
    self.postMessage({type:'ready'});return}
  if(m.type==='run'){const o=await pipe(m.audio,{language:m.lang,task:'transcribe',return_timestamps:true});self.postMessage({type:'out',id:m.id,out:o})}
}catch(err){self.postMessage({type:'error',msg:String(err&&err.message||err)})}};`;
function subWorker(){try{const u=URL.createObjectURL(new Blob([SUB_WORKER],{type:'text/javascript'}));const w=new Worker(u,{type:'module'});setTimeout(()=>URL.revokeObjectURL(u),5000);return w}catch{return null}}
/* Ton der gewählten Clips als 16-kHz-Mono-Spur */
async function subAudio(clips,D){const sr=16000,C=window.OfflineAudioContext||window.webkitOfflineAudioContext,oc=new C(1,Math.max(1,Math.ceil(D*sr)),sr);let any=false;veLayout();
  for(const c of clips){const b=await veAudioBuf(c.asset,sr);if(!b)continue;any=true;const s=oc.createBufferSource();s.buffer=b;s.playbackRate.value=c.speed||1;const g=oc.createGain();g.gain.value=Math.min(1.5,c.vol??1);s.connect(g);g.connect(oc.destination);s.start(c._s,c.in,Math.max(.01,c.out-c.in))}
  if(!any)return null;const r=await oc.startRendering();return r.getChannelData(0)}
/* An leisen Stellen schneiden, stille Stücke überspringen */
function subSegments(a,sr){const fr=Math.round(sr*.05),n=Math.floor(a.length/fr),rms=new Float32Array(n);let mx=0;for(let i=0;i<n;i++){let s=0;for(let j=i*fr,e=j+fr;j<e;j++)s+=a[j]*a[j];rms[i]=Math.sqrt(s/fr);if(rms[i]>mx)mx=rms[i]}
  const segs=[],maxF=Math.round(28/.05),minF=Math.round(14/.05);let st=0;
  while(st<n){let end=Math.min(n,st+maxF);if(end<n){let best=end,bv=1e9;for(let i=st+minF;i<end;i++)if(rms[i]<bv){bv=rms[i];best=i}end=best}
    let loud=0;for(let i=st;i<end;i++)if(rms[i]>Math.max(.008,mx*.06))loud++;if(loud>=3)segs.push([st*fr,end*fr]);st=end}
  return segs}
/* Erkannte Abschnitte in kurze Untertitel (höchstens ~5 Wörter) zerlegen */
function subLines(chunks,maxC=26){const out=[];for(const ch of chunks){let t=String(ch.text||'').replace(/\s+/g,' ').trim();if(!t||/^[\[(][^\])]*[\])]$/.test(t))continue;const[s,e0]=ch.timestamp||[0,null];const e=e0==null||e0<=s?s+Math.max(1,t.length/14):e0;
    const words=t.split(' '),lines=[];let cur='';for(const w of words){if(cur&&(cur+' '+w).length>maxC){lines.push(cur);cur=w}else cur=cur?cur+' '+w:w}if(cur)lines.push(cur);
    const tot=lines.reduce((a,l)=>a+l.length,0)||1;let tt=s;for(const l of lines){const d=(e-s)*l.length/tot;out.push({text:l,s:tt,e:tt+d});tt+=d}}
  return out}
const SUB={worker:null};
function subStop(){if(SUB.worker){try{SUB.worker.terminate()}catch{}SUB.worker=null}}
async function subCreate(o){if(VE.busy)return;const P=VE.p;veLayout();const D=veDur();
  const sel=veFind(VE.sel),clips=(o.only&&sel&&veHasAudio(sel)?[sel]:[...P.main,...P.over,...P.audio].filter(veHasAudio));
  if(!clips.length){toast('In diesem Video gibt es keinen Ton.');return}
  const model=(SUB_MODELS.find(m=>m[0]===o.model)||SUB_MODELS[1])[2];VE.busy=true;rnBusy(true);vePause();const ui=veRecUI('Untertitel werden erstellt');let fail=null;
  try{ui.prog(0,'Ton wird vorbereitet …');const a=await subAudio(clips,D);if(!a)throw new Error('noaudio');const segs=subSegments(a,16000);if(!segs.length)throw new Error('silent');
    const w=SUB.worker=subWorker();if(!w)throw new Error('worker');
    const ask=msg=>new Promise((ok,no)=>{const h=e=>{const m=e.data;if(m.type==='dl'){if(m.total)ui.prog(Math.min(1,m.loaded/m.total)*.15,'Sprachmodell wird geladen (nur beim ersten Mal) … '+Math.round(m.loaded/1048576)+' MB');return}
        w.removeEventListener('message',h);if(m.type==='error')no(new Error(m.msg));else ok(m)};w.addEventListener('message',h);w.addEventListener('error',ev=>{no(new Error(ev.message||'worker'))},{once:true});w.postMessage(msg)});
    ui.prog(0,'Sprachmodell wird geladen …');await ask({type:'load',tf:SUB_TF,model});
    const all=[];for(let i=0;i<segs.length;i++){if(ui.cancel)break;const[a0,a1]=segs[i];ui.prog(.15+.85*i/segs.length,'Stimme wird erkannt … '+veFmt(a0/16000)+' von '+veFmt(a.length/16000));
      const r=await ask({type:'run',id:i,audio:a.slice(a0,a1),lang:o.lang||'german'});const off=a0/16000;
      for(const ch of(r.out&&r.out.chunks)||[]){const ts=ch.timestamp||[0,null];all.push({text:ch.text,timestamp:[ts[0]+off,ts[1]==null?null:ts[1]+off]})}}
    if(ui.cancel)throw new Error('cancel');
    const lines=subLines(all);if(!lines.length)throw new Error('nothing');
    if(o.replace!==false)P.over=P.over.filter(c=>!c.sub);
    const st=(SUB_STYLES.find(s=>s[0]===o.style)||SUB_STYLES[0])[2],y=P.fmt==='9:16'?.7:P.fmt==='16:9'?.86:.8;
    let lane=0;for(;lane<30;lane++){if(!P.over.some(c=>c.lane===lane))break}
    for(const l of lines){const s=Math.max(0,l.s),e=Math.max(s+.3,Math.min(D,l.e));P.over.push({id:'c'+uid(),type:'text',sub:1,name:'Untertitel',in:0,out:e-s,speed:1,start:s,lane,x:.5,y,s:1,r:0,o:1,text:l.text,color2:st.color,grad:false,...st,ain:'none',aout:'none',adj:{b:0,c:0,s:0,w:0}})}
    VE.sel=null;veCommit();veAll();$('#ve-ov').hidden=true;toast(lines.length+' Untertitel erstellt. Du kannst sie links unter „Untertitel“ ändern.')}
  catch(e){fail=e}
  subStop();VE.abufs.clear();VE.busy=false;rnBusy(false);
  if(fail){$('#ve-ov').hidden=true;const m=String(fail.message||'');toast(m==='cancel'?'Abgebrochen.':m==='silent'||m==='nothing'?'Ich habe keine Sprache gefunden.':m==='noaudio'?'Der Ton konnte nicht gelesen werden.':/fetch|network|Failed to load|import/i.test(m)?'Das Sprachmodell konnte nicht geladen werden. Prüfe die Internetverbindung.':'Die Untertitel konnten nicht erstellt werden.')}}
function subStyleAll(k){const st=(SUB_STYLES.find(s=>s[0]===k)||SUB_STYLES[0])[2];for(const c of VE.p.over)if(c.sub){delete c.glow;delete c.glc;Object.assign(c,st,{color2:st.color})}veCommit();veAll()}
function subList(){veLayout();return VE.p.over.filter(c=>c.sub).sort((a,b)=>a._s-b._s)}
