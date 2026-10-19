import { page, table, badge, money } from '../components/tables.js';
import { calculateSistecreditoLedger, SISTECREDITO_DEFAULT_OPENING_BALANCE, SISTECREDITO_DEFAULT_OPENING_DATE } from './sistecredito-ledger.js?v=20261019-credinet-reconciliation-v1';

const value = (item, ...keys) => keys.map(key => item?.[key]).find(item => item !== undefined && item !== null && item !== '') ?? '';
const dateValue = item => String(value(item, 'fecha', 'date', 'createdAt', 'created_at')).slice(0, 10);
const photoValue = item => value(item, 'foto', 'photo', 'imagen', 'image', 'captura', 'screenshot', 'comprobante', 'evidencia', 'foto_url', 'photo_url', 'comprobante_file_id');
const escapeHtml = input => String(input ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function filteredSistecreditoRows(data = {}, filters = {}) {
  return (Array.isArray(data.sistecredito) ? data.sistecredito : [])
    .filter(item => {
      const date = dateValue(item);
      const vendedor = String(value(item, 'vendedor', 'seller', 'empleado')).toLowerCase();
      const local = String(value(item, 'local', 'store', 'storeId'));
      const method = String(value(item, 'metodo_pago', 'method', 'paymentMethod'));
      return (!filters.from || date >= filters.from)
        && (!filters.to || date <= filters.to)
        && (!filters.local || local === filters.local)
        && (!filters.vendedor || vendedor.includes(filters.vendedor.toLowerCase()))
        && (!filters.method || method === filters.method);
    })
    .sort((left, right) => {
      const leftDate = new Date(left?.fecha || left?.date || left?.createdAt || left?.created_at || 0).getTime();
      const rightDate = new Date(right?.fecha || right?.date || right?.createdAt || right?.created_at || 0).getTime();
      return rightDate - leftDate;
    });
}

export function sistecreditoSummary(data = {}, filters = {}) {
  const rows = filteredSistecreditoRows(data, filters);
  const total = rows.reduce((sum, item) => sum + Number(value(item, 'valor', 'amount', 'total') || 0), 0);
  return `<div class="sistecredito-summary" aria-label="Resumen de recaudos"><strong class="sistecredito-summary-count">${rows.length}</strong><div><strong>Resumen recaudos</strong><span>Valor: ${money(total)}</span></div></div>`;
}

export function sistecreditoTable(data = {}, filters = {}) {
  const rows = filteredSistecreditoRows(data, filters);
  const body = rows.length ? rows.map(item => `<tr><td>${dateValue(item) || '-'}</td><td>${value(item, 'vendedor', 'seller', 'empleado') || '-'}</td><td>${value(item, 'local', 'store', 'storeId') || '-'}</td><td><strong>${money(Number(value(item, 'valor', 'amount', 'total') || 0))}</strong></td><td>${value(item, 'metodo_pago', 'method', 'paymentMethod') || '-'}</td><td>${photoValue(item) ? `<button class="table-action" data-action="sistecredito-photo" data-photo="${photoValue(item)}">Ver foto</button>` : '<span class="muted">Sin foto</span>'}${item?.id ? ` <button class="table-action" data-action="sistecredito-edit" data-id="${item.id}">Editar fecha</button>` : ''}</td></tr>`).join('') : '<tr><td colspan="6" class="muted">No hay operaciones de Sistecrédito para los filtros seleccionados.</td></tr>';
  return table(['Fecha', 'Vendedor', 'Local', 'Valor', 'Método de pago', 'Acciones'], body);
}

export function sistecreditoAccounting(data = {}) {
  const ledger = calculateSistecreditoLedger({
    sales: data.sales || data.ventas || [],
    receipts: data.sistecredito || [],
    adjustments: data.sistecreditoAdjustments || [],
    saleAmounts: data.sistecreditoSaleAmounts || [],
    openingBalance: data.sistecreditoOpeningDefault === false ? 0 : SISTECREDITO_DEFAULT_OPENING_BALANCE,
  });
  const monthlyDeposits = new Map();
  (data.sistecreditoAdjustments || [])
    .filter(item => item?.type === 'deposit')
    .forEach(item => {
      const month = String(value(item, 'date', 'fecha')).slice(0, 7) || 'Sin fecha';
      const current = monthlyDeposits.get(month) || { amount: 0, count: 0 };
      current.amount += Number(value(item, 'amount', 'valor') || 0);
      current.count += 1;
      monthlyDeposits.set(month, current);
    });
  const depositRows = [...monthlyDeposits.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([month, item]) => `<tr><td>${month}</td><td>${item.count}</td><td><strong>${money(item.amount)}</strong></td></tr>`)
    .join('') || '<tr><td colspan="3" class="muted">Aún no hay consignaciones registradas.</td></tr>';
  const depositDetails = (data.sistecreditoAdjustments || [])
    .filter(item => item?.type === 'deposit')
    .sort((left, right) => String(value(right, 'date', 'fecha')).localeCompare(String(value(left, 'date', 'fecha'))))
    .map(item => `<tr><td>${escapeHtml(value(item, 'date', 'fecha') || '-')}</td><td>${escapeHtml(item.salesPeriod || '-')}</td><td>${escapeHtml(item.reference || '-')}</td><td>${escapeHtml(item.note || '-')}</td><td><strong>${money(Number(value(item, 'amount', 'valor') || 0))}</strong></td></tr>`)
    .join('') || '<tr><td colspan="4" class="muted">No hay detalles de consignaciones.</td></tr>';
  const reconciliationRows = ledger.reconciliations
    .map(item => `<tr><td>${escapeHtml(`${item.periodStart} a ${item.periodEnd}`)}</td><td>${escapeHtml(item.source || 'Credinet')}</td><td>${Number(item.sourceSalesCount || 0)}</td><td><strong>${money(Number(item.sourceSalesTotal || 0))}</strong></td><td>${Number(item.sourceReceiptsCount || 0)}</td><td><strong>${money(Number(item.sourceReceiptsTotal || 0))}</strong></td></tr>`)
    .join('');
  const openingRecord = (data.sistecreditoAdjustments || []).find(item => item?.type === 'opening_balance');
  const openingDate = openingRecord?.date || openingRecord?.fecha || SISTECREDITO_DEFAULT_OPENING_DATE;
  const ledgerEnabled = data.sistecreditoLedgerEnabled === true;
  const ledgerStatusMessage = ledgerEnabled ? '' : data.sistecreditoLedgerStatus === 'unsupported'
    ? 'El servidor ERP activo aún no admite guardar consignaciones ni pagos mixtos de Sistecrédito. Actualiza y reinicia el servidor para habilitar estas funciones.'
    : 'No se pudo verificar que el servidor ERP admita estas funciones; por seguridad, el registro de consignaciones y pagos mixtos está deshabilitado.';
  const adjustment = (amount, label) => `<div><span>${label}</span><strong>${money(amount)}</strong></div>`;
  return `<section class="panel sistecredito-ledger" aria-label="Saldo pendiente de Sistecrédito">
    <div class="panel-head"><div><p class="eyebrow">CARTERA SISTECREDITO</p><h3>Sistecrédito nos debe</h3><span class="muted">Saldo calculado desde el cierre del ${openingDate}. Comisión aplicada: 1% sobre ventas desde el corte.</span></div>
      <div class="quick-actions"><button type="button" class="outline" data-action="sistecredito-opening"${ledgerEnabled ? '' : ' disabled'}>Configurar saldo inicial</button><button type="button" class="primary" data-action="sistecredito-deposit"${ledgerEnabled ? '' : ' disabled'}>Registrar consignación</button></div>
    </div>
    ${ledgerStatusMessage ? `<p class="danger-text">${ledgerStatusMessage}</p>` : ''}
    <div class="sistecredito-ledger-balance"><span>Saldo pendiente a hoy</span><strong>${money(ledger.balance)}</strong></div>
    <div class="sistecredito-ledger-breakdown">
      ${adjustment(ledger.openingBalance, 'Saldo de cierre inicial')}
      ${ledger.reconciliations.length ? adjustment(ledger.rawGrossSales, 'Ventas registradas en ERP') : ''}
      ${ledger.reconciliations.length ? adjustment(ledger.salesAdjustment, 'Ajuste de ventas según Credinet') : ''}
      ${adjustment(ledger.grossSales, ledger.reconciliations.length ? 'Ventas conciliadas con Credinet' : 'Ventas Sistecrédito')}
      ${ledger.reconciliations.length ? adjustment(-ledger.rawCommission, 'Comisión calculada sobre ERP (1%)') : ''}
      ${ledger.reconciliations.length ? adjustment(-ledger.commissionAdjustment, 'Ajuste de comisión según Credinet') : ''}
      ${adjustment(-ledger.commission, 'Descuento de comisión (1%)')}
      ${ledger.reconciliations.length ? adjustment(-ledger.rawReceipts, 'Recaudos registrados en ERP') : ''}
      ${ledger.reconciliations.length ? adjustment(-ledger.receiptsAdjustment, 'Ajuste de recaudos según Credinet') : ''}
      ${adjustment(-ledger.receipts, ledger.reconciliations.length ? 'Recaudos conciliados con Credinet' : 'Cuotas/recaudos recibidos')}
      ${adjustment(-ledger.deposits, 'Consignaciones recibidas')}
    </div>
    ${ledger.unallocatedMixedSales ? `<p class="danger-text">Hay ${ledger.unallocatedMixedSales} venta(s) mixta(s) con Sistecrédito sin valor desglosado; no se sumaron para evitar inflar el saldo.</p>` : ''}
    ${reconciliationRows ? `<h4>Conciliación con Credinet</h4>${table(['Período', 'Fuente', 'Ventas', 'Total ventas', 'Recaudos', 'Total recaudos'], reconciliationRows)}` : ''}
    <h4>Consignaciones registradas por mes</h4>
    ${table(['Mes', 'Consignaciones', 'Total consignado'], depositRows)}
    <h4>Detalle de consignaciones</h4>
    ${table(['Fecha de consignación', 'Mes de ventas pagado', 'Referencia', 'Nota', 'Valor'], depositDetails)}
  </section>`;
}

export function renderParidad(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  const sistecredito = Array.isArray(data.sistecredito) ? data.sistecredito : [];
  const sellers = sellerOptions([], sistecredito);
  const methods = [...new Set(sistecredito.map(item => value(item, 'metodo_pago', 'method', 'paymentMethod')).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'es')).map(method => `<option value="${method}">${method}</option>`).join('');
  return page('SISTECREDITO', 'Sistecredito', '', `
    <div id="sistecredito-summary">${sistecreditoSummary(data)}</div>
    <div id="sistecredito-accounting">${sistecreditoAccounting(data)}</div>
    <section class="panel"><div class="filter-row parity-filters"><label class="input-label">Desde<input class="field" id="parity-from" type="date"></label><label class="input-label">Hasta<input class="field" id="parity-to" type="date"></label><label class="input-label">Local<select class="field" id="parity-local"><option value="">Todos</option>${stores}</select></label><label class="input-label">Vendedor<select class="field" id="parity-vendedor"><option value="">Todos</option>${sellers}</select></label><label class="input-label">Método de pago<select class="field" id="parity-method"><option value="">Todos</option>${methods}</select></label></div><div id="sistecredito-table">${sistecreditoTable(data)}</div></section>`);
}

export function payrollModal(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  const sellers = new Map();
  (data.users || []).filter(user => ['VENDEDOR', 'CAJERO', 'SUPERVISOR'].includes(String(user.role || '').toUpperCase())).forEach(user => sellers.set(String(user.name || user.username || '').trim(), { empleado: String(user.name || user.username || '').trim(), salario_base: Number(user.salary || user.salario_base || 0) }));
  (data.sales || []).forEach(sale => { const name = String(sale.vendedor || sale.seller || '').trim(); if (name && !sellers.has(name)) sellers.set(name, { empleado: name, salario_base: 0 }); });
  const employees = JSON.stringify([...sellers.values()]).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const employeeList = [...sellers.values()].map(employee => `<li>${employee.empleado} <span class="muted">· Salario base: ${employee.salario_base}</span></li>`).join('');
  return `<div class="modal-backdrop"><form class="modal" id="parity-payroll-form"><button type="button" class="modal-close">x</button><p class="eyebrow">NOMINA</p><h2>Calcular nómina</h2><label class="input-label">Fecha inicial<input class="field" name="start" type="date" required></label><label class="input-label">Fecha final<input class="field" name="end" type="date" required></label><label class="input-label">Local<select class="field" name="local" required>${stores}</select></label><label class="input-label">Comisión (%)<input class="field" name="rate" type="number" min="0" max="100" step="0.01" value="0"></label><fieldset class="input-label"><legend>Vendedores detectados</legend><ul class="detected-employees">${employeeList || '<li class="muted">No hay vendedores detectados.</li>'}</ul></fieldset><input type="hidden" name="employees" value="${employees}"><p class="muted">Se usan las ventas del período y la configuración de salario guardada para cada vendedor.</p><div class="quick-actions"><button class="outline" type="button" data-action="parity-payroll-preview">Previsualizar</button><button class="primary" type="submit">Cerrar nómina y guardar cambios</button></div><div data-parity-result></div></form></div>`;
}

export function countModal(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  const selectedStore = data.stores?.[0]?.id || data.stores?.[0]?.name || '';
  const inventory = new Map((data.inventoryByStore || data.inventory || []).filter(row => String(row.storeId || row.store || '') === String(selectedStore)).map(row => [String(row.productId || row.producto_id || row.codigo), Number(row.quantity ?? row.cantidad ?? 0)]));
  const products = (data.products || []).filter(product => product.active !== false).slice(0, 200).map(product => { const code = product.code || product.id; const system = inventory.get(String(product.id)) ?? inventory.get(String(code)) ?? 0; return `<div class="count-row" data-count-product="${code}" data-count-description="${product.name || ''}"><span>${product.name || product.id}</span><small>${code} · Sistema: ${system}</small><input class="field" data-count-physical type="number" min="0" value="${system}" aria-label="Cantidad física"></div>`; }).join('');
  return `<div class="modal-backdrop"><form class="modal" id="parity-count-form"><button type="button" class="modal-close">x</button><p class="eyebrow">INVENTARIO</p><h2>Conteo físico</h2><label class="input-label">Local<select class="field" name="local" required>${stores}</select></label><p class="muted">Este conteo modifica el inventario real y debe confirmarse antes de guardar.</p><section class="count-list"><div class="panel-head"><div><h3>Productos disponibles</h3><span class="muted">La cantidad del sistema aparece como referencia.</span></div></div>${products || '<p class="muted">No hay productos cargados.</p>'}<div class="quick-actions count-add-product"><input class="field" data-count-add-code placeholder="Código nuevo"><input class="field" data-count-add-name placeholder="Descripción"><input class="field" data-count-add-physical type="number" min="0" placeholder="Cantidad física"><button class="outline" type="button" data-action="parity-count-add-product">Agregar producto físico</button></div></section><button class="primary wide">Crear sesión y guardar ajustes</button><div data-parity-result></div></form></div>`;
}

export function sistecreditoModal(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  const sellers = sellerOptions(data.users || [], data.sales || []);
  const methods = ['Efectivo', 'Transferencia', 'Tarjeta', 'Sistecrédito', 'Crédito interno FAMIMUEBLES', 'Apartado'].map(method => `<option value="${method}">${method}</option>`).join('');
  return `<div class="modal-backdrop"><form class="modal" id="parity-sistecredito-form"><button type="button" class="modal-close">×</button><p class="eyebrow">SISTECREDITO</p><h2>Registrar operación</h2><label class="input-label">Vendedor<select class="field" name="vendedor" required><option value="">Selecciona un vendedor</option>${sellers}</select></label><label class="input-label">Local<select class="field" name="local">${stores}</select></label><label class="input-label">Método de pago<select class="field" name="metodo_pago" required>${methods}</select></label><label class="input-label">Valor<input class="field" name="amount" type="number" min="1" required></label><button class="primary wide">Guardar operación y aplicar cambios</button><div data-parity-result></div></form></div>`;
}

export function sistecreditoDepositModal() {
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return `<div class="modal-backdrop"><form class="modal" id="sistecredito-deposit-form"><button type="button" class="modal-close">×</button><p class="eyebrow">SISTECREDITO</p><h2>Registrar consignación recibida</h2><label class="input-label">Fecha en que consignó<input class="field" name="date" type="date" value="${today}" required></label><label class="input-label">Mes de ventas que está pagando<input class="field" name="salesPeriod" type="month"></label><label class="input-label">Valor consignado<input class="field" name="amount" type="number" min="1" step="1" required></label><label class="input-label">Referencia bancaria<input class="field" name="reference" maxlength="120"></label><label class="input-label">Nota<input class="field" name="note" maxlength="240"></label><p class="muted">La consignación reducirá el saldo que Sistecrédito nos debe. Puedes indicar el mes de ventas pagado (normalmente de hace tres meses).</p><button class="primary wide">Guardar consignación</button><div data-parity-result></div></form></div>`;
}

export function sistecreditoOpeningModal(data = {}) {
  const record = (data.sistecreditoAdjustments || []).find(item => item?.type === 'opening_balance');
  const date = record?.date || record?.fecha || SISTECREDITO_DEFAULT_OPENING_DATE;
  const amountValue = value(record || {}, 'amount', 'valor');
  const defaultAmount = data.sistecreditoOpeningDefault === false ? 0 : SISTECREDITO_DEFAULT_OPENING_BALANCE;
  const amount = Number(amountValue === '' ? defaultAmount : amountValue);
  return `<div class="modal-backdrop"><form class="modal" id="sistecredito-opening-form"><button type="button" class="modal-close">×</button><p class="eyebrow">SISTECREDITO</p><h2>Configurar saldo de apertura</h2><label class="input-label">Saldo pendiente al cierre<input class="field" name="amount" type="number" min="0" step="1" value="${amount}" required></label><label class="input-label">Fecha de corte<input class="field" name="date" type="date" value="${date}" required></label><p class="muted">Usa el saldo conciliado de cierre. Las ventas, cuotas y consignaciones anteriores al corte no se vuelven a sumar.</p><button class="primary wide">Guardar saldo inicial</button><div data-parity-result></div></form></div>`;
}

function sellerOptions(users = [], sales = []) {
  const names = new Set();
  [...users, ...sales].forEach(item => {
    const name = item.name || item.username || item.nombre || item.vendedor || item.seller || item.empleado;
    if (String(name || '').trim()) names.add(String(name).trim());
  });
  return [...names].sort((left, right) => left.localeCompare(right, 'es')).map(name => `<option value="${name}">${name}</option>`).join('');
}

export function payrollConfigModal() {
  return `<div class="modal-backdrop"><form class="modal" id="parity-payroll-config-form"><button type="button" class="modal-close">x</button><p class="eyebrow">NOMINA</p><h2>Configuración</h2><label class="input-label">Tipo de registro<select class="field" name="kind"><option value="parameter">Parámetro</option><option value="employee">Empleado</option><option value="product">Producto comisionable</option></select></label><label class="input-label">Nombre / producto<input class="field" name="name" required></label><label class="input-label">Identificador / código<input class="field" name="identifier" required></label><label class="input-label">Valor / salario / comisión<input class="field" name="value" type="number" min="0" step="0.001" value="0"></label><label class="input-label">Local<input class="field" name="local"></label><button class="primary wide">Guardar configuración</button><div data-parity-result></div></form></div>`;
}

export function formatParityResult(payload) {
  const employees = payload.employees || payload.items || [];
  return employees.length ? table(['Empleado','Ventas','Comision','Neto','Estado'], employees.map(item => `<tr><td>${item.empleado || item.vendedor || item.cliente || '-'}</td><td>${money(item.ventas_comisionables || item.valor || 0)}</td><td>${money(item.comision || 0)}</td><td>${money(item.neto || item.valor || 0)}</td><td>${badge(item.estado || payload.status || 'OK')}</td></tr>`)) : `<p class="muted">Operacion completada: ${payload.status || payload.id || 'OK'}.</p>`;
}
