import { store } from '../data/store.js?v=20';
import { api } from '../services/api-client.js?v=8';
import { activeTenantId } from '../data/storage.js?v=26';
import { showToast } from '../components/toast.js';
import { page, table, badge } from '../components/tables.js';

const weekdays = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'];
let visibleMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

function escapeHtml(value) {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function telegramId(user) {
  const value = String(user?.telegramId || user?.telegram_id || user?.id_telegram || user?.idTelegram || '').trim();
  if (value) return value;
  const id = String(user?.id || '').trim();
  return /^\d{5,}$/.test(id) ? id : '';
}

function employees(data) {
  return (Array.isArray(data.users) ? data.users : [])
    .filter(user => user && !String(user.role || user.rol || '').toUpperCase().includes('ADMIN'))
    .filter(user => user.active !== false && user.active !== 0 && String(user.status || user.estado || '').toUpperCase() !== 'INACTIVO')
    .map(user => ({
      ...user,
      telegramId: telegramId(user),
      label: String(user.displayName || user.display_name || user.name || user.nombre || user.username || user.id || '').trim(),
    }))
    .filter(user => user.telegramId && user.label)
    .sort((left, right) => left.label.localeCompare(right.label, 'es'));
}

function recordUserIds(item) {
  const ids = Array.isArray(item?.telegramIds) ? item.telegramIds : [];
  const single = item?.telegramId || item?.telegram_id || item?.id_telegram;
  return new Set([...ids, single].filter(Boolean).map(String));
}

function sameLocal(person, selectedStore) {
  if (!selectedStore) return false;
  const personStore = String(person.storeId || person.store_id || person.local_asignado || '').trim().toLowerCase();
  return personStore === String(selectedStore.id || '').trim().toLowerCase()
    || personStore === String(selectedStore.name || '').trim().toLowerCase();
}

function ruleScope(rule) {
  const scope = String(rule.scope || 'SEMANAL').toUpperCase();
  if (scope === 'DIAS_MES') return `Dias ${rule.monthDayStart || 1} al ${rule.monthDayEnd || 31} de cada mes`;
  if (scope === 'FECHAS') return `${rule.startDate || '?'} al ${rule.endDate || '?'}`;
  return 'Todas las semanas';
}

function scheduleSummary(rule) {
  const days = rule?.days && typeof rule.days === 'object' ? rule.days : {};
  const activeDays = Object.entries(days).filter(([, item]) => item?.enabled);
  return activeDays.map(([day, item]) => `${weekdays[Number(day) - 1]?.slice(0, 3) || ''} ${escapeHtml(item.start || '')}-${escapeHtml(item.end || '')}`).join(' · ') || 'Cerrado';
}

function renderCalendar(absences) {
  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const previousMonthDays = new Date(year, month, 0).getDate();
  const today = localDate(new Date());
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    let day;
    let date;
    let outside = false;
    if (index < offset) {
      day = previousMonthDays - offset + index + 1;
      date = localDate(new Date(year, month - 1, day));
      outside = true;
    } else if (index >= offset + daysInMonth) {
      day = index - offset - daysInMonth + 1;
      date = localDate(new Date(year, month + 1, day));
      outside = true;
    } else {
      day = index - offset + 1;
      date = localDate(new Date(year, month, day));
    }

    const events = absences.filter(item => String(item.startDate || '') <= date && String(item.endDate || item.startDate || '') >= date);
    const eventMarkup = events.slice(0, 3).map(item => {
      const illness = String(item.type || '').toUpperCase() === 'ENFERMEDAD';
      const name = item.employeeName || item.name || 'Usuario';
      return `<span class="attendance-event ${illness ? 'illness' : ''}" title="${escapeHtml(name)}">${escapeHtml(name)} · ${illness ? 'Enfermedad' : 'Descanso'}</span>`;
    }).join('');
    const extra = events.length > 3 ? `<span class="muted">+${events.length - 3} mas</span>` : '';
    cells.push(`<button type="button" class="attendance-day ${outside ? 'outside-month' : ''} ${date === today ? 'today' : ''}" data-action="attendance-new-absence" data-date="${date}" aria-label="Registrar ausencia el ${date}"><span class="attendance-day-number">${day}</span>${eventMarkup}${extra}</button>`);
  }
  const headers = weekdays.map(day => `<div class="attendance-weekday">${day}</div>`).join('');
  return `<div class="attendance-calendar-scroll"><div class="attendance-calendar">${headers}${cells.join('')}</div></div>`;
}

