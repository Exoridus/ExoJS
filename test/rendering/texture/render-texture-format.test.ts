import { RenderTexture } from '#rendering/texture/RenderTexture';
import { ScaleModes } from '#rendering/types';

describe('RenderTexture color format', () => {
  test('defaults to rgba8 (unchanged 8-bit behaviour)', () => {
    expect(new RenderTexture(8, 8).format).toBe('rgba8');
    expect(new RenderTexture(8, 8, {}).format).toBe('rgba8');
    expect(new RenderTexture(8, 8, { format: 'rgba8' }).format).toBe('rgba8');
  });

  test('carries the requested float format', () => {
    expect(new RenderTexture(8, 8, { format: 'rgba16f' }).format).toBe('rgba16f');
    expect(new RenderTexture(8, 8, { format: 'rgba32f' }).format).toBe('rgba32f');
  });

  test('rgba8 keeps the default linear scale mode', () => {
    expect(new RenderTexture(8, 8).scaleMode).toBe(ScaleModes.Linear);
    expect(new RenderTexture(8, 8, { format: 'rgba8' }).scaleMode).toBe(ScaleModes.Linear);
  });

  test('float formats default to nearest sampling (linear needs OES_texture_float_linear)', () => {
    expect(new RenderTexture(8, 8, { format: 'rgba16f' }).scaleMode).toBe(ScaleModes.Nearest);
    expect(new RenderTexture(8, 8, { format: 'rgba32f' }).scaleMode).toBe(ScaleModes.Nearest);
  });

  test('an explicit scaleMode overrides the float nearest default', () => {
    expect(new RenderTexture(8, 8, { format: 'rgba32f', scaleMode: ScaleModes.Linear }).scaleMode).toBe(ScaleModes.Linear);
  });

  test('other sampler options still apply on a float target', () => {
    const rt = new RenderTexture(8, 8, { format: 'rgba16f', generateMipMap: true, flipY: false });
    expect(rt.format).toBe('rgba16f');
    expect(rt.generateMipMap).toBe(true);
    expect(rt.flipY).toBe(false);
  });
});
