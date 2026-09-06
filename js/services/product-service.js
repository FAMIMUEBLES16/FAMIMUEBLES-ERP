import { generateId } from '../utils/ids.js';
import { notifyCreation } from './notification-service.js';
import { ensureInventoryEntry } from '../utils/inventory.js';

export function getProducts(state) { return state.products; }
export function getProductById(state, productId) { return state.products.find(product => product.id === productId); }
export function categoryFromProductName(name) { const value=String(name||'').toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''); const rules=[['Closets',['closet','seccion closet']],['Colchones',['colchon','colchoneta','protector de colchon']],['Camas y cunas',['base cama','cama ','camarote','cuna','corral','moises','media base cama','piecero']],['Alacenas y cocina',['alacena','lacena','gabinete','kit para cocina','cocina integral']],['Comedores',['comedor','mesa comedor','silla comedor','base de comedor','vidrio de comedor','individuales']],['Muebles de sala',['sala','sofa','puff','butaca','poltrona','sillon','mecedora','mesedora']],['Muebles de dormitorio',['cabecero','juego de alcoba','juego para alcoba','tocador','comoda','ropero','semanario','mesa de noche']],['Mesas',['mesa ','mesas ','tablado','tablados']],['Sillas',['silla ','sillas ']],['Textiles y hogar',['almohada','cobija','cubrelecho','sabana','mantel','tapete','cortina','forro para lavadora']],['Electrodomésticos',['aspiradora','cafetera','calefactor','campana','dispensador','ducha electrica','enfriador','estufa','freidora','horno','lavadora','licuadora','microonda','nevera','refrigerador','olla ','plancha ','sanduchera','secador']],['Audio',['bafle','cabina','equipo ','grabadora','guitarra','parlante','sistema de audio','torre visivo']],['Tecnología',['computador','impresora','punto de pago','tdt','dvd','tv ']],['Baño',['inodoro','lavamanos','llave lavamanos','llave ducha']],['Decoración y exhibición',['espejo','esquinero','lampara','vitrina','vitrian','maniqui','torso maniqui','pierna maniequie']],['Herramientas y ferretería',['taladro','pulidora','escalera','tornillo','manguera','tanque','patas metalicas','patas plasticas','puerta']],['Accesorios y varios',['baul','bife','barra de bar','bicicleta','botas','carro comidas','casco','caneca','maleta','maquina de coser','producto para pruebas']]]; return rules.find(([,keywords])=>keywords.some(keyword=>value.includes(keyword)))?.[0] || 'Otros'; }
export function searchProducts(state, query = '') {
  const normalized = String(query).trim().toLocaleLowerCase();
  if (!normalized) return [...state.products];
  return state.products.filter(product => [product.name, product.code, product.barcode, product.reference, product.category, product.categoryName, product.subcategory, product.subcategoryName, product.brand, product.supplierName].some(value => String(value || '').toLocaleLowerCase().includes(normalized)));
}
export function validateProduct(state, values, currentId = null) {
  const name = String(values.name || '').trim();
  const code = String(values.code || '').trim();
  const cost = Number(values.cost ?? 0);
  const statedPrice = Number(values.price ?? values.salePrice ?? 0);
  const servicePrice = Number.isFinite(statedPrice) && statedPrice > 0 ? statedPrice : 0;
  const price = Number.isFinite(servicePrice) ? servicePrice : 0;
  const minimum = Number(values.minimum ?? values.minStock ?? 0);
  const maximum = Number(values.maximum ?? values.maxStock ?? minimum * 3);
  if (!name) throw new Error('El nombre del producto es obligatorio.');
  if (!code) throw new Error('El codigo del producto es obligatorio.');
  if (state.products.some(product => product.id !== currentId && String(product.code).toLowerCase() === code.toLowerCase())) throw new Error('Ya existe un producto con ese codigo.');
  if (!Number.isFinite(price) || price < 0 || !Number.isFinite(cost) || cost < 0) throw new Error('Costo y precio deben ser numeros validos.');
  if (!Number.isInteger(minimum) || minimum < 0 || !Number.isInteger(maximum) || maximum < minimum) throw new Error('Los stocks minimo y maximo no son validos.');
  const iva = Number(values.iva ?? 0);
  if (!Number.isFinite(iva) || iva < 0 || iva > 100) throw new Error('El IVA debe estar entre 0 y 100.');
  if (Number(values.specialPrice ?? 0) < 0) throw new Error('El precio especial no puede ser negativo.');
  return { ...values, name, code, price, salePrice:price, cost, minimum, minStock:minimum, maximum, maxStock:maximum, iva, specialPrice:Number(values.specialPrice ?? 0), minimumPrice:Math.max(price * 0.8, cost || 0) };
}
export function createProduct(state, values) {
  const code = String(values.code || '').trim() || nextProductCode(state);
  const clean = validateProduct(state, { ...values, code });
    const product = { id:generateId('PROD', state.products), code:clean.code, barcode:String(clean.barcode || ''), reference:String(clean.reference || clean.code), name:clean.name, description:String(clean.description || ''), category:String(clean.category || categoryFromProductName(clean.name)), categoryName:String(clean.category || categoryFromProductName(clean.name)), subcategory:String(clean.subcategory || ''), subcategoryName:String(clean.subcategory || ''), brand:String(clean.brand || ''), supplierId:String(clean.supplierId || ''), supplierName:String(clean.supplierName || ''), cost:clean.cost, price:clean.price, salePrice:clean.salePrice, specialPrice:Number(clean.specialPrice || 0), iva:clean.iva, minimumPrice:clean.price, minimum:clean.minimum, minStock:clean.minStock, maximum:clean.maximum, maxStock:clean.maxStock, ideal:clean.maximum, image:String(clean.image || ''), active:clean.active !== false, activo:clean.active !== false, estado:'Activo', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), stock:0, storeId:clean.storeId || state.stores[0]?.id };
  state.products.push(product);
  state.stores.forEach(store => ensureInventoryEntry(state, product.id, store.id));
  notifyCreation(state, 'products', product);
  return product;
}
function nextProductCode(state) { const numericCodes=state.products.map(product=>String(product.code||'').trim()).filter(code=>/^\d+$/.test(code)); if(numericCodes.length){const current=numericCodes.reduce((highest,code)=>Number(code)>highest.number?{number:Number(code),width:code.length}:highest,{number:0,width:numericCodes[0].length});return String(current.number+1).padStart(current.width,'0');} const highest=state.products.reduce((max,product)=>{const match=String(product.code||'').match(/^PROD-(\d+)$/i);return match ? Math.max(max,Number(match[1])) : max;},0); return `PROD-${String(highest + 1).padStart(5,'0')}`; }
export function updateProduct(state, productId, values) { const product=getProductById(state,productId); if (!product) throw new Error('Producto no encontrado.'); const clean=validateProduct(state,values,productId); const active=Object.hasOwn(values,'active') ? values.active !== false : product.active !== false; Object.assign(product,clean,{categoryName:clean.category,subcategoryName:clean.subcategory,price:clean.price,salePrice:clean.salePrice,minimumPrice:clean.price,specialPrice:clean.specialPrice,updatedAt:new Date().toISOString(),active,activo:active,estado:active ? 'Activo' : 'Inactivo'}); return product; }
export function setProductActive(state, productId, active) { const product=getProductById(state,productId); if (!product) throw new Error('Producto no encontrado.'); product.active=active; product.activo=active; product.estado=active?'Activo':'Inactivo'; product.updatedAt=new Date().toISOString(); return product; }
export function generateTestProducts(state, count) { const products=[]; for (let index=0; index<count; index += 1) { const code=`TEST-${String(index + 1).padStart(5,'0')}`; if (state.products.some(product=>product.code===code)) continue; products.push(createProduct(state,{name:`Producto de prueba ${index + 1}`,code,reference:code,category:'Prueba',price:100000,cost:50000,minimum:1,maximum:5,active:true})); } return products; }