import type { Frame } from './view.ts';
import { relativePixelSize } from './precision.ts';

/**
 * float32 has a relative epsilon of ~1.2e-7. When a pixel is smaller than
 * ~2e-5 of the coordinate magnitude (~170 float32 ulps), rounding of the
 * pixel coordinates and of the orbit becomes visible, so a float32 backend
 * must hand over to float64 before that.
 */
export const FLOAT32_PRECISION_LIMIT = 2e-5;

export function isFloat32Usable(frame: Pick<Frame, 'cx' | 'cy' | 'scale'>): boolean {
  return relativePixelSize(frame) >= FLOAT32_PRECISION_LIMIT;
}
