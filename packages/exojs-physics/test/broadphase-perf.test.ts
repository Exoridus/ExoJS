import { describe, expect, it } from 'vitest';

import { AabbTreeBroadPhase } from '../src/broadphase/AabbTreeBroadPhase';
import type { CandidatePair } from '../src/broadphase/BroadPhase';
import type { Collider } from '../src/Collider';
import { BoxShape, PhysicsWorld } from '../src/index';
import { colliderAt } from './support';

/**
 * Loose sanity gate for the high-N envelope this broad phase targets (tens of
 * thousands of colliders) — a generous wall-clock ceiling only, not a tight
 * regression gate (machine-dependent, same posture as perf.test.ts). Catches
 * a catastrophic algorithmic regression (e.g. an accidental O(n^2) creeping
 * back in), not meant to track exact timings.
 */
describe('AabbTreeBroadPhase high-N performance sanity', () => {
  it('handles 20,000 sparse colliders with small per-step jitter within a generous time budget', () => {
    const world = new PhysicsWorld();
    const colliders: Collider[] = [];
    const cols = 200;

    for (let i = 0; i < 20_000; i++) {
      const x = (i % cols) * 30;
      const y = Math.floor(i / cols) * 30;
      colliders.push(colliderAt(world, new BoxShape(10, 10), { x, y }, 0, 'dynamic'));
    }

    const broadPhase = new AabbTreeBroadPhase();
    const out: CandidatePair[] = [];

    // Prime the tree (first call always reinserts every collider).
    broadPhase.computePairs(world.colliders, out);

    // Steady state: jitter a small fraction of colliders per step, well
    // within the margin most of the time — the regime the fat-AABB
    // coherence is meant to exploit.
    const steps = 60;
    const start = performance.now();

    for (let step = 0; step < steps; step++) {
      for (let i = step; i < colliders.length; i += 500) {
        const c = colliders[i]!;
        c.body.setTransform({ x: c.body.x + 1, y: c.body.y });
      }

      broadPhase.computePairs(world.colliders, out);
    }

    const msPerStep = (performance.now() - start) / steps;

    console.log(`${msPerStep.toFixed(3)} ms/step · 20,000 colliders, ~40 moved/step`);

    // Catastrophic-regression guard only.
    expect(msPerStep).toBeLessThan(200);
  }, 30_000);

  it("handles a dense horizontal cluster (SweepAndPrune's known-bad case) without quadratic blowup", () => {
    const world = new PhysicsWorld();
    const colliders: Collider[] = [];

    // 2,000 overlapping boxes on one line — sort-and-sweep degrades toward
    // O(n^2) here; the tree's cost is dominated by insertion, not this shape.
    for (let i = 0; i < 2000; i++) {
      colliders.push(colliderAt(world, new BoxShape(20, 20), { x: i * 2, y: 0 }, 0, 'static'));
    }

    const broadPhase = new AabbTreeBroadPhase();
    const out: CandidatePair[] = [];

    const start = performance.now();
    broadPhase.computePairs(world.colliders, out);
    const ms = performance.now() - start;

    console.log(`${ms.toFixed(1)} ms · 2,000-collider dense horizontal cluster, ${out.length} candidate pairs`);

    expect(ms).toBeLessThan(2000);
  });
});
