/* ================= GIFs: eigener Decoder (mit Speichergrenze) und GIPHY-Suche ================= */
/* Öffentlicher GIPHY-Schlüssel für alle (leer = jeder kann seinen eigenen in der App eintragen) */
const RN_GIPHY_KEY='';
const GIF_MAX_PX=16e6;      /* höchstens so viele Bildpunkte über alle Einzelbilder eines GIFs (≈ 64 MB) */
const GIF_MAX_FRAMES=400;

function gifIs(u8){return u8&&u8.length>6&&u8[0]===71&&u8[1]===73&&u8[2]===70&&u8[3]===56}
function gifParse(u8){let p=6;const r8=()=>u8[p++],r16=()=>{const v=u8[p]|(u8[p+1]<<8);p+=2;return v};
  const W=r16(),H=r16(),pk=r8();p+=2;let gct=null;if(pk&128){const n=2<<(pk&7);gct=u8.subarray(p,p+n*3);p+=n*3}
  const fr=[];let g={delay:0,disp:0,trans:-1};
  const skip=()=>{let s;while(p<u8.length&&(s=u8[p++]))p+=s};
  while(p<u8.length){const b=r8();
    if(b===0x3B)break;
    if(b===0x21){const lab=r8();if(lab===0xF9){const s=r8(),q=p;const f=u8[q],d=u8[q+1]|(u8[q+2]<<8),ti=u8[q+3];g={disp:(f>>2)&7,trans:f&1?ti:-1,delay:d};p+=s;skip()}else skip();continue}
    if(b===0x2C){const x=r16(),y=r16(),w=r16(),h=r16(),f=r8();let lct=null;if(f&128){const n=2<<(f&7);lct=u8.subarray(p,p+n*3);p+=n*3}
      const min=r8();let tot=0,q=p,s;while(q<u8.length&&(s=u8[q++])){tot+=s;q+=s}const data=new Uint8Array(tot);let o=0;while(p<u8.length&&(s=u8[p++])){data.set(u8.subarray(p,Math.min(u8.length,p+s)),o);o+=s;p+=s}
      fr.push({x,y,w,h,pal:lct||gct,inter:!!(f&64),min,data,delay:g.delay,disp:g.disp,trans:g.trans});g={delay:0,disp:0,trans:-1};continue}
    break}
  return{W,H,fr}}
function gifLZW(min,data,n){const out=new Uint8Array(n),clear=1<<min,eoi=clear+1;let size=min+1,mask=(1<<size)-1,next=eoi+1;
  const pre=new Int16Array(4096),suf=new Uint8Array(4096),st=new Uint8Array(4097);for(let i=0;i<clear;i++){pre[i]=-1;suf[i]=i}
  let bits=0,acc=0,dp=0,op=0,old=-1,first=0;
  while(op<n){while(bits<size){if(dp>=data.length)return out;acc|=data[dp++]<<bits;bits+=8}
    let code=acc&mask;acc>>>=size;bits-=size;
    if(code===clear){size=min+1;mask=(1<<size)-1;next=eoi+1;old=-1;continue}
    if(code===eoi)break;
    if(old===-1){if(code>=clear)continue;out[op++]=suf[code];old=code;first=code;continue}
    const inc=code;let sp=0;if(code>=next){st[sp++]=first;code=old}
    while(code>eoi){st[sp++]=suf[code];code=pre[code];if(sp>4096)return out}
    first=suf[code];st[sp++]=first;while(sp&&op<n)out[op++]=st[--sp];
    if(next<4096){pre[next]=old;suf[next]=first;next++;if(!(next&mask)&&next<4096){size++;mask=(1<<size)-1}}
    old=inc}
  return out}
