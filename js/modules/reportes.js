import { page, table } from '../components/tables.js';
import { inventoryRows } from '../utils/inventory.js';

const REPORTS = {
	inventory: { label: 'Reporte de inventario', collection: 'inventoryByStore', source: 'inventoryByStore', columns: ['Producto', 'Local', 'Cantidad', 'Minimo'] },
	inventoryReplacement: { label: 'Entrega y reemplazo de inventario', collection: 'inventoryByStore', source: 'inventoryByStore', columns: ['Producto', 'Cantidad disponible'] },
	sales: { label: 'Reporte de ventas', collection: 'sales', source: 'sales', columns: ['Fecha', 'Factura', 'Cliente', 'Local', 'Total'] },
	expenses: { label: 'Reporte de gastos', collection: 'expenses', source: 'expenses', columns: ['Fecha', 'Categoria', 'Detalle', 'Local', 'Valor'] },
	fuel: { label: 'Reporte de gasolina', collection: 'fuelRecords', source: 'fuelRecords', columns: ['Fecha', 'Vehiculo', 'Conductor', 'Local', 'Valor'] },
	portfolio: { label: 'Reporte de cartera', collection: 'credits', source: 'credits', columns: ['Fecha', 'Cliente', 'Factura', 'Local', 'Total', 'Saldo'] },
	accountsPayable: { label: 'Reporte de cuentas por pagar', collection: 'accountsPayable', source: 'accountsPayable', columns: ['Fecha', 'Proveedor', 'Factura', 'Local', 'Total', 'Saldo'] }
};

const escapeHtml = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const firstValue = (item, keys) => keys.map(key => item?.[key]).find(value => value !== undefined && value !== null && value !== '');
const dateValue = item => firstValue(item, ['date', 'fecha', 'createdAt', 'created_at', 'fecha_venta', 'fechaCompra']) || '';
const storeValue = (item, stores) => { const id = firstValue(item, ['storeId', 'store_id', 'localId', 'local_id']); return firstValue(item, ['store', 'local', 'local_nombre']) || stores.find(store => String(store.id) === String(id))?.name || id || ''; };
const sanitizeDisplayText = (value, fallback = 'Sin dato') => {
	const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
	if (!raw || ['undefined', 'null', 'none', 'nulo', 'sin nombre', 'sin cliente', 'sin identificar', 'cliente', 'cliente sin nombre', 'contado', 'sin dato', 'desconocido', 'n/a'].includes(raw.toLowerCase())) return fallback;
	if (/^(mov|cli|customer|cliente)[-_ ]?\d+$/i.test(raw) || /^\d{3,}$/i.test(raw)) return `Cliente no identificado (referencia ${raw})`;
	if (/^(?:\d+|[a-z]+-[a-z0-9]+)$/i.test(raw) && raw.length <= 12) return `Cliente no identificado (${raw})`;
	return raw;
};
const money = value => value === '' || value === undefined || value === null ? '' : `$ ${Number(value || 0).toLocaleString('es-CO')}`;

function reportRows(data, type) {
	const report = REPORTS[type] || REPORTS.inventory;
	const stores = data.stores || [];
	return (data[report.source] || []).map(item => {
		const product = (data.products || []).find(candidate => String(candidate.id) === String(firstValue(item, ['productId', 'product_id'])));
		const total = firstValue(item, ['total', 'amount', 'valor_total', 'valor', 'total_venta']);
		const balance = firstValue(item, ['balance', 'saldo', 'saldo_pendiente', 'pendingAmount']);
		if (type === 'inventory' || type === 'inventoryReplacement') {
			const productName = product?.name || firstValue(item, ['productName', 'producto', 'codigo', 'productId']);
			const quantity = firstValue(item, ['quantity', 'cantidad', 'stock']) ?? 0;
			const minimum = firstValue(item, ['minimumQuantity', 'minimum', 'minimumStock']) ?? 0;
			return type === 'inventoryReplacement'
				? [productName, quantity]
				: [productName, storeValue(item, stores), quantity, minimum];
		}
		if (type === 'sales') {
			const customerValue = firstValue(item, ['customer', 'cliente', 'customerName', 'nombre_cliente', 'cliente_nombre']);
			return [dateValue(item), firstValue(item, ['invoiceId', 'invoiceNumber', 'numero_factura', 'id']), sanitizeDisplayText(customerValue, 'Cliente no identificado'), storeValue(item, stores), money(total)];
		}
		if (type === 'expenses') return [dateValue(item), firstValue(item, ['category', 'categoria', 'type']) || 'General', firstValue(item, ['detail', 'detalle', 'description', 'concept']) || '', storeValue(item, stores), money(total)];
		if (type === 'fuel') return [dateValue(item), firstValue(item, ['vehicle', 'carro', 'plate', 'placa']) || '', firstValue(item, ['driver', 'conductor', 'employee']) || '', storeValue(item, stores), money(total)];
		return [dateValue(item), firstValue(item, ['customer', 'cliente', 'supplier', 'proveedor', 'supplierName']) || '', firstValue(item, ['invoiceNumber', 'invoiceId', 'factura', 'numero_factura']) || '', storeValue(item, stores), money(total), money(balance)];
	});
}

