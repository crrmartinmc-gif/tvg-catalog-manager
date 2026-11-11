const test = require("node:test");
const assert = require("node:assert/strict");
const { setup } = require("./helpers/sheets.cjs");
const product = {
  id: "id-1",
  name: "=SUM(1,2)",
  sku: "001",
  category: "General",
  description: "Algodón, manga corta\nLavado suave",
  color: "Negro",
  size: "M",
  productType: "Remera",
  price: 123.45,
  cost: 75.25,
  stock: 4,
  active: true,
  image: "data:image/png;base64," + "A".repeat(90000),
};
test("read and write without a password", () => {
  const s = setup();
  const first = s.request({ action: "read" });
  assert.equal(first.ok, true);
  assert.equal(
    s.request({ action: "write", version: first.version, products: [product] })
      .ok,
    true,
  );
});
test("round trip, image chunks, leading formulas, conflicts and deletion", () => {
  const s = setup();
  const first = s.request({ action: "read" });
  assert.deepEqual(first.products, []);
  const written = s.request({
    action: "write",
    version: first.version,
    products: [product],
  });
  assert.equal(written.ok, true);
  assert.deepEqual(written.products, [product]);
  assert.notEqual(written.version, first.version);
  assert.ok(
    s.sheet.values[1]
      .filter((_, i) => /^Imagen \d+$/.test(s.sheet.values[0][i]))
      .every((c) => c.length <= 40000),
  );
  assert.equal(
    s.request({ action: "write", version: first.version, products: [] }).ok,
    false,
  );
  assert.equal(s.request({ action: "read" }).products.length, 1);
  const deleted = s.request({
    action: "write",
    version: written.version,
    products: [],
  });
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.products, []);
});
test("reject duplicate SKU and invalid stock without altering existing catalog", () => {
  const s = setup();
  const { version } = s.request({ action: "read" });
  assert.equal(
    s.request({
      action: "write",
      version,
      products: [product, { ...product, id: "id-2" }],
    }).ok,
    false,
  );
  assert.equal(
    s.request({
      action: "write",
      version,
      products: [{ ...product, stock: -1 }],
    }).ok,
    false,
  );
  assert.deepEqual(s.request({ action: "read" }).products, []);
});
test("manual edit changes version and prevents stale overwrite", () => {
  const s = setup();
  const empty = s.request({ action: "read" });
  const old = s.request({
    action: "write",
    version: empty.version,
    products: [product],
  });
  s.sheet.values[1][5] = 20;
  assert.equal(
    s.request({ action: "write", version: old.version, products: [] }).ok,
    false,
  );
  assert.equal(s.request({ action: "read" }).products[0].stock, 20);
});
test("preserve a tab with an incompatible header", () => {
  const s = setup();
  s.request({ action: "read" });
  s.sheet.values[0][0] = "Existing business data";
  const original = JSON.stringify(s.sheet.values);
  assert.equal(s.request({ action: "read" }).ok, false);
  assert.equal(JSON.stringify(s.sheet.values), original);
});

test("migrate legacy rows without losing image, price or stock", () => {
  const s = setup();
  s.request({ action: "read" });
  s.sheet.values.push([
    "legacy",
    "Anterior",
    "OLD-1",
    "General",
    20,
    3,
    true,
    "data:image/png;base64,AAAA",
  ]);
  const old = s.request({ action: "read" });
  assert.equal(old.ok, true);
  assert.equal(old.schema, 4);
  assert.equal(old.products[0].color, "");
  assert.equal(old.products[0].description, "");
  const updated = {
    ...old.products[0],
    color: "Azul",
    size: "42",
    description: "Nueva descripción",
    productType: "Pantalón",
  };
  const saved = s.request({
    action: "write",
    version: old.version,
    products: [updated],
  });
  assert.deepEqual(saved.products, [updated]);
  assert.equal(saved.products[0].image, "data:image/png;base64,AAAA");
  assert.ok(s.sheet.values[0].includes("Descripcion"));
  assert.ok(s.sheet.values[0].includes("Color"));
});
test("reject oversized or non-text attributes without altering data", () => {
  const s = setup();
  const { version } = s.request({ action: "read" });
  for (const attrs of [
    { color: 12 },
    { description: "x".repeat(2001) },
    { size: "x".repeat(81) },
  ]) {
    assert.equal(
      s.request({
        action: "write",
        version,
        products: [{ ...product, ...attrs }],
      }).ok,
      false,
    );
  }
  assert.deepEqual(s.request({ action: "read" }).products, []);
});

