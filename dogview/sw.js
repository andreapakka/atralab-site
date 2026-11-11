/* DogView V1.1 - cache offline limitata a /dogview/.
   Nessuna immagine utente viene salvata in cache dal Service Worker. */
const CACHE = 'dogview-shell-v1-1';
const SHELL = [
  '/dogview/', '/dogview/index.html', '/dogview/config.js',
  '/dogview/vision.js', '/dogview/photo.js', '/dogview/cloud.js',
  '/dogview/style.css', '/css/style.css', '/css/internal.css'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('dogview-shell-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Offline: DogView mantiene l'elaborazione locale anche quando il controllo accessi
  // condiviso non può raggiungere il server. Nessun file comune viene modificato.
  if (url.pathname === '/js/include.js') {
    event.respondWith(fetch(req, {cache: 'no-store'}).catch(() => new Response('/* DogView: shell offline */', {
      headers: {'Content-Type':'text/javascript; charset=utf-8'}
    })));
    return;
  }
  if (!SHELL.includes(url.pathname)) return;
  event.respondWith(fetch(req).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy)));
    }
    return response;
  }).catch(() => caches.match(req).then(cached => cached || (req.mode === 'navigate'
    ? caches.match('/dogview/index.html') : Response.error()))));
});
