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
  const mensajes = [
    "Buen día Andrea, hoy es un gran día para crecer.",
    "Buen día Andrea, cada venta empieza con una buena energía.",
    "Buen día Andrea, orden y foco para una jornada brillante.",
    "Buen día Andrea, tu constancia también viste a Luna Mia.",
    "Buen día Andrea, hoy puede llegar esa clienta ideal.",
    "Buen día Andrea, que la tienda fluya simple, linda y rentable.",
    "Buen día Andrea, pequeños detalles hacen grande la experiencia."
  ];
  const daily = document.getElementById("daily-message-text");
  if(daily) daily.textContent = mensajes[hoy.getDay() % mensajes.length];
  
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

  actualizarEstadoDatos();
  
  // Cargar últimas ventas
  cargarUltimasVentas();
  
  // Cargar deudores
  cargarDeudores();

  actualizarAvisoImportacion();
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
  const ventasHoy = db.ventas.filter(v => v.fecha === fechaHoy && !v.eliminada);
  return {
    ventasHoy: ventasHoy.reduce((a,v)=>a+(v.total||0),0),
    cantVentas: ventasHoy.length,
    cajaSaldo: typeof totalCaja === "function" ? totalCaja("principal") : 0,
    deudaTotal: db.clientes.reduce((a,c)=>a+(c.deuda||0),0),
    cantDeudores: db.clientes.filter(c=>(c.deuda||0)>0).length,
    cantProductos: db.productos.length
  };
}

function conteoDB(db, key){
  return Array.isArray(db?.[key]) ? db[key].length : 0;
}

function datosCoincidenConExcel(db){
  const initial = window.LUNAMIA_INITIAL_DB;
  const summary = window.LUNAMIA_IMPORT_SUMMARY;
  if(!db) return false;
  if(initial){
    return db.meta?.fuente === initial.meta?.fuente &&
      conteoDB(db,"clientes") === conteoDB(initial,"clientes") &&
      conteoDB(db,"productos") === conteoDB(initial,"productos") &&
      conteoDB(db,"ventas") === conteoDB(initial,"ventas") &&
      conteoDB(db,"movimientos") === conteoDB(initial,"movimientos");
  }
  if(summary){
    return db.meta?.fuente === summary.fuente &&
      conteoDB(db,"clientes") === summary.clientes &&
      conteoDB(db,"productos") === summary.productos &&
      conteoDB(db,"ventas") === summary.ventas &&
      conteoDB(db,"movimientos") === summary.movimientos;
  }
  return false;
}

function actualizarEstadoDatos(){
  const db = typeof DB !== "undefined" ? DB : null;
  if(!db) return;
  const initial = window.LUNAMIA_INITIAL_DB;
  const summary = window.LUNAMIA_IMPORT_SUMMARY;
  const matchExcel = datosCoincidenConExcel(db);
  const supabaseOn = typeof SUPABASE_ON !== "undefined" && SUPABASE_ON;
  const synced = typeof remoteReady !== "undefined" && remoteReady;
  const source = db.meta?.fuente || "Base existente";
  const expectedSource = initial?.meta?.fuente || summary?.fuente || "Excel";
  const badge = document.getElementById("dash-data-badge");
  const msg = document.getElementById("dash-data-message");
  const importBtn = document.getElementById("dash-data-import-btn");
  const cajaNote = document.getElementById("dash-data-caja-note");

  document.getElementById("dash-data-source").textContent = source;
  document.getElementById("dash-data-clientes").textContent = conteoDB(db,"clientes");
  document.getElementById("dash-data-productos").textContent = conteoDB(db,"productos");
  document.getElementById("dash-data-ventas").textContent = conteoDB(db,"ventas");
  document.getElementById("dash-data-movimientos").textContent = conteoDB(db,"movimientos");
  document.getElementById("dash-data-sync").textContent = supabaseOn ? (synced ? "Conectado" : "Pendiente") : "Local";

  if(matchExcel && supabaseOn && synced){
    badge.textContent = "Excel sincronizado";
    badge.className = "data-badge ok";
    msg.textContent = `La app está usando los datos importados de ${expectedSource} y la base está conectada a Supabase.`;
  }else if(matchExcel){
    badge.textContent = "Excel local";
    badge.className = "data-badge warn";
    msg.textContent = `Los datos del Excel están cargados en la app, pero todavía no hay confirmación de sincronización remota.`;
  }else if(initial){
    badge.textContent = "Importación pendiente";
    badge.className = "data-badge warn";
    msg.textContent = `Supabase tiene una base distinta o incompleta. Podés importar ${expectedSource} para reemplazarla con los datos preparados.`;
  }else if(summary){
    badge.textContent = "Revisar Supabase";
    badge.className = "data-badge warn";
    msg.textContent = `La base activa no coincide con el resumen importado de ${expectedSource}. El Excel privado no se publica en GitHub Pages; la importación se hace en un entorno privado.`;
  }else{
    badge.textContent = "Sin Excel";
    badge.className = "data-badge warn";
    msg.textContent = "No se encontró el archivo de importación preparado.";
  }

  if(importBtn) importBtn.style.display = initial && !matchExcel ? "inline-flex" : "none";
  if(cajaNote){
    const efectivo = summary?.cajaEfectivoInicial ?? db.cajas?.principal?.efectivo ?? 0;
    cajaNote.textContent = efectivo < 0 ? `Revisar caja: el Excel dejó efectivo inicial negativo (${formatearMoney(efectivo)}).` : "";
  }
}

function actualizarAvisoImportacion(){
  const importAlert = document.getElementById("dash-importar-excel");
  if(importAlert){
    importAlert.style.display = window.LUNAMIA_INITIAL_DB && !datosCoincidenConExcel(DB) ? "flex" : "none";
  }
}

// Cargar últimas ventas
function cargarUltimasVentas() {
  const listElement = document.getElementById('dash-ventas-list');
  const db = typeof DB !== "undefined" ? DB : null;
  const ventas = db ? db.ventas.filter(v => !v.eliminada).slice(0,5) : [];

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
      <div class="venta-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:0.5px solid var(--crb);">
        <div class="venta-item-info" style="flex:1;">
          <div class="venta-item-cliente">${venta.cliente}</div>
          <div class="venta-item-meta">Venta #${venta.id} · ${venta.hora}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div class="venta-item-monto">${formatearMoney(venta.total)}</div>
          <button class="btn-ghost btn-sm" onclick="editarVenta(${venta.id}, false)" title="Editar venta" style="padding:4px 8px;">
            <i class="ti ti-edit" style="font-size:14px;"></i>
          </button>
        </div>
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
    ? db.clientes.filter(c=>(c.deuda||0)>0 || c.estado==="proximo").sort((a,b)=>(b.deuda||0)-(a.deuda||0)).slice(0,8)
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
          <div class="deudor-meta">${deudor.estado === "vencida" ? "Vencida" : deudor.estado === "proximo" ? "Por vencer" : "Saldo pendiente"}</div>
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
