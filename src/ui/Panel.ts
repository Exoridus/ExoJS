import { Color } from '#core/Color';
import { Graphics } from '#rendering/primitives/Graphics';

import { Widget } from './Widget';

export interface PanelOptions {
  width?: number;
  height?: number;
  /** Fill color. Default: a translucent dark slate. */
  color?: Color;
  /** Border color (only drawn when `borderWidth > 0`). */
  borderColor?: Color;
  borderWidth?: number;
  cornerRadius?: number;
}

/**
 * Rectangular background container with rounded corners and an optional border.
 * The base building block for HUD boxes, dialogs, and menus — add content with
 * `panel.addChild(...)`.
 */
export class Panel extends Widget {
  private readonly _background = new Graphics();
  private readonly _color: Color;
  private readonly _borderColor: Color;
  private readonly _borderWidth: number;
  private readonly _cornerRadius: number;

  public constructor(options: PanelOptions = {}) {
    super();

    this._color = (options.color ?? new Color(30, 34, 45, 0.92)).clone();
    this._borderColor = (options.borderColor ?? new Color(255, 255, 255, 0.12)).clone();
    this._borderWidth = options.borderWidth ?? 0;
    this._cornerRadius = options.cornerRadius ?? 8;

    this.addChild(this._background);
    this.setSize(options.width ?? 0, options.height ?? 0);
  }

  /** The background {@link Graphics}, for advanced customization. */
  public get background(): Graphics {
    return this._background;
  }

  protected override _relayout(): void {
    const g = this._background;

    g.clear();

    if (this._uiWidth <= 0 || this._uiHeight <= 0) {
      return;
    }

    if (this._borderWidth > 0) {
      g.lineWidth = this._borderWidth;
      g.lineColor = this._borderColor;
    }

    g.fillColor = this._color;
    g.drawRoundedRectangle(0, 0, this._uiWidth, this._uiHeight, this._cornerRadius);
  }
}
