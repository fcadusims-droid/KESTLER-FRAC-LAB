// Usage: node --experimental-strip-types scripts/bench.ts
// Single-threaded timing of the float64 core (what one worker does) for standard views.
import { renderTileFloat64 } from '../src/core/formulas/index.ts';
import { frameFromView, type View } from '../src/core/view.ts';
import type { FractalParams } from '../src/core/formulas/types.ts';

const W = 1280, H = 720;
const views: { name: string; view: View; params: Omit<FractalParams, 'escapeRadius'> }[] = [
  { name: 'Mandelbrot default', view: { cx: -0.6, cy: 0, span: 2.6 }, params: { formula: 'mandelbrot', juliaRe: 0, juliaIm: 0, maxIter: 200 } },
  { name: 'Seahorse valley 5e4x', view: { cx: -0.743643887037151, cy: 0.13182590420533, span: 5e-5 }, params: { formula: 'mandelbrot', juliaRe: 0, juliaIm: 0, maxIter: 1252 } },
  { name: 'Mandelbrot 1e10x', view: { cx: -0.743643887037151, cy: 0.13182590420533, span: 2.6e-10 }, params: { formula: 'mandelbrot', juliaRe: 0, juliaIm: 0, maxIter: 4000 } },
  { name: 'Julia -0.8+0.156i', view: { cx: 0, cy: 0, span: 3 }, params: { formula: 'julia', juliaRe: -0.8, juliaIm: 0.156, maxIter: 200 } },
  { name: 'Burning Ship default', view: { cx: -0.45, cy: 0.6, span: 2.4 }, params: { formula: 'burningShip', juliaRe: 0, juliaIm: 0, maxIter: 200 } },
];
const out = new Float32Array(W * H);
for (const v of views) {
  const frame = frameFromView(v.view, W, H);
  const p = { ...v.params, escapeRadius: 256 };
  renderTileFloat64(frame, p, { x: 0, y: 0, w: W, h: 120 }, out); // warm-up
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    renderTileFloat64(frame, p, { x: 0, y: 0, w: W, h: H }, out);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  console.log(`${v.name.padEnd(24)} ${W}x${H} maxIter ${String(p.maxIter).padStart(5)}  median ${times[1].toFixed(0).padStart(5)} ms (1 thread)`);
}
