import { describe, expect, it } from 'vitest';

import {
  BoxShape,
  CircleShape,
  DistanceJoint,
  MouseJoint,
  PhysicsBody,
  PhysicsWorld,
  PrismaticJoint,
  RevoluteJoint,
  WeldJoint,
  WheelJoint,
} from '../src/index';

/**
 * Joints. Soft constraints solved in the sub-step loop
 * alongside contacts. Default solver config, +Y down.
 */

const GRAVITY = 1000; // px/s²
const FRAME = 1 / 60;

const advance = (world: PhysicsWorld, seconds: number): void => {
  const frames = Math.round(seconds / FRAME);

  for (let frame = 0; frame < frames; frame++) {
    world.step(FRAME);
  }
};

describe('joints', () => {
  it('a distance joint holds a hanging body at the rest length', () => {
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

  it('a soft distance joint (hertz>0) settles bounded near the rest length', () => {
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

  it('waking one jointed body wakes the other (island edge)', () => {
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

  it('joint simulation is deterministic across identical runs', () => {
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

  it('removeJoint releases the body (it falls freely)', () => {
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

  it('a revolute joint pins the bob to the pivot as it swings', () => {
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

  it('a two-link revolute chain keeps its shared hinge coincident', () => {
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

  it('a weld joint holds a body rigidly to a static anchor (position + angle)', () => {
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

  it('two welded dynamic bodies keep their relative pose while swinging', () => {
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

  it('a distance joint with maxLength acts as a rope — slack allowed, clamped at max', () => {
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

  it('a motorized revolute joint reaches and holds its target speed', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(40, 40) }] }));

    world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: wheel, anchor: { x: 0, y: 0 }, enableMotor: true, motorSpeed: 5, maxMotorTorque: 1e8 }));

    advance(world, 1);

    expect(wheel.angularVelocity).toBeCloseTo(5, 0); // driven to the target rad/s and held
  });

  it('a revolute joint angle limit caps the swing', () => {
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

  it('a prismatic joint constrains a body to its axis (no perpendicular drift, no rotation)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Horizontal slide axis (1,0); gravity is perpendicular → must not move the body.
    const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: 1, y: 0 } }));

    advance(world, 2);

    expect(Math.abs(slider.y)).toBeLessThan(1); // perpendicular locked — gravity can't pull it off the axis
    expect(Math.abs(slider.angle)).toBeLessThan(0.02); // rotation locked
  });

  it('a prismatic limit caps travel along the axis', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Vertical slide axis (0,1) = gravity → the body slides down but the limit caps it at 100.
    const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(
      new PrismaticJoint({
        bodyA: anchor,
        bodyB: slider,
        anchor: { x: 0, y: 0 },
        axis: { x: 0, y: 1 },
        enableLimit: true,
        lowerTranslation: 0,
        upperTranslation: 100,
      }),
    );

    advance(world, 3);

    expect(slider.y).toBeGreaterThan(95); // slid down the axis to the limit
    expect(slider.y).toBeLessThan(101); // capped at upperTranslation
    expect(Math.abs(slider.x)).toBeLessThan(1); // perpendicular locked
  });

  it('a prismatic motor drives the body along its axis', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(
      new PrismaticJoint({
        bodyA: anchor,
        bodyB: slider,
        anchor: { x: 0, y: 0 },
        axis: { x: 1, y: 0 },
        enableMotor: true,
        motorSpeed: 100,
        maxMotorForce: 1e8,
      }),
    );

    advance(world, 0.5);

    expect(slider.x).toBeGreaterThan(20); // motor drove it along +x
    expect(Math.abs(slider.y)).toBeLessThan(1); // stayed on the axis
  });

  it('a wheel joint locks lateral motion but lets the wheel spin', () => {
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

  it('a mouse joint drags a body to its target and tracks it when moved', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    // Grab the body at its centre and pull it toward (50, 0).
    const joint = world.addJoint(new MouseJoint({ body, target: { x: 0, y: 0 }, hertz: 5, dampingRatio: 1 }));
    joint.target = { x: 50, y: 0 };

    advance(world, 1);
    expect(body.x).toBeGreaterThan(40); // converged near the target

    // Move the target - the body follows.
    joint.target = { x: 50, y: 60 };
    advance(world, 1);
    expect(body.y).toBeGreaterThan(45);
  });

  it('maxForce caps how hard a mouse joint can pull', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const heavy = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20), density: 100 }] }));

    // A tiny force against a far target: it creeps but cannot snap across.
    const joint = world.addJoint(new MouseJoint({ body: heavy, target: { x: 0, y: 0 }, hertz: 5, dampingRatio: 1, maxForce: 50 }));
    joint.target = { x: 1000, y: 0 };

    advance(world, 1);

    expect(heavy.x).toBeGreaterThan(0); // it did move toward the target
    expect(heavy.x).toBeLessThan(200); // but maxForce kept it from reaching the far target
  });

  it('a motorized wheel joint reaches and holds its target spin speed', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const chassis = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 30 }, colliders: [{ shape: new CircleShape(10) }] }));

    world.addJoint(
      new WheelJoint({ bodyA: chassis, bodyB: wheel, anchor: { x: 0, y: 30 }, axis: { x: 0, y: 1 }, enableMotor: true, motorSpeed: 5, maxMotorTorque: 1e8 }),
    );

    advance(world, 1);

    expect(wheel.angularVelocity).toBeCloseTo(5, 0); // driven to the target rad/s and held
  });

  it('a wheel suspension spring settles to a bounded rest sag under gravity', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const chassis = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Suspension axis vertical (0,1) = gravity: an unloaded soft spring sags then settles.
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 30 }, colliders: [{ shape: new CircleShape(10) }] }));

    world.addJoint(new WheelJoint({ bodyA: chassis, bodyB: wheel, anchor: { x: 0, y: 30 }, axis: { x: 0, y: 1 }, hertz: 1, dampingRatio: 1 }));

    advance(world, 3);

    const settledY = wheel.y;
    expect(settledY).toBeGreaterThan(40); // sagged down under gravity
    expect(settledY).toBeLessThan(90); // but bounded by the spring, not free fall
    expect(Math.abs(wheel.x)).toBeLessThan(1); // lateral still locked

    advance(world, 0.5);
    expect(Math.abs(wheel.y - settledY)).toBeLessThan(1); // at rest — no longer moving
  });

  it('a wheel suspension-travel limit caps how far the spring compresses', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const chassis = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // The same spring that settles to a bounded rest sag above would sag to ~55 (translation ~25) under gravity
    // alone, but the travel limit caps the compression at upperTranslation (20).
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 30 }, colliders: [{ shape: new CircleShape(10) }] }));

    world.addJoint(
      new WheelJoint({
        bodyA: chassis,
        bodyB: wheel,
        anchor: { x: 0, y: 30 },
        axis: { x: 0, y: 1 },
        hertz: 1,
        dampingRatio: 1,
        enableLimit: true,
        lowerTranslation: -20,
        upperTranslation: 20,
      }),
    );

    advance(world, 3);

    expect(wheel.y).toBeGreaterThan(45); // pulled down to the limit
    expect(wheel.y).toBeLessThan(51); // capped at upperTranslation (30 + 20)
  });

  // ── Edge-case coverage: joint limits at their boundary, zero-length axes,
  // soft-spring branches and fixed-rotation degenerate-mass paths ───────────

  it('a distance joint with minLength acts as a strut — stops a body from crushing into the anchor', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Bob starts well above the anchor and falls toward it under gravity; the strut
    // (minLength only - maxLength defaults to Infinity) stops it at minLength instead
    // of letting it crush through to the anchor.
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: -300 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    world.addJoint(new DistanceJoint({ bodyA: anchor, bodyB: bob, minLength: 100 }));

    advance(world, 3);

    const distance = Math.hypot(bob.x - anchor.x, bob.y - anchor.y);
    expect(distance).toBeGreaterThan(95); // never crushed below minLength
    expect(distance).toBeLessThan(160); // and not flung far past it either
    expect(bob.y).toBeLessThan(0); // still above the anchor — never crossed through
  });

  it('handles coincident anchors at prepare time (zero-length axis) without producing NaN', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const a = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(16, 16) }] }));
    const b = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    // Both anchors default to their body's position - identical points, so the
    // connecting axis has zero length at the first _prepare().
    world.addJoint(new DistanceJoint({ bodyA: a, bodyB: b, length: 50 }));

    world.step(1 / 60);

    expect(Number.isFinite(a.x)).toBe(true);
    expect(Number.isFinite(a.y)).toBe(true);
    expect(Number.isFinite(b.x)).toBe(true);
    expect(Number.isFinite(b.y)).toBe(true);
  });

  it('uses default hertz/dampingRatio/maxForce when omitted, and target reads back the current point', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    const joint = world.addJoint(new MouseJoint({ body, target: { x: 0, y: 0 } }));

    expect(joint.hertz).toBe(5);
    expect(joint.dampingRatio).toBe(0.7);
    expect(joint.maxForce).toBe(Infinity);
    expect(joint.target).toEqual({ x: 0, y: 0 });

    joint.target = { x: 30, y: 0 }; // move the target away — the default soft spring pulls the body toward it
    expect(joint.target).toEqual({ x: 30, y: 0 });

    advance(world, 1);

    expect(body.x).toBeGreaterThan(20); // still converges toward the target with the defaults
  });

  it('a zero-length axis in a prismatic joint is rejected at construction', () => {
    // A (0,0) axis cannot be normalized into a direction - silently creating a
    // joint that constrains nothing would let the body free-fall.
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    expect(() => new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: 0, y: 0 } })).toThrow(RangeError);
    expect(() => new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: Number.NaN, y: 0 } })).toThrow(RangeError);
  });

  it('a prismatic joint with a fixed-rotation slider keeps the perpendicular lock solvable (k22 fallback)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    // Both bodies are rotation-locked (static anchor + fixedRotation slider): iA+iB=0,
    // which would make the perpendicular+angular block matrix singular without the
    // `_k22 = 1` fallback.
    const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, fixedRotation: true, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: 1, y: 0 } }));

    advance(world, 2);

    expect(Math.abs(slider.y)).toBeLessThan(1); // perpendicular still locked with both bodies rotation-locked
    expect(slider.angle).toBe(0);
  });

  it('a soft revolute joint (hertz>0) settles bounded near the pivot radius', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 70, y: 0 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: bob, anchor: { x: 0, y: 0 }, hertz: 3, dampingRatio: 1 }));

    advance(world, 2);

    // A soft pin lets the anchor point drift a little under load but stays bounded.
    const radius = Math.hypot(bob.x, bob.y);
    expect(radius).toBeGreaterThan(60);
    expect(radius).toBeLessThan(140);
    expect(Number.isFinite(bob.angle)).toBe(true);
  });

  it('an angular motor on a fixed-rotation body does nothing (zero angular effective mass)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const bob = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 50, y: 0 }, fixedRotation: true, colliders: [{ shape: new BoxShape(16, 16) }] }));

    world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: bob, anchor: { x: 0, y: 0 }, enableMotor: true, motorSpeed: 10, maxMotorTorque: 1e8 }));

    advance(world, 1);

    expect(bob.angularVelocity).toBe(0); // fixed rotation — zero angular mass, the motor can't spin it
  });

  it('a revolute lower-angle limit engages its Baumgarte push-back when violently overshot', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const bar = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 50, y: 0 }, colliders: [{ shape: new BoxShape(100, 10) }] }));

    world.addJoint(new RevoluteJoint({ bodyA: anchor, bodyB: bar, anchor: { x: 0, y: 0 }, enableLimit: true, lowerAngle: -0.2, upperAngle: 0.2 }));

    bar.angularVelocity = -50; // slam it hard into the lower limit, forcing a real overshoot

    advance(world, 0.5);

    expect(bar.angle).toBeGreaterThanOrEqual(-0.3); // the limit + push-back stopped it near lowerAngle
    expect(Number.isFinite(bar.angle)).toBe(true);
  });

  it('a soft weld joint (linearHertz/angularHertz>0) holds bounded near the anchor pose', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const box = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 50, y: 30 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(new WeldJoint({ bodyA: anchor, bodyB: box, linearHertz: 3, angularHertz: 3, dampingRatio: 1 }));

    advance(world, 1);

    // A soft weld is compliant under load (it can sag/rotate noticeably, unlike the
    // rigid weld above) but still bounded - not flung away or blown up to NaN/Inf.
    expect(Number.isFinite(box.x)).toBe(true);
    expect(Number.isFinite(box.y)).toBe(true);
    expect(Number.isFinite(box.angle)).toBe(true);
    expect(Math.hypot(box.x, box.y)).toBeLessThan(300);
  });

  it('a weld joint between fixed-rotation bodies still locks position (zero angular effective mass)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const box = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 50, y: 0 }, fixedRotation: true, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(new WeldJoint({ bodyA: anchor, bodyB: box }));

    advance(world, 2);

    expect(box.x).toBeCloseTo(50, 0);
    expect(box.angle).toBe(0); // fixed rotation — never rotates regardless of the angular constraint
  });

  it('a zero-length axis in a wheel joint is rejected at construction', () => {
    // Same rationale as the prismatic joint above: a (0,0) axis cannot be
    // normalized, so suspension spring and lateral lock would apply zero force.
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const chassis = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 30 }, colliders: [{ shape: new CircleShape(10) }] }));

    expect(() => new WheelJoint({ bodyA: chassis, bodyB: wheel, anchor: { x: 0, y: 30 }, axis: { x: 0, y: 0 }, hertz: 5, dampingRatio: 1 })).toThrow(
      RangeError,
    );
  });

  it('a wheel motor on a fixed-rotation wheel does nothing (zero angular effective mass)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const chassis = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 30 }, fixedRotation: true, colliders: [{ shape: new CircleShape(10) }] }));

    world.addJoint(
      new WheelJoint({ bodyA: chassis, bodyB: wheel, anchor: { x: 0, y: 30 }, axis: { x: 0, y: 1 }, enableMotor: true, motorSpeed: 20, maxMotorTorque: 1e8 }),
    );

    advance(world, 1);

    expect(wheel.angularVelocity).toBe(0); // fixed rotation — zero angular mass, the motor can't spin it
  });

  it('a wheel lower-translation limit engages its Baumgarte push-back when violently overshot', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const chassis = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 30 }, colliders: [{ shape: new CircleShape(10) }] }));

    // A soft suspension (hertz>0) actually allows axis travel - with hertz=0 (rigid)
    // the axial "spring" alone holds the translation near 0, so the limit would never
    // see a violation to push back from.
    world.addJoint(
      new WheelJoint({
        bodyA: chassis,
        bodyB: wheel,
        anchor: { x: 0, y: 30 },
        axis: { x: 0, y: 1 },
        hertz: 1,
        dampingRatio: 1,
        enableLimit: true,
        lowerTranslation: -15,
        upperTranslation: 15,
      }),
    );

    wheel.linearVelocityY = -3000; // slam it hard away from the chassis, past lowerTranslation

    advance(world, 0.3);

    expect(wheel.y).toBeGreaterThan(0); // the lower limit + push-back stopped the overshoot before it ran away
    expect(Number.isFinite(wheel.y)).toBe(true);
  });
});

