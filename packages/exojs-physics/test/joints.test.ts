import { describe, expect, it } from 'vitest';

import { BoxShape, DistanceJoint, PhysicsBody, PhysicsWorld } from '../src/index';

/**
 * Joints (spec `02-joints.md`). Soft constraints solved in the sub-step loop
 * alongside contacts. SG-J prefix, default solver config, +Y down.
 */

const GRAVITY = 1000; // px/s²
const FRAME = 1 / 60;

const advance = (world: PhysicsWorld, seconds: number): void => {
  const frames = Math.round(seconds / FRAME);

  for (let frame = 0; frame < frames; frame++) {
    world.step(FRAME);
  }
};

describe('SG-J — joints', () => {
  it('SG-J1: a distance joint holds a hanging body at the rest length', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Bob starts straight below the anchor, past the rest length: the joint pulls
    // it up to 100 and holds it there against gravity.
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 150 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 100 }));

    advance(world, 3);

    // The bob hangs straight down at the rest length under gravity.
    const distance = Math.hypot(bob.x - anchor.x, bob.y - anchor.y);
    expect(distance).toBeCloseTo(100, 0); // within ~1px
    expect(bob.x).toBeCloseTo(0, 0);
    expect(bob.y).toBeGreaterThan(50); // below the anchor (+Y down)
  });

  it('SG-J2: a soft distance joint (hertz>0) settles bounded near the rest length', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 100 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 100, hertz: 2.5, dampingRatio: 1 }));

    advance(world, 4);

    // A damped spring sags under gravity but stays bounded near the rest length.
    const distance = Math.hypot(bob.x - anchor.x, bob.y - anchor.y);
    expect(distance).toBeGreaterThan(95);
    expect(distance).toBeLessThan(160);
    expect(bob.x).toBeCloseTo(0, 0);
  });

  it('SG-J3: waking one jointed body wakes the other (island edge)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const a = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(16, 16) }] }));
    const b = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 100, y: 0 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    world.addJoint(new DistanceJoint({ bodyA: a, bodyB: b, length: 100 }));

    advance(world, 2);
    expect(a.isSleeping).toBe(true);
    expect(b.isSleeping).toBe(true);

    a.applyImpulse(2000, 0); // wake only a directly
    world.step(1 / 60); // the island pass propagates the wake across the joint

    expect(a.isSleeping).toBe(false);
    expect(b.isSleeping).toBe(false);
  });

  it('SG-J4: joint simulation is deterministic across identical runs', () => {
    const run = (): string => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
      const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
      const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 60, y: 120 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

      world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 100 }));

      const trace: string[] = [];

      for (let frame = 0; frame < 180; frame++) {
        world.step(FRAME);
        trace.push(`${bob.x.toFixed(4)},${bob.y.toFixed(4)}`);
      }

      return trace.join('|');
    };

    expect(run()).toBe(run());
  });

  it('SG-J5: removeJoint releases the body (it falls freely)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 100 }, colliders: [{ shape: new BoxShape(16, 16) }] }));
    const joint = world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, length: 100 }));

    advance(world, 1);
    expect(Math.hypot(bob.x - anchor.x, bob.y - anchor.y)).toBeCloseTo(100, 0); // held

    world.removeJoint(joint);
    advance(world, 1);

    expect(bob.y).toBeGreaterThan(250); // now falls freely under gravity
  });
});
