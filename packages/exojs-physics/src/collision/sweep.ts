import type { Mutable2D } from '../math';
import type { AnyShape } from '../shapes/AnyShape';
import { CircleShape } from '../shapes/CircleShape';
import type { CollisionProxy } from './CollisionProxy';
import { testOverlap } from './narrowphase';

/**
 * First time of impact of a translation-only shape cast, written by
 * {@link sweepProxies} (allocation-free: the caller owns the struct).
 */
export interface SweepHit {
  /** Fraction of the motion at first contact, in `(0, 1]`. */
  t: number;
  /** Unit surface normal on the target at the hit, pointing back toward the moving shape (opposing the motion). */
  normalX: number;
  /** See {@link SweepHit.normalX}. */
  normalY: number;
}

const eps = 1e-9;

// Module-local scratch circle proxy used for the start-overlap pre-check of the
// circle↔polygon sweeps (it borrows the real circle's shape, so no per-call
// allocation). Like the narrow-phase clip scratch, the sweep is single-threaded
// and non-reentrant — the world's CCD pass calls `sweepProxies` strictly
// sequentially — so module-global scratch is safe.
const _circleStart: Mutable2D = { x: 0, y: 0 };
const _circleProxy: { shape: AnyShape; worldCenter: Mutable2D; worldVertices: number[]; worldNormals: number[] } = {
  shape: new CircleShape(1),
  worldCenter: _circleStart,
  worldVertices: [],
  worldNormals: [],
};

/**
 * Translation-only shape cast of `moving` against a static `target`: `moving`
 * is given at its **end-of-motion** pose (its cached world geometry) and is
 * swept from `pose − (dx, dy)` to `pose`. Rotation over the motion is not swept
 * — the moving shape keeps its end orientation for the whole cast, matching the
 * bullet CCD model (the step's rotation is applied before the sweep).
 *
 * Returns `true` with the first time of impact and the target-surface normal
 * written into `out`. Pairs already overlapping (or exactly touching) at the
 * start of the motion return `false` — they cannot tunnel within this motion
 * and the discrete solver owns them. Allocation-free.
 */
export const sweepProxies = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  if (moving.shape.type === 'circle') {
    return target.shape.type === 'circle' ? sweepCircleCircle(moving, dx, dy, target, out) : sweepCirclePolygon(moving, dx, dy, target, out);
  }

  return target.shape.type === 'circle' ? sweepPolygonCircle(moving, dx, dy, target, out) : sweepPolygonPolygon(moving, dx, dy, target, out);
};

// Only called after the dispatch above has matched the shape kind; the fallback
// is unreachable but keeps the helper cast-free.
const radiusOf = (proxy: CollisionProxy): number => (proxy.shape.type === 'circle' ? proxy.shape.radius : 0);
const countOf = (proxy: CollisionProxy): number => (proxy.shape.type === 'polygon' ? proxy.shape.count : 0);

/** Moving circle vs static circle: a ray against the Minkowski-summed circle. */
const sweepCircleCircle = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  const rsum = radiusOf(moving) + radiusOf(target);
  const cx = target.worldCenter.x;
  const cy = target.worldCenter.y;
  // Start-of-motion centre.
  const ox = moving.worldCenter.x - dx;
  const oy = moving.worldCenter.y - dy;
  const mx = ox - cx;
  const my = oy - cy;

  // Already overlapping/touching at the start: the discrete solver owns it.
  if (mx * mx + my * my <= rsum * rsum) {
    return false;
  }

  const a = dx * dx + dy * dy;
  const b = mx * dx + my * dy;
  const c = mx * mx + my * my - rsum * rsum;

  if (b >= 0) {
    // Moving away (or tangential) — no entry within the motion.
    return false;
  }

  const disc = b * b - a * c;

  if (disc < 0) {
    return false;
  }

  const t = (-b - Math.sqrt(disc)) / a;

  if (t < 0 || t > 1) {
    return false;
  }

  out.t = t;
  out.normalX = (ox + dx * t - cx) / rsum;
  out.normalY = (oy + dy * t - cy) / rsum;

  return true;
};

/** Moving circle vs static polygon: a ray against the radius-inflated (rounded) polygon. */
const sweepCirclePolygon = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  const r = radiusOf(moving);
  const ox = moving.worldCenter.x - dx;
  const oy = moving.worldCenter.y - dy;

  // Already overlapping/touching at the start: the discrete solver owns it.
  _circleProxy.shape = moving.shape;
  _circleStart.x = ox;
  _circleStart.y = oy;

  if (testOverlap(_circleProxy, target)) {
    return false;
  }

  return castCircleAtPolygon(ox, oy, dx, dy, r, target, out);
};

