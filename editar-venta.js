/* ════════════════════════════════════════════════════
   EDITAR VENTA
   Mantiene consistencia entre venta, stock, caja y cliente.
════════════════════════════════════════════════════ */

let editingVentaId = null;
let ventaOriginal = null;
let editVentaEnHistorial = false;
let editVentaItemsTmp = [];

function moneyVenta(n) {
  if (typeof formatearMoney === "function") return formatearMoney(n);
  if (typeof fmt === "function") return fmt(n);
  return "$" + Math.round(Number(n)||0).toLocaleString("es-AR");
}

function editarVenta(ventaId, desdeHistorial = false) {
  const db = typeof DB !== "undefined" ? DB : null;
  if (!db) { alert("Base de datos no disponible"); return; }

  const venta = db.ventas.find(v => v.id === ventaId);
  if (!venta || venta.eliminada) { alert("Venta no encontrada"); return; }

  ventaOriginal = cloneData(venta);
  editingVentaId = ventaId;
  editVentaEnHistorial = desdeHistorial;
  abrirFormularioEditarVenta(venta);
}

function clienteIdDeVenta(venta) {
  if (venta.cliente_id) return venta.cliente_id;
  const c = DB.clientes.find(x => x.nombre === venta.cliente);
  return c?.id || "";
}

function metodoParaEditor(venta) {
  const pagos = typeof normalizarPagosVenta === "function" ? normalizarPagosVenta(venta) : [];
  if (pagos.length > 1) return "mixto";
  if (pagos[0]?.tipo) return pagos[0].tipo;
  return pagoTipoNormalizado(venta.metodo_pago || venta.metodo || "efectivo");
}

function prepararItemsEdicion(venta) {
  const items = normalizarItemsVenta(venta).map(it => ({ ...it }));
  if (items.length) return items;
  return [{
    pid: null,
    cod: "",
    nombre: "Producto",
    color: "",
    talle: "",
    precio: Number(venta.total)||0,
    precio_unitario: Number(venta.total)||0,
    cantidad: 1,
    descuentoItemPct: 0,
    descuentoItemMonto: 0,
    descuentoConjunto: 0,
    precioFinal: null,
    conjuntoId: null,
    tipoConjunto: null,
  }];
}

function abrirFormularioEditarVenta(venta) {
  crearModalEditarVenta();
  llenarSelectosEdicionVenta();

  editVentaItemsTmp = prepararItemsEdicion(venta);

  document.getElementById("ev-venta-id").textContent = venta.id;
  document.getElementById("ev-cliente-id").value = clienteIdDeVenta(venta);
  document.getElementById("ev-cliente-nombre").value = venta.cliente || "Consumidor final";
  document.getElementById("ev-metodo-pago").value = metodoParaEditor(venta);
  document.getElementById("ev-pendiente").checked = typeof ventaPendiente === "function" ? ventaPendiente(venta) : venta.estado === "pendiente";
  document.getElementById("ev-fecha").value = fechaISOFromVenta(venta);
  document.getElementById("ev-hora").value = venta.hora || "00:00";
  document.getElementById("ev-desc-general").value = Number(venta.descuento_general)||0;
  document.getElementById("ev-obs").value = venta.observaciones || "";

  const info = document.getElementById("ev-linea-info");
  if (info) {
    info.style.display = "block";
    info.innerHTML = `<i class="ti ti-info-circle"></i> Podés modificar productos, variantes, cantidades y precios. Al guardar se recalculan stock, caja y cuenta corriente.`;
  }

  mostrarInfoAuditoria(venta);
  renderItemsEdicion();
  onEditPendienteChange();
  recalcularTotalEdicion();
  openOv("ov-editar-venta");
}

function mostrarInfoAuditoria(venta) {
  const auditEl = document.getElementById("ev-audit-info");
  if (!auditEl) return;
  if (venta.editada_en) {
    auditEl.innerHTML = `<i class="ti ti-history" style="font-size:12px;margin-right:4px;"></i> Editada el ${new Date(venta.editada_en).toLocaleString("es-AR")}`;
    auditEl.style.display = "block";
  } else {
    auditEl.style.display = "none";
  }
}

