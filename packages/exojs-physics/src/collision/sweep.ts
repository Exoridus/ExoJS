import type { PointLike } from '@codexo/exojs';

import type { ShapeType } from '../shapes/Shape';
import { chainEdgeAdmits } from './chainAdjacency';
import type { CollisionProxy } from './CollisionProxy';
import type { PairTable } from './dispatch';
import { orderedEntry, orderedTable } from './dispatch';
import { pointSegmentDistanceSquared } from './segments';

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

// Module-local scratch shared by the casts below. Like the narrow-phase clip
// scratch, the sweep is single-threaded and non-reentrant - the world's CCD pass
// calls `sweepProxies` strictly sequentially - so module-global scratch is safe.
const _pointScratch: PointLike = { x: 0, y: 0 };

/**
 * Translation-only shape cast of `moving` against a static `target`: `moving`
 * is given at its **end-of-motion** pose (its cached world geometry) and is
 * swept from `pose − (dx, dy)` to `pose`. Rotation over the motion is not swept
 * - the moving shape keeps its end orientation for the whole cast, matching the
 * bullet CCD model (the step's rotation is applied before the sweep).
 *
 * Returns `true` with the first time of impact and the target-surface normal
 * written into `out`. Pairs already overlapping (or exactly touching) at the
 * start of the motion return `false` - they cannot tunnel within this motion
 * and the discrete solver owns them. Allocation-free.
 *
 * Boundary geometry (a segment, a chain edge) is a target, never the moving
 * operand: a chain edge blocks a bullet under the same one-sided adjacency rule
 * the discrete narrow phase applies, while a fast segment or chain is not swept
 * at all.
 */
export const sweepProxies = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  const cast = orderedEntry(sweepTable, moving.shape.type, target.shape.type);

  // Unlike the narrow phase, the sweep distinguishes its operands, so this table
  // is filled for both orders. A missing entry reports no impact - the pair is
  // not swept at all rather than swept approximately.
  if (cast === undefined) {
    return false;
  }

  if (!cast(moving, dx, dy, target, out)) {
    return false;
  }

  // `out` holds the outward normal on the target, which is the direction a chain
  // edge has to admit for the hit to be its own.
  return chainEdgeAdmits(target, out.normalX, out.normalY);
};

/** `true` when {@link sweepProxies} has an implementation for this ordered pair. */
export const canSweep = (moving: ShapeType, target: ShapeType): boolean => orderedEntry(sweepTable, moving, target) !== undefined;

/**
 * Vertex count of a proxy's **core**: the geometry left once its radius is taken
 * off. A circle is a point (no core ring), a capsule and a segment are both a
 * two-vertex ring - with and without a radius - and a polygon is its own ring.
 */
const coreCount = (proxy: CollisionProxy): number => {
  switch (proxy.shape.type) {
    case 'polygon':
      return proxy.shape.count;
    case 'capsule':
    case 'segment':
      return 2;
    case 'circle':
    case 'chain':
      // A chain is never an operand here - it is swept through its edge proxies.
      return 0;
  }
};

const radiusOf = (proxy: CollisionProxy): number => (proxy.shape.type === 'circle' || proxy.shape.type === 'capsule' ? proxy.shape.radius : 0);

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
    // Moving away (or tangential) - no entry within the motion.
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

/**
 * Moving circle vs a static core ring (polygon, capsule or segment): a ray
 * against that ring inflated by both radii - offset faces plus vertex arcs, the
 * exact swept geometry.
 */
const sweepCircleRing = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  const rsum = radiusOf(moving) + radiusOf(target);
  const ox = moving.worldCenter.x - dx;
  const oy = moving.worldCenter.y - dy;
  const verts = target.worldVertices;
  const normals = target.worldNormals;
  const count = coreCount(target);

  // Already overlapping/touching at the start: the discrete solver owns it.
  if (pointRingDistanceSquared(ox, oy, verts, normals, count) <= rsum * rsum) {
    return false;
  }

  return castPointAtRing(ox, oy, dx, dy, rsum, verts, normals, count, out);
};

