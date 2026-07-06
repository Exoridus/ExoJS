import { expectTypeOf } from 'vitest';

import { materializeAssetBindings } from '#extensions/materialize';
import { AssetRef } from '#resources/AssetRef';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import { Json, TextAsset } from '#resources/tokens';

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

const mockFetchJson = (payload: unknown): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({ ok: true, status: 200, statusText: 'OK', json: async () => payload, text: async () => JSON.stringify(payload), arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as Response,
  );
};

const mockFetch404 = (): void => {
  global.fetch = vi.fn(async (): Promise<Response> => ({ ok: false, status: 404, statusText: 'Not Found' }) as Response);
};

describe('AssetRef value assets', () => {
  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('get(Json, src) returns a loading ref whose value throws until ready', async () => {
    mockFetchJson({ hp: 3 });
    const loader = createCoreLoader();

    const ref = loader.get(Json, 'cfg.json');

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

    const ref = loader.get(Json, 'cfg.json');

    expect(loader.get(Json, 'cfg.json')).toBe(ref);

    const value = await loader.load(Json, 'cfg.json');

    expect(value).toEqual({ a: 1 }); // load() still resolves the RAW value
    expect(loader.get(Json, 'cfg.json')).toBe(ref);
    expect(ref.value).toEqual({ a: 1 });
  });

  test('get after a completed load() returns a ready ref immediately', async () => {
    mockFetchJson({ b: 2 });
    const loader = createCoreLoader();

    await loader.load(Json, 'cfg.json');
    const ref = loader.get(Json, 'cfg.json');

    expect(ref.loadState).toBe('ready');
    expect(ref.value).toEqual({ b: 2 });
  });

  test('failure marks the ref failed; get retries and heals the SAME ref', async () => {
    mockFetch404();
    const loader = createCoreLoader();

    const ref = loader.get(Json, 'flaky.json');

    await expect(ref.loaded).rejects.toThrow();
    expect(ref.loadState).toBe('failed');
    expect(() => ref.value).toThrow("'failed'");

    mockFetchJson({ ok: true });
    const again = loader.get(Json, 'flaky.json');

    expect(again).toBe(ref);
    expect(ref.loadState).toBe('loading');
    await expect(ref.loaded).resolves.toEqual({ ok: true });
  });

  test('type-level: token overloads', () => {
    const loader = createCoreLoader();

    expectTypeOf(loader.get<{ hp: number }>(Json, 'cfg.json')).toEqualTypeOf<AssetRef<{ hp: number }>>();
    expectTypeOf(loader.get(TextAsset, 'a.txt')).toEqualTypeOf<AssetRef<string>>();
  });
});
