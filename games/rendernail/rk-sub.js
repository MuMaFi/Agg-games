/* ================= Automatische Untertitel (Spracherkennung auf dem Gerät mit Whisper) =================
   Kostenlos und komplett lokal: Der Ton verlässt nie das Gerät. Ton wird auf 16 kHz Mono gemischt, an leisen Stellen in
   Stücke ≤ 28 s geschnitten und in einem eigenen Worker erkannt. Das läuft im Hintergrund: Man kann weiterarbeiten,
   die Untertitel erscheinen Stück für Stück. Danach wird der Worker beendet, damit das Modell keinen Speicher belegt.
   Die Mac-App bringt Bibliothek und Modell mit (window.RN_AI) und braucht dann kein Internet. */
const SUB_TF='https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';
const SUB_MODELS=[['fast','Schnell, ungenauer (40 MB)','onnx-community/whisper-tiny'],['good','Genau (80 MB)','onnx-community/whisper-base'],['best','Sehr genau (250 MB)','onnx-community/whisper-small']];
const SUB_LANGS=[['german','Deutsch'],['english','Englisch'],['spanish','Spanisch'],['french','Französisch'],['italian','Italienisch'],['turkish','Türkisch'],['polish','Polnisch'],['dutch','Niederländisch'],['portuguese','Portugiesisch'],['russian','Russisch'],['arabic','Arabisch']];
const SUB_STYLES=[['clean','Klar',{font:'inter',size:74,color:'#ffffff',stroke:10,strokeColor:'#000000',box:false,depth:0}],['yellow','Gelb',{font:'luckiest',size:84,color:'#ffe14d',stroke:12,strokeColor:'#000000',box:false,depth:0}],
  ['word','Wort für Wort',{font:'luckiest',size:120,color:'#ffffff',stroke:14,strokeColor:'#000000',box:false,depth:6,words:1,ain:'pop'}],
  ['box','Kasten',{font:'inter',size:66,color:'#ffffff',stroke:0,strokeColor:'#000000',box:true,boxColor:'#000000',depth:0}],['mc','Minecraft',{font:'pixel',size:70,color:'#ffffff',stroke:0,strokeColor:'#000000',box:false,depth:7}],
  ['comic','Comic',{font:'bangers',size:90,color:'#ffffff',stroke:12,strokeColor:'#1b1b1b',box:false,depth:6}],['neon','Neon',{font:'bungee',size:68,color:'#ff4fd8',stroke:6,strokeColor:'#2a0030',box:false,depth:0,glow:24,glc:'#ff4fd8'}]];
const SUB_WORKER=`let tf=null,pipe=null,cur='';
self.onmessage=async e=>{const m=e.data;try{
  if(m.type==='load'){if(!tf){tf=await import(m.tf);if(m.local){tf.env.allowLocalModels=true;tf.env.localModelPath=m.local.models;tf.env.backends.onnx.wasm.wasmPaths=m.local.wasm}else tf.env.allowLocalModels=false}
    if(!pipe||cur!==m.model){pipe=await tf.pipeline('automatic-speech-recognition',m.model,{dtype:{encoder_model:'q8',decoder_model_merged:'q8'},device:'wasm',progress_callback:p=>{if(p&&p.status==='progress')self.postMessage({type:'dl',file:p.file,loaded:p.loaded,total:p.total})}});cur=m.model}
    self.postMessage({type:'ready'});return}
  if(m.type==='run'){const o=await pipe(m.audio,{language:m.lang,task:m.task||'transcribe',return_timestamps:true});self.postMessage({type:'out',id:m.id,out:o})}
}catch(err){self.postMessage({type:'error',msg:String(err&&err.message||err)})}};`;
function subWorker(){try{const u=URL.createObjectURL(new Blob([SUB_WORKER],{type:'text/javascript'}));const w=new Worker(u,{type:'module'});setTimeout(()=>URL.revokeObjectURL(u),5000);return w}catch{return null}}
/* Mitgelieferte KI (Mac-App): Bibliothek, Rechenkern und Modell liegen in der App */
function subLocal(){if(!window.RN_AI)return null;const b=new URL(window.RN_AI,location.href).href;return{tf:b+'transformers.min.js',models:b+'models/',wasm:b+'ort/'}}
/* Ton der gewählten Clips als 16-kHz-Mono-Spur */
async function subAudio(clips,D){const sr=16000,C=window.OfflineAudioContext||window.webkitOfflineAudioContext,oc=new C(1,Math.max(1,Math.ceil(D*sr)),sr);let any=false;
  for(const c of clips){const b=await veAudioBuf(c.asset,sr);if(!b)continue;any=true;const s=oc.createBufferSource();s.buffer=b;s.playbackRate.value=c.speed||1;const g=oc.createGain();g.gain.value=Math.min(1.5,c.vol??1);s.connect(g);g.connect(oc.destination);s.start(c._s,c.in,Math.max(.01,c.out-c.in))}
  if(!any)return null;const r=await oc.startRendering();return r.getChannelData(0)}
