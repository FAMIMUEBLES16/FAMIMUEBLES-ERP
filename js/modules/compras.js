import { money, page, table, badge } from '../components/tables.js';
import { purchaseTotal } from '../services/purchase-service.js';

function parseRemoteRow(item = {}) {
  const raw = item?.data_json;
  if (!raw) return item;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      return { ...item, ...parsed };
    }
  } catch (error) {
    // Ignorar si el JSON anidado no es válido.
  }
  return item;
}

function lookupStoreName(stores = [], purchase = {}) {
  const lookupId = purchase.storeId || purchase.localId || purchase.local_id || purchase.localId || purchase.store_id || purchase.local || purchase.local_destino || purchase.local_origen;
  const byId = (stores || []).find(item => String(item.id) === String(lookupId));
  if (byId) return byId.name || byId.code || 'Sin local';
  const directName = purchase.storeName || purchase.localName || purchase.local_nombre || purchase.destination || purchase.destino || purchase.store || purchase.localNombre;
  if (directName) return String(directName);
  const codeMatch = (stores || []).find(item => String(item.code) === String(purchase.local || purchase.storeCode || purchase.store_code || purchase.local_codigo));
  return codeMatch ? (codeMatch.name || codeMatch.code || 'Sin local') : 'Sin local';
}

function normalizePurchases(items = []) {
  return (Array.isArray(items) ? items : []).map(item => {
    const row = parseRemoteRow(item);
    const sharedEntry = Boolean(row.estado || row.local || row.supplier_name || String(row.observacion || '').toUpperCase().includes('ENTRADA'));
    const total = Number(row.total ?? row.valor ?? row.monto ?? row.amount ?? row.valor_total ?? row.total_venta ?? 0);
    const createdAt = row.createdAt ?? row.fecha ?? row.created_at ?? row.fecha_venta ?? '';
    const supplierName = row.supplierName ?? row.proveedor ?? row.empleado ?? row.usuario ?? row.vendedor ?? row.supplier ?? 'Proveedor';
    const storeId = row.storeId ?? row.local_id ?? row.local ?? row.local_destino ?? row.local_origen ?? '';
    const status = row.status ?? row.estado ?? 'RECIBIDA';
    const normalizedStatus = String(status).toUpperCase() === 'COMPLETADO' && String(row.observacion || '').toUpperCase().includes('ENTRADA') ? 'RECIBIDA' : status;
    return {
      ...row,
      id: String(row.id ?? row.factura ?? row.numero_factura ?? 'ENTR-01'),
      createdAt: String(createdAt),
      supplierName: String(supplierName || 'Proveedor'),
      storeId: String(storeId),
      total,
      status: String(normalizedStatus),
      sharedEntry,
    };
  });
}

export function purchaseTable(state, items) {
  const suppliers = state.suppliers || [];
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  const records = normalizePurchases(items);
  return table(['Compra','Fecha','Proveedor','Destino','Total','Estado','Acciones'], records.map(purchase => {
    const supplier = suppliers.find(item => item.id === purchase.supplierId) ?? { name: purchase.supplierName || purchase.supplierId || 'Proveedor' };
    const dateText = purchase.createdAt ? String(purchase.createdAt).slice(0, 10) : 'Sin fecha';
    const destination = lookupStoreName(state.stores || [], purchase);
    const totalValue = Number(purchase.total ?? purchaseTotal(state, purchase) ?? 0);
    const currentStatus = String(purchase.status || 'RECIBIDA').toUpperCase();
    return `<tr><td><strong>${purchase.id}</strong></td><td>${dateText}</td><td>${supplier.name}</td><td>${destination}</td><td>${money(totalValue)}</td><td>${badge(currentStatus)}</td><td><button class="table-action" data-action="purchase-detail" data-purchase-id="${purchase.id}">Ver</button>${!purchase.sharedEntry && currentStatus === 'BORRADOR' ? `<button class="table-action" data-action="order-purchase" data-purchase-id="${purchase.id}">Ordenar</button>` : ''}${!purchase.sharedEntry && currentStatus === 'ORDENADA' ? `<button class="table-action" data-action="receive-purchase" data-purchase-id="${purchase.id}">Recibir</button>` : ''}${!purchase.sharedEntry && currentStatus !== 'RECIBIDA' && currentStatus !== 'CANCELADA' ? `<button class="table-action" data-action="cancel-purchase" data-purchase-id="${purchase.id}">Cancelar</button>` : ''}${isAdmin ? `<button class="table-action" data-action="edit-purchase" data-purchase-id="${purchase.id}">Editar</button><button class="table-action danger-text" data-action="delete-purchase" data-purchase-id="${purchase.id}">Eliminar</button>` : ''}</td></tr>`;
  }));
}

export function renderCompras(state) {
  const stores = (state.stores || []).map(item => `<option value="${item.id}">${item.name}</option>`).join('');
  const suppliers = (state.suppliers || []).map(item => `<option value="${item.id}">${item.name}</option>`).join('');
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const sourcePurchases = [...(Array.isArray(state.purchases) ? state.purchases : []), ...entries];
  return page('ABASTECIMIENTO','Compras','<button class="primary" data-action="new-purchase">＋ Nueva compra</button>',`<div class="toolbar"><input class="field" data-filter="purchases" placeholder="Buscar compra, factura o proveedor..."><select class="field" data-purchase-supplier><option value="all">Todos los proveedores</option>${suppliers}</select><select class="field" data-purchase-store><option value="all">Todos los locales</option>${stores}</select><select class="field" data-purchase-status><option value="all">Todos los estados</option><option>BORRADOR</option><option>ORDENADA</option><option>RECIBIDA</option><option>CANCELADA</option></select></div><div id="purchases-table">${purchaseTable(state, sourcePurchases)}</div>`); 
}