export function renderDescansos(data) {
  const user = JSON.parse(localStorage.getItem('famimuebles-user') || '{}');
  if (String(user.role || '').toUpperCase() !== 'ADMINISTRADOR') {
    return page('ADMINISTRACION', 'Descansos y ausencias', '', '<section class="panel"><p>No tienes permiso para administrar horarios o ausencias.</p></section>');
  }

  const people = employees(data);
  const absences = Array.isArray(data.staffAbsences) ? data.staffAbsences : [];
  const schedules = Array.isArray(data.workSchedules) ? data.workSchedules : [];
  const scheduleRows = schedules.map(rule => {
    const storeId = String(rule.storeId || '');
    const assigned = [...recordUserIds(rule)].map(id => people.find(person => person.telegramId === id)?.label).filter(Boolean);
    const selectedOnly = String(rule.assignmentMode || (rule.telegramIds?.length ? 'VENDEDORES' : 'LOCAL')).toUpperCase() === 'VENDEDORES';
    const appliesTo = assigned.length ? assigned.join(', ') : selectedOnly ? 'Vendedores seleccionados' : 'Vendedores del local';
    const storeName = rule.storeName || data.stores?.find(item => String(item.id) === storeId)?.name || storeId;
    return `<tr><td><strong>${escapeHtml(storeName)}</strong></td><td>${escapeHtml(ruleScope(rule))}</td><td>${scheduleSummary(rule)}</td><td>${escapeHtml(appliesTo)}</td><td><button class="table-action" data-action="attendance-edit-rule" data-id="${escapeHtml(rule.id || '')}">Editar</button><button class="table-action danger" data-action="attendance-delete-rule" data-id="${escapeHtml(rule.id || '')}">Eliminar</button></td></tr>`;
  }).join('');
  const monthLabel = visibleMonth.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
  const absenceRows = absences.slice().sort((left, right) => String(left.startDate).localeCompare(String(right.startDate))).map(item => `<tr><td><strong>${escapeHtml(item.employeeName || 'Usuario')}</strong></td><td>${badge(String(item.type || '').toUpperCase() === 'ENFERMEDAD' ? 'ENFERMEDAD' : 'DESCANSO')}</td><td>${escapeHtml(item.startDate || '-')}</td><td>${escapeHtml(item.endDate || item.startDate || '-')}</td><td>${escapeHtml(item.notes || '-')}</td><td><button class="table-action danger" data-action="attendance-delete-absence" data-id="${escapeHtml(item.id || '')}">Eliminar</button></td></tr>`).join('');

  return page('ADMINISTRACION', 'Descansos y ausencias', '<button class="primary" data-action="attendance-new-absence">+ Registrar ausencia</button>', `
    <section class="attendance-toolbar">
      <div class="attendance-month-nav"><button class="outline" type="button" data-action="attendance-month-prev" aria-label="Mes anterior">‹</button><strong>${escapeHtml(monthLabel)}</strong><button class="outline" type="button" data-action="attendance-month-next" aria-label="Mes siguiente">›</button></div>
      <div class="attendance-actions"><button class="outline" type="button" data-action="attendance-new-rule">+ Horario por local</button></div>
    </section>
    <section>${renderCalendar(absences)}</section>
    <section class="panel attendance-section"><div class="panel-head"><h3>Horarios por local</h3><span class="muted">Hora Colombia · ${schedules.length} reglas</span></div><p class="attendance-note">Las reglas de fechas y dias del mes prevalecen sobre las semanales. Si no hay una regla aplicable, el bot queda bloqueado.</p>${table(['Local', 'Vigencia', 'Horario', 'Vendedores', 'Acciones'], scheduleRows || '<tr><td colspan="5" class="muted">No hay horarios configurados.</td></tr>')}</section>
    <section class="panel attendance-section"><div class="panel-head"><h3>Vendedores vinculados</h3><span class="muted">${people.length} activos</span></div>${people.length ? table(['Vendedor', 'Telegram', 'Local asignado'], people.map(person => `<tr><td><strong>${escapeHtml(person.label)}</strong></td><td>${escapeHtml(person.telegramId)}</td><td>${escapeHtml(person.storeName || person.storeId || person.store_id || person.local_asignado || 'Selecciona local y vendedor al crear su horario')}</td></tr>`).join('')) : '<p class="muted">No hay vendedores activos registrados.</p>'}</section>
    <section class="panel attendance-section"><div class="panel-head"><h3>Ausencias registradas</h3><span class="muted">${absences.length} registros</span></div>${table(['Vendedor', 'Tipo', 'Desde', 'Hasta', 'Observaciones', ''], absenceRows || '<tr><td colspan="6" class="muted">No hay ausencias registradas.</td></tr>')}</section>
  `);
}

