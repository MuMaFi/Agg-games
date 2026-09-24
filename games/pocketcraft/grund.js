/* Pocketcraft · Grundlagen: Matrizen, Zufall, Rauschen */
'use strict';

/* ═══════════════════════════════════════════════════════════════════
   TASCHENWELT — Survival-Voxelspiel, ein File, kein CDN.
   1) Mathe + Rauschen  2) Texturen  3) Blöcke & Gegenstände
   ═══════════════════════════════════════════════════════════════════ */


/* ── 1. Mathe ──────────────────────────────────────────────────────── */
const M4 = {
  create(){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); },
  persp(out, fovy, asp, near, far){
    const f = 1/Math.tan(fovy/2), nf = 1/(near-far);
    out[0]=f/asp; out[1]=0; out[2]=0; out[3]=0;
    out[4]=0; out[5]=f; out[6]=0; out[7]=0;
    out[8]=0; out[9]=0; out[10]=(far+near)*nf; out[11]=-1;
    out[12]=0; out[13]=0; out[14]=2*far*near*nf; out[15]=0; return out;
  },
  ortho(out,l,r,b,t,n,f){
    const lr=1/(l-r), bt=1/(b-t), nf=1/(n-f);
    out.set([-2*lr,0,0,0, 0,-2*bt,0,0, 0,0,2*nf,0, (l+r)*lr,(t+b)*bt,(f+n)*nf,1]); return out;
  },
  ident(out){ out.set([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]); return out; },
  mul(out,a,b){
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7],
          a20=a[8],a21=a[9],a22=a[10],a23=a[11],a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    for(let i=0;i<4;i++){
      const b0=b[i*4],b1=b[i*4+1],b2=b[i*4+2],b3=b[i*4+3];
      out[i*4]  =b0*a00+b1*a10+b2*a20+b3*a30;
      out[i*4+1]=b0*a01+b1*a11+b2*a21+b3*a31;
      out[i*4+2]=b0*a02+b1*a12+b2*a22+b3*a32;
      out[i*4+3]=b0*a03+b1*a13+b2*a23+b3*a33;
    } return out;
  },
  translate(out,a,x,y,z){ if(out!==a) out.set(a);
    out[12]=a[0]*x+a[4]*y+a[8]*z+a[12]; out[13]=a[1]*x+a[5]*y+a[9]*z+a[13];
    out[14]=a[2]*x+a[6]*y+a[10]*z+a[14]; out[15]=a[3]*x+a[7]*y+a[11]*z+a[15]; return out; },
  scale(out,a,x,y,z){ for(let i=0;i<4;i++){ out[i]=a[i]*x; out[4+i]=a[4+i]*y; out[8+i]=a[8+i]*z; out[12+i]=a[12+i]; } return out; },
  rotY(out,a,r){ const s=Math.sin(r),c=Math.cos(r);
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a20=a[8],a21=a[9],a22=a[10],a23=a[11];
    if(out!==a) out.set(a);
    out[0]=a00*c-a20*s; out[1]=a01*c-a21*s; out[2]=a02*c-a22*s; out[3]=a03*c-a23*s;
    out[8]=a00*s+a20*c; out[9]=a01*s+a21*c; out[10]=a02*s+a22*c; out[11]=a03*s+a23*c; return out; },
  rotX(out,a,r){ const s=Math.sin(r),c=Math.cos(r);
    const a10=a[4],a11=a[5],a12=a[6],a13=a[7],a20=a[8],a21=a[9],a22=a[10],a23=a[11];
    if(out!==a) out.set(a);
    out[4]=a10*c+a20*s; out[5]=a11*c+a21*s; out[6]=a12*c+a22*s; out[7]=a13*c+a23*s;
    out[8]=a20*c-a10*s; out[9]=a21*c-a11*s; out[10]=a22*c-a12*s; out[11]=a23*c-a13*s; return out; },
  rotZ(out,a,r){ const s=Math.sin(r),c=Math.cos(r);
    const a00=a[0],a01=a[1],a02=a[2],a03=a[3],a10=a[4],a11=a[5],a12=a[6],a13=a[7];
    if(out!==a) out.set(a);
    out[0]=a00*c+a10*s; out[1]=a01*c+a11*s; out[2]=a02*c+a12*s; out[3]=a03*c+a13*s;
    out[4]=a10*c-a00*s; out[5]=a11*c-a01*s; out[6]=a12*c-a02*s; out[7]=a13*c-a03*s; return out; },
};
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
const TAU=Math.PI*2;

