/**
 * RGB-1D LUT grading, on a real WebGPU GPU - the WGSL half of
 * `webgl2-lut-filter.test.ts`. Both backends must implement the same contract:
 * three independent per-channel curves, alpha untouched.
 */
import { describe, test } from 'vitest';

import { LutFilter } from '#rendering/filters/LutFilter';
import { DataTexture } from '#rendering/texture/DataTexture';
import { TextureFormat } from '#rendering/types';

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuEncoded } from './_backendSetup';
import { CLEAR, expectedProbeOutput, LUT_SCENE_SIZE, lutScene, PROBE_COLOURS, probeLut, SAMPLE_POINT } from './_lutFilterFixture';
import { expectPixelNear } from './_pixels';

describe('LutFilter rgb1d grading (WebGPU)', () => {
  test('the identity LUT is a no-op for every channel, not just red', async ctx => {
    for (const { css, rgb } of PROBE_COLOURS) {
      const backend = await createWebGpuTestBackend(LUT_SCENE_SIZE);
      const filter = new LutFilter({ mode: 'rgb1d' }).setLut(LutFilter.identityLut1D());
      const { root, texture } = lutScene(css, filter);

      try {
        if (!(await renderWebGpuEncoded(ctx, backend, root, CLEAR))) {
          return;
        }

        expectPixelNear(readWebGpuPixels(backend, LUT_SCENE_SIZE)(SAMPLE_POINT, SAMPLE_POINT), [rgb[0], rgb[1], rgb[2], 255]);
      } finally {
        root.destroy();
        texture.destroy();
        backend.destroy();
      }
    }
  });

  test('each channel follows its own curve', async ctx => {
    for (const { css, rgb } of PROBE_COLOURS) {
      const backend = await createWebGpuTestBackend(LUT_SCENE_SIZE);
      const filter = new LutFilter({ mode: 'rgb1d' }).setLut(probeLut());
      const { root, texture } = lutScene(css, filter);

      try {
        if (!(await renderWebGpuEncoded(ctx, backend, root, CLEAR))) {
          return;
        }

        expectPixelNear(readWebGpuPixels(backend, LUT_SCENE_SIZE)(SAMPLE_POINT, SAMPLE_POINT), expectedProbeOutput(rgb[0], rgb[1], rgb[2]));
      } finally {
        root.destroy();
        texture.destroy();
        backend.destroy();
      }
    }
  });

  // Both WGSL modes shared one broken entry-point name, so no LUT ever reached
  // the screen on this backend. Cover the 3D path too, or the regression can
  // come back through the mode this suite does not exercise.
  test('the identity 3D LUT is a no-op as well', async ctx => {
    const backend = await createWebGpuTestBackend(LUT_SCENE_SIZE);
    const filter = new LutFilter({ mode: '3d', size: 17 });
    const { root, texture } = lutScene('#40a0c0', filter);

    try {
      if (!(await renderWebGpuEncoded(ctx, backend, root, CLEAR))) {
        return;
      }

      expectPixelNear(readWebGpuPixels(backend, LUT_SCENE_SIZE)(SAMPLE_POINT, SAMPLE_POINT), [0x40, 0xa0, 0xc0, 255], 8);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });
});

const checkNonfilteringLut = async (ctx: { skip(reason: string): void }, mode: '3d' | 'rgb1d'): Promise<void> => {
  const backend = await createWebGpuTestBackend(LUT_SCENE_SIZE);
  const identity = mode === '3d' ? LutFilter.identityLut3D(2) : LutFilter.identityLut1D(2);
  const lut = new DataTexture({
    width: identity.width,
    height: identity.height,
    format: TextureFormat.Rgba32F,
    data: Float32Array.from(identity.buffer, value => value / 255),
  });
  const filter = new LutFilter({ mode, size: 2 }).setLut(lut);
  const { root, texture } = lutScene('#ff0000', filter);

  vi.spyOn(backend, 'isNonFilterableTexture').mockImplementation(candidate => candidate === lut);

  try {
    if (!(await renderWebGpuEncoded(ctx, backend, root, CLEAR))) {
      return;
    }

    expectPixelNear(readWebGpuPixels(backend, LUT_SCENE_SIZE)(SAMPLE_POINT, SAMPLE_POINT), [255, 0, 0, 255]);
  } finally {
    root.destroy();
    filter.destroy();
    texture.destroy();
    identity.destroy();
    lut.destroy();
    backend.destroy();
  }
};

test('3D LUT samples through its paired nonfiltering sampler', async ctx => {
  await checkNonfilteringLut(ctx, '3d');
});
