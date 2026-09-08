# FAMIMUEBLES ERP

Frontend empresarial de demostracion para ventas, facturacion, productos, inventario, clientes, creditos, cartera, locales, traslados, proveedores, compras y reportes.

## Ejecutar

Requiere Python 3.8 o superior y PostgreSQL 14 o superior. El frontend local usa `http://127.0.0.1:8024`; ejecuta `.venv\Scripts\python.exe server.py` desde esta carpeta. PostgreSQL es el unico backend soportado.

Para registrar el arranque automatico al iniciar sesion en Windows, ejecuta una vez PowerShell como el usuario que usara el ERP:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\install-erp-autostart.ps1
```

La tarea `FAMIMUEBLES ERP Server` reinicia el servidor si PostgreSQL aun no esta listo o si el proceso se detiene. El log queda en `logs\server-autostart.log`.

El acceso publico usa `https://crouch-untitled-harness.ngrok-free.dev`. El dominio solo responde cuando ngrok esta instalado, autenticado con tu cuenta y ejecutando `start-erp-ngrok.cmd`; ese tunel publica el backend local en el puerto `8024`.

### PostgreSQL compartido con el bot

El ERP lee y escribe la misma base PostgreSQL que el bot de Telegram. Instala las dependencias y configura el mismo acceso antes de iniciar:

```powershell
.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:POSTGRES_HOST="localhost"
$env:POSTGRES_PORT="5432"
$env:POSTGRES_DBNAME="Famimuebles"
$env:POSTGRES_USER="postgres"
$env:POSTGRES_PASSWORD="la-misma-clave-del-bot"
.venv\Scripts\python.exe server.py
```

El servidor carga automaticamente `.env` del ERP o, si no existe, el `.env` del proyecto vecino `FAMIMUEBLES APP` del bot. Si falta `POSTGRES_PASSWORD`, el servidor no inicia. Comprueba el modo efectivo en `http://127.0.0.1:8027/api/health` antes de usar la aplicacion.

El backend PostgreSQL crea las tablas propias de autenticacion y modulos del ERP dentro de la misma base, usando conexiones independientes por solicitud. El estado de la SPA, el catalogo, el inventario, las ventas y las colecciones operativas se leen de las tablas compartidas del bot (`productos`, `locales`, `inventarios`, `movimientos`, `movimiento_productos`, creditos, apartados, gastos, gasolina y demas tablas disponibles). Las ventas creadas desde el ERP se escriben en esas mismas tablas. `famimuebles.sqlite3` ya no participa en la aplicacion web.

El servidor tambien expone colecciones transaccionales en `/api/domain/<coleccion>` para proveedores, cuentas por pagar, devoluciones, conteos, reservas, garantias, caja, bancos, cotizaciones, pedidos, entregas, notas credito y configuracion empresarial. `/api/report/<coleccion>.csv` exporta reportes CSV. El primer administrador se configura una sola vez mediante `/api/auth/setup` y luego inicia sesion en `/api/auth/login`. `/api/backup` genera un respaldo JSON y `/api/restore` lo restaura.

La ruta `#paridad` agrega las funciones compartidas con el bot sin migrar ni borrar datos: abonos que actualizan `cuotas_credito`, mora idempotente, entrega de apartados con salida de inventario, sesiones de conteo físico con aplicación confirmada de ajustes, registro de Sistecrédito y previsualización/cierre de nómina. Los endpoints `/api/parity/*` reutilizan las tablas PostgreSQL existentes; no crean tablas nuevas.

### Cliente API local y produccion

Las llamadas del frontend pasan por `js/services/api-client.js`. La URL se configura en un unico lugar, `js/config.js`: en `localhost` usa automaticamente `http://127.0.0.1:8024/api`; en GitHub Pages permanece en modo demo hasta definir una URL HTTPS real en `FAMIMUEBLES_API_BASE_URL`. No se deben poner credenciales en ese archivo.

Para una API publicada, establece `FAMIMUEBLES_API_BASE_URL` antes de cargar `app-v3.js` o reemplaza el valor de configuracion por la URL HTTPS real del backend. En el servidor define `FAMIMUEBLES_ALLOWED_ORIGINS` con una lista separada por comas, por ejemplo `https://famimuebles16.github.io,http://127.0.0.1:8024`, y conserva `POSTGRES_PASSWORD` unicamente como secreto del entorno. PostgreSQL no debe exponerse a Internet: la API debe accederlo por red privada o mediante un tunel seguro.

Los reportes de la pantalla Reportes se descargan como PDF mediante `/api/report-pdf/<coleccion>.pdf`. La ruta `#paridad` tambien consulta disponibilidad, inventario bajo, Sistecrédito, gastos, gasolina e historial por empleado mediante `/api/parity/report/<nombre>`. El generador usa ReportLab y el diseno de FAMIMUEBLES con encabezado, fecha, local, usuario, tarjetas de resumen, tabla con filas alternadas y pie de pagina. La dependencia esta fijada en `requirements.txt`.

