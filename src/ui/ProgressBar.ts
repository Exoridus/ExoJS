import { Color } from '#core/Color';
import { clamp } from '#math/utils';

import type { UIBackground, UIBackgroundInput, UIBackgroundOptions, UIFillPatch } from './theme';
import { applyUIFillPatch, backgroundOptionsFrom, createUIBackground } from './theme';
import { UIClipBox } from './UIClipBox';
import { Widget } from './Widget';
import { type UIBackgroundNode, WidgetBackground } from './WidgetBackground';

/**
 * How the bar follows the value: `'scale'` paints the background at the value's
 * width, `'clip'` paints it at full width and shows the leading fraction of it.
 * Clipping is what keeps textured art undistorted; a fill has nothing to
 * distort, so it is always painted at the value's width.
 */
export type ProgressBarFillMode = 'scale' | 'clip';

export interface ProgressBarOptions {
  width?: number;
  height?: number;
  /** Initial fill fraction in `[0, 1]`. */
  value?: number;
  trackColor?: Color;
  fillColor?: Color;
  cornerRadius?: number;
  /** The groove's background, stated as a colour, a texture, a region or a descriptor. */
  trackBackground?: UIBackgroundInput;
  /** The bar's background, stated as a colour, a texture, a region or a descriptor. */
  barBackground?: UIBackgroundInput;
  /** How the bar follows the value. Default `'clip'`. */
  fillMode?: ProgressBarFillMode;
  /** Source-texture slice widths for textured backgrounds; defaults to a third per axis. */
  slices?: UIBackgroundOptions['slices'];
  /** Destination border widths for textured backgrounds; defaults to `slices`. */
  border?: UIBackgroundOptions['border'];
  modes?: UIBackgroundOptions['modes'];
  /** Paint textured backgrounds flat with this fit instead of slicing them. */
  fit?: UIBackgroundOptions['fit'];
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
  private readonly _barBox = new UIClipBox();
  private readonly _bar = new WidgetBackground(this._barBox, 0);
  private _trackBackground: UIBackground | null = null;
  private _barBackground: UIBackground | null = null;
  private _trackFill: UIFillPatch | null = null;
  private _barFill: UIFillPatch | null = null;
  private _value: number;
  private _fillMode: ProgressBarFillMode;

  public constructor(options: ProgressBarOptions = {}) {
    super();

    this._value = clamp(options.value ?? 0, 0, 1);
    this._fillMode = options.fillMode ?? 'clip';
    this._trackFill = fillPatchFrom(options.trackColor, options.cornerRadius);
    this._barFill = fillPatchFrom(options.fillColor, options.cornerRadius);

    this.addChild(this._barBox);

    const backgroundOptions = backgroundOptionsFrom(options);

    if (options.trackBackground !== undefined) {
      this._trackBackground = normalizeBackground(options.trackBackground, backgroundOptions, patch => {
        this._trackFill = { ...this._trackFill, ...patch };
      });
    }

    if (options.barBackground !== undefined) {
      this._barBackground = normalizeBackground(options.barBackground, backgroundOptions, patch => {
        this._barFill = { ...this._barFill, ...patch };
      });
    }

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

  /** How the bar follows the value. */
  public get fillMode(): ProgressBarFillMode {
    return this._fillMode;
  }

  public set fillMode(mode: ProgressBarFillMode) {
    if (this._fillMode !== mode) {
      this._fillMode = mode;
      this._paintBar();
    }
  }

  /** The node painting the groove, or `null` while it paints nothing. */
  public get trackNode(): UIBackgroundNode | null {
    return this._track.node;
  }

  /** The node painting the bar, or `null` while it paints nothing. */
  public get barNode(): UIBackgroundNode | null {
    return this._bar.node;
  }

  /** Width in pixels of the bar that is actually visible: `uiWidth * value`. */
  public get barVisibleWidth(): number {
    return this._uiWidth * this._value;
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

  /**
   * Set the groove's background from a colour, a texture, a region or a full
   * descriptor; `null` returns it to its skin. A colour becomes a fill
   * override, so the skin's corner radius survives it.
   */
  public setTrackBackground(background: UIBackgroundInput | null, options: UIBackgroundOptions = {}): this {
    this._trackBackground =
      background === null
        ? null
        : normalizeBackground(background, options, patch => {
            this._trackFill = { ...this._trackFill, ...patch };
          });
    this._invalidateLayout();

    return this;
  }

  /**
   * Set the bar's background from a colour, a texture, a region or a full
   * descriptor; `null` returns it to its skin. A colour becomes a fill
   * override, so the skin's corner radius survives it.
   */
  public setBarBackground(background: UIBackgroundInput | null, options: UIBackgroundOptions = {}): this {
    this._barBackground =
      background === null
        ? null
        : normalizeBackground(background, options, patch => {
            this._barFill = { ...this._barFill, ...patch };
          });
    this._invalidateLayout();

    return this;
  }

  protected override _repaint(): void {
    this._track.apply(this.trackBackground, this._uiWidth, this._uiHeight);
    this._paintBar();
  }

  private _paintBar(): void {
    const background = this.barBackground;
    // A fill has no art to distort, so it is drawn at the value's width in
    // either mode - which keeps the default bar off the clipping path, and so
    // clear of the render barrier a clip imposes.
    const clipped = this._fillMode === 'clip' && background.kind !== 'fill';

    this._bar.apply(background, clipped ? this._uiWidth : this.barVisibleWidth, this._uiHeight);
    this._barBox.clip = clipped;
    this._barBox.setClipSize(clipped ? this.barVisibleWidth : this._uiWidth, this._uiHeight);
  }

  public override destroy(): void {
    this._track.destroy();
    this._bar.destroy();
    this._barBox.destroy();
    super.destroy();
  }
}

/** Turn a background input into a descriptor, routing a colour to `applyFill` instead. */
const normalizeBackground = (background: UIBackgroundInput, options: UIBackgroundOptions, applyFill: (patch: UIFillPatch) => void): UIBackground | null => {
  if (background instanceof Color) {
    applyFill({ color: background });

    return null;
  }

  return createUIBackground(background, options);
};

/** The fill overrides a colour and radius pair asks for, or `null` for none. */
const fillPatchFrom = (color: Color | undefined, cornerRadius: number | undefined): UIFillPatch | null => {
  const patch: { -readonly [Key in keyof UIFillPatch]: UIFillPatch[Key] } = {};

  if (color !== undefined) patch.color = color.clone();
  if (cornerRadius !== undefined) patch.cornerRadius = cornerRadius;

  return Object.keys(patch).length > 0 ? patch : null;
};
