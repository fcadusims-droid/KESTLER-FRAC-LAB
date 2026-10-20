import { FORMULAS, FORMULA_IDS, JULIA_PRESETS, type FormulaId } from '../../core/formulas/index.ts';
import { AUTO_ITER_CAP, MAX_ITER, MIN_ITER } from '../../core/iterations.ts';
import { ESCAPE_RADIUS_LIMITS, type FractalState } from '../../project/state.ts';
import { NumberField, Section } from '../controls.tsx';

interface Props {
  state: FractalState;
  resolvedIter: number;
  onChange: (patch: Partial<FractalState>) => void;
  onFormula: (f: FormulaId) => void;
  onResetView: () => void;
}

export function FormulaPanel({ state, resolvedIter, onChange, onFormula, onResetView }: Props) {
  const it = state.iterations;
  return (
    <Section title="Fractal">
      <div className="field">
        <label htmlFor="formula">Formula</label>
        <select id="formula" value={state.formula} onChange={(e) => onFormula(e.target.value as FormulaId)}>
          {FORMULA_IDS.map((id) => (
            <option key={id} value={id}>
              {FORMULAS[id].label}
            </option>
          ))}
        </select>
      </div>
      <p className="hint">{FORMULAS[state.formula].formula}</p>

      {state.formula === 'julia' && (
        <>
          <div className="field">
            <label htmlFor="julia-preset">Julia preset</label>
            <select
              id="julia-preset"
              value={JULIA_PRESETS.findIndex((p) => p.re === state.julia.re && p.im === state.julia.im)}
              onChange={(e) => {
                const p = JULIA_PRESETS[Number(e.target.value)];
                if (p) onChange({ julia: { re: p.re, im: p.im } });
              }}
            >
              <option value={-1}>Custom</option>
              {JULIA_PRESETS.map((p, i) => (
                <option key={p.name} value={i}>
                  {p.name} ({p.re} {p.im < 0 ? '−' : '+'} {Math.abs(p.im)}i)
                </option>
              ))}
            </select>
          </div>
          <NumberField label="c real" value={state.julia.re} min={-4} max={4} step={0.001} onChange={(re) => onChange({ julia: { ...state.julia, re } })} />
          <NumberField label="c imag" value={state.julia.im} min={-4} max={4} step={0.001} onChange={(im) => onChange({ julia: { ...state.julia, im } })} />
        </>
      )}

      <div className="field">
        <label htmlFor="iter-auto">Iterations</label>
        <label className="check">
          <input
            id="iter-auto"
            type="checkbox"
            checked={it.mode === 'auto'}
            onChange={(e) => onChange({ iterations: e.target.checked ? { mode: 'auto' } : { mode: 'fixed', value: resolvedIter } })}
          />
          Auto (grows with zoom, max {AUTO_ITER_CAP.toLocaleString('en-US')})
        </label>
      </div>
      {it.mode === 'fixed' ? (
        <NumberField label="Max iterations" value={it.value} min={MIN_ITER} max={MAX_ITER} step={1} onChange={(value) => onChange({ iterations: { mode: 'fixed', value: Math.round(value) } })} />
      ) : (
        <p className="hint">Using {resolvedIter.toLocaleString('en-US')} iterations at this zoom.</p>
      )}
      <NumberField
        label="Escape radius"
        value={state.escapeRadius}
        min={ESCAPE_RADIUS_LIMITS[0]}
        max={ESCAPE_RADIUS_LIMITS[1]}
        step={1}
        title="Larger radii give smoother color gradients. 256 is a good default."
        onChange={(escapeRadius) => onChange({ escapeRadius })}
      />
      <button type="button" onClick={onResetView}>
        Reset view (R)
      </button>
    </Section>
  );
}
