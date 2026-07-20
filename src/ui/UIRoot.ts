import { Signal } from '#core/Signal';
import { Container } from '#rendering/Container';
import type { RenderingContext } from '#rendering/RenderingContext';

/**
 * Root of a scene's screen-fixed UI layer. Reached through {@link Scene.ui};
 * you do not construct it directly.
 *
 * Unlike {@link Scene.root}, the UI layer is **auto-rendered** by the
 * {@link SceneDirector} after `Scene.draw()`, through the
 * {@link RenderingContext.screenView} — so its children live in screen space
 * (origin top-left, `0..width` × `0..height`) and never scroll with the
 * camera. Pointer hit-testing and keyboard focus are routed to UI nodes in that
 * same screen space, ahead of the world layer.
 *
 * Add widgets with `scene.ui.addChild(...)`. The {@link UIRoot.onResize} signal
 * fires whenever the screen size changes, so anchored widgets can re-layout.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention -- UI is an acronym (cf. HTMLText)
export class UIRoot extends Container {
  /** Fires with `(width, height)` whenever the screen size changes. */
  public readonly onResize = new Signal<[width: number, height: number]>();

  private _screenWidth = 0;
  private _screenHeight = 0;

  /** Screen width the UI is laid out against, in logical pixels. */
  public get screenWidth(): number {
    return this._screenWidth;
  }

  /** Screen height the UI is laid out against, in logical pixels. */
  public get screenHeight(): number {
    return this._screenHeight;
  }

  /** @internal — render this UI layer screen-fixed, above the scene content. */
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
