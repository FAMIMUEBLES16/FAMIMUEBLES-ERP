import assert from 'node:assert/strict';
import { renderDescansos } from '../js/modules/descansos.js';

globalThis.localStorage = { getItem: () => '{"role":"ADMINISTRADOR"}' };

const html = renderDescansos({
  users: [
    { id: '123456', nombre: 'Vendedor activo', activo: 'SI' },
    { id_telegram: '234567', nombre: 'Activo por estado', estado: 'ACTIVO' },
    { telegram_id: '345678', nombre: 'Desactivado por estado', estado: 'Desactivado' },
    { telegramId: '456789', displayName: 'Desactivada por flag', active: ' FALSE ' },
    { idTelegram: '567890', name: 'Inactivo por flag', active: 0 },
    { id: '678901', nombre: 'No activo por flag', activo: 'NO' },
    { id: '789012', nombre: 'Administrador', role: 'ADMINISTRADOR' },
  ],
});

assert.match(html, /Vendedores vinculados<\/h3><span class="muted">2 activos<\/span>/);
assert.match(html, /Vendedor activo/);
assert.match(html, /Activo por estado/);
assert.doesNotMatch(html, /Desactivado por estado|Desactivada por flag|Inactivo por flag|No activo por flag|Administrador/);
