/**
 * The ONLY module that reads source-image pixels. It turns the source into
 * per-region RegionDescriptors; the renderer never sees anything else.
 */
import { deltaE, hexToLab, linearRgbToOklab, oklabToLinearRgb, srgbToLinear, type Lab } from '../oklab.ts';
import type { Rect, RegionDescriptor, RgbaImage } from '../types.ts';

export interface AnalysisOptions {
  /** Output size the region rects refer to. */
  outWidth: number;
  outHeight: number;
  /** Color that transparent source pixels are composited over ('#rrggbb'). */
  background: string;
}

/** Below this ΔE_OK the two k-means clusters are treated as one color. */
export const MIN_TWO_COLOR_SEPARATION = 0.02;

interface Fields {
  sw: number;
  sh: number;
  lab: Float32Array; // 3 per pixel
  alpha: Float32Array;
  grad: Float32Array; // 6 per pixel: dL/dx, dL/dy, da/dx, da/dy, db/dx, db/dy
}

function computeFields(src: RgbaImage, background: string): Fields {
  const { width: sw, height: sh, data } = src;
  const n = sw * sh;
  const lab = new Float32Array(n * 3);
  const alpha = new Float32Array(n);
  const bg = oklabToLinearRgb(...hexToLab(background));
  for (let i = 0; i < n; i++) {
    const a = data[i * 4 + 3] / 255;
    // Composite in linear light; a transparent pixel becomes the background, never black.
    const r = srgbToLinear(data[i * 4] / 255) * a + bg[0] * (1 - a);
    const g = srgbToLinear(data[i * 4 + 1] / 255) * a + bg[1] * (1 - a);
    const b = srgbToLinear(data[i * 4 + 2] / 255) * a + bg[2] * (1 - a);
    const c = linearRgbToOklab(r, g, b);
    lab[i * 3] = c[0];
    lab[i * 3 + 1] = c[1];
    lab[i * 3 + 2] = c[2];
    alpha[i] = a;
  }
  // Sobel per OKLab channel (normalized to a per-pixel derivative), edges clamped.
  const grad = new Float32Array(n * 6);
  const at = (x: number, y: number, k: number) =>
    lab[(Math.min(sh - 1, Math.max(0, y)) * sw + Math.min(sw - 1, Math.max(0, x))) * 3 + k];
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const o = (y * sw + x) * 6;
      for (let k = 0; k < 3; k++) {
        const gx =
          at(x + 1, y - 1, k) + 2 * at(x + 1, y, k) + at(x + 1, y + 1, k) - at(x - 1, y - 1, k) - 2 * at(x - 1, y, k) - at(x - 1, y + 1, k);
        const gy =
          at(x - 1, y + 1, k) + 2 * at(x, y + 1, k) + at(x + 1, y + 1, k) - at(x - 1, y - 1, k) - 2 * at(x, y - 1, k) - at(x + 1, y - 1, k);
        grad[o + k * 2] = gx / 8;
        grad[o + k * 2 + 1] = gy / 8;
      }
    }
  }
  return { sw, sh, lab, alpha, grad };
}

const q = (v: number, step: number) => Math.round(v / step) * step;
const qLab = (c: Lab): Lab => [q(c[0], 1e-4), q(c[1], 1e-4), q(c[2], 1e-4)];

/** Source-pixel rectangle covered by an output rect (at least one pixel). */
function sourceRect(f: Fields, r: Rect, opts: AnalysisOptions) {
  const x0 = Math.min(f.sw - 1, Math.floor((r.x * f.sw) / opts.outWidth));
  const y0 = Math.min(f.sh - 1, Math.floor((r.y * f.sh) / opts.outHeight));
  const x1 = Math.max(x0 + 1, Math.min(f.sw, Math.round(((r.x + r.w) * f.sw) / opts.outWidth)));
  const y1 = Math.max(y0 + 1, Math.min(f.sh, Math.round(((r.y + r.h) * f.sh) / opts.outHeight)));
  return { x0, y0, x1, y1 };
}

