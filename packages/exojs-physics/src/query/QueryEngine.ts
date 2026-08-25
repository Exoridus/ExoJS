import type { AabbLike, PointLike } from '@codexo/exojs';

import { aabbContainsPoint, aabbOverlap, createAabb } from '../Aabb';
import type { Collider } from '../Collider';
import { authoredCollider } from '../Collider';
import type { CollisionProxy } from '../collision/CollisionProxy';
import { testOverlap } from '../collision/narrowphase';
import { closestPointOnSegment, pointSegmentDistanceSquared } from '../collision/segments';
import { applyRotation, applyTransform, createTransform } from '../math';
import type { PhysicsBody } from '../PhysicsBody';
import type { AnyShape } from '../shapes/AnyShape';
import type { ChainShape } from '../shapes/ChainShape';
import { resolveFilter, shouldCollide } from '../types';
import type { SpatialIndex } from './SpatialIndex';

/** Reused sink for the closest-point primitives; queries run sequentially. */
const _pointScratch: PointLike = { x: 0, y: 0 };

/** Every shape kind that can be a collision operand - a chain is solved per edge. */
type SolverShape = Exclude<AnyShape, ChainShape>;

/** A category/mask/group filter applied to a query. Omitting it matches everything. */
export type QueryFilter = Partial<{ category: number; mask: number; group: number }>;

/** A single ray-cast intersection. */
export interface RayHit {
  collider: Collider;
  body: PhysicsBody;
  /** World-space hit position. */
  point: { x: number; y: number };
  /** Surface normal at the hit (unit, pointing back toward the ray origin). */
  normal: { x: number; y: number };
  /** Distance from the origin along the (normalised) ray direction. */
  distance: number;
}

/**
 * Spatial queries over the world's live collider set. The engine holds a
 * reference to the world's collider array (kept world-synchronised on every
 * body move), so queries always see current placements. Array-returning queries
 * follow the three explicit allocation forms: fresh array, caller-owned `out`,
 * or an allocation-free callback - never a hidden shared buffer.
 *
 * The engine scans the geometry the broad phase holds, which for a chain
 * collider is its per-edge proxies. Every result is reported as the authored
 * collider, and an overlap query reports a chain once however many of its edges
 * it touches. A ray still reports one hit per edge it crosses, because those are
 * distinct intersections.
 */
export class QueryEngine {
  private readonly _colliders: readonly Collider[];
  private readonly _spatialIndex: SpatialIndex | undefined;
  private readonly _scratchHits: Collider[] = [];
  private readonly _scratchHitsForEach: Collider[] = [];
  /** Chains already reported by the running `forEachAabbHit`, so one chain is one callback. */
  private readonly _scratchSeenForEach: Collider[] = [];
  private readonly _scratchAabb: AabbLike = createAabb();

  public constructor(colliders: readonly Collider[], spatialIndex?: SpatialIndex) {
    this._colliders = colliders;
    this._spatialIndex = spatialIndex;
  }

  /**
   * Colliders to scan for a query over `bounds` - the spatial index's narrowed
   * result if one is wired, else every live collider. `sync` is called first so
   * colliders added/moved since the index's last detection pass (including
   * before the world's very first `step()`) are still found.
   *
   * `buffer` is the scratch array the spatial index writes candidates into
   * (cleared and refilled in place). Callers whose per-candidate loop can
   * re-enter `_candidatesFor` - directly or via caller-supplied callback code -
   * must pass a buffer dedicated to them, so a nested call refilling its own
   * buffer can't truncate/corrupt an outer call's still-live iteration.
   */
  private _candidatesFor(bounds: AabbLike, buffer: Collider[]): readonly Collider[] {
    if (this._spatialIndex === undefined) {
      return this._colliders;
    }

    this._spatialIndex.sync(this._colliders);

    return this._spatialIndex.queryAabb(bounds, buffer);
  }

