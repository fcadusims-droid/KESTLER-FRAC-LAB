import { useRef, useState } from 'react';
import { frameFromView } from '../../core/view.ts';
import { buildLut } from '../../core/color/lut.ts';
import { createBrowserPool } from '../../render/createPool.ts';
import { defaultPoolSize } from '../../render/pool.ts';
import { defaultBandRows, exportPng, ExportCancelledError, type ExportResult } from '../../export/exporter.ts';
import { estimateExport, formatBytes } from '../../export/estimate.ts';
import { canStreamToDisk, MemorySink, pickFileSink, type ByteSink } from '../../export/sink.ts';
import { MAX_EXPORT_DIM, MAX_EXPORT_PIXELS } from '../../project/validate.ts';
import { PNG_TEXT_KEYWORD, projectAsciiJson } from '../../project/project.ts';
import { fractalParams, type FractalState } from '../../project/state.ts';
import { Section } from '../controls.tsx';
import type { ViewerStats } from '../viewer.ts';

const PRESETS = [
  { label: '1920 × 1080 (Full HD)', width: 1920, height: 1080 },
  { label: '3840 × 2160 (4K UHD)', width: 3840, height: 2160 },
  { label: '7680 × 4320 (8K UHD)', width: 7680, height: 4320 },
  { label: '15360 × 8640 (16K)', width: 15360, height: 8640 },
];

const LARGE_PIXELS = 7680 * 4320;

interface Props {
  state: FractalState;
  stats: ViewerStats | null;
  onSize: (size: { width: number; height: number }) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'running'; percent: number; bytes: number; sinkKind: ByteSink['kind'] }
  | { kind: 'done'; result: ExportResult; sinkKind: ByteSink['kind'] }
  | { kind: 'error'; message: string }
  | { kind: 'cancelled' };

function validateDim(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const v = Number(text);
  return v >= 1 && v <= MAX_EXPORT_DIM ? v : null;
}

function fileName(state: FractalState, w: number, h: number): string {
  return `fractal-${state.formula}-${w}x${h}.png`;
}

