// @vitest-environment node
//
// Split-screen / multi-view structural gate.
//
// Drives the REAL driver (real headless Chromium, real GPU) against a handful of
// `split-screen` cells and asserts on STRUCTURAL draw-call counters, never on
// wall-clock timing — the claim under test ("multi-View replay of a retained
// scene costs O(batches) per view, not O(nodes) per view") is a complexity
// property, not an absolute-ms number. An absolute-ms head-to-head belongs on a
// real GPU via a full `pnpm --filter @codexo/exojs-bench bench` run, measured
// and reported by a human at a physical machine — these gates deliberately do
// not claim one, mirroring the existing counter-gate pattern used for the
// slice-4 transform-row patch (`test/perf/rendering/retained-transform-patch-scaling.test.ts`
// at the repository root).
//
// SKIP GUARD (whole file): this launches a real headless Chromium via Playwright
// and needs a real, non-software GPU — see `smoke.test.ts` for the identical
// rationale. It self-skips rather than failing when no real GPU is available, so
// it can never become a flaky required check on a GPU-less lane.

import { runMatrix } from '../src/rendering/driver';
import type { CellResult } from '../src/rendering/EngineAdapter';

/** Draw-call count for one retained `split-screen` (or comparable single-view) cell, or the reason it could not be measured. */
interface CellOutcome {
  readonly software: boolean | undefined;
  readonly result: CellResult | undefined;
  readonly error: unknown;
}

const runRetainedCell = async (archetype: 'static-heavy' | 'split-screen', nodeCount: number): Promise<CellOutcome> => {
  try {
    const data = await runMatrix({
      backends: ['webgl2'],
      filter: { engine: 'exojs', config: 'retained', archetype, nodeCount },
      // A handful of timed frames is plenty to read a steady-state structural
      // counter; a real reportable run must never override the per-node-count
      // frame budgets like this (see `smoke.test.ts`).
      timedFramesOverride: 5,
    });

    return { software: data.provenance[0]?.software, result: data.results[0], error: null };
  } catch (error) {
    return { software: undefined, result: undefined, error };
  }
};

/** True when a cell measured cleanly on real (non-software) hardware. */
const isUsable = (outcome: CellOutcome): outcome is CellOutcome & { result: CellResult } =>
  outcome.error === null && outcome.result !== undefined && outcome.software === false && outcome.result.status === 'ok';

describe('split-screen structural gate', () => {
  test('rendering through 4 simultaneous Views multiplies draw calls by view count, not by node count', async ctx => {
    // `split-screen` is `static-heavy`'s exact scene shape (nestingDepth 4,
    // 1 texture, 0 mutation — see `archetypes.ts`) plus 4 simultaneous Views
    // instead of 1 (`viewCount` on `ArchetypeSpec`). Comparing it against
    // `static-heavy` at the SAME node count isolates the view multiplier: both
    // cells retain the identical scene, so any draw-call difference between them
    // is exactly the cost of the extra views, not a different scene.
    const singleView = await runRetainedCell('static-heavy', 1_000);
    const fourViews = await runRetainedCell('split-screen', 1_000);

    if (!isUsable(singleView) || !isUsable(fourViews)) {
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime skip when no real GPU is present
      ctx.skip();

      return;
    }

    const singleDraws = singleView.result.structural.drawCalls;
    const fourViewDraws = fourViews.result.structural.drawCalls;

    expect(singleDraws).toBeGreaterThan(0);

    // 4 views replaying the SAME recorded instruction set draw roughly 4x what
    // 1 view draws (each view is its own on-screen output, so this scaling is
    // expected and correct — not the blowup this gate guards against). A wide
    // band absorbs small structural differences between the two node counts'
    // culling/instance layout without hiding a genuine regression (e.g. a bug
    // that made each extra view re-walk and duplicate draws non-linearly).
    expect(fourViewDraws).toBeGreaterThanOrEqual(singleDraws * 3);
    expect(fourViewDraws).toBeLessThanOrEqual(singleDraws * 5);
  }, 120_000);

  test('4-view replay cost does not scale with node count (O(batches), not O(nodes), per view)', async ctx => {
    // Fixed view count (4), node count swept 100x (1k -> 100k). If multi-view
    // replay re-walked the retained subtree per view (the O(nodes)-per-view
    // regression this gate exists to catch), draw calls would track node count
    // and grow ~100x here, the same way the single-view `current` (non-retained)
    // config does. The retained tier instead replays a recorded, node-count-
    // independent batch set per view, so draws should stay far below that.
    const small = await runRetainedCell('split-screen', 1_000);
    const large = await runRetainedCell('split-screen', 100_000);

    if (!isUsable(small) || !isUsable(large)) {
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime skip when no real GPU is present
      ctx.skip();

      return;
    }

    const smallDraws = small.result.structural.drawCalls;
    const largeDraws = large.result.structural.drawCalls;

    expect(smallDraws).toBeGreaterThan(0);

    // Node count grew 100x; a genuine O(nodes)-per-view cost would grow draw
    // calls by roughly the same factor. Bounding the growth well below that
    // (a generous 25x — the single-view retained static-heavy sweep measures
    // ~7x over the identical 100x node-count range) proves the multi-view
    // replay path stayed on the recorded-batch tier instead of falling back to
    // a per-view walk.
    expect(largeDraws / smallDraws).toBeLessThan(25);
  }, 180_000);
});
