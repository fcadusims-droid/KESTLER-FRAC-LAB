import { escapeValue } from '../../core/formulas/escape.ts';
import { mulberry32 } from '../prng.ts';
import { renderField, renderRaw, type Patch } from './patch.ts';

/** Proxy resolution used for patch statistics. */
export const PROXY = 40;

export interface PatchStats {
  meanS: number;
  stdS: number;
  interiorFrac: number;
  /** High-frequency energy: mean |s − box3(s)| on the proxy. */
  density: number;
  /** Rank of density within the library, in [0, 1]. */
  densityRank: number;
  /** Dominant gradient orientation of s (structure tensor), radians mod π. */
  orient: number;
  /** Structure-tensor coherence in [0, 1]. */
  coherence: number;
  /** Fraction of proxy pixels with s above the median. */
  fracAbove: number;
  /** Direction (radians, image axes) from the below-median centroid to the above-median centroid. */
  splitDir: number;
  /** Centroid separation in units of the region size (≈0.5 for a clean half-plane split). */
  splitStrength: number;
}

export interface Candidate {
  /** Index of the base patch (shared by its rotations; used for the repeat penalty). */
  base: number;
  patch: Patch;
  stats: PatchStats;
}

export interface Library {
  seed: number;
  candidates: Candidate[];
  /** Number of base patches and how many samples were rejected as flat. */
  baseCount: number;
  rejected: number;
}

/**
 * minRawRange is checked before normalization: per-patch normalization would stretch an
 * almost-constant field to [0, 1], so std(s) alone cannot detect flatness.
 */
export const FLAT_LIMITS = { minRawRange: 0.15, minStd: 0.12, maxInterior: 0.5, minDensity: 0.01 };

export function computeStats(s: Float32Array, n: number, interiorMask: Uint8Array): Omit<PatchStats, 'densityRank'> {
  const N = n * n;
  let mean = 0;
  let interior = 0;
  for (let i = 0; i < N; i++) {
    mean += s[i];
    interior += interiorMask[i];
  }
  mean /= N;
  let v = 0;
  for (let i = 0; i < N; i++) v += (s[i] - mean) ** 2;
  const std = Math.sqrt(v / N);

  let density = 0;
  let jxx = 0;
  let jyy = 0;
  let jxy = 0;
  const at = (x: number, y: number) => s[Math.min(n - 1, Math.max(0, y)) * n + Math.min(n - 1, Math.max(0, x))];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let box = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) box += at(x + dx, y + dy);
      density += Math.abs(at(x, y) - box / 9);
      const gx = (at(x + 1, y) - at(x - 1, y)) / 2;
      const gy = (at(x, y + 1) - at(x, y - 1)) / 2;
      jxx += gx * gx;
      jyy += gy * gy;
      jxy += gx * gy;
    }
  }
  density /= N;
  const orient = 0.5 * Math.atan2(2 * jxy, jxx - jyy);
  const coherence = jxx + jyy > 1e-12 ? Math.sqrt((jxx - jyy) ** 2 + 4 * jxy ** 2) / (jxx + jyy) : 0;

  const sorted = Float32Array.from(s).sort();
  const median = sorted[Math.floor(N / 2)];
  let above = 0;
  let ax = 0;
  let ay = 0;
  let bx = 0;
  let by = 0;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (s[y * n + x] > median) {
        above++;
        ax += x;
        ay += y;
      } else {
        bx += x;
        by += y;
      }
    }
  }
  const below = N - above;
  let splitDir = 0;
  let splitStrength = 0;
  if (above > 0 && below > 0) {
    const vx = (ax / above - bx / below) / n;
    const vy = (ay / above - by / below) / n;
    splitDir = Math.atan2(vy, vx);
    splitStrength = Math.hypot(vx, vy);
  }
  return { meanS: mean, stdS: std, interiorFrac: interior / N, density, orient, coherence, fracAbove: above / N, splitDir, splitStrength };
}

