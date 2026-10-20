import { useCallback, useEffect, useMemo, useState } from 'react';
import type { View } from '../core/view.ts';
import { FORMULAS, type FormulaId } from '../core/formulas/index.ts';
import { buildLut } from '../core/color/index.ts';
import { isBeyondFloat64Precision } from '../core/precision.ts';
import { getPreviewPool } from '../render/createPool.ts';
import { decodeHash, encodeHash } from '../project/hash.ts';
import { defaultState, fractalParams, stateZoom, type FractalState } from '../project/state.ts';
import { FractalCanvas } from './FractalCanvas.tsx';
import { InfoOverlay } from './InfoOverlay.tsx';
import { FormulaPanel } from './panels/FormulaPanel.tsx';
import { ColorPanel } from './panels/ColorPanel.tsx';
import { ExportPanel } from './panels/ExportPanel.tsx';
import type { ViewerStats } from './viewer.ts';

function initialState(): { state: FractalState; error: string | null } {
  try {
    const fromHash = decodeHash(window.location.hash);
    if (fromHash) return { state: fromHash, error: null };
  } catch (err) {
    return { state: defaultState(), error: `Could not read the link: ${(err as Error).message}` };
  }
  return { state: defaultState(), error: null };
}

export function App() {
  const [init] = useState(initialState);
  const [state, setState] = useState<FractalState>(init.state);
  const [notice, setNotice] = useState<string | null>(init.error);
  const [stats, setStats] = useState<ViewerStats | null>(null);
  const pool = getPreviewPool();

  const patch = useCallback((p: Partial<FractalState>) => setState((s) => ({ ...s, ...p })), []);
  const setView = useCallback((view: View) => setState((s) => ({ ...s, view })), []);
  const resetView = useCallback(() => setState((s) => ({ ...s, view: { ...FORMULAS[s.formula].defaultView } })), []);
  const setFormula = useCallback(
    (formula: FormulaId) => setState((s) => ({ ...s, formula, view: { ...FORMULAS[formula].defaultView } })),
    [],
  );

  // Keep the URL hash in sync (debounced) so every view is a shareable link.
  useEffect(() => {
    const t = setTimeout(() => {
      const hash = encodeHash(state);
      if (hash !== window.location.hash) history.replaceState(null, '', hash);
    }, 250);
    return () => clearTimeout(t);
  }, [state]);

  // Load state when the user navigates to a different link in the same tab.
  useEffect(() => {
    const onHash = () => {
      try {
        const s = decodeHash(window.location.hash);
        if (s && window.location.hash !== encodeHash(state)) setState(s);
      } catch (err) {
        setNotice(`Could not read the link: ${(err as Error).message}`);
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [state]);

  const { formula, julia, iterations, escapeRadius } = state;
  const paramsFor = useMemo(
    () => (view: View) => fractalParams({ ...defaultState(formula), formula, julia, iterations, escapeRadius, view }),
    [formula, julia, iterations, escapeRadius],
  );
  const lut = useMemo(() => buildLut(state.palette, state.color), [state.palette, state.color]);
  const resolvedIter = paramsFor(state.view).maxIter;
  const zoom = stateZoom(state);
  const precisionWarning = stats
    ? isBeyondFloat64Precision({ cx: state.view.cx, cy: state.view.cy, scale: state.view.span / Math.min(stats.width, stats.height) })
    : false;

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Controls">
        <header className="brand">
          <h1>Fractal Lab</h1>
          <p>Computed in your browser · {pool.size} worker{pool.size === 1 ? '' : 's'}</p>
        </header>
        {notice && (
          <div className="notice" role="alert">
            <span>{notice}</span>
            <button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>
              ×
            </button>
          </div>
        )}
        <FormulaPanel state={state} resolvedIter={resolvedIter} onChange={patch} onFormula={setFormula} onResetView={resetView} />
        <ColorPanel palette={state.palette} color={state.color} onPalette={(palette) => patch({ palette })} onColor={(color) => patch({ color })} />
        <ExportPanel state={state} stats={stats} onSize={(exportSize) => patch({ exportSize })} />
      </aside>
      <main className="workspace">
        <FractalCanvas pool={pool} view={state.view} paramsFor={paramsFor} lut={lut} onViewChange={setView} onStats={setStats} onReset={resetView} />
        <InfoOverlay
          cx={state.view.cx}
          cy={state.view.cy}
          zoom={zoom}
          stats={stats}
          backend={`CPU float64 · ${pool.size} worker${pool.size === 1 ? '' : 's'}`}
          precisionWarning={precisionWarning}
        />
      </main>
    </div>
  );
}
