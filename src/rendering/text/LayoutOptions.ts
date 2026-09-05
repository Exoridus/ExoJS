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
   * Hard cap on the number of laid-out lines, counted after wrapping.
   *
   * Unlike `maxHeight` this clips on its own, whatever `overflow` says -
   * capping the line count is the whole point of asking for one. Pair it with
   * `overflow: 'ellipsis'` to mark the last kept line. When both a cap and a
   * `maxHeight` apply, the smaller one wins.
   *
   * Must be a positive integer.
   */
  maxLines?: number;
  /**
   * What to do with lines that do not fit `maxHeight` or `maxLines`. Defaults
   * to `'visible'`.
   *
   * - `'visible'`  - Keep every line; `maxHeight` is ignored. A `maxLines` cap
   *   still applies, silently.
   * - `'clip'`     - Drop the lines that do not fit.
   * - `'ellipsis'` - Drop them and mark the last visible line with `ellipsis`,
   *   shortening it so it still fits `maxWidth` when one is set. Under a line
   *   cap the marker also reaches a last line that overflows `maxWidth` with no
   *   line dropped at all - a single unbreakable word under `maxLines: 1`.
   */
  overflow?: 'visible' | 'clip' | 'ellipsis';
  /**
   * Marker appended to the last kept line under `overflow: 'ellipsis'`.
   * Defaults to the horizontal ellipsis, U+2026. Set `'...'` for the
   * three-period spelling, or `''` to truncate without a marker.
   *
   * The marker is measured as text in the same font, so a long one eats
   * proportionally more of the line it terminates. Truncation stops at
   * grapheme-cluster boundaries, so a combining sequence or a flag is never
   * cut in half.
   */
  ellipsis?: string;
  /** Additional gap in pixels between glyphs (on top of the font's advance). */
  letterSpacing?: number;
  /**
   * Tab stop spacing, counted in space characters. Defaults to `8`, the CSS
   * `tab-size` initial value.
   *
   * A tab advances the pen to the next multiple of `tabSize` space widths from
   * the start of its line, so a run of tabs lines columns up instead of adding
   * a fixed gap each. Only reachable under `whiteSpace: 'pre'`; the collapsing
   * modes turn a tab into a single space before layout runs, as CSS does.
   *
   * Must be a positive finite number. Ignored for browser-shaped lines, which
   * the platform's text engine lays out whole.
   */
  tabSize?: number;
  /**
   * Base direction for text layout. Defaults to `'ltr'`.
   *
   * Direction-relative alignment is not derived from it - `align` stays
   * literal in both directions.
   */
  direction?: 'ltr' | 'rtl';
  /**
   * Language tag (`'en'`, `'ja'`, `'ar-EG'`) used for Unicode text
   * segmentation - which clusters count as one character, and where a line may
   * break. It selects no font and loads nothing; the platform default locale
   * applies when it is absent.
   */
  locale?: string;
  /**
   * How glyph appearance is resolved. Defaults to `'auto'`.
   *
   * - `'auto'` - use the shared-glyph fast path for content that is safe to
   *   render one cluster at a time, and hand anything else to the browser's
   *   text engine as a whole line. The classification is deliberately
   *   conservative and may admit more content to the fast path over time.
   * - `'simple'` - always use the shared glyph cache. The cheapest path and
   *   the right one for controlled content; a right-to-left line is reversed
   *   cluster by cluster rather than reordered, and contextual scripts render
   *   in their isolated forms.
   * - `'browser'` - always shape the whole line through the browser, which
   *   resolves bidi order and contextual forms. Each line becomes one
   *   node-owned raster instead of a run of shared glyphs, so a line whose
   *   text changes is rasterized again.
   *
   * A browser-shaped line is one glyph as far as the layout is concerned, so
   * `align: 'justify'` cannot stretch it and caret geometry resolves to line
   * granularity.
   */
  shaping?: 'auto' | 'simple' | 'browser';
  /**
   * Break individual words that are wider than `maxWidth` at grapheme-cluster
   * boundaries. Only applies when `maxWidth` is set. Defaults to `false`.
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
