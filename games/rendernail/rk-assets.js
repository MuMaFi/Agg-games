'use strict';
/* ================= Pixel-Sprites ================= */
const OUTLINE='#15161b';
function spriteGrid(n,draw,outline=OUTLINE){
  const g=[];for(let y=0;y<n;y++)g.push(new Array(n).fill(null));
  const P={
    set(x,y,c){x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<n&&y<n)g[y][x]=c},
    get(x,y){return g[y]?g[y][x]:null},
    line(x0,y0,x1,y1,c){const dx=Math.abs(x1-x0),dy=Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx-dy;for(let k=0;k<200;k++){this.set(x0,y0,c);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>-dy){e-=dy;x0+=sx}if(e2<dx){e+=dx;y0+=sy}}},
    rect(x,y,w,h,c){for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)this.set(i,j,c)},
    disc(cx,cy,r,c){for(let y=0;y<n;y++)for(let x=0;x<n;x++)if((x-cx)**2+(y-cy)**2<=r*r)this.set(x,y,c)},
    fill(fn){for(let y=0;y<n;y++)for(let x=0;x<n;x++){const c=fn(x,y);if(c)this.set(x,y,c)}}
  };
  draw(P);
  if(outline){const o=g.map(r=>r.slice());for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(!g[y][x]&&[[1,0],[-1,0],[0,1],[0,-1]].some(([a,b])=>g[y+b]&&g[y+b][x+a]))o[y][x]=outline;return o}
  return g}
function gridCanvas(g,scale=1){const n=g.length,c=mk(n*scale,n*scale),x=c.getContext('2d');for(let y=0;y<n;y++)for(let X=0;X<n;X++)if(g[y][X]){x.fillStyle=g[y][X];x.fillRect(X*scale,y*scale,scale,scale)}return c}
function upscale(c,f){const o=mk(c.width*f,c.height*f),x=o.getContext('2d');x.imageSmoothingEnabled=false;x.drawImage(c,0,0,o.width,o.height);return o}

const SW=(l,m,g,h)=>P=>{P.line(5,10,13,2,m);P.line(6,10,13,3,m);P.line(5,9,12,2,l);P.set(13,2,l);P.line(3,10,6,13,g);P.line(4,9,7,12,g);P.line(2,13,4,11,h);P.set(1,14,g)};
const PICK=(h1,h2)=>P=>{P.line(3,13,10,6,'#7a5432');P.line(4,13,11,6,'#5a3d22');P.line(5,3,9,2,h1);P.line(9,2,12,3,h1);P.line(12,3,13,6,h1);P.line(13,6,14,10,h1);P.line(6,4,9,3,h2);P.line(9,3,11,4,h2);P.line(12,4,12,6,h2);P.line(12,6,13,10,h2)};
const APPLE=(b,hi,dk)=>P=>{P.disc(7.5,9,5,b);P.fill((x,y)=>P.get(x,y)&&y>=12?dk:null);P.set(5,7,hi);P.set(5,8,hi);P.set(6,6,hi);P.rect(7,2,1,3,'#5a3d22');P.set(8,3,'#3f9a3a');P.set(9,3,'#3f9a3a');P.set(9,2,'#3f9a3a')};
const POTION=liq=>P=>{P.rect(7,1,2,1,'#8a5a2b');P.rect(7,2,2,3,'#d6eef5');P.disc(7.5,10,4.6,'#d6eef5');P.fill((x,y)=>P.get(x,y)&&y>=8&&(x-7.5)**2+(y-10)**2<=13?liq:null);P.set(5,9,'#ffffff');P.set(5,10,'#ffffff')};
const ITEM_DEFS=[
  ['sw_diamond','Diamantschwert',SW('#c8fff6','#3fd6c6','#2a8a84','#6b4a2b')],
  ['sw_iron','Eisenschwert',SW('#ffffff','#c7cbd1','#6d737c','#6b4a2b')],
  ['sw_gold','Goldschwert',SW('#fff6bf','#f2c94c','#b8860b','#6b4a2b')],
  ['sw_dark','Obsidianschwert',SW('#a596ad','#4f4258','#2c252b','#3b2f36')],
  ['sw_wood','Holzschwert',SW('#d8b27a','#a87d46','#6b4a2b','#5a3d22')],
  ['pk_diamond','Diamant-Spitzhacke',PICK('#3fd6c6','#a8fff2')],
  ['pk_iron','Eisen-Spitzhacke',PICK('#c7cbd1','#ffffff')],
  ['axe','Axt',P=>{P.line(3,13,10,6,'#7a5432');P.line(4,13,11,6,'#5a3d22');P.fill((x,y)=>x>=8&&x<=13&&y>=2&&y<=7&&(x+y)>=11?(x===13?'#ffffff':'#c7cbd1'):null)}],
  ['bow','Bogen',P=>{for(let t=0;t<=1.0001;t+=.02){const x=(1-t)**2*3+2*(1-t)*t*14.5+t*t*13,y=(1-t)**2*2+2*(1-t)*t*1.5+t*t*13;P.set(x,y,'#8a5a2b');P.set(x-.6,y+.6,'#6b4421')}P.line(3,2,13,13,'#e0e0e0')}],
  ['apple','Apfel',APPLE('#d63a32','#ff9a8a','#a52a24')],
  ['gapple','Goldapfel',APPLE('#f2c94c','#fff3b0','#c9962a')],
  ['diamond','Diamant',P=>P.fill((x,y)=>{const d=Math.abs(x-7.5)/6+Math.abs(y-7.5)/6.5;return d<=1?(x<8&&y<8?'#a8fff2':x>=8&&y>=8?'#1e9c90':'#3fd6c6'):null})],
  ['emerald','Smaragd',P=>{P.fill((x,y)=>{const ax=Math.abs(x-7.5),ay=Math.abs(y-7.5);return ax<=4&&ay<=6.5&&ax*1.3+ay<=8?(x<8?'#7ff0a0':'#2fae5b'):null});P.set(6,4,'#e0ffe8')}],
  ['ingot','Goldbarren',P=>P.fill((x,y)=>{if(y>=5&&y<=7&&x>=4+(7-y)&&x<=12)return'#fff1a6';if(y>=8&&y<=11&&x>=2&&x<=13)return y===11?'#b8860b':'#e9b93a';return null})],
  ['potion_red','Heiltrank',POTION('#e0445a')],
  ['potion_blue','Zaubertrank',POTION('#4a7cf0')],
  ['torch','Fackel',P=>{P.rect(7,6,2,9,'#7a5432');P.rect(7,6,1,9,'#94693f');P.rect(6,3,4,3,'#ff9a2a');P.rect(7,2,2,3,'#ffd23a');P.set(7,1,'#fff2a0')}],
  ['star','Stern',P=>{P.line(7,1,7,14,'#fff4b0');P.line(8,1,8,14,'#fff4b0');P.line(1,7,14,7,'#fff4b0');P.line(1,8,14,8,'#fff4b0');P.line(4,4,11,11,'#fff4b0');P.line(11,4,4,11,'#fff4b0');P.rect(5,5,6,6,'#ffffff');P.rect(6,6,4,4,'#fffbe0')}],
  ['cookie','Keks',P=>{P.disc(7.5,7.5,6,'#c98a4a');for(const[x,y]of[[5,5],[9,4],[10,9],[6,10],[4,8],[8,7]])P.set(x,y,'#4a2c17')}],
  ['shield','Schild',P=>P.fill((x,y)=>{if(y<2||y>13)return null;const hw=y<9?5.5:5.5-(y-9)*1.2;return Math.abs(x-7.5)<=hw?(Math.abs(x-7.5)>hw-1.2||y===2?'#c7cbd1':'#8a5a2b'):null})],
  ['xp','XP-Kugel',P=>{P.disc(7.5,7.5,4.6,'#7fd12a');P.disc(6.5,6.5,2,'#e9ff9a')}],
  ['pearl','Magische Perle',P=>{P.disc(7.5,7.5,5,'#1f6b62');P.disc(7.5,7.5,3,'#2fa592');P.disc(6.5,6.5,1.2,'#9ff5ea')}],
  ['bucket','Wassereimer',P=>{P.fill((x,y)=>y>=5&&y<=13&&Math.abs(x-7.5)<=5.5-(y-5)*.25?(y<=6?'#3c76d6':'#c7cbd1'):null);P.line(3,5,5,2,'#9aa0a8');P.line(5,2,10,2,'#9aa0a8');P.line(10,2,12,5,'#9aa0a8')}]
];
const ITEM16={};for(const[k,,fn]of ITEM_DEFS)ITEM16[k]=spriteGrid(16,fn);

