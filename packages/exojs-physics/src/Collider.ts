import type { AabbLike, PointLike } from '@codexo/exojs';

import { createAabb } from './Aabb';
import type { Transform } from './math';
import { applyRotation, applyTransform, composeTransforms, createTransform } from './math';
import type { PhysicsBody } from './PhysicsBody';
import type { AnyShape } from './shapes/AnyShape';
import type { ChainShape } from './shapes/ChainShape';
import type { CollisionFilter } from './types';
import { resolveFilter } from './types';

/** Number of world-space vertices a shape kind caches on its collider. */
const worldVertexCount = (shape: AnyShape): number => {
  switch (shape.type) {
    case 'polygon':
      return shape.count;
    case 'capsule':
    case 'segment':
      // Two endpoints. Both are a two-vertex ring, with and without a radius.
      return 2;
    case 'circle':
    case 'chain':
      // A chain caches nothing of its own: its geometry lives on the per-edge
      // child proxies, and its AABB is the union of theirs.
      return 0;
  }
};

/** Construction options for a collider. */
export interface ColliderOptions {
  /** The collision geometry. */
  shape: AnyShape;
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
  offset?: Readonly<PointLike>;
  /** Body-local rotation of the shape in radians (compound colliders). Default `0`. */
  rotation?: number;
}

/**
 * Geometry attached to a {@link PhysicsBody}: a {@link Shape} plus a body-local
 * offset/rotation, material (friction/restitution/density) and a collision
 * filter. A body may own several colliders (compound). The collider also caches
 * its world-space geometry - refreshed by {@link synchronize} - which the broad
 * phase, narrow phase and queries read directly.
 *
 * Material fields and the filter are mutable; the shape and local placement are
 * immutable (rebuild the collider to change geometry).
 */
export class Collider {
  /** Stable id, assigned when the owning body joins a world (`-1` until then). */
  public readonly shape: AnyShape;
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
  private readonly _chainEdges: readonly Collider[] | null;
  private _chainParent: Collider | null = null;
  private readonly _localTransform: Transform;
  private readonly _worldTransform: Transform = createTransform();
  private readonly _aabb: AabbLike = createAabb();
  private readonly _worldCenter: PointLike = { x: 0, y: 0 };
  // Reused per-vertex scratch for synchronize()'s polygon transform loop so a
  // collider sync allocates nothing. Instance-private: never held across the
  // call, never aliased between colliders.
  private readonly _syncScratch: PointLike = { x: 0, y: 0 };
  private readonly _worldVertices: number[];
  private readonly _worldNormals: number[];

  private _destroyed = false;

  /**
   * @internal - proxy id in the physics world's broad-phase spatial tree; `-1`
   * when not inserted. Like `PhysicsBody._islandIndex`/`_sleepTime`, this is a
   * single-owner slot: exactly ONE `AabbTreeBroadPhase` may track this collider
   * at a time (in production, the world's own broad phase for the collider's
   * whole lifetime). A second broad phase over the same collider would clobber
   * this value and corrupt the first's tree - never do that.
   */
  public _treeProxy = -1;

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

    const vertexCount = worldVertexCount(this.shape);

    this._worldVertices = new Array<number>(vertexCount * 2).fill(0);
    this._worldNormals = new Array<number>(vertexCount * 2).fill(0);
    this._chainEdges = this.shape.type === 'chain' ? this._buildChainEdges(this.shape) : null;
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
  public get aabb(): Readonly<AabbLike> {
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
  public get worldCenter(): Readonly<PointLike> {
    return this._worldCenter;
  }

  /** World-space polygon vertices `[x0, y0, ...]` (only meaningful for polygon shapes). */
  public get worldVertices(): readonly number[] {
    return this._worldVertices;
  }

  /** World-space polygon outward normals `[x0, y0, ...]` (only meaningful for polygon shapes). */
  public get worldNormals(): readonly number[] {
    return this._worldNormals;
  }

  /**
   * @internal - the engine-owned edge proxies a chain collider fans out into,
   * one per chain edge; `null` for every other shape. They are what the broad
   * phase, the narrow phase and the solver see, so a chain contact reuses the
   * one-manifold-per-pair model unchanged. They are never part of
   * `body.colliders`, `world.colliders` or any query result - the authored
   * collider is the public identity of every contact they produce.
   */
  public get chainEdges(): readonly Collider[] | null {
    return this._chainEdges;
  }

  /** @internal - the authored chain collider this edge proxy belongs to; `null` for an authored collider. */
  public get chainParent(): Collider | null {
    return this._chainParent;
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

    switch (this.shape.type) {
      case 'circle':
        this._synchronizeCircle(world, this.shape.radius);
        break;
      case 'capsule':
        // A capsule is a two-vertex ring plus a radius, so it rides the polygon
        // path and only the AABB inflation differs.
        this._synchronizePolygon(world, this.shape.vertices, this.shape.normals, 2, this.shape.radius);
        break;
      case 'segment':
        this._synchronizePolygon(world, this.shape.vertices, this.shape.normals, 2, 0);
        break;
      case 'polygon':
        this._synchronizePolygon(world, this.shape.vertices, this.shape.normals, this.shape.count, 0);
        break;
      case 'chain':
        this._synchronizeChain(bodyTransform);
        break;
    }
  }

  /**
   * A chain's world geometry is its edge proxies': each of them shares the
   * chain's local placement and syncs its own two endpoints, and the chain's own
   * AABB is their union. Nothing is transformed twice, and no proxy is rebuilt.
   */
  private _synchronizeChain(bodyTransform: Transform): void {
    const edges = this._chainEdges!;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const edge of edges) {
      edge.synchronize(bodyTransform);

      const aabb = edge.aabb;

      minX = aabb.minX < minX ? aabb.minX : minX;
      minY = aabb.minY < minY ? aabb.minY : minY;
      maxX = aabb.maxX > maxX ? aabb.maxX : maxX;
      maxY = aabb.maxY > maxY ? aabb.maxY : maxY;
    }

    this._aabb.minX = minX;
    this._aabb.minY = minY;
    this._aabb.maxX = maxX;
    this._aabb.maxY = maxY;
  }

