/** Bytes per sample of a decoded `AudioBuffer` channel (Web Audio decodes to `float32`). */
const audioBytesPerSample = 4;

/** Bytes per texel assumed for an image payload measured by its dimensions. */
const imageBytesPerPixel = 4;

/** UTF-16 code units are what a JS string actually occupies. */
const stringBytesPerChar = 2;

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** Decoded PCM size of an `AudioBuffer`, or 0 for anything that is not one. */
const audioBufferBytes = (value: unknown): number => {
  if (typeof value !== 'object' || value === null) {
    return 0;
  }

  const { length, numberOfChannels } = value as Partial<AudioBuffer>;

  return isFiniteNumber(length) && isFiniteNumber(numberOfChannels) ? length * numberOfChannels * audioBytesPerSample : 0;
};

/**
 * Best-effort resident size of a loaded asset payload, in bytes, or `0` when the
 * payload carries no size the runtime can read.
 *
 * Payloads are measured by shape rather than by asset type, because a type's
 * resource is whatever its factory returns and the loader never sees inside it.
 * Four shapes are measurable: binary buffers and blobs by their own length,
 * strings by their UTF-16 length, decoded audio by its PCM footprint, and
 * anything carrying pixel dimensions at four bytes per texel. Parsed JSON, XML
 * documents and font faces report `0` - a structured object has no size the
 * platform exposes, and guessing one would be worse than admitting it.
 *
 * Every figure is therefore a floor on real memory use, not an accounting of it.
 * @internal
 */
export const residentBytes = (resource: unknown): number => {
  if (typeof resource === 'string') {
    return resource.length * stringBytesPerChar;
  }

  if (resource instanceof ArrayBuffer) {
    return resource.byteLength;
  }

  if (ArrayBuffer.isView(resource)) {
    return resource.byteLength;
  }

  if (typeof resource !== 'object' || resource === null) {
    return 0;
  }

  if (typeof Blob !== 'undefined' && resource instanceof Blob) {
    return resource.size;
  }

  const own = audioBufferBytes(resource);

  if (own > 0) {
    return own;
  }

  // A decoded sound is a descriptor around the buffer that holds the samples.
  const nested = audioBufferBytes((resource as { audioBuffer?: unknown }).audioBuffer);

  if (nested > 0) {
    return nested;
  }

  const { width, height } = resource as { width?: unknown; height?: unknown };

  return isFiniteNumber(width) && isFiniteNumber(height) ? width * height * imageBytesPerPixel : 0;
};
