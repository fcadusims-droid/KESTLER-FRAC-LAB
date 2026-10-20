import { BUILTIN_PALETTES, COLOR_LIMITS, clonePalette, normalizeHex, type ColorSettings, type Palette } from '../../core/color/index.ts';
import { NumberField, Section } from '../controls.tsx';
import { GradientEditor } from './GradientEditor.tsx';
import { useState } from 'react';

interface Props {
  palette: Palette;
  color: ColorSettings;
  onPalette: (p: Palette) => void;
  onColor: (c: ColorSettings) => void;
}

function samePalette(a: Palette, b: Palette): boolean {
  return a.stops.length === b.stops.length && a.stops.every((s, i) => s.pos === b.stops[i].pos && s.color === b.stops[i].color);
}

export function ColorPanel({ palette, color, onPalette, onColor }: Props) {
  const builtinIndex = BUILTIN_PALETTES.findIndex((p) => p.name === palette.name && samePalette(p, palette));
  const set = <K extends keyof ColorSettings>(k: K, v: ColorSettings[K]) => onColor({ ...color, [k]: v });
  const [interiorText, setInteriorText] = useState<string | null>(null);
  const L = COLOR_LIMITS;

  return (
    <Section title="Color">
      <div className="field">
        <label htmlFor="palette">Palette</label>
        <select
          id="palette"
          value={builtinIndex}
          onChange={(e) => {
            const p = BUILTIN_PALETTES[Number(e.target.value)];
            if (p) onPalette(clonePalette(p));
          }}
        >
          {builtinIndex < 0 && <option value={-1}>{palette.name === 'Custom' ? 'Custom' : `${palette.name} (custom)`}</option>}
          {BUILTIN_PALETTES.map((p, i) => (
            <option key={p.name} value={i}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <GradientEditor palette={palette} onChange={(stops) => onPalette({ name: builtinIndex >= 0 || palette.name === '' ? 'Custom' : palette.name, stops })} />

      <NumberField label="Offset" value={color.offset} min={L.offset[0]} max={L.offset[1]} step={0.005} slider onChange={(v) => set('offset', v)} />
      <NumberField
        label="Cycle length (iterations per palette repeat)"
        value={color.cycleLength}
        min={L.cycleLength[0]}
        max={L.cycleLength[1]}
        step={1}
        onChange={(v) => set('cycleLength', v)}
      />
      <input
        type="range"
        aria-label="Cycle length (logarithmic)"
        min={0}
        max={Math.log10(1000)}
        step={0.01}
        value={Math.log10(Math.min(1000, color.cycleLength))}
        onChange={(e) => set('cycleLength', Math.max(1, +(10 ** Number(e.target.value)).toFixed(2)))}
      />
      <NumberField label="Gamma" value={color.gamma} min={L.gamma[0]} max={L.gamma[1]} step={0.01} slider onChange={(v) => set('gamma', v)} />
      <NumberField label="Brightness" value={color.brightness} min={L.brightness[0]} max={L.brightness[1]} step={0.01} slider onChange={(v) => set('brightness', v)} />
      <NumberField label="Contrast" value={color.contrast} min={L.contrast[0]} max={L.contrast[1]} step={0.01} slider onChange={(v) => set('contrast', v)} />
      <NumberField label="Hue shift (°)" value={color.hueShift} min={L.hueShift[0]} max={L.hueShift[1]} step={1} slider onChange={(v) => set('hueShift', v)} />
      <NumberField label="Saturation" value={color.saturation} min={L.saturation[0]} max={L.saturation[1]} step={0.01} slider onChange={(v) => set('saturation', v)} />
      <label className="check">
        <input type="checkbox" checked={color.invert} onChange={(e) => set('invert', e.target.checked)} />
        Invert colors
      </label>
      <div className="field">
        <label htmlFor="interior-hex">Interior color</label>
        <div className="row">
          <input type="color" aria-label="Interior color picker" value={color.interior} onChange={(e) => set('interior', e.target.value.toLowerCase())} />
          <input
            id="interior-hex"
            className={`hex-input${interiorText !== null && !normalizeHex(interiorText) ? ' invalid' : ''}`}
            value={interiorText ?? color.interior}
            spellCheck={false}
            onChange={(e) => {
              setInteriorText(e.target.value);
              const hex = normalizeHex(e.target.value);
              if (hex) set('interior', hex);
            }}
            onBlur={() => setInteriorText(null)}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          onColor({ ...color, offset: 0, gamma: 1, brightness: 0, contrast: 1, hueShift: 0, saturation: 1, invert: false })
        }
      >
        Reset adjustments
      </button>
    </Section>
  );
}
