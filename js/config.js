const LOCAL_API_URL = 'http://127.0.0.1:8024/api';
const PUBLIC_API_URL = 'https://cricket-rouge-golf-powerseller.trycloudflare.com/api';

const configuredApiBase = String(
  globalThis.FAMIMUEBLES_API_BASE_URL ||
  ''
).trim();
const hasDeprecatedApiBase = configuredApiBase.includes('artwork-charges-wiley-sort.trycloudflare.com');
const hostname = window.location.hostname || '';
const protocol = window.location.protocol || '';
const isFileOrigin = protocol === 'file:' || hostname === '';
const isLocalHostname = ['localhost', '127.0.0.1', '::1'].includes(hostname) || isFileOrigin;

let publicApiUrl = PUBLIC_API_URL;
if (!isLocalHostname && !configuredApiBase && hostname.endsWith('.github.io')) {
  try {
    const tunnelResponse = await fetch(`./tunnel-url.json?v=${Date.now()}`, { cache: 'no-store' });
    const tunnel = await tunnelResponse.json();
    if (tunnelResponse.ok && typeof tunnel.url === 'string' && /^https:\/\//.test(tunnel.url)) {
      publicApiUrl = `${tunnel.url.replace(/\/+$/, '')}/api`;
    }
  } catch (error) {
    console.warn('No se pudo actualizar la URL publica del servidor.', error);
  }
}

export const API_BASE_URL = isLocalHostname
  ? LOCAL_API_URL
  : configuredApiBase && !hasDeprecatedApiBase
    ? configuredApiBase.replace(/\/+$/, '')
    : publicApiUrl;

export const API_MODE = API_BASE_URL ? 'api' : 'static';