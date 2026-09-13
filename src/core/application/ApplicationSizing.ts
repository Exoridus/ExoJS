import { resolveAutoPixelRatio, watchAutoPixelRatio } from '#core/applicationCanvas';
import type { CanvasSizing, CanvasSizingContext, CanvasSizingHostMetrics, CanvasSizingMetrics } from '#core/sizing/CanvasSizing';
import type { PointLike } from '#math/PointLike';
import type { PlatformAdapter, PlatformSubscription } from '#platform/PlatformAdapter';
import type { RenderSurface } from '#platform/RenderSurface';

/** How an {@link ApplicationSizing} reports geometry it has committed. */
export interface ApplicationSizingHooks {
  /**
   * A commit that actually moved the geometry. Never fired for a commit that
   * changed nothing, so a listener may treat every call as a real change.
   */
  onCommit: (logicalWidth: number, logicalHeight: number) => void;
  /**
   * The host's device pixel ratio changed, and only an auto-resolved ratio
   * follows it. The geometry has not been re-derived yet - the owner is
   * expected to re-run its own resize, so that whatever else it keys off the
   * base resolution stays in step.
   */
  onPixelRatioChange: () => void;
}

/**
 * The canvas geometry of one application: its base (design) resolution, the
 * logical view drawn in, the CSS display box, the device pixel ratio, and the
 * {@link CanvasSizing} policy that derives all of them from the host.
 *
 * Three axes, deliberately independent: the logical view is the coordinate
 * system node positions and pointer coordinates live in, the render resolution
 * is what the backing store is sized from (times the pixel ratio), and the CSS
 * box is what the page lays out. A policy may move any of them without the
 * others.
 *
 * It knows a surface, an element and a host adapter, and nothing about
 * rendering: a committed geometry is reported through
 * {@link ApplicationSizingHooks.onCommit} rather than pushed into a backend
 * from here.
 */
export class ApplicationSizing {
  private _pixelRatio: number;
  private _baseWidth: number;
  private _baseHeight: number;
  private _logicalWidth: number;
  private _logicalHeight: number;
  /** Last CSS box written to the canvas element, or `null` while none has been. */
  private _cssWidth: number | null = null;
  private _cssHeight: number | null = null;
  private _policy: CanvasSizing | null = null;
  private _pixelRatioSubscription: PlatformSubscription | null = null;
  private readonly _hooks: ApplicationSizingHooks;
  private readonly _explicitPixelRatio: boolean;

  /**
   * `pixelRatio` left undefined resolves from the host and follows it for the
   * application's lifetime; an explicit value is the caller's fixed decision
   * and never tracks anything.
   *
   * Construction commits the base geometry immediately - the surface has to
   * carry its real backing-store size before a render context is acquired from
   * it - which is why {@link ApplicationSizingHooks.onCommit} has to tolerate
   * running before there is anything to resize.
   */
  public constructor(
    private readonly _surface: RenderSurface,
    private readonly _element: HTMLCanvasElement | null,
    options: {
      baseWidth: number;
      baseHeight: number;
      pixelRatio: number | undefined;
      hasPolicy: boolean;
      hooks: ApplicationSizingHooks;
    },
  ) {
    this._explicitPixelRatio = options.pixelRatio !== undefined;
    this._pixelRatio = options.pixelRatio ?? resolveAutoPixelRatio();
    this._baseWidth = options.baseWidth;
    this._baseHeight = options.baseHeight;
    this._logicalWidth = options.baseWidth;
    this._logicalHeight = options.baseHeight;
    this._hooks = options.hooks;

    this._commit(this._baseMetrics(!options.hasPolicy));
  }

  /**
   * Follow the host's device pixel ratio from here on. Separate from
   * construction because the surface has to carry its backing-store size before
   * a host adapter exists to watch, and a no-op for an explicit ratio, which is
   * the caller's fixed decision.
   */
  public watchPixelRatio(platform: PlatformAdapter): void {
    if (this._explicitPixelRatio) {
      return;
    }

    this._pixelRatioSubscription = watchAutoPixelRatio(platform, this._pixelRatio, ratio => {
      this._pixelRatio = ratio;
      this._hooks.onPixelRatioChange();
    });
  }

  /** Width of the logical coordinate system the application draws in. */
  public get width(): number {
    return this._logicalWidth;
  }

  public get height(): number {
    return this._logicalHeight;
  }

