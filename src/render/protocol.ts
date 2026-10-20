import type { Frame } from '../core/view.ts';
import type { FractalParams, Rect } from '../core/formulas/types.ts';

/** Compute smooth escape values for one tile of a frame. */
export interface TileRequest {
  type: 'tile';
  taskId: number;
  frame: Frame;
  params: FractalParams;
  rect: Rect;
}

export interface TileResponse {
  type: 'tile';
  taskId: number;
  /** Float32 values, rect.w * rect.h, transferred. */
  values: ArrayBuffer;
  ms: number;
}

export interface ErrorResponse {
  type: 'error';
  taskId: number;
  message: string;
}

export type WorkerRequest = TileRequest;
export type WorkerResponse = TileResponse | ErrorResponse;
