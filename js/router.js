export const routes = ['dashboard','ventas','facturacion','productos','inventario','traslados','proveedores','compras','cuentas-por-pagar','clientes','creditos','cartera','apartados','locales','gastos','gasolina','auditoria','usuarios','reportes','operaciones','paridad','configuracion'];
export function currentRoute() { const route = location.hash.slice(1); return route === 'creditos' ? 'cartera' : (routes.includes(route) ? route : 'dashboard'); }
export function navigate(route) { if (routes.includes(route)) location.hash = `#${route}`; }
export function startRouter(render) { window.addEventListener('hashchange', render); render(); }
