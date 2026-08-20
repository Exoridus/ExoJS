import { Asset } from '#assets/Asset';
import { AssetRef } from '#assets/AssetRef';
import type { AssetInspection } from '#assets/AssetResidency';
import { Assets } from '#assets/Assets';
import { coreAssetBindings } from '#assets/coreAssetBindings';
import { defineAsset } from '#assets/defineAsset';
import { Loader, LoadPriority } from '#assets/Loader';
import type { LoaderScope } from '#assets/LoaderScope';
import { TextAsset } from '#assets/tokens';
import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

// A test-only, non-leaf asset kind — no seamless adapter, `isValue: false` —
// the exact shape `LoaderScope.release()` calls out (a resource loaded
// with `load(Asset.type('bmFont', …))`): it never goes through `createLeaf`,
// so it carries no `_assetMeta` stamp and is never adopted/registered in the
// handle→key map either.
declare module '#assets/AssetDefinitions' {
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

describe('LoaderScope.release() fail-loud contract', () => {
  test('throws for an unsupported raw object, naming the supported forms', () => {
    const scope = new Loader().scope();

    expect(() => scope.release({ arbitrary: true } as never)).toThrow(/no claim identity/);
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

    const scope = loader.scope();
    const asset = new Asset({ type: 'dxNonLeafAsset', source: 'thing.dat' });
    const resource = await scope.load(asset);

    expect(loader.inspect()).toHaveLength(1);
    expect(() => scope.release(resource as unknown as object)).toThrow(/no claim identity/);
    // The claim survives the throw — nothing was silently discarded.
    expect(loader.inspect()).toHaveLength(1);

    // The documented workaround (release the descriptor instead) works.
    expect(() => scope.release(asset)).not.toThrow();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('stays an idempotent no-op for a never-adopted VALUE catalog leaf', () => {
    const loader = new Loader();
    const scope = loader.scope();
    const catalog = Assets.from({ note: 'note.txt' });

    expect(() => scope.release(catalog.note)).not.toThrow();
    expect(() => scope.release(catalog.note)).not.toThrow();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('stays an idempotent no-op for a never-adopted RESOURCE catalog leaf', () => {
    const loader = createCoreLoader();
    const scope = loader.scope();
    const catalog = Assets.from({ hero: 'hero.png' });

    expect(() => scope.release(catalog.hero)).not.toThrow();
    expect(() => scope.release(catalog.hero)).not.toThrow();
    expect(loader.inspect()).toHaveLength(0);
  });

  test('supported release identities are unchanged: descriptor, catalog, (type, source), and an adopted handle all still clear their claim', async () => {
    const loader = createCoreLoader();
    const scope = loader.scope();
    mockFetchImage();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1, height: 1 })),
    );

    const hasRow = (source: string): boolean => loader.inspect().some(row => row.aliases.includes(source));

    // 1. Asset descriptor.
    const asset = new Asset({ type: 'texture', source: 'a.png' });
    await scope.load(asset);
    expect(hasRow('a.png')).toBe(true);
    scope.release(asset);
    expect(hasRow('a.png')).toBe(false);

    // 2. Assets catalog.
    const catalog = new Assets({ b: { type: 'texture', source: 'b.png' } });
    await scope.load(catalog);
    expect(hasRow('b.png')).toBe(true);
    scope.release(catalog);
    expect(hasRow('b.png')).toBe(false);

    // 3. (type, source) pair.
    await scope.load(Asset.type('texture', 'c.png'));
    expect(hasRow('c.png')).toBe(true);
    scope.release(Texture, 'c.png');
    expect(hasRow('c.png')).toBe(false);

    // 4. An adopted seamless handle.
    const handle = scope.get('d.png');
    await handle.loaded;
    expect(hasRow('d.png')).toBe(true);
    scope.release(handle);
    expect(hasRow('d.png')).toBe(false);
  });

  test('stays a no-op for a handle get() once returned, even after an internal hard reset forgets its claim/key bookkeeping', async () => {
    const loader = createCoreLoader();
    mockFetchImage();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1, height: 1 })),
    );

