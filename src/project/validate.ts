import { FORMULA_IDS, type FormulaId } from '../core/formulas/types.ts';
import { MAX_ITER, MIN_ITER, type IterationSetting } from '../core/iterations.ts';
import { COLOR_LIMITS, type ColorSettings, type ColorStop, type Palette } from '../core/color/types.ts';
import { isHexColor } from '../core/color/hex.ts';
import type { View } from '../core/view.ts';
import { ESCAPE_RADIUS_LIMITS, type FractalState } from './state.ts';

export const MAX_EXPORT_DIM = 32768;
export const MAX_EXPORT_PIXELS = 400_000_000;
export const MAX_STOPS = 32;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, msg: string): never {
  throw new ValidationError(`${path}: ${msg}`);
}

export function obj(v: unknown, path: string, allowed?: readonly string[]): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, 'expected an object');
  if (allowed) {
    for (const k of Object.keys(v)) if (!allowed.includes(k)) fail(path, `unknown field "${k}"`);
  }
  return v as Obj;
}

export function num(v: unknown, path: string, min = -Infinity, max = Infinity): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, 'expected a finite number');
  if (v < min || v > max) fail(path, `must be between ${min} and ${max}`);
  return v;
}

export function int(v: unknown, path: string, min: number, max: number): number {
  const n = num(v, path, min, max);
  if (!Number.isInteger(n)) fail(path, 'expected an integer');
  return n;
}

function str(v: unknown, path: string, maxLen = 100): string {
  if (typeof v !== 'string') fail(path, 'expected a string');
  if (v.length > maxLen) fail(path, `longer than ${maxLen} characters`);
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, 'expected true or false');
  return v;
}

function hex(v: unknown, path: string): string {
  if (!isHexColor(v)) fail(path, 'expected a color like "#1a2b3c"');
  return v.toLowerCase();
}

export function formulaId(v: unknown, path: string): FormulaId {
  if (!FORMULA_IDS.includes(v as FormulaId)) fail(path, `expected one of ${FORMULA_IDS.join(', ')}`);
  return v as FormulaId;
}

export function view(v: unknown, path: string): View {
  const o = obj(v, path, ['cx', 'cy', 'span']);
  return { cx: num(o.cx, `${path}.cx`, -1e6, 1e6), cy: num(o.cy, `${path}.cy`, -1e6, 1e6), span: num(o.span, `${path}.span`, 1e-300, 1e6) };
}

export function iterations(v: unknown, path: string): IterationSetting {
  const o = obj(v, path, ['mode', 'value']);
  if (o.mode === 'auto') return { mode: 'auto' };
  if (o.mode === 'fixed') return { mode: 'fixed', value: int(o.value, `${path}.value`, MIN_ITER, MAX_ITER) };
  fail(`${path}.mode`, 'expected "auto" or "fixed"');
}

export function palette(v: unknown, path: string): Palette {
  const o = obj(v, path, ['name', 'stops']);
  if (!Array.isArray(o.stops)) fail(`${path}.stops`, 'expected an array');
  if (o.stops.length < 1 || o.stops.length > MAX_STOPS) fail(`${path}.stops`, `expected 1 to ${MAX_STOPS} stops`);
  const stops: ColorStop[] = o.stops.map((s, i) => {
    const so = obj(s, `${path}.stops[${i}]`, ['pos', 'color']);
    return { pos: num(so.pos, `${path}.stops[${i}].pos`, 0, 1), color: hex(so.color, `${path}.stops[${i}].color`) };
  });
  return { name: str(o.name, `${path}.name`), stops };
}

export function colorSettings(v: unknown, path: string): ColorSettings {
  const keys = ['offset', 'cycleLength', 'gamma', 'brightness', 'contrast', 'hueShift', 'saturation', 'invert', 'interior'] as const;
  const o = obj(v, path, keys);
  const r = (k: keyof typeof COLOR_LIMITS) => num(o[k], `${path}.${k}`, COLOR_LIMITS[k][0], COLOR_LIMITS[k][1]);
  return {
    offset: r('offset'),
    cycleLength: r('cycleLength'),
    gamma: r('gamma'),
    brightness: r('brightness'),
    contrast: r('contrast'),
    hueShift: r('hueShift'),
    saturation: r('saturation'),
    invert: bool(o.invert, `${path}.invert`),
    interior: hex(o.interior, `${path}.interior`),
  };
}

export function exportSize(v: unknown, path: string): { width: number; height: number } {
  const o = obj(v, path, ['width', 'height']);
  const width = int(o.width, `${path}.width`, 1, MAX_EXPORT_DIM);
  const height = int(o.height, `${path}.height`, 1, MAX_EXPORT_DIM);
  if (width * height > MAX_EXPORT_PIXELS) fail(path, `more than ${MAX_EXPORT_PIXELS.toLocaleString('en-US')} pixels`);
  return { width, height };
}

/** Validates the state fields of a project object (all required, no extras besides `extra`). */
export function fractalState(v: unknown, path: string, extra: readonly string[] = []): FractalState {
  const fields = ['formula', 'julia', 'view', 'iterations', 'escapeRadius', 'palette', 'color', 'exportSize'];
  const o = obj(v, path, [...fields, ...extra]);
  for (const f of fields) if (!(f in o)) fail(path, `missing field "${f}"`);
  const j = obj(o.julia, `${path}.julia`, ['re', 'im']);
  return {
    formula: formulaId(o.formula, `${path}.formula`),
    julia: { re: num(j.re, `${path}.julia.re`, -4, 4), im: num(j.im, `${path}.julia.im`, -4, 4) },
    view: view(o.view, `${path}.view`),
    iterations: iterations(o.iterations, `${path}.iterations`),
    escapeRadius: num(o.escapeRadius, `${path}.escapeRadius`, ESCAPE_RADIUS_LIMITS[0], ESCAPE_RADIUS_LIMITS[1]),
    palette: palette(o.palette, `${path}.palette`),
    color: colorSettings(o.color, `${path}.color`),
    exportSize: exportSize(o.exportSize, `${path}.exportSize`),
  };
}
