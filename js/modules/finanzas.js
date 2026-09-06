import { generateId } from '../utils/ids.js';
import { decreaseStock, createInventoryMovement } from '../services/inventory-service.js';
import { notifyCreation } from '../services/notification-service.js';

export const apartadoPayment = 'Apartado';

export function creditBalance(credit) {
  return Math.max(0, Number(credit.total || 0) - Number(credit.initial ?? credit.downPayment ?? 0) - Number(credit.paid || 0));
}

export function decreaseSaleInventory(data, sale) {
  if (sale.inventoryReleased) return;
  sale.items.forEach(item => {
    decreaseStock(data, item.productId, sale.storeId, item.quantity, sale.id, 'VENTA');
  });
  sale.inventoryReleased = true;
}

export function runTransaction(data, operation) {
  const snapshot = structuredClone(data);
  try { return operation(); } catch (error) { Object.keys(data).forEach(key => { delete data[key]; }); Object.assign(data, snapshot); throw error; }
}

export const addMovement = createInventoryMovement;

export function createApartado(data, sale, initial, method) {
  const apartado = {
    id: generateId('APT', data.apartados), saleId: sale.id, customerId: sale.customerId,
    customer: sale.customer, total: sale.total, initial: Math.min(initial, sale.total), paid: 0,
    status: 'Activo', date: 'Ahora', storeId: sale.storeId, items: sale.items
  };
  data.apartados.push(apartado);
  notifyCreation(data, 'apartados', apartado);
  if (initial > 0) {
    data.payments.push({ id: generateId('PAY', data.payments), apartadoId: apartado.id, customerId: apartado.customerId, date: 'Ahora', amount: apartado.initial, method });
    if (apartado.initial === apartado.total) { apartado.status = 'Liquidado'; const linkedSale = data.sales.find(candidate => candidate.id === sale.id); if (linkedSale) { decreaseSaleInventory(data, linkedSale); linkedSale.status = 'Completada'; } }
  }
  return apartado;
}

export function registerPayment(data, target, amount, method = 'Efectivo') {
  if (typeof target === 'object' && amount === undefined) {
    amount = target.amount;
    method = target.method || method;
    target = { kind: target.kind, id: target.id };
  }
  const collection = target.kind === 'apartado' ? data.apartados : data.credits;
  const item = collection.find(candidate => candidate.id === target.id);
  if (!item) throw new Error('No se encontró la cuenta seleccionada.');
  const balance = target.kind === 'apartado' ? Math.max(0, item.total - item.initial - item.paid) : creditBalance(item);
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error('El abono debe ser mayor que cero.');
  if (value > balance) throw new Error('El abono no puede superar el saldo pendiente.');
  item.paid += value;
  data.payments.push({ id: generateId('PAY', data.payments), [target.kind === 'apartado' ? 'apartadoId' : 'creditId']: item.id, customerId: item.customerId, date: 'Ahora', amount: value, method, receiptNumber: String(target.receiptNumber || '').trim() });
  const remaining = target.kind === 'apartado' ? item.total - item.initial - item.paid : creditBalance(item);
  if (remaining === 0) {
    item.status = target.kind === 'apartado' ? 'Liquidado' : 'Saldado';
    if (target.kind === 'apartado') {
      const sale = data.sales.find(candidate => candidate.id === item.saleId);
      if (sale) { decreaseSaleInventory(data, sale); sale.status = 'Completada'; sale.paymentMethod = 'Apartado liquidado'; }
    }
  }
  return item;
}