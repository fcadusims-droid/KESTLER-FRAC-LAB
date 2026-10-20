import { srgb8ToOklab, hexToLab, linearRgbToOklab, oklabToLinearRgb, srgbToLinear } from './oklab.ts';
import type { Rect } from './types.ts';

/** Planar OKLab image. */
export interface LabImage {
  width: number;
  height: number;
  L: Float32Array;
  a: Float32Array;
  b: Float32Array;
}

/** RGBA → OKLab, compositing alpha over `background` in linear light (same rule as the analysis). */
export function toLab(width: number, height: number, rgba: Uint8Array | Uint8ClampedArray, background = '#ffffff'): LabImage {
  const n = width * height;
  const L = new Float32Array(n);
  const a = new Float32Array(n);
  const b = new Float32Array(n);
  const bg = oklabToLinearRgb(...hexToLab(background));
  const cache = new Map<number, [number, number, number]>();
  for (let i = 0; i < n; i++) {
    const al = rgba[i * 4 + 3];
    let c: [number, number, number];
    if (al === 255) {
      const key = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
      c = cache.get(key) ?? srgb8ToOklab(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      cache.set(key, c);
    } else {
      const t = al / 255;
      c = linearRgbToOklab(
        srgbToLinear(rgba[i * 4] / 255) * t + bg[0] * (1 - t),
        srgbToLinear(rgba[i * 4 + 1] / 255) * t + bg[1] * (1 - t),
        srgbToLinear(rgba[i * 4 + 2] / 255) * t + bg[2] * (1 - t),
      );
    }
    L[i] = c[0];
    a[i] = c[1];
    b[i] = c[2];
  }
  return { width, height, L, a, b };
}

/** Exact area-average (box filter) resampling of one channel to tw × th. */
function boxResample(src: Float32Array, w: number, h: number, tw: number, th: number): Float32Array {
  const tmp = new Float32Array(tw * h);
  const sx = w / tw;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < tw; x++) {
      const x0 = x * sx;
      const x1 = x0 + sx;
      let acc = 0;
      for (let i = Math.floor(x0); i < Math.ceil(x1) && i < w; i++) acc += src[y * w + i] * (Math.min(x1, i + 1) - Math.max(x0, i));
      tmp[y * tw + x] = acc / sx;
    }
  }
  const out = new Float32Array(tw * th);
  const sy = h / th;
  for (let y = 0; y < th; y++) {
    const y0 = y * sy;
    const y1 = y0 + sy;
    for (let x = 0; x < tw; x++) {
      let acc = 0;
      for (let j = Math.floor(y0); j < Math.ceil(y1) && j < h; j++) acc += tmp[j * tw + x] * (Math.min(y1, j + 1) - Math.max(y0, j));
      out[y * tw + x] = acc / sy;
    }
  }
  return out;
}

export function downsample(img: LabImage, tw: number, th: number): LabImage {
  return {
    width: tw,
    height: th,
    L: boxResample(img.L, img.width, img.height, tw, th),
    a: boxResample(img.a, img.width, img.height, tw, th),
    b: boxResample(img.b, img.width, img.height, tw, th),
  };
}

export function meanDeltaE(p: LabImage, q: LabImage): number {
  let acc = 0;
  for (let i = 0; i < p.L.length; i++) acc += Math.hypot(p.L[i] - q.L[i], p.a[i] - q.a[i], p.b[i] - q.b[i]);
  return acc / p.L.length;
}

/** SSIM on OKLab L (range 1) with a 7×7 Gaussian window (σ = 1.5), averaged over valid positions. */
export function ssim(x: Float32Array, y: Float32Array, w: number, h: number): number {
  const R = 3;
  const g: number[] = [];
  let gs = 0;
  for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
    const v = Math.exp(-(i * i + j * j) / (2 * 1.5 * 1.5));
    g.push(v);
    gs += v;
  }
  const C1 = 0.01 ** 2;
  const C2 = 0.03 ** 2;
  let acc = 0;
  let n = 0;
  for (let cy = R; cy < h - R; cy++) {
    for (let cx = R; cx < w - R; cx++) {
      let mx = 0, my = 0, xx = 0, yy = 0, xy = 0;
      let k = 0;
      for (let j = -R; j <= R; j++) {
        for (let i = -R; i <= R; i++) {
          const wgt = g[k++] / gs;
          const a = x[(cy + j) * w + cx + i];
          const b = y[(cy + j) * w + cx + i];
          mx += wgt * a;
          my += wgt * b;
          xx += wgt * a * a;
          yy += wgt * b * b;
          xy += wgt * a * b;
        }
      }
      const vx = xx - mx * mx;
      const vy = yy - my * my;
      const cv = xy - mx * my;
      acc += ((2 * mx * my + C1) * (2 * cv + C2)) / ((mx * mx + my * my + C1) * (vx + vy + C2));
      n++;
    }
  }
  return n > 0 ? acc / n : 1;
}

export interface FidelityAtScale {
  width: number;
  height: number;
  deltaE: number;
  ssim: number;
}

export function fidelityAt(out: LabImage, target: LabImage, tw: number, th: number): FidelityAtScale {
  const o = downsample(out, tw, th);
  const t = downsample(target, tw, th);
  return { width: tw, height: th, deltaE: meanDeltaE(o, t), ssim: ssim(o.L, t.L, tw, th) };
}

export const VISIBLE_HF = 0.01;
export const FLAT_HF = 0.003;

export interface DetailMetrics {
  /** Mean over cells of mean |L − boxblur(L)| (radius ≈ cell/8, clamped to the cell). */
  meanHF: number;
  /** Fraction of cells with HF ≥ VISIBLE_HF. */
  visibleFrac: number;
  /** Fraction of cells with HF < FLAT_HF. */
  flatFrac: number;
}

export function detail(out: LabImage, rects: Rect[]): DetailMetrics {
  const W = out.width;
  let sum = 0;
  let visible = 0;
  let flat = 0;
  for (const r of rects) {
    const rad = Math.max(1, Math.round(Math.min(r.w, r.h) / 8));
    let hf = 0;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        let acc = 0;
        let cnt = 0;
        for (let j = Math.max(r.y, y - rad); j <= Math.min(r.y + r.h - 1, y + rad); j++) {
          for (let i = Math.max(r.x, x - rad); i <= Math.min(r.x + r.w - 1, x + rad); i++) {
            acc += out.L[j * W + i];
            cnt++;
          }
        }
        hf += Math.abs(out.L[y * W + x] - acc / cnt);
      }
    }
    hf /= r.w * r.h;
    sum += hf;
    if (hf >= VISIBLE_HF) visible++;
    if (hf < FLAT_HF) flat++;
  }
  return { meanHF: sum / rects.length, visibleFrac: visible / rects.length, flatFrac: flat / rects.length };
}

/** Mean |ΔE| between adjacent pixels across region borders ÷ the same within regions. */
export function seamRatio(out: LabImage, ids: Int32Array): number {
  const W = out.width;
  const H = out.height;
  let border = 0, nb = 0, within = 0, nw = 0;
  const d = (i: number, j: number) => Math.hypot(out.L[i] - out.L[j], out.a[i] - out.a[j], out.b[i] - out.b[j]);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      for (const j of [x + 1 < W ? i + 1 : -1, y + 1 < H ? i + W : -1]) {
        if (j < 0) continue;
        if (ids[i] !== ids[j]) {
          border += d(i, j);
          nb++;
        } else {
          within += d(i, j);
          nw++;
        }
      }
    }
  }
  return nb > 0 && nw > 0 && within > 0 ? border / nb / (within / nw) : 0;
}
