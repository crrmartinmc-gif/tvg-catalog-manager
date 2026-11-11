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
    if (!["read", "write", "sale"].includes(body.action))
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
    let sales = tvgReadSales(sheet);
    if (body.action === "sale")
      return tvgJson(tvgSell(sheet, products, sales, body));
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
    return tvgJson({
      ok: true,
      products: products,
      version: version,
      schema: 4,
      sales: sales.slice(-100).reverse(),
    });
  } catch (error) {
    const known = error && error.message;
    // Do not expose Google account or authorization details to unauthenticated clients.
    const allowed =
      /^(Solicitud|Falta configurar|Clave del|Operación|El catálogo|Los datos|Hay |Producto|La pestaña|La venta|Las ventas|El total|El importe|El cliente|El medio|El pago|No hay|No alcanza|El producto|Demasiad|La cantidad|El identificador)/;
    return tvgJson({
      ok: false,
      code: (error && error.tvgCode) || "UNCERTAIN",
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
      (p.cost !== undefined &&
        (typeof p.cost !== "number" ||
          !Number.isFinite(p.cost) ||
          p.cost < 0 ||
          !Number.isSafeInteger(Math.round(p.cost * 100)) ||
          Math.round(p.cost * 100) / 100 !== p.cost)) ||
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
    ["description", "color", "size", "productType"].forEach(function (key) {
      if (
        p[key] !== undefined &&
        (typeof p[key] !== "string" ||
          p[key].length > (key === "description" ? 2000 : 80))
      )
        throw new Error(
          "Producto inválido: revisá descripción, color, talle y tipo.",
        );
    });
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
      return row.slice(0, 7).some(function (cell) {
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
        cost:
          values[0].indexOf("Costo ARS") < 0 ||
          row[values[0].indexOf("Costo ARS")] === ""
            ? undefined
            : row[values[0].indexOf("Costo ARS")],
        stock: row[5],
        active: row[6],
        image: row
          .filter(function (_, i) {
            return /^Imagen \d+$/.test(String(values[0][i]));
          })
          .join(""),
        description: String(row[values[0].indexOf("Descripcion")] || ""),
        color: String(row[values[0].indexOf("Color")] || ""),
        size: String(row[values[0].indexOf("Talle")] || ""),
        productType: String(row[values[0].indexOf("Tipo")] || ""),
      };
    });
  tvgValidate(products);
  return products;
}
function tvgText(value) {
  // Leading apostrophe prevents formulas; Sheets returns the original literal text on read.
  return /^[=+@\-\t\r']/.test(value) ? "'" + value : value;
}
function tvgWrite(sheet, products, sales) {
  if (sales === undefined) sales = tvgReadSales(sheet);
  const imageCount = Math.max(
    1,
    ...products.map(function (p) {
      return Math.ceil(p.image.length / 40000);
    }),
  );
  const columns = Math.max(7 + imageCount + 6, sheet.getLastColumn());
  const imageColumns = columns - 13;
  const headers = TVG_HEADERS.slice(0, 7);
  for (let i = 1; i <= imageColumns; i++) headers.push("Imagen " + i);
  headers.push(
    "Descripcion",
    "Color",
    "Talle",
    "Tipo",
    "Costo ARS",
    "Ventas JSON",
  );
  const rows = products.map(function (p) {
    const chunks = p.image.match(/.{1,40000}/g) || [""];
    while (chunks.length < imageColumns) chunks.push("");
    return [
      tvgText(p.id),
      tvgText(p.name),
      tvgText(p.sku),
      tvgText(p.category),
      p.price,
      p.stock,
      p.active,
    ].concat(chunks, [
      tvgText(p.description || ""),
      tvgText(p.color || ""),
      tvgText(p.size || ""),
      tvgText(p.productType || ""),
      p.cost === undefined ? "" : p.cost,
    ]);
  });
  const rowCount = Math.max(
    rows.length + 1,
    sales.length + 1,
    sheet.getLastRow(),
  );
  const data = [headers].concat(rows);
  while (data.length < rowCount) data.push([]);
  data.forEach(function (row) {
    while (row.length < columns) row.push("");
  });
  sales.forEach(function (sale, i) {
    const text = JSON.stringify(sale);
    if (text.length > 40000)
      tvgReject("La venta tiene demasiados detalles para guardarla.");
    data[i + 1][columns - 1] = text;
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

function tvgReject(message, code) {
  const error = new Error(message);
  error.tvgCode = code || "REJECTED";
  throw error;
}
function tvgReadSales(sheet) {
  const values = sheet.getDataRange().getValues();
  const index = values[0].indexOf("Ventas JSON");
  if (index < 0) return [];
  const sales = [];
  const ids = new Set();
  const sequences = new Set();
  values.slice(1).forEach(function (row) {
    if (row[index] === "" || row[index] === undefined) return;
    let sale;
    try {
      sale = JSON.parse(row[index]);
    } catch (_) {
      tvgReject(
        "Las ventas guardadas tienen un formato inválido. No edites la columna Ventas JSON.",
      );
    }
    if (
      !sale ||
      typeof sale.id !== "string" ||
      !Number.isSafeInteger(sale.sequence) ||
      sale.sequence < 1 ||
      typeof sale.number !== "string" ||
      typeof sale.requestHash !== "string" ||
      !Array.isArray(sale.items) ||
      !Number.isFinite(sale.total) ||
      ids.has(sale.id) ||
      sequences.has(sale.sequence)
    )
      tvgReject("Las ventas guardadas tienen datos inválidos o duplicados.");
    ids.add(sale.id);
    sequences.add(sale.sequence);
    sales.push(sale);
  });
  return sales;
}
function tvgSell(sheet, products, sales, body) {
  if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id))
    tvgReject("El identificador de venta es inválido.");
  if (
    !Array.isArray(body.items) ||
    body.items.length < 1 ||
    body.items.length > 50
  )
    tvgReject("La venta debe tener entre 1 y 50 productos diferentes.");
  if (
    typeof body.customer !== "string" ||
    body.customer.length > 120 ||
    typeof body.document !== "string" ||
    body.document.length > 40
  )
    tvgReject("El cliente tiene datos demasiado largos o inválidos.");
  if (
    ["Efectivo", "Transferencia", "Tarjeta", "Otro"].indexOf(
      body.paymentMethod,
    ) < 0
  )
    tvgReject("El medio de pago es inválido.");
  if (!Number.isSafeInteger(body.expectedTotal) || body.expectedTotal < 0)
    tvgReject("El total enviado es inválido.");
  const normalized = {
    items: body.items,
    customer: body.customer.trim(),
    document: body.document.trim(),
    paymentMethod: body.paymentMethod,
    cashReceived:
      body.paymentMethod === "Efectivo" ? body.cashReceived : undefined,
    expectedTotal: body.expectedTotal,
  };
  const requestHash = tvgVersion(normalized);
  const previous = sales.find(function (s) {
    return s.id === body.id;
  });
  if (previous) {
    if (previous.requestHash !== requestHash)
      tvgReject("El identificador ya pertenece a una venta con otros datos.");
    return {
      ok: true,
      schema: 4,
      products: products,
      version: tvgVersion(products),
      sales: sales.slice(-100).reverse(),
      sale: previous,
    };
  }
  if (body.version !== tvgVersion(products))
    tvgReject(
      "El catálogo cambió en otro dispositivo. Actualizá los productos y revisá el carrito antes de confirmar.",
      "CONFLICT",
    );
  const ids = new Set();
  let totalCents = 0;
  const lines = body.items.map(function (item) {
    if (
      !item ||
      typeof item.productId !== "string" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      ids.has(item.productId)
    )
      tvgReject("La cantidad o el producto de la venta es inválido.");
    ids.add(item.productId);
    const p = products.find(function (product) {
      return product.id === item.productId;
    });
    if (!p || !p.active)
      tvgReject("El producto ya no está disponible para vender.");
    if (item.quantity > p.stock)
      tvgReject(
        "No alcanza el stock de " + p.name + ". Disponibles: " + p.stock + ".",
      );
    const unitCents = Math.round(p.price * 100);
    const lineCents = unitCents * item.quantity;
    if (!Number.isSafeInteger(lineCents) || lineCents < 0)
      tvgReject("El importe de un producto supera el máximo admitido.");
    totalCents += lineCents;
    return {
      productId: p.id,
      sku: p.sku,
      name: p.name,
      variant: [p.productType, p.color, p.size ? "Talle " + p.size : ""]
        .filter(Boolean)
        .join(" · "),
      quantity: item.quantity,
      unitPrice: unitCents / 100,
      total: lineCents / 100,
    };
  });
  if (!Number.isSafeInteger(totalCents) || totalCents !== body.expectedTotal)
    tvgReject(
      "El total cambió. Revisá los precios del carrito antes de confirmar.",
      "CONFLICT",
    );
  let paid;
  let change;
  if (body.paymentMethod === "Efectivo" && body.cashReceived !== undefined) {
    paid = body.cashReceived;
    const cents = Math.round(paid * 100);
    if (
      typeof paid !== "number" ||
      !Number.isFinite(paid) ||
      !Number.isSafeInteger(cents) ||
      cents / 100 !== paid ||
      cents < totalCents
    )
      tvgReject(
        "El pago recibido debe ser igual o mayor al total, con hasta dos decimales.",
      );
    change = (cents - totalCents) / 100;
  }
  const sequence =
    sales.reduce(function (max, s) {
      return Math.max(max, s.sequence);
    }, 0) + 1;
  const sale = {
    id: body.id,
    number: "TVG-V" + String(sequence).padStart(6, "0"),
    sequence: sequence,
    createdAt: new Date().toISOString(),
    customer: normalized.customer || "Consumidor final",
    document: normalized.document,
    paymentMethod: body.paymentMethod,
    cashReceived: paid,
    change: change,
    items: lines,
    total: totalCents / 100,
    requestHash: requestHash,
    receiptType: "internal",
  };
  const next = products.map(function (p) {
    const line = lines.find(function (i) {
      return i.productId === p.id;
    });
    return line ? Object.assign({}, p, { stock: p.stock - line.quantity }) : p;
  });
  tvgWrite(sheet, next, sales.concat([sale]));
  SpreadsheetApp.flush();
  return {
    ok: true,
    schema: 4,
    products: next,
    version: tvgVersion(next),
    sales: sales.concat([sale]).slice(-100).reverse(),
    sale: sale,
  };
}
