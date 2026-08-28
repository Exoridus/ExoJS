import type { CheckableOptions } from './CheckableWidget';
import { CheckableWidget } from './CheckableWidget';
import type { UIThemeRole } from './theme';
import { WidgetBackground } from './WidgetBackground';

/** Options for {@link Checkbox}. */
export interface CheckboxOptions extends CheckableOptions {
  /** Edge length of the box, in pixels. Default `20`. */
  size?: number;
  /** Inset of the mark inside the box, in pixels. Default a quarter of `size`. */
  markInset?: number;
}

/**
 * A box that is either ticked or not, with an optional label beside it.
 *
 * Clicking it, tapping it, or pressing Enter or Space while it holds focus
 * flips {@link CheckableWidget.checked} and fires
 * {@link CheckableWidget.onChange}. The box paints the `checkbox` role of the
 * inherited theme and the tick the `checkboxMark` role; the box carries the
 * hover, pressed, focused and disabled states.
 *
 * @example
 * ```ts
 * const fullscreen = new Checkbox({ label: 'Fullscreen', checked: true });
 * fullscreen.onChange.add(checked => applyFullscreen(checked));
 * ```
 */
export class Checkbox extends CheckableWidget {
  private readonly _box = new WidgetBackground(this, 0);
  private readonly _mark = new WidgetBackground(this, 1);
  private readonly _size: number;
  private readonly _markInset: number;

  public constructor(options: CheckboxOptions = {}) {
    super(options, 'checkbox');

    this._size = options.size ?? 20;
    this._markInset = options.markInset ?? this._size / 4;
    this._invalidateLayout();
  }

  /** Edge length of the box, in pixels. Fixed at construction. */
  public get boxSize(): number {
    return this._size;
  }

  /** The node painting the box, or `null` while it paints nothing. */
  public get boxNode(): WidgetBackground['node'] {
    return this._box.node;
  }

  /** The node painting the tick, or `null` while the box is unticked. */
  public get markNode(): WidgetBackground['node'] {
    return this._mark.node;
  }

  protected override _textRole(): UIThemeRole {
    return 'checkbox';
  }

  protected override _controlSize(): { width: number; height: number } {
    return { width: this._size, height: this._size };
  }

  protected override _paintControl(): void {
    const markSize = Math.max(0, this._size - this._markInset * 2);

    this._box.apply(this._skin('checkbox').background, this._size, this._size);
    this._mark.apply(this._checked ? this._skin('checkboxMark').background : noMark, markSize, markSize);
    this._mark.node?.setPosition(this._markInset, this._markInset);
  }

  public override destroy(): void {
    this._box.destroy();
    this._mark.destroy();
    super.destroy();
  }
}

const noMark = { kind: 'none' } as const;
