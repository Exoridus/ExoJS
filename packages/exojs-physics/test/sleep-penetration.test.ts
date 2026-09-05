import type { PointLike } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import {
  BoxShape,
  CapsuleShape,
  ChainShape,
  CircleShape,
  type ContactModifierContext,
  DistanceJoint,
  PhysicsBody,
  PhysicsWorld,
  SegmentShape,
} from '../src/index';
import type { AnyShape } from '../src/shapes/AnyShape';

/**
 * Sleeping must not freeze a body while its contact still carries penetration
 * the solver is working off. A body that comes to rest visibly embedded in the
 * floor is a sleep decision taken too early - not a solver limit.
 *
 * The converse matters just as much: a contact that has reached the depth its
 * own load holds it at is finished, however deep that is, and holding its island
 * awake for an overlap that is never going to shrink keeps a settled scene being
 * solved forever. Both directions are pinned below. Default solver config unless
 * stated, +Y down.
 */

const GRAVITY = 1000; // px/s²
const FRAME = 1 / 60;
const FLOOR_TOP = 300;
/**
 * Penetration a body may still carry once it is asleep, in px. Deliberately a
 * literal rather than the engine constant: these tests pin the observable
 * resting behaviour, so lowering the engine's tolerance towards the contact slop
 * (bodies stop sleeping) and raising it (bodies sleep embedded again) both turn
 * them red.
 */
const MAX_SLEEPING_PENETRATION = 0.75;
/**
 * The solver's own penetration allowance. A resting single-point contact settles
 * measurably deeper than this, which is why the sleep tolerance above cannot be
 * the slop itself.
 */
const CONTACT_SLOP = 0.25;

const advance = (world: PhysicsWorld, seconds: number): void => {
  const frames = Math.round(seconds / FRAME);

  for (let frame = 0; frame < frames; frame++) {
    world.step(FRAME);
  }
};

/** Step until `body` sleeps, returning the frame index (or -1 within `seconds`). */
const framesUntilAsleep = (world: PhysicsWorld, body: PhysicsBody, seconds: number): number => {
  const frames = Math.round(seconds / FRAME);

  for (let frame = 0; frame < frames; frame++) {
    world.step(FRAME);

    if (body.isSleeping) {
      return frame;
    }
  }

  return -1;
};

const points = (...coords: number[]): Readonly<PointLike>[] => {
  const result: Readonly<PointLike>[] = [];

  for (let i = 0; i < coords.length; i += 2) {
    result.push({ x: coords[i]!, y: coords[i + 1]! });
  }

  return result;
};

/** A wide static floor whose top surface sits at {@link FLOOR_TOP}. */
const addBoxFloor = (world: PhysicsWorld): PhysicsBody =>
  world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: FLOOR_TOP + 20 }, colliders: [{ shape: new BoxShape(1200, 40) }] }));

const addDynamic = (world: PhysicsWorld, shape: AnyShape, y: number, x = 0): PhysicsBody =>
  world.add(new PhysicsBody({ type: 'dynamic', position: { x, y }, colliders: [{ shape, friction: 0.5 }] }));

/** How far the body's lowest point sits below the floor surface. */
const sink = (body: PhysicsBody, halfHeight: number): number => body.y + halfHeight - FLOOR_TOP;

