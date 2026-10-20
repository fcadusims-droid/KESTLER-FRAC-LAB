/**
 * Continuous ("smooth") escape value for a point that escaped after `n`
 * iterations with |z|² = `mag2`:  n + 1 - log2(log|z|).
 * Clamped at 0 so it never collides with the INTERIOR sentinel; only points far
 * outside the set (|c| beyond the escape radius) are affected.
 */
export function smoothValue(n: number, mag2: number): number {
  const v = n + 1 - Math.log2(0.5 * Math.log(mag2));
  return v > 0 ? v : 0;
}
