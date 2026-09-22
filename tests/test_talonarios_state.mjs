import assert from 'node:assert/strict';
import { normalizeActiveTalonarios } from '../js/modules/talonarios.js';

const staleState = [
  {
    id: 'ALIAS-OLD',
    type: 'REMISION',
    startNumber: 15601,
    endNumber: 15650,
    storeId: 'INV CRR 5 5 56',
    destinationName: 'INV CRR 5 5 56',
    status: 'EN_USO',
    currentNumber: 15650,
  },
  {
    id: 'ALIAS-CURRENT',
    type: 'REMISION',
    startNumber: 15701,
    endNumber: 15750,
    storeId: 'INV CRR 5 5 56',
    destinationName: 'INV CRR 5 5 56',
    status: 'ENVIADO',
    currentNumber: 15701,
  },
  {
    id: 'CRR5326-CURRENT',
    type: 'REMISION',
    startNumber: 15801,
    endNumber: 15850,
    storeId: 'INV CRR 5 3 26',
    destinationName: 'INV CRR 5 3 26',
    status: 'ENVIADO',
    currentNumber: 15801,
  },
  {
    id: 'OLD-CRR5326',
    type: 'REMISION',
    startNumber: 15301,
    endNumber: 15350,
    storeId: 'INV CRR 5 3 26',
    destinationName: 'INV CRR 5 3 26',
    status: 'EN_USO',
    currentNumber: 15347,
  },
  {
    id: 'RECEIPT-5651',
    type: 'RECIBO',
    startNumber: 5651,
    endNumber: 5700,
    storeId: 'Cr 5 -3-26',
    destinationName: 'Cr 5 -3-26',
    status: 'ENVIADO',
    currentNumber: 5700,
  },
  {
    id: 'SENT-15751',
    type: 'REMISION',
    startNumber: 15751,
    endNumber: 15800,
    storeId: 'INV CRR 5 5 56',
    destinationName: 'INV CRR 5 5 56',
    status: 'ALMACENADO',
    currentNumber: 15751,
  },
  {
    id: 'MANABLANCA-OLD',
    type: 'REMISION',
    startNumber: 15551,
    endNumber: 15600,
    storeId: 'INV MANABLANCA',
    destinationName: 'INV MANABLANCA',
    status: 'EN_USO',
    currentNumber: 15600,
  },
  {
    id: 'MANABLANCA-CURRENT',
    type: 'REMISION',
    startNumber: 15751,
    endNumber: 15800,
    storeId: 'INV MANABLANCA',
    destinationName: 'INV MANABLANCA',
    status: 'ENVIADO',
    currentNumber: 15754,
  },
  {
    id: 'FUTURE-OLD',
    type: 'REMISION',
    startNumber: 15801,
    endNumber: 15850,
    storeId: 'INV FUTURO',
    destinationName: 'INV FUTURO',
    status: 'EN_USO',
    currentNumber: 15850,
  },
  {
    id: 'FUTURE-NEXT',
    type: 'REMISION',
    startNumber: 15851,
    endNumber: 15900,
    storeId: 'INV FUTURO',
    destinationName: 'INV FUTURO',
    status: 'ENVIADO',
    currentNumber: 15854,
  },
];

const normalized = normalizeActiveTalonarios(staleState);

assert.equal(
  normalized.find((item) => item.id === 'ALIAS-OLD')?.status,
  'TERMINADO',
  'stale EN_USO range should be deactivated'
);
assert.equal(
  normalized.find((item) => item.id === 'ALIAS-CURRENT')?.status,
  'EN_USO',
  'configured current range should remain active'
);
assert.equal(
  normalized.find((item) => item.id === 'OLD-CRR5326')?.status,
  'TERMINADO',
  'old local range should not stay active when a newer configured range exists'
);
assert.equal(
  normalized.find((item) => item.id === 'RECEIPT-5651')?.status,
  'EN_USO',
  'the configured receipt range should remain active'
);
assert.equal(
  normalized.find((item) => item.id === 'SENT-15751')?.status,
  'ENVIADO',
  'the configured sent range should remain sent'
);
assert.equal(
  normalized.find((item) => item.id === 'MANABLANCA-OLD')?.status,
  'TERMINADO',
  'an exhausted old local range should be terminated'
);
assert.equal(
  normalized.find((item) => item.id === 'MANABLANCA-CURRENT')?.status,
  'EN_USO',
  'the newer started range should become active'
);
assert.equal(
  normalized.find((item) => item.id === 'FUTURE-OLD')?.status,
  'TERMINADO',
  'the rotation should terminate any exhausted previous range'
);
assert.equal(
  normalized.find((item) => item.id === 'FUTURE-NEXT')?.status,
  'EN_USO',
  'the rotation should activate any newer started range'
);

console.log('talonarios state regression checks passed');
