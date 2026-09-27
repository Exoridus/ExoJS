import { TextureFactory } from '#assets/factories/TextureFactory';

import { factoryContext } from '../../assets/factory-context';

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, 0xe5,
  0x27, 0xd4, 0xa2, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]).buffer;

describe('browser image decode color contract', () => {
  test('requests an unconverted, straight-alpha ImageBitmap for numeric texture data', async () => {
    const decode = globalThis.createImageBitmap;
    const calls: ImageBitmapOptions[] = [];

    vi.stubGlobal('createImageBitmap', (source: ImageBitmapSource, options?: ImageBitmapOptions) => {
      if (options !== undefined) calls.push(options);

      return decode(source, options);
    });

    try {
      const texture = await new TextureFactory().create(png, factoryContext({ textureOptions: { colorSpace: 'none' } }));

      expect(calls).toEqual([{ colorSpaceConversion: 'none', premultiplyAlpha: 'none' }]);
      expect(texture.colorSpace).toBe('none');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
