export function averageSalePrices(data) {
  const productsByKey = new Map();
  (data.products || []).forEach(product => {
    [product.id, product.code, product.sourceId, product.reference].filter(Boolean).forEach(key => productsByKey.set(String(key), product.id));
  });
  const totals = new Map();
  (data.sales || []).forEach(sale => (Array.isArray(sale.items) ? sale.items : []).forEach(item => {
    const productId = productsByKey.get(String(item.productId ?? item.producto_id ?? item.code ?? item.codigo ?? ''));
    const quantity = Number(item.quantity ?? item.cantidad ?? 0);
    const unitPrice = Number(item.priceVenta ?? item.unitPrice ?? item.price ?? item.valor_unitario);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) return;
    const current = totals.get(productId) || { quantity:0, value:0 };
    current.quantity += quantity;
    current.value += quantity * unitPrice;
    totals.set(productId, current);
  }));
  return new Map([...totals].map(([productId, total]) => [productId, total.value / total.quantity]));
}