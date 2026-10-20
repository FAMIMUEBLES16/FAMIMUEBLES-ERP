import { money, page, table, badge } from '../components/tables.js';
import { purchaseTotal } from '../services/purchase-service.js';
import { accountPayableSupplierName } from '../services/accounts-payable-service.js?v=20261019-preserve-supplier-history-v1';

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

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

function storeFingerprint(purchase, stores = []) {
  const value = String(purchase.storeId || purchase.local_id || purchase.local || '');
  const store = stores.find(candidate => [candidate.id, candidate.code, candidate.name].some(key => String(key || '') === value));
  return normalizeText(store?.name || value);
}

function supplierFingerprint(purchase, suppliers = []) {
  const id = String(purchase.supplierId || purchase.supplier_id || purchase.proveedor_id || '');
  const supplier = suppliers.find(candidate => String(candidate.id) === id);
  return normalizeText(supplier?.name || purchase.supplierName || purchase.supplier_name || purchase.proveedor || purchase.empleado || id);
}

function samePurchaseEntry(purchase, entry, stores) {
  const explicitLinks = [
    entry.purchaseId,
    entry.purchase_id,
    entry.compra_id,
    entry.referencia,
    entry.reference,
    entry.purchaseReference,
  ].some(id => String(id || '') === String(purchase.id));
  if (explicitLinks) return true;
  const purchaseInvoice = normalizeText(purchase.supplierInvoice || purchase.invoiceNumber || purchase.factura);
  const entryInvoice = normalizeText(entry.supplierInvoice || entry.invoiceNumber || entry.factura || entry.numero_factura);
  const purchaseDate = String(purchase.createdAt || purchase.created_at || purchase.fecha || '').slice(0, 10);
  const entryDate = String(entry.createdAt || entry.created_at || entry.fecha || '').slice(0, 10);
  return Boolean(
    purchaseInvoice &&
    purchaseInvoice === entryInvoice &&
    purchaseDate &&
    purchaseDate === entryDate &&
    storeFingerprint(purchase, stores) === storeFingerprint(entry, stores)
  );
}

export function normalizePurchases(items = [], suppliers = [], stores = []) {
  const normalized = (Array.isArray(items) ? items : []).map(item => {
    const row = parseRemoteRow(item);
    const sharedEntry = /^\d+$/.test(String(row.id || '').trim()) || row.sharedEntry === true;
    const total = Number(row.total ?? row.valor ?? row.monto ?? row.amount ?? row.valor_total ?? row.total_venta ?? (Array.isArray(row.items) ? purchaseTotal(null, row) : 0));
    const createdAt = row.createdAt ?? row.fecha ?? row.created_at ?? row.fecha_venta ?? '';
    const supplierId = row.supplierId ?? row.supplier_id ?? row.proveedor_id ?? row.id_proveedor ?? '';
    const supplier = suppliers.find(candidate => String(candidate.id) === String(supplierId));
    const rawSupplierName = row.supplierName ?? row.supplier_name ?? row.proveedor ?? row.supplier ?? row.empleado ?? row.usuario ?? row.vendedor ?? '';
    const supplierName = suppliers.find(candidate => String(candidate.id) === String(rawSupplierName))?.name || rawSupplierName || supplier?.name || supplierId || 'Proveedor';
    const storeId = row.storeId ?? row.local_id ?? row.local ?? row.local_destino ?? row.local_origen ?? '';
    const status = row.status ?? row.estado ?? 'RECIBIDA';
    const normalizedStatus = String(status).toUpperCase() === 'COMPLETADO' && sharedEntry ? 'RECIBIDA' : status;
    return {
      ...row,
      id: String(row.id ?? row.factura ?? row.numero_factura ?? 'ENTR-01'),
      createdAt: String(createdAt),
      supplierId: String(supplierId),
      supplierName: String(supplierName || 'Proveedor'),
      storeId: String(storeId),
      total,
      status: String(normalizedStatus),
      sharedEntry,
    };
  });
  const entries = normalized.filter(item => item.sharedEntry);
  const seenEntries = new Set();
  const seenEntryIds = new Set();
  const deduplicated = normalized.filter(item => {
    if (item.sharedEntry) {
      const id = String(item.id);
      if (seenEntryIds.has(id)) return false;
      seenEntryIds.add(id);
      return true;
    }
    const matches = entries.filter(entry => !seenEntries.has(entry)
      && samePurchaseEntry(item, entry, stores)
      && supplierFingerprint(item, suppliers) === supplierFingerprint(entry, suppliers));
    if (matches.length !== 1) return true;
    seenEntries.add(matches[0]);
    matches[0].duplicatePurchaseIds = [...(matches[0].duplicatePurchaseIds || []), item.id];
    return false;
  });
  return deduplicated.sort((left, right) => {
    const dateOrder = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return Number.isFinite(dateOrder) && dateOrder !== 0 ? dateOrder : String(right.id).localeCompare(String(left.id));
  });
}

