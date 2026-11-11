const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const crypto = require("node:crypto");
function setup() {
  const sheet = {
    values: [],
    writes: 0,
    getRange(row, col, n, m) {
      return {
        setValues: (data) => {
          this.writes++;
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
    context,
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

module.exports = { setup };
