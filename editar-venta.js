/* ════════════════════════════════════════════════════
   EDITAR VENTA
   Mantiene consistencia entre venta, stock, caja y cliente.
════════════════════════════════════════════════════ */

let editingVentaId = null;
let ventaOriginal = null;
let editVentaEnHistorial = false;
let editVentaLineaEditable = false;
let editVentaEsMultiItem = false;

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

function detallePrincipalVenta(venta) {
  const detalles = typeof normalizarItemsVenta === "function" ? normalizarItemsVenta(venta) : [];
  if (detalles.length) return detalles[0];
  return null;
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

function abrirFormularioEditarVenta(venta) {
  crearModalEditarVenta();
  llenarSelectosEdicionVenta();

  const detalles = normalizarItemsVenta(venta);
  const detalle = detallePrincipalVenta(venta);
  editVentaEsMultiItem = detalles.length > 1;
  editVentaLineaEditable = Boolean(detalle?.pid && !editVentaEsMultiItem);

  document.getElementById("ev-venta-id").textContent = venta.id;
  document.getElementById("ev-producto-id").value = detalle?.pid || "";
  poblarVariantesEdicion(detalle?.pid, detalle?.cod || "");
  document.getElementById("ev-cliente-id").value = clienteIdDeVenta(venta);
  document.getElementById("ev-cliente-nombre").value = venta.cliente || "Consumidor final";
  document.getElementById("ev-cantidad").value = detalle?.cantidad || venta.cantidad || 1;
  document.getElementById("ev-precio").value = detalle?.precio_unitario || venta.precio_unitario || venta.total || 0;
  document.getElementById("ev-metodo-pago").value = metodoParaEditor(venta);
  document.getElementById("ev-fecha").value = fechaISOFromVenta(venta);
  document.getElementById("ev-hora").value = venta.hora || "00:00";
  document.getElementById("ev-obs").value = venta.observaciones || "";
  document.getElementById("ev-conjunto-id").value = detalle?.conjuntoId || venta.conjuntoId || "";
  document.getElementById("ev-tipo-conjunto").value = detalle?.tipoConjunto || venta.tipoConjunto || "";

  const lineFields = ["ev-producto-id","ev-variante-cod","ev-cantidad","ev-precio","ev-conjunto-id","ev-tipo-conjunto"];
  lineFields.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !editVentaLineaEditable; });
  const info = document.getElementById("ev-linea-info");
  if (info) {
    info.style.display = editVentaLineaEditable ? "none" : "block";
    info.innerHTML = editVentaEsMultiItem
      ? `<i class="ti ti-info-circle"></i> Venta con varios productos: se conserva el detalle de ítems para no alterar stock parcialmente.`
      : `<i class="ti ti-info-circle"></i> Venta antigua sin variante identificable: se editan datos generales sin tocar stock.`;
  }

  mostrarInfoAuditoria(venta);
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
      <div class="modal" style="max-width:640px;">
        <div class="mh">
          <span class="mt"><i class="ti ti-edit"></i> Editar venta #<span id="ev-venta-id">—</span></span>
          <button class="btn-ghost" onclick="closeOv('ov-editar-venta')"><i class="ti ti-x"></i></button>
        </div>
        <div class="mc" style="max-height:70vh;overflow-y:auto;">
          <div class="notif notif-az" style="margin-bottom:15px;">
            <i class="ti ti-info-circle"></i> Los cambios se aplican también en caja, stock y cuenta corriente.
          </div>
          <div id="ev-audit-info" class="notif notif-pu" style="margin-bottom:15px;display:none;"></div>
          <div id="ev-linea-info" class="notif notif-am" style="margin-bottom:15px;display:none;"></div>

          <div class="fg">
            <label>Producto</label>
            <select id="ev-producto-id" onchange="onEditProductoChange()"></select>
          </div>
          <div class="fg">
            <label>Variante</label>
            <select id="ev-variante-cod" onchange="recalcularTotalEdicion()"></select>
          </div>

          <div class="fg2">
            <div class="fg"><label>Cliente</label><select id="ev-cliente-id" onchange="onEditClienteChange()"></select></div>
            <div class="fg"><label>O ingresar nombre</label><input type="text" id="ev-cliente-nombre" placeholder="Nombre cliente" oninput="recalcularTotalEdicion()"/></div>
          </div>

          <div class="fg2">
            <div class="fg"><label>Cantidad</label><input type="number" id="ev-cantidad" value="1" min="1" oninput="recalcularTotalEdicion()"/></div>
            <div class="fg"><label>Precio unitario ($)</label><input type="number" id="ev-precio" value="0" min="0" step="0.01" oninput="recalcularTotalEdicion()"/></div>
          </div>

          <div class="fg2">
            <div class="fg"><label>ID Conjunto</label><input type="text" id="ev-conjunto-id" placeholder="ej: CONJ1" oninput="recalcularTotalEdicion()"/></div>
            <div class="fg"><label>Tipo Conjunto</label><input type="text" id="ev-tipo-conjunto" placeholder="ej: REMERA" oninput="recalcularTotalEdicion()"/></div>
          </div>

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
  const selectProducto = document.getElementById("ev-producto-id");
  if (selectProducto) {
    selectProducto.innerHTML = `<option value="">Seleccionar producto...</option>` + DB.productos.map(p => `<option value="${p.id}">${p.nombre} (${p.codigo})</option>`).join("");
  }
  const selectCliente = document.getElementById("ev-cliente-id");
  if (selectCliente) {
    selectCliente.innerHTML = `<option value="">Consumidor final</option>` + DB.clientes.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
  }
}

