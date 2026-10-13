/* Approved Lirelo reader experience for phones and touch tablets.
   Presentation adapter: existing PDF/EPUB engine, cloud state and annotations remain authoritative. */
(()=>{'use strict';
const screen=document.getElementById('readerScreen');
const canvas=document.getElementById('rrCanvas');
if(!screen||!canvas||!window.LireloReader)return;
const $=id=>document.getElementById(id);
const state=()=>window.LireloReader?.state;
const isTouchDevice=()=>matchMedia('(max-width:767px), (min-width:768px) and (max-width:1366px) and (pointer:coarse)').matches;
const isReading=()=>isTouchDevice()&&state()?.active&&!!state()?.doc;
const icon=(name)=>({
 down:'<path d="m6 9 6 6 6-6"/>',
 more:'<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
 book:'<path d="M4 19V5c4-1.8 6.5-1 8 0 1.5-1 4-1.8 8 0v14c-4-1.8-6.5-1-8 0-1.5-1-4-1.8-8 0Z"/><path d="M12 5v14"/>'
}[name]||'');
const svg=(n)=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+icon(n)+'</svg>';
const safe=(text)=>String(text??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const ui={
 mode:null,
 overlay:null,
 focus:false,
 night:false,
 wake:false,
 wakeLock:null,
 font:18,
 tab:'contents',
 query:'',
 loaded:null,
 cachedBook:'',
 trigger:null,
 selectedText:false,
 panelRendered:false
};
const pagePill=document.createElement('button');
pagePill.type='button';pagePill.id='acrPagePill';pagePill.setAttribute('aria-label','Open contents and annotations');
pagePill.innerHTML='<span id="acrPageCount">1 of 1</span>'+svg('down');
screen.querySelector('.rr-centre')?.append(pagePill);
const overlay=document.createElement('div');
overlay.id='acrOverlay';overlay.hidden=true;overlay.innerHTML='<button type="button" class="acr-scrim" aria-label="Close panel"></button><section class="acr-sheet" role="dialog" aria-modal="true" aria-labelledby="acrTitle"><div class="acr-handle" aria-hidden="true"></div><header class="acr-sheet-head"><h2 id="acrTitle">View settings</h2><button class="acr-close" type="button" aria-label="Close panel">×</button></header><div id="acrSheetBody" class="acr-sheet-body"></div></section>';
screen.append(overlay);ui.overlay=overlay;
const body=overlay.querySelector('#acrSheetBody');
function notify(message){const lib=window.LireloLibrary;if(lib?.toast)lib.toast(message)}
function hideOverlay(){
 if(overlay.hidden)return;
 overlay.hidden=true;
 document.body.classList.remove('acr-sheet-open');
 ui.overlayType=null;
 $('lrReaderMore')?.setAttribute('aria-expanded','false');
 if(ui.trigger?.isConnected)ui.trigger.focus({preventScroll:true});
 ui.trigger=null;
}
function showOverlay(type,trigger){
 if(!isReading())return;
 ui.trigger=trigger||document.activeElement;
 ui.overlayType=type;overlay.hidden=false;
 screen.classList.remove('acr-focus');ui.focus=false;
 document.body.classList.add('acr-sheet-open');
 const heading=type==='settings'?'View settings':type==='contents'?'Navigate your book':'More reading tools';
 overlay.querySelector('#acrTitle').textContent=heading;
 if(type==='settings')renderSettings();
 else if(type==='contents')renderContents();
 else renderMore();
 $('lrReaderMore')?.setAttribute('aria-expanded','true');
 overlay.querySelector('.acr-close').focus({preventScroll:true});
}
overlay.querySelector('.acr-scrim').addEventListener('click',hideOverlay);
overlay.querySelector('.acr-close').addEventListener('click',hideOverlay);
function optionMarkup(value,label,sub,ico,active){
 return '<button type="button" class="acr-mode'+(active?' active':'')+'" data-acr-mode="'+value+'" aria-pressed="'+String(active)+'"><span class="acr-mode-icon" aria-hidden="true">'+ico+'</span><span class="acr-mode-text">'+label+'<small>'+sub+'</small></span>'+(active?'<span class="acr-check" aria-hidden="true">✓</span>':'')+'</button>';
}
function renderSettings(){
 const doc=state()?.doc;const epub=doc?.format==='epub';
 body.innerHTML='<div class="acr-section-label">Page display</div>'+
  optionMarkup('continuous','Continuous','Scroll naturally through pages','☷',ui.mode==='continuous')+
  optionMarkup('single','Single page','Swipe to turn pages','▤',ui.mode==='single')+
  optionMarkup('reading','Reading mode',epub?'Selectable text that adapts to your screen':'Reflow selectable text where available','≡',ui.mode==='reading')+
  '<div class="acr-section-label">Reading comfort</div>'+
  '<div class="acr-setting"><span>Night mode</span><button type="button" class="acr-switch'+(ui.night?' on':'')+'" id="acrNight" role="switch" aria-checked="'+String(ui.night)+'" aria-label="Night mode"></button></div>'+
  '<div class="acr-setting"><span>Keep screen awake</span><button type="button" class="acr-switch'+(ui.wake?' on':'')+'" id="acrWake" role="switch" aria-checked="'+String(ui.wake)+'" aria-label="Keep screen awake"></button></div>'+
  (ui.mode==='reading'?'<div class="acr-setting"><span>Text size</span><div style="display:flex;align-items:center;gap:9px"><button id="acrFontMinus" aria-label="Decrease text size">A−</button><span class="acr-amount" id="acrFontValue">'+ui.font+'px</span><button id="acrFontPlus" aria-label="Increase text size">A+</button></div></div>':'')+
  '<p class="acr-hint">PDF pages retain their original design. Reading mode uses selectable document text when available; image-only pages stay in document view.</p>';
}
function renderMore(){
 const offline=$('rrOfflineSave')?.dataset.state==='saved';
 body.innerHTML='<div class="acr-section-label">Document tools</div>'+
  optionMarkup('settings','View settings','Scroll, pages, reading mode and tone','⚙',false)+
  optionMarkup('contents','Contents & saved passages','Chapters, highlights, notes and bookmarks','☷',false)+
  optionMarkup('offline',offline?'Available offline':'Save for offline','Download pages to read without a connection','↓',false)+
  optionMarkup('note','Add a note','Write a note for this page','✎',false)+
  '<p class="acr-hint">Select words in the document to highlight or add a note.</p>';
}
function contentsItems(){
 const current=state();
 if(!current?.doc)return [];
 if(ui.tab==='contents')return (current.doc.toc||[]).map(t=>({page:t.page,label:t.title,sub:'Page '+t.page}));
 const items=current.annotations?.[ui.tab]||[];
 return items.map(a=>({page:a.page,label:a.quote||a.text||a.title||current.book?.title||'Saved passage',sub:'Page '+a.page,id:a.id}));
}
function renderContents(keepSearch=false){
 const tabs=['contents','highlights','notes','bookmarks'];
 const tabHeading={contents:'chapters',highlights:'highlights',notes:'notes',bookmarks:'bookmarks'};
 const html='<div class="acr-tabs" role="tablist" aria-label="Reading items">'+tabs.map(t=>'<button type="button" role="tab" data-acr-tab="'+t+'" aria-selected="'+String(ui.tab===t)+'">'+t.charAt(0).toUpperCase()+t.slice(1)+'</button>').join('')+'</div>'+
 '<input class="acr-filter" type="search" id="acrFilter" aria-label="Search '+tabHeading[ui.tab]+'" placeholder="Search '+tabHeading[ui.tab]+'…" value="'+safe(ui.query)+'">'+
 '<div class="acr-items" id="acrItems"></div>';
 if(!keepSearch)body.innerHTML=html;
 else{const focus=document.activeElement?.id==='acrFilter';const pos=focus?document.activeElement.selectionStart:null;body.innerHTML=html;if(focus){const input=$('acrFilter');input.focus();input.setSelectionRange(pos,pos)}}
 const query=ui.query.toLocaleLowerCase().trim();
 const items=contentsItems().filter(item=>!query||String(item.label).toLocaleLowerCase().includes(query));
 $('acrItems').innerHTML=items.length?items.map(x=>'<button type="button" class="acr-item" data-acr-page="'+Number(x.page)+'"'+(x.id?' data-acr-id="'+safe(x.id)+'"':'')+'><span>'+safe(x.label)+'</span><small>'+safe(x.sub)+'</small></button>').join(''):'<p class="acr-empty">'+(query?'No matching passages.':'Nothing saved here yet.')+'</p>';
}
function applyTone(){
 screen.classList.toggle('acr-night',ui.night);
 const select=$('rrPageTone');
 if(select){
  select.value=ui.night?'dark':'light';
  select.dispatchEvent(new Event('change',{bubbles:true}));
 }
}
function applyReflow(){
 screen.classList.toggle('acr-reflow',ui.mode==='reading');
 screen.style.setProperty('--acr-reading-size',ui.font+'px');
 updateNativeText();
}
function changeMode(mode){
 if(!isReading())return;
 if(['continuous','single','reading'].indexOf(mode)<0)return;
 ui.mode=mode;
 const select=$('rrReadingMode');
 const engineMode=mode==='single'?'swipe':'scroll';
 if(select&&state()?.mode!==engineMode){
  select.value=engineMode;
  select.dispatchEvent(new Event('change',{bubbles:true}));
 }
 applyReflow();
 savePrefs();
 renderSettings();
}
function savePrefs(){
 const uid=window.LireloApp?.user?.id||'device';
 try{localStorage.setItem('lirelo-approved-reader:'+uid,JSON.stringify({font:ui.font,night:ui.night,wake:ui.wake,mode:ui.mode}))}catch{}
}
function restorePrefs(){
 const uid=window.LireloApp?.user?.id||'device';
 let val=null;try{val=JSON.parse(localStorage.getItem('lirelo-approved-reader:'+uid))}catch{}
 ui.font=Math.max(13,Math.min(28,Number(val?.font)||18));
 ui.night=!!val?.night;ui.wake=!!val?.wake;
 ui.mode=(val?.mode&&['continuous','single','reading'].includes(val.mode))?val.mode:(state()?.doc?.format==='epub'?'reading':'single');
}
async function releaseWake(){if(ui.wakeLock){try{await ui.wakeLock.release()}catch{}ui.wakeLock=null}}
async function acquireWake(){
 if(!ui.wake||!isReading()||document.visibilityState!=='visible')return;
 if(!navigator.wakeLock?.request){ui.wake=false;notify('Keeping the screen awake is not supported on this device.');return}
 try{ui.wakeLock=await navigator.wakeLock.request('screen')}catch{ui.wake=false;notify('Your device did not allow screen wake lock.')}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&ui.wake)acquireWake()});
body.addEventListener('input',e=>{if(e.target.id==='acrFilter'){ui.query=e.target.value;const term=ui.query.toLocaleLowerCase().trim();$('acrItems').querySelectorAll('[data-acr-page]').forEach(row=>row.hidden=!!term&&!row.textContent.toLocaleLowerCase().includes(term))}});
body.addEventListener('click',async e=>{
 const tab=e.target.closest('[data-acr-tab]');
 if(tab){ui.tab=tab.dataset.acrTab;ui.query='';renderContents();return}
 const item=e.target.closest('[data-acr-page]');
 if(item){const n=Number(item.dataset.acrPage);hideOverlay();await window.LireloReader.goTo(n,item.dataset.acrId?{locate:item.dataset.acrId}:{});return}
 const op=e.target.closest('[data-acr-mode]');
 if(op){
  const mode=op.dataset.acrMode;
  if(mode==='settings'||mode==='contents'){showOverlay(mode,op);return}
  if(mode==='offline'){hideOverlay();$('rrOfflineSave')?.click();return}
  if(mode==='note'){hideOverlay();$('rrAddNote')?.click();return}
  changeMode(mode);return;
 }
 if(e.target.closest('#acrNight')){ui.night=!ui.night;applyTone();savePrefs();renderSettings();return}
 if(e.target.closest('#acrWake')){ui.wake=!ui.wake;if(ui.wake)await acquireWake();else await releaseWake();savePrefs();renderSettings();return}
 if(e.target.closest('#acrFontMinus,#acrFontPlus')){
  ui.font=Math.max(13,Math.min(28,ui.font+(e.target.closest('#acrFontPlus')?1:-1)));
  applyReflow();savePrefs();renderSettings();return;
 }
});
pagePill.addEventListener('click',()=>{ui.tab='contents';ui.query='';showOverlay('contents',pagePill)});
const more=$('lrReaderMore');if(more)more.addEventListener('click',e=>{
 if(!isReading())return;
 e.preventDefault();e.stopImmediatePropagation();showOverlay('settings',more);
},{capture:true});
function updatePagePill(){
 const doc=state()?.doc;
 if(!doc||!isReading())return;
 $('acrPageCount').textContent=state().page+' of '+doc.pages;
}
const label=$('rrPageLabel');
if(label)new MutationObserver(()=>{updatePagePill();updateNativeText()}).observe(label,{subtree:true,childList:true,characterData:true});
let press=null;
canvas.addEventListener('touchstart',e=>{if(!isReading()||e.touches.length!==1)return;press={x:e.touches[0].clientX,y:e.touches[0].clientY,moved:false}},{passive:true});
canvas.addEventListener('touchmove',e=>{if(press&&e.touches.length){if(Math.abs(e.touches[0].clientX-press.x)>10||Math.abs(e.touches[0].clientY-press.y)>10)press.moved=true}},{passive:true});
canvas.addEventListener('click',e=>{
 if(!isReading()||!overlay.hidden)return;
 if(press?.moved){press=null;return}
 press=null;
 if(e.target.closest('button,a,input,textarea,select,.rr-select-bar')||window.getSelection()?.toString().trim())return;
 ui.focus=!ui.focus;screen.classList.toggle('acr-focus',ui.focus);
});
document.addEventListener('keydown',e=>{
 if(!isReading()||e.key!=='Escape')return;
 if(!overlay.hidden){e.stopImmediatePropagation();e.preventDefault();hideOverlay()}
 else if(ui.focus){ui.focus=false;screen.classList.remove('acr-focus');e.stopImmediatePropagation();e.preventDefault()}
},{capture:true});
const scan=new MutationObserver(()=>{
 if(!isTouchDevice())return;
 if(state()?.active&&state()?.doc){
  if(!screen.classList.contains('acr-enabled'))enterReader();
  updateNativeText();
 }else if(screen.classList.contains('acr-enabled'))leaveReader();
});
scan.observe(screen,{attributes:true,attributeFilter:['class']});
scan.observe(canvas,{childList:true,subtree:true});
function textLines(spans){
 const rows=[];
 for(const v of (spans||[])){
  if(!v.text||!v.text.trim())continue;
  const size=Math.max(6,Number(v.size)||14),y=Number(v.y),x=Number(v.x);
  let line=rows.find(r=>Math.abs(r.y-y)<Math.min(size*.42,6));
  if(!line){line={y,size,spans:[]};rows.push(line)}
  line.spans.push({x,text:v.text});
 }
 rows.sort((a,b)=>a.y-b.y);
 return rows.map(r=>({y:r.y,size:r.size,text:r.spans.sort((a,b)=>a.x-b.x).map(s=>s.text).join(' ').replace(/\s+/g,' ').trim()})).filter(x=>x.text);
}
function nativeTextForPage(holder,data){
 if(holder.querySelector('.acr-flow-text')||!data?.hasText||!data.spans?.length)return;
 const lines=textLines(data.spans);
 if(!lines.length)return;
 const wrap=document.createElement('div');wrap.className='acr-flow-text';wrap.setAttribute('aria-label','Selectable reflowed page text');
 let paragraph=[],last=null;
 function add(){
  const value=paragraph.join(' ').replace(/-\s+([a-z])/g,'$1').replace(/\s+/g,' ').trim();
  if(!value){paragraph=[];return}
  const tag=value.length<85&&!/[.,;:]$/.test(value)?'h2':'p';
  const node=document.createElement(tag);node.textContent=value;wrap.append(node);paragraph=[];
 }
 for(const line of lines){
  if(last&&line.y-last.y>Math.max(line.size,last.size)*1.95)add();
  paragraph.push(line.text);
  last=line;
 }
 add();
 const part=holder.querySelector('.rr-page-content');
 if(part)part.append(wrap);
}
function updateNativeText(){
 if(!isReading()||ui.mode!=='reading')return;
 const current=state();
 if(!current?.pages?.size)return;
 for(const holder of canvas.querySelectorAll('.rr-page[data-ready]')){
  const data=current.pages.get(Number(holder.dataset.page));
  if(data)nativeTextForPage(holder,data);
 }
}
function enterReader(){
 if(!isReading())return;
 screen.classList.add('acr-enabled');ui.cachedBook=state().book?.id||'';
 ui.focus=false;screen.classList.remove('acr-focus');
 hideOverlay();restorePrefs();
 if(state()?.doc?.format==='epub'&&ui.mode==='single'&&!localStorage.getItem('lirelo-approved-reader:'+(window.LireloApp?.user?.id||'device')))ui.mode='reading';
 if(ui.mode==='reading'&&state().mode!=='scroll'){
  const select=$('rrReadingMode');if(select){select.value='scroll';select.dispatchEvent(new Event('change',{bubbles:true}))}
 }
 if(ui.mode==='single'&&state().mode!=='swipe'){
  const select=$('rrReadingMode');if(select){select.value='swipe';select.dispatchEvent(new Event('change',{bubbles:true}))}
 }
 applyReflow();applyTone();updatePagePill();
 if(ui.wake)acquireWake();
}
function leaveReader(){
 screen.classList.remove('acr-enabled','acr-focus','acr-reflow','acr-night');ui.focus=false;ui.cachedBook='';
 hideOverlay();releaseWake();
}
window.addEventListener('resize',()=>{
 if(!state()?.active)return;
 if(isTouchDevice()){if(!screen.classList.contains('acr-enabled')&&state()?.doc)enterReader()}
 else if(screen.classList.contains('acr-enabled'))leaveReader();
});
window.LireloApprovedReader={openSettings:()=>showOverlay('settings'),openContents:()=>showOverlay('contents'),get mode(){return ui.mode}};
})();
