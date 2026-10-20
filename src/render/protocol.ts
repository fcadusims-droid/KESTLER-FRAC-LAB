import type { Frame } from '../core/view.ts';
import type { FractalParams, Rect } from '../core/formulas/types.ts';
import type { ColorLut } from '../core/color/lut.ts';

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

/** Render, color and PNG-filter a full-width band of rows (export). */
export interface BandRequest {
  type: 'band';
  taskId: number;
  frame: Frame;
  params: FractalParams;
  lut: ColorLut;
  rect: Rect;
}

export interface BandResponse {
  type: 'band';
  taskId: number;
  /** Filtered RGB scanlines, rect.h * (1 + 3W) bytes, transferred. */
  data: ArrayBuffer;
  ms: number;
}

export interface ErrorResponse {
  type: 'error';
  taskId: number;
  message: string;
}

export type WorkerRequest = TileRequest | BandRequest;
export type WorkerResponse = TileResponse | BandResponse | ErrorResponse;
