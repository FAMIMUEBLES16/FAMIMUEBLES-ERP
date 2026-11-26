import { formatCurrency } from '../utils/currency.js';
import { escapeHtml } from '../utils/html.js';
export const money = formatCurrency;
export const statusClass = value => String(value).toLowerCase().replaceAll(' ', '-').replaceAll('í','i');
export const badge = value => { const label=globalThis.famimueblesDemoMode && value==='Agotado' ? 'Sin stock - Demo' : value; const className=statusClass(label).replace(/[^a-z0-9_-]/gi,''); return `<span class="badge ${className}">${escapeHtml(label)}</span>`; };
export function table(headers, rows) {
  const body = typeof rows === 'string'
    ? rows
    : Array.isArray(rows)
      ? rows.join('')
      : '';
  return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
}
export function page(kicker, heading, action, body) { return `<div class="page-head"><div><p class="eyebrow">${escapeHtml(kicker)}</p><h2>${escapeHtml(heading)}</h2></div>${action || ''}</div>${body}`; }
export function recordSummary(count, title, amount, amountLabel = 'Valor') {
  return `<div class="record-summary"><strong class="record-summary-count">${escapeHtml(count)}</strong><div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(amountLabel)}: ${money(amount)}</p></div></div>`;
}
