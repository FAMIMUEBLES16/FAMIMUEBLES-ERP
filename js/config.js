const LOCAL_API_URL = 'http://127.0.0.1:8024/api';
const PUBLIC_API_URL = 'https://meant-tanks-char-scholars.trycloudflare.com/api';

const configuredApiBase = String(
  (typeof localStorage !== 'undefined' && localStorage.getItem('famimuebles-api-base-url')) ||
  globalThis.FAMIMUEBLES_API_BASE_URL ||
  ''
).trim();
const hasDeprecatedApiBase = configuredApiBase.includes('artwork-charges-wiley-sort.trycloudflare.com');

export const API_BASE_URL = configuredApiBase && !hasDeprecatedApiBase
  ? window.location.hostname.endsWith('github.io')
    ? PUBLIC_API_URL
    : configuredApiBase.replace(/\/+$/, '')
  : window.location.hostname.endsWith('github.io')
    ? PUBLIC_API_URL
    : LOCAL_API_URL;

export const API_MODE = API_BASE_URL ? 'api' : 'static';