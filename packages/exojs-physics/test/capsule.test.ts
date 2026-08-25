import { describe, expect, it } from 'vitest';

import { Manifold } from '../src/collision/Manifold';
import { collide, testOverlap } from '../src/collision/narrowphase';
import { BoxShape, CapsuleShape, CircleShape, PhysicsBody, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

/**
 * Capsules. Exact geometry throughout - the mass model and the narrow phase both
 * work on the spine and the radius, so nothing here depends on a tessellation.
 */

const DT = 1 / 60;

/** Second moment of area about the centroid, integrated on a grid. */
const integratedInertia = (shape: CapsuleShape, samples = 1200): number => {
  const ax = shape.vertices[0]!;
  const ay = shape.vertices[1]!;
  const bx = shape.vertices[2]!;
  const by = shape.vertices[3]!;
  const r = shape.radius;
  const minX = Math.min(ax, bx) - r;
  const maxX = Math.max(ax, bx) + r;
  const minY = Math.min(ay, by) - r;
  const maxY = Math.max(ay, by) + r;
  const cx = shape.massProperties.centroidX;
  const cy = shape.massProperties.centroidY;
  const cell = ((maxX - minX) / samples) * ((maxY - minY) / samples);
  let inertia = 0;

  for (let ix = 0; ix < samples; ix++) {
    const x = minX + ((ix + 0.5) * (maxX - minX)) / samples;

    for (let iy = 0; iy < samples; iy++) {
      const y = minY + ((iy + 0.5) * (maxY - minY)) / samples;
      const ex = bx - ax;
      const ey = by - ay;
      const lengthSquared = ex * ex + ey * ey;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / lengthSquared));
      const dx = x - (ax + ex * t);
      const dy = y - (ay + ey * t);

      if (dx * dx + dy * dy <= r * r) {
        inertia += ((x - cx) * (x - cx) + (y - cy) * (y - cy)) * cell;
      }
    }
  }

  return inertia;
};

const relativeError = (value: number, reference: number): number => Math.abs(value - reference) / Math.abs(reference);

describe('CapsuleShape', () => {
  it('exposes the spine, its length and a bounding radius', () => {
    const capsule = new CapsuleShape(-15, 0, 15, 0, 5);

    expect(capsule.type).toBe('capsule');
    expect(capsule.length).toBeCloseTo(30);
    expect(capsule.radius).toBe(5);
    expect(capsule.boundingRadius).toBeCloseTo(20);
    expect([...capsule.vertices]).toEqual([-15, 0, 15, 0]);
  });

  it('carries two opposite side normals, like a two-vertex ring', () => {
    const capsule = new CapsuleShape(-10, 0, 10, 0, 4);
    const normals = [...capsule.normals];

    expect(Math.hypot(normals[0]!, normals[1]!)).toBeCloseTo(1);
    expect(normals[2]).toBeCloseTo(-normals[0]!);
    expect(normals[3]).toBeCloseTo(-normals[1]!);
  });

  it('computes the exact area of a rectangle plus two caps', () => {
    const capsule = new CapsuleShape(0, -12, 0, 12, 3);

    expect(capsule.massProperties.area).toBeCloseTo(2 * 3 * 24 + Math.PI * 9, 9);
  });

  it('puts the centroid at the spine midpoint', () => {
    const capsule = new CapsuleShape(10, 20, 30, 60, 6);

    expect(capsule.massProperties.centroidX).toBeCloseTo(20);
    expect(capsule.massProperties.centroidY).toBeCloseTo(40);
  });

  it('matches a circle of the same radius as the spine shrinks', () => {
    const disc = new CircleShape(7);
    const nearlyDisc = new CapsuleShape(0, 0, 0.002, 0, 7);

    expect(nearlyDisc.massProperties.area).toBeCloseTo(disc.massProperties.area, 1);
    // Not exactly equal: a 0.002 px spine still carries a sliver of extra
    // material. Within a thousandth is the honest statement.
    expect(relativeError(nearlyDisc.massProperties.unitInertia, disc.massProperties.unitInertia)).toBeLessThan(1e-3);
  });

  it('agrees with a numerically integrated inertia', () => {
    for (const capsule of [new CapsuleShape(-20, 0, 20, 0, 6), new CapsuleShape(0, -5, 0, 5, 9), new CapsuleShape(-8, -8, 8, 8, 4)]) {
      // The reference is a grid integration, so the comparison is relative:
      // the residual is the sampling error, not a disagreement about the shape.
      expect(relativeError(capsule.massProperties.unitInertia, integratedInertia(capsule))).toBeLessThan(1e-3);
    }
  });

  it('rejects a degenerate spine and a non-positive radius', () => {
    expect(() => new CapsuleShape(0, 0, 0, 0, 5)).toThrow(RangeError);
    expect(() => new CapsuleShape(0, 0, 10, 0, 0)).toThrow(RangeError);
    expect(() => new CapsuleShape(0, 0, 10, 0, -1)).toThrow(RangeError);
    expect(() => new CapsuleShape(0, 0, Number.NaN, 0, 5)).toThrow(RangeError);
  });

  it('is frozen, like every other shape', () => {
    expect(Object.isFrozen(new CapsuleShape(0, 0, 10, 0, 2))).toBe(true);
  });
});

