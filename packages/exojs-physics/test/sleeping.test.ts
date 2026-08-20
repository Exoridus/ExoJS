import { describe, expect, it } from 'vitest';

import { BoxShape, PhysicsWorld } from '../src/index';
import { PhysicsBody } from '../src/PhysicsBody';

/**
 * Sleeping & islands. Bodies that come
 * to rest stop integrating/solving; connected bodies sleep and wake as a unit
 * via an island graph. Default solver config, +Y down.
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

/** A wide kinematic platform whose top surface sits at `topY`. */
const addPlatform = (world: PhysicsWorld, topY: number): PhysicsBody =>
  world.add(new PhysicsBody({ type: 'kinematic', position: { x: 0, y: topY + 20 }, colliders: [{ shape: new BoxShape(1200, 40) }] }));

/** A 32×32 dynamic box centred at `(x, y)`. */
const addBox = (world: PhysicsWorld, x: number, y: number): PhysicsBody =>
  world.add(new PhysicsBody({ type: 'dynamic', position: { x, y }, colliders: [{ shape: new BoxShape(32, 32), friction: 0.5 }] }));

/** A vertical stack of `count` boxes resting bottom-up from `floorTopY`. */
const addStack = (world: PhysicsWorld, count: number, floorTopY: number): PhysicsBody[] => {
  const boxes: PhysicsBody[] = [];

  for (let i = 0; i < count; i++) {
    boxes.push(addBox(world, 0, floorTopY - 16 - i * 32));
  }

  return boxes;
};

