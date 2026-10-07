/* Cobros con tarjeta: la venta se confirma antes de recibir el dinero. */
function esPagoTarjeta(pago){
  return ["debito","credito"].includes(pagoTipoNormalizado(pago?.tipo||pago?.metodo));
}
function pagoIngresoPendiente(pago){
  return esPagoTarjeta(pago)&&pago.acreditacion==="pendiente";
}
function prepararPagosConAcreditacion(pagos){
  return pagos.map(p=>esPagoTarjeta(p)&&!p.acreditacion?{...p,acreditacion:"pendiente"}:{...p});
}
function ingresoPendienteVenta(venta){
  return !venta?.eliminada&&!ventaPendiente(venta)&&normalizarPagosVenta(venta).some(pagoIngresoPendiente);
}
function montoIngresoPendienteVenta(venta){
  if(venta?.eliminada||ventaPendiente(venta))return 0;
  return normalizarPagosVenta(venta).filter(pagoIngresoPendiente).reduce((a,p)=>a+p.monto,0);
}
function totalTarjetasPendientes(){
  return [...DB.ventas,...(DB.pagosClientes||[])].reduce((a,v)=>a+montoIngresoPendienteVenta(v),0);
}
function ingresoCajaPagoVenta(pago){
  if(pagoIngresoPendiente(pago))return null;
  const medio=PAGO_CAJA_MAP[pago.tipo];
  if(!medio)return null;
  if(esPagoTarjeta(pago)&&pago.acreditacion==="acreditada"){
    return {caja:pago.caja_acreditacion,medio:pago.medio_acreditacion,monto:Number(pago.monto_neto)||0};
  }
  // Los pagos históricos sin estado ya impactaron en caja: no migrarlos.
  return {caja:"principal",medio,monto:Number(pago.monto)||0};
}
function registrarIngresoPagoVenta(venta,pago,indice){
  const ingreso=ingresoCajaPagoVenta(pago);
  if(!ingreso)return;
  const acreditada=esPagoTarjeta(pago)&&pago.acreditacion==="acreditada";
  ajustarSaldoCaja(ingreso.caja,ingreso.medio,ingreso.monto);
  DB.movimientos.unshift({
    id:nextId(DB.movimientos),
    fecha:acreditada?shortFromISO(pago.fecha_acreditacion):venta.fecha,
    fechaISO:acreditada?pago.fecha_acreditacion:fechaISOFromVenta(venta),
    hora:acreditada?pago.hora_acreditacion:(venta.hora||hora()),
    tipo:venta.tipo==="pago_cliente"?"pago_cliente":"venta",
    concepto:venta.tipo==="pago_cliente"?`Cobro cta cte — ${venta.cliente}${acreditada?` · comisión ${fmt(pago.comision)}`:""}`:acreditada?`Ingreso ${pagoLabel(pago.tipo)} venta #${venta.id} · comisión ${fmt(pago.comision)}`:`Venta #${venta.id} — ${normalizarItemsVenta(venta)[0]?.nombre||"Venta"}`,
    caja:ingreso.caja,medio:ingreso.medio,monto:ingreso.monto,signo:1,
    ...(venta.tipo==="pago_cliente"?{pago_cliente_id:venta.id,cliente_id:venta.cliente_id}:{venta_id:venta.id}),pago_indice:indice,
    ...(acreditada?{bruto:pago.monto,comision:pago.comision,acreditacion_tarjeta:true}:{}),
  });
}
function estadoIngresoVentaHTML(venta){
  if(ingresoPendienteVenta(venta))return `<button class="btn btn-out btn-sm" onclick="abrirIngresoTarjeta(${venta.id},'${venta.tipo==="pago_cliente"?"cliente":"venta"}')" title="Registrar el dinero recibido" style="white-space:normal;font-size:10px;">Ingreso de dinero pendiente · ${fmt(montoIngresoPendienteVenta(venta))}</button>`;
  const acreditados=normalizarPagosVenta(venta).filter(p=>esPagoTarjeta(p)&&p.acreditacion==="acreditada");
  if(acreditados.length)return `<span class="bd bd-ok" style="font-size:10px;">Dinero ingresado</span><div style="font-size:10px;color:var(--gt);margin-top:4px;">Neto: ${fmt(acreditados.reduce((a,p)=>a+(Number(p.monto_neto)||0),0))} · Comisión: ${fmt(acreditados.reduce((a,p)=>a+(Number(p.comision)||0),0))}</div>`;
  return "";
}
function verVentasConIngresoPendiente(){
  currentMod="caja";
  renderLeftNav();
  showSub("caja-ingresos-pendientes");
}

