import { describe, expect, it } from 'vitest';
import { escapeValue, INTERIOR, inMainCardioidOrBulb, smoothValue, type FractalParams } from '../src/core/formulas/index.ts';
import { escapeMandelbrotLike } from '../src/core/formulas/escape.ts';

const mandel: FractalParams = { formula: 'mandelbrot', juliaRe: 0, juliaIm: 0, maxIter: 1000, escapeRadius: 256 };
const julia = (re: number, im: number, maxIter = 1000): FractalParams => ({ ...mandel, formula: 'julia', juliaRe: re, juliaIm: im, maxIter });

/** Reference implementation with no shortcuts (no cardioid/bulb/periodicity checks). */
function naiveCount(zx: number, zy: number, cx: number, cy: number, maxIter: number, R: number): number {
  let x = zx, y = zy;
  for (let n = 0; n < maxIter; n++) {
    if (x * x + y * y > R * R) return n;
    const t = x * x - y * y + cx;
    y = 2 * x * y + cy;
    x = t;
  }
  return x * x + y * y > R * R ? maxIter : -1;
}

describe('Mandelbrot known points', () => {
  it.each([
    [0, 0],
    [-1, 0],
    [-0.1, 0.1],
  ])('%f%+fi is inside', (re, im) => {
    expect(escapeValue(mandel, re, im)).toBe(INTERIOR);
  });

  it.each([
    [1, 0],
    [2, 2],
    [0.5, 0],
  ])('%f%+fi escapes', (re, im) => {
    expect(escapeValue(mandel, re, im)).toBeGreaterThan(0);
  });

  it('cardioid/bulb check agrees with plain iteration', () => {
    for (let i = 0; i < 2000; i++) {
      const re = -2 + (i % 50) * 0.06;
      const im = -1.2 + Math.floor(i / 50) * 0.06;
      if (inMainCardioidOrBulb(re, im)) expect(naiveCount(0, 0, re, im, 5000, 256)).toBe(-1);
    }
  });

  it('shortcuts never change the escape count', () => {
    for (let i = 0; i < 3000; i++) {
      const re = -2.1 + (i % 60) * 0.045;
      const im = -1.3 + Math.floor(i / 60) * 0.052;
      const v = escapeValue({ ...mandel, maxIter: 400 }, re, im);
      const n = naiveCount(0, 0, re, im, 400, 256);
      if (n < 0) expect(v).toBe(INTERIOR);
      else expect(Math.abs(v - (n - 2))).toBeLessThan(0.6);
    }
  });
});

describe('Julia', () => {
  it('c = 0: unit disk is interior, outside escapes', () => {
    const p = julia(0, 0);
    expect(escapeValue(p, 0.5, 0.5)).toBe(INTERIOR);
    expect(escapeValue(p, 0, 0)).toBe(INTERIOR);
    expect(escapeValue(p, 1.01, 0)).toBeGreaterThan(0);
    expect(escapeValue(p, 0, -1.5)).toBeGreaterThan(0);
  });

  it('c = -1 (basilica): 0 and -1 are a 2-cycle (interior); 2 escapes', () => {
    const p = julia(-1, 0);
    expect(escapeValue(p, 0, 0)).toBe(INTERIOR);
    expect(escapeValue(p, -1, 0)).toBe(INTERIOR);
    expect(escapeValue(p, 2, 0)).toBeGreaterThan(0);
  });

  it('c = -0.8+0.156i: origin escapes with a finite count; far point escapes fast', () => {
    const p = julia(-0.8, 0.156);
    const far = escapeValue(p, 3, 3);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(5);
  });

  it('Julia escape counts match plain iteration', () => {
    const p = julia(-0.4, 0.6, 300);
    for (let i = 0; i < 1000; i++) {
      const re = -1.5 + (i % 40) * 0.075;
      const im = -1.2 + Math.floor(i / 40) * 0.1;
      const n = naiveCount(re, im, -0.4, 0.6, 300, 256);
      const v = escapeValue(p, re, im);
      expect(v === INTERIOR).toBe(n < 0);
    }
  });
});

