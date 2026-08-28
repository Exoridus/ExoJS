import { Color } from '#core/Color';
import { Signal } from '#core/Signal';
import type { KeyEvent } from '#input/KeyEvent';
import { Keyboard } from '#input/types';
import { Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import type { UIBackground, UIBackgroundInput, UIBackgroundOptions, UIFillPatch, UIWidgetState } from './theme';
import { applyUIFillPatch, backgroundOptionsFrom, createUIBackground, resolveUISkin } from './theme';
import { Widget } from './Widget';
import { WidgetBackground } from './WidgetBackground';

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
  /**
   * The background per state, each stated as a colour, a texture, a region or
   * a full descriptor. States left out fall back to the theme's button skin.
   */
  skin?: Partial<Record<ButtonState, UIBackgroundInput>>;
  /** Source-texture slice widths for every textured `skin` entry; defaults to a third per axis. */
  slices?: UIBackgroundOptions['slices'];
  /** Destination border widths for every textured `skin` entry; defaults to `slices`. */
  border?: UIBackgroundOptions['border'];
  modes?: UIBackgroundOptions['modes'];
  /** Paint textured `skin` entries flat with this fit instead of slicing them. */
  fit?: UIBackgroundOptions['fit'];
}

/** The states a button's skin can be stated for. */
export type ButtonState = 'normal' | 'hover' | 'pressed' | 'disabled';

const buttonStates: readonly ButtonState[] = ['normal', 'hover', 'pressed', 'disabled'];

const fillColorOf = (background: UIBackground): Color | null => (background.kind === 'fill' ? background.color : null);

/**
 * Clickable button with a rounded background, a centered label, hover/pressed
 * visual states, and keyboard activation (Enter / Space while focused).
 * Listen to {@link Button.onClick} for activation.
 *
 * The button paints the `button` role of its inherited theme, one skin per
 * state. Constructor options and the setters below are per-button overrides on
 * top of that skin.
 */
export class Button extends Widget {
  /** Fires when the button is activated by click, tap, or Enter/Space. */
  public readonly onClick = new Signal<[Button]>();

  private readonly _surface = new WidgetBackground(this, 0);
  private readonly _label: Text;
  private readonly _backgrounds: Partial<Record<UIWidgetState, UIBackground>> = {};
  private readonly _fills: Partial<Record<UIWidgetState, UIFillPatch>> = {};
  private _textStyle: TextStyleOptions | null = null;
  /** The skin text object last pushed into the label, for a cheap identity check per paint. */
  private _appliedText: TextStyleOptions | null = null;
  private _pointerInside = false;