function crearModalEditarVenta() {
  if (document.getElementById("ov-editar-venta")) return;
  const html = `
    <div class="ov" id="ov-editar-venta">
      <div class="modal" style="max-width:820px;">
        <div class="mh">
          <span class="mt"><i class="ti ti-edit"></i> Editar venta #<span id="ev-venta-id">—</span></span>
          <button class="btn-ghost" onclick="closeOv('ov-editar-venta')"><i class="ti ti-x"></i></button>
        </div>
        <div class="mc" style="max-height:72vh;overflow-y:auto;">
          <div class="notif notif-az" style="margin-bottom:15px;">
            <i class="ti ti-info-circle"></i> Los cambios se aplican también en caja, stock y cuenta corriente.
          </div>
          <div id="ev-audit-info" class="notif notif-pu" style="margin-bottom:15px;display:none;"></div>
          <div id="ev-linea-info" class="notif notif-am" style="margin-bottom:15px;display:none;"></div>

          <div class="fg2">
            <div class="fg"><label>Cliente</label><select id="ev-cliente-id" onchange="onEditClienteChange()"></select></div>
            <div class="fg"><label>O ingresar nombre</label><input type="text" id="ev-cliente-nombre" placeholder="Nombre cliente" oninput="recalcularTotalEdicion()"/></div>
          </div>

          <div class="sect-title" style="margin-top:4px;">Productos vendidos</div>
          <div id="ev-items-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:10px;"></div>
          <button class="btn btn-out btn-sm" type="button" onclick="agregarItemEditVenta()"><i class="ti ti-plus"></i>Agregar producto</button>

          <div class="fg2" style="margin-top:14px;">
            <div class="fg"><label>Descuento general (%)</label><input type="number" id="ev-desc-general" value="0" min="0" max="100" oninput="recalcularTotalEdicion()"/></div>
            <div class="fg">
              <label>Método de pago</label>
              <select id="ev-metodo-pago" onchange="recalcularTotalEdicion()">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="mercadopago">Mercado Pago</option>
                <option value="debito">Débito</option>
                <option value="credito">Crédito</option>
                <option value="cuenta">Cuenta corriente</option>
                <option value="mixto">Mixto (mantener proporción)</option>
              </select>
            </div>
          </div>

          <label style="display:flex;align-items:flex-start;gap:9px;background:var(--azbg);border:0.5px solid var(--azbr);border-radius:8px;padding:10px 13px;margin-bottom:12px;cursor:pointer;">
            <input type="checkbox" id="ev-pendiente" onchange="onEditPendienteChange()" style="width:15px;height:15px;margin-top:1px;accent-color:var(--az);"/>
            <span>
              <span style="display:block;font-size:12px;color:var(--az);font-weight:600;">Venta pendiente</span>
              <span style="display:block;font-size:10px;color:var(--az);opacity:.8;margin-top:2px;">Reserva stock, sin caja ni cuenta corriente hasta cobrarla.</span>
            </span>
          </label>

          <div style="background:var(--ng);color:var(--cr);border-radius:9px;padding:12px 14px;margin-bottom:15px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:11px;color:var(--gc);">Subtotal</div>
              <div style="font-size:18px;font-weight:500;" id="ev-subtotal">$0</div>
              <div id="ev-descuento-info" style="font-size:10px;color:var(--gc);margin-top:3px;"></div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11px;color:var(--gc);">Total</div>
              <div style="font-size:22px;font-weight:500;" id="ev-total">$0</div>
              <div id="ev-diferencia" style="font-size:11px;color:var(--gc);margin-top:3px;"></div>
            </div>
          </div>

          <div class="fg2">
            <div class="fg"><label>Fecha</label><input type="date" id="ev-fecha" onchange="recalcularTotalEdicion()"/></div>
            <div class="fg"><label>Hora</label><input type="time" id="ev-hora" oninput="recalcularTotalEdicion()"/></div>
          </div>
          <div class="fg"><label>Observaciones</label><textarea id="ev-obs" rows="2" placeholder="Notas sobre la venta..." oninput="recalcularTotalEdicion()"></textarea></div>

          <div id="ev-cambios-resumen" style="background:var(--ambg);border:0.5px solid var(--ambr);border-radius:9px;padding:10px 12px;margin-top:15px;display:none;font-size:12px;">
            <div style="font-weight:500;color:var(--am);margin-bottom:8px;">Cambios detectados:</div>
            <div id="ev-cambios-list" style="color:var(--am);"></div>
          </div>
        </div>
        <div class="mf">
          <button class="btn btn-out" onclick="closeOv('ov-editar-venta')">Cancelar</button>
          <button class="btn btn-rj" onclick="confirmarEliminarVenta()"><i class="ti ti-trash"></i> Eliminar</button>
          <button class="btn btn-ng" onclick="guardarCambiosVenta()"><i class="ti ti-check"></i> Guardar cambios</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend", html);
}

function llenarSelectosEdicionVenta() {
  const selectCliente = document.getElementById("ev-cliente-id");
  if (selectCliente) {
    selectCliente.innerHTML = `<option value="">Consumidor final</option>` + DB.clientes.map(c => `<option value="${c.id}">${escapeHTML(c.nombre)}</option>`).join("");
  }
}

function productoOptions(selected = "") {
  return `<option value="">Seleccionar producto...</option>` + DB.productos.map(p => `<option value="${p.id}"${Number(selected)===p.id?" selected":""}>${escapeHTML(p.nombre)} (${escapeHTML(p.codigo)})</option>`).join("");
}

function varianteOptions(productoId, selectedCod = "") {
  const p = DB.productos.find(x => x.id == productoId);
  if (!p) return `<option value="">Sin variante</option>`;
  return p.variantes.map(v => `<option value="${escapeHTML(v.cod)}"${v.cod===selectedCod?" selected":""}>${escapeHTML(varianteLabel(v))} · stock ${Number(v.stock)||0}</option>`).join("");
}

function renderItemsEdicion() {
  const list = document.getElementById("ev-items-list");
  if (!list) return;
  list.innerHTML = editVentaItemsTmp.map((item, i) => {
    const subtotal = (Number(item.cantidad)||0) * (Number(item.precio_unitario ?? item.precio)||0);
    return `
      <div style="border:0.5px solid var(--crb);border-radius:8px;background:var(--cr);padding:10px;">
        <div style="display:grid;grid-template-columns:minmax(170px,1.3fr) minmax(140px,1fr) 68px 96px 72px 28px;gap:8px;align-items:end;">
          <div class="fg" style="margin-bottom:0;">
            <label>Producto ${i+1}</label>
            <select id="ev-item-prod-${i}" onchange="onEditItemProductoChange(${i})">${productoOptions(item.pid)}</select>
          </div>
          <div class="fg" style="margin-bottom:0;">
            <label>Variante</label>
            <select id="ev-item-var-${i}" onchange="onEditItemVarianteChange(${i})">${varianteOptions(item.pid,item.cod)}</select>
          </div>
          <div class="fg" style="margin-bottom:0;">
            <label>Cant.</label>
            <input id="ev-item-cant-${i}" type="number" min="1" value="${Number(item.cantidad)||1}" oninput="onEditItemNumeroChange(${i})"/>
          </div>
          <div class="fg" style="margin-bottom:0;">
            <label>Precio unit.</label>
            <input id="ev-item-precio-${i}" type="number" min="0" step="0.01" value="${Number(item.precio_unitario ?? item.precio)||0}" oninput="onEditItemNumeroChange(${i})"/>
          </div>
          <div class="fg" style="margin-bottom:0;">
            <label>Desc. %</label>
            <input id="ev-item-desc-${i}" type="number" min="0" max="100" step="0.01" value="${Number(item.descuentoItemPct)||0}" oninput="onEditItemNumeroChange(${i})"/>
          </div>
          <button class="btn-icon" type="button" onclick="eliminarItemEditVenta(${i})" title="Quitar producto" style="width:28px;height:28px;color:var(--rj);"><i class="ti ti-x" style="font-size:11px;"></i></button>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:11px;color:var(--gt);">
          <span>${escapeHTML(item.nombre || "Producto")}${item.conjuntoId?` · conjunto ${escapeHTML(item.conjuntoId)}`:""}</span>
          <strong style="color:var(--ng);font-size:12px;">${moneyVenta(subtotal)}</strong>
        </div>
      </div>`;
  }).join("");
}

function syncItemDesdeDOM(i) {
  const item = editVentaItemsTmp[i];
  if (!item) return null;
  const prodId = parseInt(document.getElementById(`ev-item-prod-${i}`)?.value, 10) || null;
  const producto = DB.productos.find(p => p.id === prodId);
  const cod = document.getElementById(`ev-item-var-${i}`)?.value || "";
  const variante = producto?.variantes.find(v => v.cod === cod);
  const cantidad = Math.max(1, parseFloat(document.getElementById(`ev-item-cant-${i}`)?.value)||1);
  const precio = Math.max(0, parseFloat(document.getElementById(`ev-item-precio-${i}`)?.value)||0);
  const descuentoItemPct = Math.max(0, Math.min(100, parseFloat(document.getElementById(`ev-item-desc-${i}`)?.value)||0));
  Object.assign(item, {
    pid: producto?.id || null,
    cod: variante?.cod || cod,
    nombre: producto?.nombre || item.nombre || "Producto",
    color: variante?.c || "",
    talle: variante?.t || "",
    precio,
    precio_unitario: precio,
    cantidad,
    descuentoItemPct,
    descuentoItemMonto: Math.round(precio * cantidad * descuentoItemPct / 100),
    conjuntoId: producto?.conjuntoId || item.conjuntoId || null,
    tipoConjunto: producto?.tipoConjunto || item.tipoConjunto || null,
  });
  return item;
}

function syncTodosItemsDesdeDOM() {
  editVentaItemsTmp.forEach((_, i) => syncItemDesdeDOM(i));
}

function onEditItemProductoChange(i) {
  const prodId = parseInt(document.getElementById(`ev-item-prod-${i}`).value, 10);
  const producto = DB.productos.find(p => p.id === prodId);
  const item = editVentaItemsTmp[i];
  if (!item || !producto) return;
  const variante = producto.variantes[0];
  Object.assign(item, {
    pid: producto.id,
    cod: variante?.cod || "",
    nombre: producto.nombre,
    color: variante?.c || "",
    talle: variante?.t || "",
    precio: producto.precio || 0,
    precio_unitario: producto.precio || 0,
    descuentoItemPct: item.descuentoItemPct || 0,
    descuentoItemMonto: item.descuentoItemMonto || 0,
    conjuntoId: producto.conjuntoId || null,
    tipoConjunto: producto.tipoConjunto || null,
  });
  renderItemsEdicion();
  recalcularTotalEdicion();
}

function onEditItemVarianteChange(i) {
  syncItemDesdeDOM(i);
  renderItemsEdicion();
  recalcularTotalEdicion();
}

function onEditItemNumeroChange(i) {
  syncItemDesdeDOM(i);
  recalcularTotalEdicion();
}

function agregarItemEditVenta() {
  const producto = DB.productos.find(p => stockTotal(p) > 0) || DB.productos[0];
  const variante = producto?.variantes?.[0];
  editVentaItemsTmp.push({
    pid: producto?.id || null,
    cod: variante?.cod || "",
    nombre: producto?.nombre || "Producto",
    color: variante?.c || "",
    talle: variante?.t || "",
    precio: producto?.precio || 0,
    precio_unitario: producto?.precio || 0,
    cantidad: 1,
    descuentoItemPct: 0,
    descuentoItemMonto: 0,
    descuentoConjunto: 0,
    precioFinal: null,
    conjuntoId: producto?.conjuntoId || null,
    tipoConjunto: producto?.tipoConjunto || null,
  });
  renderItemsEdicion();
  recalcularTotalEdicion();
}

function eliminarItemEditVenta(i) {
  if (editVentaItemsTmp.length <= 1) {
    alert("La venta debe tener al menos un producto.");
    return;
  }
  editVentaItemsTmp.splice(i, 1);
  renderItemsEdicion();
  recalcularTotalEdicion();
}

function itemsEdicionValidos() {
  syncTodosItemsDesdeDOM();
  const items = editVentaItemsTmp.filter(it => Number(it.cantidad)>0);
  if (!items.length) { alert("La venta debe tener al menos un producto."); return null; }
  for (const item of items) {
    const producto = DB.productos.find(p => p.id === item.pid);
    const variante = producto?.variantes.find(v => v.cod === item.cod);
    if (!producto || !variante) {
      alert("Revisá productos y variantes antes de guardar.");
      return null;
    }
  }
  if (!stockSuficienteParaEdicion(items)) return null;
  return items;
}

function stockOriginalPorCodigo() {
  return normalizarItemsVenta(ventaOriginal).reduce((acc, item) => {
    if (item.cod) acc[item.cod] = (acc[item.cod]||0) + (Number(item.cantidad)||0);
    return acc;
  }, {});
}

function stockSuficienteParaEdicion(items) {
  const original = stockOriginalPorCodigo();
  const pedido = items.reduce((acc, item) => {
    acc[item.cod] = (acc[item.cod]||0) + (Number(item.cantidad)||0);
    return acc;
  }, {});
  for (const [cod, cant] of Object.entries(pedido)) {
    const variante = DB.productos.flatMap(p => p.variantes).find(v => v.cod === cod);
    const disponible = (Number(variante?.stock)||0) + (original[cod]||0);
    if (cant > disponible) {
      alert(`Stock insuficiente para ${cod}. Disponible para esta edición: ${disponible}.`);
      return false;
    }
  }
  return true;
}

function calcularCobroEdicion(items = null) {
  const descGeneral = Math.max(0, Math.min(100, parseFloat(document.getElementById("ev-desc-general")?.value)||0));
  const baseItems = (items || editVentaItemsTmp).map(item => ({
    ...item,
    id: item.pid,
    cantidad: Number(item.cantidad)||1,
    precio: Number(item.precio_unitario ?? item.precio)||0,
    descuentoItemPct: Math.max(0, Math.min(100, Number(item.descuentoItemPct)||0)),
    descuentoConjunto: 0,
    precioFinal: null,
  }));
  const resultado = typeof aplicarDescuentoPorConjunto === "function"
    ? aplicarDescuentoPorConjunto(baseItems)
    : {productosConDescuento:baseItems,descuentoTotal:0,descuentoConjuntoAplicado:false,detalles:[]};
  const detalles = resultado.productosConDescuento.map((item, i) => {
    const original = baseItems[i] || item;
    const cantidad = Number(item.cantidad ?? original.cantidad)||1;
    const precio = Number(item.precio)||0;
    const descuentoItemPct = Math.max(0, Math.min(100, Number(original.descuentoItemPct)||0));
    const descuentoItemMonto = Math.round(precio*cantidad*descuentoItemPct/100);
    return {
      pid: item.pid || item.id,
      cod: item.cod || original.cod,
      nombre: item.nombre || original.nombre,
      color: item.color || original.color || "",
      talle: item.talle || original.talle || "",
      precio,
      precio_unitario: precio,
      cantidad,
      descuentoItemPct,
      descuentoItemMonto,
      descuentoConjunto: Number(item.descuentoConjunto)||0,
      precioFinal: item.precioFinal || null,
      conjuntoId: item.conjuntoId || null,
      tipoConjunto: item.tipoConjunto || null,
    };
  });
  const subtotal = detalles.reduce((a,x)=>a+x.precio*x.cantidad,0);
  const descuentoItems = detalles.reduce((a,x)=>a+(Number(x.descuentoItemMonto)||0),0);
  const descuentoConjunto = Math.round(Number(resultado.descuentoTotal)||0);
  const base = Math.max(0, subtotal-descuentoItems-descuentoConjunto);
  const descuentoGeneralMonto = Math.round(base*(descGeneral/100));
  const total = Math.round(base-descuentoGeneralMonto);
  return {subtotal,descuentoItems,descuentoConjunto,descuentoGeneral:descGeneral,descuentoGeneralMonto,total,detalles,detallesConjuntos:resultado.detalles||[],descuentoConjuntoAplicado:descuentoConjunto>0};
}

function recalcularTotalEdicion() {
  syncTodosItemsDesdeDOM();
  const cobro = calcularCobroEdicion();
  document.getElementById("ev-subtotal").textContent = moneyVenta(cobro.subtotal);
  document.getElementById("ev-total").textContent = moneyVenta(cobro.total);
  const partes = [];
  if (cobro.descuentoItems > 0) partes.push(`Productos: ${moneyVenta(cobro.descuentoItems)}`);
  if (cobro.descuentoConjunto > 0) partes.push(`Conjunto: ${moneyVenta(cobro.descuentoConjunto)}`);
  if (cobro.descuentoGeneralMonto > 0) partes.push(`General: ${moneyVenta(cobro.descuentoGeneralMonto)}`);
  document.getElementById("ev-descuento-info").textContent = partes.length ? `Descuentos ${partes.join(" · ")}` : "";

  const diferencia = cobro.total - (ventaOriginal?.total || 0);
  const diffEl = document.getElementById("ev-diferencia");
  if (Math.abs(diferencia) > 0.01) {
    diffEl.innerHTML = `Cambio: <strong style="color:${diferencia > 0 ? '#22c55e' : '#ef4444'}">${diferencia > 0 ? '+' : ''}${moneyVenta(diferencia)}</strong>`;
  } else {
    diffEl.textContent = "Sin cambios";
  }
  detectarCambiosEdicion(cobro.total);
}

function calcularTotalEdicion() {
  return calcularCobroEdicion().total;
}

function firmaItems(items) {
  return items.map(it => `${it.pid}|${it.cod}|${Number(it.cantidad)||0}|${Number(it.precio_unitario ?? it.precio)||0}|${Number(it.descuentoItemPct)||0}`).join(";");
}

function detectarCambiosEdicion(totalNuevo) {
  const cambios = [];
  const clienteNombre = cleanPlainText(document.getElementById("ev-cliente-nombre").value) || "Consumidor final";
  const metodo = document.getElementById("ev-metodo-pago").value;
  const pendiente = Boolean(document.getElementById("ev-pendiente")?.checked);
  const fecha = document.getElementById("ev-fecha").value;
  const horaVal = document.getElementById("ev-hora").value;
  const obs = cleanPlainText(document.getElementById("ev-obs").value);
  const actuales = editVentaItemsTmp;
  const originales = normalizarItemsVenta(ventaOriginal);

  if (clienteNombre !== (ventaOriginal.cliente || "Consumidor final")) cambios.push(`Cliente: ${ventaOriginal.cliente || "Consumidor final"} -> ${clienteNombre}`);
  if (firmaItems(actuales) !== firmaItems(originales)) cambios.push("Productos, cantidades o precios modificados");
  if (Math.abs(totalNuevo - (ventaOriginal.total || 0)) > 0.01) cambios.push(`Total: ${moneyVenta(ventaOriginal.total || 0)} -> ${moneyVenta(totalNuevo)}`);
  if (pendiente !== (typeof ventaPendiente === "function" ? ventaPendiente(ventaOriginal) : ventaOriginal.estado === "pendiente")) cambios.push(pendiente ? "Venta marcada como pendiente" : "Venta marcada como cobrada");
  if (!pendiente && metodo !== metodoParaEditor(ventaOriginal)) cambios.push(`Método: ${ventaOriginal.metodo || ventaOriginal.metodo_pago || "—"} -> ${pagoLabel(metodo)}`);
  if (fecha !== fechaISOFromVenta(ventaOriginal)) cambios.push(`Fecha: ${ventaOriginal.fecha || "—"} -> ${fecha}`);
  if (horaVal !== (ventaOriginal.hora || "00:00")) cambios.push(`Hora: ${ventaOriginal.hora || "00:00"} -> ${horaVal}`);
  if (obs !== (ventaOriginal.observaciones || "")) cambios.push("Observaciones modificadas");

  const box = document.getElementById("ev-cambios-resumen");
  const list = document.getElementById("ev-cambios-list");
  if (cambios.length) {
    box.style.display = "block";
    list.innerHTML = cambios.map(c => `<div style="margin-bottom:4px;">${escapeHTML(c)}</div>`).join("");
  } else {
    box.style.display = "none";
  }
}

function onEditClienteChange() {
  const clienteId = parseInt(document.getElementById("ev-cliente-id").value, 10);
  const cliente = DB.clientes.find(c => c.id === clienteId);
  document.getElementById("ev-cliente-nombre").value = cliente ? cliente.nombre : "Consumidor final";
  recalcularTotalEdicion();
}

function onEditPendienteChange() {
  const pending = Boolean(document.getElementById("ev-pendiente")?.checked);
  const metodo = document.getElementById("ev-metodo-pago");
  if (metodo) {
    metodo.disabled = pending;
    if (pending) metodo.value = "efectivo";
  }
  recalcularTotalEdicion();
}

function pagosEditados(totalFinal, metodo, clienteId) {
  if (document.getElementById("ev-pendiente")?.checked) return [];
  if (metodo === "mixto") {
    const originales = normalizarPagosVenta(ventaOriginal, ventaOriginal.total);
    const base = ventaOriginal.total || totalFinal || 1;
    return originales.map(p => ({ tipo:p.tipo, monto:Math.round((p.monto || 0) * totalFinal / base) })).filter(p => p.monto > 0);
  }
  const tipo = pagoTipoNormalizado(metodo);
  if (tipo === "cuenta" && !clienteId) {
    alert("Para cuenta corriente seleccioná un cliente.");
    return null;
  }
  return [{ tipo, monto:totalFinal }];
}

function guardarCambiosVenta() {
  if (!editingVentaId || !ventaOriginal) { alert("Error: No hay venta en edición"); return; }
  const ventaIdx = DB.ventas.findIndex(v => v.id === editingVentaId);
  if (ventaIdx < 0) { alert("Venta no encontrada"); return; }

  const items = itemsEdicionValidos();
  if (!items) return;
  const cobro = calcularCobroEdicion(items);
  const clienteId = parseInt(document.getElementById("ev-cliente-id").value, 10) || null;
  const clienteNombre = cleanPlainText(document.getElementById("ev-cliente-nombre").value) || "Consumidor final";
  const fechaISO = document.getElementById("ev-fecha").value || fechaISOFromVenta(ventaOriginal);
  const metodo = document.getElementById("ev-metodo-pago").value;
  const pendiente = Boolean(document.getElementById("ev-pendiente")?.checked);
  const pagos = pagosEditados(cobro.total, metodo, clienteId);
  if (!pagos) return;

  const detallePrincipal = cobro.detalles[0] || {};
  const ventaActualizada = {
    ...DB.ventas[ventaIdx],
    cliente_id: clienteId,
    cliente: clienteNombre,
    fecha: fechaCortaFromISO(fechaISO),
    fechaISO,
    hora: document.getElementById("ev-hora").value || "00:00",
    metodo: pendiente ? "Pendiente" : [...new Set(pagos.map(p => pagoLabel(p.tipo)))].join(" + "),
    metodo_pago: pendiente ? "pendiente" : (pagos.length === 1 ? pagos[0].tipo : "mixto"),
    pagos,
    estado: pendiente ? "pendiente" : "pagada",
    items: describirItemsVenta(cobro.detalles),
    items_detalle: cobro.detalles,
    producto: detallePrincipal.pid || null,
    variante_cod: detallePrincipal.cod || "",
    cantidad: cobro.detalles.reduce((a,x)=>a+(Number(x.cantidad)||0),0),
    precio_unitario: cobro.detalles.length===1 ? detallePrincipal.precio_unitario : 0,
    subtotal: cobro.subtotal,
    descuento_items_monto: cobro.descuentoItems,
    descuento_general: cobro.descuentoGeneral,
    descuento_general_monto: cobro.descuentoGeneralMonto,
    descuentoConjunto: cobro.descuentoConjunto,
    descuentoConjuntoAplicado: cobro.descuentoConjuntoAplicado,
    detallesConjuntos: cobro.detallesConjuntos,
    total: cobro.total,
    puntos_otorgados: Math.round(cobro.total / 1000),
    observaciones: cleanPlainText(document.getElementById("ev-obs").value),
    editada_en: new Date().toISOString(),
    editada_por: "usuario",
    historial_cambios: [
      ...(DB.ventas[ventaIdx].historial_cambios || []),
      { fecha:new Date().toISOString(), accion:"editada", antes:ventaOriginal, total_anterior:ventaOriginal.total, total_nuevo:cobro.total }
    ]
  };

  const ventaAnterior = cloneData(DB.ventas[ventaIdx]);
  revertirEfectosVenta(ventaAnterior);
  DB.ventas[ventaIdx] = ventaActualizada;
  aplicarEfectosVenta(ventaActualizada);
  persistDBSoon();

  alert(`Venta #${editingVentaId} actualizada correctamente.`);
  closeOv("ov-editar-venta");
  editingVentaId = null;
  ventaOriginal = null;
  editVentaItemsTmp = [];
  refrescarVistaPostVenta();
}