El Service Worker no intercepta rutas `/api/` y el frontend verifica la firma `%PDF` antes de descargar un reporte, evitando guardar `offline.html` con extension `.pdf`. Si existe un PDF anterior de 492 bytes, debe eliminarse y generarse nuevamente desde la version actual del servidor.

Antes de cargar datos reales, crea un respaldo PostgreSQL y ejecuta el proceso de limpieza correspondiente sobre PostgreSQL. No uses scripts que operen sobre `famimuebles.sqlite3`.

La instalacion actual funciona como plantilla multiempresa. La cabecera permite seleccionar o crear empresas; el estado y los procesos avanzados se separan por `tenant`. El acceso requiere usuario y token, los endpoints verifican el rol y los reportes HTML/CSV requieren autenticacion. La ruta `#operaciones` concentra devoluciones, conteos, reservas, garantias, danos, caja, bancos, cuentas por cobrar, cotizaciones, pedidos, entregas y notas credito.

Para vender el producto en internet aun se requiere desplegar el servidor detras de HTTPS, configurar un dominio, usar una base de datos de servidor con copias automaticas, agregar membresias de usuarios por empresa y conectar los proveedores externos de facturacion electronica, contabilidad y nomina. Esas integraciones no se pueden activar sin credenciales, certificado digital, proveedor tecnologico y datos fiscales de cada negocio.

### Importar la exportacion real

La importacion de datos debe ejecutarse contra PostgreSQL usando las tablas compartidas del bot. `migrate_export.py` se conserva como herramienta historica de lectura y no forma parte del arranque web.

## Arquitectura

`index.html` contiene el shell semantico y `css/main.css` conserva el sistema visual responsive. `js/app-v3.js` coordina la SPA activa; `js/router.js` gestiona las rutas; `js/data/` contiene datos demo, migracion, almacenamiento y estado central; `js/modules/` contiene las vistas por dominio; `js/services/` centraliza operaciones de productos, inventario y traslados; `js/components/` contiene piezas reutilizables; `js/utils/` contiene utilidades comunes. `_backup_v1/`, `_backup_v3/`, `_backup_v3_2/` y `_backup_v4/` conservan versiones anteriores.

Los productos usan un modelo extensible con codigo, barras, referencia, categoria, subcategoria, marca, proveedor, costo, precios, IVA, limites de stock, imagen, estado y fechas. El `product-service` concentra validacion, busqueda, alta, edicion, activacion y generacion temporal de datos de prueba. La ficha de producto muestra informacion comercial, inventario por cada local y los ultimos movimientos.

El inventario se identifica por la combinacion `productId + storeId` en `inventoryByStore`; no se guardan existencias como campos fijos dentro del producto. La pantalla Productos permite buscar por nombre, codigo, barras, referencia, categoria, marca y proveedor, filtrar por categoria/subcategoria/marca/estado/activo y ordenar con paginacion de 20, 50 o 100 filas.

La importacion masiva acepta CSV con vista previa y validacion de codigos duplicados, campos obligatorios, precios, costos, IVA y limites de stock. La importacion no modifica datos hasta confirmar y crea la entrada de inventario local correspondiente. Los archivos Excel y la carga de productos reales quedan preparados para una fase posterior.

La Fase 6 agrega Proveedores y Compras. Cada proveedor puede administrarse con datos comerciales, contacto y condiciones de pago. Una compra con multiples lineas se guarda como `BORRADOR`, puede pasar a `ORDENADA` y solo al pasar a `RECIBIDA` aumenta el inventario del local destino mediante `inventory-service`, registra `COMPRA_ENTRADA` y actualiza el costo de compra sin cambiar el precio de venta. Las compras `CANCELADA` no modifican existencias. El detalle muestra subtotal, IVA, descuentos y total; Inventario muestra valorizacion por local como cantidad por costo.

Para probar escalabilidad sin modificar datos persistentes, el servicio puede generar en memoria 10, 100 o 537 productos. Con 8 locales esto representa 80, 800 y 4.296 relaciones Producto x Local, respectivamente.

El inventario se identifica por la combinacion `productId + storeId` en `inventoryByStore`. Los locales son registros dinamicos: crear un local desde Locales lo incorpora automaticamente a facturacion, inventario, traslados y dashboard. La matriz consolidada genera sus columnas desde `state.stores`, sin un limite fijo.

Las ventas, entradas, salidas, ajustes y recepciones de compra crean movimientos en `inventoryMovements`. Un traslado se crea como `BORRADOR`, pasa a `EN_TRANSITO` al enviarse (descuenta origen) y a `RECIBIDO` al recibirse (suma destino). Los identificadores se generan con prefijos `LOC`, `PROD`, `INV`, `TRA`, `MOV`, `SUP` y `COM`.

