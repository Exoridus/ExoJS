import { createWebGpuTestBackend, readWebGpuPixels, renderWebGpuEncoded } from './_backendSetup';
import { createGraphicsGeometryScene, graphicsGeometryCases } from './_graphicsGeometryCases';
import { expectPixelNear } from './_pixels';

describe('WebGPU graphics geometry', () => {
  for (const kind of graphicsGeometryCases) {
    test(kind, async ctx => {
      const backend = await createWebGpuTestBackend(64);
      let scene: ReturnType<typeof createGraphicsGeometryScene> | undefined;

      try {
        scene = createGraphicsGeometryScene(kind);

        if (!(await renderWebGpuEncoded(ctx, backend, scene.root))) {
          return;
        }

        const pixel = readWebGpuPixels(backend, 64);

        expectPixelNear(pixel(...scene.white), [255, 255, 255, 255]);
        expectPixelNear(pixel(...scene.black), [0, 0, 0, 255]);
      } finally {
        scene?.dispose();
        backend.destroy();
      }
    });
  }
});
