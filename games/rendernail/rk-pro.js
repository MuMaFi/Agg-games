/* ================= Profi-Werkzeuge: bei anderen Apps oft kostenpflichtig, hier kostenlos und komplett lokal =================
   Hintergrund-Aufgaben (man kann weiterarbeiten), Pausen entfernen, Stimme verbessern (Rauschen raus, Studio-Klang),
   Musik automatisch leiser bei Sprache, Lautstärke angleichen, Hintergrund entfernen (rk-seg.js), 4K-Export. */
VE.envs=VE.envs||new Map();VE.envv=VE.envv||new Map();

/* ---------- Hintergrund-Aufgaben: kleine Anzeige oben im Editor ---------- */
const VE_JOBS=[];let veJobsT=0;
function veJob(name,opt={}){const j={id:'j'+uid(),name,p:0,text:'',cancel:false,tab:opt.tab||null,bytes:opt.bytes||0,
    prog(p,t){j.p=clamp(p,0,1);if(t!=null)j.text=t;veJobsUI()},
    stop(){if(j.cancel)return;j.cancel=true;if(opt.onCancel)try{opt.onCancel()}catch{}if(j.kill)try{j.kill()}catch{}veJobsUI()},
    end(){const i=VE_JOBS.indexOf(j);if(i>=0)VE_JOBS.splice(i,1);veJobsUI();if(!VE_JOBS.length)rnBusy(false)}};
  VE_JOBS.push(j);rnBusy(true);veJobsUI();return j}
function veJobsUI(){cancelAnimationFrame(veJobsT);veJobsT=requestAnimationFrame(()=>{const el=$('#ve-jobs');if(!el)return;el.innerHTML='';
  for(const j of VE_JOBS){const w=document.createElement('div');w.className='ve-job';const b=document.createElement('button');b.type='button';b.className='ve-jobb';b.title=j.text||j.name;
    const C=2*Math.PI*8;b.innerHTML=`<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" class="bg"/><circle cx="10" cy="10" r="8" class="fg" style="stroke-dasharray:${C.toFixed(2)};stroke-dashoffset:${(C*(1-j.p)).toFixed(2)}"/></svg><span class="n"></span><span class="p"></span>`;
    b.querySelector('.n').textContent=j.cancel?'Wird abgebrochen …':j.name;b.querySelector('.p').textContent=Math.round(j.p*100)+' %';b.setAttribute('aria-label',j.name+', '+Math.round(j.p*100)+' %');
    b.addEventListener('click',()=>{if(j.tab){VE.tab=j.tab;veLib();if(veSmall())veSheet('lib')}else toast(j.text||j.name)});
    const x=document.createElement('button');x.type='button';x.className='ve-jobx';x.setAttribute('aria-label',j.name+' abbrechen');x.title='Abbrechen';x.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';x.addEventListener('click',()=>j.stop());
    w.append(b,x);el.append(w)}
  const sr=document.querySelector('#ve-libin .ve-subrun'),J=VE_JOBS.find(j=>j.tab==='sub');if(sr&&J){sr.querySelector('b').textContent=tr('Läuft im Hintergrund …')+' '+Math.round(J.p*100)+' %';sr.querySelector('.an-prog i').style.width=Math.round(J.p*100)+'%'}})}
function veUndoToast(t){toastAct(t,'Rückgängig',()=>veUndo(-1))}

/* ---------- Ton-Hüllkurve (Lautheit 50× pro Sekunde), lokal aus dem Ton berechnet ---------- */
async function veEnv(asset){if(VE.envs.has(asset))return VE.envs.get(asset);const p=(async()=>{const b=await veAudioDecode(asset,8000);if(!b)return null;const R=50,n=Math.ceil(b.duration*R),out=new Float32Array(n),ch=[...Array(b.numberOfChannels)].map((_,i)=>b.getChannelData(i)),hop=b.sampleRate/R;
  for(let i=0;i<n;i++){let s=0,c=0;const a=Math.floor(i*hop),z=Math.min(ch[0].length,Math.floor((i+1)*hop));for(const d of ch)for(let j=a;j<z;j+=2){s+=d[j]*d[j];c++}out[i]=c?Math.sqrt(s/c):0}
  const srt=Float32Array.from(out).sort(),noise=srt[Math.floor(n*.1)]||0,loud=srt[Math.floor(n*.95)]||0;return{R,rms:out,dur:b.duration,noise,loud,thr:Math.max(.004,noise+(loud-noise)*.14)}})();
  VE.envs.set(asset,p);p.then(v=>{if(v){VE.envv.set(asset,v);VE_DUCK.key=''}else VE.envs.delete(asset)});return p}
const veIsVoice=c=>c.type==='video'||!!c.voice||/sprachaufnahme|stimme/i.test(c.name||'');
const veIsMusic=c=>c.type==='audio'&&!veIsVoice(c)&&!((veMedia(c.asset)||{}).sfx)&&c.duck!==false;

