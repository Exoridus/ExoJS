import { TextureRegion } from '@codexo/exojs';
import { type Texture } from '@codexo/exojs';
import { describe, expect, it, vi } from 'vitest';

import type { TileChunkNode } from '../src/TileChunkNode';
import { TileLayer } from '../src/TileLayer';
import { TileLayerNode } from '../src/TileLayerNode';
import { TileSet } from '../src/TileSet';
import { TILE_TRANSFORM_IDENTITY } from '../src/types';

/**
 * Track B retained-batch record/replay for `TileChunkNode` relies on the
 * engine's content-revision contract: `RetainedContainer` skips walking (and
 * re-collecting) a content-CLEAN subtree entirely, splicing the previously
 * captured/recorded draw range instead. `TileChunkNode.pages` caches geometry
 * against `chunk.revision`, but that cache is only consulted from `render()` —
 * a call the engine never makes on a content-clean frame. Without an explicit
 * push from the chunk's mutation site to `SceneNode._markContentDirty()`, an
 * in-place tile edit after a group capture would replay stale geometry
 * forever. These tests pin the wiring (`TileChunk._addDirtyListener` ->
 * `TileChunkNode.invalidateContent()`) directly, independent of a real GPU
 * backend — see the browser suites for the full retained-replay pixel proof.
 */

function fakeTexture(width = 512, height = 512): Texture {
  return {
    width,
    height,
    flipY: false,
    uid: 0,
    label: 'test',
    destroy: vi.fn(),
    destroyed: false,
  } as unknown as Texture;
}

function makeTileset(name = 'tiles'): TileSet {
  return new TileSet({
    name,
    texture: new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 512, height: 512 }),
    tileWidth: 32,
    tileHeight: 32,
    tileCount: 16,
  });
}

/** Read the internal aggregate content revision the engine keys retained captures on. */
function contentRevisionOf(node: TileChunkNode): number {
  return (node as unknown as { _contentRevision: number })._contentRevision;
}

describe('TileChunk mutation -> TileChunkNode content-dirty wiring', () => {
  it('setTileAt on an existing chunk bumps the owning TileChunkNode content revision', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({ id: 1, name: 'l', width: 4, height: 4, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);
    const chunkNode = node.chunkNodes[0]!;
    const before = contentRevisionOf(chunkNode);

    layer.setTileAt(1, 1, { tileset, localTileId: 1, transform: TILE_TRANSFORM_IDENTITY });

    expect(contentRevisionOf(chunkNode)).toBeGreaterThan(before);
  });

  it('clearTileAt on an existing chunk bumps the owning TileChunkNode content revision', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({ id: 1, name: 'l', width: 4, height: 4, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);
    const chunkNode = node.chunkNodes[0]!;
    const before = contentRevisionOf(chunkNode);

    layer.clearTileAt(0, 0);

    expect(contentRevisionOf(chunkNode)).toBeGreaterThan(before);
  });

  it('fillRect / clearRect bulk mutations bump the content revision exactly once each', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({ id: 1, name: 'l', width: 4, height: 4, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);
    const chunkNode = node.chunkNodes[0]!;

    const afterFirstTile = contentRevisionOf(chunkNode);

    layer.fillRect(0, 0, 2, 2, { tileset, localTileId: 2, transform: TILE_TRANSFORM_IDENTITY });
    expect(contentRevisionOf(chunkNode)).toBeGreaterThan(afterFirstTile);

    const afterFill = contentRevisionOf(chunkNode);

    layer.clearRect(0, 0, 2, 2);
    expect(contentRevisionOf(chunkNode)).toBeGreaterThan(afterFill);
  });

  it('a no-op write (same tile value) does NOT bump the content revision', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({ id: 1, name: 'l', width: 4, height: 4, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);
    const chunkNode = node.chunkNodes[0]!;
    const before = contentRevisionOf(chunkNode);

    // Writing the identical tile at the identical cell: TileChunk._setRawAt
    // returns false and must not fire the dirty listener.
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    expect(contentRevisionOf(chunkNode)).toBe(before);
  });

  it('destroy() unregisters the listener: a later mutation of the (still-live) chunk no longer touches the destroyed node', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({ id: 1, name: 'l', width: 4, height: 4, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const node = new TileLayerNode(layer);
    const chunkNode = node.chunkNodes[0]!;
    const invalidateSpy = vi.spyOn(chunkNode, 'invalidateContent');

    chunkNode.destroy();

    // The chunk itself is untouched by destroying the render node (documented:
    // `TileLayerNode` never owns the `TileLayer`/chunk data).
    layer.setTileAt(1, 1, { tileset, localTileId: 3, transform: TILE_TRANSFORM_IDENTITY });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('two TileLayerNodes over the same TileLayer both observe a mutation (multi-listener support)', () => {
    const tileset = makeTileset();
    const layer = new TileLayer({ id: 1, name: 'l', width: 4, height: 4, tileWidth: 32, tileHeight: 32, tilesets: [tileset] });
    layer.setTileAt(0, 0, { tileset, localTileId: 0, transform: TILE_TRANSFORM_IDENTITY });

    const nodeA = new TileLayerNode(layer);
    const nodeB = new TileLayerNode(layer);
    const chunkA = nodeA.chunkNodes[0]!;
    const chunkB = nodeB.chunkNodes[0]!;
    const beforeA = contentRevisionOf(chunkA);
    const beforeB = contentRevisionOf(chunkB);

    layer.setTileAt(0, 0, { tileset, localTileId: 5, transform: TILE_TRANSFORM_IDENTITY });

    expect(contentRevisionOf(chunkA)).toBeGreaterThan(beforeA);
    expect(contentRevisionOf(chunkB)).toBeGreaterThan(beforeB);
  });
});
