import { page, table, badge } from '../components/tables.js';

function normalizeUserName(user) {
  return user?.name || user?.username || user?.nombre || user?.usuario || user?.empleado || 'Usuario sin nombre';
}

function normalizeRole(user) {
  return String(user?.role || user?.rol || 'VENDEDOR').toUpperCase();
}

function normalizeStatus(user) {
  const active = user?.active === true || user?.active === 1 || user?.active === '1' || user?.active === 'true' || String(user?.status || '').toUpperCase() === 'ACTIVO';
  return active ? 'Activo' : 'Inactivo';
}

function normalizeDocument(user) {
  return user?.document || user?.documento || user?.cedula || user?.nit || 'Sin documento';
}

export function renderUsuarios(state) {
  const users = Array.isArray(state?.users) ? state.users : [];
  if (!users.length) {
    return page('ADMINISTRACION', 'Usuarios y permisos', '<button class="primary" data-action="new-user">＋ Nuevo usuario</button>', `<div class="settings-grid"><section class="panel"><h3>Usuarios</h3><p class="muted">No hay usuarios cargados en esta empresa.</p></section></div>`);
  }

  const rows = users.map(user => {
    const active = user.active !== false && user.active !== 0 && user.active !== '0' && String(user.status || '').toUpperCase() !== 'INACTIVO';
    const rowStatus = active ? 'Activo' : 'Inactivo';
    const rowName = normalizeUserName(user);
    const contactEmail = user.email || user.correo || '-';
    const contactPhone = user.phone || user.telefono || '-';
    const document = normalizeDocument(user);
    return `<tr>
      <td><strong>${rowName}</strong></td>
      <td>${contactEmail}</td>
      <td>${contactPhone}</td>
      <td>${document}</td>
      <td>${normalizeRole(user)}</td>
      <td>${badge(rowStatus)}</td>
      <td>
        <div class="table-actions compact">
          <button class="table-action" data-action="view-user" data-user-id="${user.id || user.id_telegram || user.idTelegram || ''}">Ver</button>
          <button class="table-action" data-action="edit-user" data-user-id="${user.id || user.id_telegram || user.idTelegram || ''}">Editar</button>
          <button class="table-action" data-action="user-permissions" data-user-id="${user.id || user.id_telegram || user.idTelegram || ''}">Permisos</button>
          <button class="table-action" data-action="toggle-user-active" data-user-id="${user.id || user.id_telegram || user.idTelegram || ''}" data-active="${active ? 'true' : 'false'}">${active ? 'Desactivar' : 'Activar'}</button>
        </div>
      </td>
    </tr>`;
  });

  return page('ADMINISTRACION', 'Usuarios y permisos', '<button class="primary" data-action="new-user">＋ Nuevo usuario</button>', `<div class="settings-grid">
    <section class="panel">
      <h3>Usuarios</h3>
      ${table(['Usuario','Correo','Telefono','Documento','Rol','Estado','Acciones'], rows)}
    </section>
  </div>`);
}