function describeRegion(f: Fields, rect: Rect, opts: AnalysisOptions): RegionDescriptor {
  const { x0, y0, x1, y1 } = sourceRect(f, rect, opts);
  const count = (x1 - x0) * (y1 - y0);
  const idx = new Int32Array(count);
  let k = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) idx[k++] = y * f.sw + x;

  const mean: Lab = [0, 0, 0];
  let cov = 0;
  for (const i of idx) {
    mean[0] += f.lab[i * 3];
    mean[1] += f.lab[i * 3 + 1];
    mean[2] += f.lab[i * 3 + 2];
    cov += f.alpha[i];
  }
  mean[0] /= count;
  mean[1] /= count;
  mean[2] /= count;
  let lumVar = 0;
  for (const i of idx) lumVar += (f.lab[i * 3] - mean[0]) ** 2;
  lumVar /= count;

  // k-means, k = 2, in OKLab. Deterministic init: farthest point from the mean, then farthest from it.
  const px = (i: number): Lab => [f.lab[i * 3], f.lab[i * 3 + 1], f.lab[i * 3 + 2]];
  let far = idx[0];
  let best = -1;
  for (const i of idx) {
    const d = deltaE(px(i), mean);
    if (d > best) [best, far] = [d, i];
  }
  let c1 = px(far);
  best = -1;
  let far2 = idx[0];
  for (const i of idx) {
    const d = deltaE(px(i), c1);
    if (d > best) [best, far2] = [d, i];
  }
  let c2 = px(far2);
  let n1 = 0;
  let n2 = 0;
  const assign = new Uint8Array(count);
  for (let it = 0; it < 10; it++) {
    const s1: Lab = [0, 0, 0];
    const s2: Lab = [0, 0, 0];
    n1 = n2 = 0;
    for (let j = 0; j < count; j++) {
      const p = px(idx[j]);
      const second = deltaE(p, c2) < deltaE(p, c1);
      assign[j] = second ? 1 : 0;
      const s = second ? s2 : s1;
      s[0] += p[0];
      s[1] += p[1];
      s[2] += p[2];
      if (second) n2++;
      else n1++;
    }
    if (n1 === 0 || n2 === 0) break;
    c1 = [s1[0] / n1, s1[1] / n1, s1[2] / n1];
    c2 = [s2[0] / n2, s2[1] / n2, s2[2] / n2];
  }
  let colors: { lab: Lab; weight: number }[];
  if (n1 === 0 || n2 === 0 || deltaE(c1, c2) < MIN_TWO_COLOR_SEPARATION) {
    colors = [{ lab: qLab(mean), weight: 1 }];
  } else {
    // Order darker first so the gradient direction convention is stable.
    const first = c1[0] <= c2[0];
    const a = first ? { lab: c1, weight: n1 / count } : { lab: c2, weight: n2 / count };
    const b = first ? { lab: c2, weight: n2 / count } : { lab: c1, weight: n1 / count };
    colors = [
      { lab: qLab(a.lab), weight: q(a.weight, 1e-4) },
      { lab: qLab(b.lab), weight: q(1 - q(a.weight, 1e-4), 1e-4) },
    ];
  }

  // Gradient of the projection onto the color axis (colors[0] → colors[1]), or of L.
  let u: Lab = [1, 0, 0];
  if (colors.length === 2) {
    const d = deltaE(colors[0].lab, colors[1].lab);
    u = [(colors[1].lab[0] - colors[0].lab[0]) / d, (colors[1].lab[1] - colors[0].lab[1]) / d, (colors[1].lab[2] - colors[0].lab[2]) / d];
  }
  let mx = 0;
  let my = 0;
  let jxx = 0;
  let jyy = 0;
  let jxy = 0;
  let edge = 0;
  for (const i of idx) {
    const g = i * 6;
    const gx = u[0] * f.grad[g] + u[1] * f.grad[g + 2] + u[2] * f.grad[g + 4];
    const gy = u[0] * f.grad[g + 1] + u[1] * f.grad[g + 3] + u[2] * f.grad[g + 5];
    mx += gx;
    my += gy;
    jxx += gx * gx;
    jyy += gy * gy;
    jxy += gx * gy;
    edge += Math.sqrt(f.grad[g] ** 2 + f.grad[g + 1] ** 2 + f.grad[g + 2] ** 2 + f.grad[g + 3] ** 2 + f.grad[g + 4] ** 2 + f.grad[g + 5] ** 2);
  }
  const meanMag = Math.sqrt((jxx + jyy) / count);
  const signedMag = Math.hypot(mx, my) / count;
  // Use the signed mean gradient when it is coherent; otherwise the structure-tensor orientation.
  const gradDir = signedMag > 0.2 * meanMag && signedMag > 1e-6 ? Math.atan2(my, mx) : 0.5 * Math.atan2(2 * jxy, jxx - jyy);
  const scale = f.sw / opts.outWidth; // source pixels per output pixel

  return {
    rect: { ...rect },
    mean: qLab(mean),
    colors,
    lumMean: q(mean[0], 1e-4),
    lumVar: q(lumVar, 1e-6),
    edge: q((edge / count) * scale, 1e-5),
    gradDir: q(gradDir, 1e-3),
    coverage: q(cov / count, 1e-4),
  };
}

/** Analysis session over one source image. `describe` is handed to the partitioner. */
export function createAnalyzer(source: RgbaImage, opts: AnalysisOptions): { describe: (rect: Rect) => RegionDescriptor } {
  const fields = computeFields(source, opts.background);
  return { describe: (rect) => describeRegion(fields, rect, opts) };
}

/** analyze(source, partition) → descriptors, one per partition rect, in order. */
export function analyze(source: RgbaImage, partition: Rect[], opts: AnalysisOptions): RegionDescriptor[] {
  const { describe } = createAnalyzer(source, opts);
  return partition.map(describe);
}
