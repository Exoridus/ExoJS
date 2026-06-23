import type { CircleLike } from './CircleLike';
import type { Rectangle } from './Rectangle';

/**
 * Result of a swept-collision query. The moving shape's reference point
 * is at `(x, y)` at impact, having travelled fraction `t` ∈ [0..1] of
 * the requested move (where 0 = no movement, 1 = full move). The
 * `(normalX, normalY)` vector is the contact normal pointing AWAY from
 * the target (suitable for sliding response: project the remaining
 * velocity onto the perpendicular).
 */
export interface SweptHit {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly normalX: number;
  readonly normalY: number;
}

// ---------------------------------------------------------------------------
// sweepRectangle — AABB vs AABB slab method
// ---------------------------------------------------------------------------

/**
 * Swept axis-aligned box vs. axis-aligned box.
 *
 * Uses the separating-axis slab method: for each axis we compute the entry
 * and exit times of the moving box's slab vs the static box's slab, then
 * combine.  `t` is the fraction of the requested move at which first contact
 * occurs (0 = already overlapping at start, 1 = just barely reaches).
 *
 * Already-overlapping case (tEntry < 0 overall): returns `t = 0` with the
 * normal of the deepest-penetration axis, allowing callers to handle the
 * "I'm already inside" situation without a separate discrete test.
 */
export function sweepRectangle(moving: Rectangle, deltaX: number, deltaY: number, target: Rectangle): SweptHit | null {
  const movMinX = moving.x;
  const movMaxX = moving.x + moving.width;
  const movMinY = moving.y;
  const movMaxY = moving.y + moving.height;

  const tarMinX = target.x;
  const tarMaxX = target.x + target.width;
  const tarMinY = target.y;
  const tarMaxY = target.y + target.height;

  // X axis
  let tEntryX = -Infinity;
  let tExitX = Infinity;

  if (deltaX > 0) {
    tEntryX = (tarMinX - movMaxX) / deltaX;
    tExitX = (tarMaxX - movMinX) / deltaX;
  } else if (deltaX < 0) {
    tEntryX = (tarMaxX - movMinX) / deltaX;
    tExitX = (tarMinX - movMaxX) / deltaX;
  } else if (movMaxX <= tarMinX || movMinX >= tarMaxX) {
    // No movement on X and no static overlap — can never collide
    return null;
  }

  // Y axis
  let tEntryY = -Infinity;
  let tExitY = Infinity;

  if (deltaY > 0) {
    tEntryY = (tarMinY - movMaxY) / deltaY;
    tExitY = (tarMaxY - movMinY) / deltaY;
  } else if (deltaY < 0) {
    tEntryY = (tarMaxY - movMinY) / deltaY;
    tExitY = (tarMinY - movMaxY) / deltaY;
  } else if (movMaxY <= tarMinY || movMinY >= tarMaxY) {
    // No movement on Y and no static overlap — can never collide
    return null;
  }

  const tEntry = Math.max(tEntryX, tEntryY);
  const tExit = Math.min(tExitX, tExitY);

  // No overlap window
  if (tEntry > tExit || tExit < 0 || tEntry > 1) {
    return null;
  }

  const t = Math.max(0, tEntry);
  const hitX = moving.x + deltaX * t;
  const hitY = moving.y + deltaY * t;

  // Normal is on the axis whose slab entry was latest.
  // Already-overlapping: use the deepest-penetration axis normal.
  let normalX = 0;
  let normalY = 0;

  if (tEntry <= 0) {
    // Already overlapping — pick the axis with least penetration
    const overlapX = Math.min(movMaxX - tarMinX, tarMaxX - movMinX);
    const overlapY = Math.min(movMaxY - tarMinY, tarMaxY - movMinY);

    if (overlapX < overlapY) {
      normalX = movMinX < tarMinX ? -1 : 1;
    } else {
      normalY = movMinY < tarMinY ? -1 : 1;
    }
  } else if (tEntryX > tEntryY) {
    // X axis had the latest entry
    normalX = deltaX > 0 ? -1 : 1;
  } else {
    // Y axis had the latest entry
    normalY = deltaY > 0 ? -1 : 1;
  }

  return { t, x: hitX, y: hitY, normalX, normalY };
}