/**
 * Moving polygon vs static circle, solved in the polygon's frame: the circle
 * sweeps backward (`−d`) from a start displaced by `+d`, against the polygon's
 * end-pose geometry — the same relative motion, so the same time of impact.
 */
const sweepPolygonCircle = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  const r = radiusOf(target);
  const ox = target.worldCenter.x + dx;
  const oy = target.worldCenter.y + dy;

  // Already overlapping/touching at the start: the discrete solver owns it.
  _circleProxy.shape = target.shape;
  _circleStart.x = ox;
  _circleStart.y = oy;

  if (testOverlap(_circleProxy, moving)) {
    return false;
  }

  if (!castCircleAtPolygon(ox, oy, -dx, -dy, r, moving, out)) {
    return false;
  }

  // The cast reports the normal on the polygon (the bullet) toward the circle
  // (the obstacle); the caller wants the obstacle-surface normal, so flip it.
  out.normalX = -out.normalX;
  out.normalY = -out.normalY;

  return true;
};

/**
 * Cast the point `(ox, oy)` along `(dx, dy)` (t ∈ [0, 1]) against `polygon`
 * inflated by `r`: offset faces plus vertex arcs — the exact swept-circle
 * geometry. Writes the earliest hit into `out`; the normal points from the
 * polygon surface toward the circle.
 */
const castCircleAtPolygon = (ox: number, oy: number, dx: number, dy: number, r: number, polygon: CollisionProxy, out: SweepHit): boolean => {
  // Both passes only improve `out` when they beat the current `out.t`.
  out.t = Infinity;
  castAtOffsetFaces(ox, oy, dx, dy, r, polygon, out);
  castAtVertexArcs(ox, oy, dx, dy, r, polygon, out);

  return out.t !== Infinity;
};

/** Offset-face pass of {@link castCircleAtPolygon}: the face plane pushed out by `r`, hits valid within the edge span. */
const castAtOffsetFaces = (ox: number, oy: number, dx: number, dy: number, r: number, polygon: CollisionProxy, out: SweepHit): void => {
  const verts = polygon.worldVertices;
  const normals = polygon.worldNormals;
  const count = countOf(polygon);

  for (let i = 0; i < count; i++) {
    // Loop indices are provably in-bounds (0..count-1); the `!` is zero-cost.
    const nx = normals[i * 2]!;
    const ny = normals[i * 2 + 1]!;
    const denom = nx * dx + ny * dy;

    if (denom >= 0) {
      continue; // Not entering through this face.
    }

    const v1x = verts[i * 2]!;
    const v1y = verts[i * 2 + 1]!;
    const t = (nx * (v1x - ox) + ny * (v1y - oy) + r) / denom;

    if (t < 0 || t > 1 || t >= out.t) {
      continue;
    }

    const j = (i + 1) % count;
    const v2x = verts[j * 2]!;
    const v2y = verts[j * 2 + 1]!;
    const ex = v2x - v1x;
    const ey = v2y - v1y;
    const px = ox + dx * t;
    const py = oy + dy * t;
    const u = (px - v1x) * ex + (py - v1y) * ey;

    if (u < 0 || u > ex * ex + ey * ey) {
      continue; // Outside the edge span — the vertex arcs own the corners.
    }

    out.t = t;
    out.normalX = nx;
    out.normalY = ny;
  }
};

/** Vertex-arc pass of {@link castCircleAtPolygon}: a ray against the circle of radius `r` around each vertex. */
const castAtVertexArcs = (ox: number, oy: number, dx: number, dy: number, r: number, polygon: CollisionProxy, out: SweepHit): void => {
  const verts = polygon.worldVertices;
  const count = countOf(polygon);
  const a = dx * dx + dy * dy;

  for (let i = 0; i < count; i++) {
    const vx = verts[i * 2]!;
    const vy = verts[i * 2 + 1]!;
    const mx = ox - vx;
    const my = oy - vy;
    const b = mx * dx + my * dy;

    if (b >= 0) {
      continue; // Moving away from this vertex.
    }

    const c = mx * mx + my * my - r * r;

    if (c < 0) {
      continue; // Start inside the arc — covered by the start-overlap pre-check.
    }

    const disc = b * b - a * c;

    if (disc < 0) {
      continue;
    }

    const t = (-b - Math.sqrt(disc)) / a;

    if (t < 0 || t > 1 || t >= out.t) {
      continue;
    }

    out.t = t;
    out.normalX = (ox + dx * t - vx) / r;
    out.normalY = (oy + dy * t - vy) / r;
  }
};

