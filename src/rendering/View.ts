import { Bounds } from '#core/Bounds';
import { SceneNode } from '#core/SceneNode';
import { Flags } from '#math/Flags';
import { Matrix } from '#math/Matrix';
import { ObservableSize } from '#math/ObservableSize';
import { ObservableVector, type ObservableVectorOwner } from '#math/ObservableVector';
import type { PointLike } from '#math/PointLike';
import { Rectangle } from '#math/Rectangle';
import { clamp, degreesToRadians, trimRotation } from '#math/utils';

/**
 * Dirty-flag bits for lazy {@link View} transform and bounds recalculation.
 * @internal
 */
export enum ViewFlags {
  None = 0x00,
  Translation = 0x01,
  Rotation = 0x02,
  Scaling = 0x04,
  Origin = 0x08,
  Transform = 0x0f,
  TransformInverse = 0x10,
  BoundingBox = 0x20,
  TextureCoords = 0x40,
  VertexTint = 0x80,
}

/** A target that a {@link View} can track — either a {@link SceneNode} or any `{x, y}` position object. */
export type ViewFollowTarget = SceneNode | { x: number; y: number } | null;

/** Options for {@link View.follow}. */
export interface ViewFollowOptions {
  /** Interpolation factor in [0, 1]. `1` snaps instantly; lower values smooth the camera. Defaults to `1`. */
  lerp?: number;
  /** Horizontal offset in world units applied after following the target. */
  offsetX?: number;
  /** Vertical offset in world units applied after following the target. */
  offsetY?: number;
}

/** Options for {@link View.shake}. */
export interface ViewShakeOptions {
  /** Oscillation frequency in Hz. Higher values produce more rapid shaking. Defaults to `16`. */
  frequency?: number;
  /** When `true` the amplitude decays linearly to zero over the shake duration. Defaults to `true`. */
  decay?: boolean;
}

/** Options for {@link View.from}. */
export interface ViewOptions {
  /** World-space center position. Defaults to `{ x: 0, y: 0 }`. */
  center?: { x: number; y: number };
  /** Visible area size in world units (before zoom is applied). Defaults to `{ width: 0, height: 0 }`. */
  size?: { width: number; height: number };
  /** Normalized (0..1) viewport rectangle within the canvas. Defaults to the full canvas `(0, 0, 1, 1)`. */
  viewport?: Rectangle;
  /** Initial rotation in degrees. Defaults to `0`. */
  rotation?: number;
  /** Initial zoom level. A value of `2` halves the visible area. Defaults to `1`. */
  zoom?: number;
}

/**
 * 2D camera that defines what region of the world is visible on screen.
 *
 * Maintains a center position, a visible area size, a rotation, and an optional
 * zoom level. Provides lazy-evaluated world-to-clip and clip-to-world transform
 * matrices, a follow-target system for tracking scene nodes, and a procedural
 * screen-shake effect. Call {@link update} once per frame to advance follow and
 * shake animations.
 * @stable
 */
export class View implements ObservableVectorOwner {
  private readonly _center: ObservableVector;
  private readonly _size: ObservableSize;
  private readonly _viewport: Rectangle = new Rectangle(0, 0, 1, 1);
  private readonly _transform: Matrix = new Matrix();
  private readonly _inverseTransform: Matrix = new Matrix();
  private readonly _bounds: Bounds = new Bounds();
  private readonly _flags: Flags<ViewFlags> = new Flags<ViewFlags>();
  private _rotation = 0;
  private _sin = 0;
  private _cos = 1;
  private _zoomLevel = 1;
  private _zoomBaseWidth: number;
  private _zoomBaseHeight: number;
  private _followTarget: ViewFollowTarget = null;
  private _followLerp = 1;
  private _followOffsetX = 0;
  private _followOffsetY = 0;
  private _boundsConstraint: Rectangle | null = null;
  private _shakeIntensity = 0;
  private _shakeDurationMs = 0;
  private _shakeElapsedMs = 0;
  private _shakeFrequency = 16;
  private _shakeDecay = true;
  private _shakePhase = 0;
  private _shakeOffsetX = 0;
  private _shakeOffsetY = 0;
  private _updateId = 0;

