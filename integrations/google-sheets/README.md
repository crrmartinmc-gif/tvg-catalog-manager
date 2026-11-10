# Catálogo familiar con Google Sheets, sin contraseña

La app se conecta automáticamente al abrirse, guarda cada cambio en Sheets y consulta actualizaciones cada 1 minuto y al volver a la pestaña. No pide clave ni configuración en los dispositivos.

## Actualizar el script existente (una vez)

1. Abrí la planilla → **Extensiones → Apps Script**.
2. Reemplazá el contenido de Código.gs por [Code.gs](Code.gs) y guardá.
3. **Implementar → Administrar implementaciones → Editar (lápiz) → Versión: Nueva versión → Implementar**. Conservá **Ejecutar como: Yo** y **Acceso: Cualquier persona**. Esto conserva la URL que usa la app.
4. Recargá la app. La propiedad antigua `CATALOG_PASSWORD` ya no se usa y se puede eliminar.

Planilla: https://docs.google.com/spreadsheets/d/1JwcHRNFWoUCCq1ywVQQL9_qnZTZtykHDgzio8S9NxKM/edit

El acceso sin clave fue solicitado por el propietario para uso familiar. Cualquier persona con acceso a la app o a la URL del script puede leer, modificar y eliminar productos. No hace falta hacer pública la planilla: el script usa los permisos del propietario.

## Funcionamiento

- Solo se administra la pestaña `TVG_Catalogo`. No se borran ni importan automáticamente otras pestañas.
- Los datos locales de la versión anterior permanecen intactos en el navegador, pero no se mezclan ni se suben automáticamente. La única fuente activa del catálogo es Sheets.
- Si falla la conexión, no se aceptan escrituras locales que aparenten haberse guardado en Sheets. La app reintenta automáticamente.
- Mientras editás un producto, la actualización automática se pausa para conservar tu formulario. Si otra persona cambió el catálogo, la comprobación de versión impide sobrescribirlo. Cerrá el formulario, actualizá y volvé a aplicar tu cambio.
- Si una escritura no se puede confirmar, se bloquea la edición hasta una lectura exitosa del catálogo. No se reenvían escrituras automáticamente para evitar duplicados.
- Las primeras columnas son ID, Nombre, SKU, Categoria, Precio ARS, Stock y Activo. Las imágenes se fragmentan en las columnas siguientes. Conservá encabezados e ID. Precio debe ser número, Stock un entero y Activo un booleano (TRUE/FALSE).
- Las ediciones manuales concurrentes en la planilla no quedan protegidas por el bloqueo de Apps Script. Preferí editar desde la app.
- Límites: 2000 productos, 2 MB por imagen, 8 MB por solicitud. Cada dispositivo visible consulta cada 1 minuto, sujeto a cuotas de Google Apps Script. La consulta se pausa con la pestaña oculta.

## Validación

`npm test` comprueba el backend con servicios Google simulados. Las pruebas de navegador comprueban conexión automática, ausencia de clave, lectura periódica, guardado y protección del formulario. El entorno no tiene acceso a Google para editar o desplegar el script: el propietario debe actualizar la implementación anterior antes de que la conexión sin clave funcione.

## Descripción, color, talle y tipo

Actualizá Código.gs y desplegá una nueva versión de la misma implementación para habilitar estos campos. El script lee las filas anteriores sin modificar sus imágenes y agrega Descripcion, Color, Talle y Tipo al siguiente guardado. No agregues ni desplaces columnas manualmente. Los cuatro campos son opcionales: descripción admite 2000 caracteres y los demás 80. La app requiere la versión de esquema 2 para evitar que una implementación anterior descarte los campos nuevos.
