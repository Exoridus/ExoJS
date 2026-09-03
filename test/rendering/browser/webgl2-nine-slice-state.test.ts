/**
 * WebGL2 nine-slice backend-state browser tests.
 *
 * Texture unit 0 and the blend mode are global backend state that every
 * renderer shares, and the bind is also what carries a texture payload that
 * changed under a stable identity to the GPU. Both specs here draw a nine-slice
 * whose own declared state is unchanged while something else moved the backend
 * state underneath it.
 *
 * Run via:  pnpm test:browser:webgl2
 */

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { NineSliceSprite } from '#rendering/sprite/NineSliceSprite';
import { Sprite } from '#rendering/sprite/Sprite';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import { createWebGl2TestBackend, readWebGl2Pixel, renderWebGl2Once } from './_backendSetup';
import { createSolidTexture } from './_crossRendererBlendScene';
import { expectPixelNear } from './_pixels';

const canvasSize = 64;

/** A canvas-backed texture whose pixels can be repainted under a stable identity. */
const repaintableTexture = (color: string, size = 16): { texture: Texture; repaint: (next: string) => void } => {
  const canvas = document.createElement('canvas');

  canvas.width = size;
  canvas.height = size;

  const paint = (next: string): void => {
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = next;
    ctx.fillRect(0, 0, size, size);
  };

  paint(color);

  return { texture: new Texture(canvas), repaint: paint };
};

describe('WebGL2 nine-slice backend state', () => {
  test('picks up a texture payload that changed under a stable identity', async () => {
    const backend = await createWebGl2TestBackend(canvasSize);
    const { texture, repaint } = repaintableTexture('#ff0000');
    const root = new Container();
    const nine = new NineSliceSprite(texture, { slices: 4, width: 32, height: 32 });

    root.addChild(nine);

    try {
      renderWebGl2Once(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [255, 0, 0, 255]);

      repaint('#00ff00');
      texture.updateSource();

      renderWebGl2Once(backend, root);
      expectPixelNear(readWebGl2Pixel(backend, 16, 16), [0, 255, 0, 255]);
    } finally {
      root.destroy();
      texture.destroy();
      backend.destroy();
    }
  });

  test('draws with its own texture and blend mode after another renderer changed the global state', async () => {
    const backend = await createWebGl2TestBackend(canvasSize);
    const skin = createSolidTexture('#ff0000');
    const sprite = createSolidTexture('#0000ff');
    const root = new Container();

    const first = new NineSliceSprite(skin, { slices: 4, width: 16, height: 16 });
    const additive = new Sprite(sprite);
    const second = new NineSliceSprite(skin, { slices: 4, width: 16, height: 16 });

    // Overlapping bounds in document order: the draw order is then a
    // correctness constraint the render plan cannot regroup away.
    first.setPosition(0, 0);
    additive.setPosition(8, 0);
    additive.blendMode = BlendModes.Additive;
    second.setPosition(16, 0);

    root.addChild(first, additive, second);

    try {
      renderWebGl2Once(backend, root, new Color(0, 0, 64, 1));

      // One draw call per node: a scene that merged the two nine-slices could
      // not observe the sprite's state leaking into the second one.
      expect(backend.stats.drawCalls).toBe(3);

      // Normal blend over the clear colour is the source itself. The sprite
      // between the two nine-slices left its own texture on unit 0 and the
      // blend state on Additive, either of which turns this sample blue.
      expectPixelNear(readWebGl2Pixel(backend, 28, 8), [255, 0, 0, 255]);
    } finally {
      root.destroy();
      skin.destroy();
      sprite.destroy();
      backend.destroy();
    }
  });
});
