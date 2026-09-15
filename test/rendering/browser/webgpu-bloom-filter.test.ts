import { describe, expect, test } from 'vitest';

import type { Filter } from '#rendering/filters/Filter';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { bloom, DARK, FAR_GLOW, INSIDE, NEAR_GLOW } from './_bloomFixture';
import { BLUR_SCENE_SIZE, blurScene, CLEAR } from './_blurFilterFixture';
import { expectPixelNear, type RgbaTuple } from './_pixels';

const withScene = async (
  ctx: { skip: (reason: string) => void },
  filters: readonly Filter[],
  read: (pixel: (x: number, y: number) => RgbaTuple) => void,
): Promise<void> => {
  const backend = await createWebGpuTestBackend(BLUR_SCENE_SIZE);
  const { root, texture } = blurScene(filters);

  try {
    if (!(await renderWebGpuOnce(ctx, backend, root, CLEAR))) return;
    read(readWebGpuPixels(backend, BLUR_SCENE_SIZE));
  } finally {
    root.destroy();
    texture.destroy();
    backend.destroy();
    for (const filter of filters) filter.destroy();
  }
};

describe('BloomFilter (WebGPU)', () => {
  test('grows a halo around the bright square that falls off with distance', async ctx => {
    await withScene(ctx, [bloom()], pixel => {
      const near = pixel(...NEAR_GLOW)[0]!;
      const far = pixel(...FAR_GLOW)[0]!;

      expect(near).toBeGreaterThan(16);
      expect(far).toBeGreaterThan(0);
      expect(far).toBeLessThan(near);
      // The source itself is white already and cannot be lifted any further.
      expectPixelNear(pixel(...INSIDE), [255, 255, 255, 255]);
    });
  });

  test('leaves a region with nothing above the threshold dark', async ctx => {
    await withScene(ctx, [bloom()], pixel => {
      expectPixelNear(pixel(...DARK), [0, 0, 0, 255]);
    });
  });

  test('an intensity of zero returns the source unchanged', async ctx => {
    await withScene(ctx, [bloom({ intensity: 0 })], pixel => {
      expectPixelNear(pixel(...INSIDE), [255, 255, 255, 255]);
      expectPixelNear(pixel(...NEAR_GLOW), [0, 0, 0, 255]);
      expectPixelNear(pixel(...FAR_GLOW), [0, 0, 0, 255]);
      expectPixelNear(pixel(...DARK), [0, 0, 0, 255]);
    });
  });

  test('a higher threshold lets less light through', async ctx => {
    let low = 0;
    let high = 0;

    await withScene(ctx, [bloom({ threshold: 0.6 })], pixel => {
      low = pixel(...NEAR_GLOW)[0]!;
    });
    await withScene(ctx, [bloom({ threshold: 1 })], pixel => {
      high = pixel(...NEAR_GLOW)[0]!;
    });

    // Not zero at a threshold of one: the soft knee puts the threshold in the
    // MIDDLE of the transition, so a white pixel is still halfway up the arc.
    expect(high).toBeGreaterThan(0);
    expect(high).toBeLessThan(low);
  });
});
