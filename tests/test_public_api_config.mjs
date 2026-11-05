import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalApiBase = globalThis.FAMIMUEBLES_API_BASE_URL;
const originalWarn = console.warn;

async function loadConfig(hostname, healthOk) {
  let healthRequested = false;
  globalThis.window = { location: { hostname, protocol: hostname === 'localhost' ? 'http:' : 'https:' } };
  globalThis.fetch = async url => {
    if (String(url).startsWith('./tunnel-url.json')) {
      return { ok: true, json: async () => ({ url: 'https://erp.example.test' }) };
    }
    healthRequested = true;
    return { ok: healthOk };
  };
  const config = await import(`../js/config.js?test=${hostname}-${healthOk}`);
  return { ...config, healthRequested };
}

try {
  delete globalThis.FAMIMUEBLES_API_BASE_URL;
  console.warn = () => {};

  const unavailableApi = await loadConfig('famimuebles16.github.io', false);
  assert.equal(unavailableApi.API_BASE_URL, '');
  assert.equal(unavailableApi.API_MODE, 'static');
  assert.equal(unavailableApi.healthRequested, true);

  const availableApi = await loadConfig('famimuebles16.github.io', true);
  assert.equal(availableApi.API_BASE_URL, 'https://erp.example.test/api');
  assert.equal(availableApi.API_MODE, 'api');

  const localApi = await loadConfig('127.0.0.1', false);
  assert.equal(localApi.API_BASE_URL, 'http://127.0.0.1:8024/api');
  assert.equal(localApi.healthRequested, false);

  console.log('public API configuration checks passed');
} finally {
  globalThis.fetch = originalFetch;
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalApiBase === undefined) delete globalThis.FAMIMUEBLES_API_BASE_URL;
  else globalThis.FAMIMUEBLES_API_BASE_URL = originalApiBase;
  console.warn = originalWarn;
}
