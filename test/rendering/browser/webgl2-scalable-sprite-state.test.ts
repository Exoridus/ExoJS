import { Color } from '#core/Color';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { RepeatingSprite } from '#rendering/sprite/RepeatingSprite';
import { BlendModes } from '#rendering/types';
import { WebGl2ScalableSpriteRenderer } from '#rendering/webgl2/WebGl2ScalableSpriteRenderer';

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

test('shader repeating sprites survive the capacity boundary on the GPU', async () => {
  const backend = await createWebGl2TestBackend(64);
  const renderer = new WebGl2ScalableSpriteRenderer(2);
  const texture = createSolidTexture('#ff0000');
  const sprites = Array.from({ length: 3 }, (_, index) => {
    const sprite = new RepeatingSprite(texture, { width: 16, height: 16, modeX: 'mirror-repeat', modeY: 'stretch' });
    sprite.setPosition(index * 20, 0);

    return sprite;
  });

  try {
    renderer.connect(backend);
    backend.clear(Color.black);

    for (const sprite of sprites) {
      renderer.render(sprite);
    }

    renderer.flush();

    for (const x of [8, 28, 48]) {
      expectPixelNear(readWebGl2Pixel(backend, x, 8), [255, 0, 0, 255]);
    }
  } finally {
    renderer.destroy();

    for (const sprite of sprites) {
      sprite.destroy();
    }

    texture.destroy();
    backend.destroy();
  }
});
