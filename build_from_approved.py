"""Extract the approved UI into a maintainable, fast-loading project.
Run only when updating from the approved review HTML.
"""
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parent
source=Path('/mnt/data/lirelo-complete-interactive-dark-reader-synchronised.html')
if not source.exists():
    raise SystemExit('Source review HTML required in /mnt/data to re-extract')
html=source.read_text()
styles=[]
def replace_style(m):
    index=len(styles)
    css=m.group(1)
    (ROOT/'assets'/f'style-{index}.css').write_text(css)
    styles.append(index)
    return f'<link rel="stylesheet" href="/assets/style-{index}.css">'
html,count=re.subn(r'<style(?:\s[^>]*)?>(.*?)</style>',replace_style,html,flags=re.S|re.I)
assert count>=8,count
scripts=[]
def replace_script(m):
    index=len(scripts)
    code=m.group(1)
    scripts.append(index)
    if index==3: # 11MB sample images are replaced by real PDF/EPUB service.
        return ''
    if index==1: code=transform_library(code)
    if index==2: code=transform_details(code)
    if index==4: code=transform_reader(code)
    if index==6: code=transform_final(code)
    (ROOT/'assets'/f'script-{index}.js').write_text(code)
    return f'<script src="/assets/script-{index}.js"></script>'

def require_replace(s,old,new):
    if old not in s:raise ValueError('Missing source: '+old[:140])
    return s.replace(old,new,1)

def transform_library(code):
    code=require_replace(code,'const state = {books:sampleBooks,', 'const state = {books:[],')
    start=code.index("  $('#fileInput').addEventListener('change',e=>{")
    end=code.index("  $('#newCollection').addEventListener",start)
    code=code[:start]+'''  $('#fileInput').addEventListener('change',async e=>{
    const files=[...(e.target.files||[])];e.target.value='';
    if(!files.length)return;
    for(const file of files){
      if(!/\\.(pdf|epub)$/i.test(file.name)){toast('Only PDF and EPUB documents are supported.');continue}
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
''' +code[end:]
    code=code.replace("toast('Collection added for this preview only.');", "window.LireloApp.saveCollections(state.collections);toast('Collection created.');")
    code=code.replace("toast('Desktop sidebar is fixed in this design review. The compact mode will be built with the remaining screens.')", "document.querySelector('.sidebar')?.classList.toggle('is-compact')")
    code=code.replace("const profile=()=>openDialog('Lirelo Library preview','This screen uses fictional account details and sample book records to demonstrate the approved visual design. No account, cloud storage or existing library is connected.');", "const profile=()=>window.LireloFinal?.enter('account');")
    code=code.replace("toast('Book saved for this preview.')", "toast('Book saved.')")
    code=code.replace("Your library has no books matching this view.", "No books here yet. Add a PDF or EPUB to start reading.")
    code=code.replace("'DESIGN PREVIEW'", "'LIRELO'")
    code=code.replace('Collections in this preview are temporary and do not affect your books.', 'Collections organise books in your local library.')
    code=code.replace('This design preview has no deleted books.', 'No books in Trash.')
    return code

def transform_details(code):
    start=code.index("  function data(){")
    end=code.index('  function iconise',start)
    code=code[:start]+'''  function data(){
    const b=book();if(!b)return {year:'—',publisher:'—',summary:'',chapters:[],notes:[],highlights:[]};
    const saved=window.LireloApp?.savedAnnotations(b.id)||{};
    return {year:b.year||'—',publisher:b.publisher||'—',summary:b.summary||'Your imported document. Open the Reader to browse its pages and chapters.',
      chapters:(b.toc||[]).map(t=>[t.title,t.page]),notes:saved.notes||[],highlights:saved.highlights||[]};
  }
''' +code[end:]
    code=code.replace("'No chapter information in this design preview.'", "'This document does not provide a table of contents.'")
    code=code.replace("page:Number(el.dataset.chapter)+1", "page:Number(d.chapters[Number(el.dataset.chapter)]?.[1]||1)")
    code=code.replace("Notes in this prototype are temporary.", "Notes are saved locally in your browser.")
    code=code.replace("'Note saved for this preview.'", "'Note saved.'")
    code=code.replace("'Note removed from this preview.'", "'Note removed.'")
    code=code.replace("let bookmarked = new Set(['thinking']);", "let bookmarked=new Set();try{bookmarked=new Set(JSON.parse(localStorage.getItem('lirelo-saved-books-v1')||'[]'))}catch{}")
    code=code.replace("toast('Removed from saved books for this preview.')", "toast('Removed from saved books.')")
    code=code.replace("toast('Book saved for this preview.')", "toast('Book saved.')")
    code=code.replace("fillDetails();setTab(activeTab)});", "try{localStorage.setItem('lirelo-saved-books-v1',JSON.stringify([...bookmarked]))}catch{}fillDetails();setTab(activeTab)});")
    code=code.replace("d.notes.unshift({text,id:'note-'+Date.now(),page:Math.max(1,Math.round((b.progress/100)*(b.pages||10)))});", "window.LireloApp?.saveNote(b.id,{text,id:'note-'+Date.now(),page:Math.max(1,Math.round((b.progress/100)*(b.pages||10))),chapter:'Your note',created:Date.now()});")
    code=code.replace("d.notes.splice(Number(el.dataset.noteDelete),1);", "window.LireloApp?.deleteNote(b.id,d.notes[Number(el.dataset.noteDelete)]?.id);")
    code=code.replace("'Sample book removed. Your existing library was not changed.'", "'Book moved to Trash.'")

    # Save book metadata changes through the local document library.
    code=code.replace("b.collection=name;\n    renderCollectionDropdown();", "b.collection=name;\n    window.LireloApp?.updateBook(b);\n    renderCollectionDropdown();")
    code=code.replace("'Moved in this preview'", "'Collection updated'")
    code=code.replace("'This book was added to the temporary design preview.", "'This book was added to your library.")
    return code

