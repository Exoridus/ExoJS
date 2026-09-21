import { type Texture } from '@codexo/exojs';
import { describe, expect, test } from 'vitest';

import { normalsFromAlphaField } from '../src/normals/deriveNormals';
import { NormalMap } from '../src/normals/NormalMap';
import { normalGreenSign } from '../src/normals/NormalSource';

/**
 * The canonical convention, stated as arithmetic rather than as a channel
 * layout: the world-space direction a texel of an UNROTATED sprite describes,
 * in this package's own coordinates, where local `+y` points down the image.
 *
 * It is written out here rather than taken from the shader or from the
 * generator under test, so that a generator and a decoder cannot agree on the
 * same mistake.
 */
const decode = (r: number, g: number, b: number): { x: number; y: number; z: number } => ({
  x: (r / 255) * 2 - 1,
  // Green above the midpoint means "leans towards the TOP of the image", and
  // the top of an unrotated sprite is local -y.
  y: -((g / 255) * 2 - 1),
  z: (b / 255) * 2 - 1,
});

/** A disc of alpha, which read as a height field is a plateau with a round rim. */
const disc = (size: number, radius: number): Float32Array => {
  const alpha = new Float32Array(size * size);
  const half = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - half;
      const dy = y + 0.5 - half;

      alpha[y * size + x] = dx * dx + dy * dy <= radius * radius ? 1 : 0;
    }
  }

  return alpha;
};

const texelAt = (buffer: Uint8Array, size: number, x: number, y: number): { x: number; y: number; z: number } => {
  const offset = (y * size + x) * 4;

  return decode(buffer[offset]!, buffer[offset + 1]!, buffer[offset + 2]!);
};

describe('the tangent-space convention derived maps are written in', () => {
  const size = 32;
  const radius = 12;
  const normals = normalsFromAlphaField(disc(size, radius), size, size);
  const buffer = normals.buffer;
  const half = size / 2;

  /**
   * The rim of the disc, sampled where the gradient is steepest on each of the
   * four axes. A silhouette read as a height field slopes DOWN out of the
   * shape, so the normal on each rim leans out of the disc - away from its
   * centre - and that is a statement about the world, independent of how any
   * channel is packed.
   */
  test.each([
    { name: 'right rim leans right', x: half + radius - 1, y: half, axis: 'x' as const, sign: 1 },
    { name: 'left rim leans left', x: half - radius, y: half, axis: 'x' as const, sign: -1 },
    { name: 'top rim leans up', x: half, y: half - radius, axis: 'y' as const, sign: -1 },
    { name: 'bottom rim leans down', x: half, y: half + radius - 1, axis: 'y' as const, sign: 1 },
  ])('$name', ({ x, y, axis, sign }) => {
    const normal = texelAt(buffer, size, x, y);

    expect(Math.sign(normal[axis])).toBe(sign);
    expect(Math.abs(normal[axis])).toBeGreaterThan(0.3);
    // Out of the plane, never into it.
    expect(normal.z).toBeGreaterThan(0);
  });

  test('the interior of the shape stays flat', () => {
    const normal = texelAt(buffer, size, half, half);
    // One 8-bit step is `2 / 255` of the decoded range, and the flat texel
    // sits half a step off centre because 0 has no exact byte.
    const step = 2 / 255;

    expect(Math.abs(normal.x)).toBeLessThanOrEqual(step);
    expect(Math.abs(normal.y)).toBeLessThanOrEqual(step);
    expect(normal.z).toBeGreaterThanOrEqual(1 - step);
  });

  test('the encoded flat texel is the one every tool writes', () => {
    const offset = (half * size + half) * 4;

    expect([buffer[offset], buffer[offset + 1], buffer[offset + 2]]).toEqual([128, 128, 255]);
  });

  test('opposite rims mirror each other, so no axis carries a bias', () => {
    const top = texelAt(buffer, size, half, half - radius);
    const bottom = texelAt(buffer, size, half, half + radius - 1);

    expect(top.y).toBeCloseTo(-bottom.y, 2);
    expect(top.z).toBeCloseTo(bottom.z, 2);
  });
});

describe('a source declares which convention its channels are in', () => {
  const texture = { width: 1, height: 1 } as Texture;

  test('an authored map is OpenGL unless it says otherwise', () => {
    expect(new NormalMap(texture).convention).toBe('opengl');
    expect(normalGreenSign(new NormalMap(texture))).toBe(1);
  });

  test('a DirectX map asks for its green channel to be read the other way up', () => {
    expect(normalGreenSign(new NormalMap(texture, { convention: 'directx' }))).toBe(-1);
  });

  test('a material with no source at all is treated as OpenGL', () => {
    expect(normalGreenSign(undefined)).toBe(1);
  });
});
