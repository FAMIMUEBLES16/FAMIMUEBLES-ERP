import { page, table, badge } from '../components/tables.js';

function normalizeUserName(user) {
  const displayName = user?.displayName || user?.display_name || user?.name || user?.nombre || user?.empleado || user?.fullName || user?.full_name;
  if (displayName) return displayName;
  const username = user?.username || user?.usuario;
  const telegramAccount = String(username || '').match(/^telegram_(\d+)$/i);
  if (telegramAccount) return `Usuario Telegram ${telegramAccount[1]}`;
  const fallback = user?.id_telegram || user?.idTelegram || user?.id;
  if (fallback) return `Usuario ${String(fallback)}`;
  return username || 'Usuario sin identificación';
}

function normalizeRole(user) {
  return String(user?.role || user?.rol || 'VENDEDOR').toUpperCase();
}

function isUserActive(user) {
  const affirmativeValues = new Set([true, 1, '1', 'si', 'sí', 'yes', 'y', 'activo', 'activa', 'active', 'enabled', 'habilitado', 'habilitada', 'on']);
  const inactiveValues = new Set([false, 0, '0', 'false', 'no', 'n', 'off', 'inactivo', 'inactiva', 'inactive', 'desactivado', 'desactivada', 'disabled', 'suspendido', 'suspendida']);

  for (const candidate of [user?.active, user?.activo, user?.enabled, user?.habilitado, user?.status, user?.estado]) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const normalized = typeof candidate === 'string' ? candidate.trim().toLowerCase() : candidate;
    if (affirmativeValues.has(normalized)) return true;
    if (inactiveValues.has(normalized)) return false;
  }

  const fallback = String(user?.status || user?.estado || '').trim().toLowerCase();
  return !inactiveValues.has(fallback) && fallback !== 'false' && fallback !== '0';
}

function normalizeDocument(user) {
  return user?.document || user?.documento || user?.cedula || user?.nit || 'Sin documento';
}

function normalizeIdentity(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function telegramIdFromUser(user, source) {
  const explicitId = user?.telegramId || user?.telegram_id || user?.id_telegram || user?.idTelegram;
  if (explicitId) return String(explicitId).trim();
  const generatedUsername = String(user?.username || user?.usuario || '').match(/^telegram_(\d+)$/i);
  if (generatedUsername) return generatedUsername[1];
  return source === 'employee' ? String(user?.id || '').trim() : '';
}

function accountQuality(user) {
  const generatedUsername = /^telegram_\d+$/i.test(String(user?.username || user?.usuario || ''));
  return Number(!generatedUsername) * 8
    + Number(Boolean(user?.displayName || user?.display_name)) * 4
    + Number(Boolean(user?.email || user?.correo)) * 2
    + Number(Boolean(user?.phone || user?.telefono));
}

function isSyntheticTelegramAccount(user) {
  return /^telegram_\d+$/i.test(String(user?.username || user?.usuario || ''))
    && !user?.displayName
    && !user?.display_name
    && !user?.email
    && !user?.correo
    && !user?.phone
    && !user?.telefono;
}

export function mergeUserSources(employeeItems, authItems) {
  const employees = new Map();
  for (const item of Array.isArray(employeeItems) ? employeeItems : []) {
    const telegramId = telegramIdFromUser(item, 'employee');
    const name = String(item?.displayName || item?.display_name || item?.name || item?.nombre || item?.empleado || '').trim();
    const key = telegramId ? `telegram:${telegramId}` : `name:${normalizeIdentity(name)}`;
    if (!key || key === 'name:') continue;
    const previous = employees.get(key);
    const sourcePriority = item?.appSource === 'administradores' ? 2 : 1;
    const previousPriority = previous?.appSource === 'administradores' ? 2 : 1;
    if (!previous || sourcePriority >= previousPriority) {
      employees.set(key, { ...previous, ...item, telegramId: telegramId || previous?.telegramId, name: name || previous?.name });
    }
  }

  const accounts = (Array.isArray(authItems) ? authItems : []).map(item => ({
    ...item,
    telegramId: telegramIdFromUser(item, 'auth'),
  }));
  const accountsByTelegram = new Map();
  const accountsByName = new Map();
  for (const account of accounts) {
    if (account.telegramId) {
      const candidates = accountsByTelegram.get(account.telegramId) || [];
      candidates.push(account);
      accountsByTelegram.set(account.telegramId, candidates);
    }
    if (!/^telegram_\d+$/i.test(String(account.username || account.usuario || ''))) {
      const identity = normalizeIdentity(account.displayName || account.display_name || account.name || account.username || account.usuario);
      if (identity) {
        const candidates = accountsByName.get(identity) || [];
        candidates.push(account);
        accountsByName.set(identity, candidates);
      }
    }
  }

  const matchedAccounts = new Set();
  const merged = [...employees.values()].map(employee => {
    const candidates = new Set(accountsByTelegram.get(employee.telegramId) || []);
    const nameIdentity = normalizeIdentity(employee.name);
    const namedAccounts = accountsByName.get(nameIdentity) || [];
    if (namedAccounts.length === 1) candidates.add(namedAccounts[0]);
    const selectedAccount = [...candidates].sort((left, right) => accountQuality(right) - accountQuality(left))[0];
    candidates.forEach(account => matchedAccounts.add(account));
    if (!selectedAccount) {
      return { ...employee, id: employee.id || employee.telegramId, managedAccount: false };
    }
    if (isSyntheticTelegramAccount(selectedAccount)) {
      return {
        ...employee,
        id: selectedAccount.id,
        authAccountId: selectedAccount.id,
        username: selectedAccount.username || selectedAccount.usuario,
        managedAccount: false,
      };
    }
    return {
      ...employee,
      ...selectedAccount,
      id: selectedAccount.id,
      telegramId: employee.telegramId || selectedAccount.telegramId,
      id_telegram: employee.telegramId || selectedAccount.telegramId,
      name: employee.name || selectedAccount.displayName || selectedAccount.username,
      displayName: employee.name || selectedAccount.displayName || selectedAccount.username,
      email: employee.email || employee.correo || selectedAccount.email || selectedAccount.correo || '',
      phone: employee.phone || employee.telefono || selectedAccount.phone || selectedAccount.telefono || '',
      role: employee.role || employee.rol || selectedAccount.role || selectedAccount.rol || 'VENDEDOR',
      active: isUserActive(employee),
      status: isUserActive(employee) ? 'Activo' : 'Inactivo',
      storeId: employee.storeId || employee.local_asignado || selectedAccount.storeId || '',
      appSource: employee.appSource,
      managedAccount: true,
    };
  });

  accounts.filter(account => !matchedAccounts.has(account)).forEach(account => {
    if (isSyntheticTelegramAccount(account)) return;
    merged.push({ ...account, managedAccount: true });
  });
  return merged;
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
    const actions = `<button class="table-action" data-action="edit-user" data-user-id="${userId}">Editar</button>
        <button class="table-action" data-action="user-permissions" data-user-id="${userId}">Permisos</button>
        <button class="table-action" data-action="toggle-user-active" data-user-id="${userId}" data-active="${active ? 'true' : 'false'}">${active ? 'Desactivar' : 'Activar'}</button>`;
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