/* An leisen Stellen schneiden, stille Stücke überspringen */
function subSegments(a,sr){const fr=Math.round(sr*.05),n=Math.floor(a.length/fr),rms=new Float32Array(n);let mx=0;for(let i=0;i<n;i++){let s=0;for(let j=i*fr,e=j+fr;j<e;j++)s+=a[j]*a[j];rms[i]=Math.sqrt(s/fr);if(rms[i]>mx)mx=rms[i]}
  const segs=[],maxF=Math.round(28/.05),minF=Math.round(14/.05);let st=0;
  while(st<n){let end=Math.min(n,st+maxF);if(end<n){let best=end,bv=1e9;for(let i=st+minF;i<end;i++)if(rms[i]<bv){bv=rms[i];best=i}end=best}
    let loud=0;for(let i=st;i<end;i++)if(rms[i]>Math.max(.008,mx*.06))loud++;if(loud>=3)segs.push([st*fr,end*fr]);st=end}
  return segs}
/* Erkannte Abschnitte in kurze Untertitel zerlegen (oder einzelne Wörter für „Wort für Wort“) */
function subLines(chunks,maxC=26,words=false){const out=[];for(const ch of chunks){let t=String(ch.text||'').replace(/\s+/g,' ').trim();if(!t||/^[\[(][^\])]*[\])]$/.test(t))continue;const[s,e0]=ch.timestamp||[0,null];const e=e0==null||e0<=s?s+Math.max(1,t.length/14):e0;
    const W=t.split(' '),lines=[];if(words)lines.push(...W);else{let cur='';for(const w of W){if(cur&&(cur+' '+w).length>maxC){lines.push(cur);cur=w}else cur=cur?cur+' '+w:w}if(cur)lines.push(cur)}
    const tot=lines.reduce((a,l)=>a+l.length+1,0)||1;let tt=s;for(const l of lines){const d=(e-s)*(l.length+1)/tot;out.push({text:l,s:tt,e:tt+d});tt+=d}}
  return out}