La Fase 6 agrega `js/services/purchase-service.js`, que concentra proveedores, compras, totales, estados `BORRADOR`, `ORDENADA`, `RECIBIDA` y `CANCELADA`. Crear u ordenar una compra no modifica existencias. Recibirla usa `increaseStock` del servicio central, genera `COMPRA_ENTRADA`, actualiza el costo de compra y conserva el precio de venta. Una compra recibida no puede cancelarse directamente; queda preparada para una futura devolucion al proveedor.

El modulo Compras permite agregar multiples productos con cantidad, costo unitario, IVA y descuento; consultar el detalle, buscar y filtrar por proveedor, local y estado. Inventario muestra valorizacion por local calculada como `cantidad x costo`.

La interfaz funciona localmente, pero toda la informacion operativa se persiste en PostgreSQL. `localStorage` se reserva para la sesion y preferencias de interfaz.

## Uso

Navega desde el sidebar, abre Proveedores para administrar contactos y condiciones, y Compras para crear, ordenar, recibir o cancelar compras. Solo recibir una compra aumenta el inventario. Abre Ver para consultar el detalle. Productos conserva su ficha, busqueda, filtros, paginacion y activacion. En Inventario puedes filtrar, ordenar, consultar la matriz general, valorizacion y registrar ajustes. En Traslados crea, envia y recibe movimientos. Los datos operativos se guardan en PostgreSQL; la carga futura de 537 o mas productos no requiere modificar la arquitectura.

## FASE 6.5 - Auditoria y estabilizacion

Fecha: 27 de agosto de 2026.

Objetivo: auditar y estabilizar la arquitectura de las Fases 3 a 6 sin crear nuevos modulos funcionales ni conectar servicios externos.

Problemas corregidos: recepciones de compra que podian iniciar desde un estado invalido; riesgo de cambios parciales al recibir compras con varias lineas; productos inexistentes que podian crear entradas huerfanas durante una recepcion; movimientos de traslados que modificaban existencias fuera de `inventory-service`; y versiones cacheadas que ocultaban cambios de modulos. Se mantuvo `localStorage` con la clave `famimuebles-demo` y no se borraron colecciones ni registros.

Pruebas realizadas: diagnosticos globales; carga de las 19 rutas; productos, inventario, proveedores, compras, detalle, cancelacion, ordenamiento y recepcion; persistencia; responsive a 390 px; rollback de operaciones; y escalabilidad en memoria con 10, 100 y 537 productos sobre 8 locales.

Pendientes reales: autenticacion y permisos efectivos, backend/base de datos, cuentas por pagar, pagos a proveedores, devoluciones al proveedor, Excel y reportes profesionales. La arquitectura queda lista con condiciones para iniciar la Fase 7, siempre que se mantenga el alcance y se prueben los nuevos cambios.

## FASE 7 - Cuentas por pagar y pagos a proveedores

Fecha: 27 de agosto de 2026.

Se agregaron las colecciones `accountsPayable` y `supplierPayments` sin cambiar la clave `famimuebles-demo`. Una compra recibida puede generar una sola cuenta por pagar; la migracion crea cuentas para compras recibidas existentes y conserva sus relaciones con proveedor, compra y local. Las compras en borrador, ordenadas o canceladas no generan cuentas.

El servicio `accounts-payable-service.js` concentra saldos, estados, vencimientos, busqueda, pagos, anulacion y saldos por proveedor. Los estados son `PENDIENTE`, `PARCIAL`, `PAGADA`, `VENCIDA` y `ANULADA`. Los pagos validan monto, saldo, cuenta, proveedor y referencias duplicadas; registran auditoria y nunca modifican `inventoryByStore` ni `quantity`.

La ruta `#cuentas-por-pagar` muestra totales, saldo, vencimientos, filtros, detalle de compra e historial de pagos. La recepcion sigue siendo la unica operacion que aumenta inventario y registra `COMPRA_ENTRADA`; el pago es exclusivamente financiero.

Pruebas realizadas: ciclo de compra recibida a cuenta, pago parcial, pago total, bloqueo de sobrepago y pago posterior, referencia duplicada, cuenta inexistente, rollback de recepcion, persistencia, consola sin errores, 20 rutas, responsive y escalabilidad en memoria con 10/100/500 proveedores y 10/100/1.000 cuentas. No se implementaron backend, autenticacion, cuentas bancarias, devoluciones ni integraciones externas.

## FASE 7.5 - Cierre y estabilizacion

Fecha: 27 de agosto de 2026.

Se auditaron arquitectura, servicios, `localStorage`, modelos, IDs, inventario, movimientos, compras, cuentas por pagar, proveedores, router, app principal, cache-busting, Service Worker, responsive, persistencia, regresion e integridad. No se crearon funcionalidades nuevas ni se modificaron otros proyectos.

