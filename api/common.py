"""Authenticated, stateless PDF/EPUB rendering for Lirelo hosted on Vercel.
Every request validates the caller's Supabase access token and the book owner.
No service-role keys are required or used.
"""
from __future__ import annotations
import base64, io, json, os, re, urllib.error, urllib.parse, urllib.request, zipfile
import fitz

SUPABASE_URL = os.environ.get('LIRELO_SUPABASE_URL','https://phkejehwadwzxvtjmesq.supabase.co').rstrip('/')
PUBLIC_KEY = os.environ.get('LIRELO_SUPABASE_PUBLISHABLE_KEY','sb_publishable_xzsy4E_qPkJgZv88RLiuNQ_Ge_7TBf0')
MAX_DOWNLOAD = 52*1024*1024

def fetch(url, token, limit=MAX_DOWNLOAD):
    request=urllib.request.Request(url,headers={'apikey':PUBLIC_KEY,'Authorization':'Bearer '+token,'Accept':'application/json'})
    with urllib.request.urlopen(request,timeout=35) as response:
        declared=int(response.headers.get('content-length','0'))
        if declared>limit: raise ValueError('Book exceeds the supported cloud size limit.')
        data=response.read(limit+1)
    if len(data)>limit: raise ValueError('Book exceeds the supported cloud size limit.')
    return data

def owner_for(token):
    raw=fetch(SUPABASE_URL+'/auth/v1/user',token,30_000)
    user=json.loads(raw)
    if not user.get('id'): raise PermissionError('Sign in to read your books.')
    return user['id']

def get_book(book_id,token,uid):
    params=urllib.parse.urlencode({'id':'eq.'+book_id,'owner_id':'eq.'+uid,'select':'*'})
    data=json.loads(fetch(SUPABASE_URL+'/rest/v1/lirelo_books?'+params,token,150_000))
    if not data: raise FileNotFoundError('Book not found in your library.')
    return data[0]

def download_book(path,token,uid):
    if not path.startswith(uid+'/') or '..' in path or '\\' in path:raise PermissionError('Invalid private book path.')
    encoded=urllib.parse.quote(path,safe='/')
    return fetch(SUPABASE_URL+'/storage/v1/object/authenticated/lirelo-private/'+encoded,token)

def load_document(data,kind,size=14,face='original'):
    if kind not in ('pdf','epub'):raise ValueError('Unsupported document type.')
    if kind=='epub' and face in ('serif','sans'):
        family='serif' if face=='serif' else 'sans-serif'
        injection='<style>body,p,div,span,li,blockquote,h1,h2,h3,h4,h5,h6{font-family:'+family+' !important}</style>'
        source=io.BytesIO(data);output=io.BytesIO()
        with zipfile.ZipFile(source) as src,zipfile.ZipFile(output,'w') as dst:
            for item in src.infolist():
                body=src.read(item.filename)
                if item.filename.lower().endswith(('.xhtml','.html','.htm')):
                    try:
                        html=body.decode('utf-8')
                        if '</head>' in html.lower():html=re.sub(r'</head\s*>',injection+'</head>',html,count=1,flags=re.I)
                        else:html=re.sub(r'<body',injection+'<body',html,count=1,flags=re.I)
                        body=html.encode('utf-8')
                    except UnicodeDecodeError:pass
                dst.writestr(item,body)
        data=output.getvalue()
    doc=fitz.open(stream=data,filetype=kind)
    if doc.needs_pass:raise ValueError('Password-protected books are not supported.')
    if doc.is_reflowable:doc.layout(width=620,height=830,fontsize=size)
    return doc

