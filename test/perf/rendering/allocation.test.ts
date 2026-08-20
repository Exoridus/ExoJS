import { describe, expect, it } from 'vitest';

import { RenderPlanPlayer } from '#rendering/plan/RenderPlanPlayer';

import { measureFrameAllocation } from './allocation';
import type { AllocationArchetype } from './allocationScenes';
import { ALLOCATION_ARCHETYPES } from './allocationScenes';
import { buildSpriteScene, makeTextures } from './fixtures';
import { createWebGl2Harness } from './harness';

/**
 * Render-plan allocation gate.
 * Samples the per-frame allocation RATE (throwaway garbage, not retained heap)
 * on the archetype catalog in `allocationScenes.ts` via the V8 allocation
 * sampling profiler (see `allocation.ts`).
 *
 * Lives in its own `rendering-alloc` vitest project and runs via
 * `pnpm test:alloc` - NOT in `test:coverage`. See {@link INSTRUMENTED}.
 *
 * ── Methodology ─────────────────────────────────────────────────
 * The sampler is a STATISTICAL profiler (Poisson, one sample per 512 B), so a
 * single run scatters ±few-percent frame-to-frame. The gate therefore takes the
 * MEDIAN of {@link WINDOWS} independent sampling windows (each its own fresh
 * harness + profiler session) and asserts the median against the budget
 * {@link budgetBytesFor} derives from the documented baseline. The median is
 * immune to the occasional high outlier - see the `windows=[...]` log line, where
 * one window routinely lands several percent high while the median sits within
 * ~1% run to run.
 *
 * All {@link WINDOWS} windows share ONE process, and that is a deliberate
 * limit, not an oversight. It keeps the whole gate at a few seconds, and for
 * every archetype in the catalog the pass-to-pass median is stable (≤0.21 KB)
 * and never exceeds the same scene's fresh-process reading, so the pass/fail
 * decision is sound. What a shared process CANNOT do is attribute bytes to a
 * callsite, or measure a scene whose rate depends on which optimisation state
 * V8 settled into - both need one scene per process. That is
 * `run-allocation-cell.ts`:
 *
 *   node --conditions=@codexo/exojs-source --import ./scripts/glsl-register.mjs --import tsx/esm \
 *     test/perf/rendering/run-allocation-cell.ts --id "mesh/1000" --profile
 *
 * Never mix its numbers with this gate's inside one table; {@link BASELINE_KB}
 * carries both columns separately for exactly that reason.
 *
 * ── Reading the numbers ──────────────────────────────────────────
 * Every gate logs a `[alloc]` line with the live median, the budget, the
 * environment, and the raw per-window samples. To re-measure, run
 *
 *   pnpm test:alloc --disableConsoleIntercept
 *
 * and read the medians off those lines. Update {@link BASELINE_KB} only when a
 * slice DELIBERATELY changes allocation, and record the reason next to the
 * number the way the entries below do.
 *
 * The standalone `pnpm perf:renderers:alloc` launcher measures the same scenes
 * the same way and is source-accurate too (it passes `--conditions=@codexo/exojs-source`,
 * so `#*` resolves to `src`, not a `dist` build). It reports ONE window per
 * scene rather than a median, and it additionally covers the nine-slice /
 * repeating / tilemap families and the 1M reference stage - use it for a broad
 * look, and this gate for the budgeted, reproducible numbers.
 */

/** Independent sampling windows the median is taken over (≥5). */
const WINDOWS = 5;

/**
 * Below this per-frame rate a percentage band is the wrong instrument. These
 * scenes now sit AT the harness's own floor - every one of them is within
 * ~1.6 KB/frame of the `empty` scene, so a 15% band would be ±0.2 KB, i.e.
 * pure Poisson jitter, while a genuine regression in a fully-retained frame is
 * never a few percent (see {@link FIXED_HEADROOM_KB}). They get a fixed
 * absolute headroom instead.
 */
const NOISE_FLOOR_KB = 50;

/**
 * Budget band for scenes above {@link NOISE_FLOOR_KB}. Measured pass-to-pass
 * median spread on those scenes is ≤0.4% (see the table on {@link BASELINE_KB}),
 * so nearly the whole 15% is headroom for cross-machine drift. `filtered/100` is
 * the only scene left above the floor, and the CI runner (Node v24.19.0
 * linux/x64) reads it about 7.6% above this dev box - measured as 329.89 against
 * 306.55 before the effect path stopped nesting a plan per pass. The band is
 * stated as a RATIO for that reason: the absolute pair moves with every ratchet,
 * the cross-machine factor does not, and half the band is still free at it while
 * a real ≥15% allocation regression fails.
 */