/**
 * Moving core ring (polygon or capsule) vs static circle, solved in the moving
 * shape's frame: the circle sweeps backward (`−d`) from a start displaced by
 * `+d`, against the ring's end-pose geometry - the same relative motion, so the
 * same time of impact.
 */
const sweepRingCircle = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  const rsum = radiusOf(moving) + radiusOf(target);
  const ox = target.worldCenter.x + dx;
  const oy = target.worldCenter.y + dy;
  const verts = moving.worldVertices;
  const normals = moving.worldNormals;
  const count = coreCount(moving);

  // Already overlapping/touching at the start: the discrete solver owns it.
  if (pointRingDistanceSquared(ox, oy, verts, normals, count) <= rsum * rsum) {
    return false;
  }

  if (!castPointAtRing(ox, oy, -dx, -dy, rsum, verts, normals, count, out)) {
    return false;
  }

  // The cast reports the normal on the moving shape toward the circle; the
  // caller wants the obstacle-surface normal, so flip it.
  out.normalX = -out.normalX;
  out.normalY = -out.normalY;

  return true;
};

/**
 * Two core rings of which at least one carries a radius (any pair involving a
 * capsule): built as one configuration-space ring and cast as a point, which is
 * exact where a radius-inflated SAT would square off the rounded corners.
 */
const sweepRoundedRings = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  const rsum = radiusOf(moving) + radiusOf(target);

  if (!buildConfigurationRing(moving, dx, dy, target)) {
    return false;
  }

  const verts = _configurationRing.vertices;
  const normals = _configurationRing.normals;
  const count = _configurationRing.count;

  // Already overlapping/touching at the start: the discrete solver owns it.
  if (pointRingDistanceSquared(0, 0, verts, normals, count) <= rsum * rsum) {
    return false;
  }

  return castPointAtRing(0, 0, dx, dy, rsum, verts, normals, count, out);
};

/**
 * Cast the point `(ox, oy)` along `(dx, dy)` (t ∈ [0, 1]) against `count`-vertex
 * convex ring inflated by `r`: offset faces plus vertex arcs - the exact swept
 * geometry. Writes the earliest hit into `out`; the normal points from the ring
 * surface toward the point.
 */
const castPointAtRing = (
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  r: number,
  verts: readonly number[],
  normals: readonly number[],
  count: number,
  out: SweepHit,
): boolean => {
  // Both passes only improve `out` when they beat the current `out.t`.
  out.t = Infinity;
  castAtOffsetFaces(ox, oy, dx, dy, r, verts, normals, count, out);
  castAtVertexArcs(ox, oy, dx, dy, r, verts, count, out);

  return out.t !== Infinity;
};

