import { describe, expect, it } from 'vitest';

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
 * ── Methodology ─────────────────────────────────────────────────
 * The sampler is a STATISTICAL profiler (Poisson, one sample per 512 B), so a
 * single run scatters ±few-percent frame-to-frame. The gate therefore takes the
 * MEDIAN of {@link WINDOWS} independent sampling windows (each its own fresh
 * harness + profiler session) and asserts the median against
 * `documented-baseline-median × tolerance`. The median is immune to the
 * occasional high outlier — see the `windows=[…]` log line, where one window
 * routinely lands several percent high while the median sits within ~1% run to
 * run.
 *
 * ── Reading the numbers ──────────────────────────────────────────
 * Every gate logs a `[alloc]` line with the live median, the budget, the
 * environment, and the raw per-window samples. To re-measure, run
 *
 *   npx vitest run --project=rendering-perf test/perf/rendering/allocation.test.ts --disableConsoleIntercept
 *
 * and read the medians off those lines. Update {@link BASELINE_KB} only when a
 * slice DELIBERATELY changes allocation, and record the reason next to the
 * number the way the entries below do.
 *
 * The standalone `pnpm perf:renderers:alloc` launcher measures the same scenes
 * the same way and is source-accurate too (it passes `--conditions=@codexo/source`,
 * so `#*` resolves to `src`, not a `dist` build). It reports ONE window per
 * scene rather than a median, and it additionally covers the nine-slice /
 * repeating / tilemap families and the 1M reference stage — use it for a broad
 * look, and this gate for the budgeted, reproducible numbers.
 */

/** Independent sampling windows the median is taken over (≥5). */
const WINDOWS = 5;

/**
 * Below this per-frame rate the sampler's relative noise dominates: a 2 KB/frame
 * scene collects ~4 samples per frame at the 512 B interval, against ~1700 for
 * `filtered/100`, so the same absolute Poisson jitter is a far larger fraction
 * of the total. Scenes under the floor therefore get {@link TOLERANCE_SMALL}.
 */
const NOISE_FLOOR_KB = 50;

/**
 * Budget band for scenes above {@link NOISE_FLOOR_KB}. Measured pass-to-pass
 * median spread on those scenes is ≤0.4% (see the table on {@link BASELINE_KB}),
 * so nearly the whole 15% is headroom for cross-machine drift — historically up
 * to ~8% between this dev box (Windows) and the Linux CI runner on the mesh
 * scene — and a real ≥15% allocation regression still fails the gate.
 */
const TOLERANCE_LARGE = 1.15;

/**
 * Budget band for scenes below {@link NOISE_FLOOR_KB}. Wider because their
 * relative noise is up to 4.1% pass-to-pass rather than ~0.4%, and because a genuine
 * regression in a near-zero scene is never a few percent: these scenes are the
 * fully-retained steady state, where any new per-node or per-scope allocation
 * lands as a MULTIPLE of the baseline (one extra small object per sprite in
 * `sprite/1000 static` is +40 KB/frame against a 3.5 KB baseline — a 10x
 * overshoot). A tighter band here would buy no detection and only flake.
 */
const TOLERANCE_SMALL = 1.3;

