import { money, page } from '../components/tables.js';
import { icons } from '../components/sidebar.js';
import { formatDate } from '../utils/dates.js';
import { canonicalSellerName, normalizeSales } from './ventas.js';

const CHART_COLORS = [
  '#2563EB', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#F97316', '#EC4899',
  '#84CC16', '#6366F1', '#14B8A6', '#A855F7',
  '#0EA5E9', '#E11D48', '#D97706', '#64748B'
];
const STORE_COLORS = CHART_COLORS;
const SALES_COLOR = '#2563EB';
const PAYMENT_COLORS = {
  Efectivo: '#16A34A',
  QR: '#06B6D4',
  DaviPlata: '#7C3AED',
  Tarjeta: '#2563EB',
  Sistecredito: '#F97316',
  'Sistecrédito': '#F97316',
  Mixto: '#64748B',
  'Crédito': '#DC2626',
  Credito: '#DC2626',
  Nequi: '#EC4899'
};
const dynamicPaymentColors = new Map();

function getChartColor(index) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

function getDynamicColors(count, palette = CHART_COLORS) {
  return Array.from({ length: count }, (_, index) => palette[index % palette.length]);
}

function getPaymentColor(label) {
  if (PAYMENT_COLORS[label]) return PAYMENT_COLORS[label];
  if (!dynamicPaymentColors.has(label)) {
    const usedColors = new Set([
      ...Object.values(PAYMENT_COLORS),
      ...dynamicPaymentColors.values()
    ]);
    const availableColor = getDynamicColors(CHART_COLORS.length)
      .find(color => !usedColors.has(color));
    dynamicPaymentColors.set(label, availableColor || getChartColor(dynamicPaymentColors.size));
  }
  return dynamicPaymentColors.get(label);
}

const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const saleDate = sale => sale.date || sale.fecha || sale.createdAt || '';
const storeName = (data, id) => data.stores?.find(item => String(item.id) === String(id))?.name || 'Sin local';
const productName = (data, id) => data.products?.find(item => String(item.id) === String(id))?.name || 'Producto';
const sellerValue = sale => sale.seller || sale.vendedor || sale.empleado || sale.usuario || sale.userName || sale.user || sale.createdBy || sale.created_by || sale.userId || sale.usuario_id || '';
const sellerName = (data, sale) => { const value = sellerValue(sale); const user = (data.users || []).find(item => String(item.id) === String(value) || String(item.username) === String(value)); return canonicalSellerName(user?.name || user?.username || value); };
const sellerRanking = data => { const ranking = new Map(); normalizeSales(data.sales || data.ventas || []).forEach(sale => { const name = sellerName(data, sale); const entry = ranking.get(name) || { name, count: 0, total: 0 }; entry.count += 1; entry.total += safeNumber(sale.total); ranking.set(name, entry); }); return [...ranking.values()].sort((left, right) => right.total - left.total || right.count - left.count || left.name.localeCompare(right.name)); };

function generateCharts() {
  return `<div class="charts-grid dashboard-charts">
    <div class="chart-card chart-card-main"><div class="chart-card-heading"><div><span class="chart-kicker">TENDENCIA</span><h3>Ventas últimos 7 días</h3></div><span class="chart-unit">COP</span></div><canvas id="salesChart"></canvas></div>
    <div class="chart-card chart-card-small"><h3>Ventas por local</h3><canvas id="storeChart"></canvas></div>
    <div class="chart-card chart-card-small"><h3>Métodos de pago</h3><canvas id="creditsChart"></canvas></div>
    <div class="chart-card chart-card-small seller-chart-card"><div class="panel-head"><h3>Ventas por vendedor</h3><button class="outline" type="button" data-action="seller-ranking">Ver ranking</button></div><canvas id="sellerChart"></canvas></div>
    <div class="chart-card chart-card-small"><h3>Ventas por categoría</h3><canvas id="categoryChart"></canvas></div>
    <div class="chart-card chart-card-small"><h3>Estado del inventario</h3><canvas id="inventoryStatusChart"></canvas></div>
    <div class="chart-card chart-card-small"><h3>Cartera por estado</h3><canvas id="portfolioChart"></canvas></div>
    <div class="chart-card chart-card-small"><h3>Flujo del periodo</h3><canvas id="cashflowChart"></canvas></div>
  </div>`;
}