  /** A circle is its transformed centre; the local vertex buffers stay unused. */
  private _synchronizeCircle(world: Transform, radius: number): void {
    this._worldCenter.x = world.x;
    this._worldCenter.y = world.y;
    this._aabb.minX = world.x - radius;
    this._aabb.minY = world.y - radius;
    this._aabb.maxX = world.x + radius;
    this._aabb.maxY = world.y + radius;
  }

  /**
   * Transform a local vertex/normal ring into the world buffers and take the
   * AABB while doing it. `radius` inflates the box for a rounded outline (a
   * capsule's spine); it is `0` for a plain polygon.
   */
  private _synchronizePolygon(world: Transform, local: readonly number[], normals: readonly number[], count: number, radius: number): void {
    const out = this._syncScratch;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let i = 0; i < count; i++) {
      applyTransform(world, local[i * 2]!, local[i * 2 + 1]!, out);
      this._worldVertices[i * 2] = out.x;
      this._worldVertices[i * 2 + 1] = out.y;
      minX = out.x < minX ? out.x : minX;
      minY = out.y < minY ? out.y : minY;
      maxX = out.x > maxX ? out.x : maxX;
      maxY = out.y > maxY ? out.y : maxY;

      applyRotation(world, normals[i * 2]!, normals[i * 2 + 1]!, out);
      this._worldNormals[i * 2] = out.x;
      this._worldNormals[i * 2 + 1] = out.y;
    }

    this._aabb.minX = minX - radius;
    this._aabb.minY = minY - radius;
    this._aabb.maxX = maxX + radius;
    this._aabb.maxY = maxY + radius;
  }

  /** @internal - bind this collider to its body and id (called when the body joins a world). */
  public _attach(body: PhysicsBody, id: number): void {
    this._body = body;
    this._id = id;
  }

  /**
   * Fan a chain out into one proxy per edge. Each proxy carries the chain's own
   * local placement, so it needs no transform of its own, and its shape carries
   * the adjacency that keeps a body from snagging at a shared vertex.
   */
  private _buildChainEdges(chain: ChainShape): readonly Collider[] {
    const edges: Collider[] = [];

    for (const edgeShape of chain.edges) {
      const edge = new Collider({
        shape: edgeShape,
        offset: { x: this.offsetX, y: this.offsetY },
        rotation: this.localRotation,
        // Material, filter and sensor flag stay mutable on the authored collider
        // and are read from there per pass, so copying them here would only add a
        // second, staler source of truth.
        density: 0,
      });

      edge._chainParent = this;
      edges.push(edge);
    }

    return edges;
  }

  /** @internal - mark destroyed (called by the world). */
  public _markDestroyed(): void {
    this._destroyed = true;

    if (this._chainEdges !== null) {
      for (const edge of this._chainEdges) {
        edge._destroyed = true;
      }
    }
  }
}

/**
 * The authored collider a contact, query hit or sweep target belongs to: the
 * collider itself, or the chain it is an engine-owned edge proxy of. Every
 * public identity - events, query results, the contact modifier - goes through
 * this, so a solver-side partition never reaches a caller.
 *
 * @internal
 */
export const authoredCollider = (collider: Collider): Collider => collider.chainParent ?? collider;
