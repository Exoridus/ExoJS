/**
 * Byte-exact round-trip of a coordinate-encoding texture through both render
 * pipelines. Everything in the parity suite rests on a rendered pixel still
 * carrying the exact bytes its source texel held, so this is checked directly
 * rather than assumed.
 *
 * The WebGL2 arm depends on the shipped GLSL: a substitute fragment stage would
 * report its own synthesised colour instead of the sampled texel, which is
 * precisely what this test must not do.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';

import { createWebGl2TestBackend, createWebGpuTestBackend, readWebGl2Frame, readWebGpuFrame, renderWebGl2Once, renderWebGpuOnce } from './_backendSetup';
import { buildCoordinateTexture } from './_selfDescribingFixture';

const SIZE = 32;

/** One screen pixel per texel, origin-aligned, so texel (x,y) lands on pixel (x,y). */
const buildScene = (): Container => {
  const root = new Container();
  const sprite = new Sprite(buildCoordinateTexture(SIZE));

  sprite.setPosition(0, 0);
  root.addChild(sprite);

  return root;
};

/** Every rendered pixel must equal the texel at the same coordinate. */
const expectExactEncoding = (frame: ArrayLike<number>, label: string): void => {
  const mismatches: string[] = [];

  for (let y = 0; y < SIZE && mismatches.length < 5; y++) {
    for (let x = 0; x < SIZE && mismatches.length < 5; x++) {
      const i = (y * SIZE + x) * 4;

      if (frame[i] !== x || frame[i + 1] !== y || frame[i + 3] !== 255) {
        mismatches.push(`(${x},${y}) -> rgba(${frame[i]},${frame[i + 1]},${frame[i + 2]},${frame[i + 3]})`);
      }
    }
  }

  expect(mismatches, `${label} encoding mismatches`).toEqual([]);
};

describe('self-describing fixture survives both pipelines byte-exactly', () => {
  test('WebGL2 preserves the coordinate encoding', async () => {
    const backend = await createWebGl2TestBackend(SIZE);

    try {
      renderWebGl2Once(backend, buildScene(), Color.black);
      expectExactEncoding(readWebGl2Frame(backend, SIZE), 'webgl2');
    } finally {
      backend.destroy();
    }
  });

  test('WebGPU preserves the coordinate encoding', async ctx => {
    const backend = await createWebGpuTestBackend(SIZE);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, buildScene(), Color.black))) return;

      expectExactEncoding(readWebGpuFrame(backend, SIZE), 'webgpu');
    } finally {
      backend.destroy();
    }
  });

  test('both backends produce identical bytes', async ctx => {
    const gl = await createWebGl2TestBackend(SIZE);
    const gpu = await createWebGpuTestBackend(SIZE);

    try {
      renderWebGl2Once(gl, buildScene(), Color.black);

      if (!(await renderWebGpuOnce(ctx, gpu, buildScene(), Color.black))) return;

      expect(Array.from(readWebGpuFrame(gpu, SIZE))).toEqual(Array.from(readWebGl2Frame(gl, SIZE)));
    } finally {
      gl.destroy();
      gpu.destroy();
    }
  });
});
