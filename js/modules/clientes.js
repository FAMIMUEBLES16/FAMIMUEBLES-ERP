import { money, page, table, badge } from '../components/tables.js';
const text = (value) => value == null || value === 'undefined' || value === 'null' ? '' : String(value);
const safe = (value, fallback = '-') => {
  const raw = text(value).trim(); return raw ? raw : fallback;
};
export function renderClientes(data) { return page('RELACIONES','Clientes','<button class="primary" data-action="new-customer">＋ Nuevo cliente</button>',`<div class="toolbar"><input class="field" data-filter="customers" placeholder="Buscar por nombre, documento o telefono..."></div><div id="customers-table">${customerTable(data.customers)}</div>`); }
export function customerTable(items) {
  const rows = Array.isArray(items) ? items : [];
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  return table(['Cliente','Documento','Contacto','Compras','Creditos','Saldo','Estado','Acciones'], rows.map(item => `
    <tr>
      <td><strong>${safe(item.name, 'Sin nombre')}</strong></td>
      <td>${safe(item.document, '-')}</td>
      <td>${safe(item.phone, '-')}<small>${safe(item.email, '')}</small></td>
      <td>${safe(item.purchases, 0)}</td>
      <td>${money(Number(item.purchaseTotal ?? item.purchase_total ?? item.creditTotal ?? item.credit_total ?? 0))}</td>
      <td>${money(Number(item.balance || 0))}</td>
      <td>${badge(item.status || 'Activo')}</td>
      <td><button class="table-action" data-action="view-customer" data-customer-id="${item.id}">Ver</button><button class="table-action" data-action="edit-customer" data-customer-id="${item.id}">Editar</button>${isAdmin ? `<button class="table-action danger-text" data-action="delete-customer" data-customer-id="${item.id}">Eliminar</button>` : ''}</td>
    </tr>
  `));
}
