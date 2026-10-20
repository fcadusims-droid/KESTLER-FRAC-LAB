import type { Palette } from './types.ts';

const p = (name: string, ...colors: string[]): Palette => ({
  name,
  stops: colors.map((color, i) => ({ pos: i / colors.length, color })),
});

export const BUILTIN_PALETTES: readonly Palette[] = [
  p('Deep Ocean', '#000764', '#206bcb', '#edffff', '#ffaa00', '#000200'),
  p('Electric', '#05001a', '#3b00ff', '#00e5ff', '#ffffff', '#ff00d4', '#1a0033'),
  p('Ember', '#0a0000', '#5c0a00', '#d12c00', '#ff8a00', '#ffe9a8', '#401000'),
  p('Monochrome', '#000000', '#ffffff'),
  p('Aurora', '#020b1a', '#0b5d4f', '#38f2a0', '#a0ffe6', '#6b3fd1', '#120a3a'),
  p('Gold', '#120900', '#6b4200', '#d9a400', '#fff4c2', '#a87400', '#2e1b00'),
  p('Ultraviolet', '#07000f', '#3d0a73', '#9b30ff', '#f0c8ff', '#5a1aa6', '#14002b'),
  p('Spectrum', '#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'),
];

export const DEFAULT_PALETTE = BUILTIN_PALETTES[0];

export function findBuiltinPalette(name: string): Palette | undefined {
  return BUILTIN_PALETTES.find((pal) => pal.name === name);
}

export function clonePalette(pal: Palette): Palette {
  return { name: pal.name, stops: pal.stops.map((s) => ({ ...s })) };
}
