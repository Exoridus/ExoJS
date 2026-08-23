import { ChainShape, PhysicsWorld } from '@codexo/exojs-physics';
import type { TileCellSource } from '@codexo/exojs-tilemap';
import { describe, expect, it, vi } from 'vitest';

import { TileColliderStreamer } from '../src/TileColliderStreamer';
import { makeLayer, makeTileset, place, shape, TILE } from './helpers';

const world = (): PhysicsWorld => new PhysicsWorld({ gravity: { x: 0, y: 0 } });

/** Classify a fixed set of cells, counting how often the source is sampled. */
const countingSource = (
  claimed: ReadonlyMap<string, string>,
): { source: TileCellSource; samples: () => number } => {
  let samples = 0;

  return {
    source: (tx, ty) => {
      samples++;

      return claimed.get(`${tx},${ty}`) ?? null;
    },
    samples: () => samples,
  };
};

const cellMap = (entries: readonly (readonly [number, number, string])[]): Map<string, string> =>
  new Map(entries.map(([tx, ty, type]) => [`${tx},${ty}`, type]));

describe('TileColliderStreamer — cell source', () => {
  it('builds bodies for a bounded layer that has no placed tiles at all', () => {
    const layer = makeLayer(makeTileset({}), { width: 8, height: 8 });
    const physicsWorld = world();
    const streamer = new TileColliderStreamer(physicsWorld, layer, {
      cells: (tx, ty) => (tx < 2 && ty < 2 ? 'Solid' : null),
    });

    expect([...layer.loadedChunks()]).toHaveLength(0);

    streamer.sync();

    expect(streamer.bodyCount).toBe(1);

    const [body] = [...streamer.bodies()];

    expect(body?.colliders).toHaveLength(1);
    expect(body?.colliders[0]?.shape).toMatchObject({ width: 2 * TILE, height: 2 * TILE });
  });

  it('traces a cell-sourced region into chains in outline mode', () => {
    const layer = makeLayer(makeTileset({}), { width: 4, height: 4 });
    const streamer = new TileColliderStreamer(world(), layer, {
      regionMode: 'outline',
      cells: (tx, ty) => (tx < 2 && ty < 2 ? 'Solid' : null),
    });

    streamer.sync();

    const [body] = [...streamer.bodies()];

    expect(body?.colliders).toHaveLength(1);
    expect(body?.colliders[0]?.shape).toBeInstanceOf(ChainShape);
  });

  it('keeps distinct classifications distinguishable at the resolver boundary', () => {
    const layer = makeLayer(makeTileset({}), { width: 4, height: 4 });
    const seen: string[] = [];
    const streamer = new TileColliderStreamer(world(), layer, {
      cells: (tx, ty) => (ty !== 0 ? null : tx < 2 ? 'Solid' : 'Water'),
      material: context => {
        seen.push(context.type);

        return context.type === 'Water' ? { isSensor: true } : null;
      },
    });

    streamer.sync();

    const [body] = [...streamer.bodies()];

    expect(seen).toEqual(['Solid', 'Water']);
    expect(body?.colliders).toHaveLength(2);
    expect(body?.colliders.map(collider => collider.isSensor)).toEqual([false, true]);
  });

  it('rebuilds exactly the block a chunk appears in, keeping both sources', () => {
    const tileset = makeTileset({ 0: [shape({ type: 'Tile' })] });
    const layer = makeLayer(tileset, { width: 8, height: 8 });
    const counting = countingSource(cellMap([[0, 0, 'Solid'], [4, 0, 'Solid']]));
    const streamer = new TileColliderStreamer(world(), layer, { cells: counting.source });

    streamer.sync();

    expect(streamer.bodyCount).toBe(2);

    const afterFirst = counting.samples();

    place(layer, tileset, 1, 1);
    streamer.sync();

    // One 4x4 block re-walked, and only that one.
    expect(counting.samples()).toBe(afterFirst + 16);
    expect(streamer.bodyCount).toBe(2);

    const [body] = [...streamer.bodies()];

    expect(body?.colliders).toHaveLength(2);
  });

  it('keeps a cell-only body when the chunk backing its block disappears', () => {
    const tileset = makeTileset({ 0: [shape({ type: 'Tile' })] });
    const layer = makeLayer(tileset, { width: 4, height: 4 });
    const streamer = new TileColliderStreamer(world(), layer, {
      cells: (tx, ty) => (tx === 0 && ty === 0 ? 'Solid' : null),
    });

    place(layer, tileset, 2, 2);
    streamer.sync();

    expect([...streamer.bodies()][0]?.colliders).toHaveLength(2);

    layer._evictChunk(0, 0);
    streamer.sync();

    expect(streamer.bodyCount).toBe(1);
    expect([...streamer.bodies()][0]?.colliders).toHaveLength(1);
  });

  it('does not sample an empty block again when an unrelated block changes', () => {
    const tileset = makeTileset({ 0: [shape({ type: 'Tile' })] });
    const layer = makeLayer(tileset, { width: 8, height: 8 });
    const counting = countingSource(cellMap([[0, 0, 'Solid']]));
    const streamer = new TileColliderStreamer(world(), layer, { cells: counting.source });

    streamer.sync();

    // Four 4x4 blocks on the first pass, of which three produce nothing.
    expect(counting.samples()).toBe(64);
    expect(streamer.bodyCount).toBe(1);

    place(layer, tileset, 5, 5);
    streamer.sync();

    expect(counting.samples()).toBe(64 + 16);
    expect(streamer.bodyCount).toBe(2);

    streamer.sync();

    expect(counting.samples()).toBe(64 + 16);
  });

  it('leaves an unbounded layer to its resident chunks', () => {
    const tileset = makeTileset({ 0: [shape({ type: 'Tile' })] });
    const layer = makeLayer(tileset);
    const sample = vi.fn<TileCellSource>(() => 'Solid');
    const streamer = new TileColliderStreamer(world(), layer, { cells: sample });

    streamer.sync();

    expect(sample).not.toHaveBeenCalled();
    expect(streamer.bodyCount).toBe(0);

    place(layer, tileset, 0, 0);
    streamer.sync();

    expect(streamer.bodyCount).toBe(1);
  });

  it('destroys cell-only bodies on destroy()', () => {
    const layer = makeLayer(makeTileset({}), { width: 4, height: 4 });
    const physicsWorld = world();
    const streamer = new TileColliderStreamer(physicsWorld, layer, { cells: () => 'Solid' });

    streamer.sync();

    expect(streamer.bodyCount).toBe(1);

    streamer.destroy();

    expect(streamer.bodyCount).toBe(0);
    expect(physicsWorld.bodies).toHaveLength(0);
  });

  it('never samples a cell source that was not passed', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset, { width: 4, height: 4 });
    const streamer = new TileColliderStreamer(world(), layer);

    place(layer, tileset, 0, 0);
    streamer.sync();

    expect(streamer.bodyCount).toBe(1);
  });
});
