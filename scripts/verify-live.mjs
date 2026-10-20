// Usage: node scripts/verify-live.mjs <url> [screenshot.png]
// Loads a deployed copy in headless Chromium and checks: no console errors, workers start
// from the deployed path, the canvas renders a non-blank image, and wheel zoom changes it.
import { chromium } from '@playwright/test';

const [url, shot] = process.argv.slice(2);
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
const b = await chromium.launch({ ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}), proxy });
const page = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const workers = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
page.on('worker', (w) => workers.push(w.url()));
const resp = await page.goto(url);
const done = page.getByTestId('render-status').filter({ hasText: ' ms ·' });
await done.waitFor({ timeout: 60000 });
const fingerprint = () =>
  page.getByTestId('fractal-canvas').evaluate((c) => {
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    let h = 0;
    for (let i = 0; i < d.length; i += 4 * 97) {
      const v = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      colors.add(v);
      h = (h * 31 + v) | 0;
    }
    return { colors: colors.size, hash: h };
  });
const before = await fingerprint();
const box = await page.getByTestId('fractal-canvas').boundingBox();
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.45);
await page.mouse.wheel(0, -500);
await page.waitForTimeout(400);
await done.waitFor({ timeout: 60000 });
const after = await fingerprint();
if (shot) await page.screenshot({ path: shot });
const result = {
  url,
  httpStatus: resp?.status(),
  renderStatus: await page.getByTestId('render-status').textContent(),
  backend: await page.getByTestId('backend').textContent(),
  workers,
  distinctColorsSampled: before.colors,
  zoomChangedImage: before.hash !== after.hash,
  consoleErrors: errors,
};
console.log(JSON.stringify(result, null, 2));
await b.close();
process.exit(result.httpStatus === 200 && errors.length === 0 && workers.length > 0 && before.colors > 20 && result.zoomChangedImage ? 0 : 1);
