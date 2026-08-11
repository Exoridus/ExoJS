// Root entry: pulls in the module augmentation that types `loader.load` for
// this package's asset type. Without it the augmentation is not in the program.
import '../src/index';

import type { Loader } from '@codexo/exojs';
import { TileMap,tilemapExtension } from '@codexo/exojs-tilemap';
import { describe, expect, it, vi } from 'vitest';

import { buildSnapshot } from '../../../src/extensions/snapshot';
import { tiledExtension } from '../src/tiledExtension';
import { TiledMap } from '../src/TiledMap';
import { tiledSourceBinding } from '../src/tiledSourceBinding';
import { tiledRuntimeMapBinding } from '../src/tiledRuntimeMapBinding';

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

  it('create() returns an object with a getIdentityKey function', () => {
    const handler = tiledSourceBinding.create(fakeLoader());
    expect(typeof handler.getIdentityKey).toBe('function');
  });
});

describe('tiledSourceBinding.getIdentityKey', () => {
  const handler = tiledSourceBinding.create(fakeLoader());

  it('includes source and format in the key', () => {
    expect(handler.getIdentityKey!({ source: 'world.tmj' })).toBe('world.tmj|tiled');
  });
});

describe('tiledRuntimeMapBinding and tiledSourceBinding identity keys', () => {
  it('produce the same key string for the same source (Loader namespaces them by type)', () => {
    const runtimeHandler = tiledRuntimeMapBinding.create(fakeLoader());
    const sourceHandler  = tiledSourceBinding.create(fakeLoader());
    // Both use the same discriminator; the Loader prepends distinct type IDs so
    // their cache keys are different even though this string matches.
    const req = { source: 'world.tmj' };
    expect(runtimeHandler.getIdentityKey!(req)).toBe(sourceHandler.getIdentityKey!(req));
  });
});

