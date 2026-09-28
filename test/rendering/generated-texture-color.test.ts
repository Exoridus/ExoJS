/**
 * Classification contract for generated Texture/DataTexture allocation sites
 * (R40): a texture the engine builds itself - a solid-color fill, the
 * missing-asset checker, an SDF glyph page - must resolve to the same domain
 * a hand-authored asset of the same kind would. A color producer (drawn on a
 * canvas) gets the browser's sRGB interpretation; a data producer (a
 * `DataTexture`) is never color-managed, regardless of how many channels it
 * carries.
 *
 * `colorSpace` for a decoded-canvas source only reflects `'srgb'` once the
 * color pipeline is active (see `Texture._resolveMetadata`); while the gate
 * is closed it resolves to the legacy `'linear-srgb'` approximation (no
 * decode), which is the byte-identical behavior these generators had before
 * the pipeline existed. Both states are asserted so this file catches a
 * classification regression under either gate position.
 */
import { TextureFormat } from '#rendering/types';

describe('generated color producers resolve as color, under either gate position', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('#rendering/colorPipelineActivation');
  });

  test('Texture.fromColor / black / white / missing default to the legacy no-decode domain while the pipeline is closed', async () => {
    vi.resetModules();

    const { Texture } = await import('#rendering/texture/Texture');

    expect(Texture.fromColor('#ff0000', 2).colorSpace).toBe('linear-srgb');
    expect(Texture.black.colorSpace).toBe('linear-srgb');
    expect(Texture.white.colorSpace).toBe('linear-srgb');
    expect(Texture.missing.colorSpace).toBe('linear-srgb');
  });

  test('Texture.fromColor / black / white / missing resolve sRGB color once the pipeline is active', async () => {
    vi.resetModules();
    vi.doMock('#rendering/colorPipelineActivation', () => ({ COLOR_PIPELINE_ENABLED: true }));

    const { Texture } = await import('#rendering/texture/Texture');

    expect(Texture.fromColor('#ff0000', 2).colorSpace).toBe('srgb');
    expect(Texture.black.colorSpace).toBe('srgb');
    expect(Texture.white.colorSpace).toBe('srgb');
    expect(Texture.missing.colorSpace).toBe('srgb');
  });

  test('a loaded color asset (any decoded canvas source) matches Texture.fromColor at the same gate position', async () => {
    vi.resetModules();
    vi.doMock('#rendering/colorPipelineActivation', () => ({ COLOR_PIPELINE_ENABLED: true }));

    const { Texture } = await import('#rendering/texture/Texture');
    const canvas = document.createElement('canvas');

    canvas.width = 1;
    canvas.height = 1;

    const loaded = new Texture(canvas);
    const generated = Texture.fromColor('#123456');

    expect(loaded.colorSpace).toBe(generated.colorSpace);
    expect(loaded.resolvedMetadata.alphaMode).toBe(generated.resolvedMetadata.alphaMode);
  });
});

describe('generated data producers stay numeric regardless of the gate', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('#rendering/colorPipelineActivation');
  });

  test('a DataTexture never resolves color, gate closed', async () => {
    vi.resetModules();

    const { DataTexture } = await import('#rendering/texture/DataTexture');
    const mask = new DataTexture({ width: 2, height: 2, format: TextureFormat.R8 });

    expect(mask.colorSpace).toBe('none');
  });

  test('a DataTexture never resolves color, gate open', async () => {
    vi.resetModules();
    vi.doMock('#rendering/colorPipelineActivation', () => ({ COLOR_PIPELINE_ENABLED: true }));

    const { DataTexture } = await import('#rendering/texture/DataTexture');
    const mask = new DataTexture({ width: 2, height: 2, format: TextureFormat.Rgba8 });

    // A four-channel DataTexture (a packed transform row, an SDF+metadata
    // buffer, ...) is still numeric data - channel count alone never implies
    // color, which is exactly what R40 audits generated allocation sites for.
    expect(mask.colorSpace).toBe('none');
  });

  test('the SDF glyph atlas page is a color-space-free DataTexture, the color page is browser sRGB color', async () => {
    vi.resetModules();
    vi.doMock('#rendering/colorPipelineActivation', () => ({ COLOR_PIPELINE_ENABLED: true }));

    const { AtlasPage } = await import('#rendering/text/GlyphAtlas');
    const sdfPage = new AtlasPage(0, 16, 16, 'sdf');
    const colorPage = new AtlasPage(1, 16, 16, 'color');

    expect(sdfPage.texture.colorSpace).toBe('none');
    expect(colorPage.texture.colorSpace).toBe('srgb');
  });
});
