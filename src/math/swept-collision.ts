import { Rectangle } from './Rectangle';
import type { CircleLike } from './CircleLike';

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
export function sweepRectangle(
    moving: Rectangle,
    deltaX: number, deltaY: number,
    target: Rectangle,
): SweptHit | null {
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
    let tExitX  = Infinity;

    if (deltaX > 0) {
        tEntryX = (tarMinX - movMaxX) / deltaX;
        tExitX  = (tarMaxX - movMinX) / deltaX;
    } else if (deltaX < 0) {
        tEntryX = (tarMaxX - movMinX) / deltaX;
        tExitX  = (tarMinX - movMaxX) / deltaX;
    } else if (movMaxX <= tarMinX || movMinX >= tarMaxX) {
        // No movement on X and no static overlap — can never collide
        return null;
    }

    // Y axis
    let tEntryY = -Infinity;
    let tExitY  = Infinity;

    if (deltaY > 0) {
        tEntryY = (tarMinY - movMaxY) / deltaY;
        tExitY  = (tarMaxY - movMinY) / deltaY;
    } else if (deltaY < 0) {
        tEntryY = (tarMaxY - movMinY) / deltaY;
        tExitY  = (tarMinY - movMaxY) / deltaY;
    } else if (movMaxY <= tarMinY || movMinY >= tarMaxY) {
        // No movement on Y and no static overlap — can never collide
        return null;
    }

    const tEntry = Math.max(tEntryX, tEntryY);
    const tExit  = Math.min(tExitX,  tExitY);

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
// sweepCircleVsRectangle — expanded-AABB simple fallback (V1)
// ---------------------------------------------------------------------------

/**
 * Swept circle vs. axis-aligned box.
 *
 * **V1 implementation** uses the simple Minkowski expansion fallback:
 * the target rectangle is expanded by `circle.radius` on all sides, then
 * `sweepRectangle` is run treating the circle centre as a zero-sized moving
 * box.  This over-collides at rectangle corners (the circle collides with the
 * expanded-rect's flat face when geometrically it should curve around the
 * corner), producing slightly early hits in corner-quadrant trajectories —
 * a known and acceptable accuracy trade-off for V1.
 *
 * TODO (V2): Replace with the full Minkowski rounded-rectangle formulation
 * that handles the four corner quadrants with per-corner circle-vs-circle
 * sub-tests.
 */
export function sweepCircleVsRectangle(
    moving: CircleLike,
    deltaX: number, deltaY: number,
    target: Rectangle,
): SweptHit | null {
    const r = moving.radius;

    // Expanded target: grow each side by the circle radius
    const expanded = new Rectangle(
        target.x - r,
        target.y - r,
        target.width  + r * 2,
        target.height + r * 2,
    );

    // Treat the circle centre as a zero-sized moving box
    const centreBox = new Rectangle(moving.x, moving.y, 0, 0);

    return sweepRectangle(centreBox, deltaX, deltaY, expanded);
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
export function sweepCircleVsCircle(
    moving: CircleLike,
    deltaX: number, deltaY: number,
    target: CircleLike,
): SweptHit | null {
    const dx = moving.x - target.x;
    const dy = moving.y - target.y;
    const r  = moving.radius + target.radius;

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
export function sweepRectangleAgainst(
    moving: Rectangle,
    deltaX: number, deltaY: number,
    targets: ReadonlyArray<Rectangle>,
): SweptHit | null {
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
        if (
            sweptMaxX <= target.x
            || sweptMinX >= target.x + target.width
            || sweptMaxY <= target.y
            || sweptMinY >= target.y + target.height
        ) {
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
export function sweepCircleAgainst(
    moving: CircleLike,
    deltaX: number, deltaY: number,
    targets: ReadonlyArray<CircleLike>,
): SweptHit | null {
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
            sweptMaxX <= target.x - target.radius
            || sweptMinX >= target.x + target.radius
            || sweptMaxY <= target.y - target.radius
            || sweptMinY >= target.y + target.radius
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
    fromX: number, fromY: number,
    deltaX: number, deltaY: number,
    maxStepSize: number,
): IterableIterator<{ x: number; y: number; t: number; }> {
    const length = Math.hypot(deltaX, deltaY);
    const stepCount = Math.max(1, Math.ceil(length / maxStepSize));

    for (let i = 0; i <= stepCount; i++) {
        const t = i / stepCount;

        yield { x: fromX + deltaX * t, y: fromY + deltaY * t, t };
    }
}
