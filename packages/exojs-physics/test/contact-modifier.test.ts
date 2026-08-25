import { describe, expect, it, vi } from 'vitest';

import type { CollisionEvent, ContactModifierContext } from '../src/index';
import { BoxShape, PhysicsBody, PhysicsWorld } from '../src/index';

/**
 * The world-level contact modifier: one hook, run once per solid contact per
 * fixed step, after contact generation and before island building and the
 * solver. Default solver config, +Y down.
 */

const GRAVITY = 1000; // px/s²
const FRAME = 1 / 60;

const advance = (world: PhysicsWorld, seconds: number): void => {
  const frames = Math.round(seconds / FRAME);

  for (let frame = 0; frame < frames; frame++) {
    world.step(FRAME);
  }
};

/** A wide static floor whose top surface sits at `topY`. */
const addFloor = (world: PhysicsWorld, topY: number): PhysicsBody =>
  world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: topY + 20 }, colliders: [{ shape: new BoxShape(1200, 40) }] }));

/** A 20×20 dynamic box centred at `(x, y)`. */
const addBox = (world: PhysicsWorld, x: number, y: number, friction = 0.2, restitution = 0): PhysicsBody =>
  world.add(new PhysicsBody({ type: 'dynamic', position: { x, y }, colliders: [{ shape: new BoxShape(20, 20), friction, restitution }] }));

