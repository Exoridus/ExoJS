import type { PointLike } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { BoxShape, CapsuleShape, ChainShape, CircleShape, PhysicsBody, PhysicsWorld } from '../src/index';
import type { AnyShape } from '../src/shapes/AnyShape';

/**
 * Seam behaviour where two chain edges meet. The adjacency filter keeps both
 * contacts of a collinear join - a deliberate duplicate for one flat surface -
 * so what matters is that the duplicate never reaches the body as an impulse:
 * a body crossing a seam at constant velocity must not be kicked, slowed,
 * spun or woken/put to sleep by the crossing.
 *
 * The traces below record the whole transient, not just the end pose: a seam
 * defect is a single-step spike that a position check averages away.
 */

const DT = 1 / 60;
const SPEED = 600;

const points = (...coordinates: number[]): PointLike[] => {
  const out: PointLike[] = [];

  for (let i = 0; i < coordinates.length; i += 2) {
    out.push({ x: coordinates[i]!, y: coordinates[i + 1]! });
  }

  return out;
};

/** Three collinear 100px edges from (-150, 0) to (150, 0), solid from above. */
const flatFloor = (): ChainShape => new ChainShape(points(-150, 0, -50, 0, 50, 0, 150, 0));

interface SlideTrace {
  /** Largest upward speed seen during the slide (+Y is down, so this is `-vy`). */
  maxUpward: number;
  /** Largest angular speed seen during the slide. */
  maxSpin: number;
  /** Lowest forward speed seen during the slide - a friction spike shows up here. */
  minForward: number;
  /** Sleep state changes during the slide. */
  sleepToggles: number;
  x: number;
  y: number;
}

/**
 * Settle `shape` on `chain`, launch it at a constant speed and record the whole
 * crossing. Friction is zero on both sides, so an ideal run keeps `SPEED`
 * exactly and never leaves the surface.
 */
const slideAcross = (shape: AnyShape, chain: ChainShape, startX = -120, steps = 40): SlideTrace => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });

  world.add(new PhysicsBody({ type: 'static', position: { x: 0, y: 100 }, colliders: [{ shape: chain, friction: 0 }] }));

  const body = world.add(new PhysicsBody({ type: 'dynamic', position: { x: startX, y: 60 }, colliders: [{ shape, density: 1, friction: 0 }] }));

  for (let i = 0; i < 90; i++) {
    world.step(DT);
  }

  body.wake();
  body.linearVelocityX = SPEED;

  const trace: SlideTrace = { maxUpward: 0, maxSpin: 0, minForward: Infinity, sleepToggles: 0, x: body.x, y: body.y };
  let sleeping = body.isSleeping;

  for (let i = 0; i < steps; i++) {
    world.step(DT);

    trace.maxUpward = Math.max(trace.maxUpward, -body.linearVelocityY);
    trace.maxSpin = Math.max(trace.maxSpin, Math.abs(body.angularVelocity));
    trace.minForward = Math.min(trace.minForward, body.linearVelocityX);

    if (body.isSleeping !== sleeping) {
      sleeping = body.isSleeping;
      trace.sleepToggles++;
    }
  }

  trace.x = body.x;
  trace.y = body.y;

  return trace;
};

const shapes = [
  { kind: 'box', shape: (): AnyShape => new BoxShape(20, 20) },
  { kind: 'circle', shape: (): AnyShape => new CircleShape(10) },
  { kind: 'capsule', shape: (): AnyShape => new CapsuleShape(-10, 0, 10, 0, 5) },
];

describe('a collinear chain seam', () => {
  it.each(shapes)('carries a $kind across at constant velocity', ({ shape }) => {
    const trace = slideAcross(shape(), flatFloor());

    // Both interior vertices are crossed within these 40 steps.
    expect(trace.x).toBeGreaterThan(50);
    expect(trace.maxUpward).toBeLessThan(5);
    expect(trace.maxSpin).toBeLessThan(0.5);
    expect(trace.minForward).toBeGreaterThan(SPEED - 5);
    expect(trace.sleepToggles).toBe(0);
  });

  it('is the same crossing whether the seam is there or not', () => {
    const seamed = slideAcross(new BoxShape(20, 20), flatFloor());
    const single = slideAcross(new BoxShape(20, 20), new ChainShape(points(-150, 0, 150, 0)));

    expect(seamed.x).toBeCloseTo(single.x, 3);
    expect(seamed.y).toBeCloseTo(single.y, 3);
  });
});

describe('a chain joint that is not collinear', () => {
  it('does not kick a body at a shallow convex joint', () => {
    // Flat, then a gentle drop away: the surface falls out from under the body,
    // which may leave it briefly airborne but must never push it up.
    const trace = slideAcross(new BoxShape(20, 20), new ChainShape(points(-150, 0, 0, 0, 150, 20)));

    expect(trace.x).toBeGreaterThan(50);
    expect(trace.maxUpward).toBeLessThan(5);
    expect(trace.minForward).toBeGreaterThan(SPEED - 20);
    // No spin bound here: a box running over a ridge onto a downward slope tips
    // forward, and that rotation is the surface, not a seam artefact.
  });

  it('does not kick or snag a body at a shallow concave joint', () => {
    // A gentle ramp down into a flat run: the body lands on the flat part with
    // the vertical speed the ramp gave it, and keeps going.
    const trace = slideAcross(new BoxShape(20, 20), new ChainShape(points(-150, -20, 0, 0, 150, 0)), -120, 40);

    expect(trace.x).toBeGreaterThan(50);
    expect(trace.maxUpward).toBeLessThan(20);
    expect(trace.minForward).toBeGreaterThan(SPEED - 40);
  });

  it('lets a body run off a free end instead of catching on it', () => {
    // The chain stops at x = 0; past it the body is in free fall, not stopped.
    const trace = slideAcross(new BoxShape(20, 20), new ChainShape(points(-150, 0, -50, 0, 0, 0)), -120, 40);

    expect(trace.x).toBeGreaterThan(100);
    expect(trace.y).toBeGreaterThan(120); // fell past the floor line
    expect(trace.minForward).toBeGreaterThan(SPEED - 5);
    expect(trace.maxUpward).toBeLessThan(5);
  });
});

describe('a closed chain', () => {
  it('carries a body across the closing seam like any other', () => {
    // A closed room whose floor is split at x = 0 by the closing edge, so the
    // seam under the sliding body is the wrap-around one.
    const room = new ChainShape(points(0, 100, 150, 100, 150, -100, -150, -100, -150, 100), { closed: true });
    // Stops short of the right-hand wall, so the trace is the seam crossing only.
    const trace = slideAcross(new BoxShape(20, 20), room, -120, 20);

    expect(trace.x).toBeGreaterThan(20);
    expect(trace.maxUpward).toBeLessThan(5);
    expect(trace.maxSpin).toBeLessThan(0.5);
    expect(trace.minForward).toBeGreaterThan(SPEED - 5);
  });
});
