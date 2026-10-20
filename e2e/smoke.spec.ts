import { expect, test, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

async function waitForRender(page: Page) {
  await expect(page.getByTestId('render-status')).toContainText(' ms ·', { timeout: 30_000 });
}

/** Returns a cheap fingerprint of the canvas: distinct colors in a sample and a hash. */
async function canvasFingerprint(page: Page) {
  return page.getByTestId('fractal-canvas').evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const colors = new Set<number>();
    let hash = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      const v = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      colors.add(v);
      hash = (hash * 31 + v) | 0;
    }
    return { colors: colors.size, hash, width: c.width, height: c.height };
  });
}

test('loads under the subpath, starts workers, renders a non-blank image', async ({ page }) => {
  const errors = collectErrors(page);
  const workers: string[] = [];
  page.on('worker', (w) => workers.push(w.url()));

  await page.goto('./');
  await expect(page.getByTestId('fractal-canvas')).toBeVisible();
  await waitForRender(page);

  const fp = await canvasFingerprint(page);
  expect(fp.width).toBeGreaterThan(100);
  expect(fp.colors).toBeGreaterThan(20);
  expect(workers.length).toBeGreaterThan(0);
  expect(workers.every((u) => u.includes('/fractal-lab/'))).toBe(true);
  expect(errors).toEqual([]);
});

test('zooming changes the image and updates the URL hash', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await waitForRender(page);
  const before = await canvasFingerprint(page);
  const zoomBefore = await page.getByTestId('zoom').textContent();

  const canvas = page.getByTestId('fractal-canvas');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
  await page.mouse.wheel(0, -400);
  await expect(page.getByTestId('zoom')).not.toHaveText(zoomBefore!);
  await waitForRender(page);

  const after = await canvasFingerprint(page);
  expect(after.hash).not.toBe(before.hash);
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('s=');
  expect(errors).toEqual([]);
});

test('a shared link restores the view', async ({ page }) => {
  await page.goto('./#f=julia&x=0.1&y=-0.2&s=0.5&jr=-0.4&ji=0.6&it=500');
  await waitForRender(page);
  await expect(page.getByTestId('center-re')).toHaveText('0.1');
  await expect(page.getByLabel('Formula')).toHaveValue('julia');
  expect((await canvasFingerprint(page)).colors).toBeGreaterThan(20);
});

test('changing the palette recolors instantly without recomputing', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./');
  await waitForRender(page);
  const status = await page.getByTestId('render-status').textContent();
  const before = await canvasFingerprint(page);

  await page.getByLabel('Palette', { exact: true }).selectOption({ label: 'Ember' });
  await expect.poll(async () => (await canvasFingerprint(page)).hash).not.toBe(before.hash);
  // The render status (time of the last full render) is unchanged: no new render ran.
  await page.waitForTimeout(400);
  await expect(page.getByTestId('render-status')).toHaveText(status!);

  await page.getByLabel('Hue shift (°)', { exact: true }).fill('90');
  await page.getByLabel('Invert colors').check();
  await expect(page.getByTestId('render-status')).toHaveText(status!);
  expect(errors).toEqual([]);
});

test('keyboard zoom and reset', async ({ page }) => {
  await page.goto('./');
  await waitForRender(page);
  await page.getByTestId('fractal-canvas').focus();
  await page.keyboard.press('+');
  await expect(page.getByTestId('zoom')).toHaveText('1.5×');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('r');
  await expect(page.getByTestId('zoom')).toHaveText('1×');
});

test('gradient editor: add, edit and remove stops', async ({ page }) => {
  await page.goto('./');
  await waitForRender(page);
  const markers = page.locator('.stop-marker');
  const n = await markers.count();
  await page.getByRole('button', { name: 'Add stop' }).click();
  await expect(markers).toHaveCount(n + 1);
  await page.getByLabel('Selected stop hex color').fill('#ff0000');
  await expect(page.getByLabel('Palette', { exact: true })).toHaveValue('-1');
  await expect.poll(() => page.evaluate(() => location.hash)).toContain('ff0000');
  await page.getByRole('button', { name: 'Remove stop' }).click();
  await expect(markers).toHaveCount(n);
});