describe('contact modifier', () => {
  it('sees every solid contact once per step, with the A→B normal and both sides', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const floor = addFloor(world, 100);
    const box = addBox(world, 0, 60);

    const seen: { a: unknown; b: unknown; normalY: number; pointCount: number }[] = [];
    world.contactModifier = contact => {
      seen.push({ a: contact.bodyA, b: contact.bodyB, normalY: contact.normalY, pointCount: contact.pointCount });
    };

    advance(world, 0.5);

    expect(seen.length).toBeGreaterThan(0);

    for (const entry of seen) {
      expect(new Set([entry.a, entry.b])).toEqual(new Set([box, floor]));
      // Resting box on a floor: one face/face manifold, normal along ±Y.
      expect(entry.pointCount).toBe(2);
      expect(Math.abs(entry.normalY)).toBeCloseTo(1);
    }
  });

  it('leaves the simulation untouched when no modifier is set', () => {
    const withoutModifier = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(withoutModifier, 100);
    const a = addBox(withoutModifier, 0, 0);

    const withNoopModifier = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY }, contactModifier: () => undefined });
    addFloor(withNoopModifier, 100);
    const b = addBox(withNoopModifier, 0, 0);

    advance(withoutModifier, 1.5);
    advance(withNoopModifier, 1.5);

    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });

  it('a disabled contact applies no impulse but stays a real collision event', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(world, 100);
    const box = addBox(world, 0, 0);

    const starts: CollisionEvent[] = [];
    world.onCollisionStart.add(event => starts.push(event));
    world.contactModifier = contact => {
      contact.enabled = false;
    };

    advance(world, 1.5);

    // The box falls straight through the floor it geometrically touches.
    expect(box.y).toBeGreaterThan(200);
    expect(starts).toHaveLength(1);
    expect(starts[0]!.points.length).toBeGreaterThan(0);
  });

  it('re-derives the controls from the colliders before every step', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(world, 100);
    addBox(world, 0, 60, 0.36, 0.5);

    const observed: { friction: number; restitution: number; enabled: boolean }[] = [];
    let step = 0;
    world.contactModifier = contact => {
      observed.push({ friction: contact.friction, restitution: contact.restitution, enabled: contact.enabled });

      // Scribble over the controls on the first observed step only; the next
      // step must start from the collider-derived defaults again.
      if (step++ === 0) {
        contact.friction = 0;
        contact.restitution = 0;
        contact.enabled = false;
      }
    };

    advance(world, 0.6);

    expect(observed.length).toBeGreaterThan(1);

    for (const entry of observed) {
      // Floor friction/restitution are the collider defaults (0.2 / 0).
      expect(entry.friction).toBeCloseTo(Math.sqrt(0.36 * 0.2));
      expect(entry.restitution).toBeCloseTo(0.5);
      expect(entry.enabled).toBe(true);
    }
  });

  it('a disabled contact does not union two bodies into one sleeping island', () => {
    // Two boxes stacked on a static floor. The top one is kept in slow motion so
    // it can never sleep; whether the bottom one sleeps is decided purely by
    // whether their shared contact unions them into one island.
    const run = (disableStackContact: boolean): { lower: PhysicsBody; upper: PhysicsBody } => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY }, timeToSleep: 0.2 });
      const floor = addFloor(world, 300);
      const lower = addBox(world, 0, 300 - 10, 0);
      const upper = addBox(world, 0, 300 - 30, 0);

      if (disableStackContact) {
        world.contactModifier = contact => {
          if (contact.bodyA !== floor && contact.bodyB !== floor) {
            contact.enabled = false;
          }
        };
      }

      advance(world, 1);

      // 10 px/s is above the 5 px/s sleep threshold, so the top box stays awake.
      // It has already fallen asleep by now, and writing a velocity onto a
      // sleeping body does nothing - it has to be woken first, exactly as a game
      // driving a body would.
      for (let frame = 0; frame < 120; frame++) {
        upper.wake();
        upper.linearVelocityX = 10;
        world.step(FRAME);
      }

      return { lower, upper };
    };

    const coupled = run(false);

    expect(coupled.upper.isSleeping).toBe(false);
    expect(coupled.lower.isSleeping).toBe(false);

    const decoupled = run(true);

    expect(decoupled.upper.isSleeping).toBe(false);
    expect(decoupled.lower.isSleeping).toBe(true);
  });

  it('a disabled contact stops a moving platform from waking its passenger', () => {
    // The other half of the island rule: a static/kinematic body is an island
    // boundary, so a moving one resets its passenger's sleep timer instead of
    // being unioned with it. A disabled contact must not do that either.
    const run = (disableContact: boolean): PhysicsBody => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
      const platform = world.add(
        new PhysicsBody({ type: 'kinematic', position: { x: 0, y: 320 }, colliders: [{ shape: new BoxShape(1200, 40), friction: 0 }] }),
      );
      const box = addBox(world, 0, 300 - 12, 0);

      advance(world, 2);
      expect(box.isSleeping).toBe(true);

      if (disableContact) {
        world.contactModifier = contact => {
          contact.enabled = false;
        };
      }

      // Purely horizontal, so the platform never drives into the passenger - the
      // only reason the box could wake is the moving-boundary rule.
      platform.linearVelocityX = 3;
      advance(world, 1);

      return box;
    };

    expect(run(false).isSleeping).toBe(false);
    expect(run(true).isSleeping).toBe(true);
  });

  it('drops the warm-start cache while a contact is disabled', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(world, 100);
    addBox(world, 0, 60);

    // Let the resting contact accumulate a warm-start impulse first.
    advance(world, 1);

    const graph = world.backend.contactGraph;
    const record = graph.solidContacts[0]!;

    expect(Math.abs(record.normalImpulse[0]) + Math.abs(record.normalImpulse[1])).toBeGreaterThan(0);

    world.contactModifier = contact => {
      contact.enabled = false;
    };
    world.step(FRAME);

    expect(record.normalImpulse).toEqual([0, 0]);
    expect(record.tangentImpulse).toEqual([0, 0]);
    expect(record.pointIds).toEqual([0, 0]);
  });

  it('never hands a sensor overlap to the modifier', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(40, 40), isSensor: true }] }));
    world.add(new PhysicsBody({ type: 'kinematic', position: { x: 5, y: 0 }, colliders: [{ shape: new BoxShape(20, 20) }] }));

    const modifier = vi.fn<(contact: ContactModifierContext) => void>();
    world.contactModifier = modifier;

    advance(world, 0.5);

    expect(modifier).not.toHaveBeenCalled();
  });

  it('expresses a one-way platform: solid from above, passable from below', () => {
    // The real-world rule: sample the direction of travel once at the start of
    // the step and ignore the contact while the body is moving upward. Reading
    // the live velocity inside the modifier instead would flip as soon as the
    // solver's push-out gives the body a hair of upward speed.
    const run = (startY: number, velocityY: number, seconds: number): PhysicsBody => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
      world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [{ shape: new BoxShape(400, 10) }] }));
      const box = addBox(world, 0, startY);

      box.linearVelocityY = velocityY;

      let movingUp = false;
      world.contactModifier = contact => {
        if (movingUp) {
          contact.enabled = false;
        }
      };

      const frames = Math.round(seconds / FRAME);

      for (let frame = 0; frame < frames; frame++) {
        movingUp = box.linearVelocityY < -10;
        world.step(FRAME);
      }

      return box;
    };

    // Dropped from above: caught on the platform's top face (y = 95) and at rest.
    // The exact resting depth is the solver's business (a 300 px/s impact leaves
    // a couple of px of penetration the soft bias works off) - what this pins is
    // that the box is still on top of the platform and no longer moving.
    const landed = run(40, 300, 1.5);

    expect(landed.y).toBeGreaterThan(80);
    expect(landed.y).toBeLessThan(95);
    expect(landed.linearVelocityY).toBeCloseTo(0, 1);

    // Launched from below: passes straight through instead of being blocked.
    // 0.4 s is the apex of the throw, by which point the box has cleared the
    // platform's top face entirely; blocked, it would have stalled below it.
    const passed = run(160, -400, 0.4);

    expect(passed.y).toBeLessThan(85);
  });
});
