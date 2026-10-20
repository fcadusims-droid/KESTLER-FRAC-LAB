import { describe, expect, it } from 'vitest';
import {
  complexToPixel,
  frameFromView,
  pan,
  pixelToComplex,
  screenToComplex,
  viewFromFrame,
  zoomAt,
  zoomLevel,
  type Frame,
} from '../src/core/view.ts';
import { renderTileFloat64, type FractalParams } from '../src/core/formulas/index.ts';
import { autoIterations, resolveIterations } from '../src/core/iterations.ts';
import { isBeyondFloat64Precision, relativePixelSize } from '../src/core/precision.ts';

const frame: Frame = { cx: -0.5, cy: 0.25, scale: 0.01, width: 400, height: 300 };

describe('pixel ↔ complex mapping', () => {
  it('maps pixel centers per the spec formula (y up)', () => {
    expect(pixelToComplex(frame, 0, 0)).toEqual([-0.5 + (0.5 - 200) * 0.01, 0.25 - (0.5 - 150) * 0.01]);
    const [re, im] = pixelToComplex(frame, 399, 299);
    expect(re).toBeCloseTo(-0.5 + 199.5 * 0.01, 12);
    expect(im).toBeCloseTo(0.25 - 149.5 * 0.01, 12);
  });

  it('frame center lies between the two middle pixels', () => {
    const [a] = pixelToComplex(frame, 199, 0);
    const [b] = pixelToComplex(frame, 200, 0);
    expect((a + b) / 2).toBeCloseTo(frame.cx, 14);
  });

  it('y increases upward', () => {
    expect(pixelToComplex(frame, 0, 0)[1]).toBeGreaterThan(pixelToComplex(frame, 0, 1)[1]);
  });

  it('complexToPixel inverts pixelToComplex', () => {
    for (const [px, py] of [[0, 0], [17, 230], [399, 299]]) {
      const [re, im] = pixelToComplex(frame, px, py);
      const [x, y] = complexToPixel(frame, re, im);
      expect(x).toBeCloseTo(px, 9);
      expect(y).toBeCloseTo(py, 9);
    }
  });

  it('square pixels: aspect ratio is preserved and span covers the smaller side', () => {
    const f = frameFromView({ cx: 0, cy: 0, span: 3 }, 1600, 900);
    expect(f.scale).toBeCloseTo(3 / 900, 15);
    const [l] = screenToComplex(f, 0, 0);
    const [r, t] = screenToComplex(f, 1600, 0);
    const [, b] = screenToComplex(f, 0, 900);
    expect(t - b).toBeCloseTo(3, 12);
    expect((r - l) / (t - b)).toBeCloseTo(1600 / 900, 12);
    const portrait = frameFromView({ cx: 0, cy: 0, span: 3 }, 500, 800);
    expect(portrait.scale * 500).toBeCloseTo(3, 12);
  });

  it('view ↔ frame round-trips', () => {
    const v = { cx: 0.1, cy: -0.2, span: 0.003 };
    const back = viewFromFrame(frameFromView(v, 1234, 567));
    expect(back.cx).toBe(v.cx);
    expect(back.cy).toBe(v.cy);
    expect(back.span).toBeCloseTo(v.span, 15);
  });

  it('zoomLevel is relative to the default span', () => {
    expect(zoomLevel({ cx: 0, cy: 0, span: 0.3 }, 3)).toBeCloseTo(10, 12);
  });
});

describe('zoom and pan', () => {
  it('cursor-anchored zoom keeps the anchor point fixed', () => {
    for (const [x, y, factor] of [[0, 0, 2], [123.4, 56.7, 1.1], [399.9, 299.9, 0.5], [200, 150, 10]]) {
      const before = screenToComplex(frame, x, y);
      const z = zoomAt(frame, x, y, factor);
      const after = screenToComplex(z, x, y);
      expect(after[0]).toBeCloseTo(before[0], 13);
      expect(after[1]).toBeCloseTo(before[1], 13);
      expect(z.scale).toBeCloseTo(frame.scale / factor, 15);
    }
  });

  it('zooming at the center keeps the center', () => {
    const z = zoomAt(frame, frame.width / 2, frame.height / 2, 4);
    expect(z.cx).toBeCloseTo(frame.cx, 15);
    expect(z.cy).toBeCloseTo(frame.cy, 15);
  });

  it('pan moves the image with the pointer', () => {
    const p = pan(frame, 10, -20);
    // The point that was under (100, 100) is now under (110, 80).
    const before = screenToComplex(frame, 100, 100);
    const after = screenToComplex(p, 110, 80);
    expect(after[0]).toBeCloseTo(before[0], 13);
    expect(after[1]).toBeCloseTo(before[1], 13);
    expect(p.scale).toBe(frame.scale);
  });
});

