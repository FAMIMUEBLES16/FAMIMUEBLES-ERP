import { generateId } from '../utils/ids.js';
import { increaseStock, createInventoryMovement } from './inventory-service.js';
import { createAccountPayable } from './accounts-payable-service.js?v=14';
import { notifyCreation } from './notification-service.js';

export const purchaseStatuses = ['BORRADOR', 'ORDENADA', 'RECIBIDA', 'CANCELADA'];

function findPurchaseRecord(state, purchaseId) {
  return (state.purchases || []).find(item => String(item.id) === String(purchaseId))
    || (state.entries || []).find(item => String(item.id) === String(purchaseId)
      || String(item?.numero_factura || item?.factura || item?.compra_id || '') === String(purchaseId))
    || null;
}

export function createPurchase(state, values) {
  if (!values.supplierId || !values.storeId) throw new Error('Proveedor y local destino son obligatorios.');
  if (!values.items?.length) throw new Error('La compra debe tener productos.');
  if (!state.suppliers.some(supplier => supplier.id === values.supplierId)) throw new Error('El proveedor de la compra no existe.');
  if (!state.stores.some(store => store.id === values.storeId)) throw new Error('El local destino de la compra no existe.');
  if (values.items.some(item => !state.products.some(product => product.id === item.productId))) throw new Error('La compra contiene un producto inexistente.');
  const purchase = { id:generateId('COM', state.purchases), supplierId:values.supplierId, storeId:values.storeId, supplierInvoice:String(values.supplierInvoice || ''), paymentMethod:String(values.paymentMethod || 'Credito'), notes:String(values.notes || ''), createdAt:new Date().toISOString(), receivedAt:null, createdBy:values.createdBy || 'USR-00001', status:'BORRADOR', items:values.items.map(item=>({ productId:item.productId, quantity:Number(item.quantity), unitCost:Number(item.unitCost), iva:Number(item.iva || 0), discount:Number(item.discount || 0) })) };
  if (purchase.items.some(item=>!item.productId || !Number.isInteger(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitCost) || item.unitCost < 0)) throw new Error('Productos, cantidades y costos deben ser validos.');
  state.purchases.push(purchase);
  notifyCreation(state, 'purchases', purchase);
  return purchase;
}

export function purchaseTotals(state, purchase) { const items=Array.isArray(purchase?.items)?purchase.items:[]; return items.reduce((totals,item)=>{ const base=Math.max(0,Number(item.quantity||0)*Number(item.unitCost||0)-Number(item.discount||0)); totals.subtotal+=base; totals.discount+=Number(item.discount||0); totals.tax+=base*(Number(item.iva||0)/100); return totals; },{subtotal:0,discount:0,tax:0}); }
export function purchaseTotal(state, purchase) { const totals=purchaseTotals(state,purchase); return totals.subtotal+totals.tax; }

export function receivePurchase(state, purchaseId) {
  const purchase=findPurchaseRecord(state,purchaseId);
  if (!purchase) throw new Error('Compra no encontrada.');
  if (purchase.status !== 'ORDENADA') throw new Error('Solo una compra ordenada puede recibirse.');
  if (!state.stores.some(store => store.id === purchase.storeId)) throw new Error('El local destino de la compra no existe.');
  if (purchase.items.some(item => !state.products.some(product => product.id === item.productId))) throw new Error('La compra contiene un producto inexistente.');
  runTransaction(state,()=>{ purchase.items.forEach(item=>{ increaseStock(state,item.productId,purchase.storeId,item.quantity,purchase.id,'COMPRA_ENTRADA','Recepcion de compra'); const product=state.products.find(candidate=>candidate.id===item.productId); if(product) product.cost=item.unitCost; }); purchase.status='RECIBIDA'; purchase.receivedAt=new Date().toISOString(); createAccountPayable(state,purchase,{totalAmount:purchaseTotal(state,purchase),paymentTerms:purchase.paymentMethod}); });
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
