import { Signal } from '#core/Signal';
import type { Rectangle } from '#math/Rectangle';

import type { CompositionState, PlatformTextInput, PlatformTextInputHints, TextEditIntent } from './PlatformTextInput';

/** A `textupdate` event: the old range, the replacing text, and the new selection. */
interface TextUpdateEvent {
  updateRangeStart: number;
  updateRangeEnd: number;
  text: string;
  selectionStart: number;
  selectionEnd: number;
}

/** A `characterboundsupdate` event: the composed run that needs on-screen rects. */
interface CharacterBoundsEvent {
  rangeStart: number;
  rangeEnd: number;
}

interface EditContextLike {
  text: string;
  selectionStart: number;
  selectionEnd: number;
  inputMode: string;
  enterKeyHint: string;
  attachToElement(element: HTMLElement): void;
  updateText(rangeStart: number, rangeEnd: number, text: string): void;
  updateSelection(start: number, end: number): void;
  updateControlBounds(bounds: DOMRect): void;
  updateSelectionBounds(bounds: DOMRect): void;
  updateCharacterBounds(rangeStart: number, bounds: DOMRect[]): void;
  addEventListener(type: 'textupdate', listener: (event: TextUpdateEvent) => void): void;
  addEventListener(type: 'characterboundsupdate', listener: (event: CharacterBoundsEvent) => void): void;
  addEventListener(type: 'compositionstart', listener: (event: never) => void): void;
  addEventListener(type: 'compositionend', listener: (event: { text?: string }) => void): void;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  removeEventListener(type: 'textupdate', listener: (event: TextUpdateEvent) => void): void;
  removeEventListener(type: 'characterboundsupdate', listener: (event: CharacterBoundsEvent) => void): void;
  removeEventListener(type: 'compositionstart', listener: (event: never) => void): void;
  removeEventListener(type: 'compositionend', listener: (event: { text?: string }) => void): void;
  removeEventListener(type: string, listener: (event: unknown) => void): void;
}

type EditContextConstructor = new (options?: Record<string, unknown>) => EditContextLike;

interface EditContextGlobal {
  // eslint-disable-next-line @typescript-eslint/naming-convention -- the global's name is fixed by the web platform
  EditContext?: EditContextConstructor;
}

/** True when `EditContext` is available on this platform. */
export const editContextSupported = (): boolean => (globalThis as EditContextGlobal).EditContext !== undefined;

/**
 * The `EditContext` implementation of {@link PlatformTextInput}: the canvas-native
 * editing surface the API was built for. Unlike the `<textarea>` backend it
 * anchors the IME candidate window at the caret, not the element box.
 *
 * `EditContext` lacks `beforeinput`'s semantic `inputType`: a `textupdate`
 * carries only the old range, the new text and the new selection. So the
 * backend diffs the mirrored buffer against the update and forwards the
 * smallest intent the model can apply. Word and line deletion are therefore
 * driven from the widget's key handler (which knows the granularity), leaving
 * this backend with character-level `textupdate`s for plain deletes. Inserts,
 * paste, cut and IME composition all arrive here as `textupdate`/`composition*`
 * and are forwarded unchanged.
 */
export class EditContextTextInput implements PlatformTextInput {
  private readonly _context: EditContextLike;
  private readonly _element: HTMLTextAreaElement;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _onEdit = new Signal<[TextEditIntent]>();
  private readonly _onComposition = new Signal<[CompositionState]>();

  private _composing = false;
  private _bounds: Rectangle | null = null;
  private _caretRect: Rectangle | null = null;
  private _hints: PlatformTextInputHints = {};
  private _destroyed = false;