function inDateRange(item, from, to) {
	const value = String(dateValue(item)).slice(0, 10);
	return (!from || !value || value >= from) && (!to || !value || value <= to);
}

function consolidateInventory(items, products) {
	const grouped = new Map();
	items.forEach(item => {
		const productId = firstValue(item, ['productId', 'product_id']) || firstValue(item, ['productName', 'producto', 'codigo']);
		const product = products.find(candidate => String(candidate.id) === String(productId));
		const key = String(productId || product?.name || 'sin-producto');
		const current = grouped.get(key) || { ...item, quantity: 0, reservedQuantity: 0, minimumQuantity: 0 };
		current.quantity += Number(firstValue(item, ['quantity', 'cantidad', 'stock']) || 0);
		current.reservedQuantity += Number(firstValue(item, ['reservedQuantity', 'reserved_quantity']) || 0);
		current.minimumQuantity = Math.max(current.minimumQuantity, Number(firstValue(item, ['minimumQuantity', 'minimum', 'minimumStock']) || 0));
		if (product) current.productName = product.name;
		grouped.set(key, current);
	});
	return [...grouped.values()].map(item => ({ ...item, store: 'Todos los locales' }));
}

function productIsActive(product) {
	const status = product.active ?? product.activo ?? product.enabled ?? product.estado ?? product.status;
	if (status === undefined || status === null || status === '') return true;
	return ![false, 0, '0', 'false', 'no', 'inactivo', 'inactiva', 'inactive', 'desactivado', 'desactivada', 'disabled']
		.includes(typeof status === 'string' ? status.trim().toLowerCase() : status);
}

function availableInventoryRows(data, storeId) {
	return inventoryRows(data, storeId).filter(row => productIsActive(row.product) && Number(row.quantity || 0) > 0);
}