test("cost migration, zero and decimals persist, blank remains unknown", () => {
  const s = setup();
  const first = s.request({ action: "read" });
  const noCost = { ...product, id: "no-cost", sku: "NO-COST" };
  delete noCost.cost;
  const products = [
    noCost,
    { ...product, id: "zero", sku: "ZERO", cost: 0 },
    { ...product, id: "paid", sku: "PAID", cost: 80.35 },
  ];
  const saved = s.request({
    action: "write",
    version: first.version,
    products,
  });
  assert.equal(saved.ok, true);
  assert.equal(saved.schema, 4);
  assert.equal(saved.products[0].cost, undefined);
  assert.equal(saved.products[1].cost, 0);
  assert.equal(saved.products[2].cost, 80.35);
  const loaded = s.request({ action: "read" });
  assert.deepEqual(loaded.products, saved.products);
  for (const cost of [-1, 0.001, "12", null, Number.MAX_VALUE])
    assert.equal(
      s.request({
        action: "write",
        version: loaded.version,
        products: [{ ...product, cost }],
      }).ok,
      false,
    );
  assert.deepEqual(s.request({ action: "read" }).products, loaded.products);
});

test("schema 2 migration preserves descriptions, attributes and all image chunks", () => {
  const s = setup();
  s.request({ action: "read" });
  const chunks = product.image.match(/.{1,40000}/g);
  s.sheet.values = [
    [
      "ID",
      "Nombre",
      "SKU",
      "Categoria",
      "Precio ARS",
      "Stock",
      "Activo",
      ...chunks.map((_, i) => "Imagen " + (i + 1)),
      "Descripcion",
      "Color",
      "Talle",
      "Tipo",
    ],
    [
      product.id,
      product.name,
      product.sku,
      product.category,
      product.price,
      product.stock,
      product.active,
      ...chunks,
      product.description,
      product.color,
      product.size,
      product.productType,
    ],
  ];
  const old = s.request({ action: "read" });
  assert.equal(old.ok, true);
  assert.equal(old.products[0].cost, undefined);
  const migrated = s.request({
    action: "write",
    version: old.version,
    products: [{ ...old.products[0], cost: 37.25 }],
  });
  assert.equal(migrated.ok, true);
  assert.equal(migrated.products[0].cost, 37.25);
  for (const key of [
    "image",
    "description",
    "color",
    "size",
    "productType",
    "price",
    "stock",
  ])
    assert.equal(migrated.products[0][key], product[key]);
});

