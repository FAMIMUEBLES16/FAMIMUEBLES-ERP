const CACHE = 'famimuebles-erp-v42';
const CORE = ['./', './index.html', './css/main.css?v=41', './js/app-v3.js?v=130', './js/modules/dashboard-v3.js?v=23', './js/modules/facturacion.js?v=23', './js/services/product-service.js?v=18', './js/data/storage.js?v=18', './js/data/store.js?v=18', './js/router.js?v=18', './js/modules/proveedores.js?v=18', './js/modules/compras.js?v=18', './js/services/purchase-service.js?v=18', './js/services/accounts-payable-service.js?v=18', './js/modules/cuentas-por-pagar.js?v=18', './js/modules/accounts-payable-detail.js?v=18', './js/data/demo-data.js?v=18', './js/modules/cartera.js?v=23', './js/modules/creditos.js?v=23', './js/utils/ids.js', './js/services/api-client.js?v=7', './js/config.js?v=5', './manifest.json', './offline.html', './Logo Famimuebles.png', './assets/icons/icon-192.png', './assets/icons/icon-512.png', './assets/icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', event => event.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
    .then(() => self.clients.claim())
));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  if (url.origin === self.location.origin && (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/') || url.pathname.includes('/js/') || url.pathname.includes('/css/'))) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./offline.html')))
    );
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => caches.match('./offline.html'))));
});