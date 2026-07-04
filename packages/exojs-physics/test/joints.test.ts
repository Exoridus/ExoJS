import { describe, expect, it } from 'vitest';

import { BoxShape, CircleShape, DistanceJoint, MouseJoint, PhysicsBody, PhysicsWorld, PrismaticJoint, RevoluteJoint, WeldJoint, WheelJoint } from '../src/index';

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
      new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: 0, y: 1 }, enableLimit: true, lowerTranslation: 0, upperTranslation: 100 }),
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
      new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: 1, y: 0 }, enableMotor: true, motorSpeed: 100, maxMotorForce: 1e8 }),
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

    // Move the target — the body follows.
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
    // (minLength only — maxLength defaults to Infinity) stops it at minLength instead
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

    // Both anchors default to their body's position — identical points, so the
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

  it('BUG: a zero-length axis in a prismatic joint yields a degenerate joint with no lock in any direction', () => {
    // `Math.hypot(0, 0) || 1` (PrismaticJoint.ts, constructor) only guards the division
    // — it does not turn (0,0) into a *unit* vector. The local axis stays (0,0), so both
    // the axis and its perpendicular end up as zero vectors in `_prepare`; `_applyAxial`/
    // `_applyBlock` scale every impulse by axisX/axisY/perpX/perpY (all 0), so no force is
    // ever applied in any direction. Expected correct behavior: reject a zero-length axis
    // (throw) or fall back to a sane default unit axis (e.g. (1, 0)) instead of silently
    // creating a no-op joint.
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const anchor = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const slider = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    world.addJoint(new PrismaticJoint({ bodyA: anchor, bodyB: slider, anchor: { x: 0, y: 0 }, axis: { x: 0, y: 0 } }));

    advance(world, 1);

    // Current (buggy) behavior: free fall under gravity — the joint constrained nothing.
    expect(slider.y).toBeGreaterThan(400);
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
    // rigid weld above) but still bounded — not flung away or blown up to NaN/Inf.
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

  it('BUG: a zero-length axis in a wheel joint yields a degenerate joint with no suspension or lateral lock', () => {
    // Same root cause as the prismatic joint above: `Math.hypot(0, 0) || 1` only guards
    // the division — the local axis stays (0,0), so the axis, its perpendicular, the
    // suspension spring and the lateral lock all end up applying zero force. Expected
    // correct behavior: reject a zero-length axis (throw) or default to a unit axis.
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const chassis = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 } }));
    const wheel = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 30 }, colliders: [{ shape: new CircleShape(10) }] }));

    world.addJoint(new WheelJoint({ bodyA: chassis, bodyB: wheel, anchor: { x: 0, y: 30 }, axis: { x: 0, y: 0 }, hertz: 5, dampingRatio: 1 }));

    advance(world, 1);

    // Current (buggy) behavior: free fall under gravity — nothing was constrained.
    expect(wheel.y).toBeGreaterThan(400);
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

    // A soft suspension (hertz>0) actually allows axis travel — with hertz=0 (rigid)
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
