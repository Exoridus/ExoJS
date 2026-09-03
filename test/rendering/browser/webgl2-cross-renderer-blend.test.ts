/**
 * WebGL2 cross-renderer blend browser test.
 *
 * The WebGL2 blend state is global; the renderers batch independently. This
 * spec draws `Sprite(Additive) -> Graphics(Normal) -> Sprite(Additive)` and
 * reads one pixel per node, so a renderer that resumes a batch without
 * re-establishing its own blend mode shows up as a wrong pixel. The WebGPU
 * spec asserts the same values.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { blendClearColor, blendExpected, blendSamples, buildCrossRendererBlendScene } from './_crossRendererBlendScene';
import { expectPixelNear } from './_pixels';

const canvasSize = 64;

describe('WebGL2 blend state across renderer types', () => {
  test('each node blends with its own blend mode when renderer types alternate', async () => {
    const backend = await createWebGl2TestBackend(canvasSize);
    const scene = buildCrossRendererBlendScene();

    try {
      renderWebGl2Once(backend, scene.root, blendClearColor);

      // One draw call per node: a scene that merged them could not observe a
      // renderer inheriting another renderer's blend state.
      expect(backend.stats.drawCalls).toBe(3);

      for (const [name, [x, y]] of Object.entries(blendSamples)) {
        expectPixelNear(readWebGl2Pixel(backend, x, y), blendExpected[name as keyof typeof blendSamples]);
      }
    } finally {
      scene.dispose();
      backend.destroy();
    }
  });
});
