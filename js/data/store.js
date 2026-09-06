import { loadState, saveState } from './storage.js?v=17';
import { notifyCreation, refreshFinancialNotifications } from '../services/notification-service.js?v=2';

export const store = {
  state: loadState(),
  save() { refreshFinancialNotifications(this.state); saveState(this.state).catch(error => console.error(error)); },
  get collection() { return this.state; },
  add(collection, entity) { const items = this.state[collection]; if (!Array.isArray(items)) throw new Error(`Coleccion no disponible: ${collection}`); items.push(entity); notifyCreation(this.state, collection, entity); this.save(); return entity; },
  update(collection, id, changes) { const items = this.state[collection]; if (!Array.isArray(items)) throw new Error(`Coleccion no disponible: ${collection}`); const item = items.find(entry => entry.id === id); if (item) Object.assign(item, changes); this.save(); return item; }
};
