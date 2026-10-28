import { API_BASE_URL } from '../config.js?v=20261015-runtime-config-v1';

const REQUEST_TIMEOUT_MS = 30000;
const NETWORK_RETRY_DELAYS_MS = [400, 1000];

function canRetryRequest(path, method) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method) ||
    (method === 'POST' && /\/auth\/login\/?$/.test(String(path).split('?')[0]));
}

function getRequestTimeout(path, requestedTimeout) {
  const timeout = Number(requestedTimeout) || REQUEST_TIMEOUT_MS;
  const endpoint = String(path).split('?')[0].replace(/\/+$/, '');
  if (endpoint === '/api/health' || endpoint === '/api/catalog') {
    return Math.max(timeout, 20000);
  }
  return timeout;
}

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) throw new Error('Servidor FAMIMUEBLES no configurado para este sitio.');
  return `${API_BASE_URL}/${String(path).replace(/^\/+/, '').replace(/^api\//, '')}`;
}

function authHeaders() {
  const token = localStorage.getItem('famimuebles-auth-token');
  const tenantId = localStorage.getItem('famimuebles-tenant-id') || 'tenant-default';
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'X-Tenant-ID': tenantId,
  };
}

export class ApiError extends Error {
  constructor(message, status = 0, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const payload = await response.json();
    if (!response.ok) throw new ApiError(payload.error || 'La API rechazo la solicitud.', response.status, 'HTTP_ERROR');
    return payload;
  }
  const text = await response.text();
  if (!response.ok) throw new ApiError(`La API respondio con un error (${response.status}).`, response.status, 'HTTP_ERROR');
  if (text.trim().startsWith('<')) throw new ApiError('El servidor devolvio una pagina HTML en lugar de JSON.', response.status, 'INVALID_RESPONSE');
  return text;
}

export async function apiRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), getRequestTimeout(path, options.timeout));
  const method = String(options.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/json', 'ngrok-skip-browser-warning': 'true', ...authHeaders(), ...(options.headers || {}) };
  const tenantId = localStorage.getItem('famimuebles-tenant-id') || 'tenant-default';
  headers['X-Tenant-ID'] = String(options.headers?.['X-Tenant-ID'] || tenantId).trim() || 'tenant-default';
  const cacheMode = options.cache || (method === 'GET' ? 'default' : 'no-store');
  const retryDelays = canRetryRequest(path, method) ? NETWORK_RETRY_DELAYS_MS : [];
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetch(buildUrl(path), { ...options, headers, cache: cacheMode, signal: controller.signal });
        return await parseResponse(response);
      } catch (error) {
        if (error.name === 'AbortError') throw new ApiError('El servidor FAMIMUEBLES tardo demasiado en responder.', 0, 'TIMEOUT');
        if (error instanceof ApiError) throw error;
        if (attempt >= retryDelays.length) {
          throw new ApiError('Servidor FAMIMUEBLES no disponible. Verifica la conexion e intenta nuevamente.', 0, 'NETWORK_ERROR');
        }
        await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
      }
    }
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || REQUEST_TIMEOUT_MS);
  const headers = { 'ngrok-skip-browser-warning': 'true', ...authHeaders(), ...(options.headers || {}) };
  const tenantId = localStorage.getItem('famimuebles-tenant-id') || 'tenant-default';
  headers['X-Tenant-ID'] = String(options.headers?.['X-Tenant-ID'] || tenantId).trim() || 'tenant-default';
  try {
    const response = await fetch(buildUrl(path), { ...options, headers, cache: 'no-store', signal: controller.signal });
    if (!response.ok) {
      let message = `La API respondio con un error (${response.status}).`;
      try { message = (await response.json()).error || message; } catch (error) { /* respuesta no JSON */ }
      throw new ApiError(message, response.status, 'HTTP_ERROR');
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError(`El servidor FAMIMUEBLES tardo demasiado en responder al descargar ${path}.`, 0, 'TIMEOUT');
    if (error instanceof ApiError) throw error;
    const detail = error instanceof TypeError ? ' Revisa la URL del API y la conexion CORS.' : '';
    throw new ApiError(`No se pudo conectar al servidor FAMIMUEBLES.${detail}`, 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  get: (path, options = {}) => apiRequest(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => apiRequest(path, { ...options, method: 'POST', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, body: JSON.stringify(body) }),
  put: (path, body, options = {}) => apiRequest(path, { ...options, method: 'PUT', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, body: JSON.stringify(body) }),
  delete: (path, body = {}, options = {}) => apiRequest(path, { ...options, method: 'DELETE', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, body: JSON.stringify(body) }),
  download: (path, options = {}) => downloadRequest(path, options),
};