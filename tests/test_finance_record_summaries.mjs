import assert from 'node:assert/strict';
import { renderCreditos } from '../js/modules/creditos.js';
import { payableSummary, renderCuentasPorPagar } from '../js/modules/cuentas-por-pagar.js';

const creditData = {
  credits: [
    { id: 1, total: 200000, initial: 0, saldo_pendiente: 150000, customer: 'Andrés Pérez' },
    { id: 2, total: 300000, initial: 0, saldo_pendiente: 250000, customer: 'Cliente Dos' },
  ],
  payments: [],
  installments: [],
};

const filteredCredits = renderCreditos({ ...creditData, creditQuery: 'andres' });
assert.match(filteredCredits, /data-credit-summary/);
assert.match(filteredCredits, /Resumen de cartera/);
assert.match(filteredCredits, /Saldo pendiente:/);
assert.match(filteredCredits, /class="record-summary-count">1</);
assert.match(filteredCredits, /\$ 150\.000/);

const accounts = [
  { id: 'CXP-1', supplierId: 'SUP-1', supplierName: 'Proveedor Uno', totalAmount: 200000, paidAmount: 50000, dueDate: '2099-01-01' },
  { id: 'CXP-2', supplierId: 'SUP-2', supplierName: 'Proveedor Dos', totalAmount: 300000, paidAmount: 100000, dueDate: '2099-01-01' },
];
const payableHtml = renderCuentasPorPagar({ accountsPayable: accounts, suppliers: [], stores: [] });
assert.match(payableHtml, /data-payables-summary/);
assert.match(payableHtml, /Resumen de cuentas por pagar/);
assert.match(payableHtml, /class="record-summary-count">2</);
assert.match(payableSummary([accounts[0]]), /\$ 150\.000/);
