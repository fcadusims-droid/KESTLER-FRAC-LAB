import { WorkerPool, type WorkerLike } from '../../src/render/pool.ts';
import { handleRequest } from '../../src/render/workers/handler.ts';
import type { WorkerRequest, WorkerResponse } from '../../src/render/protocol.ts';

/** In-process worker: runs the real handler asynchronously. */
export class FakeWorker implements WorkerLike {
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

export function fakePool(size: number) {
  const workers: FakeWorker[] = [];
  const pool = new WorkerPool(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  }, size);
  return { pool, workers, executed: () => workers.reduce((a, w) => a + w.executed, 0) };
}
