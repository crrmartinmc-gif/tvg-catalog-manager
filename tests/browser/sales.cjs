const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { setup } = require("../helpers/sheets.cjs");
(async () => {
  const b = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    env: {
      ...process.env,
      XDG_CACHE_HOME: "/tmp/tvg-cache",
      XDG_CONFIG_HOME: "/tmp/tvg-config",
    },
  });
  try {
    const sheet = setup();
    const blank = sheet.request({ action: "read" });
    const fixtures = [
      {
        id: "p1",
        name: "Remera negra M",
        sku: "REM-NEG-M",
        category: "General",
        price: 125.5,
        cost: 70,
        stock: 5,
        active: true,
        image: "",
      },
      {
        id: "p2",
        name: "Bombacha azul",
        sku: "BOM-AZ",
        category: "General",
        price: 80,
        cost: 40,
        stock: 3,
        active: true,
        image: "",
      },
      {
        id: "p3",
        name: "Sin stock",
        sku: "EMPTY",
        category: "General",
        price: 20,
        stock: 0,
        active: true,
        image: "",
      },
    ];
    sheet.request({
      action: "write",
      version: blank.version,
      products: fixtures,
    });
    const p = await b.newPage();
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    let loseConfirmation = false;
    const submitted = [];
    await p.route("https://script.google.com/**", async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === "sale") submitted.push(body);
      const result = sheet.request(body);
      if (body.action === "sale" && loseConfirmation) {
        loseConfirmation = false;
        return route.abort("failed");
      }
      return route.fulfill({ json: result });
    });
    await p.goto("http://127.0.0.1:5173/tvg-catalog-manager/");
    await p
      .getByRole("button", { name: "Nuevo producto", exact: true })
      .waitFor();
    await p.getByRole("button", { name: "Vender", exact: true }).click();
    await p.getByRole("heading", { name: "Vender", exact: true }).waitFor();
    assert.equal(
      await p
        .getByRole("button", { name: "Agregar Sin stock", exact: true })
        .count(),
      0,
    );
    await p
      .getByRole("button", { name: "Agregar Remera negra M", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Sumar Remera negra M", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Agregar Bombacha azul", exact: true })
      .click();
    await p.getByLabel("Cliente (opcional)", { exact: true }).fill("María");
    await p
      .getByLabel("DNI / documento (opcional)", { exact: true })
      .fill("12345678");
    await p
      .getByLabel("Efectivo recibido (ARS, opcional)", { exact: true })
      .fill("400");
    await p.getByText(/Vuelto:.*69,00/).waitFor();
    await p
      .getByRole("button", {
        name: "Confirmar venta y emitir comprobante",
        exact: true,
      })
      .click();
    await p
      .getByRole("dialog")
      .getByText("TVG-V000001", { exact: true })
      .waitFor();
    assert.equal(sheet.request({ action: "read" }).products[0].stock, 3);
    assert.equal(sheet.request({ action: "read" }).products[1].stock, 2);
    assert.equal(sheet.request({ action: "read" }).sales.length, 1);
    await p
      .getByRole("dialog")
      .getByText("Documento interno · No válido como factura fiscal", {
        exact: true,
      })
      .waitFor();
    await p.emulateMedia({ media: "print" });
    assert.equal(
      await p
        .locator(".receipt-print")
        .evaluate((e) => getComputedStyle(e).visibility),
      "visible",
    );
    assert.equal(
      await p
        .locator(".receipt-toolbar")
        .evaluate((e) => getComputedStyle(e).display),
      "none",
    );
    await p.emulateMedia({ media: "screen" });
    await p.getByRole("button", { name: "Cerrar comprobante" }).click();
    assert.equal(
      await p.evaluate(() => localStorage.getItem("tvg.sale.pending.v1")),
      null,
    );
    await p.reload();
    await p.getByRole("button", { name: "Vender", exact: true }).click();
    await p
      .getByRole("button", { name: "Ver comprobante TVG-V000001" })
      .click();
    await p.getByRole("dialog").getByText("María", { exact: true }).waitFor();
    await p.getByRole("button", { name: "Cerrar comprobante" }).click();
    await p
      .getByRole("button", { name: "Agregar Remera negra M", exact: true })
      .click();
    loseConfirmation = true;
    await p
      .getByRole("button", {
        name: "Confirmar venta y emitir comprobante",
        exact: true,
      })
      .click();
    await p
      .getByRole("button", { name: "Reintentar confirmación", exact: true })
      .waitFor();
    const pending = JSON.parse(
      await p.evaluate(() => localStorage.getItem("tvg.sale.pending.v1")),
    );
    assert.ok(pending.request.id);
    assert.equal(sheet.request({ action: "read" }).sales.length, 2);
    const stockBeforeRetry = sheet.request({ action: "read" }).products[0]
      .stock;
    await p.reload();
    await p.getByRole("heading", { name: "Vender", exact: true }).waitFor();
    await p
      .getByRole("button", { name: "Reintentar confirmación", exact: true })
      .click();
    await p
      .getByRole("dialog")
      .getByText("TVG-V000002", { exact: true })
      .waitFor();
    assert.equal(submitted.at(-1).id, pending.request.id);
    assert.equal(sheet.request({ action: "read" }).sales.length, 2);
    assert.equal(
      sheet.request({ action: "read" }).products[0].stock,
      stockBeforeRetry,
    );
    await p.getByRole("button", { name: "Cerrar comprobante" }).click();
    await p
      .getByRole("button", { name: "Escanear para vender", exact: true })
      .click();
    await p.getByLabel("Código o SKU", { exact: true }).fill("BOM-AZ");
    await p
      .getByRole("button", { name: "Agregar al carrito", exact: true })
      .click();
    assert.equal(
      await p
        .getByLabel("Cantidad de Bombacha azul", { exact: true })
        .inputValue(),
      "1",
    );
    await p.getByLabel("Cantidad de Bombacha azul", { exact: true }).fill("99");
    await p
      .getByRole("alert")
      .getByText(/La cantidad debe ser un entero/)
      .waitFor();
    await p
      .getByRole("button", { name: "Quitar Bombacha azul", exact: true })
      .click();
    await p
      .getByRole("button", { name: "Agregar Remera negra M", exact: true })
      .click();
    const external = sheet.request({ action: "read" });
    sheet.request({
      action: "write",
      version: external.version,
      products: external.products.map((x) =>
        x.id === "p1" ? { ...x, price: 130 } : x,
      ),
    });
    await p
      .getByRole("button", {
        name: "Confirmar venta y emitir comprobante",
        exact: true,
      })
      .click();
    await p
      .getByRole("alert")
      .getByText(/El catálogo cambió en otro dispositivo/)
      .waitFor();
    assert.equal(
      await p.evaluate(() => localStorage.getItem("tvg.sale.pending.v1")),
      null,
    );
    assert.equal(sheet.request({ action: "read" }).sales.length, 2);
    await p
      .getByRole("button", { name: "Actualizar catálogo", exact: true })
      .click();
    await p.getByText(/130,00 c\/u/).waitFor();
    await p
      .getByLabel("Efectivo recibido (ARS, opcional)", { exact: true })
      .fill("1");
    const beforeRejected = submitted.length;
    await p
      .getByRole("button", {
        name: "Confirmar venta y emitir comprobante",
        exact: true,
      })
      .click();
    await p
      .getByRole("alert")
      .getByText(/El efectivo recibido debe cubrir/)
      .waitFor();
    assert.equal(submitted.length, beforeRejected);
    await p
      .getByLabel("Efectivo recibido (ARS, opcional)", { exact: true })
      .fill("200");
    await p
      .getByRole("button", {
        name: "Confirmar venta y emitir comprobante",
        exact: true,
      })
      .click();
    await p
      .getByRole("dialog")
      .getByText("TVG-V000003", { exact: true })
      .waitFor();
    assert.equal(sheet.request({ action: "read" }).sales.length, 3);
    await p.getByRole("button", { name: "Cerrar comprobante" }).click();
    await p
      .getByRole("button", { name: "Agregar Bombacha azul", exact: true })
      .click();
    await p.evaluate(() => {
      window.originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "tvg.sale.pending.v1") throw Error("storage denied");
        return window.originalSetItem.call(this, key, value);
      };
    });
    const beforeDenied = submitted.length;
    await p
      .getByRole("button", {
        name: "Confirmar venta y emitir comprobante",
        exact: true,
      })
      .click();
    await p
      .getByRole("alert")
      .getByText(/El navegador no permite conservar/)
      .waitFor();
    assert.equal(submitted.length, beforeDenied);
    await p.evaluate(() => {
      Storage.prototype.setItem = window.originalSetItem;
    });
    await p
      .getByRole("button", { name: "Quitar Bombacha azul", exact: true })
      .click();
    for (const width of [1440, 390, 320]) {
      await p.setViewportSize({ width, height: 900 });
      assert.ok(
        await p.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await p.screenshot({
        path: `/tmp/tvg-sales-${width}.png`,
        fullPage: true,
      });
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS: cart, quantities, cash change, sale+stock, printable internal receipt, reload/reprint, lost-confirmation recovery after reload without duplication, barcode entry, stale-price conflict, insufficient cash, unavailable local storage, mobile navigation and layout.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
