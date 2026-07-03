import type { Vector } from './Vector';

/** τ = 2π, the full-circle radian constant. */
export const TAU = Math.PI * 2;

/** Multiply a degree value by this constant to convert to radians. */
export const RADIANS_PER_DEGREE = Math.PI / 180;

/** Multiply a radian value by this constant to convert to degrees. */
export const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * Classification of a point relative to a directed edge, used by the SAT
 * circle-vs-polygon solver to identify which feature (vertex or edge face) the
 * circle centre is closest to.
 */
export const enum VoronoiRegion {
  left = -1,
  middle = 0,
  right = 1,
}

/**
 * Normalise a rotation in degrees to the range `[0, 360)`. Negative values
 * are wrapped into the positive range.
 */
export const trimRotation = (degrees: number): number => {
  const rotation = degrees % 360;

  return rotation < 0 ? rotation + 360 : rotation;
};

/** Convert `degree` to radians. */
export const degreesToRadians = (degree: number): number => degree * RADIANS_PER_DEGREE;

/** Convert `radian` to degrees. */
export const radiansToDegrees = (radian: number): number => radian * DEGREES_PER_RADIAN;

/** Clamp `value` to the closed interval `[min, max]`. */
export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Return the sign of `value` as `-1`, `0`, or `1`. Unlike `Math.sign`,
 * returns `0` only for strict zero (not `-0`).
 */
export const sign = (value: number): number => value && (value < 0 ? -1 : 1);

/** Linear interpolation between `startValue` and `endValue` at normalized `ratio` ∈ [0, 1]. */
export const lerp = (startValue: number, endValue: number, ratio: number): number => (1 - ratio) * startValue + ratio * endValue;

/** Return `true` when `value` is a non-zero power of two. */
export const isPowerOfTwo = (value: number): boolean => value !== 0 && (value & (value - 1)) === 0;

/**
 * Return `true` when `value` lies within `[min, max]` (inclusive, regardless
 * of whether `min < max`).
 */
export const inRange = (value: number, min: number, max: number): boolean => value >= Math.min(min, max) && value <= Math.max(min, max);

/** Euclidean distance between `(x1, y1)` and `(x2, y2)`. */
export const getDistance = (x1: number, y1: number, x2: number, y2: number): number => {
  const offsetX = x1 - x2;
  const offsetY = y1 - y2;

  return Math.sqrt(offsetX * offsetX + offsetY * offsetY);
};

/**
 * Sample a cubic Bézier curve at `len` evenly-spaced `t` values and append
 * the resulting `(x, y)` pairs to `path`. The starting point `(fromX, fromY)`
 * is always pushed first. Returns `path` for chaining.
 */
export const bezierCurveTo = (
  fromX: number,
  fromY: number,
  cpX1: number,
  cpY1: number,
  cpX2: number,
  cpY2: number,
  toX: number,
  toY: number,
  path: number[] = [],
  len = 20,
): number[] => {
  path.push(fromX, fromY);

  for (let i = 1; i <= len; i++) {
    const j = i / len;

    const dt1 = 1 - j;
    const dt2 = dt1 * dt1;
    const dt3 = dt2 * dt1;

    const t2 = j * j;
    const t3 = t2 * j;

    path.push(dt3 * fromX + 3 * dt2 * j * cpX1 + 3 * dt1 * t2 * cpX2 + t3 * toX, dt3 * fromY + 3 * dt2 * j * cpY1 + 3 * dt1 * t2 * cpY2 + t3 * toY);
  }

  return path;
};

/**
 * Sample a quadratic Bézier curve at `len + 1` evenly-spaced `t` values
 * (including `t = 0` and `t = 1`) and append the resulting `(x, y)` pairs to
 * `path`. Returns `path` for chaining.
 */
export const quadraticCurveTo = (fromX: number, fromY: number, cpX: number, cpY: number, toX: number, toY: number, path: number[] = [], len = 20): number[] => {
  for (let i = 0; i <= len; i++) {
    const ratio = i / len;

    path.push(lerp(lerp(fromX, cpX, ratio), lerp(cpX, toX, ratio), ratio), lerp(lerp(fromY, cpY, ratio), lerp(cpY, toY, ratio), ratio));
  }

  return path;
};

/**
 * Classify `point` relative to the directed `line` using the dot product.
 * Returns `left` when the point is before the line start, `right` when it is
 * past the line end, and `middle` when it projects onto the segment.
 */
export const getVoronoiRegion = (line: Vector, point: Vector): VoronoiRegion => {
  const product = point.dot(line.x, line.y);

  if (product < 0) {
    return VoronoiRegion.left;
  } else if (product > line.lengthSq) {
    return VoronoiRegion.right;
  } else {
    return VoronoiRegion.middle;
  }
};

/**
 * Angle + curve/geometry math helpers, grouped as a namespace. The common
 * scalar utilities (`clamp`, `lerp`, `sign`, `inRange`, `isPowerOfTwo`, `TAU`)
 * are free top-level exports instead — see `src/math/index.ts`. This facade
 * groups the less-common angle/curve/geometry helpers that don't warrant
 * their own top-level export.
 */
export const MathUtils = {
  distance: getDistance,
  trimRotation,
  degreesToRadians,
  radiansToDegrees,
  bezierCurveTo,
  quadraticCurveTo,
} as const;
