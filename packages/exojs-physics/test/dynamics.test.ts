import { describe, expect, it } from 'vitest';

import { Manifold } from '../src/collision/Manifold';
import type { ContactRecord } from '../src/ContactGraph';
import { BoxShape, CircleShape, PhysicsWorld } from '../src/index';
import { PhysicsBody } from '../src/PhysicsBody';
import { ContactSolver } from '../src/solver/ContactSolver';
import { colliderAt } from './support';

/**
 * The Solver Correctness & Stability matrix, exercised over the
 * native **TGS-Soft** solver (Box2D-v3 "soft step": sub-stepping + soft-constraint
 * bias + relax pass + a 2-point block normal solve, with a separate restitution
 * pass). All run in the **default solver config** (`subStepCount = 4`,
 * `contactHertz = 30`, `dampingRatio = 10`, slop 0.25px, 1px/s restitution
 * threshold) at the default `fixedDelta = 1/60 s`. Coordinates are ExoJS pixels
 * with +Y down, so gravity is `(0, +g)` and "up" is decreasing y.
 *
 * A 20-box tower — the case the previous sequential-impulse + NGS solver
 * could not meet (lateral tipping past ~10 boxes) — is now asserted here: TGS-Soft
 * decouples stiffness from the iteration count and holds it stable.
 */

const GRAVITY = 1000; // px/s²
const FRAME = 1 / 60;

/** Step the world for `seconds` of simulated time at the fixed frame delta. */
const advance = (world: PhysicsWorld, seconds: number): void => {
  const frames = Math.round(seconds / FRAME);

  for (let frame = 0; frame < frames; frame++) {
    world.step(FRAME);
  }
};

/** A wide static floor whose top surface sits at `topY`. */
const addFloor = (world: PhysicsWorld, topY: number, friction = 0.5, halfWidth = 600): void => {
  world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: topY + 20 }, colliders: [{ shape: new BoxShape(halfWidth * 2, 40), friction }] }));
};

/** A dynamic box of `width`×`height` centred at `(x, y)`. */
const addBox = (
  world: PhysicsWorld,
  x: number,
  y: number,
  width: number,
  height = width,
  options: { friction?: number; restitution?: number; density?: number; fixedRotation?: boolean } = {},
): PhysicsBody => {
  return world.add(
    new PhysicsBody({
      type: 'dynamic',
      position: { x, y },
      fixedRotation: options.fixedRotation,
      colliders: [{ shape: new BoxShape(width, height), density: options.density ?? 1, friction: options.friction ?? 0.5, restitution: options.restitution ?? 0 }],
    }),
  );
};

const speed = (body: PhysicsBody): number => Math.hypot(body.linearVelocityX, body.linearVelocityY);

/** Assert every live body's position, velocity and angle are finite. */
const expectAllFinite = (world: PhysicsWorld): void => {
  for (const body of world.bodies) {
    expect(Number.isFinite(body.x)).toBe(true);
    expect(Number.isFinite(body.y)).toBe(true);
    expect(Number.isFinite(body.angle)).toBe(true);
    expect(Number.isFinite(body.linearVelocityX)).toBe(true);
    expect(Number.isFinite(body.linearVelocityY)).toBe(true);
    expect(Number.isFinite(body.angularVelocity)).toBe(true);
  }
};

// ── Angular response ────────────────────────────────────────────────