function seededSale() {
  const s = setup();
  const { version } = s.request({ action: "read" });
  const loaded = s.request({
    action: "write",
    version,
    products: [
      { ...product, image: "", stock: 10 },
      {
        ...product,
        id: "id-2",
        sku: "002",
        name: "Segundo",
        price: 20,
        cost: 5,
        image: "",
        stock: 4,
      },
    ],
  });
  const request = {
    action: "sale",
    id: "00000000-0000-4000-8000-000000000001",
    version: loaded.version,
    items: [
      { productId: product.id, quantity: 2 },
      { productId: "id-2", quantity: 1 },
    ],
    customer: "Cliente de prueba",
    document: "12345678",
    paymentMethod: "Efectivo",
    cashReceived: 300,
    expectedTotal: 26690,
  };
  return { s, request, loaded };
}
test("sale commits stock and receipt together, calculates totals and change", () => {
  const { s, request } = seededSale();
  const writes = s.sheet.writes;
  const saved = s.request(request);
  assert.equal(saved.ok, true);
  assert.equal(saved.schema, 4);
  assert.equal(s.sheet.writes, writes + 1);
  assert.equal(saved.sale.total, 266.9);
  assert.equal(saved.sale.change, 33.1);
  assert.equal(saved.sale.number, "TVG-V000001");
  assert.equal(saved.sale.receiptType, "internal");
  assert.equal(saved.sale.items[0].unitPrice, 123.45);
  assert.deepEqual(
    saved.products.map((p) => p.stock),
    [8, 3],
  );
  const reloaded = s.request({ action: "read" });
  assert.equal(reloaded.sales.length, 1);
  assert.deepEqual(reloaded.sales[0], saved.sale);
  assert.deepEqual(reloaded.products, saved.products);
});
test("retry of same sale never deducts stock or issues a receipt twice", () => {
  const { s, request } = seededSale();
  const saved = s.request(request);
  const writes = s.sheet.writes;
  const replay = s.request(request);
  assert.equal(replay.ok, true);
  assert.equal(s.sheet.writes, writes);
  assert.deepEqual(replay.sale, saved.sale);
  assert.deepEqual(replay.products, saved.products);
  assert.equal(replay.sales.length, 1);
  const changed = s.request({ ...request, customer: "Otra persona" });
  assert.equal(changed.ok, false);
  assert.equal(changed.code, "REJECTED");
  assert.equal(s.sheet.writes, writes);
});
test("rejected sales preserve stock, ledger and numbering", () => {
  const { s, request, loaded } = seededSale();
  const writes = s.sheet.writes;
  const invalid = [
    { version: "stale" },
    { items: [{ productId: product.id, quantity: 11 }] },
    { items: [{ productId: product.id, quantity: 0 }] },
    { items: [{ productId: product.id, quantity: 1.5 }] },
    {
      items: [
        { productId: product.id, quantity: 1 },
        { productId: product.id, quantity: 1 },
      ],
    },
    { expectedTotal: 1 },
    { cashReceived: 1 },
    { paymentMethod: "Unknown" },
    { customer: "x".repeat(121) },
  ];
  for (const change of invalid) {
    const result = s.request({ ...request, ...change });
    assert.equal(result.ok, false, JSON.stringify(change));
    assert.ok(["REJECTED", "CONFLICT"].includes(result.code));
    assert.equal(s.sheet.writes, writes);
  }
  const current = s.request({ action: "read" });
  assert.deepEqual(current.products, loaded.products);
  assert.deepEqual(current.sales, []);
  assert.equal(s.request(request).sale.sequence, 1);
});
test("catalog updates and deletion preserve sales after all product rows are removed", () => {
  const { s, request } = seededSale();
  const first = s.request(request);
  const second = s.request({
    ...request,
    id: "00000000-0000-4000-8000-000000000002",
    version: first.version,
  });
  assert.equal(second.ok, true);
  assert.equal(second.sale.sequence, 2);
  const deleted = s.request({
    action: "write",
    version: second.version,
    products: [],
  });
  assert.equal(deleted.ok, true);
  assert.deepEqual(deleted.products, []);
  assert.equal(deleted.sales.length, 2);
  const reloaded = s.request({ action: "read" });
  assert.equal(reloaded.ok, true);
  assert.deepEqual(reloaded.products, []);
  assert.deepEqual(reloaded.sales, second.sales);
  const added = s.request({
    action: "write",
    version: reloaded.version,
    products: [{ ...product, price: 999, image: "" }],
  });
  assert.equal(added.ok, true);
  assert.deepEqual(added.sales, second.sales);
  assert.equal(added.sales[0].items[0].unitPrice, 123.45);
});
test("lost confirmation after commit is recovered by ID without a second write", () => {
  const { s, request } = seededSale();
  s.context.SpreadsheetApp.flush = () => {
    throw Error("simulated response failure after range write");
  };
  const unknown = s.request(request);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, "UNCERTAIN");
  const writes = s.sheet.writes;
  const replay = s.request(request);
  assert.equal(replay.ok, true);
  assert.equal(s.sheet.writes, writes);
  assert.equal(replay.sales.length, 1);
  assert.equal(replay.products[0].stock, 8);
});
test("inactive and missing products cannot be sold", () => {
  const { s, request, loaded } = seededSale();
  const updated = s.request({
    action: "write",
    version: loaded.version,
    products: loaded.products.map((p) => ({ ...p, active: false })),
  });
  for (const productId of [product.id, "missing"]) {
    const result = s.request({
      ...request,
      version: updated.version,
      items: [{ productId, quantity: 1 }],
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "REJECTED");
  }
  assert.deepEqual(s.request({ action: "read" }).sales, []);
});
