import { describe, test } from 'vitest';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { BLUR_SCENE_SIZE, blurScene, CLEAR } from './_blurFilterFixture';
import { BEFORE_SQUARE, constantDisplacementMap, DISPLACED_SQUARE, displacement, MIRRORED_SQUARE, VACATED_SQUARE } from './_displacementFixture';
import { expectPixelNear } from './_pixels';

describe('DisplacementFilter (WebGPU)', () => {
  test('a constant map moves the whole square by the scaled displacement', async ctx => {
    const backend = await createWebGpuTestBackend(BLUR_SCENE_SIZE);
    const map = constantDisplacementMap();
    const filter = displacement(map);
    const { root, texture } = blurScene([filter]);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, CLEAR))) return;

      const pixel = readWebGpuPixels(backend, BLUR_SCENE_SIZE);

      expectPixelNear(pixel(...DISPLACED_SQUARE), [255, 255, 255, 255]);
      expectPixelNear(pixel(...VACATED_SQUARE), [0, 0, 0, 255]);
      expectPixelNear(pixel(...BEFORE_SQUARE), [0, 0, 0, 255]);
      expectPixelNear(pixel(...MIRRORED_SQUARE), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      filter.destroy();
      map.destroy();
      backend.destroy();
    }
  });

  test('scale 0 leaves the input where it is', async ctx => {
    const backend = await createWebGpuTestBackend(BLUR_SCENE_SIZE);
    const map = constantDisplacementMap();
    const filter = displacement(map).setScale(0);
    const { root, texture } = blurScene([filter]);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, CLEAR))) return;

      const pixel = readWebGpuPixels(backend, BLUR_SCENE_SIZE);

      expectPixelNear(pixel(...VACATED_SQUARE), [255, 255, 255, 255]);
      expectPixelNear(pixel(...DISPLACED_SQUARE), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      filter.destroy();
      map.destroy();
      backend.destroy();
    }
  });
});
