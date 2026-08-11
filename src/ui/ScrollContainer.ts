import type { Stage } from '#core/Stage';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';

import { Widget } from './Widget';

/** Direction(s) in which a {@link ScrollContainer} can scroll. */
export type ScrollDirection = 'vertical' | 'horizontal' | 'both';

/** Options for {@link ScrollContainer}. */
export interface ScrollContainerOptions {
  /** Visible width in pixels. */
  width: number;
  /** Visible height in pixels. */
  height: number;
  /** Scroll axis. Default `'vertical'`. */
  direction?: ScrollDirection;
}

/**
 * Clipped container that scrolls its content via the mouse wheel.
 *
 * Add child nodes to {@link ScrollContainer.content} rather than to the
 * `ScrollContainer` itself. The content container is offset as the user scrolls,
 * while the outer widget is clipped to its declared `width` × `height`.
 *
 * Mouse-wheel events from the global {@link InputManager} are consumed only
 * when the pointer is within the widget's bounds. The container subscribes to
 * the app's `onMouseWheel` signal when it enters the scene tree, and
 * unsubscribes on detach.
 *
 * @example
 * ```ts
 * const scroll = new ScrollContainer({ width: 300, height: 400 });
 * for (let i = 0; i < 20; i++) {
 *   scroll.content.addChild(new Label(`Item ${i}`).setPosition(0, i * 30));
 * }
 * scene.ui.addChild(scroll);
 * ```
 */
export class ScrollContainer extends Widget {
  /** Add children here — not to the `ScrollContainer` itself. */
  public readonly content: Container;

  private readonly _direction: ScrollDirection;
  private _scrollX = 0;
  private _scrollY = 0;
  /** Scratch rect reused by {@link ScrollContainer.updateBounds} — avoids an allocation on every bounds rebuild. */
  private readonly _viewportRect = new Rectangle();

  private readonly _onWheel = (deltaX: number, deltaY: number): void => {
    const pos = this._stage?.app?.input.getPrimaryPointerPosition();

    if (pos === null || pos === undefined) {
      return;
    }

    const bounds = this.getBounds();

    if (!bounds.contains(pos.x, pos.y)) {
      return;
    }

    this.scrollBy(this._direction !== 'vertical' ? deltaX : 0, this._direction !== 'horizontal' ? deltaY : 0);
  };

  public constructor(options: ScrollContainerOptions) {
    super();

    this._direction = options.direction ?? 'vertical';
    this.content = new Container();
    this.clip = true;
    this.interactive = true;

    this.addChild(this.content);
    this.setSize(options.width, options.height);
  }

  /** The axis (or axes) this container scrolls along. Fixed at construction. */
  public get direction(): ScrollDirection {
    return this._direction;
  }

  /** Current horizontal scroll position in pixels. */
  public get scrollX(): number {
    return this._scrollX;
  }

  /** Current vertical scroll position in pixels. */
  public get scrollY(): number {
    return this._scrollY;
  }

  /**
   * Scroll by `(dx, dy)` pixels, clamped to the scrollable content range.
   * Positive values scroll right / down; negative values scroll left / up.
   */
  public scrollBy(dx: number, dy: number): void {
    this.scrollTo(this._scrollX + dx, this._scrollY + dy);
  }

  /**
   * Scroll to an absolute `(x, y)` position in pixels, clamped to the
   * content range so the content never scrolls past its edges.
   */
  public scrollTo(x: number, y: number): void {
    const contentBounds = this.content.getBounds();

    const maxX = Math.max(0, contentBounds.width - this._uiWidth);
    const maxY = Math.max(0, contentBounds.height - this._uiHeight);

    this._scrollX = Math.max(0, Math.min(x, maxX));
    this._scrollY = Math.max(0, Math.min(y, maxY));

    this.content.setPosition(-this._scrollX, -this._scrollY);
  }

  protected override _relayout(): void {
    // Re-clamp scroll in case the widget was resized.
    this.scrollTo(this._scrollX, this._scrollY);
    // uiWidth/uiHeight just changed — the viewport rect `updateBounds` builds
    // from them is now stale.
    this._invalidateBoundsCascade();
  }

  /**
   * Bounds this widget to its declared viewport — `(0, 0, uiWidth, uiHeight)`
   * in world space — instead of {@link Container.updateBounds}'s default
   * union of `content`'s (scrolled, often far larger) child extent.
   *
   * This is what {@link ScrollContainer.clip} clips descendants to (a `null`
   * `clipShape` clips to `getBounds()`) and what mouse-wheel routing gates
   * on, so both now agree with what is actually visible instead of the full,
   * unclipped content extent.
   */
  public override updateBounds(): this {
    this._viewportRect.set(0, 0, this._uiWidth, this._uiHeight);
    this._bounds.reset().addRect(this._viewportRect, this.getGlobalTransform());

    return this;
  }

  /**
   * A point only hits this widget when it both falls within the viewport
   * AND lands on a visible child ({@link Container.contains}'s child-union
   * check) — a scrolled-out child's own geometry no longer makes the
   * `ScrollContainer` itself claim a point far outside what is actually
   * rendered.
   */
  public override contains(x: number, y: number): boolean {
    return this.getBounds().contains(x, y) && super.contains(x, y);
  }

  /** @internal — subscribe to the app's wheel signal when entering the scene tree. */
  public override _setStage(stage: Stage | null): void {
    const prevApp = this._stage?.app;
    const nextApp = stage?.app;

    super._setStage(stage);

    if (prevApp !== nextApp) {
      prevApp?.input.onMouseWheel.remove(this._onWheel);
      nextApp?.input.onMouseWheel.add(this._onWheel);
    }
  }

  public override destroy(): void {
    this._stage?.app?.input.onMouseWheel.remove(this._onWheel);
    this._viewportRect.destroy();
    super.destroy();
  }
}
