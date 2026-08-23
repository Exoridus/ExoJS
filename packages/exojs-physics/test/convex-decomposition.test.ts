import type { PointLike } from '@codexo/exojs';
import { Random } from '@codexo/exojs';
import { describe, expect, it } from 'vitest';

import { BoxShape, PhysicsBody, PhysicsWorld } from '../src/index';
import { toConvexPolygonShapes } from '../src/shapes/convexParts';
import { decomposeToConvexParts } from '../src/shapes/decompose';

/**
 * Convex decomposition. A simple concave outline becomes several convex
 * `PolygonShape`s on one body. What is pinned here is the geometry and the mass
 * model - never the number of parts or their order, which belong to the current
 * algorithm and may change.
 */

/** An L, concave at (20, 20). */
const lShape: PointLike[] = [
  { x: 0, y: 0 },
  { x: 60, y: 0 },
  { x: 60, y: 20 },
  { x: 20, y: 20 },
  { x: 20, y: 60 },
  { x: 0, y: 60 },
];

/** A four-pointed star: eight vertices, four of them reflex. */
const star: PointLike[] = [
  { x: 0, y: -50 },
  { x: 14, y: -14 },
  { x: 50, y: 0 },
  { x: 14, y: 14 },
  { x: 0, y: 50 },
  { x: -14, y: 14 },
  { x: -50, y: 0 },
  { x: -14, y: -14 },
];

/** A comb with three teeth - six reflex vertices, one long thin body. */
const comb: PointLike[] = [
  { x: 0, y: 0 },
  { x: 90, y: 0 },
  { x: 90, y: 60 },
  { x: 70, y: 60 },
  { x: 70, y: 20 },
  { x: 55, y: 20 },
  { x: 55, y: 60 },
  { x: 35, y: 60 },
  { x: 35, y: 20 },
  { x: 20, y: 20 },
  { x: 20, y: 60 },
  { x: 0, y: 60 },
];

interface MassProperties {
  area: number;
  centroidX: number;
  centroidY: number;
  /** Second moment of area about the centroid. */
  unitInertia: number;
}

/** Shoelace area/centroid/inertia integrals - valid for any simple polygon, concave included. */
const massPropertiesOf = (polygon: readonly PointLike[]): MassProperties => {
  const count = polygon.length;
  let doubleArea = 0;
  let cx = 0;
  let cy = 0;
  let inertiaOrigin = 0;

  for (let i = 0; i < count; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % count]!;
    const cross = a.x * b.y - b.x * a.y;

    doubleArea += cross;
    cx += (a.x + b.x) * cross;
    cy += (a.y + b.y) * cross;
    inertiaOrigin += cross * (a.x * a.x + a.x * b.x + b.x * b.x + a.y * a.y + a.y * b.y + b.y * b.y);
  }

  const area = Math.abs(doubleArea / 2);
  const signedArea = doubleArea / 2;

  cx /= 6 * signedArea;
  cy /= 6 * signedArea;

  return { area, centroidX: cx, centroidY: cy, unitInertia: Math.abs(inertiaOrigin / 12) - area * (cx * cx + cy * cy) };
};

/** Aggregate the parts the way a body aggregates its colliders (uniform density 1). */
const aggregate = (parts: readonly PointLike[][]): MassProperties => {
  let area = 0;
  let cx = 0;
  let cy = 0;
  let inertiaOrigin = 0;

  for (const part of parts) {
    const properties = massPropertiesOf(part);

    area += properties.area;
    cx += properties.area * properties.centroidX;
    cy += properties.area * properties.centroidY;
    // Parallel axis back to the origin, so parts with different centroids add up.
    inertiaOrigin += properties.unitInertia + properties.area * (properties.centroidX * properties.centroidX + properties.centroidY * properties.centroidY);
  }

  cx /= area;
  cy /= area;

  return { area, centroidX: cx, centroidY: cy, unitInertia: inertiaOrigin - area * (cx * cx + cy * cy) };
};

/** Winding-agnostic strict convexity: every turn has the same non-zero sign. */
const isStrictlyConvex = (polygon: readonly PointLike[]): boolean => {
  const count = polygon.length;
  let sign = 0;

  for (let i = 0; i < count; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % count]!;
    const c = polygon[(i + 2) % count]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);

    if (cross === 0) {
      return false;
    }

    const current = cross > 0 ? 1 : -1;

    if (sign === 0) {
      sign = current;
    } else if (sign !== current) {
      return false;
    }
  }

  return true;
};

const containsPoint = (polygon: readonly PointLike[], x: number, y: number): boolean => {
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;

    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }

  return inside;
};

