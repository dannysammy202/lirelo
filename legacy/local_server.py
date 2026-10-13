#!/usr/bin/env python3
"""Lirelo local-first reading app. Serves UI and a persistent PDF/EPUB engine.
Dependencies: pymupdf. Documents stay on the machine and the server binds to loopback.
"""
from __future__ import annotations
import base64
import hashlib
import io
import json
import mimetypes
import os
import re
import sqlite3
import threading
import zipfile
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit
import fitz

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get('LIRELO_DATA_DIR',str(ROOT/'data'))).resolve()
DOC_DIR = DATA_DIR/'books'
DB_PATH = DATA_DIR/'library.sqlite3'
PORT = int(os.environ.get('LIRELO_PORT','8765'))
MAX_BYTES = 60 * 1024 * 1024
LOCK = threading.RLock()
LAYOUT = {}


def init_db():
    DOC_DIR.mkdir(parents=True,exist_ok=True)
    with connect() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS books (
            id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE, file_name TEXT NOT NULL,
            title TEXT NOT NULL, author TEXT NOT NULL, format TEXT NOT NULL,
            pages INTEGER NOT NULL, toc TEXT NOT NULL, publisher TEXT NOT NULL DEFAULT '',
            year TEXT NOT NULL DEFAULT '', collection TEXT NOT NULL DEFAULT 'Personal',
            tags TEXT NOT NULL DEFAULT '[]', progress INTEGER NOT NULL DEFAULT 0,
            trashed INTEGER NOT NULL DEFAULT 0, added TEXT NOT NULL, file_size INTEGER NOT NULL
        )''')
        db.commit()


def connect():
    db=sqlite3.connect(DB_PATH,timeout=30)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA busy_timeout=30000')
    return db


def fail(message,status=400):
    return status,{'error':str(message)}


def book_row(row):
    d=dict(row)
    d['tags']=json.loads(d.get('tags') or '[]')
    d['toc']=json.loads(d.get('toc') or '[]')
    d['cover']='uploaded'
    d['added']=datetime.fromisoformat(d['added']).timestamp()
    d['trashed']=bool(d['trashed'])
    d['progress']=min(100,max(0,d['progress']))
    return d


def get_book(key):
    with LOCK,connect() as db:
        row=db.execute('SELECT * FROM books WHERE id=?',(key,)).fetchone()
    if row is None: raise ValueError('Book not found in the local library.')
    return book_row(row)


def toc_of(doc):
    toc=[{'depth':min(depth,5),'title':title.strip(),'page':max(1,page)}
         for depth,title,page in doc.get_toc(simple=True) if title.strip()]
    if not toc and doc.page_count:
        toc=[{'depth':1,'title':f'Page {page}','page':page}
             for page in range(1,doc.page_count+1,max(1,doc.page_count//8))]
    return toc


def read_doc(key,size=None,face=None):
    book=get_book(key)
    suffix=book['format']
    raw=(DOC_DIR/(key+'.'+suffix)).read_bytes()
    if suffix=='epub':
        value=LAYOUT.get(key,{})
        f=face or value.get('fontface','original')
        s=size or value.get('font',14)
        if f!='original':raw=epub_font_copy(raw,f)
        doc=fitz.open(stream=raw,filetype='epub')
        doc.layout(width=620,height=830,fontsize=s)
    else:
        doc=fitz.open(stream=raw,filetype='pdf')
    return book,doc


def epub_font_copy(raw,face):
    family='serif' if face=='serif' else 'sans-serif'
    injection=('<style type="text/css">body, p, div, span, li, blockquote, h1, h2, h3, h4, h5, h6 '
               '{font-family:'+family+' !important}</style>')
    src=io.BytesIO(raw)
    dst=io.BytesIO()
    with zipfile.ZipFile(src) as origin,zipfile.ZipFile(dst,'w') as archive:
        for entry in origin.infolist():
            content=origin.read(entry.filename)
            if entry.filename.lower().endswith(('.xhtml','.html','.htm')):
                try:
                    html=content.decode('utf-8')
                    if re.search(r'</head\s*>',html,re.I):
                        html=re.sub(r'</head\s*>',injection+'</head>',html,count=1,flags=re.I)
                    else:
                        html=re.sub(r'<body',injection+'<body',html,count=1,flags=re.I)
                    content=html.encode('utf-8')
                except UnicodeDecodeError:pass
            archive.writestr(entry,content)
    return dst.getvalue()


def import_doc(raw,filename):
    if not raw or len(raw)>MAX_BYTES:raise ValueError('Choose a document under 60 MB.')
    name=Path(filename.replace('\\','/')).name[:180]
    ext=Path(name).suffix.lower()
    if ext not in ('.pdf','.epub'):raise ValueError('Choose a PDF or EPUB document.')
    digest=hashlib.sha256(raw).hexdigest()
    key='book-'+digest[:24]
    try:
        d=fitz.open(stream=raw,filetype=ext[1:])
        if d.needs_pass:raise ValueError('Password-protected documents are not supported.')
        if d.is_reflowable:d.layout(width=620,height=830,fontsize=14)
        title=(d.metadata.get('title') or '').strip() or Path(name).stem
        author=(d.metadata.get('author') or '').strip() or 'Unknown author'
        pages=d.page_count
        toc=toc_of(d)
        publisher=(d.metadata.get('producer') or '').strip()[:180]
        d.close()
    except ValueError:raise
    except Exception as err:raise ValueError('This document is invalid or unreadable.') from err
    now=datetime.now(timezone.utc).isoformat()
    with LOCK,connect() as db:
        row=db.execute('SELECT * FROM books WHERE fingerprint=?',(digest,)).fetchone()
        if row is not None:
            if row['trashed']:
                db.execute('UPDATE books SET trashed=0 WHERE id=?',(row['id'],))
                db.commit()
            return get_book(key)
        path=DOC_DIR/(key+ext)
        # Atomically replace into library after validation.
        temp=DOC_DIR/(key+'.tmp')
        temp.write_bytes(raw)
        os.replace(temp,path)
        db.execute('''INSERT INTO books(id,fingerprint,file_name,title,author,format,pages,toc,publisher,collection,tags,added,file_size)
                      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                   (key,digest,name,title[:200],author[:200],ext[1:],pages,json.dumps(toc),publisher,'Personal','[]',now,len(raw)))
        db.commit()
    return get_book(key)


