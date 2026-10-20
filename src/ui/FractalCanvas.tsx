import { useEffect, useRef } from 'react';
import type { View } from '../core/view.ts';
import type { FractalParams } from '../core/formulas/types.ts';
import type { ColorLut } from '../core/color/lut.ts';
import type { WorkerPool } from '../render/pool.ts';
import { Viewer, type ViewerStats } from './viewer.ts';

interface Props {
  pool: WorkerPool;
  view: View;
  paramsFor: (view: View) => FractalParams;
  lut: ColorLut;
  onViewChange: (view: View) => void;
  onStats: (stats: ViewerStats) => void;
  onReset: () => void;
}

export function FractalCanvas({ pool, view, paramsFor, lut, onViewChange, onStats, onReset }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const cbRef = useRef({ onViewChange, onStats, onReset });
  useEffect(() => {
    cbRef.current = { onViewChange, onStats, onReset };
  });

  useEffect(() => {
    const viewer = new Viewer(
      canvasRef.current!,
      pool,
      {
        onViewChange: (v) => cbRef.current.onViewChange(v),
        onStats: (s) => cbRef.current.onStats(s),
        onReset: () => cbRef.current.onReset(),
      },
      view,
    );
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
    // The viewer is created once per pool; later view changes go through setView.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  useEffect(() => viewerRef.current?.setView(view), [view]);
  useEffect(() => viewerRef.current?.setParamsResolver(paramsFor), [paramsFor]);
  useEffect(() => viewerRef.current?.setLut(lut), [lut]);

  return (
    <canvas
      ref={canvasRef}
      className="fractal-canvas"
      data-testid="fractal-canvas"
      tabIndex={0}
      aria-label="Fractal view. Drag to pan, scroll or pinch to zoom, arrow keys pan, plus and minus zoom, R resets."
    />
  );
}
