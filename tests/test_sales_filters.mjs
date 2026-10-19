import assert from 'node:assert/strict';
import { filterSales, findMatchingSaleCustomer, salesSellers } from '../js/modules/ventas.js';

const sales = [
  { id: 'SEP-1', date: '2026-09-15', storeId: 'Local Norte', paymentMethod: 'Efectivo', seller: 'USR-1', status: 'Completada' },
  { id: 'AGO-1', date: '2026-08-15', storeId: 'Local Norte', paymentMethod: 'Transferencia', seller: 'luis', status: 'Completada' },
  { id: 'SEP-2', date: '2026-09-18', storeId: 'Local Sur', paymentMethod: 'Sistecrédito', usuario_id: 'USR-2', status: 'Anulada' },
];
const users = [
  { id: 'USR-1', username: 'ana', name: 'Ana García' },
  { id: 'USR-2', username: 'luis', name: 'Luis' },
  { id: 'USR-3', username: 'martha', name: 'Martha' },
];

assert.deepEqual(
  filterSales(sales, { month: '2026-09', store: 'LOCAL-NORTE', stores: [{ id: 'LOCAL-NORTE', name: 'Local Norte' }] }).map(sale => sale.id),
  ['SEP-1'],
  'month and local filters should be applied together even when sale data stores the local name'
);

assert.deepEqual(
  filterSales(sales, { month: '2026-09' }).map(sale => sale.id),
  ['SEP-1', 'SEP-2'],
  'month filter should retain sales from all locals in the selected month'
);

assert.deepEqual(
  filterSales(sales, { seller: 'seller:ana garcia', users }).map(sale => sale.id),
  ['SEP-1'],
  'user filter should resolve a sale seller stored as a user ID'
);

assert.deepEqual(
  filterSales(sales, { seller: 'seller:luis', users }).map(sale => sale.id),
  ['AGO-1', 'SEP-2'],
  'user filter should resolve username and legacy user ID references independent of status'
);

assert.deepEqual(
  salesSellers(sales, users),
  [
    { value: 'seller:ana garcia', name: 'Ana García' },
    { value: 'seller:luis', name: 'Luis' },
    { value: 'seller:martha', name: 'Martha' },
  ],
  'user options should use registered names, include users without matching sales, and be sorted'
);

assert.deepEqual(
  salesSellers([{ id: 'LEGACY-1', seller: 'Carlos Ramírez' }]),
  [{ value: 'seller:carlos ramirez', name: 'Carlos Ramírez' }],
  'seller values without a current user record should remain available as filter options'
);

const customers = [
  { id: 'CLI-15566', name: 'Samara Alzate' },
  { id: 'CLI-2', name: 'Otro cliente' },
];

assert.equal(
  findMatchingSaleCustomer({ customerId: 'Samara Alzate', customer: 'Samara Alzate' }, customers)?.id,
  'CLI-15566',
  'a legacy sale customer name should select the matching customer instead of the first option'
);

assert.equal(
  findMatchingSaleCustomer({ customerId: 'SAMARA ALZATE' }, customers)?.id,
  'CLI-15566',
  'a sale with only a legacy customer name should still select the matching customer'
);

assert.equal(
  findMatchingSaleCustomer({ customerId: 'CLI-15566', customer: 'Samara Alzate' }, customers)?.name,
  'Samara Alzate',
  'a canonical customer ID should match the existing customer'
);

assert.equal(
  findMatchingSaleCustomer({ customerId: 'Cliente histórico', customer: 'Cliente histórico' }, customers),
  null,
  'an unmatched historical customer should be kept as a separate option'
);