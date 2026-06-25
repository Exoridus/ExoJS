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
 * the engine look allocation-free when it was not). The narrow/broad-phase
 * scratch reuse roughly halves per-step allocation (~1560 → ~810 KB/step); the
 * remainder is dominated by the contact solver and ContactGraph and is tracked
 * as a follow-up (W4 spec backlog). The gate is a regression guard for the
 * reuse win, not a zero-allocation assertion.
 */

const FRAME = 1 / 60;

/** A wide field of `columns` independent `rows`-high box stacks on a static floor. */
const buildField = (columns: number, rows: number): { world: PhysicsWorld; bodies: PhysicsBody[] } => {
  const world = new PhysicsWorld({ gravity: { x: 0, y: 1000 } });
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

    // P-1 — steady-state allocation rate via the sampling profiler. The scene is
    // already settled (every contact persistent, no begin/end events allocate in
    // the window), so the sampler measures only the per-step narrow/broad-phase
    // and solver work.
    const alloc = await measureAllocationRate(() => world.step(FRAME), { iterations: 200 });
    const bytesPerStep = alloc.bytesPerIteration;

    console.log(`[P-2] ${msPerStep.toFixed(3)} ms/step · 1,000 bodies (${(1000 / msPerStep).toFixed(0)} body-steps/ms · ${(16.67 / msPerStep).toFixed(0)}× headroom at 60fps)`);
    console.log(`[P-1] ${(bytesPerStep / 1024).toFixed(2)} KB/step allocation (sampling profiler)`);

    // Sanity: nothing exploded.
    for (const body of bodies) {
      expect(Number.isFinite(body.x)).toBe(true);
      expect(Number.isFinite(body.y)).toBe(true);
    }

    // Catastrophic-regression guard only (P-2 is recorded, not tightly enforced).
    expect(msPerStep).toBeLessThan(100);

    // Regression guard for the scratch-reuse win: the sampling profiler measures
    // ~810 KB/step after reuse vs ~1560 KB/step before (narrow/broad-phase
    // pooling roughly halves per-step allocation). The remaining ~810 KB is
    // dominated by the contact solver (_solveNormalBlock) and ContactGraph.update
    // — outside this slice's scope (see the W4 spec backlog). The threshold sits
    // between the two rates, so losing the reuse trips the gate.
    expect(bytesPerStep).toBeLessThan(1_100 * 1024);
  });
});
