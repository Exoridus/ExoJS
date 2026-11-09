import { Assets } from '#assets/Assets';
import { Loader } from '#assets/Loader';
import { textureSeamlessAdapter } from '#assets/seamless';
import { logger } from '#core/Logger';
import { Texture } from '#rendering/texture/Texture';

import { testAssetType } from './test-asset-type';

describe('reclaim from a seamless disposer', () => {
  test('a GPU release listener receives the replacement load cycle', async () => {
    const loader = new Loader();
    const first = loader.createScope();
    const next = loader.createScope();
    let attempts = 0;
    const type = testAssetType<string, Texture>({
      id: 'texture',
      extensions: ['png'],
      acquires: false,
      leaf: textureSeamlessAdapter,
      create: async () => {
        const canvas = document.createElement('canvas');

        canvas.width = ++attempts * 8;

        return new Texture(canvas);
      },
    });

    loader._installAssetTypes([type]);

    try {
      const texture = first.get('asset.png');
      const original = texture.loaded;

      await original;
      let replacement: Promise<Texture> | undefined;

      const reclaim = () => {
        texture.removeReleaseListener(reclaim);
        replacement = next.get('asset.png').loaded;
      };

      texture.addReleaseListener(reclaim);
      first.release(texture);
      expect(attempts).toBe(2);
      expect(replacement).not.toBe(original);
      await expect(replacement).resolves.toBe(texture);
      expect(texture.width).toBe(16);
      next.destroy();
      expect(loader.inspect()).toHaveLength(0);
    } finally {
      loader.destroy();
    }
  });

  test('a claim cancelled inside disposal cannot cancel a later owner', async () => {
    const loader = new Loader();
    const first = loader.createScope();
    const cancelledOwner = loader.createScope();
    const next = loader.createScope();
    let finish!: () => void;
    const finished = new Promise<void>(resolve => {
      finish = resolve;
    });
    const disposedWidths: number[] = [];
    let attempts = 0;
    let reclaim: (() => void) | undefined;
    const type = testAssetType<string, Texture>({
      id: 'texture',
      extensions: ['png'],
      acquires: false,
      leaf: textureSeamlessAdapter,
      create: async () => {
        const attempt = ++attempts;

        if (attempt === 2) {
          await finished;
        }

        const canvas = document.createElement('canvas');

        canvas.width = attempt * 8;

        return new Texture(canvas);
      },
      dispose: resource => {
        disposedWidths.push(resource.width);
        const callback = reclaim;

        reclaim = undefined;
        callback?.();
      },
    });

    loader._installAssetTypes([type]);

    try {
      const texture = first.get('asset.png');

      await texture.loaded;
      let cancelled: Promise<unknown> | undefined;
      let replacement: Promise<Texture> | undefined;

      reclaim = () => {
        const temporary = cancelledOwner.get('asset.png');

        cancelled = temporary.loaded.catch((error: unknown) => error);
        cancelledOwner.release(temporary);
        replacement = next.get('asset.png').loaded;
      };

      first.release(texture);
      expect(attempts).toBe(2);
      finish();
      await expect(cancelled).resolves.toMatchObject({ name: 'AbortError' });
      await expect(replacement).resolves.toBe(texture);
      expect(texture.width).toBe(24);
      expect(attempts).toBe(3);
      expect(disposedWidths).toEqual([8, 16]);
      expect(loader.inspect().find(row => row.aliases.includes('asset.png'))?.claims).toBe(1);
      next.destroy();
      expect(disposedWidths).toEqual([8, 16, 24]);
      expect(loader.inspect()).toHaveLength(0);
    } finally {
      reclaim = undefined;
      finish();
      loader.destroy();
    }
  });

  test.each([
    ['get', false],
    ['load', false],
    ['get', true],
    ['load', true],
  ] as const)('%s heals every handle and retains replacement dependencies (disposer throws=%s)', async (method, throws) => {
    const loader = new Loader();
    const first = loader.createScope();
    const keeper = loader.createScope();
    const next = loader.createScope();
    const other = loader.createScope();
    const options = { marker: 'original' };
    const seenOptions: unknown[] = [];
    const disposed: Array<{ resource: Texture; source: Texture['source'] }> = [];
    const disposedDependencies: string[] = [];
    const onError = vi.fn();
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    let attempts = 0;
    let reclaim: (() => void) | undefined;
    let sourceAfterReclaim: Texture['source'] | undefined;
    const dependency = testAssetType<string, { source: string }>({
      id: 'disposalDependency',
      acquires: false,
      create: async (_source, context) => ({ source: context.source }),
      dispose: resource => disposedDependencies.push(resource.source),
    });
    const type = testAssetType<string, Texture, typeof options>({
      id: 'texture',
      extensions: ['png'],
      acquires: false,
      leaf: textureSeamlessAdapter,
      create: async (_source, context) => {
        const attempt = ++attempts;

        seenOptions.push(context.options);
        await Promise.all([
          context.dependencies.load(dependency.asset('shared.dat')),
          context.dependencies.load(dependency.asset(attempt === 1 ? 'old.dat' : 'new.dat')),
        ]);
        const canvas = document.createElement('canvas');

        canvas.width = attempt * 8;
        canvas.height = 4;

        return new Texture(canvas);
      },
      dispose: resource => {
        disposed.push({ resource, source: resource.source });
        const callback = reclaim;

        reclaim = undefined;
        callback?.();
        sourceAfterReclaim = resource.source;

        if (throws) {
          throw new Error('disposal failed');
        }
      },
    });

    loader._installAssetTypes([type, dependency]);
    loader.onError.add(onError);

    try {
      const handle = first.get('asset.png', options);
      const initialLoaded = handle.loaded;
      const sibling = Assets.from({ item: type.asset('asset.png', options) });

      await Promise.all([initialLoaded, keeper.load(sibling)]);
      const oldSource = handle.source;
      const oldDependencyOwner = loader.inspect().find(row => row.aliases.includes('shared.dat'))!.owners[0]!.id;

      expect(sibling.item).not.toBe(handle);
      expect(sibling.item.source).toBe(oldSource);
      first.release(handle);
      expect(disposed).toHaveLength(0);
      expect(handle.width).toBe(8);

      let replacement: PromiseLike<unknown> | undefined;
      let reclaimed: Texture | undefined;

      reclaim = () => {
        if (method === 'get') {
          reclaimed = next.get('./asset.png', options);
          replacement = reclaimed.loaded;
        } else {
          replacement = next.load(type.asset('./asset.png', options));
        }
      };

      expect(() => keeper.release(sibling)).not.toThrow();
      expect(attempts).toBe(2);
      expect(disposed).toEqual([{ resource: handle, source: oldSource }]);
      expect(sourceAfterReclaim).toBe(oldSource);
      expect(disposedDependencies).toEqual(['old.dat']);

      if (method === 'get') {
        expect(reclaimed).toBe(handle);
        expect(replacement).not.toBe(initialLoaded);
      }

      const concurrent = other.load(type.asset('asset.png', options));

      await expect(replacement).resolves.toBe(handle);
      await expect(concurrent).resolves.toBe(handle);
      expect(attempts).toBe(2);
      expect(seenOptions).toEqual([options, options]);
      expect(handle.loadState).toBe('ready');
      expect(handle.width).toBe(16);
      expect(sibling.item.loadState).toBe('ready');
      expect(sibling.item.source).toBe(handle.source);
      expect(handle.source).not.toBe(oldSource);
      expect(loader.inspect().find(row => row.aliases.includes('asset.png'))?.claims).toBe(2);
      const shared = loader.inspect().find(row => row.aliases.includes('shared.dat'))!;

      expect(shared.claims).toBe(1);
      expect(shared.owners[0]!.id).not.toBe(oldDependencyOwner);
      expect(loader.inspect().find(row => row.aliases.includes('new.dat'))?.claims).toBe(1);
      expect(onError).not.toHaveBeenCalled();

      next.destroy();
      expect(handle.width).toBe(16);
      expect(disposed).toHaveLength(1);
      other.destroy();
      expect(handle.source).toBeNull();
      expect(sibling.item.source).toBeNull();
      expect(disposed).toHaveLength(2);
      expect(disposedDependencies.sort()).toEqual(['new.dat', 'old.dat', 'shared.dat']);
      expect(loader.inspect()).toHaveLength(0);
    } finally {
      reclaim = undefined;
      loader.destroy();
      logged.mockRestore();
    }
  });
});
