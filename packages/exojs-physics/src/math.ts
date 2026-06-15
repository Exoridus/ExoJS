// Internal rigid-transform and angle helpers. Physics stores rotations as a
// precomputed `sin`/`cos` pair so the hot collision paths never call the
// trigonometric functions per vertex. `Mutable2D` is a tiny `{ x, y }` sink to
// keep the rotate/transform helpers allocation-free at their call sites.

/** A mutable two-component output sink used to avoid per-call allocation. */
export interface Mutable2D {
  x: number;
  y: number;
}

/** A rigid 2D transform: translation plus the precomputed sin/cos of `angle`. */
export interface Transform {
  x: number;
  y: number;
  /** Rotation in radians. */
  angle: number;
  sin: number;
  cos: number;
}

/** Create a transform from a position and angle (radians). */
export const createTransform = (x = 0, y = 0, angle = 0): Transform => ({
  x,
  y,
  angle,
  sin: Math.sin(angle),
  cos: Math.cos(angle),
});

/** Set a transform in place, refreshing sin/cos only when the angle changes. */
export const setTransform = (transform: Transform, x: number, y: number, angle: number): Transform => {
  transform.x = x;
  transform.y = y;

  if (transform.angle !== angle) {
    transform.angle = angle;
    transform.sin = Math.sin(angle);
    transform.cos = Math.cos(angle);
  }

  return transform;
};

/** Rotate and translate a local point by `transform`, writing into `out`. */
export const applyTransform = (transform: Transform, x: number, y: number, out: Mutable2D): Mutable2D => {
  out.x = transform.cos * x - transform.sin * y + transform.x;
  out.y = transform.sin * x + transform.cos * y + transform.y;

  return out;
};

/** Rotate a local direction by `transform` (no translation), writing into `out`. */
export const applyRotation = (transform: Transform, x: number, y: number, out: Mutable2D): Mutable2D => {
  out.x = transform.cos * x - transform.sin * y;
  out.y = transform.sin * x + transform.cos * y;

  return out;
};

/** Map a world point into `transform`'s local frame, writing into `out`. */
export const applyInverseTransform = (transform: Transform, x: number, y: number, out: Mutable2D): Mutable2D => {
  const dx = x - transform.x;
  const dy = y - transform.y;

  out.x = transform.cos * dx + transform.sin * dy;
  out.y = -transform.sin * dx + transform.cos * dy;

  return out;
};

/** Map a world direction into `transform`'s local frame, writing into `out`. */
export const applyInverseRotation = (transform: Transform, x: number, y: number, out: Mutable2D): Mutable2D => {
  out.x = transform.cos * x + transform.sin * y;
  out.y = -transform.sin * x + transform.cos * y;

  return out;
};

/**
 * Compose `world = body ∘ local` into `out`. The local transform is expressed
 * in the body frame (a collider's offset + local rotation); the result is the
 * collider's world transform.
 */
export const composeTransforms = (body: Transform, local: Transform, out: Transform): Transform => {
  const x = body.cos * local.x - body.sin * local.y + body.x;
  const y = body.sin * local.x + body.cos * local.y + body.y;

  return setTransform(out, x, y, body.angle + local.angle);
};
