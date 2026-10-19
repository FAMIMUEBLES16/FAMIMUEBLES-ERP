import assert from 'node:assert/strict';
import { renderAuditoria, resetAuditFilters, setAuditFilters } from '../js/modules/auditoria.js';

const html = renderAuditoria({
  products: [],
  stores: [{ id: 'LOC-1', name: 'Local Norte' }],
  users: [{ id: 'USR-1', name: 'Ana', telegramId: '12345' }],
  inventoryMovements: [
    { id: 31, fecha: '2026-10-05', tipo: 'AJUSTE', local_origen: 'LOC-1', productId: 'P-1', quantity: 2 },
    { id: 32, fecha: '2026-10-04', tipo: 'VENTA', local_origen: 'LOC-1', productId: 'P-2', quantity: 1 },
  ],
  sistecredito: [
    { id: 17, fecha: '2026-10-05', vendedor: 'Ana', local: 'LOC-1', valor: 150000, metodo_pago: 'Sistecrédito' },
    { id: 18, fecha: '2026-10-04', vendedor: 'Luis', local: 'LOC-1', valor: 80000, metodo_pago: 'Efectivo' },
  ],
  payments: [
    { tipo_abono: 'CREDITO', credito_id: 8, fecha: '2026-10-05', valor_abono: 30000, saldo_anterior: 90000, saldo_nuevo: 60000, usuario: 'Ana' },
    { tipo_abono: 'APARTADO', apartado_id: 4, fecha: '2026-10-05', valor_abono: 20000, saldo_anterior: 50000, saldo_nuevo: 30000, usuario: 'Ana' },
  ],
  auditLog: [{ fecha: '2026-10-05', usuario: 'Ana', id_telegram: '12345', accion: 'AJUSTE', detalle: '<script>alert(1)</script>' }],
  movementEdits: [{ fecha: '2026-10-05', movimiento_id: 31, tipo_movimiento: 'VENTA', campo: 'cantidad', valor_anterior: '1', valor_nuevo: '2', motivo: 'Corrección autorizada', administrador: '12345' }],
});

assert.match(html, /Filtros de Sistecrédito/);
assert.match(html, /150\.000/);
assert.match(html, /Crédito 8/);
assert.match(html, /Apartado 4/);
assert.match(html, /bitácora de Telegram/);
assert.match(html, /Telegram · ID 12345/);
assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
assert.match(html, /Filtros de ediciones de movimientos desde Telegram/);
assert.match(html, /Corrección autorizada/);

const state = {
  products: [],
  stores: [{ id: 'LOC-1', name: 'Local Norte' }],
  users: [{ id: 'USR-1', name: 'Ana', telegramId: '12345' }],
  inventoryMovements: [
    { id: 31, fecha: '2026-10-05', tipo: 'AJUSTE', local_origen: 'LOC-1', productId: 'P-1', quantity: 2 },
    { id: 32, fecha: '2026-10-04', tipo: 'VENTA', local_origen: 'LOC-1', productId: 'P-2', quantity: 1 },
  ],
  sistecredito: [
    { id: 17, fecha: '2026-10-05', vendedor: 'Ana', local: 'LOC-1', valor: 150000, metodo_pago: 'Sistecrédito' },
    { id: 18, fecha: '2026-10-04', vendedor: 'Luis', local: 'LOC-1', valor: 80000, metodo_pago: 'Efectivo' },
  ],
  payments: [
    { tipo_abono: 'CREDITO', credito_id: 8, fecha: '2026-10-05', valor_abono: 30000, saldo_anterior: 90000, saldo_nuevo: 60000, usuario: 'Ana' },
    { tipo_abono: 'APARTADO', apartado_id: 4, fecha: '2026-10-05', valor_abono: 20000, saldo_anterior: 50000, saldo_nuevo: 30000, usuario: 'Ana' },
  ],
  auditLog: [
    { fecha: '2026-10-05', usuario: 'Ana', id_telegram: '12345', accion: 'AJUSTE', detalle: 'Corrección de inventario' },
    { fecha: '2026-10-04', usuario: 'Luis', accion: 'VENTA', detalle: 'Venta registrada' },
  ],
  movementEdits: [
    { fecha: '2026-10-05', movimiento_id: 31, tipo_movimiento: 'VENTA', campo: 'cantidad', valor_anterior: '1', valor_nuevo: '2', motivo: 'Corrección autorizada', administrador: '12345' },
    { fecha: '2026-10-04', movimiento_id: 32, tipo_movimiento: 'TRASLADO', campo: 'local', valor_anterior: 'A', valor_nuevo: 'B', motivo: 'Traslado incorrecto', administrador: '12345' },
  ],
};

const countFor = (html, heading) => html.match(new RegExp(`<h3>${heading}</h3><span class="muted">([^<]+)</span>`))?.[1];
setAuditFilters({ 'movements.type': 'AJUSTE' });
assert.equal(countFor(renderAuditoria(state), 'Filtros de movimientos'), '1 de 2 registros');
setAuditFilters({ 'sistecredito.min': '100000' });
assert.equal(countFor(renderAuditoria(state), 'Filtros de Sistecrédito'), '1 de 2 registros');
setAuditFilters({ 'payments.kind': 'APARTADO' });
assert.equal(countFor(renderAuditoria(state), 'Filtros de abonos a créditos y apartados'), '1 de 2 registros');
setAuditFilters({ 'actions.source': 'Telegram' });
assert.equal(countFor(renderAuditoria(state), 'Filtros de auditoría y bitácora de Telegram'), '1 de 2 registros');
setAuditFilters({ 'edits.type': 'TRASLADO' });
assert.equal(countFor(renderAuditoria(state), 'Filtros de ediciones de movimientos desde Telegram'), '1 de 2 registros');
resetAuditFilters('sistecredito');
assert.equal(countFor(renderAuditoria(state), 'Filtros de Sistecrédito'), '2 de 2 registros');
assert.equal(countFor(renderAuditoria(state), 'Filtros de movimientos'), '1 de 2 registros');
