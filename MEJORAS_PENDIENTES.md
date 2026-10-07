# Estado del proyecto y mejoras

## Estado actual — 07/10/2026

Las correcciones están implementadas en esta versión. Los hallazgos de integridad de stock, pagos, gastos, devoluciones, edición de movimientos y diseño móvil de la revisión inicial quedan resueltos en código. Se revisaron flujos relacionados y se incorporaron mejoras de búsqueda, navegación y recuperación de datos. **La migración de Supabase de producción sigue pendiente de acceso administrativo; publicar los archivos no aplica el SQL.**

La aplicación sigue guardando un documento JSON compartido: el control de concurrencia detecta y bloquea conflictos, pero no combina automáticamente ediciones de dos operadores. Los datos históricos incompletos requieren revisión; las correcciones no recalculan silenciosamente saldos anteriores.

### Correcciones y problemas similares encontrados

| Área | Resultado implementado |
| --- | --- |
| Stock y ventas | Validación al confirmar y aplicar una venta; cantidades enteras y disponibilidad real. Dos carritos con la última unidad no pueden cobrarla dos veces. Cantidades, precios y descuentos inválidos se rechazan. |
| Pagos y cuenta corriente | Revertir un pago con excedente restaura deuda y saldo a favor correctamente. Si ese favor se consumió, se convierte en deuda. Anular una venta a cuenta ya abonada genera crédito. Se valida el límite de cuenta. |
| Tarjetas en cobros de deuda | Los pagos de cuenta corriente con crédito/débito descuentan la deuda, quedan pendientes de ingreso y se acreditan por el neto con comisión. Se consultan en Clientes → Cobros registrados y Caja → Ingresos de tarjetas. |
| Importes | Gastos, transferencias, compras, stock, pagos, límites y cierres validan números e importes. Un faltante de un centavo impide confirmar hasta cobrarlo o enviarlo a cuenta corriente. Los cierres requieren completar los valores contados, incluso cero. |
| Devoluciones | Venta confirmada, variante, cantidad disponible y cliente obligatorios; límite por lo realmente vendido, incluyendo descuentos y centavos. Se impide devolver dos veces lo mismo. La anulación revierte stock/favor; una venta con devoluciones activas no puede editarse o eliminarse. |
| Edición y anulación | Los movimientos vinculados a ventas, compras y cobros se modifican desde la operación original. Las funciones internas también lo protegen. Se restaura el estado completo cuando una edición dejaría caja negativa. Las anulaciones registran la reversión del dinero efectivamente ingresado. |
| Catálogo y referencias | Códigos de variantes estables al renombrar; se bloquea eliminar productos/variantes referenciados y clientes con saldos o actividad. Códigos repetidos y stock inválido se rechazan. Se conserva el costo unitario de las ventas nuevas. IDs no se reutilizan después de eliminar. Las categorías iniciales se conservan al crear/editar. |
| Estado de clientes | La deuda vigente, próxima a vencer y vencida se calcula con la fecha actual. Después de una venta se limpia el cliente del carrito activo y las opciones de cobro anteriores. |
| Caja y análisis | Transferencias con medios diferentes, compras pagadas desde caja, reversión de cobros y acreditaciones por caja se reflejan en resumen/cierre. Los ingresos de stock del mes filtran realmente por mes. Comisiones, devoluciones, favor de clientes y deuda a proveedores se contemplan en análisis. Se renombra el indicador como Resultado mensual. |
| Fechas históricas | Registros sin año comprobable dejan de contarse como operaciones de hoy. Los movimientos con fecha incompleta tienen un grupo diferenciado. |
| Guardado | Solicitudes seriales, reintentos y copia local de cambios pendientes por usuario. Conflictos y errores de permisos/configuración bloquean nuevas operaciones. Guardado condicional por versión; mientras falta esa columna, por `updated_at`. No se reemplaza automáticamente una base inválida o antigua demo. |
| Recuperación | Descargar/restaurar respaldo desde la barra superior. Restaurar valida el formato, pide confirmación y descarga previamente los datos actuales. Un borrador solo se recupera directamente si coincide con la revisión remota. |
| Base y mantenimiento | Migración idempotente con allowlist, eliminación de políticas antiguas amplias y trigger que rechaza guardados sin avanzar la versión. Responsabilidades separadas en integridad, persistencia, acreditaciones, cobros y experiencia. Suite automatizada y workflow de CI incorporados. |

