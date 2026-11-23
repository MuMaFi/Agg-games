'use strict';
/* ================= Start, Modus und Einstellungen =================
   Erster Start: Installieren → Startanimation → „Professionell oder Simpel?“.
   Danach: kurze Startanimation. Der Modus lässt sich in den Einstellungen ändern. */
const SHELL={mode:store.get('rn-mode',null),sound:store.get('rn-sound',true),anim:store.get('rn-anim',true),seen:!!store.get('rn-seen',false)};
let audioCtx=null;
function unlockAudio(){try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==='suspended')audioCtx.resume()}catch{}}
document.addEventListener('pointerdown',unlockAudio,{capture:true});
/* Eigener kurzer Startklang: weicher „Plopp“ plus aufsteigendes Arpeggio mit leichtem Echo */
function playChime(){const a=audioCtx;if(!SHELL.sound||!a||a.state!=='running')return;
  const t=a.currentTime+.03,out=a.createGain(),lp=a.createBiquadFilter(),dly=a.createDelay(),fb=a.createGain();
  out.gain.value=.2;lp.type='lowpass';lp.frequency.value=3400;dly.delayTime.value=.14;fb.gain.value=.26;
  out.connect(lp);lp.connect(a.destination);lp.connect(dly);dly.connect(fb);fb.connect(dly);dly.connect(a.destination);
  const pop=a.createOscillator(),pe=a.createGain();pop.type='sine';pop.frequency.setValueAtTime(190,t);pop.frequency.exponentialRampToValueAtTime(70,t+.18);
  pe.gain.setValueAtTime(.55,t);pe.gain.exponentialRampToValueAtTime(.001,t+.22);pop.connect(pe);pe.connect(out);pop.start(t);pop.stop(t+.25);
  [[523.25,.06],[659.25,.14],[783.99,.22],[1046.5,.32]].forEach(([f,dt],n)=>{for(const[type,det,g]of[['triangle',0,.5],['sine',7,.32],['square',-6,.05]]){
    const o=a.createOscillator(),e=a.createGain();o.type=type;o.frequency.value=f;o.detune.value=det;const len=n===3?.95:.32;
    e.gain.setValueAtTime(0,t+dt);e.gain.linearRampToValueAtTime(g,t+dt+.012);e.gain.exponentialRampToValueAtTime(.0008,t+dt+len);o.connect(e);e.connect(out);o.start(t+dt);o.stop(t+dt+len+.05)}})}
function splash(next){const s=$('#splash');if(!SHELL.anim){next&&next();return}
  s.hidden=false;s.classList.remove('go');void s.offsetWidth;s.classList.add('go');playChime();
  setTimeout(()=>{s.hidden=true;s.classList.remove('go');next&&next()},1500)}
function afterSplash(){if(!SHELL.mode)showChooser()}
/* Aufruf aus rk-pack: nach der Prüfung (Paket da?) und wenn der Installations-Bildschirm zugeht */
function shellPackState(hasPack){if(!SHELL.seen&&hasPack){SHELL.seen=true;store.set('rn-seen',true);splash(afterSplash)}}
let gateClosedOnce=false;
function onGateClosed(){if(gateClosedOnce)return;gateClosedOnce=true;const first=!SHELL.seen;SHELL.seen=true;store.set('rn-seen',true);if(first)splash(afterSplash);else afterSplash()}
if(SHELL.seen)splash(afterSplash);

