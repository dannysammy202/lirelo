"""Browser smoke test with an in-memory document because managed Chromium blocks URL navigation.
API requests still exercise the actual local Python service through the host.
"""
import asyncio, json, re, sys, urllib.request
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parent
PORT=int(sys.argv[1]) if len(sys.argv)>1 else 8899
SCREEN=Path('/mnt/data/lirelo-qa-shots');SCREEN.mkdir(exist_ok=True)

def host_fetch(path,opts):
  data=opts.get('body')
  payload=data.encode('utf-8') if isinstance(data,str) else None
  url=f'http://127.0.0.1:{PORT}/'+str(path).lstrip('/')
  request=urllib.request.Request(url, data=payload,method=opts.get('method','GET'),headers=opts.get('headers',{}))
  try:
    with urllib.request.urlopen(request,timeout=20) as response:return {'ok':True,'status':response.status,'body':response.read().decode('utf8')}
  except urllib.error.HTTPError as e:return {'ok':False,'status':e.code,'body':e.read().decode('utf8')}

async def open_ui(browser, viewport, mobile=False):
  page=await browser.new_page(viewport=viewport,is_mobile=mobile,has_touch=mobile)
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  await page.expose_function('_hostFetch',host_fetch)
  markup=(ROOT/'index.html').read_text()
  markup=re.sub(r'<link rel="stylesheet"[^>]+>', '', markup)
  markup=re.sub(r'<script src="/assets/[^>]*></script>', '', markup)
  markup=re.sub(r'<link[^>]*fonts.googleapis[^>]*>', '', markup)
  markup=re.sub(r'<link[^>]*fonts.gstatic[^>]*>', '', markup)
  await page.set_content(markup,wait_until='domcontentloaded')
  await page.evaluate('''() => {const cache=new Map();Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:k=>cache.has(k)?cache.get(k):null,setItem:(k,v)=>cache.set(k,String(v)),removeItem:k=>cache.delete(k),key:i=>Array.from(cache.keys())[i]||null,clear:()=>cache.clear(),get length(){return cache.size}}});}''')
  for i in range(10):await page.add_style_tag(content=(ROOT/'assets'/f'style-{i}.css').read_text())
  await page.add_script_tag(content="""window.fetch=async function(path,opts){let response=await window._hostFetch(path,opts||{});return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json'}})};""")
  for i in (0,1,2,4,5,6):
    if i==0:await page.add_script_tag(content=(ROOT/'assets'/'bridge.js').read_text())
    await page.add_script_tag(content=(ROOT/'assets'/f'script-{i}.js').read_text())
  await page.evaluate('window.LireloApp.load()')
  await page.wait_for_timeout(750)
  return page,errors

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  page,errors=await open_ui(browser,{'width':1440,'height':900})
  print('loaded cards',await page.locator('.book-card').count(),'errors',errors[:5])
  await page.screenshot(path=str(SCREEN/'library.png'))
  if await page.locator('.book-card').count():
   await page.locator('.book-card .book-open').first.click()
   await page.wait_for_timeout(250)
   await page.screenshot(path=str(SCREEN/'details.png'))
   await page.locator('#detailsRead').click()
   await page.wait_for_timeout(1600)
   print('Reader pages',await page.locator('.rr-page-img').count(),'status',await page.locator('#rrPageLabel').inner_text())
   await page.screenshot(path=str(SCREEN/'reader.png'))
   await page.locator('#rrBack').click()
  await page.locator('[data-section="settings"]').first.click()
  await page.wait_for_timeout(200)
  print('Settings dark found',await page.locator('[data-f-pref="palette"][data-f-value="dark"]').count())
  await page.locator('[data-f-pref="palette"][data-f-value="dark"]').click()
  print('Theme',await page.evaluate('document.documentElement.dataset.lireloPalette'))
  await page.screenshot(path=str(SCREEN/'settings-dark.png'))
  mobile,errorsMobile=await open_ui(browser,{'width':390,'height':844},True)
  await mobile.screenshot(path=str(SCREEN/'library-mobile.png'))
  print('mobile cards',await mobile.locator('.book-card').count())
  print('JS errors',json.dumps(errors+errorsMobile))
  await browser.close()

if __name__=='__main__':asyncio.run(main())
