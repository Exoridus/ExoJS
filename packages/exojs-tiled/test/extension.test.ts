// Root entry: pulls in the module augmentation that types `loader.load` for
// this package's asset type. Without it the augmentation is not in the program.
import '../src/index';

import type { Loader } from '@codexo/exojs';
import { TileMap,tilemapExtension } from '@codexo/exojs-tilemap';
import { describe, expect, it, vi } from 'vitest';

import { buildSnapshot } from '../../../src/extensions/snapshot';
import { tiledExtension } from '../src/tiledExtension';
import { TiledMap } from '../src/TiledMap';
import { tiledRuntimeMapBinding } from '../src/tiledRuntimeMapBinding';
import { tiledSourceBinding } from '../src/tiledSourceBinding';

function fakeLoader(): Loader {
  return { load: vi.fn() } as unknown as Loader;
}

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
    expect(tiledExtension.assets![1]).toBe(tiledSourceBinding);
  });

  // ── tiledRuntimeMapBinding
  it('runtime binding targets TileMap constructor', () => {
    expect(tiledRuntimeMapBinding.ctor).toBe(TileMap);
  });

  it('runtime binding has typeNames ["tileMap"]', () => {
    expect(tiledRuntimeMapBinding.typeNames).toEqual(['tileMap']);
  });

  it('runtime binding claims the .tmj file extension', () => {
    expect((tiledRuntimeMapBinding as { extensions?: readonly string[] }).extensions).toEqual(['tmj']);
  });

  // ── tiledSourceBinding (advanced/source)
  it('source binding targets TiledMap constructor', () => {
    expect(tiledSourceBinding.ctor).toBe(TiledMap);
  });

  it('source binding has typeNames ["tiledSource"]', () => {
    expect(tiledSourceBinding.typeNames).toEqual(['tiledSource']);
  });

  it('source binding does NOT claim file extensions (token-only)', () => {
    expect((tiledSourceBinding as { extensions?: unknown }).extensions).toBeUndefined();
  });

  it('buildSnapshot([tiledExtension]) materializes tilemapExtension before tiledExtension', () => {
    const snapshot = buildSnapshot([tiledExtension]);
    expect(snapshot.extensions.map(e => e.id)).toEqual(['@codexo/exojs-tilemap', '@codexo/exojs-tiled']);
  });

  it('buildSnapshot([tiledExtension]) collects both asset bindings', () => {
    const snapshot = buildSnapshot([tiledExtension]);
    expect(snapshot.assets).toHaveLength(2);
    expect(snapshot.assets).toContain(tiledRuntimeMapBinding);
    expect(snapshot.assets).toContain(tiledSourceBinding);
  });

  it('buildSnapshot([tiledExtension]) pulls in the tilemap renderer binding (one-extension rendering)', () => {
    const snapshot = buildSnapshot([tiledExtension]);
    // The tilemap dependency contributes its tile chunk renderer binding, so a
    // Tiled-only setup can both load AND render without manual registration.
    expect(snapshot.renderers).toHaveLength(1);
  });
});

describe('@codexo/exojs-tiled asset handler — tiledSourceBinding', () => {
  it('create() returns an object with a load function', () => {
    const handler = tiledSourceBinding.create(fakeLoader());
    expect(typeof handler.load).toBe('function');
  });

  it('create() returns an object with a getIdentityDiscriminator function', () => {
    const handler = tiledSourceBinding.create(fakeLoader());
    expect(typeof handler.getIdentityDiscriminator).toBe('function');
  });
});

describe('tiledSourceBinding.getIdentityDiscriminator', () => {
  const handler = tiledSourceBinding.create(fakeLoader());

  it('contributes only the format — the loader owns type and locator', () => {
    expect(handler.getIdentityDiscriminator!({ source: 'world.tmj' })).toBe('tiled');
    expect(handler.getIdentityDiscriminator!({ source: 'other.tmj' })).toBe('tiled');
  });
});

describe('tiledRuntimeMapBinding and tiledSourceBinding discriminators', () => {
  it('agree on the format, and the loader keeps their keys apart by type', () => {
    const runtimeHandler = tiledRuntimeMapBinding.create(fakeLoader());
    const sourceHandler = tiledSourceBinding.create(fakeLoader());
    const req = { source: 'world.tmj' };

    expect(runtimeHandler.getIdentityDiscriminator!(req)).toBe(sourceHandler.getIdentityDiscriminator!(req));
  });
});

