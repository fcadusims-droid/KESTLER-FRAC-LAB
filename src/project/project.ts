import type { FractalState } from './state.ts';
import { fractalState, obj, ValidationError } from './validate.ts';

export const PROJECT_VERSION = 1;
export const PNG_TEXT_KEYWORD = 'FractalLab';

export interface ProjectFile extends FractalState {
  version: 1;
  app: 'fractal-lab';
}

export function toProject(state: FractalState): ProjectFile {
  return { version: PROJECT_VERSION, app: 'fractal-lab', ...state };
}

export function serializeProject(state: FractalState): string {
  return JSON.stringify(toProject(state), null, 2);
}

/** JSON with every non-ASCII character escaped, safe for a Latin-1 PNG tEXt chunk. */
export function projectAsciiJson(state: FractalState): string {
  return JSON.stringify(toProject(state)).replace(/[\u0080-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/**
 * Parses and strictly validates a project file. Only JSON.parse is used; the
 * content is never evaluated. Throws ValidationError with a user-facing message.
 */
export function parseProject(text: string): FractalState {
  if (text.length > 1_000_000) throw new ValidationError('Project file is too large (over 1 MB).');
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ValidationError('This file is not valid JSON.');
  }
  const o = obj(data, 'project');
  if (o.version === undefined) throw new ValidationError('Not a Fractal Lab project: missing "version".');
  if (o.version !== PROJECT_VERSION) {
    throw new ValidationError(`Unsupported project version ${JSON.stringify(o.version)}. This app reads version ${PROJECT_VERSION}.`);
  }
  if (o.app !== 'fractal-lab') throw new ValidationError('Not a Fractal Lab project: "app" must be "fractal-lab".');
  return fractalState(o, 'project', ['version', 'app']);
}
