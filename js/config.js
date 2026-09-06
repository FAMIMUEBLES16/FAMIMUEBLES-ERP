const configuredApiBase = String(globalThis.FAMIMUEBLES_API_BASE_URL || '').trim();

export const API_BASE_URL = configuredApiBase
  ? configuredApiBase.replace(/\/+$/, '')
  : window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:8024/api'
    : '';

export const API_MODE = API_BASE_URL ? 'api' : 'static';