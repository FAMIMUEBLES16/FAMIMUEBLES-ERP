import { generateId } from '../utils/ids.js';
import { notifyCreation } from './notification-service.js';

export const transferStatuses = ['BORRADOR', 'PENDIENTE', 'EN_TRANSITO', 'RECIBIDO', 'CANCELADO'];

export function createTransfer(state, { originStoreId, destinationStoreId, items, notes = '', createdBy = 'USR-00001' }) {
  if (!originStoreId || !destinationStoreId || originStoreId === destinationStoreId) throw new Error('El origen y destino deben ser diferentes.');
  if (!items?.length || items.some(item => !item.productId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0)) throw new Error('El traslado debe tener productos y cantidades validas.');
  if (!state.stores.some(store => store.id === originStoreId)) throw new Error('El local origen no existe.');
  if (!state.stores.some(store => store.id === destinationStoreId)) throw new Error('El local destino no existe.');
  if (items.some(item => !state.products.some(product => product.id === item.productId))) throw new Error('El traslado contiene un producto inexistente.');
  const transfer = { id:generateId('TRA', state.transfers), originStoreId, destinationStoreId, createdAt:new Date().toISOString(), sentAt:null, receivedAt:null, createdBy, status:'BORRADOR', notes, items:items.map(item => ({ productId:item.productId, quantity:Number(item.quantity) })) };
  state.transfers.push(transfer);
  notifyCreation(state, 'transfers', transfer);
  return transfer;
}
