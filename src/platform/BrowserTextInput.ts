import { Signal } from '#core/Signal';
import type { Rectangle } from '#math/Rectangle';

import type { CompositionState, PlatformTextInput, PlatformTextInputHints, TextEditIntent } from './PlatformTextInput';

/**
 * beforeinput types mapped to an insert intent. `insertCompositionText` is
 * handled separately: while a composition is in flight its text belongs to
 * the composition signal, not to the model.
 */
const insertTypes = new Set(['insertText', 'insertFromPaste', 'insertLineBreak']);

/** beforeinput types mapped to a delete intent, with their direction and granularity. */
const deleteTypes = new Map<string, { direction: 'backward' | 'forward'; granularity: 'character' | 'word' | 'line' }>([
  ['deleteContentBackward', { direction: 'backward', granularity: 'character' }],
  ['deleteContentForward', { direction: 'forward', granularity: 'character' }],
  ['deleteWordBackward', { direction: 'backward', granularity: 'word' }],
  ['deleteWordForward', { direction: 'forward', granularity: 'word' }],
  ['deleteSoftLineBackward', { direction: 'backward', granularity: 'line' }],
  ['deleteSoftLineForward', { direction: 'forward', granularity: 'line' }],
]);

/**
 * The `<textarea>` implementation of {@link PlatformTextInput}: a hidden,
 * real-sized element positioned over the drawing surface, focused so the
 * host's keyboard and IME attach to it.
 *
 * `beforeinput` is the source of truth, never `keydown`: the browser has
 * already turned key combinations into semantic edits (`deleteWordBackward`,
 * `insertFromPaste`, `historyUndo`), which would be layout-dependent to
 * reconstruct from key codes. Every mapped event is cancelled - the element
 * is a transport and its own value is never authoritative - except
 * `deleteByCut`, whose clipboard write must survive; the value divergence it
 * causes heals on the next {@link BrowserTextInput.setValue}.
 */
export class BrowserTextInput implements PlatformTextInput {
  private readonly _element: HTMLTextAreaElement;
  private readonly _canvas: HTMLCanvasElement;
  private readonly _onEdit = new Signal<[TextEditIntent]>();
  private readonly _onComposition = new Signal<[CompositionState]>();

  private _composing = false;
  private _bounds: Rectangle | null = null;
  private _hints: PlatformTextInputHints = {};
  private _destroyed = false;

  private readonly _beforeInput = (event: InputEvent): void => {
    const type = event.inputType;

    if (this._composing) {
      // The composition owns the text while it is in flight; cancelling or
      // mirroring here would break the IME session.
      return;
    }

    if (type === 'historyUndo') {
      event.preventDefault();
      this._onEdit.dispatch({ kind: 'historyUndo' });

      return;
    }

    if (type === 'historyRedo') {
      event.preventDefault();
      this._onEdit.dispatch({ kind: 'historyRedo' });

      return;
    }

    const insert = insertTypes.has(type) || type === 'insertCompositionText';
    const del = deleteTypes.get(type) ?? null;

    if (insert) {
      event.preventDefault();

      let text: string;

      if (type === 'insertLineBreak') {
        text = '\n';
      } else if (type === 'insertFromPaste') {
        text = event.dataTransfer?.getData('text/plain') ?? event.data ?? '';
      } else {
        text = event.data ?? '';
      }

      this._onEdit.dispatch({ kind: 'insert', text });

      return;
    }

    if (del !== null) {
      event.preventDefault();
      this._onEdit.dispatch({ kind: 'deleteContent', direction: del.direction, granularity: del.granularity });

      return;
    }

    if (type === 'deleteByCut') {
      if (this._hints.masked === true) {
        // Masking refuses clipboard reads; cancelling the edit cancels the
        // clipboard write with it.
        event.preventDefault();

        return;
      }

      // Left uncanceled so the browser writes the selection to the
      // clipboard. The native value edit is corrected by the next
      // `setValue`, which mirrors the model over it.
      this._onEdit.dispatch({ kind: 'deleteContent', direction: 'backward', granularity: 'character' });
    }
  };

