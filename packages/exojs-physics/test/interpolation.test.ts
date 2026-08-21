import type { SceneNode } from '@codexo/exojs';
import { Time } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { BoxShape, PhysicsBody, PhysicsWorld } from '../src/index';

/**
 * Fixed-state interpolation. The body brackets its last fixed step with a
 * previous/current transform pair; an interpolating binding places the node
 * between them using the host's leftover sub-step fraction. Presentation only -
 * nothing written onto a node is read back into the simulation.
 */

interface FakeNode {
  skewX: number;
  skewY: number;
  x: number;
  y: number;
  rotation: number;
  destroyed: boolean;
  setPosition(x: number, y: number): FakeNode;
  setRotation(degrees: number): FakeNode;
}

const fakeNode = (): FakeNode => ({
  skewX: 0,
  skewY: 0,
  x: 0,
  y: 0,
  rotation: 0,
  destroyed: false,
  setPosition(x: number, y: number) {
    this.x = x;
    this.y = y;

    return this;
  },
  setRotation(degrees: number) {
    this.rotation = degrees;

    return this;
  },
});

const FIXED = 1 / 60;

/** A dynamic body moving at a constant velocity, so its per-step delta is exact. */
const movingBody = (world: PhysicsWorld, velocityX: number): PhysicsBody => {
  const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

  body.linearVelocityX = velocityX;

  return body;
};

describe('previous fixed state', () => {
  it('brackets the last fixed step', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = movingBody(world, 600); // 10px per fixed step

    world.step(FIXED);

    expect(body.previousX).toBeCloseTo(0, 6);
    expect(body.x).toBeCloseTo(10, 6);

    world.step(FIXED);

    expect(body.previousX).toBeCloseTo(10, 6);
    expect(body.x).toBeCloseTo(20, 6);
  });

  it('brackets only the LAST step when one call runs several', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = movingBody(world, 600);

    // Three fixed steps in one call.
    world.step(FIXED * 3);

    expect(body.x).toBeCloseTo(30, 6);
    expect(body.previousX).toBeCloseTo(20, 6);
  });

  it('reports previous === current for a body that did not move', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    // Far from the mover's path: nothing touches it, so it never moves.
    const still = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 400, y: 400 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    const mover = movingBody(world, 600);

    world.step(FIXED * 2);

    expect(mover.previousX).not.toBeCloseTo(mover.x, 6);
    expect(still.previousX).toBeCloseTo(still.x, 6);
    expect(still.previousY).toBeCloseTo(still.y, 6);
    expect(still.previousAngle).toBeCloseTo(still.angle, 6);
  });

  it('collapses the pair on a teleport', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = movingBody(world, 600);

    world.step(FIXED);
    expect(body.previousX).not.toBeCloseTo(body.x, 6);

    body.setTransform({ x: 500, y: 500 }, 1.5);

    expect(body.previousX).toBe(500);
    expect(body.previousY).toBe(500);
    expect(body.previousAngle).toBe(1.5);
  });

  it('starts collapsed at the constructed transform', () => {
    const body = new PhysicsBody({ type: 'dynamic', position: { x: 3, y: 4 }, angle: 0.25, colliders: [{ shape: new BoxShape(10, 10) }] });

    expect(body.previousX).toBe(3);
    expect(body.previousY).toBe(4);
    expect(body.previousAngle).toBe(0.25);
  });
});

