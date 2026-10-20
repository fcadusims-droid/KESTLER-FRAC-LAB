/** Reads tEXt chunks from a PNG (keyword → Latin-1 text). Throws on a non-PNG. */
export function readPngText(bytes: Uint8Array): Record<string, string> {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 8 || sig.some((b, i) => bytes[i] !== b)) throw new Error('Not a PNG file.');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, string> = {};
  let o = 8;
  while (o + 12 <= bytes.length) {
    const len = dv.getUint32(o);
    const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    const start = o + 8;
    if (start + len > bytes.length) break;
    if (type === 'tEXt') {
      const data = bytes.subarray(start, start + len);
      const nul = data.indexOf(0);
      if (nul > 0) {
        let key = '';
        for (let i = 0; i < nul; i++) key += String.fromCharCode(data[i]);
        let text = '';
        for (let i = nul + 1; i < data.length; i++) text += String.fromCharCode(data[i]);
        out[key] = text;
      }
    }
    if (type === 'IDAT' || type === 'IEND') break; // our tEXt chunks precede the image data
    o = start + len + 4;
  }
  return out;
}
