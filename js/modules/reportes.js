import { page, table } from '../components/tables.js';

const REPORTS = {
	inventory: { label: 'Reporte de inventario', collection: 'inventoryByStore', source: 'inventoryByStore', columns: ['Producto', 'Local', 'Cantidad', 'Minimo'] },
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
const money = value => value === '' || value === undefined || value === null ? '' : `$ ${Number(value || 0).toLocaleString('es-CO')}`;

function reportRows(data, type) {
	const report = REPORTS[type] || REPORTS.inventory;
	const stores = data.stores || [];
	return (data[report.source] || []).map(item => {
		const product = (data.products || []).find(candidate => String(candidate.id) === String(firstValue(item, ['productId', 'product_id'])));
		const total = firstValue(item, ['total', 'amount', 'valor_total', 'valor', 'total_venta']);
		const balance = firstValue(item, ['balance', 'saldo', 'saldo_pendiente', 'pendingAmount']);
		if (type === 'inventory') return [product?.name || firstValue(item, ['productName', 'producto', 'codigo', 'productId']), storeValue(item, stores), firstValue(item, ['quantity', 'cantidad', 'stock']) ?? 0, firstValue(item, ['minimumQuantity', 'minimum', 'minimumStock']) ?? 0];
		if (type === 'sales') return [dateValue(item), firstValue(item, ['invoiceId', 'invoiceNumber', 'numero_factura', 'id']), firstValue(item, ['customer', 'cliente', 'customerName']) || 'Contado', storeValue(item, stores), money(total)];
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

export function renderReportPreview(data = {}, type = 'inventory', filters = {}) {
	const report = REPORTS[type] || REPORTS.inventory;
	const stores = data.stores || [];
	const source = data[report.source] || [];
	const selected = String(filters.store || '');
	const filtered = source.filter(item => {
		const itemStore = firstValue(item, ['storeId', 'store_id', 'localId', 'local_id']);
		const quantity = Number(firstValue(item, ['quantity', 'cantidad', 'stock']) ?? 0);
		return (!selected || String(itemStore) === selected || String(storeValue(item, stores)) === selected) && inDateRange(item, filters.from, filters.to) && (type !== 'inventory' || quantity !== 0);
	});
	const previewItems = type === 'inventory' && !selected ? consolidateInventory(filtered, data.products || []).filter(item => Number(item.quantity || 0) !== 0) : filtered;
	const rows = reportRows({ ...data, [report.source]: previewItems }, type).map(values => `<tr>${values.map(value => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
	const empty = `<tr><td colspan="${report.columns.length}" class="report-empty">No hay registros para los filtros seleccionados.</td></tr>`;
	return { title: report.label, collection: report.collection, count: previewItems.length, html: table(report.columns, rows || empty) };
}

export function renderReportes(data = {}) {
	const stores = (data.stores || []).map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
	const preview = renderReportPreview(data);
	return page('ANALITICA', 'Reportes', '', `<section class="panel report-filters"><div class="panel-head"><div><h3>Filtros del reporte</h3><span class="muted">Selecciona los datos que quieres consultar</span></div><span class="report-count" id="report-count">${preview.count} registros</span></div><div class="filter-row report-filter-row"><label class="input-label">Local<select class="field" id="report-store"><option value="">Todos los locales</option>${stores}</select></label><label class="input-label">Tipo de reporte<select class="field" id="report-type"><option value="inventory">Reporte de inventario</option><option value="sales">Reporte de ventas</option><option value="expenses">Reporte de gastos</option><option value="fuel">Reporte de gasolina</option><option value="portfolio">Reporte de cartera</option><option value="accountsPayable">Reporte de cuentas por pagar</option></select></label><label class="input-label">Desde<input class="field" id="report-from" type="date"></label><label class="input-label">Hasta<input class="field" id="report-to" type="date"></label><button class="primary report-generate" type="button" data-action="report-generate">Generar reporte en PDF</button></div></section><section class="panel report-preview"><div class="panel-head"><h3 id="report-preview-title">${preview.title}</h3><span class="muted">Vista previa</span></div><div id="report-preview-table">${preview.html}</div></section>`);
}

export function reportDefinition(type) { return REPORTS[type] || REPORTS.inventory; }
