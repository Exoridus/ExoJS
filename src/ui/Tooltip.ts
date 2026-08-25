import type { Application } from '#core/Application';
import { Color } from '#core/Color';
import type { Duration } from '#core/Time';
import type { InteractionEvent } from '#input/InteractionEvent';
import { Container } from '#rendering/Container';
import { Graphics } from '#rendering/primitives/Graphics';
import type { RenderNode } from '#rendering/RenderNode';
import { Text } from '#rendering/text/Text';

import { UIRoot } from './UIRoot';

/** Options for {@link Tooltip}. */
export interface TooltipOptions {
  /** Label text to display. */
  text: string;
  /** Horizontal pixel offset from the pointer position. Default `12`. */
  offsetX?: number;
  /** Vertical pixel offset from the pointer position. Default `-28`. */
  offsetY?: number;
  /** Seconds to wait before the tooltip appears. Default `0.3`. */
  delay?: number;
  /** Background fill color as a packed 0xRRGGBB integer. Default `0x222222`. */
  background?: number;
  /** Text color as a packed 0xRRGGBB integer. Default `0xffffff`. */
  textColor?: number;
  /** Inner padding in pixels around the text. Default `6`. */
  padding?: number;
  /** Font size in pixels. Default `12`. */
  fontSize?: number;
}

/**
 * Hover tooltip attached to a {@link RenderNode}. Shows a small text label
 * near the pointer after a short delay when the pointer enters `target`, and
 * hides it immediately on pointer-out.
 *
 * The tooltip node is parented to the nearest {@link UIRoot} ancestor of
 * `target`, so it always renders in screen space above other content.
 *
 * The target must have `interactive = true` for the hover signals to fire.
 * The show delay is driven by the target's app's {@link Application.onFrame}
 * rather than a wall-clock timer, so it freezes while `app.scenes.pause()`
 * is active instead of finishing in the background - and only starts
 * counting once the target is attached to a live app.
 *
 * @example
 * ```ts
 * button.interactive = true;
 * const tip = new Tooltip(button, { text: 'Click me!' });
 * // Later:
 * tip.destroy();
 * ```
 */
export class Tooltip {
  private readonly _target: RenderNode;
  private readonly _offsetX: number;
  private readonly _offsetY: number;
  private readonly _delaySeconds: number;
  private readonly _background: number;
  private readonly _textColor: number;
  private readonly _padding: number;
  private readonly _fontSize: number;
  private readonly _text: string;

  private _node: Container | null = null;
  /** The app whose {@link Application.onFrame} is currently driving the pending show delay, or `null` while idle. */
  private _scheduledApp: Application | null = null;
  private _elapsedSeconds = 0;
  private _pendingX = 0;
  private _pendingY = 0;

  /**
   * Advances the pending show delay by real elapsed time, but only while the
   * target's current scene is not paused - so `app.scenes.pause()` freezes a
   * tooltip about to appear exactly like it freezes everything else, instead
   * of the delay quietly finishing in the background.
   */
  private readonly _onFrame = (time: Duration): void => {
    if (this._scheduledApp?.scenes.currentScene?.paused === true) {
      return;
    }

    this._elapsedSeconds += time.seconds;

    if (this._elapsedSeconds >= this._delaySeconds) {
      const x = this._pendingX;
      const y = this._pendingY;

      this._cancelTimer();
      this._show(x, y);
    }
  };

  private readonly _onPointerOver = (event: InteractionEvent): void => {
    // `Pointer.x`/`Pointer.y` are raw design-pixel screen coordinates,
    // independent of camera pan/zoom/rotate (see InteractionEvent.x's doc,
    // which contrasts the two) - the same space this tooltip's node is
    // positioned in, since it is always parented to the screen-space UI
    // layer. `event.x`/`event.y` read in `target`'s own layer space instead,
    // which for a world-tree target would drift under a moved camera.
    this._scheduleShow(event.pointer.x, event.pointer.y);
  };

  private readonly _onPointerOut = (): void => {
    this._hide();
  };

  public constructor(target: RenderNode, options: TooltipOptions) {
    this._target = target;
    this._text = options.text;
    this._offsetX = options.offsetX ?? 12;
    this._offsetY = options.offsetY ?? -28;
    this._delaySeconds = options.delay ?? 0.3;
    this._background = options.background ?? 0x222222;
    this._textColor = options.textColor ?? 0xffffff;
    this._padding = options.padding ?? 6;
    this._fontSize = options.fontSize ?? 12;

    target.onPointerOver.add(this._onPointerOver);
    target.onPointerOut.add(this._onPointerOut);
  }

  /** Remove the tooltip and clean up all listeners. */
  public destroy(): void {
    this._hide();
    this._target.onPointerOver.remove(this._onPointerOver);
    this._target.onPointerOut.remove(this._onPointerOut);
  }

  private _scheduleShow(x: number, y: number): void {
    this._cancelTimer();

    // Not attached to a live app - nothing to drive the delay (and, per
    // `_findUIRoot`, nothing that could show a tooltip either way).
    const app = this._target._getStage()?.app;

    if (app === undefined) {
      return;
    }

    this._pendingX = x;
    this._pendingY = y;
    this._elapsedSeconds = 0;
    this._scheduledApp = app;
    app.onFrame.add(this._onFrame);
  }

  private _show(x: number, y: number): void {
    // Remove any existing tooltip node first.
    this._removeNode();

    const uiRoot = this._findUIRoot();

    if (uiRoot === null) {
      return;
    }

    const hex = (packed: number): Color => new Color((packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff, 1);

    const label = new Text(this._text, {
      fillColor: hex(this._textColor),
      fontSize: this._fontSize,
    });

    const labelBounds = label.getLocalBounds();
    const w = labelBounds.width + this._padding * 2;
    const h = labelBounds.height + this._padding * 2;

    const bg = new Graphics();

    bg.fillColor = hex(this._background);
    bg.drawRoundedRectangle(0, 0, w, h, 4);

    label.setPosition(this._padding, this._padding);

    const node = new Container();

    node.addChild(bg);
    node.addChild(label);
    node.setPosition(x + this._offsetX, y + this._offsetY);

    this._node = node;
    uiRoot.addChild(node);
  }

  private _hide(): void {
    this._cancelTimer();
    this._removeNode();
  }

  /**
   * Destroys (not just detaches) the current tooltip node - `destroy()`
   * unlinks it from its parent itself (see `SceneNode.destroy`'s doc) and
   * recursively tears down its `Graphics`/`Text` children, so a hidden
   * tooltip's GPU-backed resources and signal listeners don't leak. Safe to
   * call when the node was already detached (or destroyed) externally.
   */
  private _removeNode(): void {
    if (this._node !== null) {
      if (!this._node.destroyed) {
        this._node.destroy();
      }

      this._node = null;
    }
  }

  private _cancelTimer(): void {
    if (this._scheduledApp !== null) {
      this._scheduledApp.onFrame.remove(this._onFrame);
      this._scheduledApp = null;
    }
  }

  /**
   * Walk up the target's parent chain to find the nearest {@link UIRoot}.
   * Returns `null` when the target is not attached to a UI layer.
   */
  private _findUIRoot(): UIRoot | null {
    let current = this._target.parent;

    while (current !== null) {
      if (current instanceof UIRoot) {
        return current;
      }

      current = current.parent;
    }

    return null;
  }
}
