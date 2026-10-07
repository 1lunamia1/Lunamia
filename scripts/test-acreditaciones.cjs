// Ejecutar con: node --test scripts/test-acreditaciones.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {app,vender,acreditar}=require('./test-helpers.cjs');

for(const tipo of ['credito','debito']){
  test(`${tipo}: confirmar vende y descuenta stock, sin ingresar dinero`,()=>{
    const a=app();vender(a,[{tipo,monto:19000}]);
    assert.equal(a.run('DB.ventas[0].total'),19000);
    assert.equal(a.run('DB.productos[0].variantes[0].stock'),2);
    assert.equal(a.run('totalCaja("principal")'),75000);
    assert.equal(a.run('DB.movimientos.length'),0);
    assert.equal(a.run('totalTarjetasPendientes()'),19000);
    assert.equal(a.run('DB.clientes[0].comprasTotal'),19000);
  });
  test(`${tipo}: acreditar ingresa el neto una vez y registra la comisión`,()=>{
    const a=app();vender(a,[{tipo,monto:19000}]);
    assert.equal(acreditar(a),true);
    assert.equal(a.run('DB.cajas.principal.mercadopago'),43050);
    assert.equal(a.run('DB.ventas[0].total'),19000);
    assert.equal(a.run('DB.ventas[0].pagos[0].comision'),950);
    assert.equal(a.run('DB.movimientos[0].monto'),18050);
    assert.equal(a.run('DB.movimientos[0].fechaISO'),'2026-10-07');
    assert.equal(a.run('DB.productos[0].variantes[0].stock'),2);
    assert.equal(a.run('DB.clientes[0].comprasTotal'),19000);
    assert.equal(a.run('totalTarjetasPendientes()'),0);
    assert.equal(a.run('registrarAcreditacionTarjeta()'),false);
    assert.equal(a.run('DB.movimientos.length'),1);
    assert.equal(a.run('DB.cajas.principal.mercadopago'),43050);
  });
}
test('Pago mixto: solo efectivo ingresa al confirmar; cada tarjeta se acredita por separado',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:4000},{tipo:'credito',monto:10000},{tipo:'debito',monto:5000}]);
  assert.equal(a.run('DB.cajas.principal.efectivo'),54000);
  assert.equal(a.run('totalTarjetasPendientes()'),15000);
  assert.equal(acreditar(a,{indice:1,comision:500}),true);
  assert.equal(a.run('totalTarjetasPendientes()'),5000);
  assert.equal(acreditar(a,{indice:2,comision:100,caja:'reinversion',medio:'efectivo'}),true);
  assert.equal(a.run('DB.cajas.reinversion.efectivo'),4900);
  assert.equal(a.run('totalTarjetasPendientes()'),0);
  assert.equal(a.run('DB.movimientos.length'),3);
  a.run('eliminarVentaPorId(1)');
  assert.equal(a.run('totalCaja("principal")'),75000);
  assert.equal(a.run('totalCaja("reinversion")'),0);
  assert.equal(a.run('DB.productos[0].variantes[0].stock'),3);
});
test('Tarjeta y cuenta corriente: deuda y puntos se registran una sola vez',()=>{
  const a=app();vender(a,[{tipo:'credito',monto:10000},{tipo:'cuenta',monto:9000}]);
  assert.equal(a.run('DB.clientes[0].deuda'),9000);
  assert.equal(acreditar(a,{comision:500}),true);
  assert.equal(a.run('DB.clientes[0].deuda'),9000);
  assert.equal(a.run('DB.clientes[0].puntos'),19);
});
for(const acreditada of [false,true]){
  test(`Eliminar tarjeta ${acreditada?'acreditada':'pendiente'} revierte solo dinero que ingresó`,()=>{
    const a=app();vender(a,[{tipo:'credito',monto:19000}]);
    if(acreditada)acreditar(a,{caja:'reinversion',medio:'efectivo'});
    a.run('eliminarVentaPorId(1)');
    assert.equal(a.run('DB.cajas.principal.efectivo'),50000);
    assert.equal(a.run('DB.cajas.principal.mercadopago'),25000);
    assert.equal(a.run('totalCaja("reinversion")'),0);
    assert.equal(a.run('DB.productos[0].variantes[0].stock'),3);
    assert.equal(a.run('DB.clientes[0].comprasTotal'),0);
    assert.equal(a.run('totalTarjetasPendientes()'),0);
  });
}
test('Pagos históricos con tarjeta conservan su ingreso previo',()=>{
  const a=app();
  a.run("DB.ventas=[{id:1,total:19000,estado:'pagada',pagos:[{tipo:'credito',monto:19000}]}];aplicarEfectosVenta(DB.ventas[0]);");
  assert.equal(a.run('DB.cajas.principal.credito'),19000);
  assert.equal(a.run('totalTarjetasPendientes()'),0);
  a.run('revertirEfectosVenta(DB.ventas[0])');
  assert.equal(a.run('DB.cajas.principal.credito'),0);
});
test('Datos de acreditación sobreviven al editor; se bloquea cambiar el total ya ingresado',()=>{
  const a=app();vender(a,[{tipo:'credito',monto:19000}]);acreditar(a);
  a.run("ventaOriginal=cloneData(DB.ventas[0]);document.getElementById('ev-pendiente').checked=false;");
  assert.equal(a.run("pagosEditados(19000,'credito',1)[0].monto_neto"),18050);
  assert.equal(a.run("pagosEditados(19000,'credito',1)[0].fecha_acreditacion"),'2026-10-07');
  assert.equal(a.run("pagosEditados(20000,'credito',1)"),null);
  assert.equal(a.run("pagosEditados(19000,'efectivo',1)"),null);
  a.run("const pagosGuardados=pagosEditados(19000,'credito',1);revertirEfectosVenta(DB.ventas[0]);DB.ventas[0].pagos=pagosGuardados;aplicarEfectosVenta(DB.ventas[0]);");
  assert.equal(a.run('DB.cajas.principal.mercadopago'),43050);
  assert.equal(a.run('DB.movimientos.length'),1);
});
test('Editar tarjeta pendiente mantiene la espera y recalcula su monto',()=>{
  const a=app();vender(a,[{tipo:'credito',monto:19000}]);
  a.run("ventaOriginal=cloneData(DB.ventas[0]);document.getElementById('ev-pendiente').checked=false;");
  assert.equal(a.run("pagosEditados(20000,'credito',1)[0].monto"),20000);
  assert.equal(a.run("pagosEditados(20000,'credito',1)[0].acreditacion"),'pendiente');
});
for(const comision of [-1,19001,Infinity]){
  test(`Comisión inválida ${comision} no modifica caja ni estado`,()=>{
    const a=app();vender(a,[{tipo:'credito',monto:19000}]);
    assert.equal(acreditar(a,{comision}),false);
    assert.equal(a.run('totalCaja("principal")'),75000);
    assert.equal(a.run('totalTarjetasPendientes()'),19000);
  });
}
test('Ingreso sin comisión, o comisión por el total, conserva el importe de venta',()=>{
  for(const comision of [0,19000]){
    const a=app();vender(a,[{tipo:'credito',monto:19000}]);
    assert.equal(acreditar(a,{comision}),true);
    assert.equal(a.run('DB.cajas.principal.mercadopago'),44000-comision);
    assert.equal(a.run('DB.ventas[0].total'),19000);
  }
});
test('Un pago modificado o una venta eliminada mientras se abre el ingreso no se acredita',()=>{
  const a=app();vender(a,[{tipo:'credito',monto:19000}]);
  a.run("abrirIngresoTarjeta(1);DB.ventas[0].pagos[0].monto=18000;");
  assert.equal(a.run('registrarAcreditacionTarjeta()'),false);
  a.run('DB.ventas[0].eliminada=true');
  assert.equal(a.run('registrarAcreditacionTarjeta()'),false);
  assert.equal(a.run('totalCaja("principal")'),75000);
});
test('Venta reservada continúa sin pagos ni dinero hasta cobrarla',()=>{
  const a=app();a.element('cobrar-pendiente-toggle').checked=true;
  vender(a,[{tipo:'credito',monto:19000}]);
  assert.equal(a.run('DB.ventas[0].estado'),'pendiente');
  assert.equal(a.run('DB.ventas[0].pagos.length'),0);
  assert.equal(a.run('totalTarjetasPendientes()'),0);
  assert.equal(a.run('totalCaja("principal")'),75000);
  assert.equal(a.run('DB.clientes[0].puntos'),0);
});
test('Eliminar reserva no revierte puntos de compras anteriores del cliente',()=>{
  const a=app();
  a.run('DB.clientes[0].puntos=100;DB.clientes[0].comprasTotal=100000;');
  a.element('cobrar-pendiente-toggle').checked=true;
  vender(a,[{tipo:'credito',monto:19000}]);
  a.run('eliminarVentaPorId(1)');
  assert.equal(a.run('DB.clientes[0].puntos'),100);
  assert.equal(a.run('DB.clientes[0].comprasTotal'),100000);
});
test('Cambiar efectivo a tarjeta en el editor genera un ingreso pendiente',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);
  a.run("ventaOriginal=cloneData(DB.ventas[0]);document.getElementById('ev-pendiente').checked=false;const nuevosPagos=pagosEditados(19000,'debito',1);revertirEfectosVenta(DB.ventas[0]);DB.ventas[0].pagos=nuevosPagos;aplicarEfectosVenta(DB.ventas[0]);");
  assert.equal(a.run('totalCaja("principal")'),75000);
  assert.equal(a.run('totalTarjetasPendientes()'),19000);
  assert.equal(a.run('DB.productos[0].variantes[0].stock'),2);
});
test('Un importe negativo en un pago mixto no crea una tarjeta mayor al total de venta',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:-1000},{tipo:'credito',monto:20000}]);
  assert.equal(a.run('DB.ventas.length'),0);
  assert.equal(a.run('totalCaja("principal")'),75000);
  assert.equal(a.run('DB.productos[0].variantes[0].stock'),3);
});
