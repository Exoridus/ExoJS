import { expectTypeOf } from 'vitest';

import { materializeAssetBindings } from '#extensions/materialize';
import type { Texture } from '#rendering/texture/Texture';
import type { KindByPath, LeafForPath } from '#resources/AssetDefinitions';
import type { AssetRef } from '#resources/AssetRef';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { registerExtensionKind } from '#resources/extensionKindRegistry';
import { Loader } from '#resources/Loader';

// Test-only compound registration (type level).
declare module '#resources/AssetDefinitions' {
  interface ExtensionKindMap {
    'mock.json': 'json';
  }
}

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

describe('compound extension matching (#14)', () => {
  test('type-level: basename-only, longest-suffix-first', () => {
    // Simple suffix still resolves.
    expectTypeOf<KindByPath<'sprites/ship.png'>>().toEqualTypeOf<'texture'>();
    // Dot in a directory name no longer breaks resolution (old bug: '2/ship.png').
    expectTypeOf<KindByPath<'assets/v1.2/ship.png'>>().toEqualTypeOf<'texture'>();
    // Compound key wins over its shorter suffix.
    expectTypeOf<KindByPath<'hero.mock.json'>>().toEqualTypeOf<'json'>();
    // A non-leaf resource type has no bare-path inference — name it with Asset.type().
    expectTypeOf<KindByPath<'fonts/ui.fnt'>>().toEqualTypeOf<never>();
    // Unregistered suffix resolves to never → LeafForPath falls back to unknown.
    expectTypeOf<KindByPath<'theme.custom'>>().toEqualTypeOf<never>();
    expectTypeOf<LeafForPath<'theme.custom'>>().toEqualTypeOf<unknown>();
    expectTypeOf<LeafForPath<'sprites/ship.png'>>().toEqualTypeOf<Texture>();
    expectTypeOf<LeafForPath<'hero.mock.json'>>().toEqualTypeOf<AssetRef<unknown>>();
    // Query/hash suffixes are stripped before matching.
    expectTypeOf<KindByPath<'ship.png?v=2'>>().toEqualTypeOf<'texture'>();
  });

  test('runtime: longest registered suffix wins, basename only', async () => {
    const loader = createCoreLoader();
    const seen: string[] = [];

    registerExtensionKind('mock.json', 'json'); // compound suffix → the json value kind (bound via coreAssetBindings)
    global.fetch = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      seen.push(String(url));
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ marker: true }),
        text: async () => '{}',
        arrayBuffer: async () => new ArrayBuffer(0),
      } as unknown as Response;
    }) as typeof fetch;

    // 'mock.json' (registered compound) must match before a hypothetical 'json'.
    const value = await loader.load('assets/v1.2/hero.mock.json' as never);
    expect(value).toEqual({ marker: true });
  });

  test('runtime: unregistered extension still throws with a clear message', () => {
    const loader = createCoreLoader();
    expect(() => loader.load('theme.custom' as never)).toThrow('no type registered');
  });
});
