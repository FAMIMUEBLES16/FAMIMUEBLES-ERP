import { page, table, badge } from '../components/tables.js';

const CENTRAL = 'INV CRR 5 3 26';
const CURRENT_RANGES = new Map([
  ['INVCARTAGENITA:REMISION', 15451],
  ['INVCARTAGENITAII:REMISION', 15401],
  ['INVCRR5317:REMISION', 14051],
  ['INVCRR5326:REMISION', 15801],
  ['INVCRR5556:REMISION', 15701],
  ['INVCRR76A15:REMISION', 15651],
  ['INVMANABLANCA:REMISION', 15551]
]);
const CURRENT_RECEIPT_RANGES = new Set([5651, 5601, 5551, 5501]);
const SENT_RANGES = new Set([15751, 15851]);
const labelType = value => String(value).toUpperCase() === 'RECIBO' ? 'Recibos' : 'Remisiones';
const range = item => `${item.startNumber} - ${item.endNumber}`;
const dateLabel = item => item.historicalDate || String(item.sentAt || '').slice(0, 10) || '-';
const localKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const localLabel = item => item.destinationName || item.storeId || 'Sin local';
const currentRangeKey = item => `${localKey(localLabel(item))}:${String(item.type || 'REMISION').toUpperCase()}`;
const isConfiguredCurrent = item => Number(item.startNumber) === CURRENT_RANGES.get(currentRangeKey(item));
const isExactCurrent = item => String(item.type || '').toUpperCase() === 'REMISION'
  ? isConfiguredCurrent(item)
  : String(item.type || '').toUpperCase() === 'RECIBO' && CURRENT_RECEIPT_RANGES.has(Number(item.startNumber));