describe('angular response', () => {
  it('an impulse through the centre of mass induces no spin', () => {
    const world = new PhysicsWorld();
    const box = addBox(world, 0, 0, 32);

    box.applyImpulse(0, -5000); // no application point → pure linear

    advance(world, 0.25);

    expect(box.angularVelocity).toBeLessThanOrEqual(1e-3);
    expect(box.linearVelocityY).toBeCloseTo(-5000 * box.invMass, 6);
    expect(box.linearVelocityX).toBe(0);
  });

  it('an off-centre impulse spins the body by (r×J)/I', () => {
    const world = new PhysicsWorld();
    const box = addBox(world, 0, 0, 32);

    const impulseY = -5000;
    const pointX = 16;
    const pointY = 16;
    const expectedOmega = (pointX * impulseY - pointY * 0) * box.invInertia;

    box.applyImpulse(0, impulseY, pointX, pointY);

    advance(world, 0.25);

    expect(expectedOmega).not.toBe(0);
    expect(box.angularVelocity).toBeCloseTo(expectedOmega, 6);
  });

  it('a box on two symmetric supports stays flat', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const supportY = 300;

    // Two static pillars symmetric about x = 0.
    world.add(new PhysicsBody({ type: 'static', position: { x: -40, y: supportY + 20 }, colliders: [{ shape: new BoxShape(20, 40) }] }));
    world.add(new PhysicsBody({ type: 'static', position: { x: 40, y: supportY + 20 }, colliders: [{ shape: new BoxShape(20, 40) }] }));

    const beam = addBox(world, 0, supportY - 16 - 0.5, 120, 32);

    advance(world, 4);

    expect(Math.abs(beam.angle)).toBeLessThanOrEqual(1e-3);
    expect(Math.abs(beam.x)).toBeLessThanOrEqual(0.5);
  });
});

// ── Restitution ─────────────────────────────────────────────────────

describe('restitution', () => {
  it('rebounds to ≈ e²·h after a 200px drop (e = 0.8)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const radius = 10;
    const floorTop = 300;
    const contactCenterY = floorTop - radius;
    const dropHeight = 200;

    addFloor(world, floorTop);

    const ball = world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 0, y: contactCenterY - dropHeight },
        colliders: [{ shape: new CircleShape(radius), density: 1, friction: 0, restitution: 0.8 }],
      }),
    );

    let contacted = false;
    let peakY = Infinity;

    const frames = Math.round(4 / FRAME);

    for (let frame = 0; frame < frames; frame++) {
      world.step(FRAME);

      if (ball.y >= contactCenterY - 1) {
        contacted = true;
      }

      if (contacted) {
        peakY = Math.min(peakY, ball.y);
      }
    }

    const reboundHeight = contactCenterY - peakY;
    const expected = 0.64 * dropHeight;

    expect(reboundHeight).toBeGreaterThan(expected * 0.9);
    expect(reboundHeight).toBeLessThan(expected * 1.1);
  });

  it('a low-restitution box at rest does not perpetually bounce', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const floorTop = 300;

    addFloor(world, floorTop);

    const box = addBox(world, 0, floorTop - 16 - 0.5, 32, 32, { restitution: 0.3 });

    advance(world, 2); // let it settle

    // After settling, no sustained upward (separating) velocity above the threshold.
    let maxUpward = 0;

    for (let frame = 0; frame < 180; frame++) {
      world.step(FRAME);
      maxUpward = Math.max(maxUpward, -box.linearVelocityY); // upward = negative y
    }

    expect(maxUpward).toBeLessThanOrEqual(1);
  });

  it('a slow contact below the velocity threshold does not bounce', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const floorTop = 300;

    addFloor(world, floorTop);

    // Placed almost in contact so the approach speed is well under 1px/s.
    const box = addBox(world, 0, floorTop - 16 - 0.05, 32, 32, { restitution: 0.6 });

    advance(world, 3);

    expect(-box.linearVelocityY).toBeLessThanOrEqual(1);
    expect(Math.abs(box.y - (floorTop - 16))).toBeLessThanOrEqual(0.5);
  });

  it('repeated bounces have strictly decreasing peak heights', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const radius = 10;
    const floorTop = 300;
    const contactCenterY = floorTop - radius;

    addFloor(world, floorTop);

    const ball = world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 0, y: contactCenterY - 200 },
        colliders: [{ shape: new CircleShape(radius), density: 1, friction: 0, restitution: 0.6 }],
      }),
    );

    const peaks: number[] = [];
    let prevVy = 0;
    let rising = false;

    const frames = Math.round(6 / FRAME);

    for (let frame = 0; frame < frames; frame++) {
      world.step(FRAME);

      // A peak is where upward motion turns to downward (vy crosses 0 going +).
      if (rising && prevVy < 0 && ball.linearVelocityY >= 0) {
        peaks.push(contactCenterY - ball.y);
      }

      rising = ball.linearVelocityY < 0;
      prevVy = ball.linearVelocityY;
    }

    expect(peaks.length).toBeGreaterThanOrEqual(3);

    for (let i = 1; i < peaks.length; i++) {
      expect(peaks[i]).toBeLessThan(peaks[i - 1]);
    }
  });
});