function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function hashStr(s){ let h=2166136261>>>0; for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); } return h>>>0; }

/* ── Perlin-Rauschen (2D/3D) mit fbm ───────────────────────────────── */
class Noise{
  constructor(seed){
    const rng = mulberry32(seed);
    const p = new Uint8Array(256);
    for(let i=0;i<256;i++) p[i]=i;
    for(let i=255;i>0;i--){ const j=(rng()*(i+1))|0; const t=p[i]; p[i]=p[j]; p[j]=t; }
    this.p = new Uint8Array(512);
    for(let i=0;i<512;i++) this.p[i]=p[i&255];
  }
  static fade(t){ return t*t*t*(t*(t*6-15)+10); }
  grad2(h,x,y){ switch(h&7){ case 0:return x+y; case 1:return -x+y; case 2:return x-y; case 3:return -x-y;
    case 4:return x; case 5:return -x; case 6:return y; default:return -y; } }
  n2(x,y){
    const p=this.p, X=Math.floor(x)&255, Y=Math.floor(y)&255;
    x-=Math.floor(x); y-=Math.floor(y);
    const u=Noise.fade(x), v=Noise.fade(y);
    const A=p[X]+Y, B=p[X+1]+Y;
    return lerp(lerp(this.grad2(p[A],x,y), this.grad2(p[B],x-1,y), u),
                lerp(this.grad2(p[A+1],x,y-1), this.grad2(p[B+1],x-1,y-1), u), v);
  }
  grad3(h,x,y,z){ const u=h<8?x:y, v=h<4?y:(h===12||h===14?x:z);
    return ((h&1)?-u:u)+((h&2)?-v:v); }
  n3(x,y,z){
    const p=this.p, X=Math.floor(x)&255, Y=Math.floor(y)&255, Z=Math.floor(z)&255;
    x-=Math.floor(x); y-=Math.floor(y); z-=Math.floor(z);
    const u=Noise.fade(x), v=Noise.fade(y), w=Noise.fade(z);
    const A=p[X]+Y, AA=p[A]+Z, AB=p[A+1]+Z, B=p[X+1]+Y, BA=p[B]+Z, BB=p[B+1]+Z;
    return lerp(lerp(lerp(this.grad3(p[AA],x,y,z), this.grad3(p[BA],x-1,y,z),u),
                     lerp(this.grad3(p[AB],x,y-1,z), this.grad3(p[BB],x-1,y-1,z),u),v),
                lerp(lerp(this.grad3(p[AA+1],x,y,z-1), this.grad3(p[BA+1],x-1,y,z-1),u),
                     lerp(this.grad3(p[AB+1],x,y-1,z-1), this.grad3(p[BB+1],x-1,y-1,z-1),u),v),w);
  }
  fbm2(x,y,oct,lac,gain){
    let a=1,f=1,s=0,n=0;
    for(let i=0;i<oct;i++){ s+=a*this.n2(x*f,y*f); n+=a; a*=gain; f*=lac; }
    return s/n;
  }
  fbm3(x,y,z,oct,lac,gain){
    let a=1,f=1,s=0,n=0;
    for(let i=0;i<oct;i++){ s+=a*this.n3(x*f,y*f,z*f); n+=a; a*=gain; f*=lac; }
    return s/n;
  }
}
