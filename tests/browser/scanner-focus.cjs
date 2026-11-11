const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  try {
    for (const mode of ['supported', 'unsupported', 'rejected']) {
      const context = await browser.newContext();
      await context.addInitScript(mode => {
        window.focusCalls = [];
        window.streams = [];
        const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = async options => {
          window.requestedVideo = options.video;
          const stream = await original(options);
          window.streams.push(stream);
          const track = stream.getVideoTracks()[0];
          track.getCapabilities = () => mode === 'unsupported' ? {} : { focusMode: ['continuous', 'single-shot'] };
          track.applyConstraints = async constraints => {
            window.focusCalls.push(constraints.advanced[0].focusMode);
            if (mode === 'rejected') throw new DOMException('Unsupported', 'OverconstrainedError');
          };
          return stream;
        };
      }, mode);
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://script.google.com/**', route => route.fulfill({ json: { ok: true, products: [], sales: [], schema: 3, version: '1' } }));
      await page.goto('http://127.0.0.1:5173/tvg-catalog-manager/');
      await page.getByRole('button', { name: 'Escanear producto', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Cámara lista.' }).waitFor();
      assert.equal(await page.evaluate(() => window.requestedVideo.width.ideal), 1920);
      const focus = page.getByRole('button', { name: 'Reenfocar código' });
      if (mode === 'unsupported') assert.equal(await focus.count(), 0);
      else {
        assert.deepEqual(await page.evaluate(() => window.focusCalls), ['continuous']);
        await focus.click();
        await page.waitForFunction(() => window.focusCalls.length === 3);
        assert.deepEqual(await page.evaluate(() => window.focusCalls), ['continuous', 'single-shot', 'continuous']);
      }
      await page.getByRole('button', { name: 'Volver a intentar cámara' }).click();
      await page.waitForFunction(() => window.streams.length === 2);
      await page.getByRole('status').filter({ hasText: 'Cámara lista.' }).waitFor();
      assert.equal(await page.evaluate(() => window.streams[0].getTracks().every(t => t.readyState === 'ended')), true);
      await page.getByRole('button', { name: 'Cerrar escáner' }).click();
      await page.waitForFunction(() => window.streams.every(s => s.getTracks().every(t => t.readyState === 'ended')));
      assert.deepEqual(errors, []);
      await context.close();
      console.log(`PASS: scanner autofocus ${mode}, retry and camera cleanup`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
