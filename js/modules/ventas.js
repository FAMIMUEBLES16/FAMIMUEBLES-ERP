import { money, page, table, badge, recordSummary } from '../components/tables.js?v=20261010-record-summary-v1';
import { justifiedTalonarioDocuments } from './talonarios.js?v=25';

function parseRemoteRow(item = {}) {
  const raw = item?.data_json;
  if (!raw) return item;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      return { ...item, ...parsed };
    }
  } catch (error) {
    // Ignorar y usar la fila original si la estructura no es JSON válido.
  }
  return item;
}

function sellerKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}
function normalizeDisplayText(value, fallback = 'Sin dato') {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!raw || ['undefined', 'null', 'sin nombre', 'sin cliente', 'cliente', 'cliente sin nombre', 'contado'].includes(raw.toLowerCase())) return fallback;
  if (/^(mov|cli|customer|cliente)[-_ ]?\d+$/i.test(raw) || /^\d{3,}$/i.test(raw)) return `Cliente ${raw}`;
  return raw;
}
function normalizePhysicalInvoice(row) {
  const raw = Number(String(row.invoiceNumber ?? row.numero_factura ?? row.invoice ?? '').trim());
  const store = String(row.storeId ?? row.local_id ?? row.localId ?? row.local ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (store === 'INVCRR5556'.replace(/[^A-Z0-9]/g, '') && raw >= 5000 && raw < 10000 && raw + 10000 >= 15701 && raw + 10000 <= 15750) return raw + 10000;
  return Number.isFinite(raw) && raw > 0 ? raw : '';
}

export function saleTimestamp(value) {
  const text = String(value || '').trim();
  if (!text) return 0;
  const localMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:[ T](\d{1,2}):?(\d{2})?(?::?(\d{2}))?)?/);
  if (localMatch && !/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [, day, month, yearValue, hour = '0', minute = '0', second = '0'] = localMatch;
    const year = Number(yearValue.length === 2 ? `20${yearValue}` : yearValue);
    return Date.UTC(year, Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
  }
  const isoTimestamp = Date.parse(text);
  if (Number.isFinite(isoTimestamp)) return isoTimestamp;
  const match = localMatch;
  if (!match) return 0;
  const [, first, second, yearValue, hour = '0', minute = '0', secondValue = '0'] = match;
  const year = Number(yearValue.length === 2 ? `20${yearValue}` : yearValue);
  const day = Number(first);
  const month = Number(second);
  return Date.UTC(year, month - 1, day, Number(hour), Number(minute), Number(secondValue));
}

