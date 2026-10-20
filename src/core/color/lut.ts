import { hexToRgb } from './hex.ts';
import type { ColorSettings, ColorStop, Palette } from './types.ts';

export const LUT_SIZE = 2048;

/** A baked color lookup table: LUT_SIZE RGB triples plus the interior color. */
export interface ColorLut {
  rgb: Uint8Array;
  interior: [number, number, number];
  cycleLength: number;
  offset: number;
}

function sortedStops(stops: ColorStop[]): SortedStop[] {
  return [...stops]
    .sort((a, b) => a.pos - b.pos)
    .map((s) => ({ pos: Math.min(1, Math.max(0, s.pos)), rgb: hexToRgb(s.color) }));
}

/** Samples the cyclic gradient at t ∈ [0, 1); returns channels in [0, 1]. */
export function sampleGradient(stops: ColorStop[], t: number): [number, number, number] {
  const s = sortedStops(stops);
  if (s.length === 0) return [0, 0, 0];
  if (s.length === 1) return [s[0].rgb[0] / 255, s[0].rgb[1] / 255, s[0].rgb[2] / 255];
  return sampleSorted(s, t);
}

type SortedStop = { pos: number; rgb: [number, number, number] };

function sampleSorted(s: SortedStop[], t: number): [number, number, number] {
  // Segment [a, b] containing t; the gradient wraps from the last stop to the first (+1).
  const i = s.findIndex((stop) => stop.pos > t);
  const last = s[s.length - 1];
  let a: SortedStop, b: SortedStop, aPos: number, bPos: number;
  if (i === -1) {
    [a, aPos, b, bPos] = [last, last.pos, s[0], s[0].pos + 1];
  } else if (i === 0) {
    [a, aPos, b, bPos] = [last, last.pos - 1, s[0], s[0].pos];
  } else {
    [a, aPos, b, bPos] = [s[i - 1], s[i - 1].pos, s[i], s[i].pos];
  }
  const f = bPos > aPos ? (t - aPos) / (bPos - aPos) : 0;
  return [0, 1, 2].map((k) => (a.rgb[k] + (b.rgb[k] - a.rgb[k]) * f) / 255) as [number, number, number];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let rgb: [number, number, number];
  if (hp < 1) rgb = [c, x, 0];
  else if (hp < 2) rgb = [x, c, 0];
  else if (hp < 3) rgb = [0, c, x];
  else if (hp < 4) rgb = [0, x, c];
  else if (hp < 5) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  const m = l - c / 2;
  return [rgb[0] + m, rgb[1] + m, rgb[2] + m];
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Applies hue shift, saturation, contrast, brightness, gamma and invert to one color. */
export function adjustColor(rgb: [number, number, number], st: ColorSettings): [number, number, number] {
  let [r, g, b] = rgb;
  if (st.hueShift !== 0 || st.saturation !== 1) {
    const [h, s, l] = rgbToHsl(r, g, b);
    [r, g, b] = hslToRgb(h + st.hueShift, clamp01(s * st.saturation), l);
  }
  const out = [r, g, b].map((c) => {
    let v = (c - 0.5) * st.contrast + 0.5 + st.brightness;
    v = clamp01(v);
    if (st.gamma !== 1) v = Math.pow(v, 1 / st.gamma);
    return st.invert ? 1 - v : v;
  });
  return out as [number, number, number];
}

export function buildLut(palette: Palette, settings: ColorSettings): ColorLut {
  const rgb = new Uint8Array(LUT_SIZE * 3);
  const s = sortedStops(palette.stops);
  for (let i = 0; i < LUT_SIZE; i++) {
    const base: [number, number, number] =
      s.length === 0 ? [0, 0, 0] : s.length === 1 ? [s[0].rgb[0] / 255, s[0].rgb[1] / 255, s[0].rgb[2] / 255] : sampleSorted(s, i / LUT_SIZE);
    const c = adjustColor(base, settings);
    rgb[i * 3] = Math.round(c[0] * 255);
    rgb[i * 3 + 1] = Math.round(c[1] * 255);
    rgb[i * 3 + 2] = Math.round(c[2] * 255);
  }
  return { rgb, interior: hexToRgb(settings.interior), cycleLength: settings.cycleLength, offset: settings.offset };
}