function poblarVariantesEdicion(productoId, selectedCod = "") {
  const select = document.getElementById("ev-variante-cod");
  if (!select) return;
  const p = DB.productos.find(x => x.id == productoId);
  select.innerHTML = p
    ? p.variantes.map(v => `<option value="${v.cod}"${v.cod===selectedCod?" selected":""}>${v.c} / ${v.t} · stock ${v.stock}</option>`).join("")
    : `<option value="">Sin variante</option>`;
}

function recalcularTotalEdicion() {
  const totalNuevo = calcularTotalEdicion();
  const subtotal = editVentaLineaEditable
    ? (parseFloat(document.getElementById("ev-cantidad").value)||0) * (parseFloat(document.getElementById("ev-precio").value)||0)
    : (ventaOriginal?.subtotal || ventaOriginal?.total || 0);
  document.getElementById("ev-subtotal").textContent = moneyVenta(subtotal);
  document.getElementById("ev-total").textContent = moneyVenta(totalNuevo);
  document.getElementById("ev-descuento-info").textContent = editVentaLineaEditable ? "" : "Detalle de productos conservado";

  const diferencia = totalNuevo - (ventaOriginal?.total || 0);
  const diffEl = document.getElementById("ev-diferencia");
  if (Math.abs(diferencia) > 0.01) {
    diffEl.innerHTML = `Cambio: <strong style="color:${diferencia > 0 ? '#22c55e' : '#ef4444'}">${diferencia > 0 ? '+' : ''}${moneyVenta(diferencia)}</strong>`;
  } else {
    diffEl.innerHTML = "Sin cambios";
  }
  detectarCambiosEdicion(totalNuevo);
}

function calcularTotalEdicion() {
  if (!editVentaLineaEditable) return ventaOriginal?.total || 0;
  const cantidad = parseFloat(document.getElementById("ev-cantidad").value) || 0;
  const precio = parseFloat(document.getElementById("ev-precio").value) || 0;
  return Math.round(cantidad * precio);
}

function detectarCambiosEdicion(totalNuevo) {
  const cambios = [];
  const clienteNombre = document.getElementById("ev-cliente-nombre").value || "Consumidor final";
  const metodo = document.getElementById("ev-metodo-pago").value;
  const fecha = document.getElementById("ev-fecha").value;
  const horaVal = document.getElementById("ev-hora").value;
  const obs = document.getElementById("ev-obs").value;

  if (clienteNombre !== (ventaOriginal.cliente || "Consumidor final")) cambios.push(`Cliente: ${ventaOriginal.cliente || "Consumidor final"} -> ${clienteNombre}`);
  if (Math.abs(totalNuevo - (ventaOriginal.total || 0)) > 0.01) cambios.push(`Total: ${moneyVenta(ventaOriginal.total || 0)} -> ${moneyVenta(totalNuevo)}`);
  if (metodo !== metodoParaEditor(ventaOriginal)) cambios.push(`Método: ${ventaOriginal.metodo || ventaOriginal.metodo_pago || "—"} -> ${pagoLabel(metodo)}`);
  if (fecha !== fechaISOFromVenta(ventaOriginal)) cambios.push(`Fecha: ${ventaOriginal.fecha || "—"} -> ${fecha}`);
  if (horaVal !== (ventaOriginal.hora || "00:00")) cambios.push(`Hora: ${ventaOriginal.hora || "00:00"} -> ${horaVal}`);
  if (obs !== (ventaOriginal.observaciones || "")) cambios.push("Observaciones modificadas");
  if (editVentaLineaEditable) {
    const d = detallePrincipalVenta(ventaOriginal);
    const productoId = parseInt(document.getElementById("ev-producto-id").value, 10);
    const cantidad = parseFloat(document.getElementById("ev-cantidad").value) || 0;
    const precio = parseFloat(document.getElementById("ev-precio").value) || 0;
    if (productoId !== d.pid) cambios.push("Producto modificado");
    if (cantidad !== d.cantidad) cambios.push(`Cantidad: ${d.cantidad} -> ${cantidad}`);
    if (Math.abs(precio - d.precio_unitario) > 0.01) cambios.push(`Precio: ${moneyVenta(d.precio_unitario)} -> ${moneyVenta(precio)}`);
  }

  const box = document.getElementById("ev-cambios-resumen");
  const list = document.getElementById("ev-cambios-list");
  if (cambios.length) {
    box.style.display = "block";
    list.innerHTML = cambios.map(c => `<div style="margin-bottom:4px;">${c}</div>`).join("");
  } else {
    box.style.display = "none";
  }
}

