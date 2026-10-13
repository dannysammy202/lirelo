"""PWA icon generated from Lirelo's approved Imprint logo. No substitute artwork."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs,urlsplit
from functools import lru_cache
import base64,struct,zlib

# Exact approved two-part Imprint silhouette, used only as an alpha mask.
APPROVED_MARK=(
    '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'
)

def _png_chunk(kind,data):
    return struct.pack(">I",len(data))+kind+data+struct.pack(">I",zlib.crc32(kind+data)&0xffffffff)

@lru_cache(maxsize=1)
def _logo_alpha():
    source=base64.b64decode(APPROVED_MARK)
    if source[:8]!=b"\x89PNG\r\n\x1a\n":
        raise ValueError("Invalid logo PNG")
    offset=8;idat=[];w=h=None;bpp=4
    while offset<len(source):
        length=struct.unpack_from(">I",source,offset)[0]
        kind=source[offset+4:offset+8]
        data=source[offset+8:offset+8+length]
        offset+=12+length
        if kind==b"IHDR":
            w,h,bitdepth,colortype=struct.unpack_from(">IIBB",data,0)
            if bitdepth!=8 or colortype!=6:raise ValueError("Expected RGBA approved logo")
        elif kind==b"IDAT":idat.append(data)
        elif kind==b"IEND":break
    raw=zlib.decompress(b"".join(idat))
    stride=w*bpp;pos=0;before=bytearray(stride);alpha=bytearray(w*h)
    for y in range(h):
        filt=raw[pos];pos+=1
        row=bytearray(raw[pos:pos+stride]);pos+=stride
        for i in range(stride):
            left=row[i-bpp] if i>=bpp else 0
            up=before[i]
            ul=before[i-bpp] if i>=bpp else 0
            if filt==1:row[i]=(row[i]+left)&255
            elif filt==2:row[i]=(row[i]+up)&255
            elif filt==3:row[i]=(row[i]+((left+up)//2))&255
            elif filt==4:
                p=left+up-ul;da=abs(p-left);db=abs(p-up);dc=abs(p-ul)
                predictor=left if da<=db and da<=dc else (up if db<=dc else ul)
                row[i]=(row[i]+predictor)&255
            elif filt!=0:raise ValueError("Unsupported PNG filter")
        alpha[y*w:(y+1)*w]=row[3::4]
        before=row
    return w,h,alpha

@lru_cache(maxsize=4)
def _icon(size):
    width,height,mask=_logo_alpha()
    # Approved treatment: white original Imprint silhouette on lavender tile.
    bg=(117,103,141)
    height_out=round(size*0.67)
    width_out=round(height_out*width/height)
    x0=(size-width_out)//2;y0=(size-height_out)//2
    rows=bytearray()
    for y in range(size):
        rows.append(0)
        sy=min(height-1,max(0,int((y-y0)*height/height_out))) if y0<=y<y0+height_out else -1
        for x in range(size):
            if sy>=0 and x0<=x<x0+width_out:
                sx=min(width-1,max(0,int((x-x0)*width/width_out)))
                coverage=mask[sy*width+sx]
                rows.extend((base+(255-base)*coverage//255 for base in bg))
            else:rows.extend(bg)
    signature=b"\x89PNG\r\n\x1a\n"
    header=struct.pack(">IIBBBBB",size,size,8,2,0,0,0)
    return signature+_png_chunk(b"IHDR",header)+_png_chunk(b"IDAT",zlib.compress(bytes(rows),9))+_png_chunk(b"IEND",b"")

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            requested=parse_qs(urlsplit(self.path).query).get("size",["192"])[0]
            size=int(requested)
            if size not in (64,180,192,512):raise ValueError("Invalid icon size")
            result=_icon(size)
            self.send_response(200)
            self.send_header("Content-Type","image/png")
            self.send_header("Content-Length",str(len(result)))
            self.send_header("Cache-Control","public, max-age=604800, immutable")
            self.end_headers();self.wfile.write(result)
        except (ValueError,TypeError):
            self.send_response(400);self.end_headers()
