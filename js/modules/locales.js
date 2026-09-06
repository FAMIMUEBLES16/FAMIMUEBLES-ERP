import { money, page, badge } from '../components/tables.js';

function normalizeStoreName(value = '') {
  return String(value || '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function formatStoreHeading(store = {}) {
  const rawName = String(store.name || '').trim();
  return normalizeStoreName(rawName || store.code || '') || 'Local';
}

export function renderLocales(data) {
  const stores = Array.isArray(data.stores) ? data.stores : [];
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  return page('OPERACION MULTILOCAL','Locales','<button class="primary" data-action="new-store">＋ Nuevo local</button>',`<div class="store-grid">${stores.map(store=>`<article class="store-card"><div class="store-top"><button type="button" class="store-icon" data-action="local-detail" data-store-id="${store.id}" aria-label="Ver detalle del local">⌂</button>${badge(store.status || 'Activo')}</div><h3>${formatStoreHeading(store)}</h3><p>${store.address || 'Sin direccion'}<br>${store.phone || 'Sin telefono'}</p><div class="store-stats"><span><b>${(data.inventoryByStore || []).filter(item=>String(item.storeId)===String(store.id)).length}</b> productos</span><span><b>${(data.inventoryByStore || []).filter(item=>String(item.storeId)===String(store.id)).reduce((sum,item)=>sum+Number(item.quantity||0),0)}</b> unidades</span></div><div class="store-actions"><button class="outline" type="button" data-action="local-detail" data-store-id="${store.id}">Ver detalle</button>${isAdmin?`<button class="outline" type="button" data-action="edit-store" data-store-id="${store.id}">Editar</button><button class="outline" type="button" data-action="toggle-store" data-store-id="${store.id}">${store.status === 'Inactivo' ? 'Activar' : 'Desactivar'}</button><button class="outline danger-text" type="button" data-action="delete-store" data-store-id="${store.id}">Eliminar</button>`:''}</div></article>`).join('')}</div>`); }
