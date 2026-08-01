import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Asset } from '#resources/Asset';
import { AssetRef } from '#resources/AssetRef';
import type { AssetInspection } from '#resources/AssetResidency';
import { Assets } from '#resources/Assets';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { defineAsset } from '#resources/defineAsset';
import { Loader } from '#resources/Loader';
import { TextAsset } from '#resources/tokens';

// A test-only, non-leaf asset kind — no seamless adapter, `isValue: false` —
// the exact shape `Loader.release()`'s `@remarks` calls out (a resource loaded
// with `load(Asset.type('bmFont', …))`): it never goes through `createLeaf`,
// so it carries no `_assetMeta` stamp and is never adopted/registered in the
// handle→key map either.
declare module '#resources/AssetDefinitions' {
  interface AssetDefinitions {
    dxNonLeafAsset: { resource: DxNonLeafResource; config: { source: string } };
  }
}

class DxNonLeafResource {
  public constructor(public readonly raw: string) {}
}

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

function mockFetchImage(): void {
  global.fetch = vi.fn(
    async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => new ArrayBuffer(8) }) as unknown as Response,
  );
}

function mockFetch404(): void {
  global.fetch = vi.fn(async (): Promise<Response> => ({ ok: false, status: 404, statusText: 'Not Found' }) as Response);
}

function mockFetchText(text = 'raw'): void {
  global.fetch = vi.fn(async (): Promise<Response> => ({ ok: true, status: 200, statusText: 'OK', text: async () => text }) as unknown as Response);
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllGlobals();
});

