import { money, page, table, badge } from '../components/tables.js';
import { accountPayableSupplierName, calculateBalance, resolveAccountPayableSupplier, updateAccountPayableStatus } from '../services/accounts-payable-service.js?v=20261019-preserve-supplier-history-v1';
import { purchaseTotals, purchaseTotal } from '../services/purchase-service.js';

function findPurchaseForAccount(state, account) {
  const purchases = Array.isArray(state.purchases) ? state.purchases : [];
  const purchaseId = String(account.purchaseId || '');
  const direct = purchases.find(item => String(item.id) === purchaseId);
  if (direct) return direct;

  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const invoice = normalize(account.invoiceNumber);
  if (!invoice) return null;
  const matches = purchases.filter(item => [
    item.supplierInvoice, item.supplier_invoice, item.invoiceNumber,
    item.invoice_number, item.factura, item.numero_factura,
  ].some(value => normalize(value) === invoice));
  return matches.length === 1 ? matches[0] : null;
}

export function accountsPayableDetail(state, accountId) { const account=(state.accountsPayable || []).find(item=>item.id===accountId);if(!account)return '<p class="empty-state">Cuenta por pagar no encontrada.</p>';updateAccountPayableStatus(state,account);const supplier=resolveAccountPayableSupplier(state,account);const purchase=findPurchaseForAccount(state,account);const totals=purchase?purchaseTotals(state,purchase):{subtotal:0,tax:0,discount:0};const payments=(state.supplierPayments || []).filter(item=>item.accountId===account.id);return `<div class="modal-backdrop"><section class="modal payable-detail-modal"><button type="button" class="modal-close">×</button><p class="eyebrow">DETALLE DE CUENTA POR PAGAR</p><h2>${account.id}</h2><div class="detail-grid"><div><span>Proveedor</span><strong>${accountPayableSupplierName(state,account)}</strong></div><div><span>NIT</span><strong>${supplier?.document || account.supplierDocument || account.supplierNit || '-'}</strong></div><div><span>Contacto</span><strong>${supplier?.contact || supplier?.phone || '-'}</strong></div><div><span>Factura</span><strong>${account.invoiceNumber}</strong></div><div><span>Fecha</span><strong>${account.issueDate.slice(0,10)}</strong></div><div><span>Local</span><strong>${state.stores.find(item=>item.id===account.storeId)?.name || account.storeId}</strong></div><div><span>Vencimiento</span><strong>${account.dueDate.slice(0,10)}</strong></div><div><span>Estado</span><strong>${badge(account.status)}</strong></div></div>${purchase?`<h3>Productos</h3>${table(['Producto','Cantidad','Costo','IVA','Descuento'],purchase.items.map(item=>`<tr><td>${state.products.find(product=>product.id===item.productId)?.name || item.productId}</td><td>${item.quantity}</td><td>${money(item.unitCost)}</td><td>${item.iva}%</td><td>${money(item.discount)}</td></tr>`))}<p>Subtotal: <strong>${money(totals.subtotal)}</strong> · IVA: <strong>${money(totals.tax)}</strong> · Descuento: <strong>${money(totals.discount)}</strong> · Total: <strong>${money(purchaseTotal(state,purchase))}</strong></p>`:''}<div class="financial-summary"><div><span>Total</span><strong>${money(account.totalAmount)}</strong></div><div><span>Pagado</span><strong>${money(account.paidAmount)}</strong></div><div><span>Saldo</span><strong>${money(calculateBalance(account))}</strong></div></div><h3>Historial de pagos</h3>${table(['Fecha','Valor','Metodo','Referencia','Observacion'],payments.map(payment=>`<tr><td>${payment.date.slice(0,10)}</td><td>${money(payment.amount)}</td><td>${payment.method}</td><td>${payment.reference || '-'}</td><td>${payment.note || '-'}</td></tr>`))}</section></div>`; }