let acreditacionVentaId=null;
let acreditacionPagoSnapshot=null;
let acreditacionOrigen="venta";
function registroAcreditacion(){return (acreditacionOrigen==="cliente"?(DB.pagosClientes||[]):DB.ventas).find(v=>v.id===acreditacionVentaId);}
function crearModalIngresoTarjeta(){
  if(document.getElementById("ov-ingreso-tarjeta"))return;
  document.body.insertAdjacentHTML("beforeend",`
    <div class="ov" id="ov-ingreso-tarjeta">
      <form class="modal" style="max-width:460px;" onsubmit="registrarAcreditacionTarjeta(event)">
        <div class="mh"><span class="mt">Registrar ingreso de tarjeta</span><button type="button" class="btn-ghost" onclick="closeOv('ov-ingreso-tarjeta')" aria-label="Cerrar"><i class="ti ti-x"></i></button></div>
        <div class="mc">
          <div id="ac-venta-info" style="font-size:12px;margin-bottom:12px;"></div>
          <div class="fg"><label for="ac-pago">Pago pendiente</label><select id="ac-pago" onchange="seleccionarPagoAcreditacion()"></select></div>
          <div style="background:var(--ng);color:var(--cr);border-radius:9px;padding:12px 14px;margin-bottom:12px;">Importe de tarjeta: <strong id="ac-bruto"></strong></div>
          <div class="fg2">
            <div class="fg"><label for="ac-comision">Comisión descontada ($)</label><input id="ac-comision" type="number" min="0" step="0.01" required oninput="recalcAcreditacion('comision')"/></div>
            <div class="fg"><label for="ac-neto">Neto recibido ($)</label><input id="ac-neto" type="number" min="0" step="0.01" required oninput="recalcAcreditacion('neto')"/></div>
          </div>
          <div class="fg2">
            <div class="fg"><label for="ac-caja">Caja de destino</label><select id="ac-caja"><option value="principal">Caja principal</option><option value="reinversion">Caja reinversión</option></select></div>
            <div class="fg"><label for="ac-medio">Destino del dinero</label><select id="ac-medio"><option value="mercadopago">Mercado Pago</option><option value="efectivo">Efectivo</option><option value="debito">Débito</option><option value="credito">Crédito</option></select></div>
          </div>
          <div class="fg"><label for="ac-fecha">Fecha de ingreso</label><input id="ac-fecha" type="date" required/></div>
          <div class="notif notif-az" style="font-size:12px;">Se sumará a caja únicamente el neto recibido. El cobro conserva el importe pagado por el cliente.</div>
          <div id="ac-error" class="notif" role="alert" style="display:none;color:var(--rj);font-size:12px;"></div>
        </div>
        <div class="mf"><button type="button" class="btn btn-out" onclick="closeOv('ov-ingreso-tarjeta')">Cancelar</button><button type="submit" class="btn btn-ng">Confirmar dinero ingresado</button></div>
      </form>
    </div>`);
}
function abrirIngresoTarjeta(ventaId,origen="venta"){
  acreditacionOrigen=origen;
  const venta=(origen==="cliente"?(DB.pagosClientes||[]):DB.ventas).find(v=>v.id===ventaId);
  if(!venta||!ingresoPendienteVenta(venta))return;
  crearModalIngresoTarjeta();
  acreditacionVentaId=ventaId;
  document.getElementById("ac-venta-info").textContent=`${origen==="cliente"?"Cobro de cuenta corriente":"Venta"} #${venta.id} · ${venta.cliente||"Consumidor final"}`;
  document.getElementById("ac-pago").innerHTML=venta.pagos.map((p,i)=>pagoIngresoPendiente(p)?`<option value="${i}">${escapeHTML(pagoLabel(p.tipo))} · ${fmt(p.monto)} (pago ${i+1})</option>`:"").join("");
  document.getElementById("ac-caja").value="principal";
  document.getElementById("ac-medio").value="mercadopago";
  document.getElementById("ac-fecha").value=toDateInput();
  seleccionarPagoAcreditacion();
  openOv("ov-ingreso-tarjeta");
}
function seleccionarPagoAcreditacion(){
  const venta=registroAcreditacion();
  const pago=venta?.pagos?.[Number(document.getElementById("ac-pago").value)];
  if(!pagoIngresoPendiente(pago))return;
  acreditacionPagoSnapshot=JSON.stringify(pago);
  document.getElementById("ac-bruto").textContent=fmt(pago.monto);
  document.getElementById("ac-comision").value="0";
  document.getElementById("ac-neto").value=pago.monto;
  document.getElementById("ac-comision").max=pago.monto;
  document.getElementById("ac-neto").max=pago.monto;
  document.getElementById("ac-error").style.display="none";
}
function recalcAcreditacion(campo){
  const venta=registroAcreditacion();
  const pago=venta?.pagos?.[Number(document.getElementById("ac-pago").value)];
  if(!pagoIngresoPendiente(pago))return;
  const value=document.getElementById(campo==="neto"?"ac-neto":"ac-comision").value;
  const otro=document.getElementById(campo==="neto"?"ac-comision":"ac-neto");
  otro.value=value!==""&&Number.isFinite(Number(value))?(Math.round((pago.monto-Number(value))*100)/100):"";
}
function registrarAcreditacionTarjeta(ev){
  if(ev)ev.preventDefault();
  if(!puedeModificarDB())return false;
  const error=document.getElementById("ac-error");
  const fail=msg=>{error.textContent=msg;error.style.display="block";return false;};
  const venta=registroAcreditacion();
  const indice=Number(document.getElementById("ac-pago").value);
  const pago=venta?.pagos?.[indice];
  if(!venta||venta.eliminada||ventaPendiente(venta)||!pagoIngresoPendiente(pago))return fail("Este pago ya no tiene un ingreso pendiente. Revisá la venta.");
  if(JSON.stringify(pago)!==acreditacionPagoSnapshot)return fail("El pago cambió mientras estaba abierto. Volvé a abrir el ingreso desde la venta.");
  const comisionText=document.getElementById("ac-comision").value;
  const netoText=document.getElementById("ac-neto").value;
  const comision=Number(comisionText),neto=Number(netoText);
  if(!comisionText||!netoText||!importeValido(comision,true)||!importeValido(neto,true)||comision>pago.monto||neto>pago.monto||Math.abs(comision+neto-pago.monto)>0.005)return fail("La comisión y el neto deben sumar el importe de tarjeta, sin valores negativos y con hasta dos decimales.");
  const caja=document.getElementById("ac-caja").value;
  const medio=document.getElementById("ac-medio").value;
  const fecha=document.getElementById("ac-fecha").value;
  if(!DB.cajas[caja]||!["efectivo","mercadopago","debito","credito"].includes(medio)||!/^\d{4}-\d{2}-\d{2}$/.test(fecha))return fail("Seleccioná la caja, el destino del dinero y una fecha de ingreso válida.");
  Object.assign(pago,{acreditacion:"acreditada",comision:Math.round(comision*100)/100,monto_neto:Math.round(neto*100)/100,caja_acreditacion:caja,medio_acreditacion:medio,fecha_acreditacion:fecha,hora_acreditacion:hora(),acreditado_en:new Date().toISOString()});
  registrarIngresoPagoVenta(venta,pago,indice);
  venta.historial_cambios=[...(venta.historial_cambios||[]),{fecha:pago.acreditado_en,accion:"ingreso_tarjeta",pago_indice:indice,bruto:pago.monto,comision:pago.comision,neto:pago.monto_neto,caja,medio,fecha_ingreso:fecha}];
  persistDBSoon();
  closeOv("ov-ingreso-tarjeta");
  renderSidebar();
  if(currentMod==="dashboard")actualizarDashboard();
  else if(currentMod==="ventas"&&currentSub.ventas==="historial-ventas")renderHistorialVentas();
  else if(currentMod==="caja")renderPage(currentSub.caja);
  else if(currentMod==="clientes")renderPage(currentSub.clientes);
  return true;
}