describe('sleeping', () => {
  it('a box that comes to rest falls asleep after timeToSleep', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(world, 300);
    const box = addBox(world, 0, 300 - 16 - 2); // 2px above its resting height

    // Still settling within the first 0.1s → must be awake.
    advance(world, 0.1);
    expect(box.isSleeping).toBe(false);

    // After resting longer than the default timeToSleep (0.5s) → asleep.
    advance(world, 2);
    expect(box.isSleeping).toBe(true);
    expect(box.linearVelocityX).toBe(0); // sleeping zeroes velocity
    expect(box.linearVelocityY).toBe(0);
    expect(box.angularVelocity).toBe(0);
  });

  it('a body dropped onto a sleeping body wakes it and is supported (no tunnelling)', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(world, 300);
    const bottom = addBox(world, 0, 300 - 16 - 2);

    advance(world, 2);
    expect(bottom.isSleeping).toBe(true);

    // Drop a second box from above onto the sleeping one.
    const top = addBox(world, 0, 300 - 16 - 64);
    advance(world, 2);

    // The top box rests ON the bottom box - if wake-on-contact failed, the
    // solver would skip the contact and the top box would tunnel through.
    expect(top.y).toBeLessThan(bottom.y - 24); // a box-height above
    expect(bottom.y).toBeGreaterThan(300 - 16 - 5); // bottom still on the floor
    expect(bottom.y).toBeLessThan(300 - 16 + 5);
  });

  it('an impulse wakes a sleeping body immediately', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(world, 300);
    const box = addBox(world, 0, 300 - 16 - 2);

    advance(world, 2);
    expect(box.isSleeping).toBe(true);

    box.applyImpulse(30000, 0); // horizontal kick
    expect(box.isSleeping).toBe(false); // woken on the spot
    expect(box.linearVelocityX).toBeGreaterThan(0);
  });

  it('a settling stack falls asleep', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(world, 300);
    const boxes = addStack(world, 4, 300);

    advance(world, 3);

    for (const box of boxes) {
      expect(box.isSleeping).toBe(true);
    }
  });

  it('allowSleep=false on one stack member keeps the whole island awake', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(world, 300);
    const boxes = addStack(world, 3, 300);
    boxes[1]!.allowSleep = false; // the middle box never sleeps

    advance(world, 3);

    // The island sleeps as a unit, so one non-sleeping member keeps all awake.
    for (const box of boxes) {
      expect(box.isSleeping).toBe(false);
    }
  });

  it('enableSleeping: false skips the sleep-timer pass entirely (bodies never sleep)', () => {
    // perf.test.ts also exercises `enableSleeping: false`, but its coverage-run
    // guard returns before ever calling `world.step` under istanbul
    // instrumentation, so that path needs its own small, un-gated test here.
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY }, enableSleeping: false });
    addFloor(world, 300);
    const box = addBox(world, 0, 300 - 16 - 2);

    advance(world, 3); // well past the default timeToSleep

    expect(box.isSleeping).toBe(false);
  });

  it('destroying a kinematic platform wakes the sleeping body it supported', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const platform = addPlatform(world, 300);
    const box = addBox(world, 0, 300 - 16 - 2);

    advance(world, 2);
    expect(box.isSleeping).toBe(true);

    const restingY = box.y;

    // A kinematic body is never an island node, so nothing else can re-open the
    // box's sleep decision once its only support disappears.
    world.destroyBody(platform);
    world.step(FRAME);

    expect(box.isSleeping).toBe(false);

    // And it actually resumes falling instead of hanging in mid-air.
    advance(world, 0.5);
    expect(box.y).toBeGreaterThan(restingY + 32);
  });

  it('a slow kinematic platform driven by velocity wakes and carries its sleeping passenger', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const platform = addPlatform(world, 300);
    const box = addBox(world, 0, 300 - 16 - 2);

    advance(world, 2);
    expect(box.isSleeping).toBe(true);

    const restingY = box.y;

    // 2 px/s is below the 5 px/s sleep threshold, so nothing about the platform's
    // own motion looks "fast" to the sleep pass - yet it must not drive through
    // the passenger.
    platform.linearVelocityY = -2;
    advance(world, 2);

    expect(box.isSleeping).toBe(false);
    expect(box.y).toBeCloseTo(restingY - 4, 0);
  });

  it('a slow kinematic platform driven by setTransform wakes and carries its sleeping passenger', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    const platform = addPlatform(world, 300);
    const box = addBox(world, 0, 300 - 16 - 2);

    advance(world, 2);
    expect(box.isSleeping).toBe(true);

    const restingY = box.y;

    // A teleported platform carries no velocity at all - the only trace of its
    // motion is the transform write itself.
    for (let frame = 0; frame < 120; frame++) {
      platform.setTransform({ x: platform.x, y: platform.y - 2 * FRAME });
      world.step(FRAME);
    }

    expect(box.isSleeping).toBe(false);
    expect(box.y).toBeLessThan(restingY - 3);
  });

  it('an idle kinematic platform still lets its passenger sleep', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });

    addPlatform(world, 300);
    const box = addBox(world, 0, 300 - 16 - 2);

    advance(world, 2);

    expect(box.isSleeping).toBe(true);
  });

  it('destroying a dynamic body wakes the sleeping stack it supported', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
    addFloor(world, 300);
    const boxes = addStack(world, 3, 300);

    advance(world, 3);

    for (const box of boxes) {
      expect(box.isSleeping).toBe(true);
    }

    const topRestingY = boxes[2]!.y;

    // Pull the bottom box out: the middle box is the direct contact, the top box
    // wakes transitively through the island it shares with the middle one.
    world.destroyBody(boxes[0]!);
    world.step(FRAME);

    expect(boxes[1]!.isSleeping).toBe(false);
    expect(boxes[2]!.isSleeping).toBe(false);

    advance(world, 0.5);
    expect(boxes[2]!.y).toBeGreaterThan(topRestingY + 16);
  });

  it('sleep transitions are deterministic across identical runs', () => {
    const run = (): string => {
      const world = new PhysicsWorld({ gravity: { x: 0, y: GRAVITY } });
      addFloor(world, 300);
      const boxes = addStack(world, 4, 300);
      const trace: string[] = [];

      for (let frame = 0; frame < 240; frame++) {
        world.step(FRAME);
        trace.push(boxes.map(box => (box.isSleeping ? '1' : '0')).join(''));
      }

      return trace.join('|');
    };

    expect(run()).toBe(run());
  });
});
