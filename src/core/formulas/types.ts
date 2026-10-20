export type FormulaId = 'mandelbrot' | 'julia' | 'burningShip';

export const FORMULA_IDS: readonly FormulaId[] = ['mandelbrot', 'julia', 'burningShip'];

export interface FractalParams {
  formula: FormulaId;
  /** Julia constant (ignored by other formulas). */
  juliaRe: number;
  juliaIm: number;
  /** Resolved iteration limit (auto iterations are resolved before rendering). */
  maxIter: number;
  escapeRadius: number;
}

/** Per-pixel value for points that did not escape within maxIter. */
export const INTERIOR = -1;

/** A rectangle of pixels inside a frame, in global pixel indices. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
