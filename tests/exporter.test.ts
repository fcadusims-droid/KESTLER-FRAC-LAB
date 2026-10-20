import { describe, expect, it } from 'vitest';
import { decode } from 'fast-png';
import { exportPng, ExportCancelledError } from '../src/export/exporter.ts';
import { MemorySink, type ByteSink } from '../src/export/sink.ts';
import { estimateExport } from '../src/export/estimate.ts';
import { buildLut, colorize, BUILTIN_PALETTES, DEFAULT_COLOR_SETTINGS } from '../src/core/color/index.ts';
import { renderTileFloat64, type FractalParams } from '../src/core/formulas/index.ts';
import { frameFromView } from '../src/core/view.ts';
import { fakePool } from './helpers/fakeWorker.ts';

const params: FractalParams = { formula: 'julia', juliaRe: -0.8, juliaIm: 0.156, maxIter: 200, escapeRadius: 256 };
const lut = buildLut(BUILTIN_PALETTES[1], DEFAULT_COLOR_SETTINGS);
const frame = frameFromView({ cx: 0, cy: 0, span: 3 }, 257, 129);

class RecordingSink implements ByteSink {
  readonly kind = 'memory' as const;
  chunks: Uint8Array[] = [];
  closed = false;
  aborted = false;
  async write(b: Uint8Array) {
    this.chunks.push(b.slice());
  }
  async close() {
    this.closed = true;
  }
  async abort() {
    this.aborted = true;
  }
}

describe('exportPng (banded, via worker pool)', () => {
  it('produces a PNG identical to a direct render, with progress reaching 100%', async () => {
    const { pool } = fakePool(3);
    const sink = new RecordingSink();
    const progress: number[] = [];
    const res = await exportPng(pool, { frame, params, lut, bandRows: 10 }, sink, (p) => progress.push(p.rowsDone / p.totalRows), new AbortController().signal);
    expect(sink.closed).toBe(true);
    const png = Buffer.concat(sink.chunks);
    expect(res).toMatchObject({ width: 257, height: 129, bytes: png.length });
    expect(progress.at(-1)).toBe(1);
    expect(progress.length).toBe(13);

    const img = decode(png);
    const values = new Float32Array(257 * 129);
    renderTileFloat64(frame, params, { x: 0, y: 0, w: 257, h: 129 }, values);
    const rgba = new Uint8Array(values.length * 4);
    colorize(values, values.length, lut, rgba);
    const rgb = img.data as Uint8Array;
    for (let i = 0; i < values.length; i++) {
      expect([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]).toEqual([rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]]);
    }
  });

  it('works with MemorySink (Blob output)', async () => {
    const { pool } = fakePool(2);
    const sink = new MemorySink();
    const res = await exportPng(pool, { frame, params, lut, bandRows: 33 }, sink, () => {}, new AbortController().signal);
    const blob = sink.toBlob();
    expect(blob.size).toBe(res.bytes);
    expect(blob.type).toBe('image/png');
    const img = decode(new Uint8Array(await blob.arrayBuffer()));
    expect([img.width, img.height]).toEqual([257, 129]);
  });

  it('cancel stops work, aborts the sink and leaves nothing queued', async () => {
    const { pool, executed } = fakePool(2);
    const sink = new RecordingSink();
    const ac = new AbortController();
    const p = exportPng(pool, { frame, params, lut, bandRows: 1 }, sink, (pr) => {
      if (pr.rowsDone >= 3) ac.abort();
    }, ac.signal);
    await expect(p).rejects.toBeInstanceOf(ExportCancelledError);
    expect(sink.aborted).toBe(true);
    expect(sink.closed).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(pool.pending).toBe(0);
    expect(executed()).toBeLessThan(20); // of 129 bands
  });

  it('keeps a bounded number of bands in flight', async () => {
    const { pool } = fakePool(2);
    let maxPending = 0;
    const sink = new RecordingSink();
    await exportPng(pool, { frame, params, lut, bandRows: 2 }, sink, () => {
      maxPending = Math.max(maxPending, pool.pending);
    }, new AbortController().signal);
    expect(maxPending).toBeLessThanOrEqual(4); // window = 2 × pool size
  });

  it('estimates scale with size', () => {
    const e = estimateExport(15360, 8640, 15, 4, 1e-4);
    expect(e.pixels).toBe(15360 * 8640);
    expect(e.rawBytes).toBe(15360 * 8640 * 3);
    expect(e.workingBytes).toBeLessThan(64 * 1024 * 1024);
    expect(e.seconds).toBeGreaterThan(0);
    expect(estimateExport(100, 100, 10, 4, null).seconds).toBeNull();
  });
});