export function ExportPanel({ state, stats, onSize }: Props) {
  const { width, height } = state.exportSize;
  const presetIndex = PRESETS.findIndex((p) => p.width === width && p.height === height);
  const [customMode, setCustom] = useState(presetIndex < 0);
  // A loaded project or link may carry a non-preset size.
  const custom = customMode || presetIndex < 0;
  const [wText, setWText] = useState(String(width));
  const [hText, setHText] = useState(String(height));
  const [syncedSize, setSyncedSize] = useState(state.exportSize);
  if (syncedSize !== state.exportSize) {
    // Size changed from outside (project load): show it in the custom fields.
    setSyncedSize(state.exportSize);
    if (validateDim(wText) !== width || validateDim(hText) !== height) {
      setWText(String(width));
      setHText(String(height));
    }
  }
  const [embed, setEmbed] = useState(true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const streaming = canStreamToDisk();
  const poolSize = defaultPoolSize(navigator.hardwareConcurrency);
  const w = custom ? validateDim(wText) : width;
  const h = custom ? validateDim(hText) : height;
  const sizeError =
    w === null || h === null
      ? `Width and height must be whole numbers from 1 to ${MAX_EXPORT_DIM}.`
      : w * h > MAX_EXPORT_PIXELS
        ? `At most ${(MAX_EXPORT_PIXELS / 1e6).toFixed(0)} megapixels.`
        : null;

  const msPerPixel = stats?.renderMs != null && stats.width > 0 ? stats.renderMs / (stats.width * stats.height) : null;
  const est = !sizeError && w && h ? estimateExport(w, h, defaultBandRows(w), poolSize, msPerPixel) : null;
  const running = status.kind === 'running';
  const aspectDiffers = stats && w && h && Math.abs(w / h - stats.width / stats.height) > 0.01;

  const commitCustom = (wt: string, ht: string) => {
    const nw = validateDim(wt);
    const nh = validateDim(ht);
    if (nw && nh && nw * nh <= MAX_EXPORT_PIXELS) onSize({ width: nw, height: nh });
  };

  async function start() {
    if (!w || !h || sizeError) return;
    let sink: ByteSink;
    // The save dialog must open directly from the click, before any other await.
    if (streaming) {
      try {
        const fileSink = await pickFileSink(fileName(state, w, h));
        if (!fileSink) return;
        sink = fileSink;
      } catch (err) {
        setStatus({ kind: 'error', message: `Could not open the file for writing: ${(err as Error).message}` });
        return;
      }
    } else {
      sink = new MemorySink();
    }
    const ac = new AbortController();
    abortRef.current = ac;
    const pool = createBrowserPool(poolSize);
    setStatus({ kind: 'running', percent: 0, bytes: 0, sinkKind: sink.kind });
    try {
      const result = await exportPng(
        pool,
        {
          frame: frameFromView(state.view, w, h),
          params: fractalParams(state),
          lut: buildLut(state.palette, state.color),
          text: embed ? { [PNG_TEXT_KEYWORD]: projectAsciiJson({ ...state, exportSize: { width: w, height: h } }) } : undefined,
        },
        sink,
        (p) => setStatus({ kind: 'running', percent: (100 * p.rowsDone) / p.totalRows, bytes: p.bytesWritten, sinkKind: sink.kind }),
        ac.signal,
      );
      if (sink instanceof MemorySink) {
        const url = URL.createObjectURL(sink.toBlob());
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName(state, w, h);
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      setStatus({ kind: 'done', result, sinkKind: sink.kind });
    } catch (err) {
      if (err instanceof ExportCancelledError) setStatus({ kind: 'cancelled' });
      else {
        const msg = err instanceof Error ? err.message : String(err);
        const hint = /allocation|memory|Array buffer/i.test(msg) ? ' The browser likely ran out of memory; try a smaller size.' : '';
        setStatus({ kind: 'error', message: `Export failed: ${msg}.${hint}` });
      }
    } finally {
      pool.terminate();
      abortRef.current = null;
    }
  }

  return (
    <Section title="Export PNG">
      <div className="field">
        <label htmlFor="export-size">Size</label>
        <select
          id="export-size"
          disabled={running}
          value={custom ? -1 : presetIndex}
          onChange={(e) => {
            const i = Number(e.target.value);
            if (i < 0) {
              setCustom(true);
              setWText(String(width));
              setHText(String(height));
            } else {
              setCustom(false);
              onSize({ width: PRESETS[i].width, height: PRESETS[i].height });
            }
          }}
        >
          {PRESETS.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
          <option value={-1}>Custom…</option>
        </select>
      </div>
      {custom && (
        <div className="row">
          <label className="inline-field">
            W
            <input
              aria-label="Export width"
              inputMode="numeric"
              className={validateDim(wText) === null ? 'invalid' : undefined}
              value={wText}
              disabled={running}
              onChange={(e) => {
                setWText(e.target.value);
                commitCustom(e.target.value, hText);
              }}
            />
          </label>
          <label className="inline-field">
            H
            <input
              aria-label="Export height"
              inputMode="numeric"
              className={validateDim(hText) === null ? 'invalid' : undefined}
              value={hText}
              disabled={running}
              onChange={(e) => {
                setHText(e.target.value);
                commitCustom(wText, e.target.value);
              }}
            />
          </label>
        </div>
      )}
      {sizeError && (
        <p className="error-text" role="alert">
          {sizeError}
        </p>
      )}

      {est && (
        <dl className="estimate" data-testid="export-estimate">
          <dt>Pixels</dt>
          <dd>
            {w}×{h} = {(est.pixels / 1e6).toFixed(1)} MP
          </dd>
          <dt>Working memory</dt>
          <dd>~{formatBytes(est.workingBytes)}</dd>
          <dt>Output</dt>
          <dd>
            {streaming
              ? 'Streams straight to the file you choose.'
              : `Downloads at the end; the compressed file (~${formatBytes(est.fileBytesLow)}–${formatBytes(est.fileBytesHigh)}) is held in memory.`}
          </dd>
          <dt>Time</dt>
          <dd>{est.seconds === null ? 'unknown until the preview finishes' : `roughly ${est.seconds < 90 ? `${Math.max(1, Math.round(est.seconds))} s` : `${Math.round(est.seconds / 60)} min`}`}</dd>
        </dl>
      )}
      {!streaming && w && h && w * h >= LARGE_PIXELS && (
        <p className="warning-text" role="alert">
          This browser cannot stream files to disk (no File System Access API), so the whole compressed PNG must fit
          in memory. At this size the export may fail. Chrome or Edge on desktop can stream instead.
        </p>
      )}
      {aspectDiffers && (
        <p className="hint">
          The export's aspect ratio differs from the screen. The same span is kept across the shorter side, so the
          framing will differ from what you see.
        </p>
      )}
      <label className="check">
        <input type="checkbox" checked={embed} disabled={running} onChange={(e) => setEmbed(e.target.checked)} />
        Embed project settings in the PNG (tEXt)
      </label>
      <div className="row">
        <button type="button" className="primary" onClick={start} disabled={running || !!sizeError}>
          {streaming ? 'Export PNG…' : 'Export PNG'}
        </button>
        {running && (
          <button type="button" onClick={() => abortRef.current?.abort()}>
            Cancel
          </button>
        )}
      </div>

      {status.kind === 'running' && (
        <div className="progress" data-testid="export-progress">
          <progress max={100} value={status.percent} aria-label="Export progress" />
          <span>
            {status.percent.toFixed(1)}% · {formatBytes(status.bytes)} written
          </span>
        </div>
      )}
      {status.kind === 'done' && (
        <p className="success-text" role="status" data-testid="export-done">
          Done: {status.result.width}×{status.result.height} PNG, {formatBytes(status.result.bytes)} in{' '}
          {(status.result.ms / 1000).toFixed(1)} s{status.sinkKind === 'memory' ? ' (downloaded)' : ' (saved to disk)'}.
        </p>
      )}
      {status.kind === 'cancelled' && <p className="hint">Export cancelled. No file was produced.</p>}
      {status.kind === 'error' && (
        <p className="error-text" role="alert">
          {status.message}
        </p>
      )}
    </Section>
  );
}
