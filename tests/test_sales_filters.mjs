import assert from 'node:assert/strict';
import { filterSales, salesPaymentMethods } from '../js/modules/ventas.js';

const sales = [
  { id: 'SEP-1', date: '2026-09-15', storeId: 'Local Norte', paymentMethod: 'Efectivo', status: 'Completada' },
  { id: 'AGO-1', date: '2026-08-15', storeId: 'Local Norte', paymentMethod: 'Transferencia', status: 'Completada' },
  { id: 'SEP-2', date: '2026-09-18', storeId: 'Local Sur', paymentMethod: 'Sistecrédito', status: 'Anulada' },
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
  filterSales(sales, { payment: 'Transferencia' }).map(sale => sale.id),
  ['AGO-1'],
  'payment method filter should return only sales paid with the selected method'
);

assert.deepEqual(
  filterSales(sales, { payment: 'sistecredito' }).map(sale => sale.id),
  ['SEP-2'],
  'payment method filter should match regardless of accents and not filter by sale status'
);

assert.deepEqual(
  salesPaymentMethods(sales),
  ['Efectivo', 'Sistecrédito', 'Transferencia'],
  'payment method options should be built from available sales'
);