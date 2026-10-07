const {test}=require('node:test');
const assert=require('node:assert/strict');
const {app,vender}=require('./test-helpers.cjs');

function pagar(a,monto=20000,metodo='Efectivo'){
  a.element('pago-cli').value='1';a.element('pago-cli-monto').value=monto;a.element('pago-cli-metodo').value=metodo;
  return a.run('procesarPagoCli()');
}
function devolver(a,{cantidad=1,monto=19000,cliente=1,venta=1}={}){
  for(const [id,value] of Object.entries({'dev-venta':venta,'dev-cliente':cliente,'dev-prod':'P1-M','dev-cantidad':cantidad,'dev-monto':monto,'dev-motivo':'Talle'}))a.element(id).value=value;
  return a.run('procesarDevolucion()');
}
function productoForm(a){
  for(const [id,v] of Object.entries({'np-nombre':'Producto','np-marca':'Marca','np-tipo':'Prueba','np-cat':'REM','np-gen':'DAM','np-precio-edit':19000,'np-costo':5000,'np-gan':280,'np-codigo-edit':'COD-NUEVO','np-prov':'','npv-0':2}))a.element(id).value=v;
}
test('Dos carritos con la última unidad no pueden cobrar dos ventas',()=>{
  const a=app();a.run("DB.productos[0].variantes[0].stock=1;carritos.push({id:2,nombre:'Venta 2',clienteId:1,items:cloneData(carrito().items)});");
  vender(a,[{tipo:'credito',monto:19000}]);a.run('carritoIdx=1');vender(a,[{tipo:'efectivo',monto:19000}]);
  assert.equal(a.run('DB.ventas.length'),1);assert.equal(a.run('DB.productos[0].variantes[0].stock'),0);assert.equal(a.run('totalCaja("principal")'),75000);
});
for(const qty of [0,-1,1.5,Infinity])test(`Cantidad ${qty} no modifica stock ni ventas`,()=>{
  const a=app();a.context.badQty=qty;a.run('carrito().items[0].qty=badQty;');vender(a,[{tipo:'efectivo',monto:19000}]);
  assert.equal(a.run('DB.ventas.length'),0);assert.equal(a.run('DB.productos[0].variantes[0].stock'),3);
});
test('Eliminar pago con excedente recupera deuda, favor, caja y vencimiento',()=>{
  const a=app();a.run("DB.clientes[0].deuda=15000;DB.clientes[0].vence='30/10/2026';");pagar(a);
  assert.equal(a.run('DB.clientes[0].deuda'),0);assert.equal(a.run('DB.clientes[0].saldoFavor'),5000);
  a.run('anularPagoCliente(1)');
  assert.equal(a.run('DB.clientes[0].deuda'),15000);assert.equal(a.run('DB.clientes[0].saldoFavor'),0);assert.equal(a.run('DB.cajas.principal.efectivo'),50000);assert.equal(a.run('DB.clientes[0].vence'),'30/10/2026');
});
test('Editar un cobro con excedente no acumula saldo a favor',()=>{
  const a=app();a.run('DB.clientes[0].deuda=15000;');pagar(a);
  a.run('editingPagoClienteId=1;pagoClienteSnapshot=JSON.stringify(DB.pagosClientes[0]);');pagar(a,17000);
  assert.equal(a.run('DB.clientes[0].saldoFavor'),2000);assert.equal(a.run('DB.clientes[0].deuda'),0);assert.equal(a.run('DB.cajas.principal.efectivo'),67000);assert.equal(a.run('DB.clientes[0].historial.length'),1);
});
test('Excedente utilizado se transforma en deuda al anular el cobro original',()=>{
  const a=app();a.run('DB.clientes[0].deuda=15000;');pagar(a);
  vender(a,[{tipo:'cuenta',monto:19000}]);assert.equal(a.run('DB.clientes[0].deuda'),14000);
  a.run('anularPagoCliente(1)');assert.equal(a.run('DB.clientes[0].deuda'),34000);assert.equal(a.run('DB.clientes[0].saldoFavor'),0);
});
test('Una venta a cuenta ya abonada genera crédito al anularse',()=>{
  const a=app();vender(a,[{tipo:'cuenta',monto:19000}]);pagar(a,19000);
  a.run('eliminarVentaPorId(1)');assert.equal(a.run('DB.clientes[0].deuda'),0);assert.equal(a.run('DB.clientes[0].saldoFavor'),19000);assert.equal(a.run('DB.cajas.principal.efectivo'),69000);
});
for(const tipo of ['Débito','Crédito'])test(`Cobro de cuenta con ${tipo} espera acreditación sin duplicar deuda`,()=>{
  const a=app();a.run('DB.clientes[0].deuda=19000;');assert.equal(pagar(a,19000,tipo),true);
  assert.equal(a.run('totalCaja("principal")'),75000);assert.equal(a.run('DB.clientes[0].deuda'),0);assert.equal(a.run('totalTarjetasPendientes()'),19000);
  a.run("abrirIngresoTarjeta(1,'cliente')");a.element('ac-pago').value='0';a.run('seleccionarPagoAcreditacion()');a.element('ac-neto').value='18050';a.run("recalcAcreditacion('neto')");
  a.element('ac-caja').value='principal';a.element('ac-medio').value='mercadopago';a.element('ac-fecha').value='2026-10-07';
  assert.equal(a.run('registrarAcreditacionTarjeta()'),true);assert.equal(a.run('DB.cajas.principal.mercadopago'),43050);assert.equal(a.run('DB.clientes[0].deuda'),0);
  a.run('anularPagoCliente(1)');assert.equal(a.run('DB.clientes[0].deuda'),19000);assert.equal(a.run('totalCaja("principal")'),75000);
});
for(const monto of [-1000,0,Infinity,1.001])test(`Importe de gasto ${monto} no cambia caja`,()=>{
  const a=app();a.element('g-monto').value=monto;assert.equal(a.run('guardarGasto()'),false);assert.equal(a.run('DB.gastos.length'),0);assert.equal(a.run('totalCaja("principal")'),75000);
});
test('Un pago negativo no aumenta deuda ni reduce dinero',()=>{
  const a=app();a.run('DB.clientes[0].deuda=15000;');assert.equal(pagar(a,-1000),false);assert.equal(a.run('DB.clientes[0].deuda'),15000);assert.equal(a.run('totalCaja("principal")'),75000);
});
test('Gastos válidos pueden editarse y eliminarse manteniendo la caja',()=>{
  const a=app();a.element('g-monto').value=1000;a.element('g-caja').value='principal';a.element('g-medio').value='efectivo';a.element('g-fecha').value='2026-10-07';a.element('g-cat').value='Otros';a.run('guardarGasto()');
  assert.equal(a.run('DB.cajas.principal.efectivo'),49000);
  assert.equal(a.run("guardarEdicionMovimiento(1,{monto:500,signo:-1,medio:'mercadopago',concepto:'Gasto',fechaISO:'2026-10-07'})"),true);
  assert.equal(a.run('DB.cajas.principal.efectivo'),50000);assert.equal(a.run('DB.cajas.principal.mercadopago'),24500);assert.equal(a.run('DB.gastos[0].monto'),500);
  a.run('eliminarMovimiento(1)');assert.equal(a.run('totalCaja("principal")'),75000);assert.equal(a.run('DB.gastos.length'),0);
});
test('Funciones internas no permiten editar ni eliminar movimientos de venta',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);const before=a.run('JSON.stringify(DB)');
  assert.equal(a.run("guardarEdicionMovimiento(1,{monto:1000,signo:1,medio:'efectivo',concepto:'Venta',fechaISO:'2026-10-07'})"),false);
  assert.equal(a.run('eliminarMovimiento(1)'),false);assert.equal(a.run('JSON.stringify(DB)'),before);
});
test('Rechazar edición de transferencia con saldo insuficiente restaura todos los datos',()=>{
  const a=app();a.run("DB.transferencias=[{id:1,origen:'principal',destino:'reinversion',medio:'efectivo',medioDestino:'mercadopago',monto:1000}];DB.movimientos=[{id:1,tipo:'transferencia',transferencia_id:1,caja:'principal',origen:'principal',destino:'reinversion',medio:'efectivo',medioDestino:'mercadopago',monto:1000,signo:-1}];DB.cajas.principal.efectivo-=1000;DB.cajas.reinversion.mercadopago=1000;");
  const before=a.run('JSON.stringify(DB)');assert.equal(a.run("guardarEdicionMovimiento(1,{monto:999999,signo:-1,medio:'efectivo',medioDestino:'credito',concepto:'Prueba',fechaISO:'2026-10-07'})"),false);assert.equal(a.run('JSON.stringify(DB)'),before);
});
test('Una devolución válida restituye cantidad y favor; no puede repetirse',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);assert.equal(devolver(a),true);
  assert.equal(a.run('DB.productos[0].variantes[0].stock'),3);assert.equal(a.run('DB.clientes[0].saldoFavor'),19000);assert.equal(devolver(a),false);assert.equal(a.run('DB.devoluciones.length'),1);
  assert.equal(a.run('eliminarVentaPorId(1)'),false);a.run('anularDevolucion(1)');assert.equal(a.run('DB.clientes[0].saldoFavor'),0);assert.equal(a.run('DB.productos[0].variantes[0].stock'),2);
});
for(const data of [{cantidad:2},{cantidad:0},{cantidad:1.5},{monto:-1},{monto:20000},{cliente:999},{venta:999}])test(`Devolución inválida ${JSON.stringify(data)} no crea saldo ni stock`,()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);assert.equal(devolver(a,data),false);assert.equal(a.run('DB.devoluciones.length'),0);assert.equal(a.run('DB.productos[0].variantes[0].stock'),2);assert.equal(a.run('DB.clientes[0].saldoFavor'),0);
});
test('Con descuentos se devuelve como máximo el precio realmente vendido',()=>{
  const a=app();a.element('cobrar-desc').value=50;vender(a,[{tipo:'efectivo',monto:9500}]);assert.equal(devolver(a),false);assert.equal(devolver(a,{monto:9500}),true);
});
test('Costos y códigos históricos sobreviven a editar el producto',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);productoForm(a);a.element('np-costo').value=9000;a.run('editingProductId=1;npVarsTmp=cloneData(DB.productos[0].variantes);guardarProducto();');
  assert.equal(a.run('DB.productos[0].codigo'),'COD-NUEVO');assert.equal(a.run('DB.productos[0].variantes[0].cod'),'P1-M');assert.equal(a.run('normalizarItemsVenta(DB.ventas[0])[0].costo_unitario'),5000);assert.equal(a.run('eliminarProducto(1)'),false);
});
test('Stock y costos inválidos o talles repetidos no crean productos',()=>{
  for(const [id,value] of [['npv-0',-1],['npv-0',1.5],['np-costo',-1],['np-precio-edit',Infinity]]){
    const a=app();productoForm(a);a.run("npVarsTmp=[{t:'M'}];");a.element(id).value=value;assert.equal(a.run('guardarProducto()'),false);assert.equal(a.run('DB.productos.length'),1);
  }
  const a=app();productoForm(a);a.run("npVarsTmp=[{t:'M'},{t:'M'}];");assert.equal(a.run('guardarProducto()'),false);
});
test('Ingresos de mercadería no admiten cantidades fraccionarias o costos negativos',()=>{
  const a=app();a.run("DB.proveedores=[{id:1,nombre:'Proveedor',compras:[]}];ingRowsData=[{prodId:1,cod:'P1-M',cantIngreso:1.5,nuevoCosto:1000}];");a.element('ing-prov').value=1;assert.equal(a.run('confirmarIngreso()'),false);assert.equal(a.run('DB.productos[0].variantes[0].stock'),3);
});
test('Cierre exige ambos saldos contados y permite cero explícito',()=>{
  const a=app();assert.equal(a.run('procesarCierre()'),false);a.element('cierre-ef-real').value=-1;a.element('cierre-mp-real').value=0;assert.equal(a.run('procesarCierre()'),false);
  a.element('cierre-ef-real').value=0;a.run('procesarCierre()');assert.equal(a.run('DB.cierres.length'),1);
});
test('IDs de movimientos no se reutilizan después de eliminar registros',()=>{
  const a=app();assert.equal(a.run('nextId(DB.movimientos)'),1);assert.equal(a.run('nextId(DB.movimientos)'),2);
});
test('Los registros de otros años no se suman a hoy por compartir día y mes',()=>{
  const a=app();assert.equal(a.run("isTodayRecord({fecha:todayShort(),fechaISO:'2025-'+toDateInput().slice(5)})"),false);assert.equal(a.run('isTodayRecord({fecha:todayShort()})'),false);
});
test('Deudas con vencimiento lejano no se muestran como clientes sin deuda',()=>{
  const a=app();a.run("DB.clientes[0].deuda=100;DB.clientes[0].vence='31/12/2099';");assert.equal(a.run('estadoClienteActual(DB.clientes[0])'),'vigente');a.run("DB.clientes[0].vence='01/01/2000';");assert.equal(a.run('estadoClienteActual(DB.clientes[0])'),'vencida');
});
test('Una venta con centavos conserva importe y saldo exactos',()=>{
  const a=app();a.run('carrito().items[0].precio=19.95;');vender(a,[{tipo:'efectivo',monto:19.95}]);assert.equal(a.run('DB.ventas[0].total'),19.95);assert.equal(a.run('DB.cajas.principal.efectivo'),50019.95);
});
test('Un faltante de un centavo impide confirmar hasta cobrarlo o enviarlo a cuenta',()=>{
  const a=app();a.run('carrito().items[0].precio=100.01;');
  vender(a,[{tipo:'efectivo',monto:100}]);
  assert.equal(a.run('DB.ventas.length'),0);assert.equal(a.run('DB.cajas.principal.efectivo'),50000);
  a.element('cobrar-cta-cte-toggle').checked=true;
  vender(a,[{tipo:'efectivo',monto:100}]);
  assert.equal(a.run('DB.ventas.length'),1);assert.equal(a.run('DB.clientes[0].deuda'),0.01);
});
test('Los centavos de devoluciones parciales suman el importe original completo',()=>{
  const a=app();a.run('carrito().items[0].precio=100/3;carrito().items[0].qty=3;');
  // Una venta histórica con tres unidades y un total indivisible entre tres.
  a.run("DB.ventas=[{id:1,total:100,estado:'pagada',cliente_id:1,pagos:[],items_detalle:[{pid:1,cod:'P1-M',cantidad:3,precio:34,precio_unitario:34}]}];DB.productos[0].variantes[0].stock=0;");
  for(const monto of [33.33,33.34,33.33])assert.equal(devolver(a,{monto}),true);assert.equal(a.run('DB.clientes[0].saldoFavor'),100);assert.equal(a.run('DB.productos[0].variantes[0].stock'),3);
});
test('Crear y editar categorías conserva las categorías iniciales',()=>{
  const a=app();a.element('cat-nombre').value='Accesorios';a.element('cat-codigo').value='ACC';a.run('guardarCategoria()');assert.equal(a.run('DB.categorias.length'),5);
  a.element('cat-nombre').value='Remeras nuevas';a.element('cat-codigo').value='REM';a.run('editingCategoryId=4;guardarCategoria()');assert.equal(a.run('DB.categorias[3].nombre'),'Remeras nuevas');
});
