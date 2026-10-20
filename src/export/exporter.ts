import type { FractalParams } from '../core/formulas/types.ts';
import type { Frame } from '../core/view.ts';
import type { ColorLut } from '../core/color/lut.ts';
import type { WorkerPool } from '../render/pool.ts';
import { makeBands } from '../render/tiles.ts';
import { PngStreamEncoder } from './png.ts';
import type { ByteSink } from './sink.ts';

export interface ExportJob {
  frame: Frame;
  params: FractalParams;
  lut: ColorLut;
  /** tEXt chunks to embed (Latin-1). */
  text?: Record<string, string>;
  bandRows?: number;
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
}

export interface ExportProgress {
  rowsDone: number;
  totalRows: number;
  bytesWritten: number;
}

export interface ExportResult {
  width: number;
  height: number;
  bytes: number;
  ms: number;
}

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelledError';
  }
}

/** Rows per band: ~2 MB of RGB per band, at least 1 row, at most 128. */
export function defaultBandRows(width: number): number {
  return Math.max(1, Math.min(128, Math.floor(2_000_000 / (width * 3))));
}

/**
 * Renders the image in horizontal bands on the worker pool and streams it into
 * the PNG encoder in order. At most `window` bands are in flight or waiting, so
 * memory stays bounded regardless of the image size.
 */
export async function exportPng(
  pool: WorkerPool,
  job: ExportJob,
  sink: ByteSink,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
  group = 1,
): Promise<ExportResult> {
  const t0 = performance.now();
  const { width, height } = job.frame;
  const bands = makeBands(width, height, job.bandRows ?? defaultBandRows(width));
  const window = Math.max(2, pool.size * 2);
  const pendingOut: Uint8Array[] = [];
  const encoder = new PngStreamEncoder(width, height, (b) => pendingOut.push(b), { level: job.level ?? 6, text: job.text });
  const results = new Map<number, Promise<Uint8Array>>();
  let submitted = 0;
  let bytesWritten = 0;

  const submit = () => {
    while (submitted < bands.length && submitted < written + window) {
      const rect = bands[submitted];
      const p = pool.run(group, { type: 'band', frame: job.frame, params: job.params, lut: job.lut, rect }).then((res) => {
        if (res.type !== 'band') throw new Error('Unexpected worker response');
        return new Uint8Array(res.data);
      });
      p.catch(() => {}); // handled when awaited in order
      results.set(submitted, p);
      submitted++;
    }
  };

  const drain = async () => {
    while (pendingOut.length) {
      const b = pendingOut.shift()!;
      await sink.write(b);
      bytesWritten += b.length;
    }
  };

  let written = 0;
  try {
    await drain(); // signature + IHDR + tEXt
    for (let i = 0; i < bands.length; i++) {
      if (signal.aborted) throw new ExportCancelledError();
      submit();
      const data = await results.get(i)!;
      results.delete(i);
      if (signal.aborted) throw new ExportCancelledError();
      encoder.pushFilteredRows(data, bands[i].h);
      written = i + 1;
      await drain();
      onProgress({ rowsDone: bands[i].y + bands[i].h, totalRows: height, bytesWritten });
    }
    encoder.finish();
    await drain();
    await sink.close();
  } catch (err) {
    pool.cancel((g) => g === group);
    await sink.abort().catch(() => {});
    if (signal.aborted) throw new ExportCancelledError();
    throw err;
  }
  return { width, height, bytes: bytesWritten, ms: performance.now() - t0 };
}