/**
 * Whether a joint's two bodies also collide with each other.
 *
 * `false` takes the pair out of collision before the narrow phase, which is
 * what a chain or a ragdoll usually wants: a chain pinned at the edge its links
 * share otherwise carries one contact per jointed pair, and the contact solver
 * spends every step pushing apart what the joint is holding together.
 *
 * The default stays `true` - the behaviour every joint has had so far - because
 * a revolute chain measured over a long window gains energy once those contacts
 * are gone. These cover what the option does, not whether a chain stays settled
 * without the contacts; that is a solver question and is deliberately not
 * pinned by an assertion here.
 *
 * The contacts are counted through the world's own contact graph rather than
 * through a derived position, because the point is whether the pair reaches the
 * narrow phase at all.
 */
describe('connected-body collision', () => {
  /** Two overlapping boxes, jointed at the point they share. */
  const pinnedPair = (collideConnected?: boolean): { world: PhysicsWorld; joint: RevoluteJoint } => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    const a = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));
    const b = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 10, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));
    const joint = world.addJoint(
      new RevoluteJoint({ bodyA: a, bodyB: b, anchor: { x: 5, y: 0 }, ...(collideConnected !== undefined && { collideConnected }) }),
    );

    return { world, joint };
  };

  const contacts = (world: PhysicsWorld): number => world.backend.contactGraph.solidContacts.length;

  it('leaves a jointed pair colliding by default', () => {
    const { world } = pinnedPair();

    world.step(FRAME);

    expect(contacts(world)).toBeGreaterThan(0);
  });

  it('takes an opted-out pair out of the contact graph', () => {
    const { world } = pinnedPair(false);

    world.step(FRAME);

    expect(contacts(world)).toBe(0);
  });

  it('reports what the joint was constructed with', () => {
    expect(pinnedPair().joint.collideConnected).toBe(true);
    expect(pinnedPair(false).joint.collideConnected).toBe(false);
  });

  it('lets the pair collide again once the joint is removed', () => {
    const { world, joint } = pinnedPair(false);

    world.step(FRAME);
    expect(contacts(world)).toBe(0);

    world.removeJoint(joint);
    world.step(FRAME);

    expect(contacts(world)).toBeGreaterThan(0);
  });

  it('keeps the pair apart while any joint of it still asks for that', () => {
    const { world, joint } = pinnedPair(false);
    const [a, b] = world.bodies;
    // A second joint on the same pair, opting in. The pair is held apart while
    // either joint asks for it: a reference count, not a last-writer-wins flag.
    const second = world.addJoint(new RevoluteJoint({ bodyA: a!, bodyB: b!, anchor: { x: 5, y: 0 }, collideConnected: true }));

    world.step(FRAME);
    expect(contacts(world)).toBe(0);

    world.removeJoint(joint);
    world.step(FRAME);
    expect(contacts(world)).toBeGreaterThan(0);

    world.removeJoint(second);
    world.step(FRAME);
    expect(contacts(world)).toBeGreaterThan(0);
  });

  it('does not let a disabled joint start pushing its own bodies apart', () => {
    // Suspending the constraint must not hand the pair to the contact solver:
    // a ragdoll whose joints are briefly disabled would come apart at the seams.
    const { world, joint } = pinnedPair(false);

    joint.enabled = false;
    world.step(FRAME);

    expect(contacts(world)).toBe(0);
  });

  it('builds a chain of edge-to-edge links with no contact between the links', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY }, enableSleeping: false });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    let previous = anchor;

    for (let index = 1; index <= 8; index++) {
      const link = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: index * 16 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

      world.addJoint(new RevoluteJoint({ bodyA: previous, bodyB: link, anchor: { x: 0, y: index * 16 - 8 }, collideConnected: false }));
      previous = link;
    }

    advance(world, 0.5);

    // What the option guarantees, and only that: the seams the joints hold are
    // not also contacts. Whether the chain stays settled over a long window is
    // a property of the joint solver and is not asserted here.
    expect(contacts(world)).toBe(0);
    expect(Number.isFinite(previous.y)).toBe(true);
  });
});

