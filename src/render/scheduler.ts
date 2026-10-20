import type { Frame } from '../core/view.ts';
import type { FractalParams, Rect } from '../core/formulas/types.ts';
import { CancelledError, type WorkerPool } from './pool.ts';
import { makeTiles } from './tiles.ts';

export interface RenderResult {
  renderId: number;
  frame: Frame;
  values: Float32Array;
  ms: number;
}

export interface RenderOptions {
  tileSize?: number;
  /** Called for every tile of the current render as it arrives (row-major values of `rect`). */
  onTile?: (rect: Rect, values: Float32Array) => void;
}

/**
 * Issues renders with monotonically increasing ids. Starting a render
 * supersedes the previous one: its queued tiles are cancelled, and tiles
 * still in flight are discarded when they arrive because their id is stale.
 * A superseded render resolves to null.
 */
export class RenderScheduler {
  private latestId = 0;
  /** Tiles that arrived for a stale render and were dropped (diagnostics/tests). */
  discarded = 0;

  constructor(private readonly pool: WorkerPool) {}

  get currentId(): number {
    return this.latestId;
  }

  isCurrent(id: number): boolean {
    return id === this.latestId;
  }

  /** Cancels whatever is in progress. */
  cancel(): void {
    const id = ++this.latestId;
    this.pool.cancel((group) => group < id);
  }

  async render(frame: Frame, params: FractalParams, opts: RenderOptions = {}): Promise<RenderResult | null> {
    const id = ++this.latestId;
    this.pool.cancel((group) => group < id);
    const t0 = performance.now();
    const values = new Float32Array(frame.width * frame.height);
    const tiles = makeTiles(frame.width, frame.height, opts.tileSize ?? 128);

    const jobs = tiles.map(async (rect) => {
      let res;
      try {
        res = await this.pool.run(id, { type: 'tile', frame, params, rect });
      } catch (err) {
        if (err instanceof CancelledError) return false;
        throw err;
      }
      if (id !== this.latestId) {
        this.discarded++;
        return false;
      }
      if (res.type !== 'tile') return false;
      const tile = new Float32Array(res.values);
      for (let r = 0; r < rect.h; r++) {
        values.set(tile.subarray(r * rect.w, (r + 1) * rect.w), (rect.y + r) * frame.width + rect.x);
      }
      opts.onTile?.(rect, tile);
      return true;
    });

    const results = await Promise.all(jobs);
    if (id !== this.latestId || results.some((ok) => !ok)) return null;
    return { renderId: id, frame, values, ms: performance.now() - t0 };
  }
}
