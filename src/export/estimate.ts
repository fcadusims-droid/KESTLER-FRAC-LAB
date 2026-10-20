export interface ExportEstimate {
  pixels: number;
  rawBytes: number;
  /** Rough peak memory for the export pipeline (excluding the app itself). */
  workingBytes: number;
  /** Extra memory for the in-memory (download) path: roughly the compressed file. */
  fileBytesLow: number;
  fileBytesHigh: number;
  /** Rough time, or null if no reference render is available. */
  seconds: number | null;
}

/**
 * msPerPixel: measured from the last full-resolution preview render of the same
 * view (same iteration count), using the same number of workers.
 */
export function estimateExport(width: number, height: number, bandRows: number, poolSize: number, msPerPixel: number | null): ExportEstimate {
  const pixels = width * height;
  const rawBytes = pixels * 3;
  const window = Math.max(2, poolSize * 2);
  // Per in-flight band: Float32 values + RGBA row + filtered RGB output, plus encoder buffers.
  const perBand = width * (bandRows + 1) * 4 + width * bandRows * 3 + width * 3 * 7;
  const workingBytes = window * perBand + 4 * 1024 * 1024;
  // Smoothly colored fractals typically compress to ~15–60% of raw RGB.
  const fileBytesLow = rawBytes * 0.15;
  const fileBytesHigh = rawBytes * 0.6;
  // Compute + filtering/compression on the main thread (~40 MB/s raw throughput).
  const seconds = msPerPixel === null ? null : (msPerPixel * pixels) / 1000 + rawBytes / 40e6;
  return { pixels, rawBytes, workingBytes, fileBytesLow, fileBytesHigh, seconds };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}
