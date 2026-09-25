import { money, page } from '../components/tables.js';
import { icons } from '../components/sidebar.js';
import { calendarDate, formatDate, shiftCalendarDate } from '../utils/dates.js';
import { canonicalSellerName, normalizeSales } from './ventas.js';
import { renderTalonariosSummary } from './talonarios.js?v=6';

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

const dashboardCenterTextPlugin = {
  id: 'dashboardCenterText',
  beforeDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;

    const centerX = (chartArea.left + chartArea.right) / 2;
    const centerY = (chartArea.top + chartArea.bottom) / 2;
    const options = chart.config.options?.plugins?.centerText || {};
    const title = options.title || 'Total';
    const value = options.value || '$ 0';
    const trend = options.trend || '';
    const trendColor = options.trendColor || '#16A36A';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#8491A7';
    ctx.font = '600 12px Inter, sans-serif';
    ctx.fillText(title, centerX, centerY - 16);
    ctx.fillStyle = '#102A56';
    ctx.font = '700 18px Inter, sans-serif';
    ctx.fillText(value, centerX, centerY + 10);
    ctx.fillStyle = trendColor;
    ctx.font = '700 11px Inter, sans-serif';
    if (trend) ctx.fillText(trend, centerX, centerY + 32);
    ctx.restore();
  }
};

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
const sellerRanking = (data, currentDay = calendarDate()) => {
  const ranking = new Map();
  const targetDate = currentDay || calendarDate();
  const selector = currentDay === null ? 'all' : typeof currentDay === 'string' && currentDay.length >= 10 ? 'exact' : 'month';
  normalizeSales(data.sales || data.ventas || [])
    .filter(sale => {
      if (selector === 'all') return true;
      const saleDateValue = calendarDate(saleDate(sale));
      return selector === 'exact' ? saleDateValue === targetDate : saleDateValue.startsWith(targetDate.slice(0, 7));
    })
    .forEach(sale => {
      const name = sellerName(data, sale);
      const entry = ranking.get(name) || { name, count: 0, total: 0 };
      entry.count += 1;
      entry.total += safeNumber(sale.total);
      ranking.set(name, entry);
    });
  return [...ranking.values()].sort((left, right) => right.total - left.total || right.count - left.count || left.name.localeCompare(right.name));
};

function formatPercentage(value) {
  const number = Number(value) || 0;
  return `${Math.max(0, number).toFixed(0)}%`;
}

function humanizeSellerName(value = '') {
  return String(value || '').trim() || 'Sin vendedor';
}

