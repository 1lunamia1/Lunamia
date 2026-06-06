/* ═══════════════════════════════════════════════════
   DATOS GLOBALES
═══════════════════════════════════════════════════ */
const COLORES=["Negro","Blanco","Azul","Rojo","Gris","Beige","Verde","Rosa","Kaki","Celeste","Rust","Naranja","Único"];
const TALLES=["1","2","3","4","5","6","7","8","XS","S","M","L","XL","XXL","3XL","4XL","5XL","34","36","38","40","42","44","46","48","50","52","54","Único"];
const CAT_MAP={PAN:"Pantalones",BUZ:"Buzos",CAM:"Camperas",REM:"Remeras"};
const GEN_MAP={DAM:"Dama",CAB:"Caballero"};
const AV_COLS=["av-az","av-te","av-am","av-pu","av-vd"];

function emptyDB(){
  return {
    productos:[],categorias:[],clientes:[],
    cajas:{principal:{efectivo:0,mercadopago:0,debito:0,credito:0},reinversion:{efectivo:0,mercadopago:0,debito:0,credito:0}},
    movimientos:[],gastos:[],transferencias:[],ventas:[],devoluciones:[],proveedores:[],cierres:[],analytics:{reposicion:[],oferta:[]},meta:{}
  };
}
function cloneData(data){return JSON.parse(JSON.stringify(data));}
let DB = cloneData(window.LUNAMIA_INITIAL_DB || emptyDB());

/* ── SUPABASE / PERSISTENCIA ── */
const RAW_CONFIG = window.LUNAMIA_CONFIG || {};
const SUPABASE_URL = (RAW_CONFIG.SUPABASE_URL || "").replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");
const SUPABASE_KEY = RAW_CONFIG.SUPABASE_ANON_KEY || RAW_CONFIG.SUPABASE_PUBLISHABLE_KEY || "";
const SUPABASE_ON = Boolean(SUPABASE_URL && SUPABASE_KEY);
let sbClient = null;
let remoteReady = false;
let saveTimer = null;

function isValidDB(data){
  return data && Array.isArray(data.productos) && Array.isArray(data.clientes) && data.cajas;
}
function isDemoDB(data){
  return data && Array.isArray(data.productos) && data.productos.length===10 && data.productos.some(p=>p.nombre==="Jean Baggy Tokio");
}

function setSyncStatus(text){
  const el=document.getElementById("sync-status");
  if(el)el.textContent=text;
}

function showApp(){
  const app=document.querySelector(".app");
  const auth=document.getElementById("auth-screen");
  if(app)app.style.display="flex";
  if(auth)auth.remove();
  const out=document.getElementById("logout-btn");
  if(out)out.style.display=SUPABASE_ON?"inline-flex":"none";
}

function showLogin(message=""){
  const app=document.querySelector(".app");
  if(app)app.style.display="none";
  let screen=document.getElementById("auth-screen");
  if(!screen){
    screen=document.createElement("div");
    screen.id="auth-screen";
    screen.className="auth-screen";
    document.body.prepend(screen);
  }
  screen.innerHTML=`
    <form class="auth-card" onsubmit="loginSupabase(event)">
      <img src="assets/logo.svg" alt="Luna Mia Indumentaria" class="auth-logo" />
      <div class="auth-title">Luna Mia</div>
      <div class="auth-sub">Sistema de gestión de Luna Mia Indumentaria.</div>
      <div class="auth-error${message?" on":""}" id="auth-error">${message}</div>
      <div class="fg"><label>Email</label><input type="text" id="auth-email" autocomplete="email" required /></div>
      <div class="fg"><label>Contraseña</label><input type="password" id="auth-pass" autocomplete="current-password" required /></div>
      <button class="btn btn-ng" id="auth-submit" style="width:100%;justify-content:center;" type="submit">Ingresar</button>
    </form>`;
}

async function loginSupabase(ev){
  ev.preventDefault();
  const btn=document.getElementById("auth-submit");
  const err=document.getElementById("auth-error");
  if(btn){btn.disabled=true;btn.style.opacity=".6";btn.textContent="Ingresando...";}
  if(err){err.classList.remove("on");err.textContent="";}
  const email=document.getElementById("auth-email").value.trim();
  const password=document.getElementById("auth-pass").value;
  const {error}=await sbClient.auth.signInWithPassword({email,password});
  if(error){
    if(err){err.textContent=error.message;err.classList.add("on");}
    if(btn){btn.disabled=false;btn.style.opacity="1";btn.textContent="Ingresar";}
    return;
  }
  await startAuthenticatedApp();
}

async function logoutSupabase(){
  if(sbClient)await sbClient.auth.signOut();
  remoteReady=false;
  showLogin();
  setSyncStatus("Sin sesion");
}

async function loadRemoteDB(){
  setSyncStatus("Cargando datos...");
  const {data,error}=await sbClient.from("app_state").select("data").eq("id","main").single();
  if(error)throw error;
  if(isValidDB(data?.data) && !isDemoDB(data.data)){
    DB=data.data;
  }else{
    const {error:updateError}=await sbClient.from("app_state").update({data:DB,updated_at:new Date().toISOString()}).eq("id","main");
    if(updateError)throw updateError;
  }
  remoteReady=true;
  setSyncStatus("Sincronizado");
}

async function saveRemoteDB(){
  if(!SUPABASE_ON || !sbClient || !remoteReady)return;
  setSyncStatus("Guardando...");
  const {error}=await sbClient.from("app_state").update({data:DB,updated_at:new Date().toISOString()}).eq("id","main");
  if(error){
    console.error(error);
    setSyncStatus("Error al guardar");
    return;
  }
  setSyncStatus("Sincronizado");
}

function persistDBSoon(){
  if(!remoteReady)return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveRemoteDB,350);
}

async function importarExcelInicial(){
  if(!window.LUNAMIA_INITIAL_DB){alert("No se encontró el archivo de importación.");return;}
  if(!confirm("Esto reemplazará los datos actuales por los datos importados del Excel. ¿Continuar?"))return;
  DB=cloneData(window.LUNAMIA_INITIAL_DB);
  if(SUPABASE_ON&&sbClient&&remoteReady)await saveRemoteDB();
  renderSidebar();
  navMod("dashboard");
  setSyncStatus(remoteReady?"Sincronizado":"Local");
}

async function startAuthenticatedApp(){
  try{
    await loadRemoteDB();
    showApp();
    navMod("dashboard");
  }catch(err){
    console.error(err);
    showLogin(`No se pudo cargar la base. Revisá que supabase.sql esté ejecutado. ${err.message||""}`);
    setSyncStatus("Error Supabase");
  }
}

async function initApp(){
  if(!SUPABASE_ON){
    setSyncStatus("Local");
    showApp();
    navMod("dashboard");
    return;
  }
  if(!window.supabase){
    showLogin("No se pudo cargar el cliente de Supabase.");
    setSyncStatus("Error Supabase");
    return;
  }
  sbClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{
    auth:{
      persistSession:true,
      autoRefreshToken:false,
      storage:window.sessionStorage
    }
  });
  const {data}=await sbClient.auth.getSession();
  if(!data.session){
    showLogin();
    setSyncStatus("Sin sesion");
    return;
  }
  await startAuthenticatedApp();
}

/* ── HELPERS ── */
const fmt=n=>"$"+Math.round(n).toLocaleString("es-AR");
const fmtDiff=n=>n===0?`<span style="color:var(--vd);font-weight:500">Sin diferencia</span>`:n>0?`<span style="color:var(--vd);font-weight:500">Sobrante ${fmt(n)}</span>`:`<span style="color:var(--rj);font-weight:500">Faltante ${fmt(Math.abs(n))}</span>`;
function today(){const d=new Date();return`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;}
function todayShort(){return today().substring(0,5);}
function toDateInput(){return new Date().toISOString().split("T")[0];}
function shortFromISO(iso){if(!iso)return todayShort();const p=iso.split("-");return p.length===3?`${p[2]}/${p[1]}`:todayShort();}
function hora(){const d=new Date();return`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;}
function initials(n){return n.split(" ").map(x=>x[0]).join("").substring(0,2).toUpperCase();}
function avCol(i){return AV_COLS[i%AV_COLS.length];}
function stockTotal(p){return p.variantes.reduce((a,v)=>a+v.stock,0);}
function stockStatus(p){const t=stockTotal(p);return t===0?"sin":t<=3?"bajo":"ok";}
function roundPsy(n){return Math.round(n/1000)*1000-10;}
function totalCaja(k){return Object.values(DB.cajas[k]).reduce((a,v)=>a+v,0);}
function openOv(id){document.getElementById(id).classList.add("on");}
function closeOv(id){document.getElementById(id).classList.remove("on");}
function nivelBadge(n){const m={Oro:"background:#FAEEDA;color:#633806",Plata:"background:#F1EFE8;color:#444441",Bronce:"background:#FAECE7;color:#712B13",Nuevo:"background:var(--azbg);color:var(--az)"};return`<span class="bd" style="${m[n]||""};font-size:10px;">${n}</span>`;}
function estadoBadgeCli(e){if(e==="ok")return`<span class="bd bd-ok" style="font-size:10px;"><span class="dot d-ok"></span>Sin deuda</span>`;if(e==="proximo")return`<span class="bd bd-bj" style="font-size:10px;"><span class="dot d-bj"></span>Próx. vencer</span>`;return`<span class="bd" style="background:var(--rjbg);color:var(--rj);font-size:10px;"><span class="dot d-sn"></span>Vencida</span>`;}
function bdStock(s){if(s==="ok")return`<span class="bd bd-ok" style="font-size:10px;"><span class="dot d-ok"></span>Normal</span>`;if(s==="bajo")return`<span class="bd bd-bj" style="font-size:10px;"><span class="dot d-bj"></span>Bajo</span>`;return`<span class="bd bd-rj" style="font-size:10px;"><span class="dot d-sn"></span>Sin stock</span>`;}
function nextId(arr){return Math.max(0,...arr.map(x=>x.id))+1;}
function categoriasDisponibles(){
  return (DB.categorias&&DB.categorias.length?DB.categorias:Object.entries(CAT_MAP).map(([codigo,nombre],i)=>({id:i+1,codigo,nombre})));
}
function categoriaNombre(codigo){
  return categoriasDisponibles().find(c=>c.codigo===codigo)?.nombre||CAT_MAP[codigo]||codigo;
}
function categoriaCodigo(nombre){
  return categoriasDisponibles().find(c=>c.nombre===nombre)?.codigo||Object.keys(CAT_MAP).find(k=>CAT_MAP[k]===nombre)||"GEN";
}
function categoriaOptions(selected="",placeholder="Seleccioná",valueMode="codigo"){
  return `<option value="">${placeholder}</option>`+categoriasDisponibles().map(c=>{
    const value=valueMode==="nombre"?c.nombre:c.codigo;
    return `<option value="${value}"${selected===value?" selected":""}>${c.nombre}</option>`;
  }).join("");
}
function codigoSegmento(texto,fallback="GEN"){
  const raw=(texto||"").trim();
  if(!raw)return fallback;
  const clean=raw.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9 ]/g,"").toUpperCase();
  const words=clean.split(/\s+/).filter(Boolean);
  if(words.length>1)return words.map(w=>w[0]).join("").slice(0,3);
  const consonants=clean[0]+clean.slice(1).replace(/[AEIOU]/g,"");
  return (consonants||clean).slice(0,3);
}
function codigoProductoSugerido(){
  const cat=document.getElementById("np-cat")?.value;
  const marca=codigoSegmento(document.getElementById("np-marca")?.value,"SIN");
  const tipoBase=document.getElementById("np-tipo")?.value||document.getElementById("np-nombre")?.value;
  const tipo=codigoSegmento(tipoBase,"GEN");
  if(!cat)return "";
  const prefix=`${cat}-${marca}-${tipo}`;
  const nums=DB.productos.map(p=>p.codigo||"").filter(c=>c.startsWith(prefix+"-")).map(c=>parseInt(c.split("-")[3],10)).filter(Boolean);
  const next=(Math.max(0,...nums)+1).toString().padStart(3,"0");
  return `${prefix}-${next}`;
}
function codigoColor(color){
  const map={Negro:"NEG",Blanco:"BLA",Beige:"BEI",Azul:"AZU",Celeste:"CEL",Rosa:"ROS",Rojo:"ROJ",Gris:"GRI",Verde:"VER",Marrón:"MAR","Único":"UNI","—":"UNI"};
  return map[color]||codigoSegmento(color,"UNI");
}
function codigoTalle(talle){return (!talle||talle==="—")?"U":String(talle).toUpperCase();}

/* ══════════════════════════════════════════
   NAVEGACIÓN
══════════════════════════════════════════ */
let currentMod=null;
let currentSub={};

const MODULES={
  dashboard:{
    sidebar:[
      {id:"dashboard-home",icon:"ti-layout-dashboard",label:"Panel de control"},
    ],
    footer:()=>`<div class="sf-label">Estado</div><div class="sf-val">Inicio</div><div style="font-size:10px;color:var(--gc);margin-top:2px;">${today()}</div>`,
    defaultSub:"dashboard-home"
  },
  productos:{
    sidebar:[
      {id:"lista",icon:"ti-shirt",label:"Todos los productos"},
      {id:"categorias",icon:"ti-category",label:"Categorías"},
      {id:"guia-codigos",icon:"ti-help-circle",label:"Guía de códigos"},
      {id:"nuevo",icon:"ti-plus",label:"Nuevo producto"},
      {id:"ingresos",icon:"ti-package-import",label:"Ingresos de stock"},
    ],
    footer:()=>`<div class="sf-label">Total productos</div><div class="sf-val">${DB.productos.length}</div><div style="font-size:10px;color:var(--gc);margin-top:2px;">${DB.productos.filter(p=>stockStatus(p)==="sin").length} sin stock</div>`,
    defaultSub:"lista"
  },
  ventas:{
    sidebar:[
      {id:"pdv",icon:"ti-shopping-cart",label:"Punto de venta"},
      {id:"historial-ventas",icon:"ti-history",label:"Historial"},
      {id:"devoluciones",icon:"ti-arrow-back-up",label:"Devoluciones"},
    ],
    footer:()=>`<div class="sf-label">Caja principal hoy</div><div class="sf-val">${fmt(totalCaja("principal"))}</div><div style="font-size:10px;color:var(--gc);margin-top:2px;">${DB.ventas.filter(v=>v.fecha===todayShort()).length} ventas hoy</div>`,
    defaultSub:"pdv"
  },
  clientes:{
    sidebar:[
      {id:"clientes-lista",icon:"ti-users",label:"Todos los clientes"},
      {id:"cuenta-corriente",icon:"ti-credit-card",label:"Cuenta corriente",badge:()=>DB.clientes.filter(c=>c.deuda>0).length,badgeClass:"sb-badge-am"},
      {id:"fidelizacion",icon:"ti-star",label:"Fidelización"},
      {id:"alertas-cli",icon:"ti-bell",label:"Alertas",badge:()=>DB.clientes.filter(c=>c.estado==="vencida").length,badgeClass:"sb-badge-rj"},
    ],
    footer:()=>`<div class="sf-label">Deuda total activa</div><div class="sf-val">${fmt(DB.clientes.reduce((a,c)=>a+c.deuda,0))}</div><div style="font-size:10px;color:var(--gc);margin-top:2px;">${DB.clientes.filter(c=>c.deuda>0).length} clientes con deuda</div>`,
    defaultSub:"clientes-lista"
  },
  caja:{
    sidebar:[
      {id:"caja-resumen",icon:"ti-layout-dashboard",label:"Resumen del día"},
      {id:"caja-movimientos",icon:"ti-list",label:"Movimientos"},
      {id:"caja-gastos",icon:"ti-receipt",label:"Gastos"},
      {id:"caja-transferencias",icon:"ti-arrows-exchange",label:"Entre cajas"},
      {id:"caja-cierre",icon:"ti-lock",label:"Cierre diario"},
    ],
    footer:()=>`<div class="sf-label">Total en cajas</div><div class="sf-val">${fmt(totalCaja("principal")+totalCaja("reinversion"))}</div><div style="font-size:10px;color:var(--gc);margin-top:2px;">${today()}</div>`,
    defaultSub:"caja-resumen"
  },
  analisis:{
    sidebar:[
      {id:"analisis-ventas",icon:"ti-chart-dots",label:"Rotación y reposición"},
    ],
    footer:()=>`<div class="sf-label">Sugerencias</div><div class="sf-val">${(DB.analytics?.reposicion?.length||0)+(DB.analytics?.oferta?.length||0)}</div><div style="font-size:10px;color:var(--gc);margin-top:2px;">Simple y accionable</div>`,
    defaultSub:"analisis-ventas"
  },
  proveedores:{
    sidebar:[
      {id:"prov-lista",icon:"ti-truck",label:"Todos los proveedores"},
      {id:"prov-ingresos",icon:"ti-package-import",label:"Ingresos de stock"},
      {id:"prov-historial",icon:"ti-history",label:"Historial de compras"},
    ],
    footer:()=>`<div class="sf-label">Proveedores activos</div><div class="sf-val">${DB.proveedores.length}</div><div style="font-size:10px;color:var(--gc);margin-top:2px;">Último ingreso: ${DB.proveedores.flatMap(p=>p.compras)[0]?.fecha||"—"}</div>`,
    defaultSub:"prov-lista"
  },
};

/* Orden de módulos en el sidebar */
const MOD_ORDER = ["dashboard","ventas","caja","productos","clientes","analisis","proveedores"];

const MOD_ICONS = {
  dashboard:"ti-layout-dashboard",
  ventas:"ti-shopping-cart", caja:"ti-cash",
  productos:"ti-shirt", clientes:"ti-users", analisis:"ti-chart-dots", proveedores:"ti-truck"
};
const MOD_LABELS = {
  dashboard:"Inicio",
  ventas:"Ventas", caja:"Caja",
  productos:"Productos", clientes:"Clientes", analisis:"Análisis", proveedores:"Proveedores"
};

function navMod(mod){
  // Solo uno abierto a la vez: si se clickea el mismo, lo cerramos (toggle)
  if(currentMod === mod){
    currentMod = null;
    renderLeftNav();
    return;
  }
  currentMod = mod;
  renderLeftNav();
  showSub(MODULES[mod].defaultSub);
}

/* Renderiza toda la barra izquierda como acordeón */
function renderLeftNav(){
  const nav = document.getElementById("leftnav");
  if(!nav) return;

  nav.innerHTML = MOD_ORDER.map(mod => {
    const isOpen = mod === currentMod;
    const cfg = MODULES[mod];
    const subItems = cfg.sidebar.map(item => {
      const badge = item.badge ? item.badge() : 0;
      const badgeHtml = badge > 0
        ? `<span class="ln-sub-badge ${(item.badgeClass||"sb-badge-az").replace("sb-badge","ln-sub-badge")}">${badge}</span>` : "";
      const isActive = isOpen && currentSub[mod] === item.id;
      return `<button class="ln-sub-item${isActive?" on":""}" id="lnsub-${item.id}" onclick="showSub('${item.id}')">
        <i class="ti ${item.icon}"></i>${item.label}${badgeHtml}
      </button>`;
    }).join("");

    const footerHtml = isOpen
      ? `<div class="ln-footer">${cfg.footer()}</div>` : "";

    return `
      <button class="ln-mod${isOpen?" on":""}" onclick="navMod('${mod}')">
        <i class="ti ${MOD_ICONS[mod]} ln-icon"></i>
        ${MOD_LABELS[mod]}
        <i class="ti ti-chevron-down ln-arrow"></i>
      </button>
      <div class="ln-sub${isOpen?" on":""}">
        ${subItems}
        ${footerHtml}
      </div>`;
  }).join("");
}

