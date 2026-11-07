/* Corrección de un pago de venta sin recalcular la operación comercial. */
let correccionMedioVentaId=null;
let correccionMedioSnapshot=null;

function botonCorreccionMedio(accion){
  return `<button class="btn-icon" onclick="${accion}" title="Corregir medio de pago" aria-label="Corregir medio de pago"><i class="ti ti-arrows-exchange" style="font-size:12px;"></i></button>`;
}

function mediosParaCorregirPago(pago){
  if(!pago||!importeValido(pago.monto)||!Object.hasOwn(PAGO_CAJA_MAP,pago.tipo))return [];
  const medios=pago.acreditacion==="acreditada"?["debito","credito"]:Object.keys(PAGO_CAJA_MAP);
  return medios.filter(tipo=>tipo!==pago.tipo);
}

function actualizarMetodoPagosVenta(venta){
  const tipos=[...new Set(venta.pagos.filter(p=>Number(p.monto)>0).map(p=>pagoTipoNormalizado(p.tipo||p.metodo)))];
  venta.metodo=tipos.map(pagoLabel).join(" + ")||"Sin cobros registrados";
  venta.metodo_pago=tipos.length>1?"mixto":tipos[0]||"sin_cobros";
}

function refrescarVistaCobro(){
  const ficha=Number(document.getElementById("ficha-cliente")?.dataset?.clienteId);
  if(ficha)verFichaCli(ficha);
  else renderPage(currentSub[currentMod]);
}

function movimientoParaCorregirPago(venta,pagos,indice){
  const movimientos=movimientosDeVenta(venta).filter(m=>m.tipo==="venta"&&m.signo===1);
  const pago=pagos[indice];
  const coincide=(m,p)=>{
    const ingreso=ingresoCajaPagoVenta(p);
    const acreditada=p.acreditacion==="acreditada";
    return ingreso&&m.monto===ingreso.monto&&cajaMedio(m.medio)===ingreso.medio&&
      Boolean(m.acreditacion_tarjeta)===acreditada&&(!acreditada||m.caja===ingreso.caja);
  };
  const vinculados=movimientos.filter(m=>m.pago_indice!=null&&Number(m.pago_indice)===indice);
  if(vinculados.length)return vinculados.length===1&&coincide(vinculados[0],pago)?vinculados[0]:false;
  if(!ingresoCajaPagoVenta(pago))return movimientos.some(m=>m.pago_indice==null)?false:null;

  // Los movimientos antiguos pueden carecer del índice. Solo se corrigen si la relación es inequívoca.
  const historicos=movimientos.filter(m=>m.pago_indice==null&&coincide(m,pago));
  if(historicos.length!==1)return false;
  const indicesVinculados=new Set(movimientos.filter(m=>m.pago_indice!=null).map(m=>Number(m.pago_indice)));
  const ambiguo=pagos.some((otro,i)=>i!==indice&&!indicesVinculados.has(i)&&coincide(historicos[0],otro));
  return ambiguo?false:historicos[0];
}

function corregirMedioPagoVenta(ventaId,indice,tipo,snapshot){
  if(!puedeModificarDB())return false;
  const venta=DB.ventas.find(v=>v.id===ventaId&&!v.eliminada&&!ventaPendiente(v));
  if(!venta||JSON.stringify(venta)!==snapshot){alert("La venta cambió. Volvé a abrir la corrección del pago.");return false;}
  const pagos=normalizarPagosVenta(venta);
  const anterior=pagos[indice];
  if(!mediosParaCorregirPago(anterior).includes(tipo)){alert("Elegí un medio válido para este pago.");return false;}
  const movimiento=movimientoParaCorregirPago(venta,pagos,indice);
  if(movimiento===false){alert("El movimiento original no se pudo identificar con certeza. Revisá la venta y sus movimientos antes de corregirla.");return false;}

  const pagoOriginal=venta.pagos?.[indice]||anterior;
  const nuevo={...pagoOriginal,tipo,monto:anterior.monto};
  if(!esPagoTarjeta(nuevo))delete nuevo.acreditacion;
  else if(!esPagoTarjeta(anterior))nuevo.acreditacion="pendiente";
  const ingreso=ingresoCajaPagoVenta(nuevo);
  const movimientoAntes=movimiento?cloneData(movimiento):null;
  let movimientoDespues=null;
  if(movimiento){
    if(!Object.hasOwn(DB.cajas,movimiento.caja)||!Object.hasOwn(DB.cajas[movimiento.caja],cajaMedio(movimiento.medio))){
      alert("El movimiento original tiene una caja o un medio inválido.");return false;
    }
    // El importe ingresado se conserva si ambos medios ingresan a Caja. Solo importa el efecto final por medio.
    const cambiaSaldo=!ingreso||cajaMedio(movimiento.medio)!==ingreso.medio;
    if(cambiaSaldo&&!validarReversionCaja([movimiento]))return false;
    if(cambiaSaldo)ajustarCajaPorMovimiento(movimiento,-1);
    if(ingreso){
      movimiento.medio=ingreso.medio;
      movimiento.venta_id=venta.id;
      movimiento.pago_indice=indice;
      if(nuevo.acreditacion==="acreditada")movimiento.concepto=`Ingreso ${pagoLabel(tipo)} venta #${venta.id} · comisión ${fmt(nuevo.comision)}`;
      if(cambiaSaldo)ajustarCajaPorMovimiento(movimiento,1);
      movimientoDespues=movimiento;
    }else{
      DB.movimientos=DB.movimientos.filter(m=>m!==movimiento);
    }
  }else if(ingreso){
    movimientoDespues=registrarIngresoPagoVenta(venta,nuevo,indice);
  }

  venta.pagos=venta.pagos?.length?venta.pagos.map((p,i)=>i===indice?nuevo:p):[nuevo];
  actualizarMetodoPagosVenta(venta);
  venta.historial_cambios=[...(venta.historial_cambios||[]),{
    fecha:new Date().toISOString(),accion:"correccion_medio_pago",pago_indice:indice,
    antes:cloneData(pagoOriginal),despues:cloneData(nuevo),movimiento_antes:movimientoAntes,
    movimiento_despues:movimientoDespues?cloneData(movimientoDespues):null,
  }];
  persistDBSoon();
  return true;
}