const TOLERANCE_LARGE = 1.15;

/**
 * Absolute headroom, in KB/frame, for every scene below {@link NOISE_FLOOR_KB}.
 *
 * Sized from what these gates have to catch, what they have to tolerate, and
 * the rule that a ratchet never runs backwards.
 * TOLERATE: the widest fresh-process spread measured over five processes is
 * 0.13 KB/frame (`deep-hierarchy`), and the widest in-suite pass-to-pass median
 * spread is 0.21 KB - an order of magnitude below this, which is the margin the
 * platform floor itself needs. Measured across the two platforms that run this
 * gate, the floor moves together: the CI runner (Node v24.19.0 linux/x64) reads
 * `empty` 0.96 / `static` 1.03 / `nested` 0.59 against 0.99 / 1.07 / 0.65 here,
 * every scene inside the headroom. What does NOT move together is
 * instrumentation - see {@link INSTRUMENTED}, and do not mistake one for the
 * other.
 * CATCH: a regression in a retained frame arrives per node, per batch or per
 * scope, so it lands as a multiple of these baselines, not a percentage - one
 * 32-byte object per sprite is +32 KB/frame in `sprite/1000 static` against a
 * 1.2 KB baseline, and the tightest case in the catalog (one object per MOVED
 * node in `sprite/10000 transform-only 1%`, k=100) is still +3.2 KB against a
 * 3.9 KB budget. Both fail the gate; neither needs a tighter band.
 * NEVER LOOSEN: 1.25 is also the largest round value at which no budget in the
 * table comes out above the one it replaces. At 2 KB, `nested/1000 d4` would
 * have gone from 2.57 to 3.20 KB - a scene whose measured rate FELL would have
 * been handed a wider budget, which is the one thing a ratchet must not do.
 */
const FIXED_HEADROOM_KB = 1.25;

/**
 * Documented baseline MEDIANS in KB/frame, measured against `src` on Node
 * v24.14.1 (win32/x64) on 2026-08-16.
 *
 * Each entry is the HIGHER of two independently measured medians, because the
 * two disagree in both directions and the budget must survive either:
 *
 *   FRESH-PROCESS - one archetype per node process, five processes, median.
 *     This is the source-of-truth number and the only one whose CALLSITE
 *     attribution is trustworthy: V8's optimisation state carries across scenes
 *     inside a process, so a scene measured after nine others is measured in a
 *     state no real frame is in (`run-allocation-cell.ts` exists for this).
 *   IN-SUITE - what this gate itself produces, five windows in one process, in
 *     THIS archetype order. Lower than fresh for every retained scene (the JIT
 *     arrives warm) and higher for `filtered/100`.
 *
 * The in-suite column is the highest median seen across six passes.
 *
 *   archetype                        fresh    in-suite   baseline
 *   empty                             0.99      0.99       0.99
 *   sprite/1000 static                1.21      1.07       1.21
 *   sprite/1000 moving                1.37      1.26       1.37
 *   sprite/10000 transform-only 1%    2.61      2.34       2.61
 *   nested/1000 d4                    1.20      0.65       1.20
 *   deep-hierarchy/1000 d16 1%        1.01      0.50       1.01
 *   mesh/1000                         0.68      0.37       0.68
 *   filtered/100                    101.95    102.98     102.98
 *   blend/1000 plateau64              0.93      0.57       0.93
 *   blend/1000 alternating            1.19      0.47       1.19
 *
 * Spread, i.e. what the budget has to absorb: ≤0.13 KB across the five fresh
 * processes and ≤0.21 KB across six in-suite passes on every scene but
 * `filtered/100`, which holds 0.9% (101.9-102.1 fresh, 102.1-103.0 across four
 * in-suite passes).
 *
 * `scrolling-world/10000` is measured the same way but stays out of the gate:
 * fresh it is the steadiest scene here (1.65 KB/frame, 4.5%), in-suite it is
 * bimodal at 14.6 vs 19.8 KB/frame between passes. See `ALLOCATION_REPORT_ONLY`.
 *
 * ── Ratchet history ─────────────────────────────────────────────
 * 2026-08-16c: `filtered/100` ONLY, 229.59 → 102.98, after the effect path's
 * control plane stopped being rebuilt per frame - the redirect pass and its
 * descriptor, the clip/mask continuation closures, the barrier scope and its
 * effect descriptor, and the scissor stack's per-push rectangle and vectors.
 * Same rule as the entry below it: one row, no global re-baseline.
 *
 * 2026-08-16b: `filtered/100` ONLY, 306.55 → 229.59, after the effect path
 * stopped building a whole render plan per filter pass and per composite. No
 * other row is touched and no global re-baseline: the change reaches nothing
 * outside the barrier path, every other scene re-measured identical, and a
 * ratchet that moves rows a slice did not affect is how a table drifts away
 * from what it is supposed to prove. The filter work continues, so this row is
 * expected to ratchet again - each landed slice protects its own gain rather
 * than leaving the next one to collect them all.
 *
 * 2026-08-16: whole table re-measured after the steady-state allocation track
 * closed, and every budget moved down again - by two to three ORDERS of
 * magnitude on the scenes the track actually hit (`mesh/1000` 574.69 → 0.68,
 * `blend/1000 alternating` 235.70 → 1.19, `sprite/1000 moving` 211.21 → 1.37,
 * `sprite/10000 transform-only 1%` 24.35 → 2.61). Nine of the ten gated scenes now
 * sit within 1.6 KB/frame of `empty`, which is why the small-scene band changed
 * from a percentage to {@link FIXED_HEADROOM_KB}. `filtered/100` 793.42 → 306.55 is
 * partly the same track and partly the harness: `fakeWebGl2`'s two texture-
 * upload entry points took a rest parameter, so every upload call allocated an
 * argument array that the profiler then attributed to the ENGINE function that
 * called into the fake - ~76 KB/frame of the old number was the measurement.
 *
 * 2026-08-15: previous whole-table re-measure (from baselines that predated the
 * retained render path and carried up to 205x headroom), and the pass that
 * added transform-only, deep-hierarchy and the two blend variants.
 */
