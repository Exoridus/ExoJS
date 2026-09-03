/**
 * WebGPU `Text.blendMode` browser test.
 *
 * The WebGPU counterpart of `webgl2-text-blend-mode`: the same scene, the same
 * expectations. Blend is a pipeline variant here, so honouring the setting
 * means selecting the variant the text run declares.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { BlendModes } from '#rendering/types';

import { createWebGpuTestBackend, readWebGpuFrame, renderWebGpuOnce, webGpuAvailable } from './_backendSetup';
import { expectPixelNear, pixelAt } from './_pixels';
import { buildTextBlendScene, findFullyCoveredPixel, textAdditiveExpected, textBlendClearColor, textNormalExpected } from './_textBlendScene';

const canvasSize = 64;

describe('WebGPU Text.blendMode', () => {
  test('an additive text run composites with the backdrop instead of replacing it', async ctx => {
    if (!(await webGpuAvailable())) {
      return;
    }

    const backend = await createWebGpuTestBackend(canvasSize);
    const scene = buildTextBlendScene();

    try {
      if (!(await renderWebGpuOnce(ctx, backend, scene.root, textBlendClearColor))) return;

      const normal = readWebGpuFrame(backend, canvasSize);
      const sample = findFullyCoveredPixel(normal, canvasSize);

      expect(sample, 'the glyph must cover at least one pixel completely').not.toBeNull();
      expectPixelNear(pixelAt(normal, canvasSize, sample!.x, sample!.y), textNormalExpected);

      scene.text.blendMode = BlendModes.Additive;

      if (!(await renderWebGpuOnce(ctx, backend, scene.root, textBlendClearColor))) return;

      const additive = readWebGpuFrame(backend, canvasSize);

      expectPixelNear(pixelAt(additive, canvasSize, sample!.x, sample!.y), textAdditiveExpected);
    } finally {
      scene.dispose();
      backend.destroy();
    }
  });
});
