/**
 * Classification contract for generated Texture/DataTexture allocation sites:
 * a texture the engine builds itself - a solid-color fill, the missing-asset
 * checker, an SDF glyph page - must resolve to the same domain a
 * hand-authored asset of the same kind would. A color producer (drawn on a
 * canvas) gets the browser's sRGB interpretation; a data producer (a
 * `DataTexture`) is never color-managed, regardless of how many channels it
 * carries.
 */
import { TextureFormat } from '#rendering/types';

describe('generated color producers resolve as color', () => {
  test('Texture.fromColor / black / white / missing are sRGB color, the way a loaded image is', async () => {
    const { Texture } = await import('#rendering/texture/Texture');

    expect(Texture.fromColor('#ff0000', 2).colorSpace).toBe('srgb');
    expect(Texture.black.colorSpace).toBe('srgb');
    expect(Texture.white.colorSpace).toBe('srgb');
    expect(Texture.missing.colorSpace).toBe('srgb');
  });

  test('a loaded color asset (any decoded canvas source) matches Texture.fromColor', async () => {
    const { Texture } = await import('#rendering/texture/Texture');
    const canvas = document.createElement('canvas');

    canvas.width = 1;
    canvas.height = 1;

    const loaded = new Texture(canvas);
    const generated = Texture.fromColor('#123456');

    expect(loaded.colorSpace).toBe(generated.colorSpace);
    expect(loaded.resolvedMetadata.storageFormat).toBe(generated.resolvedMetadata.storageFormat);
    expect(loaded.resolvedMetadata.alphaMode).toBe(generated.resolvedMetadata.alphaMode);
  });
});

describe('generated data producers stay numeric', () => {
  test('a DataTexture never resolves color, whatever it carries', async () => {
    const { DataTexture } = await import('#rendering/texture/DataTexture');
    const mask = new DataTexture({ width: 2, height: 2, format: TextureFormat.Rgba8 });

    // A four-channel DataTexture (a packed transform row, an SDF+metadata
    // buffer, ...) is still numeric data - channel count alone never implies
    // color, which is exactly what this audits generated allocation sites for.
    expect(mask.colorSpace).toBe('none');
  });

  test('the SDF glyph atlas page is a color-space-free DataTexture, the color page is browser sRGB color', async () => {
    const { AtlasPage } = await import('#rendering/text/GlyphAtlas');
    const sdfPage = new AtlasPage(0, 16, 16, 'sdf');
    const colorPage = new AtlasPage(1, 16, 16, 'color');

    expect(sdfPage.texture.colorSpace).toBe('none');
    expect(colorPage.texture.colorSpace).toBe('srgb');
  });
});
