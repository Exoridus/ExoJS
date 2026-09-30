/**
 * The externally encoded native KTX2 corpus through the real factory and upload
 * path, on either backend.
 *
 * The block payloads come from the Khronos `ktx` tool (see
 * `test/fixtures/color-external/manifest.json`), not from this repository, so
 * this is the check that the GPU decodes what an independent encoder produced.
 * A format the device cannot sample is skipped by name: that cell is unqualified
 * on the host, not passed.
 */
import { describe, onTestFinished, test } from 'vitest';

import { TextureFactory } from '#assets/factories/TextureFactory';
import { Color } from '#core/Color';
import { RenderTexture } from '#rendering/texture/RenderTexture';
import { TextureFormat } from '#rendering/types';

import { factoryContext } from '../../assets/factory-context';
import { externalCorpusFormats } from '../../assets/ktx2-external-formats';
import manifest from '../../fixtures/color-external/manifest.json';
import { type ColorProbeHarness, drawInto, expectBytes, type OpenColorProbeHarness, spriteScene } from './color-probe-fixtures';

const fixtureUrls = import.meta.glob<string>('../../fixtures/color-external/*.ktx2', { query: '?url', import: 'default', eager: true });

const loadFixture = async (file: string): Promise<ArrayBuffer> => {
  const url = fixtureUrls[`../../fixtures/color-external/${file}`];

  if (url === undefined) throw new Error(`${file} is not served by the fixture glob.`);

  const response = await fetch(url);

  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`);

  return response.arrayBuffer();
};

export const defineColorKtx2ExternalProbes = (title: string, open: OpenColorProbeHarness): void => {
  const start = async (): Promise<ColorProbeHarness> => {
    const h = await open(16);

    onTestFinished(() => h.destroy());

    return h;
  };

  describe(`${title}: externally encoded KTX2 corpus`, () => {
    test.for(manifest.fixtures.map(entry => [entry.file, entry] as const))('%s decodes to the source colours', async ([file, entry], ctx) => {
      const h = await start();
      const format = externalCorpusFormats[entry.vkFormat]!;

      if (!h.backend.supportedTextureFormats.includes(format)) {
        ctx.skip(`${format} is not sampleable on this device`);

        return;
      }

      const texture = await new TextureFactory().create(await loadFixture(file), factoryContext());
      // An sRGB texture is decoded on sample and encoded again on write; a linear one stays numeric.
      const target = new RenderTexture(16, 16, { format: entry.transfer === 'srgb' ? TextureFormat.Rgba8Srgb : TextureFormat.Rgba8 });

      try {
        await h.checked(async () => {
          drawInto(h.backend, target, spriteScene(texture, 16, 16), Color.transparentBlack);

          for (const { x, y, rgba } of entry.samples) {
            expectBytes(await h.backend.readPixels(target, x, y, 1, 1), rgba, manifest.tolerance);
          }
        });
      } finally {
        target.destroy();
        texture.destroy();
      }
    });
  });
};