  /** The base (design) resolution the logical view and any policy are derived from. */
  public get baseWidth(): number {
    return this._baseWidth;
  }

  public get baseHeight(): number {
    return this._baseHeight;
  }

  /** Device pixels per CSS pixel the backing store is scaled by. */
  public get pixelRatio(): number {
    return this._pixelRatio;
  }

  /** The active policy, or `null` while the canvas simply stays at the base resolution. */
  public get policy(): CanvasSizing | null {
    return this._policy;
  }

  /**
   * Swap the strategy live: the outgoing policy is detached - its observers
   * released and the CSS box it wrote cleared - the canvas returns to the base
   * geometry, and only then is the new policy attached, so no remnant of the
   * previous one survives the switch. Assigning the policy that is already
   * active still detaches and re-attaches it, which is the supported way to
   * make one re-read a host it cannot observe by itself.
   */
  public set policy(policy: CanvasSizing | null) {
    this._detachPolicyAndReclaimCssBox();
    this._policy = policy;
    this._applyPolicy();
  }

  /**
   * Install the first policy, when there is nothing to swap out.
   *
   * Not the setter: that reclaims the CSS box the previous policy wrote before
   * it re-derives, and at this point the box in place is the base commit's
   * own. Reclaiming it would make the re-derivation look like a change and
   * report a commit for geometry that never moved.
   */
  public attachPolicy(policy: CanvasSizing | null): void {
    this._policy = policy;
    this._applyPolicy();
  }

  /**
   * Move to a new base resolution and re-derive the geometry from it.
   *
   * Under a policy that tracks its surroundings the base resolution is a
   * reference rather than a result: the policy is re-attached and immediately
   * commits the geometry the host actually calls for, so the logical size that
   * ends up reported need not be the one passed here.
   */
  public rebase(width: number, height: number): void {
    this._baseWidth = width;
    this._baseHeight = height;

    this._detachPolicyAndReclaimCssBox();
    this._applyPolicy();
  }

  /**
   * Map a canvas backing-store pixel coordinate into the logical coordinate
   * system. The whole logical view is always rendered across the whole backing
   * store, so this is a straight scale - and it is the mapping pointer
   * positions are expressed through, which is why they follow a policy that
   * changes the logical view without any further conversion.
   */
  public toLogical(backingStoreX: number, backingStoreY: number): PointLike {
    const backingWidth = this._surface.width || 1;
    const backingHeight = this._surface.height || 1;

    return {
      x: (backingStoreX / backingWidth) * this._logicalWidth,
      y: (backingStoreY / backingHeight) * this._logicalHeight,
    };
  }

  /**
   * Release the policy's observation while leaving the CSS box it wrote in
   * place.
   *
   * What teardown has to give up is the observing, not the geometry: the canvas
   * shows a frozen last frame from that point on, and collapsing its display
   * box out from under that is a visible artefact.
   */
  public detachPolicy(): void {
    this._policy?.detach();
    this._policy = null;
  }

  /** Release the host subscription. The policy, which the caller still owns, is left alone. */
  public destroy(): void {
    this._pixelRatioSubscription?.();
    this._pixelRatioSubscription = null;
  }

  /**
   * The geometry a canvas keeps when nothing is tracking its surroundings: the
   * base resolution in all three axes. `ownsCssBox` is false whenever a policy
   * is in play, so the display box is left to whoever does own it - the policy
   * itself, or the surrounding page under `ManualCanvasSizing`.
   */
  private _baseMetrics(ownsCssBox: boolean): CanvasSizingMetrics {
    return {
      cssWidth: ownsCssBox ? this._baseWidth : null,
      cssHeight: ownsCssBox ? this._baseHeight : null,
      logicalWidth: this._baseWidth,
      logicalHeight: this._baseHeight,
      renderWidth: this._baseWidth,
      renderHeight: this._baseHeight,
    };
  }

  /**
   * Put the canvas back on the base geometry and hand it to the active policy.
   *
   * The base commit is not redundant with what the policy is about to do: a
   * policy may decline to commit at all - a collapsed host, a manual one - and
   * the surface still has to be a valid size when it does.
   */
  private _applyPolicy(): void {
    this._apply(this._baseMetrics(this._policy === null));
    this._policy?.attach(this._createContext());
  }

