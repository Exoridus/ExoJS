import { describe, expect, it } from 'vitest';

import type { Collider } from '../src/Collider';
import type { RayHit } from '../src/index';
import { BoxShape, CircleShape, PhysicsWorld, PolygonShape } from '../src/index';
import { QueryEngine } from '../src/query/QueryEngine';
import { colliderAt } from './support';

describe('queries', () => {
  it('queryPoint returns colliders containing the point', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 });
    colliderAt(world, new BoxShape(10, 10), { x: 100, y: 0 });

    expect(world.queryPoint({ x: 5, y: 5 })).toEqual([box]);
    expect(world.queryPoint({ x: 50, y: 50 })).toEqual([]);
  });

  it('queryAabb supports the fresh-array and caller-owned out forms', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    colliderAt(world, new BoxShape(10, 10), { x: 100, y: 0 });

    const fresh = world.queryAabb({ minX: -10, minY: -10, maxX: 10, maxY: 10 });
    expect(fresh).toEqual([a]);

    const out: Collider[] = [{} as Collider];
    const returned = world.queryAabb({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, undefined, out);
    expect(returned).toBe(out);
    expect(out).toEqual([a]);
  });

  it('forEachAabbHit visits matches without allocating', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const visited: Collider[] = [];

    world.forEachAabbHit({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, undefined, c => visited.push(c));
    expect(visited).toEqual([a]);
  });

  it('rayCast returns the nearest hit against a box with the entry normal', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, new BoxShape(20, 20), { x: 100, y: 0 });

    const hit = world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(hit).not.toBeNull();
    expect((hit as RayHit).collider).toBe(box);
    expect((hit as RayHit).distance).toBeCloseTo(90, 6);
    expect((hit as RayHit).normal.x).toBeCloseTo(-1, 6);
  });

  it('rayCast hits a circle and reports a radial normal', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new CircleShape(10), { x: 0, y: 100 });

    const hit = world.rayCast({ x: 0, y: 0 }, { x: 0, y: 2 });
    expect(hit).not.toBeNull();
    expect((hit as RayHit).distance).toBeCloseTo(90, 6);
    expect((hit as RayHit).normal.y).toBeCloseTo(-1, 6);
  });

  it('rayCast misses when nothing is along the ray and throws on a zero direction', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 100 });

    expect(world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
    expect(() => world.rayCast({ x: 0, y: 0 }, { x: 0, y: 0 })).toThrow(RangeError);
  });

  it('rayCastAll returns all hits sorted by distance', () => {
    const world = new PhysicsWorld();
    const near = colliderAt(world, new BoxShape(10, 10), { x: 50, y: 0 });
    const far = colliderAt(world, new BoxShape(10, 10), { x: 150, y: 0 });

    const hits = world.rayCastAll({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(hits.map(h => h.collider)).toEqual([near, far]);
    expect(hits[0].distance).toBeLessThan(hits[1].distance);
  });

  it('overlapShape returns colliders overlapping the probe shape', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 });

    expect(world.overlapShape(new CircleShape(5), { x: 8, y: 0 })).toEqual([box]);
    expect(world.overlapShape(new CircleShape(5), { x: 100, y: 0 })).toEqual([]);
  });

  it('applies category/mask filters', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'static', { filter: { category: 0x0002 } });

    // Query whose mask excludes category 0x0002 finds nothing.
    expect(world.queryPoint({ x: 0, y: 0 }, { category: 0x0001, mask: 0x0001 })).toEqual([]);
    // Query whose mask includes 0x0002 finds it.
    expect(world.queryPoint({ x: 0, y: 0 }, { category: 0x0001, mask: 0x0002 })).toHaveLength(1);
  });

  it('queryPoint tests circle colliders by radial distance', () => {
    const world = new PhysicsWorld();
    const circle = colliderAt(world, new CircleShape(5), { x: 0, y: 0 });

    expect(world.queryPoint({ x: 3, y: 0 })).toEqual([circle]);
    expect(world.queryPoint({ x: 10, y: 0 })).toEqual([]);
  });

  it('queryPoint rejects a point inside a non-rectangular polygon AABB but outside the shape', () => {
    const world = new PhysicsWorld();
    const triangle = colliderAt(
      world,
      new PolygonShape([
        { x: -10, y: 10 },
        { x: 10, y: 10 },
        { x: 0, y: -10 },
      ]),
      { x: 0, y: 0 },
    );

    // Inside the triangle's bounding box, but past the slanted edge (outside the shape).
    expect(world.queryPoint({ x: 9.8, y: 9 })).toEqual([]);
    // Inside both the AABB and the triangle itself.
    expect(world.queryPoint({ x: 0, y: 0 })).toEqual([triangle]);
  });

  it('queryAabb skips colliders excluded by the filter', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'static', { filter: { category: 0x0002 } });

    expect(world.queryAabb({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, { category: 0x0001, mask: 0x0001 })).toEqual([]);
  });

  it('forEachAabbHit skips colliders excluded by the filter', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 }, 0, 'static', { filter: { category: 0x0002 } });
    const visited: Collider[] = [];

    world.forEachAabbHit({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, { category: 0x0001, mask: 0x0001 }, c => visited.push(c));
    expect(visited).toEqual([]);
  });

  it('forEachAabbHit skips colliders whose AABB does not overlap (no filter involved)', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 100, y: 0 });
    const visited: Collider[] = [];

    world.forEachAabbHit({ minX: -10, minY: -10, maxX: 10, maxY: 10 }, undefined, c => visited.push(c));
    expect(visited).toEqual([]);
  });

  it('rayCast skips colliders excluded by the filter', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 50, y: 0 }, 0, 'static', { filter: { category: 0x0002 } });
    const far = colliderAt(world, new BoxShape(10, 10), { x: 100, y: 0 });

    const hit = world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 }, { category: 0x0001, mask: 0x0001 });
    expect(hit).not.toBeNull();
    expect((hit as RayHit).collider).toBe(far);
  });

  it('rayCast tracks the nearest hit as closer and farther colliders are encountered', () => {
    const world = new PhysicsWorld();
    // Encounter order deliberately mixed: medium, then nearer (updates best), then farther (best unchanged).
    colliderAt(world, new BoxShape(6, 6), { x: 50, y: 0 });
    const near = colliderAt(world, new BoxShape(6, 6), { x: 20, y: 0 });
    colliderAt(world, new BoxShape(6, 6), { x: 80, y: 0 });

    const hit = world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 });
    expect(hit).not.toBeNull();
    expect((hit as RayHit).collider).toBe(near);
  });

  it('rayCast respects maxDistance and reports no hit past it', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new CircleShape(5), { x: 50, y: 0 });

    expect(world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 }, undefined, 20)).toBeNull();
  });

  it('rayCast misses a circle that lies behind the ray origin (pointing away)', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new CircleShape(5), { x: -50, y: 0 });

    expect(world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it('rayCast misses a circle the ray passes beside (negative discriminant)', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new CircleShape(3), { x: 50, y: 10 });

    expect(world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it('rayCast from inside a convex polygon reports no entry hit', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 });

    // The ray starts already inside the box, so it never crosses an entering face.
    expect(world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });

  it('rayCast against a polygon respects maxDistance', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 100, y: 0 });

    expect(world.rayCast({ x: 0, y: 0 }, { x: 1, y: 0 }, undefined, 50)).toBeNull();
  });

  it('rayCastAll throws on a zero direction', () => {
    const world = new PhysicsWorld();

    expect(() => world.rayCastAll({ x: 0, y: 0 }, { x: 0, y: 0 })).toThrow(RangeError);
  });

  it('rayCastAll skips colliders excluded by the filter', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(10, 10), { x: 50, y: 0 }, 0, 'static', { filter: { category: 0x0002 } });
    const far = colliderAt(world, new BoxShape(10, 10), { x: 150, y: 0 });

    const hits = world.rayCastAll({ x: 0, y: 0 }, { x: 1, y: 0 }, { category: 0x0001, mask: 0x0001 });
    expect(hits.map(h => h.collider)).toEqual([far]);
  });

  it('overlapShape skips colliders excluded by the filter', () => {
    const world = new PhysicsWorld();
    colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 }, 0, 'static', { filter: { category: 0x0002 } });

    expect(world.overlapShape(new CircleShape(5), { x: 8, y: 0 }, { category: 0x0001, mask: 0x0001 })).toEqual([]);
  });

  it('overlapShape supports a rotated polygon probe shape', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 });

    expect(world.overlapShape(new BoxShape(4, 4), { x: 8, y: 0 }, undefined, Math.PI / 4)).toEqual([box]);
    expect(world.overlapShape(new BoxShape(4, 4), { x: 100, y: 0 }, undefined, Math.PI / 4)).toEqual([]);
  });
});

