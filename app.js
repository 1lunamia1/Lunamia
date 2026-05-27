async function startAuthenticatedApp(){
  try{
    await loadRemoteDB();
    showApp();
    cargarDashboard();
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
    cargarDashboard();
    return;
  }
  if(!window.supabase){
    showLogin("No se pudo cargar el cliente de Supabase.");
    setSyncStatus("Error Supabase");
    return;
  }
  sbClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
  const {data}=await sbClient.auth.getSession();
  if(!data.session){
    showLogin();
    setSyncStatus("Sin sesion");
    return;
  }
  await startAuthenticatedApp();
}