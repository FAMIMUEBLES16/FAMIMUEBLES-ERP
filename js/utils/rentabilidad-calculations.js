import { inventoryRows } from './inventory.js';
import { averageSalePrices, salePriceStatistics } from './pricing.js?v=2';

const numberValue = value => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const firstValue = (record, fields) => {
  for (const field of fields) {
    const value = record?.[field];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
};

function receivedStatus(record) {
  const status = String(firstValue(record, ['status', 'estado']) ?? '').trim().toUpperCase();
  return ['RECIBIDA', 'RECIBIDO', 'COMPLETADA', 'COMPLETADO'].includes(status);
}

function purchaseCostStatistics(data, products, supplierReturns) {
  const purchaseLots = new Map();
  const latestCosts = new Map();
  const purchaseHistory = new Set();
  const validStatuses = new Set(['PROCESADA', 'RECIBIDA', 'APROBADA']);
  const productIdsByAlias = new Map();
  products.forEach(product => {
    [product.id, product.code, product.codigo].forEach(alias => {
      if (alias !== undefined && alias !== null && String(alias).trim()) {
        productIdsByAlias.set(String(alias).trim(), String(product.id));
      }
    });
  });
  const receipts = [];
  const receiptIds = new Set();
  const addReceipt = (record, items, defaultStatus = '') => {
    if (!record || !Array.isArray(items)) return;
    const normalizedStatus = firstValue(record, ['status', 'estado']) ?? defaultStatus;
    if (!receivedStatus({ status: normalizedStatus })) return;
    const id = String(firstValue(record, ['id', 'purchaseId', 'purchase_id', 'compra_id']) ?? `received-${receipts.length}`);
    receiptIds.add(id);
    receipts.push({
      id,
      receivedAt: Date.parse(firstValue(record, ['receivedAt', 'received_at', 'createdAt', 'created_at', 'fecha']) || '') || 0,
      items,
    });
  };
  (Array.isArray(data?.purchases) ? data.purchases : []).forEach((purchase, index) => {
    if (!purchase) return;
    addReceipt(purchase, purchase.items, '');
    if (!Array.isArray(purchase.items) && Array.isArray(purchase.detalles)) {
      addReceipt({ ...purchase, id: purchase.id ?? `purchase-${index}` }, purchase.detalles, '');
    }
  });
  (Array.isArray(data?.entries) ? data.entries : []).forEach((entry, index) => {
    if (!entry || !Array.isArray(entry.items)) return;
    addReceipt({ ...entry, id: entry.id ?? `entry-${index}` }, entry.items, 'RECIBIDA');
  });

  const movementGroups = new Map();
  (Array.isArray(data?.inventoryMovements) ? data.inventoryMovements : []).forEach(movement => {
    if (!movement) return;
    const type = String(firstValue(movement, ['type', 'tipo', 'movementType']) ?? '').trim().toUpperCase();
    if (!['ENTRADA', 'COMPRA_ENTRADA'].includes(type)) return;
    const status = firstValue(movement, ['status', 'estado']);
    const hasReceivedQuantity = Number(firstValue(movement, ['entrada', 'receivedQuantity', 'cantidad_recibida']) ?? 0) > 0;
    if (status !== undefined && status !== null && status !== '' && !receivedStatus({ status })) return;
    if ((status === undefined || status === null || status === '') && !hasReceivedQuantity) return;
    const reference = String(firstValue(movement, ['referenceId', 'purchaseId', 'purchase_id', 'referencia', 'compra_id']) ?? '').trim();
    const movementId = String(firstValue(movement, ['id', 'movementId', 'movement_id', 'movimiento_id']) ?? '').trim();
    if ((reference && receiptIds.has(reference)) || (!reference && movementId && receiptIds.has(movementId))) return;
    const id = reference || movementId;
    if (!id) return;
    const group = movementGroups.get(id) || {
      id: `movement-${id}`,
      receivedAt: Date.parse(firstValue(movement, ['receivedAt', 'received_at', 'createdAt', 'created_at', 'fecha']) || '') || 0,
      items: [],
    };
    group.items.push(movement);
    movementGroups.set(id, group);
  });
  receipts.push(...movementGroups.values());

  receipts.forEach((purchase, purchaseIndex) => {
    const purchaseId = String(purchase.id ?? `received-${purchaseIndex}`);
    const receivedAt = purchase.receivedAt || 0;
    let lotsByProduct = purchaseLots.get(purchaseId);
    if (!lotsByProduct) {
      lotsByProduct = new Map();
      purchaseLots.set(purchaseId, lotsByProduct);
    }
    purchase.items.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const productAlias = String(firstValue(item, ['productId', 'product_id', 'code', 'codigo']) ?? '').trim();
      const productId = productIdsByAlias.get(productAlias) || productAlias;
      const quantity = Number(firstValue(item, ['quantity', 'cantidad', 'receivedQuantity', 'cantidad_recibida', 'entrada']));
      const unitCost = Number(firstValue(item, ['unitCost', 'unit_cost', 'cost', 'price', 'precio_unitario', 'valor_unitario', 'precio_compra']));
      const discount = Number(firstValue(item, ['discount', 'descuento']) ?? 0);
      const grossCost = quantity * unitCost;
      if (!productId || !Number.isFinite(quantity) || quantity <= 0
        || !Number.isFinite(unitCost) || unitCost < 0
        || !Number.isFinite(discount) || discount < 0 || discount > grossCost) return;
      const lot = lotsByProduct.get(productId) || { quantity: 0, value: 0 };
      lot.quantity += quantity;
      lot.value += grossCost - discount;
      lotsByProduct.set(productId, lot);
      purchaseHistory.add(productId);
    });
    lotsByProduct.forEach((lot, productId) => {
      if (lot.quantity <= 0) return;
      const current = latestCosts.get(productId);
      if (!current || receivedAt > current.receivedAt || (receivedAt === current.receivedAt && purchaseIndex >= current.purchaseIndex)) {
        latestCosts.set(productId, { unitCost: lot.value / lot.quantity, receivedAt, purchaseIndex });
      }
    });
  });

  (Array.isArray(supplierReturns) ? supplierReturns : []).forEach(record => {
    if (!record || !validStatuses.has(String(record.status || '').toUpperCase())) return;
    const purchaseId = String(record.purchaseId ?? '');
    const productId = String(record.productId ?? '');
    const lot = purchaseLots.get(purchaseId)?.get(productId);
    const quantity = Number(record.quantity);
    if (!lot || !Number.isFinite(quantity) || quantity <= 0 || lot.quantity <= 0) return;
    const returnedQuantity = Math.min(quantity, lot.quantity);
    const returnedValue = (lot.value / lot.quantity) * returnedQuantity;
    lot.quantity -= returnedQuantity;
    lot.value -= returnedValue;
  });

  const totals = new Map();
  purchaseLots.forEach(lotsByProduct => lotsByProduct.forEach((lot, productId) => {
    const current = totals.get(productId) || { quantity: 0, value: 0 };
    current.quantity += lot.quantity;
    current.value += lot.value;
    totals.set(productId, current);
  }));
  const averageCosts = new Map([...totals]
    .filter(([, total]) => total.quantity > 0)
    .map(([productId, total]) => [productId, total.value / total.quantity]));
  return {
    averageCosts,
    purchaseHistory,
    latestCosts: new Map([...latestCosts].map(([productId, latest]) => [productId, latest.unitCost])),
  };
}

