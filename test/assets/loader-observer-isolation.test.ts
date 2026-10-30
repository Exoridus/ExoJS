import { Asset } from '#assets/Asset';
import { Assets } from '#assets/Assets';
import { Loader, LoadPriority } from '#assets/Loader';

import { testAssetType } from './test-asset-type';

declare module '#assets/AssetDefinitions' {
  interface AssetDefinitions {
    observerIsolation: { resource: string; config: { source: string }; isValue: true };
  }
}

const createLoader = (create = async (): Promise<string> => 'ready') => {
  const loader = new Loader({ concurrency: 1 });
  const type = testAssetType({ id: 'observerIsolation', acquires: false, create });

  loader._installAssetTypes([type]);

  return { loader, type };
};

describe('Loader observer failure isolation', () => {
  test('a throwing onLoaded observer cannot reject a successful load or skip later observers', async () => {
    const { loader } = createLoader();
    const later = vi.fn();

    loader.onLoaded.add(() => {
      throw new Error('loaded observer failed');
    });
    loader.onLoaded.add(later);

    try {
      await expect(loader.load(Asset.type('observerIsolation', 'ready.dat'))).resolves.toBe('ready');
      expect(later).toHaveBeenCalledTimes(1);
      expect(loader.stats().ready).toBe(1);
    } finally {
      loader.destroy();
    }
  });

  test('a throwing onProgress observer cannot strand a background waiter or skip later observers', async () => {
    const { loader, type } = createLoader();
    const later = vi.fn();

    loader.onProgress.add(() => {
      throw new Error('progress observer failed');
    });
    loader.onProgress.add(later);

    const catalog = Assets.from({ file: type.asset('background.dat') });
    const queue = loader.load(catalog, { priority: LoadPriority.Background });
    let settled = false;
    const idle = loader.awaitBackground().then(() => {
      settled = true;
    });

    try {
      await queue;
      await vi.waitFor(() => expect(settled).toBe(true));
      await idle;

      expect(later).toHaveBeenCalledExactlyOnceWith(1, 1);
      expect(loader.stats().ready).toBe(1);
    } finally {
      loader.destroy();
    }
  });

  test('a throwing onError observer preserves the load failure and does not skip later observers', async () => {
    const failure = new Error('factory failed');
    const { loader } = createLoader(async () => {
      throw failure;
    });
    const later = vi.fn();

    loader.onError.add(() => {
      throw new Error('error observer failed');
    });
    loader.onError.add(later);

    try {
      const load = loader.load(Asset.type('observerIsolation', 'failed.dat'));

      await expect(load).rejects.toThrow('factory failed');
      await expect(load).rejects.toMatchObject({ cause: failure });
      expect(later).toHaveBeenCalledTimes(1);
    } finally {
      loader.destroy();
    }
  });
});
