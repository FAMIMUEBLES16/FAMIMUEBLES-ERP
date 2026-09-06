import { createAccountPayable } from '../services/accounts-payable-service.js?v=14';

export const TENANT_STORAGE_KEY = 'famimuebles-tenant-id';
export function activeTenantId() { return localStorage.getItem(TENANT_STORAGE_KEY) || 'tenant-default'; }
export function authHeaders() { const token = localStorage.getItem('famimuebles-auth-token'); return token ? { Authorization: `Bearer ${token}` } : {}; }

function createEmptyState() {
  return {
    products: [],
    customers: [],
    sales: [],
    credits: [],
    installments: [],
    payments: [],
    apartados: [],
    stores: [],
    inventory: [],
    inventoryByStore: [],
    transfers: [],
    users: [],
    roles: [],
    paymentMethods: [],
    expenses: [],
    fuelRecords: [],
    auditLog: [],
    suppliers: [],
    purchases: [],
    accountsPayable: [],
    supplierPayments: [],
    customerAccounts: [],
    returns: [],
    supplierReturns: [],
    stockCounts: [],
    reservations: [],
    warranties: [],
    damagedStock: [],
    cashSessions: [],
    cashMovements: [],
    bankAccounts: [],
    quotes: [],
    orders: [],
    deliveries: [],
    creditNotes: [],
    companySettings: [],
    permissionMatrix: [],
    notifications: [],
    demoMode: false,
  };
}

