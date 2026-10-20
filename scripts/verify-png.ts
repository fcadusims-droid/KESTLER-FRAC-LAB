// Usage: node --experimental-strip-types scripts/verify-png.ts <file.png> '<url hash>' <rowStep>
// Decodes an exported PNG and compares every rowStep-th row with a direct render.
import { readFileSync } from 'node:fs';
import { decode } from 'fast-png';
import { decodeHash } from '../src/project/hash.ts';
import { fractalParams } from '../src/project/state.ts';
import { frameFromView } from '../src/core/view.ts';
import { renderTileFloat64 } from '../src/core/formulas/index.ts';
import { buildLut, colorize } from '../src/core/color/index.ts';

const [file, hash, rowStep] = process.argv.slice(2);
const t0 = Date.now();
const img = decode(readFileSync(file));
console.log('decoded', img.width, 'x', img.height, 'channels', img.channels, 'in', (Date.now() - t0) / 1000, 's');
const state = decodeHash(hash)!;
const frame = frameFromView(state.view, img.width, img.height);
const params = fractalParams(state);
const lut = buildLut(state.palette, state.color);
const W = img.width;
const vals = new Float32Array(W);
const rgba = new Uint8Array(W * 4);
const rgb = img.data as Uint8Array;
let rows = 0, mismatches = 0;
for (let y = 0; y < img.height; y += Number(rowStep)) {
  renderTileFloat64(frame, params, { x: 0, y, w: W, h: 1 }, vals);
  colorize(vals, W, lut, rgba);
  for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 3;
    if (rgb[o] !== rgba[x * 4] || rgb[o + 1] !== rgba[x * 4 + 1] || rgb[o + 2] !== rgba[x * 4 + 2]) mismatches++;
  }
  rows++;
}
console.log(JSON.stringify({ rowsChecked: rows, pixelsChecked: rows * W, mismatches }));
