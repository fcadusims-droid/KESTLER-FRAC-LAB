import { describe, expect, it } from 'vitest';
import { analyze, createAnalyzer } from '../../src/studio/analysis/analyze.ts';
import { srgb8ToOklab, deltaE } from '../../src/studio/oklab.ts';
import type { RgbaImage } from '../../src/studio/types.ts';

function image(w: number, h: number, f: (x: number, y: number) => [number, number, number, number]): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
}
const opts = (w: number, h: number, background = '#ffffff') => ({ outWidth: w, outHeight: h, background });
const RED = srgb8ToOklab(255, 0, 0);
const BLUE = srgb8ToOklab(0, 0, 255);

describe('analysis', () => {
  it('a half-red / half-blue cell gives 2 colors at 50/50 and a horizontal gradient (vertical edge)', () => {
    const img = image(32, 32, (x) => (x < 16 ? [255, 0, 0, 255] : [0, 0, 255, 255]));
    const [d] = analyze(img, [{ x: 0, y: 0, w: 32, h: 32 }], opts(32, 32));
    expect(d.colors).toHaveLength(2);
    expect(d.colors[0].weight).toBeCloseTo(0.5, 3);
    expect(d.colors[1].weight).toBeCloseTo(0.5, 3);
    const labs = d.colors.map((c) => c.lab);
    expect(Math.min(deltaE(labs[0], RED), deltaE(labs[1], RED))).toBeLessThan(1e-3);
    expect(Math.min(deltaE(labs[0], BLUE), deltaE(labs[1], BLUE))).toBeLessThan(1e-3);
    // Gradient points from colors[0] (blue, right half) toward colors[1] (red, left half): −x.
    expect(Math.abs(Math.cos(d.gradDir))).toBeCloseTo(1, 3);
    expect(deltaE(labs[0], BLUE)).toBeLessThan(1e-3); // blue (L≈0.45) is darker than red (L≈0.63)
    expect(Math.cos(d.gradDir)).toBeCloseTo(-1, 3);
    expect(d.edge).toBeGreaterThan(0);
    expect(d.coverage).toBe(1);
  });

  it('a uniform cell has one color, zero variance and zero edge', () => {
    const img = image(16, 16, () => [10, 200, 30, 255]);
    const [d] = analyze(img, [{ x: 0, y: 0, w: 16, h: 16 }], opts(16, 16));
    expect(d.colors).toHaveLength(1);
    expect(d.lumVar).toBe(0);
    expect(d.edge).toBe(0);
    expect(deltaE(d.mean, srgb8ToOklab(10, 200, 30))).toBeLessThan(1e-3);
  });

  it('transparent pixels are composited over the background, never treated as black', () => {
    const img = image(16, 16, () => [0, 0, 0, 0]);
    const [white] = analyze(img, [{ x: 0, y: 0, w: 16, h: 16 }], opts(16, 16, '#ffffff'));
    expect(white.mean[0]).toBeCloseTo(1, 3);
    expect(white.coverage).toBe(0);
    const [green] = analyze(img, [{ x: 0, y: 0, w: 16, h: 16 }], opts(16, 16, '#00ff00'));
    expect(deltaE(green.mean, srgb8ToOklab(0, 255, 0))).toBeLessThan(1e-3);
  });

  it('half-transparent red over white is pink and coverage is the mean alpha', () => {
    const img = image(8, 8, (x) => (x < 4 ? [255, 0, 0, 128] : [255, 0, 0, 255]));
    const [d] = analyze(img, [{ x: 0, y: 0, w: 8, h: 8 }], opts(8, 8));
    expect(d.coverage).toBeCloseTo((128 / 255 + 1) / 2, 3);
    expect(d.colors).toHaveLength(2);
    expect(d.colors[1].lab[0]).toBeGreaterThan(RED[0]); // the translucent half is lighter than red
  });

  it('RGB-only content (alpha 255) and output-to-source scaling', () => {
    const img = image(64, 64, (x, y) => [x * 4, y * 4, 128, 255]);
    const { describe } = createAnalyzer(img, opts(16, 16));
    const d = describe({ x: 4, y: 4, w: 4, h: 4 }); // covers source pixels 16..31
    expect(d.mean.every(Number.isFinite)).toBe(true);
    expect(d.lumVar).toBeGreaterThan(0);
    expect(Number.isFinite(d.gradDir) && Number.isFinite(d.edge)).toBe(true);
  });
});