describe('QueryEngine spatial-index narrowing parity', () => {
  it('queryPoint/queryAabb/overlapShape return identical results whether or not the backend provides a SpatialIndex', () => {
    const world = new PhysicsWorld(); // NativePhysicsBackend wires its AabbTreeBroadPhase as spatialIndex automatically
    const unindexed = new QueryEngine(world.colliders); // no spatialIndex — forces the fallback linear scan

    for (let i = 0; i < 30; i++) {
      colliderAt(world, new BoxShape(10, 10), { x: (i % 6) * 12, y: Math.floor(i / 6) * 12 }, 0, 'dynamic');
    }

    const point = { x: 15, y: 15 };
    const bounds = { minX: 0, minY: 0, maxX: 30, maxY: 30 };

    // `PhysicsWorld` delegates query methods directly (no `.queries` sub-object) —
    // see e.g. `world.queryPoint` at PhysicsWorld.ts:538, which forwards to its
    // internal `_query: QueryEngine` (now constructed with the backend's
    // `spatialIndex`, per Step 6 above).
    const indexedPoint = world.queryPoint(point).map(c => c.id).sort((a, b) => a - b);
    const linearPoint = unindexed.queryPoint(point).map(c => c.id).sort((a, b) => a - b);
    expect(indexedPoint).toEqual(linearPoint);

    const indexedAabb = world.queryAabb(bounds).map(c => c.id).sort((a, b) => a - b);
    const linearAabb = unindexed.queryAabb(bounds).map(c => c.id).sort((a, b) => a - b);
    expect(indexedAabb).toEqual(linearAabb);

    const indexedShape = world.overlapShape(new BoxShape(20, 20), { x: 15, y: 15 }).map(c => c.id).sort((a, b) => a - b);
    const linearShape = unindexed.overlapShape(new BoxShape(20, 20), { x: 15, y: 15 }).map(c => c.id).sort((a, b) => a - b);
    expect(indexedShape).toEqual(linearShape);

    expect(indexedPoint.length).toBeGreaterThan(0);
    expect(indexedAabb.length).toBeGreaterThan(0);
    expect(indexedShape.length).toBeGreaterThan(0); // sanity: the assertions above aren't vacuously true on empty results
  });
});

