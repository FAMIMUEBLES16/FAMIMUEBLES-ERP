import { page, table, badge, money } from '../components/tables.js';

export function renderParidad(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  const sellers = sellerOptions(data.users || [], data.sales || []);
  const paymentMethods = ['Efectivo', 'Transferencia', 'Tarjeta', 'Sistecrédito', 'Crédito interno FAMIMUEBLES', 'Apartado'];
  const methodOptions = paymentMethods.map(method => `<option value="${method}">${method}</option>`).join('');
  return page('PARIDAD OPERATIVA', 'Funciones del bot', '', `
    <p class="date-line">Operaciones compartidas con PostgreSQL para nómina, conteos, cartera y Sistecrédito.</p>
    <div class="report-grid">
      <article class="report-card"><span class="report-icon">$</span><h3>Nómina</h3><p>Previsualiza y cierra períodos por local.</p><button class="primary" data-action="parity-payroll">Abrir</button><button class="outline" data-action="parity-payroll-config">Configurar</button></article>
      <article class="report-card"><span class="report-icon">▦</span><h3>Conteo físico</h3><p>Registra diferencias y aplica ajustes confirmados.</p><button class="primary" data-action="parity-count">Abrir</button></article>
      <article class="report-card"><span class="report-icon">◉</span><h3>Sistecrédito</h3><p>Registra operaciones y consulta su historial.</p><button class="primary" data-action="parity-sistecredito">Abrir</button></article>
    </div>
    <section class="panel"><div class="panel-head"><h3>Reportes especializados</h3></div><div class="filter-row parity-filters"><label class="input-label">Desde<input class="field" id="parity-from" type="date"></label><label class="input-label">Hasta<input class="field" id="parity-to" type="date"></label><label class="input-label">Local<select class="field" id="parity-local"><option value="">Todos</option>${stores}</select></label><label class="input-label">Vendedor<select class="field" id="parity-vendedor"><option value="">Todos</option>${sellers}</select></label><label class="input-label">Método de pago<select class="field" id="parity-method"><option value="">Todos</option>${methodOptions}</select></label></div><div class="quick-actions parity-report-actions">
      ${['disponibilidad','inventario-bajo','sistecredito','gastos','gasolina','historial-empleado'].map(report => `<button class="outline" data-action="parity-report" data-report="${report}">${report.replaceAll('-', ' ')}</button>`).join('')}
    </div><div id="parity-report-result" class="parity-report-result"><p class="muted">Selecciona un reporte para ver la información aquí.</p></div></section>
    <template id="parity-stores">${stores}</template>`);
}

export function payrollModal(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  const sellers = new Map();
  (data.users || []).filter(user => ['VENDEDOR', 'CAJERO', 'SUPERVISOR'].includes(String(user.role || '').toUpperCase())).forEach(user => sellers.set(String(user.name || user.username || '').trim(), { empleado: String(user.name || user.username || '').trim(), salario_base: Number(user.salary || user.salario_base || 0) }));
  (data.sales || []).forEach(sale => { const name = String(sale.vendedor || sale.seller || '').trim(); if (name && !sellers.has(name)) sellers.set(name, { empleado: name, salario_base: 0 }); });
  const employees = JSON.stringify([...sellers.values()]).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<div class="modal-backdrop"><form class="modal" id="parity-payroll-form"><button type="button" class="modal-close">x</button><p class="eyebrow">NOMINA</p><h2>Calcular nómina</h2><label class="input-label">Fecha inicial<input class="field" name="start" type="date" required></label><label class="input-label">Fecha final<input class="field" name="end" type="date" required></label><label class="input-label">Local<select class="field" name="local" required>${stores}</select></label><label class="input-label">Comisión (%)<input class="field" name="rate" type="number" min="0" max="100" step="0.01" value="0"></label><label class="input-label">Vendedores detectados<textarea class="field" name="employees" rows="4">${employees}</textarea></label><p class="muted">Se usan las ventas del período y la configuración de salario guardada para cada vendedor.</p><div class="quick-actions"><button class="outline" type="button" data-action="parity-payroll-preview">Previsualizar</button><button class="primary" type="submit">Cerrar nómina</button></div><div data-parity-result></div></form></div>`;
}

export function countModal(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  const selectedStore = data.stores?.[0]?.id || data.stores?.[0]?.name || '';
  const inventory = new Map((data.inventoryByStore || data.inventory || []).filter(row => String(row.storeId || row.store || '') === String(selectedStore)).map(row => [String(row.productId || row.producto_id || row.codigo), Number(row.quantity ?? row.cantidad ?? 0)]));
  const products = (data.products || []).filter(product => product.active !== false).slice(0, 200).map(product => { const code = product.code || product.id; const system = inventory.get(String(product.id)) ?? inventory.get(String(code)) ?? 0; return `<div class="count-row" data-count-product="${code}" data-count-description="${product.name || ''}"><span>${product.name || product.id}</span><small>${code} · Sistema: ${system}</small><input class="field" data-count-physical type="number" min="0" value="${system}" aria-label="Cantidad física"></div>`; }).join('');
  return `<div class="modal-backdrop"><form class="modal" id="parity-count-form"><button type="button" class="modal-close">x</button><p class="eyebrow">INVENTARIO</p><h2>Conteo físico</h2><label class="input-label">Local<select class="field" name="local" required>${stores}</select></label><section class="count-list"><div class="panel-head"><div><h3>Productos disponibles</h3><span class="muted">La cantidad del sistema aparece como referencia.</span></div></div>${products || '<p class="muted">No hay productos cargados.</p>'}<div class="quick-actions count-add-product"><input class="field" data-count-add-code placeholder="Código nuevo"><input class="field" data-count-add-name placeholder="Descripción"><input class="field" data-count-add-physical type="number" min="0" placeholder="Cantidad física"><button class="outline" type="button" data-action="parity-count-add-product">Agregar producto físico</button></div></section><button class="primary wide">Crear sesión</button><div data-parity-result></div></form></div>`;
}

export function sistecreditoModal(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  const sellers = sellerOptions(data.users || [], data.sales || []);
  const methods = ['Efectivo', 'Transferencia', 'Tarjeta', 'Sistecrédito', 'Crédito interno FAMIMUEBLES', 'Apartado'].map(method => `<option value="${method}">${method}</option>`).join('');
  return `<div class="modal-backdrop"><form class="modal" id="parity-sistecredito-form"><button type="button" class="modal-close">×</button><p class="eyebrow">SISTECREDITO</p><h2>Registrar operación</h2><label class="input-label">Vendedor<select class="field" name="vendedor" required><option value="">Selecciona un vendedor</option>${sellers}</select></label><label class="input-label">Local<select class="field" name="local">${stores}</select></label><label class="input-label">Método de pago<select class="field" name="metodo_pago" required>${methods}</select></label><label class="input-label">Valor<input class="field" name="amount" type="number" min="1" required></label><button class="primary wide">Guardar</button><div data-parity-result></div></form></div>`;
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
