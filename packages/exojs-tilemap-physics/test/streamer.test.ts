import { View } from '@codexo/exojs';
import { BoxShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs/physics';
import {
  type ChunkPayload,
  type ChunkSource,
  ChunkStreamer,
  packTile,
  TILE_TRANSFORM_IDENTITY,
  TileLayer,
  type TileOrientation,
  TileProjection,
} from '@codexo/exojs/tilemap';
import { describe, expect, it, vi } from 'vitest';

import { TileColliderStreamer } from '../src/TileColliderStreamer';
import { makeLayer, makeTileset, place, shape, TILE } from './helpers';

const CHUNK = 4;

const solidTileset = () => makeTileset({ 0: [shape()] });

/** Every chunk is solid, so residency alone decides what exists. */
const solidSource = (): ChunkSource => ({
  getChunk: (): ChunkPayload => ({
    width: CHUNK,
    height: CHUNK,
    tiles: new Uint32Array(CHUNK * CHUNK).fill(packTile(0, 0, TILE_TRANSFORM_IDENTITY)),
  }),
});

const world = (): PhysicsWorld => new PhysicsWorld({ gravity: { x: 0, y: 0 } });

/** Colliders across every body the bridge owns. */
const colliderCount = (bridge: TileColliderStreamer): number => {
  let count = 0;

  for (const body of bridge.bodies()) {
    count += body.colliders.length;
  }

  return count;
};

const describeWorld = (bridge: TileColliderStreamer): string =>
  [...bridge.bodies()]
    .map(body =>
      [body.x, body.y, ...body.colliders.map(collider => `${collider.shape.type}@${collider.offsetX},${collider.offsetY}`)].join(':'),
    )
    .join('|');

describe('TileColliderStreamer projections', () => {
  const projectedLayer = (orientation: TileOrientation): TileLayer =>
    new TileLayer({
      id: 1,
      name: 'ground',
      width: 2,
      height: 2,
      tileWidth: TILE,
      tileHeight: TILE,
      tilesets: [solidTileset()],
      projection: new TileProjection({ orientation, tileWidth: TILE, tileHeight: TILE, hexSideLength: TILE / 2 }),
    });

  describe.each(['staggered', 'hexagonal'] as const)('%s', orientation => {
    it.each([false, true])('rejects construction without changing the world (resident tiles: %s)', resident => {
      const layer = projectedLayer(orientation);
      const physicsWorld = world();
      const existing = physicsWorld.add(new PhysicsBody({ type: 'static', colliders: [{ shape: new BoxShape(8, 8) }] }));
      const cells = vi.fn(() => 'solid');
      const accept = vi.fn(() => true);
      const material = vi.fn(() => null);
      const add = vi.spyOn(physicsWorld, 'add');
      const destroyBody = vi.spyOn(physicsWorld, 'destroyBody');
      const chunks = vi.spyOn(layer, 'loadedChunks');

      if (resident) {
        place(layer, layer.tilesets[0]!, 0, 0);
      }

      try {
        expect(() => new TileColliderStreamer(physicsWorld, layer, { cells, accept, material })).toThrow(
          /Tile collision works on rectangular logical cells, which staggered and hexagonal grids do not have/,
        );
        expect(physicsWorld.bodies).toEqual([existing]);
        expect(existing.destroyed).toBe(false);
        expect(existing.colliders).toHaveLength(1);
        expect(add).not.toHaveBeenCalled();
        expect(destroyBody).not.toHaveBeenCalled();
        expect(chunks).not.toHaveBeenCalled();
        expect(cells).not.toHaveBeenCalled();
        expect(accept).not.toHaveBeenCalled();
        expect(material).not.toHaveBeenCalled();

        place(layer, layer.tilesets[0]!, 1, 1);
        physicsWorld.step(1 / 60);

        expect(physicsWorld.bodies).toEqual([existing]);
        expect(add).not.toHaveBeenCalled();
        expect(cells).not.toHaveBeenCalled();
      } finally {
        layer.destroy();
        physicsWorld.destroy();
      }
    });
  });

  it.each(['orthogonal', 'isometric'] as const)('accepts %s and preserves streaming and teardown', orientation => {
    const layer = projectedLayer(orientation);
    const physicsWorld = world();
    const existing = physicsWorld.add(new PhysicsBody({ type: 'static', position: { x: -100, y: -100 } }));
    const cells = vi.fn(() => null);

    place(layer, layer.tilesets[0]!, 0, 0);

    const bridge = new TileColliderStreamer(physicsWorld, layer, { cells });

    try {
      expect(physicsWorld.bodies).toEqual([existing]);
      expect(cells).not.toHaveBeenCalled();

      bridge.sync();

      const built = [...bridge.bodies()];

      expect(built).toHaveLength(1);
      expect(colliderCount(bridge)).toBeGreaterThan(0);
      expect(physicsWorld.bodies).toHaveLength(2);

      bridge.sync();

      expect([...bridge.bodies()]).toEqual(built);

      layer.clearTileAt(0, 0);
      bridge.sync();

      expect(bridge.bodyCount).toBe(0);
      expect(physicsWorld.bodies).toEqual([existing]);

      place(layer, layer.tilesets[0]!, 0, 0);
      bridge.sync();

      expect(bridge.bodyCount).toBe(1);

      bridge.destroy();
      bridge.destroy();
      bridge.sync();

      expect(bridge.bodyCount).toBe(0);
      expect(physicsWorld.bodies).toEqual([existing]);
      expect(existing.destroyed).toBe(false);
    } finally {
      bridge.destroy();
      layer.destroy();
      physicsWorld.destroy();
    }
  });
});

describe('TileColliderStreamer lifecycle', () => {
  it('builds one body per resident chunk', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 8, height: 8, chunkWidth: CHUNK, chunkHeight: CHUNK });

    place(layer, tileset, 0, 0);
    place(layer, tileset, 5, 5);

    const bridge = new TileColliderStreamer(world(), layer);

    bridge.sync();

    expect(bridge.bodyCount).toBe(2);
  });

  it('rebuilds only the edited chunk', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 8, height: 8, chunkWidth: CHUNK, chunkHeight: CHUNK });

    place(layer, tileset, 0, 0);
    place(layer, tileset, 5, 5);

    const bridge = new TileColliderStreamer(world(), layer);

    bridge.sync();

    const untouched = [...bridge.bodies()].find(body => body.x >= CHUNK * TILE)!;

    place(layer, tileset, 1, 0);
    bridge.sync();

    expect([...bridge.bodies()]).toContain(untouched);
    expect(colliderCount(bridge)).toBe(2);
  });

  it('drops a body when its chunk stops carrying collision geometry', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 4, height: 4, chunkWidth: CHUNK, chunkHeight: CHUNK });

    place(layer, tileset, 0, 0);

    const bridge = new TileColliderStreamer(world(), layer);

    bridge.sync();
    expect(bridge.bodyCount).toBe(1);

    layer.clearTileAt(0, 0);
    bridge.sync();

    expect(bridge.bodyCount).toBe(0);
  });

  it('follows chunk load and unload', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { chunkWidth: CHUNK, chunkHeight: CHUNK });
    const view = new View(0, 0, 64, 64);
    const chunks = new ChunkStreamer(layer, solidSource(), view, { loadRadius: 0, unloadRadius: 0 });
    const physicsWorld = world();
    const bridge = new TileColliderStreamer(physicsWorld, layer);

    chunks.update();
    bridge.sync();

    expect(bridge.bodyCount).toBe(chunks.residentCount);
    expect(bridge.bodyCount).toBeGreaterThan(0);

    view.center.set(4000, 4000);
    chunks.update();
    bridge.sync();

    for (const body of bridge.bodies()) {
      expect(body.x).toBeGreaterThan(1000);
    }
  });

  it('destroys every body it owns and no others', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 4, height: 4, chunkWidth: CHUNK, chunkHeight: CHUNK });

    place(layer, tileset, 0, 0);

    const physicsWorld = world();
    const bridge = new TileColliderStreamer(physicsWorld, layer);

    bridge.sync();
    expect(physicsWorld.bodies).toHaveLength(1);

    bridge.destroy();
    physicsWorld.step(1 / 60);

    expect(physicsWorld.bodies).toHaveLength(0);
    expect(bridge.bodyCount).toBe(0);

    bridge.destroy();
    bridge.sync();

    expect(bridge.bodyCount).toBe(0);
  });

  it('is idempotent and does not touch the world when nothing changed', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 8, height: 8, chunkWidth: CHUNK, chunkHeight: CHUNK });

    place(layer, tileset, 0, 0);
    place(layer, tileset, 5, 5);

    const physicsWorld = world();
    const bridge = new TileColliderStreamer(physicsWorld, layer);

    bridge.sync();

    const before = describeWorld(bridge);
    const bodies = [...bridge.bodies()];
    const destroySpy = vi.spyOn(physicsWorld, 'destroyBody');
    const addSpy = vi.spyOn(physicsWorld, 'add');

    bridge.sync();
    bridge.sync();

    expect(destroySpy).not.toHaveBeenCalled();
    expect(addSpy).not.toHaveBeenCalled();
    expect([...bridge.bodies()]).toEqual(bodies);
    expect(describeWorld(bridge)).toBe(before);
  });

  it('walks nothing at all when the layer has not changed', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 8, height: 8, chunkWidth: CHUNK, chunkHeight: CHUNK });

    place(layer, tileset, 0, 0);

    const bridge = new TileColliderStreamer(world(), layer);

    bridge.sync();

    // The steady-state path returns on the revision check, before the chunk
    // walk that is the only thing in `sync` that allocates.
    const walk = vi.spyOn(layer, 'loadedChunks');

    for (let i = 0; i < 100; i++) {
      bridge.sync();
    }

    expect(walk).not.toHaveBeenCalled();
  });

  it('does not consult the material resolver on a no-change sync', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 4, height: 4, chunkWidth: CHUNK, chunkHeight: CHUNK });

    place(layer, tileset, 0, 0);

    const material = vi.fn(() => null);
    const bridge = new TileColliderStreamer(world(), layer, { material });

    bridge.sync();

    const callsAfterBuild = material.mock.calls.length;

    expect(callsAfterBuild).toBeGreaterThan(0);

    bridge.sync();
    bridge.sync();

    expect(material.mock.calls).toHaveLength(callsAfterBuild);
  });

  it('produces the same colliders whichever order chunks arrive in', () => {
    const build = (order: ReadonlyArray<readonly [number, number]>): string => {
      const tileset = solidTileset();
      const layer = makeLayer(tileset, { width: 8, height: 8, chunkWidth: CHUNK, chunkHeight: CHUNK });
      const bridge = new TileColliderStreamer(world(), layer);

      for (const [tx, ty] of order) {
        place(layer, tileset, tx, ty);
        bridge.sync();
      }

      return describeWorld(bridge);
    };

    const forward: Array<readonly [number, number]> = [
      [0, 0],
      [1, 0],
      [4, 0],
      [4, 4],
    ];

    expect(build(forward)).toBe(build([...forward].reverse()));
  });

  it('collapses a solid run into one wide box collider', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 8, height: 2, chunkWidth: 8, chunkHeight: 2 });

    for (let tx = 0; tx < 8; tx++) {
      place(layer, tileset, tx, 1);
    }

    const bridge = new TileColliderStreamer(world(), layer);

    bridge.sync();

    const colliders = [...bridge.bodies()].flatMap(body => [...body.colliders]);

    expect(colliders).toHaveLength(1);
    expect(colliders[0]!.shape.massProperties?.area).toBe(8 * TILE * TILE);
  });

  it('forwards the material and filter onto every generated collider', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 8, height: 2, chunkWidth: 8, chunkHeight: 2 });

    for (let tx = 0; tx < 8; tx++) {
      place(layer, tileset, tx, 1);
    }

    const bridge = new TileColliderStreamer(world(), layer, {
      friction: 0.25,
      restitution: 0.5,
      isSensor: true,
      filter: { category: 0x0004, mask: 0x0002 },
    });

    bridge.sync();

    for (const body of bridge.bodies()) {
      for (const collider of body.colliders) {
        expect(collider.friction).toBe(0.25);
        expect(collider.restitution).toBe(0.5);
        expect(collider.isSensor).toBe(true);
        expect(collider.filter.category).toBe(0x0004);
        expect(collider.filter.mask).toBe(0x0002);
        // A partial filter keeps the physics default for what it omits.
        expect(collider.filter.group).toBe(0);
      }
    }
  });

  it('produces a floor a dynamic body lands on', () => {
    const tileset = solidTileset();
    const layer = makeLayer(tileset, { width: 8, height: 4, chunkWidth: 8, chunkHeight: 4 });

    for (let tx = 0; tx < 8; tx++) {
      place(layer, tileset, tx, 3);
    }

    const physicsWorld = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

    new TileColliderStreamer(physicsWorld, layer).sync();

    const body = physicsWorld.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 4 * TILE, y: 0 },
        colliders: [{ shape: new BoxShape(8, 8), density: 1 }],
      }),
    );

    for (let step = 0; step < 240; step++) {
      physicsWorld.step(1 / 60);
    }

    expect(body.y).toBeCloseTo(3 * TILE - 4, 0);
  });

  it('rebuilds when the layer is moved', () => {
    const tileset = solidTileset();
    const layer: TileLayer = makeLayer(tileset, { width: 4, height: 4, chunkWidth: CHUNK, chunkHeight: CHUNK });

    place(layer, tileset, 0, 0);

    const bridge = new TileColliderStreamer(world(), layer);

    bridge.sync();
    expect([...bridge.bodies()][0]!.x).toBe(0);

    layer.offsetX = 64;
    bridge.sync();

    expect([...bridge.bodies()][0]!.x).toBe(64);
  });
});
