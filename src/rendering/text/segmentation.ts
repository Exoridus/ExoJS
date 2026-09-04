/**
 * The one Unicode segmentation authority the text stack uses.
 *
 * Everything that has to decide where a string may be cut - wrapping,
 * ellipsis, the per-unit iteration the simple glyph path runs on, caret
 * granularity in the editing model - asks here instead of reasoning about
 * code points. A code point is not a user-visible character: `e` plus a
 * combining acute, an emoji plus a skin-tone modifier, a ZWJ sequence and a
 * regional-indicator flag pair are each one grapheme cluster made of several
 * code points, and cutting inside one produces a dangling mark or half a flag.
 *
 * Segmentation is delegated to `Intl.Segmenter`. No Unicode tables ship with
 * the engine and no polyfill is loaded.
 *
 * **Cost.** Consulting the platform segmenter is expensive enough to show up
 * in a layout pass, so text that provably cannot contain a multi-unit cluster
 * or a non-obvious word boundary is segmented arithmetically instead - see
 * {@link isTrivialText}. The two paths agree by construction on the strings
 * the fast one accepts.
 *
 * **Degradation.** Where `Intl.Segmenter` is unavailable the helpers fall back
 * to code-point boundaries: surrogate pairs still survive, but combining
 * sequences, ZWJ sequences and flags may be split, and word boundaries degrade
 * to whitespace runs. {@link hasIntlSegmenter} reports which is in force.
 */

/** Whether the platform provides `Intl.Segmenter`, and therefore real grapheme clusters. */
export const hasIntlSegmenter = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';

type Granularity = 'grapheme' | 'word';

const _segmenters = new Map<string, Intl.Segmenter>();

/**
 * Segmenter instances are cached by locale and granularity: constructing one
 * resolves a locale and builds ICU break state, which is far too expensive to
 * repeat per line, let alone per frame.
 */
const _segmenter = (granularity: Granularity, locale: string | undefined): Intl.Segmenter | null => {
  if (!hasIntlSegmenter) return null;

  const key = `${granularity}:${locale ?? ''}`;
  let segmenter = _segmenters.get(key);

  if (segmenter === undefined) {
    segmenter = new Intl.Segmenter(locale, { granularity });
    _segmenters.set(key, segmenter);
  }

  return segmenter;
};

const TAB = 0x09;
const SPACE = 0x20;
/** First combining mark in Unicode; below it no character can extend the one before it. */
const COMBINING_START = 0x0300;

/**
 * Whether `text` can be segmented without consulting the platform segmenter.
 *
 * True when every code unit sits below the first combining mark and above the
 * control range, with the tab the one exception layout hands through. Such a
 * string contains no surrogate (so no astral character), no combining mark, no
 * joiner and no CR, which between them are the only ways a grapheme cluster
 * can span more than one unit; its word boundaries are its blank runs. One
 * unit is therefore one cluster, and a scan answers everything the segmenter
 * would have.
 */
export const isTrivialText = (text: string): boolean => {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);

    if (unit !== TAB && (unit < SPACE || unit >= COMBINING_START)) return false;
  }

  return true;
};

/**
 * Whether `code` is whitespace a line may break on.
 *
 * The no-break space and its relatives are deliberately excluded: they are
 * whitespace to `String.trim` and word separators to the segmenter, and they
 * exist precisely to prevent the break that would follow from either.
 */
const _isBreakingSpace = (code: number): boolean =>
  code === SPACE ||
  code === TAB ||
  (code >= 0x0a && code <= 0x0d) ||
  code === 0x1680 ||
  (code >= 0x2000 && code <= 0x200a) ||
  code === 0x2028 ||
  code === 0x2029 ||
  code === 0x205f ||
  code === 0x3000;

const _isBlankRun = (text: string): boolean => {
  for (let i = 0; i < text.length; i++) {
    if (!_isBreakingSpace(text.charCodeAt(i))) return false;
  }

  return text.length > 0;
};

const _isHighSurrogate = (unit: number): boolean => unit >= 0xd800 && unit <= 0xdbff;

/** Code-point starts - the fallback boundary set, and the floor every path stays above. */
const _codePointStarts = (text: string): number[] => {
  const starts: number[] = [];

  for (let i = 0; i < text.length; i++) {
    starts.push(i);

    if (_isHighSurrogate(text.charCodeAt(i)) && i + 1 < text.length) i++;
  }

  return starts;
};

/**
 * UTF-16 offsets at which each grapheme cluster of `text` starts, in order.
 * An empty string yields an empty array; `text.length` is not appended, so the
 * result has exactly one entry per cluster.
 */
export const graphemeStarts = (text: string, locale?: string): number[] => {
  if (isTrivialText(text)) {
    const starts: number[] = new Array<number>(text.length);

    for (let i = 0; i < text.length; i++) starts[i] = i;

    return starts;
  }

  const segmenter = _segmenter('grapheme', locale);

  if (segmenter === null) return _codePointStarts(text);

  const starts: number[] = [];

  for (const segment of segmenter.segment(text)) {
    starts.push(segment.index);
  }

  return starts;
};

/**
 * The grapheme clusters of `text`, in order. Prefer {@link graphemeStarts} when
 * the caller also needs to map a cluster back to an offset in the source.
 */
