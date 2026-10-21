import assert from 'node:assert/strict';
import { filterSales, findMatchingSaleCustomer, salesSellers, salesSummary, salesTable, salesWithAnnulledTalonarios } from '../js/modules/ventas.js';

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

const annulledData = {
  sales: [{ id: 'SALE-16010', invoiceNumber: '16010', storeId: 'INV CRR 5 5 56', date: '2026-10-20', total: 25000 }],
  talonarios: [{ id: 'CRR5556-16001', type: 'REMISION', startNumber: 16001, endNumber: 16050, storeId: 'INV CRR 5 5 56', destinationName: 'INV CRR 5 5 56' }],
  talonarioJustifications: [{ id: 'JUST-16009', talonarioId: 'CRR5556-16001', number: 16009, reason: 'ANULADA', notes: 'Factura anulada', status: 'JUSTIFICADA', createdAt: '2026-10-20' }],
};
const salesWithAnnulled = salesWithAnnulledTalonarios(annulledData);
assert.equal(salesWithAnnulled.find(sale => sale.isTalonarioJustification)?.invoiceNumber, 16009);
assert.deepEqual(
  filterSales(salesWithAnnulled, { query: '16009' }).map(sale => sale.invoiceNumber),
  [16009],
  'an annulled talonario number should be searchable in sales'
);
globalThis.localStorage = { getItem: () => null };
assert.match(salesTable(annulledData, salesWithAnnulled), /16009/);
assert.match(salesTable(annulledData, salesWithAnnulled), /ANULADA/);
assert.match(salesSummary(salesWithAnnulled), /1/);
assert.doesNotMatch(salesTable(annulledData, salesWithAnnulled), /data-sale-id="TAL-16009"/);

assert.equal(
  findMatchingSaleCustomer({ customerId: 'Cliente histórico', customer: 'Cliente histórico' }, customers),
  null,
  'an unmatched historical customer should be kept as a separate option'
);