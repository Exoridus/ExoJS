/**
 * Identify an animated raster asset from its encoded bytes, not the extension
 * or HTTP Content-Type. Static GIF, PNG and WebP files remain ordinary textures.
 *
 * This parser only inspects container structure; actual frame decoding and
 * alpha compositing belong to the browser decoder.
 * @internal
 */
export type AnimatedImageMime = 'image/gif' | 'image/png' | 'image/webp';

const fourCC = (bytes: Uint8Array, pos: number, text: string): boolean =>
  pos >= 0 && pos + text.length <= bytes.length && [...text].every((char, offset) => bytes[pos + offset] === char.charCodeAt(0));

const read32 = (bytes: Uint8Array, pos: number, littleEndian: boolean): number | null => {
  if (pos < 0 || pos + 4 > bytes.length) {
    return null;
  }

  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(pos, littleEndian);
};

const skipGifSubblocks = (bytes: Uint8Array, position: number): number => {
  let index = position;

  while (index < bytes.length) {
    const size = bytes[index++]!;

    if (size === 0) {
      return index;
    }

    index += size;

    if (index > bytes.length) {
      return -1;
    }
  }

  return -1;
};

const isAnimatedGif = (bytes: Uint8Array): boolean => {
  if (!(fourCC(bytes, 0, 'GIF87a') || fourCC(bytes, 0, 'GIF89a')) || bytes.length < 13) {
    return false;
  }

  const flags = bytes[10]!;
  let position = 13 + ((flags & 0x80) === 0 ? 0 : 3 * 2 ** ((flags & 0x07) + 1));
  let frames = 0;

  while (position < bytes.length) {
    const block = bytes[position++]!;

    if (block === 0x3b) {
      return false;
    }

    if (block === 0x21) {
      if (position >= bytes.length) {
        return false;
      }

      position = skipGifSubblocks(bytes, position + 1);
    } else if (block === 0x2c) {
      if (position + 9 > bytes.length) {
        return false;
      }

      const imageFlags = bytes[position + 8]!;
      position += 9 + ((imageFlags & 0x80) === 0 ? 0 : 3 * 2 ** ((imageFlags & 0x07) + 1));

      if (position >= bytes.length) {
        return false;
      }

      position = skipGifSubblocks(bytes, position + 1);
      frames++;

      if (frames > 1) {
        return true;
      }
    } else {
      return false;
    }

    if (position < 0) {
      return false;
    }
  }

  return false;
};

const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const isAnimatedPng = (bytes: Uint8Array): boolean => {
  if (bytes.length < 8 || !pngHeader.every((byte, index) => bytes[index] === byte)) {
    return false;
  }

  let position = 8;

  while (position + 12 <= bytes.length) {
    const length = read32(bytes, position, false)!;
    const chunkEnd = position + length + 12;

    if (chunkEnd > bytes.length || chunkEnd < position + 12) {
      return false;
    }

    if (fourCC(bytes, position + 4, 'acTL')) {
      return length === 8 && (read32(bytes, position + 8, false) ?? 0) > 1;
    }

    if (fourCC(bytes, position + 4, 'IDAT') || fourCC(bytes, position + 4, 'IEND')) {
      return false;
    }

    position = chunkEnd;
  }

  return false;
};

const isAnimatedWebp = (bytes: Uint8Array): boolean => {
  if (bytes.length < 20 || !fourCC(bytes, 0, 'RIFF') || !fourCC(bytes, 8, 'WEBP')) {
    return false;
  }

  const size = read32(bytes, 4, true);

  if (size === null || size + 8 > bytes.length) {
    return false;
  }

  // The VP8X feature byte's animation flag announces ANIM/ANMF chunks.
  if (fourCC(bytes, 12, 'VP8X') && (bytes[20]! & 0x02) !== 0) {
    return true;
  }

  let position = 12;

  while (position + 8 <= bytes.length) {
    const length = read32(bytes, position + 4, true)!;
    const end = position + 8 + length + (length & 1);

    if (end > bytes.length || end <= position) {
      return false;
    }

    if (fourCC(bytes, position, 'ANIM') || fourCC(bytes, position, 'ANMF')) {
      return true;
    }

    position = end;
  }

  return false;
};

/** Returns the image MIME if the encoded file contains multiple frames. */
export const animatedImageMime = (source: ArrayBuffer): AnimatedImageMime | null => {
  const bytes = new Uint8Array(source);

  if (isAnimatedGif(bytes)) {
    return 'image/gif';
  }

  if (isAnimatedPng(bytes)) {
    return 'image/png';
  }

  if (isAnimatedWebp(bytes)) {
    return 'image/webp';
  }

  return null;
};
