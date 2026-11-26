import { api } from './api-client.js?v=20261125-rentabilidad-bulk-v1';
import { activeTenantId } from '../data/storage.js?v=32';

const tenantOptions = () => ({
  headers: { 'X-Tenant-ID': activeTenantId() },
});

export function updateProductPrice(pricing) {
  const tenantId = activeTenantId();
  return api.put('/api/catalog/product/pricing', {
    ...pricing,
    tenantId,
  }, tenantOptions());
}

export function updateProductPrices(items, operationType = 'masiva') {
  if (!['masiva', 'importacion'].includes(operationType)) {
    throw new Error('El tipo de operación de precios no es válido.');
  }
  const tenantId = activeTenantId();
  return api.put('/api/catalog/product/pricing/bulk', {
    items,
    operationType,
    tenantId,
  }, tenantOptions());
}

export function getProductPriceHistory({ beforeId = 0, limit = 50 } = {}) {
  const cursor = Number(beforeId);
  const pageSize = Number(limit);
  if (!Number.isSafeInteger(cursor) || cursor < 0) {
    throw new Error('El cursor del historial no es válido.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('El límite del historial debe estar entre 1 y 100.');
  }
  const params = new URLSearchParams({ limit: String(pageSize) });
  if (cursor) params.set('beforeId', String(cursor));
  return api.get(`/api/catalog/product/pricing/history?${params}`, {
    ...tenantOptions(),
    cache: 'no-store',
  });
}