def toc(doc):
    items=[{'depth':min(depth,5),'title':title.strip(),'page':max(1,page)} for depth,title,page in doc.get_toc(simple=True) if title.strip()]
    if not items and doc.page_count:items=[{'depth':1,'title':f'Page {n}','page':n} for n in range(1,doc.page_count+1,max(1,doc.page_count//8))]
    return items

def metadata(doc,id,kind,size=14,face='original'):
    return dict(id=id,name=id,format=kind,pages=doc.page_count,toc=toc(doc),reflowable=bool(doc.is_reflowable),font=size,fontface=face)

def inspect(data,kind):
    doc=load_document(data,kind)
    try:
        meta=doc.metadata or {}
        return dict(title=(meta.get('title') or '').strip()[:200],author=(meta.get('author') or '').strip()[:200] or 'Unknown author',pages=doc.page_count,toc=toc(doc),publisher=(meta.get('producer') or '').strip()[:160])
    finally:doc.close()

def page_data(doc,n):
    if n<1 or n>doc.page_count:raise ValueError('Page outside document.')
    page=doc[n-1]
    scale=min(1.8,max(1.25,1150/max(page.rect.width,1)))
    pm=page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False,colorspace=fitz.csRGB)
    image='data:image/jpeg;base64,'+base64.b64encode(pm.tobytes('jpeg',jpg_quality=77)).decode('ascii')
    spans=[]
    for block in page.get_text('dict')['blocks']:
        if block.get('type')!=0:continue
        for line in block.get('lines',[]):
            for span in line.get('spans',[]):
                txt=span.get('text','')
                if not txt.strip():continue
                x0,y0,x1,y1=span['bbox']
                spans.append(dict(x=round(x0,2),y=round(y0,2),w=round(max(0,x1-x0),2),h=round(max(1,y1-y0),2),text=txt,size=round(span.get('size',12),2)))
    return dict(page=n,width=round(page.rect.width,2),height=round(page.rect.height,2),image=image,spans=spans,hasText=bool(spans))

def search(doc,term):
    found=[]
    if term:
        for i in range(min(doc.page_count,3000)):
            page=doc[i]
            boxes=page.search_for(term)
            if boxes:
                txt=' '.join(page.get_text('text').split())
                start=txt.lower().find(term.lower())
                snip=txt[max(0,start-38):start+len(term)+65] if start>=0 else txt[:100]
                found.append(dict(page=i+1,snippet=snip,rects=[[r.x0,r.y0,r.x1,r.y1] for r in boxes[:12]],width=page.rect.width,height=page.rect.height))
            if len(found)>=80:break
    return {'results':found,'count':len(found)}

def execute(handler,action):
    try:
        length=int(handler.headers.get('content-length','0'))
        if length>0:raise ValueError('Use private Supabase Storage for document uploads.')
        auth=handler.headers.get('Authorization','')
        if not auth.startswith('Bearer '):raise PermissionError('Sign in to access your library.')
        token=auth[7:]
        uid=owner_for(token)
        query=urllib.parse.parse_qs(urllib.parse.urlsplit(handler.path).query)
        param=lambda n,default='':query.get(n,[default])[0]
        if action=='inspect':
            path=param('path')
            kind=path.rsplit('.',1)[-1].lower()
            if kind not in ('pdf','epub'):raise ValueError('Choose a PDF or EPUB file.')
            result=inspect(download_book(path,token,uid),kind)
        else:
            id=param('id')
            book=get_book(id,token,uid)
            kind=book['format']
            size=min(22,max(10,int(param('size','14'))))
            face=param('font','original')
            if face not in ('original','serif','sans'):face='original'
            content=download_book(book['storage_path'],token,uid)
            doc=load_document(content,kind,size,face)
            try:
                if action in ('meta','reflow'):result=metadata(doc,id,kind,size,face)
                elif action=='page':result=page_data(doc,int(param('page','1')))
                elif action=='batch':
                    first=int(param('start','1'))
                    count=int(param('count','3'))
                    if first<1 or first>doc.page_count or count<1 or count>3:
                        raise ValueError('Invalid offline page range.')
                    result={'pages':[page_data(doc,n) for n in range(first,min(first+count,doc.page_count+1))]}
                elif action=='search':result=search(doc,param('q')[:140])
                else:raise FileNotFoundError('Unknown document endpoint.')
            finally:doc.close()
        status=200
    except PermissionError as error:status,result=401,{'error':str(error)}
    except FileNotFoundError as error:status,result=404,{'error':str(error)}
    except (ValueError,urllib.error.HTTPError,urllib.error.URLError,fitz.FileDataError,zipfile.BadZipFile) as error:
        status,result=400,{'error':str(error)[:350]}
    except Exception:
        status,result=500,{'error':'Unable to process the document. Please try again.'}
    encoded=json.dumps(result,ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type','application/json; charset=utf-8')
    handler.send_header('Cache-Control','private, no-store')
    handler.send_header('X-Content-Type-Options','nosniff')
    handler.send_header('Content-Length',str(len(encoded)))
    handler.end_headers()
    handler.wfile.write(encoded)