import { afterEach, beforeEach, describe, expect, expectTypeOf, test, vi } from 'vitest';

import type { CatalogResourceLeaf, CatalogValueLeaf } from '#assets/assetMeta';
import { AssetRef } from '#assets/AssetRef';
import { coreAssetTypes } from '#assets/coreAssetTypes';
import { Loader } from '#assets/Loader';
import { materializeAssetTypes } from '#extensions/materialize';
import { Texture } from '#rendering/texture/Texture';

/** Loader with all core asset bindings (mirrors the sibling asset-access tests). */
const createCoreLoader = (): Loader => {
  const loader = new Loader();
  materializeAssetTypes(loader, coreAssetTypes);

  return loader;
};

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

// G1 (S3 Phase 4.5): `get(a descriptor)` is the replacement for the removed
// `get(Type, dynamicSource)` form - an `a descriptor` descriptor passed to `get()`
// must build and adopt its handle-hybrid leaf, not fall through to the legacy
// alias-lookup branch.
describe('get(a descriptor) descriptor access', () => {
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

  test('get({ type: json, source: ... }) returns a stable AssetRef that fills on load', async () => {
    mockFetch({ n: 7 });
    const loader = createCoreLoader();

    const ref = loader.get({ type: 'json', source: 'levels/1.json', parse: (raw: unknown) => raw as { n: number } });
    expect(ref).toBeInstanceOf(AssetRef);
    expect(ref.ready).toBe(false);

    await ref.loaded;
    expect(ref.value).toEqual({ n: 7 });
  });

  test('get({ type: text, source: ... }) returns an AssetRef for a primitive value kind', () => {
    mockFetch('hello');
    const loader = createCoreLoader();

    expect(loader.get({ type: 'text', source: 'greeting.txt' })).toBeInstanceOf(AssetRef);
  });

  test('get({ type: texture, source: ... }) returns a placeholder Texture that heals in place on load', async () => {
    mockFetch({});
    const loader = createCoreLoader();

    const texture = loader.get({ type: 'texture', source: 'sprites/ship.png' });
    expect(texture).toBeInstanceOf(Texture);
    expect(texture.state).toBe('loading');

    await texture.loaded;
    expect(texture.state).toBe('ready');
  });

  test('get(dynamic { type: texture, source: path }) works — the removed get(Texture, dynamicSource) replacement', () => {
    mockFetch({});
    const loader = createCoreLoader();

    const dynamicPath = ['sprites', 'dyn.png'].join('/');
    expect(loader.get({ type: 'texture', source: dynamicPath })).toBeInstanceOf(Texture);
  });

  test('get reports an uninstalled asset type accurately', () => {
    const loader = createCoreLoader();

    expect(() => loader.get({ type: 'missing', source: 'asset.missing' } as never)).toThrow(/no asset type "missing" is installed/);
  });

  test('get(a descriptor) on a non-leaf resource kind throws with guidance to use load()', () => {
    const loader = createCoreLoader();

    // bmFont is a non-leaf resource kind (no seamless adapter, not a value kind).
    // Typed callers are already stopped at compile time; the runtime guard is for untyped ones.
    // @ts-expect-error - a leafless descriptor is not a catalog leaf.
    expect(() => loader.get({ type: 'bmFont', source: 'font.fnt' })).toThrow(/get\(\) hands out a catalog leaf/);
  });

  test('type: get({ type: json, parse: (raw): primitive => raw as primitive }) is AssetRef, get({ type: texture }) is Texture', () => {
    const loader = createCoreLoader();

    // Value descriptor with a primitive payload → AssetRef<primitive>, branded as a catalog leaf.
    expectTypeOf(loader.get({ type: 'json', source: 'n.json', parse: (raw: unknown) => raw as number })).toEqualTypeOf<
      CatalogValueLeaf<number>
    >();
    // Resource descriptor → its heal-in-place handle, branded as a catalog leaf.
    expectTypeOf(loader.get({ type: 'texture', source: 'x.png' })).toEqualTypeOf<CatalogResourceLeaf<Texture>>();
  });
});