/* Alias para compatibilidad */
function renderSidebar(){ renderLeftNav(); }

function showSub(sub){
  currentSub[currentMod] = sub;
  document.querySelectorAll(".ln-sub-item").forEach(e => e.classList.remove("on"));
  const el = document.getElementById("lnsub-" + sub);
  if(el) el.classList.add("on");
  renderPage(sub);
}

function renderPage(sub){
  const area=document.getElementById("main-area");
  const renders={
    "dashboard-home":renderDashboardHome,
    lista:renderProdLista,
    categorias:renderCategoriasPage,
    "guia-codigos":renderGuiaCodigos,
    nuevo:()=>{renderProdLista();abrirNuevoProd();},
    ingresos:renderIngresosPage,
    pdv:renderPDV,
    "historial-ventas":renderHistorialVentas,
    devoluciones:renderDevoluciones,
    "clientes-lista":renderClientesLista,
    "cuenta-corriente":renderCuentaCorriente,
    fidelizacion:renderFidelizacion,
    "alertas-cli":renderAlertasCli,
    "caja-resumen":renderCajaResumen,
    "caja-movimientos":renderCajaMovimientos,
    "caja-gastos":renderCajaGastos,
    "caja-transferencias":renderCajaTransferencias,
    "caja-cierre":renderCajaCierre,
    "analisis-ventas":renderAnalisisVentas,
    "prov-lista":renderProvLista,
    "prov-ingresos":renderProvIngresos,
    "prov-historial":renderProvHistorial,
  };
  if(renders[sub])renders[sub]();
  renderSidebar();
  const sbEl=document.getElementById("sb-"+sub);
  if(sbEl)sbEl.classList.add("on");
}

function renderDashboardHome(){
  if(typeof cargarDashboard==="function")cargarDashboard();
  else renderPDV();
}

function abrirVenta(){
  currentMod="ventas";
  renderLeftNav();
  showSub("pdv");
}

function irAVentas(){
  currentMod="ventas";
  renderLeftNav();
  showSub("historial-ventas");
}

