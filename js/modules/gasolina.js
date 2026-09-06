import { formatCurrency } from '../utils/currency.js';
import { page, table } from '../components/tables.js';

function parseRemoteRow(item = {}) {
  const raw = item?.data_json;
  if (!raw) return item;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      return { ...item, ...parsed };
    }
  } catch (error) {
    // Ignorar si no hay JSON válido en la fila.
  }
  return item;
}

function normalizeFuelRecords(items = []) {
  return (Array.isArray(items) ? items : []).map(item => {
    const row = parseRemoteRow(item);
    const amount = Number(Object.prototype.hasOwnProperty.call(row, 'amount') ? row.amount :
      Object.prototype.hasOwnProperty.call(row, 'valor') ? row.valor :
      Object.prototype.hasOwnProperty.call(row, 'total') ? row.total :
      Object.prototype.hasOwnProperty.call(row, 'monto') ? row.monto : 0);
    const quantity = Number(Object.prototype.hasOwnProperty.call(row, 'quantity') ? row.quantity :
      Object.prototype.hasOwnProperty.call(row, 'cantidad') ? row.cantidad :
      Object.prototype.hasOwnProperty.call(row, 'litros') ? row.litros : 0);
    const date = row.date ?? row.fecha ?? row.createdAt ?? '';
    const local = row.storeId ?? row.local ?? row.local_id ?? '';
    return {
      ...row,
      id: String(row.id ?? 'FUE-01'),
      date: String(date),
      storeId: String(local),
      vehicle: String(row.vehicle ?? row.carro ?? row.vehiculo ?? row.placa ?? 'N/A'),
      driver: String(row.driver ?? row.conductor ?? row.empleado ?? row.usuario ?? 'N/A'),
      quantity: Number.isFinite(quantity) ? quantity : 0,
      amount: Number.isFinite(amount) ? amount : 0,
      unit: String(row.unit ?? 'litros'),
      mileage: Number(row.mileage ?? row.kilometraje ?? 0),
      station: String(row.station ?? row.estacion ?? row.lugar ?? 'N/A'),
    };
  });
}

export function renderGasolina(state) {
  const records = normalizeFuelRecords(state.fuelRecords || state.gasolina || []);
  return page(
    'OPERACION',
    'Gasolina',
    '<button class="primary" data-action="new-fuel">＋ Registrar gasolina</button>',
    `<div class="admin-summary"><div><span>Total</span><strong>${formatCurrency(records.reduce((sum, item) => sum + Number(item.amount || 0), 0))}</strong></div><div><span>Combustible</span><strong>${records.reduce((sum, item) => sum + Number(item.quantity || 0), 0)} L</strong></div><div><span>Registros</span><strong>${records.length}</strong></div></div>${table(['Fecha','Local','Vehiculo','Conductor','Combustible','Valor','Kilometraje','Estacion'], records.map(item => `<tr><td>${item.date}</td><td>${(state.stores || []).find(store => store.id === item.storeId)?.name || item.storeId || 'Sin local'}</td><td>${item.vehicle}</td><td>${item.driver}</td><td>${item.quantity} ${item.unit}</td><td><strong>${formatCurrency(item.amount)}</strong></td><td>${item.mileage} km</td><td>${item.station}</td></tr>`))}`
  );
}