Problema corregido: `app-v3.js` mantenia imports financieros en V12 mientras la entrada y el Service Worker estaban versionados en V13. Se unificaron los imports activos y el precache final en V14 para evitar mezclar modulos cacheados. No se modificaron cantidades, compras, pagos ni relaciones de negocio durante esta correccion.

Problemas confirmados como pendientes: el Service Worker precachea solo el subconjunto critico de archivos y usa fallback de red para los demas modulos; los estados de vencimiento se actualizan al consultar y persisten al guardar; la aplicacion sigue siendo local y no ofrece autenticacion, concurrencia multiusuario ni auditoria inmutable. No se implemento una solucion improvisada para esos puntos.

Pruebas completadas: 20 rutas cargadas individualmente con titulo y contenido; consola sin `pageerror`; compras en borrador, ordenada, recibida y cancelada; doble recepcion bloqueada; pagos parciales y totales; sobrepago, pago negativo, pago posterior y referencia duplicada bloqueados; inventario sin cambios durante pagos; rollback multi-linea; IDs, codigos y cantidades no negativos; migracion idempotente; persistencia; y responsive en 390x844, 768x1024 y 1280x900 sin overflow. Escalabilidad en memoria: 537 productos, 8 locales, 4.296 relaciones, 4.296 movimientos, 20 compras, 537 codigos unicos, 500 proveedores y 1.000 cuentas.

La regresion inicial de las 20 rutas tuvo timeout de navegador; se repitio de forma controlada ruta por ruta y paso completa. Fase 7.5 queda aprobada con pendientes, sin iniciar la Fase 8.

## FASE 7.7 - Unificacion de cache-busting

Fecha: 27 de agosto de 2026.

Se corrigieron unicamente referencias activas de cache: las 4 referencias `v10` y las 35 referencias `v13` se actualizaron a `v14`. No se modificaron logica funcional, arquitectura, modelo de datos ni datos persistentes. El CSS `v9` se conservo porque no era necesario cambiarlo para esta estabilizacion.

El Service Worker permanece alineado con `famimuebles-erp-v14` y su precache usa recursos V14 existentes. Se creo `_backup_v7_7` antes de la correccion con 20 archivos.

Pruebas: diagnosticos sin errores; 20 rutas cargadas individualmente; Dashboard y Cuentas por pagar visibles; responsive en 390x844, 768x1024 y 1280x900 sin overflow; persistencia sin cambios despues de recargar; prueba financiera en memoria con pagos parcial y total, bloqueos de sobrepago, valores invalidos, referencias duplicadas y pago posterior; inventario intacto durante pagos. Fase 7 queda cerrada y la Fase 8 no se inicia.

## FASE 8.0 - Diseno arquitectonico

Fecha: 27 de agosto de 2026. Esta fase es exclusivamente de auditoria y diseno; no implementa backend, API, base de datos, autenticacion, migracion, nuevos modulos ni cambios de logica.

### Estado actual

FAMIMUEBLES ERP es una SPA vanilla con `index.html`, `app-v3.js`, router por hash, modulos de dominio, servicios de negocio, store en memoria y persistencia operativa exclusiva en PostgreSQL. `localStorage` solo conserva sesion, empresa activa y preferencias visuales.

### Arquitectura y dependencias

El flujo actual es: Frontend -> `app-v3.js` -> modulos -> servicios -> `store` -> `storage` -> clave `famimuebles-demo`. El router y sidebar exponen 20 rutas. Las vistas de productos, inventario, compras, proveedores, cuentas por pagar, auditoria y finanzas consumen sus servicios correspondientes; ventas y traslados usan `inventory-service`; recepcion usa `purchase-service` e inventario; pagos usan `accounts-payable-service`.

### Mapa de datos

Las colecciones actuales del estado demo son: `products`, `customers`, `sales`, `credits`, `installments`, `payments`, `apartados`, `stores`, `inventory`, `inventoryByStore`, `transfers`, `users`, `roles`, `paymentMethods`, `expenses`, `fuelRecords`, `auditLog`, `permissionMatrix`, `notifications`, `suppliers`, `purchases`, `inventoryMovements`, `accountsPayable` y `supplierPayments`. Las relaciones principales son Producto x Local en `inventoryByStore`, compra -> proveedor/local/productos, cuenta -> compra/proveedor/local y pago -> cuenta/compra/proveedor.

### Escrituras criticas

`store.add`, `store.update` y `saveState` sincronizan entidades con los endpoints del servidor. `inventory-service` es responsable de cantidades y movimientos; `purchase-service` controla estados y recepcion; `accounts-payable-service` controla cuentas, saldos y pagos; `storage.js` normaliza la respuesta de PostgreSQL. Las escrituras operativas se realizan en PostgreSQL y no se usa SQLite.

### Persistencia y migraciones

