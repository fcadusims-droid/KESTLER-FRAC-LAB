import type { ViewerStats } from './viewer.ts';

interface Props {
  cx: number;
  cy: number;
  zoom: number;
  stats: ViewerStats | null;
  backend: string;
  precisionWarning: boolean;
}

function fmtZoom(z: number): string {
  if (z < 1e4) return `${z.toPrecision(4).replace(/\.?0+$/, '')}×`;
  return `${z.toExponential(2)}×`;
}

export function InfoOverlay({ cx, cy, zoom, stats, backend, precisionWarning }: Props) {
  return (
    <div className="overlay" aria-live="polite">
      <div className="overlay-grid">
        <span>Re</span>
        <code data-testid="center-re">{String(cx)}</code>
        <span>Im</span>
        <code data-testid="center-im">{String(cy)}</code>
        <span>Zoom</span>
        <code data-testid="zoom">{fmtZoom(zoom)}</code>
        <span>Iterations</span>
        <code>{stats ? stats.maxIter.toLocaleString('en-US') : '—'}</code>
        <span>Backend</span>
        <code>{backend}</code>
        <span>Render</span>
        <code data-testid="render-status">
          {!stats
            ? 'starting…'
            : stats.phase === 'done'
              ? `${stats.renderMs?.toFixed(0)} ms · ${stats.width}×${stats.height}`
              : stats.phase === 'preview'
                ? 'preview…'
                : 'rendering…'}
        </code>
      </div>
      {precisionWarning && (
        <p className="warning" role="alert" data-testid="precision-warning">
          At the limit of double precision: adjacent pixels are no longer distinguishable in float64, so the image
          breaks into blocks. Deep zoom (perturbation / arbitrary precision) is not implemented.
        </p>
      )}
    </div>
  );
}
