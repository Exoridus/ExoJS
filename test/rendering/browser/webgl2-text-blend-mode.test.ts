/**
 * WebGL2 `Text.blendMode` browser test.
 *
 * `blendMode` is settable on `Text` and participates in the batch key, so a
 * renderer that never applies it draws with whatever the previously flushed
 * renderer left behind. The WebGPU spec asserts the same values.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import { BlendModes } from '#rendering/types';

import { createWebGl2TestBackend, readWebGl2Frame, renderWebGl2Once } from './_backendSetup';
import { expectPixelNear, pixelAt } from './_pixels';
import { buildTextBlendScene, findFullyCoveredPixel, textAdditiveExpected, textBlendClearColor, textNormalExpected } from './_textBlendScene';

const canvasSize = 64;

describe('WebGL2 Text.blendMode', () => {
  test('an additive text run composites with the backdrop instead of replacing it', async () => {
    const backend = await createWebGl2TestBackend(canvasSize);
    const scene = buildTextBlendScene();

    try {
      renderWebGl2Once(backend, scene.root, textBlendClearColor);

      const normal = readWebGl2Frame(backend, canvasSize);
      const sample = findFullyCoveredPixel(normal, canvasSize);

      expect(sample, 'the glyph must cover at least one pixel completely').not.toBeNull();
      expectPixelNear(pixelAt(normal, canvasSize, sample!.x, sample!.y), textNormalExpected);

      scene.text.blendMode = BlendModes.Additive;
      renderWebGl2Once(backend, scene.root, textBlendClearColor);

      const additive = readWebGl2Frame(backend, canvasSize);

      expectPixelNear(pixelAt(additive, canvasSize, sample!.x, sample!.y), textAdditiveExpected);
    } finally {
      scene.dispose();
      backend.destroy();
    }
  });
});