/* ---------- Pausen entfernen ---------- */
function veSilenceParts(env,c,minSil,pad){const{R,rms,thr}=env,a=Math.floor(c.in*R),z=Math.min(rms.length,Math.ceil(c.out*R)),N=z-a;if(N<R)return null;
  const minN=Math.round(minSil*R),padN=Math.round(pad*R),cuts=[];let rs=-1;
  for(let k=0;k<=N;k++){const q=k<N&&rms[a+k]<thr;if(q&&rs<0)rs=k;if((!q||k===N)&&rs>=0){if(k-rs>=minN){const cs=rs===0?0:rs+padN,ce=k===N?N:k-padN;if(ce>cs)cuts.push([cs,ce])}rs=-1}}
  if(!cuts.length)return null;const keep=[];let st=0;for(const[cs,ce]of cuts){if(cs>st)keep.push([st,cs]);st=ce}if(st<N)keep.push([st,N]);
  return keep.filter(([s,e])=>e-s>=Math.round(.12*R)).map(([s,e])=>[c.in+s/R,c.in+e/R])}
function veCutClip(c,parts){const list=veListOf(c),i=list.indexOf(c),sp=c.speed||1;if(i<0)return 0;const before=veL(c);
  const pieces=parts.map(([s,e],k)=>{const d={...JSON.parse(JSON.stringify(c)),id:k?'c'+uid():c.id,in:s,out:e};const off=(s-c.in)/sp,L=(e-s)/sp;d.keys=(c.keys||[]).map(q=>({...q,t:q.t-off})).filter(q=>q.t>=-.001&&q.t<=L+.001);if(k)d.fin=0;if(k<parts.length-1)d.fout=0;return d});
  if(list!==VE.p.main){let t=c.start;for(const d of pieces){d.start=t;t+=veL(d)}}list.splice(i,1,...pieces);return before-pieces.reduce((a,d)=>a+veL(d),0)}
async function veProSilence(minSil){if(!VE.p)return;const sel=veFind(VE.sel);let targets=sel&&(sel.type==='video'||sel.type==='audio')?[sel]:VE.p.main.filter(c=>c.type==='video');
  targets=targets.filter(c=>!c.mute&&(c.vol??1)>0);if(!targets.length){toast(sel?'Dieser Clip hat keinen Ton.':'Füge zuerst ein Video mit Ton hinzu.');return}
  const job=veJob('Pausen entfernen');let cut=0,n=0;
  try{for(let i=0;i<targets.length;i++){if(job.cancel)break;job.prog(i/targets.length,'Ton wird angehört …');const env=await veEnv(targets[i].asset);if(!env)continue;veLayout();const c=veFind(targets[i].id);if(!c)continue;const parts=veSilenceParts(env,c,minSil||.6,.12);if(parts){cut+=veCutClip(c,parts);n++}}}
  finally{job.end()}
  if(job.cancel)return;if(!n||cut<.05){toast('Keine längeren Pausen gefunden.');return}VE.sel=null;veCommit();veAll();veUndoToast(String(Math.round(cut*10)/10).replace('.',',')+' s Pausen entfernt.')}

/* ---------- Lautstärke angleichen ---------- */
async function veProLoudness(){if(!VE.p)return;const clips=[...VE.p.main,...VE.p.over,...VE.p.audio].filter(c=>(c.type==='video'||c.type==='audio')&&!c.mute&&!((veMedia(c.asset)||{}).sfx));if(!clips.length){toast('Es gibt noch keinen Ton zum Angleichen.');return}
  const job=veJob('Lautstärke angleichen');let n=0;
  try{for(let i=0;i<clips.length;i++){if(job.cancel)break;job.prog(i/clips.length);const env=await veEnv(clips[i].asset);if(!env)continue;const{R,rms,thr}=env,c=veFind(clips[i].id);if(!c)continue;
      const act=[];for(let k=Math.floor(c.in*R);k<Math.min(rms.length,c.out*R);k++)if(rms[k]>thr)act.push(rms[k]);if(act.length<R/2)continue;act.sort((a,b)=>a-b);const lvl=act[Math.floor(act.length*.6)];
      const target=veIsMusic(c)?.06:.11;c.vol=Math.round(clamp(target/Math.max(1e-4,lvl),.1,2)*100)/100;n++}}
  finally{job.end()}
  if(job.cancel)return;if(!n){toast('Nichts zum Angleichen gefunden.');return}veCommit();veAll();veUndoToast(n===1?'Lautstärke angeglichen.':n+' Clips gleich laut gemacht.')}

/* ---------- Musik automatisch leiser, wenn jemand spricht (Ducking) ---------- */
const VE_DUCK={key:'',curve:null,R:20};
async function veDuckPrep(){if(!VE.p)return;const src=[...VE.p.main,...VE.p.over,...VE.p.audio].filter(c=>veHasAudio(c)&&veIsVoice(c));await Promise.all([...new Set(src.map(c=>c.asset))].map(a=>veEnv(a)));VE_DUCK.key=''}
function veDuckCurve(){const P=VE.p;if(!P||!P.duck)return null;const key=(VE.rev||0)+'|'+VE.envv.size+'|'+(P.duckAmt??.7)+'|'+VE.pid;if(VE_DUCK.key===key&&VE_DUCK.curve)return VE_DUCK.curve;veLayout();
  const R=VE_DUCK.R,D=veDur(),n=Math.max(1,Math.ceil(D*R)+1),act=new Uint8Array(n),src=[...P.main,...P.over,...P.audio].filter(c=>veHasAudio(c)&&veIsVoice(c));
  for(const c of src){const e=VE.envv.get(c.asset);if(!e)continue;const sp=c.speed||1;for(let i=Math.floor(c._s*R);i<Math.min(n,Math.ceil((c._s+veL(c))*R));i++){const st=c.in+(i/R-c._s)*sp,k=Math.floor(st*e.R);if(k>=0&&k<e.rms.length&&e.rms[k]*(c.vol??1)>e.thr)act[i]=1}}
  const amt=clamp(P.duckAmt??.7,0,.95),hold=Math.round(.3*R),cur=new Float32Array(n);let h=0,g=1;
  for(let i=0;i<n;i++){if(act[i])h=hold;else if(h>0)h--;const tg=h>0?1-amt:1;g+=(tg-g)*(tg<g?.55:.12);cur[i]=g}
  VE_DUCK.curve=cur;VE_DUCK.key=key;return cur}
