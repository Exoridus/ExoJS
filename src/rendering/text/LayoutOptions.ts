/**
 * Controls text flow and overflow - separate from {@link TextStyle} which
 * describes visual appearance. Pass to {@link Text} or {@link layoutText}.
 */
export interface LayoutOptions {
  /** Word-wrap boundary in pixels. Lines exceeding this width are broken at word boundaries. */
  maxWidth?: number;
  /**
   * Vertical boundary in pixels. Only whole lines that fit within it are kept.
   * Has no effect on its own - pair it with an `overflow` policy.
   */
  maxHeight?: number;
  /**
   * What to do with lines that do not fit `maxHeight`. Defaults to `'visible'`.
   *
   * - `'visible'`  - Keep every line; `maxHeight` is ignored.
   * - `'clip'`     - Drop the lines that do not fit.
   * - `'ellipsis'` - Drop them and mark the last visible line with `…`,
   *   shortening it so it still fits `maxWidth` when one is set.
   */
  overflow?: 'visible' | 'clip' | 'ellipsis';
  /** Additional gap in pixels between glyphs (on top of the font's advance). */
  letterSpacing?: number;
  /**
   * Text direction. Defaults to `'ltr'`.
   *
   * `'rtl'` reverses each line's glyphs visually after wrapping, which is
   * correct for uniformly right-to-left text. Full bidi (mixed LTR/RTL runs),
   * Arabic contextual shaping, and direction-relative alignment are not
   * implemented - `align` stays literal in both directions.
   */
  direction?: 'ltr' | 'rtl';
  /**
   * Break individual words that are wider than `maxWidth` at character boundaries.
   * Only applies when `maxWidth` is set. Defaults to `false`.
   */
  breakWords?: boolean;
  /**
   * Whitespace handling mode:
   * - `'normal'`   - Consecutive spaces collapse to one; `\n` becomes a space (standard wrap).
   * - `'pre'`      - Spaces and newlines preserved verbatim.
   * - `'pre-line'` - Spaces collapse; `\n` preserved (default when no explicit mode).
   *
   * Defaults to `'pre-line'` (current historical behaviour).
   */
  whiteSpace?: 'normal' | 'pre' | 'pre-line';
}
