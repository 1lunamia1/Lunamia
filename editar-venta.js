/* ════════════════════════════════════════════════════
   EDITAR VENTA - FUNCIONALIDAD COMPLETA
   Permite editar cualquier venta pasada
════════════════════════════════════════════════════ */

let editingVentaId = null;
let ventaOriginal = null;
let editVentaEnHistorial = false;

/**
 * Abre el modal de edición de una venta existente
 * @param {number} ventaId - ID de la venta a editar
 * @param {boolean} desdeHistorial - Si viene del historial de ventas
 */
function editarVenta(ventaId, desdeHistorial = false) {
  const db = typeof DB !== "undefined" ? DB : null;
  if (!db) {
    alert("Base de datos no disponible");
    return;
  }

  // Buscar la venta
  const venta = db.ventas.find(v => v.id === ventaId);
  if (!venta) {
    alert("Venta no encontrada");
    return;
  }

  // Guardar original para comparar cambios
  ventaOriginal = JSON.parse(JSON.stringify(venta));
  editingVentaId = ventaId;
  editVentaEnHistorial = desdeHistorial;

  // Cargar formulario de edición
  abrirFormularioEditarVenta(venta);
}

/**
 * Abre el formulario en modal
 * @param {object} venta - Datos de la venta a editar
 */
function abrirFormularioEditarVenta(venta) {
  const modalId = 'ov-editar-venta';
  let modal = document.getElementById(modalId);
  
  if (!modal) {
    crearModalEditarVenta();
    modal = document.getElementById(modalId);
  }

  // Compatibilidad: el sistema guarda venta.items (string) y venta.metodo
  const cliente = venta.cliente_id
    ? DB.clientes.find(c => c.id === venta.cliente_id)
    : null;

  // Convertir fecha dd/mm/aaaa -> aaaa-mm-dd para input type=date
  function fechaParaInput(f) {
    if (!f) return toDateInput();
    if (f.includes('-') && f.length === 10) return f; // ya es ISO
    const p = f.split('/');
    if (p.length === 3) return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');
    return toDateInput();
  }

  // Llenar campos
  document.getElementById('ev-venta-id').textContent = venta.id;
  document.getElementById('ev-producto-id').value = venta.producto || '';
  document.getElementById('ev-cliente-id').value = venta.cliente_id || '';
  document.getElementById('ev-cliente-nombre').value = venta.cliente || 'Consumidor final';
  document.getElementById('ev-cantidad').value = venta.cantidad || 1;
  document.getElementById('ev-precio').value = venta.precio_unitario || venta.total || 0;
  document.getElementById('ev-total').textContent = formatearMoney(venta.total || 0);
  // Compatibilidad: campo puede llamarse metodo_pago o metodo
  const metodoValor = venta.metodo_pago || venta.metodo || 'efectivo';
  const metodoEl = document.getElementById('ev-metodo-pago');
  // Mapear etiquetas legibles a valores del select
  const metodoMap = {'Efectivo':'efectivo','Transferencia':'transferencia','Tarjeta débito':'debito','Tarjeta crédito':'credito','Mercado Pago':'mercadopago','Cta. cte.':'cuenta_corriente'};
  metodoEl.value = metodoMap[metodoValor] || metodoValor;
  document.getElementById('ev-fecha').value = fechaParaInput(venta.fecha_iso_editado || venta.fecha);
  document.getElementById('ev-hora').value = venta.hora || '00:00';
  document.getElementById('ev-obs').value = venta.observaciones || '';

  // Llenar campos de conjunto si existen
  document.getElementById('ev-conjunto-id').value = venta.conjuntoId || '';
  document.getElementById('ev-tipo-conjunto').value = venta.tipoConjunto || '';

  // Mostrar información de auditoría
  mostrarInfoAuditoria(venta);

  // Mostrar modal
  openOv(modalId);

  // Setup listeners para cálculos
  document.getElementById('ev-cantidad').addEventListener('input', recalcularTotalEdicion);
  document.getElementById('ev-precio').addEventListener('input', recalcularTotalEdicion);
  document.getElementById('ev-conjunto-id').addEventListener('change', recalcularTotalEdicion);
  document.getElementById('ev-tipo-conjunto').addEventListener('change', recalcularTotalEdicion);
}

/**
 * Muestra información sobre cambios previos en la venta
 */