    const scope = loader.scope();
    const handle = scope.get('hero.png');
    await handle.loaded;

    // AssetResidency.unloadAll() is a deliberately-internal hard reset (NOT
    // exposed on Loader — scope release and destroy are the only public
    // teardown verbs) that forgets claim/handle bookkeeping entirely, the same
    // way existing tests reach it via direct residency access.
    (loader as unknown as { _residency: { unloadAll(): void } })._residency.unloadAll();

    // The throw must depend only on whether THIS object is a real handle —
    // never on unrelated internal state that changed since it was handed out.
    expect(() => scope.release(handle)).not.toThrow();
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

    expect(Object.keys(row).sort()).toEqual(['aliases', 'background', 'canonicalKey', 'claims', 'inFlight', 'locator', 'owners', 'state', 'type']);

    for (const [field, value] of Object.entries(row)) {
      if (field === 'type') {
        continue; // the asset constructor token is intentionally exposed
      }

      expect(value).not.toBeInstanceOf(Set);
      expect(value).not.toBeInstanceOf(AssetRef);
      expect(typeof value).not.toBe('symbol');

      // `aliases` and `owners` are frozen arrays of plain data, never live state.
      if (field === 'aliases' || field === 'owners') {
        expect(Object.isFrozen(value)).toBe(true);
        continue;
      }

      expect(typeof value).not.toBe('object');
    }

