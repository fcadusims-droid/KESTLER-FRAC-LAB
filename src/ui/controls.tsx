import { useId, useState, type ReactNode } from 'react';

export function Section({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="section" open={defaultOpen}>
      <summary>{title}</summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  /** Show a range slider next to the number input. */
  slider?: boolean;
  title?: string;
}

/**
 * Number input that only commits valid, in-range values. While the text is
 * invalid it is shown with an error style and the last valid value stays active.
 */
export function NumberField({ label, value, onChange, min, max, step = 'any', slider, title }: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? String(value);
  const parse = (s: string): number | null => {
    if (s.trim() === '') return null;
    const v = Number(s);
    if (!Number.isFinite(v)) return null;
    if (min !== undefined && v < min) return null;
    if (max !== undefined && v > max) return null;
    return v;
  };
  const invalid = text !== null && parse(text) === null;
  return (
    <div className="field" title={title}>
      <label htmlFor={id}>{label}</label>
      <div className="field-inputs">
        {slider && min !== undefined && max !== undefined && (
          <input
            type="range"
            aria-label={`${label} slider`}
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => {
              setText(null);
              onChange(Number(e.target.value));
            }}
          />
        )}
        <input
          id={id}
          type="number"
          inputMode="decimal"
          className={invalid ? 'invalid' : undefined}
          aria-invalid={invalid}
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(e) => {
            setText(e.target.value);
            const v = parse(e.target.value);
            if (v !== null) onChange(v);
          }}
          onBlur={() => setText(null)}
        />
      </div>
    </div>
  );
}
