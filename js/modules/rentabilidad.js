import { money, page } from '../components/tables.js';
import { pricingAnalysis, profitabilityMetrics } from '../utils/rentabilidad-calculations.js?v=1';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
})[character]);

export function productIsActive(product) {
  const value = product.active ?? product.activo ?? product.status ?? product.estado ?? true;
  return ![false, 0, '0', 'false', 'no', 'inactivo', 'inactiva', 'inactive', 'desactivado', 'desactivada', 'disabled']
    .includes(typeof value === 'string' ? value.trim().toLocaleLowerCase() : value);
}

function filteredRows(rows, filters) {
  const normalizeSearch = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const query = normalizeSearch(filters.query);
  const codeQuery = normalizeSearch(filters.code);
  const nameQuery = normalizeSearch(filters.name);
  const referenceQuery = normalizeSearch(filters.reference);
  const matches = (value, search) => !search || normalizeSearch(value).includes(search);
  return rows.filter(row => {
    const { product } = row;
    const active = productIsActive(product);
    const category = String(product.categoryName || product.category || 'General');
    const legacyQueryMatches = !query
      || [product.name, product.code, product.reference, category, product.brand].some(value => matches(value, query));
    const stockMatches = filters.stock === 'in-stock'
      ? row.stock > 0
      : filters.stock === 'out-of-stock' ? row.stock <= 0 : true;
    const belowCost = row.referenceCost > 0 && row.price < row.referenceCost;
    const belowMinimum = row.minimumPrice !== null && row.minimumPrice > 0 && row.price < row.minimumPrice;
    return legacyQueryMatches
      && matches([product.code, product.barcode, product.id].join(' '), codeQuery)
      && matches(product.name, nameQuery)
      && matches(product.reference, referenceQuery)
      && (filters.active === 'all' || (filters.active === 'active' ? active : !active))
      && (filters.category === 'all' || category === filters.category)
      && stockMatches
      && (!filters.belowCost || belowCost)
      && (!filters.belowMinimum || belowMinimum)
      && (!filters.noPurchaseHistory || !row.hasPurchaseHistory);
  });
}

export function rentabilidadExportRows(data, filters = {}, filtered = false) {
  const normalizedFilters = normalizeFilters(filters);
  const analysisRows = pricingAnalysis(normalizeData(data), filtered ? normalizedFilters.store : 'all');
  const rows = filtered ? filteredRows(analysisRows, normalizedFilters) : analysisRows;
  return rows.map(row => ({
    'Código del producto': String(row.product.code || row.product.id || ''),
    'Nombre del producto': String(row.product.name ?? ''),
    Referencia: String(row.product.reference ?? ''),
    Categoría: String(row.product.categoryName || row.product.category || 'General'),
    'Último costo de compra (COP)': row.lastPurchaseCost,
    'Costo promedio ponderado (COP)': row.weightedAverageCost,
    'Precio de venta actual (COP)': row.price,
    'Promedio histórico de venta (COP)': row.historicalAverage,
    'Precio mínimo de venta (COP)': row.minimumPrice,
    'Existencias por local/total': row.stock,
    'Margen estimado (COP)': row.margin,
    'Margen estimado (%)': row.marginPercent,
    'Estado de precio': row.priceStatus.label,
  }));
}

export function rentabilidadPriceTemplateRows(data) {
  return normalizeData(data).products.map(product => ({
    codigo: String(product.code ?? product.id ?? ''),
    nombre: String(product.name ?? ''),
    precio: '',
  }));
}

function priceCell(value) {
  return value === null ? '<span class="muted">Sin datos</span>' : money(value);
}

