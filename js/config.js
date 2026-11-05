const LOCAL_API_URL = 'http://127.0.0.1:8024/api';

const configuredApiBase = String(
  globalThis.FAMIMUEBLES_API_BASE_URL ||
  ''
).trim();
const hasDeprecatedApiBase = configuredApiBase.includes('artwork-charges-wiley-sort.trycloudflare.com') || configuredApiBase.includes('joy-rendering-whereas-clean.trycloudflare.com') || configuredApiBase.includes('richards-mug-pure-mattress.trycloudflare.com');
const hostname = globalThis.window?.location?.hostname || '';
const protocol = globalThis.window?.location?.protocol || '';
const isFileOrigin = protocol === 'file:' || hostname === '';
const isLocalHostname = ['localhost', '127.0.0.1', '::1'].includes(hostname) || isFileOrigin;

let publicApiUrl = '';
if (!isLocalHostname && !configuredApiBase && hostname.endsWith('.github.io')) {
  try {
    const tunnelResponse = await fetch(`./tunnel-url.json?v=${Date.now()}`, { cache: 'no-store' });
    const tunnel = await tunnelResponse.json();
    if (tunnelResponse.ok && typeof tunnel.url === 'string' && /^https:\/\//.test(tunnel.url)) {
      const candidateApiUrl = `${tunnel.url.replace(/\/+$/, '')}/api`;
      const healthController = new AbortController();
      const healthTimeout = setTimeout(() => healthController.abort(), 2500);
      try {
        const healthResponse = await fetch(`${candidateApiUrl}/health`, {
          cache: 'no-store',
          signal: healthController.signal,
        });
        if (healthResponse.ok) publicApiUrl = candidateApiUrl;
      } finally {
        clearTimeout(healthTimeout);
      }
    }
  } catch (error) {
    console.warn('No se pudo verificar la API publica; se abrira la vista de demostracion.', error);
  }
}

export const API_BASE_URL = isLocalHostname
  ? LOCAL_API_URL
  : configuredApiBase && !hasDeprecatedApiBase
    ? configuredApiBase.replace(/\/+$/, '')
    : publicApiUrl;

export const API_MODE = API_BASE_URL ? 'api' : 'static';