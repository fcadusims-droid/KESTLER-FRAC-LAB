import type { Lab } from './oklab.ts';

/** 8-bit RGBA raster, row-major. Only the analysis module may read a *source* image. */
export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

/** Axis-aligned rectangle in output pixels. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Everything the renderer is allowed to know about one region of the source.
 * Nothing here is finer than the region itself.
 */
export interface RegionDescriptor {
  /** Region bounds in output pixels. */
  rect: Rect;
  /** Mean color (OKLab), transparent pixels composited over the background. */
  mean: Lab;
  /** 1 or 2 dominant colors (k-means, k = 2, OKLab) with area proportions summing to 1. */
  colors: { lab: Lab; weight: number }[];
  /** OKLab lightness mean and variance. */
  lumMean: number;
  lumVar: number;
  /** Mean color-gradient magnitude (ΔE_OK per output pixel). */
  edge: number;
  /**
   * Dominant gradient direction in radians (image axes: x right, y down). For
   * two-color regions it points from colors[0] toward colors[1].
   */
  gradDir: number;
  /** Mean alpha coverage in [0, 1]. */
  coverage: number;
}
