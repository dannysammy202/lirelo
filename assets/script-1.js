
/* Lirelo library views and controls. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  // One consistent icon source across Lirelo: Iconsax Linear.
  const svg = name => window.LireloIconsax.svg(name);
  $$('[data-icon]').forEach(node => node.innerHTML = svg(node.dataset.icon));
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {books:[],section:'library',format:'all',query:'',sort:'recent',layout:'list',collections:['Personal','Work','Learning','Favourites'],newId:0};
  let toastTimer;
  const labels = {library:['Your library',''],reading:['Reading now','Pick up where you left off.'],highlights:['Highlights','Passages worth remembering.'],bookmarks:['Bookmarks','The pages you want to return to.'],notes:['Notes','Your thoughts and ideas, together.'],tags:['Tags','Find books by topic.'],all:['All books','Your complete personal library.'],trash:['Trash','Recently removed books.']};
  function toast(message){const el=$('#toast');el.textContent=message;el.classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.add('hidden'),3500)}
  function openDialog(title,html,eyebrow='LIRELO'){$('#dialogTitle').textContent=title;$('#dialogEyebrow').textContent=eyebrow;$('#dialogBody').innerHTML=html;$('#noticeDialog').showModal();}
  $('#dialogClose').addEventListener('click',()=>$('#noticeDialog').close());
  $('#dialogDone').addEventListener('click',()=>{
    const dlg=$('#noticeDialog');
    if(dlg.dataset.action==='createCollection'){
      const input=$('#collectionNameInput');
      const name=input?.value.trim().slice(0,45);
      if(!name){input?.focus();return}
      if(state.collections.some(c=>c.toLowerCase()===name.toLowerCase())){toast('This collection already exists.');return}
      state.collections.push(name);renderCollectionsNav();
      state.format='collections';setSection('library');
      window.LireloApp.saveCollections(state.collections);toast('Collection created.');
      dlg.dataset.action='';$('#dialogDone').textContent='Got it';dlg.close();return;
    }
    dlg.close();
  });
  $('#noticeDialog').addEventListener('close',()=>{$('#noticeDialog').dataset.action='';$('#dialogDone').textContent='Got it'});
  $('#noticeDialog').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close()});
  function progressOf(book){
    return Math.max(0, Math.min(100, Math.round(Number(book.progress) || 0)));
  }
  function bookCover(book){
    const title = String(book.title || '');
    const artwork = Array.from(title).reduce((sum, letter) => sum + letter.codePointAt(0), 0) % 5;
    return `<div class="lr-jacket" data-artwork="${artwork}" aria-hidden="true"><strong>${safe(title)}</strong><i></i><small>${safe(book.author)}</small></div>`;
  }
  function resumeBook(){
    const inProgress = state.books.filter(book => !book.trashed && progressOf(book) > 0 && progressOf(book) < 100);
    let lastId;
    try { lastId = localStorage.getItem('lirelo-last-open-book'); } catch {}
    return inProgress.find(book => book.id === lastId) || inProgress.sort((a,b) => b.added - a.added)[0];
  }
  function resumeMarkup(book){
    const progress = progressOf(book);
    return `<article class="lr-resume">
      <h2>Continue reading</h2>
      <button class="room-resume-book" type="button" data-lr-continue="${safe(book.id)}" aria-label="Continue reading ${safe(book.title)}">
        ${bookCover(book)}<span><strong>${safe(book.title)}</strong><small>${safe(book.author)}</small><span class="room-resume-progress">${progress}% read</span><progress value="${progress}" max="100" aria-label="Reading progress"></progress></span>
        <span class="room-resume-arrow">${svg('arrow-right')}</span>
      </button>
    </article>`;
  }
  let previousResume = '';
  function renderResume(){
    const slot = $('#libraryResume');
    const book = state.section === 'library' && state.format === 'all' && !state.query && resumeBook();
    slot.hidden = state.section !== 'library' || state.format !== 'all' || Boolean(state.query);
    document.querySelector('.room-library-lead').hidden = slot.hidden;
    const markup = book ? resumeMarkup(book) : `<article class="lr-resume room-no-resume"><div><h2>${state.books.length?'Pick a book to start reading':'Start your library'}</h2><p>${state.books.length?'Your current book will appear here.':'Import a PDF or EPUB to start reading.'}</p>${state.books.length?'':'<button type="button" data-room-import>Import books</button>'}</div></article>`;
    if (previousResume !== markup) {
      slot.innerHTML = markup;
      previousResume = markup;
    }
  }
  $('#libraryResume').addEventListener('click', event => {
    const button = event.target.closest('[data-lr-continue]');
    if (button) window.LireloReader?.open(button.dataset.lrContinue);
    if (event.target.closest('[data-room-import]')) $('#addBooks').click();
  });
  function makeCard(book){
    const progress = progressOf(book);
    return `<article class="book-card"><button type="button" class="book-open" data-open-book="${safe(book.id)}" aria-label="Details for ${safe(book.title)}">
      <div class="room-book-identity">${bookCover(book)}<div><h3 class="book-title">${safe(book.title)}</h3><span class="book-metadata">${safe(book.author)}</span></div></div>
      <div class="book-format"><span>${safe(book.format.toUpperCase())}</span>${book.pages? `<small>${safe(book.pages)} pages</small>` : ''}</div>
      <div class="room-book-progress"><span>${progress ? `${progress}% read` : 'Unread'}</span><progress value="${progress}" max="100" aria-label="${progress}% read"></progress></div>
    </button></article>`;
  }
  function libraryList(){
    let filtered = state.books.slice();
    if(state.section==='reading')filtered=filtered.filter(b=>b.progress>0);
    if(state.section.startsWith('collection:'))filtered=filtered.filter(b=>b.collection===state.section.slice(11));
    if(state.section==='trash')filtered=[];
    if(state.format==='pdf'||state.format==='epub')filtered=filtered.filter(b=>b.format===state.format);
    if(state.query)filtered=filtered.filter(b=>([b.title,b.author,b.collection,...(b.tags||[])].join(' ')).toLowerCase().includes(state.query));
    if(state.sort==='title')filtered.sort((a,b)=>a.title.localeCompare(b.title));
    else if(state.sort==='progress')filtered.sort((a,b)=>b.progress-a.progress);
    else filtered.sort((a,b)=>b.added-a.added);
    return filtered;
  }
  function setSection(value){
    window.LireloBookDetails?.close({fromNavigation:true});
    state.section=value;
    if(value==='all'||value==='library'){state.format='all';}
    $('#viewTitle').textContent=value.startsWith('collection:')?value.slice(11):(labels[value]?.[0]||'Library');
    $('#viewSubtitle').textContent=value.startsWith('collection:')?'Books in this collection.':(labels[value]?.[1]||'');
    const librarySections=['library','reading','all','trash'];
    $('#formatTabs').classList.toggle('hidden',!librarySections.includes(value)&&!value.startsWith('collection:'));
    $$('.nav-link').forEach(b=>{const active=b.dataset.section===value||(value.startsWith('collection:')&&b.dataset.section==='library');b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
    $$('.nav-collection').forEach(b=>{const active=value==='collection:'+b.dataset.collection;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
    $('#toolbarTitle').textContent='Library';
    closeMobile();render();
  }
  function coverCounts(){
    $('#allCount').textContent=state.books.length;
    $('#readingCount').textContent=state.books.filter(b=>b.progress>0).length;
  }
  function renderCollectionsNav(){const el=$('#collectionNav');el.replaceChildren();state.collections.forEach(name=>{const button=document.createElement('button');button.type='button';button.className='nav-collection';button.dataset.collection=name;button.innerHTML=`${svg('folder')}<span>${safe(name)}</span><span class="collection-count">${state.books.filter(b=>b.collection===name).length}</span>`;button.addEventListener('click',()=>setSection('collection:'+name));el.append(button)});}
  function render(){
    coverCounts();
    renderResume();
    $$('.tab').forEach(b=>{const active=b.dataset.format===state.format;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});
    const books=libraryList(),special=['highlights','bookmarks','notes','tags'].includes(state.section);
    const collections=state.format==='collections';
    $('#collectionsPanel').classList.toggle('hidden',!collections&&!special);
    $('.shelf').classList.toggle('hidden',collections||special);
    $('.library-shelf-heading').classList.toggle('hidden',special);
    $('.library-controls-actions').classList.toggle('hidden',collections || special);
    $('#viewToggle').setAttribute('aria-pressed',String(state.layout==='grid'));
    $('#listView').setAttribute('aria-pressed',String(state.layout==='list'));
    $('#shelfTitle').textContent=state.section==='reading'?'Continue reading':state.section==='trash'?'Trash':state.section.startsWith('collection:')?state.section.slice(11):state.query?'Search results':collections?'Collections':'Your books';
    $('#resultCount').textContent=collections?'':books.length===1?'1 book':`${books.length} books`;
    $('#bookGrid').innerHTML=books.map(makeCard).join('');
    $('#emptyState').classList.toggle('hidden',books.length!==0);
    $('#emptyExplanation').textContent=state.section==='trash'?'No books in Trash.':state.query?'Try a different search.':state.section==='reading'?'Books with reading progress appear here.':'No books here yet. Add a PDF or EPUB to start reading.';
    const tiles=$('#collectionCards');tiles.replaceChildren();
    if(collections){state.collections.forEach(name=>{const tile=document.createElement('button');tile.type='button';tile.className='collection-tile';tile.innerHTML=`<span>${svg('folder')}</span><div><strong>${safe(name)}</strong><small>${state.books.filter(b=>b.collection===name).length} books</small></div>`;tile.addEventListener('click',()=>{state.format='all';setSection('collection:'+name)});tiles.append(tile)});}
    else if(special){const sectionName=labels[state.section]?.[0]||'This section';const p=document.createElement('div');p.className='empty';p.innerHTML=`<div class="empty-icon">${svg('info')}</div><h3>${safe(sectionName)} is the next design phase</h3><p>The Library and Book Details screens are available for review. Remaining workspace screens will follow in later phases.</p>`;tiles.append(p)}
    $$('#bookGrid [data-open-book]').forEach(button=>button.addEventListener('click',()=>{
      const b=state.books.find(x=>x.id===button.dataset.openBook);if(!b)return;
      window.LireloBookDetails?.open(b.id);
    }));
    if(state.layout==='list')$('#bookGrid').classList.add('is-list');else $('#bookGrid').classList.remove('is-list');
  }
  // The basic demo interactions intentionally do not persist or parse personal files.
  $$('.nav-link').forEach(el=>el.addEventListener('click',()=>{state.format='all';setSection(el.dataset.section)}));
  $$('.tab').forEach(el=>el.addEventListener('click',()=>{state.format=el.dataset.format;render()}));
  $('#sidebarSearch').addEventListener('input',e=>{state.query=e.target.value.trim().toLowerCase();state.format=state.format==='collections'?'all':state.format;if(!['library','reading','all'].includes(state.section))setSection('library');else render()});
  const focusSearch=()=>{
    if(window.LireloPhase4?.state?.active){$('#p4Search').focus();return}
    if(window.LireloReader?.state?.active)return;
    if($('#mainContent .content-width').classList.contains('hidden'))document.querySelector('.room-nav [data-room-route="library"]').click();
    $('#sidebarSearch').focus();
  };
  $('#searchShortcut').addEventListener('click',focusSearch);
  addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();focusSearch()}if(e.key==='Escape')closeMobile()});
  $('#brandHome').addEventListener('click',()=>setSection('library'));
  const triggerPicker=()=>$('#fileInput').click();
  $('#addBooks').addEventListener('click',triggerPicker);$('#emptyAdd').addEventListener('click',triggerPicker);
  $('#fileInput').addEventListener('change',async e=>{
    const files=[...(e.target.files||[])];e.target.value='';
    if(!files.length)return;
    for(const file of files){
      if(!/\.(pdf|epub)$/i.test(file.name)){toast('Only PDF and EPUB documents are supported.');continue}
      try{
        toast(`Importing ${file.name}...`);
        const book=await window.LireloApp.importBook(file);
        const existing=state.books.findIndex(b=>b.id===book.id);
        if(existing>=0)state.books.splice(existing,1);
        state.books.unshift(book);
        toast(`Added ${book.title} to your library.`);
      }catch(err){toast(err.message||'Unable to import this book.')} 
    }
    state.query='';$('#sidebarSearch').value='';state.format='all';setSection('library');renderCollectionsNav();
  });
  $('#newCollection').addEventListener('click',()=>{
    openDialog('New collection','<label class="field-label" for="collectionNameInput">Collection name</label><input class="field-input" id="collectionNameInput" type="text" maxlength="45" placeholder="e.g. Design studies" autocomplete="off"><p>Collections group books in your library.</p>','ORGANISE YOUR BOOKS');
    $('#noticeDialog').dataset.action='createCollection';
    $('#dialogDone').textContent='Create collection';
    const input=$('#collectionNameInput');input.focus();input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#dialogDone').click()}});
  });
  $('#sortButton').addEventListener('change', event => {
    state.sort = event.target.value;
    render();
  });
  for (const [id, layout] of [['viewToggle','grid'],['listView','list']]) {
    $(`#${id}`).addEventListener('click', () => {
      state.layout = layout;
      render();
    });
  }
  const profile=()=>window.LireloFinal?.enter('account');
  $('#profileButton').addEventListener('click',profile);$('#topProfile').addEventListener('click',profile);
  $('#sidebarCollapse').addEventListener('click',()=>document.querySelector('.sidebar')?.classList.toggle('is-compact'));
  function openMobile(){$('#app').classList.add('menu-open');$('#navScrim').classList.remove('hidden')}
  function closeMobile(){$('#app').classList.remove('menu-open');$('#navScrim').classList.add('hidden')}
  $('#mobileMenu').addEventListener('click',openMobile);$('#navScrim').addEventListener('click',closeMobile);
  // Rename toolbar element via lookup, avoiding an accidental missing-ID reference.
  $('.toolbar-title').id='toolbarTitle';
  window.LireloLibrary = {state,render,setSection,safe,svg,toast,openDialog,renderCollectionsNav,closeMobile,bookCover,resumeBook,resumeMarkup};
  renderCollectionsNav();render();
})();

