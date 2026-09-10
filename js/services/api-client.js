import { API_BASE_URL } from '../config.js?v=7';

const REQUEST_TIMEOUT_MS = 15000;

function buildUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE_URL) throw new Error('Servidor FAMIMUEBLES no configurado para este sitio.');
  return `${API_BASE_URL}/${String(path).replace(/^\/+/, '').replace(/^api\//, '')}`;
}

function authHeaders() {
  const token = localStorage.getItem('famimuebles-auth-token');
  return token ? { Authorization: `Bearer ${token}` } : {};
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
  const timeout = setTimeout(() => controller.abort(), options.timeout || REQUEST_TIMEOUT_MS);
  const headers = { Accept: 'application/json', 'ngrok-skip-browser-warning': 'true', ...authHeaders(), ...(options.headers || {}) };
  try {
    const response = await fetch(buildUrl(path), { ...options, headers, signal: controller.signal });
    return await parseResponse(response);
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('El servidor FAMIMUEBLES tardo demasiado en responder.', 0, 'TIMEOUT');
    if (error instanceof ApiError) throw error;
    throw new ApiError('Servidor FAMIMUEBLES no disponible. Verifica la conexion e intenta nuevamente.', 0, 'NETWORK_ERROR');
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || REQUEST_TIMEOUT_MS);
  const headers = { 'ngrok-skip-browser-warning': 'true', ...authHeaders(), ...(options.headers || {}) };
  try {
    const response = await fetch(buildUrl(path), { ...options, headers, signal: controller.signal });
    if (!response.ok) {
      let message = `La API respondio con un error (${response.status}).`;
      try { message = (await response.json()).error || message; } catch (error) { /* respuesta no JSON */ }
      throw new ApiError(message, response.status, 'HTTP_ERROR');
    }
    return response;
  } catch (error) {
    if (error.name === 'AbortError') throw new ApiError('El servidor FAMIMUEBLES tardo demasiado en responder.', 0, 'TIMEOUT');
    if (error instanceof ApiError) throw error;
    throw new ApiError('Servidor FAMIMUEBLES no disponible. Verifica la conexion e intenta nuevamente.', 0, 'NETWORK_ERROR');
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