function mostrarInfoAuditoria(venta) {
  const auditEl = document.getElementById('ev-audit-info');
  if (!auditEl) return;

  if (venta.editada_en) {
    const fecha = new Date(venta.editada_en).toLocaleString('es-AR');
    auditEl.innerHTML = `<i class="ti ti-history" style="font-size:12px;margin-right:4px;"></i> Editada el ${fecha}`;
    auditEl.style.display = 'block';
  } else {
    auditEl.style.display = 'none';
  }
}

/**
 * Crea el modal de edición si no existe
 */
function crearModalEditarVenta() {
  if (document.getElementById('ov-editar-venta')) {
    return document.getElementById('ov-editar-venta');
  }

  const html = `
    <div class="ov" id="ov-editar-venta">
      <div class="modal" style="max-width:640px;">
        <div class="mh">
          <span class="mt"><i class="ti ti-edit"></i> Editar venta #<span id="ev-venta-id">—</span></span>
          <button class="btn-ghost" onclick="closeOv('ov-editar-venta')"><i class="ti ti-x"></i></button>
        </div>
        
        <div class="mc" style="max-height:70vh;overflow-y:auto;">
          <div class="notif notif-az" style="margin-bottom:15px;">
            <i class="ti ti-info-circle"></i>
            Modifica los detalles de la venta. Los cambios se registran en el historial.
          </div>

          <!-- INFO AUDITORÍA -->
          <div id="ev-audit-info" class="notif notif-pu" style="margin-bottom:15px;display:none;">
            <!-- Llenado dinámicamente -->
          </div>

          <!-- PRODUCTO -->
          <div class="fg">
            <label>Producto</label>
            <select id="ev-producto-id" onchange="onEditProductoChange()">
              <option value="">Seleccionar producto...</option>
            </select>
          </div>

          <!-- CLIENTE -->
          <div class="fg2">
            <div class="fg">
              <label>Cliente</label>
              <select id="ev-cliente-id" onchange="onEditClienteChange()">
                <option value="">Consumidor final</option>
              </select>
            </div>
            <div class="fg">
              <label>O ingresar nombre</label>
              <input type="text" id="ev-cliente-nombre" placeholder="Nombre cliente"/>
            </div>
          </div>

          <!-- CANTIDAD Y PRECIO -->
          <div class="fg2">
            <div class="fg">
              <label>Cantidad</label>
              <input type="number" id="ev-cantidad" value="1" min="1" oninput="recalcularTotalEdicion()"/>
            </div>
            <div class="fg">
              <label>Precio unitario ($)</label>
              <input type="number" id="ev-precio" value="0" min="0" step="0.01" oninput="recalcularTotalEdicion()"/>
            </div>
          </div>

          <!-- CONJUNTO (OPCIONAL) -->
          <div class="fg2">
            <div class="fg">
              <label>ID Conjunto</label>
              <input type="text" id="ev-conjunto-id" placeholder="ej: CONJ1" style="font-size:12px;"/>
            </div>
            <div class="fg">
              <label>Tipo Conjunto</label>
              <input type="text" id="ev-tipo-conjunto" placeholder="ej: REMERA" style="font-size:12px;"/>
            </div>
          </div>

          <!-- TOTAL CON DESCUENTO -->
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

          <!-- MÉTODO DE PAGO -->
          <div class="fg">
            <label>Método de pago</label>
            <select id="ev-metodo-pago">
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="debito">Débito</option>
              <option value="credito">Crédito</option>
              <option value="mercadopago">Mercado Pago</option>
              <option value="mixto">Mixto</option>
              <option value="cuenta_corriente">Cuenta corriente</option>
            </select>
          </div>

          <!-- FECHA Y HORA -->
          <div class="fg2">
            <div class="fg">
              <label>Fecha</label>
              <input type="date" id="ev-fecha"/>
            </div>
            <div class="fg">
              <label>Hora</label>
              <input type="time" id="ev-hora"/>
            </div>
          </div>

          <!-- OBSERVACIONES -->
          <div class="fg">
            <label>Observaciones</label>
            <textarea id="ev-obs" rows="2" placeholder="Notas sobre la venta..."></textarea>
          </div>

          <!-- CAMBIOS DETECTADOS -->
          <div id="ev-cambios-resumen" style="background:var(--ambg);border:0.5px solid var(--ambr);border-radius:9px;padding:10px 12px;margin-top:15px;display:none;font-size:12px;">
            <div style="font-weight:500;color:var(--am);margin-bottom:8px;">Cambios detectados:</div>
            <div id="ev-cambios-list" style="color:var(--am);"></div>
          </div>
        </div>

        <div class="mf">
          <button class="btn btn-out" onclick="closeOv('ov-editar-venta')">Cancelar</button>
          <button class="btn btn-rj" id="ev-btn-eliminar" onclick="confirmarEliminarVenta()" style="display:none;">
            <i class="ti ti-trash"></i> Eliminar
          </button>
          <button class="btn btn-ng" onclick="guardarCambiosVenta()">
            <i class="ti ti-check"></i> Guardar cambios
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);
  llenarSelectosEdicionVenta();
  
  return document.getElementById('ov-editar-venta');
}

/**
 * Llena los selectores de productos y clientes
 */
function llenarSelectosEdicionVenta() {
  // Productos
  const selectProducto = document.getElementById('ev-producto-id');
  if (selectProducto) {
    DB.productos.forEach(p => {
      const option = document.createElement('option');
      option.value = p.id;
      option.textContent = `${p.nombre} (${p.codigo})`;
      selectProducto.appendChild(option);
    });
  }

  // Clientes
  const selectCliente = document.getElementById('ev-cliente-id');
  if (selectCliente) {
    DB.clientes.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.nombre;
      selectCliente.appendChild(option);
    });
  }
}

/**
 * Recalcula el total cuando cambia cantidad, precio o campos de conjunto
 * Aplica descuentos por conjuntos automáticamente
 */
function recalcularTotalEdicion() {
  const cantidad = parseFloat(document.getElementById('ev-cantidad').value) || 0;
  const precio = parseFloat(document.getElementById('ev-precio').value) || 0;
  const conjuntoId = document.getElementById('ev-conjunto-id').value;
  const tipoConjunto = document.getElementById('ev-tipo-conjunto').value;

  // Calcular subtotal base
  const subtotal = cantidad * precio;
  const originalTotal = ventaOriginal?.total || 0;

  // Crear objeto producto para aplicar descuentos
  const producto = {
    id: parseInt(document.getElementById('ev-producto-id').value) || 0,
    nombre: DB.productos.find(p => p.id === parseInt(document.getElementById('ev-producto-id').value))?.nombre || 'Producto',
    precio: precio,
    cantidad: cantidad,
    conjuntoId: conjuntoId || null,
    tipoConjunto: tipoConjunto || null
  };

  // Aplicar descuentos por conjuntos si existe tanto conjuntoId como tipoConjunto
  let descuentoConjunto = 0;
  let descuentoInfo = '';
  let totalConDescuento = subtotal;

  if (conjuntoId && tipoConjunto) {
    // Crear array con el producto para aplicar la lógica de conjuntos
    const productos = [producto];
    const resultado = aplicarDescuentoPorConjunto(productos);
    
    if (resultado.descuentoConjuntoAplicado) {
      descuentoConjunto = resultado.descuentoTotal;
      totalConDescuento = subtotal - descuentoConjunto;
      const detalles = resultado.detalles[0];
      if (detalles) {
        descuentoInfo = `Conjunto: -${formatearMoney(descuentoConjunto)} (10%)`;
      }
    }
  }

  // Mostrar valores
  document.getElementById('ev-subtotal').textContent = formatearMoney(subtotal);
  document.getElementById('ev-total').textContent = formatearMoney(totalConDescuento);
  
  if (descuentoInfo) {
    document.getElementById('ev-descuento-info').textContent = descuentoInfo;
  } else {
    document.getElementById('ev-descuento-info').textContent = '';
  }

  // Mostrar diferencia respecto al original
  const diferencia = totalConDescuento - originalTotal;
  const diffEl = document.getElementById('ev-diferencia');
  
  if (Math.abs(diferencia) > 0.01) {
    const signo = diferencia > 0 ? '+' : '';
    diffEl.innerHTML = `Cambio: <strong style="color:${diferencia > 0 ? '#22c55e' : '#ef4444'}">${signo}${formatearMoney(diferencia)}</strong>`;
  } else {
    diffEl.innerHTML = 'Sin cambios';
  }

  // Detectar otros cambios
  detectarCambios(totalConDescuento);
}

/**
 * Detecta todos los cambios realizados
 */
function detectarCambios(totalNuevo) {
  const cambios = [];
  const productoId = parseInt(document.getElementById('ev-producto-id').value);
  const clienteId = parseInt(document.getElementById('ev-cliente-id').value) || null;
  const clienteNombre = document.getElementById('ev-cliente-nombre').value;
  const cantidad = parseFloat(document.getElementById('ev-cantidad').value);
  const precio = parseFloat(document.getElementById('ev-precio').value);
  const metodo = document.getElementById('ev-metodo-pago').value;
  const fecha = document.getElementById('ev-fecha').value;
  const hora = document.getElementById('ev-hora').value;
  const obs = document.getElementById('ev-obs').value;
  const conjuntoId = document.getElementById('ev-conjunto-id').value;
  const tipoConjunto = document.getElementById('ev-tipo-conjunto').value;

  // Comparar con original
  if (productoId !== ventaOriginal.producto) cambios.push(`Producto: ${DB.productos.find(p=>p.id===ventaOriginal.producto)?.nombre || 'N/A'} → ${DB.productos.find(p=>p.id===productoId)?.nombre || 'N/A'}`);
  if (clienteNombre !== ventaOriginal.cliente) cambios.push(`Cliente: ${ventaOriginal.cliente} → ${clienteNombre}`);
  if (cantidad !== ventaOriginal.cantidad) cambios.push(`Cantidad: ${ventaOriginal.cantidad} → ${cantidad}`);
  if (Math.abs(precio - (ventaOriginal.precio_unitario || 0)) > 0.01) cambios.push(`Precio: ${formatearMoney(ventaOriginal.precio_unitario)} → ${formatearMoney(precio)}`);
  if (Math.abs(totalNuevo - ventaOriginal.total) > 0.01) cambios.push(`Total: ${formatearMoney(ventaOriginal.total)} → ${formatearMoney(totalNuevo)}`);
  if (metodo !== ventaOriginal.metodo_pago) cambios.push(`Método: ${ventaOriginal.metodo_pago} → ${metodo}`);
  if (fecha !== (ventaOriginal.fecha_iso || todayShort().split('/').reverse().join('-'))) cambios.push(`Fecha: ${ventaOriginal.fecha} → ${fecha}`);
  if (hora !== ventaOriginal.hora) cambios.push(`Hora: ${ventaOriginal.hora} → ${hora}`);
  if (obs !== ventaOriginal.observaciones) cambios.push(`Observaciones: Modificadas`);
  if ((conjuntoId || '') !== (ventaOriginal.conjuntoId || '')) cambios.push(`Conjunto: ${ventaOriginal.conjuntoId || 'Ninguno'} → ${conjuntoId || 'Ninguno'}`);
  if ((tipoConjunto || '') !== (ventaOriginal.tipoConjunto || '')) cambios.push(`Tipo: ${ventaOriginal.tipoConjunto || 'Ninguno'} → ${tipoConjunto || 'Ninguno'}`);

  // Mostrar cambios
  const resumenEl = document.getElementById('ev-cambios-resumen');
  const listEl = document.getElementById('ev-cambios-list');
  
  if (cambios.length > 0) {
    resumenEl.style.display = 'block';
    listEl.innerHTML = cambios.map(c => `<div style="margin-bottom:4px;">• ${c}</div>`).join('');
  } else {
    resumenEl.style.display = 'none';
  }
}

/**
 * Evento cuando cambia el producto
 */
function onEditProductoChange() {
  const productoId = parseInt(document.getElementById('ev-producto-id').value);
  const producto = DB.productos.find(p => p.id === productoId);
  
  if (producto) {
    document.getElementById('ev-precio').value = producto.precio;
    recalcularTotalEdicion();
  }
}

/**
 * Evento cuando cambia el cliente
 */
function onEditClienteChange() {
  const clienteId = parseInt(document.getElementById('ev-cliente-id').value);
  const cliente = DB.clientes.find(c => c.id === clienteId);
  
  if (cliente) {
    document.getElementById('ev-cliente-nombre').value = cliente.nombre;
    recalcularTotalEdicion();
  }
}

/**
 * Guarda los cambios en la venta
 */
function guardarCambiosVenta() {
  if (!editingVentaId || !ventaOriginal) {
    alert("Error: No hay venta en edición");
    return;
  }

  const productoId = parseInt(document.getElementById('ev-producto-id').value);
  const clienteId = parseInt(document.getElementById('ev-cliente-id').value) || null;
  const clienteNombre = document.getElementById('ev-cliente-nombre').value || 'Consumidor final';
  const cantidad = parseFloat(document.getElementById('ev-cantidad').value) || 1;
  const precio = parseFloat(document.getElementById('ev-precio').value) || 0;
  const conjuntoId = document.getElementById('ev-conjunto-id').value || null;
  const tipoConjunto = document.getElementById('ev-tipo-conjunto').value || null;
  const metodo = document.getElementById('ev-metodo-pago').value;
  const fecha = document.getElementById('ev-fecha').value;
  const hora = document.getElementById('ev-hora').value;
  const obs = document.getElementById('ev-obs').value;

  if (!productoId) {
    alert("Selecciona un producto");
    return;
  }

  // Calcular total final (con descuentos por conjuntos)
  const producto = {
    id: productoId,
    nombre: DB.productos.find(p => p.id === productoId)?.nombre || 'Producto',
    precio: precio,
    cantidad: cantidad,
    conjuntoId: conjuntoId,
    tipoConjunto: tipoConjunto
  };

  let totalFinal = cantidad * precio;
  let descuentoConjuntoMonto = 0;

  // Aplicar descuentos si existe conjunto completo
  if (conjuntoId && tipoConjunto) {
    const resultado = aplicarDescuentoPorConjunto([producto]);
    if (resultado.descuentoConjuntoAplicado) {
      descuentoConjuntoMonto = resultado.descuentoTotal;
      totalFinal = (cantidad * precio) - descuentoConjuntoMonto;
    }
  }

  // Calcular diferencia de totales para ajustar cajas
  const diferencia = totalFinal - ventaOriginal.total;

  // Actualizar venta en la base
  const ventaIdx = DB.ventas.findIndex(v => v.id === editingVentaId);
  if (ventaIdx >= 0) {
    // Convertir fecha ISO a formato dd/mm si es necesario
    let fechaDisplay = fecha;
    if (fecha && fecha.includes('-')) {
      const fp = fecha.split('-');
      fechaDisplay = fp[2]+'/'+fp[1]+'/'+fp[0];
    }
    const fechaCorta = fechaDisplay.substring(0,5); // dd/mm

    const ventaActualizada = {
      ...DB.ventas[ventaIdx],
      producto: productoId,
      cliente_id: clienteId,
      cliente: clienteNombre,
      cantidad,
      precio_unitario: precio,
      total: totalFinal,
      fecha: fechaCorta,
      conjuntoId: conjuntoId,
      tipoConjunto: tipoConjunto,
      descuentoConjunto: descuentoConjuntoMonto,
      metodo_pago: metodo,
      metodo: metodo,
      fecha_iso_editado: fecha,
      hora,
      observaciones: obs,
      editada_en: new Date().toISOString(),
      editada_por: 'usuario',
      historial_cambios: [
        ...(ventaOriginal.historial_cambios || []),
        {
          fecha: new Date().toISOString(),
          cambios: {
            antes: {
              total: ventaOriginal.total,
              metodo_pago: ventaOriginal.metodo_pago,
              cliente: ventaOriginal.cliente,
              cantidad: ventaOriginal.cantidad,
              precio_unitario: ventaOriginal.precio_unitario,
              conjuntoId: ventaOriginal.conjuntoId,
              tipoConjunto: ventaOriginal.tipoConjunto,
              descuentoConjunto: ventaOriginal.descuentoConjunto
            },
            ahora: {
              total: totalFinal,
              metodo_pago: metodo,
              cliente: clienteNombre,
              cantidad,
              precio_unitario: precio,
              conjuntoId,
              tipoConjunto,
              descuentoConjunto: descuentoConjuntoMonto
            }
          }
        }
      ]
    };
    DB.ventas[ventaIdx] = ventaActualizada;
  }

  // Registrar movimiento de ajuste si hay diferencia
  if (Math.abs(diferencia) > 0.01) {
    registrarMovimientoAjusteVenta(
      editingVentaId,
      diferencia,
      ventaOriginal.total,
      totalFinal,
      ventaOriginal.metodo_pago,
      metodo
    );
  }

  // Guardar en base
  persistDBSoon();

  // Mostrar confirmación
  const mensaje = Math.abs(diferencia) > 0.01 
    ? `Venta #${editingVentaId} actualizada.\nCambio en total: ${diferencia > 0 ? '+' : ''}${formatearMoney(diferencia)}`
    : `Venta #${editingVentaId} actualizada correctamente.`;
  
  alert(mensaje);

  // Cerrar modal y refrescar
  closeOv('ov-editar-venta');
  editingVentaId = null;
  ventaOriginal = null;

  // Actualizar vista según donde se haya abierto
  if (editVentaEnHistorial && typeof renderHistorialVentas === 'function') {
    renderHistorialVentas();
  } else if (typeof actualizarDashboard === 'function') {
    actualizarDashboard();
  }

  editVentaEnHistorial = false;
}