  public constructor(options: ButtonOptions = {}) {
    super();

    const perState: Partial<Record<ButtonState, Color>> = {
      ...(options.color !== undefined && { normal: options.color }),
      ...(options.hoverColor !== undefined && { hover: options.hoverColor }),
      ...(options.pressedColor !== undefined && { pressed: options.pressedColor }),
      ...(options.disabledColor !== undefined && { disabled: options.disabledColor }),
    };

    for (const state of buttonStates) {
      const color = perState[state];
      const patch: { -readonly [Key in keyof UIFillPatch]: UIFillPatch[Key] } = {};

      if (color !== undefined) patch.color = color.clone();
      if (options.cornerRadius !== undefined) patch.cornerRadius = options.cornerRadius;

      if (Object.keys(patch).length > 0) this._fills[state] = patch;
    }

    if (options.skin !== undefined) {
      const backgroundOptions = backgroundOptionsFrom(options);

      for (const state of buttonStates) {
        const input = options.skin[state];

        if (input !== undefined) {
          this._applyBackgroundInput(input, state, backgroundOptions);
        }
      }
    }

    if (options.textColor !== undefined || options.fontSize !== undefined) {
      this._textStyle = {
        ...(options.textColor !== undefined && { fillColor: options.textColor }),
        ...(options.fontSize !== undefined && { fontSize: options.fontSize }),
      };
    }

    this._appliedText = resolveUISkin(this.theme.button, 'normal').text;
    this._label = new Text(options.label ?? '', { ...this._appliedText, ...this._textStyle });

    this.addChild(this._label);

    this.interactive = true;
    this.focusable = true;
    this.cursor = 'pointer';
    this._trackFocus();

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

  /** The node painting the background, or `null` while it paints nothing. */
  public get backgroundNode(): WidgetBackground['node'] {
    return this._surface.node;
  }

  /** The {@link Text} node drawing the label, for advanced styling. */
  public get labelNode(): Text {
    return this._label;
  }

  /** The state the button currently paints in. */
  public get state(): UIWidgetState {
    return this._skinState;
  }

  /** The background painted in `state`: this button's overrides over its skin. */
  public backgroundIn(state: UIWidgetState = this._skinState): UIBackground {
    return this._backgrounds[state] ?? applyUIFillPatch(resolveUISkin(this.theme.button, state).background, this._fills[state] ?? null);
  }

  /** The per-state fill colours; `null` for a state that does not paint a fill. */
  public get colors(): Readonly<Record<ButtonState, Color | null>> {
    return {
      normal: fillColorOf(this.backgroundIn('normal')),
      hover: fillColorOf(this.backgroundIn('hover')),
      pressed: fillColorOf(this.backgroundIn('pressed')),
      disabled: fillColorOf(this.backgroundIn('disabled')),
    };
  }

  /** The fill overrides carried for `state`, or `null` when it takes its skin as is. */
  public fillOverridesIn(state: UIWidgetState = 'normal'): UIFillPatch | null {
    return this._fills[state] ?? null;
  }

  /** Corner radius in pixels of the normal state; `0` when it paints no fill. */
  public get cornerRadius(): number {
    const background = this.backgroundIn('normal');

    return background.kind === 'fill' ? background.cornerRadius : 0;
  }

  /** Label fill colour. */
  public get textColor(): Color {
    return this._label.style.fillColor;
  }

  /** Label font size in pixels. */
  public get fontSize(): number {
    return this._label.style.fontSize;
  }

  /** The text-style overrides this button carries, or `null` when it takes the skin's. */
  public get textStyleOverrides(): TextStyleOptions | null {
    return this._textStyle;
  }

  /**
   * Override fill properties for one state on top of its skin. `null` drops
   * that state's overrides.
   */
  public setFill(patch: UIFillPatch | null, state: UIWidgetState = 'normal'): this {
    if (patch === null) {
      delete this._fills[state];
    } else {
      this._fills[state] = { ...this._fills[state], ...patch };
    }

    this._invalidatePaint();

    return this;
  }

  /**
   * Set one state's background from a colour, a texture, a region or a full
   * descriptor; `null` returns that state to its skin. A colour becomes a fill
   * override, so the skin's corner radius and border survive it.
   */
  public setBackground(background: UIBackgroundInput | null, state: UIWidgetState = 'normal', options: UIBackgroundOptions = {}): this {
    this._applyBackgroundInput(background, state, options);
    this._invalidateLayout();

    return this;
  }

  /** Route a background input to the override it actually is: a fill patch for a colour, a descriptor otherwise. */
  private _applyBackgroundInput(background: UIBackgroundInput | null, state: UIWidgetState, options: UIBackgroundOptions): void {
    if (background instanceof Color) {
      delete this._backgrounds[state];
      this._fills[state] = { ...this._fills[state], color: background };

      return;
    }

    if (background === null) {
      delete this._backgrounds[state];

      return;
    }

    this._backgrounds[state] = createUIBackground(background, options);
  }

  /**
   * Override label text style on top of the skin's; `null` returns to it.
   * Layout-invalidating - the label is re-measured and re-centered.
   */
  public setTextStyle(style: TextStyleOptions | null): this {
    this._textStyle = style === null ? null : { ...this._textStyle, ...style };
    this._appliedText = null;
    this._invalidateLayout();

    return this;
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

  private readonly _activate = (): void => {
    if (this.effectiveEnabled) {
      this.onClick.dispatch(this);
    }
  };

  private readonly _onKey = (event: KeyEvent): void => {
    const channel = event.channel;

    // `channel` is a generic numeric input channel (KeyEvent.channel is `number`),
    // intentionally compared against the Keyboard enum constants - see KeyEvent docs.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison -- widening casts are redundant here, so the suppression is the only honest option
    if (this.effectiveEnabled && (channel === Keyboard.Enter || channel === Keyboard.Space)) {
      event.preventDefault();
      this.onClick.dispatch(this);
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

  protected override _onFocusChanged(): void {
    this._refreshState();
  }

  protected override _onEnabledChanged(effectiveEnabled: boolean): void {
    this.interactive = effectiveEnabled;
    this._refreshState();
  }

  protected override _repaint(): void {
    this._applyTextStyle();
    this._surface.apply(this.backgroundIn(), this._uiWidth, this._uiHeight);
  }

  protected override _relayout(): void {
    super._relayout();
    this._positionLabel();
  }

  /**
   * Push the current state's text style into the label, skipping the re-style
   * and re-measure when the skin is handing out the same style object it did
   * last time - which is the common case for a state flip.
   */
  private _applyTextStyle(): void {
    const skinText = resolveUISkin(this.theme.button, this._skinState).text;

    if (skinText === this._appliedText) {
      return;
    }

    this._appliedText = skinText;
    this._label.style = { ...skinText, ...this._textStyle };
    this._positionLabel();
  }

  /** Center the label in the content box the skin's insets leave. */
  private _positionLabel(): void {
    const insets = resolveUISkin(this.theme.button, this._skinState).insets;
    const bounds = this._label.getLocalBounds();
    const contentWidth = this._uiWidth - insets.left - insets.right;
    const contentHeight = this._uiHeight - insets.top - insets.bottom;

    this._label.setPosition(insets.left + (contentWidth - bounds.width) / 2, insets.top + (contentHeight - bounds.height) / 2);
  }

  public override destroy(): void {
    this._surface.destroy();
    super.destroy();
  }
}
