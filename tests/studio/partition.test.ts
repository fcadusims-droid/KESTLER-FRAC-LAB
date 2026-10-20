import { describe, expect, it } from 'vitest';
import { fixedGrid, quadtree, regionIdMap } from '../../src/studio/partition.ts';
import { createAnalyzer } from '../../src/studio/analysis/analyze.ts';
import { syntheticApple } from '../../src/studio/synthetic.ts';

describe('partition', () => {
  it.each([16, 32, 48, 64, 50])('fixed grid %i covers every pixel exactly once, incl. boundary cells', (cell) => {
    const rects = fixedGrid(200, 130, cell);
    expect(() => regionIdMap(200, 130, rects)).not.toThrow();
    expect(rects.every((r) => r.w <= cell && r.h <= cell)).toBe(true);
  });

  it('regionIdMap rejects overlaps and gaps', () => {
    expect(() => regionIdMap(4, 4, [{ x: 0, y: 0, w: 4, h: 4 }, { x: 3, y: 3, w: 1, h: 1 }])).toThrow(/overlap/);
    expect(() => regionIdMap(4, 4, [{ x: 0, y: 0, w: 4, h: 3 }])).toThrow(/not covered/);
  });

  it('quadtree covers exactly, respects min/max and refines near edges', () => {
    const img = syntheticApple(192);
    const { describe } = createAnalyzer(img, { outWidth: 192, outHeight: 192, background: '#ffffff' });
    const rects = quadtree(192, 192, describe, { maxCell: 48, minCell: 12, lumStd: 0.04, edge: 0.01, separation: 0.1 });
    expect(() => regionIdMap(192, 192, rects)).not.toThrow();
    expect(rects.every((r) => r.w <= 48 && r.h <= 48 && r.w >= 12 && r.h >= 12)).toBe(true);
    const sizes = new Set(rects.map((r) => r.w));
    expect(sizes.size).toBeGreaterThan(1);
    // A huge threshold never splits; a zero threshold splits down to the minimum.
    expect(quadtree(192, 192, describe, { maxCell: 48, minCell: 12, lumStd: 9, edge: 9, separation: 9 })).toHaveLength(16);
    expect(quadtree(192, 192, describe, { maxCell: 48, minCell: 12, lumStd: -1, edge: -1, separation: -1 })).toHaveLength(256);
  });
});
