import assert from 'node:assert/strict';
import {
  accountPayableSupplierKey,
  accountPayableSupplierName,
  filterAccountsPayable,
  normalizePayableSuppliers,
  resolveAccountPayableSupplier,
} from '../js/services/accounts-payable-service.js';
import { supplierRecords } from '../js/modules/proveedores.js';
import { purchaseTable } from '../js/modules/compras.js';

const state = {
  suppliers: [
    { id: 'SUP-1', name: 'Michael Díaz', document: '900.111.222-3' },
    { id: 'SUP-2', name: 'Otro proveedor', document: '800.444.555-6' },
    { id: 'SUP-3', name: 'Michael Diaz Comercial', document: '900.777.888-9' },
  ],
  accountsPayable: [
    { id: 'CXP-1', supplierId: 'Michael Diaz', supplierName: 'Michael Diaz', invoiceNumber: 'FAC-1', totalAmount: 100, paidAmount: 0, dueDate: '2099-01-01' },
    { id: 'CXP-2', supplierId: 'SUP-1', supplierName: 'Michael Díaz', invoiceNumber: 'FAC-2', totalAmount: 250, paidAmount: 0, dueDate: '2099-01-01' },
    { id: 'CXP-3', supplierId: 'SUP-2', supplierName: 'Otro proveedor', invoiceNumber: 'FAC-3', totalAmount: 400, paidAmount: 0, dueDate: '2099-01-01' },
  ],
};

assert.equal(resolveAccountPayableSupplier(state, state.accountsPayable[0]).id, 'SUP-1');
assert.deepEqual(
  filterAccountsPayable(state, { supplierId: 'SUP-1' }).map(account => account.id),
  ['CXP-1', 'CXP-2'],
  'the provider filter should include both legacy and current accounts for that provider'
);
assert.deepEqual(
  filterAccountsPayable(state, { query: 'michael diaz' }).map(account => account.id),
  ['CXP-1', 'CXP-2'],
  'provider search should match names regardless of accents'
);
assert.deepEqual(
  normalizePayableSuppliers(state).map(account => account.id),
  ['CXP-1'],
  'normalization should repair the legacy supplier reference exactly once'
);
assert.equal(state.accountsPayable[0].supplierId, 'SUP-1');
assert.deepEqual(
  normalizePayableSuppliers(state),
  [],
  'normalization should not report already repaired records again'
);

const conflictingState = {
  suppliers: [
    { id: 'SUP-NUBIA', name: 'NUBIA VELAZQUEZ' },
    { id: 'SUP-MEICO', name: 'MEICO SA', document: '900.123.456-7' },
  ],
  purchases: [
    {
      id: 'COM-MEICO-1',
      supplierId: 'SUP-NUBIA',
      supplierName: 'MEICO SA',
      supplierInvoice: 'MEICO-001',
    },
  ],
  accountsPayable: [
    {
      id: 'CXP-MEICO-1',
      purchaseId: 'COM-MEICO-1',
      supplierId: 'SUP-NUBIA',
      supplierName: 'NUBIA VELAZQUEZ',
      invoiceNumber: 'MEICO-001',
      totalAmount: 100,
      paidAmount: 0,
      dueDate: '2099-01-01',
    },
  ],
};

assert.equal(
  resolveAccountPayableSupplier(conflictingState, conflictingState.accountsPayable[0]).id,
  'SUP-MEICO',
  'purchase supplier history should take precedence over a reused supplier id'
);
assert.deepEqual(
  normalizePayableSuppliers(conflictingState).map(account => account.id),
  ['CXP-MEICO-1'],
  'a conflicting supplier reference should be repaired from its linked purchase'
);
assert.equal(conflictingState.accountsPayable[0].supplierId, 'SUP-MEICO');
assert.equal(conflictingState.accountsPayable[0].supplierName, 'MEICO SA');

const deletedSupplierState = {
  suppliers: [{ id: 'SUP-NUBIA', name: 'NUBIA VELAZQUEZ' }],
  purchases: [
    {
      id: 'COM-MEICO-2',
      supplierId: 'SUP-NUBIA',
      supplierName: 'MEICO SA',
      supplierInvoice: 'MEICO-002',
    },
  ],
  accountsPayable: [
    {
      id: 'CXP-MEICO-2',
      purchaseId: 'COM-MEICO-2',
      supplierId: 'SUP-NUBIA',
      supplierName: 'NUBIA VELAZQUEZ',
      invoiceNumber: 'MEICO-002',
      totalAmount: 100,
      paidAmount: 0,
      dueDate: '2099-01-01',
    },
  ],
};

assert.equal(
  resolveAccountPayableSupplier(deletedSupplierState, deletedSupplierState.accountsPayable[0]),
  null,
  'an id conflict must not assign an account to another provider when the historical provider is missing'
);
assert.equal(
  accountPayableSupplierName(deletedSupplierState, deletedSupplierState.accountsPayable[0]),
  'MEICO SA',
  'historical provider name should remain visible when its provider record is missing'
);
assert.equal(
  accountPayableSupplierKey(deletedSupplierState, deletedSupplierState.accountsPayable[0]),
  'legacy:meicosa',
  'a missing historical provider should have a filter key that cannot collide with the reused id'
);
assert.equal(
  accountPayableSupplierName({
    suppliers: [{ id: 'SUP-00009', name: 'MEICO S.A' }],
    entries: [{ id: 588, supplierName: 'Michael Díaz' }],
  }, {
    id: 'CXP-MEICO-588',
    purchaseId: '588',
    supplierId: 'SUP-00009',
    supplierName: 'MEICO S.A',
  }),
  'MEICO S.A',
  'a linked movement employee must not override the payable supplier name'
);
assert.deepEqual(
  filterAccountsPayable(deletedSupplierState, { supplierId: 'legacy:meicosa' }).map(account => account.id),
  ['CXP-MEICO-2'],
  'the historical supplier filter should return its own accounts'
);
assert.deepEqual(
  supplierRecords(deletedSupplierState).map(supplier => [supplier.name, supplier._historicalOnly]),
  [['NUBIA VELAZQUEZ', undefined], ['MEICO SA', true]],
  'a missing supplier should remain visible as a clearly marked historical record'
);
assert.equal(
  supplierRecords({
    ...deletedSupplierState,
    entries: [{ id: 588, supplierName: 'Michael Díaz' }],
  }).some(supplier => supplier.name === 'Michael Díaz'),
  false,
  'movement employees should not be added as historical suppliers'
);

globalThis.localStorage = { getItem: () => null };
const linkedPurchaseHtml = purchaseTable(
  {
    ...conflictingState,
    accountsPayable: [{
      ...conflictingState.accountsPayable[0],
      purchaseId: '588',
      supplierId: 'SUP-MEICO',
      supplierName: 'MEICO SA',
    }],
  },
  [{ id: 588, supplier_name: 'Michael Díaz', local: 'INV CRR 5 3 26', factura: 'BV1O3497742' }]
);
assert.match(
  linkedPurchaseHtml,
  /MEICO SA/,
  'a purchase linked to a payable should display the restored supplier instead of its captured employee'
);
