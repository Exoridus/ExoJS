import { Color } from '#core/Color';
import { clamp } from '#math/utils';
import { Graphics } from '#rendering/primitives/Graphics';

import { Widget } from './Widget';

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
 * fraction in `[0, 1]`; setting it redraws only the fill.
 */
export class ProgressBar extends Widget {
  private readonly _track = new Graphics();
  private readonly _fill = new Graphics();
  private readonly _trackColor: Color;
  private readonly _fillColor: Color;
  private readonly _cornerRadius: number;
  private _value: number;

  public constructor(options: ProgressBarOptions = {}) {
    super();

    this._value = clamp(options.value ?? 0, 0, 1);
    this._trackColor = (options.trackColor ?? new Color(255, 255, 255, 0.16)).clone();
    this._fillColor = (options.fillColor ?? new Color(80, 220, 120, 1)).clone();
    this._cornerRadius = options.cornerRadius ?? 4;

    this.addChild(this._track);
    this.addChild(this._fill);
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
      this._drawFill();
    }
  }

  /** Track (background) colour. */
  public get trackColor(): Color {
    return this._trackColor;
  }

  /** Fill (foreground) colour. */
  public get fillColor(): Color {
    return this._fillColor;
  }

  /** Corner radius in pixels. */
  public get cornerRadius(): number {
    return this._cornerRadius;
  }

  protected override _relayout(): void {
    this._drawTrack();
    this._drawFill();
  }

  private _drawTrack(): void {
    const g = this._track;

    g.clear();

    if (this._uiWidth <= 0 || this._uiHeight <= 0) {
      return;
    }

    g.fillColor = this._trackColor;
    g.drawRoundedRectangle(0, 0, this._uiWidth, this._uiHeight, this._cornerRadius);
  }

  private _drawFill(): void {
    const g = this._fill;

    g.clear();

    const width = this._uiWidth * this._value;

    if (width <= 0 || this._uiHeight <= 0) {
      return;
    }

    g.fillColor = this._fillColor;
    g.drawRoundedRectangle(0, 0, width, this._uiHeight, Math.min(this._cornerRadius, width / 2));
  }
}
