import { page, table, badge, money } from '../components/tables.js';

export function renderParidad(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  return page('PARIDAD OPERATIVA', 'Funciones del bot', '', `
    <p class="date-line">Operaciones compartidas con PostgreSQL para nómina, conteos, cartera y Sistecrédito.</p>
    <div class="report-grid">
      <article class="report-card"><span class="report-icon">$</span><h3>Nómina</h3><p>Previsualiza y cierra períodos por local.</p><button class="primary" data-action="parity-payroll">Abrir</button><button class="outline" data-action="parity-payroll-config">Configurar</button></article>
      <article class="report-card"><span class="report-icon">▦</span><h3>Conteo físico</h3><p>Registra diferencias y aplica ajustes confirmados.</p><button class="primary" data-action="parity-count">Abrir</button></article>
      <article class="report-card"><span class="report-icon">◉</span><h3>Sistecrédito</h3><p>Registra operaciones y consulta su historial.</p><button class="primary" data-action="parity-sistecredito">Abrir</button></article>
    </div>
    <section class="panel"><div class="panel-head"><h3>Reportes especializados</h3></div><div class="filter-row"><label class="input-label">Desde<input class="field" id="parity-from" type="date"></label><label class="input-label">Hasta<input class="field" id="parity-to" type="date"></label><label class="input-label">Local<select class="field" id="parity-local"><option value="">Todos</option>${stores}</select></label><label class="input-label">Vendedor<input class="field" id="parity-vendedor"></label><label class="input-label">Método de pago<input class="field" id="parity-method"></label></div><div class="quick-actions">
      ${['disponibilidad','inventario-bajo','sistecredito','gastos','gasolina','historial-empleado'].map(report => `<button class="outline" data-action="parity-report" data-report="${report}">${report.replaceAll('-', ' ')}</button>`).join('')}
    </div></section>
    <template id="parity-stores">${stores}</template>`);
}

export function payrollModal(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  return `<div class="modal-backdrop"><form class="modal" id="parity-payroll-form"><button type="button" class="modal-close">x</button><p class="eyebrow">NOMINA</p><h2>Calcular nómina</h2><label class="input-label">Fecha inicial<input class="field" name="start" type="date" required></label><label class="input-label">Fecha final<input class="field" name="end" type="date" required></label><label class="input-label">Local<select class="field" name="local" required>${stores}</select></label><label class="input-label">Comisión decimal<input class="field" name="rate" type="number" min="0" step="0.001" value="0"></label><label class="input-label">Empleados JSON<textarea class="field" name="employees" placeholder='[{"empleado":"Nombre","salario_base":0}]'></textarea></label><div class="quick-actions"><button class="outline" type="button" data-action="parity-payroll-preview">Previsualizar</button><button class="primary" type="submit">Cerrar nómina</button></div><div data-parity-result></div></form></div>`;
}

export function countModal(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  const products = (data.products || []).slice(0, 100).map(product => `<div class="count-row" data-count-product="${product.code || product.id}" data-count-description="${product.name || ''}"><span>${product.name || product.id}</span><small>${product.code || product.id}</small><input class="field" data-count-physical type="number" min="0" value="0" aria-label="Cantidad física"></div>`).join('');
  return `<div class="modal-backdrop"><form class="modal" id="parity-count-form"><button type="button" class="modal-close">x</button><p class="eyebrow">INVENTARIO</p><h2>Conteo físico</h2><label class="input-label">Local<select class="field" name="local" required>${stores}</select></label><section class="count-list"><div class="panel-head"><h3>Productos a contar</h3><span class="muted">Captura la cantidad física</span></div>${products || '<p class="muted">No hay productos cargados.</p>'}</section><button class="primary wide">Crear sesión</button><div data-parity-result></div></form></div>`;
}

export function sistecreditoModal(data = {}) {
  const stores = (data.stores || []).map(item => `<option value="${item.name || item.id}">${item.name || item.id}</option>`).join('');
  return `<div class="modal-backdrop"><form class="modal" id="parity-sistecredito-form"><button type="button" class="modal-close">x</button><p class="eyebrow">SISTECREDITO</p><h2>Registrar operación</h2><label class="input-label">Vendedor<input class="field" name="vendedor" required></label><label class="input-label">Local<select class="field" name="local">${stores}</select></label><label class="input-label">Valor<input class="field" name="amount" type="number" min="1" required></label><button class="primary wide">Guardar</button><div data-parity-result></div></form></div>`;
}

export function payrollConfigModal() {
  return `<div class="modal-backdrop"><form class="modal" id="parity-payroll-config-form"><button type="button" class="modal-close">x</button><p class="eyebrow">NOMINA</p><h2>Configuración</h2><label class="input-label">Tipo de registro<select class="field" name="kind"><option value="parameter">Parámetro</option><option value="employee">Empleado</option><option value="product">Producto comisionable</option></select></label><label class="input-label">Nombre / producto<input class="field" name="name" required></label><label class="input-label">Identificador / código<input class="field" name="identifier" required></label><label class="input-label">Valor / salario / comisión<input class="field" name="value" type="number" min="0" step="0.001" value="0"></label><label class="input-label">Local<input class="field" name="local"></label><button class="primary wide">Guardar configuración</button><div data-parity-result></div></form></div>`;
}

export function formatParityResult(payload) {
  const employees = payload.employees || payload.items || [];
  return employees.length ? table(['Empleado','Ventas','Comision','Neto','Estado'], employees.map(item => `<tr><td>${item.empleado || item.vendedor || item.cliente || '-'}</td><td>${money(item.ventas_comisionables || item.valor || 0)}</td><td>${money(item.comision || 0)}</td><td>${money(item.neto || item.valor || 0)}</td><td>${badge(item.estado || payload.status || 'OK')}</td></tr>`)) : `<p class="muted">Operacion completada: ${payload.status || payload.id || 'OK'}.</p>`;
}
