import type { Rect } from '../core/formulas/types.ts';

/** Splits width × height into tiles, ordered from the center outward. */
export function makeTiles(width: number, height: number, tileSize: number): Rect[] {
  const tiles: Rect[] = [];
  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      tiles.push({ x, y, w: Math.min(tileSize, width - x), h: Math.min(tileSize, height - y) });
    }
  }
  const cx = width / 2;
  const cy = height / 2;
  const d = (r: Rect) => (r.x + r.w / 2 - cx) ** 2 + (r.y + r.h / 2 - cy) ** 2;
  return tiles.sort((a, b) => d(a) - d(b));
}

/** Splits rows [0, height) into horizontal bands. */
export function makeBands(width: number, height: number, bandRows: number): Rect[] {
  const bands: Rect[] = [];
  for (let y = 0; y < height; y += bandRows) bands.push({ x: 0, y, w: width, h: Math.min(bandRows, height - y) });
  return bands;
}
