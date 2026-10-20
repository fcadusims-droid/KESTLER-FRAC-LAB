/**
 * PNG scanline filtering for 8-bit RGB. For each row the filter (None, Sub,
 * Up, Average, Paeth) with the smallest sum of absolute signed residuals is
 * chosen — the standard heuristic from the PNG spec.
 */

const BPP = 3;

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Filters one RGB row. `prev` is the previous row's unfiltered RGB (or null for
 * the first row of the image). Writes 1 + row.length bytes to `out` at `outOffset`.
 * `scratch` must hold 5 * row.length bytes.
 */
export function filterRow(row: Uint8Array, prev: Uint8Array | null, out: Uint8Array, outOffset: number, scratch: Uint8Array): void {
  const n = row.length;
  let best = 0;
  let bestSum = Infinity;
  for (let f = 0; f < 5; f++) {
    const base = f * n;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const x = row[i];
      const a = i >= BPP ? row[i - BPP] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= BPP ? prev[i - BPP] : 0;
      let v: number;
      switch (f) {
        case 0: v = x; break;
        case 1: v = x - a; break;
        case 2: v = x - b; break;
        case 3: v = x - ((a + b) >> 1); break;
        default: v = x - paeth(a, b, c);
      }
      v &= 0xff;
      scratch[base + i] = v;
      sum += v < 128 ? v : 256 - v;
      if (sum >= bestSum) break;
    }
    if (sum < bestSum) {
      bestSum = sum;
      best = f;
    }
  }
  out[outOffset] = best;
  out.set(scratch.subarray(best * n, best * n + n), outOffset + 1);
}
