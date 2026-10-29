import type { AabbLike, PointLike } from '@codexo/exojs';

import { aabbContainsPoint, aabbOverlap, createAabb } from '../Aabb';
import type { Collider } from '../Collider';
import { authoredCollider } from '../Collider';
import type { CollisionProxy } from '../collision/CollisionProxy';
import { Manifold } from '../collision/Manifold';
import { collide, testOverlap } from '../collision/narrowphase';
import { closestPointOnSegment, pointSegmentDistanceSquared } from '../collision/segments';
import { type SweepHit, sweepProxies } from '../collision/sweep';
import type { PhysicsBody } from '../PhysicsBody';
import type { AnyShape } from '../shapes/AnyShape';
import type { ChainShape } from '../shapes/ChainShape';
import { type CollisionFilter, defaultFilter, resolveFilter, shouldCollide } from '../types';
import type { SpatialIndex } from './SpatialIndex';

/** Reused sink for the closest-point primitives; queries run sequentially. */
const _pointScratch: PointLike = { x: 0, y: 0 };

const validateRay = (origin: Readonly<PointLike>, direction: Readonly<PointLike>, maxDistance: number): number => {
  const length = Math.hypot(direction.x, direction.y);

  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(length) || length < 1e-9) {
    throw new RangeError('QueryEngine: ray origin must be finite and direction must be finite and non-zero.');
  }

  if (!(maxDistance >= 0)) {
    throw new RangeError('QueryEngine: ray maxDistance must be nonnegative.');
  }

  return length;
};

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

/** Options for {@link PhysicsWorld.shapeCast}. */
export interface ShapeCastOptions {
  /** Rotation of the cast shape in radians. It stays fixed for the whole motion. Default `0`. */
  readonly angle?: number | undefined;
  /** Which colliders the cast can hit, matched like a collider's own filter. Omitting it hits everything. */
  readonly filter?: QueryFilter | undefined;
  /** Let sensor colliders stop the cast. Default `false`: sensors never block motion. */
  readonly includeSensors?: boolean | undefined;
  /**
   * Bodies and colliders the cast passes through - typically the body whose
   * shape is being cast. A body excludes every collider it holds.
   */
  readonly exclude?: ReadonlyArray<PhysicsBody | Collider> | undefined;
}

/**
 * The first obstacle a {@link PhysicsWorld.shapeCast} meets. Pass one as `out`
 * to reuse it across casts.
 */
export interface ShapeCastHit {
  /** The blocking collider; a chain is reported as the chain, never as one of its edges. */
  collider: Collider;
  body: PhysicsBody;
  /** Fraction of the displacement travelled before contact, in `[0, 1]`. */
  fraction: number;
  /** Distance travelled before contact: `fraction` times the displacement's length. */
  distance: number;
  /** Unit surface normal at the contact, pointing from the obstacle back toward the cast shape. */
  normal: { x: number; y: number };
  /**
   * `true` when the shape already overlapped or touched the collider at its start
   * position. `fraction` and `distance` are then `0`, `normal` is the direction
   * that separates the shape from the collider, and {@link penetration} says
   * how deep the overlap is (`0` for a touch).
   */
  initialOverlap: boolean;
  /** Overlap depth at the start position; `0` unless {@link initialOverlap}. */
  penetration: number;
}

/** A proxy whose geometry a cast rewrites in place, so casting allocates nothing. */
interface CastProxy {
  shape: SolverShape;
  worldCenter: PointLike;
  worldVertices: number[];
  worldNormals: number[];
}

/**
 * Earliest blocking contact of a cast, written by {@link QueryEngine._castProxy}.
 * @internal
 */
export interface CastState {
  target: Collider | null;
  fraction: number;
  normalX: number;
  normalY: number;
  initialOverlap: boolean;
  penetration: number;
}

/**
 * Receives the contacts {@link QueryEngine._visitContacts} finds.
 * @internal
 */
export interface ContactVisitor {
  _visitContact(target: Collider, normalX: number, normalY: number, penetration: number): void;
}

/** @internal */
export const createCastState = (): CastState => ({
  target: null,
  fraction: 0,
  normalX: 0,
  normalY: 0,
  initialOverlap: false,
  penetration: 0,
});

const noCastOptions: ShapeCastOptions = Object.freeze({});

/**
 * How far along the motion a cast looks for a contact its start pose only
 * touches. Far below any tolerance the solver uses, far above the rounding of
 * world coordinates.
 */
const touchProbe = 1e-6;

