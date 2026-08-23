import { BoxShape, ChainShape, PhysicsBody, PhysicsWorld } from '@codexo/exojs-physics';
import type { TileLayer, TileSet } from '@codexo/exojs-tilemap';
import { describe, expect, it } from 'vitest';

import type { TileColliderOptions } from '../src/TileColliderStreamer';
import { TileColliderStreamer } from '../src/TileColliderStreamer';
import { makeLayer, makeTileset, place, shape, TILE } from './helpers';

const DT = 1 / 60;
const SPEED = 300;
const WIDTH = 16;

/** Tile 0 is `solid`, tile 1 is `ice`: the merge pass refuses to fuse the two. */
const twoTypeTileset = (): TileSet => makeTileset({ 0: [shape({ type: 'solid' })], 1: [shape({ type: 'ice' })] });

/** A one-row floor of alternating types, so every tile boundary is a seam. */
const stripedFloor = (): TileLayer => {
  const tileset = twoTypeTileset();
  const layer = makeLayer(tileset, { width: WIDTH, height: 2, chunkWidth: WIDTH, chunkHeight: 2 });

  for (let tx = 0; tx < WIDTH; tx++) {
    place(layer, tileset, tx, 1, tx % 2);
  }

  return layer;
};

interface SlideTrace {
  maxUpward: number;
  minForward: number;
  x: number;
}

/** Settle a box on the floor, drive it across at constant speed, record the transient. */
const slide = (options: TileColliderOptions): SlideTrace => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

  new TileColliderStreamer(world, stripedFloor(), { friction: 0, ...options }).sync();

  const body = world.add(
    new PhysicsBody({
      type: 'dynamic',
      position: { x: TILE, y: TILE - 8 },
      colliders: [{ shape: new BoxShape(12, 12), density: 1, friction: 0 }],
    }),
  );

  for (let step = 0; step < 90; step++) world.step(DT);

  body.wake();
  body.linearVelocityX = SPEED;

  const trace: SlideTrace = { maxUpward: 0, minForward: Infinity, x: body.x };

  for (let step = 0; step < 60; step++) {
    world.step(DT);
    trace.maxUpward = Math.max(trace.maxUpward, -body.linearVelocityY);
    trace.minForward = Math.min(trace.minForward, body.linearVelocityX);
  }

  trace.x = body.x;

  return trace;
};

/**
 * Drop a body from `(x, y)` and return where it comes to rest. Started close to
 * the surface on purpose: a chain is a zero-thickness boundary, so a long fall
 * would test continuous collision rather than the winding.
 */
const dropOnto = (layer: TileLayer, options: TileColliderOptions, x: number, y: number): number => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

  new TileColliderStreamer(world, layer, options).sync();

  const body = world.add(
    new PhysicsBody({
      type: 'dynamic',
      position: { x, y },
      colliders: [{ shape: new BoxShape(8, 8), density: 1 }],
    }),
  );

  for (let step = 0; step < 240; step++) world.step(DT);

  return body.y;
};

const chainColliders = (layer: TileLayer, options: TileColliderOptions) => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
  const bridge = new TileColliderStreamer(world, layer, { regionMode: 'outline', ...options });

  bridge.sync();

  return [...bridge.bodies()].flatMap(body => [...body.colliders]);
};

describe('outline region mode', () => {
  it('traces a solid region into one closed chain instead of per-tile boxes', () => {
    const colliders = chainColliders(stripedFloor(), {});
    const chain = colliders[0]!.shape as ChainShape;

    expect(colliders).toHaveLength(1);
    expect(chain).toBeInstanceOf(ChainShape);
    expect(chain.closed).toBe(true);
    // The whole striped run is one rectangle boundary: four corners.
    expect(chain.count).toBe(4);
  });

  it('is solid from outside and hollow inside', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset, { width: 8, height: 8, chunkWidth: 8, chunkHeight: 8 });

    for (let ty = 2; ty < 6; ty++) {
      for (let tx = 2; tx < 6; tx++) {
        place(layer, tileset, tx, ty);
      }
    }

    const top = 2 * TILE;

    expect(dropOnto(layer, { regionMode: 'outline' }, 4 * TILE, top - 12)).toBeCloseTo(top - 4, 0);

    // Started inside the solid area, the body falls straight through: an outline
    // has a boundary, not an interior.
    expect(dropOnto(layer, { regionMode: 'outline' }, 4 * TILE, 4 * TILE)).toBeGreaterThan(6 * TILE);
  });

  it('keeps a hole solid on its inside', () => {
    const tileset = makeTileset({ 0: [shape()] });
    const layer = makeLayer(tileset, { width: 8, height: 8, chunkWidth: 8, chunkHeight: 8 });

    for (let ty = 1; ty < 7; ty++) {
      for (let tx = 1; tx < 7; tx++) {
        if (tx >= 3 && tx <= 4 && ty >= 3 && ty <= 4) continue;
        place(layer, tileset, tx, ty);
      }
    }

    // Dropped into the 2x2 hole, the body lands on the hole's floor.
    expect(dropOnto(layer, { regionMode: 'outline' }, 3.5 * TILE, 3.4 * TILE)).toBeCloseTo(5 * TILE - 4, 0);
  });

  it('merges regions whose resolved material matches', () => {
    // Two `type` strings, one resolved material: one boundary, no inner seam.
    expect(chainColliders(stripedFloor(), {})).toHaveLength(1);
  });

  it('splits regions whose resolved material differs, keeping each material', () => {
    const colliders = chainColliders(stripedFloor(), {
      friction: 0.6,
      material: context => (context.type === 'ice' ? { friction: 0 } : null),
    });
    const frictions = [...new Set(colliders.map(collider => collider.friction))].sort();

    expect(colliders.length).toBeGreaterThan(1);
    expect(frictions).toEqual([0, 0.6]);
  });

  it('carries a body across a fragmented run without a seam kick', () => {
    const outline = slide({ regionMode: 'outline' });
    const boxes = slide({ regionMode: 'boxes' });

    // The traced boundary has no internal edges left to catch on.
    expect(outline.maxUpward).toBeLessThan(1);
    expect(outline.minForward).toBeGreaterThan(SPEED - 1);

    // And it is never worse than the per-tile boxes it replaces.
    expect(outline.maxUpward).toBeLessThanOrEqual(boxes.maxUpward);
    expect(outline.minForward).toBeGreaterThanOrEqual(boxes.minForward);
  });
});
