import { describe, expect, it } from 'vitest';
import { WorkerPool, type WorkerLike } from '../src/render/pool.ts';
import { RenderScheduler } from '../src/render/scheduler.ts';
import { handleRequest } from '../src/render/workers/handler.ts';
import { renderTileFloat64, type FractalParams } from '../src/core/formulas/index.ts';
import type { Frame } from '../src/core/view.ts';
import type { WorkerRequest, WorkerResponse } from '../src/render/protocol.ts';

/** In-process worker: runs the real handler asynchronously. */
class FakeWorker implements WorkerLike {
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  executed = 0;
  postMessage(message: WorkerRequest): void {
    setTimeout(() => {
      this.executed++;
      const { response } = handleRequest(structuredClone(message));
      this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
    }, 1);
  }
  terminate(): void {}
}

const params: FractalParams = { formula: 'mandelbrot', juliaRe: 0, juliaIm: 0, maxIter: 200, escapeRadius: 256 };
const frame: Frame = { cx: -0.5, cy: 0, scale: 3 / 64, width: 96, height: 64 };

function setup(size = 2) {
  const workers: FakeWorker[] = [];
  const pool = new WorkerPool(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  }, size);
  return { pool, workers, scheduler: new RenderScheduler(pool), executed: () => workers.reduce((a, w) => a + w.executed, 0) };
}

describe('RenderScheduler', () => {
  it('produces the same values as a direct render', async () => {
    const { scheduler } = setup();
    const res = await scheduler.render(frame, params, { tileSize: 16 });
    expect(res).not.toBeNull();
    const direct = new Float32Array(frame.width * frame.height);
    renderTileFloat64(frame, params, { x: 0, y: 0, w: frame.width, h: frame.height }, direct);
    expect(Buffer.from(res!.values.buffer).equals(Buffer.from(direct.buffer))).toBe(true);
  });

  it('render ids increase and a superseded render resolves to null', async () => {
    const { scheduler } = setup();
    const first = scheduler.render(frame, params, { tileSize: 16 });
    const id1 = scheduler.currentId;
    const second = scheduler.render({ ...frame, cx: -0.6 }, params, { tileSize: 16 });
    expect(scheduler.currentId).toBe(id1 + 1);
    expect(await first).toBeNull();
    const r2 = await second;
    expect(r2?.renderId).toBe(id1 + 1);
  });

  it('stale tiles already in flight are discarded, never delivered', async () => {
    const { scheduler } = setup(2);
    const delivered: number[] = [];
    const first = scheduler.render(frame, params, { tileSize: 16, onTile: () => delivered.push(1) });
    // Two tiles are now in flight (one per worker); supersede immediately.
    const second = scheduler.render(frame, params, { tileSize: 16, onTile: () => delivered.push(2) });
    await Promise.all([first, second]);
    expect(delivered.filter((d) => d === 1)).toHaveLength(0);
    expect(scheduler.discarded).toBe(2);
  });

  it('cancellation stops queued work from reaching workers', async () => {
    const { scheduler, executed, pool } = setup(2);
    const tiles = Math.ceil(96 / 16) * Math.ceil(64 / 16); // 24
    const p = scheduler.render(frame, params, { tileSize: 16 });
    scheduler.cancel();
    expect(await p).toBeNull();
    await new Promise((r) => setTimeout(r, 30));
    // Only the tiles already posted (one per worker) ran.
    expect(executed()).toBe(2);
    expect(executed()).toBeLessThan(tiles);
    expect(pool.pending).toBe(0);
  });
});