`storage.js` carga `famimuebles-demo`, combina el estado guardado con la estructura demo, normaliza IDs y campos, inicializa colecciones faltantes y guarda el resultado. Ante JSON corrupto usa el estado demo normalizado. La estrategia futura debe versionar el esquema, conservar IDs y exportar antes de migrar; no se ejecuta ninguna migracion hacia backend en esta fase.

### Inventario

El stock pertenece a `productId + storeId`. Entradas, salidas, ventas, ajustes y traslados pasan por `inventory-service`, que actualiza cantidades y crea `inventoryMovements`. La recepcion de compra aumenta el local destino y conserva el costo; los pagos no tocan inventario.

### Compras y cuentas por pagar

Las compras siguen `BORRADOR -> ORDENADA -> RECIBIDA` o `BORRADOR -> CANCELADA`. Solo `RECIBIDA` actualiza inventario y puede crear una cuenta unica. `accounts-payable-service` calcula saldo, estados, vencimientos, pagos parciales/totales, bloquea sobrepagos y registra auditoria.

### Auditoria

La auditoria local usa `auditLog` para acciones de ventas, ajustes, cuentas y pagos, y `inventoryMovements` para movimientos de existencias. Es trazable dentro del navegador, pero no inmutable: cualquier usuario con acceso al almacenamiento local puede modificarla.

### Cache-busting

La auditoria final verifico `V10=0`, `V13=0` y `V14=41`. `index.html` carga `app-v3.js?v=14`; el Service Worker usa `famimuebles-erp-v14` y precache V14. El CSS conserva `v9` por decision de Fase 7.7. No se modificaron referencias durante Fase 8.0.

### Arquitectura futura propuesta

El frontend deberia conservar renderizado, interaccion, validaciones inmediatas y estado de formulario. Una API deberia asumir autenticacion, autorizacion, transacciones, reglas de negocio, concurrencia, auditoria y acceso a datos. Los servicios de dominio se trasladarian progresivamente al backend y la base de datos seria la fuente de verdad para productos, locales, inventario, ventas, compras, cuentas, pagos y auditoria.

### Migracion futura

La ruta propuesta es `localStorage -> exportacion JSON validada -> respaldo inmutable -> transformacion versionada -> importacion transaccional -> reconciliacion -> activacion gradual`. Debe comprobar conteos, IDs, relaciones, saldos, cantidades y movimientos para productos, locales, inventario, ventas, compras, proveedores, cuentas por pagar, pagos, clientes, creditos, cartera y auditoria. Esta estrategia queda disenada, no ejecutada.

### Seguridad futura

Se requeriran autenticacion, sesiones, roles, permisos por recurso/accion, autorizacion en cada endpoint, control de concurrencia, trazabilidad de cambios y auditoria protegida. Nada de esto se implementa en Fase 8.0.

### Riesgos

La fuente de verdad actual es local y no sincroniza equipos; no existe autenticacion real ni aislamiento multiusuario; la auditoria puede alterarse; el Service Worker precachea solo recursos criticos; y la migracion futura requerira reconciliacion cuidadosa de IDs, saldos y existencias.

### Recomendacion para Fase 8.1

Primero definir contratos de dominio, version de esquema, formato de exportacion, limites de responsabilidad frontend/backend y estrategia de pruebas de migracion. Fase 8.1 no se inicia automaticamente.

### Validacion de cierre

No se modifico logica funcional ni datos. El backup `_backup_v8_0` fue creado con 34 archivos. Diagnosticos: sin errores. Las 20 rutas cargaron individualmente; responsive fue verificado en 390x844, 768x1024 y 1280x900; `localStorage` no fue modificado; no se ejecutaron migraciones destructivas ni se genero volumen persistente. Fase 8.0 queda aprobada y Fase 8.1 permanece pendiente de autorizacion.

## FASE 8.1 - Inicio controlado

Fecha: 27 de agosto de 2026.

### Estado

APROBADA CON OBSERVACIONES para el alcance inicial 8.1.1. Se realizo auditoria de entrada, backup, un cambio defensivo pequeno en la capa de datos y regresion completa. No se implementaron backend, autenticacion real, multiusuario ni funcionalidades nuevas de negocio.

### Backup

Se creo `_backup_v8_1` con 5 archivos: `js/data/store.js`, `js/data/storage.js`, `js/utils/ids.js`, `js/utils/validation.js` y `README.md`. No se sobrescribieron backups anteriores.

### Cambio realizado

`js/data/store.js` ahora valida que la coleccion exista y sea un arreglo antes de ejecutar `add` o `update`. Las colecciones validas mantienen el mismo comportamiento; las colecciones inexistentes producen un error explicito y no escriben en `localStorage`.

### Datos y reglas de negocio

Conteos antes y despues: productos 5, locales 7, ventas 3, compras 0, proveedores 1, cuentas por pagar 0, pagos a proveedores 0, movimientos de inventario 0, traslados 1, auditoria 1, inventario 10 e `inventoryByStore` 10. `localStorage` conserva la clave `famimuebles-demo` y no perdio informacion. No se crearon datos persistentes de prueba.

