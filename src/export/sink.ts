/** Destination for the encoded PNG bytes. */
export interface ByteSink {
  readonly kind: 'file' | 'memory';
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

/**
 * Collects compressed chunks and builds a Blob at the end. Chunks are folded
 * into intermediate Blobs every few MB so the browser may page them out; the
 * uncompressed image is never held.
 */
export class MemorySink implements ByteSink {
  readonly kind = 'memory';
  private blob = new Blob([]);
  private batch: Uint8Array[] = [];
  private batchSize = 0;
  size = 0;

  async write(bytes: Uint8Array): Promise<void> {
    this.batch.push(bytes);
    this.batchSize += bytes.length;
    this.size += bytes.length;
    if (this.batchSize >= 16 * 1024 * 1024) this.fold();
  }

  private fold(): void {
    this.blob = new Blob([this.blob, ...(this.batch as BlobPart[])]);
    this.batch = [];
    this.batchSize = 0;
  }

  async close(): Promise<void> {
    this.fold();
  }

  async abort(): Promise<void> {
    this.batch = [];
    this.blob = new Blob([]);
  }

  toBlob(type = 'image/png'): Blob {
    this.fold();
    return new Blob([this.blob], { type });
  }
}

// Minimal typings for the File System Access API (Chromium-only, not in lib.dom).
interface WritableFileStream {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}
interface SaveFileHandle {
  createWritable(): Promise<WritableFileStream>;
}
type ShowSaveFilePicker = (opts: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<SaveFileHandle>;

export function canStreamToDisk(): boolean {
  return typeof (globalThis as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

/** Streams straight to a file the user picked; nothing accumulates in memory. */
export class FileSink implements ByteSink {
  readonly kind = 'file';
  constructor(private readonly stream: WritableFileStream) {}
  write(bytes: Uint8Array): Promise<void> {
    return this.stream.write(bytes as Uint8Array<ArrayBuffer>);
  }
  close(): Promise<void> {
    return this.stream.close();
  }
  abort(): Promise<void> {
    return this.stream.abort();
  }
}

/**
 * Opens the native save dialog. Must be called directly from a user gesture.
 * Returns null if the user cancelled.
 */
export async function pickFileSink(suggestedName: string): Promise<FileSink | null> {
  const picker = (globalThis as unknown as { showSaveFilePicker: ShowSaveFilePicker }).showSaveFilePicker;
  try {
    const handle = await picker({ suggestedName, types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }] });
    return new FileSink(await handle.createWritable());
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
}
