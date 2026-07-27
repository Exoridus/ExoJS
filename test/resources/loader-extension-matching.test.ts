import { expectTypeOf } from 'vitest';

// Application construction materializes the real core asset bindings; only the
// rendering backend is irrelevant to this asset-resolution test.
vi.mock('#rendering/webgl2/WebGl2Backend', () => ({
  WebGl2Backend: vi.fn().mockImplementation(function () {
    return {
      backendType: 'webgl2',
      view: { width: 800, height: 600, center: { x: 400, y: 300 } },
      rendererRegistry: { bindRenderer: vi.fn() },
      onContextLost: { add: vi.fn() },
      onContextRestored: { add: vi.fn() },
      onRenderError: { add: vi.fn() },
      destroy: vi.fn(),
    };
  }),
}));

import { Application } from '#core/Application';
import type { AssetBinding } from '#extensions/Extension';
import { materializeAssetBindings } from '#extensions/materialize';
import type { Texture } from '#rendering/texture/Texture';
import { Asset } from '#resources/Asset';
import type { KindByPath, LeafForPath } from '#resources/AssetDefinitions';
import type { AssetRef } from '#resources/AssetRef';
import { coreAssetBindings } from '#resources/coreAssetBindings';
import { registerExtensionKind } from '#resources/extensionKindRegistry';
import { Loader } from '#resources/Loader';

// Test-only compound registration (type level).
declare module '#resources/AssetDefinitions' {
  interface AssetDefinitions {
    applicationText: { resource: string; config: { source: string }; isValue: true };
  }

  interface ExtensionKindMap {
    'mock.json': 'json';
  }
}

class ApplicationText {}

const applicationTextBinding: AssetBinding<string> = {
  ctor: ApplicationText,
  type: 'applicationText',
  typeNames: ['applicationText'],
  create: () => ({
    load: async request => `extension:${request.source}`,
  }),
};

function createCoreLoader(): Loader {
  const loader = new Loader();
  materializeAssetBindings(loader, coreAssetBindings);
  return loader;
}

function mockTextAndJsonResponse(): void {
  global.fetch = vi.fn(
    async (): Promise<Response> =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({ marker: true }),
        text: async () => 'raw level text',
        arrayBuffer: async () => new ArrayBuffer(0),
      }) as unknown as Response,
  ) as typeof fetch;
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

describe('registerType() on a loader that already has bindings', () => {
  test('works on a real Application whose constructor already materialized core and extension bindings', async () => {
    const app = new Application({
      backend: { type: 'webgl2' },
      extensions: [{ id: 'test.application-text', assets: [applicationTextBinding] }],
      hello: false,
    });

    try {
      expect(() => app.loader.registerType('json', 'applicationText')).not.toThrow();
      expect(app.loader['_typeRegistry'].resolveExtensionType('json')).toBe('applicationText');
      expect(app.loader.hasAssetType('json')).toBe(true);
      expect(app.loader.hasExtension('json')).toBe(true);
      expect(app.loader.hasAssetType('applicationText')).toBe(true);
      await expect(app.loader.load('app-override.json' as never)).resolves.toBe('extension:app-override.json');
    } finally {
      app.destroy();
    }
  });

  test('overrides a suffix a binding already claimed, instead of throwing', () => {
    const loader = createCoreLoader();

    // Core bindings already claim `.json` (→ the `json` type). The whole point of
    // registerType is to re-point such a suffix app-locally.
    expect(loader['_typeRegistry'].resolveExtensionType('json')).toBe('json');
    expect(() => loader.registerType('json', 'text')).not.toThrow();
    expect(loader['_typeRegistry'].resolveExtensionType('json')).toBe('text');
    expect(loader['_typeRegistry']._resolveTypeForPath('data/level.json')).toBe('text');
  });

  test('the override actually drives bare-path dispatch through the loader', async () => {
    const loader = createCoreLoader();

    mockTextAndJsonResponse();

    loader.registerType('json', 'text');

    // With the override in place the `.json` suffix must reach the TEXT handler,
    // so the raw body comes back unparsed.
    await expect(loader.load('data/level.json' as never)).resolves.toBe('raw level text');
  });

  test('a second registerType with a different type still conflicts', () => {
    const loader = createCoreLoader();

    loader.registerType('json', 'text');
    expect(() => loader.registerType('json', 'binary')).toThrow(/already registered/);
    // Idempotent re-registration of the same pair stays fine.
    expect(() => loader.registerType('json', 'text')).not.toThrow();
  });

  test('an override registered before core bindings materialize remains effective while the binding and handler install', async () => {
    const loader = new Loader();
    mockTextAndJsonResponse();

    loader.registerType('json', 'text');
    materializeAssetBindings(loader, coreAssetBindings);

    expect(loader.hasAssetType('json')).toBe(true);
    expect(loader.hasExtension('json')).toBe(true);
    expect(loader['_typeRegistry'].resolveExtensionType('json')).toBe('text');
    await expect(loader.load('before-bindings.json' as never)).resolves.toBe('raw level text');
  });

  test('two loaders keep their app-local overrides fully isolated', async () => {
    const overridden = createCoreLoader();
    const defaults = createCoreLoader();
    mockTextAndJsonResponse();

    overridden.registerType('json', 'text');

    expect(overridden['_typeRegistry'].resolveExtensionType('json')).toBe('text');
    expect(defaults['_typeRegistry'].resolveExtensionType('json')).toBe('json');
    await expect(overridden.load('same.json' as never)).resolves.toBe('raw level text');
    await expect(defaults.load('same.json')).resolves.toEqual({ marker: true });
  });

  test('Asset.type() is a one-off type choice and does not mutate the app-local or global defaults', async () => {
    const loader = createCoreLoader();
    mockTextAndJsonResponse();

    loader.registerType('json', 'text');

    await expect(loader.load(Asset.type<{ marker: boolean }>('json', 'one-off.json'))).resolves.toEqual({ marker: true });
    expect(loader['_typeRegistry'].resolveExtensionType('json')).toBe('text');
    await expect(loader.load('after-one-off.json' as never)).resolves.toBe('raw level text');

    const otherLoader = createCoreLoader();
    expect(otherLoader['_typeRegistry'].resolveExtensionType('json')).toBe('json');
  });
});
