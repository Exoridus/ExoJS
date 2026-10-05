import * as exo from '#index';
import * as sdk from '#renderer-sdk';

describe('root index public API exports', () => {
  test('exports core surfaces documented in README and guides', () => {
    expect(exo.Application).toBeDefined();
    expect(exo.Scene).toBeDefined();
    expect(exo.AnimatedSprite).toBeDefined();
    expect(exo.View).toBeDefined();
    expect(exo.RenderTexture).toBeDefined();
    expect(exo.BlurFilter).toBeDefined();
    expect(exo.ColorMatrixFilter).toBeDefined();
    expect(exo.createRenderStats).toBeDefined();
  });

  test('keeps colour-normalization internals out of the root and renderer SDK barrels', () => {
    for (const surface of [exo as Record<string, unknown>, sdk as Record<string, unknown>]) {
      expect(surface.WebGl2TextureNormalizer).toBeUndefined();
      expect(surface.WebGpuTextureNormalizer).toBeUndefined();
      expect(surface.WebGl2OutputPass).toBeUndefined();
      expect(surface.WebGpuOutputPass).toBeUndefined();
      expect(surface.OutputTransform).toBeUndefined();
      expect(surface.resolveOutputTransformOptions).toBeUndefined();
    }
  });
});
