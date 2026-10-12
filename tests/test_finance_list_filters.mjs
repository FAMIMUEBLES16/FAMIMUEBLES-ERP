import assert from 'node:assert/strict';
import { renderCreditos } from '../js/modules/creditos.js';
import { renderApartados } from '../js/modules/apartados.js';

globalThis.localStorage = { getItem: () => '{"role":"ADMINISTRADOR"}' };

const credits = Array.from({ length: 25 }, (_, index) => ({
  id: index + 1,
  total: 100000,
  abono_inicial: 0,
  saldo_pendiente: index === 24 ? 0 : 100000,
  cliente: index === 4 ? 'Andrés Pérez' : `Cliente ${index + 1}`,
  factura: index === 4 ? 'FAC-AND-204' : `FAC-${index + 1}`,
}));
const creditPayments = [
  { credito_id: 1, fecha_vencimiento: '2000-01-01', valor_programado: 100000, valor_pagado: 0 },
];

const firstCreditPage = renderCreditos({
  credits,
  payments: [],
  installments: creditPayments,
  creditPage: 1,
  creditPageSize: 20,
});
assert.match(firstCreditPage, /data-credit-search/);
assert.match(firstCreditPage, /data-credit-filter/);
assert.match(firstCreditPage, /Mostrando 1-20 de 25/);
assert.match(firstCreditPage, /data-action="credit-payment"/);
assert.match(firstCreditPage, /<th>Consulta<\/th>/);
assert.match(firstCreditPage, /<th>Registrar abono<\/th>/);
assert.doesNotMatch(firstCreditPage, /<strong>25<\/strong>/);

const secondCreditPage = renderCreditos({
  credits,
  payments: [],
  installments: creditPayments,
  creditPage: 2,
  creditPageSize: 20,
});
assert.match(secondCreditPage, /Mostrando 21-25 de 25/);
assert.match(secondCreditPage, /<strong>25<\/strong>/);
assert.doesNotMatch(secondCreditPage, /<strong>1<\/strong>/);

const searchedCredit = renderCreditos({
  credits,
  payments: [],
  installments: creditPayments,
  creditQuery: 'andres fac-and-204',
});
assert.match(searchedCredit, /Andrés Pérez/);
assert.match(searchedCredit, /FAC-AND-204/);
assert.match(searchedCredit, /Mostrando 1-1 de 1/);
assert.match(renderCreditos({ credits, payments: [], installments: [], creditQuery: '25' }), /Mostrando 1-1 de 1/);
assert.match(renderCreditos({ credits, payments: [], installments: [], creditQuery: 'FAC-AND-204' }), /Mostrando 1-1 de 1/);
assert.match(renderCreditos({ credits, payments: [], installments: [], creditFilter: 'paid' }), /Mostrando 1-1 de 1/);
assert.match(renderCreditos({ credits, payments: [], installments: [], creditPageSize: 10 }), /Mostrando 1-10 de 25/);

const overdueCredits = renderCreditos({
  credits,
  payments: [],
  installments: creditPayments,
  creditFilter: 'overdue',
});
assert.match(overdueCredits, /Mostrando 1-1 de 1/);
assert.match(overdueCredits, /<strong>1<\/strong>/);
assert.match(overdueCredits, /EN MORA/);

const apartados = Array.from({ length: 22 }, (_, index) => ({
  id: index + 1,
  cliente: index === 3 ? 'Andrés Pérez' : `Cliente ${index + 1}`,
  producto: `Producto ${index + 1}`,
  total: 200000,
  abono_inicial: 50000,
  valor_pagado: index === 21 ? 200000 : 50000,
  saldo_pendiente: index === 21 ? 0 : 150000,
  numero_recibo: index === 3 ? 'REC-AND-204' : `REC-${index + 1}`,
  fecha_entrega: '2000-01-01',
}));

const firstReservationPage = renderApartados({ apartados, apartadoPage: 1, apartadoPageSize: 20 });
assert.match(firstReservationPage, /data-apartado-search/);
assert.match(firstReservationPage, /data-apartado-filter/);
assert.match(firstReservationPage, /Mostrando 1-20 de 22/);
assert.match(firstReservationPage, /<th>Consulta<\/th>/);
assert.match(firstReservationPage, /<th>Registrar abono<\/th>/);
assert.doesNotMatch(firstReservationPage, /EN MORA/);
assert.doesNotMatch(firstReservationPage, /<strong>22<\/strong>/);

const secondReservationPage = renderApartados({ apartados, apartadoPage: 2, apartadoPageSize: 20 });
assert.match(secondReservationPage, /Mostrando 21-22 de 22/);
assert.match(secondReservationPage, /<strong>22<\/strong>/);

const searchedReservation = renderApartados({
  apartados,
  apartadoQuery: 'andres rec-and-204',
});
assert.match(searchedReservation, /Andrés Pérez/);
assert.match(searchedReservation, /REC-AND-204/);
assert.match(searchedReservation, /Mostrando 1-1 de 1/);
assert.match(renderApartados({ apartados, apartadoQuery: '22' }), /Mostrando 1-1 de 1/);
assert.match(renderApartados({ apartados, apartadoQuery: 'REC-AND-204' }), /Mostrando 1-1 de 1/);
assert.match(renderApartados({ apartados, apartadoPageSize: 10 }), /Mostrando 1-10 de 22/);

const paidReservations = renderApartados({ apartados, apartadoFilter: 'paid' });
assert.match(paidReservations, /Mostrando 1-1 de 1/);
assert.match(paidReservations, /PAGADO/);

const overdueReservation = renderApartados({
  apartados: [{ ...apartados[0], fecha_vencimiento: '2000-01-01' }],
  apartadoFilter: 'overdue',
});
assert.match(overdueReservation, /Mostrando 1-1 de 1/);
assert.match(overdueReservation, /EN MORA/);
