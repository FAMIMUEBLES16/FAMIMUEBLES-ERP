import assert from 'node:assert/strict';
import { missingTalonarioNumbers, missingTalonarioNumbersForLocal, normalizeActiveTalonarios, talonarioSalesDocuments } from '../js/modules/talonarios.js';

const manablancaTalonario = {
  id: 'MANABLANCA-15751',
  type: 'REMISION',
  startNumber: 15751,
  endNumber: 15800,
  storeId: 'INV MANABLANCA',
  destinationName: 'INV MANABLANCA',
  consecutiveBaseline: 15760,
};
const saleFromOtherStore = {
  invoiceNumber: '15761',
  documentType: 'REMISION',
  storeId: 'INV CRR 5 3 17',
};

assert.deepEqual(
  talonarioSalesDocuments(manablancaTalonario, [saleFromOtherStore]),
  [15761],
  'a remision registered from another store should count against its assigned range'
);
assert.deepEqual(
  missingTalonarioNumbers(manablancaTalonario, [saleFromOtherStore]),
  [],
  'a cross-store sale should not appear as a missing remision'
);
assert.deepEqual(
  missingTalonarioNumbersForLocal(
    { ...manablancaTalonario, startNumber: 15851, endNumber: 15900 },
    [
      { ...manablancaTalonario, id: 'CARTAGENITA-OLD', startNumber: 15401, endNumber: 15450, status: 'TERMINADO' },
      { ...manablancaTalonario, id: 'CARTAGENITA-CURRENT', startNumber: 15851, endNumber: 15900, consecutiveBaseline: 15850 },
    ],
    [
      { invoiceNumber: '15448', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
      { invoiceNumber: '15851', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
      { invoiceNumber: '15853', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
    ]
  ),
  [15449, 15450, 15852],
  'Cartagenita II should show gaps across the retired and current ranges'
);
assert.deepEqual(
  missingTalonarioNumbersForLocal(
    { ...manablancaTalonario, startNumber: 15851, endNumber: 15900 },
    [
      { ...manablancaTalonario, id: 'CARTAGENITA-HISTORICAL-NAME', startNumber: 15401, endNumber: 15450, status: 'TERMINADO', destinationName: 'Cartagenita' },
      { ...manablancaTalonario, id: 'CARTAGENITA-CURRENT-NAME', startNumber: 15851, endNumber: 15900, consecutiveBaseline: 15850 },
    ],
    [
      { invoiceNumber: '15448', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
      { invoiceNumber: '15450', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
      { invoiceNumber: '15851', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
      { invoiceNumber: '15853', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
    ]
  ),
  [15449, 15852],
  'the historical Cartagenita label should map to Cartagenita II'
);
assert.deepEqual(
  missingTalonarioNumbersForLocal(
    { id: 'CENTRAL-CURRENT', type: 'REMISION', startNumber: 15801, endNumber: 15850, currentNumber: 15812, consecutiveBaseline: 15808, status: 'EN_USO', storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26' },
    [
      { id: 'CENTRAL-CURRENT', type: 'REMISION', startNumber: 15801, endNumber: 15850, currentNumber: 15812, consecutiveBaseline: 15808, status: 'EN_USO', storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26' },
      { id: 'CENTRAL-OLD', type: 'REMISION', startNumber: 15901, endNumber: 15950, currentNumber: 15950, status: 'TERMINADO', storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26' },
    ],
    [{ invoiceNumber: '15812', documentType: 'REMISION', storeId: 'INV CRR 5 3 26' }, { invoiceNumber: '15901', documentType: 'REMISION', storeId: 'INV CRR 5 3 26' }]
  ),
  [15809, 15810, 15811],
  'the central store should only inspect its current range'
);

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
  'ALMACENADO',
  'an old central range without send evidence should remain stored'
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
