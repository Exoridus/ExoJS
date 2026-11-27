/**
 * The WebGL2 alpha-mask compositor on a real context: the output is the
 * content scaled by the mask alpha in every channel (premultiplied), and the
 * mask lands the same way up as the same texture drawn as a sprite.
 */
import { expect, test } from 'vitest';

import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { BlendModes } from '#rendering/types';

import { createWebGl2TestBackend } from './_backendSetup';

const size = 4;

/** Opaque top half, alpha 64 bottom half, so both the scaling and the orientation are visible. */
const halfMask = (): Texture => {
  const data = new Uint8Array(size * size * 4);

  for (let index = 0; index < size * size; index++) {
    data.set([255, 255, 255, index < (size * size) / 2 ? 255 : 64], index * 4);
  }

  return Texture.fromPixels({ colorSpace: 'linear-srgb', alphaMode: 'straight', levels: [{ data, width: size, height: size }] });
};

const alphaColumn = (pixels: Uint8ClampedArray): number[] => Array.from({ length: size }, (_, row) => pixels[row * size * 4 + 3]!);

test('WebGL2 composes content through an alpha mask, premultiplied and the right way up', async () => {
  const backend = await createWebGl2TestBackend(size);
  const content = new RenderTexture(size, size);
  const target = new RenderTexture(size, size);
  const reference = new RenderTexture(size, size);
  const mask = halfMask();
  const root = new Container();
  const sprite = new Sprite(mask);

  try {
    backend.setRenderTarget(content).clear(new Color(255, 0, 0, 1));
    backend.setRenderTarget(target).clear(new Color(0, 0, 0, 0));
    backend.composeWithAlphaMask(content, mask, 0, 0, size, size, BlendModes.Normal);
    backend.flush();

    sprite.width = size;
    sprite.height = size;
    root.addChild(sprite);
    backend.setRenderTarget(reference).clear(new Color(0, 0, 0, 0));
    root.render(backend);
    backend.flush();

    const composed = await backend.readPixels(target, 0, 0, size, size);
    const expectedAlpha = alphaColumn(await backend.readPixels(reference, 0, 0, size, size));

    expect([...new Set(expectedAlpha)].sort((a, b) => a - b)).toEqual([64, 255]);
    expect(alphaColumn(composed)).toEqual(expectedAlpha);

    for (let row = 0; row < size; row++) {
      const offset = row * size * 4;
      const alpha = expectedAlpha[row]!;

      expect([composed[offset], composed[offset + 1], composed[offset + 2]]).toEqual([alpha, 0, 0]);
    }
  } finally {
    root.destroy();
    mask.destroy();
    content.destroy();
    target.destroy();
    reference.destroy();
    backend.destroy();
  }
});
