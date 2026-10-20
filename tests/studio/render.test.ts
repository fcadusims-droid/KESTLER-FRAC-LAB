import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyze } from '../../src/studio/analysis/analyze.ts';
import { buildLibrary } from '../../src/studio/library/library.ts';
import { fixedGrid, quadtree } from '../../src/studio/partition.ts';
import { createAnalyzer } from '../../src/studio/analysis/analyze.ts';
import { render, StudioRenderer } from '../../src/studio/render.ts';
import { matchRegions, scoreTerms } from '../../src/studio/match.ts';
import { DEFAULT_SETTINGS, derive, type StudioSettings } from '../../src/studio/settings.ts';
import { syntheticApple } from '../../src/studio/synthetic.ts';
import { srgb8ToOklab, deltaE, type Lab } from '../../src/studio/oklab.ts';
import { encodeRgbaPng } from '../../src/export/encodeImage.ts';
import { decode } from 'fast-png';
import type { RegionDescriptor, RgbaImage } from '../../src/studio/types.ts';

const lib = buildLibrary(3, 16);
const W = 96;
const H = 96;
const src = syntheticApple(W);
const settings = (p: Partial<StudioSettings> = {}): StudioSettings => ({ ...DEFAULT_SETTINGS, partition: { kind: 'grid', cell: 16 }, ...p });
const opts = { outWidth: W, outHeight: H, background: '#ffffff' };

describe('information boundary', () => {
  it('render-side modules never import the analysis module or source images', () => {
    for (const f of ['render.ts', 'colormap.ts', 'match.ts', 'library/library.ts', 'library/patch.ts']) {
      const code = readFileSync(new URL(`../../src/studio/${f}`, import.meta.url), 'utf8');
      expect(code).not.toMatch(/analysis\/|synthetic|RgbaImage/);
    }
  });

  it('two different source images with identical descriptors give byte-identical output', () => {
    // B = A with one pixel nudged by 1 inside a flat background cell: quantized descriptors don't change.
    const a = syntheticApple(W);
    const b: RgbaImage = { ...a, data: Uint8ClampedArray.from(a.data) };
    const i = (2 * W + 2) * 4;
    b.data[i] = b.data[i] + 1;
    expect(Buffer.from(b.data).equals(Buffer.from(a.data))).toBe(false);
    const rects = fixedGrid(W, H, 16);
    const da = analyze(a, rects, opts);
    const db = analyze(b, rects, opts);
    expect(JSON.stringify(db)).toBe(JSON.stringify(da));
    const ra = render(da, settings(), lib, W, H).rgba;
    const rb = render(db, settings(), lib, W, H).rgba;
    expect(Buffer.from(rb).equals(Buffer.from(ra))).toBe(true);
  });

  it('render does not keep a reference to the source: wiping the source changes nothing', () => {
    const img = syntheticApple(W);
    const d = analyze(img, fixedGrid(W, H, 16), opts);
    const before = render(d, settings(), lib, W, H).rgba;
    img.data.fill(0);
    expect(Buffer.from(render(d, settings(), lib, W, H).rgba).equals(Buffer.from(before))).toBe(true);
  });
});

describe('render', () => {
  const desc = analyze(src, fixedGrid(W, H, 16), opts);

  it('produces the right size and a PNG that decodes', () => {
    const r = render(desc, settings(), lib, W, H);
    expect(r.rgba.length).toBe(W * H * 4);
    const img = decode(encodeRgbaPng(W, H, r.rgba));
    expect([img.width, img.height]).toEqual([W, H]);
  });

  it.each(['hard', 'feather', 'grout'] as const)('tiled and untiled renders are identical (%s seams)', (seam) => {
    const s = settings({ seam });
    const full = new StudioRenderer(desc, s, lib, W, H).render();
    const tiled = new StudioRenderer(desc, s, lib, W, H);
    const out = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y += 13) {
      for (let x = 0; x < W; x += 29) {
        const rect = { x, y, w: Math.min(29, W - x), h: Math.min(13, H - y) };
        const part = tiled.render(rect);
        for (let r = 0; r < rect.h; r++) out.set(part.subarray(r * rect.w * 4, (r + 1) * rect.w * 4), ((y + r) * W + x) * 4);
      }
    }
    expect(Buffer.from(out).equals(Buffer.from(full))).toBe(true);
  });

  it('works on an adaptive partition', () => {
    const { describe: describeRect } = createAnalyzer(src, opts);
    const rects = quadtree(W, H, describeRect, { maxCell: 48, ...derive(settings()).quadtree });
    const d = analyze(src, rects, opts);
    expect(render(d, settings({ partition: { kind: 'adaptive', maxCell: 48 } }), lib, W, H).rgba.length).toBe(W * H * 4);
  });
});

function regionLabStats(rgba: Uint8ClampedArray, d: RegionDescriptor) {
  const px: Lab[] = [];
  for (let y = d.rect.y; y < d.rect.y + d.rect.h; y++) {
    for (let x = d.rect.x; x < d.rect.x + d.rect.w; x++) {
      const o = (y * W + x) * 4;
      px.push(srgb8ToOklab(rgba[o], rgba[o + 1], rgba[o + 2]));
    }
  }
  const mean: Lab = [0, 1, 2].map((k) => px.reduce((a, p) => a + p[k], 0) / px.length) as Lab;
  const std = Math.sqrt(px.reduce((a, p) => a + (p[0] - mean[0]) ** 2, 0) / px.length);
  return { mean, std };
}

describe('color mapping', () => {
  const desc = analyze(src, fixedGrid(W, H, 16), opts);
  it.each([false, true])('no flat regions and region means close to the target (twoColor=%s)', (twoColor) => {
    const r = render(desc, settings({ twoColor, detail: 0.5 }), lib, W, H).rgba;
    for (const d of desc) {
      const st = regionLabStats(r, d);
      expect(st.std).toBeGreaterThan(0.002);
      expect(deltaE(st.mean, d.mean)).toBeLessThan(0.05);
    }
  });
});

describe('matching', () => {
  const desc = analyze(src, fixedGrid(W, H, 16), opts);
  it('is deterministic for a seed and changes with the seed', () => {
    const dv = derive(settings());
    expect(matchRegions(desc, lib, dv, 1)).toEqual(matchRegions(desc, lib, dv, 1));
    expect(matchRegions(desc, lib, dv, 1)).not.toEqual(matchRegions(desc, lib, dv, 2));
  });

  it('scores change when descriptors change', () => {
    const d = desc.find((x) => x.colors.length === 2)!;
    const c = lib.candidates[0];
    const t1 = scoreTerms(d, c, 0.5, 0);
    const t2 = scoreTerms({ ...d, gradDir: d.gradDir + Math.PI / 2, edge: d.edge * 3 }, c, 0.5, 0);
    expect(t2).not.toEqual(t1);
    expect(scoreTerms(d, c, 0.9, 0).detail).not.toBe(t1.detail);
  });
});
