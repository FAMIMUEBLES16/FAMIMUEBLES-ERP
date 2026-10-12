import assert from 'node:assert/strict';
import { monthToDateSalesComparison } from '../js/modules/dashboard-v3.js';

const octoberComparison = monthToDateSalesComparison([
  { date: '2026-10-01', total: 2000000 },
  { date: '2026-10-10', total: 23733003 },
  { date: '2026-10-11', total: 9000000 },
  { date: '2026-09-01', total: 10000000 },
  { date: '2026-09-10', total: 19838000 },
  { date: '2026-09-11', total: 8000000 },
], '2026-10-10');

assert.deepEqual(octoberComparison, {
  currentTotal: 25733003,
  previousTotal: 29838000,
  previousPeriodStart: '2026-09-01',
  previousPeriodEnd: '2026-09-10',
});

const marchComparison = monthToDateSalesComparison([
  { date: '2026-03-01', total: 100 },
  { date: '2026-02-28', total: 200 },
  { date: '2026-03-11', total: 300 },
], '2026-03-31');

assert.deepEqual(marchComparison, {
  currentTotal: 100,
  previousTotal: 200,
  previousPeriodStart: '2026-02-01',
  previousPeriodEnd: '2026-02-28',
});
