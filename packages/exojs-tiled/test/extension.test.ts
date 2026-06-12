import { ExtensionRegistry } from '@codexo/exojs/extensions';
import { TileMap,tilemapExtension } from '@codexo/exojs-tilemap';
import { beforeEach, describe, expect, it } from 'vitest';

import { buildSnapshot } from '../../../src/extensions/snapshot';
import { resetExtensionRegistryForTesting } from '../../../src/extensions/testing';
import { tiledExtension } from '../src/tiledExtension';
import { TiledMap } from '../src/TiledMap';
import { tiledMapBinding } from '../src/tiledMapBinding';
import { tiledRuntimeMapBinding } from '../src/tiledRuntimeMapBinding';

describe('@codexo/exojs-tiled extension descriptor', () => {
  it('has correct id', () => {
    expect(tiledExtension.id).toBe('@codexo/exojs-tiled');
  });

  it('declares tilemapExtension as a dependency (same object reference)', () => {
    expect(tiledExtension.dependencies).toBeDefined();
    expect(tiledExtension.dependencies).toContain(tilemapExtension);
  });

  it('has exactly two asset bindings', () => {
    expect(tiledExtension.assets).toBeDefined();
    expect(tiledExtension.assets!.length).toBe(2);
  });

  it('runtime binding (TileMap) is listed first', () => {
    expect(tiledExtension.assets![0]).toBe(tiledRuntimeMapBinding);
  });

  it('source binding (TiledMap) is listed second', () => {
    expect(tiledExtension.assets![1]).toBe(tiledMapBinding);
  });

  // ── tiledRuntimeMapBinding
  it('runtime binding targets TileMap constructor', () => {
    expect(tiledRuntimeMapBinding.type).toBe(TileMap);
  });

  it('runtime binding has typeNames ["tileMap"]', () => {
    expect(tiledRuntimeMapBinding.typeNames).toEqual(['tileMap']);
  });

  it('runtime binding claims the .tmj file extension', () => {
    expect((tiledRuntimeMapBinding as { extensions?: string[] }).extensions).toEqual(['tmj']);
  });

  // ── tiledMapBinding (advanced/source)
  it('source binding targets TiledMap constructor', () => {
    expect(tiledMapBinding.type).toBe(TiledMap);
  });

  it('source binding has typeNames ["tiledMap"]', () => {
    expect(tiledMapBinding.typeNames).toEqual(['tiledMap']);
  });

  it('source binding does NOT claim file extensions (token-only)', () => {
    expect((tiledMapBinding as { extensions?: unknown }).extensions).toBeUndefined();
  });

  it('buildSnapshot([tiledExtension]) materializes tilemapExtension before tiledExtension', () => {
    const snapshot = buildSnapshot([tiledExtension]);
    expect(snapshot.extensions.map(e => e.id)).toEqual(['@codexo/exojs-tilemap', '@codexo/exojs-tiled']);
  });

  it('buildSnapshot([tiledExtension]) collects both asset bindings', () => {
    const snapshot = buildSnapshot([tiledExtension]);
    expect(snapshot.assets).toHaveLength(2);
    expect(snapshot.assets).toContain(tiledRuntimeMapBinding);
    expect(snapshot.assets).toContain(tiledMapBinding);
  });

  it('buildSnapshot([tiledExtension]) pulls in the tilemap renderer binding (one-extension rendering)', () => {
    const snapshot = buildSnapshot([tiledExtension]);
    // The tilemap dependency contributes its tile chunk renderer binding, so a
    // Tiled-only setup can both load AND render without manual registration.
    expect(snapshot.renderers).toHaveLength(1);
  });
});

describe('@codexo/exojs-tiled asset handler — tiledMapBinding', () => {
  it('create() returns an object with a load function', () => {
    const handler = tiledMapBinding.create();
    expect(typeof handler.load).toBe('function');
  });

  it('create() returns an object with a getIdentityKey function', () => {
    const handler = tiledMapBinding.create();
    expect(typeof handler.getIdentityKey).toBe('function');
  });
});

describe('tiledMapBinding.getIdentityKey', () => {
  const handler = tiledMapBinding.create();

  it('includes source and format in the key', () => {
    expect(handler.getIdentityKey!({ source: 'world.tmj' })).toBe('world.tmj|tiled');
  });
});

describe('tiledRuntimeMapBinding and tiledMapBinding identity keys', () => {
  it('produce the same key string for the same source (Loader namespaces them by type)', () => {
    const runtimeHandler = tiledRuntimeMapBinding.create();
    const sourceHandler  = tiledMapBinding.create();
    // Both use the same discriminator; the Loader prepends distinct type IDs so
    // their cache keys are different even though this string matches.
    const req = { source: 'world.tmj' };
    expect(runtimeHandler.getIdentityKey!(req)).toBe(sourceHandler.getIdentityKey!(req));
  });
});

describe('@codexo/exojs-tiled root entry (side-effect-free)', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('root import does NOT register tiledExtension in ExtensionRegistry', () => {
    expect(ExtensionRegistry.has('@codexo/exojs-tiled')).toBe(false);
  });
});

describe('@codexo/exojs-tiled/register entry', () => {
  beforeEach(() => {
    resetExtensionRegistryForTesting();
  });

  it('registers tiledExtension on import', async () => {
    await import('../src/register');
    expect(ExtensionRegistry.has('@codexo/exojs-tiled')).toBe(true);
  });
});

describe('export parity', () => {
  it('root and register have the same named exports', async () => {
    const root = await import('../src/index');
    const register = await import('../src/register');
    const rootKeys = Object.keys(root).filter(k => k !== 'default').sort();
    const registerKeys = Object.keys(register).filter(k => k !== 'default').sort();
    expect(rootKeys).toEqual(registerKeys);
  });
});