function productTable(rows, selectedProductIds = []) {
  const selectedIds = new Set(selectedProductIds.map(String));
  const allVisibleSelected = rows.length > 0 && rows.every(row => selectedIds.has(String(row.product.id)));
  const headers = [
    ['Seleccionar', ''],
    ['Código del producto', 'Solo lectura'],
    ['Nombre del producto', 'Solo lectura'],
    ['Referencia', 'Solo lectura'],
    ['Categoría', 'Solo lectura'],
    ['Último costo de compra', 'Solo lectura'],
    ['Costo promedio ponderado', 'Calculado'],
    ['Precio de venta actual', 'Editable'],
    ['Promedio histórico de venta', 'Calculado'],
    ['Precio mínimo de venta', 'Editable'],
    ['Existencias', 'Calculado'],
    ['Margen de rentabilidad estimado', 'Calculado'],
    ['Estado de precio', 'Calculado'],
    ['Acciones', ''],
  ];
  const body = rows.map(({ product, lastPurchaseCost, weightedAverageCost, price, minimumPrice, margin, marginPercent, marginUnavailableReason, historicalAverage, priceDifference, stock, priceStatus: status }) => {
    const rowClass = margin !== null && margin < 0
      ? 'rentabilidad-row--negative'
      : price <= 0 ? 'rentabilidad-row--missing-price' : '';
    const marginCell = margin === null
      ? `<span class="rentabilidad-status rentabilidad-status--warning">${escapeHtml(marginUnavailableReason)}</span>`
      : `<span class="rentabilidad-margin ${margin < 0 ? 'rentabilidad-margin--negative' : margin === 0 ? 'rentabilidad-margin--zero' : 'rentabilidad-margin--positive'}"><strong>${money(margin)}</strong><small>Margen ${marginPercent.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%</small></span>`;
    const priceCellContent = `<span class="rentabilidad-current-price"><strong>${money(price)}</strong><small>Editable</small></span>`;
    const differenceClass = priceDifference > 0
      ? 'rentabilidad-difference--up'
      : priceDifference < 0 ? 'rentabilidad-difference--down' : '';
    const historicalCell = historicalAverage === null
      ? priceCell(null)
      : `<span class="rentabilidad-history-value">${money(historicalAverage)}<small class="rentabilidad-history-difference ${differenceClass}">Dif. ${priceDifference > 0 ? '+' : ''}${money(priceDifference)}</small></span>`;
    return `<tr class="${rowClass}">
      <td data-label="Seleccionar"><input type="checkbox" class="rentabilidad-select-product" data-rentabilidad-select-product value="${escapeHtml(product.id)}" aria-label="Seleccionar ${escapeHtml(product.name || product.code || 'producto')}" ${selectedIds.has(String(product.id)) ? 'checked' : ''}></td>
      <td data-label="Código del producto">${escapeHtml(product.code || '—')}</td>
      <td class="rentabilidad-product" data-label="Nombre del producto"><strong>${escapeHtml(product.name || 'Sin nombre')}</strong></td>
      <td data-label="Referencia">${escapeHtml(product.reference || '—')}</td>
      <td data-label="Categoría">${escapeHtml(product.categoryName || product.category || 'General')}</td>
      <td data-label="Último costo de compra">${lastPurchaseCost === null ? '<span class="muted">Sin historial de compras</span>' : money(lastPurchaseCost)}</td>
      <td data-label="Costo promedio ponderado">${weightedAverageCost === null ? '<span class="muted">Sin historial de compras</span>' : money(weightedAverageCost)}</td>
      <td data-label="Precio de venta actual">${priceCellContent}</td>
      <td data-label="Promedio histórico de venta">${historicalCell}</td>
      <td data-label="Precio mínimo de venta">${priceCell(minimumPrice)}</td>
      <td data-label="Existencias por local/total">${stock.toLocaleString('es-CO')}</td>
      <td data-label="Margen de rentabilidad estimado">${marginCell}</td>
      <td data-label="Estado de precio"><span class="rentabilidad-price-status ${status.className}">${escapeHtml(status.label)}</span></td>
      <td data-label="Acciones"><button class="table-action rentabilidad-edit-button" data-action="edit-rentabilidad-prices" data-product-id="${escapeHtml(product.id)}">Editar precios</button></td>
    </tr>`;
  }).join('');
  return `<div class="table-wrap rentabilidad-table-wrap"><table class="rentabilidad-table"><thead><tr><th><input type="checkbox" data-rentabilidad-select-visible aria-label="Seleccionar todos los productos visibles" ${allVisibleSelected ? 'checked' : ''}></th>${headers.slice(1).map(([label, mode]) => `<th><span>${label}</span>${mode ? `<small class="rentabilidad-column-mode ${mode === 'Editable' ? 'rentabilidad-column-mode--editable' : ''}">${mode}</small>` : ''}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}

