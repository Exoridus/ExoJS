import { beforeEach, describe, expect, it } from 'vitest';
import { ExtensionRegistry } from '@codexo/exojs/extensions';
import { tilemapExtension, TileMap } from '@codexo/exojs-tilemap';
import { resetExtensionRegistryForTesting } from '../../../src/extensions/testing';
import { buildSnapshot } from '../../../src/extensions/snapshot';
import { tiledExtension } from '../src/tiledExtension';
import { tiledMapBinding } from '../src/tiledMapBinding';
import { tiledRuntimeMapBinding } from '../src/tiledRuntimeMapBinding';
import { TiledMap } from '../src/TiledMap';

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

  it('buildSnapshot has no renderer bindings (rendering not yet implemented)', () => {
    const snapshot = buildSnapshot([tiledExtension]);
    expect(snapshot.renderers).toHaveLength(0);
  });
});

describe('@codexo/exojs-tiled asset handler', () => {
  it('create() returns an object with a load function', () => {
    const handler = tiledMapBinding.create();
    expect(typeof handler.load).toBe('function');
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
