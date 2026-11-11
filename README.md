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

El catálogo se guarda en la planilla familiar y se conecta automáticamente, sin contraseña. Consulta actualizaciones cada 1 minuto y al volver a la pestaña; mientras se edita un producto, pausa la consulta para conservar el formulario. Las escrituras requieren conexión a Sheets y se comprueba la versión para evitar sobrescribir cambios de otro dispositivo.

El propietario debe [actualizar la implementación de Apps Script](integrations/google-sheets/README.md) una vez para habilitar el acceso sin clave. Cualquier persona con acceso a la app puede leer o modificar el catálogo.

Pruebas del backend con servicios Google simulados: `npm test`. No reemplazan la comprobación contra la implementación real de Google.

## Códigos de barras y escáner

- Al crear un producto, el SKU se completa con un código único sugerido. Se puede personalizar usando letras sin acentos, números o guiones.
- Al guardar un producto nuevo se muestra su etiqueta Code 128. El botón de código de barras de cada fila permite volver a abrirla, descargar el SVG o imprimirla.
- Cada combinación de producto, color y talle debe tener su propio SKU y stock. Si cambia el SKU, se debe reemplazar la etiqueta impresa.
- **Escanear producto**, junto a Nuevo producto, abre la cámara y busca coincidencia exacta con el SKU guardado. También permite ingresar el código manualmente. Puede identificar códigos comerciales existentes si su valor se guardó como SKU.
- La cámara requiere HTTPS y permiso del navegador. El escáner usa la cámara trasera cuando está disponible y detiene la captura al cerrar o identificar un producto. La lectura se procesa en el dispositivo; no se envían imágenes de la cámara a Sheets.
- No hace falta actualizar Apps Script para esta función: utiliza el SKU existente.

Prueba de navegador del circuito de etiquetas y búsqueda: con Vite iniciado en el puerto 5173, ejecutá `npm run test:browser`. Usa Chromium del sistema o el instalado por Playwright (`npx playwright install chromium`); admite `CHROMIUM_PATH`. Simula la API de Sheets, comprueba lectura real del Code128 generado y no modifica la planilla. La cámara se validó además con una fuente de video simulada; el permiso y enfoque deben comprobarse en el celular real.

### Productos que ya tienen código de barras

Dentro de Nuevo producto o Editar producto, **Escanear código de barras** permite leer la etiqueta original y copiar el valor al SKU sin guardar todavía. Luego se completa manualmente la descripción y los demás campos. Conserva los datos ya ingresados y los ceros iniciales; rechaza un código asignado a otro producto. Al cerrar el escáner sin elegir un código se conserva el SKU anterior. Se puede usar la cámara o ingresar el código manualmente. No requiere cambios en Apps Script.

## Instalar en el celular

Android/Chrome: menú → Instalar aplicación o Agregar a pantalla de inicio. iPhone/Safari: Compartir → Agregar a pantalla de inicio. Se usa el ícono TVG y la aplicación se abre sin la barra habitual del navegador cuando el navegador permite instalación independiente. Si ya existía un acceso con el ícono anterior, puede ser necesario quitar ese acceso y agregarlo nuevamente.

El catálogo consulta Sheets cada 1 minuto mientras la pestaña está visible y también al volver a la app. Las escrituras siguen siendo inmediatas al guardar. Requiere conexión a Internet; no guarda cambios pendientes sin conexión.

Con Vite iniciado, `npm run test:install` verifica el intervalo de 60 segundos, el manifiesto, el ícono y los criterios de instalación de Chromium.

## Precio de costo

Cada producto admite un precio de costo unitario en ARS, separado del precio de venta. El contador Costo total del inventario calcula Σ(costo unitario × unidades en stock), con cálculo en centavos, sin depender de búsquedas o filtros. Incluye productos activos e inactivos. Los productos sin costo se identifican como Sin cargar y el contador avisa cuántos faltan con stock; cero se considera un costo cargado. El dato se guarda en Sheets y se exporta a CSV.

Se necesita actualizar Apps Script al esquema 3 para guardar costos. La app conserva la lectura y edición de los campos anteriores con el esquema 2; no envía costos si el script aún no los soporta. Pruebas del circuito de costos, con Vite iniciado: `npm run test:costs`.

## Vender y emitir comprobantes

La pestaña Vender está disponible en el menú de computadora y celular. Permite buscar o escanear productos, armar un carrito, indicar cantidades, cliente y medio de pago. Calcula el total y, en efectivo, el vuelto cuando se informa el importe recibido. Al confirmar registra la venta y descuenta stock en Google Sheets en una única escritura de rango. Comprueba precios, versión del catálogo y stock en el servidor.

Emite un **comprobante interno**, con número propio, fecha, productos, cantidades y pago. Se puede imprimir o guardar como PDF desde el diálogo de impresión del navegador. **No es una factura fiscal de ARCA y no tiene CAE.** La facturación fiscal necesita una integración y autorización adicionales.

Las últimas 100 ventas se consultan y reimprimen desde la pestaña Vender. El historial completo se conserva en la columna gestionada Ventas JSON de TVG_Catalogo. No modificar manualmente esa columna. Los comprobantes conservan los precios de la venta aunque cambie el catálogo.

Si se pierde la confirmación, la app conserva el identificador de la operación en este navegador y permite reintentar la misma venta, incluso tras recargar, sin descontar stock otra vez. Mientras existe una confirmación pendiente, el carrito queda bloqueado y no se permite modificar el catálogo desde ese navegador. Hace falta almacenamiento local habilitado para conservar esa referencia.

Actualizar Apps Script al esquema 4 para confirmar ventas. Con esquemas 2 o 3 se puede seguir usando el catálogo y preparar el carrito, pero no confirmar la venta. Con Vite iniciado: `npm run test:sales` prueba el circuito de venta, impresión, stock, conflictos y recuperación de confirmaciones con el código real del backend ejecutado sobre servicios de Sheets simulados.
