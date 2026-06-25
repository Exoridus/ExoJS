 
import { describe, expect, it } from 'vitest';

import { measureFrameAllocation } from './allocation';
import { buildSpriteScene, makeTextures } from './fixtures';
import { createWebGl2Harness } from './harness';
import { buildScenarioCatalog } from './scenarios';

/**
 * Render-plan allocation gate (spec 04 §2a). Samples the per-frame allocation
 * RATE (throwaway garbage, not retained heap) on an empty, a static, and a moving
 * reference scene via the V8 allocation sampling profiler (see `allocation.ts`).
 *
 * Unlike the physics perf gate — which diffs `heapUsed` and therefore needs
 * `--expose-gc` to force a clean number — the sampling profiler records at
 * allocation time and counts immediately-dead objects too. It needs no flag, so
 * the budget is always enforced (no `forceGc`-conditional contract here).
 *
 * Budgets are the measured status quo plus headroom; they tighten as 2b–2f land.
 * The static scene's eventual target is ~0 plan garbage/frame (pooling/caching);
 * the empty scene proves the harness/sampler itself adds no per-frame garbage.
 */

// Budgets (bytes/frame), calibrated against the measured status quo via
// `pnpm perf:renderers:alloc`: empty ≈ 0.08 KB, static/moving 1000-sprite ≈ 2 KB
// (10000-sprite ≈ 15 KB confirms the sampler scales with load). ~4× headroom for
// CI/sampler noise; tighten as 2b–2f drive the static scene toward ~0.
const EMPTY_BUDGET = 4 * 1024;
const STATIC_BUDGET = 8 * 1024;
const MOVING_BUDGET = 8 * 1024;

const findScenario = (id: string): ReturnType<typeof buildScenarioCatalog>[number] => {
  const scenario = buildScenarioCatalog('full').find(s => s.id === id);

  if (scenario === undefined) {
    throw new Error(`scenario not found: ${id}`);
  }

  return scenario;
};

const log = (label: string, bytesPerFrame: number): void => {
  console.log(`[alloc] ${label.padEnd(20)} ${(bytesPerFrame / 1024).toFixed(2).padStart(9)} KB/frame`);
};

describe('render-plan allocation gate', () => {
  it('empty scene allocates near-nothing (harness/sampler sanity)', async () => {
    const harness = createWebGl2Harness();
    const { root } = buildSpriteScene({ count: 0, textures: makeTextures(1) });

    const alloc = await measureFrameAllocation(harness, root);
    log('empty', alloc.bytesPerFrame);

    root.destroy();
    harness.destroy();

    expect(alloc.bytesPerFrame).toBeLessThan(EMPTY_BUDGET);
  });

  it('static sprite scene stays within the plan-allocation budget', async () => {
    const harness = createWebGl2Harness();
    const scene = findScenario('sprite/1000/1tex/static').build(harness);

    const alloc = await measureFrameAllocation(harness, scene.root, { beforeFrame: scene.beforeFrame });
    log('sprite/1000 static', alloc.bytesPerFrame);

    scene.teardown?.();
    harness.destroy();

    expect(alloc.bytesPerFrame).toBeLessThan(STATIC_BUDGET);
  });

  it('moving sprite scene stays within the (looser) moving budget', async () => {
    const harness = createWebGl2Harness();
    const scene = findScenario('sprite/1000/1tex/moving').build(harness);

    const alloc = await measureFrameAllocation(harness, scene.root, { beforeFrame: scene.beforeFrame });
    log('sprite/1000 moving', alloc.bytesPerFrame);

    scene.teardown?.();
    harness.destroy();

    expect(alloc.bytesPerFrame).toBeLessThan(MOVING_BUDGET);
  });
});
