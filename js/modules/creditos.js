import { money, page, table, badge } from '../components/tables.js';

const creditBalance = item => Math.max(0, Number(item.total || 0) - Number(item.initial || 0) - Number(item.paid || 0));

export function creditPendingBalance(item) {
  const explicitPending = [item.saldo_pendiente, item.saldoPendiente, item.balance, item.pending]
    .find(value => value !== null && value !== undefined && value !== '');
  if (explicitPending !== undefined) {
    const pending = Number(explicitPending);
    if (Number.isFinite(pending)) return Math.max(0, pending);
  }

  const total = Number(item.originalAmount ?? item.total ?? item.valor_total ?? 0);
  const initial = Number(item.abono_inicial ?? item.abonoInicial ?? item.cuota_inicial ?? item.cuotaInicial ?? item.downPayment ?? item.initial ?? 0);
  const paid = Number(item.paid ?? item.valor_pagado ?? item.pagado ?? 0);
  return Math.max(0, total - initial - paid);
}

export function filterDuplicateHistoricalCredits(credits = []) {
  const linkedHistoryIds = new Set(credits.flatMap(credit => {
    const historicalId = [credit.factura, credit.invoice_number, credit.invoiceNumber]
      .map(value => String(value || ''))
      .find(value => value.startsWith('HIST-CR-'));
    return historicalId ? [historicalId] : [];
  }));
  return credits.filter(credit => !(
    String(credit.id || '').startsWith('HIST-CR-') && linkedHistoryIds.has(String(credit.id))
  ));
}

function linkedHistoricalCredit(credit, allCredits) {
  const historicalId = [credit.factura, credit.invoice_number, credit.invoiceNumber]
    .map(value => String(value || ''))
    .find(value => value.startsWith('HIST-CR-'));
  if (!historicalId) return null;
  const history = allCredits.find(item => String(item.id) === historicalId);
  if (!history) return null;
  const currentName = String(credit.customer || credit.cliente || '').trim().toLocaleLowerCase();
  const historyName = String(history.customer || history.cliente || '').trim().toLocaleLowerCase();
  return currentName && historyName && currentName !== historyName ? null : history;
}

export function paymentsForCredit(credit, payments = []) {
  return payments.filter(payment => {
    const paymentCreditId = payment.creditId ?? payment.credit_id ?? payment.credito_id ?? payment.creditoId;
    const type = String(payment.paymentType ?? payment.tipoAbono ?? payment.tipo_abono ?? '').trim().toUpperCase();
    return String(paymentCreditId ?? '') === String(credit.id ?? credit.credito_id ?? '') &&
      (!type || type === 'CREDITO' || type === 'CREDIT');
  });
}

function paidFromPayments(credit, payments, initial) {
  const totalPaid = payments.reduce((sum, payment) => sum + Math.max(0, Number(
    payment.amount ?? payment.valor_abono ?? payment.valorAbono ?? 0,
  )), 0);
  if (initial <= 0 || !payments.length) return totalPaid;

  const creditDate = String(credit.date ?? credit.createdAt ?? credit.creado_en ?? credit.fecha ?? '').slice(0, 10);
  const sameDayPayments = creditDate
    ? payments.filter(payment => String(payment.date ?? payment.fecha ?? '').slice(0, 10) === creditDate)
    : [];
  const sameDayInitial = sameDayPayments.reduce((sum, payment) => sum + Math.max(0, Number(
    payment.amount ?? payment.valor_abono ?? payment.valorAbono ?? 0,
  )), 0);
  if (sameDayInitial === initial) return Math.max(0, totalPaid - sameDayInitial);

  const markedInitialPayments = payments.filter(payment => {
    const description = String(payment.observation ?? payment.observacion ?? '').toLowerCase();
    const method = String(payment.method ?? payment.metodo_pago ?? '').toLowerCase();
    const amount = Number(payment.amount ?? payment.valor_abono ?? payment.valorAbono ?? 0);
    return amount > 0 && /(abono|cuota|pago)\s+inicial|inicial\s+(?:del\s+)?credito/.test(`${description} ${method}`);
  });
  const markedInitialTotal = markedInitialPayments.reduce((sum, payment) => sum + Number(
    payment.amount ?? payment.valor_abono ?? payment.valorAbono ?? 0,
  ), 0);
  if (markedInitialTotal === initial) return Math.max(0, totalPaid - markedInitialTotal);

  const initialPayment = markedInitialPayments.find(payment => Number(
    payment.amount ?? payment.valor_abono ?? payment.valorAbono ?? 0,
  ) === initial) || sameDayPayments.find(payment => Number(
    payment.amount ?? payment.valor_abono ?? payment.valorAbono ?? 0,
  ) === initial);
  return Math.max(0, totalPaid - (initialPayment ? Number(
    initialPayment.amount ?? initialPayment.valor_abono ?? initialPayment.valorAbono ?? 0,
  ) : 0));
}

