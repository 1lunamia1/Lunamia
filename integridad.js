/* Validaciones compartidas de cantidades, importes y relaciones históricas. */
function importeValido(n,permiteCero=false){
  return Number.isFinite(n)&&(permiteCero?n>=0:n>0)&&Math.abs(n*100-Math.round(n*100))<0.000001;
}
function cantidadValida(n,permiteCero=false){return Number.isSafeInteger(n)&&(permiteCero?n>=0:n>0);}
function redondearImporte(n){return Math.round((Number(n)+Number.EPSILON)*100)/100;}
function estadoClienteActual(c){
  if(!(Number(c.deuda)>0))return "ok";
  const iso=displayToDateInput(c.vence);if(!iso)return "vencida";
  const ahora=new Date();ahora.setHours(0,0,0,0);
  const dias=(new Date(`${iso}T00:00:00`)-ahora)/86400000;
  return dias<0?"vencida":dias<=7?"proximo":"vigente";
}
function validarItemsParaVenta(items,stockExtra={}){
  if(!items.length){alert("Agregá al menos un producto a la venta.");return false;}
  const pedido=Object.create(null);
  for(const it of items){
    const p=DB.productos.find(p=>p.id===it.pid);
    const v=p?.variantes.find(v=>v.cod===it.cod);
    if(!v||!cantidadValida(Number(it.cantidad??it.qty))||!importeValido(Number(it.precio_unitario??it.precio),true)||!Number.isFinite(Number(it.descuentoItemPct??0))||Number(it.descuentoItemPct??0)<0||Number(it.descuentoItemPct??0)>100){
      alert("Revisá los productos, cantidades enteras y precios de la venta.");return false;
    }
    pedido[it.cod]=(pedido[it.cod]||0)+Number(it.cantidad??it.qty);
  }
  for(const [cod,n] of Object.entries(pedido)){
    const v=DB.productos.flatMap(p=>p.variantes).find(v=>v.cod===cod);
    const disponible=Number(v.stock)+(stockExtra[cod]||0);
    if(n>disponible){alert(`Stock insuficiente para ${cod}. Disponible: ${disponible}. Actualizá el carrito antes de cobrar.`);return false;}
  }
  return true;
}
function productoTieneReferencias(id,cod=null){
  return DB.ventas.some(v=>normalizarItemsVenta(v).some(it=>it.pid===id&&(!cod||it.cod===cod)))||
    DB.devoluciones.some(d=>d.producto_id===id||DB.productos.find(p=>p.id===id)?.variantes.some(v=>v.cod===d.producto&&(!cod||v.cod===cod)))||
    DB.proveedores.some(p=>(p.compras||[]).some(c=>(c.items||[]).some(it=>it.producto_id===id||DB.productos.find(p=>p.id===id)?.variantes.some(v=>v.cod===it.cod&&(!cod||v.cod===cod)))));
}
function ventaTieneDevoluciones(venta){return DB.devoluciones.some(d=>d.venta_id===venta.id&&!d.anulada);}
function movimientoEditable(mov){
  if(["venta","ajuste_venta"].includes(mov?.tipo)||mov?.venta_id||mov?.compra_id||mov?.pago_cliente_id)return false;
  if(mov?.tipo==="gasto"&&/^Compra a /.test(mov.concepto||""))return false;
  return true;
}
function movimientosReversionVenta(venta){
  const existentes=movimientosDeVenta(venta);
  if(existentes.length)return existentes;
  return normalizarPagosVenta(venta).map(p=>ingresoCajaPagoVenta(p)).filter(Boolean).map(i=>({...i,signo:1,tipo:"venta"}));
}
function validarReversionCaja(movimientos){
  const cambios={};
  const sumar=(caja,medio,monto)=>{if(caja&&["efectivo","mercadopago","debito","credito"].includes(cajaMedio(medio))){const k=`${caja}|${cajaMedio(medio)}`;cambios[k]=(cambios[k]||0)+monto;}};
  for(const m of movimientos){
    if(m.tipo==="transferencia"){
      const tr=transferenciaDeMovimiento(m);
      sumar(m.origen||tr?.origen||m.caja,m.medio,Number(m.monto));
      sumar(m.destino||tr?.destino,m.medioDestino||tr?.medioDestino||m.medio,-Number(m.monto));
    }else sumar(m.caja,m.medio,-(Number(m.signo)||1)*Number(m.monto));
  }
  for(const [key,delta] of Object.entries(cambios)){
    const [caja,medio]=key.split("|");
    if(saldoCaja(caja,medio)+delta< -0.005){alert(`No se puede revertir: saldo insuficiente en ${cajaLabel(caja)} (${medioLabel(medio)}). El dinero pudo utilizarse en otra operación.`);return false;}
  }
  return true;
}
function validarCuentaVenta(venta,clienteOriginal=null){
  const cuenta=normalizarPagosVenta(venta).filter(p=>p.tipo==="cuenta").reduce((a,p)=>a+p.monto,0);
  if(!cuenta)return true;
  const c=clienteDeVenta(venta);
  if(!c){alert("Para cuenta corriente seleccioná un cliente.");return false;}
  const deuda=Number(c.deuda)||0,favor=Number(c.saldoFavor)||0;
  const limite=c.limite==null?Infinity:Number(c.limite);
  const anterior=clienteOriginal?.id===c.id?(clienteOriginal.cargo||0):0;
  if(deuda-anterior+Math.max(0,cuenta-favor)>limite){alert(`La venta supera el límite de cuenta corriente de ${c.nombre}. Disponible: ${fmt(Math.max(0,limite-deuda+anterior)+favor)}.`);return false;}
  return true;
}
function valorDevolucionItem(venta,cod){
  const items=normalizarItemsVenta(venta);
  const base=items.reduce((a,it)=>a+Math.max(0,it.precio*it.cantidad-(it.descuentoItemMonto||0)-(it.descuentoConjunto||0)),0);
  const elegidos=items.filter(it=>it.cod===cod);
  const cantidad=elegidos.reduce((a,it)=>a+it.cantidad,0);
  const monto=elegidos.reduce((a,it)=>a+Math.max(0,it.precio*it.cantidad-(it.descuentoItemMonto||0)-(it.descuentoConjunto||0)),0);
  const total=base?Math.round(monto/base*venta.total*100)/100:0;
  return {cantidad,monto:total,unitario:cantidad?Math.round(total/cantidad*100)/100:0};
}
function montoMaximoDevolucion(venta,cod,cantidad){
  const valor=valorDevolucionItem(venta,cod),usadas=valor.cantidad-disponibleDevolucion(venta,cod);
  if(!valor.cantidad||!cantidadValida(cantidad))return 0;
  const proporcion=Math.round(valor.monto*(usadas+cantidad)/valor.cantidad*100)/100-Math.round(valor.monto*usadas/valor.cantidad*100)/100;
  const anteriores=DB.devoluciones.filter(d=>d.venta_id===venta.id&&!d.anulada).reduce((a,d)=>a+d.monto,0);
  return Math.max(0,Math.min(Math.round(proporcion*100)/100,Math.round((venta.total-anteriores)*100)/100));
}
function disponibleDevolucion(venta,cod){
  const vendidos=valorDevolucionItem(venta,cod).cantidad;
  return vendidos-DB.devoluciones.filter(d=>d.venta_id===venta.id&&d.producto===cod&&!d.anulada).reduce((a,d)=>a+(Number(d.cantidad)||1),0);
}
function anularDevolucion(id){
  if(!puedeModificarDB())return false;
  const d=DB.devoluciones.find(d=>d.id===id);
  if(!d||d.anulada)return false;
  const c=DB.clientes.find(c=>c.id===d.cliente_id);
  const v=DB.productos.flatMap(p=>p.variantes).find(v=>v.cod===d.producto);
  if(!c||!v){alert("Esta devolución histórica no tiene referencias completas. Revisá su cliente y producto antes de anularla.");return false;}
  if(v.stock<(d.cantidad||1)){alert("No hay stock suficiente para anular la devolución; las prendas pudieron volver a venderse.");return false;}
  if(!confirm("¿Anular esta devolución y revertir el stock y el saldo a favor?"))return false;
  const faltante=Math.max(0,d.monto-(Number(c.saldoFavor)||0));
  c.saldoFavor=Math.max(0,(Number(c.saldoFavor)||0)-d.monto);
  c.deuda=(Number(c.deuda)||0)+faltante;
  c.historial=(c.historial||[]).filter(h=>h.devolucion_id!==d.id);
  v.stock-=d.cantidad||1;
  d.anulada=true;d.anulada_en=new Date().toISOString();
  refreshClienteEstado(c);persistDBSoon();renderDevoluciones();renderSidebar();
  return true;
}

function normalizarBusqueda(text){return String(text||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();}