function veDuckAt(t){const cv=veDuckCurve();if(!cv)return 1;const i=t*VE_DUCK.R,a=Math.floor(i);if(a<0)return cv[0];if(a>=cv.length-1)return cv[cv.length-1];return cv[a]+(cv[a+1]-cv[a])*(i-a)}

/* ---------- Stimme verbessern: Rauschen entfernen, Höhen/Tiefen, Kompressor, Lautheit (in einem Worker) ---------- */
const VE_DSP=`function bq(type,f,q,g,sr){const w=2*Math.PI*f/sr,c=Math.cos(w),s=Math.sin(w),A=Math.pow(10,g/40),al=s/(2*q);let b0,b1,b2,a0,a1,a2;
 if(type==='hp'){b0=(1+c)/2;b1=-(1+c);b2=(1+c)/2;a0=1+al;a1=-2*c;a2=1-al}else if(type==='peak'){b0=1+al*A;b1=-2*c;b2=1-al*A;a0=1+al/A;a1=-2*c;a2=1-al/A}
 else{const sq=2*Math.sqrt(A)*al;b0=A*((A+1)+(A-1)*c+sq);b1=-2*A*((A-1)+(A+1)*c);b2=A*((A+1)+(A-1)*c-sq);a0=(A+1)-(A-1)*c+sq;a1=2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-sq}
 return[b0/a0,b1/a0,b2/a0,a1/a0,a2/a0]}
function run(x,k){let x1=0,x2=0,y1=0,y2=0;for(let i=0;i<x.length;i++){const v=x[i],y=k[0]*v+k[1]*x1+k[2]*x2-k[3]*y1-k[4]*y2;x2=x1;x1=v;y2=y1;y1=y;x[i]=y}}
function fft(re,im,inv){const n=re.length;for(let i=1,j=0;i<n;i++){let b=n>>1;for(;j&b;b>>=1)j^=b;j^=b;if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t}}
 for(let len=2;len<=n;len<<=1){const a=(inv?2:-2)*Math.PI/len,wr=Math.cos(a),wi=Math.sin(a);for(let i=0;i<n;i+=len){let cr=1,ci=0;for(let j=0;j<len/2;j++){const ur=re[i+j],ui=im[i+j],vr=re[i+j+len/2]*cr-im[i+j+len/2]*ci,vi=re[i+j+len/2]*ci+im[i+j+len/2]*cr;re[i+j]=ur+vr;im[i+j]=ui+vi;re[i+j+len/2]=ur-vr;im[i+j+len/2]=ui-vi;const t=cr*wr-ci*wi;ci=cr*wi+ci*wr;cr=t}}}
 if(inv)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n}}
function denoise(x,post){const N=1024,H=256,B=N/2+1,win=new Float32Array(N);for(let i=0;i<N;i++)win[i]=.5-.5*Math.cos(2*Math.PI*i/N);const F=Math.max(1,Math.floor((x.length-N)/H)+1);
 const re=new Float32Array(N),im=new Float32Array(N),en=new Float32Array(F);for(let f=0;f<F;f++){let s=0;for(let i=0;i<N;i++){const v=x[f*H+i];s+=v*v}en[f]=s}
 const ord=Array.from(en.keys()).sort((a,b)=>en[a]-en[b]),q=ord.slice(0,Math.max(4,Math.floor(F*.1))),noise=new Float32Array(B);
 for(const f of q){for(let i=0;i<N;i++){re[i]=x[f*H+i]*win[i];im[i]=0}fft(re,im,false);for(let k=0;k<B;k++)noise[k]+=Math.hypot(re[k],im[k])/q.length}
 const out=new Float32Array(x.length),norm=new Float32Array(x.length),gs=new Float32Array(B).fill(1);
 for(let f=0;f<F;f++){for(let i=0;i<N;i++){re[i]=x[f*H+i]*win[i];im[i]=0}fft(re,im,false);
  for(let k=0;k<B;k++){const m=Math.hypot(re[k],im[k])+1e-9;let g=Math.max(.1,1-1.6*noise[k]/m);g=g>gs[k]?gs[k]+(g-gs[k])*.6:gs[k]+(g-gs[k])*.25;gs[k]=g;re[k]*=g;im[k]*=g;if(k>0&&k<N/2){re[N-k]=re[k];im[N-k]=-im[k]}}
  fft(re,im,true);for(let i=0;i<N;i++){out[f*H+i]+=re[i]*win[i];norm[f*H+i]+=win[i]*win[i]}if(f%400===0)post(f/F)}
 for(let i=0;i<x.length;i++)x[i]=norm[i]>1e-3?out[i]/norm[i]:x[i]*0}
function comp(x,sr){const at=Math.exp(-1/(.005*sr)),rl=Math.exp(-1/(.12*sr)),th=Math.pow(10,-24/20),ratio=3;let env=0;for(let i=0;i<x.length;i++){const a=Math.abs(x[i]);env=a>env?at*env+(1-at)*a:rl*env+(1-rl)*a;if(env>th){const g=Math.pow(env/th,1/ratio-1);x[i]*=g}}}
self.onmessage=e=>{const{x,sr,denoise:dn}=e.data;const post=p=>self.postMessage({type:'p',p});
 run(x,bq('hp',85,.7,0,sr));if(dn)denoise(x,p=>post(p*.8));run(x,bq('peak',250,1,-2,sr));run(x,bq('peak',3200,1,3,sr));run(x,bq('shelf',9000,.7,2,sr));comp(x,sr);
 let s=0,c=0,pk=0;for(let i=0;i<x.length;i++){const a=Math.abs(x[i]);if(a>pk)pk=a;if(a>.01){s+=x[i]*x[i];c++}}const rms=c?Math.sqrt(s/c):.1;let g=Math.min(8,.12/rms);if(pk*g>.95)g=.95/pk;
 for(let i=0;i<x.length;i++){let v=x[i]*g;if(v>.9)v=.9+.1*Math.tanh((v-.9)/.1);else if(v<-.9)v=-.9+.1*Math.tanh((v+.9)/.1);x[i]=v}
 self.postMessage({type:'done',x},[x.buffer])};`;
