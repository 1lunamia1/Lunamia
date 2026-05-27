/* ════════════════════════════════════════
   DASHBOARD - FUNCIONALIDAD
════════════════════════════════════════ */

// Cargar el dashboard al iniciar
function cargarDashboard() {
  fetch('dashboard.html')
    .then(r => r.text())
    .then(html => {
      const mainArea = document.getElementById('main-area');
      mainArea.innerHTML = html;
      
      // Cargar estilos del dashboard
      if (!document.getElementById('dashboard-css')) {
        const link = document.createElement('link');
        link.id = 'dashboard-css';
        link.rel = 'stylesheet';
        link.href = 'dashboard.css';
        document.head.appendChild(link);
      }
      
      actualizarDashboard();
    });
}

// Actualizar datos del dashboard
async function actualizarDashboard() {
  // Actualizar fecha
  const hoy = new Date();
  const opciones = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  const fechaFormato = hoy.toLocaleDateString('es-AR', opciones);
  const dashFecha = document.getElementById('dash-fecha');
  if (dashFecha) dashFecha.textContent = fechaFormato.charAt(0).toUpperCase() + fechaFormato.slice(1);
  
  // Obtener datos de la base de datos (ejemplo local)
  const datos = await obtenerDatosResumen();
  
  // Actualizar KPIs
  if (document.getElementById('kpi-ventas-hoy')) {
    document.getElementById('kpi-ventas-hoy').textContent = formatearMoney(datos.ventasHoy);
    document.getElementById('kpi-ventas-qty').textContent = datos.cantVentas + ' venta' + (datos.cantVentas !== 1 ? 's' : '');
  }
  
  if (document.getElementById('kpi-caja')) {
    document.getElementById('kpi-caja').textContent = formatearMoney(datos.cajaSaldo);
  }
  
  if (document.getElementById('kpi-deudas')) {
    document.getElementById('kpi-deudas').textContent = formatearMoney(datos.deudaTotal);
    document.getElementById('kpi-deudas-qty').textContent = datos.cantDeudores + ' cliente' + (datos.cantDeudores !== 1 ? 's' : '');
  }
  
  if (document.getElementById('kpi-productos')) {
    document.getElementById('kpi-productos').textContent = datos.cantProductos;
  }
  
  // Cargar últimas ventas
  cargarUltimasVentas();
  
  // Cargar deudores
  cargarDeudores();
}

// Obtener datos de resumen (simulado)
async function obtenerDatosResumen() {
  // En producción, esto vendría de Supabase
  // Por ahora retornamos datos de ejemplo
  return {
    ventasHoy: 45000,
    cantVentas: 3,
    cajaSaldo: 125500,
    deudaTotal: 38000,
    cantDeudores: 2,
    cantProductos: 47
  };
}

// Cargar últimas ventas
function cargarUltimasVentas() {
  const listElement = document.getElementById('dash-ventas-list');
  
  // Datos de ejemplo (en producción sería de Supabase)
  const ventasEjemplo = [
    { id: 1, cliente: 'Consumidor final', monto: 15000, hora: '14:32' },
    { id: 2, cliente: 'Rocío García', monto: 18500, hora: '13:15' },
    { id: 3, cliente: 'Martín López', monto: 11500, hora: '11:47' }
  ];
  
  if (ventasEjemplo.length === 0) {
    listElement.innerHTML = `
      <div style="text-align: center; color: var(--gt); padding: 30px 20px; font-size: 13px;">
        <i class="ti ti-inbox" style="display: block; font-size: 32px; margin-bottom: 10px; opacity: 0.5;"></i>
        Sin ventas registradas
      </div>
    `;
    return;
  }
  
  let html = '';
  ventasEjemplo.forEach(venta => {
    html += `
      <div class="venta-item">
        <div class="venta-item-info">
          <div class="venta-item-cliente">${venta.cliente}</div>
          <div class="venta-item-meta">Venta #${venta.id} · ${venta.hora}</div>
        </div>
        <div class="venta-item-monto">${formatearMoney(venta.monto)}</div>
      </div>
    `;
  });
  
  listElement.innerHTML = html;
}

// Cargar clientes con deuda
function cargarDeudores() {
  const listElement = document.getElementById('dash-deudores-list');
  
  // Datos de ejemplo
  const deudoresEjemplo = [
    { id: 1, nombre: 'Empresa A SRL', deuda: 25000, dias: 15 },
    { id: 2, nombre: 'Rocío García', deuda: 13000, dias: 8 }
  ];
  
  if (deudoresEjemplo.length === 0) {
    listElement.innerHTML = `
      <div style="text-align: center; color: var(--gt); padding: 20px; font-size: 13px;">
        <i class="ti ti-check-circle" style="display: block; font-size: 24px; margin-bottom: 8px; color: var(--vd);"></i>
        Todos los clientes al día
      </div>
    `;
    return;
  }
  
  let html = '';
  deudoresEjemplo.forEach(deudor => {
    html += `
      <div class="deudor-item">
        <div class="deudor-info">
          <div class="deudor-nombre">${deudor.nombre}</div>
          <div class="deudor-meta">${deudor.dias} días de atraso</div>
        </div>
        <div style="display: flex; align-items: center;">
          <div class="deudor-monto">${formatearMoney(deudor.deuda)}</div>
          <button class="deudor-action" onclick="abrirPagoCli('${deudor.id}')">Registrar pago</button>
        </div>
      </div>
    `;
  });
  
  listElement.innerHTML = html;
}

// Funciones auxiliares
function formatearMoney(monto) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(monto);
}

// Abrir venta (placeholder)
function abrirVenta() {
  alert('Función de nueva venta - próximamente integrada');
}

// Ir a ventas (placeholder)
function irAVentas() {
  alert('Ver todas las ventas - próximamente integrada');
}

// Abrir pago de cliente (placeholder)
function abrirPagoCli(clienteId) {
  alert('Registrar pago para cliente ID: ' + clienteId);
  // Aquí se abriría el modal de pago del cliente
}

// Iniciar dashboard cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
  // El dashboard se cargará después del login
  // Se llamará a cargarDashboard() desde app.js
});
