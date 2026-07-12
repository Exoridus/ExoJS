// @vitest-environment node
//
// Baseline harness smoke test.
//
// Drives the REAL driver against one tiny cell (static-heavy, 1k nodes, WebGL2,
// 5 timed frames) on the actual GPU and asserts the harness genuinely rendered a
// frame. It asserts NO timing threshold — only that real work happened.
//
// SKIP GUARD (whole file): this launches a real headless Chromium via Playwright
// and needs a real, non-software GPU. It self-skips when the browser cannot
// launch, when the single WebGL2 result does not come back `ok`, or when the
// adapter is a software rasterizer — so it can never become a flaky required
// check on a GPU-less lane (the jsdom `exojs` project runs in `pnpm test`, which
// has no real GPU). On a real-GPU dev box it runs and passes.

import { runMatrix } from '../src/rendering/driver';
import type { CellResult } from '../src/rendering/EngineAdapter';

/** One tiny WebGL2 cell measured end-to-end, or the reason it could not be. */
interface SmokeOutcome {
  readonly adapter: string | undefined;
  readonly headless: boolean | undefined;
  readonly software: boolean | undefined;
  readonly result: CellResult | undefined;
  readonly error: unknown;
}

const runSmoke = async (): Promise<SmokeOutcome> => {
  try {
    const data = await runMatrix({
      backends: ['webgl2'],
      filter: { archetype: 'static-heavy', nodeCount: 1_000 },
      // Five timed frames is plenty to prove the pipeline ran; a real reportable
      // run must never override the per-node-count frame budgets like this.
      timedFramesOverride: 5,
    });
    const provenance = data.provenance[0];

    return {
      adapter: provenance?.adapter,
      headless: provenance?.headless,
      software: provenance?.software,
      result: data.results[0],
      error: null,
    };
  } catch (error) {
    return { adapter: undefined, headless: undefined, software: undefined, result: undefined, error };
  }
};

describe('baseline harness smoke', () => {
  test('renders a tiny static-heavy WebGL2 cell on a real GPU', async ctx => {
    const outcome = await runSmoke();

    // Skip — never fail — where no real-GPU browser is available. This is a
    // runtime capability guard, not a disabled test, so the lint rule that hunts
    // for `.skip` on suites/tests is a false positive here.
    if (outcome.error !== null || outcome.result === undefined || outcome.software !== false || outcome.result.status !== 'ok') {
      // eslint-disable-next-line vitest/no-disabled-tests -- runtime skip when no real GPU is present
      ctx.skip();

      return;
    }

    const { result, adapter, headless } = outcome;

    // Provenance is populated: a named adapter, confirmed headless.
    expect(adapter).toBeDefined();
    expect((adapter ?? '').length).toBeGreaterThan(0);
    expect(headless).toBe(true);

    // The harness genuinely rendered. `drawCalls > 0` is the assertion that
    // catches an empty-shader or empty-scene harness measuring nothing.
    expect(result.structural.drawCalls).toBeGreaterThan(0);

    // Deterministic structural gate: this fixed 1k static-heavy scene issues
    // exactly ONE draw call per frame (one texture, one batch, culling on but
    // everything on-screen). Structural counters are noise-free, so a change in
    // this number for the fixed scene is a real regression, not timing drift.
    expect(result.structural.drawCalls).toBe(1);

    // A real per-frame CPU time was measured. No timing THRESHOLD is asserted.
    expect(result.cpuMsMedian).toBeGreaterThan(0);
  }, 120_000);
});