export function salesMonthKey(value) {
  const text = String(value || '').trim();
  const isoDate = text.match(/^(\d{4})-(\d{2})/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}`;
  const localDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (localDate) {
    const year = localDate[3].length === 2 ? `20${localDate[3]}` : localDate[3];
    return `${year}-${String(localDate[2]).padStart(2, '0')}`;
  }
  const timestamp = saleTimestamp(text);
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function localKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function customerMatchKey(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function findMatchingSaleCustomer(sale, customers = []) {
  const customerId = String(sale?.customerId ?? sale?.customer_id ?? sale?.cliente_id ?? '').trim();
  const customerName = String(sale?.customer ?? sale?.cliente ?? sale?.cliente_nombre ?? sale?.customer_name ?? sale?.nombre_cliente ?? customerId).trim();
  const nameKey = customerMatchKey(customerName);
  return customers.find(customer =>
    (customerId && String(customer.id) === customerId)
    || (nameKey && customerMatchKey(customer.name ?? customer.customer ?? customer.nombre) === nameKey)
  ) || null;
}
function escapeOptionText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function saleSellerValue(sale) {
  return String(
    sale?.seller ?? sale?.vendedor ?? sale?.empleado ?? sale?.usuario
    ?? sale?.usuario_nombre ?? sale?.userName ?? sale?.user
    ?? sale?.createdBy ?? sale?.created_by ?? sale?.userId ?? sale?.usuario_id ?? ''
  ).trim();
}

function sellerUser(user) {
  return canonicalSellerName(user?.name || user?.displayName || user?.username || user?.nombre || '');
}

function sellerFilterValue(name) {
  return `seller:${sellerKey(name)}`;
}

function resolveSaleSeller(sale, users = []) {
  const value = saleSellerValue(sale);
  const valueKey = sellerKey(value);
  const matches = users.filter(user => {
    const identifiers = [user?.id, user?.username, user?.authAccountId, user?.authUserId]
      .map(item => String(item ?? '').trim())
      .filter(Boolean);
    const names = [user?.name, user?.displayName, user?.username, user?.nombre]
      .map(sellerKey)
      .filter(Boolean);
    return identifiers.includes(value) || (valueKey && names.includes(valueKey));
  });
  const user = matches[0];
  const name = sellerUser(user) === 'Sin vendedor'
    ? canonicalSellerName(value)
    : sellerUser(user);
  return {
    value: sellerFilterValue(name),
    name,
  };
}

export function salesSellers(sales, users = []) {
  const sellers = new Map();
  users.forEach(user => {
    const name = sellerUser(user);
    if (name === 'Sin vendedor') return;
    const value = sellerFilterValue(name);
    if (!sellers.has(value)) sellers.set(value, { value, name });
  });
  normalizeSales(sales).forEach(sale => {
    const seller = resolveSaleSeller(sale, users);
    if (seller.name !== 'Sin vendedor' && !sellers.has(seller.value)) {
      sellers.set(seller.value, seller);
    }
  });
  return [...sellers.values()].sort((left, right) => left.name.localeCompare(right.name, 'es'));
}

export function filterSales(sales, { query = '', store = 'all', month = '', seller = 'all', stores = [], users = [] } = {}) {
  const normalizedQuery = String(query).toLocaleLowerCase();
  const selectedStore = stores.find(item => String(item.id) === String(store));
  const selectedStoreKey = localKey(selectedStore?.name || store);
  return sales.filter(sale => {
    const haystack = Object.values(sale).join(' ').toLocaleLowerCase();
    const storeMatches = store === 'all' || String(sale.storeId) === String(store) || localKey(sale.storeId) === selectedStoreKey;
    return (!normalizedQuery || haystack.includes(normalizedQuery))
      && storeMatches
      && (!month || salesMonthKey(sale.date) === month)
      && (seller === 'all' || resolveSaleSeller(sale, users).value === seller);
  });
}

export function canonicalSellerName(value) {
  const key = sellerKey(value);
  if (key === 'maria isabel' || key === 'maria isabell cubillos') return 'Maria Isabel Cubillos';
  if (key === 'michael diaz') return 'Michael Díaz';
  const raw = String(value ?? '').trim();
  if (!raw || ['undefined', 'null', 'sin vendedor', 'cliente', 'cliente sin nombre'].includes(raw.toLowerCase())) return 'Sin vendedor';
  if (/^(mov|cli|customer|cliente)[-_ ]?\d+$/i.test(raw) || /^(?:[a-z]+-)?\d{3,}$/i.test(raw)) return 'Sin vendedor';
  return raw;
}

export function normalizeSales(items = []) {
  return (Array.isArray(items) ? items : []).map(item => {
    const row = parseRemoteRow(item);
    const total = Number(Object.prototype.hasOwnProperty.call(row, 'total_venta') ? row.total_venta :
      Object.prototype.hasOwnProperty.call(row, 'valor_total') ? row.valor_total :
      Object.prototype.hasOwnProperty.call(row, 'monto') ? row.monto :
      Object.prototype.hasOwnProperty.call(row, 'precio_total') ? row.precio_total :
      Object.prototype.hasOwnProperty.call(row, 'total') ? row.total : 0);
    const date = row.date ?? row.fecha ?? row.fecha_venta ?? row.created_at ?? row.createdAt ?? '';
    const paymentMethod = row.paymentMethod ?? row.metodo_pago ?? row.forma_pago ?? row.payment ?? 'Sin dato';
    const customer = row.customer ?? row.cliente ?? row.cliente_nombre ?? row.customer_name ?? row.nombre_cliente ?? 'Cliente';
    const seller = row.seller ?? row.vendedor ?? row.empleado ?? row.usuario ?? row.usuario_nombre ?? row.userName ?? row.user ?? row.createdBy ?? row.created_by ?? row.userId ?? row.usuario_id ?? '';
    const status = row.status ?? row.estado ?? 'Completada';
    const invoiceNumber = normalizePhysicalInvoice(row);
    return {
      ...row,
      id: String(row.id ?? row.factura ?? row.numero_factura ?? row.invoiceId ?? 'S/F'),
      invoiceNumber,
      storeId: String(row.storeId ?? row.local_id ?? row.localId ?? row.local ?? ''),
      customer: normalizeDisplayText(customer, 'Cliente sin nombre'),
      seller: String(seller || '').trim() || 'Sin vendedor',
      date: String(date),
      paymentMethod: String(paymentMethod),
      total: Number.isFinite(total) ? total : 0,
      status: String(status),
    };
  });
}

export function salesWithAnnulledTalonarios(data, sales = normalizeSales(data.sales || data.ventas || [])) {
  const annulled = justifiedTalonarioDocuments(data.talonarios || [], data.talonarioJustifications || [])
    .filter(document => document.reason.toUpperCase() === 'ANULADA')
    .map(document => ({
      id: `TAL-${document.number}`,
      invoiceNumber: document.number,
      storeId: document.storeId,
      customer: '—',
      seller: 'Sin vendedor',
      date: document.date,
      paymentMethod: '—',
      total: 0,
      status: 'ANULADA',
      isTalonarioJustification: true,
      justificationNotes: document.notes,
    }));
  return [...sales, ...annulled];
}

export function salesTable(data, sales = salesWithAnnulledTalonarios(data)) {
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  const orderedSales = [...sales].sort((left, right) => saleTimestamp(right.date) - saleTimestamp(left.date));
  return table(['Factura','Factura física','Cliente','Fecha','Metodo de pago','Total','Estado','Acciones'], orderedSales.map(sale => `<tr><td><strong>${sale.id}</strong></td><td>${sale.invoiceNumber || '-'}</td><td>${sale.customer}</td><td>${sale.date}</td><td>${sale.paymentMethod}</td><td><strong>${money(sale.total)}</strong></td><td>${badge(sale.status)}</td><td>${sale.isTalonarioJustification ? '<span class="muted">—</span>' : `<button class="table-action" data-action="sale-detail" data-sale-id="${sale.id}">Ver</button>${isAdmin ? `<button class="table-action" data-action="edit-sale" data-sale-id="${sale.id}">Editar</button><button class="table-action danger-text" data-action="delete-sale" data-sale-id="${sale.id}">Eliminar</button>` : ''}`}</td></tr>`));
}

export function salesSummary(sales) {
  const registeredSales = sales.filter(sale => !sale.isTalonarioJustification);
  const total = registeredSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  return recordSummary(registeredSales.length, 'Resumen de ventas', total);
}

export function renderVentas(data) {
  const sales = normalizeSales(data.sales || data.ventas || []);
  const displayedSales = salesWithAnnulledTalonarios(data, sales);
  const storeOptions = (data.stores || []).map(store => `<option value="${store.id}">${store.name}</option>`).join('');
  const sellerOptions = salesSellers(sales, data.users || [])
    .map(seller => `<option value="${escapeOptionText(seller.value)}">${escapeOptionText(seller.name)}</option>`).join('');
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return page(
     'OPERACION',
     'Ventas',
     '<button class="primary" data-action="new-sale">＋ Nueva venta</button>',
    `<div class="toolbar"><label class="input-label">Buscar ventas<input class="field" data-filter="sales" placeholder="Buscar factura o cliente..."></label><label class="input-label">Local<select class="field" data-sales-store><option value="all">Todos los locales</option>${storeOptions}</select></label><label class="input-label">Mes de ventas<input class="field" type="month" data-sales-month value="${currentMonth}"></label><label class="input-label">Usuario<select class="field" data-sales-seller><option value="all">Todos los usuarios</option>${sellerOptions}</select></label></div><div data-sales-summary>${salesSummary(sales)}</div><div data-sales-table>${salesTable(data, displayedSales)}</div>`
  );
}
