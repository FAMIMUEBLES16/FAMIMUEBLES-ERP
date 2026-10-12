import assert from 'node:assert/strict';
import { creditPendingBalance, filterDuplicateHistoricalCredits, normalizeCredit, paymentsForCredit, renderCreditos } from '../js/modules/creditos.js';

const credit = {
  id: 27,
  movimiento_id: 91,
  initial: 0,
  total: 350000,
  abono_inicial: 1000000,
  saldo_pendiente: 350000,
  creado_en: '2026-08-20T00:00:00',
  customer: 'Alegri Camejo',
};
const payments = [
  { credito_id: 27, fecha: '2026-10-02T16:37:42', valor_abono: 100000, observacion: 'Abono inicial' },
  { credito_id: 27, fecha: '2026-10-05T11:34:01', valor_abono: 400000 },
  { credito_id: 27, fecha: '2026-10-05T11:35:12', valor_abono: 650000 },
  { apartado_id: 27, tipo_abono: 'APARTADO', fecha: '2026-10-05', valor_abono: 900000 },
];
const normalized = normalizeCredit(credit, [], payments);

assert.equal(normalized.initial, 1000000, 'both backend spellings of the down payment should be recognized');
assert.equal(normalized.paid, 1150000, 'payments should be summed without counting the initial payment twice');
assert.equal(normalized.pending, 350000, 'the current stored balance should remain visible');
assert.equal(normalized.total, 2500000, 'displayed total should reconcile initial payment, later payments, and balance');

const angelicaCredit = normalizeCredit({
  id: 28,
  total: 800000,
  initial: 0,
  saldo_pendiente: 800000,
  customer: 'Angelica Beemon',
}, [], [
  { credito_id: 28, valor_abono: 100000 },
  { credito_id: 28, valor_abono: 120000 },
  { credito_id: 28, valor_abono: 150000 },
]);

assert.equal(angelicaCredit.paid, 370000, 'all posted credit payments should be reflected in paid');
assert.equal(angelicaCredit.total, 1170000, 'credit value should reconcile the ledger with the current balance');

const angelicaCreditWithInitial = normalizeCredit({
  id: 29,
  total: 250000,
  initial: 0,
  abono_inicial: 200000,
  saldo_pendiente: 250000,
  customer: 'Angelica Beemon',
}, [], [
  { credito_id: 29, valor_abono: 400000, observacion: 'Abono inicial' },
  { credito_id: 29, valor_abono: 100000 },
]);

assert.equal(angelicaCreditWithInitial.initial, 200000, 'the raw down payment should take precedence over a normalized zero');
assert.equal(angelicaCreditWithInitial.paid, 500000, 'a mismatched initial note must not hide a valid payment');

const yennyCreditRecord = {
  id: 30,
  total: 240000,
  initial: 0,
  abono_inicial: 560000,
  saldo_pendiente: 240000,
  factura: 'HIST-CR-20260630-YENNY',
  creado_en: '2026-06-30T00:00:00-05:00',
  customer: 'Yenny Perez',
};
const yennyHistoricalRecord = {
  id: 'HIST-CR-20260630-YENNY',
  total: 1000000,
  originalAmount: 1000000,
  initial: 360000,
  paid: 560000,
  saldo_pendiente: 440000,
  customer: 'Yenny Perez',
};
const yennyCredits = [yennyCreditRecord, yennyHistoricalRecord];
const yennyPayments = [
  { credito_id: 30, valor_abono: 360000, fecha: '2026-06-30T00:00:00', observacion: 'Abono inicial histórico' },
  { credito_id: 30, valor_abono: 200000, fecha: '2026-06-30T00:00:00', observacion: 'Abono histórico adicional' },
  { credito_id: 30, valor_abono: 200000, fecha: '2026-09-14T14:57:24', observacion: '' },
];
const yennyCredit = normalizeCredit(yennyCreditRecord, [], yennyPayments, yennyCredits);