def meta(key):
    b,doc=read_doc(key)
    try:
        mode=LAYOUT.get(key,{})
        return {'id':key,'name':b['file_name'],'format':b['format'],'pages':doc.page_count,
                'toc':toc_of(doc),'reflowable':bool(doc.is_reflowable),
                'font':mode.get('font',14),'fontface':mode.get('fontface','original')}
    finally:doc.close()


def page(key,n):
    b,doc=read_doc(key)
    try:
        if not 1<=n<=doc.page_count:raise ValueError('Page outside document.')
        p=doc[n-1]
        scale=min(1.9,max(1.3,1350/max(p.rect.width,1)))
        bitmap=p.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False,colorspace=fitz.csRGB)
        img='data:image/png;base64,'+base64.b64encode(bitmap.tobytes('png')).decode('ascii')
        spans=[]
        for block in p.get_text('dict')['blocks']:
            if block.get('type')!=0:continue
            for line in block.get('lines',[]):
                for sp in line.get('spans',[]):
                    content=sp.get('text','')
                    if not content.strip():continue
                    x0,y0,x1,y1=sp['bbox']
                    spans.append({'x':round(x0,2),'y':round(y0,2),
                                  'w':round(max(0,x1-x0),2),'h':round(max(1,y1-y0),2),
                                  'text':content,'size':round(sp.get('size',12),2)})
        return {'page':n,'width':round(p.rect.width,2),'height':round(p.rect.height,2),
                'image':img,'spans':spans,'hasText':bool(spans)}
    finally:doc.close()


