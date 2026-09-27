import { expect, test } from 'vitest';

import { Container } from '#rendering/Container';
import { Sprite } from '#rendering/sprite/Sprite';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { Texture } from '#rendering/texture/Texture';
import { TextureFormat } from '#rendering/types';

import { createWebGl2TestBackend } from './_backendSetup';

const pixelTexture = (colorSpace: 'srgb' | 'linear-srgb'): Texture =>
  Texture.fromPixels({ colorSpace, alphaMode: 'straight', levels: [{ data: new Uint8Array([128, 128, 128, 255]), width: 1, height: 1 }] });

test('WebGL2 decodes sRGB storage while leaving UNORM raw samples unchanged', async () => {
  const backend = await createWebGl2TestBackend(2);
  const srgbTarget = new RenderTexture(2, 2, { format: TextureFormat.Rgba8 });
  const unormTarget = new RenderTexture(2, 2, { format: TextureFormat.Rgba8 });
  const srgb = pixelTexture('srgb');
  const unorm = pixelTexture('linear-srgb');

  try {
    for (const [texture, target] of [
      [srgb, srgbTarget],
      [unorm, unormTarget],
    ] as const) {
      const root = new Container();
      const sprite = new Sprite(texture);

      sprite.width = 2;
      sprite.height = 2;
      root.addChild(sprite);
      backend.setRenderTarget(target).clear();
      root.render(backend);
      backend.flush();
      root.destroy({ children: true });
    }

    const srgbPixels = await backend.readPixels(srgbTarget, 0, 0, 1, 1);
    const unormPixels = await backend.readPixels(unormTarget, 0, 0, 1, 1);

    expect(srgbPixels[0]).toBeCloseTo(0.21586 * 255, 0);
    expect(unormPixels[0]).toBe(128);
  } finally {
    srgb.destroy();
    unorm.destroy();
    srgbTarget.destroy();
    unormTarget.destroy();
    backend.destroy();
  }
});

test('WebGL2 accepts an sRGB framebuffer attachment for clear and readback', async () => {
  const backend = await createWebGl2TestBackend(2);
  const target = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });

  try {
    backend.setRenderTarget(target).clear();

    expect(await backend.readPixels(target, 0, 0, 1, 1)).toEqual(new Uint8ClampedArray([0, 0, 0, 255]));
  } finally {
    target.destroy();
    backend.destroy();
  }
});
