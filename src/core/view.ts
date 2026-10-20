/**
 * View math. A `View` is resolution independent: `span` is the extent in complex
 * units across the smaller of the two output dimensions. A `Frame` is the
 * pixel-level mapping for a concrete width/height:
 *
 *   re = cx + (px + 0.5 - W/2) * scale
 *   im = cy - (py + 0.5 - H/2) * scale      (y axis points up)
 *
 * Coordinates are always derived from global integer pixel indices, never by
 * accumulating increments, so tiled and untiled renders are identical.
 */

export interface View {
  cx: number;
  cy: number;
  /** Complex extent across min(width, height). */
  span: number;
}

export interface Frame {
  cx: number;
  cy: number;
  /** Complex units per pixel. */
  scale: number;
  width: number;
  height: number;
}

export const DEFAULT_SPAN = 3;

export function frameFromView(view: View, width: number, height: number): Frame {
  return { cx: view.cx, cy: view.cy, scale: view.span / Math.min(width, height), width, height };
}

export function viewFromFrame(frame: Frame): View {
  return { cx: frame.cx, cy: frame.cy, span: frame.scale * Math.min(frame.width, frame.height) };
}

export function pixelToRe(frame: Frame, px: number): number {
  return frame.cx + (px + 0.5 - frame.width / 2) * frame.scale;
}

export function pixelToIm(frame: Frame, py: number): number {
  return frame.cy - (py + 0.5 - frame.height / 2) * frame.scale;
}

export function pixelToComplex(frame: Frame, px: number, py: number): [number, number] {
  return [pixelToRe(frame, px), pixelToIm(frame, py)];
}

/** Inverse of pixelToComplex, returning (fractional) pixel indices. */
export function complexToPixel(frame: Frame, re: number, im: number): [number, number] {
  return [(re - frame.cx) / frame.scale + frame.width / 2 - 0.5, (frame.cy - im) / frame.scale + frame.height / 2 - 0.5];
}

/**
 * Point under a continuous screen position (x, y) in pixel units measured from
 * the canvas' top-left corner (e.g. a mouse position scaled to device pixels).
 * Pixel index px covers [px, px + 1), so its center is px + 0.5.
 */
export function screenToComplex(frame: Frame, x: number, y: number): [number, number] {
  return [frame.cx + (x - frame.width / 2) * frame.scale, frame.cy - (y - frame.height / 2) * frame.scale];
}

/**
 * Zoom by `factor` (>1 zooms in) keeping the complex point under the screen
 * position (x, y) fixed.
 */
export function zoomAt(frame: Frame, x: number, y: number, factor: number): Frame {
  const [re, im] = screenToComplex(frame, x, y);
  const scale = frame.scale / factor;
  return {
    ...frame,
    scale,
    cx: re - (x - frame.width / 2) * scale,
    cy: im + (y - frame.height / 2) * scale,
  };
}

/** Pan by a screen-space drag of (dx, dy) pixels: the image follows the pointer. */
export function pan(frame: Frame, dx: number, dy: number): Frame {
  return { ...frame, cx: frame.cx - dx * frame.scale, cy: frame.cy + dy * frame.scale };
}

/** Zoom relative to a reference span (the formula's default view). */
export function zoomLevel(view: View, defaultSpan = DEFAULT_SPAN): number {
  return defaultSpan / view.span;
}
