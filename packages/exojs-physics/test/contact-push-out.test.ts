import { describe, expect, it } from 'vitest';

import { BoxShape, CircleShape, PhysicsBody, PhysicsWorld } from '../src/index';

/**
 * What a resting contact settles to, and what happens once the push-out cap
 * binds. The soft normal solve is a damped spring, so a single-point contact
 * rests one static spring deflection deeper than its slop, while a two-point
 * face contact is solved as a hard block and rests exactly at the slop. Both
 * are fixpoints, and they must stay fixpoints at accelerations high enough to
 * saturate the push-out cap - a contact that cannot hold its ground there sinks
 * without bound instead of degrading.
 *
 * The numbers below are literals rather than engine constants on purpose: they
 * pin the observable resting behaviour, so retuning `contactSlop`,
 * `maxBiasVelocity`, `contactHertz` or `dampingRatio` has to be a deliberate
 * change to this file too.
 */

const FRAME = 1 / 60;
const FLOOR_TOP = 300;
const CONTACT_SLOP = 0.25;
const CONTACT_HERTZ = 30;
const RADIUS = 8;

/** Static spring deflection of the soft normal constraint at acceleration `g`. */
const softDeflection = (g: number): number => g / (2 * Math.PI * CONTACT_HERTZ) ** 2;

const worldWithFloor = (gravity: number): PhysicsWorld => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: gravity }, enableSleeping: false });

  world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: FLOOR_TOP + 200 }, colliders: [{ shape: new BoxShape(20000, 400) }] }));

  return world;
};

/**
 * Spawn the body one slop into the floor rather than dropping it: a drop adds an
 * impact transient that takes hundreds of frames to work off and hides the
 * fixpoint the test is about.
 */
const restingBody = (world: PhysicsWorld, shape: BoxShape | CircleShape, halfHeight: number): PhysicsBody =>
  world.add(
    new PhysicsBody({
      type: 'dynamic',
      position: { x: 0, y: FLOOR_TOP - halfHeight + CONTACT_SLOP },
      colliders: [{ shape, density: 1 }],
    }),
  );

const advance = (world: PhysicsWorld, frames: number): void => {
  for (let frame = 0; frame < frames; frame++) {
    world.step(FRAME);
  }
};

const penetration = (body: PhysicsBody, halfHeight: number): number => body.y + halfHeight - FLOOR_TOP;

describe('resting contact push-out', () => {
  it.each([
    [1000, 0.2781],
    [10000, 0.5314],
  ])('a single-point contact rests one soft deflection below the slop at g = %i', (gravity, expected) => {
    const world = worldWithFloor(gravity);
    const body = restingBody(world, new CircleShape(RADIUS), RADIUS);

    advance(world, 2000);

    expect(CONTACT_SLOP + softDeflection(gravity)).toBeCloseTo(expected, 4);
    expect(penetration(body, RADIUS)).toBeCloseTo(expected, 3);
  });

  it('a face contact rests exactly at the slop, however hard gravity pulls', () => {
    const world = worldWithFloor(10000);
    const body = restingBody(world, new BoxShape(2 * RADIUS, 2 * RADIUS), RADIUS);

    advance(world, 2000);

    expect(penetration(body, RADIUS)).toBeCloseTo(CONTACT_SLOP, 4);
  });

  it.each([20000, 100000])('a single-point contact still holds a fixpoint at g = %i, where the push-out cap binds', gravity => {
    const world = worldWithFloor(gravity);
    const body = restingBody(world, new CircleShape(RADIUS), RADIUS);

    advance(world, 2000);

    let deepest = 0;
    let shallowest = Number.POSITIVE_INFINITY;

    for (let frame = 0; frame < 2000; frame++) {
      world.step(FRAME);

      const depth = penetration(body, RADIUS);

      deepest = Math.max(deepest, depth);
      shallowest = Math.min(shallowest, depth);
    }

    // Deeper than the uncapped law predicts - the cap is doing the work - and no
    // longer an exact fixpoint but a narrow limit cycle around the depth at
    // which the cap starts to bind. Bounded, stationary in the mean, and still
    // an overlap the narrow phase keeps reporting.
    expect(deepest).toBeLessThan(1);
    expect(deepest - shallowest).toBeLessThan(0.1);
    expect(world.backend.contactGraph.solidContacts.length).toBe(1);
  });

  it('a light body squeezed under a 1000:1 load settles instead of drifting', () => {
    const world = worldWithFloor(1000);
    const light = restingBody(world, new BoxShape(16, 16), 8);

    world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 0, y: FLOOR_TOP - 16 - 32 },
        colliders: [{ shape: new BoxShape(64, 64), density: 250 }],
      }),
    );

    advance(world, 6000);

    const settled = penetration(light, 8);

    advance(world, 2000);

    expect(settled).toBeLessThan(1);
    expect(penetration(light, 8)).toBeCloseTo(settled, 3);
  });
});
