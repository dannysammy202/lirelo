
/* Lirelo clean rebuild: Library and Book Details design proof. No existing data is read or modified. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => Array.from(document.querySelectorAll(selector));
  // One consistent icon source across Lirelo: Iconsax Linear.
  const svg = name => window.LireloIconsax.svg(name);
  $$('[data-icon]').forEach(node => node.innerHTML = svg(node.dataset.icon));
  const safe = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sampleBooks = [
    {id:'everyday',title:'The Design of Everyday Things',author:'Don Norman',format:'pdf',pages:368,progress:0,cover:'everyday',collection:'Learning',tags:['Design','Psychology'],added:6},
    {id:'thinking',title:'Thinking, Fast and Slow',author:'Daniel Kahneman',format:'epub',pages:499,progress:49,cover:'thinking',collection:'Personal',tags:['Psychology'],added:5},
    {id:'clean',title:'Clean Code',author:'Robert C. Martin',format:'pdf',pages:464,progress:22,cover:'clean',collection:'Work',tags:['Engineering'],added:4},
    {id:'deep',title:'Deep Work',author:'Cal Newport',format:'epub',pages:296,progress:0,cover:'deep',collection:'Personal',tags:['Focus'],added:3},
    {id:'atomic',title:'Atomic Habits',author:'James Clear',format:'epub',pages:320,progress:58,cover:'atomic',collection:'Favourites',tags:['Habits'],added:2},
    {id:'pragmatic',title:'The Pragmatic Programmer',author:'David Thomas & Andrew Hunt',format:'pdf',pages:352,progress:0,cover:'pragmatic',collection:'Work',tags:['Engineering'],added:1}
  ];
  const state = {books:[],section:'library',format:'all',query:'',sort:'recent',layout:'grid',collections:['Personal','Work','Learning','Favourites'],newId:0};
  let toastTimer;
  const labels = {library:['Library','Your books, beautifully organised.'],reading:['Reading Now','Pick up where you left off.'],highlights:['Highlights','Passages worth remembering.'],bookmarks:['Bookmarks','The pages you want to return to.'],notes:['Notes','Your thoughts and ideas, together.'],tags:['Tags','Find books by topic.'],all:['All Books','Your complete personal library.'],trash:['Trash','Recently removed books.']};
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
  function makeCard(book){
    const progress = Math.max(0,Math.min(100,Number(book.progress)||0));
    return `<article class="book-card"><button type="button" class="book-open" data-open-book="${safe(book.id)}" aria-label="Details for ${safe(book.title)}"><div class="cover" data-cover="${safe(book.cover)}"><span class="cover-top">${safe(book.cover === 'uploaded' ? book.format.toUpperCase() : book.author)}</span><strong class="cover-title">${safe(book.title)}</strong><span class="cover-motif" aria-hidden="true"></span><span class="cover-author">${safe(book.author)}</span></div><h3 class="book-title">${safe(book.title)}</h3><div class="book-metadata">${safe(book.author)}</div><div class="book-format">${safe(book.format.toUpperCase())} · ${book.pages?`${safe(book.pages)} pages · `:''}${progress}%</div><div class="progress" role="img" aria-label="${progress}% read"><div class="progress-bar" style="width:${progress}%"></div></div></button></article>`;
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
    $('#viewSubtitle').textContent=value.startsWith('collection:')?'Books in this collection.':(labels[value]?.[1]||'Your books, beautifully organised.');
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
    $$('.tab').forEach(b=>{const active=b.dataset.format===state.format;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active))});
    const books=libraryList(),special=['highlights','bookmarks','notes','tags'].includes(state.section);
    const collections=state.format==='collections';
    $('#collectionsPanel').classList.toggle('hidden',!collections&&!special);
    $('.shelf').classList.toggle('hidden',collections||special);
    $('#sectionRight').classList.toggle('hidden',state.section==='trash');
    $('#shelfTitle').textContent=state.section==='reading'?'Continue reading':state.section==='trash'?'Trash':state.section.startsWith('collection:')?state.section.slice(11):state.query?'Search results':'Your books';
    $('#resultCount').textContent=books.length===1?'1 book':`${books.length} books`;
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
  const focusSearch=()=>{$('#sidebarSearch').focus();if(innerWidth<768)openMobile()};
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
    openDialog('New collection','<label class="field-label" for="collectionNameInput">Collection name</label><input class="field-input" id="collectionNameInput" type="text" maxlength="45" placeholder="e.g. Design studies" autocomplete="off"><p>Collections organise books in your local library.</p>','ORGANISE YOUR BOOKS');
    $('#noticeDialog').dataset.action='createCollection';
    $('#dialogDone').textContent='Create collection';
    const input=$('#collectionNameInput');input.focus();input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('#dialogDone').click()}});
  });
  $('#sortButton').addEventListener('click',()=>{state.sort=state.sort==='recent'?'title':state.sort==='title'?'progress':'recent';$('#sectionRight').innerHTML=`Sort: ${state.sort==='recent'?'Recently added':state.sort==='title'?'Title A–Z':'Reading progress'} ${svg('chevron-down')}`;render()});
  $('#viewToggle').addEventListener('click',()=>{state.layout=state.layout==='grid'?'list':'grid';$('#viewToggle').innerHTML=svg(state.layout==='grid'?'layout-grid':'layout-list');$('#viewToggle').setAttribute('aria-label',state.layout==='grid'?'Switch to list view':'Switch to grid view');render()});
  const profile=()=>window.LireloFinal?.enter('account');
  $('#profileButton').addEventListener('click',profile);$('#topProfile').addEventListener('click',profile);
  $('#sidebarCollapse').addEventListener('click',()=>document.querySelector('.sidebar')?.classList.toggle('is-compact'));
  function openMobile(){$('#app').classList.add('menu-open');$('#navScrim').classList.remove('hidden')}
  function closeMobile(){$('#app').classList.remove('menu-open');$('#navScrim').classList.add('hidden')}
  $('#mobileMenu').addEventListener('click',openMobile);$('#navScrim').addEventListener('click',closeMobile);
  // Rename toolbar element via lookup, avoiding an accidental missing-ID reference.
  $('.toolbar-title').id='toolbarTitle';
  window.LireloLibrary = {state,render,setSection,safe,svg,toast,openDialog,renderCollectionsNav,closeMobile};
  renderCollectionsNav();render();
})();

