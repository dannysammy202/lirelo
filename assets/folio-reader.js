/* Single-page reading surface using Lirelo's existing document endpoints. */
(() => {
  'use strict';
  const workspace=window.LireloWorkspace;
  const {escape,icon,toast,bookState,saveBookState,loadData,ask}=workspace;
  let reader, nextPage;
  const button=(glyph,label,action,show=false)=>`<button type="button" data-tool="${action}" aria-label="${label}" title="${label}">${icon(glyph)}${show?'<span>'+label+'</span>':''}</button>`;
  const find=(selector,root=reader?.root)=>root?.querySelector(selector);
  const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number(value)||min));
  function close(){reader=null;}
  function query(doc){
    return new URLSearchParams({id:doc.id,size:doc.font||14,font:doc.fontface||'original',...(doc.layout&&doc.layout!=='standard'?{layout:doc.layout}:{})});
  }
  const api=(path,params)=>window.LireloApp.request(path+'?'+params);
  function controls(book){
    return `<div class="reading-app"><header class="reader-heading"><button class="back-button" data-go="book=${encodeURIComponent(book.id)}">${icon('back')}<span class="sr-only">Book details</span></button><h1>${escape(book.title)}</h1><div>${button('saved','Bookmark','bookmark',true)}${button('note','Note','note',true)}</div></header>
      <div class="reading-desk"><nav class="reading-tools" aria-label="Reading tools">
       ${button('toc','Contents','contents')}${button('search','Find in book','search')}${button('display','Display','display')}${button('saved','Saved in this book','annotations')}${button('note','Add a note','note')}
       ${button('offline','Download for offline reading','offline')}
      </nav><section class="paper-stage" tabindex="0" aria-label="Document page"><p class="reader-empty">Opening book…</p></section>
      <aside class="tool-drawer" aria-label="Reader tools" hidden></aside></div>
      <footer class="page-controls">${button('back','Previous page','previous')}<input type="range" id="page-scrubber" min="1" max="1" value="1" aria-label="Page number"><output id="page-count">Opening…</output>${button('next','Next page','next')}</footer>
    </div>`;
  }
  async function open(root,book){
    const stored=bookState(book.id),preferences=loadData('lirelo-complete-preferences-v1');
    const annotations=stored.annotations||{};
    const wanted=nextPage;nextPage=null;
    const r={root,book,stored,annotations:{highlights:annotations.highlights||[],notes:annotations.notes||[],bookmarks:annotations.bookmarks||[]},
      doc:null,page:1,offset:Number(stored.offset)||0,zoom:clamp(stored.zoom||100,75,225),tone:stored.tone||preferences.tone||'light',request:0,reflow:0,drawer:'',search:[],pageData:null};
    reader=r;
    root.innerHTML=controls(book);
    const stage=find('.paper-stage',root);
    stage.dataset.tone=r.tone;
    const size=Number(stored.font||preferences.size)||14;
    const font=stored.fontFace||preferences.font||'original';
    try{
      const params=new URLSearchParams({id:book.id,size,font});
      const offline=window.LireloOffline;
      if(navigator.onLine){
        try {
          r.doc=await api(book.format==='epub'&&(size!==14||font!=='original')?'reflow':'meta',params);
          offline?.saveMeta(r.doc).catch(()=>{});
        }catch(error){r.doc=await offline?.getMeta(book.id,size,font).catch(()=>null);if(!r.doc)throw error;}
      }else{
        r.doc=await offline?.getMeta(book.id,size,font).catch(()=>null)||await offline?.getMeta(book.id,14,'original').catch(()=>null)||await offline?.getMeta(book.id,17,'original',undefined,'mobile-v2').catch(()=>null);
      }
      if(reader!==r)return;
      if(!r.doc)throw Error('Download this book before reading offline.');
      let offsetTimer;
      stage.addEventListener('scroll',()=>{if(reader!==r||!r.pageData)return;r.offset=stage.scrollTop/Math.max(1,stage.scrollHeight-stage.clientHeight);clearTimeout(offsetTimer);offsetTimer=setTimeout(()=>{if(reader===r)persist(r);},200);});
      const previous=stored.page&&stored.pages&&stored.pages!==r.doc.pages?1+Math.round((stored.page-1)/Math.max(1,stored.pages-1)*(r.doc.pages-1)):stored.page;
      await showPage(r,wanted||previous||(book.progress>0?Math.round(book.progress*r.doc.pages/100):1),{keepOffset:!wanted});
    }catch(error){
      if(reader!==r)return;
      stage.innerHTML=`<div class="reader-empty"><p>${escape(error.message)}</p><button class="outline" data-tool="reopen">Try again</button></div>`;
    }
  }
  async function getPage(doc,page){
    const offline=window.LireloOffline;
    const cached=await offline?.getPage(doc,page).catch(()=>null);
    if(cached)return cached;
    if(!navigator.onLine)throw Error('This page is not available offline.');
    const params=query(doc);params.set('page',page);
    const data=await api('page',params);
    offline?.savePage(doc,page,data).catch(()=>{});
    return data;
  }
  function paint(r,data){
    const {width,height}=data;
    const spans=(data.spans||[]).map(span=>`<span class="text-run" style="left:${100*span.x/width}%;top:${100*span.y/height}%;width:${100*span.w/width}%;height:${100*span.h/height}%;font-size:${100*span.size/width}cqw">${escape(span.text)}</span>`).join('');
    const src=/^data:image\/(png|jpeg|webp);base64,/i.test(data.image||'')||/^https:\/\//i.test(data.image||'')?escape(data.image):'';
    return `<div class="paper-page" style="--zoom:${r.zoom/100};--ratio:${width}/${height}">${src?`<img src="${src}" draggable="false" alt="Page ${r.page}">`:''}<div class="page-markers" aria-hidden="true"></div><div class="paper-text">${spans}</div></div>`;
  }
  function paintMarks(r){
    const markers=find('.page-markers',r.root);
    if(!markers)return;
    const records=[...r.annotations.highlights,...r.annotations.notes].filter(item=>item.page===r.page);
    const hits=r.search.filter(item=>item.page===r.page).flatMap(item=>item.rects||[]).map(([x,y,w,h])=>[x/r.pageData.width,y/r.pageData.height,w/r.pageData.width,h/r.pageData.height]);
    const marker=(rect,kind)=>`<i class="${kind}" style="left:${rect[0]*100}%;top:${rect[1]*100}%;width:${(rect[2]-rect[0])*100}%;height:${(rect[3]-rect[1])*100}%"></i>`;
    markers.innerHTML=records.flatMap(record=>(record.rects||[]).map(rect=>marker(rect,record.color==='yellow'?'yellow':'lit'))).join('')+hits.map(rect=>marker(rect,'found')).join('');
  }
  async function showPage(r,target,{keepOffset=false}={}){
    if(!r.doc||reader!==r)return;
    const page=clamp(target,1,r.doc.pages),token=++r.request,doc=r.doc;
    const stage=find('.paper-stage',r.root);
    stage.setAttribute('aria-busy','true');
    try{
      const data=await getPage(doc,page);
      if(reader!==r||token!==r.request||doc!==r.doc)return;
      r.page=page;r.pageData=data;r.offset=keepOffset?r.offset:0;
      stage.innerHTML=paint(r,data);stage.scrollTop=r.offset*Math.max(0,stage.scrollHeight-stage.clientHeight);
      paintMarks(r);updateControls(r);persist(r,true);
    }catch(error){
      if(reader!==r||token!==r.request)return;
      if(!r.pageData)stage.innerHTML=`<div class="reader-empty"><p>${escape(error.message)}</p><button class="outline" data-tool="reopen">Try again</button></div>`;
      else{toast(error.message);updateControls(r);}
    }finally{if(reader===r&&token===r.request)stage.removeAttribute('aria-busy');}
  }
  function updateControls(r){
    const slider=find('#page-scrubber',r.root);slider.max=r.doc.pages;slider.value=r.page;
    slider.style.setProperty('--fraction',100*(r.page-1)/Math.max(1,r.doc.pages-1)+'%');
    find('#page-count',r.root).textContent='p. '+r.page+' of '+r.doc.pages;
    find('[data-tool="previous"]',r.root).disabled=r.page<=1;
    find('[data-tool="next"]',r.root).disabled=r.page>=r.doc.pages;
    find('[data-tool="bookmark"]',r.root).setAttribute('aria-pressed',String(r.annotations.bookmarks.some(item=>item.page===r.page)));
  }
  function persist(r,progress=false){
    try{
      const state=bookState(r.book.id);
      saveBookState(r.book.id,{...state,annotations:r.annotations,page:r.page,pages:r.doc.pages,offset:r.offset,
        zoom:r.zoom,tone:r.tone,tonePinned:true,font:r.doc.font||14,fontFace:r.doc.fontface||'original',layout:r.doc.layout||'standard'});
      if(progress){
        const next=Math.round((r.page-1)/Math.max(1,r.doc.pages-1)*100);
        localStorage.setItem('lirelo-last-open-book',r.book.id);
        if(next!==r.book.progress&&navigator.onLine)window.LireloApp.updateProgress(r.book.id,next);
        else if(next!==r.book.progress)r.book.progress=next;
      }
    }catch(error){toast(error.message);}
  }
  function pageSelection(r){
    const selection=getSelection(),page=find('.paper-page',r.root);
    const text=selection?.toString().trim();
    if(!text||!page?.contains(selection.anchorNode)||!page.contains(selection.focusNode)||!selection.rangeCount)return null;
    const box=page.getBoundingClientRect();
    const rects=[...selection.getRangeAt(0).getClientRects()].filter(rect=>rect.width&&rect.height).map(rect=>[
      clamp((rect.left-box.left)/box.width,0,1),clamp((rect.top-box.top)/box.height,0,1),
      clamp((rect.right-box.left)/box.width,0,1),clamp((rect.bottom-box.top)/box.height,0,1)]);
    return {text:text.slice(0,2000),rects};
  }
  function add(r,kind,fields={}){
    r.annotations[kind].unshift({id:crypto.randomUUID(),page:r.page,created:Date.now(),...fields});
    persist(r);paintMarks(r);updateControls(r);
  }
  function note(r){
    const selection=pageSelection(r);
    ask('New note','<label>Note<textarea name="text" rows="5" maxlength="2000" required></textarea></label>',form=>{
      const text=form.get('text').trim();if(!text)throw Error('Write a note before saving.');
      add(r,'notes',{text,quote:selection?.text,rects:selection?.rects||[]});toast('Note saved.');
    });
  }
  function panel(r,name){
    const shell=find('.tool-drawer',r.root);
    if(r.drawer===name){shell.hidden=true;r.drawer='';return;}
    r.drawer=name;shell.hidden=false;
    const standardHeader=title=>`<header><h2>${title}</h2>${button('close','Close','close')}</header>`;
    let content;
    if(name==='contents'){
      const toc=r.doc.toc||r.book.toc||[];
      content=standardHeader('Contents')+(toc.length?`<ol>${toc.map(item=>`<li><button data-jump="${Number(item.page)||1}"><span>${escape(item.title)}</span><small>${Number(item.page)||1}</small></button></li>`).join('')}</ol>`:'<p>This book has no chapter index.</p>');
    }else if(name==='search'){
      content=standardHeader('Find in book')+'<form class="document-search"><input name="query" type="search" aria-label="Find a word or phrase" placeholder="Find a word or phrase" required><button class="primary">Find</button></form><div id="search-hits"></div>';
    }else if(name==='annotations'){
      content=standardHeader('Saved in this book')+'<button class="outline" data-tool="highlight">Highlight selected text</button>'+Object.entries(r.annotations).map(([kind,list])=>list.length?`<h3>${kind[0].toUpperCase()+kind.slice(1)}</h3><ol>${list.map(entry=>`<li><button data-jump="${Number(entry.page)||1}"><span>${escape(entry.text||entry.title||'Saved page')}</span><small>p. ${Number(entry.page)||1}</small></button></li>`).join('')}</ol>`:'').join('');
    }else{
      content=standardHeader('Display')+`<label>Zoom <input id="reader-zoom" type="range" min="75" max="225" step="5" value="${r.zoom}"></label>
        <label>Page colour<select id="reader-tone">${['light','paper','dark'].map(t=>`<option value="${t}" ${t===r.tone?'selected':''}>${t[0].toUpperCase()+t.slice(1)}</option>`).join('')}</select></label>
        ${r.doc.reflowable?`<label>Text size<input type="number" id="reader-font" min="10" max="26" value="${r.doc.font||14}"></label>
        <label>Typeface<select id="reader-type">${[['original','Original'],['serif','Serif'],['sans','Sans serif']].map(([key,label])=>`<option value="${key}" ${key===r.doc.fontface?'selected':''}>${label}</option>`).join('')}</select></label>`:''}
        <button class="outline" data-tool="fullscreen">Full screen</button>`;
    }
    shell.innerHTML=content;
    const target=name==='search'?find('input',shell):find('header button',shell);
    target?.focus();
  }
  async function saveOffline(r){
    const offline=window.LireloOffline;
    if(!offline||r.downloading)return;
    r.downloading=true;
    try{
      const doc=r.doc;await offline.saveMeta(doc);
      for(let page=1;page<=doc.pages;page+=3){
        if(reader!==r||r.doc!==doc)return;
        toast('Saving pages '+page+'–'+Math.min(doc.pages,page+2)+' of '+doc.pages+'…');
        for(let n=page;n<=Math.min(doc.pages,page+2);n++){
          if(!await offline.getPage(doc,n)){
            const params=query(doc);params.set('page',n);
            await offline.savePage(doc,n,await api('page',params));
          }
        }
      }
      toast('Book available offline.');
    }catch(error){toast(error.message);}
    finally{r.downloading=false;}
  }
  function chooseAction(event){
    const r=reader,button=event.target.closest('button');
    if(!r||!button)return;
    if(button.dataset.jump){showPage(r,button.dataset.jump);if(r.drawer)panel(r,r.drawer);return;}
    const action=button.dataset.tool;
    if(action==='reopen'){open(r.root,r.book);return;}
    if(!r.doc||!action)return;
    if(action==='next'||action==='previous'){showPage(r,r.page+(action==='next'?1:-1));return;}
    if(action==='close'){panel(r,r.drawer);return;}
    if(['contents','search','display','annotations'].includes(action)){panel(r,action);return;}
    if(action==='note'){note(r);return;}
    if(action==='offline'){saveOffline(r);return;}
    if(action==='fullscreen'){if(document.fullscreenElement)document.exitFullscreen().catch(e=>toast(e.message));else (find('.reading-app').requestFullscreen?.()||Promise.reject(Error('Full screen is unavailable.'))).catch(e=>toast(e.message));return;}
    if(action==='bookmark'){
      const index=r.annotations.bookmarks.findIndex(item=>item.page===r.page);
      if(index<0){add(r,'bookmarks',{title:'Page '+r.page});toast('Page bookmarked.');}
      else{r.annotations.bookmarks.splice(index,1);persist(r);updateControls(r);toast('Bookmark removed.');}
      return;
    }
    if(action==='highlight'){
      const selection=pageSelection(r);
      if(!selection){toast('Select text on the page first.');return;}
      add(r,'highlights',{...selection,color:'yellow'});getSelection()?.removeAllRanges();toast('Highlight saved.');
    }
  }
  const app=document.getElementById('app');
  app.addEventListener('click',chooseAction);
  app.addEventListener('input',event=>{
    const r=reader,source=event.target;
    if(!r?.doc)return;
    if(source.id==='page-scrubber')find('#page-count').textContent='p. '+source.value+' of '+r.doc.pages;
    if(source.id==='reader-zoom'){r.zoom=Number(source.value);find('.paper-page')?.style.setProperty('--zoom',r.zoom/100);persist(r);}
  });
  app.addEventListener('change',async event=>{
    const r=reader,source=event.target;
    if(!r?.doc)return;
    if(source.id==='page-scrubber')showPage(r,source.value);
    if(source.id==='reader-tone'){r.tone=source.value;find('.paper-stage').dataset.tone=r.tone;persist(r);}
    if(source.id==='reader-font'||source.id==='reader-type'){
      const token=++r.reflow,params=query(r.doc);
      params.set('size',clamp(find('#reader-font')?.value||14,10,26));params.set('font',find('#reader-type')?.value||'original');
      try{
        const doc=await api('reflow',params);
        if(reader!==r||token!==r.reflow)return;
        const target=1+Math.round((r.page-1)/Math.max(1,r.doc.pages-1)*(doc.pages-1));
        r.doc=doc;r.search=[];window.LireloOffline?.saveMeta(doc).catch(()=>{});showPage(r,target);
      }catch(error){toast(error.message);}
    }
  });
  app.addEventListener('submit',async event=>{
    const form=event.target,r=reader;
    if(!form.matches('.document-search')||!r?.doc)return;
    event.preventDefault();
    const target=find('#search-hits'),params=query(r.doc);params.set('q',new FormData(form).get('query').trim());
    target.textContent='Searching…';
    try{
      const data=await api('search',params);
      if(reader!==r||!target.isConnected)return;
      r.search=data.results||[];
      target.innerHTML=r.search.length?`<p>${r.search.length} matching pages</p><ol>${r.search.map(result=>`<li><button data-jump="${Number(result.page)||1}">Page ${Number(result.page)||1}</button></li>`).join('')}</ol>`:'<p>No matching pages.</p>';
      paintMarks(r);
    }catch(error){target.textContent=error.message;}
  });
  document.addEventListener('selectionchange',()=>{
    const r=reader;if(!r?.doc)return;
    let bar=find('.selection-controls',r.root),selected=pageSelection(r);
    if(!selected){if(!bar?.contains(document.activeElement))bar?.remove();return;}
    if(bar)return;
    bar=document.createElement('div');bar.className='selection-controls';
    bar.innerHTML=button('highlight','Highlight','highlight',true)+button('note','Add note','note',true);
    bar.addEventListener('pointerdown',event=>event.preventDefault());
    find('.reading-desk',r.root).append(bar);
  });
  document.addEventListener('keydown',event=>{
    const r=reader;if(!r?.doc||document.getElementById('folio-dialog').open)return;
    if(event.key==='Escape'&&r.drawer){panel(r,r.drawer);return;}
    if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'){event.preventDefault();if(r.drawer!=='search')panel(r,'search');else find('.document-search input')?.focus();return;}
    if(event.target.closest('button,input,textarea,select')||r.drawer)return;
    if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();showPage(r,r.page+(event.key==='ArrowRight'?1:-1));}
  });
  window.LireloFolioReader={open,close,requestPage(page){nextPage=page;}};
})();
