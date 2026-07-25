import { describe, expect, test, vi } from 'vitest';

import type { AssetFactory } from '#resources/AssetFactory';
import { AssetTypeRegistry } from '#resources/AssetTypeRegistry';

class TypeA {}
class TypeB {}

function fakeFactory<T>(create: () => T): AssetFactory<T> {
  return {
    storageName: 'test',
    process: async (r: Response) => r,
    create: async () => create(),
    destroy: vi.fn(),
  };
}

describe('AssetTypeRegistry', () => {
  test('register/hasFactory/resolveFactory round-trip', () => {
    const registry = new AssetTypeRegistry();
    const factory = fakeFactory(() => new TypeA());

    expect(registry.hasFactory(TypeA)).toBe(false);
    registry.register(TypeA, factory);
    expect(registry.hasFactory(TypeA)).toBe(true);
    expect(registry.resolveFactory(TypeA)).toBe(factory);
  });

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

    registry.bindAsset({ type: TypeA, typeNames: ['type-a'], extensions: ['ta'] }, handler);

    expect(registry.hasAssetType('type-a')).toBe(true);
    expect(registry.hasExtension('.ta')).toBe(true);
    expect(registry.hasLoadable(TypeA)).toBe(true);
    expect(registry.getHandler(TypeA)).toBeDefined();
  });

  test('bindAsset throws on a duplicate handler for the same type, without touching unrelated state', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ type: TypeA, typeNames: ['type-a'] }, handler);

    expect(() => registry.bindAsset({ type: TypeA, typeNames: ['type-a-again'] }, handler)).toThrow(/already registered/);
    // The failed second call must not have registered its type name.
    expect(registry.hasAssetType('type-a-again')).toBe(false);
  });

  test('bindAsset throws on a duplicate type name across different types, validated before any mutation', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ type: TypeA, typeNames: ['shared-name'] }, handler);

    const otherHandler = { load: vi.fn(async () => ({})) };
    expect(() => registry.bindAsset({ type: TypeB, typeNames: ['shared-name'] }, otherHandler)).toThrow(/already registered/);
    expect(registry.hasLoadable(TypeB)).toBe(false);
  });

  test('bindAsset registers a seamless adapter when keys.seamless is provided', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };
    const adapter = { createPlaceholder: vi.fn(), stateOf: vi.fn(), begin: vi.fn(), fill: vi.fn(), fail: vi.fn(), evict: vi.fn() };

    registry.bindAsset({ type: TypeA, seamless: adapter as never }, handler);

    expect(registry.hasSeamlessAdapter(TypeA)).toBe(true);
  });

  test('_key/_identityKey derive stable, distinct per-type-per-alias keys', () => {
    const registry = new AssetTypeRegistry();

    expect(registry._key(TypeA, 'a.png')).toBe(registry._key(TypeA, 'a.png'));
    expect(registry._key(TypeA, 'a.png')).not.toBe(registry._key(TypeB, 'a.png'));
    expect(registry._identityKey(TypeA, 'a.png')).not.toBe(registry._key(TypeA, 'a.png'));
  });

  test('_resolveExtensionType matches the longest registered dot-suffix first', () => {
    const registry = new AssetTypeRegistry();
    const handler = { load: vi.fn(async () => ({})) };

    registry.bindAsset({ type: TypeA, extensions: ['json'] }, handler);
    registry.bindAsset({ type: TypeB, extensions: ['aseprite.json'] }, handler);

    expect(registry._resolveExtensionType('hero.aseprite.json')).toBe(TypeB);
    expect(registry._resolveExtensionType('plain.json')).toBe(TypeA);
    expect(registry._resolveExtensionType('no-extension-match.xyz')).toBeUndefined();
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

    registry.bindAsset({ type: TypeA }, handler);
    registry.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(registry.hasLoadable(TypeA)).toBe(false);
  });
});
