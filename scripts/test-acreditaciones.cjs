// Ejecutar con: node --test scripts/test-acreditaciones.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {app,vender,acreditar}=require('./test-helpers.cjs');

function abrirEditorVenta(a){
  const items=JSON.parse(a.run('JSON.stringify(prepararItemsEdicion(DB.ventas[0]))'));
  // El DOM de pruebas no genera los controles a partir del HTML del editor.
  items.forEach((item,i)=>{
    a.element(`ev-item-prod-${i}`).value=item.pid;
    a.element(`ev-item-var-${i}`).value=item.cod;
    a.element(`ev-item-cant-${i}`).value=item.cantidad;
    a.element(`ev-item-precio-${i}`).value=item.precio;
    a.element(`ev-item-desc-${i}`).value=item.descuentoItemPct;
  });
  a.run('editarVenta(1,true)');
}

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
test('Corregir fecha y hora de una venta mixta actualiza los ingresos inmediatos sin duplicarlos',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:4000},{tipo:'transferencia',monto:5000},{tipo:'credito',monto:10000}]);
  assert.equal(acreditar(a,{indice:2,comision:500}),true);
  const cajas=a.run('JSON.stringify(DB.cajas)');
  const pagos=a.run('JSON.stringify(DB.ventas[0].pagos)');
  const acreditacion=a.run('JSON.stringify(DB.movimientos[0])');
  const movimientos=a.run('JSON.stringify(DB.movimientos.map(({fecha,fechaISO,hora,...resto})=>resto))');
  abrirEditorVenta(a);
  a.element('ev-fecha').value='2026-09-22';
  a.element('ev-hora').value='13:45';
  a.run('guardarCambiosVenta()');

  assert.equal(a.run('DB.ventas[0].fechaISO'), '2026-09-22');
  assert.equal(a.run('DB.ventas[0].hora'), '13:45');
  assert.equal(a.run('DB.movimientos.filter(m=>m.fechaISO==="2026-09-22"&&m.fecha==="22/09"&&m.hora==="13:45").length'),2);
  assert.equal(a.run('JSON.stringify(DB.movimientos[0])'),acreditacion);
  assert.equal(a.run('JSON.stringify(DB.movimientos.map(({fecha,fechaISO,hora,...resto})=>resto))'),movimientos);
  assert.equal(a.run('JSON.stringify(DB.ventas[0].pagos)'),pagos);
  assert.equal(a.run('JSON.stringify(DB.cajas)'),cajas);
});
test('Corregir la hora identifica un movimiento histórico por el número completo de venta',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);
  a.run(`
    delete DB.movimientos[0].venta_id;
    DB.movimientos.push(
      {...DB.movimientos[0],id:2,concepto:'Venta #11 — otra venta'},
      {...DB.movimientos[0],id:3,venta_id:11},
      {...DB.movimientos[0],id:4,venta_id:1,tipo:'reversion_venta'}
    );
  `);
  const otros=a.run('JSON.stringify(DB.movimientos.slice(1))');
  abrirEditorVenta(a);
  const hora=a.element('ev-hora').value==='13:45'?'14:45':'13:45';
  a.element('ev-hora').value=hora;
  a.run('guardarCambiosVenta()');

  assert.equal(a.run('DB.movimientos[0].hora'),hora);
  assert.equal(a.run('JSON.stringify(DB.movimientos.slice(1))'),otros);
});
test('Corregir la fecha de una venta en cuenta corriente conserva deuda y favor posteriores',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:9000},{tipo:'cuenta',monto:10000}]);
  a.element('pago-cli').value='1';
  a.element('pago-cli-monto').value='12000';
  a.element('pago-cli-metodo').value='Efectivo';
  assert.equal(a.run('registrarPagoCliente()'),true);
  const saldos=a.run('JSON.stringify([DB.cajas,DB.clientes[0].deuda,DB.clientes[0].saldoFavor])');
  const cobro=a.run('JSON.stringify(DB.movimientos.find(m=>m.pago_cliente_id))');
  abrirEditorVenta(a);
  a.element('ev-fecha').value='2026-09-22';
  a.run('guardarCambiosVenta()');

  assert.equal(a.run('DB.clientes[0].historial.find(h=>h.venta_id===1).fechaISO'),'2026-09-22');
  assert.equal(a.run('DB.movimientos.find(m=>m.venta_id===1).fechaISO'),'2026-09-22');
  assert.equal(a.run('JSON.stringify(DB.movimientos.find(m=>m.pago_cliente_id))'),cobro);
  assert.equal(a.run('JSON.stringify([DB.cajas,DB.clientes[0].deuda,DB.clientes[0].saldoFavor])'),saldos);
});
test('El editor conserva el importe de una tarjeta cobrada y pendiente de acreditación',()=>{
  const a=app();vender(a,[{tipo:'credito',monto:19000}]);
  a.run("ventaOriginal=cloneData(DB.ventas[0]);document.getElementById('ev-pendiente').checked=false;");
  assert.equal(a.run("pagosEditados(20000,'credito',1)"),null);
  assert.equal(a.run("pagosEditados(19000,'credito',1)[0].acreditacion"),'pendiente');
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
test('El editor bloquea cambiar monto, medio o estado de un cobro confirmado',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);
  const antes=a.run('JSON.stringify(DB)');
  abrirEditorVenta(a);
  a.element('ev-item-precio-0').value=18000;
  a.run('guardarCambiosVenta()');
  a.element('ev-item-precio-0').value=19000;
  a.element('ev-metodo-pago').value='debito';
  a.run('guardarCambiosVenta()');
  a.element('ev-metodo-pago').value='efectivo';
  a.element('ev-pendiente').checked=true;
  a.run('guardarCambiosVenta()');
  assert.equal(a.run('JSON.stringify(DB)'),antes);
});
test('Una reserva se puede editar y cobrar sin volver a descontar el stock',()=>{
  const a=app();a.element('cobrar-pendiente-toggle').checked=true;
  vender(a,[{tipo:'efectivo',monto:19000}]);
  abrirEditorVenta(a);
  a.element('ev-pendiente').checked=false;
  a.element('ev-metodo-pago').value='debito';
  a.element('ev-item-precio-0').value=18000;
  a.run('guardarCambiosVenta()');
  assert.equal(a.run('DB.ventas[0].estado'),'pagada');
  assert.equal(a.run('totalTarjetasPendientes()'),18000);
  assert.equal(a.run('DB.movimientos.length'),0);
  assert.equal(a.run('DB.productos[0].variantes[0].stock'),2);
});
function corregirMedio(a,indice,tipo){
  return a.run(`corregirMedioPagoVenta(1,${indice},${JSON.stringify(tipo)},JSON.stringify(DB.ventas[0]))`);
}
test('Corregir solo efectivo de una venta mixta conserva el pago acreditado y todos los importes',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:9000},{tipo:'credito',monto:10000}]);
  assert.equal(acreditar(a,{indice:1,comision:500}),true);
  const acreditacion=a.run('JSON.stringify([DB.ventas[0].pagos[1],DB.movimientos[0]])');
  const operacion=a.run('JSON.stringify([DB.ventas[0].total,DB.ventas[0].items_detalle,DB.productos,DB.clientes])');
  const movimiento=a.run('JSON.stringify(DB.movimientos[1])');
  assert.equal(corregirMedio(a,0,'transferencia'),true);
  assert.equal(a.run('JSON.stringify([DB.ventas[0].pagos[1],DB.movimientos[0]])'),acreditacion);
  assert.equal(a.run('JSON.stringify([DB.ventas[0].total,DB.ventas[0].items_detalle,DB.productos,DB.clientes])'),operacion);
  assert.equal(a.run('DB.movimientos.length'),2);
  assert.deepEqual(JSON.parse(a.run('JSON.stringify(DB.movimientos[1])')),{...JSON.parse(movimiento),medio:'mercadopago'});
  assert.equal(a.run('DB.cajas.principal.efectivo'),50000);
  assert.equal(a.run('DB.cajas.principal.mercadopago'),43500);
  assert.equal(a.run('DB.ventas[0].historial_cambios.at(-1).antes.tipo'),'efectivo');
  assert.equal(a.run('DB.ventas[0].historial_cambios.at(-1).despues.tipo'),'transferencia');
});
test('Transferencia y Mercado Pago se corrigen sin exigir fondos para una reversión del mismo medio',()=>{
  const a=app();vender(a,[{tipo:'transferencia',monto:19000}]);
  a.run('DB.cajas.principal.mercadopago=0');
  const movimiento=a.run('JSON.stringify(DB.movimientos[0])');
  assert.equal(corregirMedio(a,0,'mercadopago'),true);
  assert.equal(a.run('JSON.stringify(DB.movimientos[0])'),movimiento);
  assert.equal(a.run('DB.cajas.principal.mercadopago'),0);
  const antes=a.run('JSON.stringify(DB)');
  assert.equal(corregirMedio(a,0,'efectivo'),false);
  assert.equal(a.run('JSON.stringify(DB)'),antes);
});
test('Corregir efectivo a tarjeta pendiente y volver a medio inmediato mantiene un solo ingreso',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);
  assert.equal(corregirMedio(a,0,'debito'),true);
  assert.equal(a.run('DB.movimientos.length'),0);
  assert.equal(a.run('totalTarjetasPendientes()'),19000);
  assert.equal(a.run('DB.cajas.principal.efectivo'),50000);
  assert.equal(corregirMedio(a,0,'transferencia'),true);
  assert.equal(a.run('DB.movimientos.length'),1);
  assert.equal(a.run('DB.movimientos[0].monto'),19000);
  assert.equal(a.run('DB.movimientos[0].fechaISO'),a.run('DB.ventas[0].fechaISO'));
  assert.equal(a.run('totalTarjetasPendientes()'),0);
  assert.equal(a.run('DB.cajas.principal.mercadopago'),44000);
  assert.equal(a.run('DB.productos[0].variantes[0].stock'),2);
});
test('Corregir el tipo de tarjeta acreditada conserva el depósito, y el formulario bloquea cambiarla a efectivo',()=>{
  const a=app();vender(a,[{tipo:'credito',monto:19000}]);
  assert.equal(acreditar(a,{caja:'reinversion',medio:'efectivo'}),true);
  const antes=a.run('JSON.stringify(DB)');
  assert.equal(corregirMedio(a,0,'efectivo'),false);
  assert.equal(a.run('JSON.stringify(DB)'),antes);
  assert.equal(corregirMedio(a,0,'debito'),true);
  const previo=JSON.parse(antes);
  assert.deepEqual(JSON.parse(a.run('JSON.stringify(DB.ventas[0].pagos[0])')),{...previo.ventas[0].pagos[0],tipo:'debito'});
  assert.deepEqual(JSON.parse(a.run('JSON.stringify(DB.movimientos[0])')),{...previo.movimientos[0],concepto:'Ingreso Tarjeta débito venta #1 · comisión $950'});
  assert.deepEqual(JSON.parse(a.run('JSON.stringify(DB.cajas)')),previo.cajas);
});
test('Los cobros históricos sin índice solo se corrigen cuando se identifica un movimiento único',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);
  a.run('delete DB.movimientos[0].pago_indice;delete DB.movimientos[0].venta_id;delete DB.ventas[0].pagos;');
  assert.equal(corregirMedio(a,0,'transferencia'),true);
  assert.equal(a.run('DB.movimientos[0].pago_indice'),0);
  const b=app();vender(b,[{tipo:'efectivo',monto:9500},{tipo:'efectivo',monto:9500}]);
  b.run('DB.movimientos.forEach(m=>delete m.pago_indice)');
  const antes=b.run('JSON.stringify(DB)');
  assert.equal(corregirMedio(b,0,'transferencia'),false);
  assert.equal(b.run('JSON.stringify(DB)'),antes);
});
test('La corrección rechaza una venta modificada desde que se abrió el formulario',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:19000}]);
  a.run("abrirCorreccionMedio(1);DB.ventas[0].observaciones='Cambio concurrente';");
  const antes=a.run('JSON.stringify(DB)');
  assert.equal(a.run("corregirMedioPagoVenta(1,0,'transferencia',correccionMedioSnapshot)"),false);
  assert.equal(a.run('JSON.stringify(DB)'),antes);
});
test('Un importe negativo en un pago mixto no crea una tarjeta mayor al total de venta',()=>{
  const a=app();vender(a,[{tipo:'efectivo',monto:-1000},{tipo:'credito',monto:20000}]);
  assert.equal(a.run('DB.ventas.length'),0);
  assert.equal(a.run('totalCaja("principal")'),75000);
  assert.equal(a.run('DB.productos[0].variantes[0].stock'),3);
});
