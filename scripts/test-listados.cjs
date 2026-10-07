const {test}=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('./test-helpers.cjs');
function rango(total,pagina,tamano){const a=app();return JSON.parse(a.run(`JSON.stringify(rangoPaginacion(${total},${pagina},${tamano}))`));}
test('Una lista vacía no crea páginas ni rangos ficticios',()=>{
  assert.deepEqual(rango(0,8,25),{total:0,pagina:1,tamano:25,paginas:1,inicio:0,fin:0});
});
test('Recorrer páginas entrega todos los registros exactamente una vez',()=>{
  const ids=Array.from({length:203},(_,i)=>i+1),vistos=[];
  for(let pagina=1;pagina<=9;pagina++){const r=rango(ids.length,pagina,25);vistos.push(...ids.slice(r.inicio,r.fin));}
  assert.deepEqual(vistos,ids);
});
test('Una búsqueda o eliminación que reduce la lista conserva un rango válido',()=>{
  const r=rango(3,8,25);assert.equal(r.pagina,1);assert.equal(r.inicio,0);assert.equal(r.fin,3);
});
test('Cambiar el tamaño permite alcanzar la última página incompleta',()=>{
  for(const tamano of [25,50,100]){const r=rango(203,100,tamano);assert.equal(r.fin,203);assert.equal(r.pagina,Math.ceil(203/tamano));}
});
test('Parámetros inválidos no ocultan datos por rangos negativos o infinitos',()=>{
  const r=rango(100,-2,0);assert.equal(r.pagina,1);assert.equal(r.tamano,25);assert.equal(r.fin,25);
  assert.equal(rango(100,Infinity,50).pagina,1);
});
function ingreso(){
  const a=app();a.run(`renderProdLista=()=>{};DB.proveedores=[{id:1,nombre:'Proveedor',compras:[]}];DB.productos[0].provId=1;DB.productos[0].cat='Remeras';DB.productos[0].codigo='P1';DB.productos.push({...cloneData(DB.productos[0]),id:2,nombre:'Otro producto',codigo:'P2',costo:500,variantes:[{cod:'P2-M',t:'M',stock:3}]});renderIngVarRowsForProd(DB.proveedores[0]);`);
  for(const [id,v] of Object.entries({'ing-prov':1,'ing-metodo':'efectivo','ing-caja':'principal','ing-fecha':'2026-10-07'}))a.element(id).value=v;
  return a;
}
test('Buscar otros productos de un ingreso conserva cantidades y costos ya cargados',()=>{
  const a=ingreso();a.run("ingRowsData[0].cantIngreso=2;ingRowsData[0].nuevoCosto=123.45;ingProdQ='Otro';renderIngVarRowsForProd(DB.proveedores[0]);ingProdQ='';renderIngVarRowsForProd(DB.proveedores[0]);");
  assert.equal(a.run('ingRowsData[0].cantIngreso'),2);assert.equal(a.run('ingRowsData[0].nuevoCosto'),123.45);
  a.run('confirmarIngreso()');assert.equal(a.run('DB.productos[0].variantes[0].stock'),5);assert.equal(a.run('DB.proveedores[0].compras[0].total'),246.9);
});
test('Un costo cero se conserva al buscar y se aplica al confirmar',()=>{
  const a=ingreso();a.run("ingRowsData[0].cantIngreso=1;ingRowsData[0].nuevoCosto=0;ingRowsData[1].cantIngreso=1;ingProdQ='Otro';renderIngVarRowsForProd(DB.proveedores[0]);ingProdQ='';renderIngVarRowsForProd(DB.proveedores[0]);");
  assert.equal(a.run('ingRowsData[0].nuevoCosto'),0);a.run('confirmarIngreso()');
  assert.equal(a.run('DB.productos[0].costo'),0);assert.equal(a.run('DB.proveedores[0].compras[0].total'),500);
});
