import assert from 'node:assert/strict';
import { buildRentabilidadBulkPricePlan, parseRentabilidadPriceCsv, parseRentabilidadPriceImport, parseRentabilidadPriceRecords, rentabilidadExportRows, rentabilidadPriceTemplateRows, renderRentabilidad, renderRentabilidadBulkPriceEditor, renderRentabilidadBulkPriceOutcome, renderRentabilidadBulkPricePreview, renderRentabilidadPriceEditor, renderRentabilidadPriceHistory, renderRentabilidadPriceImportEditor, renderRentabilidadPriceImportPreview, renderRentabilidadResults } from '../js/modules/rentabilidad.js';
import { pricingAnalysis, profitabilityMetrics } from '../js/utils/rentabilidad-calculations.js';
import { salePriceStatistics } from '../js/utils/pricing.js';
import { navGroups, navItems } from '../js/components/sidebar.js';
import { currentRoute, routes } from '../js/router.js';
import { createProduct, updateProduct, updateProductPricing } from '../js/services/product-service.js';

const state = {
  products: [
    { id: 'P-1', code: '001', name: 'Sofa', reference: 'REF-001', category: 'Sala', cost: 60, salePrice: 120, minimumPrice: 100, active: true },
    { id: 'P-2', code: '002', name: 'Cama', reference: 'REF-002', category: 'Dormitorio', cost: 90, salePrice: 80, minimumPrice: 85, active: true },
    { id: 'P-3', code: '003', name: '<Producto>', category: 'Sala', cost: 50, salePrice: 0, minimumPrice: 50, active: 0 },
  ],
  stores: [{ id: 'LOC-1', name: 'Principal' }, { id: 'LOC-2', name: 'Bodega' }],
  inventoryByStore: [
    { productId: 'P-1', storeId: 'LOC-1', quantity: 5 },
    { productId: 'P-1', storeId: 'LOC-2', quantity: 3 },
    { productId: 'P-2', storeId: 'LOC-1', quantity: 2 },
  ],
  sales: [
    { items: [{ productId: 'P-1', quantity: 2, unitPrice: 100 }, { productId: 'P-1', quantity: 1, unitPrice: 130 }] },
    { items: [{ productId: 'P-2', quantity: 1, unitPrice: 75 }] },
  ],
  purchases: [
    { id: 'PUR-1', status: 'RECIBIDA', items: [
      { productId: 'P-1', quantity: 2, unitCost: 50, discount: 10 },
      { productId: 'P-1', quantity: 3, unitCost: 70, discount: 0 },
      { productId: 'P-2', quantity: 2, unitCost: 100, discount: 10 },
    ] },
    { id: 'PUR-DRAFT', status: 'BORRADOR', items: [{ productId: 'P-1', quantity: 100, unitCost: 999, discount: 0 }] },
  ],
  supplierReturns: [],
};

