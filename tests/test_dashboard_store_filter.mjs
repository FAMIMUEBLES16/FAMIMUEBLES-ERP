import assert from 'node:assert/strict';
import { filterDashboardSalesByStore } from '../js/modules/dashboard-v3.js';

const stores = [
  { id: 'store-1', name: 'Centro' },
  { id: 'store-2', name: 'Norte' },
];
const sales = [
  { id: 'sale-1', storeId: 'store-1', date: '2026-10-01', total: 100 },
  { id: 'sale-2', storeId: 'Norte', date: '2026-10-02', total: 200 },
  { id: 'sale-3', storeId: 'store-1', date: '2026-10-03', total: 300 },
];

assert.deepEqual(
  filterDashboardSalesByStore(sales, 'store-1', stores).map(sale => sale.id),
  ['sale-1', 'sale-3'],
);
assert.deepEqual(
  filterDashboardSalesByStore(sales, 'store-2', stores).map(sale => sale.id),
  ['sale-2'],
);
assert.equal(filterDashboardSalesByStore(sales, 'all', stores).length, 3);
