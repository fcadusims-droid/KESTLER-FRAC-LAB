/**
 * WGSL compute shader: same escape-time semantics as the float64 CPU core
 * (escape check before each step, smooth value n + 1 - log2(ln|z|) clamped
 * at 0, INTERIOR = -1, Mandelbrot cardioid/bulb test, exact-repeat periodicity
 * check), evaluated in float32.
 */
export const FRACTAL_WGSL = /* wgsl */ `
struct Params {
  cx: f32, cy: f32, scale: f32, escape2: f32,
  juliaRe: f32, juliaIm: f32, width: u32, height: u32,
  maxIter: u32, formula: u32, rowOffset: u32, pad: u32,
};

@group(0) @binding(0) var<uniform> p: Params;
@group(0) @binding(1) var<storage, read_write> outv: array<f32>;

fn smoothValue(n: u32, m2: f32) -> f32 {
  return max(f32(n) + 1.0 - log2(0.5 * log(m2)), 0.0);
}

fn inCardioidOrBulb(x: f32, y: f32) -> bool {
  let xq = x - 0.25;
  let y2 = y * y;
  let q = xq * xq + y2;
  if (q * (q + xq) <= 0.25 * y2) { return true; }
  let xb = x + 1.0;
  return xb * xb + y2 <= 0.0625;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let px = gid.x;
  let py = gid.y + p.rowOffset;
  if (px >= p.width || py >= p.height) { return; }
  let re = p.cx + (f32(px) + 0.5 - f32(p.width) * 0.5) * p.scale;
  let im = p.cy - (f32(py) + 0.5 - f32(p.height) * 0.5) * p.scale;
  let idx = py * p.width + px;

  var x = 0.0;
  var y = 0.0;
  var cx = re;
  var cy = im;
  if (p.formula == 1u) { x = re; y = im; cx = p.juliaRe; cy = p.juliaIm; }
  if (p.formula == 0u && inCardioidOrBulb(re, im)) { outv[idx] = -1.0; return; }

  var refX = x;
  var refY = y;
  var period = 8u;
  var sinceRef = 0u;
  for (var n = 0u; n < p.maxIter; n = n + 1u) {
    let x2 = x * x;
    let y2 = y * y;
    if (x2 + y2 > p.escape2) { outv[idx] = smoothValue(n, x2 + y2); return; }
    if (p.formula == 2u) {
      y = -2.0 * abs(x * y) + cy;
    } else {
      y = 2.0 * x * y + cy;
    }
    x = x2 - y2 + cx;
    if (x == refX && y == refY) { outv[idx] = -1.0; return; }
    sinceRef = sinceRef + 1u;
    if (sinceRef == period) { refX = x; refY = y; sinceRef = 0u; period = period * 2u; }
  }
  let m2 = x * x + y * y;
  if (m2 > p.escape2) { outv[idx] = smoothValue(p.maxIter, m2); } else { outv[idx] = -1.0; }
}
`;
