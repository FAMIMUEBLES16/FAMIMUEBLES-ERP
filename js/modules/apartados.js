import { money, page, table, badge } from '../components/tables.js';

const balance = item => {
  const explicit = item.saldoPendiente ?? item.saldo_pendiente;
  if (explicit !== undefined && explicit !== null && explicit !== '') return Math.max(0, Number(explicit) || 0);
  const total = Number(item.total ?? item.valor_total ?? item.total_apartado ?? 0);
  const initial = Number(item.initial ?? item.abono_inicial ?? 0);
  const paid = Number(item.paid ?? item.valor_pagado ?? 0);
  return Math.max(0, total - initial - paid);
};

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

function apartadoIsOverdue(item, pending, today) {
  if (pending <= 0) return false;
  const status = normalizeSearch(item.status ?? item.estado);
  if (status.includes('venc') || status.includes('mora')) return true;
  const dueDate = String(
    item.dueDate ?? item.fecha_vencimiento ?? item.fechaVencimiento
      ?? item.proxima_cuota ?? item.proximaCuota ?? '',
  ).slice(0, 10);
  return Boolean(dueDate && dueDate < today);
}

function renderPagination(currentPage, pageSize, totalItems) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems ? (currentPage - 1) * pageSize + 1 : 0;
  const lastItem = Math.min(currentPage * pageSize, totalItems);
  return `<nav class="list-pagination" aria-label="Paginación de apartados"><span class="muted">Mostrando ${firstItem}-${lastItem} de ${totalItems}</span><label class="input-label">Por página<select class="field" data-apartado-page-size><option value="10" ${pageSize === 10 ? 'selected' : ''}>10</option><option value="20" ${pageSize === 20 ? 'selected' : ''}>20</option><option value="50" ${pageSize === 50 ? 'selected' : ''}>50</option></select></label><div class="list-pagination-controls"><button class="outline" type="button" data-action="apartado-page" data-page="${currentPage - 1}" ${currentPage <= 1 ? 'disabled' : ''} aria-label="Página anterior">Anterior</button><span>Página ${currentPage} de ${pageCount}</span><button class="outline" type="button" data-action="apartado-page" data-page="${currentPage + 1}" ${currentPage >= pageCount ? 'disabled' : ''} aria-label="Página siguiente">Siguiente</button></div></nav>`;
}

export function renderApartados(data) {
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  const apartados = (data.apartados || []).map(item => {
    const initial = Number(item.initial ?? item.abono_inicial ?? item.abonoInicial ?? 0);
    const total = Number(item.total ?? item.valor_total ?? item.total_apartado ?? 0);
    const paidTotal = Number(item.valor_pagado ?? item.valorPagado ?? item.paid ?? 0);
    return { ...item, total, initial, paid:Math.max(0, paidTotal - initial), customer:item.customer || item.cliente_nombre || item.cliente || 'Sin cliente', date:item.date || item.fecha || item.creado_en || '', status:item.status || item.estado || 'Activo' };
  });
  const totalPending = apartados.reduce((sum, item) => sum + balance(item), 0);
  const query = normalizeSearch(data.apartadoQuery);
  const filter = String(data.apartadoFilter || 'all');
  const pageSize = [10, 20, 50].includes(Number(data.apartadoPageSize)) ? Number(data.apartadoPageSize) : 20;
  const today = new Date().toISOString().slice(0, 10);
  const filteredApartados = apartados.filter(item => {
    const pending = balance(item);
    const overdue = apartadoIsOverdue(item, pending, today);
    const matchesStatus = filter === 'paid' ? pending <= 0
      : filter === 'overdue' ? overdue
        : filter === 'pending' ? pending > 0 : true;
    const searchable = normalizeSearch([
      item.id, item.customer, item.factura, item.invoiceNumber, item.invoice_number,
      item.numero_recibo, item.numeroRecibo, item.producto, item.productName, item.codigo,
    ].join(' '));
    const matchesQuery = !query || query.split(/\s+/).every(term => searchable.includes(term));
    return matchesStatus && matchesQuery;
  });
  const pageCount = Math.max(1, Math.ceil(filteredApartados.length / pageSize));
  const currentPage = Math.min(pageCount, Math.max(1, Math.trunc(Number(data.apartadoPage) || 1)));
  const visibleApartados = filteredApartados.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const filterOptions = `<label class="input-label">Estado del apartado<select class="field" data-apartado-filter><option value="all" ${filter === 'all' ? 'selected' : ''}>Todos</option><option value="pending" ${filter === 'pending' ? 'selected' : ''}>Pendientes</option><option value="paid" ${filter === 'paid' ? 'selected' : ''}>Pagados</option><option value="overdue" ${filter === 'overdue' ? 'selected' : ''}>En mora</option></select></label>`;
  const search = `<label class="input-label">Buscar apartado<input class="field" type="search" data-apartado-search value="${escapeAttribute(data.apartadoQuery || '')}" placeholder="Nombre, ID o factura" autocomplete="off"></label>`;
  const rows = visibleApartados.map(item => {
    const pending = balance(item);
    const overdue = apartadoIsOverdue(item, pending, today);
    return `<tr><td><strong>${item.id}</strong></td><td>${item.customer}</td><td>${item.date}</td><td>${money(item.total)}</td><td>${money(item.initial)}</td><td>${money(item.paid)}</td><td><strong>${money(pending)}</strong></td><td>${badge(overdue ? 'EN MORA' : pending <= 0 ? 'PAGADO' : item.status)}</td><td><button class="table-action" data-action="view-apartado" data-apartado-id="${item.id}">Ver</button></td><td>${isAdmin ? `<button class="table-action" data-action="edit-apartado" data-apartado-id="${item.id}">Editar</button><button class="table-action danger-text" data-action="delete-apartado" data-apartado-id="${item.id}">Eliminar</button>` : '<span class="muted">—</span>'}</td><td>${pending > 0 ? `<button class="table-action" data-action="apartado-payment" data-apartado-id="${item.id}">Registrar abono</button>` : '<span class="muted">—</span>'}</td></tr>`;
  });
  const list = rows.length
    ? table(['Apartado','Cliente','Fecha','Total','Inicial','Abonado','Pendiente','Estado','Consulta','Administrar','Registrar abono'], rows)
    : '<p class="muted">No hay apartados que coincidan con la búsqueda y los filtros.</p>';
  const summary = `<div class="metric-grid compact"><div class="metric"><span>Apartados activos</span><strong>${apartados.filter(item => balance(item) > 0).length}</strong></div><div class="metric"><span>Total pendiente</span><strong>${money(totalPending)}</strong></div><div class="metric"><span>Pagados</span><strong>${apartados.filter(item => balance(item) <= 0).length}</strong></div></div>`;
  return page('CARTERA','Apartados','',`${summary}<div class="toolbar finance-list-filters">${search}${filterOptions}</div>${list}${renderPagination(currentPage, pageSize, filteredApartados.length)}`);
}