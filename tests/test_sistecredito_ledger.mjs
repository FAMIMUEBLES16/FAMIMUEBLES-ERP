import assert from 'node:assert/strict';
import { calculateSistecreditoLedger } from '../js/modules/sistecredito-ledger.js';
import { renderParidad, sistecreditoDepositModal } from '../js/modules/paridad.js';
import { renderFacturacion } from '../js/modules/facturacion.js';

const ledger = calculateSistecreditoLedger({
  sales: [
    { id: 'sale-old', date: '2026-09-30', total: 200000, paymentMethod: 'Sistecrédito' },
    { id: 'sale-credit', date: '2026-10-04', total: 16884000, paymentMethod: 'Sistecrédito' },
    { id: 'sale-mixed', date: '2026-10-05', total: 250000, paymentMethod: 'Mixto (Sistecrédito + Efectivo)' },
    { id: 'sale-cash', date: '2026-10-06', total: 100000, paymentMethod: 'Efectivo' },
  ],
  receipts: [
    { fecha: '2026-09-29', valor: 500000 },
    { fecha: '2026-10-08', valor: 3727268 },
  ],
  adjustments: [
    { id: 'opening', type: 'opening_balance', date: '2026-09-30', amount: 69010597 },
    { id: 'deposit-1', type: 'deposit', date: '2026-10-10', amount: 5000000 },
  ],
  saleAmounts: [{ id: 'sale-mixed', saleId: 'sale-mixed', amount: 100000 }],
});

assert.equal(ledger.openingBalance, 69010597);
assert.equal(ledger.grossSales, 16984000);
assert.equal(ledger.commission, 169840);
assert.equal(ledger.receipts, 3727268);
assert.equal(ledger.deposits, 5000000);
assert.equal(ledger.balance, 77097489);
assert.equal(ledger.unallocatedMixedSales, 0);

const unallocatedMixedLedger = calculateSistecreditoLedger({
  sales: [{ id: 'unknown', date: '2026-10-01', total: 80000, paymentMethod: 'Mixto Sistecrédito/Efectivo' }],
  receipts: [],
  adjustments: [],
  saleAmounts: [],
});

assert.equal(unallocatedMixedLedger.grossSales, 0, 'unknown mixed amounts must not be counted as the full sale');
assert.equal(unallocatedMixedLedger.unallocatedMixedSales, 1);

const reconciledLedger = calculateSistecreditoLedger({
  sales: [{ id: 'erp-sale', date: '2026-10-02', total: 20620000, paymentMethod: 'Sistecrédito' }],
  receipts: [{ date: '2026-10-02', amount: 3727169 }],
  adjustments: [{
    id: 'credinet-reconciliation',
    type: 'reconciliation',
    date: '2026-10-19',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-19',
    salesAdjustment: -3736000,
    commissionAdjustment: -37360,
    receiptsAdjustment: 99,
    sourceSalesCount: 22,
    sourceSalesTotal: 16884000,
    sourceReceiptsCount: 23,
    sourceReceiptsTotal: 3727268,
  }],
});
assert.equal(reconciledLedger.rawGrossSales, 20620000);
assert.equal(reconciledLedger.grossSales, 16884000);
assert.equal(reconciledLedger.commission, 168840);
assert.equal(reconciledLedger.rawReceipts, 3727169);
assert.equal(reconciledLedger.receipts, 3727268);
assert.equal(reconciledLedger.balance, 81998489);
const reconciledView = renderParidad({
  sales: [{ id: 'erp-sale', date: '2026-10-02', total: 20620000, paymentMethod: 'Sistecrédito' }],
  sistecredito: [{ date: '2026-10-02', amount: 3727169 }],
  sistecreditoAdjustments: [{
    id: 'credinet-reconciliation',
    type: 'reconciliation',
    date: '2026-10-19',
    periodStart: '2026-10-01',
    periodEnd: '2026-10-19',
    source: 'Credinet · Transacciones',
    salesAdjustment: -3736000,
    commissionAdjustment: -37360,
    receiptsAdjustment: 99,
    sourceSalesCount: 22,
    sourceSalesTotal: 16884000,
    sourceReceiptsCount: 23,
    sourceReceiptsTotal: 3727268,
  }],
  sistecreditoSaleAmounts: [],
  sistecreditoLedgerEnabled: true,
});
assert.match(reconciledView, /Ventas conciliadas con Credinet/);
assert.match(reconciledView, /16\.884\.000/);
assert.match(reconciledView, /3\.727\.268/);
assert.match(reconciledView, /Conciliación con Credinet/);
assert.match(reconciledView, /2026-10-01 a 2026-10-19/);

const rendered = renderParidad({
  sales: [],
  sistecredito: [],
  sistecreditoAdjustments: [],
  sistecreditoSaleAmounts: [],
});
assert.match(rendered, /Sistecrédito nos debe/);
assert.match(rendered, /69\.010\.597/);
assert.match(rendered, /Registrar consignación/);
assert.match(rendered, /data-action="sistecredito-deposit" disabled/);
assert.match(rendered, /por seguridad, el registro de consignaciones y pagos mixtos está deshabilitado/);
assert.match(rendered, /Consignaciones registradas por mes/);
assert.match(sistecreditoDepositModal(), /name="salesPeriod"/);
assert.doesNotMatch(renderFacturacion({ stores: [] }, [], 'Efectivo', '').toString(), />Mixto<\/button>/);
assert.match(renderFacturacion({ stores: [] }, [], 'Mixto', '', 0, '', '', '', 0, 'Efectivo', true), />Mixto<\/button>/);
