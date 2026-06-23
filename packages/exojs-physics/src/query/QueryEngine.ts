import type { Aabb } from '../Aabb';
import { aabbContainsPoint, aabbOverlap } from '../Aabb';
import type { Collider } from '../Collider';
import type { CollisionProxy } from '../collision/CollisionProxy';
import { testOverlap } from '../collision/narrowphase';
import type { Mutable2D } from '../math';
import { applyRotation, applyTransform, createTransform } from '../math';
import type { PhysicsBody } from '../PhysicsBody';
import type { AnyShape } from '../shapes/AnyShape';
import type { VectorLike } from '../types';
import { resolveFilter, shouldCollide } from '../types';

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
 * or an allocation-free callback — never a hidden shared buffer.
 */
export class QueryEngine {
  private readonly _colliders: readonly Collider[];

  public constructor(colliders: readonly Collider[]) {
    this._colliders = colliders;
  }

  /** Colliders containing `point`. Allocates a fresh array. */
  public queryPoint(point: VectorLike, filter?: QueryFilter): Collider[] {
    const out: Collider[] = [];
    const resolved = filter ? resolveFilter(filter) : null;

    for (const collider of this._colliders) {
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
  public queryAabb(bounds: Aabb, filter?: QueryFilter, out?: Collider[]): Collider[] {
    const result = out ?? [];
    result.length = 0;
    const resolved = filter ? resolveFilter(filter) : null;

    for (const collider of this._colliders) {
      if (resolved && !shouldCollide(resolved, collider.filter)) {
        continue;
      }

      if (aabbOverlap(collider.aabb, bounds)) {
        result.push(collider);
      }
    }

    return result;
  }

  /** Invoke `callback` for each collider whose AABB overlaps `bounds`. Allocation-free. */
  public forEachAabbHit(bounds: Aabb, filter: QueryFilter | undefined, callback: (collider: Collider) => void): void {
    const resolved = filter ? resolveFilter(filter) : null;

    for (const collider of this._colliders) {
      if (resolved && !shouldCollide(resolved, collider.filter)) {
        continue;
      }

      if (aabbOverlap(collider.aabb, bounds)) {
        callback(collider);
      }
    }
  }

  /** Nearest collider hit by the ray from `origin` along `direction`, or `null`. */
  public rayCast(origin: VectorLike, direction: VectorLike, filter?: QueryFilter, maxDistance = Infinity): RayHit | null {
    const length = Math.hypot(direction.x, direction.y);

    if (length < 1e-9) {
      throw new RangeError('QueryEngine.rayCast: direction must be non-zero.');
    }

    const dx = direction.x / length;
    const dy = direction.y / length;
    const resolved = filter ? resolveFilter(filter) : null;

    let best: RayHit | null = null;

    for (const collider of this._colliders) {
      if (resolved && !shouldCollide(resolved, collider.filter)) {
        continue;
      }

      const hit = rayCastCollider(collider, origin.x, origin.y, dx, dy, best ? best.distance : maxDistance);

      if (hit && (best === null || hit.distance < best.distance)) {
        best = hit;
      }
    }

    return best;
  }

  /** All collider hits along the ray, sorted by distance. Writes into `out` (cleared first) when given. */
  public rayCastAll(origin: VectorLike, direction: VectorLike, filter?: QueryFilter, out?: RayHit[], maxDistance = Infinity): RayHit[] {
    const length = Math.hypot(direction.x, direction.y);

    if (length < 1e-9) {
      throw new RangeError('QueryEngine.rayCastAll: direction must be non-zero.');
    }

    const dx = direction.x / length;
    const dy = direction.y / length;
    const resolved = filter ? resolveFilter(filter) : null;
    const result = out ?? [];
    result.length = 0;

    for (const collider of this._colliders) {
      if (resolved && !shouldCollide(resolved, collider.filter)) {
        continue;
      }

      const hit = rayCastCollider(collider, origin.x, origin.y, dx, dy, maxDistance);

      if (hit) {
        result.push(hit);
      }
    }

    result.sort((a, b) => a.distance - b.distance);

    return result;
  }

  /** Colliders overlapping `shape` placed at `position`/`angle`. Allocates a fresh array. */
  public overlapShape(shape: AnyShape, position: VectorLike, filter?: QueryFilter, angle = 0): Collider[] {
    const proxy = makeProxy(shape, position.x, position.y, angle);
    const out: Collider[] = [];
    const resolved = filter ? resolveFilter(filter) : null;

    for (const collider of this._colliders) {
      if (resolved && !shouldCollide(resolved, collider.filter)) {
        continue;
      }

      if (testOverlap(proxy, collider)) {
        out.push(collider);
      }
    }

    return out;
  }
}

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

  const verts = collider.worldVertices;
  const normals = collider.worldNormals;
  const count = collider.shape.count;

  for (let i = 0; i < count; i++) {
    if (normals[i * 2] * (px - verts[i * 2]) + normals[i * 2 + 1] * (py - verts[i * 2 + 1]) > 0) {
      return false;
    }
  }

  return true;
};

/** Cast the (normalised) ray against one collider, returning the entry hit or `null`. */
const rayCastCollider = (collider: Collider, ox: number, oy: number, dx: number, dy: number, maxDistance: number): RayHit | null => {
  if (collider.shape.type === 'circle') {
    return rayCastCircle(collider, ox, oy, dx, dy, maxDistance);
  }

  return rayCastPolygon(collider, ox, oy, dx, dy, maxDistance);
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
    const nx = normals[i * 2];
    const ny = normals[i * 2 + 1];
    const numerator = nx * (verts[i * 2] - ox) + ny * (verts[i * 2 + 1] - oy);
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

/** Build a throwaway collision proxy for a shape placed at `(x, y)` with `angle`. */
const makeProxy = (shape: AnyShape, x: number, y: number, angle: number): CollisionProxy => {
  if (shape.type === 'circle') {
    return { shape, worldCenter: { x, y }, worldVertices: [], worldNormals: [] };
  }

  const polygon = shape;
  const transform = createTransform(x, y, angle);
  const worldVertices: number[] = [];
  const worldNormals: number[] = [];
  const out: Mutable2D = { x: 0, y: 0 };

  for (let i = 0; i < polygon.count; i++) {
    applyTransform(transform, polygon.vertices[i * 2], polygon.vertices[i * 2 + 1], out);
    worldVertices.push(out.x, out.y);
    applyRotation(transform, polygon.normals[i * 2], polygon.normals[i * 2 + 1], out);
    worldNormals.push(out.x, out.y);
  }

  return { shape, worldCenter: { x, y }, worldVertices, worldNormals };
};