/* ================= Block-Texturen ================= */
function tex16(seed,fn){const c=mk(16,16),x=c.getContext('2d'),id=x.createImageData(16,16),r=mulberry32(seed);
  for(let y=0;y<16;y++)for(let X=0;X<16;X++){const v=fn(X,y,r);if(!v)continue;const i=(y*16+X)*4;id.data[i]=v[0];id.data[i+1]=v[1];id.data[i+2]=v[2];id.data[i+3]=v[3]==null?255:v[3]}
  x.putImageData(id,0,0);return c}
const shc=(hex,f,a)=>{const c=hexRgb(hex);return[c[0]*f,c[1]*f,c[2]*f,a]};
const NZ=(r,amt)=>1+(r()-.5)*2*amt;
const edge=(x,y)=>x===0||y===0||x===15||y===15;
const ore=(spec)=>(x,y,r)=>{const s=hash3(Math.floor(x/2),Math.floor(y/2),spec.length*7);return s>.62?shc(spec,NZ(r,.12)):shc('#8a8c8e',NZ(r,.1))};
const BLOCK_DEFS=[
  ['grass','Grasblock',()=>({top:tex16(3,(x,y,r)=>shc('#69a84a',NZ(r,.17))),side:tex16(4,(x,y,r)=>(y<2||(y<4&&r()<.5))?shc('#69a84a',NZ(r,.15)):shc('#866043',NZ(r,.16)))})],
  ['dirt','Erde',()=>{const t=tex16(2,(x,y,r)=>shc('#866043',NZ(r,.16)*(r()<.08?.75:1)));return{top:t,side:t}}],
  ['stone','Stein',()=>{const t=tex16(5,(x,y,r)=>shc('#8a8c8e',NZ(r,.1)*((x+y*3)%7===0&&r()<.5?.85:1)));return{top:t,side:t}}],
  ['cobble','Bruchstein',()=>{const t=tex16(6,(x,y,r)=>shc('#848688',(y%4===0||(x+(Math.floor(y/4)%2)*2)%5===0)?.62:NZ(r,.13)));return{top:t,side:t}}],
  ['planks','Holzbretter',()=>{const t=tex16(7,(x,y,r)=>shc('#b18a52',y%4===3?.72:(x===(Math.floor(y/4)*5+3)%16?.8:NZ(r,.06))));return{top:t,side:t}}],
  ['log','Baumstamm',()=>({top:tex16(8,(x,y,r)=>{const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));return d>6.5?shc('#5a3f22',NZ(r,.1)):shc(Math.floor(d)%2?'#a3855a':'#8d6f48',NZ(r,.05))}),side:tex16(9,(x,y,r)=>shc('#6b4f2e',x%4===1?.78:NZ(r,.1)))})],
  ['leaves','Laub',()=>{const t=tex16(10,(x,y,r)=>shc('#3e8b37',r()<.2?.62:NZ(r,.15)));return{top:t,side:t}}],
  ['glass','Glas',()=>{const t=tex16(11,(x,y)=>edge(x,y)?[212,238,245,255]:((x===y+3||x===y+4)&&y<9)?[255,255,255,170]:[190,225,235,45]);return{top:t,side:t,alpha:true}}],
  ['sand','Sand',()=>{const t=tex16(12,(x,y,r)=>shc('#dccf98',NZ(r,.06)));return{top:t,side:t}}],
  ['brick','Ziegel',()=>{const t=tex16(13,(x,y,r)=>(y%4===3||(x+(Math.floor(y/4)%2)*4)%8===7)?shc('#c9c2b8',NZ(r,.04)):shc('#9a4c3b',NZ(r,.1)));return{top:t,side:t}}],
  ['snow','Schnee',()=>{const t=tex16(14,(x,y,r)=>shc('#f1f5f9',NZ(r,.03)));return{top:t,side:t}}],
  ['ice','Eis',()=>{const t=tex16(15,(x,y,r)=>(x+y)%9===0?shc('#d6ecff',1,230):shc('#9cc8f0',NZ(r,.05),225));return{top:t,side:t,alpha:true}}],
  ['obsidian','Obsidian',()=>{const t=tex16(16,(x,y,r)=>shc('#1d1430',NZ(r,.35)*(r()<.08?1.8:1)));return{top:t,side:t}}],
  ['netherrack','Höllenstein',()=>{const t=tex16(17,(x,y,r)=>shc('#7a2e2e',NZ(r,.25)));return{top:t,side:t}}],
  ['lava','Lava',()=>{const t=tex16(18,(x,y,r)=>shc(r()<.3?'#ffd23a':'#f37b1d',NZ(r,.1)));return{top:t,side:t,bright:true}}],
  ['water','Wasser',()=>{const t=tex16(19,(x,y,r)=>shc('#3c76d6',NZ(r,.08),205));return{top:t,side:t,alpha:true}}],
  ['diamondblock','Diamantblock',()=>{const t=tex16(20,(x,y,r)=>edge(x,y)?[240,255,252]:(x+y)%5===0?shc('#9ff5ea',1):shc('#45d0c4',NZ(r,.07)));return{top:t,side:t}}],
  ['goldblock','Goldblock',()=>{const t=tex16(21,(x,y,r)=>edge(x,y)?[255,242,168]:(x-y)%6===0?shc('#fff1a6',1):shc('#efc33f',NZ(r,.07)));return{top:t,side:t}}],
  ['diamondore','Diamanterz',()=>{const t=tex16(22,ore('#5fe3d6'));return{top:t,side:t}}],
  ['goldore','Golderz',()=>{const t=tex16(23,ore('#f2cf4a'));return{top:t,side:t}}],
  ['chest','Truhe',()=>{const wood=(x,y,r)=>(edge(x,y)||y===6)?shc('#3b2a17',1):shc('#a0703a',NZ(r,.08));
    return{top:tex16(24,wood),side:tex16(25,wood),front:tex16(26,(x,y,r)=>(x>=7&&x<=8&&y>=5&&y<=8)?shc('#c7cbd1',1):wood(x,y,r))}}]
];
const texAvg=new WeakMap();
function avgColor(c){let v=texAvg.get(c);if(v)return v;const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let r=0,g=0,b=0,n=0;for(let i=0;i<d.length;i+=4){if(d[i+3]<128)continue;r+=d[i];g+=d[i+1];b+=d[i+2];n++}v=n?`rgb(${r/n|0},${g/n|0},${b/n|0})`:'rgba(0,0,0,0)';texAvg.set(c,v);return v}
const CUBE_FACES=[
  {tex:'top',n:[0,1,0],tl:[-1,1,-1],tr:[1,1,-1],bl:[-1,1,1]},
  {tex:'bottom',n:[0,-1,0],tl:[-1,-1,1],tr:[1,-1,1],bl:[-1,-1,-1]},
  {tex:'front',n:[0,0,1],tl:[-1,1,1],tr:[1,1,1],bl:[-1,-1,1]},
  {tex:'side',n:[0,0,-1],tl:[1,1,-1],tr:[-1,1,-1],bl:[1,-1,-1]},
  {tex:'side',n:[1,0,0],tl:[1,1,1],tr:[1,1,-1],bl:[1,-1,1]},
  {tex:'side',n:[-1,0,0],tl:[-1,1,-1],tr:[-1,1,1],bl:[-1,-1,-1]}];
