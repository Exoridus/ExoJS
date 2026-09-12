import type { ArchetypeSpec } from './EngineAdapter';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './world';

/**
 * The UI-layout scene's shared definition: the widget tree every arm builds,
 * the widths each pass changes, and the two viewports it alternates between.
 *
 * This archetype is the only one whose frame does no drawing work worth
 * measuring. What it measures is a layout engine resolving a box tree, so the
 * tree, the mutation and the viewport sequence have to be identical across arms
 * or the two engines are answering different questions. Only the shared scope is
 * fixed here - nested horizontal and vertical boxes, fixed leaf sizes, padding
 * and gap. No text shaping, no grid, no wrapping and no differing flex
 * distribution: those are where the arms' public layout algorithms legitimately
 * diverge, and a comparison may not depend on them.
 */

/** Leaf widget height in logical pixels. Fixed, so only widths drive a reflow. */
export const WIDGET_HEIGHT = 24;

/** Base leaf widget width, before a pass swaps it for {@link WIDGET_WIDE}. */
export const WIDGET_WIDTH = 96;

/** The alternate width a mutated leaf takes. Different enough that the box above it has to re-resolve. */
export const WIDGET_WIDE = 144;

/** Padding inside every box, in logical pixels. */
export const BOX_PADDING = 8;

/** Gap between siblings inside a box, in logical pixels. */
export const BOX_GAP = 4;

/** Leaf widgets per innermost row. The tree grows in rows, so this fixes the tree's shape as the count scales. */
export const WIDGETS_PER_ROW = 8;

/** Innermost rows per column box, one nesting level up. */
export const ROWS_PER_COLUMN = 8;

/**
 * Layout passes per frame.
 *
 * The published unit is CPU-ms per block of this many passes rather than per
 * pass: a single box-tree resolve lands under the clock's resolution on both
 * arms, and a sub-microsecond figure derived by dividing one through would read
 * as a measurement rather than as arithmetic. Twenty already clears the coarsest
 * clock the harness reports by more than two orders of magnitude, which is the
 * only thing the block exists for.
 *
 * Not larger, because the block is a frame and the harness abandons a cell whose
 * trailing frames pass its 200ms budget. At the reference rung the slower arm
 * costs roughly 5ms per pass, so a block of a hundred would abort it after three
 * frames - and the row would then compare a three-sample number against a
 * full-length one, which is a worse answer than a shorter block.
 */
export const LAYOUT_PASSES_PER_FRAME = 20;

/** Share of leaf widths a pass changes. The rest keep theirs, so a pass is a reflow rather than a rebuild. */
export const LAYOUT_MUTATION_FRACTION = 0.1;

