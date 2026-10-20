import type { WorkerRequest, WorkerResponse } from './protocol.ts';

/** Minimal surface of a Worker, so tests can substitute an in-process fake. */
export interface WorkerLike {
  postMessage(message: WorkerRequest, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
  terminate(): void;
}

export type WorkerFactory = () => WorkerLike;

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

interface Task {
  /** Group id used for cancellation (render id or export id). */
  group: number;
  request: WorkerRequest;
  transfer: Transferable[];
  resolve: (r: WorkerResponse) => void;
  reject: (e: Error) => void;
}

interface Slot {
  worker: WorkerLike;
  task: Task | null;
}

export function defaultPoolSize(hardwareConcurrency: number | undefined): number {
  const hc = hardwareConcurrency && hardwareConcurrency > 0 ? hardwareConcurrency : 4;
  return Math.max(1, Math.min(8, hc - 1));
}

/**
 * Fixed-size worker pool with a FIFO queue. One task per worker at a time keeps
 * cancellation latency to one tile. Queued tasks of a cancelled group are dropped
 * without ever reaching a worker; in-flight tasks complete and the caller
 * discards their results by id.
 */
export class WorkerPool {
  private slots: Slot[] = [];
  private queue: Task[] = [];
  private nextTaskId = 1;
  /** Count of tasks actually posted to workers (for tests and diagnostics). */
  posted = 0;

  constructor(
    factory: WorkerFactory,
    readonly size: number,
  ) {
    for (let i = 0; i < size; i++) {
      const slot: Slot = { worker: factory(), task: null };
      slot.worker.onmessage = (e) => this.onMessage(slot, e.data);
      slot.worker.onerror = (e) => this.onError(slot, e);
      this.slots.push(slot);
    }
  }

  run(group: number, request: Omit<WorkerRequest, 'taskId'>, transfer: Transferable[] = []): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      const full = { ...request, taskId: this.nextTaskId++ } as WorkerRequest;
      this.queue.push({ group, request: full, transfer, resolve, reject });
      this.pump();
    });
  }

  /** Drops queued tasks whose group matches; they reject with CancelledError. */
  cancel(predicate: (group: number) => boolean): number {
    const keep: Task[] = [];
    const dropped: Task[] = [];
    for (const t of this.queue) (predicate(t.group) ? dropped : keep).push(t);
    this.queue = keep;
    for (const t of dropped) t.reject(new CancelledError());
    return dropped.length;
  }

  get pending(): number {
    return this.queue.length + this.slots.filter((s) => s.task).length;
  }

  terminate(): void {
    this.cancel(() => true);
    for (const s of this.slots) {
      s.task?.reject(new CancelledError());
      s.worker.terminate();
    }
    this.slots = [];
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.task || this.queue.length === 0) continue;
      const task = this.queue.shift()!;
      slot.task = task;
      this.posted++;
      slot.worker.postMessage(task.request, task.transfer);
    }
  }

  private onMessage(slot: Slot, response: WorkerResponse): void {
    const task = slot.task;
    slot.task = null;
    if (task) {
      if (response.type === 'error') task.reject(new Error(response.message));
      else task.resolve(response);
    }
    this.pump();
  }

  private onError(slot: Slot, e: ErrorEvent): void {
    const task = slot.task;
    slot.task = null;
    task?.reject(new Error(e.message || 'Worker error'));
    this.pump();
  }
}