const CUBE_LIGHT=(()=>{const v=[-.5,.9,.9],l=Math.hypot(...v);return v.map(a=>a/l)})();
/* Würfel mit Texturen, frei drehbar: yaw = drehen, pitch = kippen, roll = rollen (Grad) */
function cubeCanvas(t,yaw=-45,pitch=30,roll=0){
  const S=384,c=mk(S,S),x=c.getContext('2d');x.imageSmoothingEnabled=false;
  const A=yaw*Math.PI/180,Bp=pitch*Math.PI/180,R=roll*Math.PI/180,ca=Math.cos(A),sa=Math.sin(A),cb=Math.cos(Bp),sb=Math.sin(Bp),cr=Math.cos(R),sr=Math.sin(R);
  const rot=([X,Y,Z])=>{const x1=X*cr-Y*sr,y1=X*sr+Y*cr,z1=Z;const x2=x1*ca+z1*sa,z2=-x1*sa+z1*ca;return[x2,y1*cb-z2*sb,y1*sb+z2*cb]};
  const s=S/2/1.8,P=v=>[S/2+v[0]*s,S/2-v[1]*s];
  const faces=CUBE_FACES.map(f=>({...f,rn:rot(f.n)}));
  const draw=f=>{const img=t[f.tex]||(f.tex==='bottom'?t.top:t.side);if(!img)return;
    const tl=P(rot(f.tl)),tr=P(rot(f.tr)),bl=P(rot(f.bl)),br=[tr[0]+bl[0]-tl[0],tr[1]+bl[1]-tl[1]];
    const d=f.rn[0]*CUBE_LIGHT[0]+f.rn[1]*CUBE_LIGHT[1]+f.rn[2]*CUBE_LIGHT[2],light=t.bright?1:.62+.38*Math.max(0,d);
    if(!t.alpha){x.fillStyle=avgColor(img);x.beginPath();x.moveTo(tl[0],tl[1]);x.lineTo(tr[0],tr[1]);x.lineTo(br[0],br[1]);x.lineTo(bl[0],bl[1]);x.closePath();x.fill()}
    x.save();x.setTransform((tr[0]-tl[0])/16,(tr[1]-tl[1])/16,(bl[0]-tl[0])/16,(bl[1]-tl[1])/16,tl[0],tl[1]);x.drawImage(img,0,0,img.width,img.width,0,0,16,16);
    if(light<.999){x.globalCompositeOperation='source-atop';x.fillStyle=`rgba(0,0,0,${1-light})`;x.fillRect(0,0,16,16)}x.restore()};
  if(t.alpha)faces.filter(f=>f.rn[2]<=1e-4).forEach(draw);
  faces.filter(f=>f.rn[2]>1e-4).forEach(draw);
  return c}
/* Bildschirm-Versatz eines Würfels um je einen Block entlang x, y, z: [dx, dy, Tiefe] in Würfel-Einheiten */
function cubeAxes(yaw=-45,pitch=30,roll=0){const A=yaw*Math.PI/180,Bp=pitch*Math.PI/180,R=roll*Math.PI/180,ca=Math.cos(A),sa=Math.sin(A),cb=Math.cos(Bp),sb=Math.sin(Bp),cr=Math.cos(R),sr=Math.sin(R);
  const rot=([X,Y,Z])=>{const x1=X*cr-Y*sr,y1=X*sr+Y*cr,z1=Z;const x2=x1*ca+z1*sa,z2=-x1*sa+z1*ca;return[x2,y1*cb-z2*sb,y1*sb+z2*cb]};
  return[[2,0,0],[0,2,0],[0,0,2]].map(v=>{const r=rot(v);return[r[0],-r[1],r[2]]})}