describe('capsule colliders', () => {
  it('takes an AABB from the spine inflated by the radius', () => {
    const world = new PhysicsWorld();
    const collider = colliderAt(world, new CapsuleShape(-10, 0, 10, 0, 4), { x: 100, y: 50 });

    expect(collider.aabb.minX).toBeCloseTo(86);
    expect(collider.aabb.maxX).toBeCloseTo(114);
    expect(collider.aabb.minY).toBeCloseTo(46);
    expect(collider.aabb.maxY).toBeCloseTo(54);
  });

  it('rotates its spine with the body', () => {
    const world = new PhysicsWorld();
    const collider = colliderAt(world, new CapsuleShape(-10, 0, 10, 0, 4), { x: 0, y: 0 }, Math.PI / 2);

    // A quarter turn puts the spine on the Y axis, so the box is tall, not wide.
    expect(collider.aabb.maxX - collider.aabb.minX).toBeCloseTo(8);
    expect(collider.aabb.maxY - collider.aabb.minY).toBeCloseTo(28);
  });
});

describe('capsule narrow phase', () => {
  const manifold = new Manifold();

  it('meets a circle at one point, with the normal along the shortest link', () => {
    const world = new PhysicsWorld();
    const capsule = colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });
    const circle = colliderAt(world, new CircleShape(4), { x: 0, y: 8 });

    expect(collide(capsule, circle, manifold)).toBe(true);
    expect(manifold.pointCount).toBe(1);
    // A → B is capsule → circle, so the normal points along +Y.
    expect(manifold.normalX).toBeCloseTo(0);
    expect(manifold.normalY).toBeCloseTo(1);
    expect(manifold.points[0].penetration).toBeCloseTo(1);
  });

  it('reverses the normal when the operands are swapped', () => {
    const world = new PhysicsWorld();
    const capsule = colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });
    const circle = colliderAt(world, new CircleShape(4), { x: 0, y: 8 });

    expect(collide(circle, capsule, manifold)).toBe(true);
    expect(manifold.normalY).toBeCloseTo(-1);
  });

  it('misses a circle just out of reach and touches one just in reach', () => {
    const world = new PhysicsWorld();
    const capsule = colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });
    const far = colliderAt(world, new CircleShape(4), { x: 0, y: 9.5 });
    const near = colliderAt(world, new CircleShape(4), { x: 0, y: 8.5 });

    expect(collide(capsule, far, manifold)).toBe(false);
    expect(collide(capsule, near, manifold)).toBe(true);
    expect(testOverlap(capsule, far)).toBe(false);
    expect(testOverlap(capsule, near)).toBe(true);
  });

  it('rests on a box with two contact points', () => {
    const world = new PhysicsWorld();
    // Spine parallel to the box's top face, overlapping it slightly.
    const box = colliderAt(world, new BoxShape(200, 20), { x: 0, y: 100 });
    const capsule = colliderAt(world, new CapsuleShape(-15, 0, 15, 0, 6), { x: 0, y: 85 });

    expect(collide(box, capsule, manifold)).toBe(true);
    // A flat rounded side against a face has to produce two points, or the
    // capsule rocks on a single one.
    expect(manifold.pointCount).toBe(2);
    expect(manifold.normalY).toBeCloseTo(-1);
    expect(manifold.points[0].penetration).toBeGreaterThan(0);
    expect(manifold.points[1].penetration).toBeGreaterThan(0);
  });

  it('meets a parallel capsule with two contact points', () => {
    const world = new PhysicsWorld();
    const lower = colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });
    const upper = colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 9 });

    expect(collide(lower, upper, manifold)).toBe(true);
    expect(manifold.pointCount).toBe(2);
    expect(manifold.normalY).toBeCloseTo(1);
  });

  it('separates a capsule pair that only nearly touches', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });
    const b = colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 10.5 });

    expect(collide(a, b, manifold)).toBe(false);
    expect(testOverlap(a, b)).toBe(false);
  });

  it('leaves polygon against polygon exactly as it was', () => {
    const world = new PhysicsWorld();
    const floor = colliderAt(world, new BoxShape(200, 20), { x: 0, y: 100 });
    const box = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 85 });

    expect(collide(floor, box, manifold)).toBe(true);
    expect(manifold.pointCount).toBe(2);

    // Radius-free operands must not pick up the rounded-shape offset: the points
    // stay exactly on a face plane (the floor's top at y = 90 or the box's
    // bottom at y = 95), never half-way between them.
    for (const point of [manifold.points[0], manifold.points[1]]) {
      expect(Math.min(Math.abs(point.y - 90), Math.abs(point.y - 95))).toBeLessThan(1e-9);
    }
  });
});

