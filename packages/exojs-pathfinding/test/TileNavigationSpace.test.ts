import { logger, type Texture, TextureRegion, Vector } from '@codexo/exojs';
import { packTile, type ResolvedTile, TILE_TRANSFORM_IDENTITY, TileLayer, TileProjection, TileSet } from '@codexo/exojs/tilemap';
import { describe, expect, expectTypeOf, it, vi } from 'vitest';

import { Pathfinder } from '../src/Pathfinder';
import { type TileNavigationChunk, type TileNavigationSource, TileNavigationSpace } from '../src/tilemap/TileNavigationSpace';
import type { NavigationSpace } from '../src/types';

const FLOOR = 0;
const WALL = 1;
const WATER = 2;

const fakeTexture = (): Texture =>
  ({ width: 128, height: 128, uid: 0, label: 'test', destroy: () => {}, destroyed: false }) as unknown as Texture;

const tileset = new TileSet({
  name: 'test',
  texture: new TextureRegion(fakeTexture(), { x: 0, y: 0, width: 128, height: 128 }),
  tileWidth: 16,
  tileHeight: 16,
  tileCount: 4,
});

const tile = (localTileId: number): ResolvedTile => ({ tileset, localTileId, transform: TILE_TRANSFORM_IDENTITY });

const cost = (resolved: ResolvedTile | null): number => {
  if (resolved === null || resolved.localTileId === WALL) {
    return 0;
  }

  return resolved.localTileId === WATER ? 5 : 1;
};

/** Fills a layer from rows of `.` floor, `#` wall and `~` water. */
const paint = (layer: TileLayer, rows: readonly string[], originX = 0, originY = 0): void => {
  rows.forEach((row, y) => {
    [...row].forEach((cell, x) => {
      layer.setTileAt(originX + x, originY + y, tile(cell === '#' ? WALL : cell === '~' ? WATER : FLOOR));
    });
  });
};

const layerOf = (rows: readonly string[], options: Partial<ConstructorParameters<typeof TileLayer>[0]> = {}): TileLayer => {
  const layer = new TileLayer({
    id: 1,
    name: 'ground',
    width: rows[0]!.length,
    height: rows.length,
    tileWidth: 16,
    tileHeight: 16,
    chunkWidth: 4,
    chunkHeight: 4,
    tilesets: [tileset],
    ...options,
  });

  paint(layer, rows);

  return layer;
};

const ARENA = ['........', '...#....', '...#....', '...#....', '...#....', '........'];

/** A chunk payload as a chunk streamer installs it. */
const payload = (id: number) => ({ width: 4, height: 4, tiles: new Uint32Array(16).fill(packTile(0, id, TILE_TRANSFORM_IDENTITY)) });

