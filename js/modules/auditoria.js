import { formatCurrency } from '../utils/currency.js';
import { page, table } from '../components/tables.js';

const filterDefaults = {
	movements: { query: '', type: '', store: '', from: '', to: '' },
	sistecredito: { query: '', store: '', method: '', from: '', to: '', min: '', max: '' },
	payments: { query: '', kind: '', store: '', method: '', from: '', to: '', min: '', max: '' },
	actions: { query: '', source: '', action: '', from: '', to: '' },
	edits: { query: '', type: '', field: '', store: '', from: '', to: '' },
};
let auditFilters = Object.fromEntries(Object.entries(filterDefaults).map(([section, filters]) => [section, { ...filters }]));

const movementDate = item => String(item.createdAt || item.fecha || item.creado_en || '').slice(0, 10);
const movementType = item => String(item.type || item.tipo || '').trim();
const movementStore = item => String(item.storeId || item.local_id || item.local_origen || '').trim();
const escapeHtml = value => String(value ?? '-').replace(/[&<>"']/g, character => ({
	'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const normalized = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const movementReference = item => {
	const raw = Number(String(item.referenceId || item.referencia || '').trim());
	const store = movementStore(item).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
	return store === 'INVCRR5556' && raw >= 5000 && raw < 10000 && raw + 10000 >= 15701 && raw + 10000 <= 15750 ? String(raw + 10000) : (item.referenceId || item.referencia || '-');
};
const itemDate = item => String(item.date || item.fecha || item.createdAt || item.creado_en || '').slice(0, 10);
const storeNameIndexes = new WeakMap();
const itemStore = (stores, value) => {
	let index = storeNameIndexes.get(stores);
	if (!index) {
		index = new Map();
		stores.forEach(store => {
			if (!index.has(String(store.id))) index.set(String(store.id), store.name);
			if (!index.has(String(store.name))) index.set(String(store.name), store.name);
		});
		storeNameIndexes.set(stores, index);
	}
	return index.get(String(value)) || value || '-';
};
const valueOf = (item, ...keys) => keys.map(key => item[key]).find(value => value !== null && value !== undefined && value !== '') ?? '';
const contains = (value, query) => !query || normalized(value).includes(normalized(query));
const dateMatches = (item, filters) => {
	const date = itemDate(item);
	return (!filters.from || (date && date >= filters.from)) && (!filters.to || (date && date <= filters.to));
};
const rangeMatches = (value, filters) => {
	const amount = Number(value || 0);
	return (!filters.min || amount >= Number(filters.min)) && (!filters.max || amount <= Number(filters.max));
};
const matchesStore = (item, stores, filter, ...keys) => {
	if (!filter) return true;
	const value = valueOf(item, ...keys);
	return String(value) === filter || itemStore(stores, value) === filter;
};

function uniqueOptions(items, getter) {
	return [...new Set(items.map(getter).map(value => String(value || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
}

function selectControl(section, key, label, value, options, allLabel = 'Todos') {
	return `<label class="input-label">${label}<select class="field" data-audit-filter="${section}.${key}"><option value="">${allLabel}</option>${options.map(option => `<option value="${escapeHtml(option)}" ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}</select></label>`;
}

function textControl(section, key, label, value, placeholder) {
	return `<label class="input-label">${label}<input class="field" data-audit-filter="${section}.${key}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"></label>`;
}

function dateControl(section, key, label, value) {
	return `<label class="input-label">${label}<input class="field" type="date" data-audit-filter="${section}.${key}" value="${escapeHtml(value)}"></label>`;
}

function amountControl(section, key, label, value) {
	return `<label class="input-label">${label}<input class="field" type="number" min="0" step="1" data-audit-filter="${section}.${key}" value="${escapeHtml(value)}" placeholder="$"></label>`;
}

function filtersPanel(title, section, filtered, total, controls) {
	return `<section class="panel"><div class="panel-head"><h3>${title}</h3><span class="muted">${filtered} de ${total} registros</span></div><div class="filter-row audit-filters">${controls}<div class="filter-actions"><button type="button" class="outline" data-audit-reset="${section}">Limpiar filtros</button></div></div></section>`;
}

function dateRangeControls(section, filters) {
	return dateControl(section, 'from', 'Desde', filters.from) + dateControl(section, 'to', 'Hasta', filters.to);
}

export function setAuditFilters(nextFilters = {}) {
	const updates = { ...nextFilters };
	const key = Object.keys(updates)[0] || '';
	const separator = key.indexOf('.');
	if (separator >= 0) {
		const section = key.slice(0, separator);
		const filter = key.slice(separator + 1);
		if (auditFilters[section] && filter in auditFilters[section]) auditFilters[section][filter] = updates[key];
		return;
	}
	auditFilters.movements = { ...auditFilters.movements, ...updates };
}

export function resetAuditFilters(section) {
	if (auditFilters[section]) auditFilters[section] = { ...filterDefaults[section] };
}

export function renderAuditoria(state) {
	const products = state.products || [];
	const productNames = new Map(products.map(product => [String(product.id), product.name]));
	const stores = state.stores || [];
	const users = state.users || [];
	const rawMovements = (state.inventoryMovements || []).flatMap(item => item.items?.length
		? item.items.map(product => ({ ...item, productId: product.productId, quantity: product.quantity, productName: product.name }))
		: [item]);

	const movementFilters = auditFilters.movements;
	const movementTypes = uniqueOptions(rawMovements, movementType);
	const filteredMovements = rawMovements.filter(item =>
		contains([item.id, movementType(item), item.productId, item.descripcion, item.productName, item.createdBy, item.vendedor, item.empleado, movementReference(item), item.note, item.observacion].join(' '), movementFilters.query) &&
		(!movementFilters.type || movementType(item) === movementFilters.type) &&
		matchesStore(item, stores, movementFilters.store, 'storeId', 'local_id', 'local_origen') &&
		dateMatches(item, movementFilters));
	const movementControls = textControl('movements', 'query', 'Buscar', movementFilters.query, 'ID, producto, usuario o documento') +
		selectControl('movements', 'type', 'Tipo', movementFilters.type, movementTypes) +
		selectControl('movements', 'store', 'Local', movementFilters.store, uniqueOptions(stores, store => store.name || store.id)) +
		dateRangeControls('movements', movementFilters);
	const movementRows = filteredMovements.map(item => `<tr><td>${escapeHtml(movementDate(item) || '-')}</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(movementType(item))}</td><td>${escapeHtml(productNames.get(String(item.productId)) || item.productName || item.productId || item.descripcion)}</td><td>${escapeHtml(item.quantity ?? item.cantidad ?? 0)}</td><td>${escapeHtml(itemStore(stores, item.storeId || item.local_id || item.local_origen))}</td><td>${escapeHtml(item.createdBy || item.vendedor || item.empleado)}</td><td>${escapeHtml(movementReference(item))}</td><td>${escapeHtml(item.note || item.observacion)}</td></tr>`);

	const sistecredito = state.sistecredito || [];
	const sisteFilters = auditFilters.sistecredito;
	const sisteMethods = uniqueOptions(sistecredito, item => valueOf(item, 'metodo_pago', 'paymentMethod'));
	const filteredSistecredito = sistecredito.filter(item =>
		contains([item.id, item.vendedor, item.seller, item.local, itemStore(stores, item.storeId), item.metodo_pago, item.paymentMethod].join(' '), sisteFilters.query) &&
		matchesStore(item, stores, sisteFilters.store, 'local', 'storeId') &&
		(!sisteFilters.method || String(valueOf(item, 'metodo_pago', 'paymentMethod')) === sisteFilters.method) &&
		dateMatches(item, sisteFilters) &&
		rangeMatches(valueOf(item, 'valor', 'amount'), sisteFilters));
	const sisteControls = textControl('sistecredito', 'query', 'Buscar', sisteFilters.query, 'ID, vendedor o local') +
		selectControl('sistecredito', 'store', 'Local', sisteFilters.store, uniqueOptions(stores, store => store.name || store.id)) +
		selectControl('sistecredito', 'method', 'Método', sisteFilters.method, sisteMethods) +
		dateRangeControls('sistecredito', sisteFilters) +
		amountControl('sistecredito', 'min', 'Valor mínimo', sisteFilters.min) +
		amountControl('sistecredito', 'max', 'Valor máximo', sisteFilters.max);
	const sistecreditoRows = filteredSistecredito.map(item => `<tr><td>${escapeHtml(itemDate(item) || '-')}</td><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.vendedor || item.seller)}</td><td>${escapeHtml(itemStore(stores, item.local || item.storeId))}</td><td>${formatCurrency(item.valor ?? item.amount ?? 0)}</td><td>${escapeHtml(item.metodo_pago || item.paymentMethod)}</td></tr>`);

	const payments = state.payments || [];
	const paymentFilters = auditFilters.payments;
	const paymentMethods = uniqueOptions(payments, item => valueOf(item, 'metodo_pago', 'method'));
	const filteredPayments = payments.filter(item => {
		const kind = String(valueOf(item, 'tipo_abono', 'paymentType')).toUpperCase() || 'CREDITO';
		const reference = kind === 'APARTADO' ? valueOf(item, 'apartado_id', 'apartadoId') : valueOf(item, 'credito_id', 'creditId');
		return contains([item.id, `${kind} ${reference}`, item.numero_recibo, item.receiptNumber, item.usuario, item.user, item.vendedor, item.observacion].join(' '), paymentFilters.query) &&
			(!paymentFilters.kind || kind === paymentFilters.kind) &&
			matchesStore(item, stores, paymentFilters.store, 'local', 'storeId') &&
			(!paymentFilters.method || String(valueOf(item, 'metodo_pago', 'method')) === paymentFilters.method) &&
			dateMatches(item, paymentFilters) &&
			rangeMatches(valueOf(item, 'valor_abono', 'amount'), paymentFilters);
	});
	const paymentControls = textControl('payments', 'query', 'Buscar', paymentFilters.query, 'Recibo, cuenta o persona') +
		selectControl('payments', 'kind', 'Tipo de cuenta', paymentFilters.kind, ['CREDITO', 'APARTADO']) +
		selectControl('payments', 'store', 'Local', paymentFilters.store, uniqueOptions(stores, store => store.name || store.id)) +
		selectControl('payments', 'method', 'Método', paymentFilters.method, paymentMethods) +
		dateRangeControls('payments', paymentFilters) +
		amountControl('payments', 'min', 'Abono mínimo', paymentFilters.min) +
		amountControl('payments', 'max', 'Abono máximo', paymentFilters.max);
	const paymentRows = filteredPayments.map(item => {
		const kind = String(valueOf(item, 'tipo_abono', 'paymentType')).toUpperCase() || 'CREDITO';
		const reference = kind === 'APARTADO' ? valueOf(item, 'apartado_id', 'apartadoId') : valueOf(item, 'credito_id', 'creditId');
		const label = kind === 'APARTADO' ? 'Apartado' : 'Crédito';
		return `<tr><td>${escapeHtml(itemDate(item) || '-')}</td><td>${escapeHtml(`${label} ${reference || '-'}`)}</td><td>${escapeHtml(item.numero_recibo || item.receiptNumber)}</td><td>${formatCurrency(item.valor_abono ?? item.amount ?? 0)}</td><td>${escapeHtml(item.metodo_pago || item.method)}</td><td>${formatCurrency(item.saldo_anterior ?? item.previousBalance ?? 0)}</td><td>${formatCurrency(item.saldo_nuevo ?? item.newBalance ?? 0)}</td><td>${escapeHtml(item.usuario || item.user || item.vendedor)}</td><td>${escapeHtml(itemStore(stores, item.local || item.storeId))}</td></tr>`;
	});

	const auditLog = state.auditLog || [];
	const auditFiltersForLog = auditFilters.actions;
	const auditAction = item => String(valueOf(item, 'accion', 'action') || '').trim();
	const auditUser = item => {
		const telegramId = valueOf(item, 'id_telegram', 'idTelegram');
		const linkedUser = users.find(user => String(user.telegramId || user.telegram_id || '') === String(telegramId));
		return linkedUser?.name || valueOf(item, 'usuario', 'user', 'userId', 'usuario_id') || (telegramId ? `Telegram ${telegramId}` : 'Sistema');
	};
	const auditActions = uniqueOptions(auditLog, auditAction);
	const auditSources = ['Telegram', 'ERP / sistema'];
	const filteredAuditLog = auditLog.filter(item => {
		const isTelegram = Boolean(valueOf(item, 'id_telegram', 'idTelegram'));
		const source = isTelegram ? 'Telegram' : 'ERP / sistema';
		return contains([itemDate(item), auditUser(item), source, auditAction(item), item.saleId, item.detalle, item.detail, item.productId, item.local, item.storeId].join(' '), auditFiltersForLog.query) &&
			(!auditFiltersForLog.source || source === auditFiltersForLog.source) &&
			(!auditFiltersForLog.action || auditAction(item) === auditFiltersForLog.action) &&
			matchesStore(item, stores, auditFiltersForLog.store, 'local', 'local_id', 'storeId') &&
			dateMatches(item, auditFiltersForLog);
	});
	const actionControls = textControl('actions', 'query', 'Buscar', auditFiltersForLog.query, 'Usuario, acción o detalle') +
		selectControl('actions', 'source', 'Origen', auditFiltersForLog.source, auditSources) +
		selectControl('actions', 'action', 'Acción', auditFiltersForLog.action, auditActions) +
		selectControl('actions', 'store', 'Local', auditFiltersForLog.store, uniqueOptions(stores, store => store.name || store.id)) +
		dateRangeControls('actions', auditFiltersForLog);
	const auditRows = filteredAuditLog.map(item => {
		const telegramId = valueOf(item, 'id_telegram', 'idTelegram');
		const source = telegramId ? `Telegram · ID ${telegramId}` : 'ERP / sistema';
		const product = products.find(entry => entry.id === item.productId)?.name || item.productId;
		return `<tr><td>${escapeHtml(itemDate(item) || '-')}</td><td>${escapeHtml(auditUser(item))}</td><td>${escapeHtml(source)}</td><td>${escapeHtml(auditAction(item))}</td><td>${escapeHtml(item.saleId)}</td><td>${escapeHtml(product)}</td><td>${formatCurrency(item.listPrice || 0)}</td><td>${formatCurrency(item.salePrice || 0)}</td><td>${formatCurrency(item.difference || 0)}</td><td>${escapeHtml(itemStore(stores, item.storeId || item.local_id))}</td><td>${escapeHtml(item.detalle || item.detail)}</td></tr>`;
	});

	const movementEdits = state.movementEdits || [];
	const editFilters = auditFilters.edits;
	const editTypes = uniqueOptions(movementEdits, item => valueOf(item, 'tipo_movimiento', 'movementType'));
	const editFields = uniqueOptions(movementEdits, item => valueOf(item, 'campo', 'field'));
	const filteredEdits = movementEdits.filter(item =>
		contains([item.movimiento_id, item.movementId, item.detalle_id, item.campo, item.field, item.valor_anterior, item.valor_nuevo, item.motivo, item.administrador, item.codigo_antiguo, item.codigo_nuevo, item.producto_anterior, item.producto_nuevo].join(' '), editFilters.query) &&
		(!editFilters.type || String(valueOf(item, 'tipo_movimiento', 'movementType')) === editFilters.type) &&
		(!editFilters.field || String(valueOf(item, 'campo', 'field')) === editFilters.field) &&
		matchesStore(item, stores, editFilters.store, 'local_origen', 'localOrigen') &&
		dateMatches(item, editFilters));
	const editControls = textControl('edits', 'query', 'Buscar', editFilters.query, 'Movimiento, motivo o usuario') +
		selectControl('edits', 'type', 'Tipo de movimiento', editFilters.type, editTypes) +
		selectControl('edits', 'field', 'Campo modificado', editFilters.field, editFields) +
		selectControl('edits', 'store', 'Local', editFilters.store, uniqueOptions(stores, store => store.name || store.id)) +
		dateRangeControls('edits', editFilters);
	const editRows = filteredEdits.map(item => {
		const telegramId = valueOf(item, 'administrador', 'admin');
		const telegramUser = users.find(user => String(user.telegramId || user.telegram_id || '') === String(telegramId));
		const user = telegramUser?.name || (telegramId ? `Telegram · ID ${telegramId}` : 'Telegram');
		const oldValue = valueOf(item, 'valor_anterior', 'oldValue') || '-';
		const newValue = valueOf(item, 'valor_nuevo', 'newValue') || '-';
		const inventoryBefore = valueOf(item, 'inventario_antes', 'inventoryBefore') || '-';
		const inventoryAfter = valueOf(item, 'inventario_despues', 'inventoryAfter') || '-';
		const details = [item.codigo_antiguo && `Código anterior: ${item.codigo_antiguo}`, item.codigo_nuevo && `Código nuevo: ${item.codigo_nuevo}`, item.producto_anterior && `Producto anterior: ${item.producto_anterior}`, item.producto_nuevo && `Producto nuevo: ${item.producto_nuevo}`].filter(Boolean).join(' · ');
		return `<tr><td>${escapeHtml(itemDate(item) || '-')}</td><td>${escapeHtml(item.movimiento_id || item.movementId)}</td><td>${escapeHtml(item.tipo_movimiento || item.movementType)}</td><td>${escapeHtml(item.campo || item.field)}</td><td>${escapeHtml(oldValue)}</td><td>${escapeHtml(newValue)}</td><td>${escapeHtml(details || '-')}</td><td>${escapeHtml(inventoryBefore)}</td><td>${escapeHtml(inventoryAfter)}</td><td>${escapeHtml(item.motivo || item.reason)}</td><td>${escapeHtml(user)}</td></tr>`;
	});

	return page('CONTROL', 'Movimientos de inventario', '',
		`${filtersPanel('Filtros de movimientos', 'movements', filteredMovements.length, rawMovements.length, movementControls)}${table(['Fecha', 'ID', 'Tipo', 'Producto', 'Cantidad', 'Local', 'Usuario', 'Documento', 'Observación'], movementRows)}` +
		`${filtersPanel('Filtros de Sistecrédito', 'sistecredito', filteredSistecredito.length, sistecredito.length, sisteControls)}${table(['Fecha', 'ID', 'Vendedor', 'Local', 'Valor', 'Método'], sistecreditoRows)}` +
		`${filtersPanel('Filtros de abonos a créditos y apartados', 'payments', filteredPayments.length, payments.length, paymentControls)}${table(['Fecha', 'Cuenta', 'Recibo', 'Valor abonado', 'Método', 'Saldo anterior', 'Saldo nuevo', 'Registrado por', 'Local'], paymentRows)}` +
		`${filtersPanel('Filtros de auditoría y bitácora de Telegram', 'actions', filteredAuditLog.length, auditLog.length, actionControls)}${table(['Fecha', 'Usuario', 'Origen', 'Acción', 'Venta', 'Producto', 'Precio lista', 'Precio vendido', 'Diferencia', 'Local', 'Detalle'], auditRows)}` +
		`${filtersPanel('Filtros de ediciones de movimientos desde Telegram', 'edits', filteredEdits.length, movementEdits.length, editControls)}${table(['Fecha', 'Movimiento', 'Tipo', 'Campo', 'Valor anterior', 'Valor nuevo', 'Cambios de producto', 'Inventario antes', 'Inventario después', 'Motivo', 'Usuario / Telegram'], editRows)}`);
}
