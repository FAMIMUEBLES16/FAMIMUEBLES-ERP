import { money, page, table, badge } from '../components/tables.js';

const creditBalance = item => Math.max(0, Number(item.total || 0) - Number(item.initial || 0) - Number(item.paid || 0));

function normalizeCredit(item, sales = []) {
  const saleId = item.saleId || item.sale_id || item.venta_id || item.sourceId || item.source_id || '';
  const sale = sales.find(candidate => String(candidate.id) === String(saleId));
  const initialValue = Number(item.initial ?? item.downPayment ?? item.cuota_inicial ?? item.cuotaInicial ?? 0);
  const pendingValue = Number(item.saldo_pendiente ?? item.saldoPendiente ?? item.balance ?? 0);
  const total = Number(item.originalAmount ?? item.total ?? item.valor_total ?? (initialValue + pendingValue));
  const initial = initialValue;
  const pending = pendingValue || Math.max(0, total - initial - Number(item.paid || 0));
  const paid = Number(item.paid ?? Math.max(0, total - initial - pending));
  return {
    ...item,
    id: String(item.id || item.credito_id || 'SIN-ID'),
    saleId: String(saleId),
    customer: item.customer || item.cliente || item.cliente_nombre || sale?.customer || sale?.cliente || 'Cliente sin nombre',
    date: item.date || item.createdAt || item.creado_en || item.fecha || sale?.date || '',
    total, initial, paid, pending: creditBalance({ total, initial, paid }),
    status: String(item.status || item.estado || 'Al dia'),
    next: item.next || item.proxima_cuota || 'Pendiente',
  };
}

export function renderCreditos(data) {
  const credits = (data.credits || []).map(item => normalizeCredit(item, data.sales || []));
  const totalPending = credits.reduce((sum, item) => sum + item.pending, 0);
  return page('FINANCIACION', 'Cartera', '', `<div class="metric-grid compact"><div class="metric"><span>Creditos activos</span><strong>${credits.filter(item => item.pending > 0).length}</strong></div><div class="metric"><span>Cartera pendiente</span><strong>${money(totalPending)}</strong></div><div class="metric"><span>Pagado</span><strong>${money(credits.reduce((sum, item) => sum + item.paid, 0))}</strong></div></div>${table(['Credito','Cliente','Venta','Fecha','Valor','Inicial','Pagado','Saldo pendiente','Estado','Acciones'], credits.map(item => `<tr><td><strong>${item.id}</strong></td><td>${item.customer}</td><td>${item.saleId || '-'}</td><td>${item.date || '-'}</td><td>${money(item.total)}</td><td>${money(item.initial)}</td><td>${money(item.paid)}</td><td><strong>${money(item.pending)}</strong></td><td>${badge(item.status)}</td><td><button class="table-action" data-action="credit-detail" data-credit-id="${item.id}">Ver</button>${item.pending > 0 ? `<button class="table-action" data-action="credit-payment" data-credit-id="${item.id}">Registrar abono</button>` : ''}</td></tr>`))}`);
}

export { normalizeCredit };