function truncText(value, maxLength = 18) {
  const text = String(value || '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}...`;
}

function buildLegendRows(items) {
  if (!Array.isArray(items) || !items.length) {
    return '<div class="chart-legend-empty">Sin datos disponibles</div>';
  }

  const total = items.reduce((sum, item) => sum + safeNumber(item.value), 0);

  return items.map(item => {
    const percentage = total ? ((safeNumber(item.value) / total) * 100) : 0;
    return `
      <div class="chart-legend-row">
        <div class="chart-legend-left">
          <span class="chart-legend-dot" style="background:${item.color};"></span>
          <span class="chart-legend-name">${truncText(item.label, 24)}</span>
        </div>
        <div class="chart-legend-values">
          <span class="chart-legend-percent">${formatPercentage(percentage)}</span>
          <strong class="chart-legend-amount">${money(item.value)}</strong>
        </div>
      </div>
    `;
  }).join('');
}

function buildGrowthLabel(currentValue, previousValue = 0) {
  if (!previousValue) return currentValue > 0 ? '↑ +100%' : '↑ 0%';
  const growth = ((currentValue - previousValue) / previousValue) * 100;
  const sign = growth >= 0 ? '+' : '';
  return `↑ ${sign}${Math.round(growth)}%`;
}

function getSellerAvatar(name, palette = CHART_COLORS) {
  const safeName = humanizeSellerName(name);
  const initials = safeName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || '?';
  const index = safeName.split('').reduce((total, char) => total + char.charCodeAt(0), 0) % palette.length;
  return { initials, color: palette[index] };
}

function periodOptions(selected = 'today') {
  return `<select class="chart-filter" data-chart-filter="true" aria-label="Filtrar periodo">
    <option value="today" ${selected === 'today' ? 'selected' : ''}>Hoy</option>
    <option value="week" ${selected === 'week' ? 'selected' : ''}>Semana</option>
    <option value="month" ${selected === 'month' ? 'selected' : ''}>Mes</option>
  </select>`;
}

function periodSales(sales, period, today = calendarDate()) {
  const start = period === 'today' ? today : period === 'week' ? shiftCalendarDate(today, -6) : `${today.slice(0, 7)}-01`;
  return sales.filter(sale => {
    const date = calendarDate(saleDate(sale));
    return date >= start && date <= today;
  });
}

function generateCharts(data = {}) {
  const todayRanking = sellerRanking(data, calendarDate()).slice(0, 5);
  const rankingItems = todayRanking.map((item, index) => {
    const medal = ['🥇', '🥈', '🥉'][index] || '✨';
    const avatar = getSellerAvatar(item.name);
    const rankClass = ['gold', 'silver', 'bronze'][index] || 'neutral';
    return `
      <div class="rank-item ${rankClass}" tabindex="0" title="${item.name}: ${money(item.total)}" aria-label="${item.name}. ${money(item.total)} en ventas">
        <div class="rank-medal">${medal}</div>
        <div class="rank-position">${index + 1}</div>
        <div class="rank-avatar" style="background:${avatar.color};">${avatar.initials}</div>
        <div class="rank-name-wrap"><span>${truncText(item.name, 28)}</span></div>
        <span class="rank-tooltip" role="tooltip">${money(item.total)}</span>
      </div>
    `;
  }).join('');

  return `<div class="charts-grid dashboard-charts">
    <div class="chart-card chart-card-main"><div class="chart-card-heading"><div><span class="chart-kicker">TENDENCIA</span><h3>Ventas del mes</h3></div><span class="chart-unit">COP</span></div><canvas id="salesChart"></canvas></div>
    <div class="chart-card chart-card-small dashboard-chart-card">
      <div class="dashboard-card-header">
        <div class="dashboard-card-title-wrap">
          <span class="chart-header-icon">🏪</span>
          <div>
            <h3>Ventas por local</h3>
            <p>Distribución de ventas por sede</p>
          </div>
        </div>
        ${periodOptions()}
      </div>
      <div class="dashboard-donut-layout">
        <div class="donut-chart-shell"><canvas id="storeChart"></canvas></div>
        <div id="storeLegend" class="chart-legend"></div>
      </div>
      <div class="chart-summary">
        <div>
          <span class="chart-summary-label">Total ventas</span>
          <strong id="storeSummaryValue" class="chart-summary-value">$ 0</strong>
        </div>
        <span id="storeSummaryGrowth" class="chart-summary-growth">↑ 0%</span>
      </div>
    </div>
    <div class="chart-card chart-card-small dashboard-chart-card">
      <div class="dashboard-card-header">
        <div class="dashboard-card-title-wrap">
          <span class="chart-header-icon payment">💳</span>
          <div>
            <h3>Métodos de pago</h3>
            <p>Distribución de pagos recibidos</p>
          </div>
        </div>
        ${periodOptions()}
      </div>
      <div class="dashboard-donut-layout">
        <div class="donut-chart-shell"><canvas id="creditsChart"></canvas></div>
        <div id="paymentLegend" class="chart-legend"></div>
      </div>
      <div class="chart-summary payment-summary">
        <div>
          <span class="chart-summary-label">Total pagos</span>
          <strong id="paymentSummaryValue" class="chart-summary-value">$ 0</strong>
        </div>
        <span id="paymentSummaryGrowth" class="chart-summary-growth">↑ 0%</span>
      </div>
    </div>
    <div class="chart-card chart-card-small dashboard-chart-card seller-card">
      <div class="dashboard-card-header">
        <div class="dashboard-card-title-wrap">
          <span class="chart-header-icon seller">👥</span>
          <div>
            <h3>Ventas por vendedor</h3>
            <p>Rendimiento del equipo comercial</p>
          </div>
        </div>
        ${periodOptions()}
      </div>
      <div class="dashboard-donut-layout">
        <div class="donut-chart-shell"><canvas id="sellerChart"></canvas></div>
        <div id="sellerLegend" class="chart-legend"></div>
      </div>
      <div class="chart-summary seller-summary">
        <div>
          <span class="chart-summary-label">Total ventas</span>
          <strong id="sellerSummaryValue" class="chart-summary-value">$ 0</strong>
        </div>
        <span id="sellerSummaryGrowth" class="chart-summary-growth">↑ 0%</span>
      </div>
    </div>
    <div class="chart-card chart-card-small seller-ranking-panel">
      <div class="dashboard-card-header ranking-header">
        <div class="dashboard-card-title-wrap">
          <span class="chart-header-icon ranking">🏆</span>
          <div>
            <h3>Ranking del día</h3>
            <p>Top 5 vendedores por ventas</p>
          </div>
        </div>
        ${periodOptions()}
      </div>
      <div class="rank-list-modern" data-ranking-list="true">${rankingItems || '<div class="chart-legend-empty">No hay ventas registradas hoy.</div>'}</div>
      <div class="team-message"><span>¡Gran trabajo equipo!</span><small>Juntos hacemos crecer FAMIMUEBLES</small></div>
    </div>
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
  if (window.Chart && !window.Chart.registry?.get?.('dashboardCenterText')) {
    window.Chart.register(dashboardCenterTextPlugin);
  }
  canvas.__chartInstance = new Chart(ctx, config);
  if (!window.__dashboardCharts__) window.__dashboardCharts__ = {};
  window.__dashboardCharts__[canvasId] = canvas.__chartInstance;
}

function renderChartSummary(containerId, total, previousValue, label = 'Total ventas') {
  const element = document.getElementById(containerId);
  if (!element) return;
  const value = safeNumber(total)
  const growth = buildGrowthLabel(value, safeNumber(previousValue));
  const content = element;
  content.textContent = `${money(value)}`;
  const growthEl = document.getElementById(containerId.replace('Value', 'Growth'));
  if (growthEl) growthEl.textContent = growth;
}

function initCharts(data) {
  setTimeout(() => {
    if (!window.Chart) return;
    const baseOptions = { responsive:true, maintainAspectRatio:false, animation:{duration:900}, interaction:{mode:'index',intersect:false}, plugins:{legend:{display:false,labels:{usePointStyle:true,boxWidth:8,padding:14,font:{size:10}}}, tooltip:{mode:'index',intersect:false,callbacks:{title:items => items[0]?.label || '',label:context => `${context.dataset.label || context.label || ''}: ${context.dataset.yAxisID === 'transactions' ? `${context.parsed.y} transacciones` : money(context.parsed.y ?? context.parsed ?? 0)}`}}} };
    const today = calendarDate();
    const currentMonthStart = `${today.slice(0, 7)}-01`;
    const elapsedDays = Number(today.slice(8, 10));
    const currentMonthDays = Array.from({length:elapsedDays}, (_, i) => shiftCalendarDate(currentMonthStart, i));
    const previousMonthEnd = shiftCalendarDate(currentMonthStart, -1);
    const previousMonthDaysInMonth = Number(previousMonthEnd.slice(8, 10));
    const previousMonthStart = shiftCalendarDate(previousMonthEnd, -(previousMonthDaysInMonth - 1));
    const previousMonthDays = currentMonthDays.map((_, i) => shiftCalendarDate(previousMonthStart, Math.min(i, previousMonthDaysInMonth - 1)));
    const salesByDay = currentMonthDays.map(day => {
      return data.sales.filter(s => calendarDate(saleDate(s)) === day).reduce((sum,s) => sum + safeNumber(s.total), 0);
    });
    const salesCountByDay = currentMonthDays.map(day => data.sales.filter(sale => calendarDate(saleDate(sale)) === day).length);
    const previousSalesByDay = previousMonthDays.map(day => data.sales.filter(sale => calendarDate(saleDate(sale)) === day).reduce((sum,sale) => sum + safeNumber(sale.total), 0));
    const movingAverage = salesByDay.map((value,index) => {
      const window = salesByDay.slice(Math.max(0,index - 2), index + 1);
      return window.reduce((sum,item) => sum + item, 0) / window.length;
    });
    createChart('salesChart', { type:'line', data:{ labels:currentMonthDays.map(d => d.slice(5).replace('-', '/')), datasets:[
      {label:'Ventas actuales',data:salesByDay,borderColor:SALES_COLOR,backgroundColor:'rgba(37, 99, 235, 0.12)',pointBackgroundColor:SALES_COLOR,pointBorderColor:'#FFFFFF',pointBorderWidth:2,pointRadius:4,fill:true,tension:0.35},
      {label:'Promedio móvil',data:movingAverage,borderColor:'#F59E0B',backgroundColor:'transparent',pointBackgroundColor:'#F59E0B',pointRadius:3,borderWidth:2,borderDash:[6,4],fill:false,tension:0.35},
      {label:'Periodo anterior',data:previousSalesByDay,borderColor:'#10B981',backgroundColor:'transparent',pointBackgroundColor:'#10B981',pointRadius:3,borderWidth:2,fill:false,tension:0.35},
      {label:'Transacciones',data:salesCountByDay,yAxisID:'transactions',borderColor:'#06B6D4',backgroundColor:'transparent',pointBackgroundColor:'#06B6D4',pointRadius:3,borderWidth:2,fill:false,tension:0.35}
    ]}, options:{...baseOptions, scales:{x:{grid:{display:false}},y:{beginAtZero:true,ticks:{callback:value => money(value, true)}},transactions:{position:'right',beginAtZero:true,grid:{drawOnChartArea:false},ticks:{precision:0}}}} });

    const storeLabels = (data.stores || []).map(s => s.name || s.code || 'Sin local');
    const allSales = data.sales || [];
    const renderRanking = period => {
      const filtered = periodSales(allSales, period, today);
      const ranking = sellerRanking({ ...data, sales: filtered }, null).slice(0, 5);
      const rankingList = document.querySelector('[data-ranking-list]');
      if (!rankingList) return;
      rankingList.innerHTML = ranking.map((item, index) => {
        const medal = ['🥇', '🥈', '🥉'][index] || '✨';
        const avatar = getSellerAvatar(item.name);
        const rankClass = ['gold', 'silver', 'bronze'][index] || 'neutral';
        return `<div class="rank-item ${rankClass}" tabindex="0" title="${item.name}: ${money(item.total)}" aria-label="${item.name}. ${money(item.total)} en ventas"><div class="rank-medal">${medal}</div><div class="rank-position">${index + 1}</div><div class="rank-avatar" style="background:${avatar.color};">${avatar.initials}</div><div class="rank-name-wrap"><span>${truncText(item.name, 28)}</span></div><span class="rank-tooltip" role="tooltip">${money(item.total)}</span></div>`;
      }).join('') || '<div class="chart-legend-empty">No hay ventas en este periodo.</div>';
    };
    const renderPeriod = (period, target = 'all') => {
      const filteredSales = periodSales(allSales, period, today);
      const previousStart = period === 'today' ? shiftCalendarDate(today, -1) : period === 'week' ? shiftCalendarDate(today, -13) : shiftCalendarDate(`${today.slice(0, 7)}-01`, -1);
      const previousSales = period === 'month'
        ? allSales.filter(sale => calendarDate(saleDate(sale)).startsWith(previousStart.slice(0, 7)))
        : allSales.filter(sale => calendarDate(saleDate(sale)) >= previousStart && calendarDate(saleDate(sale)) < (period === 'today' ? today : shiftCalendarDate(today, -6)));
      const previousTotal = previousSales.reduce((sum, sale) => sum + safeNumber(sale.total), 0);
      if (target === 'all' || target === 'store') {
      const storeTotals = (data.stores || []).map(store => filteredSales.filter(sale => String(sale.storeId) === String(store.id)).reduce((sum, sale) => sum + safeNumber(sale.total), 0));
      const storeTotal = storeTotals.reduce((sum, value) => sum + value, 0);
      createChart('storeChart', { type:'doughnut', data:{ labels:storeLabels, datasets:[{label:'Ventas por local',data:storeTotals,backgroundColor:getDynamicColors(storeLabels.length, STORE_COLORS),borderColor:'#FFFFFF',borderWidth:3,hoverOffset:8}]}, options:{...baseOptions,cutout:'68%',plugins:{...baseOptions.plugins,legend:{display:false},centerText:{title:'Total ventas',value:money(storeTotal),trend:buildGrowthLabel(storeTotal, previousTotal),trendColor:'#16A36A'}}}});
      const storeLegend = document.getElementById('storeLegend');
      if (storeLegend) storeLegend.innerHTML = buildLegendRows(storeLabels.map((label, index) => ({ label, value: storeTotals[index] || 0, color: getDynamicColors(storeLabels.length, STORE_COLORS)[index] })));
      const storeSummaryValue = document.getElementById('storeSummaryValue');
      if (storeSummaryValue) storeSummaryValue.textContent = money(storeTotal);
      const storeSummaryGrowth = document.getElementById('storeSummaryGrowth');
      if (storeSummaryGrowth) storeSummaryGrowth.textContent = buildGrowthLabel(storeTotal, previousTotal);
      }

      if (target === 'all' || target === 'payment') {
      const paymentTotals = {};
      filteredSales.forEach(sale => { const method = sale.paymentMethod || sale.metodo_pago || 'Otros'; paymentTotals[method] = (paymentTotals[method] || 0) + safeNumber(sale.total); });
      const paymentLabels = Object.keys(paymentTotals);
      const paymentValues = Object.values(paymentTotals);
      const paymentTotal = paymentValues.reduce((sum, value) => sum + value, 0);
      createChart('creditsChart', { type:'doughnut', data:{labels:paymentLabels,datasets:[{data:paymentValues,backgroundColor:paymentLabels.map(getPaymentColor),borderColor:'#FFFFFF',borderWidth:3,hoverOffset:7}]}, options:{...baseOptions,cutout:'68%',plugins:{...baseOptions.plugins,legend:{display:false},centerText:{title:'Total pagos',value:money(paymentTotal),trend:buildGrowthLabel(paymentTotal,previousTotal),trendColor:'#16A36A'}}}});
      const paymentLegend = document.getElementById('paymentLegend');
      if (paymentLegend) paymentLegend.innerHTML = buildLegendRows(paymentLabels.map((label, index) => ({ label, value: paymentValues[index] || 0, color: paymentLabels.map(getPaymentColor)[index] })));
      const paymentSummaryValue = document.getElementById('paymentSummaryValue');
      if (paymentSummaryValue) paymentSummaryValue.textContent = money(paymentTotal);
      const paymentSummaryGrowth = document.getElementById('paymentSummaryGrowth');
      if (paymentSummaryGrowth) paymentSummaryGrowth.textContent = buildGrowthLabel(paymentTotal, previousTotal);
      }

      if (target === 'all' || target === 'seller') {
      const ranking = sellerRanking({ ...data, sales: filteredSales }, null);
      const topSellers = ranking.slice(0, 6);
      const sellerTotal = topSellers.reduce((sum, item) => sum + safeNumber(item.total), 0);
      createChart('sellerChart', { type:'doughnut', data:{labels:topSellers.map(item => item.name),datasets:[{label:'Ventas por vendedor',data:topSellers.map(item => item.total),backgroundColor:getDynamicColors(topSellers.length),borderColor:'#FFFFFF',borderWidth:3,hoverOffset:8}]}, options:{...baseOptions,cutout:'68%',plugins:{...baseOptions.plugins,legend:{display:false},centerText:{title:'Total ventas',value:money(sellerTotal),trend:buildGrowthLabel(sellerTotal,previousTotal),trendColor:'#16A36A'}}},onClick:()=>window.dispatchEvent(new CustomEvent('open-seller-ranking'))});
      const sellerLegend = document.getElementById('sellerLegend');
      if (sellerLegend) sellerLegend.innerHTML = buildLegendRows(topSellers.map((item, index) => ({label:item.name,value:item.total,color:getDynamicColors(topSellers.length)[index]})));
      const sellerSummaryValue = document.getElementById('sellerSummaryValue');
      if (sellerSummaryValue) sellerSummaryValue.textContent = money(sellerTotal);
      const sellerSummaryGrowth = document.getElementById('sellerSummaryGrowth');
      if (sellerSummaryGrowth) sellerSummaryGrowth.textContent = buildGrowthLabel(sellerTotal, previousTotal);
      }
      if (target === 'all' || target === 'ranking') renderRanking(period);
    };
    renderPeriod('today');
    document.querySelectorAll('[data-chart-filter]').forEach((filter, index) => {
      const targets = ['store', 'payment', 'seller', 'ranking'];
      filter.addEventListener('change', event => renderPeriod(event.target.value, targets[index] || 'all'));
    });

  }, 100);
}

export function renderDashboard(data) {
  const sales = normalizeSales(data.sales || data.ventas || []);
  const today = calendarDate();
  const month = today.slice(0, 7);
  const todaySales = sales.filter(sale => calendarDate(saleDate(sale)) === today);
  const monthSales = sales.filter(sale => calendarDate(saleDate(sale)).startsWith(month));
  const salesTotal = monthSales.reduce((sum, sale) => sum + safeNumber(sale.total), 0);
  const todayTotal = todaySales.reduce((sum, sale) => sum + safeNumber(sale.total), 0);
  const balance = (data.credits || []).reduce((sum, item) => sum + safeNumber(item.saldo_pendiente ?? Math.max(0, safeNumber(item.total) - safeNumber(item.initial) - safeNumber(item.paid))), 0);
  const activeCredits = (data.credits || []).filter(item => safeNumber(item.saldo_pendiente ?? Math.max(0, safeNumber(item.total) - safeNumber(item.initial) - safeNumber(item.paid))) > 0);
  const pendingPayables = (data.accountsPayable || []).filter(account => safeNumber(account.totalAmount ?? account.total) - safeNumber(account.paidAmount ?? account.paid) > 0);
  const payableBalance = pendingPayables.reduce((sum, account) => sum + Math.max(0, safeNumber(account.totalAmount ?? account.total) - safeNumber(account.paidAmount ?? account.paid)), 0);
  const inventory = data.inventoryByStore || [];
  const low = inventory.filter(row => safeNumber(row.quantity) > 0 && safeNumber(row.quantity) <= safeNumber(row.minimumStock ?? row.minimum)).length;
  const empty = inventory.filter(row => safeNumber(row.quantity) === 0).length;
  const alerts = low + empty;
  const topProducts = {};
  sales.forEach(sale => (sale.items || []).forEach(item => { const id = item.productId || item.producto_id; topProducts[id] = (topProducts[id] || 0) + safeNumber(item.quantity); }));
  const best = Object.entries(topProducts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const recent = [...sales].sort((a, b) => saleDate(b).localeCompare(saleDate(a))).slice(0, 5);
  const due = (data.installments || []).filter(item => {
    if (item.status === 'PAGADA') return false;
    const customer = String(item.customerName || item.customer || item.cliente || '').trim();
    const amount = safeNumber(item.amount || item.installmentAmount || item.valor_programado);
    return customer && customer !== 'Cliente' && amount > 0;
  }).slice(0, 4);
  const chartsHtml = generateCharts(data);
  initCharts({...data, sales});
  return page('RESUMEN GENERAL','Dashboard','<button class="primary" data-action="new-sale">＋ Nueva venta</button>',`<p class="date-line">${formatDate()} · Resumen operativo de FAMIMUEBLES</p>
    <div class="metric-grid dashboard-metrics">
      <div class="metric metric-sales"><span class="metric-icon metric-icon-sales">${icons.sales}</span><span>Ventas de hoy</span><strong>${money(todayTotal)}</strong><em>${todaySales.length} ventas registradas</em></div>
      <div class="metric"><span class="metric-icon metric-icon-success">${icons.sales}</span><span>Ventas del mes</span><strong>${money(salesTotal)}</strong><em>${monthSales.length} transacciones</em></div>
      <div class="metric"><span class="metric-icon metric-icon-purple">${icons.wallet}</span><span>Cartera total</span><strong>${money(balance)}</strong><em>${activeCredits.length} créditos activos</em></div>
      <div class="metric"><span class="metric-icon metric-icon-cyan">${icons.box}</span><span>Inventario total</span><strong>${inventory.reduce((sum, row) => sum + safeNumber(row.quantity), 0).toLocaleString('es-CO')}</strong><em>${(data.products || []).length} productos</em></div>
      <div class="metric"><span class="metric-icon metric-icon-orange">${icons.wallet}</span><span>Cuentas por pagar</span><strong>${money(payableBalance)}</strong><em>${pendingPayables.length} cuentas pendientes</em></div>
      <div class="metric metric-alert"><span class="metric-icon metric-icon-danger">${icons.settings}</span><span>Alertas</span><strong>${alerts}</strong><em>${empty} agotados · ${low} stock bajo</em></div>
    </div>
    ${chartsHtml}
    <div class="dashboard-lower-grid">
      <section class="panel dashboard-panel"><div class="panel-head"><div><h3>Productos más vendidos</h3><p class="muted">Unidades vendidas acumuladas</p></div><a href="#productos">Ver productos →</a></div><div class="dashboard-list">${best.length ? best.map(([id, quantity], index) => `<div class="dashboard-list-row"><b>${index + 1}</b><span>${productName(data, id)}</span><strong>${quantity}</strong></div>`).join('') : '<p class="muted">Aún no hay ventas registradas.</p>'}</div></section>
      <section class="panel dashboard-panel"><div class="panel-head"><div><h3>Próximos vencimientos</h3><p class="muted">Cuotas pendientes</p></div><a href="#cartera">Ver cartera →</a></div><div class="dashboard-list">${due.length ? due.map(item => `<div class="dashboard-list-row"><span>${item.customerName || item.customer || 'Cliente'}</span><strong>${money(item.amount || item.installmentAmount || 0)}</strong></div>`).join('') : '<p class="muted">No hay vencimientos pendientes.</p>'}</div></section>
      ${renderTalonariosSummary(data)}
    </div>
    <div class="dashboard-lower-grid dashboard-bottom-grid">
      <section class="panel dashboard-panel"><div class="panel-head"><div><h3>Ventas recientes</h3><p class="muted">Últimas transacciones reales</p></div><a href="#ventas">Ver todas →</a></div>${recent.length ? `<div class="table-wrap"><table><thead><tr><th>Factura</th><th>Local</th><th>Total</th><th>Pago</th><th>Fecha</th></tr></thead><tbody>${recent.map(sale => `<tr><td>${sale.id || sale.invoiceId || '-'}</td><td>${storeName(data, sale.storeId)}</td><td>${money(safeNumber(sale.total))}</td><td>${sale.paymentMethod || sale.metodo_pago || '-'}</td><td>${saleDate(sale).slice(0, 10) || '-'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No hay ventas registradas.</p>'}</section>
      <section class="panel dashboard-panel"><div class="panel-head"><div><h3>Alertas importantes</h3><p class="muted">Requieren atención</p></div><a href="#inventario">Ver inventario →</a></div><div class="dashboard-alerts"><p class="alert-line ${empty ? 'danger-text' : ''}"><b>●</b> ${empty} productos agotados</p><p class="alert-line ${low ? 'warning-text' : ''}"><b>●</b> ${low} productos con stock bajo</p><p class="alert-line"><b>●</b> ${(data.transfers || []).filter(item => item.status === 'EN_TRANSITO').length} traslados en tránsito</p></div></section>
    </div>`);
}