  public constructor(centerX: number, centerY: number, width: number, height: number) {
    this._center = new ObservableVector(this, 0, centerX, centerY);
    this._size = new ObservableSize(this._setScalingDirty.bind(this), width, height);
    this._zoomBaseWidth = width;
    this._zoomBaseHeight = height;
    this._flags.push(ViewFlags.Transform, ViewFlags.TransformInverse, ViewFlags.BoundingBox);
  }

  /**
   * Create a {@link View} from a {@link ViewOptions} bag.
   *
   * All options are optional and default to the same values as a bare
   * `new View(0, 0, 0, 0)` call with a full-canvas viewport and no rotation
   * or zoom.
   */
  public static from(options: ViewOptions = {}): View {
    const view = new View(options.center?.x ?? 0, options.center?.y ?? 0, options.size?.width ?? 0, options.size?.height ?? 0);

    if (options.viewport) {
      view.viewport = options.viewport;
    }
    if (options.rotation && options.rotation !== 0) {
      view.rotation = options.rotation;
    }
    if (options.zoom !== undefined && options.zoom !== 1) {
      view.setZoom(options.zoom);
    }

    return view;
  }

  /**
   * Receives change notifications from the reactive `_center` vector and marks
   * the view transform stale. (`_size` is an {@link ObservableSize}, which still
   * carries its own callback.)
   * @internal
   */
  public _onObservableChange(): void {
    this._setPositionDirty();
  }

  public get center(): ObservableVector {
    return this._center;
  }

  public set center(center: ObservableVector) {
    this._center.copy(center);
  }

  public get size(): ObservableSize {
    return this._size;
  }

  public set size(size: ObservableSize) {
    this._size.copy(size);
  }

  public get width(): number {
    return this._size.width;
  }

  public set width(width: number) {
    this._size.width = width;
  }

  public get height(): number {
    return this._size.height;
  }

  public set height(height: number) {
    this._size.height = height;
  }

  public get rotation(): number {
    return this._rotation;
  }

  public set rotation(rotation: number) {
    this.setRotation(rotation);
  }

  public get viewport(): Rectangle {
    return this._viewport;
  }

  public set viewport(viewport: Rectangle) {
    if (!this._viewport.equals(viewport)) {
      this._viewport.copy(viewport);
      this._setDirty();
    }
  }

  /**
   * Monotonically increasing counter incremented whenever the view's transform
   * is invalidated. Backends use this to detect when to re-upload the projection matrix.
   */
  public get updateId(): number {
    return this._updateId;
  }

  public get zoomLevel(): number {
    return this._zoomLevel;
  }

  public setCenter(x: number, y: number): this {
    this._center.set(x, y);

    return this;
  }

