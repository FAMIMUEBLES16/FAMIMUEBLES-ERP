import { page, table, badge } from '../components/tables.js';
import { formatCurrency } from '../utils/currency.js';

const definitions = [
  ['returns', 'Devoluciones clientes', 'DEV', 'Cliente, venta, motivo y valor'],
  ['supplierReturns', 'Devoluciones proveedores', 'DEV-P', 'Proveedor, compra, motivo y valor'],
  ['stockCounts', 'Conteos fisicos', 'CON', 'Local, fecha y responsable'],
  ['reservations', 'Reservas de inventario', 'RES', 'Cliente, entrega y estado'],
  ['warranties', 'Garantias', 'GAR', 'Cliente, producto y vencimiento'],
  ['damagedStock', 'Mercancia danada', 'DAM', 'Producto, local y motivo'],
  ['cashSessions', 'Cajas y arqueos', 'CAJ', 'Local, responsable y cierre'],
  ['cashMovements', 'Ingresos y egresos', 'MOV-C', 'Caja, tipo, concepto y valor'],
  ['bankAccounts', 'Cuentas bancarias', 'BAN', 'Banco, cuenta y saldo'],
  ['customerAccounts', 'Cuentas por cobrar', 'CXC', 'Cliente, vencimiento y saldo'],
  ['quotes', 'Cotizaciones', 'COT', 'Cliente, vigencia y total'],
  ['orders', 'Pedidos', 'PED', 'Cliente, local y estado'],
  ['deliveries', 'Entregas', 'ENT', 'Pedido, direccion y estado'],
  ['creditNotes', 'Notas credito', 'NC', 'Venta, motivo y valor'],
];

const labels = { returns: 'devolucion', supplierReturns: 'devolucion proveedor', stockCounts: 'conteo', reservations: 'reserva', warranties: 'garantia', damagedStock: 'mercancia danada', cashSessions: 'caja', cashMovements: 'movimiento de caja', bankAccounts: 'cuenta bancaria', customerAccounts: 'cuenta por cobrar', quotes: 'cotizacion', orders: 'pedido', deliveries: 'entrega', creditNotes: 'nota credito' };

function collectionSummary(data, key) { return Array.isArray(data[key]) ? data[key] : []; }
function totalFor(items) { return items.reduce((sum, item) => sum + Number(item.amount ?? item.total ?? item.value ?? 0), 0); }
function card(data, definition) { const [key, title] = definition; const items = collectionSummary(data, key); return `<article class="report-card"><span class="report-icon">${key === 'cashMovements' ? '$' : '▦'}</span><h3>${title}</h3><strong>${items.length}</strong><p>${formatCurrency(totalFor(items))}</p><button class="outline" data-action="advanced-new" data-collection="${key}">Registrar</button></article>`; }

export function renderOperaciones(data) {
  const cards = definitions.map(definition => card(data, definition)).join('');
  const recent = definitions.flatMap(([key, title]) => collectionSummary(data, key).slice(-3).map(item => ({ key, title, item }))).slice(-15).reverse();
  return page('OPERACION EMPRESARIAL', 'Procesos avanzados', '<button class="outline" data-action="advanced-export">Exportar registros</button>', `<p class="date-line">Control central de caja, inventario, cartera y documentos comerciales.</p><div class="report-grid">${cards}</div><section class="panel"><div class="panel-head"><h3>Ultimos registros</h3><span class="muted">${recent.length} movimientos</span></div>${table(['Proceso','ID','Descripcion','Estado','Valor'], recent.map(row => `<tr><td>${row.title}</td><td><strong>${row.item.id || '-'}</strong></td><td>${row.item.description || row.item.reason || row.item.customerName || row.item.concept || 'Registro operativo'}</td><td>${badge(row.item.status || 'REGISTRADO')}</td><td>${formatCurrency(row.item.amount ?? row.item.total ?? row.item.value ?? 0)}</td></tr>`))}</section>`);
}

export function advancedModal(collection, data) {
  const label = labels[collection] || collection;
  const stores = (data.stores || []).map(item => `<option value="${item.id}">${item.name}</option>`).join('');
  const products = (data.products || []).map(item => `<option value="${item.id}">${item.name} · ${item.code || item.id}</option>`).join('');
  const accounts = (data.accountsPayable || []).map(item => `<option value="${item.id}">${item.id} · ${item.invoiceNumber || item.purchaseId || ''}</option>`).join('');
  const inventoryFields = ['returns', 'supplierReturns'].includes(collection) ? `<label class="input-label">Producto<select class="field" name="productId" required><option value="">Seleccionar producto</option>${products}</select></label><label class="input-label">Cantidad<input class="field" name="quantity" type="number" min="1" step="1" value="1" required></label>${collection === 'supplierReturns' ? `<label class="input-label">Cuenta por pagar<select class="field" name="accountPayableId"><option value="">Seleccionar cuenta</option>${accounts}</select></label><label class="input-label">Compra relacionada<input class="field" name="purchaseId"></label>` : ''}` : '';
  return `<div class="modal-backdrop"><form class="modal" id="advanced-form"><button type="button" class="modal-close">x</button><p class="eyebrow">OPERACION EMPRESARIAL</p><h2>Registrar ${label}</h2><input type="hidden" name="collection" value="${collection}"><label class="input-label">Identificador<input class="field" name="id" value="${nextAdvancedId(data, collection)}" required></label><label class="input-label">Descripcion<input class="field" name="description" required></label><label class="input-label">Local<select class="field" name="storeId"><option value="">Sin local</option>${stores}</select></label>${inventoryFields}<label class="input-label">Valor<input class="field" name="amount" type="number" min="0" value="0"></label><label class="input-label">Estado<select class="field" name="status"><option>REGISTRADO</option><option>PENDIENTE</option><option>ABIERTO</option><option>CERRADO</option><option>ENTREGADO</option><option>ANULADO</option><option>PROCESADA</option></select></label><label class="input-label">Observaciones<textarea class="field" name="notes"></textarea></label><button class="primary wide">Guardar registro</button></form></div>`;
}

export function nextAdvancedId(data, collection) { const definition = definitions.find(item => item[0] === collection); const prefix = definition?.[2] || 'OP'; const max = collectionSummary(data, collection).reduce((value, item) => Math.max(value, Number(String(item.id || '').replace(/\D/g, '')) || 0), 0); return `${prefix}-${String(max + 1).padStart(5, '0')}`; }
