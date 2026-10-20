import { defaultState, type FractalState } from './state.ts';
import { fractalState, ValidationError } from './validate.ts';

/**
 * URL-hash encoding of the full state, e.g.
 * #f=mandelbrot&x=-0.6&y=0&s=2.6&it=auto&r=256&pal=Deep%20Ocean&st=0:000764,0.2:206bcb&...
 * Numbers use JavaScript's shortest round-trip representation, so float64
 * coordinates survive exactly.
 */
export function encodeHash(s: FractalState): string {
  const p = new URLSearchParams();
  p.set('f', s.formula);
  p.set('x', String(s.view.cx));
  p.set('y', String(s.view.cy));
  p.set('s', String(s.view.span));
  p.set('it', s.iterations.mode === 'auto' ? 'auto' : String(s.iterations.value));
  p.set('r', String(s.escapeRadius));
  if (s.formula === 'julia') {
    p.set('jr', String(s.julia.re));
    p.set('ji', String(s.julia.im));
  }
  p.set('pal', s.palette.name);
  p.set('st', s.palette.stops.map((st) => `${+st.pos.toFixed(5)}:${st.color.slice(1)}`).join(','));
  const c = s.color;
  p.set('off', String(c.offset));
  p.set('cyc', String(c.cycleLength));
  p.set('gam', String(c.gamma));
  p.set('bri', String(c.brightness));
  p.set('con', String(c.contrast));
  p.set('hue', String(c.hueShift));
  p.set('sat', String(c.saturation));
  p.set('inv', c.invert ? '1' : '0');
  p.set('int', c.interior.slice(1));
  p.set('w', String(s.exportSize.width));
  p.set('h', String(s.exportSize.height));
  return '#' + p.toString().replace(/\+/g, '%20');
}

/** Parses a hash; missing fields take defaults. Throws ValidationError on malformed values. */
export function decodeHash(hash: string): FractalState | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const p = new URLSearchParams(raw);
  if (!p.has('f')) return null;
  const formula = p.get('f') ?? '';
  const base = defaultState(['mandelbrot', 'julia', 'burningShip'].includes(formula) ? (formula as FractalState['formula']) : 'mandelbrot');
  const n = (key: string, fallback: number): number => {
    const v = p.get(key);
    if (v === null) return fallback;
    const parsed = Number(v);
    if (v.trim() === '' || Number.isNaN(parsed)) throw new ValidationError(`URL parameter "${key}" is not a number`);
    return parsed;
  };
  const it = p.get('it');
  const stops = p.get('st');
  const candidate = {
    formula,
    julia: { re: n('jr', base.julia.re), im: n('ji', base.julia.im) },
    view: { cx: n('x', base.view.cx), cy: n('y', base.view.cy), span: n('s', base.view.span) },
    iterations: it === null || it === 'auto' ? { mode: 'auto' } : { mode: 'fixed', value: n('it', 0) },
    escapeRadius: n('r', base.escapeRadius),
    palette: {
      name: p.get('pal') ?? base.palette.name,
      stops: stops
        ? stops.split(',').map((part) => {
            const [pos, color] = part.split(':');
            return { pos: Number(pos), color: `#${color ?? ''}` };
          })
        : base.palette.stops,
    },
    color: {
      offset: n('off', base.color.offset),
      cycleLength: n('cyc', base.color.cycleLength),
      gamma: n('gam', base.color.gamma),
      brightness: n('bri', base.color.brightness),
      contrast: n('con', base.color.contrast),
      hueShift: n('hue', base.color.hueShift),
      saturation: n('sat', base.color.saturation),
      invert: p.has('inv') ? p.get('inv') === '1' : base.color.invert,
      interior: p.has('int') ? `#${p.get('int')}` : base.color.interior,
    },
    exportSize: { width: n('w', base.exportSize.width), height: n('h', base.exportSize.height) },
  };
  return fractalState(candidate, 'URL');
}