export function renderRentabilidadPriceEditor(row) {
  const { product } = row;
  const detail = (label, value) => `<div><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
  const amountInput = value => {
    const amount = Number(value ?? 0);
    return Number.isSafeInteger(amount) && amount >= 0
      ? amount.toLocaleString('es-CO')
      : escapeHtml(value ?? '');
  };
  const margin = row.margin === null
    ? 'N/A'
    : `${money(row.margin)} · ${row.marginPercent.toLocaleString('es-CO', { maximumFractionDigits: 1 })}%`;
  const lastCost = row.lastPurchaseCost === null ? 'Sin historial de compras' : money(row.lastPurchaseCost);
  const averageCost = row.weightedAverageCost === null ? 'Sin historial de compras' : money(row.weightedAverageCost);
  const historicalAverage = row.historicalAverage === null ? 'Sin ventas registradas' : money(row.historicalAverage);
  return `<div class="modal-backdrop rentabilidad-modal-backdrop"><form class="modal rentabilidad-price-modal" id="rentabilidad-price-form" role="dialog" aria-modal="true" aria-labelledby="rentabilidad-price-title">
    <button type="button" class="modal-close" data-action="cancel-rentabilidad-price-edit" aria-label="Cerrar">×</button>
    <p class="eyebrow">RENTABILIDAD</p>
    <h2 id="rentabilidad-price-title">Editar precios del producto</h2>
    <div class="rentabilidad-price-details">
      ${detail('Código', product.code || '—')}
      ${detail('Nombre', product.name || 'Sin nombre')}
      ${detail('Referencia', product.reference || '—')}
      ${detail('Último costo', lastCost)}
      ${detail('Costo promedio', averageCost)}
      ${detail('Promedio histórico de venta', historicalAverage)}
      ${detail('Margen estimado', margin)}
      ${detail('Existencias', row.stock.toLocaleString('es-CO'))}
    </div>
    <div class="rentabilidad-price-editable">
      <label class="input-label">Precio actual (COP)<input class="field" name="price" data-cop-price type="text" inputmode="numeric" pattern="[0-9]+|[0-9]{1,3}([.][0-9]{3})+" value="${amountInput(row.price)}" title="Use pesos enteros, con o sin puntos para separar miles." required></label>
      <label class="input-label">Precio mínimo de venta (COP)<input class="field" name="minimumPrice" data-cop-price type="text" inputmode="numeric" pattern="[0-9]+|[0-9]{1,3}([.][0-9]{3})+" value="${amountInput(row.minimumPrice)}" title="Use pesos enteros, con o sin puntos para separar miles." required></label>
    </div>
    <p class="rentabilidad-price-note">Solo puedes editar los precios. Costos, compras, ventas e inventario permanecen sin cambios.</p>
    <div class="rentabilidad-price-actions">
      <button type="button" class="outline" data-action="cancel-rentabilidad-price-edit">Cancelar</button>
      <button type="submit" class="primary">GUARDAR CAMBIOS</button>
    </div>
  </form></div>`;
}

function parseBulkCopPrice(value, label) {
  const raw = String(value ?? '').trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(raw)) {
    throw new Error(`${label} debe ser un valor entero en pesos colombianos.`);
  }
  const amount = Number(raw.replaceAll('.', ''));
  if (!Number.isSafeInteger(amount)) throw new Error(`${label} excede el valor permitido.`);
  return amount;
}

function normalizeImportHeader(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function parseRentabilidadPriceCsv(text) {
  const content = String(text ?? '').replace(/^\uFEFF/, '');
  if (!content.trim()) throw new Error('El archivo no contiene precios para importar.');
  const firstLine = content.split(/\r?\n/, 1)[0];
  const delimiter = [';', '\t', ','].reduce((selected, candidate) => (
    firstLine.split(candidate).length > firstLine.split(selected).length ? candidate : selected
  ), ',');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && content[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('El archivo CSV contiene comillas sin cerrar.');
  row.push(field.trim());
  if (row.some(value => value !== '')) rows.push(row);
  if (!rows.length) throw new Error('El archivo no contiene encabezados.');

  const headers = rows.shift().map(value => value.replace(/^\uFEFF/, '').trim());
  if (headers.some(value => !value)) throw new Error('El archivo contiene encabezados vacíos.');
  const normalizedHeaders = headers.map(normalizeImportHeader);
  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    throw new Error('El archivo contiene encabezados duplicados.');
  }
  return rows.map((values, index) => {
    if (values.length > headers.length) throw new Error(`Fila ${index + 2}: contiene más columnas que los encabezados.`);
    return Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex] ?? '']));
  });
}

export function parseRentabilidadPriceRecords(records, catalogRows) {
  if (!Array.isArray(records) || !records.length) throw new Error('El archivo no contiene filas para importar.');
  const headers = Object.keys(records.find(record => record && typeof record === 'object') || {});
  const normalizedHeaders = headers.map(normalizeImportHeader);
  const findHeader = aliases => {
    const index = aliases.map(alias => normalizedHeaders.indexOf(alias)).find(candidate => candidate >= 0);
    return index === undefined ? null : headers[index];
  };
  const codeHeader = findHeader(['codigo', 'code', 'product_code', 'codigo_producto', 'codigo_del_producto', 'id']);
  const priceHeader = findHeader([
    'nuevo_precio', 'precio_nuevo', 'precio_a_actualizar', 'precio_venta', 'precio_venta_actual', 'precio_de_venta',
    'precio_de_venta_actual_cop', 'precio_de_venta_actual', 'precio_actual_cop', 'sale_price',
    'saleprice', 'precio', 'price',
  ]);
  if (!codeHeader || !priceHeader) {
    throw new Error('Se requieren encabezados de código y precio, por ejemplo «codigo» y «precio».');
  }

  const normalizeCode = value => String(value ?? '').trim().toLocaleUpperCase();
  const byCode = new Map();
  const byId = new Map();
  (Array.isArray(catalogRows) ? catalogRows : []).forEach(row => {
    const code = normalizeCode(row.product.code);
    if (code) byCode.set(code, [...(byCode.get(code) || []), row]);
    const id = normalizeCode(row.product.id);
    if (id) byId.set(id, row);
  });

  const errors = [];
  const seen = new Set();
  const seenProductIds = new Set();
  const validRows = [];
  const importedPrices = new Map();
  records.forEach((record, index) => {
    const rowNumber = index + 2;
    if (!record || typeof record !== 'object'
      || Object.values(record).every(value => String(value ?? '').trim() === '')) return;
    const code = String(record[codeHeader] ?? '').trim();
    const normalizedCode = normalizeCode(code);
    if (!normalizedCode) {
      errors.push(`Fila ${rowNumber}: falta el código del producto.`);
      return;
    }
    if (seen.has(normalizedCode)) {
      errors.push(`Fila ${rowNumber}: el código ${code} está duplicado.`);
      return;
    }
    seen.add(normalizedCode);
    const matches = byCode.get(normalizedCode);
    const productRow = matches?.length === 1 ? matches[0] : matches?.length > 1 ? null : byId.get(normalizedCode);
    if (!productRow) {
      errors.push(matches?.length > 1
        ? `Fila ${rowNumber}: el código ${code} coincide con más de un producto.`
        : `Fila ${rowNumber}: el código ${code} no existe en el catálogo.`);
      return;
    }
    const productId = String(productRow.product.id);
    if (seenProductIds.has(productId)) {
      errors.push(`Fila ${rowNumber}: el producto ${code} ya aparece en otra fila.`);
      return;
    }
    seenProductIds.add(productId);
    try {
      importedPrices.set(productId, parseBulkCopPrice(record[priceHeader], `Precio de la fila ${rowNumber}`));
      validRows.push(productRow);
    } catch (error) {
      errors.push(error.message);
    }
  });

  const plan = validRows.length
    ? buildRentabilidadBulkPricePlan(validRows, 'specific', importedPrices)
    : [];
  return { plan, errors };
}

export function parseRentabilidadPriceImport(text, selectedRows) {
  const content = String(text ?? '').replace(/^\uFEFF/, '').trim();
  if (!content) throw new Error('El archivo no contiene precios para importar.');
  const firstLine = content.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  const lines = content.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const headers = lines.shift().split(delimiter).map(value => value.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  const codeIndex = headers.findIndex(value => ['codigo', 'code', 'id'].includes(value));
  const priceIndex = headers.findIndex(value => ['precio', 'price', 'saleprice', 'precio_venta'].includes(value));
  if (codeIndex < 0 || priceIndex < 0 || headers.length !== 2) {
    throw new Error('El archivo debe tener dos columnas con encabezados codigo y precio.');
  }

  const selectedByCode = new Map();
  selectedRows.forEach(row => {
    selectedByCode.set(String(row.product.id), row);
    if (row.product.code) selectedByCode.set(String(row.product.code), row);
  });
  const prices = new Map();
  lines.forEach((line, index) => {
    const cells = line.split(delimiter).map(value => value.trim());
    if (cells.length !== 2 || !cells[codeIndex] || !cells[priceIndex]) {
      throw new Error(`Fila ${index + 2}: se requieren código y precio.`);
    }
    const row = selectedByCode.get(cells[codeIndex]);
    if (!row) throw new Error(`Fila ${index + 2}: ${cells[codeIndex]} no pertenece a los productos seleccionados.`);
    const id = String(row.product.id);
    if (prices.has(id)) throw new Error(`Fila ${index + 2}: el producto ${cells[codeIndex]} está duplicado.`);
    prices.set(id, parseBulkCopPrice(cells[priceIndex], `Precio de la fila ${index + 2}`));
  });

  const missing = selectedRows.filter(row => !prices.has(String(row.product.id)));
  if (missing.length) {
    throw new Error(`Faltan precios para: ${missing.map(row => row.product.code || row.product.id).join(', ')}.`);
  }
  return prices;
}

export function buildRentabilidadBulkPricePlan(rows, operation, value) {
  let amount;
  let importedPrices;
  if (operation === 'increase-percent' || operation === 'decrease-percent') {
    const raw = String(value ?? '').trim().replace(',', '.');
    amount = Number(raw);
    if (!raw || !Number.isFinite(amount) || amount < 0 || (operation === 'decrease-percent' && amount > 100)) {
      throw new Error(operation === 'decrease-percent'
        ? 'El porcentaje de descuento debe estar entre 0 y 100.'
        : 'Ingresa un porcentaje de aumento válido.');
    }
  } else if (operation === 'increase-fixed' || operation === 'discount-fixed') {
    amount = parseBulkCopPrice(value, 'El valor fijo');
  } else if (operation === 'specific') {
    if (!(value instanceof Map)) throw new Error('Importa un precio para cada producto seleccionado.');
    importedPrices = value;
  } else {
    throw new Error('Selecciona una operación de precios válida.');
  }

  return rows.map(row => {
    const oldPrice = Number(row.price);
    if (!Number.isSafeInteger(oldPrice) || oldPrice < 0) {
      throw new Error(`El producto ${row.product.code || row.product.name} tiene un precio actual inválido.`);
    }
    let newPrice;
    if (operation === 'increase-percent') newPrice = Math.round(oldPrice * (1 + amount / 100));
    else if (operation === 'decrease-percent') newPrice = Math.round(oldPrice * (1 - amount / 100));
    else if (operation === 'increase-fixed') newPrice = oldPrice + amount;
    else if (operation === 'discount-fixed') newPrice = oldPrice - amount;
    else newPrice = importedPrices.get(String(row.product.id));

    const negative = !Number.isSafeInteger(newPrice) || newPrice < 0;
    const belowMinimum = !negative && newPrice < Number(row.minimumPrice || 0);
    const belowCost = !negative && row.weightedAverageCost !== null && row.weightedAverageCost !== undefined
      && newPrice < Number(row.weightedAverageCost);
    const reasons = [];
    if (negative) reasons.push('El precio resultante no puede ser negativo ni exceder el límite permitido.');
    if (belowMinimum) reasons.push('Quedaría por debajo del precio mínimo configurado.');
    return {
      product: row.product,
      oldPrice,
      newPrice: negative ? null : newPrice,
      minimumPrice: Number(row.minimumPrice || 0),
      weightedAverageCost: row.weightedAverageCost,
      belowCost,
      belowMinimum,
      negative,
      eligible: !negative && !belowMinimum,
      reason: reasons.join(' '),
    };
  });
}

export function renderRentabilidadBulkPriceEditor(rows) {
  const operationOptions = [
    ['increase-percent', 'Aumentar precio por porcentaje'],
    ['decrease-percent', 'Disminuir precio por porcentaje'],
    ['increase-fixed', 'Aplicar incremento fijo (COP)'],
    ['discount-fixed', 'Aplicar descuento fijo (COP)'],
    ['specific', 'Establecer precio específico por importación'],
  ].map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  return `<div class="modal-backdrop rentabilidad-modal-backdrop"><section class="modal rentabilidad-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="rentabilidad-bulk-title">
    <button type="button" class="modal-close" data-action="cancel-rentabilidad-bulk-edit" aria-label="Cerrar">×</button>
    <p class="eyebrow">RENTABILIDAD</p>
    <h2 id="rentabilidad-bulk-title">Edición masiva de precios</h2>
    <p class="rentabilidad-bulk-selection">Productos seleccionados: <strong>${rows.length}</strong>. Solo estos productos podrán modificarse.</p>
    <label class="input-label">Operación<select class="field" data-rentabilidad-bulk-operation>${operationOptions}</select></label>
    <label class="input-label" data-rentabilidad-bulk-amount-label><span>Porcentaje de aumento</span><input class="field" data-rentabilidad-bulk-amount type="text" inputmode="decimal" placeholder="Ej. 10 o 2,5" required></label>
    <div class="rentabilidad-bulk-import" data-rentabilidad-bulk-import hidden>
      <label class="input-label">Archivo CSV<input class="field" type="file" data-rentabilidad-bulk-file accept=".csv,.txt,text/csv,text/plain"></label>
      <label class="input-label">O pega el contenido CSV<textarea class="field" data-rentabilidad-bulk-import-text rows="4" placeholder="codigo,precio&#10;001,125000&#10;002,98000"></textarea></label>
      <p class="rentabilidad-price-note">Cada código debe pertenecer a un producto seleccionado y todos los seleccionados deben tener un precio.</p>
    </div>
    <div data-rentabilidad-bulk-preview aria-live="polite"></div>
    <div class="rentabilidad-price-actions">
      <button type="button" class="outline" data-action="cancel-rentabilidad-bulk-edit">Cancelar</button>
      <button type="button" class="outline" data-action="preview-rentabilidad-bulk-edit">Previsualizar cambios</button>
      <button type="button" class="primary" data-action="apply-rentabilidad-bulk-edit" hidden disabled>Aplicar cambios</button>
    </div>
  </section></div>`;
}

export function renderRentabilidadBulkPricePreview(plan) {
  const belowCostCount = plan.filter(item => item.belowCost).length;
  const belowMinimumCount = plan.filter(item => item.belowMinimum).length;
  const ineligibleCount = plan.filter(item => !item.eligible).length;
  const rows = plan.map(item => `<tr class="${item.eligible ? '' : 'rentabilidad-bulk-row--blocked'}">
    <td data-label="Código">${escapeHtml(item.product.code || item.product.id)}</td>
    <td data-label="Producto">${escapeHtml(item.product.name || 'Sin nombre')}</td>
    <td data-label="Precio anterior">${money(item.oldPrice)}</td>
    <td data-label="Nuevo precio">${item.newPrice === null ? '—' : money(item.newPrice)}</td>
    <td data-label="Costo promedio">${item.weightedAverageCost === null ? 'Sin historial de compras' : money(item.weightedAverageCost)}</td>
    <td data-label="Precio mínimo">${money(item.minimumPrice)}</td>
    <td data-label="Revisión">${item.belowCost ? '<span class="rentabilidad-bulk-warning">Debajo del costo</span>' : ''}${item.belowMinimum ? '<span class="rentabilidad-bulk-blocked">Debajo del mínimo</span>' : ''}${item.negative ? '<span class="rentabilidad-bulk-blocked">Precio inválido</span>' : ''}${!item.belowCost && !item.belowMinimum && !item.negative ? 'Listo' : ''}${item.reason ? `<small>${escapeHtml(item.reason)}</small>` : ''}</td>
  </tr>`).join('');
  return `<div class="rentabilidad-bulk-preview">
    <p><strong>${plan.length} productos seleccionados</strong> · ${plan.length - ineligibleCount} se actualizarían · ${ineligibleCount} bloqueados por validación.</p>
    <p>${belowCostCount} quedarían por debajo del costo · ${belowMinimumCount} incumplirían su precio mínimo. Los productos bajo mínimo no se actualizarán; los precios bajo costo quedan señalados como advertencia.</p>
    <div class="rentabilidad-bulk-preview-table"><table><thead><tr><th>Código</th><th>Producto</th><th>Precio anterior</th><th>Nuevo precio</th><th>Costo promedio</th><th>Precio mínimo</th><th>Revisión</th></tr></thead><tbody>${rows}</tbody></table></div>
  </div>`;
}

export function renderRentabilidadBulkPriceOutcome(updated, notUpdated, errorMessage = '') {
  const updatedRows = updated.map(item => `<li><strong>${escapeHtml(item.code || item.id)}</strong> · ${escapeHtml(item.name || 'Producto')} · ${money(item.salePrice)}</li>`).join('');
  const confirmedNotUpdated = notUpdated.filter(item => item.status !== 'unknown');
  const unknown = notUpdated.filter(item => item.status === 'unknown');
  const notUpdatedRows = confirmedNotUpdated.map(item => `<li><strong>${escapeHtml(item.code || item.id)}</strong> · ${escapeHtml(item.name || 'Producto')} · ${escapeHtml(item.reason || 'No actualizado')}</li>`).join('');
  const unknownRows = unknown.map(item => `<li><strong>${escapeHtml(item.code || item.id)}</strong> · ${escapeHtml(item.name || 'Producto')} · ${escapeHtml(item.reason || 'Estado desconocido')}</li>`).join('');
  return `<div class="rentabilidad-bulk-outcome" role="status">
    ${errorMessage ? `<p class="rentabilidad-bulk-blocked">${escapeHtml(errorMessage)}</p>` : ''}
    <p><strong>Resultado: ${updated.length} confirmados actualizados · ${confirmedNotUpdated.length} confirmados sin actualizar · ${unknown.length} por verificar.</strong></p>
    <h3>Productos actualizados (${updated.length})</h3>${updatedRows ? `<ul>${updatedRows}</ul>` : '<p>Ninguno.</p>'}
    <h3>Productos no actualizados (${confirmedNotUpdated.length})</h3>${notUpdatedRows ? `<ul>${notUpdatedRows}</ul>` : '<p>Ninguno.</p>'}
    ${unknown.length ? `<h3>Estado por verificar (${unknown.length})</h3><ul>${unknownRows}</ul>` : ''}
  </div>`;
}

export function renderRentabilidadPriceImportEditor() {
  return `<div class="modal-backdrop rentabilidad-modal-backdrop"><section class="modal rentabilidad-import-modal" role="dialog" aria-modal="true" aria-labelledby="rentabilidad-import-title">
    <button type="button" class="modal-close" data-action="cancel-rentabilidad-price-import" aria-label="Cerrar">×</button>
    <p class="eyebrow">RENTABILIDAD</p>
    <h2 id="rentabilidad-import-title">Importar precios</h2>
    <p class="rentabilidad-price-note">Carga un archivo CSV o Excel. Primero se validará y mostrará una vista previa; ningún precio cambiará hasta confirmar la operación.</p>
    <label class="input-label">Archivo CSV o Excel<input class="field" type="file" data-rentabilidad-price-import-file accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"></label>
    <p class="rentabilidad-import-file-status" data-rentabilidad-import-file-status aria-live="polite">Selecciona un archivo para continuar.</p>
    <div data-rentabilidad-price-import-preview aria-live="polite"></div>
    <div class="rentabilidad-price-actions">
      <button type="button" class="outline" data-action="cancel-rentabilidad-price-import">Cancelar</button>
      <button type="button" class="outline" data-action="validate-rentabilidad-price-import" disabled>Validar y previsualizar</button>
      <button type="button" class="primary" data-action="confirm-rentabilidad-price-import" hidden disabled>Confirmar actualización</button>
    </div>
  </section></div>`;
}

export function renderRentabilidadPriceImportPreview({ plan = [], errors = [] } = {}) {
  const errorList = errors.map(error => `<li>${escapeHtml(error)}</li>`).join('');
  const validation = errors.length
    ? `<div class="rentabilidad-import-errors" role="alert"><strong>${errors.length} observaciones: corrige el archivo antes de continuar.</strong><ul>${errorList}</ul></div>`
    : '<p class="rentabilidad-import-valid" role="status">Validación correcta. Revisa los precios y confirma para aplicar.</p>';
  return `${validation}${plan.length ? renderRentabilidadBulkPricePreview(plan) : '<p class="empty-state">No se encontraron precios válidos para previsualizar.</p>'}`;
}

export function renderRentabilidadPriceHistory(items = [], { hasMore = false, loading = false, error = '' } = {}) {
  const rows = items.map(item => {
    const timestamp = new Date(item.createdAt);
    const date = Number.isNaN(timestamp.getTime()) ? String(item.createdAt || '—') : timestamp.toLocaleString('es-CO');
    const operation = { individual: 'Individual', masiva: 'Masiva', importacion: 'Importación' }[item.operationType] || 'Precio actualizado';
    return `<tr>
      <td>${escapeHtml(date)}</td>
      <td>${escapeHtml(item.userName || item.userId || 'Usuario no disponible')}</td>
      <td>${escapeHtml(operation)}</td>
      <td>${escapeHtml(item.productCode || item.productId || '—')}</td>
      <td>${escapeHtml(item.productName || 'Producto')}</td>
      <td>${money(item.salePriceBefore)} <span aria-hidden="true">→</span> ${money(item.salePriceAfter)}</td>
      <td>${money(item.minimumPriceBefore)} <span aria-hidden="true">→</span> ${money(item.minimumPriceAfter)}</td>
    </tr>`;
  }).join('');
  return `<div class="modal-backdrop rentabilidad-modal-backdrop"><section class="modal rentabilidad-history-modal" role="dialog" aria-modal="true" aria-labelledby="rentabilidad-history-title">
    <button type="button" class="modal-close" data-action="close-rentabilidad-price-history" aria-label="Cerrar">×</button>
    <p class="eyebrow">RENTABILIDAD</p>
    <h2 id="rentabilidad-history-title">Historial de cambios de precio</h2>
    <p class="rentabilidad-price-note">Registro de auditoría de precios, con usuario y fecha del servidor. Se muestran los cambios más recientes primero.</p>
    ${error ? `<p class="rentabilidad-import-errors" role="alert">${escapeHtml(error)}</p>` : ''}
    ${loading ? '<p class="rentabilidad-import-file-status" role="status">Cargando historial…</p>' : ''}
    ${!loading && !items.length ? '<p class="empty-state">No hay cambios de precio registrados.</p>' : ''}
    ${items.length ? `<div class="rentabilidad-history-table-wrap"><table class="rentabilidad-history-table"><thead><tr><th>Fecha y hora</th><th>Usuario</th><th>Operación</th><th>Código</th><th>Producto</th><th>Precio anterior → nuevo</th><th>Mínimo anterior → nuevo</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
    ${hasMore && !loading ? `<button type="button" class="outline rentabilidad-history-more" data-action="load-more-rentabilidad-price-history">${error ? 'Reintentar' : 'Cargar cambios anteriores'}</button>` : ''}
  </section></div>`;
}

function normalizeData(data) {
  return {
    ...data,
    products: Array.isArray(data?.products) ? data.products : [],
    stores: Array.isArray(data?.stores) ? data.stores : [],
  };
}

function normalizeFilters(filters = {}) {
  return {
    query: filters.query || '',
    code: filters.code || '',
    name: filters.name || '',
    reference: filters.reference || '',
    store: String(filters.store || 'all'),
    category: String(filters.category || 'all'),
    active: String(filters.active || 'all'),
    stock: String(filters.stock || 'all'),
    belowCost: Boolean(filters.belowCost),
    belowMinimum: Boolean(filters.belowMinimum),
    noPurchaseHistory: Boolean(filters.noPurchaseHistory),
    selectedProductIds: Array.isArray(filters.selectedProductIds) ? filters.selectedProductIds.map(String) : [],
  };
}

function filterOptions(values, selected) {
  return values.map(value => {
    const optionValue = String(value.id ?? value);
    return `<option value="${escapeHtml(optionValue)}" ${optionValue === selected ? 'selected' : ''}>${escapeHtml(value.name ?? value)}</option>`;
  }).join('');
}

export function renderRentabilidadResults(data, filters = {}) {
  const safeData = normalizeData(data);
  const normalizedFilters = normalizeFilters(filters);
  const analysisRows = pricingAnalysis(safeData, normalizedFilters.store);
  const rows = filteredRows(analysisRows, normalizedFilters);
  const selectedIds = new Set(normalizedFilters.selectedProductIds);
  const visibleSelected = rows.filter(row => selectedIds.has(String(row.product.id))).length;
  const hiddenSelected = Math.max(0, selectedIds.size - visibleSelected);
  const metrics = profitabilityMetrics(analysisRows);
  const value = (amount, { currency = false, decimals = 0 } = {}) => amount === null
    ? '<strong class="rentabilidad-stat-empty">Sin datos</strong>'
    : `<strong>${currency ? money(amount) : amount.toLocaleString('es-CO', { maximumFractionDigits: decimals })}</strong>`;
  return `
    <div class="inventory-summary profitability-summary rentabilidad-summary">
      <article class="rentabilidad-stat">
        <span class="rentabilidad-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"/><path d="M4 7.5v9L12 21l8-4.5v-9M12 12v9"/></svg></span>
        <div><span>Total de productos</span>${value(metrics.totalProducts)}<small>${metrics.totalProducts ? 'En el catálogo cargado' : 'No hay productos registrados'}</small></div>
      </article>
      <article class="rentabilidad-stat">
        <span class="rentabilidad-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 7 12 3l9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7m-9 4v10"/></svg></span>
        <div><span>Costo de existencias con costo registrado</span>${value(metrics.totalInventoryCost, { currency: true })}<small>${metrics.uncostedInventoryUnits ? `Subtotal actual · ${metrics.uncostedInventoryUnits.toLocaleString('es-CO')} unidades aún sin costo` : metrics.inventoryUnits ? 'Suma de existencias por costo ponderado o último costo conocido' : 'No hay existencias'}</small></div>
      </article>
      <article class="rentabilidad-stat">
        <span class="rentabilidad-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 2v20m5-16H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></span>
        <div><span>Valor de existencias con precio cargado</span>${value(metrics.potentialSaleValue, { currency: true })}<small>${metrics.unpricedInventoryUnits ? `Subtotal actual · ${metrics.unpricedInventoryUnits.toLocaleString('es-CO')} unidades aún sin precio` : metrics.inventoryUnits ? 'Suma de existencias por precio de venta actual' : 'No hay existencias'}</small></div>
      </article>
      <article class="rentabilidad-stat ${metrics.pricesToReview ? 'rentabilidad-stat--warning' : ''}">
        <span class="rentabilidad-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3h.01"/></svg></span>
        <div><span>Productos con precios por revisar</span>${value(metrics.pricesToReview)}<small>${metrics.pricesToReview ? 'En todo el catálogo · precio/costo faltante o bajo el costo/mínimo' : 'No hay precios que revisar'}</small></div>
      </article>
      <article class="rentabilidad-stat ${metrics.outOfStock ? 'rentabilidad-stat--warning' : ''}">
        <span class="rentabilidad-stat-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"/><path d="M4 7.5v9L12 21l8-4.5v-9M12 12v9"/><path d="m8 8 8 4"/></svg></span>
        <div><span>Productos sin existencias</span>${value(metrics.outOfStock)}<small>${metrics.outOfStock ? (normalizedFilters.store === 'all' ? 'Sin unidades en ningún local' : 'Sin unidades en el local seleccionado') : 'Todos tienen existencias'}</small></div>
      </article>
    </div>
    <div class="rentabilidad-table-heading"><div><h3>Productos y rentabilidad</h3><p>${rows.length} ${rows.length === 1 ? 'producto' : 'productos'} · ${normalizedFilters.store === 'all' ? 'existencias consolidadas' : 'existencias del local seleccionado'}</p></div><span class="rentabilidad-table-heading-tag">Vista detallada</span></div>
    <div class="rentabilidad-bulk-toolbar"><span><strong>${selectedIds.size} seleccionados</strong>${hiddenSelected ? ` · ${hiddenSelected} fuera de los filtros` : ''}</span><div><button type="button" class="outline" data-action="clear-rentabilidad-selection" ${selectedIds.size ? '' : 'disabled'}>Quitar selección</button><button type="button" class="primary" data-action="bulk-edit-rentabilidad-prices" ${selectedIds.size ? '' : 'disabled'}>Editar precios seleccionados</button></div></div>
    ${rows.length ? productTable(rows, normalizedFilters.selectedProductIds) : '<p class="empty-state rentabilidad-empty">No hay productos que coincidan con los filtros seleccionados.</p>'}`;
}

export function renderRentabilidad(data, filters = {}) {
  const safeData = normalizeData(data);
  const normalizedFilters = normalizeFilters(filters);
  const selectedStore = normalizedFilters.store;
  const categories = [...new Set(safeData.products.map(product => String(product.categoryName || product.category || 'General')))]
    .sort((left, right) => left.localeCompare(right, 'es'));
  const storeOptions = `<option value="all" ${selectedStore === 'all' ? 'selected' : ''}>Todos los locales</option>${filterOptions(safeData.stores, selectedStore)}`;
  const categoryOptions = `<option value="all" ${normalizedFilters.category === 'all' ? 'selected' : ''}>Todas las categorías</option>${filterOptions(categories, normalizedFilters.category)}`;
  const active = normalizedFilters.active;
  const statusOptions = `<option value="all" ${active === 'all' ? 'selected' : ''}>Activos e inactivos</option><option value="active" ${active === 'active' ? 'selected' : ''}>Activos</option><option value="inactive" ${active === 'inactive' ? 'selected' : ''}>Inactivos</option>`;
  const stockOptions = `<option value="all" ${normalizedFilters.stock === 'all' ? 'selected' : ''}>Todos</option><option value="in-stock" ${normalizedFilters.stock === 'in-stock' ? 'selected' : ''}>Con existencia</option><option value="out-of-stock" ${normalizedFilters.stock === 'out-of-stock' ? 'selected' : ''}>Sin existencia</option>`;
  const checked = value => value ? 'checked' : '';
  const content = `
    <div class="profitability-note rentabilidad-note"><span class="rentabilidad-note-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg></span><div><strong>Criterios del análisis</strong><p>Las tarjetas resumen el catálogo completo; los valores del inventario y las existencias cambian con el local seleccionado. El costo suma las existencias por costo promedio ponderado de compra; cuando no hay historial válido usa el último costo conocido. El valor de venta suma las existencias por el precio actual configurado. Ambos indicadores muestran el subtotal con datos disponibles y señalan las unidades cuyo costo o precio aún falta, para que puedas ir completándolos sin ocultar el valor ya calculable. El costo promedio ponderado se calcula con compras recibidas netas de descuentos y devoluciones vinculadas; los ajustes de inventario no alteran el costo histórico de compra. El margen estimado se calcula sobre el costo promedio disponible y el precio actual; es margen sobre venta, no recargo sobre costo ni utilidad contable.</p></div></div>
    <div class="rentabilidad-export-toolbar" role="group" aria-label="Exportación e importación de precios">
      <label class="input-label">Exportar<select class="field" data-rentabilidad-export-scope><option value="all">Toda la lista</option><option value="filtered">Resultados filtrados</option></select></label>
      <button type="button" class="outline" data-action="export-rentabilidad-prices" data-format="xlsx">Exportar Excel</button>
      <button type="button" class="outline" data-action="export-rentabilidad-prices" data-format="csv">Exportar CSV</button>
      <span class="rentabilidad-export-divider" aria-hidden="true"></span>
      <button type="button" class="outline" data-action="download-rentabilidad-template" data-format="xlsx">Plantilla Excel</button>
      <button type="button" class="outline" data-action="download-rentabilidad-template" data-format="csv">Plantilla CSV</button>
      <button type="button" class="outline" data-action="view-rentabilidad-price-history">Historial de precios</button>
      <button type="button" class="primary" data-action="open-rentabilidad-price-import">Importar precios</button>
    </div>
    <div class="toolbar profitability-filters rentabilidad-filters">
      <div class="rentabilidad-filter-searches">
        <label class="input-label">Código<input type="search" class="field" data-rentabilidad-code value="${escapeHtml(normalizedFilters.code)}" placeholder="Buscar por código"></label>
        <label class="input-label">Nombre<input type="search" class="field" data-rentabilidad-name value="${escapeHtml(normalizedFilters.name)}" placeholder="Buscar por nombre"></label>
        <label class="input-label">Referencia<input type="search" class="field" data-rentabilidad-reference value="${escapeHtml(normalizedFilters.reference)}" placeholder="Buscar por referencia"></label>
      </div>
      <div class="rentabilidad-filter-selects">
        <label class="input-label">Local<select class="field" data-rentabilidad-store>${storeOptions}</select></label>
        <label class="input-label">Categoría<select class="field" data-rentabilidad-category>${categoryOptions}</select></label>
        <label class="input-label">Estado del catálogo<select class="field" data-rentabilidad-active>${statusOptions}</select></label>
        <label class="input-label">Existencias<select class="field" data-rentabilidad-stock>${stockOptions}</select></label>
      </div>
      <div class="rentabilidad-filter-conditions" role="group" aria-label="Filtros de precio y compras">
        <label class="rentabilidad-filter-check"><input type="checkbox" data-rentabilidad-below-cost ${checked(normalizedFilters.belowCost)}><span>Precio por debajo del costo</span></label>
        <label class="rentabilidad-filter-check"><input type="checkbox" data-rentabilidad-below-minimum ${checked(normalizedFilters.belowMinimum)}><span>Precio inferior al mínimo</span></label>
        <label class="rentabilidad-filter-check"><input type="checkbox" data-rentabilidad-no-purchases ${checked(normalizedFilters.noPurchaseHistory)}><span>Sin historial de compras</span></label>
        <button type="button" class="outline rentabilidad-clear-filters" data-action="clear-rentabilidad-filters">Limpiar filtros</button>
      </div>
    </div>
    <div id="rentabilidad-results">${renderRentabilidadResults(safeData, normalizedFilters)}</div>`;
  return `<div class="rentabilidad-view">${page('Análisis comercial', 'Rentabilidad', '', content)}</div>`;
}
