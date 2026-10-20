export type IterationSetting = { mode: 'auto' } | { mode: 'fixed'; value: number };

export const MIN_ITER = 10;
export const MAX_ITER = 100_000;
export const AUTO_ITER_BASE = 200;
export const AUTO_ITER_CAP = 20_000;

/** Iteration count that grows with zoom depth (zoom = default span / span). */
export function autoIterations(zoom: number): number {
  const depth = Math.max(0, Math.log10(Math.max(zoom, 1)));
  return Math.min(AUTO_ITER_CAP, Math.round(AUTO_ITER_BASE + 120 * depth ** 1.4));
}

export function resolveIterations(setting: IterationSetting, zoom: number): number {
  if (setting.mode === 'auto') return autoIterations(zoom);
  return Math.min(MAX_ITER, Math.max(MIN_ITER, Math.round(setting.value)));
}
