import { WorkerPool, defaultPoolSize, type WorkerLike } from './pool.ts';

function createWorker(): WorkerLike {
  return new Worker(new URL('./workers/render.worker.ts', import.meta.url), { type: 'module', name: 'fractal-render' }) as unknown as WorkerLike;
}

export function createBrowserPool(size = defaultPoolSize(navigator.hardwareConcurrency)): WorkerPool {
  return new WorkerPool(createWorker, size);
}

let previewPool: WorkerPool | null = null;

/** The interactive preview pool lives for the lifetime of the page. */
export function getPreviewPool(): WorkerPool {
  previewPool ??= createBrowserPool();
  return previewPool;
}