// ── Friction ────────────────────────────────────────────────────────

describe('friction', () => {
  it('a box at rest does not drift or rotate over 5s', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const floorTop = 300;

    addFloor(world, floorTop);

    const box = addBox(world, 0, floorTop - 16 - 0.5, 32);

    advance(world, 5);

    expect(Math.abs(box.x)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(box.angle)).toBeLessThanOrEqual(1e-3);
  });

  it('a sliding box decelerates and stops near the analytic distance', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const floorTop = 300;
    const mu = 0.4;

    addFloor(world, floorTop, mu);

    // Wide, short box (resists tipping) with fixed rotation to isolate sliding friction.
    const box = addBox(world, 0, floorTop - 8 - 0.5, 48, 16, { friction: mu, fixedRotation: true });

    advance(world, 0.3); // settle onto the floor

    const startX = box.x;
    box.linearVelocityX = 300;

    let prevVx = box.linearVelocityX;
    let reversed = false;

    const frames = Math.round(4 / FRAME);

    for (let frame = 0; frame < frames; frame++) {
      world.step(FRAME);

      if (box.linearVelocityX < -1) {
        reversed = true;
      }

      // Monotone deceleration while still moving forward.
      if (box.linearVelocityX > 1) {
        expect(box.linearVelocityX).toBeLessThanOrEqual(prevVx + 1e-6);
      }

      prevVx = box.linearVelocityX;
    }

    const stopDistance = box.x - startX;
    const analytic = (300 * 300) / (2 * mu * GRAVITY); // v² / (2μg) = 112.5px

    expect(reversed).toBe(false); // no reverse motion
    expect(Math.abs(box.linearVelocityX)).toBeLessThanOrEqual(1); // stopped
    expect(stopDistance).toBeGreaterThan(analytic * 0.85);
    expect(stopDistance).toBeLessThan(analytic * 1.15);
  });

  it('a box on a slope below the friction angle stays put', () => {
    // Equivalent to a 20° ramp via tilted gravity: tan20° ≈ 0.36 < μ = 0.6.
    const angle = (20 * Math.PI) / 180;
    const world = new PhysicsWorld({ gravity: { x: GRAVITY * Math.sin(angle), y: GRAVITY * Math.cos(angle) } });
    const floorTop = 300;

    addFloor(world, floorTop, 0.6);

    const box = addBox(world, 0, floorTop - 8 - 0.5, 40, 16, { friction: 0.6 });

    advance(world, 0.3);

    const startX = box.x;

    advance(world, 4);

    expect(Math.abs(box.x - startX)).toBeLessThanOrEqual(1);
  });
});

// ── Stacking ────────────────────────────────────────────────────────

