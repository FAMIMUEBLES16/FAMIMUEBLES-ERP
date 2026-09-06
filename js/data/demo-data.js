export const demoState = {
  products: [
    { id:'PROD-00001', name:'Sofa Roma', code:'SF-001', reference:'SF-001', category:'Sala', price:2450000, minimumPrice:2100000, estado:'Activo', activo:true, stock:9, minimum:3, ideal:9, storeId:'LOC-00001' },
    { id:'PROD-00002', name:'Comedor Niza 6 puestos', code:'CO-014', reference:'CO-014', category:'Comedor', price:1890000, minimumPrice:1650000, estado:'Activo', activo:true, stock:4, minimum:4, ideal:12, storeId:'LOC-00002' },
    { id:'PROD-00003', name:'Cama Oslo King', code:'CM-022', reference:'CM-022', category:'Habitacion', price:3200000, minimumPrice:2800000, estado:'Activo', activo:true, stock:2, minimum:3, ideal:9, storeId:'LOC-00003' },
    { id:'PROD-00004', name:'Mesa auxiliar Arce', code:'MS-008', reference:'MS-008', category:'Complementos', price:420000, minimumPrice:350000, estado:'Activo', activo:true, stock:18, minimum:5, ideal:15, storeId:'LOC-00001' },
    { id:'PROD-00005', name:'Poltrona Nube', code:'PL-031', reference:'PL-031', category:'Sala', price:780000, minimumPrice:650000, estado:'Activo', activo:true, stock:0, minimum:2, ideal:6, storeId:'LOC-00004' }
  ],
  customers: [
    { id:'CLI-00001', name:'Laura Martinez', document:'52.418.903', phone:'300 445 2190', email:'laura.demo@correo.test', purchases:8, credits:1, balance:1250000, status:'Activo' },
    { id:'CLI-00002', name:'Carlos Rodriguez', document:'79.102.441', phone:'315 882 1104', email:'carlos.demo@correo.test', purchases:4, credits:2, balance:4800000, status:'Activo' },
    { id:'CLI-00003', name:'Ana Torres', document:'1.020.331.778', phone:'301 770 4481', email:'ana.demo@correo.test', purchases:12, credits:0, balance:0, status:'Activo' }
  ],
  sales: [
    { id:'VEN-00001', invoiceId:'FAC-00001', customerId:'CLI-00001', customer:'Laura Martinez', items:[{productId:'PROD-00001',quantity:1,priceLista:2450000,priceVenta:2450000,price:2450000}], transport:0, transportDestination:'', transportNote:'', date:'Hoy, 10:24', total:2450000, paymentMethod:'Credito interno FAMIMUEBLES', payment:'Credito', status:'Completada' },
    { id:'VEN-00002', invoiceId:'FAC-00002', customerId:'CLI-00003', customer:'Ana Torres', items:[{productId:'PROD-00005',quantity:1,price:780000}], date:'Hoy, 09:12', total:780000, paymentMethod:'Tarjeta', payment:'Tarjeta', status:'Completada' },
    { id:'VEN-00003', invoiceId:'FAC-00003', customerId:'CLI-00002', customer:'Carlos Rodriguez', items:[{productId:'PROD-00002',quantity:1,price:1890000}], date:'Ayer, 16:40', total:1890000, paymentMethod:'Transferencia', payment:'Transferencia', status:'Completada' }
  ],
  credits: [
    { id:'CR-00001', customerId:'CLI-00001', saleId:'VEN-00001', customer:'Laura Martinez', date:'12 ago 2026', total:2450000, originalAmount:2450000, initial:500000, downPayment:500000, financedAmount:1950000, paid:650000, installments:10, installmentsCount:10, installmentAmount:195000, next:'12 sep 2026', startDate:'12 ago 2026', status:'Al dia' },
    { id:'CR-00002', customerId:'CLI-00002', saleId:null, customer:'Carlos Rodriguez', date:'02 jul 2026', total:5400000, originalAmount:5400000, initial:600000, downPayment:600000, financedAmount:4800000, paid:1200000, installments:12, installmentsCount:12, installmentAmount:400000, next:'02 sep 2026', startDate:'02 jul 2026', status:'Proximo a vencer' },
    { id:'CR-00003', customerId:'CLI-00002', saleId:null, customer:'Carlos Rodriguez', date:'18 may 2026', total:3200000, originalAmount:3200000, initial:400000, downPayment:400000, financedAmount:2800000, paid:400000, installments:8, installmentsCount:8, installmentAmount:350000, next:'18 ago 2026', startDate:'18 may 2026', status:'Vencido' }
  ],
  installments: [
    { id:'CUO-00001', creditId:'CR-00001', number:1, dueDate:'12 sep 2026', amount:195000, paidAmount:0, paidDate:null, paymentDate:null, status:'Pendiente' },
    { id:'CUO-00002', creditId:'CR-00002', number:1, dueDate:'02 sep 2026', amount:400000, paidAmount:0, paidDate:null, paymentDate:null, status:'Pendiente' },
    { id:'CUO-00003', creditId:'CR-00003', number:1, dueDate:'18 ago 2026', amount:350000, paidAmount:0, paidDate:null, paymentDate:null, status:'Vencida' }
  ],
  payments: [{ id:'PAY-00001', creditId:'CR-00001', installmentId:null, customerId:'CLI-00001', date:'12 ago 2026', amount:650000, method:'Transferencia' }],
  apartados: [],
  stores: [
    { id:'LOC-00001', code:'L01', name:'Local 01', address:'Cra. 18 # 42-16', phone:'300 000 0001', products:82, inventory:124500000, sales:28500000, status:'Activo' },
    { id:'LOC-00002', code:'L02', name:'Local 02', address:'Av. 7 # 116-20', phone:'300 000 0002', products:64, inventory:98200000, sales:22100000, status:'Activo' },
    { id:'LOC-00003', code:'L03', name:'Local 03', address:'Calle 27 # 9-40', phone:'300 000 0003', products:55, inventory:76300000, sales:18400000, status:'Activo' },
    { id:'LOC-00004', code:'L04', name:'Local 04', address:'Calle 80 # 68-12', phone:'300 000 0004', products:48, inventory:61200000, sales:17500000, status:'Activo' },
    { id:'LOC-00005', code:'L05', name:'Local 05', address:'Carrera 10 # 25-18', phone:'300 000 0005', products:42, inventory:54800000, sales:14200000, status:'Activo' },
    { id:'LOC-00006', code:'L06', name:'Local 06', address:'Calle 50 # 30-22', phone:'300 000 0006', products:39, inventory:49700000, sales:12800000, status:'Activo' },
    { id:'LOC-00007', code:'L07', name:'Local 07', address:'Av. Principal # 8-14', phone:'300 000 0007', products:36, inventory:43100000, sales:11600000, status:'Activo' }
  ],
  inventory: [
    { productId:'PROD-00001', storeId:'LOC-00001', quantity:9, minimum:3, ideal:9, status:'Bien' },
    { productId:'PROD-00002', storeId:'LOC-00002', quantity:4, minimum:4, ideal:12, status:'Bajo' },
    { productId:'PROD-00003', storeId:'LOC-00003', quantity:2, minimum:3, ideal:9, status:'Bajo' },
    { productId:'PROD-00004', storeId:'LOC-00001', quantity:18, minimum:5, ideal:15, status:'Bien' },
    { productId:'PROD-00005', storeId:'LOC-00004', quantity:0, minimum:2, ideal:6, status:'Agotado' },
    { productId:'PROD-00001', storeId:'LOC-00002', quantity:4, minimum:2, ideal:8, status:'Bien' },
    { productId:'PROD-00002', storeId:'LOC-00003', quantity:2, minimum:2, ideal:6, status:'Bien' },
    { productId:'PROD-00003', storeId:'LOC-00005', quantity:1, minimum:2, ideal:6, status:'Bajo' },
    { productId:'PROD-00004', storeId:'LOC-00006', quantity:3, minimum:4, ideal:12, status:'Bajo' },
    { productId:'PROD-00005', storeId:'LOC-00007', quantity:0, minimum:2, ideal:6, status:'Agotado' }
  ],
  inventoryByStore: [
    { productId:'PROD-00001', storeId:'LOC-00001', quantity:9, minimum:3, maximum:12, ideal:9, status:'Bien' },
    { productId:'PROD-00001', storeId:'LOC-00002', quantity:4, minimum:2, maximum:8, ideal:8, status:'Bien' },
    { productId:'PROD-00002', storeId:'LOC-00002', quantity:4, minimum:4, maximum:12, ideal:12, status:'Bajo' },
    { productId:'PROD-00002', storeId:'LOC-00003', quantity:2, minimum:2, maximum:6, ideal:6, status:'Bien' },
    { productId:'PROD-00003', storeId:'LOC-00003', quantity:2, minimum:3, maximum:9, ideal:9, status:'Bajo' },
    { productId:'PROD-00003', storeId:'LOC-00005', quantity:1, minimum:2, maximum:6, ideal:6, status:'Bajo' },
    { productId:'PROD-00004', storeId:'LOC-00001', quantity:18, minimum:5, maximum:20, ideal:15, status:'Bien' },
    { productId:'PROD-00004', storeId:'LOC-00006', quantity:3, minimum:4, maximum:12, ideal:12, status:'Bajo' },
    { productId:'PROD-00005', storeId:'LOC-00004', quantity:0, minimum:2, maximum:6, ideal:6, status:'Agotado' },
    { productId:'PROD-00005', storeId:'LOC-00007', quantity:0, minimum:2, maximum:6, ideal:6, status:'Agotado' }
  ],
  transfers: [
    { id:'TRS-00001', originStoreId:'LOC-00001', destinationStoreId:'LOC-00002', status:'Pendiente', createdAt:'2026-08-26T09:30:00', createdBy:'USR-00001', notes:'Reposicion demo', items:[{productId:'PROD-00001',quantity:2}] }
  ],
  users: [{ id:'USR-00001', name:'Administrador', email:'admin.demo@correo.test', role:'Administrador', status:'Activo' }],
  roles: [{ id:'ROL-00001', name:'Administrador', permissions:['ventas','inventario','clientes','creditos','reportes'] }, { id:'ROL-00002', name:'Vendedor', permissions:['ventas','clientes'] }, { id:'ROL-00003', name:'Cajero', permissions:['ventas','pagos'] }],
  paymentMethods: ['Efectivo','Transferencia','Tarjeta','Sistecrédito','Crédito interno FAMIMUEBLES'],
  expenses: [{ id:'GAS-00001', date:'2026-08-26', storeId:'LOC-00003', category:'Gasolina', description:'Carga camioneta demo', amount:150000, paymentMethod:'Tarjeta', provider:'Estacion Demo', notes:'35 litros', createdBy:'USR-00001' }, { id:'GAS-00002', date:'2026-08-26', storeId:'LOC-00004', category:'Energía', description:'Factura de energía agosto', amount:485000, paymentMethod:'Transferencia', provider:'Proveedor Demo', notes:'', createdBy:'USR-00001' }],
  fuelRecords: [{ id:'FUE-00001', date:'2026-08-26', storeId:'LOC-00003', vehicle:'Camioneta', driver:'Juan Demo', quantity:35, unit:'litros', amount:150000, mileage:84520, station:'Estacion Demo', notes:'Ruta de entrega', createdBy:'USR-00001' }],
  auditLog: [{ id:'AUD-00001', date:'2026-08-26 14:32', userId:'USR-00001', action:'Crear venta', saleId:'VEN-00001', productId:'PROD-00001', listPrice:2450000, salePrice:2450000, difference:0, storeId:'LOC-00001' }],
  suppliers: [{ id:'SUP-00001', code:'PROV-01', name:'Muebles Nacionales Demo', document:'900000001-1', phone:'300 000 0010', whatsapp:'300 000 0010', email:'compras@demo.test', address:'Zona Industrial', city:'Bogota', contact:'Maria Demo', paymentTerms:'Credito', creditDays:30, active:true, notes:'Proveedor inicial de demostracion', createdAt:'2026-08-01T08:00:00.000Z' }],
  purchases: [],
  accountsPayable: [],
  supplierPayments: [],
  permissionMatrix: [{ resource:'Ventas', actions:{ view:true, create:true, edit:false, delete:false } }, { resource:'Inventario', actions:{ view:true, create:false, edit:true, delete:false } }, { resource:'Productos', actions:{ view:true, create:true, edit:true, delete:false } }, { resource:'Clientes', actions:{ view:true, create:true, edit:true, delete:false } }, { resource:'Créditos', actions:{ view:true, create:true, edit:false, delete:false } }, { resource:'Cartera', actions:{ view:true, create:false, edit:false, delete:false } }, { resource:'Gastos', actions:{ view:true, create:true, edit:false, delete:false } }, { resource:'Gasolina', actions:{ view:true, create:true, edit:false, delete:false } }, { resource:'Usuarios', actions:{ view:true, create:true, edit:true, delete:false } }, { resource:'Configuración', actions:{ view:true, create:false, edit:true, delete:false } }],
  notifications: [{ id:'NOT-00001', text:'3 productos tienen stock bajo', type:'warning', read:false }, { id:'NOT-00002', text:'Credito CR-00002 proximo a vencer', type:'warning', read:false }, { id:'NOT-00003', text:'Venta FV-1048 realizada', type:'success', read:false }],
  demoMode: true
};