function confirmarEliminarVenta() {
  if (!editingVentaId) return;
  if (confirm(`¿Eliminar la venta #${editingVentaId}? Se revertirá caja, stock y cuenta corriente.`)) {
    eliminarVentaConfirmada();
  }
}

function eliminarVentaConfirmada() {
  if (!eliminarVentaPorId(editingVentaId)) { alert("Venta no encontrada"); return; }
  alert(`Venta #${editingVentaId} marcada como eliminada y revertida.`);
  closeOv("ov-editar-venta");
  editingVentaId = null;
  ventaOriginal = null;
  editVentaItemsTmp = [];
  refrescarVistaPostVenta();
}

function refrescarVistaPostVenta() {
  renderSidebar();
  if (editVentaEnHistorial && typeof renderHistorialVentas === "function") renderHistorialVentas();
  else if (typeof actualizarDashboard === "function") actualizarDashboard();
  editVentaEnHistorial = false;
}

function registrarMovimientoAjusteVenta(ventaId, diferencia, totalAnterior, totalNuevo, metodoAnterior, metodoNuevo) {
  DB.movimientos.unshift({
    id: nextId(DB.movimientos),
    fecha: todayShort(),
    fechaISO: toDateInput(),
    hora: hora(),
    tipo: "ajuste_venta",
    concepto: `Ajuste venta #${ventaId}`,
    caja: "principal",
    medio: "ajuste",
    monto: Math.abs(diferencia),
    signo: diferencia > 0 ? 1 : -1,
    venta_id: ventaId,
    detalles: { total_anterior: totalAnterior, total_nuevo: totalNuevo, metodo_anterior: metodoAnterior, metodo_nuevo: metodoNuevo },
    creado_en: new Date().toISOString()
  });
}

function agregarBotonesEditarVentas(selector = ".venta-item") {
  const ventaItems = document.querySelectorAll(selector);
  ventaItems.forEach((item) => {
    if (item.querySelector(".venta-item-edit-btn")) return;
    const ventaMeta = item.querySelector(".venta-item-meta")?.textContent || "";
    const match = ventaMeta.match(/#(\d+)/);
    const ventaId = match ? parseInt(match[1], 10) : null;
    if (!ventaId) return;
    const btn = document.createElement("button");
    btn.className = "venta-item-edit-btn btn-ghost btn-sm";
    btn.innerHTML = '<i class="ti ti-edit" style="font-size:14px;"></i>';
    btn.onclick = () => editarVenta(ventaId, true);
    btn.title = "Editar venta";
    item.appendChild(btn);
  });
}
