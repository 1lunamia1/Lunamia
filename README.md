# Luna Mia

Sistema web de gestion para tienda de ropa.

## Estructura

- `index.html`: estructura de la app y modales globales.
- `styles.css`: estilos visuales y layout.
- `app.js`: datos demo, navegacion y logica de negocio en frontend.
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

## Deploy simple

Para GitHub Pages, subir estos archivos al repositorio y configurar Pages desde la rama principal. GitHub Pages debe publicar `index.html` desde la raiz del proyecto.

## Supabase

La app publicada usa la URL y publishable key de Supabase definidas en `config.js`. Esa clave no es una clave secreta, pero la seguridad depende de tener RLS activo y de permitir solo usuarios autorizados.

1. Ejecutar `supabase.sql` una vez desde Supabase SQL Editor.
2. Crear usuarios autorizados en `Authentication > Users`.
3. Agregar esos emails a la allowlist:

```sql
insert into app_authorized_users (email)
values ('usuario@ejemplo.com')
on conflict (email) do nothing;
```

4. Mantener deshabilitado el registro publico. Las politicas RLS solo permiten leer/escribir `app_state` a usuarios autenticados cuyo email este en `app_authorized_users`.
5. No publicar service role keys ni claves privadas en este repositorio.

`app_state` usa una columna `version` para evitar sobrescrituras silenciosas: si dos sesiones editan al mismo tiempo, la segunda que intente guardar verá un conflicto y deberá recargar antes de seguir.

La primera vez que un usuario autenticado abra la app, si `app_state.data` esta vacio, se guardaran los datos iniciales cargados por la pagina. Evita conectar Supabase de produccion mientras `data/local-demo.js` este activo si no queres sembrar datos demo.

## Nota de arquitectura

La app guarda un unico documento JSON en Supabase (`app_state.id = main`). Es simple y suficiente para empezar, pero no resuelve ediciones simultaneas entre varios usuarios.
