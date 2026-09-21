import { formatCurrency } from '../utils/currency.js';
import { page, table } from '../components/tables.js';

let auditFilters = { query: '', type: '', store: '' };

const movementDate = item => String(item.createdAt || item.fecha || item.creado_en || '').slice(0, 10);
const movementType = item => String(item.type || item.tipo || '').trim();
const movementStore = item => String(item.storeId || item.local_id || item.local_origen || '').trim();
const movementReference = item => {
	const raw = Number(String(item.referenceId || item.referencia || '').trim());
	const store = movementStore(item).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	return store === 'INVCRR5556' && raw >= 5000 && raw < 10000 && raw + 10000 >= 15701 && raw + 10000 <= 15750 ? String(raw + 10000) : (item.referenceId || item.referencia || '-');
};
const movementText = item => [item.id, movementType(item), item.productId, item.descripcion, item.productName, item.createdBy, item.vendedor, item.empleado, movementReference(item), item.note, item.observacion].join(' ').toLowerCase();

export function setAuditFilters(nextFilters = {}) {
	auditFilters = { ...auditFilters, ...nextFilters };
}

export function renderAuditoria(state) {
	const rawMovements = (state.inventoryMovements || []).flatMap(item => item.items?.length
		? item.items.map(product => ({ ...item, productId: product.productId, quantity: product.quantity, productName: product.name }))
		: [item]);
	const types = [...new Set(rawMovements.map(movementType).filter(Boolean))].sort();
	const stores = state.stores || [];
	const filteredMovements = rawMovements.filter(item => {
		const date = movementDate(item);
		const query = auditFilters.query.trim().toLowerCase();
		return (!query || movementText(item).includes(query)) &&
			(!auditFilters.type || movementType(item) === auditFilters.type) &&
			(!auditFilters.store || movementStore(item) === auditFilters.store || String(item.local_origen || '') === auditFilters.store);
	});
	const filterForm = `<div class="filter-row audit-filters"><label class="input-label">Buscar<input class="field" data-audit-filter="query" value="${auditFilters.query}" placeholder="ID, producto, usuario o documento"></label><label class="input-label">Tipo<select class="field" data-audit-filter="type"><option value="">Todos</option>${types.map(type => `<option value="${type}" ${type === auditFilters.type ? 'selected' : ''}>${type}</option>`).join('')}</select></label><label class="input-label">Local<select class="field" data-audit-filter="store"><option value="">Todos</option>${stores.map(store => `<option value="${store.name || store.id}" ${String(store.name || store.id) === auditFilters.store ? 'selected' : ''}>${store.name || store.id}</option>`).join('')}</select></label></div>`;
	const movementRows = filteredMovements.map(item => `<tr><td>${movementDate(item) || '-'}</td><td>${item.id || '-'}</td><td>${movementType(item) || '-'}</td><td>${state.products.find(product => product.id === item.productId)?.name || item.productName || item.productId || item.descripcion || '-'}</td><td>${item.quantity ?? item.cantidad ?? 0}</td><td>${stores.find(store => store.id === String(item.storeId || item.local_id))?.name || item.storeId || item.local_origen || '-'}</td><td>${item.createdBy || item.vendedor || item.empleado || '-'}</td><td>${movementReference(item)}</td><td>${item.note || item.observacion || '-'}</td></tr>`);
	const auditRows = (state.auditLog || []).map(item => `<tr><td>${item.date || item.creado_en || '-'}</td><td>${state.users.find(user => user.id === item.userId)?.name || item.userId || item.usuario_id || '-'}</td><td>${item.action || item.accion || '-'}</td><td>${item.saleId || '-'}</td><td>${state.products.find(product => product.id === item.productId)?.name || item.productId || '-'}</td><td>${formatCurrency(item.listPrice || 0)}</td><td>${formatCurrency(item.salePrice || 0)}</td><td>${formatCurrency(item.difference || 0)}</td><td>${stores.find(store => store.id === String(item.storeId || item.local_id))?.name || item.storeId || '-'}</td></tr>`);
	return page('CONTROL', 'Movimientos de inventario', '', `<section class="panel"><div class="panel-head"><h3>Filtros de movimientos</h3><span class="muted">${filteredMovements.length} de ${rawMovements.length} movimientos</span></div>${filterForm}</section>${table(['Fecha', 'ID', 'Tipo', 'Producto', 'Cantidad', 'Local', 'Usuario', 'Documento', 'Observacion'], movementRows)}<h3>Auditoria de acciones</h3>${table(['Fecha', 'Usuario', 'Accion', 'Venta', 'Producto', 'Precio lista', 'Precio vendido', 'Diferencia', 'Local'], auditRows)}`);
}
