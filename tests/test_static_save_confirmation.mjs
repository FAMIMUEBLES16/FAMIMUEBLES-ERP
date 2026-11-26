import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalLocalStorage = globalThis.localStorage;
const values = new Map();
let failWrites = true;

globalThis.window = {
  location: { hostname: 'famimuebles16.github.io', protocol: 'https:' },
  dispatchEvent() {},
};
globalThis.localStorage = {
  getItem: key => values.get(key) ?? null,
  setItem: (key, value) => {
    if (failWrites) throw new DOMException('quota exceeded', 'QuotaExceededError');
    values.set(key, String(value));
  },
  removeItem: key => values.delete(key),
};
globalThis.fetch = async () => new Response('{}', { status: 404 });

try {
  const { store } = await import('../js/data/store.js?static-save-confirmation');
  store.collection.demoMode = true;

  let successShown = false;
  await assert.rejects((async () => {
    await store.save({ notify: false });
    successShown = true;
  })(), /quota exceeded/i);
  assert.equal(successShown, false, 'a failed localStorage write must not reach success handling');

  failWrites = false;
  await store.save({ notify: false }).then(() => { successShown = true; });
  assert.equal(successShown, true);
  assert.ok(values.has('famimuebles-static-state'));

  console.log('static save confirmation checks passed');
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalLocalStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = originalLocalStorage;
}
