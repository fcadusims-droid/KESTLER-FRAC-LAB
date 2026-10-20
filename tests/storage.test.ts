import { describe, expect, it } from 'vitest';
import { AUTOSAVE_KEY, PRESETS_KEY, deletePreset, listPresets, loadAutosave, saveAutosave, savePreset } from '../src/project/storage.ts';
import { readPngText } from '../src/project/pngText.ts';
import { defaultState } from '../src/project/state.ts';
import { PngStreamEncoder } from '../src/export/png.ts';
import { PNG_TEXT_KEYWORD, parseProject, projectAsciiJson } from '../src/project/project.ts';

class MemStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe('localStorage persistence', () => {
  it('autosave round-trips and ignores corrupt data', () => {
    const s = new MemStorage();
    expect(loadAutosave(s)).toBeNull();
    const st = defaultState('burningShip');
    expect(saveAutosave(st, s)).toBe(true);
    expect(loadAutosave(s)).toEqual(st);
    s.setItem(AUTOSAVE_KEY, '{"version":99}');
    expect(loadAutosave(s)).toBeNull();
    s.setItem(AUTOSAVE_KEY, 'garbage');
    expect(loadAutosave(s)).toBeNull();
  });

  it('presets: save, replace by name, list, delete; invalid entries skipped', () => {
    const s = new MemStorage();
    savePreset('A', defaultState('julia'), s);
    savePreset('B', defaultState('mandelbrot'), s);
    savePreset('A', defaultState('burningShip'), s);
    let list = listPresets(s);
    expect(list.map((p) => p.name)).toEqual(['B', 'A']);
    expect(list[1].state.formula).toBe('burningShip');
    const raw = JSON.parse(s.getItem(PRESETS_KEY)!);
    raw.push({ name: 'bad', savedAt: 'x', project: '{"version":2}' }, 42);
    s.setItem(PRESETS_KEY, JSON.stringify(raw));
    expect(listPresets(s).map((p) => p.name)).toEqual(['B', 'A']);
    list = deletePreset('B', s);
    expect(list.map((p) => p.name)).toEqual(['A']);
    expect(() => savePreset('  ', defaultState(), s)).toThrow(/name/);
  });

  it('reports a failing storage with a message', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
    expect(saveAutosave(defaultState(), full)).toBe(false);
    expect(() => savePreset('x', defaultState(), full)).toThrow(/Could not save the preset/);
  });
});

describe('PNG tEXt reader', () => {
  it('reads the embedded project from an exported PNG', () => {
    const st = defaultState('julia');
    st.palette.name = 'Señal ✨';
    const parts: Uint8Array[] = [];
    const enc = new PngStreamEncoder(2, 1, (b) => parts.push(b.slice()), { text: { [PNG_TEXT_KEYWORD]: projectAsciiJson(st) } });
    enc.pushFilteredRows(new Uint8Array(7), 1);
    enc.finish();
    const png = new Uint8Array(Buffer.concat(parts));
    expect(parseProject(readPngText(png)[PNG_TEXT_KEYWORD])).toEqual(st);
  });
  it('rejects non-PNG input', () => {
    expect(() => readPngText(new TextEncoder().encode('{"version":1}'))).toThrow(/Not a PNG/);
  });
});
