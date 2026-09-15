/**
 * Sleeping gate: a settled field must skip the work its sleeping bodies would
 * otherwise cost.
 *
 * Split out of the main performance suite because this is the one assertion
 * here that reads WALL-CLOCK time. Wall-clock is not merely machine-dependent,
 * it is load-dependent: run alongside the rest of the test suite, the light
 * sleeping phase loses proportionally more to scheduling gaps than the heavy
 * awake phase does, the ratio collapses (measured 3.4x alone against 1.8x under
 * the parallel suite) and the gate fails without anything having regressed.
 *
 * So it runs in its own project, invoked separately after the parallel suite
 * rather than inside it. Keep it that way: the assertion is only meaningful
 * when this process has the machine to itself.
 *
 * The behavioural half of the claim - that a settled field falls asleep at all -
 * carries no timing and is covered by `sleeping.test.ts` and
 * `sleep-penetration.test.ts`, which stay in the main suite and catch a
 * regression in the sleep bookkeeping regardless of load. What is left here is
 * the part only a clock can show: that the solver skips the sleepers' work
 * rather than merely flagging them.
 */
import { describe, expect, it } from 'vitest';

import { buildChains, buildField, FRAME, settle, stepTimes } from './fields';

describe('physics sleeping performance', () => {
  it('5,000-mostly-sleeping field: sleeping sharply cuts step time', () => {
    // Baseline: the identical field with sleeping disabled stays fully active.
    const awake = buildField(1000, 5, { enableSleeping: false });

    // Skipped entirely under istanbul coverage: instrumentation inflates the
    // per-step cost enough (see the identical `cov_` guard above) that the full
    // 840-step awake+sleeping budget across two 5,000-body fields blows even the
    // 60s timeout below. The sharp gate runs in the normal `pnpm test` run +
    // `verify:ci`.
    if (awake.world.step.toString().includes('cov_')) {
      console.log('sleeping-vs-awake perf gate skipped under coverage (instrumentation slows the measurement past the timeout)');

      return;
    }

    for (let i = 0; i < 240; i++) {
      awake.world.step(FRAME);
    }

    const awakeMs = stepTimes(awake.world, 120);

    // Sleeping on (default): let the field settle and nap.
    const sleeping = buildField(1000, 5, { enableSleeping: true });

    for (let i = 0; i < 360; i++) {
      sleeping.world.step(FRAME);
    }

    const sleptCount = sleeping.bodies.filter(body => body.isSleeping).length;
    const sleepingMs = stepTimes(sleeping.world, 120);

    expect(sleeping.bodies.length).toBe(5000);
    console.log(
      `awake ${awakeMs.toFixed(3)} ms/step vs sleeping ${sleepingMs.toFixed(3)} ms/step · ${sleptCount}/5000 asleep (${(awakeMs / sleepingMs).toFixed(1)}× faster)`,
    );

    // The vast majority of a settled field naps, and skipping their integration
    // and constraint solve sharply cuts the per-step cost (measured ~3.4× faster
    // on the reference machine - the remainder is detection, which still runs).
    // The ratio removes the machine, not the load: both arms run here, so a
    // slower machine cancels out, but concurrent work does not - it costs the
    // light sleeping arm proportionally more than the heavy awake one. Hence
    // the dedicated project; the 2x gate against a measured ~3.4x leaves
    // headroom for inlining variance across machines, not for a busy one.
    expect(sleptCount).toBeGreaterThan(4500);
    expect(sleepingMs).toBeLessThan(awakeMs * 0.5);
  }, 60_000);

  it('2,400-link sleeping joint field: a sleeping joint costs no per-sub-step work', () => {
    // A jointed scene used to keep paying for its sleepers even though every
    // joint and every body bailed out immediately: twelve passes over all the
    // joints per step plus eight over all the bodies, an island union per joint,
    // and a broad-phase re-sync per collider. Measured as a ratio against the
    // identical scene held awake, that put the sleeping arm at ~1/4 of the awake
    // cost; skipping the work outright puts it past 1/20.
    const awake = buildChains(300, 8, { enableSleeping: false });

    if (awake.world.step.toString().includes('cov_')) {
      console.log('sleeping-joint perf gate skipped under coverage (instrumentation slows the measurement past the timeout)');

      return;
    }

    for (let i = 0; i < 60; i++) {
      awake.world.step(FRAME);
    }

    const awakeMs = stepTimes(awake.world, 120);
    const sleeping = buildChains(300, 8);
    const settleSteps = settle(sleeping.world, 600);
    const sleepingMs = stepTimes(sleeping.world, 120);

    console.log(
      `2,400 links: awake ${awakeMs.toFixed(3)} ms/step vs sleeping ${sleepingMs.toFixed(3)} ms/step after ${settleSteps} settle steps (${(awakeMs / sleepingMs).toFixed(1)}× faster)`,
    );

    expect(sleeping.links.length).toBe(2400);
    expect(sleeping.links.every(body => body.isSleeping)).toBe(true);

    // The enforced bound is a fraction of the awake arm rather than a millisecond
    // figure, for the reason the file opens with: both arms run on whatever
    // machine this is, so the machine cancels and only the skipped work remains.
    // 8× sits safely above the fixed per-step cost that is left (measured ~20×)
    // and well below the ~4× the unskipped version reached.
    expect(sleepingMs).toBeLessThan(awakeMs / 8);
  }, 60_000);
});
