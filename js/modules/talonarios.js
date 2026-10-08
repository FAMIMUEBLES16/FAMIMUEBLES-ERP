import { page, table, badge } from '../components/tables.js';

const CENTRAL = 'INV CRR 5 3 26';
const CONFIGURED_RANGES = [
  { local: 'INVCARTAGENITA', aliases: ['CARTAGENITA', 'CARTAGENITA / VITAL'], type: 'REMISION', start: 15451, end: 15500, current: 15496 },
  { local: 'INVCARTAGENITAII', aliases: ['CARTAGENITA II'], type: 'REMISION', start: 15851, end: 15900, current: 15857 },
  { local: 'INVCRR5317', aliases: ['LOCAL ESQUINA'], type: 'REMISION', start: 14051, end: 14100, current: 14100, active: false },
  { local: 'INVCRR5326', aliases: ['CR 5 #3-26', 'CR 5 -3-26'], type: 'REMISION', start: 15801, end: 15850, current: 15821 },
  { local: 'INVCRR5556', aliases: ['CR 5 - 56', 'CR 5 #5 SUR'], type: 'REMISION', start: 15701, end: 15750, current: 15734 },
  { local: 'INVCRR76A15', aliases: ['CR 7 #6A-15'], type: 'REMISION', start: 15651, end: 15700 },
  { local: 'INVMANABLANCA', aliases: ['MANABLANCA', 'LOCAL MANABLANCA'], type: 'REMISION', start: 15751, end: 15800, current: 15791 },
  { local: 'INVCARTAGENITA', aliases: ['CARTAGENITA'], type: 'RECIBO', start: 5551, end: 5600 },
  { local: 'INVCARTAGENITAII', aliases: ['CARTAGENITA II'], type: 'RECIBO', start: 5751, end: 5800 },
  { local: 'INVCRR5317', aliases: [], type: 'RECIBO', start: 5101, end: 5150 },
  { local: 'INVCRR5326', aliases: ['CR 5 #3-26', 'CR 5 -3-26'], type: 'RECIBO', start: 5651, end: 5700 },
  { local: 'INVCRR5556', aliases: ['CR 5 - 56', 'CR 5 #5 SUR'], type: 'RECIBO', start: 5501, end: 5550 },
  { local: 'INVMANABLANCA', aliases: ['MANABLANCA', 'LOCAL MANABLANCA'], type: 'RECIBO', start: 5701, end: 5750 }
];
const CONFIGURED_LOCAL_LABELS = {
  INVCARTAGENITA: 'INV CARTAGENITA',
  INVCARTAGENITAII: 'INV CARTAGENITA II',
  INVCRR5317: 'INV CRR 5 3 17',
  INVCRR5326: 'INV CRR 5 3 26',
  INVCRR5556: 'INV CRR 5 5 56',
  INVCRR76A15: 'INV CRR 7 6A 15',
  INVMANABLANCA: 'INV MANABLANCA'
};
const labelType = value => String(value).toUpperCase() === 'RECIBO' ? 'Recibos' : 'Remisiones';
const range = item => `${item.startNumber} - ${item.endNumber}`;
const dateLabel = item => item.historicalDate || String(item.sentAt || '').slice(0, 10) || '-';
const localKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const localLabel = item => item.destinationName || item.storeId || 'Sin local';
const configuredRangeFor = item => {
  const keys = [item?.storeId, item?.destinationName].map(localKey);
  const type = String(item?.type || 'REMISION').toUpperCase();
  return CONFIGURED_RANGES.find(config => config.type === type && Number(item.startNumber) === config.start && Number(item.endNumber) === config.end)
    || CONFIGURED_RANGES.find(config => config.type === type && [config.local, ...config.aliases.map(localKey)].some(key => keys.includes(key)));
};
const isConfiguredLocal = (item, config) => [item?.storeId, item?.destinationName].map(localKey).some(key => [config.local, ...config.aliases.map(localKey)].includes(key));
const localIdentity = (value, type) => CONFIGURED_RANGES.find(config => config.type === type && [config.local, ...config.aliases.map(localKey)].includes(localKey(value)))?.local || localKey(value);
const isCentralStore = item => {
  if (localKey(String(item?.storeId || item?.destinationName || item?.sentFrom || CENTRAL)) !== localKey(CENTRAL)) return false;
  const status = String(item?.status || '').toUpperCase();
  const hasDestination = Boolean(item?.destinationStoreId && localKey(item.destinationStoreId) !== localKey(CENTRAL));
  const isActiveCentralLocalRange = CONFIGURED_RANGES.some(config => config.type === String(item?.type || 'REMISION').toUpperCase() && Number(item?.startNumber) === config.start && Number(item?.endNumber) === config.end) && status !== 'ALMACENADO' && !item?.historical && !item?.historicalDate;
  return hasDestination || !isActiveCentralLocalRange;
};
const isHistoricalCentralEntry = item => Boolean(item?.historical || item?.historicalDate) && isCentralStore(item);
const localGroupKey = item => `${configuredRangeFor(item)?.local || localKey(localLabel(item))}:${String(item.type || 'REMISION').toUpperCase()}`;
const isConfiguredCurrent = item => {
  const config = configuredRangeFor(item);
  return Boolean(config && !isCentralStore(item) && isConfiguredLocal(item, config) && Number(item.startNumber) === config.start && Number(item.endNumber) === config.end);
};
const isConfiguredCurrentCentral = item => isCentralStore(item) && isConfiguredCurrent(item);
const isExactCurrent = item => isConfiguredCurrent(item);
const hasActualSendEvidence = item => {
  const destination = String(item.destinationStoreId || item.destinationName || item.sentFrom || '').trim();
  const sentAt = String(item.sentAt || '').trim();
  return Boolean(destination && destination !== CENTRAL && sentAt);
};
function activeRangeWinner(items = []) {
  const candidates = (items || []).filter(item => {
    const status = String(item.status || '').toUpperCase();
    const current = Number(item.currentNumber ?? item.startNumber ?? 0);
    return status === 'EN_USO' && current >= Number(item.startNumber || 0);
  });
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => Number(right.startNumber) - Number(left.startNumber))[0];
}
function isCurrentActiveRange(item, items = []) {
  const sameGroup = items.filter(candidate => localGroupKey(candidate) === localGroupKey(item));
  const configuredCurrent = sameGroup.find(candidate => isConfiguredCurrent(candidate));
  if (configuredCurrent) {
    return Number(item.startNumber) === Number(configuredCurrent.startNumber) && Number(item.endNumber) === Number(configuredCurrent.endNumber);
  }
  const current = activeRangeWinner(sameGroup);
  if (!current) return isConfiguredCurrent(item);
  return Number(item.startNumber) === Number(current.startNumber) && Number(item.endNumber) === Number(current.endNumber);
}
export function normalizeActiveTalonarios(items = []) {
  if (!Array.isArray(items)) return [];
  const groups = new Map();
  for (const item of items) {
    const type = String(item?.type || 'REMISION').toUpperCase();
    const local = localGroupKey(item);
    if (!local) continue;
    const key = `${local}:${type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  for (const item of items) {
    const status = String(item.status || '').toUpperCase();
    const current = Number(item.currentNumber ?? item.startNumber ?? 0);
    const start = Number(item.startNumber || 0);
    const isCentral = isCentralStore(item);
    const configured = configuredRangeFor(item);
    if (configured && !isCentral && !isConfiguredLocal(item, configured)) {
      item.storeId = CONFIGURED_LOCAL_LABELS[configured.local] || configured.local;
      item.destinationName = CONFIGURED_LOCAL_LABELS[configured.local] || configured.local;
    }
    if (configured && isConfiguredCurrent(item)) {
      if (configured.current !== undefined) item.currentNumber = Number(configured.current);
      item.status = configured.active === false ? 'TERMINADO' : 'EN_USO';
      continue;
    }
    if (isCentral && ['TERMINADO', 'ENVIADO', 'EN_USO'].includes(status) && !hasActualSendEvidence(item)) {
      if (isConfiguredCurrentCentral(item)) {
        item.status = 'EN_USO';
        item.currentNumber = Math.max(current, start);
        continue;
      }
      if (isHistoricalCentralEntry(item)) {
        item.storeId = CENTRAL;
        item.destinationName = CENTRAL;
        continue;
      }
      item.storeId = CENTRAL;
      item.destinationName = CENTRAL;
      item.status = 'ALMACENADO';
      item.currentNumber = Math.max(current, start);
      continue;
    }
    if (isCentral && status === 'ALMACENADO') {
      continue;
    }
    if (isExactCurrent(item)) {
      item.status = configured?.active === false ? 'TERMINADO' : 'EN_USO';
    } else if (configured && Number(item.startNumber) > configured.start && hasActualSendEvidence(item)) {
      item.status = 'ENVIADO';
    } else if (status === 'ENVIADO' && hasActualSendEvidence(item)) {
      continue;
    } else if (status === 'TERMINADO') {
      continue;
    } else if (status !== 'ALMACENADO' || !isCentral) {
      item.status = 'TERMINADO';
    }
  }
  for (const matches of groups.values()) {
    const configured = matches.map(configuredRangeFor).find(Boolean);
    if (configured) {
      for (const item of matches) {
        const status = String(item.status || '').toUpperCase();
        if (isCentralStore(item) && hasActualSendEvidence(item)) {
          item.status = 'ENVIADO';
          continue;
        }
        if (isCentralStore(item) || status === 'ALMACENADO' || isConfiguredCurrent(item)) continue;
        if (Number(item.startNumber) < configured.start && status === 'EN_USO') item.status = 'TERMINADO';
        if (Number(item.startNumber) > configured.start && status === 'EN_USO') item.status = hasActualSendEvidence(item) ? 'ENVIADO' : 'TERMINADO';
      }
      continue;
    }
    const started = matches.filter(item => {
      const status = String(item.status || '').toUpperCase();
      const current = Number(item.currentNumber ?? item.startNumber ?? 0);
      const start = Number(item.startNumber || 0);
      return status !== 'ALMACENADO' && current >= start && !(isCentralStore(item) && hasActualSendEvidence(item));
    });
    const active = [...started]
      .filter(item => Number(item.currentNumber ?? item.startNumber ?? 0) < Number(item.endNumber || item.startNumber || 0))
      .sort((left, right) => Number(right.startNumber) - Number(left.startNumber))[0]
      || matches.find(item => isExactCurrent(item));
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
      const isCentral = isCentralStore(item);
      const startedInRange = current >= start;
      if (isCentral && hasActualSendEvidence(item)) {
        item.status = 'ENVIADO';
        continue;
      }
      if (isCentral && ['TERMINADO', 'ENVIADO', 'EN_USO'].includes(status) && !hasActualSendEvidence(item)) {
        if (isConfiguredCurrentCentral(item)) {
          item.status = 'EN_USO';
          item.currentNumber = Math.max(current, start);
          continue;
        }
        if (isHistoricalCentralEntry(item)) {
          item.storeId = CENTRAL;
          item.destinationName = CENTRAL;
          continue;
        }
        item.storeId = CENTRAL;
        item.destinationName = CENTRAL;
        item.status = 'ALMACENADO';
        item.currentNumber = Math.max(current, start);
        continue;
      }
      if (isCentral && status === 'ALMACENADO') {
        continue;
      }
      if (active && item.id === active.id) {
        item.status = 'EN_USO';
        continue;
      }
      if (active && Number(item.startNumber) < Number(active.startNumber)) {
        item.status = 'TERMINADO';
        continue;
      }
      if (active && item.id === active.id && isExactCurrent(item)) {
        item.status = 'EN_USO';
        continue;
      }
      if (nextSent && item.id === nextSent.id && status === 'ENVIADO') {
        item.status = 'ENVIADO';
        continue;
      }
      if (startedInRange && current < end) {
        item.status = 'EN_USO';
        continue;
      }
      if (status === 'TERMINADO' || (!isCentral && status !== 'ALMACENADO')) {
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
export function talonarioSalesDocuments(talonario, sales = [], options = {}) {
  const start = Number(talonario.startNumber);
  const end = Number(talonario.endNumber);
  const type = String(talonario.type || 'REMISION').toUpperCase();
  const isCartagenitaIIHistory = type === 'REMISION' && start === 15401 && end === 15450 && localKey(localLabel(talonario)) === localKey('Cartagenita');
  const owner = isCartagenitaIIHistory ? localKey('INV CARTAGENITA II') : localIdentity(localLabel(talonario), type);
  return sales.filter(sale => {
    const number = saleNumber(sale, talonario);
    const documentType = saleType(sale);
    const saleStore = sale.storeId || sale.store || sale.localId || sale.local;
    const sameLocal = options.includeOtherStores === true || !saleStore || localIdentity(saleStore, type) === owner;
    return Number.isInteger(number) && number >= start && number <= end && (!documentType || documentType === type) && sameLocal;
  }).map(sale => saleNumber(sale, talonario));
}
export function deduplicateTalonarioHistory(items = []) {
  const statusPriority = { EN_USO: 3, ENVIADO: 2, TERMINADO: 1 };
  const unique = new Map();
  for (const item of items) {
    const key = `${localGroupKey(item)}:${Number(item.startNumber)}:${Number(item.endNumber)}`;
    const existing = unique.get(key);
    const priority = statusPriority[String(item.status || '').toUpperCase()] || 0;
    const existingPriority = statusPriority[String(existing?.status || '').toUpperCase()] || 0;
    const preferred = isConfiguredCurrent(item) && !item.historical && !item.historicalDate;
    const existingPreferred = existing && isConfiguredCurrent(existing) && !existing.historical && !existing.historicalDate;
    if (!existing || preferred && !existingPreferred || preferred === existingPreferred && (priority > existingPriority || (priority === existingPriority && dateLabel(item) > dateLabel(existing)))) unique.set(key, item);
  }
  return [...unique.values()];
}
export function currentTalonarioNumber(talonario, sales = []) {
  const start = Number(talonario.startNumber);
  const documents = talonarioSalesDocuments(talonario, sales);
  const savedCurrent = Number(talonario.currentNumber ?? start - 1);
  return Math.max(savedCurrent, ...documents, start - 1);
}
export const activeTalonariosFor = (talonario, items) => {
  const matches = items.filter(item => ['EN_USO', 'ENVIADO'].includes(String(item.status || '').toUpperCase()) && localGroupKey(item) === localGroupKey(talonario)).sort((left, right) => Number(left.startNumber) - Number(right.startNumber));
  if (!matches.length) return [];
  const configuredCurrent = matches.find(item => isConfiguredCurrent(item));
  if (configuredCurrent) return [configuredCurrent];
  const activeOnly = matches.filter(item => String(item.status || '').toUpperCase() === 'EN_USO');
  if (activeOnly.length) return [activeOnly[activeOnly.length - 1]];
  return [matches[matches.length - 1]];
};
const talonarioRemaining = (talonario, sales) => {
  const current = currentTalonarioNumber(talonario, sales);
  const documents = talonarioSalesDocuments(talonario, sales);
  return documents.length ? Math.max(0, Number(talonario.endNumber) - current) : Math.max(0, Number(talonario.endNumber) - Number(talonario.startNumber) + 1);
};
export function missingTalonarioNumbers(talonario, sales = [], justifications = []) {
  const start = Number(talonario.startNumber);
  const end = Number(talonario.endNumber);
  const documents = talonarioSalesDocuments(talonario, sales);
  const registeredDocuments = talonarioSalesDocuments(talonario, sales, { includeOtherStores: true });
  const baseline = Number(talonario.consecutiveBaseline ?? currentTalonarioNumber(talonario, sales));
  const latest = Math.max(currentTalonarioNumber(talonario, sales), ...documents, start);
  if (latest <= baseline) return [];
  const used = new Set(registeredDocuments);
  const justified = new Set(justifications.filter(item => String(item.talonarioId)===String(talonario.id) && String(item.status || 'JUSTIFICADA').toUpperCase()==='JUSTIFICADA').map(item => Number(item.number)));
  const missing=[];
  for(let number=Math.max(start, baseline + 1);number<=latest;number+=1)if(!used.has(number)&&!justified.has(number))missing.push(number);
  return missing;
}
export function missingTalonarioNumbersForLocal(talonario, talonarios = [], sales = [], justifications = []) {
  const local = localKey(localLabel(talonario));
  const type = String(talonario.type || 'REMISION').toUpperCase();
  const isCartagenitaIIHistory = item => local === localKey('INV CARTAGENITA II') && Number(item.startNumber) === 15401 && Number(item.endNumber) === 15450;
  return talonarios
    .filter(item => (localKey(localLabel(item)) === local || isCartagenitaIIHistory(item)) && String(item.type || 'REMISION').toUpperCase() === type && (local !== localKey(CENTRAL) || item.id === talonario.id))
    .flatMap(item => {
      const status = String(item.status || '').toUpperCase();
      if (status === 'EN_USO') return missingTalonarioNumbers(item, sales, justifications);
      const documents = talonarioSalesDocuments(item, sales, { includeOtherStores: true });
      if (!documents.length) return [];
      const orderedDocuments = [...new Set(documents)].sort((left, right) => left - right);
      const justified = new Set(justifications.filter(entry => String(entry.talonarioId) === String(item.id) && String(entry.status || 'JUSTIFICADA').toUpperCase() === 'JUSTIFICADA').map(entry => Number(entry.number)));
      const missing = [];
      const lastRegistered = orderedDocuments[orderedDocuments.length - 1];
      const previousRegistered = orderedDocuments.length > 1 ? orderedDocuments[orderedDocuments.length - 2] : lastRegistered;
      for (let number = previousRegistered + 1; number < lastRegistered; number += 1) {
          if (!justified.has(number)) missing.push(number);
      }
      const historicalEnd = Math.min(Number(item.currentNumber ?? item.endNumber), Number(item.endNumber));
      for (let number = lastRegistered + 1; number <= historicalEnd; number += 1) {
        if (!justified.has(number)) missing.push(number);
      }
      return missing;
    })
    .sort((left, right) => left - right);
}
let talonarioFilters = { query:'', type:'all', status:'all', store:'all' };
export function setTalonarioFilters(filters) { talonarioFilters = { ...talonarioFilters, ...filters }; }

export function renderTalonariosSummary(state) {
  const talonarios = state?.talonarios || [];
  const active = deduplicateTalonarioHistory(talonarios.filter(item => String(item.type || '').toUpperCase() === 'REMISION' && String(item.status || '').toUpperCase() === 'EN_USO' && isCurrentActiveRange(item, talonarios)));
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
  const central = filteredItems.filter(item => isCentralStore(item) && String(item.status || 'ALMACENADO') === 'ALMACENADO');
  const activeItems = items.filter(item => String(item.type || '').toUpperCase() === 'REMISION' && String(item.status || '').toUpperCase() === 'EN_USO' && isCurrentActiveRange(item, items));
  const sales = state?.sales || state?.ventas || [];
  const summaryMap = new Map();
  activeItems.forEach(item => {
    const key = localGroupKey(item);
    const previous = summaryMap.get(key);
    if (!previous || isCurrentActiveRange(item, items) && !isCurrentActiveRange(previous, items)) summaryMap.set(key, item);
  });
  const justifications = state?.talonarioJustifications || [];
  const summaryRows = [...summaryMap.values()].sort((left, right) => localLabel(left).localeCompare(localLabel(right), 'es') || String(left.type).localeCompare(String(right.type))).map(item => {
    const activeRanges = activeTalonariosFor(item, items);
    const activeRange = activeRanges[0] || item;
    const current = currentTalonarioNumber(activeRange, sales);
    const remaining = Math.max(0, Number(activeRange.endNumber) - current);
    const missing = missingTalonarioNumbersForLocal(item, items, sales, justifications);
    const missingHtml = missing.length ? `<div class="talonario-missing-list">${missing.map(number => `<button type="button" class="table-action danger-text" data-action="justify-talonario-number" data-talonario-id="${item.id}" data-talonario-number="${number}">${numberLabel(number)}</button>`).join(' ')}</div>` : '<span class="muted">Ninguna</span>';
    return `<tr class="${missing.length ? 'talonario-row-missing' : ''}"><td><strong>${localLabel(item)}</strong></td><td>${labelType(item.type)}</td><td>${range(activeRange)}</td><td>${current}</td><td><strong>${remaining}</strong></td><td>${missingHtml}</td></tr>`;
  });
  const byStore = new Map();
  filteredItems.filter(item => !isCentralStore(item)).forEach(item => {
    const key = String(item.destinationName || item.storeId || 'Sin local');
    if (!byStore.has(key)) byStore.set(key, []);
    byStore.get(key).push(item);
  });
  const centralRows = central.map(item => `<tr><td>${labelType(item.type)}</td><td><strong>${range(item)}</strong></td><td>${item.supplierName || 'MISELANEA PAPELERIA'}</td><td>${badge(item.status || 'ALMACENADO')}</td><td><button class="table-action" data-action="send-talonario" data-talonario-id="${item.id}">Enviar</button></td></tr>`);
  const localRows = deduplicateTalonarioHistory(filteredItems.filter(item => !isCentralStore(item) && String(item.status || '').toUpperCase() !== 'ALMACENADO')).sort((left, right) => Number(right.startNumber || 0) - Number(left.startNumber || 0)).map(item => { const storeId=String(item.destinationName || item.storeId || 'Sin local'); return `<tr><td>${dateLabel(item)}</td><td>${storeNames.get(storeId) || storeId}</td><td>${labelType(item.type)}</td><td><strong>${range(item)}</strong></td><td>${currentTalonarioNumber(item, sales)}</td><td>${badge(item.status || 'EN_USO')}</td></tr>`; });
  const storeOptions = [...new Set([CENTRAL, ...items.filter(item => String(item.storeId || '') !== CENTRAL).map(item => String(item.destinationName || item.storeId || '')).filter(Boolean)])].sort((left, right) => left.localeCompare(right, 'es')).map(store => `<option value="${store}" ${talonarioFilters.store === store ? 'selected' : ''}>${store}</option>`).join('');
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
