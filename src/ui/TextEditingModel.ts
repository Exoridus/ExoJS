import { Signal } from '#core/Signal';
import type { CompositionState } from '#platform/PlatformTextInput';

/** Which side of the caret an edit acts on. */
export type TextEditDirection = 'backward' | 'forward';

/** How far a caret move or delete reaches. */
export type TextEditGranularity = 'character' | 'word' | 'line';

/** Where an inserted text came from - paste and typed input coalesce differently. */
export type TextInsertSource = 'input' | 'paste';

/** Options accepted by {@link TextEditingModel}; every member has a setter. */
export interface TextEditingModelOptions {
  /** Maximum value length in UTF-16 code units; inserts are truncated to fit, overflow is refused. Unlimited when absent. */
  maxLength?: number;
  /**
   * Gate on the value an edit would produce. An edit whose resulting value
   * is rejected does not happen at all - a refused paste is dropped whole,
   * not clipped to its permitted part.
   */
  filter?: ((candidate: string) => boolean) | null;
  /** When set, {@link TextEditingModel.renderedText} replaces every grapheme with it. The value itself is never masked. */
  maskChar?: string | null;
  /** Whether newlines are accepted in the value. Default `false` - a single-line field rejects inserts containing `\n`. */
  multiline?: boolean;
}

interface UndoEntry {
  value: string;
  anchor: number;
  focus: number;
}

interface Composition {
  text: string;
  start: number;
}

const UNDO_RING_CAPACITY = 100;

const isHighSurrogate = (unit: number): boolean => unit >= 0xd800 && unit <= 0xdbff;

const hasWhitespace = (text: string): boolean => {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);

    if (unit === 0x20 || unit === 0x09 || unit === 0x0a || unit === 0x0d || (unit >= 0x0b && unit <= 0x0c)) {
      return true;
    }
  }

  return false;
};

/** Drop a trailing code unit that would split a surrogate pair in half. */
const trimSplitSurrogate = (text: string): string => {
  if (text.length > 0 && isHighSurrogate(text.charCodeAt(text.length - 1))) {
    return text.slice(0, -1);
  }

  return text;
};

const hasGraphemeSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';

const graphemeSegmenter = hasGraphemeSegmenter ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;
const wordSegmenter = hasGraphemeSegmenter ? new Intl.Segmenter(undefined, { granularity: 'word' }) : null;

/**
 * UTF-16 offsets where each glyph (one code point) of `text` starts. This is
 * the index space an unmasked text layout's placements are expressed in.
 */
export const codePointOffsets = (text: string): number[] => {
  const offsets: number[] = [];

  for (let i = 0; i < text.length; i++) {
    offsets.push(i);

    if (isHighSurrogate(text.charCodeAt(i))) {
      i++;
    }
  }

  return offsets;
};

/**
 * UTF-16 offsets where each grapheme cluster of `text` starts. A masked
 * layout replaces one grapheme with one mask character, so this is its
 * index space - the mapping stays one glyph per grapheme.
 */
export const graphemeOffsets = (text: string): number[] => {
  if (graphemeSegmenter !== null) {
    const offsets: number[] = [];

    for (const segment of graphemeSegmenter.segment(text)) {
      offsets.push(segment.index);
    }

    return offsets;
  }

  return codePointOffsets(text);
};

/** The glyph count of `text`. */
export const glyphCount = (text: string): number => {
  if (graphemeSegmenter !== null) {
    let count = 0;

    for (const _segment of graphemeSegmenter.segment(text)) {
      count++;
    }

    return count;
  }

  return codePointOffsets(text).length;
};

