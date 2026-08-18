/**
 * ColorMatrixFilter on a real WebGPU GPU - the WGSL half of
 * `webgl2-color-matrix-filter.test.ts`. Same matrices, same expected pixels:
 * the straight-alpha round trip has to be identical on both backends, since
 * both write into the same premultiplied targets.
 */
import { describe, test } from 'vitest';

import { Color } from '#core/Color';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import type { Filter } from '#rendering/filters/Filter';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import { CLEAR, MATRIX_SCENE_SIZE, matrixScene, SAMPLE } from './_colorMatrixFixture';
import { expectPixelNear, type RgbaTuple } from './_pixels';

const render = async (ctx: { skip: (reason: string) => void }, css: string, filters: readonly Filter[], expected: RgbaTuple, tolerance = 3): Promise<void> => {
  const backend = await createWebGpuTestBackend(MATRIX_SCENE_SIZE);
  const { root, textures } = matrixScene(css, filters);

  try {
    if (!(await renderWebGpuOnce(ctx, backend, root, CLEAR))) return;

    expectPixelNear(readWebGpuPixels(backend, MATRIX_SCENE_SIZE)(SAMPLE, SAMPLE), expected, tolerance);
  } finally {
    root.destroy();
    for (const texture of textures) texture.destroy();
    backend.destroy();
  }
};

describe('ColorMatrixFilter grading (WebGPU)', () => {
  test('the identity matrix leaves the subject untouched', async ctx => {
    await render(ctx, '#40a0c0', [new ColorMatrixFilter()], [0x40, 0xa0, 0xc0, 255]);
  });

  test('tint multiplies exactly like a per-drawable tint would', async ctx => {
    await render(ctx, '#ffffff', [new ColorMatrixFilter().tint(new Color(255, 0, 0))], [255, 0, 0, 255]);
  });

  test('grayscale collapses a colour onto its luma', async ctx => {
    const luma = Math.round(0.2126 * 0x40 + 0.7152 * 0xa0 + 0.0722 * 0xc0);

    await render(ctx, '#40a0c0', [new ColorMatrixFilter().grayscale()], [luma, luma, luma, 255]);
  });

  test('a half-transparent edge grades on straight alpha, not on the stored sample', async ctx => {
    // Applying the inversion to the stored premultiplied sample reads 204.
    await render(ctx, 'rgba(102, 102, 102, 0.5)', [new ColorMatrixFilter().invert()], [77, 77, 77, 255]);
  });
});