### Experiencia de usuario: cambios realizados

| Lugar | Búsqueda o navegación mejorada |
| --- | --- |
| Ventas y devoluciones | Buscar cliente, número de venta, producto y método/motivo. Desde/Hasta, contador, limpiar filtros y estado sin coincidencias. Nueva venta en la cabecera del historial. |
| Caja | Buscar movimientos, gastos, transferencias e ingresos de tarjetas; filtros por fecha. Mover fondos arriba del resumen; Registrar gasto y Mover fondos en Movimientos. |
| Clientes | Búsqueda en cuenta corriente, cobros, fidelización y alertas. El buscador de clientes conserva el foco y la posición al escribir. Los selectores de cliente permiten buscar por nombre o teléfono. |
| Productos y proveedores | Buscar categorías, proveedores, compras e ingresos de stock. Los selectores de proveedor y productos del editor son buscables. Se amplía la búsqueda del catálogo por código/variante. |
| Inicio | Acciones rápidas junto al título; el saludo y los datos técnicos quedan al final para priorizar el trabajo habitual. |
| Listados | Cabeceras con acciones visibles al desplazarse; columna de acciones fijada a la derecha en tablas anchas. Tablas con desplazamiento horizontal dentro de la sección. |
| Formularios | Título y pie del modal permanecen visibles; solo se desplaza su contenido. Escape cierra, Tab permanece dentro, el foco vuelve al control anterior y los botones de icono tienen nombre accesible. |
| Móvil | Menú plegable con fondo, ancho completo del contenido y grillas adaptadas. En el punto de venta, Carrito/Cobrar permanecen al pie; el menú cerrado no intercepta el teclado. |
| Búsquedas en general | Ignoran acentos, mantienen los filtros al volver a una vista y muestran cuántos registros coinciden. Ctrl/Cmd+K enfoca el buscador disponible. Los filtros no cambian los totales superiores; la interfaz lo informa. |

No se agregaron buscadores a resúmenes, cierre, análisis o guía estática, donde no hay una lista extensa de registros para filtrar.

### Validación realizada

- **76 pruebas automatizadas aprobadas**: 20 de acreditaciones, 39 de integridad y 17 de persistencia. Ejecutan las funciones reales de la aplicación con datos aislados; no conectan a producción.
- Migración ejecutada en **PostgreSQL 16 aislado**: conserva el documento existente, se puede repetir, elimina políticas amplias, restringe usuarios no autorizados, permite al usuario autorizado leer solo `main` y rechaza versiones incorrectas/JSON inválido. Script: `scripts/test-supabase.sql` (solo base `lunamia_qa`).
- **23 vistas revisadas en navegador**, incluyendo Inicio, en escritorio y a 390 × 844 px. Sin desbordamiento horizontal del documento; tablas anchas conservan desplazamiento propio. Renderizado verificado con registros de venta, gasto, transferencia y devolución.
- Pruebas de buscador sin acentos, sin coincidencias, limpiar, fechas, conservación del cursor; menú móvil, foco del modal, Tab, Escape, cabecera y pie visibles. Un modal con 20 métodos de pago mantiene el pie dentro de la pantalla; cambiar el método conserva el foco. Consola: **0 errores y 0 advertencias**.
- Venta desde el botón fijo móvil: crédito $10.990 → stock de 6 a 5, caja $75.000 sin cambios y tarjeta pendiente $10.990.
- Cobro de deuda en navegador: deuda $15.000 → pago con débito → deuda 0, caja $75.000 sin cambios y tarjeta pendiente $15.000 → acreditar comisión $750 → caja $89.250, sin deuda ni ingresos pendientes.
- Sintaxis JavaScript y revisión de espacios con `git diff --check` aprobadas. El workflow `.github/workflows/checks.yml` ejecuta las pruebas JavaScript y SQL en push/PR. El despliegue de los archivos se realiza mediante GitHub Pages desde `main`.
- Capturas locales ignoradas por git: `output/playwright/mejoras-inicio-movil.png`, `mejoras-pdv-movil.png`, `mejoras-cobros-movil.png` y `mejoras-ingresos-tarjetas.png`.

### Pendiente para producción

Se hicieron consultas **de solo lectura y de metadata** con la clave pública configurada, sin descargar registros comerciales:

