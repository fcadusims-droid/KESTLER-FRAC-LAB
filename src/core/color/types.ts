export interface ColorStop {
  /** Position in [0, 1]. The gradient is cyclic: after the last stop it blends back to the first. */
  pos: number;
  /** '#rrggbb' */
  color: string;
}

export interface Palette {
  name: string;
  stops: ColorStop[];
}

export interface ColorSettings {
  /** Shift along the palette, in fractions of one cycle [0, 1). */
  offset: number;
  /** Smooth-iteration units per full palette cycle (repetition length). */
  cycleLength: number;
  /** Output gamma (1 = unchanged, >1 brightens midtones). */
  gamma: number;
  /** Added to every channel, in [-1, 1]. */
  brightness: number;
  /** Multiplier around mid-grey, 1 = unchanged. */
  contrast: number;
  /** Hue rotation in degrees. */
  hueShift: number;
  /** Saturation multiplier, 1 = unchanged. */
  saturation: number;
  invert: boolean;
  /** '#rrggbb' for points that never escaped. Not affected by adjustments. */
  interior: string;
}

export const DEFAULT_COLOR_SETTINGS: ColorSettings = {
  offset: 0,
  cycleLength: 48,
  gamma: 1,
  brightness: 0,
  contrast: 1,
  hueShift: 0,
  saturation: 1,
  invert: false,
  interior: '#000000',
};

export const COLOR_LIMITS = {
  offset: [0, 1],
  cycleLength: [1, 10000],
  gamma: [0.1, 5],
  brightness: [-1, 1],
  contrast: [0, 4],
  hueShift: [-180, 180],
  saturation: [0, 4],
} as const satisfies Record<string, readonly [number, number]>;
