import type { Circle } from '#math/Circle';
import type { Collidable, CollisionResponse } from '#math/Collision';
import { CollisionType } from '#math/Collision';
import {
  getCollisionSat,
  intersectionLineRect,
  intersectionPointRect,
  intersectionRectCircle,
  intersectionRectEllipse,
  intersectionSat,
} from '#math/collision-detection';
import type { Ellipse } from '#math/Ellipse';
import { Flags } from '#math/Flags';
import { Interval } from '#math/Interval';
import type { Line } from '#math/Line';
import { Matrix } from '#math/Matrix';
import { ObservableVector, type ObservableVectorOwner } from '#math/ObservableVector';
import { Rectangle } from '#math/Rectangle';
import { degreesToRadians, trimRotation } from '#math/utils';
import type { Vector } from '#math/Vector';
import type { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';
import type { View } from '#rendering/View';

import { Bounds } from './Bounds';
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

// Internal: which reactive vector fired a change, so the single
// `_onObservableChange` handler can route to the right dirty path without each
// vector carrying a bound closure (4 fewer allocations per node).
enum SceneNodeVectorChannel {
  Position,
  Scale,
  Origin,
  Anchor,
}

/**
 * Transform-bearing leaf in the scene-graph hierarchy. Carries position,
 * rotation, scale, skew, origin, and a 2-component {@link Vector} `anchor`
 * used to derive `origin` from the local bounds. Implements {@link Collidable}
 * so any node can participate directly in the SAT collision pipeline via its
 * AABB or rotated/skewed quad.
 *
 * Transform state is dirty-flag-cached: position/rotation/scale/skew/origin
 * mutations invalidate the local transform; either kind of mutation also
 * invalidates the global transform (own + descendants) and the bounds rect
 * for this node and every {@link Container} ancestor up the parent chain.
 * The caches rebuild lazily on the next read.
 *
 * The fast-path `isAlignedBox` getter reports `true` when the rotation is a
 * multiple of 90° and both skew components are zero; in that case the
 * (cheaper) AABB-based collision test is used instead of the rotated/skewed
 * quad SAT path.
 *
 * `_invalidate*` methods are exported as `public` for friend-class access
 * from {@link Container} and {@link InteractionManager}; treat them as
 * `@internal`.
 *
 * Subclasses: {@link Container} (carries children), {@link RenderNode}
 * (carries draw payloads).
 */
export class SceneNode implements Collidable, ObservableVectorOwner {
  public readonly collisionType: CollisionType = CollisionType.SceneNode;

  public readonly flags: Flags<SceneNodeTransformFlags> = new Flags<SceneNodeTransformFlags>(
    SceneNodeTransformFlags.Transform | SceneNodeTransformFlags.GlobalTransform | SceneNodeTransformFlags.BoundsRect,
  );

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
  private _localBounds = new Rectangle();
  private _anchor = new ObservableVector(this, SceneNodeVectorChannel.Anchor, 0, 0);
  private _parentNode: Container | null = null;
  private _zIndex = 0;
  private _cullable = true;

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

  public set position(position: ObservableVector) {
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

  public set scale(scale: ObservableVector) {
    this._scale.copy(scale);
  }

  public get origin(): ObservableVector {
    return this._origin;
  }

  public set origin(origin: ObservableVector) {
    this._origin.copy(origin);
  }

  /**
   * Normalized anchor in 0..1 along each axis that derives `origin` from
   * the current bounds size. `(0, 0)` = top-left, `(0.5, 0.5)` = center,
   * `(1, 1)` = bottom-right. Updates `origin` whenever the anchor or the
   * local bounds change.
   */
  public get anchor(): ObservableVector {
    return this._anchor;
  }

  public set anchor(anchor: ObservableVector) {
    this._anchor.copy(anchor);
  }

  public get parent(): Container | null {
    return this._parentNode;
  }

  public set parent(parent: Container | null) {
    this._parentNode = parent;
  }

  public get visible(): boolean {
    return this._visible;
  }

  public set visible(visible: boolean) {
    this._visible = visible;
  }

  public get zIndex(): number {
    return this._zIndex;
  }

  public set zIndex(zIndex: number) {
    if (this._zIndex !== zIndex) {
      this._zIndex = zIndex;
    }
  }

  public get cullable(): boolean {
    return this._cullable;
  }

  public set cullable(cullable: boolean) {
    this._cullable = cullable;
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
    if (this.flags.has(SceneNodeTransformFlags.Transform)) {
      this.updateTransform();
      this.flags.remove(SceneNodeTransformFlags.Transform);
    }

    return this._transform;
  }

  public updateTransform(): this {
    if (this.flags.has(SceneNodeTransformFlags.Rotation)) {
      const radians = degreesToRadians(this._rotation);

      this._cos = Math.cos(radians);
      this._sin = Math.sin(radians);
    }

    if (this.flags.has(SceneNodeTransformFlags.Rotation | SceneNodeTransformFlags.Scaling | SceneNodeTransformFlags.Skew)) {
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

  public setAnchor(x: number, y: number = x): this {
    this._anchor.set(x, y);

    return this;
  }

  public getLocalBounds(): Rectangle {
    return this._localBounds;
  }

  public getBounds(): Rectangle {
    if (this.flags.has(SceneNodeTransformFlags.BoundsRect)) {
      this.updateBounds();
      this.flags.remove(SceneNodeTransformFlags.BoundsRect);
    }

    return this._bounds.getRect();
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

  public getGlobalTransform(): Matrix {
    if (this.flags.has(SceneNodeTransformFlags.GlobalTransform)) {
      this._globalTransform.copy(this.getTransform());

      if (this._parentNode) {
        this._globalTransform.combine(this._parentNode.getGlobalTransform());
      }

      this.flags.remove(SceneNodeTransformFlags.GlobalTransform);
    }

    return this._globalTransform;
  }

  public getNormals(): Vector[] {
    return this.getBounds().getNormals();
  }

  public project(axis: Vector, result: Interval = new Interval()): Interval {
    return this.getBounds().project(axis, result);
  }

  public intersectsWith(target: Collidable): boolean {
    if (this.isAlignedBox) {
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
    if (this.isAlignedBox) {
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
   * For axis-aligned nodes ({@link isAlignedBox} — rotation a multiple of 90°
   * and no skew) the AABB equals the oriented box, so the cheap
   * {@link getBounds} test is exact. For rotated or skewed nodes the point is
   * mapped back into local space with the inverse of the global transform and
   * tested against the untransformed {@link getLocalBounds} — i.e. a true
   * oriented-box test. This is the exact inverse of the forward map that
   * {@link getBounds} and the renderer use to place the node's corners, so
   * picking matches the rendered quad instead of over-reporting hits in the
   * empty AABB corners of a rotated node.
   */
  public contains(x: number, y: number): boolean {
    if (this.isAlignedBox) {
      return this.getBounds().contains(x, y);
    }

    const matrix = this.getGlobalTransform();
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;

    if (determinant === 0) {
      return false;
    }

    // Inverse of the forward map `world = [[a, b], [c, d]] · local + (x, y)`
    // (AbstractVector.transform — the same map getBounds()/Sprite vertices use).
    // Recovers the local-space coordinate, then tests the untransformed bounds.
    const deltaX = x - matrix.x;
    const deltaY = y - matrix.y;
    const localX = (matrix.d * deltaX - matrix.b * deltaY) / determinant;
    const localY = (matrix.a * deltaY - matrix.c * deltaX) / determinant;

    return this.getLocalBounds().contains(localX, localY);
  }

  public inView(view: View): boolean {
    if (!this._cullable) {
      return true;
    }

    return view.getBounds().intersectsWith(this.getBounds());
  }

  public destroy(): void {
    this._transform.destroy();
    this._position.destroy();
    this._scale.destroy();
    this._origin.destroy();
    this.flags.destroy();

    this._globalTransform.destroy();
    this._localBounds.destroy();
    this._bounds.destroy();
    this._anchor.destroy();
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

  /** @internal — the owning {@link Stage}, or `null` when this node is detached. */
  public _getStage(): Stage | null {
    return this._stage;
  }

  /**
   * Routes a change from one of this node's reactive {@link ObservableVector}
   * components (position/scale/origin/anchor) to the matching dirty path. The
   * vectors carry only a numeric channel, so this single handler replaces the
   * four bound closures they used to allocate per node.
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
      case SceneNodeVectorChannel.Anchor:
        this._updateOrigin();
        break;
    }
  }

  /** Mark own + all descendants' GlobalTransform + Bounds dirty. */
  public _invalidateSubtreeTransform(): void {
    this.flags.push(SceneNodeTransformFlags.GlobalTransform | SceneNodeTransformFlags.BoundsRect);
    this._invalidateChildrenTransform();
  }

  /** Hook for Container to override. Default: no-op (leaf node has no children). */
  protected _invalidateChildrenTransform(): void {
    // overridden by Container
  }

  /** Mark own Bounds dirty AND propagate up to Container ancestors' Bounds. */
  public _invalidateBoundsCascade(): void {
    // Mark own bounds + notify interaction for THIS node unconditionally —
    // the manager filters to tracked interactive nodes so this call is O(1)
    // for the common case (non-interactive node — fast Set.has miss).
    this.flags.push(SceneNodeTransformFlags.BoundsRect);
    this._stage?.interaction._notifyBoundsInvalidated(this as unknown as RenderNode);

    // Walk up, but stop at the first ancestor already flagged dirty: if a parent
    // is already BoundsRect-dirty, its whole ancestor chain was already cascaded,
    // so re-walking it is redundant work.
    let ancestor = this._parentNode;

    while (ancestor !== null && !ancestor.flags.has(SceneNodeTransformFlags.BoundsRect)) {
      ancestor.flags.push(SceneNodeTransformFlags.BoundsRect);
      ancestor._stage?.interaction._notifyBoundsInvalidated(ancestor);
      ancestor = ancestor.parent;
    }
  }

  private _setPositionDirty(): void {
    this.flags.push(SceneNodeTransformFlags.Translation);
    this._invalidateSubtreeTransform();
    this._invalidateBoundsCascade();
  }

  private _setRotationDirty(): void {
    this.flags.push(SceneNodeTransformFlags.Rotation);
    this._invalidateSubtreeTransform();
    this._invalidateBoundsCascade();
  }

  private _setScalingDirty(): void {
    this.flags.push(SceneNodeTransformFlags.Scaling);
    this._invalidateSubtreeTransform();
    this._invalidateBoundsCascade();
  }

  private _setOriginDirty(): void {
    this.flags.push(SceneNodeTransformFlags.Origin);
    this._invalidateSubtreeTransform();
    this._invalidateBoundsCascade();
  }

  private _setSkewDirty(): void {
    this.flags.push(SceneNodeTransformFlags.Skew);
    this._invalidateSubtreeTransform();
    this._invalidateBoundsCascade();
  }

  private _updateOrigin(): void {
    const { x, y } = this._anchor;
    const { width, height } = this.getBounds();

    this.setOrigin(width * x, height * y);
  }
}