/** Offset-face pass of {@link castPointAtRing}: the face plane pushed out by `r`, hits valid within the edge span. */
const castAtOffsetFaces = (
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  r: number,
  verts: readonly number[],
  normals: readonly number[],
  count: number,
  out: SweepHit,
): void => {
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

/** Vertex-arc pass of {@link castPointAtRing}: a ray against the circle of radius `r` around each vertex. */
const castAtVertexArcs = (ox: number, oy: number, dx: number, dy: number, r: number, verts: readonly number[], count: number, out: SweepHit): void => {
  if (r <= 0) {
    return; // A radius-free ring has no arcs; its faces meet at the vertices.
  }

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

/**
 * Squared distance from `(px, py)` to a convex core ring, `0` inside it. A
 * two-vertex ring has no interior, so it is always the distance to the segment.
 */
const pointRingDistanceSquared = (px: number, py: number, verts: readonly number[], normals: readonly number[], count: number): number => {
  if (count >= 3) {
    let inside = true;

    for (let i = 0; i < count && inside; i++) {
      inside = normals[i * 2]! * (px - verts[i * 2]!) + normals[i * 2 + 1]! * (py - verts[i * 2 + 1]!) <= 0;
    }

    if (inside) {
      return 0;
    }
  }

  let best = Infinity;

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const distance = pointSegmentDistanceSquared(px, py, verts[i * 2]!, verts[i * 2 + 1]!, verts[j * 2]!, verts[j * 2 + 1]!, _pointScratch);

    best = distance < best ? distance : best;
  }

  return best;
};

/** A convex ring in world space: the only geometry the casts above work on. */
interface Ring {
  vertices: number[];
  normals: number[];
  count: number;
}

// Scratch for the configuration-space ring and its hull pass. The arrays grow
// to the largest pair seen and are then written in place, so a steady-state
// bullet against known geometry allocates nothing.
const _configurationRing: Ring = { vertices: [], normals: [], count: 0 };
const _sumPoints: number[] = [];
const _sumOrder: number[] = [];
const _hull: number[] = [];

/**
 * Build the pair's configuration-space obstacle into {@link _configurationRing}:
 * the Minkowski sum of the target's core and the negated start-pose core of the
 * moving shape. A translational cast of the pair is then a cast of the origin
 * point against that single ring, inflated by the two radii - which is why every
 * rounded pair reduces to {@link castPointAtRing} instead of its own algorithm.
 */
const buildConfigurationRing = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy): boolean => {
  const movingCount = coreCount(moving);
  const targetCount = coreCount(target);

  if (movingCount < 2 || targetCount < 2) {
    return false;
  }

  const movingVerts = moving.worldVertices;
  const targetVerts = target.worldVertices;
  const total = movingCount * targetCount;

  grow(_sumPoints, total * 2);
  grow(_sumOrder, total);

  for (let j = 0, k = 0; j < targetCount; j++) {
    for (let i = 0; i < movingCount; i++, k++) {
      // The moving core at the start of the motion is its end pose minus (dx, dy).
      _sumPoints[k * 2] = targetVerts[j * 2]! - (movingVerts[i * 2]! - dx);
      _sumPoints[k * 2 + 1] = targetVerts[j * 2 + 1]! - (movingVerts[i * 2 + 1]! - dy);
      _sumOrder[k] = k;
    }
  }

  const count = convexHull(total);

  if (count < 2) {
    return false;
  }

  grow(_configurationRing.vertices, count * 2);
  grow(_configurationRing.normals, count * 2);
  _configurationRing.count = count;

  const verts = _configurationRing.vertices;
  const normals = _configurationRing.normals;

  for (let i = 0; i < count; i++) {
    const point = _hull[i]!;

    verts[i * 2] = _sumPoints[point * 2]!;
    verts[i * 2 + 1] = _sumPoints[point * 2 + 1]!;
  }

  // Same convention as every authored ring: the outward normal of the
  // counter-clockwise edge i → i+1 is (eY, -eX). A two-vertex ring gets the two
  // opposite normals out of the same loop.
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    const ex = verts[j * 2]! - verts[i * 2]!;
    const ey = verts[j * 2 + 1]! - verts[i * 2 + 1]!;
    const length = Math.sqrt(ex * ex + ey * ey) || 1;

    normals[i * 2] = ey / length;
    normals[i * 2 + 1] = -ex / length;
  }

  return true;
};

/**
 * Counter-clockwise convex hull of the first `total` points in
 * {@link _sumPoints} (Andrew's monotone chain), written as point indices into
 * {@link _hull}; returns the hull size. Collinear points are dropped, so a
 * degenerate sum - two parallel spines - comes out as a two-vertex ring rather
 * than a zero-area polygon.
 */
const convexHull = (total: number): number => {
  // Insertion sort by (x, y): the point sets here are a handful of vertices, and
  // sorting in place over the index scratch keeps the pass allocation-free.
  for (let i = 1; i < total; i++) {
    const value = _sumOrder[i]!;
    let j = i - 1;

    while (j >= 0 && comparePoints(_sumOrder[j]!, value) > 0) {
      _sumOrder[j + 1] = _sumOrder[j]!;
      j--;
    }

    _sumOrder[j + 1] = value;
  }

  grow(_hull, total * 2 + 1);

  let size = 0;

  for (let i = 0; i < total; i++) {
    size = pushHullPoint(_sumOrder[i]!, size, 2);
  }

  // The upper chain may not eat into the lower one, so it keeps one more point
  // than the lower chain left behind.
  const upperFloor = size + 1;

  for (let i = total - 2; i >= 0; i--) {
    size = pushHullPoint(_sumOrder[i]!, size, upperFloor);
  }

  // The chain closes on its starting point, which is already the first entry.
  return size > 1 ? size - 1 : size;
};

