/* Lirelo cloud bridge. Authenticated storage, library and reading-state sync.
   Only Supabase's public publishable key is stored in this client. */
(()=>{'use strict';
const URL='https://phkejehwadwzxvtjmesq.supabase.co';
const KEY='sb_publishable_xzsy4E_qPkJgZv88RLiuNQ_Ge_7TBf0';
const BUCKET='lirelo-private';
const SESSION='lirelo-cloud-auth-v1';
const state={session:null,user:null,books:[],ready:false,busy:false,suppress:false};
let readyResolve;const ready=new Promise(resolve=>readyResolve=resolve);
const timers=new Map();
function authHeaders(type='application/json'){return {'apikey':KEY,'Authorization':'Bearer '+state.session.access_token,...(type?{'Content-Type':type}:{})}}
function errMessage(data,response){return data?.msg||data?.message||data?.error_description||data?.error||'The request failed ('+response.status+').'}
async function http(path,options={},authenticate=true){
 const response=await fetch(URL+path,{...options,headers:{'apikey':KEY,...(authenticate&&state.session?.access_token?{'Authorization':'Bearer '+state.session.access_token}:{}),...options.headers}});
 let value;try{value=await response.json()}catch{value={}};
 if(!response.ok)throw new Error(errMessage(value,response));
 return value;
}
async function refresh(){
 if(!state.session?.refresh_token)return false;
 try{
  const value=await http('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:state.session.refresh_token})},false);
  if(!value.access_token)throw new Error('No valid session');
  saveSession(value);return true;
 }catch{state.session=null;state.user=null;localStorage.removeItem(SESSION);return false;}
}
function saveSession(value){state.session={...value,expires_at:Math.floor(Date.now()/1000)+Number(value.expires_in||3600)};localStorage.setItem(SESSION,JSON.stringify(state.session));}
async function access(){
 if(!state.session)throw new Error('Sign in to continue.');
 if(state.session.expires_at-Date.now()/1000<90){if(!await refresh())throw new Error('Your session has expired. Please sign in again.');}
 return state.session.access_token;
}
async function db(path,options={}){await access();return http('/rest/v1/'+path,options)}
function authScreen(){
 let el=document.getElementById('lireloCloudAuth');if(!el){el=document.createElement('div');el.id='lireloCloudAuth';document.body.appendChild(el)}
 el.innerHTML=`<main class="lc-auth-card"><img src="/assets/lirelo-imprint.png" alt="Lirelo emblem" class="lc-auth-logo"><h1>Welcome to Lirelo</h1><p>Your reading, all together. Sign in to reach your private library.</p><form id="lcAuthForm"><label>Email address<input type="email" id="lcEmail" autocomplete="email" required placeholder="you@example.com"></label><label>Password<input type="password" id="lcPassword" autocomplete="current-password" minlength="6" required placeholder="Enter your password"></label><div id="lcAuthStatus" role="status"></div><button type="submit" id="lcLogin">Sign in</button><button type="button" id="lcSignup">Create an account</button></form></main>`;
 const message=(msg,good=false)=>{const s=document.getElementById('lcAuthStatus');s.textContent=msg;s.style.color=good?'#4F9371':'#AA5B5F'};
 const run=async mode=>{
  if(state.busy)return;state.busy=true;
  const email=document.getElementById('lcEmail').value.trim(),password=document.getElementById('lcPassword').value;
  if(!email||!password){message('Enter an email address and password.');state.busy=false;return;}
  const buttons=[document.getElementById('lcLogin'),document.getElementById('lcSignup')];buttons.forEach(b=>b.disabled=true);
  try{
   const route=mode==='signup'?'/auth/v1/signup?redirect_to='+encodeURIComponent(location.origin):'/auth/v1/token?grant_type=password';
   const value=await http(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})},false);
   if(value.access_token){saveSession(value);state.user=value.user;await load();el.remove();document.getElementById('app').classList.add('lc-ready');}
   else message('Check your email for a confirmation link. Return here and sign in after confirming.',true);
  }catch(e){message(e.message)}finally{state.busy=false;buttons.forEach(b=>b.disabled=false)}
 };
 el.querySelector('form').addEventListener('submit',e=>{e.preventDefault();run('signin')});
 el.querySelector('#lcSignup').addEventListener('click',()=>run('signup'));
}
async function service(path,options={}){
 const token=await access();
 const response=await fetch('/api/'+path,{...options,headers:{'Authorization':'Bearer '+token,...options.headers}});
 let data;try{data=await response.json()}catch{throw new Error('Lirelo’s document service is unavailable.')}
 if(!response.ok)throw new Error(data.error||'Unable to load this document.');
 return data;
}
function mapBook(b){return {...b,added:Math.floor(new Date(b.added).getTime()/1000),cover:'uploaded',tags:b.tags||[],toc:b.toc||[]};}
async function load(){
 await access();
 const lib=window.LireloLibrary, final=window.LireloFinal;
 const books=await db('lirelo_books?select=*&order=added.desc');
 state.books=books.map(mapBook);
 // Discard any demo books and use only the authenticated account's records.
 lib.state.books.splice(0,lib.state.books.length,...state.books.filter(b=>!b.trashed));
 lib.state.collections=[...new Set(['Personal','Work','Learning','Favourites',...state.books.map(b=>b.collection).filter(Boolean)])];
 const rows=await db('lirelo_reading_state?select=book_id,data');
 state.suppress=true;
 try{rows.forEach(row=>{if(!state.books.some(b=>b.id===row.book_id))return;localStorage.setItem('lirelo-reader-v3-standalone:'+row.book_id,JSON.stringify(row.data));});}
 finally{state.suppress=false;}
 if(final){final.trash.splice(0,final.trash.length,...state.books.filter(b=>b.trashed));}
 lib.renderCollectionsNav();lib.render();
 if(location.hash.startsWith('#book='))window.LireloBookDetails?.open(decodeURIComponent(location.hash.slice(6)),{pushHistory:false});
 if(location.hash.startsWith('#reader='))window.LireloReader?.open(decodeURIComponent(location.hash.slice(8)),{pushHistory:false});
 state.ready=true;readyResolve();
}
async function importBook(file){
 await access();
 if(!/\.(pdf|epub)$/i.test(file.name))throw Error('Choose a PDF or EPUB book.');
 if(file.size>50*1024*1024)throw Error('Choose a document under 50 MB.');
 const bytes=await file.arrayBuffer(),digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
 const already=state.books.find(b=>b.fingerprint===digest);
 if(already){if(already.trashed){await db('lirelo_books?id=eq.'+encodeURIComponent(already.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:false})});already.trashed=false;}return already;}
 const id='book-'+crypto.randomUUID();
 const format=file.name.toLowerCase().endsWith('.pdf')?'pdf':'epub';
 const path=state.user.id+'/'+id+'.'+format;
 const mime=format==='pdf'?'application/pdf':'application/epub+zip';
 const response=await fetch(URL+'/storage/v1/object/'+BUCKET+'/'+encodeURIComponent(state.user.id)+'/'+encodeURIComponent(id+'.'+format),{method:'POST',headers:authHeaders(mime),body:file});
 if(!response.ok){let data;try{data=await response.json()}catch{}throw Error(errMessage(data,response));}
 try{
  const details=await service('inspect?path='+encodeURIComponent(path));
  const title=details.title||file.name.replace(/\.(pdf|epub)$/i,'');
  const payload={id,owner_id:state.user.id,fingerprint:digest,file_name:file.name.slice(0,180),title,author:details.author||'Unknown author',format,pages:details.pages,toc:details.toc||[],publisher:details.publisher||'',collection:'Personal',tags:[],progress:0,trashed:false,file_size:file.size,storage_path:path};
  const inserted=await db('lirelo_books',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'return=representation'},body:JSON.stringify(payload)});
  const book=mapBook(inserted[0]);state.books.unshift(book);return book;
 }catch(e){await fetch(URL+'/storage/v1/object/'+BUCKET+'/'+path,{method:'DELETE',headers:authHeaders(null)}).catch(()=>{});throw e;}
}
function defer(id,action,delay=600){clearTimeout(timers.get(id));timers.set(id,setTimeout(()=>{timers.delete(id);Promise.resolve(action()).catch(e=>{console.error(e);window.LireloLibrary?.toast('Cloud sync failed: '+e.message)})},delay))}
function updateBook(book){if(!book?.id||!state.user)return;
 defer('book:'+book.id,()=>db('lirelo_books?id=eq.'+encodeURIComponent(book.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:book.title,author:book.author,collection:book.collection||'Personal',tags:book.tags||[],progress:Math.round(book.progress||0)})}),850);
}
function updateProgress(id,progress){const b=window.LireloLibrary?.state.books.find(x=>x.id===id);if(b){b.progress=Math.round(progress);updateBook(b);}}
function saveState(id){if(!state.user||!state.books.some(b=>b.id===id))return;
 defer('state:'+id,()=>{
  const raw=localStorage.getItem('lirelo-reader-v3-standalone:'+id);if(!raw)return;
  const data=JSON.parse(raw);
  return db('lirelo_reading_state?on_conflict=book_id',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({owner_id:state.user.id,book_id:id,data,updated_at:new Date().toISOString()})});
 },650);
}
const originalSetItem=Storage.prototype.setItem;
Storage.prototype.setItem=function(key,value){const result=originalSetItem.call(this,key,value);if(this===localStorage&&!state.suppress&&typeof key==='string'&&key.startsWith('lirelo-reader-v3-standalone:'))saveState(key.slice('lirelo-reader-v3-standalone:'.length));return result};
function savedAnnotations(id){try{return JSON.parse(localStorage.getItem('lirelo-reader-v3-standalone:'+id))?.annotations||{}}catch{return{}}}
function saveNote(id,note){const key='lirelo-reader-v3-standalone:'+id;let data;try{data=JSON.parse(localStorage.getItem(key))||{}}catch{data={}}data.annotations ||= {highlights:[],notes:[],bookmarks:[]};data.annotations.notes ||= [];data.annotations.notes.unshift(note);localStorage.setItem(key,JSON.stringify(data));}
function deleteNote(id,noteId){const key='lirelo-reader-v3-standalone:'+id;let data;try{data=JSON.parse(localStorage.getItem(key))||{}}catch{data={}}if(!data.annotations?.notes)return;data.annotations.notes=data.annotations.notes.filter(n=>n.id!==noteId);localStorage.setItem(key,JSON.stringify(data));}
function syncTrash(trashed){const gone=new Set(trashed.map(b=>b.id));for(const b of state.books){const value=gone.has(b.id);if(value===b.trashed)continue;b.trashed=value;defer('trash:'+b.id,()=>db('lirelo_books?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:value})}),200);}}
async function removeForever(id){const b=state.books.find(x=>x.id===id);if(!b)return;await db('lirelo_books?id=eq.'+encodeURIComponent(id),{method:'DELETE'});await fetch(URL+'/storage/v1/object/'+BUCKET+'/'+b.storage_path,{method:'DELETE',headers:authHeaders(null)});state.books=state.books.filter(b=>b.id!==id);localStorage.removeItem('lirelo-reader-v3-standalone:'+id);}
function saveCollections(_list){} // Per-book collection assignments are saved in cloud records.
async function signOut(){state.suppress=true;for(const key of Object.keys(localStorage))if(key.startsWith('lirelo-reader-v3-standalone:')||key.startsWith('lirelo-reader-progress:'))localStorage.removeItem(key);state.suppress=false;const token=state.session?.access_token;state.session=null;state.user=null;state.ready=false;localStorage.removeItem(SESSION);if(token)fetch(URL+'/auth/v1/logout',{method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+token}}).catch(()=>{});location.hash='';location.reload()}
function addAccountControl(){
 const b=document.createElement('button');b.type='button';b.id='lcSignOut';b.className='lc-sign-out';b.textContent='Sign out';b.addEventListener('click',signOut);
 document.querySelector('.sidebar-profile')?.appendChild(b);
 document.getElementById('demoNote')?.remove();document.querySelector('.details-demo-foot')?.remove();document.querySelector('.p4-review-label')?.remove();
}
async function initialise(){
 addAccountControl();
 try{const s=JSON.parse(localStorage.getItem(SESSION)||'null');if(s?.access_token&&s.refresh_token){state.session=s;if(s.expires_at-Date.now()/1000<90)await refresh();if(state.session){const user=await http('/auth/v1/user');if(user?.id){state.user=user;await load();document.getElementById('app').classList.add('lc-ready');return;}}}}
 catch(e){console.warn('Sign-in check:',e.message)}
 authScreen();
}
window.LireloApp={ready,load,importBook,updateBook,updateProgress,saveNote,deleteNote,savedAnnotations,syncTrash,removeForever,saveCollections,request:service,signOut,get user(){return state.user}};
document.addEventListener('DOMContentLoaded',initialise,{once:true});
})();