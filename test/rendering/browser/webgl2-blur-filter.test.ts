/**
 * BlurFilter's kernel shape, on a real WebGL2 GPU.
 *
 * The filter used to draw its input at offsets along the X axis and again at
 * offsets along the Y axis, all additively into one target. That is a CROSS,
 * not a blur: a pixel diagonally off a corner is reached by neither sweep and
 * stays black, however large the radius. `BlurFilter` promises a general blur,
 * so these specs read the corner.
 */
import { describe, expect, test } from 'vitest';

import { Color } from '#core/Color';
import { BlurFilter } from '#rendering/filters/BlurFilter';
import { ColorMatrixFilter } from '#rendering/filters/ColorMatrixFilter';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { BLUR_SCENE_SIZE, blurScene, CLEAR, DIAGONAL, ON_AXIS, OUTSIDE_HIGH, OUTSIDE_LOW } from './_blurFilterFixture';

const RADIUS = 8;
const QUALITY = 4;

const withScene = async (
  filters: () => readonly [BlurFilter, ...ColorMatrixFilter[]],
  read: (pixel: (x: number, y: number) => readonly number[]) => void,
  origin?: number,
): Promise<void> => {
  const backend = await createWebGl2TestBackend(BLUR_SCENE_SIZE);
  const { root, texture } = blurScene(filters(), origin);

  try {
    renderWebGl2Once(backend, root, CLEAR);
    read((x, y) => readWebGl2Pixel(backend, x, y));
  } finally {
    root.destroy();
    texture.destroy();
    backend.destroy();
  }
};

const blur = (): readonly [BlurFilter] => [new BlurFilter({ radius: RADIUS, quality: QUALITY })];

describe('BlurFilter kernel shape (WebGL2)', () => {
  test('colour reaches the diagonal quadrant, not only the two axes', async () => {
    await withScene(blur, pixel => {
      const corner = pixel(DIAGONAL[0], DIAGONAL[1]);
      const axis = pixel(ON_AXIS[0], ON_AXIS[1]);

      // A cross-shaped sampler leaves this exactly 0.
      expect(corner[0]!).toBeGreaterThan(20);
      // …and still less than the on-axis reading: a separable Gaussian falls
      // off with distance, so a filter that lit the corner as brightly as the
      // axis would not be one either.
      expect(corner[0]!).toBeLessThan(axis[0]!);
    });
  });

  test('the kernel is symmetric on both axes and both diagonals', async () => {
    await withScene(blur, pixel => {
      const corners = [pixel(OUTSIDE_HIGH, OUTSIDE_HIGH), pixel(OUTSIDE_LOW, OUTSIDE_HIGH), pixel(OUTSIDE_HIGH, OUTSIDE_LOW), pixel(OUTSIDE_LOW, OUTSIDE_LOW)];

      for (const corner of corners) {
        expect(Math.abs(corner[0]! - corners[0]![0]!)).toBeLessThanOrEqual(2);
      }

      // Horizontal reach equals vertical reach - the isotropy the cross kernel
      // also had, and which the rewrite must not lose.
      expect(Math.abs(pixel(OUTSIDE_HIGH, 31)[0]! - pixel(31, OUTSIDE_HIGH)[0]!)).toBeLessThanOrEqual(2);
      expect(Math.abs(pixel(OUTSIDE_HIGH, 31)[0]! - pixel(OUTSIDE_LOW, 31)[0]!)).toBeLessThanOrEqual(2);
    });
  });

  test('the spread is not clipped to the subject bounds', async () => {
    await withScene(blur, pixel => {
      // `radius` out from the edge is the furthest the kernel reaches; one
      // pixel short of that must still carry colour, and well beyond it must
      // be untouched background.
      expect(pixel(OUTSIDE_HIGH + RADIUS - 2, 31)[0]!).toBeGreaterThan(0);
      expect(pixel(2, 2)).toEqual([0, 0, 0, 255]);
    });
  });

  test('a fractional subject position still spreads into the corner', async () => {
    await withScene(
      blur,
      pixel => {
        expect(pixel(DIAGONAL[0], DIAGONAL[1])[0]!).toBeGreaterThan(20);
      },
      24.5,
    );
  });

  test('a blur composes with a second filter in the chain', async () => {
    await withScene(
      () => [new BlurFilter({ radius: RADIUS, quality: QUALITY }), new ColorMatrixFilter().tint(new Color(255, 0, 0))],
      pixel => {
        const corner = pixel(DIAGONAL[0], DIAGONAL[1]);

        expect(corner[0]!).toBeGreaterThan(20);
        expect(corner[1]!).toBe(0);
        expect(corner[2]!).toBe(0);
      },
    );
  });
});
