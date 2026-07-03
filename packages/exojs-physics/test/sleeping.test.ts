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

    // The top box rests ON the bottom box — if wake-on-contact failed, the
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