export function purchaseTable(state, items) {
  const suppliers = state.suppliers || [];
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  const records = normalizePurchases(items, suppliers, state.stores || []);
  return table(['Compra','Fecha','Proveedor','Destino','Total','Estado','Acciones'], records.map(purchase => {
    const payable = (state.accountsPayable || []).find(account =>
      String(account.purchaseId || '') === String(purchase.id)
    );
    const supplier = suppliers.find(item => item.id === purchase.supplierId) ?? { name: purchase.supplierName || purchase.supplierId || 'Proveedor' };
    const supplierName = purchase.supplierName && purchase.supplierName !== 'Proveedor'
      ? purchase.supplierName
      : supplier.name;
    const displaySupplierName = payable
      ? accountPayableSupplierName(state, payable)
      : supplierName;
    const dateText = purchase.createdAt ? String(purchase.createdAt).slice(0, 10) : 'Sin fecha';
    const destination = lookupStoreName(state.stores || [], purchase);
    const totalValue = Number(purchase.total ?? purchaseTotal(state, purchase) ?? 0);
    const currentStatus = String(purchase.status || 'RECIBIDA').toUpperCase();
    const deleteAction=purchase.duplicatePurchaseIds?.length
      ? purchase.duplicatePurchaseIds.filter(id=>String(id)!==String(purchase.id)).map(id=>`<button class="table-action danger-text" data-action="delete-purchase-mirror" data-purchase-id="${id}" data-entry-id="${purchase.id}">Eliminar duplicado ${id}</button>`).join('')
      : `<button class="table-action danger-text" data-action="delete-purchase" data-purchase-id="${purchase.id}">Eliminar</button>`;
    return `<tr><td><strong>${purchase.id}</strong></td><td>${dateText}</td><td>${displaySupplierName}</td><td>${destination}</td><td>${money(totalValue)}</td><td>${badge(currentStatus)}</td><td><button class="table-action" data-action="purchase-detail" data-purchase-id="${purchase.id}">Ver</button>${isAdmin ? `<button class="table-action" data-action="edit-purchase" data-purchase-id="${purchase.id}">Editar</button>${deleteAction}` : ''}</td></tr>`;
  }));
}

export function purchaseSummary(state, items) {
  const records = normalizePurchases(items, state.suppliers || [], state.stores || []);
  const total = records.reduce((sum, purchase) => sum + Number(purchase.total || purchaseTotal(state, purchase) || 0), 0);
  return `<div class="record-summary"><strong class="record-summary-count">${records.length}</strong><div><h3>Resumen de compras</h3><p>Valor: ${money(total)}</p></div></div>`;
}

export function renderCompras(state) {
  const stores = (state.stores || []).map(item => `<option value="${item.id}">${item.name}</option>`).join('');
  const suppliers = (state.suppliers || []).map(item => `<option value="${item.id}">${item.name}</option>`).join('');
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const sourcePurchases = [...(Array.isArray(state.purchases) ? state.purchases : []), ...entries];
  return page('ABASTECIMIENTO','Compras','<button class="primary" data-action="new-purchase">＋ Nueva compra</button>',`<div class="toolbar"><label class="input-label">Buscar compras<input class="field" data-filter="purchases" placeholder="Buscar compra, factura o proveedor..."></label><label class="input-label">Proveedor<select class="field" data-purchase-supplier><option value="all">Todos los proveedores</option>${suppliers}</select></label><label class="input-label">Local<select class="field" data-purchase-store><option value="all">Todos los locales</option>${stores}</select></label><label class="input-label">Estado<select class="field" data-purchase-status><option value="all">Todos los estados</option><option>RECIBIDA</option></select></label></div><div data-purchase-summary>${purchaseSummary(state, sourcePurchases)}</div><div id="purchases-table">${purchaseTable(state, sourcePurchases)}</div>`);
}
