import type { View } from '../view.ts';
import type { FormulaId } from './types.ts';

export interface FormulaInfo {
  id: FormulaId;
  label: string;
  formula: string;
  defaultView: View;
}

export const FORMULAS: Record<FormulaId, FormulaInfo> = {
  mandelbrot: { id: 'mandelbrot', label: 'Mandelbrot', formula: 'z₀ = 0,  z ← z² + c', defaultView: { cx: -0.6, cy: 0, span: 2.6 } },
  julia: { id: 'julia', label: 'Julia', formula: 'z₀ = pixel,  z ← z² + c', defaultView: { cx: 0, cy: 0, span: 3 } },
  burningShip: {
    id: 'burningShip',
    label: 'Burning Ship',
    formula: 'z ← (|Re z| + i|Im z|)² + c',
    defaultView: { cx: -0.45, cy: -0.5, span: 2.6 },
  },
};

export interface JuliaPreset {
  name: string;
  re: number;
  im: number;
}

export const JULIA_PRESETS: readonly JuliaPreset[] = [
  { name: 'Dendrite spiral', re: -0.8, im: 0.156 },
  { name: 'Rabbit lace', re: -0.4, im: 0.6 },
  { name: 'Seahorse filaments', re: 0.285, im: 0.01 },
  { name: 'Dragon', re: -0.70176, im: -0.3842 },
  { name: 'Spiral arms', re: -0.835, im: -0.2321 },
  { name: 'Flower', re: 0.45, im: 0.1428 },
];
