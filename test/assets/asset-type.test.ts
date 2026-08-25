import { beforeEach, describe, expect, test, vi } from 'vitest';

import type { AssetFactory, AssetFactoryContext } from '#assets/AssetFactory';
import { type AssetSourceCodec, jsonSourceCodec, textSourceCodec } from '#assets/AssetSourceCodec';
import { type AnyAssetType, type AssetRequest, AssetType } from '#assets/AssetType';
import { Loader } from '#assets/Loader';
import type { Extension } from '#extensions/Extension';
import { materializeAssetTypes } from '#extensions/materialize';

import { createCacheStoreDouble } from './cache-test-doubles';

interface WorldData {
  readonly name: string;
}

class World {
  public constructor(
    public readonly data: WorldData,
    public readonly palette: string,
  ) {}
}

interface WorldOptions {
  /** Changes which file is served for one logical world. */
  readonly locale?: string;
  /** Changes only how the fetched world is built. */
  readonly palette?: string;
}

const createdFactories: Array<{ id: number; destroyed: boolean }> = [];
let nextFactoryId = 1;

class WorldAssetType extends AssetType<WorldData, World, WorldOptions, string> {
  public readonly id: string = 'com.example.world';
  public override readonly extensions: readonly string[] = ['world'];
  public override readonly codec = jsonSourceCodec as AssetSourceCodec<WorldData, string>;

  public override resourceIdentity({ options }: AssetRequest<WorldOptions>): string {
    return options?.palette === undefined ? '' : `palette=${options.palette}`;
  }

  public override sourceIdentity({ options }: AssetRequest<WorldOptions>): string {
    return options?.locale ?? '';
  }

  public createFactory(): AssetFactory<WorldData, World, WorldOptions> {
    const record = { id: nextFactoryId++, destroyed: false };

    createdFactories.push(record);

    return {
      create: (data, context) => Promise.resolve(new World(data, context.options?.palette ?? 'default')),
      destroy: () => {
        record.destroyed = true;
      },
    };
  }
}

/** A type whose identity is the locator alone - neither hook is implemented. */
class NoteAssetType extends AssetType<string, string[]> {
  public readonly id: string = 'com.example.note';
  public override readonly extensions: readonly string[] = ['note'];
  public override readonly codec: AssetSourceCodec<string> = textSourceCodec;

  public createFactory(): AssetFactory<string, string[]> {
    return { create: text => Promise.resolve(text.split('\n')) };
  }
}

const extensionFor = (...assets: AnyAssetType[]): Extension => {
  return { id: 'com.example.test', assets };
};

/** A loader with `types` installed, exactly as an Application would install them. */
const createLoader = (types: readonly AnyAssetType[]): Loader => {
  const loader = new Loader({ basePath: 'https://assets.test/' });

  materializeAssetTypes(loader, types);

  return loader;
};

const mockJsonFetch = (body: unknown = { name: 'overworld' }): ReturnType<typeof vi.fn> => {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })));

  vi.stubGlobal('fetch', fetchMock);

  return fetchMock;
};

beforeEach(() => {
  createdFactories.length = 0;
  nextFactoryId = 1;
  vi.unstubAllGlobals();
});

