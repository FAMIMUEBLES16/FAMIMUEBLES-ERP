import assert from 'node:assert/strict';

const originalLocalStorage = globalThis.localStorage;
const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};

try {
  const firstModule = await import('../js/utils/pending-operations.js?first-load');
  let created = 0;
  const make = () => firstModule.getOrCreatePendingOperation({
    operation: 'sale',
    tenantId: 'tenant-a',
    fingerprint: '{"amount":100}',
    create: () => ({ id: `sale-${++created}`, requestId: `request-${created}` }),
  });
  const first = make();
  assert.equal(first.id, 'sale-1');

  const reloadedModule = await import('../js/utils/pending-operations.js?after-reload');
  const restored = reloadedModule.getOrCreatePendingOperation({
    operation: 'sale',
    tenantId: 'tenant-a',
    fingerprint: '{"amount":100}',
    create: () => ({ id: `sale-${++created}`, requestId: `request-${created}` }),
  });
  assert.equal(restored.id, first.id, 'a page reload must recover the same entity id');
  assert.equal(restored.requestId, first.requestId, 'a page reload must recover the same idempotency key');
  assert.equal(created, 1);

  const otherTenant = reloadedModule.getOrCreatePendingOperation({
    operation: 'sale',
    tenantId: 'tenant-b',
    fingerprint: '{"amount":100}',
    create: () => ({ id: `sale-${++created}`, requestId: `request-${created}` }),
  });
  assert.notEqual(otherTenant.requestId, first.requestId);

  const purchase = reloadedModule.getOrCreatePendingOperation({
    operation: 'purchase',
    tenantId: 'tenant-a',
    fingerprint: '{"invoice":"A-1"}',
    create: () => ({ id: 'purchase-1', requestId: 'purchase-request-1' }),
  });
  const replayedPurchase = reloadedModule.getOrCreatePendingOperation({
    operation: 'purchase',
    tenantId: 'tenant-a',
    fingerprint: '{"invoice":"A-1"}',
    create: () => ({ id: 'purchase-2', requestId: 'purchase-request-2' }),
  });
  assert.equal(replayedPurchase.id, purchase.id, 'a retried purchase must reuse its original identity');
  assert.equal(replayedPurchase.requestId, purchase.requestId);

  const nextIntent = reloadedModule.getOrCreatePendingOperation({
    operation: 'sale',
    tenantId: 'tenant-a',
    fingerprint: '{"amount":200}',
    create: () => ({ id: `sale-${++created}`, requestId: `request-${created}` }),
  });
  assert.notEqual(nextIntent.requestId, first.requestId, 'different operations must not share a key');

  reloadedModule.clearPendingOperation({
    operation: 'sale',
    tenantId: 'tenant-a',
    fingerprint: '{"amount":100}',
  });
  const consecutiveIntent = reloadedModule.getOrCreatePendingOperation({
    operation: 'sale',
    tenantId: 'tenant-a',
    fingerprint: '{"amount":100}',
    create: () => ({ id: `sale-${++created}`, requestId: `request-${created}` }),
  });
  assert.notEqual(consecutiveIntent.requestId, first.requestId, 'a confirmed operation must not capture a later legitimate one');

  globalThis.localStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem() {},
  };
  assert.throws(() => reloadedModule.getOrCreatePendingOperation({
    operation: 'purchase',
    tenantId: 'tenant-a',
    fingerprint: 'intent',
    create: () => ({ id: 'purchase-1', requestId: 'request-1' }),
  }), /No se pudo guardar la clave de reintento/);

  console.log('pending operation idempotency checks passed');
} finally {
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
}
