// TesourariaSys — Service Worker
// Estratégia: cache-first com stale-while-revalidate.
// O GitHub Pages serve os arquivos com Cache-Control: max-age=600 (10 min),
// então o cache-first garante funcionamento offline e o revalidate em segundo
// plano mantém o app atualizado sem travar o carregamento.

const CACHE_NAME = 'tesourariasys-v1';
const ARQUIVOS_CACHE = [
  './tesourariasys.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ARQUIVOS_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(
        nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Nunca interceptar chamadas à API do GitHub — precisam ir sempre à rede.
  if (req.url.includes('api.github.com')) return;

  event.respondWith(
    caches.match(req).then((cachedResponse) => {
      const fetchPromise = fetch(req)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      // cache-first: responde do cache imediatamente se existir,
      // e atualiza o cache em segundo plano (stale-while-revalidate).
      return cachedResponse || fetchPromise;
    })
  );
});