const BASELINE_KB: Readonly<Record<string, number>> = {
  empty: 0.99,
  'sprite/1000 static': 1.21,
  'sprite/1000 moving': 1.37,
  'sprite/10000 transform-only 1%': 2.61,
  'nested/1000 d4': 1.2,
  'deep-hierarchy/1000 d16 1%': 1.01,
  'mesh/1000': 0.68,
  'filtered/100': 102.98,
  'blend/1000 plateau64': 0.93,
  'blend/1000 alternating': 1.19,
};

const ENV = `Node ${process.version} ${process.platform}/${process.arch}`;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * Re-baselining mode: measure and log every archetype but assert nothing, so a
 * fresh table can be read off one run instead of bisecting failures. Opt-in via
 * `EXOJS_ALLOC_MEASURE=1` only - never set in CI, and every run says loudly
 * that it gated nothing.
 */
const MEASURE_ONLY = process.env['EXOJS_ALLOC_MEASURE'] === '1';

/**
 * Whether the engine source this suite measures has been rewritten by Istanbul.
 *
 * Read off a `src` function's own text rather than a global, because that is the
 * thing that actually matters: coverage instrumentation only distorts the
 * numbers for the files it rewrote, and `src/**` is what the include list
 * covers. A counter probe per statement is not the problem - losing V8's escape
 * analysis is. Instrumented, the plan walk stops scalar-replacing what it
 * otherwise would and `mesh/1000` reads 71 KB/frame against 0.65 plain, on one
 * machine with one Node build. Every baseline in {@link BASELINE_KB} is a plain
 * number, so an instrumented run compares two different programs.
 *
 * This is why the gate lives in its own `rendering-alloc` vitest project and
 * runs via `pnpm test:alloc`, outside `test:coverage`.
 */
const INSTRUMENTED = /\bcov_[0-9a-z]+\b/u.test(String(RenderPlanPlayer.play));

/**
 * Budget in bytes/frame for an archetype: a relative band above the noise
 * floor, a fixed absolute headroom below it. `empty` is no longer special -
 * with every retained scene sitting at the harness floor, the floor sanity and
 * the ratcheted budgets are the same rule.
 */
const budgetBytesFor = (id: string): number => {
  const baselineKb = BASELINE_KB[id];

  if (baselineKb === undefined || baselineKb <= 0) {
    throw new Error(`no allocation baseline recorded for archetype '${id}' — re-measure with EXOJS_ALLOC_MEASURE=1 and add it to BASELINE_KB`);
  }

  return (baselineKb < NOISE_FLOOR_KB ? baselineKb + FIXED_HEADROOM_KB : baselineKb * TOLERANCE_LARGE) * 1024;
};

