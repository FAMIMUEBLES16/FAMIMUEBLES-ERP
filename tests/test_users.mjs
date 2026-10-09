import assert from 'node:assert/strict';
import { employees, isActive, sameLocal } from '../js/modules/descansos.js';
import { mergeUserSources, renderUsuarios } from '../js/modules/usuarios.js';

const mergedUsers = mergeUserSources(
  [
    { id: '561246079', id_telegram: '561246079', name: 'Michael Díaz', role: 'VENDEDOR', active: true, appSource: 'empleados' },
    { id: '561246079', id_telegram: '561246079', name: 'Michael Díaz', role: 'ADMINISTRADOR', active: true, appSource: 'administradores' },
    { id: '8617413305', id_telegram: '8617413305', name: 'Francisco Diaz', email: 'francisco@example.com', phone: '3000000000', role: 'GERENTE', active: true, appSource: 'empleados' },
    { id: '8068789133', id_telegram: '8068789133', name: 'Ivan Díaz', role: 'VENDEDOR', active: false, appSource: 'empleados' },
  ],
  [
    { id: 'AUTH-MICHAEL', username: 'Michael Diaz', email: 'michael@example.com', role: 'ADMINISTRADOR', active: 1 },
    { id: 'AUTH-LEGACY-MICHAEL', username: 'telegram_561246079', role: 'VENDEDOR', active: 1 },
    { id: 'AUTH-FRANCISCO', username: 'telegram_8617413305', role: 'VENDEDOR', active: 1 },
    { id: 'AUTH-IVAN', username: 'telegram_8068789133', role: 'VENDEDOR', active: 1 },
    { id: 'AUTH-ORPHAN', username: 'telegram_9999999999', role: 'VENDEDOR', active: 1 },
  ],
);

assert.equal(mergedUsers.length, 3, 'duplicate employee/admin and synthetic Telegram accounts should collapse into one row per person');
const michael = mergedUsers.find(user => user.telegramId === '561246079');
assert.equal(michael.name, 'Michael Díaz', 'the Telegram employee record should supply the canonical display name');
assert.equal(michael.role, 'ADMINISTRADOR', 'the admin employee record should take precedence over the employee duplicate');
assert.equal(michael.id, 'AUTH-MICHAEL', 'the real login should be preferred to a synthetic Telegram-only account');
assert.equal(michael.email, 'michael@example.com', 'the selected login contact information should be retained');
assert.equal(michael.managedAccount, true, 'the employee row should expose the matched account actions');

const francisco = mergedUsers.find(user => user.telegramId === '8617413305');
assert.equal(francisco.role, 'GERENTE', 'the linked account role should not overwrite the Telegram role');
assert.equal(francisco.id, 'AUTH-FRANCISCO');
assert.equal(francisco.email, 'francisco@example.com', 'employee contact details should be preserved');
assert.equal(francisco.managedAccount, false, 'a synthetic Telegram-only account should not expose real login management actions');
assert.equal(francisco.authAccountId, 'AUTH-FRANCISCO', 'synthetic linked accounts should retain their real account ID for management actions');

const ivan = mergedUsers.find(user => user.telegramId === '8068789133');
assert.equal(ivan.active, false, 'the Telegram active state should be authoritative for the unified row');
assert.equal(ivan.managedAccount, false);

const activeEmployee = { id: 'TOMAS-DIAZ', id_telegram: '912345678', name: 'Tomás Díaz', role: 'VENDEDOR', active: 'Si', status: 'Activo' };
assert.equal(isActive(activeEmployee), true, 'active flags in the real ERP should include affirmative values such as Si');
assert.equal(sameLocal({ storeId: 'INV BODEGA MANABLANCA' }, { id: 'INV BODEGA MANABLANCA', name: 'INV BODEGA MANABLANCA' }), true, 'store aliases should still match after normalizing accents, punctuation, and whitespace');
const attendancePeople = employees({
  users: [
    activeEmployee,
    { id: 'OTHER-1', id_telegram: '987654321', name: 'Ana Gómez', role: 'VENDEDOR', active: 'true' },
    { id: 'OTHER-2', id_telegram: '999999999', name: 'Otro vendedor', role: 'VENDEDOR', active: 'No' },
    { id: 'TOMAS-ADMIN', id_telegram: '123456789', name: 'Tomás Díaz administrador', role: 'ADMINISTRADOR', active: 'Si', storeId: 'INV BODEGA MANABLANCA' },
    { id: 'ADMIN-WITHOUT-STORE', id_telegram: '112233445', name: 'Admin sin local', role: 'ADMINISTRADOR', active: 'Si' },
  ],
});
assert.equal(attendancePeople.some(person => person.label.includes('Tomás Díaz')), true, 'active sellers should remain visible even when their status is stored as a Spanish affirmative value');
assert.equal(attendancePeople.some(person => person.label === 'Tomás Díaz administrador'), true, 'administrators assigned to a local should also be selectable for local schedules');
assert.equal(attendancePeople.some(person => person.label === 'Admin sin local'), false, 'administrators without a local should not be included as sellers in attendance');

const html = renderUsuarios({
  users: [
    { id: 'AUTH-1', managedAccount: true, username: 'ana', active: 0 },
    { id: 'APP-2', id_telegram: 'APP-2', name: 'Usuario inactivo de APP', activo: 'NO' },
    { id: 'AUTH-3', managedAccount: true, username: 'telegram_561246079', displayName: 'María López', active: true },
    { id: 'AUTH-4', managedAccount: true, username: 'telegram_8068789133', active: false },
    { id: 'EMP-1', name: 'Empleado sin acceso', status: 'Activo' },
  ],
});

assert.match(
  html,
  /data-action="toggle-user-active" data-user-id="AUTH-1" data-active="false">Activar/,
  'an inactive account from the API should display the activate action'
);
assert.match(
  html,
  /Empleado sin acceso[\s\S]*?data-action="edit-user" data-user-id="EMP-1"/,
  'employee records without an authentication account should offer an edit action to create access'
);
assert.match(
  html,
  /data-action="user-permissions" data-user-id="EMP-1"/,
  'employee records without an authentication account should expose permissions to start access provisioning'
);
assert.match(
  html,
  /data-action="toggle-user-active" data-user-id="EMP-1"/,
  'employee records without an authentication account should expose an activation/deactivation action'
);
assert.match(
  html,
  /Usuario inactivo de APP[\s\S]*?<span class="badge inactivo">Inactivo<\/span>/,
  'an inactive user supplied by FAMIMUEBLES APP should display as inactive in ERP'
);
assert.match(
  html,
  /María López/,
  'the human-readable display name should take precedence over a generated Telegram username'
);
assert.match(
  html,
  /Usuario Telegram 8068789133/,
  'generated Telegram usernames without a display name should have a usable fallback label'
);
assert.doesNotMatch(html, /Usuario sin nombre/, 'the users list should never display a generic missing-name label');
assert.doesNotMatch(
  html,
  /<strong>telegram_\d+<\/strong>/,
  'generated Telegram usernames should never be shown in the user name column'
);
