import { money, page, table, badge } from '../components/tables.js';

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
    const status = row.status ?? row.estado ?? 'Completada';
    return {
      ...row,
      id: String(row.id ?? row.factura ?? row.numero_factura ?? row.invoiceId ?? 'S/F'),
      storeId: String(row.storeId ?? row.local_id ?? row.localId ?? row.local ?? ''),
      customer: String(customer || 'Cliente'),
      date: String(date),
      paymentMethod: String(paymentMethod),
      total: Number.isFinite(total) ? total : 0,
      status: String(status),
    };
  });
}

export function salesTable(data, sales = normalizeSales(data.sales || data.ventas || [])) {
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  return table(['Factura','Factura física','Cliente','Fecha','Metodo de pago','Total','Estado','Acciones'], sales.map(sale => `<tr><td><strong>${sale.id}</strong></td><td>${sale.invoiceNumber || '-'}</td><td>${sale.customer}</td><td>${sale.date}</td><td>${sale.paymentMethod}</td><td><strong>${money(sale.total)}</strong></td><td>${badge(sale.status)}</td><td><button class="table-action" data-action="sale-detail" data-sale-id="${sale.id}">Ver</button>${isAdmin ? `<button class="table-action" data-action="edit-sale" data-sale-id="${sale.id}">Editar</button><button class="table-action danger-text" data-action="delete-sale" data-sale-id="${sale.id}">Eliminar</button>` : ''}</td></tr>`));
}

export function renderVentas(data) {
  const sales = normalizeSales(data.sales || data.ventas || []);
  const storeOptions = (data.stores || []).map(store => `<option value="${store.id}">${store.name}</option>`).join('');
  return page(
     'OPERACION',
     'Ventas',
     '<button class="primary" data-action="new-sale">＋ Nueva venta</button>',
    `<div class="toolbar"><input class="field" data-filter="sales" placeholder="Buscar factura o cliente..."><select class="field" data-sales-store><option value="all">Todos los locales</option>${storeOptions}</select><select class="field" data-sales-payment><option value="all">Todos los medios</option></select><select class="field" data-sales-status><option value="all">Todos los estados</option></select><input class="field" type="date" data-sales-date><select class="field" data-sales-sort><option value="recent">Mas recientes</option><option value="oldest">Mas antiguas</option></select></div><div data-sales-table>${salesTable(data, sales)}</div>`
  );
}
