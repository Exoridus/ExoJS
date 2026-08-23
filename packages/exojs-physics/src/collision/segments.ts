import type { PointLike } from '@codexo/exojs';

// Closest-feature primitives shared by every rounded shape. A capsule is a
// segment with a radius and a chain edge is a segment without one, so all of
// them reduce to these two questions - point-to-segment and segment-to-segment.
// Kept as free functions taking output sinks, like the transform helpers, so the
// narrow phase, the queries and the sweep can all use them allocation-free.

/** Below this squared length a segment is treated as a single point. */
const degenerateLengthSquared = 1e-12;

/**
 * Closest point on the segment `a → b` to `(px, py)`, written into `out`.
 * Returns the parameter along the segment, clamped to `[0, 1]`.
 */
export const closestPointOnSegment = (px: number, py: number, ax: number, ay: number, bx: number, by: number, out: PointLike): number => {
  const ex = bx - ax;
  const ey = by - ay;
  const lengthSquared = ex * ex + ey * ey;

  if (lengthSquared <= degenerateLengthSquared) {
    out.x = ax;
    out.y = ay;

    return 0;
  }

  const t = clamp01(((px - ax) * ex + (py - ay) * ey) / lengthSquared);

  out.x = ax + ex * t;
  out.y = ay + ey * t;

  return t;
};

/** Squared distance from `(px, py)` to the segment `a → b`. */
export const pointSegmentDistanceSquared = (px: number, py: number, ax: number, ay: number, bx: number, by: number, scratch: PointLike): number => {
  closestPointOnSegment(px, py, ax, ay, bx, by, scratch);

  const dx = px - scratch.x;
  const dy = py - scratch.y;

  return dx * dx + dy * dy;
};

/**
 * Closest points between the segments `a0 → a1` and `b0 → b1`, written into
 * `outA` and `outB`. Returns the squared distance between them.
 *
 * Parallel and overlapping segments have a whole interval of closest pairs; this
 * returns one of them, chosen deterministically. Callers that need a stable
 * two-point manifold for such a case must derive it from the face geometry, not
 * from this single pair.
 */
export const segmentSegmentDistanceSquared = (
  a0x: number,
  a0y: number,
  a1x: number,
  a1y: number,
  b0x: number,
  b0y: number,
  b1x: number,
  b1y: number,
  outA: PointLike,
  outB: PointLike,
): number => {
  const dax = a1x - a0x;
  const day = a1y - a0y;
  const dbx = b1x - b0x;
  const dby = b1y - b0y;
  const rx = a0x - b0x;
  const ry = a0y - b0y;
  const aa = dax * dax + day * day;
  const bb = dbx * dbx + dby * dby;
  const f = dbx * rx + dby * ry;

  let s: number;
  let t: number;

  if (aa <= degenerateLengthSquared && bb <= degenerateLengthSquared) {
    outA.x = a0x;
    outA.y = a0y;
    outB.x = b0x;
    outB.y = b0y;

    return rx * rx + ry * ry;
  }

  if (aa <= degenerateLengthSquared) {
    s = 0;
    t = clamp01(f / bb);
  } else {
    const c = dax * rx + day * ry;

    if (bb <= degenerateLengthSquared) {
      t = 0;
      s = clamp01(-c / aa);
    } else {
      const b = dax * dbx + day * dby;
      const denom = aa * bb - b * b;

      // Parallel segments leave `denom` at zero; pinning s = 0 picks the pair at
      // a0, which is deterministic and as good as any other on the interval.
      s = denom > 0 ? clamp01((b * f - c * bb) / denom) : 0;
      t = (b * s + f) / bb;

      if (t < 0) {
        t = 0;
        s = clamp01(-c / aa);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / aa);
      }
    }
  }

  outA.x = a0x + dax * s;
  outA.y = a0y + day * s;
  outB.x = b0x + dbx * t;
  outB.y = b0y + dby * t;

  const dx = outA.x - outB.x;
  const dy = outA.y - outB.y;

  return dx * dx + dy * dy;
};

const clamp01 = (value: number): number => {
  if (value < 0) {
    return 0;
  }

  return value > 1 ? 1 : value;
};
