import type { FractalState } from './state.ts';
import { parseProject, serializeProject } from './project.ts';

/**
 * Per-browser persistence (localStorage). Nothing is synced anywhere. All
 * access is guarded: storage may be disabled, full, or contain stale data.
 */

export const AUTOSAVE_KEY = 'fractal-lab:last-session:v1';
export const PRESETS_KEY = 'fractal-lab:presets:v1';
export const MAX_PRESETS = 100;

export interface Preset {
  name: string;
  savedAt: string;
  state: FractalState;
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function storage(s?: StorageLike): StorageLike | null {
  if (s) return s;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadAutosave(s?: StorageLike): FractalState | null {
  try {
    const raw = storage(s)?.getItem(AUTOSAVE_KEY);
    return raw ? parseProject(raw) : null;
  } catch {
    return null;
  }
}

export function saveAutosave(state: FractalState, s?: StorageLike): boolean {
  try {
    storage(s)?.setItem(AUTOSAVE_KEY, serializeProject(state));
    return true;
  } catch {
    return false;
  }
}

/** Returns valid presets; entries that fail validation are skipped. */
export function listPresets(s?: StorageLike): Preset[] {
  let raw: string | null | undefined;
  try {
    raw = storage(s)?.getItem(PRESETS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: Preset[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const { name, savedAt, project } = item as Record<string, unknown>;
    if (typeof name !== 'string' || typeof savedAt !== 'string' || typeof project !== 'string') continue;
    try {
      out.push({ name, savedAt, state: parseProject(project) });
    } catch {
      // skip invalid entry
    }
  }
  return out;
}

function writePresets(presets: Preset[], s?: StorageLike): void {
  const st = storage(s);
  if (!st) throw new Error('Browser storage is not available.');
  st.setItem(PRESETS_KEY, JSON.stringify(presets.map((p) => ({ name: p.name, savedAt: p.savedAt, project: serializeProject(p.state) }))));
}

/** Saves (or replaces) a preset by name. Throws with a user-facing message on failure. */
export function savePreset(name: string, state: FractalState, s?: StorageLike): Preset[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Enter a preset name.');
  if (trimmed.length > 60) throw new Error('Preset names are limited to 60 characters.');
  const presets = listPresets(s).filter((p) => p.name !== trimmed);
  if (presets.length >= MAX_PRESETS) throw new Error(`At most ${MAX_PRESETS} presets can be stored.`);
  const next = [...presets, { name: trimmed, savedAt: new Date().toISOString(), state }];
  try {
    writePresets(next, s);
  } catch (err) {
    throw new Error(`Could not save the preset: ${(err as Error).message}`, { cause: err });
  }
  return next;
}

export function deletePreset(name: string, s?: StorageLike): Preset[] {
  const next = listPresets(s).filter((p) => p.name !== name);
  writePresets(next, s);
  return next;
}