function veWav(x,sr){const n=x.length,b=new ArrayBuffer(44+n*2),v=new DataView(b),w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.max(-1,Math.min(1,x[i]))*32767,true);return new Blob([b],{type:'audio/wav'})}
async function veProVoice(c0){if(!VE.p)return;if(!ASSETS){toast('Speichern ist in dieser Ansicht nicht möglich.');return}const sel=c0||veFind(VE.sel);let c=sel&&(sel.type==='video'||sel.type==='audio')?sel:null;
  if(!c){const v=VE.p.main.filter(x=>x.type==='video'&&veHasAudio(x));if(v.length===1)c=v[0]}if(!c){toast('Wähle zuerst den Clip mit der Stimme aus.');return}if(c.mute){toast('Der Ton dieses Clips ist stumm oder abgetrennt. Wähle den Ton-Clip aus.');return}
  const need=(c.out-c.in)*48000*4*7;if(!veMemOk(need))return;const job=veJob('Stimme verbessern',{bytes:need});let wk=null;
  try{job.prog(0,'Ton wird gelesen …');const b=await veAudioDecode(c.asset,48000);if(!b)throw new Error('noaudio');const sr=b.sampleRate,a=Math.max(0,Math.floor(c.in*sr)),z=Math.min(b.length,Math.ceil(c.out*sr)),x=new Float32Array(z-a);
    for(let ch=0;ch<b.numberOfChannels;ch++){const d=b.getChannelData(ch);for(let i=0;i<x.length;i++)x[i]+=d[a+i]/b.numberOfChannels}
    if(job.cancel)throw new Error('cancel');const u=URL.createObjectURL(new Blob([VE_DSP],{type:'text/javascript'}));wk=new Worker(u);setTimeout(()=>URL.revokeObjectURL(u),5000);
    const y=await new Promise((ok,no)=>{job.kill=()=>no(new Error('cancel'));wk.onmessage=e=>{if(e.data.type==='p')job.prog(.1+e.data.p*.85,'Rauschen wird entfernt …');else ok(e.data.x)};wk.onerror=e=>no(new Error(e.message||'dsp'));wk.postMessage({x,sr,denoise:true},[x.buffer])});
    job.prog(.97,'Wird gespeichert …');const up=await ASSETS.upload(veWav(y,sr));if(job.cancel)throw new Error('cancel');
    const C=veFind(c.id);if(!C)throw new Error('gone');const m={asset:up.id,name:String(C.name||'Ton').slice(0,30)+' (Stimme)',kind:'audio',w:0,h:0,dur:y.length/sr};VE.p.media.push(m);vePrepMedia(m);veLayout();
    if(C.type==='audio'){Object.assign(C,{asset:m.asset,name:m.name,in:0,out:m.dur,voice:true})}
    else{const n={id:'c'+uid(),type:'audio',asset:m.asset,name:m.name,in:0,out:m.dur,speed:C.speed||1,vol:1,fin:C.fin||0,fout:C.fout||0,start:C._s,lane:0,voice:true,keys:[],x:.5,y:.5,s:1,r:0,o:1,adj:{b:0,c:0,s:0,w:0}};n.lane=veFreeLane(VE.p.audio,n);VE.p.audio.push(n);C.mute=true}
    VE_DUCK.key='';veCommit();veAll();veUndoToast('Stimme verbessert: Rauschen entfernt und klarer.')}
  catch(e){if(String(e&&e.message)!=='cancel')toast(String(e&&e.message)==='noaudio'?'Der Ton konnte nicht gelesen werden.':'Die Stimme konnte nicht verbessert werden.')}
  finally{if(wk)wk.terminate();job.end()}}

