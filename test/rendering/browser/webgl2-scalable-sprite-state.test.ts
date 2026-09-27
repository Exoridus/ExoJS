import { Color } from '#core/Color';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { BlendModes } from '#rendering/types';

import { createWebGl2TestBackend, readWebGl2Pixel } from './_backendSetup';
import { createSolidTexture } from './_crossRendererBlendScene';
import { expectPixelNear } from './_pixels';

describe('scalable sprite draw-time state', () => {
  test('restores texture and blend state changed after enqueue', async () => {
    const backend = await createWebGl2TestBackend(64);
    const texture = createSolidTexture('#ff0000');
    const foreign = createSolidTexture('#0000ff');
    const nine = new NineSliceSprite(texture, { slices: 4, width: 32, height: 32 });

    try {
      backend.clear(new Color(0, 0, 64, 1));
      const renderer = backend.rendererRegistry.resolve(nine);

      renderer.render(nine);
      backend.bindTexture(foreign, 0);
      backend.setBlendMode(BlendModes.Additive);
      renderer.flush();
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);
    } finally {
      nine.destroy();
      texture.destroy();
      foreign.destroy();
      backend.destroy();
    }
  });
});
