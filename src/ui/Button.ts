import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import type { KeyEvent } from '#input/KeyEvent';
import { Keyboard } from '#input/types';
import { Graphics } from '#rendering/primitives/Graphics';
import { Text } from '#rendering/text/Text';

import { Widget } from './Widget';

export interface ButtonOptions {
  width?: number;
  height?: number;
  label?: string;
  cornerRadius?: number;
  /** Fill color in the normal state. */
  color?: Color;
  hoverColor?: Color;
  pressedColor?: Color;
  disabledColor?: Color;
  textColor?: Color;
  fontSize?: number;
}

type ButtonState = 'normal' | 'hover' | 'pressed' | 'disabled';

/**
 * Clickable button with a rounded background, a centered label, hover/pressed
 * visual states, and keyboard activation (Enter / Space while focused).
 * Listen to {@link Button.onClick} for activation.
 */
export class Button extends Widget {
  /** Fires when the button is activated by click, tap, or Enter/Space. */
  public readonly onClick = new Signal<[Button]>();

  private readonly _background = new Graphics();
  private readonly _label: Text;
  private readonly _colors: Record<ButtonState, Color>;
  private readonly _cornerRadius: number;
  private _state: ButtonState = 'normal';
  private _pointerInside = false;

  public constructor(options: ButtonOptions = {}) {
    super();

    this._colors = {
      normal: (options.color ?? new Color(54, 120, 220, 1)).clone(),
      hover: (options.hoverColor ?? new Color(74, 140, 240, 1)).clone(),
      pressed: (options.pressedColor ?? new Color(40, 96, 180, 1)).clone(),
      disabled: (options.disabledColor ?? new Color(70, 76, 90, 1)).clone(),
    };
    this._cornerRadius = options.cornerRadius ?? 8;
    this._label = new Text(options.label ?? '', {
      fillColor: options.textColor ?? Color.white,
      fontSize: options.fontSize ?? 16,
      align: 'center',
    });

    this.addChild(this._background);
    this.addChild(this._label);

    this.interactive = true;
    this.focusable = true;
    this.cursor = 'pointer';

    this.onPointerOver.add(this._onPointerOver);
    this.onPointerOut.add(this._onPointerOut);
    this.onPointerDown.add(this._onPointerDown);
    this.onPointerUp.add(this._onPointerUp);
    this.onPointerTap.add(this._activate);
    this.onKeyDown.add(this._onKey);

    this.setSize(options.width ?? 120, options.height ?? 40);
  }

  public get label(): string {
    return this._label.text;
  }

  public set label(value: string) {
    this._label.text = value;
    this._positionLabel();
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
    if (this.enabled) {
      this._state = 'pressed';
      this._draw();
    }
  };

  private readonly _onPointerUp = (): void => {
    this._refreshState();
  };

  private readonly _activate = (): void => {
    if (this.enabled) {
      this.onClick.dispatch(this);
    }
  };

  private readonly _onKey = (event: KeyEvent): void => {
    const channel = event.channel as Keyboard;

    if (this.enabled && (channel === Keyboard.Enter || channel === Keyboard.Space)) {
      event.preventDefault();
      this.onClick.dispatch(this);
    }
  };

  private _refreshState(): void {
    let state: ButtonState = 'normal';

    if (!this.enabled) {
      state = 'disabled';
    } else if (this._pointerInside) {
      state = 'hover';
    }

    this._state = state;
    this._draw();
  }

  protected override _onEnabledChanged(enabled: boolean): void {
    this.interactive = enabled;
    this._refreshState();
  }

  protected override _relayout(): void {
    this._draw();
    this._positionLabel();
  }

  private _draw(): void {
    const g = this._background;

    g.clear();

    if (this._uiWidth <= 0 || this._uiHeight <= 0) {
      return;
    }

    g.fillColor = this._colors[this._state];
    g.drawRoundedRectangle(0, 0, this._uiWidth, this._uiHeight, this._cornerRadius);
  }

  private _positionLabel(): void {
    const bounds = this._label.getLocalBounds();

    this._label.setPosition((this._uiWidth - bounds.width) / 2, (this._uiHeight - bounds.height) / 2);
  }
}
