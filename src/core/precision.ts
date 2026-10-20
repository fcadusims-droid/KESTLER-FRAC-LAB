import type { Frame } from './view.ts';
import type { FractalParams, Rect } from './formulas/types.ts';
import { renderTileFloat64 } from './formulas/tile.ts';

/**
 * Extension point for numeric backends. Today there is one: plain float64.
 * A deep-zoom backend (perturbation / arbitrary precision) would implement
 * the same signature.
 */
export interface PrecisionBackend {
  id: string;
  label: string;
  renderTile(frame: Frame, params: FractalParams, rect: Rect, out: Float32Array): void;
}

export const FLOAT64_BACKEND: PrecisionBackend = {
  id: 'cpu-f64',
  label: 'CPU float64',
  renderTile: renderTileFloat64,
};

/**
 * Below this ratio of pixel size to coordinate magnitude, adjacent pixels map
 * to (nearly) the same float64 values and the image degrades into blocks.
 * float64 has a relative epsilon of ~2.2e-16; 1e-14 leaves a small margin.
 */
export const FLOAT64_PRECISION_LIMIT = 1e-14;

export function relativePixelSize(frame: Pick<Frame, 'cx' | 'cy' | 'scale'>): number {
  return frame.scale / Math.max(Math.abs(frame.cx), Math.abs(frame.cy), 1e-300);
}

export function isBeyondFloat64Precision(frame: Pick<Frame, 'cx' | 'cy' | 'scale'>): boolean {
  return relativePixelSize(frame) < FLOAT64_PRECISION_LIMIT;
}
