import { expect, test, type Page } from '@playwright/test';

async function pixels(page: Page): Promise<number[]> {
  return page.getByTestId('fractal-canvas').evaluate((el) => {
    const c = el as HTMLCanvasElement;
    return Array.from(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data);
  });
}

async function waitDone(page: Page, backend: RegExp) {
  await expect(page.getByTestId('backend')).toHaveText(backend, { timeout: 180_000 });
  await expect(page.getByTestId('render-status')).toContainText(' ms ·', { timeout: 180_000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  const hasAdapter = await page.evaluate(async () => !!(navigator.gpu && (await navigator.gpu.requestAdapter())));
  test.skip(!hasAdapter, 'No WebGPU adapter in this browser/environment');
});

test('WebGPU float32 preview renders and matches the CPU float64 image closely', async ({ page }) => {
  // A software adapter (SwiftShader) emulates the GPU on the CPU and is slow.
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./#f=mandelbrot&x=-0.745&y=0.11&s=0.02&it=500');
  await waitDone(page, /WebGPU float32/);
  const gpu = await pixels(page);

  await page.getByLabel('Use WebGPU (float32) for the interactive view').uncheck();
  await waitDone(page, /CPU float64/);
  const cpu = await pixels(page);

  expect(gpu.length).toBe(cpu.length);
  let differing = 0;
  for (let i = 0; i < gpu.length; i += 4) {
    const d = Math.abs(gpu[i] - cpu[i]) + Math.abs(gpu[i + 1] - cpu[i + 1]) + Math.abs(gpu[i + 2] - cpu[i + 2]);
    if (d > 24) differing++;
  }
  const fraction = differing / (gpu.length / 4);
  test.info().annotations.push({ type: 'gpu-vs-cpu', description: `${(fraction * 100).toFixed(2)}% of pixels differ visibly` });
  // float32 vs float64 differ near the set boundary, where orbits are chaotic; the rest must agree.
  expect(fraction).toBeLessThan(0.05);
  expect(errors).toEqual([]);
});

test('falls back to CPU float64 when zoomed too deep for float32', async ({ page }) => {
  await page.goto('./#f=mandelbrot&x=-0.745&y=0.11&s=0.02');
  await waitDone(page, /WebGPU float32/);
  await page.goto('./#f=mandelbrot&x=-0.745&y=0.11&s=1e-6');
  await waitDone(page, /CPU float64 .*zoom too deep for float32/);
  await page.goto('./#f=julia&x=0&y=0&s=3');
  await waitDone(page, /WebGPU float32/);
});
