/**
 * Browser-decoded PNGs through the real factory, on either backend.
 *
 * The PNGs are encoded at run time from known bytes, so the decoded color is
 * exact input to the oracle rather than something read back from a fixture.
 */
import { describe, expect, onTestFinished, test } from 'vitest';

import { TextureFactory } from '#assets/factories/TextureFactory';
import { Color } from '#core/Color';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';

import { factoryContext } from '../../assets/factory-context';
import { type ColorProbeHarness, drawInto, expectBytes, type OpenColorProbeHarness, spriteScene } from './color-probe-fixtures';

export const encodePng = async (rgba: readonly [number, number, number, number]): Promise<ArrayBuffer> => {
  const canvas = document.createElement('canvas');

  canvas.width = 1;
  canvas.height = 1;

  const context = canvas.getContext('2d')!;

  context.putImageData(new ImageData(new Uint8ClampedArray(rgba), 1, 1), 0, 0);

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));

  return blob!.arrayBuffer();
};

export const defineColorImageDecodeProbes = (title: string, open: OpenColorProbeHarness): void => {
  const start = async (): Promise<ColorProbeHarness> => {
    const h = await open(4);

    onTestFinished(() => h.destroy());

    return h;
  };

  describe(`${title}: browser image decode`, () => {
    test('a decoded opaque PNG keeps its authored byte through sample decode and write encode', async () => {
      const h = await start();
      const texture = await new TextureFactory().create(await encodePng([128, 128, 128, 255]), factoryContext());
      const encoded = new RenderTexture(2, 2, { format: TextureFormat.Rgba8Srgb });

      try {
        expect(texture.colorSpace).toBe('srgb');

        await h.checked(async () => {
          drawInto(h.backend, encoded, spriteScene(texture, 2, 2), Color.black);
          expectBytes(await h.backend.readPixels(encoded, 0, 0, 1, 1), [128, 128, 128, 255]);
        });
      } finally {
        encoded.destroy();
        texture.destroy();
      }
    });

    test('a PNG declared as numeric data reaches the shader with its stored bytes', async () => {
      const h = await start();
      const texture = await new TextureFactory().create(
        await encodePng([128, 128, 255, 255]),
        factoryContext({ textureOptions: { colorSpace: 'none' } }),
      );
      const raw = new RenderTexture(2, 2, { format: TextureFormat.Rgba8 });

      try {
        await h.checked(async () => {
          drawInto(h.backend, raw, spriteScene(texture, 2, 2), Color.black);
          expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [128, 128, 255, 255], 1);
        });
      } finally {
        raw.destroy();
        texture.destroy();
      }
    });

    test('a translucent PNG is associated with alpha after decode, not before', async () => {
      const h = await start();
      const texture = await new TextureFactory().create(await encodePng([255, 0, 0, 128]), factoryContext());
      const raw = new RenderTexture(2, 2, { format: TextureFormat.Rgba8 });

      try {
        await h.checked(async () => {
          drawInto(h.backend, raw, spriteScene(texture, 2, 2), Color.black);
          // Linear red 1 at coverage 128/255 over black; associating in sRGB space first would give about 55.
          expectBytes(await h.backend.readPixels(raw, 0, 0, 1, 1), [128, 0, 0, 255]);
        });
      } finally {
        raw.destroy();
        texture.destroy();
      }
    });
  });
};
