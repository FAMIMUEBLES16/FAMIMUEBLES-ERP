export const SISTECREDITO_DEFAULT_OPENING_BALANCE = 69010597;
export const SISTECREDITO_DEFAULT_OPENING_DATE = '2026-09-30';
export const SISTECREDITO_COMMISSION_RATE = 0.01;

const firstValue = (record, keys) => keys.map(key => record?.[key]).find(value => value !== undefined && value !== null && value !== '');
const recordDate = record => String(firstValue(record, ['fecha', 'date', 'createdAt', 'created_at']) || '').slice(0, 10);
const recordAmount = record => {
  const amount = Number(firstValue(record, ['valor', 'amount', 'total', 'sistecreditoAmount', 'sistecredito_amount']) || 0);
  return Number.isFinite(amount) ? amount : 0;
};
const normalizedText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function saleSistecreditoAmount(sale, saleAmountById) {
  const method = normalizedText(firstValue(sale, ['paymentMethod', 'metodo_pago', 'forma_pago', 'payment']));
  const linkedAmount = saleAmountById.get(String(sale?.id ?? sale?.saleId ?? sale?.sale_id ?? ''));
  const directAmount = firstValue(sale, ['sistecreditoAmount', 'sistecredito_amount']);
  const breakdown = firstValue(sale, ['paymentBreakdown', 'payment_breakdown', 'payments']);
  let explicitAmount = Number(directAmount ?? linkedAmount ?? 0);
  if ((!Number.isFinite(explicitAmount) || explicitAmount <= 0) && Array.isArray(breakdown)) {
    explicitAmount = breakdown
      .filter(item => normalizedText(firstValue(item, ['method', 'metodo_pago', 'paymentMethod'])).includes('siste'))
      .reduce((sum, item) => sum + Number(firstValue(item, ['amount', 'valor', 'value']) || 0), 0);
  }
  if (Number.isFinite(explicitAmount) && explicitAmount > 0) return explicitAmount;
  const mixed = method.includes('mixt') || method.includes('+') || method.includes('/')
    || ['efectivo', 'transferencia', 'tarjeta'].some(part => method.includes(part));
  if (method.includes('siste') && !mixed) {
    return recordAmount(sale);
  }
  if (method.includes('siste') && mixed) {
    return null;
  }
  return 0;
}

export function calculateSistecreditoLedger({
  sales = [],
  receipts = [],
  adjustments = [],
  saleAmounts = [],
  openingBalance = SISTECREDITO_DEFAULT_OPENING_BALANCE,
  openingDate = SISTECREDITO_DEFAULT_OPENING_DATE,
  commissionRate = SISTECREDITO_COMMISSION_RATE,
} = {}) {
  const openingRecord = adjustments.find(item => item?.type === 'opening_balance');
  const opening = openingRecord ? recordAmount(openingRecord) : Number(openingBalance);
  const cutoff = String(openingRecord?.date || openingRecord?.fecha || openingDate || '').slice(0, 10);
  const saleAmountById = new Map(saleAmounts.map(item => [
    String(item?.saleId ?? item?.sale_id ?? item?.id ?? ''),
    recordAmount(item),
  ]));
  let grossSales = 0;
  let commission = 0;
  let unallocatedMixedSales = 0;

  for (const sale of sales) {
    const date = recordDate(sale);
    const status = normalizedText(firstValue(sale, ['status', 'estado']));
    if (!date || date <= cutoff || ['anulada', 'anulado', 'cancelada', 'cancelado', 'void'].includes(status)) continue;
    const amount = saleSistecreditoAmount(sale, saleAmountById);
    if (amount === null) {
      unallocatedMixedSales += 1;
      continue;
    }
    if (amount <= 0) continue;
    grossSales += amount;
    commission += Math.round(amount * commissionRate);
  }

  const received = receipts
    .filter(item => recordDate(item) > cutoff)
    .reduce((sum, item) => sum + recordAmount(item), 0);
  const deposits = adjustments
    .filter(item => item?.type === 'deposit' && recordDate(item) > cutoff)
    .reduce((sum, item) => sum + recordAmount(item), 0);
  const reconciliations = adjustments.filter(item =>
    item?.type === 'reconciliation'
    && String(item.periodStart || '') > cutoff
    && String(item.periodEnd || '') >= String(item.periodStart || '')
  );
  const sumReconciliation = field => reconciliations.reduce((sum, item) => {
    const amount = Number(item[field] || 0);
    return Number.isSafeInteger(amount) ? sum + amount : sum;
  }, 0);
  const salesAdjustment = sumReconciliation('salesAdjustment');
  const commissionAdjustment = sumReconciliation('commissionAdjustment');
  const receiptsAdjustment = sumReconciliation('receiptsAdjustment');
  const adjustedGrossSales = grossSales + salesAdjustment;
  const adjustedCommission = commission + commissionAdjustment;
  const adjustedReceipts = received + receiptsAdjustment;

  return {
    openingBalance: Number.isFinite(opening) ? opening : 0,
    openingDate: cutoff,
    rawGrossSales: grossSales,
    grossSales: adjustedGrossSales,
    salesAdjustment,
    rawCommission: commission,
    commission: adjustedCommission,
    commissionAdjustment,
    netSales: adjustedGrossSales - adjustedCommission,
    rawReceipts: received,
    receipts: adjustedReceipts,
    receiptsAdjustment,
    deposits,
    reconciliations,
    balance: (Number.isFinite(opening) ? opening : 0) + adjustedGrossSales - adjustedCommission - adjustedReceipts - deposits,
    unallocatedMixedSales,
  };
}
