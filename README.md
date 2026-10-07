# Luna Mia

Sistema web de gestion para tienda de ropa.

## Estructura

- `index.html`: estructura de la app y modales globales.
- `styles.css`: estilos visuales y layout.
- `app.js`: datos demo, navegacion y logica de negocio en frontend.
- `integridad.js`: validaciones de importes, cantidades, stock y relaciones históricas.
- `persistencia.js`: guardado serial, conflictos, borradores locales y respaldos.
- `acreditaciones.js`: ingresos pendientes de tarjetas, comisiones y acreditación manual del neto en caja.
- `pagos-clientes.js`: cobros de cuenta corriente, anulación y tarjetas pendientes.
- `experiencia.js` / `experiencia.css`: búsquedas, filtros, accesibilidad y navegación móvil.
- `scripts/test-*.cjs`: pruebas aisladas de lógica y persistencia.
- `scripts/test-supabase.sql`: prueba de migración y permisos en una base PostgreSQL aislada.
- `.github/workflows/checks.yml`: verificaciones de sintaxis, lógica y SQL en push/PR.
- `MEJORAS_PENDIENTES.md`: reporte actual, verificaciones, limitaciones y mejoras posteriores.
- `config.js`: configuracion por host. En localhost no conecta a Supabase; en produccion usa Supabase.
- `config.example.js`: ejemplo para conectar Supabase en un entorno privado.
- `data/local-demo.js`: base demo ficticia para probar localmente.
- `supabase.sql`: tabla y politicas RLS para la base compartida.

## Uso local

El repositorio queda listo para probar sin tocar Supabase. Levantar un servidor estatico desde la carpeta del proyecto:

```bash
python3 -m http.server 8080
```

Luego abrir `http://localhost:8080/`.

Con `http://localhost` o `http://127.0.0.1`, `config.js` deja la configuracion vacia y la app usa solo la base demo ficticia de `data/local-demo.js`. Los cambios que hagas en la prueba viven en memoria del navegador y se pierden al recargar.

Flujos rapidos para probar:

- Punto de venta: `Ventas > Punto de venta`, agregar productos y cobrar.
- Descuento por conjunto: agregar una remera demo y un short demo del mismo conjunto.
- Cuenta corriente: seleccionar `Cliente Cta Cte Demo` y enviar parte del pago a cuenta corriente.
- Edicion de venta: `Ventas > Historial`, editar la venta creada.
- Caja: revisar `Caja > Resumen del dia` y `Caja > Movimientos`.

## Cobros con tarjeta e ingreso del dinero

Las nuevas ventas con tarjeta de crédito o débito se confirman y descuentan stock, pero el importe de tarjeta queda con **Ingreso de dinero pendiente**. No suma saldo en caja hasta registrar la acreditación. En pagos mixtos, efectivo y transferencia ingresan al confirmar; cada pago de tarjeta se acredita por separado. La parte en cuenta corriente genera deuda del cliente.

Para registrar el dinero recibido:

1. Abrir `Ventas > Historial` y hacer clic en **Ingreso de dinero pendiente**. También hay accesos desde Inicio y Caja para ver los ingresos pendientes.
2. Seleccionar el pago, ingresar la comisión en pesos o el neto recibido, y elegir caja, destino del dinero y fecha de ingreso.
3. Confirmar **Dinero ingresado**. Se registra un movimiento por el neto en la fecha elegida; stock, puntos y deuda no se aplican otra vez. El total de la venta conserva lo pagado por el cliente.

Ejemplo: venta de $19.000 y comisión de $950 → ingreso en caja de $18.050. La comisión queda asociada al pago y se descuenta del resultado mensual, sin registrar un segundo egreso en caja. El historial muestra el estado de ingreso, neto y comisión. Análisis muestra por separado las tarjetas que aún deben ingresar, incluidas en patrimonio a su importe bruto hasta conocer la comisión.

**Venta pendiente de cobro** corresponde a una reserva que el cliente todavía no pagó. Es diferente de una venta confirmada con tarjeta cuyo dinero aún no llegó.

Los pagos históricos sin estado de acreditación conservan su comportamiento anterior y sus saldos; no se descuentan automáticamente de caja. Al editar una venta con una acreditación registrada, se conservan total y método de pago para mantener el ingreso; se pueden editar los demás datos. Eliminar una venta revierte el neto efectivamente ingresado y cancela sus importes pendientes.

## Cobros de cuenta corriente

Los pagos de deuda se consultan en `Clientes > Cobros registrados`. Efectivo/transferencia ingresan al confirmar. Crédito/débito reducen la deuda del cliente, pero su dinero queda pendiente de acreditación. `Caja > Ingresos de tarjetas` reúne tarjetas pendientes de ventas y cobros de deuda. Cada ingreso registra neto, comisión, fecha y destino.

Anular un pago revierte su aplicación a deuda y favor; si el favor ya fue utilizado, genera la deuda correspondiente. Si el dinero ingresado se gastó y la reversión dejaría la caja negativa, la operación se rechaza.

## Pruebas

Con Node.js disponible, sin instalar dependencias:

```bash
node --test scripts/test-acreditaciones.cjs scripts/test-integridad.cjs scripts/test-persistencia.cjs scripts/test-busquedas.cjs
```

Las 84 pruebas cubren acreditaciones, stock concurrente entre carritos, importes, devoluciones, cuentas, edición/anulación, referencias, búsquedas por nombre/teléfono/código y guardado con errores/conflictos. Usan datos aislados y no conectan a Supabase.

