import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';

import { materializeAssetBindings } from '#extensions/materialize';
import { BmFont } from '#rendering/text/BmFont';
import { Texture } from '#rendering/texture/Texture';
import { AssetRef } from '#resources/AssetRef';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { Loader } from '#resources/Loader';
import { Json, TextAsset } from '#resources/tokens';

/** Loader with all core asset bindings (mirrors the sibling asset-access tests). */
function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

const originalFetch = global.fetch;

const mockFetch = (jsonPayload: unknown): void => {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => jsonPayload,
        text: async () => JSON.stringify(jsonPayload),
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as unknown as Response,
  );
};

// G1 (S3 Phase 4.5): `get(X.of())` is the replacement for the removed
// `get(Type, dynamicSource)` form — a raw `X.of()` descriptor passed to `get()`
// must build and adopt its handle-hybrid leaf, not fall through to the legacy
// alias-lookup branch.
describe('get(X.of()) descriptor access', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4, height: 4 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    global.fetch = originalFetch;
  });

  test('get(Json.of(...)) returns a stable AssetRef that fills on load', async () => {
    mockFetch({ n: 7 });
    const loader = createCoreLoader();

    const ref = loader.get(Json.of<{ n: number }>('levels/1.json'));
    expect(ref).toBeInstanceOf(AssetRef);
    expect(ref.ready).toBe(false);

    await ref.loaded;
    expect(ref.value).toEqual({ n: 7 });
  });

  test('get(TextAsset.of(...)) returns an AssetRef for a primitive value kind', () => {
    mockFetch('hello');
    const loader = createCoreLoader();

    expect(loader.get(TextAsset.of('greeting.txt'))).toBeInstanceOf(AssetRef);
  });

  test('get(Texture.of(...)) returns a placeholder Texture that heals in place on load', async () => {
    mockFetch({});
    const loader = createCoreLoader();

    const texture = loader.get(Texture.of('sprites/ship.png'));
    expect(texture).toBeInstanceOf(Texture);
    expect(texture.state).toBe('loading');

    await texture.loaded;
    expect(texture.state).toBe('ready');
  });

  test('get(dynamic Texture.of(path)) works — the removed get(Texture, dynamicSource) replacement', () => {
    mockFetch({});
    const loader = createCoreLoader();

    const dynamicPath = ['sprites', 'dyn.png'].join('/');
    expect(loader.get(Texture.of(dynamicPath))).toBeInstanceOf(Texture);
  });

  test('get(X.of()) on a non-leaf resource kind throws with guidance to use load()', () => {
    const loader = createCoreLoader();

    // bmFont is a non-leaf resource kind (no seamless adapter, not a value kind).
    expect(() => loader.get(BmFont.of('font.fnt'))).toThrow(/get\(\) is for seamless\/value assets/);
  });

  test('type: get(Json.of<primitive>) is AssetRef, get(Texture.of) is Texture', () => {
    const loader = createCoreLoader();

    // Value descriptor with a primitive payload → AssetRef<primitive>.
    expectTypeOf(loader.get(Json.of<number>('n.json'))).toEqualTypeOf<AssetRef<number>>();
    // Resource descriptor → its heal-in-place handle.
    expectTypeOf(loader.get(Texture.of('x.png'))).toEqualTypeOf<Texture>();
  });
});