describe('forEachAabbHit cross-method reentrancy', () => {
  it('a queryPoint call from inside the callback does not truncate/corrupt the outer traversal', () => {
    const world = new PhysicsWorld(); // wires AabbTreeBroadPhase as spatialIndex, so `_candidatesFor` narrows via SpatialIndex.queryAabb

    // Five colliders inside the outer forEachAabbHit region.
    const inBounds = Array.from({ length: 5 }, (_, i) => colliderAt(world, new BoxShape(10, 10), { x: i * 12, y: 0 }, 0, 'dynamic'));
    // A collider far outside that region, targeted by the nested queryPoint call.
    const far = colliderAt(world, new BoxShape(10, 10), { x: 1000, y: 1000 }, 0, 'dynamic');

    const visited: Collider[] = [];
    const nestedHits: Collider[] = [];

    world.forEachAabbHit({ minX: -10, minY: -10, maxX: 60, maxY: 10 }, undefined, collider => {
      visited.push(collider);
      // Re-enters `_candidatesFor` for a DIFFERENT location on every iteration. Before the fix this
      // refilled the SAME shared `_scratchHits` buffer the outer `for...of` was still iterating,
      // silently truncating/corrupting the outer traversal.
      nestedHits.push(...world.queryPoint({ x: 1000, y: 1000 }));
    });

    expect(visited.map(c => c.id).sort((a, b) => a - b)).toEqual(inBounds.map(c => c.id).sort((a, b) => a - b));
    expect(nestedHits).toHaveLength(inBounds.length);
    expect(nestedHits.every(c => c === far)).toBe(true);
  });
});
