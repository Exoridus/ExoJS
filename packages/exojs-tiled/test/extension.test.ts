// Root entry: pulls in the module augmentation that types `loader.load` for
// this package's asset type. Without it the augmentation is not in the program.
import '../src/index';

import { TileMap, tilemapExtension } from '@codexo/exojs-tilemap';
import { describe, expect, it } from 'vitest';

import { buildSnapshot } from '../../../src/extensions/snapshot';
import { tiledExtension } from '../src/tiledExtension';
import { TiledMap } from '../src/TiledMap';
import { tiledSourceType } from '../src/tiledSourceType';
import { tileMapType } from '../src/tileMapType';

describe('@codexo/exojs-tiled extension descriptor', () => {
  it('has correct id', () => {
    expect(tiledExtension.id).toBe('@codexo/exojs-tiled');
  });

  it('declares tilemapExtension as a dependency (same object reference)', () => {
    expect(tiledExtension.dependencies).toBeDefined();
    expect(tiledExtension.dependencies).toContain(tilemapExtension);
  });

  it('installs exactly two asset types', () => {
    expect(tiledExtension.assets).toBeDefined();
    expect(tiledExtension.assets!.length).toBe(2);
  });

  it('the runtime type (TileMap) is listed first', () => {
    expect(tiledExtension.assets![0]).toBe(tileMapType);
  });

  it('the source type (TiledMap) is listed second', () => {
    expect(tiledExtension.assets![1]).toBe(tiledSourceType);
  });

  it('the runtime type dispatches on the TileMap constructor and claims .tmj', () => {
    expect(tileMapType._token).toBe(TileMap);
    expect(tileMapType.id).toBe('tileMap');
    expect(tileMapType.extensions).toEqual(['tmj']);
  });

  it('the source type dispatches on the TiledMap constructor and claims no suffix', () => {
    expect(tiledSourceType._token).toBe(TiledMap);
    expect(tiledSourceType.id).toBe('tiledSource');
    expect(tiledSourceType.extensions).toEqual([]);
  });

  it('buildSnapshot([tiledExtension]) materializes tilemapExtension before tiledExtension', () => {
    const snapshot = buildSnapshot([tiledExtension]);

    expect(snapshot.extensions.map(e => e.id)).toEqual(['@codexo/exojs-tilemap', '@codexo/exojs-tiled']);
  });

  it('buildSnapshot([tiledExtension]) collects both asset types', () => {
    const snapshot = buildSnapshot([tiledExtension]);

    expect(snapshot.assets).toHaveLength(2);
    expect(snapshot.assets).toContain(tileMapType);
    expect(snapshot.assets).toContain(tiledSourceType);
  });

  it('buildSnapshot([tiledExtension]) pulls in the tilemap renderer binding (one-extension rendering)', () => {
    const snapshot = buildSnapshot([tiledExtension]);

    // The tilemap dependency contributes its tile chunk renderer binding, so a
    // Tiled-only setup can both load AND render without manual registration.
    expect(snapshot.renderers).toHaveLength(1);
  });
});

describe('the two Tiled types agree on the format they discriminate by', () => {
  it('contributes only the format - the loader owns type and locator', () => {
    expect(tiledSourceType.resourceIdentity!({ source: 'world.tmj' })).toBe('tiled');
    expect(tiledSourceType.resourceIdentity!({ source: 'other.tmj' })).toBe('tiled');
  });

  it('the runtime type and the source type answer the same, and the loader keeps their keys apart by id', () => {
    const request = { source: 'world.tmj' };

    expect(tileMapType.resourceIdentity!(request)).toBe(tiledSourceType.resourceIdentity!(request));
    expect(tileMapType.id).not.toBe(tiledSourceType.id);
  });
});
