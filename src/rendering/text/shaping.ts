import type { LayoutOptions } from './LayoutOptions';
import type { GlyphInfo, SolidTexel } from './types';

/**
 * How a laid-out line is turned into something placeable when the engine has
 * to hand the whole line to the browser's text engine as one shaping unit.
 *
 * Two implementations exist and the layout pass cannot tell them apart:
 * `ShapedTextMetrics` answers measurements only and allocates no GPU resource,
 * `ShapedTextSource` also rasterizes. That is what keeps `Text.measure()` free
 * of render allocations while giving it the same numbers the node will use.
 */
export interface LineShaper {
  /**
   * Logical advance width of `line` shaped as one contextual unit.
   *
   * Widths of parts do not add up for contextual text, so a wrap candidate has
   * to be measured whole rather than assembled from its words.
   */
  measureLine(line: string, fontSize: number): number;
  /**
   * The whole line as one placeable glyph.
   *
   * A measurement-only shaper answers with a real `advance` and no geometry,
   * exactly as a glyph-metrics provider does.
   */
  shapeLine(line: string, fontSize: number): GlyphInfo;
  /**
   * A solid texel on the pages this shaper rasterizes into, for decoration
   * quads. A measurement-only shaper owns no pages and omits it, which reads
   * as "no decorations", exactly as it does on a glyph provider.
   */
  getSolidTexel?(): SolidTexel | null;
}

/** The representation a text node uses for its glyph run. */
export type ShapingMode = 'simple' | 'browser';

/**
 * Scripts the shared-glyph path is proven safe for.
 *
 * Membership is an assertion that a cluster of this script renders the same
 * standing alone as it does surrounded by its neighbours - the whole premise
 * of a shared glyph cache. `Common` and `Inherited` cover digits, punctuation,
 * emoji, variation selectors and combining marks, all of which stay correct
 * because the simple path's unit is a grapheme cluster and rasterizes as one
 * string. Everything outside the list goes to the browser, which is the
 * conservative direction: a needless whole-line raster costs performance, a
 * missing one renders wrong text.
 */
const _simpleSafeScripts =
  /^[\p{Script=Common}\p{Script=Inherited}\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]*$/u;

/**
 * Whether `text` carries an explicit bidi control - a mark, an embedding, an
 * override or an isolate. They are `Common`, so the script test above lets
 * them through, and they exist precisely to reorder the text around them.
 */
const _hasBidiControl = (text: string): boolean => {
  for (let i = 0; i < text.length; i++) {
    const unit = text.charCodeAt(i);

    if (unit === 0x200e || unit === 0x200f || (unit >= 0x202a && unit <= 0x202e) || (unit >= 0x2066 && unit <= 0x2069)) return true;
  }

  return false;
};

/**
 * Which representation `text` needs under `layout`.
 *
 * `shaping: 'auto'` (the default) classifies the content: a right-to-left base
 * direction, an explicit bidi control, or any script outside the proven-safe
 * set selects browser shaping. The classifier is not a public contract and may
 * admit more content to the fast path as evidence accumulates.
 */
export const resolveShaping = (text: string, layout: LayoutOptions): ShapingMode => {
  const requested = layout.shaping ?? 'auto';

  if (requested !== 'auto') return requested;
  if (layout.direction === 'rtl') return 'browser';
  if (_hasBidiControl(text)) return 'browser';

  return _simpleSafeScripts.test(text) ? 'simple' : 'browser';
};
