import { page, table, badge } from '../components/tables.js';

const CENTRAL = 'INV CRR 5 3 26';
const labelType = value => String(value).toUpperCase() === 'RECIBO' ? 'Recibos' : 'Remisiones';
const range = item => `${item.startNumber} - ${item.endNumber}`;
const dateLabel = item => item.historicalDate || String(item.sentAt || '').slice(0, 10) || '-';
const localKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const localLabel = item => item.destinationName || item.storeId || 'Sin local';
const numberLabel = value => Number(value).toLocaleString('es-CO');
const saleNumber = sale => Number(String(sale.invoiceNumber || sale.numero_factura || sale.invoice || '').trim());
const saleType = sale => String(sale.documentType || sale.tipo_documento || '').toUpperCase();
const saleStore = sale => String(sale.storeId || sale.local_id || sale.local || sale.storeName || sale.localName || '');
const saleMatchesTalonario = (sale, talonario) => {
  const number = saleNumber(sale);
  const type = saleType(sale);
  const sameStore = localKey(saleStore(sale)) === localKey(talonario.storeId) || localKey(sale.storeName || sale.localName) === localKey(talonario.destinationName);
  return Number.isInteger(number) && number >= Number(talonario.startNumber) && number <= Number(talonario.endNumber) && (!type || type === String(talonario.type || 'REMISION').toUpperCase()) && sameStore;
};
const talonarioProgress = (talonario, sales) => {
  const documents = sales.filter(sale => saleMatchesTalonario(sale, talonario)).map(saleNumber);
  const start = Number(talonario.startNumber);
  const end = Number(talonario.endNumber);
  const storedLast = Number(Object.prototype.hasOwnProperty.call(talonario, 'lastUsedNumber') ? talonario.lastUsedNumber : talonario.currentNumber ?? start - 1);
  const last = documents.length ? Math.max(...documents) : (storedLast >= start && storedLast <= end ? storedLast : start - 1);
  const hasUsage = documents.length > 0 || (storedLast >= start && storedLast <= end);
  const status = last >= end ? 'COMPLETADO' : hasUsage ? 'EN_USO' : 'ENVIADO';
  return { documents, last, lastUsed: hasUsage ? last : null, remaining: Math.max(0, end - last), status };
};
export function missingTalonarioNumbers(talonario, sales = [], justifications = []) {
  const start = Number(talonario.startNumber);
  const end = Number(talonario.endNumber);
  const type = String(talonario.type || 'REMISION').toUpperCase();
  const store = String(talonario.storeId || '');
  const documents = sales.filter(sale => { const number=saleNumber(sale); const documentType=saleType(sale); return Number.isInteger(number) && number>=start && number<=end && (!documentType || documentType===type) && (saleStore(sale)===store || String(sale.storeName || sale.localName || '')===String(talonario.destinationName || '')); }).map(saleNumber);
  const baseline = Number(talonario.consecutiveBaseline ?? talonario.currentNumber ?? start - 1);
  const latest = Math.max(Number(talonario.currentNumber ?? start - 1), ...documents, start - 1);
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
  const items = Array.isArray(state?.talonarios) ? state.talonarios : [];
  const sales = state?.sales || state?.ventas || [];
  const progress = new Map(items.map(item => [String(item.id), talonarioProgress(item, sales)]));
  const activeItems = items.filter(item => talonarioProgress(item, sales).status !== 'COMPLETADO');
  const summaryMap = new Map();
  activeItems.forEach(item => {
    const key = `${localKey(localLabel(item))}:${String(item.type || '').toUpperCase()}`;
    const group = summaryMap.get(key) || [];
    group.push(item);
    summaryMap.set(key, group);
  });
  const summaryRows = [...summaryMap.values()].sort((left, right) => localLabel(left[0]).localeCompare(localLabel(right[0]), 'es') || String(left[0].type).localeCompare(String(right[0].type))).map(group => {
    const item = [...group].sort((left, right) => Number(right.startNumber || 0) - Number(left.startNumber || 0))[0];
    const allLocalItems = items.filter(entry => localKey(localLabel(entry)) === localKey(localLabel(item)) && String(entry.type || '').toUpperCase() === String(item.type || '').toUpperCase());
    const remaining = group.reduce((total, entry) => total + progress.get(String(entry.id)).remaining, 0);
    const usedNumbers = allLocalItems.map(entry => progress.get(String(entry.id)).lastUsed).filter(number => number !== null);
    const lastUsedNumber = usedNumbers.length ? Math.max(...usedNumbers) : Math.max(...allLocalItems.map(entry => progress.get(String(entry.id)).last));
    const missing = missingTalonarioNumbers(item, sales, state?.talonarioJustifications || []);
    const missingHtml = missing.length ? `<div class="talonario-missing-list">${missing.map(number => `<button type="button" class="table-action danger-text" data-action="justify-talonario-number" data-talonario-id="${item.id}" data-talonario-number="${number}">${numberLabel(number)}</button>`).join(' ')}</div>` : '<span class="muted">Ninguna</span>';
    return `<tr><td><strong>${localLabel(item)}</strong></td><td>${labelType(item.type)}</td><td>${range(item)}</td><td>${lastUsedNumber}</td><td><strong>${remaining}</strong></td><td>${missingHtml}</td></tr>`;
  });
  return `<section class="panel dashboard-panel talonarios-summary"><div class="panel-head"><div><h3>Facturas disponibles por local</h3><p class="muted">Resumen del talonario actualmente en uso.</p></div><a href="#talonarios">Ver talonarios →</a></div>${table(['Local','Tipo','Talonario','Ultima factura','Le quedan','No registradas'], summaryRows.length ? summaryRows : '<tr><td colspan="6" class="muted">No hay talonarios en uso registrados.</td></tr>')}</section>`;
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
  const sales = state?.sales || state?.ventas || [];
  const progress = new Map(items.map(item => [String(item.id), talonarioProgress(item, sales)]));
  const byStore = new Map();
  filteredItems.filter(item => String(item.storeId || '') !== CENTRAL).forEach(item => {
    const key = String(item.destinationName || item.storeId || 'Sin local');
    if (!byStore.has(key)) byStore.set(key, []);
    byStore.get(key).push(item);
  });
  const centralRows = central.map(item => `<tr><td>${labelType(item.type)}</td><td><strong>${range(item)}</strong></td><td>${item.supplierName || 'MISELANEA PAPELERIA'}</td><td>${badge(item.status || 'ALMACENADO')}</td><td><button class="table-action" data-action="send-talonario" data-talonario-id="${item.id}">Enviar</button></td></tr>`);
  const localRows = filteredItems.filter(item => { const itemProgress=progress.get(String(item.id)); return String(item.storeId || '') !== CENTRAL || itemProgress.status === 'EN_USO'; }).sort((left, right) => Number(right.startNumber || 0) - Number(left.startNumber || 0)).map(item => { const storeId=String(item.destinationName || item.storeId || 'Sin local'); const itemProgress=progress.get(String(item.id)); return `<tr><td>${dateLabel(item)}</td><td>${storeNames.get(storeId) || storeId}</td><td>${labelType(item.type)}</td><td><strong>${range(item)}</strong></td><td>${itemProgress.last}</td><td>${badge(itemProgress.status)}</td></tr>`; });
  const storeOptions = [...new Set(items.filter(item => String(item.storeId || '') !== CENTRAL).map(item => String(item.destinationName || item.storeId || '')).filter(Boolean))].sort((left, right) => left.localeCompare(right, 'es')).map(store => `<option value="${store}" ${talonarioFilters.store === store ? 'selected' : ''}>${store}</option>`).join('');
  return page('ADMINISTRACION', 'Talonarios', '<button class="primary" data-action="new-talonario">＋ Registrar talonario</button>', `<div class="talonarios-filters"><input class="field" data-talonario-filter="query" value="${talonarioFilters.query}" placeholder="Buscar rango o local"><select class="field" data-talonario-filter="type"><option value="all">Todos los tipos</option><option value="REMISION" ${talonarioFilters.type === 'REMISION' ? 'selected' : ''}>Remisiones</option><option value="RECIBO" ${talonarioFilters.type === 'RECIBO' ? 'selected' : ''}>Recibos</option></select><select class="field" data-talonario-filter="store"><option value="all">Todos los locales</option>${storeOptions}</select><select class="field" data-talonario-filter="status"><option value="all">Todos los estados</option><option value="ALMACENADO" ${talonarioFilters.status === 'ALMACENADO' ? 'selected' : ''}>Almacenados</option><option value="EN_USO" ${talonarioFilters.status === 'EN_USO' ? 'selected' : ''}>En uso</option><option value="ENVIADO" ${talonarioFilters.status === 'ENVIADO' ? 'selected' : ''}>Enviados</option></select></div><div class="talonarios-layout">
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
