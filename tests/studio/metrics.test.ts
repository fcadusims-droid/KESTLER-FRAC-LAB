import { describe, expect, it } from 'vitest';
import { detail, downsample, fidelityAt, meanDeltaE, seamRatio, ssim, toLab, type LabImage } from '../../src/studio/metrics.ts';

function lab(w: number, h: number, f: (x: number, y: number) => number): LabImage {
  const L = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) L[y * w + x] = f(x, y);
  return { width: w, height: h, L, a: new Float32Array(w * h), b: new Float32Array(w * h) };
}

describe('metrics', () => {
  it('SSIM is 1 for identical images and drops with noise or inversion', () => {
    const img = lab(32, 32, (x, y) => 0.5 + 0.3 * Math.sin(x / 3) * Math.cos(y / 4));
    expect(ssim(img.L, img.L, 32, 32)).toBeCloseTo(1, 10);
    const noisy = lab(32, 32, (x, y) => img.L[y * 32 + x] + (((x * 7 + y * 13) % 5) - 2) * 0.05);
    const inv = lab(32, 32, (x, y) => 1 - img.L[y * 32 + x]);
    const sNoisy = ssim(img.L, noisy.L, 32, 32);
    expect(sNoisy).toBeLessThan(0.99);
    expect(ssim(img.L, inv.L, 32, 32)).toBeLessThan(sNoisy);
  });

  it('box downsample is an exact area average (integer and fractional factors)', () => {
    const img = lab(6, 6, (x) => (x < 3 ? 0 : 1));
    expect(Array.from(downsample(img, 2, 2).L)).toEqual([0, 1, 0, 1]);
    // Ramp L = x; each of 4 outputs covers 1.5 source columns: [0,1.5) → (0·1 + 1·0.5)/1.5 = 1/3, etc.
    const frac = downsample(lab(6, 1, (x) => x), 4, 1).L;
    expect(frac[0]).toBeCloseTo(1 / 3, 6);
    expect(frac[1]).toBeCloseTo(5 / 3, 6);
    expect(frac[2]).toBeCloseTo(10 / 3, 6);
    expect(frac[3]).toBeCloseTo(14 / 3, 6);
  });

  it('ΔE and fidelity at a scale', () => {
    const a = lab(16, 16, () => 0.5);
    const b = lab(16, 16, () => 0.6);
    expect(meanDeltaE(a, b)).toBeCloseTo(0.1, 6);
    const f = fidelityAt(a, b, 4, 4);
    expect(f.deltaE).toBeCloseTo(0.1, 6);
    expect([f.width, f.height]).toEqual([4, 4]);
  });

  it('detail: flat cells have zero HF, textured cells are visible', () => {
    const rects = [{ x: 0, y: 0, w: 16, h: 16 }, { x: 16, y: 0, w: 16, h: 16 }];
    const img = lab(32, 16, (x, y) => (x < 16 ? 0.5 : 0.5 + ((x + y) % 2) * 0.2));
    const d = detail(img, rects);
    expect(d.flatFrac).toBe(0.5);
    expect(d.visibleFrac).toBe(0.5);
    expect(d.meanHF).toBeGreaterThan(0);
  });

  it('seam ratio is high for blocky cells and ~1 for a seamless gradient', () => {
    const ids = new Int32Array(32 * 16).map((_, i) => ((i % 32) < 16 ? 0 : 1));
    const blocky = lab(32, 16, (x, y) => (x < 16 ? 0.2 : 0.8) + ((x + y) % 2) * 0.01);
    expect(seamRatio(blocky, ids)).toBeGreaterThan(10);
    // Isotropic ramp: every neighbor difference is equal, across borders or not.
    const smooth = lab(32, 16, (x, y) => (x + y) / 64);
    expect(seamRatio(smooth, ids)).toBeCloseTo(1, 1);
  });

  it('toLab composites transparent pixels over the background', () => {
    const t = toLab(1, 1, new Uint8ClampedArray([0, 0, 0, 0]), '#ffffff');
    expect(t.L[0]).toBeCloseTo(1, 3);
  });
});