- Lectura anónima de `app_state`: respuesta 200 con 0 filas visibles.
- Consulta de `app_state.version`: error **42703**, columna ausente en el esquema expuesto.
- Consulta de `app_authorized_users`: error **PGRST205**, tabla no disponible en la API consultada; requiere confirmar esquema/permisos/caché desde administración.
- Registro público de usuarios: deshabilitado en la configuración de Auth.

Estas comprobaciones no prueban los permisos efectivos de todos los usuarios autenticados. Para completar la protección hace falta ejecutar `supabase.sql` como administrador, provisionar los emails autorizados y repetir el script para activar las políticas. La clave pública disponible no permite administrar ese esquema. El procedimiento está en README. Al aplicar la migración, refrescar las pestañas abiertas: el trigger rechaza clientes antiguos que no envíen la nueva versión.

### Mejoras posteriores recomendadas

| Prioridad | Mejora | Motivo |
| --- | --- | --- |
| Alta | Conciliación inicial de datos históricos | Revisar tarjetas anteriores, saldos y fechas incompletas; el código respeta el comportamiento histórico y no puede deducir comisiones o costos que nunca se guardaron. |
| Media | Paginación y filtros más específicos | Los buscadores actuales filtran registros cargados. Para historiales grandes, agregar páginas y filtros por cliente, proveedor, caja/medio y estado. |
| Media | Búsqueda global y acceso directo por número/código | Encontrar venta, cliente o producto sin entrar primero en cada módulo. Ctrl/Cmd+K actualmente enfoca la búsqueda de la vista. |
| Media | Carritos persistentes y recuperación tras recargar | Las ventas pausadas son carritos en memoria y se pierden al recargar. Diferenciar su recuperación de los borradores de operaciones ya confirmadas. |
| Media | Auditoría por operador y permisos por rol | Registrar quién anuló, editó o acreditó; delimitar tareas de caja/administración. Hoy la allowlist controla acceso a todo el documento. |
| Media | Modelo transaccional por entidades | El documento compartido detecta conflictos pero requiere recargar. Separar ventas, stock y movimientos con transacciones facilitaría uso concurrente y grandes volúmenes. |
| Baja | Prueba de navegador repetible en CI | Automatizar el recorrido visual/manual con datos demo; el CI actual cubre lógica y SQL. Mantener capturas de móvil/escritorio por ejecución. |

### Matriz manual antes de publicar

1. Venta en efectivo y venta mixta; segunda venta de la última unidad desde carrito pausado rechazada.
2. Crédito/débito sin ingreso inmediato; acreditar comisión/neto y comprobar Caja, Historial y Cierre.
3. Cuenta corriente: pago parcial, excedente, anulación y tarjeta pendiente; comprobar deuda y favor.
4. Gasto y transferencia: crear/editar/eliminar; revisar ambos medios, saldo insuficiente y caja de destino.
5. Devolución: producto de venta original, descuento, cantidad restante, anulación y bloqueo de edición de venta vinculada.
6. Catálogo/clientes: CRUD sin referencias, bloqueo al borrar referencias, códigos conservados al editar.
7. Dos sesiones autorizadas sobre la misma revisión: segundo guardado en conflicto, borrador descargable y sin sobrescritura. Verificar de nuevo en el entorno real después de aplicar SQL.
8. Navegador a 390 px y escritorio: búsquedas, tablas, modales, menú y botones accesibles; consola limpia.

Las secciones siguientes conservan la evidencia de las revisiones anteriores. Sus pendientes describen el estado de ese momento y quedan actualizados por el reporte actual.

## Revisión inicial — 07/10/2026 (histórica)

Estado general: MVP funcional con problemas de integridad de stock y contabilidad pendientes. Revisión del código y pruebas sobre la demo local; no se consultó ni modificó Supabase de producción.

### Comprobaciones realizadas

- Los ocho archivos JavaScript pasan `node --check`.
- Dashboard y 21 vistas internas se renderizan sin excepciones. Este recorrido verifica renderizado, no constituye una prueba completa de todos los CRUD.
- Venta básica en efectivo mediante la interfaz: venta de $39.990, stock de 1 a 0, caja de $50.000 a $89.990 y movimiento de cobro registrado.
- Consola sin errores ni advertencias durante la revisión.
- No se encontró una suite automatizada ni configuración de CI en el repositorio.
- Repositorio limpio al iniciar la revisión; último commit: `a055129`, del 29/06/2026.

### Hallazgos reproducidos pendientes

