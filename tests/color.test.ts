import { describe, expect, it } from 'vitest';
import {
  BUILTIN_PALETTES,
  DEFAULT_COLOR_SETTINGS,
  LUT_SIZE,
  adjustColor,
  buildLut,
  colorize,
  hexToRgb,
  normalizeHex,
  rgbToHex,
  sampleGradient,
  type Palette,
} from '../src/core/color/index.ts';
import { INTERIOR } from '../src/core/formulas/index.ts';

const bw: Palette = { name: 'bw', stops: [{ pos: 0, color: '#000000' }, { pos: 0.5, color: '#ffffff' }] };

describe('hex helpers', () => {
  it('parses and formats', () => {
    expect(hexToRgb('#1a2B3c')).toEqual([0x1a, 0x2b, 0x3c]);
    expect(rgbToHex(26, 43, 60)).toBe('#1a2b3c');
    expect(() => hexToRgb('red')).toThrow();
  });
  it('normalizes user input', () => {
    expect(normalizeHex('ABC')).toBe('#aabbcc');
    expect(normalizeHex(' #00FF7f ')).toBe('#00ff7f');
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('zzzzzz')).toBeNull();
  });
});

describe('gradient', () => {
  it('hits stop colors exactly and interpolates between them', () => {
    expect(sampleGradient(bw.stops, 0)).toEqual([0, 0, 0]);
    expect(sampleGradient(bw.stops, 0.5)).toEqual([1, 1, 1]);
    expect(sampleGradient(bw.stops, 0.25)[0]).toBeCloseTo(0.5, 10);
  });
  it('wraps cyclically from the last stop back to the first', () => {
    expect(sampleGradient(bw.stops, 0.75)[0]).toBeCloseTo(0.5, 10);
    expect(sampleGradient(bw.stops, 0.999)[0]).toBeCloseTo(0.002, 2);
  });
  it('handles unsorted stops and stops not starting at 0', () => {
    const p = [{ pos: 0.75, color: '#ffffff' }, { pos: 0.25, color: '#000000' }];
    expect(sampleGradient(p, 0.25)).toEqual([0, 0, 0]);
    expect(sampleGradient(p, 0.5)[0]).toBeCloseTo(0.5, 10);
    expect(sampleGradient(p, 0)[0]).toBeCloseTo(0.5, 10); // between 0.75 (white) and 1.25 (black)
  });
  it('all built-in palettes are valid and named as specified', () => {
    expect(BUILTIN_PALETTES.map((p) => p.name)).toEqual(['Deep Ocean', 'Electric', 'Ember', 'Monochrome', 'Aurora', 'Gold', 'Ultraviolet', 'Spectrum']);
    for (const p of BUILTIN_PALETTES) expect(() => buildLut(p, DEFAULT_COLOR_SETTINGS)).not.toThrow();
  });
});

describe('adjustments', () => {
  const c: [number, number, number] = [0.2, 0.5, 0.8];
  it('default settings are the identity', () => {
    const out = adjustColor(c, DEFAULT_COLOR_SETTINGS);
    out.forEach((v, i) => expect(v).toBeCloseTo(c[i], 12));
  });
  it('invert, brightness, contrast, gamma, saturation, hue', () => {
    const s = DEFAULT_COLOR_SETTINGS;
    expect(adjustColor(c, { ...s, invert: true })[0]).toBeCloseTo(0.8, 12);
    expect(adjustColor(c, { ...s, brightness: 0.1 })[1]).toBeCloseTo(0.6, 12);
    expect(adjustColor(c, { ...s, contrast: 2 })[0]).toBeCloseTo(0, 12);
    expect(adjustColor(c, { ...s, gamma: 2 })[1]).toBeCloseTo(Math.sqrt(0.5), 12);
    const grey = adjustColor(c, { ...s, saturation: 0 });
    expect(grey[0]).toBeCloseTo(grey[2], 12);
    const rotated = adjustColor([1, 0, 0], { ...s, hueShift: 120 });
    expect(rotated[1]).toBeCloseTo(1, 12);
    expect(rotated[0]).toBeCloseTo(0, 12);
  });
});

describe('colorize', () => {
  it('maps values through the LUT with cycle length and offset; interior gets its own color', () => {
    const lut = buildLut(bw, { ...DEFAULT_COLOR_SETTINGS, cycleLength: 10, interior: '#ff0000' });
    const values = new Float32Array([0, 5, 10, INTERIOR, 2.5]);
    const out = new Uint8ClampedArray(values.length * 4);
    colorize(values, values.length, lut, out);
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 255]); // t = 0
    expect([...out.slice(4, 8)]).toEqual([255, 255, 255, 255]); // t = 0.5
    expect([...out.slice(8, 12)]).toEqual([0, 0, 0, 255]); // t = 1 wraps to 0
    expect([...out.slice(12, 16)]).toEqual([255, 0, 0, 255]);
    expect(out[16]).toBe(lut.rgb[(LUT_SIZE / 4) * 3]);

    const shifted = buildLut(bw, { ...DEFAULT_COLOR_SETTINGS, cycleLength: 10, offset: 0.5 });
    colorize(values, 1, shifted, out);
    expect([...out.slice(0, 3)]).toEqual([255, 255, 255]);
  });
});