  private readonly _textUpdate = (event: {
    updateRangeStart: number;
    updateRangeEnd: number;
    text: string;
    selectionStart: number;
    selectionEnd: number;
  }): void => {
    if (this._destroyed) {
      return;
    }

    if (this._composing) {
      // While composing, a `textupdate` carries the candidate, not a commit -
      // this is the only progress signal EditContext gives between
      // `compositionstart` and `compositionend`.
      this._onComposition.dispatch({ phase: 'update', text: event.text, caret: event.text.length });

      return;
    }

    const removed = event.updateRangeEnd - event.updateRangeStart;
    const inserted = event.text.length;

    if (inserted > 0) {
      // Insert or replace: the widget applies it over its own selection, which
      // mirrors the range the platform replaced, so a plain `insert` is exact.
      this._onEdit.dispatch({ kind: 'insert', text: event.text });

      return;
    }

    if (removed > 0) {
      // Pure deletion. Direction follows which side of the caret the removed
      // range sat on; granularity is always character - word/line deletes are
      // intercepted by the widget key handler before they reach here.
      const direction = event.updateRangeEnd === event.selectionEnd ? 'backward' : 'forward';

      this._onEdit.dispatch({ kind: 'deleteContent', direction, granularity: 'character' });

      return;
    }

    // Selection-only change: mirror it so the next edit lands in the right
    // place. The widget owns the model, so we only keep our mirror honest.
    this._context.updateText(0, this._context.text.length, this._context.text);
    this._context.updateSelection(event.selectionStart, event.selectionEnd);
  };

  private readonly _compositionStart = (): void => {
    this._composing = true;
    this._onComposition.dispatch({ phase: 'start' });
  };

  private readonly _compositionEnd = (event: { text?: string }): void => {
    this._composing = false;
    this._onComposition.dispatch({ phase: 'end', text: event.text ?? '' });
  };

  private readonly _characterBoundsUpdate = (event: { rangeStart: number; rangeEnd: number }): void => {
    // The platform asks for the on-screen rects of the composed run so it can
    // place the IME window. We only have the caret and selection rects the
    // widget pushed in; repeat the selection anchor across the run. A precise
    // per-glyph box needs layout the seam does not hold - the `<textarea>`
    // backend has the same limitation and lets the element position the window.
    const rect = this._caretRect ?? this._bounds;

    if (rect === null) {
      return;
    }

    const dom = new DOMRect(rect.x, rect.y, rect.width, rect.height);
    const bounds: DOMRect[] = [];

    for (let offset = event.rangeStart; offset < event.rangeEnd; offset++) {
      bounds.push(dom);
    }

    this._context.updateCharacterBounds(event.rangeStart, bounds);
  };

  /**
   * Copy and cut. An attached `EditContext` takes the element's editing state
   * over, so the element holds no selection the browser could copy from - the
   * clipboard has to be served from the mirror, and the default action
   * cancelled either way.
   */
  private readonly _clipboardWrite = (event: ClipboardEvent): void => {
    event.preventDefault();

    if (this._hints.masked === true) {
      return;
    }

    const selected = this._context.text.slice(this._context.selectionStart, this._context.selectionEnd);

    if (selected === '') {
      return;
    }

    event.clipboardData?.setData('text/plain', selected);

    if (event.type === 'cut') {
      this._onEdit.dispatch({ kind: 'deleteContent', direction: 'backward', granularity: 'character' });
    }
  };

  /**
   * Paste. Cancelled and forwarded as an intent rather than left to the
   * `EditContext`, so the model's `maxLength` and `filter` decide what the
   * paste produces instead of the mirror silently diverging from a rejected
   * one.
   */
  private readonly _clipboardPaste = (event: ClipboardEvent): void => {
    event.preventDefault();

    const text = event.clipboardData?.getData('text/plain') ?? '';

    if (text !== '') {
      this._onEdit.dispatch({ kind: 'insert', text });
    }
  };

  public constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;

    const Ctor = (globalThis as EditContextGlobal).EditContext;

    if (Ctor === undefined) {
      throw new Error('EditContextTextInput requires the EditContext API');
    }

    const element = document.createElement('textarea');

