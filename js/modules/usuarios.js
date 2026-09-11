import { page, table, badge } from '../components/tables.js';
export function renderUsuarios(state) {
  const rows = (state.users || []).map(user => {
    const active = String(user.active ?? user.status ?? 'Activo') !== 'false' && String(user.status ?? '').toLowerCase() !== 'inactivo';
    const userStatus = String(user.active === false || String(user.status || '').toLowerCase() === 'inactivo' ? 'Inactivo' : 'Activo');
    const displayName = user.name || user.username || user.email || 'Usuario sin nombre';
    return `<tr>
      <td><strong>${displayName}</strong></td>
      <td>${user.email || user.correo || '-'}</td>
      <td>${user.phone || user.telefono || '-'}</td>
      <td>${user.document || user.documento || user.documento_identidad || '-'}</td>
      <td>${user.role || user.rol || 'VENDEDOR'}</td>
      <td>${badge(userStatus)}</td>
      <td>
        <button class="table-action" data-action="view-user" data-user-id="${user.id}">Ver</button>
        <button class="table-action" data-action="edit-user" data-user-id="${user.id}">Editar</button>
        <button class="table-action" data-action="toggle-user" data-user-id="${user.id}">${active ? 'Desactivar' : 'Activar'}</button>
        <button class="table-action" data-action="user-permissions" data-user-id="${user.id}">Permisos</button>
      </td>
    </tr>`;
  }).join('');
  return page('ADMINISTRACION','Usuarios y permisos', '<button class="primary" data-action="new-user">＋ Nuevo usuario</button>', `<div class="settings-grid"><section class="panel"><h3>Usuarios</h3>${table(['Usuario','Correo','Telefono','Documento','Rol','Estado','Acciones'], rows)}</section><section class="panel"><h3>Permisos granulares</h3><p class="muted">Selecciona Permisos junto a un usuario para configurar sus accesos.</p></section></div>`);
}
