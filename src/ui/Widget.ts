import { Container } from '#rendering/Container';

import type { UIRoot } from './UIRoot';

/** Anchor position of a widget within its container's box. */
export type WidgetAnchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

/** Normalized (0..1) horizontal/vertical factors for an anchor. */
const anchorFactors = (anchor: WidgetAnchor): readonly [number, number] => {
  let x = 0.5;
  let y = 0.5;

  if (anchor.endsWith('left')) {
    x = 0;
  } else if (anchor.endsWith('right')) {
    x = 1;
  }

  if (anchor.startsWith('top')) {
    y = 0;
  } else if (anchor.startsWith('bottom')) {
    y = 1;
  }

  return [x, y];
};

/**
 * Base class for UI widgets — a {@link Container} with an explicit layout size
 * (independent of child bounds / scale), an `enabled` flag, and optional
 * screen-edge anchoring that re-applies on resize.
 *
 * Subclasses redraw size-dependent content in {@link Widget._relayout} and
 * react to enable/disable in {@link Widget._onEnabledChanged}.
 */
export abstract class Widget extends Container {
  protected _uiWidth = 0;
  protected _uiHeight = 0;
  private _enabled = true;
  private _uiAnchor: WidgetAnchor | null = null;
  private _uiAnchorOffsetX = 0;
  private _uiAnchorOffsetY = 0;
  private _uiAnchorRoot: UIRoot | null = null;
  private readonly _onAnchorResize = (width: number, height: number): void => {
    this._applyAnchor(width, height);
  };

  /** Explicit layout width in pixels (not derived from children or scale). */
  public get uiWidth(): number {
    return this._uiWidth;
  }

  /** Explicit layout height in pixels (not derived from children or scale). */
  public get uiHeight(): number {
    return this._uiHeight;
  }

  /** Set the widget's layout size; triggers a redraw and re-anchors if anchored. */
  public setSize(width: number, height: number): this {
    const w = Math.max(0, width);
    const h = Math.max(0, height);

    if (this._uiWidth !== w || this._uiHeight !== h) {
      this._uiWidth = w;
      this._uiHeight = h;
      this._relayout();

      if (this._uiAnchorRoot !== null) {
        this._applyAnchor(this._uiAnchorRoot.screenWidth, this._uiAnchorRoot.screenHeight);
      }
    }

    return this;
  }

  /** Whether the widget responds to input. Disabled widgets typically dim and ignore clicks. */
  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(value: boolean) {
    if (this._enabled !== value) {
      this._enabled = value;
      this._onEnabledChanged(value);
    }
  }

  /**
   * Anchor this widget within `root`'s screen box at `anchor`, offset by
   * `(offsetX, offsetY)`. The position is recomputed whenever the screen
   * resizes. E.g. `widget.anchorIn(scene.ui, 'bottom-right', -20, -20)` pins it
   * to the bottom-right corner with a 20px margin.
   */
  public anchorIn(root: UIRoot, anchor: WidgetAnchor, offsetX = 0, offsetY = 0): this {
    this._uiAnchor = anchor;
    this._uiAnchorOffsetX = offsetX;
    this._uiAnchorOffsetY = offsetY;

    if (this._uiAnchorRoot !== root) {
      this._uiAnchorRoot?.onResize.remove(this._onAnchorResize);
      this._uiAnchorRoot = root;
      root.onResize.add(this._onAnchorResize);
    }

    this._applyAnchor(root.screenWidth, root.screenHeight);

    return this;
  }

  protected _applyAnchor(containerWidth: number, containerHeight: number): void {
    if (this._uiAnchor === null) {
      return;
    }

    const [ax, ay] = anchorFactors(this._uiAnchor);

    this.setPosition(ax * (containerWidth - this._uiWidth) + this._uiAnchorOffsetX, ay * (containerHeight - this._uiHeight) + this._uiAnchorOffsetY);
  }

  /** Redraw size-dependent content (background, child positions). Override in subclasses. */
  protected _relayout(): void {
    // Overridden by subclasses that draw a sized background.
  }

  /** React to an enabled/disabled change. Override in subclasses. */
  protected _onEnabledChanged(_enabled: boolean): void {
    // Overridden by interactive subclasses (e.g. Button dimming).
  }

  public override destroy(): void {
    this._uiAnchorRoot?.onResize.remove(this._onAnchorResize);
    this._uiAnchorRoot = null;
    super.destroy();
  }
}
