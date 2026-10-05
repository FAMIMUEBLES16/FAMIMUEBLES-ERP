const CACHE = 'famimuebles-erp-v20261005091948-auto-transfer-v1-users-v3-credit-ledger-v1-payment-scope-v1-long-finance-lists-v3-auto-refresh-v2';
const CORE = ['./', './index.html?v=public-summary-20260926', './css/main.css?v=20261005091948-long-finance-lists-v1', './css/attendance.css?v=1', './css/parity-report-fixes.css?v=5', './js/app-v3.js?v=20261005091948-auto-transfer-v1-users-v1-payables-v1-payments-v1-domain-hydration-v1-auto-refresh-v1-credit-ledger-v1-payment-scope-v1-long-finance-lists-v1', './js/modules/descansos.js?v=6', './js/modules/ventas.js?v=25', './js/modules/compras.js?v=22', './js/modules/paridad.js?v=4', './js/modules/talonarios.js?v=14', './js/modules/gasolina.js?v=22', './js/modules/operaciones.js?v=3', './js/components/tables.js?v=1', './js/modules/dashboard-v3.js?v=27', './js/modules/facturacion.js?v=23', './js/services/product-service.js?v=18', './js/data/storage.js?v=18', './js/data/store.js?v=18', './js/router.js?v=18', './js/modules/proveedores.js?v=18', './js/services/purchase-service.js?v=18', './js/services/accounts-payable-service.js?v=16', './js/modules/cuentas-por-pagar.js?v=16', './js/modules/accounts-payable-detail.js?v=15', './js/data/demo-data.js?v=18', './js/modules/cartera.js?v=25', './js/modules/creditos.js?v=31', './js/modules/apartados.js?v=20', './js/utils/ids.js', './js/services/api-client.js?v=20261005091948', './js/config.js?v=20261005091948', './manifest.json', './offline.html', './Logo Famimuebles.png', './assets/icons/icon-192.png', './assets/icons/apple-touch-icon.png'];
CORE.push('./js/app-v3.js?v=95', './js/components/sidebar.js?v=24', './js/services/accounts-payable-service.js?v=17', './js/modules/talonarios.js?v=15', './js/router.js?v=20', './js/modules/ventas.js?v=26');
CORE.push('./js/app-v3.js?v=96', './js/modules/talonarios.js?v=16', './js/modules/talonarios.js?v=17');
CORE.push('./js/app-v3.js?v=20261002131059');
CORE.push('./js/app-v3.js?v=20261002132442');
CORE.push('./js/app-v3.js?v=20261002132442','./js/modules/dashboard-v3.js?v=20261002132442');
CORE.push('./js/app-v3.js?v=20261002132618');
CORE.push('./js/app-v3.js?v=20261002132618','./js/modules/dashboard-v3.js?v=20261002132618');
CORE.push('./js/app-v3.js?v=20261002134202','./js/modules/dashboard-v3.js?v=20261002134202');
CORE.push('./js/app-v3.js?v=20261002135342','./js/modules/dashboard-v3.js?v=20261002135342');
CORE.push('./js/app-v3.js?v=20261002-apartado-edit-v1');
CORE.push('./js/app-v3.js?v=20261003091041','./js/modules/dashboard-v3.js?v=20261003091041');
CORE.push('./js/app-v3.js?v=20261003091041-auto-transfer-v1','./js/data/storage.js?v=27');
CORE.push('./js/app-v3.js?v=20261003091041-auto-transfer-v1-users-v1','./js/modules/usuarios.js?v=20');
CORE.push('./js/app-v3.js?v=20261004105826','./js/modules/dashboard-v3.js?v=20261004105826');
CORE.push('./js/app-v3.js?v=20261005091948','./js/modules/dashboard-v3.js?v=20261005091948');
CORE.push('./js/app-v3.js?v=20261005091948-auto-transfer-v1-users-v1-payables-v1-payments-v1-domain-hydration-v1-auto-refresh-v1-credit-ledger-v1-payment-scope-v1-long-finance-lists-v2');
CORE.push('./js/app-v3.js?v=20261005091948-auto-transfer-v1-users-v1-payables-v1-payments-v1-domain-hydration-v1-auto-refresh-v1-credit-ledger-v1-payment-scope-v1-long-finance-lists-v3', './js/components/sidebar.js?v=23');
CORE.push('./js/app-v3.js?v=20261005091948-auto-transfer-v1-users-v3-payables-v1-payments-v1-domain-hydration-v1-auto-refresh-v1-credit-ledger-v1-payment-scope-v1-long-finance-lists-v3-attendance-active-sellers-v1', './js/modules/usuarios.js?v=22');
CORE.push('./js/app-v3.js?v=20261005091948-auto-transfer-v1-users-v3-payables-v1-payments-v1-domain-hydration-v1-auto-refresh-v2-credit-ledger-v1-payment-scope-v1-long-finance-lists-v3-attendance-active-sellers-v1');
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
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
    const isVersionedAsset = url.pathname.includes('/js/') || url.pathname.includes('/css/');
    if (url.pathname.endsWith('/js/config.js')) {
      event.respondWith(fetch(new Request(event.request, { cache: 'no-store' })).catch(() => caches.match(event.request)));
      return;
    }
    if (isVersionedAsset) {
      event.respondWith(
        fetch(new Request(event.request, { cache: 'no-store' }))
          .then(response => {
            if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone())).catch(() => {});
            return response;
          })
          .catch(() => caches.match(event.request).then(cached => cached || caches.match('./offline.html')))
      );
      return;
    }
    event.respondWith(
      fetch(new Request(event.request, { cache: 'no-store' }))
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