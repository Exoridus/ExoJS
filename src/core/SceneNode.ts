import type { AbstractVector } from '#math/AbstractVector';
import { Bounds } from '#math/Bounds';
import type { Circle } from '#math/Circle';
import {
  getCollisionSat,
  intersectionLineRect,
  intersectionPointRect,
  intersectionRectCircle,
  intersectionRectEllipse,
  intersectionSat,
} from '#math/Collision';
import { intersectionRectRect } from '#math/collisionPrimitives';
import type { Collidable, CollisionResponse } from '#math/collisionTypes';
import { CollisionType } from '#math/collisionTypes';
import type { Ellipse } from '#math/Ellipse';
import { Flags } from '#math/Flags';
import { Interval } from '#math/Interval';
import type { Line } from '#math/Line';
import { Matrix } from '#math/Matrix';
import { ObservableVector } from '#math/ObservableVector';
import { Polygon } from '#math/Polygon';
import type { ReadonlyRectangle } from '#math/Rectangle';
import { Rectangle } from '#math/Rectangle';
import type { RectangleLike } from '#math/RectangleLike';
import { degreesToRadians, trimRotation } from '#math/utils';
import { Vector } from '#math/Vector';
import type { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import type { View } from '#rendering/View';

import { DirtyChannel, nodeDirtyIndex } from './nodeDirtyIndex';
import { nextNodeRevision, NodeRevision } from './NodeRevision';
import type { Stage } from './Stage';

// Internal: dirty-flag bits used by SceneNode's transform cache.
// Was previously exposed publicly as `TransformableFlags`. Inlined here
// during the 0.5.0 hierarchy slice to remove a single-purpose public
// abstraction. Not exported from any barrel.
enum SceneNodeTransformFlags {
  None = 0,
  Translation = 1 << 0,
  Rotation = 1 << 1,
  Scaling = 1 << 2,
  Origin = 1 << 3,
  Skew = 1 << 5,
  Transform = SceneNodeTransformFlags.Translation |
    SceneNodeTransformFlags.Rotation |
    SceneNodeTransformFlags.Scaling |
    SceneNodeTransformFlags.Origin |
    SceneNodeTransformFlags.Skew,
  TransformInverse = 1 << 4,
  GlobalTransform = 1 << 8, // own _globalTransform is stale
  BoundsRect = 1 << 9, // own _bounds is stale
}

/**
 * Which reactive vector fired a change, so a single `_onObservableChange`
 * handler can route to the right dirty path without each vector carrying a
 * bound closure (4 fewer allocations per node). Shared with {@link Drawable},
 * which owns the `Anchor` channel; the values are a single namespace so a
 * node's vectors can never collide.
 * @internal
 */
export enum SceneNodeVectorChannel {
  Position,
  Scale,
  Origin,
  Anchor,
}

/** Shared scratch for the four oriented corners - written then copied into a node's polygon (single-threaded). */
const orientedCorners = [new Vector(), new Vector(), new Vector(), new Vector()];

/**
 * Process-wide dirty-walk epoch. Advanced by EVERY consumer read of a
 * node revision ({@link SceneNode._contentRevision}/`_structureRevision` -
 * plan builds read them, so each build starts a fresh epoch implicitly and
 * any extra read only bumps more often, which is the conservative direction:
 * more bumps mean more full walks, never a missed one). Within one epoch,
 * repeated up-walks over an already-stamped ancestor chain early-out - see
 * {@link SceneNode._markContentDirty}. Starts at 1 so the initial per-node
 * epoch stamps (0) are never spuriously "current".
 */
let dirtyWalkEpoch = 1;

/**
 * Process-wide count of live transform-group boundaries ({@link RetainedContainer}).
 * The transform-move seam ({@link SceneNode._notifyEnclosingRetainedGroup})
 * walks to the nearest boundary on EVERY own-transform mutation; when no boundary
 * exists anywhere (the common case - most scenes use no RetainedContainer) that
 * walk would run to the root for nothing. Gating on this count makes the seam O(1)
 * for boundary-free scenes. Maintained by RetainedContainer's construct/destroy via
 * {@link registerTransformGroupBoundary}/{@link unregisterTransformGroupBoundary}.
 *
 * Invariant: this must never UNDER-count (a missed enqueue is a stale-render bug),
 * so it counts from construction - a boundary that is constructed but never attached
 * only makes the seam over-walk (correctness-safe), and a skipped destroy keeps the
 * count high (also safe).
 */
let transformGroupBoundaryCount = 0;

/** @internal - a transform-group boundary was created; arm the transform-move seam. */
export const registerTransformGroupBoundary = (): void => {
  transformGroupBoundaryCount++;
};

/** @internal - a transform-group boundary was destroyed; disarm if it was the last. */
export const unregisterTransformGroupBoundary = (): void => {
  if (transformGroupBoundaryCount > 0) {
    transformGroupBoundaryCount--;
  }
};

/**
 * Live automatic render-root representations, the render-root counterpart of
 * {@link transformGroupBoundaryCount}. A root's recorded rows are patched by the
 * same seam, but a root is NOT a transform-group boundary, so the boundary count
 * alone would leave the walk short-circuited for a scene that has no group at
 * all - which is exactly the scene the automatic representation exists for.
 *
 * Same never-under-count invariant: counted from representation creation, so an
 * over-count only makes the seam over-walk.
 */
let retainedRenderRootCount = 0;

/** @internal - a render root created its representation; arm the transform-move seam. */
export const registerRetainedRenderRoot = (): void => {
  retainedRenderRootCount++;
};

/** @internal - a render root released its representation; disarm if it was the last. */
export const unregisterRetainedRenderRoot = (): void => {
  if (retainedRenderRootCount > 0) {
    retainedRenderRootCount--;
  }
};

/**
 * Sentinel `parentVersion` used by {@link SceneNode.getGlobalTransform} when
 * NOTHING above this node contributes to its world matrix - the node is a
 * root, or its parent is an engaged transform-group boundary the node does not
 * escape. It is deliberately outside the range
 * of every real `_globalTransformVersion` (which starts at 1 and only
 * increments), so a boundary flip that later reads a real, still-unresolved
 * parent version can never false-match a child that previously cached this
 * sentinel - independent of the order in which the parent transform and the
 * parent version are read. Do NOT change this to a value a real version can
 * take (e.g. 0 once versions also started at 0), or the collision returns.
 */
const NO_PARENT_VERSION = 0;

/**
 * Transform-bearing leaf in the scene-graph hierarchy. Carries position,
 * rotation, scale, skew and origin. Implements {@link Collidable} so any node
 * can participate directly in the SAT collision pipeline via its AABB or
 * rotated/skewed quad.
 *
 * The normalized `anchor` convenience that derives `origin` from a layout box
 * lives on {@link Drawable}: it needs a box to measure, which a node that
 * carries no geometry of its own does not have.
 *
 * Transform state is dirty-flag-cached: position/rotation/scale/skew/origin
 * mutations invalidate the local transform; either kind of mutation also
 * invalidates the global transform (own + descendants) and the bounds rect
 * for this node and every {@link Container} ancestor up the parent chain.
 * The caches rebuild lazily on the next read.
 *
 * Collision and hit-testing take the cheaper AABB path when the node's *world*
 * box is axis-aligned (its own and any inherited rotation compose to a multiple
 * of 90° with no skew) and the oriented-quad SAT path otherwise. The public
 * `isAlignedBox` getter reports that predicate for this node's own rotation only.
 *
 * `_invalidate*` methods are exported as `public` for friend-class access
 * from {@link Container} and {@link InteractionSystem}; treat them as
 * implementation detail, not public API.
 *
 * Subclasses: {@link Container} (carries children), {@link RenderNode}
 * (carries draw payloads).
 */
export class SceneNode implements Collidable {
  public readonly collisionType: CollisionType = CollisionType.SceneNode;

  public readonly flags: Flags<SceneNodeTransformFlags> = new Flags<SceneNodeTransformFlags>(
    SceneNodeTransformFlags.Transform | SceneNodeTransformFlags.GlobalTransform | SceneNodeTransformFlags.BoundsRect,
  );

  private readonly _nodeRevision: NodeRevision = new NodeRevision();

  protected _bounds = new Bounds();
  protected _transform: Matrix = new Matrix();
  protected _position: ObservableVector = new ObservableVector(this, SceneNodeVectorChannel.Position, 0, 0);
  protected _scale: ObservableVector = new ObservableVector(this, SceneNodeVectorChannel.Scale, 1, 1);
  protected _origin: ObservableVector = new ObservableVector(this, SceneNodeVectorChannel.Origin, 0, 0);
  protected _rotation = 0;
  protected _skewX = 0;
  protected _skewY = 0;
  protected _sin = 0;
  protected _cos = 1;

  /** Per-Application service bundle, propagated on attach. @internal */
  protected _stage: Stage | null = null;

  private _visible = true;
  private _globalTransform = new Matrix();
  /**
   * World-transform cache for nodes below a transform-group boundary - see
   * {@link getWorldTransform}. Lazily allocated: nodes that never sit inside a
   * {@link RetainedContainer} pay only the null field.
   */
  private _worldTransform: Matrix | null = null;
  /**
   * Stamp identifying the current content AND identity of the matrix returned
   * by {@link getWorldTransform}. Consumers caching a composition against this
   * node's world matrix compare the stamp instead of the matrix contents.
   *
   * Stamps are drawn from {@link nextNodeRevision} (a
   * process-wide monotonic counter starting at 1), never from the small
   * per-node `_globalTransformVersion` sequence, so a source flip between the
   * delegated path (world === global) and the composed path can never produce
   * a false-clean version collision. `0` uniquely means "never computed".
   */
  private _worldStamp = 0;
  /** Whether the last {@link getWorldTransform} call took the delegated (world === global) path. */
  private _worldDelegatesToGlobal = false;
  /** `_globalTransformVersion` last observed by the delegated path (stamp bookkeeping only). */
  private _worldSyncedGlobalVersion = -1;
  /** `_globalTransformVersion` the composed `_worldTransform` was built from. */
  private _worldOwnVersion = -1;
  /** Boundary ancestor the composed `_worldTransform` was built against. */
  private _worldAnchor: SceneNode | null = null;
  /** That anchor's `_worldStamp` at build time. */
  private _worldAnchorStamp = -1;
  /**
   * Monotonic counter bumped every time {@link getGlobalTransform} actually
   * recomputes this node's world matrix. Children compare the parent's version
   * against their cached {@link _combinedParentVersion} to detect - lazily, on
   * read - that an ancestor moved without an eager subtree walk. `protected` so
   * derived caches that also depend on the world transform (e.g. Sprite's quad
   * vertices/normals) can invalidate against it the same way {@link getBounds}
   * does via {@link _boundsBuiltAtVersion}.
   *
   * Starts at 1, never 0: {@link NO_PARENT_VERSION} reserves 0 as the
   * no-parent-contribution sentinel, so a real version can never collide with
   * it. The initial value is otherwise irrelevant - the first
   * {@link getGlobalTransform} recompute increments it, and every consumer
   * compares against a `-1` "unset" of its own.
   */
  protected _globalTransformVersion = 1;
  private _combinedParentVersion = -1;
  private _boundsBuiltAtVersion = -1;
  /**
   * The node's local extent. `protected`, not `private`, for the ONE subclass
   * pattern the invalidating writers below cannot serve: a subclass that
   * recomputes its extent lazily from inside its own {@link getLocalBounds}
   * override. Such an override must write this rectangle directly - routing it
   * through {@link setLocalBounds} would cascade an invalidation on every
   * read, which re-dirties the node once per frame and defeats the retained
   * static-subtree skip. Every other writer belongs in {@link setLocalBounds}.
   */
  protected readonly _localBounds = new Rectangle();
  private _parentNode: Container | null = null;
  private _zIndex = 0;
  private _cullable = true;
  private _cullArea: Rectangle | null = null;
  private _isDestroyed = false;
  /** Lazily-built oriented bounding box (the local bounds under the global transform) for rotated-node SAT. */
  private _orientedBounds: Polygon | null = null;

  /**
   * Optional human-readable identity for this node. Defaults to `null`.
   *
   * Purely a label the engine never interprets: useful for debugging,
   * find-by-name lookups, prefab references, and as a stable key when merging
   * serialized state back onto an existing tree. Not required to be unique.
   */
  public name: string | null = null;

  public get position(): ObservableVector {
    return this._position;
  }

  public set position(position: AbstractVector) {
    this._position.copy(position);
  }

  public get x(): number {
    return this._position.x;
  }

  public set x(x: number) {
    this._position.x = x;
  }

  public get y(): number {
    return this._position.y;
  }

  public set y(y: number) {
    this._position.y = y;
  }

  /** Rotation angle in degrees. Wraps via `trimRotation` on assignment. */
  public get rotation(): number {
    return this._rotation;
  }

  public set rotation(rotation: number) {
    this.setRotation(rotation);
  }

  public get scale(): ObservableVector {
    return this._scale;
  }

  public set scale(scale: AbstractVector) {
    this._scale.copy(scale);
  }

  public get origin(): ObservableVector {
    return this._origin;
  }

  public set origin(origin: AbstractVector) {
    this._origin.copy(origin);
  }

  public get parent(): Container | null {
    return this._parentNode;
  }

  /**
   * Set this node's parent without going through {@link Container.addChild}.
   * @internal
   */
  public _setParent(parent: Container | null): void {
    this._parentNode = parent;
  }

  /**
   * `true` once {@link destroy} has run on this node. A destroyed node has
   * released its pooled resources (transform/bounds), has been unlinked from
   * its parent, renders nothing, and must not be reused or re-attached. The
   * render plan skips a destroyed node, so even one handed straight to a
   * renderer as a detached root contributes nothing.
   */
  public get destroyed(): boolean {
    return this._isDestroyed;
  }

  public get visible(): boolean {
    return this._visible;
  }

  public set visible(visible: boolean) {
    if (this._visible !== visible) {
      this._visible = visible;
      this._markStructureDirty();
      // A container folds in only its VISIBLE children, so flipping this bit
      // changes every ancestor's aggregate extent. Without the bounds cascade
      // the cached ancestor rect survives the change: a re-shown subtree keeps
      // the shrunken rect, the container fails the viewport intersection, and
      // the whole subtree stops rendering even though it is visible again.
      this._invalidateBoundsFlags();
    }
  }

  public get zIndex(): number {
    return this._zIndex;
  }

  public set zIndex(zIndex: number) {
    if (this._zIndex !== zIndex) {
      this._zIndex = zIndex;
      this._parentNode?._invalidatePaintOrder();
      this._markContentDirty();
    }
  }

  /**
   * When `false`, this node is never culled by the viewport check and is
   * always considered in-view. Defaults to `true`.
   */
  public get cullable(): boolean {
    return this._cullable;
  }

  public set cullable(cullable: boolean) {
    if (this._cullable !== cullable) {
      this._cullable = cullable;
      this._markStructureDirty();
    }
  }

  /**
   * Custom rectangle used for viewport cull intersection test.
   * When set, replaces the default node bounds in cull checks.
   * Set to `null` to restore default bounds-based culling.
   */
  public get cullArea(): Rectangle | null {
    return this._cullArea;
  }

  public set cullArea(rect: Rectangle | null) {
    if (this._cullArea !== rect) {
      this._cullArea = rect;
      this._markStructureDirty();
    }
  }

  /**
   * Horizontal skew angle in degrees. Shears the node along the X axis
   * (positive values lean the top edge right). Combines correctly with
   * rotation and scale.
   */
  public get skewX(): number {
    return this._skewX;
  }

  public set skewX(degrees: number) {
    if (this._skewX !== degrees) {
      this._skewX = degrees;
      this._setSkewDirty();
    }
  }

  /**
   * Vertical skew angle in degrees. Shears the node along the Y axis
   * (positive values lean the left edge downward). Combines correctly with
   * rotation and scale.
   */
  public get skewY(): number {
    return this._skewY;
  }

  public set skewY(degrees: number) {
    if (this._skewY !== degrees) {
      this._skewY = degrees;
      this._setSkewDirty();
    }
  }

  public get isAlignedBox(): boolean {
    return this.rotation % 90 === 0 && this._skewX === 0 && this._skewY === 0;
  }

  public setPosition(x: number, y: number = x): this {
    this._position.set(x, y);

    return this;
  }

  public setRotation(degrees: number): this {
    const rotation = trimRotation(degrees);

    if (this._rotation !== rotation) {
      this._rotation = rotation;
      this._setRotationDirty();
    }

    return this;
  }

  public setScale(x: number, y: number = x): this {
    this._scale.set(x, y);

    return this;
  }

  public setSkew(x: number, y: number = x): this {
    this.skewX = x;
    this.skewY = y;

    return this;
  }

  public setOrigin(x: number, y: number = x): this {
    this._origin.set(x, y);

    return this;
  }

  public move(x: number, y: number): this {
    return this.setPosition(this.x + x, this.y + y);
  }

  public rotate(degrees: number): this {
    return this.setRotation(this._rotation + degrees);
  }

  public getTransform(): Matrix {
    if (this.flags.hasMask(SceneNodeTransformFlags.Transform)) {
      this.updateTransform();
      this.flags.removeMask(SceneNodeTransformFlags.Transform);
    }

    return this._transform;
  }

  public updateTransform(): this {
    if (this.flags.hasMask(SceneNodeTransformFlags.Rotation)) {
      const radians = degreesToRadians(this._rotation);

      this._cos = Math.cos(radians);
      this._sin = Math.sin(radians);
    }

    if (this.flags.hasMask(SceneNodeTransformFlags.Rotation | SceneNodeTransformFlags.Scaling | SceneNodeTransformFlags.Skew)) {
      const { x, y } = this._scale;

      if (this._skewX !== 0 || this._skewY !== 0) {
        const shearX = Math.tan(degreesToRadians(this._skewX));
        const shearY = Math.tan(degreesToRadians(this._skewY));

        this._transform.a = x * this._cos + shearX * this._sin;
        this._transform.b = y * this._sin + shearY * this._cos;
        this._transform.c = -x * this._sin + shearX * this._cos;
        this._transform.d = -shearY * this._sin + y * this._cos;
      } else {
        this._transform.a = x * this._cos;
        this._transform.b = y * this._sin;
        this._transform.c = -x * this._sin;
        this._transform.d = y * this._cos;
      }
    }

    if (this._rotation || this._skewX !== 0 || this._skewY !== 0) {
      const { x, y } = this._origin;

      this._transform.x = x * -this._transform.a - y * this._transform.b + this._position.x;
      this._transform.y = x * -this._transform.c - y * this._transform.d + this._position.y;
    } else {
      this._transform.x = this._origin.x * -this._scale.x + this._position.x;
      this._transform.y = this._origin.y * -this._scale.y + this._position.y;
    }

    return this;
  }

  /**
   * This node's untransformed extent in its own local coordinate space.
   *
   * Returns the LIVE internal rectangle, not a copy: it is read on hot paths
   * ({@link updateBounds} re-reads it on every transform-dirty recompute, i.e.
   * potentially every frame for a moving node), so copying it here would add a
   * per-frame allocation. It is therefore typed as a {@link ReadonlyRectangle}
   * - reads are unchanged, writes are rejected at compile time.
   *
   * Writing to it directly would skip the bounds/content invalidation the
   * engine needs, leaving culling, hit-testing and retained render fragments on
   * a stale extent. A custom {@link Drawable} that owns its own size sets it
   * through {@link setLocalBounds}, which writes and invalidates in one step.
   */
  public getLocalBounds(): ReadonlyRectangle {
    return this._localBounds;
  }

  /**
   * Write this node's local extent and run the bounds invalidation the change
   * implies - the node's own bounds flag, the ancestor bounds cascade, and the
   * content-dirty stamp that keeps retained fragments from replaying the old
   * extent.
   *
   * This is the only supported way to resize a node from outside
   * {@link getLocalBounds}; the rectangle itself is handed out read-only so the
   * invalidation cannot be forgotten. Built-in drawables (Sprite, Text,
   * BitmapText, Mesh, ...) and custom ones alike go through here.
   *
   * Part of the renderer SDK contract for extension renderers.
   */
  public setLocalBounds(x: number, y: number, width: number, height: number): this {
    this._localBounds.set(x, y, width, height);
    this._invalidateBoundsCascade();

    return this;
  }

  /**
   * Axis-aligned bounding box of this node in its GLOBAL-transform space.
   * That is world space for ordinary nodes, but GROUP-LOCAL space for nodes
   * inside an engaged {@link RetainedContainer} transform group (the group
   * matrix is applied on the GPU, not here) - this is deliberate and matches
   * the rendering convention. For a true world-space extent of such a node,
   * lift this rect by the group's {@link getWorldTransform} matrix.
   *
   * Pass `out` to receive a copy you own. Without it the return value is this
   * node's **cached** rectangle, rebuilt in place whenever the transform or
   * the local extent changes - retaining it across frames hands you a value
   * that silently moves. The cache is why the no-arg form does not allocate:
   * this runs per node per frame for culling and hit-testing.
   */
  public getBounds(out?: Rectangle): Rectangle {
    this.getGlobalTransform(); // ensures this node's own _globalTransformVersion is current

    if (this.flags.hasMask(SceneNodeTransformFlags.BoundsRect) || this._boundsBuiltAtVersion !== this._globalTransformVersion) {
      this.updateBounds();
      this.flags.removeMask(SceneNodeTransformFlags.BoundsRect);
      this._boundsBuiltAtVersion = this._globalTransformVersion;
    }

    const bounds = this._bounds.getRect();

    return out === undefined ? bounds : out.copy(bounds);
  }

  public updateBounds(): this {
    this._bounds.reset().addRect(this.getLocalBounds(), this.getGlobalTransform());

    return this;
  }

  public updateParentTransform(): this {
    if (this._parentNode) {
      this._parentNode.updateParentTransform();
    }

    this.updateTransform();

    return this;
  }

  /**
   * `true` on transform-group boundary nodes ({@link RetainedContainer}):
   * descendants combine against identity instead of this node's world matrix,
   * so their global transforms are group-relative.
   * A getter, not a field, read live on every seam evaluation below:
   * subclasses may flip it at runtime, and descendants pick a flip up lazily
   * through the parent-version compare.
   *
   * Part of the scene-graph SDK contract for extension packages that walk
   * node ancestry.
   */
  public get _isTransformGroupBoundary(): boolean {
    return false;
  }

  /**
   * Whether this node opts back OUT of a parent transform-group boundary and
   * resolves world-space transforms. Overridden by RenderNode for
   * barrier-effect nodes (filters/mask/clip/cacheAsTexture), whose effect
   * machinery composites in world space, and for direct
   * children a RetainedContainer pushed out because their subtree contains a
   * DEEP barrier - the sub-branch escape. Escapes are LIVE state,
   * picked up lazily through the same parent-version seam as boundary flips.
   * @internal
   */
  protected _escapesTransformGroup(): boolean {
    return false;
  }

  /**
   * @internal - monotonic stamp of this node's composed global matrix, bumped
   * whenever {@link getGlobalTransform} recomposes it. Read (after calling
   * `getGlobalTransform()`, which resolves the parent chain first) by consumers
   * that must observe ancestry-derived transform changes their own revisions do
   * not see - the render-root case: `_markTransformDirty` stamps UPWARD, so an
   * ancestor above a render root moves every descendant's world transform
   * without touching the root's `_transformRevision`.
   */
  public get _globalTransformStamp(): number {
    return this._globalTransformVersion;
  }

  public getGlobalTransform(): Matrix {
    const parent = this._parentNode;
    const boundary = parent !== null && parent._isTransformGroupBoundary && !this._escapesTransformGroup();
    const parentTransform = parent !== null && !boundary ? parent.getGlobalTransform() : null;
    const parentVersion = parent !== null && !boundary ? parent._globalTransformVersion : NO_PARENT_VERSION;
    const stale = this.flags.hasMask(SceneNodeTransformFlags.GlobalTransform) || this._combinedParentVersion !== parentVersion;

    if (stale) {
      this._globalTransform.copy(this.getTransform());

      if (parentTransform !== null) {
        this._globalTransform.combine(parentTransform);
      }

      this._combinedParentVersion = parentVersion;
      this.flags.removeMask(SceneNodeTransformFlags.GlobalTransform);
      this._globalTransformVersion++;
    }

    return this._globalTransform;
  }

  /**
   * The node's TRUE world-space transform, composed through every
   * transform-group boundary ({@link RetainedContainer}) in the ancestor
   * chain.
   *
   * {@link getGlobalTransform} deliberately stops at the nearest engaged
   * boundary (descendants resolve group-RELATIVE transforms; the renderer
   * multiplies the group matrix back in on the GPU), so it is the right space
   * for rendering but the wrong one for spatial queries. Use THIS accessor
   * whenever a real world position/orientation is needed - picking, spatial
   * audio, physics, world-space math against nodes outside the group.
   *
   * Without any engaged boundary ancestor it returns the exact
   * {@link getGlobalTransform} matrix (same instance, no extra work). With
   * one, it lazily caches `groupLocal × groupWorld` and revalidates on read
   * via version/stamp compares - including runtime space flips such as
   * RetainedContainer's deep-barrier sub-branch escape.
   */
  public getWorldTransform(): Matrix {
    const anchor = this._resolveTransformGroupAnchor();

    if (anchor === null) {
      // No engaged boundary above: world space IS global space. Delegate, but
      // keep the world stamp in sync so consumers keyed on `_worldStamp`
      // (descendants anchored to this node, or external caches) observe the
      // change when the underlying global matrix recomputes or when a former
      // composed cache is replaced by this delegated source.
      const matrix = this.getGlobalTransform();

      if (!this._worldDelegatesToGlobal || this._worldSyncedGlobalVersion !== this._globalTransformVersion) {
        this._worldDelegatesToGlobal = true;
        this._worldSyncedGlobalVersion = this._globalTransformVersion;
        this._worldStamp = nextNodeRevision();
      }

      return matrix;
    }

    // Freshen both inputs FIRST: the group-local matrix (bumps our
    // `_globalTransformVersion` when stale - this also covers boundary
    // re-engagement, which flips the parent-version seam and forces a
    // recompute) and the anchor's world matrix (bumps `anchor._worldStamp`
    // when stale; recursion composes nested groups).
    const groupLocal = this.getGlobalTransform();
    const anchorWorld = anchor.getWorldTransform();

    if (
      this._worldTransform === null ||
      this._worldDelegatesToGlobal ||
      this._worldOwnVersion !== this._globalTransformVersion ||
      this._worldAnchor !== anchor ||
      this._worldAnchorStamp !== anchor._worldStamp
    ) {
      (this._worldTransform ??= new Matrix()).copy(groupLocal).combine(anchorWorld);
      this._worldDelegatesToGlobal = false;
      this._worldOwnVersion = this._globalTransformVersion;
      this._worldAnchor = anchor;
      this._worldAnchorStamp = anchor._worldStamp;
      this._worldStamp = nextNodeRevision();
    }

    return this._worldTransform;
  }

  /**
   * The nearest ancestor whose ENGAGED transform-group boundary this node's
   * global transform is relative to, or `null` when {@link getGlobalTransform}
   * is already world-space. Mirrors the exact seam getGlobalTransform uses:
   * the boundary getter and {@link _escapesTransformGroup} are both LIVE
   * (flips are picked up on every call), and an escaping direct child - its
   * own barrier effects, or the deep-barrier sub-branch escape -
   * takes its whole subtree back to world space with it.
   * @internal
   */
  public _resolveTransformGroupAnchor(): SceneNode | null {
    let node: SceneNode | null = this._parentNode;

    if (node === null) {
      return null;
    }

    if (node._isTransformGroupBoundary && !this._escapesTransformGroup()) {
      return node;
    }

    let parent: SceneNode | null = node._parentNode;

    while (parent !== null) {
      if (parent._isTransformGroupBoundary && !node._escapesTransformGroup()) {
        return parent;
      }

      node = parent;
      parent = node._parentNode;
    }

    return null;
  }

  public getNormals(): Vector[] {
    return this._isWorldAligned() ? this.getBounds().getNormals() : this._orientedBoundsPolygon().getNormals();
  }

  public project(axis: Vector, result: Interval = new Interval()): Interval {
    return this._isWorldAligned() ? this.getBounds().project(axis, result) : this._orientedBoundsPolygon().project(axis, result);
  }

  /**
   * The node's oriented bounding box: the four local-bounds corners under the
   * global transform, as a {@link Polygon}. Used by the SAT collision path so a
   * rotated node tests its true oriented axes instead of the loose AABB. Built
   * lazily and refreshed in place; only ever reached for non-axis-aligned nodes.
   */
  private _orientedBoundsPolygon(): Polygon {
    const bounds = this.getLocalBounds();
    const matrix = this.getGlobalTransform();

    orientedCorners[0]!.set(bounds.left, bounds.top).transform(matrix);
    orientedCorners[1]!.set(bounds.right, bounds.top).transform(matrix);
    orientedCorners[2]!.set(bounds.right, bounds.bottom).transform(matrix);
    orientedCorners[3]!.set(bounds.left, bounds.bottom).transform(matrix);

    return (this._orientedBounds ??= new Polygon()).setPoints(orientedCorners);
  }

  /**
   * Whether the node's *world* box is axis-aligned - its own and every inherited
   * rotation/skew compose to a transform that maps axes to axes (a multiple of
   * 90°, no shear). When true the AABB equals the oriented box, so the cheaper
   * AABB collision/hit-test path is exact; otherwise the oriented-quad SAT path
   * is used. Unlike {@link isAlignedBox} (this node's own rotation only), this
   * accounts for a rotated ancestor.
   */
  private _isWorldAligned(): boolean {
    const matrix = this.getGlobalTransform();
    const epsilon = 1e-9;

    return (Math.abs(matrix.b) < epsilon && Math.abs(matrix.c) < epsilon) || (Math.abs(matrix.a) < epsilon && Math.abs(matrix.d) < epsilon);
  }

  public intersectsWith(target: Collidable): boolean {
    if (this._isWorldAligned()) {
      return this.getBounds().intersectsWith(target);
    }

    switch (target.collisionType) {
      case CollisionType.SceneNode:
        return intersectionSat(this, target);
      case CollisionType.Rectangle:
        return intersectionSat(this, target);
      case CollisionType.Polygon:
        return intersectionSat(this, target);
      case CollisionType.Circle:
        return intersectionRectCircle(this.getBounds(), target as Circle);
      case CollisionType.Ellipse:
        return intersectionRectEllipse(this.getBounds(), target as Ellipse);
      case CollisionType.Line:
        return intersectionLineRect(target as Line, this.getBounds());
      case CollisionType.Point:
        return intersectionPointRect(target as Vector, this.getBounds());
      default:
        return false;
    }
  }

  public collidesWith(target: Collidable): CollisionResponse | null {
    if (this._isWorldAligned()) {
      return this.getBounds().collidesWith(target);
    }

    switch (target.collisionType) {
      case CollisionType.SceneNode:
        return getCollisionSat(this, target);
      case CollisionType.Rectangle:
        return getCollisionSat(this, target);
      case CollisionType.Polygon:
        return getCollisionSat(this, target);
      case CollisionType.Circle:
        return getCollisionSat(this, target);
      default:
        return null;
    }
  }

  /**
   * Hit-test the world-space point `(x, y)` against this node.
   *
   * For world-axis-aligned nodes (own and inherited rotation a multiple of 90°
   * and no skew) the AABB equals the oriented box, so the cheap
   * {@link getBounds} test is exact. For rotated or skewed nodes the point is
   * mapped back into local space with the inverse of the global transform and
   * tested against the untransformed {@link getLocalBounds} - i.e. a true
   * oriented-box test. This is the exact inverse of the forward map that
   * {@link getBounds} and the renderer use to place the node's corners, so
   * picking matches the rendered quad instead of over-reporting hits in the
   * empty AABB corners of a rotated node.
   */
  public contains(x: number, y: number): boolean {
    if (this._isWorldAligned()) {
      return this.getBounds().contains(x, y);
    }

    const matrix = this.getGlobalTransform();
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

    if (determinant === 0) {
      return false;
    }

    // Inverse of the forward map `world = [[a, b], [c, d]] · local + (x, y)`
    // (AbstractVector.transform - the same map getBounds()/Sprite vertices use).
    // Recovers the local-space coordinate, then tests the untransformed bounds.
    const deltaX = x - matrix.x;
    const deltaY = y - matrix.y;
    const localX = (matrix.d * deltaX - matrix.b * deltaY) / determinant;
    const localY = (matrix.a * deltaY - matrix.c * deltaX) / determinant;

    return this.getLocalBounds().contains(localX, localY);
  }

  public inView(view: View): boolean {
    return this._inCullRect(view.getBounds());
  }

  /**
   * The view test against an explicit rect rather than a view's own bounds.
   *
   * A capturing collect culls against a rect slightly LARGER than the view so
   * the resulting retained product survives a camera that moves (see
   * `RenderPlanBuilder.cullRect`); everything else passes the view's own rect
   * and gets exactly {@link inView}.
   * @internal
   */
  public _inCullRect(rect: ReadonlyRectangle): boolean {
    return this._inCullRectUsingBounds(rect, null);
  }

  /**
   * {@link _inCullRect} against bounds the caller already holds.
   *
   * Exists because {@link getBounds} resolves the whole parent chain on every
   * call, and the persistent-source scan asks this question once per item in a
   * subtree that can hold a million of them - at which point that resolve is the
   * single most expensive thing a camera step pays for.
   *
   * The rule is split along the line of what a caller may safely have cached:
   *
   * - `cullable` and `cullArea` are read LIVE, always. `cullArea` is a mutable
   *   `Rectangle` and only REPLACING the reference stamps a revision, so a
   *   caller that had copied it could go stale in place, unnoticed.
   * - `bounds` is the caller's, and it is the caller's obligation to pass one
   *   that is current. The persistent source does that by keying its items on
   *   the subtree's transform revision: they are only selected from while
   *   nothing in it has moved, so no stored extent can be wrong.
   *
   * `null` means "resolve them from this node", which is exactly
   * {@link _inCullRect}. It is a null rather than an eagerly-passed
   * `getBounds()` because the two early exits above must come FIRST: a node that
   * opted out of culling, or one carrying a `cullArea`, never needs its bounds,
   * and resolving them anyway walks its whole parent chain. Passing them in as
   * an argument made every node in a culling-free scene pay that walk - measured
   * on `deep-hierarchy` at 100,000 nodes as 1.9ms -> 19.3ms median.
   *
   * One rule, one implementation. A second copy would be free to drift, and this
   * one decides which nodes reach the screen.
   * @internal
   */
  public _inCullRectUsingBounds(rect: ReadonlyRectangle, bounds: RectangleLike | null): boolean {
    if (!this._cullable) {
      return true;
    }

    const area = this._cullArea;

    if (area !== null) {
      return rect.intersectsWith(area);
    }

    return intersectionRectRect(rect, bounds ?? this.getBounds());
  }

  /**
   * Release this node's pooled state (transform, bounds, flags) and unlink it
   * from its parent.
   *
   * The unlink comes first and is what makes a bare `destroy()` safe. A node
   * left in its parent's child list bumps no revision, so every cache keyed on
   * that revision - a {@link Container}'s retained draw slots, a
   * `RetainedContainer`'s recorded GPU instruction set - would keep replaying
   * the dead node's last captured frame. Removing it stamps the parent
   * structure-dirty, which drops those captures, and runs the node's regular
   * detach cleanup (bounds cascade, interaction/focus deregistration, stage
   * clearing) while this node's own state is still intact.
   *
   * `Container.removeChild` is a no-op for a node it does not hold, so the
   * already-correct `removeChild()`-then-`destroy()` order costs nothing more
   * than the null check here.
   *
   * The destroyed flag is raised before the unlink so detach-time observers
   * (e.g. focus, which suppresses `onBlur` on a destroyed node) see a node that
   * is going away rather than one merely being reparented.
   *
   * Idempotent: a second call is a no-op.
   */
  public destroy(): void {
    // Matching Container.destroy() and Texture.destroy(): re-entry would take
    // already-released state through a second teardown.
    if (this._isDestroyed) {
      return;
    }

    this._isDestroyed = true;
    this._parentNode?.removeChild(this as unknown as RenderNode);
    this._transform.destroy();
    this._position.destroy();
    this._scale.destroy();
    this._origin.destroy();
    this.flags.destroy();

    this._globalTransform.destroy();
    this._worldTransform?.destroy();
    this._worldAnchor = null;
    this._localBounds.destroy();
    this._bounds.destroy();
    this._orientedBounds?.destroy();

    // Last, after the unlink: detaching is itself a change and would re-enter
    // an entry this node no longer needs. The index is process-wide and only
    // ages entries out as frames advance, so a node destroyed with the frame
    // loop already gone would otherwise stay reachable through it forever.
    nodeDirtyIndex.release(this);
  }

  /**
   * Set this node's owning {@link Stage} (the per-Application service bundle).
   * Set when the node is attached to an active scene tree and cleared on
   * detach. {@link Container} overrides this to propagate to its children.
   * @internal
   */
  public _setStage(stage: Stage | null): void {
    this._stage = stage;
  }

  /** @internal - the owning {@link Stage}, or `null` when this node is detached. */
  public _getStage(): Stage | null {
    return this._stage;
  }

  /**
   * Routes a change from one of this node's reactive {@link ObservableVector}
   * components (position/scale/origin) to the matching dirty path. The vectors
   * carry only a numeric channel, so this single handler replaces the bound
   * closures they used to allocate per node. {@link Drawable} extends it with
   * the anchor channel the same way - one override, still no closures.
   * @internal
   */
  public _onObservableChange(channel: number): void {
    switch (channel) {
      case SceneNodeVectorChannel.Position:
        this._setPositionDirty();
        break;
      case SceneNodeVectorChannel.Scale:
        this._setScalingDirty();
        break;
      case SceneNodeVectorChannel.Origin:
        this._setOriginDirty();
        break;
    }
  }

  /**
   * Mark own GlobalTransform + Bounds dirty. Descendants detect staleness
   * lazily via the parent-version compare in getGlobalTransform()/getBounds()
   * - no eager subtree walk.
   * @internal
   */
  public _invalidateSubtreeTransform(): void {
    this.flags.addMask(SceneNodeTransformFlags.GlobalTransform | SceneNodeTransformFlags.BoundsRect);
  }

  /**
   * Mark own Bounds dirty AND propagate up to Container ancestors' Bounds.
   * @internal
   */
  public _invalidateBoundsCascade(): void {
    // A bounds change means this node's rendered extent changed, which makes any
    // retained draw slot captured for it (screen-space AABB + material key) stale.
    // Route it through the content-dirty contract so the Track-B static-subtree
    // skip cannot replay a stale extent/material for a drawable (Text/BitmapText/
    // Mesh, or any future one) that resizes via _invalidateBoundsCascade without
    // separately bumping the node revision. Over-invalidation is correctness-safe
    // (just less skipping); under-invalidation is the bug this closes.
    this._markContentDirty();
    this._invalidateBoundsFlags();
  }

  /**
   * Write the local extent and refresh the bounds flags WITHOUT a revision
   * stamp - the {@link setLocalBounds} counterpart for a node that already
   * stamped itself content-dirty when the change was requested.
   *
   * A node that lays its content out lazily has to stamp at mutation time,
   * because a retained subtree decides whether to replay from the revision
   * alone and never visits a node it skipped. Stamping a second time when the
   * deferred pass finally writes the extent would move the goalposts one frame
   * on and keep the subtree re-capturing instead of recording.
   * @internal
   */
  protected _setLocalBoundsUnstamped(x: number, y: number, width: number, height: number): void {
    this._localBounds.set(x, y, width, height);
    this._invalidateBoundsFlags();
  }

  /**
   * Flag-only bounds invalidation: own BoundsRect + ancestor walk, WITHOUT a
   * revision stamp. Used by transform-group boundaries whose own moves must
   * refresh ancestor world bounds but must NOT invalidate retained fragments.
   * @internal
   */
  protected _invalidateBoundsFlags(): void {
    // Mark own bounds + notify interaction for THIS node unconditionally -
    // the system filters to tracked interactive nodes so this call is O(1)
    // for the common case (non-interactive node - fast Set.has miss).
    this.flags.addMask(SceneNodeTransformFlags.BoundsRect);
    this._stage?.interaction._notifyBoundsInvalidated(this as unknown as RenderNode);

    // Walk up, but stop at the first ancestor already flagged dirty: if a parent
    // is already BoundsRect-dirty, its whole ancestor chain was already cascaded,
    // so re-walking it is redundant work.
    let ancestor = this._parentNode;

    while (ancestor !== null && !ancestor.flags.hasMask(SceneNodeTransformFlags.BoundsRect)) {
      ancestor.flags.addMask(SceneNodeTransformFlags.BoundsRect);
      ancestor._stage?.interaction._notifyBoundsInvalidated(ancestor);
      ancestor = ancestor.parent;
    }
  }

  /**
   * @internal - aggregate content-dirty stamp for this node's subtree
   * (transform/tint/visual-source changes at or below). Read by
   * {@link RetainedPlanCache}. Reading it advances the dirty-walk epoch -
   * see {@link _markContentDirty}. CAUTION: side-effecting getter - an
   * incidental read (logging, devtools inspection, serialization) silently
   * bumps the epoch and degrades (never breaks) the dirty-walk early-out.
   */
  public get _contentRevision(): number {
    dirtyWalkEpoch++;

    return this._nodeRevision.content;
  }

  /**
   * @internal - aggregate structure-dirty stamp (child add/remove/reorder,
   * visibility) for this node's subtree. Reading it advances the dirty-walk
   * epoch - see {@link _markContentDirty}. Same side-effecting-getter caution
   * as {@link _contentRevision}.
   */
  public get _structureRevision(): number {
    dirtyWalkEpoch++;

    return this._nodeRevision.structure;
  }

  /**
   * @internal - aggregate transform-dirty stamp for this node's
   * subtree: own-transform mutations (position/rotation/scale/skew/origin) at
   * or below. Orthogonal to {@link _contentRevision} - a content change does
   * not bump it and it does not bump content. Read by {@link RetainedContainer}
   * to detect a transform-only descendant move (patch rows) vs. a content
   * change (re-collect). Reading it advances the dirty-walk epoch - same
   * side-effecting-getter caution as {@link _contentRevision}.
   */
  public get _transformRevision(): number {
    dirtyWalkEpoch++;

    return this._nodeRevision.transform;
  }

  /** Dirty-walk epoch stamps for the early-out below - see {@link _markContentDirty}. */
  private _contentWalkEpoch = 0;
  private _structureWalkEpoch = 0;
  private _transformWalkEpoch = 0;

  /**
   * @internal - {@link NodeDirtyIndex} bookkeeping: the generation this node was
   * last marked in and the slot it took in that generation's bucket (a second
   * mark in the same generation folds into that slot), plus one mark sequence
   * PER channel - this node's own change revision on that channel, and what a
   * consumer's cursor is compared against. The sequences are per-channel and
   * not one shared number because a node's entry can carry marks made at
   * different times on different channels, and a single number could not say
   * which of them a given cursor is looking at. Only the index reads or writes
   * these.
   */
  public _dirtyMarkGeneration = -1;
  /** @internal - see {@link _dirtyMarkGeneration}. */
  public _dirtyMarkSlot = -1;
  /** @internal - see {@link _dirtyMarkGeneration}. */
  public _transformMarkSequence = 0;
  /** @internal - see {@link _dirtyMarkGeneration}. */
  public _contentMarkSequence = 0;
  /** @internal - see {@link _dirtyMarkGeneration}. */
  public _tintMarkSequence = 0;

  /**
   * @internal - mark this node's content dirty and propagate the stamp up to
   * the root. The walk deliberately runs THROUGH transform-group boundaries
   * (nested retained snapshots key on ancestor revisions; do not add
   * boundary stops here).
   *
   * Early-out: a second revision bump of an ancestor is redundant exactly
   * when no consumer has read revisions since the first bump - the consumer
   * only needs to observe SOME new value relative to its last read, not the
   * newest one. Every consumer read (the revision getters above) advances the
   * process-wide `dirtyWalkEpoch`; the walk stamps each visited ancestor with
   * the current epoch and stops at the first ancestor that is already
   * epoch-current. Induction invariant: an epoch-current node implies ALL its
   * ancestors are epoch-current, because every stamping walk is contiguous
   * from a node up to either the root or an epoch-current ancestor (whose own
   * ancestors are epoch-current by the same invariant), and a global epoch
   * bump un-currents every node at once. So stopping early never skips a
   * stale ancestor. N same-path mutations between two reads cost
   * O(depth + N) stamps instead of O(N * depth).
   */
  protected _markContentDirty(channels: number = DirtyChannel.Content): void {
    const revision = nextNodeRevision();
    const epoch = dirtyWalkEpoch;

    if (transformGroupBoundaryCount > 0 || retainedRenderRootCount > 0) {
      nodeDirtyIndex.mark(this, channels);
    }

    this._nodeRevision.touchContent(revision);
    this._contentWalkEpoch = epoch;

    let ancestor = this._parentNode;

    while (ancestor !== null && ancestor._contentWalkEpoch !== epoch) {
      ancestor._nodeRevision.touchContent(revision);
      ancestor._contentWalkEpoch = epoch;
      ancestor = ancestor.parent;
    }
  }

  /**
   * @internal - mark this node's structure dirty (implies content-dirty) and
   * propagate up to the root. Same through-boundary walk and epoch early-out
   * as {@link _markContentDirty}; because `touchStructure` stamps BOTH
   * revisions, the walk stamps both epochs, and it keys the early-out on the
   * STRUCTURE epoch (structure-current implies content-current, since only
   * this walk stamps the structure epoch - the converse does not hold, so a
   * content walk can never wrongly block a structure walk).
   */
  protected _markStructureDirty(): void {
    const revision = nextNodeRevision();
    const epoch = dirtyWalkEpoch;

    this._nodeRevision.touchStructure(revision);
    this._structureWalkEpoch = epoch;
    this._contentWalkEpoch = epoch;

    let ancestor = this._parentNode;

    while (ancestor !== null && ancestor._structureWalkEpoch !== epoch) {
      ancestor._nodeRevision.touchStructure(revision);
      ancestor._structureWalkEpoch = epoch;
      ancestor._contentWalkEpoch = epoch;
      ancestor = ancestor.parent;
    }
  }

  /**
   * @internal - mark this node's transform dirty and propagate the
   * stamp up to the root, exactly like {@link _markContentDirty} but on the
   * orthogonal transform channel (its own walk epoch, keyed independently so a
   * transform walk and a content walk never block each other). Consumed by
   * {@link RetainedContainer} to spot a transform-only descendant move.
   */
  protected _markTransformDirty(): void {
    const revision = nextNodeRevision();
    const epoch = dirtyWalkEpoch;

    this._nodeRevision.touchTransform(revision);
    this._transformWalkEpoch = epoch;

    let ancestor = this._parentNode;

    while (ancestor !== null && ancestor._transformWalkEpoch !== epoch) {
      ancestor._nodeRevision.touchTransform(revision);
      ancestor._transformWalkEpoch = epoch;
      ancestor = ancestor.parent;
    }
  }

  /**
   * Tail of every own-transform mutation path (position/rotation/scale/origin/
   * skew). Cascades bounds (flag-based, revision-independent) and stamps ONLY
   * the transform channel - NOT content: an own-transform
   * move no longer invalidates a retained fragment, so an enclosing
   * {@link RetainedContainer} keeps its recorded instruction set and patches
   * just this node's transform row in place ({@link _notifyEnclosingRetainedGroup}).
   * Content-dirty is now reserved for genuine content changes (tint/blend/
   * geometry/texture). {@link RetainedContainer} overrides this to bump its
   * group-matrix version for its OWN move instead.
   * @internal
   */
  protected _markOwnTransformDirty(): void {
    // Flag-only bounds cascade (NOT _invalidateBoundsCascade): a transform move
    // must refresh ancestor world bounds for culling/getBounds WITHOUT
    // content-dirtying - the content stamp would invalidate the retained
    // fragment and defeat the row patch. Consumers that needed the old content
    // bump on a move now key on the transform channel instead.
    this._invalidateBoundsFlags();
    this._markTransformDirty();
    this._notifyEnclosingRetainedGroup();
  }

  /**
   * Record that this node's transform moved, for every consumer that owns a
   * baked copy of its row.
   *
   * One entry in the shared index, not a walk. A moved node cannot know which
   * retained products recorded it - render roots may overlap
   * (`render(world)` alongside `render(world.hud)`), a transform-group boundary
   * may sit between them, and there is no exclusive owner slot - so offering
   * the node to each consumer meant climbing the whole ancestor chain on every
   * single mutation. Each consumer now resolves the marks it cares about
   * against the row map it already keeps, and the ones it recorded cost it a
   * map hit rather than the mutator a walk.
   *
   * Runs on every own-transform mutation, so it must not allocate - and
   * short-circuits to a single pair of count checks while no consumer of either
   * kind exists anywhere.
   */
  private _notifyEnclosingRetainedGroup(): void {
    if (transformGroupBoundaryCount === 0 && retainedRenderRootCount === 0) {
      return;
    }

    nodeDirtyIndex.mark(this, DirtyChannel.Transform);
  }

  private _setPositionDirty(): void {
    this.flags.addMask(SceneNodeTransformFlags.Translation);
    this._invalidateSubtreeTransform();
    this._markOwnTransformDirty();
  }

  private _setRotationDirty(): void {
    this.flags.addMask(SceneNodeTransformFlags.Rotation);
    this._invalidateSubtreeTransform();
    this._markOwnTransformDirty();
  }

  private _setScalingDirty(): void {
    this.flags.addMask(SceneNodeTransformFlags.Scaling);
    this._invalidateSubtreeTransform();
    this._markOwnTransformDirty();
  }

  private _setOriginDirty(): void {
    this.flags.addMask(SceneNodeTransformFlags.Origin);
    this._invalidateSubtreeTransform();
    this._markOwnTransformDirty();
  }

  private _setSkewDirty(): void {
    this.flags.addMask(SceneNodeTransformFlags.Skew);
    this._invalidateSubtreeTransform();
    this._markOwnTransformDirty();
  }
}