function onEditProductoChange() {
  const productoId = parseInt(document.getElementById("ev-producto-id").value, 10);
  const producto = DB.productos.find(p => p.id === productoId);
  poblarVariantesEdicion(productoId, "");
  if (producto) document.getElementById("ev-precio").value = producto.precio || 0;
  recalcularTotalEdicion();
}

function onEditClienteChange() {
  const clienteId = parseInt(document.getElementById("ev-cliente-id").value, 10);
  const cliente = DB.clientes.find(c => c.id === clienteId);
  document.getElementById("ev-cliente-nombre").value = cliente ? cliente.nombre : "Consumidor final";
  recalcularTotalEdicion();
}

function pagosEditados(totalFinal, metodo, clienteId) {
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

  const clienteId = parseInt(document.getElementById("ev-cliente-id").value, 10) || null;
  const clienteNombre = document.getElementById("ev-cliente-nombre").value || "Consumidor final";
  const fechaISO = document.getElementById("ev-fecha").value || fechaISOFromVenta(ventaOriginal);
  const metodo = document.getElementById("ev-metodo-pago").value;
  const totalFinal = calcularTotalEdicion();
  const pagos = pagosEditados(totalFinal, metodo, clienteId);
  if (!pagos) return;

  const ventaActualizada = {
    ...DB.ventas[ventaIdx],
    cliente_id: clienteId,
    cliente: clienteNombre,
    fecha: fechaCortaFromISO(fechaISO),
    fechaISO,
    hora: document.getElementById("ev-hora").value || "00:00",
    metodo: [...new Set(pagos.map(p => pagoLabel(p.tipo)))].join(" + "),
    metodo_pago: pagos.length === 1 ? pagos[0].tipo : "mixto",
    pagos,
    total: totalFinal,
    observaciones: document.getElementById("ev-obs").value,
    editada_en: new Date().toISOString(),
    editada_por: "usuario",
    historial_cambios: [
      ...(DB.ventas[ventaIdx].historial_cambios || []),
      { fecha:new Date().toISOString(), accion:"editada", antes:ventaOriginal, total_anterior:ventaOriginal.total, total_nuevo:totalFinal }
    ]
  };

  if (editVentaLineaEditable) {
    const productoId = parseInt(document.getElementById("ev-producto-id").value, 10);
    const producto = DB.productos.find(p => p.id === productoId);
    const varianteCod = document.getElementById("ev-variante-cod").value;
    const variante = producto?.variantes.find(v => v.cod === varianteCod);
    if (!producto || !variante) { alert("Seleccioná producto y variante"); return; }
    const cantidad = parseFloat(document.getElementById("ev-cantidad").value) || 1;
    const precio = parseFloat(document.getElementById("ev-precio").value) || 0;
    const detalle = {
      pid: producto.id,
      cod: variante.cod,
      nombre: producto.nombre,
      color: variante.c,
      talle: variante.t,
      precio,
      precio_unitario: precio,
      cantidad,
      descuentoConjunto: 0,
      conjuntoId: document.getElementById("ev-conjunto-id").value || null,
      tipoConjunto: document.getElementById("ev-tipo-conjunto").value || null,
    };
    ventaActualizada.items_detalle = [detalle];
    ventaActualizada.items = describirItemsVenta([detalle]);
    ventaActualizada.producto = producto.id;
    ventaActualizada.variante_cod = variante.cod;
    ventaActualizada.cantidad = cantidad;
    ventaActualizada.precio_unitario = precio;
    ventaActualizada.subtotal = cantidad * precio;
    ventaActualizada.descuentoConjunto = 0;
    ventaActualizada.descuentoConjuntoAplicado = false;
  }
  ventaActualizada.puntos_otorgados = Math.round(totalFinal / 1000);

  const ventaAnterior = cloneData(DB.ventas[ventaIdx]);
  revertirEfectosVenta(ventaAnterior);
  DB.ventas[ventaIdx] = ventaActualizada;
  aplicarEfectosVenta(ventaActualizada);
  persistDBSoon();

  alert(`Venta #${editingVentaId} actualizada correctamente.`);
  closeOv("ov-editar-venta");
  editingVentaId = null;
  ventaOriginal = null;
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
