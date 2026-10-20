// Usage: node scripts/big-export.mjs <baseURL> <width> <height> memory|stream <outFile>
// Needs a running `vite preview` and Chromium (PW_CHROMIUM_PATH or Playwright's bundled one).
// Runs a real large export in headless Chromium and records time, memory and file size.
import { chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { stat } from 'node:fs/promises';
const [base, w, h, mode, outPath] = process.argv.slice(2);
const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const ctx = await b.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
if (mode === 'memory') {
  await page.addInitScript(() => { delete window.showSaveFilePicker; });
} else {
  // Streaming path: a writer that counts bytes and discards them (like a disk write).
  await page.addInitScript(() => {
    window.__bytes = 0; window.__closed = false;
    window.showSaveFilePicker = async () => ({ createWritable: async () => ({
      write: async (b) => { window.__bytes += b.length; }, close: async () => { window.__closed = true; }, abort: async () => {} }) });
  });
}
await page.goto(base + '#f=mandelbrot&x=-0.743643887037151&y=0.13182590420533&s=0.003&it=1000&pal=Deep%20Ocean');
await page.getByTestId('render-status').filter({ hasText: ' ms ·' }).waitFor({ timeout: 60000 });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Performance.enable');
await page.getByLabel('Size', { exact: true }).selectOption({ label: 'Custom…' });
await page.getByLabel('Export width').fill(w);
await page.getByLabel('Export height').fill(h);
console.log('estimate:', (await page.getByTestId('export-estimate').innerText()).replace(/\n/g, ' | '));
let peakHeap = 0, peakRss = 0;
const rss = () => { try { return Number(execSync("ps -C chrome -o rss= | awk '{s+=$1} END {print s}'").toString()) * 1024; } catch { return 0; } };
const baseRss = rss();
const timer = setInterval(async () => {
  try {
    const m = await cdp.send('Performance.getMetrics');
    const heap = m.metrics.find((x) => x.name === 'JSHeapUsedSize')?.value ?? 0;
    peakHeap = Math.max(peakHeap, heap); peakRss = Math.max(peakRss, rss());
  } catch {}
}, 500);
const t0 = Date.now();
const dl = mode === 'memory' ? page.waitForEvent('download', { timeout: 3600_000 }) : null;
await page.getByRole('button', { name: /Export PNG/ }).click();
await page.getByTestId('export-done').waitFor({ timeout: 3600_000 });
const secs = (Date.now() - t0) / 1000;
clearInterval(timer);
console.log('done text:', await page.getByTestId('export-done').innerText());
if (dl) { const d = await dl; await d.saveAs(outPath); console.log('file bytes:', (await stat(outPath)).size); }
else console.log('streamed bytes:', await page.evaluate(() => window.__bytes), 'closed:', await page.evaluate(() => window.__closed));
console.log(JSON.stringify({ w, h, mode, wallSeconds: secs, peakMainJsHeapMB: +(peakHeap / 2**20).toFixed(1), chromeRssBeforeMB: +(baseRss / 2**20).toFixed(0), peakChromeRssMB: +(peakRss / 2**20).toFixed(0) }));
await b.close();
