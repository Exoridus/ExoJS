import { Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import { Widget } from './Widget';

/**
 * Text label widget. Wraps a {@link Text} node and keeps the widget's layout
 * size in sync with the measured text, so it anchors and stacks correctly.
 *
 * The label takes its text style from the `label` role of its inherited theme;
 * the constructor style and {@link Label.setTextStyle} override parts of it for
 * this label only.
 */
export class Label extends Widget {
  private readonly _text: Text;
  private _textStyle: TextStyleOptions | null;
  /** The skin text object last pushed into the text node, for a cheap identity check per layout. */
  private _appliedText: TextStyleOptions;

  public constructor(text = '', style: TextStyleOptions = {}) {
    super();

    this._textStyle = Object.keys(style).length > 0 ? { ...style } : null;
    this._appliedText = this._skin('label').text;
    this._text = new Text(text, { ...this._appliedText, ...this._textStyle });
    this.addChild(this._text);
    this._syncSize();
  }

  public get text(): string {
    return this._text.text;
  }

  public set text(value: string) {
    if (this._text.text !== value) {
      this._text.text = value;
      this._syncSize();
    }
  }

  /** The underlying {@link Text} node, for advanced styling. */
  public get textNode(): Text {
    return this._text;
  }

  /** The text-style overrides this label carries, or `null` when it takes the skin's. */
  public get textStyleOverrides(): TextStyleOptions | null {
    return this._textStyle;
  }

  /**
   * Override text style on top of the skin's; `null` returns to it. The label
   * is re-measured, so its layout size follows the new style.
   */
  public setTextStyle(style: TextStyleOptions | null): this {
    this._textStyle = style === null ? null : { ...this._textStyle, ...style };
    this._applyTextStyle(true);

    return this;
  }

  protected override _relayout(): void {
    this._applyTextStyle(false);
    super._relayout();
  }

  /**
   * Push the skin's text style into the text node and resize to the new
   * measurement. Skips the work when the skin hands out the same style object
   * as last time, unless `force` says this label's own overrides changed.
   */
  private _applyTextStyle(force: boolean): void {
    const skinText = this._skin('label').text;

    if (skinText === this._appliedText && !force) {
      return;
    }

    this._appliedText = skinText;
    this._text.style = { ...skinText, ...this._textStyle };
    this._syncSize();
  }

  private _syncSize(): void {
    const bounds = this._text.getLocalBounds();

    this.setSize(bounds.width, bounds.height);
  }
}
