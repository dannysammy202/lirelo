
/* Lirelo Phase 3 Reader. Separate from legacy Vela storage and remote APIs.
   The Python loopback service uses PyMuPDF for native PDF/EPUB rendering and selection geometry.
   This front end stores annotations in this origin's namespaced localStorage and uploaded files in a NEW IndexedDB database. */
(() => {
'use strict';
const lib=window.LireloLibrary;if(!lib)return;
const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const safe=lib.safe,ico=lib.svg,toast=lib.toast;
$$('[data-ri]').forEach(el=>el.innerHTML=ico(el.dataset.ri));
$('#readerLeft').querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=ico(el.dataset.icon));
const screen=$('#readerScreen'),canvas=$('#rrCanvas'),list=$('#rrRightList');
const small=()=>innerWidth<=760||((innerWidth<=1180||(innerWidth<=1366&&matchMedia('(pointer:coarse)').matches))&&matchMedia('(orientation:landscape)').matches);
const phone=()=>matchMedia('(max-width:767px), (max-width:1100px) and (max-height:500px) and (pointer:coarse)').matches;
const layoutArg=()=>state.doc?.layout==='mobile'?'&layout=mobile':'';
const state={active:false,book:null,doc:null,page:1,mode:'scroll',zoom:100,font:14,fontFace:'original',tone:'light',tonePinned:false,tab:'highlights',filter:'',tag:'all',annotations:{highlights:[],notes:[],bookmarks:[]},selection:null,search:[],searchIndex:0,offset:0,searchTerm:'',pages:new Map(),loading:new Set(),observer:null,drag:null,hideRight:false,restore:false};
const standardKey=()=>`lirelo-reader-v3-standalone:${state.book?.id}`;
const key=()=>standardKey()+(state.doc?.layout==='mobile'?':mobile':'');
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const currentChapter=page=>{const toc=state.doc?.toc||[];return [...toc].reverse().find(t=>t.page<=page)?.title||'Introduction';};
const displayPage=()=>state.doc?`${state.page} / ${state.doc.pages}`:'1 / 1';
async function api(path,opts){
 const live=()=>window.LireloApp.request(path,opts||{});
 const offline=window.LireloOffline,uid=window.LireloApp?.user?.id;
 if(!offline||!uid||opts)return live();
 const parsed=new URL(path,'https://lirelo.local'),params=parsed.searchParams,id=params.get('id');
 if(parsed.pathname==='meta'||parsed.pathname==='reflow'){
  const size=Number(params.get('size')||14);
  const font=params.get('font')||'original';
  const layout=params.get('layout')||'standard';
  const cached=()=>offline.getMeta(id,size,font,uid,layout);
  if(!navigator.onLine){const doc=await cached()||(layout==='mobile'?await offline.getMeta(id,14,'original',uid):null);if(doc)return doc;throw new Error('This book is not saved offline. Connect to the internet and use Save offline.')}
  try{const doc=await live();await offline.saveMeta(doc,uid).catch(e=>console.warn('Offline metadata:',e));return doc}
  catch(e){const doc=await cached();if(doc)return doc;throw e}
 }
 if(parsed.pathname==='page'&&state.doc?.id===id){
  const n=Number(params.get('page')),doc=state.doc;
  const saved=await offline.getPage(doc,n,uid).catch(()=>null);
  if(saved)return saved;
  if(!navigator.onLine)throw new Error('This page has not downloaded yet. Connect to complete offline saving.');
  const data=await live();
  await offline.savePage(doc,n,data,uid).catch(e=>{if(e?.name==='QuotaExceededError')toast('Device storage is full. Free space to download more pages.');else console.warn('Offline page:',e)});
  return data;
 }
 if(!navigator.onLine)throw new Error('Search requires a connection. Your saved book remains readable offline.');
 return live();
}

function mirrorPhoneAnnotations(){
 if(state.doc?.layout!=='mobile')return;
 let desktop;try{desktop=JSON.parse(localStorage.getItem(standardKey()))||{}}catch{desktop={}}
 desktop.annotations ||= {highlights:[],notes:[],bookmarks:[]};
 const total=Math.max(1,Number(desktop.pages)||Number(state.book?.pages)||1);
 let changed=false;
 for(const kind of ['highlights','notes','bookmarks']){
  const existing=Array.isArray(desktop.annotations[kind])?desktop.annotations[kind]:[];
  const mobile=state.annotations[kind]||[],byId=new Set(existing.map(item=>item.id));
  const present=new Set(mobile.map(item=>item.id));
  // Keep original desktop anchors untouched. Only phone-created annotations are mirrored.
  const kept=existing.filter(item=>item.sourceLayout!=='mobile'||present.has(item.id));
  if(kept.length!==existing.length)changed=true;
  for(const item of mobile){
   if(!item.id||byId.has(item.id))continue;
   kept.unshift({...item,sourceLayout:'mobile',page:clamp(Math.round(Number(item.page)/Math.max(1,state.doc.pages)*total),1,total),rects:[]});
   changed=true;
  }
  desktop.annotations[kind]=kept;
 }
 if(changed)localStorage.setItem(standardKey(),JSON.stringify(desktop));
}
function persist(){
 if(!state.book||!state.doc)return;
 try{
  localStorage.setItem(key(),JSON.stringify({annotations:state.annotations,page:state.page,offset:state.offset,mode:state.mode,zoom:state.zoom,font:state.font,fontFace:state.fontFace,tone:state.tone,tonePinned:state.tonePinned,pages:state.doc.pages,layout:state.doc.layout||'standard'}));
  mirrorPhoneAnnotations();
 }catch(err){if(err?.name==='QuotaExceededError')toast('Browser storage is full. Changes will remain until you close this tab.')}
}
function loadStored(){let raw=null;try{raw=JSON.parse(localStorage.getItem(key()))}catch{}const fromStandard=state.doc?.layout==='mobile';let base=null;if(fromStandard){try{base=JSON.parse(localStorage.getItem(standardKey()))}catch{}}const pref=window.LireloFinal?.preferences||{};const darkWorkspace=document.documentElement.dataset.lireloPalette==='dark';const preferredTone=['light','paper','dark'].includes(pref.tone)?pref.tone:'light';const initialTone=darkWorkspace&&!pref.toneExplicit?'dark':preferredTone;state.tonePinned=Boolean(raw?.tonePinned);state.annotations={highlights:[],notes:[],bookmarks:[]};if(raw){for(const k of Object.keys(state.annotations))state.annotations[k]=Array.isArray(raw.annotations?.[k])?raw.annotations[k]:[];state.page=clamp(Number(raw.page)||1,1,state.doc.pages);state.offset=clamp(Number(raw.offset)||0,0,1);state.mode=raw.mode==='swipe'?'swipe':'scroll';state.zoom=clamp(Number(raw.zoom)||100,75,phone()?300:175);state.font=clamp(Number(raw.font)||14,10,22);state.fontFace=['original','serif','sans'].includes(raw.fontFace)?raw.fontFace:'original';state.tone=state.tonePinned&&['light','paper','dark'].includes(raw.tone)?raw.tone:initialTone}else{
  state.page=state.book.id==='everyday'?4:1;state.offset=0;state.mode='scroll';state.zoom=100;state.font=Number.isFinite(+pref.size)?clamp(+pref.size,10,22):14;state.fontFace=['original','serif','sans'].includes(pref.font)?pref.font:'original';state.mode=pref.mode==='swipe'?'swipe':'scroll';state.tone=initialTone;
  if(state.doc?.layout==='mobile'){
   // Preserve the original desktop positions; mobile reading has a separate pagination.
   const lastProgress=clamp(Number(state.book?.progress)||0,0,100);
   state.page=clamp(Math.max(1,Math.round((lastProgress/100)*state.doc.pages)),1,state.doc.pages);
   state.mode='swipe';state.zoom=100;state.font=18;
   if(base?.annotations){for(const kind of ['notes','bookmarks','highlights'])state.annotations[kind]=(base.annotations[kind]||[]).map(item=>({...item,page:clamp(Math.round((Number(item.page)||1)/Math.max(1,Number(base.pages)||Number(state.book?.pages)||1)*state.doc.pages),1,state.doc.pages),rects:[]}));}
  }
  if(state.book.id==='everyday'){
    const p=window.LireloPreviewEngine.page(state.doc.id,4);
    function rect(starts){
      return p.spans.filter(sp=>starts.some(start=>sp.text.toLowerCase().startsWith(start.toLowerCase())))
        .map(sp=>[sp.x/p.width,sp.y/p.height,(sp.x+sp.w)/p.width,(sp.y+sp.h)/p.height]);
    }
    state.annotations.highlights=[
      {id:'sample-h1',page:4,text:'Good design makes an action clear. A labelled control should explain what happens next.',rects:rect(['Good design makes an action clear','happens next']),color:'lavender',chapter:'Affordances and Signifiers',created:1730000003000},
      {id:'sample-h2',page:4,text:'Signifiers work with familiar experience to guide behaviour.',rects:rect(['Signifiers work with familiar experience']),color:'yellow',chapter:'Affordances and Signifiers',created:1730000002000},
      {id:'sample-h3',page:5,text:'A highlight records a passage worth returning to.',rects:[],color:'lavender',chapter:'Reading for understanding',created:1730000001000}
    ];
    state.annotations.notes=[{id:'sample-n1',page:4,text:'Keep reading controls clear and within reach without interrupting the book.',quote:'A labelled control should explain what happens next.',rects:[],chapter:'Affordances and Signifiers',created:1730000002000}];
    state.annotations.bookmarks=[{id:'sample-b1',page:5,title:'Reading for understanding',chapter:'Reading for understanding',created:1730000001000}];
  }
 }
 if(state.doc?.layout==='mobile'&&base?.annotations){
  const total=Math.max(1,Number(base.pages)||Number(state.book?.pages)||1);
  for(const kind of ['notes','bookmarks','highlights']){
   const present=new Set(state.annotations[kind].map(item=>item.id));
   for(const item of base.annotations[kind]||[]){
    if(present.has(item.id))continue;
    state.annotations[kind].push({...item,page:clamp(Math.round(Number(item.page)/total*state.doc.pages),1,state.doc.pages),rects:[]});
   }
  }
 }
}
function updateMeta(){if(!state.doc)return;updateFullscreenPage();
 $('#rrBookTitle').textContent=state.book.title;$('#rrBookSubtitle').textContent=`${state.book.author} · ${state.doc.format.toUpperCase()} · your document`;
 $('#rrBookFormat').textContent=state.doc.format.toUpperCase();$('#rrLeftTitle').textContent=state.book.title;
 $('#rrPageLabel').textContent=displayPage();$('#rrPageBottom').textContent=`Page ${state.page} of ${state.doc.pages}`;
 $('#rrChapterMeta').textContent=currentChapter(state.page);$('#rrZoomLabel').textContent=state.zoom+'%';
 const fraction=(state.page-1+state.offset)/Math.max(1,state.doc.pages);
 const pct=Math.round(clamp(fraction*100,0,100));$('#rrProgressFill').style.width=pct+'%';$('#rrProgressText').textContent=`${pct}% read`;
 $('#rrDocMetadata').textContent=`${state.doc.format.toUpperCase()} · ${state.doc.pages} ${state.doc.reflowable?'reading pages':'pages'}`;
 const b=lib.state.books.find(b=>b.id===state.book.id);if(b){b.progress=pct;try{localStorage.setItem('lirelo-reader-progress:'+b.id,String(pct))}catch{}window.LireloApp?.updateProgress(b.id,pct);lib.render()}
 $('#rrModeText').textContent=state.mode==='scroll'?'Scroll':'Swipe';$('#rrReadingMode').value=state.mode;
 $('#rrFontSize').value=state.font;$('#rrFontValue').textContent=state.font+' pt';$('#rrPageTone').value=state.tone;$('#rrFontFace').value=state.fontFace;
 $('#rrZoomOut').disabled=state.zoom<=75;$('#rrZoomIn').disabled=state.zoom>=(phone()?300:175);$('#rrPrevious').disabled=state.page<=1;$('#rrNext').disabled=state.page>=state.doc.pages;
 screen.classList.toggle('rr-phone-zoom',phone()&&state.doc.format==='pdf'&&state.zoom>100);
 screen.classList.toggle('rr-phone-epub',phone()&&state.doc.layout==='mobile');
 canvas.style.setProperty('--rr-zoom',state.zoom/100);canvas.style.setProperty('--rr-base',Math.max(260,Math.min(small()?620:650,canvas.clientWidth-(small()?16:48)))+'px');canvas.dataset.tone=state.tone;canvas.dataset.mode=state.mode;
 const saved=state.annotations.bookmarks.some(b=>b.page===state.page);$('#rrBookmark').setAttribute('aria-pressed',String(saved));
 $('#rrJump').max=state.doc.pages;
 $$('#rrLeftToc [data-page]').forEach(b=>b.classList.toggle('active',Number(b.dataset.page)===state.page));
 $('#rrLeftHighlights').textContent=state.annotations.highlights.length||'';$('#rrLeftNotes').textContent=state.annotations.notes.length||'';$('#rrLeftBookmarks').textContent=state.annotations.bookmarks.length||'';
}
let database=null;
async function openDB(){if(database)return database;return new Promise((resolve,reject)=>{const request=indexedDB.open('lirelo-phase3-local-files',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('books'))request.result.createObjectStore('books',{keyPath:'id'})};request.onsuccess=()=>resolve(database=request.result);request.onerror=()=>reject(request.error)})}
async function dbPut(row){try{const db=await openDB();await new Promise((resolve,reject)=>{const t=db.transaction('books','readwrite');t.objectStore('books').put(row);t.oncomplete=resolve;t.onerror=()=>reject(t.error)})}catch(e){toast('This browser did not retain your uploaded file. Keep the tab open to continue reading.')}}
async function dbGet(id){try{const db=await openDB();return await new Promise((resolve,reject)=>{const request=db.transaction('books').objectStore('books').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}catch{return null}}
async function dbAll(){try{const db=await openDB();return await new Promise((resolve,reject)=>{const r=db.transaction('books').objectStore('books').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}catch{return []}}
async function restoreUploads(){for(const row of await dbAll()){if(!lib.state.books.some(b=>b.id===row.id)){const progress=localStorage.getItem('lirelo-reader-progress:'+row.id);if(progress!==null&&Number.isFinite(Number(progress)))row.meta.progress=clamp(Number(progress),0,100);lib.state.books.unshift(row.meta);(window.LireloPendingFiles ||= new Map()).set(row.id,row.file)}}lib.render();lib.renderCollectionsNav()}
async function rememberUploaded(){await new Promise(r=>setTimeout(r,0));const files=window.LireloPendingFiles||new Map();for(const [id,file] of files){if(savedUploads.has(id))continue;const meta=lib.state.books.find(b=>b.id===id);if(meta){savedUploads.add(id);await dbPut({id,file,meta})}}}
const savedUploads=new Set();
let offlineTask=null;
function setOfflineLabel(label,title,status='idle'){
 const button=$('#rrOfflineSave');if(!button)return;
 button.dataset.state=status;button.dataset.progress=label;
 button.title=title||label;button.setAttribute('aria-label',title||label);
 button.disabled=status==='saved';
}
async function updateOfflineButton(){
 if(!state.doc||!window.LireloOffline)return;
 const doc=state.doc;
 const count=await window.LireloOffline.pageCount(doc).catch(()=>0);
 if(state.doc!==doc||offlineTask)return;
 if(count>=doc.pages)setOfflineLabel('Saved','All '+doc.pages+' pages available offline','saved');
 else setOfflineLabel('Save offline',count?count+' of '+doc.pages+' pages cached. Save the full book.':'Save all '+doc.pages+' pages for offline reading.');
}
async function saveOffline(){
 if(!state.doc||!state.book)return;
 if(offlineTask){offlineTask.cancelled=true;return}
 if(!navigator.onLine){toast('Connect to the internet to download this book.');return}
 const book=state.book,doc=state.doc,uid=window.LireloApp?.user?.id;
 if(!uid)return;
 const task={cancelled:false};offlineTask=task;
 try{
  await window.LireloOffline.saveMeta(doc,uid);
  let saved=await window.LireloOffline.pageCount(doc,uid);
  setOfflineLabel(saved+'/'+doc.pages,'Downloading '+saved+' of '+doc.pages+' pages. Click to pause.','saving');
  for(let n=1;n<=doc.pages;n++){
   if(task.cancelled||!state.active||state.book!==book||window.LireloApp?.user?.id!==uid)break;
   if(await window.LireloOffline.getPage(doc,n,uid))continue;
   let downloaded=false;
   try{
    const batch=await window.LireloApp.request('batch?id='+encodeURIComponent(doc.id)+'&start='+n+'&count='+Math.min(3,doc.pages-n+1)+'&size='+(doc.font||14)+'&font='+(doc.fontface||'original')+(doc.layout==='mobile'?'&layout=mobile':''));
    if(!Array.isArray(batch.pages)||!batch.pages.length)throw new Error('Empty download batch');
    for(const data of batch.pages){
     if(task.cancelled||window.LireloApp?.user?.id!==uid)break;
     if(!await window.LireloOffline.getPage(doc,data.page,uid)){
      await window.LireloOffline.savePage(doc,data.page,data,uid);
      saved++;
     }
    }
    downloaded=true;
   }catch(e){
    if(e?.name==='QuotaExceededError')throw new Error('Device storage is full. Free some space and resume the download.');
    // Older deployments and oversized scanned pages fall back to a single page.
    await api('page?id='+encodeURIComponent(doc.id)+'&page='+n+'&size='+(doc.font||14)+'&font='+(doc.fontface||'original')+(doc.layout==='mobile'?'&layout=mobile':''));
    if(!await window.LireloOffline.getPage(doc,n,uid))throw new Error('Unable to store page '+n+' for offline use.');
    saved++;
   }
   setOfflineLabel(saved+'/'+doc.pages,'Downloading '+saved+' of '+doc.pages+' pages. Click to pause.','saving');
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  saved=await window.LireloOffline.pageCount(doc,uid);
  if(saved>=doc.pages)toast('Book saved for offline reading.');
  else if(task.cancelled)toast('Download paused. Click Save offline to resume.');
 }catch(e){toast('Offline download stopped: '+e.message)}
 finally{if(offlineTask===task)offlineTask=null;updateOfflineButton()}
}
async function getDocument(b){
  return api('meta?id='+encodeURIComponent(b.id)+(b.format==='epub'&&phone()?'&layout=mobile&size=18':''));
}

async function open(id,{page=null,pushHistory=true}={}){
 const b=lib.state.books.find(x=>x.id===id);if(!b)return;
 const token=Symbol();open.token=token;
 state.active=true;state.book=b;state.doc=null;state.pages.clear();state.loading.clear();state.search=[];state.selection=null;
 $('#readerScreen').classList.remove('hidden');$('#app').classList.add('reader-open');$('#detailsScreen').classList.add('hidden');$('.content-width').classList.add('hidden');
 screen.classList.remove('panel-open');$('#rrSettings').classList.add('hidden');$('#rrSearchbar').classList.add('hidden');$('#rrSelectBar').classList.add('hidden');
 canvas.innerHTML='<div class="rr-loading">Opening your document...</div>';lib.closeMobile();
 $('#rrBookTitle').textContent=b.title;$('#rrBookSubtitle').textContent='Preparing local reader';
 try{
  const d=await getDocument(b);if(open.token!==token)return;
  state.doc=d;screen.classList.toggle('rr-phone-epub',phone()&&d.layout==='mobile');loadStored();updateOfflineButton();if(page!=null)state.page=clamp(Number(page)||1,1,d.pages);
  if(d.reflowable&&(state.font!==d.font||state.fontFace!==d.fontface))state.doc=await api(`reflow?id=${encodeURIComponent(d.id)}&size=${state.font}&font=${state.fontFace}${layoutArg()}`);
  await initialiseCanvas();renderNavigation();updateMeta();setTab('highlights');updateOfflineButton();
  if(pushHistory)history.pushState({reader:id},'',`#reader=${encodeURIComponent(id)}`);
 }catch(e){canvas.innerHTML=`<div class="rr-loading"><p>${safe(e.message)}</p><button type="button" class="primary-button" id="rrRetry">Retry</button></div>`;$('#rrRetry')?.addEventListener('click',()=>open(id,{pushHistory:false}));toast(e.message)}
}
function close({showDetails=true}={}){
 if(offlineTask)offlineTask.cancelled=true;
 if(screen.classList.contains('rr-immersive')){screen.classList.remove('rr-immersive');if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});updateFullscreenButton()}
 open.token=Symbol();state.active=false;
 state.observer?.disconnect();state.observer=null;state.pages.clear();state.loading.clear();
 screen.classList.add('hidden');screen.classList.remove('panel-open');$('#app').classList.remove('reader-open');
 if(showDetails&&state.book){window.LireloBookDetails.open(state.book.id,{pushHistory:false})}
 else{$('.content-width').classList.remove('hidden')}
}
function back(){if(!state.active)return;const id=state.book?.id;history.replaceState({lireloBook:id},'',`#book=${encodeURIComponent(id)}`);close()}
const immersiveHud=document.createElement('nav');
immersiveHud.id='rrImmersiveHud';
immersiveHud.className='rr-immersive-hud';
immersiveHud.setAttribute('aria-label','Fullscreen reading controls');
immersiveHud.innerHTML='<button type="button" id="rrFocusPrev" aria-label="Previous page" title="Previous page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><span id="rrFocusPage" aria-live="off">1 / 1</span><button type="button" id="rrFocusNext" aria-label="Next page" title="Next page"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button><span class="rr-immersive-divider" aria-hidden="true"></span><button type="button" id="rrFocusExit" aria-label="Exit fullscreen reading" title="Exit fullscreen reading"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h6V3m12 6h-6V3M3 15h6v6m12-6h-6v6"/></svg></button>';
screen.appendChild(immersiveHud);
$('#rrFocusPrev').addEventListener('click',()=>jump(state.page-1));
$('#rrFocusNext').addEventListener('click',()=>jump(state.page+1));
$('#rrFocusExit').addEventListener('click',()=>toggleFullscreen());
function updateFullscreenPage(){
 if(!state.doc)return;
 $('#rrFocusPage').textContent=displayPage();
 $('#rrFocusPrev').disabled=state.page<=1;
 $('#rrFocusNext').disabled=state.page>=state.doc.pages;
}
function updateFullscreenButton(){
 const on=screen.classList.contains('rr-immersive'),button=$('#rrFullscreen');
 button.setAttribute('aria-pressed',String(on));
 button.setAttribute('aria-label',on?'Exit fullscreen reading':'Enter fullscreen reading');
 button.title=on?'Exit fullscreen reading (Esc)':'Enter fullscreen reading';
 button.innerHTML=on?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9h6V3m12 6h-6V3M3 15h6v6m12-6h-6v6"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>';
}
async function toggleFullscreen(){
 if(screen.classList.contains('rr-immersive')){
  if(document.fullscreenElement)await document.exitFullscreen().catch(()=>{});
  screen.classList.remove('rr-immersive');
 }else{
  screen.classList.remove('panel-open');
  $('#rrSettings').classList.add('hidden');$('#rrSearchbar').classList.add('hidden');$('#rrQuickJump').classList.add('hidden');$('#rrSelectBar').classList.add('hidden');
  screen.classList.add('rr-immersive');
  updateFullscreenPage();
  if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen().catch(()=>{});
 }
 updateFullscreenButton();
}
$('#rrFullscreen').addEventListener('click',toggleFullscreen);
$('#rrOfflineSave').addEventListener('click',saveOffline);
document.addEventListener('fullscreenchange',()=>{
 if(!document.fullscreenElement&&screen.classList.contains('rr-immersive')){
  screen.classList.remove('rr-immersive');updateFullscreenButton();
 }
});
$('#rrBack').addEventListener('click',back);$('#rrReturn').addEventListener('click',back);
$('#brandHome').addEventListener('click',()=>{if(state.active){close({showDetails:false});history.replaceState({},'','#library')}},true);
window.addEventListener('popstate',()=>{if(!state.active)return;const match=location.hash.match(/^#reader=(.+)$/);if(match){const id=decodeURIComponent(match[1]);if(id!==state.book?.id)open(id,{pushHistory:false})}else close({showDetails:location.hash.startsWith('#book=')})});
function renderNavigation(){const nodes=state.doc.toc||[];
 $('#rrLeftToc').innerHTML=nodes.map((t,i)=>`<button type="button" data-page="${t.page}" style="padding-left:${8+(t.depth-1)*11}px"><span>${String(i+1).padStart(2,'0')}</span>${safe(t.title)}</button>`).join('');
 $('#rrLeftToc').querySelectorAll('[data-page]').forEach(el=>el.addEventListener('click',()=>jump(Number(el.dataset.page))));
}
function trimPages(){
 if(state.mode!=='scroll'||state.pages.size<19)return;
 for(const [n,data] of state.pages){if(Math.abs(n-state.page)<=8)continue;
  const holder=$(`#rr-page-${n}`);
  if(holder?.dataset.ready){holder.innerHTML=`<div class="rr-page-content" style="aspect-ratio:${data.width}/${data.height}"><div class="rr-loading">Page ${n}</div></div><span class="rr-page-num">${n}</span>`;delete holder.dataset.ready}
  state.pages.delete(n);
 }
}
function emptySlots(){const group=document.createElement('div');group.className='rr-page-stack';group.id='rrPageStack';group.innerHTML=Array.from({length:state.doc.pages},(_,i)=>`<article class="rr-page" id="rr-page-${i+1}" data-page="${i+1}"><div class="rr-page-content" style="aspect-ratio:${state.doc.reflowable?'620/830':'620/820'}"><div class="rr-loading">Page ${i+1}</div></div><span class="rr-page-num">${i+1}</span></article>`).join('');canvas.replaceChildren(group);
 state.observer?.disconnect();state.observer=new IntersectionObserver(entries=>{for(const e of entries){if(e.isIntersecting){ensurePage(+e.target.dataset.page)}}},{root:canvas,rootMargin:'700px 0px',threshold:0.01});group.querySelectorAll('.rr-page').forEach(el=>state.observer.observe(el))}
async function initialiseCanvas(){
 canvas.scrollTop=0;canvas.dataset.mode=state.mode;
 if(state.mode==='scroll'){
  emptySlots();await ensurePage(state.page);requestAnimationFrame(()=>scrollToPage(state.page,state.offset));
 }else{
  canvas.innerHTML='<div class="rr-page-stack" id="rrPageStack"></div>';
  await swipeRender();
 }
}
function getRectStyle(box,w,h){return `left:${(100*box[0]/w).toFixed(4)}%;top:${(100*box[1]/h).toFixed(4)}%;width:${(100*(box[2]-box[0])/w).toFixed(4)}%;height:${(100*(box[3]-box[1])/h).toFixed(4)}%`}
function pageContent(data){const w=data.width,h=data.height;
 const fragments=data.spans.map(sp=>`<span class="rr-text-frag" style="left:${100*sp.x/w}%;top:${100*sp.y/h}%;width:${100*sp.w/w}%;height:${100*sp.h/h}%;font-size:${(sp.size/w*100).toFixed(4)}cqw">${safe(sp.text)}</span>`).join('');
 return `<div class="rr-page-content" style="aspect-ratio:${w}/${h}"><img class="rr-page-img${data.hasText?'':' rr-image-only'}" alt="Page ${data.page} of ${state.doc.pages}" draggable="false" src="${data.image}"><div class="rr-markers"></div><div class="rr-text-layer">${fragments}</div></div><span class="rr-page-num">${data.page}${data.hasText?'':' · image'}</span>`}
async function ensurePage(n){if(!state.active||!state.doc||n<1||n>state.doc.pages)return;
 const holder=$(`#rr-page-${n}`);if(!holder||state.loading.has(n)||holder.dataset.ready)return;
 state.loading.add(n);
 try{let data=state.pages.get(n);if(!data){data=await api(`page?id=${state.doc.id}&page=${n}&size=${state.doc.font||14}&font=${state.doc.fontface||'original'}${layoutArg()}`);state.pages.set(n,data)}
  if(!state.active||!$(`#rr-page-${n}`))return;
  holder.innerHTML=pageContent(data);holder.dataset.ready='1';paintMarkers(holder,n);
  requestAnimationFrame(()=>{holder.querySelectorAll('.rr-text-frag').forEach(frag=>{const range=document.createRange();range.selectNodeContents(frag);const natural=range.getBoundingClientRect().width,target=frag.getBoundingClientRect().width;if(natural>0&&target>0)frag.style.transform=`scaleX(${clamp(target/natural,.45,2.5)})`;})});
 }catch(e){holder.innerHTML=`<div class="rr-loading">Unable to load page ${n}. <button type="button" class="secondary-button" data-retry="${n}">Retry</button></div>`;holder.querySelector('button')?.addEventListener('click',()=>ensurePage(n))}
 finally{state.loading.delete(n);trimPages()}
}
const prefetching=new Set();
async function prefetchPage(n,doc){
 if(!state.active||!doc||state.doc!==doc||n<1||n>doc.pages||state.pages.has(n)||prefetching.has(n))return;
 prefetching.add(n);
 try{
  const result=await api(`page?id=${encodeURIComponent(doc.id)}&page=${n}&size=${doc.font||14}&font=${doc.fontface||'original'}${doc.layout==='mobile'?'&layout=mobile':''}`);
  if(state.active&&state.doc===doc)state.pages.set(n,result);
 }catch(err){console.warn('Page prefetch:',err.message)}
 finally{prefetching.delete(n)}
}
function trimSwipeCache(){
 if(state.mode!=='swipe'||state.pages.size<=14)return;
 for(const n of state.pages.keys())if(Math.abs(n-state.page)>5)state.pages.delete(n);
}
async function swipeRender(){const stack=$('#rrPageStack');if(!stack)return;
 const n=state.page;stack.innerHTML=`<article class="rr-page" id="rr-page-${n}" data-page="${n}"><div class="rr-page-content"><div class="rr-loading">Loading page ${n}...</div></div></article>`;
 await ensurePage(n);canvas.scrollTop=0;trimSwipeCache();
 if(state.active&&state.doc){const doc=state.doc;
  // Prefetch only the next page after rendering; this does not hold up page navigation.
  Promise.resolve().then(()=>prefetchPage(n+1,doc));
 }
}
function scrollToPage(n,offset=0){const node=$(`#rr-page-${n}`);if(node){canvas.scrollTo({top:Math.max(0,node.offsetTop-$('#rrPageStack').offsetTop-16+offset*node.offsetHeight),behavior:'instant'})}}
let lastScroll=0;
function observeScroll(){if(!state.active||state.mode!=='scroll'||!state.doc)return;
 const container=canvas.getBoundingClientRect(),ref=container.top+container.height*.27;
 let nearest=state.page,dist=Infinity;
 canvas.querySelectorAll('.rr-page').forEach(el=>{const b=el.getBoundingClientRect();const delta=Math.abs(b.top-ref);if(b.bottom>container.top&&b.top<container.bottom&&delta<dist){dist=delta;nearest=Number(el.dataset.page)}});
 const el=$(`#rr-page-${nearest}`);if(el){const b=el.getBoundingClientRect();const frac=clamp((ref-b.top)/Math.max(1,b.height),0,1);if(nearest!==state.page||Math.abs(frac-state.offset)>.015){state.page=nearest;state.offset=frac;updateMeta();persist();}}
}
canvas.addEventListener('scroll',()=>{if(state.mode==='scroll'&&state.active){cancelAnimationFrame(lastScroll);lastScroll=requestAnimationFrame(observeScroll)}});
async function jump(n,{locate=null}={}){if(!state.doc)return;state.page=clamp(n,1,state.doc.pages);state.offset=0;state.selection=null;$('#rrSelectBar').classList.add('hidden');
 if(state.mode==='scroll'){await ensurePage(state.page);scrollToPage(state.page)}else await swipeRender();
 updateMeta();persist();if(locate){const el=$(`#rr-page-${state.page}`);if(el){paintMarkers(el,state.page);const mark=el.querySelector(`[data-marker="${CSS.escape(locate)}"]`);mark?.scrollIntoView({block:'center',behavior:'smooth'})}}
 if(small())screen.classList.remove('panel-open');
}
$('#rrPrevious').addEventListener('click',()=>jump(state.page-1));$('#rrNext').addEventListener('click',()=>jump(state.page+1));
$('#rrPageTrigger').addEventListener('click',()=>{$('#rrQuickJump').classList.toggle('hidden');$('#rrQuickPage').max=state.doc?.pages||1;$('#rrQuickPage').value=state.page;if(!$('#rrQuickJump').classList.contains('hidden'))$('#rrQuickPage').focus()});
$('#rrQuickJump').addEventListener('submit',e=>{e.preventDefault();jump(Number($('#rrQuickPage').value)||1);$('#rrQuickJump').classList.add('hidden')});
$('#rrJumpForm').addEventListener('submit',e=>{e.preventDefault();jump(Number($('#rrJump').value)||1)});
async function setMode(next){state.mode=next;await initialiseCanvas();updateMeta();persist()}
$('#rrMode').addEventListener('click',()=>setMode(state.mode==='scroll'?'swipe':'scroll'));
$('#rrReadingMode').addEventListener('change',e=>setMode(e.target.value));
function setZoom(n){const prior=state.zoom;state.zoom=clamp(n,75,phone()?300:175);updateMeta();persist();if(phone()&&state.doc?.format==='pdf'){requestAnimationFrame(()=>{if(prior<=100&&state.zoom>100)canvas.scrollLeft=Math.max(0,(canvas.scrollWidth-canvas.clientWidth)/2);if(state.zoom<=100)canvas.scrollLeft=0})}}
$('#rrZoomOut').addEventListener('click',()=>setZoom(state.zoom-10));$('#rrZoomIn').addEventListener('click',()=>setZoom(state.zoom+10));
let relayoutToken=0;
$('#rrFontSize').addEventListener('input',e=>{$('#rrFontValue').textContent=e.target.value+' pt'});
$('#rrFontSize').addEventListener('change',async e=>{state.font=Number(e.target.value);if(!state.doc?.reflowable){toast('PDF font sizes follow the original document. Use zoom to enlarge the page.');return}
 const prior=(state.page-1)/Math.max(1,state.doc.pages-1),token=++relayoutToken;
 try{state.doc=await api(`reflow?id=${state.doc.id}&size=${state.font}&font=${state.fontFace}${layoutArg()}`);if(token!==relayoutToken)return;state.page=clamp(1+Math.round(prior*Math.max(0,state.doc.pages-1)),1,state.doc.pages);state.pages.clear();await initialiseCanvas();renderNavigation();updateMeta();persist();renderPanel()}catch(err){toast(err.message)}});
$('#rrFontFace').addEventListener('change',async e=>{state.fontFace=e.target.value;if(!state.doc?.reflowable){toast('PDF typography stays as defined in the original document.');return}const prev=(state.page-1)/Math.max(1,state.doc.pages-1);try{state.doc=await api(`reflow?id=${state.doc.id}&size=${state.font}&font=${state.fontFace}${layoutArg()}`);state.page=clamp(1+Math.round(prev*Math.max(0,state.doc.pages-1)),1,state.doc.pages);state.pages.clear();await initialiseCanvas();renderNavigation();updateMeta();persist();renderPanel()}catch(err){toast(err.message)}});
$('#rrPageTone').addEventListener('change',e=>{state.tone=e.target.value;state.tonePinned=true;updateMeta();persist()});
$('#rrSettingsToggle').addEventListener('click',()=>$('#rrSettings').classList.toggle('hidden'));
$('#rrHighlightTool').addEventListener('click',()=>{if(state.selection)saveHighlight();else toast(state.pages.get(state.page)?.hasText===false?'This image-only page has no selectable text. You may save a note or bookmark.':'Select text on the page before highlighting.')});
function onSelect(){if(!state.active)return;const selection=window.getSelection();const txt=selection?.toString()?.trim();if(!txt||txt.length>5000){state.selection=null;$('#rrSelectBar').classList.add('hidden');return}
 const anchor=selection.anchorNode?.parentElement?.closest('.rr-page');const focus=selection.focusNode?.parentElement?.closest('.rr-page');if(!anchor||!focus||anchor!==focus)return;
 const part=anchor.querySelector('.rr-page-content');if(!part||!anchor.dataset.ready)return;
 const outer=part.getBoundingClientRect();const boxes=Array.from(selection.getRangeAt(0).getClientRects()).map(r=>[clamp((r.left-outer.left)/outer.width,0,1),clamp((r.top-outer.top)/outer.height,0,1),clamp((r.right-outer.left)/outer.width,0,1),clamp((r.bottom-outer.top)/outer.height,0,1)]).filter(r=>r[2]>r[0]&&r[3]>r[1]);
 if(!boxes.length)return;state.selection={text:txt.slice(0,2000),page:+anchor.dataset.page,rects:boxes};$('#rrSelectBar').classList.remove('hidden');
}
canvas.addEventListener('mouseup',()=>setTimeout(onSelect,0));canvas.addEventListener('touchend',()=>setTimeout(onSelect,180));
function clearSelection(){window.getSelection()?.removeAllRanges();state.selection=null;$('#rrSelectBar').classList.add('hidden')}
function uid(){return 'a'+Date.now().toString(36)+Math.random().toString(36).slice(2,7)}
function saveHighlight(){const selected=state.selection;if(!selected){toast('Select text from the document first.');return}
 state.annotations.highlights.unshift({id:uid(),page:selected.page,text:selected.text,rects:selected.rects,color:'lavender',chapter:currentChapter(selected.page),created:Date.now()});
 const p=$(`#rr-page-${selected.page}`);if(p)paintMarkers(p,selected.page);clearSelection();setTab('highlights');updateMeta();persist();toast('Highlight saved.');
}
$('#rrSelectionHighlight').addEventListener('click',saveHighlight);
$('#rrSelectionNote').addEventListener('click',()=>openNote(true));
$('#rrAddNote').addEventListener('click',()=>openNote(false));
let noteContext=null;
function openNote(fromSelection){noteContext=fromSelection&&state.selection?{...state.selection}:{page:state.page,text:'',rects:[]};$('#rrQuotedText').textContent=noteContext.text||'';$('#rrQuotedText').classList.toggle('hidden',!noteContext.text);$('#rrNoteText').value='';$('#rrNoteDialog').showModal();$('#rrNoteText').focus()}
function closeNote(){$('#rrNoteDialog').close()}
$('#rrNoteClose').addEventListener('click',closeNote);$('#rrNoteCancel').addEventListener('click',closeNote);
$('#rrNoteSave').addEventListener('click',()=>{const value=$('#rrNoteText').value.trim();if(!value){$('#rrNoteText').focus();return}
 state.annotations.notes.unshift({id:uid(),page:noteContext.page,text:value,quote:noteContext.text,rects:noteContext.rects,created:Date.now()});
 closeNote();clearSelection();setTab('notes');updateMeta();persist();toast('Note saved.');
});
function bookmark(){const i=state.annotations.bookmarks.findIndex(b=>b.page===state.page);if(i>=0){state.annotations.bookmarks.splice(i,1);toast('Bookmark removed.')}else{state.annotations.bookmarks.unshift({id:uid(),page:state.page,title:currentChapter(state.page),created:Date.now()});toast('Page bookmarked.')}updateMeta();renderPanel();persist()}
$('#rrBookmark').addEventListener('click',bookmark);
function paintMarkers(el,n){const layer=el.querySelector('.rr-markers');if(!layer)return;const data=state.pages.get(n);if(!data)return;
 const annotations=[...state.annotations.highlights,...state.annotations.notes].filter(a=>a.page===n);
 let markup=annotations.flatMap(a=>(a.rects||[]).map(r=>`<span data-marker="${safe(a.id)}" class="rr-marker ${a.color==='yellow'?'yellow':''}" style="left:${r[0]*100}%;top:${r[1]*100}%;width:${(r[2]-r[0])*100}%;height:${(r[3]-r[1])*100}%"></span>`));
 for(const result of state.search.filter(s=>s.page===n)){markup.push(...result.rects.map(r=>`<span class="rr-marker search" style="${getRectStyle(r,data.width,data.height)}"></span>`))}
 layer.innerHTML=markup.join('');
}
function paintAll(){canvas.querySelectorAll('.rr-page[data-ready]').forEach(el=>paintMarkers(el,+el.dataset.page))}
function setTab(tab){state.tab=tab;state.tag='all';state.filter='';$('#rrFilter').value='';
 $$('.rr-right-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.rrTab===tab);b.setAttribute('aria-selected',String(b.dataset.rrTab===tab))});
 $$('.rr-left-link').forEach(b=>b.classList.toggle('active',b.dataset.left===tab));
 $('#rrFilter').placeholder=`Search ${tab}...`;renderPanel()
}
function renderPanel(){if(!state.doc)return;const tab=state.tab;
 $('#rrTagFilters').classList.toggle('hidden',tab==='contents');
 const items=state.annotations[tab]||[];
 if(tab==='contents'){$('#rrTagFilters').innerHTML='';list.innerHTML=(state.doc.toc||[]).map(t=>`<button type="button" class="rr-toc-item" data-jump="${t.page}" style="padding-left:${6+(t.depth-1)*13}px">${safe(t.title)}<span>Page ${t.page}</span></button>`).join('');list.querySelectorAll('[data-jump]').forEach(e=>e.addEventListener('click',()=>jump(+e.dataset.jump)));return}
 const colours=tab==='highlights'?['all','lavender','yellow']:['all'];$('#rrTagFilters').innerHTML=colours.map(c=>`<button type="button" class="${state.tag===c?'active':''}" data-tag="${c}">${c==='all'?'All ('+items.length+')':c==='lavender'?'Lavender':'Yellow'}</button>`).join('');
 $$('#rrTagFilters button').forEach(btn=>btn.addEventListener('click',()=>{state.tag=btn.dataset.tag;renderPanel()}));
 const sorted=items.filter(a=>(state.tag==='all'||a.color===state.tag)&&`${a.text||''} ${a.quote||''} ${a.title||''} ${a.chapter||''} ${a.page}`.toLowerCase().includes(state.filter.toLowerCase())).sort((a,b)=>b.created-a.created);
 if(!sorted.length){list.innerHTML=`<div class="rr-right-empty">${items.length?'No matches. Try a different search.':tab==='highlights'?'Select a passage in the document, then choose Highlight.':tab==='notes'?'Select a passage or use the note button to save your thoughts.':'Save a page to return to it later.'}</div>`;return}
 list.innerHTML=sorted.map(a=>`<article class="rr-right-item ${a.color==='yellow'?'yellow':''} ${tab==='notes'?'note':tab==='bookmarks'?'bookmark':''}"><button class="rr-item-remove" type="button" data-remove="${safe(a.id)}" title="Remove saved item" aria-label="Remove saved item" >${ico('x')}</button><p>${safe(a.text||a.title||'Saved page')}</p>${a.quote?`<p style="font-size:10px;color:#8B7F8D">“${safe(a.quote)}”</p>`:''}<footer><button type="button" data-goto="${safe(a.id)}">Page ${a.page} · ${safe(a.chapter||currentChapter(a.page))}</button>${tab==='highlights'?`<button data-recolour="${safe(a.id)}" type="button">${a.color==='yellow'?'Yellow':'Lavender'}</button>`:''}</footer></article>`).join('');
 list.querySelectorAll('[data-goto]').forEach(btn=>btn.addEventListener('click',()=>{const a=items.find(x=>x.id===btn.dataset.goto);if(a)jump(a.page,{locate:a.id})}));
 list.querySelectorAll('[data-recolour]').forEach(btn=>btn.addEventListener('click',()=>{const a=items.find(x=>x.id===btn.dataset.recolour);a.color=a.color==='yellow'?'lavender':'yellow';paintAll();persist();renderPanel()}));
 list.querySelectorAll('[data-remove]').forEach(btn=>btn.addEventListener('click',()=>{const i=items.findIndex(x=>x.id===btn.dataset.remove);if(i<0)return;items.splice(i,1);paintAll();renderPanel();updateMeta();persist();toast('Saved item removed.')}));
}
$$('.rr-right-tabs button').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.rrTab)));
$$('.rr-left-link').forEach(el=>el.addEventListener('click',()=>{setTab(el.dataset.left);if(small())openPanel(el.dataset.left)}));
$('#rrFilter').addEventListener('input',e=>{state.filter=e.target.value;renderPanel()});
function openPanel(tab){if(tab)setTab(tab);screen.classList.add('panel-open');$('#rrPanelToggle').setAttribute('aria-expanded','true')}
$('#rrPanelToggle').addEventListener('click',()=>{const is=screen.classList.toggle('panel-open');$('#rrPanelToggle').setAttribute('aria-expanded',String(is));if(!small()){$('#rrRightPanel').classList.toggle('hidden',!is);screen.classList.toggle('no-panel',!is)}});
$('#rrTocToggle').addEventListener('click',()=>openPanel('contents'));$('#rrSheetClose').addEventListener('click',()=>screen.classList.remove('panel-open'));
// Search uses the real document text, not search against an invented example transcript.
let searchToken=0,searchTimer;
$('#rrSearchToggle').addEventListener('click',()=>{$('#rrSearchbar').classList.toggle('hidden');if(!$('#rrSearchbar').classList.contains('hidden'))$('#rrSearchInput').focus();else{state.search=[];paintAll()}});
$('#rrSearchClose').addEventListener('click',()=>{$('#rrSearchbar').classList.add('hidden');state.search=[];paintAll()});
$('#rrSearchInput').addEventListener('input',()=>{clearTimeout(searchTimer);const q=$('#rrSearchInput').value.trim();const token=++searchToken;searchTimer=setTimeout(async()=>{if(!q){state.search=[];$('#rrSearchCount').textContent='';paintAll();return}
 try{const found=await api('search?id='+state.doc.id+'&size='+state.doc.font+'&font='+state.doc.fontface+layoutArg()+'&q='+encodeURIComponent(q));if(token!==searchToken)return;state.search=found.results;state.searchIndex=0;$('#rrSearchCount').textContent=found.count+' pages';paintAll();if(found.count){await jump(found.results[0].page);paintAll()}}catch(e){toast(e.message)}},300)});
function moveSearch(by){if(!state.search.length)return;state.searchIndex=(state.searchIndex+by+state.search.length)%state.search.length;jump(state.search[state.searchIndex].page).then(paintAll);$('#rrSearchCount').textContent=(state.searchIndex+1)+' / '+state.search.length+' pages'}
$('#rrSearchPrev').addEventListener('click',()=>moveSearch(-1));$('#rrSearchNext').addEventListener('click',()=>moveSearch(1));
// Arrow keys, trackpad horizontal scrolling and page dragging are only active in Swipe mode.
document.addEventListener('keydown',e=>{if(!state.active)return;if(e.key==='Escape'){if($('#rrNoteDialog').open)return;if(screen.classList.contains('rr-immersive')){toggleFullscreen();return;}$('#rrSettings').classList.add('hidden');$('#rrQuickJump').classList.add('hidden');screen.classList.remove('panel-open');$('#rrSelectBar').classList.add('hidden');return}
 const el=e.target;if(el.closest('input,textarea,select,[contenteditable]')||el.closest('dialog'))return;
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();$('#rrSearchbar').classList.remove('hidden');$('#rrSearchInput').focus();return}
 if(['ArrowRight','PageDown'].includes(e.key)&&state.mode==='swipe'){e.preventDefault();jump(state.page+1)}
 if(['ArrowLeft','PageUp'].includes(e.key)&&state.mode==='swipe'){e.preventDefault();jump(state.page-1)}
 if(e.key==='Home'&&!e.ctrlKey){e.preventDefault();jump(1)}if(e.key==='End'&&!e.ctrlKey){e.preventDefault();jump(state.doc.pages)}
});
let wheelTime=0;
canvas.addEventListener('wheel',e=>{if(state.mode!=='swipe'||!state.active)return;if(Math.abs(e.deltaX)>Math.abs(e.deltaY)*1.3&&Math.abs(e.deltaX)>15){e.preventDefault();if(Date.now()-wheelTime>280){wheelTime=Date.now();jump(state.page+(e.deltaX>0?1:-1))}}},{passive:false});
canvas.addEventListener('pointerdown',e=>{if(state.mode!=='swipe'||e.pointerType==='mouse'&&e.button!==0||!state.active)return;state.drag={x:e.clientX,y:e.clientY}});
canvas.addEventListener('pointerup',e=>{if(!state.drag)return;const dx=e.clientX-state.drag.x,dy=e.clientY-state.drag.y;state.drag=null;if(state.mode==='swipe'&&Math.abs(dx)>75&&Math.abs(dx)>Math.abs(dy)*1.6&&!window.getSelection()?.toString())jump(state.page+(dx<0?1:-1))});
// Double tap fixed-layout PDFs to enlarge text, while keeping EPUB text selection intact.
canvas.addEventListener('dblclick',e=>{
 if(!state.active||!phone()||state.doc?.format!=='pdf'||window.getSelection()?.toString())return;
 if(!e.target.closest('.rr-page'))return;
 e.preventDefault();setZoom(state.zoom<175?200:100);
});
// In tablet layout the annotations panel remains visible. In mobile layout it starts as a bottom sheet.
const resize=()=>{if(!state.active)return;if(!small()){$('#rrRightPanel').classList.remove('hidden')}else{screen.classList.remove('panel-open');$('#rrRightPanel').classList.remove('hidden')}};
window.addEventListener('resize',()=>{resize();if(state.active){updateMeta();if(state.mode==='scroll')requestAnimationFrame(()=>scrollToPage(state.page,state.offset));}});
Promise.resolve().then(()=>{if(location.hash.startsWith('#reader=')){const id=decodeURIComponent(location.hash.slice(8));window.LireloApp?.ready?.then(()=>open(id,{pushHistory:false}))}});
window.LireloReader={open,close,goTo:jump,zoomTo:setZoom,get state(){return state}};
})();
