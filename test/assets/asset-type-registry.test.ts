import { describe, expect, it, test, vi } from 'vitest';

import { AssetTypeRegistry } from '#assets/AssetTypeRegistry';

import { testAssetType } from './test-asset-type';

class TypeA {}
class TypeB {}

const adapter = (): never => ({ createPlaceholder: vi.fn(), stateOf: vi.fn(), begin: vi.fn(), fill: vi.fn(), fail: vi.fn(), evict: vi.fn() }) as never;

/** An installable type, with everything the individual test does not care about defaulted. */
function type(spec: {
  id: string;
  token?: object;
  extensions?: readonly string[];
  leaf?: unknown;
  destroy?: () => void;
  resourceIdentity?: (request: { source: string; options?: unknown }) => string;
}): ReturnType<typeof testAssetType> {
  return testAssetType<string, unknown>({
    id: spec.id,
    ...(spec.token !== undefined && { token: spec.token as never }),
    ...(spec.extensions !== undefined && { extensions: spec.extensions }),
    ...(spec.leaf !== undefined && { leaf: spec.leaf as never }),
    ...(spec.destroy !== undefined && { destroy: spec.destroy }),
    ...(spec.resourceIdentity !== undefined && { resourceIdentity: spec.resourceIdentity as never }),
    create: async source => source,
  });
}