assert.equal(yennyCredit.initial, 360000, 'the actual historical down payment should be taken from its source record');
assert.equal(yennyCredit.paid, 400000, 'both historical and current later payments should be reflected once');
assert.equal(yennyCredit.pending, 240000, 'the stored outstanding balance should be preserved');
assert.equal(yennyCredit.total, 1000000, 'the historical credit amount should reconcile initial, payments, and balance');

assert.deepEqual(
  filterDuplicateHistoricalCredits(yennyCredits).map(credit => String(credit.id)),
  ['30'],
  'the stale historical snapshot linked to the active PostgreSQL credit should not be shown separately',
);
assert.equal(creditPendingBalance({
  total: 1000000,
  initial: 360000,
  paid: 560000,
  saldo_pendiente: 440000,
}), 440000, 'payment modal balance should use the stored pending amount');
assert.equal(creditPendingBalance({
  total: 350000,
  initial: 0,
  abono_inicial: 1000000,
  saldo_pendiente: 350000,
}), 350000, 'payment modal should not calculate a negative balance from legacy totals');

const yadiraCredit = normalizeCredit({
  id: 16,
  total: 2200000,
  initial: 0,
  paid: 0,
  saldo_pendiente: 600000,
  customer: 'Yadira Ortegón',
}, [], [
  { credito_id: 16, valor_abono: 1600000, saldo_nuevo: 600000 },
]);

assert.equal(yadiraCredit.paid, 1600000, 'the payment already recorded through Telegram should appear in the ERP');
assert.equal(yadiraCredit.pending, 600000, 'the ERP should allow only a new payment up to the balance shared with Telegram');
assert.equal(creditPendingBalance({
  total: 2200000,
  initial: 0,
  paid: 0,
  saldo_pendiente: 600000,
}), 600000, 'the payment dialog should cap a new payment at Yadira’s remaining balance');

const katerineCredit = {
  id: 13,
  total: 220000,
  abono_inicial: 70000,
  saldo_pendiente: 150000,
  cliente: 'Katerine',
  creado_en: '2026-09-12T19:01:51.527438-05:00',
};
const katerinePayments = [
  {
    credito_id: null,
    apartado_id: 13,
    tipo_abono: 'APARTADO',
    numero_recibo: '5659',
    valor_abono: 250000,
  },
  {
    credito_id: 13,
    apartado_id: null,
    tipo_abono: 'CREDITO',
    numero_recibo: '15640',
    fecha: '2026-09-12T19:01:51.527438-05:00',
    valor_abono: 70000,
    metodo_pago: 'Inicial',
    observacion: 'Abono inicial',
  },
];

assert.deepEqual(
  paymentsForCredit(katerineCredit, katerinePayments).map(payment => payment.numero_recibo),
  ['15640'],
  'a reservation payment with the same numeric ID must not appear in the credit history',
);
const normalizedKaterineCredit = normalizeCredit(katerineCredit, [], katerinePayments);
assert.equal(normalizedKaterineCredit.total, 220000, 'the reservation payment must not inflate the credit total');
assert.equal(normalizedKaterineCredit.paid, 0, 'the reservation payment must not count as a credit payment');
assert.equal(normalizedKaterineCredit.pending, 150000, 'the live credit balance must remain unchanged');

const html = renderCreditos({
  credits: [credit, ...yennyCredits],
  sales: [],
  installments: [],
  payments: [...payments, ...yennyPayments],
});

assert.match(html, /Alegri Camejo/);
assert.match(html, /\$ 1\.150\.000/);
assert.match(html, /\$ 2\.500\.000/);
assert.match(html, /\$ 350\.000/);
assert.match(html, /Yenny Perez/);
assert.match(html, /\$ 360\.000/);
assert.match(html, /\$ 400\.000/);
assert.match(html, /\$ 240\.000/);
assert.doesNotMatch(html, /HIST-CR-20260630-YENNY/);
