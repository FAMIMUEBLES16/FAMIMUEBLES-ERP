import { page, table, badge } from '../components/tables.js';
import { accountPayableSupplierName } from '../services/accounts-payable-service.js?v=20261019-preserve-supplier-history-v1';

function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function supplierRecords(state) {
  const suppliers = Array.isArray(state.suppliers) ? state.suppliers : [];
  const knownNames = new Set(suppliers.map(item => normalizeName(item.name)));
  const historical = new Map();
  const addHistorical = (name, record = {}) => {
    const normalized = normalizeName(name);
    if (!normalized || normalized === 'proveedor' || knownNames.has(normalized)) return;
    const current = historical.get(normalized) || {
      id: `HIST-${normalized}`,
      code: 'Historico',
      name: String(name).trim(),
      active: false,
      _historicalOnly: true,
    };
    current.document ||= record.supplierDocument || record.supplierNit || record.supplierNIT || record.nit || record.document || '';
    current.contact ||= record.contact || record.phone || '';
    current.email ||= record.email || '';
    historical.set(normalized, current);
  };

  (state.purchases || []).forEach(purchase => {
    addHistorical(
      purchase.supplierName || purchase.supplier_name || purchase.proveedor || purchase.supplier,
      purchase
    );
  });
  (state.accountsPayable || []).forEach(account => {
    addHistorical(accountPayableSupplierName(state, account), account);
  });

  return [...suppliers, ...historical.values()];
}

export function renderProveedores(state) { return page('ABASTECIMIENTO','Proveedores','<button class="primary" data-action="new-supplier">＋ Nuevo proveedor</button>',`<div class="toolbar"><label class="input-label">Buscar proveedores<input class="field" data-filter="suppliers" placeholder="Buscar proveedor, NIT o contacto..."></label></div><div id="suppliers-table">${supplierTable(state,supplierRecords(state))}</div>`); }
export function supplierTable(state,items) { const isAdmin=String(JSON.parse(localStorage.getItem('famimuebles-user')||'{}').role||'').toUpperCase()==='ADMINISTRADOR'; return table(['Codigo','Proveedor','NIT','Contacto','Condiciones','Estado','Acciones'],items.map(item=>`<tr><td><strong>${item.code}</strong></td><td>${item.name}<small>${item._historicalOnly ? 'Reconstruido desde el historial; ficha original no disponible' : item.city || ''}</small></td><td>${item.document || '-'}</td><td>${item.contact || item.phone || '-'}<small>${item.email || ''}</small></td><td>${item.paymentTerms || 'Contado'}${item.creditDays ? ` · ${item.creditDays} dias` : ''}</td><td>${badge(item._historicalOnly ? 'Historico' : item.active === false ? 'Inactivo' : 'Activo')}</td><td>${item._historicalOnly ? '<span class="muted">Pendiente de completar ficha</span>' : `<button class="table-action" data-action="view-supplier" data-supplier-id="${item.id}">Ver</button><button class="table-action" data-action="edit-supplier" data-supplier-id="${item.id}">Editar</button><button class="table-action" data-action="toggle-supplier" data-supplier-id="${item.id}">${item.active === false ? 'Activar' : 'Desactivar'}</button>${isAdmin?`<button class="table-action danger-text" data-action="delete-supplier" data-supplier-id="${item.id}">Eliminar</button>`:''}`}</td></tr>`)); }
