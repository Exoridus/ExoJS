import type { Color } from '#core/Color';
import { clamp } from '#math/utils';

import type { UIBackground, UIFillPatch } from './theme';
import { applyUIFillPatch } from './theme';
import { Widget } from './Widget';
import { WidgetBackground } from './WidgetBackground';

export interface ProgressBarOptions {
  width?: number;
  height?: number;
  /** Initial fill fraction in `[0, 1]`. */
  value?: number;
  trackColor?: Color;
  fillColor?: Color;
  cornerRadius?: number;
}

/**
 * Horizontal progress / health bar. {@link ProgressBar.value} is the fill
 * fraction in `[0, 1]`; setting it redraws only the bar.
 *
 * The two surfaces are themed independently: the groove paints the
 * `progressBarTrack` role, the bar `progressBarFill`.
 */
export class ProgressBar extends Widget {
  private readonly _track = new WidgetBackground(this, 0);
  private readonly _bar = new WidgetBackground(this, 1);
  private _trackBackground: UIBackground | null = null;
  private _barBackground: UIBackground | null = null;
  private _trackFill: UIFillPatch | null = null;
  private _barFill: UIFillPatch | null = null;
  private _value: number;

  public constructor(options: ProgressBarOptions = {}) {
    super();

    this._value = clamp(options.value ?? 0, 0, 1);
    this._trackFill = fillPatchFrom(options.trackColor, options.cornerRadius);
    this._barFill = fillPatchFrom(options.fillColor, options.cornerRadius);

    this.setSize(options.width ?? 200, options.height ?? 12);
  }

  /** Fill fraction in `[0, 1]`. */
  public get value(): number {
    return this._value;
  }

  public set value(value: number) {
    const next = clamp(value, 0, 1);

    if (this._value !== next) {
      this._value = next;
      this._paintBar();
    }
  }

  /** The background painted behind the bar. */
  public get trackBackground(): UIBackground {
    return this._trackBackground ?? applyUIFillPatch(this._skin('progressBarTrack').background, this._trackFill);
  }

  /** The background painted for the filled portion. */
  public get barBackground(): UIBackground {
    return this._barBackground ?? applyUIFillPatch(this._skin('progressBarFill').background, this._barFill);
  }

  /** Track colour, or `null` when the track does not paint a fill. */
  public get trackColor(): Color | null {
    const background = this.trackBackground;

    return background.kind === 'fill' ? background.color : null;
  }

  /** Bar colour, or `null` when the bar does not paint a fill. */
  public get fillColor(): Color | null {
    const background = this.barBackground;

    return background.kind === 'fill' ? background.color : null;
  }

  /** Corner radius in pixels of the track; `0` when it paints no fill. */
  public get cornerRadius(): number {
    const background = this.trackBackground;

    return background.kind === 'fill' ? background.cornerRadius : 0;
  }

  /** The fill overrides carried by the track and the bar, `null` where none. */
  public get fillOverrides(): { readonly track: UIFillPatch | null; readonly bar: UIFillPatch | null } {
    return { track: this._trackFill, bar: this._barFill };
  }

  /** Override fill properties of the track on top of its skin; `null` drops them. */
  public setTrackFill(patch: UIFillPatch | null): this {
    this._trackFill = patch === null ? null : { ...this._trackFill, ...patch };
    this._invalidatePaint();

    return this;
  }

  /** Override fill properties of the bar on top of its skin; `null` drops them. */
  public setBarFill(patch: UIFillPatch | null): this {
    this._barFill = patch === null ? null : { ...this._barFill, ...patch };
    this._invalidatePaint();

    return this;
  }

  /** Replace the track's whole background descriptor; `null` restores the skin's. */
  public setTrackBackground(background: UIBackground | null): this {
    this._trackBackground = background;
    this._invalidateLayout();

    return this;
  }

  /** Replace the bar's whole background descriptor; `null` restores the skin's. */
  public setBarBackground(background: UIBackground | null): this {
    this._barBackground = background;
    this._invalidateLayout();

    return this;
  }

  protected override _repaint(): void {
    this._track.apply(this.trackBackground, this._uiWidth, this._uiHeight);
    this._paintBar();
  }

  private _paintBar(): void {
    this._bar.apply(this.barBackground, this._uiWidth * this._value, this._uiHeight);
  }

  public override destroy(): void {
    this._track.destroy();
    this._bar.destroy();
    super.destroy();
  }
}

/** The fill overrides a colour and radius pair asks for, or `null` for none. */
const fillPatchFrom = (color: Color | undefined, cornerRadius: number | undefined): UIFillPatch | null => {
  const patch: { -readonly [Key in keyof UIFillPatch]: UIFillPatch[Key] } = {};

  if (color !== undefined) patch.color = color.clone();
  if (cornerRadius !== undefined) patch.cornerRadius = cornerRadius;

  return Object.keys(patch).length > 0 ? patch : null;
};
