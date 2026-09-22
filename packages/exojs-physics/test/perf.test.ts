import { describe, expect, it } from 'vitest';

import { measureAllocationRate } from './allocationSampler';
import { buildField, FRAME, stepTimes } from './fields';

/**
 * Performance gates: steady-state allocation and 1,000-body step time. The
 * 1,000-body scene is a wide field of 200 independent 5-box columns settled on
 * a static floor - ~1,000 dynamic bodies generating ~1,000 persistent contacts
 * plus the broad-phase load of 1,000 AABBs.
 *
 * Step time is **recorded** on the reference machine, not enforced as a
 * tight CI threshold (machine-dependent) - only a generous catastrophic-
 * regression guard is asserted. Allocation is measured with V8's
 * allocation sampling profiler (see allocationSampler.ts - a heapUsed delta
 * cannot see the short-lived per-step garbage; it previously read ~0 and made
 * the engine look allocation-free when it was not). Scratch reuse plus
 * allocation-free ContactGraph iterators and in-place sorts bring the steady-
 * state rate ~1560 → ~810 → ~484 KB/step. The remainder is V8 double-boxing in
 * the scalar float hot loops (solver block LCP, narrow-phase clip - both verified
 * allocation-free), removable only by an invasive typed-array rewrite (post-1.0).
 */

describe('physics dynamics performance', () => {
  it('1,000-body settled field: step time + steady-state allocation', async () => {
    const { world, bodies } = buildField(200, 5);

    expect(bodies.length).toBe(1000);

    // Settle to steady state (warm-start active, contacts persistent).
    for (let i = 0; i < 240; i++) {
      world.step(FRAME);
    }

    // Steady-state step time.
    const msPerStep = stepTimes(world, 180);

    console.log(
      `${msPerStep.toFixed(3)} ms/step · 1,000 bodies (${(1000 / msPerStep).toFixed(0)} body-steps/ms · ${(16.67 / msPerStep).toFixed(0)}× headroom at 60fps)`,
    );

    // Sanity: nothing exploded.
    for (const body of bodies) {
      expect(Number.isFinite(body.x)).toBe(true);
      expect(Number.isFinite(body.y)).toBe(true);
    }

    // Catastrophic-regression guard only (step time is recorded, not tightly enforced).
    expect(msPerStep).toBeLessThan(100);

    // Steady-state allocation rate via the sampling profiler. The scene is
    // already settled (every contact persistent, no begin/end events allocate in
    // the window), so the sampler measures only the per-step narrow/broad-phase
    // and solver work.
    //
    // Skipped entirely under istanbul coverage: it instruments the physics package
    // source, which both inflates the per-step allocation ~7× (measured ~5.8 MB vs
    // ~0.8 MB - the absolute byte gate is meaningless) and slows the 200-iteration
    // sampling run past the test timeout. The sharp gate runs in the normal
    // `pnpm test` run + `verify:ci`. (Detection: istanbul prefixes every function
    // with a `cov_...()` prologue; globalThis.__coverage__ is not yet populated at
    // test time. The render-perf gate needs no guard - its src resolves via
    // #*-subpath imports istanbul leaves alone.)
    if (world.step.toString().includes('cov_')) {
      console.log('allocation gate skipped under coverage (instrumentation inflates + slows the measurement)');

      return;
    }

    const alloc = await measureAllocationRate(() => world.step(FRAME), { iterations: 200 });
    const bytesPerStep = alloc.bytesPerIteration;

    console.log(`${(bytesPerStep / 1024).toFixed(2)} KB/step allocation (sampling profiler)`);

    // Sharp gate. The step constructs no per-step objects of its own: the
    // ContactGraph iterators and the broad-phase/contact sorts reuse their
    // storage (forEach with a bound method instead of entry-tuple destructuring,
    // an in-place heap sort instead of Array.prototype.sort's temp buffer), and
    // constraints, manifolds and contact records are pooled.
    //
    // What remains is V8 boxing a double that crosses a call the optimiser
    // declined to inline. That is not misattribution and it is not fixed
    // wholesale: whether a given call is inlined depends on the shape of the
    // caller, so the same scene can pay it in one solver path and not in another.
    // The paths where it was measured apply their results in place instead.
    // Removing the rest means a typed-array solver rewrite (post-1.0 follow-up).
    //
    // Measured ~117 KB/step for this scene. The gate sits at 250 KB: enough
    // headroom for cross-machine inlining variance, tight enough that
    // reintroducing per-step garbage on the scale this scene used to carry
    // (~484 KB/step) trips it.
    expect(bytesPerStep).toBeLessThan(250 * 1024);
  });
});
