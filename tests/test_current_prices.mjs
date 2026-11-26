import assert from 'node:assert/strict';

const originalLocalStorage = globalThis.localStorage;
globalThis.localStorage = { getItem: () => JSON.stringify({ role: 'VENDEDOR' }) };

try {
  const { money } = await import('../js/components/tables.js');
  const { productResults } = await import('../js/modules/facturacion.js');
  const { productTable } = await import('../js/modules/productos.js');
  const { averageSalePrices } = await import('../js/utils/pricing.js');

  const product = { id: 'p1', code: 'P1', name: 'Silla', price: 900, salePrice: 900, active: true };
  const data = {
    products: [product],
    stores: [{ id: 's1', name: 'Local' }],
    inventoryByStore: [{ productId: 'p1', storeId: 's1', quantity: 2 }],
    sales: [{ items: [{ productId: 'p1', quantity: 2, priceVenta: 400 }] }],
  };
  const historicalAverage = averageSalePrices(data).get(product.id);
  assert.equal(historicalAverage, 400);

  const invoiceResults = productResults(data.products, 's1', data);
  assert.match(invoiceResults, new RegExp(money(product.salePrice).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(invoiceResults, new RegExp(money(historicalAverage).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const catalogTable = productTable(data.products, data.stores, 50, 1, data);
  assert.match(catalogTable, new RegExp(money(product.salePrice).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(catalogTable, new RegExp(money(historicalAverage).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  console.log('current and historical price checks passed');
} finally {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
}
