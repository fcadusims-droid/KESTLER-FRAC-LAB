import type { RgbaImage } from './types.ts';

/** Deterministic synthetic test targets, drawn analytically with 4×4 supersampling. */

type RGBA = [number, number, number, number];
type Paint = (x: number, y: number) => RGBA;

function rasterize(width: number, height: number, paint: Paint, ss = 4): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = paint(px + (sx + 0.5) / ss, py + (sy + 0.5) / ss);
          // Premultiplied accumulation so transparent samples don't darken edges.
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      }
      const o = (py * width + px) * 4;
      data[o] = a > 0 ? r / a : 0;
      data[o + 1] = a > 0 ? g / a : 0;
      data[o + 2] = a > 0 ? b / a : 0;
      data[o + 3] = (a / (ss * ss)) * 255;
    }
  }
  return { width, height, data };
}

const mix = (p: number[], q: number[], t: number) => p.map((v, i) => v + (q[i] - v) * t);

function inEllipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, rot: number): number {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dx = x - cx;
  const dy = y - cy;
  const u = (dx * c + dy * s) / rx;
  const v = (-dx * s + dy * c) / ry;
  return u * u + v * v; // < 1 inside
}

function inRotRect(x: number, y: number, cx: number, cy: number, w: number, h: number, rot: number): boolean {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dx = x - cx;
  const dy = y - cy;
  return Math.abs(dx * c + dy * s) <= w / 2 && Math.abs(-dx * s + dy * c) <= h / 2;
}

/** Apple geometry scaled to a size×size canvas (designed at 768). */
function applePainter(size: number, transparentBackground: boolean): Paint {
  const k = size / 768;
  return (x0, y0) => {
    const x = x0 / k;
    const y = y0 / k;
    let col: number[];
    let alpha = 1;
    if (transparentBackground) {
      col = [0, 0, 0];
      alpha = 0;
    } else {
      col = mix([207, 227, 240], [150, 186, 212], y / 768);
      // Soft cast shadow below the apple.
      const sh = inEllipse(x, y, 395, 655, 235, 48, 0);
      if (sh < 1.6) col = mix(col, [90, 110, 130], 0.55 * Math.min(1, (1.6 - sh) / 0.6));
    }
    // Body: union of two circles with a dip at the top.
    const d1 = Math.hypot(x - 322, y - 435) / 205;
    const d2 = Math.hypot(x - 452, y - 435) / 205;
    const dip = Math.hypot(x - 387, y - 225) / 46;
    const inBody = (d1 < 1 || d2 < 1) && dip > 1 && y < 650;
    if (inBody) {
      const nx = (x - 387) / 260;
      const ny = (y - 435) / 230;
      const light = Math.max(0, Math.min(1, 0.55 - 0.45 * (nx * 0.55 + ny * 0.85)));
      col = mix([95, 8, 18], [214, 38, 40], light);
      // Specular highlight.
      const hl = inEllipse(x, y, 280, 335, 50, 28, -0.6);
      if (hl < 1) col = mix(col, [255, 236, 236], 0.8 * (1 - hl));
      alpha = 1;
    }
    // Stem (brown) and leaf (green with a darker midrib).
    if (inRotRect(x, y, 393, 205, 17, 100, 0.2)) {
      col = [104, 64, 28];
      alpha = 1;
    }
    const leaf = inEllipse(x, y, 475, 188, 78, 32, -0.45);
    if (leaf < 1) {
      col = mix([46, 128, 40], [96, 180, 70], Math.max(0, Math.min(1, (y - 160) / 60)));
      if (inRotRect(x, y, 475, 188, 150, 4, -0.45)) col = [28, 88, 26];
      alpha = 1;
    }
    return [col[0], col[1], col[2], alpha];
  };
}

export function syntheticApple(size = 768): RgbaImage {
  return rasterize(size, size, applePainter(size, false));
}

export function syntheticAppleTransparent(size = 768): RgbaImage {
  return rasterize(size, size, applePainter(size, true));
}

/** Dark five-point star on yellow, plus a black/white checker block (sharp edges). */
export function syntheticStar(size = 768): RgbaImage {
  const k = size / 768;
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 300 : 125;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([420 + r * Math.cos(a), 440 + r * Math.sin(a)]);
  }
  const inPoly = (x: number, y: number) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  return rasterize(size, size, (x0, y0) => {
    const x = x0 / k;
    const y = y0 / k;
    if (x < 192 && y < 192) return (Math.floor(x / 48) + Math.floor(y / 48)) % 2 === 0 ? [15, 15, 15, 1] : [245, 245, 245, 1];
    if (inPoly(x, y)) return [24, 34, 96, 1];
    return [250, 214, 40, 1];
  });
}
