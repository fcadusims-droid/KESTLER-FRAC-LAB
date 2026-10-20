import { INTERIOR, type FractalParams } from './types.ts';
import { smoothValue } from './smooth.ts';

/** True if c lies in the main cardioid or the period-2 bulb of the Mandelbrot set. */
export function inMainCardioidOrBulb(x: number, y: number): boolean {
  const xq = x - 0.25;
  const y2 = y * y;
  const q = xq * xq + y2;
  if (q * (q + xq) <= 0.25 * y2) return true;
  const xb = x + 1;
  return xb * xb + y2 <= 0.0625;
}

/**
 * Iterates z ← z² + c from z0 and returns the smooth escape value, or INTERIOR
 * if |z| stays within the escape radius for maxIter iterations.
 *
 * Periodicity checking only short-circuits orbits that repeat *exactly* in
 * float64; such orbits can never escape, so the result is identical to running
 * all maxIter iterations. The quadratic and Burning Ship loops are written out
 * separately to keep the hot loop free of formula branches.
 */
export function escapeQuadratic(zx: number, zy: number, cx: number, cy: number, maxIter: number, escape2: number): number {
  let x = zx;
  let y = zy;
  let refX = x;
  let refY = y;
  let period = 8;
  let sinceRef = 0;
  for (let n = 0; n < maxIter; n++) {
    const x2 = x * x;
    const y2 = y * y;
    if (x2 + y2 > escape2) return smoothValue(n, x2 + y2);
    y = 2 * x * y + cy;
    x = x2 - y2 + cx;
    if (x === refX && y === refY) return INTERIOR;
    if (++sinceRef === period) {
      refX = x;
      refY = y;
      sinceRef = 0;
      period *= 2;
    }
  }
  const m2 = x * x + y * y;
  return m2 > escape2 ? smoothValue(maxIter, m2) : INTERIOR;
}

/**
 * Burning Ship, (|x| - i|y|)² + c: the classic form mirrored across the real
 * axis, so it appears upright with the imaginary axis pointing up.
 */
export function escapeBurningShip(cx: number, cy: number, maxIter: number, escape2: number): number {
  let x = 0;
  let y = 0;
  let refX = x;
  let refY = y;
  let period = 8;
  let sinceRef = 0;
  for (let n = 0; n < maxIter; n++) {
    const x2 = x * x;
    const y2 = y * y;
    if (x2 + y2 > escape2) return smoothValue(n, x2 + y2);
    const xy = x * y;
    y = (xy < 0 ? 2 * xy : -2 * xy) + cy;
    x = x2 - y2 + cx;
    if (x === refX && y === refY) return INTERIOR;
    if (++sinceRef === period) {
      refX = x;
      refY = y;
      sinceRef = 0;
      period *= 2;
    }
  }
  const m2 = x * x + y * y;
  return m2 > escape2 ? smoothValue(maxIter, m2) : INTERIOR;
}

/** Dispatches to the quadratic or the Burning Ship loop (z0 must be 0 for the latter). */
export function escapeMandelbrotLike(zx: number, zy: number, cx: number, cy: number, maxIter: number, escape2: number, burning: boolean): number {
  return burning ? escapeBurningShip(cx, cy, maxIter, escape2) : escapeQuadratic(zx, zy, cx, cy, maxIter, escape2);
}

/** Escape value for a single point of the given formula. */
export function escapeValue(params: FractalParams, re: number, im: number): number {
  const e2 = params.escapeRadius * params.escapeRadius;
  switch (params.formula) {
    case 'mandelbrot':
      if (inMainCardioidOrBulb(re, im)) return INTERIOR;
      return escapeQuadratic(0, 0, re, im, params.maxIter, e2);
    case 'julia':
      return escapeQuadratic(re, im, params.juliaRe, params.juliaIm, params.maxIter, e2);
    case 'burningShip':
      return escapeBurningShip(re, im, params.maxIter, e2);
  }
}
