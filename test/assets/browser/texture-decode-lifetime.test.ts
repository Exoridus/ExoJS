/**
 * The decoded `ImageBitmap` behind a loaded texture is freed when the texture
 * is released, not left to the garbage collector. Only a real browser can show
 * it: a closed bitmap reports a 0x0 size, which no stand-in decoder models.
 */

import { Asset } from '#assets/Asset';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';

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
});
