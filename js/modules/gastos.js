import { formatCurrency } from '../utils/currency.js';
import { page, table } from '../components/tables.js';

function parseRemoteRow(item = {}) {
  const raw = item?.data_json;
  if (!raw) return item;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      return { ...item, ...parsed };
    }
  } catch (error) {
    // Ignorar si el payload anidado no es JSON válido.
  }
  return item;
}

function normalizeExpenses(items = []) {
  return (Array.isArray(items) ? items : []).map(item => {
    const row = parseRemoteRow(item);
    const amount = Number(Object.prototype.hasOwnProperty.call(row, 'amount') ? row.amount :
      Object.prototype.hasOwnProperty.call(row, 'valor') ? row.valor :
      Object.prototype.hasOwnProperty.call(row, 'total') ? row.total :
      Object.prototype.hasOwnProperty.call(row, 'monto') ? row.monto : 0);
    const category = row.category ?? row.categoria ?? 'General';
    const description = row.description ?? row.detalle ?? row.descripcion ?? 'Sin descripción';
    const storeId = row.storeId ?? row.local_id ?? row.local ?? '';
    const createdBy = row.createdBy ?? row.empleado ?? row.usuario ?? row.usuario_creador ?? 'Sistema';
    return {
      ...row,
      id: String(row.id ?? 'GASTO-01'),
      date: String(row.date ?? row.fecha ?? row.createdAt ?? ''),
      storeId: String(storeId),
      category: String(category),
      description: String(description),
      amount: Number.isFinite(amount) ? amount : 0,
      paymentMethod: String(row.paymentMethod ?? row.metodo_pago ?? 'N/A'),
      createdBy: String(createdBy),
      provider: String(row.provider ?? row.proveedor ?? ''),
    };
  });
}

export function renderGastos(state) {
  const expenses = normalizeExpenses(state.expenses || state.gastos || []);
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  return page(
    'ADMINISTRACION','Gastos',
    '<button class="primary" data-action="new-expense">＋ Nuevo gasto</button>',
    `<div class="admin-summary"><div><span>Total</span><strong>${formatCurrency(expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</strong></div><div><span>Registros</span><strong>${expenses.length}</strong></div><div><span>Locales</span><strong>${new Set(expenses.map(item => item.storeId)).size}</strong></div></div>${table(['Fecha','Local','Categoria','Descripcion','Valor','Metodo','Registrado por','Acciones'], expenses.map(item => `<tr><td>${item.date}</td><td>${(state.stores || []).find(store => store.id === item.storeId)?.name || item.storeId || 'Sin local'}</td><td>${item.category}</td><td><strong>${item.description}</strong><small>${item.provider || ''}</small></td><td><strong>${formatCurrency(item.amount)}</strong></td><td>${item.paymentMethod}</td><td>${(state.users || []).find(user => user.id === item.createdBy)?.name || item.createdBy}</td><td>${isAdmin?`<button class="table-action" data-action="edit-expense" data-expense-id="${item.id}">Editar</button><button class="table-action danger-text" data-action="delete-expense" data-expense-id="${item.id}">Eliminar</button>`:''}</td></tr>`))}`
  );
}
