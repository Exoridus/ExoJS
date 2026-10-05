import { TextureFactory } from '#assets/factories/TextureFactory';

import { factoryContext } from '../../assets/factory-context';
import { defineColorImageDecodeProbes, encodePng } from './_colorImageDecodeProbes';
import { openWebGl2ColorHarness } from './_colorProbeHarness';

describe('browser image decode color contract', () => {
  test('requests an unconverted, straight-alpha ImageBitmap for numeric texture data', async () => {
    const decode = globalThis.createImageBitmap;
    const calls: ImageBitmapOptions[] = [];

    vi.stubGlobal('createImageBitmap', (source: ImageBitmapSource, options?: ImageBitmapOptions) => {
      if (options !== undefined) calls.push(options);

      return decode(source, options);
    });

    try {
      const texture = await new TextureFactory().create(await encodePng([128, 128, 128, 255]), factoryContext({ textureOptions: { colorSpace: 'none' } }));

      expect(calls).toEqual([{ colorSpaceConversion: 'none', premultiplyAlpha: 'none' }]);
      expect(texture.colorSpace).toBe('none');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

defineColorImageDecodeProbes('WebGL2', openWebGl2ColorHarness);
