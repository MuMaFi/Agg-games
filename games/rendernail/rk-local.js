'use strict';
/* ================= Eigenständiger Betrieb =================
   Läuft Rendernail als normale Webseite (z. B. in AGG Games),
   gibt es keine Claude-Funktionen. Dann speichert sie Designs, Bilder
   und Renders im Browser (IndexedDB) und lädt Dateien direkt herunter. */
window.RK_LOCAL=!!window.RK_STANDALONE||!(window.claude&&window.claude.use);
const RKLocal=(()=>{
  if(!window.RK_LOCAL)return null;
  let dbp=null;
  function open(){if(dbp)return dbp;dbp=new Promise((ok,no)=>{if(!window.indexedDB)return no(new Error('Dieser Browser kann nichts dauerhaft speichern.'));
    const r=indexedDB.open('renderkammer',1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains('docs'))d.createObjectStore('docs');if(!d.objectStoreNames.contains('blobs'))d.createObjectStore('blobs')};
    r.onsuccess=()=>ok(r.result);r.onerror=()=>no(r.error)});dbp.catch(()=>{dbp=null});return dbp}
  async function tx(store,mode,fn){const d=await open();return new Promise((ok,no)=>{const t=d.transaction(store,mode),r=fn(t.objectStore(store));t.oncomplete=()=>ok(r&&r.result);t.onerror=()=>no(t.error);t.onabort=()=>no(t.error)})}
  async function all(col){const d=await open();return new Promise((ok,no)=>{const out=[],c=d.transaction('docs','readonly').objectStore('docs').openCursor(IDBKeyRange.bound(col+'/',col+'/￿'));
    c.onsuccess=()=>{const cur=c.result;if(cur){out.push({id:String(cur.key).slice(col.length+1),data:cur.value});cur.continue()}else ok(out)};c.onerror=()=>no(c.error)})}
  const subs={};
  async function notify(col){const ls=subs[col];if(!ls||!ls.length)return;const rows=await all(col);ls.forEach(l=>l(rows))}
  const meta={fromCache:false,hasPendingWrites:false};
  function snapOf(rows,order){const docs=rows.map(r=>({id:r.id,exists:true,data:()=>r.data,metadata:meta}));
    if(order){const[f,dir]=order;docs.sort((a,b)=>{const x=a.data()[f],y=b.data()[f];return(x<y?-1:x>y?1:0)*(dir==='desc'?-1:1)})}
    return{docs,size:docs.length,empty:!docs.length,metadata:meta,docChanges:()=>[]}}
  function docRef(col,id){const key=col+'/'+id;return{id,path:key,
    async set(data){await tx('docs','readwrite',s=>s.put(JSON.parse(JSON.stringify(data)),key));notify(col)},
    async update(data){const cur=await tx('docs','readonly',s=>s.get(key));await this.set({...(cur||{}),...data})},
    async delete(){await tx('docs','readwrite',s=>s.delete(key));notify(col)},
    async get(){const v=await tx('docs','readonly',s=>s.get(key));return{id,exists:v!=null,data:()=>v,metadata:meta}}}}
  function collection(col){const q=order=>({
    orderBy:(f,dir)=>q([f,dir||'asc']),limit:()=>q(order),where:()=>q(order),
    onSnapshot(next,err){const l=rows=>next(snapOf(rows,order));(subs[col]=subs[col]||[]).push(l);all(col).then(l).catch(e=>err&&err({code:'unavailable',message:String(e)}));return()=>{subs[col]=subs[col].filter(x=>x!==l)}},
    async get(){return snapOf(await all(col),order)},
    doc:id=>docRef(col,id||uid()),
    async add(data){const id=uid();await docRef(col,id).set(data);return docRef(col,id)}});return q(null)}
  const urls=new Map();
  const hexId=()=>[...crypto.getRandomValues(new Uint8Array(16))].map(b=>b.toString(16).padStart(2,'0')).join('');
  const assets={
    async upload(blob){const id=hexId();await tx('blobs','readwrite',s=>s.put(blob,id));const url=URL.createObjectURL(blob);urls.set(id,url);return{id,url,sizeBytes:blob.size,contentType:blob.type}},
    async delete(id){await tx('blobs','readwrite',s=>s.delete(id));const u=urls.get(id);if(u){URL.revokeObjectURL(u);urls.delete(id)}return{deleted:true}},
    async list(){return{assets:[],usage:{}}}};
  const blob=id=>tx('blobs','readonly',s=>s.get(id));
  async function blobURL(id){if(urls.has(id))return urls.get(id);const b=await blob(id);if(!b)throw new Error('fehlt');const u=URL.createObjectURL(b);urls.set(id,u);return u}
  const downloads={async save({filename,data}){const b=data instanceof Blob?data:new Blob([data]);const u=URL.createObjectURL(b);
    const a=document.createElement('a');a.href=u;a.download=filename;a.rel='noopener';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);return{status:'saved'}}};
  return{db:{collection,doc:p=>{const i=p.lastIndexOf('/');return docRef(p.slice(0,i),p.slice(i+1))}},assets,downloads,blob,blobURL}})();
if(RKLocal){if(navigator.storage&&navigator.storage.persist)navigator.storage.persist().catch(()=>{});setCaps(RKLocal.downloads,RKLocal.assets,RKLocal.db)}
