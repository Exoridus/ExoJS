import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AssetBinding, AssetHandler, AssetLoadRequest } from '#extensions/Extension';
import { materializeAssetBindings } from '#extensions/materialize';
import { resetExtensionRegistryForTesting } from '#extensions/testing';
import { Asset } from '#resources/Asset';
import type { AssetLoaderContext } from '#resources/Loader';
import { Loader } from '#resources/Loader';

// Minimal test asset types
class TypeA {}
class TypeB {}
class TypeC {}

declare module '#resources/AssetDefinitions' {
  interface AssetDefinitions {
    withOpts: { resource: unknown; config: { source: string; family?: string; size?: number } };
    noOpts: { resource: unknown; config: { source: string } };
    testType: { resource: unknown; config: { source: string } };
  }
}

function createTestHandler(): AssetHandler {
  return {
    load: vi.fn(async (_req: AssetLoadRequest, _ctx: AssetLoaderContext) => ({})),
    destroy: vi.fn(),
  };
}

describe('materializeAssetBindings', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('creates one handler per Loader per Binding', () => {
    const handler = createTestHandler();
    const createFn = vi.fn(() => handler);
    const binding: AssetBinding = { type: TypeA as never, create: createFn };
    const loader = new Loader();

    materializeAssetBindings(loader, [binding]);

    expect(createFn).toHaveBeenCalledTimes(1);
    expect(createFn).toHaveBeenCalledWith(loader);
    loader.destroy();
  });

  it('multiple Applications receive distinct handlers', () => {
    const handler1 = createTestHandler();
    const handler2 = createTestHandler();
    let callCount = 0;
    const createFn = vi.fn(() => (callCount++ === 0 ? handler1 : handler2));
    const binding: AssetBinding = { type: TypeA as never, create: createFn };

    const loaderA = new Loader();
    const loaderB = new Loader();
    materializeAssetBindings(loaderA, [binding]);
    materializeAssetBindings(loaderB, [binding]);

    expect(createFn).toHaveBeenCalledTimes(2);
    loaderA.destroy();
    loaderB.destroy();
  });

  it('loader.hasLoadable returns true after bindAsset', () => {
    const handler = createTestHandler();
    const binding: AssetBinding = { type: TypeA as never, create: () => handler };
    const loader = new Loader();

    materializeAssetBindings(loader, [binding]);

    expect(loader.hasLoadable(TypeA as never)).toBe(true);
    loader.destroy();
  });

  it('duplicate type key throws before any mutation', () => {
    const bindingA: AssetBinding = { type: TypeA as never, create: () => createTestHandler() };
    const bindingB: AssetBinding = { type: TypeA as never, create: () => createTestHandler() };
    const loader = new Loader();

    expect(() => materializeAssetBindings(loader, [bindingA, bindingB])).toThrow('An asset handler is already registered for TypeA');
    // Verify no partial mutation
    expect(loader.hasLoadable(TypeA as never)).toBe(false);
    loader.destroy();
  });

  it('duplicate typeName throws before any mutation', () => {
    const bindingA: AssetBinding = { type: TypeA as never, typeNames: ['myType'], create: () => createTestHandler() };
    const bindingB: AssetBinding = { type: TypeB as never, typeNames: ['myType'], create: () => createTestHandler() };
    const loader = new Loader();

    expect(() => materializeAssetBindings(loader, [bindingA, bindingB])).toThrow('Asset type name "myType" is already registered');
    loader.destroy();
  });

  it('extension handler receives per-load options nested under request.options', async () => {
    // Regression: the loader builds a flat internal config `{ source, ...fields }`,
    // but the public AssetLoadRequest is `{ source, options? }`. The bindAsset
    // wrapper must reshape it so handlers (e.g. the core FontAsset adapter) see
    // their options. A flat config would leave `request.options` undefined.
    let seen: AssetLoadRequest | undefined;
    const handler: AssetHandler = {
      load: async (req: AssetLoadRequest) => {
        seen = req;
        return {};
      },
    };
    const binding: AssetBinding = { type: TypeA as never, typeNames: ['withOpts'], create: () => handler };
    const loader = new Loader();
    materializeAssetBindings(loader, [binding]);

    await loader.load(new Asset({ type: 'withOpts', source: 'thing.dat', family: 'Kenney Future', size: 32 })).catch(() => undefined);

    expect(seen?.source).toBe('thing.dat');
    expect(seen?.options).toEqual({ family: 'Kenney Future', size: 32 });
    loader.destroy();
  });

  it('extension handler receives no options key when none are passed', async () => {
    let seen: AssetLoadRequest | undefined;
    const handler: AssetHandler = {
      load: async (req: AssetLoadRequest) => {
        seen = req;
        return {};
      },
    };
    const binding: AssetBinding = { type: TypeA as never, typeNames: ['noOpts'], create: () => handler };
    const loader = new Loader();
    materializeAssetBindings(loader, [binding]);

    await loader.load(new Asset({ type: 'noOpts', source: 'thing.dat' })).catch(() => undefined);

    expect(seen?.source).toBe('thing.dat');
    expect(seen?.options).toBeUndefined();
    loader.destroy();
  });

  it('multiple typeNames on a single binding all register', () => {
    const handler = createTestHandler();
    const binding: AssetBinding = { type: TypeA as never, typeNames: ['alpha', 'beta'], create: () => handler };
    const loader = new Loader();

    materializeAssetBindings(loader, [binding]);

    expect(loader.hasAssetType('alpha')).toBe(true);
    expect(loader.hasAssetType('beta')).toBe(true);
    loader.destroy();
  });

  it('a typeName conflict across the two names of one binding is detected', () => {
    const bindingA: AssetBinding = { type: TypeA as never, typeNames: ['shared'], create: () => createTestHandler() };
    const bindingB: AssetBinding = { type: TypeB as never, typeNames: ['other', 'shared'], create: () => createTestHandler() };
    const loader = new Loader();

    expect(() => materializeAssetBindings(loader, [bindingA, bindingB])).toThrow('Asset type name "shared" is already registered');
    // No partial mutation from bindingB
    expect(loader.hasAssetType('other')).toBe(false);
    loader.destroy();
  });

  it('duplicate extension key throws before any mutation', () => {
    const bindingA: AssetBinding = { type: TypeA as never, extensions: ['tmj'], create: () => createTestHandler() };
    const bindingB: AssetBinding = { type: TypeB as never, extensions: ['tmj'], create: () => createTestHandler() };
    const loader = new Loader();

    expect(() => materializeAssetBindings(loader, [bindingA, bindingB])).toThrow('File extension ".tmj" is already mapped');
    loader.destroy();
  });

  it('extension keys are normalised (dot stripped, lowercased)', () => {
    const handler = createTestHandler();
    const binding: AssetBinding = { type: TypeA as never, extensions: ['.TMJ', '.PNG'], create: () => handler };
    const loader = new Loader();

    materializeAssetBindings(loader, [binding]);

    expect(loader.hasExtension('tmj')).toBe(true);
    expect(loader.hasExtension('png')).toBe(true);
    expect(loader.hasExtension('.TMJ')).toBe(true);
    loader.destroy();
  });

  it('typeName registers hasAssetType', () => {
    const handler = createTestHandler();
    const binding: AssetBinding = { type: TypeA as never, typeNames: ['typeAlpha'], create: () => handler };
    const loader = new Loader();

    materializeAssetBindings(loader, [binding]);

    expect(loader.hasAssetType('typeAlpha')).toBe(true);
    loader.destroy();
  });

  it('handler.destroy() is called on loader.destroy()', () => {
    const handler = createTestHandler();
    const binding: AssetBinding = { type: TypeA as never, create: () => handler };
    const loader = new Loader();

    materializeAssetBindings(loader, [binding]);
    loader.destroy();

    expect(handler.destroy).toHaveBeenCalledTimes(1);
  });

  it('handler.destroy() is called at most once even with multi-target sharing', () => {
    const handler = createTestHandler();
    const loader = new Loader();

    loader.bindAsset({ type: TypeA as never }, handler);
    loader.destroy();

    expect(handler.destroy).toHaveBeenCalledTimes(1);
  });

  it('ExtensionRegistry is NOT read during load', async () => {
    const { ExtensionRegistry } = await import('#extensions/ExtensionRegistry');
    const handler = createTestHandler();
    const binding: AssetBinding = {
      type: TypeA as never,
      typeNames: ['testType'],
      extensions: ['tstx'],
      create: () => handler,
    };
    const loader = new Loader();
    materializeAssetBindings(loader, [binding]);

    const listSpy = vi.spyOn(ExtensionRegistry, 'list');
    const getSpy = vi.spyOn(ExtensionRegistry, 'get');
    const hasSpy = vi.spyOn(ExtensionRegistry, 'has');

    // Load via the config (typeName) path
    await loader.load(new Asset({ type: 'testType', source: 'test.tstx' })).catch(() => {
      // ignore load error (no actual fetch)
    });

    expect(listSpy).not.toHaveBeenCalled();
    expect(getSpy).not.toHaveBeenCalled();
    expect(hasSpy).not.toHaveBeenCalled();

    listSpy.mockRestore();
    getSpy.mockRestore();
    hasSpy.mockRestore();
    loader.destroy();
  });
});