  private readonly _compositionStart = (): void => {
    this._composing = true;
    this._onComposition.dispatch({ phase: 'start' });
  };

  private readonly _compositionUpdate = (event: CompositionEvent): void => {
    this._onComposition.dispatch({ phase: 'update', text: event.data, caret: event.data.length });
  };

  private readonly _compositionEnd = (event: CompositionEvent): void => {
    this._composing = false;
    this._onComposition.dispatch({ phase: 'end', text: event.data });
  };

  private readonly _refuseClipboardRead = (event: Event): void => {
    if (this._hints.masked === true) {
      event.preventDefault();
    }
  };

  public constructor(canvas: HTMLCanvasElement) {
    this._canvas = canvas;

    const element = document.createElement('textarea');

    element.autocomplete = 'off';
    element.setAttribute('autocorrect', 'off');
    element.setAttribute('autocapitalize', 'off');
    element.spellcheck = false;
    element.tabIndex = -1;
    element.setAttribute('aria-hidden', 'true');

    const style = element.style;

    // Real, non-zero size and visible (not `display: none` / `visibility:
    // hidden`) - an IME does not attach to a zero-sized or invisible
    // element. Opacity 0 keeps it off the screen while it stays focusable.
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

    element.addEventListener('beforeinput', this._beforeInput);
    element.addEventListener('compositionstart', this._compositionStart);
    element.addEventListener('compositionupdate', this._compositionUpdate);
    element.addEventListener('compositionend', this._compositionEnd);
    element.addEventListener('copy', this._refuseClipboardRead);
    element.addEventListener('cut', this._refuseClipboardRead);
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

    if (this._element.value !== text) {
      this._element.value = text;
    }

    // `setSelectionRange` needs offsets within the value; the widget maps
    // its model selection before calling, so out-of-range here is a caller
    // bug worth surfacing as a no-op rather than a thrown DOMException.
    const clampedStart = Math.max(0, Math.min(selectionStart, text.length));
    const clampedEnd = Math.max(clampedStart, Math.min(selectionEnd, text.length));

    if (this._element.selectionStart !== clampedStart || this._element.selectionEnd !== clampedEnd) {
      this._element.setSelectionRange(clampedStart, clampedEnd);
    }
  }

  public setBounds(rect: Rectangle): void {
    this._bounds = rect.clone();
    this._applyBounds();
  }

  public setCaretRect(_rect: Rectangle): void {
    // A `<textarea>` anchors its IME candidate window to the element, so
    // caret precision has no effect on this backend; the EditContext
    // backend consumes it instead.
  }

  public setHints(hints: PlatformTextInputHints): void {
    this._hints = hints;

    if (hints.inputMode !== undefined) {
      this._element.inputMode = hints.inputMode;
    }

    if (hints.enterKeyHint !== undefined) {
      this._element.enterKeyHint = hints.enterKeyHint;
    }
  }

  public destroy(): void {
    if (this._destroyed) {
      return;
    }

    this._destroyed = true;
    this._element.removeEventListener('beforeinput', this._beforeInput);
    this._element.removeEventListener('compositionstart', this._compositionStart);
    this._element.removeEventListener('compositionupdate', this._compositionUpdate);
    this._element.removeEventListener('compositionend', this._compositionEnd);
    this._element.removeEventListener('copy', this._refuseClipboardRead);
    this._element.removeEventListener('cut', this._refuseClipboardRead);
    this._element.remove();
    this._onEdit.destroy();
    this._onComposition.destroy();
  }

  /**
   * Place the element over the stored bounds. Bounds arrive in CSS pixels
   * relative to the drawing surface's top-left - the space the caller's
   * layout already maps into - so the canvas's page position decides the
   * placement.
   */
  private _applyBounds(): void {
    if (this._bounds === null || typeof document === 'undefined') {
      return;
    }

    const canvasRect = this._canvas.getBoundingClientRect();

    this._element.style.left = `${canvasRect.left + this._bounds.x}px`;
    this._element.style.top = `${canvasRect.top + this._bounds.y}px`;
    this._element.style.width = `${Math.max(1, this._bounds.width)}px`;
    this._element.style.height = `${Math.max(1, this._bounds.height)}px`;
  }
}