function priceStatus({ price, cost, minimumPrice }) {
  if (price <= 0) return { label: 'Sin precio', className: 'rentabilidad-price-status--missing' };
  if (cost <= 0) return { label: 'Sin costo', className: 'rentabilidad-price-status--warning' };
  if (price < cost) return { label: 'Bajo costo', className: 'rentabilidad-price-status--danger' };
  if (price === cost) return { label: 'Sin margen', className: 'rentabilidad-price-status--warning' };
  if (minimumPrice !== null && minimumPrice > 0 && price < minimumPrice) {
    return { label: 'Bajo mínimo', className: 'rentabilidad-price-status--warning' };
  }
  return { label: 'Con margen', className: 'rentabilidad-price-status--success' };
}

export function pricingAnalysis(data, storeId = 'all') {
  const products = Array.isArray(data?.products) ? data.products : [];
  const stores = Array.isArray(data?.stores) ? data.stores : [];
  const rows = inventoryRows({ ...data, products, stores }, storeId);
  const stockByProduct = new Map();
  rows.forEach(row => {
    const key = String(row.product.id);
    stockByProduct.set(key, (stockByProduct.get(key) || 0) + numberValue(row.quantity));
  });
  const sales = salePriceStatistics(data || {});
  const historicalPrices = averageSalePrices(data || {});
  const purchaseCosts = purchaseCostStatistics(data, products, [
    ...(Array.isArray(data?.supplierReturns) ? data.supplierReturns : []),
    ...(Array.isArray(data?.['supplier-returns']) ? data['supplier-returns'] : []),
  ]);

  return products.map(product => {
    const cost = numberValue(product.cost);
    const price = numberValue(product.salePrice ?? product.price);
    const minimumPriceValue = Number(product.minimumPrice);
    const minimumPrice = product.minimumPrice !== null && product.minimumPrice !== undefined && Number.isFinite(minimumPriceValue)
      ? minimumPriceValue
      : null;
    const historicalAverage = historicalPrices.get(product.id);
    const weightedAverageCost = purchaseCosts.averageCosts.get(String(product.id)) ?? null;
    const lastPurchaseCost = purchaseCosts.latestCosts.get(String(product.id)) ?? (cost > 0 ? cost : null);
    const referenceCost = weightedAverageCost > 0 ? weightedAverageCost : lastPurchaseCost;
    const margin = price > 0 && weightedAverageCost > 0 ? price - weightedAverageCost : null;
    return {
      product,
      hasPurchaseHistory: purchaseCosts.purchaseHistory.has(String(product.id)),
      cost,
      price,
      lastPurchaseCost,
      weightedAverageCost,
      referenceCost,
      minimumPrice,
      margin,
      marginPercent: margin === null ? null : (margin / price) * 100,
      marginUnavailableReason: price <= 0 || weightedAverageCost <= 0 ? 'N/A' : '',
      priceStatus: priceStatus({ price, cost: referenceCost, minimumPrice }),
      historicalAverage: Number.isFinite(historicalAverage) ? historicalAverage : null,
      historicalQuantity: sales.quantities.get(product.id) || 0,
      priceDifference: Number.isFinite(historicalAverage) ? price - historicalAverage : null,
      stock: stockByProduct.get(String(product.id)) || 0,
    };
  });
}

