import { Color } from '#core/Color';
import type { Stage } from '#core/Stage';
import { Rectangle } from '#math/Rectangle';
import { Container } from '#rendering/Container';

import type { ScrollbarVisibility } from './Scrollbar';
import { Scrollbar } from './Scrollbar';
import type { UIBackground, UIBackgroundInput, UIBackgroundOptions } from './theme';
import { applyUIFillPatch, backgroundOptionsFrom, createUIBackground } from './theme';
import { Widget } from './Widget';
import { WidgetBackground } from './WidgetBackground';

const transparentBackground: UIBackground = { kind: 'none' };

/**
 * The surface a background input asks for. A `ScrollContainer` has no themed
 * surface to patch, so a colour becomes a plain fill rather than an override.
 */
const surfaceFrom = (input: UIBackgroundInput, options: UIBackgroundOptions): UIBackground =>
  input instanceof Color ? applyUIFillPatch(transparentBackground, { color: input }) : createUIBackground(input, options);

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
  /** When the scrollbars are shown. Default `'auto'`. */
  scrollbars?: ScrollbarVisibility;
  /** Scrollbar extent across its axis, in pixels. Default `12`. */
  scrollbarThickness?: number;
  /**
   * A surface painted behind the content, stated as a colour, a texture, a
   * region or a descriptor. Absent leaves the container transparent.
   */
  background?: UIBackgroundInput;
  /** Source-texture slice widths for a texture `background`; defaults to a third per axis. */
  slices?: UIBackgroundOptions['slices'];
  /** Destination border widths for a texture `background`; defaults to `slices`. */
  border?: UIBackgroundOptions['border'];
  modes?: UIBackgroundOptions['modes'];
  /** Paint a texture `background` flat with this fit instead of slicing it. */
  fit?: UIBackgroundOptions['fit'];
}

/**
 * The content holder of a {@link ScrollContainer}, which reports what it holds
 * back to its owner so that adding or removing an item updates the scroll range
 * without the caller asking for it.
 *
 * @internal
 */
class ScrollContent extends Container {
  private readonly _onChanged: () => void;

  public constructor(onChanged: () => void) {
    super();
    this._onChanged = onChanged;
  }

  protected override _onChildListChanged(): void {
    this._onChanged();
  }
}