function createChart(canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (canvas.__chartInstance) {
    try { canvas.__chartInstance.destroy(); } catch (error) {}
    canvas.__chartInstance = null;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx || !window.Chart) return;
  canvas.__chartInstance = new Chart(ctx, config);
  if (!window.__dashboardCharts__) window.__dashboardCharts__ = {};
  window.__dashboardCharts__[canvasId] = canvas.__chartInstance;
}

function initCharts(data) {
  setTimeout(() => {
    if (!window.Chart) return;
    const baseOptions = { responsive:true, maintainAspectRatio:false, animation:{duration:550}, plugins:{legend:{labels:{usePointStyle:true,boxWidth:8,padding:14,font:{size:10}}}, tooltip:{callbacks:{label:context => `${context.dataset.label || ''}: ${money(context.parsed.y ?? context.parsed ?? 0)}`}}} };
    const last7Days = Array.from({length:7}, (_,i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6-i));
      return d.toISOString().slice(0,10);
    });
    const salesByDay = last7Days.map(day => {
      return data.sales.filter(s => saleDate(s).startsWith(day)).reduce((sum,s) => sum + safeNumber(s.total), 0);
    });
    createChart('salesChart', { type:'line', data:{ labels:last7Days.map(d => d.slice(5).replace('-', '/')), datasets:[{label:'Ventas',data:salesByDay,borderColor:SALES_COLOR,backgroundColor:'rgba(37, 99, 235, 0.12)',pointBackgroundColor:SALES_COLOR,pointBorderColor:'#FFFFFF',pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35}]}, options:{...baseOptions, scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:value => money(value, true)}}}} });
    
    const storeSales = data.stores.map(store => {
      const total = data.sales.filter(sale => String(sale.storeId) === String(store.id)).reduce((sum, sale) => sum + safeNumber(sale.total), 0);
      return total;
    });
    const storeLabels = data.stores.map(s => s.name || s.code);
    createChart('storeChart', { type:'bar', data:{ labels:storeLabels, datasets:[{label:'Ventas',data:storeSales,backgroundColor:getDynamicColors(storeLabels.length, STORE_COLORS),borderRadius:6,barPercentage:.7}]}, options:{...baseOptions,indexAxis:'y',scales:{x:{beginAtZero:true,ticks:{callback:value => money(value, true)}},y:{grid:{display:false}}},plugins:{...baseOptions.plugins,legend:{display:false}}} });
    
    const paymentTotals = {};
    data.sales.forEach(sale => { const method = sale.paymentMethod || sale.metodo_pago || 'Otros'; paymentTotals[method] = (paymentTotals[method] || 0) + safeNumber(sale.total); });
    const paymentLabels = Object.keys(paymentTotals);
    createChart('creditsChart', { type:'doughnut', data:{ labels:paymentLabels, datasets:[{data:Object.values(paymentTotals),backgroundColor:paymentLabels.map(getPaymentColor),borderColor:'#FFFFFF',borderWidth:3,hoverOffset:7}]}, options:{...baseOptions,cutout:'64%',plugins:{...baseOptions.plugins,legend:{position:'bottom'}}} });
    const ranking = sellerRanking(data);
    createChart('sellerChart', { type:'bar', data:{ labels:ranking.slice(0,6).map(item => item.name), datasets:[{label:'Ventas',data:ranking.slice(0,6).map(item => item.total),backgroundColor:'#1769ff',borderRadius:6,barPercentage:.65}]}, options:{...baseOptions,indexAxis:'y',scales:{x:{beginAtZero:true,ticks:{callback:value => money(value, true)}},y:{grid:{display:false}}},plugins:{...baseOptions.plugins,legend:{display:false}},onClick:()=>window.dispatchEvent(new CustomEvent('open-seller-ranking'))} });

    const categoryTotals = {};
    data.sales.forEach(sale => (sale.items || []).forEach(item => { const product = data.products.find(entry => String(entry.id) === String(item.productId || item.producto_id)); const category = product?.category || product?.categoryName || item.category || 'Sin categoría'; const lineTotal = item.subtotal ?? item.total ?? (safeNumber(item.priceVenta ?? item.price) * safeNumber(item.quantity || 1)); categoryTotals[category] = (categoryTotals[category] || 0) + safeNumber(lineTotal); }));
    const categoryLabels = Object.keys(categoryTotals).sort((a,b) => categoryTotals[b] - categoryTotals[a]).slice(0,7);
    createChart('categoryChart', { type:'bar', data:{labels:categoryLabels,datasets:[{label:'Ventas',data:categoryLabels.map(label => categoryTotals[label]),backgroundColor:'#f2b01e',borderRadius:6}]}, options:{...baseOptions,indexAxis:'y',scales:{x:{beginAtZero:true,ticks:{callback:value => money(value, true)}},y:{grid:{display:false}}},plugins:{...baseOptions.plugins,legend:{display:false}}} });

    const inventoryTotals = { Disponible:0, 'Stock bajo':0, Agotado:0 };
    (data.inventoryByStore || []).forEach(row => { const quantity = safeNumber(row.quantity); const minimum = safeNumber(row.minimumStock ?? row.minimum); if (quantity === 0) inventoryTotals.Agotado += 1; else if (quantity <= minimum) inventoryTotals['Stock bajo'] += 1; else inventoryTotals.Disponible += 1; });
    createChart('inventoryStatusChart', { type:'doughnut', data:{labels:Object.keys(inventoryTotals),datasets:[{data:Object.values(inventoryTotals),backgroundColor:['#16a34a','#f59e0b','#dc2626'],borderColor:'#fff',borderWidth:3,hoverOffset:7}]}, options:{...baseOptions,cutout:'62%',plugins:{...baseOptions.plugins,legend:{position:'bottom'}}} });

    const portfolio = { Vigente:0, Vencida:0 };
    (data.credits || []).forEach(item => { const outstanding = Math.max(0, safeNumber(item.saldo_pendiente ?? safeNumber(item.total) - safeNumber(item.initial) - safeNumber(item.paid))); const overdue = String(item.status || '').toLowerCase().includes('venc'); portfolio[overdue ? 'Vencida' : 'Vigente'] += outstanding; });
    createChart('portfolioChart', { type:'doughnut', data:{labels:Object.keys(portfolio),datasets:[{data:Object.values(portfolio),backgroundColor:['#1769ff','#dc2626'],borderColor:'#fff',borderWidth:3,hoverOffset:7}]}, options:{...baseOptions,cutout:'62%',plugins:{...baseOptions.plugins,legend:{position:'bottom'}}} });

    const income = data.sales.reduce((sum,sale) => sum + safeNumber(sale.total), 0);
    const expenses = (data.expenses || []).reduce((sum,item) => sum + safeNumber(item.amount ?? item.valor), 0);
    const purchases = (data.purchases || []).reduce((sum,item) => sum + safeNumber(item.total ?? item.amount ?? item.valor), 0);
    createChart('cashflowChart', { type:'bar', data:{labels:['Ingresos','Gastos','Compras'],datasets:[{label:'Valor',data:[income,expenses,purchases],backgroundColor:['#16a34a','#dc2626','#f59e0b'],borderRadius:6,barPercentage:.55}]}, options:{...baseOptions,scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:value => money(value, true)}}},plugins:{...baseOptions.plugins,legend:{display:false}}} });
  }, 100);
}

