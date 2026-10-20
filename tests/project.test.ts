import { describe, expect, it } from 'vitest';
import { parseProject, projectAsciiJson, serializeProject } from '../src/project/project.ts';
import { defaultState } from '../src/project/state.ts';

describe('project JSON', () => {
  it('round-trips', () => {
    const s = defaultState('julia');
    s.view = { cx: 0.123456789012345, cy: -1e-7, span: 3.2e-9 };
    s.palette = { name: 'Ünïcødé ✨', stops: [{ pos: 0.1, color: '#abcdef' }] };
    s.iterations = { mode: 'fixed', value: 777 };
    expect(parseProject(serializeProject(s))).toEqual(s);
    expect(parseProject(projectAsciiJson(s))).toEqual(s);
    expect(/^[\x20-\x7e]*$/.test(projectAsciiJson(s))).toBe(true);
  });

  it('rejects unsupported versions', () => {
    const p = JSON.parse(serializeProject(defaultState()));
    expect(() => parseProject(JSON.stringify({ ...p, version: 2 }))).toThrow(/Unsupported project version 2/);
    expect(() => parseProject(JSON.stringify({ ...p, version: '1' }))).toThrow(/Unsupported/);
    delete p.version;
    expect(() => parseProject(JSON.stringify(p))).toThrow(/missing "version"/);
  });

  it.each([
    ['not json', 'not valid JSON'],
    ['[]', 'expected an object'],
    ['null', 'expected an object'],
  ])('rejects %s', (text, msg) => {
    expect(() => parseProject(text)).toThrow(msg);
  });

  it.each([
    ['unknown field', (p: Record<string, unknown>) => ({ ...p, evil: 'x' }), /unknown field "evil"/],
    ['bad formula', (p: Record<string, unknown>) => ({ ...p, formula: 'eval' }), /formula/],
    ['NaN-like value', (p: Record<string, unknown>) => ({ ...p, escapeRadius: '256' }), /escapeRadius: expected a finite number/],
    ['negative span', (p: Record<string, unknown>) => ({ ...p, view: { cx: 0, cy: 0, span: -1 } }), /span/],
    ['bad color', (p: Record<string, unknown>) => ({ ...p, color: { ...(p.color as object), interior: 'red' } }), /interior/],
    ['too many iterations', (p: Record<string, unknown>) => ({ ...p, iterations: { mode: 'fixed', value: 1e9 } }), /iterations.value/],
    ['fractional export size', (p: Record<string, unknown>) => ({ ...p, exportSize: { width: 10.5, height: 10 } }), /integer/],
    ['huge export', (p: Record<string, unknown>) => ({ ...p, exportSize: { width: 32768, height: 32768 } }), /pixels/],
    ['missing field', (p: Record<string, unknown>) => ({ ...p, palette: undefined }), /missing field "palette"|palette/],
    ['wrong app', (p: Record<string, unknown>) => ({ ...p, app: 'other' }), /app/],
  ])('rejects %s', (_name, mutate, msg) => {
    const p = JSON.parse(serializeProject(defaultState()));
    expect(() => parseProject(JSON.stringify(mutate(p)))).toThrow(msg);
  });
});
