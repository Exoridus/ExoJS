import { describe, expect, it } from 'vitest';

import { Manifold } from '../src/collision/Manifold';
import { collide } from '../src/collision/narrowphase';
import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

const manifold = new Manifold();

describe('narrow phase — manifold generation', () => {
  it('circle vs circle: normal A→B, single point, correct depth', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new CircleShape(5), { x: 0, y: 0 });
    const b = colliderAt(world, new CircleShape(5), { x: 8, y: 0 });

    expect(collide(a, b, manifold)).toBe(true);
    expect(manifold.pointCount).toBe(1);
    expect(manifold.normalX).toBeCloseTo(1, 6);
    expect(manifold.normalY).toBeCloseTo(0, 6);
    expect(manifold.points[0].penetration).toBeCloseTo(2, 6);
  });

  it('circle vs circle: no contact when separated', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new CircleShape(5), { x: 0, y: 0 });
    const b = colliderAt(world, new CircleShape(5), { x: 20, y: 0 });

    expect(collide(a, b, manifold)).toBe(false);
    expect(manifold.pointCount).toBe(0);
  });

  it('box vs box: two clipped contact points, axis-aligned normal, correct depth', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const b = colliderAt(world, new BoxShape(10, 10), { x: 8, y: 0 });

    expect(collide(a, b, manifold)).toBe(true);
    expect(manifold.pointCount).toBe(2);
    expect(Math.abs(manifold.normalX)).toBeCloseTo(1, 6);
    expect(manifold.normalY).toBeCloseTo(0, 6);
    expect(manifold.points[0].penetration).toBeCloseTo(2, 6);
    expect(manifold.points[1].penetration).toBeCloseTo(2, 6);
  });

  it('circle vs box (face region): normal points circle→box, correct depth', () => {
    const world = new PhysicsWorld();
    const circle = colliderAt(world, new CircleShape(3), { x: 0, y: 7 });
    const box = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });

    expect(collide(circle, box, manifold)).toBe(true);
    expect(manifold.pointCount).toBe(1);
    expect(manifold.normalX).toBeCloseTo(0, 6);
    expect(manifold.normalY).toBeCloseTo(-1, 6);
    expect(manifold.points[0].penetration).toBeCloseTo(1, 6);
  });

  it('box vs circle: the same contact with the normal flipped to box→circle', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const circle = colliderAt(world, new CircleShape(3), { x: 0, y: 7 });

    expect(collide(box, circle, manifold)).toBe(true);
    expect(manifold.normalY).toBeCloseTo(1, 6);
    expect(manifold.points[0].penetration).toBeCloseTo(1, 6);
  });

  it('circle vs box (corner Voronoi region): radial normal, no false contact past the corner', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    // Just outside the (5,5) corner, within radius.
    const near = colliderAt(world, new CircleShape(3), { x: 7, y: 7 });
    // Past the corner, beyond radius.
    const far = colliderAt(world, new CircleShape(1), { x: 8, y: 8 });

    expect(collide(near, box, manifold)).toBe(true);
    expect(collide(far, box, manifold)).toBe(false);
  });

  it('feature ids stay stable across a slow horizontal approach', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const movingBody = world.add(new PhysicsBody({ type: 'static', position: { x: 20, y: 0 } }));
    const b = movingBody.addCollider({ shape: new BoxShape(10, 10) });

    let previousIds: number[] | null = null;

    for (let x = 20; x >= 6; x -= 0.5) {
      movingBody.setTransform({ x, y: 0 });

      if (!collide(a, b, manifold)) {
        continue;
      }

      const ids = [];
      for (let i = 0; i < manifold.pointCount; i++) {
        ids.push(manifold.points[i].id);
      }
      ids.sort((m, n) => m - n);

      if (previousIds !== null) {
        expect(ids).toEqual(previousIds);
      }

      previousIds = ids;
    }

    expect(previousIds).not.toBeNull();
    expect(previousIds).toHaveLength(2);
  });
});
