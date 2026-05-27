# Luna Mia

Sistema web de gestion para tienda de ropa.

## Estructura

- `index.html`: estructura de la app y modales globales.
- `styles.css`: estilos visuales y layout.
- `app.js`: datos demo, navegacion y logica de negocio en frontend.
- `config.js`: configuracion publica de Supabase.
- `supabase.sql`: tabla y politicas RLS para la base compartida.
- `Luna_Mia_v5.html`: version original monolitica conservada como respaldo.

## Uso local

Abrir `index.html` directamente en el navegador.

## Deploy simple

Para GitHub Pages, subir estos archivos al repositorio y configurar Pages desde la rama principal. GitHub Pages debe publicar `index.html` desde la raiz del proyecto.

## Supabase

1. Ejecutar `supabase.sql` una vez desde Supabase SQL Editor.
2. Crear al menos un usuario en `Authentication > Users`.
3. Mantener habilitado Email/Password.
4. Publicar `index.html`, `styles.css`, `app.js` y `config.js`.

La primera vez que un usuario autenticado abra la app, si `app_state.data` esta vacio, se guardaran los datos demo actuales como estado inicial.

## Nota de arquitectura

La app guarda un unico documento JSON en Supabase (`app_state.id = main`). Es simple y suficiente para empezar, pero no resuelve ediciones simultaneas entre varios usuarios.
