const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
    args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => {
      window.cameraStreams = [];
      const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async options => {
        if (window.rejectCamera) throw new DOMException('Denied', 'NotAllowedError');
        const stream = await original(options);
        window.cameraStreams.push(stream);
        return stream;
      };
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let products = [], writes = 0;
    await page.route('https://script.google.com/**', route => {
      const body = route.request().postDataJSON();
      if (body.action === 'write') { products = body.products; writes++; }
      return route.fulfill({ json: { ok: true, products, sales: [], schema: 3, version: String(writes + 1) } });
    });
    await page.goto('http://127.0.0.1:5173/tvg-catalog-manager/');
    await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
    await page.getByLabel('Nombre', { exact: true }).fill('Producto con foto');
    await page.getByLabel('Descripción', { exact: true }).fill('Conservar estos datos');
    assert.equal(await page.locator('input[type=file]').count(), 0);
    await page.getByRole('button', { name: 'Sacar foto', exact: true }).click();
    const camera = page.getByRole('dialog', { name: 'Sacar foto del producto', exact: true });
    await camera.getByText('Cámara lista para sacar la foto.', { exact: true }).waitFor();
    await camera.getByRole('button', { name: 'Sacar foto', exact: true }).click();
    await camera.waitFor({ state: 'hidden' });
    await page.locator('.imagepreview img').waitFor();
    const image = await page.locator('.imagepreview img').getAttribute('src');
    assert.match(image, /^data:image\/jpeg;base64,/);
    assert.equal(writes, 0, 'Taking a photo must not save a product');
    assert.equal(await page.getByLabel('Descripción', { exact: true }).inputValue(), 'Conservar estos datos');
    await page.waitForFunction(() => window.cameraStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')));

    await page.setViewportSize({ width: 375, height: 667 });
    await page.getByRole('button', { name: 'Sacar foto', exact: true }).click();
    await camera.getByText('Cámara lista para sacar la foto.', { exact: true }).waitFor();
    const box = await camera.boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 375 && box.y >= 0 && box.y + box.height <= 667);
    await page.screenshot({ path: '/tmp/tvg-product-camera.png' });
    await camera.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await camera.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.imagepreview img').getAttribute('src'), image);
    await page.waitForFunction(() => window.cameraStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')));

    await page.evaluate(() => { window.rejectCamera = true; });
    await page.getByRole('button', { name: 'Sacar foto', exact: true }).click();
    await camera.getByRole('alert').filter({ hasText: 'Permití el acceso' }).waitFor();
    assert.equal(await camera.getByRole('button', { name: 'Sacar foto', exact: true }).isDisabled(), true);
    await page.evaluate(() => { window.rejectCamera = false; });
    await camera.getByRole('button', { name: 'Volver a intentar', exact: true }).click();
    await camera.getByText('Cámara lista para sacar la foto.', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await camera.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => window.cameraStreams.every(s => s.getTracks().every(t => t.readyState === 'ended')));

    await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
    await page.getByRole('heading', { name: 'Código de barras del producto' }).waitFor();
    assert.equal(writes, 1);
    assert.equal(products[0].image, image);
    assert.equal(products[0].name, 'Producto con foto');
    assert.deepEqual(errors, []);
    console.log('PASS: real camera capture with a fake device, JPEG saved only on confirmation, draft preserved, cancellation/escape release camera, denied permission and retry, mobile viewport.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