describe('TileNavigationSpace', () => {
  it('navigates a real TileLayer with a typed cost callback', () => {
    const layer = layerOf(ARENA);
    const navigation = new TileNavigationSpace(layer, {
      cost: resolved => {
        expectTypeOf(resolved).toEqualTypeOf<ResolvedTile | null>();

        if (resolved === null) {
          return 0;
        }

        const definition = resolved.tileset.getTileDefinition(resolved.localTileId);

        return definition?.collision ? 0 : cost(resolved);
      },
    });

    expectTypeOf(navigation).toMatchTypeOf<NavigationSpace>();
    expect([navigation.width, navigation.height, navigation.cellSize]).toEqual([8, 6, 16]);
    expect(navigation.costAt(3, 2)).toBe(0);
    expect(navigation.costAt(2, 2)).toBe(1);

    const route = new Pathfinder().findPathBetween(navigation, 8, 40, 88, 40);

    expect(route.status).toBe('found');
    expect(route.nodes.every(node => navigation.isWalkable(navigation.nodeX(node), navigation.nodeY(node)))).toBe(true);
    expect(route.points[0]).toEqual(new Vector(8, 40));
    expect(route.points.at(-1)).toEqual(new Vector(88, 40));
  });

  it('accepts an independently written structural source', () => {
    const cells = new Map<string, 'rock' | 'sand'>([['1,0', 'rock']]);
    const source: TileNavigationSource<'rock' | 'sand'> = {
      revision: 0,
      width: 3,
      height: 1,
      tileWidth: 2,
      tileHeight: 2,
      getTileAt: (x, y) => cells.get(`${x},${y}`) ?? 'sand',
    };
    const navigation = new TileNavigationSpace(source, { cost: kind => (kind === 'rock' ? 3 : 1) });

    expect([navigation.costAt(0, 0), navigation.costAt(1, 0), navigation.costAt(2, 0)]).toEqual([1, 3, 1]);
    expect(new Pathfinder().findPathBetween(navigation, 1, 1, 5, 1).cost).toBe(4);
  });

  it('does no work while the source is unchanged', () => {
    const layer = layerOf(ARENA);
    let calls = 0;
    const navigation = new TileNavigationSpace(layer, { cost: resolved => (calls++, cost(resolved)) });

    expect(calls).toBe(48);

    const revision = navigation.revision;

    for (let i = 0; i < 10; i++) {
      expect(navigation.sync()).toBe(false);
      expect(navigation.revision).toBe(revision);
      expect(navigation.nodeCapacity).toBe(48);
    }

    expect(calls).toBe(48);
  });

  it('follows cell edits, resampling only the edited chunk', () => {
    const layer = layerOf(ARENA);
    let calls = 0;
    const navigation = new TileNavigationSpace(layer, { cost: resolved => (calls++, cost(resolved)) });
    const pathfinder = new Pathfinder();
    const before = pathfinder.findPathBetween(navigation, 8, 40, 88, 40);
    const revision = navigation.revision;

    calls = 0;
    layer.setTileAt(3, 5, tile(WALL));
    layer.setTileAt(3, 0, tile(WALL));

    // Chunk (0, 0) holds 16 cells; the edge chunk (0, 1) only the 8 of rows 4 and 5.
    expect(navigation.revision).toBeGreaterThan(revision);
    expect(calls).toBe(24);
    expect(before.revision).not.toBe(navigation.revision);
    expect(pathfinder.findPathBetween(navigation, 8, 40, 88, 40).status).toBe('unreachable');
  });

  it('keeps its revision when an edit changes no cost', () => {
    const layer = layerOf(ARENA);
    const navigation = new TileNavigationSpace(layer, { cost: resolved => (resolved === null || resolved.localTileId === WALL ? 0 : 1) });
    const revision = navigation.revision;

    // Floor to water: a different tile, but the same cost under this policy.
    layer.setTileAt(0, 0, tile(WATER));

    expect(navigation.sync()).toBe(false);
    expect(navigation.revision).toBe(revision);
  });

  it('follows chunk loading and eviction on an unbounded, streamed layer', () => {
    const layer = new TileLayer({
      id: 1,
      name: 'streamed',
      tileWidth: 16,
      tileHeight: 16,
      chunkWidth: 4,
      chunkHeight: 4,
      tilesets: [tileset],
    });
    const navigation = new TileNavigationSpace(layer, { cost, window: { x: -4, y: 0, width: 8, height: 4 } });

    expect(navigation.costAt(-4, 0)).toBe(0);
    expect(navigation.costAt(3, 3)).toBe(0);

    // What a ChunkStreamer does as the camera approaches: install the chunk.
    layer._adoptChunk(-1, 0, payload(FLOOR));

    const loaded = navigation.revision;

    expect(navigation.costAt(-4, 0)).toBe(1);
    expect(navigation.costAt(-1, 3)).toBe(1);
    expect(navigation.costAt(0, 0)).toBe(0);

    layer._adoptChunk(0, 0, payload(WATER));
    expect(navigation.revision).toBeGreaterThan(loaded);
    expect(navigation.costAt(3, 3)).toBe(5);

    layer._evictChunk(-1, 0);
    expect(navigation.sync()).toBe(true);
    expect(navigation.costAt(-4, 0)).toBe(0);
    expect(navigation.costAt(0, 0)).toBe(5);
  });

  it('demands a window for an unbounded source and keeps one inside a bounded source', () => {
    const unbounded = new TileLayer({ id: 1, name: 'endless', tileWidth: 16, tileHeight: 16, tilesets: [tileset] });

    expect(() => new TileNavigationSpace(unbounded, { cost })).toThrow(/unbounded source needs an explicit window/);
    expect(() => new TileNavigationSpace(layerOf(ARENA), { cost, window: { x: 4, y: 0, width: 8, height: 2 } })).toThrow(RangeError);
    expect(() => new TileNavigationSpace(layerOf(ARENA), { cost, window: { x: 0, y: 0, width: 0, height: 2 } })).toThrow(RangeError);

    const window = new TileNavigationSpace(layerOf(ARENA), { cost, window: { x: 2, y: 1, width: 4, height: 3 } });

    expect([window.originX, window.originY, window.width, window.height]).toEqual([2, 1, 4, 3]);
    expect(window.nodeAt(1, 1)).toBe(-1);
    expect(window.costAt(3, 1)).toBe(0);
    expect(window.costAt(4, 1)).toBe(1);
  });

  it('falls back to resampling the window for a source without chunks', () => {
    const cells = ['.', '.', '#'];
    let calls = 0;
    const source = {
      revision: 0,
      width: 3,
      height: 1,
      tileWidth: 4,
      tileHeight: 4,
      getTileAt: (x: number): string => cells[x]!,
    };
    const navigation = new TileNavigationSpace(source, { cost: cell => (calls++, cell === '#' ? 0 : 1) });

    calls = 0;
    cells[0] = '#';
    source.revision++;

    expect(navigation.sync()).toBe(true);
    expect(calls).toBe(3);
    expect(navigation.isWalkable(0, 0)).toBe(false);
  });

  it('navigates the logical grid of an isometric layer, not its screen diamonds', () => {
    const projection = new TileProjection({ orientation: 'isometric', tileWidth: 32, tileHeight: 16 });
    const layer = layerOf(ARENA, { tileWidth: 32, tileHeight: 16, projection, offsetX: 16, offsetY: 8 });
    const navigation = new TileNavigationSpace(layer, { cost });
    const point = new Vector();
    const offset = layer.logicalOffset;

    // Isometric logical cells are tileHeight-sized squares.
    expect(navigation.cellSize).toBe(16);

    navigation.nodeToPoint(navigation.nodeAt(2, 1), point);
    expect(point.x).toBeCloseTo(2.5 * 16 + offset.x, 9);
    expect(point.y).toBeCloseTo(1.5 * 16 + offset.y, 9);
    expect(navigation.pointToNode(point.x, point.y)).toBe(navigation.nodeAt(2, 1));

    const route = new Pathfinder().findPathBetween(navigation, 8 + offset.x, 40 + offset.y, 88 + offset.x, 40 + offset.y);

    expect(route.status).toBe('found');
  });

  it('rejects grids it cannot measure correctly', () => {
    expect(() => new TileNavigationSpace(layerOf(ARENA, { tileWidth: 32, tileHeight: 16 }), { cost })).toThrow(/32x16 are not square/);

    const staggered: TileNavigationSource<null> = {
      revision: 0,
      width: 2,
      height: 2,
      tileWidth: 16,
      tileHeight: 16,
      projection: { orientation: 'staggered', logicalTileWidth: 16, logicalTileHeight: 16 },
      getTileAt: () => null,
    };

    expect(() => new TileNavigationSpace(staggered, { cost: () => 1 })).toThrow(/'staggered' grids are not supported/);
  });

  it('turns invalidated once its source is destroyed, blocking every cell and warning once', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const layer = layerOf(ARENA);
    const navigation = new TileNavigationSpace(layer, { cost });
    const revision = navigation.revision;

    expect(navigation.source).toBe(layer);
    expect(navigation.invalidated).toBe(false);

    layer.destroy();

    expect(navigation.sync()).toBe(true);
    expect(navigation.invalidated).toBe(true);
    expect(navigation.revision).toBeGreaterThan(revision);
    expect(navigation.isWalkable(0, 0)).toBe(false);
    expect(new Pathfinder().findPathBetween(navigation, 8, 8, 120, 8).status).toBe('unreachable');

    for (let i = 0; i < 5; i++) {
      expect(navigation.sync()).toBe(false);
    }

    expect(warn).toHaveBeenCalledTimes(1);
    expect(() => new TileNavigationSpace(layer, { cost })).toThrow(/destroyed/);
    warn.mockRestore();
  });

  it('accepts chunk sources whose chunks are structural too', () => {
    const chunk: { revision: number } = { revision: 0 };
    const solid = new Set<number>();
    const source: TileNavigationSource<boolean> = {
      revision: 0,
      width: 4,
      height: 4,
      tileWidth: 1,
      tileHeight: 1,
      chunkWidth: 2,
      chunkHeight: 2,
      getChunk: (cx, cy): TileNavigationChunk | undefined => (cx === 1 && cy === 1 ? chunk : undefined),
      getTileAt: (x, y) => solid.has(y * 4 + x),
    };
    const navigation = new TileNavigationSpace(source, { cost: blocked => (blocked === true ? 0 : 1) });

    solid.add(3 * 4 + 3);
    chunk.revision++;
    (source as { revision: number }).revision++;

    expect(navigation.sync()).toBe(true);
    expect(navigation.isWalkable(3, 3)).toBe(false);
  });
});