  /** Colliders containing `point`. Allocates a fresh array. */
  public queryPoint(point: Readonly<PointLike>, filter?: QueryFilter): Collider[] {
    const out: Collider[] = [];
    const resolved = filter ? resolveFilter(filter) : null;
    const bounds = this._scratchAabb;

    bounds.minX = point.x;
    bounds.minY = point.y;
    bounds.maxX = point.x;
    bounds.maxY = point.y;

    // A chain edge encloses no area, so a chain can never answer a point query
    // and no de-duplication is needed here.
    for (const collider of this._candidatesFor(bounds, this._scratchHits)) {
      if (resolved && !shouldCollide(resolved, collider.filter)) {
        continue;
      }

      if (pointInCollider(collider, point.x, point.y)) {
        out.push(collider);
      }
    }

    return out;
  }

  /** Colliders whose AABB overlaps `bounds`. Writes into `out` (cleared first) when given, else a fresh array. */
  public queryAabb(bounds: AabbLike, filter?: QueryFilter, out?: Collider[]): Collider[] {
    const result = out ?? [];
    result.length = 0;
    const resolved = filter ? resolveFilter(filter) : null;

    for (const collider of this._candidatesFor(bounds, this._scratchHits)) {
      const authored = authoredCollider(collider);

      if (resolved && !shouldCollide(resolved, authored.filter)) {
        continue;
      }

      if (aabbOverlap(collider.aabb, bounds) && !alreadyReported(collider, authored, result)) {
        result.push(authored);
      }
    }

    return result;
  }

  /**
   * Invoke `callback` for each collider whose AABB overlaps `bounds`. Allocation-free.
   *
   * NOT re-entrant on itself: `callback` runs mid-traversal over a scratch
   * buffer dedicated to this method, so it may safely call `queryPoint`,
   * `queryAabb`, or `overlapShape` on this same `PhysicsWorld`/`QueryEngine`
   * (they use a separate buffer and never invoke caller code mid-loop). It
   * must NOT call `forEachAabbHit` again - directly or indirectly - on the
   * same instance: the nested call would refill the same shared buffer this
   * traversal is still iterating, silently truncating/corrupting it. This
   * mirrors `DynamicAabbTree.query()`'s own non-reentrancy contract.
   */
  public forEachAabbHit(bounds: AabbLike, filter: QueryFilter | undefined, callback: (collider: Collider) => void): void {
    const resolved = filter ? resolveFilter(filter) : null;
    const reported = this._scratchSeenForEach;

    reported.length = 0;

    for (const collider of this._candidatesFor(bounds, this._scratchHitsForEach)) {
      const authored = authoredCollider(collider);

      if (resolved && !shouldCollide(resolved, authored.filter)) {
        continue;
      }

      if (!aabbOverlap(collider.aabb, bounds) || alreadyReported(collider, authored, reported)) {
        continue;
      }

      if (collider !== authored) {
        reported.push(authored);
      }

      callback(authored);
    }
  }

  /** Nearest collider hit by the ray from `origin` along `direction`, or `null`. */
  public rayCast(origin: Readonly<PointLike>, direction: Readonly<PointLike>, filter?: QueryFilter, maxDistance = Infinity): RayHit | null {
    const length = Math.hypot(direction.x, direction.y);

    if (length < 1e-9) {
      throw new RangeError('QueryEngine.rayCast: direction must be non-zero.');
    }

    const dx = direction.x / length;
    const dy = direction.y / length;
    const resolved = filter ? resolveFilter(filter) : null;

    let best: RayHit | null = null;
    const consider = (collider: Collider): void => {
      const authored = authoredCollider(collider);

      if (resolved && !shouldCollide(resolved, authored.filter)) {
        return;
      }

      const hit = rayCastCollider(collider, origin.x, origin.y, dx, dy, best ? best.distance : maxDistance);

      if (hit && (best === null || hit.distance < best.distance)) {
        hit.collider = authored;
        best = hit;
      }
    };

    if (this._spatialIndex === undefined) {
      for (const collider of this._colliders) {
        consider(collider);
      }
    } else {
      this._spatialIndex.sync(this._colliders);
      this._spatialIndex.rayCast(origin.x, origin.y, dx, dy, maxDistance, consider);
    }

    return best;
  }

