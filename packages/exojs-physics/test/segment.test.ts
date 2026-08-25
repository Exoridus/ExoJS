import { describe, expect, it } from 'vitest';

import { Manifold } from '../src/collision/Manifold';
import { collide, testOverlap } from '../src/collision/narrowphase';
import { BoxShape, CapsuleShape, CircleShape, PhysicsBody, PhysicsWorld, SegmentShape } from '../src/index';
import { colliderAt } from './support';

/**
 * Segments: zero-thickness boundary geometry. No interior, therefore no mass, no
 * point-query hit, and no contact with another segment.
 */

const DT = 1 / 60;

describe('SegmentShape', () => {
  it('is boundary geometry and reports no mass properties', () => {
    const segment = new SegmentShape(-20, 0, 20, 0);

    expect(segment.type).toBe('segment');
    expect(segment.massProperties).toBeNull();
    expect(segment.length).toBeCloseTo(40);
    expect(segment.boundingRadius).toBeCloseTo(20);
    expect([...segment.vertices]).toEqual([-20, 0, 20, 0]);
  });

  it('carries two opposite normals, one per side', () => {
    const segment = new SegmentShape(0, 0, 10, 0);
    const normals = [...segment.normals];

    expect(Math.hypot(normals[0]!, normals[1]!)).toBeCloseTo(1);
    expect(normals[2]).toBeCloseTo(-normals[0]!);
    expect(normals[3]).toBeCloseTo(-normals[1]!);
  });

  it('rejects coincident and non-finite endpoints', () => {
    expect(() => new SegmentShape(5, 5, 5, 5)).toThrow(RangeError);
    expect(() => new SegmentShape(0, 0, Number.POSITIVE_INFINITY, 0)).toThrow(RangeError);
  });

  it('is frozen, like every other shape', () => {
    expect(Object.isFrozen(new SegmentShape(0, 0, 10, 0))).toBe(true);
  });
});

describe('a dynamic body must carry mass', () => {
  it('rejects a dynamic body whose colliders are all boundary geometry', () => {
    const world = new PhysicsWorld();
    const body = new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new SegmentShape(-10, 0, 10, 0) }] });

    expect(() => world.add(body)).toThrow(/at least one collider with mass/);
  });

  it('rejects a dynamic body whose only solid collider has zero density', () => {
    const world = new PhysicsWorld();
    const body = new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10), density: 0 }] });

    expect(() => world.add(body)).toThrow(/at least one collider with mass/);
  });

  it('accepts a boundary collider alongside a solid one', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10) }, { shape: new SegmentShape(-10, 0, 10, 0) }] }));

    // The segment contributes collision only; the mass is the box's alone.
    expect(body.mass).toBeCloseTo(100);
  });

  it('accepts boundary geometry on static and kinematic bodies', () => {
    const world = new PhysicsWorld();

    expect(() => world.add(new PhysicsBody({ type: 'static', colliders: [{ shape: new SegmentShape(-10, 0, 10, 0) }] }))).not.toThrow();
    expect(() => world.add(new PhysicsBody({ type: 'kinematic', colliders: [{ shape: new SegmentShape(0, -10, 0, 10) }] }))).not.toThrow();
  });

  it('rejects removing the one collider a dynamic body draws its mass from', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10) }] }));
    const solid = body.colliders[0]!;

    body.addCollider({ shape: new SegmentShape(-10, 0, 10, 0) });

    // Dropping the box would leave the body colliding through its segment while
    // being massless, which the solver cannot tell apart from a static body.
    expect(() => world.destroyCollider(solid)).toThrow(/only collider carrying mass/);
  });

  it('still allows removing the only collider a dynamic body has', () => {
    const world = new PhysicsWorld();
    const body = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape: new BoxShape(10, 10) }] }));

    expect(() => world.destroyCollider(body.colliders[0]!)).not.toThrow();
  });
});