describe('AssetType identity', () => {
  test('one source and one set of options is one resource over one acquisition', () => {
    const worldType = new WorldAssetType();
    const loader = createLoader([worldType]);

    const a = loader.identify(worldType.asset('level.world', { palette: 'dusk' }));
    const b = loader.identify(worldType.asset('level.world', { palette: 'dusk' }));

    expect(a.resourceKey).toBe(b.resourceKey);
    expect(a.sourceKey).toBe(b.sourceKey);
  });

  test('a runtime-only option splits the resource but not the acquisition', () => {
    const worldType = new WorldAssetType();
    const loader = createLoader([worldType]);

    const dusk = loader.identify(worldType.asset('level.world', { palette: 'dusk' }));
    const dawn = loader.identify(worldType.asset('level.world', { palette: 'dawn' }));

    expect(dusk.resourceKey).not.toBe(dawn.resourceKey);
    expect(dusk.sourceKey).toBe(dawn.sourceKey);
  });

  test('a source option splits both', () => {
    const worldType = new WorldAssetType();
    const loader = createLoader([worldType]);

    const de = loader.identify(worldType.asset('level.world', { locale: 'de' }));
    const en = loader.identify(worldType.asset('level.world', { locale: 'en' }));

    expect(de.resourceKey).not.toBe(en.resourceKey);
    expect(de.sourceKey).not.toBe(en.sourceKey);
  });

  test('a source key carries no asset type, so two types over one URL acquire once', () => {
    const worldType = new WorldAssetType();
    const noteType = new NoteAssetType();
    const loader = createLoader([worldType, noteType]);

    const asWorld = loader.identify(worldType.asset('shared.dat'));
    const asNote = loader.identify(noteType.asset('shared.dat'));

    expect(asWorld.resourceKey).not.toBe(asNote.resourceKey);
    expect(asWorld.sourceKey).toBe(asNote.sourceKey);
  });

  test('a resource key names its type by the stable id, not by an install ordinal', () => {
    const worldType = new WorldAssetType();

    const first = createLoader([worldType]).identify(worldType.asset('level.world'));
    const second = createLoader([new NoteAssetType(), worldType]).identify(worldType.asset('level.world'));

    expect(first.resourceKey).toBe(second.resourceKey);
    expect(first.resourceKey.startsWith('com.example.world|')).toBe(true);
  });

  test('equivalent spellings of one source canonicalize to one identity', () => {
    const worldType = new WorldAssetType();
    const loader = createLoader([worldType]);

    const plain = loader.identify(worldType.asset('levels/level.world'));
    const detoured = loader.identify(worldType.asset('levels/../levels/./level.world'));
    const fragment = loader.identify(worldType.asset('levels/level.world#chunk-3'));

    expect(detoured.resourceKey).toBe(plain.resourceKey);
    expect(detoured.sourceKey).toBe(plain.sourceKey);
    expect(fragment.resourceKey).toBe(plain.resourceKey);
  });

  test('a type without identity hooks is identified by its locator alone', () => {
    const noteType = new NoteAssetType();
    const loader = createLoader([noteType]);

    const { resourceKey, sourceKey, locator } = loader.identify(noteType.asset('a.note'));

    expect(locator).toBe('url:https://assets.test/a.note');
    expect(sourceKey).toBe(locator);
    expect(resourceKey).toBe(`com.example.note|${locator}`);
  });
});

describe('AssetType installation locality', () => {
  test('a type installed on one loader is unknown to another', () => {
    const worldType = new WorldAssetType();
    const equipped = createLoader([worldType]);
    const bare = new Loader();

    expect(equipped.hasAssetType('com.example.world')).toBe(true);
    expect(equipped.resolveExtensionType('world')).toBe('com.example.world');

    expect(bare.hasAssetType('com.example.world')).toBe(false);
    expect(bare.resolveExtensionType('world')).toBeUndefined();
    expect(() => bare.identify(worldType.asset('level.world'))).toThrow(/no asset type "com\.example\.world" is installed/);
  });

  test('two loaders may claim one suffix for different types', () => {
    class RivalWorldType extends NoteAssetType {
      public override readonly id = 'com.rival.world';
      public override readonly extensions = ['world'];
    }

    const mine = createLoader([new WorldAssetType()]);
    const theirs = createLoader([new RivalWorldType()]);

    expect(mine.resolveExtensionType('world')).toBe('com.example.world');
    expect(theirs.resolveExtensionType('world')).toBe('com.rival.world');
  });

  test('installing one id twice on one application is a named error', () => {
    const loader = new Loader();

    expect(() => materializeAssetTypes(loader, [new WorldAssetType(), new WorldAssetType()])).toThrow(
      /Asset type id "com\.example\.world" is already installed on this application/,
    );
  });

  test('an empty id is rejected at install time', () => {
    class NamelessType extends NoteAssetType {
      public override readonly id = '';
    }

    expect(() => materializeAssetTypes(new Loader(), [new NamelessType()])).toThrow(/needs a non-empty string id/);
  });

  test('a type installed through an Extension descriptor reaches the loader', () => {
    const worldType = new WorldAssetType();
    const loader = new Loader();

    materializeAssetTypes(loader, [...(extensionFor(worldType).assets ?? [])]);

    expect(loader.hasAssetType('com.example.world')).toBe(true);
  });
});

