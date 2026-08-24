import { describe, expect, it, test, vi } from 'vitest';

import { AssetTypeRegistry } from '#assets/AssetTypeRegistry';
import { _resetExtensionKindsForTest, registerExtensionKind } from '#assets/extensionKindRegistry';

class TypeA {}
class TypeB {}

describe('AssetTypeRegistry', () => {
  test('registerSeamlessAdapter throws on a duplicate registration for the same type', () => {
    const registry = new AssetTypeRegistry();
    const adapter = { createPlaceholder: vi.fn(), stateOf: vi.fn(), begin: vi.fn(), fill: vi.fn(), fail: vi.fn(), evict: vi.fn() };

    registry.registerSeamlessAdapter(TypeA, adapter as never);
    expect(() => registry.registerSeamlessAdapter(TypeA, adapter as never)).toThrow(/already registered/);
  });

  test('hasSeamlessAdapter/getSeamlessAdapter reflect registration', () => {
    const registry = new AssetTypeRegistry();
    const adapter = { createPlaceholder: vi.fn(), stateOf: vi.fn(), begin: vi.fn(), fill: vi.fn(), fail: vi.fn(), evict: vi.fn() };

    expect(registry.hasSeamlessAdapter(TypeA)).toBe(false);
    registry.registerSeamlessAdapter(TypeA, adapter as never);
    expect(registry.hasSeamlessAdapter(TypeA)).toBe(true);
    expect(registry.getSeamlessAdapter(TypeA)).toBe(adapter);
  });

  test('bindAsset registers type names and extensions atomically, and validates before mutating', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, typeNames: ['type-a'], extensions: ['ta'] }, handler);

    expect(registry.hasAssetType('type-a')).toBe(true);
    expect(registry.hasExtension('.ta')).toBe(true);
    expect(registry.hasLoadable(TypeA)).toBe(true);
    expect(registry.getHandler(TypeA)).toBeDefined();
  });

  test('bindings, explicit overrides, and lookups share one extension normalization rule', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, type: 'json', extensions: ['..MiXeD'] }, handler);

    expect(registry.hasExtension('.mixed')).toBe(true);
    expect(registry.resolveExtensionType('...MIXED')).toBe('json');

    registry.registerType('....mixed', 'text');
    expect(registry.resolveExtensionType('.mixed')).toBe('text');
  });

  test('hasLoadable() reflects only bindAsset handler registration, not just any known constructor', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    expect(registry.hasLoadable(TypeA)).toBe(false);
    registry.bindAsset({ ctor: TypeA }, handler);
    expect(registry.hasLoadable(TypeA)).toBe(true);
  });

  test('bindAsset threads an optional storageName onto the stored HandlerEntry', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, storageName: 'custom-ns' }, handler);

    expect(registry.getHandler(TypeA)?.storageName).toBe('custom-ns');
  });

  test('bindAsset without storageName leaves it undefined on the stored HandlerEntry', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA }, handler);

    expect(registry.getHandler(TypeA)?.storageName).toBeUndefined();
  });

  test('bindAsset throws on a duplicate handler for the same type, without touching unrelated state', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, typeNames: ['type-a'] }, handler);

    expect(() => registry.bindAsset({ ctor: TypeA, typeNames: ['type-a-again'] }, handler)).toThrow(/already registered/);
    // The failed second call must not have registered its type name.
    expect(registry.hasAssetType('type-a-again')).toBe(false);
  });

  test('bindAsset throws on a duplicate type name across different types, validated before any mutation', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, typeNames: ['shared-name'] }, handler);

    const otherHandler = { load: vi.fn(async () => ({})) };
    expect(() => registry.bindAsset({ ctor: TypeB, typeNames: ['shared-name'] }, otherHandler)).toThrow(/already registered/);
    expect(registry.hasLoadable(TypeB)).toBe(false);
  });

  test('bindAsset registers a seamless adapter when keys.seamless is provided', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };
    const adapter = { createPlaceholder: vi.fn(), stateOf: vi.fn(), begin: vi.fn(), fill: vi.fn(), fail: vi.fn(), evict: vi.fn() };

    registry.bindAsset({ ctor: TypeA, seamless: adapter as never }, handler);

    expect(registry.hasSeamlessAdapter(TypeA)).toBe(true);
  });

  test('bindAsset validates a seamless-adapter conflict before mutating any binding-owned map', () => {
    const registry = new AssetTypeRegistry();
    const adapter = { createPlaceholder: vi.fn(), stateOf: vi.fn(), begin: vi.fn(), fill: vi.fn(), fail: vi.fn(), evict: vi.fn() };
    const handler = { load: vi.fn(async () => ({})) };

    registry.registerSeamlessAdapter(TypeA, adapter as never);

    expect(() => registry.bindAsset({ ctor: TypeA, typeNames: ['type-a'], extensions: ['ta'], seamless: adapter as never }, handler)).toThrow(
      /seamless adapter is already registered/,
    );
    expect(registry.hasLoadable(TypeA)).toBe(false);
    expect(registry.hasAssetType('type-a')).toBe(false);
    expect(registry.hasExtension('ta')).toBe(false);
  });

  test('_typeIdentity is stable per type and distinct across types', () => {
    const registry = new AssetTypeRegistry();

    expect(registry._typeIdentity(TypeA)).toBe(registry._typeIdentity(TypeA));
    expect(registry._typeIdentity(TypeA)).not.toBe(registry._typeIdentity(TypeB));
  });

  test('_typeIdentity answers with the stable id an install supplied, not an ordinal', () => {
    const registry = new AssetTypeRegistry();

    registry.bindAsset({ ctor: TypeA, typeIdentity: 'com.example.world' }, { load: async () => 'x' });
    registry.bindAsset({ ctor: TypeB }, { load: async () => 'y' });

    expect(registry._typeIdentity(TypeA)).toBe('com.example.world');
    expect(registry._typeIdentity(TypeB)).toMatch(/^\d+$/);
  });

  test('_identityDiscriminator is undefined without a handler hook and forwards source + options with one', () => {
    const registry = new AssetTypeRegistry();

    expect(registry._identityDiscriminator(TypeA, 'a.png', { format: 'x' })).toBeUndefined();

    registry.bindAsset(
      { ctor: TypeA },
      {
        getIdentityDiscriminator: request => String((request.options as { format?: string } | undefined)?.format),
        load: vi.fn(async () => ({})),
      },
    );

    expect(registry._identityDiscriminator(TypeA, 'a.png', { format: 'x' })).toBe('x');
    expect(registry._identityDiscriminator(TypeA, 'a.png', { format: 'y' })).toBe('y');
  });

  test('_identityDiscriminator never walks options a type has not declared identity-relevant', () => {
    const registry = new AssetTypeRegistry();

    registry.bindAsset(
      { ctor: TypeA },
      { getIdentityDiscriminator: request => String((request.options as { format?: string } | undefined)?.format), load: vi.fn(async () => ({})) },
    );

    const hostile = {
      format: 'x',
      get unrelated(): never {
        throw new Error('must not be read during canonicalization');
      },
    };

    expect(() => registry._identityDiscriminator(TypeA, 'a.png', hostile)).not.toThrow();
  });

  test('_resolveTypeForPath matches the longest registered dot-suffix first', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, type: 'json', extensions: ['json'] }, handler);
    registry.bindAsset({ ctor: TypeB, type: 'text', extensions: ['aseprite.json'] }, handler);

    expect(registry._resolveTypeForPath('hero.aseprite.json')).toBe('text');
    expect(registry._resolveTypeForPath('plain.json')).toBe('json');
    expect(registry._resolveTypeForPath('no-extension-match.xyz')).toBeUndefined();
  });

  test('_resolveTypeForPath ignores an extension bound without a `type` (bare path needs Asset.type)', () => {
    const registry = new AssetTypeRegistry();

    registry.bindAsset({ ctor: TypeA, extensions: ['bnd'] }, { load: vi.fn(async () => ({})) });

    expect(registry.hasExtension('bnd')).toBe(true);
    expect(registry._resolveTypeForPath('thing.bnd')).toBeUndefined();
  });

  test('_resolveTypeForPath prefers the app-local override over the global default', () => {
    const registry = new AssetTypeRegistry();

    registerExtensionKind('globaldefault', 'json'); // the global (defineAsset) layer

    expect(registry._resolveTypeForPath('config.globaldefault')).toBe('json');

    registry.registerType('globaldefault', 'text'); // the app-local layer wins

    expect(registry._resolveTypeForPath('config.globaldefault')).toBe('text');
  });

  test('_describeType falls back to a placeholder name for an anonymous constructor', () => {
    const registry = new AssetTypeRegistry();
    const Anonymous = (() => class {})();

    expect(registry._describeType(Anonymous)).toBe('(anonymous type)');
    expect(registry._describeType(TypeA)).toBe('TypeA');
  });

  test('destroy() destroys every bound handler exactly once, even if bound under multiple names', () => {
    const registry = new AssetTypeRegistry();
    const destroy = vi.fn();
    const handler = { load: vi.fn(async () => ({})), destroy };

    registry.bindAsset({ ctor: TypeA }, handler);
    registry.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(registry.hasLoadable(TypeA)).toBe(false);
  });

  test('bindAsset with a `type` records its extensions as the binding-declared default type', () => {
    _resetExtensionKindsForTest();

    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, type: 'json', extensions: ['ldtk'] }, handler);

    expect(registry.resolveExtensionType('ldtk')).toBe('json');
  });

  test('bindAsset does NOT conflict with an existing registerType override — the override keeps winning', () => {
    _resetExtensionKindsForTest();

    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.registerType('ldtk', 'text');

    expect(() => registry.bindAsset({ ctor: TypeA, type: 'json', extensions: ['ldtk'] }, handler)).not.toThrow();
    expect(registry.hasLoadable(TypeA)).toBe(true);
    expect(registry.hasExtension('ldtk')).toBe(true);
    expect(registry.resolveExtensionType('ldtk')).toBe('text');
  });

  test('a registerType override applied AFTER a binding still wins over the binding-declared type', () => {
    _resetExtensionKindsForTest();

    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, type: 'json', extensions: ['ldtk'] }, handler);

    expect(registry.resolveExtensionType('ldtk')).toBe('json');
    expect(() => registry.registerType('ldtk', 'text')).not.toThrow();
    expect(registry.resolveExtensionType('ldtk')).toBe('text');
    expect(registry._resolveTypeForPath('world.ldtk')).toBe('text');
  });

  test('the binding-declared type outranks the global default for the same suffix', () => {
    _resetExtensionKindsForTest();
    registerExtensionKind('ldtk', 'json'); // global default

    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, type: 'text', extensions: ['ldtk'] }, handler);

    expect(registry.resolveExtensionType('ldtk')).toBe('text');
  });

  test('the first binding owns a suffix and a second binding-declared default is rejected atomically', () => {
    _resetExtensionKindsForTest();

    const registry = new AssetTypeRegistry();
    const handlerA = { load: vi.fn(async () => ({})) };
    const handlerB = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, type: 'json', extensions: ['shared'] }, handlerA);

    expect(() => registry.bindAsset({ ctor: TypeB, type: 'text', extensions: ['shared'] }, handlerB)).toThrow(
      'File extension ".shared" is already mapped to an asset type.',
    );
    expect(registry.resolveExtensionType('shared')).toBe('json');
    expect(registry.hasLoadable(TypeB)).toBe(false);
  });
});

describe('AssetTypeRegistry.registerType', () => {
  it('an app-local override wins over the global default for that extension', () => {
    _resetExtensionKindsForTest();
    registerExtensionKind('json', 'json'); // global default

    const registry = new AssetTypeRegistry();
    registry.registerType('json', 'text');

    expect(registry.resolveExtensionType('json')).toBe('text');
  });

  it('falls back to the global default when no app override exists', () => {
    _resetExtensionKindsForTest();
    registerExtensionKind('json', 'json');

    const registry = new AssetTypeRegistry();

    expect(registry.resolveExtensionType('json')).toBe('json');
  });

  it('is idempotent for registering the same (extension, type) pair twice', () => {
    const registry = new AssetTypeRegistry();
    registry.registerType('json', 'text');

    expect(() => registry.registerType('json', 'text')).not.toThrow();
  });

  it('throws when a DIFFERENT override is registered for an already-overridden extension', () => {
    const registry = new AssetTypeRegistry();
    registry.registerType('json', 'text');

    expect(() => registry.registerType('json', 'json')).toThrow(/already registered/);
  });
});
