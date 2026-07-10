import { expectTypeOf } from 'vitest';

import { materializeAssetBindings } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';
import { Asset } from '#resources/Asset';
import { AssetRef } from '#resources/AssetRef';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

const mockFetchJson = (payload: unknown): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => payload,
        text: async () => JSON.stringify(payload),
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as unknown as Response,
  );
};

const mockFetch404 = (): void => {
  global.fetch = vi.fn(async (): Promise<Response> => ({ ok: false, status: 404, statusText: 'Not Found' }) as Response);
};

describe('AssetRef value assets', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('get(Asset.kind(json, src)) returns a loading ref whose value throws until ready', async () => {
    mockFetchJson({ hp: 3 });
    const loader = createCoreLoader();

    const ref = loader.get(Asset.kind('json', 'cfg.json'));

    expect(ref).toBeInstanceOf(AssetRef);
    expect(ref.loadState).toBe('loading');
    expect(() => ref.value).toThrow("'loading'");

    await expect(ref.loaded).resolves.toEqual({ hp: 3 });
    expect(ref.loadState).toBe('ready');
    expect(ref.value).toEqual({ hp: 3 });
  });

  test('ref identity is stable: same source → same ref, before and after load()', async () => {
    mockFetchJson({ a: 1 });
    const loader = createCoreLoader();

    const ref = loader.get('cfg.json');

    expect(loader.get('cfg.json')).toBe(ref);

    const value = await loader.load('cfg.json');

    expect(value).toEqual({ a: 1 }); // load() still resolves the RAW value
    expect(loader.get('cfg.json')).toBe(ref);
    expect(ref.value).toEqual({ a: 1 });
  });

  test('get after a completed load() returns a ready ref immediately', async () => {
    mockFetchJson({ b: 2 });
    const loader = createCoreLoader();

    await loader.load(Asset.kind('json', 'cfg.json'));
    const ref = loader.get(Asset.kind('json', 'cfg.json'));

    expect(ref.loadState).toBe('ready');
    expect(ref.value).toEqual({ b: 2 });
  });

  test('failure marks the ref failed; get retries and heals the SAME ref', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const ref = loader.get('flaky.json');

    await expect(ref.loaded).rejects.toThrow();
    expect(ref.loadState).toBe('failed');
    expect(() => ref.value).toThrow("'failed'");

    mockFetchJson({ ok: true });
    const again = loader.get('flaky.json');

    expect(again).toBe(ref);
    expect(ref.loadState).toBe('loading');
    await expect(ref.loaded).resolves.toEqual({ ok: true });
  });
});

describe('bare-path get()/load() for value kinds (§4.2/§4.4)', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('get() returns an AssetRef for a .json path instead of throwing', () => {
    mockFetchJson({ hp: 3 });
    const loader = createCoreLoader();

    const ref = loader.get('data/config.json');

    expect(ref).toBeInstanceOf(AssetRef);
  });

  test('get() returns an AssetRef for a .txt path', () => {
    mockFetchJson('hello');
    const loader = createCoreLoader();

    expect(loader.get('a/b.txt')).toBeInstanceOf(AssetRef);
  });

  test('bare .json get() ref fills with the parsed value', async () => {
    mockFetchJson({ ok: true });
    const loader = createCoreLoader();

    const ref = loader.get('cfg.json') as AssetRef<unknown>;

    await expect(ref.loaded).resolves.toEqual({ ok: true });
  });

  test('await load() on a bare .json path resolves the parsed value', async () => {
    mockFetchJson({ hp: 7 });
    const loader = createCoreLoader();

    const value = await loader.load('cfg.json');

    expect(value).toEqual({ hp: 7 });
  });

  test('get() still returns a Texture for a .png path (seamless unchanged)', () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 16, height: 16 })),
    );
    mockFetchJson({});
    const loader = createCoreLoader();

    expect(loader.get('a/b.png')).toBeInstanceOf(Texture);

    vi.unstubAllGlobals();
  });

  test('get() for an unregistered suffix still throws with guidance', () => {
    const loader = createCoreLoader();

    expect(() => loader.get('theme.custom' as never)).toThrow('no type registered');
  });

  test('type-level: bare value path → AssetRef, resource path → resource', () => {
    const loader = createCoreLoader();

    expectTypeOf(loader.get('a.json')).toEqualTypeOf<AssetRef<unknown>>();
    expectTypeOf(loader.get('a.txt')).toEqualTypeOf<AssetRef<string>>();
    expectTypeOf(loader.get('a.png')).toEqualTypeOf<Texture>();
  });
});

describe('AssetRef status channel', () => {
  it('a constructed ref is loading with no error', () => {
    const ref = new AssetRef<number>();
    expect(ref.state).toBe('loading');
    expect(ref.ready).toBe(false);
    expect(ref.error).toBeNull();
  });
  it('becomes ready after _fill', () => {
    const ref = new AssetRef<number>();
    ref._fill(7);
    expect(ref.state).toBe('ready');
    expect(ref.ready).toBe(true);
    expect(ref.error).toBeNull();
  });
  it('surfaces the failure error', () => {
    const ref = new AssetRef<number>();
    const err = new Error('nope');
    ref._fail(err);
    expect(ref.state).toBe('failed');
    expect(ref.ready).toBe(false);
    expect(ref.error).toBe(err);
  });
});
