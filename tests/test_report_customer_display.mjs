import assert from 'node:assert/strict';
import { renderReportPreview } from '../js/modules/reportes.js';
import { customerTable } from '../js/modules/clientes.js';

globalThis.localStorage = { getItem: () => '{"role":"ADMINISTRADOR"}' };

const preview = renderReportPreview({
  sales: [
    { id: 'FAC-1', customer: 'undefined', total: 10000 },
    { id: 'FAC-2', customer: 'MOV-253', total: 20000 },
    { id: 'FAC-3', customer: 'María Pérez', total: 30000 },
  ],
}, 'sales');

assert.equal(preview.count, 3, 'sales with missing customer details must remain in the report');
assert.match(preview.html, /Cliente no identificado/);
assert.match(preview.html, /referencia MOV-253/);
assert.match(preview.html, /María Pérez/);
assert.doesNotMatch(preview.html, />undefined</);

const customersHtml = customerTable([
  { id: 11, name: 'undefined' },
  { id: 12, name: 'MOV-253' },
  { id: 13, name: 'María Pérez' },
]);

assert.match(customersHtml, /Cliente no identificado \(ID 11\)/);
assert.match(customersHtml, /Cliente no identificado \(referencia MOV-253\)/);
assert.match(customersHtml, /María Pérez/);
assert.doesNotMatch(customersHtml, />undefined</);
assert.doesNotMatch(customersHtml, />MOV-253</);