// ---------------------------------------------------------------------------
// sweepCircleVsRectangle — full Minkowski rounded-rectangle formulation
// ---------------------------------------------------------------------------

/**
 * Swept circle vs. axis-aligned box using the exact Minkowski rounded-rectangle
 * boundary.
 *
 * The Minkowski sum of a circle (radius `r`) and a rectangle is a rounded
 * rectangle: four flat faces offset outward by `r`, connected by quarter-circle
 * arcs of radius `r` at each corner.  The circle centre is tested against each
 * boundary region separately:
 *
 * - **Flat face** — slab entry time (exact); only valid when the circle centre
 *   lands within the face's extent at impact (not a corner arc region).
 * - **Corner arc** — quadratic equation `|centre(t) − corner|² = r²` (exact).
 *
 * The earliest valid hit across all eight tests is returned. This eliminates
 * the corner over-collision produced by the simpler expanded-AABB approach.
 *
 * Already-overlapping case: returns `t = 0` with the normal of the
 * minimum-penetration axis.
 */
export function sweepCircleVsRectangle(moving: CircleLike, deltaX: number, deltaY: number, target: Rectangle): SweptHit | null {
  const r = moving.radius;
  const cx = moving.x;
  const cy = moving.y;

  const left = target.x;
  const right = target.x + target.width;
  const top = target.y;
  const bottom = target.y + target.height;

  // Already-overlapping: closest point on rect to circle centre
  const clampX = Math.max(left, Math.min(cx, right));
  const clampY = Math.max(top, Math.min(cy, bottom));
  const initDx = cx - clampX;
  const initDy = cy - clampY;

  if (initDx * initDx + initDy * initDy <= r * r) {
    const dist = Math.sqrt(initDx * initDx + initDy * initDy);

    if (dist > 0) {
      return { t: 0, x: cx, y: cy, normalX: initDx / dist, normalY: initDy / dist };
    }

    // Centre inside rect — push along axis with least penetration
    const exitLeft = cx - left;
    const exitRight = right - cx;
    const exitTop = cy - top;
    const exitBottom = bottom - cy;

    if (Math.min(exitLeft, exitRight) <= Math.min(exitTop, exitBottom)) {
      return { t: 0, x: cx, y: cy, normalX: exitLeft < exitRight ? -1 : 1, normalY: 0 };
    }

    return { t: 0, x: cx, y: cy, normalX: 0, normalY: exitTop < exitBottom ? -1 : 1 };
  }

  if (deltaX === 0 && deltaY === 0) return null;

  let bestT = Infinity;
  let bestNx = 0;
  let bestNy = 0;

  const tryHit = (t: number, nx: number, ny: number): void => {
    if (t >= 0 && t <= 1 && t < bestT) {
      bestT = t;
      bestNx = nx;
      bestNy = ny;
    }
  };

  // Flat face tests — circle centre must reach the expanded face plane
  // and land within the face's extent (not a corner arc region).
  if (deltaX !== 0) {
    const tL = (left - r - cx) / deltaX;
    if (tL >= 0 && tL <= 1) {
      const hy = cy + deltaY * tL;
      if (hy >= top && hy <= bottom) tryHit(tL, -1, 0);
    }
    const tR = (right + r - cx) / deltaX;
    if (tR >= 0 && tR <= 1) {
      const hy = cy + deltaY * tR;
      if (hy >= top && hy <= bottom) tryHit(tR, 1, 0);
    }
  }

  if (deltaY !== 0) {
    const tT = (top - r - cy) / deltaY;
    if (tT >= 0 && tT <= 1) {
      const hx = cx + deltaX * tT;
      if (hx >= left && hx <= right) tryHit(tT, 0, -1);
    }
    const tB = (bottom + r - cy) / deltaY;
    if (tB >= 0 && tB <= 1) {
      const hx = cx + deltaX * tB;
      if (hx >= left && hx <= right) tryHit(tB, 0, 1);
    }
  }

  // Corner arc tests — solve |(cx + dx·t, cy + dy·t) − corner|² = r²
  // for each of the four rect corners (quadratic in t).
  const a = deltaX * deltaX + deltaY * deltaY;
  const cornerXs = [left, right, left, right];
  const cornerYs = [top, top, bottom, bottom];

  for (let i = 0; i < 4; i++) {
    // cornerXs/cornerYs are 4-element arrays; i in [0, 3].
    const corX = cornerXs[i]!;
    const corY = cornerYs[i]!;
    const cdx = cx - corX;
    const cdy = cy - corY;
    const b = 2 * (cdx * deltaX + cdy * deltaY);
    const c = cdx * cdx + cdy * cdy - r * r;
    const disc = b * b - 4 * a * c;

    if (disc < 0) continue;

    const t = (-b - Math.sqrt(disc)) / (2 * a);

    if (t < 0 || t > 1) continue;

    const hitX = cx + deltaX * t;
    const hitY = cy + deltaY * t;

    tryHit(t, (hitX - corX) / r, (hitY - corY) / r);
  }

  if (bestT > 1) return null;

  return { t: bestT, x: cx + deltaX * bestT, y: cy + deltaY * bestT, normalX: bestNx, normalY: bestNy };
}