/* ---------- Hilfe: Tastenkürzel und Tipps ---------- */
function veHelp(){const d=document.createElement('dialog');d.className='ask-dlg ve-helpdlg';const K=[['Leertaste','Abspielen / Anhalten'],['S','Am Zeitregler teilen'],['⌘Z / ⇧⌘Z','Rückgängig / Wiederholen'],['⌘C / ⌘V','Clip kopieren / einfügen'],['⌘D','Clip duplizieren'],['Entf','Clip löschen'],['← / →','Ein Bild zurück / vor (mit ⇧: 1 Sekunde)'],['Esc','Auswahl aufheben']];
  d.innerHTML='<form method="dialog"><h3>So geht’s</h3><ol class="ve-steps"><li>Links ein Video, Bild oder Projekt einfügen.</li><li>Unten in der Zeitleiste einen Clip antippen, dann rechts (am Handy unten) die Werkzeuge nutzen.</li><li>Zeitregler verschieben und im Bild ziehen, um Dinge zu bewegen.</li><li>Oben rechts auf „Exportieren“.</li></ol><h3>Tastenkürzel</h3><dl class="ve-keys"></dl><p class="sub">Alles speichert sich automatisch. Rechtsklick oder langes Drücken auf einen Clip öffnet ein Menü.</p><p class="sub ve-memline"></p><div class="ask-btns"><button type="button" class="btn ghost" data-tour>Rundgang starten</button><button class="btn primary">Alles klar</button></div></form>';
  const dl=d.querySelector('.ve-keys');for(const[k,v]of K){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;dl.append(dt,dd)}
  const ml=d.querySelector('.ve-memline'),fresh=performance.now()-VE_MEM.nativeAt<6000;ml.textContent=tr('Arbeitsspeicher')+': '+veMemFmt(veMemNow())+' '+tr(fresh?'(gemessen)':'(geschätzt)')+' · '+tr('Grenze 4 GB');
  d.querySelector('[data-tour]').addEventListener('click',()=>{d.close();veTour(true)});d.addEventListener('close',()=>d.remove());document.body.append(d);d.showModal()}
/* ---------- Profi-Reiter ---------- */
function veLibPro(box){const P=VE.p,sel=veFind(VE.sel);
  const intro=document.createElement('p');intro.className='sub';intro.textContent='Werkzeuge, die anderswo Geld kosten. Hier gratis, und alles läuft auf deinem Gerät, nichts wird hochgeladen.';box.append(intro);
  const card=(ic,title,text,build)=>{const c=document.createElement('section');c.className='ve-pro';c.innerHTML=`<div class="ve-proh"><svg viewBox="0 0 24 24" aria-hidden="true">${VE_IC[ic]||VE_IC.fx}</svg><b></b><span class="ve-free">Gratis</span></div><p class="sub"></p><div class="ve-proa"></div>`;
    c.querySelector('b').textContent=title;c.querySelector('p').textContent=text;build(c.querySelector('.ve-proa'));box.append(c)};
  const busy=n=>VE_JOBS.some(j=>j.name===n);
  card('sub','Automatische Untertitel','Aus der Stimme im Video, in 11 Sprachen, auf Wunsch ins Englische übersetzt. Du kannst währenddessen weiterarbeiten.',a=>vBtn(a,SUB.job?'Läuft … ansehen':'Untertitel erstellen',()=>{VE.tab='sub';veLib()},'btn sm primary'));
  card('cut','Pausen entfernen','Schneidet stille Stellen aus deinem Video, z. B. Denkpausen. Am besten vor den Untertiteln machen.',a=>{const o=VE.silo||(VE.silo=.6);const s=document.createElement('div');s.className='seg';for(const[v,n]of[[.9,'Nur lange'],[.6,'Normal'],[.35,'Auch kurze']]){const b=document.createElement('button');b.type='button';b.textContent=n;b.setAttribute('aria-pressed',o===v);b.addEventListener('click',()=>{VE.silo=v;veLib()});s.append(b)}a.append(s);
    const b=vBtn(a,busy('Pausen entfernen')?'Läuft …':sel&&(sel.type==='video'||sel.type==='audio')?'Im ausgewählten Clip entfernen':'Im ganzen Video entfernen',()=>veProSilence(VE.silo),'btn sm primary');b.disabled=busy('Pausen entfernen')});
  card('key','Greenscreen','Macht den grünen (oder blauen) Hintergrund durchsichtig. Ein Tipp genügt, die Farbe wird automatisch erkannt.',a=>{const c=veKeyTarget();
    if(!c){a.append(Object.assign(document.createElement('p'),{className:'sub ve-hint',textContent:'Füge zuerst ein Video oder Bild mit Greenscreen hinzu.'}));return}
    const t=document.createElement('p');t.className='sub';t.textContent='Für: '+(c.name||'Clip');a.append(t);const r=document.createElement('div');r.className='btnrow';vBtn(r,c.key&&c.key.on?'Farbe neu erkennen':'Greenscreen entfernen',()=>veKeyAuto(c),'btn sm primary');vBtn(r,'Pipette',()=>veKeyPick(c),'btn sm');if(c.key&&c.key.on)vBtn(r,'Aus',()=>{c.key.on=false;veCommit();veAll()},'btn sm');a.append(r)});
  card('mic','Stimme verbessern','Entfernt Rauschen und Brummen und macht die Stimme klarer, wie mit einem guten Mikrofon.',a=>{const b=vBtn(a,busy('Stimme verbessern')?'Läuft …':'Stimme verbessern',()=>veProVoice(),'btn sm primary');b.disabled=busy('Stimme verbessern')});
  card('duck','Musik leiser bei Sprache','Die Hintergrundmusik wird automatisch leiser, sobald jemand spricht, und danach wieder lauter.',a=>{vCheck(a,'Automatisch leiser',()=>!!P.duck,v=>{P.duck=v;if(v)veDuckPrep().then(()=>liveWake(300));VE_DUCK.key='';veLib()});
    if(P.duck)vRange(a,'Wie viel leiser',.3,.9,.05,()=>P.duckAmt??.7,v=>{P.duckAmt=v;VE_DUCK.key=''},v=>Math.round(v*100)+' %')});
  card('vol','Lautstärke angleichen','Macht alle Clips gleich laut, Musik etwas leiser als Stimmen.',a=>vBtn(a,'Angleichen',veProLoudness,'btn sm primary'));
  card('fmt','4K-Export','Exportiere in 4K (2160p) mit bis zu 60 Bildern pro Sekunde, ohne Wasserzeichen.',a=>vSeg(a,null,[[0,'720p'],[1,'1080p'],[2,'4K']],()=>P.q,v=>{P.q=+v;veCommit();veProps()}))}

