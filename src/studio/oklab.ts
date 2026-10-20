/** sRGB ↔ OKLab (Björn Ottosson, 2020). Channels: sRGB in [0, 1], L in [0, 1]. */

export type Lab = [number, number, number];

export function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/** Linear-light RGB → OKLab. */
export function linearRgbToOklab(r: number, g: number, b: number): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → linear-light RGB (may be out of [0, 1]). */
export function oklabToLinearRgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export function srgb8ToOklab(r: number, g: number, b: number): Lab {
  return linearRgbToOklab(srgbToLinear(r / 255), srgbToLinear(g / 255), srgbToLinear(b / 255));
}

const inGamut = (c: [number, number, number]) => c.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/**
 * OKLab → 8-bit sRGB, mapping out-of-gamut colors by reducing chroma at constant
 * lightness (binary search), then clamping L to [0, 1].
 */
export function oklabToSrgb8(L: number, a: number, b: number, out: Uint8Array | Uint8ClampedArray, o: number): void {
  L = L < 0 ? 0 : L > 1 ? 1 : L;
  let rgb = oklabToLinearRgb(L, a, b);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinearRgb(L, a * mid, b * mid))) lo = mid;
      else hi = mid;
    }
    rgb = oklabToLinearRgb(L, a * lo, b * lo);
  }
  for (let k = 0; k < 3; k++) {
    const v = linearToSrgb(Math.min(1, Math.max(0, rgb[k])));
    out[o + k] = Math.round(v * 255);
  }
}

/** Euclidean distance in OKLab (ΔE_OK). */
export function deltaE(p: Lab, q: Lab): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

export function hexToLab(hex: string): Lab {
  const n = parseInt(hex.slice(1), 16);
  return srgb8ToOklab((n >> 16) & 255, (n >> 8) & 255, n & 255);
}