const ownTex=new Map(),blockTexCache=new Map();let packTick=0;
function ownBlockTex(k){let t=ownTex.get(k);if(!t){const d=BLOCK_DEFS.find(b=>b[0]===k);t=d?d[2]():{};if(k==='grass')t.bottom=ownBlockTex('dirt').top;ownTex.set(k,t)}return t}
function blockTex(k){let t=blockTexCache.get(k);if(!t){t=k.startsWith('pk:')?((typeof packDynTex==='function'&&packDynTex(k.slice(3)))||{}):((typeof packBlockTex==='function'&&packBlockTex(k))||ownBlockTex(k));blockTexCache.set(k,t)}return t}
const cubeCache=new Map();
function blockCanvas(k,yaw=-45,pitch=30,roll=0){const key=[k,Math.round(yaw*2),Math.round(pitch*2),Math.round(roll*2),packTick].join('|');let c=cubeCache.get(key);if(!c){if(cubeCache.size>160)cubeCache.clear();c=cubeCanvas(blockTex(k),yaw,pitch,roll);cubeCache.set(key,c)}return c}

/* ================= Mobs & Figuren ================= */
const C=(c,j=.06)=>({c,j});
function mobPig(){const S=new Scene(),pink=C('#efa3a0'),pd=C('#d98986');
  S.box(0,6,0,10,8,16,pink);for(const[x,z]of[[0,0],[7,0],[0,13],[7,13]])S.box(x,0,z,3,6,3,pd);
  S.box(1,8,16,8,8,7,pink);S.box(3,9,23,4,3,1,C('#f7c2bf',.02));S.set(3,10,23,C('#b5706c',0));S.set(6,10,23,C('#b5706c',0));
  S.set(2,13,22,C('#f5f5f5',0));S.set(3,13,22,C('#1d1d1d',0));S.set(6,13,22,C('#1d1d1d',0));S.set(7,13,22,C('#f5f5f5',0));return S}
function mobSheep(){const S=new Scene(),wool=C('#ecebe6',.08),skin=C('#c9b9a6');
  S.box(0,6,0,10,9,16,wool);for(const[x,z]of[[0,1],[7,1],[0,12],[7,12]])S.box(x,0,z,3,6,3,skin);
  S.box(2,9,16,6,6,7,skin);S.box(1,14,15,8,2,6,wool);
  S.set(2,12,22,C('#2a2a2a',0));S.set(3,12,22,C('#f5f5f5',0));S.set(6,12,22,C('#f5f5f5',0));S.set(7,12,22,C('#2a2a2a',0));S.set(4,10,22,C('#e7a9a3',0));S.set(5,10,22,C('#e7a9a3',0));return S}
function mobChicken(){const S=new Scene(),w=C('#f4f4f0',.04),y=C('#e8b13a',.04);
  S.box(0,4,0,6,6,8,w);S.box(-1,5,1,1,4,6,C('#e2e2dc',.04));S.box(6,5,1,1,4,6,C('#e2e2dc',.04));
  S.box(1,0,3,1,4,1,y);S.box(4,0,3,1,4,1,y);S.box(1,8,6,4,6,3,w);S.box(2,11,9,2,2,2,y);S.box(2,9,9,2,2,1,C('#c93a32',.03));
  S.set(1,12,8,C('#1d1d1d',0));S.set(4,12,8,C('#1d1d1d',0));return S}
function mobSlime(){const S=new Scene(),o={c:'#6cc24a',a:.72,j:.05},i=C('#4f9a36',.05),e=C('#1f3b17',0);
  S.box(0,0,0,12,12,12,o);S.box(3,3,3,6,6,6,i);for(const[x,yy]of[[2,7],[3,7],[2,8],[3,8],[8,7],[9,7],[8,8],[9,8],[5,4],[6,4]])S.set(x,yy,11,e);return S}
const FIGURES=[['fig_0','Wanderin winkt',0,'wave'],['fig_1','Schmied jubelt',1,'cheer'],['fig_2','Nachtwächter',2,'stand'],['fig_3','Gärtnerin winkt',3,'wave'],['mob_zombie','Zombie',4,'forward'],['mob_skel','Skelett',5,'stand']];

/* ================= HUD ================= */
const HEART=['.##.##.','#######','#######','#######','.#####.','..###..','...#...'];
function heartGrid(kind){return spriteGrid(9,P=>{HEART.forEach((r,y)=>[...r].forEach((ch,x)=>{if(ch!=='#')return;let c=(x<=2&&y===1)||(x===1&&y===2)?'#ff9aa0':y>=4?'#b5202a':'#e02f36';if(kind==='empty'||(kind==='half'&&x>3))c='#3d1418';P.set(x+1,y+1,c)}))})}
const DRUM=spriteGrid(9,P=>{P.disc(3,3,2.6,'#a8602e');P.set(2,2,'#d08a4e');P.line(5,5,7,7,'#efe7d6');P.set(7,6,'#efe7d6');P.set(6,7,'#efe7d6')});
const ARMOR=spriteGrid(9,P=>{P.fill((x,y)=>(y>=1&&y<=7&&x>=1&&x<=7&&!(y<=2&&x>=3&&x<=5))?(x<=2||y===1?'#e6e8ec':'#b9bec6'):null)});
const DIG={0:['###','#.#','#.#','#.#','###'],1:['.#.','##.','.#.','.#.','###'],2:['###','..#','###','#..','###'],3:['###','..#','###','..#','###'],4:['#.#','#.#','###','..#','..#'],5:['###','#..','###','..#','###'],6:['###','#..','###','#.#','###'],7:['###','..#','.#.','.#.','.#.'],8:['###','#.#','###','#.#','###'],9:['###','#.#','###','..#','###']};
function hudBar(grids,gap){const n=grids.length,c=mk(n*gap+1,9),x=c.getContext('2d');grids.forEach((g,i)=>x.drawImage(gridCanvas(g),i*gap,0));return upscale(c,8)}
function hudXP(){const c=mk(184,16),x=c.getContext('2d');
  x.fillStyle='#15161b';x.fillRect(0,9,184,7);x.fillStyle='#2a3a14';x.fillRect(1,10,182,5);x.fillStyle='#7fd12a';x.fillRect(1,10,118,5);x.fillStyle='#b9f25a';x.fillRect(1,10,118,1);
  const s='27',w=s.length*4-1,ox=92-Math.ceil(w/2);
  for(let pass=0;pass<2;pass++)[...s].forEach((d,i)=>DIG[d].forEach((r,yy)=>[...r].forEach((ch,xx)=>{if(ch!=='#')return;if(pass===0){x.fillStyle='#15161b';x.fillRect(ox+i*4+xx-1,1+yy-1,3,3)}else{x.fillStyle='#8cff3a';x.fillRect(ox+i*4+xx,1+yy,1,1)}})));
  return upscale(c,5)}
