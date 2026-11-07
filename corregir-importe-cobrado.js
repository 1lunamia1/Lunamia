let correccionImporte=null;

function saldoPendienteVenta(venta){
  if(venta.eliminada||ventaPendiente(venta))return 0;
  const saldo=Number(venta.saldo_por_cobrar);
  return importeValido(saldo)?saldo:0;
}

function importePagoCorregible(pago){
  return Boolean(pago&&Object.hasOwn(PAGO_CAJA_MAP,pago.tipo)&&importeValido(pago.monto,true));
}

function botonCorreccionImporte(accion){
  return `<button class="btn-icon" onclick="${accion}" title="Corregir importe cobrado" aria-label="Corregir importe cobrado"><i class="ti ti-currency-dollar" aria-hidden="true"></i></button>`;
}

function accionesCobroVenta(venta){
  if(venta.eliminada||ventaPendiente(venta))return "";
  const pagos=normalizarPagosVenta(venta);
  const medio=pagos.some(p=>mediosParaCorregirPago(p).length)?botonCorreccionMedio(`abrirCorreccionMedio(${venta.id})`):"";
  const importe=pagos.some(importePagoCorregible)?botonCorreccionImporte(`abrirCorreccionImporte(${venta.id})`):"";
  return medio+importe;
}

function mostrarSaldoPendienteVenta(venta){
  const saldo=saldoPendienteVenta(venta);
  if(!saldo)return "";
  return `<button class="btn btn-out btn-sm" onclick="abrirCorreccionImporte(${venta.id},null,true)">Cobrar saldo ${fmt(saldo)}</button>`;
}

