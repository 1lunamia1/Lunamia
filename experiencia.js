/* Búsquedas, navegación y accesibilidad sin dependencias externas. */
const filtrosVista={};
const BUSQUEDAS={
  renderHistorialVentas:{id:"ventas",placeholder:"Buscar venta, cliente, producto o método...",fechas:true},
  renderDevoluciones:{id:"devoluciones",placeholder:"Buscar venta, cliente, producto o motivo...",fechas:true},
  renderCajaMovimientos:{id:"movimientos",placeholder:"Buscar concepto, cliente, medio o fecha...",selector:".mov-item",fechas:true},
  renderCajaGastos:{id:"gastos",placeholder:"Buscar gasto, categoría, caja o medio...",fechas:true},
  renderCajaTransferencias:{id:"transferencias",placeholder:"Buscar origen, destino, medio o motivo...",fechas:true},
  renderIngresosPage:{id:"ingresos",placeholder:"Buscar proveedor, producto o remito...",fechas:true},
  renderProvIngresos:{id:"prov-ingresos",placeholder:"Buscar proveedor, producto o remito...",fechas:true},
  renderProvHistorial:{id:"compras",placeholder:"Buscar proveedor, producto o remito...",fechas:true},
  renderProvLista:{id:"proveedores",placeholder:"Buscar proveedor, rubro o teléfono...",selector:'[onclick^="verFichaProv("]'},
  renderCuentaCorriente:{id:"cuentas",placeholder:"Buscar cliente o teléfono...",selector:"[data-search-record]"},
  renderFidelizacion:{id:"fidelizacion",placeholder:"Buscar cliente o nivel..."},
  renderAlertasCli:{id:"alertas",placeholder:"Buscar cliente, deuda o vencimiento...",selector:".notif"},
  renderCategoriasPage:{id:"categorias",placeholder:"Buscar categoría o código..."},
  renderPagosClientes:{id:"pagos-clientes",placeholder:"Buscar cliente, importe o estado...",fechas:true},
  renderIngresosTarjetaPendientes:{id:"tarjetas",placeholder:"Buscar venta, cobro o cliente...",fechas:true},
};
function agregarBusqueda(cfg){
  const area=document.getElementById("main-area"),header=area?.querySelector(".ph");
  if(!header||area.querySelector(".search-toolbar"))return;
  const state=filtrosVista[cfg.id]??={q:"",desde:"",hasta:""};
  const records=[...area.querySelectorAll(cfg.selector||"tbody tr")].filter(r=>!r.dataset.empty&&r.querySelectorAll("td[colspan]").length===0);
  area.querySelectorAll("tbody td[colspan]").forEach(td=>td.parentElement.hidden=true);
  const toolbar=document.createElement("div");toolbar.className="search-toolbar";
  toolbar.innerHTML=`<div class="search-main"><label class="sr-only" for="buscar-${cfg.id}">Buscar en esta sección</label><input type="search" id="buscar-${cfg.id}" placeholder="${cfg.placeholder}" autocomplete="off"/><button class="btn btn-out btn-sm" type="button">Limpiar filtros</button><span class="search-count" role="status" aria-live="polite"></span></div>${cfg.fechas?`<div class="search-dates"><label>Desde<input type="date" data-filter="desde"/></label><label>Hasta<input type="date" data-filter="hasta"/></label><span class="search-help">Los totales superiores corresponden a todos los registros.</span></div>`:""}`;
  header.after(toolbar);
  const input=toolbar.querySelector('input[type="search"]');input.value=state.q;
  const desde=toolbar.querySelector('[data-filter="desde"]'),hasta=toolbar.querySelector('[data-filter="hasta"]');
  if(desde)desde.value=state.desde;if(hasta)hasta.value=state.hasta;
  const empty=document.createElement("div");empty.className="empty-state";empty.textContent="No hay registros que coincidan con estos filtros.";empty.hidden=true;
  const container=area.querySelector(".scroll")||area.querySelector(".tw")?.parentElement||header.parentElement;
  container.appendChild(empty);
  const details=[...area.querySelectorAll("details")],initialOpen=new Map(details.map(d=>[d,d.open]));
  const apply=()=>{
    state.q=input.value;state.desde=desde?.value||"";state.hasta=hasta?.value||"";
    const terms=normalizarBusqueda(state.q).split(/\s+/).filter(Boolean);
    const rangoInvalido=state.desde&&state.hasta&&state.desde>state.hasta;
    if(hasta)hasta.setCustomValidity(rangoInvalido?"La fecha final debe ser posterior a la inicial.":"");
    let visible=0;
    for(const row of records){
      const grupos=[];
      for(let parent=row.parentElement;parent&&parent!==area;parent=parent.parentElement){
        if(parent.tagName==="DETAILS")grupos.push(parent.querySelector(":scope > summary")?.textContent||"");
        if(parent.dataset.searchGroup)grupos.push(parent.dataset.searchGroup);
      }
      const grupo=grupos.join(" ");
      const text=normalizarBusqueda(`${row.textContent} ${row.dataset.search||""} ${grupo}`);
      const fecha=row.dataset.date||"";
      const match=!rangoInvalido&&terms.every(t=>text.includes(t))&&(!state.desde||fecha>=state.desde)&&(!state.hasta||(fecha&&fecha<=state.hasta));
      row.hidden=!match;if(match)visible++;
    }
    for(const group of [...details,...area.querySelectorAll("[data-search-group]")]){
      const contained=records.filter(r=>group.contains(r));
      if(!contained.length)continue;
      group.hidden=contained.every(r=>r.hidden);
      if(group.tagName==="DETAILS")group.open=terms.length||state.desde||state.hasta?!group.hidden:initialOpen.get(group);
    }
    toolbar.querySelector(".search-count").textContent=`${visible} de ${records.length} registros`;
    empty.textContent=rangoInvalido?"Revisá el rango de fechas: Desde no puede ser posterior a Hasta.":records.length?"No hay coincidencias. Probá otro texto o limpiá los filtros.":"Todavía no hay registros en esta sección.";
    empty.hidden=visible>0;
  };
  input.addEventListener("input",apply);desde?.addEventListener("change",apply);hasta?.addEventListener("change",apply);
  toolbar.querySelector("button").addEventListener("click",()=>{input.value="";if(desde)desde.value="";if(hasta)hasta.value="";apply();input.focus();});
  apply();
}
function filtrarOpcionesBuscables(opciones,datos,consulta){
  const terms=normalizarBusqueda(consulta).split(/\s+/).filter(Boolean);
  const porId=new Map(datos.map(d=>[String(d.id),d]));
  return opciones.filter(o=>{
    if(!o.value||o.disabled)return false;
    const extra=porId.get(String(o.value));
    const text=normalizarBusqueda(`${o.text} ${extra?.tel||""} ${extra?.codigo||""} ${(extra?.variantes||[]).map(v=>v.cod).join(" ")}`);
    const telefono=String(extra?.tel||"").replace(/\D/g,"");
    return terms.every(t=>text.includes(t)||(!/[a-z]/i.test(t)&&t.replace(/\D/g,"").length>0&&telefono.includes(t.replace(/\D/g,""))));
  });
}
function limpiarBusquedaSelector(id){document.getElementById(id)?.buscador?.limpiar();}
function hacerSelectBuscable(id,placeholder){
  const select=document.getElementById(id);if(!select||select.tagName!=="SELECT")return;
  if(select.buscador){select.buscador.limpiar();return;}
  select.setAttribute("aria-label",select.closest(".fg")?.querySelector("label")?.textContent||(id==="cli-sel"?"Cliente de la venta":"Selección"));
  const wrap=document.createElement("div");wrap.className="select-search-control";
  const input=document.createElement("input");input.type="search";input.id=`${id}-busqueda`;input.placeholder=placeholder;input.className="select-search";input.autocomplete="off";
  input.setAttribute("role","combobox");input.setAttribute("aria-label",placeholder);input.setAttribute("aria-autocomplete","list");input.setAttribute("aria-haspopup","listbox");input.setAttribute("aria-expanded","false");
  const list=document.createElement("div");list.id=`${id}-resultados`;list.className="select-search-results";list.setAttribute("role","listbox");list.setAttribute("aria-label","Resultados de búsqueda");list.hidden=true;
  input.setAttribute("aria-controls",list.id);
  const status=document.createElement("div");status.id=`${id}-estado`;status.className="select-search-status";status.setAttribute("role","status");status.setAttribute("aria-live","polite");
  input.setAttribute("aria-describedby",status.id);
  wrap.append(input,status,list);select.before(wrap);
  let resultados=[],active=-1;
  const cerrar=()=>{list.hidden=true;input.setAttribute("aria-expanded","false");input.removeAttribute("aria-activedescendant");active=-1;};
  const limpiar=()=>{input.value="";status.textContent="";list.replaceChildren();resultados=[];cerrar();};
  select.buscador={limpiar};
  const elegir=opcion=>{
    if(![...select.options].some(o=>o.value===opcion.value&&!o.disabled))return;
    select.value=opcion.value;
    // Mantener el select completo: otros carritos y formularios pueden restaurar su cliente.
    select.dispatchEvent(new Event("change",{bubbles:true}));
    limpiar();status.textContent=`Seleccionado: ${opcion.text}`;
  };
  const mostrar=()=>{
    const q=input.value.trim();if(!q){limpiar();return;}
    const datos=id.includes("prov")?DB.proveedores:id.includes("prod")?DB.productos:DB.clientes;
    const opciones=[...select.options].map(o=>({value:o.value,text:o.text,disabled:o.disabled}));
    const coincidencias=filtrarOpcionesBuscables(opciones,datos,q);
    resultados=coincidencias.slice(0,50);active=-1;list.replaceChildren();input.removeAttribute("aria-activedescendant");
    status.textContent=coincidencias.length?`${coincidencias.length} coincidencia${coincidencias.length===1?"":"s"}. Seleccioná un resultado.${coincidencias.length>50?" Se muestran las primeras 50; escribí más para acotar.":""}`:"Sin coincidencias. Probá otro nombre, teléfono o código.";
    for(const [i,o] of resultados.entries()){
      const item=document.createElement("button");item.type="button";item.id=`${list.id}-${i}`;item.className="select-search-option";item.tabIndex=-1;item.setAttribute("role","option");item.setAttribute("aria-selected","false");
      const name=document.createElement("span");name.textContent=o.text;item.append(name);
      const tel=datos.find(d=>String(d.id)===o.value)?.tel;
      if(tel){const phone=document.createElement("small");phone.textContent=tel;item.append(phone);}
      item.addEventListener("mousedown",ev=>ev.preventDefault());item.addEventListener("click",()=>elegir(o));list.append(item);
    }
    list.hidden=!resultados.length;input.setAttribute("aria-expanded",String(resultados.length>0));
  };
  input.addEventListener("input",mostrar);
  input.addEventListener("focus",()=>{if(input.value.trim())mostrar();});
  input.addEventListener("keydown",ev=>{
    if(ev.key==="Escape"&&!list.hidden){ev.stopPropagation();cerrar();return;}
    if(["ArrowDown","ArrowUp"].includes(ev.key)){
      if(list.hidden)mostrar();if(!resultados.length)return;ev.preventDefault();
      active=ev.key==="ArrowDown"?(active+1)%resultados.length:(active<0?resultados.length-1:(active+resultados.length-1)%resultados.length);
      [...list.children].forEach((item,i)=>item.setAttribute("aria-selected",String(i===active)));
      const item=list.children[active];input.setAttribute("aria-activedescendant",item.id);item.scrollIntoView({block:"nearest"});
    }else if(ev.key==="Enter"&&!list.hidden){
      ev.preventDefault();if(active>=0)elegir(resultados[active]);else if(resultados.length===1)elegir(resultados[0]);
    }else if(ev.key==="Tab")cerrar();
  });
  wrap.addEventListener("focusout",ev=>{if(!wrap.contains(ev.relatedTarget))cerrar();});
  select.addEventListener("change",limpiar);
}
function aplicarAccesibilidad(root=document){
  root.querySelectorAll("i.ti").forEach(i=>i.setAttribute("aria-hidden","true"));
  root.querySelectorAll(".fg").forEach(fg=>{
    const label=fg.querySelector("label"),control=fg.querySelector("input,select,textarea");
    if(label&&control?.id&&!label.htmlFor)label.htmlFor=control.id;
  });
  root.querySelectorAll("button[title]").forEach(b=>{if(!b.textContent.trim())b.setAttribute("aria-label",b.title);});
  root.querySelectorAll('button[onclick*="closeOv"]').forEach(b=>{
    if(!b.textContent.trim())b.setAttribute("aria-label","Cerrar");
    else if(b.getAttribute("aria-label")==="Cerrar")b.removeAttribute("aria-label");
  });
  root.querySelectorAll("[onclick]").forEach(el=>{
    if(el.tagName!=="DIV"&&el.tagName!=="TR")return;
    if(el.dataset.keyboardReady)return;el.dataset.keyboardReady="true";el.tabIndex=0;
    if(el.tagName==="DIV"&&!el.querySelector("button"))el.setAttribute("role","button");
    el.addEventListener("keydown",ev=>{if(ev.target===el&&["Enter"," "].includes(ev.key)){ev.preventDefault();el.click();}});
  });
}
function ajustarVista(){
  const area=document.getElementById("main-area");if(!area)return;
  area.querySelectorAll('[style*="grid-template-columns"]').forEach(grid=>{
    if(grid.style.display!=="grid")return;
    const columns=Number(grid.style.gridTemplateColumns.match(/repeat\((\d+)/)?.[1])||grid.style.gridTemplateColumns.split(" ").length;
    grid.classList.add("layout-grid");grid.dataset.columns=columns;
    if(columns>=3&&[...grid.children].every(el=>el.classList.contains("sc")))grid.classList.add("kpi-grid");
  });
  area.querySelectorAll(".tw").forEach(tw=>{
    tw.tabIndex=0;tw.setAttribute("role","region");tw.setAttribute("aria-label","Tabla; desplazá horizontalmente para ver todas las columnas");
    const table=tw.querySelector("table");if(!table)return;
    const cols=table.querySelectorAll("thead th").length;
    table.style.minWidth=`${Math.max(360,cols*95)}px`;
    const lastHeader=table.querySelector("thead th:last-child")?.textContent.trim();
    if(["","Acciones","Acción"].includes(lastHeader))table.dataset.actions="true";
    table.querySelectorAll("td").forEach(td=>{if(!td.querySelector("button,input,select"))td.title=td.textContent.trim();});
    const body=table.querySelector("tbody");
    if(body&&!body.children.length&&!area.querySelector(".search-toolbar")){const row=document.createElement("tr");row.dataset.empty="true";row.innerHTML=`<td colspan="${cols}" class="empty-state">Todavía no hay registros.</td>`;body.appendChild(row);}
  });
  aplicarAccesibilidad(area);
  for(const id of ["cli-sel","ing-prov","np-prov","pago-cli","dev-cliente","ev-cliente-id"])hacerSelectBuscable(id,id.includes("prov")?"Buscar proveedor...":"Buscar cliente o teléfono...");
  document.querySelectorAll('select[id^="ev-item-prod-"]').forEach(s=>hacerSelectBuscable(s.id,"Buscar producto o código..."));
}
function agregarAccionCabecera(text,handler){
  const ph=document.querySelector("#main-area .ph");if(!ph)return;
  const b=document.createElement("button");b.className="btn btn-out btn-sm";b.textContent=text;b.addEventListener("click",handler);ph.appendChild(b);
}
function toggleNav(force){
  const open=force??!document.body.classList.contains("nav-open");document.body.classList.toggle("nav-open",open);
  document.getElementById("nav-toggle")?.setAttribute("aria-expanded",String(open));
  const mobile=window.matchMedia("(max-width:900px)").matches,nav=document.getElementById("leftnav");
  if(nav){nav.inert=mobile&&!open;nav.setAttribute("aria-hidden",String(mobile&&!open));}
  const area=document.getElementById("main-area");if(area)area.inert=mobile&&open;
}
function actualizarAtajosPDV(){
  const qty=document.getElementById("mobile-cart-qty"),total=document.getElementById("mobile-cart-total"),btn=document.getElementById("mobile-cobrar");
  if(!qty||!total||!btn)return;
  qty.textContent=carrito().items.reduce((a,it)=>a+it.qty,0);total.textContent=document.getElementById("cf-total")?.textContent||fmt(0);btn.disabled=!carrito().items.length;
}
function instalarExperiencia(){
  const nav=renderLeftNav;window.renderLeftNav=function(...args){const result=nav.apply(this,args);aplicarAccesibilidad(document.getElementById("leftnav"));return result;};
  for(const name of [...Object.keys(BUSQUEDAS),"renderProdLista","renderClientesLista","renderPDV","renderCajaResumen","renderItemsEdicion"]){
    const original=window[name];if(typeof original!=="function")continue;
    window[name]=function(...args){
      const active=document.activeElement,focusId=active?.id,start=active?.selectionStart,end=active?.selectionEnd;
      const result=original.apply(this,args);
      if(BUSQUEDAS[name])agregarBusqueda(BUSQUEDAS[name]);
      if(name==="renderCajaResumen")agregarAccionCabecera("Mover fondos",abrirTransfCajas);
      if(name==="renderCajaMovimientos"){agregarAccionCabecera("Registrar gasto",abrirGasto);agregarAccionCabecera("Mover fondos",abrirTransfCajas);}
      if(name==="renderHistorialVentas")agregarAccionCabecera("Nueva venta",abrirVenta);
      if(name==="renderPDV"){
        document.querySelector("#main-area > div")?.classList.add("pdv-page");
        const bar=document.createElement("div");bar.className="mobile-sale-actions";
        bar.innerHTML=`<button class="btn btn-out" onclick="document.querySelector('.pdv-right').scrollIntoView({behavior:'smooth',block:'start'})">Carrito (<span id="mobile-cart-qty"></span>)</button><button class="btn btn-ng" id="mobile-cobrar" onclick="abrirCobrar()">Cobrar <span id="mobile-cart-total"></span></button>`;
        document.getElementById("main-area").appendChild(bar);actualizarAtajosPDV();
      }
      ajustarVista();
      if(focusId){const next=document.getElementById(focusId);if(next?.type==="text"||next?.type==="search"){next.focus({preventScroll:true});if(start!=null)next.setSelectionRange(start,end);}}
      return result;
    };
  }
  const recalc=recalcPDV;window.recalcPDV=function(...args){const result=recalc.apply(this,args);actualizarAtajosPDV();return result;};
  const navigate=showSub;window.showSub=function(...args){const result=navigate.apply(this,args);toggleNav(false);return result;};
  const open=openOv,close=closeOv,triggers=new Map();
  window.openOv=function(id){
    triggers.set(id,document.activeElement);open(id);
    const ov=document.getElementById(id),title=ov.querySelector(".mt");
    ov.setAttribute("role","dialog");ov.setAttribute("aria-modal","true");
    if(title){title.id||=`${id}-title`;ov.setAttribute("aria-labelledby",title.id);}
    ajustarVista();aplicarAccesibilidad(ov);
    setTimeout(()=>{const first=[...ov.querySelectorAll(".mc input,.mc select,.mc button")].find(e=>!e.disabled&&e.type!=="hidden"&&e.offsetParent);first?.focus({preventScroll:true});},0);
  };
  window.closeOv=function(id){close(id);const trigger=triggers.get(id);if(trigger?.isConnected)trigger.focus({preventScroll:true});};
  document.addEventListener("keydown",ev=>{
    if(ev.key==="Escape"){const modal=[...document.querySelectorAll(".ov.on")].pop();if(modal)closeOv(modal.id);else toggleNav(false);}
    if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==="k"){const search=document.querySelector('#main-area input[type="search"],#prod-search,#cli-search,#pdv-search-input');if(search){ev.preventDefault();search.focus();search.select();}}
    if(ev.key==="Tab"){
      const modal=[...document.querySelectorAll(".ov.on")].pop();if(!modal)return;
      const nodes=[...modal.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(e=>!e.disabled&&e.type!=="hidden"&&e.offsetParent);
      const first=nodes[0],last=nodes.at(-1);
      if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus();}
      else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus();}
    }
  });
  aplicarAccesibilidad();
  toggleNav(false);
  window.matchMedia("(max-width:900px)").addEventListener("change",()=>toggleNav(false));
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",instalarExperiencia,{once:true});else instalarExperiencia();
