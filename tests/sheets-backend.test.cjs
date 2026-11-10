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
  price: 123.45,
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
  assert.ok(s.sheet.values[1].slice(7).every((c) => c.length <= 40000));
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
