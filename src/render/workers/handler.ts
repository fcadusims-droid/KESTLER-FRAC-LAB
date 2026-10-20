import { FLOAT64_BACKEND } from '../../core/precision.ts';
import type { WorkerRequest, WorkerResponse } from '../protocol.ts';
import { renderFilteredBand } from '../../export/band.ts';

/**
 * Pure request handler shared by the real worker and the in-process test
 * worker. Returns the response and the buffers to transfer.
 */
export function handleRequest(req: WorkerRequest): { response: WorkerResponse; transfer: ArrayBuffer[] } {
  try {
    const t0 = performance.now();
    if (req.type === 'band') {
      const data = renderFilteredBand(req.frame, req.params, req.lut, req.rect).buffer as ArrayBuffer;
      return { response: { type: 'band', taskId: req.taskId, data, ms: performance.now() - t0 }, transfer: [data] };
    }
    const out = new Float32Array(req.rect.w * req.rect.h);
    FLOAT64_BACKEND.renderTile(req.frame, req.params, req.rect, out);
    const values = out.buffer as ArrayBuffer;
    return { response: { type: 'tile', taskId: req.taskId, values, ms: performance.now() - t0 }, transfer: [values] };
  } catch (err) {
    return { response: { type: 'error', taskId: req.taskId, message: err instanceof Error ? err.message : String(err) }, transfer: [] };
  }
}
