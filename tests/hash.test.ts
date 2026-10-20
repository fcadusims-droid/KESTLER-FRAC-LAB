import { describe, expect, it } from 'vitest';
import { decodeHash, encodeHash } from '../src/project/hash.ts';
import { defaultState } from '../src/project/state.ts';

describe('URL hash state', () => {
  it('round-trips the full state exactly', () => {
    const s = defaultState('julia');
    s.view = { cx: -0.743643887037151, cy: 0.131825904205330, span: 1.234e-11 };
    s.julia = { re: -0.70176, im: -0.3842 };
    s.iterations = { mode: 'fixed', value: 4321 };
    s.color = { ...s.color, offset: 0.25, cycleLength: 17.5, hueShift: -40, invert: true, interior: '#102030' };
    s.palette = { name: 'My palette', stops: [{ pos: 0, color: '#000000' }, { pos: 0.5, color: '#ff8800' }] };
    s.exportSize = { width: 7680, height: 4320 };
    expect(decodeHash(encodeHash(s))).toEqual(s);
  });

  it('returns null for an empty hash and fills defaults for missing fields', () => {
    expect(decodeHash('')).toBeNull();
    expect(decodeHash('#')).toBeNull();
    const s = decodeHash('#f=burningShip&x=1&y=2&s=0.5')!;
    expect(s.formula).toBe('burningShip');
    expect(s.view).toEqual({ cx: 1, cy: 2, span: 0.5 });
    expect(s.iterations).toEqual({ mode: 'auto' });
  });

  it('rejects malformed values', () => {
    expect(() => decodeHash('#f=mandelbrot&x=abc')).toThrow(/not a number/);
    expect(() => decodeHash('#f=nope')).toThrow(/formula/);
    expect(() => decodeHash('#f=mandelbrot&s=-1')).toThrow(/span/);
    expect(() => decodeHash('#f=mandelbrot&st=0:zzzzzz')).toThrow(/color/);
    expect(() => decodeHash('#f=mandelbrot&w=0')).toThrow(/width/);
  });
});
