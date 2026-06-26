import { Color } from '#core/Color';
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
  private readonly _delayMs: number;
  private readonly _background: number;
  private readonly _textColor: number;
  private readonly _padding: number;
  private readonly _fontSize: number;
  private readonly _text: string;

  private _node: Container | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;

  private readonly _onPointerOver = (event: InteractionEvent): void => {
    this._scheduleShow(event.worldX, event.worldY);
  };

  private readonly _onPointerOut = (): void => {
    this._hide();
  };

  public constructor(target: RenderNode, options: TooltipOptions) {
    this._target = target;
    this._text = options.text;
    this._offsetX = options.offsetX ?? 12;
    this._offsetY = options.offsetY ?? -28;
    this._delayMs = (options.delay ?? 0.3) * 1000;
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
    this._timer = setTimeout(() => {
      this._show(x, y);
    }, this._delayMs);
  }

  private _show(x: number, y: number): void {
    // Remove any existing tooltip node first.
    this._removeNode();

    const uiRoot = this._findUIRoot();

    if (uiRoot === null) {
      return;
    }

    const hex = (packed: number): Color => {
      return new Color((packed >> 16) & 0xff, (packed >> 8) & 0xff, packed & 0xff, 1);
    };

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

  private _removeNode(): void {
    if (this._node !== null) {
      const p = this._node.parent;

      if (p !== null) {
        p.removeChild(this._node);
      }

      this._node = null;
    }
  }

  private _cancelTimer(): void {
    if (this._timer !== null) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  /**
   * Walk up the target's parent chain to find the nearest {@link UIRoot}.
   * Returns `null` when the target is not attached to a UI layer.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention -- UI is an acronym (cf. HTMLText)
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
