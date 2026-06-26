/**
 * Binary codec helpers: base64 decoding and stream decompression.
 *
 * These are zero-dependency wrappers over platform primitives (`atob` and the
 * native `DecompressionStream`), useful for save games, embedded binary blobs,
 * network payloads, and inline-encoded asset data (e.g. base64/gzip tile-layer
 * data in Tiled maps).
 *
 * Decompression is async because `DecompressionStream` is a streaming API.
 * Only the formats the platform implements natively are supported — notably
 * **not** `zstd`, which has no native browser decoder.
 */

/** Compression formats supported by the native `DecompressionStream`. */
export type DecompressFormat = 'gzip' | 'deflate' | 'deflate-raw';

/**
 * Decode a standard base64 string into raw bytes. Whitespace (newlines, spaces)
 * is ignored, so multi-line base64 blocks decode correctly.
 *
 * @throws If the input is not valid base64.
 */
function decodeBase64(input: string): Uint8Array {
  const clean = input.replaceAll(/\s+/g, '');
  const binary = atob(clean);
  const length = binary.length;
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decompress a byte buffer using the native `DecompressionStream`.
 *
 * - `'gzip'` — gzip container (RFC 1952).
 * - `'deflate'` — zlib container (RFC 1950), Tiled's `zlib` compression.
 * - `'deflate-raw'` — raw DEFLATE with no header (RFC 1951).
 *
 * @throws If the platform lacks `DecompressionStream`, or the data is corrupt.
 */
async function decompress(bytes: Uint8Array, format: DecompressFormat): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Codec.decompress requires the native DecompressionStream API.');
  }

  // Feed the input through the decompressor as a single chunk, then drain the
  // output by reading the stream directly. Avoids Blob/Response so the helper
  // works uniformly across browsers, Node, and jsdom test environments.
  const source = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(bytes as BufferSource);
      controller.close();
    },
  });
  const reader = source.pipeThrough(new DecompressionStream(format)).getReader();

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

/**
 * Binary codec facade, grouped as a namespace so the public API carries no
 * loose codec functions.
 */
export const Codec = {
  decodeBase64,
  decompress,
} as const;