describe('stacking', () => {
  it('a 10-box tower settles without jitter, drift or interpenetration', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const size = 32;
    const gap = 1;
    const floorTop = 300;

    addFloor(world, floorTop);

    const boxes: PhysicsBody[] = [];

    for (let i = 0; i < 10; i++) {
      const bottomY = floorTop - gap * (i + 1) - i * size;

      boxes.push(addBox(world, 0, bottomY - size / 2, size));
    }

    advance(world, 5);

    expectAllFinite(world);

    for (const box of boxes) {
      expect(speed(box)).toBeLessThanOrEqual(1);
    }

    expect(Math.abs(boxes[9].x)).toBeLessThanOrEqual(1);

    // Max penetration (floor contact + every adjacent pair). TGS-Soft settles the
    // tower to the 0.25px slop well within 5s (the soft bias pushes out the excess
    // each sub-step), comfortably meeting the 0.5px design target the old NGS pass
    // only approached.
    let maxPenetration = boxes[0].y + size / 2 - floorTop;

    for (let i = 0; i < boxes.length - 1; i++) {
      maxPenetration = Math.max(maxPenetration, size - (boxes[i].y - boxes[i + 1].y));
    }

    expect(maxPenetration).toBeLessThanOrEqual(0.5);
  });

  it('a 20-box tower stays upright and settles (the old solver tipped past ~10)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const size = 32;
    const gap = 1;
    const floorTop = 300;

    addFloor(world, floorTop);

    const boxes: PhysicsBody[] = [];

    for (let i = 0; i < 20; i++) {
      const bottomY = floorTop - gap * (i + 1) - i * size;

      boxes.push(addBox(world, 0, bottomY - size / 2, size));
    }

    advance(world, 8);

    expectAllFinite(world);

    // Rest: every box slow, no lateral tip (the sequential-impulse + NGS solver
    // grew an exponential lateral mode here), penetration bounded.
    let maxDrift = 0;
    let maxPenetration = boxes[0].y + size / 2 - floorTop;

    for (let i = 0; i < boxes.length; i++) {
      expect(speed(boxes[i])).toBeLessThanOrEqual(1);
      maxDrift = Math.max(maxDrift, Math.abs(boxes[i].x));

      if (i < boxes.length - 1) {
        maxPenetration = Math.max(maxPenetration, size - (boxes[i].y - boxes[i + 1].y));
      }
    }

    expect(maxDrift).toBeLessThanOrEqual(3);
    expect(maxPenetration).toBeLessThanOrEqual(1);
  });

  it('a stack shoved horizontally leans but stays bounded (no explosion)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const size = 32;
    const floorTop = 300;

    addFloor(world, floorTop);

    const boxes: PhysicsBody[] = [];

    for (let i = 0; i < 4; i++) {
      boxes.push(addBox(world, 0, floorTop - size / 2 - 1 - i * size, size));
    }

    advance(world, 1.5); // settle

    boxes[0].applyImpulse(boxes[0].mass * 200, 0); // +200px/s shove to the base

    advance(world, 4);

    expectAllFinite(world);

    // No explosion: every body stays within the arena and finishes slow.
    for (const box of boxes) {
      expect(Math.abs(box.x)).toBeLessThan(400);
      expect(box.y).toBeLessThan(floorTop + 5); // above the floor
      expect(speed(box)).toBeLessThanOrEqual(5);
    }
  });
});

// ── Mass ratios ────────────────────────────────────────────────────

describe('mass ratios', () => {
  it('a heavy box (10:1) does not crush a light box through the floor', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const size = 32;
    const floorTop = 300;

    addFloor(world, floorTop);

    const light = addBox(world, 0, floorTop - size / 2 - 1, size, size, { density: 1 });
    addBox(world, 0, floorTop - size - size / 2 - 2, size, size, { density: 10 });

    advance(world, 5);

    expectAllFinite(world);

    const floorPenetration = light.y + size / 2 - floorTop;
    expect(floorPenetration).toBeLessThanOrEqual(1);
    expect(light.y).toBeLessThan(floorTop); // light box centre still above the floor surface
  });

  it('characterises the ~100:1 envelope edge — a crushed light box stays shallowly bounded above the floor (no tunnelling)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const size = 32;
    const floorTop = 300;

    addFloor(world, floorTop);

    const light = addBox(world, 0, floorTop - size / 2 - 1, size, size, { density: 1 });
    addBox(world, 0, floorTop - size - size / 2 - 2, size, size, { density: 100 });

    advance(world, 5);

    expectAllFinite(world);

    // ~100:1 is the top of the supported resting envelope: the squeezed light box
    // settles a small, bounded distance into the floor (~1.4px here — a few times
    // the 0.25px slop, but far less than its 16px half-extent) and its centre
    // never sinks below the surface. Past this ratio the velocity-capped soft
    // push-out (`maxBiasVelocity`, ContactSolver.ts) lets penetration grow
    // sharply (≈6px at 500:1, fully through by ~5000:1) — a documented
    // soft-constraint tradeoff, not a defect (see the operating-envelope note on
    // PhysicsWorld). This gate pins the edge so a regression into deep
    // penetration at 100:1 is caught.
    const floorPenetration = light.y + size / 2 - floorTop;
    expect(floorPenetration).toBeLessThanOrEqual(2);
    expect(light.y).toBeLessThan(floorTop);
  });
});

