import type { FormulaId, FractalParams } from '../core/formulas/types.ts';
import { FORMULAS } from '../core/formulas/catalog.ts';
import type { IterationSetting } from '../core/iterations.ts';
import { resolveIterations } from '../core/iterations.ts';
import type { View } from '../core/view.ts';
import { zoomLevel } from '../core/view.ts';
import type { ColorSettings, Palette } from '../core/color/types.ts';
import { DEFAULT_COLOR_SETTINGS } from '../core/color/types.ts';
import { DEFAULT_PALETTE, clonePalette } from '../core/color/palettes.ts';

/** Everything that defines an image. Serialized to the URL hash and project files. */
export interface FractalState {
  formula: FormulaId;
  julia: { re: number; im: number };
  view: View;
  iterations: IterationSetting;
  escapeRadius: number;
  palette: Palette;
  color: ColorSettings;
  exportSize: { width: number; height: number };
}

export const DEFAULT_ESCAPE_RADIUS = 256;
export const ESCAPE_RADIUS_LIMITS = [2, 1e6] as const;

export function defaultState(formula: FormulaId = 'mandelbrot'): FractalState {
  return {
    formula,
    julia: { re: -0.8, im: 0.156 },
    view: { ...FORMULAS[formula].defaultView },
    iterations: { mode: 'auto' },
    escapeRadius: DEFAULT_ESCAPE_RADIUS,
    palette: clonePalette(DEFAULT_PALETTE),
    color: { ...DEFAULT_COLOR_SETTINGS },
    exportSize: { width: 3840, height: 2160 },
  };
}

/** Zoom relative to the formula's default view. */
export function stateZoom(state: Pick<FractalState, 'formula' | 'view'>): number {
  return zoomLevel(state.view, FORMULAS[state.formula].defaultView.span);
}

export function fractalParams(state: FractalState): FractalParams {
  return {
    formula: state.formula,
    juliaRe: state.julia.re,
    juliaIm: state.julia.im,
    maxIter: resolveIterations(state.iterations, stateZoom(state)),
    escapeRadius: state.escapeRadius,
  };
}
