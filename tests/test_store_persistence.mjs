import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const originalCustomEvent = globalThis.CustomEvent;
const values = new Map();
values.set('famimuebles-tenant-id', 'tenant-alpha');
const requests = [];

globalThis.window = { location: { hostname: 'localhost', protocol: 'http:' }, dispatchEvent() {} };
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};

try {
  const { store } = await import('../js/data/store.js?v=26');

  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  assert.equal(await store.save({ notify: false }), true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'POST');

  const savedState = JSON.parse(requests[0].options.body).state;
  assert.equal(Object.hasOwn(savedState, 'customers'), false);

  const queuedRequests = [];
  let releaseFirstRequest;
  globalThis.fetch = async (url, options) => {
    queuedRequests.push({ url: String(url), options });
    if (queuedRequests.length === 1) {
      await new Promise(resolve => { releaseFirstRequest = resolve; });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  store.collection.companySettings = [{ id: 'first' }];
  const firstSave = store.save({ notify: false });
  await new Promise(resolve => setTimeout(resolve, 0));
  store.collection.companySettings.push({ id: 'second' });
  values.set('famimuebles-tenant-id', 'tenant-beta');
  const secondSave = store.save({ notify: false });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(queuedRequests.length, 1, 'state writes must be serialized');
  releaseFirstRequest();
  await Promise.all([firstSave, secondSave]);
  assert.equal(JSON.parse(queuedRequests[0].options.body).state.companySettings.length, 1);
  assert.equal(JSON.parse(queuedRequests[1].options.body).state.companySettings.length, 2);
  assert.equal(queuedRequests[0].options.headers['X-Tenant-ID'], 'tenant-alpha');
  assert.equal(queuedRequests[1].options.headers['X-Tenant-ID'], 'tenant-beta');

  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    throw new TypeError('offline');
  };
  await assert.rejects(store.save({ notify: false }), error => error.code === 'NETWORK_ERROR');
  assert.equal(attempts, 1, 'state writes must not be automatically retried');

  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'datos invalidos' }), {
    status: 400,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(store.save({ notify: false }), error => error.code === 'HTTP_ERROR' && error.status === 400);

  globalThis.fetch = async () => new Response(JSON.stringify({ ok: false }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
  await assert.rejects(store.save({ notify: false }), /no confirmo el guardado/);

  console.log('store persistence checks passed');
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
  if (originalCustomEvent === undefined) delete globalThis.CustomEvent;
  else globalThis.CustomEvent = originalCustomEvent;
}