def transform_reader(code):
    code=code.replace('const safe=lib.safe,ico=lib.svg;', 'const safe=lib.safe,ico=lib.svg,toast=lib.toast;')
    start=code.index('async function api(path,opts){')
    end=code.index('\nfunction persist()',start)
    code=code[:start]+'''async function api(path,opts){
  const response=await fetch('/api/'+path,opts||{});
  let payload;try{payload=await response.json()}catch{throw Error('The document service did not respond. Restart Lirelo.')}
  if(!response.ok)throw Error(payload.error||'Unable to read your document.');
  return payload;
}
''' +code[end:]
    start=code.index('async function getDocument(b){')
    end=code.index('\nasync function open(id,',start)
    code=code[:start]+'''async function getDocument(b){
  return api('meta?id='+encodeURIComponent(b.id));
}
''' +code[end:]
    code=code.replace("${state.book.id.startsWith('preview-')?'':'· sample reader content'}", "· your document")
    code=code.replace("if(b){b.progress=pct;try{localStorage.setItem('lirelo-reader-progress:'+b.id,String(pct))}catch{}lib.render()}","if(b){b.progress=pct;try{localStorage.setItem('lirelo-reader-progress:'+b.id,String(pct))}catch{}window.LireloApp?.updateProgress(b.id,pct);lib.render()}")
    # Disable browser duplicate-import handling. Real documents persist on the local service.
    code=code.replace("const savedUploads=new Set();$('#fileInput').addEventListener('change',()=>{rememberUploaded().catch(console.error)});", "const savedUploads=new Set();")
    code=code.replace("if(location.hash.startsWith('#reader=')){const id=decodeURIComponent(location.hash.slice(8));open(id,{pushHistory:false})}", "if(location.hash.startsWith('#reader=')){const id=decodeURIComponent(location.hash.slice(8));window.LireloApp?.ready?.then(()=>open(id,{pushHistory:false}))}")
    return code