  /** All collider hits along the ray, sorted by distance. Writes into `out` (cleared first) when given. */
  public rayCastAll(origin: Readonly<PointLike>, direction: Readonly<PointLike>, filter?: QueryFilter, out?: RayHit[], maxDistance = Infinity): RayHit[] {
    const length = Math.hypot(direction.x, direction.y);

    if (length < 1e-9) {
      throw new RangeError('QueryEngine.rayCastAll: direction must be non-zero.');
    }

    const dx = direction.x / length;
    const dy = direction.y / length;
    const resolved = filter ? resolveFilter(filter) : null;
    const result = out ?? [];
    result.length = 0;
    const consider = (collider: Collider): void => {
      const authored = authoredCollider(collider);

      if (resolved && !shouldCollide(resolved, authored.filter)) {
        return;
      }

      const hit = rayCastCollider(collider, origin.x, origin.y, dx, dy, maxDistance);

      if (hit) {
        hit.collider = authored;
        result.push(hit);
      }
    };

    if (this._spatialIndex === undefined) {
      for (const collider of this._colliders) {
        consider(collider);
      }
    } else {
      this._spatialIndex.sync(this._colliders);
      this._spatialIndex.rayCast(origin.x, origin.y, dx, dy, maxDistance, consider);
    }

    result.sort((a, b) => a.distance - b.distance);

    return result;
  }

  /**
   * Colliders overlapping `shape` placed at `position`/`angle`. Allocates a
   * fresh array.
   *
   * A chain query shape is tested edge by edge, exactly as a chain collider is
   * solved. Two boundaries have no overlap volume, so a chain - like a segment -
   * never reports another chain or segment.
   */
  public overlapShape(shape: AnyShape, position: Readonly<PointLike>, filter?: QueryFilter, angle = 0): Collider[] {
    const proxies = queryProxies(shape, position.x, position.y, angle);
    const out: Collider[] = [];
    const resolved = filter ? resolveFilter(filter) : null;
    const bounds = proxiesAabb(shape, proxies, this._scratchAabb);

    for (const collider of this._candidatesFor(bounds, this._scratchHits)) {
      const authored = authoredCollider(collider);

      if (resolved && !shouldCollide(resolved, authored.filter)) {
        continue;
      }

      if (alreadyReported(collider, authored, out)) {
        continue;
      }

      for (const proxy of proxies) {
        if (testOverlap(proxy, collider)) {
          out.push(authored);
          break;
        }
      }
    }

    return out;
  }
}

/** Read a flat vertex/normal buffer in-bounds: callers index within 0..count-1. */

/** `true` when world point `(px, py)` lies inside `collider`'s shape. */
const pointInCollider = (collider: Collider, px: number, py: number): boolean => {
  if (!aabbContainsPoint(collider.aabb, px, py)) {
    return false;
  }

  if (collider.shape.type === 'circle') {
    const c = collider.worldCenter;
    const r = collider.shape.radius;
    const dx = px - c.x;
    const dy = py - c.y;

    return dx * dx + dy * dy <= r * r;
  }

  if (collider.shape.type === 'chain') {
    // Unreachable through the world's own geometry - a chain is scanned through
    // its edge proxies - and the same answer as a segment either way.
    return false;
  }

  if (collider.shape.type === 'segment') {
    // A boundary encloses no area. Reporting a hit within some epsilon would make
    // the answer depend on an engine constant rather than the authored geometry;
    // ray casts and AABB queries are the meaningful questions for a segment.
    return false;
  }

  if (collider.shape.type === 'capsule') {
    const spine = collider.worldVertices;

    return pointSegmentDistanceSquared(px, py, spine[0]!, spine[1]!, spine[2]!, spine[3]!, _pointScratch) <= collider.shape.radius * collider.shape.radius;
  }

  const verts = collider.worldVertices;
  const normals = collider.worldNormals;
  const count = collider.shape.count;

  for (let i = 0; i < count; i++) {
    const nx = normals[i * 2]!;
    const ny = normals[i * 2 + 1]!;
    const vx = verts[i * 2]!;
    const vy = verts[i * 2 + 1]!;

    if (nx * (px - vx) + ny * (py - vy) > 0) {
      return false;
    }
  }

  return true;
};