function closeModal() {
  const root = document.querySelector('#modal-root');
  if (root) root.innerHTML = '';
}

function rerender() {
  window.dispatchEvent(new Event('hashchange'));
}

function currentActor() {
  const user = JSON.parse(localStorage.getItem('famimuebles-user') || '{}');
  return String(user.displayName || user.username || user.email || user.id || 'Administrador');
}

function toggleScopeFields(form) {
  form.querySelectorAll('[data-scope-fields]').forEach(section => {
    section.hidden = section.dataset.scopeFields !== form.elements.scope.value;
  });
}

function toggleAssignmentFields(form, data) {
  const localWide = form.elements.assignmentMode.value === 'LOCAL';
  form.querySelector('[data-attendance-assignees]').hidden = localWide;
  form.elements.telegramIds.disabled = localWide;
  const selectedStore = data.stores.find(item => String(item.id) === String(form.elements.storeId.value));
  const assignedCount = employees(data).filter(person => sameLocal(person, selectedStore)).length;
  form.querySelector('[data-assignment-help]').textContent = localWide
    ? assignedCount ? `Se aplicara a los ${assignedCount} vendedores asignados a este local.` : 'No hay vendedores asignados a este local. Asignalos en Usuarios o elige vendedores individuales.'
    : 'Para un horario individual, selecciona uno o varios vendedores.';
}

function openAbsenceModal(data, date = localDate(new Date())) {
  const people = employees(data);
  if (!people.length) {
    showToast('No hay usuarios activos vinculados a Telegram.', 'error');
    return;
  }
  const root = document.querySelector('#modal-root');
  const options = people.map(person => `<option value="${escapeHtml(person.telegramId)}">${escapeHtml(person.label)}</option>`).join('');
  root.innerHTML = `<div class="modal-backdrop"><form class="modal" id="attendance-absence-form"><button type="button" class="modal-close" aria-label="Cerrar">×</button><p class="eyebrow">ADMINISTRACION</p><h2>Registrar ausencia</h2><label class="input-label">Vendedor<select class="field" name="telegramId" required>${options}</select></label><label class="input-label">Tipo<select class="field" name="type"><option value="DESCANSO">Dia de descanso</option><option value="ENFERMEDAD">Enfermedad</option></select></label><label class="input-label">Desde<input class="field" type="date" name="startDate" value="${escapeHtml(date)}" required></label><label class="input-label">Hasta<input class="field" type="date" name="endDate" value="${escapeHtml(date)}" required></label><label class="input-label">Observaciones<textarea class="field" name="notes" rows="3" maxlength="500"></textarea></label><p class="danger-text" data-attendance-error></p><button class="primary wide">Guardar ausencia</button></form></div>`;
  root.querySelector('.modal-close').onclick = closeModal;
  root.querySelector('#attendance-absence-form').onsubmit = saveAbsence;
}