const SUB={job:null,worker:null,rej:null};
function subStop(){if(SUB.worker){try{SUB.worker.terminate()}catch{}SUB.worker=null}if(SUB.rej){const r=SUB.rej;SUB.rej=null;r(new Error('cancel'))}}
/* Projekt, in das die Untertitel gehören (auch wenn man inzwischen ein anderes geöffnet hat) */
function subTarget(pid){if(VE.pid===pid&&VE.p)return VE.p;const d=store.get('ve:'+pid,null);return d&&typeof d==='object'?d:null}
async function subCreate(o){if(SUB.job){toast('Die Untertitel werden schon erstellt. Oben siehst du den Fortschritt.');return}
  if(!VE.p)return;const P=VE.p,pid=VE.pid;veLayout();const D=veDur();
  const sel=veFind(VE.sel),clips=(o.only&&sel&&veHasAudio(sel)?[sel]:[...P.main,...P.over,...P.audio].filter(veHasAudio));
  if(!clips.length){toast('In diesem Video gibt es keinen Ton.');return}
  const model=(SUB_MODELS.find(m=>m[0]===o.model)||SUB_MODELS[1])[2],trans=!!o.translate&&o.lang!=='english',stD=(SUB_STYLES.find(s=>s[0]===o.style)||SUB_STYLES[0])[2],{words,...st}=stD,y=P.fmt==='9:16'?(words?.62:.7):P.fmt==='16:9'?.86:.8;
  const need=450e6+D*16000*4*2;if(typeof veMemOk==='function'&&!veMemOk(need))return;
  const job=SUB.job=veJob(trans?'Untertitel (Englisch)':'Untertitel',{tab:'sub',onCancel:subStop,bytes:need});let added=0,first=true,lane=null,fail=null;
  const insert=lines=>{const T=subTarget(pid);if(!T||!lines.length)return;T.over=T.over||[];if(first){first=false;if(o.replace!==false)T.over=T.over.filter(c=>!c.sub)}
    if(lane==null){lane=0;while(lane<20&&T.over.some(c=>c.lane===lane))lane++}
    for(const l of lines){const s=Math.max(0,l.s),e=Math.max(s+(words?.18:.3),Math.min(D,l.e));T.over.push({id:'c'+uid(),type:'text',sub:1,name:'Untertitel',in:0,out:e-s,speed:1,start:s,lane,x:.5,y,s:1,r:0,o:1,text:l.text,color2:st.color,grad:false,ain:'none',aout:'none',...st,adj:{b:0,c:0,s:0,w:0}})}
    added+=lines.length;if(T===VE.p){veCommit();veTimelineSoft();if(VE.tab==='sub')veLib()}else store.set('ve:'+pid,T)};
  try{job.prog(0,'Ton wird vorbereitet …');const a=await subAudio(clips,D);if(job.cancel)throw new Error('cancel');if(!a)throw new Error('noaudio');const segs=subSegments(a,16000);if(!segs.length)throw new Error('silent');
    const w=SUB.worker=subWorker();if(!w)throw new Error('worker');const local=subLocal();
    const ask=msg=>new Promise((ok,no)=>{SUB.rej=no;const h=e=>{const m=e.data;if(m.type==='dl'){if(m.total)job.prog(Math.min(1,m.loaded/m.total)*.12,'Sprachmodell wird geladen (nur beim ersten Mal) … '+Math.round(m.loaded/1048576)+' MB');return}
        w.removeEventListener('message',h);SUB.rej=null;if(m.type==='error')no(new Error(m.msg));else ok(m)};w.addEventListener('message',h);w.addEventListener('error',ev=>{no(new Error(ev.message||'worker'))},{once:true});w.postMessage(msg)});
    job.prog(0,'Sprachmodell wird geladen …');await ask({type:'load',tf:local?local.tf:SUB_TF,local:local&&model.endsWith('whisper-base')?local:null,model});
    for(let i=0;i<segs.length;i++){if(job.cancel)break;const[a0,a1]=segs[i];job.prog(.12+.88*i/segs.length,'Stimme wird erkannt … '+veFmt(a0/16000)+' von '+veFmt(a.length/16000));
      const r=await ask({type:'run',id:i,audio:a.slice(a0,a1),lang:o.lang||'german',task:trans?'translate':'transcribe'});const off=a0/16000,ch=[];
      for(const c of(r.out&&r.out.chunks)||[]){const ts=c.timestamp||[0,null];ch.push({text:c.text,timestamp:[ts[0]+off,ts[1]==null?null:ts[1]+off]})}
      insert(subLines(ch,26,!!words))}
    if(job.cancel)throw new Error('cancel');if(!added)throw new Error('nothing')}
  catch(e){fail=e}
  subStop();VE.abufs.clear();job.end();SUB.job=null;if(VE.tab==='sub')veLib();
  if(!fail){toastAct(added+' Untertitel erstellt.','Anzeigen',()=>{VE.tab='sub';veLib();if(veSmall())veSheet('lib')});return}
  const m=String(fail.message||'');toast(m==='cancel'?(added?'Abgebrochen. '+added+' Untertitel sind schon drin.':'Abgebrochen.'):m==='silent'||m==='nothing'?'Ich habe keine Sprache gefunden.':m==='noaudio'?'Der Ton konnte nicht gelesen werden.':/fetch|network|Failed to load|import/i.test(m)?'Das Sprachmodell konnte nicht geladen werden. Prüfe die Internetverbindung.':'Die Untertitel konnten nicht erstellt werden.')}
function subStyleAll(k){const{words,...st}=(SUB_STYLES.find(s=>s[0]===k)||SUB_STYLES[0])[2];for(const c of VE.p.over)if(c.sub){delete c.glow;delete c.glc;Object.assign(c,{ain:'none'},st,{color2:st.color})}veCommit();veAll()}
function subList(){veLayout();return VE.p.over.filter(c=>c.sub).sort((a,b)=>a._s-b._s)}
