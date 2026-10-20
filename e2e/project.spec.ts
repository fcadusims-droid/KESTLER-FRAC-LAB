import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseProject } from '../src/project/project.ts';

async function ready(page: Page) {
  await expect(page.getByTestId('render-status')).toContainText(' ms ·', { timeout: 30_000 });
}

async function openSection(page: Page) {
  await page.getByText('Project & presets').click();
}

test('save a project file, then reject malformed and unsupported files with a message', async ({ page }) => {
  await page.goto('./#f=burningShip&x=-1.75&y=-0.03&s=0.1&it=600');
  await ready(page);
  await openSection(page);
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save project (.json)' }).click();
  const file = await (await dl).path();
  const saved = parseProject(await readFile(file!, 'utf8'));
  expect(saved.formula).toBe('burningShip');
  expect(saved.view).toEqual({ cx: -1.75, cy: -0.03, span: 0.1 });
  expect(saved.iterations).toEqual({ mode: 'fixed', value: 600 });

  const input = page.getByTestId('project-file');
  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"version": 1, "app": "fractal-lab", "formula": "x"}') });
  await expect(page.getByTestId('project-message')).toContainText('Could not open bad.json');
  await input.setInputFiles({ name: 'future.json', mimeType: 'application/json', buffer: Buffer.from('{"version": 7}') });
  await expect(page.getByTestId('project-message')).toContainText('Unsupported project version 7');
  await expect(page.getByLabel('Formula')).toHaveValue('burningShip');
});

test('open a project file applies it', async ({ page }) => {
  await page.goto('./');
  await ready(page);
  await openSection(page);
  const s = parseProject(JSON.stringify({ version: 1, app: 'fractal-lab', formula: 'julia', julia: { re: 0.285, im: 0.01 }, view: { cx: 0, cy: 0, span: 2.5 }, iterations: { mode: 'auto' }, escapeRadius: 256, palette: { name: 'Mine', stops: [{ pos: 0, color: '#000000' }, { pos: 0.5, color: '#ffcc00' }] }, color: { offset: 0, cycleLength: 30, gamma: 1, brightness: 0, contrast: 1, hueShift: 0, saturation: 1, invert: false, interior: '#000000' }, exportSize: { width: 1000, height: 1000 } }));
  await page.getByTestId('project-file').setInputFiles({ name: 'p.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, app: 'fractal-lab', ...s })) });
  await expect(page.getByTestId('project-message')).toContainText('Loaded p.json');
  await expect(page.getByLabel('Formula')).toHaveValue('julia');
  await expect(page.getByLabel('c real')).toHaveValue('0.285');
  await expect(page.getByLabel('Export width')).toHaveValue('1000');
  await ready(page);
});

test('presets and auto-saved session persist across reloads (localStorage)', async ({ page }) => {
  await page.goto('./#f=julia&x=0&y=0&s=3&jr=-0.4&ji=0.6');
  await ready(page);
  await openSection(page);
  await page.getByLabel('Save current view as preset').fill('Rabbit');
  await page.getByRole('button', { name: 'Save preset' }).click();
  await expect(page.getByRole('button', { name: 'Load preset Rabbit' })).toBeVisible();

  await page.getByLabel('Formula').selectOption('mandelbrot');
  await page.waitForTimeout(1300); // autosave debounce
  await page.goto('about:blank');
  await page.goto('./'); // no hash → last session
  await ready(page);
  await expect(page.getByLabel('Formula')).toHaveValue('mandelbrot');

  await openSection(page);
  await page.getByRole('button', { name: 'Load preset Rabbit' }).click();
  await expect(page.getByLabel('Formula')).toHaveValue('julia');
  await expect(page.getByLabel('c imag')).toHaveValue('0.6');
  await page.getByRole('button', { name: 'Delete preset Rabbit' }).click();
  await expect(page.getByRole('button', { name: 'Load preset Rabbit' })).toHaveCount(0);
});
