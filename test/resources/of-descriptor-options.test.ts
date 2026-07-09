import { describe, expect, it } from 'vitest';

import { Texture } from '#rendering/texture/Texture';
import { ScaleModes, WrapModes } from '#rendering/types';
import { AssetImpl } from '#resources/Asset';
import { SvgAsset } from '#resources/tokens';

// G3 + G4 (S3 Phase 4.5): `SvgAsset.of` gains a size options param, and
// `Texture.of`'s `samplerOptions` accepts a partial (matching the constructor).
describe('X.of() options', () => {
  it('SvgAsset.of forwards { width, height } into the descriptor config (G3)', () => {
    const asset = SvgAsset.of('icon.svg', { width: 32, height: 24 });
    expect(asset).toBeInstanceOf(AssetImpl);
    expect(asset._config).toMatchObject({ type: 'svg', source: 'icon.svg', width: 32, height: 24 });
  });

  it('SvgAsset.of still works with no options (G3)', () => {
    expect(SvgAsset.of('icon.svg')._config).toEqual({ type: 'svg', source: 'icon.svg' });
  });

  it('Texture.of accepts a PARTIAL samplerOptions (G4)', () => {
    // Before the fix this required a full SamplerOptions object.
    const asset = Texture.of('ship.png', { samplerOptions: { scaleMode: ScaleModes.Nearest } });
    expect(asset._config).toMatchObject({ type: 'texture', source: 'ship.png', samplerOptions: { scaleMode: ScaleModes.Nearest } });
  });

  it('Texture.of accepts a full samplerOptions too (G4)', () => {
    const asset = Texture.of('ship.png', {
      samplerOptions: { scaleMode: ScaleModes.Linear, wrapMode: WrapModes.ClampToEdge, premultiplyAlpha: true, generateMipMap: true, flipY: false },
    });
    expect(asset._config).toMatchObject({ type: 'texture', source: 'ship.png' });
  });
});