/**
 * Registra el movimiento de ajuste cuando cambia el total de una venta
 */
function registrarMovimientoAjusteVenta(ventaId, diferencia, totalAnterior, totalNuevo, metodoAnterior, metodoNuevo) {
  if (!DB.movimientos) {
    DB.movimientos = [];
  }

  const movimiento = {
    id: nextId(DB.movimientos),
    fecha: todayShort(),
    fecha_iso: toDateInput(),
    hora: hora(),
    tipo: 'ajuste_venta',
    concepto: `Ajuste venta #${ventaId}`,
    metodo: metodoNuevo,
    monto: Math.abs(diferencia),
    signo: diferencia > 0 ? 1 : -1,
    caja: 'principal',
    venta_id: ventaId,
    detalles: {
      venta_id: ventaId,
      total_anterior: totalAnterior,
      total_nuevo: totalNuevo,
      diferencia,
      metodo_anterior: metodoAnterior,
      metodo_nuevo: metodoNuevo
    },
    creado_en: new Date().toISOString()
  };

  DB.movimientos.unshift(movimiento);
}

/**
 * Abre confirmación para eliminar una venta
 */
function confirmarEliminarVenta() {
  if (!editingVentaId) return;

  if (confirm(`⚠️ ¿Estás SEGURO de que deseas ELIMINAR la venta #${editingVentaId}?\n\nEsta acción es IRREVERSIBLE y se registrará en el historial.`)) {
    eliminarVentaConfirmada();
  }
}

