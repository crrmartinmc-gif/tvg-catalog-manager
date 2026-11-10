const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
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
    const page = await b.newPage();
    let products = [
        {
          id: "one",
          name: "Con costo",
          sku: "COST-1",
          category: "General",
          price: 50,
          cost: 10.25,
          stock: 3,
          active: true,
          image: "",
        },
        {
          id: "two",
          name: "Sin costo",
          sku: "COST-2",
          category: "General",
          price: 50,
          stock: 4,
          active: true,
          image: "",
        },
        {
          id: "three",
          name: "Costo cero",
          sku: "COST-3",
          category: "General",
          price: 50,
          cost: 0,
          stock: 2,
          active: true,
          image: "",
        },
      ],
      version = "1",
      schema = 3,
      writes = 0;
    const money = (n) =>
      new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        maximumFractionDigits: 2,
      }).format(n);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://script.google.com/**", (r) => {
      const body = r.request().postDataJSON();
      if (body.action === "write") {
        writes++;
        products = body.products;
        version = String(+version + 1);
      }
      return r.fulfill({
        json: {
          ok: true,
          products:
            schema === 2 ? products.map(({ cost, ...p }) => p) : products,
          version,
          schema,
        },
      });
    });
    await page.goto("http://127.0.0.1:5173/tvg-catalog-manager/");
    const total = page.locator(".cost-total strong");
    await total.getByText(money(30.75), { exact: true }).waitFor();
    await page
      .getByText("1 producto en stock sin costo cargado", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Editar Sin costo", exact: true })
      .click();
    await page
      .getByLabel("Precio de costo (ARS)", { exact: true })
      .fill("20.50");
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await total.getByText(money(112.75), { exact: true }).waitFor();
    assert.equal(products[1].cost, 20.5);
    await page.reload();
    await total.getByText(money(112.75), { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Editar Sin costo", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Precio de costo (ARS)", { exact: true })
        .inputValue(),
      "20.5",
    );
    await page.getByLabel("Stock", { exact: true }).fill("2");
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await total.getByText(money(71.75), { exact: true }).waitFor();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Exportar CSV", exact: true })
      .click();
    await (await download).saveAs("/tmp/tvg-costs.csv");
    const csv = fs.readFileSync("/tmp/tvg-costs.csv", "utf8");
    assert.ok(csv.includes("Costo unitario ARS"));
    assert.ok(csv.includes("20.5"));
    await page.getByLabel("Buscar productos").fill("Sin costo");
    await total.getByText(money(71.75), { exact: true }).waitFor();
    await page.getByLabel("Buscar productos").fill("");
    await page
      .getByRole("button", { name: "Editar Sin costo", exact: true })
      .click();
    await page.getByLabel("Precio de costo (ARS)", { exact: true }).fill("-2");
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    assert.equal(
      await page
        .getByLabel("Precio de costo (ARS)", { exact: true })
        .evaluate((el) => el.validity.valid),
      false,
    );
    await page.getByLabel("Precio de costo (ARS)", { exact: true }).fill("");
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await total.getByText(money(30.75), { exact: true }).waitFor();
    assert.equal(products[1].cost, undefined);
    page.once("dialog", (d) => d.accept());
    await page
      .getByRole("button", { name: "Eliminar Con costo", exact: true })
      .click();
    await total.getByText(money(0), { exact: true }).waitFor();
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
    }
    schema = 2;
    await page.reload();
    await page
      .getByText("Actualizá GS para guardar costos", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Editar Sin costo", exact: true })
      .click();
    await page.getByLabel("Precio de costo (ARS)", { exact: true }).fill("12");
    const before = writes;
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByText(/Para guardar precios de costo, actualizá/)
      .waitFor();
    assert.equal(writes, before);
    assert.equal(
      await page
        .getByLabel("Precio de costo (ARS)", { exact: true })
        .inputValue(),
      "12",
    );
    await page.getByLabel("Precio de costo (ARS)", { exact: true }).fill("");
    await page
      .getByRole("button", { name: "Guardar producto", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "Editar producto", exact: true })
      .waitFor({ state: "hidden" });
    assert.equal(writes, before + 1);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: unit cost edit/reload, weighted inventory total, missing vs zero, stock change, CSV, search-independent total, invalid cost, removal, mobile; old script remains readable and cannot silently drop costs.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
