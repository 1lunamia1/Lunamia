# Luna Mia

Sistema web de gestion para tienda de ropa.

## Estructura

- `index.html`: estructura de la app y modales globales.
- `styles.css`: estilos visuales y layout.
- `app.js`: datos demo, navegacion y logica de negocio en frontend.
- `Luna_Mia_v5.html`: version original monolitica conservada como respaldo.

## Uso local

Abrir `index.html` directamente en el navegador.

## Deploy simple

Para GitHub Pages, subir estos archivos al repositorio y configurar Pages desde la rama principal. GitHub Pages debe publicar `index.html` desde la raiz del proyecto.

## Nota de arquitectura

La app todavia usa datos en memoria dentro de `app.js`. Para una unica base compartida entre dispositivos, el siguiente paso recomendado es conectar Supabase y reemplazar el objeto local `DB` por carga/guardado remoto.
