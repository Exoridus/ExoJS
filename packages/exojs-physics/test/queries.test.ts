import { describe, expect, it } from 'vitest';

import type { Collider } from '../src/Collider';
import type { RayHit } from '../src/index';
import { BoxShape, CircleShape, PhysicsWorld } from '../src/index';
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
});
