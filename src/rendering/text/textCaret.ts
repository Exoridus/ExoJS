import { Rectangle } from '#math/Rectangle';

import type { TextLayoutResult } from './types';

/**
 * Caret geometry over an already-settled text layout. Both helpers read
 * `TextLayoutResult.placements` and nothing else - no glyph provider, no
 * re-measure. The layout comes from the text node's own pass
 * (`AbstractText.currentLayout`), so a caret never duplicates the one
 * measurement the on-demand layout protocol exists to avoid.
 *
 * Indexes are per glyph - one placement each. This is the layout's own
 * index space; a caller holding UTF-16 offsets (a selection in a text
 * model) maps them to glyph indexes against the string it laid out. When a
 * field is masked, the layout runs over the masked text, where one mask
 * character replaces one grapheme and the mapping stays one glyph per
 * grapheme.
 *
 * Single-line only: every placement is treated as sitting on one line box
 * of `lineHeight`, starting at y = 0. Multi-line caret geometry is its own
 * layer on top of this.
 */

/**
 * The caret boundary at glyph `index`: a zero-width vertical line at the
 * glyph's pen origin, spanning one line box. An index past the end sits at
 * the line's trailing advance edge - where the next glyph would start.
 *
 * The boundary follows `penX`, not the quad's `x`: the quad carries the
 * glyph's bearing, which in SDF mode is negative and would pull the caret
 * left of the character by the atlas padding.
 */
export const caretRectAt = (layout: TextLayoutResult, index: number, lineHeight: number): Rectangle => {
  const placements = layout.placements;

  if (placements.length === 0) {
    return new Rectangle(0, 0, 0, lineHeight);
  }

  const clamped = Math.max(0, Math.min(index, placements.length));

  if (clamped === placements.length) {
    return new Rectangle(layout.advance.width, 0, 0, lineHeight);
  }

  const placement = placements[clamped];

  if (placement === undefined) {
    return new Rectangle(layout.advance.width, 0, 0, lineHeight);
  }

  return new Rectangle(placement.penX, 0, 0, lineHeight);
};

/**
 * The glyph index a point selects: the glyph whose advance box contains `x`,
 * snapped to its nearer edge, so a click on a character's right half places
 * the caret after it. `x` and `y` are in the layout's own space; `y` is
 * accepted for signature symmetry with future multi-line geometry and does
 * not affect the answer today.
 *
 * Hit testing runs over the advance boxes rather than the ink quads, so the
 * boundaries it reports are the ones {@link caretRectAt} paints.
 */
export const indexAtPoint = (layout: TextLayoutResult, x: number, y: number): number => {
  void y;

  const placements = layout.placements;

  if (placements.length === 0) {
    return 0;
  }

  if (x <= (placements[0]?.penX ?? 0)) {
    return 0;
  }

  for (let i = 0; i < placements.length; i++) {
    const placement = placements[i];

    if (placement === undefined) {
      continue;
    }

    const right = placement.penX + placement.penAdvance;

    if (x <= right) {
      return x < (placement.penX + right) / 2 ? i : i + 1;
    }
  }

  return placements.length;
};
