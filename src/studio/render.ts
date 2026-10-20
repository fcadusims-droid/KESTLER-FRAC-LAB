/**
 * Renderer. Inputs: region descriptors, settings and the (structure-only) patch
 * library. It cannot reach the source image: nothing here imports the analysis
 * module or accepts an image buffer.
 */
import type { Library } from './library/library.ts';
import { renderField } from './library/patch.ts';
import { matchRegions } from './match.ts';
import { oklabToSrgb8, type Lab } from './oklab.ts';
import { regionIdMap } from './partition.ts';
import { RegionColorMap } from './colormap.ts';
import { derive, type StudioSettings } from './settings.ts';
import type { Rect, RegionDescriptor } from './types.ts';

export interface RenderResult {
  /** RGBA for `rect` (or the whole output), row-major. */
  rgba: Uint8ClampedArray;
  rect: Rect;
  /** Selected candidate index per region. */
  selection: number[];
  /** Approximate fractal iterations spent on the regions that were rendered. */
  iterations: number;
  ms: number;
}

interface Prepared {
  s: Float32Array;
  map: RegionColorMap;
}

/** Plans the image (matching) and lazily prepares regions; shared by full and tiled renders. */
export class StudioRenderer {
  readonly width: number;
  readonly height: number;
  readonly selection: number[];
  private readonly descriptors: RegionDescriptor[];
  private readonly settings: StudioSettings;
  private readonly lib: Library;
  private readonly ids: Int32Array;
  private readonly cache = new Map<number, Prepared>();
  iterations = 0;

  constructor(descriptors: RegionDescriptor[], settings: StudioSettings, lib: Library, width: number, height: number) {
    this.descriptors = descriptors;
    this.settings = settings;
    this.lib = lib;
    this.width = width;
    this.height = height;
    this.ids = regionIdMap(width, height, descriptors.map((d) => d.rect));
    this.selection = matchRegions(descriptors, lib, derive(settings), settings.seed);
  }

  private prepared(id: number): Prepared {
    let p = this.cache.get(id);
    if (!p) {
      const d = this.descriptors[id];
      const field = renderField(this.lib.candidates[this.selection[id]].patch, d.rect.w, d.rect.h);
      this.iterations += field.iterations;
      p = { s: field.s, map: new RegionColorMap(d, field.s, derive(this.settings), this.settings.twoColor) };
      this.cache.set(id, p);
    }
    return p;
  }

  /** OKLab color of global pixel (gx, gy), including seam treatment. */
  private pixel(gx: number, gy: number): Lab {
    const id = this.ids[gy * this.width + gx];
    const r = this.descriptors[id].rect;
    const own = this.prepared(id);
    const s = own.s[(gy - r.y) * r.w + (gx - r.x)];
    const c = own.map.colorAt(s, gx, gy);
    const mode = this.settings.seam;
    if (mode === 'grout') {
      const g = derive(this.settings).groutPx;
      if (gx - r.x >= r.w - g || gy - r.y >= r.h - g) c[0] *= 0.45;
      return c;
    }
    if (mode === 'feather') {
      // Blend only the color mapping of neighbors, applied to this pixel's own s.
      const F = derive(this.settings).featherPx;
      // [distance to the side, a pixel just across it (x, y)]
      const sides: [number, number, number][] = [
        [gx - r.x, r.x - 1, gy],
        [r.x + r.w - 1 - gx, r.x + r.w, gy],
        [gy - r.y, gx, r.y - 1],
        [r.y + r.h - 1 - gy, gx, r.y + r.h],
      ];
      let wOwn = 1;
      const acc: Lab = [0, 0, 0];
      for (const [dist, nx, ny] of sides) {
        if (dist >= F || nx < 0 || ny < 0 || nx >= this.width || ny >= this.height) continue;
        const nid = this.ids[ny * this.width + nx];
        const wN = 0.5 * (1 - (dist + 0.5) / F);
        const nc = this.prepared(nid).map.colorAt(s, gx, gy);
        acc[0] += wN * nc[0];
        acc[1] += wN * nc[1];
        acc[2] += wN * nc[2];
        wOwn -= wN;
      }
      return [wOwn * c[0] + acc[0], wOwn * c[1] + acc[1], wOwn * c[2] + acc[2]];
    }
    return c;
  }

  /** Renders `rect` (default: the whole output). Any tiling gives identical bytes. */
  render(rect: Rect = { x: 0, y: 0, w: this.width, h: this.height }): Uint8ClampedArray {
    const out = new Uint8ClampedArray(rect.w * rect.h * 4);
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const c = this.pixel(rect.x + x, rect.y + y);
        const o = (y * rect.w + x) * 4;
        oklabToSrgb8(c[0], c[1], c[2], out, o);
        out[o + 3] = 255;
      }
    }
    return out;
  }
}

/** render(descriptors, settings) → output pixels. */
export function render(descriptors: RegionDescriptor[], settings: StudioSettings, lib: Library, width: number, height: number, rect?: Rect): RenderResult {
  const t0 = performance.now();
  const r = new StudioRenderer(descriptors, settings, lib, width, height);
  const full = rect ?? { x: 0, y: 0, w: width, h: height };
  const rgba = r.render(full);
  return { rgba, rect: full, selection: r.selection, iterations: r.iterations, ms: performance.now() - t0 };
}