/** Cast the (normalised) ray against one collider, returning the entry hit or `null`. */
const rayCastCollider = (collider: Collider, ox: number, oy: number, dx: number, dy: number, maxDistance: number): RayHit | null => {
  switch (collider.shape.type) {
    case 'circle':
      return rayCastCircle(collider, ox, oy, dx, dy, maxDistance);
    case 'capsule':
      return rayCastCapsule(collider, collider.shape.radius, ox, oy, dx, dy, maxDistance);
    case 'segment':
      return rayCastSegment(collider, ox, oy, dx, dy, maxDistance);
    case 'polygon':
      return rayCastPolygon(collider, ox, oy, dx, dy, maxDistance);
    case 'chain':
      // A chain collider is never scanned itself; its edge proxies are.
      return null;
  }
};

/**
 * Ray against a segment: a plain segment/segment crossing. The reported normal is
 * the segment's own side normal, flipped to face the incoming ray - a boundary
 * blocks from both sides, so which of its two normals applies is decided by where
 * the ray comes from.
 */
const rayCastSegment = (collider: Collider, ox: number, oy: number, dx: number, dy: number, maxDistance: number): RayHit | null => {
  const ends = collider.worldVertices;
  const ax = ends[0]!;
  const ay = ends[1]!;
  const ex = ends[2]! - ax;
  const ey = ends[3]! - ay;
  const denominator = dx * ey - dy * ex;

  // Parallel (or collinear): no single crossing point to report.
  if (Math.abs(denominator) < 1e-12) {
    return null;
  }

  const rx = ax - ox;
  const ry = ay - oy;
  const distance = (rx * ey - ry * ex) / denominator;
  const along = (rx * dy - ry * dx) / denominator;

  if (distance < 0 || distance > maxDistance || along < 0 || along > 1) {
    return null;
  }

  const nx = collider.worldNormals[0]!;
  const ny = collider.worldNormals[1]!;
  const facing = nx * dx + ny * dy > 0 ? -1 : 1;

  return {
    collider,
    body: collider.body,
    point: { x: ox + dx * distance, y: oy + dy * distance },
    normal: { x: nx * facing, y: ny * facing },
    distance,
  };
};

/**
 * Ray against a capsule: the first point along the ray whose distance to the
 * spine equals the radius.
 *
 * Found by scanning for the first sample inside and bisecting the bracket that
 * produced it, rather than by three closed-form feature tests (two caps and the
 * side slab). The distance-to-spine function is continuous and, approaching the
 * capsule from outside, monotone up to the first touch, so the bracket is valid;
 * a fixed 40 bisections put the result far below the engine's contact slop. The
 * cost is a query-path concern only - the solver never runs this.
 */
