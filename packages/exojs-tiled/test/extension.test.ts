import { beforeEach, describe, expect, it } from 'vitest';
import { ExtensionRegistry } from '@codexo/exojs/extensions';
import { tilemapExtension } from '@codexo/exojs-tilemap';
import { resetExtensionRegistryForTesting } from '../../../src/extensions/testing';
import { buildSnapshot } from '../../../src/extensions/snapshot';
import { tiledExtension } from '../src/tiledExtension';
import { tiledMapBinding } from '../src/tiledMapBinding';
import { TiledMap } from '../src/TiledMap';

describe('@codexo/exojs-tiled extension descriptor', () => {
  it('has correct id', () => {
    expect(tiledExtension.id).toBe('@codexo/exojs-tiled');
  });

  it('declares tilemapExtension as a dependency (same object reference)', () => {
    expect(tiledExtension.dependencies).toBeDefined();
    expect(tiledExtension.dependencies).toContain(tilemapExtension);
  });

  it('has exactly one asset binding', () => {
    expect(tiledExtension.assets).toBeDefined();
    expect(tiledExtension.assets!.length).toBe(1);
    expect(tiledExtension.assets![0]).toBe(tiledMapBinding);
  });

  it('asset binding targets TiledMap constructor', () => {
    expect(tiledMapBinding.type).toBe(TiledMap);
  });

  it('asset binding has typeNames ["tiledMap"]', () => {
    expect(tiledMapBinding.typeNames).toEqual(['tiledMap']);
  });

  it('asset binding does NOT claim file extensions (token-only; .tmj reserved for C2)', () => {
    expect((tiledMapBinding as { extensions?: unknown }).extensions).toBeUndefined();
  });

  it('buildSnapshot([tiledExtension]) materializes tilemapExtension before tiledExtension', () => {
    const snapshot = buildSnapshot([tiledExtension]);
    expect(snapshot.extensions.map(e => e.id)).toEqual(['@codexo/exojs-tilemap', '@codexo/exojs-tiled']);
  });

  it('buildSnapshot([tiledExtension]) collects exactly the tiledMap asset binding', () => {
    const snapshot = buildSnapshot([tiledExtension]);
    expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets[0]).toBe(tiledMapBinding);
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
