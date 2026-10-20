import type { QuadtreeOptions } from './partition.ts';

export type SeamMode = 'hard' | 'feather' | 'grout';

export interface StudioSettings {
  seed: number;
  /** Reference Fidelity in [0, 1]. */
  fidelity: number;
  /** Fractal Detail in [0, 1]. */
  detail: number;
  partition: { kind: 'grid'; cell: number } | { kind: 'adaptive'; maxCell: number };
  /** Map edge cells through both dominant colors (otherwise every cell uses its mean color). */
  twoColor: boolean;
  seam: SeamMode;
  /** Background for transparent source pixels. */
  background: string;
}

export const DEFAULT_SETTINGS: StudioSettings = {
  seed: 1,
  fidelity: 0.5,
  detail: 0.5,
  partition: { kind: 'adaptive', maxCell: 48 },
  twoColor: true,
  seam: 'hard',
  background: '#ffffff',
};

/** Every parameter the two sliders control, in one place. */
export interface Derived {
  /** OKLab lightness amplitude of the fractal modulation (per unit z-score of s). */
  amplitude: number;
  /** Chroma modulation per unit z-score. */
  chromaMod: number;
  /** Hue modulation (radians) per unit z-score. */
  hueMod: number;
  /** Weight of the position ramp vs the fractal rank in two-color cells. */
  rampWeight: number;
  /** Half-width of the two-color transition, in rank units. */
  transition: number;
  /** Target structure-density rank for matching. */
  densityTarget: number;
  weights: { detail: number; orient: number; split: number; repeat: number; jitter: number };
  quadtree: Omit<QuadtreeOptions, 'maxCell'>;
  /** Minimum cell size (px). */
  minCell: number;
  featherPx: number;
  groutPx: number;
}

export function derive(s: StudioSettings): Derived {
  const F = Math.min(1, Math.max(0, s.fidelity));
  const D = Math.min(1, Math.max(0, s.detail));
  const thr = 1.6 - F; // higher fidelity → lower split thresholds → more subdivision
  return {
    amplitude: (0.03 + 0.15 * D) * (1 - 0.6 * F),
    chromaMod: 0.15 * D,
    hueMod: 0.1 * D,
    rampWeight: 0.35 + 0.5 * F,
    transition: 0.04,
    densityTarget: 0.15 + 0.75 * D,
    weights: { detail: 1, orient: 0.6 * (0.5 + F), split: 1.2 * (0.5 + F), repeat: 0.8, jitter: 0.02 },
    quadtree: { minCell: Math.round(8 + 8 * D), lumStd: 0.05 * thr, edge: 0.012 * thr, separation: 0.12 * thr },
    minCell: Math.round(8 + 8 * D),
    featherPx: 3,
    groutPx: 1,
  };
}
