/**
 * BlurFilter's kernel shape on a real WebGPU GPU - the counterpart to
 * `webgl2-blur-filter.test.ts`. The two-sweep blur is written entirely in
 * backend-neutral draw calls, so both backends must produce the same shape;
 * this spec is what proves it rather than assumes it.
 */
import { describe, expect, test } from 'vitest';

import { BlurFilter } from '#rendering/filters/BlurFilter';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { BLUR_SCENE_SIZE, blurScene, CLEAR, DIAGONAL, ON_AXIS, OUTSIDE_HIGH, OUTSIDE_LOW } from './_blurFilterFixture';

describe('BlurFilter kernel shape (WebGPU)', () => {
  test('colour reaches the diagonal quadrant and stays symmetric', async ctx => {
    const backend = await createWebGpuTestBackend(BLUR_SCENE_SIZE);
    const { root, texture } = blurScene([new BlurFilter({ radius: 8, quality: 4 })]);

    try {
      if (!(await renderWebGpuOnce(ctx, backend, root, CLEAR))) return;

      const pixel = readWebGpuPixels(backend, BLUR_SCENE_SIZE);
      const corner = pixel(DIAGONAL[0], DIAGONAL[1]);

      // A cross-shaped sampler leaves this exactly 0.
      expect(corner[0]).toBeGreaterThan(20);
      expect(corner[0]).toBeLessThan(pixel(ON_AXIS[0], ON_AXIS[1])[0]);

      for (const mirrored of [pixel(OUTSIDE_LOW, OUTSIDE_HIGH), pixel(OUTSIDE_HIGH, OUTSIDE_LOW), pixel(OUTSIDE_LOW, OUTSIDE_LOW)]) {
        expect(Math.abs(mirrored[0] - corner[0])).toBeLessThanOrEqual(2);
      }

      expect(pixel(2, 2)).toEqual([0, 0, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});