    element.autocomplete = 'off';
    element.setAttribute('autocorrect', 'off');
    element.setAttribute('autocapitalize', 'off');
    element.spellcheck = false;
    element.tabIndex = -1;
    element.setAttribute('aria-hidden', 'true');

    const style = element.style;

    style.position = 'absolute';
    style.opacity = '0';
    style.pointerEvents = 'none';
    style.border = 'none';
    style.padding = '0';
    style.margin = '0';
    style.resize = 'none';
    style.overflow = 'hidden';
    style.background = 'transparent';
    style.color = 'transparent';
    style.caretColor = 'transparent';
    style.outline = 'none';
    style.width = '1px';
    style.height = '1px';
    style.left = '0px';
    style.top = '0px';
    style.zIndex = '-1';

    this._element = element;
    document.body.append(element);

    const context = new Ctor({});
    context.attachToElement(element);
    this._context = context;

    context.addEventListener('textupdate', this._textUpdate);
    context.addEventListener('compositionstart', this._compositionStart);
    context.addEventListener('compositionend', this._compositionEnd);
    context.addEventListener('characterboundsupdate', this._characterBoundsUpdate);
    element.addEventListener('copy', this._clipboardWrite);
    element.addEventListener('cut', this._clipboardWrite);
    element.addEventListener('paste', this._clipboardPaste);
  }

  public get onEdit(): Signal<[TextEditIntent]> {
    return this._onEdit;
  }

  public get onComposition(): Signal<[CompositionState]> {
    return this._onComposition;
  }

  public focus(): void {
    if (this._destroyed) {
      return;
    }

    this._applyBounds();
    this._element.focus({ preventScroll: true });
  }

  public blur(): void {
    this._element.blur();
  }

  public setValue(text: string, selectionStart: number, selectionEnd: number): void {
    if (this._composing || this._destroyed) {
      return;
    }

    this._context.updateText(0, this._context.text.length, text);
    this._context.updateSelection(selectionStart, selectionEnd);
  }

  public setBounds(rect: Rectangle): void {
    this._bounds = rect.clone();
    this._applyBounds();
  }

  public setCaretRect(rect: Rectangle): void {
    this._caretRect = rect.clone();
    this._context.updateSelectionBounds(new DOMRect(rect.x, rect.y, rect.width, rect.height));
  }

  public setHints(hints: PlatformTextInputHints): void {
    this._hints = hints;

    if (hints.inputMode !== undefined) {
      this._context.inputMode = hints.inputMode;
    }

    if (hints.enterKeyHint !== undefined) {
      this._context.enterKeyHint = hints.enterKeyHint;
    }
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this._context.removeEventListener('textupdate', this._textUpdate);
    this._context.removeEventListener('compositionstart', this._compositionStart);
    this._context.removeEventListener('compositionend', this._compositionEnd);
    this._context.removeEventListener('characterboundsupdate', this._characterBoundsUpdate);
    this._element.removeEventListener('copy', this._clipboardWrite);
    this._element.removeEventListener('cut', this._clipboardWrite);
    this._element.removeEventListener('paste', this._clipboardPaste);
    this._element.remove();
    this._onEdit.destroy();
    this._onComposition.destroy();
  }

  private _applyBounds(): void {
    if (this._bounds === null || typeof document === 'undefined') {
      return;
    }

    const canvasRect = this._canvas.getBoundingClientRect();

    this._element.style.left = `${canvasRect.left + this._bounds.x}px`;
    this._element.style.top = `${canvasRect.top + this._bounds.y}px`;
    this._element.style.width = `${Math.max(1, this._bounds.width)}px`;
    this._element.style.height = `${Math.max(1, this._bounds.height)}px`;

    const dom = new DOMRect(
      canvasRect.left + this._bounds.x,
      canvasRect.top + this._bounds.y,
      Math.max(1, this._bounds.width),
      Math.max(1, this._bounds.height),
    );

    this._context.updateControlBounds(dom);
  }
}