// ── Kinematic interaction ───────────────────────────────────────────

describe('kinematic interaction', () => {
  it('a moving kinematic platform carries a dynamic rider', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const platformTop = 300;

    const platform = world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 0, y: platformTop + 20 }, colliders: [{ shape: new BoxShape(200, 40), friction: 0.9 }] }),
    );
    platform.linearVelocityX = 100;

    const rider = addBox(world, 0, platformTop - 16 - 0.5, 32, 32, { friction: 0.9 });

    advance(world, 3);

    expectAllFinite(world);

    // Rider tracks the platform's horizontal motion (carried, small slip).
    expect(rider.linearVelocityX).toBeGreaterThan(80);
    expect(Math.abs(rider.x - platform.x)).toBeLessThanOrEqual(8);
    // It does not sink through the platform.
    expect(Math.abs(rider.y - (platformTop - 16))).toBeLessThanOrEqual(0.5);
  });

  it('a kinematic body ignores impulses from piled dynamics', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const platformTop = 300;

    const platform = world.add(
      new PhysicsBody({ type: 'kinematic', position: { x: 0, y: platformTop + 20 }, colliders: [{ shape: new BoxShape(200, 40), friction: 0.5 }] }),
    );

    for (let i = 0; i < 4; i++) {
      addBox(world, 0, platformTop - 16 - 1 - i * 33, 32);
    }

    advance(world, 3);

    expect(platform.linearVelocityX).toBe(0);
    expect(platform.linearVelocityY).toBe(0);
    expect(platform.angularVelocity).toBe(0);
    expect(platform.x).toBe(0);
    expect(platform.y).toBe(platformTop + 20);
  });
});

// ── Failure safety ──────────────────────────────────────────────────

describe('failure safety', () => {
  it('keeps every body finite every frame while a rough pile settles', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const size = 24;
    const floorTop = 300;

    addFloor(world, floorTop);

    for (let i = 0; i < 6; i++) {
      addBox(world, i % 2 === 0 ? -4 : 4, floorTop - 40 - i * (size + 6), size);
    }

    const frames = Math.round(5 / FRAME);

    for (let frame = 0; frame < frames; frame++) {
      world.step(FRAME);
      expectAllFinite(world);
    }
  });

  it('a resting scene does not gain kinetic energy after settling', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const size = 32;
    const floorTop = 300;

    addFloor(world, floorTop);

    const boxes: PhysicsBody[] = [];

    for (let i = 0; i < 4; i++) {
      boxes.push(addBox(world, 0, floorTop - size / 2 - 1 - i * size, size));
    }

    advance(world, 4); // settle

    const kineticEnergy = (): number => {
      let total = 0;

      for (const box of boxes) {
        total += 0.5 * box.mass * (box.linearVelocityX ** 2 + box.linearVelocityY ** 2) + 0.5 * box.inertia * box.angularVelocity ** 2;
      }

      return total;
    };

    const settled = kineticEnergy();

    for (let frame = 0; frame < 180; frame++) {
      world.step(FRAME);
      // Energy stays bounded (no injection); allow a tiny epsilon for resting jitter.
      expect(kineticEnergy()).toBeLessThanOrEqual(settled + 5);
    }
  });

  it('a resting contact emits one start and no repeated start/end churn', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const floorTop = 300;

    addFloor(world, floorTop);
    addBox(world, 0, floorTop - 16 - 0.5, 32);

    let starts = 0;
    let ends = 0;

    world.onCollisionStart.add(() => (starts += 1));
    world.onCollisionEnd.add(() => (ends += 1));

    advance(world, 4);

    expect(starts).toBe(1);
    expect(ends).toBe(0);
  });

  it('a body faster than the floor thickness per frame tunnels but stays finite (no CCD)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const floorTop = 300;

    addFloor(world, floorTop); // 40px thick

    const bullet = addBox(world, 0, floorTop - 100, 16);
    bullet.linearVelocityY = 1e6; // » floor thickness per frame at 1/60 s

    advance(world, 1);

    // Detection runs once per frame with no swept/continuous test (no CCD), so a
    // body that moves farther than the floor thickness in a single frame passes
    // straight through. The only contract under such speeds is finiteness — no
    // NaN/Inf blow-up — which this gate pins. Reliably stopping fast projectiles
    // is a v0.16 CCD / bullet-mode item (see the operating-envelope note).
    expectAllFinite(world);
    expect(bullet.y).toBeGreaterThan(floorTop); // tunnelled through (documented limitation)
  });
});