assert.ok(routes.includes('rentabilidad'), 'the pricing module should be a valid route');
const pricingNavItem = navItems.find(item => item.id === 'rentabilidad');
assert.equal(pricingNavItem?.label, 'Rentabilidad', 'the sidebar should use the requested section name');
assert.match(pricingNavItem?.icon || '', /<svg/);
assert.ok(pricingNavItem.icon.includes('<circle'), 'the sidebar icon should be a price-tag symbol');
assert.ok(navGroups.some(group => group.items.includes('rentabilidad')), 'the pricing module should be grouped in the sidebar');
globalThis.location = { hash: '#rentabilidad' };
assert.equal(currentRoute(), 'rentabilidad', 'the router should resolve the new route');
const allRows = pricingAnalysis(state);
assert.deepEqual(
  allRows.map(({ product, stock }) => [product.id, stock]),
  [['P-1', 8], ['P-2', 2], ['P-3', 0]],
  'all-local inventory should consolidate existing product-store rows',
);
assert.equal(allRows[0].historicalAverage, 110, 'historical average should reuse the quantity-weighted ERP calculation');
assert.equal(allRows[0].historicalQuantity, 3, 'historical quantity should use the existing sale-line weights');
assert.equal(allRows[0].lastPurchaseCost, 60, 'last purchase cost should use the product cost maintained by receipt');
assert.equal(allRows[0].weightedAverageCost, 60, 'weighted purchase cost should account for received quantities and line discounts');
assert.equal(allRows[1].weightedAverageCost, 95);
assert.equal(allRows[2].weightedAverageCost, null, 'products without received purchases should not get a fabricated average cost');
assert.equal(allRows[0].minimumPrice, 100);
assert.equal(allRows[0].priceStatus.label, 'Con margen');
assert.equal(allRows[1].priceStatus.label, 'Bajo costo');
assert.equal(allRows[2].priceStatus.label, 'Sin precio');
assert.equal(allRows[0].margin, 60);
assert.equal(allRows[0].marginPercent, 50);
assert.equal(allRows[1].margin, -15, 'estimated margin should use the weighted average purchase cost rather than the last product cost');
assert.equal(allRows[1].marginPercent, -18.75, 'margin percentage should use the sale price as its denominator');
assert.equal(allRows[2].margin, null, 'a zero list price should not produce a misleading margin percentage');
assert.equal(pricingAnalysis(state, 'LOC-1')[0].stock, 5);
const bulkIncrease = buildRentabilidadBulkPricePlan(allRows.slice(0, 2), 'increase-percent', '10');
assert.deepEqual(bulkIncrease.map(item => [item.newPrice, item.eligible, item.belowCost]), [[132, true, false], [88, true, true]]);
const bulkDiscount = buildRentabilidadBulkPricePlan(allRows.slice(0, 2), 'discount-fixed', '50');
assert.deepEqual(bulkDiscount.map(item => [item.newPrice, item.eligible]), [[70, false], [30, false]]);
assert.throws(() => buildRentabilidadBulkPricePlan(allRows.slice(0, 2), 'decrease-percent', '101'), /entre 0 y 100/);
const importedBulkPrices = parseRentabilidadPriceImport('codigo,precio\n001,130\n002,100', allRows.slice(0, 2));
assert.deepEqual([...importedBulkPrices.entries()], [['P-1', 130], ['P-2', 100]]);
assert.throws(() => parseRentabilidadPriceImport('codigo,precio\n003,75', allRows.slice(0, 2)), /no pertenece a los productos seleccionados/);
assert.throws(() => parseRentabilidadPriceImport('codigo,precio\n001,130', allRows.slice(0, 2)), /Faltan precios/);
const exportedAll = rentabilidadExportRows(state, { code: '001', store: 'LOC-1' });
assert.equal(exportedAll.length, 3, 'whole-list exports must include every catalog product regardless of filters');
assert.equal(exportedAll[0]['Existencias por local/total'], 8, 'whole-list exports must include consolidated inventory');
assert.equal(exportedAll[0]['Precio de venta actual (COP)'], 120);
assert.equal(exportedAll[0]['Margen estimado (%)'], 50);
const exportedFiltered = rentabilidadExportRows(state, { code: '001', store: 'LOC-1' }, true);
assert.equal(exportedFiltered.length, 1, 'filtered exports should respect current product and local filters');
assert.equal(exportedFiltered[0]['Existencias por local/total'], 5);
assert.equal(rentabilidadPriceTemplateRows(state).length, state.products.length);
assert.deepEqual(rentabilidadPriceTemplateRows(state)[0], { codigo: '001', nombre: 'Sofa', precio: '' });
const parsedCsv = parseRentabilidadPriceCsv('\uFEFFCódigo del producto;Precio de venta actual (COP);Nombre\r\n001;130;"Sofa; especial"\r\n');
assert.equal(parsedCsv[0].Nombre, 'Sofa; especial', 'CSV parsing should handle quoted delimiters');
const importedPreview = parseRentabilidadPriceRecords(parsedCsv, allRows);
assert.deepEqual(importedPreview.plan.map(item => [item.product.id, item.newPrice, item.eligible]), [['P-1', 130, true]]);
const semicolonRecords = parseRentabilidadPriceCsv('codigo;precio\n001;99');
const minimumImport = parseRentabilidadPriceRecords(semicolonRecords, allRows);
assert.equal(minimumImport.plan[0].eligible, false, 'imports below a configured minimum must be blocked before confirmation');
assert.match(minimumImport.plan[0].reason, /precio mínimo/);
const invalidImport = parseRentabilidadPriceRecords(
  parseRentabilidadPriceCsv('codigo,precio\n001,130\n001,140\n999,80\n002,12.34'),
  allRows,
);
assert.equal(invalidImport.errors.length, 3, 'import validation should report duplicate, unknown, and malformed prices');
assert.match(invalidImport.errors.join(' '), /duplicado/);
assert.match(invalidImport.errors.join(' '), /no existe en el catálogo/);
assert.match(invalidImport.errors.join(' '), /valor entero/);
const aliasedDuplicate = parseRentabilidadPriceRecords(
  parseRentabilidadPriceCsv('codigo,precio\n001,130\nP-1,140'),
  allRows,
);
assert.match(aliasedDuplicate.errors.join(' '), /ya aparece en otra fila/, 'a code and ID for the same product must not create duplicate writes');
assert.throws(() => parseRentabilidadPriceCsv('codigo,precio\n001,"125000'), /comillas sin cerrar/);
const bulkPreview = renderRentabilidadBulkPricePreview(bulkIncrease);
assert.match(bulkPreview, /2 productos seleccionados/);
assert.match(bulkPreview, /por debajo del costo/);
assert.match(renderRentabilidadBulkPriceEditor(allRows.slice(0, 2)), /Archivo CSV/);
assert.match(renderRentabilidadBulkPriceOutcome([{ id: 'P-1', name: '<Mesa>', salePrice: 130 }], []), /&lt;Mesa&gt;/);
assert.match(renderRentabilidadPriceImportEditor(), /Confirmar actualización/);
assert.match(renderRentabilidadPriceImportPreview(importedPreview), /Validación correcta/);
assert.match(renderRentabilidadPriceImportPreview(invalidImport), /corrige el archivo antes de continuar/);
const priceHistory = renderRentabilidadPriceHistory([{
  createdAt: '2026-01-02T03:04:05',
  userName: '<Ana>',
  operationType: 'importacion',
  productCode: '001',
  productName: '<Mesa>',
  salePriceBefore: 100,
  salePriceAfter: 150,
  minimumPriceBefore: 80,
  minimumPriceAfter: 90,
}], { hasMore: true });
assert.match(priceHistory, /&lt;Ana&gt;/, 'the price history must escape user-controlled names');
assert.match(priceHistory, /Importación/);
assert.match(priceHistory, /Cargar cambios anteriores/);
const returnedPurchaseCosts = pricingAnalysis({
  products: [{ id: 'P-4', cost: 45, salePrice: 200 }],
  stores: [],
  inventoryByStore: [],
  sales: [],
  purchases: [
    { id: 'PUR-OLD', status: 'RECIBIDA', receivedAt: '2026-01-01', items: [{ productId: 'P-4', quantity: 2, unitCost: 50, discount: 10 }] },
    { id: 'PUR-LATEST', status: 'RECIBIDA', receivedAt: '2026-01-02', items: [{ productId: 'P-4', quantity: 2, unitCost: 100, discount: 0 }] },
    { id: 'PUR-CANCEL', status: 'CANCELADA', receivedAt: '2026-01-03', items: [{ productId: 'P-4', quantity: 100, unitCost: 999, discount: 0 }] },
    { id: 'PUR-ORDERED', status: 'ORDENADA', receivedAt: '2026-01-04', items: [{ productId: 'P-4', quantity: 100, unitCost: 999, discount: 0 }] },
  ],
  supplierReturns: [
    { status: 'RECIBIDA', purchaseId: 'PUR-LATEST', productId: 'P-4', quantity: 1 },
    { status: 'PENDIENTE', purchaseId: 'PUR-OLD', productId: 'P-4', quantity: 1 },
    { status: 'PROCESADA', productId: 'P-4', quantity: 1 },
  ],
})[0];
assert.equal(returnedPurchaseCosts.lastPurchaseCost, 100, 'the latest cost should come from the latest received purchase only');
assert.equal(returnedPurchaseCosts.weightedAverageCost, 190 / 3, 'a processed, linked supplier return should reduce received quantity and its purchase cost');
const legacySupplierPurchaseCosts = pricingAnalysis({
  products: [{ id: 'TV-1', code: 'TV-SAMSUNG', cost: 700000, salePrice: 1000000 }],
  purchases: [{
    id: 'COM-1',
    status: 'RECIBIDA',
    receivedAt: '2026-03-01',
    supplierName: 'Corbeta',
    items: [{ productId: 'TV-1', quantity: 2, unitCost: 700000 }],
  }],
  inventoryMovements: [
    {
      id: 'MOV-1',
      tipo: 'ENTRADA',
      estado: 'COMPLETADO',
      fecha: '2026-03-01',
      referencia: 'COM-1',
      codigo: 'TV-SAMSUNG',
      cantidad: 2,
      precio_unitario: 700000,
      entrada: 2,
      empleado: 'Corbeta',
    },
    {
      id: 'MOV-2',
      tipo: 'ENTRADA',
      estado: 'COMPLETADO',
      fecha: '2026-03-02',
      referencia: 'FACTURA-COR-2',
      codigo: 'TV-SAMSUNG',
      cantidad: 1,
      precio_unitario: 400000,
      entrada: 1,
      empleado: 'Corbeta',
    },
    {
      id: 'MOV-DRAFT',
      tipo: 'ENTRADA',
      estado: 'BORRADOR',
      fecha: '2026-03-03',
      referencia: 'BORRADOR',
      codigo: 'TV-SAMSUNG',
      cantidad: 100,
      precio_unitario: 999999,
      entrada: 100,
      empleado: 'Meico',
    },
  ],
})[0];
assert.equal(legacySupplierPurchaseCosts.lastPurchaseCost, 400000, 'legacy supplier entry lines should supply the latest received unit cost');
assert.equal(legacySupplierPurchaseCosts.weightedAverageCost, 600000, 'legacy entries should be included once and drafts excluded');
const fullyReturnedPurchase = pricingAnalysis({
  products: [{ id: 'P-6', cost: 0, salePrice: 120 }],
  stores: [],
  inventoryByStore: [],
  purchases: [{ id: 'PUR-RETURNED', status: 'RECIBIDA', items: [{ productId: 'P-6', quantity: 1, unitCost: 60, discount: 0 }] }],
  supplierReturns: [{ status: 'PROCESADA', purchaseId: 'PUR-RETURNED', productId: 'P-6', quantity: 1 }],
})[0];
assert.equal(fullyReturnedPurchase.weightedAverageCost, null);
assert.equal(fullyReturnedPurchase.hasPurchaseHistory, true, 'fully returned receipts still count as purchase history');
assert.deepEqual(profitabilityMetrics(allRows), {
  totalProducts: 3,
  inventoryUnits: 10,
  totalInventoryCost: 670,
  potentialSaleValue: 1120,
  uncostedInventoryUnits: 0,
  unpricedInventoryUnits: 0,
  pricesToReview: 2,
  outOfStock: 1,
});
const salesStatistics = salePriceStatistics(state);
assert.equal(salesStatistics.averagePrice, 101.25, 'the overall historical KPI should weight each sold unit');
assert.equal(salesStatistics.totalQuantity, 4);
assert.deepEqual(salePriceStatistics(null), {
  averagePrices: new Map(),
  quantities: new Map(),
  averagePrice: null,
  totalQuantity: 0,
});
assert.deepEqual(profitabilityMetrics([]), {
  totalProducts: 0,
  inventoryUnits: 0,
  totalInventoryCost: 0,
  potentialSaleValue: 0,
  uncostedInventoryUnits: 0,
  unpricedInventoryUnits: 0,
  pricesToReview: 0,
  outOfStock: 0,
});
const costlessInventory = pricingAnalysis({
  products: [{ id: 'P-4', cost: 0, salePrice: 40 }],
  stores: [{ id: 'LOC-1', name: 'Principal' }],
  inventoryByStore: [{ productId: 'P-4', storeId: 'LOC-1', quantity: 2 }],
  sales: [],
});
assert.equal(profitabilityMetrics(costlessInventory).totalInventoryCost, 0, 'known-cost subtotal should remain visible when stocked products are missing costs');
assert.equal(profitabilityMetrics(costlessInventory).uncostedInventoryUnits, 2);
assert.equal(profitabilityMetrics(costlessInventory).pricesToReview, 1);
const unpricedInventory = pricingAnalysis({
  products: [{ id: 'P-7', cost: 70, salePrice: 0 }],
  stores: [{ id: 'LOC-1', name: 'Principal' }],
  inventoryByStore: [{ productId: 'P-7', storeId: 'LOC-1', quantity: 2 }],
  purchases: [],
  sales: [],
});
assert.equal(profitabilityMetrics(unpricedInventory).totalInventoryCost, 140, 'the recorded product cost should value stock when purchase history is unavailable');
assert.equal(profitabilityMetrics(unpricedInventory).potentialSaleValue, 0, 'known-price subtotal should remain visible when stocked products are missing prices');
assert.equal(profitabilityMetrics(unpricedInventory).unpricedInventoryUnits, 2);
const partialInventoryData = {
  products: [
    { id: 'P-8', cost: 50, salePrice: 100 },
    { id: 'P-9', cost: 0, salePrice: 0 },
  ],
  stores: [{ id: 'LOC-1', name: 'Principal' }],
  inventoryByStore: [
    { productId: 'P-8', storeId: 'LOC-1', quantity: 2 },
    { productId: 'P-9', storeId: 'LOC-1', quantity: 3 },
  ],
  purchases: [],
  sales: [],
};
const partialInventory = pricingAnalysis(partialInventoryData);
assert.equal(profitabilityMetrics(partialInventory).totalInventoryCost, 100);
assert.equal(profitabilityMetrics(partialInventory).potentialSaleValue, 200);
assert.equal(profitabilityMetrics(partialInventory).uncostedInventoryUnits, 3);
assert.equal(profitabilityMetrics(partialInventory).unpricedInventoryUnits, 3);
const partialInventoryView = renderRentabilidad(partialInventoryData);
assert.match(partialInventoryView, /Subtotal actual · 3 unidades aún sin costo/);
assert.match(partialInventoryView, /Subtotal actual · 3 unidades aún sin precio/);
const belowMinimumPrice = pricingAnalysis({
  products: [{ id: 'P-5', cost: 60, salePrice: 90, minimumPrice: 100 }],
  stores: [],
  inventoryByStore: [],
  sales: [],
});
assert.equal(belowMinimumPrice[0].priceStatus.label, 'Bajo mínimo');
assert.equal(profitabilityMetrics(belowMinimumPrice).pricesToReview, 1);
const emptyView = renderRentabilidad({});
assert.match(emptyView, /No hay productos registrados/);
assert.match(emptyView, /No hay existencias/);

