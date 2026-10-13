/* Lirelo's device-specific app shell. UI only; existing auth, storage and readers are shared. */
(()=>{'use strict';
const app=document.getElementById('app'),lib=window.LireloLibrary;
if(!app||!lib||!window.LireloIconsax)return;
const $=id=>document.getElementById(id);
const icon=name=>window.LireloIconsax.svg(name);
const safe=lib.safe;
const isPhone=()=>matchMedia('(max-width:767px), (max-width:1100px) and (max-height:500px) and (pointer:coarse)').matches;
const isTablet=()=>matchMedia('(min-width:768px) and (max-width:1366px) and (min-height:501px) and (pointer:coarse)').matches;
const device=()=>isPhone()||isTablet();
let tab='home',origin='library',searchOpen=false,syncQueued=false;
const tabs=[['home','Home','book-open'],['library','Library','library'],['saved','Saved','bookmark'],['account','You','user']];
const makeTabs=()=>tabs.map(([id,label,ico])=>`<button type="button" data-lr-tab="${id}" aria-label="${label}" aria-current="${id==='home'?'page':'false'}"><span class="lr-nav-icon">${icon(ico)}</span><span class="lr-nav-label">${label}</span></button>`).join('');
const header=document.createElement('header');header.id='lrDeviceHeader';header.className='lr-device-header';
header.innerHTML=`<button class="lr-device-back" type="button" aria-label="Go back" title="Go back">${icon('arrow-left')}</button><button class="lr-device-wordmark" type="button" aria-label="Lirelo home"><span class="lr-mark" aria-hidden="true">◧</span>lirelo</button><strong class="lr-device-title" id="lrDeviceTitle">Home</strong><div class="lr-header-actions"><button type="button" id="lrDeviceSearchButton" aria-label="Search books" title="Search books">${icon('search')}</button><button type="button" id="lrDeviceAddButton" aria-label="Add a book" title="Add a book">${icon('plus')}</button><button type="button" id="lrDeviceAccountButton" aria-label="My account" title="My account"><span class="lr-account-avatar">D</span></button></div>`;
const workspace=app.querySelector('.workspace');workspace.prepend(header);
const search=document.createElement('div');search.id='lrDeviceSearch';search.className='lr-device-search';search.hidden=true;
search.innerHTML=`<label for="lrDeviceSearchInput">${icon('search')}<input type="search" id="lrDeviceSearchInput" autocomplete="off" placeholder="Search title, author or collection"></label><button type="button" id="lrDeviceSearchClose" aria-label="Close search">${icon('x')}</button>`;
header.after(search);
const bar=document.createElement('nav');bar.id='lrBottomNav';bar.className='lr-bottom-nav';bar.setAttribute('aria-label','App navigation');bar.innerHTML=makeTabs();workspace.appendChild(bar);
const rail=document.createElement('nav');rail.id='lrTabletRail';rail.className='lr-tablet-rail';rail.setAttribute('aria-label','Tablet navigation');
rail.innerHTML=`<button type="button" class="lr-rail-brand" data-lr-tab="home" aria-label="Lirelo home">l.</button><div class="lr-rail-items">${makeTabs()}</div><button type="button" id="lrRailAdd" aria-label="Add a book" title="Add a book">${icon('plus')}</button>`;
app.prepend(rail);
const home=document.createElement('section');home.id='lrDeviceHome';home.className='lr-device-home';home.setAttribute('aria-label','Your reading home');home.innerHTML='<p class="lr-loading-home">Preparing your reading space…</p>';
$('mainContent').insertBefore(home,app.querySelector('.content-width'));
const savedTabs=document.createElement('nav');savedTabs.id='lrSavedTabs';savedTabs.setAttribute('aria-label','Saved items');
savedTabs.innerHTML=`<button type="button" data-lr-saved="highlights">${icon('highlighter')}<span>Highlights</span></button><button type="button" data-lr-saved="notes">${icon('note')}<span>Notes</span></button><button type="button" data-lr-saved="bookmarks">${icon('bookmark')}<span>Bookmarks</span></button>`;
$('phase4Screen')?.prepend(savedTabs);
const actions=app.querySelector('.rr-top-actions');
if(actions){
 const more=document.createElement('button');more.type='button';more.id='lrReaderMore';more.className='rr-icon';more.setAttribute('aria-label','More reading tools');more.setAttribute('aria-expanded','false');more.innerHTML=icon('more');actions.appendChild(more);
 const sheet=document.createElement('div');sheet.id='lrReaderSheet';sheet.hidden=true;
 sheet.innerHTML=`<p>Reading tools</p><button type="button" data-lr-reader-action="rrSearchToggle">${icon('search')} Find in book</button><button type="button" data-lr-reader-action="rrOfflineSave">${icon('book-open')} Save for offline</button><button type="button" data-lr-reader-action="rrAddNote">${icon('note')} Add note</button><button type="button" data-lr-reader-action="rrHighlightTool">${icon('highlighter')} Highlight text</button><button type="button" data-lr-reader-action="rrPanelToggle">${icon('bookmark')} Contents & saved items</button><button type="button" data-lr-reader-action="rrSettingsToggle">${icon('sliders')} Reading preferences</button>`;
 $('readerScreen').append(sheet);
 more.addEventListener('click',()=>{sheet.hidden=!sheet.hidden;more.setAttribute('aria-expanded',String(!sheet.hidden))});
 sheet.addEventListener('click',e=>{const b=e.target.closest('[data-lr-reader-action]');if(!b)return;sheet.hidden=true;more.setAttribute('aria-expanded','false');$(b.dataset.lrReaderAction)?.click()});
 document.addEventListener('click',e=>{if(!sheet.hidden&&!e.target.closest('#lrReaderSheet,#lrReaderMore')){sheet.hidden=true;more.setAttribute('aria-expanded','false')}});
}
function closeAux(){if(window.LireloFinal?.state?.active)window.LireloFinal.leave();if(window.LireloPhase4?.state?.active)window.LireloPhase4.leave();}
function libraryHome(){
 closeAux();if(window.LireloReader?.state?.active)window.LireloReader.close({showDetails:false});
 if(window.LireloBookDetails?.activeId)window.LireloBookDetails.close({fromNavigation:true});
 lib.setSection('library');const content=app.querySelector('.content-width');content?.classList.remove('hidden');
}
function go(next){
 if(!device())return;
 if(next==='home'||next==='library'){libraryHome();tab=next;origin=next}
 else if(next==='saved'){if(window.LireloFinal?.state?.active)window.LireloFinal.leave();window.LireloPhase4?.enter('highlights');tab='saved'}
 else if(next==='account'){if(window.LireloPhase4?.state?.active)window.LireloPhase4.leave();window.LireloFinal?.enter('account');tab='account'}
 searchOpen=false;search.hidden=true;
 $('mainContent')?.scrollTo({top:0,behavior:'instant'});
 renderHome();sync();
}
function cover(book){
 const c=['#6F627E','#8B776E','#456B77','#6D6A91','#986F72'][String(book.id).length%5];
 return `<div class="lr-book-cover" style="--lr-cover:${c}"><span>${safe((book.format||'BOOK').toUpperCase())}</span><strong>${safe(book.title)}</strong><small>${safe(book.author)}</small></div>`;
}
function renderHome(){
 if(!device())return;
 const books=lib.state.books.filter(b=>!b.trashed).slice();
 const reading=books.filter(b=>Number(b.progress)>0&&Number(b.progress)<100).sort((a,b)=>(b.added||0)-(a.added||0));
 const recent=books.sort((a,b)=>(b.added||0)-(a.added||0)).slice(0,8);
 const leading=reading[0],pc=leading?Math.min(100,Math.max(0,Math.round(+leading.progress||0))):0;
 home.innerHTML=`<div class="lr-home-welcome"><p class="lr-overline">YOUR READING SPACE</p><h1>Make room for a good book.</h1><p>Your books, notes and progress — together wherever you read.</p></div>
 <div class="lr-home-section-heading"><div><span class="lr-overline">PICK UP WHERE YOU LEFT OFF</span><h2>Continue reading</h2></div></div>
 ${leading?`<button type="button" class="lr-continue-card" data-lr-continue="${safe(leading.id)}">${cover(leading)}<span class="lr-continue-info"><span class="lr-overline">CURRENTLY READING</span><strong>${safe(leading.title)}</strong><small>${safe(leading.author)}</small><span class="lr-continue-progress"><span style="width:${pc}%"></span></span><span class="lr-continue-bottom"><span>${pc}% read</span><span class="lr-continue-link">Continue ${icon('arrow-right')}</span></span></span></button>`:`<div class="lr-first-book"><div class="lr-first-illustration">${icon('book-open')}</div><strong>${books.length?'Choose your next read':'Your library starts here'}</strong><p>${books.length?'Open any book to start reading.':'Add your first PDF or EPUB to build a personal reading space.'}</p><button type="button" data-lr-action="${books.length?'library':'add'}">${books.length?'Browse books':'Add your first book'} ${icon('arrow-right')}</button></div>`}
 <div class="lr-home-section-heading lr-recent-heading"><div><span class="lr-overline">YOUR COLLECTION</span><h2>Recently added</h2></div><button type="button" data-lr-action="library">See all ${icon('arrow-right')}</button></div>
 ${recent.length?`<div class="lr-home-books">${recent.map(b=>`<button type="button" class="lr-home-book" data-lr-open="${safe(b.id)}">${cover(b)}<strong>${safe(b.title)}</strong><small>${safe(b.author)}</small></button>`).join('')}</div>`:'<p class="lr-home-empty">Your books will appear here when you add them.</p>'}
 <div class="lr-home-quick"><button type="button" data-lr-action="saved">${icon('bookmark')}<span><strong>Saved passages</strong><small>Highlights, notes and bookmarks</small></span>${icon('arrow-right')}</button><button type="button" data-lr-action="add">${icon('plus')}<span><strong>Add a book</strong><small>Import a PDF or EPUB</small></span>${icon('arrow-right')}</button></div>`;
}
function goToDetails(id){origin=tab;window.LireloBookDetails?.open(id);sync()}
home.addEventListener('click',e=>{
 const cont=e.target.closest('[data-lr-continue]');if(cont){origin='home';window.LireloReader?.open(cont.dataset.lrContinue);sync();return}
 const book=e.target.closest('[data-lr-open]');if(book){goToDetails(book.dataset.lrOpen);return}
 const a=e.target.closest('[data-lr-action]');if(a){if(a.dataset.lrAction==='add')$('fileInput')?.click();else go(a.dataset.lrAction)}
});
function route(e){const b=e.target.closest('[data-lr-tab]');if(b){go(b.dataset.lrTab);return}}
bar.addEventListener('click',route);rail.addEventListener('click',route);
$('lrRailAdd').addEventListener('click',()=>$('fileInput')?.click());
header.querySelector('.lr-device-wordmark').addEventListener('click',()=>go('home'));
header.querySelector('.lr-device-back').addEventListener('click',()=>{
 if(window.LireloBookDetails?.activeId){if(origin==='home')go('home');else go('library')}else if(app.classList.contains('final-open')||app.classList.contains('phase4-open'))go('home');else go('home');
});
$('detailsBack')?.addEventListener('click',e=>{if(device()&&origin==='home'){e.preventDefault();e.stopImmediatePropagation();go('home')}},true);
$('lrDeviceSearchButton').addEventListener('click',()=>{
 if(tab!=='library')go('library');
 searchOpen=!searchOpen;search.hidden=!searchOpen;
 if(searchOpen){$('lrDeviceSearchInput').value=$('sidebarSearch').value;$('lrDeviceSearchInput').focus()}
});
$('lrDeviceSearchClose').addEventListener('click',()=>{searchOpen=false;search.hidden=true});
$('lrDeviceSearchInput').addEventListener('input',e=>{
 const input=$('sidebarSearch');input.value=e.target.value;
 input.dispatchEvent(new Event('input',{bubbles:true}));
 tab='library';sync();
});
$('lrDeviceAddButton').addEventListener('click',()=>$('fileInput')?.click());
$('lrDeviceAccountButton').addEventListener('click',()=>go('account'));
$('fileInput')?.addEventListener('change',()=>{tab='library';origin='library';scheduleSync()},true);
savedTabs.addEventListener('click',e=>{const b=e.target.closest('[data-lr-saved]');if(!b)return;window.LireloPhase4?.enter(b.dataset.lrSaved);tab='saved';sync()});
function sync(){
 if(!device())return;
 const reader=app.classList.contains('reader-open');
 const details=!!window.LireloBookDetails?.activeId&&!reader;
 const saved=app.classList.contains('phase4-open');
 const account=app.classList.contains('final-open');
 if(reader){app.dataset.lrView='reader'}else if(details){app.dataset.lrView='details'}else if(saved){app.dataset.lrView='saved';tab='saved'}else if(account){app.dataset.lrView='account';tab='account'}else app.dataset.lrView=tab;
 const active=reader?'library':details?origin:(saved?'saved':account?'account':tab);
 app.querySelectorAll('[data-lr-tab]').forEach(b=>{const selected=b.dataset.lrTab===active;b.classList.toggle('active',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
 header.querySelector('.lr-device-back').hidden=!(details||saved||account);
 header.querySelector('.lr-device-wordmark').hidden=details||saved||account;
 const title=details?'Book details':reader?'Reader':saved?'Saved':account?'Account':tab==='home'?'Home':lib.state.section==='reading'?'Reading now':'My library';
 $('lrDeviceTitle').textContent=title;
 header.classList.toggle('lr-is-subpage',details||saved||account);
 const which=saved&&window.LireloPhase4?.state?.tab;
 savedTabs.querySelectorAll('[data-lr-saved]').forEach(b=>{const sel=b.dataset.lrSaved===which;b.classList.toggle('active',sel);b.setAttribute('aria-pressed',String(sel))});
 const profile=(window.LireloFinal?.profile?.name||window.LireloApp?.user?.email||'L').trim();
 header.querySelector('.lr-account-avatar').textContent=profile.charAt(0).toUpperCase();
}
function scheduleSync(){if(syncQueued)return;syncQueued=true;requestAnimationFrame(()=>{syncQueued=false;sync()})}
const observer=new MutationObserver(scheduleSync);
observer.observe(app,{attributes:true,attributeFilter:['class']});
for(const id of ['detailsScreen','phase4Screen','finalScreen','readerScreen']){const node=$(id);if(node)observer.observe(node,{attributes:true,attributeFilter:['class']})}
window.addEventListener('popstate',()=>{setTimeout(sync,0)});
window.addEventListener('resize',()=>{if(device()){renderHome();sync()}});
const render=lib.render.bind(lib);
lib.render=function(...args){const result=render(...args);if(device()&&tab==='home')renderHome();return result};
if(device()){app.dataset.lrView='home';renderHome();sync()}
window.LireloDeviceShell={navigate:go,refresh:()=>{renderHome();sync()}};
})();