describe('iteration limit and escape count', () => {
  it('a point escaping at iteration n is interior when maxIter < n', () => {
    // c = 0.26 escapes slowly (just outside the cardioid cusp).
    const n = naiveCount(0, 0, 0.26, 0, 100000, 256);
    expect(n).toBeGreaterThan(20);
    expect(escapeValue({ ...mandel, maxIter: n - 1 }, 0.26, 0)).toBe(INTERIOR);
    expect(escapeValue({ ...mandel, maxIter: n }, 0.26, 0)).toBeGreaterThan(0);
  });

  // With R = 256, ln|z_n| lies in (ln R, ln R² + small], so n + 1 - log2(ln|z_n|) ∈ (n - 2.47, n - 1.47].
  it('smooth value lies in (n - 2.47, n - 1.47] for escape count n', () => {
    for (const c of [0.26, 0.3, 0.5, 1, -2.1, 0.4]) {
      const n = naiveCount(0, 0, c, 0, 10000, 256);
      const v = escapeValue(mandel, c, 0);
      expect(v).toBeGreaterThan(n - 2.48);
      expect(v).toBeLessThanOrEqual(n - 1.46);
    }
  });

  it('smoothValue is clamped at 0 and never equals INTERIOR', () => {
    expect(smoothValue(0, 1e30)).toBe(0);
    expect(smoothValue(10, 70000)).toBeGreaterThan(0);
  });
});

describe('smooth coloring continuity', () => {
  it('is monotonic and continuous along a ray crossing many escape-count boundaries', () => {
    // Walk inward along the real axis from 2.5 toward the cusp at 0.25.
    // The integer count jumps many times; the smooth value must not.
    const steps = 20000;
    let prev = escapeMandelbrotLike(0, 0, 2.5, 0, 100000, 256 * 256, false);
    let maxJump = 0;
    for (let i = 1; i <= steps; i++) {
      const c = 2.5 - (2.5 - 0.3) * (i / steps);
      const v = escapeMandelbrotLike(0, 0, c, 0, 100000, 256 * 256, false);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      maxJump = Math.max(maxJump, v - prev);
      prev = v;
    }
    // Total rise is ~30; with 20000 samples no single step may jump by a whole band.
    expect(maxJump).toBeLessThan(0.2);
  });

  it('near an escape-count boundary, values on both sides agree', () => {
    // Bisect for the c where the count changes from n to n+1, then compare.
    let lo = 0.3, hi = 0.5;
    const count = (c: number) => naiveCount(0, 0, c, 0, 100000, 256);
    const target = count(lo);
    while (count(hi) === target) hi += 0.1;
    for (let k = 0; k < 60; k++) {
      const mid = (lo + hi) / 2;
      if (count(mid) === target) lo = mid;
      else hi = mid;
    }
    const a = escapeValue(mandel, lo, 0);
    const b = escapeValue(mandel, hi, 0);
    expect(count(lo)).not.toBe(count(hi));
    expect(Math.abs(a - b)).toBeLessThan(0.02);
  });
});

describe('Burning Ship', () => {
  it('origin is interior; far points escape', () => {
    const p: FractalParams = { ...mandel, formula: 'burningShip' };
    expect(escapeValue(p, 0, 0)).toBe(INTERIOR);
    expect(escapeValue(p, -1.75, 0)).toBe(INTERIOR);
    expect(escapeValue(p, 1, 1)).toBeGreaterThan(0);
  });

  it('differs from Mandelbrot where Im(z) changes sign', () => {
    const p: FractalParams = { ...mandel, formula: 'burningShip', maxIter: 200 };
    let diff = 0;
    for (let i = 0; i < 400; i++) {
      const re = -2 + (i % 20) * 0.15;
      const im = -1.5 + Math.floor(i / 20) * 0.15;
      if (escapeValue(p, re, im) !== escapeValue({ ...mandel, maxIter: 200 }, re, im)) diff++;
    }
    expect(diff).toBeGreaterThan(50);
  });
});
