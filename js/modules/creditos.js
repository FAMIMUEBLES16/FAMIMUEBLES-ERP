import { money, page, table, badge } from '../components/tables.js';

const creditBalance = item => Math.max(0, Number(item.total || 0) - Number(item.initial || 0) - Number(item.paid || 0));

function normalizeCredit(item, sales = []) {
  const saleId = item.saleId || item.sale_id || item.venta_id || item.sourceId || item.source_id || '';
  const sale = sales.find(candidate => String(candidate.id) === String(saleId));
  const initialValue = Number(item.initial ?? item.downPayment ?? item.cuota_inicial ?? item.cuotaInicial ?? 0);
  const hasExplicitPending = [item.saldo_pendiente, item.saldoPendiente, item.balance, item.pending].some(value => value !== null && value !== undefined && value !== '');
  const pendingValue = hasExplicitPending ? Number(item.saldo_pendiente ?? item.saldoPendiente ?? item.balance ?? item.pending ?? 0) : null;
  const total = Number(item.originalAmount ?? item.total ?? item.valor_total ?? (initialValue + (pendingValue ?? 0)));
  const initial = initialValue;
  const paid = Number(item.paid ?? Math.max(0, total - initial - (pendingValue ?? 0)));
  const pending = pendingValue !== null && Number.isFinite(pendingValue) ? Math.max(0, pendingValue) : Math.max(0, total - initial - paid);
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

export function renderCreditos(data) {
  const credits = (data.credits || []).map(item => normalizeCredit(item, data.sales || []));
  const totalPending = credits.reduce((sum, item) => sum + item.pending, 0);
  const filter=String(data.creditFilter||'all');
  const installments=data.installments||[];
  const today=new Date().toISOString().slice(0,10);
  const installmentFor=credit=>installments.filter(item=>String(item.creditId??item.credito_id??'')===String(credit.id));
  const isPaid=credit=>credit.pending<=0;
  const isOverdue=credit=>installmentFor(credit).some(item=>Number(item.paidAmount??item.valor_pagado??0)<Number(item.amount??item.valor_programado??0)&&String(item.dueDate??item.fecha_vencimiento??'').slice(0,10)<today);
  const matches=credit=>filter==='paid'?isPaid(credit):filter==='overdue'?isOverdue(credit):filter==='pending'&&!isPaid(credit)?true:filter==='all';
  const visibleCredits=credits.filter(matches);
  const filterOptions=`<select class="field" data-credit-filter><option value="all" ${filter==='all'?'selected':''}>Todos</option><option value="overdue" ${filter==='overdue'?'selected':''}>Vencidos</option><option value="pending" ${filter==='pending'?'selected':''}>Con saldo pendiente</option><option value="paid" ${filter==='paid'?'selected':''}>Pagados</option></select>`;
  return page('FINANCIACION', 'Cartera', '', `<div class="toolbar">${filterOptions}</div><div class="metric-grid compact"><div class="metric"><span>Creditos activos</span><strong>${credits.filter(item => item.pending > 0).length}</strong></div><div class="metric"><span>Cartera pendiente</span><strong>${money(totalPending)}</strong></div><div class="metric"><span>Pagado</span><strong>${money(credits.reduce((sum, item) => sum + item.paid, 0))}</strong></div></div>${table(['Credito','Cliente','Venta','Fecha','Valor','Inicial','Pagado','Saldo pendiente','Estado','Acciones'], visibleCredits.map(item => `<tr><td><strong>${item.id}</strong></td><td>${item.customer}</td><td>${item.saleId || '-'}</td><td>${item.date || '-'}</td><td>${money(item.total)}</td><td>${money(item.initial)}</td><td>${money(item.paid)}</td><td><strong>${money(item.pending)}</strong></td><td>${badge(isPaid(item)?'PAGADO':isOverdue(item)?'VENCIDO':item.status)}</td><td><button class="table-action" data-action="view-credit" data-credit-id="${item.id}">Ver</button><button class="table-action" data-action="edit-credit" data-credit-id="${item.id}">Editar</button>${item.pending > 0 ? `<button class="table-action" data-action="credit-payment" data-credit-id="${item.id}">Registrar abono</button>` : ''}</td></tr>`))}`);
}

export { normalizeCredit };
