# TVG Catalog Manager

Aplicación de catálogo e inventario en español, construida con React, TypeScript y Vite.

## Desarrollo

Requiere Node.js 20 o superior y npm.

```sh
npm ci
npm run dev
```

Vite sirve la aplicación bajo `/tvg-catalog-manager/`.

```sh
npm run build
npm run preview
```

La compilación ejecuta la comprobación de TypeScript y genera `dist/`. GitHub Actions valida el proyecto y el flujo de despliegue publica en GitHub Pages cuando Pages está configurado para usar Actions.

## Funciones

- Alta, edición y eliminación con confirmación.
- SKU único, categorías, descripción, color, talle/medida, tipo, precios en ARS y stock entero no negativo.
- Imágenes JPG, PNG y WebP de hasta 2 MB desde el dispositivo.
- Búsqueda por nombre, SKU, descripción, color, talle o tipo; filtros por categoría, estado y stock bajo.
- Resumen de productos activos, stock bajo y valor del inventario.
- Exportación CSV de los productos filtrados, compatible con Excel y con protección contra fórmulas.
- Guardado compartido en Google Sheets con actualización automática.
- Diseño adaptable a celulares y computadoras.

El catálogo usa la pestaña TVG_Catalogo de la planilla configurada. Exportá CSV periódicamente (no incluye las imágenes). No requiere claves ni conexiones a Mercado Libre.

## Google Sheets

El catálogo se guarda en la planilla familiar y se conecta automáticamente, sin contraseña. Consulta actualizaciones cada 15 segundos y al volver a la pestaña; mientras se edita un producto, pausa la consulta para conservar el formulario. Las escrituras requieren conexión a Sheets y se comprueba la versión para evitar sobrescribir cambios de otro dispositivo.

El propietario debe [actualizar la implementación de Apps Script](integrations/google-sheets/README.md) una vez para habilitar el acceso sin clave. Cualquier persona con acceso a la app puede leer o modificar el catálogo.

Pruebas del backend con servicios Google simulados: `npm test`. No reemplazan la comprobación contra la implementación real de Google.
