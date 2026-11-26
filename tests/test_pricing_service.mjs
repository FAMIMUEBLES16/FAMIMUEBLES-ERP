import assert from 'node:assert/strict';

const storage = new Map([['famimuebles-tenant-id', 'TENANT-42']]);
globalThis.window = { location: { hostname: 'localhost', protocol: 'http:' } };
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
};

const requests = [];
globalThis.fetch = async (url, options = {}) => {
  requests.push({ url: String(url), options });
  return new Response(JSON.stringify({ ok: true, items: [], hasMore: false }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const { getProductPriceHistory, updateProductPrice, updateProductPrices } = await import('../js/services/pricing-service.js');

await updateProductPrice({ id: 'P-1', salePrice: 200, minimumPrice: 150 });
await updateProductPrices([{ id: 'P-2', salePrice: 300 }], 'importacion');
await getProductPriceHistory({ beforeId: 7, limit: 25 });

assert.equal(requests.length, 3);
assert.match(requests[0].url, /\/api\/catalog\/product\/pricing$/);
assert.equal(requests[0].options.headers['X-Tenant-ID'], 'TENANT-42');
assert.deepEqual(JSON.parse(requests[0].options.body), {
  id: 'P-1',
  salePrice: 200,
  minimumPrice: 150,
  tenantId: 'TENANT-42',
});
assert.match(requests[1].url, /\/api\/catalog\/product\/pricing\/bulk$/);
assert.equal(JSON.parse(requests[1].options.body).operationType, 'importacion');
assert.match(requests[2].url, /\/api\/catalog\/product\/pricing\/history\?limit=25&beforeId=7$/);
assert.equal(requests[2].options.cache, 'no-store');
assert.throws(() => updateProductPrices([], 'individual'), /tipo de operación/);
assert.throws(() => getProductPriceHistory({ limit: 101 }), /entre 1 y 100/);
