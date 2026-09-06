import { generateId } from '../utils/ids.js';
import { notifyCreation } from './notification-service.js';

export const payableStatuses = ['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA'];

export function calculateBalance(account) { return Math.max(0, Number(account.totalAmount || 0) - Number(account.paidAmount || 0)); }
export function getAccountPayable(state, accountId) { return (state.accountsPayable || []).find(account => account.id === accountId); }
export function listAccountsPayable(state) { return [...(state.accountsPayable || [])]; }
export function searchAccountsPayable(state, query = '') { const term=String(query).trim().toLowerCase(); return listAccountsPayable(state).filter(account=>{const supplier=state.suppliers.find(item=>item.id===account.supplierId);return !term||`${account.id} ${account.invoiceNumber} ${supplier?.name || ''} ${supplier?.document || ''}`.toLowerCase().includes(term);}); }

export function updateAccountPayableStatus(state, account) {
  if (account.status === 'ANULADA') return account.status;
  const balance=calculateBalance(account);
  if (balance === 0) account.status='PAGADA';
  else if (account.paidAmount > 0) account.status='PARCIAL';
  else if (account.dueDate && new Date(account.dueDate) < new Date()) account.status='VENCIDA';
  else account.status='PENDIENTE';
  account.balance=balance;
  account.updatedAt=new Date().toISOString();
  return account.status;
}

export function createAccountPayable(state, purchase, options = {}) {
  if (!purchase || purchase.status !== 'RECIBIDA') throw new Error('Solo una compra recibida puede generar cuenta por pagar.');
  if (!state.suppliers.some(item=>item.id===purchase.supplierId)) throw new Error('El proveedor de la compra no existe.');
  const existing=(state.accountsPayable || []).find(account=>account.purchaseId===purchase.id);
  if (existing) return existing;
  const total=Number(options.totalAmount ?? purchase.items.reduce((sum,item)=>sum + Math.max(0,item.quantity*item.unitCost-item.discount)*(1+item.iva/100),0));
  const paid = String(purchase.paymentMethod).toLowerCase().includes('contado') ? total : 0;
  const account={id:generateId('CXP',state.accountsPayable),purchaseId:purchase.id,supplierId:purchase.supplierId,storeId:purchase.storeId,invoiceNumber:purchase.supplierInvoice || purchase.id,issueDate:purchase.createdAt,dueDate:options.dueDate || addDays(purchase.createdAt,30),totalAmount:total,paidAmount:paid,balance:total-paid,status:paid===total?'PAGADA':'PENDIENTE',paymentTerms:options.paymentTerms || 'Credito',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  state.accountsPayable.push(account);
  notifyCreation(state, 'accountsPayable', account);
  updateAccountPayableStatus(state,account);
  state.auditLog.push({ id:generateId('AUD',state.auditLog), date:new Date().toISOString(), userId:'USR-00001', action:'Crear cuenta por pagar', purchaseId:purchase.id, accountId:account.id, supplierId:account.supplierId, storeId:account.storeId });
  return account;
}

export function registerPayment(state, accountId, values) {
  const account=getAccountPayable(state,accountId);
  if (!account) throw new Error('Cuenta por pagar no encontrada.');
  updateAccountPayableStatus(state,account);
  if (account.status==='ANULADA') throw new Error('No se puede pagar una cuenta anulada.');
  const amount=Number(values.amount);
  if (!Number.isFinite(amount) || amount<=0) throw new Error('El pago debe ser mayor que cero.');
  const balance=calculateBalance(account);
  if (balance===0) throw new Error('La cuenta ya esta pagada.');
  if (amount>balance) throw new Error('El pago no puede superar el saldo pendiente.');
  const duplicate=(state.supplierPayments || []).some(payment=>payment.accountId===accountId&&values.reference&&payment.reference===values.reference);
  if (duplicate) throw new Error('Ya existe un pago con esa referencia.');
  const payment={id:generateId('PXP',state.supplierPayments),accountId,purchaseId:account.purchaseId,supplierId:account.supplierId,amount,method:String(values.method || 'EFECTIVO'),reference:String(values.reference || ''),note:String(values.note || ''),date:values.date || new Date().toISOString(),createdBy:'USR-00001'};
  state.supplierPayments.push(payment);
  account.paidAmount+=amount;
  updateAccountPayableStatus(state,account);
  state.auditLog.push({ id:generateId('AUD',state.auditLog), date:new Date().toISOString(), userId:'USR-00001', action:account.status==='PAGADA'?'Pagar cuenta por pagar':'Abono cuenta por pagar', paymentId:payment.id, accountId:account.id, purchaseId:account.purchaseId, supplierId:account.supplierId, storeId:account.storeId, amount });
  return payment;
}

export function cancelAccountPayable(state, accountId) { const account=getAccountPayable(state,accountId); if (!account) throw new Error('Cuenta por pagar no encontrada.'); if (account.paidAmount>0) throw new Error('No se puede anular una cuenta con pagos registrados.'); account.status='ANULADA';account.balance=0;account.updatedAt=new Date().toISOString();return account; }
export function getSupplierBalance(state, supplierId) { const accounts=listAccountsPayable(state).filter(account=>account.supplierId===supplierId&&account.status!=='ANULADA'); return {total:accounts.reduce((sum,a)=>sum+a.totalAmount,0),paid:accounts.reduce((sum,a)=>sum+a.paidAmount,0),balance:accounts.reduce((sum,a)=>sum+calculateBalance(a),0),overdue:accounts.filter(a=>updateAccountPayableStatus(state,a)==='VENCIDA').length}; }
export function getOverdueAccounts(state) { return listAccountsPayable(state).filter(account=>updateAccountPayableStatus(state,account)==='VENCIDA'); }
export function getPendingAccounts(state) { return listAccountsPayable(state).filter(account=>{const status=updateAccountPayableStatus(state,account);return status==='PENDIENTE'||status==='PARCIAL';}); }
function addDays(date, days) { const result=new Date(date);result.setDate(result.getDate()+days);return result.toISOString(); }
