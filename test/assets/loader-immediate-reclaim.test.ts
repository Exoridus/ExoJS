import type { AssetRef } from '#assets/AssetRef';
import { Assets } from '#assets/Assets';
import { Loader } from '#assets/Loader';
import { textureSeamlessAdapter } from '#assets/seamless';
import { Texture } from '#rendering/texture/Texture';

import { testAssetType } from './test-asset-type';

const createLoader = (seamless = false) => {
  const loader = new Loader();
  const onError = vi.fn();
  const options = { marker: 'original' };
  let attempts = 0;
  const seenOptions: unknown[] = [];
  const dependency = testAssetType({ id: 'reclaimDependency', acquires: false, create: async () => 'dependency' });
  const type = testAssetType<string, unknown, typeof options>({
    id: seamless ? 'texture' : 'text',
    extensions: seamless ? ['png'] : ['txt'],
    acquires: false,
    ...(seamless && { leaf: textureSeamlessAdapter }),
    create: async (_source, context) => {
      attempts++;
      seenOptions.push(context.options);

      if (attempts === 1) {
        return new Promise((_resolve, reject) => {
          const rejectAbort = () => reject(context.signal?.reason as Error);

          if (context.signal?.aborted) {
            rejectAbort();
          } else {
            context.signal?.addEventListener('abort', rejectAbort, { once: true });
          }
        });
      }

      await context.dependencies.load(dependency.asset('dependency.dat'));

      if (!seamless) {
        return 'ready';
      }

      const canvas = document.createElement('canvas');
      canvas.width = 8;
      canvas.height = 8;

      return new Texture(canvas);
    },
  });

  loader._installAssetTypes([type, dependency]);
  loader.onError.add(onError);

  return { loader, type, options, onError, seenOptions, attempts: () => attempts };
};

describe('immediate asset reclaim', () => {
  test('a load in the same turn as the last release starts a replacement attempt', async () => {
    const { loader, type, options, attempts, seenOptions, onError } = createLoader();
    const first = loader.createScope();
    const next = loader.createScope();
    const asset = type.asset('asset.dat', options);

    try {
      const initial = first.load(asset);
      const cancelled = initial.catch((error: unknown) => error);
      expect(attempts()).toBe(1);
      first.destroy();
      const replacement = next.load(asset);

      await expect(cancelled).resolves.toMatchObject({ name: 'AbortError' });
      await expect(replacement).resolves.toBe('ready');
      expect(attempts()).toBe(2);
      expect(seenOptions).toEqual([options, options]);
      expect(onError).not.toHaveBeenCalled();
      expect(loader.inspect().find(row => row.locator.endsWith('dependency.dat'))?.claims).toBe(1);
      next.destroy();
      expect(loader.inspect()).toHaveLength(0);
    } finally {
      loader.destroy();
    }
  });

  test.each([false, true])('two new scopes share one replacement load (seamless=%s)', async seamless => {
    const { loader, type, options, attempts } = createLoader(seamless);
    const first = loader.createScope();
    const next = loader.createScope();
    const other = loader.createScope();
    const asset = type.asset('asset.dat', options);

    try {
      const initial = first.load(asset);
      const cancelled = initial.catch((error: unknown) => error);
      first.destroy();
      const a = next.load(asset);
      const b = other.load(asset);
      const [valueA, valueB, error] = await Promise.all([a, b, cancelled]);
      expect(error).toMatchObject({ name: 'AbortError' });
      expect(valueA).toBe(valueB);

      if (valueA instanceof Texture) {
        expect(valueA.width).toBe(8);
      }

      expect(attempts()).toBe(2);
      expect(loader.inspect().find(row => row.locator.endsWith('asset.dat'))?.claims).toBe(2);
      next.destroy();
      expect(loader.inspect().find(row => row.locator.endsWith('dependency.dat'))?.claims).toBe(1);
      other.destroy();
      expect(loader.inspect()).toHaveLength(0);
    } finally {
      loader.destroy();
    }
  });

  test.each([false, true])('shared handles heal across an immediate reclaim (seamless=%s)', async seamless => {
    const { loader, options, attempts, onError } = createLoader(seamless);
    const first = loader.createScope();
    const next = loader.createScope();
    const other = loader.createScope();
    const path = seamless ? 'asset.png' : 'asset.txt';

    try {
      const handle = first.get(path, options) as AssetRef<string> | Texture;
      const cancelled = handle.loaded.catch((error: unknown) => error);
      first.destroy();
      const a = next.get(path, options) as AssetRef<string> | Texture;
      const b = other.get(path, options) as AssetRef<string> | Texture;
      const replacement = a.loaded;

      const [value, error] = await Promise.all([replacement, cancelled]);
      expect(error).toMatchObject({ name: 'AbortError' });

      expect(a).toBe(handle);
      expect(b).toBe(handle);
      expect(value).toBe(seamless ? handle : 'ready');
      expect(handle.loadState).toBe('ready');

      if (handle instanceof Texture) {
        expect(handle.width).toBe(8);
      }

      expect(attempts()).toBe(2);
      expect(onError).not.toHaveBeenCalled();
    } finally {
      loader.destroy();
    }
  });

  test.each([false, true])('releasing a reclaim before cleanup settles its new handle promise (seamless=%s)', async seamless => {
    const { loader, options, attempts } = createLoader(seamless);
    const first = loader.createScope();
    const next = loader.createScope();
    const path = seamless ? 'asset.png' : 'asset.txt';

    try {
      const handle = first.get(path, options) as AssetRef<string> | Texture;
      const initial = handle.loaded.catch((error: unknown) => error);
      first.destroy();
      const reclaimed = next.get(path, options) as AssetRef<string> | Texture;
      const pending = reclaimed.loaded.catch((error: unknown) => error);
      next.destroy();

      await expect(initial).resolves.toMatchObject({ name: 'AbortError' });
      expect(reclaimed.loadState).toBe('failed');
      await expect(pending).resolves.toMatchObject({ name: 'AbortError' });
      expect(attempts()).toBe(1);
    } finally {
      loader.destroy();
    }
  });

  test.each([false, true])('distinct catalog handles join one replacement attempt (seamless=%s)', async seamless => {
    const { loader, type, options, attempts } = createLoader(seamless);
    const first = loader.createScope();
    const next = loader.createScope();
    const other = loader.createScope();
    const asset = type.asset('asset.dat', options);
    const original = Assets.from({ item: asset });
    const sibling = Assets.from({ item: asset });

    try {
      const initial = first.load(original);
      const cancelled = initial.catch((error: unknown) => error);
      first.destroy();
      const a = next.load(original);
      const b = other.load(sibling);

      const [, , error] = await Promise.all([a, b, cancelled]);
      expect(error).toMatchObject({ name: 'AbortError' });
      expect(original.item).not.toBe(sibling.item);
      expect(original.item.loadState).toBe('ready');
      expect(sibling.item.loadState).toBe('ready');
      await expect(original.item.loaded).resolves.toBe(seamless ? original.item : 'ready');
      await expect(sibling.item.loaded).resolves.toBe(seamless ? sibling.item : 'ready');
      expect(attempts()).toBe(2);
    } finally {
      loader.destroy();
    }
  });
});