/* ══════════════════════════════════════════
   MÓDULO PRODUCTOS
══════════════════════════════════════════ */
let prodFiltQ="",prodFiltCat="",prodFiltGen="",prodFiltSt="";
function renderProdLista(){
  const list=DB.productos.filter(p=>{
    const q=prodFiltQ.toLowerCase();
    return(!q||p.nombre.toLowerCase().includes(q)||p.codigo.toLowerCase().includes(q))&&
      (!prodFiltCat||p.cat===prodFiltCat)&&(!prodFiltGen||p.gen===prodFiltGen)&&
      (!prodFiltSt||stockStatus(p)===prodFiltSt);
  });
  const ok=DB.productos.filter(p=>stockStatus(p)==="ok").length;
  const bj=DB.productos.filter(p=>stockStatus(p)==="bajo").length;
  const sn=DB.productos.filter(p=>stockStatus(p)==="sin").length;
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph">
      <div><div class="pt">Productos</div><div class="ps">${DB.productos.length} productos registrados</div></div>
      <div style="display:flex;gap:7px;">
        <button class="btn btn-out btn-sm" onclick="abrirIngresoMerch(null)"><i class="ti ti-package-import"></i>Registrar ingreso</button>
        <button class="btn btn-ng btn-sm" onclick="abrirNuevoProd()"><i class="ti ti-plus"></i>Nuevo producto</button>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px 18px;">
      <div class="sc"><div class="sl">Total productos</div><div class="sv">${DB.productos.length}</div></div>
      <div class="sc"><div class="sl"><span class="dot d-ok"></span> Normal</div><div class="sv" style="color:var(--vd);">${ok}</div></div>
      <div class="sc"><div class="sl"><span class="dot d-bj"></span> Stock bajo</div><div class="sv" style="color:var(--am);">${bj}</div></div>
      <div class="sc"><div class="sl"><span class="dot d-sn"></span> Sin stock</div><div class="sv" style="color:var(--rj);">${sn}</div></div>
    </div>
    <div style="display:flex;gap:7px;padding:0 18px 10px;">
      <div style="flex:1;position:relative;"><i class="ti ti-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--gc);font-size:14px;"></i><input type="text" placeholder="Buscar por nombre o código..." style="padding-left:30px;" value="${prodFiltQ}" oninput="prodFiltQ=this.value;renderProdLista()"/></div>
      <select style="height:34px;font-size:12px;width:150px;" onchange="prodFiltCat=this.value;renderProdLista()">${categoriaOptions(prodFiltCat,"Todas las categorías","nombre")}</select>
      <select style="height:34px;font-size:12px;width:120px;" onchange="prodFiltGen=this.value;renderProdLista()"><option value="">Dama/Caballero</option><option${prodFiltGen==="Dama"?" selected":""}>Dama</option><option${prodFiltGen==="Caballero"?" selected":""}>Caballero</option></select>
      <select style="height:34px;font-size:12px;width:120px;" onchange="prodFiltSt=this.value;renderProdLista()"><option value="">Todo el stock</option><option value="ok"${prodFiltSt==="ok"?" selected":""}>Normal</option><option value="bajo"${prodFiltSt==="bajo"?" selected":""}>Bajo</option><option value="sin"${prodFiltSt==="sin"?" selected":""}>Sin stock</option></select>
    </div>
    <div style="padding:0 18px 18px;flex:1;overflow-y:auto;">
      <div class="tw"><table>
        <colgroup><col style="width:28px"><col><col style="width:95px"><col style="width:85px"><col style="width:90px"><col style="width:65px"><col style="width:90px"><col style="width:86px"></colgroup>
        <thead><tr><th></th><th>Producto</th><th>Categoría</th><th>Género</th><th>Precio</th><th>Variantes</th><th>Stock</th><th></th></tr></thead>
        <tbody>${list.map((p,i)=>`<tr>
          <td style="color:var(--gc);font-size:10px;">${p.id}</td>
          <td><div style="font-size:12px;font-weight:500;">${p.nombre}</div><div style="font-size:10px;color:var(--gc);font-family:monospace;">${p.codigo}</div></td>
          <td><span class="bd bd-ng" style="font-size:10px;">${p.cat}</span></td>
          <td style="color:var(--gt);">${p.gen}</td>
          <td style="font-weight:500;">${fmt(p.precio)}</td>
          <td style="text-align:center;">${p.variantes.length}</td>
          <td>${bdStock(stockStatus(p))}</td>
          <td><div style="display:flex;gap:4px;"><button class="btn-icon" onclick="abrirIngresoMerch(${p.id})" title="Registrar ingreso de stock"><i class="ti ti-package-import" style="font-size:12px;"></i></button><button class="btn-icon" onclick="editarProducto(${p.id})" title="Editar"><i class="ti ti-pencil" style="font-size:12px;"></i></button><button class="btn-icon" onclick="eliminarProducto(${p.id})" title="Eliminar" style="color:var(--rj);"><i class="ti ti-trash" style="font-size:12px;"></i></button></div></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}

/* ── Categorías ── */
let editingCategoryId=null;
function sugerirCodigoCategoria(){
  if(editingCategoryId)return;
  const nombre=document.getElementById("cat-nombre").value.trim();
  if(!nombre)return;
  let base=nombre.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9 ]/g,"").split(/\s+/).filter(Boolean).map(x=>x[0]).join("").toUpperCase();
  if(base.length<3)base=nombre.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]/g,"").slice(0,3).toUpperCase();
  base=(base||"CAT").slice(0,5);
  let code=base,n=2;
  while(categoriasDisponibles().some(c=>c.codigo===code))code=`${base}${n++}`;
  document.getElementById("cat-codigo").value=code;
}
function renderCategoriasPage(){
  const cats=categoriasDisponibles();
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph">
      <div><div class="pt">Categorías</div><div class="ps">Ordenan productos y códigos inteligentes</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirCategoria()"><i class="ti ti-plus"></i>Nueva categoría</button>
    </div>
    <div style="padding:12px 18px 18px;flex:1;overflow-y:auto;">
      <div class="tw"><table>
        <colgroup><col style="width:80px"><col><col style="width:110px"><col style="width:90px"></colgroup>
        <thead><tr><th>Código</th><th>Categoría</th><th>Productos</th><th></th></tr></thead>
        <tbody>${cats.map(c=>{const usados=DB.productos.filter(p=>p.cat===c.nombre).length;return `<tr>
          <td style="font-family:monospace;font-weight:600;">${c.codigo}</td>
          <td>${c.nombre}</td>
          <td>${usados}</td>
          <td><div style="display:flex;gap:4px;justify-content:flex-end;"><button class="btn-icon" onclick="editarCategoria(${c.id})" title="Editar"><i class="ti ti-pencil" style="font-size:12px;"></i></button><button class="btn-icon" onclick="eliminarCategoria(${c.id})" title="Eliminar" style="color:var(--rj);"><i class="ti ti-trash" style="font-size:12px;"></i></button></div></td>
        </tr>`;}).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}
function abrirCategoria(){
  editingCategoryId=null;
  document.getElementById("cat-nombre").value="";
  document.getElementById("cat-codigo").value="";
  openOv("ov-categoria");
}
function editarCategoria(id){
  const c=categoriasDisponibles().find(x=>x.id===id);if(!c)return;
  editingCategoryId=id;
  document.getElementById("cat-nombre").value=c.nombre;
  document.getElementById("cat-codigo").value=c.codigo;
  openOv("ov-categoria");
}
function guardarCategoria(){
  const nombre=document.getElementById("cat-nombre").value.trim();
  const codigo=document.getElementById("cat-codigo").value.trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(!nombre||!codigo){alert("Completá nombre y código.");return;}
  if(!DB.categorias)DB.categorias=[];
  const repetida=DB.categorias.find(c=>c.codigo===codigo&&c.id!==editingCategoryId);
  if(repetida){alert("Ya existe una categoría con ese código.");return;}
  if(editingCategoryId){
    const cat=DB.categorias.find(c=>c.id===editingCategoryId);if(!cat)return;
    const oldName=cat.nombre;
    Object.assign(cat,{nombre,codigo});
    DB.productos.forEach(p=>{if(p.cat===oldName)p.cat=nombre;});
  }else{
    DB.categorias.push({id:nextId(DB.categorias),codigo,nombre});
  }
  editingCategoryId=null;
  persistDBSoon();
  closeOv("ov-categoria");
  renderCategoriasPage();renderSidebar();
}
function eliminarCategoria(id){
  const cat=DB.categorias?.find(c=>c.id===id);if(!cat)return;
  const usados=DB.productos.filter(p=>p.cat===cat.nombre).length;
  if(usados){alert(`No se puede eliminar: hay ${usados} productos en esta categoría.`);return;}
  if(!confirm(`Eliminar categoría ${cat.nombre}?`))return;
  DB.categorias=DB.categorias.filter(c=>c.id!==id);
  persistDBSoon();
  renderCategoriasPage();renderSidebar();
}

function renderGuiaCodigos(){
  const cats=categoriasDisponibles();
  const colorMap=[
    ["NEG","Negro"],["BLA","Blanco"],["BEI","Beige"],["AZU","Azul"],["CEL","Celeste"],
    ["ROS","Rosa"],["ROJ","Rojo"],["GRI","Gris"],["VER","Verde"],["UNI","Único/surtido"]
  ];
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph">
      <div><div class="pt">Guía de códigos</div><div class="ps">Criterio recomendado para productos, marcas, colores y talles</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirNuevoProd()"><i class="ti ti-plus"></i>Crear producto</button>
    </div>
    <div class="scroll">
      <div style="display:grid;grid-template-columns:1.25fr .75fr;gap:12px;">
        <div class="sc" style="padding:18px;">
          <div class="sect-title">Formato recomendado</div>
          <div style="font-family:monospace;font-size:22px;font-weight:700;color:var(--ng);margin-bottom:12px;">CAT-MAR-TIP-NNN-COL-TAL</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
            ${[
              ["CAT","Categoría","Remeras, jeans, interior, accesorios."],
              ["MAR","Marca","Lody, Mom, Sin marca."],
              ["TIP","Tipo o modelo","Térmica, lino, baggy, soquete."],
              ["NNN","Número","Correlativo automático."],
              ["COL","Color","Negro, beige, blanco, único."],
              ["TAL","Talle","M, 38, XL, único."]
            ].map(x=>`<div style="border:1px solid var(--crb);border-radius:9px;padding:10px;background:var(--bl);"><div style="font-family:monospace;font-weight:700;color:var(--am);">${x[0]}</div><div style="font-size:12px;font-weight:600;margin-top:3px;">${x[1]}</div><div style="font-size:11px;color:var(--gt);line-height:1.35;margin-top:3px;">${x[2]}</div></div>`).join("")}
          </div>
        </div>
        <div class="sc" style="padding:18px;background:var(--ng);">
          <div class="sl" style="color:var(--gc);">Ejemplo completo</div>
          <div style="font-family:monospace;font-size:18px;font-weight:700;color:var(--cr);margin:8px 0;">REM-LDY-TRM-001-NEG-M</div>
          <div style="font-size:12px;color:var(--crb);line-height:1.5;">Remera Lody térmica, variante negro talle M.</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
        <div class="sc" style="padding:18px;">
          <div class="sect-title">Reglas simples</div>
          <div class="guide-list">
            <div><b>El producto base</b> termina en el número: REM-LDY-TRM-001.</div>
            <div><b>La variante vendible</b> agrega color y talle: REM-LDY-TRM-001-NEG-M.</div>
            <div><b>No pongas precio, costo o proveedor</b> en el código: esos datos cambian.</div>
            <div><b>Usá SIN</b> cuando el producto no tenga marca clara.</div>
            <div><b>Mantené abreviaturas estables</b>: Lody siempre LDY, térmica siempre TRM.</div>
          </div>
        </div>
        <div class="sc" style="padding:18px;">
          <div class="sect-title">Cómo lo aplica el sistema</div>
          <div class="guide-list">
            <div>Al crear producto, la app sugiere CAT-MAR-TIP-NNN.</div>
            <div>Al generar variantes, agrega color y talle automáticamente.</div>
            <div>Si editás el código manualmente, valida que no exista otro igual.</div>
            <div>Las categorías se administran desde Productos > Categorías.</div>
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
        <div class="tw"><table>
          <thead><tr><th>Categoría</th><th>Código</th></tr></thead>
          <tbody>${cats.map(c=>`<tr><td>${c.nombre}</td><td style="font-family:monospace;font-weight:700;">${c.codigo}</td></tr>`).join("")}</tbody>
        </table></div>
        <div class="tw"><table>
          <thead><tr><th>Color</th><th>Código sugerido</th></tr></thead>
          <tbody>${colorMap.map(c=>`<tr><td>${c[1]}</td><td style="font-family:monospace;font-weight:700;">${c[0]}</td></tr>`).join("")}</tbody>
        </table></div>
      </div>
    </div>
  </div>`;
}
function abrirGuiaCodigosDesdeModal(){
  closeOv("ov-nuevo-prod");
  currentMod="productos";
  renderLeftNav();
  showSub("guia-codigos");
}

function renderIngresosPage(){
  const todos=DB.proveedores.flatMap(p=>p.compras.map(c=>({...c,proveedor:p.nombre,uds:c.items.reduce((a,i)=>a+i.cant,0)})));
  todos.sort((a,b)=>b.id-a.id);
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Ingresos de stock</div><div class="ps">Historial de entradas de mercadería</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirIngresoMerch(null)"><i class="ti ti-plus"></i>Nuevo ingreso</button></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px 18px;">
      <div class="sc"><div class="sl">Ingresos este mes</div><div class="sv">${todos.length}</div></div>
      <div class="sc"><div class="sl">Unidades ingresadas</div><div class="sv">${todos.reduce((a,i)=>a+i.uds,0)}</div></div>
      <div class="sc"><div class="sl">Invertido este mes</div><div class="sv" style="color:var(--rj);">${fmt(todos.reduce((a,i)=>a+i.total,0))}</div></div>
      <div class="sc" style="background:var(--ng);"><div class="sl" style="color:var(--gc);">Total acumulado</div><div class="sv" style="color:var(--cr);">${fmt(todos.reduce((a,i)=>a+i.total,0))}</div></div>
    </div>
    <div style="padding:0 18px 18px;flex:1;overflow-y:auto;">
      <div class="tw"><table>
        <colgroup><col style="width:50px"><col style="width:70px"><col style="width:120px"><col><col style="width:65px"><col style="width:90px"><col style="width:80px"><col style="width:50px"></colgroup>
        <thead><tr><th>#</th><th>Fecha</th><th>Proveedor</th><th>Productos</th><th>Uds.</th><th>Total pagado</th><th>Método</th><th></th></tr></thead>
        <tbody>${todos.map(i=>`<tr onclick="verDetalleIngreso(${i.id})">
          <td style="color:var(--gc);font-size:10px;">#${i.id}</td>
          <td style="color:var(--gt);">${i.fecha}</td>
          <td style="font-weight:500;">${i.proveedor}</td>
          <td style="font-size:11px;color:var(--gt);">${i.items.map(it=>it.nombre.split("·")[0].trim()+" ×"+it.cant).join(", ")}</td>
          <td style="text-align:center;">${i.uds}</td>
          <td style="font-weight:500;">${fmt(i.total)}</td>
          <td><span class="bd ${i.metodo==="cuenta_prov"?"bd-bj":i.metodo==="efectivo"?"bd-ok":"bd-az"}" style="font-size:10px;">${i.metodo==="cuenta_prov"?"Cta.prov":i.metodo==="efectivo"?"Efectivo":"Transf."}</span></td>
          <td><button class="btn-ghost btn-sm" style="padding:3px 7px;" onclick="event.stopPropagation();verDetalleIngreso(${i.id})"><i class="ti ti-eye"></i></button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}

/* ── Nuevo producto ── */
let npColores=[],npTalles=[],npVarsTmp=[];
let editingProductId=null;
function abrirNuevoProd(){
  editingProductId=null;
  npColores=[];npTalles=[];npVarsTmp=[];
  ["np-nombre","np-marca","np-tipo","np-costo","np-precio-edit"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("np-cat").innerHTML=categoriaOptions();
  document.getElementById("np-cat").value="";
  document.getElementById("np-gen").value="";
  document.getElementById("np-gan").value="110";
  document.getElementById("np-codigo-edit").value="";
  document.getElementById("np-codigo-sug").textContent="Las variantes usarán este código como base.";
  document.getElementById("np-codigo-prev").textContent="—";
  document.getElementById("np-precio-final").textContent="$—";
  document.getElementById("np-gan-est").textContent="$—";
  document.getElementById("np-var-list").innerHTML="";
  const provSel=document.getElementById("np-prov");
  provSel.innerHTML=`<option value="">Sin proveedor</option>`+DB.proveedores.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join("");
  renderNpColoresTalles();
  switchPTab(0);
  openOv("ov-nuevo-prod");
}
let pTabActual=0;
function switchPTab(n){pTabActual=n;[0,1,2].forEach(i=>{document.getElementById("ptp-"+i).classList.toggle("on",i===n);document.getElementById("ptab-"+i).classList.toggle("on",i===n);});}
function renderNpColoresTalles(){
  document.getElementById("np-colores").innerHTML=COLORES.map(c=>`<div class="tag${npColores.includes(c)?" sel":""}" onclick="toggleNpColor('${c}')">${c}</div>`).join("");
  document.getElementById("np-talles").innerHTML=TALLES.map(t=>`<div class="tag${npTalles.includes(t)?" sel":""}" onclick="toggleNpTalle('${t}')">${t}</div>`).join("");
}
function toggleNpColor(c){npColores.includes(c)?npColores=npColores.filter(x=>x!==c):npColores.push(c);renderNpColoresTalles();}
function toggleNpTalle(t){npTalles.includes(t)?npTalles=npTalles.filter(x=>x!==t):npTalles.push(t);renderNpColoresTalles();}
function actualizarCodigoPrev(){
  const codigo=codigoProductoSugerido();
  if(!codigo){document.getElementById("np-codigo-prev").textContent="—";return;}
  document.getElementById("np-codigo-prev").textContent=codigo;
  if(!editingProductId)document.getElementById("np-codigo-edit").value=codigo;
  renderCodigoSugerencias();
}
function renderCodigoSugerencias(){
  const code=(document.getElementById("np-codigo-edit")?.value||"").trim().toUpperCase();
  const el=document.getElementById("np-codigo-sug");if(!el)return;
  if(!code){el.textContent="Las variantes usarán este código como base.";return;}
  const prefix=code.split("-").slice(0,3).join("-");
  const similares=DB.productos.map(p=>p.codigo).filter(c=>c&&c.startsWith(prefix)&&c!==code).slice(0,5);
  el.textContent=similares.length?`Códigos similares: ${similares.join(", ")}`:"Sin códigos similares activos.";
}
function calcPrecioNuevo(){
  const c=parseFloat(document.getElementById("np-costo").value)||0;
  const g=parseFloat(document.getElementById("np-gan").value)||0;
  if(!c)return;
  const p=roundPsy(c*(1+g/100));
  document.getElementById("np-precio-final").textContent=fmt(p);
  document.getElementById("np-gan-est").textContent=fmt(p-c);
  document.getElementById("np-precio-edit").value=p;
}
function generarVariantesProd(){
  // Sincronizar npTalles desde checkboxes del HTML (si existen)
  const talleChecks=document.querySelectorAll('#ptp-2 .talle-btn input[type="checkbox"]:checked');
  if(talleChecks.length>0){npTalles=Array.from(talleChecks).map(cb=>cb.value);}
  // Sincronizar npColores desde tags .sel del strip (si existen)
  const colorTags=document.querySelectorAll('#np-colores .tag.sel');
  if(colorTags.length>0){npColores=Array.from(colorTags).map(el=>el.textContent.trim());}
  const baseCodigo=document.getElementById("np-codigo-edit").value||codigoProductoSugerido()||"XXX-SIN-GEN-001";
  npVarsTmp=[];
  if(!npColores.length&&!npTalles.length){npVarsTmp=[{c:"Único",t:"Único"}];}
  else if(!npColores.length){npTalles.forEach(t=>npVarsTmp.push({c:"—",t}));}
  else if(!npTalles.length){npColores.forEach(c=>npVarsTmp.push({c,t:"—"}));}
  else{npColores.forEach(c=>npTalles.forEach(t=>npVarsTmp.push({c,t})));}
  renderNpVarList(baseCodigo);
}
function renderNpVarList(baseCodigo){
  document.getElementById("np-var-list").innerHTML=npVarsTmp.map((v,i)=>`
    <div class="var-row">
      <select onchange="npVarsTmp[${i}].c=this.value">${COLORES.map(c=>`<option${c===v.c?" selected":""}>${c}</option>`).join("")}</select>
      <select onchange="npVarsTmp[${i}].t=this.value">${TALLES.map(t=>`<option${t===v.t?" selected":""}>${t}</option>`).join("")}</select>
      <input type="number" value="${v.stock||0}" min="0" id="npv-${i}" placeholder="Stock"/>
      <button class="btn-icon" onclick="npVarsTmp.splice(${i},1);generarVariantesProd()" style="width:26px;height:26px;"><i class="ti ti-x" style="font-size:11px;"></i></button>
      <div class="var-code">${baseCodigo}-${codigoColor(v.c)}-${codigoTalle(v.t)}</div>
    </div>`).join("");
}
function agregarVarManual(){
  npVarsTmp.push({c:"Negro",t:"M"});
  const baseCodigo=document.getElementById("np-codigo-edit").value||codigoProductoSugerido()||"XXX-SIN-GEN-001";
  renderNpVarList(baseCodigo);
}
function editarProducto(id){
  const p=DB.productos.find(x=>x.id===id);if(!p)return;
  editingProductId=id;
  const provSel=document.getElementById("np-prov");
  provSel.innerHTML=`<option value="">Sin proveedor</option>`+DB.proveedores.map(x=>`<option value="${x.id}">${x.nombre}</option>`).join("");
  provSel.value=p.provId||"";
  npColores=[];npTalles=[];npVarsTmp=p.variantes.map(v=>({c:v.c,t:v.t,stock:v.stock}));
  document.getElementById("np-nombre").value=p.nombre;
  document.getElementById("np-marca").value=p.marca||"";
  document.getElementById("np-tipo").value=p.tipo||"";
  document.getElementById("np-cat").innerHTML=categoriaOptions(categoriaCodigo(p.cat));
  document.getElementById("np-gen").value=Object.keys(GEN_MAP).find(k=>GEN_MAP[k]===p.gen)||"";
  document.getElementById("np-costo").value=p.costo||0;
  document.getElementById("np-gan").value=p.gan||0;
  document.getElementById("np-precio-edit").value=p.precio||0;
  document.getElementById("np-codigo-edit").value=p.codigo;
  document.getElementById("np-codigo-prev").textContent=p.codigo;
  renderCodigoSugerencias();
  document.getElementById("np-precio-final").textContent=fmt(p.precio||0);
  document.getElementById("np-gan-est").textContent=p.costo?fmt((p.precio||0)-p.costo):"$—";
  renderNpColoresTalles();
  renderNpVarList(p.codigo);
  openOv("ov-nuevo-prod");
}
function eliminarProducto(id){
  const p=DB.productos.find(x=>x.id===id);if(!p)return;
  if(!confirm(`Eliminar producto ${p.nombre}?`))return;
  DB.productos=DB.productos.filter(x=>x.id!==id);
  persistDBSoon();
  renderProdLista();renderSidebar();
}
function guardarProducto(){
  const nombre=document.getElementById("np-nombre").value.trim();
  const marca=document.getElementById("np-marca").value.trim();
  const tipo=document.getElementById("np-tipo").value.trim();
  const catKey=document.getElementById("np-cat").value;
  const genKey=document.getElementById("np-gen").value;
  if(!nombre||!catKey||!genKey){alert("Completá nombre, categoría y género.");return;}
  const catText=categoriaNombre(catKey);const genText=GEN_MAP[genKey];
  const num=(DB.productos.filter(p=>p.cat===catText).length+1).toString().padStart(3,"0");
  const codigo=(document.getElementById("np-codigo-edit").value.trim().toUpperCase()||`${catKey}-${genKey}-${num}`);
  if(DB.productos.some(p=>p.codigo===codigo&&p.id!==editingProductId)){alert("Ya existe otro producto con ese código.");return;}
  const precio=parseFloat(document.getElementById("np-precio-edit").value)||0;
  const costo=parseFloat(document.getElementById("np-costo").value)||0;
  const variantes=npVarsTmp.map((v,i)=>{
    const stock=parseInt(document.getElementById("npv-"+i)?.value||0)||0;
    return{c:v.c,t:v.t,stock,cod:`${codigo}-${codigoColor(v.c)}-${codigoTalle(v.t)}`};
  });
  const provIdVal=parseInt(document.getElementById("np-prov").value)||null;
  if(editingProductId){
    const prod=DB.productos.find(x=>x.id===editingProductId);
    Object.assign(prod,{nombre,marca,tipo,codigo,cat:catText,gen:genText,costo,gan:parseFloat(document.getElementById("np-gan").value)||0,precio,provId:provIdVal,variantes:variantes.length?variantes:prod.variantes});
  }else{
    DB.productos.push({id:nextId(DB.productos),nombre,marca,tipo,codigo,cat:catText,gen:genText,costo,gan:parseFloat(document.getElementById("np-gan").value)||110,precio,provId:provIdVal,variantes});
    if(provIdVal){const prov=DB.proveedores.find(p=>p.id===provIdVal);if(prov&&!prov.prodIds.includes(DB.productos.length))prov.prodIds.push(DB.productos.length);}
  }
  editingProductId=null;
  persistDBSoon();
  closeOv("ov-nuevo-prod");
  renderProdLista();
}

/* ── Ingreso mercadería ── */
let ingTabActual=0;
let ingRowsData=[];
function abrirIngresoMerch(prodId){
  ingRowsData=[];ingTabActual=0;
  const sel=document.getElementById("ing-prov");
  sel.innerHTML=`<option value="">Seleccionar proveedor...</option>`+DB.proveedores.map(p=>`<option value="${p.id}">${p.nombre}</option>`).join("");
  document.getElementById("ing-fecha").value=toDateInput();
  document.getElementById("ing-remito").value="";
  document.getElementById("ing-obs").value="";
  document.getElementById("ing-total-factura").value="";
  if(prodId){
    const p=DB.productos.find(x=>x.id===prodId);
    if(p&&p.provId){sel.value=p.provId;onIngProvChange();}
    else renderIngVarRowsForProd(null);
  }else{document.getElementById("ing-var-rows").innerHTML=`<div style="text-align:center;padding:20px;color:var(--gc);font-size:12px;">Seleccioná un proveedor primero</div>`;}
  switchIngTab(0);
  openOv("ov-ingreso-merch");
}
function switchIngTab(n){
  ingTabActual=n;
  [0,1,2].forEach(i=>{document.getElementById("itp-"+i).classList.toggle("on",i===n);document.getElementById("itab-"+i).classList.toggle("on",i===n);});
  document.getElementById("ing-prev-btn").style.display=n>0?"inline-flex":"none";
  const nb=document.getElementById("ing-next-btn");
  nb.innerHTML=n<2?`<i class="ti ti-arrow-right"></i>Siguiente`:`<i class="ti ti-check"></i>Confirmar ingreso`;
  if(n===2)calcIngPago();
}
function ingTabSiguiente(){if(ingTabActual<2)switchIngTab(ingTabActual+1);else confirmarIngreso();}
function onIngProvChange(){
  const pid=parseInt(document.getElementById("ing-prov").value);
  const prov=DB.proveedores.find(x=>x.id===pid);
  renderIngVarRowsForProd(prov);
}
function renderIngVarRowsForProd(prov){
  ingRowsData=[];
  const c=document.getElementById("ing-var-rows");
  if(!prov){c.innerHTML=`<div style="text-align:center;padding:20px;color:var(--gc);font-size:12px;">Seleccioná un proveedor primero</div>`;return;}
  const vars=DB.productos.filter(p=>prov.prodIds.includes(p.id)).flatMap(p=>p.variantes.map(v=>({...v,prodNombre:p.nombre,prodId:p.id,costo:p.costo})));
  ingRowsData=vars.map(v=>({...v,cantIngreso:0,nuevoCosto:v.costo}));
  c.innerHTML=ingRowsData.map((v,i)=>`
    <div class="ing-var-row">
      <div><div style="font-size:12px;font-weight:500;">${v.prodNombre}</div><div style="font-size:10px;color:var(--gc);">${v.c} / ${v.t}</div></div>
      <span style="font-size:12px;color:var(--gc);text-align:center;">${v.stock}</span>
      <input type="number" min="0" value="0" id="ingc-${i}" oninput="ingRowsData[${i}].cantIngreso=parseInt(this.value)||0;calcIngPago()" style="text-align:center;"/>
      <input type="number" min="0" value="${v.costo}" id="ingp-${i}" oninput="ingRowsData[${i}].nuevoCosto=parseFloat(this.value)||0"/>
      <button class="btn-icon" style="width:26px;height:26px;" onclick="ingRowsData.splice(${i},1);onIngProvChange()"><i class="ti ti-x" style="font-size:11px;"></i></button>
    </div>`).join("");
}
function addIngVarRow(){
  const opts=DB.productos.flatMap(p=>p.variantes.map(v=>`<option value="${v.cod}">${p.nombre} · ${v.c}/${v.t} (stock:${v.stock})</option>`)).join("");
  const i=ingRowsData.length;
  ingRowsData.push({cod:"",prodNombre:"",cantIngreso:0,nuevoCosto:0,stock:0,prodId:null,c:"",t:""});
  const row=document.createElement("div");row.className="ing-var-row";
  row.innerHTML=`<select style="font-size:11px;" onchange="ingRowsData[${i}].cod=this.value;const p=DB.productos.find(x=>x.variantes.some(v=>v.cod===this.value));if(p){ingRowsData[${i}].prodId=p.id;ingRowsData[${i}].nuevoCosto=p.costo;document.getElementById('ingp-extra-${i}').value=p.costo;}">${opts}</select>
    <span style="font-size:12px;color:var(--gc);">—</span>
    <input type="number" min="0" value="0" oninput="ingRowsData[${i}].cantIngreso=parseInt(this.value)||0;calcIngPago()" style="text-align:center;"/>
    <input type="number" min="0" id="ingp-extra-${i}" placeholder="Costo" oninput="ingRowsData[${i}].nuevoCosto=parseFloat(this.value)||0"/>
    <button class="btn-icon" style="width:26px;height:26px;" onclick="this.closest('.ing-var-row').remove()"><i class="ti ti-x" style="font-size:11px;"></i></button>`;
  document.getElementById("ing-var-rows").appendChild(row);
}
function calcIngPago(){
  const uds=ingRowsData.reduce((a,r)=>a+r.cantIngreso,0);
  const sub=ingRowsData.reduce((a,r)=>a+r.cantIngreso*r.nuevoCosto,0);
  const eu=document.getElementById("ing-uds-prev");const ec=document.getElementById("ing-costo-prev");
  if(eu)eu.textContent=uds;if(ec)ec.textContent=fmt(sub);
  const met=document.getElementById("ing-metodo")?.value;
  const av=document.getElementById("ing-aviso-cc");
  if(av)av.style.display=met==="cuenta_prov"?"flex":"none";
}
function confirmarIngreso(){
  const pid=parseInt(document.getElementById("ing-prov").value);
  const prov=DB.proveedores.find(x=>x.id===pid);
  if(!prov)return;
  const items=ingRowsData.filter(r=>r.cantIngreso>0);
  if(!items.length){alert("Agregá al menos un producto con cantidad.");return;}
  const total=parseFloat(document.getElementById("ing-total-factura").value)||items.reduce((a,r)=>a+r.cantIngreso*r.nuevoCosto,0);
  const metodo=document.getElementById("ing-metodo").value;
  const caja=document.getElementById("ing-caja").value;
  items.forEach(r=>{
    const prod=DB.productos.find(x=>x.id===r.prodId);
    if(prod){const v=prod.variantes.find(x=>x.cod===r.cod);if(v)v.stock+=r.cantIngreso;if(r.nuevoCosto)prod.costo=r.nuevoCosto;}
  });
  if(metodo!=="cuenta_prov"){DB.cajas[caja].efectivo=Math.max(0,(DB.cajas[caja].efectivo||0)-total);}
  const newId=nextId(DB.proveedores.flatMap(p=>p.compras));
  prov.compras.unshift({id:newId,fecha:todayShort(),remito:document.getElementById("ing-remito").value||"",items:items.map(r=>({cod:r.cod,nombre:`${r.prodNombre} · ${r.c}/${r.t}`,cant:r.cantIngreso,costo:r.nuevoCosto})),total,metodo,caja,uds:items.reduce((a,r)=>a+r.cantIngreso,0)});
  DB.movimientos.unshift({id:nextId(DB.movimientos),fecha:todayShort(),hora:hora(),tipo:"gasto",concepto:`Compra a ${prov.nombre}`,caja,medio:metodo==="efectivo"?"efectivo":"transferencia",monto:total,signo:-1});
  persistDBSoon();
  closeOv("ov-ingreso-merch");
  renderSidebar();
  if(currentSub[currentMod]==="ingresos")renderIngresosPage();
  else renderProdLista();
}

/* ══════════════════════════════════════════
   MÓDULO VENTAS — PDV
══════════════════════════════════════════ */
let carritos=[{id:1,nombre:"Venta 1",items:[],clienteId:""}];
let carritoIdx=0;
let pdvFiltQ="",pdvFiltCat="",pdvFiltGen="";
function carrito(){return carritos[carritoIdx];}

function renderPDV(){
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
    <div class="pausados-strip" id="pausados-strip"></div>
    <div class="pdv-wrap">

      <!-- ── IZQUIERDA: buscador + filtros + grilla ── -->
      <div class="pdv-left">

        <!-- Buscador prominente -->
        <div style="position:relative;margin-bottom:10px;">
          <i class="ti ti-search" style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--gc);font-size:16px;pointer-events:none;"></i>
          <input type="text"
            placeholder="Buscar por nombre o código..."
            style="padding-left:38px;height:42px;font-size:14px;border-radius:9px;"
            oninput="pdvFiltQ=this.value;renderProdGrid()"
            value="${pdvFiltQ}"
            id="pdv-search-input"
          />
        </div>

        <!-- Filtros de categoría y género -->
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;align-items:center;">
          <span style="font-size:10px;color:var(--gc);font-weight:500;text-transform:uppercase;letter-spacing:.04em;margin-right:2px;">Categoría</span>
          <button class="btn-ghost btn-sm${!pdvFiltCat?" pdv-filt-on":""}" onclick="pdvFiltCat='';renderProdGrid()">Todas</button>
          ${categoriasDisponibles().map(c=>`<button class="btn-ghost btn-sm${(pdvFiltCat||"").toLowerCase()===c.nombre.toLowerCase()?" pdv-filt-on":""}" onclick="pdvFiltCat='${c.nombre}';renderProdGrid()">${c.nombre}</button>`).join("")}
          <div style="width:1px;height:18px;background:var(--crb);margin:0 4px;"></div>
          <button class="btn-ghost btn-sm${!pdvFiltGen?" pdv-filt-on":""}" onclick="pdvFiltGen='';renderProdGrid()">Ambos</button>
          <button class="btn-ghost btn-sm${pdvFiltGen==="Dama"?" pdv-filt-on":""}" onclick="pdvFiltGen='Dama';renderProdGrid()">Dama</button>
          <button class="btn-ghost btn-sm${pdvFiltGen==="Caballero"?" pdv-filt-on":""}" onclick="pdvFiltGen='Caballero';renderProdGrid()">Caballero</button>
        </div>

        <!-- Grilla de productos (vacía por defecto) -->
        <div id="pdv-grid-wrap">
          <div id="pdv-empty-state" style="display:none;"></div>
          <div class="prod-grid" id="prod-grid" style="display:none;"></div>
        </div>
      </div>

      <!-- ── DERECHA: carrito ── -->
      <div class="pdv-right">
        <div class="cart-header">
          <span style="font-size:13px;font-weight:500;display:flex;align-items:center;gap:5px;">
            <i class="ti ti-shopping-bag"></i><span id="cart-titulo">Venta 1</span>
          </span>
          <div style="display:flex;gap:4px;">
            <button class="btn-ghost btn-sm" onclick="pausarVenta()" title="Pausar venta"><i class="ti ti-player-pause"></i></button>
            <button class="btn-ghost btn-sm" onclick="limpiarCarrito()" title="Vaciar carrito"><i class="ti ti-trash"></i></button>
          </div>
        </div>

        <!-- Selector de cliente -->
        <div style="padding:7px 11px;border-bottom:0.5px solid var(--crb);background:var(--cr);">
          <select id="cli-sel" style="height:30px;font-size:12px;" onchange="onCliSelChange()">
            <option value="">Consumidor final</option>
            ${DB.clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join("")}
          </select>
        </div>

        <!-- Items del carrito -->
        <div class="cart-body" id="cart-body"></div>

        <!-- Totales + botón cobrar -->
        <div style="padding:11px 13px;border-top:0.5px solid var(--crb);background:var(--crd);">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--gt);margin-bottom:5px;">
            <span>Subtotal</span><span id="cf-sub">$0</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:15px;font-weight:500;padding-top:7px;border-top:0.5px solid var(--crb);margin-bottom:10px;">
            <span>Total</span><span id="cf-total">$0</span>
          </div>
          <button class="btn btn-ng" style="width:100%;justify-content:center;" onclick="abrirCobrar()">
            <i class="ti ti-credit-card"></i> Cobrar
          </button>
        </div>
      </div>
    </div>
  </div>`;
  renderPausados(); renderProdGrid(); renderCarrito();
  const cli=document.getElementById("cli-sel");
  if(cli && carrito().clienteId) cli.value=carrito().clienteId;
  // Focus en el buscador al abrir el PDV
  setTimeout(()=>{ const s=document.getElementById("pdv-search-input"); if(s)s.focus(); },50);
}

function renderProdGrid(){
  const q = (pdvFiltQ||"").trim().toLowerCase();
  const gridEl = document.getElementById("prod-grid");
  const emptyEl = document.getElementById("pdv-empty-state");
  if(!gridEl) return;

  // Mostrar grilla siempre
  gridEl.style.display = "grid";
  if(emptyEl) emptyEl.style.display = "none";

  // Filtrar
  const prods = DB.productos.filter(p => {
    const cat = (p.cat||"").toLowerCase();
    const filtCat = (pdvFiltCat||"").toLowerCase();
    const catOk = !filtCat || cat === filtCat;

    const gen = (p.gen||"").toLowerCase();
    const filtGen = (pdvFiltGen||"").toLowerCase();
    const genOk = !filtGen || gen === filtGen || gen.startsWith(filtGen.slice(0,3));

    const nombre = (p.nombre||"").toLowerCase();
    const codigo = (p.codigo||"").toLowerCase();
    const qOk = !q || nombre.includes(q) || codigo.includes(q);

    return catOk && genOk && qOk;
  });

  if(!prods.length){
    gridEl.innerHTML = `<div style="grid-column:1/-1;padding:32px;text-align:center;color:var(--gc);font-size:13px;">
      <i class="ti ti-mood-sad" style="font-size:24px;display:block;margin-bottom:8px;opacity:.3;"></i>
      Sin resultados</div>`;
    return;
  }

  gridEl.innerHTML = prods.map(p => {
    const t = stockTotal(p);
    const sn = t === 0;
    const clickable = !sn;
    return `<div class="prod-card${sn?" sn":""}" ${clickable?`onclick="selPdvProd(${p.id})"`:""} style="cursor:${clickable?"pointer":"default"};">
      <div class="pc-name">${p.nombre||""}</div>
      <div class="pc-code">${p.codigo||""}</div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:13px;font-weight:500;">${fmt(p.precio||0)}</span>
        ${sn
          ? `<span class="bd bd-rj" style="font-size:10px;">Sin stock</span>`
          : t<=3
            ? `<span class="bd bd-bj" style="font-size:10px;">${t} ud.</span>`
            : `<span class="bd bd-ok" style="font-size:10px;">${t} ud.</span>`}
      </div>
    </div>`;
  }).join("");
}


function selPdvProd(pid){
  const p=DB.productos.find(x=>x.id===pid);
  const vars=p.variantes.filter(v=>v.stock>0);
  if(vars.length===1){addToCarrito(p,vars[0]);return;}
  document.getElementById("ov-var-titulo").textContent=p.nombre;
  document.getElementById("ov-var-content").innerHTML=`<div style="display:flex;flex-direction:column;gap:7px;">`+
    p.variantes.map(v=>{const sn=v.stock===0;return`<div style="display:flex;align-items:center;justify-content:space-between;padding:9px 11px;background:var(--cr);border:0.5px solid var(--crb);border-radius:8px;cursor:${sn?"not-allowed":"pointer"};opacity:${sn?.4:1};" ${sn?"":` onclick="addToCarrito(${pid},'${v.cod}');closeOv('ov-var')"`}>
      <span style="font-size:13px;font-weight:500;">${v.c} / ${v.t}</span>
      ${sn?`<span class="bd bd-rj" style="font-size:10px;">Sin stock</span>`:v.stock<=3?`<span class="bd bd-bj" style="font-size:10px;">${v.stock} ud.</span>`:`<span class="bd bd-ok" style="font-size:10px;">${v.stock} ud.</span>`}
    </div>`;}).join("")+`</div>`;
  openOv("ov-var");
}

function addToCarrito(pid, vcod){
  const p=typeof pid==="number"?DB.productos.find(x=>x.id===pid):pid;
  const v=typeof vcod==="string"?p.variantes.find(x=>x.cod===vcod):vcod;
  const ex=carrito().items.find(x=>x.cod===v.cod);
  if(ex){if(ex.qty>=v.stock)return;ex.qty++;}
  else carrito().items.push({pid:p.id,cod:v.cod,nombre:p.nombre,color:v.c,talle:v.t,precio:p.precio,qty:1});
  renderCarrito();closeOv("ov-var");
}

function renderCarrito(){
  const el=document.getElementById("cart-body");if(!el)return;
  const cart=carrito();
  if(!cart.items.length){el.innerHTML=`<div class="cart-empty"><i class="ti ti-shopping-cart" style="font-size:26px;opacity:.25;"></i><span style="font-size:12px;">Sin productos</span></div>`;recalcPDV();return;}
  el.innerHTML=cart.items.map((item,i)=>`
    <div class="cart-item">
      <div class="ci-info">
        <div class="ci-name">${item.nombre}</div>
        <div class="ci-var">${item.color} / ${item.talle}</div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:4px;">
          <button class="qb" onclick="cambiarQty(${i},-1)">−</button>
          <span style="font-size:12px;font-weight:500;min-width:14px;text-align:center;">${item.qty}</span>
          <button class="qb" onclick="cambiarQty(${i},1)">+</button>
        </div>
      </div>
      <div>
        <div style="font-size:12px;font-weight:500;">${fmt(item.precio*item.qty)}</div>
        <button class="btn-icon" style="width:22px;height:22px;margin-top:4px;" onclick="carrito().items.splice(${i},1);renderCarrito()"><i class="ti ti-x" style="font-size:11px;"></i></button>
      </div>
    </div>`).join("");
  recalcPDV();
}

function cambiarQty(i,d){
  const item=carrito().items[i];const v=DB.productos.find(x=>x.id===item.pid)?.variantes.find(x=>x.cod===item.cod);
  const nq=item.qty+d;
  if(nq<=0)carrito().items.splice(i,1);
  else if(v&&nq>v.stock){}
  else item.qty=nq;
  renderCarrito();
}
function limpiarCarrito(){carrito().items=[];renderCarrito();}
function recalcPDV(){
  const sub=carrito().items.reduce((a,x)=>a+x.precio*x.qty,0);
  const s=document.getElementById("cf-sub");
  const t=document.getElementById("cf-total");
  if(s)s.textContent=fmt(sub);
  if(t)t.textContent=fmt(sub); // sin descuento en PDV; el desc va en el modal cobrar
}
function onPdvMetodo(){} // mantenido por compatibilidad — descuento ahora vive en el modal cobrar
function onCliSelChange(){
  const cid=document.getElementById("cli-sel")?.value;
  carrito().clienteId=cid;
  const opt=document.getElementById("pdv-opt-cc");
  if(opt)opt.disabled=!cid;
}
function pausarVenta(){
  if(!carrito().items.length)return;
  const id=carritos.length+1;
  carritos.push({id,nombre:`Venta ${id}`,items:[],clienteId:""});
  carritoIdx=carritos.length-1;
  renderPausados();renderCarrito();
  document.getElementById("cart-titulo").textContent=`Venta ${id}`;
  document.getElementById("cli-sel").value="";
}
function renderPausados(){
  const s=document.getElementById("pausados-strip");if(!s)return;
  const chips=carritos.filter((_,i)=>i!==carritoIdx&&carritos[i].items.length>0).map((c,_)=>`<div class="pausado-chip" onclick="activarCarrito(${carritos.indexOf(c)})"><i class="ti ti-pause" style="font-size:11px;"></i>${c.nombre} (${c.items.length})</div>`).join("");
  s.innerHTML=`<div class="add-cart-btn" onclick="nuevaVenta()"><i class="ti ti-plus" style="font-size:12px;"></i>Nueva venta</div>${chips}`;
}
function nuevaVenta(){pausarVenta();}
function activarCarrito(i){
  carritoIdx=i;
  const ct=document.getElementById("cart-titulo");
  if(ct)ct.textContent=carritos[i].nombre;
  const cs=document.getElementById("cli-sel");
  if(cs)cs.value=carritos[i].clienteId||"";
  renderPausados();renderCarrito();
}

/* ══════════════════════════════════════════
   SISTEMA DE PAGOS DIVIDIDOS
   Permite múltiples métodos con montos individuales
   La suma debe coincidir exactamente con el total
══════════════════════════════════════════ */

// Array de métodos de pago activos en el modal cobrar
// Cada ítem: { tipo: "efectivo"|"transferencia"|"debito"|"credito"|"cuenta", monto: Number }
let pagosMethods = [];

// Etiquetas legibles para cada tipo
const PAGO_LABELS = {
  efectivo:      "Efectivo",
  transferencia: "Transferencia",
  debito:        "Tarjeta débito",
  credito:       "Tarjeta crédito",
  cuenta:        "Cuenta corriente",
};

function abrirCobrar(){
  if(!carrito().items.length) return;

  // Inicializar con un método por defecto (efectivo)
  pagosMethods = [{ tipo:"efectivo", monto:0 }];

  const sub = carrito().items.reduce((a,x)=>a+x.precio*x.qty, 0);
  const cid = carrito().clienteId;
  const cl  = DB.clientes.find(x=>x.id==cid);

  document.getElementById("cobrar-desc").value = "0";
  document.getElementById("cobrar-items").textContent = `${carrito().items.reduce((a,x)=>a+x.qty,0)} productos`;
  document.getElementById("cobrar-cliente-label").textContent = cl ? cl.nombre : "Consumidor final";
  document.getElementById("cobrar-notif").innerHTML = "";

  // Deshabilitar cuenta corriente si no hay cliente seleccionado
  renderPagosList(cid);
  recalcCobrar();
  openOv("ov-cobrar");
}

// Agrega un nuevo método de pago vacío a la lista
function agregarMetodoPago(){
  pagosMethods.push({ tipo:"efectivo", monto:0 });
  renderPagosList(carrito().clienteId);
  recalcCobrar();
}

// Elimina un método de pago por índice
function eliminarMetodoPago(i){
  pagosMethods.splice(i, 1);
  // Siempre mantener al menos uno
  if(!pagosMethods.length) pagosMethods.push({ tipo:"efectivo", monto:0 });
  renderPagosList(carrito().clienteId);
  recalcCobrar();
}

// Renderiza la lista dinámica de métodos de pago
function renderPagosList(cid){
  const list = document.getElementById("cobrar-pagos-list");
  if(!list) return;

  list.innerHTML = pagosMethods.map((pm, i) => `
    <div style="display:grid;grid-template-columns:1fr 130px 28px;gap:7px;align-items:center;
         background:var(--cr);border:0.5px solid var(--crb);border-radius:8px;padding:9px 10px;">
      <!-- Tipo de método -->
      <select style="height:32px;font-size:12px;"
        onchange="pagosMethods[${i}].tipo=this.value;renderPagosList('${cid}');recalcCobrar()">
        <option value="efectivo"  ${pm.tipo==="efectivo"  ?"selected":""}>Efectivo</option>
        <option value="transferencia" ${pm.tipo==="transferencia"?"selected":""}>Transferencia</option>
        <option value="debito"    ${pm.tipo==="debito"    ?"selected":""}>Tarjeta débito</option>
        <option value="credito"   ${pm.tipo==="credito"   ?"selected":""}>Tarjeta crédito</option>
        <option value="cuenta"    ${pm.tipo==="cuenta"    ?"selected":""} ${!cid?"disabled":""}>Cuenta corriente</option>
      </select>
      <!-- Monto -->
      <input type="number" min="0" placeholder="$0"
        value="${pm.monto||""}"
        style="height:32px;text-align:right;font-size:13px;font-weight:500;"
        oninput="pagosMethods[${i}].monto=parseFloat(this.value)||0;recalcCobrar()"/>
      <!-- Eliminar -->
      <button class="btn-icon" style="width:28px;height:28px;"
        onclick="eliminarMetodoPago(${i})" title="Quitar método">
        <i class="ti ti-x" style="font-size:11px;"></i>
      </button>
    </div>`
  ).join("");
}

// Recalcula totales y maneja la opción de enviar resto a cuenta corriente
function recalcCobrar(){
  const sub   = carrito().items.reduce((a,x)=>a+x.precio*x.qty, 0);
  const desc  = parseFloat(document.getElementById("cobrar-desc")?.value)||0;
  const total = Math.round(sub*(1-desc/100));
  document.getElementById("cobrar-total").textContent = fmt(total);

  const sumaPagos = pagosMethods.reduce((a,pm)=>a+pm.monto, 0);
  const restante  = total - sumaPagos;

  const cid = carrito().clienteId;
  const cl  = DB.clientes.find(x=>x.id==cid);

  // Resumen pagado/restante
  const resumenEl = document.getElementById("cobrar-resumen-pagos");
  const sumaEl    = document.getElementById("cobrar-suma-pagos");
  const restEl    = document.getElementById("cobrar-restante-val");
  if(sumaPagos > 0 && resumenEl){
    resumenEl.style.display = "block";
    sumaEl.textContent = fmt(sumaPagos);
    restEl.textContent = fmt(Math.max(0, restante));
    restEl.style.color = restante > 0 ? "var(--am)" : "var(--vd)";
  } else if(resumenEl){
    resumenEl.style.display = "none";
  }

  // Opción cuenta corriente: solo visible si hay cliente y hay restante > 0
  const ctaWrap   = document.getElementById("cobrar-cta-cte-wrap");
  const ctaToggle = document.getElementById("cobrar-cta-cte-toggle");
  const ctaMonto  = document.getElementById("cobrar-cta-cte-monto");
  const usarCtaCte = ctaToggle?.checked && cl && restante > 0;

  if(ctaWrap){
    ctaWrap.style.display = (cl && restante > 1) ? "block" : "none";
    if(ctaMonto) ctaMonto.textContent = restante > 0 ? `(${fmt(restante)})` : "";
  }

  // Diferencia e indicador
  const divDiff = document.getElementById("cobrar-diferencia");
  const btnConf = document.getElementById("cobrar-btn-confirmar");
  const cubierto = usarCtaCte || Math.abs(restante) < 1;

  if(cubierto){
    if(divDiff) divDiff.style.display = "none";
    if(btnConf){ btnConf.disabled=false; btnConf.style.opacity="1"; }
  } else if(restante > 0){
    if(divDiff){
      divDiff.style.display="block";
      divDiff.style.background="var(--ambg)";
      divDiff.style.color="var(--am)";
      divDiff.style.border="0.5px solid var(--ambr)";
      divDiff.textContent=`Faltan ${fmt(restante)}`;
    }
    if(btnConf){ btnConf.disabled=true; btnConf.style.opacity=".45"; }
  } else {
    // Excedente (sumaPagos > total)
    if(divDiff){
      divDiff.style.display="block";
      divDiff.style.background="var(--azbg)";
      divDiff.style.color="var(--az)";
      divDiff.style.border="0.5px solid var(--azbr)";
      divDiff.textContent=`Excedente ${fmt(Math.abs(restante))} — se registrará como cambio`;
    }
    if(btnConf){ btnConf.disabled=false; btnConf.style.opacity="1"; }
  }
}

function procesarVenta(){
  const sub   = carrito().items.reduce((a,x)=>a+x.precio*x.qty, 0);
  const desc  = parseFloat(document.getElementById("cobrar-desc")?.value)||0;
  const total = Math.round(sub*(1-desc/100));
  const sumaPagos = pagosMethods.reduce((a,pm)=>a+pm.monto, 0);
  const restante  = total - sumaPagos;

  const cid = carrito().clienteId;
  const cl  = DB.clientes.find(x=>x.id==cid);

  // Verificar si se usa cta corriente para el resto
  const ctaToggle = document.getElementById("cobrar-cta-cte-toggle");
  const usarCtaCte = ctaToggle?.checked && cl && restante > 0;

  // Validación: falta dinero y no se activa cta cte
  if(restante > 0.5 && !usarCtaCte){
    document.getElementById("cobrar-diferencia").textContent = `Faltan ${fmt(restante)} para confirmar`;
    return;
  }

  const items = carrito().items.map(x=>`${x.nombre} × ${x.qty}`).join(", ");

  // ── Descontar stock ──
  carrito().items.forEach(item=>{
    const p=DB.productos.find(x=>x.id===item.pid);
    if(p){ const v=p.variantes.find(x=>x.cod===item.cod); if(v) v.stock=Math.max(0,v.stock-item.qty); }
  });

  const cajaMap = { efectivo:"efectivo", transferencia:"mercadopago", debito:"debito", credito:"credito" };
  const metLabels = [];
  let cajaRealVenta = 0;
  let primerMedioReal = "";

  // ── Registrar cada método de pago ──
  pagosMethods.forEach(pm=>{
    if(!pm.monto) return;
    if(pm.tipo==="cuenta" && cl){
      cl.deuda += pm.monto;
      cl.historial.unshift({ fecha:todayShort(), concepto:`Compra — ${carrito().items[0]?.nombre||""}`, monto:pm.monto, tipo:"cargo", pts:Math.round(pm.monto/1000) });
    } else {
      const campo = cajaMap[pm.tipo] || "efectivo";
      DB.cajas.principal[campo] = (DB.cajas.principal[campo]||0) + pm.monto;
      cajaRealVenta += pm.monto;
      if(!primerMedioReal)primerMedioReal=campo;
    }
    metLabels.push(PAGO_LABELS[pm.tipo]||pm.tipo);
  });

  // ── Si el resto va a cuenta corriente ──
  if(usarCtaCte && restante > 0){
    cl.deuda += restante;
    cl.historial.unshift({ fecha:todayShort(), concepto:`Saldo en cta cte — ${carrito().items[0]?.nombre||""}`, monto:restante, tipo:"cargo", pts:0 });
    metLabels.push("Cta. cte.");
  }

  const metLabel = [...new Set(metLabels)].join(" + ");

  // ── Registrar la venta ──
  DB.ventas.unshift({ id:nextId(DB.ventas), fecha:todayShort(), hora:hora(), cliente:cl?cl.nombre:"Consumidor final", items, metodo:metLabel, total });
  if(cajaRealVenta>0){
    DB.movimientos.unshift({ id:nextId(DB.movimientos), fecha:todayShort(), fechaISO:new Date().toISOString().slice(0,10), hora:hora(), tipo:"venta", concepto:`Venta #${DB.ventas[0].id} — ${carrito().items[0]?.nombre||""}`, caja:"principal", medio:primerMedioReal||"efectivo", monto:cajaRealVenta, signo:1 });
  }

  // ── Puntos ──
  if(cl){ const pts=Math.round(total/1000); cl.puntos+=pts; cl.comprasTotal+=total; if(cl.puntos>=500)cl.nivel="Oro"; else if(cl.puntos>=200)cl.nivel="Plata"; else if(cl.puntos>=50)cl.nivel="Bronce"; }

  // ── Limpiar ──
  carritos[carritoIdx].items=[];
  pagosMethods=[{tipo:"efectivo",monto:0}];
  persistDBSoon();
  closeOv("ov-cobrar");
  renderCarrito(); renderProdGrid(); renderPausados(); renderSidebar();
}

/* ── Devoluciones ── */
function renderDevoluciones(){
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Devoluciones</div><div class="ps">Generan saldo a favor · no devolución de dinero</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirDevolucion()"><i class="ti ti-plus"></i>Registrar devolución</button></div>
    <div style="padding:14px 18px;flex:1;overflow-y:auto;">
      <div class="tw"><table>
        <colgroup><col style="width:50px"><col style="width:70px"><col style="width:130px"><col><col style="width:100px"><col style="width:90px"><col style="width:50px"></colgroup>
        <thead><tr><th>#</th><th>Fecha</th><th>Cliente</th><th>Producto</th><th>Motivo</th><th>Saldo favor</th><th></th></tr></thead>
        <tbody>${DB.devoluciones.map(d=>`<tr>
          <td style="color:var(--gc);font-size:10px;">#${d.id}</td>
          <td style="color:var(--gt);">${d.fecha}</td>
          <td style="font-size:12px;">${d.cliente}</td>
          <td style="font-size:11px;color:var(--gt);">${d.producto}</td>
          <td><span class="bd bd-az" style="font-size:10px;">${d.motivo}</span></td>
          <td style="font-weight:500;color:var(--vd);">${fmt(d.monto)}</td>
          <td></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}
function abrirDevolucion(){
  const ds=document.getElementById("dev-cliente");
  ds.innerHTML=`<option value="">Consumidor final</option>`+DB.clientes.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join("");
  const dp=document.getElementById("dev-prod");
  dp.innerHTML=DB.productos.flatMap(p=>p.variantes.map(v=>`<option value="${v.cod}">${p.nombre} — ${v.c}/${v.t}</option>`)).join("");
  openOv("ov-dev");
}
function procesarDevolucion(){
  const cid=document.getElementById("dev-cliente").value;
  const cl=DB.clientes.find(x=>x.id==cid);
  const cod=document.getElementById("dev-prod").value;
  const monto=parseFloat(document.getElementById("dev-monto").value)||0;
  const motivo=document.getElementById("dev-motivo").value;
  if(!monto)return;
  if(cl){cl.saldoFavor+=monto;cl.historial.unshift({fecha:todayShort(),concepto:"Devolución — saldo a favor",monto,tipo:"favor",pts:0});}
  const v=DB.productos.flatMap(p=>p.variantes).find(x=>x.cod===cod);if(v)v.stock+=1;
  DB.devoluciones.unshift({id:nextId(DB.devoluciones),fecha:todayShort(),cliente:cl?cl.nombre:"Consumidor final",producto:cod,motivo,monto});
  persistDBSoon();
  closeOv("ov-dev");renderDevoluciones();
}

/* ── Historial ventas ── */
function renderHistorialVentas(){
  const total=DB.ventas.reduce((a,v)=>a+v.total,0);
  const hoy=DB.ventas.filter(v=>v.fecha===todayShort());
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Historial de ventas</div><div class="ps">Registro completo</div></div></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px 18px;">
      <div class="sc"><div class="sl">Ventas hoy</div><div class="sv">${hoy.length}</div><div class="ss">${fmt(hoy.reduce((a,v)=>a+v.total,0))}</div></div>
      <div class="sc"><div class="sl">Ventas totales</div><div class="sv">${DB.ventas.length}</div></div>
      <div class="sc"><div class="sl">Ticket promedio</div><div class="sv">${DB.ventas.length?fmt(Math.round(total/DB.ventas.length)):"$—"}</div></div>
      <div class="sc"><div class="sl">Total acumulado</div><div class="sv">${fmt(total)}</div></div>
    </div>
    <div style="padding:0 18px 18px;flex:1;overflow-y:auto;">
      <div class="tw"><table>
        <colgroup><col style="width:50px"><col style="width:70px"><col style="width:55px"><col style="width:120px"><col><col style="width:90px"><col style="width:90px"></colgroup>
        <thead><tr><th>#</th><th>Fecha</th><th>Hora</th><th>Cliente</th><th>Productos</th><th>Método</th><th>Total</th></tr></thead>
        <tbody>${DB.ventas.map(v=>`<tr>
          <td style="color:var(--gc);font-size:10px;">#${v.id}</td>
          <td style="color:var(--gt);">${v.fecha}</td>
          <td style="color:var(--gc);font-size:11px;">${v.hora}</td>
          <td style="font-size:11px;">${v.cliente}</td>
          <td style="font-size:11px;color:var(--gt);">${v.items}</td>
          <td><span class="bd ${v.metodo==="Efectivo"?"bd-ok":v.metodo==="Cuenta cte."?"bd-bj":"bd-az"}" style="font-size:10px;">${v.metodo}</span></td>
          <td style="font-weight:500;">${fmt(v.total)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════
   MÓDULO CLIENTES
══════════════════════════════════════════ */
let cliFiltQ="",cliFiltEst="",cliFiltNiv="";
let editingClienteId=null;
function dateInputToDisplay(value){
  if(!value)return "—";
  const [y,m,d]=value.split("-");
  return y&&m&&d?`${d}/${m}/${y}`:"—";
}
function displayToDateInput(value){
  const m=String(value||"").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m?`${m[3]}-${m[2]}-${m[1]}`:"";
}
function refreshClienteEstado(c){
  if(!c.deuda){c.estado="ok";c.vence="—";return;}
  if(!c.vence||c.vence==="—"){c.estado="vencida";return;}
  const iso=displayToDateInput(c.vence);
  if(!iso){c.estado="vencida";return;}
  const todayDate=new Date();todayDate.setHours(0,0,0,0);
  const due=new Date(iso+"T00:00:00");
  const diff=(due-todayDate)/86400000;
  c.estado=diff<0?"vencida":diff<=7?"proximo":"ok";
}
function renderClientesLista(){
  const list=DB.clientes.filter(c=>{
    const q=cliFiltQ.toLowerCase();
    return(!q||c.nombre.toLowerCase().includes(q)||c.tel.includes(q))&&
      (!cliFiltEst||c.estado===cliFiltEst)&&(!cliFiltNiv||c.nivel===cliFiltNiv);
  });
  const conDeuda=DB.clientes.filter(c=>c.deuda>0).length;
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Clientes</div><div class="ps">${DB.clientes.length} clientes registrados</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirNuevoCliente()"><i class="ti ti-plus"></i>Nuevo cliente</button></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px 18px;">
      <div class="sc"><div class="sl">Total clientes</div><div class="sv">${DB.clientes.length}</div></div>
      <div class="sc"><div class="sl">Con deuda activa</div><div class="sv" style="color:var(--am);">${conDeuda}</div><div class="ss">${fmt(DB.clientes.reduce((a,c)=>a+c.deuda,0))} total</div></div>
      <div class="sc"><div class="sl">Saldo a favor</div><div class="sv" style="color:var(--vd);">${DB.clientes.filter(c=>c.saldoFavor>0).length}</div></div>
      <div class="sc"><div class="sl">Deudas vencidas</div><div class="sv" style="color:var(--rj);">${DB.clientes.filter(c=>c.estado==="vencida").length}</div></div>
    </div>
    <div style="display:flex;gap:7px;padding:0 18px 10px;">
      <div style="flex:1;position:relative;"><i class="ti ti-search" style="position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--gc);font-size:14px;"></i><input type="text" placeholder="Buscar por nombre o teléfono..." style="padding-left:30px;" value="${cliFiltQ}" oninput="cliFiltQ=this.value;renderClientesLista()"/></div>
      <select style="height:34px;font-size:12px;width:140px;" onchange="cliFiltEst=this.value;renderClientesLista()"><option value="">Todos los estados</option><option value="ok"${cliFiltEst==="ok"?" selected":""}>Sin deuda</option><option value="proximo"${cliFiltEst==="proximo"?" selected":""}>Próximo a vencer</option><option value="vencida"${cliFiltEst==="vencida"?" selected":""}>Vencida</option></select>
      <select style="height:34px;font-size:12px;width:120px;" onchange="cliFiltNiv=this.value;renderClientesLista()"><option value="">Todos niveles</option><option value="Oro">Oro</option><option value="Plata">Plata</option><option value="Bronce">Bronce</option><option value="Nuevo">Nuevo</option></select>
    </div>
    <div style="padding:0 18px 18px;flex:1;overflow-y:auto;">
      <div class="tw"><table>
        <colgroup><col><col style="width:100px"><col style="width:75px"><col style="width:85px"><col style="width:80px"><col style="width:80px"><col style="width:80px"><col style="width:86px"></colgroup>
        <thead><tr><th>Cliente</th><th>Teléfono</th><th>Nivel</th><th>Deuda</th><th>Saldo favor</th><th>Puntos</th><th>Estado</th><th></th></tr></thead>
        <tbody>${list.map((c,i)=>`<tr onclick="verFichaCli(${c.id})">
          <td><div style="display:flex;align-items:center;gap:8px;"><div class="avatar ${avCol(i)}" style="width:28px;height:28px;font-size:10px;">${initials(c.nombre)}</div><div><div style="font-size:12px;font-weight:500;">${c.nombre}</div><div style="font-size:10px;color:var(--gc);">${c.registro}</div></div></div></td>
          <td style="font-size:11px;color:var(--gt);">${c.tel}</td>
          <td>${nivelBadge(c.nivel)}</td>
          <td style="font-weight:${c.deuda>0?"500":"400"};color:${c.deuda>0?"var(--ng)":"var(--gc)"};">${c.deuda>0?fmt(c.deuda):"—"}</td>
          <td style="color:${c.saldoFavor>0?"var(--vd)":"var(--gc)"};">${c.saldoFavor>0?fmt(c.saldoFavor):"—"}</td>
          <td><div style="font-size:12px;font-weight:500;">${c.puntos}</div><div class="pts-bar" style="width:55px;margin-top:3px;"><div class="pts-fill" style="width:${Math.min(100,c.puntos/5)}%;"></div></div></td>
          <td>${estadoBadgeCli(c.estado)}</td>
          <td><div style="display:flex;gap:4px;"><button class="btn-ghost btn-sm" style="padding:3px 7px;" onclick="event.stopPropagation();verFichaCli(${c.id})"><i class="ti ti-eye"></i></button><button class="btn-ghost btn-sm" style="padding:3px 7px;" onclick="event.stopPropagation();editarCliente(${c.id})"><i class="ti ti-pencil"></i></button><button class="btn-ghost btn-sm" style="padding:3px 7px;color:var(--rj);" onclick="event.stopPropagation();eliminarCliente(${c.id})"><i class="ti ti-trash"></i></button></div></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}

function verFichaCli(id){
  const c=DB.clientes.find(x=>x.id===id);
  const i=DB.clientes.findIndex(x=>x.id===id);
  const pct=Math.min(100,Math.round(c.deuda/c.limite*100));
  const fc=c.estado==="vencida"?"var(--rj)":c.estado==="proximo"?"var(--am)":"var(--vd)";
  const ptsNext={Nuevo:50,Bronce:200,Plata:500,Oro:9999}[c.nivel]||9999;
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
    <div class="ph">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn-ghost btn-sm" onclick="showSub('clientes-lista')"><i class="ti ti-arrow-left"></i>Volver</button>
        <div style="display:flex;align-items:center;gap:9px;"><div class="avatar ${avCol(i)}" style="width:34px;height:34px;font-size:12px;">${initials(c.nombre)}</div><div><div class="pt">${c.nombre}</div><div class="ps">${c.nivel} · ${c.tel}</div></div></div>
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-out btn-sm" onclick="editarCliente(${c.id})"><i class="ti ti-pencil"></i>Editar</button>
        <button class="btn btn-out btn-sm" onclick="abrirPagoCli(${c.id})"><i class="ti ti-currency-dollar"></i>Registrar pago</button>
        <button class="btn btn-out btn-sm" style="color:var(--rj);" onclick="eliminarCliente(${c.id})"><i class="ti ti-trash"></i>Eliminar</button>
      </div>
    </div>
    <div class="ficha-grid">
      <div class="ficha-left">
        <div class="sect-title">Información personal</div>
        <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 12px;margin-bottom:14px;">
          <div class="info-row"><span class="ir-label"><i class="ti ti-phone" style="font-size:12px;margin-right:4px;"></i>Teléfono</span><span class="ir-val">${c.tel}</span></div>
          <div class="info-row"><span class="ir-label"><i class="ti ti-map-pin" style="font-size:12px;margin-right:4px;"></i>Dirección</span><span class="ir-val">${c.dir||"—"}</span></div>
          <div class="info-row"><span class="ir-label"><i class="ti ti-calendar" style="font-size:12px;margin-right:4px;"></i>Cliente desde</span><span class="ir-val">${c.registro}</span></div>
          ${c.obs?`<div style="padding-top:7px;font-size:11px;color:var(--gc);">${c.obs}</div>`:""}
        </div>
        <div class="sect-title">Cuenta corriente</div>
        <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 12px;margin-bottom:14px;">
          <div class="info-row"><span class="ir-label">Estado</span>${estadoBadgeCli(c.estado)}</div>
          <div class="info-row"><span class="ir-label">Deuda actual</span><span class="ir-val" style="color:${c.deuda>0?"var(--ng)":"var(--gc)"};">${fmt(c.deuda)}</span></div>
          <div class="info-row"><span class="ir-label">Saldo a favor</span><span class="ir-val" style="color:${c.saldoFavor>0?"var(--vd)":"var(--gc)"};">${c.saldoFavor>0?fmt(c.saldoFavor):"—"}</span></div>
          <div class="info-row"><span class="ir-label">Límite crédito</span><span class="ir-val">${fmt(c.limite)}</span></div>
          <div class="info-row"><span class="ir-label">Vencimiento</span><span class="ir-val">${c.vence}</span></div>
          <div style="margin-top:8px;font-size:10px;color:var(--gc);margin-bottom:3px;">Uso ${pct}% del límite</div>
          <div class="deuda-bar"><div class="deuda-fill" style="width:${pct}%;background:${fc};"></div></div>
        </div>
        <div class="sect-title">Fidelización</div>
        <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 12px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;"><div><div style="font-size:22px;font-weight:500;">${c.puntos}</div><div style="font-size:10px;color:var(--gc);">puntos acumulados</div></div>${nivelBadge(c.nivel)}</div>
          <div style="font-size:10px;color:var(--gc);margin-bottom:3px;">Progreso al siguiente nivel</div>
          <div class="pts-bar"><div class="pts-fill" style="width:${Math.min(100,Math.round(c.puntos/ptsNext*100))}%;"></div></div>
          <div class="info-row" style="margin-top:8px;"><span class="ir-label">Compras totales</span><span class="ir-val">${fmt(c.comprasTotal)}</span></div>
        </div>
      </div>
      <div class="ficha-right">
        <div class="sect-title">Historial completo</div>
        <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:8px 12px;">
          ${c.historial.length?c.historial.map(h=>`
            <div class="mov-item">
              <div style="display:flex;align-items:center;gap:8px;">
                <div class="mi-icon ${h.tipo==="cargo"?"mi-cargo":h.tipo==="abono"?"mi-abono":h.tipo==="puntos"?"mi-puntos":"mi-favor"}">
                  <i class="ti ti-${h.tipo==="cargo"?"arrow-up":h.tipo==="abono"?"arrow-down":h.tipo==="puntos"?"star":"refresh"}" style="font-size:12px;"></i>
                </div>
                <div><div style="font-size:12px;font-weight:500;">${h.concepto}</div><div style="font-size:10px;color:var(--gc);">${h.fecha}${h.pts>0?" · +"+h.pts+" pts":""}</div></div>
              </div>
              <div style="text-align:right;">
                ${h.monto>0?`<div style="font-size:12px;font-weight:500;color:${h.tipo==="cargo"?"var(--rj)":"var(--vd)"};">${h.tipo==="cargo"?"+":"−"}${fmt(h.monto)}</div>`:""}
              </div>
            </div>`).join(""):`<div style="padding:20px;text-align:center;color:var(--gc);font-size:12px;">Sin movimientos registrados</div>`}
        </div>
      </div>
    </div>
  </div>`;
}

function renderCuentaCorriente(){
  const conDeuda=DB.clientes.filter(c=>c.deuda>0);
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Cuenta corriente</div><div class="ps">Seguimiento de deudas y pagos</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirPagoCli(null)"><i class="ti ti-currency-dollar"></i>Registrar pago</button></div>
    <div style="padding:14px 18px;flex:1;overflow-y:auto;">
      ${conDeuda.length?conDeuda.map((c,i)=>{
        const pct=Math.min(100,Math.round(c.deuda/c.limite*100));
        const fc=c.estado==="vencida"?"var(--rj)":c.estado==="proximo"?"var(--am)":"var(--vd)";
        return`<div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:10px;padding:14px 16px;margin-bottom:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
            <div style="display:flex;align-items:center;gap:9px;"><div class="avatar ${avCol(i)}" style="width:36px;height:36px;">${initials(c.nombre)}</div><div><div style="font-size:13px;font-weight:500;">${c.nombre}</div><div style="font-size:10px;color:var(--gc);">${c.tel} · Vence: ${c.vence}</div></div></div>
            <div style="display:flex;gap:6px;align-items:center;">${estadoBadgeCli(c.estado)}<button class="btn btn-ng btn-sm" onclick="abrirPagoCli(${c.id})"><i class="ti ti-currency-dollar"></i>Cobrar</button></div>
          </div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:10px;">
            <div style="background:var(--cr);border-radius:7px;padding:7px 9px;"><div style="font-size:10px;color:var(--gc);">Deuda</div><div style="font-size:14px;font-weight:500;color:${c.estado==="vencida"?"var(--rj)":c.estado==="proximo"?"var(--am)":"var(--ng)"};">${fmt(c.deuda)}</div></div>
            <div style="background:var(--cr);border-radius:7px;padding:7px 9px;"><div style="font-size:10px;color:var(--gc);">Límite</div><div style="font-size:14px;font-weight:500;">${fmt(c.limite)}</div></div>
            <div style="background:var(--cr);border-radius:7px;padding:7px 9px;"><div style="font-size:10px;color:var(--gc);">Saldo favor</div><div style="font-size:14px;font-weight:500;color:${c.saldoFavor>0?"var(--vd)":"var(--gc)"};">${c.saldoFavor>0?fmt(c.saldoFavor):"—"}</div></div>
            <div style="background:var(--cr);border-radius:7px;padding:7px 9px;"><div style="font-size:10px;color:var(--gc);">Uso</div><div style="font-size:14px;font-weight:500;">${pct}%</div></div>
          </div>
          <div class="deuda-bar"><div class="deuda-fill" style="width:${pct}%;background:${fc};"></div></div>
        </div>`;}).join(""):`<div style="text-align:center;padding:40px;color:var(--gc);">Sin deudas activas</div>`}
    </div>
  </div>`;
}

function renderFidelizacion(){
  const sorted=[...DB.clientes].sort((a,b)=>b.puntos-a.puntos);
  const total=DB.clientes.reduce((a,c)=>a+c.puntos,0);
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Fidelización</div><div class="ps">Puntos · niveles · beneficios</div></div></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px 18px;">
      <div class="sc"><div class="sl">Clientes activos</div><div class="sv">${DB.clientes.length}</div></div>
      <div class="sc"><div class="sl">Puntos otorgados</div><div class="sv">${total}</div></div>
      <div class="sc"><div class="sl">Nivel Oro</div><div class="sv" style="color:#633806;">${DB.clientes.filter(c=>c.nivel==="Oro").length}</div></div>
      <div class="sc"><div class="sl">Nivel Plata</div><div class="sv">${DB.clientes.filter(c=>c.nivel==="Plata").length}</div></div>
    </div>
    <div style="padding:0 18px 18px;flex:1;overflow-y:auto;">
      <div class="sect-title" style="margin-bottom:10px;">Ranking de clientes</div>
      <div class="tw"><table>
        <colgroup><col style="width:30px"><col><col style="width:80px"><col style="width:80px"><col style="width:100px"><col style="width:80px"></colgroup>
        <thead><tr><th>#</th><th>Cliente</th><th>Nivel</th><th>Puntos</th><th>Compras totales</th><th>Último mov.</th></tr></thead>
        <tbody>${sorted.map((c,i)=>`<tr onclick="verFichaCli(${c.id})">
          <td style="color:var(--gc);font-weight:500;">${i+1}</td>
          <td><div style="display:flex;align-items:center;gap:7px;"><div class="avatar ${avCol(i)}" style="width:26px;height:26px;font-size:10px;">${initials(c.nombre)}</div>${c.nombre}</div></td>
          <td>${nivelBadge(c.nivel)}</td>
          <td><div style="font-size:13px;font-weight:500;">${c.puntos}</div><div class="pts-bar" style="width:60px;margin-top:3px;"><div class="pts-fill" style="width:${Math.min(100,c.puntos/5)}%;"></div></div></td>
          <td>${fmt(c.comprasTotal)}</td>
          <td style="color:var(--gc);font-size:11px;">${c.historial[0]?.fecha||"—"}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}

function renderAlertasCli(){
  const vencidas=DB.clientes.filter(c=>c.estado==="vencida");
  const proximas=DB.clientes.filter(c=>c.estado==="proximo");
  const favor=DB.clientes.filter(c=>c.saldoFavor>0);
  let html=`<div class="ph"><div><div class="pt">Alertas</div><div class="ps">Deudas vencidas · próximas a vencer · saldos a favor</div></div></div><div class="scroll">`;
  if(vencidas.length){html+=`<div class="sect-title">Deudas vencidas</div>`;html+=vencidas.map(c=>`<div class="notif notif-rj" style="margin-bottom:7px;"><i class="ti ti-alert-circle" style="font-size:16px;flex-shrink:0;"></i><div style="flex:1;"><div style="font-weight:500;">${c.nombre}</div><div style="font-size:11px;margin-top:1px;">Deuda: ${fmt(c.deuda)} · Venció: ${c.vence}</div></div><button class="btn btn-sm" style="background:var(--rjbg);color:var(--rj);border:0.5px solid var(--rjbr);" onclick="abrirPagoCli(${c.id})">Cobrar</button></div>`).join("");}
  if(proximas.length){html+=`<div class="sect-title" style="margin-top:14px;">Próximas a vencer</div>`;html+=proximas.map(c=>`<div class="notif notif-am" style="margin-bottom:7px;"><i class="ti ti-clock" style="font-size:16px;flex-shrink:0;"></i><div style="flex:1;"><div style="font-weight:500;">${c.nombre}</div><div style="font-size:11px;margin-top:1px;">Deuda: ${fmt(c.deuda)} · Vence: ${c.vence}</div></div><button class="btn btn-sm" style="background:var(--ambg);color:var(--am);border:0.5px solid var(--ambr);" onclick="abrirPagoCli(${c.id})">Cobrar</button></div>`).join("");}
  if(favor.length){html+=`<div class="sect-title" style="margin-top:14px;">Saldo a favor disponible</div>`;html+=favor.map(c=>`<div class="notif notif-vd" style="margin-bottom:7px;"><i class="ti ti-star" style="font-size:16px;flex-shrink:0;"></i><div><div style="font-weight:500;">${c.nombre}</div><div style="font-size:11px;margin-top:1px;">Disponible: ${fmt(c.saldoFavor)}</div></div></div>`).join("");}
  if(!vencidas.length&&!proximas.length&&!favor.length)html+=`<div style="text-align:center;padding:40px;color:var(--gc);">Sin alertas activas</div>`;
  html+=`<div class="notif notif-pu" style="margin-top:20px;"><i class="ti ti-brand-whatsapp" style="font-size:16px;flex-shrink:0;"></i><div><div style="font-weight:500;">Integración WhatsApp <span class="bd bd-pu" style="font-size:10px;">Próximamente</span></div><div style="font-size:11px;margin-top:1px;">Recordatorios automáticos · avisos de vencimiento · promociones</div></div></div></div>`;
  document.getElementById("main-area").innerHTML=`<div style="display:flex;flex-direction:column;flex:1;">${html}</div>`;
}

function abrirNuevoCliente(){
  editingClienteId=null;
  ["nc-nombre","nc-apellido","nc-tel","nc-dir","nc-obs"].forEach(id=>document.getElementById(id).value="");
  document.getElementById("nc-limite").value="50000";
  document.getElementById("nc-dias").value="30";
  document.getElementById("nc-deuda").value="0";
  document.getElementById("nc-vence").value="";
  openOv("ov-nuevo-cliente");
}
function editarCliente(id){
  const c=DB.clientes.find(x=>x.id===id);if(!c)return;
  editingClienteId=id;
  const parts=c.nombre.split(" ");
  document.getElementById("nc-nombre").value=parts.shift()||c.nombre;
  document.getElementById("nc-apellido").value=parts.join(" ");
  document.getElementById("nc-tel").value=c.tel||"";
  document.getElementById("nc-dir").value=c.dir||"";
  document.getElementById("nc-obs").value=c.obs||"";
  document.getElementById("nc-limite").value=c.limite||50000;
  document.getElementById("nc-dias").value=c.diasPlazo||30;
  document.getElementById("nc-deuda").value=c.deuda||0;
  document.getElementById("nc-vence").value=displayToDateInput(c.vence);
  openOv("ov-nuevo-cliente");
}
function guardarCliente(){
  const nom=document.getElementById("nc-nombre").value.trim();
  if(!nom)return;
  const ape=document.getElementById("nc-apellido").value.trim();
  const deuda=parseFloat(document.getElementById("nc-deuda").value)||0;
  const payload={nombre:`${nom} ${ape}`.trim(),tel:document.getElementById("nc-tel").value||"—",dir:document.getElementById("nc-dir").value||"",obs:document.getElementById("nc-obs").value||"",deuda,limite:parseFloat(document.getElementById("nc-limite").value)||50000,vence:dateInputToDisplay(document.getElementById("nc-vence").value),diasPlazo:parseInt(document.getElementById("nc-dias").value)||30};
  let c;
  if(editingClienteId){
    c=DB.clientes.find(x=>x.id===editingClienteId);
    Object.assign(c,payload);
  }else{
    c={id:nextId(DB.clientes),...payload,registro:today(),estado:"ok",saldoFavor:0,puntos:0,nivel:"Nuevo",comprasTotal:0,historial:[]};
    if(deuda>0)c.historial.unshift({fecha:todayShort(),concepto:"Saldo inicial importado/manual",monto:deuda,tipo:"cargo",pts:0});
    DB.clientes.push(c);
  }
  refreshClienteEstado(c);
  editingClienteId=null;
  persistDBSoon();
  closeOv("ov-nuevo-cliente");renderClientesLista();renderSidebar();
}
function eliminarCliente(id){
  const c=DB.clientes.find(x=>x.id===id);if(!c)return;
  if(!confirm(`Eliminar cliente ${c.nombre}? Esta accion no borra ventas historicas.`))return;
  DB.clientes=DB.clientes.filter(x=>x.id!==id);
  persistDBSoon();
  showSub("clientes-lista");
}
function abrirPagoCli(id){
  const sel=document.getElementById("pago-cli");
  sel.innerHTML=`<option value="">Seleccionar cliente...</option>`+DB.clientes.filter(c=>c.deuda>0).map(c=>`<option value="${c.id}">${c.nombre} — ${fmt(c.deuda)}</option>`).join("");
  if(id)sel.value=id;
  document.getElementById("pago-cli-monto").value="";
  document.getElementById("pago-cli-info").style.display="none";
  onPagoCliChange();openOv("ov-pago-cliente");
}
function onPagoCliChange(){
  const id=document.getElementById("pago-cli").value;
  const c=DB.clientes.find(x=>x.id==id);
  const info=document.getElementById("pago-cli-info");
  if(c&&c.deuda>0){info.style.display="block";document.getElementById("pago-cli-deuda").textContent=fmt(c.deuda);document.getElementById("pago-cli-favor").textContent=fmt(c.saldoFavor);document.getElementById("pago-cli-monto").value=c.deuda;recalcPagoCli();}
  else info.style.display="none";
}
function recalcPagoCli(){
  const id=document.getElementById("pago-cli").value;const c=DB.clientes.find(x=>x.id==id);if(!c)return;
  const m=parseFloat(document.getElementById("pago-cli-monto").value)||0;
  const r=Math.max(0,c.deuda-m);
  document.getElementById("pago-cli-resto").textContent=fmt(r);
  document.getElementById("pago-cli-tipo").textContent=r===0?"Pago completo":"Pago parcial";
}
function procesarPagoCli(){
  const id=document.getElementById("pago-cli").value;const c=DB.clientes.find(x=>x.id==id);if(!c)return;
  const m=parseFloat(document.getElementById("pago-cli-monto").value)||0;if(!m)return;
  c.deuda=Math.max(0,c.deuda-m);
  if(c.deuda===0){c.estado="ok";c.vence="—";}
  const metodoPago=document.getElementById("pago-cli-metodo").value;
  const medio=metodoPago==="Transferencia"?"mercadopago":metodoPago==="Débito"?"debito":"efectivo";
  c.historial.unshift({fecha:todayShort(),concepto:`Pago — ${metodoPago}`,monto:m,tipo:"abono",pts:0});
  DB.cajas.principal[medio]=(DB.cajas.principal[medio]||0)+m;
  DB.movimientos.unshift({id:nextId(DB.movimientos),fecha:todayShort(),fechaISO:new Date().toISOString().slice(0,10),hora:hora(),tipo:"pago_cliente",concepto:`Cobro cta cte — ${c.nombre}`,caja:"principal",medio,monto:m,signo:1});
  persistDBSoon();
  closeOv("ov-pago-cliente");
  renderSidebar();
  const sub=currentSub[currentMod];
  if(sub==="clientes-lista")renderClientesLista();
  else if(sub==="cuenta-corriente")renderCuentaCorriente();
  else if(sub==="alertas-cli")renderAlertasCli();
}

/* ══════════════════════════════════════════
   MÓDULO CAJA
══════════════════════════════════════════ */
function renderCajaResumen(){
  const totP=totalCaja("principal");const totR=totalCaja("reinversion");
  const vHoy=DB.movimientos.filter(m=>m.fecha===todayShort()&&m.tipo==="venta").reduce((a,m)=>a+m.monto,0);
  const gHoy=DB.movimientos.filter(m=>m.fecha===todayShort()&&m.tipo==="gasto").reduce((a,m)=>a+m.monto,0);
  const cHoy=DB.movimientos.filter(m=>m.fecha===todayShort()&&m.tipo==="pago_cliente").reduce((a,m)=>a+m.monto,0);
  const movHoy=DB.movimientos.filter(m=>m.fecha===todayShort()).slice(0,5);
  const medios=[{k:"efectivo",label:"Efectivo",cls:"tm-ef"},{k:"mercadopago",label:"Mercado Pago",cls:"tm-mp"},{k:"debito",label:"Débito",cls:"tm-db"},{k:"credito",label:"Crédito",cls:"tm-cr"}];
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Resumen del día</div><div class="ps">Hoy · ${today()}</div></div>
      <div style="display:flex;gap:7px;">
        <button class="btn btn-out btn-sm" onclick="abrirGasto()"><i class="ti ti-minus"></i>Registrar gasto</button>
        <button class="btn btn-ng btn-sm" onclick="showSub('caja-cierre')"><i class="ti ti-lock"></i>Cierre del día</button>
      </div>
    </div>
    <div class="scroll">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
        <div style="background:var(--ng);border-radius:12px;padding:16px 18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><div style="font-size:12px;font-weight:500;color:var(--cr);display:flex;align-items:center;gap:6px;"><i class="ti ti-safe"></i>Caja principal</div><span class="bd bd-ok" style="font-size:10px;">Operativa</span></div>
          <div style="font-size:26px;font-weight:500;color:var(--cr);margin-bottom:10px;">${fmt(totP)}</div>
          ${medios.map(m=>`<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px;"><span style="color:var(--gc);">${m.label}</span><span style="color:var(--cr);font-weight:500;">${fmt(DB.cajas.principal[m.k]||0)}</span></div>`).join("")}
        </div>
        <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:12px;padding:16px 18px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><div style="font-size:12px;font-weight:500;display:flex;align-items:center;gap:6px;"><i class="ti ti-chart-line"></i>Caja reinversión</div><span class="bd bd-pu" style="font-size:10px;">Reserva</span></div>
          <div style="font-size:26px;font-weight:500;margin-bottom:10px;">${fmt(totR)}</div>
          <div style="font-size:11px;color:var(--gt);">Efectivo: ${fmt(DB.cajas.reinversion.efectivo)}</div>
          <button class="btn-ghost btn-sm" onclick="abrirTransfCajas()" style="margin-top:10px;width:100%;justify-content:center;font-size:11px;"><i class="ti ti-arrows-exchange"></i>Mover fondos</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px;">
        <div class="sc"><div class="sl">Ventas hoy</div><div class="sv" style="color:var(--vd);">+${fmt(vHoy)}</div></div>
        <div class="sc"><div class="sl">Cobros clientes</div><div class="sv" style="color:var(--te);">+${fmt(cHoy)}</div></div>
        <div class="sc"><div class="sl">Gastos hoy</div><div class="sv" style="color:var(--rj);">−${fmt(gHoy)}</div></div>
        <div class="sc" style="background:var(--ng);"><div class="sl" style="color:var(--gc);">Balance neto</div><div class="sv" style="color:${vHoy+cHoy-gHoy>=0?"var(--vd)":"var(--rj)"};">${fmt(vHoy+cHoy-gHoy)}</div></div>
      </div>
      <div class="sect-title">Movimientos de hoy</div>
      <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:8px 12px;">
        ${movHoy.length?movHoy.map(m=>`<div class="mov-item"><div style="display:flex;align-items:center;gap:8px;"><div class="mi-icon ${m.signo>0?"mi-abono":"mi-cargo"}"><i class="ti ti-${m.signo>0?"arrow-down":"arrow-up"}" style="font-size:12px;"></i></div><div><div style="font-size:12px;font-weight:500;">${m.concepto}</div><div style="font-size:10px;color:var(--gc);">${m.hora}</div></div></div><div style="font-size:13px;font-weight:500;color:${m.signo>0?"var(--vd)":"var(--rj)"};">${m.signo>0?"+":"−"}${fmt(m.monto)}</div></div>`).join(""):`<div style="padding:20px;text-align:center;color:var(--gc);font-size:12px;">Sin movimientos hoy</div>`}
      </div>
    </div>
  </div>`;
}

function renderCajaMovimientos(){
  const byMonth={};
  DB.movimientos.forEach(m=>{
    const iso=m.fechaISO||"2026-01-01";
    const month=iso.slice(0,7);
    const day=iso||m.fecha;
    byMonth[month]??={items:[],days:{}};
    byMonth[month].items.push(m);
    byMonth[month].days[day]??=[];
    byMonth[month].days[day].push(m);
  });
  const monthNames=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  const balance=items=>items.reduce((a,m)=>a+(m.signo>0?m.monto:-m.monto),0);
  const fmtDate=iso=>{const d=new Date(iso+"T00:00:00");return isNaN(d)?iso:`${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}/${d.getFullYear()}`;};
  const months=Object.entries(byMonth).sort((a,b)=>b[0].localeCompare(a[0]));
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Movimientos</div><div class="ps">Agrupados por mes y día · caja real</div></div></div>
    <div class="scroll">
      ${months.length?months.map(([month,data],mi)=>{
        const [y,m]=month.split("-");
        const mLabel=`${monthNames[(parseInt(m)||1)-1]} ${y}`;
        const mb=balance(data.items);
        const days=Object.entries(data.days).sort((a,b)=>b[0].localeCompare(a[0]));
        return `<details class="tw" ${mi===0?"open":""} style="margin-bottom:10px;">
          <summary style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:var(--crd);font-weight:600;">
            <span>${mLabel} · ${data.items.length} movimientos</span>
            <span style="color:${mb>=0?"var(--vd)":"var(--rj)"};">${mb>=0?"+":"−"}${fmt(Math.abs(mb))}</span>
          </summary>
          <div style="padding:10px;">
            ${days.map(([day,items],di)=>{const db=balance(items);return `<details ${di===0?"open":""} style="border:1px solid var(--crb);border-radius:9px;margin-bottom:8px;background:var(--bl);overflow:hidden;">
              <summary style="cursor:pointer;display:flex;justify-content:space-between;padding:10px 12px;background:var(--cr);font-size:12px;font-weight:600;">
                <span>${fmtDate(day)} · ${items.length} mov.</span><span style="color:${db>=0?"var(--vd)":"var(--rj)"};">${db>=0?"+":"−"}${fmt(Math.abs(db))}</span>
              </summary>
              <div style="padding:0 12px 8px;">
                ${items.map(m=>`<div class="mov-item"><div style="display:flex;align-items:center;gap:8px;"><div class="mi-icon ${m.signo>0?"mi-abono":"mi-cargo"}"><i class="ti ti-${m.signo>0?"arrow-down":"arrow-up"}" style="font-size:12px;"></i></div><div><div style="font-size:12px;font-weight:500;">${m.concepto}</div><div style="font-size:10px;color:var(--gc);">${m.hora||"—"} · ${m.medio||"—"}${m.editado_en?' · <span style="color:var(--am);">editado</span>':""}</div></div></div><div style="display:flex;align-items:center;gap:6px;"><div style="font-size:13px;font-weight:500;color:${m.signo>0?"var(--vd)":"var(--rj)"};">${m.signo>0?"+":"−"}${fmt(m.monto)}</div>${m.tipo!=="venta"?`<button class="btn-icon" onclick="editarMovimiento(${m.id})" title="Editar"><i class="ti ti-pencil" style="font-size:11px;"></i></button><button class="btn-icon" onclick="eliminarMovimiento(${m.id})" title="Eliminar" style="color:var(--rj);"><i class="ti ti-trash" style="font-size:11px;"></i></button>`:""}</div></div>`).join("")}
              </div>
            </details>`;}).join("")}
          </div>
        </details>`;
      }).join(""):`<div style="padding:40px;text-align:center;color:var(--gc);">Sin movimientos registrados</div>`}
    </div>
  </div>`;
}

function renderCajaGastos(){
  const total=DB.gastos.reduce((a,g)=>a+g.monto,0);
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Gastos</div><div class="ps">Egresos operativos del negocio</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirGasto()"><i class="ti ti-plus"></i>Nuevo gasto</button></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 18px;">
      <div class="sc"><div class="sl">Gastos este mes</div><div class="sv">${DB.gastos.length}</div></div>
      <div class="sc"><div class="sl">Total egresado</div><div class="sv" style="color:var(--rj);">${fmt(total)}</div></div>
      <div class="sc"><div class="sl">Gasto promedio</div><div class="sv">${DB.gastos.length?fmt(Math.round(total/DB.gastos.length)):"$—"}</div></div>
    </div>
    <div style="padding:0 18px 18px;flex:1;overflow-y:auto;">
      <div class="tw"><table>
        <colgroup><col style="width:65px"><col style="width:110px"><col><col style="width:90px"><col style="width:90px"><col style="width:90px"><col style="width:40px"></colgroup>
        <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Caja</th><th>Medio</th><th>Monto</th><th></th></tr></thead>
        <tbody>${DB.gastos.map(g=>`<tr>
          <td style="color:var(--gt);">${g.fecha}</td>
          <td><span class="bd bd-bj" style="font-size:10px;">${g.cat}</span></td>
          <td style="font-size:11px;color:var(--gt);">${g.desc||"—"}</td>
          <td><span class="bd bd-ng" style="font-size:10px;">${g.caja==="principal"?"Principal":"Reinversión"}</span></td>
          <td style="font-size:11px;color:var(--gt);">${g.medio}</td>
          <td style="font-weight:500;color:var(--rj);">−${fmt(g.monto)}</td>
          <td></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}

function renderCajaTransferencias(){
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Transferencias entre cajas</div><div class="ps">Movimiento de fondos internos</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirTransfCajas()"><i class="ti ti-plus"></i>Nueva transferencia</button></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:12px 18px;">
      <div class="sc"><div class="sl">Caja principal</div><div class="sv">${fmt(totalCaja("principal"))}</div><div class="ss">Ef: ${fmt(DB.cajas.principal.efectivo)} · MP: ${fmt(DB.cajas.principal.mercadopago)}</div></div>
      <div class="sc"><div class="sl">Caja reinversión</div><div class="sv">${fmt(totalCaja("reinversion"))}</div><div class="ss">Ef: ${fmt(DB.cajas.reinversion.efectivo)}</div></div>
    </div>
    <div style="padding:0 18px 18px;flex:1;overflow-y:auto;">
      <div class="sect-title" style="margin-bottom:8px;">Historial de transferencias</div>
      <div class="tw"><table>
        <colgroup><col style="width:65px"><col style="width:55px"><col style="width:100px"><col style="width:100px"><col><col style="width:90px"></colgroup>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Origen</th><th>Destino</th><th>Motivo</th><th>Monto</th></tr></thead>
        <tbody>${DB.transferencias.map(t=>`<tr>
          <td style="color:var(--gt);">${t.fecha}</td>
          <td style="color:var(--gc);font-size:11px;">${t.hora}</td>
          <td><span class="bd bd-ng" style="font-size:10px;">${t.origen==="principal"?"Principal":"Reinversión"}</span></td>
          <td><span class="bd bd-pu" style="font-size:10px;">${t.destino==="principal"?"Principal":"Reinversión"}</span></td>
          <td style="font-size:11px;color:var(--gt);">${t.motivo}</td>
          <td style="font-weight:500;">${fmt(t.monto)}</td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}

function renderCajaCierre(){
  const vTot=DB.movimientos.filter(m=>m.tipo==="venta").reduce((a,m)=>a+m.monto,0);
  const cTot=DB.movimientos.filter(m=>m.tipo==="pago_cliente").reduce((a,m)=>a+m.monto,0);
  const gTot=DB.gastos.reduce((a,g)=>a+g.monto,0);
  const trTot=DB.transferencias.reduce((a,t)=>a+t.monto,0);
  const vEf=DB.movimientos.filter(m=>m.tipo==="venta"&&m.medio==="efectivo").reduce((a,m)=>a+m.monto,0);
  const vMP=DB.movimientos.filter(m=>m.tipo==="venta"&&m.medio==="mercadopago").reduce((a,m)=>a+m.monto,0);
  const gEf=DB.gastos.filter(g=>g.medio==="efectivo").reduce((a,g)=>a+g.monto,0);
  const efEsp=vEf+cTot-gEf;
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Cierre diario</div><div class="ps">Cierre del día · ${today()}</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirCierreModal()"><i class="ti ti-lock"></i>Realizar arqueo</button></div>
    <div class="scroll">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div>
          <div class="sect-title">Resumen de ventas</div>
          <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 14px;margin-bottom:14px;">
            <div class="cierre-row" style="font-size:12px;"><span style="color:var(--gt);">Ventas totales</span><span style="font-weight:500;color:var(--vd);">+${fmt(vTot)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><span style="color:var(--gt);">Cobros clientes</span><span style="font-weight:500;color:var(--te);">+${fmt(cTot)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><span style="color:var(--gt);">Gastos registrados</span><span style="font-weight:500;color:var(--rj);">−${fmt(gTot)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><span style="color:var(--gt);">Transferencias</span><span style="color:var(--gc);">−${fmt(trTot)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:500;padding-top:9px;margin-top:4px;border-top:0.5px solid var(--crb);"><span>Balance neto</span><span style="color:var(--vd);">${fmt(vTot+cTot-gTot)}</span></div>
          </div>
          <div class="sect-title">Por medio de pago</div>
          <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 14px;">
            <div class="cierre-row" style="font-size:12px;"><div style="display:flex;align-items:center;gap:6px;"><span class="tag-medio tm-ef">Efectivo ventas</span></div><span style="font-weight:500;">${fmt(vEf)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><div style="display:flex;align-items:center;gap:6px;"><span class="tag-medio tm-ef">Efectivo gastos</span></div><span style="color:var(--rj);font-weight:500;">−${fmt(gEf)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><div style="display:flex;align-items:center;gap:6px;"><span class="tag-medio tm-mp">Mercado Pago</span></div><span style="font-weight:500;">${fmt(vMP)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><div style="display:flex;align-items:center;gap:6px;"><span class="tag-medio tm-db">Débito</span></div><span style="font-weight:500;">${fmt(DB.cajas.principal.debito)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:500;padding-top:9px;margin-top:4px;border-top:0.5px solid var(--crb);"><span>Efectivo esperado</span><span>${fmt(efEsp)}</span></div>
          </div>
        </div>
        <div>
          <div class="sect-title">Saldos en sistema</div>
          <div style="background:var(--ng);border-radius:9px;padding:14px 16px;margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:7px;"><span style="color:var(--gc);">Caja principal total</span><span style="color:var(--cr);font-weight:500;">${fmt(totalCaja("principal"))}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px;"><span style="color:var(--gc);">· Efectivo</span><span style="color:var(--cr);">${fmt(DB.cajas.principal.efectivo)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:5px;"><span style="color:var(--gc);">· Mercado Pago</span><span style="color:var(--cr);">${fmt(DB.cajas.principal.mercadopago)}</span></div>
            <div style="display:flex;justify-content:space-between;font-size:12px;border-top:0.5px solid rgba(255,255,255,.1);padding-top:7px;margin-top:4px;"><span style="color:var(--gc);">Caja reinversión</span><span style="color:var(--cr);font-weight:500;">${fmt(totalCaja("reinversion"))}</span></div>
          </div>
          <div class="sect-title">Verificación de arqueo</div>
          <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 14px;">
            <div class="cierre-row" style="font-size:12px;"><span style="color:var(--gt);">Efectivo esperado</span><span style="font-weight:500;">${fmt(efEsp)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><span style="color:var(--gt);">Efectivo en sistema</span><span style="font-weight:500;">${fmt(DB.cajas.principal.efectivo)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><span style="color:var(--gt);">Diferencia</span>${fmtDiff(DB.cajas.principal.efectivo-efEsp)}</div>
            <div class="cierre-row" style="font-size:12px;margin-top:8px;"><span style="color:var(--gt);">MP esperado</span><span style="font-weight:500;">${fmt(vMP)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><span style="color:var(--gt);">MP en sistema</span><span style="font-weight:500;">${fmt(DB.cajas.principal.mercadopago)}</span></div>
            <div class="cierre-row" style="font-size:12px;"><span style="color:var(--gt);">Diferencia</span>${fmtDiff(DB.cajas.principal.mercadopago-vMP)}</div>
          </div>
          <button class="btn btn-ng" style="width:100%;justify-content:center;margin-top:12px;" onclick="abrirCierreModal()"><i class="ti ti-lock"></i>Realizar arqueo con conteo físico</button>
        </div>
      </div>
      <div class="sect-title" style="margin-top:16px;">Historial de cierres</div>
      <div class="tw"><table>
        <thead><tr><th>Fecha</th><th>Hora</th><th>Efectivo contado</th><th>MP contado</th><th>Observaciones</th></tr></thead>
        <tbody>${(DB.cierres||[]).map(c=>`<tr><td>${c.fecha}</td><td>${c.hora}</td><td>${fmt(c.efectivo||0)}</td><td>${fmt(c.mercadopago||0)}</td><td>${c.obs||"—"}</td></tr>`).join("")||`<tr><td colspan="5" style="text-align:center;color:var(--gc);padding:18px;">Todavía no hay cierres registrados</td></tr>`}</tbody>
      </table></div>
    </div>
  </div>`;
}

function abrirGasto(){
  document.getElementById("g-fecha").value=toDateInput();
  document.getElementById("g-monto").value="";
  document.getElementById("g-desc").value="";
  openOv("ov-gasto");
}
function guardarGasto(){
  const m=parseFloat(document.getElementById("g-monto").value)||0;if(!m)return;
  const fechaISO=document.getElementById("g-fecha").value||toDateInput();
  const fecha=shortFromISO(fechaISO);
  const cat=document.getElementById("g-cat").value;
  const caja=document.getElementById("g-caja").value;
  const medio=document.getElementById("g-medio").value;
  const desc=document.getElementById("g-desc").value;
  DB.gastos.unshift({id:nextId(DB.gastos),fecha,fechaISO,cat,desc,caja,medio,monto:m});
  DB.cajas[caja][medio]=Math.max(0,(DB.cajas[caja][medio]||0)-m);
  DB.movimientos.unshift({id:nextId(DB.movimientos),fecha,fechaISO,hora:hora(),tipo:"gasto",concepto:cat+(desc?` — ${desc}`:""),caja,medio,monto:m,signo:-1});
  persistDBSoon();
  closeOv("ov-gasto");renderSidebar();
  const sub=currentSub[currentMod];
  if(sub==="caja-resumen")renderCajaResumen();
  else if(sub==="caja-gastos")renderCajaGastos();
}
function abrirTransfCajas(){
  document.getElementById("tr-fecha").value=toDateInput();
  document.getElementById("tr-monto").value="";
  document.getElementById("tr-motivo").value="";
  document.getElementById("tr-info").style.display="none";
  openOv("ov-transf-cajas");
}
function recalcTransf(){
  const or=document.getElementById("tr-origen").value;
  const m=parseFloat(document.getElementById("tr-monto").value)||0;
  const inf=document.getElementById("tr-info");
  inf.style.display="block";
  inf.innerHTML=`Disponible en ${or==="principal"?"caja principal":"reinversión"}: <strong>${fmt(totalCaja(or))}</strong>${m>totalCaja(or)?` <span style="color:var(--rj);">· Monto supera disponible</span>`:""}`;
}
function guardarTransferencia(){
  const or=document.getElementById("tr-origen").value;
  const de=document.getElementById("tr-destino").value;
  const m=parseFloat(document.getElementById("tr-monto").value)||0;
  const mo=document.getElementById("tr-motivo").value||"Transferencia";
  if(!m||or===de||m>totalCaja(or))return;
  DB.cajas[or].efectivo=Math.max(0,DB.cajas[or].efectivo-m);
  DB.cajas[de].efectivo=(DB.cajas[de].efectivo||0)+m;
  DB.transferencias.unshift({id:nextId(DB.transferencias),fecha:todayShort(),hora:hora(),origen:or,destino:de,motivo:mo,monto:m});
  DB.movimientos.unshift({id:nextId(DB.movimientos),fecha:todayShort(),hora:hora(),tipo:"transferencia",concepto:`Transferencia → ${de==="principal"?"Principal":"Reinversión"}`,caja:or,medio:"—",monto:m,signo:-1});
  persistDBSoon();
  closeOv("ov-transf-cajas");renderSidebar();
  const sub=currentSub[currentMod];
  if(sub==="caja-resumen")renderCajaResumen();
  else if(sub==="caja-transferencias")renderCajaTransferencias();
}
function abrirCierreModal(){
  const vEf=DB.movimientos.filter(m=>m.tipo==="venta"&&m.medio==="efectivo").reduce((a,m)=>a+m.monto,0);
  const cTot=DB.movimientos.filter(m=>m.tipo==="pago_cliente").reduce((a,m)=>a+m.monto,0);
  const gEf=DB.gastos.filter(g=>g.medio==="efectivo").reduce((a,g)=>a+g.monto,0);
  const vMP=DB.movimientos.filter(m=>m.tipo==="venta"&&m.medio==="mercadopago").reduce((a,m)=>a+m.monto,0);
  document.getElementById("cierre-ef-esp").textContent=fmt(vEf+cTot-gEf);
  document.getElementById("cierre-mp-esp").textContent=fmt(vMP);
  document.getElementById("cierre-ef-real").value="";
  document.getElementById("cierre-mp-real").value="";
  document.getElementById("cierre-ef-diff").textContent="—";
  document.getElementById("cierre-mp-diff").textContent="—";
  openOv("ov-cierre");
}
function recalcCierre(){
  const vEf=DB.movimientos.filter(m=>m.tipo==="venta"&&m.medio==="efectivo").reduce((a,m)=>a+m.monto,0);
  const cTot=DB.movimientos.filter(m=>m.tipo==="pago_cliente").reduce((a,m)=>a+m.monto,0);
  const gEf=DB.gastos.filter(g=>g.medio==="efectivo").reduce((a,g)=>a+g.monto,0);
  const vMP=DB.movimientos.filter(m=>m.tipo==="venta"&&m.medio==="mercadopago").reduce((a,m)=>a+m.monto,0);
  const efR=parseFloat(document.getElementById("cierre-ef-real").value)||0;
  const mpR=parseFloat(document.getElementById("cierre-mp-real").value)||0;
  document.getElementById("cierre-ef-diff").innerHTML=fmtDiff(efR-(vEf+cTot-gEf));
  document.getElementById("cierre-mp-diff").innerHTML=fmtDiff(mpR-vMP);
}
function procesarCierre(){
  const ef=parseFloat(document.getElementById("cierre-ef-real").value)||0;
  const mp=parseFloat(document.getElementById("cierre-mp-real").value)||0;
  DB.cierres=DB.cierres||[];
  DB.cierres.unshift({id:nextId(DB.cierres),fecha:today(),fechaISO:new Date().toISOString().slice(0,10),hora:hora(),efectivo:ef,mercadopago:mp,obs:document.getElementById("cierre-obs").value||""});
  persistDBSoon();
  closeOv("ov-cierre");
  if(currentSub[currentMod]==="caja-cierre")renderCajaCierre();
}

/* ══════════════════════════════════════════
   MOVIMIENTOS — EDITAR / ELIMINAR
══════════════════════════════════════════ */

// Inyectar modal de edición en el DOM (solo una vez, al cargar)
(function _inyectarModalEditarMov() {
  if (document.getElementById("ov-editar-mov")) return;
  const div = document.createElement("div");
  div.innerHTML = `
  <div class="ov" id="ov-editar-mov">
    <div class="ov-card" style="max-width:440px;">
      <div class="ov-header">
        <div class="ov-title">Editar movimiento</div>
        <button class="ov-close" onclick="closeOv('ov-editar-mov')"><i class="ti ti-x"></i></button>
      </div>
      <input type="hidden" id="emov-id" />
      <div class="fg">
        <label>Monto</label>
        <input type="number" id="emov-monto" min="1" placeholder="0" />
      </div>
      <div class="fg">
        <label>Tipo</label>
        <select id="emov-signo">
          <option value="1">Ingreso (+)</option>
          <option value="-1">Egreso (−)</option>
        </select>
      </div>
      <div class="fg">
        <label>Método de pago</label>
        <select id="emov-medio">
          <option value="efectivo">Efectivo</option>
          <option value="mercadopago">Mercado Pago</option>
          <option value="debito">Débito</option>
          <option value="credito">Crédito</option>
        </select>
      </div>
      <div class="fg">
        <label>Observaciones / concepto</label>
        <input type="text" id="emov-concepto" placeholder="Descripción del movimiento" />
      </div>
      <div class="fg">
        <label>Fecha</label>
        <input type="date" id="emov-fecha" />
      </div>
      <div style="display:flex;gap:8px;margin-top:4px;">
        <button class="btn btn-out" style="flex:1;justify-content:center;" onclick="closeOv('ov-editar-mov')">Cancelar</button>
        <button class="btn btn-ng" style="flex:1;justify-content:center;" onclick="_confirmarEdicionMovimiento()"><i class="ti ti-check"></i>Guardar cambios</button>
      </div>
    </div>
  </div>`;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(div.firstElementChild));
  // Por si el DOM ya cargó (script diferido)
  if (document.readyState !== "loading") document.body.appendChild(div.firstElementChild);
})();

function eliminarMovimiento(movimientoId) {
  const idx = DB.movimientos.findIndex(m => m.id === movimientoId);
  if (idx === -1) { alert("Movimiento no encontrado"); return; }
  if (!confirm("¿Eliminar este movimiento?")) return;

  const mov = DB.movimientos[idx];

  // Revertir efecto en caja (signo:1 sumó → restamos; signo:-1 restó → sumamos)
  if (mov.caja && DB.cajas[mov.caja] && mov.medio && DB.cajas[mov.caja][mov.medio] !== undefined) {
    DB.cajas[mov.caja][mov.medio] -= mov.signo * mov.monto;
  }

  DB.movimientos.splice(idx, 1);
  persistDBSoon();
  renderSidebar();

  const sub = currentSub[currentMod];
  if (sub === "caja-movimientos") renderCajaMovimientos();
  else if (sub === "caja-resumen") renderCajaResumen();
}

function editarMovimiento(movimientoId) {
  const mov = DB.movimientos.find(m => m.id === movimientoId);
  if (!mov) { alert("Movimiento no encontrado"); return; }

  document.getElementById("emov-id").value       = mov.id;
  document.getElementById("emov-monto").value    = mov.monto;
  document.getElementById("emov-signo").value    = mov.signo > 0 ? "1" : "-1";
  document.getElementById("emov-medio").value    = mov.medio || "efectivo";
  document.getElementById("emov-concepto").value = mov.concepto || "";
  document.getElementById("emov-fecha").value    = mov.fechaISO || toDateInput();

  openOv("ov-editar-mov");
}

function guardarEdicionMovimiento(movimientoId, datosEditados) {
  const idx = DB.movimientos.findIndex(m => m.id === movimientoId);
  if (idx === -1) { alert("Movimiento no encontrado"); return; }

  const { monto, signo, medio, concepto, fechaISO } = datosEditados;
  if (!monto || monto <= 0) { alert("El monto debe ser mayor a cero"); return; }

  const mov = DB.movimientos[idx];

  // Revertir efecto anterior en caja
  if (mov.caja && DB.cajas[mov.caja] && DB.cajas[mov.caja][mov.medio] !== undefined) {
    DB.cajas[mov.caja][mov.medio] -= mov.signo * mov.monto;
  }

  const nuevoSigno = parseInt(signo, 10);
  Object.assign(mov, {
    monto,
    signo: nuevoSigno,
    medio,
    concepto,
    fechaISO,
    fecha: shortFromISO(fechaISO),
    editado_en: new Date().toISOString()
  });

  // Aplicar nuevo efecto en caja
  if (mov.caja && DB.cajas[mov.caja] && DB.cajas[mov.caja][medio] !== undefined) {
    DB.cajas[mov.caja][medio] += nuevoSigno * monto;
  }

  persistDBSoon();
  closeOv("ov-editar-mov");
  renderSidebar();

  const sub = currentSub[currentMod];
  if (sub === "caja-movimientos") renderCajaMovimientos();
  else if (sub === "caja-resumen") renderCajaResumen();
}

// Lee el formulario del modal y delega en guardarEdicionMovimiento
function _confirmarEdicionMovimiento() {
  const id       = parseInt(document.getElementById("emov-id").value, 10);
  const monto    = parseFloat(document.getElementById("emov-monto").value) || 0;
  const signo    = document.getElementById("emov-signo").value;
  const medio    = document.getElementById("emov-medio").value;
  const concepto = document.getElementById("emov-concepto").value.trim();
  const fechaISO = document.getElementById("emov-fecha").value || toDateInput();
  guardarEdicionMovimiento(id, { monto, signo, medio, concepto, fechaISO });
}

/* ══════════════════════════════════════════
   MÓDULO ANÁLISIS
══════════════════════════════════════════ */
function renderAnalisisVentas(){
  const calcVentas=()=>{const c={};DB.ventas.forEach(v=>{if(v.producto)c[v.producto]=(c[v.producto]||0)+(v.cantidad||1);});return c;};
  const ventasPorProducto=calcVentas();
  const productos=DB.productos.map(p=>({p,stock:stockTotal(p),ventas:ventasPorProducto[p.nombre]||p.ventasHistoricas||0}));
  const reponer=productos.filter(x=>x.ventas>=4&&x.stock<=2).sort((a,b)=>b.ventas-a.ventas).slice(0,20);
  const oferta=productos.filter(x=>x.ventas<=1&&x.stock>=5).sort((a,b)=>b.stock-a.stock).slice(0,20);
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Análisis de rotación</div><div class="ps">Reposición y ofertas sugeridas según ventas + stock</div></div></div>
    <div class="scroll">
      <div class="stats3" style="margin-bottom:14px;">
        <div class="sc"><div class="sl">Productos analizados</div><div class="sv">${productos.length}</div></div>
        <div class="sc"><div class="sl">Sugeridos para reponer</div><div class="sv" style="color:var(--vd);">${reponer.length}</div></div>
        <div class="sc"><div class="sl">Sugeridos para oferta</div><div class="sv" style="color:var(--am);">${oferta.length}</div></div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div>
          <div class="sect-title">Reponer primero</div>
          <div class="tw"><table><thead><tr><th>Producto</th><th>Ventas</th><th>Stock</th></tr></thead><tbody>
            ${reponer.map(x=>`<tr><td>${x.p.nombre}</td><td>${x.ventas}</td><td>${x.stock}</td></tr>`).join("")||`<tr><td colspan="3" style="text-align:center;color:var(--gc);">Sin urgencias de reposición</td></tr>`}
          </tbody></table></div>
        </div>
        <div>
          <div class="sect-title">Evaluar oferta</div>
          <div class="tw"><table><thead><tr><th>Producto</th><th>Ventas</th><th>Stock</th></tr></thead><tbody>
            ${oferta.map(x=>`<tr><td>${x.p.nombre}</td><td>${x.ventas}</td><td>${x.stock}</td></tr>`).join("")||`<tr><td colspan="3" style="text-align:center;color:var(--gc);">Sin candidatos claros</td></tr>`}
          </tbody></table></div>
        </div>
      </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════════
   MÓDULO PROVEEDORES
══════════════════════════════════════════ */
function renderProvLista(){
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Proveedores</div><div class="ps">${DB.proveedores.length} proveedores registrados</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirNuevoProv()"><i class="ti ti-plus"></i>Nuevo proveedor</button></div>
    <div class="scroll" style="padding-top:12px;">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
        ${DB.proveedores.map((p,i)=>{
          const tot=p.compras.reduce((a,c)=>a+c.total,0);
          const ult=p.compras[0]?.fecha||"Sin compras";
          return`<div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:11px;padding:14px 16px;cursor:pointer;" onclick="verFichaProv(${p.id})" onmouseover="this.style.borderColor='var(--ng)'" onmouseout="this.style.borderColor='var(--crb)'">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:12px;">
              <div class="avatar ${avCol(i)}" style="width:38px;height:38px;font-size:13px;">${initials(p.nombre)}</div>
              <div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.nombre}</div><div style="font-size:10px;color:var(--gc);margin-top:1px;">${p.rubro}</div></div>
              <span class="bd bd-ok" style="font-size:10px;">Activo</span>
            </div>
            <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px;">
              <div style="display:flex;align-items:center;gap:6px;font-size:12px;"><i class="ti ti-phone" style="color:var(--gc);font-size:13px;"></i>${p.tel}</div>
              ${p.ig?`<div style="display:flex;align-items:center;gap:6px;font-size:12px;"><i class="ti ti-brand-instagram" style="color:var(--gc);font-size:13px;"></i>${p.ig}</div>`:""}
              <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--gc);"><i class="ti ti-calendar" style="font-size:12px;"></i>Entrega: ${p.dias}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px;">
              <div style="background:var(--cr);border-radius:7px;padding:7px 9px;"><div style="font-size:10px;color:var(--gc);">Comprado</div><div style="font-size:13px;font-weight:500;">${fmt(tot)}</div></div>
              <div style="background:var(--cr);border-radius:7px;padding:7px 9px;"><div style="font-size:10px;color:var(--gc);">Última</div><div style="font-size:12px;font-weight:500;">${ult}</div></div>
            </div>
            <div style="display:flex;gap:5px;">
              <button class="btn-ghost btn-sm" style="flex:1;justify-content:center;" onclick="event.stopPropagation();abrirIngresoMerch(null);document.getElementById('ing-prov').value=${p.id};onIngProvChange()"><i class="ti ti-package-import"></i>Stock</button>
              <button class="btn-ghost btn-sm" style="flex:1;justify-content:center;" onclick="event.stopPropagation();verFichaProv(${p.id})"><i class="ti ti-eye"></i>Ficha</button>
            </div>
          </div>`;}).join("")}
      </div>
    </div>
  </div>`;
}

function verFichaProv(id){
  const p=DB.proveedores.find(x=>x.id===id);
  const i=DB.proveedores.findIndex(x=>x.id===id);
  const tot=p.compras.reduce((a,c)=>a+c.total,0);
  const uds=p.compras.reduce((a,c)=>a+c.items.reduce((b,it)=>b+it.cant,0),0);
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;overflow:hidden;">
    <div class="ph">
      <div style="display:flex;align-items:center;gap:10px;">
        <button class="btn-ghost btn-sm" onclick="showSub('prov-lista')"><i class="ti ti-arrow-left"></i>Volver</button>
        <div style="display:flex;align-items:center;gap:8px;"><div class="avatar ${avCol(i)}" style="width:32px;height:32px;font-size:11px;">${initials(p.nombre)}</div><div><div class="pt">${p.nombre}</div><div class="ps">${p.rubro}</div></div></div>
      </div>
      <button class="btn btn-ng btn-sm" onclick="abrirIngresoMerch(null);document.getElementById('ing-prov').value=${p.id};onIngProvChange()"><i class="ti ti-package-import"></i>Registrar ingreso</button>
    </div>
    <div class="ficha-grid">
      <div class="ficha-left">
        <div class="sect-title">Contacto</div>
        <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 12px;margin-bottom:14px;">
          <div class="info-row"><span class="ir-label"><i class="ti ti-phone" style="font-size:12px;margin-right:4px;"></i>Teléfono</span><span class="ir-val">${p.tel}</span></div>
          ${p.ig?`<div class="info-row"><span class="ir-label"><i class="ti ti-brand-instagram" style="font-size:12px;margin-right:4px;"></i>Instagram</span><span class="ir-val">${p.ig}</span></div>`:""}
          <div class="info-row"><span class="ir-label"><i class="ti ti-map-pin" style="font-size:12px;margin-right:4px;"></i>Dirección</span><span class="ir-val">${p.dir||"—"}</span></div>
          <div class="info-row"><span class="ir-label"><i class="ti ti-calendar" style="font-size:12px;margin-right:4px;"></i>Días entrega</span><span class="ir-val">${p.dias}</span></div>
        </div>
        <div class="sect-title">Resumen financiero</div>
        <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 12px;margin-bottom:14px;">
          <div class="info-row"><span class="ir-label">Total comprado</span><span class="ir-val">${fmt(tot)}</span></div>
          <div class="info-row"><span class="ir-label">Unidades ingresadas</span><span class="ir-val">${uds}</span></div>
          <div class="info-row"><span class="ir-label">Órdenes de compra</span><span class="ir-val">${p.compras.length}</span></div>
          <div class="info-row"><span class="ir-label">Última compra</span><span class="ir-val">${p.compras[0]?.fecha||"—"}</span></div>
        </div>
        ${p.obs?`<div class="sect-title">Observaciones</div><div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 12px;font-size:12px;color:var(--gt);">${p.obs}</div>`:""}
      </div>
      <div class="ficha-right">
        <div class="sect-title">Historial de compras</div>
        ${p.compras.length?p.compras.map(c=>`
          <div style="background:var(--bl);border:0.5px solid var(--crb);border-radius:9px;padding:10px 13px;margin-bottom:8px;cursor:pointer;" onclick="verDetalleIngreso(${c.id})">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
              <div><div style="font-size:12px;font-weight:500;">${c.fecha} · ${c.remito||"Sin remito"}</div><div style="font-size:10px;color:var(--gc);">${c.items.reduce((a,it)=>a+it.cant,0)} unidades · ${c.items.length} referencias</div></div>
              <div style="text-align:right;"><div style="font-size:14px;font-weight:500;">${fmt(c.total)}</div><span class="bd ${c.metodo==="cuenta_prov"?"bd-bj":c.metodo==="efectivo"?"bd-ok":"bd-az"}" style="font-size:10px;">${c.metodo==="cuenta_prov"?"Cta. prov.":c.metodo==="efectivo"?"Efectivo":"Transferencia"}</span></div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">${c.items.map(it=>`<span style="font-size:10px;background:var(--crd);color:var(--gt);padding:2px 7px;border-radius:5px;">${it.nombre.split("·")[0].trim()} ×${it.cant}</span>`).join("")}</div>
          </div>`).join(""):`<div style="padding:20px;text-align:center;color:var(--gc);font-size:12px;">Sin compras registradas</div>`}
      </div>
    </div>
  </div>`;
}

function renderProvIngresos(){
  const todos=DB.proveedores.flatMap(p=>p.compras.map(c=>({...c,proveedor:p.nombre,provId:p.id,uds:c.items.reduce((a,it)=>a+it.cant,0)})));
  todos.sort((a,b)=>b.id-a.id);
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Ingresos de stock</div><div class="ps">Historial de entradas de mercadería por proveedor</div></div>
      <button class="btn btn-ng btn-sm" onclick="abrirIngresoMerch(null)"><i class="ti ti-plus"></i>Nuevo ingreso</button></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px 18px;">
      <div class="sc"><div class="sl">Total ingresos</div><div class="sv">${todos.length}</div></div>
      <div class="sc"><div class="sl">Unidades totales</div><div class="sv">${todos.reduce((a,i)=>a+i.uds,0)}</div></div>
      <div class="sc"><div class="sl">Invertido total</div><div class="sv" style="color:var(--rj);">${fmt(todos.reduce((a,i)=>a+i.total,0))}</div></div>
      <div class="sc" style="background:var(--ng);"><div class="sl" style="color:var(--gc);">Proveedores activos</div><div class="sv" style="color:var(--cr);">${DB.proveedores.length}</div></div>
    </div>
    <div style="padding:0 18px 18px;flex:1;overflow-y:auto;">
      <div class="tw"><table>
        <colgroup><col style="width:50px"><col style="width:70px"><col style="width:110px"><col><col style="width:60px"><col style="width:90px"><col style="width:80px"><col style="width:50px"></colgroup>
        <thead><tr><th>#</th><th>Fecha</th><th>Proveedor</th><th>Productos</th><th>Uds.</th><th>Total</th><th>Método</th><th></th></tr></thead>
        <tbody>${todos.map(i=>`<tr onclick="verDetalleIngreso(${i.id})">
          <td style="color:var(--gc);font-size:10px;">#${i.id}</td>
          <td style="color:var(--gt);">${i.fecha}</td>
          <td style="font-size:12px;font-weight:500;">${i.proveedor}</td>
          <td style="font-size:11px;color:var(--gt);">${i.items.map(it=>it.nombre.split("·")[0].trim()+" ×"+it.cant).join(", ")}</td>
          <td style="text-align:center;">${i.uds}</td>
          <td style="font-weight:500;">${fmt(i.total)}</td>
          <td><span class="bd ${i.metodo==="cuenta_prov"?"bd-bj":i.metodo==="efectivo"?"bd-ok":"bd-az"}" style="font-size:10px;">${i.metodo==="cuenta_prov"?"Cta.prov":i.metodo==="efectivo"?"Efectivo":"Transf."}</span></td>
          <td><button class="btn-ghost btn-sm" style="padding:3px 7px;" onclick="event.stopPropagation();verDetalleIngreso(${i.id})"><i class="ti ti-eye"></i></button></td>
        </tr>`).join("")}</tbody>
      </table></div>
    </div>
  </div>`;
}

function renderProvHistorial(){
  const totalMes=DB.proveedores.flatMap(p=>p.compras).reduce((a,c)=>a+c.total,0);
  const totalUds=DB.proveedores.flatMap(p=>p.compras).reduce((a,c)=>a+c.items.reduce((b,it)=>b+it.cant,0),0);
  const porProv={};DB.proveedores.forEach(p=>{porProv[p.nombre]=p.compras.reduce((a,c)=>a+c.total,0);});
  const top=Object.entries(porProv).sort((a,b)=>b[1]-a[1])[0];
  document.getElementById("main-area").innerHTML=`
  <div style="display:flex;flex-direction:column;flex:1;">
    <div class="ph"><div><div class="pt">Historial de compras</div><div class="ps">Relación de compras por proveedor</div></div></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:12px 18px;">
      <div class="sc"><div class="sl">Total invertido</div><div class="sv">${fmt(totalMes)}</div></div>
      <div class="sc"><div class="sl">Unidades ingresadas</div><div class="sv">${totalUds}</div></div>
      <div class="sc"><div class="sl">Proveedor más activo</div><div class="sv" style="font-size:14px;">${top?top[0]:"—"}</div></div>
    </div>
    <div style="padding:0 18px 18px;flex:1;overflow-y:auto;">
      ${DB.proveedores.map((p,i)=>{
        const tot=p.compras.reduce((a,c)=>a+c.total,0);
        const uds=p.compras.reduce((a,c)=>a+c.items.reduce((b,it)=>b+it.cant,0),0);
        return`<div style="margin-bottom:16px;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
            <div class="avatar ${avCol(i)}" style="width:28px;height:28px;font-size:10px;">${initials(p.nombre)}</div>
            <div style="font-size:13px;font-weight:500;">${p.nombre}</div>
            <span class="bd bd-ng" style="font-size:10px;">${p.compras.length} órdenes · ${uds} uds · ${fmt(tot)}</span>
          </div>
          <div class="tw"><table>
            <colgroup><col style="width:65px"><col style="width:85px"><col><col style="width:60px"><col style="width:90px"><col style="width:80px"></colgroup>
            <thead><tr><th>Fecha</th><th>Remito</th><th>Productos</th><th>Uds.</th><th>Total</th><th>Método</th></tr></thead>
            <tbody>${p.compras.map(c=>`<tr onclick="verDetalleIngreso(${c.id})">
              <td style="color:var(--gt);">${c.fecha}</td>
              <td style="font-size:11px;color:var(--gc);font-family:monospace;">${c.remito||"—"}</td>
              <td style="font-size:11px;color:var(--gt);">${c.items.map(it=>it.nombre.split("·")[0].trim()+" ×"+it.cant).join(", ")}</td>
              <td style="text-align:center;">${c.items.reduce((a,it)=>a+it.cant,0)}</td>
              <td style="font-weight:500;">${fmt(c.total)}</td>
              <td><span class="bd ${c.metodo==="cuenta_prov"?"bd-bj":c.metodo==="efectivo"?"bd-ok":"bd-az"}" style="font-size:10px;">${c.metodo==="cuenta_prov"?"Cta.prov":c.metodo==="efectivo"?"Efectivo":"Transf."}</span></td>
            </tr>`).join("")}</tbody>
          </table></div>
        </div>`;}).join("")}
    </div>
  </div>`;
}

function abrirNuevoProv(){
  ["newp-nombre","newp-tel","newp-ig","newp-dir","newp-dias","newp-obs"].forEach(id=>document.getElementById(id).value="");
  openOv("ov-nuevo-prov");
}
function guardarProveedor(){
  const n=document.getElementById("newp-nombre").value.trim();if(!n)return;
  DB.proveedores.push({id:nextId(DB.proveedores),nombre:n,rubro:document.getElementById("newp-rubro").value,tel:document.getElementById("newp-tel").value,ig:document.getElementById("newp-ig").value,dir:document.getElementById("newp-dir").value,dias:document.getElementById("newp-dias").value,obs:document.getElementById("newp-obs").value,activo:true,prodIds:[],compras:[]});
  persistDBSoon();
  closeOv("ov-nuevo-prov");renderProvLista();renderSidebar();
}

function verDetalleIngreso(id){
  const ing=DB.proveedores.flatMap(p=>p.compras.map(c=>({...c,proveedor:p.nombre}))).find(x=>x.id===id);
  if(!ing)return;
  document.getElementById("det-ing-titulo").textContent=`Ingreso #${ing.id} · ${ing.proveedor}`;
  document.getElementById("det-ing-body").innerHTML=`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
      <div style="background:var(--crd);border-radius:8px;padding:9px 11px;"><div style="font-size:10px;color:var(--gc);">Fecha</div><div style="font-size:13px;font-weight:500;">${ing.fecha}</div></div>
      <div style="background:var(--crd);border-radius:8px;padding:9px 11px;"><div style="font-size:10px;color:var(--gc);">Remito</div><div style="font-size:13px;font-weight:500;font-family:monospace;">${ing.remito||"—"}</div></div>
    </div>
    <div class="sect-title">Detalle de productos</div>
    <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
      ${ing.items.map(it=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 11px;background:var(--cr);border:0.5px solid var(--crb);border-radius:7px;">
        <div><div style="font-size:12px;font-weight:500;">${it.nombre}</div><div style="font-size:10px;color:var(--gc);">Costo unit.: ${fmt(it.costo)} · Cant.: ${it.cant}</div></div>
        <div style="font-size:13px;font-weight:500;">${fmt(it.costo*it.cant)}</div>
      </div>`).join("")}
    </div>
    <div style="background:var(--ng);border-radius:9px;padding:12px 14px;display:flex;justify-content:space-between;align-items:center;">
      <div><div style="font-size:10px;color:var(--gc);">Total pagado</div><div style="font-size:20px;font-weight:500;color:var(--cr);">${fmt(ing.total)}</div></div>
      <div style="text-align:right;"><div style="font-size:10px;color:var(--gc);">${ing.items.reduce((a,it)=>a+it.cant,0)} unidades</div><div style="font-size:10px;color:var(--gc);">${ing.metodo==="cuenta_prov"?"Cta. proveedor":ing.metodo==="efectivo"?"Efectivo":"Transferencia"}</div></div>
    </div>`;
  openOv("ov-det-ing");
}

/* ══════════════════════════════════════════
   ARRANQUE
══════════════════════════════════════════ */
initApp();
