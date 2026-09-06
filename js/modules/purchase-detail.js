import { money, table, badge } from '../components/tables.js';
import { purchaseTotals, purchaseTotal } from '../services/purchase-service.js?v=16';

function findPurchaseRecord(state, purchaseId) {
  const direct = (state.purchases || []).find(item => String(item.id) === String(purchaseId))
    || (state.entries || []).find(item => String(item.id) === String(purchaseId))
    || (state.entries || []).find(item => String(item?.numero_factura || item?.factura || item?.compra_id || '') === String(purchaseId));
  if (direct) {
    const raw = direct?.data_json ?? direct?.dataJson ?? direct?.payload ?? null;
    if (raw) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        return { ...direct, ...parsed };
      } catch (error) {
        return direct;
      }
    }
    return direct;
  }
  return (state.purchases || []).find(item => item.id === purchaseId)
    || (state.movimientos || []).find(item => String(item.id) === String(purchaseId))
    || (state.movements || []).find(item => String(item.id) === String(purchaseId))
    || null;
}

function normalizePurchaseRecord(record) {
  if (!record) return null;
  return {
    ...record,
    status: record.status || record.estado || 'RECIBIDA',
    storeId: record.storeId || record.local_id || record.local || record.local_destino || '',
    supplierName: record.supplierName || record.supplier_name || record.proveedor || record.empleado || 'Proveedor',
    supplierInvoice: record.supplierInvoice || record.factura || record.numero_factura || '',
    createdAt: record.createdAt || record.created_at || record.fecha || '',
    items: Array.isArray(record.items) ? record.items : [],
  };
}

export function purchaseDetail(state, purchaseId) {
  const purchase = normalizePurchaseRecord(findPurchaseRecord(state, purchaseId));
  if (!purchase) return '<p class="empty-state">Compra no encontrada.</p>';
  if (!purchase.items.length) {
    purchase.items = (state.inventoryMovements || state.movements || [])
      .filter(item => String(item.movementId || item.movimiento_id || item.id) === String(purchaseId))
      .map(item => ({ productId: item.productId || item.codigo, name: item.name || item.descripcion || item.producto, quantity: item.quantity || item.cantidad, unitCost: item.unitCost || item.precio_unitario || 0, subtotal: item.subtotal || item.precio_total || 0 }));
  }
  const supplier = (state.suppliers || []).find(item => item.id === purchase.supplierId) || { name: purchase.supplierName || purchase.supplierId || 'Proveedor' };
  const totals = purchaseTotals(state, purchase);
  const destination = (state.stores || []).find(item => String(item.id) === String(purchase.storeId || purchase.local_id || purchase.local))?.name || purchase.storeName || purchase.local || purchase.storeId || 'Sin local';
  const createdAt = purchase.createdAt || purchase.fecha || purchase.created_at || new Date().toISOString();
  return `<div class="modal-backdrop"><section class="modal purchase-detail-modal"><button type="button" class="modal-close">×</button><p class="eyebrow">DETALLE DE COMPRA</p><h2>${purchase.id}</h2><div class="detail-grid"><div><span>Proveedor</span><strong>${supplier?.name || purchase.supplierId}</strong></div><div><span>Factura proveedor</span><strong>${purchase.supplierInvoice || '-'}</strong></div><div><span>Fecha</span><strong>${String(createdAt).slice(0,10)}</strong></div><div><span>Destino</span><strong>${destination}</strong></div><div><span>Estado</span><strong>${badge(purchase.status)}</strong></div><div><span>Forma de pago</span><strong>${purchase.paymentMethod || 'Sin dato'}</strong></div></div><h3>Productos</h3>${table(['Producto','Cantidad','Costo','IVA','Descuento','Subtotal'],(purchase.items || []).map(item=>`<tr><td>${(state.products || []).find(product=>String(product.id)===String(item.productId))?.name || item.name || item.description || item.productId || 'Producto'}</td><td>${item.quantity || 0}</td><td>${money(item.unitCost || item.price || 0)}</td><td>${item.iva || 0}%</td><td>${money(item.discount || 0)}</td><td>${money(item.subtotal ?? Math.max(0,Number(item.quantity||0)*Number(item.unitCost||item.price||0)-Number(item.discount||0)))}</td></tr>`))}<div class="financial-summary"><div><span>Subtotal</span><strong>${money(totals.subtotal)}</strong></div><div><span>IVA</span><strong>${money(totals.tax)}</strong></div><div><span>Descuento</span><strong>${money(totals.discount)}</strong></div><div class="grand-total"><span>Total</span><strong>${money(purchaseTotal(state,purchase))}</strong></div></div><p>${purchase.notes || purchase.observacion || 'Sin observaciones.'}</p></section></div>`;
}