const filtered = renderRentabilidad(state, { query: '', store: 'LOC-1', category: 'Sala', active: 'active' });
assert.match(filtered, /Productos con precios por revisar/);
assert.match(filtered, /Productos y rentabilidad/);
assert.match(filtered, /Sofa/);
assert.match(filtered, /Análisis comercial/);
assert.match(filtered, /Rentabilidad/);
assert.match(filtered, /data-label="Promedio histórico de venta"/);
assert.match(filtered, /Total de productos/);
assert.match(filtered, /Costo de existencias con costo registrado/);
assert.match(filtered, /Valor de existencias con precio cargado/);
assert.match(filtered, /Productos con precios por revisar/);
assert.match(filtered, /Productos sin existencias/);
assert.doesNotMatch(filtered, /Cama/);
assert.doesNotMatch(filtered, /&lt;Producto&gt;/);
const fullView = renderRentabilidad(state);
const selectedView = renderRentabilidadResults(state, { selectedProductIds: ['P-1'] });
assert.match(selectedView, /1 seleccionados/);
assert.match(selectedView, /data-rentabilidad-select-product value="P-1"[^>]*checked/);
assert.match(selectedView, /data-action="bulk-edit-rentabilidad-prices"/);
const priceEditor = renderRentabilidadPriceEditor(allRows[0]);
assert.match(priceEditor, /Código/);
assert.match(priceEditor, /Costo promedio/);
assert.match(priceEditor, /Promedio histórico de venta/);
assert.match(priceEditor, /Margen estimado/);
assert.match(priceEditor, /Existencias/);
assert.match(priceEditor, /name="price"/);
assert.match(priceEditor, /name="minimumPrice"/);
assert.match(priceEditor, /GUARDAR CAMBIOS/);
assert.match(priceEditor, /Cancelar/);
assert.equal((priceEditor.match(/<input\b/g) || []).length, 2, 'only the current and minimum sale prices should be editable');
assert.match(renderRentabilidadPriceEditor(allRows[2]), /&lt;Producto&gt;/, 'product details must be escaped in the price editor');
assert.match(fullView, /Sin historial de compras/);
assert.match(fullView, /rentabilidad-row--negative/, 'loss-making products should be visually flagged');
assert.match(fullView, /rentabilidad-row--missing-price/, 'products without a sale price should be visually flagged');
assert.match(fullView, /rentabilidad-stat--warning/, 'the summary should flag products whose prices need review');
assert.match(fullView, /Valor de existencias con precio cargado/);
assert.equal((fullView.match(/<th>/g) || []).length, 14, 'the table adds a dedicated selection column to the 13 pricing columns');
assert.match(fullView, /<td data-label="Código del producto">003<\/td>/, 'products without stock must remain in the catalog table');
assert.match(fullView, /<td data-label="Existencias por local\/total">0<\/td>/, 'products with no inventory must show zero stock');
assert.match(fullView, /<td data-label="Costo promedio ponderado"><span class="muted">Sin historial de compras<\/span><\/td>/);
assert.match(fullView, /<th><span>Precio de venta actual<\/span><small class="rentabilidad-column-mode[^"]*">Editable<\/small><\/th>/);
assert.match(fullView, /<th><span>Costo promedio ponderado<\/span><small class="rentabilidad-column-mode[^"]*">Calculado<\/small><\/th>/);
assert.match(fullView, /<th><span>Precio mínimo de venta<\/span><small class="rentabilidad-column-mode[^"]*">Editable<\/small><\/th>/);
assert.match(fullView, /data-label="Referencia">REF-001/);
assert.match(fullView, /rentabilidad-price-status--success/);
assert.match(fullView, /rentabilidad-status--warning">N\/A<\/span>/, 'margin is N/A when no weighted purchase cost is available');
assert.match(fullView, /margen sobre venta, no recargo sobre costo ni utilidad contable/i);
assert.match(fullView, /data-rentabilidad-code/, 'the view should provide an independent code search');
assert.match(fullView, /data-rentabilidad-name/, 'the view should provide an independent product-name search');
assert.match(fullView, /data-rentabilidad-reference/, 'the view should provide an independent reference search');
assert.match(fullView, /data-rentabilidad-stock/, 'the view should expose all, in-stock, and out-of-stock filters');
assert.match(fullView, /data-rentabilidad-active/, 'catalog activity should have its own filter');
assert.match(fullView, /data-rentabilidad-below-cost/);
assert.match(fullView, /data-rentabilidad-below-minimum/);
assert.match(fullView, /data-rentabilidad-no-purchases/);
assert.match(fullView, /data-action="clear-rentabilidad-filters"/, 'the combined filters should be easy to clear');
assert.match(fullView, /data-action="export-rentabilidad-prices"/, 'the view should provide both Excel and CSV exports');
assert.match(fullView, /data-rentabilidad-export-scope/, 'exports should offer complete and filtered scopes');
assert.match(fullView, /data-action="download-rentabilidad-template"/, 'the view should provide an update template');
assert.match(fullView, /data-action="open-rentabilidad-price-import"/, 'the view should provide an explicit import action');
assert.match(fullView, /data-label="Código del producto">003<\/td>/, 'inactive, out-of-stock products should remain visible by default');
const escapedName = renderRentabilidad(state, { active: 'inactive' });
assert.match(escapedName, /&lt;Producto&gt;/, 'product names should be escaped in generated markup');
const codeNameAndReferenceFilter = renderRentabilidadResults(state, { code: '001', name: 'sofa', reference: 'ref-001' });
assert.match(codeNameAndReferenceFilter, /<strong>Sofa<\/strong>/, 'code, name, and reference searches should combine');
assert.doesNotMatch(codeNameAndReferenceFilter, /<strong>Cama<\/strong>/);
const localStockFilter = renderRentabilidadResults(state, { store: 'LOC-2', stock: 'out-of-stock' });
assert.match(localStockFilter, /<strong>Cama<\/strong>/);
assert.match(localStockFilter, /&lt;Producto&gt;/);
assert.doesNotMatch(localStockFilter, /<strong>Sofa<\/strong>/, 'availability should use the selected local stock');
const inactiveCatalogFilter = renderRentabilidadResults(state, { active: 'inactive' });
assert.match(inactiveCatalogFilter, /<strong>&lt;Producto&gt;<\/strong>/, 'catalog status should filter inactive products separately');
assert.doesNotMatch(inactiveCatalogFilter, /<strong>Sofa<\/strong>/);
const belowCostFilter = renderRentabilidadResults(state, { belowCost: true });
assert.match(belowCostFilter, /<strong>Cama<\/strong>/);
assert.match(belowCostFilter, /&lt;Producto&gt;/);
assert.doesNotMatch(belowCostFilter, /<strong>Sofa<\/strong>/);
const belowMinimumFilter = renderRentabilidadResults(state, { belowMinimum: true });
assert.match(belowMinimumFilter, /<strong>Cama<\/strong>/);
assert.match(belowMinimumFilter, /&lt;Producto&gt;/);
assert.doesNotMatch(belowMinimumFilter, /<strong>Sofa<\/strong>/);
const missingPurchaseHistoryFilter = renderRentabilidadResults(state, { noPurchaseHistory: true });
assert.match(missingPurchaseHistoryFilter, /&lt;Producto&gt;/);
assert.doesNotMatch(missingPurchaseHistoryFilter, /<strong>Sofa<\/strong>/);
const returnedPurchaseHistoryFilter = renderRentabilidadResults({
  products: [{ id: 'P-6', name: 'Compra devuelta', code: '006', salePrice: 120 }],
  stores: [],
  purchases: [{ id: 'PUR-RETURNED', status: 'RECIBIDA', items: [{ productId: 'P-6', quantity: 1, unitCost: 60, discount: 0 }] }],
  supplierReturns: [{ status: 'PROCESADA', purchaseId: 'PUR-RETURNED', productId: 'P-6', quantity: 1 }],
}, { noPurchaseHistory: true });
assert.doesNotMatch(returnedPurchaseHistoryFilter, /<strong>Compra devuelta<\/strong>/);
const combinedFilters = renderRentabilidadResults(state, {
  code: '001',
  category: 'Sala',
  store: 'LOC-1',
  active: 'active',
  stock: 'in-stock',
  belowCost: false,
  belowMinimum: false,
  noPurchaseHistory: false,
});
assert.match(combinedFilters, /<strong>Sofa<\/strong>/, 'independent filters should combine without hiding products by default');
assert.doesNotMatch(combinedFilters, /<strong>Cama<\/strong>/);

const editableProduct = {
  id: 'EDIT-1',
  code: 'EDIT-1',
  name: 'Producto editable',
  price: 120,
  salePrice: 120,
  minimumPrice: 90,
  cost: 60,
};
const historicalSales = [{ items: [{ productId: 'EDIT-1', quantity: 1, unitPrice: 75 }] }];
const editableState = { products: [editableProduct], stores: [], sales: historicalSales };
updateProduct(editableState, 'EDIT-1', { name: editableProduct.name, code: editableProduct.code, price: 140, cost: 60 });
assert.equal(editableProduct.minimumPrice, 90, 'changing the sale price must not overwrite the separately configured minimum');
assert.deepEqual(editableState.sales, historicalSales, 'changing the current price must not rewrite historical sale lines');
assert.throws(
  () => updateProduct(editableState, 'EDIT-1', { name: editableProduct.name, code: editableProduct.code, price: 89, minimumPrice: 90, cost: 60 }),
  /no puede ser menor al precio m[ií]nimo configurado/,
);
updateProduct(editableState, 'EDIT-1', { name: editableProduct.name, code: editableProduct.code, price: 140, minimumPrice: 100, cost: 60 });
assert.equal(editableProduct.minimumPrice, 100, 'the minimum sale price should be independently editable');
const protectedCollections = {
  products: [{ id: 'EDIT-2', code: 'EDIT-2', name: 'Producto protegido', reference: 'REF-2', cost: 800, price: 1000, salePrice: 1000, minimumPrice: 500, category: 'Sala', active: false }],
  purchases: [{ id: 'PUR-KEEP', items: [{ productId: 'EDIT-2', quantity: 2, unitCost: 800 }] }],
  sales: [{ id: 'SALE-KEEP', items: [{ productId: 'EDIT-2', quantity: 1, unitPrice: 1000 }] }],
  inventoryByStore: [{ productId: 'EDIT-2', storeId: 'LOC-1', quantity: 7 }],
  inventoryMovements: [{ id: 'MOVE-KEEP', productId: 'EDIT-2', quantity: 2 }],
};
const protectedSnapshot = structuredClone(protectedCollections);
const pricingDraft = { products: protectedCollections.products.map(product => ({ ...product })) };
const repricedProduct = updateProductPricing(pricingDraft, 'EDIT-2', { price: '1.234.567', minimumPrice: '1.000.000' });
assert.equal(repricedProduct.price, 1234567);
assert.equal(repricedProduct.minimumPrice, 1000000);
assert.equal(repricedProduct.cost, 800);
assert.equal(repricedProduct.active, false);
assert.deepEqual(protectedCollections, protectedSnapshot, 'price validation should not mutate the source product or other ERP collections');
for (const invalidPrice of ['', '-1', '1,000', '12.34', '1.5', 'not a price']) {
  assert.throws(
    () => updateProductPricing(pricingDraft, 'EDIT-2', { price: invalidPrice, minimumPrice: '500' }),
    /valor válido|valor permitido/,
    `invalid COP amount ${JSON.stringify(invalidPrice)} should be rejected`,
  );
}
assert.throws(
  () => updateProductPricing(pricingDraft, 'EDIT-2', { price: '499', minimumPrice: '500' }),
  /no puede ser menor al precio m[ií]nimo configurado/,
);
assert.throws(
  () => updateProductPricing(pricingDraft, 'EDIT-2', { price: '1.000', minimumPrice: '' }),
  /valor válido|valor permitido/,
);
const newProductState = { products: [], stores: [] };
const createdProduct = createProduct(newProductState, { name: 'Nuevo', code: 'NEW-1', price: 120, cost: 60 });
assert.equal(createdProduct.minimumPrice, 0, 'products without a configured minimum must not receive an automatic percentage floor');

globalThis.window = { location: { hostname: 'localhost', protocol: 'http:' } };
globalThis.localStorage = { getItem: () => null };
globalThis.fetch = async () => new Response(JSON.stringify({
  products: [{ id: 'P-4', name: 'Mesa', code: '004', cost: 75, salePrice: 150, minimumPrice: 110, taxRate: 19, active: true }],
  stores: [],
  sales: [],
  inventory: [],
}), { status: 200, headers: { 'content-type': 'application/json' } });
const { hydrateCatalog } = await import('../js/data/storage.js');
const hydratedState = {
  products: [{ id: 'P-4', description: 'Madera', specialPrice: 135, minimumPrice: 100 }],
  stores: [],
  sales: [],
  inventoryByStore: [],
};
await hydrateCatalog(hydratedState);
assert.equal(hydratedState.products[0].salePrice, 150, 'catalog hydration should retain its persisted sale price');
assert.equal(hydratedState.products[0].price, 150);
assert.equal(hydratedState.products[0].minimumPrice, 110, 'catalog hydration should retain the persisted independent minimum price');
assert.equal(hydratedState.products[0].specialPrice, 135, 'catalog hydration should preserve pricing metadata absent from the catalog response');
assert.equal(hydratedState.products[0].description, 'Madera', 'catalog hydration should preserve product metadata absent from the catalog response');
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify({
  error: 'El lote se revirtió.',
  updated: [],
  notUpdated: [{ id: 'P-4', reason: 'Transacción revertida.' }],
}), { status: 500, headers: { 'content-type': 'application/json' } });
try {
  const { api } = await import('../js/services/api-client.js?v=20261125-rentabilidad-bulk-v1');
  await assert.rejects(
    api.put('/api/catalog/product/pricing/bulk', { items: [] }),
    error => error.details?.notUpdated?.[0]?.id === 'P-4',
    'bulk API errors should retain per-product server results',
  );
} finally {
  globalThis.fetch = previousFetch;
}
