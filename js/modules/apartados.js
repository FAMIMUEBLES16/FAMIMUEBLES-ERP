import { money, page, table, badge } from '../components/tables.js';

const balance = item => Math.max(0, Number(item.saldoPendiente ?? item.saldo_pendiente ?? item.total - item.initial - item.paid));

export function renderApartados(data) {
  const isAdmin = String(JSON.parse(localStorage.getItem('famimuebles-user') || '{}').role || '').toUpperCase() === 'ADMINISTRADOR';
  const apartados = data.apartados.map(item => {
    const initial = Number(item.initial ?? item.abono_inicial ?? 0);
    const total = Number(item.total ?? item.valor_total ?? item.total_apartado ?? 0);
    const paidTotal = Number(item.valor_pagado ?? 0);
    return { ...item, total, initial, paid:Math.max(0, paidTotal - initial), customer:item.customer || item.cliente_nombre || item.cliente || 'Sin cliente', date:item.date || item.fecha || item.creado_en || '', status:item.status || 'Activo' };
  });
  return page('CARTERA','Apartados','<button class="primary" data-action="payment">＋ Registrar abono</button>',
    `${table(['Apartado','Cliente','Fecha','Total','Inicial','Abonado','Pendiente','Estado','Acciones'], apartados.map(item => { const pending=balance(item); return `<tr><td><strong>${item.id}</strong></td><td>${item.customer}</td><td>${item.date}</td><td>${money(item.total)}</td><td>${money(item.initial)}</td><td>${money(item.paid)}</td><td>${money(pending)}</td><td>${badge(item.status)}</td><td>${pending > 0 ? `<button class="table-action" data-action="apartado-payment" data-apartado-id="${item.id}">Registrar abono</button>` : ''}${isAdmin?`<button class="table-action" data-action="edit-apartado" data-apartado-id="${item.id}">Editar</button><button class="table-action danger-text" data-action="delete-apartado" data-apartado-id="${item.id}">Eliminar</button>`:''}</td></tr>`; }))}`);
}