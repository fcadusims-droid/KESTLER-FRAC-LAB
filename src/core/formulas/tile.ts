import type { Frame } from '../view.ts';
import { pixelToIm, pixelToRe } from '../view.ts';
import { escapeValue } from './escape.ts';
import type { FractalParams, Rect } from './types.ts';

/**
 * Computes escape values for `rect` of `frame` into `out` (row-major, rect.w * rect.h).
 * Coordinates come from global pixel indices, so any tiling of a frame yields
 * exactly the same values as rendering it in one piece.
 */
export function renderTileFloat64(frame: Frame, params: FractalParams, rect: Rect, out: Float32Array): void {
  let i = 0;
  for (let row = 0; row < rect.h; row++) {
    const im = pixelToIm(frame, rect.y + row);
    for (let col = 0; col < rect.w; col++) {
      out[i++] = escapeValue(params, pixelToRe(frame, rect.x + col), im);
    }
  }
}
