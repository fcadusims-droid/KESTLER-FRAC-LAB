// Composes the small committed comparison sheet from an existing run's PNGs (no re-rendering).
// Usage: node --experimental-strip-types scripts/final-sheet.ts <runDir> <out.png> [variants]
import { readFileSync, writeFileSync } from 'node:fs';
import { decode } from 'fast-png';
import { comparisonSheet, Canvas } from '../src/studio/sheet.ts';
import { encodeRgbaPng } from '../src/export/encodeImage.ts';
import type { RgbaImage } from '../src/studio/types.ts';

const [runDir, out, list = 'grid16,grid16two,adaptive'] = process.argv.slice(2);
const crops: Record<string, { x: number; y: number }> = { apple: { x: 384, y: 176 }, star: { x: 424, y: 208 } };

function load(path: string): RgbaImage {
  const img = decode(readFileSync(path));
  const n = img.width * img.height;
  const data = new Uint8ClampedArray(n * 4);
  const src = img.data as Uint8Array;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) data[i * 4 + k] = src[i * img.channels + k];
    data[i * 4 + 3] = 255;
  }
  return { width: img.width, height: img.height, data };
}

const sheets = Object.entries(crops).map(([t, crop]) =>
  comparisonSheet(
    [{ label: 'TARGET', image: load(`${runDir}/${t}-target.png`) }, ...list.split(',').map((v) => ({ label: v, image: load(`${runDir}/${t}-${v}.png`) }))],
    { ...crop, size: 48 },
    192,
    48,
  ),
);
const cv = new Canvas(Math.max(...sheets.map((s) => s.width)), sheets.reduce((h, s) => h + s.height, 0));
let y = 0;
for (const s of sheets) {
  cv.blit(s, 0, y, s.width, s.height);
  y += s.height;
}
writeFileSync(out, encodeRgbaPng(cv.width, cv.height, cv.data));
console.log(`wrote ${out} (${cv.width}×${cv.height})`);
