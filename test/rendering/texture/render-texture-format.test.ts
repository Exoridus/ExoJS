import { RenderTexture } from '#rendering/texture/RenderTexture';
import { ScaleModes, TextureFormat } from '#rendering/types';

describe('RenderTexture color format', () => {
  test('defaults to rgba8 (unchanged 8-bit behaviour)', () => {
    expect(new RenderTexture(8, 8).format).toBe(TextureFormat.Rgba8);
    expect(new RenderTexture(8, 8, {}).format).toBe(TextureFormat.Rgba8);
    expect(new RenderTexture(8, 8, { format: TextureFormat.Rgba8 }).format).toBe(TextureFormat.Rgba8);
  });

  test('carries the requested float format', () => {
    expect(new RenderTexture(8, 8, { format: TextureFormat.Rgba16F }).format).toBe(TextureFormat.Rgba16F);
    expect(new RenderTexture(8, 8, { format: TextureFormat.Rgba32F }).format).toBe(TextureFormat.Rgba32F);
  });

  test('rgba8 keeps the default linear scale mode', () => {
    expect(new RenderTexture(8, 8).scaleMode).toBe(ScaleModes.Linear);
    expect(new RenderTexture(8, 8, { format: TextureFormat.Rgba8 }).scaleMode).toBe(ScaleModes.Linear);
  });

  test('float formats default to nearest sampling (linear needs OES_texture_float_linear)', () => {
    expect(new RenderTexture(8, 8, { format: TextureFormat.Rgba16F }).scaleMode).toBe(ScaleModes.Nearest);
    expect(new RenderTexture(8, 8, { format: TextureFormat.Rgba32F }).scaleMode).toBe(ScaleModes.Nearest);
  });

  test('an explicit scaleMode overrides the float nearest default', () => {
    expect(new RenderTexture(8, 8, { format: TextureFormat.Rgba32F, scaleMode: ScaleModes.Linear }).scaleMode).toBe(ScaleModes.Linear);
  });

  test('other sampler options still apply on a float target', () => {
    const rt = new RenderTexture(8, 8, { format: TextureFormat.Rgba16F, generateMipMap: true, flipY: false });
    expect(rt.format).toBe(TextureFormat.Rgba16F);
    expect(rt.generateMipMap).toBe(true);
    expect(rt.flipY).toBe(false);
  });
});
