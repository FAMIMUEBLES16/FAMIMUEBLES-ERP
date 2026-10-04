import assert from 'node:assert/strict';
import {
  filterAccountsPayable,
  normalizePayableSuppliers,
  resolveAccountPayableSupplier,
} from '../js/services/accounts-payable-service.js';

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
  ['CXP-1'],
  'the provider filter should include legacy accounts linked by the provider name'
);
assert.deepEqual(
  filterAccountsPayable(state, { query: 'michael diaz' }).map(account => account.id),
  ['CXP-1', 'CXP-2'],
  'provider search should match names regardless of accents'
);
assert.deepEqual(
  normalizePayableSuppliers(state).map(account => account.id),
  ['CXP-1', 'CXP-2'],
  'normalization should repair the legacy supplier reference exactly once'
);
assert.equal(state.accountsPayable[0].supplierId, 'SUP-1');
assert.deepEqual(
  normalizePayableSuppliers(state),
  [],
  'normalization should not report already repaired records again'
);
