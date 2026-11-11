const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const b = await chromium.launchPersistentContext(
    require("node:fs").mkdtempSync(
      require("node:path").join(require("node:os").tmpdir(), "tvg-install-"),
    ),
    {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (require("node:fs").existsSync("/usr/bin/chromium")
          ? "/usr/bin/chromium"
          : undefined),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
      env: {
        ...process.env,
        XDG_CACHE_HOME: "/tmp/tvg-cache",
        XDG_CONFIG_HOME: "/tmp/tvg-config",
      },
    },
  );
  try {
    const p = await b.newPage();
    await p.clock.install();
    let reads = 0;
    await p.route("https://script.google.com/**", (r) => {
      reads++;
      return r.fulfill({
        json: { ok: true, products: [], version: "1", schema: 2 },
      });
    });
    await p.goto("http://127.0.0.1:5173/tvg-catalog-manager/");
    await p.waitForFunction(() =>
      [...document.querySelectorAll("button")].some(
        (b) => b.textContent.trim() === "Nuevo producto" && !b.disabled,
      ),
    );
    const baseline = reads;
    await p.clock.fastForward(59000);
    assert.equal(reads, baseline);
    const refresh = p.waitForResponse((r) =>
      r.url().includes("script.google.com"),
    );
    await p.clock.fastForward(1100);
    await refresh;
    assert.equal(reads, baseline + 1);
    const cdp = await p.context().newCDPSession(p);
    const manifest = await cdp.send("Page.getAppManifest");
    console.log(
      "Manifest:",
      JSON.stringify({
        url: manifest.url,
        errors: manifest.errors,
        hasData: !!manifest.data,
      }),
    );
    const m = JSON.parse(manifest.data);
    assert.equal(m.short_name, "TVG");
    const icon = await p.request.get(
      new URL(m.icons[0].src, manifest.url).href,
    );
    assert.equal(icon.status(), 200);
    assert.match(icon.headers()["content-type"], /image\/png/);
    assert.ok(await p.locator('link[rel="apple-touch-icon"]').count());
    const eligibility = await cdp.send("Page.getInstallabilityErrors");
    assert.deepEqual(eligibility.installabilityErrors, []);
    console.log("Installability: no errors");
    console.log(
      "PASS: no periodic refresh at 59 seconds, refresh at 60 seconds; valid manifest and PNG icon; Apple home-screen icon linked.",
    );
  } finally {
    await b.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
