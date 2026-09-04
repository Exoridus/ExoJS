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
 * **Degradation.** Where `Intl.Segmenter` is unavailable the helpers fall back
 * to code-point boundaries: surrogate pairs still survive, but combining
 * sequences, ZWJ sequences and flags may be split. {@link hasIntlSegmenter}
 * reports which of the two is in force.
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
  const segmenter = _segmenter('grapheme', locale);

  if (segmenter === null) return _codePointStarts(text).length;

  let count = 0;

  for (const _segment of segmenter.segment(text)) count++;

  return count;
};

/**
 * Reverse `text` by grapheme cluster.
 *
 * This is what the legacy right-to-left approximation needs: reversing by code
 * point moves a combining mark in front of its base and tears a ZWJ sequence
 * apart. It is still only a reversal - see {@link LayoutOptions.direction} for
 * what that does and does not buy.
 */
export const reverseGraphemes = (text: string, locale?: string): string => graphemes(text, locale).reverse().join('');

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

const _isWhitespace = (text: string): boolean => text.trim().length === 0;

/**
 * Split `text` into locale-aware word segments - what a word-granularity caret
 * step, a double-click selection and the line wrapper all reason about.
 *
 * Without `Intl.Segmenter` the split degrades to whitespace-versus-non-whitespace
 * runs, which is correct for space-separated scripts and coarse elsewhere.
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
  let wordLike = !_isWhitespace(text[0]!);

  for (let i = 1; i <= text.length; i++) {
    const previous = wordLike;

    if (i === text.length) {
      segments.push({ start, end: i, wordLike: previous });

      break;
    }

    wordLike = !_isWhitespace(text[i]!);

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

/** Scripts whose text carries no inter-word spaces, so a line may break between any two clusters. */
const _unspacedScript = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

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
  const runs: TextRun[] = [];

  if (text.length === 0) return runs;

  let pending: { start: number; end: number; whitespace: boolean } | null = null;

  const flush = (): void => {
    if (pending !== null) runs.push(pending);
    pending = null;
  };

  for (const segment of wordSegments(text, locale)) {
    const body = text.slice(segment.start, segment.end);
    const whitespace = _isWhitespace(body);
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
