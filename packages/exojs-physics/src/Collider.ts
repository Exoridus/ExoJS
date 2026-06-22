import type { Aabb } from './Aabb';
import { createAabb } from './Aabb';
import type { Mutable2D, Transform } from './math';
import { applyRotation, applyTransform, composeTransforms, createTransform } from './math';
import type { PhysicsBody } from './PhysicsBody';
import type { CircleShape } from './shapes/CircleShape';
import type { PolygonShape } from './shapes/PolygonShape';
import type { Shape } from './shapes/Shape';
import type { CollisionFilter, VectorLike } from './types';
import { resolveFilter } from './types';

/** Construction options for a collider. */
export interface ColliderOptions {
  /** The collision geometry. */
  shape: Shape;
  /** Density (mass per px²) for the owning body's mass; ignored for static/kinematic. Default `1`. */
  density?: number;
  /** Coulomb friction coefficient (used by the solver once dynamics ship). Default `0.2`. */
  friction?: number;
  /** Restitution / bounciness in `[0, 1]` (used by the solver once dynamics ship). Default `0`. */
  restitution?: number;
  /** When `true`, generates overlap events but no contact response. Default `false`. */
  isSensor?: boolean;
  /** Category/mask/group filter; partials merge over the defaults. */
  filter?: Partial<CollisionFilter>;
  /** Body-local offset of the shape origin. Default `(0, 0)`. */
  offset?: VectorLike;
  /** Body-local rotation of the shape in radians (compound colliders). Default `0`. */
  rotation?: number;
}

/**
 * Geometry attached to a {@link PhysicsBody}: a {@link Shape} plus a body-local
 * offset/rotation, material (friction/restitution/density) and a collision
 * filter. A body may own several colliders (compound). The collider also caches
 * its world-space geometry — refreshed by {@link synchronize} — which the broad
 * phase, narrow phase and queries read directly.
 *
 * Material fields and the filter are mutable; the shape and local placement are
 * immutable (rebuild the collider to change geometry).
 */
export class Collider {
  /** Stable id, assigned when the owning body joins a world (`-1` until then). */
  public readonly shape: Shape;
  public readonly offsetX: number;
  public readonly offsetY: number;
  public readonly localRotation: number;

  public density: number;
  public friction: number;
  public restitution: number;
  public isSensor: boolean;
  public readonly filter: CollisionFilter;

  private _id = -1;
  private _body: PhysicsBody | null = null;
  private readonly _localTransform: Transform;
  private readonly _worldTransform: Transform = createTransform();
  private readonly _aabb: Aabb = createAabb();
  private readonly _worldCenter: Mutable2D = { x: 0, y: 0 };
  private readonly _worldVertices: number[];
  private readonly _worldNormals: number[];

  private _destroyed = false;

  public constructor(options: ColliderOptions) {
    const density = options.density ?? 1;

    if (!Number.isFinite(density) || density < 0) {
      throw new RangeError(`Collider: density must be a non-negative finite number, received ${density}.`);
    }

    this.shape = options.shape;
    this.offsetX = options.offset?.x ?? 0;
    this.offsetY = options.offset?.y ?? 0;
    this.localRotation = options.rotation ?? 0;
    this.density = density;
    this.friction = options.friction ?? 0.2;
    this.restitution = options.restitution ?? 0;
    this.isSensor = options.isSensor ?? false;
    this.filter = resolveFilter(options.filter);
    this._localTransform = createTransform(this.offsetX, this.offsetY, this.localRotation);

    if (this.shape.type === 'polygon') {
      const polygon = this.shape as PolygonShape;
      this._worldVertices = new Array<number>(polygon.count * 2).fill(0);
      this._worldNormals = new Array<number>(polygon.count * 2).fill(0);
    } else {
      this._worldVertices = [];
      this._worldNormals = [];
    }
  }

  /** Stable id, assigned when the owning body joins a world via `world.add()`; `-1` until then. */
  public get id(): number {
    return this._id;
  }

  /**
   * The body this collider belongs to. `null` until the collider has been added
   * to a body that has joined a world (free-standing colliders have no body yet).
   */
  public get body(): PhysicsBody {
    if (this._body === null) {
      throw new Error('Collider: this collider has not been attached to a body in a world yet.');
    }

    return this._body;
  }

  /** The collider's world AABB (valid after the latest {@link synchronize}). */
  public get aabb(): Readonly<Aabb> {
    return this._aabb;
  }

  /** The collider's world transform (offset/rotation composed with the body's). */
  public get worldTransform(): Readonly<Transform> {
    return this._worldTransform;
  }

  /** The collider's body-local transform (offset + local rotation). */
  public get localTransform(): Readonly<Transform> {
    return this._localTransform;
  }

  /** World-space circle centre (only meaningful for circle shapes). */
  public get worldCenter(): Readonly<Mutable2D> {
    return this._worldCenter;
  }

  /** World-space polygon vertices `[x0, y0, …]` (only meaningful for polygon shapes). */
  public get worldVertices(): readonly number[] {
    return this._worldVertices;
  }

  /** World-space polygon outward normals `[x0, y0, …]` (only meaningful for polygon shapes). */
  public get worldNormals(): readonly number[] {
    return this._worldNormals;
  }

  /** `true` after the owning world has destroyed this collider. */
  public get destroyed(): boolean {
    return this._destroyed;
  }

  /**
   * Recompute the cached world geometry from the body's transform. Called by the
   * body on `setTransform`, on collider creation, and by the world before each
   * detection pass.
   */
  public synchronize(bodyTransform: Transform): void {
    const world = composeTransforms(bodyTransform, this._localTransform, this._worldTransform);

    if (this.shape.type === 'circle') {
      const radius = (this.shape as CircleShape).radius;

      this._worldCenter.x = world.x;
      this._worldCenter.y = world.y;
      this._aabb.minX = world.x - radius;
      this._aabb.minY = world.y - radius;
      this._aabb.maxX = world.x + radius;
      this._aabb.maxY = world.y + radius;

      return;
    }

    const polygon = this.shape as PolygonShape;
    const local = polygon.vertices;
    const normals = polygon.normals;
    const out: Mutable2D = { x: 0, y: 0 };
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < polygon.count; i++) {
      applyTransform(world, local[i * 2], local[i * 2 + 1], out);
      this._worldVertices[i * 2] = out.x;
      this._worldVertices[i * 2 + 1] = out.y;
      minX = out.x < minX ? out.x : minX;
      minY = out.y < minY ? out.y : minY;
      maxX = out.x > maxX ? out.x : maxX;
      maxY = out.y > maxY ? out.y : maxY;

      applyRotation(world, normals[i * 2], normals[i * 2 + 1], out);
      this._worldNormals[i * 2] = out.x;
      this._worldNormals[i * 2 + 1] = out.y;
    }

    this._aabb.minX = minX;
    this._aabb.minY = minY;
    this._aabb.maxX = maxX;
    this._aabb.maxY = maxY;
  }

  /** @internal — bind this collider to its body and id (called when the body joins a world). */
  public _attach(body: PhysicsBody, id: number): void {
    this._body = body;
    this._id = id;
  }

  /** Internal: mark destroyed (called by the world). */
  public _markDestroyed(): void {
    this._destroyed = true;
  }
}