export function renderDashboard(data) {
  const sales = normalizeSales(data.sales || data.ventas || []);
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todaySales = sales.filter(saleDateValue => saleDate(saleDateValue).startsWith(today));
  const monthSales = sales.filter(saleDateValue => saleDate(saleDateValue).startsWith(month));
  const salesTotal = monthSales.reduce((sum, sale) => sum + safeNumber(sale.total), 0);
  const todayTotal = todaySales.reduce((sum, sale) => sum + safeNumber(sale.total), 0);
  const balance = (data.credits || []).reduce((sum, item) => sum + safeNumber(item.saldo_pendiente ?? Math.max(0, safeNumber(item.total) - safeNumber(item.initial) - safeNumber(item.paid))), 0);
  const inventory = data.inventoryByStore || [];
  const low = inventory.filter(row => safeNumber(row.quantity) > 0 && safeNumber(row.quantity) <= safeNumber(row.minimumStock ?? row.minimum)).length;
  const empty = inventory.filter(row => safeNumber(row.quantity) === 0).length;
  const alerts = low + empty;
  const topProducts = {};
  sales.forEach(sale => (sale.items || []).forEach(item => { const id = item.productId || item.producto_id; topProducts[id] = (topProducts[id] || 0) + safeNumber(item.quantity); }));
  const best = Object.entries(topProducts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recent = [...sales].sort((a, b) => saleDate(b).localeCompare(saleDate(a))).slice(0, 5);
  const due = (data.installments || []).filter(item => item.status !== 'PAGADA').slice(0, 4);
  const chartsHtml = generateCharts(data);
  initCharts({...data, sales});
  return page('RESUMEN GENERAL','Dashboard','<button class="primary" data-action="new-sale">＋ Nueva venta</button>',`<p class="date-line">${formatDate()} · Resumen operativo de FAMIMUEBLES</p>
    <div class="metric-grid dashboard-metrics">
      <div class="metric metric-sales"><span class="metric-icon metric-icon-sales">${icons.sales}</span><span>Ventas de hoy</span><strong>${money(todayTotal)}</strong><em>${todaySales.length} ventas registradas</em></div>
      <div class="metric"><span class="metric-icon metric-icon-success">${icons.sales}</span><span>Ventas del mes</span><strong>${money(salesTotal)}</strong><em>${monthSales.length} transacciones</em></div>
      <div class="metric"><span class="metric-icon metric-icon-purple">${icons.wallet}</span><span>Cartera total</span><strong>${money(balance)}</strong><em>${(data.credits || []).length} créditos activos</em></div>
      <div class="metric"><span class="metric-icon metric-icon-cyan">${icons.box}</span><span>Inventario total</span><strong>${inventory.reduce((sum, row) => sum + safeNumber(row.quantity), 0).toLocaleString('es-CO')}</strong><em>${(data.products || []).length} productos</em></div>
      <div class="metric"><span class="metric-icon metric-icon-orange">${icons.users}</span><span>Créditos activos</span><strong>${(data.credits || []).length}</strong><em>Saldo ${money(balance)}</em></div>
      <div class="metric metric-alert"><span class="metric-icon metric-icon-danger">${icons.settings}</span><span>Alertas</span><strong>${alerts}</strong><em>${empty} agotados · ${low} stock bajo</em></div>
    </div>
    ${chartsHtml}
    <div class="dashboard-lower-grid">
      <section class="panel dashboard-panel"><div class="panel-head"><div><h3>Productos más vendidos</h3><p class="muted">Unidades vendidas acumuladas</p></div><a href="#productos">Ver productos →</a></div><div class="dashboard-list">${best.length ? best.map(([id, quantity], index) => `<div class="dashboard-list-row"><b>${index + 1}</b><span>${productName(data, id)}</span><strong>${quantity}</strong></div>`).join('') : '<p class="muted">Aún no hay ventas registradas.</p>'}</div></section>
      <section class="panel dashboard-panel"><div class="panel-head"><div><h3>Próximos vencimientos</h3><p class="muted">Cuotas pendientes</p></div><a href="#cartera">Ver cartera →</a></div><div class="dashboard-list">${due.length ? due.map(item => `<div class="dashboard-list-row"><span>${item.customerName || item.customer || 'Cliente'}</span><strong>${money(item.amount || item.installmentAmount || 0)}</strong></div>`).join('') : '<p class="muted">No hay vencimientos pendientes.</p>'}</div></section>
    </div>
    <div class="dashboard-lower-grid dashboard-bottom-grid">
      <section class="panel dashboard-panel"><div class="panel-head"><div><h3>Ventas recientes</h3><p class="muted">Últimas transacciones reales</p></div><a href="#ventas">Ver todas →</a></div>${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Factura</th><th>Local</th><th>Total</th><th>Pago</th><th>Fecha</th></tr></thead><tbody>${recent.map(sale => `<tr><td>${sale.id || sale.invoiceId || '-'}</td><td>${storeName(data, sale.storeId)}</td><td>${money(safeNumber(sale.total))}</td><td>${sale.paymentMethod || sale.metodo_pago || '-'}</td><td>${saleDate(sale).slice(0, 10) || '-'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No hay ventas registradas.</p>'}</section>
      <section class="panel dashboard-panel"><div class="panel-head"><div><h3>Alertas importantes</h3><p class="muted">Requieren atención</p></div><a href="#inventario">Ver inventario →</a></div><div class="dashboard-alerts"><p class="alert-line ${empty ? 'danger-text' : ''}"><b>●</b> ${empty} productos agotados</p><p class="alert-line ${low ? 'warning-text' : ''}"><b>●</b> ${low} productos con stock bajo</p><p class="alert-line"><b>●</b> ${(data.transfers || []).filter(item => item.status === 'EN_TRANSITO').length} traslados en tránsito</p></div></section>
    </div>`);
}