describe('AssetTypeRegistry', () => {
  test('installs a type under its id, its token and every suffix it claims', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([type({ id: 'type-a', token: TypeA, extensions: ['ta'] })]);

    expect(registry.hasAssetType('type-a')).toBe(true);
    expect(registry.hasExtension('.ta')).toBe(true);
    expect(registry.hasLoadable(TypeA)).toBe(true);
    expect(registry.getInstalled(TypeA)).toBeDefined();
  });

  test('claimed suffixes, explicit overrides and lookups share one normalization rule', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([type({ id: 'json', token: TypeA, extensions: ['..MiXeD'] })]);

    expect(registry.hasExtension('.mixed')).toBe(true);
    expect(registry.resolveExtensionType('...MIXED')).toBe('json');

    registry.registerType('....mixed', 'text');
    expect(registry.resolveExtensionType('.mixed')).toBe('text');
  });

  test('a type that heals in place answers with its adapter; one that does not answers with nothing', () => {
    const registry = new AssetTypeRegistry();
    const seamless = adapter();

    registry.installAll([type({ id: 'seamless', token: TypeA, leaf: seamless }), type({ id: 'plain', token: TypeB })]);

    expect(registry.hasSeamlessAdapter(TypeA)).toBe(true);
    expect(registry.getSeamlessAdapter(TypeA)).toBe(seamless);
    expect(registry.hasSeamlessAdapter(TypeB)).toBe(false);
    expect(registry.getSeamlessAdapter(TypeB)).toBeUndefined();
  });

  test('installing a second type under an id already taken leaves the registry untouched', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([type({ id: 'type-a', token: TypeA })]);

    expect(() => registry.installAll([type({ id: 'type-a', token: TypeB, extensions: ['later'] })])).toThrow(/already installed/);
    expect(registry.hasLoadable(TypeB)).toBe(false);
    expect(registry.hasExtension('later')).toBe(false);
  });

  test('installing two types on one dispatch token is rejected before anything is written', () => {
    const registry = new AssetTypeRegistry();

    expect(() => registry.installAll([type({ id: 'first', token: TypeA }), type({ id: 'second', token: TypeA, extensions: ['later'] })])).toThrow(
      /another installed type already uses/,
    );
    expect(registry.hasAssetType('first')).toBe(false);
    expect(registry.hasExtension('later')).toBe(false);
  });

  test('a set that claims one suffix twice is rejected atomically', () => {
    const registry = new AssetTypeRegistry();

    expect(() =>
      registry.installAll([type({ id: 'json', token: TypeA, extensions: ['shared'] }), type({ id: 'text', token: TypeB, extensions: ['shared'] })]),
    ).toThrow(/already claimed by asset type/);
    expect(registry.hasAssetType('json')).toBe(false);
    expect(registry.hasLoadable(TypeB)).toBe(false);
  });

  test('one type declaring a suffix twice is rejected', () => {
    const registry = new AssetTypeRegistry();

    expect(() => registry.installAll([type({ id: 'json', token: TypeA, extensions: ['dup', 'DUP'] })])).toThrow(/declares the extension ".dup" twice/);
  });

  test('an id must be a non-empty string', () => {
    const registry = new AssetTypeRegistry();

    expect(() => registry.installAll([type({ id: '' })])).toThrow(/non-empty string id/);
  });

  test('_typeIdentity answers with the type id, so a key means the same thing across reloads', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([type({ id: 'com.example.world', token: TypeA }), type({ id: 'plain', token: TypeB })]);

    expect(registry._typeIdentity(TypeA)).toBe('com.example.world');
    expect(registry._typeIdentity(TypeB)).toBe('plain');
  });

  test('_typeIdentity fails loudly for a token no installed type dispatches on', () => {
    const registry = new AssetTypeRegistry();

    expect(() => registry._typeIdentity(TypeA)).toThrow(/No asset type is installed/);
  });

  test('_identityDiscriminator is undefined without a hook and forwards source + options with one', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([
      type({ id: 'plain', token: TypeB }),
      type({ id: 'discriminated', token: TypeA, resourceIdentity: request => String((request.options as { format?: string } | undefined)?.format) }),
    ]);

    expect(registry._identityDiscriminator(TypeB, 'a.png', { format: 'x' })).toBeUndefined();
    expect(registry._identityDiscriminator(TypeA, 'a.png', { format: 'x' })).toBe('x');
    expect(registry._identityDiscriminator(TypeA, 'a.png', { format: 'y' })).toBe('y');
  });

  test('_identityDiscriminator never walks options a type has not declared identity-relevant', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([
      type({ id: 'discriminated', token: TypeA, resourceIdentity: request => String((request.options as { format?: string } | undefined)?.format) }),
    ]);

    const hostile = {
      format: 'x',
      get unrelated(): never {
        throw new Error('must not be read during canonicalization');
      },
    };

    expect(() => registry._identityDiscriminator(TypeA, 'a.png', hostile)).not.toThrow();
  });

  test('_resolveTypeForPath matches the longest claimed dot-suffix first', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([type({ id: 'json', token: TypeA, extensions: ['json'] }), type({ id: 'text', token: TypeB, extensions: ['aseprite.json'] })]);

    expect(registry._resolveTypeForPath('hero.aseprite.json')).toBe('text');
    expect(registry._resolveTypeForPath('plain.json')).toBe('json');
    expect(registry._resolveTypeForPath('no-extension-match.xyz')).toBeUndefined();
  });

  test('a suffix nothing installed claims stays unresolved', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([type({ id: 'bound', token: TypeA })]);

    expect(registry.hasExtension('bnd')).toBe(false);
    expect(registry._resolveTypeForPath('thing.bnd')).toBeUndefined();
  });

  test('_describeType falls back to a placeholder name for an anonymous constructor', () => {
    const registry = new AssetTypeRegistry();
    const Anonymous = (() => class {})();

    expect(registry._describeType(Anonymous)).toBe('(anonymous type)');
    expect(registry._describeType(TypeA)).toBe('TypeA');
  });

  test('destroy() destroys every installed factory and forgets every type', () => {
    const registry = new AssetTypeRegistry();
    const destroy = vi.fn();

    registry.installAll([type({ id: 'destroyable', token: TypeA, destroy })]);
    registry.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);
    expect(registry.hasLoadable(TypeA)).toBe(false);
  });

  test('a type that brought no constructor is still reachable through its minted token', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([type({ id: 'anonymousType' })]);

    const token = registry.resolveTypeName('anonymousType')!;

    expect(registry.hasLoadable(token)).toBe(true);
    expect(registry._typeIdentity(token)).toBe('anonymousType');
    // The minted token carries the id as its name, so diagnostics can report it.
    expect(registry._describeType(token)).toBe('anonymousType');
  });
});

describe('AssetTypeRegistry.registerType', () => {
  it('an app-local override wins over the type that claimed the suffix', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([type({ id: 'json', token: TypeA, extensions: ['json'] })]);
    registry.registerType('json', 'text');

    expect(registry.resolveExtensionType('json')).toBe('text');
    expect(registry._resolveTypeForPath('data/level.json')).toBe('text');
  });

  it('falls back to the claiming type when no app override exists', () => {
    const registry = new AssetTypeRegistry();

    registry.installAll([type({ id: 'json', token: TypeA, extensions: ['json'] })]);

    expect(registry.resolveExtensionType('json')).toBe('json');
  });

  it('an override registered BEFORE the type installs still wins', () => {
    const registry = new AssetTypeRegistry();

    registry.registerType('ldtk', 'text');

    expect(() => registry.installAll([type({ id: 'json', token: TypeA, extensions: ['ldtk'] })])).not.toThrow();
    expect(registry.hasLoadable(TypeA)).toBe(true);
    expect(registry.hasExtension('ldtk')).toBe(true);
    expect(registry.resolveExtensionType('ldtk')).toBe('text');
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