// ---------------------------------------------------------------------------
// sweepCircleVsCircle — quadratic equation
// ---------------------------------------------------------------------------

/**
 * Swept circle vs. stationary circle.
 *
 * Solves `|(moving.centre + delta*t) − target.centre|² = (r1+r2)²` for t,
 * yielding a quadratic.  Returns the smaller root if it is in [0, 1].
 *
 * Already-overlapping case: returns `{ t: 0 }` with the normal pointing from
 * target → moving (or an arbitrary normal if both centres coincide).
 */
export function sweepCircleVsCircle(moving: CircleLike, deltaX: number, deltaY: number, target: CircleLike): SweptHit | null {
  const dx = moving.x - target.x;
  const dy = moving.y - target.y;
  const r = moving.radius + target.radius;

  const a = deltaX * deltaX + deltaY * deltaY;
  const b = 2 * (dx * deltaX + dy * deltaY);
  const c = dx * dx + dy * dy - r * r;

  // Already overlapping at start
  if (c <= 0) {
    const dist = Math.sqrt(dx * dx + dy * dy);
    const normalX = dist > 0 ? dx / dist : 1;
    const normalY = dist > 0 ? dy / dist : 0;

    return { t: 0, x: moving.x, y: moving.y, normalX, normalY };
  }

  // No movement
  if (a === 0) {
    return null;
  }

  const disc = b * b - 4 * a * c;

  if (disc < 0) {
    return null;
  }

  const t = (-b - Math.sqrt(disc)) / (2 * a);

  if (t < 0 || t > 1) {
    return null;
  }

  const hitX = moving.x + deltaX * t;
  const hitY = moving.y + deltaY * t;

  // Normal points from target centre → hit circle centre
  const normalX = (hitX - target.x) / r;
  const normalY = (hitY - target.y) / r;

  return { t, x: hitX, y: hitY, normalX, normalY };
}

// ---------------------------------------------------------------------------
// Batch helpers — sweep a shape against multiple targets
// ---------------------------------------------------------------------------

/**
 * Returns the earliest `SweptHit` against an array of rectangle targets, or
 * `null` if none are hit.
 *
 * Optimisation: before testing each target individually the swept AABB of the
 * moving rectangle is computed once; targets whose AABB does not overlap the
 * swept AABB are skipped.
 */
