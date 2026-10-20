import { Zlib } from 'fflate';
import { crc32 } from './crc32.ts';

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const IDAT_TARGET = 256 * 1024;

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Latin-1 tEXt chunk payload; non-Latin-1 characters must already be escaped by the caller. */
function textChunk(keyword: string, text: string): Uint8Array {
  const bytes = new Uint8Array(keyword.length + 1 + text.length);
  for (let i = 0; i < keyword.length; i++) bytes[i] = keyword.charCodeAt(i) & 0xff;
  bytes[keyword.length] = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c > 0xff) throw new Error('tEXt must be Latin-1');
    bytes[keyword.length + 1 + i] = c;
  }
  return chunk('tEXt', bytes);
}

export interface PngEncoderOptions {
  /** DEFLATE level 0–9. */
  level?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  /** tEXt chunks (keyword → Latin-1 text). */
  text?: Record<string, string>;
}

/**
 * Streaming PNG encoder for 8-bit RGB. Feed it already-filtered scanlines
 * (1 filter byte + 3W bytes each) in order; compressed output is emitted as
 * IDAT chunks through `emit` as soon as enough data is available.
 */
export class PngStreamEncoder {
  private readonly zlib: Zlib;
  private idat: Uint8Array[] = [];
  private idatSize = 0;
  private rowsWritten = 0;
  private finished = false;
  bytesOut = 0;

  readonly width: number;
  readonly height: number;
  private readonly emit: (bytes: Uint8Array) => void;

  // Explicit fields instead of parameter properties so this module also runs under
  // Node's type stripping (used by the headless experiment harness).
  constructor(width: number, height: number, emit: (bytes: Uint8Array) => void, opts: PngEncoderOptions = {}) {
    this.width = width;
    this.height = height;
    this.emit = emit;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 2 ** 31 - 1 || height > 2 ** 31 - 1) {
      throw new Error(`Invalid PNG size ${width}×${height}`);
    }
    this.out(SIGNATURE);
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, width);
    dv.setUint32(4, height);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 2; // color type: truecolor RGB
    ihdr[10] = 0; // deflate
    ihdr[11] = 0; // adaptive filtering
    ihdr[12] = 0; // no interlace
    this.out(chunk('IHDR', ihdr));
    for (const [k, v] of Object.entries(opts.text ?? {})) this.out(textChunk(k, v));

    // IDAT carries a zlib stream (header + DEFLATE + Adler-32).
    this.zlib = new Zlib({ level: opts.level ?? 6 }, (data, final) => {
      if (data.length) this.queueIdat(data);
      if (final) this.flushIdat(true);
    });
  }

  private out(bytes: Uint8Array): void {
    this.bytesOut += bytes.length;
    this.emit(bytes);
  }

  private queueIdat(data: Uint8Array): void {
    this.idat.push(data);
    this.idatSize += data.length;
    if (this.idatSize >= IDAT_TARGET) this.flushIdat(false);
  }

  private flushIdat(final: boolean): void {
    if (this.idatSize > 0) {
      const data = new Uint8Array(this.idatSize);
      let o = 0;
      for (const d of this.idat) {
        data.set(d, o);
        o += d.length;
      }
      this.out(chunk('IDAT', data));
    }
    this.idat = [];
    this.idatSize = 0;
    if (final) this.out(chunk('IEND', new Uint8Array(0)));
  }

  /** Adds `rows` filtered scanlines. */
  pushFilteredRows(data: Uint8Array, rows: number): void {
    if (this.finished) throw new Error('Encoder already finished');
    if (data.length !== rows * (1 + this.width * 3)) throw new Error('Filtered row data has the wrong length');
    if (this.rowsWritten + rows > this.height) throw new Error('Too many rows');
    this.rowsWritten += rows;
    this.zlib.push(data, false);
  }

  finish(): void {
    if (this.finished) return;
    if (this.rowsWritten !== this.height) throw new Error(`Only ${this.rowsWritten} of ${this.height} rows were written`);
    this.finished = true;
    this.zlib.push(new Uint8Array(0), true);
  }
}
