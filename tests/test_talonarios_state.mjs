import assert from 'node:assert/strict';
import { availableCentralTalonarios, configuredTalonarioOwnerLabel, configuredTalonarioOwnerMatches, currentTalonarioNumber, deduplicateTalonarioHistory, missingTalonarioNumbers, missingTalonarioNumbersForLocal, nextAvailableCentralTalonario, normalizeActiveTalonarios, talonarioModal, talonarioSalesDocuments } from '../js/modules/talonarios.js';

assert.equal(configuredTalonarioOwnerLabel('REMISION', 15801, 15850), 'INV CRR 5 3 26');
assert.equal(configuredTalonarioOwnerMatches('REMISION', 15801, 15850, ['INV CRR 5 3 26']), true);
assert.equal(configuredTalonarioOwnerMatches('REMISION', 15801, 15850, ['INV CARTAGENITA']), false);
assert.equal(configuredTalonarioOwnerMatches('REMISION', 15901, 15950, ['INV CARTAGENITA']), true);

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
  [],
  'a remision registered at another store should not count against this local range'
);
assert.deepEqual(
  missingTalonarioNumbers(manablancaTalonario, [saleFromOtherStore]),
  [],
  'a cross-store sale should not appear as a missing remision'
);
const cr7Talonario = { type: 'REMISION', startNumber: 15651, endNumber: 15700, currentNumber: 15674, consecutiveBaseline: 15669, storeId: 'INV CRR 7 6A 15', destinationName: 'INV CRR 7 6A 15' };
const cr7ForeignInvoice = { invoiceNumber: '15670', documentType: 'REMISION', storeId: 'INV CRR 5 3 17' };
assert.equal(
  missingTalonarioNumbers(cr7Talonario, [cr7ForeignInvoice]).includes(15670),
  false,
  'invoice 15670 recorded at another local should not appear as missing'
);
const cr26Talonario = { type: 'REMISION', startNumber: 15801, endNumber: 15850, currentNumber: 15821, consecutiveBaseline: 15819, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26' };
const cr26Sales = [
  { invoiceNumber: '15820', documentType: 'REMISION', storeId: 'INV CRR 5 3 17' },
  { invoiceNumber: '15821', documentType: 'REMISION', storeId: 'INV CRR 5 3 26' },
];
assert.deepEqual(
  missingTalonarioNumbers(cr26Talonario, cr26Sales),
  [],
  'invoice 15820 recorded at another local should count as used without changing the current local invoice'
);
assert.equal(currentTalonarioNumber(cr26Talonario, cr26Sales), 15821);
assert.deepEqual(
  missingTalonarioNumbersForLocal(
    { ...manablancaTalonario, startNumber: 15851, endNumber: 15900, storeId: 'INV CARTAGENITA II', destinationName: 'INV CARTAGENITA II' },
    [
      { ...manablancaTalonario, id: 'CARTAGENITA-OLD', startNumber: 15401, endNumber: 15450, status: 'TERMINADO', storeId: 'INV CARTAGENITA', destinationName: 'Cartagenita' },
      { ...manablancaTalonario, id: 'CARTAGENITA-CURRENT', startNumber: 15851, endNumber: 15900, currentNumber: 15853, consecutiveBaseline: 15850, storeId: 'INV CARTAGENITA II', destinationName: 'INV CARTAGENITA II' },
    ],
    [
      { invoiceNumber: '15448', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
      { invoiceNumber: '15851', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
      { invoiceNumber: '15853', documentType: 'REMISION', storeId: 'INV CARTAGENITA II' },
    ]
  ),
  [15449, 15450, 15852],
  'the same local should show gaps across the retired and current ranges'
);
assert.deepEqual(
  missingTalonarioNumbersForLocal(
    { ...manablancaTalonario, startNumber: 15851, endNumber: 15900, storeId: 'INV CARTAGENITA II', destinationName: 'INV CARTAGENITA II' },
    [
      { ...manablancaTalonario, id: 'CARTAGENITA-HISTORICAL-NAME', startNumber: 15401, endNumber: 15450, status: 'TERMINADO', destinationName: 'Cartagenita' },
      { ...manablancaTalonario, id: 'CARTAGENITA-CURRENT-NAME', startNumber: 15851, endNumber: 15900, currentNumber: 15853, consecutiveBaseline: 15850, storeId: 'INV CARTAGENITA II', destinationName: 'INV CARTAGENITA II' },
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
    startNumber: 15951,
    endNumber: 16000,
    storeId: 'INV FUTURO',
    destinationName: 'INV FUTURO',
    status: 'EN_USO',
    currentNumber: 15850,
  },
  {
    id: 'FUTURE-NEXT',
    type: 'REMISION',
    startNumber: 16001,
    endNumber: 16050,
    storeId: 'INV FUTURO',
    destinationName: 'INV FUTURO',
    status: 'ENVIADO',
    currentNumber: 16001,
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
  'EN_USO',
  'a configured range should be moved to its owning local'
);
assert.equal(normalized.find((item) => item.id === 'SENT-15751')?.storeId, 'INV MANABLANCA');
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

const reportedTalonarios = [
  { id: 'CARTAGENITA-CURRENT', type: 'REMISION', startNumber: 15451, endNumber: 15500, currentNumber: 15473, storeId: 'INV CARTAGENITA', destinationName: 'INV CARTAGENITA', status: 'ENVIADO' },
  { id: 'CARTAGENITA-SENT', type: 'REMISION', startNumber: 15901, endNumber: 15950, currentNumber: 15901, storeId: 'INV CARTAGENITA', destinationName: 'INV CARTAGENITA', sentFrom: 'INV CRR 5 3 26', sentAt: '2026-10-08T10:00:00Z', status: 'EN_USO' },
  { id: 'CARTAGENITA-CENTRAL-SOURCE', type: 'REMISION', startNumber: 15901, endNumber: 15950, currentNumber: 15901, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26', destinationStoreId: 'INV CARTAGENITA', sentAt: '2026-10-08T10:00:00Z', status: 'ENVIADO' },
  { id: 'CARTAGENITA-II-CURRENT', type: 'REMISION', startNumber: 15851, endNumber: 15900, currentNumber: 15851, storeId: 'INV CARTAGENITA II', destinationName: 'INV CARTAGENITA II', status: 'ENVIADO' },
  { id: 'CRR5317-CURRENT', type: 'REMISION', startNumber: 14051, endNumber: 14100, currentNumber: 14095, storeId: 'INV CRR 5 3 17', destinationName: 'INV CRR 5 3 17', status: 'EN_USO' },
  { id: 'CRR5326-CURRENT', type: 'REMISION', startNumber: 15801, endNumber: 15850, currentNumber: 15808, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26', status: 'ENVIADO' },
  { id: 'CRR5556-CURRENT', type: 'REMISION', startNumber: 15701, endNumber: 15750, currentNumber: 15708, storeId: 'INV CRR 5 5 56', destinationName: 'INV CRR 5 5 56', status: 'ENVIADO' },
  { id: 'CRR76A15-CURRENT', type: 'REMISION', startNumber: 15651, endNumber: 15700, currentNumber: 15656, storeId: 'INV CRR 7 6A 15', destinationName: 'INV CRR 7 6A 15', status: 'ENVIADO' },
  { id: 'MANABLANCA-CURRENT', type: 'REMISION', startNumber: 15751, endNumber: 15800, currentNumber: 15754, storeId: 'INV MANABLANCA', destinationName: 'INV MANABLANCA', status: 'ENVIADO' },
  { id: 'CRR5326-RECEIPT', type: 'RECIBO', startNumber: 5651, endNumber: 5700, currentNumber: 5700, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26', status: 'ENVIADO' },
];

normalizeActiveTalonarios(reportedTalonarios);
const wrongLocalRange = { id: 'WRONG-CARTAGENITA-15801', type: 'REMISION', startNumber: 15801, endNumber: 15850, currentNumber: 15822, consecutiveBaseline: 15801, storeId: 'INV CARTAGENITA', destinationName: 'INV CARTAGENITA', sentFrom: 'INV CRR 5 3 26', sentAt: '2026-10-08T18:32:22Z', status: 'ENVIADO' };
normalizeActiveTalonarios([wrongLocalRange]);
assert.equal(wrongLocalRange.storeId, 'INV CRR 5 3 26');
assert.equal(wrongLocalRange.destinationName, 'INV CRR 5 3 26');
assert.equal(wrongLocalRange.status, 'EN_USO');
assert.equal(currentTalonarioNumber(wrongLocalRange, [
  { invoiceNumber: '15822', documentType: 'REMISION', storeId: 'INV CRR 5 3 17' },
]), 15821);
assert.equal(reportedTalonarios.find((item) => item.id === 'CARTAGENITA-CURRENT')?.status, 'EN_USO');
assert.equal(currentTalonarioNumber(reportedTalonarios.find((item) => item.id === 'CARTAGENITA-CURRENT')), 15496);
assert.equal(reportedTalonarios.find((item) => item.id === 'CARTAGENITA-SENT')?.status, 'ENVIADO');
assert.equal(reportedTalonarios.find((item) => item.id === 'CARTAGENITA-CENTRAL-SOURCE')?.status, 'ENVIADO');
assert.equal(currentTalonarioNumber(reportedTalonarios.find((item) => item.id === 'CARTAGENITA-II-CURRENT')), 15857);
assert.equal(reportedTalonarios.find((item) => item.id === 'CRR5317-CURRENT')?.status, 'TERMINADO');
assert.equal(currentTalonarioNumber(reportedTalonarios.find((item) => item.id === 'CRR5317-CURRENT')), 14100);
assert.equal(currentTalonarioNumber(reportedTalonarios.find((item) => item.id === 'CRR5326-CURRENT')), 15821);
assert.equal(currentTalonarioNumber(reportedTalonarios.find((item) => item.id === 'CRR5556-CURRENT')), 15734);
assert.equal(reportedTalonarios.find((item) => item.id === 'CRR76A15-CURRENT')?.status, 'EN_USO');
assert.equal(currentTalonarioNumber(reportedTalonarios.find((item) => item.id === 'MANABLANCA-CURRENT')), 15791);
assert.equal(reportedTalonarios.find((item) => item.id === 'CRR5326-RECEIPT')?.status, 'EN_USO');

const newerAvailableModalCase = {
  stores: [{ id: 'INV CRR 5 3 26', name: 'INV CRR 5 3 26' }],
  talonarios: [
    { id: 'STALE-OLD', type: 'REMISION', startNumber: 15751, endNumber: 15800, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26', status: 'ALMACENADO' },
    { id: 'MANABLANCA-ASSIGNED', type: 'REMISION', startNumber: 15751, endNumber: 15800, storeId: 'INV MANABLANCA', destinationName: 'INV MANABLANCA', status: 'EN_USO', currentNumber: 15792 },
    { id: 'CENTRAL-IN-USE', type: 'REMISION', startNumber: 15801, endNumber: 15850, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26', status: 'EN_USO', currentNumber: 15821 },
    { id: 'NEXT-FUTURE', type: 'REMISION', startNumber: 15951, endNumber: 16000, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26', status: 'ALMACENADO' },
    { id: 'LATER-RANGE', type: 'REMISION', startNumber: 16801, endNumber: 16850, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26', status: 'ALMACENADO' },
  ],
};
assert.equal(nextAvailableCentralTalonario(newerAvailableModalCase.talonarios, 'REMISION')?.id, 'NEXT-FUTURE');
assert.deepEqual(availableCentralTalonarios(newerAvailableModalCase.talonarios, 'REMISION').map(item => item.id), ['NEXT-FUTURE', 'LATER-RANGE']);
assert.match(
  talonarioModal(newerAvailableModalCase),
  /15951\s*-\s*16000/,
  'the modal should skip stale duplicate and in-use ranges and show the next central range'
);
assert.doesNotMatch(
  talonarioModal(newerAvailableModalCase),
  /name="startNumber" value="15751"/,
  'an already assigned range must not be offered for a new shipment'
);

const reportedReceipts = [
  { id: 'RECEIPT-CARTAGENITA', type: 'RECIBO', startNumber: 5551, endNumber: 5600, storeId: 'INV CARTAGENITA', destinationName: 'INV CARTAGENITA', status: 'ENVIADO' },
  { id: 'RECEIPT-CARTAGENITA-II', type: 'RECIBO', startNumber: 5751, endNumber: 5800, storeId: 'INV CARTAGENITA II', destinationName: 'INV CARTAGENITA II', status: 'ENVIADO' },
  { id: 'RECEIPT-CRR5317', type: 'RECIBO', startNumber: 5101, endNumber: 5150, storeId: 'INV CRR 5 3 17', destinationName: 'INV CRR 5 3 17', status: 'ENVIADO' },
  { id: 'RECEIPT-CRR5556', type: 'RECIBO', startNumber: 5501, endNumber: 5550, storeId: 'INV CRR 5 5 56', destinationName: 'INV CRR 5 5 56', status: 'ENVIADO' },
  { id: 'RECEIPT-MANABLANCA', type: 'RECIBO', startNumber: 5701, endNumber: 5750, storeId: 'INV MANABLANCA', destinationName: 'INV MANABLANCA', status: 'ENVIADO' },
];
normalizeActiveTalonarios(reportedReceipts);
assert.deepEqual(reportedReceipts.map((item) => item.status), ['EN_USO', 'EN_USO', 'EN_USO', 'EN_USO', 'EN_USO']);
assert.deepEqual(
  deduplicateTalonarioHistory([
    { id: 'DUPLICATE-OLD', type: 'REMISION', startNumber: 15801, endNumber: 15850, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26', status: 'ENVIADO', sentAt: '2026-09-17' },
    { id: 'DUPLICATE-NEW', type: 'REMISION', startNumber: 15801, endNumber: 15850, storeId: 'INV CRR 5 3 26', destinationName: 'INV CRR 5 3 26', status: 'EN_USO', sentAt: '2026-10-08' },
  ]).map((item) => item.id),
  ['DUPLICATE-NEW'],
  'the local history should show only the strongest record for a repeated range'
);

console.log('talonarios state regression checks passed');
