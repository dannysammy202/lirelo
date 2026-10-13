"""End-to-end local service tests using sample PDF, EPUB and scanned PDF."""
from pathlib import Path
import os, subprocess, tempfile, time, json, urllib.request, urllib.error
ROOT=Path(__file__).resolve().parent
def assertion(condition):
  if not condition:raise AssertionError('check failed')

with tempfile.TemporaryDirectory() as td:
  p=subprocess.Popen(['python',str(ROOT/'server.py')],env={**os.environ,'LIRELO_PORT':'8997','LIRELO_DATA_DIR':td},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  base='http://127.0.0.1:8997'
  tests=[]
  def api(path,method='GET',payload=None,headers=None):
    data=json.dumps(payload).encode() if isinstance(payload,dict) else payload
    req=urllib.request.Request(base+'/api/'+path,data=data,method=method,headers=headers or ({'Content-Type':'application/json'} if isinstance(payload,dict) else {}))
    with urllib.request.urlopen(req,timeout=25) as res:return json.load(res)
  def check(name,fn):
    fn();tests.append(name)
  try:
    for _ in range(40):
      try:api('health');break
      except Exception:time.sleep(.15)
    else:raise RuntimeError('local service failed to start')
    doc_ids=[]
    for fmt in ['pdf','epub']:
      raw=(ROOT/'samples'/f'example.{fmt}').read_bytes()
      b=api('books/import','POST',raw,{'X-Lirelo-Filename':f'example.{fmt}','Content-Type':'application/octet-stream'})['book']
      doc_ids.append(b['id'])
      check(fmt+' import',lambda:assertion(b['format']==fmt and b['pages']>0))
      meta=api('meta?id='+b['id'])
      check(fmt+' table of contents',lambda:assertion(len(meta['toc'])>0))
      page=api('page?id='+b['id']+'&page=1')
      check(fmt+' page image',lambda:assertion(page['image'].startswith('data:image/png;base64,') and page['width']>0))
      check(fmt+' selectable text',lambda:assertion(page['hasText'] and len(page['spans'])>0))
      hits=api('search?id='+b['id']+'&q=reading')
      check(fmt+' document search',lambda:assertion(hits['count']>0))
    # Build a true image-only PDF to verify scanned page behaviour without OCR.
    import fitz
    picture=fitz.Pixmap(fitz.csRGB,fitz.IRect(0,0,320,440),False)
    picture.clear_with(232)
    generated=fitz.open(); pg=generated.new_page(width=320,height=440)
    pg.insert_image(pg.rect,pixmap=picture)
    image_pdf=generated.tobytes();generated.close()
    scanned=api('books/import','POST',image_pdf,{'X-Lirelo-Filename':'scan.pdf','Content-Type':'application/octet-stream'})['book']
    scanpage=api('page?id='+scanned['id']+'&page=1')
    check('scanned PDF imagery',lambda:assertion(scanpage['image'].startswith('data:image/png;base64,')))
    check('scanned PDF has no fabricated text',lambda:assertion(scanpage['hasText']==False and len(scanpage['spans'])==0))
    check('scanned PDF search is empty',lambda:assertion(api('search?id='+scanned['id']+'&q=reading')['count']==0))
    epub=doc_ids[-1]
    meta=api('reflow?id='+epub+'&size=20&font=serif')
    check('EPUB reflow',lambda:assertion(meta['font']==20 and meta['fontface']=='serif'))
    check('EPUB reflow page',lambda:assertion(api('page?id='+epub+'&page=1')['width']>0))
    pdf=doc_ids[0]
    book=api('books/'+pdf,'PATCH',{'progress':42,'tags':['Test','Design'],'collection':'Learning'})['book']
    check('metadata saved',lambda:assertion(book['progress']==42 and book['tags']==['Test','Design'] and book['collection']=='Learning'))
    new=api('books')['books']
    check('persistent list',lambda:assertion(len(new)==3))
    api('books/'+pdf,'PATCH',{'trashed':True})
    check('move to trash',lambda:assertion(next(b for b in api('books')['books'] if b['id']==pdf)['trashed']))
    api('books/'+pdf,'PATCH',{'trashed':False})
    check('restore from trash',lambda:assertion(next(b for b in api('books')['books'] if b['id']==pdf)['trashed'] is False))
    api('books/'+pdf,'PATCH',{'trashed':True})
    api('books/'+pdf,'DELETE')
    check('permanent deletion',lambda:assertion(all(b['id']!=pdf for b in api('books')['books'])))
    # Restart should reload book binary and metadata from disk.
    p.terminate();p.wait(timeout=5)
    p=subprocess.Popen(['python',str(ROOT/'server.py')],env={**os.environ,'LIRELO_PORT':'8997','LIRELO_DATA_DIR':td},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
    for _ in range(40):
      try:api('health');break
      except:time.sleep(.15)
    check('restart persistent documents',lambda:assertion(api('meta?id='+epub)['pages']>0))
    check('restart persistent library',lambda:assertion(len(api('books')['books'])==2))
    print(json.dumps({'passed':len(tests),'checks':tests},indent=2))
  finally:
    p.terminate()
    try:p.wait(timeout=5)
    except:p.kill()