function openScheduleModal(data, ruleId = '') {
  const people = employees(data);
  const stores = Array.isArray(data.stores) ? data.stores : [];
  if (!stores.length || !people.length) {
    showToast(!stores.length ? 'No hay locales cargados en el ERP.' : 'No hay vendedores activos disponibles.', 'error');
    return;
  }
  const schedules = Array.isArray(data.workSchedules) ? data.workSchedules : [];
  const rule = schedules.find(item => String(item.id) === String(ruleId));
  const selectedStore = stores.find(item => String(item.id) === String(rule?.storeId)) || stores[0];
  const assignmentMode = String(rule?.assignmentMode || (rule?.telegramIds?.length ? 'VENDEDORES' : 'LOCAL')).toUpperCase();
  const assignedCount = people.filter(person => sameLocal(person, selectedStore)).length;
  const selectedIds = new Set(Array.isArray(rule?.telegramIds) ? rule.telegramIds.map(String) : people.filter(person => sameLocal(person, selectedStore)).map(person => person.telegramId));
  const storeOptions = stores.map(item => `<option value="${escapeHtml(item.id)}" ${String(item.id) === String(selectedStore.id) ? 'selected' : ''}>${escapeHtml(item.name || item.id)}</option>`).join('');
  const peopleOptions = people.map(person => `<option value="${escapeHtml(person.telegramId)}" ${selectedIds.has(person.telegramId) ? 'selected' : ''}>${escapeHtml(person.label)}${person.storeId ? ` · ${escapeHtml(person.storeId)}` : ''}</option>`).join('');
  const days = rule?.days || {};
  const dayFields = weekdays.map((day, index) => {
    const number = index + 1;
    const value = days[String(number)] || {};
    return `<div class="attendance-day-fields"><label><input type="checkbox" name="enabled-${number}" ${value.enabled ? 'checked' : ''}>${day}</label><input class="field" type="time" name="start-${number}" value="${escapeHtml(value.start || '09:00')}" aria-label="Inicio ${day}"><input class="field" type="time" name="end-${number}" value="${escapeHtml(value.end || '18:00')}" aria-label="Fin ${day}"></div>`;
  }).join('');
  const scope = String(rule?.scope || 'SEMANAL').toUpperCase();
  const root = document.querySelector('#modal-root');
  root.innerHTML = `<div class="modal-backdrop"><form class="modal" id="attendance-schedule-form"><button type="button" class="modal-close" aria-label="Cerrar">×</button><p class="eyebrow">ADMINISTRACION</p><h2>${rule ? 'Editar' : 'Crear'} horario por local o vendedor</h2><label class="input-label">Local<select class="field" name="storeId" required>${storeOptions}</select></label><label class="input-label">Aplicar a<select class="field" name="assignmentMode"><option value="LOCAL" ${assignmentMode === 'LOCAL' ? 'selected' : ''}>Todos los vendedores del local</option><option value="VENDEDORES" ${assignmentMode === 'VENDEDORES' ? 'selected' : ''}>Vendedores seleccionados (horario individual)</option></select></label><small class="muted" data-assignment-help>${assignmentMode === 'LOCAL' ? assignedCount ? `Se aplicara a los ${assignedCount} vendedores asignados a este local.` : 'No hay vendedores asignados a este local. Asignalos en Usuarios o elige vendedores individuales.' : 'Para un horario individual, selecciona uno o varios vendedores.'}</small><div data-attendance-assignees><label class="input-label">Vendedores<select class="field" name="telegramIds" multiple size="6">${peopleOptions}</select></label></div><label class="input-label">Vigencia<select class="field" name="scope"><option value="SEMANAL" ${scope === 'SEMANAL' ? 'selected' : ''}>Todas las semanas</option><option value="DIAS_MES" ${scope === 'DIAS_MES' ? 'selected' : ''}>Dias del mes</option><option value="FECHAS" ${scope === 'FECHAS' ? 'selected' : ''}>Rango de fechas</option></select></label><div data-scope-fields="DIAS_MES" ${scope !== 'DIAS_MES' ? 'hidden' : ''}><div class="attendance-date-fields"><label class="input-label">Dia inicial<input class="field" type="number" name="monthDayStart" min="1" max="31" value="${escapeHtml(rule?.monthDayStart || '1')}"></label><label class="input-label">Dia final<input class="field" type="number" name="monthDayEnd" min="1" max="31" value="${escapeHtml(rule?.monthDayEnd || '31')}"></label></div></div><div data-scope-fields="FECHAS" ${scope !== 'FECHAS' ? 'hidden' : ''}><div class="attendance-date-fields"><label class="input-label">Desde<input class="field" type="date" name="startDate" value="${escapeHtml(rule?.startDate || '')}"></label><label class="input-label">Hasta<input class="field" type="date" name="endDate" value="${escapeHtml(rule?.endDate || '')}"></label></div></div><fieldset class="attendance-day-fieldset"><legend>Jornada semanal</legend>${dayFields}</fieldset><p class="muted">La hora final no se incluye. Los dias sin marcar quedan bloqueados.</p><p class="danger-text" data-attendance-error></p><button class="primary wide">Guardar horario</button></form></div>`;
  const form = root.querySelector('#attendance-schedule-form');
  form.dataset.ruleId = rule?.id || '';
  root.querySelector('.modal-close').onclick = closeModal;
  form.elements.scope.onchange = () => toggleScopeFields(form);
  form.elements.assignmentMode.onchange = () => toggleAssignmentFields(form, data);
  form.elements.storeId.onchange = () => {
    const newStore = stores.find(item => String(item.id) === String(form.elements.storeId.value));
    if (form.elements.assignmentMode.value === 'VENDEDORES') {
      Array.from(form.elements.telegramIds.options).forEach(option => {
        const person = people.find(item => item.telegramId === option.value);
        option.selected = Boolean(person && sameLocal(person, newStore));
      });
    }
    toggleAssignmentFields(form, data);
  };
  toggleAssignmentFields(form, data);
  form.onsubmit = saveSchedule;
}