| Prioridad | Hallazgo | Evidencia y efecto | Ubicación |
| --- | --- | --- | --- |
| Alta | Sobreventa con carritos pausados | Con stock 1, agregar la misma variante a dos carritos y cobrar ambos registra 2 unidades vendidas. El stock termina en 0 porque se limita con `Math.max(0, ...)`. Validar disponibilidad al confirmar. | `app.js`: `procesarVenta`, `aplicarEfectosVenta` |
| Alta | Reversión incorrecta de pago con excedente | Deuda inicial $15.000, pago $20.000: deuda 0 y saldo a favor $5.000. Revertir los efectos deja deuda $20.000 y conserva los $5.000 a favor. Afecta edición y eliminación de esos pagos. | `app.js`: `ajustarClientePorPagoMovimiento` |
| Alta | Gastos negativos | Un gasto de −$1.000 aumenta caja de $50.000 a $51.000. Rechazar importes no finitos o menores o iguales a cero. | `app.js`: `guardarGasto` |
| Alta | Devoluciones sin validación suficiente | Se aceptó monto −$1.000 sin venta asociada ni cliente, incrementando stock de 6 a 7. Validar importe, venta original y cantidad; definir cómo se asigna el saldo a favor a consumidor final. | `app.js`: `procesarDevolucion` |
| Media | Función interna de edición descoordina ventas y caja | Invocar `guardarEdicionMovimiento` sobre un cobro de venta y cambiar $39.990 a $1.000 modifica caja, pero conserva venta y pagos por $39.990. La interfaz de Movimientos **ya oculta** editar/eliminar para `tipo === "venta"`; la reproducción se hizo invocando la función interna. Agregar protección en la función. | `app.js`: `guardarEdicionMovimiento`, `eliminarMovimiento` |
| Media | Punto de venta recortado en móvil | A 390 × 844 px, la barra lateral ocupa 220 px y deja 170 px para el punto de venta; productos y carrito quedan recortados. Captura local: `output/playwright/audit-2026-10-07-mobile.png` (ignorada por git). | `styles.css`: `.leftnav`, `.pdv-wrap` |

### Riesgos identificados por lectura de código

Estos puntos requieren pruebas controladas de persistencia; no se verificaron contra producción.

- **Alta — Guardado y conflictos:** el guardado diferido no reintenta automáticamente un error, ni conserva una copia durable local de los cambios pendientes. Un conflicto pone `remoteReady=false`, pero permite continuar operando sin guardar. Revisar también solicitudes de guardado superpuestas. Ubicación: `saveRemoteDB`, `persistDBSoon`.
- **Alta — Compatibilidad sin versionado:** si falta `app_state.version`, la aplicación sigue escribiendo sin control de concurrencia. Verificar la migración de `supabase.sql` en producción. La captura compartida muestra `Sincronizado*`, estado que el código usa para este modo; falta comprobar el esquema remoto.
- **Alta — Reemplazo durante la carga:** `loadRemoteDB` reemplaza una base considerada inválida o demo con el estado inicial. Separar inicialización de una base vacía de recuperación de datos inválidos; evitar reemplazos automáticos de datos existentes.
- **Validación de seguridad pendiente:** existen políticas RLS y allowlist en `supabase.sql`; no se verificó su aplicación efectiva en Supabase.
- **Recuperación pendiente:** no se encontró un flujo de respaldo/restauración en la aplicación.
- **Mantenibilidad:** `app.js` tenía 3.293 líneas al revisar, concentrando interfaz, cálculos y persistencia. Separar responsabilidades para facilitar correcciones y pruebas.

### Cambio solicitado: destino del dinero en mover fondos

- Se incorpora el selector **Destino del dinero**, independiente de **Origen del dinero**, con Efectivo, Mercado Pago, Débito y Crédito.
- Las transferencias descuentan del medio de origen y acreditan en el medio de destino, conservando el total entre ambas cajas.
- Se guarda `medioDestino` tanto en la transferencia como en su movimiento. Las transferencias anteriores, sin ese campo, conservan el comportamiento de acreditar en el mismo medio del origen.
- Resumen, movimientos, historial de transferencias y cierre contemplan ambos medios. La edición y eliminación revierten los saldos correspondientes.
- Se rechazan transferencias con monto no positivo o no finito, saldo insuficiente o cajas iguales.
- Los demás hallazgos anteriores quedan pendientes; esta modificación aborda el flujo de transferencias solicitado.

#### Verificación del cambio