/**
 * What a joint's presence in a world means for the bodies it constrains.
 *
 * These are the seams the pair-keyed collision suppression made load-bearing. A
 * joint left behind by a destroyed body keeps being prepared, warm-started and
 * solved against it, and the pair claim it holds is one nothing can release
 * again, because the joint that owned it is no longer reachable.
 */
describe('joint lifecycle', () => {
  const boxBody = (world: PhysicsWorld, x: number, y: number, type: 'static' | 'dynamic' = 'dynamic'): PhysicsBody =>
    world.add(new PhysicsBody({ type, position: { x, y }, colliders: [{ shape: new BoxShape(20, 20) }] }));

  it('refuses a joint between one body and itself', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = boxBody(world, 0, 0);

    expect(() => world.addJoint(new RevoluteJoint({ bodyA: body, bodyB: body, anchor: { x: 0, y: 0 } }))).toThrow(/two different bodies/);
  });

  it('refuses a joint that constrains a destroyed body', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const a = boxBody(world, 0, 0);
    const b = boxBody(world, 40, 0);

    world.destroyBody(b);

    expect(() => world.addJoint(new RevoluteJoint({ bodyA: a, bodyB: b, anchor: { x: 20, y: 0 } }))).toThrow(/destroyed body/);
  });

  it('refuses a joint whose bodies belong to another world', () => {
    // Ids are handed out per world, so a pair key built from two worlds' bodies
    // names a pair that exists in neither.
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const other = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const mine = boxBody(world, 0, 0);
    const theirs = boxBody(other, 40, 0);

    expect(() => world.addJoint(new RevoluteJoint({ bodyA: mine, bodyB: theirs, anchor: { x: 20, y: 0 } }))).toThrow(/another world/);
  });

  it('drops the joints of a destroyed body', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    const a = boxBody(world, 0, 0);
    const b = boxBody(world, 10, 0);

    world.addJoint(new RevoluteJoint({ bodyA: a, bodyB: b, anchor: { x: 5, y: 0 }, collideConnected: false }));
    world.step(FRAME);
    expect(world.joints).toHaveLength(1);
    expect(world.backend.contactGraph.solidContacts).toHaveLength(0);

    world.destroyBody(b);
    world.step(FRAME);

    // Ids are never handed out twice, so no later body can inherit the pair
    // this joint claimed; what the removal has to establish is that the joint
    // stops being solved against a body that no longer exists.
    expect(world.joints).toHaveLength(0);
    expect(b.destroyed).toBe(true);
  });

  it("releases the pair claim a destroyed body's joint held", () => {
    // The surviving body is put back into contact with a third one, which the
    // claim would still be suppressing had it outlived the joint.
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    const a = boxBody(world, 0, 0);
    const b = boxBody(world, 10, 0);

    world.addJoint(new RevoluteJoint({ bodyA: a, bodyB: b, anchor: { x: 5, y: 0 }, collideConnected: false }));
    world.step(FRAME);
    expect(world.backend.contactGraph.solidContacts).toHaveLength(0);

    world.destroyBody(b);
    boxBody(world, 10, 0);
    world.step(FRAME);

    expect(world.backend.contactGraph.solidContacts.length).toBeGreaterThan(0);
  });

  it('counts one joint once however often it is added', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    const a = boxBody(world, 0, 0);
    const b = boxBody(world, 10, 0);
    const joint = new RevoluteJoint({ bodyA: a, bodyB: b, anchor: { x: 5, y: 0 }, collideConnected: false });

    world.addJoint(joint);
    world.addJoint(joint);
    world.step(FRAME);
    expect(world.joints).toHaveLength(1);

    // One removal has to be enough: a second registration that also bumped the
    // pair count would leave the pair suppressed forever.
    world.removeJoint(joint);
    world.step(FRAME);

    expect(world.joints).toHaveLength(0);
    expect(world.backend.contactGraph.solidContacts.length).toBeGreaterThan(0);
  });

  it('survives removing one joint twice', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    const a = boxBody(world, 0, 0);
    const b = boxBody(world, 10, 0);
    const joint = world.addJoint(new RevoluteJoint({ bodyA: a, bodyB: b, anchor: { x: 5, y: 0 }, collideConnected: false }));

    world.step(FRAME);
    world.removeJoint(joint);
    world.removeJoint(joint);
    world.step(FRAME);

    expect(world.joints).toHaveLength(0);
    expect(world.backend.contactGraph.solidContacts.length).toBeGreaterThan(0);
  });

  it('sweeps a bullet through the body its joint took it out of collision with', () => {
    // CCD is a second collision path, not a second collision semantics: without
    // the same filter a swept bullet is stopped by a neighbour the discrete path
    // is not allowed to collide it with.
    //
    // The assertion is where the bullet ENDED UP, not the contact count: the
    // sweep runs after detection, so a bullet the old path clamped at the wall
    // produces its contact on the following step and leaves this one looking
    // clean either way.
    //
    // The joint is a prismatic rail along the flight path rather than a pin:
    // it has to take the pair out of collision without also holding the bullet
    // still, which is what a revolute anchor to a static wall would do.
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    const wall = boxBody(world, 400, 0, 'static');
    const bullet = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, isBullet: true, colliders: [{ shape: new BoxShape(8, 8) }] }));

    world.addJoint(new PrismaticJoint({ bodyA: wall, bodyB: bullet, anchor: { x: 0, y: 0 }, axis: { x: 1, y: 0 }, collideConnected: false }));
    // 1000 px in one step at 60 Hz, so a clamp at the wall is unmistakable.
    bullet.linearVelocityX = 60_000;

    world.step(FRAME);

    expect(bullet.x).toBeGreaterThan(wall.x + 100);
  });

  it('still stops a bullet at a body it is not jointed to', () => {
    // The counterpart, so the test above cannot pass by CCD being off entirely.
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, enableSleeping: false });
    const wall = boxBody(world, 400, 0, 'static');
    const bullet = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, isBullet: true, colliders: [{ shape: new BoxShape(8, 8) }] }));

    bullet.linearVelocityX = 60_000;

    world.step(FRAME);

    expect(bullet.x).toBeLessThan(wall.x);
  });
});

