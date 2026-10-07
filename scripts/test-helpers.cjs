const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function app({config={},storage=new Map()}={}){
  const elements=new Map();
  const element=id=>{
    if(!elements.has(id)){
      let value='';
      elements.set(id,{get value(){return value;},set value(next){value=String(next);},checked:false,style:{},classList:{add(){},remove(){}},textContent:'',innerHTML:''});
    }
    return elements.get(id);
  };
  const context=vm.createContext({
    window:{LUNAMIA_CONFIG:config,localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}},console,setTimeout:()=>1,clearTimeout:()=>{},
    alert:()=>{},confirm:()=>true,
    document:{readyState:'loading',getElementById:element,addEventListener(){},querySelectorAll:()=>[],body:{insertAdjacentHTML(){}}},
  });
  for(const file of ['app.js','integridad.js','persistencia.js','acreditaciones.js','pagos-clientes.js','editar-venta.js']){
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),context,{filename:file});
  }
  const run=code=>vm.runInContext(code,context);
  run(`
    renderSidebar=renderCarrito=renderProdGrid=renderPausados=renderHistorialVentas=renderPage=actualizarDashboard=()=>{};
    DB=emptyDB();
    DB.productos=[{id:1,nombre:'Producto de prueba',precio:19000,costo:5000,variantes:[{cod:'P1-M',t:'M',stock:3}]}];
    DB.clientes=[{id:1,nombre:'Cliente',deuda:0,saldoFavor:0,puntos:0,comprasTotal:0,historial:[]}];
    DB.cajas.principal.efectivo=50000;
    DB.cajas.principal.mercadopago=25000;
    carritos=[{id:1,nombre:'Venta 1',clienteId:1,items:[{pid:1,cod:'P1-M',nombre:'Producto de prueba',talle:'M',precio:19000,qty:1}]}];
    carritoIdx=0;
    document.getElementById('cobrar-desc').value='0';
    currentMod='ventas';currentSub.ventas='historial-ventas';
  `);
  return {run,element,context,storage};
}
function vender(a,pagos){
  a.run(`pagosMethods=${JSON.stringify(pagos)};procesarVenta();`);
}
function acreditar(a,{indice=0,comision=950,caja='principal',medio='mercadopago',fecha='2026-10-07'}={}){
  a.run('abrirIngresoTarjeta(1)');
  a.element('ac-pago').value=String(indice);
  a.run('seleccionarPagoAcreditacion()');
  a.element('ac-comision').value=String(comision);
  a.run("recalcAcreditacion('comision')");
  a.element('ac-caja').value=caja;
  a.element('ac-medio').value=medio;
  a.element('ac-fecha').value=fecha;
  return a.run('registrarAcreditacionTarjeta()');
}


module.exports={app,vender,acreditar};
