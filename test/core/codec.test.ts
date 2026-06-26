import { describe, expect, it } from 'vitest';

import { Codec } from '#core/Codec';

// Helper: gzip/deflate a byte buffer with the native CompressionStream so the
// decompress round-trip can be asserted without committing binary fixtures.
async function compress(bytes: Uint8Array, format: 'gzip' | 'deflate'): Promise<Uint8Array> {
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes as BufferSource);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new CompressionStream(format)).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

describe('Codec.decodeBase64', () => {
  it('decodes a standard base64 string to bytes', () => {
    // "Man" → TWFu
    expect([...Codec.decodeBase64('TWFu')]).toEqual([0x4d, 0x61, 0x6e]);
  });

  it('ignores embedded whitespace and newlines', () => {
    const withWhitespace = 'TW\nFu  ';
    expect([...Codec.decodeBase64(withWhitespace)]).toEqual([0x4d, 0x61, 0x6e]);
  });

  it('round-trips arbitrary bytes via btoa', () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255]);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    const b64 = btoa(binary);
    expect([...Codec.decodeBase64(b64)]).toEqual([...bytes]);
  });
});

describe('Codec.decompress', () => {
  it('round-trips gzip-compressed data', async () => {
    const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const gz = await compress(original, 'gzip');
    const out = await Codec.decompress(gz, 'gzip');
    expect([...out]).toEqual([...original]);
  });

  it('round-trips zlib (deflate) data', async () => {
    const original = new Uint8Array(Array.from({ length: 64 }, (_, i) => i % 7));
    const zl = await compress(original, 'deflate');
    const out = await Codec.decompress(zl, 'deflate');
    expect([...out]).toEqual([...original]);
  });
});
