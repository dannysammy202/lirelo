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
function authScreen(options={}){
 let el=document.getElementById('lireloCloudAuth');if(!el){el=document.createElement('div');el.id='lireloCloudAuth';document.body.appendChild(el)}
 const mode=options.mode||'signin';
 const recovery=mode==='recover',setPassword=mode==='set-password';
 const titles={signin:'Welcome to Lirelo',recover:'Reset your password','set-password':'Choose a new password'};
 const descriptions={signin:'Your reading, all together. Sign in to reach your private library.',recover:'Enter your email address and we’ll send a password reset link.','set-password':'Choose a secure password to return to your reading space.'};
 const emailField=setPassword?'':`<label>Email address<input type="email" id="lcEmail" autocomplete="email" required placeholder="you@example.com"></label>`;
 const passwordControl=(id,label,autocomplete,minlength,placeholder)=>`<label for="${id}" class="lc-password-label">${label}</label><div class="lc-password-wrap"><input type="password" id="${id}" autocomplete="${autocomplete}" minlength="${minlength}" required placeholder="${placeholder}"><button type="button" class="lc-password-toggle" data-password-for="${id}" data-password-label="${label.toLowerCase()}" aria-label="Show ${label.toLowerCase()}" aria-pressed="false" title="Show ${label.toLowerCase()}"><svg class="lc-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-5.5 10-5.5S22 12 22 12s-3.5 5.5-10 5.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></svg><svg class="lc-eye-off-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 3 18 18"/><path d="M10.6 6.6A11 11 0 0 1 12 6.5C18.5 6.5 22 12 22 12a14.8 14.8 0 0 1-4 4"/><path d="M6.2 6.8C3.4 8.5 2 12 2 12s3.5 5.5 10 5.5c1 0 2-.1 2.8-.35"/><path d="M10.2 10.2a2.55 2.55 0 0 0 3.6 3.6"/></svg></button></div>`;
 const passwordField=recovery?'':passwordControl('lcPassword',setPassword?'New password':'Password',setPassword?'new-password':'current-password',setPassword?8:6,setPassword?'At least 8 characters':'Enter your password');
 const confirmField=setPassword?passwordControl('lcPasswordConfirm','Confirm new password','new-password',8,'Repeat your new password'):'';
 const primary={signin:'Sign in',recover:'Send reset link','set-password':'Save new password'}[mode];
 el.innerHTML=`<main class="lc-auth-card"><img src="/assets/lirelo-imprint.png" alt="Lirelo emblem" class="lc-auth-logo"><h1>${titles[mode]}</h1><p>${descriptions[mode]}</p><form id="lcAuthForm">${emailField}${passwordField}${confirmField}<div id="lcAuthStatus" role="status" aria-live="polite"></div><button type="submit" id="lcLogin">${primary}</button>${mode==='signin'?'<button type="button" id="lcSignup">Create an account</button><button type="button" id="lcForgotPassword" class="lc-text-button">Forgot password?</button>':!setPassword?'<button type="button" id="lcBackToSignIn" class="lc-text-button">Back to sign in</button>':''}</form></main>`;
 el.querySelectorAll('.lc-password-toggle').forEach(toggle=>toggle.addEventListener('click',()=>{
  const input=el.querySelector('#'+toggle.dataset.passwordFor);
  if(!input)return;
  const visible=input.type==='password';
  input.type=visible?'text':'password';
  toggle.setAttribute('aria-pressed',String(visible));
  const label=(visible?'Hide ':'Show ')+toggle.dataset.passwordLabel;
  toggle.setAttribute('aria-label',label);
  toggle.title=label;
 }));
 const message=(msg,good=false)=>{const status=el.querySelector('#lcAuthStatus');if(!status)return;status.textContent=msg;status.style.color=good?'#416d59':'#AA5B5F'};
 if(options.message)message(options.message,Boolean(options.good));
 const run=async action=>{
  if(state.busy)return;
  const email=el.querySelector('#lcEmail')?.value.trim();
  const password=el.querySelector('#lcPassword')?.value;
  if(!setPassword&&!email){message('Enter your email address.');return;}
  if(!recovery&&(!password||password.length<(action==='signin'?6:8))){message(action==='signin'?'Enter your password.':'Use a password with at least eight characters.');return;}
  if(setPassword&&password!==el.querySelector('#lcPasswordConfirm').value){message('Your passwords do not match.');return;}
  state.busy=true;el.querySelectorAll('button').forEach(btn=>btn.disabled=true);
  try{
   if(action==='recover'){
    await http('/auth/v1/recover?redirect_to='+encodeURIComponent(location.origin),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})},false);
    message('If this email has a Lirelo account, a password reset link will arrive shortly.',true);
   }else if(action==='set-password'){
    await access();
    await http('/auth/v1/user',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password})});
    const user=await http('/auth/v1/user');state.user=user;
    await load();el.remove();document.getElementById('app').classList.add('lc-ready');
    window.LireloLibrary?.toast?.('Password updated. Welcome back to Lirelo.');
   }else{
    const route=action==='signup'?'/auth/v1/signup?redirect_to='+encodeURIComponent(location.origin):'/auth/v1/token?grant_type=password';
    const value=await http(route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})},false);
    if(value.access_token){saveSession(value);state.user=value.user;await load();el.remove();document.getElementById('app').classList.add('lc-ready');}
    else message('Check your inbox for the confirmation link. Once confirmed, you can sign in here.',true);
   }
  }catch(e){message(e.message)}finally{state.busy=false;el.querySelectorAll('button').forEach(btn=>btn.disabled=false)}
 };
 el.querySelector('form').addEventListener('submit',e=>{e.preventDefault();run(mode)});
 el.querySelector('#lcSignup')?.addEventListener('click',()=>run('signup'));
 el.querySelector('#lcForgotPassword')?.addEventListener('click',()=>authScreen({mode:'recover'}));
 el.querySelector('#lcBackToSignIn')?.addEventListener('click',()=>authScreen({mode:'signin'}));
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
 const profiles=await db('lirelo_profiles?select=display_name,preferences,collections');
 const profile=profiles[0]||null;
 const cloudName=profile?.display_name?.trim()||state.user.email.split('@')[0];
 state.suppress=true;
 try{rows.forEach(row=>{if(!state.books.some(b=>b.id===row.book_id))return;localStorage.setItem('lirelo-reader-v3-standalone:'+row.book_id,JSON.stringify(row.data));});if(profile){if(profile.preferences)localStorage.setItem('lirelo-complete-preferences-v1',JSON.stringify(profile.preferences));if(profile.display_name)localStorage.setItem('lirelo-complete-profile-v1',JSON.stringify({name:profile.display_name}));}}
 finally{state.suppress=false;}
 if(final){final.trash.splice(0,final.trash.length,...state.books.filter(b=>b.trashed));if(profile){if(profile.preferences){Object.assign(final.preferences,profile.preferences);document.documentElement.dataset.lireloPalette=final.preferences.palette||'classic';}final.profile.name=cloudName;document.querySelector('.profile-copy strong').textContent=cloudName;const initials=cloudName.split(/\s+/).slice(0,2).map(p=>p.charAt(0)).join('').toUpperCase();document.querySelector('.profile-avatar').textContent=initials;document.getElementById('topProfile').textContent=initials;}}
 if(final&&!profile){final.profile.name=cloudName;document.querySelector('.profile-copy strong').textContent=cloudName;const initials=cloudName.split(/\s+/).slice(0,2).map(p=>p.charAt(0)).join('').toUpperCase();document.querySelector('.profile-avatar').textContent=initials;document.getElementById('topProfile').textContent=initials;}
 document.querySelector('.profile-copy small').textContent=state.user.email;
 document.querySelector('.profile-copy small').title=state.user.email;
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
function saveProfile(){if(!state.user)return;defer('profile',()=>{const prefs=JSON.parse(localStorage.getItem('lirelo-complete-preferences-v1')||'{}');const raw=JSON.parse(localStorage.getItem('lirelo-complete-profile-v1')||'{}');return db('lirelo_profiles?on_conflict=user_id',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:state.user.id,display_name:String(raw.name||state.user.email.split('@')[0]).slice(0,55),preferences:prefs,collections:window.LireloLibrary?.state.collections||[],updated_at:new Date().toISOString()})})},800)}
function saveState(id){if(!state.user||!state.books.some(b=>b.id===id))return;
 defer('state:'+id,()=>{
  const raw=localStorage.getItem('lirelo-reader-v3-standalone:'+id);if(!raw)return;
  const data=JSON.parse(raw);
  return db('lirelo_reading_state?on_conflict=book_id',{method:'POST',headers:{'Content-Type':'application/json','Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({owner_id:state.user.id,book_id:id,data,updated_at:new Date().toISOString()})});
 },650);
}
const originalSetItem=Storage.prototype.setItem;
Storage.prototype.setItem=function(key,value){const result=originalSetItem.call(this,key,value);if(this===localStorage&&!state.suppress&&typeof key==='string'&&key.startsWith('lirelo-reader-v3-standalone:'))saveState(key.slice('lirelo-reader-v3-standalone:'.length));else if(this===localStorage&&!state.suppress&&['lirelo-complete-preferences-v1','lirelo-complete-profile-v1'].includes(key))saveProfile();return result};
function savedAnnotations(id){try{return JSON.parse(localStorage.getItem('lirelo-reader-v3-standalone:'+id))?.annotations||{}}catch{return{}}}
function saveNote(id,note){const key='lirelo-reader-v3-standalone:'+id;let data;try{data=JSON.parse(localStorage.getItem(key))||{}}catch{data={}}data.annotations ||= {highlights:[],notes:[],bookmarks:[]};data.annotations.notes ||= [];data.annotations.notes.unshift(note);localStorage.setItem(key,JSON.stringify(data));}
function deleteNote(id,noteId){const key='lirelo-reader-v3-standalone:'+id;let data;try{data=JSON.parse(localStorage.getItem(key))||{}}catch{data={}}if(!data.annotations?.notes)return;data.annotations.notes=data.annotations.notes.filter(n=>n.id!==noteId);localStorage.setItem(key,JSON.stringify(data));}
function syncTrash(trashed){const gone=new Set(trashed.map(b=>b.id));for(const b of state.books){const value=gone.has(b.id);if(value===b.trashed)continue;b.trashed=value;defer('trash:'+b.id,()=>db('lirelo_books?id=eq.'+encodeURIComponent(b.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:value})}),200);}}
async function removeForever(id){const b=state.books.find(x=>x.id===id);if(!b)return;await db('lirelo_books?id=eq.'+encodeURIComponent(id),{method:'DELETE'});await fetch(URL+'/storage/v1/object/'+BUCKET+'/'+b.storage_path,{method:'DELETE',headers:authHeaders(null)});state.books=state.books.filter(b=>b.id!==id);localStorage.removeItem('lirelo-reader-v3-standalone:'+id);}
function saveCollections(_list){saveProfile()} // Cloud profile stores custom collections; book assignments stay in their own records.
async function signOut(){
 if(!state.session)return;
 state.suppress=true;
 // Clear any cached data from this account so the next signer-in never sees it.
 for(const key of Object.keys(localStorage)){
  if(key.startsWith('lirelo-reader-v3-standalone:')||key.startsWith('lirelo-reader-progress:')||
     ['lirelo-complete-profile-v1','lirelo-complete-preferences-v1','lirelo-complete-tags-v1','lirelo-complete-trash-v1',SESSION].includes(key)) localStorage.removeItem(key);
 }
 state.suppress=false;
 const token=state.session.access_token;state.session=null;state.user=null;state.ready=false;
 // Clear the local session immediately, regardless of network availability.
 await fetch(URL+'/auth/v1/logout',{method:'POST',headers:{'apikey':KEY,'Authorization':'Bearer '+token}}).catch(()=>{});
 location.replace(location.pathname+location.search);
}
function addAccountControl(){
 const b=document.createElement('button');b.type='button';b.id='lcSignOut';b.className='lc-sign-out';b.textContent='Sign out';b.addEventListener('click',()=>window.LireloFinal?.requestSignOut?.());
 document.querySelector('.sidebar-profile')?.appendChild(b);
 document.getElementById('demoNote')?.remove();document.querySelector('.details-demo-foot')?.remove();document.querySelector('.p4-review-label')?.remove();
}
async function initialise(){
 addAccountControl();
 // Supabase email links return sessions in the URL fragment in its implicit flow.
 // Consume these before any book/reader routes and remove the sensitive tokens from history.
 const fragment=new URLSearchParams(location.hash.slice(1));
 const isCallback=fragment.has('access_token')||fragment.has('error');
 if(isCallback){
  const token=fragment.get('access_token'),refreshToken=fragment.get('refresh_token'),type=fragment.get('type');
  const callbackError=fragment.get('error_description')||fragment.get('error');
  history.replaceState(null,'',location.pathname+location.search);
  if(callbackError){authScreen({mode:'signin',message:callbackError.replaceAll('+',' ')});return;}
  if(token&&refreshToken){
   saveSession({access_token:token,refresh_token:refreshToken,expires_in:Number(fragment.get('expires_in')||3600),token_type:fragment.get('token_type')||'bearer'});
   if(type==='recovery'){authScreen({mode:'set-password'});return;}
  }
 }
 try{const session=JSON.parse(localStorage.getItem(SESSION)||'null');if(session?.access_token&&session.refresh_token){
  state.session=session;
  if(session.expires_at-Date.now()/1000<90)await refresh();
  if(state.session){const user=await http('/auth/v1/user');if(user?.id){state.user=user;await load();document.getElementById('app').classList.add('lc-ready');return;}}
 }}catch(e){console.warn('Sign-in check:',e.message)}
 authScreen();
}
window.LireloApp={ready,load,importBook,updateBook,updateProgress,saveNote,deleteNote,savedAnnotations,syncTrash,removeForever,saveCollections,request:service,signOut,get user(){return state.user}};
document.addEventListener('DOMContentLoaded',initialise,{once:true});
})();