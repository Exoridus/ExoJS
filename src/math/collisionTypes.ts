import type { Interval } from './Interval';
import type { Vector } from './Vector';

/**
 * Discriminant tag carried by every {@link Collidable} so that intersection
 * and collision routines can dispatch to the correct algorithm without
 * `instanceof` checks.
 */
export const enum CollisionType {
  Point,
  Line,
  Rectangle,
  Circle,
  Ellipse,
  Polygon,
  SceneNode,
}

/**
 * Contract for objects that participate in collision detection. Implemented by
 * all concrete shape classes as well as `SceneNode`.
 */
export interface Collidable {
  readonly collisionType: CollisionType;
  /**
   * Test whether this shape overlaps `target` using a fast boolean algorithm
   * (no penetration depth or normal computed). Prefer this over
   * {@link collidesWith} when only the yes/no result is needed.
   */
  intersectsWith(target: Collidable): boolean;
  /**
   * Compute a full {@link CollisionResponse} between this shape and `target`.
   * Returns `null` in two cases:
   * - the shapes do not overlap, **or**
   * - the specific shape-pair combination does not support response generation
   *   (for example `Line` against any shape, or `Ellipse` against a `Point`).
   *
   * Use {@link intersectsWith} for a universal boolean overlap check that works
   * across all supported shape pairs.
   */
  collidesWith(target: Collidable): CollisionResponse | null;
  /** Returns `true` if the point `(x, y)` is inside this shape. */
  contains(x: number, y: number): boolean;
  /**
   * Return the outward-facing edge normals used by the SAT solver. The array
   * should be cached and reused across calls.
   */
  getNormals(): Vector[];
  /**
   * Project this shape onto `axis` and write the scalar min/max into
   * `interval`. Used internally by the SAT solver.
   */
  project(axis: Vector, interval?: Interval): Interval;
}

/**
 * Result of a successful {@link Collidable.collidesWith} call. Contains
 * the two participating shapes, the penetration depth, containment flags,
 * and the minimum-translation vectors (normal + vector) needed to separate
 * them.
 */
export interface CollisionResponse {
  readonly shapeA: Collidable;
  readonly shapeB: Collidable;
  /** Penetration depth - the minimum distance to move the shapes apart. */
  readonly overlap: number;
  /** `true` when `shapeA` is fully contained within `shapeB`. */
  readonly shapeAinB: boolean;
  /** `true` when `shapeB` is fully contained within `shapeA`. */
  readonly shapeBinA: boolean;
  /**
   * Unit normal of the minimum-translation axis, pointing from `shapeA` (the
   * object `collidesWith` was called on) toward `shapeB` (the argument).
   * Swapping the operands negates it, except for ambiguous cases (coincident
   * centres, equal penetration on several axes) where the axis is a fixed
   * deterministic choice that does not depend on operand order.
   */
  readonly projectionN: Vector;
  /**
   * Minimum-translation vector: `projectionN` scaled by `overlap`. Adding it
   * to `shapeB`'s position, or subtracting it from `shapeA`'s, separates the
   * shapes. To push the caller out of the argument, subtract `projectionV`.
   *
   * The direction is uniform for every pair. Complete separation is
   * guaranteed, including under containment, for Rectangle/Rectangle,
   * Circle/Circle, Circle/Rectangle, Circle/Polygon and the convex SAT pairs
   * (Rectangle, Polygon, rotated nodes). Pairs involving an Ellipse
   * (Ellipse/Ellipse, Ellipse/Circle, Ellipse/Rectangle, Ellipse/Polygon) use
   * an approximate axis and depth: the translation reduces the overlap but may
   * leave a small residual penetration, so re-test after resolving if exact
   * contact matters.
   */
  readonly projectionV: Vector;
}
