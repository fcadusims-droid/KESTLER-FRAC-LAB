import type { FractalParams, Rect } from '../core/formulas/types.ts';
import type { Frame } from '../core/view.ts';
import type { ColorLut } from '../core/color/lut.ts';
import { colorize } from '../core/color/colorize.ts';
import { renderTileFloat64 } from '../core/formulas/tile.ts';
import { filterRow } from './filter.ts';

/**
 * Renders rows [rect.y, rect.y + rect.h) of a full-width band, colors them and
 * returns PNG-filtered RGB scanlines (each 1 + 3W bytes). The row above the
 * band is recomputed (from the same global pixel indices, so identical) to
 * serve as the filter's previous row. No full-image buffer is ever needed.
 */
export function renderFilteredBand(frame: Frame, params: FractalParams, lut: ColorLut, rect: Rect): Uint8Array {
  const W = frame.width;
  const extra = rect.y > 0 ? 1 : 0;
  const rows = rect.h + extra;
  const values = new Float32Array(W * rows);
  renderTileFloat64(frame, params, { x: 0, y: rect.y - extra, w: W, h: rows }, values);

  const rgba = new Uint8Array(W * 4);
  const rowA = new Uint8Array(W * 3);
  const rowB = new Uint8Array(W * 3);
  const scratch = new Uint8Array(W * 3 * 5);
  const out = new Uint8Array(rect.h * (1 + W * 3));
  let prev: Uint8Array | null = null;
  let cur = rowA;
  for (let r = 0; r < rows; r++) {
    colorize(values, W, lut, rgba, 0, r * W);
    for (let i = 0, j = 0; i < W * 4; i += 4, j += 3) {
      cur[j] = rgba[i];
      cur[j + 1] = rgba[i + 1];
      cur[j + 2] = rgba[i + 2];
    }
    if (r >= extra) filterRow(cur, prev, out, (r - extra) * (1 + W * 3), scratch);
    prev = cur;
    cur = cur === rowA ? rowB : rowA;
  }
  return out;
}
