import { useRef, useState } from 'react';
import { MAX_STOPS } from '../../project/validate.ts';
import { normalizeHex, rgbToHex, sampleGradient, type ColorStop, type Palette } from '../../core/color/index.ts';

interface Props {
  palette: Palette;
  onChange: (stops: ColorStop[]) => void;
}

/** CSS gradient of the cyclic palette over [0, 1], including the wrap back to the first stop. */
function cssGradient(stops: ColorStop[]): string {
  const s = [...stops].sort((a, b) => a.pos - b.pos);
  if (s.length === 1) return s[0].color;
  // The palette is cyclic, so t = 0 and t = 1 share the color of the wrap segment.
  const edge = sampleGradient(s, 0);
  const edgeHex = rgbToHex(edge[0] * 255, edge[1] * 255, edge[2] * 255);
  const parts = [`${edgeHex} 0%`, ...s.map((st) => `${st.color} ${(st.pos * 100).toFixed(2)}%`), `${edgeHex} 100%`];
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

export function GradientEditor({ palette, onChange }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState(0);
  const [hexText, setHexText] = useState<string | null>(null);
  const stops = palette.stops;
  const sel = Math.min(selected, stops.length - 1);
  const current = stops[sel];

  const update = (i: number, patch: Partial<ColorStop>) => onChange(stops.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const posFromEvent = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const addStop = () => {
    if (stops.length >= MAX_STOPS) return;
    // Insert in the middle of the widest gap (cyclic), using the gradient's color there.
    const s = [...stops].sort((a, b) => a.pos - b.pos);
    let best = { gap: -1, pos: 0.5 };
    for (let i = 0; i < s.length; i++) {
      const a = s[i].pos;
      const b = i + 1 < s.length ? s[i + 1].pos : s[0].pos + 1;
      if (b - a > best.gap) best = { gap: b - a, pos: (a + (b - a) / 2) % 1 };
    }
    const [r, g, b] = sampleGradient(stops, best.pos);
    const next = [...stops, { pos: +best.pos.toFixed(4), color: rgbToHex(r * 255, g * 255, b * 255) }];
    onChange(next);
    setSelected(next.length - 1);
  };

  const removeStop = () => {
    if (stops.length <= 2) return;
    onChange(stops.filter((_, k) => k !== sel));
    setSelected(Math.max(0, sel - 1));
  };

  const hexInvalid = hexText !== null && normalizeHex(hexText) === null;

  return (
    <div className="gradient-editor">
      <div
        ref={barRef}
        className="gradient-bar"
        style={{ background: cssGradient(stops) }}
        aria-label="Palette gradient"
        role="group"
      >
        {stops.map((s, i) => (
          <button
            key={i}
            type="button"
            className={`stop-marker${i === sel ? ' selected' : ''}`}
            style={{ left: `${s.pos * 100}%`, background: s.color }}
            aria-label={`Color stop ${i + 1} at ${(s.pos * 100).toFixed(1)}%, ${s.color}. Drag or use arrow keys to move.`}
            aria-pressed={i === sel}
            onPointerDown={(e) => {
              setSelected(i);
              setHexText(null);
              e.currentTarget.setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              update(i, { pos: +posFromEvent(e.clientX).toFixed(4) });
            }}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowLeft' ? -0.01 : e.key === 'ArrowRight' ? 0.01 : 0;
              if (!d) return;
              e.preventDefault();
              update(i, { pos: +Math.min(1, Math.max(0, s.pos + d)).toFixed(4) });
            }}
          />
        ))}
      </div>
      <div className="row stop-controls">
        <input
          type="color"
          aria-label="Selected stop color"
          value={current.color}
          onChange={(e) => {
            setHexText(null);
            update(sel, { color: e.target.value.toLowerCase() });
          }}
        />
        <input
          className={`hex-input${hexInvalid ? ' invalid' : ''}`}
          aria-label="Selected stop hex color"
          aria-invalid={hexInvalid}
          value={hexText ?? current.color}
          onChange={(e) => {
            setHexText(e.target.value);
            const hex = normalizeHex(e.target.value);
            if (hex) update(sel, { color: hex });
          }}
          onBlur={() => setHexText(null)}
          spellCheck={false}
        />
        <input
          type="number"
          className="pos-input"
          aria-label="Selected stop position (0 to 1)"
          min={0}
          max={1}
          step={0.01}
          value={current.pos}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (e.target.value !== '' && v >= 0 && v <= 1) update(sel, { pos: v });
          }}
        />
      </div>
      <div className="row">
        <button type="button" onClick={addStop} disabled={stops.length >= MAX_STOPS}>
          Add stop
        </button>
        <button type="button" onClick={removeStop} disabled={stops.length <= 2}>
          Remove stop
        </button>
      </div>
    </div>
  );
}
