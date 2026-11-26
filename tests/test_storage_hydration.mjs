import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const originalWarn = console.warn;
const originalError = console.error;
const values = new Map();
globalThis.window = { location: { hostname: 'localhost', protocol: 'http:' } };
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};
console.warn = () => {};
console.error = () => {};

try {
  const { hydrateCatalog, hydrateStateWithRetry } = await import('../js/data/storage.js?v=26');

  let stateAttempts = 0;
  globalThis.fetch = async () => {
    stateAttempts += 1;
    if (stateAttempts === 1) {
      return new Response(JSON.stringify({ error: 'temporary outage' }), {
        status: 503,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ state: { products: [{ id: 'p1' }] } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const recoveredState = await hydrateStateWithRetry(2);
  assert.equal(stateAttempts, 2);
  assert.equal(recoveredState.products[0].id, 'p1');

  globalThis.fetch = async () => new Response(JSON.stringify({ state: { products: 'not-an-array' } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(hydrateStateWithRetry(1), error =>
    error.hydrationModule === 'estado principal' && /products/.test(error.message));

  const previousState = { products: [{ id: 'existing' }], stores: [{ id: 's1' }], inventoryByStore: [] };
  globalThis.fetch = async () => new Response(JSON.stringify({ products: 'invalid', stores: [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(hydrateCatalog(previousState, false, true), error => error.hydrationModule === 'catalogo');
  assert.deepEqual(previousState.products, [{ id: 'existing' }]);
  assert.deepEqual(previousState.stores, [{ id: 's1' }]);
  console.log('storage hydration checks passed');
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  console.warn = originalWarn;
  console.error = originalError;
}
