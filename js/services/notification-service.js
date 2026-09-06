import { generateId } from '../utils/ids.js';

const names = { products: 'producto', stores: 'local', users: 'usuario', suppliers: 'proveedor', customers: 'cliente', credits: 'credito', purchases: 'compra', transfers: 'traslado', expenses: 'gasto', fuelRecords: 'registro de gasolina', accountsPayable: 'cuenta por pagar', quotes: 'cotizacion', orders: 'pedido', deliveries: 'entrega', returns: 'devolucion', warranties: 'garantia' };

export function notify(state, text, options = {}) {
  if (!Array.isArray(state.notifications)) state.notifications = [];
  const key = options.key || `${options.type || 'info'}:${options.targetId || text}`;
  if (state.notifications.some(item => item.key === key)) return;
  state.notifications.push({ id: generateId('NOT', state.notifications), key, text, type: options.type || 'info', action: options.action || '', targetId: options.targetId || '', createdAt: new Date().toISOString(), read: false });
}

export function notifyCreation(state, collection, entity) {
  if (collection === 'notifications') return;
  const label = names[collection] || collection;
  const id = entity?.id ? ` ${entity.id}` : '';
  notify(state, `Se creo ${label}${id}.`, { type: 'success', key: `created:${collection}:${entity?.id || Date.now()}`, targetId: entity?.id || '' });
}

function creditBalance(credit) { return Math.max(0, Number(credit.total || credit.originalAmount || 0) - Number(credit.initial ?? credit.downPayment ?? 0) - Number(credit.paid || 0)); }
function dueDate(credit) { const value = credit.next || credit.dueDate || credit.fecha_vencimiento; if (!value || value === 'Pendiente') return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date; }

export function refreshFinancialNotifications(state) {
  (state.sales || []).slice(-20).forEach(sale => {
    notify(state, `Venta ${sale.id || ''} registrada por $${Number(sale.total || 0).toLocaleString('es-CO')}.`, { type: 'success', key: `sale:${sale.id}` });
  });
  (state.credits || []).forEach(credit => {
    const balance = creditBalance(credit);
    (state.notifications || []).filter(item => item.key?.startsWith(`overdue-credit:${credit.id}:`) || item.key?.startsWith(`due-credit:${credit.id}:`) || item.key?.startsWith(`pending-credit:${credit.id}:`)).forEach(item => { item.read = true; });
    if (balance <= 0) return;
    const customer = credit.customer || credit.cliente || 'Cliente sin nombre';
    const due = dueDate(credit);
    if (String(credit.status || '').toLowerCase().includes('venc')) notify(state, `Cliente moroso: ${customer} debe $${balance.toLocaleString('es-CO')}.`, { type: 'danger', action: 'credit-payment', targetId: credit.id, key: `overdue-credit:${credit.id}:${balance}` });
    else if (due && due < new Date()) notify(state, `Credito vencido de ${customer}: saldo $${balance.toLocaleString('es-CO')}.`, { type: 'danger', action: 'credit-payment', targetId: credit.id, key: `due-credit:${credit.id}:${balance}` });
    else notify(state, `${customer} tiene saldo pendiente de $${balance.toLocaleString('es-CO')}.`, { type: 'warning', action: 'credit-payment', targetId: credit.id, key: `pending-credit:${credit.id}:${balance}` });
  });
  (state.accountsPayable || []).forEach(account => {
    const balance = Math.max(0, Number(account.totalAmount || 0) - Number(account.paidAmount || 0));
    (state.notifications || []).filter(item => item.key?.startsWith(`payable:${account.id}:`)).forEach(item => { item.read = true; });
    if (balance > 0) notify(state, `Cuenta por pagar ${account.id}: saldo $${balance.toLocaleString('es-CO')}.`, { type: 'warning', action: 'payable-payment', targetId: account.id, key: `payable:${account.id}:${balance}` });
  });
  (state.inventoryByStore || []).forEach(row => {
    const minimum = Number(row.minimumStock ?? row.minimum ?? 0);
    if (Number(row.quantity || 0) <= minimum) notify(state, `Stock bajo para ${row.productId} en ${row.storeId}.`, { type: 'warning', action: 'inventory', targetId: row.productId, key: `stock:${row.productId}:${row.storeId}:${row.quantity}` });
  });
  const now = new Date();
  (state.deliveries || []).filter(item => !['ENTREGADO', 'CANCELADO'].includes(String(item.status || '').toUpperCase())).forEach(item => {
    notify(state, `Entrega pendiente ${item.id || ''}.`, { type: 'warning', action: 'delivery', targetId: item.id || '', key: `delivery:${item.id}:${item.status}` });
  });
  (state.warranties || []).forEach(item => {
    const expiry = new Date(item.expiryDate || item.dueDate || item.fechaVencimiento || '');
    if (!Number.isNaN(expiry.getTime()) && expiry >= now && expiry <= new Date(now.getTime() + 30 * 86400000)) notify(state, `Garantia proxima a vencer ${item.id || ''}.`, { type: 'warning', action: 'warranty', targetId: item.id || '', key: `warranty:${item.id}:${expiry.toISOString().slice(0, 10)}` });
  });
  (state.reservations || []).filter(item => !['ENTREGADA', 'CANCELADA'].includes(String(item.status || '').toUpperCase())).forEach(item => {
    const expiry = new Date(item.expiryDate || item.deliveryDate || item.dueDate || '');
    if (!Number.isNaN(expiry.getTime()) && expiry < now) notify(state, `Reserva vencida ${item.id || ''}.`, { type: 'danger', action: 'reservation', targetId: item.id || '', key: `reservation:${item.id}:${item.status}` });
  });
  (state.cashSessions || []).filter(item => String(item.status || '').toUpperCase() === 'ABIERTA').forEach(item => notify(state, `Caja pendiente de cierre ${item.id || ''}.`, { type: 'warning', action: 'cash-session', targetId: item.id || '', key: `cash-session:${item.id}:open` }));
  (state.returns || []).filter(item => !['PROCESADA', 'ANULADA'].includes(String(item.status || '').toUpperCase())).forEach(item => notify(state, `Devolucion pendiente ${item.id || ''}.`, { type: 'warning', action: 'return', targetId: item.id || '', key: `return:${item.id}:${item.status}` }));
  (state.syncErrors || []).slice(-20).forEach(item => notify(state, `Error de sincronizacion: ${item.message || item.id || 'revisar'}.`, { type: 'danger', action: 'sync-error', targetId: item.id || '', key: `sync-error:${item.id || item.message}` }));
}
