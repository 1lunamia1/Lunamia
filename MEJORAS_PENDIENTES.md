# Mejoras pendientes

Documento rapido con mejoras detectadas durante las pruebas locales con Playwright.

## Prioridad alta

- Revisar seguridad antes de publicar datos reales: mantener `config.js` sin credenciales productivas y usar `config.production.js` solo fuera del repo.
- Validar reglas de Supabase/RLS antes de volver a conectar una base real, especialmente lectura/escritura de `app_state`.
- Completar pruebas CRUD locales: crear/editar/eliminar productos, clientes, gastos, transferencias y pagos de cuenta corriente.
- Probar flujo completo de venta con cuenta corriente: venta, aumento de deuda, pago parcial, pago total y reflejo en caja.
- Probar edicion y eliminacion de ventas desde historial con ventas simples, ventas con varios items y ventas con descuento.

## Prioridad media

- Mejorar responsive movil: revisar sidebar, tablas anchas, modales y formularios en pantallas chicas.
- Agregar estados vacios mas claros en secciones como devoluciones, proveedores, movimientos y cierres.
- Mejorar accesibilidad de iconos: los iconos de la fuente aparecen como texto en el arbol accesible de Playwright.
- Revisar textos de arqueo/cierre para explicar mejor la diferencia entre saldo inicial, movimiento del dia y saldo esperado.
- Mostrar mas contexto en analisis cuando hay pocos datos demo, para evitar conclusiones pobres con muestras chicas.

## Prioridad baja

- Agregar un script de smoke test local para abrir la app, recorrer modulos principales y verificar consola limpia.
- Documentar una matriz minima de pruebas manuales antes de publicar cambios.
- Separar capturas de QA en una carpeta ignorada por git, con nombres fechados por corrida.
- Evaluar tooltips en botones solo-icono de tablas para mejorar uso y accesibilidad.
- Revisar consistencia visual de badges, tablas y botones secundarios entre modulos.

## Observaciones de la ultima prueba

- El arranque inicial ya fue corregido: `Inicio` ahora muestra Dashboard y no PDV.
- El dashboard ya identifica correctamente `Demo local`.
- El carrito ya muestra descuento de conjunto antes de cobrar.
- El cierre diario ya no marca sobrantes falsos por saldos iniciales.
- La consola del navegador quedo limpia: 0 errores y 0 warnings.