export function isFlat(st: Pick<PatchStats, 'stdS' | 'interiorFrac' | 'density'>): boolean {
  return st.stdS < FLAT_LIMITS.minStd || st.interiorFrac > FLAT_LIMITS.maxInterior || st.density < FLAT_LIMITS.minDensity;
}

function percentile(sorted: Float32Array, p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
}

/** Sets lo/hi from the proxy distribution of log(1 + smooth escape); null if mostly interior or nearly constant. */
export function calibrate(p: Patch): Patch | null {
  const raw = renderRaw(p, PROXY, PROXY);
  const ext = Float32Array.from(Array.from(raw).filter((v) => v >= 0).map((v) => Math.log1p(v))).sort();
  if (ext.length < raw.length * 0.2) return null;
  const lo = percentile(ext, 0.02);
  const hi = percentile(ext, 0.98);
  if (hi - lo < FLAT_LIMITS.minRawRange) return null;
  return { ...p, lo, hi };
}

function proxyStats(p: Patch) {
  const { s } = renderField(p, PROXY, PROXY);
  const raw = renderRaw(p, PROXY, PROXY);
  const interior = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) interior[i] = raw[i] < 0 ? 1 : 0;
  return computeStats(s, PROXY, interior);
}

/** A point near the Mandelbrot boundary: escapes, but slowly. */
function nearBoundaryC(rng: () => number, minEscape: number): [number, number] {
  for (;;) {
    const re = -2.1 + rng() * 2.7;
    const im = -1.2 + rng() * 2.4;
    const v = escapeValue({ formula: 'mandelbrot', juliaRe: 0, juliaIm: 0, maxIter: 500, escapeRadius: 256 }, re, im);
    if (v >= minEscape) return [re, im];
  }
}

/**
 * Deterministic library: `baseCount` accepted base patches (half Mandelbrot,
 * half Julia), each in 4 exact 90° rotations. Flat samples are rejected.
 */
export function buildLibrary(seed: number, baseCount = 96): Library {
  const rng = mulberry32(seed);
  const candidates: Candidate[] = [];
  let rejected = 0;
  let base = 0;
  while (base < baseCount) {
    const julia = base % 2 === 1;
    let p: Patch;
    if (!julia) {
      const [cx, cy] = nearBoundaryC(rng, 15);
      const span = 0.004 * Math.pow(0.25 / 0.004, rng());
      p = { kind: 'mandelbrot', cx, cy, span, rotation: rng() * Math.PI * 2, jr: 0, ji: 0, maxIter: Math.round(150 + 60 * Math.log10(1 / span)), lo: 0, hi: 1 };
    } else {
      const [jr, ji] = nearBoundaryC(rng, 8);
      const ang = rng() * Math.PI * 2;
      const rad = Math.sqrt(rng()) * 0.9;
      const span = 0.06 * Math.pow(1.2 / 0.06, rng());
      p = { kind: 'julia', cx: rad * Math.cos(ang), cy: rad * Math.sin(ang), span, rotation: rng() * Math.PI * 2, jr, ji, maxIter: 220, lo: 0, hi: 1 };
    }
    const cal = calibrate(p);
    if (!cal) {
      rejected++;
      continue;
    }
    const st0 = proxyStats(cal);
    if (isFlat(st0)) {
      rejected++;
      continue;
    }
    for (let k = 0; k < 4; k++) {
      const rotated = { ...cal, rotation: cal.rotation + (k * Math.PI) / 2 };
      candidates.push({ base, patch: rotated, stats: { ...proxyStats(rotated), densityRank: 0 } });
    }
    base++;
  }
  const order = candidates.map((c, i) => [c.stats.density, i] as const).sort((a, b) => a[0] - b[0]);
  order.forEach(([, i], r) => (candidates[i].stats.densityRank = order.length > 1 ? r / (order.length - 1) : 0.5));
  return { seed, candidates, baseCount, rejected };
}
