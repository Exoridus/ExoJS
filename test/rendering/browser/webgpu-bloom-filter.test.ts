import { describe, expect, test } from 'vitest';

import type { Filter } from '#rendering/filters/Filter';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce } from './_backendSetup';
import {
  backdropScene,
  bloom,
  DARK,
  FAR_GLOW,
  INSIDE,
  NEAR_GLOW,
  OVER_BACKDROP,
  OVER_SUBJECT,
  PLATEAU,
  PLATEAU_COLOR,
  plateauScene,
  UNTOUCHED_BACKDROP,
} from './_bloomFixture';
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

const withPlateau = async (
  ctx: { skip: (reason: string) => void },
  levels: number,
  read: (pixel: (x: number, y: number) => RgbaTuple) => void,
): Promise<void> => {
  const backend = await createWebGpuTestBackend(BLUR_SCENE_SIZE);
  const { root, texture, filter } = plateauScene(levels);

  try {
    if (!(await renderWebGpuOnce(ctx, backend, root, CLEAR))) return;
    read(readWebGpuPixels(backend, BLUR_SCENE_SIZE));
  } finally {
    root.destroy();
    texture.destroy();
    backend.destroy();
    filter.destroy();
  }
};

const withBackdrop = async (ctx: { skip: (reason: string) => void }, read: (pixel: (x: number, y: number) => RgbaTuple) => void): Promise<void> => {
  const backend = await createWebGpuTestBackend(BLUR_SCENE_SIZE);
  const { root, textures, filter } = backdropScene();

  try {
    if (!(await renderWebGpuOnce(ctx, backend, root, CLEAR))) return;
    read(readWebGpuPixels(backend, BLUR_SCENE_SIZE));
  } finally {
    root.destroy();
    for (const texture of textures) texture.destroy();
    backend.destroy();
    filter.destroy();
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

  test('the glow inside a uniform bright region does not scale with the level count', async ctx => {
    let shallow = 0;
    let deep = 0;

    await withPlateau(ctx, 1, pixel => {
      shallow = pixel(...PLATEAU)[0]!;
    });
    await withPlateau(ctx, 3, pixel => {
      deep = pixel(...PLATEAU)[0]!;
    });

    // A constant field survives a halving, a blur and a doubling unchanged, so
    // the middle of the plateau is the same glow however many levels it took to
    // get there. An upsample that accumulated the levels it passed would add
    // the unblurred extraction once per level and read far brighter here.
    expect(shallow).toBeGreaterThan(PLATEAU_COLOR.r);
    expectPixelNear([deep, 0, 0, 0], [shallow, 0, 0, 0]);
  });

  test('adds the glow as light, leaving the backdrop and the subject alpha alone', async ctx => {
    await withBackdrop(ctx, pixel => {
      const halo = pixel(...OVER_BACKDROP);
      const subject = pixel(...OVER_SUBJECT);
      const untouched = pixel(...UNTOUCHED_BACKDROP);

      // The glow is red and the backdrop is blue, so blue is untouched by it.
      // A halo composited as COVERAGE would scale the backdrop down by its own
      // alpha instead, and this is the channel that would show it.
      expect(halo[2]!).toBeGreaterThanOrEqual(untouched[2]! - 1);
      expect(halo[0]!).toBeGreaterThan(20);

      // Half alpha over the backdrop is half of each: a bloom that added alpha
      // would have driven the composite opaque and taken the blue with it.
      expect(subject[2]!).toBeGreaterThan(80);
      expect(subject[0]!).toBeGreaterThan(127);
    });
  });
});
