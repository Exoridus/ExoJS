import type { PointLike } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { BoxShape, CapsuleShape, ChainShape, CircleShape, PhysicsWorld, SegmentShape } from '../src/index';
import type { AnyShape } from '../src/shapes/AnyShape';
import type { ShapeType } from '../src/shapes/Shape';
import { colliderAt } from './support';

/**
 * Queries across the whole shape set: which shapes answer which question, and
 * what a chain reports - always the authored collider, never an edge proxy.
 */

const kinds: readonly ShapeType[] = ['circle', 'polygon', 'capsule', 'segment', 'chain'];

/** Half-height of each probe shape, so a pair can be placed at a known overlap. */
const halfHeight: Readonly<Record<string, number>> = { circle: 10, polygon: 10, capsule: 5, segment: 0, chain: 0 };

/** The shapes with an interior; the two boundary kinds answer no area question. */
const solids: readonly ShapeType[] = ['circle', 'polygon', 'capsule'];
const boundaries: readonly ShapeType[] = ['segment', 'chain'];

const points = (...coordinates: number[]): PointLike[] => {
  const out: PointLike[] = [];

  for (let i = 0; i < coordinates.length; i += 2) {
    out.push({ x: coordinates[i]!, y: coordinates[i + 1]! });
  }

  return out;
};

const probe = (kind: ShapeType): AnyShape => {
  switch (kind) {
    case 'circle':
      return new CircleShape(10);
    case 'polygon':
      return new BoxShape(20, 20);
    case 'capsule':
      return new CapsuleShape(-5, 0, 5, 0, 5);
    case 'segment':
      return new SegmentShape(-5, 0, 5, 0);
    case 'chain':
      return new ChainShape(points(-5, 0, 5, 0));
  }
};

describe('queryPoint across the shape set', () => {
  it.each(solids)('reports %s for a point inside it', (kind) => {
    const world = new PhysicsWorld();
    const collider = colliderAt(world, probe(kind), { x: 0, y: 0 });

    expect(world.queryPoint({ x: 0, y: 0 })).toEqual([collider]);
    expect(world.queryPoint({ x: 0, y: halfHeight[kind]! + 1 })).toEqual([]);
  });

  it.each(boundaries)('never reports %s, however close the point is', (kind) => {
    const world = new PhysicsWorld();
    colliderAt(world, probe(kind), { x: 0, y: 0 });

    for (const point of [{ x: 0, y: 0 }, { x: 0, y: 1e-9 }, { x: -5, y: 0 }]) {
      expect(world.queryPoint(point)).toEqual([]);
    }
  });

  it('tests a capsule against its spine, not its bounding box', () => {
    const world = new PhysicsWorld();
    const collider = colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });

    expect(world.queryPoint({ x: 24, y: 0 })).toEqual([collider]); // inside the end cap
    expect(world.queryPoint({ x: 24, y: 4 })).toEqual([]); // inside the AABB corner, outside the cap
  });
});

describe('queryAabb and forEachAabbHit across the shape set', () => {
  it.each(kinds)('finds %s exactly once', (kind) => {
    const world = new PhysicsWorld();
    const collider = colliderAt(world, probe(kind), { x: 0, y: 0 });
    const bounds = { minX: -50, minY: -50, maxX: 50, maxY: 50 };
    const visited: unknown[] = [];

    expect(world.queryAabb(bounds)).toEqual([collider]);

    world.forEachAabbHit(bounds, undefined, (hit) => visited.push(hit));

    expect(visited).toEqual([collider]);
  });

  it('reports a multi-edge chain once, not once per edge', () => {
    const world = new PhysicsWorld();
    const chain = colliderAt(world, new ChainShape(points(-150, 0, -50, 0, 50, 0, 150, 0)), { x: 0, y: 0 });
    const bounds = { minX: -200, minY: -50, maxX: 200, maxY: 50 };
    const visited: unknown[] = [];

    expect(world.queryAabb(bounds)).toEqual([chain]);

    world.forEachAabbHit(bounds, undefined, (hit) => visited.push(hit));

    expect(visited).toEqual([chain]);
  });
});