function hudHotbar(){const c=mk(182,22),x=c.getContext('2d');
  x.fillStyle='#15161b';x.fillRect(0,0,182,22);for(let i=0;i<9;i++){x.fillStyle='#8b8b8b';x.fillRect(1+i*20,1,20,20);x.fillStyle='#3a3a3a';x.fillRect(3+i*20,3,16,16)}
  ['sw_diamond','pk_diamond','apple','torch','bow','potion_red'].forEach((k,i)=>x.drawImage(gridCanvas(ITEM16[k]),3+i*20,3));
  x.strokeStyle='#ffffff';x.lineWidth=2;x.strokeRect(1,1,20,20);return upscale(c,5)}
function hudToast(title,line,icon){const c=mk(800,160),x=c.getContext('2d');
  x.fillStyle='#212121';x.fillRect(0,0,800,160);x.strokeStyle='#5a5a5a';x.lineWidth=8;x.strokeRect(4,4,792,152);x.strokeStyle='#0d0d0d';x.lineWidth=4;x.strokeRect(12,12,776,136);
  x.imageSmoothingEnabled=false;x.drawImage(gridCanvas(ITEM16[icon]),34,32,96,96);
  x.textBaseline='top';x.font='32px "Press Start 2P", monospace';x.fillStyle='#ffff55';x.fillText(title,160,40);x.fillStyle='#ffffff';x.fillText(line,160,92);return c}
function hudDeath(){const c=mk(1500,260),x=c.getContext('2d');x.textAlign='center';x.textBaseline='middle';x.font='72px "Press Start 2P", monospace';x.fillStyle='#3a0d0d';x.fillText('Du bist gestorben!',756,110);x.fillStyle='#ff5555';x.fillText('Du bist gestorben!',750,104);
  x.font='30px "Press Start 2P", monospace';x.fillStyle='#3a3a3a';x.fillText('Punkte: 1337',753,203);x.fillStyle='#ffff55';x.fillText('Punkte: 1337',750,200);return c}

/* ================= Effekte ================= */
function fxSparkle(col){const c=mk(512,512),x=c.getContext('2d'),r=mulberry32(4);
  const star=(cx,cy,s)=>{x.beginPath();x.moveTo(cx,cy-s);x.quadraticCurveTo(cx,cy,cx+s,cy);x.quadraticCurveTo(cx,cy,cx,cy+s);x.quadraticCurveTo(cx,cy,cx-s,cy);x.quadraticCurveTo(cx,cy,cx,cy-s);x.fill()};
  x.shadowColor=col;x.shadowBlur=26;x.fillStyle='#ffffff';
  [[256,256,150],[110,120,60],[410,140,70],[380,400,55],[120,390,45],[260,80,32],[460,300,26],[60,270,24]].forEach(([a,b,s])=>star(a,b,s));
  for(let i=0;i<14;i++){x.fillStyle=col;x.fillRect(40+r()*430,40+r()*430,8,8)}return c}
function fxExplosion(){const c=mk(512,512),x=c.getContext('2d'),r=mulberry32(9);
  for(let i=0;i<26;i++){const a=r()*6.28,d=150+r()*90,s=26+r()*46;x.fillStyle=`rgba(${70+r()*40|0},${70+r()*40|0},${70+r()*40|0},.85)`;x.fillRect(256+Math.cos(a)*d-s/2,256+Math.sin(a)*d-s/2,s,s)}
  x.beginPath();for(let i=0;i<36;i++){const a=i/36*Math.PI*2,rr=i%2?120+r()*30:200+r()*50;x.lineTo(256+Math.cos(a)*rr,256+Math.sin(a)*rr)}x.closePath();
  const g=x.createRadialGradient(256,256,10,256,256,240);g.addColorStop(0,'#fffbe0');g.addColorStop(.35,'#ffd23a');g.addColorStop(.7,'#ff7a1a');g.addColorStop(1,'#c9301a');x.fillStyle=g;x.fill();
  x.fillStyle='#ffffff';x.globalAlpha=.85;x.beginPath();x.arc(256,256,60,0,7);x.fill();return c}
function fxSmoke(){const c=mk(512,512),x=c.getContext('2d'),r=mulberry32(12);for(let i=0;i<46;i++){const a=r()*6.28,d=r()*170,s=30+r()*70;const v=110+r()*90|0;x.fillStyle=`rgba(${v},${v},${v},${.45+r()*.45})`;x.fillRect(256+Math.cos(a)*d-s/2,256+Math.sin(a)*d*.8-s/2,s,s)}return c}
function fxFire(){return upscale(gridCanvas(spriteGrid(16,P=>{const r=mulberry32(5);for(let x=1;x<15;x++){const top=Math.round(3+Math.abs(Math.sin(x*1.3))*5+r()*3);for(let y=top;y<15;y++){const t=(y-top)/(15-top);P.set(x,y,t<.25?'#fff2a0':t<.55?'#ffcf3a':t<.8?'#ff8a1f':'#d8401a')}}},null)),32)}
function fxLightning(col){const c=mk(300,512),x=c.getContext('2d');const pts=[[170,0],[110,190],[175,200],[80,512],[230,250],[160,240],[230,0]];
  x.beginPath();pts.forEach((p,i)=>i?x.lineTo(...p):x.moveTo(...p));x.closePath();x.shadowColor=col;x.shadowBlur=40;x.fillStyle=col;x.fill();x.shadowBlur=0;x.fillStyle='#ffffff';x.globalAlpha=.85;x.scale(.98,1);x.fill();return c}
