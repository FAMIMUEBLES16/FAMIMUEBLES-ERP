import assert from 'node:assert/strict';
import { createPurchase, nextPurchaseId, nextPurchaseEntryId, receivePurchase, receiveTalonarioPurchase, validatePurchaseDueDate } from '../js/services/purchase-service.js';
import { normalizePurchases, purchaseSummary, purchaseTable } from '../js/modules/compras.js';
import { accountsPayableDetail } from '../js/modules/accounts-payable-detail.js';

globalThis.localStorage = {
  getItem: key => key === 'famimuebles-user' ? JSON.stringify({ role: 'ADMINISTRADOR' }) : null,
};

const state = {
  suppliers: [
    { id: 'SUP-00001', name: 'NUBIA VELAZQUEZ' },
    { id: 'SUP-00009', name: 'MEICO S.A' },
  ],
  stores: [{ id: 'STORE-1', name: 'INV CRR 5 3 26' }],
  products: [{ id: 'PROD-1', name: 'Sofa' }],
  purchases: [
    { id: 'COM-00001', supplierId: 'SUP-00001', storeId: 'STORE-1', supplierInvoice: 'INV CRR 5 3 26', createdAt: '2026-10-16', total: 598000, status: 'CANCELADA', items: [] },
    { id: 'COM-00002', supplierId: 'SUP-00009', storeId: 'INV CRR 5 3 26', supplierInvoice: 'INV CRR 5 3 26', createdAt: '2026-10-20', total: 2601012, status: 'RECIBIDA', items: [] },
  ],
  entries: [
    { id: 967, supplier_id: 'SUP-00001', local: 'INV CRR 5 3 26', factura: 'INV CRR 5 3 26', fecha: '2026-10-16', valor: 598000, estado: 'COMPLETADO' },
    { id: 1038, supplier_name: 'SUP-00009', local: 'INV CRR 5 3 26', factura: 'INV CRR 5 3 26', fecha: '2026-10-20', valor: 2601012, estado: 'COMPLETADO' },
  ],
};

const normalized = normalizePurchases([...state.purchases, ...state.entries], state.suppliers, state.stores);
assert.deepEqual(
  normalized.map(item => [item.id, item.supplierName]),
  [['1038', 'MEICO S.A'], ['967', 'NUBIA VELAZQUEZ']],
  'legacy entries should resolve supplier IDs and replace duplicate ERP purchases in the purchase list'
);
assert.equal(normalized[0].status, 'RECIBIDA', 'completed inbound movements should use the purchase received status');
assert.deepEqual(normalized.map(item => item.duplicatePurchaseIds), [['COM-00002'], ['COM-00001']]);
assert.equal(normalized[0].total, 2601012, 'the edited shared entry total should remain the displayed authoritative amount');
const recentDuplicate = normalizePurchases([
  {
    id: 'COM-00003',
    supplierId: 'SUP-00009',
    storeId: 'INV CRR 5 3 26',
    supplierInvoice: 'BV1O3500640',
    createdAt: '2026-10-20T10:00:00Z',
    total: 2601012,
    status: 'RECIBIDA',
  },
  {
    id: 1042,
    supplier_name: 'MEICO S.A',
    local: 'INV CRR 5 3 26',
    factura: 'BV1O3500640',
    created_at: '2026-10-20T10:00:00Z',
    referencia: 'COM-00003',
    total: 2601012,
    estado: 'COMPLETADO',
  },
], state.suppliers, state.stores);
assert.deepEqual(recentDuplicate.map(item => item.id), ['1042'], 'a new ERP purchase linked by reference and snake_case timestamp should show only its numeric entry ID');
assert.deepEqual(recentDuplicate[0].duplicatePurchaseIds, ['COM-00003']);
assert.deepEqual(normalizePurchases([
  { id: 'COM-00004', supplierId: 'SUP-00009', storeId: 'INV CRR 5 3 26', supplierInvoice: 'BV1O3500641', createdAt: '2026-10-20', total: 2601012 },
  { id: 1043, supplier_name: 'MEICO S.A', local: 'INV CRR 5 3 26', factura: 'BV1O3500641', created_at: '2026-10-20', total: 2601012, estado: 'COMPLETADO' },
], state.suppliers, state.stores).map(item => item.id), ['1043'], 'snake_case entry dates should still deduplicate when the reference is unavailable');
assert.equal(nextPurchaseId([
  ...state.purchases,
  { id: 1038, referencia: 'COM-00104' },
  { id: 'MOV-1', purchaseId: 'COM-00107' },
  { id: 'CXP-00999' },
]), 'COM-00108', 'fallback numbering should include purchase references in movement history without using payable IDs');
assert.equal(nextPurchaseEntryId([...state.entries, ...state.purchases]), '1039', 'new purchases should use the next numeric entry ID instead of a COM sequence');
assert.equal(nextPurchaseEntryId([{ id: 1043 }, { id: 'COM-00104' }]), '1044', 'entry sequencing should ignore legacy COM IDs');

