/* Cobros de cuenta corriente con trazabilidad y acreditación de tarjetas. */
let editingPagoClienteId=null;
let pagoClienteSnapshot=null;
function registrarPagoCliente(){
  if(!puedeModificarDB())return false;
  const c=DB.clientes.find(c=>c.id===Number(document.getElementById("pago-cli").value));
  const monto=Number(document.getElementById("pago-cli-monto").value);
  const tipo=pagoTipoNormalizado(document.getElementById("pago-cli-metodo").value);
  if(!c||!importeValido(monto)||!["efectivo","transferencia","debito","credito"].includes(tipo)){alert("Seleccioná un cliente, un método de pago y un importe válido mayor a cero.");return false;}
  DB.pagosClientes??=[];
  const anterior=DB.pagosClientes.find(p=>p.id===editingPagoClienteId);
  if(editingPagoClienteId&&(!anterior||JSON.stringify(anterior)!==pagoClienteSnapshot)){alert("El cobro cambió mientras estaba abierto. Volvé a abrirlo.");return false;}
  if(anterior?.pagos.some(p=>p.acreditacion==="acreditada")){alert("Este cobro ya tiene dinero ingresado. Conservá su acreditación; para corregirlo, anulá primero el cobro.");return false;}
  if(!anterior&&!(c.deuda>0)){alert("Este cliente ya no tiene deuda pendiente.");return false;}
  const movimientos=anterior?DB.movimientos.filter(m=>m.pago_cliente_id===anterior.id):[];
  if(!validarReversionCaja(movimientos))return false;
  if(anterior){
    ajustarClientePorPagoMovimiento(anterior,-1);movimientos.forEach(m=>ajustarCajaPorMovimiento(m,-1));
    DB.movimientos=DB.movimientos.filter(m=>!movimientos.includes(m));
  }
  const registro={id:anterior?.id||nextId(DB.pagosClientes),tipo:"pago_cliente",es_registro_pago:true,cliente_id:c.id,cliente:c.nombre,concepto:`Cobro cta cte — ${c.nombre}`,total:monto,monto,fecha:anterior?.fecha||todayShort(),fechaISO:anterior?.fechaISO||toDateInput(),hora:anterior?.hora||hora(),estado:"pagada",pagos:prepararPagosConAcreditacion([{tipo,monto}]),observaciones:cleanPlainText(document.getElementById("pago-cli-obs")?.value||""),...(anterior?{editado_en:new Date().toISOString()}:{})};
  if(anterior)DB.pagosClientes[DB.pagosClientes.indexOf(anterior)]=registro;
  else DB.pagosClientes.unshift(registro);
  ajustarClientePorPagoMovimiento(registro,1);
  registrarIngresoPagoVenta(registro,registro.pagos[0],0);
  persistDBSoon();editingPagoClienteId=null;pagoClienteSnapshot=null;closeOv("ov-pago-cliente");renderSidebar();
  if(currentMod==="clientes")renderPage(currentSub.clientes);
  else if(currentMod==="dashboard")actualizarDashboard();
  else if(currentMod==="caja")renderPage(currentSub.caja);
  return true;
}
function editarPagoCliente(id){
  const p=(DB.pagosClientes||[]).find(p=>p.id===id&&!p.eliminada);if(!p)return;
  if(p.pagos.some(p=>p.acreditacion==="acreditada")){alert("Este cobro ya ingresó en caja. Para corregirlo, anulalo y registrá el cobro correcto.");return false;}
  abrirPagoCli(p.cliente_id);
  // Incluir al cliente aunque este cobro haya cancelado toda su deuda.
  const select=document.getElementById("pago-cli");
  if(![...select.options].some(o=>o.value===String(p.cliente_id)))select.add(new Option(p.cliente,String(p.cliente_id)));
  select.value=p.cliente_id;
  if(typeof hacerSelectBuscable==="function")hacerSelectBuscable("pago-cli","Buscar cliente o teléfono...");
  editingPagoClienteId=id;pagoClienteSnapshot=JSON.stringify(p);
  document.getElementById("pago-cli-monto").value=p.monto;
  document.getElementById("pago-cli-metodo").value=pagoLabel(p.pagos[0].tipo)==="Tarjeta débito"?"Débito":pagoLabel(p.pagos[0].tipo)==="Tarjeta crédito"?"Crédito":pagoLabel(p.pagos[0].tipo);
  document.getElementById("pago-cli-obs").value=p.observaciones||"";
  recalcPagoCli();
}
function anularPagoCliente(id){
  if(!puedeModificarDB())return false;
  const p=(DB.pagosClientes||[]).find(p=>p.id===id&&!p.eliminada);if(!p)return false;
  const movs=DB.movimientos.filter(m=>m.pago_cliente_id===id);
  if(!validarReversionCaja(movs))return false;
  if(!confirm("¿Anular este cobro y revertir deuda, saldo a favor y dinero ingresado?"))return false;
  ajustarClientePorPagoMovimiento(p,-1);movs.forEach(m=>ajustarCajaPorMovimiento(m,-1));
  for(const m of movs)DB.movimientos.unshift({id:nextId(DB.movimientos),tipo:"reversion_pago_cliente",fecha:todayShort(),fechaISO:toDateInput(),hora:hora(),concepto:`Anulación cobro de ${p.cliente}`,caja:m.caja,medio:m.medio,monto:m.monto,signo:-1,pago_cliente_id:p.id,cliente_id:p.cliente_id});
  p.eliminada=true;p.anulada_en=new Date().toISOString();
  persistDBSoon();renderSidebar();if(currentMod==="clientes")renderPagosClientes();else renderPage(currentSub[currentMod]);return true;
}
function renderPagosClientes(){
  const pagos=(DB.pagosClientes||[]).filter(p=>!p.eliminada);
  document.getElementById("main-area").innerHTML=`<div class="page-content"><div class="ph"><div><div class="pt">Cobros de clientes</div><div class="ps">Pagos de cuenta corriente y dinero pendiente de ingreso</div></div><button class="btn btn-ng" onclick="abrirPagoCli()">Registrar pago</button></div><div class="scroll"><div class="tw"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Importe</th><th>Aplicado a deuda</th><th>Saldo a favor</th><th>Ingreso del dinero</th><th>Acciones</th></tr></thead><tbody>${pagos.map(p=>`<tr data-date="${p.fechaISO||""}"><td>${p.fecha}</td><td>${escapeHTML(p.cliente)}</td><td>${fmt(p.monto)}</td><td>${fmt(p.aplicado_deuda)}</td><td>${fmt(p.excedente_favor)}</td><td style="white-space:normal;">${estadoIngresoVentaHTML(p)||"Ingresado"}</td><td><div class="row-actions"><button class="btn-icon" onclick="editarPagoCliente(${p.id})" title="Editar cobro"><i class="ti ti-pencil"></i></button><button class="btn-icon" onclick="anularPagoCliente(${p.id})" title="Anular cobro"><i class="ti ti-trash"></i></button></div></td></tr>`).join("")}</tbody></table></div></div></div>`;
}
function renderIngresosTarjetaPendientes(){
  const ventas=DB.ventas.filter(ingresoPendienteVenta),cobros=(DB.pagosClientes||[]).filter(ingresoPendienteVenta);
  document.getElementById("main-area").innerHTML=`<div class="page-content"><div class="ph"><div><div class="pt">Ingresos pendientes de tarjetas</div><div class="ps">${ventas.length+cobros.length} operaciones · ${fmt(totalTarjetasPendientes())} por ingresar</div></div></div><div class="scroll"><div class="tw"><table><thead><tr><th>Origen</th><th>Fecha</th><th>Cliente</th><th>Importe pendiente</th><th>Acción</th></tr></thead><tbody>${[...ventas,...cobros].map(p=>`<tr data-date="${p.fechaISO||""}"><td>${p.tipo==="pago_cliente"?"Cobro de cuenta corriente":"Venta"} #${p.id}</td><td>${p.fecha}</td><td>${escapeHTML(p.cliente)}</td><td>${fmt(montoIngresoPendienteVenta(p))}</td><td style="white-space:normal;">${estadoIngresoVentaHTML(p)}</td></tr>`).join("")}</tbody></table></div></div></div>`;
}