def transform_final(code):
    code=code.replace("function persistTags(){store(keyTags,Object.fromEntries(allBooks().map(b=>[b.id,b.tags||[]])))}", "function persistTags(){store(keyTags,Object.fromEntries(allBooks().map(b=>[b.id,b.tags||[]])));allBooks().forEach(b=>window.LireloApp?.updateBook(b))}")
    code=code.replace("function persistTrash(){store(keyTrash,trashed)}", "function persistTrash(){store(keyTrash,trashed);window.LireloApp?.syncTrash(trashed)}")
    code=code.replace("store(keyPrefs,prefs)}", "store(keyPrefs,prefs)}")
    code=code.replace("'This prototype stores your preferences, profile details, highlights, notes and bookmarks in this browser. Exported JSON files exclude the PDF and EPUB document files themselves.'", "'Your reading preferences and annotations stay in this browser. Your PDF and EPUB files live in Lirelo’s local document library. Use Download backup to save settings and annotations.'")
    code=code.replace("This preview does not have online accounts, passwords or cloud synchronisation. Your display name and preferences stay in this browser.", "This local version uses an on-device profile. Online accounts and multi-device synchronisation are not enabled.")
    code=code.replace("Demo books do not count as finished until their reading progress reaches 100%.", "Books count as finished when reading progress reaches 100%.")
    code=code.replace("'Restore book'", "'Restore book'")
    code=code.replace('const sideHelp=`', 'const sideHelp=()=>`')
    code=code.replace('${sideHelp}</div>`}', '${sideHelp()}</div>`}')
    code=code.replace('This prototype stores your preferences, profile details, highlights, notes and bookmarks in this browser. Exported JSON files exclude the PDF and EPUB document files themselves.', 'Your reading preferences and annotations stay in this browser. Imported documents stay in your local library. JSON exports contain your settings and annotations, but not the PDF and EPUB files.')
    code=code.replace('Restore a book to your library or remove its preview record.', 'Restore a book or remove its file permanently.')
    code=code.replace('In this review, Trash collects books removed from the on-screen library.', 'Trash holds books removed from your library.')
    code=code.replace('The preview record will no longer appear in Trash. PDF and EPUB files remain in the local library until permanent deletion.', 'This permanently removes the book file from your local library.')
    code=code.replace('Permanently delete this book and its local file? PDF and EPUB files remain in the local library until permanent deletion.', 'Permanently delete this book and its local file?')
    code=code.replace('Permanently remove all books and files in Trash? PDF and EPUB files remain in the local library until permanent deletion.', 'Permanently delete every book and file in Trash?')
    code=code.replace('Your reading, all together.', 'Your reading, all together.')
    code=code.replace('Data and privacy', 'Data and privacy')
    code=code.replace('This removes saved reading progress, highlights, notes and bookmarks.', 'This clears local reading progress, highlights, notes and bookmarks.')
    code=code.replace('Sample books', 'Books in library')
    code=code.replace('a local workspace', 'a local workspace')
    code=code.replace('This preview does not delete your original PDF or EPUB files.', 'Books remain on your device until you permanently remove them.')
    code=code.replace('The preview record will no longer appear in Trash.', 'Permanently delete this book and its local file?')
    code=code.replace('This removes all trashed preview records.', 'Permanently remove all books and files in Trash?')
    code=code.replace('Removed from your preview library', 'Removed from your library')
    code=code.replace('This JSON file excludes PDF and EPUB document binaries, the standalone engine sample document assets and connected account data.', 'This JSON backup excludes PDF and EPUB documents. Preserve your original files separately.')
    code=code.replace('This removes the standalone preview’s saved reading progress', 'This removes saved reading progress')
    code=code.replace('Your control the local information in this prototype.', 'You control your local information.')
    code=code.replace('You control the local information in this prototype.', 'You control your local information.')
    code=code.replace("trashed.splice(i,1);window.LireloApp?.removeForever(id);persistTrash();render();lib.toast('Book permanently removed.');", "trashed.splice(i,1);window.LireloApp?.removeForever(id);persistTrash();render();lib.toast('Book permanently removed.')")
    code=code.replace("const removed=trashed.splice(0);removed.forEach(b=>window.LireloApp?.removeForever(b.id));persistTrash();render();lib.toast('Trash emptied.');", "const removed=trashed.splice(0);removed.forEach(b=>window.LireloApp?.removeForever(b.id));persistTrash();render();lib.toast('Trash emptied.');")

    code=code.replace("Original PDF and EPUB files remain untouched.", "PDF and EPUB files remain in the local library until permanent deletion.")
    code=code.replace("trashed.splice(i,1);window.LireloApp?.removeForever(id);persistTrash();render();lib.toast('Book permanently removed.');", "trashed.splice(i,1);window.LireloApp?.removeForever(id);persistTrash();render();lib.toast('Book permanently removed.')")
    code=code.replace("const removed=trashed.splice(0);removed.forEach(b=>window.LireloApp?.removeForever(b.id));persistTrash();render();lib.toast('Trash emptied.');", "const gone=trashed.splice(0);gone.forEach(b=>window.LireloApp?.removeForever(b.id));persistTrash();render();lib.toast('Trash emptied.');")
    code=code.replace("trashed.splice(i,1);persistTrash();render();lib.toast('Book removed from Trash.')", "trashed.splice(i,1);window.LireloApp?.removeForever(id);persistTrash();render();lib.toast('Book permanently removed.')")
    code=code.replace("trashed.splice(0);persistTrash();render();lib.toast('Trash emptied.')", "const removed=trashed.splice(0);removed.forEach(b=>window.LireloApp?.removeForever(b.id));persistTrash();render();lib.toast('Trash emptied.')")
    return code

html,count=re.subn(r'<script(?:\s[^>]*)?>(.*?)</script>',replace_script,html,flags=re.S|re.I)
assert count==7,count
# Runtime library bridge must be ready before the UI handlers run.
html=html.replace('<script src="/assets/script-0.js"></script>', '<script src="/assets/bridge.js"></script>\n<script src="/assets/script-0.js"></script>',1)
html=html.replace('Complete Interactive Workspace','Lirelo Reading Workspace')
(ROOT/'index.html').write_text(html)
print('Wrote',len(html),'chars',len(styles),'styles and',len(scripts)-1,'scripts')