function guardarCorreccionImporte(ventaId,snapshot,importes,cobro){
  if(!puedeModificarDB())return false;
  const venta=DB.ventas.find(v=>v.id===ventaId&&!v.eliminada&&!ventaPendiente(v));
  const fallar=mensaje=>{alert(mensaje);return false;};
  if(!venta||JSON.stringify(venta)!==snapshot)return fallar("La venta cambió. Volvé a abrir el cobro.");

  const pagos=normalizarPagosVenta(venta);
  const originales=venta.pagos?.length?venta.pagos:pagos;
  const siguientes=[...originales];
  const cambios=[];
  const saldoAnterior=saldoPendienteVenta(venta);
  if(cobro){
    if(importes.length||!importeValido(cobro.monto)||cobro.monto>saldoAnterior||!Object.hasOwn(PAGO_CAJA_MAP,cobro.tipo)){
      return fallar("Elegí un medio válido y un importe mayor a cero que no supere el saldo por cobrar.");
    }
    const [nuevo]=prepararPagosConAcreditacion([{...cobro,fecha_cobro:toDateInput(),hora_cobro:hora()}]);
    siguientes.push(nuevo);
    cambios.push({indice:originales.length,nuevo,movimiento:null,ingreso:ingresoCajaPagoVenta(nuevo)});
  }else{
    const indices=new Set();
    for(const {indice,monto,neto} of importes){
      const anterior=pagos[indice];
      if(!Number.isInteger(indice)||indices.has(indice)||!importePagoCorregible(anterior)||!importeValido(monto,true)){
        return fallar("Revisá los importes de los pagos seleccionados.");
      }
      indices.add(indice);
      const acreditado=anterior.acreditacion==="acreditada";
      if(acreditado&&(!importeValido(monto)||!importeValido(neto,true)||neto>monto)){
        return fallar("En una tarjeta acreditada, indicá el importe bruto y el neto recibido. El neto debe ser menor o igual al bruto.");
      }
      if(anterior.monto===monto&&(!acreditado||Number(anterior.monto_neto)===neto))continue;
      const movimiento=movimientoParaCorregirPago(venta,pagos,indice);
      if(movimiento===false||movimiento&&!Object.hasOwn(DB.cajas,movimiento.caja)){
        return fallar("No se pudo identificar con certeza el movimiento original de uno de los pagos.");
      }
      const nuevo={...originales[indice],tipo:anterior.tipo,monto};
      if(acreditado)Object.assign(nuevo,{monto_neto:neto,comision:redondearImporte(monto-neto)});
      else if(movimiento&&movimiento.caja!=="principal")nuevo.caja_cobro=movimiento.caja;
      siguientes[indice]=nuevo;
      const ingreso=ingresoCajaPagoVenta(nuevo);
      if(ingreso&&movimiento)ingreso.caja=movimiento.caja;
      cambios.push({indice,nuevo,movimiento,ingreso});
    }
  }
  if(!cambios.length)return fallar("Cambiá al menos un importe para guardar la corrección.");

  const pagosNuevos=normalizarPagosVenta({...venta,pagos:siguientes});
  const total=redondearImporte(pagosNuevos.reduce((suma,p)=>suma+p.monto,0));
  if(total>venta.total)return fallar("El total de los pagos supera el importe de la venta. Revisá el reparto entre medios.");
  const cobrado=redondearImporte(pagosNuevos.filter(p=>Object.hasOwn(PAGO_CAJA_MAP,p.tipo)).reduce((suma,p)=>suma+p.monto,0));
  if(cobrado<reintegrosComprometidos(venta.id))return fallar("El importe cobrado quedaría por debajo de los reintegros registrados o pendientes.");

  const movimientos=cambios.map(c=>c.movimiento).filter(Boolean);
  const reemplazos=cambios.map(c=>c.ingreso).filter(Boolean);
  if(!validarReversionCaja(movimientos,reemplazos))return false;

  const detalle=cambios.map(({indice,nuevo,movimiento,ingreso})=>{
    const movimientoAntes=movimiento?cloneData(movimiento):null;
    let movimientoDespues=null;
    if(movimiento&&ingreso){
      ajustarSaldoCaja(movimiento.caja,movimiento.medio,redondearImporte(ingreso.monto-movimiento.monto));
      Object.assign(movimiento,{monto:ingreso.monto,venta_id:venta.id,pago_indice:indice});
      if(nuevo.acreditacion==="acreditada"){
        Object.assign(movimiento,{bruto:nuevo.monto,comision:nuevo.comision,concepto:`Ingreso ${pagoLabel(nuevo.tipo)} venta #${venta.id} · comisión ${fmt(nuevo.comision)}`});
      }
      movimientoDespues=movimiento;
    }else if(movimiento){
      ajustarCajaPorMovimiento(movimiento,-1);
      DB.movimientos=DB.movimientos.filter(m=>m!==movimiento);
    }else if(ingreso){
      movimientoDespues=registrarIngresoPagoVenta(venta,nuevo,indice);
    }
    return {pago_indice:indice,antes:originales[indice]?cloneData(originales[indice]):null,despues:cloneData(nuevo),
      movimiento_antes:movimientoAntes,movimiento_despues:movimientoDespues?cloneData(movimientoDespues):null};
  });
  venta.pagos=siguientes;
  venta.saldo_por_cobrar=redondearImporte(venta.total-total);
  actualizarMetodoPagosVenta(venta);
  venta.historial_cambios=[...(venta.historial_cambios||[]),{fecha:new Date().toISOString(),
    accion:cobro?"cobro_saldo_venta":"correccion_importe_cobrado",saldo_antes:saldoAnterior,
    saldo_despues:venta.saldo_por_cobrar,pagos:detalle}];
  persistDBSoon();
  return true;
}

function abrirCorreccionImporte(ventaId,indice=null,cobrar=false){
  const venta=DB.ventas.find(v=>v.id===ventaId&&!v.eliminada&&!ventaPendiente(v));
  if(!venta)return;
  const pagos=normalizarPagosVenta(venta);
  const saldo=saldoPendienteVenta(venta);
  if(cobrar?!saldo:!pagos.some(importePagoCorregible))return;
  const movimientos=cobrar?[]:pagos.map((p,i)=>importePagoCorregible(p)?movimientoParaCorregirPago(venta,pagos,i):null);
  correccionImporte={ventaId,snapshot:JSON.stringify(venta),pagos,movimientos,total:venta.total,cobrar};
  document.getElementById("ci-titulo").textContent=cobrar?"Cobrar saldo de la venta":"Corregir importe cobrado";
  document.getElementById("ci-venta").textContent=`Venta #${venta.id} · ${venta.cliente||"Consumidor final"} · Total ${fmt(venta.total)}`;
  document.getElementById("ci-cobro").hidden=!cobrar;
  const lista=document.getElementById("ci-pagos");
  lista.hidden=cobrar;
  lista.innerHTML=cobrar?"":pagos.map((p,i)=>{
    const medio=escapeHTML(pagoLabel(p.tipo));
    if(!importePagoCorregible(p))return `<div class="info-row"><span>${medio}</span><strong>${fmt(p.monto)}</strong></div>`;
    const neto=p.acreditacion==="acreditada"?`<div class="fg"><label for="ci-neto-${i}">Neto acreditado</label><input id="ci-neto-${i}" type="number" min="0" step="0.01" required value="${Number(p.monto_neto)||0}" oninput="actualizarSaldoCorreccion()"></div>`:"";
    return `<div class="fg2"><div class="fg"><label for="ci-monto-${i}">Pago ${i+1} · ${medio}${neto?" · Bruto":""}</label><input id="ci-monto-${i}" type="number" min="0" step="0.01" required value="${p.monto}" oninput="actualizarSaldoCorreccion()"></div>${neto}</div>`;
  }).join("");
  const monto=document.getElementById("ci-cobro-monto");
  monto.disabled=!cobrar;
  monto.max=saldo;
  monto.value=cobrar?saldo:"";
  document.getElementById("ci-cobro-medio").disabled=!cobrar;
  document.getElementById("ci-cobro-medio").value="efectivo";
  actualizarSaldoCorreccion();
  openOv("ov-corregir-importe");
  if(indice!==null)requestAnimationFrame(()=>document.getElementById(`ci-monto-${indice}`)?.focus());
}