function fxRays(col){const c=mk(512,512),x=c.getContext('2d');for(let i=0;i<18;i++){const a=i/18*Math.PI*2,w=.08;const g=x.createRadialGradient(256,256,0,256,256,256);g.addColorStop(0,hexA(col,.9));g.addColorStop(1,hexA(col,0));x.fillStyle=g;x.beginPath();x.moveTo(256,256);x.lineTo(256+Math.cos(a-w)*360,256+Math.sin(a-w)*360);x.lineTo(256+Math.cos(a+w)*360,256+Math.sin(a+w)*360);x.closePath();x.fill()}return c}
function fxGlow(col){const c=mk(512,512),x=c.getContext('2d'),g=x.createRadialGradient(256,256,0,256,256,256);g.addColorStop(0,hexA(col,.95));g.addColorStop(.45,hexA(col,.45));g.addColorStop(1,hexA(col,0));x.fillStyle=g;x.fillRect(0,0,512,512);return c}
function fxSpeed(){const c=mk(1280,720),x=c.getContext('2d'),r=mulberry32(3);x.fillStyle='#ffffff';for(let i=0;i<120;i++){const a=r()*Math.PI*2,r0=340+r()*120,r1=900,w=.004+r()*.008;x.globalAlpha=.5+r()*.5;x.beginPath();x.moveTo(640+Math.cos(a-w)*r1,360+Math.sin(a-w)*r1*.65);x.lineTo(640+Math.cos(a)*r0,360+Math.sin(a)*r0*.65);x.lineTo(640+Math.cos(a+w)*r1,360+Math.sin(a+w)*r1*.65);x.fill()}return c}
function fxParticles(){const c=mk(512,512),x=c.getContext('2d'),r=mulberry32(21),cols=['#ffd23a','#3fd6c6','#ef5a6f','#7fd12a','#9a6cf0','#ffffff'];for(let i=0;i<60;i++){const s=8+r()*18;x.fillStyle=cols[i%cols.length];x.globalAlpha=.6+r()*.4;x.fillRect(r()*(512-s),r()*(512-s),s,s)}return c}
function fxHearts(){const c=mk(512,512),x=c.getContext('2d'),r=mulberry32(31),h=gridCanvas(heartGrid('full'));x.imageSmoothingEnabled=false;for(let i=0;i<14;i++){const s=36+r()*60;x.globalAlpha=.7+r()*.3;x.drawImage(h,r()*(512-s),r()*(512-s),s,s)}return c}

/* ================= Formen ================= */
function shArrow(col){const c=mk(560,280),x=c.getContext('2d');x.translate(280,140);const L=500,t=48,hl=170,hw=118;
  x.beginPath();x.moveTo(-L/2,-t);x.lineTo(L/2-hl,-t);x.lineTo(L/2-hl,-hw);x.lineTo(L/2,0);x.lineTo(L/2-hl,hw);x.lineTo(L/2-hl,t);x.lineTo(-L/2,t);x.closePath();
  x.lineJoin='round';x.lineWidth=22;x.strokeStyle='#ffffff';x.stroke();x.fillStyle=col;x.fill();return c}
function shCurve(col){const c=mk(520,420),x=c.getContext('2d');x.lineCap='round';x.lineJoin='round';
  const path=()=>{x.beginPath();x.moveTo(60,360);x.quadraticCurveTo(110,80,380,110)};
  path();x.lineWidth=74;x.strokeStyle='#ffffff';x.stroke();path();x.lineWidth=46;x.strokeStyle=col;x.stroke();
  x.beginPath();x.moveTo(480,118);x.lineTo(350,30);x.lineTo(365,205);x.closePath();x.lineWidth=20;x.strokeStyle='#ffffff';x.stroke();x.fillStyle=col;x.fill();return c}
function shRing(col){const c=mk(512,512),x=c.getContext('2d');x.lineWidth=56;x.strokeStyle='#ffffff';x.beginPath();x.arc(256,256,214,0,7);x.stroke();x.lineWidth=36;x.strokeStyle=col;x.stroke();return c}
function shCircle(col){const c=mk(512,512),x=c.getContext('2d');x.fillStyle=col;x.beginPath();x.arc(256,256,250,0,7);x.fill();return c}
function rr(x,X,Y,W,H,R){x.beginPath();x.moveTo(X+R,Y);x.arcTo(X+W,Y,X+W,Y+H,R);x.arcTo(X+W,Y+H,X,Y+H,R);x.arcTo(X,Y+H,X,Y,R);x.arcTo(X,Y,X+W,Y,R);x.closePath()}
function shRect(col){const c=mk(512,320),x=c.getContext('2d');rr(x,4,4,504,312,36);x.fillStyle=col;x.fill();return c}
function shFrame(col){const c=mk(512,320),x=c.getContext('2d');rr(x,22,22,468,276,30);x.lineWidth=34;x.strokeStyle=col;x.stroke();return c}
function shBubble(col){const c=mk(512,400),x=c.getContext('2d');rr(x,14,14,484,280,60);x.moveTo(120,290);x.lineTo(90,386);x.lineTo(210,290);x.fillStyle=col;x.fill();x.lineWidth=14;x.strokeStyle='#15161b';x.lineJoin='round';
  x.beginPath();x.moveTo(74,14);x.arcTo(498,14,498,294,60);x.arcTo(498,294,14,294,60);x.lineTo(210,294);x.lineTo(90,386);x.lineTo(120,294);x.arcTo(14,294,14,14,60);x.arcTo(14,14,498,14,60);x.closePath();x.stroke();return c}
function shGlyph(ch,col){const c=mk(320,480),x=c.getContext('2d');x.textAlign='center';x.textBaseline='middle';x.font='420px "Luckiest Guy", Impact, sans-serif';x.lineJoin='round';x.lineWidth=40;x.strokeStyle='#ffffff';x.strokeText(ch,160,270);x.fillStyle=col;x.fillText(ch,160,270);return c}
function shCross(col){const c=mk(512,512),x=c.getContext('2d');x.lineCap='round';for(const[w,s]of[[150,'#ffffff'],[104,col]]){x.lineWidth=w;x.strokeStyle=s;x.beginPath();x.moveTo(110,110);x.lineTo(402,402);x.moveTo(402,110);x.lineTo(110,402);x.stroke()}return c}
function shCheck(col){const c=mk(512,420),x=c.getContext('2d');x.lineCap='round';x.lineJoin='round';for(const[w,s]of[[150,'#ffffff'],[104,col]]){x.lineWidth=w;x.strokeStyle=s;x.beginPath();x.moveTo(90,230);x.lineTo(200,330);x.lineTo(420,90);x.stroke()}return c}
function shBurst(col){const c=mk(512,512),x=c.getContext('2d');x.beginPath();for(let i=0;i<32;i++){const a=i/32*Math.PI*2,r=i%2?200:250;x.lineTo(256+Math.cos(a)*r,256+Math.sin(a)*r)}x.closePath();x.lineJoin='round';x.lineWidth=18;x.strokeStyle='#ffffff';x.stroke();x.fillStyle=col;x.fill();return c}
function shVs(col){const c=mk(560,360),x=c.getContext('2d');x.textAlign='center';x.textBaseline='middle';x.font='300px "Luckiest Guy", Impact, sans-serif';x.lineJoin='round';x.lineWidth=34;x.strokeStyle='#15161b';x.strokeText('VS',280,200);x.fillStyle=col;x.fillText('VS',280,200);return c}

