const {test}=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('./test-helpers.cjs');

const clientes=[{id:1,nombre:'María José Pérez',tel:'+54 9 (261) 555-1234'},{id:2,nombre:'Ana Gómez',tel:'261-444-9988'}];
const opciones=[{value:'',text:'Consumidor final'},...clientes.map(c=>({value:String(c.id),text:c.nombre}))];
function buscar(query,{options=opciones,data=clientes}={}){
  const a=app();a.context.searchOptions=options;a.context.searchData=data;a.context.searchQuery=query;
  return JSON.parse(a.run('JSON.stringify(filtrarOpcionesBuscables(searchOptions,searchData,searchQuery).map(o=>o.value))'));
}
test('Cliente: nombre sin acentos, mayúsculas y palabras en otro orden',()=>{
  assert.deepEqual(buscar('PEREZ maria'),['1']);assert.deepEqual(buscar('  jose  '),['1']);
});
test('Teléfono: encontrar números con espacios, guiones, prefijo y paréntesis',()=>{
  for(const query of ['2615551234','5551234','+54 9 261 5551234','261-555-1234','(261) 555 1234'])assert.deepEqual(buscar(query),['1'],query);
});
test('El cliente seleccionado no es una coincidencia si el texto busca otro',()=>{
  assert.deepEqual(buscar('ana'),['2']);
});
test('No ofrece opciones vacías ni deshabilitadas como resultados',()=>{
  assert.deepEqual(buscar('ana',{options:[...opciones,{value:'3',text:'Ana duplicada',disabled:true}]}),['2']);
});
test('Cobros: busca solo clientes presentes en el formulario de deuda',()=>{
  assert.deepEqual(buscar('ana',{options:opciones.filter(o=>o.value!=='2')}),[]);
});
test('Usa las opciones y teléfonos actuales al reabrir el formulario',()=>{
  assert.deepEqual(buscar('López'),[]);
  assert.deepEqual(buscar('lopez',{options:[...opciones,{value:'3',text:'Pedro López'}],data:[...clientes,{id:3,nombre:'Pedro López',tel:'1234'}]}),['3']);
});
test('Productos: busca por código base y variante',()=>{
  const data=[{id:1,codigo:'REM-001',variantes:[{cod:'REM-001-NEG-M'}]}],options=[{value:'1',text:'Remera'}];
  assert.deepEqual(buscar('REM-001-NEG-M',{data,options}),['1']);
});
test('Sin coincidencias no ofrece consumidor final ni clientes ajenos',()=>{
  assert.deepEqual(buscar('cliente inexistente'),[]);
});
