const VERSION='phone-ledger-shell-1.0.1';
const FILES=['./','./index.html','./style.css','./app.js','./core.js','./db.js','./manifest.webmanifest','./icons/apple-touch-icon.png','./icons/icon-192.png','./icons/icon-512.png','./icons/icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(VERSION).then(cache=>cache.addAll(FILES))));
// Activate only when old windows close; do not mix an open old UI with new code.
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('phone-ledger-shell-')&&k!==VERSION).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||url.search)return;event.respondWith(caches.open(VERSION).then(async cache=>{const hit=await cache.match(event.request,{ignoreSearch:false});if(hit)return hit;return fetch(event.request)}))});
