import { createProduct, validateProduct } from '../services/product-service.js';

export function parseCsv(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return { rows:[], errors:['El archivo debe tener encabezados y al menos una fila.'] };
  const parseLine = line => { const values=[]; let value='', quoted=false; for (const character of line) { if (character === '"') quoted=!quoted; else if (character === ',' && !quoted) { values.push(value.trim()); value=''; } else value+=character; } values.push(value.trim()); return values; };
  const headers = parseLine(lines[0]).map(header => header.toLowerCase().replaceAll(' ','_'));
  const rows = [];
  const errors = [];
  lines.slice(1).forEach((line, index) => { const values=parseLine(line); const row=Object.fromEntries(headers.map((header,column)=>[header,values[column] || ''])); if (!row.codigo && !row.code) errors.push(`Fila ${index + 2}: codigo obligatorio.`); else rows.push(row); });
  return { rows, errors };
}
export function importPreview(state, text) {
  const parsed=parseCsv(text);
  return importPreviewRows(state, parsed.rows, parsed.errors);
}
export function importPreviewRows(state, rows, parseErrors=[]) {
  const errors=[...parseErrors]; const seen=new Set();
  let existingCount=0;
  rows.forEach((row,index)=>{const code=row.codigo || row.code;const normalizedCode=String(code||'').toLowerCase();if(seen.has(normalizedCode)) errors.push(`Fila ${index + 2}: codigo duplicado (${code}).`);if(state.products.some(product=>String(product.code).toLowerCase()===normalizedCode)){existingCount+=1;errors.push(`Fila ${index + 2}: el codigo ya existe (${code}).`);}seen.add(normalizedCode);try { validateProduct(state,{name:row.nombre || row.producto,code,price:row.precio || row.price,cost:row.costo || row.cost,minimum:row.minimo || row.min_stock || 0,maximum:row.maximo || row.max_stock || 0,iva:row.iva || 0}); } catch(error) { errors.push(`Fila ${index + 2}: ${error.message}`); }});
  return { rows, errors, newCount:rows.length-existingCount, existingCount };
}
export function importProducts(state, rows) { return rows.map(row => createProduct(state,{name:row.nombre || row.producto,code:row.codigo || row.code,reference:row.referencia || row.reference,category:row.categoria || row.category,subcategory:row.subcategoria || row.subcategory,brand:row.marca || row.brand,supplierName:row.proveedor || row.supplier,cost:row.costo || row.cost,price:row.precio || row.price,specialPrice:row.precio_especial || row.special_price,iva:row.iva || 0,minimum:row.minimo || row.min_stock || 0,maximum:row.maximo || row.max_stock || 0,barcode:row.codigo_de_barras || row.barcode})); }
