import { expectTypeOf } from 'vitest';

import { materializeAssetBindings } from '#extensions/materialize';
import type { BmFont } from '#rendering/text/BmFont';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { type LoadByPath, Loader, type PathExtension } from '#resources/Loader';
import { Json } from '#resources/tokens';

// Test-only compound registration (type level).
declare module '#resources/Loader' {
  interface ExtensionTypeMap {
    'mock.json': string;
  }
}

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

describe('compound extension matching (#14)', () => {
  test('type-level: basename-only, longest-suffix-first', () => {
    // Simple extension still resolves.
    expectTypeOf<PathExtension<'fonts/ui.fnt'>>().toEqualTypeOf<'fnt'>();
    // Dot in a directory name no longer breaks resolution (old bug: '2/ui.fnt').
    expectTypeOf<PathExtension<'assets/v1.2/ui.fnt'>>().toEqualTypeOf<'fnt'>();
    // Compound key wins over its shorter suffix.
    expectTypeOf<PathExtension<'hero.mock.json'>>().toEqualTypeOf<'mock.json'>();
    // Unregistered extension resolves to never → LoadByPath falls back to unknown.
    expectTypeOf<PathExtension<'theme.custom'>>().toEqualTypeOf<never>();
    expectTypeOf<LoadByPath<'theme.custom'>>().toEqualTypeOf<unknown>();
    expectTypeOf<LoadByPath<'fonts/ui.fnt'>>().toEqualTypeOf<BmFont>();
    // Query/hash suffixes are stripped before matching.
    expectTypeOf<PathExtension<'ui.fnt?v=2'>>().toEqualTypeOf<'fnt'>();
  });

  test('runtime: longest registered suffix wins, basename only', async () => {
    const loader = createCoreLoader();
    const seen: string[] = [];

    loader.registerExtension('mock.json', Json); // Json's factory is bound via coreAssetBindings
    global.fetch = vi.fn(async (url: string | URL | Request): Promise<Response> => {
      seen.push(String(url));
      return { ok: true, status: 200, statusText: 'OK', json: async () => ({ marker: true }), text: async () => '{}', arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
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
