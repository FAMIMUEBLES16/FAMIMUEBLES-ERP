import { generateId } from '../utils/ids.js';
import { ensureInventoryEntry, getInventoryStatus } from '../utils/inventory.js';

export function getStoreById(state, storeId) { return state.stores.find(store => store.id === storeId); }
export function getProductById(state, productId) { return state.products.find(product => product.id === productId); }
export function getInventoryByProductAndStore(state, productId, storeId) { return ensureInventoryEntry(state, productId, storeId); }
export function getStock(state, productId, storeId) { return Number(getInventoryByProductAndStore(state, productId, storeId).quantity || 0); }

export function increaseStock(state, productId, storeId, quantity, referenceId, type = 'ENTRADA', note = '') {
  return changeStock(state, productId, storeId, quantity, 1, referenceId, type, note);
}

export function decreaseStock(state, productId, storeId, quantity, referenceId, type = 'SALIDA', note = '') {
  return changeStock(state, productId, storeId, quantity, -1, referenceId, type, note);
}

export function adjustStock(state, productId, storeId, newQuantity, reason) {
  const entry = getInventoryByProductAndStore(state, productId, storeId);
  const target = Number(newQuantity);
  if (!Number.isInteger(target) || target < 0) throw new Error('La nueva cantidad debe ser un entero mayor o igual a cero.');
  const difference = target - Number(entry.quantity || 0);
  entry.quantity = target;
  entry.minimumStock = Number(entry.minimumStock ?? entry.minimum ?? 0);
  entry.updatedAt = new Date().toISOString();
  entry.status = getInventoryStatus(target, entry.minimumStock);
  createInventoryMovement(state, productId, storeId, 'AJUSTE', difference, null, reason);
  return entry;
}

export function createInventoryMovement(state, productId, storeId, type, quantity, referenceId = null, note = '') {
  const movement = { id:generateId('MOV', state.inventoryMovements), productId, storeId, type, quantity:Number(quantity), referenceId, note, createdAt:new Date().toISOString(), createdBy:'USR-00001' };
  state.inventoryMovements.push(movement);
  return movement;
}

function changeStock(state, productId, storeId, quantity, direction, referenceId, type, note) {
  const amount = validateQuantity(quantity);
  const entry = getInventoryByProductAndStore(state, productId, storeId);
  const delta = amount * direction;
  const next = Number(entry.quantity || 0) + delta;
  if (next < 0) throw new Error('El stock no puede quedar negativo.');
  entry.quantity = next;
  entry.minimumStock = Number(entry.minimumStock ?? entry.minimum ?? 0);
  entry.updatedAt = new Date().toISOString();
  entry.status = getInventoryStatus(next, entry.minimumStock);
  createInventoryMovement(state, productId, storeId, type, delta, referenceId, note);
  return entry;
}

function validateQuantity(quantity) {
  if (quantity === null || quantity === undefined || (typeof quantity === 'string' && !quantity.trim())) throw new Error('La cantidad es obligatoria.');
  const value = Number(quantity);
  if (!Number.isFinite(value) || value <= 0) throw new Error('La cantidad debe ser un numero finito mayor que cero.');
  return value;
}
