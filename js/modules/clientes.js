import { money, page, table, badge } from '../components/tables.js';
export function renderClientes(data) { return page('RELACIONES','Clientes','<button class="primary" data-action="new-customer">＋ Nuevo cliente</button>',`<div class="toolbar"><input class="field" data-filter="customers" placeholder="Buscar por nombre, documento o telefono..."></div><div id="customers-table">${customerTable(data.customers)}</div>`); }
export function customerTable(items) {
  const rows = Array.isArray(items) ? items : [];
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  return table(['Cliente','Documento','Contacto','Compras','Creditos','Saldo','Estado','Acciones'], rows.map(item => `
    <tr>
      <td><strong>${item.name}</strong></td>
      <td>${item.document}</td>
      <td>${item.phone}<small>${item.email}</small></td>
      <td>${item.purchases}</td>
      <td>${item.credits}</td>
      <td>${money(item.balance)}</td>
      <td>${badge(item.status)}</td>
      <td><button class="table-action" data-action="view-customer" data-customer-id="${item.id}">Ver</button><button class="table-action" data-action="edit-customer" data-customer-id="${item.id}">Editar</button>${isAdmin ? `<button class="table-action danger-text" data-action="delete-customer" data-customer-id="${item.id}">Eliminar</button>` : ''}</td>
    </tr>
  `));
}