Inventario y finanzas no fueron modificados. Los pagos no afectan existencias y la recepcion de compras continua siendo la responsable de afectar inventario. Las pruebas de coleccion invalida confirmaron que no se escribe estado.

### Cache

No hay referencias activas V10 ni V13. Los recursos activos detectados usan V14; el conteo exacto de URLs `?v=14` es 53 y el Service Worker conserva `famimuebles-erp-v14`. No se cambiaron versiones.

### Regresion

Las 20 rutas cargaron, mostraron titulo y contenido, sin pantalla blanca ni `pageerror`: 20/20. Responsive aprobado en 390x844, 768x1024 y 1280x900, sin overflow horizontal: 3/3. Diagnosticos del workspace: 0 errores.

### Pendientes

Revisar con pruebas dirigidas la normalizacion de estados heredados, contratos de entidades, validaciones por dominio y estrategia de migraciones idempotentes. No se deben modificar reglas financieras o de inventario sin una prueba de regresion especifica.

### Recomendacion

Se puede continuar con una siguiente iteracion de 8.1.1 unicamente con cambios pequenos, backup previo y pruebas dirigidas. No se recomienda iniciar una fase posterior ni ajustar cache-busting hasta aclarar el conteo historico esperado de V14.

## FASE 8.1.1 - Correccion controlada de integridad de inventario

Fecha: 27 de agosto de 2026.

### Defecto y causa

`increaseStock()` y `decreaseStock()` convertian silenciosamente las cantidades con `Number()` y `Math.abs()`, permitiendo que entradas invalidas pudieran llegar como `NaN`. `ensureInventoryEntry()` podia crear una fila `inventoryByStore` sin comprobar que existieran el producto y el local referenciados.

### Correccion aplicada

En `js/services/inventory-service.js` se validan cantidades obligatorias, numericas, finitas y mayores que cero antes de resolver o modificar existencias. Se elimino `Math.abs()` como mecanismo de conversion silenciosa. En `js/utils/inventory.js` se validan producto y local antes de resolver o crear una relacion. Las operaciones validas conservan sus cantidades, movimientos y formato existentes.

### Backup y alcance

Se creo `_backup_v8_1_1` con 3 archivos: `js/services/inventory-service.js`, `js/utils/inventory.js` y `README.md`. Solo se modificaron esos dos servicios y esta documentacion. No se modificaron compras, cuentas por pagar, pagos, ventas, traslados, CSS, Service Worker ni cache-busting.

### Pruebas

Se rechazaron `NaN`, `Infinity`, `-Infinity`, `abc`, cadena vacia, `null`, `undefined`, cero, cantidades negativas, producto inexistente y local inexistente. Cada rechazo produjo error controlado, no creo filas huerfanas, no cambio inventario ni movimientos y no escribio en `localStorage`. Las operaciones validas aumentaron 2, disminuyeron 1 y registraron los 2 movimientos esperados en memoria.

La regresion cargo las 20 rutas con titulo y contenido, sin pantalla blanca ni `pageerror`: 20/20. Responsive aprobado en 390x844, 768x1024 y 1280x900, sin overflow: 3/3. Diagnosticos: 0 errores.

### Persistencia y conteos

`localStorage` mantuvo la clave `famimuebles-demo` y permanecio intacto. Antes y despues: productos 5, locales 7, ventas 3, compras 0, proveedores 1, cuentas por pagar 0, pagos 0, movimientos 0, traslados 1, auditoria 1, inventario 10 e `inventoryByStore` 10.

Cache sin cambios: V10=0, V13=0, recursos activos V14 y Service Worker `famimuebles-erp-v14`. Los backups historicos permanecen presentes. Fase 8.1.1 queda aprobada con la correccion controlada; no se inicia Fase 8.2.

## FASE 8.3 - Preparacion arquitectonica

Fecha: 27 de agosto de 2026.

Esta fase fue documental. No implemento backend, migraciones ni funcionalidades externas; el ERP permanece local e independiente.

### Arquitectura actual

El flujo activo es `index.html` -> `js/app-v3.js` -> router y modulos -> servicios -> `js/data/store.js` -> `js/data/storage.js` -> API PostgreSQL. `app-v3.js` es la entrada activa y expone 20 rutas. `js/app.js` es legacy y no es cargado por `index.html`.

### Entidades y contratos reales

`products`: `id`, `name`, `code`, `reference`, categoria, precios, costo, IVA, limites de stock, proveedor, estado, activo y local asociado. `stores`: `id`, `code`, `name`, direccion, telefono, estadisticas demo y `status`. `customers`: `id`, nombre, documento, telefono, correo, compras, creditos, saldo y estado. `suppliers`: `id`, codigo, nombre, documento, contacto, datos de contacto, condiciones de pago, dias de credito, activo, notas y fechas.