/** One monotone-chain step: drop hull points that a left turn onto `point` makes interior. */
const pushHullPoint = (point: number, size: number, floor: number): number => {
  while (size >= floor && cross(_hull[size - 2]!, _hull[size - 1]!, point) <= 0) {
    size--;
  }

  _hull[size] = point;

  return size + 1;
};

const comparePoints = (a: number, b: number): number => {
  const ax = _sumPoints[a * 2]!;
  const bx = _sumPoints[b * 2]!;

  if (ax !== bx) {
    return ax < bx ? -1 : 1;
  }

  const ay = _sumPoints[a * 2 + 1]!;
  const by = _sumPoints[b * 2 + 1]!;

  if (ay === by) {
    return 0;
  }

  return ay < by ? -1 : 1;
};

/** Cross product of `o → a` and `o → b`; positive for a counter-clockwise turn. */
const cross = (o: number, a: number, b: number): number => {
  const ox = _sumPoints[o * 2]!;
  const oy = _sumPoints[o * 2 + 1]!;

  return (_sumPoints[a * 2]! - ox) * (_sumPoints[b * 2 + 1]! - oy) - (_sumPoints[a * 2 + 1]! - oy) * (_sumPoints[b * 2]! - ox);
};

/** Extend a scratch array to `length`, keeping it a plain packed number array. */
const grow = (array: number[], length: number): void => {
  while (array.length < length) {
    array.push(0);
  }
};

// Swept-SAT accumulator shared by sweepRings's two axis passes.
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
 * Two radius-free core rings (polygon or segment) via swept SAT: for every
 * candidate axis (both rings' face normals) intersect the moving projection
 * interval with the static one over t ∈ [0, 1]; the latest entry over all axes
 * is the time of impact, and its axis (oriented against the motion) the normal.
 * Exact for linear motion of convex shapes.
 */
const sweepRings = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit): boolean => {
  const state = _satState;

  state.tEnter = -Infinity;
  state.tLeave = Infinity;

  // Two passes: axes from the target, then from the moving ring. Either pass may
  // prove the pair never meets within the motion.
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
const sweptSatAxes = (axisOwner: CollisionProxy, moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, state: SweptSatState): boolean => {
  const axes = axisOwner.worldNormals;
  const axisCount = coreCount(axisOwner);
  const mv = moving.worldVertices;
  const mc = coreCount(moving);
  const tv = target.worldVertices;
  const tc = coreCount(target);

  for (let i = 0; i < axisCount; i++) {
    // Loop indices are provably in-bounds; the `!` is zero-cost.
    const nx = axes[i * 2]!;
    const ny = axes[i * 2 + 1]!;
    const dn = nx * dx + ny * dy;

    // Project the moving ring (end pose), then shift to its start pose.
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
      // No relative motion along this axis: separated - or exactly touching,
      // which the discrete narrow phase already treats as no contact - here
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

/** One ordered `(moving, target)` shape cast. */
type SweepPair = (moving: CollisionProxy, dx: number, dy: number, target: CollisionProxy, out: SweepHit) => boolean;

// Every ordered pair a mass-bearing shape can move as. Boundary geometry
// (segment, chain) appears only as a target: level structure is not swept, and
// a fast body that needs protection carries a solid shape.
const sweepTable: PairTable<SweepPair> = orderedTable<SweepPair>([
  ['circle', 'circle', sweepCircleCircle],
  ['circle', 'capsule', sweepCircleRing],
  ['circle', 'segment', sweepCircleRing],
  ['circle', 'polygon', sweepCircleRing],
  ['capsule', 'circle', sweepRingCircle],
  ['capsule', 'capsule', sweepRoundedRings],
  ['capsule', 'segment', sweepRoundedRings],
  ['capsule', 'polygon', sweepRoundedRings],
  ['polygon', 'circle', sweepRingCircle],
  ['polygon', 'capsule', sweepRoundedRings],
  ['polygon', 'segment', sweepRings],
  ['polygon', 'polygon', sweepRings],
]);