export function renderReportPreview(data = {}, type = 'inventory', filters = {}) {
	const report = REPORTS[type] || REPORTS.inventory;
	const stores = data.stores || [];
	const source = data[report.source] || [];
	const selected = String(filters.store || '');
	if (type === 'inventoryReplacement') {
		if (!selected) {
			const empty = `<tr><td colspan="${report.columns.length}" class="report-empty">Selecciona un local para preparar el reporte de entrega.</td></tr>`;
			return { title: report.label, collection: report.collection, count: 0, html: table(report.columns, empty) };
		}
		const rows = availableInventoryRows(data, selected);
		const html = rows.length
			? table(report.columns, rows.map(row => `<tr>${reportRows({ ...data, [report.source]: [row] }, type)[0].map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join(''))
			: table(report.columns, `<tr><td colspan="${report.columns.length}" class="report-empty">No hay productos disponibles para este local.</td></tr>`);
		return { title: report.label, collection: report.collection, count: rows.length, html };
	}
	const filtered = source.filter(item => {
		const itemStore = firstValue(item, ['storeId', 'store_id', 'localId', 'local_id']);
		const quantity = Number(firstValue(item, ['quantity', 'cantidad', 'stock']) ?? 0);
		return (!selected || String(itemStore) === selected || String(storeValue(item, stores)) === selected)
			&& inDateRange(item, filters.from, filters.to)
			&& (type !== 'inventory' || quantity !== 0);
	});
	const previewItems = type === 'inventory' && !selected ? consolidateInventory(filtered, data.products || []).filter(item => Number(item.quantity || 0) !== 0) : filtered;
	const rows = reportRows({ ...data, [report.source]: previewItems }, type).map(values => `<tr>${values.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
	const empty = `<tr><td colspan="${report.columns.length}" class="report-empty">No hay registros para los filtros seleccionados.</td></tr>`;
	return { title: report.label, collection: report.collection, count: previewItems.length, html: table(report.columns, rows || empty) };
}

export function renderReportes(data = {}) {
	const stores = (data.stores || []).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
	const sellers = reportSellers(data.users || []).map(user => `<option value="${escapeHtml(user.id)}">${escapeHtml(user.name)}</option>`).join('');
	const preview = renderReportPreview(data);
	return page('ANALITICA', 'Reportes', '', `<section class="panel report-filters"><div class="panel-head"><div><h3>Filtros del reporte</h3><span class="muted">Selecciona los datos que quieres consultar</span></div><span class="report-count" id="report-count">${preview.count} registros</span></div><div class="filter-row report-filter-row"><label class="input-label">Local<select class="field" id="report-store"><option value="">Todos los locales</option>${stores}</select></label><label class="input-label">Tipo de reporte<select class="field" id="report-type"><option value="inventory">Reporte de inventario</option><option value="inventoryReplacement">Entrega y reemplazo de inventario</option><option value="sales">Reporte de ventas</option><option value="expenses">Reporte de gastos</option><option value="fuel">Reporte de gasolina</option><option value="portfolio">Reporte de cartera</option><option value="accountsPayable">Reporte de cuentas por pagar</option></select></label><label class="input-label" id="report-from-field">Desde<input class="field" id="report-from" type="date"></label><label class="input-label" id="report-to-field">Hasta<input class="field" id="report-to" type="date"></label><button class="primary report-generate" type="button" data-action="report-generate">Generar reporte en PDF</button></div><div class="report-handover-fields" id="report-handover-fields" hidden><label class="input-label">Vendedor principal<select class="field" id="report-primary-seller"><option value="">Selecciona el vendedor principal</option>${sellers}</select></label><label class="input-label">Vendedor de reemplazo<select class="field" id="report-replacement-seller"><option value="">Selecciona el vendedor de reemplazo</option>${sellers}</select></label></div></section><section class="panel report-preview"><div class="panel-head"><h3 id="report-preview-title">${preview.title}</h3><span class="muted">Vista previa</span></div><div id="report-preview-table">${preview.html}</div></section>`);
}

export function reportDefinition(type) { return REPORTS[type] || REPORTS.inventory; }

function reportSellers(users) {
	return users
		.filter(user => {
			const active = user.active ?? user.activo ?? user.enabled ?? user.status ?? user.estado;
			const inactive = [false, 0, '0', 'false', 'no', 'inactivo', 'inactiva', 'inactive', 'desactivado', 'disabled'];
			const role = String(user.role || user.rol || '').toLowerCase();
			return !inactive.includes(typeof active === 'string' ? active.trim().toLowerCase() : active)
				&& !/(admin|superuser|propietario)/.test(role);
		})
		.map(user => ({
			id: String(user.id || user.userId || user.user_id || user.telegramId || user.telegram_id || user.id_telegram || ''),
			name: String(user.displayName || user.display_name || user.name || user.nombre || user.empleado || user.fullName || user.username || user.usuario || '').trim(),
		}))
		.filter(user => user.id && user.name);
}

export function renderInventoryHandoverDocument(data = {}, filters = {}) {
	const store = (data.stores || []).find(item => String(item.id) === String(filters.store));
	const sellers = reportSellers(data.users || []);
	const primarySeller = sellers.find(user => user.id === String(filters.primarySeller));
	const replacementSeller = sellers.find(user => user.id === String(filters.replacementSeller));
	if (!store) throw new Error('Selecciona un local válido para el reporte.');
	if (!primarySeller || !replacementSeller) throw new Error('Selecciona ambos vendedores para el reporte.');
	if (primarySeller.id === replacementSeller.id) throw new Error('El vendedor principal y el de reemplazo deben ser diferentes.');
	const rows = availableInventoryRows(data, store.id);
	const body = rows.map(row => `<tr><td>${escapeHtml(row.product.name)}</td><td>${escapeHtml(row.quantity)}</td></tr>`).join('');
	const date = escapeHtml(new Date().toLocaleDateString('es-CO'));
	return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Entrega de inventario - ${escapeHtml(store.name)}</title><style>
		@page{size:letter portrait;margin:15mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#182230;margin:0}h1{font-size:20px;margin:0 0 5px}h2{font-size:15px;margin:22px 0 8px}.heading{text-align:center;border-bottom:2px solid #174a96;padding:0 0 14px;margin-bottom:16px}.subtitle{color:#475467;font-size:12px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px 20px;margin:14px 0}.meta strong{display:inline-block;min-width:90px}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{border:1px solid #98a2b3;padding:6px;text-align:left}th{background:#eef3fa}td:nth-child(2){text-align:right}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:56px;break-inside:avoid}.signature{text-align:center;padding-top:8px}.line{border-top:1px solid #182230;margin-bottom:8px}.signature strong,.signature span{display:block}.signature span{margin-top:4px;color:#475467}.foot{margin-top:24px;color:#667085;font-size:10px}@media print{.foot{position:fixed;bottom:0}}
	</style></head><body><header class="heading"><h1>FAMIMUEBLES</h1><div class="subtitle">ACTA DE ENTREGA Y REEMPLAZO DE INVENTARIO</div></header><section class="meta"><div><strong>Local:</strong> ${escapeHtml(store.name)}</div><div><strong>Fecha:</strong> ${date}</div><div><strong>Vendedor principal:</strong> ${escapeHtml(primarySeller.name)}</div><div><strong>Vendedor de reemplazo:</strong> ${escapeHtml(replacementSeller.name)}</div><div><strong>Productos disponibles:</strong> ${rows.length}</div><div><strong>Unidades disponibles:</strong> ${rows.reduce((total, row) => total + Number(row.quantity || 0), 0)}</div></section><h2>Detalle del inventario</h2><table><thead><tr><th>Producto</th><th>Cantidad disponible</th></tr></thead><tbody>${body || '<tr><td colspan="2">No hay productos activos con existencias disponibles.</td></tr>'}</tbody></table><section class="signatures"><div class="signature"><div class="line"></div><strong>${escapeHtml(primarySeller.name)}</strong><span>Vendedor principal - Entrega</span></div><div class="signature"><div class="line"></div><strong>${escapeHtml(replacementSeller.name)}</strong><span>Vendedor de reemplazo - Recibe</span></div></section><p class="foot">Al firmar, ambas partes dejan constancia del estado del inventario relacionado en este documento.</p><script>window.addEventListener('load',()=>window.print());</script></body></html>`;
}
