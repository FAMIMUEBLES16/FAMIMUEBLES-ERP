export function getInventoryStatus(quantity, minimumStock) { if (quantity <= 0) return 'Agotado'; if (quantity <= minimumStock) return 'Bajo'; if (quantity <= minimumStock * 2) return 'Poco'; return 'Bien'; }
export const inventoryStatus = getInventoryStatus;
export function inventoryEntry(state, productId, storeId) { return state.inventoryByStore.find(row => String(row.productId) === String(productId) && String(row.storeId) === String(storeId)); }
export function inventoryRows(state, storeId = 'all') {
	const stores = storeId === 'all' ? state.stores : state.stores.filter(store => String(store.id) === String(storeId));
	if (state.demoMode) return stores.flatMap(store => state.products.map(product => ({ productId:product.id, storeId:store.id, quantity:0, minimumStock:0, minimum:0, product, store, status:'Agotado' })));
	return stores.flatMap(store => state.products.map(product => {
		const row = inventoryEntry(state, product.id, store.id) || { productId:product.id, storeId:store.id, quantity:0, minimumStock:product.minimum || 0, minimum:product.minimum || 0 };
		const minimumStock = Number(row.minimumStock ?? row.minimum ?? product.minimum ?? 0);
		return { ...row, minimumStock, minimum:minimumStock, product, store, status:getInventoryStatus(Number(row.quantity || 0), minimumStock) };
	}));
}
export function ensureInventoryEntry(state, productId, storeId) {
 const product = state.products.find(item => item.id === productId);
 const store = state.stores.find(item => item.id === storeId);
 if (!product) throw new Error('El producto de inventario no existe.');
 if (!store) throw new Error('El local de inventario no existe.');
	let row = inventoryEntry(state, productId, storeId);
	if (!row) { row = { id:nextInventoryId(state), productId, storeId, quantity:0, minimumStock:Number(product.minimum || 0), updatedAt:new Date().toISOString() }; state.inventoryByStore.push(row); }
	return row;
}
function nextInventoryId(state) { const max=state.inventoryByStore.reduce((value,row)=>Math.max(value,Number(String(row.id || '').replace(/\D/g,'')) || 0),0); return `INV-${String(max + 1).padStart(5,'0')}`; }
