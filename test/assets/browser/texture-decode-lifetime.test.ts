/**
 * The decoded `ImageBitmap` behind a loaded texture is freed when the texture
 * is released, not left to the garbage collector. Only a real browser can show
 * it: a closed bitmap reports a 0x0 size, which no stand-in decoder models.
 */

import { Asset } from '#assets/Asset';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { TextureFactory } from '#assets/factories/TextureFactory';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';
import type { Texture } from '#rendering/texture/Texture';

const createPngUrl = async (): Promise<string> => {
  const canvas = new OffscreenCanvas(4, 2);

  canvas.getContext('2d')!.fillRect(0, 0, 4, 2);

  return URL.createObjectURL(await canvas.convertToBlob({ type: 'image/png' }));
};

const createLoader = (): Loader => {
  const loader = new Loader();

  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

describe('texture decode lifetime', () => {
  let url: string;
  let loader: Loader;

  beforeEach(async () => {
    url = await createPngUrl();
    loader = createLoader();
  });

  afterEach(() => {
    loader.destroy();
    URL.revokeObjectURL(url);
  });

  test('releasing the last claim closes the decoded bitmap', async () => {
    const scope = loader.createScope({ name: 'level' });
    const texture = await scope.load(Asset.type('texture', url));
    const bitmap = texture.source as ImageBitmap;

    expect(bitmap).toBeInstanceOf(ImageBitmap);
    expect(bitmap.width).toBe(4);

    scope.release(texture);

    expect(texture.source).toBeNull();
    expect(bitmap.width).toBe(0);
  });

  test('a bitmap shared by a deferred handle stays open until every claim is released', async () => {
    const first = loader.createScope({ name: 'first' });
    const second = loader.createScope({ name: 'second' });
    const loaded = await first.load(Asset.type('texture', url));
    const handle = second.get(Asset.type('texture', url));

    await handle.loaded;
    const bitmap = loaded.source as ImageBitmap;

    expect(handle.source).toBe(bitmap);

    first.release(loaded);

    expect(bitmap.width).toBe(4);
    expect(handle.source).toBe(bitmap);

    second.release(handle);

    expect(bitmap.width).toBe(0);
  });

  test('a texture reclaimed after release decodes a fresh bitmap', async () => {
    const scope = loader.createScope({ name: 'level' });
    const texture = await scope.load(Asset.type('texture', url));
    const released = texture.source as ImageBitmap;

    scope.release(texture);

    const reloaded = await scope.load(Asset.type('texture', url));

    expect(reloaded).toBe(texture);
    expect(reloaded.source).not.toBe(released);
    expect((reloaded.source as ImageBitmap).width).toBe(4);
  });

  test('a claim inside bitmap disposal heals the same handle and owns a fresh bitmap', async () => {
    const first = loader.createScope();
    const next = loader.createScope();
    const other = loader.createScope();
    const asset = Asset.type('texture', url);
    const texture = await first.load(asset);
    const oldLoaded = texture.loaded;
    const released = texture.source as ImageBitmap;
    const originalDispose = TextureFactory.prototype.dispose;
    let reclaimed: Texture | undefined;
    let replacement: Promise<Texture> | undefined;
    let reclaim = true;
    const dispose = vi.spyOn(TextureFactory.prototype, 'dispose').mockImplementation(function (this: TextureFactory, resource) {
      if (reclaim) {
        reclaim = false;
        reclaimed = next.get(asset);
        replacement = reclaimed.loaded;
      }

      originalDispose.call(this, resource);
    });

    try {
      first.release(texture);

      expect(reclaimed).toBe(texture);
      expect(replacement).not.toBe(oldLoaded);
      expect(released.width).toBe(0);
      await expect(replacement).resolves.toBe(texture);

      const bitmap = texture.source as ImageBitmap;

      expect(bitmap).not.toBe(released);
      expect(bitmap.width).toBe(4);
      expect(other.get(asset)).toBe(texture);
      next.release(texture);
      expect(bitmap.width).toBe(4);
      other.release(texture);
      expect(bitmap.width).toBe(0);
      expect(texture.source).toBeNull();
    } finally {
      dispose.mockRestore();
    }
  });
});
