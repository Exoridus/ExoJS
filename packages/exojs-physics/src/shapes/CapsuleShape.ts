import type { ShapeMassProperties } from './Shape';
import { Shape } from './Shape';

/** Spines shorter than this (px) have no well-defined orientation. */
const minimumLength = 1e-3;

/**
 * A capsule: the set of points within `radius` of the segment between two
 * local-space endpoints. Exact geometry, never a polygon approximation - the
 * mass model and the narrow phase both work on the spine and the radius, so
 * nothing about a capsule depends on a tessellation constant.
 *
 * The spine is given as two points rather than a centre, a half-height and an
 * angle: every consumer needs the two endpoints, and the collider already
 * carries a local rotation, so an angle on the shape would be a second and
 * redundant orientation.
 *
 * A zero-length spine is rejected rather than quietly becoming a circle - use
 * {@link CircleShape} to say that.
 */
export class CapsuleShape extends Shape {
  public readonly type = 'capsule' as const;

  /** Local spine endpoints, flattened - the same layout a polygon uses. */
  public readonly vertices: readonly number[];

  /** Outward unit normals of the two spine sides, flattened. */
  public readonly normals: readonly number[];

  public readonly radius: number;

  /** Spine length; the capsule is `length + 2 × radius` long overall. */
  public readonly length: number;

  public readonly boundingRadius: number;
  public readonly massProperties: ShapeMassProperties;

  public constructor(x0: number, y0: number, x1: number, y1: number, radius: number) {
    super();

    if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) {
      throw new RangeError(`CapsuleShape: spine endpoints must be finite, received (${x0}, ${y0}) and (${x1}, ${y1}).`);
    }

    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError(`CapsuleShape: radius must be a positive finite number, received ${radius}.`);
    }

    const ex = x1 - x0;
    const ey = y1 - y0;
    const length = Math.hypot(ex, ey);

    if (length < minimumLength) {
      throw new RangeError(`CapsuleShape: the spine is degenerate (length ${length}); use CircleShape for a round collider.`);
    }

    // Same convention as PolygonShape: for the counter-clockwise edge i → i+1 the
    // outward normal is (eY, -eX). A two-vertex ring has two opposite edges, so
    // the second normal is the negation of the first.
    const nx = ey / length;
    const ny = -ex / length;

    this.radius = radius;
    this.length = length;
    this.vertices = Object.freeze([x0, y0, x1, y1]);
    this.normals = Object.freeze([nx, ny, -nx, -ny]);
    this.boundingRadius = Math.max(Math.hypot(x0, y0), Math.hypot(x1, y1)) + radius;
    this.massProperties = Object.freeze(capsuleMassProperties(x0, y0, x1, y1, length, radius));

    Object.freeze(this);
  }
}

/**
 * Exact area-based mass properties: a `2r × L` rectangle plus the two end
 * caps, which together are a full disc of radius `r` displaced to the ends.
 *
 * The second moment about the centroid is the sum of
 * - the rectangle's polar moment `A·((2r)² + L²)/12`, and
 * - the two caps', each shifted from its own centroid to the capsule centre by
 *   the parallel-axis theorem. A half-disc's polar moment about the centre of
 *   its flat edge is `π r⁴/4`, and its centroid sits `4r/(3π)` from that edge.
 *
 * At `L → 0` the cap terms alone give `π r⁴/2`, the disc value {@link CircleShape}
 * computes - which is the check that pins the constants.
 */
const capsuleMassProperties = (x0: number, y0: number, x1: number, y1: number, length: number, radius: number): ShapeMassProperties => {
  const rectangleArea = 2 * radius * length;
  const capArea = Math.PI * radius * radius;
  const rectangleInertia = (rectangleArea * (4 * radius * radius + length * length)) / 12;
  const capInertia = (Math.PI * radius ** 4) / 2 + (Math.PI * radius * radius * length * length) / 4 + (4 * radius ** 3 * length) / 3;

  return {
    area: rectangleArea + capArea,
    // Both the rectangle and the cap pair are symmetric about the spine midpoint.
    centroidX: (x0 + x1) / 2,
    centroidY: (y0 + y1) / 2,
    unitInertia: rectangleInertia + capInertia,
  };
};