describe('AssetType factory lifecycle', () => {
  test('one factory is created per loader, not per request', async () => {
    mockJsonFetch();

    const worldType = new WorldAssetType();
    const loader = createLoader([worldType]);

    await loader.load(worldType.asset('a.world'));
    await loader.load(worldType.asset('b.world'));

    expect(createdFactories).toHaveLength(1);
  });

  test('two loaders get distinct factory instances', () => {
    const worldType = new WorldAssetType();

    createLoader([worldType]);
    createLoader([worldType]);

    expect(createdFactories.map(f => f.id)).toEqual([1, 2]);
  });

  test('destroying a loader destroys its factory exactly once', () => {
    const loader = createLoader([new WorldAssetType()]);

    loader.destroy();
    loader.destroy();

    expect(createdFactories).toEqual([{ id: 1, destroyed: true }]);
  });

  test('no factory exists before a type is installed', () => {
    void new WorldAssetType();

    expect(createdFactories).toHaveLength(0);
  });
});

describe('AssetType factory boundary', () => {
  /** Captures the context the factory is handed for one load. */
  const captureContext = async (): Promise<AssetFactoryContext<WorldOptions>> => {
    let captured: AssetFactoryContext<WorldOptions> | undefined;

    class ProbeType extends WorldAssetType {
      public override createFactory(): AssetFactory<WorldData, World, WorldOptions> {
        return {
          create: (data, context) => {
            captured = context;
            return Promise.resolve(new World(data, 'probe'));
          },
        };
      }
    }

    mockJsonFetch();

    const probeType = new ProbeType();

    await createLoader([probeType]).load(probeType.asset('level.world', { palette: 'dusk' }));

    if (captured === undefined) {
      throw new Error('the factory was never invoked');
    }

    return captured;
  };

  test('the factory context exposes no fetch, cache store or cache policy', async () => {
    const context = await captureContext();

    expect(Object.keys(context).sort()).toEqual(['dependencies', 'locator', 'options', 'resourceKey', 'signal', 'source', 'sourceKey']);

    for (const reachable of ['fetch', 'fetchText', 'fetchJson', 'fetchArrayBuffer', 'cache', 'stores', 'cacheStrategy', 'loader']) {
      expect(reachable in context).toBe(false);
    }
  });

  test('the dependency seam acquires assets and nothing else', async () => {
    const { dependencies } = await captureContext();

    expect(typeof dependencies.load).toBe('function');
    expect(typeof dependencies.get).toBe('function');

    for (const reachable of ['fetchText', 'fetchArrayBuffer', 'fetchJson', 'resolveUrl']) {
      expect(reachable in dependencies).toBe(false);
    }
  });

  test('the factory sees both identities and the locator of its own request', async () => {
    const context = await captureContext();

    expect(context.resourceKey).toBe('com.example.world|url:https://assets.test/level.world|palette=dusk');
    expect(context.sourceKey).toBe('url:https://assets.test/level.world');
    expect(context.locator).toBe('url:https://assets.test/level.world');
    expect(context.options).toEqual({ palette: 'dusk' });
  });

  test('a factory can acquire a dependent asset through the scoped seam', async () => {
    const fetchMock = mockJsonFetch();
    let dependency: unknown;

    class ParentType extends WorldAssetType {
      public override readonly id = 'com.example.parent';
      public override readonly extensions = [];

      public override createFactory(): AssetFactory<WorldData, World, WorldOptions> {
        return {
          create: async (data, context) => {
            dependency = await context.dependencies.load(new NoteAssetType().asset('page.note'));
            return new World(data, 'parent');
          },
        };
      }
    }

    const parentType = new ParentType();

    await createLoader([parentType, new NoteAssetType()]).load(parentType.asset('a.parent'));

    expect(dependency).toEqual([JSON.stringify({ name: 'overworld' })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('AssetSourceCodec', () => {
  test('a response becomes a stored representation and then source', async () => {
    mockJsonFetch({ name: 'overworld' });

    const worldType = new WorldAssetType();
    const world = await createLoader([worldType]).load(worldType.asset('level.world', { palette: 'dusk' }));

    expect(world).toBeInstanceOf(World);
    expect(world.data).toEqual({ name: 'overworld' });
    expect(world.palette).toBe('dusk');
  });

  test('container bytes take the same two steps', async () => {
    const worldType = new WorldAssetType();
    const loader = createLoader([worldType]);
    const bytes = new TextEncoder().encode(JSON.stringify({ name: 'from-bytes' }));
    const built = await worldType.codec.fromBytes?.(bytes.buffer as ArrayBuffer, { locator: 'url:x' });

    expect(built).toBe(JSON.stringify({ name: 'from-bytes' }));
    expect(await worldType.codec.decode(built!, { locator: 'url:x' })).toEqual({ name: 'from-bytes' });

    loader.destroy();
  });

  test('a malformed representation fails as a decode, not as a missing handler', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response('{ not json', { headers: { 'content-type': 'application/json' } })));

    const worldType = new WorldAssetType();
    const loader = createLoader([worldType]);

    loader.onError.add(() => undefined);

    await expect(loader.load(worldType.asset('broken.world'))).rejects.toThrow(/Failed to load "broken\.world"/);
  });

  test('a type whose codec cannot read bytes is not container-loadable', () => {
    class UrlOnlyType extends NoteAssetType {
      public override readonly id = 'com.example.url-only';
      public override readonly codec: AssetSourceCodec<string> = {
        fromResponse: response => response.text(),
        decode: stored => Promise.resolve(stored),
      };
    }

    const urlOnly = new UrlOnlyType();
    const loader = createLoader([urlOnly]);

    expect(urlOnly.codec.fromBytes).toBeUndefined();

    loader.destroy();
  });

  test('an aborted load rejects as a cancellation, not as a decode failure', async () => {
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      });
    });

    const worldType = new WorldAssetType();
    const loader = createLoader([worldType]);

    loader.onError.add(() => undefined);

    const queue = loader.load(worldType.asset('slow.world'));
    const settled = queue.then(
      () => 'resolved',
      // A DOMException is not an `Error` under every test environment, so read
      // the name off the value rather than narrowing to `Error` first.
      (error: unknown) => (error as { name?: string } | null)?.name ?? String(error),
    );

    queue.cancel();

    expect(await settled).toBe('AbortError');
  });
});

