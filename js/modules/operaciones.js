import { page, table, badge } from '../components/tables.js?v=1';
import { formatCurrency } from '../utils/currency.js';

const definitions = [
  ['returns', 'Devoluciones al cliente', 'DEV', 'Productos devueltos por el cliente'],
  ['supplierReturns', 'Devoluciones al proveedor', 'DEV-P', 'Salida de producto defectuoso para cambio'],
  ['stockCounts', 'Conteos fisicos', 'CON', 'Local, fecha y responsable'],
  ['reservations', 'Reservas de inventario', 'RES', 'Cliente, entrega y estado'],
  ['warranties', 'Salida por garantia', 'GAR', 'Cambio de producto con garantia y factura'],
  ['damagedStock', 'Mercancia dañada en espera', 'DAM', 'Producto que salió por garantia y quedó pendiente'],
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

function warrantyRows(data) {
  const items = Array.isArray(data.warranties) ? data.warranties : [];
  if (!items.length) {
    return `<tr><td colspan="6" class="muted">No hay productos en garantia registrados.</td></tr>`;
  }
  return items.map(item => {
    const productName = item.productName || item.product || item.productId || '-';
    const invoice = item.invoiceNumber || item.factura || item.invoice || item.saleId || '-';
    const local = item.storeId || item.local || item.store || '-';
    const status = item.status || 'PENDIENTE';
    return `<tr>
      <td><strong>${item.id || '-'}</strong></td>
      <td>${productName}</td>
      <td>${invoice}</td>
      <td>${local}</td>
      <td>${badge(status)}</td>
      <td>
        <button class="table-action" data-action="warranty-receive" data-id="${item.id || ''}">Recibir</button>
        <button class="table-action danger" data-action="warranty-cancel" data-id="${item.id || ''}">Cancelar</button>
      </td>
    </tr>`;
  }).join('');
}

function damagedRows(data) {
  const items = Array.isArray(data.damagedStock) ? data.damagedStock : [];
  if (!items.length) {
    return `<tr><td colspan="6" class="muted">No hay mercancia dañada en espera.</td></tr>`;
  }
  return items.map(item => {
    const productName = item.productName || item.product || item.productId || '-';
    const local = item.storeId || item.local || item.store || '-';
    const status = item.status || 'EN_ESPERA';
    return `<tr>
      <td><strong>${item.id || '-'}</strong></td>
      <td>${productName}</td>
      <td>${item.quantity || item.amount || 0}</td>
      <td>${local}</td>
      <td>${badge(status)}</td>
      <td>
        <button class="table-action" data-action="damaged-receive" data-id="${item.id || ''}">Confirmar</button>
      </td>
    </tr>`;
  }).join('');
}

export function renderOperaciones(data) {
  const warrantyItems = Array.isArray(data.warranties) ? data.warranties : [];
  const damagedItems = Array.isArray(data.damagedStock) ? data.damagedStock : [];

  return page(
    'GARANTIAS',
    'Garantias',
    '<button class="primary wide" data-action="advanced-new" data-collection="warranties">Nueva garantia</button>',
    `
      <section class="panel">
        <div class="panel-head">
          <h3>Productos en garantia</h3>
          <span class="muted">${warrantyItems.length} registros</span>
        </div>
        ${table(['ID', 'Producto', 'Factura', 'Local', 'Estado', 'Acciones'], warrantyRows(data))}
      </section>
      <section class="panel" style="margin-top: 1rem;">
        <div class="panel-head">
          <h3>Mercancia dañada en espera</h3>
          <span class="muted">${damagedItems.length} registros</span>
        </div>
        ${table(['ID', 'Producto', 'Cantidad', 'Local', 'Estado', 'Acciones'], damagedRows(data))}
      </section>
    `
  );
}

export function advancedModal(collection, data) {
  const label = labels[collection] || collection;
  const stores = (data.stores || []).map(item => `<option value="${item.id}">${item.name}</option>`).join('');
  const products = (data.products || []).map(item => `<option value="${item.id}">${item.name} · ${item.code || item.id}</option>`).join('');
  const accounts = (data.accountsPayable || []).map(item => `<option value="${item.id}">${item.id} · ${item.invoiceNumber || item.purchaseId || ''}</option>`).join('');
  const inventoryCollections = ['returns', 'supplierReturns', 'supplier-returns'];
  const warrantyCollections = ['warranties', 'damagedStock', 'damaged-stock'];
  const inventoryFields = inventoryCollections.includes(collection)
    ? `<label class="input-label">Producto<select class="field" name="productId" required><option value="">Seleccionar producto</option>${products}</select></label><label class="input-label">Cantidad<input class="field" name="quantity" type="number" min="1" step="1" value="1" required></label>${collection === 'supplierReturns' || collection === 'supplier-returns' ? `<label class="input-label">Cuenta por pagar<select class="field" name="accountPayableId"><option value="">Seleccionar cuenta</option>${accounts}</select></label><label class="input-label">Compra relacionada<input class="field" name="purchaseId"></label>` : ''}`
    : warrantyCollections.includes(collection)
      ? `<label class="input-label">Producto<select class="field" name="productId" required><option value="">Seleccionar producto</option>${products}</select></label><label class="input-label">Cantidad<input class="field" name="quantity" type="number" min="1" step="1" value="1" required></label><label class="input-label">Tipo de tratamiento<select class="field" name="type"><option value="CAMBIO">Cambio</option><option value="SEGUNDA">Segunda</option><option value="MISMOREFERENCIA">Misma referencia</option><option value="PROVEEDOR">Proveedor</option></select></label>`
      : '';
  return `<div class="modal-backdrop"><form class="modal" id="advanced-form"><button type="button" class="modal-close">x</button><p class="eyebrow">OPERACION EMPRESARIAL</p><h2>Registrar ${label}</h2><input type="hidden" name="collection" value="${collection}"><label class="input-label">Identificador<input class="field" name="id" value="${nextAdvancedId(data, collection)}" required></label><label class="input-label">Descripcion<input class="field" name="description" required></label><label class="input-label">Local<select class="field" name="storeId"><option value="">Sin local</option>${stores}</select></label>${inventoryFields}<label class="input-label">Valor<input class="field" name="amount" type="number" min="0" value="0"></label><label class="input-label">Estado<select class="field" name="status"><option>REGISTRADO</option><option>PENDIENTE</option><option>ABIERTO</option><option>CERRADO</option><option>ENTREGADO</option><option>ANULADO</option><option>PROCESADA</option></select></label><label class="input-label">Observaciones<textarea class="field" name="notes"></textarea></label><button class="primary wide">Guardar registro</button></form></div>`;
}

export function nextAdvancedId(data, collection) { const definition = definitions.find(item => item[0] === collection); const prefix = definition?.[2] || 'OP'; const max = collectionSummary(data, collection).reduce((value, item) => Math.max(value, Number(String(item.id || '').replace(/\D/g, '')) || 0), 0); return `${prefix}-${String(max + 1).padStart(5, '0')}`; }