function leerImportesCorreccion(){
  return correccionImporte.pagos.flatMap((p,indice)=>{
    if(!importePagoCorregible(p))return [];
    const bruto=document.getElementById(`ci-monto-${indice}`).value;
    const neto=document.getElementById(`ci-neto-${indice}`)?.value;
    return [{indice,monto:bruto===""?NaN:Number(bruto),neto:neto===""?NaN:Number(neto)}];
  });
}

function actualizarSaldoCorreccion(){
  const {pagos,movimientos,total,cobrar}=correccionImporte;
  const importes=cobrar?[]:leerImportesCorreccion();
  const montoCobro=Number(document.getElementById("ci-cobro-monto").value);
  const actual=pagos.reduce((suma,p)=>suma+p.monto,0);
  const nuevo=cobrar?actual+montoCobro:
    pagos.filter(p=>!importePagoCorregible(p)).reduce((suma,p)=>suma+p.monto,0)+importes.reduce((suma,p)=>suma+p.monto,0);
  const saldo=redondearImporte(total-nuevo);
  document.getElementById("ci-saldo").textContent=!Number.isFinite(saldo)?"Completá los importes.":
    saldo<0?`Los pagos superan la venta por ${fmt(-saldo)}.`:`Saldo por cobrar después de guardar: ${fmt(saldo)}.`;
  const efectos=new Map();
  if(cobrar){
    const tipo=document.getElementById("ci-cobro-medio").value;
    if(!esPagoTarjeta({tipo}))efectos.set(`Principal · ${medioLabel(PAGO_CAJA_MAP[tipo])}`,montoCobro);
  }else{
    for(const {indice,monto,neto} of importes){
      const p=pagos[indice];
      const movimiento=movimientos[indice];
      const ingreso=ingresoCajaPagoVenta({...p,monto,monto_neto:neto});
      if(movimiento===false||!movimiento&&!ingreso)continue;
      const etiqueta=`${cajaLabel(movimiento?.caja||ingreso.caja)} · ${medioLabel(movimiento?.medio||ingreso.medio)}`;
      efectos.set(etiqueta,(efectos.get(etiqueta)||0)+(ingreso?.monto||0)-(movimiento?.monto||0));
    }
  }
  const resumen=[...efectos].filter(([,delta])=>redondearImporte(delta)).map(([etiqueta,delta])=>`${etiqueta} ${delta>0?"+":"−"}${fmt(Math.abs(delta))}`);
  document.getElementById("ci-caja").textContent=Number.isFinite(saldo)?`Caja · ${resumen.join(" | ")||"Sin variación inmediata"}.`:"";
}

function confirmarCorreccionImporte(event){
  event.preventDefault();
  const {ventaId,snapshot,cobrar}=correccionImporte;
  const importes=cobrar?[]:leerImportesCorreccion();
  const cobro=cobrar?{monto:Number(document.getElementById("ci-cobro-monto").value),tipo:document.getElementById("ci-cobro-medio").value}:null;
  if(!guardarCorreccionImporte(ventaId,snapshot,importes,cobro))return;
  closeOv("ov-corregir-importe");
  refrescarVistaCobro();
}
