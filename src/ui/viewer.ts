import type { FractalParams, Rect } from '../core/formulas/types.ts';
import type { Frame, View } from '../core/view.ts';
import { frameFromView, pan, screenToComplex, viewFromFrame, zoomAt } from '../core/view.ts';
import { colorize, type ColorLut } from '../core/color/index.ts';
import type { WorkerPool } from '../render/pool.ts';
import { RenderScheduler } from '../render/scheduler.ts';
import type { WebGpuRenderer } from '../render/gpu/webgpu.ts';
import { isFloat32Usable } from '../core/float32.ts';

export interface ViewerStats {
  phase: 'preview' | 'rendering' | 'done';
  /** Wall time of the last completed full-resolution render. */
  renderMs: number | null;
  width: number;
  height: number;
  maxIter: number;
  /** Human-readable active backend, e.g. "CPU float64 · 3 workers" or "WebGPU float32". */
  backend: string;
}

export interface ViewerCallbacks {
  onViewChange(view: View): void;
  onStats(stats: ViewerStats): void;
  onReset(): void;
}

/** A completed render (full or preview) that can be redrawn under a new view. */
interface BaseImage {
  frame: Frame;
  values: Float32Array;
  image: HTMLCanvasElement;
}

interface Progress {
  frame: Frame;
  values: Float32Array;
  done: Rect[];
}

const BACKGROUND = '#05070d';
const SETTLE_MS = 180;
const PREVIEW_PIXELS = 120_000;

/**
 * Owns the canvas: progressive rendering through the worker scheduler,
 * reprojection of the last image during interaction, instant recoloring from
 * the stored smooth-value buffer, and pointer/wheel/keyboard/touch input.
 */
