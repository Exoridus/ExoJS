import { Container } from '#rendering/Container';
import type { RenderNode } from '#rendering/RenderNode';

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
  private _effectiveEnabled = true;
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

  /**
   * The widget's own enabled flag, independent of any ancestor's. Disabling a
   * container widget does not change this on its children - see
   * {@link effectiveEnabled} for the value interaction and keyboard focus
   * actually consult, and for what disabling a container does to them.
   */
  public get enabled(): boolean {
    return this._enabled;
  }

  public set enabled(value: boolean) {
    if (this._enabled !== value) {
      this._enabled = value;
      this._refreshEffectiveEnabled();
    }
  }

  /**
   * Whether the widget responds to input right now: its own {@link enabled}
   * flag AND every Widget ancestor's - `ownEnabled && parent.effectiveEnabled`.
   * This is what interaction (e.g. {@link Button} activation) and keyboard
   * focus actually gate on. Disabled widgets typically dim and ignore clicks,
   * and are skipped by keyboard focus - they drop out of the Tab order and
   * reject programmatic focus while effectively disabled.
   *
   * Disabling a container widget does not touch its children's OWN
   * {@link enabled} flag - only their effective state. Re-enabling the
   * container makes a child whose own flag was never touched effectively
   * enabled again automatically.
   */
  public get effectiveEnabled(): boolean {
    return this._effectiveEnabled;
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

  /**
   * React to an {@link effectiveEnabled} change - fired whenever it flips,
   * whether the widget's own {@link enabled} flag changed or an ancestor
   * widget's did. Override in subclasses.
   */
  protected _onEnabledChanged(_effectiveEnabled: boolean): void {
    // Overridden by interactive subclasses (e.g. Button dimming).
  }

  /**
   * Recompute {@link effectiveEnabled} from the current own flag and parent
   * chain. No-ops if it did not actually change; otherwise fires
   * {@link _onEnabledChanged} and pushes the same recompute into every Widget
   * descendant - an ancestor's effective state changing is the only way a
   * descendant's effective state can change without its own {@link enabled}
   * flag ever being touched. Stops descending into a subtree the moment its
   * own effective value turns out unchanged: everything beneath it is
   * derived from that same value, so it cannot have changed either.
   */
  private _refreshEffectiveEnabled(): void {
    const next = this._enabled && this._parentEffectiveEnabled();

    if (next === this._effectiveEnabled) {
      return;
    }

    this._effectiveEnabled = next;
    this._onEnabledChanged(next);

    for (const child of this.children) {
      this._cascadeEffectiveEnabledInto(child);
    }
  }

  /** Push an effective-enabled recompute into `node`: directly if it is a Widget, or forwarded to Widget descendants through any plain (non-Widget) Container in between. */
  private _cascadeEffectiveEnabledInto(node: RenderNode): void {
    if (node instanceof Widget) {
      node._refreshEffectiveEnabled();

      return;
    }

    if (node instanceof Container) {
      for (const child of node.children) {
        this._cascadeEffectiveEnabledInto(child);
      }
    }
  }

  /** The nearest Widget ancestor's {@link effectiveEnabled}, or `true` when this widget has none (root effective state is always enabled). */
  private _parentEffectiveEnabled(): boolean {
    for (let current = this.parent; current !== null; current = current.parent) {
      if (current instanceof Widget) {
        return current.effectiveEnabled;
      }
    }

    return true;
  }

  /**
   * @internal - recompute {@link effectiveEnabled} on reparenting (attach or
   * detach), since the nearest Widget ancestor - and so the value inherited
   * from it - can change without this widget's own {@link enabled} ever
   * being touched.
   */
  public override _setParent(parent: Container | null): void {
    super._setParent(parent);
    this._refreshEffectiveEnabled();
  }

  public override destroy(): void {
    this._uiAnchorRoot?.onResize.remove(this._onAnchorResize);
    this._uiAnchorRoot = null;
    super.destroy();
  }
}
