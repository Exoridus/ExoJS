import { Signal } from '#core/Signal';
import type { KeyEvent } from '#input/KeyEvent';
import { Keyboard } from '#input/types';
import { Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import type { UIThemeRole, UIWidgetState } from './theme';
import { resolveUISkin } from './theme';
import { Widget } from './Widget';

/** Options shared by the two-state controls ({@link Checkbox}, {@link Toggle}). */
export interface CheckableOptions {
  /** Initial state. Default `false`. */
  checked?: boolean;
  /** Text drawn beside the control; omitted draws the control alone. */
  label?: string;
  /** Gap between the control and its label, in pixels. Default `8`. */
  labelGap?: number;
  /** Text style overrides on top of the skin's. */
  textStyle?: TextStyleOptions;
}

/**
 * Shared machinery of the two-state controls: an interaction state machine like
 * {@link Button}'s, an orthogonal `checked` value, keyboard activation and an
 * optional label.
 *
 * The widget sizes itself to its control plus its label. Calling
 * {@link Widget.setSize} takes that over; the control keeps its own extent and
 * the label its measured one.
 *
 * @internal
 */
export abstract class CheckableWidget extends Widget {
  /** Fires whenever {@link checked} changes, however it changed. */
  public readonly onChange = new Signal<[checked: boolean, widget: CheckableWidget]>();

  protected _checked: boolean;
  private readonly _labelNode: Text | null;
  private readonly _labelGap: number;
  private readonly _textStyle: TextStyleOptions | null;
  private _appliedText: TextStyleOptions | null = null;
  private _pointerInside = false;
  private _explicitSize = false;

  protected constructor(options: CheckableOptions, textRole: UIThemeRole) {
    super();

    this._checked = options.checked ?? false;
    this._labelGap = options.labelGap ?? 8;
    this._textStyle = options.textStyle ?? null;

    if (options.label === undefined) {
      this._labelNode = null;
    } else {
      this._appliedText = resolveUISkin(this.theme[textRole], 'normal').text;
      this._labelNode = new Text(options.label, { ...this._appliedText, ...this._textStyle });
      this.addChild(this._labelNode);
    }

    this.interactive = true;
    this.focusable = true;
    this.cursor = 'pointer';
    this._trackFocus();

    this.onPointerOver.add(this._onPointerOver);
    this.onPointerOut.add(this._onPointerOut);
    this.onPointerDown.add(this._onPointerDown);
    this.onPointerUp.add(this._onPointerUp);
    this.onPointerTap.add(this._onTap);
    this.onKeyDown.add(this._onKey);
  }

  /** Whether the control is on. Assigning fires {@link onChange}. */
  public get checked(): boolean {
    return this._checked;
  }

  public set checked(value: boolean) {
    if (this._checked !== value) {
      this._checked = value;
      this._invalidateLayout();
      this.onChange.dispatch(value, this);
    }
  }

  /** Flip {@link checked}. */
  public toggle(): this {
    this.checked = !this._checked;

    return this;
  }

  /** The label text, or `''` when the control was built without one. */
  public get label(): string {
    return this._labelNode?.text ?? '';
  }

  public set label(value: string) {
    if (this._labelNode !== null && this._labelNode.text !== value) {
      this._labelNode.text = value;
      this._invalidateLayout();
    }
  }

  /** The {@link Text} node drawing the label, or `null` when there is none. */
  public get labelNode(): Text | null {
    return this._labelNode;
  }

  /** The state the control currently paints in. */
  public get state(): UIWidgetState {
    return this._skinState;
  }

  public override setSize(width: number, height: number): this {
    this._explicitSize = true;

    return super.setSize(width, height);
  }

  /** The control's own extent, independent of the label beside it. */
  protected abstract _controlSize(): { width: number; height: number };

  /** Paint the control itself at `(0, 0)`, sized by {@link _controlSize}. */
  protected abstract _paintControl(): void;

  protected override _relayout(): void {
    const control = this._controlSize();
    const labelBounds = this._labelNode?.getLocalBounds() ?? null;

    if (!this._explicitSize) {
      const width = control.width + (labelBounds === null ? 0 : this._labelGap + labelBounds.width);
      const height = Math.max(control.height, labelBounds?.height ?? 0);

      // Straight to the base setter: going through this class's own would flip
      // the explicit-size flag and freeze the widget at its first measurement.
      super.setSize(width, height);
    }

    if (this._labelNode !== null && labelBounds !== null) {
      this._labelNode.setPosition(control.width + this._labelGap, (this._uiHeight - labelBounds.height) / 2);
    }

    super._relayout();
  }

  protected override _repaint(): void {
    this._applyTextStyle();
    this._paintControl();
  }

  protected override _onEnabledChanged(effectiveEnabled: boolean): void {
    this.interactive = effectiveEnabled;
    this._refreshState();
  }

  protected override _onFocusChanged(): void {
    this._refreshState();
  }

  public override destroy(): void {
    this.onChange.destroy();
    super.destroy();
  }

  /** The role the label's text style comes from - the control's own surface role. */
  protected abstract _textRole(): UIThemeRole;

  private _applyTextStyle(): void {
    if (this._labelNode === null) {
      return;
    }

    const skinText = resolveUISkin(this.theme[this._textRole()], this._skinState).text;

    if (skinText === this._appliedText) {
      return;
    }

    this._appliedText = skinText;
    this._labelNode.style = { ...skinText, ...this._textStyle };
  }

  private readonly _onPointerOver = (): void => {
    this._pointerInside = true;
    this._refreshState();
  };

  private readonly _onPointerOut = (): void => {
    this._pointerInside = false;
    this._refreshState();
  };

  private readonly _onPointerDown = (): void => {
    if (this.effectiveEnabled) {
      this._setSkinState('pressed');
    }
  };

  private readonly _onPointerUp = (): void => {
    this._refreshState();
  };

  private readonly _onTap = (): void => {
    if (this.effectiveEnabled) {
      this.toggle();
    }
  };

  private readonly _onKey = (event: KeyEvent): void => {
    const channel = event.channel;

    // `channel` is a generic numeric input channel (KeyEvent.channel is `number`),
    // intentionally compared against the Keyboard enum constants - see KeyEvent docs.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option
    if (this.effectiveEnabled && (channel === Keyboard.Enter || channel === Keyboard.Space)) {
      event.preventDefault();
      this.toggle();
    }
  };

  private _refreshState(): void {
    let state: UIWidgetState = 'normal';

    if (!this.effectiveEnabled) {
      state = 'disabled';
    } else if (this._pointerInside) {
      state = 'hover';
    } else if (this.focused) {
      state = 'focused';
    }

    this._setSkinState(state);
  }
}
