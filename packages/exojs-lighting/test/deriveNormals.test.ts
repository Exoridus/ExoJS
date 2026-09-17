import { Texture, TextureFormat } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import { deriveNormalsFromAlpha, normalsFromAlphaField } from '../src/normals/deriveNormals';

/** Encoded flat normal - `(0, 0, 1)` in tangent space. */
const flatByte = 128;

/** An alpha field opaque inside `[left, right)` on x and transparent outside it - a vertical edge. */
const verticalEdge = (width: number, height: number, left: number, right: number): Float32Array => {
  const alpha = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = left; x < right; x++) {
      alpha[y * width + x] = 1;
    }
  }

  return alpha;
};

const channelAt = (buffer: Uint8Array, width: number, x: number, y: number, channel: number): number => buffer[(y * width + x) * 4 + channel]!;

describe('normalsFromAlphaField', () => {
  test('produces a map the size of its field, in a bindable format', () => {
    const normals = normalsFromAlphaField(verticalEdge(8, 4, 0, 4), 8, 4);

    expect(normals.width).toBe(8);
    expect(normals.height).toBe(4);
    expect(normals.format).toBe(TextureFormat.Rgba8);
  });

  test('a flat interior stays flat', () => {
    const normals = normalsFromAlphaField(verticalEdge(16, 8, 0, 16), 16, 8);

    // Dead centre of a fully opaque field: no gradient, so no tilt.
    expect(channelAt(normals.buffer, 16, 8, 4, 0)).toBe(flatByte);
    expect(channelAt(normals.buffer, 16, 8, 4, 1)).toBe(flatByte);
    expect(channelAt(normals.buffer, 16, 8, 4, 2)).toBe(255);
  });

  test('an edge tilts the normal, and the two sides of a shape tilt opposite ways', () => {
    const normals = normalsFromAlphaField(verticalEdge(16, 8, 4, 12), 16, 8);

    const leftEdge = channelAt(normals.buffer, 16, 4, 4, 0);
    const rightEdge = channelAt(normals.buffer, 16, 11, 4, 0);

    expect(leftEdge).not.toBe(flatByte);
    expect(rightEdge).not.toBe(flatByte);
    expect(Math.sign(leftEdge - flatByte)).toBe(-Math.sign(rightEdge - flatByte));
  });

  test('strength scales the tilt', () => {
    const field = verticalEdge(16, 8, 4, 12);
    const gentle = normalsFromAlphaField(field, 16, 8, { strength: 1 });
    const steep = normalsFromAlphaField(field, 16, 8, { strength: 6 });

    const gentleTilt = Math.abs(channelAt(gentle.buffer, 16, 4, 4, 0) - flatByte);
    const steepTilt = Math.abs(channelAt(steep.buffer, 16, 4, 4, 0) - flatByte);

    expect(steepTilt).toBeGreaterThan(gentleTilt);
  });

  test('a horizontal edge tilts along y rather than x', () => {
    const width = 8;
    const height = 8;
    const alpha = new Float32Array(width * height);

    for (let y = 4; y < height; y++) {
      for (let x = 0; x < width; x++) {
        alpha[y * width + x] = 1;
      }
    }

    const normals = normalsFromAlphaField(alpha, width, height);

    expect(channelAt(normals.buffer, width, 4, 4, 0)).toBe(flatByte);
    expect(channelAt(normals.buffer, width, 4, 4, 1)).not.toBe(flatByte);
  });

  test('an unreadable field yields a flat map rather than throwing', () => {
    const normals = normalsFromAlphaField(null, 2, 2);

    expect(normals.buffer[0]).toBe(flatByte);
    expect(normals.buffer[1]).toBe(flatByte);
    expect(normals.buffer[2]).toBe(255);
  });
});

describe('deriveNormalsFromAlpha', () => {
  test('a texture with no drawable source yields a flat map at its own size', () => {
    const normals = deriveNormalsFromAlpha(new Texture(null));

    expect(normals.width).toBe(1);
    expect(normals.buffer[0]).toBe(flatByte);
    expect(normals.buffer[2]).toBe(255);
  });
});
