import { describe, expect, it } from 'vitest';
import { buildLibrary, calibrate, computeStats, isFlat, PROXY } from '../../src/studio/library/library.ts';
import { renderField, renderRaw, type Patch } from '../../src/studio/library/patch.ts';

describe('patch library', () => {
  const a = buildLibrary(7, 12);
  it('is deterministic per seed and differs across seeds', () => {
    const b = buildLibrary(7, 12);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    const c = buildLibrary(8, 12);
    expect(JSON.stringify(c.candidates[0].patch)).not.toBe(JSON.stringify(a.candidates[0].patch));
  });

  it('has 4 rotations per base patch, Mandelbrot and Julia, none flat', () => {
    expect(a.candidates).toHaveLength(48);
    expect(new Set(a.candidates.map((c) => c.patch.kind))).toEqual(new Set(['mandelbrot', 'julia']));
    for (const c of a.candidates) {
      expect(isFlat(c.stats)).toBe(false);
      expect(c.stats.densityRank).toBeGreaterThanOrEqual(0);
      expect(c.stats.densityRank).toBeLessThanOrEqual(1);
    }
  });

  it('rejects flat patches (far exterior, deep interior) and accepts boundary windows', () => {
    const base: Patch = { kind: 'mandelbrot', cx: 5, cy: 5, span: 0.01, rotation: 0, jr: 0, ji: 0, maxIter: 200, lo: 0, hi: 1 };
    expect(calibrate(base)).toBeNull(); // far exterior: escape values nearly constant
    expect(calibrate({ ...base, cx: 1.2, cy: 0.9, span: 0.02 })).toBeNull(); // smooth exterior
    expect(calibrate({ ...base, cx: -0.1, cy: 0, span: 0.05 })).toBeNull(); // fully interior
    const edge = calibrate({ ...base, cx: -0.7436, cy: 0.1318, span: 0.01 })!;
    expect(edge).not.toBeNull();
    const raw = renderRaw(edge, PROXY, PROXY);
    const st = computeStats(renderField(edge, PROXY, PROXY).s, PROXY, Uint8Array.from(raw, (v) => (v < 0 ? 1 : 0)));
    expect(isFlat(st)).toBe(false);
  });

  it('s is in [0, 1] and renders at any region size', () => {
    const { s } = renderField(a.candidates[0].patch, 23, 17);
    expect(s.length).toBe(23 * 17);
    expect(s.every((v) => v >= 0 && v <= 1)).toBe(true);
  });
});