export class Viewer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly scheduler: RenderScheduler;
  private gpu: WebGpuRenderer | null = null;
  private useGpu = false;
  private frame: Frame;
  private view: View;
  private lut: ColorLut | null = null;
  private paramsFor: ((view: View) => FractalParams) | null = null;
  private base: BaseImage | null = null;
  private progress: Progress | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | undefined;
  private requestToken = 0;
  private previewBusy = false;
  private previewDirty = false;
  private renderMs: number | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private readonly resizeObserver: ResizeObserver;
  private readonly abort = new AbortController();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly pool: WorkerPool,
    private readonly cb: ViewerCallbacks,
    initialView: View,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.scheduler = new RenderScheduler(pool);
    this.view = initialView;
    this.frame = frameFromView(initialView, 1, 1);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.attachInput();
    this.resize();
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    this.abort.abort();
    clearTimeout(this.settleTimer);
    this.scheduler.cancel();
    this.gpu?.cancel();
  }

  /** Current frame in device pixels. */
  get currentFrame(): Frame {
    return this.frame;
  }

  setView(view: View): void {
    if (view.cx === this.view.cx && view.cy === this.view.cy && view.span === this.view.span) return;
    this.view = view;
    this.frame = frameFromView(view, this.frame.width, this.frame.height);
    this.requestRender('immediate');
  }

  setParamsResolver(fn: (view: View) => FractalParams): void {
    this.paramsFor = fn;
    // The old base image stays on screen (reprojected) until the new preview arrives.
    this.requestRender('immediate');
  }

  /** Enables the float32 WebGPU backend for the interactive view (exports always use CPU float64). */
  setGpu(gpu: WebGpuRenderer | null, enabled: boolean): void {
    if (gpu === this.gpu && enabled === this.useGpu) return;
    this.gpu?.cancel();
    this.gpu = gpu;
    this.useGpu = enabled;
    this.requestRender('immediate');
  }

  /** The backend is chosen from the full-resolution frame so preview and final pass agree. */
  private backend(): { gpu: boolean; label: string } {
    const cpu = `CPU float64 · ${this.pool.size} worker${this.pool.size === 1 ? '' : 's'}`;
    if (!this.gpu || !this.useGpu) return { gpu: false, label: cpu };
    if (this.gpu.lost) return { gpu: false, label: `${cpu} (GPU device lost)` };
    if (!isFloat32Usable(this.frame)) return { gpu: false, label: `${cpu} (zoom too deep for float32)` };
    if (!this.gpu.canRender(this.frame)) return { gpu: false, label: `${cpu} (canvas too large for GPU buffer)` };
    return { gpu: true, label: `WebGPU float32 · ${this.gpu.adapterName}` };
  }

  private compute(frame: Frame, params: FractalParams, gpu: boolean, opts: { tileSize?: number; onTile?: (rect: Rect, values: Float32Array) => void } = {}) {
    if (gpu) {
      this.scheduler.cancel();
      return this.gpu!.render(frame, params);
    }
    this.gpu?.cancel();
    return this.scheduler.render(frame, params, opts);
  }

  setLut(lut: ColorLut): void {
    const first = !this.lut;
    this.lut = lut;
    if (first) {
      this.requestRender('immediate');
      return;
    }
    if (this.base) this.paintBase(this.base);
    this.drawBase();
    const pr = this.progress;
    if (pr) for (const rect of pr.done) this.paintRect(pr.frame, pr.values, rect);
  }

  // ---- rendering ------------------------------------------------------------

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (w === this.frame.width && h === this.frame.height) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.frame = frameFromView(this.view, w, h);
    this.requestRender('immediate');
  }

  private params(): FractalParams | null {
    return this.paramsFor ? this.paramsFor(this.view) : null;
  }

  /**
   * interactive: show a reprojection + low-res preview now, full render once input settles.
   * immediate: preview, then full render as soon as the preview is done.
   */
  private requestRender(kind: 'interactive' | 'immediate'): void {
    if (!this.paramsFor || !this.lut || this.frame.width < 2) return;
    const token = ++this.requestToken;
    this.progress = null;
    this.drawBase();
    clearTimeout(this.settleTimer);
    if (kind === 'interactive') {
      this.runPreview();
      this.settleTimer = setTimeout(() => this.runFull(token), SETTLE_MS);
    } else {
      this.runPreview(() => this.runFull(token));
    }
  }

  private previewFrame(): Frame {
    const f = this.frame;
    const step = Math.max(2, Math.ceil(Math.sqrt((f.width * f.height) / PREVIEW_PIXELS)));
    const w = Math.ceil(f.width / step);
    const h = Math.ceil(f.height / step);
    // Same center, pixels `step` times larger; covers the canvas (possibly slightly more).
    return { cx: f.cx, cy: f.cy, scale: f.scale * step, width: w, height: h };
  }

  /** Runs one preview at a time; if the view changed meanwhile, runs another. */
  private runPreview(then?: () => void): void {
    if (this.previewBusy) {
      this.previewDirty = true;
      if (then) this.afterPreview = then;
      return;
    }
    const params = this.params();
    if (!params) return;
    this.previewBusy = true;
    this.previewDirty = false;
    this.afterPreview = then ?? null;
    const frame = this.previewFrame();
    const backend = this.backend();
    this.emitStats('preview', params.maxIter, backend.label);
    this.compute(frame, params, backend.gpu, { tileSize: 64 })
      .then((res) => {
        if (res) {
          this.base = this.makeBase(frame, res.values);
          if (!this.progress) this.drawBase();
        }
      })
      .catch((err) => console.error('Preview render failed', err))
      .finally(() => {
        this.previewBusy = false;
        const next = this.afterPreview;
        this.afterPreview = null;
        if (this.previewDirty) this.runPreview(next ?? undefined);
        else next?.();
      });
  }

  private afterPreview: (() => void) | null = null;

  private runFull(token: number): void {
    if (token !== this.requestToken) return;
    const params = this.params();
    if (!params) return;
    const frame = this.frame;
    const progress: Progress = { frame, values: new Float32Array(frame.width * frame.height), done: [] };
    this.progress = progress;
    const backend = this.backend();
    this.emitStats('rendering', params.maxIter, backend.label);
    this.compute(frame, params, backend.gpu, {
        onTile: (rect, values) => {
          if (this.progress !== progress) return;
          for (let r = 0; r < rect.h; r++) progress.values.set(values.subarray(r * rect.w, (r + 1) * rect.w), (rect.y + r) * frame.width + rect.x);
          progress.done.push(rect);
          this.paintRect(frame, progress.values, rect);
        },
      })
      .then((res) => {
        if (!res || this.progress !== progress) return;
        this.progress = null;
        this.renderMs = res.ms;
        if (backend.gpu) {
          // The GPU path delivers the whole frame at once.
          this.base = this.makeBase(frame, res.values);
          this.drawBase();
        } else {
          const image = document.createElement('canvas');
          image.width = frame.width;
          image.height = frame.height;
          image.getContext('2d')!.drawImage(this.canvas, 0, 0);
          this.base = { frame, values: res.values, image };
        }
        this.emitStats('done', params.maxIter, backend.label);
      })
      .catch((err) => console.error('Render failed', err));
  }

  private makeBase(frame: Frame, values: Float32Array): BaseImage {
    const image = document.createElement('canvas');
    image.width = frame.width;
    image.height = frame.height;
    const base = { frame, values, image };
    this.paintBase(base);
    return base;
  }

  private paintBase(base: BaseImage): void {
    if (!this.lut) return;
    const ctx = base.image.getContext('2d')!;
    const img = ctx.createImageData(base.frame.width, base.frame.height);
    colorize(base.values, base.values.length, this.lut, img.data);
    ctx.putImageData(img, 0, 0);
  }

  /** Draws the base image transformed into the current frame. */
  private drawBase(): void {
    const ctx = this.ctx;
    const f = this.frame;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, f.width, f.height);
    const b = this.base;
    if (!b) return;
    const [re, im] = screenToComplex(b.frame, 0, 0);
    const x = (re - f.cx) / f.scale + f.width / 2;
    const y = (f.cy - im) / f.scale + f.height / 2;
    const k = b.frame.scale / f.scale;
    ctx.imageSmoothingEnabled = k > 1.01;
    ctx.drawImage(b.image, x, y, b.frame.width * k, b.frame.height * k);
  }

  private paintRect(frame: Frame, values: Float32Array, rect: Rect): void {
    if (!this.lut || frame !== this.frame) return;
    const img = this.ctx.createImageData(rect.w, rect.h);
    for (let r = 0; r < rect.h; r++) {
      colorize(values, rect.w, this.lut, img.data, r * rect.w * 4, (rect.y + r) * frame.width + rect.x);
    }
    this.ctx.putImageData(img, rect.x, rect.y);
  }

  private emitStats(phase: ViewerStats['phase'], maxIter: number, backend: string): void {
    this.cb.onStats({ phase, renderMs: this.renderMs, width: this.frame.width, height: this.frame.height, maxIter, backend });
  }

  // ---- input ------------------------------------------------------------------

  private applyFrame(frame: Frame): void {
    this.frame = frame;
    this.view = viewFromFrame(frame);
    this.cb.onViewChange(this.view);
    this.requestRender('interactive');
  }

  private toDevice(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * this.frame.width, y: ((e.clientY - r.top) / r.height) * this.frame.height };
  }

  private attachInput(): void {
    const c = this.canvas;
    const opts = { signal: this.abort.signal };
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? c.clientHeight : 1;
        const delta = Math.max(-600, Math.min(600, e.deltaY * unit));
        const p = this.toDevice(e);
        this.applyFrame(zoomAt(this.frame, p.x, p.y, Math.exp(-delta * 0.0015)));
      },
      { passive: false, signal: this.abort.signal },
    );
    c.addEventListener(
      'pointerdown',
      (e) => {
        c.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, this.toDevice(e));
        c.focus({ preventScroll: true });
      },
      opts,
    );
    c.addEventListener(
      'pointermove',
      (e) => {
        const prev = this.pointers.get(e.pointerId);
        if (!prev) return;
        const cur = this.toDevice(e);
        if (this.pointers.size === 1) {
          this.pointers.set(e.pointerId, cur);
          if (cur.x !== prev.x || cur.y !== prev.y) this.applyFrame(pan(this.frame, cur.x - prev.x, cur.y - prev.y));
          return;
        }
        // Pinch: use the first two active pointers.
        const ids = [...this.pointers.keys()].slice(0, 2);
        if (!ids.includes(e.pointerId)) return;
        const other = this.pointers.get(ids[0] === e.pointerId ? ids[1] : ids[0])!;
        const oldMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
        const newMid = { x: (cur.x + other.x) / 2, y: (cur.y + other.y) / 2 };
        const oldDist = Math.hypot(prev.x - other.x, prev.y - other.y);
        const newDist = Math.hypot(cur.x - other.x, cur.y - other.y);
        this.pointers.set(e.pointerId, cur);
        if (oldDist < 1 || newDist < 1) return;
        const panned = pan(this.frame, newMid.x - oldMid.x, newMid.y - oldMid.y);
        this.applyFrame(zoomAt(panned, newMid.x, newMid.y, newDist / oldDist));
      },
      opts,
    );
    const up = (e: PointerEvent) => this.pointers.delete(e.pointerId);
    c.addEventListener('pointerup', up, opts);
    c.addEventListener('pointercancel', up, opts);
    c.addEventListener(
      'dblclick',
      (e) => {
        const p = this.toDevice(e);
        this.applyFrame(zoomAt(this.frame, p.x, p.y, e.shiftKey ? 0.5 : 2));
      },
      opts,
    );
    window.addEventListener(
      'keydown',
      (e) => {
        const t = e.target as HTMLElement | null;
        if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName)) && t !== c) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const f = this.frame;
        const step = Math.min(f.width, f.height) * 0.1;
        switch (e.key) {
          case 'ArrowLeft':
            this.applyFrame(pan(f, step, 0));
            break;
          case 'ArrowRight':
            this.applyFrame(pan(f, -step, 0));
            break;
          case 'ArrowUp':
            this.applyFrame(pan(f, 0, step));
            break;
          case 'ArrowDown':
            this.applyFrame(pan(f, 0, -step));
            break;
          case '+':
          case '=':
            this.applyFrame(zoomAt(f, f.width / 2, f.height / 2, 1.5));
            break;
          case '-':
          case '_':
            this.applyFrame(zoomAt(f, f.width / 2, f.height / 2, 1 / 1.5));
            break;
          case 'r':
          case 'R':
            this.cb.onReset();
            break;
          default:
            return;
        }
        e.preventDefault();
      },
      opts,
    );
  }
}