function normalizeCredit(item, sales = [], allPayments = [], allCredits = []) {
  const historicalCredit = linkedHistoricalCredit(item, allCredits);
  const saleId = item.saleId || item.sale_id || item.venta_id || item.sourceId || item.source_id || '';
  const sale = sales.find(candidate => String(candidate.id) === String(saleId));
  const initialValue = Number(historicalCredit?.downPayment ?? historicalCredit?.initial ?? historicalCredit?.abono_inicial ?? historicalCredit?.cuota_inicial ?? item.abono_inicial ?? item.abonoInicial ?? item.cuota_inicial ?? item.cuotaInicial ?? item.downPayment ?? item.initial ?? 0);
  const hasExplicitPending = [item.saldo_pendiente, item.saldoPendiente, item.balance, item.pending].some(value => value !== null && value !== undefined && value !== '');
  const pendingValue = hasExplicitPending ? Number(item.saldo_pendiente ?? item.saldoPendiente ?? item.balance ?? item.pending ?? 0) : null;
  const initial = initialValue;
  const reportedTotal = Number(historicalCredit?.originalAmount ?? historicalCredit?.total ?? item.originalAmount ?? item.total ?? item.valor_total ?? (initial + (pendingValue ?? 0)));
  const payments = paymentsForCredit(item, allPayments);
  const hasPaymentHistory = payments.length > 0;
  const calculatedPaid = hasPaymentHistory
    ? paidFromPayments(item, payments, initial)
    : Math.max(0, Number(item.total ?? item.valor_total ?? 0) - initial - (pendingValue ?? 0));
  const totalsReconcile = !hasPaymentHistory && hasExplicitPending && Number.isFinite(reportedTotal) && reportedTotal >= initial + pendingValue;
  const paid = totalsReconcile
    ? Math.max(0, reportedTotal - initial - pendingValue)
    : Number(hasPaymentHistory ? calculatedPaid : item.paid ?? calculatedPaid);
  const pending = pendingValue !== null && Number.isFinite(pendingValue)
    ? Math.max(0, pendingValue)
    : Math.max(0, Number(item.total ?? item.valor_total ?? 0) - initial - paid);
  const total = hasPaymentHistory && item.originalAmount === undefined && !historicalCredit
    ? initial + paid + pending
    : reportedTotal;
  return {
    ...item,
    id: String(item.id || item.credito_id || 'SIN-ID'),
    saleId: String(saleId),
    customer: item.customer || item.cliente || item.cliente_nombre || sale?.customer || sale?.cliente || 'Cliente sin nombre',
    date: item.date || item.createdAt || item.creado_en || item.fecha || sale?.date || '',
    total, initial, paid, pending,
    status: String(item.status || item.estado || 'Al dia'),
    next: item.next || item.proxima_cuota || 'Pendiente',
  };
}

function normalizeSearch(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim();
}

function escapeAttribute(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function creditIsOverdue(credit, installments, today) {
  if (credit.pending <= 0) return false;
  const status = normalizeSearch(credit.status);
  if (status.includes('venc') || status.includes('mora')) return true;
  return installments.some(item => {
    if (String(item.creditId ?? item.credit_id ?? item.credito_id ?? '') !== String(credit.id)) return false;
    const dueDate = String(item.dueDate ?? item.fecha_vencimiento ?? '').slice(0, 10);
    const amount = Number(item.amount ?? item.valor_programado ?? 0);
    const paid = Number(item.paidAmount ?? item.valor_pagado ?? 0);
    return dueDate && dueDate < today && paid < amount;
  });
}

function renderPagination(kind, currentPage, pageSize, totalItems) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  return `<nav class="list-pagination" aria-label="Paginación de ${kind}"><span class="muted">Mostrando ${firstItem}-${lastItem} de ${totalItems}</span><label class="input-label">Por página<select class="field" data-${kind}-page-size><option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option><option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option><option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option></select></label><div class="list-pagination-controls"><button class="outline" type="button" data-action="${kind}-page" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Página anterior">Anterior</button><span>Página ${currentPage} de ${pageCount}</span><button class="outline" type="button" data-action="${kind}-page" data-page="${currentPage + 1}" ${currentPage >= pageCount ? 'disabled' : ''} aria-label="Página siguiente">Siguiente</button></div></nav>`;
}