    pending.resolve('done');
    await ref.loaded;
  });

  test('rows are sorted by canonical key regardless of claim order', () => {
    mockFetchText();
    const loader = new Loader();
    loader.bindAsset<string>({ ctor: TextAsset, storageName: 'text' }, { load: async request => `text:${request.source}` });

    loader.get('zzz.txt');
    loader.get('aaa.txt');
    loader.get('mmm.txt');

    expect(loader.inspect().map(row => row.aliases[0])).toEqual(['aaa.txt', 'mmm.txt', 'zzz.txt']);
  });

  test('tracks the loading → ready transition; an earlier snapshot never mutates in place', async () => {
    const pending = deferred<string>();
    const loader = new Loader();
    loader.bindAsset<string>({ ctor: TextAsset, storageName: 'text' }, { load: async () => pending.promise });

    const ref = loader.get('note.txt') as AssetRef<string>;
    const loading = loader.inspect();

    expect(loading).toHaveLength(1);
    expect(loading[0]).toMatchObject({ aliases: ['note.txt'], state: 'loading', claims: 1, inFlight: true, background: false });

    pending.resolve('ready');
    await ref.loaded;
    await Promise.resolve(); // let the in-flight bookkeeping's own .finally() cleanup run too

    const ready = loader.inspect();
    expect(ready[0]).toMatchObject({ aliases: ['note.txt'], state: 'ready', claims: 1, inFlight: false, background: false });
    // The array returned earlier is a detached snapshot, not a live view.
    expect(loading[0]?.state).toBe('loading');
  });

  test('tracks the queued state for a background-loading catalog leaf', () => {
    const loader = createCoreLoader();
    loader.setConcurrency(0); // nothing drains

    const catalog = new Assets({ late: { type: 'texture', source: 'late.png' } });
    loader.load(catalog, { priority: LoadPriority.Background });

    const row = loader.inspect().find(r => r.aliases.includes('late.png'));
    // `background` here is the inspection row's own field — whether the key is
    // sitting in the queue right now, not the priority it was requested with.
    expect(row).toMatchObject({ state: 'queued', background: true, inFlight: false, claims: 1 });
  });

  test('tracks the failed state after a fetch rejects', async () => {
    const loader = createCoreLoader();
    mockFetch404();

    const handle = loader.get('gone.png');
    await expect(handle.loaded).rejects.toThrow();

    const row = loader.inspect().find(r => r.aliases.includes('gone.png'));
    expect(row).toMatchObject({ state: 'failed', inFlight: false, background: false, claims: 1 });
  });

  test('claims counts distinct claim scopes, not consumer handles or get() calls', async () => {
    const loader = createCoreLoader();
    mockFetchImage();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 1, height: 1 })),
    );
    const sceneScope = loader.scope('scene');

    const handle = loader.get('hero.png'); // root scope
    loader.get('hero.png'); // same source → same deduped handle, same scope again (no-op)
    loader._getClaimed(sceneScope, 'hero.png'); // a second, distinct scope
    await handle.loaded;

    const row = loader.inspect().find(r => r.aliases.includes('hero.png'));
    expect(row?.claims).toBe(2);
  });

  test('reports failed, not ready, for a value key whose fetch succeeded but whose parse() violated the synchronous contract', async () => {
    const loader = createCoreLoader();
    mockFetchText('raw-payload');

    // `_storeResource` stores the raw fetched payload into `_resources`
    // unconditionally, even though this leaf's own `parse()` step fails it via
    // the new synchronous-parse check — `stored` alone must not be read as
    // "readable" for a diagnostic snapshot.
    const catalog = Assets.from({
      bad: { type: 'text', source: 'note.txt', parse: () => Promise.resolve('nope') as unknown as string },
    });

    await loader.load(catalog).catch(() => undefined);

    expect(catalog.bad.state).toBe('failed');

    const row = loader.inspect().find(r => r.aliases.includes('note.txt'));
    expect(row?.state).toBe('failed');
  });

  test('keeps a re-claimed parse-failed value leaf honestly failed instead of stranding it in loading', async () => {
    const loader = createCoreLoader();
    mockFetchText('raw-payload');

    const catalog = Assets.from({
      bad: { type: 'text', source: 'note.txt', parse: () => Promise.resolve('nope') as unknown as string },
    });

    await loader.load(catalog).catch(() => undefined);
    expect(catalog.bad.state).toBe('failed');

    // Re-claiming the same leaf (routinely: a second scene claiming the same
    // catalog) is a retry, and here `_resources` holds a raw payload while
    // `_refs` holds a ref its OWN `parse()` failed — the one case where the two
    // legitimately diverge. The retry must re-run `parse()` against the stored
    // payload and fail again honestly; refetch-gating the retry on "nothing
    // stored" left the ref re-armed to 'loading' with no fetch in flight, so it
    // never settled again and `inspect()` read the stored payload as 'ready'.
    loader.get(catalog.bad);

    expect(catalog.bad.state).toBe('failed');
    await expect(catalog.bad.loaded).rejects.toThrow(/parse\(\) must be synchronous/);
    expect(loader.inspect().find(r => r.aliases.includes('note.txt'))?.state).toBe('failed');
  });

  test('never reports background:true for a row that has already settled', () => {
    // A producer that stores a payload for a (type, source) key directly —
    // `loadContainer()`'s injection path calls `_storeResource` without going
    // through the background queue's own dequeue/boost bookkeeping — must not
    // leave a settled row also claiming to still be queued.
    const loader = new Loader();
    class FakeType {}

    const canonicalize = (loader as unknown as { _canonicalize(type: unknown, source: string): { key: string } })._canonicalize.bind(loader);
    const asset = canonicalize(FakeType, 'bundled.bin');
    const residency = (
      loader as unknown as {
        _residency: {
          _claims: Map<string, { scopes: Set<LoaderScope>; asset: unknown }>;
          _resources: Map<string, { asset: unknown; value: unknown }>;
          _backgroundQueue: Array<{ asset: unknown; options: unknown }>;
        };
      }
    )._residency;

    residency._claims.set(asset.key, { scopes: new Set<LoaderScope>([loader.scope('scope')]), asset });
    residency._backgroundQueue.push({ asset, options: undefined });
    residency._resources.set(asset.key, { asset, value: {} });

    const row = loader.inspect().find(r => r.aliases.includes('bundled.bin'));

    expect(row?.state).toBe('ready');
    expect(row?.background).toBe(false);
  });
});