  /**
   * Release the active policy and take back the CSS box committed under it.
   *
   * Only a box this application wrote is cleared, which is what leaves a page
   * that sizes the canvas itself - `ManualCanvasSizing` - holding the geometry
   * it set. And it is cleared here rather than inside the policy because this
   * is where the last committed value is remembered: a policy clearing the
   * element directly would leave that record claiming a size the element no
   * longer has, and the next policy to commit the very same size would then
   * write nothing at all. A policy stays responsible for any other styling it
   * applies itself.
   */
  private _detachPolicyAndReclaimCssBox(): void {
    this._policy?.detach();

    if (this._cssWidth === null) {
      return;
    }

    this._cssWidth = null;
    this._cssHeight = null;

    if (this._element !== null) {
      this._element.style.width = '';
      this._element.style.height = '';
    }
  }

  /**
   * The one channel a sizing policy changes the canvas through: commit the
   * geometry, then report it. A commit that changes nothing stops here rather
   * than reporting again.
   *
   * The policy reaches it through the context it was attached with.
   */
  private _apply(metrics: CanvasSizingMetrics): void {
    if (!this._commit(metrics)) {
      return;
    }

    this._hooks.onCommit(this._logicalWidth, this._logicalHeight);
  }

  /**
   * Write `metrics` onto the surface, the CSS box and the logical size, and
   * report whether anything actually moved.
   *
   * Nothing is written for a geometry that is already in place: assigning
   * `canvas.width` discards the drawing buffer even when the value is
   * unchanged, and a `ResizeObserver` fires for changes that leave the observed
   * box the size it was.
   *
   * A non-positive size in any of the three axes is ignored outright, the CSS
   * box included - a fixed-resolution policy keeps its logical and render sizes
   * whatever the host does, so a collapsed host reaches this only through the
   * display box. That is the state of a host with no layout yet, or one that
   * has collapsed, and there is no geometry to invent for it: the previous one
   * is kept until the host has a size again.
   */
  private _commit(metrics: CanvasSizingMetrics): boolean {
    if (metrics.logicalWidth <= 0 || metrics.logicalHeight <= 0 || metrics.renderWidth <= 0 || metrics.renderHeight <= 0) {
      return false;
    }

    if ((metrics.cssWidth !== null && metrics.cssWidth <= 0) || (metrics.cssHeight !== null && metrics.cssHeight <= 0)) {
      return false;
    }

    const backingWidth = Math.max(1, Math.round(metrics.renderWidth * this._pixelRatio));
    const backingHeight = Math.max(1, Math.round(metrics.renderHeight * this._pixelRatio));
    const cssChanged =
      metrics.cssWidth !== null && metrics.cssHeight !== null && (metrics.cssWidth !== this._cssWidth || metrics.cssHeight !== this._cssHeight);
    const backingChanged = backingWidth !== this._surface.width || backingHeight !== this._surface.height;
    const logicalChanged = metrics.logicalWidth !== this._logicalWidth || metrics.logicalHeight !== this._logicalHeight;

    if (!cssChanged && !backingChanged && !logicalChanged) {
      return false;
    }

    this._logicalWidth = metrics.logicalWidth;
    this._logicalHeight = metrics.logicalHeight;

    if (backingChanged) {
      this._surface.width = backingWidth;
      this._surface.height = backingHeight;
    }

    if (cssChanged && this._element !== null && metrics.cssWidth !== null && metrics.cssHeight !== null) {
      this._cssWidth = metrics.cssWidth;
      this._cssHeight = metrics.cssHeight;
      this._element.style.width = `${metrics.cssWidth}px`;
      this._element.style.height = `${metrics.cssHeight}px`;
    }

    return true;
  }

  /**
   * The view of this application a {@link CanvasSizing} works against.
   *
   * Rebuilt for every attach rather than kept live, which is why re-assigning
   * the policy is what makes one re-read a host it cannot observe: the base
   * resolution and the parent element are as they were when the policy took the
   * context.
   */
  private _createContext(): CanvasSizingContext {
    return {
      baseWidth: this._baseWidth,
      baseHeight: this._baseHeight,
      pixelRatio: this._pixelRatio,
      surface: this._surface,
      element: this._element,
      host: this._element?.parentElement ?? null,
      measureHost: (): CanvasSizingHostMetrics | null => {
        const host = this._element?.parentElement ?? null;

        return host === null ? null : { width: host.clientWidth, height: host.clientHeight };
      },
      apply: (metrics: CanvasSizingMetrics): void => {
        this._apply(metrics);
      },
    };
  }
}
