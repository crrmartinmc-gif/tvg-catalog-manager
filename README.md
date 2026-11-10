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
- SKU único, categorías, precios en ARS y stock entero no negativo.
- Imágenes JPG, PNG y WebP de hasta 2 MB desde el dispositivo.
- Búsqueda por nombre o SKU, filtros por categoría, estado y stock bajo.
- Resumen de productos activos, stock bajo y valor del inventario.
- Exportación CSV de los productos filtrados, compatible con Excel y con protección contra fórmulas.
- Guardado local persistente en el navegador, con aviso si falla el almacenamiento.
- Diseño adaptable a celulares y computadoras.

El catálogo comienza vacío. Los datos se guardan en este navegador y dispositivo; no hay sincronización ni respaldo remoto. Exportá CSV periódicamente (no incluye las imágenes). No requiere credenciales ni conexiones a Mercado Libre. Para multiusuario hace falta incorporar backend, almacenamiento y autenticación.

## Google Sheets

La app incluye una conexión opcional a la planilla del negocio mediante Apps Script. Requiere autorización y despliegue por el propietario de la cuenta. Consultá [la guía de activación](integrations/google-sheets/README.md). Sin conectar continúa en modo local.

Pruebas del backend de integración con servicios de Google simulados: `npm test`. No reemplazan la validación contra la implementación real de Google.
