/* ════════════════════════════════════════
   DESCUENTOS POR CONJUNTOS - LÓGICA CENTRALIZADA
════════════════════════════════════════ */

/**
 * Aplica descuento automático del 10% a productos que forman conjuntos completos.
 * 
 * @param {Array} productos - Array de productos en el carrito/venta
 * @returns {Object} Resultado con productos modificados y metadata del descuento
 * 
 * Estructura esperada de producto:
 * {
 *   id: number,
 *   nombre: string,
 *   precio: number,
 *   cantidad: number,
 *   conjuntoId: string (ej: "CONJ1") - null si no pertenece a conjunto,
 *   tipoConjunto: string (ej: "REMERA", "SHORT") - definible por usuario
 * }
 * 
 * Retorna:
 * {
 *   productosConDescuento: Array,
 *   descuentoTotal: number,
 *   descuentoConjuntoAplicado: boolean,
 *   detalles: Array de sets procesados
 * }
 */
function aplicarDescuentoPorConjunto(productos) {
  // Validación inicial
  if (!Array.isArray(productos) || productos.length === 0) {
    return {
      productosConDescuento: productos || [],
      descuentoTotal: 0,
      descuentoConjuntoAplicado: false,
      detalles: []
    };
  }

  // Crear copia para no mutar el array original
  // cloneData puede no estar cargado aún si este script carga antes que app.js
  const _clone = typeof cloneData === "function" ? cloneData : (d => JSON.parse(JSON.stringify(d)));
  const productosModificados = _clone(productos);
  let descuentoTotal = 0;
  const detalles = [];

  // 1. Filtrar productos con conjuntoId válido
  const productosConConjunto = productosModificados.filter(p => p.conjuntoId && p.tipoConjunto);

  if (productosConConjunto.length === 0) {
    return {
      productosConDescuento: productosModificados,
      descuentoTotal: 0,
      descuentoConjuntoAplicado: false,
      detalles: []
    };
  }

  // 2. Agrupar por conjuntoId
  const grupos = agruparPorConjunto(productosConConjunto);

  // 3. Procesar cada grupo
  Object.keys(grupos).forEach(conjuntoId => {
    const grupo = grupos[conjuntoId];
    const resultado = procesarGrupoConjunto(grupo, conjuntoId, productosModificados);
    
    if (resultado.descuentoAplicado) {
      descuentoTotal += resultado.monto;
      detalles.push(resultado.detalle);
    }
  });

  return {
    productosConDescuento: productosModificados,
    descuentoTotal: descuentoTotal,
    descuentoConjuntoAplicado: descuentoTotal > 0,
    detalles: detalles
  };
}

/**
 * Agrupa productos por conjuntoId
 */
function agruparPorConjunto(productos) {
  return productos.reduce((acc, prod) => {
    const cId = prod.conjuntoId;
    if (!acc[cId]) acc[cId] = [];
    acc[cId].push(prod);
    return acc;
  }, {});
}

/**
 * Procesa un grupo de productos del mismo conjunto
 * Valida tipos distintos, calcula cantidad de conjuntos posibles y aplica descuento
 */
function procesarGrupoConjunto(grupo, conjuntoId, productosGlobales) {
  // Agrupar por tipoConjunto dentro del grupo
  const tiposMap = grupo.reduce((acc, prod) => {
    const tipo = prod.tipoConjunto.toUpperCase();
    if (!acc[tipo]) acc[tipo] = [];
    acc[tipo].push(prod);
    return acc;
  }, {});

  const tipos = Object.keys(tiposMap);
  
  // Validar: necesita al menos 2 tipos distintos
  if (tipos.length < 2) {
    return {
      descuentoAplicado: false,
      monto: 0,
      detalle: null
    };
  }

  // 4. Calcular cantidad de conjuntos posibles
  const cantidades = tipos.map(tipo => {
    const totalCantidad = tiposMap[tipo].reduce((sum, p) => sum + (p.cantidad || 1), 0);
    return totalCantidad;
  });

  const conjuntosFormables = Math.min(...cantidades);

  if (conjuntosFormables === 0) {
    return {
      descuentoAplicado: false,
      monto: 0,
      detalle: null
    };
  }

  // 5. Aplicar descuento a productos del conjunto (10%)
  const PORCENTAJE_DESCUENTO = 0.10;
  let montoDescuento = 0;
  const productosDescuentados = [];

  tipos.forEach(tipo => {
    const productosDelTipo = tiposMap[tipo];
    let cantidadRestante = conjuntosFormables;

    productosDelTipo.forEach(prod => {
      const cantProd = prod.cantidad || 1;
      const cantDescuentada = Math.min(cantProd, cantidadRestante);

      if (cantDescuentada > 0) {
        const descuentoUnitario = prod.precio * PORCENTAJE_DESCUENTO;
        const descuentoItem = descuentoUnitario * cantDescuentada;
        
        // Aplicar descuento al producto
        prod.descuentoConjunto = (prod.descuentoConjunto || 0) + descuentoItem;
        prod.precioFinal = prod.precio - descuentoUnitario;
        
        montoDescuento += descuentoItem;
        productosDescuentados.push({
          id: prod.id,
          nombre: prod.nombre,
          tipo: tipo,
          cantidadDescuentada: cantDescuentada
        });

        cantidadRestante -= cantDescuentada;
      }
    });
  });

  return {
    descuentoAplicado: montoDescuento > 0,
    monto: montoDescuento,
    detalle: {
      conjuntoId: conjuntoId,
      tipos: tipos,
      conjuntosAplicados: conjuntosFormables,
      productosDescuentados: productosDescuentados,
      montoDescuento: Math.round(montoDescuento)
    }
  };
}

