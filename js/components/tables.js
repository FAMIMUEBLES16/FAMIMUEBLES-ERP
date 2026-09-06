import { formatCurrency } from '../utils/currency.js';
export const money = formatCurrency;
export const statusClass = value => String(value).toLowerCase().replaceAll(' ', '-').replaceAll('í','i');
export const badge = value => { const label=globalThis.famimueblesDemoMode && value==='Agotado' ? 'Sin stock - Demo' : value; return `<span class="badge ${statusClass(label)}">${label}</span>`; };
export function table(headers, rows) { return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`; }
export function page(kicker, heading, action, body) { return `<div class="page-head"><div><p class="eyebrow">${kicker}</p><h2>${heading}</h2></div>${action || ''}</div>${body}`; }
