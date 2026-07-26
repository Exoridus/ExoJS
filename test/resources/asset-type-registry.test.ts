import { describe, expect, it, test, vi } from 'vitest';

import { AssetTypeRegistry } from '#resources/AssetTypeRegistry';
import { _resetExtensionKindsForTest, registerExtensionKind } from '#resources/extensionKindRegistry';

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

  test('_key/_identityKey derive stable, distinct per-type-per-alias keys', () => {
    const registry = new AssetTypeRegistry();

    expect(registry._key(TypeA, 'a.png')).toBe(registry._key(TypeA, 'a.png'));
    expect(registry._key(TypeA, 'a.png')).not.toBe(registry._key(TypeB, 'a.png'));
    expect(registry._identityKey(TypeA, 'a.png')).not.toBe(registry._key(TypeA, 'a.png'));
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

  test('bindAsset with a `type` writes its extensions into the registerType override table', () => {
    _resetExtensionKindsForTest();

    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ ctor: TypeA, type: 'json', extensions: ['ldtk'] }, handler);

    expect(registry.resolveExtensionType('ldtk')).toBe('json');
  });

  test('bindAsset throws when its `type` conflicts with an already-registered override, without mutating any state', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.registerType('ldtk', 'text');

    expect(() => registry.bindAsset({ ctor: TypeA, type: 'json', extensions: ['ldtk'] }, handler)).toThrow(/already registered/);
    expect(registry.hasLoadable(TypeA)).toBe(false);
    expect(registry.hasExtension('ldtk')).toBe(false);
    expect(registry.resolveExtensionType('ldtk')).toBe('text');
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