/* ---------- Einfacher Chroma Key: Farbe automatisch erkennen oder mit der Pipette antippen ---------- */
function veKeyTarget(){const P=VE.p;if(!P)return null;veLayout();const ok=c=>c&&(c.type==='video'||c.type==='image');const sel=veFind(VE.sel);if(ok(sel))return sel;
  const ov=P.over.filter(c=>ok(c)&&veActive(c,VE.t)).sort((a,b)=>b.lane-a.lane)[0];if(ov)return ov;const mn=P.main.find(c=>ok(c)&&veActive(c,VE.t));return mn||P.over.find(ok)||P.main.find(ok)||null}
const veHex2=v=>'#'+v.map(x=>Math.round(clamp(x,0,255)).toString(16).padStart(2,'0')).join('');
async function veKeySrc(c){veLayout();if(!veActive(c,VE.t)){vePause();veGoto(c._s+Math.min(.3,veL(c)/2))}
  for(let i=0;i<40;i++){veSync();const S=veSource(c,VE.t,null,1);if(S&&S.src&&(c.type!=='video'||(S.src.readyState>=2&&!S.src.seeking)))return S;await new Promise(r=>setTimeout(r,60))}return null}
async function veKeyAuto(c){if(!c)return;const S=await veKeySrc(c);if(!S){toast('Das Bild ist noch nicht geladen. Versuch es gleich nochmal.');return}
  const W=96,H=Math.max(8,Math.round(96*S.nh/S.nw)),cv=mk(W,H),x=cv.getContext('2d',{willReadFrequently:true});try{x.drawImage(S.src,0,0,W,H)}catch{toast('Das Bild konnte nicht gelesen werden.');return}
  const d=x.getImageData(0,0,W,H).data,px=[],ring=Math.max(2,Math.round(W*.06));for(let y=0;y<H;y++)for(let xx=0;xx<W;xx++){if(xx>=ring&&xx<W-ring&&y>=ring&&y<H-ring)continue;const i=(y*W+xx)*4;px.push([d[i],d[i+1],d[i+2]])}
  const med=[0,1,2].map(k=>{const a=px.map(p=>p[k]).sort((p,q)=>p-q);return a[a.length>>1]}),near=px.filter(p=>Math.hypot(p[0]-med[0],p[1]-med[1],p[2]-med[2])<70).length/px.length;
  let col=veHex2(med),guess=false;if(near<.5){col='#00ff00';guess=true}
  c.key={...(c.key||{}),on:true,color:col,sim:c.key&&c.key.on?c.key.sim??.13:.13,smooth:c.key&&c.key.on?c.key.smooth??.08:.08};VE.sel=c.id;veCommit();veAll();
  toastAct(guess?'Ich habe keinen einfarbigen Rand gefunden und Grün genommen. Mit der Pipette kannst du die Farbe antippen.':'Greenscreen entfernt.','Rückgängig',()=>veUndo(-1))}
function veKeyPick(c){if(!c)return;if(VE.pick===c.id){VE.pick=null;veProps();veLib();return}VE.pick=c.id;VE.sel=c.id;veTimeline();veProps();veLib();toast('Tippe im Vorschaubild auf die Hintergrundfarbe.')}
document.addEventListener('pointerdown',async e=>{if(!VE.pick||!e.target||e.target.id!=='ve-cv')return;e.preventDefault();e.stopImmediatePropagation();const c=veFind(VE.pick);VE.pick=null;if(!c){veProps();return}
  const S=await veKeySrc(c),cv=e.target,r=cv.getBoundingClientRect(),[BW,BH]=veBase(),g=veGeo(c,VE.t,null,1);if(!S||!g){veProps();return}
  const bx=(e.clientX-r.left)/r.width*BW,by=(e.clientY-r.top)/r.height*BH,co=Math.cos(g.r),si=Math.sin(g.r),dx=bx-g.x,dy=by-g.y;let lx=dx*co+dy*si,ly=-dx*si+dy*co;if(c.flip)lx=-lx;const u=lx/g.w+.5,v=ly/g.h+.5;
  if(u<0||u>1||v<0||v>1){toast('Tippe direkt auf den Clip.');veProps();return}const cr=c.crop||{},sx=((cr.l||0)+u*(1-(cr.l||0)-(cr.r||0)))*S.nw,sy=((cr.t||0)+v*(1-(cr.t||0)-(cr.b||0)))*S.nh;
  const t=mk(1,1),x=t.getContext('2d',{willReadFrequently:true});try{x.drawImage(S.src,Math.max(0,sx-1),Math.max(0,sy-1),3,3,0,0,1,1)}catch{veProps();return}const p=x.getImageData(0,0,1,1).data;
  c.key={...(c.key||{}),on:true,color:veHex2([p[0],p[1],p[2]]),sim:c.key&&c.key.on?c.key.sim??.13:.13,smooth:c.key&&c.key.on?c.key.smooth??.08:.08};veCommit();veAll();veUndoToast('Farbe entfernt.')},true);