function writeOptions() {
  const requestId = globalThis.crypto?.randomUUID?.() || `attendance-${Date.now()}-${Math.random()}`;
  return { headers: { 'Idempotency-Key': requestId }, timeout: 30000 };
}

async function saveAttendanceRecord(collection, record) {
  const path = `/api/domain/${collection}`;
  try {
    return await api.post(path, { ...record, tenantId: activeTenantId() }, writeOptions());
  } catch (error) {
    if (error.code !== 'TIMEOUT') throw error;
    const payload = await api.get(path, { headers: { 'X-Tenant-ID': activeTenantId() }, cache: 'no-store', timeout: 30000 });
    const saved = (payload.items || []).find(item => String(item.id) === String(record.id));
    const expectedTimestamp = record.updatedAt || record.createdAt;
    const savedTimestamp = saved?.updatedAt || saved?.createdAt;
    if (saved && expectedTimestamp && savedTimestamp === expectedTimestamp) return { ok: true, item: saved };
    throw error;
  }
}

async function saveAbsence(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const employee = employees(store.collection).find(person => person.telegramId === values.telegramId);
  if (!employee || values.endDate < values.startDate) {
    form.querySelector('[data-attendance-error]').textContent = 'Selecciona un vendedor y un rango de fechas valido.';
    return;
  }
  const record = {
    id: `ABS-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    telegramId: employee.telegramId,
    employeeName: employee.label,
    type: values.type,
    startDate: values.startDate,
    endDate: values.endDate,
    notes: String(values.notes || '').trim(),
    createdBy: currentActor(),
    createdAt: new Date().toISOString(),
  };
  try {
    await saveAttendanceRecord('staffAbsences', record);
    store.collection.staffAbsences = [...(store.collection.staffAbsences || []), record];
    closeModal();
    rerender();
    showToast('Ausencia registrada. El bot aplicara el bloqueo automaticamente.');
  } catch (error) {
    form.querySelector('[data-attendance-error]').textContent = error.message;
  }
}

async function saveSchedule(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = new FormData(form);
  const data = store.collection;
  const people = employees(data);
  const storeId = String(values.get('storeId') || '');
  const selectedStore = (data.stores || []).find(item => String(item.id) === storeId);
  const scope = String(values.get('scope') || 'SEMANAL');
  const assignmentMode = String(values.get('assignmentMode') || 'LOCAL').toUpperCase();
  const selectedIds = Array.from(form.elements.telegramIds.selectedOptions, option => option.value);
  if (!selectedStore) {
    form.querySelector('[data-attendance-error]').textContent = 'Selecciona un local valido.';
    return;
  }
  if (assignmentMode === 'VENDEDORES' && !selectedIds.length) {
    form.querySelector('[data-attendance-error]').textContent = 'Selecciona al menos un vendedor para su horario individual.';
    return;
  }
  const monthDayStart = Number(values.get('monthDayStart'));
  const monthDayEnd = Number(values.get('monthDayEnd'));
  const startDate = String(values.get('startDate') || '');
  const endDate = String(values.get('endDate') || '');
  if (scope === 'DIAS_MES' && (!monthDayStart || !monthDayEnd || monthDayStart > monthDayEnd || monthDayEnd > 31)) {
    form.querySelector('[data-attendance-error]').textContent = 'El rango de dias del mes debe estar entre 1 y 31.';
    return;
  }
  if (scope === 'FECHAS' && (!startDate || !endDate || endDate < startDate)) {
    form.querySelector('[data-attendance-error]').textContent = 'Selecciona un rango de fechas valido.';
    return;
  }
  const days = {};
  for (let number = 1; number <= 7; number += 1) {
    const enabled = values.get(`enabled-${number}`) === 'on';
    const start = String(values.get(`start-${number}`) || '');
    const end = String(values.get(`end-${number}`) || '');
    if (enabled && (!start || !end || start >= end)) {
      form.querySelector('[data-attendance-error]').textContent = `El horario del ${weekdays[number - 1]} debe tener una hora final posterior a la inicial.`;
      return;
    }
    days[String(number)] = { enabled, start, end };
  }
  if (!Object.values(days).some(day => day.enabled)) {
    form.querySelector('[data-attendance-error]').textContent = 'Marca al menos un dia de trabajo.';
    return;
  }
  const previous = (data.workSchedules || []).find(item => String(item.id) === String(form.dataset.ruleId));
  const telegramIds = assignmentMode === 'VENDEDORES' ? selectedIds : [];
  const record = {
    ...(previous || {}),
    id: previous?.id || `WORK-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    storeId,
    storeName: selectedStore.name || storeId,
    assignmentMode,
    telegramIds,
    scope,
    ...(scope === 'DIAS_MES' ? { monthDayStart, monthDayEnd } : {}),
    ...(scope === 'FECHAS' ? { startDate, endDate } : {}),
    days,
    updatedBy: currentActor(),
    updatedAt: new Date().toISOString(),
    createdAt: previous?.createdAt || new Date().toISOString(),
  };
  try {
    await saveAttendanceRecord('workSchedules', record);
    data.workSchedules = [...(data.workSchedules || []).filter(item => String(item.id) !== String(record.id)), record];
    closeModal();
    rerender();
    showToast('Horario por local guardado. El bot lo aplica desde el siguiente mensaje.');
  } catch (error) {
    form.querySelector('[data-attendance-error]').textContent = error.message;
  }
}