function showChooser(){const c=$('#chooser');c.hidden=false;c.querySelectorAll('[data-mode]').forEach(b=>{b.onclick=()=>{setMode(b.dataset.mode);c.hidden=true;toast(b.dataset.mode==='simple'?'Simpel ist aktiv. Leg los mit „Neues Thumbnail“.':'Professionell ist aktiv. Leg los mit „Neue Datei“.')}});setTimeout(()=>{const f=c.querySelector('[data-mode]');f&&f.focus()},50)}
function setMode(m){SHELL.mode=m;store.set('rn-mode',m);applyMode()}
function applyMode(){const simple=SHELL.mode==='simple';document.body.classList.toggle('simple',simple);
  const side=$('#side'),dock=$('#dock'),layers=$('.dock-layers');
  if(simple&&layers.parentNode!==side)side.append(layers);if(!simple&&layers.parentNode!==dock)dock.append(layers);
  $('.home h1').textContent=simple?'Was machst du heute?':'Willkommen bei Rendernail';
  $('.home .lead').textContent=simple?'Starte ein neues Thumbnail, mach da weiter, wo du aufgehört hast, oder fang mit einer Vorlage an.':'Minecraft-Figuren posieren und Thumbnails gestalten. Wähle ein Format oder öffne eine zuletzt verwendete Datei.';
  document.querySelectorAll('.home h2')[0].firstChild.textContent=simple?'Neues Thumbnail':'Neue Datei';
  document.querySelectorAll('.home h2')[1].firstChild.textContent=simple?'Deine Thumbnails ':'Zuletzt verwendet ';
  if(typeof buildProps==='function'&&ED.p){buildProps();buildSelbar();requestRender()}
  if(typeof resize3==='function')setTimeout(resize3,50)}
applyMode();

/* Einstellungen */
const setDlg=$('#settings');
function openSettings(){const b=$('#set-body');b.innerHTML='';
  const sec=t=>{const d=document.createElement('section');d.className='set-sec';const h=document.createElement('h3');h.textContent=t;d.append(h);b.append(d);return d};
  const s1=sec('Oberfläche'),modes=document.createElement('div');modes.className='modes small';s1.append(modes);
  for(const[k,n,d]of[['simple','Simpel','Große Knöpfe, nur das Wichtigste'],['pro','Professionell','Wie Photoshop: Menüs, Zahlenfelder, Bedienfelder']]){
    const btn=document.createElement('button');btn.type='button';btn.className='mode';btn.setAttribute('aria-pressed',SHELL.mode===k);btn.innerHTML=`<span class="mock ${k}"><i></i><i></i><i></i></span><b></b><span></span>`;btn.querySelector('b').textContent=n;btn.querySelector('b+span').textContent=d;
    btn.addEventListener('click',()=>{setMode(k);modes.querySelectorAll('.mode').forEach(x=>x.setAttribute('aria-pressed',x===btn))});modes.append(btn)}
  const s2=sec('Start');
  for(const[k,label]of[['sound','Startklang abspielen'],['anim','Startanimation zeigen']]){const l=document.createElement('label');l.className='row check';l.innerHTML='<input type="checkbox"><span></span>';l.querySelector('span').textContent=label;const i=l.querySelector('input');i.checked=!!SHELL[k];i.addEventListener('change',()=>{SHELL[k]=i.checked;store.set('rn-'+k,i.checked)});s2.append(l)}
  const tb=document.createElement('button');tb.type='button';tb.className='btn sm';tb.textContent='Startanimation jetzt ansehen';tb.addEventListener('click',()=>{unlockAudio();setDlg.close();splash()});s2.append(tb);
  const s3=sec('Minecraft-Texturen'),st=document.createElement('p');st.className='sub';st.textContent=PACK?'Installiert: '+PACK.name:'Nicht installiert, es werden eigene Grafiken genutzt.';s3.append(st);
  const row=document.createElement('div');row.className='btnrow';s3.append(row);
  const add=(t,fn,c)=>{const x=document.createElement('button');x.type='button';x.className='btn sm'+(c?' '+c:'');x.textContent=t;x.addEventListener('click',fn);row.append(x)};
  if(window.RK_LOCAL)add(PACK?'Neu von Mojang laden':'Von Mojang installieren',()=>{setDlg.close();loadPackMojang()});
  add('Eigene .jar oder Texturpaket',()=>{setDlg.close();$('#f-pack').click()});if(PACK)add('Entfernen',()=>{removePack();openSettings()},'ghost');
  if(!setDlg.open)setDlg.showModal()}
$('#set-open').addEventListener('click',openSettings);
$('#set-close').addEventListener('click',()=>setDlg.close());
setDlg.addEventListener('click',e=>{if(e.target===setDlg)setDlg.close()});