/** The two viewports a run alternates between, so the root box is re-solved against a changing constraint. */
export const LAYOUT_VIEWPORTS = [
  { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
  { width: Math.round(VIEWPORT_WIDTH * 0.75), height: VIEWPORT_HEIGHT },
] as const;

/** A resolved rectangle, in the root box's coordinates. */
export interface LayoutRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Shape of the widget tree for a given leaf count: how many rows, and how many columns hold them. */
export interface LayoutTreeShape {
  /** Leaf widgets in total. Equal to the requested count; the last row is short when it does not divide evenly. */
  readonly widgets: number;
  /** Innermost horizontal boxes. */
  readonly rows: number;
  /** Vertical boxes holding the rows. */
  readonly columns: number;
}

/**
 * Tree shape for a leaf count.
 *
 * Depth is fixed at three boxes - root column, column boxes, rows - and width
 * grows instead, because a tree that deepened with the count would turn the
 * ladder into a depth study rather than a width one. Every arm therefore
 * resolves the same number of levels at 100 widgets and at 5000.
 */
export const layoutTreeShape = (widgets: number): LayoutTreeShape => {
  const total = Math.max(1, Math.trunc(widgets));
  const rows = Math.ceil(total / WIDGETS_PER_ROW);

  return { widgets: total, rows, columns: Math.ceil(rows / ROWS_PER_COLUMN) };
};

/** Leaf widgets in row `row` of a tree of `shape`; the last row is short when the count does not divide evenly. */
export const widgetsInRow = (shape: LayoutTreeShape, row: number): number => Math.max(0, Math.min(WIDGETS_PER_ROW, shape.widgets - row * WIDGETS_PER_ROW));

/**
 * Distance between two changed leaves.
 *
 * A stride walk rather than a random draw or a contiguous block: a block would
 * leave whole rows untouched, and an arm that caches a clean subtree would then
 * be measured on a scene its cache happens to fit. Walking by a stride spreads
 * the changed leaves across every row, and offsetting the walk by the pass index
 * moves them from pass to pass, so no row is ever clean twice in a row.
 */
export const widgetMutationStride = (widgets: number): number => {
  const total = Math.max(1, Math.trunc(widgets));
  const mutated = Math.max(1, Math.round(total * LAYOUT_MUTATION_FRACTION));

  return Math.max(1, Math.floor(total / mutated));
};

/** Whether leaf `index` has its width changed on pass `pass`. */
export const isWidgetMutated = (index: number, pass: number, widgets: number): boolean => (index + pass) % widgetMutationStride(widgets) === 0;

/**
 * Visit the leaves pass `pass` changes, in ascending index order.
 *
 * The arms walk the changed set directly rather than testing every leaf: the
 * arithmetic that decides WHICH leaves change is harness work, and running it
 * over the whole tree each pass would put a per-leaf modulo into a measurement
 * of a per-changed-leaf reflow, growing with the rung it is supposed to be
 * independent of.
 *
 * A pass changes the leaves this yields to {@link WIDGET_WIDE} and puts pass
 * `pass - 1`'s leaves back to {@link WIDGET_WIDTH}. The two sets are disjoint
 * for every tree the ladder holds, so the resulting widths are exactly what
 * {@link widgetWidthAt} reports - which is what lets the geometry check compare
 * a digest against the shared definition rather than against an arm.
 */
export const forEachMutatedWidget = (pass: number, widgets: number, visit: (index: number) => void): void => {
  const total = Math.max(1, Math.trunc(widgets));
  const stride = widgetMutationStride(total);

  for (let index = (stride - (((pass % stride) + stride) % stride)) % stride; index < total; index += stride) {
    visit(index);
  }
};

/** Width leaf `index` carries on pass `pass`. */
export const widgetWidthAt = (index: number, pass: number, widgets: number): number => (isWidgetMutated(index, pass, widgets) ? WIDGET_WIDE : WIDGET_WIDTH);

/** Viewport pass `pass` resolves against. */
export const layoutViewportAt = (pass: number): (typeof LAYOUT_VIEWPORTS)[number] => LAYOUT_VIEWPORTS[pass % LAYOUT_VIEWPORTS.length]!;

/**
 * The rectangles a correctly resolved pass produces, in leaf-index order and in
 * the root box's coordinates.
 *
 * Derived from the shared definition rather than from either arm, which is what
 * makes the geometry check an assertion instead of a cross-arm agreement: two
 * arms that both got the tree wrong the same way would still agree. The
 * arithmetic is closed-form because the shared scope has no case that needs a
 * solver - fixed leaf sizes, start alignment on both axes, no grow and no wrap,
 * so a box is its content plus its padding and a child sits at the running
 * offset. An arm whose public layout algorithm produces anything else has laid
 * out a different scene.
 */
export const expectedLayoutRects = (widgets: number, pass: number): readonly LayoutRect[] => {
  const shape = layoutTreeShape(widgets);
  const rowHeight = WIDGET_HEIGHT + BOX_PADDING * 2;
  const rowWidths: number[] = [];

  for (let row = 0; row < shape.rows; row += 1) {
    const count = widgetsInRow(shape, row);
    let width = BOX_PADDING * 2 + Math.max(0, count - 1) * BOX_GAP;

    for (let slot = 0; slot < count; slot += 1) {
      width += widgetWidthAt(row * WIDGETS_PER_ROW + slot, pass, widgets);
    }

    rowWidths.push(width);
  }

  const rects: LayoutRect[] = [];
  let columnX = BOX_PADDING;

  for (let column = 0; column < shape.columns; column += 1) {
    const first = column * ROWS_PER_COLUMN;
    const last = Math.min(shape.rows, first + ROWS_PER_COLUMN);
    let columnWidth = 0;

    for (let row = first; row < last; row += 1) {
      columnWidth = Math.max(columnWidth, rowWidths[row]!);
    }

    columnWidth += BOX_PADDING * 2;

    for (let row = first; row < last; row += 1) {
      const rowX = columnX + BOX_PADDING;
      const rowY = BOX_PADDING + BOX_PADDING + (row - first) * (rowHeight + BOX_GAP);
      const count = widgetsInRow(shape, row);
      let slotX = rowX + BOX_PADDING;

      for (let slot = 0; slot < count; slot += 1) {
        const width = widgetWidthAt(row * WIDGETS_PER_ROW + slot, pass, widgets);

        rects.push({ x: slotX, y: rowY + BOX_PADDING, width, height: WIDGET_HEIGHT });
        slotX += width + BOX_GAP;
      }
    }

    columnX += columnWidth + BOX_GAP;
  }

  return rects;
};

/**
 * Digest of a pass's resolved geometry, compared between arms OUTSIDE the timed
 * bracket.
 *
 * Rounded to whole pixels before hashing: the arms reach the same boxes through
 * different arithmetic - one accumulates in JavaScript, the other in Yoga's
 * WASM heap - and a sub-pixel difference in the last place is not a difference
 * in what was laid out. A digest rather than a full rect list because the check
 * only has to answer whether both arms resolved the same scene; where they did
 * not, the scene is rebuilt outside the harness and diffed rect by rect.
 */
export const layoutDigest = (rects: readonly LayoutRect[]): number => {
  let digest = 0;

  for (const rect of rects) {
    for (const value of [rect.x, rect.y, rect.width, rect.height]) {
      // FNV-1a over the rounded coordinate, kept in 32 bits by the shift-add
      // chain so the digest is stable across engines rather than drifting into
      // double precision at large trees.
      digest = Math.imul(digest ^ Math.round(value), 0x01000193) >>> 0;
    }
  }

  return digest;
};

/** Layout passes the archetype resolves per frame; `0` when it resolves none. */
export const layoutPassesPerFrame = (spec: ArchetypeSpec): number => Math.max(0, Math.trunc(spec.layoutPassesPerFrame ?? 0));

/** Whether the archetype measures box-tree layout rather than drawing. */
export const isUiLayoutScene = (spec: ArchetypeSpec): boolean => layoutPassesPerFrame(spec) > 0;