/**
 * Documented baseline MEDIANS in KB/frame — the medians THIS gate produces, in
 * THIS archetype order, measured against `src` on Node v24.14.1 (win32/x64) on
 * 2026-08-15 as the median of three independent 5-window passes.
 *
 * Measure them from the gate, not from an isolated micro-bench or from the
 * standalone launcher: in-suite JIT tier state depends on which scenes ran
 * before, so both the ORDER of {@link ALLOCATION_ARCHETYPES} and each
 * archetype's warm-up are part of the measurement. Changing either invalidates
 * the table.
 *
 * Pass-to-pass median spread across those three passes (this is the number the
 * tolerance has to absorb, not the within-pass window spread):
 *
 *   empty                            2.01 –   2.07   3.0%
 *   sprite/1000 static               3.42 –   3.53   3.2%
 *   sprite/1000 moving             210.65 – 211.47   0.4%
 *   sprite/10000 transform-only 1%  24.25 –  24.49   1.0%
 *   nested/1000 d4                   1.95 –   2.03   4.1%
 *   deep-hierarchy/1000 d16 1%       3.81 –   3.95   3.7%
 *   mesh/1000                      574.24 – 575.20   0.17%
 *   filtered/100                   792.94 – 793.49   0.07%
 *   blend/1000 plateau64             5.21 –   5.27   1.2%
 *   blend/1000 alternating         235.33 – 235.75   0.18%
 *
 * ── Ratchet history ─────────────────────────────────────────────
 * 2026-08-15: whole table re-measured, every budget moved DOWN hard. The
 * previous baselines (static 248, nested 363, moving 277, mesh 748, filtered
 * 823) predated the retained render path — `static` and `nested` had since
 * fallen to ~3.5 and ~2.0 KB/frame, so those two gates carried 82x and 205x
 * headroom and could not have caught anything at all; `moving`/`mesh` were
 * ~1.5x loose and `filtered` ~1.1x. Five archetypes were added in the same
 * pass (transform-only, deep-hierarchy, the two blend variants, and — measured
 * but NOT gated — scrolling-world; see `ALLOCATION_REPORT_ONLY`).
 *
 * `filtered/100` also reads ~793 here against ~869 under the previous catalog.
 * That is not a code change: the scene is byte-for-byte the same, and the shift
 * is the in-suite JIT ordering the note above warns about (two more archetypes
 * now run before it). It is the reason this table must be re-measured whole
 * rather than row by row.
 */
const BASELINE_KB: Readonly<Record<string, number>> = {
  empty: 2.06,
  'sprite/1000 static': 3.51,
  'sprite/1000 moving': 211.21,
  'sprite/10000 transform-only 1%': 24.35,
  'nested/1000 d4': 1.98,
  'deep-hierarchy/1000 d16 1%': 3.83,
  'mesh/1000': 574.69,
  'filtered/100': 793.42,
  'blend/1000 plateau64': 5.21,
  'blend/1000 alternating': 235.7,
};

/**
 * The `empty` scene is a harness/sampler FLOOR sanity, not a ratcheted budget:
 * its true value (~2 KB) is near zero and noise-dominated, so a percentage band
 * is meaningless. A fixed, roomy floor catches a gross regression (a real
 * allocation would be orders larger) without flaking on ±1 KB jitter.
 */
const EMPTY_FLOOR_BYTES = 8 * 1024;

const ENV = `Node ${process.version} ${process.platform}/${process.arch}`;

const median = (values: readonly number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/**
 * Re-baselining mode: measure and log every archetype but assert nothing, so a
 * fresh table can be read off one run instead of bisecting failures. Opt-in via
 * `EXOJS_ALLOC_MEASURE=1` only — never set in CI, and every run says loudly
 * that it gated nothing.
 */
const MEASURE_ONLY = process.env['EXOJS_ALLOC_MEASURE'] === '1';

/** Budget in bytes/frame for an archetype, banded by whether its rate clears the noise floor. */
const budgetBytesFor = (id: string): number => {
  if (id === 'empty') {
    return EMPTY_FLOOR_BYTES;
  }

  const baselineKb = BASELINE_KB[id];

  if (baselineKb === undefined || baselineKb <= 0) {
    throw new Error(`no allocation baseline recorded for archetype '${id}' — re-measure with EXOJS_ALLOC_MEASURE=1 and add it to BASELINE_KB`);
  }

  return baselineKb * (baselineKb < NOISE_FLOOR_KB ? TOLERANCE_SMALL : TOLERANCE_LARGE) * 1024;
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
  it('sampler counts dead garbage (guards the GC-inclusion flags)', async () => {
    const harness = createWebGl2Harness();
    const { root } = buildSpriteScene({ count: 0, textures: makeTextures(1) });

    // JSON.parse is opaque to V8's optimizer — it cannot scalar-replace or
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

    // 1000 small objects ≈ 32–56 B each. If the sampler discarded GC'd garbage
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