def search(key,term):
    b,doc=read_doc(key)
    try:
        matches=[]
        if term:
            for i in range(doc.page_count):
                p=doc[i]
                rectangles=p.search_for(term)
                if rectangles:
                    content=' '.join(p.get_text('text').split())
                    idx=content.lower().find(term.lower())
                    snippet=content[max(0,idx-38):idx+len(term)+65] if idx>=0 else content[:100]
                    matches.append({'page':i+1,'snippet':snippet,
                                    'rects':[[r.x0,r.y0,r.x1,r.y1] for r in rectangles[:12]],
                                    'width':p.rect.width,'height':p.rect.height})
                if len(matches)>=80:break
        return {'results':matches,'count':len(matches)}
    finally:doc.close()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):
        super().__init__(*args,directory=str(ROOT),**kwargs)
    def end_headers(self):
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Cache-Control','no-store' if self.path.startswith('/api/') else 'max-age=300')
        super().end_headers()
    def log_message(self,fmt,*args):
        print('%s - %s'%(self.address_string(),fmt%args),flush=True)
    def send_json(self,code,data):
        raw=json.dumps(data,ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def do_GET(self):
        u=urlsplit(self.path);path=u.path;q=parse_qs(u.query)
        try:
            if path=='/api/health':return self.send_json(200,{'ok':True,'mode':'local','version':'1.0'})
            if path=='/api/books':
                with LOCK,connect() as db:
                    rows=db.execute('SELECT * FROM books ORDER BY added DESC').fetchall()
                return self.send_json(200,{'books':[book_row(r) for r in rows]})
            if path=='/api/meta':return self.send_json(200,meta(q['id'][0]))
            if path=='/api/page':return self.send_json(200,page(q['id'][0],int(q.get('page',['1'])[0])))
            if path=='/api/search':return self.send_json(200,search(q['id'][0],q.get('q',[''])[0].strip()[:100]))
            if path=='/api/reflow':
                key=q['id'][0]
                b=get_book(key)
                if b['format']=='epub':
                    size=min(24,max(9,int(q.get('size',['14'])[0])))
                    face=q.get('font',['original'])[0]
                    LAYOUT[key]={'font':size,'fontface':face if face in ('original','serif','sans') else 'original'}
                return self.send_json(200,meta(key))
            if path=='/api/book-file':
                b=get_book(q['id'][0]);raw=(DOC_DIR/(b['id']+'.'+b['format'])).read_bytes()
                self.send_response(200);self.send_header('Content-Type','application/pdf' if b['format']=='pdf' else 'application/epub+zip')
                self.send_header('Content-Disposition','attachment; filename="'+b['file_name'].replace('"','')+'"')
                self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw);return
            if path.startswith('/api/'):
                return self.send_json(404,{'error':'Unknown local API endpoint.'})
        except (ValueError,IndexError,KeyError,FileNotFoundError,sqlite3.Error) as err:
            return self.send_json(400,{'error':str(err)})
        return super().do_GET()
    def do_POST(self):
        u=urlsplit(self.path)
        try:
            if u.path=='/api/books/import':
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=MAX_BYTES:return self.send_json(413,{'error':'Choose a PDF or EPUB under 60 MB.'})
                filename=unquote(self.headers.get('X-Lirelo-Filename','document.pdf'))
                book=import_doc(self.rfile.read(length),filename)
                return self.send_json(200,{'book':book})
            return self.send_json(404,{'error':'Unknown endpoint.'})
        except (ValueError,IndexError,KeyError,sqlite3.Error) as err:
            return self.send_json(400,{'error':str(err)})
    def do_PATCH(self):
        u=urlsplit(self.path)
        if not u.path.startswith('/api/books/'):
            return self.send_json(404,{'error':'Unknown endpoint.'})
        key=u.path.rsplit('/',1)[-1]
        try:
            get_book(key)
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=32768:raise ValueError('Invalid metadata update.')
            data=json.loads(self.rfile.read(length))
            updates={}
            for name in ('title','author','collection'):
                if name in data:updates[name]=str(data[name]).strip()[:200]
            if 'tags' in data:updates['tags']=json.dumps([str(x)[:50] for x in data['tags'][:30]])
            if 'progress' in data:updates['progress']=min(100,max(0,int(data['progress'])))
            if 'trashed' in data:updates['trashed']=1 if data['trashed'] else 0
            if updates:
                columns=', '.join(k+'=?' for k in updates)
                with LOCK,connect() as db:
                    db.execute('UPDATE books SET '+columns+' WHERE id=?',(*updates.values(),key))
                    db.commit()
            return self.send_json(200,{'book':get_book(key)})
        except (ValueError,TypeError,KeyError,sqlite3.Error) as err:
            return self.send_json(400,{'error':str(err)})
    def do_DELETE(self):
        u=urlsplit(self.path)
        if not u.path.startswith('/api/books/'):
            return self.send_json(404,{'error':'Unknown endpoint.'})
        key=u.path.rsplit('/',1)[-1]
        try:
            book=get_book(key)
            if not book['trashed']:raise ValueError('Move the book to Trash before permanent removal.')
            with LOCK,connect() as db:
                db.execute('DELETE FROM books WHERE id=?',(key,));db.commit()
            (DOC_DIR/(key+'.'+book['format'])).unlink(missing_ok=True)
            return self.send_json(200,{'deleted':key})
        except (ValueError,sqlite3.Error) as err:
            return self.send_json(400,{'error':str(err)})

if __name__=='__main__':
    init_db()
    print(f'Lirelo local app: http://127.0.0.1:{PORT}',flush=True)
    print('Documents stored at:',DOC_DIR,flush=True)
    ThreadingHTTPServer(('127.0.0.1',PORT),Handler).serve_forever()