describe('sleeping with unresolved contact penetration', () => {
  it('a body dropped from a height does not fall asleep embedded in the floor', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addBoxFloor(world);

    // One fixed step at impact speed bridges ~10px, far more than the contact
    // slop, so detection first sees the contact deeply penetrating.
    const body = addDynamic(world, new CircleShape(8), 100);
    const sleptAt = framesUntilAsleep(world, body, 6);

    expect(sleptAt).toBeGreaterThan(0);
    expect(sink(body, 8)).toBeLessThanOrEqual(MAX_SLEEPING_PENETRATION);
  });

  it.each([
    ['circle', (): AnyShape => new CircleShape(8), 8],
    ['box', (): AnyShape => new BoxShape(32, 32), 16],
    ['capsule', (): AnyShape => new CapsuleShape(0, -10, 0, 10, 8), 18],
  ] as const)('a falling %s comes to rest on the floor surface before sleeping', (_name, makeShape, halfHeight) => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addBoxFloor(world);

    const body = addDynamic(world, makeShape(), 100);

    advance(world, 6);

    expect(body.isSleeping).toBe(true);
    expect(sink(body, halfHeight)).toBeLessThanOrEqual(MAX_SLEEPING_PENETRATION);
  });

  it.each([
    ['segment', (): AnyShape => new SegmentShape(-600, 0, 600, 0)],
    ['chain', (): AnyShape => new ChainShape(points(-600, 0, -200, 0, 200, 0, 600, 0))],
  ] as const)('a falling body comes to rest on a %s boundary before sleeping', (_name, makeBoundary) => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: FLOOR_TOP }, colliders: [{ shape: makeBoundary() }] }));

    const body = addDynamic(world, new BoxShape(32, 32), 100);

    advance(world, 6);

    expect(body.isSleeping).toBe(true);
    expect(sink(body, 16)).toBeLessThanOrEqual(MAX_SLEEPING_PENETRATION);
  });

  it('a body that is already resting still falls asleep at the usual time', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addBoxFloor(world);

    // 2px above its resting height: it settles within a few frames, so the
    // penetration check must not delay the sleep decision at all.
    const body = addDynamic(world, new BoxShape(32, 32), FLOOR_TOP - 16 - 2);
    const sleptAt = framesUntilAsleep(world, body, 2);

    // timeToSleep is 0.5s (30 frames) plus the few frames of settling.
    expect(sleptAt).toBeGreaterThan(0);
    expect(sleptAt).toBeLessThan(45);
  });

  it('a body spawned inside the floor stays awake until it has worked its way out', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addBoxFloor(world);

    const body = addDynamic(world, new CircleShape(8), FLOOR_TOP + 5); // 13px deep

    // Asserted every frame rather than at one point in time: how long the
    // push-out needs is a solver tuning detail, but "never asleep while still
    // embedded" is the contract, and it has to hold at every frame of the climb.
    let sawEmbedded = false;

    for (let frame = 0; frame < 7 * 60; frame++) {
      world.step(FRAME);

      if (sink(body, 8) > MAX_SLEEPING_PENETRATION) {
        sawEmbedded = true;
        expect(body.isSleeping).toBe(false);
      }
    }

    expect(sawEmbedded).toBe(true);
    expect(body.isSleeping).toBe(true);
    expect(sink(body, 8)).toBeLessThanOrEqual(MAX_SLEEPING_PENETRATION);
  });

  it('one embedded body keeps its whole contact island awake', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addBoxFloor(world);

    // The bottom box starts 6px inside the floor; the two above it rest on it
    // and are at rest almost immediately.
    const bottom = addDynamic(world, new BoxShape(32, 32), FLOOR_TOP - 16 + 6);
    const middle = addDynamic(world, new BoxShape(32, 32), FLOOR_TOP - 48 + 6);
    const top = addDynamic(world, new BoxShape(32, 32), FLOOR_TOP - 80 + 6);

    // The two upper boxes are at rest from the first frame, so only the island
    // coupling can hold them awake - and it has to do so for as long as the
    // bottom box is still climbing out, whichever frame that ends on.
    let sawEmbedded = false;

    for (let frame = 0; frame < 60; frame++) {
      world.step(FRAME);

      if (sink(bottom, 16) > MAX_SLEEPING_PENETRATION) {
        sawEmbedded = true;
        expect(bottom.isSleeping).toBe(false);
        expect(middle.isSleeping).toBe(false);
        expect(top.isSleeping).toBe(false);
      }
    }

    expect(sawEmbedded).toBe(true);

    advance(world, 6);

    expect(bottom.isSleeping).toBe(true);
    expect(middle.isSleeping).toBe(true);
    expect(top.isSleeping).toBe(true);
    expect(sink(bottom, 16)).toBeLessThanOrEqual(MAX_SLEEPING_PENETRATION);
  });

  it('a joint carries the block to a body that has no contact of its own', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addBoxFloor(world);

    const embedded = addDynamic(world, new BoxShape(32, 32), FLOOR_TOP - 16 + 6);
    // Hangs from the embedded body on a rigid joint, far away from the floor,
    // so nothing but the island coupling can keep it awake.
    const hanging = addDynamic(world, new BoxShape(16, 16), FLOOR_TOP - 116, 200);

    world.addJoint(new DistanceJoint({ bodyA: embedded, bodyB: hanging, length: 100 }));

    advance(world, 1);

    expect(embedded.isSleeping).toBe(false);
    expect(hanging.isSleeping).toBe(false);

    advance(world, 8);

    expect(embedded.isSleeping).toBe(true);
    expect(hanging.isSleeping).toBe(true);
  });

  it('a deeply overlapping sensor does not block sleep', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addBoxFloor(world);

    // A trigger volume the resting body sits well inside of.
    world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: FLOOR_TOP - 16 }, colliders: [{ shape: new BoxShape(200, 200), isSensor: true }] }));

    const body = addDynamic(world, new BoxShape(32, 32), FLOOR_TOP - 16 - 2);
    const sleptAt = framesUntilAsleep(world, body, 2);

    expect(sleptAt).toBeGreaterThan(0);
    expect(sleptAt).toBeLessThan(45);
  });

  it('a contact the modifier disabled does not block sleep', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addBoxFloor(world);

    // A pass-through platform the resting body overlaps by 10px. Disabled, it
    // applies no impulse, so its penetration is never going to be resolved -
    // and must not keep the body awake forever.
    const platform = world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: FLOOR_TOP - 26 }, colliders: [{ shape: new BoxShape(200, 20) }] }));

    world.contactModifier = (contact: ContactModifierContext): void => {
      if (contact.bodyA === platform || contact.bodyB === platform) {
        contact.enabled = false;
      }
    };

    const body = addDynamic(world, new BoxShape(32, 32), FLOOR_TOP - 16 - 2);
    const sleptAt = framesUntilAsleep(world, body, 2);

    expect(sleptAt).toBeGreaterThan(0);
    expect(sleptAt).toBeLessThan(45);
  });

  it('a sleeping body woken by new overlapping geometry pushes out and settles again', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addBoxFloor(world);

    const body = addDynamic(world, new BoxShape(32, 32), FLOOR_TOP - 16 - 2);

    advance(world, 2);
    expect(body.isSleeping).toBe(true);

    // A wall appears overlapping the sleeping body by 8px. Its sleep timer is
    // frozen past timeToSleep, so only the penetration itself can re-open the
    // decision - and a body left asleep here would stay visibly inside the wall.
    world.add(new PhysicsBody({ type: 'static', position: { x: 28, y: FLOOR_TOP - 16 }, colliders: [{ shape: new BoxShape(40, 40) }] }));

    const overlapBefore = body.x + 16 - 8;

    expect(overlapBefore).toBeGreaterThan(MAX_SLEEPING_PENETRATION);

    world.step(FRAME);
    expect(body.isSleeping).toBe(false);

    advance(world, 0.5);
    expect(body.x + 16 - 8).toBeLessThan(overlapBefore); // pushing out

    const sleptAt = framesUntilAsleep(world, body, 8);

    expect(sleptAt).toBeGreaterThan(0);
    expect(body.x + 16 - 8).toBeLessThanOrEqual(MAX_SLEEPING_PENETRATION);

    // And it stays asleep: a body parked just inside the tolerance must not
    // oscillate between waking and sleeping every few frames.
    const restingX = body.x;

    for (let frame = 0; frame < 600; frame++) {
      world.step(FRAME);
      expect(body.isSleeping).toBe(true);
    }

    expect(body.x).toBe(restingX);
  });

  it('a single-point contact at high gravity settles above the slop and still sleeps', () => {
    // The converged resting depth of a one-point contact grows with gravity: at
    // 10,000 px/s² it is roughly twice the solver's slop. The sleep tolerance
    // has to clear that, so this pins the envelope from both sides - a tolerance
    // pulled down towards the slop stops this body sleeping at all.
    const world = new PhysicsWorld({ gravity: { x: 0, y: 10000 } });

    addBoxFloor(world);

    const body = addDynamic(world, new CircleShape(8), FLOOR_TOP - 8 - 0.5);
    const sleptAt = framesUntilAsleep(world, body, 8);

    expect(sleptAt).toBeGreaterThan(0);
    expect(sink(body, 8)).toBeGreaterThan(CONTACT_SLOP);
    expect(sink(body, 8)).toBeLessThanOrEqual(MAX_SLEEPING_PENETRATION);
  });

  it('a contact resting deeper than the tolerance still sleeps once its push-out has stalled', () => {
    // At this acceleration a single-point contact converges to ~0.81px, past
    // the tolerance above. That depth is the solver's fixpoint, not an overlap
    // anything is still working off, so waiting for it to shrink would keep the
    // body awake forever - the gate has to read progress, not depth alone.
    const world = new PhysicsWorld({ gravity: { x: 0, y: 20000 } });

    addBoxFloor(world);

    const body = addDynamic(world, new CircleShape(8), FLOOR_TOP - 8 - 0.5);
    const sleptAt = framesUntilAsleep(world, body, 8);

    expect(sleptAt).toBeGreaterThan(0);
    expect(sink(body, 8)).toBeGreaterThan(MAX_SLEEPING_PENETRATION);
    expect(sink(body, 8)).toBeLessThan(1);
  });

  it('a bullet stopped by CCD sleeps at the surface it hit', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });

    world.add(new PhysicsBody({ type: 'static', position: { x: 300, y: 0 }, colliders: [{ shape: new BoxShape(40, 400) }] }));

    const bullet = addDynamic(world, new CircleShape(4), 0, -200);

    bullet.isBullet = true;
    bullet.linearVelocityX = 4000;

    advance(world, 3);

    expect(bullet.isSleeping).toBe(true);
    expect(bullet.x + 4).toBeLessThanOrEqual(280 + MAX_SLEEPING_PENETRATION);
  });
});
