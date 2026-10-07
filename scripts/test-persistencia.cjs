const {test}=require('node:test');
const assert=require('node:assert/strict');
const {app}=require('./test-helpers.cjs');
const config={SUPABASE_URL:'https://prueba.invalid',SUPABASE_ANON_KEY:'test'};
const clone=x=>JSON.parse(JSON.stringify(x));
function servidor(a,{sinVersion=false,user='usuario-1',data}={}){
  const state={data:data??JSON.parse(a.run('JSON.stringify(DB)')),version:sinVersion?null:1,updated_at:'2026-10-07T12:00:00.000Z'};
  const requests=[];
  const mock={state,requests,error:null,delay:null,active:0,maxActive:0};
  mock.client={auth:{getSession:async()=>({data:{session:{user:{id:user}}}})},from(){
    const filters={},query={fields:'',payload:null,select(fields){this.fields=fields;return this;},eq(key,value){filters[key]=value;return this;},update(data){this.payload=clone(data);return this;},async single(){
      if(sinVersion&&this.fields.includes('version'))return {error:{code:'42703',message:'column app_state.version does not exist'}};
      const snapshot=clone(state);
      if(mock.readDelay){const delay=mock.readDelay;mock.readDelay=null;await delay;}
      return {data:snapshot};
    },async maybeSingle(){
      requests.push({payload:clone(this.payload),filters:clone(filters)});mock.active++;mock.maxActive=Math.max(mock.maxActive,mock.active);
      try{
        if(mock.delay){const delay=mock.delay;mock.delay=null;await delay;}
        if(mock.error){const error=mock.error;mock.error=null;return {error};}
        const coincide=sinVersion?filters.updated_at===state.updated_at:filters.version===state.version;
        if(!coincide)return {data:null};
        Object.assign(state,clone(this.payload));return {data:clone(state)};
      }finally{mock.active--;}
    }};return query;
  }};
  a.context.mockClient=mock.client;a.run('sbClient=mockClient');return mock;
}
test('Una base vacía se carga sin sembrar ni reemplazar datos al iniciar',async()=>{
  const a=app({config}),m=servidor(a,{data:{}});await a.run('loadRemoteDB()');assert.equal(m.requests.length,0);assert.equal(a.run('DB.productos.length'),0);
});
test('Una base inválida se rechaza y no recibe ninguna escritura',async()=>{
  const a=app({config}),m=servidor(a,{data:{productos:'corruptos',clientes:[],cajas:{}}});await assert.rejects(a.run('loadRemoteDB()'));assert.equal(m.requests.length,0);assert.equal(a.run('remoteReady'),false);
});
test('Los antiguos datos demo existentes ya no se reemplazan automáticamente',async()=>{
  const a=app({config});a.run("DB.productos=Array.from({length:10},(_,i)=>({id:i+1,nombre:i?'Producto':'Jean Baggy Tokio',variantes:[],costo:0,precio:0}));");const m=servidor(a);await a.run('loadRemoteDB()');assert.equal(a.run('DB.productos.length'),10);assert.equal(m.requests.length,0);
});
test('Dos cambios durante un envío se guardan serialmente con versiones consecutivas',async()=>{
  const a=app({config}),m=servidor(a);await a.run('loadRemoteDB()');let liberar;m.delay=new Promise(r=>liberar=r);
  a.run('DB.clientes[0].deuda=100;persistDBSoon();');const first=a.run('saveRemoteDB()');a.run('DB.clientes[0].deuda=200;persistDBSoon();');const joined=a.run('saveRemoteDB()');
  liberar();assert.equal(await first,true);assert.equal(await joined,true);assert.equal(m.maxActive,1);assert.equal(m.requests.length,2);assert.deepEqual(m.requests.map(r=>r.filters.version),[1,2]);assert.equal(m.state.data.clientes[0].deuda,200);assert.equal(a.storage.size,0);
});
test('Sin version se usa updated_at como condición de escritura',async()=>{
  const a=app({config}),m=servidor(a,{sinVersion:true});await a.run('loadRemoteDB()');a.run('DB.clientes[0].deuda=100;persistDBSoon();');assert.equal(await a.run('saveRemoteDB()'),true);
  assert.equal(m.requests[0].filters.updated_at,'2026-10-07T12:00:00.000Z');assert.equal(m.requests[0].payload.version,undefined);assert.equal(m.state.data.clientes[0].deuda,100);
});
for(const sinVersion of [false,true])test(`Un conflicto ${sinVersion?'por fecha':'por version'} conserva borrador y bloquea nuevas operaciones`,async()=>{
  const a=app({config}),m=servidor(a,{sinVersion});await a.run('loadRemoteDB()');a.run('DB.clientes[0].deuda=123;persistDBSoon();');m.state.version=2;m.state.updated_at='2026-10-07T12:01:00.000Z';
  assert.equal(await a.run('saveRemoteDB()'),false);assert.equal(a.run('puedeModificarDB()'),false);assert.equal(a.storage.size,1);
  const before=a.run('JSON.stringify(DB)');a.run('procesarVenta()');assert.equal(a.run('JSON.stringify(DB)'),before);assert.equal(m.state.data.clientes[0].deuda,0);
});
test('Un error temporal conserva cambios hasta que el reintento logra guardarlos',async()=>{
  const a=app({config}),m=servidor(a);await a.run('loadRemoteDB()');m.error={message:'Network error'};a.run('DB.clientes[0].deuda=321;persistDBSoon();');assert.equal(await a.run('saveRemoteDB()'),false);assert.equal(a.storage.size,1);
  assert.equal(await a.run('saveRemoteDB()'),true);assert.equal(m.state.data.clientes[0].deuda,321);assert.equal(a.storage.size,0);
});
test('Un error de permisos bloquea operaciones en lugar de simular éxito',async()=>{
  const a=app({config}),m=servidor(a);await a.run('loadRemoteDB()');m.error={code:'42501'};a.run('persistDBSoon()');assert.equal(await a.run('saveRemoteDB()'),false);assert.equal(a.run('syncBlocked'),true);
});
test('Un borrador de la misma revisión puede recuperarse después de recargar',async()=>{
  const storage=new Map(),a=app({config,storage}),m=servidor(a);await a.run('loadRemoteDB()');a.run('DB.clientes[0].deuda=777;persistDBSoon();');
  const b=app({config,storage}),n=servidor(b,{data:clone(m.state.data)});await b.run('loadRemoteDB()');assert.equal(b.run('syncBlocked'),true);await b.run('recuperarBorrador()');assert.equal(n.state.data.clientes[0].deuda,777);assert.equal(storage.size,0);
});
test('Un borrador con revisión vieja no sobrescribe lo guardado por otra sesión',async()=>{
  const storage=new Map(),a=app({config,storage}),m=servidor(a);await a.run('loadRemoteDB()');a.run('DB.clientes[0].deuda=777;persistDBSoon();');
  const b=app({config,storage}),n=servidor(b,{data:clone(m.state.data)});n.state.version=2;await b.run('loadRemoteDB()');await b.run('recuperarBorrador()');assert.equal(n.requests.length,0);assert.equal(b.run('DB.clientes[0].deuda'),0);assert.equal(storage.size,1);
});
test('Un usuario no recupera el borrador de otro usuario',async()=>{
  const storage=new Map(),a=app({config,storage});servidor(a);await a.run('loadRemoteDB()');a.run('DB.clientes[0].deuda=777;persistDBSoon();');
  const b=app({config,storage});servidor(b,{user:'otro-usuario'});await b.run('loadRemoteDB()');assert.equal(b.run('recoveryDraft'),null);assert.equal(b.run('syncBlocked'),false);assert.equal(b.run('DB.clientes[0].deuda'),0);
});
test('Una respuesta de un guardado anterior no cambia una base recién recargada',async()=>{
  const a=app({config}),m=servidor(a);await a.run('loadRemoteDB()');let liberar;m.delay=new Promise(r=>liberar=r);
  a.run('persistDBSoon()');const save=a.run('saveRemoteDB()');await a.run('loadRemoteDB()');liberar();assert.equal(await save,false);assert.equal(a.run('remoteVersion'),1);
});
test('La normalización convierte números de stock sin concatenar cantidades',()=>{
  const a=app();a.run("DB.productos[0].variantes[0].stock='3';DB=normalizarBase(DB);DB.productos[0].variantes[0].stock+=1;");assert.equal(a.run('DB.productos[0].variantes[0].stock'),4);
});
test('Una carga anterior que responde tarde no cambia los datos ni la versión actuales',async()=>{
  const a=app({config}),m=servidor(a);let liberar;
  m.readDelay=new Promise(r=>liberar=r);const anterior=a.run('loadRemoteDB()');
  await new Promise(setImmediate);
  m.state.version=5;m.state.data.clientes[0].deuda=123;
  await a.run('loadRemoteDB()');liberar();await anterior;
  assert.equal(a.run('remoteVersion'),5);assert.equal(a.run('DB.clientes[0].deuda'),123);
  assert.equal(a.run('remoteReady'),true);
});
test('La protección del servidor 40001 conserva el borrador y pide recargar',async()=>{
  const a=app({config}),m=servidor(a);await a.run('loadRemoteDB()');m.error={code:'40001'};a.run('persistDBSoon()');assert.equal(await a.run('saveRemoteDB()'),false);assert.equal(a.run('syncBlocked'),true);assert.equal(a.storage.size,1);
});
test('Un borrador por fecha puede recuperarse después de agregar version sin cambiar datos',async()=>{
  const storage=new Map(),a=app({config,storage}),m=servidor(a,{sinVersion:true});await a.run('loadRemoteDB()');a.run('DB.clientes[0].deuda=777;persistDBSoon();');
  const b=app({config,storage}),n=servidor(b,{data:clone(m.state.data)});await b.run('loadRemoteDB()');await b.run('recuperarBorrador()');assert.equal(n.state.data.clientes[0].deuda,777);assert.equal(storage.size,0);
});
