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
  
  // Obtener datos de la base cargada por la app principal
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

// Obtener datos de resumen desde la base cargada en app.js
async function obtenerDatosResumen() {
  const db = typeof DB !== "undefined" ? DB : null;
  if(!db){
    return {ventasHoy:0,cantVentas:0,cajaSaldo:0,deudaTotal:0,cantDeudores:0,cantProductos:0};
  }
  const fechaHoy = typeof todayShort === "function"
    ? todayShort()
    : new Date().toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"}).replace("/", "/");
  const ventasHoy = db.ventas.filter(v => v.fecha === fechaHoy);
  return {
    ventasHoy: ventasHoy.reduce((a,v)=>a+(v.total||0),0),
    cantVentas: ventasHoy.length,
    cajaSaldo: typeof totalCaja === "function" ? totalCaja("principal") : 0,
    deudaTotal: db.clientes.reduce((a,c)=>a+(c.deuda||0),0),
    cantDeudores: db.clientes.filter(c=>(c.deuda||0)>0).length,
    cantProductos: db.productos.length
  };
}

// Cargar últimas ventas
function cargarUltimasVentas() {
  const listElement = document.getElementById('dash-ventas-list');
  const db = typeof DB !== "undefined" ? DB : null;
  const ventas = db ? db.ventas.slice(0,5) : [];

  if (ventas.length === 0) {
    listElement.innerHTML = `
      <div style="text-align: center; color: var(--gt); padding: 30px 20px; font-size: 13px;">
        <i class="ti ti-inbox" style="display: block; font-size: 32px; margin-bottom: 10px; opacity: 0.5;"></i>
        Sin ventas registradas
      </div>
    `;
    return;
  }
  
  let html = '';
  ventas.forEach(venta => {
    html += `
      <div class="venta-item">
        <div class="venta-item-info">
          <div class="venta-item-cliente">${venta.cliente}</div>
          <div class="venta-item-meta">Venta #${venta.id} · ${venta.hora}</div>
        </div>
        <div class="venta-item-monto">${formatearMoney(venta.total)}</div>
      </div>
    `;
  });
  
  listElement.innerHTML = html;
}

// Cargar clientes con deuda
function cargarDeudores() {
  const listElement = document.getElementById('dash-deudores-list');
  const db = typeof DB !== "undefined" ? DB : null;
  const deudores = db
    ? db.clientes.filter(c=>(c.deuda||0)>0).sort((a,b)=>(b.deuda||0)-(a.deuda||0)).slice(0,5)
    : [];

  if (deudores.length === 0) {
    listElement.innerHTML = `
      <div style="text-align: center; color: var(--gt); padding: 20px; font-size: 13px;">
        <i class="ti ti-check-circle" style="display: block; font-size: 24px; margin-bottom: 8px; color: var(--vd);"></i>
        Todos los clientes al día
      </div>
    `;
    return;
  }
  
  let html = '';
  deudores.forEach(deudor => {
    html += `
      <div class="deudor-item">
        <div class="deudor-info">
          <div class="deudor-nombre">${deudor.nombre}</div>
          <div class="deudor-meta">${deudor.estado === "vencida" ? "Vencida" : "Saldo pendiente"}</div>
        </div>
        <div style="display: flex; align-items: center;">
          <div class="deudor-monto">${formatearMoney(deudor.deuda)}</div>
          <button class="deudor-action" onclick="abrirPagoCli(${deudor.id})">Registrar pago</button>
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

// Iniciar dashboard cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', function() {
  // El dashboard se cargará después del login
  // Se llamará a cargarDashboard() desde app.js
});