- 108 comprobaciones locales en navegador, incluyendo las 32 combinaciones entre los cuatro medios en ambos sentidos entre cajas: creación, guardado de ambos medios, conservación del total y eliminación con restauración de saldos.
- Edición de origen y destino, reversión de una edición rechazada por saldo insuficiente, compatibilidad con transferencias sin `medioDestino`, y acreditación en cajas antiguas sin una clave de débito/crédito.
- Rechazo de montos negativos/cero, fondos insuficientes y cajas iguales.
- Cierre: ingreso desde efectivo de reinversión a Mercado Pago principal se contabiliza en el neto de Mercado Pago, usando el medio de destino.
- Flujo desde la interfaz: Mover fondos → Mercado Pago principal a Efectivo reinversión por $1.000 → Confirmar. Mercado Pago principal pasó de $25.000 a $24.000; efectivo reinversión, de $10.000 a $11.000. Total conservado: $85.000; ambos medios visibles en el resumen.
- Captura local del formulario: `output/playwright/transferencia-destino-dinero.png` (ignorada por git).
- Sintaxis JavaScript y `git diff --check` correctos; consola sin errores ni advertencias. Pruebas locales, sin escrituras a Supabase de producción.

## Cambio solicitado — cobros con tarjeta e ingreso pendiente (07/10/2026)

- Nuevos pagos de crédito/débito quedan con `acreditacion: "pendiente"`. Confirmar la venta descuenta stock y registra la compra, pero no suma esos importes a caja.
- En una venta mixta, efectivo/transferencia ingresan al confirmar; la cuenta corriente genera deuda y cada tarjeta mantiene su propia acreditación pendiente.
- Historial e Inicio muestran **Ingreso de dinero pendiente** con acción para registrar el ingreso. Caja e Inicio ofrecen acceso al filtro de ventas con tarjetas pendientes.
- El formulario permite ingresar comisión en pesos o neto recibido, caja y medio de destino, y fecha de ingreso. Se registra el neto una sola vez, sin repetir stock, puntos ni deuda.
- El historial pasa a **Dinero ingresado** y muestra neto y comisión. El total de venta conserva el importe abonado por el cliente.
- El movimiento usa la fecha real de ingreso. El cierre de caja principal contempla únicamente cobros y gastos de esa caja, para no sumar acreditaciones destinadas a reinversión.
- Las comisiones registradas se descuentan del flujo libre en el mes de ingreso, sin un segundo descuento de saldo en caja. Análisis incorpora las tarjetas pendientes como importes por ingresar, a valor bruto hasta conocer la comisión.
- Eliminar una venta pendiente no resta dinero que nunca entró; eliminar una acreditada revierte el neto en su caja y medio correspondientes. Las reservas sin cobro no revierten puntos de compras anteriores.
- Editar conserva los datos de acreditación si no cambian total y método. Con ingresos ya registrados, se bloquea cambiar esos campos. Un editor abierto antes de otro cambio de la venta debe reabrirse para no sobrescribir la acreditación.
- Los pagos históricos sin `acreditacion` conservan el comportamiento previo. No se hizo una migración de saldos de producción.

### Validación

- 20 pruebas automatizadas aprobadas en `scripts/test-acreditaciones.cjs`, ejecutadas con `node --test scripts/test-acreditaciones.cjs`. Cubren crédito/débito, pagos mixtos, deuda, importes negativos, comisiones inválidas y cero, duplicación, eliminación, edición, reservas y datos históricos.
- Prueba completa en navegador: venta de $19.000 con crédito → caja principal se mantiene en $75.000, stock pasa de 1 a 0 e ingreso queda pendiente → comisión de $950 → caja principal pasa a $93.050 con un movimiento por $18.050, venta sigue en $19.000, stock permanece en 0 y estado pasa a **Dinero ingresado**.
- Capturas locales: `output/playwright/tarjeta-ingreso-pendiente.png` y `output/playwright/tarjeta-registrar-ingreso.png` (ignoradas por git).
- Otras nueve comprobaciones en navegador aprobadas: aviso de pendientes en Caja, filtro de ventas, cálculo de comisión desde el neto, vaciado del filtro al acreditar, detalle de neto/comisión, comisiones en análisis y uso del neto en el cierre.
- Sintaxis de los nueve archivos JavaScript y `git diff --check` correctos; consola del navegador sin errores ni advertencias.
- Validación local; sin conexión ni escrituras a la base productiva. Continúan pendientes los riesgos de guardado y concurrencia documentados en la revisión de estado.