function abrirCorreccionMedio(ventaId,indice=null){
  const venta=DB.ventas.find(v=>v.id===ventaId&&!v.eliminada&&!ventaPendiente(v));
  if(!venta)return;
  const pagos=normalizarPagosVenta(venta);
  const selector=document.getElementById("cm-pago");
  const opciones=pagos.flatMap((p,i)=>mediosParaCorregirPago(p).length?[i]:[]);
  if(!opciones.length){alert("Esta venta no tiene pagos que se puedan corregir desde este formulario.");return;}
  correccionMedioVentaId=ventaId;
  correccionMedioSnapshot=JSON.stringify(venta);
  document.getElementById("cm-venta").textContent=`Venta #${ventaId} · ${venta.cliente||"Consumidor final"} · Total ${fmt(venta.total)}`;
  selector.innerHTML=opciones.map(i=>{
    const p=pagos[i];
    const estado=p.acreditacion==="acreditada"?" · acreditado":pagoIngresoPendiente(p)?" · por acreditar":"";
    return `<option value="${i}">Pago ${i+1} · ${escapeHTML(pagoLabel(p.tipo))} · ${fmt(p.monto)}${estado}</option>`;
  }).join("");
  selector.value=opciones.includes(indice)?indice:opciones[0];
  seleccionarPagoParaCorregir();
  openOv("ov-corregir-medio");
}

function abrirCorreccionMedioDesdeCaja(id,corregirImporte=false){
  const m=DB.movimientos.find(m=>m.id===id&&m.tipo==="venta"&&m.signo===1);
  if(!m)return;
  const ventaId=ventaIdDeMovimiento(m);
  const venta=DB.ventas.find(v=>v.id===ventaId&&!v.eliminada&&!ventaPendiente(v));
  if(!venta){alert("No se encontró la venta de este movimiento.");return;}
  const pagos=normalizarPagosVenta(venta);
  const indice=pagos.findIndex((p,i)=>mediosParaCorregirPago(p).length&&movimientoParaCorregirPago(venta,pagos,i)===m);
  if(indice<0){alert("No se pudo identificar el pago exacto de este movimiento.");return;}
  if(corregirImporte)abrirCorreccionImporte(ventaId,indice);
  else abrirCorreccionMedio(ventaId,indice);
}

function seleccionarPagoParaCorregir(){
  const venta=DB.ventas.find(v=>v.id===correccionMedioVentaId);
  const pago=normalizarPagosVenta(venta)[Number(document.getElementById("cm-pago").value)];
  document.getElementById("cm-medio").innerHTML='<option value="">Elegí el medio correcto</option>'+mediosParaCorregirPago(pago).map(tipo=>`<option value="${tipo}">${escapeHTML(pagoLabel(tipo))}</option>`).join("");
  let info="Se conserva el importe de este pago. Si lo corregís a tarjeta, el ingreso quedará pendiente de acreditación.";
  if(pagoIngresoPendiente(pago))info=`Si elegís efectivo, transferencia o Mercado Pago, el ingreso usará la fecha ${pago.fecha_cobro?"del cobro":"de la venta"}.`;
  else if(pago?.acreditacion==="acreditada")info="Podés corregir el tipo de tarjeta. Se conservan el neto, la comisión, el destino y la fecha de acreditación.";
  else if(esPagoTarjeta(pago))info="Este pago histórico ya figura ingresado. La corrección conserva el importe ingresado.";
  document.getElementById("cm-info").textContent=info;
}

function confirmarCorreccionMedio(event){
  event.preventDefault();
  const indice=Number(document.getElementById("cm-pago").value);
  const tipo=document.getElementById("cm-medio").value;
  if(!corregirMedioPagoVenta(correccionMedioVentaId,indice,tipo,correccionMedioSnapshot))return;
  closeOv("ov-corregir-medio");
  refrescarVistaCobro();
}
