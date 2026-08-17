import * as exo from '#index';

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
});
