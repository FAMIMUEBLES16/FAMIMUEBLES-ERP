const LOCAL_API_URL = 'http://127.0.0.1:8024/api';
const PUBLIC_API_URL = 'https://observed-colorado-buddy-fortune.trycloudflare.com/api';

const configuredApiBase = String(
  globalThis.FAMIMUEBLES_API_BASE_URL ||
  ''
).trim();
const hasDeprecatedApiBase = configuredApiBase.includes('artwork-charges-wiley-sort.trycloudflare.com');
const hostname = window.location.hostname || '';
const protocol = window.location.protocol || '';
const isFileOrigin = protocol === 'file:' || hostname === '';
const isLocalHostname = ['localhost', '127.0.0.1', '::1'].includes(hostname) || isFileOrigin;

export const API_BASE_URL = isLocalHostname
  ? LOCAL_API_URL
  : configuredApiBase && !hasDeprecatedApiBase
    ? configuredApiBase.replace(/\/+$/, '')
    : PUBLIC_API_URL;

export const API_MODE = API_BASE_URL ? 'api' : 'static';