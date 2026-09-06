const PRODUCTION_API_URL = 'https://investments-capacity-ellen-employer.trycloudflare.com/api';

const configuredApiBase = String(
  (typeof localStorage !== 'undefined' && localStorage.getItem('famimuebles-api-base-url')) ||
  globalThis.FAMIMUEBLES_API_BASE_URL ||
  ''
).trim();

export const API_BASE_URL = configuredApiBase
  ? configuredApiBase.replace(/\/+$/, '')
  : window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:8024/api'
    : PRODUCTION_API_URL;

export const API_MODE = API_BASE_URL ? 'api' : 'static';