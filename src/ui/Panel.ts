import { Color } from '#core/Color';

import type { UIBackground, UIBackgroundInput, UIBackgroundOptions, UIFillPatch } from './theme';
import { applyUIFillPatch, backgroundOptionsFrom, createUIBackground } from './theme';
import { Widget } from './Widget';
import { type UIBackgroundNode, WidgetBackground } from './WidgetBackground';

export interface PanelOptions {
  width?: number;
  height?: number;
  /** Fill color override. Default: the theme's panel fill. */
  color?: Color;
  /** Border color override (only drawn when `borderWidth > 0`). */
  borderColor?: Color;
  borderWidth?: number;
  cornerRadius?: number;
  /**
   * The panel's background, stated as a colour, a texture, a region or a full
   * descriptor. A colour overrides the skin's fill and keeps the rest of it;
   * anything else replaces the skin's background outright.
   */
  background?: UIBackgroundInput;
  /** Source-texture slice widths for a texture `background`; defaults to a third per axis. */
  slices?: UIBackgroundOptions['slices'];
  /** Destination border widths for a texture `background`; defaults to `slices`. */
  border?: UIBackgroundOptions['border'];
  modes?: UIBackgroundOptions['modes'];
  /** Paint a texture `background` flat with this fit instead of slicing it. */
  fit?: UIBackgroundOptions['fit'];
}

/**
 * Rectangular background container with rounded corners and an optional border.
 * The base building block for HUD boxes, dialogs, and menus - add content with
 * `panel.addChild(...)`.
 *
 * The panel paints the `panel` role of its inherited theme. Constructor options
 * and the setters below are per-panel overrides on top of it; each one
 * repaints immediately.
 */
export class Panel extends Widget {
  private readonly _surface = new WidgetBackground(this, 0);
  private _background: UIBackground | null = null;
  private _fill: UIFillPatch | null = null;

  public constructor(options: PanelOptions = {}) {
    super();

    this._fill = fillPatchFrom(options);

    if (options.background !== undefined) {
      this._applyBackgroundInput(options.background, backgroundOptionsFrom(options));
    }

    this.setSize(options.width ?? 0, options.height ?? 0);
  }

  /** The node painting the background, or `null` while it paints nothing. */
  public get backgroundNode(): UIBackgroundNode | null {
    return this._surface.node;
  }

  /** The background actually painted: this panel's overrides over its skin. */
  public get background(): UIBackground {
    return this._background ?? applyUIFillPatch(this._skin('panel').background, this._fill);
  }

  /** Fill colour, or `null` when the panel does not paint a fill. */
  public get color(): Color | null {
    const background = this.background;

    return background.kind === 'fill' ? background.color : null;
  }

  /** Border colour, or `null` when the panel does not paint a fill. */
  public get borderColor(): Color | null {
    const background = this.background;

    return background.kind === 'fill' ? background.borderColor : null;
  }

  /** Border thickness in pixels; `0` when the panel does not paint a fill. */
  public get borderWidth(): number {
    const background = this.background;

    return background.kind === 'fill' ? background.borderWidth : 0;
  }

  /** Corner radius in pixels; `0` when the panel does not paint a fill. */
  public get cornerRadius(): number {
    const background = this.background;

    return background.kind === 'fill' ? background.cornerRadius : 0;
  }

  /** The fill overrides this panel carries, or `null` when it takes its skin as is. */
  public get fillOverrides(): UIFillPatch | null {
    return this._fill;
  }

  /**
   * Override fill properties on top of the skin. Overriding a colour on a
   * panel whose skin paints a texture switches it to a fill. Passing `null`
   * drops the overrides and returns the panel to its skin.
   */
  public setFill(patch: UIFillPatch | null): this {
    this._fill = patch === null ? null : { ...this._fill, ...patch };
    this._invalidatePaint();

    return this;
  }

  /**
   * Set the panel's background from a colour, a texture, a region or a full
   * descriptor; `null` returns it to its skin. A colour becomes a fill override
   * on top of the skin, so the skin's corner radius and border survive it.
   * Layout-invalidating: a nine-slice and a fill can imply different content
   * boxes.
   */
  public setBackground(background: UIBackgroundInput | null, options: UIBackgroundOptions = {}): this {
    this._applyBackgroundInput(background, options);
    this._invalidateLayout();

    return this;
  }

  /** Route a background input to the override it actually is: a fill patch for a colour, a descriptor otherwise. */
  private _applyBackgroundInput(background: UIBackgroundInput | null, options: UIBackgroundOptions): void {
    if (background instanceof Color) {
      this._background = null;
      this._fill = { ...this._fill, color: background };

      return;
    }

    this._background = background === null ? null : createUIBackground(background, options);
  }

  protected override _repaint(): void {
    this._surface.apply(this.background, this._uiWidth, this._uiHeight);
  }

  public override destroy(): void {
    this._surface.destroy();
    super.destroy();
  }
}

/** The fill overrides a constructor options object asks for, or `null` for none. */
const fillPatchFrom = (options: PanelOptions): UIFillPatch | null => {
  const patch: { -readonly [Key in keyof UIFillPatch]: UIFillPatch[Key] } = {};

  if (options.color !== undefined) patch.color = options.color.clone();
  if (options.borderColor !== undefined) patch.borderColor = options.borderColor.clone();
  if (options.borderWidth !== undefined) patch.borderWidth = options.borderWidth;
  if (options.cornerRadius !== undefined) patch.cornerRadius = options.cornerRadius;

  return Object.keys(patch).length > 0 ? patch : null;
};
