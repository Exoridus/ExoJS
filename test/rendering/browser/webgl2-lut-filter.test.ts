/**
 * RGB-1D LUT grading, on a real WebGL2 GPU.
 *
 * `LutFilter`'s 1D mode used to index the LUT by the source's RED channel only
 * and then take the whole RGB of that one lookup, so green and blue were
 * decided by the red channel. `LutFilter.identityLut1D()` — a grey ramp — was
 * therefore not a no-op for anything but grey: pure green came out black.
 *
 * These specs pin the contract a 1D LUT actually has: three independent
 * per-channel curves, alpha untouched.
 */
import { describe, expect, test } from 'vitest';

import { LutFilter } from '#rendering/filters/LutFilter';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { CLEAR, expectedProbeOutput, LUT_SCENE_SIZE, lutScene, PROBE_COLOURS, probeLut, SAMPLE_POINT } from './_lutFilterFixture';
import { expectPixelNear } from './_pixels';

describe('LutFilter rgb1d grading (WebGL2)', () => {
  test('the identity LUT is a no-op for every channel, not just red', async () => {
    for (const { css, rgb } of PROBE_COLOURS) {
      const backend = await createWebGl2TestBackend(LUT_SCENE_SIZE);
      const filter = new LutFilter({ mode: 'rgb1d' }).setLut(LutFilter.identityLut1D());
      const { root, texture } = lutScene(css, filter);

      try {
        renderWebGl2Once(backend, root, CLEAR);

        expectPixelNear(readWebGl2Pixel(backend, SAMPLE_POINT, SAMPLE_POINT), [rgb[0], rgb[1], rgb[2], 255]);
      } finally {
        root.destroy();
        texture.destroy();
        backend.destroy();
      }
    }
  });

  test('each channel follows its own curve', async () => {
    for (const { css, rgb } of PROBE_COLOURS) {
      const backend = await createWebGl2TestBackend(LUT_SCENE_SIZE);
      const filter = new LutFilter({ mode: 'rgb1d' }).setLut(probeLut());
      const { root, texture } = lutScene(css, filter);

      try {
        renderWebGl2Once(backend, root, CLEAR);

        expectPixelNear(readWebGl2Pixel(backend, SAMPLE_POINT, SAMPLE_POINT), expectedProbeOutput(rgb[0], rgb[1], rgb[2]));
      } finally {
        root.destroy();
        texture.destroy();
        backend.destroy();
      }
    }
  });

  test('alpha survives the lookup', async () => {
    const backend = await createWebGl2TestBackend(LUT_SCENE_SIZE);
    const filter = new LutFilter({ mode: 'rgb1d' }).setLut(LutFilter.identityLut1D());
    // Half-transparent white over black composites to mid-grey. A shader that
    // dropped or overwrote alpha would leave full white instead.
    const { root, texture } = lutScene('rgba(255, 255, 255, 0.5)', filter);

    try {
      renderWebGl2Once(backend, root, CLEAR);

      expectPixelNear(readWebGl2Pixel(backend, SAMPLE_POINT, SAMPLE_POINT), [128, 128, 128, 255], 6);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('a red-indexed lookup cannot produce these pixels', () => {
    // Guards the guard: for pure green, reading the whole RGB of lut(src.r)
    // yields the LUT's entry 0 — which differs from the per-channel result in
    // green. A shader that regressed to the old behaviour fails the spec above.
    const perChannel = expectedProbeOutput(0, 255, 0);
    const redIndexed = [255, 0, 255, 255];

    expect(perChannel).not.toEqual(redIndexed);
  });
});
