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
 * - The content scrolls in both axes to keep the caret visible, and is
 *   clipped to the field.
 *
 * Lines are the ones the value states: a long line scrolls horizontally
 * rather than wrapping.
 *
 * @example
 * ```ts
 * const notes = new TextArea({ width: 320, height: 140, placeholder: 'Notes' });
 * notes.onChange.add((value) => console.log(value.split('\n').length, 'lines'));
 * scene.ui.addChild(notes);
 * ```
 */
export class TextArea extends TextEditWidget {
  public constructor(options: TextAreaOptions = {}) {
    super({ ...options, multiline: true, height: options.height ?? 120 });

    if (options.placeholder !== undefined) {
      this.placeholder = options.placeholder;
    }

    if (options.maxLength !== undefined) {
      this.model.maxLength = options.maxLength;
    }

    if (options.filter !== undefined) {
      this.model.filter = options.filter;
    }
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

  /** How many lines the value holds. */
  public get lineCount(): number {
    return this.model.value.split('\n').length;
  }
}