  /**
   * Resize the view to the given dimensions and reset zoom to `1`.
   * Use this when the canvas or window is resized.
   */
  public resize(width: number, height: number): this {
    this._zoomBaseWidth = width;
    this._zoomBaseHeight = height;
    this._zoomLevel = 1;
    this._size.set(width, height);

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

  /**
   * Set the normalized (0..1) viewport rectangle fluently.
   * Mirrors the `set viewport` property setter without allocating a
   * {@link Rectangle} — pass the four components directly.
   *
   * @param x      - Left edge as a fraction of the canvas width.
   * @param y      - Top edge as a fraction of the canvas height.
   * @param width  - Width as a fraction of the canvas width.
   * @param height - Height as a fraction of the canvas height.
   */
  public setViewport(x: number, y: number, width: number, height: number): this {
    if (this._viewport.x !== x || this._viewport.y !== y || this._viewport.width !== width || this._viewport.height !== height) {
      this._viewport.set(x, y, width, height);
      this._setDirty();
    }

    return this;
  }

  public move(x: number, y: number): this {
    this.setCenter(this._center.x + x, this._center.y + y);

    return this;
  }

  public zoom(factor: number): this {
    this.resize(this._size.width * factor, this._size.height * factor);

    return this;
  }

  /**
   * Set an absolute zoom level.
   * A zoom of `2` halves the visible area; `0.5` doubles it.
   * Values are clamped to a minimum of `0.0001` to prevent division by zero.
   */
  public setZoom(zoom: number): this {
    const normalizedZoom = Math.max(0.0001, zoom);

    this._zoomLevel = normalizedZoom;
    this._size.set(this._zoomBaseWidth / normalizedZoom, this._zoomBaseHeight / normalizedZoom);

    return this;
  }

  public zoomIn(amount = 0.1): this {
    return this.setZoom(this._zoomLevel + amount);
  }

  public zoomOut(amount = 0.1): this {
    return this.setZoom(Math.max(0.0001, this._zoomLevel - amount));
  }

  /**
   * Track a scene node or world position each frame.
   * The view center is interpolated towards the target using the `lerp` factor.
   * Call {@link clearFollow} to stop tracking.
   */
  public follow(target: ViewFollowTarget, options: ViewFollowOptions = {}): this {
    this._followTarget = target;
    this._followLerp = clamp(options.lerp ?? 1, 0, 1);
    this._followOffsetX = options.offsetX ?? 0;
    this._followOffsetY = options.offsetY ?? 0;

    return this;
  }

  public clearFollow(): this {
    this._followTarget = null;
    this._followLerp = 1;
    this._followOffsetX = 0;
    this._followOffsetY = 0;

    return this;
  }

  /**
   * Constrain the camera center so the visible area never extends outside `bounds`.
   * When the view is larger than the constraint rectangle the camera is clamped to
   * the geometric centre of the rectangle. Pass `null` to remove the constraint.
   */
  public setBounds(bounds: Rectangle | null): this {
    if (bounds === null) {
      if (this._boundsConstraint) {
        this._boundsConstraint.destroy();
        this._boundsConstraint = null;
      }

      return this;
    }

    if (this._boundsConstraint === null) {
      this._boundsConstraint = bounds.clone();
    } else {
      this._boundsConstraint.copy(bounds);
    }

    this._applyBoundsConstraint();

    return this;
  }

  public clearBounds(): this {
    return this.setBounds(null);
  }

  /**
   * Start a procedural camera shake effect.
   * The shake applies a sinusoidal offset to the view's center position, then
   * stops automatically when `durationMs` elapses. Call {@link stopShake} to
   * cancel early.
   *
   * @param intensity  - Maximum pixel displacement at peak amplitude.
   * @param durationMs - How long the shake lasts in milliseconds.
   */
  public shake(intensity: number, durationMs: number, options: ViewShakeOptions = {}): this {
    this._shakeIntensity = Math.max(0, intensity);
    this._shakeDurationMs = Math.max(0, durationMs);
    this._shakeElapsedMs = 0;
    this._shakeFrequency = Math.max(0, options.frequency ?? 16);
    this._shakeDecay = options.decay ?? true;
    this._shakePhase = 0;
    this._shakeOffsetX = 0;
    this._shakeOffsetY = 0;
    this._setPositionDirty();

    return this;
  }

  public stopShake(): this {
    this._shakeIntensity = 0;
    this._shakeDurationMs = 0;
    this._shakeElapsedMs = 0;
    this._shakePhase = 0;

    if (this._shakeOffsetX !== 0 || this._shakeOffsetY !== 0) {
      this._shakeOffsetX = 0;
      this._shakeOffsetY = 0;
      this._setPositionDirty();
    }

    return this;
  }

  public update(deltaMilliseconds: number): this {
    this._updateFollowTarget();
    this._updateShake(deltaMilliseconds);
    this._applyBoundsConstraint();

    return this;
  }

  public rotate(degrees: number): this {
    this.setRotation(this._rotation + degrees);

    return this;
  }

  public reset(centerX: number, centerY: number, width: number, height: number): this {
    this._zoomBaseWidth = width;
    this._zoomBaseHeight = height;
    this._zoomLevel = 1;
    this._size.set(width, height);
    this._center.set(centerX, centerY);
    this._viewport.set(0, 0, 1, 1);
    this._rotation = 0;
    this._sin = 0;
    this._cos = 1;

    this._flags.push(ViewFlags.Transform);

    return this;
  }

  /**
   * Return the cached world-to-clip projection matrix, recalculating it if dirty.
   * The returned matrix is owned by this view — do not store a reference across frames.
   */
  public getTransform(): Matrix {
    if (this._flags.has(ViewFlags.Transform)) {
      this.updateTransform();
      this._flags.remove(ViewFlags.Transform);
    }

    return this._transform;
  }

  protected updateTransform(): this {
    const centerX = this._center.x + this._shakeOffsetX;
    const centerY = this._center.y + this._shakeOffsetY;
    const x = 2 / this.width;
    const y = -2 / this.height;

    if (this._flags.has(ViewFlags.Rotation)) {
      const radians = degreesToRadians(this._rotation);

      this._cos = Math.cos(radians);
      this._sin = Math.sin(radians);
    }

    if (this._flags.has(ViewFlags.Rotation | ViewFlags.Scaling)) {
      this._transform.a = x * this._cos;
      this._transform.b = x * this._sin;

      this._transform.c = -y * this._sin;
      this._transform.d = y * this._cos;
    }

    this._transform.x = x * -this._transform.a - y * this._transform.b + -x * centerX;
    this._transform.y = x * -this._transform.c - y * this._transform.d + -y * centerY;

    return this;
  }

  /**
   * Return the cached clip-to-world inverse matrix, recalculating it if dirty.
   * Use this to convert screen-space coordinates (e.g. mouse position) to world space.
   */
  public getInverseTransform(): Matrix {
    if (this._flags.has(ViewFlags.TransformInverse)) {
      this.getTransform().getInverse(this._inverseTransform);

      this._flags.remove(ViewFlags.TransformInverse);
    }

    return this._inverseTransform;
  }

  /**
   * Convert a logical/design-space pixel coordinate to a world-space position.
   *
   * The 2-argument form treats `(x, y)` as coordinates in the view's own
   * design space (`0..view.width` × `0..view.height`) — the same space as
   * {@link Pointer.x}/{@link Pointer.y} and node positions — and applies only
   * the inverse camera transform. The viewport rectangle is intentionally
   * ignored, because design-space input already lives inside the camera's
   * projection (any letterbox offset was removed upstream when the pointer was
   * mapped). At the default centered camera this is the identity.
   *
   * @param x - X coordinate in design/logical pixels (`0..view.width`).
   * @param y - Y coordinate in design/logical pixels (`0..view.height`).
   */
  public screenToWorld(x: number, y: number): PointLike;
  /**
   * Convert a raw canvas backing-store pixel coordinate to a world-space
   * position. Accounts for the view's viewport rectangle, so it works
   * correctly in multi-view / split-screen and letterboxed setups.
   *
   * @param screenX      - X pixel relative to the canvas top-left corner.
   * @param screenY      - Y pixel relative to the canvas top-left corner.
   * @param canvasWidth  - Canvas backing-store width in pixels (`app.canvas.width`).
   * @param canvasHeight - Canvas backing-store height in pixels (`app.canvas.height`).
   */
  public screenToWorld(screenX: number, screenY: number, canvasWidth: number, canvasHeight: number): PointLike;
  public screenToWorld(screenX: number, screenY: number, canvasWidth?: number, canvasHeight?: number): PointLike {
    let clipX: number;
    let clipY: number;

    if (canvasWidth === undefined || canvasHeight === undefined) {
      const w = this.width || 1;
      const h = this.height || 1;

      clipX = (screenX / w) * 2 - 1;
      clipY = 1 - (screenY / h) * 2;
    } else {
      const vw = this._viewport.width * canvasWidth;
      const vh = this._viewport.height * canvasHeight;

      clipX = ((screenX - this._viewport.x * canvasWidth) / vw) * 2 - 1;
      clipY = 1 - ((screenY - this._viewport.y * canvasHeight) / vh) * 2;
    }

    // Solve the forward transform `clip = M · world` directly for `world`,
    // including the translation, so this is an exact inverse of worldToScreen
    // (returns absolute world coordinates, identity at the default centered
    // camera). Inlined 2×2 solve — a det guard + no Matrix allocation on this
    // pointer-mapping path; equivalent to `transformInverse(getTransform())`.
    const m = this.getTransform();
    const det = m.a * m.d - m.b * m.c;

    if (det === 0) {
      return { x: 0, y: 0 };
    }

    const dx = clipX - m.x;
    const dy = clipY - m.y;

    return {
      x: (dx * m.d - dy * m.b) / det,
      y: (dy * m.a - dx * m.c) / det,
    };
  }

  /**
   * Convert a world-space position to logical/design-space pixel coordinates
   * (`0..view.width` × `0..view.height`). Inverse of the 2-argument
   * {@link screenToWorld}; the viewport is ignored. At the default centered
   * camera this is the identity.
   *
   * @param worldX - World X coordinate.
   * @param worldY - World Y coordinate.
   */
  public worldToScreen(worldX: number, worldY: number): PointLike;
  /**
   * Convert a world-space position to raw canvas backing-store pixel
   * coordinates. Accounts for the view's viewport rectangle.
   *
   * @param worldX       - World X coordinate.
   * @param worldY       - World Y coordinate.
   * @param canvasWidth  - Canvas backing-store width in pixels (`app.canvas.width`).
   * @param canvasHeight - Canvas backing-store height in pixels (`app.canvas.height`).
   */
  public worldToScreen(worldX: number, worldY: number, canvasWidth: number, canvasHeight: number): PointLike;
  public worldToScreen(worldX: number, worldY: number, canvasWidth?: number, canvasHeight?: number): PointLike {
    const m = this.getTransform();
    const clipX = m.a * worldX + m.b * worldY + m.x;
    const clipY = m.c * worldX + m.d * worldY + m.y;

    if (canvasWidth === undefined || canvasHeight === undefined) {
      return {
        x: ((clipX + 1) / 2) * this.width,
        y: ((1 - clipY) / 2) * this.height,
      };
    }

    const vx = this._viewport.x * canvasWidth;
    const vy = this._viewport.y * canvasHeight;

    return {
      x: vx + ((clipX + 1) / 2) * this._viewport.width * canvasWidth,
      y: vy + ((1 - clipY) / 2) * this._viewport.height * canvasHeight,
    };
  }

  /**
   * Return the world-space bounding rectangle of the currently visible area, recalculating if dirty.
   * Used for frustum culling by {@link Drawable.render}.
   */
  public getBounds(): Rectangle {
    if (this._flags.has(ViewFlags.BoundingBox)) {
      this.updateBounds();
      this._flags.remove(ViewFlags.BoundingBox);
    }

    return this._bounds.getRect();
  }

  protected updateBounds(): this {
    const centerX = this._center.x + this._shakeOffsetX;
    const centerY = this._center.y + this._shakeOffsetY;
    const offsetX = this.width / 2;
    const offsetY = this.height / 2;

    this._bounds
      .reset()
      .addCoords(centerX - offsetX, centerY - offsetY)
      .addCoords(centerX + offsetX, centerY + offsetY);

    return this;
  }

  public destroy(): void {
    this.stopShake();
    this.clearFollow();

    if (this._boundsConstraint) {
      this._boundsConstraint.destroy();
      this._boundsConstraint = null;
    }

    this._center.destroy();
    this._size.destroy();
    this._viewport.destroy();
    this._transform.destroy();
    this._inverseTransform.destroy();
    this._bounds.destroy();
    this._flags.destroy();
  }

  private _setDirty(): void {
    this._flags.push(ViewFlags.TransformInverse, ViewFlags.BoundingBox);
    this._updateId++;
  }

  private _setPositionDirty(): void {
    this._flags.push(ViewFlags.Translation);
    this._setDirty();
  }

  private _setRotationDirty(): void {
    this._flags.push(ViewFlags.Rotation);
    this._setDirty();
  }

  private _setScalingDirty(): void {
    this._flags.push(ViewFlags.Scaling);
    this._setDirty();
  }

  private _updateFollowTarget(): void {
    if (!this._followTarget) {
      return;
    }

    let targetX: number;
    let targetY: number;

    if (this._followTarget instanceof SceneNode) {
      const m = this._followTarget.getGlobalTransform();
      targetX = m.x + this._followOffsetX;
      targetY = m.y + this._followOffsetY;
    } else {
      targetX = this._followTarget.x + this._followOffsetX;
      targetY = this._followTarget.y + this._followOffsetY;
    }

    if (this._followLerp >= 1) {
      this.setCenter(targetX, targetY);

      return;
    }

    this.setCenter(this._center.x + (targetX - this._center.x) * this._followLerp, this._center.y + (targetY - this._center.y) * this._followLerp);
  }

  private _applyBoundsConstraint(): void {
    if (!this._boundsConstraint) {
      return;
    }

    const bounds = this._boundsConstraint;
    const halfWidth = this.width / 2;
    const halfHeight = this.height / 2;
    const minX = bounds.left + halfWidth;
    const maxX = bounds.right - halfWidth;
    const minY = bounds.top + halfHeight;
    const maxY = bounds.bottom - halfHeight;
    const constrainedX = minX > maxX ? (bounds.left + bounds.right) / 2 : clamp(this._center.x, minX, maxX);
    const constrainedY = minY > maxY ? (bounds.top + bounds.bottom) / 2 : clamp(this._center.y, minY, maxY);

    if (constrainedX !== this._center.x || constrainedY !== this._center.y) {
      this.setCenter(constrainedX, constrainedY);
    }
  }

  private _updateShake(deltaMilliseconds: number): void {
    if (this._shakeDurationMs <= 0 || this._shakeIntensity <= 0) {
      if (this._shakeOffsetX !== 0 || this._shakeOffsetY !== 0) {
        this._shakeOffsetX = 0;
        this._shakeOffsetY = 0;
        this._setPositionDirty();
      }

      return;
    }

    this._shakeElapsedMs = Math.min(this._shakeDurationMs, this._shakeElapsedMs + Math.max(0, deltaMilliseconds));

    const progress = this._shakeDurationMs > 0 ? this._shakeElapsedMs / this._shakeDurationMs : 1;
    const amplitude = this._shakeDecay ? this._shakeIntensity * (1 - progress) : this._shakeIntensity;

    this._shakePhase += (Math.max(0, deltaMilliseconds) / 1000) * this._shakeFrequency * Math.PI * 2;

    const nextOffsetX = Math.sin(this._shakePhase * 1.7) * amplitude;
    const nextOffsetY = Math.cos(this._shakePhase * 1.3) * amplitude;

    if (nextOffsetX !== this._shakeOffsetX || nextOffsetY !== this._shakeOffsetY) {
      this._shakeOffsetX = nextOffsetX;
      this._shakeOffsetY = nextOffsetY;
      this._setPositionDirty();
    }

    if (this._shakeElapsedMs >= this._shakeDurationMs) {
      this.stopShake();
    }
  }
}
