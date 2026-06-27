import { describe, expect, it } from 'vitest';

import { BoxShape, CircleShape, DistanceJoint, PhysicsBody, PhysicsWorld, PrismaticJoint, RevoluteJoint, WeldJoint, WheelJoint } from '../src/index';

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

  it('SG-J6: a revolute joint pins the bob to the pivot as it swings', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Bob hangs down-right of the pivot at the world origin; it swings under gravity.
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 70, y: 70 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: bob, anchor: { x: 0, y: 0 } }));

    const radius = Math.hypot(70, 70);
    let minX = bob.x;

    for (let frame = 0; frame < 240; frame++) {
      world.step(FRAME);
      // The pinned point holds: the bob's centre stays at a fixed radius from the pivot.
      expect(Math.abs(Math.hypot(bob.x, bob.y) - radius)).toBeLessThan(1.5);
      minX = Math.min(minX, bob.x);
    }

    expect(minX).toBeLessThan(-30); // it swung through the bottom to the far side
  });

  it('SG-J7: a two-link revolute chain keeps its shared hinge coincident', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const link1 = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 50, y: 0 }, colliders: [{ shape: new BoxShape(100, 8) }] }));
    const link2 = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 150, y: 0 }, colliders: [{ shape: new BoxShape(100, 8) }] }));

    world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: link1, anchor: { x: 0, y: 0 } })); // link1 left ↔ origin
    world.addJoint(new RevoluteJoint({ bodyA: link1, bodyB: link2, anchor: { x: 100, y: 0 } })); // link2 left ↔ link1 right

    advance(world, 4);

    // link1's right end and link2's left end (the shared hinge) stay coincident.
    const r1x = link1.x + Math.cos(link1.angle) * 50;
    const r1y = link1.y + Math.sin(link1.angle) * 50;
    const l2x = link2.x - Math.cos(link2.angle) * 50;
    const l2y = link2.y - Math.sin(link2.angle) * 50;

    expect(Math.hypot(r1x - l2x, r1y - l2y)).toBeLessThan(2);
    expect(Number.isFinite(link2.y)).toBe(true);
  });

  it('SG-J8: a weld joint holds a body rigidly to a static anchor (position + angle)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const box = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 50, y: 30 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(new WeldJoint({ bodyA: anchor, bodyB: box }));

    advance(world, 3);

    // Welded to an immovable anchor → it holds both position and angle against gravity.
    expect(box.x).toBeCloseTo(50, 0);
    expect(box.y).toBeCloseTo(30, 0);
    expect(Math.abs(box.angle)).toBeLessThan(0.02);
  });

  it('SG-J9: two welded dynamic bodies keep their relative pose while swinging', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const a = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 60, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));
    const b = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 100, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: a, anchor: { x: 0, y: 0 } })); // a swings about the origin
    world.addJoint(new WeldJoint({ bodyA: a, bodyB: b })); // b welded rigidly to a

    const distance0 = Math.hypot(b.x - a.x, b.y - a.y);
    const relativeAngle0 = b.angle - a.angle;

    advance(world, 3);

    // The weld keeps b rigid to a: same separation and same relative orientation.
    expect(Math.abs(Math.hypot(b.x - a.x, b.y - a.y) - distance0)).toBeLessThan(2);
    expect(Math.abs(b.angle - a.angle - relativeAngle0)).toBeLessThan(0.05);
  });

  it('SG-J10: a distance joint with maxLength acts as a rope — slack allowed, clamped at max', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Bob starts above the rope's full length → slack → falls freely until taut.
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 50 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, maxLength: 100 }));

    // While within maxLength the rope is slack → the bob falls freely (not held at 50).
    advance(world, 0.05);
    expect(Math.hypot(bob.x, bob.y)).toBeGreaterThan(50);

    advance(world, 2);
    const distance = Math.hypot(bob.x, bob.y);
    expect(distance).toBeLessThan(101); // never stretches past the rope length
    expect(distance).toBeGreaterThan(95); // hangs taut at ~max
  });

  it('SG-J11: a motorized revolute joint reaches and holds its target speed', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(40, 40) }] }));

    world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: wheel, anchor: { x: 0, y: 0 }, enableMotor: true, motorSpeed: 5, maxMotorTorque: 1e8 }));

    advance(world, 1);

    expect(wheel.angularVelocity).toBeCloseTo(5, 0); // driven to the target rad/s and held
  });

  it('SG-J12: a revolute joint angle limit caps the swing', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // A bar pinned at its left end; gravity swings it until the limit blocks it.
    const bar = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 50, y: 0 }, colliders: [{ shape: new BoxShape(100, 10) }] }));
    const limit = Math.PI / 4;

    world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: bar, anchor: { x: 0, y: 0 }, enableLimit: true, lowerAngle: -limit, upperAngle: limit }));

    advance(world, 3);

    expect(Math.abs(bar.angle)).toBeLessThan(limit + 0.05); // never past the limit
    expect(Math.abs(bar.angle)).toBeGreaterThan(limit - 0.15); // swung to and rests at the limit
  });

  it('SG-J13: a prismatic joint constrains a body to its axis (no perpendicular drift, no rotation)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Horizontal slide axis (1,0); gravity is perpendicular → must not move the body.
    const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: 1, y: 0 } }));

    advance(world, 2);

    expect(Math.abs(slider.y)).toBeLessThan(1); // perpendicular locked — gravity can't pull it off the axis
    expect(Math.abs(slider.angle)).toBeLessThan(0.02); // rotation locked
  });

  it('SG-J14: a prismatic limit caps travel along the axis', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Vertical slide axis (0,1) = gravity → the body slides down but the limit caps it at 100.
    const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(
      new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: 0, y: 1 }, enableLimit: true, lowerTranslation: 0, upperTranslation: 100 }),
    );

    advance(world, 3);

    expect(slider.y).toBeGreaterThan(95); // slid down the axis to the limit
    expect(slider.y).toBeLessThan(101); // capped at upperTranslation
    expect(Math.abs(slider.x)).toBeLessThan(1); // perpendicular locked
  });

  it('SG-J15: a prismatic motor drives the body along its axis', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(
      new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: 1, y: 0 }, enableMotor: true, motorSpeed: 100, maxMotorForce: 1e8 }),
    );

    advance(world, 0.5);

    expect(slider.x).toBeGreaterThan(20); // motor drove it along +x
    expect(Math.abs(slider.y)).toBeLessThan(1); // stayed on the axis
  });

  it('SG-J16: a wheel joint locks lateral motion but lets the wheel spin', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const chassis = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 30 }, colliders: [{ shape: new CircleShape(10) }] }));

    // Suspension axis vertical (0,1): the wheel may travel along it (sprung) + spin, but not slide sideways.
    world.addJoint(new WheelJoint({ bodyA: chassis, bodyB: wheel, anchor: { x: 0, y: 30 }, axis: { x: 0, y: 1 }, hertz: 5, dampingRatio: 1 }));

    wheel.angularVelocity = 10; // give it spin
    wheel.applyImpulse(5000, 0); // shove it sideways (perpendicular to the axis)

    advance(world, 1);

    expect(Math.abs(wheel.x)).toBeLessThan(2); // lateral locked — did not slide sideways
    expect(Math.abs(wheel.angularVelocity)).toBeGreaterThan(5); // rotation is free — still spinning
  });
});
