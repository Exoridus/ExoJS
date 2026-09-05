import { Scrollbar } from './Scrollbar';
import type { TextEditWidgetOptions } from './TextEditWidget';
import { TextEditWidget } from './TextEditWidget';

/** Options for {@link TextArea}. */
export interface TextAreaOptions extends Omit<TextEditWidgetOptions, 'multiline'> {
  /** Hint shown while the field holds no text. Default `''`. */
  placeholder?: string;
  /** Maximum value length in UTF-16 code units. Unlimited when absent. */
  maxLength?: number;
  /**
   * Gate on the value an edit would produce. An edit whose resulting value
   * is rejected does not happen at all - a refused paste is dropped whole.
   */
  filter?: (candidate: string) => boolean;
  /**
   * Whether a line too long for the field breaks at a word boundary instead of
   * scrolling horizontally. Default `true`.
   */
  wrap?: boolean;
  /**
   * Whether a scrollbar appears along the right edge once the value is taller
   * than the field. Default `true`.
   */
  scrollbar?: boolean;
  /** Scrollbar width in pixels. Default `10`. */
  scrollbarThickness?: number;
}

/**
 * Multi-line text field. It shares the editing core, the platform transport
 * and the theme roles with {@link TextInput}, and differs in what the keys
 * mean and in how much of the value is on screen at once:
 *
 * - `Enter` inserts a line break instead of confirming.
 * - `Up` / `Down` move by line, keeping the column the caret last chose, and
 *   `PageUp` / `PageDown` move by as many lines as the field shows.
 * - `Home` / `End` go to the ends of the current line, not of the value.
 * - The content scrolls to keep the caret visible, and is clipped to the
 *   field. A scrollbar along the right edge shows and drives the vertical
 *   position once the value outgrows the field.
 *
 * A line too long for the field wraps at a word boundary. The lines the caret
 * and `Up` / `Down` move through are the LAID-OUT lines, so a wrapped line
 * behaves like the two lines it looks like. Turn `wrap` off for content whose
 * own line breaks are what matters - log output, code - and the field scrolls
 * horizontally instead.
 *
 * @example
 * ```ts
 * const notes = new TextArea({ width: 320, height: 140, placeholder: 'Notes' });
 * notes.onChange.add((value) => console.log(value.split('\n').length, 'lines'));
 * scene.ui.addChild(notes);
 * ```
 */
export class TextArea extends TextEditWidget {
  /**
   * Left undefined rather than null on purpose: the base constructor sizes the
   * field, and that reaches {@link TextArea._onScrollUpdated} before this
   * class's own fields have been initialised at all.
   */
  private readonly _verticalBar: Scrollbar | undefined;
  private readonly _scrollbarThickness: number;
  /** Guards the bar sync against the relayout its own sizing triggers. */
  private _syncingScrollbar = false;

  public constructor(options: TextAreaOptions = {}) {
    super({ ...options, multiline: true, height: options.height ?? 120 });

    this._scrollbarThickness = options.scrollbarThickness ?? 10;

    if (options.scrollbar ?? true) {
      const bar = new Scrollbar({ orientation: 'vertical', thickness: this._scrollbarThickness });

      bar.visible = false;
      bar.onScroll.add(offset => {
        this.scrollOffsetY = offset;
      });
      this.addChild(bar);
      this._verticalBar = bar;
    }

    this._softWrap = options.wrap ?? true;

    if (options.placeholder !== undefined) {
      this.placeholder = options.placeholder;
    }

    if (options.maxLength !== undefined) {
      this.model.maxLength = options.maxLength;
    }

    if (options.filter !== undefined) {
      this.model.filter = options.filter;
    }

    this._onScrollUpdated();
  }

  /** Maximum value length in UTF-16 code units, or `null` for unlimited. */
  public get maxLength(): number | null {
    return this.model.maxLength;
  }

  public set maxLength(value: number | null) {
    this.model.maxLength = value;
  }

  /** The value gate applied to every edit, or `null` for none. */
  public get filter(): ((candidate: string) => boolean) | null {
    return this.model.filter;
  }

  public set filter(value: ((candidate: string) => boolean) | null) {
    this.model.filter = value;
  }

  /**
   * Whether a line too long for the field wraps at a word boundary. Turning it
   * off makes long lines scroll horizontally instead.
   */
  public get wrap(): boolean {
    return this._softWrap;
  }

  public set wrap(value: boolean) {
    this._softWrap = value;
  }

  /** The vertical scrollbar, or `null` when the field was built without one. */
  public get verticalScrollbar(): Scrollbar | null {
    return this._verticalBar ?? null;
  }

  /**
   * How many lines the value holds - the value's own lines, not the laid-out
   * ones. Wrapping does not change the value, so it does not change this.
   */
  public get lineCount(): number {
    return this.model.value.split('\n').length;
  }

  protected override _onScrollUpdated(): void {
    const bar = this._verticalBar;

    if (bar === undefined || this._syncingScrollbar) {
      return;
    }

    this._syncingScrollbar = true;

    try {
      const insets = this.contentInsets;

      bar.setRange(Math.max(0, this._uiHeight - insets.top - insets.bottom), this.textNode.textBounds.height);
      bar.offset = this.scrollOffsetY;
      bar.setLength(this._uiHeight);
      bar.setPosition(this._uiWidth - this._scrollbarThickness, 0);
      // Overlaid rather than inset, like every other scroll surface in the
      // suite: reserving room for the bar would change the wrap width, which
      // would change the content height, which decides whether the bar shows.
      bar.visible = bar.overflowing;
    } finally {
      this._syncingScrollbar = false;
    }
  }
}