document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const data = store.collection;
  const action = button.dataset.action;
  if (action === 'attendance-month-prev' || action === 'attendance-month-next') {
    visibleMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + (action === 'attendance-month-prev' ? -1 : 1), 1);
    rerender();
  } else if (action === 'attendance-new-absence') {
    openAbsenceModal(data, button.dataset.date || localDate(new Date()));
  } else if (action === 'attendance-new-rule') {
    openScheduleModal(data);
  } else if (action === 'attendance-edit-rule') {
    openScheduleModal(data, button.dataset.id || '');
  } else if (action === 'attendance-delete-rule') {
    const id = button.dataset.id;
    if (!id || !window.confirm('Eliminar esta regla de horario?')) return;
    try {
      await api.delete(`/api/domain/workSchedules/${encodeURIComponent(id)}`, { tenantId: activeTenantId() });
      data.workSchedules = (data.workSchedules || []).filter(item => String(item.id) !== String(id));
      rerender();
      showToast('Regla de horario eliminada.');
    } catch (error) {
      showToast(error.message, 'error');
    }
  } else if (action === 'attendance-delete-absence') {
    const id = button.dataset.id;
    if (!id || !window.confirm('Eliminar este registro de ausencia?')) return;
    try {
      await api.delete(`/api/domain/staffAbsences/${encodeURIComponent(id)}`, { tenantId: activeTenantId() });
      data.staffAbsences = (data.staffAbsences || []).filter(item => String(item.id) !== String(id));
      rerender();
      showToast('Registro de ausencia eliminado.');
    } catch (error) {
      showToast(error.message, 'error');
    }
  }
});
