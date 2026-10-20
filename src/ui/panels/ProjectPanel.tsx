import { useRef, useState } from 'react';
import { PNG_TEXT_KEYWORD, parseProject, serializeProject } from '../../project/project.ts';
import { readPngText } from '../../project/pngText.ts';
import { deletePreset, listPresets, savePreset, type Preset } from '../../project/storage.ts';
import type { FractalState } from '../../project/state.ts';
import { Section } from '../controls.tsx';

interface Props {
  state: FractalState;
  onLoad: (state: FractalState) => void;
}

const MAX_FILE_BYTES = 512 * 1024 * 1024;

async function readProjectFile(file: File): Promise<FractalState> {
  if (file.size > MAX_FILE_BYTES) throw new Error('File is too large.');
  const isPng = file.type === 'image/png' || /\.png$/i.test(file.name);
  if (isPng) {
    // tEXt chunks are written before the image data, so the first few MB suffice.
    const head = new Uint8Array(await file.slice(0, 4 * 1024 * 1024).arrayBuffer());
    const text = readPngText(head)[PNG_TEXT_KEYWORD];
    if (!text) throw new Error('This PNG has no embedded Fractal Lab project.');
    return parseProject(text);
  }
  if (file.size > 1_000_000) throw new Error('Project file is too large (over 1 MB).');
  return parseProject(await file.text());
}

export function ProjectPanel({ state, onLoad }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [presets, setPresets] = useState<Preset[]>(() => listPresets());
  const [presetName, setPresetName] = useState('');

  const download = () => {
    const blob = new Blob([serializeProject(state)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fractal-project-${state.formula}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <Section title="Project & presets" defaultOpen={false}>
      <div className="row">
        <button type="button" onClick={download}>
          Save project (.json)
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}>
          Open project…
        </button>
        <input
          ref={fileRef}
          type="file"
          hidden
          aria-label="Open project file"
          data-testid="project-file"
          accept=".json,application/json,.png,image/png"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            try {
              onLoad(await readProjectFile(file));
              setMessage({ kind: 'ok', text: `Loaded ${file.name}.` });
            } catch (err) {
              setMessage({ kind: 'error', text: `Could not open ${file.name}: ${(err as Error).message}` });
            }
          }}
        />
      </div>
      <p className="hint">Opens .json projects or PNGs exported with embedded settings.</p>
      {message && (
        <p className={message.kind === 'error' ? 'error-text' : 'success-text'} role={message.kind === 'error' ? 'alert' : 'status'} data-testid="project-message">
          {message.text}
        </p>
      )}

      <div className="field">
        <label htmlFor="preset-name">Save current view as preset</label>
        <div className="row">
          <input id="preset-name" value={presetName} maxLength={60} placeholder="Preset name" onChange={(e) => setPresetName(e.target.value)} />
          <button
            type="button"
            onClick={() => {
              try {
                setPresets(savePreset(presetName, state));
                setPresetName('');
                setMessage(null);
              } catch (err) {
                setMessage({ kind: 'error', text: (err as Error).message });
              }
            }}
          >
            Save preset
          </button>
        </div>
      </div>
      {presets.length > 0 && (
        <ul className="preset-list" aria-label="Saved presets">
          {presets.map((p) => (
            <li key={p.name}>
              <span title={new Date(p.savedAt).toLocaleString()}>{p.name}</span>
              <button type="button" onClick={() => onLoad(p.state)} aria-label={`Load preset ${p.name}`}>
                Load
              </button>
              <button
                type="button"
                aria-label={`Delete preset ${p.name}`}
                onClick={() => {
                  try {
                    setPresets(deletePreset(p.name));
                  } catch (err) {
                    setMessage({ kind: 'error', text: `Could not delete the preset: ${(err as Error).message}` });
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        Your last session and presets are saved in this browser only (localStorage). They are not synced to any cloud
        and are lost if you clear site data. Use “Save project” to keep a file.
      </p>
    </Section>
  );
}