`sales`: `id`, `invoiceId`, cliente, `customerId`, local, items con producto, cantidades y precios, transporte, fecha, total, metodo de pago y estado. `purchases`: `id`, proveedor, local, factura, metodo de pago, notas, fechas, estado e items con producto, cantidad, costo, IVA y descuento. `transfers`: `id`, local origen, local destino, items, notas, usuario, fechas y estado.

`inventory` conserva relaciones producto-local con cantidad, minimos, ideal y estado. `inventoryByStore` contiene la existencia operativa por `productId + storeId`, cantidad y limites. `inventoryMovements` registra producto, local, tipo, cantidad, referencia, nota, fecha y usuario. `accountsPayable` contiene compra, proveedor, local, factura, fechas, total, pagado, saldo, condiciones y estado. `supplierPayments` contiene cuenta, compra, proveedor, monto, metodo, referencia, nota, fecha y usuario.

`credits` contiene cliente, venta opcional, valores, abonos, financiacion, cuotas, proxima fecha y estado; `installments` contiene credito, numero, vencimiento, monto, pago y estado; `payments` registra pagos de creditos/apartados. `apartados` relaciona venta, cliente, local, items, valores, pagos y estado. `auditLog` registra IDs, fecha, usuario, accion y referencias de entidad. `users` contiene identidad, correo, rol y estado. `expenses` y `fuelRecords` contienen fecha, local, datos operativos, monto/cantidad y usuario. `roles`, `permissionMatrix` y `notifications` completan el estado de configuracion local.

### Relaciones comprobadas

- Producto -> `inventory` y `inventoryByStore`.
- Producto + local -> fila operativa en `inventoryByStore`.
- `inventory-service` -> `inventoryByStore` + `inventoryMovements`.
- Venta -> cliente, local, productos y opcionalmente credito/apartado.
- Compra -> proveedor, local y productos.
- Compra recibida -> inventario, movimiento `COMPRA_ENTRADA` y una cuenta por pagar cuando corresponde.
- Cuenta por pagar -> proveedor, compra, local y `supplierPayments`.
- Traslado -> local origen, local destino y productos; envio/recepcion usan el servicio de inventario.
- Credito/apartado -> cliente, venta opcional, cuotas y pagos.
- `auditLog` -> usuario y referencias de ventas, inventario, cuentas y pagos.

No existen huérfanos en los datos actuales de inventario, `inventoryByStore` ni traslados.

### Fuentes de verdad

`store.state` es la fuente de estado en memoria y `saveState()` persiste el estado completo. `inventoryByStore` es la fuente operativa de existencias; `inventory` se conserva como estructura compatible y de normalizacion. `inventoryMovements` es el historial de movimientos, no el saldo. Los servicios son la fuente de reglas para inventario, compras, cuentas por pagar, pagos y traslados. Los modulos renderizan y coordinan, pero no deben duplicar esas reglas.

### Servicios y efectos

`inventory-service.js` valida referencias y cantidades, modifica `inventoryByStore` y registra movimientos. `purchase-service.js` crea compras, calcula totales, controla estados y en recepcion usa inventario y cuentas por pagar. `accounts-payable-service.js` calcula saldos, estados y pagos, registra auditoria y no modifica inventario. `transfer-service.js` crea traslados y valida origen, destino y productos; el envio/recepcion en la aplicacion usa el servicio de inventario. `product-service.js` valida y administra productos. `finanzas.js` controla ventas financiadas, apartados, pagos de cartera y salidas de inventario.

### Reglas de negocio comprobadas

Las cantidades de inventario deben ser finitas y positivas para entradas/salidas; producto y local deben existir; no se crean filas huerfanas. Compras requieren proveedor, local y productos existentes; solo una compra recibida afecta inventario y puede generar una CxP. Traslados requieren locales distintos y productos existentes; sus estados son `BORRADOR`, `EN_TRANSITO`, `RECIBIDO` o `CANCELADO` segun el flujo. Pagos de proveedores rechazan montos invalidos, cero, negativos, sobrepagos, referencias duplicadas y pagos sobre cuentas pagadas. Las operaciones con cambios parciales usan rollback donde esta implementado.

### Idempotencia y duplicados

La creacion de una CxP es idempotente por `purchaseId`; la recepcion y las transiciones de compra/traslado bloquean estados no permitidos. Los pagos previenen referencias duplicadas por cuenta. La generacion de IDs toma el maximo numerico de la coleccion. La creacion de compras, traslados y movimientos genera un nuevo ID y no implementa idempotencia por una clave de negocio; reintentos de creacion pueden duplicar registros si el llamador repite la operacion. `storage.js` evita duplicar CxP existentes, pero normaliza y persiste al cargar.

### Auditoria

