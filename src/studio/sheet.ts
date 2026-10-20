import type { RgbaImage } from './types.ts';

/** 5×7 bitmap glyphs (rows top→bottom, 5 bits each, MSB = left). */
const GLYPHS: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12], ' ': [0, 0, 0, 0, 0, 0, 0], '-': [0, 0, 0, 31, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12], ':': [0, 12, 12, 0, 12, 12, 0], '/': [1, 1, 2, 4, 8, 16, 16],
  '=': [0, 0, 31, 0, 31, 0, 0], '%': [24, 25, 2, 4, 8, 19, 3], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
};

export class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number, bg: [number, number, number] = [24, 26, 32]) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) this.data.set([bg[0], bg[1], bg[2], 255], i * 4);
  }

  /** Draws `img` scaled to w×h: box-filter down (factor ≥ 1) or nearest-neighbor up. */
  blit(img: RgbaImage, dx: number, dy: number, w: number, h: number, src = { x: 0, y: 0, w: img.width, h: img.height }): void {
    const fx = src.w / w;
    const fy = src.h / h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, n = 0;
        if (fx <= 1 && fy <= 1) {
          const sx = src.x + Math.floor(x * fx);
          const sy = src.y + Math.floor(y * fy);
          const o = (sy * img.width + sx) * 4;
          [r, g, b, n] = [img.data[o], img.data[o + 1], img.data[o + 2], 1];
        } else {
          for (let j = Math.floor(y * fy); j < Math.floor((y + 1) * fy); j++) {
            for (let i = Math.floor(x * fx); i < Math.floor((x + 1) * fx); i++) {
              const o = ((src.y + j) * img.width + src.x + i) * 4;
              r += img.data[o];
              g += img.data[o + 1];
              b += img.data[o + 2];
              n++;
            }
          }
        }
        const p = ((dy + y) * this.width + dx + x) * 4;
        this.data[p] = r / n;
        this.data[p + 1] = g / n;
        this.data[p + 2] = b / n;
      }
    }
  }

  text(s: string, x: number, y: number, scale = 2, color: [number, number, number] = [235, 235, 235]): void {
    let cx = x;
    for (const ch of s.toUpperCase()) {
      const g = GLYPHS[ch] ?? GLYPHS[' '];
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (!((g[row] >> (4 - col)) & 1)) continue;
          for (let j = 0; j < scale; j++) for (let i = 0; i < scale; i++) {
            const px = cx + col * scale + i;
            const py = y + row * scale + j;
            if (px < this.width && py < this.height) this.data.set(color, (py * this.width + px) * 4);
          }
        }
      }
      cx += 6 * scale;
    }
  }

  rect(x: number, y: number, w: number, h: number, color: [number, number, number]): void {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (i >= 0 && j >= 0 && i < this.width && j < this.height) this.data.set(color, (j * this.width + i) * 4);
    }
  }

  toImage(): RgbaImage {
    return { width: this.width, height: this.height, data: this.data };
  }
}

export interface SheetColumn {
  label: string;
  image: RgbaImage;
}

/**
 * Comparison sheet: row 1 each column at `cell`×`cell`; row 2 the same box-downsampled to
 * `distant` px (as seen from a distance); row 3 a 4× nearest-neighbor crop of `crop`.
 */
export function comparisonSheet(cols: SheetColumn[], crop: { x: number; y: number; size: number }, cell = 256, distant = 64): RgbaImage {
  const pad = 10;
  const labelH = 22;
  const rowH = [cell, distant, crop.size * 4];
  const width = pad + cols.length * (Math.max(cell, crop.size * 4) + pad);
  const height = pad + labelH + rowH.reduce((a, b) => a + b + pad + 18, 0);
  const cv = new Canvas(width, height);
  cols.forEach((c, i) => {
    const x = pad + i * (Math.max(cell, crop.size * 4) + pad);
    let y = pad;
    cv.text(c.label, x, y);
    y += labelH;
    cv.blit(c.image, x, y, cell, cell);
    if (i === 0) {
      // Mark the crop area on the target.
      const k = cell / c.image.width;
      const [rx, ry, rs] = [x + Math.round(crop.x * k), y + Math.round(crop.y * k), Math.round(crop.size * k)];
      cv.rect(rx, ry, rs, 1, [255, 0, 255]);
      cv.rect(rx, ry + rs - 1, rs, 1, [255, 0, 255]);
      cv.rect(rx, ry, 1, rs, [255, 0, 255]);
      cv.rect(rx + rs - 1, ry, 1, rs, [255, 0, 255]);
    }
    y += cell + pad;
    cv.text(i === 0 ? `DISTANT ${distant}PX` : '', x, y, 1);
    y += 18;
    cv.blit(c.image, x, y, distant, distant);
    y += distant + pad;
    cv.text(i === 0 ? 'CROP 4X NEAREST' : '', x, y, 1);
    y += 18;
    cv.blit(c.image, x, y, crop.size * 4, crop.size * 4, { x: crop.x, y: crop.y, w: crop.size, h: crop.size });
  });
  return cv.toImage();
}
