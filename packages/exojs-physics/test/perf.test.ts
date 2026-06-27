import { describe, expect, it } from 'vitest';

import { BoxShape, PhysicsWorld } from '../src/index';
import { PhysicsBody } from '../src/PhysicsBody';
import { measureAllocationRate } from './allocationSampler';

/**
 * Phase-2B performance gates (spec `04` §3): P-1 steady-state allocation and P-2
 * 1,000-body step time. The 1,000-body scene is a wide field of 200 independent
 * 5-box columns settled on a static floor — ~1,000 dynamic bodies generating
 * ~1,000 persistent contacts plus the broad-phase load of 1,000 AABBs.
 *
 * P-2 (step time) is **recorded** on the reference machine, not enforced as a
 * tight CI threshold (machine-dependent) — only a generous catastrophic-
 * regression guard is asserted. P-1 (allocation) is measured with V8's
 * allocation sampling profiler (see allocationSampler.ts — a heapUsed delta
 * cannot see the short-lived per-step garbage; it previously read ~0 and made
 * the engine look allocation-free when it was not). Scratch reuse (W4) plus the
 * W7 allocation-free ContactGraph iterators and in-place sorts bring the steady-
 * state rate ~1560 → ~810 → ~484 KB/step. The remainder is V8 double-boxing in
 * the scalar float hot loops (solver block LCP, narrow-phase clip — both verified
 * allocation-free), removable only by an invasive typed-array rewrite (post-1.0).
 */

const FRAME = 1 / 60;

/** A wide field of `columns` independent `rows`-high box stacks on a static floor. */
const buildField = (columns: number, rows: number, worldOptions: { enableSleeping?: boolean } = {}): { world: PhysicsWorld; bodies: PhysicsBody[] } => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 }, ...worldOptions });
  const size = 16;
  const spacing = 20;
  const floorTop = 1000;
  const width = columns * spacing + 200;

  world.add(
    new PhysicsBody({ type: 'static', position: { x: width / 2, y: floorTop + 20 }, colliders: [{ shape: new BoxShape(width, 40), friction: 0.5 }] }),
  );

  const bodies: PhysicsBody[] = [];

  for (let c = 0; c < columns; c++) {
    const x = 100 + c * spacing;

    for (let r = 0; r < rows; r++) {
      const body = world.add(
        new PhysicsBody({
          type: 'dynamic',
          position: { x, y: floorTop - size / 2 - 1 - r * size },
          colliders: [{ shape: new BoxShape(size, size), density: 1, friction: 0.5 }],
        }),
      );

      bodies.push(body);
    }
  }

  return { world, bodies };
};

const stepTimes = (world: PhysicsWorld, steps: number): number => {
  const start = performance.now();

  for (let i = 0; i < steps; i++) {
    world.step(FRAME);
  }

  return (performance.now() - start) / steps;
};

describe('physics dynamics performance (P-1 / P-2)', () => {
  it('1,000-body settled field: step time + steady-state allocation', async () => {
    const { world, bodies } = buildField(200, 5);

    expect(bodies.length).toBe(1000);

    // Settle to steady state (warm-start active, contacts persistent).
    for (let i = 0; i < 240; i++) {
      world.step(FRAME);
    }

    // P-2 — steady-state step time.
    const msPerStep = stepTimes(world, 180);

    console.log(`[P-2] ${msPerStep.toFixed(3)} ms/step · 1,000 bodies (${(1000 / msPerStep).toFixed(0)} body-steps/ms · ${(16.67 / msPerStep).toFixed(0)}× headroom at 60fps)`);

    // Sanity: nothing exploded.
    for (const body of bodies) {
      expect(Number.isFinite(body.x)).toBe(true);
      expect(Number.isFinite(body.y)).toBe(true);
    }

    // Catastrophic-regression guard only (P-2 is recorded, not tightly enforced).
    expect(msPerStep).toBeLessThan(100);

    // P-1 — steady-state allocation rate via the sampling profiler. The scene is
    // already settled (every contact persistent, no begin/end events allocate in
    // the window), so the sampler measures only the per-step narrow/broad-phase
    // and solver work.
    //
    // Skipped entirely under istanbul coverage: it instruments the physics package
    // source, which both inflates the per-step allocation ~7× (measured ~5.8 MB vs
    // ~0.8 MB — the absolute byte gate is meaningless) and slows the 200-iteration
    // sampling run past the test timeout. The sharp gate runs in the normal
    // `pnpm test` run + `verify:ci`. (Detection: istanbul prefixes every function
    // with a `cov_…()` prologue; globalThis.__coverage__ is not yet populated at
    // test time. The render-perf gate needs no guard — its src resolves via
    // #*-subpath imports istanbul leaves alone.)
    if (world.step.toString().includes('cov_')) {
      console.log('[P-1] allocation gate skipped under coverage (instrumentation inflates + slows the measurement)');

      return;
    }

    const alloc = await measureAllocationRate(() => world.step(FRAME), { iterations: 200 });
    const bytesPerStep = alloc.bytesPerIteration;

    console.log(`[P-1] ${(bytesPerStep / 1024).toFixed(2)} KB/step allocation (sampling profiler)`);

    // Sharp gate (W7): the ContactGraph iterators + broad-phase/contact sorts are
    // now allocation-free (forEach with a bound method instead of entry-tuple
    // destructuring; an in-place heap sort instead of Array.prototype.sort's temp
    // buffer), dropping the steady-state rate ~810 → ~484 KB/step. The remainder
    // is not poolable garbage: it is V8 double-boxing + sampler misattribution in
    // the scalar float hot loops (the solver block LCP and narrow-phase clip are
    // verified allocation-free — see _solveNormalBlock/collide), removable only by
    // an invasive typed-array solver rewrite (post-1.0 follow-up). Measured ~484
    // KB/step (±1, very stable); the gate sits at 600 KB — tight enough that
    // reverting the W7 reuse (≈810) trips it, with headroom for cross-machine V8
    // boxing variance.
    expect(bytesPerStep).toBeLessThan(600 * 1024);
  });

  it('5,000-mostly-sleeping field: sleeping sharply cuts step time (P-3)', () => {
    // Baseline: the identical field with sleeping disabled stays fully active.
    const awake = buildField(1000, 5, { enableSleeping: false });

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
      `[P-3] awake ${awakeMs.toFixed(3)} ms/step vs sleeping ${sleepingMs.toFixed(3)} ms/step · ${sleptCount}/5000 asleep (${(awakeMs / sleepingMs).toFixed(1)}× faster)`,
    );

    // The vast majority of a settled field naps, and skipping their integration
    // and constraint solve sharply cuts the per-step cost (measured ~3.4× faster
    // on the reference machine — the remainder is detection, which still runs).
    // The gate is a relative ratio (same machine, sleeping vs awake), so it is
    // machine-independent; ≥2× leaves headroom for variance.
    expect(sleptCount).toBeGreaterThan(4500);
    expect(sleepingMs).toBeLessThan(awakeMs * 0.5);
  }, 60_000);
});
