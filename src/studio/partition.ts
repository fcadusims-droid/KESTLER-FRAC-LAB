import { deltaE } from './oklab.ts';
import type { Rect, RegionDescriptor } from './types.ts';

/** Fixed grid of `cell`-sized squares; the last row/column may be smaller. */
export function fixedGrid(width: number, height: number, cell: number): Rect[] {
  const out: Rect[] = [];
  for (let y = 0; y < height; y += cell) {
    for (let x = 0; x < width; x += cell) out.push({ x, y, w: Math.min(cell, width - x), h: Math.min(cell, height - y) });
  }
  return out;
}

export interface QuadtreeOptions {
  /** Root cell size (cells never exceed this). */
  maxCell: number;
  /** Cells are not split if a child side would be smaller than this. */
  minCell: number;
  /** Split when sqrt(lumVar) exceeds this (OKLab L units). */
  lumStd: number;
  /** Split when mean edge strength exceeds this (ΔE_OK per output px). */
  edge: number;
  /** Split when 2-color separation ΔE·2·sqrt(p1·p2) exceeds this. */
  separation: number;
}

/** Two-color separation of a descriptor: ΔE between the clusters, weighted by balance. */
export function separation(d: RegionDescriptor): number {
  if (d.colors.length < 2) return 0;
  return deltaE(d.colors[0].lab, d.colors[1].lab) * 2 * Math.sqrt(d.colors[0].weight * d.colors[1].weight);
}

export function shouldSplit(d: RegionDescriptor, o: QuadtreeOptions): boolean {
  return Math.sqrt(d.lumVar) > o.lumStd || d.edge > o.edge || separation(d) > o.separation;
}

/**
 * Quadtree partition. `describe` comes from the analysis module; this code only
 * sees descriptors, never pixels. Cells split into 4 (sizes rounded so the
 * children tile the parent exactly) while a criterion fires and children stay ≥ minCell.
 */
export function quadtree(width: number, height: number, describe: (r: Rect) => RegionDescriptor, o: QuadtreeOptions): Rect[] {
  const out: Rect[] = [];
  const visit = (r: Rect) => {
    const hw = Math.floor(r.w / 2);
    const hh = Math.floor(r.h / 2);
    const canSplit = hw >= o.minCell && hh >= o.minCell;
    if (canSplit && shouldSplit(describe(r), o)) {
      visit({ x: r.x, y: r.y, w: hw, h: hh });
      visit({ x: r.x + hw, y: r.y, w: r.w - hw, h: hh });
      visit({ x: r.x, y: r.y + hh, w: hw, h: r.h - hh });
      visit({ x: r.x + hw, y: r.y + hh, w: r.w - hw, h: r.h - hh });
    } else {
      out.push(r);
    }
  };
  for (const root of fixedGrid(width, height, o.maxCell)) visit(root);
  return out;
}

/** Region index per output pixel; throws if the partition overlaps or leaves gaps. */
export function regionIdMap(width: number, height: number, rects: Rect[]): Int32Array {
  const map = new Int32Array(width * height).fill(-1);
  rects.forEach((r, id) => {
    if (r.w <= 0 || r.h <= 0 || r.x < 0 || r.y < 0 || r.x + r.w > width || r.y + r.h > height) throw new Error(`Region ${id} out of bounds`);
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const i = y * width + x;
        if (map[i] !== -1) throw new Error(`Regions ${map[i]} and ${id} overlap at (${x}, ${y})`);
        map[i] = id;
      }
    }
  });
  const gap = map.indexOf(-1);
  if (gap !== -1) throw new Error(`Pixel (${gap % width}, ${Math.floor(gap / width)}) is not covered`);
  return map;
}
