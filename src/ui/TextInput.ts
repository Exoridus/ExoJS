import type { Signal } from '#core/Signal';

import type { TextEditWidgetOptions } from './TextEditWidget';
import { TextEditWidget } from './TextEditWidget';

/** Options for {@link TextInput}. */
export interface TextInputOptions extends TextEditWidgetOptions {
  /** Hint shown while the field holds no text. Default `''`. */
  placeholder?: string;
  /** Maximum value length in UTF-16 code units. Unlimited when absent. */
  maxLength?: number;
  /**
   * Gate on the value an edit would produce. An edit whose resulting value
   * is rejected does not happen at all - a refused paste is dropped whole.
   */
  filter?: (candidate: string) => boolean;
  /** When set, every grapheme of the value renders as this character; clipboard reads are refused. */
  maskChar?: string;
  /** What kind of content the field holds, so mobile keyboards can adapt. */
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search';
  /** What the field's confirm key should be labelled as. */
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'search' | 'send';
}

/**
 * Single-line text field. Editing runs through the {@link TextEditingModel}
 * and the platform text-input transport: real keyboard and IME input arrive
 * as edit intents, the caret and selection render from the text layout, and
 * `maxLength` / `filter` / masking are enforced by the model, so paste
 * cannot bypass them.
 *
 * `Enter` confirms and fires {@link TextInput.onSubmit}; `Escape` and `Tab`
 * release focus and stay unconsumed. Editing keys are consumed while
 * focused, so focus navigation does not also react. On a host without a
 * text-input transport the field renders and takes focus but rejects edits.
 *
 * @example
 * ```ts
 * const name = new TextInput({ width: 220, placeholder: 'Player name' });
 * name.onSubmit.add((value) => console.log(value));
 * scene.ui.addChild(name);
 * ```
 */
export class TextInput extends TextEditWidget {
  /** Fires when the user confirms the field with `Enter`. */
  public readonly onSubmit: Signal<[value: string]>;

  private _inputMode: TextInputOptions['inputMode'];
  private _enterKeyHint: TextInputOptions['enterKeyHint'];

  public constructor(options: TextInputOptions = {}) {
    super(options);

    this.onSubmit = this._onSubmit;
    this._inputMode = options.inputMode;
    this._enterKeyHint = options.enterKeyHint;

    if (options.placeholder !== undefined) {
      this.placeholder = options.placeholder;
    }

    if (options.maxLength !== undefined) {
      this.model.maxLength = options.maxLength;
    }

    if (options.filter !== undefined) {
      this.model.filter = options.filter;
    }

    if (options.maskChar !== undefined) {
      this.model.maskChar = options.maskChar;
    }

    this._setHints(this._currentHints());
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

  /** The masking character, or `null` when the value renders as it is. */
  public get maskChar(): string | null {
    return this.model.maskChar;
  }

  public set maskChar(value: string | null) {
    this.model.maskChar = value;
    this._setHints(this._currentHints());
  }

  /** What kind of content the field holds, so mobile keyboards can adapt. */
  public get inputMode(): NonNullable<TextInputOptions['inputMode']> | undefined {
    return this._inputMode;
  }

  public set inputMode(value: TextInputOptions['inputMode']) {
    this._inputMode = value;
    this._setHints(this._currentHints());
  }

  /** What the field's confirm key should be labelled as. */
  public get enterKeyHint(): NonNullable<TextInputOptions['enterKeyHint']> | undefined {
    return this._enterKeyHint;
  }

  public set enterKeyHint(value: TextInputOptions['enterKeyHint']) {
    this._enterKeyHint = value;
    this._setHints(this._currentHints());
  }

  private _currentHints(): {
    inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search';
    enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'search' | 'send';
    masked?: boolean;
  } {
    return {
      ...(this._inputMode !== undefined && { inputMode: this._inputMode }),
      ...(this._enterKeyHint !== undefined && { enterKeyHint: this._enterKeyHint }),
      ...(this.model.maskChar !== null && { masked: true }),
    };
  }
}
