import type { PointLike } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import type { Collider } from '../src/Collider';
import { Manifold } from '../src/collision/Manifold';
import { collide, testOverlap } from '../src/collision/narrowphase';
import { BoxShape, CapsuleShape, ChainShape, CircleShape, PhysicsWorld, PolygonShape, SegmentShape } from '../src/index';
import { colliderAt } from './support';

const points = (...values: number[]): PointLike[] => {
  const out: PointLike[] = [];

  for (let i = 0; i < values.length; i += 2) {
    out.push({ x: values[i]!, y: values[i + 1]! });
  }

  return out;
};

const move = (world: PhysicsWorld, collider: Collider, position: Readonly<PointLike>, angle = 0): void => {
  collider.body.setTransform(position, angle);
  world.step(0);
};

// A floor box whose top-right corner is (100, 90), and a vertical capsule whose
// lower cap centre sits 12 below its position.
const floor = (): BoxShape => new BoxShape(200, 20);
const upright = (): CapsuleShape => new CapsuleShape(0, -12, 0, 12, 8);

describe('rounded overlap near corners', () => {
  const manifold = new Manifold();

  it.each(['capsule', 'segment'] as const)('decides collinear capsule/%s overlap by the gap between spine endpoints', kind => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new CapsuleShape(-10, 0, 10, 0, 2), { x: 0, y: 0 });
    const shape = kind === 'capsule' ? new CapsuleShape(-10, 0, 10, 0, 3) : new SegmentShape(-10, 0, 10, 0);
    const b = colliderAt(world, shape, { x: 0, y: 0 });
    const radius = kind === 'capsule' ? 5 : 2;

    for (const gap of [radius + 0.01, radius - 0.01, -1]) {
      move(world, b, { x: 20 + gap, y: 0 });

      expect(testOverlap(a, b), `gap ${gap}`).toBe(gap < radius);
      expect(testOverlap(b, a), `reversed gap ${gap}`).toBe(gap < radius);
    }
  });

  it('does not report a capsule beside a box corner it does not reach', () => {
    const world = new PhysicsWorld();

    colliderAt(world, floor(), { x: 0, y: 100 });

    // Lower cap centre (104, 83): about 8.06 from the corner, radius 8.
    expect(world.overlapShape(upright(), { x: 104, y: 71 })).toHaveLength(0);
    expect(world.overlapShape(new CircleShape(8), { x: 104, y: 83 })).toHaveLength(0);
    expect(world.shapeCast(upright(), { x: 104, y: 71 }, { x: 0, y: 0 })).toBeNull();
  });

  it('decides corner overlap by the distance to the corner, around the whole vertex region', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, floor(), { x: 0, y: 100 });
    const capsule = colliderAt(world, upright(), { x: 0, y: 0 });

    // Every direction strictly between the top face's and the right face's normals.
    for (let step = 1; step < 12; step++) {
      const angle = (step / 12) * (Math.PI / 2);
      const dx = Math.cos(angle);
      const dy = -Math.sin(angle);

      for (const distance of [7.99, 8.01]) {
        move(world, capsule, { x: 100 + dx * distance, y: 90 + dy * distance - 12 });

        const expected = distance < 8;

        expect(testOverlap(box, capsule), `angle ${angle}, distance ${distance}`).toBe(expected);
        expect(testOverlap(capsule, box), `reversed, angle ${angle}, distance ${distance}`).toBe(expected);
        expect(collide(box, capsule, manifold), `collide, angle ${angle}, distance ${distance}`).toBe(expected);
      }
    }
  });

  it('decides corner overlap for a rotated capsule by the distance from its spine', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, floor(), { x: 0, y: 100 });
    const capsule = colliderAt(world, upright(), { x: 0, y: 0 });
    const tilt = 0.6;

    move(world, capsule, { x: 0, y: 0 }, tilt);

    // The lower spine end, relative to the capsule's position, once turned by `tilt`.
    const spine = capsule.worldVertices;
    const lower = spine[1]! > spine[3]! ? { x: spine[0]!, y: spine[1]! } : { x: spine[2]!, y: spine[3]! };

    for (const distance of [7.99, 8.01]) {
      // Lower end straight up and to the right of the corner, in its vertex region.
      const ex = 100 + Math.SQRT1_2 * distance;
      const ey = 90 - Math.SQRT1_2 * distance;

      move(world, capsule, { x: ex - lower.x, y: ey - lower.y }, tilt);

      expect(testOverlap(box, capsule), `distance ${distance}`).toBe(distance < 8);
      expect(testOverlap(capsule, box), `reversed, distance ${distance}`).toBe(distance < 8);
    }
  });

  it('agrees with the contact manifold across a grid around a box corner', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, new PolygonShape(points(-20, -20, 20, -20, 20, 20, -20, 20)), { x: 0, y: 0 }, 0.3);
    const capsule = colliderAt(world, new CapsuleShape(-10, 0, 10, 0, 5), { x: 0, y: 0 });

    for (let x = -50; x <= 50; x += 2.5) {
      for (let y = -50; y <= 50; y += 2.5) {
        for (const angle of [0, 0.7, 1.9]) {
          move(world, capsule, { x: x + 0.123, y: y + 0.0789 }, angle);

          const touching = collide(box, capsule, manifold);

          expect(testOverlap(box, capsule), `(${x}, ${y}) angle ${angle}`).toBe(touching);
          expect(testOverlap(capsule, box), `reversed (${x}, ${y}) angle ${angle}`).toBe(touching);
        }
      }
    }
  });

  it('still reports a capsule core inside a polygon', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, new BoxShape(100, 100), { x: 0, y: 0 });
    const capsule = colliderAt(world, new CapsuleShape(-5, 0, 5, 0, 2), { x: 3, y: 4 });

    expect(testOverlap(box, capsule)).toBe(true);
    expect(testOverlap(capsule, box)).toBe(true);
  });

  it('decides capsule against segment end by the distance to the end', () => {
    const world = new PhysicsWorld();
    const segment = colliderAt(world, new SegmentShape(-50, 0, 50, 0), { x: 0, y: 0 });
    const capsule = colliderAt(world, upright(), { x: 0, y: 0 });

    for (const distance of [7.99, 8.01]) {
      // Lower cap centre up and to the right of the segment's end at (50, 0).
      move(world, capsule, { x: 50 + Math.SQRT1_2 * distance, y: -Math.SQRT1_2 * distance - 12 });

      expect(testOverlap(segment, capsule), `distance ${distance}`).toBe(distance < 8);
      expect(testOverlap(capsule, segment), `reversed, distance ${distance}`).toBe(distance < 8);
    }
  });

  it('decides capsule against capsule by the distance between their spines', () => {
    const world = new PhysicsWorld();
    const lying = colliderAt(world, new CapsuleShape(-20, 0, 20, 0, 5), { x: 0, y: 0 });
    const standing = colliderAt(world, new CapsuleShape(0, -20, 0, 20, 3), { x: 0, y: 0 });

    for (const distance of [7.99, 8.01]) {
      // The standing capsule's lower spine end diagonally beyond the lying one's right end.
      move(world, standing, { x: 20 + Math.SQRT1_2 * distance, y: -Math.SQRT1_2 * distance - 20 });

      expect(testOverlap(lying, standing), `distance ${distance}`).toBe(distance < 8);
      expect(testOverlap(standing, lying), `reversed, distance ${distance}`).toBe(distance < 8);
    }
  });

  it('leaves polygon against polygon to the face axes', () => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, new BoxShape(20, 20), { x: 0, y: 0 });
    const b = colliderAt(world, new BoxShape(20, 20), { x: 19.5, y: 19.5 }, 0.2);
    const c = colliderAt(world, new BoxShape(20, 20), { x: 21, y: 0 });

    expect(testOverlap(a, b)).toBe(collide(a, b, manifold));
    expect(testOverlap(a, c)).toBe(false);
  });
});

