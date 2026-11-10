/* Catálogo familiar compartido, sin contraseña. Cualquier persona con acceso a la app puede leer y modificar productos. */
const TVG_SPREADSHEET_ID = "1JwcHRNFWoUCCq1ywVQQL9_qnZTZtykHDgzio8S9NxKM";
const TVG_TAB = "TVG_Catalogo";
const TVG_HEADERS = [
  "ID",
  "Nombre",
  "SKU",
  "Categoria",
  "Precio ARS",
  "Stock",
  "Activo",
  "Imagen 1",
];

function doGet() {
  return tvgJson({ ok: true, service: "TVG Catalog Manager", protocol: 1 });
}

function doPost(e) {
  let lock;
  try {
    const text = e && e.postData && e.postData.contents;
    if (!text || text.length > 8 * 1024 * 1024)
      throw new Error("Solicitud vacía o demasiado grande (máximo 8 MB).");
    const body = JSON.parse(text);
    if (body.action !== "read" && body.action !== "write")
      throw new Error("Operación inválida.");
    lock = LockService.getScriptLock();
    if (!lock.tryLock(20000))
      throw new Error("El catálogo está ocupado. Intentá de nuevo.");
    const spreadsheet = SpreadsheetApp.openById(TVG_SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(TVG_TAB);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(TVG_TAB);
      sheet.getRange(1, 1, 1, TVG_HEADERS.length).setValues([TVG_HEADERS]);
      sheet.setFrozenRows(1);
    }
    let products = tvgRead(sheet);
    let version = tvgVersion(products);
    if (body.action === "write") {
      if (body.version !== version)
        throw new Error(
          "El catálogo cambió en otro dispositivo o en la planilla. Actualizá desde Sheets y volvé a aplicar tu cambio.",
        );
      tvgValidate(body.products);
      tvgWrite(sheet, body.products);
      SpreadsheetApp.flush();
      products = tvgRead(sheet);
      version = tvgVersion(products);
    }
    return tvgJson({ ok: true, products: products, version: version });
  } catch (error) {
    const known = error && error.message;
    // Do not expose Google account or authorization details to unauthenticated clients.
    const allowed =
      /^(Solicitud|Falta configurar|Clave del|Operación|El catálogo|Los datos|Hay |Producto|La pestaña)/;
    return tvgJson({
      ok: false,
      error: allowed.test(known || "")
        ? known
        : "No se pudo acceder al catálogo. Revisá los permisos y la ejecución de Apps Script.",
    });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function tvgJson(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
function tvgVersion(products) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      JSON.stringify(products),
    ),
  );
}
function tvgValidate(products) {
  if (!Array.isArray(products) || products.length > 2000)
    throw new Error("Los datos deben contener hasta 2000 productos.");
  const ids = new Set();
  const skus = new Set();
  products.forEach(function (p) {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      p.id.length > 100 ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 120 ||
      typeof p.sku !== "string" ||
      !p.sku.trim() ||
      p.sku.length > 60 ||
      typeof p.category !== "string" ||
      !p.category.trim() ||
      p.category.length > 60 ||
      !Number.isFinite(p.price) ||
      p.price < 0 ||
      !Number.isInteger(p.stock) ||
      p.stock < 0 ||
      typeof p.active !== "boolean" ||
      typeof p.image !== "string" ||
      p.image.length > 2800000 ||
      (p.image &&
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image))
    ) {
      throw new Error(
        "Producto inválido. Revisá nombre, SKU, categoría, precio, stock e imagen.",
      );
    }
    const sku = p.sku.trim().toLowerCase();
    if (ids.has(p.id) || skus.has(sku))
      throw new Error("Hay productos con ID o SKU duplicado.");
    ids.add(p.id);
    skus.add(sku);
  });
}
function tvgRead(sheet) {
  const values = sheet.getDataRange().getValues();
  if (
    !TVG_HEADERS.every(function (h, i) {
      return values[0] && values[0][i] === h;
    })
  ) {
    throw new Error(
      "La pestaña TVG_Catalogo existe con otro formato. Renombrala para conservarla antes de conectar.",
    );
  }
  const products = values
    .slice(1)
    .filter(function (row) {
      return row.some(function (cell) {
        return cell !== "";
      });
    })
    .map(function (row) {
      // Strings and numeric values are deliberately kept distinct for validation.
      return {
        id: String(row[0]),
        name: String(row[1]),
        sku: String(row[2]),
        category: String(row[3]),
        price: row[4],
        stock: row[5],
        active: row[6],
        image: row.slice(7).join(""),
      };
    });
  tvgValidate(products);
  return products;
}
function tvgText(value) {
  // Leading apostrophe prevents formulas; Sheets returns the original literal text on read.
  return /^[=+@\-\t\r']/.test(value) ? "'" + value : value;
}
function tvgWrite(sheet, products) {
  const rows = products.map(function (p) {
    const chunks = p.image.match(/.{1,40000}/g) || [""];
    return [
      tvgText(p.id),
      tvgText(p.name),
      tvgText(p.sku),
      tvgText(p.category),
      p.price,
      p.stock,
      p.active,
    ].concat(chunks);
  });
  const columns = Math.max(
    TVG_HEADERS.length,
    sheet.getLastColumn(),
    rows.reduce(function (n, row) {
      return Math.max(n, row.length);
    }, 0),
  );
  const rowCount = Math.max(rows.length + 1, sheet.getLastRow());
  const headers = TVG_HEADERS.slice();
  while (headers.length < columns)
    headers.push("Imagen " + (headers.length - 6));
  const data = [headers].concat(rows);
  while (data.length < rowCount) data.push([]);
  data.forEach(function (row) {
    while (row.length < columns) row.push("");
  });
  if (columns > sheet.getMaxColumns())
    sheet.insertColumnsAfter(
      sheet.getMaxColumns(),
      columns - sheet.getMaxColumns(),
    );
  if (rowCount > sheet.getMaxRows())
    sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
  // One range write replaces the snapshot, including blank rows for removed products.
  sheet.getRange(1, 1, rowCount, columns).setValues(data);
}