/* Zerlegt ein GIF in fertige Einzelbilder (Canvas). Zu große GIFs werden verkleinert, zu viele Bilder ausgedünnt. */
async function gifDecode(u8){if(!gifIs(u8))return null;const G=gifParse(u8);if(!G.fr.length||!G.W||!G.H)return null;
  let step=1;while(G.fr.length/step>GIF_MAX_FRAMES)step++;const keep=Math.ceil(G.fr.length/step);
  const sc=Math.min(1,Math.sqrt(GIF_MAX_PX/(G.W*G.H*keep))),OW=Math.max(1,Math.round(G.W*sc)),OH=Math.max(1,Math.round(G.H*sc));
  const full=mk(G.W,G.H),fx=full.getContext('2d',{willReadFrequently:true}),img=fx.createImageData(G.W,G.H),px=img.data;let save=null;
  const frames=[];let t=0,acc=0,prev=null;
  for(let i=0;i<G.fr.length;i++){const f=G.fr[i];
    if(prev){if(prev.disp===2){for(let yy=prev.y;yy<Math.min(G.H,prev.y+prev.h);yy++){const o=(yy*G.W+prev.x)*4;px.fill(0,o,o+Math.max(0,Math.min(prev.w,G.W-prev.x))*4)}}else if(prev.disp===3&&save)px.set(save)}
    if(f.disp===3)save=px.slice();
    const idx=gifLZW(f.min,f.data,f.w*f.h),pal=f.pal;
    if(pal){let rows=null;if(f.inter){rows=new Int32Array(f.h);let r=0;for(const[s0,st]of[[0,8],[4,8],[2,4],[1,2]])for(let yy=s0;yy<f.h;yy+=st)rows[r++]=yy}
      for(let r=0;r<f.h;r++){const yy=f.y+(rows?rows[r]:r);if(yy>=G.H)continue;for(let xx=0;xx<f.w;xx++){const X=f.x+xx;if(X>=G.W)continue;const c=idx[r*f.w+xx];if(c===f.trans)continue;const o=(yy*G.W+X)*4,pc=c*3;px[o]=pal[pc];px[o+1]=pal[pc+1];px[o+2]=pal[pc+2];px[o+3]=255}}}
    const d=(f.delay<=1?10:f.delay)/100;acc+=d;
    if(i%step===0||i===G.fr.length-1&&!frames.length){fx.putImageData(img,0,0);const c=mk(OW,OH),cx=c.getContext('2d');cx.imageSmoothingQuality='high';cx.drawImage(full,0,0,OW,OH);frames.push({c,t});t+=acc;acc=0}
    else if(frames.length)t+=0;
    prev=f;if(i%12===11)await new Promise(r=>setTimeout(r,0))}
  if(acc&&frames.length)t+=acc;
  /* Zeitpunkte gleichmäßig auf die echte Gesamtdauer verteilen */
  let dur=0;for(const f of G.fr)dur+=(f.delay<=1?10:f.delay)/100;dur=Math.max(.05,dur);
  if(step>1)frames.forEach((f,i)=>{f.t=i*dur/frames.length});
  return{W:G.W,H:G.H,w:OW,h:OH,frames,dur,bytes:OW*OH*4*frames.length}}
function gifFrameAt(g,lt){if(!g.frames.length)return null;if(g.frames.length===1)return g.frames[0].c;let t=((lt%g.dur)+g.dur)%g.dur,lo=0,hi=g.frames.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(g.frames[m].t<=t)lo=m;else hi=m-1}return g.frames[lo].c}
function gifFree(g){if(!g)return;for(const f of g.frames){f.c.width=f.c.height=0}g.frames=[]}

/* ---------- GIPHY ---------- */
function giphyKey(){return(store.get('rn-giphy-key','')||RN_GIPHY_KEY||'').trim()}
async function giphyApi(path,params){const k=giphyKey();if(!k)throw Object.assign(new Error('nokey'),{code:'nokey'});
  const u=new URL('https://api.giphy.com/v1/'+path);u.searchParams.set('api_key',k);u.searchParams.set('rating','pg');for(const[a,b]of Object.entries(params||{}))u.searchParams.set(a,b);
  const r=await fetch(u);if(r.status===401||r.status===403)throw Object.assign(new Error('badkey'),{code:'badkey'});if(r.status===429)throw Object.assign(new Error('rate'),{code:'rate'});if(!r.ok)throw new Error('http '+r.status);return r.json()}
function giphyPick(it){const im=it.images||{};for(const k of['downsized_medium','downsized','original','fixed_height']){const x=im[k];if(x&&x.url&&(+x.size||0)<=8e6)return x.url}return(im.fixed_height||{}).url||''}
