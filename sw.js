// TesourariaSys — Service Worker
// Estratégia: NETWORK-FIRST para os arquivos principais do app (html/css/js/
// manifest) — sempre tenta buscar a versão mais nova na rede primeiro, e só
// usa o cache como reserva se estiver offline. Isso evita o problema de o
// app ficar "preso" numa versão antiga depois de um deploy (o que já
// aconteceu antes com o Service Worker do ChequeSys).
//
// IMPORTANTE: sempre que este arquivo for reimplantado, o navegador detecta
// a mudança de bytes, reinstala o Service Worker e limpa o cache antigo
// automaticamente (activate abaixo apaga qualquer CACHE_NAME diferente do
// atual). Se um dia parar de atualizar de novo, aumente o número da
// CACHE_NAME (ex: v2 -> v3) pra forçar a troca.

const CACHE_NAME = 'tesourariasys-v3';
const ARQUIVOS_CACHE = [
  './tesourariasys.html',
  './styles.css',
  './script.js',
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
    fetch(req)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const clone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return networkResponse;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