/**
 * A hanging revolute chain has to stay where it was built.
 *
 * The scene is the neutral benchmark chain: equal 16 px boxes at density 1,
 * pinned at the seam they share so every joint starts at zero error, hanging
 * from a static anchor under gravity, with nothing driving it. Left to itself
 * it must lose energy, not gain it.
 *
 * It did gain it. Chains of seven links and up accelerated along their own axis
 * from a standing start - 8 links reached ~1760 px/s inside 100 steps and 12
 * diverged outright - while the same chains held still as long as the links
 * also collided at their seams. Those contacts were damping a solver defect:
 * the point constraint solved every sub-step against the anchor error measured
 * at frame start, so each sub-step re-corrected an error the previous one had
 * already taken out, and it applied that correction through an unscaled bias
 * that relaxed none of the impulse it accumulated.
 *
 * The window is what the old 0.5 s test could not reach: the growth was not
 * visible before step 75 and not decisive before several hundred.
 */
describe('revolute chain stability', () => {
  /** Steps to run - ten seconds at the fixed rate, well past where the growth used to be unmistakable. */
  const WINDOW = 600;

  /** How far a link may hang below where it was built. A soft constraint stretches under load; it must not drift. */
  const MAX_SAG_PX = 8;

  const hangChain = (links: number): { world: PhysicsWorld; chain: readonly PhysicsBody[] } => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const chain: PhysicsBody[] = [];
    let previous = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 200 }, colliders: [{ shape: new BoxShape(16, 16) }] }));

    for (let link = 1; link <= links; link++) {
      const y = 200 + link * 16;
      const body = world.add(
        new PhysicsBody({ type: 'dynamic', position: { x: 0, y }, colliders: [{ shape: new BoxShape(16, 16), density: 1, friction: 0.5 }] }),
      );

      // Connected-body collision off: the seam contacts are exactly what used
      // to hold this chain together, and the joint has to do it on its own.
      world.addJoint(new RevoluteJoint({ bodyA: previous, bodyB: body, anchor: { x: 0, y: y - 8 }, collideConnected: false }));
      chain.push(body);
      previous = body;
    }

    return { world, chain };
  };

  const fastest = (chain: readonly PhysicsBody[]): number =>
    chain.reduce((peak, body) => Math.max(peak, Math.hypot(body.linearVelocityX, body.linearVelocityY)), 0);

  for (const links of [7, 8, 12]) {
    it(`holds a ${String(links)}-link chain still for ${String(WINDOW)} steps`, () => {
      const { world, chain } = hangChain(links);
      let peak = 0;

      for (let step = 0; step < WINDOW; step++) {
        world.step(FRAME);
        peak = Math.max(peak, fastest(chain));
      }

      // Invariants rather than the numbers this run happens to produce: the
      // chain stays finite, stays where it was built, and ends at rest.
      for (const [index, body] of chain.entries()) {
        const restY = 200 + (index + 1) * 16;

        expect(Number.isFinite(body.x)).toBe(true);
        expect(Number.isFinite(body.y)).toBe(true);
        expect(body.y).toBeGreaterThanOrEqual(restY - MAX_SAG_PX);
        expect(body.y).toBeLessThanOrEqual(restY + MAX_SAG_PX);
      }

      // A chain under no excitation may only lose speed. The bound is the
      // settling motion of the first few steps, not the runaway that followed.
      expect(peak).toBeLessThan(GRAVITY * FRAME * 4);
      expect(fastest(chain)).toBeLessThan(1);
    });
  }

  it('lets a long chain come to rest and sleep', () => {
    const { world, chain } = hangChain(12);

    advance(world, WINDOW * FRAME);

    expect(chain.every(body => body.isSleeping)).toBe(true);
  });
});
