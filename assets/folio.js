/* Lirelo workspace. Renders the library, book details, saved items and settings. */
(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const app = $('#app');
  const dialog = $('#folio-dialog');
  const files = $('#import-files');
  const state = {books:[],trash:[],collections:[],query:'',format:'all',sort:'recent',collection:'',saved:'all',savedBook:''};
  let noticeTimer;
  const key = id => 'lirelo-reader-v3-standalone:'+id;
  function loadData(name, fallback = {}){
    try { return JSON.parse(localStorage.getItem(name)) ?? fallback; } catch { return fallback; }
  }
  const bookState = id => loadData(key(id));
  const saveBookState = (id, value) => localStorage.setItem(key(id), JSON.stringify(value));
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const icons = {
    library:'<path d="M4 5h6v15H4zm6 0h5v15h-5zm6 1 4-1 3 14-4 1z"/>',
    saved:'<path d="M6 4h12v17l-6-4-6 4z"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m10 3-1 3-3 1-3 3 2 2-1 3 3 3 3-1 2 4 3-1 1-3 3-1 1-4-2-2 1-3-4-3-2 2z"/>',
    search:'<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
    import:'<path d="M12 15V3m-4 4 4-4 4 4M4 15v5h16v-5"/>',
    back:'<path d="m12 5-7 7 7 7M5 12h15"/>',
    next:'<path d="m12 5 7 7-7 7M5 12h14"/>',
    read:'<path d="M8 4v16l12-8z"/>',
    toc:'<path d="M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1"/>',
    note:'<path d="M14 4H4v16h16V10m-9 4 8-9 2 2-8 9-3 1z"/>',
    display:'<path d="M3 8V3h5m8 0h5v5m0 8v5h-5m-8 0H3v-5"/>',
    more:'<circle cx="4" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="20" cy="12" r="1"/>',
    close:'<path d="m5 5 14 14M19 5 5 19"/>',
    highlight:'<path d="m4 16 10-12 6 5-10 12H4zm5-1 5 4"/>',
    offline:'<path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/>'
  };
  function icon(name){return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">'+(icons[name]||'')+'</svg>';}
  function toast(message){
    const node=$('#folio-status');node.textContent=message;node.classList.add('show');
    clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>node.classList.remove('show'),4000);
  }
  const getBook=id=>state.books.find(book=>book.id===id);
  const rate=book=>Math.max(0,Math.min(100,Math.round(Number(book.progress)||0)));
  function cover(book, extra=''){
    const hash=Array.from(String(book.title)).reduce((n,c)=>Math.imul(n^c.codePointAt(0),16777619),2166136261);
    const pattern=(hash>>>12)%4;
    return `<div class="jacket ${extra}" data-pattern="${pattern}" aria-hidden="true"><strong>${escape(book.title)}</strong><span class="jacket-art"><i></i><i></i><i></i></span><small>${escape(book.author)}</small></div>`;
  }
  function resumeBook(){
    const books=state.books.filter(book=>rate(book)>0&&rate(book)<100);
    return books.find(book=>book.id===localStorage.getItem('lirelo-last-open-book'))||books[0];
  }
  function route(){
    const hash=location.hash.slice(1);
    const match=/^(book|reader)=(.+)$/.exec(hash);
    if(match){try {return [match[1],decodeURIComponent(match[2])]}catch {}}
    return ['saved','settings','trash'].includes(hash)?[hash]:['library'];
  }
  function navigate(path, replace=false){
    const target=path?'#'+path:location.pathname+location.search;
    history[replace?'replaceState':'pushState']({},'',target);
    render(); window.scrollTo(0,0);
  }
  function rail(view){
    return `<aside class="navigation"><button class="wordmark" data-go="" aria-label="Lirelo library"><span class="brand-symbol" aria-hidden="true"></span><span>Lirelo</span></button><nav aria-label="Main navigation">
      ${[['library','','Library'],['saved','saved','Saved'],['settings','settings','Settings']].map(([item,dest,label])=>`<button data-go="${dest}" ${(item===view||(item==='settings'&&view==='trash')||(item==='library'&&view==='book'))?'aria-current="page"':''}>${icon(item)}<span>${label}</span></button>`).join('')}
    </nav></aside>`;
  }
  const chosen=(a,b)=>a===b?'selected':'';
  function tiles(){
    const query=state.query.toLowerCase().trim();
    const books=state.books.filter(book=>(state.format==='all'||book.format===state.format)&&(!state.collection||book.collection===state.collection)&&(!query||[book.title,book.author,...(book.tags||[])].join(' ').toLowerCase().includes(query)));
    if(state.sort==='title')books.sort((a,b)=>a.title.localeCompare(b.title));
    if(state.sort==='progress')books.sort((a,b)=>rate(b)-rate(a));
    return books.length?books.map(book=>`<button class="shelf-book" data-go="book=${encodeURIComponent(book.id)}">${cover(book)}<span class="shelf-name">${escape(book.title)}</span><small>${escape(book.author)} <b>${escape(book.format.toUpperCase())}</b></small>${rate(book)>0?`<progress value="${rate(book)}" max="100" aria-label="${rate(book)}% read"></progress>`:''}</button>`).join(''):`<p class="empty">${state.books.length?'No books match these filters.':'Import a PDF or EPUB to start your library.'}</p>`;
  }
  function library(){
    const book=resumeBook();
    return `<header class="view-title library-title"><h1>Library</h1><div><button class="outline" data-action="import">${icon('import')} Import</button><label class="search-box">${icon('search')}<input type="search" id="library-query" placeholder="Search your library" aria-label="Search your library" value="${escape(state.query)}"></label></div></header>
      <section class="resume"><div class="resume-copy"><h2>${book?'Pick up where<br>you left off':'Make room for<br>your next book'}</h2>
       ${book?`<strong>${escape(book.title)}</strong><span>${escape(book.author)} <span class="dot">·</span> ${rate(book)}% read</span><button class="primary" data-go="reader=${encodeURIComponent(book.id)}">${icon('read')} Resume</button>`:`<span>Your PDF and EPUB books live here.</span><button class="primary" data-action="import">${icon('import')} Import books</button>`}
      </div><div class="resume-art" aria-hidden="true"><div class="art-board"></div><div class="art-second"><i></i><i></i><i></i></div>${cover(book||{title:'Lirelo',author:''},'art-main')}</div></section>
      <section aria-label="Books"><div class="shelf-filters">
        <div class="segments">${[['all','Books'],['pdf','PDF'],['epub','EPUB']].map(([id,label])=>`<button data-format="${id}" aria-pressed="${state.format===id}">${label}</button>`).join('')}</div>
        <div><label><span class="sr-only">Collection</span><select id="library-collection"><option value="">All collections</option>${state.collections.map(c=>`<option ${chosen(c,state.collection)}>${escape(c)}</option>`).join('')}</select></label>
        <label><span class="sr-only">Sort books</span><select id="library-sort">${[['recent','Recently added'],['title','Title A–Z'],['progress','Reading progress']].map(([value,label])=>`<option value="${value}" ${chosen(value,state.sort)}>${label}</option>`).join('')}</select></label></div>
      </div><div id="book-shelf" class="shelf">${tiles()}</div></section>`;
  }
  function detail(book){
    if(!book)return '<h1>Book unavailable</h1><p>This book is outside your library.</p><button data-go="">Back to library</button>';
    const id=encodeURIComponent(book.id), percent=rate(book);
    return `<button class="back-button" data-go="">${icon('back')} Library</button><section class="book-intro"><div class="book-artwork">${cover(book)}</div>
      <div><h1>${escape(book.title)}</h1><p class="byline">${escape(book.author)}</p><label class="collection-control">Collection
      <select data-book-collection="${id}">${state.collections.map(c=>`<option ${chosen(c,book.collection)}>${escape(c)}</option>`).join('')}</select></label>
      <div class="book-actions"><button class="primary" data-go="reader=${id}">${icon('read')} ${percent>0?'Continue reading':'Read book'}</button><button class="outline" data-edit="${id}">Edit details</button><button class="quiet" data-trash="${id}">Move to trash</button></div></div>
      </section><div class="detail-progress"><span>Progress</span><progress value="${percent}" max="100" aria-label="${percent}% read"></progress><strong>${percent}%</strong></div>
      <section class="chapters"><div><h2>Chapters</h2><span>${escape(book.format.toUpperCase())} <span class="dot">·</span> ${book.pages||'Unknown'} pages</span></div>
      ${book.toc?.length?`<ol>${book.toc.map((part,i)=>`<li><button data-read="${id}" data-page="${Number(part.page)||1}"><span class="chapter-index">${i+1}</span><span>${escape(part.title)}</span><span>p. ${Number(part.page)||1}</span></button></li>`).join('')}</ol>`:'<p class="empty">This book has no chapter index.</p>'}</section>`;
  }
  const entryKinds={highlights:'Highlight',notes:'Note',bookmarks:'Bookmark'};
  function entries(){
    return state.books.flatMap(book=>{
      const annotations=bookState(book.id).annotations||{};
      return Object.keys(entryKinds).flatMap(kind=>(annotations[kind]||[]).map(item=>({...item,kind,book})));
    }).sort((a,b)=>(b.created||0)-(a.created||0));
  }
  function saved(){
    const all=entries();
    const display=all.filter(x=>(state.saved==='all'||x.kind===state.saved)&&(!state.savedBook||x.book.id===state.savedBook));
    return `<header class="view-title"><h1>Saved</h1><p>Highlights, notes and bookmarks</p></header><div class="saved-layout"><aside class="saved-filter" aria-label="Filter saved items">
     ${[['all','All items','library'],['highlights','Highlights','highlight'],['notes','Notes','note'],['bookmarks','Bookmarks','saved']].map(([kind,label,glyph])=>`<button data-saved="${kind}" aria-pressed="${state.saved===kind}">${icon(glyph)}${label}<small>${kind==='all'?all.length:all.filter(item=>item.kind===kind).length}</small></button>`).join('')}
     <label>By book<select id="saved-book"><option value="">All books</option>${state.books.map(book=>`<option value="${escape(book.id)}" ${chosen(book.id,state.savedBook)}>${escape(book.title)}</option>`).join('')}</select></label></aside>
     <div class="timeline">${display.length?display.map(x=>{
       const copy=escape(x.text||x.title||('Page '+x.page));
       const date=x.created?new Date(x.created).toLocaleDateString('en-GB',{dateStyle:'medium'}):'';
       return `<article><div><p>${x.kind==='highlights'?'<mark>'+copy+'</mark>':copy}</p><small>${escape(x.book.title)} <span class="dot">·</span> ${entryKinds[x.kind]}</small></div><div><small>${escape(date)}</small><button data-read="${encodeURIComponent(x.book.id)}" data-page="${Number(x.page)||1}">Page ${Number(x.page)||1}</button><button class="item-delete" data-remove-entry="${escape(x.id)}" data-kind="${x.kind}" data-book="${escape(x.book.id)}">Remove</button></div></article>`;
     }).join(''):'<p class="empty">Saved passages and reading notes will appear here.</p>'}</div></div>`;
  }
  function settings(view){
    const prefs=loadData('lirelo-complete-preferences-v1');
    const profile=loadData('lirelo-complete-profile-v1');
    if(view==='trash')return `<button class="back-button" data-go="settings">${icon('back')} Settings</button><h1>Trash</h1>
    <div class="setting-list">${state.trash.map(book=>`<section><div><h2>${escape(book.title)}</h2><p>${escape(book.author)}</p></div><div><button class="outline" data-restore="${encodeURIComponent(book.id)}">Restore</button><button class="quiet" data-delete="${encodeURIComponent(book.id)}">Delete permanently</button></div></section>`).join('')||'<p class="empty">Your trash is empty.</p>'}</div>`;
    return `<header class="view-title"><h1>Settings</h1></header><div class="setting-list">
      <section><div><h2>Account</h2><p>${escape(profile.name||window.LireloApp?.user?.email||'')}</p></div><div><button class="outline" data-action="profile">Edit name</button><button class="quiet" data-action="signout">Sign out</button></div></section>
      <section><div><h2>Reading appearance</h2><p>Choose the default page colour.</p></div><select id="default-tone" aria-label="Default page colour">${[['light','Light'],['paper','Paper'],['dark','Dark']].map(([key,label])=>`<option value="${key}" ${chosen(key,prefs.tone||'light')}>${label}</option>`).join('')}</select></section>
      <section><div><h2>Collections</h2><p>${escape(state.collections.join(', '))}</p></div><button class="outline" data-action="collection">New collection</button></section>
      <section><div><h2>Trash</h2><p>${state.trash.length} books</p></div><button class="outline" data-go="trash">Open trash</button></section>
    </div>`;
  }
  let visibleRoute='';
  function render(){
    const [view,id]=route();
    const book=id?getBook(id):null;
    if(view==='reader'&&book){
      const stamp='reader:'+id;
      if(visibleRoute!==stamp||!$('.reading-app')){visibleRoute=stamp;window.LireloFolioReader.open(app,book);}
      return;
    }
    if(visibleRoute.startsWith('reader:'))window.LireloFolioReader?.close();
    visibleRoute=view;
    const content=view==='library'?library():view==='book'||view==='reader'?detail(book):view==='saved'?saved():settings(view);
    app.innerHTML=`<div class="folio">${rail(view)}<div class="workspace" id="workspace">${content}</div></div>`;
  }
  function ask(title, fields, action, label='Save'){
    dialog.innerHTML=`<form><header><h2 id="dialog-title">${escape(title)}</h2><button type="button" class="icon-control" data-dialog-close aria-label="Close">${icon('close')}</button></header>${fields}<div class="dialog-actions"><button type="button" class="outline" data-dialog-close>Cancel</button><button class="primary">${escape(label)}</button></div></form>`;
    const form=$('form',dialog);
    form.querySelectorAll('[data-dialog-close]').forEach(button=>button.onclick=()=>dialog.close());
    form.onsubmit=async event=>{
      event.preventDefault();
      const submit=$('button.primary',form);submit.disabled=true;
      try {await action(new FormData(form));dialog.close();}catch(error){toast(error.message);}
      finally {submit.disabled=false;}
    };
    dialog.showModal();
  }
  function updateBook(book, patch){Object.assign(book,patch);window.LireloApp.updateBook(book);render();}
  function move(id, restore){
    const source=restore?state.trash:state.books,target=restore?state.books:state.trash;
    const at=source.findIndex(book=>book.id===id);
    if(at<0)return;
    target.unshift(...source.splice(at,1));window.LireloApp.syncTrash(state.trash);
    if(restore)render();else navigate('');
    toast(restore?'Book restored.':'Book moved to trash.');
  }
  app.addEventListener('click',event=>{
    const button=event.target.closest('button');
    if(!button)return;
    const d=button.dataset;
    if('go' in d){navigate(d.go);return;}
    if(d.read){window.LireloFolioReader.requestPage(Number(d.page));navigate('reader='+d.read);return;}
    if(d.format){state.format=d.format;render();$('[data-format="'+d.format+'"]')?.focus();return;}
    if(d.saved){state.saved=d.saved;render();$('[data-saved="'+d.saved+'"]')?.focus();return;}
    if(d.edit){
      const book=getBook(decodeURIComponent(d.edit));
      ask('Edit book details',`<label>Title<input name="title" value="${escape(book.title)}" required maxlength="180"></label><label>Author<input name="author" value="${escape(book.author)}" required maxlength="180"></label><label>Tags<input name="tags" value="${escape((book.tags||[]).join(', '))}" placeholder="Separate tags with commas"></label>`,form=>{const title=form.get('title').trim(),author=form.get('author').trim();if(!title||!author)throw Error('Enter a title and author.');updateBook(book,{title,author,tags:[...new Set(form.get('tags').split(',').map(x=>x.trim()).filter(Boolean))]});});
    }
    if(d.trash)ask('Move book to trash?', '<p>Restore it from Settings.</p>',()=>move(decodeURIComponent(d.trash),false),'Move to trash');
    if(d.restore)move(decodeURIComponent(d.restore),true);
    if(d.delete)ask('Permanently delete this book?', '<p>This removes the file and saved reading activity.</p>',async()=>{const id=decodeURIComponent(d.delete);await window.LireloApp.removeForever(id);state.trash=state.trash.filter(book=>book.id!==id);render();},'Delete book');
    if(d.removeEntry)ask('Remove saved item?', '<p>This removes the entry from your reading history.</p>',()=>{const current=bookState(d.book);current.annotations[d.kind]=current.annotations[d.kind].filter(item=>item.id!==d.removeEntry);saveBookState(d.book,current);render();},'Remove');
    if(d.action==='import')files.click();
    if(d.action==='signout')ask('Sign out?', '<p>Your synced library stays in your account.</p>',()=>window.LireloApp.signOut(),'Sign out');
    if(d.action==='profile')ask('Edit display name','<label>Name<input name="name" maxlength="55" required></label>',form=>{const name=form.get('name').trim();if(!name)throw Error('Enter a name.');localStorage.setItem('lirelo-complete-profile-v1',JSON.stringify({name}));render();});
    if(d.action==='collection')ask('Create collection','<label>Collection name<input name="name" maxlength="60" required></label>',form=>{const name=form.get('name').trim();if(!name||state.collections.some(c=>c.toLowerCase()===name.toLowerCase()))throw Error('Enter a new collection name.');state.collections.push(name);window.LireloApp.saveCollections(state.collections);render();});
  });
  app.addEventListener('input',event=>{if(event.target.id==='library-query'){state.query=event.target.value;$('#book-shelf').innerHTML=tiles();}});
  app.addEventListener('change',event=>{
    const target=event.target;
    if(target.id==='library-sort')state.sort=target.value;
    else if(target.id==='library-collection')state.collection=target.value;
    else if(target.id==='saved-book'){state.savedBook=target.value;render();return;}
    else if(target.id==='default-tone'){const prefs=loadData('lirelo-complete-preferences-v1');localStorage.setItem('lirelo-complete-preferences-v1',JSON.stringify({...prefs,tone:target.value,toneExplicit:true}));return;}
    else if(target.dataset.bookCollection){updateBook(getBook(decodeURIComponent(target.dataset.bookCollection)),{collection:target.value});return;}
    else return;
    $('#book-shelf').innerHTML=tiles();
  });
  files.addEventListener('change',async()=>{
    const pending=[...files.files];files.value='';
    if(!pending.length)return;
    const failures=[];
    for(const file of pending){
      toast('Importing '+file.name+'…');
      try{const book=await window.LireloApp.importBook(file);if(!getBook(book.id))state.books.unshift(book);state.trash=state.trash.filter(item=>item.id!==book.id);}
      catch(error){failures.push(file.name+': '+error.message);}
    }
    if(pending.length>failures.length)navigate('');
    toast(failures.length?failures.join(' '):'Import complete.');
  });
  document.addEventListener('keydown',event=>{
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'&&window.LireloApp?.user&&!dialog.open){
      event.preventDefault();if(!$('#library-query'))navigate('');$('#library-query')?.focus();
    }
  });
  window.addEventListener('popstate',()=>{if(window.LireloApp?.user)render();});
  window.LireloWorkspace={state,render,toast,escape,icon,navigate,bookState,saveBookState,loadData,ask};
})();
