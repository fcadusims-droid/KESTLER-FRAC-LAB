import { filterRow } from './filter.ts';
import { PngStreamEncoder, type PngEncoderOptions } from './png.ts';

/**
 * Encodes an RGB(A) raster as an 8-bit RGB PNG using the same streaming encoder and
 * adaptive row filter as the fractal exporter. `rowAt(y, out)` fills one row of RGB
 * bytes, so callers can stream rows without holding the whole image.
 */
export function encodeRgbRows(
  width: number,
  height: number,
  rowAt: (y: number, out: Uint8Array) => void,
  opts: PngEncoderOptions = {},
): Uint8Array {
  const parts: Uint8Array[] = [];
  const enc = new PngStreamEncoder(width, height, (b) => parts.push(b), opts);
  let prev: Uint8Array | null = null;
  let cur = new Uint8Array(width * 3);
  let other = new Uint8Array(width * 3);
  const scratch = new Uint8Array(width * 3 * 5);
  const line = new Uint8Array(1 + width * 3);
  for (let y = 0; y < height; y++) {
    rowAt(y, cur);
    filterRow(cur, prev, line, 0, scratch);
    enc.pushFilteredRows(line, 1);
    prev = cur;
    [cur, other] = [other, cur];
  }
  enc.finish();
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Encodes an RGBA buffer (alpha ignored; composite first if needed). */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray, opts: PngEncoderOptions = {}): Uint8Array {
  return encodeRgbRows(
    width,
    height,
    (y, out) => {
      for (let x = 0, i = y * width * 4; x < width; x++, i += 4) {
        out[x * 3] = rgba[i];
        out[x * 3 + 1] = rgba[i + 1];
        out[x * 3 + 2] = rgba[i + 2];
      }
    },
    opts,
  );
}
