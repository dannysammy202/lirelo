/* Lirelo PWA: only public app-shell files, never private books or authenticated APIs. */
const VERSION='lirelo-shell-v10';;
const ASSETS=['/','/index.html','/manifest.webmanifest','/assets/cloud.css','/assets/offline.js','/assets/reader-enhancements.css','/assets/device-shell.css','/assets/device-shell.js','/assets/mobile-reader.css','/assets/bridge.js','/assets/script-0.js','/assets/script-1.js','/assets/script-2.js','/assets/script-4.js','/assets/script-5.js','/assets/script-6.js','/assets/lirelo-imprint.png','/assets/lirelo-app-icon.svg','/assets/lirelo-app-icon-192.png','/assets/lirelo-app-icon-512.png',...Array.from({length:10},(_,i)=>'/assets/style-'+i+'.css')];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(VERSION).then(async cache=>{
  for(const url of ASSETS){try{const res=await fetch(url,{cache:'reload'});if(res.ok)await cache.put(url,res)}catch{}}
 }).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('lirelo-shell-')&&key!==VERSION).map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 const req=event.request,url=new URL(req.url);
 if(req.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/')||req.headers.has('Authorization'))return;
 if(req.mode==='navigate'){
  event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put('/index.html',copy))}return res}).catch(async()=>await caches.match('/index.html')||Response.error()));
  return;
 }
 if(!ASSETS.includes(url.pathname))return;
 event.respondWith(fetch(req).then(res=>{if(res.ok){const copy=res.clone();caches.open(VERSION).then(c=>c.put(url.pathname,copy))}return res}).catch(async()=>await caches.match(url.pathname)||Response.error()));
});