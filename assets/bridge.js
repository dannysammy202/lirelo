/* Lirelo local application bridge. All document content stays on your machine. */
(()=>{
  'use strict';
  const pending=new Map();
  const deleting=new Set();
  let known=[];
  let readyResolve;
  const ready=new Promise(resolve=>{readyResolve=resolve});
  const req=async(path,options={})=>{
    const response=await fetch('/api/'+path,options);
    let result;try{result=await response.json()}catch{throw new Error('Unable to reach the local Lirelo service.')}
    if(!response.ok)throw new Error(result.error||'Request failed.');
    return result;
  };
  const updateBook=book=>{
    if(!book?.id || !book.id.startsWith('book-'))return;
    clearTimeout(pending.get(book.id));
    pending.set(book.id,setTimeout(()=>{
      req('books/'+encodeURIComponent(book.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:book.title,author:book.author,collection:book.collection,tags:book.tags||[],progress:book.progress||0})}).catch(console.warn);
      pending.delete(book.id);
    },500));
  };
  let lastProgress={};
  const updateProgress=(id,progress)=>{
    const now=Date.now();
    const last=lastProgress[id];
    if(last && Math.abs(last.progress-progress)<1 && now-last.at<5000)return;
    lastProgress[id]={progress,at:now};
    const b=window.LireloLibrary?.state.books.find(b=>b.id===id);
    if(b)updateBook(b);
  };
  async function importBook(file){
    if(file.size>60*1024*1024)throw Error('The document exceeds the 60 MB local limit.');
    const response=await req('books/import',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Lirelo-Filename':encodeURIComponent(file.name)},body:file});
    known=known.filter(b=>b.id!==response.book.id);
    known.unshift(response.book);
    return response.book;
  }
  async function load(){
    try{
      const data=await req('books');
      known=data.books||[];
      const lib=window.LireloLibrary;
      const final=window.LireloFinal;
      const tags=(()=>{try{return JSON.parse(localStorage.getItem('lirelo-complete-tags-v1'))||{}}catch{return{}}})();
      const active=known.filter(b=>!b.trashed);
      active.forEach(b=>{if(Array.isArray(tags[b.id]))b.tags=tags[b.id]});
      lib.state.books.splice(0,lib.state.books.length,...active);
      const saved=(()=>{try{return JSON.parse(localStorage.getItem('lirelo-collections-v2'))||[]}catch{return[]}})();
      lib.state.collections=[...new Set(['Personal','Work','Learning','Favourites',...saved,...active.map(b=>b.collection).filter(Boolean)])];
      if(final){
        final.trash.splice(0,final.trash.length,...known.filter(b=>b.trashed));
        const current=final.state?.view;
        if(final.state.active&&current)final.enter(current,false);
      }
      lib.renderCollectionsNav();lib.render();
      const hash=location.hash;
      if(hash.startsWith('#book='))window.LireloBookDetails?.open(decodeURIComponent(hash.slice(6)),{pushHistory:false});
      if(hash.startsWith('#reader='))window.LireloReader?.open(decodeURIComponent(hash.slice(8)),{pushHistory:false});
    }catch(err){window.LireloLibrary?.toast('Unable to open local library: '+err.message);console.error(err)}
    finally{readyResolve()}
  }
  function savedAnnotations(id){
    try{return JSON.parse(localStorage.getItem('lirelo-reader-v3-standalone:'+id))?.annotations||{}}
    catch{return{}}
  }
  function syncTrash(trashed){
    const gone=new Set(trashed.map(b=>b.id));
    for(const b of known){if(deleting.has(b.id))continue;const flag=gone.has(b.id);if(Boolean(b.trashed)!==flag){
      b.trashed=flag;
      req('books/'+encodeURIComponent(b.id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:flag})}).catch(console.warn);
    }}
  }
  async function removeForever(id){
    deleting.add(id);
    try{
      await req('books/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})});
      await req('books/'+encodeURIComponent(id),{method:'DELETE'});
      known=known.filter(b=>b.id!==id);
    }catch(err){console.error('Permanent deletion failed',err);window.LireloLibrary?.toast('Unable to remove file. Try again.')}
    finally{deleting.delete(id)}
  }
  function saveNote(id,note){
    const key='lirelo-reader-v3-standalone:'+id;
    let saved;try{saved=JSON.parse(localStorage.getItem(key))||{}}catch{saved={}}
    saved.annotations ||= {highlights:[],notes:[],bookmarks:[]};
    saved.annotations.notes ||= [];
    saved.annotations.notes.unshift(note);
    localStorage.setItem(key,JSON.stringify(saved));
  }
  function deleteNote(id,noteId){
    const key='lirelo-reader-v3-standalone:'+id;
    let saved;try{saved=JSON.parse(localStorage.getItem(key))||{}}catch{saved={}}
    if(!Array.isArray(saved.annotations?.notes))return;
    saved.annotations.notes=saved.annotations.notes.filter(n=>n.id!==noteId);
    localStorage.setItem(key,JSON.stringify(saved));
  }
  const saveCollections=list=>{try{localStorage.setItem('lirelo-collections-v2',JSON.stringify(list))}catch{}};
  window.LireloApp={ready,load,importBook,updateBook,updateProgress,syncTrash,removeForever,saveCollections,savedAnnotations,saveNote,deleteNote,request:req};
  document.addEventListener('DOMContentLoaded',load,{once:true});
})();
