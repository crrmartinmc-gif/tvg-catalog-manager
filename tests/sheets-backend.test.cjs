const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const crypto = require("node:crypto");
function setup() {
  const sheet = {
    values: [],
    getRange(row, col, n, m) {
      return {
        setValues: (data) => {
          assert.equal(data.length, n);
          for (let r = 0; r < n; r++) {
            assert.equal(data[r].length, m);
            this.values[row + r - 1] ||= [];
            for (let c = 0; c < m; c++) {
              let v = data[r][c];
              if (typeof v === "string" && v.startsWith("'")) v = v.slice(1);
              this.values[row + r - 1][col + c - 1] = v;
            }
          }
        },
      };
    },
    setFrozenRows() {},
    getLastColumn() {
      return Math.max(0, ...this.values.map((r) => r.length));
    },
    getLastRow() {
      return this.values.length;
    },
    getMaxColumns() {
      return 26;
    },
    getMaxRows() {
      return 1000;
    },
    insertColumnsAfter() {},
    insertRowsAfter() {},
    getDataRange() {
      return { getValues: () => this.values.map((r) => [...r]) };
    },
  };
  let created = false;
  const context = {
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        hasLock: () => true,
        releaseLock() {},
      }),
    },
    SpreadsheetApp: {
      openById: (id) => {
        assert.equal(id, "1JwcHRNFWoUCCq1ywVQQL9_qnZTZtykHDgzio8S9NxKM");
        return {
          getSheetByName: () => (created ? sheet : null),
          insertSheet: (name) => {
            assert.equal(name, "TVG_Catalogo");
            created = true;
            return sheet;
          },
        };
      },
      flush() {},
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: "sha256" },
      computeDigest: (_, s) =>
        Array.from(crypto.createHash("sha256").update(s).digest()),
      base64EncodeWebSafe: (a) => Buffer.from(a).toString("base64url"),
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (s) => ({ setMimeType: () => s }),
    },
  };
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync("integrations/google-sheets/Code.gs", "utf8"),
    context,
  );
  return {
    sheet,
    request: (body) =>
      JSON.parse(
        context.doPost({
          postData: {
            contents: JSON.stringify({
              ...body,
            }),
          },
        }),
      ),
  };
}
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
  assert.equal(old.schema, 3);
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
  assert.equal(saved.schema, 3);
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
