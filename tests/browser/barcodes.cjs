const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const browser = await chromium.launch({
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
    const page = await browser.newPage();
    let products = [],
      version = "1";
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://script.google.com/**", async (route) => {
      const body = route.request().postDataJSON();
      if (body.action === "write") {
        products = body.products;
        version = String(+version + 1);
      }
      await route.fulfill({ json: { ok: true, products, version, schema: 2 } });
    });
    await page.goto("http://127.0.0.1:5173/tvg-catalog-manager/");
    await page
      .getByRole("button", { name: "Nuevo producto", exact: true })
      .click();
    const sku = await page.getByLabel("SKU", { exact: true }).inputValue();
    assert.match(sku, /^TVG-[A-F0-9]{12}$/);
    await page
      .getByLabel("Nombre", { exact: true })
      .fill("Producto con etiqueta");
    await page.getByRole("button", { name: "Guardar producto" }).click();
    await page
      .getByRole("heading", { name: "Código de barras del producto" })
      .waitFor();
    await page
      .getByRole("img", { name: `Código de barras ${sku}`, exact: true })
      .screenshot({ path: "/tmp/tvg-barcode.png" });
    const decoded = await page.evaluate(
      async (data) => {
        const { BrowserMultiFormatReader } =
          await import("/tvg-catalog-manager/node_modules/.vite/deps/@zxing_browser.js");
        const result = await new BrowserMultiFormatReader().decodeFromImageUrl(
          data,
        );
        return result.getText();
      },
      "data:image/png;base64," +
        fs.readFileSync("/tmp/tvg-barcode.png").toString("base64"),
    );
    assert.equal(decoded, sku);
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Descargar etiqueta" }).click();
    assert.equal((await dl).suggestedFilename(), `codigo-${sku}.svg`);
    await page.emulateMedia({ media: "print" });
    assert.equal(
      await page
        .locator(".print-label")
        .evaluate((el) => getComputedStyle(el).visibility),
      "visible",
    );
    assert.equal(
      await page
        .locator("h1")
        .evaluate((el) => getComputedStyle(el).visibility),
      "hidden",
    );
    await page.emulateMedia({ media: "screen" });
    await page.getByRole("button", { name: "Cerrar etiqueta" }).click();
    await page
      .getByRole("button", {
        name: "Código de barras de Producto con etiqueta",
      })
      .click();
    await page
      .getByRole("heading", { name: "Código de barras del producto" })
      .waitFor();
    await page.getByRole("button", { name: "Cerrar etiqueta" }).click();
    await page
      .getByRole("button", { name: "Escanear producto", exact: true })
      .click();
    await page.getByLabel("Código o SKU", { exact: true }).fill("INEXISTENTE");
    await page
      .getByRole("button", { name: "Buscar producto", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByText(/No encontramos un producto/)
      .waitFor();
    await page.getByLabel("Código o SKU", { exact: true }).fill(sku);
    await page
      .getByRole("button", { name: "Buscar producto", exact: true })
      .click();
    await page.getByRole("heading", { name: "Editar producto" }).waitFor();
    assert.equal(
      await page.getByLabel("Nombre", { exact: true }).inputValue(),
      "Producto con etiqueta",
    );
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page
      .getByRole("button", { name: "Nuevo producto", exact: true })
      .click();
    await page
      .getByLabel("Nombre", { exact: true })
      .fill("Producto con código de fábrica");
    await page
      .getByLabel("Descripción", { exact: true })
      .fill("Datos que no se deben perder");
    await page.getByLabel("Color", { exact: true }).fill("Azul");
    const suggested = await page
      .getByLabel("SKU", { exact: true })
      .inputValue();
    await page
      .getByRole("button", { name: "Escanear código de barras", exact: true })
      .click();
    await page.getByRole("button", { name: "Cerrar escáner" }).click();
    assert.equal(
      await page.getByLabel("SKU", { exact: true }).inputValue(),
      suggested,
    );
    assert.equal(
      await page.getByLabel("Descripción", { exact: true }).inputValue(),
      "Datos que no se deben perder",
    );
    await page
      .getByRole("button", { name: "Escanear código de barras", exact: true })
      .click();
    await page.getByLabel("Código o SKU", { exact: true }).fill(sku);
    await page
      .getByRole("button", { name: "Usar este código", exact: true })
      .click();
    await page
      .getByText(
        "Ese código ya está asignado a otro producto. Cada producto debe tener un SKU diferente.",
      )
      .waitFor();
    await page
      .getByLabel("Código o SKU", { exact: true })
      .fill("0012345678905");
    await page
      .getByRole("button", { name: "Usar este código", exact: true })
      .click();
    assert.equal(
      await page.getByLabel("SKU", { exact: true }).inputValue(),
      "0012345678905",
    );
    assert.equal(
      await page.getByLabel("Nombre", { exact: true }).inputValue(),
      "Producto con código de fábrica",
    );
    assert.equal(
      await page.getByLabel("Descripción", { exact: true }).inputValue(),
      "Datos que no se deben perder",
    );
    assert.equal(
      await page.getByLabel("Color", { exact: true }).inputValue(),
      "Azul",
    );
    assert.equal(products.length, 1, "Capture must not save the product");
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Código de barras del producto" })
      .waitFor();
    assert.equal(products[1].sku, "0012345678905");
    assert.equal(products[1].description, "Datos que no se deben perder");
    assert.deepEqual(errors, []);
    fs.writeFileSync("/tmp/tvg-barcode-product.json", JSON.stringify(products));
    console.log(
      "PASS: automatic unique SKU, real Code128 image decoded, SVG download, print visibility, reopen label, unknown SKU, manual scan opens product; capture fills SKU, preserves draft and leading zeros, rejects duplicate, saves only on confirmation.",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
