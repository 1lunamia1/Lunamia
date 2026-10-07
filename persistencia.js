/* Guardado serial, conflictos y borradores de recuperación por usuario. */
let remoteUpdatedAt=null;
let syncBlocked=false;
let dirtyGeneration=0;
let savedGeneration=0;
let savePromise=null;
let saveEpoch=0;
let saveRetries=0;
let saveUserId=null;
let recoveryDraft=null;
let syncProblem="";

function normalizarBase(data){
  if(!data||typeof data!=="object"||Array.isArray(data)||!Array.isArray(data.productos)||!Array.isArray(data.clientes)||!data.cajas)throw new Error("La base contiene datos inválidos. No se reemplazó ningún dato.");
  const base=cloneData(data),defaults=emptyDB();
  for(const [key,value] of Object.entries(defaults)){
    if(Array.isArray(value)){
      if(base[key]==null)base[key]=[];
      if(!Array.isArray(base[key]))throw new Error(`La sección ${key} no tiene un formato válido.`);
    }
  }
  for(const caja of ["principal","reinversion"]){
    if(!base.cajas[caja]||typeof base.cajas[caja]!=="object"||Array.isArray(base.cajas[caja]))throw new Error(`La caja ${caja} no tiene un formato válido.`);
    for(const medio of Object.keys(defaults.cajas[caja])){
      const n=Number(base.cajas[caja][medio]??0);
      if(!Number.isFinite(n))throw new Error(`Saldo inválido en ${caja}.`);
      base.cajas[caja][medio]=n;
    }
  }
  if(base.productos.some(p=>!p||!Array.isArray(p.variantes)||p.variantes.some(v=>!v||!Number.isFinite(Number(v.stock)))))throw new Error("Hay productos o variantes inválidos en la base.");
  for(const p of base.productos){
    p.id=Number(p.id);p.costo=Number(p.costo??0);p.precio=Number(p.precio??0);
    if(!Number.isSafeInteger(p.id)||p.id<=0||!Number.isFinite(p.costo)||!Number.isFinite(p.precio))throw new Error("Identificador, costo o precio de producto inválido.");
    for(const v of p.variantes)v.stock=Number(v.stock);
  }
  if(base.clientes.some(c=>!c||!Number.isFinite(Number(c.deuda??0))||!Number.isFinite(Number(c.saldoFavor??0))))throw new Error("Hay saldos de clientes inválidos en la base.");
  if(!base.meta||typeof base.meta!=="object"||Array.isArray(base.meta))base.meta={};
  if(!base.analytics||typeof base.analytics!=="object")base.analytics=defaults.analytics;
  for(const p of base.proveedores){
    if(p.compras==null)p.compras=[];if(!Array.isArray(p.compras))throw new Error("Historial de proveedor inválido.");
    for(const c of p.compras){
      if(c.items==null)c.items=[];if(!Array.isArray(c.items))throw new Error("Detalle de compra inválido.");
      c.total=Number(c.total??0);if(!Number.isFinite(c.total))throw new Error("Importe de compra inválido.");
      for(const it of c.items){it.cant=Number(it.cant??0);it.costo=Number(it.costo??0);if(!Number.isFinite(it.cant)||!Number.isFinite(it.costo))throw new Error("Cantidad o costo de compra inválido.");}
    }
  }
  for(const c of base.clientes){
    if(c.historial!=null&&!Array.isArray(c.historial))throw new Error("Historial de cliente inválido.");
    c.id=Number(c.id);ensureClienteShape(c);
  }
  for(const key of ["productos","clientes","ventas","movimientos","gastos","transferencias","devoluciones","proveedores","pagosClientes","cierres","categorias"]){
    const ids=new Set();
    for(const row of base[key]){
      row.id=Number(row.id);
      if(!Number.isSafeInteger(row.id)||row.id<=0||ids.has(row.id))throw new Error(`Hay identificadores inválidos o repetidos en ${key}.`);
      ids.add(row.id);
      for(const field of ["cliente_id","producto_id","proveedor_id","provId","venta_id","pago_cliente_id","transferencia_id","gasto_id","movimiento_id"]){
        if(row[field]!=null&&Number.isSafeInteger(Number(row[field]))&&Number(row[field])>0)row[field]=Number(row[field]);
      }
      if(row.monto!=null){row.monto=Number(row.monto);if(!Number.isFinite(row.monto))throw new Error(`Importe inválido en ${key}.`);}
      if(row.total!=null){row.total=Number(row.total);if(!Number.isFinite(row.total))throw new Error(`Total inválido en ${key}.`);}
      if(row.signo!=null)row.signo=Number(row.signo);
    }
  }
  return base;
}
function puedeModificarDB(){
  if(!SUPABASE_ON)return true;
  if(remoteReady&&!syncBlocked)return true;
  alert(syncProblem||"La base todavía no está lista para guardar. Esperá la carga o revisá el aviso de sincronización.");
  return false;
}
function draftStorageKey(){return saveUserId?`lunamia:borrador:${SUPABASE_URL}:${saveUserId}`:null;}
function conservarBorrador(){
  const key=draftStorageKey();
  if(!key)return;
  try{window.localStorage.setItem(key,JSON.stringify({data:DB,version:remoteVersion,updatedAt:remoteUpdatedAt,fecha:new Date().toISOString()}));}
  catch{syncProblem="No se pudo conservar una copia local. Descargá un respaldo de tus cambios.";mostrarAvisoSync();}
}
function borrarBorrador(){const key=draftStorageKey();if(key)try{window.localStorage.removeItem(key);}catch{}}
function leerBorrador(){
  const key=draftStorageKey();
  if(!key)return null;
  try{const text=window.localStorage.getItem(key);return text?JSON.parse(text):null;}catch{return null;}
}
function revisionCoincide(draft){return remoteVersion!==null&&draft.version!==null?draft.version===remoteVersion:draft.updatedAt===remoteUpdatedAt;}
function mostrarAvisoSync(){
  const el=document.getElementById("sync-alert");if(!el)return;
  const hayProblema=Boolean(syncProblem||recoveryDraft);
  el.hidden=!hayProblema;
  if(!hayProblema){el.innerHTML="";return;}
  let acciones=`<button class="btn btn-out btn-sm" onclick="exportarRespaldo()">Descargar respaldo</button>`;
  if(recoveryDraft){
    if(revisionCoincide(recoveryDraft))acciones+=`<button class="btn btn-ng btn-sm" onclick="recuperarBorrador()">Recuperar cambios</button>`;
    acciones+=`<button class="btn btn-out btn-sm" onclick="descartarBorrador()">Usar datos guardados</button>`;
  }else if(!syncBlocked)acciones+=`<button class="btn btn-ng btn-sm" onclick="saveRemoteDB()">Reintentar guardado</button>`;
  else acciones+=`<button class="btn btn-out btn-sm" onclick="recargarBase()">Recargar datos</button>`;
  el.innerHTML=`<div role="status">${escapeHTML(syncProblem||"Hay cambios de una sesión anterior pendientes de guardar.")}</div><div class="sync-alert-actions">${acciones}</div>`;
}
async function loadRemoteDB(){
  const epoch=++saveEpoch;
  clearTimeout(saveTimer);savePromise=null;remoteReady=false;syncBlocked=false;
  dirtyGeneration=0;savedGeneration=0;saveRetries=0;syncProblem="";recoveryDraft=null;
  setSyncStatus("Cargando datos...");
  let userId=saveUserId;
  if(sbClient.auth?.getSession){const {data}=await sbClient.auth.getSession();userId=data?.session?.user?.id||null;}
  if(epoch!==saveEpoch)return;
  let {data,error}=await sbClient.from("app_state").select("data,version,updated_at").eq("id","main").single();
  let version=Number.isInteger(data?.version)?data.version:null;
  if(error&&isMissingVersionColumn(error)){
    const fallback=await sbClient.from("app_state").select("data,updated_at").eq("id","main").single();
    data=fallback.data;error=fallback.error;version=null;
  }
  if(epoch!==saveEpoch)return;
  if(error)throw error;
  saveUserId=userId;remoteVersion=version;
  remoteUpdatedAt=data?.updated_at||null;
  if(remoteVersion===null&&!remoteUpdatedAt)throw new Error("La base necesita la columna updated_at o version para guardar sin sobrescribir otra sesión. Ejecutá supabase.sql.");
  const raw=data?.data;
  // Inicializar únicamente el objeto vacío creado por supabase.sql.
  if(raw&&typeof raw==="object"&&!Array.isArray(raw)&&Object.keys(raw).length===0){
    DB=emptyDB();
  }else DB=normalizarBase(raw);
  safeDB();remoteReady=true;
  recoveryDraft=leerBorrador();
  if(recoveryDraft){
    // Un cierre entre la respuesta del servidor y la limpieza del borrador.
    if(JSON.stringify(recoveryDraft.data)===JSON.stringify(DB)){borrarBorrador();recoveryDraft=null;}
    else{
      syncBlocked=true;
      syncProblem=revisionCoincide(recoveryDraft)?"Hay cambios locales sin guardar de tu sesión anterior. Elegí si querés recuperarlos.":"Hay cambios locales sin guardar, pero otra sesión modificó la base. Descargá el borrador antes de usar los datos actuales.";
    }
  }
  setSyncStatus(syncBlocked?"Revisar cambios locales":"Sincronizado");mostrarAvisoSync();
}
async function saveRemoteDB(){
  clearTimeout(saveTimer);
  if(!SUPABASE_ON)return true;
  if(!sbClient||!remoteReady||syncBlocked)return false;
  if(savePromise)return savePromise;
  const epoch=saveEpoch;
  const job=(async()=>{
    while(savedGeneration<dirtyGeneration){
      const generation=dirtyGeneration,snapshot=cloneData(safeDB());
      const stamp=new Date(Math.max(Date.now(),Date.parse(remoteUpdatedAt||"")+1||0)).toISOString();
      const payload={data:snapshot,updated_at:stamp};
      if(remoteVersion!==null)payload.version=remoteVersion+1;
      setSyncStatus("Guardando...");
      let query=sbClient.from("app_state").update(payload).eq("id","main");
      query=remoteVersion!==null?query.eq("version",remoteVersion):query.eq("updated_at",remoteUpdatedAt);
      let result;
      try{result=await query.select(remoteVersion!==null?"version,updated_at":"updated_at").maybeSingle();}
      catch(error){result={error};}
      if(epoch!==saveEpoch)return false;
      if(result.error){
        if(result.error.code==="40001"){
          syncBlocked=true;syncProblem="La base cambió o se actualizó su configuración. Descargá un respaldo y recargá para continuar.";
          conservarBorrador();setSyncStatus("Conflicto de datos");mostrarAvisoSync();return false;
        }
        const permanente=["42501","PGRST301","PGRST302","42P01","42703"].includes(result.error.code)||[401,403].includes(result.status||result.error.status)||String(result.error.code||"").startsWith("PGRST3");
        syncBlocked=permanente;
        syncProblem=permanente?"No se pudo guardar por un problema de acceso o configuración. Las nuevas operaciones están bloqueadas; descargá un respaldo y revisá la conexión.":"No se guardaron los últimos cambios. Se conserva un borrador y se reintentará el guardado.";
        conservarBorrador();setSyncStatus("Cambios sin guardar");mostrarAvisoSync();
        if(!permanente&&saveRetries<5)saveTimer=setTimeout(saveRemoteDB,Math.min(15000,1000*2**saveRetries++));
        return false;
      }
      if(!result.data){
        syncBlocked=true;
        syncProblem="Otra sesión cambió la base. Las nuevas operaciones están bloqueadas. Descargá tus cambios y recargá los datos para revisarlos.";
        conservarBorrador();setSyncStatus("Conflicto de datos");mostrarAvisoSync();return false;
      }
      if(remoteVersion!==null)remoteVersion=Number(result.data.version);
      remoteUpdatedAt=result.data.updated_at||stamp;savedGeneration=generation;saveRetries=0;
      // Actualizar la revisión del borrador de una edición hecha durante el envío.
      if(savedGeneration<dirtyGeneration)conservarBorrador();
    }
    syncProblem="";borrarBorrador();setSyncStatus("Sincronizado");mostrarAvisoSync();return true;
  })();
  savePromise=job;
  try{return await job;}finally{if(savePromise===job)savePromise=null;}
}
function persistDBSoon(){
  safeDB();
  if(!SUPABASE_ON)return;
  dirtyGeneration++;conservarBorrador();
  if(!remoteReady||syncBlocked)return;
  clearTimeout(saveTimer);saveTimer=setTimeout(saveRemoteDB,350);
}
async function recuperarBorrador(){
  if(!recoveryDraft||!revisionCoincide(recoveryDraft))return;
  try{DB=normalizarBase(recoveryDraft.data);}catch(error){alert(error.message);return;}
  recoveryDraft=null;syncBlocked=false;syncProblem="";persistDBSoon();mostrarAvisoSync();
  renderSidebar();renderPage(currentSub[currentMod]||"dashboard-home");await saveRemoteDB();
}
function descartarBorrador(){
  if(!recoveryDraft)return;
  if(!confirm("¿Usar los datos del servidor y descartar el borrador? Descargá un respaldo antes si necesitás conservar esos cambios."))return;
  borrarBorrador();recoveryDraft=null;syncBlocked=false;syncProblem="";mostrarAvisoSync();setSyncStatus("Sincronizado");
}
async function recargarBase(){
  try{await loadRemoteDB();renderSidebar();renderPage(currentSub[currentMod]||"dashboard-home");}
  catch(error){syncBlocked=true;syncProblem=error.message;mostrarAvisoSync();setSyncStatus("Error al cargar");}
}
function exportarRespaldo(){
  const data=recoveryDraft?.data||DB;
  const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:"application/json"}));
  const a=document.createElement("a");a.href=url;a.download=`lunamia-respaldo-${toDateInput()}.json`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importarRespaldo(event){
  const input=event.target,file=input.files?.[0];if(!file)return;
  try{
    if(!puedeModificarDB())return;
    const data=normalizarBase(JSON.parse(await file.text()));
    if(!puedeModificarDB())return;
    if(!confirm("Este respaldo reemplazará todos los datos de la aplicación. ¿Restaurarlo?"))return;
    exportarRespaldo();DB=data;persistDBSoon();renderSidebar();renderPage(currentSub[currentMod]||"dashboard-home");
    if(SUPABASE_ON)await saveRemoteDB();
  }catch(error){alert(`No se restauró el respaldo: ${error.message}`);}finally{input.value="";}
}
if(window.addEventListener){
  window.addEventListener("online",()=>{if(dirtyGeneration>savedGeneration&&!syncBlocked)saveRemoteDB();});
  window.addEventListener("beforeunload",ev=>{if(SUPABASE_ON&&dirtyGeneration>savedGeneration){conservarBorrador();ev.preventDefault();ev.returnValue="";}});
}
