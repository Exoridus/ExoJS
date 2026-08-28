import { Signal } from '#core/Signal';
import type { RenderingContext } from '#rendering/RenderingContext';

import type { UITheme } from './theme';
import { ThemedContainer } from './ThemedContainer';

/**
 * Root of a scene's screen-fixed UI layer. Reached through {@link Scene.ui};
 * you do not construct it directly.
 *
 * Unlike {@link Scene.root}, the UI layer is **auto-rendered** by the
 * {@link SceneDirector} after `Scene.draw()`, through the
 * {@link RenderingContext.screenView} - so its children live in screen space
 * (origin top-left, `0..width` × `0..height`) and never scroll with the
 * camera. Pointer hit-testing and keyboard focus are routed to UI nodes in that
 * same screen space, ahead of the world layer.
 *
 * Add widgets with `scene.ui.addChild(...)`. The {@link UIRoot.onResize} signal
 * fires whenever the screen size changes, so anchored widgets can re-layout.
 *
 * The root also carries the layer's {@link UIRoot.theme}: widgets resolve their
 * skins from the nearest themed ancestor, so assigning a theme here restyles
 * every widget below that does not override it, and the layer's
 * {@link UIRoot.uiScale}, which makes the whole UI bigger or smaller without
 * touching a single widget.
 */
/** CSS reference pixels per millimetre: 96 per inch. */
const pixelsPerMillimeter = 96 / 25.4;

/** Smallest factor a layer can be scaled to; `0` would collapse the transform. */
const minimumScale = 0.01;

/** Round `value` to a multiple of `step`, leaving it alone when no step is set. */
const quantize = (value: number, step: number): number => (step > 0 ? Math.max(step, Math.round(value / step) * step) : value);

export class UIRoot extends ThemedContainer {
  /** Fires with `(width, height)` whenever the screen size changes. */
  public readonly onResize = new Signal<[width: number, height: number]>();

  private _screenWidth = 0;
  private _screenHeight = 0;
  private _viewWidth = 0;
  private _viewHeight = 0;
  private _uiScale = 1;
  private _uiScaleStep = 0;

  /**
   * Base theme for every widget in this layer. Widgets override parts of it
   * per subtree with `Widget.setTheme`; there is no global theme, so two UI
   * layers can carry different ones. Assigning restyles the whole layer at
   * once - every widget below repaints and re-lays out.
   */
  public override get theme(): UITheme {
    return this._theme;
  }

  public override set theme(value: UITheme) {
    if (this._theme !== value) {
      this._theme = value;
      this._cascadeTheme();
    }
  }

  /** @internal - a UI layer's theme is assigned, never inherited, so there is nothing to re-resolve here. */
  public override _refreshTheme(): void {
    // A UIRoot owns its theme outright; the cascade stops descending only into
    // its children, which it pushes itself when the theme is assigned.
  }

  /**
   * Width the UI is laid out against, in UI pixels - the screen width divided
   * by {@link UIRoot.uiScale}. Widgets position themselves in this box, so a
   * scaled layer is a smaller box of larger pixels rather than a clipped one.
   */
  public get screenWidth(): number {
    return this._screenWidth;
  }

  /** Height the UI is laid out against, in UI pixels. See {@link UIRoot.screenWidth}. */
  public get screenHeight(): number {
    return this._screenHeight;
  }

  /**
   * Size multiplier for the whole layer, default `1`. Raising it makes every
   * widget, its text and its touch target proportionally larger; lowering it
   * fits more on screen.
   *
   * This is a readability and touch-size control, not a resolution policy: the
   * logical coordinate system - and with it how much of the world is visible -
   * belongs to the application's {@link CanvasSizing}. Adapting to a different
   * aspect ratio is layout's job (anchors, {@link DockContainer}, {@link Stack});
   * the two mechanisms are complementary and a phone usually wants both.
   *
   * It is applied as this node's transform, so everything follows for free -
   * hit-testing and pointer routing included, since they already run through
   * it. {@link UIRoot.screenWidth} and {@link UIRoot.screenHeight} report the box
   * in the scaled units widgets are laid out in, and {@link UIRoot.onResize}
   * fires when the factor changes so anchored widgets re-place themselves.
   *
   * The layer's `scale` is owned by this property; assigning to it directly
   * desynchronises the reported box from what is drawn.
   */
  public get uiScale(): number {
    return this._uiScale;
  }

  public set uiScale(value: number) {
    const scale = quantize(Math.max(minimumScale, value), this._uiScaleStep);

    if (this._uiScale !== scale) {
      this._uiScale = scale;
      this.scale.set(scale, scale);
      this._updateScreenBox();
    }
  }

  /**
   * Rounding applied to {@link UIRoot.uiScale}, in scale units; `0` (the
   * default) accepts any factor. Set it to `0.25` to snap a slider or a density
   * heuristic to quarter steps: an arbitrary factor resamples nine-slice corners
   * and pixel art, and a handful of discrete sizes usually looks better than a
   * continuous one.
   */
  public get uiScaleStep(): number {
    return this._uiScaleStep;
  }

  public set uiScaleStep(value: number) {
    this._uiScaleStep = Math.max(0, value);
    this.uiScale = this._uiScale;
  }

  /**
   * The {@link UIRoot.uiScale} at which a control currently `sizePixels` UI
   * pixels across covers `millimeters` of physical screen, so a control stays
   * hittable with a finger on a small display.
   *
   * The conversion is the CSS reference pixel (96 per inch), which is what a
   * browser exposes: there is no API for the display's real physical size, and
   * `devicePixelRatio` describes the backing store rather than how large a pixel
   * is. Treat the result as a starting point for a density heuristic - it is
   * exact only where the platform honours the reference pixel.
   */
  public static scaleForTouchTarget(sizePixels: number, millimeters: number): number {
    if (sizePixels <= 0) {
      return 1;
    }

    return Math.max(1, (millimeters * pixelsPerMillimeter) / sizePixels);
  }

  /** @internal - render this UI layer screen-fixed, above the scene content. */
  public _render(context: RenderingContext): void {
    const view = context.screenView;

    this._viewWidth = view.width;
    this._viewHeight = view.height;
    this._updateScreenBox();

    context.render(this, { view });
  }

  /** Re-derive the laid-out box from the view and the scale, announcing a change. */
  private _updateScreenBox(): void {
    const width = this._viewWidth / this._uiScale;
    const height = this._viewHeight / this._uiScale;

    if (this._screenWidth !== width || this._screenHeight !== height) {
      this._screenWidth = width;
      this._screenHeight = height;
      this.onResize.dispatch(width, height);
    }
  }

  public override destroy(): void {
    this.onResize.destroy();
    super.destroy();
  }
}