export function sweepRectangleAgainst(moving: Rectangle, deltaX: number, deltaY: number, targets: readonly Rectangle[]): SweptHit | null {
  if (targets.length === 0) {
    return null;
  }

  // Swept AABB of the moving rectangle (broad-phase skip)
  const sweptMinX = Math.min(moving.x, moving.x + deltaX);
  const sweptMaxX = Math.max(moving.x + moving.width, moving.x + moving.width + deltaX);
  const sweptMinY = Math.min(moving.y, moving.y + deltaY);
  const sweptMaxY = Math.max(moving.y + moving.height, moving.y + moving.height + deltaY);

  let earliest: SweptHit | null = null;

  for (const target of targets) {
    // Broad-phase: skip if swept AABB doesn't overlap target AABB
    if (sweptMaxX <= target.x || sweptMinX >= target.x + target.width || sweptMaxY <= target.y || sweptMinY >= target.y + target.height) {
      continue;
    }

    const hit = sweepRectangle(moving, deltaX, deltaY, target);

    if (hit !== null && (earliest === null || hit.t < earliest.t)) {
      earliest = hit;
    }
  }

  return earliest;
}

/**
 * Returns the earliest `SweptHit` against an array of circle targets, or
 * `null` if none are hit.
 *
 * Optimisation: the swept AABB of the moving circle is computed once and used
 * to skip targets that cannot possibly be reached.
 */
export function sweepCircleAgainst(moving: CircleLike, deltaX: number, deltaY: number, targets: readonly CircleLike[]): SweptHit | null {
  if (targets.length === 0) {
    return null;
  }

  // Swept AABB of the moving circle
  const sweptMinX = Math.min(moving.x, moving.x + deltaX) - moving.radius;
  const sweptMaxX = Math.max(moving.x, moving.x + deltaX) + moving.radius;
  const sweptMinY = Math.min(moving.y, moving.y + deltaY) - moving.radius;
  const sweptMaxY = Math.max(moving.y, moving.y + deltaY) + moving.radius;

  let earliest: SweptHit | null = null;

  for (const target of targets) {
    // Broad-phase: skip if swept AABB doesn't overlap target's AABB
    if (
      sweptMaxX <= target.x - target.radius ||
      sweptMinX >= target.x + target.radius ||
      sweptMaxY <= target.y - target.radius ||
      sweptMinY >= target.y + target.radius
    ) {
      continue;
    }

    const hit = sweepCircleVsCircle(moving, deltaX, deltaY, target);

    if (hit !== null && (earliest === null || hit.t < earliest.t)) {
      earliest = hit;
    }
  }

  return earliest;
}

// ---------------------------------------------------------------------------
// substepSweep — generic fallback iterator
// ---------------------------------------------------------------------------

/**
 * Generator that yields evenly-spaced position snapshots along a movement
 * vector so the caller can run their own discrete intersection check at each
 * step.  Useful for arbitrary shape pairs that lack a closed-form swept test.
 *
 * `maxStepSize` controls the step granularity — smaller values produce more
 * accurate detection but more iterations.  Use the smallest dimension of the
 * smaller collider as a sensible default.
 *
 * Always yields at least 2 snapshots (t=0 and t=1), even for zero-length
 * deltas.
 */
export function* substepSweep(
  fromX: number,
  fromY: number,
  deltaX: number,
  deltaY: number,
  maxStepSize: number,
): IterableIterator<{ x: number; y: number; t: number }> {
  const length = Math.hypot(deltaX, deltaY);
  const stepCount = Math.max(1, Math.ceil(length / maxStepSize));

  for (let i = 0; i <= stepCount; i++) {
    const t = i / stepCount;

    yield { x: fromX + deltaX * t, y: fromY + deltaY * t, t };
  }
}

/**
 * Swept (continuous) collision queries, grouped as a namespace so the public
 * API carries no loose `sweep*` functions. The underlying functions stay module
 * exports for internal use; only this facade is in the public barrel.
 */
export const Sweep = {
  rectangle: sweepRectangle,
  circleVsRectangle: sweepCircleVsRectangle,
  circleVsCircle: sweepCircleVsCircle,
  rectangleAgainst: sweepRectangleAgainst,
  circleAgainst: sweepCircleAgainst,
  substep: substepSweep,
} as const;