describe('capsule in a world', () => {
  it('gives a dynamic body the capsule mass model', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const shape = new CapsuleShape(-12, 0, 12, 0, 5);
    const body = world.add(new PhysicsBody({ type: 'dynamic', colliders: [{ shape, density: 2 }] }));

    expect(body.mass).toBeCloseTo(2 * shape.massProperties.area);
    expect(body.inertia).toBeCloseTo(2 * shape.massProperties.unitInertia);
  });

  it('comes to rest on a floor instead of sinking through it', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 320 }, colliders: [{ shape: new BoxShape(1200, 40) }] }));

    // Released just above its resting height, the way the sleeping suite drops
    // its boxes. A long fall is a different question - see the note below.
    const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 288 }, colliders: [{ shape: new CapsuleShape(-15, 0, 15, 0, 8) }] }));

    for (let frame = 0; frame < 180; frame++) {
      world.step(DT);
    }

    // Floor surface at y = 300 and a radius of 8, so the spine rests at 292 plus
    // the solver's contact slop - the capsule stands on its side, not its core.
    expect(body.y).toBeGreaterThan(291.5);
    expect(body.y).toBeLessThan(293);
    expect(Math.abs(body.linearVelocityY)).toBeLessThan(1);
  });

  it('answers point queries against the rounded outline, not the spine box', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

    colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });
    world.step(DT);

    expect(world.queryPoint({ x: 0, y: 0 })).toHaveLength(1); // on the spine
    expect(world.queryPoint({ x: 24, y: 0 })).toHaveLength(1); // inside the end cap
    expect(world.queryPoint({ x: 0, y: 4.9 })).toHaveLength(1); // just inside a side
    expect(world.queryPoint({ x: 0, y: 5.1 })).toHaveLength(0); // just outside a side
    // Inside the AABB corner but outside the rounded cap.
    expect(world.queryPoint({ x: 24.5, y: 4.5 })).toHaveLength(0);
  });

  it('ray casts against the caps and the sides', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

    colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });
    world.step(DT);

    const side = world.rayCast({ x: 0, y: -50 }, { x: 0, y: 1 });

    expect(side).not.toBeNull();
    expect(side!.distance).toBeCloseTo(45, 3);
    expect(side!.normal.y).toBeCloseTo(-1, 3);

    const cap = world.rayCast({ x: -80, y: 0 }, { x: 1, y: 0 });

    expect(cap).not.toBeNull();
    expect(cap!.distance).toBeCloseTo(55, 3);
    expect(cap!.normal.x).toBeCloseTo(-1, 3);

    // Passes above the capsule entirely.
    expect(world.rayCast({ x: -80, y: -6 }, { x: 1, y: 0 })).toBeNull();
  });

  it('overlaps a capsule query shape against the world', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const box = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 });

    world.step(DT);

    expect(world.overlapShape(new CapsuleShape(-30, 0, 30, 0, 4), { x: 0, y: 12 })).toContain(box);
    expect(world.overlapShape(new CapsuleShape(-30, 0, 30, 0, 4), { x: 0, y: 30 })).toHaveLength(0);
  });
});