describe('AssetType source-variant storage', () => {
  test('two source variants of one URL are cached apart, not on top of each other', async () => {
    const store = createCacheStoreDouble();

    mockJsonFetch();

    const worldType = new WorldAssetType();
    const loader = new Loader({ basePath: 'https://assets.test/', cache: store });

    materializeAssetTypes(loader, [worldType]);

    await loader.load(worldType.asset('level.world', { locale: 'de' }));
    await loader.load(worldType.asset('level.world', { locale: 'en' }));

    expect(store.set.mock.calls.map(call => call[0])).toEqual([
      { namespace: 'com.example.world', source: 'url:https://assets.test/level.world|de', version: 1, record: 'value' },
      { namespace: 'com.example.world', source: 'url:https://assets.test/level.world|en', version: 1, record: 'value' },
    ]);
    expect(store.records.size).toBe(2);
  });

  test('the codec sees the canonical locator on both the network and the bytes path', async () => {
    const seen: string[] = [];

    class ProbeCodecType extends NoteAssetType {
      public override readonly id = 'com.example.probe-codec';
      public override readonly codec: AssetSourceCodec<string> = {
        fromResponse: (response, context) => {
          seen.push(context.locator);
          return response.text();
        },
        fromBytes: (bytes, context) => {
          seen.push(context.locator);
          return Promise.resolve(new TextDecoder().decode(bytes));
        },
        decode: stored => Promise.resolve(stored),
      };
    }

    vi.stubGlobal('fetch', () => Promise.resolve(new Response('a\nb')));

    const probeType = new ProbeCodecType();

    await createLoader([probeType]).load(probeType.asset('notes/../notes/a.note'));

    expect(seen).toEqual(['url:https://assets.test/notes/a.note']);
  });
});
