import type { ColorLut } from './lut.ts';
import { LUT_SIZE } from './lut.ts';

/**
 * Maps smooth escape values to RGBA. `values[i] < 0` (INTERIOR) gets the
 * interior color. Writes `count` pixels into `out` starting at byte `outOffset`.
 */
export function colorize(
  values: Float32Array,
  count: number,
  lut: ColorLut,
  out: Uint8Array | Uint8ClampedArray,
  outOffset = 0,
  valuesOffset = 0,
): void {
  const { rgb, interior, offset } = lut;
  const inv = 1 / lut.cycleLength;
  const [ir, ig, ib] = interior;
  let o = outOffset;
  for (let i = 0; i < count; i++) {
    const v = values[valuesOffset + i];
    if (v < 0) {
      out[o] = ir;
      out[o + 1] = ig;
      out[o + 2] = ib;
    } else {
      let t = v * inv + offset;
      t -= Math.floor(t);
      let idx = (t * LUT_SIZE) | 0;
      if (idx >= LUT_SIZE) idx = LUT_SIZE - 1;
      idx *= 3;
      out[o] = rgb[idx];
      out[o + 1] = rgb[idx + 1];
      out[o + 2] = rgb[idx + 2];
    }
    out[o + 3] = 255;
    o += 4;
  }
}
