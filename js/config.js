const PRODUCTION_API_URL = 'https://crouch-untitled-harness.ngrok-free.dev/api';

const configuredApiBase = String(
  (typeof localStorage !== 'undefined' && localStorage.getItem('famimuebles-api-base-url')) ||
  globalThis.FAMIMUEBLES_API_BASE_URL ||
  ''
).trim();

export const API_BASE_URL = configuredApiBase
  ? configuredApiBase.replace(/\/+$/, '')
  : window.location.protocol === 'file:' || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:8024/api'
    : PRODUCTION_API_URL;

export const API_MODE = API_BASE_URL ? 'api' : 'static';