La prueba SQL requiere PostgreSQL 16 en una base desechable llamada `lunamia_qa`, sin tablas de la app ni roles `anon`/`authenticated` previos, ejecutada como administrador local:

```bash
psql -d lunamia_qa -f scripts/test-supabase.sql
```

El script crea roles ficticios y ejecuta la migración dos veces. **No ejecutarlo en producción.** El workflow ejecuta esta prueba en un contenedor nuevo de PostgreSQL. Las acciones de CI siguen las versiones publicadas en los repositorios oficiales de [checkout](https://github.com/actions/checkout) y [setup-node](https://github.com/actions/setup-node).

## Deploy simple

Para GitHub Pages, subir estos archivos al repositorio y configurar Pages desde la rama principal. GitHub Pages debe publicar `index.html` desde la raiz del proyecto.

## Supabase

La app publicada usa la URL y publishable key de Supabase definidas en `config.js`. Esa clave no es una clave secreta, pero la seguridad depende de tener RLS activo y de permitir solo usuarios autorizados.

1. Como administrador, respaldar `app_state` y ejecutar `supabase.sql` desde Supabase SQL Editor. Prepara tablas y agrega `version` sin reemplazar el documento existente.
2. Crear/verificar los usuarios de la tienda en `Authentication > Users`.
3. Agregar sus emails reales a la allowlist:

```sql
insert into public.app_authorized_users (email)
values ('usuario@ejemplo.com')
on conflict (email) do nothing;
```

4. **Volver a ejecutar `supabase.sql`** para activar las políticas de la allowlist. Con una lista vacía, el script deja un aviso y no sustituye las políticas de acceso de `app_state`, para evitar bloquear a todos los operadores antes de provisionarlos. Con usuarios provisionados elimina las políticas anteriores de esa tabla y restringe lectura/escritura a `main` y emails autorizados.
5. Mantener deshabilitado el registro público. Verificar lectura/guardado con un usuario autorizado y rechazo con uno no autorizado.
6. Publicar los archivos de la aplicación actualizados y refrescar las pestañas abiertas. El trigger exige avanzar la versión en cada actualización; las pestañas antiguas deben recargarse.
7. No publicar service role keys ni claves privadas.

El guardado usa una condición sobre `version`. Si dos sesiones parten de la misma revisión, la segunda detecta conflicto y bloquea nuevas operaciones; no combina cambios automáticamente. El servidor rechaza actualizaciones que no incrementen la versión. Mientras falta esa columna, la aplicación utiliza `updated_at` como condición de escritura, aunque la protección completa requiere aplicar el SQL.

Abrir una base vacía no siembra la demo ni escribe automáticamente. Los datos inválidos se conservan en el servidor y se muestra el error. Un documento existente, incluso si antes se marcó como demo, no se reemplaza automáticamente.

## Borradores y respaldos

En producción se conserva un borrador local por proyecto y usuario antes de guardar; los errores temporales se reintentan. Al recargar, un borrador compatible permite **Recuperar cambios**. Si otra sesión cambió la base, se ofrece descargarlo y usar los datos actuales, sin sobrescribirlos silenciosamente. Los errores permanentes de permisos/configuración también bloquean operaciones.

Desde **Respaldo** en la barra superior se puede descargar el JSON o restaurar uno. Restaurar reemplaza el documento completo tras validar su estructura y confirmar; primero se descarga una copia de los datos actuales. Ante un conflicto, revisar ambos respaldos antes de cualquier restauración. La copia local requiere almacenamiento disponible en el navegador; el aviso informa si no se puede conservar.

Los carritos pausados siguen en memoria: no se recuperan al recargar. En demo local tampoco se persisten las operaciones confirmadas.

## Navegación y búsquedas

Historiales, caja, cuentas, cobros, categorías y proveedores incluyen buscadores; las listas financieras también permiten Desde/Hasta. Ignoran acentos y conservan los filtros durante la sesión. **Limpiar filtros** vuelve a mostrar todos los registros. Los totales superiores mantienen el conjunto completo, como indica la interfaz. Ctrl/Cmd+K enfoca la búsqueda de la sección.

En el punto de venta, escribí en **Buscar cliente o teléfono** y elegí un resultado visible. También podés usar flechas y Enter. Los números se encuentran aunque estén guardados con espacios, guiones o prefijo; buscar no cambia el cliente hasta seleccionarlo. El selector conserva todos los clientes para retomar carritos pausados. Los formularios de cobros, devoluciones, edición de ventas y proveedores usan el mismo componente, con las opciones actuales de cada formulario.

Las acciones habituales aparecen en cabeceras y al principio de Inicio. En móvil el menú se pliega y Carrito/Cobrar quedan al pie del punto de venta. Los modales mantienen visible el pie; Tab conserva el foco y Escape cierra.

## Nota de arquitectura y datos históricos

La app guarda un único documento JSON en Supabase (`app_state.id = main`). Detecta conflictos entre sesiones, pero no hace fusiones ni sustituye las transacciones de un modelo por entidades. RLS depende de aplicar la migración y provisionar los usuarios reales.

Las ventas nuevas conservan el costo unitario; las antiguas sin ese dato usan el costo actual como estimación en análisis. Los pagos históricos con tarjeta sin estado de acreditación conservan su ingreso anterior; no se reinterpreta automáticamente la caja. Las fechas sin año comprobable no se cuentan como operaciones de hoy. Conciliar estos datos requiere información histórica real.
