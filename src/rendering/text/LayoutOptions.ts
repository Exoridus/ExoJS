/**
 * Controls text flow and overflow — separate from {@link TextStyle} which
 * describes visual appearance. Pass to {@link Text} or {@link layoutText}.
 */
export interface LayoutOptions {
  /** Word-wrap boundary in pixels. Lines exceeding this width are broken at word boundaries. */
  maxWidth?: number;
  /** Clip boundary in pixels. Text beyond this height is clipped or ellipsized. */
  maxHeight?: number;
  /** What to do when text overflows `maxHeight`. Defaults to `'visible'`. */
  overflow?: 'visible' | 'clip' | 'ellipsis';
  /** Additional gap in pixels between glyphs (on top of the font's advance). */
  letterSpacing?: number;
  /** Text direction. Defaults to `'ltr'`. RTL is not fully implemented. */
  direction?: 'ltr' | 'rtl';
  /**
   * Break individual words that are wider than `maxWidth` at character boundaries.
   * Only applies when `maxWidth` is set. Defaults to `false`.
   */
  breakWords?: boolean;
  /**
   * Whitespace handling mode:
   * - `'normal'`   — Consecutive spaces collapse to one; `\n` becomes a space (standard wrap).
   * - `'pre'`      — Spaces and newlines preserved verbatim.
   * - `'pre-line'` — Spaces collapse; `\n` preserved (default when no explicit mode).
   *
   * Defaults to `'pre-line'` (current historical behaviour).
   */
  whiteSpace?: 'normal' | 'pre' | 'pre-line';
}