/** Median bytes/frame over {@link WINDOWS} fresh-harness sampling windows, plus the per-window KB samples. */
const measureMedianAllocation = async (archetype: AllocationArchetype): Promise<{ medianBytes: number; samplesKb: number[] }> => {
  const samples: number[] = [];

  for (let i = 0; i < WINDOWS; i++) {
    const harness = createWebGl2Harness();
    const scene = archetype.build(harness);

    const alloc = await measureFrameAllocation(harness, scene.root, { beforeFrame: scene.beforeFrame, warmup: archetype.warmup });

    samples.push(alloc.bytesPerFrame);
    scene.teardown?.();
    harness.destroy();
  }

  return { medianBytes: median(samples), samplesKb: samples.map(b => b / 1024) };
};

describe('render-plan allocation gate', () => {
  // Fails rather than skips: a silent skip is how this gate would come back
  // green-but-blind if the suite were ever folded back into `test:coverage`.
  it('measures uninstrumented engine source (guards the coverage split)', () => {
    if (INSTRUMENTED) {
      console.error(
        '[alloc] INSTRUMENTED SOURCE — this suite was run under coverage instrumentation, which invalidates every ' +
          'baseline in BASELINE_KB. Run it via `pnpm test:alloc` (project `rendering-alloc`), not `pnpm test:coverage`.',
      );
    }

    expect(INSTRUMENTED).toBe(false);
  });

  it('sampler counts dead garbage (guards the GC-inclusion flags)', async () => {
    const harness = createWebGl2Harness();
    const { root } = buildSpriteScene({ count: 0, textures: makeTextures(1) });

    // JSON.parse is opaque to V8's optimizer - it cannot scalar-replace or
    // dead-code the resulting 1000-object array, so the allocation is real and
    // immediately dead (the sink is overwritten each frame).
    const junkJson = `[${'{"a":1,"b":2},'.repeat(999)}{"a":1,"b":2}]`;
    let sink: unknown = null;

    const base = await measureFrameAllocation(harness, root);
    const withJunk = await measureFrameAllocation(harness, root, {
      beforeFrame: (): void => {
        sink = JSON.parse(junkJson) as unknown;
      },
    });

    void sink;
    root.destroy();
    harness.destroy();

    // 1000 small objects ≈ 32-56 B each. If the sampler discarded GC'd garbage
    // this delta would collapse toward 0 (measured ~0.1 B/obj without the flags).
    const bytesPerObject = (withJunk.bytesPerFrame - base.bytesPerFrame) / 1000;
    expect(bytesPerObject).toBeGreaterThan(20);
  });

  // Sequential on purpose: the baselines are the medians this ORDER produces.
  for (const archetype of ALLOCATION_ARCHETYPES) {
    it(`${archetype.id} stays within its allocation budget`, async () => {
      const budget = MEASURE_ONLY ? Number.POSITIVE_INFINITY : budgetBytesFor(archetype.id);
      const started = performance.now();
      const { medianBytes, samplesKb } = await measureMedianAllocation(archetype);
      const elapsed = performance.now() - started;
      const medianKb = medianBytes / 1024;
      const budgetKb = budget / 1024;

      console.log(
        `[alloc] ${archetype.id.padEnd(32)} median=${medianKb.toFixed(2).padStart(8)} KB/frame  ` +
          `budget=${MEASURE_ONLY ? 'MEASURE-ONLY' : `${budgetKb.toFixed(1)} KB`.padStart(10)}  ` +
          `took=${(elapsed / 1000).toFixed(1).padStart(5)}s  [${ENV}]  windows=[${samplesKb.map(kb => kb.toFixed(1)).join(', ')}]`,
      );

      if (MEASURE_ONLY) {
        console.warn(`[alloc] EXOJS_ALLOC_MEASURE=1 — '${archetype.id}' was measured but NOT gated.`);

        return;
      }

      // Surface the environment + numbers on failure too (the vitest config's
      // `valid-expect` rule forbids expect()'s message argument, so log it here).
      if (medianBytes >= budget) {
        console.error(
          `[alloc] BUDGET EXCEEDED — ${archetype.id}: median ${medianKb.toFixed(1)} KB/frame >= budget ${budgetKb.toFixed(1)} KB (${ENV}). ` +
            `If deliberate, re-measure and update BASELINE_KB in allocation.test.ts; otherwise a real allocation regression landed.`,
        );
      }

      expect(medianBytes).toBeLessThan(budget);
    }, 120000);
  }
});