/* ================= Bibliothek ================= */
const CATS_A=[['items','Gegenstände'],['blocks','Blöcke'],['mobs','Mobs'],['hud','HUD'],['effects','Effekte'],['shapes','Formen']];
const LIB=[];const LIBK={};
function lib(key,cat,name,gen,o={}){const a={key,cat,name,gen,pixel:!!o.pixel,color:o.color||null,font:!!o.font,cover:!!o.cover,bk:o.bk||null};LIB.push(a);LIBK[key]=a}
for(const[k,n]of ITEM_DEFS)lib('it_'+k,'items',n,()=>{const g=ITEM16[k];return gridCanvas(g,Math.max(1,Math.round(256/g.length)))},{pixel:true});
for(const[k,n]of BLOCK_DEFS)lib('bl_'+k,'blocks',n,()=>blockCanvas(k),{bk:k});
for(const[k,n,i,pose]of FIGURES)lib(k,'mobs',n,()=>renderTight(buildChar(PRESET_IMGS[i],{pose,face:'left',slim:i===5}),10));
lib('mob_pig','mobs','Schwein',()=>renderTight(mobPig(),10));
lib('mob_sheep','mobs','Schaf',()=>renderTight(mobSheep(),10));
lib('mob_chicken','mobs','Huhn',()=>renderTight(mobChicken(),12));
lib('mob_slime','mobs','Schleim',()=>renderTight(mobSlime(),12));
lib('hud_hearts','hud','Herzleiste',()=>hudBar([...Array(8)].map(()=>heartGrid('full')).concat([heartGrid('half'),heartGrid('empty')]),8),{pixel:true});
lib('hud_heart','hud','Herz',()=>upscale(gridCanvas(heartGrid('full')),28),{pixel:true});
lib('hud_hunger','hud','Hungerleiste',()=>hudBar([...Array(10)].map(()=>DRUM),8),{pixel:true});
lib('hud_armor','hud','Rüstungsleiste',()=>hudBar([...Array(10)].map(()=>ARMOR),8),{pixel:true});
lib('hud_xp','hud','XP-Leiste',hudXP,{pixel:true});
lib('hud_hotbar','hud','Schnellleiste',hudHotbar,{pixel:true});
lib('hud_toast','hud','Erfolg erzielt',()=>hudToast('Erfolg erzielt!','Diamanten!','diamond'),{font:true});
lib('hud_toast2','hud','Erfolg: Unterwelt',()=>hudToast('Erfolg erzielt!','Ab in die Hitze','torch'),{font:true});
lib('hud_death','hud','Du bist gestorben',hudDeath,{font:true});
lib('fx_sparkle','effects','Funkeln',fxSparkle,{color:'#ffe066'});
lib('fx_explosion','effects','Explosion',fxExplosion);
lib('fx_smoke','effects','Rauch',fxSmoke);
lib('fx_fire','effects','Feuer',fxFire,{pixel:true});
lib('fx_lightning','effects','Blitz',fxLightning,{color:'#ffe94d'});
lib('fx_rays','effects','Lichtstrahlen',fxRays,{color:'#fff3b0'});
lib('fx_glow','effects','Leuchtfleck',fxGlow,{color:'#ffd36b'});
lib('fx_speed','effects','Speed-Linien',fxSpeed,{cover:true});
lib('fx_particles','effects','Partikel',fxParticles);
lib('fx_hearts','effects','Herzchen',fxHearts);
lib('sh_arrow','shapes','Pfeil',shArrow,{color:'#e8322f'});
lib('sh_curve','shapes','Kurvenpfeil',shCurve,{color:'#e8322f'});
lib('sh_ring','shapes','Kreis',shRing,{color:'#e8322f'});
lib('sh_circle','shapes','Punkt',shCircle,{color:'#ffd23a'});
lib('sh_rect','shapes','Rechteck',shRect,{color:'#15161b'});
lib('sh_frame','shapes','Rahmen',shFrame,{color:'#ffffff'});
lib('sh_bubble','shapes','Sprechblase',shBubble,{color:'#ffffff'});
lib('sh_excl','shapes','Ausrufezeichen',c=>shGlyph('!',c),{color:'#e8322f',font:true});
lib('sh_quest','shapes','Fragezeichen',c=>shGlyph('?',c),{color:'#ffd23a',font:true});
lib('sh_cross','shapes','Kreuz',shCross,{color:'#e8322f'});
lib('sh_check','shapes','Haken',shCheck,{color:'#3fbf5f'});
lib('sh_burst','shapes','Stern-Badge',shBurst,{color:'#ffd23a'});
lib('sh_vs','shapes','VS',shVs,{color:'#ffd23a',font:true});
const libCache=new Map();
function libCanvas(key,color){const a=LIBK[key];if(!a)return null;const k=key+'|'+(color||a.color||'');let c=libCache.get(k);if(!c){c=a.gen(color||a.color);libCache.set(k,c)}return c}
function clearFontAssets(){for(const k of[...libCache.keys()]){const a=LIBK[k.split('|')[0]];if(a&&a.font)libCache.delete(k)}}

/* ================= Hintergründe & Schriften ================= */
const GRADS={sunset:['Abendrot',['#3b2a6b','#e5866a','#f6d49c']],night:['Nacht',['#060914','#1c2a5c','#3c4f8f']],nether:['Unterwelt',['#1a0606','#5c1a12','#c4421a']],ocean:['Ozean',['#04263f','#0e6b8a','#5fd0d6']],forest:['Wald',['#0d2414','#2f6b34','#9ed36a']],gold:['Gold',['#3a2402','#c98a12','#ffe27a']],candy:['Bonbon',['#4b1d6b','#d24c9c','#ffb37a']],steel:['Stahl',['#0f1216','#2b333e','#5c6878']]};
const FONTS={luckiest:['Luckiest Guy','"Luckiest Guy", Impact, sans-serif',400],bungee:['Bungee','"Bungee", Impact, sans-serif',400],lilita:['Lilita One','"Lilita One", Impact, sans-serif',400],bangers:['Bangers','"Bangers", Impact, sans-serif',400],pixel:['Pixelify Sans','"Pixelify Sans", monospace',700],press:['Press Start 2P','"Press Start 2P", monospace',400],inter:['Inter Black','"Inter", "Arial Black", sans-serif',900]};

