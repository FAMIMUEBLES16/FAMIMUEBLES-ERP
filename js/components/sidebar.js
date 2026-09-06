const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
export const icons = {
	dashboard: icon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>'),
	box: icon('<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="m3 8 9 5 9-5"/>'),
	sales: icon('<circle cx="9" cy="20" r="1"/><circle cx="19" cy="20" r="1"/><path d="M3 4h2l2.4 11.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6"/>'),
	receipt: icon('<path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z"/><path d="M8 8h8M8 12h6"/>'),
	users: icon('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
	wallet: icon('<path d="M20 7V6a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v8a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V7"/><path d="M16 14h.01"/>'),
	settings: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.7 1.7-.06-.06a1.7 1.7 0 0 0-1.88-.34A1.7 1.7 0 0 0 15.12 20v.2h-2.4V20a1.7 1.7 0 0 0-1.04-1.56 1.7 1.7 0 0 0-1.88.34l-.06.06-1.7-1.7.06-.06A1.7 1.7 0 0 0 8.4 15a1.7 1.7 0 0 0-1.56-1.04H6v-2.4h.84A1.7 1.7 0 0 0 8.4 10a1.7 1.7 0 0 0-.34-1.88L8 8.06l1.7-1.7.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 12.68 5.2V5h2.4v.2a1.7 1.7 0 0 0 1.04 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.7 1.7-.06.06A1.7 1.7 0 0 0 19.4 10c.18.63.72 1.04 1.36 1.04H21v2.4h-.24A1.7 1.7 0 0 0 19.4 15Z"/>')
};
export const navItems = [{id:'dashboard',label:'Dashboard',icon:icons.dashboard},{id:'ventas',label:'Ventas',icon:icons.sales},{id:'facturacion',label:'Facturacion',icon:icons.receipt},{id:'productos',label:'Productos',icon:icons.box},{id:'inventario',label:'Inventario',icon:icons.box},{id:'traslados',label:'Traslados',icon:icons.box},{id:'proveedores',label:'Proveedores',icon:icons.users},{id:'compras',label:'Compras',icon:icons.receipt},{id:'cuentas-por-pagar',label:'Cuentas por pagar',icon:icons.wallet},{id:'clientes',label:'Clientes',icon:icons.users},{id:'cartera',label:'Cartera',icon:icons.wallet},{id:'apartados',label:'Apartados',icon:icons.box},{id:'locales',label:'Locales',icon:icons.box},{id:'operaciones',label:'Operaciones',icon:icons.settings},{id:'gastos',label:'Gastos',icon:icons.wallet},{id:'gasolina',label:'Gasolina',icon:icons.box},{id:'auditoria',label:'Auditoria',icon:icons.receipt},{id:'usuarios',label:'Usuarios',icon:icons.users},{id:'reportes',label:'Reportes',icon:icons.dashboard},{id:'configuracion',label:'Configuracion',icon:icons.settings}];
export const navGroups = [
	{id:'sales',label:'Ventas',icon:icons.sales,items:['ventas','clientes','cartera','apartados']},
	{id:'inventory',label:'Inventario',icon:icons.box,items:['productos','traslados','locales','reportes']},
	{id:'purchases',label:'Compras',icon:icons.receipt,items:['proveedores','compras','cuentas-por-pagar']},
	{id:'operations',label:'Operaciones',icon:icons.settings,items:['operaciones','gastos','gasolina']},
	{id:'administration',label:'Administracion',icon:icons.settings,items:['auditoria','usuarios','configuracion']},
];
