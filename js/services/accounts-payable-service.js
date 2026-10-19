import { generateId } from '../utils/ids.js';
import { notifyCreation } from './notification-service.js';

export const payableStatuses = ['PENDIENTE', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA'];

export function calculateBalance(account) { return Math.max(0, Number(account.totalAmount || 0) - Number(account.paidAmount || 0)); }
function normalizeSupplierReference(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function supplierReferenceName(value) {
  const name = String(value || '').trim();
  return normalizeSupplierReference(name) === 'proveedor' ? '' : name;
}
function accountPurchases(state, account) {
  const purchases = Array.isArray(state.purchases) ? state.purchases : [];
  const purchaseId = String(account.purchaseId || '').trim();
  if (purchaseId) {
    const matches = purchases.filter(purchase => String(purchase.id || '').trim() === purchaseId);
    if (matches.length === 1) return matches;
  }

  const invoice = normalizeSupplierReference(account.invoiceNumber);
  if (!invoice) return [];
  const matches = purchases.filter(purchase => [
    purchase.supplierInvoice,
    purchase.supplier_invoice,
    purchase.invoiceNumber,
    purchase.invoice_number,
    purchase.factura,
    purchase.numero_factura,
  ].some(value => normalizeSupplierReference(value) === invoice));
  return matches.length === 1 ? matches : [];
}
function supplierNameForReference(state, account) {
  const purchase = accountPurchases(state, account)[0];
  return supplierReferenceName(
    purchase?.supplierName
    || purchase?.supplier_name
    || purchase?.proveedor
    || purchase?.supplier
    || account.supplierName
  );
}
function accountSupplierKey(state, account, supplier = resolveAccountPayableSupplier(state, account)) {
  if (supplier) return String(supplier.id);
  const name = supplierNameForReference(state, account);
  return name ? `legacy:${normalizeSupplierReference(name)}` : String(account.supplierId || '');
}
function findUniqueSupplier(suppliers, predicate) {
  const matches = suppliers.filter(predicate);
  return matches.length === 1 ? matches[0] : null;
}
export function resolveAccountPayableSupplier(state, account) {
  const suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  const purchase = accountPurchases(state, account)[0];
  const documentReferences = [
    purchase?.supplierDocument, purchase?.supplierNit, purchase?.supplierNIT, purchase?.nit,
    account.supplierDocument, account.supplierNit, account.supplierNIT, account.nit,
  ]
    .map(normalizeSupplierReference).filter(Boolean);
  if (documentReferences.length) {
    const byDocument = findUniqueSupplier(suppliers, supplier => {
      const supplierDocuments = [supplier.document, supplier.nit, supplier.NIT, supplier.rut]
        .map(normalizeSupplierReference).filter(Boolean);
      return supplierDocuments.some(document => documentReferences.includes(document));
    });
    if (byDocument) return byDocument;
  }

  const purchaseName = supplierReferenceName(
    purchase?.supplierName || purchase?.supplier_name || purchase?.proveedor || purchase?.supplier
  );
  const accountName = supplierReferenceName(account.supplierName);
  const expectedName = purchaseName || accountName;
  if (expectedName) {
    const normalizedName = normalizeSupplierReference(expectedName);
    const byName = findUniqueSupplier(
      suppliers,
      supplier => normalizeSupplierReference(supplier.name) === normalizedName
    );
    if (byName) return byName;
  }

  const supplierIds = [
    purchase?.supplierId, purchase?.supplier_id, purchase?.proveedor_id, account.supplierId,
  ].map(value => String(value || '').trim()).filter(Boolean);
  const byId = findUniqueSupplier(
    suppliers,
    supplier => supplierIds.includes(String(supplier.id || '').trim())
  );
  if (byId && expectedName
    && normalizeSupplierReference(byId.name) !== normalizeSupplierReference(expectedName)) {
    return null;
  }
  if (byId) return byId;

  const nameReferences = [accountName, account.supplierId]
    .map(normalizeSupplierReference).filter(Boolean);
  return findUniqueSupplier(suppliers, supplier => {
    const name = normalizeSupplierReference(supplier.name);
    return name && nameReferences.includes(name);
  });
}
export function accountPayableSupplierKey(state, account) {
  return accountSupplierKey(state, account);
}
export function accountPayableSupplierName(state, account) {
  const supplier = resolveAccountPayableSupplier(state, account);
  return supplier?.name || supplierNameForReference(state, account) || account.supplierId || '';
}
export function normalizePayableSuppliers(state) {
  const changed = [];
  (state.accountsPayable || []).forEach(account => {
    const supplier = resolveAccountPayableSupplier(state, account);
    if (supplier && (String(account.supplierId || '').trim() !== String(supplier.id) || account.supplierName !== supplier.name)) {
      account.supplierId = supplier.id;
      account.supplierName = supplier.name;
      changed.push(account);
    }
  });
  return changed;
}
export function filterAccountsPayable(state, { query = '', status = 'all', supplierId = 'all' } = {}) {
  const term = normalizeSupplierReference(query);
  return (state.accountsPayable || []).filter(account => {
    updateAccountPayableStatus(state, account);
    const supplier = resolveAccountPayableSupplier(state, account);
    const supplierKey = accountSupplierKey(state, account, supplier);
    const supplierName = accountPayableSupplierName(state, account);
    const searchable = normalizeSupplierReference([
      account.id,
      account.invoiceNumber,
      account.supplierName,
      account.supplierId,
      supplierName,
      supplier?.document,
      supplier?.nit,
    ].join(' '));
    return searchable.includes(term)
      && (status === 'all' || account.status === status)
      && (supplierId === 'all' || supplierKey === String(supplierId));
  });
}
export function buildFuelAccountPayable(state, fuelRecord, options = {}) {
  const fuelId = String(fuelRecord?.id || '').trim();
  const totalAmount = Number(options.totalAmount ?? fuelRecord?.amount ?? fuelRecord?.valor ?? 0);
  if (!fuelId) throw new Error('El consumo de gasolina requiere un id.');
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) throw new Error('El valor de la cuenta debe ser mayor que cero.');
  const supplierName = String(options.supplierName || fuelRecord.driver || fuelRecord.conductor || 'Conductor').trim();
  const issueDate = String(options.issueDate || fuelRecord.date || new Date().toISOString()).slice(0, 10);
  const dueDate = String(options.dueDate || addDays(issueDate, 30)).slice(0, 10);
  const createdAt = new Date().toISOString();
  return {
    id: `CXP-GAS-${fuelId}`,
    type: 'GASOLINA',
    fuelRecordId: fuelId,
    sourceType: 'fuelRecords',
    sourceId: fuelId,
    supplierId: options.supplierId || supplierName,
    supplierName,
    storeId: fuelRecord.storeId || '',
    invoiceNumber: String(options.invoiceNumber || fuelRecord.invoiceNumber || `GAS-${fuelId}`).trim(),
    description: `Gasolina ${fuelRecord.vehicle || ''} · ${supplierName}`.trim(),
    issueDate,
    dueDate,
    totalAmount,
    paidAmount: 0,
    balance: totalAmount,
    status: 'PENDIENTE',
    paymentTerms: 'Credito',
    createdAt,
    updatedAt: createdAt,
  };
}
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
