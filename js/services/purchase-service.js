import { generateId } from '../utils/ids.js';
import { increaseStock, createInventoryMovement } from './inventory-service.js';
import { createAccountPayable } from './accounts-payable-service.js?v=14';
import { notifyCreation } from './notification-service.js';

export const purchaseStatuses = ['BORRADOR', 'ORDENADA', 'RECIBIDA', 'CANCELADA'];
const CENTRAL_TALONARIO_STORE = 'INV CRR 5 3 26';

export function nextPurchaseId(records = []) {
  const highest = records.flatMap(record => [
    record?.id,
    record?.purchaseId,
    record?.purchase_id,
    record?.compra_id,
    record?.referencia,
    record?.referenceId,
  ]).reduce((max, id) => {
    const match = String(id || '').match(/^COM-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `COM-${String(highest + 1).padStart(5, '0')}`;
}

export function nextPurchaseEntryId(records = []) {
  const highest = records.reduce((max, record) => {
    const id = String(record?.id || '').trim();
    return /^\d+$/.test(id) ? Math.max(max, Number(id)) : max;
  }, 0);
  return String(highest + 1);
}

export function validatePurchaseDueDate(paymentMethod, value) {
  const isCreditPurchase = String(paymentMethod || '').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('credito');
  const dueDate = String(value || '').slice(0, 10);
  if (!isCreditPurchase) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new Error('La fecha de vencimiento es obligatoria para compras a credito.');
  const parsed = new Date(`${dueDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate) throw new Error('La fecha de vencimiento no es valida.');
  return dueDate;
}

function findPurchaseRecord(state, purchaseId) {
  return (state.purchases || []).find(item => String(item.id) === String(purchaseId))
    || (state.entries || []).find(item => String(item.id) === String(purchaseId)
      || String(item?.numero_factura || item?.factura || item?.compra_id || '') === String(purchaseId))
    || null;
}

export function createPurchase(state, values) {
  const suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  const stores = Array.isArray(state.stores) ? state.stores : [];
  const products = Array.isArray(state.products) ? state.products : [];
  if (!values.supplierId || !values.storeId) throw new Error('Proveedor y local destino son obligatorios.');
  if (!Array.isArray(values.items) || !values.items.length) throw new Error('La compra debe tener productos.');
  if (!suppliers.some(supplier => String(supplier.id) === String(values.supplierId))) throw new Error('El proveedor de la compra no existe.');
  if (!stores.some(store => String(store.id) === String(values.storeId))) throw new Error('El local destino de la compra no existe.');
  if (values.items.some(item => !products.some(product => String(product.id) === String(item.productId)))) throw new Error('La compra contiene un producto inexistente.');
  const paymentMethod = String(values.paymentMethod || 'Credito');
  const dueDate = validatePurchaseDueDate(paymentMethod, values.dueDate);
  const items = values.items.map(item => ({
    productId: String(item.productId || ''),
    quantity: Number(item.quantity),
    unitCost: Number(item.unitCost),
    iva: Number(item.iva ?? 0),
    discount: Number(item.discount ?? 0),
  }));
  if (items.some(item => !item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0 || !Number.isFinite(item.iva) || item.iva < 0 || !Number.isFinite(item.discount) || item.discount < 0 || item.discount > item.quantity * item.unitCost)) {
    throw new Error('Productos, cantidades, costos, IVA y descuentos deben ser validos.');
  }
  const purchases = Array.isArray(state.purchases) ? state.purchases : [];
  const purchase = { id:String(values.id || generateId('COM', purchases)), supplierId:String(values.supplierId), supplierName:suppliers.find(supplier => String(supplier.id) === String(values.supplierId))?.name || '', storeId:String(values.storeId), supplierInvoice:String(values.supplierInvoice || ''), paymentMethod, dueDate, notes:String(values.notes || ''), createdAt:new Date().toISOString(), receivedAt:null, createdBy:values.createdBy || 'USR-00001', status:'BORRADOR', items };
  if (!Array.isArray(state.purchases)) state.purchases = purchases;
  state.purchases.push(purchase);
  notifyCreation(state, 'purchases', purchase);
  return purchase;
}

export function purchaseTotals(state, purchase) { const items=Array.isArray(purchase?.items)?purchase.items:[]; return items.reduce((totals,item)=>{ const base=Math.max(0,Number(item.quantity||0)*Number(item.unitCost||0)-Number(item.discount||0)); totals.subtotal+=base; totals.discount+=Number(item.discount||0); totals.tax+=base*(Number(item.iva||0)/100); return totals; },{subtotal:0,discount:0,tax:0}); }
export function purchaseTotal(state, purchase) { const totals=purchaseTotals(state,purchase); return totals.subtotal+totals.tax; }

export function generateTalonariosFromPurchase(state, purchase) {
  if (!purchase || purchase.purchaseType !== 'TALONARIOS') throw new Error('La compra no corresponde a talonarios.');
  if (!['BORRADOR', 'ORDENADA'].includes(purchase.status)) throw new Error('La compra de talonarios ya fue recibida o no se puede recibir.');
  if (!Array.isArray(state.talonarios)) state.talonarios = [];
  const type = String(purchase.talonarioType || '').toUpperCase();
  const count = Number(purchase.talonarioCount);
  const startNumber = Number(purchase.talonarioStart);
  const endNumber = Number(purchase.talonarioEnd);
  const totalNumbers = endNumber - startNumber + 1;
  if (!['REMISION', 'RECIBO'].includes(type)) throw new Error('El tipo de talonario no es valido.');
  if (!Number.isInteger(count) || count <= 0 || !Number.isInteger(startNumber) || !Number.isInteger(endNumber) || endNumber < startNumber || totalNumbers % count !== 0) throw new Error('La cantidad y el rango de consecutivos no son compatibles.');
  const size = totalNumbers / count;
  const overlap = (state.talonarios || []).some(item => String(item.type).toUpperCase() === type && Number(item.startNumber) <= endNumber && Number(item.endNumber) >= startNumber);
  if (overlap) throw new Error('El rango de consecutivos se cruza con un talonario existente.');
  const createdAt = new Date().toISOString();
  const records = Array.from({ length: count }, (_, index) => {
    const rangeStart = startNumber + index * size;
    const rangeEnd = rangeStart + size - 1;
    return {
      id: generateId('TAL', state.talonarios || []),
      type,
      startNumber: rangeStart,
      endNumber: rangeEnd,
      currentNumber: rangeStart,
      storeId: CENTRAL_TALONARIO_STORE,
      destinationName: CENTRAL_TALONARIO_STORE,
      status: 'ALMACENADO',
      supplierId: purchase.supplierId,
      supplierName: purchase.supplierName || '',
      purchaseId: purchase.id,
      purchaseInvoice: purchase.supplierInvoice || '',
      unitCost: Number(purchase.talonarioUnitCost || 0),
      createdAt,
      stored: true,
    };
  });
  state.talonarios.push(...records);
  purchase.talonariosGenerated = true;
  purchase.talonarioSize = size;
  purchase.receivedAt = createdAt;
  purchase.status = 'RECIBIDA';
  return records;
}

export function receiveTalonarioPurchase(state, purchaseId) {
  const purchase = findPurchaseRecord(state, purchaseId);
  if (!purchase) throw new Error('Compra no encontrada.');
  if (purchase.purchaseType !== 'TALONARIOS') throw new Error('La compra no corresponde a talonarios.');
  if (!['BORRADOR', 'ORDENADA'].includes(purchase.status)) throw new Error('La compra de talonarios ya fue recibida o no se puede recibir.');
  if (!Array.isArray(state.accountsPayable)) state.accountsPayable = [];
  if (!Array.isArray(state.auditLog)) state.auditLog = [];
  const records = generateTalonariosFromPurchase(state, purchase);
  createAccountPayable(state, purchase, { totalAmount: purchaseTotal(state, purchase), paymentTerms: purchase.paymentMethod, dueDate: purchase.dueDate });
  return { purchase, records };
}

export function receivePurchase(state, purchaseId) {
  const purchase=findPurchaseRecord(state,purchaseId);
  if (!purchase) throw new Error('Compra no encontrada.');
  if (!['BORRADOR', 'ORDENADA'].includes(purchase.status)) throw new Error('La compra ya fue recibida o no se puede recibir.');
  if (!Array.isArray(state.accountsPayable)) state.accountsPayable = [];
  if (!Array.isArray(state.auditLog)) state.auditLog = [];
  if (!state.stores.some(store => store.id === purchase.storeId)) throw new Error('El local destino de la compra no existe.');
  if (purchase.items.some(item => !state.products.some(product => product.id === item.productId))) throw new Error('La compra contiene un producto inexistente.');
  runTransaction(state,()=>{ purchase.items.forEach(item=>{ increaseStock(state,item.productId,purchase.storeId,item.quantity,purchase.id,'COMPRA_ENTRADA','Recepcion de compra'); const product=state.products.find(candidate=>candidate.id===item.productId); if(product) product.cost=item.unitCost; }); purchase.status='RECIBIDA'; purchase.receivedAt=new Date().toISOString(); createAccountPayable(state,purchase,{totalAmount:purchaseTotal(state,purchase),paymentTerms:purchase.paymentMethod,dueDate:purchase.dueDate}); });
  return purchase;
}

function runTransaction(state, operation) { const snapshot=structuredClone(state); try { return operation(); } catch (error) { Object.keys(state).forEach(key=>delete state[key]); Object.assign(state,snapshot); throw error; } }

export function orderPurchase(state, purchaseId) {
  const purchase=findPurchaseRecord(state,purchaseId);
  if (!purchase) throw new Error('Compra no encontrada.');
  if (purchase.status !== 'BORRADOR') throw new Error('Solo una compra en borrador puede ordenarse.');
  purchase.status='ORDENADA';
  return purchase;
}

export function cancelPurchase(state, purchaseId) {
  const purchase=findPurchaseRecord(state,purchaseId);
  if (!purchase) throw new Error('Compra no encontrada.');
  if (purchase.status === 'RECIBIDA') throw new Error('Una compra recibida requiere una devolucion al proveedor.');
  if (purchase.status === 'CANCELADA') throw new Error('La compra ya esta cancelada.');
  purchase.status='CANCELADA';
  return purchase;
}
