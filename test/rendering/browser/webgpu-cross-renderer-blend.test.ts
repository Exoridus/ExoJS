/**
 * WebGPU cross-renderer blend browser test.
 *
 * The WebGPU counterpart of `webgl2-cross-renderer-blend`: the same scene, the
 * same analytic expectations. Blend lives in the pipeline variant here, so this
 * spec is the reference the WebGL2 lane has to agree with.
 *
 * Run via:  pnpm test:browser:webgpu
 */

import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuOnce, webGpuAvailable } from './_backendSetup';
import { blendClearColor, blendExpected, blendSamples, buildCrossRendererBlendScene } from './_crossRendererBlendScene';
import { expectPixelNear } from './_pixels';

const canvasSize = 64;

describe('WebGPU blend state across renderer types', () => {
  test('each node blends with its own blend mode when renderer types alternate', async ctx => {
    if (!(await webGpuAvailable())) {
      return;
    }

    const backend = await createWebGpuTestBackend(canvasSize);
    const scene = buildCrossRendererBlendScene();

    try {
      if (!(await renderWebGpuOnce(ctx, backend, scene.root, blendClearColor))) return;

      expect(backend.stats.drawCalls).toBe(3);

      const pixel = readWebGpuPixels(backend, canvasSize);

      for (const [name, [x, y]] of Object.entries(blendSamples)) {
        expectPixelNear(pixel(x, y), blendExpected[name as keyof typeof blendSamples]);
      }
    } finally {
      scene.dispose();
      backend.destroy();
    }
  });
});
