import { page, table, badge } from '../components/tables.js';

function normalizeUserName(user) {
  const displayName = user?.displayName || user?.display_name || user?.name || user?.nombre || user?.empleado;
  if (displayName) return displayName;
  const username = user?.username || user?.usuario;
  return /^telegram_\d+$/i.test(String(username || '')) ? 'Usuario sin nombre' : username || 'Usuario sin nombre';
}

function normalizeRole(user) {
  return String(user?.role || user?.rol || 'VENDEDOR').toUpperCase();
}

function hasManagedAccount(user) {
  return user?.managedAccount === true;
}

function isUserActive(user) {
  const active = user?.active ?? user?.activo;
  if (active !== undefined && active !== null && active !== '') {
    return ![false, 0, '0', 'false', 'inactivo', 'inactive', 'no'].includes(
      typeof active === 'string' ? active.trim().toLowerCase() : active
    );
  }
  return !['inactivo', 'inactive', 'false', '0', 'no'].includes(
    String(user?.status || user?.estado || '').trim().toLowerCase()
  );
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
    const active = isUserActive(user);
    const rowStatus = active ? 'Activo' : 'Inactivo';
    const rowName = normalizeUserName(user);
    const contactEmail = user.email || user.correo || '-';
    const contactPhone = user.phone || user.telefono || '-';
    const document = normalizeDocument(user);
    const userId = user.id || user.id_telegram || user.idTelegram || '';
    const actions = hasManagedAccount(user)
      ? `<button class="table-action" data-action="edit-user" data-user-id="${userId}">Editar</button>
          <button class="table-action" data-action="user-permissions" data-user-id="${userId}">Permisos</button>
          <button class="table-action" data-action="toggle-user-active" data-user-id="${userId}" data-active="${active ? 'true' : 'false'}">${active ? 'Desactivar' : 'Activar'}</button>`
      : '<span class="muted">Sin cuenta de acceso</span>';
    return `<tr>
      <td><strong>${rowName}</strong></td>
      <td>${contactEmail}</td>
      <td>${contactPhone}</td>
      <td>${document}</td>
      <td>${normalizeRole(user)}</td>
      <td>${badge(rowStatus)}</td>
      <td>
        <div class="table-actions compact">
          <button class="table-action" data-action="view-user" data-user-id="${userId}">Ver</button>
          ${actions}
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
