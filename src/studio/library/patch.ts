import { escapeValue } from '../../core/formulas/escape.ts';
import type { FractalParams } from '../../core/formulas/types.ts';

/** A fractal window: structure only, no color. */
export interface Patch {
  kind: 'mandelbrot' | 'julia';
  /** Window center in the complex plane. */
  cx: number;
  cy: number;
  /** Complex extent across the longer side of the target region. */
  span: number;
  /** Rotation of the window in radians. */
  rotation: number;
  /** Julia constant (unused for Mandelbrot). */
  jr: number;
  ji: number;
  maxIter: number;
  /** Normalization of log(1 + smooth escape) to s ∈ [0, 1] (from the proxy, 2nd/98th percentile). */
  lo: number;
  hi: number;
}

/** s value given to interior (non-escaping) points: the continuation of "near the boundary". */
export const INTERIOR_S = 1;

function params(p: Patch): FractalParams {
  return { formula: p.kind, juliaRe: p.jr, juliaIm: p.ji, maxIter: p.maxIter, escapeRadius: 256 };
}

/** Raw smooth escape value (or -1 for interior) at local pixel (i, j) of a w×h region. */
export function rawAt(p: Patch, fp: FractalParams, i: number, j: number, w: number, h: number): number {
  const m = Math.max(w, h);
  const u = (i + 0.5 - w / 2) / m;
  const v = (h / 2 - (j + 0.5)) / m; // y up
  const c = Math.cos(p.rotation);
  const s = Math.sin(p.rotation);
  return escapeValue(fp, p.cx + p.span * (u * c - v * s), p.cy + p.span * (u * s + v * c));
}

export function normalizeS(p: Patch, raw: number): number {
  if (raw < 0) return INTERIOR_S;
  const e = Math.log1p(raw);
  const s = (e - p.lo) / (p.hi - p.lo);
  return s < 0 ? 0 : s > 1 ? 1 : s;
}

export interface FieldResult {
  /** s per pixel, row-major w×h. */
  s: Float32Array;
  /** Approximate iterations spent (escape count, or maxIter for interior). */
  iterations: number;
}

/**
 * Renders the patch's scalar field at the region's true output resolution. Local
 * pixel indices (global index − region origin) map to the window, so any tiling
 * of the output yields identical values.
 */
export function renderField(p: Patch, w: number, h: number): FieldResult {
  const fp = params(p);
  const s = new Float32Array(w * h);
  let iterations = 0;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const raw = rawAt(p, fp, i, j, w, h);
      iterations += raw < 0 ? p.maxIter : Math.min(p.maxIter, raw + 2);
      s[j * w + i] = normalizeS(p, raw);
    }
  }
  return { s, iterations };
}

/** Raw (un-normalized) proxy render, used to derive lo/hi. */
export function renderRaw(p: Patch, w: number, h: number): Float32Array {
  const fp = params(p);
  const out = new Float32Array(w * h);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = rawAt(p, fp, i, j, w, h);
  return out;
}
