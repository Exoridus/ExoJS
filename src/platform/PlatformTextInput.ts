import { type Signal } from '#core/Signal';
import type { Rectangle } from '#math/Rectangle';

/**
 * One edit the host wants applied to the text model. `insert` carries the
 * text to place over the current selection (an IME commit, a typed character,
 * a paste); `deleteContent` removes the selection, or the range a granularity
 * step spans next to the caret; `historyUndo`/`historyRedo` ask for the
 * widget's own undo ring, not the host's.
 */
export type TextEditIntent =
  | { kind: 'insert'; text: string }
  | { kind: 'deleteContent'; direction: 'backward' | 'forward'; granularity: 'character' | 'word' | 'line' }
  | { kind: 'historyUndo' }
  | { kind: 'historyRedo' };

/**
 * Progress of a host-side composition (an IME candidate). While one is
 * in flight its text lives only here; it merges into the value when the
 * composition ends.
 */
export type CompositionState = { phase: 'start' } | { phase: 'update'; text: string; caret: number } | { phase: 'end'; text: string };

/**
 * What a host should tell its input method about the field. Every member is
 * a hint: an input method may ignore any of them.
 */
export interface PlatformTextInputHints {
  /** What kind of content the field holds, so mobile keyboards can adapt. */
  inputMode?: 'text' | 'numeric' | 'decimal' | 'tel' | 'email' | 'url' | 'search';
  /** What the field's confirm key should be labelled as. */
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'search' | 'send';
  /** The field shows masking characters; clipboard reads are refused. */
  masked?: boolean;
}

/**
 * The transport between a text-editing widget and whatever the host uses to
 * receive real keyboard and IME input. The contract knows no text model: it
 * mirrors state in (`setValue`), mirrors geometry in (`setBounds`,
 * `setCaretRect`), states hints (`setHints`), and reports edits and
 * composition progress out through its signals.
 *
 * `createTextInput` may return `null` - a host with no way to receive text
 * input is a supported outcome, not an error. The widget renders and takes
 * focus, but rejects edits.
 */
export interface PlatformTextInput {
  /** Give the transport host focus, so keyboards and IMEs attach. */
  focus(): void;

  /** Release host focus. */
  blur(): void;

  /**
   * Mirror the model's value and selection into the transport, so host-side
   * features that read the element (clipboard, word deletion, undo) operate
   * on the same text the model holds. Ignored while a composition is in
   * flight; the mirror resumes when it ends.
   */
  setValue(text: string, selectionStart: number, selectionEnd: number): void;

  /**
   * Where the field is, in CSS pixels relative to the drawing surface's
   * top-left. Hosts that anchor an input method to a real element position
   * the element there; the caller converts from its own layout space,
   * which is where a UI scale or a canvas display size is applied.
   */
  setBounds(rect: Rectangle): void;

  /** Where the caret is, in the same space as {@link PlatformTextInput.setBounds} - the anchor point for an IME candidate window. */
  setCaretRect(rect: Rectangle): void;

  /** Update the input-method hints. */
  setHints(hints: PlatformTextInputHints): void;

  /** Fires for every edit the host asks for. Never fires while composing. */
  readonly onEdit: Signal<[TextEditIntent]>;

  /** Fires for composition progress. An update's text is in flight, not committed. */
  readonly onComposition: Signal<[CompositionState]>;

  /** Tear the transport down: detach element and listeners. */
  destroy(): void;
}
