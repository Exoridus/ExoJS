import { describe, test } from 'vitest';

import { Texture } from '#rendering/texture/Texture';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { BLUR_SCENE_SIZE, blurScene, CLEAR } from './_blurFilterFixture';
import {
  BEFORE_SQUARE,
  constantDisplacementMap,
  DISPLACED_SQUARE,
  displacement,
  MIRRORED_SQUARE,
  VACATED_SQUARE,
} from './_displacementFixture';
import { expectPixelNear } from './_pixels';

describe('DisplacementFilter (WebGL2)', () => {
  test('a constant map moves the whole square by the scaled displacement', async () => {
    const backend = await createWebGl2TestBackend(BLUR_SCENE_SIZE);
    const map = constantDisplacementMap();
    const filter = displacement(map);
    const { root, texture } = blurScene([filter]);

    try {
      renderWebGl2Once(backend, root, CLEAR);

      expectPixelNear(readWebGl2Pixel(backend, ...DISPLACED_SQUARE), [255, 255, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, ...VACATED_SQUARE), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, ...BEFORE_SQUARE), [0, 0, 0, 255]);
      expectPixelNear(readWebGl2Pixel(backend, ...MIRRORED_SQUARE), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      filter.destroy();
      map.destroy();
      backend.destroy();
    }
  });

  test('scale 0 leaves the input where it is', async () => {
    const backend = await createWebGl2TestBackend(BLUR_SCENE_SIZE);
    const map = constantDisplacementMap();
    const filter = displacement(map).setScale(0);
    const { root, texture } = blurScene([filter]);

    try {
      renderWebGl2Once(backend, root, CLEAR);

      expectPixelNear(readWebGl2Pixel(backend, ...VACATED_SQUARE), [255, 255, 255, 255]);
      expectPixelNear(readWebGl2Pixel(backend, ...DISPLACED_SQUARE), [0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      filter.destroy();
      map.destroy();
      backend.destroy();
    }
  });
});

test.each(['owner', 'ancestor'])('replacing a displacement map refreshes its %s cache', async cache => {
  const backend = await createWebGl2TestBackend(BLUR_SCENE_SIZE);
  const map = constantDisplacementMap();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 4;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808000';
  ctx.fillRect(0, 0, 4, 4);
  const neutral = new Texture(canvas, { colorSpace: 'none' });
  const filter = displacement(map);
  const { root, texture } = blurScene([filter]);
  (cache === 'owner' ? root.children[0]! : root).cacheAsTexture = true;

  try {
    renderWebGl2Once(backend, root, CLEAR);
    expectPixelNear(readWebGl2Pixel(backend, ...VACATED_SQUARE), [0, 0, 0, 255]);
    filter.map = neutral;
    renderWebGl2Once(backend, root, CLEAR);
    expectPixelNear(readWebGl2Pixel(backend, ...VACATED_SQUARE), [255, 255, 255, 255]);
  } finally {
    root.destroy();
    texture.destroy();
    filter.destroy();
    map.destroy();
    neutral.destroy();
    backend.destroy();
  }
});