function normalizeState(state) {
  const base = { ...createEmptyState(), ...state, demoMode: state.demoMode === true };
  const previousStores = Array.isArray(base.stores) ? base.stores : [];
  base.stores = previousStores.length ? previousStores.map((store,index) => ({ ...store, id:store.id || `LOC-${String(index + 1).padStart(5,'0')}`, code:store.code || `LOC-${String(index + 1).padStart(2,'0')}`, status:store.status || 'Activo', createdAt:store.createdAt || new Date().toISOString() })) : [];
  const storesByName = Object.fromEntries(base.stores.map(store => [store.name, store.id]));
  const customerIds = new Map();
  base.customers = Array.isArray(base.customers) ? base.customers.map((customer, index) => { const id=customer.id && String(customer.id).startsWith('CLI-') ? customer.id : `CLI-${String(index+1).padStart(5,'0')}`; customerIds.set(customer.name,id); return { ...customer, id }; }) : [];
  base.products = Array.isArray(base.products) ? base.products.map((product, index) => { const minimum=Number(product.minimum ?? product.minStock ?? 0); const maximum=Number(product.maximum ?? product.maxStock ?? minimum * 3); const costValue=Number(product.cost ?? 0); const cost=Number.isFinite(costValue) && costValue >= 0 ? costValue : 0; const statedPrice=Number(product.price ?? product.salePrice ?? 0); const price=Number.isFinite(statedPrice) && statedPrice >= 0 ? statedPrice : 0; const active=product.active ?? product.activo ?? true; return { ...product, id:product.id && String(product.id).startsWith('PROD-') ? product.id : `PROD-${String(index+1).padStart(5,'0')}`, barcode:String(product.barcode || ''), reference:product.reference || product.code, storeId:product.storeId || storesByName[product.store] || base.stores[0]?.id, minimum, minStock:minimum, maximum, maxStock:maximum, ideal:product.ideal || maximum, cost, price, salePrice:price, minimumPrice:Math.max(price * 0.8, cost || 0), specialPrice:Number(product.specialPrice ?? 0), iva:Number(product.iva ?? 0), categoryName:product.categoryName || product.category || 'General', subcategory:String(product.subcategory || product.subcategoryName || ''), subcategoryName:product.subcategoryName || product.subcategory || '', brand:String(product.brand || ''), supplierName:String(product.supplierName || ''), active, activo:active, estado:active ? 'Activo' : 'Inactivo' }; }) : [];
  const saleIds = new Map();
  base.sales = Array.isArray(base.sales) ? base.sales.map((sale, index) => { const id=sale.id && String(sale.id).startsWith('VEN-') && String(sale.id).length===9 ? sale.id : `VEN-${String(index+1).padStart(5,'0')}`; const customerId=sale.customerId || customerIds.get(sale.customer) || 'CLI-00001'; saleIds.set(sale.id,id); return { ...sale, id, invoiceId:sale.invoiceId || `FAC-${String(index+1).padStart(5,'0')}`, customerId, customer:sale.customer || base.customers.find(customer=>customer.id===customerId)?.name || 'Cliente contado', paymentMethod:sale.paymentMethod || sale.payment || 'Efectivo', total:Number(sale.total || 0), items:Array.isArray(sale.items) ? sale.items : [] }; }) : [];
  const creditIds = new Map();
  base.credits = Array.isArray(base.credits) ? base.credits.map((credit, index) => { const id=credit.id && String(credit.id).startsWith('CR-') && String(credit.id).length===8 ? credit.id : `CR-${String(index+1).padStart(5,'0')}`; const originalAmount=Number(credit.originalAmount ?? credit.total ?? 0); const downPayment=Number(credit.downPayment ?? credit.initial ?? 0); const financedAmount=Number(credit.financedAmount ?? Math.max(0,originalAmount-downPayment)); const paid=Number(credit.paid ?? 0); const customerId=credit.customerId || customerIds.get(credit.customer) || 'CLI-00001'; creditIds.set(credit.id,id); return { ...credit, id, customerId, customer:credit.customer || base.customers.find(customer=>customer.id===customerId)?.name || 'Cliente contado', saleId:credit.saleId ? (saleIds.get(credit.saleId) || credit.saleId) : null, total:originalAmount, originalAmount, initial:downPayment, downPayment, paid, financedAmount, installmentsCount:credit.installmentsCount || credit.installments || 1, installmentAmount:Number(credit.installmentAmount || 0), next:credit.next || 'Pendiente', date:credit.date || credit.startDate || 'Ahora', status:credit.status || 'Al dia' }; }) : [];
  base.installments = Array.isArray(base.installments) ? base.installments.map((item, index) => ({ ...item, id:item.id && /^CUO-\d{5}$/.test(String(item.id)) && Number(String(item.id).slice(4)) <= 9999 ? item.id : `CUO-${String(index+1).padStart(5,'0')}`, creditId:creditIds.get(item.creditId) || item.creditId, paidAmount:item.paidAmount ?? 0, paymentDate:item.paymentDate || item.paidDate || null })) : [];
  base.payments = Array.isArray(base.payments) ? base.payments.map((item, index) => ({ ...item, id:item.id && String(item.id).startsWith('PAY-') && String(item.id).length===9 ? item.id : `PAY-${String(index+1).padStart(5,'0')}`, creditId:creditIds.get(item.creditId) || item.creditId })) : [];
  base.apartados = Array.isArray(base.apartados) ? base.apartados : [];
  base.inventory = Array.isArray(base.inventory) ? base.inventory.map(item => ({ ...item, productId:String(item.productId).startsWith('PROD-') ? item.productId : base.products.find(product => product.id === item.productId)?.id || item.productId, storeId:item.storeId || storesByName[item.store] || base.stores[0]?.id })) : [];
  base.inventoryByStore = Array.isArray(base.inventoryByStore) ? base.inventoryByStore.map((item,index) => { const product=base.products.find(candidate=>candidate.id===item.productId); const minimumStock=Number(item.minimumStock ?? item.minimum ?? product?.minimum ?? 0); const maximumStock=Number(item.maximumStock ?? item.maximum ?? product?.maximum ?? minimumStock * 3); return { ...item, id:item.id || `INV-${String(index + 1).padStart(5,'0')}`, minimumStock, minimum:minimumStock, maximumStock, maximum:maximumStock, reservedStock:Number(item.reservedStock || 0), updatedAt:item.updatedAt || new Date().toISOString() }; }) : [];
  base.inventory.forEach(item => { if (!base.inventoryByStore.some(row => row.productId === item.productId && row.storeId === item.storeId)) base.inventoryByStore.push({ id:nextId(base.inventoryByStore,'INV'), productId:item.productId, storeId:item.storeId, quantity:Number(item.quantity || 0), minimumStock:Number(item.minimum || item.ideal || 0), updatedAt:new Date().toISOString() }); });
  base.products.forEach(product => { if (!base.inventoryByStore.some(row => row.productId === product.id)) base.inventoryByStore.push({ id:nextId(base.inventoryByStore,'INV'), productId:product.id, storeId:base.stores[0]?.id, quantity:Number(product.stock || 0), minimumStock:Number(product.minimum || 0), updatedAt:new Date().toISOString() }); });
  base.transfers = Array.isArray(base.transfers) ? base.transfers.map(item => ({ ...item, status:item.status === 'Pendiente' ? 'BORRADOR' : item.status === 'En transito' ? 'EN_TRANSITO' : item.status === 'Recibido' ? 'RECIBIDO' : item.status })) : [];
  base.expenses = Array.isArray(base.expenses) ? base.expenses : [];
  base.fuelRecords = Array.isArray(base.fuelRecords) ? base.fuelRecords : [];
  base.auditLog = Array.isArray(base.auditLog) ? base.auditLog : [];
  base.inventoryMovements = Array.isArray(base.inventoryMovements) ? base.inventoryMovements : [];
  base.suppliers = Array.isArray(base.suppliers) ? base.suppliers : [];
  base.purchases = Array.isArray(base.purchases) ? base.purchases : [];
  base.accountsPayable = Array.isArray(base.accountsPayable) ? base.accountsPayable : [];
  base.supplierPayments = Array.isArray(base.supplierPayments) ? base.supplierPayments : [];
  base.purchases.filter(purchase => purchase.status === 'RECIBIDA' && purchase.supplierId && base.suppliers.some(supplier => supplier.id === purchase.supplierId)).forEach(purchase => createAccountPayable(base,purchase,{ totalAmount:purchase.items.reduce((sum,item)=>sum + Math.max(0,item.quantity*item.unitCost-item.discount)*(1+item.iva/100),0), paymentTerms:purchase.paymentMethod }));
  base.paymentMethods = Array.isArray(base.paymentMethods) ? base.paymentMethods : [];
  base.permissionMatrix = Array.isArray(base.permissionMatrix) ? base.permissionMatrix : [];
  base.notifications = Array.isArray(base.notifications) ? base.notifications : [];
  base.demoMode = state.demoMode === true;
  return base;
}
function nextId(collection,prefix) { const max=collection.reduce((value,item)=>Math.max(value,Number(String(item.id || '').replace(/\D/g,'')) || 0),0); return `${prefix}-${String(max + 1).padStart(5,'0')}`; }
export function loadState() {
  return normalizeState(createEmptyState());
}
export function saveState(state) {
  if (!state || typeof state !== 'object') return Promise.resolve(false);
  return fetch('/api/state', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json', 'X-Tenant-ID': activeTenantId() }, body: JSON.stringify({ state, tenantId: activeTenantId() }) }).then(response => {
    if (!response.ok) throw new Error('No se pudo sincronizar el estado con PostgreSQL.');
    return true;
  });
}
export async function hydrateState() {
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return null;
  try {
    const response = await fetch('/api/state', { headers: { ...authHeaders(), Accept: 'application/json', 'X-Tenant-ID': activeTenantId() }, cache: 'no-store' });
    if (response.status === 401 || response.status === 403) {
      localStorage.removeItem('famimuebles-auth-token');
      localStorage.removeItem('famimuebles-user');
      location.reload();
      return null;
    }
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload.state || typeof payload.state !== 'object') return null;
    const remoteState = { ...createEmptyState(), ...payload.state, demoMode: false };
    Object.keys(createEmptyState()).forEach(collection => {
      if (collection !== 'demoMode' && !Array.isArray(remoteState[collection])) remoteState[collection] = [];
    });
    remoteState.demoMode = false;
    return remoteState;
  } catch (error) {
    return null;
  }
}
export async function hydrateCatalog(state) {
  if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return state;
  try {
    const response = await fetch('/api/catalog', { headers: { ...authHeaders(), Accept: 'application/json', 'X-Tenant-ID': activeTenantId() }, cache: 'no-store' });
    if (!response.ok) return state;
    const catalog = await response.json();
    if (!Array.isArray(catalog.products) || !Array.isArray(catalog.stores)) return state;
    state.products = catalog.products.map(product => ({ ...product, price:0, salePrice:0, specialPrice:0, minimumPrice:0 }));
    state.stores = catalog.stores;
    if (Array.isArray(catalog.sales)) state.sales = catalog.sales;
    state.inventoryByStore = catalog.inventory || [];
    state.inventory = state.inventoryByStore;
    return state;
  } catch (error) {
    return state;
  }
}
export function resetState() { const state = createEmptyState(); saveState(state); return state; }