/* ---------- Speicher-Limiter: Rendernail bleibt unter 4 GB Arbeitsspeicher ----------
   Mac-App: der echte Verbrauch aller App-Prozesse wird alle 2 s gemessen. Browser: Rendernail schätzt seinen Verbrauch
   (Bilder, Ton, Videos, Verlauf, Export, KI). Stufen: ab 2,4 GB aufräumen, ab 3 GB gründlich aufräumen und sparsamer laden,
   ab 3,6 GB Hintergrund-Aufgaben und Export stoppen. Große Aufgaben starten nur, wenn sie unter die Grenze passen. */
const VE_MEM={limit:4e9,soft:2.4e9,hard:3e9,stop:3.6e9,native:0,nativeAt:0,warnAt:-1e9,lowAt:0};
function veMemEstimate(){let b=260e6;for(const e of VE.imgs.values())b+=e.bytes||0;for(const p of VE.abufs.values())b+=p._bytes||0;
  for(const e of VE.els.values())if(e._has)b+=e.videoWidth?e.videoWidth*e.videoHeight*4*10+25e6:12e6;
  for(const s of VE.hist||[])b+=s.length*2;b+=(VE.sinkBytes||0)+(VE_JOBS.reduce((a,j)=>a+(j.bytes||0),0));
  if(performance.memory&&performance.memory.usedJSHeapSize)b+=performance.memory.usedJSHeapSize;return b}
function veMemNow(){const est=veMemEstimate();return performance.now()-VE_MEM.nativeAt<6000&&VE_MEM.native?Math.max(VE_MEM.native,est*.6):est}
function veMemFmt(b){return(Math.round(b/1e8)/10).toLocaleString(LANG==='en'?'en':'de-DE')+' GB'}
/* Passt eine Aufgabe mit „need“ Bytes noch unter die Grenze? Sonst erst aufräumen, dann ehrlich Nein sagen. */
function veMemOk(need,quiet){if(veMemNow()+need<=VE_MEM.hard)return true;veMemTrim(true);if(veMemNow()+need<=VE_MEM.hard)return true;
  if(!quiet)toast('Dafür reicht der Arbeitsspeicher gerade nicht: Rendernail bleibt unter 4 GB. Schließe andere große Projekte oder nimm einen kürzeren Ausschnitt.');
  else if(quiet===true&&performance.now()-VE_MEM.warnAt>30000){VE_MEM.warnAt=performance.now();toast('Eine sehr große Datei wird sparsam behandelt, damit Rendernail unter 4 GB bleibt.')}return false}
function veMemGuard(){if(!VE.p)return;const m=veMemNow(),now=performance.now();
  if(m>VE_MEM.soft)veMemTrim(false);
  if(m>VE_MEM.hard){veMemTrim(true);VE.lowMem=true;VE_MEM.lowAt=now;if(now-VE_MEM.warnAt>60000){VE_MEM.warnAt=now;toast('Der Arbeitsspeicher wird knapp. Ich habe aufgeräumt, damit Rendernail unter 4 GB bleibt.')}}
  else if(VE.lowMem&&m<VE_MEM.soft&&now-VE_MEM.lowAt>30000)VE.lowMem=false;
  if(m>VE_MEM.stop&&VE_JOBS.length){for(const j of[...VE_JOBS])j.stop();toast('Hintergrund-Aufgaben gestoppt, damit Rendernail unter 4 GB Arbeitsspeicher bleibt.')}}
setInterval(veMemGuard,3000);
if(window.rnNative&&typeof rnNative.onMemory==='function')rnNative.onMemory(b=>{if(typeof b==='number'&&b>0){VE_MEM.native=b;VE_MEM.nativeAt=performance.now()}veMemGuard()});