/** Shortest distance from `(x, y)` to any edge of `polygon`. */
const distanceToAnyEdge = (polygon: readonly PointLike[], x: number, y: number): number => {
  let best = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const lengthSquared = ex * ex + ey * ey;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey) / lengthSquared));

    best = Math.min(best, Math.hypot(x - (a.x + ex * t), y - (a.y + ey * t)));
  }

  return best;
};

const boundsOf = (polygon: readonly PointLike[]): { minX: number; minY: number; maxX: number; maxY: number } => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of polygon) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  return { minX, minY, maxX, maxY };
};

const outlines: [string, PointLike[]][] = [
  ['L', lShape],
  ['star', star],
  ['comb', comb],
];

describe('convex decomposition', () => {
  it.each(outlines)('produces only strictly convex parts (%s)', (_name, outline) => {
    const parts = decomposeToConvexParts(outline);

    expect(parts.length).toBeGreaterThan(1);

    for (const part of parts) {
      expect(part.length).toBeGreaterThanOrEqual(3);
      expect(isStrictlyConvex(part)).toBe(true);
    }
  });

  it.each(outlines)('preserves the enclosed area exactly (%s)', (_name, outline) => {
    const source = massPropertiesOf(outline);
    const parts = decomposeToConvexParts(outline);
    const total = parts.reduce((sum, part) => sum + massPropertiesOf(part).area, 0);

    // Parts are cut from a triangulation of the outline, so each one lies inside
    // it. Equal total area therefore rules out both gaps and overlaps at once.
    expect(total).toBeCloseTo(source.area, 6);
  });

  it.each(outlines)('covers the source exactly once, point by point (%s)', (_name, outline) => {
    const parts = decomposeToConvexParts(outline);
    const bounds = boundsOf(outline);
    const random = new Random(0x5eed);
    let inside = 0;
    let outside = 0;

    for (let sample = 0; sample < 4000; sample++) {
      const x = random.next(bounds.minX - 5, bounds.maxX + 5);
      const y = random.next(bounds.minY - 5, bounds.maxY + 5);

      // A point sitting on a shared edge belongs to both neighbours or neither,
      // depending on which way the parity rule rounds - a measure-zero set the
      // area assertions already cover. Sample only the clear interior/exterior.
      if (distanceToAnyEdge(outline, x, y) < 0.05 || parts.some(part => distanceToAnyEdge(part, x, y) < 0.05)) {
        continue;
      }

      const hits = parts.filter(part => containsPoint(part, x, y)).length;

      // Exactly one part where the source is solid, none where it is not: no
      // overlaps, no gaps, and nothing spilling outside the outline.
      expect(hits).toBe(containsPoint(outline, x, y) ? 1 : 0);

      if (hits === 1) {
        inside++;
      } else {
        outside++;
      }
    }

    // Both verdicts have to be exercised, or the assertion above proves nothing.
    expect(inside).toBeGreaterThan(100);
    expect(outside).toBeGreaterThan(100);
  });

  it.each(outlines)('preserves mass, centre of mass and inertia (%s)', (_name, outline) => {
    const source = massPropertiesOf(outline);
    const total = aggregate(decomposeToConvexParts(outline));

    expect(total.area).toBeCloseTo(source.area, 6);
    expect(total.centroidX).toBeCloseTo(source.centroidX, 6);
    expect(total.centroidY).toBeCloseTo(source.centroidY, 6);
    expect(total.unitInertia).toBeCloseTo(source.unitInertia, 4);
  });

  it.each(outlines)('describes the same area whichever way the input is wound (%s)', (_name, outline) => {
    const forward = aggregate(decomposeToConvexParts(outline));
    const reversed = aggregate(decomposeToConvexParts([...outline].reverse()));

    expect(reversed.area).toBeCloseTo(forward.area, 6);
    expect(reversed.centroidX).toBeCloseTo(forward.centroidX, 6);
    expect(reversed.centroidY).toBeCloseTo(forward.centroidY, 6);
    expect(reversed.unitInertia).toBeCloseTo(forward.unitInertia, 4);
  });

  it.each(outlines)('is deterministic for the same input (%s)', (_name, outline) => {
    expect(decomposeToConvexParts(outline)).toEqual(decomposeToConvexParts(outline));
  });

  it('returns exactly one part for an already-convex outline', () => {
    const parts = decomposeToConvexParts([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);

    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(4);
  });

  it('cleans duplicate and collinear vertices before deciding convexity', () => {
    const parts = decomposeToConvexParts([
      { x: 0, y: 0 },
      { x: 5, y: 0 }, // collinear midpoint
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 10 }, // exact duplicate
      { x: 0, y: 10 },
      { x: 0, y: 0 }, // explicit ring closure
    ]);

    expect(parts).toHaveLength(1);
    expect(parts[0]).toHaveLength(4);
  });

  it('rejects a self-intersecting outline', () => {
    // A bow tie: the two crossing edges make it non-simple.
    expect(() =>
      decomposeToConvexParts([
        { x: 0, y: 0 },
        { x: 40, y: 40 },
        { x: 40, y: 0 },
        { x: 0, y: 40 },
      ]),
    ).toThrow(RangeError);
  });

  it('rejects an outline with fewer than three effective vertices', () => {
    expect(() => decomposeToConvexParts([{ x: 0, y: 0 }, { x: 10, y: 0 }])).toThrow(RangeError);
    // Three vertices, but all on one line.
    expect(() =>
      decomposeToConvexParts([
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toThrow(RangeError);
  });

  it('rejects a non-finite coordinate', () => {
    expect(() =>
      decomposeToConvexParts([
        { x: 0, y: 0 },
        { x: Number.NaN, y: 0 },
        { x: 10, y: 10 },
      ]),
    ).toThrow(RangeError);
  });
});

describe('convex parts as physics shapes', () => {
  it.each(outlines)('builds shapes whose aggregate mass model matches the outline (%s)', (_name, outline) => {
    const source = massPropertiesOf(outline);
    const shapes = toConvexPolygonShapes(outline);

    let area = 0;
    let cx = 0;
    let cy = 0;
    let inertiaOrigin = 0;

    for (const shape of shapes) {
      const properties = shape.massProperties;

      area += properties.area;
      cx += properties.area * properties.centroidX;
      cy += properties.area * properties.centroidY;
      inertiaOrigin += properties.unitInertia + properties.area * (properties.centroidX * properties.centroidX + properties.centroidY * properties.centroidY);
    }

    cx /= area;
    cy /= area;

    expect(area).toBeCloseTo(source.area, 6);
    expect(cx).toBeCloseTo(source.centroidX, 6);
    expect(cy).toBeCloseTo(source.centroidY, 6);
    expect(inertiaOrigin - area * (cx * cx + cy * cy)).toBeCloseTo(source.unitInertia, 4);
  });

  it('gives a body the mass model of the concave outline it came from', () => {
    const source = massPropertiesOf(comb);
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const body = world.add(
      new PhysicsBody({
        type: 'dynamic',
        position: { x: 0, y: 0 },
        colliders: toConvexPolygonShapes(comb).map(shape => ({ shape, density: 1 })),
      }),
    );

    expect(body.mass).toBeCloseTo(source.area, 6);
    // Body at the origin with zero angle, so the world centre of mass is the local one.
    expect(body.worldCenterOfMassX).toBeCloseTo(source.centroidX, 6);
    expect(body.worldCenterOfMassY).toBeCloseTo(source.centroidY, 6);
    expect(body.inertia).toBeCloseTo(source.unitInertia, 4);
  });

  it('never contacts itself and still collides with the outside world', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const compound = world.add(
      new PhysicsBody({
        type: 'static',
        position: { x: 0, y: 0 },
        colliders: toConvexPolygonShapes(comb).map(shape => ({ shape })),
      }),
    );
    const probe = world.add(new PhysicsBody({ type: 'kinematic', position: { x: 45, y: 5 }, colliders: [{ shape: new BoxShape(10, 10) }] }));

    expect(compound.colliders.length).toBeGreaterThan(1);

    world.step(1 / 60);

    const contacts = world.backend.contactGraph.solidContacts;

    expect(contacts.length).toBeGreaterThan(0);

    for (const contact of contacts) {
      expect(contact.a.body).not.toBe(contact.b.body);
      expect(new Set([contact.a.body, contact.b.body])).toEqual(new Set([compound, probe]));
    }
  });

  it('answers point queries over the whole compound, not just one part', () => {
    const world = new PhysicsWorld({ gravity: { x: 0, y: 0 } });
    const compound = world.add(
      new PhysicsBody({
        type: 'static',
        position: { x: 0, y: 0 },
        colliders: toConvexPolygonShapes(comb).map(shape => ({ shape })),
      }),
    );

    world.step(1 / 60);

    // Inside the comb's solid base, and inside one of its teeth.
    for (const point of [
      { x: 45, y: 5 },
      { x: 10, y: 45 },
    ]) {
      const hits = world.queryPoint(point);

      expect(hits.length).toBeGreaterThan(0);
      expect(hits.every(collider => collider.body === compound)).toBe(true);
    }

    // In a notch between two teeth - outside the outline entirely.
    expect(world.queryPoint({ x: 27, y: 45 })).toHaveLength(0);
    expect(world.queryPoint({ x: 62, y: 45 })).toHaveLength(0);
  });
});
