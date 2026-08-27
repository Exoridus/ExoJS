import { Signal } from '#core/Signal';
import type { RenderingContext } from '#rendering/RenderingContext';

import { ThemedContainer } from './ThemedContainer';
import type { UITheme } from './theme';

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
 * every widget below that does not override it.
 */
export class UIRoot extends ThemedContainer {
  /** Fires with `(width, height)` whenever the screen size changes. */
  public readonly onResize = new Signal<[width: number, height: number]>();

  private _screenWidth = 0;
  private _screenHeight = 0;

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

  /** Screen width the UI is laid out against, in logical pixels. */
  public get screenWidth(): number {
    return this._screenWidth;
  }

  /** Screen height the UI is laid out against, in logical pixels. */
  public get screenHeight(): number {
    return this._screenHeight;
  }

  /** @internal - render this UI layer screen-fixed, above the scene content. */
  public _render(context: RenderingContext): void {
    const view = context.screenView;

    if (this._screenWidth !== view.width || this._screenHeight !== view.height) {
      this._screenWidth = view.width;
      this._screenHeight = view.height;
      this.onResize.dispatch(view.width, view.height);
    }

    context.render(this, { view });
  }

  public override destroy(): void {
    this.onResize.destroy();
    super.destroy();
  }
}
