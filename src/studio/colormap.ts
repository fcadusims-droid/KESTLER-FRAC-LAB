import { linearRgbToOklab, oklabToLinearRgb, linearToSrgb, srgbToLinear, type Lab } from './oklab.ts';
import type { Derived } from './settings.ts';
import type { RegionDescriptor } from './types.ts';

/** Two-color mode is used when the clusters differ by at least this ΔE_OK and the minor one covers ≥ 8%. */
export const TWO_COLOR_MIN_DE = 0.06;
export const TWO_COLOR_MIN_WEIGHT = 0.08;

function rankIn(sorted: Float32Array, v: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < v) lo = mid + 1;
    else hi = mid;
  }
  // Midpoint rank among equal values, in [0, 1].
  let hi2 = lo;
  while (hi2 < sorted.length && sorted[hi2] === v) hi2++;
  return sorted.length > 1 ? (lo + hi2 - 1) / 2 / (sorted.length - 1) : 0.5;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Round-trips a color through 8-bit sRGB with chroma-reducing gamut mapping. */
function displayed(c: Lab): Lab {
  const L = Math.min(1, Math.max(0, c[0]));
  let rgb = oklabToLinearRgb(L, c[1], c[2]);
  const ok = (v: number[]) => v.every((x) => x >= -1e-6 && x <= 1 + 1e-6);
  if (!ok(rgb)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const m = (lo + hi) / 2;
      if (ok(oklabToLinearRgb(L, c[1] * m, c[2] * m))) lo = m;
      else hi = m;
    }
    rgb = oklabToLinearRgb(L, c[1] * lo, c[2] * lo);
  }
  const q = rgb.map((v) => srgbToLinear(Math.round(linearToSrgb(Math.min(1, Math.max(0, v))) * 255) / 255));
  return linearRgbToOklab(q[0], q[1], q[2]);
}

/**
 * Per-region mapping from the fractal scalar s (and pixel position, for the
 * two-color ramp) to OKLab. Every output value depends on s; nothing here
 * reads source pixels — only the region's descriptor.
 */
export class RegionColorMap {
  readonly twoColor: boolean;
  private readonly d: RegionDescriptor;
  private readonly dv: Derived;
  private readonly sortedS: Float32Array;
  private readonly sMean: number;
  private readonly sStd: number;
  private readonly sortedRamp: Float32Array;
  private readonly cosD: number;
  private readonly sinD: number;
  private tau = 0.5;
  private offset: Lab = [0, 0, 0];
  /** Lightness amplitude for z > 0 and z < 0 (asymmetric near the gamut ceiling/floor). */
  private ampUp = 0;
  private ampDown = 0;

  constructor(d: RegionDescriptor, s: Float32Array, dv: Derived, allowTwoColor: boolean) {
    this.d = d;
    this.dv = dv;
    const { w, h } = d.rect;
    this.sortedS = Float32Array.from(s).sort();
    let m = 0;
    for (const v of s) m += v;
    m /= s.length;
    let v2 = 0;
    for (const v of s) v2 += (v - m) ** 2;
    this.sMean = m;
    this.sStd = Math.sqrt(v2 / s.length);
    const c = d.colors;
    this.twoColor =
      allowTwoColor &&
      c.length === 2 &&
      Math.hypot(c[0].lab[0] - c[1].lab[0], c[0].lab[1] - c[1].lab[1], c[0].lab[2] - c[1].lab[2]) >= TWO_COLOR_MIN_DE &&
      Math.min(c[0].weight, c[1].weight) >= TWO_COLOR_MIN_WEIGHT;
    this.cosD = Math.cos(d.gradDir);
    this.sinD = Math.sin(d.gradDir);
    const ramp = new Float32Array(w * h);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) ramp[j * w + i] = this.rampAt(d.rect.x + i, d.rect.y + j);
    this.sortedRamp = ramp.sort();

    if (this.twoColor) {
      // Threshold so that the area above it (colors[1] side) matches colors[1].weight.
      const f = new Float32Array(w * h);
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) f[j * w + i] = this.field(s[j * w + i], d.rect.x + i, d.rect.y + j);
      f.sort();
      this.tau = f[Math.min(f.length - 1, Math.max(0, Math.round((1 - c[1].weight) * (f.length - 1))))];
    }
    // Near white (or black) a symmetric modulation would be clipped flat. The modulation is
    // made asymmetric there — it only goes as far up/down as the room left (z ≤ 2.5) — and the
    // target lightness keeps a small headroom, so texture survives with a near-extreme mean.
    const amp = dv.amplitude * (this.twoColor ? 0.6 : 1);
    const headroom = 0.45 * amp;
    const targetL = Math.min(1 - headroom, Math.max(headroom, d.mean[0]));
    this.ampUp = Math.min(amp, Math.max(0, (0.995 - targetL) / 2.5));
    this.ampDown = Math.min(amp, Math.max(0, (targetL - 0.005) / 2.5));
    // Shift so the displayed region mean matches the (headroom-limited) target mean (two passes).
    for (let pass = 0; pass < 2; pass++) {
      const acc: Lab = [0, 0, 0];
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const p = displayed(this.colorAt(s[j * w + i], d.rect.x + i, d.rect.y + j));
          acc[0] += p[0];
          acc[1] += p[1];
          acc[2] += p[2];
        }
      }
      const n = w * h;
      this.offset = [this.offset[0] + targetL - acc[0] / n, this.offset[1] + d.mean[1] - acc[1] / n, this.offset[2] + d.mean[2] - acc[2] / n];
    }
  }

  private rampAt(gx: number, gy: number): number {
    const r = this.d.rect;
    return (gx + 0.5 - (r.x + r.w / 2)) * this.cosD + (gy + 0.5 - (r.y + r.h / 2)) * this.sinD;
  }

  private field(s: number, gx: number, gy: number): number {
    const lam = this.dv.rampWeight;
    return lam * rankIn(this.sortedRamp, this.rampAt(gx, gy)) + (1 - lam) * rankIn(this.sortedS, s);
  }

  /** Color for fractal value s at global pixel (gx, gy). */
  colorAt(s: number, gx: number, gy: number): Lab {
    const dv = this.dv;
    const z = Math.max(-2.5, Math.min(2.5, this.sStd > 1e-4 ? (s - this.sMean) / this.sStd : (s - 0.5) * 4));
    let base: Lab;
    if (this.twoColor) {
      const [c0, c1] = this.d.colors;
      const t = smoothstep(this.tau - dv.transition, this.tau + dv.transition, this.field(s, gx, gy));
      base = [c0.lab[0] + (c1.lab[0] - c0.lab[0]) * t, c0.lab[1] + (c1.lab[1] - c0.lab[1]) * t, c0.lab[2] + (c1.lab[2] - c0.lab[2]) * t];
    } else {
      base = [this.d.mean[0], this.d.mean[1], this.d.mean[2]];
    }
    const L = base[0] + (z > 0 ? this.ampUp : this.ampDown) * z;
    const k = 1 + dv.chromaMod * z;
    const ang = dv.hueMod * z;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const a = k * (base[1] * ca - base[2] * sa);
    const b = k * (base[1] * sa + base[2] * ca);
    return [L + this.offset[0], a + this.offset[1], b + this.offset[2]];
  }
}
