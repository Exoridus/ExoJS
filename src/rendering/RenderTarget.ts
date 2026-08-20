import { Rectangle } from '#math/Rectangle';
import { Size } from '#math/Size';
import { Vector } from '#math/Vector';

import { View } from './View';

/**
 * Renderable destination - either the on-screen canvas (the `root`
 * target owned by the backend) or an offscreen texture (a
 * {@link RenderTexture}). Owns a default {@link View} that controls the
 * camera transform and viewport, and emits a destroy event so backends
 * can release backing GPU resources.
 *
 * Set `view` to swap cameras for this target; call `resize(w, h)` when
 * the underlying canvas / texture dimensions change. An assigned view is
 * caller-owned: swapping it out or destroying the target leaves it alive,
 * so destroy the views you create yourself.
 */
export class RenderTarget {
  /**
   * Whether this target needs a stencil attachment for geometric stencil
   * clipping ({@link RenderNode.clip} with a `Geometry` `clipShape`). Set by the
   * WebGL2 backend when such a clip is rendered into an offscreen
   * {@link RenderTexture}, so its framebuffer gets a depth/stencil renderbuffer;
   * the WebGL2 on-screen root uses the default framebuffer's stencil (requested
   * at context creation), so the flag only affects offscreen WebGL2 targets.
   *
   * The WebGPU backend does not consult this flag: it allocates a separate
   * `depth24plus-stencil8` attachment per clipped target (root included) on
   * demand, sized to the colour attachment's physical pixels.
   */
  public needsStencil = false;

  private readonly _root: boolean;
  private readonly _destroyListeners: Set<() => void> = new Set<() => void>();
  private _isDestroyed = false;
  private _version = 0;
  protected _size: Size;
  protected _viewport: Rectangle = new Rectangle();
  protected _defaultView: View;
  protected _view: View;

  public constructor(width: number, height: number, root = false) {
    this._size = new Size(width, height);
    this._root = root;
    this._defaultView = new View(width / 2, height / 2, width, height);
    this._view = this._defaultView;
  }

  public get view(): View {
    return this._view;
  }

  public set view(view: View) {
    this.setView(view);
  }

  public get size(): Size {
    return this._size;
  }

  public set size(size: Size) {
    this.resize(size.width, size.height);
  }

  public get width(): number {
    return this._size.width;
  }

  public set width(width: number) {
    this.resize(width, this.height);
  }

  public get height(): number {
    return this._size.height;
  }

  public set height(height: number) {
    this.resize(this.width, height);
  }

  public get root(): boolean {
    return this._root;
  }

  public get version(): number {
    return this._version;
  }

  /**
   * `true` once {@link destroy} has run. A destroyed target must not be
   * rendered into - the backend throws rather than drawing into released
   * GPU state.
   */
  public get destroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Subscribe to the moment this target (or any subclass - including
   * {@link RenderTexture}) is destroyed. Backends use this to release
   * GPU-side resources (framebuffer + attached texture) tied to the
   * target. Listeners fire exactly once.
   */
  public addDestroyListener(listener: () => void): this {
    this._destroyListeners.add(listener);

    return this;
  }

  /** Remove a previously registered destroy listener. No-op if absent. */
  public removeDestroyListener(listener: () => void): this {
    this._destroyListeners.delete(listener);

    return this;
  }

  /**
   * Point this target at `view`, or back at its own default view when passed
   * `null`. The view is caller-owned - neither this call nor {@link destroy}
   * releases it.
   */
  public setView(view: View | null): this {
    const nextView = view || this._defaultView;

    if (this._view !== nextView) {
      this._view = nextView;
      this._touch();
    }

    return this;
  }

  public resize(width: number, height: number): this {
    if (!this._size.equals({ width, height })) {
      this._size.set(width, height);
      this._touch();
    }

    return this;
  }

  public getViewport(view: View = this._view): Rectangle {
    const { x, y, width, height } = view.viewport;

    return this._viewport.set(Math.round(x * this.width), Math.round(y * this.height), Math.round(width * this.width), Math.round(height * this.height));
  }

  public updateViewport(): this {
    this._touch();

    return this;
  }

  public mapPixelToCoords(point: Vector, view: View = this._view): Vector {
    const viewport = this.getViewport(view);
    const normalized = new Vector(-1 + (2 * (point.x - viewport.left)) / viewport.width, 1 - (2 * (point.y - viewport.top)) / viewport.height);

    return normalized.transform(view.getInverseTransform());
  }

  public mapCoordsToPixel(point: Vector, view: View = this._view): Vector {
    return this._mapCoordsToPixelInPlace(point.clone(), view);
  }

  /**
   * {@link mapCoordsToPixel} without the defensive copy: transforms `point` in
   * place and returns it.
   *
   * The public method must not touch its argument, so it clones - and the clip
   * path calls it twice per scissor push, i.e. twice per clipped or masked
   * barrier per frame, always on a scratch vector the caller already owns and
   * is about to overwrite. Callers that own their point use this instead.
   * @internal
   */
  public _mapCoordsToPixelInPlace(point: Vector, view: View = this._view): Vector {
    const viewport = this.getViewport(view);

    point.transform(view.getTransform());

    return point.set((((point.x + 1) / 2) * viewport.width + viewport.left) | 0, (((-point.y + 1) / 2) * viewport.height + viewport.top) | 0);
  }

  public destroy(): void {
    // Idempotent by contract. Without this guard a second call would run the
    // whole teardown again - `_defaultView`, `_viewport` and `_size` would each
    // take a second `destroy()`, and a listener re-registered after the first
    // call would fire against already-released GPU state.
    if (this._isDestroyed) {
      return;
    }

    this._isDestroyed = true;

    for (const listener of [...this._destroyListeners]) {
      listener();
    }

    this._destroyListeners.clear();

    // Only the default view is ours. A view handed to `setView` stays
    // caller-owned - the backend assigns the application's active camera to its
    // root target on every `setView`, so releasing it here would take that
    // camera down with the target.
    this._defaultView.destroy();
    this._viewport.destroy();
    this._size.destroy();
  }

  protected _touch(): void {
    this._version++;
  }
}
