import type { PointLike } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import type { Collider } from '../src/Collider';
import { Manifold } from '../src/collision/Manifold';
import { collide, testOverlap } from '../src/collision/narrowphase';
import { BoxShape, CapsuleShape, ChainShape, CircleShape, PhysicsWorld, PolygonShape, SegmentShape } from '../src/index';
import type { AnyShape } from '../src/shapes/AnyShape';
import type { ShapeType } from '../src/shapes/Shape';
import { colliderAt } from './support';

/**
 * The narrow phase across every shape combination, in both operand orders.
 *
 * Per-shape suites cover the geometry; this one covers the dispatch: which pairs
 * are solved at all, and whether swapping the operands only reverses the normal
 * instead of changing the answer.
 */

const solverKinds: readonly ShapeType[] = ['circle', 'polygon', 'capsule', 'segment'];

/** Half-height of each probe shape, so a pair can be placed at a known penetration. */
const halfHeight: Readonly<Record<string, number>> = { circle: 10, polygon: 10, capsule: 5, segment: 0 };

const probe = (kind: ShapeType): AnyShape => {
  switch (kind) {
    case 'circle':
      return new CircleShape(10);
    case 'polygon':
      return new BoxShape(20, 20);
    case 'capsule':
      return new CapsuleShape(-5, 0, 5, 0, 5);
    case 'segment':
      return new SegmentShape(-5, 0, 5, 0);
    case 'chain':
      return new ChainShape([
        { x: -5, y: 0 },
        { x: 5, y: 0 },
      ]);
  }
};

const points = (...coordinates: number[]): PointLike[] => {
  const out: PointLike[] = [];

  for (let i = 0; i < coordinates.length; i += 2) {
    out.push({ x: coordinates[i]!, y: coordinates[i + 1]! });
  }

  return out;
};

const manifoldA = new Manifold();
const manifoldB = new Manifold();

/** Deepest point of a manifold, which is the penetration the pair was built for. */
const deepest = (manifold: Manifold): number => {
  let deepestPoint = 0;

  for (let i = 0; i < manifold.pointCount; i++) {
    const point = i === 0 ? manifold.points[0] : manifold.points[1];

    deepestPoint = Math.max(deepestPoint, point.penetration);
  }

  return deepestPoint;
};

/**
 * Two colliders of the given kinds, stacked on the y axis with exactly 1px of
 * overlap and aligned in x, so the shallowest axis - and therefore the contact
 * normal - is `(0, ±1)` for every pair in the matrix.
 */
const overlappingPair = (first: ShapeType, second: ShapeType): { a: Collider; b: Collider } => {
  const world = new PhysicsWorld();
  const separation = halfHeight[first]! + halfHeight[second]! - 1;

  return {
    a: colliderAt(world, probe(first), { x: 0, y: 0 }),
    b: colliderAt(world, probe(second), { x: 0, y: separation }),
  };
};

const orderedPairs = solverKinds.flatMap((first) => solverKinds.map((second) => ({ first, second })));

