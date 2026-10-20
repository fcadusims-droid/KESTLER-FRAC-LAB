import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { decode } from 'fast-png';
import { decodeHash } from '../src/project/hash.ts';
import { fractalParams } from '../src/project/state.ts';
import { frameFromView } from '../src/core/view.ts';
import { renderTileFloat64 } from '../src/core/formulas/index.ts';
import { buildLut, colorize } from '../src/core/color/index.ts';
import { parseProject } from '../src/project/project.ts';

const HASH = '#f=julia&x=0.05&y=-0.02&s=2.8&jr=-0.4&ji=0.6&it=300&pal=Gold&cyc=30';

async function setCustomSize(page: Page, w: number, h: number) {
  await page.getByLabel('Size', { exact: true }).selectOption({ label: 'Custom…' });
  await page.getByLabel('Export width').fill(String(w));
  await page.getByLabel('Export height').fill(String(h));
}

/** Decodes the PNG and checks every pixel against a direct render of the same state. */
function verifyPng(bytes: Uint8Array, w: number, h: number) {
  const img = decode(bytes);
  expect([img.width, img.height, img.channels, img.depth]).toEqual([w, h, 3, 8]);
  const state = decodeHash(HASH)!;
  const frame = frameFromView(state.view, w, h);
  const values = new Float32Array(w * h);
  renderTileFloat64(frame, fractalParams(state), { x: 0, y: 0, w, h }, values);
  const rgba = new Uint8Array(w * h * 4);
  colorize(values, values.length, buildLut(state.palette, state.color), rgba);
  const rgb = img.data as Uint8Array;
  let mismatches = 0;
  for (let i = 0; i < w * h; i++) {
    if (rgb[i * 3] !== rgba[i * 4] || rgb[i * 3 + 1] !== rgba[i * 4 + 1] || rgb[i * 3 + 2] !== rgba[i * 4 + 2]) mismatches++;
  }
  expect(mismatches).toBe(0);
  // The embedded project (tEXt) round-trips through the strict parser.
  const text = (img.text as Record<string, string>).FractalLab;
  expect(parseProject(text).exportSize).toEqual({ width: w, height: h });
}

test('export downloads a valid PNG when the File System Access API is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  });
  await page.goto('./' + HASH);
  await expect(page.getByTestId('render-status')).toContainText(' ms ·', { timeout: 30_000 });
  await setCustomSize(page, 257, 129);
  await expect(page.getByTestId('export-estimate')).toContainText('257×129');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export PNG' }).click();
  const d = await download;
  expect(d.suggestedFilename()).toBe('fractal-julia-257x129.png');
  await expect(page.getByTestId('export-done')).toContainText('257×129 PNG');
  verifyPng(new Uint8Array(await readFile((await d.path())!)), 257, 129);
});

test('export streams to a file handle when showSaveFilePicker exists', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __written: number[][]; __closed: boolean; showSaveFilePicker: unknown };
    w.__written = [];
    w.__closed = false;
    w.showSaveFilePicker = async () => ({
      createWritable: async () => ({
        write: async (b: Uint8Array) => {
          w.__written.push(Array.from(b));
        },
        close: async () => {
          w.__closed = true;
        },
        abort: async () => {},
      }),
    });
  });
  await page.goto('./' + HASH);
  await expect(page.getByTestId('render-status')).toContainText(' ms ·', { timeout: 30_000 });
  await setCustomSize(page, 300, 211);
  await expect(page.getByTestId('export-estimate')).toContainText('Streams straight to the file');
  await page.getByRole('button', { name: 'Export PNG…' }).click();
  await expect(page.getByTestId('export-done')).toContainText('saved to disk');
  const { chunks, closed } = await page.evaluate(() => {
    const w = window as unknown as { __written: number[][]; __closed: boolean };
    return { chunks: w.__written, closed: w.__closed };
  });
  expect(closed).toBe(true);
  expect(chunks.length).toBeGreaterThan(3);
  verifyPng(new Uint8Array(chunks.flat()), 300, 211);
});

test('invalid custom sizes are rejected, never silently changed', async ({ page }) => {
  await page.goto('./');
  await setCustomSize(page, 0, 100);
  await expect(page.getByRole('alert').filter({ hasText: 'whole numbers' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Export PNG/ })).toBeDisabled();
  await page.getByLabel('Export width').fill('12.5');
  await expect(page.getByRole('button', { name: /Export PNG/ })).toBeDisabled();
  await page.getByLabel('Export width').fill('40000');
  await expect(page.getByRole('button', { name: /Export PNG/ })).toBeDisabled();
});
