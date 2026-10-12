import assert from 'node:assert/strict';
import { renderInventoryHandoverDocument, renderReportPreview, renderReportes } from '../js/modules/reportes.js';

const data = {
  stores: [{ id: 'store-1', name: 'Local Centro' }],
  products: [
    { id: 'product-1', name: 'Sofá Roma', code: 'SF-01', minimum: 2, maximum: 10, active: true },
    { id: 'product-2', name: 'Mesa Niza', code: 'MS-02', minimum: 1, maximum: 5, active: true },
    { id: 'product-3', name: 'Producto inactivo', code: 'IN-03', active: false },
    { id: 'product-4', name: 'Producto agotado', code: 'AG-04', active: true },
  ],
  inventoryByStore: [
    { productId: 'product-1', storeId: 'store-1', quantity: 4, minimum: 2 },
    { productId: 'product-3', storeId: 'store-1', quantity: 8, minimum: 1 },
    { productId: 'product-4', storeId: 'store-1', quantity: 0, minimum: 1 },
  ],
  users: [
    { id: 'seller-1', name: 'Ana Vendedora', role: 'VENDEDOR', status: 'Activo' },
    { id: 'seller-2', name: 'Luis Reemplazo', role: 'VENDEDOR', active: true },
    { id: 'admin-1', name: 'Administrador', role: 'ADMINISTRADOR', status: 'Activo' },
    { id: 'seller-3', name: 'Vendedor inactivo', role: 'VENDEDOR', status: 'Inactivo' },
  ],
};

const preview = renderReportPreview(data, 'inventoryReplacement', { store: 'store-1' });
assert.equal(preview.count, 1, 'the handover report includes only active products with stock');
assert.match(preview.html, /Sofá Roma/);
assert.match(preview.html, /Cantidad disponible/);
assert.doesNotMatch(preview.html, /Producto inactivo|Producto agotado|Mesa Niza|SF-01|M.nimo|M.ximo/);
assert.match(renderReportes(data), /Entrega y reemplazo de inventario/);
assert.match(renderReportes(data), /Ana Vendedora/);
assert.doesNotMatch(renderReportes(data), /Administrador/);
assert.doesNotMatch(renderReportes(data), /Vendedor inactivo/);

const document = renderInventoryHandoverDocument(data, {
  store: 'store-1',
  primarySeller: 'seller-1',
  replacementSeller: 'seller-2',
});
assert.match(document, /ACTA DE ENTREGA Y REEMPLAZO DE INVENTARIO/);
assert.match(document, /Local Centro/);
assert.match(document, /Ana Vendedora/);
assert.match(document, /Luis Reemplazo/);
assert.match(document, /Vendedor principal - Entrega/);
assert.match(document, /Vendedor de reemplazo - Recibe/);
assert.match(document, /Sofá Roma/);
assert.match(document, /Cantidad disponible/);
assert.doesNotMatch(document, /Producto inactivo|Producto agotado|Mesa Niza|SF-01|M.nimo|M.ximo/);
assert.match(document, /Productos disponibles:<\/strong> 1/);
assert.match(document, /window\.print\(\)/);

assert.throws(
  () => renderInventoryHandoverDocument(data, { store: 'store-1', primarySeller: 'seller-1', replacementSeller: 'seller-1' }),
  /deben ser diferentes/,
);
assert.throws(
  () => renderInventoryHandoverDocument(data, { store: '', primarySeller: 'seller-1', replacementSeller: 'seller-2' }),
  /Selecciona un local válido/,
);
