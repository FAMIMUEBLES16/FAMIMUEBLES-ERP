import { money, page } from '../components/tables.js?v=2';
import { escapeHtml } from '../utils/html.js';

export const paymentMethods = ['Efectivo', 'Transferencia', 'Tarjeta', 'Sistecrédito', 'Credito', 'Apartado', 'Mixto'];
export function cartTotal(cart, transport = 0) { return cart.reduce((sum, item) => sum + (item.priceVenta ?? item.price) * item.quantity, 0) + Number(transport || 0); }
export function stockStatus(product) { if (product.stock <= 0) return 'Agotado'; if (product.stock === 1) return 'Bajo'; if (product.stock === 2) return 'Poco'; return 'Bien'; }
export function customerResults(customers, selectedId) {
	return customers.map(customer=>{
		const initials=String(customer.name||'').split(' ').map(name=>name[0]).slice(0,2).join('');
		return `<button type="button" class="customer-result ${customer.id===selectedId?'selected':''}" data-customer-id="${escapeHtml(customer.id)}"><span class="customer-avatar">${escapeHtml(initials)}</span><span><strong>${escapeHtml(customer.name)}</strong><small>${escapeHtml(customer.document)} · ${escapeHtml(customer.phone)}</small></span><b>${customer.balance>0?money(customer.balance):'Sin saldo'}</b></button>`;
	}).join('')||'<p class="empty-state">No se encontraron clientes.</p>';
}
export function productResults(products, storeId, state, query = '', onlyAvailable = true) {
	const term=String(query).trim().toLocaleLowerCase();
	const selectedInventory=Array.isArray(state?.inventoryByStore)?state.inventoryByStore.filter(item=>String(item.storeId)===String(storeId)):[];
	const stockByProduct=new Map(selectedInventory.map(item=>[String(item.productId),Number(item.quantity||0)]));
	const frequentIds=Array.isArray(state?.frequentProductIds)?state.frequentProductIds:[];
	const fallbackProducts=products.filter(product=>String(product.active??product.activo??true)!=='false');
	const candidates=term?fallbackProducts.filter(product=>[product.name,product.code,product.barcode,product.reference,product.category,product.brand].some(value=>String(value||'').toLocaleLowerCase().includes(term))):(frequentIds.length?fallbackProducts.filter(product=>frequentIds.includes(product.id)):fallbackProducts);
	const visible=candidates.filter(product=>!onlyAvailable||Number(stockByProduct.get(String(product.id))||0)>0).slice(0,8);
	return visible.map(product=>{
		const row=selectedInventory.find(item=>String(item.productId)===String(product.id));
		const stock=Number(row?.quantity??stockByProduct.get(String(product.id))??0);
		const price=Number(product.salePrice??product.price??0);
		return `<article class="product-result"><span class="product-art">${escapeHtml(product.name?product.name[0]:'P')}</span><span class="product-info"><strong>${escapeHtml(product.name)}</strong><small>${escapeHtml(product.code)} · ${escapeHtml(product.reference||product.code)} · ${escapeHtml(product.category)}</small></span><span class="product-price"><strong>${money(price)}</strong><small>${row?stockStatus({...product,stock}):'Sin inventario'} · ${escapeHtml(stock)} und.</small></span><button class="add-product-button" data-product-id="${escapeHtml(product.id)}" ${stock===0?'disabled':''}>＋</button></article>`;
	}).join('')||`<p class="empty-state">${term?'No se encontraron productos disponibles.':'No hay productos disponibles en este local.'}</p>`;
}
export function cartMarkup(cart) {
	if(!cart.length)return '<div class="empty-state">Selecciona un producto para comenzar la factura.</div>';
	return cart.map(item=>{
		const listPrice=Number(item.priceLista??item.price);
		const salePrice=Number(item.priceVenta??item.price);
		const quantity=Number(item.quantity||0);
		const discount=Math.max(0,listPrice-salePrice)*quantity;
		const id=escapeHtml(item.id);
		return `<div class="invoice-line"><div class="line-product"><span class="product-art small-art">${escapeHtml(item.name?item.name[0]:'P')}</span><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.reference||item.code)} · Lista ${money(listPrice)}</small></span></div><div class="quantity-control"><button data-decrease="${id}">−</button><input type="number" min="1" max="${escapeHtml(item.stock)}" value="${escapeHtml(quantity)}" data-quantity="${id}"><button data-increase="${id}">＋</button></div><label class="price-edit"><span>Venta</span><input type="number" min="0" max="${escapeHtml(listPrice)}" value="${escapeHtml(salePrice)}" data-price="${id}"></label><span class="line-discount">Descuento: ${money(discount)}</span><strong>${money(salePrice*quantity)}</strong><button class="remove-line" data-remove="${id}">×</button></div>`;
	}).join('');
}
function paymentMarkup(payment, enableMixedPayment) {
	return '<div class="payment-options">'+paymentMethods.filter(method=>method!=='Mixto'||enableMixedPayment).map(method=>{
		const value=method==='Credito'?'Crédito interno FAMIMUEBLES':method;
		return `<button type="button" class="payment-option ${payment===value||payment===method?'selected':''}" data-payment="${escapeHtml(value)}">${escapeHtml(method)}</button>`;
	}).join('')+'</div>';
}
export function renderFacturacion(data, cart, payment, selectedCustomerId, transport = 0, destination = '', note = '', storeId = '', mixedSistecreditoAmount = 0, mixedOtherMethod = 'Efectivo', enableMixedPayment = false) {
	const subtotal = cartTotal(cart);
	const total = subtotal + Number(transport || 0);
	const credit = payment === 'Apartado'
		? '<div class="credit-flow"><p class="eyebrow">APARTADO</p><label>Abono inicial<input class="field" type="number" min="0" value="0" data-apartado-initial></label></div>'
		: '';
	const mixedPayment = payment === 'Mixto'
		? '<div class="credit-flow"><p class="eyebrow">PAGO MIXTO</p><label>Valor pagado con Sistecrédito<input class="field" type="number" name="sistecreditoAmount" min="1" step="1" max="' + total + '" value="' + Number(mixedSistecreditoAmount || 0) + '" data-sistecredito-mixed-amount required></label><label>Otro medio de pago<select class="field" data-mixed-other-method>' + ['Efectivo', 'Transferencia', 'Tarjeta'].map(method => '<option value="' + method + '" ' + (method === mixedOtherMethod ? 'selected' : '') + '>' + method + '</option>').join('') + '</select></label><p class="muted">Valor restante por el otro medio: <strong data-mixed-other-amount>' + money(Math.max(0, total - Number(mixedSistecreditoAmount || 0))) + '</strong></p></div>'
		: '';
	const stores = data.stores.map(store => `<option value="${escapeHtml(store.id)}" ${store.id === storeId ? 'selected' : ''}>${escapeHtml(store.name)}</option>`).join('');
	return page(
		'VENTA RAPIDA',
		'Nueva factura',
		'<span class="demo-invoice-label">LOCAL DE VENTA</span><select class="field" data-sale-store>' + stores + '</select>',
		'<div class="invoice-meta"><span>Venta local</span><span>•</span><span>Vendedor: Administrador</span></div>' +
		'<div class="billing-workspace"><div class="billing-main">' +
			'<section class="billing-section"><div class="section-heading"><span class="step-number">01</span><div><h3>Cliente</h3><p>Busca por nombre, documento, telefono o codigo</p></div><button class="outline" data-action="new-customer">＋ Nuevo cliente</button></div>' +
				'<div class="billing-search"><input class="field" id="customer-search" placeholder="Buscar cliente..." autocomplete="off" aria-expanded="false" aria-controls="customer-results"><div class="customer-results billing-suggestions" id="customer-results"></div></div>' +
			'</section>' +
			'<section class="billing-section product-picker-section"><div class="section-heading"><span class="step-number">02</span><div><h3>Productos</h3><p>Solo productos con existencias</p></div><label class="availability-toggle"><input type="checkbox" data-billing-available checked> Disponibles</label></div>' +
				'<div class="billing-search"><input class="field" id="billing-product" placeholder="Buscar producto..." autocomplete="off" aria-expanded="false" aria-controls="product-results"><div class="product-results billing-suggestions" id="product-results"></div></div>' +
			'</section>' +
			'<section class="billing-section"><div class="section-heading"><span class="step-number">03</span><div><h3>Detalle de factura</h3><p>' + cart.length + ' productos agregados</p></div></div><div id="cart-items">' + cartMarkup(cart) + '</div></section>' +
		'</div><aside class="billing-summary"><h3>Resumen de venta</h3>' +
			'<div class="invoice-customer" data-invoice-customer hidden><span>Cliente</span><strong></strong></div>' +
			'<div class="financial-summary"><div><span>Subtotal</span><strong>' + money(subtotal) + '</strong></div><div><span>Transporte</span><strong>' + money(transport) + '</strong></div><div class="grand-total"><span>Total</span><strong>' + money(total) + '</strong></div></div>' +
			'<p class="eyebrow">FORMA DE PAGO</p>' + paymentMarkup(payment, enableMixedPayment) + credit + (enableMixedPayment ? mixedPayment : '') + '<button class="primary wide" data-action="finish-sale">Finalizar venta</button>' +
		'</aside></div>'
	);
}