const createCastProxy = (): CastProxy => ({
  shape: null as unknown as SolverShape,
  worldCenter: { x: 0, y: 0 },
  worldVertices: [],
  worldNormals: [],
});

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
  private readonly _castStart: CastProxy = createCastProxy();
  private readonly _castEnd: CastProxy = createCastProxy();
  private readonly _castBounds: AabbLike = createAabb();
  private readonly _castShifted: CastProxy = createCastProxy();
  private readonly _castNudged: CastProxy = createCastProxy();
  private readonly _castShiftedBounds: AabbLike = createAabb();
  private readonly _castCandidates: Collider[] = [];
  private readonly _castSweep: SweepHit = { t: 0, normalX: 0, normalY: 0 };
  private readonly _castManifold = new Manifold();
  private readonly _castFilter: CollisionFilter = { ...defaultFilter };
  private readonly _castState: CastState = createCastState();

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
   * Invoke `callback` for each collider whose AABB overlaps `bounds`. Allocation-free
   * when no filter is passed; a filter is normalised into one small object per call.
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

  /** Nearest ray hit, or `null`. Requires a finite origin, finite nonzero direction and nonnegative distance (or `Infinity`). */
  public rayCast(origin: Readonly<PointLike>, direction: Readonly<PointLike>, filter?: QueryFilter, maxDistance = Infinity): RayHit | null {
    const length = validateRay(origin, direction, maxDistance);

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

  /** All hits sorted by distance; clears `out` when given. Input requirements match {@link rayCast}; invalid input throws before clearing `out`. */
  public rayCastAll(
    origin: Readonly<PointLike>,
    direction: Readonly<PointLike>,
    filter?: QueryFilter,
    out?: RayHit[],
    maxDistance = Infinity,
  ): RayHit[] {
    const length = validateRay(origin, direction, maxDistance);

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

  /**
   * First collider `shape` meets when translated by `displacement` from
   * `position`, or `null` when the motion is free. See {@link PhysicsWorld.shapeCast}.
   */
  public shapeCast(
    shape: AnyShape,
    position: Readonly<PointLike>,
    displacement: Readonly<PointLike>,
    options: ShapeCastOptions = noCastOptions,
    out?: ShapeCastHit,
  ): ShapeCastHit | null {
    if (shape.type === 'segment' || shape.type === 'chain') {
      throw new TypeError(
        `PhysicsWorld.shapeCast: a ${shape.type} encloses no area and cannot be cast; cast a circle, capsule or polygon.`,
      );
    }

    const dx = displacement.x;
    const dy = displacement.y;

    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(dx) || !Number.isFinite(dy)) {
      throw new RangeError('PhysicsWorld.shapeCast: position and displacement must be finite.');
    }

    const start = this._castStart;

    fillProxy(shape, position.x, position.y, options.angle ?? 0, start);

    let filter: CollisionFilter | null = null;

    if (options.filter !== undefined) {
      filter = this._castFilter;
      filter.category = options.filter.category ?? defaultFilter.category;
      filter.mask = options.filter.mask ?? defaultFilter.mask;
      filter.group = options.filter.group ?? defaultFilter.group;
    }

    this._syncIndex();

    const state = this._castState;
    const bounds = proxyAabb(shape, start, this._scratchAabb);

    if (!this._castProxy(start, bounds, dx, dy, filter, options.includeSensors === true, null, options.exclude ?? null, state)) {
      return null;
    }

    const target = state.target!;
    const hit = out ?? {
      collider: target,
      body: target.body,
      fraction: 0,
      distance: 0,
      normal: { x: 0, y: 0 },
      initialOverlap: false,
      penetration: 0,
    };

    hit.collider = target;
    hit.body = target.body;
    hit.fraction = state.fraction;
    hit.distance = state.fraction * Math.hypot(dx, dy);
    hit.normal.x = state.normalX;
    hit.normal.y = state.normalY;
    hit.initialOverlap = state.initialOverlap;
    hit.penetration = state.penetration;

    return hit;
  }

  /** @internal - bring the spatial index up to date with moved colliders before a run of {@link _castProxy} calls. */
  public _syncIndex(): void {
    this._spatialIndex?.sync(this._colliders);
  }

  /**
   * @internal - {@link _castProxy} for one of a body's own colliders, displaced
   * by `(offsetX, offsetY)` from where it currently sits and filtered by its own
   * collision filter. Sensors never block it, and neither does anything in
   * `exclude`.
   */
  public _castCollider(
    collider: Collider,
    offsetX: number,
    offsetY: number,
    dx: number,
    dy: number,
    excludeBody: PhysicsBody,
    state: CastState,
    exclude: ReadonlyArray<PhysicsBody | Collider> | null = null,
  ): boolean {
    const start = this._prepareShiftedCollider(collider, offsetX, offsetY);

    return this._castProxy(start, this._castShiftedBounds, dx, dy, collider.filter, false, excludeBody, exclude, state);
  }

  /**
   * @internal - reports every collider that one of a body's own colliders,
   * displaced by `(offsetX, offsetY)`, overlaps or touches, under the same
   * rules as {@link _castCollider}. The normal passed to the visitor points
   * from the touched collider back towards the displaced one. Does not sync
   * the spatial index.
   */
  public _visitContacts(collider: Collider, offsetX: number, offsetY: number, excludeBody: PhysicsBody, visitor: ContactVisitor): void {
    const start = this._prepareShiftedCollider(collider, offsetX, offsetY);
    const bounds = this._castShiftedBounds;
    const manifold = this._castManifold;
    const candidates = this._spatialIndex === undefined ? this._colliders : this._spatialIndex.queryAabb(bounds, this._castCandidates);

    for (const candidate of candidates) {
      const target = authoredCollider(candidate);

      if (
        !aabbOverlap(bounds, candidate.aabb) ||
        castIgnores(target, collider.filter, false, excludeBody, null) ||
        !collide(start, candidate, manifold)
      ) {
        continue;
      }

      visitor._visitContact(target, -manifold.normalX, -manifold.normalY, deepestPenetration(manifold));
    }
  }

  private _prepareShiftedCollider(collider: Collider, offsetX: number, offsetY: number): CollisionProxy {
    const aabb = collider.aabb;
    const bounds = this._castShiftedBounds;

    bounds.minX = aabb.minX + offsetX;
    bounds.minY = aabb.minY + offsetY;
    bounds.maxX = aabb.maxX + offsetX;
    bounds.maxY = aabb.maxY + offsetY;

    if (offsetX === 0 && offsetY === 0) {
      return collider;
    }

    translateProxy(collider, offsetX, offsetY, this._castShifted);

    return this._castShifted;
  }

  /**
   * @internal - casts one proxy, given at its start pose with `bounds` as its
   * start AABB, along `(dx, dy)` and writes the earliest blocking contact into
   * `state`. Returns whether anything blocks. Does not sync the spatial index:
   * a caller casting several proxies against unchanged geometry calls
   * {@link _syncIndex} once first.
   *
   * `filter` is matched against each target's filter with the collision rule;
   * `null` matches everything. A target the proxy starts out overlapping
   * blocks only a motion that does not lead out of it, and blocks it at once,
   * so a shape touching a wall can still slide along it or move away.
   */
  public _castProxy(
    start: CollisionProxy,
    bounds: Readonly<AabbLike>,
    dx: number,
    dy: number,
    filter: CollisionFilter | null,
    includeSensors: boolean,
    excludeBody: PhysicsBody | null,
    exclude: ReadonlyArray<PhysicsBody | Collider> | null,
    state: CastState,
  ): boolean {
    const swept = this._castBounds;

    swept.minX = dx < 0 ? bounds.minX + dx : bounds.minX;
    swept.maxX = dx > 0 ? bounds.maxX + dx : bounds.maxX;
    swept.minY = dy < 0 ? bounds.minY + dy : bounds.minY;
    swept.maxY = dy > 0 ? bounds.maxY + dy : bounds.maxY;

    const moving = dx !== 0 || dy !== 0;
    const end = this._castEnd;
    const sweep = this._castSweep;

    const length = Math.hypot(dx, dy);
    const nudged = this._castNudged;

    if (moving) {
      translateProxy(start, dx, dy, end);
      translateProxy(start, (dx / length) * touchProbe, (dy / length) * touchProbe, nudged);
    }

    state.target = null;
    state.fraction = Infinity;
    state.normalX = 0;
    state.normalY = 0;
    state.initialOverlap = false;
    state.penetration = 0;

    const candidates = this._spatialIndex === undefined ? this._colliders : this._spatialIndex.queryAabb(swept, this._castCandidates);

    for (const candidate of candidates) {
      const target = authoredCollider(candidate);

      if (!aabbOverlap(swept, candidate.aabb) || castIgnores(target, filter, includeSensors, excludeBody, exclude)) {
        continue;
      }

      if (aabbOverlap(bounds, candidate.aabb) && this._startContact(start, nudged, candidate, target, moving, dx, dy, state)) {
        continue;
      }

      if (moving && state.fraction > 0 && sweepProxies(end, dx, dy, candidate, sweep) && sweep.t < state.fraction) {
        state.target = target;
        state.fraction = sweep.t;
        state.normalX = sweep.normalX;
        state.normalY = sweep.normalY;
      }
    }

    return state.target !== null;
  }

  /**
   * Decides a candidate the cast starts out overlapping or touching: records
   * it when the motion does not lead out of it and returns `true`, so the
   * sweep skips it either way. Returns `false` for a candidate the start pose
   * is clear of.
   */
  private _startContact(
    start: CollisionProxy,
    nudged: CollisionProxy,
    candidate: Collider,
    target: Collider,
    moving: boolean,
    dx: number,
    dy: number,
    state: CastState,
  ): boolean {
    const manifold = this._castManifold;
    let penetration = 0;

    if (collide(start, candidate, manifold)) {
      penetration = deepestPenetration(manifold);
    } else if (!moving || !collide(nudged, candidate, manifold)) {
      // Exactly touching is neither an overlap to the narrow phase nor an
      // entry to the sweep, so a shape resting flush against a wall would pass
      // through it. A contact that appears a hair further along the motion is
      // that touch.
      return false;
    }

    // The manifold normal points from the cast shape into the target, so its
    // negation is the direction that leads out of the contact.
    const normalX = -manifold.normalX;
    const normalY = -manifold.normalY;

    if (!moving || dx * normalX + dy * normalY < 0) {
      recordOverlap(state, target, penetration, normalX, normalY);
    }

    return true;
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

    return (
      pointSegmentDistanceSquared(px, py, spine[0]!, spine[1]!, spine[2]!, spine[3]!, _pointScratch) <=
      collider.shape.radius * collider.shape.radius
    );
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
const rayCastCapsule = (
  collider: Collider,
  radius: number,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxDistance: number,
): RayHit | null => {
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
  const proxy = createCastProxy();

  fillProxy(shape, x, y, angle, proxy);

  return proxy;
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

/** Writes a solver shape placed at `(x, y)` with `angle` into a reusable cast proxy. */
const fillProxy = (shape: SolverShape, x: number, y: number, angle: number, out: CastProxy): void => {
  const vertices = out.worldVertices;
  const normals = out.worldNormals;

  out.shape = shape;
  out.worldCenter.x = x;
  out.worldCenter.y = y;

  if (shape.type === 'circle') {
    vertices.length = 0;
    normals.length = 0;

    return;
  }

  const count = shape.type === 'polygon' ? shape.count : 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  vertices.length = count * 2;
  normals.length = count * 2;

  for (let i = 0; i < count * 2; i += 2) {
    const vx = shape.vertices[i]!;
    const vy = shape.vertices[i + 1]!;
    const nx = shape.normals[i]!;
    const ny = shape.normals[i + 1]!;

    vertices[i] = x + cos * vx - sin * vy;
    vertices[i + 1] = y + sin * vx + cos * vy;
    normals[i] = cos * nx - sin * ny;
    normals[i + 1] = sin * nx + cos * ny;
  }
};

/** Writes `source` translated by `(dx, dy)` into a reusable cast proxy; normals are translation-invariant. */
const translateProxy = (source: CollisionProxy, dx: number, dy: number, out: CastProxy): void => {
  const from = source.worldVertices;
  const fromNormals = source.worldNormals;
  const vertices = out.worldVertices;
  const normals = out.worldNormals;

  out.shape = source.shape as SolverShape;
  out.worldCenter.x = source.worldCenter.x + dx;
  out.worldCenter.y = source.worldCenter.y + dy;
  vertices.length = from.length;
  normals.length = from.length;

  for (let i = 0; i < from.length; i += 2) {
    vertices[i] = from[i]! + dx;
    vertices[i + 1] = from[i + 1]! + dy;
    normals[i] = fromNormals[i]!;
    normals[i + 1] = fromNormals[i + 1]!;
  }
};

/** `true` when a shape cast passes through `target` under the cast's own rules. */
const castIgnores = (
  target: Collider,
  filter: CollisionFilter | null,
  includeSensors: boolean,
  excludeBody: PhysicsBody | null,
  exclude: ReadonlyArray<PhysicsBody | Collider> | null,
): boolean =>
  (!includeSensors && target.isSensor) ||
  target.body === excludeBody ||
  (filter !== null && !shouldCollide(filter, target.filter)) ||
  (exclude !== null && (exclude.includes(target) || exclude.includes(target.body)));

const deepestPenetration = (manifold: Manifold): number => {
  const first = manifold.points[0].penetration;

  return manifold.pointCount > 1 ? Math.max(first, manifold.points[1].penetration) : first;
};

/** Keeps the deepest starting overlap a cast has met so far. */
const recordOverlap = (state: CastState, target: Collider, penetration: number, normalX: number, normalY: number): void => {
  if (state.initialOverlap && penetration <= state.penetration) {
    return;
  }

  state.target = target;
  state.fraction = 0;
  state.normalX = normalX;
  state.normalY = normalY;
  state.initialOverlap = true;
  state.penetration = penetration;
};