const html = purchaseTable(state, [...state.purchases, ...state.entries]);
assert.equal((html.match(/<tr>/g) || []).length, 3, 'matching historical entries and ERP purchases should render once plus the header row');
assert.match(html, /Eliminar duplicado COM-00001/);
assert.match(html, /Eliminar duplicado COM-00002/);
assert.match(html, /data-action="delete-purchase-mirror" data-purchase-id="COM-00001" data-entry-id="967"/);
assert.doesNotMatch(html, />Ordenar<\/button>|>Recibir<\/button>/, 'purchase table should not require separate order or receive actions');
assert.match(html, /1038/);
assert.match(html, /MEICO S\.A/);
assert.match(html, /967/);
assert.match(html, /NUBIA VELAZQUEZ/);
assert.match(purchaseSummary(state, [...state.purchases, ...state.entries]), /record-summary-count">2</);

const sharedNumericPurchase = {
  id: '1044',
  supplierId: 'SUP-00009',
  storeId: 'INV CRR 5 3 26',
  supplierInvoice: 'BV1O3500685',
  createdAt: '2026-10-20T19:02:22.089Z',
  total: 438134,
  status: 'RECIBIDA',
};
const sharedNumericEntry = {
  id: 1044,
  supplier_name: 'MEICO S.A',
  local: 'INV CRR 5 3 26',
  factura: 'BV1O3500685',
  created_at: '2026-10-20T19:02:22.089Z',
  total: 438134,
  estado: 'COMPLETADO',
};
const numericMirror = normalizePurchases([sharedNumericPurchase, sharedNumericEntry], state.suppliers, state.stores);
assert.deepEqual(numericMirror.map(item => item.id), ['1044'], 'a purchase using its entry ID should appear only once');
assert.equal(numericMirror[0].duplicatePurchaseIds, undefined, 'identical numeric purchase and entry IDs should be one record, not a removable mirror');
const numericMirrorHtml = purchaseTable({ ...state, purchases: [sharedNumericPurchase] }, [sharedNumericPurchase, sharedNumericEntry]);
assert.equal((numericMirrorHtml.match(/<tr>/g) || []).length, 2, 'a purchase and entry with the same numeric ID should render once plus the header');
assert.doesNotMatch(numericMirrorHtml, /delete-purchase-mirror/, 'an identical numeric ID should not expose a duplicate-removal action');

const createState = {
  suppliers: [{ id: 'SUP-1', name: 'Proveedor' }],
  stores: [{ id: 'LOC-1' }],
  products: [{ id: 'PROD-1' }],
  purchases: [],
};
const created = createPurchase(createState, {
  supplierId: 'SUP-1',
  storeId: 'LOC-1',
  paymentMethod: 'Contado',
  items: [{ productId: 'PROD-1', quantity: 2, unitCost: 100, iva: 19, discount: 10 }],
});
assert.equal(created.id, 'COM-00001');
assert.equal(created.supplierName, 'Proveedor');
assert.equal(createState.purchases.length, 1);
assert.throws(
  () => createPurchase(createState, {
    supplierId: 'SUP-1',
    storeId: 'LOC-1',
    paymentMethod: 'Contado',
    items: [{ productId: 'PROD-1', quantity: 1, unitCost: 10, iva: 0, discount: 11 }],
  }),
  /descuentos deben ser validos/
);
assert.equal(validatePurchaseDueDate('Credito', '2026-12-08'), '2026-12-08');
assert.throws(() => validatePurchaseDueDate('Credito', ''), /fecha de vencimiento es obligatoria/);
assert.throws(() => validatePurchaseDueDate('Credito', '2026-02-30'), /fecha de vencimiento no es valida/);
assert.equal(validatePurchaseDueDate('Contado', ''), '');
assert.throws(
  () => createPurchase(createState, {
    supplierId: 'SUP-1',
    storeId: 'LOC-1',
    paymentMethod: 'Credito',
    items: [{ productId: 'PROD-1', quantity: 1, unitCost: 10 }],
  }),
  /fecha de vencimiento es obligatoria/
);
assert.equal(createState.purchases.length, 1, 'invalid purchases should not partially mutate state');
const reservedPurchase = createPurchase(createState, {
  id: 'COM-00104',
  supplierId: 'SUP-1',
  storeId: 'LOC-1',
  paymentMethod: 'Credito',
  dueDate: '2026-12-08',
  items: [{ productId: 'PROD-1', quantity: 1, unitCost: 10 }],
});
assert.equal(reservedPurchase.id, 'COM-00104');
assert.equal(reservedPurchase.dueDate, '2026-12-08');
assert.equal(createState.purchases.length, 2, 'credit purchases should retain their server-reserved ID and due date');

const autoReceiveState = {
  suppliers: createState.suppliers,
  stores: createState.stores,
  products: createState.products,
  purchases: [{
    id: 'COM-00105',
    supplierId: 'SUP-1',
    supplierName: 'Proveedor',
    storeId: 'LOC-1',
    supplierInvoice: 'FAC-105',
    paymentMethod: 'Credito',
    dueDate: '2026-12-08',
    createdAt: '2026-10-20T10:00:00.000Z',
    status: 'BORRADOR',
    items: [{ productId: 'PROD-1', quantity: 2, unitCost: 100, iva: 0, discount: 0 }],
  }],
  inventoryByStore: [],
  inventoryMovements: [],
  accountsPayable: [],
  auditLog: [],
};
const autoReceived = receivePurchase(autoReceiveState, 'COM-00105');
assert.equal(autoReceived.status, 'RECIBIDA', 'a newly created product purchase should be receivable immediately');
assert.equal(autoReceiveState.inventoryByStore[0].quantity, 2, 'automatic receipt should update local inventory');
assert.equal(autoReceiveState.accountsPayable[0].totalAmount, 200, 'automatic receipt should create the payable');
assert.equal(autoReceiveState.accountsPayable[0].dueDate, '2026-12-08', 'automatic payable should retain the entered due date');

const talonarioState = {
  suppliers: createState.suppliers,
  stores: createState.stores,
  purchases: [{
    id: 'COM-00106',
    purchaseType: 'TALONARIOS',
    supplierId: 'SUP-1',
    supplierName: 'Proveedor',
    storeId: 'LOC-1',
    supplierInvoice: 'TAL-106',
    paymentMethod: 'Contado',
    createdAt: '2026-10-20T10:00:00.000Z',
    status: 'BORRADOR',
    talonarioType: 'REMISION',
    talonarioCount: 2,
    talonarioStart: 100,
    talonarioEnd: 199,
    talonarioTotal: 1000,
    talonarioUnitCost: 500,
    items: [{ productId: 'TALONARIOS', quantity: 2, unitCost: 500, iva: 0, discount: 0 }],
  }],
  talonarios: [],
  accountsPayable: [],
  auditLog: [],
};
const talonarioReceipt = receiveTalonarioPurchase(talonarioState, 'COM-00106');
assert.equal(talonarioReceipt.purchase.status, 'RECIBIDA', 'talonario purchases should also be received when saved');
assert.equal(talonarioReceipt.records.length, 2, 'saving the talonario purchase should generate its stored ranges');
assert.equal(talonarioState.accountsPayable[0].status, 'PAGADA', 'cash talonario purchases should create a paid payable');

const payableState = {
  suppliers: [{ id: 'SUP-00009', name: 'MEICO S.A', document: '890101176-0', contact: 'Angel Suarez' }],
  stores: [{ id: 'INV CRR 5 3 26', name: 'INV CRR 5 3 26' }],
  products: [{ id: 'TV-1', name: 'TV VISIVO 55 SMART TV' }],
  purchases: [{
    id: 'COM-00002',
    supplierId: 'SUP-00009',
    storeId: 'INV CRR 5 3 26',
    supplierInvoice: 'BV1O3500640',
    createdAt: '2026-10-20',
    status: 'RECIBIDA',
    items: [{ productId: 'TV-1', quantity: 2, unitCost: 1300506, iva: 0, discount: 0 }],
  }],
  accountsPayable: [{
    id: 'CXP-00018',
    purchaseId: '1038',
    supplierId: 'SUP-00009',
    storeId: 'INV CRR 5 3 26',
    invoiceNumber: 'BV1O3500640',
    issueDate: '2026-10-20',
    dueDate: '2026-12-08',
    totalAmount: 2601012,
    paidAmount: 0,
    balance: 2601012,
    status: 'PENDIENTE',
  }],
  supplierPayments: [],
};
const payableHtml = accountsPayableDetail(payableState, 'CXP-00018');
assert.match(payableHtml, /<td>2<\/td>/, 'payable detail should show the updated purchase quantity');
assert.match(payableHtml, /Total<\/span><strong>\$\u00a02\.601\.012<\/strong>/, 'payable detail should show the updated total');