const rayCastCapsule = (collider: Collider, radius: number, ox: number, oy: number, dx: number, dy: number, maxDistance: number): RayHit | null => {
  const spine = collider.worldVertices;
  const ax = spine[0]!;
  const ay = spine[1]!;
  const bx = spine[2]!;
  const by = spine[3]!;
  const radiusSquared = radius * radius;

  // An origin already inside the solid has no entry point, matching the circle
  // and polygon paths.
  if (pointSegmentDistanceSquared(ox, oy, ax, ay, bx, by, _pointScratch) <= radiusSquared) {
    return null;
  }

  // Bound the scan by where the ray crosses the collider's AABB. `maxDistance`
  // is routinely Infinity, and the box already carries the capsule's radius, so
  // this is both finite and tight.
  const box = collider.aabb;
  let near = 0;
  let far = maxDistance;

  for (let axis = 0; axis < 2; axis++) {
    const origin = axis === 0 ? ox : oy;
    const direction = axis === 0 ? dx : dy;
    const lo = axis === 0 ? box.minX : box.minY;
    const hi = axis === 0 ? box.maxX : box.maxY;

    if (Math.abs(direction) < 1e-12) {
      if (origin < lo || origin > hi) {
        return null;
      }

      continue;
    }

    const t0 = (lo - origin) / direction;
    const t1 = (hi - origin) / direction;

    near = Math.max(near, Math.min(t0, t1));
    far = Math.min(far, Math.max(t0, t1));
  }

  if (near > far) {
    return null;
  }

  const steps = 32;
  const stepLength = (far - near) / steps;
  let entered = -1;

  for (let i = 1; i <= steps; i++) {
    const t = near + i * stepLength;

    if (pointSegmentDistanceSquared(ox + dx * t, oy + dy * t, ax, ay, bx, by, _pointScratch) <= radiusSquared) {
      entered = t;

      break;
    }
  }

  if (entered < 0) {
    return null;
  }

  let lo = entered - stepLength;
  let hi = entered;

  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;

    if (pointSegmentDistanceSquared(ox + dx * mid, oy + dy * mid, ax, ay, bx, by, _pointScratch) <= radiusSquared) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const hitX = ox + dx * hi;
  const hitY = oy + dy * hi;

  closestPointOnSegment(hitX, hitY, ax, ay, bx, by, _pointScratch);

  const nx = hitX - _pointScratch.x;
  const ny = hitY - _pointScratch.y;
  const length = Math.hypot(nx, ny) || 1;

  return {
    collider,
    body: collider.body,
    point: { x: hitX, y: hitY },
    normal: { x: nx / length, y: ny / length },
    distance: hi,
  };
};

const rayCastCircle = (collider: Collider, ox: number, oy: number, dx: number, dy: number, maxDistance: number): RayHit | null => {
  const c = collider.worldCenter;
  // Dispatched only for circle colliders; the fallback is unreachable.
  const r = collider.shape.type === 'circle' ? collider.shape.radius : 0;
  const mx = ox - c.x;
  const my = oy - c.y;
  const b = mx * dx + my * dy;
  const cc = mx * mx + my * my - r * r;

  // Origin outside and pointing away.
  if (cc > 0 && b > 0) {
    return null;
  }

  const disc = b * b - cc;

  if (disc < 0) {
    return null;
  }

  let t = -b - Math.sqrt(disc);

  if (t < 0) {
    t = 0;
  }

  if (t > maxDistance) {
    return null;
  }

  const px = ox + dx * t;
  const py = oy + dy * t;
  const nx = (px - c.x) / r;
  const ny = (py - c.y) / r;

  return { collider, body: collider.body, point: { x: px, y: py }, normal: { x: nx, y: ny }, distance: t };
};

const rayCastPolygon = (collider: Collider, ox: number, oy: number, dx: number, dy: number, maxDistance: number): RayHit | null => {
  const verts = collider.worldVertices;
  const normals = collider.worldNormals;
  // Dispatched only for polygon colliders; the fallback is unreachable.
  const count = collider.shape.type === 'polygon' ? collider.shape.count : 0;

  let tmin = 0;
  let tmax = maxDistance;
  let enterNx = 0;
  let enterNy = 0;
  let entered = false;

  for (let i = 0; i < count; i++) {
    const nx = normals[i * 2]!;
    const ny = normals[i * 2 + 1]!;
    const vx = verts[i * 2]!;
    const vy = verts[i * 2 + 1]!;
    const numerator = nx * (vx - ox) + ny * (vy - oy);
    const denominator = nx * dx + ny * dy;

    if (denominator === 0) {
      // Parallel to this face: if the origin is outside it, the ray misses.
      if (numerator < 0) {
        return null;
      }

      continue;
    }

    const t = numerator / denominator;

    if (denominator < 0) {
      // Entering this half-plane.
      if (t > tmin) {
        tmin = t;
        enterNx = nx;
        enterNy = ny;
        entered = true;
      }
    } else if (t < tmax) {
      // Leaving this half-plane.
      tmax = t;
    }

    if (tmin > tmax) {
      return null;
    }
  }

  if (!entered || tmin < 0 || tmin > maxDistance) {
    return null;
  }

  return {
    collider,
    body: collider.body,
    point: { x: ox + dx * tmin, y: oy + dy * tmin },
    normal: { x: enterNx, y: enterNy },
    distance: tmin,
  };
};