describe('tiling', () => {
  const params: FractalParams = { formula: 'mandelbrot', juliaRe: 0, juliaIm: 0, maxIter: 300, escapeRadius: 256 };
  const f: Frame = { cx: -0.745, cy: 0.11, scale: 0.0004, width: 97, height: 61 };

  function full(p: FractalParams) {
    const out = new Float32Array(f.width * f.height);
    renderTileFloat64(f, p, { x: 0, y: 0, w: f.width, h: f.height }, out);
    return out;
  }

  function tiled(p: FractalParams, tw: number, th: number) {
    const out = new Float32Array(f.width * f.height);
    for (let y = 0; y < f.height; y += th) {
      for (let x = 0; x < f.width; x += tw) {
        const w = Math.min(tw, f.width - x);
        const h = Math.min(th, f.height - y);
        const tile = new Float32Array(w * h);
        renderTileFloat64(f, p, { x, y, w, h }, tile);
        for (let r = 0; r < h; r++) out.set(tile.subarray(r * w, r * w + w), (y + r) * f.width + x);
      }
    }
    return out;
  }

  it.each([
    ['mandelbrot', 16, 16],
    ['mandelbrot', 7, 13],
    ['julia', 32, 5],
    ['burningShip', 97, 1],
  ] as const)('%s tiled %ix%i is byte-identical to a full render', (formula, tw, th) => {
    const p = { ...params, formula, juliaRe: -0.8, juliaIm: 0.156 };
    const a = full(p);
    const b = tiled(p, tw, th);
    expect(Buffer.from(b.buffer).equals(Buffer.from(a.buffer))).toBe(true);
    // Sanity: the view is not trivially uniform.
    expect(new Set(a).size).toBeGreaterThan(50);
  });
});

describe('iterations', () => {
  it('auto iterations grow with zoom and are capped', () => {
    expect(autoIterations(1)).toBe(200);
    expect(autoIterations(1e6)).toBeGreaterThan(autoIterations(1e3));
    expect(autoIterations(1e300)).toBe(20000);
  });

  it('fixed iterations are clamped to a sane range', () => {
    expect(resolveIterations({ mode: 'fixed', value: 1234 }, 1e9)).toBe(1234);
    expect(resolveIterations({ mode: 'fixed', value: 0 }, 1)).toBe(10);
    expect(resolveIterations({ mode: 'fixed', value: 1e9 }, 1)).toBe(100000);
  });
});

describe('precision diagnostic', () => {
  it('is fine at shallow zoom and warns past the float64 limit', () => {
    expect(isBeyondFloat64Precision({ cx: -0.5, cy: 0, scale: 3 / 1000 })).toBe(false);
    expect(isBeyondFloat64Precision({ cx: -0.743643887037151, cy: 0.13182590420533, scale: 1e-13 })).toBe(false);
    expect(isBeyondFloat64Precision({ cx: -0.743643887037151, cy: 0.13182590420533, scale: 1e-15 })).toBe(true);
    // Near the origin float64 resolution is very fine, so a tiny scale is still fine.
    expect(relativePixelSize({ cx: 0, cy: 0, scale: 1e-20 })).toBeGreaterThan(1);
  });

  it('beyond the limit adjacent pixels collapse to equal float64 coordinates', () => {
    const f: Frame = { cx: 1.5, cy: 0, scale: 1e-17, width: 10, height: 10 };
    expect(isBeyondFloat64Precision(f)).toBe(true);
    expect(pixelToComplex(f, 0, 0)[0]).toBe(pixelToComplex(f, 1, 0)[0]);
  });
});