/** Number of glyphs fully before UTF-16 offset `offset`. */
export const glyphIndexAtOffset = (offsets: number[], offset: number): number => {
  let low = 0;
  let high = offsets.length;

  while (low < high) {
    const mid = (low + high) >> 1;

    if ((offsets[mid] ?? 0) < offset) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return low;
};

/** The UTF-16 offset glyph `index` starts at, or the end of the text when `index` is the glyph count. */
export const glyphOffsetAtIndex = (offsets: number[], index: number, textLength: number): number => {
  if (offsets.length === 0) {
    return Math.max(0, Math.min(index, textLength));
  }

  const clamped = Math.max(0, Math.min(index, offsets.length));

  return clamped >= offsets.length ? textLength : (offsets[clamped] ?? textLength);
};

interface WordSegment {
  start: number;
  end: number;
  wordLike: boolean;
}

const wordSegmentsOf = (text: string): WordSegment[] => {
  if (wordSegmenter !== null) {
    const segments: WordSegment[] = [];

    for (const segment of wordSegmenter.segment(text)) {
      segments.push({ start: segment.index, end: segment.index + segment.segment.length, wordLike: segment.isWordLike === true });
    }

    return segments;
  }

  const segments: WordSegment[] = [];
  let start = 0;
  let inWord = text.length > 0 && !hasWhitespace(text[0] ?? '');

  for (let i = 1; i <= text.length; i++) {
    const wasWord = inWord;

    if (i === text.length) {
      segments.push({ start, end: i, wordLike: wasWord });

      break;
    }

    inWord = !hasWhitespace(text[i] ?? '');

    if (inWord !== wasWord) {
      segments.push({ start, end: i, wordLike: wasWord });
      start = i;
    }
  }

  return segments;
};

const isWhitespaceUnit = (unit: number): boolean => unit === 0x20 || unit === 0x09 || unit === 0x0a || unit === 0x0d || unit === 0x0b || unit === 0x0c;

/**
 * The boundary a word-step backward from `from` reaches: the whitespace run
 * before the caret, then one word segment before it - or one grapheme when
 * the character before the caret is not word-like (punctuation deletes one
 * cluster at a time).
 */
const wordBoundaryBackward = (text: string, from: number): number => {
  const graphemes = graphemeOffsets(text);
  const glyphs = graphemeSegmenter !== null ? graphemes : codePointOffsets(text);
  let i = from;

  while (i > 0 && isWhitespaceUnit(text.charCodeAt(i - 1))) {
    i = glyphOffsetAtIndex(glyphs, glyphIndexAtOffset(glyphs, i) - 1, text.length);
  }

  if (i > 0) {
    const segments = wordSegmentsOf(text);
    let previous: WordSegment | null = null;

    for (const segment of segments) {
      if (segment.start >= i) {
        break;
      }

      if (segment.end > i - 1 && segment.end <= i) {
        previous = segment;
      }
    }

    if (previous === null) {
      for (const segment of segments) {
        if (segment.end > i - 1 && segment.start < i) {
          previous = segment;

          break;
        }
      }
    }

    if (previous?.wordLike === true) {
      return previous.start;
    }

    return glyphOffsetAtIndex(glyphs, glyphIndexAtOffset(glyphs, i) - 1, text.length);
  }

  return i;
};

/**
 * The boundary a word-step forward from `from` reaches: the whitespace run
 * after the caret, then one word segment - or one grapheme when the
 * character at the caret is not word-like.
 */
const wordBoundaryForward = (text: string, from: number): number => {
  const graphemes = graphemeOffsets(text);
  const glyphs = graphemeSegmenter !== null ? graphemes : codePointOffsets(text);
  const length = text.length;
  let i = from;

  while (i < length && isWhitespaceUnit(text.charCodeAt(i))) {
    i = glyphOffsetAtIndex(glyphs, glyphIndexAtOffset(glyphs, i) + 1, text.length);
  }

  if (i < length) {
    const segments = wordSegmentsOf(text);

    for (const segment of segments) {
      if (segment.start <= i && segment.end > i) {
        return segment.wordLike ? segment.end : glyphOffsetAtIndex(glyphs, glyphIndexAtOffset(glyphs, i) + 1, text.length);
      }
    }

    return glyphOffsetAtIndex(glyphs, glyphIndexAtOffset(glyphs, i) + 1, text.length);
  }

  return i;
};

/**
 * The editing core behind a text field: value, anchor/focus selection and
 * composition state, with grapheme-correct deletion and motion, an undo
 * ring, and value gates (`maxLength`, `filter`).
 *
 * Headless by design - no rendering, no DOM, no widget - so the whole test
 * mass lives here. Selection offsets are UTF-16 indices into `value`.
 *
 * Decisions that are contracts, not details:
 * - Backspace deletes a grapheme cluster, never a code unit, so emoji and
 *   combining marks survive as units.
 * - Consecutive inserts of non-whitespace at the caret extend one undo
 *   entry; whitespace, deletes, pastes, selection changes and composition
 *   boundaries close the chain. The ring holds 100 entries.
 * - `maxLength` truncates an insert to the space left; `filter` rejects the
 *   whole resulting value and with it the whole edit, a refused paste
 *   included.
 * - Masking never touches `value`: {@link TextEditingModel.renderedText}
 *   carries the replacement characters, and clipboard reads are refused
 *   one layer up while masked.
 * - An in-flight composition lives outside `value` and outside undo
 *   history. Committing one changes the value (and reports it), but never
 *   creates an undo entry.
 */
export class TextEditingModel {
  public readonly onChange = new Signal<[value: string]>();

  private _value = '';
  private _anchor = 0;
  private _focus = 0;
  private _composition: Composition | null = null;
  private _maxLength: number | null = null;
  private _filter: ((candidate: string) => boolean) | null = null;
  private _maskChar: string | null = null;
  private _multiline: boolean;
  private _undoStack: UndoEntry[] = [];
  private _redoStack: UndoEntry[] = [];
  private _undoOpen = false;
  private _lastInsertEnd = -1;

  public constructor(options: TextEditingModelOptions = {}) {
    this._maxLength = options.maxLength ?? null;
    this._filter = options.filter ?? null;
    this._maskChar = options.maskChar != null && options.maskChar !== '' ? options.maskChar : null;
    this._multiline = options.multiline ?? false;
  }

  /** The text held, never masked. */
  public get value(): string {
    return this._value;
  }

  /** Where the selection starts, independent of the direction it was drawn in. */
  public get selectionStart(): number {
    return Math.min(this._anchor, this._focus);
  }

  /** Where the selection ends, independent of the direction it was drawn in. */
  public get selectionEnd(): number {
    return Math.max(this._anchor, this._focus);
  }

  /** The selection's fixed end. */
  public get anchor(): number {
    return this._anchor;
  }

  /** The selection's moving end - where the caret renders for a collapsed selection. */
  public get focus(): number {
    return this._focus;
  }

  /** Whether a composition is in flight. */
  public get composing(): boolean {
    return this._composition !== null;
  }

  /** The in-flight composition text, or `''`. */
  public get compositionText(): string {
    return this._composition?.text ?? '';
  }

  /** Where the in-flight composition sits in the value, or `-1`. */
  public get compositionStart(): number {
    return this._composition?.start ?? -1;
  }

  /**
   * `value` with the in-flight composition merged in at the composition's
   * start, never masked. This is the offset space selections and the caret
   * live in while a composition is in flight, so a view mapping model offsets
   * onto laid-out glyphs measures against this string rather than `value`.
   */
  public get composedText(): string {
    if (this._composition === null) {
      return this._value;
    }

    const start = this._composition.start;

    return this._value.slice(0, start) + this._composition.text + this._value.slice(start);
  }

  /**
   * The text a field displays: {@link TextEditingModel.composedText}, or, when
   * masked, one mask character per grapheme of it.
   */
  public get renderedText(): string {
    if (this._maskChar === null) {
      return this.composedText;
    }

    // Counted over the composed string rather than as value + candidate: a
    // candidate inserted inside a grapheme cluster joins it, and a mask glyph
    // count that disagreed with the composed string's grapheme count would
    // shift the caret by the difference.
    return this._maskChar.repeat(glyphCount(this.composedText));
  }

  /** Maximum value length in UTF-16 code units, or `null` for unlimited. */
  public get maxLength(): number | null {
    return this._maxLength;
  }

  public set maxLength(value: number | null) {
    this._maxLength = value;
  }

  /** The value gate applied to every insert, or `null` for none. */
  public get filter(): ((candidate: string) => boolean) | null {
    return this._filter;
  }

  public set filter(value: ((candidate: string) => boolean) | null) {
    this._filter = value;
  }

  /** The masking character, or `null` when the value renders as it is. */
  public get maskChar(): string | null {
    return this._maskChar;
  }

  public set maskChar(value: string | null) {
    this._maskChar = value != null && value !== '' ? value : null;
  }

  /** Whether newlines are accepted in the value. */
  public get multiline(): boolean {
    return this._multiline;
  }

  public set multiline(value: boolean) {
    this._multiline = value;
  }

  /**
   * Place `text` over the selection. Returns whether it was applied - a
   * full value, a rejected candidate or a newline in a single-line model
   * refuse it whole.
   */
  public insert(text: string, source: TextInsertSource = 'input'): boolean {
    if (this._composition !== null || text === '') {
      return false;
    }

    if (!this._multiline && text.includes('\n')) {
      return false;
    }

    const start = this.selectionStart;
    const end = this.selectionEnd;

    if (this._maxLength !== null) {
      const available = this._maxLength - (this._value.length - (end - start));

      if (available <= 0) {
        return false;
      }

      text = trimSplitSurrogate(text.slice(0, available));

      if (text === '') {
        return false;
      }
    }

    const candidate = this._value.slice(0, start) + text + this._value.slice(end);

    if (this._filter !== null && !this._filter(candidate)) {
      return false;
    }

    const canStartRun = source !== 'paste' && start === end && !hasWhitespace(text);
    const extendsRun = canStartRun && this._undoOpen && this._lastInsertEnd === start;

    if (!extendsRun) {
      this._pushUndo({ value: this._value, anchor: this._anchor, focus: this._focus });
    }

    this._undoOpen = canStartRun;

    this._value = candidate;
    this._anchor = this._focus = start + text.length;
    this._lastInsertEnd = this._focus;
    this.onChange.dispatch(this._value);

    return true;
  }

  /**
   * Remove the selection, or the range a step of `granularity` spans next
   * to the caret. A character step deletes one grapheme cluster, never a
   * code unit.
   */
  public deleteContent(direction: TextEditDirection, granularity: TextEditGranularity): boolean {
    if (this._composition !== null) {
      return false;
    }

    const start = this.selectionStart;
    const end = this.selectionEnd;
    let from = start;
    let to = end;

    if (start === end) {
      if (granularity === 'line') {
        from = direction === 'backward' ? 0 : start;
        to = direction === 'backward' ? start : this._value.length;
      } else if (direction === 'backward') {
        from = granularity === 'word' ? wordBoundaryBackward(this._value, start) : this._stepBackward(start);
        to = start;
      } else {
        from = start;
        to = granularity === 'word' ? wordBoundaryForward(this._value, start) : this._stepForward(start);
      }
    }

    if (from >= to) {
      return false;
    }

    this._pushUndo({ value: this._value, anchor: this._anchor, focus: this._focus });
    this._undoOpen = false;

    this._value = this._value.slice(0, from) + this._value.slice(to);
    this._anchor = this._focus = from;
    this._lastInsertEnd = -1;
    this.onChange.dispatch(this._value);

    return true;
  }

  /**
   * Move the caret by one step of `granularity`. With `extend` the anchor
   * stays and the selection follows; without it the selection collapses to
   * the new position.
   */
  public moveCaret(direction: TextEditDirection, granularity: TextEditGranularity, extend: boolean): void {
    let next: number;

    if (granularity === 'line') {
      next = direction === 'backward' ? 0 : this._value.length;
    } else if (direction === 'backward') {
      next = granularity === 'word' ? wordBoundaryBackward(this._value, this._focus) : this._stepBackward(this._focus);
    } else {
      next = granularity === 'word' ? wordBoundaryForward(this._value, this._focus) : this._stepForward(this._focus);
    }

    this._focus = next;

    if (!extend) {
      this._anchor = next;
    }

    this._undoOpen = false;
    this._lastInsertEnd = -1;
  }

  /** Select everything. */
  public selectAll(): void {
    this._anchor = 0;
    this._focus = this._value.length;
    this._undoOpen = false;
    this._lastInsertEnd = -1;
  }

  /**
   * The word segment spanning `offset`, as `[start, end)` - what a
   * double-click selects. The segment containing the offset (a caret on a
   * space selects the space run), or the last segment when the offset sits
   * at the end of the value.
   */
  public wordRangeAt(offset: number): { start: number; end: number } {
    if (this._value.length === 0) {
      return { start: 0, end: 0 };
    }

    const index = Math.min(offset, this._value.length - 1);
    const segments = wordSegmentsOf(this._value);

    for (const segment of segments) {
      if (segment.start <= index && index < segment.end) {
        return { start: segment.start, end: segment.end };
      }
    }

    return { start: 0, end: this._value.length };
  }

  /**
   * Replace the whole value programmatically. Bypasses `maxLength` and
   * `filter` - assigning a value is an authoring act, not an edit - and
   * records one undo entry. Refused while a composition is in flight, the
   * way every other value mutation is.
   */
  public setValue(text: string): boolean {
    if (this._composition !== null || text === this._value) {
      return false;
    }

    this._pushUndo({ value: this._value, anchor: this._anchor, focus: this._focus });
    this._undoOpen = false;

    this._value = text;
    this._anchor = this._focus = text.length;
    this._lastInsertEnd = -1;
    this.onChange.dispatch(this._value);

    return true;
  }

  /** Set the selection; the ends are taken in either order. */
  public setSelection(anchor: number, focus: number): void {
    this._anchor = Math.max(0, Math.min(anchor, this._value.length));
    this._focus = Math.max(0, Math.min(focus, this._value.length));
    this._undoOpen = false;
    this._lastInsertEnd = -1;
  }

  /** Restore the newest undo entry. Returns whether there was one. */
  public undo(): boolean {
    const entry = this._undoStack.pop();

    if (entry === undefined) {
      return false;
    }

    this._redoStack.push({ value: this._value, anchor: this._anchor, focus: this._focus });

    if (this._redoStack.length > UNDO_RING_CAPACITY) {
      this._redoStack.shift();
    }

    this._value = entry.value;
    this._anchor = entry.anchor;
    this._focus = entry.focus;
    this._undoOpen = false;
    this._lastInsertEnd = -1;
    this.onChange.dispatch(this._value);

    return true;
  }

  /** Reapply the newest undone entry. Returns whether there was one. */
  public redo(): boolean {
    const entry = this._redoStack.pop();

    if (entry === undefined) {
      return false;
    }

    this._undoStack.push({ value: this._value, anchor: this._anchor, focus: this._focus });

    if (this._undoStack.length > UNDO_RING_CAPACITY) {
      this._undoStack.shift();
    }

    this._value = entry.value;
    this._anchor = entry.anchor;
    this._focus = entry.focus;
    this._undoOpen = false;
    this._lastInsertEnd = -1;
    this.onChange.dispatch(this._value);

    return true;
  }

  /**
   * Feed composition progress. A `start` collapses the selection where the
   * composition begins; an `update` moves the caret with the candidate
   * text without touching the value; an `end` commits the candidate into
   * the value - reporting `onChange`, but never entering undo history.
   * `null` discards an in-flight composition, as a lost focus must.
   */
  public setComposition(state: CompositionState | null): void {
    if (state === null) {
      this._composition = null;
      this._undoOpen = false;
      this._lastInsertEnd = -1;

      return;
    }

    if (state.phase === 'start') {
      if (this._composition !== null) {
        return;
      }

      const start = this.selectionStart;

      this._anchor = this._focus = start;
      this._composition = { text: '', start };
      this._undoOpen = false;
      this._lastInsertEnd = -1;

      return;
    }

    if (this._composition === null) {
      return;
    }

    if (state.phase === 'update') {
      this._composition.text = state.text;
      this._focus = this._anchor = this._composition.start + state.text.length;

      return;
    }

    let text = state.text;

    if (this._maxLength !== null) {
      text = trimSplitSurrogate(text.slice(0, Math.max(0, this._maxLength - this._value.length)));
    }

    const start = this._composition.start;

    this._value = this._value.slice(0, start) + text + this._value.slice(start);
    this._composition = null;
    this._anchor = this._focus = start + text.length;
    this._lastInsertEnd = -1;

    if (text !== '') {
      this.onChange.dispatch(this._value);
    }
  }

  /** One grapheme backward from `offset`, never one code unit. */
  private _stepBackward(offset: number): number {
    const glyphs = graphemeSegmenter !== null ? graphemeOffsets(this._value) : codePointOffsets(this._value);

    return glyphOffsetAtIndex(glyphs, glyphIndexAtOffset(glyphs, offset) - 1, this._value.length);
  }

  /** One grapheme forward from `offset`. */
  private _stepForward(offset: number): number {
    const glyphs = graphemeSegmenter !== null ? graphemeOffsets(this._value) : codePointOffsets(this._value);

    return glyphOffsetAtIndex(glyphs, glyphIndexAtOffset(glyphs, offset) + 1, this._value.length);
  }

  /**
   * Record the state before a mutation, clearing any redo tail. The ring
   * holds {@link UNDO_RING_CAPACITY} entries; the oldest falls out. Whether
   * the entry absorbs following inserts is tracked by the run state the
   * mutating operation sets, never here - a delete, paste, selection change
   * or composition boundary closes the run at its own site.
   */
  private _pushUndo(snapshot: { value: string; anchor: number; focus: number }): void {
    this._redoStack.length = 0;
    this._undoStack.push({ ...snapshot });

    if (this._undoStack.length > UNDO_RING_CAPACITY) {
      this._undoStack.shift();
    }
  }
}
