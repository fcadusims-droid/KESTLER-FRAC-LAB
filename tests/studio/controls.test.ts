import { describe, expect, it } from 'vitest';
import { analyze, createAnalyzer } from '../../src/studio/analysis/analyze.ts';
import { buildLibrary } from '../../src/studio/library/library.ts';
import { fixedGrid, quadtree } from '../../src/studio/partition.ts';
import { render } from '../../src/studio/render.ts';
import { DEFAULT_SETTINGS, derive, type StudioSettings } from '../../src/studio/settings.ts';
import { syntheticApple } from '../../src/studio/synthetic.ts';
import { detail, fidelityAt, toLab } from '../../src/studio/metrics.ts';

const N = 192;
const src = syntheticApple(N);
const lib = buildLibrary(5, 24);
const opts = { outWidth: N, outHeight: N, background: '#ffffff' };
const target = toLab(N, N, src.data);

function run(p: Partial<StudioSettings>) {
  const s: StudioSettings = { ...DEFAULT_SETTINGS, ...p };
  const dv = derive(s);
  const rects =
    s.partition.kind === 'grid'
      ? fixedGrid(N, N, s.partition.cell)
      : quadtree(N, N, createAnalyzer(src, opts).describe, { maxCell: s.partition.maxCell, ...dv.quadtree });
  const out = toLab(N, N, render(analyze(src, rects, opts), s, lib, N, N).rgba);
  return { rects, dE: fidelityAt(out, target, 32, 32).deltaE, hf: detail(out, rects).meanHF, dv };
}

describe('controls have real effects', () => {
  const grid = { partition: { kind: 'grid', cell: 16 } } as const;

  it('Reference Fidelity: lower amplitude, more ramp weight, higher matching weights, more subdivision, lower ΔE', () => {
    const lo = run({ ...grid, fidelity: 0.1 });
    const hi = run({ ...grid, fidelity: 0.9 });
    expect(hi.dv.amplitude).toBeLessThan(lo.dv.amplitude);
    expect(hi.dv.rampWeight).toBeGreaterThan(lo.dv.rampWeight);
    expect(hi.dv.weights.split).toBeGreaterThan(lo.dv.weights.split);
    expect(hi.dv.weights.orient).toBeGreaterThan(lo.dv.weights.orient);
    expect(hi.dv.quadtree.lumStd).toBeLessThan(lo.dv.quadtree.lumStd);
    expect(hi.dE).toBeLessThan(lo.dE);
    const adaptive = { partition: { kind: 'adaptive', maxCell: 48 } } as const;
    expect(run({ ...adaptive, fidelity: 0.9 }).rects.length).toBeGreaterThan(run({ ...adaptive, fidelity: 0.1 }).rects.length);
  });

  it('Fractal Detail: higher amplitude, density target and min cell; more high-frequency energy', () => {
    const lo = run({ ...grid, detail: 0.1 });
    const hi = run({ ...grid, detail: 0.9 });
    expect(hi.dv.amplitude).toBeGreaterThan(lo.dv.amplitude);
    expect(hi.dv.densityTarget).toBeGreaterThan(lo.dv.densityTarget);
    expect(hi.dv.minCell).toBeGreaterThan(lo.dv.minCell);
    expect(hi.hf).toBeGreaterThan(lo.hf);
  });
});
