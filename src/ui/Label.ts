import { Color } from '#core/Color';
import { Text } from '#rendering/text/Text';
import type { TextStyleOptions } from '#rendering/text/TextStyle';

import { Widget } from './Widget';

/**
 * Text label widget. Wraps a {@link Text} node and keeps the widget's layout
 * size in sync with the measured text, so it anchors and stacks correctly.
 */
export class Label extends Widget {
  private readonly _text: Text;

  public constructor(text = '', style: TextStyleOptions = {}) {
    super();

    this._text = new Text(text, { fillColor: Color.white, fontSize: 16, ...style });
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

  private _syncSize(): void {
    const bounds = this._text.getLocalBounds();

    this.setSize(bounds.width, bounds.height);
  }
}