describe('cross-shape collision matrix', () => {
  it.each(orderedPairs.filter(({ first, second }) => !(first === 'segment' && second === 'segment')))(
    'solves $first against $second in both operand orders',
    ({ first, second }) => {
      const { a, b } = overlappingPair(first, second);

      expect(collide(a, b, manifoldA)).toBe(true);
      expect(collide(b, a, manifoldB)).toBe(true);

      // The normal always points from the first operand toward the second, so
      // swapping the operands must reverse it and change nothing else.
      expect(manifoldA.normalY).toBeCloseTo(1, 6);
      expect(manifoldA.normalX).toBeCloseTo(0, 6);
      expect(manifoldB.normalY).toBeCloseTo(-1, 6);
      expect(manifoldB.normalX).toBeCloseTo(0, 6);
      expect(manifoldB.pointCount).toBe(manifoldA.pointCount);
      expect(deepest(manifoldB)).toBeCloseTo(deepest(manifoldA), 6);
      expect(deepest(manifoldA)).toBeCloseTo(1, 6);

      expect(testOverlap(a, b)).toBe(true);
      expect(testOverlap(b, a)).toBe(true);
    },
  );

  it('leaves two boundaries unsolved: no overlap volume, no stable manifold', () => {
    const { a, b } = overlappingPair('segment', 'segment');

    expect(collide(a, b, manifoldA)).toBe(false);
    expect(collide(b, a, manifoldB)).toBe(false);
    expect(testOverlap(a, b)).toBe(false);
    expect(testOverlap(b, a)).toBe(false);
  });

  it.each(solverKinds)('separates %s from a partner just out of reach', (kind) => {
    const world = new PhysicsWorld();
    const a = colliderAt(world, probe(kind), { x: 0, y: 0 });
    // 1px of clearance instead of 1px of overlap.
    const b = colliderAt(world, probe('circle'), { x: 0, y: halfHeight[kind]! + 11 });

    expect(collide(a, b, manifoldA)).toBe(false);
    expect(collide(b, a, manifoldB)).toBe(false);
    expect(testOverlap(a, b)).toBe(false);
  });

  it('treats a box as the polygon it is, and a rotated one no differently', () => {
    const world = new PhysicsWorld();
    // A 90° rotated 40×20 box has the same 20px half-height as the probe box.
    const rotated = colliderAt(world, new BoxShape(20, 40), { x: 0, y: 0 }, Math.PI / 2);
    const capsule = colliderAt(world, probe('capsule'), { x: 0, y: 14 });

    expect(collide(rotated, capsule, manifoldA)).toBe(true);
    expect(manifoldA.normalY).toBeCloseTo(1, 6);
    expect(deepest(manifoldA)).toBeCloseTo(1, 6);
  });

  it('solves a non-rectangular polygon against a rounded shape', () => {
    const world = new PhysicsWorld();
    const triangle = colliderAt(world, new PolygonShape(points(-10, -10, 10, -10, 0, 10)), { x: 0, y: 0 });
    const capsule = colliderAt(world, probe('capsule'), { x: 0, y: 14 });

    expect(collide(triangle, capsule, manifoldA)).toBe(true);
    expect(collide(capsule, triangle, manifoldB)).toBe(true);
    expect(manifoldB.normalX).toBeCloseTo(-manifoldA.normalX, 6);
    expect(manifoldB.normalY).toBeCloseTo(-manifoldA.normalY, 6);
  });
});

describe('a chain in the matrix', () => {
  /** The engine-owned edge proxies of a one-edge chain placed at `y`. */
  const chainEdgeAt = (world: PhysicsWorld, y: number): { chain: Collider; edge: Collider } => {
    const chain = colliderAt(world, probe('chain'), { x: 0, y });

    return { chain, edge: chain.chainEdges![0]! };
  };

  it.each(['circle', 'polygon', 'capsule'] as const)('solves a chain edge against %s', (kind) => {
    const world = new PhysicsWorld();
    const solid = colliderAt(world, probe(kind), { x: 0, y: 0 });
    // Below the solid, so the chain's outward normal (up, for a left-to-right
    // chain) faces it and the adjacency filter admits the contact.
    const { edge } = chainEdgeAt(world, halfHeight[kind]! - 1);

    expect(collide(solid, edge, manifoldA)).toBe(true);
    expect(collide(edge, solid, manifoldB)).toBe(true);
    expect(manifoldB.normalX).toBeCloseTo(-manifoldA.normalX, 6);
    expect(manifoldB.normalY).toBeCloseTo(-manifoldA.normalY, 6);
    expect(deepest(manifoldA)).toBeCloseTo(1, 6);
  });

  it('is never an operand itself - the authored collider carries no world geometry', () => {
    const world = new PhysicsWorld();
    const box = colliderAt(world, probe('polygon'), { x: 0, y: 0 });
    const { chain } = chainEdgeAt(world, 9);

    expect(collide(chain, box, manifoldA)).toBe(false);
    expect(testOverlap(chain, box)).toBe(false);
  });

  it('never reports a contact against another boundary', () => {
    const world = new PhysicsWorld();
    const { edge } = chainEdgeAt(world, 0);
    const other = chainEdgeAt(world, 0.5);
    const segment = colliderAt(world, probe('segment'), { x: 0, y: 0.5 });

    expect(collide(edge, other.edge, manifoldA)).toBe(false);
    expect(collide(edge, segment, manifoldA)).toBe(false);
    expect(collide(segment, edge, manifoldA)).toBe(false);
    expect(testOverlap(edge, segment)).toBe(false);
  });

  it('admits a contact only from its solid side', () => {
    const world = new PhysicsWorld();
    const above = colliderAt(world, new CircleShape(10), { x: 0, y: -9 });
    const below = colliderAt(world, new CircleShape(10), { x: 0, y: 9 });
    const { edge } = chainEdgeAt(world, 0);

    expect(collide(above, edge, manifoldA)).toBe(true);
    expect(collide(below, edge, manifoldB)).toBe(false);
  });
});