/**
 * Valida si un conjunto está completo (útil para validación previa)
 */
function validarConjuntoCompleto(productos, conjuntoId) {
  const productosDel = productos.filter(p => p.conjuntoId === conjuntoId);
  
  if (productosDel.length === 0) return false;

  const tiposUnicos = [...new Set(productosDel.map(p => p.tipoConjunto))];
  
  return tiposUnicos.length >= 2;
}

/**
 * Obtiene resumen de conjuntos en los productos
 */
function obtenerResumenConjuntos(productos) {
  const conjuntos = {};

  productos.forEach(prod => {
    if (prod.conjuntoId && prod.tipoConjunto) {
      const cId = prod.conjuntoId;
      if (!conjuntos[cId]) {
        conjuntos[cId] = {
          tipos: [],
          cantidad: 0,
          completo: false
        };
      }
      if (!conjuntos[cId].tipos.includes(prod.tipoConjunto)) {
        conjuntos[cId].tipos.push(prod.tipoConjunto);
      }
      conjuntos[cId].cantidad += (prod.cantidad || 1);
    }
  });

  // Marcar cuáles están completos
  Object.keys(conjuntos).forEach(cId => {
    conjuntos[cId].completo = conjuntos[cId].tipos.length >= 2;
  });

  return conjuntos;
}

/**
 * Limpia descuentos por conjuntos aplicados (si necesitas rollback)
 */
function limpiarDescuentosConjuntos(productos) {
  return productos.map(prod => {
    const copia = { ...prod };
    delete copia.descuentoConjunto;
    delete copia.precioFinal;
    return copia;
  });
}

/* ════════════════════════════════════════
   INTEGRACIÓN CON SISTEMA EXISTENTE
════════════════════════════════════════ */

/**
 * Hook: Aplica descuentos de conjuntos al renderizar carrito
 * Llama esto ANTES de renderCarrito() o en recalcCobrar()
 */
function aplicarDescuentosAlCarrito() {
  const carr = carrito();
  if (!carr || !carr.items) return;

  // Primero limpiar descuentos previos para evitar acumulación
  carr.items = limpiarDescuentosConjuntos(carr.items);

  // Luego aplicar nuevos
  const resultado = aplicarDescuentoPorConjunto(carr.items);

  carr.items = resultado.productosConDescuento;
  carr.descuentoConjuntoAplicado = resultado.descuentoConjuntoAplicado;
  carr.descuentoConjuntoMonto = resultado.descuentoTotal;
  carr.detallesConjuntos = resultado.detalles;

  return resultado;
}

/**
 * Obtiene el monto total de descuentos por conjuntos en el carrito actual
 */
function obtenerDescuentoCarritoConjuntos() {
  const carr = carrito();
  return carr?.descuentoConjuntoMonto || 0;
}

/**
 * Genera descripción legible de los descuentos aplicados
 */
function generarDescripcionDescuentos(detalles) {
  if (!Array.isArray(detalles) || detalles.length === 0) return "";

  return detalles.map(d => {
    const tipos = d.tipos.join(" + ");
    return `${tipos}: ${d.conjuntosAplicados} conjunto${d.conjuntosAplicados > 1 ? 's' : ''} (${formatearMoney(d.montoDescuento)})`;
  }).join(" | ");
}