export const graphemes = (text: string, locale?: string): string[] => {
  if (isTrivialText(text)) {
    const result: string[] = new Array<string>(text.length);

    for (let i = 0; i < text.length; i++) result[i] = text[i]!;

    return result;
  }

  const segmenter = _segmenter('grapheme', locale);

  if (segmenter === null) {
    const starts = _codePointStarts(text);

    return starts.map((start, i) => text.slice(start, starts[i + 1] ?? text.length));
  }

  const result: string[] = [];

  for (const segment of segmenter.segment(text)) {
    result.push(segment.segment);
  }

  return result;
};

/** How many grapheme clusters `text` holds. */
export const graphemeCount = (text: string, locale?: string): number => {
  if (isTrivialText(text)) return text.length;

  const segmenter = _segmenter('grapheme', locale);

  if (segmenter === null) return _codePointStarts(text).length;

  let count = 0;

  for (const _segment of segmenter.segment(text)) count++;

  return count;
};

/**
 * One word-granularity segment of a string. Segments tile the input:
 * consecutive `[start, end)` ranges concatenate back to it with no gaps.
 */
export interface WordSegment {
  /** UTF-16 offset of the segment's first code unit. */
  readonly start: number;
  /** UTF-16 offset one past the segment's last code unit. */
  readonly end: number;
  /** Whether the segment is a word rather than whitespace, punctuation or a symbol. */
  readonly wordLike: boolean;
}

/**
 * Split `text` into locale-aware word segments - what a word-granularity caret
 * step, a double-click selection and the line wrapper all reason about.
 *
 * Without `Intl.Segmenter` the split degrades to blank-versus-non-blank runs,
 * which is correct for space-separated scripts and coarse elsewhere.
 */
export const wordSegments = (text: string, locale?: string): WordSegment[] => {
  const segments: WordSegment[] = [];

  if (text.length === 0) return segments;

  const segmenter = _segmenter('word', locale);

  if (segmenter !== null) {
    for (const segment of segmenter.segment(text)) {
      segments.push({ start: segment.index, end: segment.index + segment.segment.length, wordLike: segment.isWordLike === true });
    }

    return segments;
  }

  let start = 0;
  let wordLike = !_isBreakingSpace(text.charCodeAt(0));

  for (let i = 1; i <= text.length; i++) {
    const previous = wordLike;

    if (i === text.length) {
      segments.push({ start, end: i, wordLike: previous });

      break;
    }

    wordLike = !_isBreakingSpace(text.charCodeAt(i));

    if (wordLike !== previous) {
      segments.push({ start, end: i, wordLike: previous });
      start = i;
    }
  }

  return segments;
};

/**
 * One run of `text`, classified by whether it is whitespace.
 *
 * Runs tile the string: `text.slice(start, end)` of consecutive entries
 * concatenate back to the input with no gaps.
 */
export interface TextRun {
  /** UTF-16 offset of the run's first code unit. */
  readonly start: number;
  /** UTF-16 offset one past the run's last code unit. */
  readonly end: number;
  /** Whether the run is made entirely of whitespace, and is therefore where a line may break. */
  readonly whitespace: boolean;
}

/** Scripts whose text carries no inter-word spaces, so a line may break between any two words. */
const _unspacedScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Blank-versus-non-blank runs, which is the whole answer for trivial text. */
const _blankRuns = (text: string): TextRun[] => {
  const runs: TextRun[] = [];
  let start = 0;
  let whitespace = _isBreakingSpace(text.charCodeAt(0));

  for (let i = 1; i <= text.length; i++) {
    const previous = whitespace;

    if (i === text.length) {
      runs.push({ start, end: i, whitespace: previous });

      break;
    }

    whitespace = _isBreakingSpace(text.charCodeAt(i));

    if (whitespace !== previous) {
      runs.push({ start, end: i, whitespace: previous });
      start = i;
    }
  }

  return runs;
};

/**
 * Split `text` into alternating whitespace and non-whitespace runs, using
 * locale-aware word segmentation to find the boundaries.
 *
 * A non-whitespace run is the unit wrapping treats as unbreakable, except that
 * runs written in a script with no inter-word spaces (Han, Hiragana, Katakana)
 * are emitted one word at a time, so a Japanese or Chinese line wraps at its
 * own word boundaries rather than overflowing as a single token.
 *
 * Whitespace runs are kept as their own entries rather than folded into the
 * neighbouring word: the wrapper drops the run it breaks on and preserves the
 * one it does not, which is what makes `whiteSpace: 'pre'` keep its columns.
 */
export const textRuns = (text: string, locale?: string): TextRun[] => {
  if (text.length === 0) return [];
  if (isTrivialText(text)) return _blankRuns(text);

  const runs: TextRun[] = [];
  let pending: { start: number; end: number; whitespace: boolean } | null = null;

  const flush = (): void => {
    if (pending !== null) runs.push(pending);
    pending = null;
  };

  for (const segment of wordSegments(text, locale)) {
    const body = text.slice(segment.start, segment.end);
    const whitespace = _isBlankRun(body);
    // A word in an unspaced script must not merge with the word next to it, or
    // the whole run becomes one unbreakable token.
    const standalone = !whitespace && _unspacedScript.test(body);

    if (pending !== null && pending.whitespace === whitespace && !standalone) {
      pending.end = segment.end;
    } else {
      flush();
      pending = { start: segment.start, end: segment.end, whitespace };
    }

    if (standalone) flush();
  }

  flush();

  return runs;
};