/**
 * Throwaway collision proxies for a query shape placed at `(x, y)` with `angle`:
 * one, or one per edge for a chain.
 */
const queryProxies = (shape: AnyShape, x: number, y: number, angle: number): readonly CollisionProxy[] => {
  if (shape.type !== 'chain') {
    return [makeProxy(shape, x, y, angle)];
  }

  return shape.edges.map(edge => makeProxy(edge, x, y, angle));
};

/** World AABB covering every proxy of a query shape. */
const proxiesAabb = (shape: AnyShape, proxies: readonly CollisionProxy[], out: AabbLike): AabbLike => {
  if (shape.type !== 'chain') {
    return proxyAabb(shape, proxies[0]!, out);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const proxy of proxies) {
    const edgeBounds = proxyAabb(proxy.shape as SolverShape, proxy, _scratchEdgeAabb);

    minX = edgeBounds.minX < minX ? edgeBounds.minX : minX;
    minY = edgeBounds.minY < minY ? edgeBounds.minY : minY;
    maxX = edgeBounds.maxX > maxX ? edgeBounds.maxX : maxX;
    maxY = edgeBounds.maxY > maxY ? edgeBounds.maxY : maxY;
  }

  out.minX = minX;
  out.minY = minY;
  out.maxX = maxX;
  out.maxY = maxY;

  return out;
};

/** Scratch for the per-edge bounds a chain query shape unions. */
const _scratchEdgeAabb: AabbLike = createAabb();

/**
 * `true` when `authored` is already in `reported`. Only a chain can be reached
 * twice in one query (once per edge proxy), so nothing else pays for the scan.
 */
const alreadyReported = (candidate: Collider, authored: Collider, reported: readonly Collider[]): boolean =>
  candidate !== authored && reported.includes(authored);

/** Build a throwaway collision proxy for a shape placed at `(x, y)` with `angle`. */
const makeProxy = (shape: SolverShape, x: number, y: number, angle: number): CollisionProxy => {
  if (shape.type === 'circle') {
    return { shape, worldCenter: { x, y }, worldVertices: [], worldNormals: [] };
  }

  const count = shape.type === 'polygon' ? shape.count : 2;
  const transform = createTransform(x, y, angle);
  const worldVertices: number[] = [];
  const worldNormals: number[] = [];
  const out: PointLike = { x: 0, y: 0 };

  for (let i = 0; i < count; i++) {
    applyTransform(transform, shape.vertices[i * 2]!, shape.vertices[i * 2 + 1]!, out);
    worldVertices.push(out.x, out.y);
    applyRotation(transform, shape.normals[i * 2]!, shape.normals[i * 2 + 1]!, out);
    worldNormals.push(out.x, out.y);
  }

  return { shape, worldCenter: { x, y }, worldVertices, worldNormals };
};

/** Compute the world AABB of an already-built collision proxy (reuses its cached vertices/centre - no extra transform work). */
const proxyAabb = (shape: SolverShape, proxy: CollisionProxy, out: AabbLike): AabbLike => {
  if (shape.type === 'circle') {
    const r = shape.radius;

    out.minX = proxy.worldCenter.x - r;
    out.minY = proxy.worldCenter.y - r;
    out.maxX = proxy.worldCenter.x + r;
    out.maxY = proxy.worldCenter.y + r;

    return out;
  }

  const verts = proxy.worldVertices;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < verts.length; i += 2) {
    const x = verts[i]!;
    const y = verts[i + 1]!;

    minX = x < minX ? x : minX;
    minY = y < minY ? y : minY;
    maxX = x > maxX ? x : maxX;
    maxY = y > maxY ? y : maxY;
  }

  const radius = shape.type === 'capsule' ? shape.radius : 0;

  out.minX = minX - radius;
  out.minY = minY - radius;
  out.maxX = maxX + radius;
  out.maxY = maxY + radius;

  return out;
};