// ── ContactSolver internals ─────────────────────────────────────────

describe('ContactSolver internals', () => {
  it('contactHertz=0 takes the rigid (non-soft) branch and still settles a resting box', () => {
    // Default worlds use contactHertz=30 (soft); this exercises the `contactHertz > 0`
    // false side of ContactSolver.prepare's soft-factor computation (biasRate=0,
    // massScale=1, impulseScale=0 — the hard-constraint fallback).
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY }, contactHertz: 0 });
    const floorTop = 300;

    addFloor(world, floorTop);
    const box = addBox(world, 0, floorTop - 16 - 0.5, 32);

    advance(world, 2);

    expectAllFinite(world);
    expect(Math.abs(box.linearVelocityY)).toBeLessThanOrEqual(1);
  });

  it('prepare() skips a contact whose manifold reports zero points', () => {
    // ContactGraph only ever pushes a record into solidContacts when the narrow
    // phase reports `touching` (which requires pointCount ≥ 1), so this path is not
    // reachable through PhysicsWorld — it is exercised here by calling the solver
    // directly with a hand-built record whose manifold was never populated.
    const world = new PhysicsWorld();
    const colliderA = colliderAt(world, new BoxShape(10, 10), { x: 0, y: 0 });
    const colliderB = colliderAt(world, new BoxShape(10, 10), { x: 5, y: 0 }, 0, 'dynamic');

    const record: ContactRecord = {
      a: colliderA,
      b: colliderB,
      isSensor: false,
      touching: true,
      seen: true,
      manifold: new Manifold(), // freshly constructed — pointCount stays 0
      normalImpulse: [0, 0],
      tangentImpulse: [0, 0],
      pointIds: [0, 0],
    };

    const solver = new ContactSolver();
    const bodyB = colliderB.body;
    const vyBefore = bodyB.linearVelocityY;

    solver.prepare([record], 1 / 240, 30, 10);
    solver.warmStart();
    solver.solveVelocities(true);
    solver.solveVelocities(false);
    solver.applyRestitution();

    // pointCount === 0 → the contact is skipped entirely: no constraint is built, so
    // none of the solve passes touch bodyB's velocity.
    expect(bodyB.linearVelocityY).toBe(vyBefore);
  });
});

// ── Deterministic replay ────────────────────────────────────────────

describe('deterministic replay', () => {
  it('the same scene with scripted impulses replays bit-identically ×3', () => {
    const runScene = (): number[] => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
      const floorTop = 300;

      addFloor(world, floorTop);

      const bodies: PhysicsBody[] = [];

      // A mixed, asymmetric scene — boxes and a circle.
      bodies.push(addBox(world, -20, floorTop - 16 - 1, 32));
      bodies.push(addBox(world, 18, floorTop - 48 - 1, 28));

      const ball = world.add(
        new PhysicsBody({
          type: 'dynamic',
          position: { x: 0, y: floorTop - 120 },
          colliders: [{ shape: new CircleShape(12), density: 1.5, friction: 0.4, restitution: 0.4 }],
        }),
      );
      bodies.push(ball);

      for (let frame = 0; frame < 240; frame++) {
        if (frame === 30) {
          bodies[0].applyImpulse(2500, -1500, bodies[0].x + 8, bodies[0].y - 8);
        }

        if (frame === 90) {
          ball.applyImpulse(-1800, 0);
        }

        world.step(FRAME);
      }

      const state: number[] = [];

      for (const body of bodies) {
        state.push(body.x, body.y, body.angle, body.linearVelocityX, body.linearVelocityY, body.angularVelocity);
      }

      return state;
    };

    const a = runScene();
    const b = runScene();
    const c = runScene();

    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });
});
