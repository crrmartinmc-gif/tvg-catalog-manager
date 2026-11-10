# Conectar el catálogo con Google Sheets

Planilla de destino: https://docs.google.com/spreadsheets/d/1JwcHRNFWoUCCq1ywVQQL9_qnZTZtykHDgzio8S9NxKM/edit

## Activación por el propietario (una sola vez)

1. Abrí la planilla con una cuenta que tenga permiso de edición. Entrá a **Extensiones → Apps Script**.
2. Si ya hay código, conservá una copia y creá un proyecto independiente en https://script.google.com en lugar de sobrescribirlo. Copiá el contenido de [Code.gs](Code.gs) en un proyecto nuevo. Guardá los cambios.
3. En **Configuración del proyecto → Propiedades del script**, agregá `CATALOG_PASSWORD` con una clave privada aleatoria de al menos 16 caracteres. No la pegues en el código, GitHub ni el chat. Compartila solo con las personas que administran el catálogo; la clave permite leer y modificar todos los productos.
4. **Implementar → Nueva implementación → Aplicación web**. Seleccioná **Ejecutar como: Yo** y **Quién tiene acceso: Cualquier persona**. Autorizá el acceso solicitado a la planilla desde tu cuenta. Si tu organización no permite esta opción, se necesita otra integración con autenticación; no hagas pública la planilla para intentar arreglarlo.
5. Copiá la URL de la implementación terminada en `/exec`.
6. En la app, elegí **Conectar Google Sheets**. Pegá la URL y escribí la clave privada. La clave permanece en memoria y se vuelve a pedir después de recargar. La URL se recuerda en este navegador.

**No hace falta compartir la planilla públicamente.** El script usa los permisos de su propietario y comprueba la clave antes de leer o escribir. La URL pública sola no permite leer el catálogo. Google recibe los datos de las solicitudes, incluida la clave de acceso, por HTTPS.

## Datos y uso

- El script crea únicamente una pestaña llamada `TVG_Catalogo`; no borra otras pestañas ni importa automáticamente su contenido. Si esa pestaña existe con un formato distinto, se detiene para conservar los datos.
- La primera conexión carga los productos de Sheets. El catálogo local anterior permanece en localStorage, sin subirse ni reemplazar Sheets automáticamente. Exportá CSV antes de conectar si necesitás conservar una copia externa.
- Conectá cada dispositivo con la misma URL y clave. Los cambios de la app se guardan en la planilla; usá **Actualizar desde Sheets** para traer cambios de otro dispositivo. No es una sincronización en tiempo real.
- Al recargar, la app comienza en modo local y requiere conectar otra vez. La interfaz identifica el modo activo. No hay guardado remoto sin conexión ni cola de cambios pendiente.
- Las primeras columnas son ID, Nombre, SKU, Categoria, Precio ARS, Stock y Activo. Las imágenes se fragmentan en las columnas siguientes para respetar el límite de caracteres por celda. Conservá encabezados e ID. Stock debe ser entero, Precio un número y Activo un booleano de Sheets (TRUE/FALSE).
- Se comprueba la versión antes de cada escritura. Si otra persona modificó el catálogo, se bloquea el guardado para evitar sobrescribirla. Cerrá el formulario, actualizá y volvé a aplicar el cambio.
- Si se corta una solicitud, no se afirma que esté guardada: actualizá antes de reintentar, porque Google podría haber completado la escritura.
- Límite inicial: 2000 productos, 2 MB por imagen y 8 MB por solicitud. Para catálogos grandes o acceso por usuario conviene migrar a una base de datos y autenticación individual. Esta implementación está orientada a un pequeño equipo de confianza y comparte una única clave.
- Los cambios manuales concurrentes en Sheets no quedan protegidos por el bloqueo del script. Preferí realizar las ediciones desde la app y guardá respaldos.

## Validación pendiente en la cuenta real

El entorno de desarrollo no tiene acceso a Google ni credenciales para autorizar el proyecto. La integración solo estará activa después del despliegue anterior. Comprobá conexión, alta, recarga/reconexión y lectura desde un segundo dispositivo antes de usarla como almacenamiento principal.
