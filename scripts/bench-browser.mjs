// Usage: node scripts/bench-browser.mjs <baseURL>
// Full-resolution render time reported by the app (worker pool) for standard views,
// on a 1280×720 canvas at devicePixelRatio 1. Median of 3 page loads per view.
import { chromium } from '@playwright/test';

const base = process.argv[2];
const views = [
  ['Mandelbrot default', '#f=mandelbrot&x=-0.6&y=0&s=2.6&it=200'],
  ['Seahorse valley 5e4x', '#f=mandelbrot&x=-0.743643887037151&y=0.13182590420533&s=0.00005&it=1252'],
  ['Mandelbrot 1e10x', '#f=mandelbrot&x=-0.743643887037151&y=0.13182590420533&s=2.6e-10&it=4000'],
  ['Julia -0.8+0.156i', '#f=julia&x=0&y=0&s=3&jr=-0.8&ji=0.156&it=200'],
  ['Burning Ship default', '#f=burningShip&x=-0.45&y=0.6&s=2.4&it=200'],
];
const b = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
for (const [name, hash] of views) {
  const times = [];
  let backend = '';
  for (let i = 0; i < 3; i++) {
    const page = await b.newPage({ viewport: { width: 1600, height: 720 }, deviceScaleFactor: 1 });
    await page.goto(base + hash);
    const status = page.getByTestId('render-status').filter({ hasText: ' ms ·' });
    await status.waitFor({ timeout: 120000 });
    const text = await status.textContent();
    backend = await page.getByTestId('backend').textContent();
    times.push(Number(text.split(' ms')[0]));
    if (!text.includes('1280×720')) throw new Error(`unexpected canvas size: ${text}`);
    await page.close();
  }
  times.sort((a, b) => a - b);
  console.log(`${name.padEnd(24)} 1280x720  median ${String(times[1]).padStart(5)} ms  (${backend})`);
}
await b.close();
