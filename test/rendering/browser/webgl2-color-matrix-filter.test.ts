/**
 * ColorMatrixFilter on a real WebGL2 GPU.
 *
 * Two things can only be checked here rather than in the matrix unit specs:
 * that the shader implements the same arithmetic, and that it does so on
 * STRAIGHT alpha. Render targets store premultiplied colour, so a transform
 * with an offset — invert, contrast, a bias row — gives a visibly different
 * answer when it is applied to the stored sample instead of the recovered one.
 */
import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';
import type { Filter } from '#rendering/filters/Filter';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { CLEAR, MATRIX_SCENE_SIZE, matrixScene, matrixSubtreeScene, SAMPLE, SECOND_SAMPLE } from './_colorMatrixFixture';
import { expectPixelNear, type RgbaTuple } from './_pixels';

const render = async (css: string, filters: readonly Filter[], read: (pixel: (x: number, y: number) => RgbaTuple) => void): Promise<void> => {
  const backend = await createWebGl2TestBackend(MATRIX_SCENE_SIZE);
  const { root, textures } = matrixScene(css, filters);

  try {
    renderWebGl2Once(backend, root, CLEAR);
    read((x, y) => readWebGl2Pixel(backend, x, y));
  } finally {
    root.destroy();
    for (const texture of textures) texture.destroy();
    backend.destroy();
  }
};

describe('ColorMatrixFilter grading (WebGL2)', () => {
  test('the identity matrix leaves the subject untouched', async () => {
    await render('#40a0c0', [new ColorMatrixFilter()], pixel => {
      expectPixelNear(pixel(SAMPLE, SAMPLE), [0x40, 0xa0, 0xc0, 255]);
    });
  });

  test('tint multiplies exactly like a per-drawable tint would', async () => {
    await render('#ffffff', [new ColorMatrixFilter().tint(new Color(255, 0, 0))], pixel => {
      expectPixelNear(pixel(SAMPLE, SAMPLE), [255, 0, 0, 255]);
    });
  });

  test('brightness scales the channels', async () => {
    await render('#ffffff', [new ColorMatrixFilter().brightness(0.5)], pixel => {
      expectPixelNear(pixel(SAMPLE, SAMPLE), [128, 128, 128, 255], 3);
    });
  });

  test('contrast pivots around mid grey', async () => {
    // 0.6 grey (153) pushed to 0.7 (179) at contrast 2.
    await render('#999999', [new ColorMatrixFilter().contrast(2)], pixel => {
      expectPixelNear(pixel(SAMPLE, SAMPLE), [179, 179, 179, 255], 3);
    });
  });

  test('grayscale collapses a colour onto its luma', async () => {
    const luma = Math.round(0.2126 * 0x40 + 0.7152 * 0xa0 + 0.0722 * 0xc0);

    await render('#40a0c0', [new ColorMatrixFilter().grayscale()], pixel => {
      expectPixelNear(pixel(SAMPLE, SAMPLE), [luma, luma, luma, 255], 3);
    });
  });

  test('an offset row brightens towards white', async () => {
    // Identity plus 0.4 on every colour row: 0.2 -> 0.6.
    const brighten = new ColorMatrixFilter([1, 0, 0, 0, 0.4, 0, 1, 0, 0, 0.4, 0, 0, 1, 0, 0.4, 0, 0, 0, 1, 0]);

    await render('#333333', [brighten], pixel => {
      expectPixelNear(pixel(SAMPLE, SAMPLE), [153, 153, 153, 255], 3);
    });
  });

  test('a half-transparent edge grades on straight alpha, not on the stored sample', async () => {
    // 0.4 grey at half alpha. Inverted on straight alpha that is 0.6, which
    // composites over black to 0.3 -> 77. Inverting the STORED premultiplied
    // 0.2 would give 0.8 and read 204 instead.
    await render('rgba(102, 102, 102, 0.5)', [new ColorMatrixFilter().invert()], pixel => {
      expectPixelNear(pixel(SAMPLE, SAMPLE), [77, 77, 77, 255], 3);
    });
  });

  test('a transparent region stays transparent', async () => {
    await render('rgba(255, 255, 255, 0)', [new ColorMatrixFilter().invert()], pixel => {
      expectPixelNear(pixel(SAMPLE, SAMPLE), [0, 0, 0, 255]);
    });
  });

  test('one filter covers a whole subtree', async () => {
    const backend = await createWebGl2TestBackend(MATRIX_SCENE_SIZE);
    const { root, textures } = matrixSubtreeScene('#ffffff', '#ff0000', [new ColorMatrixFilter().grayscale()]);

    try {
      renderWebGl2Once(backend, root, CLEAR);

      const red = Math.round(0.2126 * 255);

      expectPixelNear(readWebGl2Pixel(backend, SAMPLE, SAMPLE), [255, 255, 255, 255], 3);
      expectPixelNear(readWebGl2Pixel(backend, SECOND_SAMPLE, SECOND_SAMPLE), [red, red, red, 255], 3);
    } finally {
      root.destroy();
      for (const texture of textures) texture.destroy();
      backend.destroy();
    }
  });

  test('a cached subtree re-bakes when the matrix changes', async () => {
    const backend = await createWebGl2TestBackend(MATRIX_SCENE_SIZE);
    const filter = new ColorMatrixFilter();
    const { root, textures } = matrixScene('#ffffff', [filter]);

    try {
      root.children[0]!.cacheAsTexture = true;

      renderWebGl2Once(backend, root, CLEAR);
      expectPixelNear(readWebGl2Pixel(backend, SAMPLE, SAMPLE), [255, 255, 255, 255]);

      filter.tint(new Color(0, 255, 0));

      renderWebGl2Once(backend, root, CLEAR);
      expectPixelNear(readWebGl2Pixel(backend, SAMPLE, SAMPLE), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      for (const texture of textures) texture.destroy();
      backend.destroy();
    }
  });

  test('it composes with a blur in the same chain', async () => {
    await render('#ffffff', [new BlurFilter({ radius: 4, quality: 3 }), new ColorMatrixFilter().tint(new Color(255, 0, 0))], pixel => {
      const centre = pixel(SAMPLE, SAMPLE);

      expect(centre[0]).toBeGreaterThan(40);
      expect(centre[1]).toBe(0);
      expect(centre[2]).toBe(0);
    });
  });
});
