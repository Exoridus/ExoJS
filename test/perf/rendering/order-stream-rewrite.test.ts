/**
 * What the draw-order stream costs on a re-selection, and what an incremental
 * one could save.
 *
 * The indexed tier keeps two things apart: the derived SLOT each visible item
 * owns, which survives a camera step, and the ORDER those slots are drawn in,
 * which is rewritten in full whenever membership is re-queried - four bytes per
 * visible item. `DerivedSelectionState` argues that rebuilding beats diffing,
 * because a diff has to answer where each survivor moved to; the retention
 * review kept the question open on the grounds that the rewrite is still
 * O(visible) while everything around it became O(delta).
 *
 * This decides it with counts rather than a clock. On a re-selection frame,
 * `orderEntries` is exactly what the full rewrite writes and `allocated +
 * released` is exactly what an incremental stream would still have to write, so
 * the difference is the upside of building one - measured, not argued.
 *
 * The camera is driven hard on purpose. At the archetype's own speed the frame
 * is answered from the cached order stream (`slotReplay`) and writes nothing at
 * all, which is the case the margin exists to produce and the case where the
 * question does not arise; only a frame that leaves the margin re-selects, and
 * those are the frames counted here.
 *
 * @internal Test/perf-only.
 */
import { describe, expect, test } from 'vitest';

import type { DerivedSlotStats } from '#rendering/plan/DerivedSelectionState';
import type { RetainedRootRepresentation } from '#rendering/plan/RetainedRootRepresentation';
import type { RenderNode } from '#rendering/RenderNode';

import { beginProbeFrame, buildScrollingWorld, endProbeFrame, installTierProbe, SCROLLING_WORLD, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './cullMarginProbe';
import { createWebGl2Harness } from './harness';

const LEAF_COUNT = 4000;
/** Fast enough that a frame leaves the last selection's margin and re-queries. */
const CAMERA_SPEED = 400;
const WARMUP_FRAMES = 12;
const MEASURED_FRAMES = 20;

const slotStatsOf = (root: RenderNode): DerivedSlotStats | null => {
  const representation = (root as unknown as { _retainedRootRepresentation(): RetainedRootRepresentation })._retainedRootRepresentation();

  return representation.derivedProduct?.slots.stats ?? null;
};

interface Totals {
  /** Order-stream entries written - the full-rewrite cost, four bytes each. */
  orderEntries: number;
  /** Items that became visible - entries an incremental stream would still write. */
  entered: number;
  /** Items that left the view - removals an incremental stream would still write. */
  left: number;
  /** Items that stayed visible and had their order entry rewritten anyway. */
  retained: number;
  /** Re-selection frames the numbers come from. */
  reselects: number;
}

describe('indexed tier — the draw-order stream on a re-selection', () => {
  test('a re-selection rewrites every visible entry, most of them unchanged', () => {
    installTierProbe();

    const harness = createWebGl2Harness({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT });
    const scene = buildScrollingWorld(harness, LEAF_COUNT, CAMERA_SPEED, SCROLLING_WORLD.worldSpan);
    const totals: Totals = { orderEntries: 0, entered: 0, left: 0, retained: 0, reselects: 0 };

    for (let frame = 0; frame < WARMUP_FRAMES + MEASURED_FRAMES; frame++) {
      harness.backend.resetStats();
      scene.step(frame);
      harness.backend.clear();
      beginProbeFrame();
      scene.root.render(harness.backend);
      harness.backend.flush();

      const servedBy = endProbeFrame(scene.root);
      const stats = slotStatsOf(scene.root);

      // Only a frame that actually re-queried membership wrote an order stream.
      // A replayed frame leaves the previous selection's counters standing, so
      // folding it in would count one selection once per frame it stayed valid
      // for - the exact mistake the margin work had to correct once already.
      if (frame < WARMUP_FRAMES || servedBy !== 'slotReselect' || stats === null) {
        continue;
      }

      totals.orderEntries += stats.orderEntries;
      totals.entered += stats.allocated;
      totals.left += stats.released;
      totals.retained += stats.retained;
      totals.reselects++;
    }

    scene.destroy();
    harness.destroy();

    // The tier under test has to be the one answering, or everything below
    // passes vacuously.
    expect(totals.reselects).toBeGreaterThan(0);

    // What the stream writes is exactly the visible set: the arrivals plus
    // everyone who was already there.
    expect(totals.orderEntries).toBe(totals.entered + totals.retained);

    // The finding, and the size of the prize. Measured on this scene at this
    // camera speed - 4000 leaves, ~1360 visible, a 400px step every frame -
    // 61% of the entries belong to items that neither entered nor left, so an
    // incremental stream would write ~540 entries where this writes ~1360.
    // That is ~3.3 KB of integer writes per re-selection frame, on the frames
    // that re-select at all (at the archetype's own speed, one in eight); the
    // rest replay the cached stream and write nothing. The ratio is a property
    // of step size against viewport, not of scene size, so the saving scales
    // with the visible count and only becomes interesting where that count is
    // in the hundreds of thousands.
    expect(totals.retained / totals.orderEntries).toBeGreaterThan(0.5);
    expect(totals.left).toBeGreaterThan(0);
  });
});
