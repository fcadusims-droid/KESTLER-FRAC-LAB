import type { FractalParams } from '../../core/formulas/types.ts';
import type { Frame } from '../../core/view.ts';
import { FRACTAL_WGSL } from './shader.wgsl.ts';

// Flag values from the WebGPU spec (the TS DOM lib declares the types but not these globals).
const BUFFER_MAP_READ = 0x0001;
const BUFFER_COPY_SRC = 0x0004;
const BUFFER_COPY_DST = 0x0008;
const BUFFER_UNIFORM = 0x0040;
const BUFFER_STORAGE = 0x0080;
const MAP_MODE_READ = 0x0001;

const FORMULA_CODE = { mandelbrot: 0, julia: 1, burningShip: 2 } as const;
/** Pixels per dispatch; keeps each submission short (GPU watchdogs) and allows early cancel. */
const PIXELS_PER_CHUNK = 256 * 1024;

/**
 * float32 WebGPU compute backend for interactive previews. Returns the same
 * kind of smooth-value buffer as the CPU backend. Renders are numbered; a
 * superseded render stops between chunks and resolves to null.
 */
export class WebGpuRenderer {
  private latestId = 0;
  lost = false;

  private constructor(
    private readonly device: GPUDevice,
    private readonly pipeline: GPUComputePipeline,
    readonly adapterName: string,
  ) {
    device.lost.then(() => {
      this.lost = true;
    });
  }

  /** Feature detection: resolves to null when WebGPU (or an adapter) is unavailable. */
  static async create(): Promise<WebGpuRenderer | null> {
    try {
      if (typeof navigator === 'undefined' || !navigator.gpu) return null;
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const module = device.createShaderModule({ code: FRACTAL_WGSL });
      const info = await module.getCompilationInfo();
      if (info.messages.some((m) => m.type === 'error')) {
        console.warn('WebGPU shader failed to compile', info.messages);
        device.destroy();
        return null;
      }
      const pipeline = await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'main' } });
      const name = [adapter.info?.vendor, adapter.info?.architecture].filter(Boolean).join(' ') || 'GPU';
      return new WebGpuRenderer(device, pipeline, name);
    } catch (err) {
      console.warn('WebGPU unavailable', err);
      return null;
    }
  }

  canRender(frame: Frame): boolean {
    return !this.lost && frame.width * frame.height * 4 <= this.device.limits.maxStorageBufferBindingSize;
  }

  cancel(): void {
    this.latestId++;
  }

  async render(frame: Frame, params: FractalParams): Promise<{ values: Float32Array; ms: number } | null> {
    const id = ++this.latestId;
    const t0 = performance.now();
    const { device } = this;
    const { width, height } = frame;
    const bytes = width * height * 4;
    const out = device.createBuffer({ size: bytes, usage: BUFFER_STORAGE | BUFFER_COPY_SRC });
    const read = device.createBuffer({ size: bytes, usage: BUFFER_COPY_DST | BUFFER_MAP_READ });
    const uniform = device.createBuffer({ size: 48, usage: BUFFER_UNIFORM | BUFFER_COPY_DST });
    const bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniform } },
        { binding: 1, resource: { buffer: out } },
      ],
    });
    try {
      const u = new ArrayBuffer(48);
      const f = new Float32Array(u);
      const i = new Uint32Array(u);
      f[0] = frame.cx;
      f[1] = frame.cy;
      f[2] = frame.scale;
      f[3] = params.escapeRadius * params.escapeRadius;
      f[4] = params.juliaRe;
      f[5] = params.juliaIm;
      i[6] = width;
      i[7] = height;
      i[8] = params.maxIter;
      i[9] = FORMULA_CODE[params.formula];
      const rowsPerChunk = Math.max(1, Math.floor(PIXELS_PER_CHUNK / width));
      for (let row = 0; row < height; row += rowsPerChunk) {
        if (id !== this.latestId || this.lost) return null;
        const rows = Math.min(rowsPerChunk, height - row);
        i[10] = row;
        device.queue.writeBuffer(uniform, 0, u);
        const enc = device.createCommandEncoder();
        const pass = enc.beginComputePass();
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(width / 8), Math.ceil(rows / 8));
        pass.end();
        device.queue.submit([enc.finish()]);
        await device.queue.onSubmittedWorkDone();
      }
      if (id !== this.latestId || this.lost) return null;
      const enc = device.createCommandEncoder();
      enc.copyBufferToBuffer(out, 0, read, 0, bytes);
      device.queue.submit([enc.finish()]);
      await read.mapAsync(MAP_MODE_READ);
      const values = new Float32Array(read.getMappedRange().slice(0));
      read.unmap();
      if (id !== this.latestId) return null;
      return { values, ms: performance.now() - t0 };
    } finally {
      out.destroy();
      read.destroy();
      uniform.destroy();
    }
  }
}

let gpuPromise: Promise<WebGpuRenderer | null> | null = null;

/** Detects WebGPU once per page. */
export function getWebGpuRenderer(): Promise<WebGpuRenderer | null> {
  gpuPromise ??= WebGpuRenderer.create();
  return gpuPromise;
}