export function renderCreditos(data) {
  const sourceCredits = data.credits || [];
  const credits = filterDuplicateHistoricalCredits(sourceCredits)
    .map(item => normalizeCredit(item, data.sales || [], data.payments || [], sourceCredits));
  const totalPending = credits.reduce((sum, item) => sum + item.pending, 0);
  const filter = String(data.creditFilter || 'all');
  const query = normalizeSearch(data.creditQuery);
  const pageSize = [10, 20, 50].includes(Number(data.creditPageSize)) ? Number(data.creditPageSize) : 20;
  const today=new Date().toISOString().slice(0,10);
  const isPaid = credit => credit.pending <= 0;
  const isOverdue = credit => creditIsOverdue(credit, data.installments || [], today);
  const matchesStatus = credit => filter === 'paid' ? isPaid(credit)
    : filter === 'overdue' ? isOverdue(credit)
      : filter === 'pending' ? !isPaid(credit) : true;
  const matchesQuery = credit => {
    if (!query) return true;
    const searchable = normalizeSearch([
      credit.id, credit.customer, credit.invoiceNumber, credit.invoice_number, credit.factura,
      credit.saleId, credit.sale_id, credit.numero_factura,
    ].join(' '));
    return query.split(/\s+/).every(term => searchable.includes(term));
  };
  const filteredCredits = credits.filter(credit => matchesStatus(credit) && matchesQuery(credit));
  const pageCount = Math.max(1, Math.ceil(filteredCredits.length / pageSize));
  const currentPage = Math.min(pageCount, Math.max(1, Math.trunc(Number(data.creditPage) || 1)));
  const visibleCredits = filteredCredits.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filterOptions = `<label class="input-label">Estado del crédito<select class="field" data-credit-filter><option value="all" ${filter === 'all' ? 'selected' : ''}>Todos</option><option value="pending" ${filter === 'pending' ? 'selected' : ''}>Pendientes</option><option value="paid" ${filter === 'paid' ? 'selected' : ''}>Pagados</option><option value="overdue" ${filter === 'overdue' ? 'selected' : ''}>En mora</option></select></label>`;
  const search = `<label class="input-label">Buscar crédito<input class="field" type="search" data-credit-search value="${escapeAttribute(data.creditQuery || '')}" placeholder="Nombre, ID o factura" autocomplete="off"></label>`;
  const rows = visibleCredits.map(item => `<tr><td><strong>${item.id}</strong></td><td>${item.customer}</td><td>${item.saleId || '-'}</td><td>${item.date || '-'}</td><td>${money(item.total)}</td><td>${money(item.initial)}</td><td>${money(item.paid)}</td><td><strong>${money(item.pending)}</strong></td><td>${badge(isPaid(item) ? 'PAGADO' : isOverdue(item) ? 'EN MORA' : item.status)}</td><td><button class="table-action" data-action="view-credit" data-credit-id="${item.id}">Ver</button></td><td><button class="table-action" data-action="edit-credit" data-credit-id="${item.id}">Editar</button></td><td>${item.pending > 0 ? `<button class="table-action" data-action="credit-payment" data-credit-id="${item.id}">Registrar abono</button>` : '<span class="muted">—</span>'}</td></tr>`);
  const list = rows.length
    ? table(['Credito','Cliente','Venta','Fecha','Valor','Inicial','Pagado','Saldo pendiente','Estado','Consulta','Administrar','Registrar abono'], rows)
    : '<p class="muted">No hay créditos que coincidan con la búsqueda y los filtros.</p>';
  const summary = `<div class="metric-grid compact"><div class="metric"><span>Créditos activos</span><strong>${credits.filter(item => item.pending > 0).length}</strong></div><div class="metric"><span>Cartera pendiente</span><strong>${money(totalPending)}</strong></div><div class="metric"><span>Pagado</span><strong>${money(credits.reduce((sum, item) => sum + item.paid, 0))}</strong></div></div>`;
  return page('FINANCIACION', 'Cartera', '', `${summary}<div class="toolbar finance-list-filters">${search}${filterOptions}</div>${list}${renderPagination('credit', currentPage, pageSize, filteredCredits.length)}`);
}

export { normalizeCredit };
