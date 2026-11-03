import { Color } from '#core/Color';
import { Container } from '#rendering/Container';
import { RetainedContainer } from '#rendering/RetainedContainer';
import { CompressedTextureFormat } from '#rendering/texture/CompressedTextureFormat';
import { WebGl2ScalableSpriteRenderer } from '#rendering/webgl2/WebGl2ScalableSpriteRenderer';

import { createScalableAlphaSprite, createScalableAlphaTexture, scalableAlphaPaths } from '../scalableSpriteAlphaFixture';
import { createWebGl2TestBackend, readWebGl2Pixel, useEncodedFrameTarget } from './_backendSetup';
import { expectPixelNear } from './_pixels';

describe.each(scalableAlphaPaths)('WebGL2 scalable compressed alpha pixels: %s', path => {
  for (const tintAlpha of [1, 0.5]) {
    test(`associates samples before tint alpha ${tintAlpha} across replay`, async () => {
      const backend = await createWebGl2TestBackend(64);

      const straight = createScalableAlphaTexture('straight');
      const associated = createScalableAlphaTexture('premultiplied');
      const root = new Container();
      const group = new RetainedContainer();
      const replay = vi.spyOn(WebGl2ScalableSpriteRenderer.prototype, 'replayRetainedBatch');

      for (const [index, texture] of [straight, associated, straight].entries()) {
        const sprite = createScalableAlphaSprite(texture, path);

        sprite.setPosition(index * 20, 0);
        sprite.tint = new Color(255, 255, 255, tintAlpha);
        group.addChild(sprite);
      }

      root.addChild(group);

      try {
        expect(backend.supportedTextureFormats).toContain(CompressedTextureFormat.Bc3RgbaUnorm);

        for (let frame = 0; frame < 3; frame++) {
          backend.resetStats();
          useEncodedFrameTarget(backend);
          backend.clear(Color.black);
          root.render(backend);
          backend.flush();

          expectPixelNear(readWebGl2Pixel(backend, 8, 8), [tintAlpha === 1 ? 188 : 137, 0, 0, 255]);
          expectPixelNear(readWebGl2Pixel(backend, 28, 8), [tintAlpha === 1 ? 185 : 135, 0, 0, 255]);
          expectPixelNear(readWebGl2Pixel(backend, 48, 8), [tintAlpha === 1 ? 188 : 137, 0, 0, 255]);
        }

        expect(replay).toHaveBeenCalledTimes(path === 'repeating-shader' ? 0 : 3);
      } finally {
        replay.mockRestore();
        root.destroy();
        straight.destroy();
        associated.destroy();
        backend.destroy();
      }
    });
  }
});
