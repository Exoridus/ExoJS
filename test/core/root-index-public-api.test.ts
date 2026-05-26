import * as exo from '@/index';

describe('root index public API exports', () => {
  test('exports core surfaces documented in README and guides', () => {
    expect(exo.Application).toBeDefined();
    expect(exo.Scene).toBeDefined();
    expect(exo.AnimatedSprite).toBeDefined();
    expect(exo.View).toBeDefined();
    expect(exo.defineAssetManifest).toBeDefined();
    expect(exo.BundleLoadError).toBeDefined();
    expect(exo.RenderTargetPass).toBeDefined();
    expect(exo.BlurFilter).toBeDefined();
    expect(exo.ColorFilter).toBeDefined();
    expect(exo.createRenderStats).toBeDefined();
  });
});