describe('segment narrow phase', () => {
  const manifold = new Manifold();

  it('blocks a circle from either side', () => {
    const world = new PhysicsWorld();
    const segment = colliderAt(world, new SegmentShape(-40, 0, 40, 0), { x: 0, y: 0 });
    const above = colliderAt(world, new CircleShape(6), { x: 0, y: -4 });
    const below = colliderAt(world, new CircleShape(6), { x: 0, y: 4 });

    expect(collide(segment, above, manifold)).toBe(true);
    expect(manifold.normalY).toBeCloseTo(-1);
    expect(manifold.points[0].penetration).toBeCloseTo(2);

    expect(collide(segment, below, manifold)).toBe(true);
    expect(manifold.normalY).toBeCloseTo(1);
  });

  it('misses a circle beyond its radius', () => {
    const world = new PhysicsWorld();
    const segment = colliderAt(world, new SegmentShape(-40, 0, 40, 0), { x: 0, y: 0 });
    const clear = colliderAt(world, new CircleShape(6), { x: 0, y: -6.5 });

    expect(collide(segment, clear, manifold)).toBe(false);
    expect(testOverlap(segment, clear)).toBe(false);
  });

  it('meets a box with two contact points', () => {
    const world = new PhysicsWorld();
    const segment = colliderAt(world, new SegmentShape(-40, 0, 40, 0), { x: 0, y: 0 });
    const box = colliderAt(world, new BoxShape(20, 20), { x: 0, y: -8 });

    expect(collide(segment, box, manifold)).toBe(true);
    expect(manifold.pointCount).toBe(2);
    expect(manifold.normalY).toBeCloseTo(-1);
  });

  it('meets a capsule', () => {
    const world = new PhysicsWorld();
    const segment = colliderAt(world, new SegmentShape(-40, 0, 40, 0), { x: 0, y: 0 });
    const capsule = colliderAt(world, new CapsuleShape(-10, 0, 10, 0, 6), { x: 0, y: -4 });

    expect(collide(segment, capsule, manifold)).toBe(true);
    expect(manifold.normalY).toBeCloseTo(-1);
    expect(testOverlap(segment, capsule)).toBe(true);
  });

  it('never reports a contact between two segments', () => {
    const world = new PhysicsWorld();
    // Crossing at the origin: as overlapping as two zero-thickness boundaries get.
    const horizontal = colliderAt(world, new SegmentShape(-40, 0, 40, 0), { x: 0, y: 0 });
    const vertical = colliderAt(world, new SegmentShape(0, -40, 0, 40), { x: 0, y: 0 });

    expect(collide(horizontal, vertical, manifold)).toBe(false);
    expect(manifold.pointCount).toBe(0);
    expect(testOverlap(horizontal, vertical)).toBe(false);
  });
});

describe('segments in a world', () => {
  it('holds up a falling box', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 300 }, colliders: [{ shape: new SegmentShape(-400, 0, 400, 0) }] }));

    const box = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 288 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    for (let frame = 0; frame < 180; frame++) {
      world.step(DT);
    }

    expect(box.y).toBeGreaterThan(289);
    expect(box.y).toBeLessThan(291);
  });

  it('never answers a point query, however close the point is', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

    colliderAt(world, new SegmentShape(-40, 0, 40, 0), { x: 0, y: 0 });
    world.step(DT);

    // Exactly on the boundary and just off it: a segment encloses no area, so
    // neither is inside anything.
    expect(world.queryPoint({ x: 0, y: 0 })).toHaveLength(0);
    expect(world.queryPoint({ x: 0, y: 0.0001 })).toHaveLength(0);
  });

  it('still answers AABB queries', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const segment = colliderAt(world, new SegmentShape(-40, 0, 40, 0), { x: 0, y: 0 });

    world.step(DT);

    expect(world.queryAabb({ minX: -5, minY: -5, maxX: 5, maxY: 5 })).toContain(segment);
    expect(world.queryAabb({ minX: 100, minY: 100, maxX: 200, maxY: 200 })).toHaveLength(0);
  });

  it('ray casts from either side, with the normal facing the ray', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

    colliderAt(world, new SegmentShape(-40, 0, 40, 0), { x: 0, y: 0 });
    world.step(DT);

    const fromAbove = world.rayCast({ x: 0, y: -50 }, { x: 0, y: 1 });

    expect(fromAbove).not.toBeNull();
    expect(fromAbove!.distance).toBeCloseTo(50, 6);
    expect(fromAbove!.normal.y).toBeCloseTo(-1);

    const fromBelow = world.rayCast({ x: 0, y: 50 }, { x: 0, y: -1 });

    expect(fromBelow).not.toBeNull();
    expect(fromBelow!.normal.y).toBeCloseTo(1);

    // Past the end of the segment, and parallel to it.
    expect(world.rayCast({ x: 60, y: -50 }, { x: 0, y: 1 })).toBeNull();
    expect(world.rayCast({ x: -60, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });
});
