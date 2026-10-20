import { describe, expect, it } from 'vitest';
import { crc32 as nodeCrc32, inflateSync } from 'node:zlib';
import { decode } from 'fast-png';
import { PngStreamEncoder } from '../src/export/png.ts';
import { crc32 } from '../src/export/crc32.ts';
import { renderFilteredBand } from '../src/export/band.ts';
import { makeBands } from '../src/render/tiles.ts';
import { buildLut, colorize, BUILTIN_PALETTES, DEFAULT_COLOR_SETTINGS } from '../src/core/color/index.ts';
import { renderTileFloat64, type FractalParams } from '../src/core/formulas/index.ts';
import { frameFromView } from '../src/core/view.ts';

const params: FractalParams = { formula: 'mandelbrot', juliaRe: 0, juliaIm: 0, maxIter: 250, escapeRadius: 256 };
const lut = buildLut(BUILTIN_PALETTES[0], { ...DEFAULT_COLOR_SETTINGS, cycleLength: 20 });

function encode(width: number, height: number, bandRows: number, text?: Record<string, string>) {
  const frame = frameFromView({ cx: -0.75, cy: 0.1, span: 0.6 }, width, height);
  const parts: Uint8Array[] = [];
  const enc = new PngStreamEncoder(width, height, (b) => parts.push(b.slice()), { text });
  for (const band of makeBands(width, height, bandRows)) {
    enc.pushFilteredRows(renderFilteredBand(frame, params, lut, band), band.h);
  }
  enc.finish();
  const png = Buffer.concat(parts);
  expect(enc.bytesOut).toBe(png.length);
  return { png, frame };
}

function directRgba(frame: ReturnType<typeof frameFromView>): Uint8Array {
  const values = new Float32Array(frame.width * frame.height);
  renderTileFloat64(frame, params, { x: 0, y: 0, w: frame.width, h: frame.height }, values);
  const rgba = new Uint8Array(values.length * 4);
  colorize(values, values.length, lut, rgba);
  return rgba;
}

/** Independent chunk walker: validates CRCs with node:zlib. */
function chunks(png: Buffer) {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const out: { type: string; data: Buffer }[] = [];
  let o = 8;
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.toString('latin1', o + 4, o + 8);
    const data = png.subarray(o + 8, o + 8 + len);
    expect(png.readUInt32BE(o + 8 + len)).toBe(nodeCrc32(png.subarray(o + 4, o + 8 + len)));
    out.push({ type, data });
    o += 12 + len;
  }
  return out;
}

describe('crc32', () => {
  it('matches node:zlib', () => {
    const data = new TextEncoder().encode('The quick brown fox jumps over the lazy dog');
    expect(crc32(data)).toBe(nodeCrc32(data));
    expect(crc32(data.subarray(10), crc32(data.subarray(0, 10)))).toBe(nodeCrc32(data));
  });
});

describe('streaming PNG export', () => {
  it.each([
    [257, 129, 16],
    [257, 129, 7],
    [1, 1, 1],
    [33, 65, 64],
    [500, 3, 1],
  ])('%ix%i in bands of %i rows decodes to the direct render', (w, h, bandRows) => {
    const { png, frame } = encode(w, h, bandRows);
    const img = decode(png);
    expect(img.width).toBe(w);
    expect(img.height).toBe(h);
    expect(img.channels).toBe(3);
    expect(img.depth).toBe(8);
    const rgba = directRgba(frame);
    const rgb = img.data as Uint8Array;
    let mismatches = 0;
    for (let i = 0, j = 0; i < w * h; i++, j += 4) {
      if (rgb[i * 3] !== rgba[j] || rgb[i * 3 + 1] !== rgba[j + 1] || rgb[i * 3 + 2] !== rgba[j + 2]) mismatches++;
    }
    expect(mismatches).toBe(0);
  });

  it('band size does not change the image data', () => {
    const a = encode(257, 129, 16).png;
    const b = encode(257, 129, 129).png;
    const inflate = (png: Buffer) => inflateSync(Buffer.concat(chunks(png).filter((c) => c.type === 'IDAT').map((c) => c.data)));
    expect(inflate(a).equals(inflate(b))).toBe(true);
  });

  it('writes valid chunk structure with correct CRCs and multiple IDATs when large', () => {
    const { png } = encode(400, 400, 32, { FractalLab: '{"version":1}' });
    const list = chunks(png);
    expect(list[0].type).toBe('IHDR');
    expect(list.at(-1)!.type).toBe('IEND');
    const text = list.find((c) => c.type === 'tEXt')!;
    expect(text.data.toString('latin1')).toBe('FractalLab\0{"version":1}');
    expect(list.filter((c) => c.type === 'IDAT').length).toBeGreaterThanOrEqual(1);
  });

  it('rejects wrong row counts and sizes', () => {
    expect(() => new PngStreamEncoder(0, 10, () => {})).toThrow();
    const enc = new PngStreamEncoder(4, 2, () => {});
    expect(() => enc.pushFilteredRows(new Uint8Array(5), 1)).toThrow(/wrong length/);
    enc.pushFilteredRows(new Uint8Array(13), 1);
    expect(() => enc.finish()).toThrow(/1 of 2 rows/);
  });
});