La auditoria actual es local y mutable. Registra acciones de ventas, inventario, cuentas y pagos con fecha, usuario, accion y referencias variables segun el evento. `inventoryMovements` registra el detalle de existencias. No existe inmutabilidad, firma, servidor ni esquema unico obligatorio para todos los eventos.

### Legacy

Activo: `index.html`, `js/app-v3.js`, `js/router.js`, `js/data/`, `js/services/`, `js/modules/`, `js/components/`, `js/utils/` y `css/main.css`. Referenciado por la entrada activa: los modulos y servicios importados por `app-v3.js`. Legacy/no copiar directamente: `js/app.js` y los directorios `_backup_*`; contienen versiones anteriores o flujos duplicados. No se elimino, movio ni renombro ningun archivo.

### Componentes internos

Datos, servicios, utilidades, persistencia local, UI, reportes y auditoria pertenecen exclusivamente a este ERP. No hay API externa ni sincronizacion de datos.

### Limites del proyecto

`app.js` legacy y los backups no forman parte de la entrada activa. La persistencia es local y el Service Worker solo gestiona recursos de la interfaz; no existe sincronizacion de datos.

### Riesgos pendientes

La fuente de verdad es local, no hay concurrencia ni autenticacion real y `auditLog` es mutable. La creacion repetida de algunas entidades puede duplicar registros. `storage.js` mezcla normalizacion con persistencia y existen campos historicos y aliases que requieren contratos versionados.

### Validacion y cambios

Auditoria de entrada: backups historicos presentes, `_backup_v8_2` con 3 archivos, `_backup_v8_3` inexistente antes del backup y luego creado con 1 archivo, V10=0, V13=0, recursos V14 y Service Worker `famimuebles-erp-v14`. Diagnosticos y consola: 0 errores. Rutas: 20/20. Responsive: 3/3 en 390x844, 768x1024 y 1280x900 sin overflow. Persistencia y conteos: intactos, con 5 productos, 7 locales, 3 ventas, 0 compras, 1 proveedor, 0 CxP, 0 pagos, 0 movimientos, 1 traslado, 1 auditoria, 10 inventarios y 10 relaciones `inventoryByStore`.

La interfaz permanece local, sin servicios externos, sincronizacion ni backend remoto. Fase 8.3 queda cerrada; no se inicia una fase posterior.

## FASE 8.2.1 - Correccion controlada de contratos de compras y traslados

Fecha: 27 de agosto de 2026.

Se corrigieron dos defectos comprobados. `createTransfer()` ahora valida la existencia de los locales origen y destino y de todos los productos antes de crear el traslado. `createPurchase()` ahora valida la existencia del proveedor, local y todos los productos antes de crear la compra. Las validaciones ocurren antes de cualquier escritura y no cambian los registros validos, calculos, estados, IDs ni formatos existentes.

Archivos funcionales modificados: `js/services/transfer-service.js` y `js/services/purchase-service.js`. Tambien se actualizo esta documentacion despues de completar las pruebas. No se modificaron inventario-service, cuentas por pagar, ventas, traslados posteriores, CSS, router, Service Worker ni cache-busting.

Se creo `_backup_v8_2` con 3 archivos: `js/services/transfer-service.js`, `js/services/purchase-service.js` y `README.md`. Los hashes SHA-256 y tamaños fueron registrados antes de editar. Los backups historicos `_backup_v3`, `_backup_v3_2`, `_backup_v4`, `_backup_v5`, `_backup_v6`, `_backup_v7`, `_backup_v7_5`, `_backup_v7_7`, `_backup_v8_0`, `_backup_v8_1` y `_backup_v8_1_1` permanecen presentes.

Pruebas negativas en memoria: producto, origen, destino y mezcla valida/invalida en traslados; proveedor, local, producto y mezcla valida/invalida en compras. Los 8 casos fueron rechazados sin crear registros ni modificar `purchases`, `transfers`, `inventory`, `inventoryByStore`, `inventoryMovements`, `accountsPayable`, `supplierPayments` o `auditLog`. Una compra y un traslado validos se crearon correctamente en copias en memoria; la compra calculo un total de 100000.

Regresion: 20/20 rutas con titulo, contenido y cero `pageerror`. Responsive: 3/3 en 390x844, 768x1024 y 1280x900 sin overflow. Diagnosticos: 0 errores. `localStorage` mantuvo la clave `famimuebles-demo` y permanecio intacto; los conteos continuaron en 5 productos, 7 locales, 3 ventas, 0 compras, 1 proveedor, 0 cuentas por pagar, 0 pagos, 0 movimientos, 1 traslado, 1 auditoria, 10 inventarios y 10 relaciones `inventoryByStore`. Cache sin cambios: V10=0, V13=0, recursos activos V14 y Service Worker `famimuebles-erp-v14`. Fase 8.2.1 queda aprobada; no se inicia Fase 8.3.