describe('rayCast across the shape set', () => {
  it.each(kinds)('hits %s and reports a normal facing the ray', (kind) => {
    const world = new PhysicsWorld();
    const collider = colliderAt(world, probe(kind), { x: 0, y: 0 });
    const hit = world.rayCast({ x: 0, y: -50 }, { x: 0, y: 1 });

    expect(hit?.collider).toBe(collider);
    expect(hit!.normal.y).toBeCloseTo(-1, 6);
    expect(hit!.distance).toBeCloseTo(50 - halfHeight[kind]!, 6);
  });

  it('hits a capsule on the cap as well as on the side', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });

    const side = world.rayCast({ x: 0, y: -50 }, { x: 0, y: 1 });
    const cap = world.rayCast({ x: -50, y: 0 }, { x: 1, y: 0 });

    expect(side!.distance).toBeCloseTo(45, 6);
    expect(side!.normal.y).toBeCloseTo(-1, 4);
    expect(cap!.distance).toBeCloseTo(25, 4); // spine end at −20, plus the radius
    expect(cap!.normal.x).toBeCloseTo(-1, 4);
  });

  it('hits a segment from either side and misses one it runs parallel to', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new SegmentShape(-20, 0, 20, 0), { x: 0, y: 0 });

    expect(world.rayCast({ x: 0, y: -50 }, { x: 0, y: 1 })!.normal.y).toBeCloseTo(-1, 6);
    expect(world.rayCast({ x: 0, y: 50 }, { x: 0, y: -1 })!.normal.y).toBeCloseTo(1, 6);
    expect(world.rayCast({ x: -50, y: 0 }, { x: 1, y: 0 })).toBeNull();
    // Past the endpoint: the boundary is finite.
    expect(world.rayCast({ x: 21, y: -50 }, { x: 0, y: 1 })).toBeNull();
  });

  it('reports the authored chain for every edge a ray crosses', () => {
    const world = new PhysicsWorld();
    // An inverted V: a horizontal ray at y = −25 crosses both edges.
    const chain = colliderAt(world, new ChainShape(points(0, 0, 50, -50, 100, 0)), { x: 0, y: 0 });
    const hits = world.rayCastAll({ x: -10, y: -25 }, { x: 1, y: 0 });

    expect(hits).toHaveLength(2);
    expect(hits.map((hit) => hit.collider)).toEqual([chain, chain]);
    expect(hits[0]!.distance).toBeCloseTo(35, 6);
    expect(hits[1]!.distance).toBeCloseTo(85, 6);
    expect(world.rayCast({ x: -10, y: -25 }, { x: 1, y: 0 })!.distance).toBeCloseTo(35, 6);
  });

  it('reports a chain from either side: solidity is a contact rule, not a visibility rule', () => {
    const world = new PhysicsWorld();
    const chain = colliderAt(world, new ChainShape(points(-50, 0, 50, 0)), { x: 0, y: 0 });

    expect(world.rayCast({ x: 0, y: 50 }, { x: 0, y: -1 })?.collider).toBe(chain);
    expect(world.rayCast({ x: 0, y: -50 }, { x: 0, y: 1 })?.collider).toBe(chain);
  });

  it('reports no entry hit from inside a solid, whatever its kind', () => {
    const world = new PhysicsWorld();
    colliderAt(world, probe('capsule'), { x: 0, y: 0 });

    expect(world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });
});

describe('overlapShape across the shape set', () => {
  const cases = kinds.flatMap((collider) => kinds.map((query) => ({ collider, query })));

  it.each(cases)('tests a $query probe against a $collider collider', ({ collider: colliderKind, query: queryKind }) => {
    const world = new PhysicsWorld();
    const collider = colliderAt(world, probe(colliderKind), { x: 0, y: 0 });
    // 1px of overlap along y, and 1px of clearance in the second call.
    const overlapping = halfHeight[colliderKind]! + halfHeight[queryKind]! - 1;
    const bothBoundaries = boundaries.includes(colliderKind) && boundaries.includes(queryKind);

    expect(world.overlapShape(probe(queryKind), { x: 0, y: overlapping })).toEqual(bothBoundaries ? [] : [collider]);
    expect(world.overlapShape(probe(queryKind), { x: 0, y: overlapping + 2 })).toEqual([]);
  });

  it('reports a chain once for a probe covering several of its edges', () => {
    const world = new PhysicsWorld();
    const chain = colliderAt(world, new ChainShape(points(-150, 0, -50, 0, 50, 0, 150, 0)), { x: 0, y: 0 });

    expect(world.overlapShape(new BoxShape(300, 20), { x: 0, y: 0 })).toEqual([chain]);
  });

  it('takes a rotated probe shape in its own frame', () => {
    const world = new PhysicsWorld();
    const collider = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 });

    // A 40px segment on the x axis, rotated upright: it reaches the box from 19px away.
    expect(world.overlapShape(new SegmentShape(-20, 0, 20, 0), { x: 0, y: 29 }, undefined, Math.PI / 2)).toEqual([collider]);
    expect(world.overlapShape(new SegmentShape(-20, 0, 20, 0), { x: 0, y: 31 }, undefined, Math.PI / 2)).toEqual([]);
  });
});
