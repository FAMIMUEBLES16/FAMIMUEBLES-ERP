import assert from 'node:assert/strict';

const originalLocalStorage = globalThis.localStorage;
const originalDemoMode = globalThis.famimueblesDemoMode;
globalThis.localStorage = { getItem: () => JSON.stringify({ role: 'VENDEDOR' }) };
globalThis.famimueblesDemoMode = false;

try {
  const { escapeHtml } = await import('../js/utils/html.js');
  const { badge, table } = await import('../js/components/tables.js');
  const { cartMarkup, customerResults, productResults } = await import('../js/modules/facturacion.js');
  const { productTable } = await import('../js/modules/productos.js');
  const { productDetail } = await import('../js/modules/product-detail.js');

  const malicious = '<img src=x onerror=alert(1)>';
  assert.equal(escapeHtml(`'"><&`), '&#39;&quot;&gt;&lt;&amp;');

  const customerHtml = customerResults([{
    id: 'c" onclick="alert(1)',
    name: malicious,
    document: malicious,
    phone: malicious,
    balance: 0,
  }], '');
  const product = {
    id: 'p" onclick="alert(1)',
    name: malicious,
    code: malicious,
    reference: malicious,
    category: malicious,
    price: 100,
    active: true,
  };
  const state = { inventoryByStore: [{ productId: product.id, storeId: 's1', quantity: 2 }], sales: [] };
  const resultHtml = productResults([product], 's1', state);
  const cartHtml = cartMarkup([{ ...product, stock: 2, quantity: 1, priceLista: 100, priceVenta: 100 }]);
  const tableHtml = productTable([product], [], 50, 1, state);
  const detailHtml = productDetail({
    products: [product],
    stores: [{ id: 's1', name: malicious }],
    inventoryByStore: [{ productId: product.id, storeId: 's1', quantity: 2 }],
    inventoryMovements: [{ productId: product.id, storeId: 's1', createdAt: malicious, type: malicious, note: malicious }],
  }, product.id);

  for (const html of [customerHtml, resultHtml, cartHtml, tableHtml, detailHtml]) {
    assert.equal(html.includes(malicious), false);
    assert.equal(html.includes('<img'), false);
    assert.match(html, /&lt;img/);
  }
  assert.equal(/class="[^"]*onmouseover=/.test(badge('x" onmouseover="alert(1)')), false);
  assert.equal(table(['<img src=x>'], []).includes('<th><img'), false);
  console.log('HTML escaping checks passed');
} finally {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  if (originalDemoMode === undefined) delete globalThis.famimueblesDemoMode;
  else globalThis.famimueblesDemoMode = originalDemoMode;
}
