# TVG Catalog Manager

Primera versión frontend de TVG Catalog Manager, preparada para publicar en GitHub y ejecutar localmente.

## Requisitos
- Node.js 20 o superior
- npm

## Ejecutar
```bash
npm install
npm run dev
```
Abrir la URL que muestra Vite (normalmente http://localhost:5173).

## Generar versión de publicación
```bash
npm run build
```
El sitio compilado queda en `dist/`.

## Qué incluye esta primera versión
- Panel de resumen del catálogo.
- Alta de productos con imagen desde cámara o galería.
- Edición y eliminación de productos.
- Búsqueda y filtros por categoría y estado.
- Control inicial de stock y precios.
- Datos guardados en el navegador mediante `localStorage`.
- Exportación CSV del catálogo.

## Importante
Esta es una base funcional de frontend. Los productos se guardan en el navegador del dispositivo y todavía no se sincronizan entre celulares o computadoras. Para producción multiusuario habrá que conectar una base de datos y almacenamiento de imágenes, además de implementar autenticación y la integración oficial con Mercado Libre (OAuth/API). No ingresar credenciales de Mercado Libre en esta versión.

## Publicar en GitHub
1. Crear el repositorio `tvg-catalog-manager`.
2. Descomprimir este ZIP.
3. Subir el contenido de la carpeta (incluidos `package.json`, `index.html`, `src/`, etc.) a la raíz del repositorio.
4. En GitHub, abrir **Add file → Upload files**, arrastrar los archivos y confirmar el commit.

No subir `node_modules` ni `dist`.