/* ---------- Export-Fenster: Qualität und Bildrate klar wählen, Dateigröße vorher sehen ---------- */
function veExBitrate(W,H){return W*H>=6e6?36e6:H>=1080||W>=1080?12e6:8e6}
function veExportSheet(){if(VE.busy||!VE.p)return;const P=VE.p,D=veDur();if(D<.05){toast('Füge zuerst ein Video oder Bild hinzu.');return}vePause();
  const d=document.createElement('dialog');d.className='ask-dlg ve-exdlg';d.innerHTML='<form method="dialog"><h3>Video exportieren</h3><div class="ve-exq" role="radiogroup" aria-label="Qualität"></div><div class="ve-exf"></div><p class="sub ve-exinfo"></p><div class="ask-btns"><button type="button" class="btn ghost" data-x>Abbrechen</button><button class="btn primary" data-go autofocus>Exportieren</button></div></form>';
  const Q=[[0,'720p','Schnell, kleine Datei'],[1,'1080p','Empfohlen für YouTube und TikTok'],[2,'4K','Beste Qualität, große Datei']],q=d.querySelector('.ve-exq'),info=d.querySelector('.ve-exinfo');
  const paint=()=>{q.innerHTML='';for(const[v,n,t]of Q){const b=document.createElement('button');b.type='button';b.className='ve-exopt';b.setAttribute('role','radio');b.setAttribute('aria-checked',P.q===v);b.innerHTML='<b></b><span></span>';b.querySelector('b').textContent=n;b.querySelector('span').textContent=t;b.addEventListener('click',()=>{P.q=v;veCommit();paint()});q.append(b)}
    const[BW,BH]=veBase(),sc=P.q===2?2:P.q?1:2/3,W=Math.round(BW*sc/2)*2,H=Math.round(BH*sc/2)*2,mb=(veExBitrate(W,H)+160e3)*D/8/1e6;
    info.textContent=`${tr('Länge')} ${veFmt(D)} · ${W} × ${H} · ${tr('ca.')} ${mb<1000?Math.max(1,Math.round(mb))+' MB':(Math.round(mb/100)/10).toLocaleString(LANG==='en'?'en':'de-DE')+' GB'}`};
  const f=d.querySelector('.ve-exf');vSeg(f,'Bilder pro Sekunde',[[24,'24'],[30,'30'],[60,'60']],()=>P.fps,v=>{P.fps=+v;paint()});paint();
  d.querySelector('[data-x]').addEventListener('click',()=>d.close());d.querySelector('form').addEventListener('submit',e=>{e.preventDefault();d.close();veExport()});
  d.addEventListener('close',()=>{d.remove();veProps()});document.body.append(d);d.showModal()}

/* ---------- Rundgang beim ersten Öffnen (später über „?“ wieder aufrufbar) ---------- */
function veTour(force){if(!force&&store.get('ve-tour',false))return;if(document.querySelector('.ve-tour'))return;store.set('ve-tour',true);const sm=veSmall();
  const S=[[sm?'#ve-dock':'#ve-tabs','Einfügen',sm?'Hier unten fügst du Videos, Bilder, Text, Sticker, GIFs und Musik ein. Unter „Profi“ gibt es Untertitel, Greenscreen und mehr, alles gratis.':'Hier fügst du Videos, Bilder, Text, Sticker, GIFs und Musik ein. Unter „Profi“ gibt es Untertitel, Greenscreen und mehr, alles gratis.'],
    ['.ve-tl','Zeitleiste','Hier liegen deine Clips. Ziehen verschiebt sie, an den Rändern kürzt du sie, „Teilen“ schneidet am Zeitregler.'],
    [sm?'#ve-dock':'#ve-props','Bearbeiten',sm?'Tippe einen Clip an: Dann erscheinen hier unten seine Werkzeuge, z. B. Tempo, Ton, Filter oder Greenscreen.':'Tippe einen Clip an: Hier erscheinen dann seine Werkzeuge in Reitern, z. B. Tempo, Ton, Filter oder Greenscreen.'],
    ['#ve-export','Fertig?','„Exportieren“ macht daraus ein MP4-Video. Alles speichert sich automatisch. Hilfe findest du jederzeit beim „?“.']];
  let i=0;const ov=document.createElement('div');ov.className='ve-tour';ov.innerHTML='<div class="ve-tourhole"></div><div class="ve-tourbox" role="dialog" aria-live="polite"><span class="ve-tourn"></span><b></b><p></p><div class="btnrow"><button type="button" class="btn ghost sm" data-s>Überspringen</button><button type="button" class="btn primary sm" data-n>Weiter</button></div></div>';document.body.append(ov);
  const hole=ov.querySelector('.ve-tourhole'),box=ov.querySelector('.ve-tourbox'),end=()=>{ov.remove();removeEventListener('resize',show)};
  const show=()=>{const[sel,t,x]=S[i],el=document.querySelector(sel);if(!el||!el.offsetParent){if(i<S.length-1){i++;show()}else end();return}const r=el.getBoundingClientRect(),p=6;
    Object.assign(hole.style,{left:(r.left-p)+'px',top:(r.top-p)+'px',width:(r.width+p*2)+'px',height:(r.height+p*2)+'px'});box.querySelector('.ve-tourn').textContent=(i+1)+' / '+S.length;box.querySelector('b').textContent=tr(t);box.querySelector('p').textContent=tr(x);box.querySelector('[data-n]').textContent=tr(i===S.length-1?'Los geht’s':'Weiter');
    const bw=Math.min(320,innerWidth-24);box.style.width=bw+'px';const below=r.bottom+12+170<innerHeight,left=clamp(r.left+r.width/2-bw/2,12,innerWidth-bw-12);box.style.left=left+'px';box.style.top=(below?r.bottom+12:Math.max(12,r.top-12-box.offsetHeight))+'px'};
  ov.querySelector('[data-s]').addEventListener('click',end);ov.querySelector('[data-n]').addEventListener('click',()=>{if(++i>=S.length)end();else show()});addEventListener('resize',show);requestAnimationFrame(show)}