/**
 * Clipped container that scrolls its content with the mouse wheel or its
 * scrollbars.
 *
 * Add child nodes to {@link ScrollContainer.content} rather than to the
 * `ScrollContainer` itself. The content container is offset as the user scrolls,
 * while the outer widget is clipped to its declared `width` × `height`.
 *
 * Scrollbars overlay the content rather than shrinking it, so the visible box
 * stays the size it was declared at whether or not a bar is showing. With the
 * default `'auto'` policy a bar appears only while its axis actually overflows;
 * `'always'` keeps it, and `'never'` builds none at all. They paint the
 * `scrollbarTrack` and `scrollbarThumb` roles of the inherited theme.
 *
 * The scroll range follows what the content holds: adding or removing an item
 * updates it. A change the container cannot observe - a child of the content
 * that resized itself - needs {@link ScrollContainer.refresh}.
 *
 * Mouse-wheel events from the global {@link InputSystem} are consumed only
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
  /** Add children here - not to the `ScrollContainer` itself. */
  public readonly content: Container;

  private readonly _surface = new WidgetBackground(this, 0);
  private readonly _direction: ScrollDirection;
  private readonly _visibility: ScrollbarVisibility;
  private readonly _scrollbarThickness: number;
  private readonly _verticalBar: Scrollbar | null = null;
  private readonly _horizontalBar: Scrollbar | null = null;
  private _background: UIBackground | null = null;
  private _scrollX = 0;
  private _scrollY = 0;
  private _refreshing = false;
  /** Scratch rect reused by {@link ScrollContainer.updateBounds} - avoids an allocation on every bounds rebuild. */
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
    this._visibility = options.scrollbars ?? 'auto';
    this._scrollbarThickness = options.scrollbarThickness ?? 12;
    this.content = new ScrollContent(() => {
      this.refresh();
    });
    this.clip = true;
    this.interactive = true;

    if (options.background !== undefined) {
      this._background = surfaceFrom(options.background, backgroundOptionsFrom(options));
    }

    this.addChild(this.content);

    if (this._visibility !== 'never') {
      if (this._direction !== 'horizontal') {
        this._verticalBar = this._createBar('vertical');
      }

      if (this._direction !== 'vertical') {
        this._horizontalBar = this._createBar('horizontal');
      }
    }

    this.setSize(options.width, options.height);
  }

  /** The axis (or axes) this container scrolls along. Fixed at construction. */
  public get direction(): ScrollDirection {
    return this._direction;
  }

  /** When the scrollbars are shown. Fixed at construction. */
  public get scrollbars(): ScrollbarVisibility {
    return this._visibility;
  }

  /** The vertical scrollbar, or `null` when this container has none. */
  public get verticalScrollbar(): Scrollbar | null {
    return this._verticalBar;
  }

  /** The horizontal scrollbar, or `null` when this container has none. */
  public get horizontalScrollbar(): Scrollbar | null {
    return this._horizontalBar;
  }

  /** The node painting the background, or `null` while it paints nothing. */
  public get backgroundNode(): WidgetBackground['node'] {
    return this._surface.node;
  }

  /** The background this container paints, or `null` while it paints none. */
  public get background(): UIBackground | null {
    return this._background;
  }

  /**
   * Set the surface painted behind the content from a colour, a texture, a
   * region or a descriptor; `null` returns the container to transparent.
   */
  public setBackground(background: UIBackgroundInput | null, options: UIBackgroundOptions = {}): this {
    this._background = background === null ? null : surfaceFrom(background, options);
    this._invalidatePaint();

    return this;
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
   * Re-measure the content and update the scroll range and the scrollbars.
   * Adding and removing content does this on its own; this is for the change
   * the container cannot observe - a child of the content that resized itself.
   */
  public refresh(): this {
    this.scrollTo(this._scrollX, this._scrollY);

    return this;
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
    const extent = this._contentExtent();

    const maxX = Math.max(0, extent.width - this._uiWidth);
    const maxY = Math.max(0, extent.height - this._uiHeight);

    this._scrollX = Math.max(0, Math.min(x, maxX));
    this._scrollY = Math.max(0, Math.min(y, maxY));

    this.content.setPosition(-this._scrollX, -this._scrollY);
    this._syncScrollbars(extent);
  }

  protected override _repaint(): void {
    this._surface.apply(this._background ?? transparentBackground, this._uiWidth, this._uiHeight);
  }

  protected override _relayout(): void {
    super._relayout();
    // Re-clamp scroll in case the widget was resized, and re-place the bars.
    this.scrollTo(this._scrollX, this._scrollY);
    // uiWidth/uiHeight just changed - the viewport rect `updateBounds` builds
    // from them is now stale.
    this._invalidateBoundsCascade();
  }

  /**
   * Bounds this widget to its declared viewport - `(0, 0, uiWidth, uiHeight)`
   * in world space - instead of {@link Container.updateBounds}'s default
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
   * check) - a scrolled-out child's own geometry no longer makes the
   * `ScrollContainer` itself claim a point far outside what is actually
   * rendered.
   */
  public override contains(x: number, y: number): boolean {
    return this.getBounds().contains(x, y) && super.contains(x, y);
  }

  /** @internal - subscribe to the app's wheel signal when entering the scene tree. */
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
    this._surface.destroy();
    this._viewportRect.destroy();
    super.destroy();
  }

  /** Build one bar and wire its drag back into this container's scroll position. */
  private _createBar(orientation: 'vertical' | 'horizontal'): Scrollbar {
    const bar = new Scrollbar({ orientation, thickness: this._scrollbarThickness });

    bar.onScroll.add(offset => {
      if (orientation === 'vertical') {
        this.scrollTo(this._scrollX, offset);
      } else {
        this.scrollTo(offset, this._scrollY);
      }
    });

    this.addChild(bar);

    return bar;
  }

  /**
   * The content's extent in this container's own space. The content's bounds
   * are a world-space box, so a scaled UI layer would otherwise report a range
   * in screen pixels against a viewport measured in layout pixels.
   */
  private _contentExtent(): { width: number; height: number } {
    const bounds = this.content.getBounds();
    const transform = this.getGlobalTransform();
    const scaleX = Math.hypot(transform.a, transform.c) || 1;
    const scaleY = Math.hypot(transform.b, transform.d) || 1;

    return { width: bounds.width / scaleX, height: bounds.height / scaleY };
  }

  /**
   * Place the bars and hand them the current range. Re-entrant through
   * `Widget.setSize`, which lands back here via `_relayout`, so the guard is
   * what keeps sizing a bar from re-measuring the content underneath it.
   */
  private _syncScrollbars(extent: { width: number; height: number }): void {
    if (this._refreshing || (this._verticalBar === null && this._horizontalBar === null)) {
      return;
    }

    this._refreshing = true;

    try {
      const vertical = this._verticalBar;
      const horizontal = this._horizontalBar;
      const verticalShown = vertical !== null && (this._visibility === 'always' || extent.height > this._uiHeight);
      const horizontalShown = horizontal !== null && (this._visibility === 'always' || extent.width > this._uiWidth);
      const verticalGap = verticalShown ? this._scrollbarThickness : 0;
      const horizontalGap = horizontalShown ? this._scrollbarThickness : 0;

      if (vertical !== null) {
        vertical.visible = verticalShown;
        vertical.setRange(this._uiHeight, extent.height);
        vertical.offset = this._scrollY;
        vertical.setLength(Math.max(0, this._uiHeight - horizontalGap));
        vertical.setPosition(this._uiWidth - this._scrollbarThickness, 0);
      }

      if (horizontal !== null) {
        horizontal.visible = horizontalShown;
        horizontal.setRange(this._uiWidth, extent.width);
        horizontal.offset = this._scrollX;
        horizontal.setLength(Math.max(0, this._uiWidth - verticalGap));
        horizontal.setPosition(0, this._uiHeight - this._scrollbarThickness);
      }
    } finally {
      this._refreshing = false;
    }
  }
}