export function profitabilityMetrics(rows) {
  const inventoryUnits = rows.reduce((sum, row) => sum + Math.max(0, row.stock), 0);
  const inventoryWithCost = rows.filter(row => row.stock > 0 && row.referenceCost > 0);
  const inventoryWithPrice = rows.filter(row => row.stock > 0 && row.price > 0);
  const uncostedInventoryUnits = rows
    .filter(row => row.stock > 0 && !(row.referenceCost > 0))
    .reduce((sum, row) => sum + row.stock, 0);
  const unpricedInventoryUnits = rows
    .filter(row => row.stock > 0 && !(row.price > 0))
    .reduce((sum, row) => sum + row.stock, 0);
  const totalInventoryCost = inventoryWithCost.reduce((sum, row) => sum + row.referenceCost * row.stock, 0);
  const potentialSaleValue = inventoryWithPrice.reduce((sum, row) => sum + row.price * row.stock, 0);
  return {
    totalProducts: rows.length,
    inventoryUnits,
    totalInventoryCost,
    potentialSaleValue,
    uncostedInventoryUnits,
    unpricedInventoryUnits,
    pricesToReview: rows.filter(row => row.price <= 0 || row.referenceCost === null || row.price <= row.referenceCost
      || (row.minimumPrice !== null && row.minimumPrice > 0 && row.price < row.minimumPrice)).length,
    outOfStock: rows.filter(row => row.stock <= 0).length,
  };
}
