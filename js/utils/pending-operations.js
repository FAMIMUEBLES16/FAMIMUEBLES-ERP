const STORAGE_PREFIX = 'famimuebles-pending-operations:';

function storageKey(tenantId) {
  return `${STORAGE_PREFIX}${encodeURIComponent(String(tenantId || 'tenant-default'))}`;
}

function readOperations(key) {
  let serialized;
  try {
    serialized = globalThis.localStorage.getItem(key);
  } catch (error) {
    throw new Error(`No se pudo recuperar la operacion pendiente: ${error.message}`);
  }
  if (!serialized) return [];
  try {
    const operations = JSON.parse(serialized);
    if (!Array.isArray(operations)) throw new TypeError('Formato de operaciones pendientes invalido.');
    return operations;
  } catch (error) {
    throw new Error(`No se pudieron leer las operaciones pendientes: ${error.message}`);
  }
}

export function getOrCreatePendingOperation({ operation, tenantId, fingerprint, create }) {
  if (!operation || !fingerprint || typeof create !== 'function') {
    throw new TypeError('La operacion pendiente requiere tipo, huella y generador.');
  }
  const key = storageKey(tenantId);
  const operations = readOperations(key);
  const existing = operations.find(item => item.operation === operation && item.fingerprint === fingerprint);
  if (existing) return existing;

  const pending = create();
  if (!pending || typeof pending !== 'object') throw new TypeError('No se pudo crear la operacion pendiente.');
  try {
    globalThis.localStorage.setItem(key, JSON.stringify([...operations, { operation, fingerprint, ...pending }]));
  } catch (error) {
    throw new Error(`No se pudo guardar la clave de reintento de ${operation}: ${error.message}`);
  }
  return { operation, fingerprint, ...pending };
}

export function clearPendingOperation({ operation, tenantId, fingerprint }) {
  const key = storageKey(tenantId);
  const remaining = readOperations(key).filter(item => item.operation !== operation || item.fingerprint !== fingerprint);
  try {
    if (remaining.length) globalThis.localStorage.setItem(key, JSON.stringify(remaining));
    else globalThis.localStorage.removeItem(key);
  } catch (error) {
    throw new Error(`La operacion se confirmo, pero no se pudo limpiar su clave de reintento: ${error.message}`);
  }
}