/* ================= Minecraft-Himmel =================
   Farben wie in Minecraft (Ebene, Tag: Himmel #78A7FF, Dunst #C0D8FF). Mit installierten
   Texturen kommen Sonne, Mond und Wolkenkarte aus Minecraft, sonst eigene Annäherungen. */
const MC_SKY={day:{top:'#78a7ff',hz:'#c0d8ff',cloud:'#ffffff',cloudSide:'#e4e9f4'},sunset:{top:'#5a6fb8',hz:'#f3b585',cloud:'#ffe6d2',cloudSide:'#e9c1a8'},night:{top:'#05070f',hz:'#121a33',cloud:'#3a4258',cloudSide:'#2c3346'}};
let cloudMapCache=null;
function mcCloudMap(){const key=(typeof PACK!=='undefined'&&PACK&&PACK.imgs['e/clouds'])?'pack':'own';if(cloudMapCache&&cloudMapCache.key===key)return cloudMapCache;
  let n,a;
  if(key==='pack'){const c=PACK.imgs['e/clouds'];n=c.width;const d=c.getContext('2d').getImageData(0,0,n,n).data;a=new Uint8Array(n*n);for(let i=0;i<n*n;i++)a[i]=d[i*4+3]>30?1:0}
  else{n=128;a=new Uint8Array(n*n);const r=mulberry32(77),blobs=[];for(let i=0;i<230;i++)blobs.push([r()*n,r()*n,.5+r()*2.6,.4+r()*1.4]);
    for(let y=0;y<n;y++)for(let x=0;x<n;x++){for(const[bx,by,rw,rh]of blobs){let dx=Math.abs(x-bx),dy=Math.abs(y-by);dx=Math.min(dx,n-dx);dy=Math.min(dy,n-dy);if(dx<=rw&&dy<=rh){a[y*n+x]=1;break}}}}
  return cloudMapCache={key,n,a}}
function mcSun(time){const P=typeof PACK!=='undefined'&&PACK;
  if(time==='night'){if(P&&P.imgs['e/moon'])return P.imgs['e/moon'];const m=P&&P.imgs['e/moon_phases'];if(m){const fw=m.width/4,fh=m.height/2,c=mk(fw,fh);c.getContext('2d').drawImage(m,0,0,fw,fh,0,0,fw,fh);return c}
    const c=mk(32,32),x=c.getContext('2d');x.fillStyle='#e8ecf5';x.fillRect(8,8,16,16);x.fillStyle='#c7cddb';x.fillRect(11,12,3,3);x.fillRect(18,17,4,3);return c}
  const s=P&&P.imgs['e/sun'];if(s)return s;
  const c=mk(32,32),x=c.getContext('2d');x.fillStyle='rgba(255,246,190,.18)';x.fillRect(2,2,28,28);x.fillStyle='rgba(255,246,190,.35)';x.fillRect(5,5,22,22);x.fillStyle='#fff6c4';x.fillRect(8,8,16,16);x.fillStyle='#fffdf0';x.fillRect(10,10,12,12);return c}
function hexMix(a,b,t){const A=hexRgb(a),B=hexRgb(b);return`rgb(${A.map((v,i)=>Math.round(v+(B[i]-v)*t)).join(',')})`}
function drawMcSky(cv,time='day',seed=1){
  const W=cv.width,H=cv.height,x=cv.getContext('2d'),C=MC_SKY[time]||MC_SKY.day,hz=H*.72,r=mulberry32(seed*13+5);
  const g=x.createLinearGradient(0,0,0,hz);g.addColorStop(0,C.top);g.addColorStop(.7,hexMix(C.top,C.hz,.55));g.addColorStop(1,C.hz);x.fillStyle=g;x.fillRect(0,0,W,hz+1);x.fillStyle=C.hz;x.fillRect(0,hz,W,H-hz);
  if(time==='night'){x.fillStyle='#ffffff';for(let i=0;i<Math.round(W*H/2600);i++){x.globalAlpha=.25+r()*.7;const s=r()<.1?2:1;x.fillRect(Math.floor(r()*W),Math.floor(r()*hz*.95),s*Math.max(1,W/1280),s*Math.max(1,W/1280))}x.globalAlpha=1}
  const sun=mcSun(time),sz=Math.min(W,H)*(time==='night'?.13:.2),sx=W*(time==='sunset'?.2:.72),sy=time==='sunset'?hz-sz*.75:H*.1;
  x.save();x.imageSmoothingEnabled=false;if(time!=='night')x.globalCompositeOperation='lighter';x.drawImage(sun,sx,sy,sz,sz);x.restore();
  const map=mcCloudMap(),n=map.n,f=W*.55,ch=2.4,c=1.05,th=.36,ox=Math.floor(r()*n),oz=Math.floor(r()*n),zmin=1.8,zmax=19;
  const has=(i,j)=>map.a[(((j+oz)%n+n)%n)*n+(((i+ox)%n+n)%n)];
  const P=(X,Y,Z)=>[W/2+f*X/Z,hz-f*Y/Z];
  for(let j=Math.floor(zmax/c);j>=Math.ceil(zmin/c);j--){const z0=j*c,z1=z0+c,span=Math.ceil((W/2*z1/f)/c)+1,fog=clamp((z0-5)/(zmax-5),0,1)*.85;
    for(let i=-span;i<=span;i++){if(!has(i,j))continue;const x0=i*c,x1=x0+c;
      const q=[P(x0,ch,z0),P(x1,ch,z0),P(x1,ch,z1),P(x0,ch,z1)];x.fillStyle=x.strokeStyle=hexMix(C.cloudSide,C.hz,fog);x.lineWidth=1;x.beginPath();x.moveTo(...q[0]);for(let k=1;k<4;k++)x.lineTo(...q[k]);x.closePath();x.fill();x.stroke();
      if(!has(i,j-1)){const t=[P(x0,ch,z0),P(x1,ch,z0),P(x1,ch+th,z0),P(x0,ch+th,z0)];x.fillStyle=x.strokeStyle=hexMix(C.cloud,C.hz,fog);x.beginPath();x.moveTo(...t[0]);for(let k=1;k<4;k++)x.lineTo(...t[k]);x.closePath();x.fill();x.stroke()}}}}
