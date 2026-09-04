import { describe, expect, test } from 'vitest';

import type { Filter } from '#rendering/filters/Filter';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { BLUR_SCENE_SIZE, blurScene, CLEAR } from './_blurFilterFixture';
import { BEYOND_SHADOW, dropShadow, OVERLAP, SHADOW_ONLY, SOURCE_ONLY } from './_dropShadowFixture';
import { expectPixelNear, type RgbaTuple } from './_pixels';

const withScene = async (filters: readonly Filter[], read: (pixel: (x: number, y: number) => RgbaTuple) => void): Promise<void> => {
  const backend = await createWebGl2TestBackend(BLUR_SCENE_SIZE);
  const { root, texture } = blurScene(filters);

  try {
    renderWebGl2Once(backend, root, CLEAR);
    read((x, y) => readWebGl2Pixel(backend, x, y));
  } finally {
    root.destroy();
    texture.destroy();
    backend.destroy();
    for (const filter of filters) filter.destroy();
  }
};

describe('DropShadowFilter (WebGL2)', () => {
  test('draws the offset silhouette in the shadow colour behind the untouched source', async () => {
    await withScene([dropShadow()], pixel => {
      expectPixelNear(pixel(...SOURCE_ONLY), [255, 255, 255, 255]);
      expectPixelNear(pixel(...OVERLAP), [255, 255, 255, 255]);
      expectPixelNear(pixel(...SHADOW_ONLY), [255, 0, 0, 255]);
      expectPixelNear(pixel(...BEYOND_SHADOW), [0, 0, 0, 255]);
    });
  });

  test('shadowOnly leaves the source out', async () => {
    await withScene([dropShadow({ shadowOnly: true })], pixel => {
      expectPixelNear(pixel(...SOURCE_ONLY), [0, 0, 0, 255]);
      expectPixelNear(pixel(...OVERLAP), [255, 0, 0, 255]);
      expectPixelNear(pixel(...SHADOW_ONLY), [255, 0, 0, 255]);
    });
  });

  test('blur softens the shadow beyond its hard edge and reports that reach', async () => {
    const filter = dropShadow({ blur: 4, quality: 3 });

    await withScene([filter], pixel => {
      const beyond = pixel(...BEYOND_SHADOW);

      expect(beyond[0]!).toBeGreaterThan(4);
      expect(beyond[0]!).toBeLessThan(255);
      expectPixelNear(pixel(...SOURCE_ONLY), [255, 255, 255, 255]);
    });
  });
});