const isExactSent = item => String(item.type || '').toUpperCase() === 'REMISION' && SENT_RANGES.has(Number(item.startNumber));
function activeRangeWinner(items = []) {
  const candidates = (items || []).filter(item => {
    const status = String(item.status || '').toUpperCase();
    const current = Number(item.currentNumber ?? item.startNumber ?? 0);
    return status === 'EN_USO' && current > Number(item.startNumber || 0);
  });
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => Number(right.startNumber) - Number(left.startNumber))[0];
}
function isCurrentActiveRange(item, items = []) {
  const sameGroup = items.filter(candidate => localKey(localLabel(candidate)) === localKey(localLabel(item)) && String(candidate.type || '').toUpperCase() === String(item.type || '').toUpperCase());
  const current = activeRangeWinner(sameGroup);
  if (!current) return isConfiguredCurrent(item);
  return Number(item.startNumber) === Number(current.startNumber) && Number(item.endNumber) === Number(current.endNumber);
}
export function normalizeActiveTalonarios(items = []) {
  if (!Array.isArray(items)) return [];
  const groups = new Map();
  for (const item of items) {
    const type = String(item?.type || 'REMISION').toUpperCase();
    const local = localKey(localLabel(item));
    if (!local) continue;
    const key = `${local}:${type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const item of items) {
    const status = String(item.status || '').toUpperCase();
    const isCentral = localKey(localLabel(item)) === localKey(CENTRAL);
    if (isExactCurrent(item)) {
      item.status = 'EN_USO';
    } else if (isExactSent(item)) {
      item.status = 'ENVIADO';
    } else if (status !== 'ALMACENADO' || !isCentral) {
      item.status = 'TERMINADO';
    }
  }
  for (const matches of groups.values()) {
    const started = matches.filter(item => {
      const current = Number(item.currentNumber ?? item.startNumber ?? 0);
      return current > Number(item.startNumber || 0);
    });
    const canonical = started.length ? [...started].sort((left, right) => Number(right.startNumber) - Number(left.startNumber))[0] : null;
    const active = matches.find(item => isExactCurrent(item));
    const nextSent = active
      ? [...matches]
        .filter(item => Number(item.startNumber) > Number(active.startNumber) && ['ENVIADO', 'EN_USO'].includes(String(item.status || '').toUpperCase()))
        .sort((left, right) => Number(left.startNumber) - Number(right.startNumber))[0]
      : null;
    for (const item of matches) {
      const current = Number(item.currentNumber ?? item.startNumber ?? 0);
      const start = Number(item.startNumber || 0);
      const end = Number(item.endNumber || start);
      const status = String(item.status || '').toUpperCase();
      if (isExactCurrent(item)) {
        item.status = 'EN_USO';
        continue;
      }
      if (isExactSent(item)) {
        item.status = 'ENVIADO';
        continue;
      }
      if (active && item.id === active.id && isExactCurrent(item)) {
        item.status = 'EN_USO';
        continue;
      }
      if (nextSent && item.id === nextSent.id && isExactSent(item)) {
        item.status = 'ENVIADO';
        continue;
      }
      if (status !== 'ALMACENADO' || localKey(localLabel(item)) !== localKey(CENTRAL)) {
        item.status = 'TERMINADO';
      }
    }
  }
  return items;
}
const numberLabel = value => Number(value).toLocaleString('es-CO');
const saleNumber = (sale, talonario = null) => {
  const raw = Number(String(sale.invoiceNumber || sale.numero_factura || sale.invoice || '').trim());
  if (!Number.isInteger(raw) || !talonario) return raw;
  if (raw >= Number(talonario.startNumber) && raw <= Number(talonario.endNumber)) return raw;
  const shifted = raw + 10000;
  return shifted >= Number(talonario.startNumber) && shifted <= Number(talonario.endNumber) ? shifted : raw;
};
const saleType = sale => String(sale.documentType || sale.tipo_documento || '').toUpperCase();
const saleStore = sale => String(sale.storeId || sale.local_id || sale.local || sale.storeName || sale.localName || '');
const saleStoreMatches = (sale, talonario) => {
  const saleStores = [saleStore(sale), sale.storeName, sale.localName].filter(Boolean).map(localKey);
  const talonarioStores = [talonario.storeId, talonario.destinationName].filter(Boolean).map(localKey);
  return talonarioStores.some(store => saleStores.includes(store));
};
export function talonarioSalesDocuments(talonario, sales = []) {
  const start = Number(talonario.startNumber);
  const end = Number(talonario.endNumber);
  const type = String(talonario.type || 'REMISION').toUpperCase();
  return sales.filter(sale => {
    const number = saleNumber(sale, talonario);
    const documentType = saleType(sale);
    return Number.isInteger(number) && number >= start && number <= end && (!documentType || documentType === type) && saleStoreMatches(sale, talonario);
  }).map(sale => saleNumber(sale, talonario));
}
export function currentTalonarioNumber(talonario, sales = []) {
  const start = Number(talonario.startNumber);
  const documents = talonarioSalesDocuments(talonario, sales);
  if (documents.length) return Math.max(...documents, start);
  return start - 1;
}
const activeTalonariosFor = (talonario, items) => items.filter(item => ['EN_USO', 'ENVIADO'].includes(String(item.status || '').toUpperCase()) && String(item.type || '').toUpperCase() === String(talonario.type || '').toUpperCase() && localKey(localLabel(item)) === localKey(localLabel(talonario))).sort((left, right) => Number(left.startNumber) - Number(right.startNumber));
const talonarioRemaining = (talonario, sales) => {
  const current = currentTalonarioNumber(talonario, sales);
  const documents = talonarioSalesDocuments(talonario, sales);
  return documents.length ? Math.max(0, Number(talonario.endNumber) - current) : Math.max(0, Number(talonario.endNumber) - Number(talonario.startNumber) + 1);
};
export function missingTalonarioNumbers(talonario, sales = [], justifications = []) {
  const start = Number(talonario.startNumber);
  const end = Number(talonario.endNumber);
  const documents = talonarioSalesDocuments(talonario, sales);
  const baseline = Number(talonario.consecutiveBaseline ?? currentTalonarioNumber(talonario, sales));
  const latest = Math.max(currentTalonarioNumber(talonario, sales), ...documents, start);
  if (latest <= baseline) return [];
  const used = new Set(documents);
  const justified = new Set(justifications.filter(item => String(item.talonarioId)===String(talonario.id) && String(item.status || 'JUSTIFICADA').toUpperCase()==='JUSTIFICADA').map(item => Number(item.number)));
  const missing=[];
  for(let number=Math.max(start, baseline + 1);number<=latest;number+=1)if(!used.has(number)&&!justified.has(number))missing.push(number);
  return missing;
}
let talonarioFilters = { query:'', type:'all', status:'all', store:'all' };
export function setTalonarioFilters(filters) { talonarioFilters = { ...talonarioFilters, ...filters }; }

export function renderTalonariosSummary(state) {
  const talonarios = state?.talonarios || [];
  const active = talonarios.filter(item => String(item.type || '').toUpperCase() === 'REMISION' && isConfiguredCurrent(item) && String(item.status || '').toUpperCase() === 'EN_USO');
  const sales = state?.sales || state?.ventas || [];
  const rows = active
    .sort((left, right) => localLabel(left).localeCompare(localLabel(right), 'es'))
    .map(item => `<div class="dashboard-list-row talonario-summary-row"><span class="talonario-summary-local">${localLabel(item)}</span><span class="talonario-summary-type">${labelType(item.type)}</span><strong>${numberLabel(currentTalonarioNumber(item, sales))} / ${numberLabel(item.endNumber)}</strong></div>`)
    .join('');
  return `<section class="panel dashboard-panel"><div class="panel-head"><div><h3>Talonarios en uso</h3><p class="muted">Consecutivos actuales por local</p></div><a href="#talonarios">Ver talonarios →</a></div><div class="dashboard-list">${rows || '<p class="muted">No hay talonarios en uso.</p>'}</div></section>`;
}

export function renderTalonarios(state) {
  const items = Array.isArray(state?.talonarios) ? state.talonarios : [];
  const stores = state?.stores || [];
  const storeNames = new Map(stores.map(store => [String(store.id), store.name || store.id]));
  const filteredItems = items.filter(item => {
    const type = String(item.type || '').toUpperCase();
    const status = String(item.status || '').toUpperCase();
    const store = String(item.destinationName || item.storeId || '');
    const haystack = `${dateLabel(item)} ${store} ${type} ${item.startNumber || ''} ${item.endNumber || ''}`.toLowerCase();
    return (!talonarioFilters.query || haystack.includes(talonarioFilters.query.toLowerCase())) && (talonarioFilters.type === 'all' || type === talonarioFilters.type) && (talonarioFilters.status === 'all' || status === talonarioFilters.status) && (talonarioFilters.store === 'all' || store === talonarioFilters.store);
  });
  const central = filteredItems.filter(item => String(item.storeId || CENTRAL) === CENTRAL && String(item.status || 'ALMACENADO') === 'ALMACENADO');
  const activeItems = items.filter(item => String(item.type || '').toUpperCase() === 'REMISION' && isConfiguredCurrent(item) && String(item.status || '').toUpperCase() === 'EN_USO');
  const sales = state?.sales || state?.ventas || [];
  const summaryMap = new Map();
  activeItems.forEach(item => {
    const key = `${localKey(localLabel(item))}:${String(item.type || '').toUpperCase()}`;
    const previous = summaryMap.get(key);
    if (!previous || isCurrentActiveRange(item, items) && !isCurrentActiveRange(previous, items)) summaryMap.set(key, item);
  });
  const justifications = state?.talonarioJustifications || [];
  const summaryRows = [...summaryMap.values()].sort((left, right) => localLabel(left).localeCompare(localLabel(right), 'es') || String(left.type).localeCompare(String(right.type))).map(item => {
    const activeRanges = activeTalonariosFor(item, items);
    const current = currentTalonarioNumber(item, sales);
    const remaining = activeRanges.reduce((total, talonario, index) => total + (index === 0 ? Math.max(0, Number(talonario.endNumber) - currentTalonarioNumber(talonario, sales)) : talonarioRemaining(talonario, sales)), 0);
    const missing = missingTalonarioNumbers(item, sales, justifications);
    const missingHtml = missing.length ? `<div class="talonario-missing-list">${missing.map(number => `<button type="button" class="table-action danger-text" data-action="justify-talonario-number" data-talonario-id="${item.id}" data-talonario-number="${number}">${numberLabel(number)}</button>`).join(' ')}</div>` : '<span class="muted">Ninguna</span>';
    return `<tr class="${missing.length ? 'talonario-row-missing' : ''}"><td><strong>${localLabel(item)}</strong></td><td>${labelType(item.type)}</td><td>${range(item)}</td><td>${current}</td><td><strong>${remaining}</strong></td><td>${missingHtml}</td></tr>`;
  });
  const byStore = new Map();
  filteredItems.filter(item => String(item.storeId || '') !== CENTRAL).forEach(item => {
    const key = String(item.destinationName || item.storeId || 'Sin local');
    if (!byStore.has(key)) byStore.set(key, []);
    byStore.get(key).push(item);
  });
  const centralRows = central.map(item => `<tr><td>${labelType(item.type)}</td><td><strong>${range(item)}</strong></td><td>${item.supplierName || 'MISELANEA PAPELERIA'}</td><td>${badge(item.status || 'ALMACENADO')}</td><td><button class="table-action" data-action="send-talonario" data-talonario-id="${item.id}">Enviar</button></td></tr>`);
  const localRows = filteredItems.filter(item => String(item.status || '').toUpperCase() !== 'ALMACENADO').sort((left, right) => Number(right.startNumber || 0) - Number(left.startNumber || 0)).map(item => { const storeId=String(item.destinationName || item.storeId || 'Sin local'); return `<tr><td>${dateLabel(item)}</td><td>${storeNames.get(storeId) || storeId}</td><td>${labelType(item.type)}</td><td><strong>${range(item)}</strong></td><td>${currentTalonarioNumber(item, sales)}</td><td>${badge(item.status || 'EN_USO')}</td></tr>`; });
  const storeOptions = [...new Set(items.filter(item => String(item.storeId || '') !== CENTRAL).map(item => String(item.destinationName || item.storeId || '')).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'es')).map(store => `<option value="${store}" ${talonarioFilters.store === store ? 'selected' : ''}>${store}</option>`).join('');
  return page('ADMINISTRACION', 'Talonarios', '<button class="primary" data-action="new-talonario">＋ Registrar talonario</button>', `<section class="panel talonarios-summary"><h3>Facturas disponibles por local</h3><p class="muted">Resumen del talonario actualmente en uso.</p>${table(['Local','Tipo','Talonario','Ultima factura','Le quedan','No registradas'], summaryRows.length ? summaryRows : '<tr><td colspan="6" class="muted">No hay talonarios en uso registrados.</td></tr>')}</section><div class="talonarios-filters"><input class="field" data-talonario-filter="query" value="${talonarioFilters.query}" placeholder="Buscar rango o local"><select class="field" data-talonario-filter="type"><option value="all">Todos los tipos</option><option value="REMISION" ${talonarioFilters.type === 'REMISION' ? 'selected' : ''}>Remisiones</option><option value="RECIBO" ${talonarioFilters.type === 'RECIBO' ? 'selected' : ''}>Recibos</option></select><select class="field" data-talonario-filter="store"><option value="all">Todos los locales</option>${storeOptions}</select><select class="field" data-talonario-filter="status"><option value="all">Todos los estados</option><option value="ALMACENADO" ${talonarioFilters.status === 'ALMACENADO' ? 'selected' : ''}>Almacenados</option><option value="EN_USO" ${talonarioFilters.status === 'EN_USO' ? 'selected' : ''}>En uso</option><option value="ENVIADO" ${talonarioFilters.status === 'ENVIADO' ? 'selected' : ''}>Enviados</option><option value="TERMINADO" ${talonarioFilters.status === 'TERMINADO' ? 'selected' : ''}>Terminados</option></select></div><div class="talonarios-layout">
    <section class="panel"><h3>Historial por local</h3><p class="muted">Los consecutivos mas recientes aparecen primero.</p><div class="talonarios-history-scroll">${table(['Fecha','Local','Tipo','Rango','Usando','Estado'], localRows.length ? localRows : '<tr><td colspan="6" class="muted">Aun no hay envios registrados.</td></tr>')}</div></section>
    <section class="panel"><h3>Almacen central · ${CENTRAL}</h3><p class="muted">Talonarios disponibles para enviar a los locales.</p>${table(['Tipo','Consecutivo','Proveedor','Estado','Acciones'], centralRows.length ? centralRows : '<tr><td colspan="5" class="muted">No hay talonarios almacenados.</td></tr>')}</section>
  </div>`);
}

export function talonarioModal(state, item = null) {
  const catalogStores = state?.stores || [];
  const centralStore = catalogStores.find(store => String(store.id).trim() === CENTRAL) || { id: CENTRAL, name: CENTRAL };
  const destinationStores = [centralStore, ...catalogStores.filter(store => String(store.id).trim() !== CENTRAL)];
  const stores = destinationStores.map(store => `<option value="${store.id}" ${String(item?.storeId || CENTRAL).trim() === String(store.id).trim() ? 'selected' : ''}>${store.name || store.id}</option>`).join('');
  const nextRemision = (state?.talonarios || []).filter(entry => String(entry.type).toUpperCase() === 'REMISION' && String(entry.storeId || '').trim() === CENTRAL && String(entry.status || '').toUpperCase() === 'ALMACENADO').sort((left, right) => Number(left.startNumber) - Number(right.startNumber))[0];
  const nextRecibo = (state?.talonarios || []).filter(entry => String(entry.type).toUpperCase() === 'RECIBO' && String(entry.storeId || '').trim() === CENTRAL && String(entry.status || '').toUpperCase() === 'ALMACENADO').sort((left, right) => Number(left.startNumber) - Number(right.startNumber))[0];
  const next = item || nextRemision || nextRecibo;
  const nextRange = item ? range(item) : (next ? range(next) : 'Sin talonarios disponibles');
  return `<div class="modal-backdrop"><form class="modal" id="talonario-form" data-talonario-id="${item?.id || ''}"><button type="button" class="modal-close">×</button><p class="eyebrow">ADMINISTRACION</p><h2>${item ? 'Enviar talonario' : 'Registrar talonario'}</h2>
    <label class="input-label">Tipo<select class="field" name="type" required><option value="REMISION" ${item?.type === 'REMISION' ? 'selected' : ''}>Remisiones</option><option value="RECIBO" ${item?.type === 'RECIBO' ? 'selected' : ''}>Recibos</option></select></label>
    <div class="input-label"><span>Proximo talonario disponible</span><strong data-talonario-next>${nextRange}</strong></div>
    <input type="hidden" name="startNumber" value="${next?.startNumber || ''}"><input type="hidden" name="endNumber" value="${next?.endNumber || ''}">
    <label class="input-label">Destino<select class="field" name="destinationStoreId" required>${stores}</select></label>
    <button class="primary wide" ${!item && !next ? 'disabled' : ''}>${item ? 'Registrar envio' : 'Enviar'}</button></form></div>`;
}
