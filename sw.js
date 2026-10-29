/* Slovník Service Worker — v6.40
   Cache-Name ist an die App-Version gekoppelt: jeder Versionssprung in
   index.html (const VER) muss hier in CACHE_VER nachgezogen werden, dann
   wird der alte Cache beim nächsten activate automatisch gelöscht.
   WICHTIG bei künftigen Änderungen: CACHE_VER IMMER zusammen mit VER in
   index.html hochzählen — sonst liefert der SW weiter alten Code aus. */
const CACHE_VER='slovnik-v6.40';

/* Fest gecachte App-Shell-Dateien (Icons ändern sich praktisch nie). */
const CACHE_FIRST=['icon-192.png','icon-512.png'];

self.addEventListener('install',e=>{
  /* Jede Datei einzeln vorab cachen: fehlt eine (z. B. ein Icon), scheitert nur sie
     und nicht mehr das gesamte Vorab-Caching wie bei cache.addAll() (seit v6.40). */
  e.waitUntil(
    caches.open(CACHE_VER).then(c=>Promise.allSettled(
      ['./','./index.html','./manifest.json',...CACHE_FIRST].map(u=>c.add(u))
    ))
  );
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE_VER).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

/* Banner in index.html schickt das, wenn der Nutzer auf "Aktualisieren" tippt. */
self.addEventListener('message',e=>{
  if(e.data==='SKIP_WAITING')self.skipWaiting();
});

self.addEventListener('fetch',e=>{
  const req=e.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return; // externe Requests (MyMemory-API) unangetastet lassen

  const isCacheFirst=CACHE_FIRST.some(f=>url.pathname.endsWith(f));

  if(isCacheFirst){
    e.respondWith(
      caches.match(req).then(cached=>cached||fetch(req).then(res=>{
        if(res.ok){const copy=res.clone();caches.open(CACHE_VER).then(c=>c.put(req,copy));}
        return res;
      }))
    );
    return;
  }

  /* Network-first für alles andere: index.html, manifest.json und die
     Sprachpaket-JSONs (lang_*.json, auch mit Leerzeichen-Fallback, siehe
     fetchRelative() in index.html). Online = immer frischer Stand, offline
     = letzter gecachter Stand. Verhindert, dass man nach einem manuellen
     Deploy auf altem Code hängen bleibt. */
  e.respondWith(
    fetch(req).then(res=>{
      if(res.ok){const copy=res.clone();caches.open(CACHE_VER).then(c=>c.put(req,copy));} // 404 & Co. nicht cachen (seit v6.40)
      return res;
    }).catch(()=>caches.match(req).then(cached=>cached||caches.match('./index.html')))
  );
});
