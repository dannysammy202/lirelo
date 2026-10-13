/* Lirelo offline reading. All document caches are partitioned by Supabase user id. */
(()=>{'use strict';
const DB='lirelo-reader-offline-v1',VERSION=1;
let connecting=null;
function connect(){
 if(connecting)return connecting;
 if(!('indexedDB' in window))return Promise.reject(new Error('Offline storage is not supported by this browser.'));
 connecting=new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB,VERSION);
  req.onupgradeneeded=()=>{
   const db=req.result;
   if(!db.objectStoreNames.contains('books'))db.createObjectStore('books',{keyPath:'key'});
   if(!db.objectStoreNames.contains('pages'))db.createObjectStore('pages',{keyPath:'key'});
   if(!db.objectStoreNames.contains('library'))db.createObjectStore('library',{keyPath:'key'});
  };
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>{connecting=null;reject(req.error)};
 });
 return connecting;
}
async function action(store,mode,work){
 const db=await connect();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(store,mode),object=tx.objectStore(store);
  let result;
  try{result=work(object)}catch(e){reject(e);return}
  if(result && typeof result.onsuccess==='object')result.onsuccess=()=>resolve(result.result);
  tx.oncomplete=()=>{if(!result)resolve()};
  tx.onerror=()=>reject(tx.error||new Error('Unable to save offline data.'));
  tx.onabort=()=>reject(tx.error||new Error('Offline storage was interrupted.'));
 });
}
const get=(store,key)=>action(store,'readonly',s=>s.get(key));
const put=(store,row)=>action(store,'readwrite',s=>s.put(row));
const deleteItem=(store,key)=>action(store,'readwrite',s=>s.delete(key));
const docKey=(uid,id,size=14,font='original')=>uid+':'+id+':'+size+':'+font;
const pageKey=(uid,id,size,font,page)=>docKey(uid,id,size,font)+':'+page;
const sizeFor=doc=>Number(doc.font)||14;
const fontFor=doc=>doc.fontface||'original';
function user(){return window.LireloApp?.user?.id||null}
async function saveMeta(doc,uid=user()){if(!uid||!doc?.id)return;await put('books',{key:docKey(uid,doc.id,sizeFor(doc),fontFor(doc)),doc})}
async function getMeta(id,size=14,font='original',uid=user()){if(!uid)return null;return (await get('books',docKey(uid,id,size,font)))?.doc||null}
async function savePage(doc,page,data,uid=user()){if(!uid||!doc||!data)return;await put('pages',{key:pageKey(uid,doc.id,sizeFor(doc),fontFor(doc),page),data})}
async function getPage(doc,page,uid=user()){if(!uid||!doc)return null;return (await get('pages',pageKey(uid,doc.id,sizeFor(doc),fontFor(doc),page)))?.data||null}
async function pageCount(doc,uid=user()){
 if(!uid||!doc)return 0;
 const db=await connect(),prefix=docKey(uid,doc.id,sizeFor(doc),fontFor(doc))+':';
 return new Promise((resolve,reject)=>{
  const request=db.transaction('pages').objectStore('pages').getAllKeys(IDBKeyRange.bound(prefix,prefix+'\uffff'));
  request.onsuccess=()=>resolve(request.result.length);request.onerror=()=>reject(request.error);
 });
}
async function forget(doc,uid=user()){
 if(!uid||!doc)return;
 const prefix=docKey(uid,doc.id,sizeFor(doc),fontFor(doc))+':';
 const db=await connect();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(['pages','books'],'readwrite'),pages=tx.objectStore('pages');
  const cursor=pages.openKeyCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
  cursor.onsuccess=()=>{if(cursor.result){pages.delete(cursor.result.primaryKey);cursor.result.continue()}};
  tx.objectStore('books').delete(docKey(uid,doc.id,sizeFor(doc),fontFor(doc)));
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
}
async function saveLibrary(uid,books,profile){
 if(!uid)return;await put('library',{key:uid,books,profile,updated:Date.now()});
}
async function getLibrary(uid){return uid?(await get('library',uid))||null:null}
async function clearUser(uid){
 if(!uid)return;
 const db=await connect(),prefix=uid+':';
 await new Promise((resolve,reject)=>{
  const tx=db.transaction(['books','pages','library'],'readwrite');
  for(const name of ['books','pages']){
   const store=tx.objectStore(name),req=store.openKeyCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
   req.onsuccess=()=>{if(req.result){store.delete(req.result.primaryKey);req.result.continue()}};
  }
  tx.objectStore('library').delete(uid);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 });
}
function initPWA(){
 if(!('serviceWorker' in navigator))return;
 window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js',{scope:'/'}).catch(e=>console.warn('Lirelo PWA registration:',e.message)),{once:true});
}
window.LireloOffline={getMeta,saveMeta,getPage,savePage,pageCount,forget,saveLibrary,getLibrary,clearUser,user};
initPWA();
})();