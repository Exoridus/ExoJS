import { bench, describe } from 'vitest';

import type { RenderingContext } from '../../src/rendering/RenderingContext';
import { RenderPass } from '../../src/rendering/RenderPass';
import { RenderPipeline } from '../../src/rendering/RenderPipeline';

// Pure orchestration overhead: a no-op pass isolates the per-frame loop cost
// (enabled check, reentrancy guard, try/finally) from any GPU work. The claim
// under test is that RenderPipeline.execute adds negligible overhead over a
// hand-rolled imperative loop. (CPU-only; very noisy — sub-30% deltas are noise.)
const context = {} as RenderingContext;

class NoopPass extends RenderPass {
  public override execute(_context: RenderingContext): void {
    // no-op
  }
}

const PASS_COUNT = 20;

describe('RenderPipeline orchestration overhead', () => {
  const passes = Array.from({ length: PASS_COUNT }, () => new NoopPass());
  const pipeline = new RenderPipeline();
  for (const pass of passes) {
    pipeline.addPass(pass);
  }

  // Snapshot of the same passes for a bare-loop baseline (execute ignores ownership).
  const baseline = [...pipeline];

  bench('pipeline.execute (20 passes)', () => {
    pipeline.execute(context);
  });

  bench('imperative loop baseline (20 passes)', () => {
    for (const pass of baseline) {
      if (pass.enabled) {
        pass.execute(context);
      }
    }
  });
});