describe('Loader.release() fail-loud contract', () => {
  test('throws for an unsupported raw object, naming the supported forms', () => {
    const loader = new Loader();

    expect(() => loader.release({ arbitrary: true } as never)).toThrow(/no claim identity/);
  });

  test('throws for a resolved non-leaf resource, and the corrective guidance it points to actually works', async () => {
    const loader = new Loader({ basePath: '/' });

    materializeAssetBindings(loader, [
      defineAsset<DxNonLeafResource>({
        ctor: DxNonLeafResource,
        type: 'dxNonLeafAsset',
        isValue: false,
        create: () => ({ load: async request => new DxNonLeafResource(request.source) }),
      }),
    ]);

    const asset = new Asset({ type: 'dxNonLeafAsset', source: 'thing.dat' });
    const resource = await loader.load(asset);

    expect(loader.inspect()).toHaveLength(1);
    expect(() => loader.release(resource as unknown as object)).toThrow(/no claim identity/);
    // The claim survives the throw — nothing was silently discarded.
    expect(loader.inspect()).toHaveLength(1);

    // The `@remarks`-documented workaround (release the descriptor instead) works.
    expect(() => loader.release(asset)).not.toThrow();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('stays an idempotent no-op for a never-adopted VALUE catalog leaf', () => {
    const loader = new Loader();
    const catalog = Assets.from({ note: 'note.txt' });

    expect(() => loader.release(catalog.note)).not.toThrow();
    expect(() => loader.release(catalog.note)).not.toThrow();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('stays an idempotent no-op for a never-adopted RESOURCE catalog leaf', () => {
    const loader = createCoreLoader();
    const catalog = Assets.from({ hero: 'hero.png' });

    expect(() => loader.release(catalog.hero)).not.toThrow();
    expect(() => loader.release(catalog.hero)).not.toThrow();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('supported release identities are unchanged: descriptor, catalog, (type, source), and an adopted handle all still clear their claim', async () => {
    const loader = createCoreLoader();
    mockFetchImage();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1, height: 1 })));

    const hasRow = (source: string): boolean => loader.inspect().some(row => row.source === source);

    // 1. Asset descriptor.
    const asset = new Asset({ type: 'texture', source: 'a.png' });
    await loader.load(asset);
    expect(hasRow('a.png')).toBe(true);
    loader.release(asset);
    expect(hasRow('a.png')).toBe(false);

    // 2. Assets catalog.
    const catalog = new Assets({ b: { type: 'texture', source: 'b.png' } });
    await loader.load(catalog);
    expect(hasRow('b.png')).toBe(true);
    loader.release(catalog);
    expect(hasRow('b.png')).toBe(false);

    // 3. (type, source) pair.
    await loader.load(Asset.type('texture', 'c.png'));
    expect(hasRow('c.png')).toBe(true);
    loader.release(Texture, 'c.png');
    expect(hasRow('c.png')).toBe(false);

    // 4. An adopted seamless handle.
    const handle = loader.get('d.png');
    await handle.loaded;
    expect(hasRow('d.png')).toBe(true);
    loader.release(handle);
    expect(hasRow('d.png')).toBe(false);
  });
});

describe('AssetRef.parse() synchronous contract', () => {
  test('a thenable returned by parse fails the ref with the explicit contract error', async () => {
    const ref = new AssetRef<string>();
    ref._setParse(() => Promise.resolve('async') as unknown as string);
    const loaded = ref.loaded;

    ref._fill('raw');

    await expect(loaded).rejects.toThrow(/parse\(\) must be synchronous/);
    expect(ref.state).toBe('failed');
    expect(ref.error?.message).toMatch(/asset handler load phase/);
  });

  test('a synchronous parse is unaffected by the new check', () => {
    const ref = new AssetRef<number>();
    ref._setParse(raw => Number(raw as string));

    ref._fill('42');

    expect(ref.state).toBe('ready');
    expect(ref.value).toBe(42);
  });
});

describe('Loader.inspect() snapshot contract', () => {
  test('rows are plain, frozen, and expose no internal Set/symbol/handle', async () => {
    const pending = deferred<string>();
    const loader = new Loader();
    loader.bindAsset<string>({ ctor: TextAsset, storageName: 'text' }, { load: async () => pending.promise });

    const ref = loader.get('note.txt') as AssetRef<string>;
    const snapshot = loader.inspect();

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot[0])).toBe(true);
    expect(() => (snapshot as AssetInspection[]).push({} as AssetInspection)).toThrow();
    expect(() => {
      (snapshot[0] as unknown as { state: string }).state = 'ready';
    }).toThrow();

    const row = snapshot[0]!;

    expect(Object.keys(row).sort()).toEqual(['background', 'claims', 'inFlight', 'key', 'source', 'state', 'type']);

    for (const [field, value] of Object.entries(row)) {
      if (field === 'type') {
        continue; // the asset constructor token is intentionally exposed
      }

      expect(value).not.toBeInstanceOf(Set);
      expect(value).not.toBeInstanceOf(AssetRef);
      expect(typeof value).not.toBe('symbol');
      expect(typeof value).not.toBe('object');
    }

    pending.resolve('done');
    await ref.loaded;
  });

  test('rows are sorted by key regardless of claim order', () => {
    mockFetchText();
    const loader = new Loader();
    loader.bindAsset<string>({ ctor: TextAsset, storageName: 'text' }, { load: async request => `text:${request.source}` });

    loader.get('zzz.txt');
    loader.get('aaa.txt');
    loader.get('mmm.txt');

    expect(loader.inspect().map(row => row.source)).toEqual(['aaa.txt', 'mmm.txt', 'zzz.txt']);
  });

  test('tracks the loading → ready transition; an earlier snapshot never mutates in place', async () => {
    const pending = deferred<string>();
    const loader = new Loader();
    loader.bindAsset<string>({ ctor: TextAsset, storageName: 'text' }, { load: async () => pending.promise });

    const ref = loader.get('note.txt') as AssetRef<string>;
    const loading = loader.inspect();

    expect(loading).toHaveLength(1);
    expect(loading[0]).toMatchObject({ source: 'note.txt', state: 'loading', claims: 1, inFlight: true, background: false });

    pending.resolve('ready');
    await ref.loaded;
    await Promise.resolve(); // let the in-flight bookkeeping's own .finally() cleanup run too

    const ready = loader.inspect();
    expect(ready[0]).toMatchObject({ source: 'note.txt', state: 'ready', claims: 1, inFlight: false, background: false });
    // The array returned earlier is a detached snapshot, not a live view.
    expect(loading[0]?.state).toBe('loading');
  });

  test('tracks the queued state for a background-loading catalog leaf', () => {
    const loader = createCoreLoader();
    loader.setConcurrency(0); // nothing drains

    const catalog = new Assets({ late: { type: 'texture', source: 'late.png' } });
    loader.load(catalog, { background: true });

    const row = loader.inspect().find(r => r.source === 'late.png');
    expect(row).toMatchObject({ state: 'queued', background: true, inFlight: false, claims: 1 });
  });

  test('tracks the failed state after a fetch rejects', async () => {
    const loader = createCoreLoader();
    mockFetch404();

    const handle = loader.get('gone.png');
    await expect(handle.loaded).rejects.toThrow();

    const row = loader.inspect().find(r => r.source === 'gone.png');
    expect(row).toMatchObject({ state: 'failed', inFlight: false, background: false, claims: 1 });
  });

  test('claims counts distinct claim scopes, not consumer handles or get() calls', async () => {
    const loader = createCoreLoader();
    mockFetchImage();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 1, height: 1 })));
    const sceneScope = Symbol('scene');

    const handle = loader.get('hero.png'); // root scope
    loader.get('hero.png'); // same source → same deduped handle, same scope again (no-op)
    loader._getClaimed(sceneScope, 'hero.png'); // a second, distinct scope
    await handle.loaded;

    const row = loader.inspect().find(r => r.source === 'hero.png');
    expect(row?.claims).toBe(2);
  });

  test('never reports background:true for a row that has already settled', () => {
    // A producer that stores a payload for a (type, source) key directly —
    // `loadContainer()`'s injection path calls `_storeResource` without going
    // through the background queue's own dequeue/boost bookkeeping — must not
    // leave a settled row also claiming to still be queued.
    const loader = new Loader();
    const residency = (
      loader as unknown as {
        _residency: {
          _claims: Map<string, { scopes: Set<symbol>; type: unknown; source: string }>;
          _resources: Map<unknown, Map<string, unknown>>;
          _backgroundQueue: Array<{ type: unknown; alias: string; path: string; options: unknown }>;
          _typeRegistry: { _key(type: unknown, source: string): string };
        };
      }
    )._residency;

    class FakeType {}
    const key = residency._typeRegistry._key(FakeType, 'bundled.bin');

    residency._claims.set(key, { scopes: new Set([Symbol('scope')]), type: FakeType, source: 'bundled.bin' });
    residency._backgroundQueue.push({ type: FakeType, alias: 'bundled.bin', path: 'bundled.bin', options: undefined });
    residency._resources.set(FakeType, new Map([['bundled.bin', {}]]));

    const row = loader.inspect().find(r => r.source === 'bundled.bin');

    expect(row?.state).toBe('ready');
    expect(row?.background).toBe(false);
  });
});
