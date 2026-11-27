import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Encoded } from './_backendSetup';
import { createGraphicsGeometryScene, graphicsGeometryCases } from './_graphicsGeometryCases';
import { expectPixelNear } from './_pixels';

describe('WebGL2 graphics geometry', () => {
  for (const kind of graphicsGeometryCases) {
    test(kind, async () => {
      const backend = await createWebGl2TestBackend(64);
      let scene: ReturnType<typeof createGraphicsGeometryScene> | undefined;

      try {
        scene = createGraphicsGeometryScene(kind);
        renderWebGl2Encoded(backend, scene.root);
        expectPixelNear(readWebGl2Pixel(backend, ...scene.white), [255, 255, 255, 255]);
        expectPixelNear(readWebGl2Pixel(backend, ...scene.black), [0, 0, 0, 255]);
      } finally {
        scene?.dispose();
        backend.destroy();
      }
    });
  }
});
