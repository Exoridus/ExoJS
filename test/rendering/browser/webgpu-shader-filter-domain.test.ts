import { describe, test } from 'vitest';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { BLUR_SCENE_SIZE, blurScene, CLEAR } from './_blurFilterFixture';
import { expectPixelNear } from './_pixels';
import { DOMAIN_CASES, ExpandingPassThrough, PROBE_ROWS, ShiftingPassThrough, V_SHIFT_PROBE_ROWS } from './_shaderFilterDomainFixture';

describe('ShaderFilter keeps its input in place inside an expanded effect domain (WebGPU)', () => {
  for (const [label, above, below] of DOMAIN_CASES) {
    test(label, async ctx => {
      const backend = await createWebGpuTestBackend(BLUR_SCENE_SIZE);
      const filter = new ExpandingPassThrough(above, below);
      const { root, texture } = blurScene([filter]);

      try {
        if (!(await renderWebGpuOnce(ctx, backend, root, CLEAR))) return;

        const pixel = readWebGpuPixels(backend, BLUR_SCENE_SIZE);

        for (const [y, inside] of PROBE_ROWS) {
          expectPixelNear(pixel(30, y), inside ? [255, 255, 255, 255] : [0, 0, 0, 255]);
        }
      } finally {
        root.destroy();
        texture.destroy();
        filter.destroy();
        backend.destroy();
      }
    });
  }

  test('a shader offsetting along v through uOrientation moves its input down', async ctx => {
    const backend = await createWebGpuTestBackend(BLUR_SCENE_SIZE);
    const filter = new ShiftingPassThrough();
    const { root, texture } = blurScene([filter]);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, CLEAR))) return;

      const pixel = readWebGpuPixels(backend, BLUR_SCENE_SIZE);

      for (const [y, inside] of V_SHIFT_PROBE_ROWS) {
        expectPixelNear(pixel(30, y), inside ? [255, 255, 255, 255] : [0, 0, 0, 255]);
      }
    } finally {
      root.destroy();
      texture.destroy();
      filter.destroy();
      backend.destroy();
    }
  });
});