describe('rounded overlap against chains', () => {
  it('does not report a capsule beside a convex chain corner it does not reach', () => {
    const world = new PhysicsWorld();

    // A ledge: floor along y = 90 up to x = 100, then straight down.
    colliderAt(world, new ChainShape(points(-100, 90, 100, 90, 100, 200)), { x: 0, y: 0 });

    expect(world.overlapShape(upright(), { x: 104, y: 71 })).toHaveLength(0);
    expect(world.overlapShape(upright(), { x: 104, y: 72 })).toHaveLength(1);
  });

  it('reports a capsule resting in a concave joint, and over a straight seam, once', () => {
    const world = new PhysicsWorld();
    const valley = colliderAt(world, new ChainShape(points(-100, 0, 0, 50, 100, 0)), { x: 0, y: 0 });
    const flat = colliderAt(world, new ChainShape(points(-100, 200, 0, 200, 100, 200)), { x: 0, y: 0 });

    expect(world.overlapShape(upright(), { x: 0, y: 30 })).toEqual([valley]);
    expect(world.overlapShape(upright(), { x: 0, y: 200 - 7.99 - 12 })).toEqual([flat]);
    expect(world.overlapShape(upright(), { x: 0, y: 200 - 8.01 - 12 })).toHaveLength(0);
  });
});

describe('capsule sensors near corners', () => {
  it('enters and exits by the true distance to a box corner', () => {
    const world = new PhysicsWorld();

    colliderAt(world, floor(), { x: 0, y: 100 });

    const sensor = colliderAt(world, upright(), { x: 104, y: 71 }, 0, 'kinematic', { isSensor: true });
    const log: string[] = [];

    world.onSensorEnter.add(() => log.push('enter'));
    world.onSensorExit.add(() => log.push('exit'));
    world.step(1 / 60);
    expect(log).toEqual([]);

    move(world, sensor, { x: 104, y: 72 });
    world.step(1 / 60);
    expect(log).toEqual(['enter']);

    move(world, sensor, { x: 104, y: 71 });
    world.step(1 / 60);
    expect(log).toEqual(['enter', 'exit']);
  });
});