// Swept-SAT accumulator shared by sweepPolygonPolygon's two axis passes.
// Module-local scratch under the same single-threaded/non-reentrant contract
// as the rest of this file.
interface SweptSatState {
  tEnter: number;
  tLeave: number;
  normalX: number;
  normalY: number;
}

const _satState: SweptSatState = { tEnter: 0, tLeave: 0, normalX: 0, normalY: 0 };

/**
 * Moving convex polygon vs static convex polygon via swept SAT: for every
 * candidate axis (both polygons' face normals) intersect the moving projection
 * interval with the static one over t ∈ [0, 1]; the latest entry over all axes
 * is the time of impact, and its axis (oriented against the motion) the normal.
 * Exact for linear motion of convex shapes.
 */
const sweepPolygonPolygon = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  const state = _satState;

  state.tEnter = -Infinity;
  state.tLeave = Infinity;

  // Two passes: axes from the target, then from the moving polygon. Either
  // pass may prove the pair never meets within the motion.
  if (!sweptSatAxes(target, moving, dx, dy, target, state) || !sweptSatAxes(moving, moving, dx, dy, target, state)) {
    return false;
  }

  // tEnter ≤ 0 means every axis already overlapped at the start of the motion
  // (i.e. the shapes were overlapping/touching): the discrete solver owns it.
  if (state.tEnter <= 0 || state.tEnter > 1) {
    return false;
  }

  out.t = state.tEnter;
  out.normalX = state.normalX;
  out.normalY = state.normalY;

  return true;
};

/**
 * One swept-SAT axis pass over `axisOwner`'s face normals, tightening the
 * `state` entry/exit window of `moving` (translated by `(dx, dy)`, given at its
 * end pose) against the static `target`. Returns `false` as soon as an axis
 * proves the shapes never meet within the motion.
 */
const sweptSatAxes = (
  axisOwner: CollisionProxy,
  moving: CollisionProxy,
  dx: number,
  dy: number,
  target: CollisionProxy,
  state: SweptSatState,
): boolean => {
  const axes = axisOwner.worldNormals;
  const axisCount = countOf(axisOwner);
  const mv = moving.worldVertices;
  const mc = countOf(moving);
  const tv = target.worldVertices;
  const tc = countOf(target);

  for (let i = 0; i < axisCount; i++) {
    // Loop indices are provably in-bounds; the `!` is zero-cost.
    const nx = axes[i * 2]!;
    const ny = axes[i * 2 + 1]!;
    const dn = nx * dx + ny * dy;

    // Project the moving polygon (end pose), then shift to its start pose.
    let minA = Infinity;
    let maxA = -Infinity;

    for (let k = 0; k < mc; k++) {
      const p = nx * mv[k * 2]! + ny * mv[k * 2 + 1]!;

      minA = p < minA ? p : minA;
      maxA = p > maxA ? p : maxA;
    }

    minA -= dn;
    maxA -= dn;

    let minB = Infinity;
    let maxB = -Infinity;

    for (let k = 0; k < tc; k++) {
      const p = nx * tv[k * 2]! + ny * tv[k * 2 + 1]!;

      minB = p < minB ? p : minB;
      maxB = p > maxB ? p : maxB;
    }

    if (dn > -eps && dn < eps) {
      // No relative motion along this axis: separated — or exactly touching,
      // which the discrete narrow phase already treats as no contact — here
      // means never in contact.
      if (maxA <= minB || maxB <= minA) {
        return false;
      }

      continue;
    }

    // Entry/exit times of the moving interval against the static one.
    const t0 = (minB - maxA) / dn;
    const t1 = (maxB - minA) / dn;
    const entry = t0 < t1 ? t0 : t1;
    const exit = t0 < t1 ? t1 : t0;

    if (entry > state.tEnter) {
      state.tEnter = entry;
      // Orient the axis against the motion (from the target toward the mover).
      state.normalX = dn < 0 ? nx : -nx;
      state.normalY = dn < 0 ? ny : -ny;
    }

    if (exit < state.tLeave) {
      state.tLeave = exit;
    }

    if (state.tEnter >= state.tLeave) {
      // Separated on one axis before overlapping on another. Equality is an
      // exact graze (separation touches 0 but never goes negative), which the
      // discrete narrow phase classifies as no contact.
      return false;
    }
  }

  return true;
};
