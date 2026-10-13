
/* Lirelo Phase 2: book details design and temporary sample interactions.
   Does not access IndexedDB, Supabase, uploaded book contents or live reading progress. */
(() => {
  'use strict';
  const lib = window.LireloLibrary;
  if (!lib) throw new Error('Lirelo Library must load before Book Details.');
  const {state, render, safe, svg, toast, openDialog} = lib;
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const details = {
    everyday: {year:2013, publisher:'Basic Books', summary:'The Design of Everyday Things explores why some objects are a pleasure to use while others create unnecessary confusion. Don Norman introduces the principles of intuitive design, from affordances and signifiers to feedback, constraints and human-centred thinking.', chapters:[['The Psychopathology of Everyday Things',1],['The Psychology of Everyday Actions',36],['Knowledge in the Head and in the World',61],['Knowing What to Do',94],['Human Error? No, Bad Design',137],['Design Thinking',191],['Design in the World of Business',252]], highlights:[{text:'Good design makes affordances clear. When affordances are hidden or ambiguous, people struggle, make mistakes, or give up.',page:112,color:'lavender',chapter:'Affordances and Signifiers'}, {text:'Signifiers work with our past experiences to guide behaviour.',page:113,color:'yellow',chapter:'Affordances and Signifiers'},{text:'The most effective design communicates what can be done through its form, materials, or context.',page:114,color:'lavender',chapter:'Affordances and Signifiers'}],notes:[{text:'Consider how clearly the app communicates primary actions without extra explanation.',page:112,id:'sample-a'}, {text:'Make the interaction states visible. Feedback should feel immediate and reassuring.',page:138,id:'sample-b'}]},
    thinking: {year:2011,publisher:'Farrar, Straus and Giroux',summary:'Daniel Kahneman examines two modes of thought: the quick, intuitive responses of System 1 and the deliberate, analytical work of System 2. A study of judgement, choices, bias and human decision-making.',chapters:[['Two Systems',19],['Attention and Effort',31],['The Lazy Controller',39],['The Associative Machine',50],['Cognitive Ease',59],['Norms, Surprises and Causes',71]], highlights:[{text:'Nothing in life is as important as you think it is while you are thinking about it.',page:385,color:'lavender',chapter:'The Focusing Illusion'}],notes:[]},
    clean: {year:2008,publisher:'Prentice Hall',summary:'Clean Code is a practical guide to writing readable, maintainable software. Robert C. Martin explains naming, functions, formatting, error handling, tests and the discipline of code craftsmanship.',chapters:[['Clean Code',1],['Meaningful Names',17],['Functions',31],['Comments',53],['Formatting',75],['Objects and Data Structures',93],['Error Handling',103]], highlights:[{text:'Clean code always looks like it was written by someone who cares.',page:12,color:'yellow',chapter:'Clean Code'}],notes:[{id:'sample-c',text:'Review our naming conventions before the next release.',page:17}]},
    deep: {year:2016,publisher:'Grand Central Publishing',summary:'Cal Newport argues that concentrated, distraction-free work is increasingly rare and increasingly valuable. The book introduces practical methods for developing sustained focus.',chapters:[['Deep Work Is Valuable',21],['Deep Work Is Rare',47],['Deep Work Is Meaningful',73],['Work Deeply',99],['Embrace Boredom',155],['Quit Social Media',191]], highlights:[],notes:[]},
    atomic: {year:2018,publisher:'Avery',summary:'Atomic Habits explains how small improvements compound over time. James Clear describes a framework for making useful habits obvious, attractive, easy and satisfying.',chapters:[['The Surprising Power of Atomic Habits',15],['How Your Habits Shape Your Identity',31],['The 1st Law: Make It Obvious',59],['The 2nd Law: Make It Attractive',97],['The 3rd Law: Make It Easy',149],['The 4th Law: Make It Satisfying',181]], highlights:[{text:'You do not rise to the level of your goals. You fall to the level of your systems.',page:27,color:'lavender',chapter:'Fundamentals'}],notes:[]},
    pragmatic: {year:2019,publisher:'Addison-Wesley',summary:'The Pragmatic Programmer collects approaches to thinking clearly about software development: ownership, craftsmanship, debugging, testing, teamwork and lifelong learning.',chapters:[['A Pragmatic Philosophy',1],['A Pragmatic Approach',41],['The Basic Tools',93],['Pragmatic Paranoia',137],['Bend, or Break',171]], highlights:[],notes:[]}
  };
  let activeId = null;
  let activeTab = 'overview';
  let bookmarked=new Set();try{bookmarked=new Set(JSON.parse(localStorage.getItem('lirelo-saved-books-v1')||'[]'))}catch{}
  let removeId = null;
  function book() {return state.books.find(b=>b.id===activeId) || null}
  function data(){
    const b=book();if(!b)return {year:'—',publisher:'—',summary:'',chapters:[],notes:[],highlights:[]};
    const saved=window.LireloApp?.savedAnnotations(b.id)||{};
    return {year:b.year||'—',publisher:b.publisher||'—',summary:b.summary||'Your imported document. Open the Reader to browse its pages and chapters.',
      chapters:(b.toc||[]).map(t=>[t.title,t.page]),notes:saved.notes||[],highlights:saved.highlights||[]};
  }
  function iconise(root){root.querySelectorAll('[data-icon]').forEach(n=>n.innerHTML=svg(n.dataset.icon))}
  function coverHTML(b){return `<div class="cover" data-cover="${safe(b.cover)}"><span class="cover-top">${safe(b.cover==='uploaded'?b.format.toUpperCase():b.author)}</span><strong class="cover-title">${safe(b.title)}</strong><span class="cover-motif" aria-hidden="true"></span><span class="cover-author">${safe(b.author)}</span></div>`}
  function syncHeader(b){$('.toolbar-title').textContent=b?'Book details':'Library';$('.toolbar-detail').textContent=b?b.title:'Your reading, all together.'}
  function open(id,{pushHistory=true}={}){
    const b=state.books.find(x=>x.id===id);
    if(!b)return;
    activeId=id;activeTab='overview';
    $('.content-width').classList.add('hidden');
    $('#detailsScreen').classList.remove('hidden');
    syncHeader(b);fillDetails();setTab('overview');
    lib.closeMobile();
    if(pushHistory)history.pushState({lireloBook:id},'',`#book=${encodeURIComponent(id)}`);
    $('#mainContent').scrollTo({top:0,behavior:'instant'});
    window.scrollTo({top:0,behavior:'instant'});
  }
  function close({fromNavigation=false}={}){
    if(!activeId)return;
    activeId=null;
    $('#detailsScreen').classList.add('hidden');
    $('.content-width').classList.remove('hidden');
    syncHeader(null);
    if(fromNavigation && location.hash.startsWith('#book='))history.replaceState({},'','#library');
    window.scrollTo({top:0,behavior:'instant'});
  }
  function back(){
    if(location.hash.startsWith('#book=')){history.back(); /* popstate closes Book Details */}
    else close();
  }
  function fillDetails(){
    const b=book(),d=data();if(!b)return;
    $('#detailsCover').innerHTML=coverHTML(b);
    $('#detailsTitle').textContent=b.title;
    $('#detailsAuthor').textContent='by '+b.author;
    $('#detailsKind').textContent=(b.format||'BOOK').toUpperCase()+' · PERSONAL LIBRARY';
    $('#detailsTags').innerHTML=(b.tags||[]).map(t=>`<span class="details-tag">${safe(t)}</span>`).join('');
    $('#detailsFormat').textContent=b.format.toUpperCase();
    $('#detailsPages').textContent=b.pages?`${b.pages} pages`:'Pages unavailable';
    $('#detailsYear').textContent=d.year;
    const progress=Math.max(0,Math.min(100,Number(b.progress)||0));
    $('#detailsProgressLabel').textContent=`${progress}% read`;
    $('#detailsProgressStatus').textContent=progress>=100?'Finished':progress>0?'In progress':'Not started';
    $('#detailsProgressBar').style.width=progress+'%';
    $('#detailsRead').innerHTML=`${svg('reading')} ${progress>0?'Continue Reading':'Start Reading'}`;
    $('#detailsBookmark').classList.toggle('is-saved',bookmarked.has(b.id));
    $('#detailsBookmark').setAttribute('aria-label',bookmarked.has(b.id)?'Remove saved bookmark':'Save book to bookmarks');
    $('#detailsBookmark').setAttribute('aria-pressed',String(bookmarked.has(b.id)));
    $('#detailsChapterCount').textContent=d.chapters.length?String(d.chapters.length):'';
    $('#detailsNotesCount').textContent=d.notes.length?String(d.notes.length):'';
    $('#detailsHighlightsCount').textContent=d.highlights.length?String(d.highlights.length):'';
    renderCollectionDropdown();
    $('#detailsCollectionSaved').textContent='';
    closeMore();
  }
  function setTab(tab){
    activeTab=tab;
    $$('.details-tab').forEach(t=>{const yes=t.dataset.detailTab===tab;t.classList.toggle('active',yes);t.setAttribute('aria-selected',String(yes));t.tabIndex=yes?0:-1});
    const p=$('#detailsTabContent'),b=book(),d=data();if(!b)return;
    if(tab==='overview'){
      p.innerHTML=`<div class="details-overview"><div><h2>About this book</h2><p>${safe(d.summary)}</p><h3>Book information</h3><dl class="details-facts"><dt>Author</dt><dd>${safe(b.author)}</dd><dt>Format</dt><dd>${safe(b.format.toUpperCase())}</dd><dt>Pages</dt><dd>${safe(b.pages||'—')}</dd><dt>Published</dt><dd>${safe(d.year)}</dd><dt>Publisher</dt><dd>${safe(d.publisher)}</dd></dl></div><div class="details-aside-card"><span class="details-aside-icon">${svg('reading')}</span><strong>Your reading progress</strong><p>${b.progress?`You're ${b.progress}% of the way through this book.`:'Your reading journey starts here.'}</p><div class="details-mini-progress"><span style="width:${b.progress||0}%"></span></div><small>${b.pages?`${Math.round(b.pages*b.progress/100)} of ${b.pages} pages`:'Progress not started'}</small></div></div>`;
    } else if(tab==='contents'){
      p.innerHTML=`<div class="details-panel-heading"><div><h2>Table of contents</h2><p>${d.chapters.length?`${d.chapters.length} chapters in this book`:'This document does not provide a table of contents.'}</p></div></div><div class="details-contents-list">${d.chapters.map(([title,page],i)=>`<button type="button" class="details-content-row" data-chapter="${i}"><span class="chapter-order">${String(i+1).padStart(2,'0')}</span><span class="chapter-title">${safe(title)}</span><span class="chapter-page">Page ${page}</span><span class="chapter-chevron">${svg('arrow-left')}</span></button>`).join('')}</div>`;
      p.querySelectorAll('[data-chapter]').forEach(el=>el.addEventListener('click',()=>window.LireloReader?.open(activeId,{page:Number(d.chapters[Number(el.dataset.chapter)]?.[1]||1)})));
    } else if(tab==='notes'){
      p.innerHTML=`<div class="details-panel-heading"><div><h2>My notes</h2><p>Thoughts and ideas connected to this book</p></div></div><form id="detailsNoteForm" class="details-note-form"><label for="detailsNoteInput">Add a note</label><textarea id="detailsNoteInput" maxlength="1000" required placeholder="What would you like to remember?"></textarea><div><span>Notes are saved locally in your browser.</span><button type="submit" class="primary-button">Save note</button></div></form><div class="details-note-list">${d.notes.map((n,i)=>`<article class="details-note-card"><div class="details-note-meta"><span>Page ${safe(n.page)}</span><button type="button" data-note-delete="${i}" aria-label="Delete note">${svg('trash')}</button></div><p>${safe(n.text)}</p></article>`).join('')}${!d.notes.length?'<p class="details-soft-empty">You have not added a note to this book yet.</p>':''}</div>`;
      $('#detailsNoteForm').addEventListener('submit',e=>{e.preventDefault();const inp=$('#detailsNoteInput');const text=inp.value.trim();if(!text)return;window.LireloApp?.saveNote(b.id,{text,id:'note-'+Date.now(),page:Math.max(1,Math.round((b.progress/100)*(b.pages||10))),chapter:'Your note',created:Date.now()});$('#detailsNotesCount').textContent=d.notes.length;setTab('notes');toast('Note saved.');});
      p.querySelectorAll('[data-note-delete]').forEach(el=>el.addEventListener('click',()=>{window.LireloApp?.deleteNote(b.id,d.notes[Number(el.dataset.noteDelete)]?.id);$('#detailsNotesCount').textContent=d.notes.length||'';setTab('notes');toast('Note removed.')}));
    } else if(tab==='highlights'){
      p.innerHTML=`<div class="details-panel-heading"><div><h2>Saved highlights</h2><p>${d.highlights.length?`${d.highlights.length} passages from this book`:'Highlights you make while reading will appear here.'}</p></div></div><div class="details-highlights-list">${d.highlights.map(h=>`<article class="details-highlight ${safe(h.color)}"><p>${safe(h.text)}</p><div><span>${safe(h.chapter)}</span><small>Page ${safe(h.page)}</small></div></article>`).join('')}${!d.highlights.length?'<p class="details-soft-empty">There are no highlights in this book yet.</p>':''}</div>`;
    }
  }
  function readerNotice(){
    openDialog('Reader comes next',`<p>This phase is the Book Details interface. The PDF and EPUB reader will be connected after this screen is approved.</p><p>Your current books, progress and annotations have not been accessed or changed.</p>`,'DESIGN REVIEW');
  }
  function closeMore(){$('#detailsMoreMenu').classList.add('hidden');$('#detailsMore').setAttribute('aria-expanded','false')}
  function resetAfterRemove(){close({fromNavigation:true});state.section='library';state.format='all';lib.setSection('library');lib.renderCollectionsNav();render();toast('Book moved to Trash.')}
  $('#detailsBack').addEventListener('click',back);
  $('#detailsRead').addEventListener('click',()=>window.LireloReader?.open(activeId));
  $('#detailsBookmark').addEventListener('click',()=>{const b=book();if(!b)return;if(bookmarked.has(b.id)){bookmarked.delete(b.id);toast('Removed from saved books.')}else{bookmarked.add(b.id);toast('Book saved.')}try{localStorage.setItem('lirelo-saved-books-v1',JSON.stringify([...bookmarked]))}catch{}fillDetails();setTab(activeTab)});
  /* Bespoke collection listbox: avoid browser-native option popups.
     Keyboard support: arrows, Home, End, Enter, Space, Escape, Tab. */
  const collectionTrigger=$('#detailsCollection');
  const collectionMenu=$('#detailsCollectionMenu');
  const collectionWrap=$('#detailsCollectionControl');
  function renderCollectionDropdown(){
    const b=book();if(!b)return;
    $('#detailsCollectionValue').textContent=b.collection;
    collectionMenu.innerHTML=state.collections.map((name,i)=>`<button type="button" id="detailsCollectionOption${i}" class="details-collection-option${name===b.collection?' is-selected':''}" role="option" aria-selected="${name===b.collection}" data-collection-value="${safe(name)}" tabindex="-1"><span class="details-collection-option-name">${safe(name)}</span><span class="details-collection-selected-dot" aria-hidden="true"></span></button>`).join('');
  }
  function closeCollectionDropdown(focus=false){
    collectionMenu.classList.add('hidden');
    collectionMenu.classList.remove('is-up');
    collectionTrigger.setAttribute('aria-expanded','false');
    collectionWrap.classList.remove('is-open');
    if(focus)collectionTrigger.focus();
  }
  function collectionOptions(){return Array.from(collectionMenu.querySelectorAll('[role="option"]'))}
  function collectionFocus(index){
    const opts=collectionOptions();if(!opts.length)return;
    opts[((index%opts.length)+opts.length)%opts.length].focus();
  }
  function openCollectionDropdown(start='selected',focusOption=true){
    if(!book())return;
    renderCollectionDropdown();
    collectionMenu.classList.remove('hidden','is-up');
    collectionTrigger.setAttribute('aria-expanded','true');
    collectionWrap.classList.add('is-open');
    const anchor=collectionTrigger.getBoundingClientRect();
    const height=collectionMenu.getBoundingClientRect().height;
    if(innerHeight-anchor.bottom < height+12 && anchor.top > height+12) collectionMenu.classList.add('is-up');
    const opts=collectionOptions();
    const sel=Math.max(0,opts.findIndex(o=>o.getAttribute('aria-selected')==='true'));
    if(focusOption)collectionFocus(start==='first'?0:start==='last'?opts.length-1:sel);
  }
  function selectCollection(name){
    const b=book();if(!b)return;
    if(!state.collections.includes(name))return;
    const changed=b.collection!==name;
    b.collection=name;
    window.LireloApp?.updateBook(b);
    renderCollectionDropdown();
    closeCollectionDropdown(true);
    if(changed){
      lib.renderCollectionsNav();render();
      $('#detailsCollectionSaved').textContent='Collection updated';
      toast(`Added to ${b.collection}.`);
    }
  }
  collectionTrigger.addEventListener('click',()=>{
    if(collectionMenu.classList.contains('hidden'))openCollectionDropdown('selected',false);
    else closeCollectionDropdown(true);
  });
  collectionMenu.addEventListener('click',e=>{
    const option=e.target.closest('[data-collection-value]');
    if(option)selectCollection(option.dataset.collectionValue);
  });
  collectionWrap.addEventListener('keydown',e=>{
    const opts=collectionOptions();
    const isOpen=!collectionMenu.classList.contains('hidden');
    if(e.key==='Escape' && isOpen){e.preventDefault();e.stopPropagation();closeCollectionDropdown(true);return}
    if(e.key==='Tab'){if(isOpen)closeCollectionDropdown();return}
    if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){
      e.preventDefault();
      if(!isOpen){openCollectionDropdown(e.key==='Home'?'first':e.key==='End'?'last':'selected');return}
      const current=opts.indexOf(document.activeElement);
      if(e.key==='Home')collectionFocus(0);
      else if(e.key==='End')collectionFocus(opts.length-1);
      else collectionFocus((current<0?0:current)+(e.key==='ArrowDown'?1:-1));
      return;
    }
    if((e.key==='Enter'||e.key===' ') && isOpen && document.activeElement.matches('.details-collection-option')){
      e.preventDefault();selectCollection(document.activeElement.dataset.collectionValue);
    }
  });
  document.addEventListener('pointerdown',e=>{if(!collectionWrap.contains(e.target))closeCollectionDropdown()});
  window.addEventListener('resize',()=>{if(!collectionMenu.classList.contains('hidden'))closeCollectionDropdown()});
  $('#detailsBack').addEventListener('click',()=>closeCollectionDropdown());

  $$('.details-tab').forEach(t=>t.addEventListener('click',()=>setTab(t.dataset.detailTab)));
  $('#detailsTabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;const tabs=$$('.details-tab');const curr=tabs.findIndex(t=>t.dataset.detailTab===activeTab);let next=e.key==='Home'?0:e.key==='End'?tabs.length-1:(curr+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;e.preventDefault();tabs[next].focus();setTab(tabs[next].dataset.detailTab)});
  $('#detailsMore').addEventListener('click',()=>{const menu=$('#detailsMoreMenu');menu.classList.toggle('hidden');$('#detailsMore').setAttribute('aria-expanded',String(!menu.classList.contains('hidden')))});
  document.addEventListener('click',e=>{if(!e.target.closest('.details-more-wrap'))closeMore()});
  $('#detailsCopyTitle').addEventListener('click',async()=>{closeMore();const t=book()?.title||'';try{await navigator.clipboard.writeText(t);toast('Book title copied.')}catch{openDialog('Book title',`<p>${safe(t)}</p><p>Copy the title from here.</p>`,'COPY BOOK TITLE')}});
  $('#detailsRemove').addEventListener('click',()=>{closeMore();removeId=activeId;$('#removeBookDialog').showModal()});
  $('#removeClose').addEventListener('click',()=>$('#removeBookDialog').close());
  $('#removeCancel').addEventListener('click',()=>$('#removeBookDialog').close());
  $('#removeBookDialog').addEventListener('click',e=>{if(e.target===e.currentTarget)e.currentTarget.close()});
  $('#removeConfirm').addEventListener('click',()=>{const index=state.books.findIndex(b=>b.id===removeId);$('#removeBookDialog').close();if(index<0)return;state.books.splice(index,1);removeId=null;resetAfterRemove()});
  window.addEventListener('popstate',()=>{const match=location.hash.match(/^#book=(.+)$/);if(match){const id=decodeURIComponent(match[1]);if(id!==activeId)open(id,{pushHistory:false})}else close()});
  if(location.hash.startsWith('#book=')){const id=decodeURIComponent(location.hash.slice(6));if(state.books.some(b=>b.id===id))open(id,{pushHistory:false})}
  // Original app.js renders nav icons at startup. The new detail-only icons are mounted here.
  iconise($('#detailsScreen'));iconise($('#removeBookDialog'));
  window.LireloBookDetails={open,close,get activeId(){return activeId}};
})();