/**
 * Elimina la venta de forma permanente
 */
function eliminarVentaConfirmada() {
  const ventaIdx = DB.ventas.findIndex(v => v.id === editingVentaId);
  if (ventaIdx < 0) {
    alert("Venta no encontrada");
    return;
  }

  const venta = DB.ventas[ventaIdx];

  // Registrar movimiento de reversión
  registrarMovimientoAjusteVenta(
    editingVentaId,
    -venta.total,
    venta.total,
    0,
    venta.metodo_pago,
    'reversión'
  );

  // Marcar como eliminada en lugar de borrar
  DB.ventas[ventaIdx].eliminada = true;
  DB.ventas[ventaIdx].eliminada_en = new Date().toISOString();

  // Guardar en base
  persistDBSoon();

  alert(`Venta #${editingVentaId} marcada como eliminada. Se registró movimiento de reversión.`);

  // Cerrar modal
  closeOv('ov-editar-venta');
  editingVentaId = null;
  ventaOriginal = null;

  // Actualizar vista
  if (editVentaEnHistorial && typeof renderHistorialVentas === 'function') {
    renderHistorialVentas();
  } else if (typeof actualizarDashboard === 'function') {
    actualizarDashboard();
  }

  editVentaEnHistorial = false;
}

/**
 * Añade botones de edición a las filas de ventas
 */
function agregarBotonesEditarVentas(selector = '.venta-item') {
  const ventaItems = document.querySelectorAll(selector);
  ventaItems.forEach((item) => {
    if (!item.querySelector('.venta-item-edit-btn')) {
      const ventaMeta = item.querySelector('.venta-item-meta')?.textContent || '';
      const match = ventaMeta.match(/#(\d+)/);
      const ventaId = match ? parseInt(match[1]) : null;
      
      if (ventaId) {
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = 'display:flex;gap:6px;align-items:center;';
        
        const btn = document.createElement('button');
        btn.className = 'venta-item-edit-btn btn-ghost btn-sm';
        btn.innerHTML = '<i class="ti ti-edit" style="font-size:14px;"></i>';
        btn.onclick = () => editarVenta(ventaId, true);
        btn.title = 'Editar venta';
        
        btnContainer.appendChild(btn);
        item.appendChild(btnContainer);
      }
    }
  });
}
