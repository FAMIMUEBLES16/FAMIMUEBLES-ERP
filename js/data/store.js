import { loadState, saveState } from './storage.js?v=33';
import { notifyCreation, refreshFinancialNotifications } from '../services/notification-service.js?v=2';

export const store = {
  state: loadState(),
  save({ notify = true } = {}) {
    refreshFinancialNotifications(this.state);
    const request = saveState(this.state);
    if (notify) {
      request.catch(error => {
        if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
          window.dispatchEvent(new CustomEvent('famimuebles:save-error', { detail: error }));
        } else {
          console.error(error);
        }
      });
    }
    return request;
  },
  get collection() { return this.state; },
  add(collection, entity, { persist = true } = {}) { const items = this.state[collection]; if (!Array.isArray(items)) throw new Error(`Coleccion no disponible: ${collection}`); items.push(entity); notifyCreation(this.state, collection, entity); if (persist) this.save(); return entity; },
  update(collection, id, changes, { persist = true } = {}) { const items = this.state[collection]; if (!Array.isArray(items)) throw new Error(`Coleccion no disponible: ${collection}`); const item = items.find(entry => entry.id === id); if (item) Object.assign(item, changes); if (persist) this.save(); return item; }
};