describe('interpolated bindings', () => {
  it('snaps to the current fixed state by default', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = movingBody(world, 600);
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);
    // Half a fixed step of leftover, which a snapping binding must ignore.
    world.step(FIXED * 1.5);

    expect(world.interpolation).toBe(false);
    expect(node.x).toBeCloseTo(body.x, 6);
  });

  it('places the node between the two fixed states by the leftover fraction', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, interpolation: true });
    const body = movingBody(world, 600);
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);
    world.step(FIXED * 1.5);

    // One step ran (x: 0 → 10) and half a step is left over in the accumulator.
    expect(world.timeStepper.alpha).toBeCloseTo(0.5, 6);
    expect(body.previousX).toBeCloseTo(0, 6);
    expect(body.x).toBeCloseTo(10, 6);
    expect(node.x).toBeCloseTo(5, 6);
  });

  it('interpolates rotation through the unbounded angle, without wrapping', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, interpolation: true, frameAlphaSource: () => 0.5 });
    const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: 0, y: 0 }, colliders: [{ shape: new BoxShape(10, 10) }] }));
    const node = fakeNode();

    // Spin fast enough that the angle runs well past a full turn.
    body.angularVelocity = 60 * Math.PI; // π rad per fixed step
    world.bind(body, node as unknown as SceneNode);

    for (let step = 0; step < 5; step++) {
      world.step(FIXED);
    }

    expect(body.angle).toBeCloseTo(5 * Math.PI, 4);
    expect(body.previousAngle).toBeCloseTo(4 * Math.PI, 4);
    // Halfway between the two, in degrees - continuous, not wrapped into [0, 360).
    expect(node.rotation).toBeCloseTo((4.5 * Math.PI * 180) / Math.PI, 3);
  });

  it('does not sweep a node across a teleport', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, interpolation: true, frameAlphaSource: () => 0.5 });
    const body = movingBody(world, 600);
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);
    world.step(FIXED);

    body.linearVelocityX = 0;
    body.setTransform({ x: 1000, y: 0 });
    world.step(FIXED);

    // Placed at the destination, not halfway back towards where it came from.
    expect(node.x).toBeCloseTo(1000, 6);
  });

  it('clamps a blend factor supplied outside [0, 1]', () => {
    const alphas = [-3, 0, 0.25, 1, 4, Number.NaN];
    const results: number[] = [];

    for (const alpha of alphas) {
      const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, interpolation: true, frameAlphaSource: () => alpha });
      const body = movingBody(world, 600);
      const node = fakeNode();

      world.bind(body, node as unknown as SceneNode);
      world.step(FIXED);
      results.push(node.x);
    }

    // previous = 0, current = 10 → every result stays inside the bracket.
    expect(results).toEqual([0, 0, 2.5, 10, 10, 0]);
  });

  it('can be switched off at runtime and snaps back on the next sync', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, interpolation: true, frameAlphaSource: () => 0 });
    const body = movingBody(world, 600);
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);
    world.step(FIXED);

    expect(node.x).toBeCloseTo(0, 6); // alpha 0 → the state the step started from

    world.interpolation = false;
    world.step(FIXED);

    expect(node.x).toBeCloseTo(body.x, 6);
  });
});

describe('system-driven interpolation', () => {
  it('presents once per frame from update(), not per fixed step', () => {
    let hostAlpha = 0;
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 }, interpolation: true, frameAlphaSource: () => hostAlpha });
    const body = movingBody(world, 600);
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);
    node.setPosition(-1, -1);

    // Two fixed steps for this frame: neither may present.
    world.fixedUpdate(Time.zero);
    world.fixedUpdate(Time.zero);

    expect(node.x).toBe(-1);

    hostAlpha = 0.25;
    world.update(Time.zero);

    // previous = 10 (start of the second step), current = 20.
    expect(body.previousX).toBeCloseTo(10, 6);
    expect(body.x).toBeCloseTo(20, 6);
    expect(node.x).toBeCloseTo(12.5, 6);
  });

  it('still snaps from fixedUpdate() when interpolation is off', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = movingBody(world, 600);
    const node = fakeNode();

    world.bind(body, node as unknown as SceneNode);
    world.fixedUpdate(Time.zero);

    expect(node.x).toBeCloseTo(body.x, 6);

    const snapped = node.x;
    world.update(Time.zero);

    expect(node.x).toBe(snapped);
  });
});
